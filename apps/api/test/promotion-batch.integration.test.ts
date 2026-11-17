import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { promoteBatch } from '../src/modules/items/promotion-batch.service.js';
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

async function setupNotes(count = 3) {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Batch' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: count }, (_, index) => ({
        shapeId: `shape:batch-${index}`,
        type: 'note',
        content: `Batch note ${index}`,
        style: {},
        props: {},
        position: { x: index * 220, y: 20 },
        size: { w: 200, h: 200 },
        rotation: 0,
        tldrawIndex: `a${index + 1}`,
        parentFrameId: null,
        expectedVersion: 0,
      })),
    })
    .expect(200);
  const boardDoc = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!boardDoc || !actor) throw new Error('Board or actor missing');
  return {
    owner,
    boardId,
    board: boardDoc,
    actor,
    items: sync.body.data as Array<{ _id: string; shapeId: string; version: number }>,
  };
}

function batchBody(items: Array<{ _id: string; version: number }>) {
  return {
    columnId: 'todo',
    assignToMe: false,
    items: items.map((item) => ({ itemId: item._id, expectedItemVersion: item.version })),
  };
}

describe('batch promote', () => {
  it('promote nhiều note trong một transaction', async () => {
    const { owner, boardId, items } = await setupNotes(3);
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(batchBody(items.slice(0, 2)))
      .expect(201);

    expect(response.body.data.tasks).toHaveLength(2);
    expect(response.body.data.items[0].promotedTaskId).toBe(response.body.data.tasks[0]._id);
    expect(response.body.data.tasks[0].order < response.body.data.tasks[1].order).toBe(true);
    expect(response.body.data.activities).toHaveLength(2);
    expect(await TaskModel.countDocuments({ boardId })).toBe(2);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('một item đã promote làm abort toàn bộ batch', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: items[0]!.version })
      .expect(201);

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(batchBody(items))
      .expect(409);
    expect(response.body.error.code).toBe('BATCH_PROMOTE_CONFLICT');
    expect(response.body.error.details.errors[0]).toMatchObject({
      itemId: items[0]!._id,
      code: 'ALREADY_PROMOTED',
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
    expect((await ItemModel.findById(items[1]!._id))?.promotedTaskId).toBeNull();
  });

  it('version lệch abort batch', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    const body = batchBody(items);
    body.items[0]!.expectedItemVersion += 1;
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(body)
      .expect(409);
    expect(response.body.error.details.errors[0]).toMatchObject({
      itemId: items[0]!._id,
      code: 'VERSION_CONFLICT',
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(0);
  });

  it('từ chối 101 item và itemId trùng', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    const tooMany = batchBody(
      Array.from({ length: 101 }, (_, index) => ({
        _id: `64b${String(index).padStart(21, '0')}`,
        version: 1,
      })),
    );
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(tooMany)
      .expect(422);

    const duplicate = batchBody([items[0]!, items[0]!]);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(duplicate)
      .expect(422);
  });

  it('hai batch đồng thời cùng item chỉ một thành công', async () => {
    const { owner, boardId, items } = await setupNotes(1);
    const body = batchBody(items);
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/items/promote-batch`).send(body),
      owner.agent.post(`/api/v1/boards/${boardId}/items/promote-batch`).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
  });

  it('fault trước task insert rollback', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeTaskInsert: async () => {
          throw new Error('batch task fault');
        },
      }),
    ).rejects.toThrow('batch task fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
  });

  it('fault trước item update rollback task', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeItemUpdate: async () => {
          throw new Error('batch item fault');
        },
      }),
    ).rejects.toThrow('batch item fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
  });

  it('fault trước activity rollback task và item', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeActivityInsert: async () => {
          throw new Error('batch activity fault');
        },
      }),
    ).rejects.toThrow('batch activity fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
    expect((await ItemModel.findById(items[0]!._id))?.promotedTaskId).toBeNull();
  });
});
