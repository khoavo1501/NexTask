import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
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

async function setupTask() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Edit' })
    .expect(201);
  const boardId = board.body.data._id as string;
  const task = await owner.agent
    .post(`/api/v1/boards/${boardId}/tasks`)
    .send({ columnId: 'todo', title: 'Gốc', priority: 'low' })
    .expect(201);
  return {
    owner,
    boardId,
    task: task.body.data as { _id: string; version: number; order: string },
  };
}

describe('edit task', () => {
  it('sửa field và tăng version', async () => {
    const { owner, boardId, task } = await setupTask();
    const response = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        title: 'Đã sửa',
        description: '',
        priority: 'urgent',
        labels: ['bug', 'bug'],
        expectedVersion: task.version,
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      title: 'Đã sửa',
      description: '',
      priority: 'urgent',
      labels: ['bug'],
      version: task.version + 1,
    });
  });

  it('stale version trả 409 và không ghi', async () => {
    const { owner, boardId, task } = await setupTask();
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ title: 'Lần 1', expectedVersion: task.version })
      .expect(200);

    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ title: 'Lần 2', expectedVersion: task.version })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('không cho đổi cột/order qua body và validate assignee', async () => {
    const { owner, boardId, task } = await setupTask();
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');

    const response = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        title: 'Vẫn cột cũ',
        columnId: 'done',
        order: 'zzz',
        expectedVersion: task.version,
      })
      .expect(200);
    expect(response.body.data.columnId).toBe('todo');
    expect(response.body.data.order).toBe(task.order);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ assigneeId: stranger.user._id, expectedVersion: response.body.data.version })
      .expect(422);
  });

  it('clear assignee/dueDate bằng null', async () => {
    const { owner, boardId, task } = await setupTask();
    const first = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        assigneeId: owner.user._id,
        dueDate: '2026-12-01T00:00:00.000Z',
        expectedVersion: task.version,
      })
      .expect(200);

    const cleared = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        assigneeId: null,
        dueDate: null,
        expectedVersion: first.body.data.version,
      })
      .expect(200);

    expect(cleared.body.data.assigneeId).toBeNull();
    expect(cleared.body.data.dueDate).toBeNull();
  });
});
