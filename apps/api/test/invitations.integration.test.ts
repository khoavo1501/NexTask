import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { InvitationModel } from '../src/modules/invitations/invitation.model.js';
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

async function ownerBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' }).expect(201);
  return { owner, boardId: board.body.data._id as string };
}

describe('invitations', () => {
  it('owner tạo link, DB chỉ lưu hash; member accept', async () => {
    const { owner, boardId } = await ownerBoard();
    const invitee = await registerAgent(app, 'invitee@example.com', 'Invitee');

    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({ email: 'Invitee@Example.com' })
      .expect(201);

    const token = invitation.body.data.token as string;
    expect(invitation.body.data.path).toBe(`/invitations/${token}`);
    const stored = await InvitationModel.findOne({ boardId }).exec();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toHaveLength(64);
    expect(stored?.emailNormalized).toBe('invitee@example.com');

    const accepted = await invitee.agent.post(`/api/v1/invitations/${token}/accept`).expect(200);
    expect(accepted.body.data.viewerRole).toBe('member');
    expect(accepted.body.data.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: invitee.user._id,
          role: 'member',
        }),
      ]),
    );

    const boards = await invitee.agent.get('/api/v1/boards').expect(200);
    expect(boards.body.data.map((entry: { _id: string }) => entry._id)).toContain(boardId);
    const boardAfterAccept = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
    expect(boardAfterAccept.body.data.version).toBe(2);
    const storedAfter = await InvitationModel.findOne({ boardId }).exec();
    expect(storedAfter?.usedAt).not.toBeNull();
  });

  it('member không tạo được invitation', async () => {
    const { owner, boardId } = await ownerBoard();
    const invitee = await registerAgent(app, 'invitee@example.com', 'Invitee');
    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({})
      .expect(201);
    await invitee.agent
      .post(`/api/v1/invitations/${invitation.body.data.token}/accept`)
      .expect(200);

    await invitee.agent.post(`/api/v1/boards/${boardId}/invitations`).send({}).expect(403);
  });

  it('email không khớp trả 403', async () => {
    const { owner, boardId } = await ownerBoard();
    const invitee = await registerAgent(app, 'invitee@example.com', 'Invitee');
    const other = await registerAgent(app, 'other@example.com', 'Other');
    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({ email: invitee.user.email })
      .expect(201);

    await other.agent.post(`/api/v1/invitations/${invitation.body.data.token}/accept`).expect(403);
  });

  it('token hết hạn trả 404', async () => {
    const { owner, boardId } = await ownerBoard();
    const invitee = await registerAgent(app, 'invitee@example.com', 'Invitee');
    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({})
      .expect(201);
    await InvitationModel.updateOne(
      { boardId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    ).exec();

    await invitee.agent
      .post(`/api/v1/invitations/${invitation.body.data.token}/accept`)
      .expect(404);
  });

  it('token đã dùng bởi người khác trả 404', async () => {
    const { owner, boardId } = await ownerBoard();
    const first = await registerAgent(app, 'first@example.com', 'First');
    const second = await registerAgent(app, 'second@example.com', 'Second');
    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({})
      .expect(201);

    await first.agent.post(`/api/v1/invitations/${invitation.body.data.token}/accept`).expect(200);
    await second.agent.post(`/api/v1/invitations/${invitation.body.data.token}/accept`).expect(404);
  });

  it('accept cần đăng nhập và TTL index tồn tại', async () => {
    const { owner, boardId } = await ownerBoard();
    const invitation = await owner.agent
      .post(`/api/v1/boards/${boardId}/invitations`)
      .send({})
      .expect(201);

    await request(app).post(`/api/v1/invitations/${invitation.body.data.token}/accept`).expect(401);

    const indexes = await InvitationModel.collection.indexes();
    expect(indexes.some((index) => index.name === 'invitations_expiry_ttl')).toBe(true);
  });
});
