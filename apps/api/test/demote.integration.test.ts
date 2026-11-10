import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { demoteTask } from '../src/modules/tasks/demote.service.js';
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

async function setupPromotedTask(content = 'Ý tưởng demote') {
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

  const board = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!board || !actor) throw new Error('Board or actor missing');

  return {
    owner,
    boardId,
    board,
    actor,
    itemId: item._id,
    itemVersion: promoted.body.data.item.version as number,
    task: promoted.body.data.task as { _id: string; version: number },
  };
}

describe('demote', () => {
  it('demote thành công giữ task, cập nhật item và ghi activity', async () => {
    const { owner, boardId, itemId, itemVersion, task } = await setupPromotedTask();

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);

    expect(response.body.data.task).toMatchObject({
      lifecycle: 'demoted',
      version: task.version + 1,
    });
    expect(response.body.data.task.demotedAt).toBeTruthy();
    expect(response.body.data.item).toMatchObject({
      _id: itemId,
      promotedTaskId: null,
      version: itemVersion + 1,
    });
    expect(response.body.data.activity).toMatchObject({
      action: 'item.demoted',
      undoableUntil: null,
    });

    const savedTask = await TaskModel.findById(task._id).exec();
    expect(savedTask?.lifecycle).toBe('demoted');
    const savedItem = await ItemModel.findById(itemId).exec();
    expect(savedItem?.promotedTaskId).toBeNull();
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(listed.body.data).toHaveLength(0);
  });

  it('demote lần hai trả ALREADY_DEMOTED và không thêm activity', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);

    const second = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version + 1, expectedItemVersion: itemVersion + 1 })
      .expect(409);

    expect(second.body.error.code).toBe('ALREADY_DEMOTED');
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('task tạo tay trả TASK_NOT_DEMOTABLE', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Manual' }).expect(201);
    const boardId = board.body.data._id as string;
    const task = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Manual task' })
      .expect(201);

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task.body.data._id}/demote`)
      .send({ expectedTaskVersion: 1, expectedItemVersion: 1 })
      .expect(409);
    expect(response.body.error.code).toBe('TASK_NOT_DEMOTABLE');
  });

  it('Member demote được task của board', async () => {
    const { boardId, itemVersion, task } = await setupPromotedTask('Member demote');
    const member = await registerAgent(app, 'member@example.com', 'Member');
    await BoardModel.updateOne(
      { _id: boardId },
      {
        $push: {
          members: {
            userId: new Types.ObjectId(member.user._id),
            role: 'member',
            joinedAt: new Date(),
          },
        },
      },
    );

    await member.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);
  });

  it('task version lệch trả conflict field task', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version + 1, expectedItemVersion: itemVersion })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: task.version, field: 'task' },
    });
  });

  it('item version lệch trả conflict field item', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion + 1 })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: itemVersion, field: 'item' },
    });
  });

  it('hai demote đồng thời chỉ một thành công', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const body = { expectedTaskVersion: task.version, expectedItemVersion: itemVersion };
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`).send(body),
      owner.agent.post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('lỗi activity rollback task và item', async () => {
    const { board, actor, itemVersion, task } = await setupPromotedTask();
    await expect(
      demoteTask({
        board,
        taskId: task._id,
        actor,
        request: { expectedTaskVersion: task.version, expectedItemVersion: itemVersion },
        beforeActivityInsert: async () => {
          throw new Error('demote activity fault');
        },
      }),
    ).rejects.toThrow('demote activity fault');

    const savedTask = await TaskModel.findById(task._id).exec();
    expect(savedTask?.lifecycle).toBe('active');
    expect(savedTask?.version).toBe(task.version);
    const savedItem = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(savedItem?.promotedTaskId?.toHexString()).toBe(task._id);
    expect(savedItem?.version).toBe(itemVersion);
  });
});
