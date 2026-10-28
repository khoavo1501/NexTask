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

describe('membership và role', () => {
  it('tạo board có owner member và role viewer', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const response = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);

    expect(response.body.data.viewerRole).toBe('owner');
    expect(response.body.data.members).toHaveLength(1);
    expect(response.body.data.members[0]).toMatchObject({
      userId: owner.user._id,
      role: 'owner',
    });
  });

  it('Member đọc board nhưng không đổi tên; owner thấy member list', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
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

    const read = await member.agent.get(`/api/v1/boards/${boardId}`).expect(200);
    expect(read.body.data.viewerRole).toBe('member');
    await member.agent.get(`/api/v1/boards/${boardId}/items`).expect(200);
    await member.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    await member.agent.patch(`/api/v1/boards/${boardId}`).send({ name: 'Hacked' }).expect(403);

    const members = await owner.agent.get(`/api/v1/boards/${boardId}/members`).expect(200);
    expect(members.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: owner.user._id,
          name: 'Owner',
          role: 'owner',
        }),
        expect.objectContaining({
          userId: member.user._id,
          name: 'Member',
          role: 'member',
        }),
      ]),
    );
    expect(members.body.data[0].passwordHash).toBeUndefined();
  });

  it('Member có thể promote note và move task', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
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

    const synced = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [
          {
            shapeId: 'shape:member',
            type: 'note',
            content: 'Việc của member',
            style: {},
            props: {},
            position: { x: 1, y: 2 },
            size: { w: 100, h: 100 },
            rotation: 0,
            tldrawIndex: 'a0',
            parentFrameId: null,
          },
        ],
      })
      .expect(200);

    const promoted = await member.agent
      .post(`/api/v1/boards/${boardId}/items/${synced.body.data[0]._id}/promote`)
      .send({ columnId: 'todo', assignToMe: true })
      .expect(201);
    expect(promoted.body.data.task.assigneeId).toBe(member.user._id);

    const moved = await member.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${promoted.body.data.task._id}`)
      .send({ columnId: 'done', expectedVersion: promoted.body.data.task.version })
      .expect(200);
    expect(moved.body.data.columnId).toBe('done');
  });

  it('owner rename thành công', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
    const boardId = board.body.data._id as string;

    const renamed = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Retro mới', expectedVersion: board.body.data.version })
      .expect(200);

    expect(renamed.body.data.name).toBe('Retro mới');
    expect(renamed.body.data.version).toBe(board.body.data.version + 1);
  });

  it('non-member nhận 404', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });

    await stranger.agent.get(`/api/v1/boards/${board.body.data._id}`).expect(404);
  });

  it('board list chỉ trả board có membership', async () => {
    const first = await registerAgent(app, 'first@example.com', 'First');
    const second = await registerAgent(app, 'second@example.com', 'Second');
    await first.agent.post('/api/v1/boards').send({ name: 'Board First' }).expect(201);
    await second.agent.post('/api/v1/boards').send({ name: 'Board Second' }).expect(201);

    const firstList = await first.agent.get('/api/v1/boards').expect(200);
    const secondList = await second.agent.get('/api/v1/boards').expect(200);

    expect(firstList.body.data).toHaveLength(1);
    expect(firstList.body.data[0].name).toBe('Board First');
    expect(secondList.body.data).toHaveLength(1);
    expect(secondList.body.data[0].name).toBe('Board Second');
  });
});
