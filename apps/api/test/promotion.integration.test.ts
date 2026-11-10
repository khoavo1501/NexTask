import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { promoteItem } from '../src/modules/items/promotion.service.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
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

async function setupNote(content = 'Ý tưởng lớn') {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;

  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:note1',
          type: 'note',
          content,
          style: { color: 'yellow' },
          props: { color: 'yellow' },
          position: { x: 12, y: 34 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);

  const board = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!board || !actor) throw new Error('Board or actor missing');

  return {
    owner,
    boardId,
    board,
    actor,
    item: sync.body.data[0] as { _id: string; version: number },
  };
}

describe('promote', () => {
  it('tạo task, cập nhật item và origin trong transaction', async () => {
    const { owner, boardId, item } = await setupNote();

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: true, expectedItemVersion: item.version })
      .expect(201);

    expect(response.body.data.task.title).toBe('Ý tưởng lớn');
    expect(response.body.data.task.assigneeId).toBe(owner.user._id);
    expect(response.body.data.task.origin.position).toEqual({ x: 12, y: 34 });
    expect(response.body.data.item.promotedTaskId).toBe(response.body.data.task._id);
  });

  it('promote lần hai trả 409 và không tạo task trùng', async () => {
    const { owner, boardId, item } = await setupNote();

    const first = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(201);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: first.body.data.item.version,
      })
      .expect(409);

    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('hai promote đồng thời chỉ tạo một task', async () => {
    const { owner, boardId, item } = await setupNote('Đồng thời');

    const [first, second] = await Promise.all([
      owner.agent
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version }),
      owner.agent
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('lỗi sau insert task làm rollback toàn bộ', async () => {
    const { board, actor, item } = await setupNote('Rollback');

    await expect(
      promoteItem({
        board,
        itemId: item._id,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          expectedItemVersion: item.version,
        },
        afterTaskInsert: async () => {
          throw new Error('fault injection');
        },
      }),
    ).rejects.toThrow('fault injection');

    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    const saved = await ItemModel.findById(item._id);
    expect(saved?.promotedTaskId).toBeNull();
  });

  it('move task sang Done cập nhật cột', async () => {
    const { owner, boardId, item } = await setupNote('Kéo thẻ');
    const promoted = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(201);
    const taskId = promoted.body.data.task._id as string;

    const moved = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
      .send({
        columnId: 'done',
        beforeTaskId: null,
        expectedVersion: promoted.body.data.task.version,
      })
      .expect(200);

    expect(moved.body.data.columnId).toBe('done');
    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].columnId).toBe('done');
  });
});
