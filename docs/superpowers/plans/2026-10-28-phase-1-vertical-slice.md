# NexTask Giai đoạn 1 - Kế hoạch triển khai slice dọc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Hoàn thành luồng tạo board, đặt note tldraw, Promote transaction, task xuất hiện trên Kanban, kéo sang Done và badge cập nhật sau reload.

**Architecture:** API Express thêm ba model `boards`, `items`, `tasks`; Promote dùng `session.withTransaction` và unique partial index. Web Next.js dùng tldraw 5.5.2 cho note, fetch API bằng REST; Kanban và badge dùng chung state task. Chưa có auth, demo owner cố định.

**Tech Stack:** Mongo 8.0 replica set, Mongoose 9.11.4, Express 5.3.0, zod 4.6.7, fractional-indexing 4.0.0, Next.js 16.4.3, React 19.3.1, tldraw 5.5.2, Tailwind 4.3.3, Vitest 5.0.5.

**Spec:** `docs/architecture.md` và `docs/phases/01-vertical-slice.md`

## Global Constraints

- Giữ nguyên stack và cấu trúc monorepo hiện có.
- Mongo replica set `rs0` đang chạy; integration test dùng MongoDB thật.
- Không thêm auth, member, role, `$jsonSchema`, realtime, demote, batch, voting hoặc report.
- Phase 1 chỉ hỗ trợ tldraw shape `note`.
- API dùng envelope `{ data, meta: { requestId } }`.
- Mọi board access phải kiểm tra owner ở server.
- Không dựa vào Mongoose `autoIndex`; gọi `ensureIndexes()` tường minh.
- TypeScript strict, không dùng `any` tùy tiện.
- Không nới timeout test để làm test xanh.
- Git local, không remote, không push, không amend, không đổi git config.
- Commit với identity theo lệnh:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage bằng đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Mỗi kết luận trạng thái phải có lệnh chạy thật.

---

### Task 0: Ghi tài liệu Phase 1 và commit baseline

**Files:**
- Create: `docs/phases/01-vertical-slice.md`
- Create: `docs/superpowers/plans/2026-10-28-phase-1-vertical-slice.md`

**Interfaces:**
- Consumes: Phase 0 đã duyệt, Git sạch.
- Produces: phạm vi, quyết định và kế hoạch Phase 1.

- [ ] **Step 1: Kiểm tra baseline**

```bash
git status --short --branch
docker compose ps
```

Expected: working tree sạch; ba service healthy.

- [ ] **Step 2: Commit tài liệu**

```bash
git add docs/phases/01-vertical-slice.md docs/superpowers/plans/2026-10-28-phase-1-vertical-slice.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 1 vertical promote slice"
```

---

### Task 1: Contracts, model, index, demo owner và error handling

**Files:**
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/board.ts`
- Create: `packages/contracts/src/item.ts`
- Create: `packages/contracts/src/task.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/lib/serialize.ts`
- Create: `apps/api/src/db/indexes.ts`
- Create: `apps/api/src/middleware/demo-owner.ts`
- Modify: `apps/api/src/middleware/error-handler.ts`
- Modify: `apps/api/src/types/express.d.ts`
- Create: `apps/api/src/modules/boards/board.model.ts`
- Create: `apps/api/src/modules/items/item.model.ts`
- Create: `apps/api/src/modules/tasks/task.model.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/health.integration.test.ts`
- Create: `apps/api/test/helpers/test-db.ts`
- Create: `apps/api/test/indexes.integration.test.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:
  - Types and schemas from `@nextask/contracts`: `BoardDto`, `ItemDto`, `TaskDto`, request schemas và response schemas.
  - `AppError(status, code, message, details?)`.
  - `ensureIndexes(): Promise<void>`.
  - `serializeBoard`, `serializeItem`, `serializeTask`.
  - `BoardModel`, `ItemModel`, `TaskModel`.
  - `request.ownerId: ObjectId`.
  - Env `DEMO_OWNER_ID`.

- [ ] **Step 1: Cài dependency**

```bash
npm install fractional-indexing@4.0.0 --workspace @nextask/api
npm install tldraw@5.5.2 --workspace @nextask/web
```

- [ ] **Step 2: Viết test index thất bại**

`apps/api/test/helpers/test-db.ts`:

```ts
import mongoose, { type Connection } from 'mongoose';
import pino from 'pino';
import { connectMongo } from '../../src/db/mongoose.js';
import { ensureIndexes } from '../../src/db/indexes.js';

export const testUri =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase1_test?directConnection=true';

export const testLogger = pino({ level: 'silent' });

export async function connectTestDb(): Promise<Connection> {
  const connection = await connectMongo({ uri: testUri, logger: testLogger });
  await ensureIndexes();
  return connection;
}

export async function cleanDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Test DB chưa kết nối');
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(
    collections
      .filter((collection) => !collection.name.startsWith('system.'))
      .map((collection) => db.collection(collection.name).deleteMany({})),
  );
}
```

`apps/api/test/indexes.integration.test.ts`:

```ts
import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { connectTestDb } from './helpers/test-db.js';

let connection: Connection;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

describe('indexes', () => {
  it('có unique partial index cho sourceItemId active', async () => {
    const indexes = await TaskModel.collection.indexes();
    const index = indexes.find((entry) => entry.name === 'uniq_active_task_per_item');
    expect(index).toBeDefined();
    expect(index?.unique).toBe(true);
    expect(index?.partialFilterExpression).toEqual({
      sourceItemId: { $type: 'objectId' },
      lifecycle: 'active',
    });
  });
});
```

- [ ] **Step 3: Chạy test đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì `db/indexes.js` và model chưa tồn tại.

- [ ] **Step 4: Tạo common/board/item/task contracts**

`packages/contracts/src/common.ts`:

```ts
import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'ObjectId không hợp lệ');
export const isoDateSchema = z.string().datetime();
export const unknownRecordSchema = z.record(z.string(), z.unknown());
```

`packages/contracts/src/board.ts`:

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';
import { isoDateSchema, objectIdSchema } from './common.js';

export const boardColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number(),
  isDone: z.boolean(),
});

export const boardSettingsSchema = z.object({
  votingLimit: z.number().int().nonnegative(),
  minVotes: z.number().int().nonnegative(),
  stalledAfterDays: z.number().int().positive(),
});

export const boardSchema = z.object({
  _id: objectIdSchema,
  name: z.string().min(1),
  ownerId: objectIdSchema,
  columns: z.array(boardColumnSchema),
  settings: boardSettingsSchema,
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createBoardRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const boardResponseSchema = z.object({
  data: boardSchema,
  meta: envelopeMetaSchema,
});

export const boardsResponseSchema = z.object({
  data: z.array(boardSchema),
  meta: envelopeMetaSchema,
});

export type BoardDto = z.infer<typeof boardSchema>;
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;
```

`packages/contracts/src/item.ts`:

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';
import { isoDateSchema, objectIdSchema, unknownRecordSchema } from './common.js';

const pointSchema = z.object({ x: z.number(), y: z.number() });
const sizeSchema = z.object({ w: z.number().nonnegative(), h: z.number().nonnegative() });

export const itemSchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  shapeId: z.string().min(1),
  type: z.literal('note'),
  content: z.string(),
  style: unknownRecordSchema,
  props: unknownRecordSchema,
  position: pointSchema,
  size: sizeSchema,
  rotation: z.number(),
  tldrawIndex: z.string().min(1),
  parentFrameId: objectIdSchema.nullable(),
  authorId: objectIdSchema,
  votes: z.array(
    z.object({
      userId: objectIdSchema,
      createdAt: isoDateSchema,
    }),
  ),
  promotedTaskId: objectIdSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const syncItemInputSchema = z.object({
  shapeId: z.string().min(1).max(200),
  type: z.literal('note'),
  content: z.string().max(10_000),
  style: unknownRecordSchema,
  props: unknownRecordSchema,
  position: pointSchema,
  size: sizeSchema,
  rotation: z.number(),
  tldrawIndex: z.string().min(1).max(100),
  parentFrameId: z.null(),
});

export const syncItemsRequestSchema = z.object({
  items: z.array(syncItemInputSchema).max(200),
});

export const itemsResponseSchema = z.object({
  data: z.array(itemSchema),
  meta: envelopeMetaSchema,
});

export type ItemDto = z.infer<typeof itemSchema>;
export type SyncItemInput = z.infer<typeof syncItemInputSchema>;
```

`packages/contracts/src/task.ts`:

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';
import { isoDateSchema, objectIdSchema } from './common.js';
import { itemSchema } from './item.js';

export const taskOriginSchema = z.object({
  itemId: objectIdSchema,
  frameId: objectIdSchema.nullable(),
  position: z.object({ x: z.number(), y: z.number() }),
  voteCount: z.number().int().nonnegative(),
  authorId: objectIdSchema,
  itemCreatedAt: isoDateSchema,
});

export const taskSchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  columnId: z.string().min(1),
  order: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  assigneeId: objectIdSchema.nullable(),
  labels: z.array(z.string()),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: isoDateSchema.nullable(),
  lifecycle: z.literal('active'),
  sourceItemId: objectIdSchema.nullable(),
  origin: taskOriginSchema.nullable(),
  version: z.number().int().positive(),
  createdBy: objectIdSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const promoteRequestSchema = z.object({
  columnId: z.string().min(1),
  assignToMe: z.boolean().default(false),
});

export const moveTaskRequestSchema = z.object({
  columnId: z.string().min(1),
});

export const tasksResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema,
});

export const taskResponseSchema = z.object({
  data: taskSchema,
  meta: envelopeMetaSchema,
});

export const promoteResponseSchema = z.object({
  data: z.object({
    item: itemSchema,
    task: taskSchema,
  }),
  meta: envelopeMetaSchema,
});

export type TaskDto = z.infer<typeof taskSchema>;
export type PromoteRequest = z.infer<typeof promoteRequestSchema>;
export type MoveTaskRequest = z.infer<typeof moveTaskRequestSchema>;
```

`packages/contracts/src/index.ts` thêm:

```ts
export * from './common.js';
export * from './board.js';
export * from './item.js';
export * from './task.js';
```

- [ ] **Step 5: Tạo model và index**

`apps/api/src/modules/boards/board.model.ts`:

```ts
import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
  isDone: boolean;
}

export interface BoardSettings {
  votingLimit: number;
  minVotes: number;
  stalledAfterDays: number;
}

export interface Board {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  columns: BoardColumn[];
  settings: BoardSettings;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BoardDocument = HydratedDocument<Board>;

const columnSchema = new Schema<BoardColumn>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    isDone: { type: Boolean, required: true },
  },
  { _id: false },
);

const settingsSchema = new Schema<BoardSettings>(
  {
    votingLimit: { type: Number, required: true, default: 3 },
    minVotes: { type: Number, required: true, default: 3 },
    stalledAfterDays: { type: Number, required: true, default: 7 },
  },
  { _id: false },
);

const boardSchema = new Schema<Board>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    columns: { type: [columnSchema], required: true },
    settings: { type: settingsSchema, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'backlog', name: 'Backlog', order: 0, isDone: false },
  { id: 'todo', name: 'To Do', order: 1, isDone: false },
  { id: 'in-progress', name: 'In Progress', order: 2, isDone: false },
  { id: 'review', name: 'Review', order: 3, isDone: false },
  { id: 'done', name: 'Done', order: 4, isDone: true },
];

export const BoardModel =
  mongoose.models.Board ?? mongoose.model<Board>('Board', boardSchema);
```

`apps/api/src/modules/items/item.model.ts`:

```ts
import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface ItemVote {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface Item {
  boardId: mongoose.Types.ObjectId;
  shapeId: string;
  type: 'note';
  content: string;
  style: Record<string, unknown>;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  tldrawIndex: string;
  parentFrameId: mongoose.Types.ObjectId | null;
  authorId: mongoose.Types.ObjectId;
  votes: ItemVote[];
  promotedTaskId: mongoose.Types.ObjectId | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ItemDocument = HydratedDocument<Item>;

const voteSchema = new Schema<ItemVote>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const itemSchema = new Schema<Item>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    shapeId: { type: String, required: true },
    type: { type: String, enum: ['note'], required: true },
    content: { type: String, required: true, default: '' },
    style: { type: Schema.Types.Mixed, required: true, default: {} },
    props: { type: Schema.Types.Mixed, required: true, default: {} },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    size: {
      w: { type: Number, required: true },
      h: { type: Number, required: true },
    },
    rotation: { type: Number, required: true, default: 0 },
    tldrawIndex: { type: String, required: true },
    parentFrameId: { type: Schema.Types.ObjectId, default: null },
    authorId: { type: Schema.Types.ObjectId, required: true },
    votes: { type: [voteSchema], required: true, default: [] },
    promotedTaskId: { type: Schema.Types.ObjectId, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const ItemModel =
  mongoose.models.Item ?? mongoose.model<Item>('Item', itemSchema);
```

`apps/api/src/modules/tasks/task.model.ts`:

```ts
import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface TaskOrigin {
  itemId: mongoose.Types.ObjectId;
  frameId: mongoose.Types.ObjectId | null;
  position: { x: number; y: number };
  voteCount: number;
  authorId: mongoose.Types.ObjectId;
  itemCreatedAt: Date;
}

export interface Task {
  boardId: mongoose.Types.ObjectId;
  columnId: string;
  order: string;
  title: string;
  description: string;
  assigneeId: mongoose.Types.ObjectId | null;
  labels: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: Date | null;
  lifecycle: 'active' | 'demoted';
  sourceItemId: mongoose.Types.ObjectId | null;
  origin: TaskOrigin | null;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<Task>;

const originSchema = new Schema<TaskOrigin>(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    frameId: { type: Schema.Types.ObjectId, default: null },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    voteCount: { type: Number, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    itemCreatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const taskSchema = new Schema<Task>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    columnId: { type: String, required: true },
    order: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, default: '' },
    assigneeId: { type: Schema.Types.ObjectId, default: null },
    labels: { type: [String], required: true, default: [] },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      required: true,
      default: 'medium',
    },
    dueDate: { type: Date, default: null },
    lifecycle: {
      type: String,
      enum: ['active', 'demoted'],
      required: true,
      default: 'active',
    },
    sourceItemId: { type: Schema.Types.ObjectId, default: null },
    origin: { type: originSchema, default: null },
    version: { type: Number, required: true, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const TaskModel =
  mongoose.models.Task ?? mongoose.model<Task>('Task', taskSchema);
```

`apps/api/src/db/indexes.ts`:

```ts
import { BoardModel } from '../modules/boards/board.model.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';

export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    BoardModel.collection.createIndex(
      { ownerId: 1, updatedAt: -1 },
      { name: 'boards_owner_updated' },
    ),
    ItemModel.collection.createIndex(
      { boardId: 1, shapeId: 1 },
      { unique: true, name: 'items_board_shape_unique' },
    ),
    ItemModel.collection.createIndex(
      { boardId: 1, type: 1 },
      { name: 'items_board_type' },
    ),
    TaskModel.collection.createIndex(
      { sourceItemId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          sourceItemId: { $type: 'objectId' },
          lifecycle: 'active',
        },
        name: 'uniq_active_task_per_item',
      },
    ),
    TaskModel.collection.createIndex(
      { boardId: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_kanban_order',
      },
    ),
  ]);
}
```

- [ ] **Step 6: Tạo error/owner/serializer và nối app**

`apps/api/src/lib/errors.ts`:

```ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

`apps/api/src/middleware/demo-owner.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import type { ObjectId } from 'mongoose';

export function createDemoOwnerMiddleware(ownerId: ObjectId) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    request.ownerId = ownerId;
    next();
  };
}
```

`apps/api/src/types/express.d.ts`:

```ts
import type { ObjectId } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ownerId: ObjectId;
    }
  }
}

export {};
```

`apps/api/src/config/env.ts` thêm:

```ts
DEMO_OWNER_ID: z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'DEMO_OWNER_ID phải là ObjectId 24 ký tự')
  .default('000000000000000000000001'),
```

`apps/api/src/middleware/error-handler.ts` xử lý:

```ts
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: error.flatten(),
        },
        meta: { requestId: request.requestId },
      });
      return;
    }

    if (error instanceof AppError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
        meta: { requestId: request.requestId },
      });
      return;
    }

    if ((error as { code?: number }).code === 11000) {
      response.status(409).json({
        error: { code: 'ALREADY_PROMOTED', message: 'Item đã được promote' },
        meta: { requestId: request.requestId },
      });
      return;
    }

    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi hệ thống' },
      meta: { requestId: request.requestId },
    });
  };
}
```

`apps/api/src/lib/serialize.ts` ánh xạ `BoardDocument`, `ItemDocument`, `TaskDocument` sang DTO contracts; ObjectId dùng `toHexString()`, Date dùng `toISOString()`.

`apps/api/src/app.ts` thêm dependency `demoOwnerId: string`, tạo ObjectId và mount board router ở Task 2. Ở task này chỉ cần middleware có thể import nhưng chưa dùng; giữ type-safe.

`apps/api/src/server.ts`:

```ts
await ensureIndexes();
const app = createApp({
  ...,
  demoOwnerId: env.DEMO_OWNER_ID,
});
```

Cập nhật health test và mọi `createApp` call với `demoOwnerId: '000000000000000000000001'`.

- [ ] **Step 7: Chạy index test, typecheck, lint**

```bash
npm run build:contracts
npm run test --workspace @nextask/api
npm run typecheck --workspace @nextask/api
npm run lint
```

Expected: index test pass; test cũ vẫn pass.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/common.ts packages/contracts/src/board.ts packages/contracts/src/item.ts packages/contracts/src/task.ts packages/contracts/src/index.ts apps/api/src/lib/errors.ts apps/api/src/lib/serialize.ts apps/api/src/db/indexes.ts apps/api/src/middleware/demo-owner.ts apps/api/src/middleware/error-handler.ts apps/api/src/types/express.d.ts apps/api/src/modules/boards/board.model.ts apps/api/src/modules/items/item.model.ts apps/api/src/modules/tasks/task.model.ts apps/api/src/config/env.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/test/health.integration.test.ts apps/api/test/helpers/test-db.ts apps/api/test/indexes.integration.test.ts .env.example docker-compose.yml apps/api/package.json apps/web/package.json package-lock.json
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add phase 1 contracts, models, and indexes"
```

---

### Task 2: Board API và item sync

**Files:**
- Create: `apps/api/src/modules/boards/board.service.ts`
- Create: `apps/api/src/modules/boards/board.router.ts`
- Create: `apps/api/src/modules/items/item.service.ts`
- Create: `apps/api/src/modules/items/item.router.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/workspace.integration.test.ts`

**Interfaces:**
- Produces:
  - `listBoards(ownerId): Promise<BoardDocument[]>`
  - `createBoard(ownerId, input): Promise<BoardDocument>`
  - `getBoardForOwner(boardId, ownerId): Promise<BoardDocument>`
  - `listItems(boardId, ownerId): Promise<ItemDocument[]>`
  - `syncItems(boardId, ownerId, items): Promise<ItemDocument[]>`
  - Routes GET/POST `/boards`, GET `/boards/:boardId`, GET/PUT `/boards/:boardId/items`.

- [ ] **Step 1: Viết test thất bại**

`apps/api/test/workspace.integration.test.ts`:

```ts
import { ObjectId } from 'mongodb';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const ownerId = '000000000000000000000001';
const logger = pino({ level: 'silent' });
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
    demoOwnerId: ownerId,
  });
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

function note(shapeId: string, content: string) {
  return {
    shapeId,
    type: 'note',
    content,
    style: { color: 'yellow' },
    props: { color: 'yellow', richText: { type: 'doc', content: [] } },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentFrameId: null,
  };
}

describe('boards và items', () => {
  it('tạo board với 5 cột mặc định', async () => {
    const response = await request(app).post('/api/v1/boards').send({ name: 'Retro 1' });
    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Retro 1');
    expect(response.body.data.columns.map((column: { id: string }) => column.id)).toEqual([
      'backlog',
      'todo',
      'in-progress',
      'review',
      'done',
    ]);
    expect(response.body.data.ownerId).toBe(ownerId);
  });

  it('chỉ trả board của demo owner', async () => {
    await BoardModel.create({
      name: 'Board người khác',
      ownerId: new ObjectId(),
      columns: [],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
    await request(app).post('/api/v1/boards').send({ name: 'Board của tôi' }).expect(201);
    const response = await request(app).get('/api/v1/boards').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Board của tôi');
  });

  it('sync note idempotent theo shapeId', async () => {
    const board = await request(app).post('/api/v1/boards').send({ name: 'Board' });
    const boardId = board.body.data._id as string;
    const first = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng')] })
      .expect(200);
    expect(first.body.data).toHaveLength(1);
    const second = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Ý tưởng đã sửa')] })
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].content).toBe('Ý tưởng đã sửa');
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
  });

  it('sync xóa note chưa promote không còn trong payload', async () => {
    const board = await request(app).post('/api/v1/boards').send({ name: 'Board' });
    const boardId = board.body.data._id as string;
    await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
      .expect(200);
    const response = await request(app)
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một')] })
      .expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(await ItemModel.countDocuments({ boardId })).toBe(1);
  });

  it('board của owner khác trả 404', async () => {
    const other = await BoardModel.create({
      name: 'Khác',
      ownerId: new ObjectId(),
      columns: [],
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
    await request(app).get(`/api/v1/boards/${other._id.toString()}`).expect(404);
  });

  it('request sai schema trả 422', async () => {
    await request(app).post('/api/v1/boards').send({ name: '' }).expect(422);
  });
});
```

- [ ] **Step 2: Chạy test đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: 404 do router chưa có.

- [ ] **Step 3: Implement service/router**

`board.service.ts`:

```ts
import { ObjectId } from 'mongodb';
import { AppError } from '../../lib/errors.js';
import { BoardModel, DEFAULT_COLUMNS, type BoardDocument } from './board.model.js';
import type { CreateBoardRequest } from '@nextask/contracts';

export async function listBoards(ownerId: ObjectId): Promise<BoardDocument[]> {
  return BoardModel.find({ ownerId }).sort({ updatedAt: -1 }).exec();
}

export async function createBoard(
  ownerId: ObjectId,
  input: CreateBoardRequest,
): Promise<BoardDocument> {
  return BoardModel.create({
    name: input.name,
    ownerId,
    columns: DEFAULT_COLUMNS,
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
  });
}

export async function getBoardForOwner(
  rawBoardId: string,
  ownerId: ObjectId,
): Promise<BoardDocument> {
  if (!ObjectId.isValid(rawBoardId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  const board = await BoardModel.findOne({ _id: rawBoardId, ownerId }).exec();
  if (!board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  return board;
}
```

`item.service.ts`:

```ts
import type { SyncItemInput } from '@nextask/contracts';
import { ObjectId } from 'mongodb';
import { ItemModel, type ItemDocument } from './item.model.js';
import { getBoardForOwner } from '../boards/board.service.js';

export async function listItems(
  boardId: string,
  ownerId: ObjectId,
): Promise<ItemDocument[]> {
  const board = await getBoardForOwner(boardId, ownerId);
  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1 }).exec();
}

export async function syncItems(
  boardId: string,
  ownerId: ObjectId,
  items: SyncItemInput[],
): Promise<ItemDocument[]> {
  const board = await getBoardForOwner(boardId, ownerId);
  const now = new Date();
  const shapeIds = items.map((item) => item.shapeId);

  if (items.length > 0) {
    await ItemModel.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { boardId: board._id, shapeId: item.shapeId },
          update: {
            $set: {
              type: 'note',
              content: item.content,
              style: item.style,
              props: item.props,
              position: item.position,
              size: item.size,
              rotation: item.rotation,
              tldrawIndex: item.tldrawIndex,
              parentFrameId: null,
              updatedAt: now,
            },
            $setOnInsert: {
              boardId: board._id,
              shapeId: item.shapeId,
              authorId: ownerId,
              votes: [],
              promotedTaskId: null,
              createdAt: now,
            },
            $inc: { version: 1 },
          },
          upsert: true,
        },
      })),
    );
  }

  await ItemModel.deleteMany({
    boardId: board._id,
    type: 'note',
    promotedTaskId: null,
    shapeId: { $nin: shapeIds },
  });

  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1 }).exec();
}
```

`board.router.ts` gắn:
- `router.get('/', list)`.
- `router.post('/', parse createBoardRequestSchema)`.
- `router.get('/:boardId', get)`.
- Mount item router.
- Use envelope with request.requestId.

`item.router.ts`:
- `mergeParams: true`.
- GET/PUT `/`.
- Parse `syncItemsRequestSchema`.
- Board id cast `request.params.boardId`.
- Call services with `request.ownerId`.

`app.ts`:
- Create `ObjectId` once from `demoOwnerId`.
- `app.use('/api/v1/boards', createDemoOwnerMiddleware(ownerObjectId), createBoardsRouter())`.

- [ ] **Step 4: Chạy test xanh, typecheck, lint**

```bash
npm run test --workspace @nextask/api
npm run typecheck --workspace @nextask/api
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/boards apps/api/src/modules/items/item.service.ts apps/api/src/modules/items/item.router.ts apps/api/src/app.ts apps/api/test/workspace.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add board and item workspace API"
```

---

### Task 3: Promote transaction và task move

**Files:**
- Create: `apps/api/src/modules/items/promotion.service.ts`
- Create: `apps/api/src/modules/tasks/task.service.ts`
- Create: `apps/api/src/modules/tasks/task.router.ts`
- Modify: `apps/api/src/modules/items/item.router.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Create: `apps/api/test/promotion.integration.test.ts`

**Interfaces:**
- Produces:
  - `promoteItem(input: { boardId, itemId, ownerId, request, afterTaskInsert? }): Promise<{item, task}>`.
  - `listTasks(boardId, ownerId): Promise<TaskDocument[]>`.
  - `moveTask(boardId, taskId, ownerId, input): Promise<TaskDocument>`.
  - Routes POST promote, GET tasks, PATCH task.

- [ ] **Step 1: Viết test thất bại**

`apps/api/test/promotion.integration.test.ts`:

```ts
import { ObjectId } from 'mongodb';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { promoteItem } from '../src/modules/items/promotion.service.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const ownerId = '000000000000000000000001';
const logger = pino({ level: 'silent' });
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
    demoOwnerId: ownerId,
  });
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

async function setupNote(content = 'Ý tưởng lớn') {
  const board = await request(app).post('/api/v1/boards').send({ name: 'Retro' });
  const boardId = board.body.data._id as string;
  const sync = await request(app)
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
        },
      ],
    })
    .expect(200);
  return { boardId, item: sync.body.data[0] as { _id: string } };
}

describe('promote', () => {
  it('tạo task, cập nhật item và origin trong transaction', async () => {
    const { boardId, item } = await setupNote();
    const response = await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: true })
      .expect(201);
    expect(response.body.data.task.title).toBe('Ý tưởng lớn');
    expect(response.body.data.task.assigneeId).toBe(ownerId);
    expect(response.body.data.task.origin.position).toEqual({ x: 12, y: 34 });
    expect(response.body.data.item.promotedTaskId).toBe(response.body.data.task._id);
  });

  it('promote lần hai trả 409 và không tạo task trùng', async () => {
    const { boardId, item } = await setupNote();
    await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(201);
    await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(409);
    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('hai promote đồng thời chỉ tạo một task', async () => {
    const { boardId, item } = await setupNote('Đồng thời');
    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false }),
      request(app)
        .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
        .send({ columnId: 'todo', assignToMe: false }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await TaskModel.countDocuments({ sourceItemId: item._id })).toBe(1);
  });

  it('lỗi sau insert task làm rollback toàn bộ', async () => {
    const { boardId, item } = await setupNote('Rollback');
    const boardObjectId = new ObjectId(boardId);
    await expect(
      promoteItem({
        boardId: boardObjectId,
        itemId: new ObjectId(item._id),
        ownerId: new ObjectId(ownerId),
        request: { columnId: 'todo', assignToMe: false },
        afterTaskInsert: async () => {
          throw new Error('fault injection');
        },
      }),
    ).rejects.toThrow('fault injection');
    expect(await TaskModel.countDocuments({ boardId: boardObjectId })).toBe(0);
    const saved = await ItemModel.findById(item._id);
    expect(saved?.promotedTaskId).toBeNull();
  });

  it('move task sang Done cập nhật cột', async () => {
    const { boardId, item } = await setupNote('Kéo thẻ');
    const promoted = await request(app)
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false })
      .expect(201);
    const taskId = promoted.body.data.task._id as string;
    const moved = await request(app)
      .patch(`/api/v1/boards/${boardId}/tasks/${taskId}`)
      .send({ columnId: 'done' })
      .expect(200);
    expect(moved.body.data.columnId).toBe('done');
  });
});
```

- [ ] **Step 2: Chạy đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì promotion service/router chưa có.

- [ ] **Step 3: Implement promotion**

`promotion.service.ts` dùng:

```ts
import { generateKeyBetween } from 'fractional-indexing';
import mongoose from 'mongoose';

export interface PromoteInput {
  boardId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  request: { columnId: string; assignToMe: boolean };
  afterTaskInsert?: () => Promise<void>;
}
```

Trong transaction:

- Đọc board bằng `BoardModel.findById(boardId).session(session)`.
- Kiểm tra board owner.
- Tìm column theo id; không có thì `AppError(422, 'VALIDATION_ERROR', ...)`.
- Đọc item theo `_id`, `boardId`; không có 404.
- Nếu `promotedTaskId` khác null -> 409.
- Tìm task cuối cột:
  `TaskModel.findOne({boardId,columnId,lifecycle:'active'}).sort({order:-1}).session(session)`.
- `order = generateKeyBetween(last?.order ?? null, null)`.
- Insert task bằng `TaskModel.create([task], {session})`.
- Gọi `await input.afterTaskInsert?.()`.
- Update item filter `_id`, `boardId`, `promotedTaskId: null`; set promotedTaskId, inc version.
- Nếu update match 0 -> 409.
- Return item/task.
- Transaction options `readConcern snapshot`, `writeConcern majority/journal`, readPreference primary.
- Title fallback "Ghi chú không tiêu đề"; description content; priority medium; labels []; dueDate null; lifecycle active; assignee = assignToMe ? ownerId : null; origin snapshot.

`task.service.ts`:
- `listTasks` verifies board, finds active sorted by column order + order.
- `moveTask` verifies board, task, target column; if same column return; compute last order in target, update columnId/order/inc version.

`task.router.ts` GET/PATCH; `item.router.ts` POST promote.
- Mount task router in board router.

- [ ] **Step 4: Chạy test, typecheck, lint**

```bash
npm run test --workspace @nextask/api
npm run typecheck --workspace @nextask/api
npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/items/promotion.service.ts apps/api/src/modules/items/item.router.ts apps/api/src/modules/tasks apps/api/src/modules/boards/board.router.ts apps/api/test/promotion.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: implement transactional promote and task move"
```

---

### Task 4: Web API client, board list và tạo board

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/lib/server-api.ts`
- Create: `apps/web/app/create-board-form.tsx`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/health/page.tsx`
- Modify: `.env.example`
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: contracts board schemas, API endpoints.
- Produces:
  - Browser API functions: `listBoards`, `createBoard`, `getBoard`, `getItems`, `syncItems`, `getTasks`, `promoteItem`, `moveTask`.
  - Server function `fetchBoards`.
  - Trang `/` danh sách board và form tạo.
  - Trang `/health` giữ kiểm tra Phase 0.

- [ ] **Step 1: Tạo API client**

- `apiBase` browser: `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'`.
- `request(path, schema, init)` parse envelope, throw `ApiClientError(code,message,status,details)`.
- Các hàm dùng `parse` response schema.
- `server-api.ts` dùng `process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1'` và `boardsResponseSchema`.
- `NEXT_PUBLIC_API_URL` được bake khi build Docker.

- [ ] **Step 2: Trang board list**

- Server component `dynamic = 'force-dynamic'`.
- Fetch boards, hiển thị empty state hoặc card.
- Link tới `/boards/[id]`.
- `CreateBoardForm` client: input name, submit POST, `router.push`.
- Header có link `/health`.
- Chuyển health UI hiện tại sang `app/health/page.tsx`.

- [ ] **Step 3: Build web**

```bash
npm run build --workspace @nextask/web
```

Expected: build pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib apps/web/app/page.tsx apps/web/app/health apps/web/app/create-board-form.tsx .env.example apps/web/Dockerfile docker-compose.yml
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add board list and creation UI"
```

---

### Task 5: tldraw whiteboard, note sync, promote và badge

**Files:**
- Create: `apps/web/app/boards/[boardId]/page.tsx`
- Create: `apps/web/features/workspace/board-workspace.tsx`
- Create: `apps/web/features/whiteboard/whiteboard.tsx`
- Create: `apps/web/features/whiteboard/whiteboard-canvas.tsx`
- Create: `apps/web/features/whiteboard/promote-dialog.tsx`
- Create: `apps/web/features/workspace/kanban-board.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `getBoard`, `getItems`, `getTasks`, `syncItems`, `promoteItem`, `moveTask`.
- Produces:
  - Board page tải dữ liệu.
  - Whiteboard dựng note từ item, sync khi thả chuột/debounce.
  - Promote modal và badge overlay.
  - Kanban render task, chưa cần drag hoàn chỉnh nếu Task 6 làm.

- [ ] **Step 1: Trang board và state**

- `page.tsx` nhận `params: Promise<{ boardId: string }>`.
- `BoardWorkspace` fetch song song board/items/tasks, hiển thị loading/error.
- Header, whiteboard, Kanban.
- Callback:
  - `onItemsChange`
  - `onTasksChange`
  - promote API.

- [ ] **Step 2: Whiteboard dynamic**

`whiteboard.tsx` client dùng `next/dynamic` với `ssr:false`, import `whiteboard-canvas.tsx`.
`whiteboard-canvas.tsx`:
- Import `Tldraw`, `tldraw/tldraw.css`, `DefaultColorStyle`, types.
- `hideUi`.
- `onMount` dựng shapes note từ `initialItems`.
- Custom toolbar Select/Hand/Note, màu, zoom, lưu.
- Lưu ý chính xác: shape lưu `shapeId`, `content` lấy từ `editor.getShapeUtil(shape).getText(shape)`, bounds từ `getShapePageBounds`, `tldrawIndex` từ `shape.index`, props raw.
- Sync qua `PUT /items`.
- Debounce 800 ms; flush khi `pointer_up`.
- Badge overlay dùng `editor.pageToViewport` + `getShapePageBounds`; cập nhật theo `editor.on('frame')` có throttle.
- Promote button gọi sync trước, sau đó báo item cho parent mở dialog.

- [ ] **Step 3: Promote dialog**

- Select cột đích từ board.columns.
- Checkbox giao cho Demo User.
- Confirm gọi `promoteItem`.
- Cập nhật item/task trong state.
- Hiển thị lỗi 409/422.

- [ ] **Step 4: Build web**

```bash
npm run build --workspace @nextask/web
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/boards apps/web/features/whiteboard apps/web/features/workspace/board-workspace.tsx apps/web/features/workspace/kanban-board.tsx apps/web/app/globals.css
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add tldraw note workspace and promote flow"
```

---

### Task 6: Kanban drag, badge reload và hoàn thiện UI

**Files:**
- Modify: `apps/web/features/workspace/kanban-board.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: tasks/columns state, `moveTask`.
- Produces: kéo task giữa cột, task card, badge cột hiện tại.

- [ ] **Step 1: Kanban drag**

- Card `draggable`.
- Column `onDragOver` prevent default, `onDrop` gọi `moveTask`.
- Cập nhật task state sau response.
- Highlight cột đích.
- Hiển thị assignee: nếu `assigneeId === board.ownerId` thì `Demo User`; nếu null `Chưa gán`.

- [ ] **Step 2: Badge sau reload**

- Badge map `item.promotedTaskId -> task`.
- Hiển thị `Đã thành task · <column name>`.
- Khi task move, state task đổi, badge đổi ngay.
- Reload board: task fetch lại, badge đúng.

- [ ] **Step 3: Build và browser smoke**

```bash
npm run build --workspace @nextask/web
docker compose build web
docker compose up -d web
```

Mở trình duyệt kiểm tra giao diện, loading, empty state.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/workspace apps/web/app/globals.css
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add kanban drag and promoted badge"
```

---

### Task 7: Kiểm chứng cuối Phase 1, Docker và tài liệu

**Files:**
- Modify: `docs/phases/01-vertical-slice.md`
- Modify: `docs/session-log.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `docs/architecture.md`
- Modify: `README.md`
- Modify: plan này.

**Interfaces:**
- Consumes: toàn bộ Phase 1.
- Produces: bằng chứng test, browser, Git, tài liệu.

- [ ] **Step 1: Chạy cổng chất lượng**

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test
npm run test
```

Expected: tất cả pass; ghi số test và thời gian.

- [ ] **Step 2: Docker rebuild và health**

```bash
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
curl -fsS http://localhost:3000
```

Expected: ba service healthy, web 200.

- [ ] **Step 3: Browser E2E**

1. Mở `/`, tạo board mới.
2. Trong board, chọn Note, click canvas, nhập nội dung.
3. Chọn note, bấm Promote, chọn cột To Do, xác nhận.
4. Kiểm tra task xuất hiện ở Kanban.
5. Kéo task sang Done.
6. Reload.
7. Kiểm tra badge `Đã thành task · Done` trên note.
8. Kiểm tra API task columnId `done`.

Ghi lại marker và request id.

- [ ] **Step 4: Kiểm tra rollback/duplicate bằng test**

Chỉ dựa vào output test, không dựa vào quan sát UI:

```bash
npm run test --workspace @nextask/api -- --reporter=verbose
```

- [ ] **Step 5: Cập nhật tài liệu**

- Phase doc: trạng thái, kết quả, ảnh hưởng, giới hạn.
- Session log: commit, test, browser, lỗi phát sinh.
- MongoDB notes: transaction, unique index, quan sát.
- README: cách dùng Phase 1, demo owner, luồng thử.
- Architecture: ghi chú demo owner/notes-only nếu cần.

- [ ] **Step 6: CJK và placeholder scan**

```bash
grep -RInP '[\x{4e00}-\x{9fff}\x{3040}-\x{30ff}]' docs README.md apps/api/src apps/api/test apps/web/app apps/web/features apps/web/lib packages/contracts/src docker docker-compose.yml 2>/dev/null || true
grep -RInE 'TODO|FIXME|TBD' docs README.md apps/api/src apps/api/test apps/web/app apps/web/features apps/web/lib packages/contracts/src docker docker-compose.yml 2>/dev/null || true
```

- [ ] **Step 7: Commit cuối**

```bash
git add docs README.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 1 verification"
```

- [ ] **Step 8: Git check**

```bash
git status --short
git log --oneline
git remote -v
```

Expected: sạch, không remote.

---

## Self-review của kế hoạch

- Spec coverage: board, note tldraw, promote transaction, unique index, Kanban move, reload badge, tests, docs đều có task.
- Auth, `$jsonSchema`, realtime, demote, batch, voting được loại khỏi phạm vi có chủ đích.
- Test transaction dùng hook tiêm lỗi, không mock DB.
- Test duplicate và rollback chứng minh yêu cầu cốt lõi.
- Git chỉ dùng đường dẫn cụ thể, không remote/push/amend/config.
- UI có fallback loading/error và badge theo task state.
- Các kiểu contract, model, service dùng cùng tên `promotedTaskId`, `sourceItemId`, `origin`, `columnId`, `order`.
