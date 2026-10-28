import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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
    props: { color: 'yellow', richText: { type: 'doc', content: [] } },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentFrameId: null,
  };
}

async function createOwnerBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro 1' })
    .expect(201);
  return {
    owner,
    boardId: boardResponse.body.data._id as string,
    board: boardResponse.body.data as {
      _id: string;
      ownerId: string;
      viewerRole: string;
      columns: Array<{ id: string }>;
      version: number;
    },
  };
}

describe('boards và items', () => {
  it('tạo board với 5 cột mặc định, owner member', async () => {
    const { owner, board } = await createOwnerBoard();

    expect(board.ownerId).toBe(owner.user._id);
    expect(board.viewerRole).toBe('owner');
    expect(board.columns.map((column) => column.id)).toEqual([
      'backlog',
      'todo',
      'in-progress',
      'review',
      'done',
    ]);
    await owner.agent.get(`/api/v1/boards/${board._id}`).expect(200);
  });

  it('sync note idempotent theo shapeId', async () => {
    const { owner, boardId } = await createOwnerBoard();

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng')] })
      .expect(200);
    expect(first.body.data).toHaveLength(1);

    const second = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng đã sửa')] })
      .expect(200);

    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].content).toBe('Ý tưởng đã sửa');
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/items`).expect(200);
    expect(listed.body.data).toHaveLength(1);
  });

  it('sync xóa note chưa promote không còn trong payload', async () => {
    const { owner, boardId } = await createOwnerBoard();
    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
      .expect(200);

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một')] })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
  });

  it('request sai schema trả 422', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    await owner.agent.post('/api/v1/boards').send({ name: '' }).expect(422);
  });
});
