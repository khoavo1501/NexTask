# NexTask Phase 3B - Task Editing and Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Thêm tạo/sửa task tay và quản lý cột của Owner, giữ OCC, fractional order và dữ liệu hiện có.

**Architecture:** Thêm `POST /tasks` append cuối cột, `PATCH /tasks/:taskId` sửa field nội dung, và `PATCH /boards/:boardId/columns` thay thế danh sách cột (Owner). Task/board dùng `expectedVersion`; cột còn task active bị chặn bằng `409 COLUMN_NOT_EMPTY`. UI thêm dialog tạo/sửa task và dialog quản lý cột. Không migration, không cursor/text index.

**Tech Stack:** Node 26, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, fractional-indexing 4.0.0, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5.

**Spec:** `docs/phases/03b-task-editing-columns.md`

**Branch:** `feat/phase-3b-task-editing` từ `release/v0.3`. Không merge `main` trong phase này.

**Trạng thái thực thi:** Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.3` bằng
`--no-ff` (`463a294`); feature branch đã xóa. Commit chính:

- `0619149` `docs: specify phase 3b task editing and columns`
- `f165947` `docs: plan phase 3b task editing and columns`
- `8ea9f32` `docs: start phase 3b execution`
- `ed6375b` `feat: add task editing contracts`
- `cde3356` `feat: create kanban tasks manually`
- `c45eeaf` `feat: edit kanban tasks`
- `ae1bd52` `feat: manage board columns`
- `1926b59` `style: format phase 3b api files`
- `8a92808` `feat: add task and column dialogs`
- `b376b74` `docs: record phase 3b verification`
- `a6deac7` `docs: record phase 3b verification`
- `463a294` `merge: phase 3b task editing and columns` vào `release/v0.3`

Release gate: typecheck/lint/format pass; full suite 99 test ba lần 14.52/14.40/14.32 s.

**Điều chỉnh thực tế:**

- Bỏ `required` của `tasks.description` để task tạo tay có description rỗng hợp lệ; không
  cần migration vì `$jsonSchema` đã cho string.
- Column manager hiển thị lỗi `COLUMN_NOT_EMPTY` tại dialog; version conflict đóng và
  reload.
- Browser dùng board tạm `Phase 3B E2E`; board/task/item của nó đã xóa sau test.
- Member UI không test bằng browser vì cần đăng nhập lại; API test 403 là nguồn chính.
- Không cursor/text index, không migration, không bump version.

## Global Constraints

- Node 26, TypeScript 6.0.3 strict; giữ cấu trúc monorepo hiện có.
- MongoDB replica set thật cho integration test; không mock DB, không nới timeout test.
- Không migration mới; `LATEST_MIGRATION_NAME` vẫn `003-phase-3a`.
- Không đổi collection/index/validator ngoài việc bỏ `required` của `tasks.description`.
- Task create append cuối cột; client không gửi `order`.
- Task edit không đổi `columnId`, `order`, `sourceItemId`, `origin`, `createdBy`.
- Assignee phải là member board hoặc `null`.
- Board phải có 1–12 cột và đúng một cột `isDone`.
- Không xóa cột còn task active; trả `409 COLUMN_NOT_EMPTY` kèm taskCount.
- Board/task update dùng `expectedVersion`; stale trả `409 VERSION_CONFLICT`.
- Không bump version `0.3.0`; không merge `main`; tag `v0.2.0` giữ nguyên.
- Git local, không push/tag/amend/đổi config.
- Identity commit:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.

---

### Task 0: Docs baseline và plan

**Files:**
- Modify: `docs/phases/03b-task-editing-columns.md`
- Create: `docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: spec 3B đã duyệt.
- Produces: plan 3B, baseline feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git switch feat/phase-3b-task-editing
git status --short --branch
git log --oneline -1
```

Expected: HEAD `0619149`; working tree sạch.

- [ ] **Step 2: Cập nhật spec status**

Trong `docs/phases/03b-task-editing-columns.md`, đổi trạng thái thành:

```markdown
- Trạng thái: Đã duyệt spec; implementation plan:
  [2026-11-10-phase-3b-task-editing-columns.md](../superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md)
```

và đổi dòng `Implementation plan: chưa viết...` thành link plan.

- [ ] **Step 3: Ghi baseline git/session**

Trong `docs/git-workflow.md`, mục 1 ghi feature đang mở
`feat/phase-3b-task-editing`, release `release/v0.3`, main/tag không đổi.

Thêm vào `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 3B plan

- Spec `docs/phases/03b-task-editing-columns.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md`.
- Phạm vi: task create/edit, Owner columns, UI dialog; không migration/cursor.
- Chưa code; chờ chọn cách thực thi.
```

- [ ] **Step 4: Commit**

```bash
git add docs/phases/03b-task-editing-columns.md docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md docs/git-workflow.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 3b task editing and columns"
```

---

### Task 1: Contracts cho task create/edit và columns

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Modify: `packages/contracts/src/board.ts`
- Modify: `packages/contracts/src/version.ts`
- Modify: `apps/api/src/lib/versioning.ts`
- Modify: `apps/api/test/task-contracts.test.ts`
- Create: `apps/api/test/column-contracts.test.ts`
- Modify: `apps/api/test/versioning.test.ts`

**Interfaces:**
- Produces:
  - `createTaskRequestSchema`, `CreateTaskRequest`
  - `updateTaskRequestSchema`, `UpdateTaskRequest`
  - `updateColumnsRequestSchema`, `UpdateColumnsRequest`
  - `COLUMN_NOT_EMPTY_CODE`, `ColumnNotEmptyDetails`
  - `columnNotEmpty(columnId: string, taskCount: number): AppError`

- [ ] **Step 1: Viết test contract thất bại**

Thêm vào `apps/api/test/task-contracts.test.ts`:

```ts
import { createTaskRequestSchema, updateTaskRequestSchema } from '@nextask/contracts';

it('create task trim title và optional field', () => {
  expect(createTaskRequestSchema.parse({ columnId: 'todo', title: '  Task mới  ' })).toEqual({
    columnId: 'todo',
    title: 'Task mới',
  });
});

it('update task cần expectedVersion và ít nhất một field', () => {
  expect(() => updateTaskRequestSchema.parse({ expectedVersion: 1 })).toThrow();
  expect(
    updateTaskRequestSchema.parse({ expectedVersion: 2, title: 'Mới' }),
  ).toMatchObject({ expectedVersion: 2, title: 'Mới' });
});
```

`apps/api/test/column-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { updateColumnsRequestSchema } from '@nextask/contracts';

describe('column contracts', () => {
  it('chấp nhận cột cũ và cột mới đúng một Done', () => {
    const parsed = updateColumnsRequestSchema.parse({
      columns: [
        { id: 'backlog', name: 'Backlog', isDone: false },
        { name: 'Done mới', isDone: true },
      ],
      expectedVersion: 3,
    });
    expect(parsed.columns).toHaveLength(2);
  });

  it('từ chối 0 hoặc 2 cột Done, id lặp, mảng rỗng', () => {
    const base = { columns: [{ name: 'A', isDone: false }], expectedVersion: 1 };
    expect(() => updateColumnsRequestSchema.parse(base)).toThrow();
    expect(() =>
      updateColumnsRequestSchema.parse({ columns: [], expectedVersion: 1 }),
    ).toThrow();

    expect(() =>
      updateColumnsRequestSchema.parse({
        columns: [
          { name: 'A', isDone: true },
          { name: 'B', isDone: true },
        ],
        expectedVersion: 1,
      }),
    ).toThrow();

    expect(() =>
      updateColumnsRequestSchema.parse({
        columns: [
          { id: 'todo', name: 'A', isDone: true },
          { id: 'todo', name: 'B', isDone: false },
        ],
        expectedVersion: 1,
      }),
    ).toThrow();
  });
});
```

Thêm vào `apps/api/test/versioning.test.ts`:

```ts
import { columnNotEmpty } from '../src/lib/versioning.js';

it('columnNotEmpty trả 409 kèm taskCount', () => {
  const error = columnNotEmpty('todo', 3);
  expect(error.status).toBe(409);
  expect(error.code).toBe('COLUMN_NOT_EMPTY');
  expect(error.details).toEqual({ columnId: 'todo', taskCount: 3 });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-contracts.test.ts test/column-contracts.test.ts test/versioning.test.ts
```

Expected: FAIL vì schema/helper chưa có.

- [ ] **Step 3: Cập nhật contracts**

`packages/contracts/src/task.ts` thêm:

```ts
export const createTaskRequestSchema = z.object({
  columnId: z.string().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  assigneeId: objectIdSchema.nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: isoDateSchema.nullable().optional(),
});

export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    assigneeId: objectIdSchema.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: isoDateSchema.nullable().optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.assigneeId !== undefined ||
      value.labels !== undefined ||
      value.priority !== undefined ||
      value.dueDate !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  );

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
```

`packages/contracts/src/board.ts` thêm:

```ts
export const updateColumnsRequestSchema = z
  .object({
    columns: z
      .array(
        z.object({
          id: z.string().min(1).max(64).optional(),
          name: z.string().trim().min(1).max(60),
          isDone: z.boolean(),
        }),
      )
      .min(1)
      .max(12),
    expectedVersion: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const ids = value.columns.flatMap((column) => (column.id ? [column.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Id cột bị lặp',
        path: ['columns'],
      });
    }
    if (value.columns.filter((column) => column.isDone).length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phải có đúng một cột Done',
        path: ['columns'],
      });
    }
  });

export type UpdateColumnsRequest = z.infer<typeof updateColumnsRequestSchema>;
```

`packages/contracts/src/version.ts` thêm:

```ts
export const COLUMN_NOT_EMPTY_CODE = 'COLUMN_NOT_EMPTY' as const;

export const columnNotEmptyDetailsSchema = z.object({
  columnId: z.string().min(1),
  taskCount: z.number().int().nonnegative(),
});

export type ColumnNotEmptyDetails = z.infer<typeof columnNotEmptyDetailsSchema>;
```

`apps/api/src/lib/versioning.ts` thêm:

```ts
import {
  COLUMN_NOT_EMPTY_CODE,
  type ColumnNotEmptyDetails,
} from '@nextask/contracts';

export function columnNotEmpty(columnId: string, taskCount: number): AppError {
  const details: ColumnNotEmptyDetails = { columnId, taskCount };
  return new AppError(409, COLUMN_NOT_EMPTY_CODE, 'Cột còn task, không thể xóa', details);
}
```

- [ ] **Step 4: Chạy test/typecheck**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-contracts.test.ts test/column-contracts.test.ts test/versioning.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/task.ts packages/contracts/src/board.ts packages/contracts/src/version.ts apps/api/src/lib/versioning.ts apps/api/test/task-contracts.test.ts apps/api/test/column-contracts.test.ts apps/api/test/versioning.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task editing contracts"
```

---

### Task 2: Tạo task tay

**Files:**
- Modify: `apps/api/src/modules/tasks/task.model.ts`
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Create: `apps/api/test/task-create.integration.test.ts`

**Interfaces:**
- Consumes: `createTaskRequestSchema`, `orderConflict`.
- Produces: `createTask(board, actorId, input): Promise<TaskDocument>`; `POST /tasks`.

- [ ] **Step 1: Viết test create thất bại**

`apps/api/test/task-create.integration.test.ts`:

```ts
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
  return { owner, boardId: board.body.data._id as string, board: board.body.data };
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

  it('trim/dedupe labels và validate assignee member', async () => {
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

  it('title rỗng quá dài trả 422', async () => {
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
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-create.integration.test.ts
```

Expected: FAIL 404/validation.

- [ ] **Step 3: Sửa model description**

Trong `apps/api/src/modules/tasks/task.model.ts` đổi:

```ts
description: { type: String, default: '' },
```

(bỏ `required: true` để task mới có description rỗng).

- [ ] **Step 4: Thêm service create**

Trong `apps/api/src/modules/tasks/task.service.ts` thêm import `CreateTaskRequest`, `TaskPriority`; thêm:

```ts
function normalizeLabels(labels?: string[]): string[] | undefined {
  if (labels === undefined) return undefined;
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function assertAssigneeMember(
  board: BoardDocument,
  assigneeId: string | null | undefined,
): void {
  if (!assigneeId) return;
  if (!board.members.some((member) => member.userId.equals(assigneeId))) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Assignee phải là thành viên board');
  }
}

async function appendOrder(board: BoardDocument, columnId: string): Promise<string> {
  const lastTask = await TaskModel.findOne({
    boardId: board._id,
    columnId,
    lifecycle: 'active',
  })
    .sort({ order: -1 })
    .exec();
  return generateKeyBetween(lastTask?.order ?? null, null);
}

export async function createTask(
  board: BoardDocument,
  actorId: Types.ObjectId,
  input: CreateTaskRequest,
): Promise<TaskDocument> {
  const column = board.columns.find((entry) => entry.id === input.columnId);
  if (!column) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  assertAssigneeMember(board, input.assigneeId);

  const labels = normalizeLabels(input.labels) ?? [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await appendOrder(board, column.id);
    try {
      return await TaskModel.create({
        boardId: board._id,
        columnId: column.id,
        order,
        title: input.title,
        description: input.description ?? '',
        assigneeId: input.assigneeId ?? null,
        labels,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        lifecycle: 'active',
        sourceItemId: null,
        origin: null,
        version: 1,
        createdBy: actorId,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (attempt === 1) throw orderConflict(column.id);
    }
  }

  throw orderConflict(column.id);
}
```

- [ ] **Step 5: Thêm route POST**

Trong `apps/api/src/modules/tasks/task.router.ts`:

```ts
router.post('/', async (request, response) => {
  if (!request.board || !request.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
  }

  const input = createTaskRequestSchema.parse(request.body);
  const task = await createTask(request.board, request.user._id, input);
  response.status(201).json({
    data: serializeTask(task),
    meta: { requestId: request.requestId },
  });
});
```

Import `createTaskRequestSchema` và `createTask`.

- [ ] **Step 6: Chạy test và full suite**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-create.integration.test.ts
npm run test
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tasks/task.model.ts apps/api/src/modules/tasks/task.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/task-create.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: create kanban tasks manually"
```

---

### Task 3: Sửa task

**Files:**
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Create: `apps/api/test/task-edit.integration.test.ts`

**Interfaces:**
- Consumes: `updateTaskRequestSchema`, `assertAssigneeMember`, `normalizeLabels`.
- Produces: `updateTask(board, taskId, input): Promise<TaskDocument>`; `PATCH /tasks/:taskId`.

- [ ] **Step 1: Viết test edit thất bại**

`apps/api/test/task-edit.integration.test.ts`:

```ts
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

async function setupTask() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Edit' })
    .expect(201);
  const boardId = board.body.data._id as string;
  const task = await owner.agent
    .post(`/api/v1/boards/${boardId}/tasks`)
    .send({ columnId: 'todo', title: 'Gốc', priority: 'low' })
    .expect(201);
  return { owner, boardId, task: task.body.data as { _id: string; version: number; order: string } };
}

describe('edit task', () => {
  it('sửa field và tăng version', async () => {
    const { owner, boardId, task } = await setupTask();
    const response = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        title: 'Đã sửa',
        description: '',
        priority: 'urgent',
        labels: ['bug', 'bug'],
        expectedVersion: task.version,
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      title: 'Đã sửa',
      description: '',
      priority: 'urgent',
      labels: ['bug'],
      version: task.version + 1,
    });
  });

  it('stale version trả 409 và không ghi', async () => {
    const { owner, boardId, task } = await setupTask();
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ title: 'Lần 1', expectedVersion: task.version })
      .expect(200);
    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ title: 'Lần 2', expectedVersion: task.version })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('không cho đổi cột/order qua body và validate assignee', async () => {
    const { owner, boardId, task } = await setupTask();
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');

    const response = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({
        title: 'Vẫn cột cũ',
        columnId: 'done',
        order: 'zzz',
        expectedVersion: task.version,
      })
      .expect(200);
    expect(response.body.data.columnId).toBe('todo');
    expect(response.body.data.order).toBe(task.order);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ assigneeId: stranger.user._id, expectedVersion: response.body.data.version })
      .expect(422);
  });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-edit.integration.test.ts
```

Expected: FAIL 404.

- [ ] **Step 3: Thêm service update**

Trong `apps/api/src/modules/tasks/task.service.ts`:

```ts
export async function updateTask(
  board: BoardDocument,
  taskId: string,
  input: UpdateTaskRequest,
): Promise<TaskDocument> {
  if (!Types.ObjectId.isValid(taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const task = await TaskModel.findOne({
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
  assertAssigneeMember(board, input.assigneeId);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.assigneeId !== undefined) {
    updates.assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
  }
  if (input.labels !== undefined) updates.labels = normalizeLabels(input.labels);
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueDate !== undefined) {
    updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  const updated = await TaskModel.findOneAndUpdate(
    {
      _id: task._id,
      boardId: board._id,
      lifecycle: 'active',
      version: input.expectedVersion,
    },
    { $set: updates, $inc: { version: 1 } },
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
}
```

Import `UpdateTaskRequest`.

- [ ] **Step 4: Thêm route PATCH**

Trong `task.router.ts`:

```ts
router.patch('/:taskId', async (request, response) => {
  if (!request.board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  const params = request.params as { taskId?: string };
  if (!params.taskId) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }
  const input = updateTaskRequestSchema.parse(request.body);
  const task = await updateTask(request.board, params.taskId, input);
  response.json({
    data: serializeTask(task),
    meta: { requestId: request.requestId },
  });
});
```

Import schema/service.

- [ ] **Step 5: Chạy test/full suite**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/task-edit.integration.test.ts
npm run test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tasks/task.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/task-edit.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: edit kanban tasks"
```

---

### Task 4: Owner quản lý cột

**Files:**
- Modify: `apps/api/src/modules/boards/board.service.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Create: `apps/api/test/columns.integration.test.ts`

**Interfaces:**
- Consumes: `updateColumnsRequestSchema`, `columnNotEmpty`.
- Produces: `updateColumns(board, input): Promise<BoardDocument>`; `PATCH /boards/:boardId/columns`.

- [ ] **Step 1: Viết test columns thất bại**

`apps/api/test/columns.integration.test.ts`:

```ts
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

async function setupBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Columns' })
    .expect(201);
  return { owner, boardId: board.body.data._id as string, board: board.body.data };
}

async function currentColumns(owner: Awaited<ReturnType<typeof registerAgent>>, boardId: string) {
  const board = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
  return board.body.data as {
    version: number;
    columns: Array<{ id: string; name: string; order: number; isDone: boolean }>;
  };
}

describe('columns', () => {
  it('thêm cột, giữ id cũ, tăng version', async () => {
    const { owner, boardId, board } = await setupBoard();
    const columns = board.columns.map((column: { id: string; name: string; isDone: boolean }) => ({
      id: column.id,
      name: column.name,
      isDone: column.isDone,
    }));
    columns.push({ name: 'QA', isDone: false });

    const updated = await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version })
      .expect(200);

    expect(updated.body.data.version).toBe(board.version + 1);
    expect(updated.body.data.columns).toHaveLength(6);
    expect(updated.body.data.columns[5].id).toMatch(/^col-/);
    expect(updated.body.data.columns[5].order).toBe(5);
  });

  it('rename/reorder giữ task columnId', async () => {
    const { owner, boardId, board } = await setupBoard();
    const task = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Task' })
      .expect(201);
    const current = await currentColumns(owner, boardId);
    const reordered = current.columns
      .slice()
      .reverse()
      .map((column) => ({
        id: column.id,
        name: column.id === 'todo' ? 'Việc cần làm' : column.name,
        isDone: column.isDone,
      }));

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: reordered, expectedVersion: current.version })
      .expect(200);

    const after = await owner.agent
      .get(`/api/v1/boards/${boardId}/tasks`)
      .expect(200);
    expect(after.body.data.find((entry: { _id: string }) => entry._id === task.body.data._id))
      .toMatchObject({ columnId: 'todo' });
    expect((await currentColumns(owner, boardId)).columns[0].id).toBe('done');
  });

  it('xóa cột rỗng được, cột còn task bị chặn', async () => {
    const { owner, boardId } = await setupBoard();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Còn task' })
      .expect(201);
    const current = await currentColumns(owner, boardId);
    const withoutTodo = current.columns
      .filter((column) => column.id !== 'todo')
      .map(({ id, name, isDone }) => ({ id, name, isDone }));

    const blocked = await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: withoutTodo, expectedVersion: current.version })
      .expect(409);
    expect(blocked.body.error).toMatchObject({
      code: 'COLUMN_NOT_EMPTY',
      details: { columnId: 'todo', taskCount: 1 },
    });

    const boardWithEmpty = await currentColumns(owner, boardId);
    const withoutBacklog = boardWithEmpty.columns
      .filter((column) => column.id !== 'backlog')
      .map(({ id, name, isDone }) => ({ id, name, isDone }));
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: withoutBacklog, expectedVersion: boardWithEmpty.version })
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

    const columns = board.columns.map((column: { id: string; name: string; isDone: boolean }) => ({
      id: column.id,
      name: column.name,
      isDone: column.isDone,
    }));

    await member.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version })
      .expect(403);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns, expectedVersion: board.version + 1 })
      .expect(409);

    const twoDone = columns.map((column: { isDone: boolean }) => ({ ...column, isDone: true }));
    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: twoDone, expectedVersion: board.version })
      .expect(422);

    await owner.agent
      .patch(`/api/v1/boards/${boardId}/columns`)
      .send({ columns: [columns[0]], expectedVersion: board.version })
      .expect(422);
  });
});

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/columns.integration.test.ts
```

Expected: FAIL 404.

- [ ] **Step 3: Thêm service updateColumns**

Trong `apps/api/src/modules/boards/board.service.ts` thêm import `randomUUID`, `Types`
(đã có), `TaskModel`, `columnNotEmpty`, type `UpdateColumnsRequest`:

```ts
export async function updateColumns(
  board: BoardDocument,
  input: UpdateColumnsRequest,
): Promise<BoardDocument> {
  if (board.version !== input.expectedVersion) {
    const current = await BoardModel.findById(board._id).select({ version: 1 }).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }

  const currentIds = new Set(board.columns.map((column) => column.id));
  for (const column of input.columns) {
    if (column.id && !currentIds.has(column.id)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Cột không tồn tại trong board');
    }
  }

  const providedIds = new Set(
    input.columns.flatMap((column) => (column.id ? [column.id] : [])),
  );
  const removedIds = board.columns
    .filter((column) => !providedIds.has(column.id))
    .map((column) => column.id);

  if (removedIds.length > 0) {
    const counts = await TaskModel.aggregate<{ _id: string; taskCount: number }>([
      {
        $match: {
          boardId: board._id,
          lifecycle: 'active',
          columnId: { $in: removedIds },
        },
      },
      { $group: { _id: '$columnId', taskCount: { $sum: 1 } } },
    ]);
    for (const count of counts) {
      throw columnNotEmpty(count._id, count.taskCount);
    }
  }

  const usedIds = new Set(currentIds);
  const nextColumns = input.columns.map((column, index) => {
    let id = column.id;
    if (!id) {
      do {
        id = `col-${randomUUID()}`;
      } while (usedIds.has(id));
      usedIds.add(id);
    }
    return { id, name: column.name, order: index, isDone: column.isDone };
  });

  const updated = await BoardModel.findOneAndUpdate(
    { _id: board._id, version: input.expectedVersion },
    { $set: { columns: nextColumns }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();

  if (!updated) {
    const current = await BoardModel.findById(board._id).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }
  return updated;
}
```

- [ ] **Step 4: Thêm route**

Trong `board.router.ts`:

```ts
router.patch('/:boardId/columns', requireOwner, async (request, response) => {
  if (!request.board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  const input = updateColumnsRequestSchema.parse(request.body);
  const board = await updateColumns(request.board, input);
  response.json({
    data: serializeBoard(board, request.boardRole ?? 'owner'),
    meta: { requestId: request.requestId },
  });
});
```

Import `updateColumnsRequestSchema` và `updateColumns`.

- [ ] **Step 5: Chạy test/full suite**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/columns.integration.test.ts
npm run test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/boards/board.service.ts apps/api/src/modules/boards/board.router.ts apps/api/test/columns.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: manage board columns"
```

---

### Task 5: Web dialogs và column manager

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/features/workspace/task-editor-dialog.tsx`
- Create: `apps/web/features/workspace/column-manager-dialog.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/features/workspace/kanban-board.tsx`

**Interfaces:**
- Consumes: task/column contracts, `getTasks`/`loadTasks` từ 3A.
- Produces:
  - `createTask(boardId, input): Promise<TaskDto>`
  - `updateTask(boardId, taskId, input): Promise<TaskDto>`
  - `updateColumns(boardId, input): Promise<BoardDto>`
  - `isColumnNotEmpty(error)`
  - Dialog tạo/sửa task, dialog quản lý cột.

- [ ] **Step 1: API client**

`apps/web/lib/api.ts` thêm import `createTaskRequestSchema`, `updateTaskRequestSchema`,
`updateColumnsRequestSchema`, types `CreateTaskRequest`, `UpdateTaskRequest`,
`UpdateColumnsRequest`.

```ts
export function isColumnNotEmpty(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'COLUMN_NOT_EMPTY';
}

export async function createTask(
  boardId: string,
  input: CreateTaskRequest,
): Promise<TaskDto> {
  const body = createTaskRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/tasks`, taskResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function updateTask(
  boardId: string,
  taskId: string,
  input: UpdateTaskRequest,
): Promise<TaskDto> {
  const body = updateTaskRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/tasks/${taskId}`, taskResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function updateColumns(
  boardId: string,
  input: UpdateColumnsRequest,
): Promise<BoardDto> {
  const body = updateColumnsRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/columns`, boardResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}
```

- [ ] **Step 2: Task editor dialog**

Tạo `apps/web/features/workspace/task-editor-dialog.tsx`:

Props:

```ts
interface TaskEditorDialogProps {
  board: BoardDto;
  members: BoardMemberDetailDto[];
  task: TaskDto | null;
  initialColumnId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConflict: () => void;
}
```

- State title, description, assigneeId (`''` = null), labelsText, priority,
  dueDate (`YYYY-MM-DD`), columnId.
- Edit mode lấy giá trị từ task; `dueDate = task.dueDate?.slice(0, 10) ?? ''`.
- Parse labels:
  `labelsText.split(',').map(trim).filter(Boolean)`; dedupe; tối đa 10.
- Due date:
  `dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : null`.
- Submit:
  - Create: `createTask(board._id, { columnId, title, description, assigneeId: assigneeId || null, labels, priority, dueDate })`.
  - Edit: `updateTask(board._id, task._id, { ...fields, expectedVersion: task.version })`.
  - `VERSION_CONFLICT` gọi `onConflict()` và return; `COLUMN_NOT_EMPTY` không xảy ra.
  - Lỗi khác hiện message.
  - Thành công `await onSaved()`, `onClose()`.
- UI dùng form label/input/select/textarea, nút Hủy/Lưu, pending/error.
- Create mode có select cột; edit mode hiển thị tên cột readonly.

- [ ] **Step 3: Column manager dialog**

Tạo `apps/web/features/workspace/column-manager-dialog.tsx`:

Props:

```ts
interface ColumnManagerDialogProps {
  board: BoardDto;
  onClose: () => void;
  onSaved: (board: BoardDto) => void;
  onConflict: () => void;
}
```

- State rows từ `board.columns` sorted; mỗi row `{ key: string; id?: string; name; isDone }`,
  `key` sinh bằng `crypto.randomUUID()` hoặc counter.
- Add row `{ key: crypto.randomUUID(), name: '', isDone: false }`.
- Up/down hoán đổi; delete row; radio done (chỉ một).
- Save validate: ít nhất 1, name trim nonempty, đúng một Done.
- Gọi `updateColumns(board._id, { columns: rows.map(({id,name,isDone})=>({id,name:name.trim(),isDone})), expectedVersion: board.version })`.
- `VERSION_CONFLICT` → `onConflict()`; `COLUMN_NOT_EMPTY` → hiện message từ API.
- Success `onSaved(updated)` rồi `onClose()`.
- UI dialog danh sách, nút lên/xuống/xóa, ô thêm, nút Lưu/Hủy.

- [ ] **Step 4: Workspace wiring**

`board-workspace.tsx`:

- State:
  `const [editingTask, setEditingTask] = useState<TaskDto | null>(null);`
  `const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);`
  `const [showColumns, setShowColumns] = useState(false);`
- Header Owner thêm nút `Cột` cạnh `Đổi tên`/`Mời`.
- `handleTaskSaved`:

```ts
const handleTaskSaved = useCallback(async () => {
  await loadTasks(filters);
}, [filters, loadTasks]);
```

- `handleTaskConflict`:

```ts
const handleTaskConflict = useCallback(async () => {
  setEditingTask(null);
  setCreatingColumnId(null);
  setNotice('Task vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
  await loadWorkspace();
  await loadTasks(filters);
}, [filters, loadTasks, loadWorkspace]);
```

- `handleColumnsSaved`:

```ts
const handleColumnsSaved = useCallback(
  async (board: BoardDto) => {
    setData((current) => (current ? { ...current, board } : current));
    setShowColumns(false);
    await loadTasks(filters);
  },
  [filters, loadTasks],
);
```

- `handleColumnsConflict`:

```ts
const handleColumnsConflict = useCallback(async () => {
  setShowColumns(false);
  setNotice('Cột vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
  await loadWorkspace();
  await loadTasks(filters);
}, [filters, loadTasks, loadWorkspace]);
```

- Kanban props thêm:
  `onEditTask={setEditingTask}`,
  `onCreateTask={(columnId) => setCreatingColumnId(columnId)}`.
- Render TaskEditorDialog khi `editingTask || creatingColumnId`:
  `task={editingTask}`; `initialColumnId={creatingColumnId ?? undefined}`.
- Render ColumnManagerDialog khi `showColumns`.

- [ ] **Step 5: Kanban buttons**

- Props thêm:

```ts
onEditTask: (task: TaskDto) => void;
onCreateTask: (columnId: string) => void;
```

- Column header cạnh số lượng thêm button `+`:

```tsx
<button
  type="button"
  onClick={() => onCreateTask(column.id)}
  aria-label={`Tạo task trong ${column.name}`}
  className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
>
  +
</button>
```

- Card thêm nút `Sửa` ở footer:

```tsx
<button
  type="button"
  onMouseDown={(event) => event.stopPropagation()}
  onClick={(event) => {
    event.stopPropagation();
    onEditTask(task);
  }}
  className="mt-2 text-[11px] font-medium text-sky-700 hover:underline"
>
  Sửa
</button>
```

- Không mở edit khi drag; button clickable.

- [ ] **Step 6: Typecheck/build**

```bash
npm run typecheck
npm run build:web
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/task-editor-dialog.tsx apps/web/features/workspace/column-manager-dialog.tsx apps/web/features/workspace/board-workspace.tsx apps/web/features/workspace/kanban-board.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add task and column dialogs"
```

---

### Task 6: Browser verification và docs

**Files:**
- Modify: `docs/session-log.md`
- Modify: `docs/phases/03b-task-editing-columns.md`

**Interfaces:**
- Consumes: API/UI 3B.
- Produces: browser evidence, docs kết quả.

- [ ] **Step 1: Rebuild stack**

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: services healthy; version `0.2.0`; migration 003.

- [ ] **Step 2: Browser golden path**

Dùng browser-use:

1. Đăng nhập owner, tạo board tạm `Phase 3B E2E`.
2. Mở board, Owner thấy nút `Cột`; Member không thấy (kiểm tra API test là chính).
3. Tạo task tay trong `To Do` với title, assignee owner, priority high, label `e2e`,
   due date; card xuất hiện.
4. Mở `Sửa`, đổi title/description/priority/labels/assignee/due date; lưu; reload còn.
5. Filter search/priority/assignee thấy task.
6. Owner mở `Cột`: thêm cột `QA`, đổi tên, đưa lên/xuống, đặt Done cho `QA` và bỏ Done
   cột `Done` cũ; lưu; board cập nhật.
7. Thử xóa cột `To Do` khi còn task: API trả `COLUMN_NOT_EMPTY`, UI hiển thị lỗi.
8. Xóa task tạm? Không có API delete; cleanup bằng Mongo.
9. Conflict: tab/client thứ hai đổi task/board qua fetch; tab UI save với version cũ →
   notice reload.

- [ ] **Step 3: Cleanup dữ liệu test**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const board = db.boards.findOne({ name: "Phase 3B E2E" });
if (board) {
  db.tasks.deleteMany({ boardId: board._id });
  db.items.deleteMany({ boardId: board._id });
  db.boards.deleteOne({ _id: board._id });
}
'
```

Expected: board test và task/item của nó bị xóa; board thật còn nguyên.

- [ ] **Step 4: Ghi evidence vào docs**

`docs/session-log.md` thêm:

```markdown
## 2026-11-10 - Phase 3B verification

- Browser tạo/sửa task, filter, column manager pass.
- Xóa cột còn task trả COLUMN_NOT_EMPTY; conflict task/board reload đúng.
- Board test `Phase 3B E2E` và dữ liệu của nó đã xóa; board thật giữ nguyên.
```

`docs/phases/03b-task-editing-columns.md` thêm mục kết quả ngắn với test counts/browser.

- [ ] **Step 5: Commit**

```bash
git add docs/session-log.md docs/phases/03b-task-editing-columns.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 3b verification"
```

---

### Task 7: Gates, docs và merge release/v0.3

**Files:**
- Modify: `docs/phases/03b-task-editing-columns.md`
- Modify: `docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: 3B code/browser evidence.
- Produces: 3B trên `release/v0.3`; feature xóa; main/tag không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: trạng thái hoàn thành, kết quả, commit merge.
- Plan: trạng thái thực thi, commit list, điều chỉnh.
- Architecture: 3B complete; `PATCH /tasks`, `POST /tasks`, `PATCH /columns`.
- README: Phase 3B, task/column behavior, no cursor/migration.
- Git workflow: release/v0.3, feature merge/deleted, main/tag unchanged.
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

Expected: pass ba lần; ghi số file/test/thời gian.

- [ ] **Step 3: Commit docs**

```bash
git add docs/phases/03b-task-editing-columns.md docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md docs/session-log.md docs/architecture.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 3b verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.3
git merge --no-ff feat/phase-3b-task-editing -m "merge: phase 3b task editing and columns"
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

- [ ] **Step 6: Xóa feature, xác nhận main/tag**

```bash
git branch -d feat/phase-3b-task-editing
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: main `da0547a`; tag `v0.2.0`; release chứa 3A/3B.

- [ ] **Step 7: Không merge main**

Không chạy merge `release/v0.3` vào `main`. Ghi trạng thái chờ duyệt v0.3.

---

## Self-review checklist

- Spec coverage:
  - Create task: Task 2.
  - Edit task: Task 3.
  - Columns + COLUMN_NOT_EMPTY: Task 4.
  - UI dialogs: Task 5.
  - Browser/cleanup: Task 6.
  - Gates/merge: Task 7.
- Không migration/cursor/text index.
- Type/field thống nhất: `createTask`, `updateTask`, `updateColumns`,
  `CreateTaskRequest`, `UpdateTaskRequest`, `UpdateColumnsRequest`,
  `columnNotEmpty`, `isColumnNotEmpty`.
- Không task nào merge `main`; tag `v0.2.0` giữ nguyên.
