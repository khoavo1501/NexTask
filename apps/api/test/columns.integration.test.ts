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

type OwnerAgent = Awaited<ReturnType<typeof registerAgent>>;

async function setupBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Columns' }).expect(201);
  return { owner, boardId: board.body.data._id as string, board: board.body.data };
}

async function currentColumns(owner: OwnerAgent, boardId: string) {
  const board = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
  return board.body.data as {
    version: number;
    columns: Array<{ id: string; name: string; order: number; isDone: boolean }>;
  };
}

function editableColumns(columns: Array<{ id: string; name: string; isDone: boolean }>) {
  return columns.map(({ id, name, isDone }) => ({ id, name, isDone }));
}

describe('columns', () => {
  it('thêm cột, giữ id cũ, tăng version', async () => {
    const { owner, boardId, board } = await setupBoard();
    const columns: Array<{ id?: string; name: string; isDone: boolean }> = board.columns.map(
      (column: { id: string; name: string; isDone: boolean }) => ({
        id: column.id,
        name: column.name,
        isDone: column.isDone,
      }),
    );
    columns.push({ name: 'QA', isDone: false });

    const updated = await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version })
      .expect(200);

    expect(updated.body.data.version).toBe(board.version + 1);
    expect(updated.body.data.columns).toHaveLength(6);
    expect(updated.body.data.columns[0].id).toBe('backlog');
    expect(updated.body.data.columns[5].id).toMatch(/^col-/);
    expect(updated.body.data.columns[5].order).toBe(5);
  });

  it('rename/reorder giữ task columnId', async () => {
    const { owner, boardId } = await setupBoard();
    const task = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Task' })
      .expect(201);
    const current = await currentColumns(owner, boardId);
    const reordered = editableColumns(current.columns)
      .slice()
      .reverse()
      .map((column) => (column.id === 'todo' ? { ...column, name: 'Việc cần làm' } : column));

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: reordered, expectedVersion: current.version })
      .expect(200);

    const after = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(
      after.body.data.find((entry: { _id: string }) => entry._id === task.body.data._id),
    ).toMatchObject({ columnId: 'todo' });
    expect((await currentColumns(owner, boardId)).columns[0]?.id).toBe('done');
  });

  it('xóa cột rỗng được, cột còn task bị chặn', async () => {
    const { owner, boardId } = await setupBoard();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Còn task' })
      .expect(201);

    const current = await currentColumns(owner, boardId);
    const withoutTodo = editableColumns(current.columns).filter((column) => column.id !== 'todo');
    const blocked = await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: withoutTodo, expectedVersion: current.version })
      .expect(409);
    expect(blocked.body.error).toMatchObject({
      code: 'COLUMN_NOT_EMPTY',
      details: { columnId: 'todo', taskCount: 1 },
    });

    const afterBlocked = await currentColumns(owner, boardId);
    const withoutBacklog = editableColumns(afterBlocked.columns).filter(
      (column) => column.id !== 'backlog',
    );
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: withoutBacklog, expectedVersion: afterBlocked.version })
      .expect(200);
  });

  it('member bị 403, stale board 409, sai Done 422', async () => {
    const { owner, boardId, board } = await setupBoard();
    const member = await registerAgent(app, 'member@example.com', 'Member');
    await BoardModel.updateOne(
      { _id: boardId },
      {
        $push: {
          members: { userId: member.user._id, role: 'member', joinedAt: new Date() },
        },
      },
    );

    const columns = editableColumns(board.columns);
    await member.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version })
      .expect(403);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version + 1 })
      .expect(409);

    const twoDone = columns.map((column) => ({ ...column, isDone: true }));
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: twoDone, expectedVersion: board.version })
      .expect(422);

    const firstColumn = columns[0];
    if (!firstColumn) throw new Error('Missing first column');
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: [firstColumn], expectedVersion: board.version })
      .expect(422);
  });
});
