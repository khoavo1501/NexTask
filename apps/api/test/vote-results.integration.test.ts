import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
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

async function setup() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Results' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: 3 }, (_, index) => ({
        shapeId: `shape:result-${index}`,
        type: 'note',
        content: `Result note ${index}`,
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
  return { owner, boardId, items: sync.body.data as Array<{ _id: string }> };
}

describe('vote results', () => {
  it('trả voteCount, voters, usage và viewer', async () => {
    const { owner, boardId, items } = await setup();
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`).expect(200);
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${items[1]!._id}/votes`).expect(200);

    const response = await owner.agent.get(`/api/v1/boards/${boardId}/votes/results`).expect(200);
    expect(response.body.data.items[0]).toMatchObject({ voteCount: 1 });
    expect(response.body.data.items[0].voters).toContain(owner.user._id);
    expect(response.body.data.usage[0]).toMatchObject({
      userId: owner.user._id,
      used: 2,
      limit: 3,
    });
    expect(response.body.data.viewer).toMatchObject({ used: 2, limit: 3 });
  });

  it('item không vote voteCount 0 và limit áp đúng', async () => {
    const { owner, boardId } = await setup();
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/votes/results?limit=1`)
      .expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].voteCount).toBe(0);
  });
});
