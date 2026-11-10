import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
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

async function setupFilterTasks() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Filters' })
    .expect(201);
  const boardId = board.body.data._id as string;
  const member = await registerAgent(app, 'member@example.com', 'Member');

  const create = (title: string, order: string, extra: Record<string, unknown>) =>
    TaskModel.create({
      boardId,
      columnId: 'todo',
      order,
      title,
      description: 'test',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: owner.user._id,
      ...extra,
    });

  await create('Daily C++ (urgent)', 'a0', {
    assigneeId: member.user._id,
    labels: ['bug', 'ux'],
    priority: 'high',
  });
  await create('Daily standup', 'a1', { assigneeId: owner.user._id, labels: ['ops'] });
  await create('Unassigned idea', 'a2', { priority: 'low' });

  return { owner, member, boardId };
}

describe('task filters', () => {
  it('lọc theo assignee, priority, labels và q escape', async () => {
    const { owner, member, boardId } = await setupFilterTasks();

    const byAssignee = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ assigneeId: member.user._id })
      .expect(200);
    expect(byAssignee.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Daily C++ (urgent)',
    ]);

    const unassigned = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ assigneeId: 'none' })
      .expect(200);
    expect(unassigned.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Unassigned idea',
    ]);

    const byPriority = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'high' })
      .expect(200);
    expect(byPriority.body.data).toHaveLength(1);

    const byLabels = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ labels: 'bug,ux' })
      .expect(200);
    expect(byLabels.body.data).toHaveLength(1);

    const byQuery = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'c++' })
      .expect(200);
    expect(byQuery.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Daily C++ (urgent)',
    ]);
  });

  it('limit và hasMore', async () => {
    const { owner, boardId } = await setupFilterTasks();
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2 })
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.hasMore).toBe(true);
  });

  it('query sai trả 422', async () => {
    const { owner, boardId } = await setupFilterTasks();

    await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 101 })
      .expect(422);
    await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'critical' })
      .expect(422);
    await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ assigneeId: 'bad' })
      .expect(422);
    await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ columnId: 'missing' })
      .expect(422);
  });
});
