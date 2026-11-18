import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { registerAgent } from './helpers/auth.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
const jwtSecret = 'local-test-jwt-secret-at-least-32-bytes-long';
let connection: Awaited<ReturnType<typeof connectTestDb>>;
let app: ReturnType<typeof createApp>;

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
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

async function setupTasks() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const member = await registerAgent(app, 'member@example.com', 'Member');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Paging' }).expect(201);
  const boardId = board.body.data._id as string;

  await TaskModel.insertMany(
    Array.from({ length: 5 }, (_, index) => ({
      boardId,
      columnId: 'todo',
      order: `a${index}`,
      title: `Task ${index}`,
      description: index < 3 ? `context ${index}` : 'other',
      assigneeId: index === 0 ? member.user._id : null,
      labels: index === 0 ? ['bug'] : [],
      priority: index < 2 ? 'high' : 'low',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: owner.user._id,
    })),
  );

  return { owner, member, boardId };
}

describe('task pagination và text search', () => {
  it('cursor trả đủ 3 trang không duplicate', async () => {
    const { owner, boardId } = await setupTasks();

    const first = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2 })
      .expect(200);
    expect(first.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Task 0',
      'Task 1',
    ]);
    expect(first.body.meta.hasMore).toBe(true);
    expect(typeof first.body.meta.nextCursor).toBe('string');

    const second = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2, cursor: first.body.meta.nextCursor })
      .expect(200);
    expect(second.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Task 2',
      'Task 3',
    ]);

    const third = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2, cursor: second.body.meta.nextCursor })
      .expect(200);
    expect(third.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 4']);
    expect(third.body.meta.hasMore).toBe(false);
    expect(third.body.meta.nextCursor).toBeNull();
  });

  it('cursor kết hợp priority/labels/assignee và q', async () => {
    const { owner, member, boardId } = await setupTasks();

    const high = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'high', limit: 1 })
      .expect(200);
    expect(high.body.data).toHaveLength(1);
    const highNext = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'high', limit: 1, cursor: high.body.meta.nextCursor })
      .expect(200);
    expect(highNext.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 1']);

    const labels = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ labels: 'bug', limit: 1 })
      .expect(200);
    expect(labels.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 0']);
    expect(labels.body.meta.nextCursor).toBeNull();

    const assignee = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ assigneeId: member.user._id, limit: 1 })
      .expect(200);
    expect(assignee.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 0']);

    const search = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'context', limit: 2 })
      .expect(200);
    expect(search.body.data).toHaveLength(2);
    const searchNext = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'context', limit: 2, cursor: search.body.meta.nextCursor })
      .expect(200);
    expect(searchNext.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 2']);
  });

  it('cursor sai trả 422 INVALID_CURSOR', async () => {
    const { owner, boardId } = await setupTasks();

    const invalid = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ cursor: 'not-a-cursor' })
      .expect(422);
    expect(invalid.body.error.code).toBe('INVALID_CURSOR');

    const malformed = Buffer.from('{"columnId":"todo"}').toString('base64url');
    const malformedResponse = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ cursor: malformed })
      .expect(422);
    expect(malformedResponse.body.error.code).toBe('INVALID_CURSOR');
  });

  it('explain q dùng text index', async () => {
    const { boardId } = await setupTasks();
    const explain = await TaskModel.collection
      .find({
        boardId: new Types.ObjectId(boardId),
        lifecycle: 'active',
        $text: { $search: 'context', $language: 'none' },
      })
      .sort({ columnId: 1, order: 1, _id: 1 })
      .explain('executionStats');
    const plan = JSON.stringify(explain);
    expect(plan).toContain('tasks_board_text');
    expect(plan).toContain('TEXT_MATCH');
  });
});
