# NexTask Phase 5B - Batch Promote and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm batch promote nguyên tử từ multi-select note và undo từng activity promote trong 10 phút, kèm fault injection chứng minh rollback.

**Architecture:** Batch promote dùng một transaction MongoDB để tạo task, update item và ghi activity cho từng note; mỗi activity có `undoableUntil` 10 phút. Undo đọc activity, kiểm tra task version/lifecycle/item link, rồi transaction demote task, clear item và ghi `item.promote_undone`. Web thêm multi-select/batch dialog và Undo trong activity panel; realtime dùng Change Streams hiện có.

**Tech Stack:** Node 26, TypeScript 6.0.3, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, Next.js 16.4.3, React 19.3.1, tldraw 5.5.2, Vitest 5.0.5.

**Spec:** `docs/phases/05b-batch-undo.md`

**Branch:** `feat/phase-5b-batch-undo` từ `release/v0.5` (5A tại `0a34cce`). Không merge `main`, không bump `0.5.0`, tag `v0.4.0` giữ nguyên.

**Trạng thái thực thi:** Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.5` bằng
`--no-ff` (`f2c194d`); feature branch đã xóa. Commit chính:

- `234aab9` `docs: specify phase 5b batch and undo`
- `9a6c2c6` `docs: plan phase 5b batch and undo`
- `ff0bce8` `feat: add batch and undo contracts`
- `ab9c50b` `feat: add atomic batch promote`
- `674d690` `feat: add promote undo transaction`
- `709105a` `feat: add batch promote UI`
- `78dfc01` `feat: add undo promote UI`
- `a9d2120` `docs: record phase 5b verification`
- `c333e1d` `docs: record phase 5b verification`
- `f2c194d` `merge: phase 5b batch and undo` vào `release/v0.5`

Feature gate: typecheck/lint/format pass; full suite 31 file, 144 test ba lần
22.72/22.88/22.77 s. Release gate: typecheck/lint/format pass; full suite 31 file,
144 test ba lần 25.23/22.74/22.92 s.

**Điều chỉnh thực tế:**

- Mongoose 9 yêu cầu `create()` với array + session phải có `ordered: true`; batch dùng
  option này.
- Browser verification dùng Ctrl+A để chọn 3 note; batch/undo UI và guard stale đã chạy.
- Note tạo qua API có content rỗng sau whiteboard sync là hành vi có sẵn, không thuộc 5B;
  batch/undo không thay đổi cơ chế sync này.
- Full suite tăng lên 31 file, 144 test do thêm batch/undo contract và integration test.

## Global Constraints

- MongoDB replica set thật cho test; không mock DB/transaction/Change Streams.
- Batch tối đa 100 item cùng board; một transaction; một lỗi abort toàn bộ.
- Mỗi item batch có task/item update/activity riêng; order sinh tuần tự.
- Undo chỉ activity `item.promoted`, trong 10 phút; task version/lifecycle/item link phải còn hợp lệ.
- Undo ghi activity `item.promote_undone`; không xóa activity gốc.
- Không thêm collection/migration; dùng `activities` từ 5A.
- Fault injection chỉ qua hook test, không expose HTTP/env.
- Không thêm event realtime mới; dùng event hiện có.
- Không bump `0.5.0`; không merge `main`; tag `v0.4.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Full suite phải pass ba lần trước khi merge; không nới timeout.

---

## File Structure

- `packages/contracts/src/promotion.ts` — batch request/response, undo response, error codes.
- `packages/contracts/src/index.ts` — export promotion.
- `apps/api/src/modules/items/promotion-batch.service.ts` — batch transaction.
- `apps/api/src/modules/items/item.router.ts` — `POST /promote-batch`.
- `apps/api/src/modules/activities/undo.service.ts` — undo transaction.
- `apps/api/src/modules/activities/activity.router.ts` — `POST /:activityId/undo`.
- `apps/api/src/lib/serialize.ts` — đã có serialize task/item/activity; không đổi shape.
- `apps/web/lib/api.ts` — promoteBatch/undoPromote.
- `apps/web/features/whiteboard/whiteboard.tsx` — prop `onPromoteBatchRequest`.
- `apps/web/features/whiteboard/whiteboard-canvas.tsx` — multi-select và batch button.
- `apps/web/features/whiteboard/batch-promote-dialog.tsx` — dialog batch.
- `apps/web/features/workspace/activity-panel.tsx` — nút Undo.
- `apps/web/features/workspace/undo-promote-dialog.tsx` — xác nhận undo.
- `apps/web/features/workspace/board-workspace.tsx` — state/handler batch/undo.

---

### Task 0: Docs baseline và branch

**Files:**
- Modify: `docs/session-log.md`
- Create: `docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md`

**Interfaces:**
- Consumes: spec đã duyệt `docs/phases/05b-batch-undo.md`.
- Produces: plan 5B trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git status --short --branch
git log --oneline -1
```

Expected: `feat/phase-5b-batch-undo`; không có file dirty ngoài plan.

- [ ] **Step 2: Ghi session log**

Thêm cuối `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 5B plan

- Spec `docs/phases/05b-batch-undo.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md`.
- Phạm vi: batch promote multi-select, undo từng activity, fault injection.
- Bắt đầu Inline Execution; không merge `main`.
```

- [ ] **Step 3: Commit plan**

```bash
git add docs/session-log.md docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 5b batch and undo"
```

---

### Task 1: Contracts batch/undo và lỗi mới

**Files:**
- Create: `packages/contracts/src/promotion.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/api/test/batch-undo-contracts.test.ts`

**Interfaces:**
- Consumes: `itemSchema`, `taskSchema`, `activitySchema`, `envelopeMetaSchema`.
- Produces:
  - `batchPromoteRequestSchema`, `batchPromoteResponseSchema`,
    `batchPromoteConflictDetailsSchema`, `undoPromoteResponseSchema`.
  - `BatchPromoteRequest`, `BatchPromoteResponse`, `BatchPromoteItem`.
  - `BATCH_PROMOTE_CONFLICT_CODE`, `UNDO_NOT_AVAILABLE_CODE`,
    `UNDO_NO_LONGER_SAFE_CODE`.

- [ ] **Step 1: Viết test contract thất bại**

Tạo `apps/api/test/batch-undo-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BATCH_PROMOTE_CONFLICT_CODE,
  UNDO_NOT_AVAILABLE_CODE,
  UNDO_NO_LONGER_SAFE_CODE,
  batchPromoteRequestSchema,
  batchPromoteResponseSchema,
  undoPromoteResponseSchema,
} from '@nextask/contracts';

describe('phase 5b contracts', () => {
  it('batch request default assignToMe, tối đa 100 và itemId không trùng', () => {
    const parsed = batchPromoteRequestSchema.parse({
      columnId: 'todo',
      items: [{ itemId: '64b000000000000000000001', expectedItemVersion: 2 }],
    });
    expect(parsed.assignToMe).toBe(false);
    expect(parsed.items).toHaveLength(1);

    expect(() =>
      batchPromoteRequestSchema.parse({
        columnId: 'todo',
        items: [
          { itemId: '64b000000000000000000001', expectedItemVersion: 1 },
          { itemId: '64b000000000000000000001', expectedItemVersion: 1 },
        ],
      }),
    ).toThrow();

    expect(() =>
      batchPromoteRequestSchema.parse({
        columnId: 'todo',
        items: Array.from({ length: 101 }, (_, index) => ({
          itemId: `64b00000000000000000${String(index).padStart(4, '0')}`,
          expectedItemVersion: 1,
        })),
      }),
    ).toThrow();
  });

  it('batch response parse items/tasks/activities', () => {
    expect(
      batchPromoteResponseSchema.parse({
        data: { items: [], tasks: [], activities: [] },
        meta: { requestId: 'req' },
      }),
    ).toMatchObject({ data: { items: [], tasks: [], activities: [] } });
  });

  it('export error codes 5B', () => {
    expect(BATCH_PROMOTE_CONFLICT_CODE).toBe('BATCH_PROMOTE_CONFLICT');
    expect(UNDO_NOT_AVAILABLE_CODE).toBe('UNDO_NOT_AVAILABLE');
    expect(UNDO_NO_LONGER_SAFE_CODE).toBe('UNDO_NO_LONGER_SAFE');
    expect(undoPromoteResponseSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/batch-undo-contracts.test.ts
```

Expected: FAIL vì contracts chưa export batch/undo.

- [ ] **Step 3: Tạo `packages/contracts/src/promotion.ts`**

```ts
import { z } from 'zod';
import { activitySchema } from './activity.js';
import { envelopeMetaSchema } from './envelope.js';
import { itemSchema } from './item.js';
import { objectIdSchema } from './common.js';
import { taskSchema } from './task.js';

export const BATCH_PROMOTE_CONFLICT_CODE = 'BATCH_PROMOTE_CONFLICT' as const;
export const UNDO_NOT_AVAILABLE_CODE = 'UNDO_NOT_AVAILABLE' as const;
export const UNDO_NO_LONGER_SAFE_CODE = 'UNDO_NO_LONGER_SAFE' as const;

export const batchPromoteItemSchema = z.object({
  itemId: objectIdSchema,
  expectedItemVersion: z.number().int().positive(),
});

export const batchPromoteRequestSchema = z
  .object({
    columnId: z.string().min(1).max(50),
    assignToMe: z.boolean().default(false),
    items: z.array(batchPromoteItemSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const item of value.items) {
      if (seen.has(item.itemId)) {
        ctx.addIssue({
          code: 'custom',
          message: `itemId bị lặp: ${item.itemId}`,
          path: ['items'],
        });
        return;
      }
      seen.add(item.itemId);
    }
  });

export const batchPromoteConflictDetailsSchema = z.object({
  errors: z.array(
    z.object({
      itemId: objectIdSchema,
      shapeId: z.string().optional(),
      code: z.enum(['NOT_FOUND', 'ALREADY_PROMOTED', 'VERSION_CONFLICT', 'NOT_A_NOTE']),
      currentVersion: z.number().int().nonnegative().optional(),
      message: z.string().min(1),
    }),
  ),
});

export const batchPromoteResponseSchema = z.object({
  data: z.object({
    items: z.array(itemSchema),
    tasks: z.array(taskSchema),
    activities: z.array(activitySchema),
  }),
  meta: envelopeMetaSchema,
});

export const undoPromoteResponseSchema = z.object({
  data: z.object({
    task: taskSchema,
    item: itemSchema,
    activity: activitySchema,
  }),
  meta: envelopeMetaSchema,
});

export type BatchPromoteItem = z.infer<typeof batchPromoteItemSchema>;
export type BatchPromoteRequest = z.infer<typeof batchPromoteRequestSchema>;
export type BatchPromoteConflictDetails = z.infer<typeof batchPromoteConflictDetailsSchema>;
```

- [ ] **Step 4: Export index và chạy test**

Thêm `packages/contracts/src/index.ts`:

```ts
export * from './promotion.js';
```

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/batch-undo-contracts.test.ts
```

Expected: PASS 3 test.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/promotion.ts packages/contracts/src/index.ts apps/api/test/batch-undo-contracts.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add batch and undo contracts"
```

---

### Task 2: Batch promote transaction và endpoint

**Files:**
- Create: `apps/api/src/modules/items/promotion-batch.service.ts`
- Modify: `apps/api/src/modules/items/item.router.ts`
- Test: `apps/api/test/promotion-batch.integration.test.ts`

**Interfaces:**
- Consumes: `BatchPromoteRequest`, `BatchPromoteConflictDetails`, `recordActivity`,
  `PROMOTE_UNDO_WINDOW_MS`, `versionConflict`.
- Produces:
  - `promoteBatch(input): Promise<BatchPromoteResult>`.
  - `POST /api/v1/boards/:boardId/items/promote-batch`.

- [ ] **Step 1: Viết test batch thất bại**

Tạo `apps/api/test/promotion-batch.integration.test.ts`:

```ts
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { promoteBatch } from '../src/modules/items/promotion-batch.service.js';
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

async function setupNotes(count = 3) {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Batch' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: count }, (_, index) => ({
        shapeId: `shape:batch-${index}`,
        type: 'note',
        content: `Batch note ${index}`,
        style: {},
        props: {},
        position: { x: index * 220, y: 20 },
        size: { w: 200, h: 200 },
        rotation: 0,
        tldrawIndex: `a${index + 1}`,
        parentFrameId: null,
        expectedVersion: 0,
      })),
    })
    .expect(200);
  const boardDoc = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!boardDoc || !actor) throw new Error('Board or actor missing');
  return {
    owner,
    boardId,
    board: boardDoc,
    actor,
    items: sync.body.data as Array<{ _id: string; shapeId: string; version: number }>,
  };
}

function batchBody(items: Array<{ _id: string; version: number }>) {
  return {
    columnId: 'todo',
    assignToMe: false,
    items: items.map((item) => ({ itemId: item._id, expectedItemVersion: item.version })),
  };
}

describe('batch promote', () => {
  it('promote nhiều note trong một transaction', async () => {
    const { owner, boardId, items } = await setupNotes(3);
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(batchBody(items.slice(0, 2)))
      .expect(201);

    expect(response.body.data.tasks).toHaveLength(2);
    expect(response.body.data.items[0].promotedTaskId).toBe(response.body.data.tasks[0]._id);
    expect(response.body.data.tasks[0].order < response.body.data.tasks[1].order).toBe(true);
    expect(response.body.data.activities).toHaveLength(2);
    expect(await TaskModel.countDocuments({ boardId })).toBe(2);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(2);
  });

  it('một item đã promote làm abort toàn bộ batch', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: items[0].version })
      .expect(201);

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(batchBody(items))
      .expect(409);
    expect(response.body.error.code).toBe('BATCH_PROMOTE_CONFLICT');
    expect(response.body.error.details.errors[0]).toMatchObject({
      itemId: items[0]._id,
      code: 'ALREADY_PROMOTED',
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
    expect((await ItemModel.findById(items[1]._id))?.promotedTaskId).toBeNull();
  });

  it('version lệch abort batch', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    const body = batchBody(items);
    body.items[0].expectedItemVersion += 1;
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(body)
      .expect(409);
    expect(response.body.error.details.errors[0]).toMatchObject({
      itemId: items[0]._id,
      code: 'VERSION_CONFLICT',
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(0);
  });

  it('từ chối 101 item và itemId trùng', async () => {
    const { owner, boardId, items } = await setupNotes(2);
    const tooMany = batchBody(
      Array.from({ length: 101 }, (_, index) => ({
        _id: `64b${String(index).padStart(21, '0')}`,
        version: 1,
      })),
    );
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(tooMany)
      .expect(422);

    const duplicate = batchBody([items[0], items[0]]);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/promote-batch`)
      .send(duplicate)
      .expect(422);
  });

  it('hai batch đồng thời cùng item chỉ một thành công', async () => {
    const { owner, boardId, items } = await setupNotes(1);
    const body = batchBody(items);
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/items/promote-batch`).send(body),
      owner.agent.post(`/api/v1/boards/${boardId}/items/promote-batch`).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
    expect(await ActivityModel.countDocuments({ boardId })).toBe(1);
  });

  it('fault trước task insert rollback', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeTaskInsert: async () => {
          throw new Error('batch task fault');
        },
      }),
    ).rejects.toThrow('batch task fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
  });

  it('fault trước item update rollback task', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeItemUpdate: async () => {
          throw new Error('batch item fault');
        },
      }),
    ).rejects.toThrow('batch item fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
  });

  it('fault trước activity rollback task và item', async () => {
    const { board, actor, items } = await setupNotes(2);
    await expect(
      promoteBatch({
        board,
        actor,
        request: {
          columnId: 'todo',
          assignToMe: false,
          items: items.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        },
        beforeActivityInsert: async () => {
          throw new Error('batch activity fault');
        },
      }),
    ).rejects.toThrow('batch activity fault');
    expect(await TaskModel.countDocuments({ boardId: board._id })).toBe(0);
    expect(await ActivityModel.countDocuments({ boardId: board._id })).toBe(0);
    expect((await ItemModel.findById(items[0]._id))?.promotedTaskId).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/promotion-batch.integration.test.ts
```

Expected: FAIL vì `promoteBatch` chưa tồn tại.

- [ ] **Step 3: Tạo batch service**

`apps/api/src/modules/items/promotion-batch.service.ts`:

```ts
import {
  BATCH_PROMOTE_CONFLICT_CODE,
  type BatchPromoteConflictDetails,
  type BatchPromoteRequest,
} from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { ActivityDocument } from '../activities/activity.model.js';
import { PROMOTE_UNDO_WINDOW_MS, recordActivity } from '../activities/activity.service.js';
import type { BoardDocument } from '../boards/board.model.js';
import { TaskModel, type TaskDocument } from '../tasks/task.model.js';
import type { UserDocument } from '../users/user.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

type BatchError = BatchPromoteConflictDetails['errors'][number];

export interface BatchPromoteInput {
  board: BoardDocument;
  actor: UserDocument;
  request: BatchPromoteRequest;
  beforeTaskInsert?: () => Promise<void>;
  beforeItemUpdate?: () => Promise<void>;
  beforeActivityInsert?: () => Promise<void>;
}

export interface BatchPromoteResult {
  items: ItemDocument[];
  tasks: TaskDocument[];
  activities: ActivityDocument[];
}

function batchConflict(errors: BatchError[]): AppError {
  return new AppError(
    409,
    BATCH_PROMOTE_CONFLICT_CODE,
    'Không promote được toàn bộ batch',
    { errors },
  );
}

function duplicateSourceItemId(error: unknown): string | null {
  const typed = error as {
    code?: number;
    keyValue?: { sourceItemId?: unknown };
    writeErrors?: Array<{ err?: { code?: number; keyValue?: { sourceItemId?: unknown } } }>;
  };
  const direct =
    typed.code === 11_000 && typed.keyValue?.sourceItemId
      ? String(typed.keyValue.sourceItemId)
      : null;
  const nested = typed.writeErrors?.[0]?.err;
  if (nested?.code === 11_000 && nested.keyValue?.sourceItemId) {
    return String(nested.keyValue.sourceItemId);
  }
  return direct;
}

function titleFor(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : 'Ghi chú không tiêu đề';
}

export async function promoteBatch(input: BatchPromoteInput): Promise<BatchPromoteResult> {
  const column = input.board.columns.find((entry) => entry.id === input.request.columnId);
  if (!column) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  if (input.request.items.length > 100) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Batch tối đa 100 item');
  }

  const errors: BatchError[] = [];
  for (const entry of input.request.items) {
    if (!Types.ObjectId.isValid(entry.itemId)) {
      errors.push({
        itemId: entry.itemId,
        code: 'NOT_FOUND',
        message: 'Item không hợp lệ',
      });
    }
  }
  if (errors.length > 0) throw batchConflict(errors);

  const session = await mongoose.startSession();
  try {
    let result: BatchPromoteResult | null = null;
    try {
      result = await session.withTransaction(
        async () => {
          const objectIds = input.request.items.map(
            (entry) => new Types.ObjectId(entry.itemId),
          );
          const found = await ItemModel.find({
            _id: { $in: objectIds },
            boardId: input.board._id,
          }).session(session);
          const byId = new Map(found.map((item) => [item._id.toHexString(), item]));
          const itemErrors: BatchError[] = [];
          const orderedItems: ItemDocument[] = [];

          for (const entry of input.request.items) {
            const item = byId.get(entry.itemId);
            if (!item) {
              itemErrors.push({
                itemId: entry.itemId,
                code: 'NOT_FOUND',
                message: 'Không tìm thấy item',
              });
              continue;
            }
            if (item.type !== 'note') {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'NOT_A_NOTE',
                message: 'Item không phải note',
              });
              continue;
            }
            if (item.promotedTaskId) {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'ALREADY_PROMOTED',
                message: 'Item đã được promote',
              });
              continue;
            }
            if (item.version !== entry.expectedItemVersion) {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'VERSION_CONFLICT',
                currentVersion: item.version,
                message: 'Item đã thay đổi',
              });
              continue;
            }
            orderedItems.push(item);
          }

          if (itemErrors.length > 0) throw batchConflict(itemErrors);

          const lastTask = await TaskModel.findOne({
            boardId: input.board._id,
            columnId: column.id,
            lifecycle: 'active',
          })
            .sort({ order: -1 })
            .session(session);

          let previousOrder = lastTask?.order ?? null;
          const taskPayloads = orderedItems.map((item) => {
            const order = generateKeyBetween(previousOrder, null);
            previousOrder = order;
            return {
              boardId: input.board._id,
              columnId: column.id,
              order,
              title: titleFor(item.content),
              description: item.content,
              assigneeId: input.request.assignToMe ? input.actor._id : null,
              labels: [],
              priority: 'medium' as const,
              dueDate: null,
              lifecycle: 'active' as const,
              sourceItemId: item._id,
              origin: {
                itemId: item._id,
                frameId: item.parentFrameId,
                position: { x: item.position.x, y: item.position.y },
                voteCount: item.votes.length,
                authorId: item.authorId,
                itemCreatedAt: item.createdAt,
              },
              version: 1,
              createdBy: input.actor._id,
            };
          });

          await input.beforeTaskInsert?.();
          const tasks = await TaskModel.create(taskPayloads, { session });
          if (tasks.length !== orderedItems.length) {
            throw new Error('Không tạo đủ task cho batch');
          }

          await input.beforeItemUpdate?.();
          const updatedItems: ItemDocument[] = [];
          for (let index = 0; index < orderedItems.length; index += 1) {
            const item = orderedItems[index];
            const task = tasks[index];
            if (!item || !task) throw new Error('Batch item/task thiếu');
            const updated = await ItemModel.findOneAndUpdate(
              {
                _id: item._id,
                boardId: input.board._id,
                promotedTaskId: null,
                version: input.request.items[index]?.expectedItemVersion,
              },
              { $set: { promotedTaskId: task._id }, $inc: { version: 1 } },
              { returnDocument: 'after', session },
            ).exec();
            if (!updated) {
              throw batchConflict([
                {
                  itemId: item._id.toHexString(),
                  shapeId: item.shapeId,
                  code: 'VERSION_CONFLICT',
                  message: 'Item đã thay đổi trong batch',
                },
              ]);
            }
            updatedItems.push(updated);
          }

          await input.beforeActivityInsert?.();
          const activities: ActivityDocument[] = [];
          for (let index = 0; index < updatedItems.length; index += 1) {
            const item = updatedItems[index];
            const task = tasks[index];
            if (!item || !task) throw new Error('Batch activity thiếu item/task');
            activities.push(
              await recordActivity({
                session,
                boardId: input.board._id,
                actorId: input.actor._id,
                action: 'item.promoted',
                refs: {
                  itemId: item._id,
                  taskId: task._id,
                  columnId: task.columnId,
                },
                snapshot: {
                  taskTitle: task.title,
                  columnId: task.columnId,
                  taskVersionAtPromote: task.version,
                  itemVersionAtPromote: item.version,
                },
                undoableUntil: new Date(Date.now() + PROMOTE_UNDO_WINDOW_MS),
              }),
            );
          }

          return { items: updatedItems, tasks, activities };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority', j: true },
          readPreference: 'primary',
        },
      );
    } catch (error) {
      const sourceItemId = duplicateSourceItemId(error);
      if (sourceItemId) {
        throw batchConflict([
          {
            itemId: sourceItemId,
            code: 'ALREADY_PROMOTED',
            message: 'Item đã được promote',
          },
        ]);
      }
      throw error;
    }

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

- [ ] **Step 4: Thêm route batch**

Trong `apps/api/src/modules/items/item.router.ts`, import:

```ts
import {
  batchPromoteRequestSchema,
  promoteRequestSchema,
  syncItemsRequestSchema,
  type ItemDto,
} from '@nextask/contracts';
import { serializeActivity, serializeItem, serializeTask } from '../../lib/serialize.js';
import { promoteBatch } from './promotion-batch.service.js';
```

Thêm trước `router.post('/:itemId/promote', ...)`:

```ts
  router.post('/promote-batch', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const input = batchPromoteRequestSchema.parse(request.body);
    const result = await promoteBatch({
      board: request.board,
      actor: request.user,
      request: input,
    });

    response.status(201).json({
      data: {
        items: result.items.map(serializeItem),
        tasks: result.tasks.map(serializeTask),
        activities: result.activities.map(serializeActivity),
      },
      meta: { requestId: request.requestId },
    });
  });
```

- [ ] **Step 5: Chạy test batch**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/promotion-batch.integration.test.ts
```

Expected: PASS toàn bộ batch test, gồm fault hook rollback.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/items/promotion-batch.service.ts apps/api/src/modules/items/item.router.ts apps/api/test/promotion-batch.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add atomic batch promote"
```

---

### Task 3: Undo promote transaction và endpoint

**Files:**
- Create: `apps/api/src/modules/activities/undo.service.ts`
- Modify: `apps/api/src/modules/activities/activity.router.ts`
- Test: `apps/api/test/undo.integration.test.ts`

**Interfaces:**
- Consumes: `ActivityDocument`, `recordActivity`, `UNDO_NOT_AVAILABLE_CODE`,
  `UNDO_NO_LONGER_SAFE_CODE`.
- Produces:
  - `undoPromote(input): Promise<UndoPromoteResult>`.
  - `POST /api/v1/boards/:boardId/activities/:activityId/undo`.

- [ ] **Step 1: Viết test undo thất bại**

Tạo `apps/api/test/undo.integration.test.ts`:

```ts
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { undoPromote } from '../src/modules/activities/undo.service.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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

async function setupPromoted(content = 'Undo note') {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Undo' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:undo',
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
  const activity = await ActivityModel.findOne({ boardId }).exec();
  const boardDoc = await BoardModel.findById(boardId).exec();
  const actor = await UserModel.findById(owner.user._id).exec();
  if (!activity || !boardDoc || !actor) throw new Error('Fixture missing');
  return {
    owner,
    boardId,
    board: boardDoc,
    actor,
    itemId: item._id,
    itemVersion: promoted.body.data.item.version as number,
    taskId: promoted.body.data.task._id as string,
    taskVersion: promoted.body.data.task.version as number,
    activityId: activity._id.toHexString(),
  };
}

describe('undo promote', () => {
  it('undo thành công tạo activity item.promote_undone', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(200);

    expect(response.body.data.task.lifecycle).toBe('demoted');
    expect(response.body.data.item.promotedTaskId).toBeNull();
    expect(response.body.data.activity.action).toBe('item.promote_undone');
    const undone = await ActivityModel.findOne({ action: 'item.promote_undone' }).exec();
    expect(undone?.snapshot).toMatchObject({ originalActivityId: activityId });
  });

  it('hết hạn trả UNDO_NO_LONGER_SAFE', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    await ActivityModel.updateOne(
      { _id: activityId },
      { $set: { undoableUntil: new Date(Date.now() - 1000) } },
    );
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NO_LONGER_SAFE');
  });

  it('task đã move trả UNDO_NO_LONGER_SAFE', async () => {
    const { owner, boardId, activityId, taskId, taskVersion } = await setupPromoted();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
      .send({ columnId: 'done', beforeTaskId: null, expectedVersion: taskVersion })
      .expect(200);
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NO_LONGER_SAFE');
  });

  it('activity demote không undo được', async () => {
    const { owner, boardId, taskId, taskVersion, itemVersion, activityId } =
      await setupPromoted();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/demote`)
      .send({ expectedTaskVersion: taskVersion, expectedItemVersion: itemVersion })
      .expect(200);
    const demoteActivity = await ActivityModel.findOne({ action: 'item.demoted' }).exec();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${demoteActivity?._id.toHexString()}/undo`)
      .expect(409);
    expect(response.body.error.code).toBe('UNDO_NOT_AVAILABLE');
    await owner.agent
      .post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`)
      .expect(409);
  });

  it('hai undo đồng thời chỉ một thành công', async () => {
    const { owner, boardId, activityId } = await setupPromoted();
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`),
      owner.agent.post(`/api/v1/boards/${boardId}/activities/${activityId}/undo`),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await ActivityModel.countDocuments({ action: 'item.promote_undone' })).toBe(1);
  });

  it('fault trước task update rollback', async () => {
    const { board, actor, activityId } = await setupPromoted();
    await expect(
      undoPromote({
        board,
        actor,
        activityId,
        beforeTaskUpdate: async () => {
          throw new Error('undo task fault');
        },
      }),
    ).rejects.toThrow('undo task fault');
    const task = await TaskModel.findOne({ boardId: board._id }).exec();
    expect(task?.lifecycle).toBe('active');
    const item = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(item?.promotedTaskId?.toHexString()).toBe(task?._id.toHexString());
  });

  it('fault trước activity rollback task/item', async () => {
    const { board, actor, activityId } = await setupPromoted();
    await expect(
      undoPromote({
        board,
        actor,
        activityId,
        beforeActivityInsert: async () => {
          throw new Error('undo activity fault');
        },
      }),
    ).rejects.toThrow('undo activity fault');
    const task = await TaskModel.findOne({ boardId: board._id }).exec();
    expect(task?.lifecycle).toBe('active');
    const item = await ItemModel.findOne({ boardId: board._id }).exec();
    expect(item?.promotedTaskId?.toHexString()).toBe(task?._id.toHexString());
    expect(await ActivityModel.countDocuments({ action: 'item.promote_undone' })).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/undo.integration.test.ts
```

Expected: FAIL vì `undoPromote`/route chưa tồn tại.

- [ ] **Step 3: Tạo undo service**

`apps/api/src/modules/activities/undo.service.ts`:

```ts
import {
  UNDO_NO_LONGER_SAFE_CODE,
  UNDO_NOT_AVAILABLE_CODE,
} from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import { TaskModel, type TaskDocument } from '../tasks/task.model.js';
import type { UserDocument } from '../users/user.model.js';
import { ActivityModel, type ActivityDocument } from './activity.model.js';
import { recordActivity } from './activity.service.js';

export interface UndoPromoteInput {
  board: BoardDocument;
  actor: UserDocument;
  activityId: string;
  beforeTaskUpdate?: () => Promise<void>;
  beforeActivityInsert?: () => Promise<void>;
}

export interface UndoPromoteResult {
  task: TaskDocument;
  item: ItemDocument;
  activity: ActivityDocument;
}

function undoNoLongerSafe(): AppError {
  return new AppError(
    409,
    UNDO_NO_LONGER_SAFE_CODE,
    'Không thể hoàn tác promote lúc này',
  );
}

export async function undoPromote(input: UndoPromoteInput): Promise<UndoPromoteResult> {
  if (!Types.ObjectId.isValid(input.activityId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
  }

  const activity = await ActivityModel.findOne({
    _id: input.activityId,
    boardId: input.board._id,
  }).exec();
  if (!activity) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
  if (activity.action !== 'item.promoted') {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity này không thể undo');
  }
  if (!activity.refs.taskId || !activity.refs.itemId) {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity thiếu tham chiếu');
  }
  if (!activity.undoableUntil || activity.undoableUntil.getTime() <= Date.now()) {
    throw undoNoLongerSafe();
  }
  const expectedTaskVersion = Number(activity.snapshot.taskVersionAtPromote);
  if (!Number.isInteger(expectedTaskVersion) || expectedTaskVersion < 1) {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity thiếu version promote');
  }

  const task = await TaskModel.findOne({
    _id: activity.refs.taskId,
    boardId: input.board._id,
    lifecycle: 'active',
    version: expectedTaskVersion,
  }).exec();
  const item = await ItemModel.findOne({
    _id: activity.refs.itemId,
    boardId: input.board._id,
  }).exec();
  if (!task || !item || !item.promotedTaskId?.equals(task._id)) {
    throw undoNoLongerSafe();
  }

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        await input.beforeTaskUpdate?.();
        const updatedTask = await TaskModel.findOneAndUpdate(
          {
            _id: task._id,
            boardId: input.board._id,
            lifecycle: 'active',
            version: expectedTaskVersion,
          },
          {
            $set: {
              lifecycle: 'demoted',
              demotedAt: new Date(),
              demotedBy: input.actor._id,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedTask) throw undoNoLongerSafe();

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            promotedTaskId: task._id,
          },
          { $set: { promotedTaskId: null }, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) throw undoNoLongerSafe();

        await input.beforeActivityInsert?.();
        const undoActivity = await recordActivity({
          session,
          boardId: input.board._id,
          actorId: input.actor._id,
          action: 'item.promote_undone',
          refs: {
            itemId: updatedItem._id,
            taskId: updatedTask._id,
            columnId: updatedTask.columnId,
          },
          snapshot: {
            taskTitle: updatedTask.title,
            columnId: updatedTask.columnId,
            originalActivityId: activity._id.toHexString(),
          },
          undoableUntil: null,
        });

        return { task: updatedTask, item: updatedItem, activity: undoActivity };
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

- [ ] **Step 4: Thêm route undo**

Trong `apps/api/src/modules/activities/activity.router.ts`:

```ts
import { activityListQuerySchema, type ActivityDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeActivity, serializeItem, serializeTask } from '../../lib/serialize.js';
import { listActivities } from './activity.service.js';
import { undoPromote } from './undo.service.js';
```

Thêm trước `return router;`:

```ts
  router.post('/:activityId/undo', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const params = request.params as { activityId?: string };
    if (!params.activityId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
    }

    const result = await undoPromote({
      board: request.board,
      actor: request.user,
      activityId: params.activityId,
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

- [ ] **Step 5: Chạy test undo**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/undo.integration.test.ts test/demote.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/activities/undo.service.ts apps/api/src/modules/activities/activity.router.ts apps/api/test/undo.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add promote undo transaction"
```

---

### Task 4: Web batch multi-select và dialog

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/whiteboard/whiteboard.tsx`
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`
- Create: `apps/web/features/whiteboard/batch-promote-dialog.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`

**Interfaces:**
- Consumes: `batchPromoteRequestSchema`, `batchPromoteResponseSchema`,
  `BatchPromoteRequest`, `ItemDto`.
- Produces:
  - `promoteBatch(boardId, input): Promise<{items;tasks;activities}>`.
  - Multi-select panel + batch dialog.

- [ ] **Step 1: API client**

Trong `apps/web/lib/api.ts` import:

```ts
  batchPromoteRequestSchema,
  batchPromoteResponseSchema,
  type BatchPromoteRequest,
```

Thêm sau `promoteItem`:

```ts
export async function promoteBatch(
  boardId: string,
  input: BatchPromoteRequest,
): Promise<{ items: ItemDto[]; tasks: TaskDto[]; activities: ActivityDto[] }> {
  const body = batchPromoteRequestSchema.parse(input);
  return (
    await request(`/boards/${boardId}/items/promote-batch`, batchPromoteResponseSchema, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  ).data;
}
```

- [ ] **Step 2: Whiteboard prop và multi-select**

Trong `apps/web/features/whiteboard/whiteboard.tsx`, thêm prop:

```ts
  onPromoteBatchRequest: (items: ItemDto[]) => void;
```

Trong `apps/web/features/whiteboard/whiteboard-canvas.tsx`:

Destructure `onPromoteBatchRequest`.

Thêm state:

```ts
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
```

Trong `updateSelection`, thay logic noteId:

```ts
    const noteIds = editor
      .getSelectedShapeIds()
      .filter((shapeId) => editor.getShape(shapeId)?.type === 'note');
    setSelectedShapeIds(noteIds);
    setSelectedShapeId(noteIds.length === 1 ? noteIds[0] ?? null : null);
```

Thêm sau `handlePromoteClick`:

```ts
  async function handleBatchPromoteClick() {
    setError(null);
    if (selectedShapeIds.length < 2) return;
    if (selectedShapeIds.length > 100) {
      setError('Chỉ chọn tối đa 100 note mỗi lần.');
      return;
    }
    const saved = await syncNow();
    const selected = selectedShapeIds
      .map((shapeId) => saved.find((item) => item.shapeId === shapeId))
      .filter((item): item is ItemDto => Boolean(item));
    if (selected.length !== selectedShapeIds.length) {
      setError('Chưa đồng bộ được đủ note để promote.');
      return;
    }
    if (selected.some((item) => item.promotedTaskId)) {
      setError('Có note đã được promote; bỏ chọn note đó rồi thử lại.');
      return;
    }
    onPromoteBatchRequest(selected);
  }
```

Thêm panel batch trong khối bottom panel, trước nhánh `selectedShapeId ?`:

```tsx
        {selectedShapeIds.length > 1 ? (
          <div className="rounded-xl border border-stone-200 bg-white/95 p-3 shadow-md backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Đã chọn {selectedShapeIds.length} note
            </p>
            <p className="mt-1 text-sm text-stone-900">Promote tất cả thành task trong một batch.</p>
            <button
              type="button"
              onClick={() => void handleBatchPromoteClick()}
              className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Promote selected ({selectedShapeIds.length})
            </button>
          </div>
        ) : selectedShapeId ? (
```

Khi chọn nhiều nhưng có note mới chưa sync, handler sync trước; UI count là shape note đang chọn.

- [ ] **Step 3: Batch dialog**

Tạo `apps/web/features/whiteboard/batch-promote-dialog.tsx`:

```tsx
'use client';

import type { BoardDto, ItemDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface BatchPromoteDialogProps {
  items: ItemDto[];
  columns: BoardDto['columns'];
  onClose: () => void;
  onConfirm: (input: { columnId: string; assignToMe: boolean }) => Promise<void>;
}

export function BatchPromoteDialog({
  items,
  columns,
  onClose,
  onConfirm,
}: BatchPromoteDialogProps) {
  const defaultColumn = columns.find((column) => column.id === 'todo')?.id ?? columns[0]?.id ?? '';
  const [columnId, setColumnId] = useState(defaultColumn);
  const [assignToMe, setAssignToMe] = useState(false);
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
    if (!columnId) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm({ columnId, assignToMe });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không promote được batch.');
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
        aria-labelledby="batch-promote-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Promote batch
            </p>
            <h2 id="batch-promote-title" className="mt-1 text-xl font-semibold text-stone-900">
              {items.length} ghi chú thành task
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

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="batch-column" className="text-sm font-medium text-stone-800">
            Cột đích
          </label>
          <select
            id="batch-column"
            value={columnId}
            onChange={(event) => setColumnId(event.target.value)}
            disabled={pending}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>

          <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={assignToMe}
              onChange={(event) => setAssignToMe(event.target.checked)}
              disabled={pending}
              className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
            />
            Giao tất cả cho tôi
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
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
              disabled={pending || !columnId}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Đang promote...' : `Promote ${items.length} note`}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: BoardWorkspace batch state/handler**

Import:

```ts
import { promoteBatch } from '../../lib/api';
import { BatchPromoteDialog } from '../whiteboard/batch-promote-dialog';
```

State:

```ts
  const [batchPromoteTarget, setBatchPromoteTarget] = useState<ItemDto[] | null>(null);
```

Truyền prop cho Whiteboard:

```tsx
            onPromoteBatchRequest={setBatchPromoteTarget}
```

Thêm handler trước `handleDemote`:

```ts
  const handleBatchPromote = useCallback(
    async (input: { columnId: string; assignToMe: boolean }) => {
      if (!batchPromoteTarget) return;
      try {
        const result = await promoteBatch(boardId, {
          columnId: input.columnId,
          assignToMe: input.assignToMe,
          items: batchPromoteTarget.map((item) => ({
            itemId: item._id,
            expectedItemVersion: item.version,
          })),
        });
        setData((current) => {
          if (!current) return current;
          const itemMap = new Map(result.items.map((item) => [item._id, item]));
          return {
            ...current,
            items: current.items.map((item) => itemMap.get(item._id) ?? item),
            tasks: [
              ...current.tasks.filter(
                (task) => !result.tasks.some((incoming) => incoming._id === task._id),
              ),
              ...result.tasks,
            ],
          };
        });
        setBatchPromoteTarget(null);
        setActivityRevision((value) => value + 1);
        setWhiteboardRevision((value) => value + 1);
        setNotice(`Đã promote ${result.tasks.length} ghi chú thành task`);
      } catch (caught) {
        if (isVersionConflict(caught) || (caught instanceof ApiClientError && caught.code === 'BATCH_PROMOTE_CONFLICT')) {
          setBatchPromoteTarget(null);
          setNotice('Batch vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
          await loadWorkspace();
          await loadTasks(filters);
          return;
        }
        throw caught;
      }
    },
    [batchPromoteTarget, boardId, filters, loadTasks, loadWorkspace],
  );
```

Thêm dialog:

```tsx
      {batchPromoteTarget ? (
        <BatchPromoteDialog
          items={batchPromoteTarget}
          columns={data.board.columns}
          onClose={() => setBatchPromoteTarget(null)}
          onConfirm={handleBatchPromote}
        />
      ) : null}
```

- [ ] **Step 5: Typecheck/build**

```bash
npm run typecheck
npm run build:web
npm run lint
npm run format:check
```

Expected: PASS; chạy Prettier cho file mới nếu cần.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/whiteboard/whiteboard.tsx apps/web/features/whiteboard/whiteboard-canvas.tsx apps/web/features/whiteboard/batch-promote-dialog.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add batch promote UI"
```

---

### Task 5: Web Undo promote UI

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/workspace/activity-panel.tsx`
- Create: `apps/web/features/workspace/undo-promote-dialog.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`

**Interfaces:**
- Consumes: `undoPromoteResponseSchema`, `ActivityDto`, `TaskDto`.
- Produces:
  - `undoPromote(boardId, activityId): Promise<{task;item;activity}>`.
  - Nút Undo + dialog xác nhận.

- [ ] **Step 1: API client**

Trong `apps/web/lib/api.ts` import:

```ts
  undoPromoteResponseSchema,
```

Thêm cuối file:

```ts
export async function undoPromote(
  boardId: string,
  activityId: string,
): Promise<{ task: TaskDto; item: ItemDto; activity: ActivityDto }> {
  return (
    await request(
      `/boards/${boardId}/activities/${activityId}/undo`,
      undoPromoteResponseSchema,
      { method: 'POST' },
    )
  ).data;
}
```

- [ ] **Step 2: ActivityPanel nút Undo**

Đổi props:

```ts
interface ActivityPanelProps {
  boardId: string;
  members: BoardMemberDetailDto[];
  tasks: TaskDto[];
  refreshKey: number;
  onUndo: (activity: ActivityDto) => void;
}
```

Import `TaskDto`.

Trong component, tạo:

```ts
  const activeTaskIds = new Set(tasks.map((task) => task._id));
  const undoneActivityIds = new Set(
    activities
      .filter((activity) => activity.action === 'item.promote_undone')
      .map((activity) => activity.snapshot.originalActivityId)
      .filter((value): value is string => typeof value === 'string'),
  );
```

Trong item activity, thêm nút sau phần title nếu:

```tsx
                {activity.action === 'item.promoted' &&
                activity.refs.taskId &&
                activeTaskIds.has(activity.refs.taskId) &&
                !undoneActivityIds.has(activity._id) &&
                activity.undoableUntil &&
                new Date(activity.undoableUntil).getTime() > Date.now() ? (
                  <button
                    type="button"
                    onClick={() => onUndo(activity)}
                    className="mt-2 text-[11px] font-medium text-rose-700 hover:underline"
                  >
                    Undo
                  </button>
                ) : null}
```

- [ ] **Step 3: Undo dialog**

Tạo `apps/web/features/workspace/undo-promote-dialog.tsx`:

```tsx
'use client';

import type { ActivityDto } from '@nextask/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError } from '../../lib/api';

interface UndoPromoteDialogProps {
  activity: ActivityDto;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function UndoPromoteDialog({ activity, onClose, onConfirm }: UndoPromoteDialogProps) {
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
      setError(caught instanceof ApiClientError ? caught.message : 'Không undo được promote.');
    } finally {
      setPending(false);
    }
  }

  const title =
    typeof activity.snapshot.taskTitle === 'string' ? activity.snapshot.taskTitle : 'Task';

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
        aria-labelledby="undo-promote-title"
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
              Undo promote
            </p>
            <h2 id="undo-promote-title" className="mt-1 text-xl font-semibold text-stone-900">
              Hoàn tác promote
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
          {title}
        </blockquote>
        <p className="mt-3 text-sm text-stone-600">
          Task sẽ bị demote và note trở lại trạng thái chưa promote.
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
              {pending ? 'Đang undo...' : 'Undo promote'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: BoardWorkspace state/handler**

Import:

```ts
import { undoPromote } from '../../lib/api';
import { UndoPromoteDialog } from './undo-promote-dialog';
```

State:

```ts
  const [undoTarget, setUndoTarget] = useState<ActivityDto | null>(null);
```

Import type `ActivityDto` từ contracts.

Truyền cho ActivityPanel:

```tsx
              <ActivityPanel
                boardId={boardId}
                members={data.members}
                tasks={data.tasks}
                refreshKey={activityRevision}
                onUndo={setUndoTarget}
              />
```

Thêm handler:

```ts
  const handleUndoPromote = useCallback(async () => {
    if (!undoTarget) return;
    try {
      const result = await undoPromote(boardId, undoTarget._id);
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item._id === result.item._id ? result.item : item,
          ),
          tasks: current.tasks.filter((task) => task._id !== result.task._id),
        };
      });
      setUndoTarget(null);
      setActivityRevision((value) => value + 1);
      setWhiteboardRevision((value) => value + 1);
      setNotice('Đã hoàn tác promote.');
    } catch (caught) {
      if (
        caught instanceof ApiClientError &&
        (caught.code === 'UNDO_NO_LONGER_SAFE' || caught.code === 'UNDO_NOT_AVAILABLE')
      ) {
        setUndoTarget(null);
        setNotice(caught.message);
        await loadWorkspace();
        await loadTasks(filters);
        return;
      }
      throw caught;
    }
  }, [boardId, filters, loadTasks, loadWorkspace, undoTarget]);
```

Thêm dialog:

```tsx
      {undoTarget ? (
        <UndoPromoteDialog
          activity={undoTarget}
          onClose={() => setUndoTarget(null)}
          onConfirm={handleUndoPromote}
        />
      ) : null}
```

- [ ] **Step 5: Typecheck/build/lint/format**

```bash
npm run typecheck
npm run build:web
npm run lint
npm run format:check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/activity-panel.tsx apps/web/features/workspace/undo-promote-dialog.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add undo promote UI"
```

---

### Task 6: Browser verification

**Files:**
- Modify: `docs/session-log.md`
- Modify: `docs/phases/05b-batch-undo.md`

**Interfaces:**
- Consumes: batch/undo API/UI.
- Produces: browser evidence.

- [ ] **Step 1: Docker rebuild**

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: healthy, health vẫn `0.4.0`; app DB vẫn 001–005.

- [ ] **Step 2: Preconditions in browser**

Dùng browser-use một tab; đăng nhập owner. Tạo board tạm và 3 note bằng fetch:

```js
async () => {
  const base = 'http://localhost:4000/api/v1';
  const headers = { 'Content-Type': 'application/json' };
  const board = await (await fetch(`${base}/boards`, {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ name: 'Phase 5B E2E' }),
  })).json();
  const boardId = board.data._id;
  const synced = await (await fetch(`${base}/boards/${boardId}/items`, {
    method: 'PUT', credentials: 'include', headers,
    body: JSON.stringify({
      items: Array.from({ length: 3 }, (_, index) => ({
        shapeId: `shape:batch-e2e-${index}`,
        type: 'note', content: `Batch E2E ${index}`,
        style: {}, props: {}, position: { x: index * 220, y: 30 },
        size: { w: 200, h: 200 }, rotation: 0, tldrawIndex: `a${index + 1}`,
        parentFrameId: null, expectedVersion: 0,
      })),
      deleted: [],
    }),
  })).json();
  localStorage.setItem('phase5b', JSON.stringify({
    boardId,
    items: synced.data.map((item) => ({ id: item._id, version: item.version })),
  }));
  return { boardId, count: synced.data.length };
}
```

Mở URL `http://localhost:3000/boards/` + `boardId`.

- [ ] **Step 3: Batch UI**

1. Chọn 2 note bằng shift-click (dùng tldraw multi-select; nếu browser-use không giữ được
   shift, dispatch pointer events có `shiftKey: true` lên canvas tại tâm hai note).
2. Expected: panel hiện `Đã chọn 2 note`.
3. Bấm `Promote selected (2)`, chọn cột `todo`, xác nhận.
4. Expected: Kanban có 2 task; badge cả 2 note; tab Hoạt động có 2 dòng promote.
5. Reload: dữ liệu batch còn.

- [ ] **Step 4: Undo UI**

1. Trong tab Hoạt động, bấm Undo trên một dòng promote.
2. Xác nhận.
3. Expected: task tương ứng rời Kanban; note đó hết badge; task còn lại vẫn hiện;
   activity có `Đã hoàn tác promote`; dòng promote gốc không còn nút Undo.
4. Reload: trạng thái undo còn.

- [ ] **Step 5: Error paths**

1. Gọi batch trực tiếp với 1 item đã promote và 1 item hợp lệ; expected 409
   `BATCH_PROMOTE_CONFLICT`, không tạo task mới.
2. Move một task sau promote rồi thử undo activity của task đó; expected 409
   `UNDO_NO_LONGER_SAFE` hoặc nút Undo đã ẩn sau reload.
3. Không có lỗi console/500.

- [ ] **Step 6: Cleanup**

Đóng tab board tạm (navigate `/`), chờ grace watcher, rồi xóa theo tên board:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const board = db.boards.findOne({ name: "Phase 5B E2E" });
if (!board) throw new Error("Không tìm thấy board tạm");
const boardId = board._id;
db.activities.deleteMany({ boardId });
db.change_stream_checkpoints.deleteMany({ boardId });
db.tasks.deleteMany({ boardId });
db.items.deleteMany({ boardId });
db.boards.deleteOne({ _id: boardId });
printjson({ boards: db.boards.countDocuments(), items: db.items.countDocuments(), tasks: db.tasks.countDocuments(), activities: db.activities.countDocuments() });
'
```

Expected: board thật giữ 1 board, 2 item, 2 task; activity/checkpoint tạm đã xóa.

- [ ] **Step 7: Evidence docs**

Thêm session log:

```markdown
## 2026-11-10 - Phase 5B verification

- Browser: multi-select 2 note, batch promote 2 task, badge/activity đúng; reload giữ.
- Undo một promote: task rời Kanban, task còn lại giữ, activity undo xuất hiện.
- Batch conflict trả danh sách lỗi, không ghi một phần; undo stale bị chặn.
- Board tạm và checkpoint/activity đã xóa; health `0.4.0`.
```

Cập nhật kết quả ngắn trong spec trước `Tiêu chí chấp nhận`.

- [ ] **Step 8: Commit**

```bash
git add docs/session-log.md docs/phases/05b-batch-undo.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5b verification"
```

---

### Task 7: Gates, docs và merge release/v0.5

**Files:**
- Modify: `docs/phases/05b-batch-undo.md`
- Modify: `docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: code, tests, browser evidence.
- Produces: 5B trên `release/v0.5`; feature xóa; main/tag không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: hoàn thành, kết quả batch/undo/fault injection, merge commit.
- Plan: trạng thái thực thi, commit list, điều chỉnh.
- Architecture: Phase 5B batch/undo đã có; multi-select; undo 10 phút.
- MongoDB notes: batch transaction/order/activity; undo guard/version; fault injection.
- README: batch promote, undo, multi-select, API mới; v0.5 trên release.
- Git workflow: Phase 5B, feature merge/xóa, main/tag v0.4.0 giữ nguyên.
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
git add docs/phases/05b-batch-undo.md docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5b verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.5
git merge --no-ff feat/phase-5b-batch-undo -m "merge: phase 5b batch and undo"
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
git add docs/phases/05b-batch-undo.md docs/superpowers/plans/2026-11-10-phase-5b-batch-undo.md docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 5b release merge"
git branch -d feat/phase-5b-batch-undo
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: `main` vẫn `9fd19b6`; tag `v0.2.0`, `v0.3.0`, `v0.4.0`; release chứa 5A/5B.

- [ ] **Step 7: Không merge main/không bump 0.5.0**

Không chạy merge `release/v0.5` vào `main`. Ghi trạng thái chờ duyệt phát hành v0.5;
version `0.4.0` và tag `v0.4.0` giữ nguyên.

---

## Self-review checklist

- Spec coverage:
  - Contracts batch/undo: Task 1.
  - Batch transaction/endpoint/fault: Task 2.
  - Undo transaction/endpoint/fault: Task 3.
  - Web batch multi-select/dialog: Task 4.
  - Web undo activity/dialog: Task 5.
  - Browser: Task 6.
  - Gates/docs/merge: Task 7.
- Batch max 100; itemId unique; order tuần tự; activity riêng từng note.
- Undo chỉ promote; 10 phút; task version/lifecycle/item link guard; activity gốc còn.
- Không migration 006; không thêm event type; fault injection chỉ hook test.
- Type/field thống nhất: `BatchPromoteRequest`, `BatchPromoteConflictDetails`,
  `promoteBatch`, `undoPromote`, `BATCH_PROMOTE_CONFLICT_CODE`,
  `UNDO_NOT_AVAILABLE_CODE`, `UNDO_NO_LONGER_SAFE_CODE`.
- Không task nào merge `main`, bump `0.5.0` hoặc tạo tag mới.
