import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signSessionToken } from '../src/modules/auth/jwt.js';
import { createRealtimeServer, type RealtimeServer } from '../src/realtime/realtime.server.js';
import { registerAgent } from './helpers/auth.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
const jwtSecret = 'local-test-jwt-secret-at-least-32-bytes-long';
let connection: Awaited<ReturnType<typeof connectTestDb>>;
let app: ReturnType<typeof createApp>;
let server: ReturnType<typeof createServer>;
let realtime: RealtimeServer;
let baseUrl: string;

beforeAll(async () => {
  connection = await connectTestDb();
  app = createApp({
    connection,
    expectedReplicaSet: 'rs0',
    version: '0.1.0-test',
    corsOrigin: 'http://localhost:3000',
    logger,
    jwtSecret,
    cookieSecure: false,
    authRateLimitMax: 100,
  });
  server = createServer(app);
  realtime = createRealtimeServer(server, {
    connection,
    jwtSecret,
    corsOrigin: 'http://localhost:3000',
    logger,
    graceMs: 50,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await realtime.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await connection.close();
});

async function connectSocket(userId: string): Promise<Socket> {
  const token = await signSessionToken(userId, { secret: jwtSecret });
  const socket = createClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: `nextask_session=${token}` },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function join(socket: Socket, boardId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    socket.emit('board:join', { boardId }, resolve);
  });
}

function waitEvent(socket: Socket, type: string) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for event')), 5_000);
    const handler = (event: { type: string }) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off('board:event', handler);
      resolve(event as Record<string, unknown>);
    };
    socket.on('board:event', handler);
  });
}

describe('realtime socket', () => {
  it('auth, join, task event và presence', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Realtime' });
    const boardId = board.body.data._id as string;
    const socketA = await connectSocket(owner.user._id);
    const socketB = await connectSocket(owner.user._id);

    expect(await join(socketA, boardId)).toEqual({ ok: true });
    expect(await join(socketB, boardId)).toEqual({ ok: true });
    const eventPromise = waitEvent(socketA, 'task:created');
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Realtime task' })
      .expect(201);
    expect(await eventPromise).toMatchObject({ type: 'task:created' });

    socketA.emit('presence:cursor', { x: 0.5, y: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    socketB.disconnect();
    socketA.disconnect();
  });

  it('không cookie bị từ chối, non-member không join được', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Private' });
    const boardId = board.body.data._id as string;
    const socket = await connectSocket(stranger.user._id);

    expect(await join(socket, boardId)).toEqual({ ok: false, error: 'NOT_FOUND' });
    socket.disconnect();

    const unauthenticated = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      unauthenticated.once('connect', () => reject(new Error('Socket connected without auth')));
      unauthenticated.once('connect_error', () => resolve());
    });
    unauthenticated.close();
  });
});
