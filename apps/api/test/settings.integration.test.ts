import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
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

describe('board settings', () => {
  it('owner cập nhật settings và budget limit', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Settings' }).expect(201);
    const boardId = board.body.data._id as string;
    const response = await owner.agent
      .patch(`/api/v1/boards/${boardId}/settings`)
      .send({
        votingLimit: 5,
        minVotes: 2,
        stalledAfterDays: 14,
        expectedVersion: board.body.data.version,
      })
      .expect(200);

    expect(response.body.data.settings).toEqual({
      votingLimit: 5,
      minVotes: 2,
      stalledAfterDays: 14,
    });
    expect(response.body.data.version).toBe(board.body.data.version + 1);
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.limit).toBe(5);
  });

  it('Member bị 403, stale 409, invalid 422', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Settings' }).expect(201);
    const boardId = board.body.data._id as string;
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
      .patch(`/api/v1/boards/${boardId}/settings`)
      .send({
        votingLimit: 5,
        minVotes: 2,
        stalledAfterDays: 14,
        expectedVersion: board.body.data.version,
      })
      .expect(403);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/settings`)
      .send({
        votingLimit: 5,
        minVotes: 2,
        stalledAfterDays: 14,
        expectedVersion: board.body.data.version + 1,
      })
      .expect(409);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/settings`)
      .send({
        votingLimit: -1,
        minVotes: 2,
        stalledAfterDays: 14,
        expectedVersion: board.body.data.version,
      })
      .expect(422);
  });
});
