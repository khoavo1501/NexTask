# Phase 8C - Cursor pagination và text search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm cursor keyset pagination cho `GET /tasks`, chuyển `q` sang MongoDB text index, và cập nhật Kanban để tải thêm trang, khóa kéo thả khi dữ liệu chưa tải đủ.

**Architecture:** Cursor base64url mã hóa `{columnId, order, _id}`; server dùng keyset `$or`, giữ sort `columnId/order/_id`. Migration 008 tạo compound text index `{boardId, lifecycle, title, description}` với `default_language: "none"`. Client tải trang đầu, nút `Tải thêm` append có dedupe; mutation/realtime reset trang đầu.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, MongoDB 8 replica set, Zod 4, Next.js App Router, Vitest 5, Playwright 1.65.

**Spec:** `docs/phases/08c-cursor-text-search.md`

## Global Constraints

- Branch `feat/phase-8c-cursor-text-search`, tạo từ `release/v0.8`; không merge `main`, không bump `0.8.0`, không tag, không push.
- Commit identity từng lệnh: `khoavo1501 <khoamiden15012005@gmail.com>`.
- Chỉ stage đường dẫn cụ thể; không `git add -A`, không `git add .`.
- Test API dùng MongoDB replica set thật, không mock database; không nới timeout để test xanh.
- Full suite chạy ba lần tại feature gate và release gate; kèm typecheck/lint/format/build:web và Playwright.
- Backup trước migration 008 lên app DB; rehearsal trên database tạm rồi drop.
- Không xóa dữ liệu người dùng, backup hoặc Mongo volume.
- Prose tiếng Việt; quét CJK trước khi commit tài liệu.

---

## File Structure

- `packages/contracts/src/task.ts` - `cursor`, `nextCursor`, `taskCursorSchema`.
- `apps/api/src/db/migrations/008-phase-8c.ts` - text index migration.
- `apps/api/src/db/migration-runner.ts` - đăng ký migration 008.
- `apps/api/src/modules/tasks/task.service.ts` - cursor decode/encode, `$text`, keyset query.
- `apps/api/src/modules/tasks/task.router.ts` - nhận cursor, trả nextCursor.
- `apps/web/lib/api.ts` - `getTasks` nhận cursor/trả nextCursor.
- `apps/web/features/workspace/board-workspace.tsx` - state cursor/loadingMore, load more, reset.
- `apps/web/features/workspace/kanban-board.tsx` - nút Tải thêm, khóa drag, hint.
- `apps/api/test/task-contracts.test.ts` - contract cursor.
- `apps/api/test/migrations.integration.test.ts` - migration 008.
- `apps/api/test/indexes.integration.test.ts` - text index.
- `apps/api/test/task-filters.integration.test.ts` - q token semantics.
- `apps/api/test/task-pagination.integration.test.ts` - cursor/text/explain mới.

---

### Task 1: Contracts cursor và nextCursor

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Modify: `apps/api/test/task-contracts.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: `taskCursorSchema`; `taskListQuerySchema` có `cursor`; `tasksListResponseSchema.meta.nextCursor`.

- [ ] **Step 1: Viết failing contract test**

Thêm vào `apps/api/test/task-contracts.test.ts` import:

```ts
import {
  createTaskRequestSchema,
  moveTaskRequestSchema,
  taskCursorSchema,
  taskListQuerySchema,
  taskPrioritySchema,
  tasksListResponseSchema,
  updateTaskRequestSchema,
} from '@nextask/contracts';
```

Thêm test:

```ts
  it('cursor và nextCursor contract', () => {
    expect(
      taskCursorSchema.parse({
        columnId: 'todo',
        order: 'a0',
        id: '000000000000000000000001',
      }),
    ).toEqual({
      columnId: 'todo',
      order: 'a0',
      id: '000000000000000000000001',
    });
    expect(taskListQuerySchema.parse({ cursor: 'opaque' }).cursor).toBe('opaque');
    const body = tasksListResponseSchema.parse({
      data: [],
      meta: { requestId: 'req', hasMore: false, nextCursor: null },
    });
    expect(body.meta.nextCursor).toBeNull();
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/task-contracts.test.ts`

Expected: FAIL vì chưa có `taskCursorSchema`/`nextCursor`.

- [ ] **Step 3: Cập nhật contracts**

Trong `packages/contracts/src/task.ts`, thêm trước `taskListQuerySchema`:

```ts
export const taskCursorSchema = z.object({
  columnId: z.string().min(1).max(50),
  order: z.string().min(1).max(100),
  id: objectIdSchema,
});
```

Thêm `cursor` vào query:

```ts
  cursor: z.string().min(1).max(500).optional(),
```

Đổi response:

```ts
export const tasksListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema.extend({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});
```

Thêm type:

```ts
export type TaskCursor = z.infer<typeof taskCursorSchema>;
```

- [ ] **Step 4: Chạy test**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/task-contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/task.ts apps/api/test/task-contracts.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task cursor contracts"
```

---

### Task 2: Migration 008 và text index

**Files:**
- Create: `apps/api/src/db/migrations/008-phase-8c.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`
- Modify: `apps/api/test/indexes.integration.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: index `tasks_board_text`; migration `008-phase-8c`; `MIGRATION_008_NAME`.

- [ ] **Step 1: Viết failing migration/index test**

Trong `apps/api/test/migrations.integration.test.ts`, thêm `MIGRATION_008_NAME` vào import, thêm vào test idempotent:

```ts
    expect(migrations).not.toContain(MIGRATION_008_NAME);
```

Đổi assertion schema version thành:

```ts
    await expect(assertSchemaVersion(connection, MIGRATION_008_NAME)).resolves.toBeUndefined();
```

Thêm test trước dấu `});` cuối file:

```ts
  it('008 tạo text index task và default language none', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const indexes = await connection.db.collection('tasks').indexes();
    const text = indexes.find((index) => index.name === 'tasks_board_text');
    expect(text).toMatchObject({
      key: { boardId: 1, lifecycle: 1, _fts: 'text', _ftsx: 1 },
      weights: { title: 1, description: 1 },
      default_language: 'none',
    });
  });
```

Trong `apps/api/test/indexes.integration.test.ts`, thêm test:

```ts
  it('có text index title/description cho tìm kiếm', async () => {
    const indexes = await TaskModel.collection.indexes();
    const text = indexes.find((entry) => entry.name === 'tasks_board_text');
    expect(text).toMatchObject({
      key: { boardId: 1, lifecycle: 1, _fts: 'text', _ftsx: 1 },
      default_language: 'none',
    });
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/indexes.integration.test.ts`

Expected: FAIL vì chưa có migration/index.

- [ ] **Step 3: Tạo migration 008**

Tạo `apps/api/src/db/migrations/008-phase-8c.ts`:

```ts
import type { Migration, MigrationOptions } from '../migration-runner.js';

export const phase8cMigration: Migration = {
  name: '008-phase-8c',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    await db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, title: 'text', description: 'text' },
      { name: 'tasks_board_text', default_language: 'none' },
    );
  },
};
```

- [ ] **Step 4: Đăng ký migration**

Trong `apps/api/src/db/migration-runner.ts`, thêm import:

```ts
import { phase8cMigration } from './migrations/008-phase-8c.js';
```

Thêm hằng số:

```ts
export const MIGRATION_008_NAME = '008-phase-8c';
export const LATEST_MIGRATION_NAME = MIGRATION_008_NAME;
```

và thêm `phase8cMigration` vào cuối mảng `migrations`.

- [ ] **Step 5: Chạy test**

Run: `npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/indexes.integration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/migrations/008-phase-8c.ts apps/api/src/db/migration-runner.ts apps/api/test/migrations.integration.test.ts apps/api/test/indexes.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task text index migration"
```

---

### Task 3: Cursor pagination, text search và router

**Files:**
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Modify: `apps/api/test/task-filters.integration.test.ts`
- Create: `apps/api/test/task-pagination.integration.test.ts`

**Interfaces:**
- Consumes: `taskCursorSchema`, `TaskCursor`, index 008.
- Produces: `TaskListOptions.cursor`; `TaskListResult.nextCursor`; `q` dùng `$text`; response có `nextCursor`.

- [ ] **Step 1: Cập nhật failing test tìm kiếm**

Trong `apps/api/test/task-filters.integration.test.ts`, đổi task Daily có description chứa token:

```ts
  await create('Daily C++ (urgent)', 'a0', {
    description: 'context in description',
    assigneeId: member.user._id,
    labels: ['bug', 'ux'],
    priority: 'high',
  });
```

Đổi test q hiện tại thành:

```ts
    const byQuery = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'urgent' })
      .expect(200);
    expect(byQuery.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Daily C++ (urgent)',
    ]);

    const byDescription = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'context' })
      .expect(200);
    expect(byDescription.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Daily C++ (urgent)',
    ]);
```

- [ ] **Step 2: Viết failing pagination test**

Tạo `apps/api/test/task-pagination.integration.test.ts`:

```ts
import pino from 'pino';
import { Types } from 'mongoose';
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
  const member = await registerAgent(app, 'member@example.com', 'Member');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Paging' }).expect(201);
  const boardId = board.body.data._id as string;

  await TaskModel.insertMany(
    Array.from({ length: 5 }, (_, index) => ({
      boardId,
      columnId: 'todo',
      order: `a${index}`,
      title: `Task ${index}`,
      description: index < 3 ? `context ${index}` : 'other',
      assigneeId: index === 0 ? member.user._id : null,
      labels: index === 0 ? ['bug'] : [],
      priority: index < 2 ? 'high' : 'low',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: owner.user._id,
    })),
  );

  return { owner, member, boardId };
}

describe('task pagination và text search', () => {
  it('cursor trả đủ 3 trang không duplicate', async () => {
    const { owner, boardId } = await setupTasks();

    const first = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2 })
      .expect(200);
    expect(first.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Task 0',
      'Task 1',
    ]);
    expect(first.body.meta.hasMore).toBe(true);
    expect(typeof first.body.meta.nextCursor).toBe('string');

    const second = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2, cursor: first.body.meta.nextCursor })
      .expect(200);
    expect(second.body.data.map((task: { title: string }) => task.title)).toEqual([
      'Task 2',
      'Task 3',
    ]);

    const third = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ limit: 2, cursor: second.body.meta.nextCursor })
      .expect(200);
    expect(third.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 4']);
    expect(third.body.meta.hasMore).toBe(false);
    expect(third.body.meta.nextCursor).toBeNull();
  });

  it('cursor kết hợp priority/labels/assignee và q', async () => {
    const { owner, member, boardId } = await setupTasks();

    const high = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'high', limit: 1 })
      .expect(200);
    expect(high.body.data).toHaveLength(1);
    const highNext = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ priority: 'high', limit: 1, cursor: high.body.meta.nextCursor })
      .expect(200);
    expect(highNext.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 1']);

    const labels = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ labels: 'bug', limit: 1 })
      .expect(200);
    expect(labels.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 0']);
    expect(labels.body.meta.nextCursor).toBeNull();

    const assignee = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ assigneeId: member.user._id, limit: 1 })
      .expect(200);
    expect(assignee.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 0']);

    const search = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'context', limit: 2 })
      .expect(200);
    expect(search.body.data).toHaveLength(2);
    const searchNext = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ q: 'context', limit: 2, cursor: search.body.meta.nextCursor })
      .expect(200);
    expect(searchNext.body.data.map((task: { title: string }) => task.title)).toEqual(['Task 2']);
  });

  it('cursor sai trả 422 INVALID_CURSOR', async () => {
    const { owner, boardId } = await setupTasks();

    const invalid = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ cursor: 'not-a-cursor' })
      .expect(422);
    expect(invalid.body.error.code).toBe('INVALID_CURSOR');

    const malformed = Buffer.from('{"columnId":"todo"}').toString('base64url');
    const malformedResponse = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .query({ cursor: malformed })
      .expect(422);
    expect(malformedResponse.body.error.code).toBe('INVALID_CURSOR');
  });

  it('explain q dùng text index', async () => {
    const { boardId } = await setupTasks();
    const explain = await TaskModel.collection
      .find({
        boardId: new Types.ObjectId(boardId),
        lifecycle: 'active',
        $text: { $search: 'context', $language: 'none' },
      })
      .sort({ columnId: 1, order: 1, _id: 1 })
      .explain('executionStats');
    const plan = JSON.stringify(explain);
    expect(plan).toContain('tasks_board_text');
    expect(plan).toContain('TEXT_MATCH');
  });
});
```

`Types` được import ở đầu file; không dùng dynamic import.

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/task-filters.integration.test.ts test/task-pagination.integration.test.ts`

Expected: FAIL vì `listTasks` chưa nhận cursor, `$text` và router chưa trả `nextCursor`.

- [ ] **Step 4: Cập nhật task.service**

Trong `apps/api/src/modules/tasks/task.service.ts`, đổi import contract:

```ts
import { taskCursorSchema, type TaskCursor } from '@nextask/contracts';
```

Thêm `cursor?: string` vào `TaskListOptions` và `nextCursor` vào `TaskListResult`:

```ts
export interface TaskListOptions {
  columnId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  labels: string[];
  q?: string;
  limit: number;
  cursor?: string;
}

export interface TaskListResult {
  tasks: TaskDocument[];
  hasMore: boolean;
  nextCursor: string | null;
}
```

Thay `escapeRegex` bằng:

```ts
function decodeTaskCursor(value: string): TaskCursor {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return taskCursorSchema.parse(JSON.parse(decoded));
  } catch {
    throw new AppError(422, 'INVALID_CURSOR', 'Cursor không hợp lệ');
  }
}

function encodeTaskCursor(task: TaskDocument): string {
  return Buffer.from(
    JSON.stringify({
      columnId: task.columnId,
      order: task.order,
      id: task._id.toHexString(),
    }),
    'utf8',
  ).toString('base64url');
}
```

Thay phần q và query trong `listTasks` bằng:

```ts
  const q = options.q?.trim();
  if (q) {
    filter.$text = { $search: q, $language: 'none' };
  }

  if (options.cursor) {
    const cursor = decodeTaskCursor(options.cursor);
    filter.$and = [
      {
        $or: [
          { columnId: { $gt: cursor.columnId } },
          { columnId: cursor.columnId, order: { $gt: cursor.order } },
          {
            columnId: cursor.columnId,
            order: cursor.order,
            _id: { $gt: new Types.ObjectId(cursor.id) },
          },
        ],
      },
    ];
  }

  const tasks = await TaskModel.find(filter)
    .sort({ columnId: 1, order: 1, _id: 1 })
    .limit(options.limit + 1)
    .exec();
  const page = tasks.slice(0, options.limit);
  const hasMore = tasks.length > options.limit;
  const last = page[page.length - 1];

  return {
    tasks: page,
    hasMore,
    nextCursor: hasMore && last ? encodeTaskCursor(last) : null,
  };
```

- [ ] **Step 5: Cập nhật router**

Trong `apps/api/src/modules/tasks/task.router.ts`, thêm `cursor` vào input `listTasks`:

```ts
      cursor: query.cursor,
```

và response meta:

```ts
      meta: {
        requestId: request.requestId,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
```

- [ ] **Step 6: Chạy test**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/task-filters.integration.test.ts test/task-pagination.integration.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tasks/task.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/task-filters.integration.test.ts apps/api/test/task-pagination.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task cursor pagination and text search"
```

---

### Task 4: Web load more và drag lock

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/features/workspace/kanban-board.tsx`

**Interfaces:**
- Consumes: API `nextCursor`, `limit`, `cursor`.
- Produces: `loadMoreTasks`; `nextTaskCursor`; `Tải thêm`; drag lock khi `hasMore`.

- [ ] **Step 1: Cập nhật web API**

Trong `apps/web/lib/api.ts`, thêm `cursor?: string` vào `TaskListFilters` và response:

```ts
export interface TaskListFilters {
  q?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  columnId?: string;
  labels?: string;
  limit?: number;
  cursor?: string;
}

export async function getTasks(
  boardId: string,
  filters: TaskListFilters = {},
): Promise<{ tasks: TaskDto[]; hasMore: boolean; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.columnId) params.set('columnId', filters.columnId);
  if (filters.labels) params.set('labels', filters.labels);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const body = await request(`/boards/${boardId}/tasks${suffix}`, tasksListResponseSchema);
  return { tasks: body.data, hasMore: body.meta.hasMore, nextCursor: body.meta.nextCursor };
}
```

- [ ] **Step 2: Cập nhật workspace state/load**

Trong `apps/web/features/workspace/board-workspace.tsx`, thêm state:

```ts
  const [nextTaskCursor, setNextTaskCursor] = useState<string | null>(null);
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
```

Trong `loadWorkspace`, sau `setHasMoreTasks(taskPage.hasMore);` thêm:

```ts
      setNextTaskCursor(taskPage.nextCursor);
```

Thay `loadTasks` bằng:

```ts
  const loadTasks = useCallback(
    async (currentFilters: KanbanFilters, cursor: string | null = null) => {
      const requestId = taskRequestRef.current + 1;
      taskRequestRef.current = requestId;

      try {
        const page = await getTasks(boardId, {
          q: currentFilters.q.trim() || undefined,
          assigneeId: currentFilters.assigneeId || undefined,
          priority: currentFilters.priority || undefined,
          cursor: cursor ?? undefined,
        });
        if (requestId !== taskRequestRef.current) return;
        setData((current) => {
          if (!current) return current;
          if (!cursor) return { ...current, tasks: page.tasks };
          const existing = new Set(current.tasks.map((task) => task._id));
          return {
            ...current,
            tasks: [...current.tasks, ...page.tasks.filter((task) => !existing.has(task._id))],
          };
        });
        setHasMoreTasks(page.hasMore);
        setNextTaskCursor(page.nextCursor);
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

  const loadMoreTasks = useCallback(async () => {
    if (!nextTaskCursor || loadingMoreTasks) return;
    setLoadingMoreTasks(true);
    try {
      await loadTasks(filters, nextTaskCursor);
    } finally {
      setLoadingMoreTasks(false);
    }
  }, [filters, loadTasks, loadingMoreTasks, nextTaskCursor]);
```

Trong `refreshRealtimeSnapshot`, thêm:

```ts
    setNextTaskCursor(taskPage.nextCursor);
```

- [ ] **Step 3: Reset trang sau mutation/realtime**

Trong các handler thành công của promote, batch promote, demote, undo promote và move, thêm
`await loadTasks(filters);` sau cập nhật state. Cụ thể:

- `handlePromote`: sau `setNotice('Đã promote ghi chú thành task');`.
- `handleBatchPromote`: sau `setNotice(...)`.
- `handleDemote`: sau `setNotice('Đã demote task; note vẫn còn trên whiteboard.');`.
- `handleUndoPromote`: sau `setNotice('Đã hoàn tác promote.');`.
- `handleMoveTask`: sau `setData(...)` cập nhật task đã move.

Thêm `filters, loadTasks` vào dependency array của các callback trên nếu chưa có.

Trong `handleRealtimeEvent`, thay khối xử lý task event hiện tại bằng:

```ts
      if (event.type.startsWith('task:')) {
        setNotice('Kanban vừa thay đổi từ tab/người khác. Đã tải lại.');
        setActivityRevision((value) => value + 1);
        void loadTasks(filters);
        return;
      }
```

và thêm `filters, loadTasks` vào dependency array của `handleRealtimeEvent`.

- [ ] **Step 4: Cập nhật KanbanBoard props và drag lock**

Trong `apps/web/features/workspace/kanban-board.tsx`, thêm props:

```ts
  loadingMore: boolean;
  onLoadMore: () => void;
```

Trong destructuring thêm `loadingMore`, `onLoadMore`.

Thêm:

```ts
  const dragLocked = filtersActive || hasMore;
```

Đổi mọi guard drag/drop từ `filtersActive` thành `dragLocked` (column `onDragOver`, `onDrop`, article `draggable`, `onDragStart`, `onDragOver`, `onDrop`), và class `cursor-default` dùng `dragLocked`.

Thêm sau hint filter:

```tsx
        {!filtersActive && hasMore ? (
          <p className="mt-2 text-[11px] text-stone-500">Tải hết task để kéo thả.</p>
        ) : null}
        {hasMore ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingMore ? 'Đang tải...' : 'Tải thêm'}
            </button>
          </div>
        ) : null}
```

Xóa hint cũ `Còn task chưa tải; thu hẹp bộ lọc để xem thêm.`.

Trong `dropTask`, thêm guard đầu hàm:

```ts
    if (dragLocked) return;
```

- [ ] **Step 5: Truyền props từ workspace**

Trong `apps/web/features/workspace/board-workspace.tsx`, chỗ render `KanbanBoard`, thêm:

```tsx
                loadingMore={loadingMoreTasks}
                onLoadMore={loadMoreTasks}
```

- [ ] **Step 6: Chạy typecheck và build web**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build:web`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/board-workspace.tsx apps/web/features/workspace/kanban-board.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: load more task pages and lock drag"
```

---

### Task 5: Rehearsal, explain và browser verification

**Files:**
- Không tạo file code; evidence ghi vào `docs/phases/08c-cursor-text-search.md` và `docs/mongodb-notes.md` ở Task 6.
- Có thể dùng browser verification tool có sẵn.

**Interfaces:**
- Consumes: migration 008, API/UI Task 1-4.
- Produces: app DB áp 008; explain table; browser evidence 120 task.

Điều kiện: `.env` local tồn tại; nếu chưa có thì `cp .env.example .env` (dev-only). Chạy
`npm run db:seed` nếu board demo `NexTask Demo Retro` chưa có.

- [ ] **Step 1: Backup app DB**

Run:

```bash
npm run db:backup -- before-8c
gzip -t backups/nextask-before-8c-*.gz
ls -lh backups/nextask-before-8c-*.gz
```

Expected: file backup và `gzip -t` pass. Ghi tên/kích thước.

- [ ] **Step 2: Rehearsal migration 008**

Run:

```bash
docker compose build migrate
archive="$(ls -t backups/nextask-before-8c-*.gz | head -n 1)"
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_8c_rehearsal").dropDatabase()'
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_8c_rehearsal.*' < "$archive"
docker compose run --rm --no-deps -e MONGODB_URI='mongodb://mongo:27017/nextask_8c_rehearsal?replicaSet=rs0' migrate
```

Kiểm tra:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_8c_rehearsal");
printjson({
  tasks: db.tasks.countDocuments(),
  textIndex: db.tasks.getIndexes().find((index) => index.name === "tasks_board_text"),
  migrations: db.schema_migrations.find().sort({ _id: 1 }).toArray().map((m) => m._id),
});
'
```

Expected: có `008-phase-8c`, text index `default_language: "none"`. Drop rehearsal:

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_8c_rehearsal").dropDatabase()'
```

- [ ] **Step 3: Áp app DB và rebuild Docker**

Run:

```bash
npm run db:migrate
docker compose build migrate api web
docker compose up -d --force-recreate migrate api web
docker compose ps
curl -s http://localhost:4000/api/v1/health
```

Expected: health `0.7.0`, text index có trong app DB.

- [ ] **Step 4: Explain 1000 task**

Run script MongoDB tạm:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_explain_8c");
db.dropDatabase();
const boardId = ObjectId();
db.tasks.createIndex(
  { boardId: 1, lifecycle: 1, title: "text", description: "text" },
  { name: "tasks_board_text", default_language: "none" },
);
db.tasks.insertMany(Array.from({ length: 1000 }, (_, index) => ({
  boardId,
  columnId: "todo",
  order: `z${String(index).padStart(4, "0")}`,
  title: index % 2 === 0 ? `Context task ${index}` : `Other task ${index}`,
  description: "demo",
  assigneeId: null,
  labels: [],
  priority: "medium",
  dueDate: null,
  lifecycle: "active",
  sourceItemId: null,
  origin: null,
  version: 1,
  createdBy: ObjectId(),
  createdAt: new Date(),
  updatedAt: new Date(),
})));
const textExplain = db.tasks.find({
  boardId,
  lifecycle: "active",
  $text: { $search: "context", $language: "none" },
}).sort({ columnId: 1, order: 1, _id: 1 }).explain("executionStats");
const cursorExplain = db.tasks.find({
  boardId,
  lifecycle: "active",
  columnId: "todo",
  $and: [{ $or: [
    { columnId: { $gt: "todo" } },
    { columnId: "todo", order: { $gt: "z0500" } },
  ] }],
}).sort({ columnId: 1, order: 1, _id: 1 }).limit(100).explain("executionStats");
printjson({
  text: {
    plan: textExplain.queryPlanner.winningPlan.stage,
    keys: textExplain.executionStats.totalKeysExamined,
    docs: textExplain.executionStats.totalDocsExamined,
    ms: textExplain.executionStats.executionTimeMillis,
  },
  cursor: {
    plan: cursorExplain.queryPlanner.winningPlan.stage,
    keys: cursorExplain.executionStats.totalKeysExamined,
    docs: cursorExplain.executionStats.totalDocsExamined,
    ms: cursorExplain.executionStats.executionTimeMillis,
  },
});
db.dropDatabase();
'
```

Ghi lại index/keys/docs/ms thực tế. Nếu explain không dùng `tasks_board_text`, dừng và sửa query/index.

- [ ] **Step 5: Browser 120 task**

Tạo board tạm và 120 task bằng Mongo, dùng owner seed hiện có:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const owner = db.users.findOne({ emailNormalized: "owner@nextask.local" });
const demo = db.boards.findOne({ name: "NexTask Demo Retro" });
const boardId = new ObjectId();
db.boards.insertOne({
  ...demo,
  _id: boardId,
  name: "Cursor 120",
  ownerId: owner._id,
  members: [{ userId: owner._id, role: "owner", joinedAt: new Date() }],
  createdAt: new Date(),
  updatedAt: new Date(),
});
db.tasks.insertMany(Array.from({ length: 120 }, (_, index) => ({
  boardId,
  columnId: "todo",
  order: `z${String(index).padStart(4, "0")}`,
  title: `Cursor task ${index}`,
  description: "",
  assigneeId: null,
  labels: [],
  priority: "medium",
  dueDate: null,
  lifecycle: "active",
  sourceItemId: null,
  origin: null,
  version: 1,
  createdBy: owner._id,
  createdAt: new Date(),
  updatedAt: new Date(),
})));
printjson({ boardId });
'
```

Mở board `Cursor 120` trong browser với owner, kiểm tra:

- Trang đầu có 100 task và nút `Tải thêm`.
- Bấm `Tải thêm`: đủ 120 task, nút biến mất.
- Chọn filter bất kỳ: hint filter xuất hiện, danh sách reset trang đầu.
- Xóa filter: hint biến mất; khi còn trang, hint `Tải hết task để kéo thả.` xuất hiện;
  sau khi tải hết, có thể kéo task.
- Chụp screenshot trước/sau khi bấm `Tải thêm`.

Dọn board tạm:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const board = db.boards.findOne({ name: "Cursor 120" });
if (board) {
  db.tasks.deleteMany({ boardId: board._id });
  db.boards.deleteOne({ _id: board._id });
}
'
```

- [ ] **Step 6: Chạy Playwright smoke**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 7: Chưa commit**

Evidence dùng cho Task 6.

---

### Task 6: Gates, docs và merge release/v0.8

**Files:**
- Modify: `docs/phases/08c-cursor-text-search.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/session-log.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/mongodb-notes.md`

**Interfaces:**
- Consumes: evidence Task 5.
- Produces: docs hoàn chỉnh; feature merge `release/v0.8`; release gate pass.

- [ ] **Step 1: Chạy feature gate**

Run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build:web
npm run test
npm run test
npm run test
npm run test:e2e
```

Expected: pass; ghi số file/test và ba duration thực tế.

- [ ] **Step 2: Cập nhật phase doc**

Trong `docs/phases/08c-cursor-text-search.md`:

- Đổi trạng thái thành `Hoàn thành, chờ merge release/v0.8`.
- Thêm `## 13. Kiểm chứng` với:
  - backup file/size;
  - rehearsal counts, migration 008, text index;
  - app DB migration/index;
  - explain table thực tế;
  - browser 120 task (trang đầu 100, tải thêm đủ 120, drag lock);
  - feature gate counts/durations.

- [ ] **Step 3: Cập nhật README/architecture/session log/git workflow/MongoDB notes**

README:

- Thêm bullet Phase 8C:
  `Phase 8C: cursor pagination task, nút Tải thêm, drag lock khi còn trang, text index title/description.`
- Đổi câu còn lại thành `Đã có cursor pagination và text index; các phase sau mở rộng báo cáo/search.`
- Cập nhật số file/test theo gate.
- Thêm link `[Phase 8C](docs/phases/08c-cursor-text-search.md)`.
- Trong Git: `Phase 8C đã merge vào release/v0.8; chưa merge main, chưa bump 0.8.0.`
- Ghi rõ `q` là token search, không substring.

Architecture:

- Trạng thái ngày `2026-11-18`; thêm câu Phase 8C cursor + text index; xem
  `docs/phases/08c-cursor-text-search.md`.
- Roadmap row 8C đổi thành nội dung đã hoàn thành.

Session log/git workflow:

- Thêm mục feature gate với số liệu thực tế; chờ merge.

MongoDB notes:

- Thêm `## 19. Quan sát Giai đoạn 8C` với backup, rehearsal, index metadata, explain
  table và browser evidence.

- [ ] **Step 4: Quét CJK và commit docs**

Run:

```bash
grep -nP '[\x{4E00}-\x{9FFF}\x{3040}-\x{30FF}]' README.md docs/phases/08c-cursor-text-search.md docs/architecture.md docs/session-log.md docs/git-workflow.md docs/mongodb-notes.md
```

Expected: không có output (hoặc chỉ sửa nếu có).

Commit:

```bash
git add docs/phases/08c-cursor-text-search.md README.md docs/architecture.md docs/session-log.md docs/git-workflow.md docs/mongodb-notes.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 8c verification"
```

- [ ] **Step 5: Merge feature vào release**

Run:

```bash
git checkout release/v0.8
git status --short
git merge --no-ff feat/phase-8c-cursor-text-search -m "merge: phase 8c cursor and text search"
git log --oneline -3
```

- [ ] **Step 6: Release gate**

Run trên `release/v0.8`:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build:web
npm run test
npm run test
npm run test
npm run test:e2e
curl -s http://localhost:4000/api/v1/health
```

Expected: pass; health `0.7.0`; ghi counts/durations.

- [ ] **Step 7: Ghi release gate và xóa feature**

Cập nhật `docs/session-log.md` và `docs/git-workflow.md` với merge hash/release gate thực tế, commit:

```bash
git add docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 8c release gate"
git branch -d feat/phase-8c-cursor-text-search
git status --short
git log --oneline -3
```

Expected: feature đã xóa; working tree sạch; `main` và tag `v0.7` không đổi; chưa bump
`0.8.0`; không push.

---

## Self-Review Notes

- Spec coverage: contracts Task 1; index/migration Task 2; cursor + `$text` + router Task 3;
  UI load more/drag lock Task 4; backup/rehearsal/explain/browser Task 5; gates/docs/merge Task 6.
- Type names thống nhất: `TaskCursor`, `taskCursorSchema`, `nextCursor`, `nextTaskCursor`,
  `loadingMoreTasks`, `MIGRATION_008_NAME`.
- Không có placeholder trong code step; các bước evidence yêu cầu ghi số liệu thực tế từ output lệnh.
