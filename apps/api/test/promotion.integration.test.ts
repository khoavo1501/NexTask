import { Types } from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { promoteItem } from '../src/modules/items/promotion.service.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const ownerId = '000000000000000000000001';
const logger = pino({ level: 'silent' });
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
    demoOwnerId: ownerId,
  });
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

async function setupNote(content = 'Ý tưởng lớn') {
  const board = await request(app).post('/api/v1/boards').send({ name: 'Retro' });
  const boardId = board.body.data._id as string;
  const sync = await request(app)
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
        },
      ],
    })
    .expect(200);

  return { boardId, item: sync.body.data[0] as { _id: string } };
}

describe('promote', () => {
  it('tạo task, cập nhật item và origin trong transaction', async () => {
    const { boardId, item } = await setupNote();

    const response = await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: true })
      .expect(201);

    expect(response.body.data.task.title).toBe('Ý tưởng lớn');
    expect(response.body.data.task.assigneeId).toBe(ownerId);
    expect(response.body.data.task.origin.position).toEqual({ x: 12, y: 34 });
    expect(response.body.data.item.promotedTaskId).toBe(response.body.data.task._id);
  });

  it('promote lần hai trả 409 và không tạo task trùng', async () => {
    const { boardId, item } = await setupNote();

    await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(201);
    await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(409);

    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('hai promote đồng thời chỉ tạo một task', async () => {
    const { boardId, item } = await setupNote('Đồng thời');

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false }),
      request(app)
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('lỗi sau insert task làm rollback toàn bộ', async () => {
    const { boardId, item } = await setupNote('Rollback');
    const boardObjectId = new Types.ObjectId(boardId);

    await expect(
      promoteItem({
        boardId,
        itemId: item._id,
        ownerId: new Types.ObjectId(ownerId),
        request: { columnId: 'todo', assignToMe: false },
        afterTaskInsert: async () => {
          throw new Error('fault injection');
        },
      }),
    ).rejects.toThrow('fault injection');

    expect(await TaskModel.countDocuments({ boardId: boardObjectId })).toBe(0);
    const saved = await ItemModel.findById(item._id);
    expect(saved?.promotedTaskId).toBeNull();
  });

  it('move task sang Done cập nhật cột', async () => {
    const { boardId, item } = await setupNote('Kéo thẻ');
    const promoted = await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(201);
    const taskId = promoted.body.data.task._id as string;

    const moved = await request(app)
      .patch(`/api/v1/boards/${boardId}/tasks/${taskId}`)
      .send({ columnId: 'done' })
      .expect(200);

    expect(moved.body.data.columnId).toBe('done');
    const listed = await request(app).get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].columnId).toBe('done');
  });
});
