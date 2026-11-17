import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
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

async function setupBoard(count = 4) {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Vote' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: count }, (_, index) => ({
        shapeId: `shape:vote-${index}`,
        type: 'note',
        content: `Vote note ${index}`,
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
  return {
    owner,
    boardId,
    items: sync.body.data as Array<{ _id: string; version: number }>,
  };
}

describe('voting', () => {
  it('vote thành công, không tăng item.version, budget used +1', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    const target = items[0]!;
    const before = await ItemModel.findById(target._id).exec();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${target._id}/votes`)
      .expect(200);

    expect(response.body.data.item.votes).toHaveLength(1);
    expect(response.body.data.budget).toMatchObject({ used: 1, limit: 3 });
    const after = await ItemModel.findById(target._id).exec();
    expect(after?.version).toBe(before?.version);
    const budget = await VoterBudgetModel.findOne({
      boardId,
      userId: owner.user._id,
    }).exec();
    expect(budget?.used).toBe(1);
  });

  it('vote lại trả ALREADY_VOTED và không tăng used', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    const target = items[0]!;
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${target._id}/votes`).expect(200);
    const second = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${target._id}/votes`)
      .expect(409);
    expect(second.body.error.code).toBe('ALREADY_VOTED');
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(1);
  });

  it('hết quota trả VOTE_LIMIT_REACHED', async () => {
    const { owner, boardId, items } = await setupBoard(4);
    for (const item of items.slice(0, 3)) {
      await owner.agent.post(`/api/v1/boards/${boardId}/items/${item._id}/votes`).expect(200);
    }
    const fourth = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[3]!._id}/votes`)
      .expect(409);
    expect(fourth.body.error.code).toBe('VOTE_LIMIT_REACHED');
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(3);
  });

  it('hai vote đồng thời khác item khi còn một quota chỉ một thành công', async () => {
    const { owner, boardId, items } = await setupBoard(4);
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`).expect(200);
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${items[1]!._id}/votes`).expect(200);
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/items/${items[2]!._id}/votes`),
      owner.agent.post(`/api/v1/boards/${boardId}/items/${items[3]!._id}/votes`),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(3);
  });

  it('unvote giảm used; unvote lần hai NOT_VOTED', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    const target = items[0]!;
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${target._id}/votes`).expect(200);
    const unvoted = await owner.agent
      .delete(`/api/v1/boards/${boardId}/items/${target._id}/votes`)
      .expect(200);
    expect(unvoted.body.data.item.votes).toHaveLength(0);
    expect(unvoted.body.data.budget.used).toBe(0);
    const second = await owner.agent
      .delete(`/api/v1/boards/${boardId}/items/${target._id}/votes`)
      .expect(409);
    expect(second.body.error.code).toBe('NOT_VOTED');
  });

  it('owner và member vote được; non-member 404', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
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
    const target = items[0]!;
    await owner.agent.post(`/api/v1/boards/${boardId}/items/${target._id}/votes`).expect(200);
    await member.agent.post(`/api/v1/boards/${boardId}/items/${target._id}/votes`).expect(200);
    await stranger.agent.post(`/api/v1/boards/${boardId}/items/${target._id}/votes`).expect(404);
  });
});
