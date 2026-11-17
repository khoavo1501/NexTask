import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { undoPromote } from '../src/modules/activities/undo.service.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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

async function setupPromoted(content = 'Undo note') {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Undo' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:undo',
          type: 'note',
          content,
          style: {},
          props: {},
          position: { x: 10, y: 20 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const item = sync.body.data[0] as { _id: string; version: number };
  const promoted = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
    .expect(201);
  const activity = await ActivityModel.findOne({ boardId }).exec();
  const boardDoc = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!activity || !boardDoc || !actor) throw new Error('Fixture missing');
  return {
    owner,
    boardId,
    board: boardDoc,
    actor,
    itemId: item._id,
    itemVersion: promoted.body.data.item.version as number,
    taskId: promoted.body.data.task._id as string,
    taskVersion: promoted.body.data.task.version as number,
    activityId: activity._id.toHexString(),
  };
}

describe('undo promote', () => {
  it('undo thành công tạo activity item.promote_undone', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(200);

    expect(response.body.data.task.lifecycle).toBe('demoted');
    expect(response.body.data.item.promotedTaskId).toBeNull();
    expect(response.body.data.activity.action).toBe('item.promote_undone');
    const undone = await ActivityModel.findOne({ action: 'item.promote_undone' }).exec();
    expect(undone?.snapshot).toMatchObject({ originalActivityId: activityId });
  });

  it('hết hạn trả UNDO_NO_LONGER_SAFE', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    await ActivityModel.updateOne(
      { _id: activityId },
      { $set: { undoableUntil: new Date(Date.now() - 1000) } },
    );
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NO_LONGER_SAFE');
  });

  it('task đã move trả UNDO_NO_LONGER_SAFE', async () => {
    const { owner, boardId, activityId, taskId, taskVersion } = await setupPromoted();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
      .send({ columnId: 'done', beforeTaskId: null, expectedVersion: taskVersion })
      .expect(200);
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NO_LONGER_SAFE');
  });

  it('activity demote không undo được', async () => {
    const { owner, boardId, taskId, taskVersion, itemVersion, activityId } = await setupPromoted();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/demote`)
      .send({ expectedTaskVersion: taskVersion, expectedItemVersion: itemVersion })
      .expect(200);
    const demoteActivity = await ActivityModel.findOne({ action: 'item.demoted' }).exec();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${demoteActivity?._id.toHexString()}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NOT_AVAILABLE');
    await owner.agent.post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`).expect(409);
  });

  it('hai undo đồng thời chỉ một thành công', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`),
      owner.agent.post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await ActivityModel.countDocuments({ action: 'item.promote_undone' })).toBe(1);
  });

  it('fault trước task update rollback', async () => {
    const { board, actor, activityId } = await setupPromoted();
    await expect(
      undoPromote({
        board,
        actor,
        activityId,
        beforeTaskUpdate: async () => {
          throw new Error('undo task fault');
        },
      }),
    ).rejects.toThrow('undo task fault');
    const task = await TaskModel.findOne({ boardId: board._id }).exec();
    expect(task?.lifecycle).toBe('active');
    const item = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(item?.promotedTaskId?.toHexString()).toBe(task?._id.toHexString());
  });

  it('fault trước activity rollback task/item', async () => {
    const { board, actor, activityId } = await setupPromoted();
    await expect(
      undoPromote({
        board,
        actor,
        activityId,
        beforeActivityInsert: async () => {
          throw new Error('undo activity fault');
        },
      }),
    ).rejects.toThrow('undo activity fault');
    const task = await TaskModel.findOne({ boardId: board._id }).exec();
    expect(task?.lifecycle).toBe('active');
    const item = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(item?.promotedTaskId?.toHexString()).toBe(task?._id.toHexString());
    expect(await ActivityModel.countDocuments({ action: 'item.promote_undone' })).toBe(0);
  });
});
