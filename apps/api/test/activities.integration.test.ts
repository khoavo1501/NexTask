import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
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

async function setupActivityBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Activity' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:a',
          type: 'note',
          content: 'Activity note',
          style: {},
          props: {},
          position: { x: 1, y: 2 },
          size: { w: 100, h: 100 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
        {
          shapeId: 'shape:b',
          type: 'note',
          content: 'Second note',
          style: {},
          props: {},
          position: { x: 3, y: 4 },
          size: { w: 100, h: 100 },
          rotation: 0,
          tldrawIndex: 'a2',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const first = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${sync.body.data[0]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: sync.body.data[0].version })
    .expect(201);
  await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${sync.body.data[1]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: sync.body.data[1].version })
    .expect(201);
  await owner.agent
    .post(`/api/v1/boards/${boardId}/tasks/${first.body.data.task._id}/demote`)
    .send({
      expectedTaskVersion: first.body.data.task.version,
      expectedItemVersion: first.body.data.item.version,
    })
    .expect(200);
  return { owner, boardId };
}

describe('activity API', () => {
  it('trả activity mới nhất trước, đúng board', async () => {
    const { owner, boardId } = await setupActivityBoard();

    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/activities?limit=2`)
      .expect(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].action).toBe('item.demoted');
    expect(response.body.data[1].action).toBe('item.promoted');
    expect(
      response.body.data.every((entry: { boardId: string }) => entry.boardId === boardId),
    ).toBe(true);
  });

  it('Member đọc được, non-member bị 404', async () => {
    const { owner, boardId } = await setupActivityBoard();
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

    await member.agent.get(`/api/v1/boards/${boardId}/activities`).expect(200);
    await stranger.agent.get(`/api/v1/boards/${boardId}/activities`).expect(404);
    await owner.agent.get(`/api/v1/boards/${boardId}/activities`).expect(200);
  });

  it('từ chối limit ngoài 1..100', async () => {
    const { owner, boardId } = await setupActivityBoard();
    await owner.agent.get(`/api/v1/boards/${boardId}/activities?limit=0`).expect(422);
    await owner.agent.get(`/api/v1/boards/${boardId}/activities?limit=101`).expect(422);
  });
});
