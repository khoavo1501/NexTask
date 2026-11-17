import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
import { ensureVoterBudget } from '../src/modules/votes/voter-budget.service.js';
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

describe('voter budgets', () => {
  it('board mới có budget owner limit 3', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Budget' }).expect(201);
    const budget = await VoterBudgetModel.findOne({
      boardId: board.body.data._id,
      userId: owner.user._id,
    }).exec();
    expect(budget).toMatchObject({ used: 0, limit: 3, version: 1 });
  });

  it('ensure idempotent và tính used từ votes hiện có', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Budget' }).expect(201);
    const boardId = new Types.ObjectId(board.body.data._id as string);
    const userId = new Types.ObjectId(owner.user._id);

    const first = await ensureVoterBudget(boardId, userId, 3);
    const second = await ensureVoterBudget(boardId, userId, 3);
    expect(second._id.toHexString()).toBe(first._id.toHexString());
    expect(second.used).toBe(0);
  });
});
