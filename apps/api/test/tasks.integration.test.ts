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

type RegisteredAgent = Awaited<ReturnType<typeof registerAgent>>;

async function setupTasks() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Ordering' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;
  const task = (columnId: string, order: string, title: string) =>
    TaskModel.create({
      boardId,
      columnId,
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
    });

  const a = await task('todo', 'a0', 'A');
  const b = await task('todo', 'a1', 'B');
  const c = await task('todo', 'a2', 'C');
  return { owner, boardId, a, b, c };
}

function move(
  owner: RegisteredAgent,
  boardId: string,
  taskId: string,
  body: { columnId: string; beforeTaskId: string | null; expectedVersion: number },
) {
  return owner.agent.post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`).send(body);
}

async function taskTitles(owner: RegisteredAgent, boardId: string) {
  const response = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
  return response.body.data.map((task: { title: string }) => task.title);
}

describe('task ordering', () => {
  it('chèn đầu, giữa và cuối cột', async () => {
    const { owner, boardId, a, b, c } = await setupTasks();

    const firstMove = await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: c.version,
    }).expect(200);
    expect(firstMove.body.data.columnId).toBe('todo');
    expect(await taskTitles(owner, boardId)).toEqual(['C', 'A', 'B']);

    const secondMove = await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: b._id.toString(),
      expectedVersion: firstMove.body.data.version,
    }).expect(200);
    expect(await taskTitles(owner, boardId)).toEqual(['A', 'C', 'B']);

    await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: null,
      expectedVersion: secondMove.body.data.version,
    }).expect(200);
    expect(await taskTitles(owner, boardId)).toEqual(['A', 'B', 'C']);
  });

  it('chuyển cột và append vào cột đích', async () => {
    const { owner, boardId, a } = await setupTasks();

    await move(owner, boardId, a._id.toString(), {
      columnId: 'done',
      beforeTaskId: null,
      expectedVersion: a.version,
    }).expect(200);

    const tasks = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(
      tasks.body.data.find((task: { _id: string }) => task._id === a._id.toString()),
    ).toMatchObject({ columnId: 'done' });
  });

  it('beforeTaskId sai/khác cột/chính task trả 422', async () => {
    const { owner, boardId, a, b } = await setupTasks();

    await move(owner, boardId, a._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: a.version,
    }).expect(422);

    await move(owner, boardId, a._id.toString(), {
      columnId: 'done',
      beforeTaskId: b._id.toString(),
      expectedVersion: a.version,
    }).expect(422);

    await move(owner, boardId, a._id.toString(), {
      columnId: 'todo',
      beforeTaskId: '000000000000000000000000',
      expectedVersion: a.version,
    }).expect(422);
  });

  it('move cùng vị trí hiện tại không tăng version', async () => {
    const { owner, boardId, a, b } = await setupTasks();

    const response = await move(owner, boardId, a._id.toString(), {
      columnId: 'todo',
      beforeTaskId: b._id.toString(),
      expectedVersion: a.version,
    }).expect(200);

    expect(response.body.data.version).toBe(a.version);
    expect(await taskTitles(owner, boardId)).toEqual(['A', 'B', 'C']);
  });

  it('version cũ trả 409 và không đổi thứ tự', async () => {
    const { owner, boardId, a, c } = await setupTasks();

    await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: c.version,
    }).expect(200);

    const stale = await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: c.version,
    }).expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await taskTitles(owner, boardId)).toEqual(['C', 'A', 'B']);
  });

  it('unique index chặn order trùng', async () => {
    const { boardId, a } = await setupTasks();

    await expect(
      TaskModel.create({
        boardId,
        columnId: 'todo',
        order: a.order,
        title: 'Duplicate',
        description: 'test',
        assigneeId: null,
        labels: [],
        priority: 'medium',
        dueDate: null,
        lifecycle: 'active',
        sourceItemId: null,
        origin: null,
        version: 1,
        createdBy: a.createdBy,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
