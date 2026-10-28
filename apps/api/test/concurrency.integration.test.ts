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

function note(shapeId: string, content: string) {
  return {
    shapeId,
    type: 'note',
    content,
    style: { color: 'yellow' },
    props: { color: 'yellow' },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentFrameId: null,
    expectedVersion: 0,
  };
}

async function setupPromotedTask() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;

  const synced = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({ items: [note('shape:one', 'Task OCC')] })
    .expect(200);

  const promoted = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${synced.body.data[0]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false })
    .expect(201);

  return {
    owner,
    boardId,
    item: synced.body.data[0] as { _id: string; version: number },
    task: promoted.body.data.task as { _id: string; version: number },
  };
}

describe('board rename OCC', () => {
  it('version đúng tăng 1, version cũ trả 409 và không ghi đè', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const renamed = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Retro mới', expectedVersion: board.body.data.version })
      .expect(200);
    expect(renamed.body.data.version).toBe(board.body.data.version + 1);

    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Ghi đè', expectedVersion: board.body.data.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: renamed.body.data.version },
    });

    const current = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
    expect(current.body.data.name).toBe('Retro mới');
  });
});

describe('task move OCC', () => {
  it('version đúng tăng 1, version cũ trả 409', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const moved = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'done', expectedVersion: task.version })
      .expect(200);
    expect(moved.body.data.columnId).toBe('done');
    expect(moved.body.data.version).toBe(task.version + 1);

    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'review', expectedVersion: task.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: moved.body.data.version },
    });

    const saved = await TaskModel.findById(task._id).exec();
    expect(saved?.columnId).toBe('done');
  });

  it('hai move đồng thời với cùng version chỉ một thành công', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const [first, second] = await Promise.all([
      owner.agent
        .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
        .send({ columnId: 'backlog', expectedVersion: task.version }),
      owner.agent
        .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
        .send({ columnId: 'done', expectedVersion: task.version }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const saved = await TaskModel.findById(task._id).exec();
    expect(saved?.version).toBe(task.version + 1);
  });

  it('move cùng cột với version đúng không tăng version', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const moved = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'todo', expectedVersion: task.version })
      .expect(200);

    expect(moved.body.data.columnId).toBe('todo');
    expect(moved.body.data.version).toBe(task.version);
  });
});
