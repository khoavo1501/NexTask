# NexTask Phase 3A - Kanban Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Thêm fractional ordering thật sự, filter/search phía server, unique order index và UI kéo thả/filter cho Kanban, giữ OCC và dữ liệu hiện có.

**Architecture:** Server tự sinh `order` bằng `fractional-indexing` từ `beforeTaskId`; client không gửi key. Migration 003 backfill order trùng, đổi index Kanban thành unique partial và thêm index filter. `GET /tasks` nhận filter có kiểm tra zod, trả tối đa 100 task kèm `meta.hasMore`; UI kéo thả trong/giữa cột và filter bar. Chưa sửa/tạo task, chưa cursor pagination.

**Tech Stack:** Node 26, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, fractional-indexing 4.0.0, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5.

**Spec:** `docs/phases/03a-kanban-ordering.md`

**Branch:** `feat/phase-3a-kanban-ordering` từ `release/v0.3`; release tạo từ `main` tại `da0547a` (v0.2.0). Không merge `main` trong phase này.

## Global Constraints

- Node 26, TypeScript 6.0.3 strict; giữ cấu trúc monorepo hiện có.
- MongoDB replica set thật cho integration test; không mock DB, không nới timeout test.
- Giữ dữ liệu ứng dụng: không xóa collection/volume; task không trùng order không bị đổi.
- `order` do server sinh; client không bao giờ gửi order.
- Move task bắt buộc `expectedVersion`; stale trả `409 VERSION_CONFLICT`.
- Trùng fractional key: retry một lần; vẫn trùng trả `409 ORDER_CONFLICT`.
- Unique partial index `tasks_kanban_order` cho task active; filter indexes assignee/priority/labels.
- `GET /tasks` tối đa 100 task, `meta.hasMore`; chưa cursor pagination.
- Filter `q` phải escape regex, tối đa 100 ký tự; không nhận raw Mongo operator.
- UI khóa kéo thả khi filter đang bật.
- Backup trước migration thật; rehearsal trên database copy.
- Git local, không push/tag/amend/đổi config.
- Identity commit theo lệnh:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage bằng đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Không merge `release/v0.3` vào `main`; tag `v0.2.0` giữ nguyên.

---

### Task 0: Docs baseline và plan

**Files:**
- Modify: `docs/phases/03a-kanban-ordering.md`
- Create: `docs/superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: spec 3A đã được duyệt.
- Produces: plan 3A và baseline tài liệu trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git switch feat/phase-3a-kanban-ordering
git status --short --branch
git log --oneline -1
```

Expected: đang ở `feat/phase-3a-kanban-ordering`; HEAD `097d789`; working tree sạch.

- [ ] **Step 2: Xác nhận spec status**

Trong `docs/phases/03a-kanban-ordering.md`, đảm bảo đầu file có:

```markdown
- Trạng thái: Đã duyệt spec; implementation plan:
  [2026-11-10-phase-3a-kanban-ordering.md](../superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md)
```

và `Implementation plan` trỏ tới plan này.

- [ ] **Step 3: Ghi baseline git/session**

Trong `docs/git-workflow.md`, mục 1 ghi:

```markdown
- `main` tại `da0547a`, tag `v0.2.0`.
- `release/v0.3` tạo từ `main`; chưa có commit riêng.
- Feature đang mở: `feat/phase-3a-kanban-ordering`.
```

Thêm vào `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 3A plan

- Spec `docs/phases/03a-kanban-ordering.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md`.
- Phạm vi: move ordering, filter/limit, migration 003, UI kéo thả/filter, explain.
- Chưa code; chờ chọn cách thực thi plan.
```

- [ ] **Step 4: Commit**

```bash
git add docs/phases/03a-kanban-ordering.md docs/superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md docs/git-workflow.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 3a kanban ordering"
```

---

### Task 1: Contracts cho move/filter và ORDER_CONFLICT

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Modify: `packages/contracts/src/version.ts`
- Modify: `apps/api/src/lib/versioning.ts`
- Modify: `apps/api/test/versioning.test.ts`
- Create: `apps/api/test/task-contracts.test.ts`

**Interfaces:**
- Produces:
  - `taskPrioritySchema`, `TaskPriority`
  - `moveTaskRequestSchema` với `beforeTaskId: string | null`
  - `taskListQuerySchema`, `TaskListQuery`
  - `tasksListResponseSchema`
  - `ORDER_CONFLICT_CODE = 'ORDER_CONFLICT'`
  - `orderConflict(columnId: string): AppError`

- [ ] **Step 1: Viết test contract thất bại**

`apps/api/test/task-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  moveTaskRequestSchema,
  taskListQuerySchema,
  taskPrioritySchema,
} from '@nextask/contracts';

describe('task contracts', () => {
  it('move mặc định beforeTaskId null và bắt buộc expectedVersion', () => {
    expect(
      moveTaskRequestSchema.parse({ columnId: 'todo', expectedVersion: 2 }),
    ).toEqual({ columnId: 'todo', beforeTaskId: null, expectedVersion: 2 });

    expect(() => moveTaskRequestSchema.parse({ columnId: 'todo' })).toThrow();
  });

  it('parse filter hợp lệ', () => {
    expect(
      taskListQuerySchema.parse({
        columnId: 'todo',
        assigneeId: 'none',
        priority: 'high',
        labels: 'bug,ux',
        q: '  daily  ',
        limit: '25',
      }),
    ).toEqual({
      columnId: 'todo',
      assigneeId: 'none',
      priority: 'high',
      labels: 'bug,ux',
      q: 'daily',
      limit: 25,
    });
  });

  it('từ chối priority/limit/assignee sai', () => {
    expect(() => taskPrioritySchema.parse('critical')).toThrow();
    expect(() => taskListQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => taskListQuerySchema.parse({ assigneeId: 'bad' })).toThrow();
  });
});
```

Thêm vào `apps/api/test/versioning.test.ts`:

```ts
import { orderConflict } from '../src/lib/versioning.js';

it('orderConflict trả 409 ORDER_CONFLICT kèm columnId', () => {
  const error = orderConflict('todo');
  expect(error.status).toBe(409);
  expect(error.code).toBe('ORDER_CONFLICT');
  expect(error.details).toEqual({ columnId: 'todo' });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-contracts.test.ts test/versioning.test.ts
```

Expected: FAIL vì schema/helper chưa có.

- [ ] **Step 3: Cập nhật contracts**

Trong `packages/contracts/src/task.ts`:

```ts
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

// taskSchema dùng taskPrioritySchema thay enum inline
priority: taskPrioritySchema,

export const moveTaskRequestSchema = z.object({
  columnId: z.string().min(1),
  beforeTaskId: objectIdSchema.nullable().default(null),
  expectedVersion: z.number().int().positive(),
});

export const taskListQuerySchema = z.object({
  columnId: z.string().min(1).max(50).optional(),
  assigneeId: z.union([objectIdSchema, z.literal('none')]).optional(),
  priority: taskPrioritySchema.optional(),
  labels: z.string().max(500).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const tasksListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema.extend({ hasMore: z.boolean() }),
});

export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
```

Giữ `tasksResponseSchema` nếu còn dùng; nếu không còn sau web update thì xóa ở Task 5.

Trong `packages/contracts/src/version.ts`:

```ts
export const ORDER_CONFLICT_CODE = 'ORDER_CONFLICT' as const;

export const orderConflictDetailsSchema = z.object({
  columnId: z.string().min(1),
});

export type OrderConflictDetails = z.infer<typeof orderConflictDetailsSchema>;
```

Trong `apps/api/src/lib/versioning.ts`:

```ts
import {
  ORDER_CONFLICT_CODE,
  VERSION_CONFLICT_CODE,
  type OrderConflictDetails,
  type VersionConflictDetails,
} from '@nextask/contracts';

export function orderConflict(columnId: string): AppError {
  const details: OrderConflictDetails = { columnId };
  return new AppError(
    409,
    ORDER_CONFLICT_CODE,
    'Vị trí vừa thay đổi, vui lòng tải lại',
    details,
  );
}
```

- [ ] **Step 4: Chạy test và typecheck**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-contracts.test.ts test/versioning.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/task.ts packages/contracts/src/version.ts apps/api/src/lib/versioning.ts apps/api/test/task-contracts.test.ts apps/api/test/versioning.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task ordering contracts"
```

---

### Task 2: Migration 003 - order unique và filter indexes

**Files:**
- Create: `apps/api/src/db/migrations/003-phase-3a.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`
- Modify: `apps/api/test/indexes.integration.test.ts`

**Interfaces:**
- Consumes: `Migration`, `MigrationOptions`.
- Produces:
  - `MIGRATION_003_NAME = '003-phase-3a'`
  - `LATEST_MIGRATION_NAME = MIGRATION_003_NAME`
  - Index order unique + 3 index filter.

- [ ] **Step 1: Viết test migration thất bại**

`apps/api/test/migrations.integration.test.ts`:

- Import `MIGRATION_003_NAME`.
- Trước `runMigrations`, thêm hai task order trùng ở cột `backlog`, order `b0`
  (không đụng task legacy `todo/a0`):

```ts
await TaskModel.create([
  {
    boardId: legacyBoardId,
    columnId: 'backlog',
    order: 'b0',
    title: 'Duplicate order 1',
    description: 'duplicate',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: new Types.ObjectId(legacyOwnerId),
  },
  {
    boardId: legacyBoardId,
    columnId: 'backlog',
    order: 'b0',
    title: 'Duplicate order 2',
    description: 'duplicate',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: new Types.ObjectId(legacyOwnerId),
  },
]);
```

- Thêm test:

```ts
it('003 backfill order trùng và tạo unique index', async () => {
  if (!connection.db) throw new Error('DB chưa kết nối');

  const tasks = await connection.db
    .collection('tasks')
    .find({ lifecycle: 'active' })
    .sort({ boardId: 1, columnId: 1, order: 1, _id: 1 })
    .toArray();
  const orders = tasks.map((task) => `${task.boardId}:${task.columnId}:${task.order}`);
  expect(new Set(orders).size).toBe(orders.length);

  const indexes = await TaskModel.collection.indexes();
  const orderIndex = indexes.find((index) => index.name === 'tasks_kanban_order');
  expect(orderIndex).toMatchObject({
    unique: true,
    partialFilterExpression: { lifecycle: 'active' },
  });
  for (const name of ['tasks_board_assignee', 'tasks_board_priority', 'tasks_board_labels']) {
    expect(indexes.some((index) => index.name === name), name).toBe(true);
  }
  await expect(assertSchemaVersion(connection, MIGRATION_003_NAME)).resolves.toBeUndefined();
});
```

- Đổi idempotent test để `expect(migrations).not.toContain(MIGRATION_003_NAME)`.

Trong `apps/api/test/indexes.integration.test.ts`, thêm assert index order unique và filter indexes.

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/indexes.integration.test.ts
```

Expected: FAIL vì migration 003 chưa có.

- [ ] **Step 3: Tạo migration 003**

`apps/api/src/db/migrations/003-phase-3a.ts`:

```ts
import { generateKeyBetween } from 'fractional-indexing';
import type { Migration, MigrationOptions } from '../migration-runner.js';

async function dropIndexIfExists(
  options: MigrationOptions,
  collectionName: string,
  indexName: string,
): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const collection = db.collection(collectionName);
  try {
    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === indexName)) {
      await collection.dropIndex(indexName);
    }
  } catch (error) {
    if ((error as { codeName?: string }).codeName === 'NamespaceNotFound') return;
    throw error;
  }
}

async function backfillDuplicateOrders(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const collection = db.collection('tasks');
  const tasks = await collection
    .find({ lifecycle: 'active' })
    .sort({ boardId: 1, columnId: 1, order: 1, _id: 1 })
    .toArray();

  let previousGroup = '';
  let previousOrder: string | null = null;

  for (const task of tasks) {
    const group = `${String(task.boardId)}:${String(task.columnId)}`;
    const order = String(task.order);
    if (group === previousGroup && order === previousOrder) {
      const nextOrder = generateKeyBetween(previousOrder, null);
      await collection.updateOne(
        { _id: task._id },
        { $set: { order: nextOrder, updatedAt: new Date() }, $inc: { version: 1 } },
      );
      previousOrder = nextOrder;
      continue;
    }
    previousGroup = group;
    previousOrder = order;
  }
}

async function ensureIndexes(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  await dropIndexIfExists(options, 'tasks', 'tasks_kanban_order');
  await Promise.all([
    db.collection('tasks').createIndex(
      { boardId: 1, columnId: 1, order: 1 },
      {
        unique: true,
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_kanban_order',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, assigneeId: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_assignee',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, priority: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_priority',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, labels: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_labels',
      },
    ),
  ]);
}

export const phase3aMigration: Migration = {
  name: '003-phase-3a',
  async up(options) {
    await backfillDuplicateOrders(options);
    await ensureIndexes(options);
  },
};
```

- [ ] **Step 4: Nối migration/startup**

`apps/api/src/db/migration-runner.ts`:

```ts
import { phase3aMigration } from './migrations/003-phase-3a.js';

export const MIGRATION_003_NAME = '003-phase-3a';
export const LATEST_MIGRATION_NAME = MIGRATION_003_NAME;

const migrations: Migration[] = [
  phase2aMigration,
  phase2bMigration,
  phase3aMigration,
];
```

`apps/api/src/server.ts` đã dùng `LATEST_MIGRATION_NAME`, không cần đổi.

- [ ] **Step 5: Reset test DB và chạy migration test**

Vì test DB đang có 002, 003 sẽ tự áp; nếu sửa validator/index sau khi 003 đã ghi, drop test DB rồi chạy lại.

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_phase2_test").dropDatabase()'
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/indexes.integration.test.ts
```

Expected: pass; duplicate order được backfill; unique index và filter indexes tồn tại.

- [ ] **Step 6: Full suite**

```bash
npm run test
```

Expected: pass; test cũ tạo task order duy nhất nên không bị unique index chặn.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/migrations/003-phase-3a.ts apps/api/src/db/migration-runner.ts apps/api/src/server.ts apps/api/test/migrations.integration.test.ts apps/api/test/indexes.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add phase 3a order indexes"
```

---

### Task 3: Move API với beforeTaskId

**Files:**
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Create: `apps/api/test/tasks.integration.test.ts`
- Modify: `apps/api/test/concurrency.integration.test.ts`
- Modify: `apps/api/test/membership.integration.test.ts`
- Modify: `apps/api/test/promotion.integration.test.ts`

**Interfaces:**
- Consumes: `moveTaskRequestSchema` với `beforeTaskId`, `orderConflict`.
- Produces:
  - `POST /boards/:boardId/tasks/:taskId/move`
  - `moveTask(board, taskId, input)` chèn theo `beforeTaskId`.
  - `PATCH /tasks/:taskId` không còn move.

- [ ] **Step 1: Viết test move thất bại**

`apps/api/test/tasks.integration.test.ts`:

```ts
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
      description: '',
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

type RegisteredAgent = Awaited<ReturnType<typeof registerAgent>>;

async function move(
  owner: RegisteredAgent,
  boardId: string,
  taskId: string,
  body: { columnId: string; beforeTaskId: string | null; expectedVersion: number },
) {
  return owner.agent
    .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
    .send(body);
}

describe('task ordering', () => {
  it('chèn đầu, giữa và cuối cột', async () => {
    const { owner, boardId, a, b, c } = await setupTasks();

    const firstMove = await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: c.version,
    }).expect(200);

    const first = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(first.body.data.map((task: { title: string }) => task.title)).toEqual([
      'C',
      'A',
      'B',
    ]);

    const secondMove = await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: b._id.toString(),
      expectedVersion: firstMove.body.data.version,
    }).expect(200);

    const second = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(second.body.data.map((task: { title: string }) => task.title)).toEqual([
      'A',
      'C',
      'B',
    ]);

    await move(owner, boardId, c._id.toString(), {
      columnId: 'todo',
      beforeTaskId: null,
      expectedVersion: secondMove.body.data.version,
    }).expect(200);

    const third = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(third.body.data.map((task: { title: string }) => task.title)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('chuyển cột và append vào cột đích', async () => {
    const { owner, boardId, a } = await setupTasks();

    await move(owner, boardId, a._id.toString(), {
      columnId: 'done',
      beforeTaskId: null,
      expectedVersion: a.version,
    }).expect(200);

    const tasks = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(tasks.body.data.find((task: { _id: string }) => task._id === a._id.toString()))
      .toMatchObject({ columnId: 'done' });
  });

  it('beforeTaskId sai/khác cột/chính task trả 422', async () => {
    const { owner, boardId, a } = await setupTasks();

    await move(owner, boardId, a._id.toString(), {
      columnId: 'todo',
      beforeTaskId: a._id.toString(),
      expectedVersion: a.version,
    }).expect(422);

    await move(owner, boardId, a._id.toString(), {
      columnId: 'done',
      beforeTaskId: a._id.toString(),
      expectedVersion: a.version,
    }).expect(422);

    await move(owner, boardId, a._id.toString(), {
      columnId: 'todo',
      beforeTaskId: '000000000000000000000000',
      expectedVersion: a.version,
    }).expect(422);
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

    const tasks = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(tasks.body.data.map((task: { title: string }) => task.title)).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('unique index chặn order trùng', async () => {
    const { boardId, a } = await setupTasks();
    await expect(
      TaskModel.create({
        boardId,
        columnId: 'todo',
        order: a.order,
        title: 'Duplicate',
        description: '',
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
```

Cập nhật test cũ:

- `concurrency.integration.test.ts`: mọi `.patch(.../tasks/:id)` đổi thành
  `.post(.../tasks/:id/move)` và body giữ `columnId`, `expectedVersion`.
- `membership.integration.test.ts` và `promotion.integration.test.ts`: tương tự.

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/tasks.integration.test.ts
```

Expected: FAIL vì route POST move chưa có và PATCH cũ chưa nhận beforeTaskId.

- [ ] **Step 3: Sửa task service**

Thay `moveTask` trong `apps/api/src/modules/tasks/task.service.ts`:

```ts
function isDuplicateKeyError(error: unknown): boolean {
  const direct = error as { code?: number };
  if (direct.code === 11_000) return true;
  const writeErrors = (error as { writeErrors?: Array<{ err?: { code?: number } }> })
    .writeErrors;
  return writeErrors?.[0]?.err?.code === 11_000;
}

async function resolveOrder(
  board: BoardDocument,
  task: TaskDocument,
  targetColumnId: string,
  beforeTaskId: string | null,
): Promise<string> {
  let beforeTask: TaskDocument | null = null;
  if (beforeTaskId) {
    beforeTask = await TaskModel.findOne({
      _id: beforeTaskId,
      boardId: board._id,
      columnId: targetColumnId,
      lifecycle: 'active',
    }).exec();
    if (!beforeTask) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Task mốc không tồn tại trong cột đích');
    }
  }

  const prevTask = await TaskModel.findOne({
    boardId: board._id,
    columnId: targetColumnId,
    lifecycle: 'active',
    _id: { $ne: task._id },
    ...(beforeTask ? { order: { $lt: beforeTask.order } } : {}),
  })
    .sort({ order: -1 })
    .exec();

  return generateKeyBetween(prevTask?.order ?? null, beforeTask?.order ?? null);
}

export async function moveTask(
  board: BoardDocument,
  taskId: string,
  input: MoveTaskRequest,
): Promise<TaskDocument> {
  if (!Types.ObjectId.isValid(taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const targetColumn = board.columns.find((column) => column.id === input.columnId);
  if (!targetColumn) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  if (input.beforeTaskId === taskId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Không thể chèn task trước chính nó');
  }

  let task = await TaskModel.findOne({
    _id: taskId,
    boardId: board._id,
    lifecycle: 'active',
  }).exec();
  if (!task) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }
  if (task.version !== input.expectedVersion) {
    throw versionConflict(task.version);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await resolveOrder(board, task, targetColumn.id, input.beforeTaskId);
    if (task.columnId === targetColumn.id && order === task.order) {
      return task;
    }

    try {
      const updated = await TaskModel.findOneAndUpdate(
        {
          _id: task._id,
          boardId: board._id,
          lifecycle: 'active',
          version: input.expectedVersion,
        },
        { $set: { columnId: targetColumn.id, order }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      ).exec();
      if (!updated) {
        const current = await TaskModel.findOne({
          _id: task._id,
          boardId: board._id,
          lifecycle: 'active',
        }).exec();
        if (!current) {
          throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
        }
        throw versionConflict(current.version);
      }
      return updated;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (attempt === 1) throw orderConflict(targetColumn.id);

      const current = await TaskModel.findById(task._id).exec();
      if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
      }
      if (current.version !== input.expectedVersion) {
        throw versionConflict(current.version);
      }
      task = current;
    }
  }

  throw orderConflict(targetColumn.id);
}
```

Thêm import `orderConflict` vào `versioning` import.

- [ ] **Step 4: Sửa router**

`apps/api/src/modules/tasks/task.router.ts`:

```ts
router.post('/:taskId/move', async (request, response) => {
  if (!request.board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  const params = request.params as { taskId?: string };
  if (!params.taskId) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const input = moveTaskRequestSchema.parse(request.body);
  const task = await moveTask(request.board, params.taskId, input);
  response.json({
    data: serializeTask(task),
    meta: { requestId: request.requestId },
  });
});
```

Xóa route `router.patch('/:taskId', ...)` cũ.

- [ ] **Step 5: Chạy test move và regression**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/tasks.integration.test.ts test/concurrency.integration.test.ts test/membership.integration.test.ts test/promotion.integration.test.ts
```

Expected: pass; POST move hoạt động; PATCH cũ không còn dùng.

- [ ] **Step 6: Full suite**

```bash
npm run test
```

Expected: pass toàn bộ 2A/2B/3A tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tasks/task.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/tasks.integration.test.ts apps/api/test/concurrency.integration.test.ts apps/api/test/membership.integration.test.ts apps/api/test/promotion.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: support task ordering by beforeTaskId"
```

---

### Task 4: Filter/search task list

**Files:**
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Create: `apps/api/test/task-filters.integration.test.ts`

**Interfaces:**
- Consumes: `taskListQuerySchema` từ Task 1.
- Produces:
  - `TaskListOptions`, `TaskListResult`
  - `listTasks(board, options)` trả `{ tasks, hasMore }`
  - `GET /tasks` filter + `meta.hasMore`.

- [ ] **Step 1: Viết test filter thất bại**

`apps/api/test/task-filters.integration.test.ts`:

```ts
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
      description: '',
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
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-filters.integration.test.ts
```

Expected: FAIL vì route chưa parse filter/response chưa hasMore.

- [ ] **Step 3: Sửa service listTasks**

Trong `apps/api/src/modules/tasks/task.service.ts`:

```ts
import type { FilterQuery } from 'mongoose';
import type { Task } from './task.model.js';

export interface TaskListOptions {
  columnId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  labels: string[];
  q?: string;
  limit: number;
}

export interface TaskListResult {
  tasks: TaskDocument[];
  hasMore: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listTasks(
  board: BoardDocument,
  options: TaskListOptions,
): Promise<TaskListResult> {
  if (options.columnId && !board.columns.some((column) => column.id === options.columnId)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột lọc không tồn tại');
  }

  const filter: FilterQuery<Task> = {
    boardId: board._id,
    lifecycle: 'active',
  };
  if (options.columnId) filter.columnId = options.columnId;
  if (options.assigneeId === 'none') {
    filter.assigneeId = null;
  } else if (options.assigneeId) {
    filter.assigneeId = new Types.ObjectId(options.assigneeId);
  }
  if (options.priority) filter.priority = options.priority;
  if (options.labels.length > 0) filter.labels = { $all: options.labels };
  const q = options.q?.trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const tasks = await TaskModel.find(filter)
    .sort({ columnId: 1, order: 1, _id: 1 })
    .limit(options.limit + 1)
    .exec();

  return {
    tasks: tasks.slice(0, options.limit),
    hasMore: tasks.length > options.limit,
  };
}
```

Import `TaskPriority` từ contracts.

- [ ] **Step 4: Sửa router GET tasks**

`apps/api/src/modules/tasks/task.router.ts`:

```ts
import { taskListQuerySchema, moveTaskRequestSchema, type TaskDto } from '@nextask/contracts';

router.get('/', async (request, response) => {
  if (!request.board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }

  const query = taskListQuerySchema.parse(request.query);
  const labels = (query.labels ?? '')
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  if (labels.length > 10 || labels.some((label) => label.length > 50)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc label không hợp lệ');
  }

  const result = await listTasks(request.board, {
    columnId: query.columnId,
    assigneeId: query.assigneeId,
    priority: query.priority,
    labels,
    q: query.q,
    limit: query.limit,
  });
  const data: TaskDto[] = result.tasks.map(serializeTask);
  response.json({
    data,
    meta: { requestId: request.requestId, hasMore: result.hasMore },
  });
});
```

- [ ] **Step 5: Chạy test filter và full suite**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-filters.integration.test.ts
npm run test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tasks/task.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/task-filters.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task filters and hasMore"
```

---

### Task 5: Web - API client, filter bar, drag ordering

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/features/workspace/kanban-board.tsx`

**Interfaces:**
- Consumes: move/filter contracts từ Task 1/4.
- Produces:
  - `getTasks` trả `{ tasks, hasMore }`
  - `getBoardMembers`
  - `moveTask` POST `/move`
  - Kanban filter bar và drag `beforeTaskId`.

- [ ] **Step 1: Cập nhật API client**

`apps/web/lib/api.ts`:

```ts
import {
  boardMembersResponseSchema,
  tasksListResponseSchema,
  type BoardMemberDetailDto,
  type TaskPriority,
} from '@nextask/contracts';

export interface TaskListFilters {
  q?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  columnId?: string;
  labels?: string;
  limit?: number;
}

export async function getTasks(
  boardId: string,
  filters: TaskListFilters = {},
): Promise<{ tasks: TaskDto[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.columnId) params.set('columnId', filters.columnId);
  if (filters.labels) params.set('labels', filters.labels);
  if (filters.limit) params.set('limit', String(filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const body = await request(
    `/boards/${boardId}/tasks${suffix}`,
    tasksListResponseSchema,
  );
  return { tasks: body.data, hasMore: body.meta.hasMore };
}

export async function getBoardMembers(boardId: string): Promise<BoardMemberDetailDto[]> {
  return (await request(`/boards/${boardId}/members`, boardMembersResponseSchema)).data;
}

export function isOrderConflict(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'ORDER_CONFLICT';
}

export async function moveTask(
  boardId: string,
  taskId: string,
  input: MoveTaskRequest,
): Promise<TaskDto> {
  return (
    await request(`/boards/${boardId}/tasks/${taskId}/move`, taskResponseSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  ).data;
}
```

Xóa `tasksResponseSchema` nếu không còn dùng; cập nhật import.

- [ ] **Step 2: Cập nhật workspace**

`apps/web/features/workspace/board-workspace.tsx`:

- Import `getBoardMembers`, `getTasks`, `isOrderConflict`, type `BoardMemberDetailDto`,
  type `TaskPriority`, type `KanbanFilters` từ Kanban.
- `WorkspaceData` thêm `members: BoardMemberDetailDto[]`.
- `loadWorkspace` thêm `getBoardMembers(boardId)` và `getTasks(boardId)` (không filter)
  vào `Promise.all`:

```ts
const [board, items, members, taskPage] = await Promise.all([
  getBoard(boardId),
  getItems(boardId),
  getBoardMembers(boardId),
  getTasks(boardId),
]);
setData({ board, items, members, tasks: taskPage.tasks });
setHasMoreTasks(taskPage.hasMore);
```

- State:

```ts
const [filters, setFilters] = useState<KanbanFilters>({
  q: '',
  assigneeId: '',
  priority: '',
});
const [hasMoreTasks, setHasMoreTasks] = useState(false);
const taskRequestRef = useRef(0);
```

- `loadTasks`:

```ts
const loadTasks = useCallback(
  async (currentFilters: KanbanFilters) => {
    const requestId = taskRequestRef.current + 1;
    taskRequestRef.current = requestId;
    try {
      const page = await getTasks(boardId, {
        q: currentFilters.q.trim() || undefined,
        assigneeId: currentFilters.assigneeId || undefined,
        priority: currentFilters.priority || undefined,
      });
      if (requestId !== taskRequestRef.current) return;
      setData((current) => (current ? { ...current, tasks: page.tasks } : current));
      setHasMoreTasks(page.hasMore);
    } catch (caught) {
      if (requestId !== taskRequestRef.current) return;
      setNotice(
        caught instanceof ApiClientError
          ? caught.message
          : 'Không tải được danh sách task đã lọc.',
      );
    }
  },
  [boardId],
);
```

- Debounce effect:

```ts
useEffect(() => {
  const timer = setTimeout(() => {
    void loadTasks(filters);
  }, 300);
  return () => clearTimeout(timer);
}, [filters, loadTasks]);
```

- `handleMoveTask` signature:

```ts
async (
  taskId: string,
  columnId: string,
  beforeTaskId: string | null,
  expectedVersion: number,
) => {
  setNotice(null);
  try {
    const moved = await moveTask(boardId, taskId, {
      columnId,
      beforeTaskId,
      expectedVersion,
    });
    // replace task in data
  } catch (caught) {
    if (isVersionConflict(caught) || isOrderConflict(caught)) {
      setNotice('Kanban vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
      await loadWorkspace();
      await loadTasks(filters);
      return;
    }
    setNotice(...);
  }
}
```

- Truyền `members={data.members}`, `filters`, `onFiltersChange={setFilters}`,
  `hasMore={hasMoreTasks}`, `onMoveTask={handleMoveTask}`.

- [ ] **Step 3: Cập nhật Kanban**

`apps/web/features/workspace/kanban-board.tsx`:

- Thêm:

```ts
export interface KanbanFilters {
  q: string;
  assigneeId: string;
  priority: '' | TaskPriority;
}

interface KanbanBoardProps {
  board: BoardDto;
  tasks: TaskDto[];
  members: BoardMemberDetailDto[];
  filters: KanbanFilters;
  hasMore: boolean;
  onFiltersChange: (filters: KanbanFilters) => void;
  onMoveTask: (
    taskId: string,
    columnId: string,
    beforeTaskId: string | null,
    expectedVersion: number,
  ) => Promise<void>;
}
```

- `filtersActive = filters.q.trim() !== '' || filters.assigneeId !== '' || filters.priority !== ''`.
- Filter bar trong `<header>`: input search, select assignee (members + `Chưa gán`),
  select priority, nút xóa. `onChange` gọi `onFiltersChange({ ...filters, ... })`.
- Thêm `hasMore` notice dưới header.
- Thêm state:

```ts
const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
```

- Card:
  - `draggable={!filtersActive}`.
  - `onDragStart`: nếu `filtersActive` return; set dragging; dataTransfer.
  - `onDragOver`: nếu filtersActive return; `event.preventDefault(); event.stopPropagation(); setDragOverTaskId(task._id);`
  - `onDragLeave`: clear if same.
  - `onDrop`: `event.preventDefault(); event.stopPropagation(); dropTask(task.columnId, task._id, task._id);`
    `beforeTaskId` là card đích; nếu kéo chính nó, server no-op.
- Column `onDrop`: append `beforeTaskId = null`; `dropTask(column.id, null)`.
- `dropTask`:

```ts
function dropTask(columnId: string, beforeTaskId: string | null, draggedId = draggingTaskId) {
  if (!draggedId || beforeTaskId === draggedId) return;
  const task = tasks.find((entry) => entry._id === draggedId);
  if (!task) return;
  void onMoveTask(draggedId, columnId, beforeTaskId, task.version);
  setDraggingTaskId(null);
  setDragOverColumn(null);
  setDragOverTaskId(null);
}
```

- Card display: priority, labels chips, assignee name từ `members`, due date.
- Hint khi filtersActive: "Xóa bộ lọc để kéo thả."

- [ ] **Step 4: Typecheck và build**

```bash
npm run typecheck
npm run build:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/board-workspace.tsx apps/web/features/workspace/kanban-board.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add kanban filters and drag ordering"
```

---

### Task 6: Migration rehearsal, explain và browser verification

**Files:**
- Modify: `docs/mongodb-notes.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: migration 003, API/UI 3A.
- Produces: app DB migrated 003, explain evidence, browser evidence.

- [ ] **Step 1: Backup app DB**

```bash
docker compose exec -T mongo mongodump --db nextask --archive --gzip > backups/nextask-before-3a-2026-11-10.gz
gzip -t backups/nextask-before-3a-2026-11-10.gz
ls -lh backups/nextask-before-3a-2026-11-10.gz
```

- [ ] **Step 2: Rehearsal**

```bash
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_3a_rehearsal.*' < backups/nextask-before-3a-2026-11-10.gz
docker compose build migrate
docker compose run --rm -e MONGODB_URI='mongodb://mongo:27017/nextask_3a_rehearsal?replicaSet=rs0' migrate
```

Expected: `applied: ["003-phase-3a"]`.

- [ ] **Step 3: Verify rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_3a_rehearsal");
printjson({
  counts: { tasks: db.tasks.countDocuments(), boards: db.boards.countDocuments(), items: db.items.countDocuments() },
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
  indexes: db.tasks.getIndexes().map(index => index.name).sort(),
});
'
```

Expected: 003; `tasks_kanban_order` unique; 3 filter indexes; counts không đổi.

- [ ] **Step 4: Apply to app DB**

```bash
docker compose up --build -d
docker compose logs --no-color migrate | tail -5
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: 003 applied; services healthy; version vẫn `0.2.0` (chưa bump v0.3).

- [ ] **Step 5: Drop rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_3a_rehearsal").dropDatabase()'
```

- [ ] **Step 6: Explain evidence**

Tạo DB tạm với 1000 task và index giống app:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_explain");
db.dropDatabase();
const boardId = ObjectId();
const userId = ObjectId();
const rows = [];
for (let i = 0; i < 1000; i += 1) {
  rows.push({
    boardId,
    columnId: ["backlog","todo","in-progress","review","done"][i % 5],
    order: String(i).padStart(6, "0"),
    title: "Task " + i + (i % 7 === 0 ? " C++" : ""),
    description: "description " + i,
    assigneeId: i % 3 === 0 ? null : new ObjectId(),
    labels: i % 4 === 0 ? ["bug","ux"] : ["ops"],
    priority: ["low","medium","high","urgent"][i % 4],
    dueDate: null,
    lifecycle: "active",
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
db.tasks.insertMany(rows);
db.tasks.createIndex({ boardId: 1, columnId: 1, order: 1 }, { unique: true, partialFilterExpression: { lifecycle: "active" }, name: "tasks_kanban_order" });
db.tasks.createIndex({ boardId: 1, lifecycle: 1, assigneeId: 1, columnId: 1, order: 1 }, { partialFilterExpression: { lifecycle: "active" }, name: "tasks_board_assignee" });
db.tasks.createIndex({ boardId: 1, lifecycle: 1, priority: 1, columnId: 1, order: 1 }, { partialFilterExpression: { lifecycle: "active" }, name: "tasks_board_priority" });
db.tasks.createIndex({ boardId: 1, lifecycle: 1, labels: 1, columnId: 1, order: 1 }, { partialFilterExpression: { lifecycle: "active" }, name: "tasks_board_labels" });
for (const [name, query] of [
  ["all", { boardId, lifecycle: "active" }],
  ["assignee", { boardId, lifecycle: "active", assigneeId: rows[1].assigneeId }],
  ["priority", { boardId, lifecycle: "active", priority: "high" }],
  ["labels", { boardId, lifecycle: "active", labels: "bug" }],
  ["q", { boardId, lifecycle: "active", title: /C\+\+/i }],
]) {
  const plan = db.tasks.find(query).sort({ columnId: 1, order: 1, _id: 1 }).explain("executionStats");
  print(name, JSON.stringify({ winningPlan: plan.queryPlanner.winningPlan, executionStats: plan.executionStats }));
}
db.dropDatabase();
'
```

- Ghi kết quả thật vào `docs/mongodb-notes.md`: index được chọn và
  `totalKeysExamined`/`totalDocsExamined`/`executionTimeMillis` cho từng query.
- Nếu planner chọn COLLSCAN trên dữ liệu nhỏ, ghi rõ đó là dữ liệu tạm 1000 task và
  index tương ứng.

- [ ] **Step 7: Browser golden path**

Dùng browser-use:

1. Đăng nhập seed owner; mở board.
2. Kéo task cuối cột lên đầu cột; reload; thứ tự giữ nguyên.
3. Kéo task sang cột khác, thả lên một card; reload; đúng vị trí trước card mốc.
4. Filter search, assignee, priority; kiểm tra số card.
5. Khi filter bật, thử kéo: không move; hint hiển thị.
6. Xóa filter; kéo thả hoạt động lại.
7. Ghi network response move 200 và 409 nếu thử conflict.

- [ ] **Step 8: Commit evidence docs**

```bash
git add docs/mongodb-notes.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 3a migration and explain"
```

---

### Task 7: Quality gates, docs và merge release/v0.3

**Files:**
- Modify: `docs/phases/03a-kanban-ordering.md`
- Modify: `docs/superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: 3A code, migration, explain, browser evidence.
- Produces: 3A hoàn tất trên `release/v0.3`; feature xóa; main và tag v0.2.0 không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: trạng thái hoàn thành, kết quả migration/test/browser.
- Plan: trạng thái thực thi + commit list.
- Architecture: Phase 3A complete, endpoint move/filter/index.
- MongoDB notes: explain/kết quả 003.
- README: Phase 3A, move/filter behavior, no cursor.
- Git workflow: release/v0.3, feature merge, main/tag unchanged.
- Session log: gate và merge.

- [ ] **Step 2: Full gate trên feature**

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test
npm run test
```

Expected: pass cả ba lần; ghi thời gian.

- [ ] **Step 3: Commit docs**

```bash
git add docs/phases/03a-kanban-ordering.md docs/superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 3a verification"
```

- [ ] **Step 4: Merge feature vào release**

```bash
git switch release/v0.3
git merge --no-ff feat/phase-3a-kanban-ordering -m "merge: phase 3a kanban ordering"
```

- [ ] **Step 5: Gate trên release**

```bash
git status --short --branch
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test
npm run test
```

- [ ] **Step 6: Xóa feature**

```bash
git branch -d feat/phase-3a-kanban-ordering
git branch -vv
git log --oneline -1 main
```

Expected: feature xóa; release chứa 3A; main vẫn `da0547a`; tag `v0.2.0` trỏ `da0547a`.

- [ ] **Step 7: Không merge main**

Không chạy merge `release/v0.3` vào `main`. Ghi trạng thái chờ duyệt v0.3 vào session
log và báo lại cuối phiên.

---

## Self-review checklist

- Spec coverage:
  - `POST /move` + `beforeTaskId`: Task 3.
  - Fractional index/no bulk: Task 3.
  - Unique + filter indexes, backfill: Task 2.
  - Filter/search/limit/hasMore: Task 4.
  - UI filter + drag + khóa khi filter: Task 5.
  - Migration backup/rehearsal: Task 6.
  - Explain: Task 6.
  - Quality gate/merge release: Task 7.
- Không có placeholder `TBD/TODO`.
- Tên type/field thống nhất: `beforeTaskId`, `ORDER_CONFLICT`, `TaskListOptions`,
  `TaskListResult`, `hasMore`, `KanbanFilters`, `getBoardMembers`.
- Không task nào merge `main`; tag v0.2.0 giữ nguyên.
