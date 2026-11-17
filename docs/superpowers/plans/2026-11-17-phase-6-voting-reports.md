# NexTask Phase 6 - Voting, Quota and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm dot voting có quota bền vững, kết quả vote bằng aggregation và báo cáo ý tưởng/task bị kẹt, kèm UI vote/quota và tab Báo cáo.

**Architecture:** Vote/unvote dùng một transaction cập nhật `items.votes` và `voter_budgets`; vote không tăng `item.version`. Migration 006 tạo budget và backfill từ votes hiện có. Results/report dùng aggregation `$facet`, giữ `voteCount` là projection, không ghi bộ đếm dư thừa. Web thêm vote trong panel note và tab Báo cáo.

**Tech Stack:** Node 26, TypeScript 6.0.3, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5.

**Spec:** `docs/phases/06-voting-reports.md`

**Branch:** `feat/phase-6-voting-reports` từ `release/v0.6`; release tạo từ `main` tại `3bf6d66` (v0.5.0). Không merge `main`, không bump `0.6.0`, tag `v0.5.0` giữ nguyên.

**Trạng thái thực thi:** Hoàn thành; đã merge vào `release/v0.6` (`9d0ddc5`) và phát hành
`0.6.0` trên `main` tại `9b6e8ed`; feature branch đã xóa. Commit chính:

- `b7e6013` `docs: specify phase 6 voting and reports`
- `2a47258` `docs: plan phase 6 voting and reports`
- `351a07f` `feat: add vote and report contracts`
- `f78260b` `feat: add voter budgets and phase 6 migration`
- `fa501f9` `feat: add transactional voting`
- `82e235d` `feat: expose vote results aggregation`
- `6cfa223` `feat: add stalled ideas report aggregation`
- `23fe5cb` `feat: add voting UI and quota`
- `ff7dab3` `feat: add stalled ideas report tab`
- `c599a27` `fix: use voter_budgets collection name`
- `581817b` `docs: record phase 6 verification`
- `6fe2aa4` `docs: record phase 6 verification`
- `9d0ddc5` `merge: phase 6 voting and reports` vào `release/v0.6`
- `e08fef2` `chore: prepare v0.6.0 release`
- `9b6e8ed` `release: v0.6 voting and reports` vào `main`

Release gate: typecheck/lint/format pass; full suite 37 file, 162 test ba lần
29.51/29.44/29.77 s. Main gate: 29.43/28.34/28.39 s; Docker health `0.6.0`.

**Điều chỉnh thực tế:** report dùng hai aggregation song song trên `items`/`tasks` thay vì
`$facet` trên hai collection; Mongoose model phải khai báo `collection: 'voter_budgets'`.
Feature gate: typecheck/lint/format pass; full suite 37 file, 162 test ba lần
29.41/29.64/29.50 s.


## Global Constraints

- MongoDB replica set thật cho test; không mock DB/transaction/aggregation.
- Mỗi user một phiếu/item; quota theo board-user; vote/unvote transaction.
- Vote không tăng `item.version`; budget có `version` riêng.
- Không ghi activity cho từng vote.
- Không thêm event realtime mới; dùng item event hiện có.
- Migration 006 tạo `voter_budgets`, index, backfill used từ votes; thêm index report.
- Reports trả cả `unpromotedIdeas` và `stalledTasks`; limit tối đa 100.
- Không bump `0.6.0`; không merge `main`; tag `v0.5.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Full suite phải pass ba lần trước khi merge; không nới timeout.

---

## File Structure

- `packages/contracts/src/vote.ts` — vote response, results, budget, error codes.
- `packages/contracts/src/report.ts` — report query/response.
- `apps/api/src/db/migrations/006-phase-6.ts` — budget collection/index/backfill, report indexes.
- `apps/api/src/db/collection-validators.ts` — voter_budgets validator.
- `apps/api/src/modules/votes/voter-budget.model.ts` — budget model.
- `apps/api/src/modules/votes/voter-budget.service.ts` — ensure/read budget.
- `apps/api/src/modules/votes/voting.service.ts` — vote/unvote transaction.
- `apps/api/src/modules/votes/vote.router.ts` — GET results.
- `apps/api/src/modules/items/item.router.ts` — POST/DELETE item votes.
- `apps/api/src/modules/reports/report.pipeline.ts` — aggregation pipeline builder.
- `apps/api/src/modules/reports/report.service.ts` — report service.
- `apps/api/src/modules/reports/report.router.ts` — report endpoint.
- `apps/api/src/modules/boards/board.router.ts` — mount vote/report routers.
- `apps/web/lib/api.ts` — vote/unvote/results/report client.
- `apps/web/features/whiteboard/whiteboard.tsx` — vote/quota props.
- `apps/web/features/whiteboard/whiteboard-canvas.tsx` — vote panel.
- `apps/web/features/workspace/report-panel.tsx` — report UI.
- `apps/web/features/workspace/board-workspace.tsx` — vote state, report tab, refresh.

---

### Task 0: Docs baseline và branch

**Files:**
- Modify: `docs/session-log.md`
- Create: `docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md`

**Interfaces:**
- Consumes: spec đã duyệt `docs/phases/06-voting-reports.md`.
- Produces: plan Phase 6 trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git status --short --branch
git log --oneline -1
```

Expected: `feat/phase-6-voting-reports`; không có file dirty ngoài plan.

- [ ] **Step 2: Ghi session log**

Thêm cuối `docs/session-log.md`:

```markdown
## 2026-11-17 - Phase 6 plan

- Spec `docs/phases/06-voting-reports.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md`.
- Phạm vi: vote/unvote quota, voter_budgets, results và stalled-ideas reports, UI vote/report.
- Bắt đầu Inline Execution; không merge `main`.
```

- [ ] **Step 3: Commit plan**

```bash
git add docs/session-log.md docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 6 voting and reports"
```

---

### Task 1: Contracts vote, results và report

**Files:**
- Create: `packages/contracts/src/vote.ts`
- Create: `packages/contracts/src/report.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/api/test/vote-report-contracts.test.ts`

**Interfaces:**
- Consumes: `itemSchema`, `objectIdSchema`, `envelopeMetaSchema`.
- Produces:
  - `voteResponseSchema`, `voteResultsQuerySchema`, `voteResultsResponseSchema`.
  - `reportQuerySchema`, `reportResponseSchema`.
  - `ALREADY_VOTED_CODE`, `NOT_VOTED_CODE`, `VOTE_LIMIT_REACHED_CODE`.
  - `VoteResultsDto`, `StalledIdeasReportDto`.

- [ ] **Step 1: Viết test contract thất bại**

Tạo `apps/api/test/vote-report-contracts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALREADY_VOTED_CODE,
  NOT_VOTED_CODE,
  VOTE_LIMIT_REACHED_CODE,
  reportQuerySchema,
  voteResultsQuerySchema,
} from '@nextask/contracts';

describe('phase 6 contracts', () => {
  it('results query default limit 50, tối đa 100', () => {
    expect(voteResultsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(voteResultsQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(() => voteResultsQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => voteResultsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('report query coerce và optional defaults từ board', () => {
    expect(reportQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      reportQuerySchema.parse({ minVotes: '2', stalledDays: '7', limit: '10' }),
    ).toEqual({ minVotes: 2, stalledDays: 7, limit: 10 });
    expect(() => reportQuerySchema.parse({ minVotes: '-1' })).toThrow();
    expect(() => reportQuerySchema.parse({ stalledDays: '0' })).toThrow();
  });

  it('export error codes vote', () => {
    expect(ALREADY_VOTED_CODE).toBe('ALREADY_VOTED');
    expect(NOT_VOTED_CODE).toBe('NOT_VOTED');
    expect(VOTE_LIMIT_REACHED_CODE).toBe('VOTE_LIMIT_REACHED');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/vote-report-contracts.test.ts
```

Expected: FAIL vì contracts chưa export vote/report.

- [ ] **Step 3: Tạo `packages/contracts/src/vote.ts`**

```ts
import { z } from 'zod';
import { itemSchema } from './item.js';
import { envelopeMetaSchema } from './envelope.js';
import { objectIdSchema } from './common.js';

export const ALREADY_VOTED_CODE = 'ALREADY_VOTED' as const;
export const NOT_VOTED_CODE = 'NOT_VOTED' as const;
export const VOTE_LIMIT_REACHED_CODE = 'VOTE_LIMIT_REACHED' as const;

export const voterBudgetSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

export const voteResponseSchema = z.object({
  data: z.object({
    item: itemSchema,
    budget: voterBudgetSchema,
  }),
  meta: envelopeMetaSchema,
});

export const voteResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const voteResultItemSchema = z.object({
  itemId: objectIdSchema,
  shapeId: z.string().min(1),
  content: z.string(),
  voteCount: z.number().int().nonnegative(),
  voters: z.array(objectIdSchema),
  promotedTaskId: objectIdSchema.nullable(),
  createdAt: z.string().datetime(),
});

export const voteUsageSchema = z.object({
  userId: objectIdSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

export const voteResultsResponseSchema = z.object({
  data: z.object({
    items: z.array(voteResultItemSchema),
    usage: z.array(voteUsageSchema),
    viewer: voteUsageSchema,
  }),
  meta: envelopeMetaSchema,
});

export type VoterBudgetDto = z.infer<typeof voterBudgetSchema>;
export type VoteResultsDto = z.infer<typeof voteResultsResponseSchema>['data'];
```

- [ ] **Step 4: Tạo `packages/contracts/src/report.ts`**

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';
import { objectIdSchema } from './common.js';

export const reportQuerySchema = z.object({
  minVotes: z.coerce.number().int().min(0).max(1000).optional(),
  stalledDays: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reportIdeaSchema = z.object({
  itemId: objectIdSchema,
  shapeId: z.string().min(1),
  content: z.string(),
  voteCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const reportTaskSchema = z.object({
  taskId: objectIdSchema,
  title: z.string(),
  columnId: z.string(),
  createdAt: z.string().datetime(),
  sourceItem: z
    .object({
      itemId: objectIdSchema,
      shapeId: z.string().min(1),
      content: z.string(),
    })
    .nullable(),
});

export const reportResponseSchema = z.object({
  data: z.object({
    unpromotedIdeas: z.array(reportIdeaSchema),
    stalledTasks: z.array(reportTaskSchema),
    summary: z.object({
      unpromotedIdeas: z.number().int().nonnegative(),
      stalledTasks: z.number().int().nonnegative(),
    }),
    params: z.object({
      minVotes: z.number().int().nonnegative(),
      stalledDays: z.number().int().positive(),
      limit: z.number().int().positive(),
    }),
  }),
  meta: envelopeMetaSchema,
});

export type StalledIdeasReportDto = z.infer<typeof reportResponseSchema>['data'];
```

- [ ] **Step 5: Export index và chạy test**

Thêm `packages/contracts/src/index.ts`:

```ts
export * from './report.js';
export * from './vote.js';
```

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/vote-report-contracts.test.ts
```

Expected: PASS 3 test.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/vote.ts packages/contracts/src/report.ts packages/contracts/src/index.ts apps/api/test/vote-report-contracts.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add vote and report contracts"
```

---

### Task 2: Migration 006, budget model/service và budget hooks

**Files:**
- Create: `apps/api/src/db/migrations/006-phase-6.ts`
- Create: `apps/api/src/modules/votes/voter-budget.model.ts`
- Create: `apps/api/src/modules/votes/voter-budget.service.ts`
- Modify: `apps/api/src/db/collection-validators.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/src/modules/boards/board.service.ts`
- Modify: `apps/api/src/modules/invitations/invitation.service.ts`
- Test: `apps/api/test/migrations.integration.test.ts`
- Test: `apps/api/test/vote-budgets.integration.test.ts`
- Test: `apps/api/test/validators.integration.test.ts`

**Interfaces:**
- Consumes: `ItemModel`, `BoardModel`, `COLLECTION_VALIDATORS`.
- Produces:
  - `MIGRATION_006_NAME = '006-phase-6'`.
  - `VoterBudgetModel`, `VoterBudgetDocument`.
  - `ensureVoterBudget(boardId, userId, limit): Promise<VoterBudgetDocument>`.
  - Migration backfill budgets và report indexes.

- [ ] **Step 1: Cập nhật test migration/validator/budget thất bại**

Trong `apps/api/test/migrations.integration.test.ts`:

Import thêm:

```ts
  MIGRATION_006_NAME,
```

Trong test idempotent, thêm:

```ts
    expect(migrations).not.toContain(MIGRATION_006_NAME);
```

Đổi assert schema version:

```ts
    await expect(assertSchemaVersion(connection, MIGRATION_006_NAME)).resolves.toBeUndefined();
```

Thêm test cuối file:

```ts
  it('006 tạo voter_budgets, backfill và report indexes', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const [budgetInfo] = await connection.db
      .listCollections({ name: 'voter_budgets' })
      .toArray();
    const options = (budgetInfo as { options?: Record<string, unknown> } | undefined)?.options;
    expect(budgetInfo).toBeDefined();
    expect(options?.validationLevel).toBe('strict');
    expect(options?.validationAction).toBe('error');

    const indexes = await connection.db.collection('voter_budgets').indexes();
    expect(indexes.find((index) => index.name === 'voter_budgets_board_user_unique')).toMatchObject({
      unique: true,
    });

    const budget = await connection.db
      .collection('voter_budgets')
      .findOne({ boardId: legacyBoardId, userId: new Types.ObjectId(legacyOwnerId) });
    expect(budget).toMatchObject({ used: 0, limit: 3 });

    const itemIndexes = await ItemModel.collection.indexes();
    expect(itemIndexes.some((index) => index.name === 'items_board_type_promoted')).toBe(true);
    const taskIndexes = await TaskModel.collection.indexes();
    expect(taskIndexes.some((index) => index.name === 'tasks_board_lifecycle_created')).toBe(true);

    await expect(
      connection.db.collection('voter_budgets').insertOne({
        boardId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        used: -1,
        limit: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

Trong `apps/api/test/validators.integration.test.ts`, thêm `voter_budgets` vào mảng collections và test:

```ts
  it('voter_budgets used âm bị từ chối', async () => {
    await expect(
      db().collection('voter_budgets').insertOne({
        boardId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        used: -1,
        limit: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  });
```

Tạo `apps/api/test/vote-budgets.integration.test.ts`:

```ts
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
import { ensureVoterBudget } from '../src/modules/votes/voter-budget.service.js';
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

describe('voter budgets', () => {
  it('board mới có budget owner limit 3', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Budget' }).expect(201);
    const budget = await VoterBudgetModel.findOne({
      boardId: board.body.data._id,
      userId: owner.user._id,
    }).exec();
    expect(budget).toMatchObject({ used: 0, limit: 3, version: 1 });
  });

  it('ensure idempotent và tính used từ votes hiện có', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Budget' }).expect(201);
    const boardId = board.body.data._id as string;
    const first = await ensureVoterBudget(
      boardId as never,
      owner.user._id as never,
      3,
    );
    const second = await ensureVoterBudget(boardId as never, owner.user._id as never, 3);
    expect(second._id.toHexString()).toBe(first._id.toHexString());
    expect(second.used).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts test/vote-budgets.integration.test.ts
```

Expected: FAIL vì 006/model/service chưa tồn tại.

- [ ] **Step 3: Thêm validator `voter_budgets`**

Trong `apps/api/src/db/collection-validators.ts`, thêm entry sau `activities`:

```ts
  voter_budgets: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['boardId', 'userId', 'used', 'limit', 'version', 'createdAt', 'updatedAt'],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        userId: objectId,
        used: { bsonType: 'number', minimum: 0 },
        limit: { bsonType: 'number', minimum: 0 },
        version: { bsonType: 'number', minimum: 1 },
        ...timestampProperties,
      },
    },
  },
```

- [ ] **Step 4: Tạo budget model**

`apps/api/src/modules/votes/voter-budget.model.ts`:

```ts
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface VoterBudget {
  boardId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  used: number;
  limit: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type VoterBudgetDocument = HydratedDocument<VoterBudget>;

const voterBudgetSchema = new Schema<VoterBudget>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    used: { type: Number, required: true, default: 0, min: 0 },
    limit: { type: Number, required: true, min: 0 },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const VoterBudgetModel: Model<VoterBudget> =
  (mongoose.models.VoterBudget as Model<VoterBudget> | undefined) ??
  mongoose.model<VoterBudget>('VoterBudget', voterBudgetSchema);
```

- [ ] **Step 5: Tạo budget service**

`apps/api/src/modules/votes/voter-budget.service.ts`:

```ts
import { Types } from 'mongoose';
import { ItemModel } from '../items/item.model.js';
import { VoterBudgetModel, type VoterBudgetDocument } from './voter-budget.model.js';

async function countUsedVotes(
  boardId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<number> {
  const rows = await ItemModel.aggregate<{ used: number }>([
    { $match: { boardId, type: 'note' } },
    { $unwind: '$votes' },
    { $match: { 'votes.userId': userId } },
    { $count: 'used' },
  ]).exec();
  return rows[0]?.used ?? 0;
}

export async function ensureVoterBudget(
  boardId: Types.ObjectId,
  userId: Types.ObjectId,
  limit: number,
): Promise<VoterBudgetDocument> {
  const existing = await VoterBudgetModel.findOne({ boardId, userId }).exec();
  if (existing) return existing;

  const used = await countUsedVotes(boardId, userId);
  try {
    const created = await VoterBudgetModel.findOneAndUpdate(
      { boardId, userId },
      {
        $setOnInsert: {
          used,
          limit,
          version: 1,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();
    if (!created) throw new Error('Không tạo được voter budget');
    return created;
  } catch (error) {
    const raced = await VoterBudgetModel.findOne({ boardId, userId }).exec();
    if (raced) return raced;
    throw error;
  }
}
```

- [ ] **Step 6: Tạo migration 006**

`apps/api/src/db/migrations/006-phase-6.ts`:

```ts
import type { Db, Document } from 'mongodb';
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

function requireValidator(name: 'voter_budgets'): Document {
  const validator = COLLECTION_VALIDATORS[name];
  if (!validator) throw new Error(`Thiếu validator ${name}`);
  return validator;
}

async function ensureBudgetsCollection(db: Db): Promise<void> {
  const validator = requireValidator('voter_budgets');
  const [existing] = await db
    .listCollections({ name: 'voter_budgets' }, { nameOnly: true })
    .toArray();

  if (!existing) {
    await db.createCollection('voter_budgets', { validator, ...VALIDATION });
  } else {
    await db.command({ collMod: 'voter_budgets', validator, ...VALIDATION });
  }

  await db.collection('voter_budgets').createIndex(
    { boardId: 1, userId: 1 },
    { unique: true, name: 'voter_budgets_board_user_unique' },
  );
}

async function ensureReportIndexes(db: Db): Promise<void> {
  await db.collection('items').createIndex(
    { boardId: 1, type: 1, promotedTaskId: 1 },
    { name: 'items_board_type_promoted' },
  );
  await db.collection('tasks').createIndex(
    { boardId: 1, lifecycle: 1, createdAt: 1 },
    { name: 'tasks_board_lifecycle_created' },
  );
}

async function backfillBudgets(db: Db): Promise<void> {
  const boards = await db.collection('boards').find({}).toArray();
  const now = new Date();

  for (const board of boards) {
    const boardId = board._id as Document['_id'];
    const limit = Number(board.settings?.votingLimit ?? 3);
    const members = Array.isArray(board.members) ? board.members : [];

    const usage = await db
      .collection('items')
      .aggregate<{ _id: Document['_id']; used: number }>([
        { $match: { boardId, type: 'note' } },
        { $unwind: '$votes' },
        { $group: { _id: '$votes.userId', used: { $sum: 1 } } },
      ])
      .toArray();
    const usedByUser = new Map(usage.map((entry) => [String(entry._id), entry.used]));

    for (const member of members) {
      const userId = member.userId as Document['_id'];
      await db.collection('voter_budgets').updateOne(
        { boardId, userId },
        {
          $setOnInsert: { boardId, userId, version: 1, createdAt: now },
          $set: { used: usedByUser.get(String(userId)) ?? 0, limit, updatedAt: now },
        },
        { upsert: true },
      );
    }
  }
}

export const phase6Migration: Migration = {
  name: '006-phase-6',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureBudgetsCollection(db);
    await ensureReportIndexes(db);
    await backfillBudgets(db);
  },
};
```

- [ ] **Step 7: Cập nhật migration runner**

```ts
import { phase6Migration } from './migrations/006-phase-6.js';

export const MIGRATION_006_NAME = '006-phase-6';
export const LATEST_MIGRATION_NAME = MIGRATION_006_NAME;

const migrations: Migration[] = [
  phase2aMigration,
  phase2bMigration,
  phase3aMigration,
  phase4Migration,
  phase5aMigration,
  phase6Migration,
];
```

- [ ] **Step 8: Tạo budget khi board/member mới**

Trong `apps/api/src/modules/boards/board.service.ts`, import:

```ts
import { ensureVoterBudget } from '../votes/voter-budget.service.js';
```

Sau `const board = await BoardModel.create({...});`, thêm:

```ts
  await ensureVoterBudget(board._id, userId, board.settings.votingLimit);
```

Trong `apps/api/src/modules/invitations/invitation.service.ts`, import:

```ts
import { ensureVoterBudget } from '../votes/voter-budget.service.js';
```

Sau transaction thành công (sau `if (!result) ...`), trước `return result;`, thêm:

```ts
    await ensureVoterBudget(result.board._id, user._id, result.board.settings.votingLimit);
```

- [ ] **Step 9: Chạy test migration/budget**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/migrations.integration.test.ts test/validators.integration.test.ts test/vote-budgets.integration.test.ts
```

Expected: PASS; migration test thấy 006, budget backfill và report indexes.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/db/migrations/006-phase-6.ts apps/api/src/db/collection-validators.ts apps/api/src/db/migration-runner.ts apps/api/src/modules/votes/voter-budget.model.ts apps/api/src/modules/votes/voter-budget.service.ts apps/api/src/modules/boards/board.service.ts apps/api/src/modules/invitations/invitation.service.ts apps/api/test/migrations.integration.test.ts apps/api/test/validators.integration.test.ts apps/api/test/vote-budgets.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add voter budgets and phase 6 migration"
```

---

### Task 3: Vote/unvote transaction và endpoint

**Files:**
- Create: `apps/api/src/modules/votes/voting.service.ts`
- Modify: `apps/api/src/modules/items/item.router.ts`
- Test: `apps/api/test/voting.integration.test.ts`

**Interfaces:**
- Consumes: `VoterBudgetModel`, `ensureVoterBudget`, `ALREADY_VOTED_CODE`,
  `NOT_VOTED_CODE`, `VOTE_LIMIT_REACHED_CODE`.
- Produces:
  - `voteItem({ board, itemId, actor }): Promise<{ item; budget }>`.
  - `unvoteItem(...)`.
  - `POST/DELETE /api/v1/boards/:boardId/items/:itemId/votes`.

- [ ] **Step 1: Viết test vote thất bại**

Tạo `apps/api/test/voting.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BoardModel } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
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

async function setupBoard(count = 4) {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Vote' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: count }, (_, index) => ({
        shapeId: `shape:vote-${index}`,
        type: 'note',
        content: `Vote note ${index}`,
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
  return {
    owner,
    boardId,
    items: sync.body.data as Array<{ _id: string; version: number }>,
  };
}

describe('voting', () => {
  it('vote thành công, không tăng item.version, budget used +1', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    const before = await ItemModel.findById(items[0]!._id).exec();
    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);

    expect(response.body.data.item.votes).toHaveLength(1);
    expect(response.body.data.budget).toMatchObject({ used: 1, limit: 3 });
    const after = await ItemModel.findById(items[0]!._id).exec();
    expect(after?.version).toBe(before?.version);
    const budget = await VoterBudgetModel.findOne({
      boardId,
      userId: owner.user._id,
    }).exec();
    expect(budget?.used).toBe(1);
  });

  it('vote lại trả ALREADY_VOTED và không tăng used', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    const second = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(409);
    expect(second.body.error.code).toBe('ALREADY_VOTED');
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(1);
  });

  it('hết quota trả VOTE_LIMIT_REACHED', async () => {
    const { owner, boardId, items } = await setupBoard(4);
    for (const item of items.slice(0, 3)) {
      await owner.agent
        .post(`/api/v1/boards/${boardId}/items/${item._id}/votes`)
        .expect(200);
    }
    const fourth = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[3]!._id}/votes`)
      .expect(409);
    expect(fourth.body.error.code).toBe('VOTE_LIMIT_REACHED');
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(3);
  });

  it('hai vote đồng thời khác item khi còn một quota chỉ một thành công', async () => {
    const { owner, boardId, items } = await setupBoard(4);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[1]!._id}/votes`)
      .expect(200);
    const body = {};
    const [first, second] = await Promise.all([
      owner.agent.post(`/api/v1/boards/${boardId}/items/${items[2]!._id}/votes`).send(body),
      owner.agent.post(`/api/v1/boards/${boardId}/items/${items[3]!._id}/votes`).send(body),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const budget = await VoterBudgetModel.findOne({ boardId, userId: owner.user._id }).exec();
    expect(budget?.used).toBe(3);
  });

  it('unvote giảm used; unvote lần hai NOT_VOTED', async () => {
    const { owner, boardId, items } = await setupBoard(1);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    const unvoted = await owner.agent
      .delete(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    expect(unvoted.body.data.item.votes).toHaveLength(0);
    expect(unvoted.body.data.budget.used).toBe(0);
    const second = await owner.agent
      .delete(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(409);
    expect(second.body.error.code).toBe('NOT_VOTED');
  });

  it('owner và member vote được; non-member 404', async () => {
    const { owner, boardId, items } = await setupBoard(1);
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
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    await member.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    await stranger.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/voting.integration.test.ts
```

Expected: FAIL vì route/service vote chưa tồn tại.

- [ ] **Step 3: Tạo voting service**

`apps/api/src/modules/votes/voting.service.ts`:

```ts
import {
  ALREADY_VOTED_CODE,
  NOT_VOTED_CODE,
  VOTE_LIMIT_REACHED_CODE,
} from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import type { UserDocument } from '../users/user.model.js';
import { VoterBudgetModel, type VoterBudgetDocument } from './voter-budget.model.js';
import { ensureVoterBudget } from './voter-budget.service.js';

export interface VoteResult {
  item: ItemDocument;
  budget: VoterBudgetDocument;
}

function assertObjectId(value: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
  }
}

export async function voteItem(input: {
  board: BoardDocument;
  itemId: string;
  actor: UserDocument;
}): Promise<VoteResult> {
  assertObjectId(input.itemId);
  const budget = await ensureVoterBudget(
    input.board._id,
    input.actor._id,
    input.board.settings.votingLimit,
  );
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const item = await ItemModel.findOne({
          _id: input.itemId,
          boardId: input.board._id,
          type: 'note',
        }).session(session);
        if (!item) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
        if (item.votes.some((vote) => vote.userId.equals(input.actor._id))) {
          throw new AppError(409, ALREADY_VOTED_CODE, 'Bạn đã vote item này');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            'votes.userId': { $ne: input.actor._id },
          },
          {
            $push: {
              votes: { userId: input.actor._id, createdAt: new Date() },
            },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          throw new AppError(409, ALREADY_VOTED_CODE, 'Bạn đã vote item này');
        }

        const updatedBudget = await VoterBudgetModel.findOneAndUpdate(
          {
            _id: budget._id,
            boardId: input.board._id,
            userId: input.actor._id,
            used: { $lt: budget.limit },
          },
          { $inc: { used: 1, version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedBudget) {
          throw new AppError(409, VOTE_LIMIT_REACHED_CODE, 'Bạn đã dùng hết phiếu');
        }

        return { item: updatedItem, budget: updatedBudget };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );
    if (!result) {
      throw new AppError(503, 'TRANSACTION_OUTCOME_UNKNOWN', 'Không xác định kết quả');
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function unvoteItem(input: {
  board: BoardDocument;
  itemId: string;
  actor: UserDocument;
}): Promise<VoteResult> {
  assertObjectId(input.itemId);
  const budget = await ensureVoterBudget(
    input.board._id,
    input.actor._id,
    input.board.settings.votingLimit,
  );
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const item = await ItemModel.findOne({
          _id: input.itemId,
          boardId: input.board._id,
          type: 'note',
        }).session(session);
        if (!item) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
        if (!item.votes.some((vote) => vote.userId.equals(input.actor._id))) {
          throw new AppError(409, NOT_VOTED_CODE, 'Bạn chưa vote item này');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            'votes.userId': input.actor._id,
          },
          { $pull: { votes: { userId: input.actor._id } } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          throw new AppError(409, NOT_VOTED_CODE, 'Bạn chưa vote item này');
        }

        const updatedBudget = await VoterBudgetModel.findOneAndUpdate(
          {
            _id: budget._id,
            boardId: input.board._id,
            userId: input.actor._id,
            used: { $gt: 0 },
          },
          { $inc: { used: -1, version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedBudget) {
          throw new AppError(409, NOT_VOTED_CODE, 'Không thể hoàn phiếu');
        }

        return { item: updatedItem, budget: updatedBudget };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );
    if (!result) {
      throw new AppError(503, 'TRANSACTION_OUTCOME_UNKNOWN', 'Không xác định kết quả');
    }
    return result;
  } finally {
    await session.endSession();
  }
}
```

- [ ] **Step 4: Thêm route vote/unvote**

Trong `apps/api/src/modules/items/item.router.ts`, import:

```ts
import { voteItem, unvoteItem } from '../votes/voting.service.js';
```

Thêm trước `return router;`:

```ts
  router.post('/:itemId/votes', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }
    const params = request.params as { itemId?: string };
    if (!params.itemId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
    }
    const result = await voteItem({
      board: request.board,
      itemId: params.itemId,
      actor: request.user,
    });
    response.json({
      data: {
        item: serializeItem(result.item),
        budget: { used: result.budget.used, limit: result.budget.limit },
      },
      meta: { requestId: request.requestId },
    });
  });

  router.delete('/:itemId/votes', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }
    const params = request.params as { itemId?: string };
    if (!params.itemId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
    }
    const result = await unvoteItem({
      board: request.board,
      itemId: params.itemId,
      actor: request.user,
    });
    response.json({
      data: {
        item: serializeItem(result.item),
        budget: { used: result.budget.used, limit: result.budget.limit },
      },
      meta: { requestId: request.requestId },
    });
  });
```

- [ ] **Step 5: Chạy test vote**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/voting.integration.test.ts test/vote-budgets.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/votes/voting.service.ts apps/api/src/modules/items/item.router.ts apps/api/test/voting.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add transactional voting"
```

---

### Task 4: Vote results aggregation API

**Files:**
- Create: `apps/api/src/modules/votes/vote.router.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Modify: `apps/api/src/modules/votes/voting.service.ts`
- Test: `apps/api/test/vote-results.integration.test.ts`

**Interfaces:**
- Consumes: `voteResultsQuerySchema`, `VoteResultsDto`, `VoterBudgetModel`, `ItemModel`.
- Produces: `GET /api/v1/boards/:boardId/votes/results`.

- [ ] **Step 1: Viết test results thất bại**

Tạo `apps/api/test/vote-results.integration.test.ts`:

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
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Results' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: Array.from({ length: 3 }, (_, index) => ({
        shapeId: `shape:result-${index}`,
        type: 'note',
        content: `Result note ${index}`,
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
  return { owner, boardId, items: sync.body.data as Array<{ _id: string }> };
}

describe('vote results', () => {
  it('trả voteCount, voters, usage và viewer', async () => {
    const { owner, boardId, items } = await setup();
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[0]!._id}/votes`)
      .expect(200);
    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${items[1]!._id}/votes`)
      .expect(200);

    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/votes/results`)
      .expect(200);
    expect(response.body.data.items[0]).toMatchObject({ voteCount: 1 });
    expect(response.body.data.items[0].voters).toContain(owner.user._id);
    expect(response.body.data.usage[0]).toMatchObject({
      userId: owner.user._id,
      used: 2,
      limit: 3,
    });
    expect(response.body.data.viewer).toMatchObject({ used: 2, limit: 3 });
  });

  it('item không vote voteCount 0 và limit áp đúng', async () => {
    const { owner, boardId } = await setup();
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/votes/results?limit=1`)
      .expect(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].voteCount).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/vote-results.integration.test.ts
```

Expected: FAIL 404 vì route results chưa mount.

- [ ] **Step 3: Thêm results service**

Trong `apps/api/src/modules/votes/voting.service.ts`, import `VoteResultsDto`:

```ts
import type { VoteResultsDto } from '@nextask/contracts';
```

Thêm cuối file:

```ts
export async function getVoteResults(
  board: BoardDocument,
  viewerId: Types.ObjectId,
  limit: number,
): Promise<VoteResultsDto> {
  const [items, budgets] = await Promise.all([
    ItemModel.aggregate<{
      itemId: Types.ObjectId;
      shapeId: string;
      content: string;
      voteCount: number;
      voters: Types.ObjectId[];
      promotedTaskId: Types.ObjectId | null;
      createdAt: Date;
    }>([
      { $match: { boardId: board._id, type: 'note' } },
      {
        $project: {
          itemId: '$_id',
          shapeId: 1,
          content: 1,
          voteCount: { $size: '$votes' },
          voters: '$votes.userId',
          promotedTaskId: 1,
          createdAt: 1,
          _id: 0,
        },
      },
      { $sort: { voteCount: -1, createdAt: 1, itemId: 1 } },
      { $limit: limit },
    ]).exec(),
    VoterBudgetModel.find({ boardId: board._id }).sort({ used: -1, userId: 1 }).exec(),
  ]);

  const ensureViewer = await ensureVoterBudget(
    board._id,
    viewerId,
    board.settings.votingLimit,
  );
  const usage = budgets.map((budget) => ({
    userId: budget.userId.toHexString(),
    used: budget.used,
    limit: budget.limit,
  }));
  const viewer = usage.find((entry) => entry.userId === viewerId.toHexString()) ?? {
    userId: viewerId.toHexString(),
    used: ensureViewer.used,
    limit: ensureViewer.limit,
  };

  return {
    items: items.map((item) => ({
      itemId: item.itemId.toHexString(),
      shapeId: item.shapeId,
      content: item.content,
      voteCount: item.voteCount,
      voters: item.voters.map((id) => id.toHexString()),
      promotedTaskId: item.promotedTaskId?.toHexString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    usage,
    viewer,
  };
}
```

- [ ] **Step 4: Tạo vote router và mount**

`apps/api/src/modules/votes/vote.router.ts`:

```ts
import { voteResultsQuerySchema } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { getVoteResults } from './voting.service.js';

export function createVotesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/results', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }
    const query = voteResultsQuerySchema.parse(request.query);
    const data = await getVoteResults(request.board, request.user._id, query.limit);
    response.json({ data, meta: { requestId: request.requestId } });
  });

  return router;
}
```

Trong `apps/api/src/modules/boards/board.router.ts`:

```ts
import { createVotesRouter } from '../votes/vote.router.js';
```

```ts
  router.use('/:boardId/votes', createVotesRouter());
```

- [ ] **Step 5: Chạy test results**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/vote-results.integration.test.ts test/voting.integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/votes/vote.router.ts apps/api/src/modules/boards/board.router.ts apps/api/src/modules/votes/voting.service.ts apps/api/test/vote-results.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: expose vote results aggregation"
```

---

### Task 5: Reports aggregation, endpoint và explain test

**Files:**
- Create: `apps/api/src/modules/reports/report.pipeline.ts`
- Create: `apps/api/src/modules/reports/report.service.ts`
- Create: `apps/api/src/modules/reports/report.router.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Test: `apps/api/test/reports.integration.test.ts`
- Test: `apps/api/test/report-explain.integration.test.ts`

**Interfaces:**
- Consumes: `reportQuerySchema`, `BoardDocument`, `ItemModel`, `TaskModel`.
- Produces:
  - `buildUnpromotedIdeasPipeline(input)`.
  - `buildStalledTasksPipeline(input)`.
  - `getStalledIdeasReport(board, options)`.
  - `GET /api/v1/boards/:boardId/reports/stalled-ideas`.

Ghi chú thiết kế: `$facet` không chạy trực tiếp trên hai collection khác nhau. Service dùng
**hai aggregation song song** (`items` và `tasks`) rồi gộp response. Điều này giữ nguyên
response shape và tránh `$unionWith` phức tạp; spec được ghi điều chỉnh ở Task 9.

- [ ] **Step 1: Viết test report thất bại**

Tạo `apps/api/test/reports.integration.test.ts`:

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

async function setup() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Reports' }).expect(201);
  const boardId = board.body.data._id as string;
  const sync = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({
      items: [
        {
          shapeId: 'shape:idea',
          type: 'note',
          content: 'Idea nhiều vote',
          style: {},
          props: {},
          position: { x: 10, y: 10 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a1',
          parentFrameId: null,
          expectedVersion: 0,
        },
        {
          shapeId: 'shape:promoted',
          type: 'note',
          content: 'Idea đã promote',
          style: {},
          props: {},
          position: { x: 220, y: 10 },
          size: { w: 200, h: 200 },
          rotation: 0,
          tldrawIndex: 'a2',
          parentFrameId: null,
          expectedVersion: 0,
        },
      ],
    })
    .expect(200);
  const idea = sync.body.data[0] as { _id: string; version: number };
  const promoted = sync.body.data[1] as { _id: string; version: number };

  const member2 = await registerAgent(app, 'vote2@example.com', 'Voter 2');
  const member3 = await registerAgent(app, 'vote3@example.com', 'Voter 3');
  await BoardModel.updateOne(
    { _id: boardId },
    {
      $push: {
        members: {
          $each: [
            { userId: new Types.ObjectId(member2.user._id), role: 'member', joinedAt: new Date() },
            { userId: new Types.ObjectId(member3.user._id), role: 'member', joinedAt: new Date() },
          ],
        },
      },
    },
  );
  for (const voter of [owner, member2, member3]) {
    await voter.agent
      .post(`/api/v1/boards/${boardId}/items/${idea._id}/votes`)
      .expect(200);
  }
  const task = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${promoted._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: promoted.version })
    .expect(201);
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.db.collection('tasks').updateOne(
    { _id: new Types.ObjectId(task.body.data.task._id) },
    { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
  );
  return { owner, boardId, idea, taskId: task.body.data.task._id as string };
}

describe('stalled ideas report', () => {
  it('trả cả hai nhóm và summary', async () => {
    const { owner, boardId } = await setup();
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/reports/stalled-ideas`)
      .expect(200);
    expect(response.body.data.unpromotedIdeas[0]).toMatchObject({
      content: 'Idea nhiều vote',
      voteCount: 3,
    });
    expect(response.body.data.stalledTasks[0]).toMatchObject({
      title: 'Idea đã promote',
      columnId: 'todo',
    });
    expect(response.body.data.summary).toEqual({
      unpromotedIdeas: 1,
      stalledTasks: 1,
    });
    expect(response.body.data.params).toMatchObject({
      minVotes: 3,
      stalledDays: 7,
      limit: 50,
    });
  });

  it('override params và loại task Done', async () => {
    const { owner, boardId, taskId } = await setup();
    const task = await owner.agent.get(`/api/v1/boards/${boardId}/tasks`).expect(200);
    const version = task.body.data.find((entry: { _id: string }) => entry._id === taskId).version;
    await owner.agent
      .post(`/api/v1/boards/${boardId}/tasks/${taskId}/move`)
      .send({ columnId: 'done', beforeTaskId: null, expectedVersion: version })
      .expect(200);
    const response = await owner.agent
      .get(`/api/v1/boards/${boardId}/reports/stalled-ideas?minVotes=4&stalledDays=1&limit=1`)
      .expect(200);
    expect(response.body.data.unpromotedIdeas).toHaveLength(0);
    expect(response.body.data.stalledTasks).toHaveLength(0);
    expect(response.body.data.params).toMatchObject({
      minVotes: 4,
      stalledDays: 1,
      limit: 1,
    });
  });
});
```

Tạo `apps/api/test/report-explain.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo } from '../src/db/mongoose.js';
import {
  buildStalledTasksPipeline,
  buildUnpromotedIdeasPipeline,
} from '../src/modules/reports/report.pipeline.js';
import { testLogger } from './helpers/test-db.js';

let connection: Awaited<ReturnType<typeof connectMongo>>;

beforeAll(async () => {
  connection = await connectMongo({
    uri: process.env.MONGODB_EXPLAIN_URI ?? 'mongodb://localhost:27017/nextask_explain_v6',
    logger: testLogger,
  });
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.dropDatabase();
  await connection.db.collection('items').createIndex({
    boardId: 1,
    type: 1,
    promotedTaskId: 1,
  });
  await connection.db.collection('tasks').createIndex({ boardId: 1, lifecycle: 1, createdAt: 1 });
  const boardId = new Types.ObjectId();
  await connection.db.collection('items').insertMany(
    Array.from({ length: 1000 }, (_, index) => ({
      boardId,
      shapeId: `shape:explain-${index}`,
      type: 'note',
      content: `Idea ${index}`,
      style: {},
      props: {},
      position: { x: index, y: 0 },
      size: { w: 200, h: 200 },
      rotation: 0,
      tldrawIndex: `a${index}`,
      parentFrameId: null,
      authorId: new Types.ObjectId(),
      votes: [{ userId: new Types.ObjectId(), createdAt: new Date() }],
      promotedTaskId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  await connection.db.collection('tasks').insertMany(
    Array.from({ length: 1000 }, (_, index) => ({
      boardId,
      columnId: 'todo',
      order: `a${index}`,
      title: `Task ${index}`,
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
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })),
  );
});

afterAll(async () => {
  if (connection.db) await connection.dropDatabase();
  await connection.close();
});

describe('report explain', () => {
  it('hai pipeline dùng report indexes', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');
    const boardId = (await connection.db.collection('items').findOne({}))?.boardId;
    if (!boardId) throw new Error('Thiếu item');

    const ideaExplain = await connection.db
      .collection('items')
      .aggregate(
        buildUnpromotedIdeasPipeline({ boardId, minVotes: 1, limit: 50 }),
        { explain: true },
      );
    const stalledExplain = await connection.db
      .collection('tasks')
      .aggregate(
        buildStalledTasksPipeline({
          boardId,
          stalledDays: 7,
          limit: 50,
          doneColumnIds: ['done'],
        }),
        { explain: true },
      );

    expect(JSON.stringify(ideaExplain)).toContain('items_board_type_promoted');
    expect(JSON.stringify(stalledExplain)).toContain('tasks_board_lifecycle_created');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/reports.integration.test.ts test/report-explain.integration.test.ts
```

Expected: FAIL vì pipeline/service/route chưa tồn tại.

- [ ] **Step 3: Tạo pipeline builders**

`apps/api/src/modules/reports/report.pipeline.ts`:

```ts
import type { PipelineStage, Types } from 'mongoose';

export interface UnpromotedIdeasPipelineInput {
  boardId: Types.ObjectId;
  minVotes: number;
  limit: number;
}

export function buildUnpromotedIdeasPipeline(
  input: UnpromotedIdeasPipelineInput,
): PipelineStage[] {
  return [
    {
      $match: {
        boardId: input.boardId,
        type: 'note',
        promotedTaskId: null,
      },
    },
    { $addFields: { voteCount: { $size: '$votes' } } },
    { $match: { voteCount: { $gte: input.minVotes } } },
    {
      $lookup: {
        from: 'tasks',
        let: { itemId: '$_id', boardId: '$boardId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$sourceItemId', '$$itemId'] },
                  { $eq: ['$boardId', '$$boardId'] },
                  { $eq: ['$lifecycle', 'active'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'activeTasks',
      },
    },
    { $match: { activeTasks: { $size: 0 } } },
    { $sort: { voteCount: -1, createdAt: 1, _id: 1 } },
    { $limit: input.limit },
    {
      $project: {
        itemId: '$_id',
        shapeId: 1,
        content: 1,
        voteCount: 1,
        createdAt: 1,
        _id: 0,
      },
    },
  ];
}

export interface StalledTasksPipelineInput {
  boardId: Types.ObjectId;
  stalledDays: number;
  limit: number;
  doneColumnIds: string[];
}

export function buildStalledTasksPipeline(input: StalledTasksPipelineInput): PipelineStage[] {
  const cutoff = new Date(Date.now() - input.stalledDays * 24 * 60 * 60 * 1000);
  return [
    {
      $match: {
        boardId: input.boardId,
        lifecycle: 'active',
        sourceItemId: { $ne: null },
        columnId: { $nin: input.doneColumnIds },
        createdAt: { $lte: cutoff },
      },
    },
    {
      $lookup: {
        from: 'items',
        localField: 'sourceItemId',
        foreignField: '_id',
        as: 'sourceItem',
      },
    },
    { $unwind: { path: '$sourceItem', preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $limit: input.limit },
    {
      $project: {
        taskId: '$_id',
        title: 1,
        columnId: 1,
        createdAt: 1,
        sourceItem: {
          itemId: '$sourceItem._id',
          shapeId: '$sourceItem.shapeId',
          content: '$sourceItem.content',
        },
        _id: 0,
      },
    },
  ];
}
```

- [ ] **Step 4: Tạo report service và router**

`apps/api/src/modules/reports/report.service.ts`:

```ts
import type { StalledIdeasReportDto } from '@nextask/contracts';
import type { Types } from 'mongoose';
import { ItemModel } from '../items/item.model.js';
import { TaskModel } from '../tasks/task.model.js';
import type { BoardDocument } from '../boards/board.model.js';
import {
  buildStalledTasksPipeline,
  buildUnpromotedIdeasPipeline,
} from './report.pipeline.js';

export interface ReportOptions {
  minVotes: number;
  stalledDays: number;
  limit: number;
}

interface IdeaRow {
  itemId: Types.ObjectId;
  shapeId: string;
  content: string;
  voteCount: number;
  createdAt: Date;
}

interface TaskRow {
  taskId: Types.ObjectId;
  title: string;
  columnId: string;
  createdAt: Date;
  sourceItem?: {
    itemId: Types.ObjectId;
    shapeId: string;
    content: string;
  };
}

export async function getStalledIdeasReport(
  board: BoardDocument,
  options: ReportOptions,
): Promise<StalledIdeasReportDto> {
  const doneColumnIds = board.columns.filter((column) => column.isDone).map((column) => column.id);
  const [ideas, tasks] = await Promise.all([
    ItemModel.aggregate<IdeaRow>(
      buildUnpromotedIdeasPipeline({
        boardId: board._id,
        minVotes: options.minVotes,
        limit: options.limit,
      }),
    ).exec(),
    TaskModel.aggregate<TaskRow>(
      buildStalledTasksPipeline({
        boardId: board._id,
        stalledDays: options.stalledDays,
        limit: options.limit,
        doneColumnIds,
      }),
    ).exec(),
  ]);

  const unpromotedIdeas = ideas.map((idea) => ({
    itemId: idea.itemId.toHexString(),
    shapeId: idea.shapeId,
    content: idea.content,
    voteCount: idea.voteCount,
    createdAt: idea.createdAt.toISOString(),
  }));
  const stalledTasks = tasks.map((task) => ({
    taskId: task.taskId.toHexString(),
    title: task.title,
    columnId: task.columnId,
    createdAt: task.createdAt.toISOString(),
    sourceItem: task.sourceItem?.itemId
      ? {
          itemId: task.sourceItem.itemId.toHexString(),
          shapeId: task.sourceItem.shapeId,
          content: task.sourceItem.content,
        }
      : null,
  }));

  return {
    unpromotedIdeas,
    stalledTasks,
    summary: {
      unpromotedIdeas: unpromotedIdeas.length,
      stalledTasks: stalledTasks.length,
    },
    params: options,
  };
}
```

`apps/api/src/modules/reports/report.router.ts`:

```ts
import { reportQuerySchema } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { getStalledIdeasReport } from './report.service.js';

export function createReportsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/stalled-ideas', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    const query = reportQuerySchema.parse(request.query);
    const data = await getStalledIdeasReport(request.board, {
      minVotes: query.minVotes ?? request.board.settings.minVotes,
      stalledDays: query.stalledDays ?? request.board.settings.stalledAfterDays,
      limit: query.limit,
    });
    response.json({ data, meta: { requestId: request.requestId } });
  });

  return router;
}
```

Mount trong `apps/api/src/modules/boards/board.router.ts`:

```ts
import { createReportsRouter } from '../reports/report.router.js';
```

```ts
  router.use('/:boardId/reports', createReportsRouter());
```

- [ ] **Step 5: Chạy test report/explain**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/reports.integration.test.ts test/report-explain.integration.test.ts
```

Expected: PASS; explain test tạo/drop DB tạm và thấy index names.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/reports/report.pipeline.ts apps/api/src/modules/reports/report.service.ts apps/api/src/modules/reports/report.router.ts apps/api/src/modules/boards/board.router.ts apps/api/test/reports.integration.test.ts apps/api/test/report-explain.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add stalled ideas report aggregation"
```

### Task 6: Web vote và quota

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/whiteboard/whiteboard.tsx`
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`

**Interfaces:**
- Consumes: `voteResponseSchema`, `voteResultsResponseSchema`, `VoteResultsDto`.
- Produces: `voteItem`, `unvoteItem`, `getVoteResults`; panel vote/quota.

- [ ] **Step 1: API client**

Trong `apps/web/lib/api.ts` import:

```ts
  voteResponseSchema,
  voteResultsResponseSchema,
  type VoteResultsDto,
```

Thêm:

```ts
export async function voteItem(
  boardId: string,
  itemId: string,
): Promise<{ item: ItemDto; budget: { used: number; limit: number } }> {
  return (
    await request(`/boards/${boardId}/items/${itemId}/votes`, voteResponseSchema, {
      method: 'POST',
    })
  ).data;
}

export async function unvoteItem(
  boardId: string,
  itemId: string,
): Promise<{ item: ItemDto; budget: { used: number; limit: number } }> {
  return (
    await request(`/boards/${boardId}/items/${itemId}/votes`, voteResponseSchema, {
      method: 'DELETE',
    })
  ).data;
}

export async function getVoteResults(boardId: string, limit = 50): Promise<VoteResultsDto> {
  const params = new URLSearchParams({ limit: String(limit) });
  return (
    await request(
      `/boards/${boardId}/votes/results?${params.toString()}`,
      voteResultsResponseSchema,
    )
  ).data;
}
```

- [ ] **Step 2: Whiteboard prop/panel**

Trong `whiteboard.tsx` thêm props:

```ts
  currentUserId: string;
  voteUsage: { used: number; limit: number };
  onVote: (item: ItemDto) => Promise<void>;
  onUnvote: (item: ItemDto) => Promise<void>;
```

Trong `whiteboard-canvas.tsx` destructure các prop.

Trong panel single note, sau dòng `selectedTask ? ...` thêm vote block:

```tsx
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-2 py-1.5">
              <span className="text-xs text-stone-600">
                {selectedItem?.votes.length ?? 0} phiếu · {voteUsage.used}/{voteUsage.limit}
              </span>
              {selectedItem ? (
                selectedItem.votes.some((vote) => vote.userId === currentUserId) ? (
                  <button
                    type="button"
                    onClick={() => void onUnvote(selectedItem)}
                    className="rounded-lg bg-stone-700 px-2.5 py-1 text-[11px] font-medium text-white"
                  >
                    Unvote
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={voteUsage.used >= voteUsage.limit}
                    onClick={() => void onVote(selectedItem)}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Vote
                  </button>
                )
              ) : null}
            </div>
```

- [ ] **Step 3: BoardWorkspace vote state/handlers**

Import:

```ts
import { getVoteResults, unvoteItem, voteItem } from '../../lib/api';
```

State:

```ts
  const [voteResults, setVoteResults] = useState<VoteResultsDto | null>(null);
```

Trong `loadWorkspace` Promise.all thêm `getVoteResults(boardId)` và set state:

```ts
      const [board, members, items, taskPage, results] = await Promise.all([
        getBoard(boardId),
        getBoardMembers(boardId),
        getItems(boardId),
        getTasks(boardId),
        getVoteResults(boardId),
      ]);
      setData({ board, members, items, tasks: taskPage.tasks });
      setVoteResults(results);
```

Thêm handler:

```ts
  const handleVote = useCallback(
    async (item: ItemDto, action: 'vote' | 'unvote') => {
      try {
        const result =
          action === 'vote'
            ? await voteItem(boardId, item._id)
            : await unvoteItem(boardId, item._id);
        setData((current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry._id === result.item._id ? result.item : entry,
                ),
              }
            : current,
        );
        setVoteResults((current) =>
          current
            ? {
                ...current,
                viewer: { ...current.viewer, ...result.budget },
                usage: current.usage.map((entry) =>
                  entry.userId === current.viewer.userId
                    ? { ...entry, ...result.budget }
                    : entry,
                ),
              }
            : current,
        );
        setNotice(action === 'vote' ? 'Đã vote ghi chú' : 'Đã bỏ vote');
      } catch (caught) {
        if (caught instanceof ApiClientError) {
          setNotice(caught.message);
          await loadWorkspace();
          return;
        }
        throw caught;
      }
    },
    [boardId, loadWorkspace],
  );
```

Pass props cho Whiteboard:

```tsx
            currentUserId={voteResults?.viewer.userId ?? ''}
            voteUsage={voteResults?.viewer ?? { used: 0, limit: 0 }}
            onVote={(item) => handleVote(item, 'vote')}
            onUnvote={(item) => handleVote(item, 'unvote')}
```

- [ ] **Step 4: Typecheck/build**

```bash
npm run typecheck
npm run build:web
npm run lint
npm run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/whiteboard/whiteboard.tsx apps/web/features/whiteboard/whiteboard-canvas.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add voting UI and quota"
```

---

### Task 7: Report tab UI

**Files:**
- Create: `apps/web/features/workspace/report-panel.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**
- Consumes: `StalledIdeasReportDto`, `getStalledIdeasReport`.
- Produces: tab `Báo cáo` với hai nhóm.

- [ ] **Step 1: API client report**

Trong `apps/web/lib/api.ts` import:

```ts
  reportResponseSchema,
  type StalledIdeasReportDto,
```

Thêm:

```ts
export async function getStalledIdeasReport(
  boardId: string,
): Promise<StalledIdeasReportDto> {
  return (
    await request(`/boards/${boardId}/reports/stalled-ideas`, reportResponseSchema)
  ).data;
}
```

- [ ] **Step 2: Tạo ReportPanel**

`apps/web/features/workspace/report-panel.tsx`:

```tsx
'use client';

import type { StalledIdeasReportDto } from '@nextask/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getStalledIdeasReport } from '../../lib/api';

interface ReportPanelProps {
  boardId: string;
  refreshKey: number;
}

export function ReportPanel({ boardId, refreshKey }: ReportPanelProps) {
  const [report, setReport] = useState<StalledIdeasReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getStalledIdeasReport(boardId));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không tải được báo cáo.');
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
          <h2 className="font-semibold text-stone-900">Báo cáo</h2>
          <p className="text-xs text-stone-500">Ý tưởng chưa hành động và task bị kẹt.</p>
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
        {loading ? <p className="p-3 text-sm text-stone-500">Đang tải báo cáo...</p> : null}
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
        {report && !loading && !error ? (
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Ý tưởng nhiều vote chưa promote ({report.summary.unpromotedIdeas})
              </h3>
              {report.unpromotedIdeas.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Chưa có ý tưởng đủ điều kiện.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.unpromotedIdeas.map((idea) => (
                    <li key={idea.itemId} className="rounded-xl border border-stone-200 p-3">
                      <p className="text-sm text-stone-800">{idea.content || 'Ghi chú trống'}</p>
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {idea.voteCount} phiếu
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Task bị kẹt ({report.summary.stalledTasks})
              </h3>
              {report.stalledTasks.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Không có task bị kẹt.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.stalledTasks.map((task) => (
                    <li key={task.taskId} className="rounded-xl border border-stone-200 p-3">
                      <p className="text-sm text-stone-800">{task.title}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        Cột {task.columnId} · {new Date(task.createdAt).toLocaleDateString('vi-VN')}
                      </p>
                      {task.sourceItem ? (
                        <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                          {task.sourceItem.content}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Tab Báo cáo trong BoardWorkspace**

Import:

```ts
import { ReportPanel } from './report-panel';
```

State sidebarTab:

```ts
  const [sidebarTab, setSidebarTab] = useState<'kanban' | 'activities' | 'reports'>('kanban');
  const [reportRevision, setReportRevision] = useState(0);
```

Thêm button `Báo cáo` cạnh `Hoạt động`; render:

```tsx
            ) : sidebarTab === 'activities' ? (
              <ActivityPanel ... />
            ) : (
              <ReportPanel boardId={boardId} refreshKey={reportRevision} />
            )}
```

Tăng `reportRevision` sau vote/unvote, promote/demote/batch/undo và trong item event
branch của realtime handler; giữ `activityRevision` như cũ.

- [ ] **Step 4: Typecheck/build/lint/format**

```bash
npm run typecheck
npm run build:web
npm run lint
npm run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/report-panel.tsx apps/web/features/workspace/board-workspace.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add stalled ideas report tab"
```

---

### Task 8: Browser verification và explain evidence

**Files:**
- Modify: `docs/session-log.md`
- Modify: `docs/phases/06-voting-reports.md`

**Interfaces:**
- Consumes: vote/results/report API/UI.
- Produces: browser evidence, explain numbers.

- [ ] **Step 1: Docker rebuild**

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: healthy, health `0.5.0`; app DB áp 006.

- [ ] **Step 2: Browser vote/quota**

Dùng browser-use một tab; tạo board tạm `Phase 6 E2E` và 4 note bằng fetch như các
phase trước; mở board.

1. Chọn note 1: panel hiện `0 phiếu · 0/3`.
2. Bấm Vote: count `1`, quota `1/3`; item version không đổi (kiểm tra DB/network).
3. Vote note 2, 3; note 4 nút Vote disabled vì quota đủ.
4. Unvote note 1: count 0, quota 2/3.
5. Reload: trạng thái vote/quota giữ.

- [ ] **Step 3: Browser report**

1. Mở tab `Báo cáo`: thấy hai nhóm và summary.
2. Tạo task từ note có vote (promote) và kéo một task sang Done; report refresh:
   note promoted rời nhóm unpromoted; task Done không vào stalledTasks.
3. Tạo task cũ hơn 7 ngày bằng DB/seed tạm, mở report: task vào stalledTasks.
4. Không có lỗi console/500.

- [ ] **Step 4: Explain evidence**

Trên DB `nextask_explain_v6` (test explain đã tạo/drop), chạy lại bằng test
`report-explain.integration.test.ts` hoặc script tương đương; ghi `totalKeysExamined`,
`totalDocsExamined`, `executionTimeMillis` của pipeline report và query Kanban vào
`docs/mongodb-notes.md`. Drop DB tạm sau khi đo.

- [ ] **Step 5: Cleanup**

Đóng tab board tạm, chờ grace, xóa board/items/tasks/activities/checkpoints/voter_budgets
của board tạm; giữ board thật. Ghi counts.

- [ ] **Step 6: Evidence docs**

Thêm session log:

```markdown
## 2026-11-17 - Phase 6 verification

- Browser: vote/unvote, quota 3, disable khi hết; reload giữ.
- Report tab: unpromoted ideas + stalled tasks + summary; promote/Done loại đúng nhóm.
- Explain report pipeline ghi vào MongoDB notes; DB tạm đã drop.
- Board tạm và budget/checkpoint đã xóa; health 0.5.0.
```

Cập nhật spec trước Tiêu chí chấp nhận.

- [ ] **Step 7: Commit**

```bash
git add docs/session-log.md docs/phases/06-voting-reports.md docs/mongodb-notes.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 6 verification"
```

---

### Task 9: Gates, docs và merge release/v0.6

**Files:**
- Modify: `docs/phases/06-voting-reports.md`
- Modify: `docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: code, migration, browser/explain evidence.
- Produces: Phase 6 trên `release/v0.6`; feature xóa; main/tag v0.5.0 không đổi.

- [ ] **Step 1: Cập nhật docs**

- Spec: hoàn thành, kết quả voting/report/explain, merge commit.
- Plan: trạng thái thực thi, commit list, điều chỉnh.
- Architecture: Phase 6 voting/quota/report đã có; vote không tăng item.version.
- MongoDB notes: budget backfill, vote transaction, aggregation/explain.
- README: voting, quota, report tab, migration 006/backup.
- Git workflow: release/v0.6, feature merge/xóa, main/tag v0.5.0.
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
git add docs/phases/06-voting-reports.md docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 6 verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.6
git merge --no-ff feat/phase-6-voting-reports -m "merge: phase 6 voting and reports"
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
gate release; commit trên `release/v0.6`:

```bash
git add docs/phases/06-voting-reports.md docs/superpowers/plans/2026-11-17-phase-6-voting-reports.md docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 6 release merge"
git branch -d feat/phase-6-voting-reports
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: `main` vẫn `3bf6d66`; tag `v0.2.0`–`v0.5.0`; release chứa Phase 6.

- [ ] **Step 7: Không merge main/không bump 0.6.0**

Không chạy merge `release/v0.6` vào `main`. Ghi trạng thái chờ duyệt phát hành v0.6;
version `0.5.0` và tag `v0.5.0` giữ nguyên.

---

## Self-review checklist

- Spec coverage:
  - Contracts vote/results/report: Task 1.
  - Migration 006/budget/backfill/report indexes: Task 2.
  - Vote/unvote transaction: Task 3.
  - Results aggregation: Task 4.
  - Reports aggregation/explain: Task 5.
  - Web vote/quota: Task 6.
  - Web report tab: Task 7.
  - Browser/explain evidence: Task 8.
  - Gates/docs/merge: Task 9.
- Vote không tăng item.version; budget used/limit/version đúng.
- Không activity từng vote; không event realtime mới.
- Report lọc promoted/Done/stalled đúng; limit từng nhóm.
- Type/field thống nhất: `VoteResultsDto`, `StalledIdeasReportDto`,
  `ensureVoterBudget`, `voteItem`, `unvoteItem`, `getVoteResults`,
  `getStalledIdeasReport`, `buildStalledIdeasPipeline`.
- Không task nào merge `main`, bump `0.6.0` hoặc tạo tag mới.
