import { ObjectId } from 'mongodb';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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
    jwtSecret: 'local-test-jwt-secret-at-least-32-bytes-long',
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
    props: { color: 'yellow', richText: { type: 'doc', content: [] } },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentFrameId: null,
  };
}

describe('boards và items', () => {
  it('tạo board với 5 cột mặc định', async () => {
    const response = await request(app).post('/api/v1/boards').send({ name: 'Retro 1' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Retro 1');
    expect(response.body.data.columns.map((column: { id: string }) => column.id)).toEqual([
      'backlog',
      'todo',
      'in-progress',
      'review',
      'done',
    ]);
    expect(response.body.data.ownerId).toBe(ownerId);
  });

  it('chỉ trả board của demo owner', async () => {
    await BoardModel.create({
      name: 'Board người khác',
      ownerId: new ObjectId(),
      columns: [],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
    await request(app).post('/api/v1/boards').send({ name: 'Board của tôi' }).expect(201);

    const response = await request(app).get('/api/v1/boards').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Board của tôi');
    await request(app).get(`/api/v1/boards/${response.body.data[0]._id}`).expect(200);
  });

  it('sync note idempotent theo shapeId', async () => {
    const board = await request(app).post('/api/v1/boards').send({ name: 'Board' });
    const boardId = board.body.data._id as string;

    const first = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng')] })
      .expect(200);
    expect(first.body.data).toHaveLength(1);

    const second = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng đã sửa')] })
      .expect(200);

    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].content).toBe('Ý tưởng đã sửa');
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
    const listed = await request(app).get(`/api/v1/boards/${boardId}/items`).expect(200);
    expect(listed.body.data).toHaveLength(1);
  });

  it('sync xóa note chưa promote không còn trong payload', async () => {
    const board = await request(app).post('/api/v1/boards').send({ name: 'Board' });
    const boardId = board.body.data._id as string;
    await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
      .expect(200);

    const response = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một')] })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
  });

  it('board của owner khác trả 404', async () => {
    const other = await BoardModel.create({
      name: 'Khác',
      ownerId: new ObjectId(),
      columns: [],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });

    await request(app).get(`/api/v1/boards/${other._id.toString()}`).expect(404);
  });

  it('request sai schema trả 422', async () => {
    await request(app).post('/api/v1/boards').send({ name: '' }).expect(422);
  });
});
