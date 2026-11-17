# NexTask Phase 5A - Demote and Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm Demote transaction và activity log nền tảng cho Phase 5B, giữ task demoted trong lịch sử và cập nhật Kanban/badge/whiteboard qua realtime hiện có.

**Architecture:** Demote dùng một transaction MongoDB cập nhật task `lifecycle=demoted`, item `promotedTaskId=null` và insert activity; promote hiện tại được bổ sung insert activity trong cùng transaction. API activity đọc tối đa 100 bản ghi gần nhất theo board. Web thêm dialog xác nhận demote và tab hoạt động; Change Streams hiện có phát `task:demoted`/`item:demoted`.

**Tech Stack:** Node 26, TypeScript 6.0.3, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5, Socket.IO 4.8.4.

**Spec:** `docs/phases/05a-demote-activity.md`

**Branch:** `feat/phase-5a-demote-activity` từ `release/v0.5`; release tạo từ `main` tại `9fd19b6`. Không merge `main`, không bump `0.5.0`, tag `v0.4.0` giữ nguyên.

**Trạng thái thực thi:** Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.5` bằng
`--no-ff` (`0a34cce`); feature branch đã xóa. Commit chính:

- `996db73` `docs: specify phase 5a demote and activity`
- `ed34789` `docs: plan phase 5a demote and activity`
- `99175d4` `feat: add activity and demote contracts`
- `82418ae` `feat: add phase 5a activity migration`
- `4114cb5` `feat: record promote activity in transaction`
- `abb1914` `feat: add demote transaction endpoint`
- `2f507e9` `feat: expose board activity API`
- `6c72172` `chore: format phase 5a api files`
- `a60fb5e` `feat: add demote dialog and activity panel`
- `659e935` `docs: record phase 5a verification`
- `96d52eb` `docs: record phase 5a verification`
- `0a34cce` `merge: phase 5a demote and activity` vào `release/v0.5`

Feature gate: typecheck/lint/format pass; full suite 28 file, 126 test ba lần
19.09/19.08/19.26 s. Release gate: typecheck/lint/format pass; full suite 28 file,
126 test ba lần 19.47/20.76/19.37 s.

**Điều chỉnh thực tế:**

- TaskDto model/serializer `demotedAt`/`demotedBy` được đưa vào Task 1 thay vì Task 3
  để typecheck xanh ngay sau contract change.
- Non-member board access trả `404` theo middleware hiện có, không phải `403`; test và
  spec đã ghi đúng.
- Browser verification dùng board tạm, xóa cả checkpoint của board tạm sau khi đóng tab.
- Full suite tăng lên 28 file, 126 test do thêm contract/migration/demote/activity test.

## Global Constraints

- MongoDB replica set thật cho test; không mock DB/transaction/Change Streams.
- Demote giữ task demoted trong DB, không hard delete, không tạo bản sao note.
- Demote dùng OCC cả task và item; conflict trả `409 VERSION_CONFLICT` với `field`.
- Activity TTL 90 ngày; promote `undoableUntil` = thời điểm promote + 10 phút.
- Activity 5A chỉ gồm `item.promoted` và `item.demoted`; `item.promote_undone` để 5B.
- Không thay đổi REST promote response; chỉ ghi thêm activity trong transaction.
- Activity không có watcher realtime riêng; panel refresh sau thao tác và event demote.
- Không bump version `0.5.0`; không merge `main`; tag `v0.4.0` giữ nguyên.
- Git local; không push/tag/amend/đổi config trong phase này.
- Identity commit:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Full suite phải pass ba lần trước khi merge; không nới timeout để test xanh.

---

## File Structure

- `packages/contracts/src/activity.ts` — activity action/refs/DTO/query schema.
- `packages/contracts/src/task.ts` — TaskDto lifecycle demoted, demote request/response.
- `packages/contracts/src/version.ts` — thêm `field` optional vào version conflict details.
- `apps/api/src/db/collection-validators.ts` — validator activities và task demote fields.
- `apps/api/src/db/migrations/005-phase-5a.ts` — collection/index/TTL/validator.
- `apps/api/src/modules/activities/activity.model.ts` — model activity.
- `apps/api/src/modules/activities/activity.service.ts` — record/list activity.
- `apps/api/src/modules/activities/activity.router.ts` — GET activities.
- `apps/api/src/modules/items/promotion.service.ts` — ghi activity promote.
- `apps/api/src/modules/tasks/demote.service.ts` — transaction demote.
- `apps/api/src/modules/tasks/task.router.ts` — endpoint demote.
- `apps/api/src/lib/serialize.ts` — serialize activity và TaskDto mới.
- `apps/api/src/modules/boards/board.router.ts` — mount activities router.
- `apps/web/lib/api.ts` — demoteTask/getActivities.
- `apps/web/features/workspace/demote-task-dialog.tsx` — xác nhận demote.
- `apps/web/features/workspace/activity-panel.tsx` — panel hoạt động.
- `apps/web/features/workspace/kanban-board.tsx` — nút Demote.
- `apps/web/features/workspace/board-workspace.tsx` — state, handler, tab, realtime refresh.

---

### Task 0: Docs baseline và branch

**Files:**
- Modify: `docs/session-log.md`
- Create: `docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md`

**Interfaces:**
- Consumes: spec đã duyệt `docs/phases/05a-demote-activity.md`.
- Produces: plan 5A trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git status --short --branch
git log --oneline -1
```

Expected: branch `feat/phase-5a-demote-activity`; không có file dirty ngoài plan.

- [ ] **Step 2: Ghi session log**

Thêm vào cuối `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 5A plan

- Spec `docs/phases/05a-demote-activity.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md`.
- Phạm vi: Demote transaction, activity TTL/index, API activity, web Demote/panel.
- 5B để sau: batch, undo, fault injection toàn diện.
- Bắt đầu Inline Execution; không merge `main`.
```

- [ ] **Step 3: Commit plan**

```bash
git add docs/session-log.md docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 5a demote and activity"
```

---

### Task 1: Contracts activity, demote và TaskDto

**Files:**
- Create: `packages/contracts/src/activity.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/task.ts`
- Modify: `packages/contracts/src/version.ts`
- Test: `apps/api/test/activity-contracts.test.ts`

**Interfaces:**
- Consumes: `objectIdSchema`, `isoDateSchema`, `unknownRecordSchema`, `envelopeMetaSchema`.
- Produces:
  - `ActivityDto`, `ActivityAction`, `activitySchema`, `activityListQuerySchema`,
    `activitiesResponseSchema`.
  - `DemoteTaskRequest`, `demoteTaskRequestSchema`, `demoteTaskResponseSchema`.
  - `TaskDto.lifecycle: 'active' | 'demoted'`, `demotedAt`, `demotedBy`.

- [ ] **Step 1: Viết test contract thất bại**

Tạo `apps/api/test/activity-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activityListQuerySchema,
  activitySchema,
  demoteTaskRequestSchema,
  taskSchema,
} from '@nextask/contracts';

const validTask = {
  _id: '64b000000000000000000001',
  boardId: '64b000000000000000000002',
  columnId: 'todo',
  order: 'a0',
  title: 'Task',
  description: '',
  assigneeId: null,
  labels: [],
  priority: 'medium',
  dueDate: null,
  lifecycle: 'demoted',
  sourceItemId: '64b000000000000000000003',
  origin: null,
  version: 2,
  createdBy: '64b000000000000000000004',
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  demotedAt: '2026-11-10T00:00:00.000Z',
  demotedBy: '64b000000000000000000004',
};

describe('phase 5a contracts', () => {
  it('demote request cần hai version dương', () => {
    expect(
      demoteTaskRequestSchema.parse({ expectedTaskVersion: 2, expectedItemVersion: 3 }),
    ).toEqual({ expectedTaskVersion: 2, expectedItemVersion: 3 });
    expect(() => demoteTaskRequestSchema.parse({ expectedTaskVersion: 0, expectedItemVersion: 3 })).toThrow();
    expect(() => demoteTaskRequestSchema.parse({ expectedTaskVersion: 2 })).toThrow();
  });

  it('activity schema parse action/refs/snapshot', () => {
    expect(
      activitySchema.parse({
        _id: '64b000000000000000000010',
        boardId: '64b000000000000000000002',
        actorId: '64b000000000000000000004',
        action: 'item.demoted',
        refs: {
          itemId: '64b000000000000000000003',
          taskId: '64b000000000000000000001',
          columnId: 'todo',
        },
        snapshot: { taskTitle: 'Task', columnId: 'todo' },
        undoableUntil: null,
        createdAt: '2026-11-10T00:00:00.000Z',
      }),
    ).toMatchObject({ action: 'item.demoted', undoableUntil: null });
    expect(() =>
      activitySchema.parse({
        _id: '64b000000000000000000010',
        boardId: '64b000000000000000000002',
        actorId: '64b000000000000000000004',
        action: 'task.moved',
        refs: { itemId: null, taskId: null, columnId: null },
        snapshot: {},
        undoableUntil: null,
        createdAt: '2026-11-10T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('activity query limit mặc định 50 và tối đa 100', () => {
    expect(activityListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(activityListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(() => activityListQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => activityListQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('TaskDto nhận lifecycle demoted và field demote nullable', () => {
    expect(taskSchema.parse(validTask)).toMatchObject({
      lifecycle: 'demoted',
      demotedBy: '64b000000000000000000004',
    });
    expect(taskSchema.parse({ ...validTask, lifecycle: 'active', demotedAt: null, demotedBy: null }))
      .toMatchObject({ lifecycle: 'active', demotedAt: null });
    expect(() => taskSchema.parse({ ...validTask, lifecycle: 'archived' })).toThrow();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run:

```bash
npm run test --workspace @nextask/api -- test/activity-contracts.test.ts
```

Expected: FAIL vì `@nextask/contracts` chưa export activity/demote schema.

- [ ] **Step 3: Tạo `packages/contracts/src/activity.ts`**

```ts
import { z } from 'zod';
import { isoDateSchema, objectIdSchema, unknownRecordSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const activityActionSchema = z.enum([
  'item.promoted',
  'item.demoted',
  'item.promote_undone',
]);

export const activityRefsSchema = z.object({
  itemId: objectIdSchema.nullable(),
  taskId: objectIdSchema.nullable(),
  columnId: z.string().min(1).nullable(),
});

export const activitySchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  actorId: objectIdSchema,
  action: activityActionSchema,
  refs: activityRefsSchema,
  snapshot: unknownRecordSchema,
  undoableUntil: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export const activitiesResponseSchema = z.object({
  data: z.array(activitySchema),
  meta: envelopeMetaSchema,
});

export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityAction = z.infer<typeof activityActionSchema>;
export type ActivityDto = z.infer<typeof activitySchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
```

- [ ] **Step 4: Cập nhật `task.ts` và `version.ts`**

Trong `packages/contracts/src/task.ts`, thêm import đầu file:

```ts
import { activitySchema } from './activity.js';
```

Đổi `taskSchema`:

```ts
  lifecycle: z.enum(['active', 'demoted']),
  sourceItemId: objectIdSchema.nullable(),
  origin: taskOriginSchema.nullable(),
  version: z.number().int().positive(),
  createdBy: objectIdSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  demotedAt: isoDateSchema.nullable(),
  demotedBy: objectIdSchema.nullable(),
```

Thêm sau `promoteRequestSchema`:

```ts
export const demoteTaskRequestSchema = z.object({
  expectedTaskVersion: z.number().int().positive(),
  expectedItemVersion: z.number().int().positive(),
});

export const demoteTaskResponseSchema = z.object({
  data: z.object({
    task: taskSchema,
    item: itemSchema,
    activity: activitySchema,
  }),
  meta: envelopeMetaSchema,
});
```

Thêm type export:

```ts
export type DemoteTaskRequest = z.infer<typeof demoteTaskRequestSchema>;
```

Trong `packages/contracts/src/version.ts`, thêm field optional:

```ts
export const versionConflictDetailsSchema = z.object({
  currentVersion: z.number().int().nonnegative(),
  shapeId: z.string().min(1).optional(),
  field: z.enum(['task', 'item']).optional(),
});
```

Trong `packages/contracts/src/index.ts`, thêm:

```ts
export * from './activity.js';
```

- [ ] **Step 5: Chạy test và build contracts**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/activity-contracts.test.ts
```

Expected: PASS 4 test.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/activity.ts packages/contracts/src/index.ts packages/contracts/src/task.ts packages/contracts/src/version.ts apps/api/test/activity-contracts.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add activity and demote contracts"
```

---

### Task 2: Migration 005 và validator

**Files:**
- Create: `apps/api/src/db/migrations/005-phase-5a.ts`
- Modify: `apps/api/src/db/collection-validators.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Test: `apps/api/test/migrations.integration.test.ts`
- Test: `apps/api/test/validators.integration.test.ts`

**Interfaces:**
- Consumes: `COLLECTION_VALIDATORS`, `Migration`, `MigrationOptions`.
- Produces:
  - `MIGRATION_005_NAME = '005-phase-5a'`, `LATEST_MIGRATION_NAME`.
  - Collection `activities` với validator/index/TTL.
  - Tasks validator chấp nhận `demotedAt`/`demotedBy`.

- [ ] **Step 1: Cập nhật test migration thất bại**

Trong `apps/api/test/migrations.integration.test.ts`:

Import thêm:

```ts
  MIGRATION_005_NAME,
```

Trong test idempotent, thêm:

```ts
    expect(migrations).not.toContain(MIGRATION_005_NAME);
```

Đổi assert schema version:

```ts
    await expect(assertSchemaVersion(connection, MIGRATION_005_NAME)).resolves.toBeUndefined();
```

Thêm test cuối file:

```ts
  it('005 tạo activities validator/index/TTL và task demote fields', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const [activityInfo] = await connection.db
      .listCollections({ name: 'activities' })
      .toArray();
    const activityOptions = (activityInfo as { options?: Record<string, unknown> } | undefined)
      ?.options;
    expect(activityInfo).toBeDefined();
    expect(activityOptions?.validationLevel).toBe('strict');
    expect(activityOptions?.validationAction).toBe('error');

    const indexes = await connection.db.collection('activities').indexes();
    expect(indexes.find((index) => index.name === 'activities_board_created')).toBeDefined();
    expect(indexes.find((index) => index.name === 'activities_created_ttl')).toMatchObject({
      expireAfterSeconds: 7_776_000,
    });

    const rawTask = {
      _id: new Types.ObjectId(),
      boardId: new Types.ObjectId(),
      columnId: 'raw-validation',
      order: 'a0',
      title: 'Raw task without demote fields',
      description: '',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await expect(connection.db.collection('tasks').insertOne(rawTask)).resolves.toBeDefined();
    await expect(
      connection.db.collection('tasks').updateOne(
        { _id: rawTask._id },
        {
          $set: {
            lifecycle: 'demoted',
            demotedAt: new Date(),
            demotedBy: new Types.ObjectId(),
          },
        },
      ),
    ).resolves.toMatchObject({ modifiedCount: 1 });

    await expect(
      connection.db.collection('activities').insertOne({
        boardId: new Types.ObjectId(),
        actorId: new Types.ObjectId(),
        action: 'task.moved',
        refs: { itemId: null, taskId: null, columnId: null },
        snapshot: {},
        undoableUntil: null,
        createdAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

Trong `apps/api/test/validators.integration.test.ts`, đổi mảng:

```ts
const collections = ['users', 'boards', 'items', 'tasks', 'invitations', 'activities'] as const;
```

Thêm test:

```ts
  it('activities sai action bị từ chối', async () => {
    await expect(
      db().collection('activities').insertOne({
        boardId: new Types.ObjectId(),
        actorId: new Types.ObjectId(),
        action: 'task.moved',
        refs: { itemId: null, taskId: null, columnId: null },
        snapshot: {},
        undoableUntil: null,
        createdAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts
```

Expected: FAIL vì `005-phase-5a`/activities chưa tồn tại.

- [ ] **Step 3: Cập nhật `collection-validators.ts`**

Trong object `tasks.properties`, thêm:

```ts
        demotedAt: nullableDate,
        demotedBy: nullableObjectId,
```

Thêm entry `activities` sau `tasks`:

```ts
  activities: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['boardId', 'actorId', 'action', 'refs', 'snapshot', 'undoableUntil', 'createdAt'],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        actorId: objectId,
        action: {
          bsonType: 'string',
          enum: ['item.promoted', 'item.demoted', 'item.promote_undone'],
        },
        refs: {
          bsonType: 'object',
          required: ['itemId', 'taskId', 'columnId'],
          additionalProperties: false,
          properties: {
            itemId: nullableObjectId,
            taskId: nullableObjectId,
            columnId: { bsonType: ['string', 'null'] },
          },
        },
        snapshot: { bsonType: 'object' },
        undoableUntil: nullableDate,
        createdAt: date,
      },
    },
  },
```

- [ ] **Step 4: Tạo migration 005**

`apps/api/src/db/migrations/005-phase-5a.ts`:

```ts
import type { Db } from 'mongodb';
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

function requireValidator(name: 'activities' | 'tasks'): NonNullable<(typeof COLLECTION_VALIDATORS)[string]> {
  const validator = COLLECTION_VALIDATORS[name];
  if (!validator) throw new Error(`Thiếu validator ${name}`);
  return validator;
}

async function ensureActivitiesCollection(db: Db): Promise<void> {
  const validator = requireValidator('activities');
  const [existing] = await db.listCollections({ name: 'activities' }, { nameOnly: true }).toArray();

  if (!existing) {
    await db.createCollection('activities', { validator, ...VALIDATION });
  } else {
    await db.command({ collMod: 'activities', validator, ...VALIDATION });
  }

  await db.collection('activities').createIndex(
    { boardId: 1, createdAt: -1 },
    { name: 'activities_board_created' },
  );
  await db.collection('activities').createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 7_776_000, name: 'activities_created_ttl' },
  );
}

async function updateTasksValidator(db: Db): Promise<void> {
  await db.command({
    collMod: 'tasks',
    validator: requireValidator('tasks'),
    ...VALIDATION,
  });
}

export const phase5aMigration: Migration = {
  name: '005-phase-5a',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureActivitiesCollection(db);
    await updateTasksValidator(db);
  },
};
```

- [ ] **Step 5: Cập nhật migration runner**

Trong `apps/api/src/db/migration-runner.ts`:

```ts
import { phase5aMigration } from './migrations/005-phase-5a.js';

export const MIGRATION_005_NAME = '005-phase-5a';
export const LATEST_MIGRATION_NAME = MIGRATION_005_NAME;

const migrations: Migration[] = [
  phase2aMigration,
  phase2bMigration,
  phase3aMigration,
  phase4Migration,
  phase5aMigration,
];
```

- [ ] **Step 6: Chạy test migration/validator**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts
```

Expected: PASS; migration test thấy `005-phase-5a`, activities validator/index/TTL, task demote fields.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/migrations/005-phase-5a.ts apps/api/src/db/collection-validators.ts apps/api/src/db/migration-runner.ts apps/api/test/migrations.integration.test.ts apps/api/test/validators.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add phase 5a activity migration"
```

---

### Task 3: Activity model, serializer và ghi activity promote

**Files:**
- Create: `apps/api/src/modules/activities/activity.model.ts`
- Create: `apps/api/src/modules/activities/activity.service.ts`
- Modify: `apps/api/src/lib/serialize.ts`
- Modify: `apps/api/src/modules/items/promotion.service.ts`
- Test: `apps/api/test/activity.integration.test.ts`

**Interfaces:**
- Consumes: `ActivityAction`, `ActivityDto`, `ActivityModel`.
- Produces:
  - `recordActivity(input): Promise<ActivityDocument>`.
  - `listActivities(boardId, limit): Promise<ActivityDocument[]>`.
  - `serializeActivity(activity): ActivityDto`.
  - `PROMOTE_UNDO_WINDOW_MS = 600000`.
  - `promoteItem` trả thêm `activity`.

- [ ] **Step 1: Viết test promote activity thất bại**

Tạo `apps/api/test/activity.integration.test.ts`:

```ts
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { promoteItem } from '../src/modules/items/promotion.service.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
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

async function setupNote(content = 'Ý tưởng lớn') {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;

  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:note1',
          type: 'note',
          content,
          style: { color: 'yellow' },
          props: { color: 'yellow' },
          position: { x: 12, y: 34 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);

  const board = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!board || !actor) throw new Error('Board or actor missing');

  return {
    owner,
    boardId,
    board,
    actor,
    item: sync.body.data[0] as { _id: string; version: number },
  };
}

describe('promote activity', () => {
  it('ghi activity item.promoted trong transaction', async () => {
    const { owner, boardId, item } = await setupNote();
    const before = Date.now();

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(201);

    const activity = await ActivityModel.findOne({ boardId }).exec();
    expect(activity).not.toBeNull();
    expect(activity?.action).toBe('item.promoted');
    expect(activity?.refs.itemId?.toHexString()).toBe(item._id);
    expect(activity?.refs.taskId).toBeTruthy();
    expect(activity?.refs.columnId).toBe('todo');
    expect(activity?.snapshot).toMatchObject({
      taskTitle: 'Ý tưởng lớn',
      columnId: 'todo',
      taskVersionAtPromote: 1,
      itemVersionAtPromote: item.version + 1,
    });
    expect(activity?.undoableUntil?.getTime()).toBeGreaterThan(before + 9 * 60 * 1000);
    expect(activity?.undoableUntil?.getTime()).toBeLessThan(before + 11 * 60 * 1000);
  });

  it('promote lỗi không tạo activity', async () => {
    const { owner, boardId, item } = await setupNote();
    const first = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(201);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: first.body.data.item.version,
      })
      .expect(409);

    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
  });

  it('lỗi ghi activity rollback task và item', async () => {
    const { board, actor, item } = await setupNote('Rollback activity');

    await expect(
      promoteItem({
        board,
        itemId: item._id,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          expectedItemVersion: item.version,
        },
        beforeActivityInsert: async () => {
          throw new Error('activity fault');
        },
      }),
    ).rejects.toThrow('activity fault');

    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
    const saved = await ItemModel.findById(item._id);
    expect(saved?.promotedTaskId).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/activity.integration.test.ts
```

Expected: FAIL vì `ActivityModel`/hook chưa tồn tại.

- [ ] **Step 3: Tạo model activity**

`apps/api/src/modules/activities/activity.model.ts`:

```ts
import type { ActivityAction } from '@nextask/contracts';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface ActivityRefs {
  itemId: mongoose.Types.ObjectId | null;
  taskId: mongoose.Types.ObjectId | null;
  columnId: string | null;
}

export interface Activity {
  boardId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: ActivityAction;
  refs: ActivityRefs;
  snapshot: Record<string, unknown>;
  undoableUntil: Date | null;
  createdAt: Date;
}

export type ActivityDocument = HydratedDocument<Activity>;

const refsSchema = new Schema<ActivityRefs>(
  {
    itemId: { type: Schema.Types.ObjectId, default: null },
    taskId: { type: Schema.Types.ObjectId, default: null },
    columnId: { type: String, default: null },
  },
  { _id: false },
);

const activitySchema = new Schema<Activity>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ['item.promoted', 'item.demoted', 'item.promote_undone'],
      required: true,
    },
    refs: { type: refsSchema, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true, default: {} },
    undoableUntil: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const ActivityModel: Model<Activity> =
  (mongoose.models.Activity as Model<Activity> | undefined) ??
  mongoose.model<Activity>('Activity', activitySchema);
```

- [ ] **Step 4: Tạo activity service**

`apps/api/src/modules/activities/activity.service.ts`:

```ts
import type { ActivityAction } from '@nextask/contracts';
import type { ClientSession, Types } from 'mongoose';
import { ActivityModel, type ActivityDocument } from './activity.model.js';

export const PROMOTE_UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface RecordActivityInput {
  session: ClientSession;
  boardId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: ActivityAction;
  refs: {
    itemId: Types.ObjectId | null;
    taskId: Types.ObjectId | null;
    columnId: string | null;
  };
  snapshot: Record<string, unknown>;
  undoableUntil: Date | null;
}

export async function recordActivity(input: RecordActivityInput): Promise<ActivityDocument> {
  const [activity] = await ActivityModel.create(
    [
      {
        boardId: input.boardId,
        actorId: input.actorId,
        action: input.action,
        refs: input.refs,
        snapshot: input.snapshot,
        undoableUntil: input.undoableUntil,
      },
    ],
    { session: input.session },
  );
  if (!activity) throw new Error('Không tạo được activity');
  return activity;
}

export async function listActivities(
  boardId: Types.ObjectId,
  limit: number,
): Promise<ActivityDocument[]> {
  return ActivityModel.find({ boardId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .exec();
}
```

- [ ] **Step 5: Thêm serializer**

Trong `apps/api/src/lib/serialize.ts`:

```ts
import type { ActivityDto } from '@nextask/contracts';
import type { ActivityDocument } from '../modules/activities/activity.model.js';
```

Thêm cuối file:

```ts
export function serializeActivity(activity: ActivityDocument): ActivityDto {
  return {
    _id: activity._id.toHexString(),
    boardId: activity.boardId.toHexString(),
    actorId: activity.actorId.toHexString(),
    action: activity.action,
    refs: {
      itemId: activity.refs.itemId?.toHexString() ?? null,
      taskId: activity.refs.taskId?.toHexString() ?? null,
      columnId: activity.refs.columnId,
    },
    snapshot: activity.snapshot,
    undoableUntil: activity.undoableUntil?.toISOString() ?? null,
    createdAt: activity.createdAt.toISOString(),
  };
}
```

Cập nhật `serializeTask` theo contract mới:

```ts
    lifecycle: task.lifecycle,
    sourceItemId: task.sourceItemId?.toHexString() ?? null,
    origin: task.origin
      ? {
          itemId: task.origin.itemId.toHexString(),
          frameId: task.origin.frameId?.toHexString() ?? null,
          position: { x: task.origin.position.x, y: task.origin.position.y },
          voteCount: task.origin.voteCount,
          authorId: task.origin.authorId.toHexString(),
          itemCreatedAt: task.origin.itemCreatedAt.toISOString(),
        }
      : null,
    version: task.version,
    createdBy: task.createdBy.toHexString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    demotedAt: task.demotedAt?.toISOString() ?? null,
    demotedBy: task.demotedBy?.toHexString() ?? null,
```

- [ ] **Step 6: Cập nhật task model**

Trong `apps/api/src/modules/tasks/task.model.ts`, thêm interface:

```ts
  demotedAt: Date | null;
  demotedBy: mongoose.Types.ObjectId | null;
```

Thêm schema field sau `origin`:

```ts
    demotedAt: { type: Date, default: null },
    demotedBy: { type: Schema.Types.ObjectId, default: null },
```

- [ ] **Step 7: Cập nhật promote service**

Trong `apps/api/src/modules/items/promotion.service.ts`:

Import:

```ts
import type { ActivityDocument } from '../activities/activity.model.js';
import { PROMOTE_UNDO_WINDOW_MS, recordActivity } from '../activities/activity.service.js';
```

Thêm hook vào `PromoteInput`:

```ts
  beforeActivityInsert?: () => Promise<void>;
```

Đổi `PromoteResult`:

```ts
export interface PromoteResult {
  item: ItemDocument;
  task: TaskDocument;
  activity: ActivityDocument;
}
```

Sau `if (!updatedItem) { ... }` và trước `return { item: updatedItem, task };`, thay return bằng:

```ts
        await input.beforeActivityInsert?.();
        const activity = await recordActivity({
          session,
          boardId: input.board._id,
          actorId: input.actor._id,
          action: 'item.promoted',
          refs: {
            itemId: updatedItem._id,
            taskId: task._id,
            columnId: task.columnId,
          },
          snapshot: {
            taskTitle: task.title,
            columnId: task.columnId,
            taskVersionAtPromote: task.version,
            itemVersionAtPromote: updatedItem.version,
          },
          undoableUntil: new Date(Date.now() + PROMOTE_UNDO_WINDOW_MS),
        });

        return { item: updatedItem, task, activity };
```

- [ ] **Step 8: Chạy test promote activity**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/activity.integration.test.ts test/promotion.integration.test.ts
```

Expected: PASS cả promotion cũ và activity mới.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/activities/activity.model.ts apps/api/src/modules/activities/activity.service.ts apps/api/src/lib/serialize.ts apps/api/src/modules/tasks/task.model.ts apps/api/src/modules/items/promotion.service.ts apps/api/test/activity.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: record promote activity in transaction"
```

---

### Task 4: Demote service và endpoint

**Files:**
- Create: `apps/api/src/modules/tasks/demote.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Test: `apps/api/test/demote.integration.test.ts`

**Interfaces:**
- Consumes: `DemoteTaskRequest`, `recordActivity`, `versionConflict` details field.
- Produces:
  - `demoteTask(input: DemoteInput): Promise<DemoteResult>`.
  - `POST /api/v1/boards/:boardId/tasks/:taskId/demote`.

- [ ] **Step 1: Viết test demote thất bại**

Tạo `apps/api/test/demote.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { demoteTask } from '../src/modules/tasks/demote.service.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
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

async function setupPromotedTask(content = 'Ý tưởng demote') {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;

  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:note1',
          type: 'note',
          content,
          style: {},
          props: {},
          position: { x: 10, y: 20 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const item = sync.body.data[0] as { _id: string; version: number };

  const promoted = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
    .expect(201);

  const board = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!board || !actor) throw new Error('Board or actor missing');

  return {
    owner,
    boardId,
    board,
    actor,
    itemId: item._id,
    itemVersion: promoted.body.data.item.version as number,
    task: promoted.body.data.task as { _id: string; version: number },
  };
}

describe('demote', () => {
  it('demote thành công giữ task, cập nhật item và ghi activity', async () => {
    const { owner, boardId, itemId, itemVersion, task } = await setupPromotedTask();

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);

    expect(response.body.data.task).toMatchObject({
      lifecycle: 'demoted',
      version: task.version + 1,
    });
    expect(response.body.data.task.demotedAt).toBeTruthy();
    expect(response.body.data.item).toMatchObject({
      _id: itemId,
      promotedTaskId: null,
      version: itemVersion + 1,
    });
    expect(response.body.data.activity).toMatchObject({
      action: 'item.demoted',
      undoableUntil: null,
    });

    const savedTask = await TaskModel.findById(task._id).exec();
    expect(savedTask?.lifecycle).toBe('demoted');
    const savedItem = await ItemModel.findById(itemId).exec();
    expect(savedItem?.promotedTaskId).toBeNull();
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    expect(listed.body.data).toHaveLength(0);
  });

  it('demote lần hai trả ALREADY_DEMOTED và không thêm activity', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);

    const second = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version + 1, expectedItemVersion: itemVersion + 1 })
      .expect(409);

    expect(second.body.error.code).toBe('ALREADY_DEMOTED');
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('task tạo tay trả TASK_NOT_DEMOTABLE', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Manual' }).expect(201);
    const boardId = board.body.data._id as string;
    const task = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Manual task' })
      .expect(201);

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task.body.data._id}/demote`)
      .send({ expectedTaskVersion: 1, expectedItemVersion: 1 })
      .expect(409);
    expect(response.body.error.code).toBe('TASK_NOT_DEMOTABLE');
  });

  it('Member demote được task của board', async () => {
    const { boardId, itemVersion, task } = await setupPromotedTask('Member demote');
    const member = await registerAgent(app, 'member@example.com', 'Member');
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

    await member.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion })
      .expect(200);
  });

  it('task version lệch trả conflict field task', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version + 1, expectedItemVersion: itemVersion })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: task.version, field: 'task' },
    });
  });

  it('item version lệch trả conflict field item', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`)
      .send({ expectedTaskVersion: task.version, expectedItemVersion: itemVersion + 1 })
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: itemVersion, field: 'item' },
    });
  });

  it('hai demote đồng thời chỉ một thành công', async () => {
    const { owner, boardId, itemVersion, task } = await setupPromotedTask();
    const body = { expectedTaskVersion: task.version, expectedItemVersion: itemVersion };
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`).send(body),
      owner.agent.post(`/api/v1/boards/${boardId}/tasks/${task._id}/demote`).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('lỗi activity rollback task và item', async () => {
    const { board, actor, itemVersion, task } = await setupPromotedTask();
    await expect(
      demoteTask({
        board,
        taskId: task._id,
        actor,
        request: { expectedTaskVersion: task.version, expectedItemVersion: itemVersion },
        beforeActivityInsert: async () => {
          throw new Error('demote activity fault');
        },
      }),
    ).rejects.toThrow('demote activity fault');

    const savedTask = await TaskModel.findById(task._id).exec();
    expect(savedTask?.lifecycle).toBe('active');
    expect(savedTask?.version).toBe(task.version);
    const savedItem = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(savedItem?.promotedTaskId?.toHexString()).toBe(task._id);
    expect(savedItem?.version).toBe(itemVersion);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/demote.integration.test.ts
```

Expected: FAIL vì `demoteTask`/route chưa tồn tại.

- [ ] **Step 3: Tạo demote service**

`apps/api/src/modules/tasks/demote.service.ts`:

```ts
import { VERSION_CONFLICT_CODE, type DemoteTaskRequest } from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { ActivityDocument } from '../activities/activity.model.js';
import { recordActivity } from '../activities/activity.service.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import type { UserDocument } from '../users/user.model.js';
import { TaskModel, type TaskDocument } from './task.model.js';

export interface DemoteInput {
  board: BoardDocument;
  taskId: string;
  actor: UserDocument;
  request: DemoteTaskRequest;
  beforeActivityInsert?: () => Promise<void>;
}

export interface DemoteResult {
  task: TaskDocument;
  item: ItemDocument;
  activity: ActivityDocument;
}

function notDemotable(message: string): AppError {
  return new AppError(409, 'TASK_NOT_DEMOTABLE', message);
}

function demoteConflict(currentVersion: number, field: 'task' | 'item'): AppError {
  return new AppError(
    409,
    VERSION_CONFLICT_CODE,
    'Dữ liệu đã thay đổi, vui lòng tải lại',
    { currentVersion, field },
  );
}

function alreadyDemoted(): AppError {
  return new AppError(409, 'ALREADY_DEMOTED', 'Task đã được demote');
}

export async function demoteTask(input: DemoteInput): Promise<DemoteResult> {
  if (!Types.ObjectId.isValid(input.taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const existing = await TaskModel.findOne({
    _id: input.taskId,
    boardId: input.board._id,
  }).exec();
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  if (existing.lifecycle === 'demoted') throw alreadyDemoted();
  if (!existing.sourceItemId) throw notDemotable('Task không gắn với note');

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        const task = await TaskModel.findOne({
          _id: existing._id,
          boardId: input.board._id,
        }).session(session);
        if (!task) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
        if (task.lifecycle === 'demoted') throw alreadyDemoted();
        if (!task.sourceItemId) throw notDemotable('Task không gắn với note');

        const item = await ItemModel.findOne({
          _id: task.sourceItemId,
          boardId: input.board._id,
        }).session(session);
        if (!item) throw notDemotable('Note nguồn không còn tồn tại');
        if (task.version !== input.request.expectedTaskVersion) {
          throw demoteConflict(task.version, 'task');
        }
        if (item.version !== input.request.expectedItemVersion) {
          throw demoteConflict(item.version, 'item');
        }
        if (!item.promotedTaskId || !item.promotedTaskId.equals(task._id)) {
          throw notDemotable('Task không còn liên kết với note');
        }

        const now = new Date();
        const updatedTask = await TaskModel.findOneAndUpdate(
          {
            _id: task._id,
            boardId: input.board._id,
            lifecycle: 'active',
            version: input.request.expectedTaskVersion,
          },
          {
            $set: {
              lifecycle: 'demoted',
              demotedAt: now,
              demotedBy: input.actor._id,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedTask) {
          const current = await TaskModel.findOne({
            _id: task._id,
            boardId: input.board._id,
          })
            .session(session)
            .exec();
          if (!current) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
          if (current.lifecycle === 'demoted') throw alreadyDemoted();
          throw demoteConflict(current.version, 'task');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            promotedTaskId: task._id,
            version: input.request.expectedItemVersion,
          },
          { $set: { promotedTaskId: null }, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          const current = await ItemModel.findOne({
            _id: item._id,
            boardId: input.board._id,
          })
            .session(session)
            .exec();
          if (!current) throw notDemotable('Note nguồn không còn tồn tại');
          throw demoteConflict(current.version, 'item');
        }

        await input.beforeActivityInsert?.();
        const activity = await recordActivity({
          session,
          boardId: input.board._id,
          actorId: input.actor._id,
          action: 'item.demoted',
          refs: {
            itemId: updatedItem._id,
            taskId: updatedTask._id,
            columnId: updatedTask.columnId,
          },
          snapshot: {
            taskTitle: updatedTask.title,
            columnId: updatedTask.columnId,
          },
          undoableUntil: null,
        });

        return { task: updatedTask, item: updatedItem, activity };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );

    if (!result) {
      throw new AppError(
        503,
        'TRANSACTION_OUTCOME_UNKNOWN',
        'Không xác định được kết quả transaction',
      );
    }
    return result;
  } finally {
    await session.endSession();
  }
}
```

- [ ] **Step 4: Thêm route demote**

Trong `apps/api/src/modules/tasks/task.router.ts`:

Import:

```ts
  demoteTaskRequestSchema,
  type DemoteTaskRequest,
```

```ts
import { serializeActivity, serializeItem, serializeTask } from '../../lib/serialize.js';
import { demoteTask } from './demote.service.js';
```

Thêm trước `return router;`:

```ts
  router.post('/:taskId/demote', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const params = request.params as { taskId?: string };
    if (!params.taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
    }

    const input: DemoteTaskRequest = demoteTaskRequestSchema.parse(request.body);
    const result = await demoteTask({
      board: request.board,
      taskId: params.taskId,
      actor: request.user,
      request: input,
    });

    response.json({
      data: {
        task: serializeTask(result.task),
        item: serializeItem(result.item),
        activity: serializeActivity(result.activity),
      },
      meta: { requestId: request.requestId },
    });
  });
```

- [ ] **Step 5: Chạy test demote**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/demote.integration.test.ts test/activity.integration.test.ts test/promotion.integration.test.ts
```

Expected: PASS toàn bộ test demote/activity/promotion.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/tasks/demote.service.ts apps/api/src/modules/tasks/task.router.ts apps/api/test/demote.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add demote transaction endpoint"
```

---

### Task 5: API đọc activity

**Files:**
- Create: `apps/api/src/modules/activities/activity.router.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Test: `apps/api/test/activities.integration.test.ts`

**Interfaces:**
- Consumes: `activityListQuerySchema`, `listActivities`, `serializeActivity`.
- Produces: `GET /api/v1/boards/:boardId/activities?limit=50`.

- [ ] **Step 1: Viết test API activity thất bại**

Tạo `apps/api/test/activities.integration.test.ts`:

```ts
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

async function setupActivityBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Activity' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:a',
          type: 'note',
          content: 'Activity note',
          style: {},
          props: {},
          position: { x: 1, y: 2 },
          size: { w: 100, h: 100 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
        {
          shapeId: 'shape:b',
          type: 'note',
          content: 'Second note',
          style: {},
          props: {},
          position: { x: 3, y: 4 },
          size: { w: 100, h: 100 },
          rotation: 0,
          tldrawIndex: 'a2',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const first = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${sync.body.data[0]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: sync.body.data[0].version })
    .expect(201);
  await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${sync.body.data[1]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: sync.body.data[1].version })
    .expect(201);
  await owner.agent
    .post(`/api/v1/boards/${boardId}/tasks/${first.body.data.task._id}/demote`)
    .send({
      expectedTaskVersion: first.body.data.task.version,
      expectedItemVersion: first.body.data.item.version,
    })
    .expect(200);
  return { owner, boardId };
}

describe('activity API', () => {
  it('trả activity mới nhất trước, đúng board', async () => {
    const { owner, boardId } = await setupActivityBoard();

    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/activities?limit=2`)
      .expect(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].action).toBe('item.demoted');
    expect(response.body.data[1].action).toBe('item.promoted');
    expect(response.body.data.every((entry: { boardId: string }) => entry.boardId === boardId))
      .toBe(true);
  });

  it('Member đọc được, non-member bị 403', async () => {
    const { owner, boardId } = await setupActivityBoard();
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
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

    await member.agent.get(`/api/v1/boards/${boardId}/activities`).expect(200);
    await stranger.agent.get(`/api/v1/boards/${boardId}/activities`).expect(403);
    await owner.agent.get(`/api/v1/boards/${boardId}/activities`).expect(200);
  });

  it('từ chối limit ngoài 1..100', async () => {
    const { owner, boardId } = await setupActivityBoard();
    await owner.agent.get(`/api/v1/boards/${boardId}/activities?limit=0`).expect(422);
    await owner.agent.get(`/api/v1/boards/${boardId}/activities?limit=101`).expect(422);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/activities.integration.test.ts
```

Expected: FAIL 404 vì route activities chưa mount.

- [ ] **Step 3: Tạo activity router**

`apps/api/src/modules/activities/activity.router.ts`:

```ts
import { activityListQuerySchema, type ActivityDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeActivity } from '../../lib/serialize.js';
import { listActivities } from './activity.service.js';

export function createActivitiesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const query = activityListQuerySchema.parse(request.query);
    const activities = await listActivities(request.board._id, query.limit);
    const data: ActivityDto[] = activities.map(serializeActivity);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
```

- [ ] **Step 4: Mount router**

Trong `apps/api/src/modules/boards/board.router.ts`:

```ts
import { createActivitiesRouter } from '../activities/activity.router.js';
```

Thêm sau tasks:

```ts
  router.use('/:boardId/activities', createActivitiesRouter());
```

- [ ] **Step 5: Chạy test activity API**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/activities.integration.test.ts test/demote.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/activities/activity.router.ts apps/api/src/modules/boards/board.router.ts apps/api/test/activities.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: expose board activity API"
```

---

### Task 6: Web Demote và Activity panel

**Files:**
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/features/workspace/demote-task-dialog.tsx`
- Create: `apps/web/features/workspace/activity-panel.tsx`
- Modify: `apps/web/features/workspace/kanban-board.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`

**Interfaces:**
- Consumes: `DemoteTaskRequest`, `ActivityDto`, `demoteTaskResponseSchema`,
  `activitiesResponseSchema`.
- Produces:
  - `demoteTask(boardId, taskId, input): Promise<{ task; item; activity }>`.
  - `getActivities(boardId, limit=50): Promise<ActivityDto[]>`.
  - Dialog demote + tab hoạt động.

- [ ] **Step 1: Cập nhật API client**

Trong `apps/web/lib/api.ts`, thêm import schema/type:

```ts
  activitiesResponseSchema,
  demoteTaskRequestSchema,
  demoteTaskResponseSchema,
  type ActivityDto,
  type DemoteTaskRequest,
```

Thêm hàm sau `moveTask`:

```ts
export async function demoteTask(
  boardId: string,
  taskId: string,
  input: DemoteTaskRequest,
): Promise<{ task: TaskDto; item: ItemDto; activity: ActivityDto }> {
  const body = demoteTaskRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/tasks/${taskId}/demote`, demoteTaskResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}

export async function getActivities(boardId: string, limit = 50): Promise<ActivityDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return (
    await request(
      `/boards/${boardId}/activities?${params.toString()}`,
      activitiesResponseSchema,
    )
  ).data;
}
```

- [ ] **Step 2: Tạo dialog demote**

`apps/web/features/workspace/demote-task-dialog.tsx`:

```tsx
'use client';

import type { TaskDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface DemoteTaskDialogProps {
  task: TaskDto;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DemoteTaskDialog({ task, onClose, onConfirm }: DemoteTaskDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không demote được task.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="demote-task-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
              Demote
            </p>
            <h2 id="demote-task-title" className="mt-1 text-xl font-semibold text-stone-900">
              Đưa task về whiteboard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-40"
          >
            Đóng
          </button>
        </div>

        <blockquote className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-stone-700">
          {task.title}
        </blockquote>
        <p className="mt-3 text-sm text-stone-600">
          Task sẽ rời Kanban nhưng note gốc vẫn còn trên whiteboard. Lịch sử task được giữ lại.
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Đang demote...' : 'Demote task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Tạo ActivityPanel**

`apps/web/features/workspace/activity-panel.tsx`:

```tsx
'use client';

import type { ActivityDto, BoardMemberDetailDto } from '@nextask/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getActivities } from '../../lib/api';

interface ActivityPanelProps {
  boardId: string;
  members: BoardMemberDetailDto[];
  refreshKey: number;
}

const actionLabels: Record<ActivityDto['action'], string> = {
  'item.promoted': 'Đã promote',
  'item.demoted': 'Đã demote',
  'item.promote_undone': 'Đã hoàn tác promote',
};

export function ActivityPanel({ boardId, members, refreshKey }: ActivityPanelProps) {
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const memberNames = new Map(members.map((member) => [member.userId, member.name]));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setActivities(await getActivities(boardId));
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Không tải được hoạt động.',
      );
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-stone-900">Hoạt động</h2>
          <p className="text-xs text-stone-500">Promote và demote gần đây.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-500"
        >
          Làm mới
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? <p className="p-3 text-sm text-stone-500">Đang tải hoạt động...</p> : null}
        {error ? (
          <div className="m-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {!loading && !error && activities.length === 0 ? (
          <p className="p-3 text-sm text-stone-500">Chưa có hoạt động</p>
        ) : null}
        {!loading && !error ? (
          <ul className="space-y-2">
            {activities.map((activity) => (
              <li
                key={activity._id}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-stone-800">
                    {actionLabels[activity.action]} ·{' '}
                    {memberNames.get(activity.actorId) ?? 'Không rõ'}
                  </p>
                  <time className="text-[10px] text-stone-400" dateTime={activity.createdAt}>
                    {new Intl.DateTimeFormat('vi-VN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(activity.createdAt))}
                  </time>
                </div>
                <p className="mt-1 text-sm text-stone-700">
                  {typeof activity.snapshot.taskTitle === 'string'
                    ? activity.snapshot.taskTitle
                    : 'Task'}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Thêm nút Demote vào Kanban**

Trong `apps/web/features/workspace/kanban-board.tsx`:

Thêm prop interface:

```ts
  onDemoteTask: (task: TaskDto) => void;
```

Destructure `onDemoteTask`.

Thay block nút `Sửa` hiện tại bằng:

```tsx
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditTask(task);
                          }}
                          className="text-[11px] font-medium text-sky-700 hover:underline"
                        >
                          Sửa
                        </button>
                        {task.sourceItemId ? (
                          <button
                            type="button"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onDemoteTask(task);
                            }}
                            className="text-[11px] font-medium text-rose-700 hover:underline"
                          >
                            Demote
                          </button>
                        ) : null}
                      </div>
```

- [ ] **Step 5: Cập nhật BoardWorkspace**

Import:

```ts
import { demoteTask } from '../../lib/api';
import { ActivityPanel } from './activity-panel';
import { DemoteTaskDialog } from './demote-task-dialog';
```

Nếu chỉ dùng `ActivityDto` trong state không cần; có thể bỏ import này.

State mới:

```ts
  const [demoteTarget, setDemoteTarget] = useState<TaskDto | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'kanban' | 'activities'>('kanban');
  const [activityRevision, setActivityRevision] = useState(0);
```

Trong `handleRealtimeEvent`, thêm `setActivityRevision((value) => value + 1);` ngay trước `return` của nhánh `task:demoted` và nhánh `item:` (sau `refreshRealtimeSnapshot`).

Trong `handlePromote` sau `setNotice('Đã promote ghi chú thành task');`, thêm:

```ts
        setActivityRevision((value) => value + 1);
```

Thêm handler demote trước `handleRenamed`:

```ts
  const handleDemote = useCallback(async () => {
    if (!demoteTarget || !data) return;
    const item = data.items.find((entry) => entry._id === demoteTarget.sourceItemId);
    if (!item) {
      setDemoteTarget(null);
      setNotice('Không tìm thấy note nguồn; đã tải lại dữ liệu.');
      await loadWorkspace();
      return;
    }

    try {
      const result = await demoteTask(boardId, demoteTarget._id, {
        expectedTaskVersion: demoteTarget.version,
        expectedItemVersion: item.version,
      });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((entry) =>
            entry._id === result.item._id ? result.item : entry,
          ),
          tasks: current.tasks.filter((task) => task._id !== result.task._id),
        };
      });
      setDemoteTarget(null);
      setActivityRevision((value) => value + 1);
      setWhiteboardRevision((value) => value + 1);
      setNotice('Đã demote task; note vẫn còn trên whiteboard.');
    } catch (caught) {
      if (isVersionConflict(caught)) {
        setDemoteTarget(null);
        setNotice('Task hoặc note vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
        await loadWorkspace();
        await loadTasks(filters);
        return;
      }
      if (
        caught instanceof ApiClientError &&
        (caught.code === 'ALREADY_DEMOTED' || caught.code === 'TASK_NOT_DEMOTABLE')
      ) {
        setDemoteTarget(null);
        setNotice(caught.message);
        await loadWorkspace();
        await loadTasks(filters);
        return;
      }
      throw caught;
    }
  }, [boardId, data, demoteTarget, filters, loadTasks, loadWorkspace]);
```

Thay khối `<aside ...>` hiện tại bằng:

```tsx
        <aside className="flex h-[440px] w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center gap-1 border-b border-stone-200 px-3 py-2">
            <button
              type="button"
              onClick={() => setSidebarTab('kanban')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                sidebarTab === 'kanban'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('activities')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                sidebarTab === 'activities'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              Hoạt động
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {sidebarTab === 'kanban' ? (
              <KanbanBoard
                board={data.board}
                tasks={data.tasks}
                members={data.members}
                filters={filters}
                hasMore={hasMoreTasks}
                onFiltersChange={setFilters}
                onEditTask={setEditingTask}
                onCreateTask={setCreatingColumnId}
                onMoveTask={handleMoveTask}
                onDemoteTask={setDemoteTarget}
              />
            ) : (
              <ActivityPanel
                boardId={boardId}
                members={data.members}
                refreshKey={activityRevision}
              />
            )}
          </div>
        </aside>
```

Thêm dialog cạnh các dialog khác:

```tsx
      {demoteTarget ? (
        <DemoteTaskDialog
          task={demoteTarget}
          onClose={() => setDemoteTarget(null)}
          onConfirm={handleDemote}
        />
      ) : null}
```

- [ ] **Step 6: Typecheck/build**

```bash
npm run typecheck
npm run build:web
npm run lint
npm run format:check
```

Expected: PASS; nếu Prettier báo file mới, chạy `npx prettier --write` đúng các file đó rồi kiểm tra lại.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/demote-task-dialog.tsx apps/web/features/workspace/activity-panel.tsx apps/web/features/workspace/kanban-board.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add demote dialog and activity panel"
```

---

### Task 7: Migration rehearsal và browser verification

**Files:**
- Modify: `docs/session-log.md`
- Modify: `docs/phases/05a-demote-activity.md`

**Interfaces:**
- Consumes: migration 005, API/web demote.
- Produces: app DB migrated, browser evidence.

- [ ] **Step 1: Backup app DB**

```bash
docker compose exec -T mongo mongodump --db nextask --archive --gzip > backups/nextask-before-5a-2026-11-10.gz
gzip -t backups/nextask-before-5a-2026-11-10.gz
ls -lh backups/nextask-before-5a-2026-11-10.gz
```

Expected: file tồn tại, `gzip -t` pass.

- [ ] **Step 2: Rehearsal 005**

```bash
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_5a_rehearsal.*' < backups/nextask-before-5a-2026-11-10.gz
docker compose build migrate
docker compose run --rm -e MONGODB_URI='mongodb://mongo:27017/nextask_5a_rehearsal?replicaSet=rs0' migrate
```

Expected: `applied: ["005-phase-5a"]`.

- [ ] **Step 3: Verify rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_5a_rehearsal");
printjson({
  migrations: db.schema_migrations.find().sort({_id:1}).toArray().map((m) => m._id),
  activityValidator: db.getCollectionInfos({name:"activities"})[0].options.validator,
  activityIndexes: db.activities.getIndexes().map((i) => ({name:i.name, key:i.key, expireAfterSeconds:i.expireAfterSeconds})),
  taskDemoteFields: Object.keys(db.getCollectionInfos({name:"tasks"})[0].options.validator.$jsonSchema.properties).filter((key) => key.startsWith("demoted")),
  counts: { boards: db.boards.countDocuments(), items: db.items.countDocuments(), tasks: db.tasks.countDocuments(), activities: db.activities.countDocuments() },
});
'
```

Expected: migrations 001–005; activities validator strict; indexes TTL 7776000; task fields `demotedAt`, `demotedBy`; counts không đổi.

- [ ] **Step 4: Apply app DB và rebuild**

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_5a_rehearsal").dropDatabase()'
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: 005 applied; api/web/mongo healthy; health vẫn `0.4.0`.

- [ ] **Step 5: Browser demote**

Dùng browser-use, chỉ một tab in-app:

1. Đăng nhập owner; trong page chạy script tạo board tạm, note và promote:

```js
async () => {
  const base = 'http://localhost:4000/api/v1';
  const headers = { 'Content-Type': 'application/json' };
  const board = await (await fetch(`${base}/boards`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ name: 'Phase 5A E2E' }),
  })).json();
  const boardId = board.data._id;
  const synced = await (await fetch(`${base}/boards/${boardId}/items`, {
    method: 'PUT', credentials: 'include', headers,
    body: JSON.stringify({
      items: [{
        shapeId: 'shape:phase5a', type: 'note', content: 'Phase 5A note',
        style: {}, props: {}, position: { x: 20, y: 30 }, size: { w: 200, h: 200 },
        rotation: 0, tldrawIndex: 'a1', parentFrameId: null, expectedVersion: 0,
      }],
      deleted: [],
    }),
  })).json();
  const item = synced.data[0];
  const promoted = await (await fetch(`${base}/boards/${boardId}/items/${item._id}/promote`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version }),
  })).json();
  const state = { boardId, itemId: item._id, taskId: promoted.data.task._id };
  localStorage.setItem('phase5a', JSON.stringify(state));
  return state;
}
```

2. Mở URL `http://localhost:3000/boards/` + `boardId` trả về ở bước 1; reload workspace.
3. Mở tab `Hoạt động`: thấy dòng `Đã promote`; quay lại tab `Kanban`.
4. Bấm `Demote` trên card, xác nhận.
5. Mở tab `Hoạt động`: có `Đã demote`; card biến mất; badge note biến mất; notice thành công.
6. Reload: task vẫn không có trên Kanban; note vẫn còn; activity còn.
7. Tạo task tay bằng fetch:

```js
async () => {
  const boardId = JSON.parse(localStorage.getItem('phase5a')).boardId;
  const response = await fetch(`http://localhost:4000/api/v1/boards/${boardId}/tasks`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId: 'todo', title: 'Manual task 5A' }),
  });
  return response.status;
}
```

Expected: card tạo tay không có nút `Demote`.

- [ ] **Step 6: Browser client thứ hai**

1. Trong tab đang mở board tạm, tạo note thứ hai và promote bằng fetch:

```js
async () => {
  const boardId = JSON.parse(localStorage.getItem('phase5a')).boardId;
  const base = 'http://localhost:4000/api/v1';
  const headers = { 'Content-Type': 'application/json' };
  const synced = await (await fetch(`${base}/boards/${boardId}/items`, {
    method: 'PUT', credentials: 'include', headers,
    body: JSON.stringify({
      items: [{
        shapeId: 'shape:phase5a-second', type: 'note', content: 'Second note',
        style: {}, props: {}, position: { x: 240, y: 30 }, size: { w: 200, h: 200 },
        rotation: 0, tldrawIndex: 'a2', parentFrameId: null, expectedVersion: 0,
      }],
      deleted: [],
    }),
  })).json();
  const item = synced.data.find((entry) => entry.shapeId === 'shape:phase5a-second');
  const promoted = await (await fetch(`${base}/boards/${boardId}/items/${item._id}/promote`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version }),
  })).json();
  const second = {
    taskId: promoted.data.task._id,
    taskVersion: promoted.data.task.version,
    itemVersion: promoted.data.item.version,
  };
  localStorage.setItem('phase5a-second', JSON.stringify(second));
  return second;
}
```

2. Reload workspace để thấy card mới.
3. Dùng fetch (client thứ hai) demote task vừa promote:

```js
async () => {
  const boardId = JSON.parse(localStorage.getItem('phase5a')).boardId;
  const { taskId, taskVersion, itemVersion } = JSON.parse(
    localStorage.getItem('phase5a-second'),
  );
  const response = await fetch(`http://localhost:4000/api/v1/boards/${boardId}/tasks/${taskId}/demote`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedTaskVersion: taskVersion, expectedItemVersion: itemVersion }),
  });
  return { status: response.status, body: await response.json() };
}
```

Expected: Kanban tự gỡ task, badge note biến mất, activity panel tự làm mới sau event;
không có lỗi console/500.

- [ ] **Step 7: Cleanup dữ liệu tạm**

Lấy `boardId` của board tạm, rồi:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const board = db.boards.findOne({ name: "Phase 5A E2E" });
if (!board) throw new Error("Không tìm thấy board tạm");
const boardId = board._id;
db.activities.deleteMany({ boardId });
db.tasks.deleteMany({ boardId });
db.items.deleteMany({ boardId });
db.boards.deleteOne({ _id: boardId });
printjson({ boards: db.boards.countDocuments(), activities: db.activities.countDocuments() });
'
```

Expected: board tạm và dữ liệu liên quan bị xóa; board thật không đổi.

- [ ] **Step 8: Ghi evidence**

Thêm vào `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 5A verification

- Backup `nextask-before-5a-2026-11-10.gz`; rehearsal/app áp `005-phase-5a`.
- Activities validator/index/TTL; tasks validator có `demotedAt`/`demotedBy`; counts giữ nguyên.
- Browser: dialog Demote gỡ task, badge note biến mất, activity panel cập nhật; reload giữ trạng thái.
- Client thứ hai demote cập nhật tab đang mở; manual task không có nút Demote.
- Dữ liệu board tạm đã xóa; health `0.4.0`.
```

Cập nhật kết quả ngắn trong `docs/phases/05a-demote-activity.md`: thêm mục `Kết quả
verification 2026-11-10` ngay trước `Tiêu chí chấp nhận`.

- [ ] **Step 9: Commit**

```bash
git add docs/session-log.md docs/phases/05a-demote-activity.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5a verification"
```

---

### Task 8: Gates, docs và merge release/v0.5

**Files:**
- Modify: `docs/phases/05a-demote-activity.md`
- Modify: `docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: code, migration, browser evidence.
- Produces: 5A trên `release/v0.5`; feature xóa; main/tag không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: trạng thái hoàn thành, kết quả migration/test/browser, merge commit.
- Plan: trạng thái thực thi, commit list, điều chỉnh thực tế.
- Architecture: Phase 5A đã có demote/activity; activity TTL; task demoted fields.
- MongoDB notes: transaction demote, activity validator/TTL, at-least-once/realtime.
- README: demote, activity panel, API activity, migration 005/backup.
- Git workflow: release/v0.5, feature merge/xóa, main/tag v0.4.0 giữ nguyên.
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
git add docs/phases/05a-demote-activity.md docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5a verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.5
git merge --no-ff feat/phase-5a-demote-activity -m "merge: phase 5a demote and activity"
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

- [ ] **Step 6: Docs release record và xóa feature**

Sau khi biết merge commit, cập nhật spec/plan/session-log/git-workflow với hash và kết quả
gate release; commit trên `release/v0.5`:

```bash
git add docs/phases/05a-demote-activity.md docs/superpowers/plans/2026-11-10-phase-5a-demote-activity.md docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5a release merge"
git branch -d feat/phase-5a-demote-activity
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: `main` vẫn `9fd19b6`; tag `v0.2.0`, `v0.3.0`, `v0.4.0`; release chứa 5A.

- [ ] **Step 7: Không merge main, không bump 0.5.0**

Không chạy merge `release/v0.5` vào `main`. Ghi trạng thái chờ duyệt phát hành v0.5; tag
`v0.4.0` và version `0.4.0` giữ nguyên.

---

## Self-review checklist

- Spec coverage:
  - Contracts/TaskDto: Task 1.
  - Migration 005/validator/TTL: Task 2.
  - Activity model/promote activity: Task 3.
  - Demote service/endpoint: Task 4.
  - Activity read API: Task 5.
  - Web demote/activity/realtime: Task 6.
  - Rehearsal/browser: Task 7.
  - Gates/merge: Task 8.
- Không hard delete task; không reset vị trí note; không live-merge tldraw.
- Activity 5A chỉ promote/demote; undo để 5B.
- Type/field thống nhất: `DemoteTaskRequest`, `ActivityDto`, `demoteTask`,
  `getActivities`, `recordActivity`, `PROMOTE_UNDO_WINDOW_MS`, `TASK_NOT_DEMOTABLE`.
- Không task nào merge `main`, bump `0.5.0` hoặc tạo tag mới.
