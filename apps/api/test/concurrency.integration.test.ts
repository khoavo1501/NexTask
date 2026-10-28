import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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
    .send({
      columnId: 'todo',
      assignToMe: false,
      expectedItemVersion: synced.body.data[0].version,
    })
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
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
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

describe('promote OCC', () => {
  it('expectedItemVersion cũ trả 409 và không tạo task', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;
    const synced = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Stale promote')] })
      .expect(200);
    const item = synced.body.data[0] as { _id: string; version: number };

    await ItemModel.updateOne({ _id: item._id }, { $inc: { version: 1 } }).exec();

    const stale = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: item.version + 1 },
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(0);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: item.version + 1,
      })
      .expect(201);
  });

  it('version đúng nhưng đã promote trả ALREADY_PROMOTED', async () => {
    const { owner, boardId, item } = await setupPromotedTask();
    const current = await ItemModel.findById(item._id).exec();
    if (!current) throw new Error('Item missing');

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: current.version,
      })
      .expect(409);
    expect(response.body.error.code).toBe('ALREADY_PROMOTED');
  });
});

describe('item sync OCC', () => {
  it('một item stale làm toàn bộ request không ghi', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
      .expect(200);
    const one = first.body.data[0] as { _id: string; version: number };
    const two = first.body.data[1] as { _id: string; version: number };

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [
          { ...note('shape:one', 'Một đã sửa'), expectedVersion: 0 },
          { ...note('shape:two', 'Hai đã sửa'), expectedVersion: two.version },
        ],
      })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:one', currentVersion: one.version },
    });

    const saved = await ItemModel.find({ boardId }).sort({ shapeId: 1 }).exec();
    expect(saved.map((item) => item.content)).toEqual(['Một', 'Hai']);
    expect(saved.every((item) => item.version === 1)).toBe(true);
  });

  it('item mới phải gửi expectedVersion 0', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [{ ...note('shape:new', 'Mới'), expectedVersion: 5 }] })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:new', currentVersion: 0 },
    });
  });

  it('xóa đúng version, xóa stale 409, item promoted bị bỏ qua', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [note('shape:one', 'Một'), note('shape:two', 'Hai'), note('shape:three', 'Ba')],
      })
      .expect(200);
    const one = first.body.data[0] as {
      _id: string;
      shapeId: string;
      version: number;
    };
    const two = first.body.data[1] as {
      _id: string;
      shapeId: string;
      version: number;
    };
    const three = first.body.data[2] as {
      _id: string;
      shapeId: string;
      version: number;
    };

    const staleDelete = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: two.shapeId, expectedVersion: two.version + 1 }],
      })
      .expect(409);
    expect(staleDelete.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: two.version },
    });

    const deleted = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [], deleted: [{ shapeId: two.shapeId, expectedVersion: two.version }] })
      .expect(200);
    expect(deleted.body.data.map((item: { shapeId: string }) => item.shapeId)).toEqual([
      one.shapeId,
      three.shapeId,
    ]);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${three._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: three.version })
      .expect(201);

    const ignored = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: three.shapeId, expectedVersion: three.version + 1 }],
      })
      .expect(200);
    expect(ignored.body.data.map((item: { shapeId: string }) => item.shapeId)).toContain(
      three.shapeId,
    );
  });

  it('hai sync đồng thời trên cùng item chỉ một thành công', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Gốc')] })
      .expect(200);
    const item = first.body.data[0] as { version: number };

    const [left, right] = await Promise.all([
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [{ ...note('shape:one', 'Trái'), expectedVersion: item.version }] }),
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [{ ...note('shape:one', 'Phải'), expectedVersion: item.version }] }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const saved = await ItemModel.findOne({ boardId, shapeId: 'shape:one' }).exec();
    expect(saved?.version).toBe(2);
  });

  it('shapeId lặp giữa items và deleted trả 422', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [note('shape:one', 'Một')],
        deleted: [{ shapeId: 'shape:one', expectedVersion: 1 }],
      })
      .expect(422);
  });
});

describe('item sync create race', () => {
  it('hai client cùng tạo một shapeId chỉ một item được tạo', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
    const boardId = board.body.data._id as string;

    const [left, right] = await Promise.all([
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [note('shape:race', 'Trái')] }),
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [note('shape:race', 'Phải')] }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const saved = await ItemModel.find({ boardId, shapeId: 'shape:race' }).exec();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.version).toBe(1);
  });
});
