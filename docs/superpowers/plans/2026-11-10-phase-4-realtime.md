# NexTask Phase 4 - Realtime Change Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Thêm realtime task/badge và presence bằng Change Streams + Socket.IO, có resume token/checkpoint và fallback refetch whiteboard.

**Architecture:** Mỗi board có watcher `items`/`tasks`, checkpoint `change_stream_checkpoints`; event map sang envelope chung và phát vào room board qua Socket.IO. Client cập nhật Kanban/badge live; item event refetch/remount whiteboard. Presence/cursor chỉ trong bộ nhớ API. Không live-merge tldraw/CRDT.

**Tech Stack:** Node 26, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 change streams, Socket.IO 4.8.4, Next.js 16.4.3, React 19.3.1, zod 4.6.7, Vitest 5.0.5.

**Spec:** `docs/phases/04-realtime.md`

**Branch:** `feat/phase-4-realtime` từ `release/v0.4`; release tạo từ `main` tại `52840fe`. Không merge `main` trong phase này.

**Trạng thái thực thi:** Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.4` bằng
`--no-ff` (`b11b326`) và merge `main` tại `de15b5a`; feature branch đã xóa. Commit chính:

- `3b57dcf` `docs: specify phase 4 realtime`
- `b264d31` `docs: plan phase 4 realtime`
- `2f0ce0a` `docs: start phase 4 execution`
- `08c76a9` `feat: add phase 4 checkpoint migration`
- `005dccc` `feat: add realtime event mapping and checkpoints`
- `a9ad1c9` `feat: add per-board change stream watcher`
- `f4eba3e` `feat: add realtime socket server and presence`
- `48834e7` `chore: format realtime api files`
- `0861418` `feat: add realtime web client and presence`
- `84cfa62` `docs: record phase 4 verification`
- `4e31180` `docs: record phase 4 verification`
- `b11b326` `merge: phase 4 realtime` vào `release/v0.4`
- `de15b5a` `release: v0.4 realtime` vào `main`

Feature gate: typecheck/lint/format pass; full suite 24 file, 106 test ba lần
16.67/16.88/19.67 s. Release gate: typecheck/lint/format pass; full suite 24 file,
106 test ba lần 20.27/16.62/16.63 s. Main gate: typecheck/lint/format pass; full suite
24 file, 106 test ba lần 15.60/15.55/15.60 s.

**Điều chỉnh thực tế:**

- Kiểu `ChangeStreamDocument` không lộ `fullDocument`/`fullDocumentBeforeChange` trên
  mọi biến thể; event mapper cast hai field này.
- Presence cursor overlay dùng lớp `z-30`, không phải `z-40` như snippet plan; hành vi
  không đổi.
- Browser verification dùng `fetch` cùng cookie cho client thứ hai; cursor kiểm chứng
  bằng synthetic `pointermove`.
- Task test đã xóa và note được khôi phục; version note tăng do cập nhật thật.

## Global Constraints

- MongoDB replica set thật cho test; không mock DB/Change Streams.
- Không đổi REST mutation API hiện có.
- Watcher per board/collection; checkpoint sau emit; at-least-once; client dedupe event id.
- Kanban/badge realtime; whiteboard refetch/remount, không live-merge tldraw.
- Presence/cursor trong bộ nhớ; không persist; một API instance; không Redis.
- Migration 004 tạo checkpoint collection, unique index, bật pre/post images; backup/rehearsal.
- Không bump version `0.4.0`; không merge `main`; tag `v0.3.0` giữ nguyên.
- Git local, không push/tag/amend/đổi config.
- Identity commit:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.

---

### Task 0: Docs baseline và plan

**Files:**
- Modify: `docs/phases/04-realtime.md`
- Create: `docs/superpowers/plans/2026-11-10-phase-4-realtime.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: spec 4 đã duyệt.
- Produces: plan 4, baseline feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git switch feat/phase-4-realtime
git status --short --branch
git log --oneline -1
```

Expected: HEAD `3b57dcf`; working tree sạch.

- [ ] **Step 2: Cập nhật spec status**

Trong `docs/phases/04-realtime.md`, đổi:

```markdown
- Trạng thái: Đã duyệt spec; implementation plan:
  [2026-11-10-phase-4-realtime.md](../superpowers/plans/2026-11-10-phase-4-realtime.md)
```

và đổi dòng `Implementation plan: chưa viết...` thành link plan.

- [ ] **Step 3: Ghi baseline git/session**

Trong `docs/git-workflow.md`, mục 1 ghi feature `feat/phase-4-realtime`, release
`release/v0.4`, main/tag `v0.3.0` không đổi.

Thêm vào `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 4 plan

- Spec `docs/phases/04-realtime.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-4-realtime.md`.
- Phạm vi: Change Streams per board, checkpoint, Socket.IO auth/room, presence.
- Chưa code; chờ chọn cách thực thi.
```

- [ ] **Step 4: Commit**

```bash
git add docs/phases/04-realtime.md docs/superpowers/plans/2026-11-10-phase-4-realtime.md docs/git-workflow.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 4 realtime"
```

---

### Task 1: Dependencies và migration 004

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/db/migrations/004-phase-4.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`

**Interfaces:**
- Produces:
  - `socket.io@4.8.4` (API), `socket.io-client@4.8.4` (web/API test).
  - `MIGRATION_004_NAME = '004-phase-4'`, `LATEST_MIGRATION_NAME`.
  - Collection `change_stream_checkpoints` + unique index.
  - `items`/`tasks` pre/post images enabled.

- [ ] **Step 1: Cài dependency**

```bash
npm install socket.io@4.8.4 --workspace @nextask/api
npm install socket.io-client@4.8.4 --workspace @nextask/web
npm install -D socket.io-client@4.8.4 --workspace @nextask/api
```

- [ ] **Step 2: Viết test migration 004 thất bại**

Trong `apps/api/test/migrations.integration.test.ts`:

- Import `MIGRATION_004_NAME`.
- Đổi assert latest thành `assertSchemaVersion(connection, MIGRATION_004_NAME)`.
- Thêm test:

```ts
it('004 tạo checkpoint collection/index và bật pre/post images', async () => {
  if (!connection.db) throw new Error('DB chưa kết nối');

  const [checkpointInfo] = await connection.db
    .listCollections({ name: 'change_stream_checkpoints' })
    .toArray();
  const checkpointOptions = (
    checkpointInfo as { options?: Record<string, unknown> } | undefined
  )?.options;
  expect(checkpointInfo).toBeDefined();
  expect(checkpointOptions?.validationLevel).toBe('strict');

  const indexes = await connection.db
    .collection('change_stream_checkpoints')
    .indexes();
  const unique = indexes.find(
    (index) => index.name === 'change_stream_checkpoints_board_collection',
  );
  expect(unique).toMatchObject({ unique: true });

  for (const name of ['items', 'tasks']) {
    const [info] = await connection.db.listCollections({ name }).toArray();
    const options = (info as { options?: Record<string, unknown> } | undefined)?.options;
    expect(options?.changeStreamPreAndPostImages).toEqual({ enabled: true });
  }
});
```

- [ ] **Step 3: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts
```

Expected: FAIL vì migration 004 chưa có.

- [ ] **Step 4: Tạo migration 004**

`apps/api/src/db/migrations/004-phase-4.ts`:

```ts
import type { CollectionInfo, Db } from 'mongodb';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const CHECKPOINT_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['boardId', 'collection', 'token', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      boardId: { bsonType: 'objectId' },
      collection: { bsonType: 'string', enum: ['items', 'tasks'] },
      token: { bsonType: ['object', 'binData'] },
      updatedAt: { bsonType: 'date' },
    },
  },
} as const;

async function ensureCheckpointCollection(db: Db): Promise<void> {
  const [existing] = await db
    .listCollections({ name: 'change_stream_checkpoints' })
    .toArray();

  if (!existing) {
    await db.createCollection('change_stream_checkpoints', {
      validator: CHECKPOINT_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.command({
      collMod: 'change_stream_checkpoints',
      validator: CHECKPOINT_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  await db.collection('change_stream_checkpoints').createIndex(
    { boardId: 1, collection: 1 },
    {
      unique: true,
      name: 'change_stream_checkpoints_board_collection',
    },
  );
}

async function enablePrePostImages(db: Db): Promise<void> {
  for (const name of ['items', 'tasks']) {
    await db.command({
      collMod: name,
      changeStreamPreAndPostImages: { enabled: true },
    });
  }
}

export const phase4Migration: Migration = {
  name: '004-phase-4',
  async up(options) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureCheckpointCollection(db);
    await enablePrePostImages(db);
  },
};
```

- [ ] **Step 5: Nối migration runner**

`apps/api/src/db/migration-runner.ts`:

```ts
import { phase4Migration } from './migrations/004-phase-4.js';

export const MIGRATION_004_NAME = '004-phase-4';
export const LATEST_MIGRATION_NAME = MIGRATION_004_NAME;

const migrations: Migration[] = [
  phase2aMigration,
  phase2bMigration,
  phase3aMigration,
  phase4Migration,
];
```

Server đã dùng `LATEST_MIGRATION_NAME`, không cần đổi.

- [ ] **Step 6: Reset test DB và chạy migration test**

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_phase2_test").dropDatabase()'
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/indexes.integration.test.ts
```

Expected: pass; 004 applied. Nếu sửa migration sau khi 004 đã ghi, drop test DB lại.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/web/package.json package-lock.json apps/api/src/db/migrations/004-phase-4.ts apps/api/src/db/migration-runner.ts apps/api/test/migrations.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add phase 4 checkpoint migration"
```

---

### Task 2: Contracts realtime, checkpoint và event mapper

**Files:**
- Create: `packages/contracts/src/realtime.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/realtime/checkpoint.service.ts`
- Create: `apps/api/src/realtime/event-mapper.ts`
- Create: `apps/api/test/checkpoint.integration.test.ts`
- Create: `apps/api/test/event-mapper.test.ts`

**Interfaces:**
- Produces:
  - `RealtimeEvent`, `RealtimeEventType`, `PresenceParticipant`
  - `SOCKET_EVENTS`
  - `loadResumeToken`, `saveResumeToken`, `eventIdFromToken`
  - `mapChangeToEvent(collection, change, boardId)`

- [ ] **Step 1: Viết test checkpoint/mapper thất bại**

`apps/api/test/checkpoint.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  eventIdFromToken,
  loadResumeToken,
  saveResumeToken,
} from '../src/realtime/checkpoint.service.js';
import { connectTestDb } from './helpers/test-db.js';

let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

describe('checkpoints', () => {
  it('lưu/đọc token theo board/collection và hash ổn định', async () => {
    const boardId = new Types.ObjectId();
    const token = { _data: 'token-1' };

    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toBeNull();
    await saveResumeToken(connection, boardId.toHexString(), 'items', token);
    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toEqual(token);
    expect(await loadResumeToken(connection, boardId.toHexString(), 'tasks')).toBeNull();

    await saveResumeToken(connection, boardId.toHexString(), 'items', { _data: 'token-2' });
    expect(await loadResumeToken(connection, boardId.toHexString(), 'items')).toEqual({
      _data: 'token-2',
    });
    expect(eventIdFromToken(token)).toBe(eventIdFromToken({ _data: 'token-1' }));
    expect(eventIdFromToken(token)).not.toBe(eventIdFromToken({ _data: 'token-2' }));
  });
});
```

`apps/api/test/event-mapper.test.ts`:

```ts
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { mapChangeToEvent } from '../src/realtime/event-mapper.js';

const boardId = new Types.ObjectId();

function taskDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    boardId,
    columnId: 'todo',
    order: 'a0',
    title: 'Task',
    description: 'test',
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
    ...overrides,
  };
}

function change(operationType: string, after: unknown, before?: unknown) {
  return {
    _id: { _data: `${operationType}-${Math.random()}` },
    operationType,
    clusterTime: { getHighBits: () => 1_800_000_000 },
    fullDocument: after,
    fullDocumentBeforeChange: before ?? null,
    documentKey: { _id: (after as { _id?: unknown })?._id ?? new Types.ObjectId() },
  } as never;
}

describe('event mapper', () => {
  it('map task insert/move/update', () => {
    const created = mapChangeToEvent('tasks', change('insert', taskDoc()), boardId.toHexString());
    expect(created).toMatchObject({ type: 'task:created', version: 1 });

    const moved = mapChangeToEvent(
      'tasks',
      change(
        'update',
        taskDoc({ columnId: 'done', version: 2 }),
        taskDoc({ version: 1 }),
      ),
      boardId.toHexString(),
    );
    expect(moved).toMatchObject({ type: 'task:moved', version: 2 });
  });

  it('map item promote/delete', () => {
    const item = {
      _id: new Types.ObjectId(),
      boardId,
      shapeId: 'shape:one',
      type: 'note',
      content: 'Note',
      style: {},
      props: {},
      position: { x: 1, y: 2 },
      size: { w: 10, h: 10 },
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
    const promoted = mapChangeToEvent(
      'items',
      change(
        'update',
        { ...item, promotedTaskId: new Types.ObjectId(), version: 2 },
        item,
      ),
      boardId.toHexString(),
    );
    expect(promoted).toMatchObject({ type: 'item:promoted' });

    const deleted = mapChangeToEvent(
      'items',
      change('delete', null, item),
      boardId.toHexString(),
    );
    expect(deleted).toMatchObject({
      type: 'item:deleted',
      payload: { itemId: item._id.toHexString() },
    });
  });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/checkpoint.integration.test.ts test/event-mapper.test.ts
```

Expected: FAIL vì module chưa có.

- [ ] **Step 3: Tạo contracts realtime**

`packages/contracts/src/realtime.ts`:

```ts
import { z } from 'zod';
import { isoDateSchema, objectIdSchema } from './common.js';

export const realtimeEventTypeSchema = z.enum([
  'item:created',
  'item:updated',
  'item:promoted',
  'item:demoted',
  'item:deleted',
  'task:created',
  'task:updated',
  'task:moved',
  'task:demoted',
  'board:resync',
]);

export const realtimeEventSchema = z.object({
  id: z.string().min(1),
  boardId: objectIdSchema,
  type: realtimeEventTypeSchema,
  version: z.number().int().nonnegative(),
  occurredAt: isoDateSchema,
  payload: z.unknown(),
});

export const presenceCursorSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const SOCKET_EVENTS = {
  boardJoin: 'board:join',
  boardLeave: 'board:leave',
  boardEvent: 'board:event',
  presenceList: 'presence:list',
  presenceCursor: 'presence:cursor',
} as const;

export interface PresenceParticipant {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
```

Thêm `export * from './realtime.js';` vào `index.ts`.

- [ ] **Step 4: Tạo checkpoint service**

`apps/api/src/realtime/checkpoint.service.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type { Document } from 'mongodb';

export type CheckpointCollection = 'items' | 'tasks';

export async function loadResumeToken(
  connection: Connection,
  boardId: string,
  collection: CheckpointCollection,
): Promise<Document | null> {
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const document = await db.collection('change_stream_checkpoints').findOne({
    boardId: new Types.ObjectId(boardId),
    collection,
  });
  return (document?.token as Document | undefined) ?? null;
}

export async function saveResumeToken(
  connection: Connection,
  boardId: string,
  collection: CheckpointCollection,
  token: Document,
): Promise<void> {
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  await db.collection('change_stream_checkpoints').updateOne(
    { boardId: new Types.ObjectId(boardId), collection },
    {
      $set: { token, updatedAt: new Date() },
      $setOnInsert: { boardId: new Types.ObjectId(boardId), collection },
    },
    { upsert: true },
  );
}

export function eventIdFromToken(token: Document): string {
  return createHash('sha256').update(JSON.stringify(token)).digest('hex');
}
```

- [ ] **Step 5: Tạo event mapper**

`apps/api/src/realtime/event-mapper.ts`:

```ts
import type { RealtimeEvent } from '@nextask/contracts';
import type { ChangeStreamDocument, Document } from 'mongodb';
import { serializeItem, serializeTask } from '../lib/serialize.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';
import { eventIdFromToken, type CheckpointCollection } from './checkpoint.service.js';

function occurredAt(value: unknown): string {
  const timestamp = value as { getHighBits?: () => number } | undefined;
  if (timestamp?.getHighBits) {
    return new Date(timestamp.getHighBits() * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function mapChangeToEvent(
  collection: CheckpointCollection,
  change: ChangeStreamDocument<Document>,
  boardId: string,
): RealtimeEvent | null {
  const before = change.fullDocumentBeforeChange as Document | null;
  const after = change.fullDocument as Document | null;
  const document = after ?? before;
  if (!document || String(document.boardId) !== boardId) return null;

  const base = {
    id: eventIdFromToken(change._id as Document),
    boardId,
    occurredAt: occurredAt(change.clusterTime),
    version: Number(after?.version ?? 0),
  };

  if (collection === 'tasks') {
    if (change.operationType === 'insert') {
      return { ...base, type: 'task:created', payload: { task: serializeTask(TaskModel.hydrate(after)) } };
    }
    if (change.operationType === 'delete') return null;
    if (before?.lifecycle === 'active' && after?.lifecycle === 'demoted') {
      return {
        ...base,
        type: 'task:demoted',
        payload: { taskId: String(after?._id), itemId: after?.sourceItemId ? String(after.sourceItemId) : null },
      };
    }
    if (before?.columnId !== after?.columnId) {
      return { ...base, type: 'task:moved', payload: { task: serializeTask(TaskModel.hydrate(after)) } };
    }
    return { ...base, type: 'task:updated', payload: { task: serializeTask(TaskModel.hydrate(after)) } };
  }

  if (change.operationType === 'insert') {
    return { ...base, type: 'item:created', payload: { item: serializeItem(ItemModel.hydrate(after)) } };
  }
  if (change.operationType === 'delete') {
    return { ...base, type: 'item:deleted', payload: { itemId: String(change.documentKey._id) } };
  }

  const beforeTaskId = before?.promotedTaskId ? String(before.promotedTaskId) : null;
  const afterTaskId = after?.promotedTaskId ? String(after.promotedTaskId) : null;
  if (!beforeTaskId && afterTaskId) {
    return {
      ...base,
      type: 'item:promoted',
      payload: { item: serializeItem(ItemModel.hydrate(after)), taskId: afterTaskId },
    };
  }
  if (beforeTaskId && !afterTaskId) {
    return {
      ...base,
      type: 'item:demoted',
      payload: { item: serializeItem(ItemModel.hydrate(after)), taskId: beforeTaskId },
    };
  }
  return { ...base, type: 'item:updated', payload: { item: serializeItem(ItemModel.hydrate(after)) } };
}
```

- [ ] **Step 6: Chạy test/typecheck**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/checkpoint.integration.test.ts test/event-mapper.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/realtime.ts packages/contracts/src/index.ts apps/api/src/realtime/checkpoint.service.ts apps/api/src/realtime/event-mapper.ts apps/api/test/checkpoint.integration.test.ts apps/api/test/event-mapper.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add realtime event mapping and checkpoints"
```

---

### Task 3: Board watcher Change Streams

**Files:**
- Create: `apps/api/src/realtime/board-watcher.ts`
- Create: `apps/api/test/board-watcher.integration.test.ts`

**Interfaces:**
- Consumes: `loadResumeToken`, `saveResumeToken`, `mapChangeToEvent`.
- Produces:
  - `BoardWatcher`
  - `createBoardWatcher(options): BoardWatcher`
  - `acquire(): Promise<void>`, `release(): void`, `close(): Promise<void>`

- [ ] **Step 1: Viết test watcher thất bại**

`apps/api/test/board-watcher.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nextask/contracts';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { createBoardWatcher } from '../src/realtime/board-watcher.js';
import { connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

function waitForEvent(events: RealtimeEvent[], predicate: (event: RealtimeEvent) => boolean) {
  return new Promise<RealtimeEvent>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const found = events.find(predicate);
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - started > 5_000) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for realtime event'));
      }
    }, 50);
  });
}

async function createTask(boardId: Types.ObjectId) {
  return TaskModel.create({
    boardId,
    columnId: 'todo',
    order: 'a0',
    title: `Task ${new Date().toISOString()}`,
    description: 'test',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: new Types.ObjectId(),
  });
}

describe('board watcher', () => {
  it('phát task event và resume sau khi watcher restart', async () => {
    const board = await BoardModel.create({
      name: 'Watcher',
      ownerId: new Types.ObjectId(),
      members: [{ userId: new Types.ObjectId(), role: 'owner', joinedAt: new Date() }],
      columns: [{ id: 'todo', name: 'To Do', order: 0, isDone: false }],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
    const boardId = board._id.toHexString();
    const events: RealtimeEvent[] = [];
    const resyncs: string[] = [];
    const first = createBoardWatcher({
      connection,
      boardId,
      logger,
      onEvent: (event) => events.push(event),
      onResync: (reason) => resyncs.push(reason),
    });

    await first.acquire();
    const task = await createTask(board._id);
    await waitForEvent(events, (event) => event.type === 'task:created');
    await first.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const second = createBoardWatcher({
      connection,
      boardId,
      logger,
      onEvent: (event) => events.push(event),
      onResync: (reason) => resyncs.push(reason),
    });
    await second.acquire();
    await TaskModel.updateOne({ _id: task._id }, { $set: { columnId: 'done' }, $inc: { version: 1 } });
    await waitForEvent(events, (event) => event.type === 'task:moved');
    expect(resyncs).toEqual([]);
    await second.close();
  });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/board-watcher.integration.test.ts
```

Expected: FAIL module chưa có.

- [ ] **Step 3: Tạo board watcher**

`apps/api/src/realtime/board-watcher.ts`:

```ts
import type { RealtimeEvent } from '@nextask/contracts';
import type { ChangeStream, ChangeStreamDocument, Document } from 'mongodb';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type { Logger } from '../lib/logger.js';
import {
  loadResumeToken,
  saveResumeToken,
  type CheckpointCollection,
} from './checkpoint.service.js';
import { mapChangeToEvent } from './event-mapper.js';

export interface BoardWatcherOptions {
  connection: Connection;
  boardId: string;
  logger: Logger;
  onEvent: (event: RealtimeEvent) => void;
  onResync: (reason: 'oplog_lost' | 'watcher_error') => void;
  graceMs?: number;
}

function isHistoryLost(error: unknown): boolean {
  return (error as { code?: number }).code === 286;
}

export class BoardWatcher {
  private readonly options: BoardWatcherOptions;
  private readonly streams = new Map<CheckpointCollection, ChangeStream<Document>>();
  private refs = 0;
  private started = false;
  private starting: Promise<void> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private retried = new Set<CheckpointCollection>();

  constructor(options: BoardWatcherOptions) {
    this.options = { graceMs: 5_000, ...options };
  }

  async acquire(): Promise<void> {
    this.refs += 1;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (!this.started && !this.starting) {
      this.starting = this.openAll().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }

  release(): void {
    this.refs = Math.max(0, this.refs - 1);
    if (this.refs > 0) return;
    this.closeTimer = setTimeout(() => {
      void this.close();
    }, this.options.graceMs);
  }

  async close(): Promise<void> {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.refs = 0;
    this.started = false;
    await Promise.all(
      [...this.streams.keys()].map((collection) => this.closeStream(collection)),
    );
  }

  private async openAll(): Promise<void> {
    this.started = true;
    await Promise.all(
      (['items', 'tasks'] as const).map((collection) => this.startStream(collection)),
    );
  }

  private pipeline() {
    const boardId = new Types.ObjectId(this.options.boardId);
    return [
      {
        $match: {
          operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
          $or: [
            { 'fullDocument.boardId': boardId },
            { 'fullDocumentBeforeChange.boardId': boardId },
          ],
        },
      },
      {
        $project: {
          operationType: 1,
          fullDocument: 1,
          fullDocumentBeforeChange: 1,
          documentKey: 1,
          clusterTime: 1,
        },
      },
    ];
  }

  private async startStream(
    collection: CheckpointCollection,
    useCheckpoint = true,
  ): Promise<void> {
    const db = this.options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    const resumeToken = useCheckpoint
      ? await loadResumeToken(this.options.connection, this.options.boardId, collection)
      : null;
    const stream = db.collection(collection).watch<Document>(this.pipeline(), {
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable',
      ...(resumeToken ? { resumeAfter: resumeToken } : {}),
    });

    stream.on('change', (change) => {
      void this.handleChange(collection, change);
    });
    stream.on('error', (error) => {
      void this.handleError(collection, error);
    });
    this.streams.set(collection, stream);
  }

  private async handleChange(
    collection: CheckpointCollection,
    change: ChangeStreamDocument<Document>,
  ): Promise<void> {
    const event = mapChangeToEvent(collection, change, this.options.boardId);
    if (!event) return;

    try {
      this.options.onEvent(event);
      await saveResumeToken(
        this.options.connection,
        this.options.boardId,
        collection,
        change._id as Document,
      );
    } catch (error) {
      this.options.logger.error({ err: error, collection }, 'Realtime event handling failed');
    }
  }

  private async handleError(
    collection: CheckpointCollection,
    error: unknown,
  ): Promise<void> {
    this.options.logger.error({ err: error, collection }, 'Change stream error');
    await this.closeStream(collection);

    if (isHistoryLost(error)) {
      this.options.onResync('oplog_lost');
      await this.startStream(collection, false);
      return;
    }

    if (!this.retried.has(collection)) {
      this.retried.add(collection);
      await this.startStream(collection);
      return;
    }

    this.options.onResync('watcher_error');
  }

  private async closeStream(collection: CheckpointCollection): Promise<void> {
    const stream = this.streams.get(collection);
    if (!stream) return;
    this.streams.delete(collection);
    stream.removeAllListeners();
    await stream.close();
  }
}

export function createBoardWatcher(options: BoardWatcherOptions): BoardWatcher {
  return new BoardWatcher(options);
}
```

- [ ] **Step 4: Chạy test watcher**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/board-watcher.integration.test.ts
```

Expected: pass; checkpoint resume test nhận `task:moved` sau restart.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime/board-watcher.ts apps/api/test/board-watcher.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add per-board change stream watcher"
```

---

### Task 4: Socket.IO auth, rooms và presence

**Files:**
- Create: `apps/api/src/realtime/presence.service.ts`
- Create: `apps/api/src/realtime/socket-auth.ts`
- Create: `apps/api/src/realtime/realtime.server.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/test/realtime.integration.test.ts`

**Interfaces:**
- Consumes: `BoardWatcher`, `createBoardWatcher`, `SOCKET_EVENTS`, `PresenceParticipant`.
- Produces:
  - `createRealtimeServer(httpServer, dependencies): Server`
  - `PresenceService`
  - `authenticateSocket(socket, jwtSecret)`

- [ ] **Step 1: Viết test socket thất bại**

`apps/api/test/realtime.integration.test.ts`:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import pino from 'pino';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signSessionToken } from '../src/modules/auth/jwt.js';
import { createRealtimeServer } from '../src/realtime/realtime.server.js';
import { registerAgent } from './helpers/auth.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
const jwtSecret = 'local-test-jwt-secret-at-least-32-bytes-long';
let connection: Awaited<ReturnType<typeof connectTestDb>>;
let app: ReturnType<typeof createApp>;
let server: ReturnType<typeof createServer>;
let realtime: ReturnType<typeof createRealtimeServer>;
let baseUrl: string;

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
  server = createServer(app);
  realtime = createRealtimeServer(server, {
    connection,
    jwtSecret,
    corsOrigin: 'http://localhost:3000',
    logger,
    graceMs: 50,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await realtime.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await connection.close();
});

async function connectSocket(userId: string): Promise<Socket> {
  const token = await signSessionToken(userId, { secret: jwtSecret });
  const socket = createClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: `nextask_session=${token}` },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function join(socket: Socket, boardId: string) {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    socket.emit('board:join', { boardId }, resolve);
  });
}

function waitEvent(socket: Socket, type: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for event')), 5_000);
    const handler = (event: { type: string }) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off('board:event', handler);
      resolve(event);
    };
    socket.on('board:event', handler);
  });
}

describe('realtime socket', () => {
  it('auth, join, task event và presence', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Realtime' });
    const boardId = board.body.data._id as string;
    const socketA = await connectSocket(owner.user._id);
    const socketB = await connectSocket(owner.user._id);

    expect(await join(socketA, boardId)).toEqual({ ok: true });
    expect(await join(socketB, boardId)).toEqual({ ok: true });
    const eventPromise = waitEvent(socketA, 'task:created');
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks`)
      .send({ columnId: 'todo', title: 'Realtime task' })
      .expect(201);
    expect(await eventPromise).toMatchObject({ type: 'task:created' });

    socketA.emit('presence:cursor', { x: 0.5, y: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    socketB.disconnect();
    socketA.disconnect();
  });

  it('không cookie bị từ chối, non-member không join được', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Private' });
    const boardId = board.body.data._id as string;
    const socket = await connectSocket(stranger.user._id);

    expect(await join(socket, boardId)).toEqual({ ok: false, error: 'NOT_FOUND' });
    socket.disconnect();

    const unauthenticated = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      unauthenticated.once('connect', () => reject(new Error('Socket connected without auth')));
      unauthenticated.once('connect_error', () => resolve());
    });
    unauthenticated.close();
  });
});
```

- [ ] **Step 2: Chạy test thất bại**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/realtime.integration.test.ts
```

Expected: FAIL module chưa có.

- [ ] **Step 3: Tạo presence service**

`apps/api/src/realtime/presence.service.ts`:

```ts
import type { PresenceParticipant } from '@nextask/contracts';
import type { UserDocument } from '../modules/users/user.model.js';

const COLORS = ['#e11d48', '#0284c7', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const presence = new Map<string, Map<string, PresenceParticipant>>();

function boardMap(boardId: string): Map<string, PresenceParticipant> {
  let map = presence.get(boardId);
  if (!map) {
    map = new Map();
    presence.set(boardId, map);
  }
  return map;
}

export function addParticipant(
  boardId: string,
  socketId: string,
  user: UserDocument,
): PresenceParticipant {
  const color = COLORS[Number.parseInt(user._id.toHexString().slice(-2), 16) % COLORS.length]!;
  const participant: PresenceParticipant = {
    socketId,
    userId: user._id.toHexString(),
    name: user.name,
    color,
    cursor: null,
  };
  boardMap(boardId).set(socketId, participant);
  return participant;
}

export function removeParticipant(boardId: string, socketId: string): void {
  const map = presence.get(boardId);
  if (!map) return;
  map.delete(socketId);
  if (map.size === 0) presence.delete(boardId);
}

export function listParticipants(boardId: string): PresenceParticipant[] {
  return [...(presence.get(boardId)?.values() ?? [])];
}

export function updateCursor(
  boardId: string,
  socketId: string,
  cursor: { x: number; y: number },
): PresenceParticipant | null {
  const participant = presence.get(boardId)?.get(socketId);
  if (!participant) return null;
  participant.cursor = cursor;
  return participant;
}
```

- [ ] **Step 4: Tạo socket auth**

`apps/api/src/realtime/socket-auth.ts`:

```ts
import type { Socket } from 'socket.io';
import { Types } from 'mongoose';
import { SESSION_COOKIE_NAME } from '../modules/auth/cookies.js';
import { verifySessionToken } from '../modules/auth/jwt.js';
import { UserModel, type UserDocument } from '../modules/users/user.model.js';

export interface BoardSocketData {
  user: UserDocument;
  boardId?: string;
  lastCursorAt?: number;
}

function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export async function authenticateSocket(
  socket: Socket,
  jwtSecret: string,
): Promise<UserDocument> {
  const token = readSessionCookie(socket.handshake.headers.cookie);
  if (!token) throw new Error('UNAUTHENTICATED');
  const userId = await verifySessionToken(token, jwtSecret);
  if (!Types.ObjectId.isValid(userId)) throw new Error('UNAUTHENTICATED');
  const user = await UserModel.findById(userId).exec();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
```

- [ ] **Step 5: Tạo realtime server**

`apps/api/src/realtime/realtime.server.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { HttpServer } from 'node:http';
import type { RealtimeEvent } from '@nextask/contracts';
import { presenceCursorSchema, SOCKET_EVENTS } from '@nextask/contracts';
import type { Connection } from 'mongoose';
import { Server, type Socket } from 'socket.io';
import type { Logger } from '../lib/logger.js';
import { findByMember } from '../modules/boards/board.service.js';
import { createBoardWatcher, type BoardWatcher } from './board-watcher.js';
import {
  addParticipant,
  listParticipants,
  removeParticipant,
  updateCursor,
} from './presence.service.js';
import { authenticateSocket, type BoardSocketData } from './socket-auth.js';

export interface RealtimeDependencies {
  connection: Connection;
  jwtSecret: string;
  corsOrigin: string;
  logger: Logger;
  graceMs?: number;
}

export interface RealtimeServer {
  io: Server;
  close(): Promise<void>;
}

export function createRealtimeServer(
  httpServer: HttpServer,
  deps: RealtimeDependencies,
): RealtimeServer {
  const io = new Server(httpServer, {
    cors: { origin: deps.corsOrigin, credentials: true },
  });
  const watchers = new Map<string, BoardWatcher>();
  const room = (boardId: string) => `board:${boardId}`;

  io.use(async (socket, next) => {
    try {
      socket.data.user = await authenticateSocket(socket, deps.jwtSecret);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  function watcherFor(boardId: string): BoardWatcher {
    let watcher = watchers.get(boardId);
    if (!watcher) {
      watcher = createBoardWatcher({
        connection: deps.connection,
        boardId,
        logger: deps.logger,
        graceMs: deps.graceMs,
        onEvent: (event) => io.to(room(boardId)).emit(SOCKET_EVENTS.boardEvent, event),
        onResync: (reason) => {
          const event: RealtimeEvent = {
            id: randomUUID(),
            boardId,
            type: 'board:resync',
            version: 0,
            occurredAt: new Date().toISOString(),
            payload: { reason },
          };
          io.to(room(boardId)).emit(SOCKET_EVENTS.boardEvent, event);
        },
      });
      watchers.set(boardId, watcher);
    }
    return watcher;
  }

  async function leaveBoard(socket: Socket<never, never, never, BoardSocketData>): Promise<void> {
    const boardId = socket.data.boardId;
    if (!boardId) return;
    socket.leave(room(boardId));
    removeParticipant(boardId, socket.id);
    const watcher = watchers.get(boardId);
    watcher?.release();
    socket.data.boardId = undefined;
    io.to(room(boardId)).emit(SOCKET_EVENTS.presenceList, listParticipants(boardId));
  }

  io.on('connection', (socket: Socket<never, never, never, BoardSocketData>) => {
    socket.on(
      SOCKET_EVENTS.boardJoin,
      async (
        payload: { boardId?: string },
        ack?: (result: { ok: true } | { ok: false; error: string }) => void,
      ) => {
        const user = socket.data.user;
        const boardId = payload?.boardId;
        if (!user || !boardId) {
          ack?.({ ok: false, error: 'NOT_FOUND' });
          return;
        }
        const access = await findByMember(boardId, user._id);
        if (!access) {
          ack?.({ ok: false, error: 'NOT_FOUND' });
          return;
        }
        await leaveBoard(socket);
        socket.data.boardId = boardId;
        await socket.join(room(boardId));
        await watcherFor(boardId).acquire();
        addParticipant(boardId, socket.id, user);
        io.to(room(boardId)).emit(SOCKET_EVENTS.presenceList, listParticipants(boardId));
        ack?.({ ok: true });
      },
    );

    socket.on(SOCKET_EVENTS.boardLeave, () => {
      void leaveBoard(socket);
    });

    socket.on(SOCKET_EVENTS.presenceCursor, (payload: unknown) => {
      const boardId = socket.data.boardId;
      if (!boardId) return;
      const parsed = presenceCursorSchema.safeParse(payload);
      if (!parsed.success) return;
      const now = Date.now();
      if (socket.data.lastCursorAt && now - socket.data.lastCursorAt < 33) return;
      socket.data.lastCursorAt = now;
      const participant = updateCursor(boardId, socket.id, parsed.data);
      if (participant) {
        io.to(room(boardId)).emit(SOCKET_EVENTS.presenceCursor, {
          socketId: socket.id,
          userId: participant.userId,
          ...parsed.data,
        });
      }
    });

    socket.on('disconnect', () => {
      void leaveBoard(socket);
    });
  });

  return {
    io,
    async close() {
      await Promise.all([...watchers.values()].map((watcher) => watcher.close()));
      watchers.clear();
      await io.close();
    },
  };
}
```

`server.ts` đổi:

```ts
const server = createServer(app);
const realtime = createRealtimeServer(server, {
  connection,
  jwtSecret: env.JWT_SECRET,
  corsOrigin: env.CORS_ORIGIN,
  logger,
});
```

Trong shutdown đóng realtime trước khi đóng HTTP:

```ts
void realtime.close().finally(() => {
  server.close(() => {
    void connection.close().finally(() => process.exit(0));
  });
});
```

- [ ] **Step 6: Chạy test socket/full suite**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/realtime.integration.test.ts
npm run test
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/realtime/presence.service.ts apps/api/src/realtime/socket-auth.ts apps/api/src/realtime/realtime.server.ts apps/api/src/server.ts apps/api/test/realtime.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add realtime socket server and presence"
```

---

### Task 5: Web realtime client, presence và whiteboard refetch

**Files:**
- Create: `apps/web/lib/realtime.ts`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/features/whiteboard/whiteboard.tsx`
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`

**Interfaces:**
- Consumes: `RealtimeEvent`, `PresenceParticipant`, `SOCKET_EVENTS`.
- Produces:
  - `createBoardSocket(): Socket`
  - Kanban/badge live update; presence UI; item event refetch/remount.

- [ ] **Step 1: Tạo socket client**

`apps/web/lib/realtime.ts`:

```ts
import { io, type Socket } from 'socket.io-client';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function createBoardSocket(): Socket {
  return io(new URL(apiBase).origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
}
```

- [ ] **Step 2: Cập nhật BoardWorkspace**

Thêm import:

```ts
import type { PresenceParticipant, RealtimeEvent } from '@nextask/contracts';
import { SOCKET_EVENTS } from '@nextask/contracts';
import type { Socket } from 'socket.io-client';
import { createBoardSocket } from '../../lib/realtime';
```

State/refs:

```ts
const [participants, setParticipants] = useState<PresenceParticipant[]>([]);
const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'online' | 'offline'>(
  'connecting',
);
const [whiteboardRevision, setWhiteboardRevision] = useState(0);
const socketRef = useRef<Socket | null>(null);
const seenEventIdsRef = useRef(new Set<string>());
const hasJoinedRef = useRef(false);
```

Thêm hàm:

```ts
const refreshRealtimeSnapshot = useCallback(async () => {
  const [items, taskPage] = await Promise.all([getItems(boardId), getTasks(boardId)]);
  setData((current) => (current ? { ...current, items, tasks: taskPage.tasks } : current));
  setWhiteboardRevision((value) => value + 1);
}, [boardId]);

const handleRealtimeEvent = useCallback(
  (event: RealtimeEvent) => {
    if (seenEventIdsRef.current.has(event.id)) return;
    seenEventIdsRef.current.add(event.id);
    if (seenEventIdsRef.current.size > 500) {
      const oldest = seenEventIdsRef.current.values().next().value;
      if (oldest) seenEventIdsRef.current.delete(oldest);
    }

    if (event.type === 'board:resync') {
      setNotice('Board cần đồng bộ lại sau realtime. Đang tải dữ liệu.');
      void loadWorkspace();
      return;
    }

    if (event.type.startsWith('item:')) {
      setNotice('Whiteboard vừa thay đổi từ tab/người khác. Đã tải lại.');
      void refreshRealtimeSnapshot();
      return;
    }

    if (event.type === 'task:demoted') {
      const payload = event.payload as { taskId?: string };
      setData((current) =>
        current
          ? { ...current, tasks: current.tasks.filter((task) => task._id !== payload.taskId) }
          : current,
      );
      return;
    }

    const payload = event.payload as { task?: TaskDto };
    const incoming = payload.task;
    if (!incoming) return;
    setData((current) => {
      if (!current) return current;
      const existing = current.tasks.find((task) => task._id === incoming._id);
      if (existing && existing.version > incoming.version) return current;
      return {
        ...current,
        tasks: existing
          ? current.tasks.map((task) => (task._id === incoming._id ? incoming : task))
          : [...current.tasks, incoming],
      };
    });
  },
  [loadWorkspace, refreshRealtimeSnapshot],
);
```

Socket effect:

```ts
useEffect(() => {
  const socket = createBoardSocket();
  socketRef.current = socket;

  socket.on('connect', () => {
    setRealtimeStatus('online');
    socket.emit(
      SOCKET_EVENTS.boardJoin,
      { boardId },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) {
          setRealtimeStatus('offline');
          return;
        }
        if (hasJoinedRef.current) void loadWorkspace();
        hasJoinedRef.current = true;
      },
    );
  });
  socket.on('disconnect', () => setRealtimeStatus('offline'));
  socket.on('connect_error', () => setRealtimeStatus('offline'));
  socket.on(SOCKET_EVENTS.boardEvent, handleRealtimeEvent);
  socket.on(SOCKET_EVENTS.presenceList, (list: PresenceParticipant[]) => setParticipants(list));
  socket.on(
    SOCKET_EVENTS.presenceCursor,
    (payload: { socketId: string; x: number; y: number }) => {
      setParticipants((current) =>
        current.map((entry) =>
          entry.socketId === payload.socketId
            ? { ...entry, cursor: { x: payload.x, y: payload.y } }
            : entry,
        ),
      );
    },
  );

  return () => {
    socket.disconnect();
    socketRef.current = null;
  };
}, [boardId, handleRealtimeEvent, loadWorkspace]);
```

- Header participant list:

```tsx
<div className="flex items-center gap-1">
  <span
    className={`size-2 rounded-full ${
      realtimeStatus === 'online' ? 'bg-emerald-500' : 'bg-stone-300'
    }`}
    title={realtimeStatus}
  />
  {participants.map((participant) => (
    <span
      key={participant.socketId}
      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: participant.color }}
    >
      {participant.name}
    </span>
  ))}
</div>
```

- Whiteboard:

```tsx
<Whiteboard
  key={`whiteboard-${whiteboardRevision}`}
  board={data.board}
  initialItems={data.items}
  items={data.items}
  tasks={data.tasks}
  presence={participants}
  onCursorMove={(point) => socketRef.current?.emit(SOCKET_EVENTS.presenceCursor, point)}
  onItemsChange={handleItemsChange}
  onPromoteRequest={setPromoteTarget}
/>
```

- [ ] **Step 3: Whiteboard props và cursor overlay**

`whiteboard.tsx` thêm `PresenceParticipant`:

```ts
import type { BoardDto, ItemDto, PresenceParticipant, TaskDto } from '@nextask/contracts';

export interface WhiteboardProps {
  // ...
  presence?: PresenceParticipant[];
  onCursorMove?: (point: { x: number; y: number }) => void;
}
```

`whiteboard-canvas.tsx`:
- Destructure presence/onCursorMove.
- Thêm `containerRef` và throttle:

```ts
const containerRef = useRef<HTMLDivElement | null>(null);
const lastCursorAtRef = useRef(0);

function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
  if (!onCursorMove) return;
  const now = performance.now();
  if (now - lastCursorAtRef.current < 50) return;
  lastCursorAtRef.current = now;
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;
  onCursorMove({
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  });
}
```

- Wrapper `div ref={containerRef} onPointerMove={handlePointerMove}`.
- Render cursors:

```tsx
{presence?.filter((entry) => entry.cursor).map((entry) => (
  <div
    key={entry.socketId}
    className="pointer-events-none absolute z-40 -translate-x-1 -translate-y-1"
    style={{ left: `${entry.cursor!.x * 100}%`, top: `${entry.cursor!.y * 100}%` }}
  >
    <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
    <span
      className="ml-1 rounded px-1 text-[10px] text-white"
      style={{ backgroundColor: entry.color }}
    >
      {entry.name}
    </span>
  </div>
))}
```

- [ ] **Step 4: Typecheck/build**

```bash
npm run typecheck
npm run build:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/realtime.ts apps/web/features/workspace/board-workspace.tsx apps/web/features/whiteboard/whiteboard.tsx apps/web/features/whiteboard/whiteboard-canvas.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add realtime web client and presence"
```

---

### Task 6: Migration rehearsal và browser verification

**Files:**
- Modify: `docs/session-log.md`
- Modify: `docs/phases/04-realtime.md`

**Interfaces:**
- Consumes: migration 004, realtime server/client.
- Produces: app DB migrated, browser evidence.

- [ ] **Step 1: Backup app DB**

```bash
docker compose exec -T mongo mongodump --db nextask --archive --gzip > backups/nextask-before-4-2026-11-10.gz
gzip -t backups/nextask-before-4-2026-11-10.gz
ls -lh backups/nextask-before-4-2026-11-10.gz
```

- [ ] **Step 2: Rehearsal 004**

```bash
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_4_rehearsal.*' < backups/nextask-before-4-2026-11-10.gz
docker compose build migrate
docker compose run --rm -e MONGODB_URI='mongodb://mongo:27017/nextask_4_rehearsal?replicaSet=rs0' migrate
```

Expected: `applied: ["004-phase-4"]`.

- [ ] **Step 3: Verify rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_4_rehearsal");
printjson({
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
  checkpoint: db.getCollectionInfos({name:"change_stream_checkpoints"})[0],
  items: db.getCollectionInfos({name:"items"})[0].options.changeStreamPreAndPostImages,
  tasks: db.getCollectionInfos({name:"tasks"})[0].options.changeStreamPreAndPostImages,
  counts: { boards: db.boards.countDocuments(), items: db.items.countDocuments(), tasks: db.tasks.countDocuments() },
});
'
```

Expected: checkpoint validator/index; pre/post images enabled; counts không đổi.

- [ ] **Step 4: Apply app DB và rebuild**

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_4_rehearsal").dropDatabase()'
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: 004 applied; api/web/mongo healthy; health `0.3.0` (chưa bump v0.4).

- [ ] **Step 5: Browser realtime task/badge**

Dùng browser-use:

1. Đăng nhập owner, mở board thật.
2. Trong tab hiện tại, dùng `fetch` (client thứ hai cùng cookie) `POST /tasks` rồi `PATCH /tasks/:id` move sang cột khác; không reload tab.
3. Expected: Kanban tự thêm/di chuyển task; badge note tự đổi cột; không cần reload.
4. Mở dialog sửa task từ event? không bắt buộc.

- [ ] **Step 6: Browser item refetch và presence**

1. Trong tab, dùng fetch `PUT /items` cập nhật note với version hiện tại (client thứ hai).
2. Expected: tab refetch/remount whiteboard, notice; note mới hiển thị; không lỗi 500.
3. Kiểm tra participant list có owner; cursor gửi từ pointer trong whiteboard (nếu browser-use hỗ trợ pointer; nếu không, dùng socket integration test làm evidence).
4. Resync: xóa checkpoint hoặc gửi token hỏng qua test; browser không bắt buộc.

- [ ] **Step 7: Ghi evidence**

Thêm vào `docs/session-log.md`:

```markdown
## 2026-11-10 - Phase 4 verification

- Migration 004 áp rehearsal/app; checkpoint collection/index; pre/post images bật.
- Browser: task create/move từ client thứ hai cập nhật Kanban/badge không reload.
- Browser: item update kích hoạt refetch whiteboard; presence list hiển thị.
- Checkpoint/restart/socket integration tests pass.
```

Cập nhật kết quả ngắn trong `docs/phases/04-realtime.md`.

- [ ] **Step 8: Commit**

```bash
git add docs/session-log.md docs/phases/04-realtime.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 4 verification"
```

---

### Task 7: Gates, docs và merge release/v0.4

**Files:**
- Modify: `docs/phases/04-realtime.md`
- Modify: `docs/superpowers/plans/2026-11-10-phase-4-realtime.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: code/migration/browser evidence.
- Produces: 4 trên `release/v0.4`; feature xóa; main/tag không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: hoàn thành, kết quả migration/test/browser, commit merge.
- Plan: trạng thái thực thi, commit list, điều chỉnh.
- Architecture: Phase 4 complete; realtime modules/checkpoint.
- MongoDB notes: change streams, pre/post images, checkpoint/resume.
- README: realtime, presence, Socket.IO, migration 004.
- Git workflow: release/v0.4, feature merge/deleted, main/tag.
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
git add docs/phases/04-realtime.md docs/superpowers/plans/2026-11-10-phase-4-realtime.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 4 verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.4
git merge --no-ff feat/phase-4-realtime -m "merge: phase 4 realtime"
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
git branch -d feat/phase-4-realtime
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: main `52840fe`; tag `v0.2.0`, `v0.3.0`; release chứa 4.

- [ ] **Step 7: Không merge main**

Không chạy merge `release/v0.4` vào `main`. Ghi trạng thái chờ duyệt v0.4.

---

## Self-review checklist

- Spec coverage:
  - Migration 004/checkpoint/pre-post: Task 1.
  - Event contracts/checkpoint/mapper: Task 2.
  - Change Stream watcher/resume: Task 3.
  - Socket auth/rooms/presence: Task 4.
  - Web realtime/presence/whiteboard refetch: Task 5.
  - Rehearsal/browser: Task 6.
  - Gates/merge: Task 7.
- Không live-merge tldraw/CRDT; item event chỉ refetch/remount.
- Không đổi REST mutation API; checkpoint internal.
- Type/field thống nhất: `RealtimeEvent`, `SOCKET_EVENTS`, `PresenceParticipant`,
  `loadResumeToken`, `saveResumeToken`, `createBoardWatcher`, `createRealtimeServer`.
- Không task nào merge `main`; tag `v0.3.0` giữ nguyên.
