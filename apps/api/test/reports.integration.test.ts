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

async function setup() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Reports' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:idea',
          type: 'note',
          content: 'Idea nhiều vote',
          style: {},
          props: {},
          position: { x: 10, y: 10 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
        {
          shapeId: 'shape:promoted',
          type: 'note',
          content: 'Idea đã promote',
          style: {},
          props: {},
          position: { x: 220, y: 10 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a2',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const idea = sync.body.data[0] as { _id: string; version: number };
  const promoted = sync.body.data[1] as { _id: string; version: number };

  const member2 = await registerAgent(app, 'vote2@example.com', 'Voter 2');
  const member3 = await registerAgent(app, 'vote3@example.com', 'Voter 3');
  await BoardModel.updateOne(
    { _id: boardId },
    {
      $push: {
        members: {
          $each: [
            { userId: new Types.ObjectId(member2.user._id), role: 'member', joinedAt: new Date() },
            { userId: new Types.ObjectId(member3.user._id), role: 'member', joinedAt: new Date() },
          ],
        },
      },
    },
  );
  for (const voter of [owner, member2, member3]) {
    await voter.agent.post(`/api/v1/boards/${boardId}/items/${idea._id}/votes`).expect(200);
  }
  const task = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${promoted._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: promoted.version })
    .expect(201);
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.db
    .collection('tasks')
    .updateOne(
      { _id: new Types.ObjectId(task.body.data.task._id) },
      { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
    );
  return { owner, boardId, taskId: task.body.data.task._id as string };
}

describe('stalled ideas report', () => {
  it('trả cả hai nhóm và summary', async () => {
    const { owner, boardId } = await setup();
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/reports/stalled-ideas`)
      .expect(200);
    expect(response.body.data.unpromotedIdeas[0]).toMatchObject({
      content: 'Idea nhiều vote',
      voteCount: 3,
    });
    expect(response.body.data.stalledTasks[0]).toMatchObject({
      title: 'Idea đã promote',
      columnId: 'todo',
    });
    expect(response.body.data.summary).toEqual({
      unpromotedIdeas: 1,
      stalledTasks: 1,
    });
    expect(response.body.data.params).toMatchObject({
      minVotes: 3,
      stalledDays: 7,
      limit: 50,
    });
  });

  it('override params và loại task Done', async () => {
    const { owner, boardId, taskId } = await setup();
    const tasks = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    const version = tasks.body.data.find((entry: { _id: string }) => entry._id === taskId).version;
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
      .send({ columnId: 'done', beforeTaskId: null, expectedVersion: version })
      .expect(200);
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/reports/stalled-ideas?minVotes=4&stalledDays=1&limit=1`)
      .expect(200);
    expect(response.body.data.unpromotedIdeas).toHaveLength(0);
    expect(response.body.data.stalledTasks).toHaveLength(0);
    expect(response.body.data.params).toMatchObject({
      minVotes: 4,
      stalledDays: 1,
      limit: 1,
    });
  });
});
