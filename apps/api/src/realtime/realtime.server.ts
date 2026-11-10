import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { RealtimeEvent } from '@nextask/contracts';
import { presenceCursorSchema, SOCKET_EVENTS } from '@nextask/contracts';
import type { Connection } from 'mongoose';
import { Server, type Socket } from 'socket.io';
import type { Logger } from '../lib/logger.js';
import { findByMember } from '../modules/boards/board.service.js';
import { createBoardWatcher, type BoardWatcher } from './board-watcher.js';
import {
  addParticipant,
  listParticipants,
  removeParticipant,
  updateCursor,
} from './presence.service.js';
import { authenticateSocket, type BoardSocketData } from './socket-auth.js';

export interface RealtimeDependencies {
  connection: Connection;
  jwtSecret: string;
  corsOrigin: string;
  logger: Logger;
  graceMs?: number;
}

export interface RealtimeServer {
  io: Server;
  close(): Promise<void>;
}

export function createRealtimeServer(
  httpServer: HttpServer,
  deps: RealtimeDependencies,
): RealtimeServer {
  const io = new Server(httpServer, {
    cors: { origin: deps.corsOrigin, credentials: true },
  });
  const watchers = new Map<string, BoardWatcher>();
  const room = (boardId: string) => `board:${boardId}`;

  io.use(async (socket, next) => {
    try {
      (socket.data as BoardSocketData).user = await authenticateSocket(
        socket,
        deps.jwtSecret,
      );
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  function watcherFor(boardId: string): BoardWatcher {
    let watcher = watchers.get(boardId);
    if (!watcher) {
      watcher = createBoardWatcher({
        connection: deps.connection,
        boardId,
        logger: deps.logger,
        graceMs: deps.graceMs,
        onEvent: (event) => io.to(room(boardId)).emit(SOCKET_EVENTS.boardEvent, event),
        onResync: (reason) => {
          const event: RealtimeEvent = {
            id: randomUUID(),
            boardId,
            type: 'board:resync',
            version: 0,
            occurredAt: new Date().toISOString(),
            payload: { reason },
          };
          io.to(room(boardId)).emit(SOCKET_EVENTS.boardEvent, event);
        },
      });
      watchers.set(boardId, watcher);
    }
    return watcher;
  }

  async function leaveBoard(socket: Socket): Promise<void> {
    const data = socket.data as BoardSocketData;
    const boardId = data.boardId;
    if (!boardId) return;
    socket.leave(room(boardId));
    removeParticipant(boardId, socket.id);
    watcherFor(boardId).release();
    data.boardId = undefined;
    io.to(room(boardId)).emit(
      SOCKET_EVENTS.presenceList,
      listParticipants(boardId),
    );
  }

  io.on('connection', (socket) => {
    socket.on(
      SOCKET_EVENTS.boardJoin,
      async (
        payload: { boardId?: string },
        ack?: (result: { ok: true } | { ok: false; error: string }) => void,
      ) => {
        const data = socket.data as BoardSocketData;
        const user = data.user;
        const boardId = payload?.boardId;
        if (!user || !boardId) {
          ack?.({ ok: false, error: 'NOT_FOUND' });
          return;
        }
        const access = await findByMember(boardId, user._id);
        if (!access) {
          ack?.({ ok: false, error: 'NOT_FOUND' });
          return;
        }

        await leaveBoard(socket);
        data.boardId = boardId;
        await socket.join(room(boardId));
        await watcherFor(boardId).acquire();
        addParticipant(boardId, socket.id, user);
        io.to(room(boardId)).emit(
          SOCKET_EVENTS.presenceList,
          listParticipants(boardId),
        );
        ack?.({ ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.boardLeave, () => {
      void leaveBoard(socket);
    });

    socket.on(SOCKET_EVENTS.presenceCursor, (payload: unknown) => {
      const data = socket.data as BoardSocketData;
      const boardId = data.boardId;
      if (!boardId) return;
      const parsed = presenceCursorSchema.safeParse(payload);
      if (!parsed.success) return;
      const now = Date.now();
      if (data.lastCursorAt && now - data.lastCursorAt < 33) return;
      data.lastCursorAt = now;
      const participant = updateCursor(boardId, socket.id, parsed.data);
      if (participant) {
        io.to(room(boardId)).emit(SOCKET_EVENTS.presenceCursor, {
          socketId: socket.id,
          userId: participant.userId,
          ...parsed.data,
        });
      }
    });

    socket.on('disconnect', () => {
      void leaveBoard(socket);
    });
  });

  return {
    io,
    async close() {
      await Promise.all([...watchers.values()].map((watcher) => watcher.close()));
      watchers.clear();
      await io.close();
    },
  };
}
