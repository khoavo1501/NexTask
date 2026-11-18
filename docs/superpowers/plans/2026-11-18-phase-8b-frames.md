# Phase 8B - Frame nhóm note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu, đồng bộ và dựng lại frame tldraw cùng note con; thêm công cụ Frame, seed demo 3 frame, và bảo vệ promote/vote/report chỉ áp dụng cho note.

**Architecture:** Frame là item `type: "frame"` trong collection `items`, dùng chung transaction sync, OCC version và realtime. Note trong frame lưu `parentFrameId`; sync input gửi `parentShapeId` để server resolve trong transaction. Xóa frame reparent các item con còn lại về page level trước khi xóa frame.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, MongoDB 8 replica set, Zod 4, Next.js App Router, tldraw 5, Vitest 5, Playwright 1.65.

**Spec:** `docs/phases/08b-frames.md`

## Global Constraints

- Branch `feat/phase-8b-frames`, tạo từ `release/v0.8`; không merge `main`, không bump `0.8.0`, không tag, không push.
- Commit identity từng lệnh: `khoavo1501 <khoamiden15012005@gmail.com>`.
- Chỉ stage đường dẫn cụ thể; không `git add -A`, không `git add .`.
- Test API dùng MongoDB replica set thật, không mock database; không nới timeout để test xanh.
- Full suite chạy ba lần tại feature gate và release gate; kèm typecheck/lint/format/build:web và Playwright.
- Backup trước khi áp migration lên app DB; rehearsal trên database tạm rồi drop.
- Không xóa dữ liệu người dùng, backup hoặc Mongo volume.
- Prose tiếng Việt; quét CJK trước khi commit tài liệu.

---

## File Structure

- `packages/contracts/src/item.ts` - item DTO type union, sync input union.
- `apps/api/src/modules/items/item.model.ts` - model type `note | frame`.
- `apps/api/src/db/collection-validators.ts` - validator enum `items.type`.
- `apps/api/src/db/migrations/007-phase-8b.ts` - migration mở validator.
- `apps/api/src/db/migration-runner.ts` - đăng ký migration 007.
- `apps/api/src/modules/items/item.service.ts` - sync transaction frame/note, reparent khi xóa frame.
- `apps/api/src/modules/items/promotion.service.ts` - chặn promote frame.
- `apps/web/features/whiteboard/whiteboard-canvas.tsx` - toolbar, sync, hydration frame.
- `apps/web/features/workspace/board-workspace.tsx` - đếm note/frame ở header.
- `apps/api/src/db/seed-demo.ts` - seed 3 frame và note con.
- `apps/api/test/frame-contracts.test.ts` - contract test mới.
- `apps/api/test/frames.integration.test.ts` - integration test mới.
- `apps/api/test/migrations.integration.test.ts` - migration 007.
- `apps/api/test/validators.integration.test.ts` - validator frame.
- `apps/api/test/seed-demo.integration.test.ts` - seed counts/frame.
- `e2e/mvp-smoke.spec.ts` - assertion header `3 frame`.

---

### Task 1: Contracts và model type cho frame

**Files:**
- Modify: `packages/contracts/src/item.ts`
- Modify: `apps/api/src/modules/items/item.model.ts`
- Create: `apps/api/test/frame-contracts.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: `ItemDto.type: 'note' | 'frame'`; `SyncItemInput` là union note/frame; note sync có `parentShapeId: string | null`; frame sync có `parentShapeId: null`.

- [ ] **Step 1: Viết failing contract test**

```ts
import { describe, expect, it } from 'vitest';
import { syncItemsRequestSchema } from '@nextask/contracts';

const frame = {
  shapeId: 'shape:frame1',
  type: 'frame',
  style: { color: 'yellow' },
  props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
  position: { x: 0, y: 0 },
  size: { w: 220, h: 700 },
  rotation: 0,
  tldrawIndex: 'a1',
  parentShapeId: null,
  expectedVersion: 0,
};

const note = {
  shapeId: 'shape:note1',
  type: 'note',
  content: 'Xin chào',
  style: { color: 'yellow' },
  props: { color: 'yellow' },
  position: { x: 10, y: 20 },
  size: { w: 200, h: 200 },
  rotation: 0,
  tldrawIndex: 'a2',
  parentShapeId: 'shape:frame1',
  expectedVersion: 0,
};

describe('frame contracts', () => {
  it('nhận frame và note có parentShapeId', () => {
    const parsed = syncItemsRequestSchema.parse({ items: [frame, note] });
    expect(parsed.items[0]).toMatchObject({ type: 'frame', parentShapeId: null });
    expect(parsed.items[1]).toMatchObject({ type: 'note', parentShapeId: 'shape:frame1' });
  });

  it('từ chối frame có parent hoặc rotation khác 0', () => {
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, parentShapeId: 'shape:other' }],
      }).success,
    ).toBe(false);
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, rotation: 1 }],
      }).success,
    ).toBe(false);
  });

  it('từ chối frame thiếu name hoặc kích thước không dương', () => {
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, props: { w: 0, h: 700, name: 'Start', color: 'yellow' } }],
      }).success,
    ).toBe(false);
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, props: { w: 220, h: 700, color: 'yellow' } }],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/frame-contracts.test.ts`

Expected: FAIL vì schema hiện tại chỉ nhận `type: "note"` và `parentFrameId: null`.

- [ ] **Step 3: Cập nhật contracts**

Trong `packages/contracts/src/item.ts`, thay `type: z.literal('note')` của `itemSchema` bằng:

```ts
  type: z.enum(['note', 'frame']),
```

Thay toàn bộ `syncItemInputSchema` hiện tại bằng:

```ts
const syncItemBaseSchema = z.object({
  shapeId: z.string().min(1).max(200),
  position: pointSchema,
  tldrawIndex: z.string().min(1).max(100),
  parentShapeId: z.string().min(1).max(200).nullable().default(null),
  expectedVersion: z.number().int().nonnegative(),
});

const syncNoteItemInputSchema = syncItemBaseSchema.extend({
  type: z.literal('note'),
  content: z.string().max(10_000),
  style: unknownRecordSchema,
  props: unknownRecordSchema,
  size: sizeSchema,
  rotation: z.number(),
});

const syncFrameItemInputSchema = syncItemBaseSchema.extend({
  type: z.literal('frame'),
  style: unknownRecordSchema,
  props: z.object({
    w: z.number().positive(),
    h: z.number().positive(),
    name: z.string().min(1).max(200),
    color: z.string().min(1),
  }),
  size: sizeSchema,
  rotation: z.literal(0),
  parentShapeId: z.null().default(null),
});

export const syncItemInputSchema = z.discriminatedUnion('type', [
  syncNoteItemInputSchema,
  syncFrameItemInputSchema,
]);
```

- [ ] **Step 4: Cập nhật model type**

Trong `apps/api/src/modules/items/item.model.ts`:

```ts
  type: 'note' | 'frame';
```

và đổi schema enum thành:

```ts
    type: { type: String, enum: ['note', 'frame'], required: true },
```

Đổi `content` của model thành `{ type: String, default: '' }` để frame có content rỗng
mà không bị Mongoose `required` từ chối; DB validator vẫn yêu cầu field `content`.

Để giữ typecheck xanh trước khi Task 3/5 hoàn tất, trong `apps/web/features/whiteboard/whiteboard-canvas.tsx`
đổi `parentFrameId: null` thành `parentShapeId: null`, và trong `item.service.ts` dùng
`input.items.flatMap` bỏ qua item không phải note. Task 3 và Task 5 thay thế hai đoạn tạm này.

- [ ] **Step 5: Chạy test và typecheck**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/frame-contracts.test.ts`

Expected: PASS 3 test.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/item.ts apps/api/src/modules/items/item.model.ts apps/api/test/frame-contracts.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add frame item contracts"
```

---

### Task 2: Migration 007 mở validator items

**Files:**
- Modify: `apps/api/src/db/collection-validators.ts`
- Create: `apps/api/src/db/migrations/007-phase-8b.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`
- Modify: `apps/api/test/validators.integration.test.ts`

**Interfaces:**
- Consumes: `COLLECTION_VALIDATORS.items` từ Task 1 (enum note/frame).
- Produces: migration `007-phase-8b`; `MIGRATION_007_NAME = '007-phase-8b'`; `LATEST_MIGRATION_NAME` trỏ 007.

- [ ] **Step 1: Viết failing migration/validator test**

Trong `apps/api/test/migrations.integration.test.ts`, thêm `MIGRATION_007_NAME` vào import từ `../src/db/migration-runner.js`, thêm vào danh sách idempotent:

```ts
    expect(migrations).not.toContain(MIGRATION_007_NAME);
```

Đổi assertion schema version cuối test idempotent thành:

```ts
    await expect(assertSchemaVersion(connection, MIGRATION_007_NAME)).resolves.toBeUndefined();
```

Thêm test mới trước dấu `});` cuối file:

```ts
  it('007 mở validator items cho frame', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const frame = {
      boardId: legacyBoardId,
      shapeId: 'shape:frame-legacy',
      type: 'frame',
      content: '',
      style: { color: 'yellow' },
      props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
      position: { x: 0, y: 0 },
      size: { w: 220, h: 700 },
      rotation: 0,
      tldrawIndex: 'a1',
      parentFrameId: null,
      authorId: new Types.ObjectId(legacyOwnerId),
      votes: [],
      promotedTaskId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(connection.db.collection('items').insertOne(frame)).resolves.toBeDefined();
    await expect(
      connection.db.collection('items').insertOne({
        ...frame,
        _id: new Types.ObjectId(),
        shapeId: 'shape:bad-type',
        type: 'shape',
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

Trong `apps/api/test/validators.integration.test.ts`, thêm test mới trong `describe`:

```ts
  it('items nhận frame và từ chối type lạ', async () => {
    const frame = {
      boardId: new Types.ObjectId(),
      shapeId: 'shape:raw-frame',
      type: 'frame',
      content: '',
      style: { color: 'yellow' },
      props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
      position: { x: 0, y: 0 },
      size: { w: 220, h: 700 },
      rotation: 0,
      tldrawIndex: 'a0',
      parentFrameId: null,
      authorId: new Types.ObjectId(),
      votes: [],
      promotedTaskId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await expect(db().collection('items').insertOne(frame)).resolves.toBeDefined();
    await expect(
      db().collection('items').insertOne({
        ...frame,
        _id: new Types.ObjectId(),
        shapeId: 'shape:raw-unknown',
        type: 'unknown',
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts`

Expected: FAIL vì chưa có `MIGRATION_007_NAME` và validator chưa nhận frame.

- [ ] **Step 3: Cập nhật validator enum**

Trong `apps/api/src/db/collection-validators.ts`, đổi:

```ts
        type: { bsonType: 'string', enum: ['note'] },
```

thành:

```ts
        type: { bsonType: 'string', enum: ['note', 'frame'] },
```

- [ ] **Step 4: Tạo migration 007**

Tạo `apps/api/src/db/migrations/007-phase-8b.ts`:

```ts
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

export const phase8bMigration: Migration = {
  name: '007-phase-8b',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    const validator = COLLECTION_VALIDATORS.items;
    if (!validator) throw new Error('Thiếu validator items');
    await db.command({ collMod: 'items', validator, ...VALIDATION });
  },
};
```

- [ ] **Step 5: Đăng ký migration**

Trong `apps/api/src/db/migration-runner.ts`, thêm import:

```ts
import { phase8bMigration } from './migrations/007-phase-8b.js';
```

Thêm hằng số:

```ts
export const MIGRATION_007_NAME = '007-phase-8b';
export const LATEST_MIGRATION_NAME = MIGRATION_007_NAME;
```

và thêm `phase8bMigration` vào cuối mảng `migrations`.

- [ ] **Step 6: Chạy test**

Run: `npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/collection-validators.ts apps/api/src/db/migrations/007-phase-8b.ts apps/api/src/db/migration-runner.ts apps/api/test/migrations.integration.test.ts apps/api/test/validators.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: allow frame items in schema validator"
```

---

### Task 3: Sync transaction cho frame và note con

**Files:**
- Modify: `apps/api/src/modules/items/item.service.ts`
- Create: `apps/api/test/frames.integration.test.ts`

**Interfaces:**
- Consumes: `SyncItemInput`, `Item.type`, migration 007.
- Produces: `GET /items` trả note+frame; `PUT /items` nhận union; note `parentFrameId` đúng; xóa frame reparent con.

- [ ] **Step 1: Viết failing integration test**

Tạo `apps/api/test/frames.integration.test.ts`:

```ts
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ItemModel } from '../src/modules/items/item.model.js';
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

function frame(shapeId = 'shape:frame1', overrides: Record<string, unknown> = {}) {
  return {
    shapeId,
    type: 'frame',
    style: { color: 'yellow' },
    props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
    position: { x: 100, y: 200 },
    size: { w: 220, h: 700 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentShapeId: null,
    expectedVersion: 0,
    ...overrides,
  };
}

function note(
  shapeId = 'shape:note1',
  parentShapeId: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    shapeId,
    type: 'note',
    content: 'Ý tưởng',
    style: { color: 'yellow' },
    props: { color: 'yellow' },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a2',
    parentShapeId,
    expectedVersion: 0,
    ...overrides,
  };
}

async function setupBoard() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Frame board' })
    .expect(201);
  return { owner, boardId: boardResponse.body.data._id as string };
}

describe('frame sync', () => {
  it('sync frame và note con trong một request', async () => {
    const { owner, boardId } = await setupBoard();

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);

    const frameItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );
    expect(frameItem).toMatchObject({ type: 'frame', parentFrameId: null, content: '' });
    expect(noteItem.parentFrameId).toBe(frameItem._id);

    const listed = await owner.agent.get(`/api/v1/boards/${boardId}/items`).expect(200);
    expect(listed.body.data).toHaveLength(2);
  });

  it('resolve frame đã có ngoài payload', async () => {
    const { owner, boardId } = await setupBoard();
    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame()] })
      .expect(200);

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:note1', 'shape:frame1')] })
      .expect(200);

    const frameItem = await ItemModel.findOne({ boardId, shapeId: 'shape:frame1' }).exec();
    const noteItem = response.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );
    expect(noteItem.parentFrameId).toBe(frameItem?._id.toHexString());
  });

  it('từ chối frame cha không tồn tại, size lệch và version cũ', async () => {
    const { owner, boardId } = await setupBoard();

    const missingParent = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:note1', 'shape:missing')] })
      .expect(422);
    expect(missingParent.body.error.code).toBe('FRAME_NOT_FOUND');

    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame('shape:frame1', { size: { w: 100, h: 700 } })] })
      .expect(422);

    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame('shape:frame1')] })
      .expect(200);
    const stale = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [frame('shape:frame1', { expectedVersion: created.body.data[0].version - 1 })],
      })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:frame1' },
    });
  });

  it('xóa frame chuyển note con về page level', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);
    const frameItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: 'shape:frame1', expectedVersion: frameItem.version }],
      })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      shapeId: 'shape:note1',
      parentFrameId: null,
      position: { x: 110, y: 220 },
      version: noteItem.version + 1,
    });
  });

  it('xóa frame giữ note đã promote và reparent note đó', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);
    const frameItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:frame1',
    );
    const noteItem = created.body.data.find(
      (item: { shapeId: string }) => item.shapeId === 'shape:note1',
    );

    const promoted = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${noteItem._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: noteItem.version })
      .expect(201);
    expect(promoted.body.data.task.origin.frameId).toBe(frameItem._id);

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: 'shape:frame1', expectedVersion: frameItem.version }],
      })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      shapeId: 'shape:note1',
      parentFrameId: null,
      position: { x: 110, y: 220 },
      promotedTaskId: promoted.body.data.task._id,
      version: promoted.body.data.item.version + 1,
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/frames.integration.test.ts`

Expected: FAIL vì `item.service.ts` còn `type: "note"` cố định và chưa xử lý frame.

- [ ] **Step 3: Cập nhật listItems**

Trong `apps/api/src/modules/items/item.service.ts`, đổi:

```ts
export async function listItems(board: BoardDocument): Promise<ItemDocument[]> {
  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1, _id: 1 }).exec();
}
```

thành:

```ts
export async function listItems(board: BoardDocument): Promise<ItemDocument[]> {
  return ItemModel.find({ boardId: board._id, type: { $in: ['note', 'frame'] } })
    .sort({ createdAt: 1, _id: 1 })
    .exec();
}
```

- [ ] **Step 4: Thay runSyncTransaction**

Thay toàn bộ hàm `runSyncTransaction` trong `apps/api/src/modules/items/item.service.ts` bằng:

```ts
async function runSyncTransaction(
  board: BoardDocument,
  userId: Types.ObjectId,
  input: SyncItemsRequest,
): Promise<ItemDocument[]> {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const shapeIds = [
          ...input.items.map((item) => item.shapeId),
          ...input.deleted.map((item) => item.shapeId),
        ];
        const existing = await ItemModel.find({
          boardId: board._id,
          type: { $in: ['note', 'frame'] },
          shapeId: { $in: shapeIds },
        }).session(session);
        const byShapeId = new Map(existing.map((item) => [item.shapeId, item]));

        for (const item of input.items) {
          const current = byShapeId.get(item.shapeId);
          if (!current) {
            if (item.expectedVersion !== 0) {
              throw versionConflict(0, item.shapeId);
            }
            continue;
          }
          if (current.version !== item.expectedVersion) {
            throw versionConflict(current.version, item.shapeId);
          }
        }

        for (const deleted of input.deleted) {
          const current = byShapeId.get(deleted.shapeId);
          if (!current) continue;
          if (current.type === 'note' && current.promotedTaskId) continue;
          if (current.version !== deleted.expectedVersion) {
            throw versionConflict(current.version, deleted.shapeId);
          }
        }

        const now = new Date();
        const frameInputs = input.items.filter(
          (item): item is Extract<SyncItemInput, { type: 'frame' }> => item.type === 'frame',
        );
        const noteInputs = input.items.filter(
          (item): item is Extract<SyncItemInput, { type: 'note' }> => item.type === 'note',
        );

        for (const item of frameInputs) {
          if (item.size.w !== item.props.w || item.size.h !== item.props.h) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Frame size không khớp props');
          }
        }

        const frameOps = frameInputs.map((item) => {
          const current = byShapeId.get(item.shapeId);
          const fields = {
            type: 'frame' as const,
            content: '',
            style: item.style,
            props: item.props,
            position: item.position,
            size: { w: item.props.w, h: item.props.h },
            rotation: 0,
            tldrawIndex: item.tldrawIndex,
            parentFrameId: null,
            updatedAt: now,
          };

          if (!current) {
            return {
              updateOne: {
                filter: { boardId: board._id, shapeId: item.shapeId, version: 0 },
                update: {
                  $set: fields,
                  $setOnInsert: {
                    authorId: userId,
                    votes: [],
                    promotedTaskId: null,
                    createdAt: now,
                  },
                  $inc: { version: 1 },
                },
                upsert: true,
              },
            };
          }

          return {
            updateOne: {
              filter: { _id: current._id, version: item.expectedVersion },
              update: {
                $set: fields,
                $inc: { version: 1 },
              },
            },
          };
        });

        if (frameOps.length > 0) {
          await ItemModel.bulkWrite(frameOps, { session });
        }

        const frameByShapeId = new Map<string, Types.ObjectId>();
        if (frameInputs.length > 0) {
          const frames = await ItemModel.find({
            boardId: board._id,
            type: 'frame',
            shapeId: { $in: frameInputs.map((item) => item.shapeId) },
          }).session(session);
          for (const frame of frames) frameByShapeId.set(frame.shapeId, frame._id);
        }

        const missingParentShapeIds = [
          ...new Set(
            noteInputs
              .map((item) => item.parentShapeId)
              .filter(
                (shapeId): shapeId is string =>
                  shapeId !== null && !frameByShapeId.has(shapeId),
              ),
          ),
        ];
        if (missingParentShapeIds.length > 0) {
          const frames = await ItemModel.find({
            boardId: board._id,
            type: 'frame',
            shapeId: { $in: missingParentShapeIds },
          }).session(session);
          for (const frame of frames) frameByShapeId.set(frame.shapeId, frame._id);
        }

        for (const item of noteInputs) {
          if (item.parentShapeId && !frameByShapeId.has(item.parentShapeId)) {
            throw new AppError(422, 'FRAME_NOT_FOUND', 'Frame cha không tồn tại');
          }
        }

        const noteOps = noteInputs.map((item) => {
          const current = byShapeId.get(item.shapeId);
          const fields = {
            type: 'note' as const,
            content: item.content,
            style: item.style,
            props: item.props,
            position: item.position,
            size: item.size,
            rotation: item.rotation,
            tldrawIndex: item.tldrawIndex,
            parentFrameId: item.parentShapeId
              ? (frameByShapeId.get(item.parentShapeId) ?? null)
              : null,
            updatedAt: now,
          };

          if (!current) {
            return {
              updateOne: {
                filter: { boardId: board._id, shapeId: item.shapeId, version: 0 },
                update: {
                  $set: fields,
                  $setOnInsert: {
                    authorId: userId,
                    votes: [],
                    promotedTaskId: null,
                    createdAt: now,
                  },
                  $inc: { version: 1 },
                },
                upsert: true,
              },
            };
          }

          return {
            updateOne: {
              filter: { _id: current._id, version: item.expectedVersion },
              update: {
                $set: fields,
                $inc: { version: 1 },
              },
            },
          };
        });

        if (noteOps.length > 0) {
          await ItemModel.bulkWrite(noteOps, { session });
        }

        const deleteOps = input.deleted.flatMap((deleted) => {
          const current = byShapeId.get(deleted.shapeId);
          if (!current || current.type !== 'note' || current.promotedTaskId) return [];
          return [
            {
              deleteOne: {
                filter: { _id: current._id, version: deleted.expectedVersion },
              },
            },
          ];
        });

        if (deleteOps.length > 0) {
          await ItemModel.bulkWrite(deleteOps, { session });
        }

        const framesToDelete: ItemDocument[] = [];
        for (const deleted of input.deleted) {
          const current = byShapeId.get(deleted.shapeId);
          if (current?.type === 'frame') framesToDelete.push(current);
        }

        for (const frame of framesToDelete) {
          const children = await ItemModel.find({
            boardId: board._id,
            parentFrameId: frame._id,
          }).session(session);
          for (const child of children) {
            const updatedChild = await ItemModel.updateOne(
              { _id: child._id, version: child.version },
              {
                $set: {
                  parentFrameId: null,
                  position: {
                    x: frame.position.x + child.position.x,
                    y: frame.position.y + child.position.y,
                  },
                  updatedAt: now,
                },
                $inc: { version: 1 },
              },
              { session },
            );
            if (updatedChild.matchedCount !== 1) {
              throw versionConflict(child.version, child.shapeId);
            }
          }

          const deletedFrame = await ItemModel.deleteOne(
            { _id: frame._id, version: frame.version },
            { session },
          );
          if (deletedFrame.deletedCount !== 1) {
            throw versionConflict(frame.version, frame.shapeId);
          }
        }

        return ItemModel.find({ boardId: board._id, type: { $in: ['note', 'frame'] } })
          .sort({ createdAt: 1, _id: 1 })
          .session(session)
          .exec();
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

Giữ nguyên `syncItems` bọc ngoài và `duplicateShapeId`.

- [ ] **Step 5: Cập nhật import contract**

Trong `apps/api/src/modules/items/item.service.ts`, đổi import đầu file thành:

```ts
import type { SyncItemInput, SyncItemsRequest } from '@nextask/contracts';
```

- [ ] **Step 6: Chạy test**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/frames.integration.test.ts`

Expected: PASS 5 test.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/items/item.service.ts apps/api/test/frames.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: sync frames and reparent children on delete"
```

---

### Task 4: Chặn promote/vote/report trên frame

**Files:**
- Modify: `apps/api/src/modules/items/promotion.service.ts`
- Modify: `apps/api/test/frames.integration.test.ts`

**Interfaces:**
- Consumes: frame sync từ Task 3.
- Produces: `POST /items/:id/promote` trả `422 NOT_A_NOTE` cho frame; vote frame 404; report bỏ qua frame.

- [ ] **Step 1: Viết failing test**

Thêm ba test vào `describe('frame sync')` trong `apps/api/test/frames.integration.test.ts`:

```ts
  it('promote frame trả 422 NOT_A_NOTE', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame()] })
      .expect(200);
    const frameItem = created.body.data[0];

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${frameItem._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: frameItem.version })
      .expect(422);

    expect(response.body.error.code).toBe('NOT_A_NOTE');
    expect(await TaskModel.countDocuments({ boardId })).toBe(0);
  });

  it('vote frame trả 404', async () => {
    const { owner, boardId } = await setupBoard();
    const created = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame()] })
      .expect(200);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${created.body.data[0]._id}/votes`)
      .expect(404);
  });

  it('report bỏ qua frame', async () => {
    const { owner, boardId } = await setupBoard();
    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [frame(), note('shape:note1', 'shape:frame1')] })
      .expect(200);

    const report = await owner.agent
      .get(`/api/v1/boards/${boardId}/reports/stalled-ideas?minVotes=0&stalledDays=1&limit=50`)
      .expect(200);

    expect(report.body.data.unpromotedIdeas).toHaveLength(1);
    expect(report.body.data.unpromotedIdeas[0].content).toBe('Ý tưởng');
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/frames.integration.test.ts`

Expected: FAIL ở test promote frame vì service chưa chặn frame.

- [ ] **Step 3: Thêm type guard**

Trong `apps/api/src/modules/items/promotion.service.ts`, ngay sau khi tìm thấy `item` và trước kiểm tra `item.version`:

```ts
        if (item.type !== 'note') {
          throw new AppError(422, 'NOT_A_NOTE', 'Item không phải note');
        }
```

- [ ] **Step 4: Chạy test**

Run: `npm run test --workspace @nextask/api -- test/frames.integration.test.ts`

Expected: PASS 8 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/items/promotion.service.ts apps/api/test/frames.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: reject frame promotion and keep reports note-only"
```

---

### Task 5: Web toolbar, sync và hydration frame

**Files:**
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`

**Interfaces:**
- Consumes: `SyncItemInput` union từ Task 1; API sync từ Task 3.
- Produces: toolbar `Frame`; sync/hydrate frame; header `X ghi chú · Y frame · Z task`.

- [ ] **Step 1: Cập nhật import tldraw**

Trong `apps/web/features/whiteboard/whiteboard-canvas.tsx`, thêm vào import từ `tldraw`:

```ts
  type TLFrameShape,
  type TLFrameShapeProps,
```

- [ ] **Step 2: Cập nhật syncNow**

Thay đoạn lấy `shapes` và map payload hiện tại bằng:

```ts
        const shapes = currentEditor
          .getCurrentPageShapes()
          .filter(
            (shape): shape is TLNoteShape | TLFrameShape =>
              shape.type === 'note' || shape.type === 'frame',
          );

        const known = knownItemsRef.current;
        const localShapeIds = new Set<string>(shapes.map((shape) => shape.id));
        const payload: SyncItemInput[] = shapes.map((shape) => {
          const expectedVersion = known.get(shape.id)?.version ?? 0;

          if (shape.type === 'frame') {
            const props = shape.props as TLFrameShapeProps;
            return {
              shapeId: shape.id,
              type: 'frame' as const,
              style: { color: props.color },
              props: {
                w: props.w,
                h: props.h,
                name: props.name,
                color: props.color,
              },
              position: { x: shape.x, y: shape.y },
              size: { w: props.w, h: props.h },
              rotation: 0,
              tldrawIndex: String(shape.index),
              parentShapeId: null,
              expectedVersion,
            };
          }

          const bounds = currentEditor.getShapePageBounds(shape);
          const props = shape.props as TLNoteShapeProps;
          const parent = shape.parentId ? currentEditor.getShape(shape.parentId) : null;
          const parentShapeId = parent?.type === 'frame' ? parent.id : null;
          return {
            shapeId: shape.id,
            type: 'note' as const,
            content: currentEditor.getShapeUtil(shape).getText(shape) ?? '',
            style: {
              color: props.color,
              size: props.size,
              font: props.font,
              align: props.align,
            } as Record<string, unknown>,
            props: props as unknown as Record<string, unknown>,
            position: { x: shape.x, y: shape.y },
            size: { w: bounds?.w ?? 200, h: bounds?.h ?? 200 },
            rotation: shape.rotation,
            tldrawIndex: String(shape.index),
            parentShapeId,
            expectedVersion,
          };
        });
```

- [ ] **Step 3: Cập nhật hydration**

Thay khối `if (initialItemsRef.current.length > 0) { mountedEditor.createShapes(...) }` bằng:

```ts
      if (initialItemsRef.current.length > 0) {
        const frameItems = initialItemsRef.current.filter((item) => item.type === 'frame');
        const noteItems = initialItemsRef.current.filter((item) => item.type === 'note');
        const frameShapeIds = new Map(frameItems.map((item) => [item._id, item.shapeId]));

        if (frameItems.length > 0) {
          mountedEditor.createShapes(
            frameItems.map((item) => ({
              id: item.shapeId as TLShapeId,
              type: 'frame',
              x: item.position.x,
              y: item.position.y,
              rotation: 0,
              index: item.tldrawIndex as TLFrameShape['index'],
              props: item.props as unknown as TLFrameShapeProps,
            })),
          );
        }

        if (noteItems.length > 0) {
          mountedEditor.createShapes(
            noteItems.map((item) => {
              const props = item.props as Partial<TLNoteShapeProps>;
              const parentShapeId = item.parentFrameId
                ? frameShapeIds.get(item.parentFrameId)
                : undefined;
              return {
                id: item.shapeId as TLShapeId,
                type: 'note',
                x: item.position.x,
                y: item.position.y,
                rotation: item.rotation,
                index: item.tldrawIndex as TLNoteShape['index'],
                ...(parentShapeId ? { parentId: parentShapeId as TLShapeId } : {}),
                props: {
                  ...props,
                  richText: props.richText ?? toRichText(item.content),
                } as TLNoteShapeProps,
              };
            }),
          );
        }

        mountedEditor.zoomToFit({ animation: { duration: 0 } });
      }
```

Sửa thông báo lỗi thành `'Không dựng lại được whiteboard.'`.

- [ ] **Step 4: Thêm toolbar Frame**

Trong tuple toolbar, thêm:

```ts
            ['frame', 'Frame'],
```

và đổi chữ ký:

```ts
  function selectTool(tool: 'select' | 'hand' | 'note' | 'frame') {
```

- [ ] **Step 5: Cập nhật header**

Trong `apps/web/features/workspace/board-workspace.tsx`, thay dòng:

```tsx
              {data.items.length} ghi chú · {data.tasks.length} task
```

bằng:

```tsx
              {data.items.filter((item) => item.type === 'note').length} ghi chú ·{' '}
              {data.items.filter((item) => item.type === 'frame').length} frame ·{' '}
              {data.tasks.length} task
```

- [ ] **Step 6: Chạy typecheck và build web**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build:web`

Expected: PASS, route `/boards/[boardId]` build thành công.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/whiteboard/whiteboard-canvas.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: sync and hydrate whiteboard frames"
```

---

### Task 6: Seed demo 3 frame và E2E assertion

**Files:**
- Modify: `apps/api/src/db/seed-demo.ts`
- Modify: `apps/api/test/seed-demo.integration.test.ts`
- Modify: `e2e/mvp-smoke.spec.ts`

**Interfaces:**
- Consumes: model type frame, sync/API frame.
- Produces: seed 3 frame + 9 note con; header E2E `3 frame`.

- [ ] **Step 1: Cập nhật failing seed test**

Trong `apps/api/test/seed-demo.integration.test.ts`, đổi `firstCounts` và `secondCounts` để đếm frame:

```ts
    const firstCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      frames: await ItemModel.countDocuments({ boardId: demoId, type: 'frame' }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
    expect(firstCounts).toEqual({ items: 12, frames: 3, tasks: 5, activities: 4, budgets: 3 });
```

Tương tự cho `secondCounts`:

```ts
    const secondCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      frames: await ItemModel.countDocuments({ boardId: demoId, type: 'frame' }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
```

Thêm assertion frame/note sau `expect(first.boardId).toBe(demoId.toHexString());`:

```ts
    const startFrame = await ItemModel.findOne({
      boardId: demoId,
      shapeId: 'shape:seed-frame-start',
    }).exec();
    expect(startFrame?.type).toBe('frame');
    const startNote = await ItemModel.findOne({
      boardId: demoId,
      shapeId: 'shape:seed-start-1',
    }).exec();
    expect(startNote?.parentFrameId?.toHexString()).toBe(startFrame?._id.toHexString());
    const seededTask = await TaskModel.findOne({
      boardId: demoId,
      title: 'Demo: chia sẻ context sớm',
    }).exec();
    expect(seededTask?.origin?.frameId?.toHexString()).toBe(startFrame?._id.toHexString());
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/seed-demo.integration.test.ts`

Expected: FAIL vì seed chưa có frame (items 9, frames 0).

- [ ] **Step 3: Thêm frames và đổi notes**

Trong `apps/api/src/db/seed-demo.ts`, thêm trước `const notes = [`:

```ts
const frames = [
  { shapeId: 'shape:seed-frame-start', name: 'Start', color: 'yellow', x: 0, y: 0 },
  { shapeId: 'shape:seed-frame-stop', name: 'Stop', color: 'red', x: 300, y: 0 },
  { shapeId: 'shape:seed-frame-continue', name: 'Continue', color: 'green', x: 600, y: 0 },
];
```

Thay toàn bộ mảng `notes` bằng:

```ts
const notes = [
  {
    shapeId: 'shape:seed-start-1',
    content: 'Start: chia sẻ context sớm',
    color: 'yellow',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-start-2',
    content: 'Start: chốt scope trong ngày',
    color: 'blue',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-start-3',
    content: 'Start: demo sớm',
    color: 'green',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 480,
  },
  {
    shapeId: 'shape:seed-stop-1',
    content: 'Stop: họp quá dài',
    color: 'red',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-stop-2',
    content: 'Stop: task không có owner',
    color: 'yellow',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-stop-3',
    content: 'Stop: blocker không được nêu',
    color: 'blue',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 480,
  },
  {
    shapeId: 'shape:seed-continue-1',
    content: 'Continue: pair review',
    color: 'green',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-continue-2',
    content: 'Continue: viết note ngắn',
    color: 'red',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-continue-3',
    content: 'Continue: cập nhật Kanban',
    color: 'yellow',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 480,
  },
];
```

- [ ] **Step 4: Tạo frame trước note trong transaction**

Trong transaction, sau `await ItemModel.deleteMany({ boardId: board._id }, { session });`, thêm:

```ts
        const createdFrames = await ItemModel.create(
          frames.map((frame, index) => ({
            boardId: board._id,
            shapeId: frame.shapeId,
            type: 'frame' as const,
            content: '',
            style: { color: frame.color },
            props: { w: 220, h: 700, name: frame.name, color: frame.color },
            position: { x: frame.x, y: frame.y },
            size: { w: 220, h: 700 },
            rotation: 0,
            tldrawIndex: `a${index + 1}`,
            parentFrameId: null,
            authorId: ownerId,
            votes: [],
            promotedTaskId: null,
            version: 1,
          })),
          { session, ordered: true },
        );
        const frameByShape = new Map(createdFrames.map((frame) => [frame.shapeId, frame]));
```

Đổi `createdItems` (notes) map để dùng frame:

```ts
        const createdItems = await ItemModel.create(
          notes.map((note, index) => {
            const parentFrame = frameByShape.get(note.frame);
            if (!parentFrame) throw new Error(`Thiếu frame ${note.frame}`);
            return {
              boardId: board._id,
              shapeId: note.shapeId,
              type: 'note' as const,
              content: note.content,
              style: { color: note.color },
              props: { color: note.color },
              position: { x: note.x, y: note.y },
              size: { w: 200, h: 200 },
              rotation: 0,
              tldrawIndex: `a${frames.length + index + 1}`,
              parentFrameId: parentFrame._id,
              authorId: ownerId,
              votes:
                note.shapeId === 'shape:seed-stop-2'
                  ? memberIds.map((userId) => ({ userId, createdAt: new Date() }))
                  : note.shapeId === 'shape:seed-continue-2'
                    ? [{ userId: ownerId, createdAt: new Date() }]
                    : [],
              promotedTaskId: null,
              version: 1,
            };
          }),
          { session, ordered: true },
        );
```

Đổi `origin.frameId` trong `taskPayloads.map` từ `frameId: null` thành:

```ts
                  frameId: item.parentFrameId,
```

- [ ] **Step 5: Thêm E2E assertion**

Trong `e2e/mvp-smoke.spec.ts`, sau dòng heading board:

```ts
  await expect(page.getByText(/3 frame/)).toBeVisible();
```

- [ ] **Step 6: Chạy seed test**

Run: `npm run build:contracts && npm run test --workspace @nextask/api -- test/seed-demo.integration.test.ts`

Expected: PASS 2 test.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/seed-demo.ts apps/api/test/seed-demo.integration.test.ts e2e/mvp-smoke.spec.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: seed demo frames and assert frame header"
```

---

### Task 7: Rehearsal migration, reseed và browser verification

**Files:**
- Không tạo file code; ghi evidence vào phase doc ở Task 8.
- Có thể dùng browser verification tool có sẵn.

**Interfaces:**
- Consumes: migration 007, API/web/seed từ Task 1-6.
- Produces: app DB áp 007; demo seed 12 item/3 frame; E2E pass; screenshot/manual evidence.

- [ ] **Step 1: Backup app DB**

Run:

```bash
npm run db:backup -- before-8b
gzip -t backups/nextask-before-8b-*.gz
ls -lh backups/nextask-before-8b-*.gz
```

Expected: file `backups/nextask-before-8b-YYYYMMDD-HHMMSS.gz`, `gzip -t` pass. Ghi lại tên file và kích thước.

- [ ] **Step 2: Rehearsal trên database tạm**

Run:

```bash
archive="$(ls -t backups/nextask-before-8b-*.gz | head -n 1)"
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_8b_rehearsal").dropDatabase()'
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_8b_rehearsal.*' < "$archive"
docker compose run --rm --no-deps -e MONGODB_URI='mongodb://mongo:27017/nextask_8b_rehearsal?replicaSet=rs0' migrate
```

Kiểm tra:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_8b_rehearsal");
printjson({
  items: db.items.countDocuments(),
  notes: db.items.countDocuments({ type: "note" }),
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
});
'
```

Expected: `007-phase-8b` trong migrations; số item cũ giữ nguyên. Ghi lại counts. Nếu lỗi, dừng và sửa migration trước khi áp app DB.

Xóa rehearsal:

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_8b_rehearsal").dropDatabase()'
```

- [ ] **Step 3: Áp migration app DB**

Run:

```bash
npm run db:migrate
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
printjson({
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
  items: db.items.countDocuments(),
});
'
```

Expected: có `007-phase-8b`; counts cũ giữ nguyên.

- [ ] **Step 4: Rebuild Docker và reseed**

Run:

```bash
docker compose build migrate api web
docker compose up -d --force-recreate migrate api web
docker compose ps
curl -s http://localhost:4000/api/v1/health
npm run db:seed
```

Expected: API/web healthy; health version `0.7.0`; seed in ra board demo với 12 item. Kiểm tra Mongo:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
const board = db.boards.findOne({ name: "NexTask Demo Retro" });
printjson({
  items: db.items.countDocuments({ boardId: board._id }),
  frames: db.items.countDocuments({ boardId: board._id, type: "frame" }),
  nestedNotes: db.items.countDocuments({ boardId: board._id, type: "note", parentFrameId: { $ne: null } }),
});
'
```

Expected: `{ items: 12, frames: 3, nestedNotes: 9 }`.

- [ ] **Step 5: Chạy Playwright smoke**

Run: `npm run test:e2e`

Expected: PASS; header chứa `3 frame`.

- [ ] **Step 6: Browser verification**

Dùng browser verification tool có sẵn với một tab duy nhất:

1. Đăng nhập `owner@nextask.local` / `nextask-local-owner-2026`, mở `NexTask Demo Retro`.
2. Chụp screenshot: thấy 3 frame Start/Stop/Continue, 9 note nằm trong frame.
3. Chọn công cụ `Frame`, tạo frame mới, kéo một note vào frame, chờ trạng thái `Đã lưu`.
4. Reload: frame mới, tên, kích thước và note con giữ nguyên.
5. Chọn note trong frame, promote sang cột `todo`; xác nhận task xuất hiện trên Kanban.
6. Kiểm tra origin trong Mongo:

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
printjson(db.tasks.findOne({ title: /Ý tưởng/ }, { title: 1, origin: 1 }));
'
```

Expected: `origin.frameId` khác null.

7. Chọn frame chứa note đã promote và xóa frame; chờ lưu rồi reload.
8. Xác nhận note đã promote vẫn còn trên whiteboard ở page level, badge/task không mất. Chụp screenshot.

Nếu thao tác tldraw không ổn định, ghi rõ bước nào fail và dừng; không đánh dấu pass.

- [ ] **Step 7: Chưa commit**

Task này chỉ tạo evidence; docs commit ở Task 8.

---

### Task 8: Docs, quality gate và merge release/v0.8

**Files:**
- Modify: `docs/phases/08b-frames.md`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/session-log.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/mongodb-notes.md`

**Interfaces:**
- Consumes: evidence Task 7.
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

Expected: tất cả pass. Ghi lại số file/test và ba duration thực tế.

- [ ] **Step 2: Cập nhật phase doc**

Trong `docs/phases/08b-frames.md`:

- Đổi trạng thái thành `Hoàn thành, chờ merge release/v0.8`.
- Thêm mục `## 14. Kiểm chứng` với:
  - backup file + size;
  - rehearsal DB counts/migration applied;
  - app DB migration applied; counts trước/sau;
  - seed counts `12 item, 3 frame, 9 note con`;
  - Playwright pass;
  - browser steps pass/fail và screenshot đã xem;
  - feature gate counts/durations.

- [ ] **Step 3: Cập nhật README**

Trong `README.md`:

- Thêm bullet Phase 8B sau Phase 8A:
  `Phase 8B: frame tldraw nhóm note, sync/hydrate frame + note con, seed Start/Stop/Continue, promote frame bị chặn.`
- Đổi câu còn lại thành `Chưa có cursor pagination và text index; để Phase 8C.`
- Cập nhật số file/test trong mục Kiểm tra theo gate thực tế.
- Thêm link `[Phase 8B](docs/phases/08b-frames.md)`.
- Trong mục Git, thêm: `Phase 8B đã merge vào release/v0.8; chưa merge main, chưa bump 0.8.0.`

- [ ] **Step 4: Cập nhật architecture, session log, git workflow, MongoDB notes**

`docs/architecture.md`:

- Đổi dòng trạng thái ngày thành `2026-11-18`; thêm câu Phase 8B đã có frame item, sync `parentShapeId`, reparent khi xóa frame; xem `docs/phases/08b-frames.md`.
- Đổi roadmap row 8B thành `Frame nhóm note`; thêm row 8C `Cursor pagination/text index`.

`docs/session-log.md`, thêm:

```md
## 2026-11-18 - Phase 8B frame

- Migration 007 mở validator items cho frame; backup/rehearsal/app DB đã áp.
- Seed demo 12 item (9 note + 3 frame); Playwright pass.
- Browser: tạo/kéo note vào frame, reload, promote note trong frame, xóa frame giữ note promoted.
- Feature gate: typecheck/lint/format/build web pass; full suite với số file/test thực tế
  và ba duration thực tế; Playwright pass.
```

Ghi số liệu thực tế từ output gate, không dùng giá trị ước lượng.

`docs/git-workflow.md`, thêm mục 24:

```md
## 24. Phase 8B

- Feature: `feat/phase-8b-frames`, tạo từ `release/v0.8`.
- Phạm vi: frame item, sync `parentShapeId`, reparent khi xóa frame, seed 3 frame, E2E header.
- Feature gate: ghi kết quả thực tế của typecheck/lint/format/build web/full suite/Playwright.
- Chờ merge feature vào `release/v0.8` bằng `--no-ff`; không bump `0.8.0`, không merge `main`.
```

`docs/mongodb-notes.md`, thêm mục `## 18. Quan sát Giai đoạn 8B` với backup, rehearsal,
app DB counts, migration 007 validator, seed counts và browser evidence thực tế.

- [ ] **Step 5: Quét CJK và commit docs**

Run:

```bash
grep -nP '[\x{4E00}-\x{9FFF}\x{3040}-\x{30FF}]' README.md docs/phases/08b-frames.md docs/architecture.md docs/session-log.md docs/git-workflow.md docs/mongodb-notes.md
```

Expected: không có output (hoặc chỉ ký tự CJK có chủ đích; nếu có, sửa).

Commit:

```bash
git add docs/phases/08b-frames.md README.md docs/architecture.md docs/session-log.md docs/git-workflow.md docs/mongodb-notes.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 8b verification"
```

- [ ] **Step 6: Merge feature vào release**

Run:

```bash
git checkout release/v0.8
git status --short
git merge --no-ff feat/phase-8b-frames -m "merge: phase 8b frames"
git log --oneline -3
```

Expected: merge commit mới; working tree sạch.

- [ ] **Step 7: Release gate**

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

Expected: pass; health `0.7.0`; ghi lại counts/durations.

- [ ] **Step 8: Ghi release gate và xóa feature**

Cập nhật `docs/session-log.md` và `docs/git-workflow.md` với merge hash/release gate thực tế, commit docs:

```bash
git add docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 8b release gate"
git branch -d feat/phase-8b-frames
git status --short
git log --oneline -3
```

Expected: feature đã xóa; working tree sạch; `main` và tag `v0.7` không đổi; chưa bump `0.8.0`; không push.

---

## Self-Review Notes

- Spec coverage: data model Task 1/3; migration Task 2; sync/reparent Task 3; promote/vote/report guard Task 4; UI Task 5; seed/E2E Task 6; rehearsal/browser Task 7; gates/docs/merge Task 8.
- Không có placeholder trong code step; các bước ghi evidence yêu cầu thay bằng số liệu thực tế từ output lệnh trước khi commit.
- Type names thống nhất: `SyncItemInput`, `parentShapeId`, `parentFrameId`, `FRAME_NOT_FOUND`, `NOT_A_NOTE`, `MIGRATION_007_NAME`.
