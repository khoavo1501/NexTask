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
  const board = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Tasks' })
    .expect(201);
  return { owner, boardId: board.body.data._id as string };
}

describe('create task', () => {
  it('append cuối cột, default field và version 1', async () => {
    const { owner, boardId } = await setup();
    const first = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Task A' })
      .expect(201);
    const second = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Task B' })
      .expect(201);

    expect(first.body.data).toMatchObject({
      columnId: 'todo',
      title: 'Task A',
      description: '',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      version: 1,
    });
    expect(second.body.data.order > first.body.data.order).toBe(true);
  });

  it('trim/dedupe labels và assignee member', async () => {
    const { owner, boardId } = await setup();
    const created = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({
        columnId: 'todo',
        title: 'Task',
        assigneeId: owner.user._id,
        labels: [' bug ', 'ux', 'bug'],
        priority: 'high',
      })
      .expect(201);

    expect(created.body.data.labels).toEqual(['bug', 'ux']);
    expect(created.body.data.assigneeId).toBe(owner.user._id);
  });

  it('column/assignee ngoài board trả 422', async () => {
    const { owner, boardId } = await setup();
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');

    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'missing', title: 'Task' })
      .expect(422);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Task', assigneeId: stranger.user._id })
      .expect(422);
  });

  it('title rỗng/quá dài trả 422', async () => {
    const { owner, boardId } = await setup();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: '' })
      .expect(422);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'x'.repeat(201) })
      .expect(422);
  });
});
