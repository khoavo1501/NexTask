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

function frame(shapeId = 'shape:frame1', overrides: Record<string, unknown> = {}) {
  return {
    shapeId,
    type: 'frame',
    style: { color: 'yellow' },
    props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
    position: { x: 100, y: 200 },
    size: { w: 220, h: 700 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentShapeId: null,
    expectedVersion: 0,
    ...overrides,
  };
}

function note(
  shapeId = 'shape:note1',
  parentShapeId: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    shapeId,
    type: 'note',
    content: 'Ý tưởng',
    style: { color: 'yellow' },
    props: { color: 'yellow' },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a2',
    parentShapeId,
    expectedVersion: 0,
    ...overrides,
  };
}

async function setupBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Frame board' })
    .expect(201);
  return { owner, boardId: boardResponse.body.data._id as string };
}

describe('frame sync', () => {
  it('sync frame và note con trong một request', async () => {
    const { owner, boardId } = await setupBoard();

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);

    const frameItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );
    expect(frameItem).toMatchObject({ type: 'frame', parentFrameId: null, content: '' });
    expect(noteItem.parentFrameId).toBe(frameItem._id);

    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/items`).expect(200);
    expect(listed.body.data).toHaveLength(2);
  });

  it('resolve frame đã có ngoài payload', async () => {
    const { owner, boardId } = await setupBoard();
    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame()] })
      .expect(200);

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:note1', 'shape:frame1')] })
      .expect(200);

    const frameItem = await ItemModel.findOne({ boardId, shapeId: 'shape:frame1' }).exec();
    const noteItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );
    expect(noteItem.parentFrameId).toBe(frameItem?._id.toHexString());
  });

  it('từ chối frame cha không tồn tại, size lệch và version cũ', async () => {
    const { owner, boardId } = await setupBoard();

    const missingParent = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:note1', 'shape:missing')] })
      .expect(422);
    expect(missingParent.body.error.code).toBe('FRAME_NOT_FOUND');

    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame('shape:frame1', { size: { w: 100, h: 700 } })] })
      .expect(422);

    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame('shape:frame1')] })
      .expect(200);
    const stale = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [frame('shape:frame1', { expectedVersion: created.body.data[0].version - 1 })],
      })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:frame1' },
    });
  });

  it('xóa frame chuyển note con về page level', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);
    const frameItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: 'shape:frame1', expectedVersion: frameItem.version }],
      })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      shapeId: 'shape:note1',
      parentFrameId: null,
      position: { x: 110, y: 220 },
      version: noteItem.version + 1,
    });
  });

  it('xóa frame giữ note đã promote và reparent note đó', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);
    const frameItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );

    const promoted = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${noteItem._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: noteItem.version })
      .expect(201);
    expect(promoted.body.data.task.origin.frameId).toBe(frameItem._id);

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: 'shape:frame1', expectedVersion: frameItem.version }],
      })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      shapeId: 'shape:note1',
      parentFrameId: null,
      position: { x: 110, y: 220 },
      promotedTaskId: promoted.body.data.task._id,
      version: promoted.body.data.item.version + 1,
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
  });
});
