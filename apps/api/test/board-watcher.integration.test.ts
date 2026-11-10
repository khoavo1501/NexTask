import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nextask/contracts';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { createBoardWatcher } from '../src/realtime/board-watcher.js';
import { connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

function waitForEvent(events: RealtimeEvent[], predicate: (event: RealtimeEvent) => boolean) {
  return new Promise<RealtimeEvent>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = events.find(predicate);
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - started > 5_000) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for realtime event'));
      }
    }, 50);
  });
}

async function createTask(boardId: Types.ObjectId) {
  return TaskModel.create({
    boardId,
    columnId: 'todo',
    order: 'a0',
    title: `Task ${new Date().toISOString()}`,
    description: 'test',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: new Types.ObjectId(),
  });
}

describe('board watcher', () => {
  it('phát task event và resume sau khi watcher restart', async () => {
    const board = await BoardModel.create({
      name: 'Watcher',
      ownerId: new Types.ObjectId(),
      members: [{ userId: new Types.ObjectId(), role: 'owner', joinedAt: new Date() }],
      columns: [{ id: 'todo', name: 'To Do', order: 0, isDone: false }],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
    const boardId = board._id.toHexString();
    const events: RealtimeEvent[] = [];
    const resyncs: string[] = [];
    const first = createBoardWatcher({
      connection,
      boardId,
      logger,
      onEvent: (event) => events.push(event),
      onResync: (reason) => resyncs.push(reason),
    });

    await first.acquire();
    const task = await createTask(board._id);
    await waitForEvent(events, (event) => event.type === 'task:created');
    await first.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const second = createBoardWatcher({
      connection,
      boardId,
      logger,
      onEvent: (event) => events.push(event),
      onResync: (reason) => resyncs.push(reason),
    });
    await second.acquire();
    await TaskModel.updateOne(
      { _id: task._id },
      { $set: { columnId: 'done' }, $inc: { version: 1 } },
    );
    await waitForEvent(events, (event) => event.type === 'task:moved');
    expect(resyncs).toEqual([]);
    await second.close();
  });
});
