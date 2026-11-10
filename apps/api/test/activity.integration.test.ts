import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
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

describe('promote activity', () => {
  it('ghi activity item.promoted trong transaction', async () => {
    const { owner, boardId, item } = await setupNote();
    const before = Date.now();

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(201);

    const activity = await ActivityModel.findOne({ boardId }).exec();
    expect(activity).not.toBeNull();
    expect(activity?.action).toBe('item.promoted');
    expect(activity?.refs.itemId?.toHexString()).toBe(item._id);
    expect(activity?.refs.taskId).toBeTruthy();
    expect(activity?.refs.columnId).toBe('todo');
    expect(activity?.snapshot).toMatchObject({
      taskTitle: 'Ý tưởng lớn',
      columnId: 'todo',
      taskVersionAtPromote: 1,
      itemVersionAtPromote: item.version + 1,
    });
    expect(activity?.undoableUntil?.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(activity?.undoableUntil?.getTime()).toBeLessThan(before + 11 * 60 * 1000);
  });

  it('promote lỗi không tạo activity', async () => {
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

    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
  });

  it('lỗi ghi activity rollback task và item', async () => {
    const { board, actor, item } = await setupNote('Rollback activity');

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
        beforeActivityInsert: async () => {
          throw new Error('activity fault');
        },
      }),
    ).rejects.toThrow('activity fault');

    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
    const saved = await ItemModel.findById(item._id);
    expect(saved?.promotedTaskId).toBeNull();
  });
});
