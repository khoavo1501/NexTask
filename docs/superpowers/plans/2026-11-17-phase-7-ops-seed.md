# NexTask Phase 7 - Ops, Seed and Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm seed demo idempotent, profiler scripts, backup/restore drill và hoàn thiện README/test/docs cho v0.7.

**Architecture:** Seed demo reset duy nhất board `NexTask Demo Retro` trong app DB. Profiler dùng `system.profile` level 1/slowms 100 qua script on/report/off. Backup dùng mongodump archive-gzip; restore drill vào `nextask_restore_drill`, so counts rồi drop. Không đổi schema/API.

**Tech Stack:** Node 26, TypeScript 6.0.3, MongoDB 8.0, mongosh/mongodump trong Docker Compose, Mongoose 9.11.4, Vitest 5.0.5.

**Spec:** `docs/phases/07-ops-seed.md`

**Branch:** `feat/phase-7-ops-seed` từ `release/v0.7`; release tạo từ `main` tại `2c79479` (v0.6.0). Không merge `main`, không bump `0.7.0`, tag `v0.6.0` giữ nguyên.

**Trạng thái thực thi:** Hoàn thành; đã merge vào `release/v0.7` (`1962ebf`) và phát hành
`0.7.0` trên `main` tại `f1fd124`; feature branch đã xóa. Commit chính:

- `fa7965a` `docs: specify phase 7 ops and seed`
- `44d8dbf` `docs: plan phase 7 ops and seed`
- `73de128` `feat: add idempotent demo seed`
- `c5c2f7c` `feat: add database profiler scripts`
- `f8d032a` `feat: add backup and restore drill scripts`
- `e9b2fd3` `docs: record phase 7 verification`
- `9791e2f` `chore: format demo seed`
- `cced579` `docs: record phase 7 verification`
- `1962ebf` `merge: phase 7 ops and seed` vào `release/v0.7`
- `d2f8fba` `chore: prepare v0.7.0 release`
- `f1fd124` `release: v0.7 ops and seed` vào `main`

Release gate: typecheck/lint/format pass; full suite 38 file, 164 test ba lần
30.02/30.49/32.60 s. Main gate: 30.09/35.36/30.05 s; Docker health `0.7.0`.

Feature gate: typecheck/lint/format pass; full suite 38 file, 164 test ba lần
30.08/30.42/30.12 s.

**Điều chỉnh thực tế:** seed shapeId phải có prefix `shape:` để tldraw dựng lại; profiler
report dùng slow probe có kiểm soát để có evidence trên ngưỡng 100ms.


## Global Constraints

- Không migration/schema change; app DB giữ 001–006.
- Seed chỉ reset board demo `NexTask Demo Retro` thuộc seed owner; board khác bất biến.
- Restore drill chỉ vào `nextask_restore_drill`; không ghi đè `nextask`.
- Profiler chỉ level 1/slowms 100; tắt sau đo; không level 2.
- Backup archive-gzip; `gzip -t`; không xóa backup cũ.
- Không thêm API/UI nghiệp vụ; chỉ script/seed/docs.
- Không bump `0.7.0`; không merge `main`; tag `v0.6.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
- Stage đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Full suite pass ba lần trước merge; không nới timeout.

---

## File Structure

- `apps/api/src/db/seed-demo.ts` — seed idempotent + CLI.
- `apps/api/test/seed-demo.integration.test.ts` — seed/report/idempotency test.
- `apps/api/package.json` — script `db:seed`.
- `package.json` — root scripts db:seed/profiler/backup/restore.
- `scripts/db-profiler.sh` — on/report/off.
- `scripts/db-backup.sh` — archive backup.
- `scripts/db-restore-drill.sh` — restore temp + verify + drop.
- `README.md`, `docs/phases/07-ops-seed.md`, `docs/session-log.md`,
  `docs/architecture.md`, `docs/mongodb-notes.md`, `docs/git-workflow.md`.

---

### Task 0: Docs baseline

**Files:**
- Modify: `docs/session-log.md`
- Create: `docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md`

- [ ] **Step 1: Xác nhận nhánh**

```bash
git status --short --branch
git log --oneline -1
```

Expected: `feat/phase-7-ops-seed`; không có file dirty ngoài plan.

- [ ] **Step 2: Session log**

Thêm cuối `docs/session-log.md`:

```markdown
## 2026-11-17 - Phase 7 plan

- Spec `docs/phases/07-ops-seed.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md`.
- Phạm vi: seed demo idempotent, profiler, backup/restore drill, README/test.
- Bắt đầu Inline Execution; không merge `main`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/session-log.md docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 7 ops and seed"
```

---

### Task 1: Seed demo idempotent

**Files:**
- Create: `apps/api/src/db/seed-demo.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Test: `apps/api/test/seed-demo.integration.test.ts`

**Interfaces:**
- Consumes: `BoardModel`, `ItemModel`, `TaskModel`, `ActivityModel`,
  `VoterBudgetModel`, `UserModel`, `hashPassword`, `normalizeEmail`.
- Produces:
  - `seedDemoBoard(ownerEmail: string): Promise<SeedSummary>`.
  - `npm run db:seed`.

- [ ] **Step 1: Viết test seed thất bại**

Tạo `apps/api/test/seed-demo.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { normalizeEmail } from '../src/modules/auth/auth.service.js';
import { BoardModel, DEFAULT_COLUMNS } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
import { getStalledIdeasReport } from '../src/modules/reports/report.service.js';
import { seedDemoBoard } from '../src/db/seed-demo.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const ownerEmail = 'owner@nextask.local';
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

async function setupOwner() {
  const owner = await UserModel.create({
    email: ownerEmail,
    emailNormalized: normalizeEmail(ownerEmail),
    name: 'Demo Owner',
    passwordHash: await hashPassword('nextask-local-owner-2026'),
  });
  const realBoard = await BoardModel.create({
    name: 'Real Board',
    ownerId: owner._id,
    members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
  });
  return { owner, realBoard };
}

describe('seed demo', () => {
  it('idempotent và không đụng board thật', async () => {
    const { owner, realBoard } = await setupOwner();
    const first = await seedDemoBoard(ownerEmail);
    const demoBoard = await BoardModel.findOne({
      name: 'NexTask Demo Retro',
      ownerId: owner._id,
    }).exec();
    expect(demoBoard).not.toBeNull();
    const demoId = demoBoard!._id;
    const firstCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
    expect(firstCounts).toEqual({ items: 9, tasks: 5, activities: 4, budgets: 3 });
    expect(first.boardId).toBe(demoId.toHexString());

    const second = await seedDemoBoard(ownerEmail);
    const secondCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
    expect(secondCounts).toEqual(firstCounts);
    expect(second.boardId).toBe(first.boardId);
    expect(await BoardModel.countDocuments({ _id: realBoard._id })).toBe(1);
    expect(await ItemModel.countDocuments({ boardId: realBoard._id })).toBe(0);
  });

  it('đủ dữ liệu report và quota', async () => {
    const { owner } = await setupOwner();
    await seedDemoBoard(ownerEmail);
    const demo = await BoardModel.findOne({
      name: 'NexTask Demo Retro',
      ownerId: owner._id,
    }).exec();
    expect(demo).not.toBeNull();
    const report = await getStalledIdeasReport(demo!, {
      minVotes: 3,
      stalledDays: 7,
      limit: 50,
    });
    expect(report.unpromotedIdeas.some((idea) => idea.content.includes('Stop') && idea.voteCount === 3)).toBe(true);
    expect(report.stalledTasks.some((task) => task.title.includes('Start'))).toBe(true);

    const budgets = await VoterBudgetModel.find({ boardId: demo!._id }).exec();
    const ownerBudget = budgets.find((budget) => budget.userId.equals(owner._id));
    expect(ownerBudget?.used).toBe(2);
    expect(budgets.every((budget) => budget.limit === 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api -- test/seed-demo.integration.test.ts
```

Expected: FAIL vì `seedDemoBoard` chưa tồn tại.

- [ ] **Step 3: Tạo seed service/CLI**

`apps/api/src/db/seed-demo.ts`:

```ts
import mongoose from 'mongoose';
import { hashPassword } from '../modules/auth/password.js';
import { normalizeEmail } from '../modules/auth/auth.service.js';
import { ActivityModel } from '../modules/activities/activity.model.js';
import { DEFAULT_COLUMNS, BoardModel } from '../modules/boards/board.model.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';
import { UserModel, type UserDocument } from '../modules/users/user.model.js';
import { VoterBudgetModel } from '../modules/votes/voter-budget.model.js';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { loadRootEnvFile } from '../config/load-env-file.js';
import { createLogger } from '../lib/logger.js';
import { connectMongo } from './mongoose.js';

export const DEMO_BOARD_NAME = 'NexTask Demo Retro';
const DEMO_MEMBER_PASSWORD = 'demo-only-password-2026';

interface SeedSummary {
  boardId: string;
  items: number;
  tasks: number;
  activities: number;
  budgets: number;
}

interface DemoMember {
  email: string;
  name: string;
}

const demoMembers: DemoMember[] = [
  { email: 'demo.member1@nextask.local', name: 'Demo Member 1' },
  { email: 'demo.member2@nextask.local', name: 'Demo Member 2' },
];

const notes = [
  { shapeId: 'seed:start-1', content: 'Start: chia sẻ context sớm', color: 'yellow', x: 0, y: 0 },
  { shapeId: 'seed:start-2', content: 'Start: chốt scope trong ngày', color: 'blue', x: 0, y: 240 },
  { shapeId: 'seed:start-3', content: 'Start: demo sớm', color: 'green', x: 0, y: 480 },
  { shapeId: 'seed:stop-1', content: 'Stop: họp quá dài', color: 'red', x: 300, y: 0 },
  { shapeId: 'seed:stop-2', content: 'Stop: task không có owner', color: 'yellow', x: 300, y: 240 },
  { shapeId: 'seed:stop-3', content: 'Stop: blocker không được nêu', color: 'blue', x: 300, y: 480 },
  { shapeId: 'seed:continue-1', content: 'Continue: pair review', color: 'green', x: 600, y: 0 },
  { shapeId: 'seed:continue-2', content: 'Continue: viết note ngắn', color: 'red', x: 600, y: 240 },
  { shapeId: 'seed:continue-3', content: 'Continue: cập nhật Kanban', color: 'yellow', x: 600, y: 480 },
];

async function ensureUser(email: string, name: string): Promise<UserDocument> {
  const normalized = normalizeEmail(email);
  const existing = await UserModel.findOne({ emailNormalized: normalized }).exec();
  if (existing) return existing;
  return UserModel.create({
    email,
    emailNormalized: normalized,
    name,
    passwordHash: await hashPassword(DEMO_MEMBER_PASSWORD),
  });
}

export async function seedDemoBoard(ownerEmail: string): Promise<SeedSummary> {
  const owner = await UserModel.findOne({
    emailNormalized: normalizeEmail(ownerEmail),
  }).exec();
  if (!owner) throw new Error(`Không tìm thấy seed owner ${ownerEmail}`);

  const members = [owner];
  for (const member of demoMembers) {
    members.push(await ensureUser(member.email, member.name));
  }

  let board = await BoardModel.findOne({
    name: DEMO_BOARD_NAME,
    ownerId: owner._id,
  }).exec();
  if (!board) {
    board = await BoardModel.create({
      name: DEMO_BOARD_NAME,
      ownerId: owner._id,
      members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
      columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
  } else {
    await BoardModel.updateOne(
      { _id: board._id },
      {
        $set: {
          settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
          columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
        },
      },
    );
  }

  const existingMemberIds = new Set(board.members.map((member) => member.userId.toHexString()));
  const membersToAdd = members
    .filter((member) => !existingMemberIds.has(member._id.toHexString()))
    .map((member) => ({
      userId: member._id,
      role: 'member' as const,
      joinedAt: new Date(),
    }));
  if (membersToAdd.length > 0) {
    await BoardModel.updateOne({ _id: board._id }, { $push: { members: { $each: membersToAdd } } });
    board = await BoardModel.findById(board._id).exec();
    if (!board) throw new Error('Không đọc lại được board demo');
  }

  const ownerId = owner._id;
  const memberIds = members.map((member) => member._id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(
      async () => {
        await ActivityModel.deleteMany({ boardId: board._id }, { session });
        await VoterBudgetModel.deleteMany({ boardId: board._id }, { session });
        await TaskModel.deleteMany({ boardId: board._id }, { session });
        await ItemModel.deleteMany({ boardId: board._id }, { session });

        const createdItems = await ItemModel.create(
          notes.map((note, index) => ({
            boardId: board._id,
            shapeId: note.shapeId,
            type: 'note' as const,
            content: note.content,
            style: { color: note.color },
            props: { color: note.color },
            position: { x: note.x, y: note.y },
            size: { w: 200, h: 200 },
            rotation: 0,
            tldrawIndex: `a${index + 1}`,
            parentFrameId: null,
            authorId: ownerId,
            votes:
              note.shapeId === 'seed:stop-2'
                ? memberIds.map((userId) => ({ userId, createdAt: new Date() }))
                : note.shapeId === 'seed:continue-2'
                  ? [{ userId: ownerId, createdAt: new Date() }]
                  : [],
            promotedTaskId: null,
            version: 1,
          })),
          { session, ordered: true },
        );
        const byShape = new Map(createdItems.map((item) => [item.shapeId, item]));

        const taskPayloads = [
          {
            shapeId: 'seed:start-1',
            columnId: 'backlog',
            order: 'a0',
            assigneeId: null,
            priority: 'medium' as const,
            title: 'Demo: chia sẻ context sớm',
          },
          {
            shapeId: 'seed:stop-1',
            columnId: 'todo',
            order: 'a0',
            assigneeId: ownerId,
            priority: 'medium' as const,
            title: 'Demo: họp quá dài',
          },
          {
            shapeId: 'seed:continue-1',
            columnId: 'in-progress',
            order: 'a0',
            assigneeId: null,
            priority: 'high' as const,
            title: 'Demo: pair review',
          },
          {
            shapeId: 'seed:start-2',
            columnId: 'todo',
            order: 'a1',
            assigneeId: null,
            priority: 'medium' as const,
            title: 'Demo: task bị kẹt',
          },
        ];
        const tasks = await TaskModel.create(
          [
            ...taskPayloads.map((payload) => {
              const item = byShape.get(payload.shapeId);
              if (!item) throw new Error(`Thiếu item ${payload.shapeId}`);
              return {
                boardId: board._id,
                columnId: payload.columnId,
                order: payload.order,
                title: payload.title,
                description: item.content,
                assigneeId: payload.assigneeId,
                labels: [],
                priority: payload.priority,
                dueDate: null,
                lifecycle: 'active' as const,
                sourceItemId: item._id,
                origin: {
                  itemId: item._id,
                  frameId: null,
                  position: { x: item.position.x, y: item.position.y },
                  voteCount: item.votes.length,
                  authorId: item.authorId,
                  itemCreatedAt: item.createdAt,
                },
                demotedAt: null,
                demotedBy: null,
                version: 1,
                createdBy: ownerId,
              };
            }),
            {
              boardId: board._id,
              columnId: 'done',
              order: 'a0',
              title: 'Demo: chốt retro',
              description: 'Task tạo tay để demo cột Done',
              assigneeId: ownerId,
              labels: ['demo'],
              priority: 'low' as const,
              dueDate: null,
              lifecycle: 'active' as const,
              sourceItemId: null,
              origin: null,
              demotedAt: null,
              demotedBy: null,
              version: 1,
              createdBy: ownerId,
            },
          ],
          { session, ordered: true },
        );

        for (let index = 0; index < taskPayloads.length; index += 1) {
          const payload = taskPayloads[index];
          const task = tasks[index];
          const item = byShape.get(payload.shapeId);
          if (!payload || !task || !item) throw new Error('Seed task/item thiếu');
          await ItemModel.updateOne(
            { _id: item._id },
            { $set: { promotedTaskId: task._id } },
            { session },
          );
        }

        await ActivityModel.create(
          tasks.slice(0, taskPayloads.length).map((task) => ({
            boardId: board._id,
            actorId: ownerId,
            action: 'item.promoted' as const,
            refs: {
              itemId: task.sourceItemId,
              taskId: task._id,
              columnId: task.columnId,
            },
            snapshot: {
              taskTitle: task.title,
              columnId: task.columnId,
              taskVersionAtPromote: task.version,
              itemVersionAtPromote: 1,
            },
            undoableUntil: null,
          })),
          { session, ordered: true },
        );

        await VoterBudgetModel.create(
          [
            { boardId: board._id, userId: ownerId, used: 2, limit: 3, version: 1 },
            { boardId: board._id, userId: memberIds[1]!, used: 1, limit: 3, version: 1 },
            { boardId: board._id, userId: memberIds[2]!, used: 1, limit: 3, version: 1 },
          ],
          { session, ordered: true },
        );
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );
  } finally {
    await session.endSession();
  }

  const stalled = await TaskModel.findOne({
    boardId: board._id,
    title: 'Demo: task bị kẹt',
  }).exec();
  if (stalled) {
    await TaskModel.collection.updateOne(
      { _id: stalled._id },
      { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
    );
  }

  return {
    boardId: board._id.toHexString(),
    items: await ItemModel.countDocuments({ boardId: board._id }),
    tasks: await TaskModel.countDocuments({ boardId: board._id }),
    activities: await ActivityModel.countDocuments({ boardId: board._id }),
    budgets: await VoterBudgetModel.countDocuments({ boardId: board._id }),
  };
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });
  try {
    const summary = await seedDemoBoard(env.SEED_OWNER_EMAIL ?? 'owner@nextask.local');
    logger.info(summary, 'Demo seed complete');
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```



- [ ] **Step 4: Thêm npm scripts**

`apps/api/package.json`:

```json
"db:seed": "tsx src/db/seed-demo.ts",
```

`package.json`:

```json
"db:seed": "npm run db:seed --workspace @nextask/api",
```

- [ ] **Step 5: Chạy test seed**

```bash
npm run typecheck
npm run test --workspace @nextask/api -- test/seed-demo.integration.test.ts
```

Expected: PASS; seed lần hai counts/boardId không đổi; report/quota đúng.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/seed-demo.ts apps/api/test/seed-demo.integration.test.ts apps/api/package.json package.json
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add idempotent demo seed"
```

---

### Task 2: Profiler scripts

**Files:**
- Create: `scripts/db-profiler.sh`
- Modify: `package.json`

- [ ] **Step 1: Tạo script**

`scripts/db-profiler.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"

case "$command" in
  on)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      db.setProfilingLevel(1, { slowms: 100 });
      printjson(db.getProfilingStatus());
    '
    ;;
  report)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      const rows = db.system.profile
        .find({ millis: { $gte: 100 } })
        .sort({ ts: -1 })
        .limit(20)
        .toArray()
        .map((entry) => ({
          op: entry.op,
          ns: entry.ns,
          millis: entry.millis,
          planSummary: entry.planSummary,
          keysExamined: entry.keysExamined,
          docsExamined: entry.docsExamined,
          ts: entry.ts,
        }));
      printjson(rows);
    '
    ;;
  off)
    docker compose exec -T mongo mongosh --quiet --eval '
      const db = db.getSiblingDB("nextask");
      db.setProfilingLevel(0);
      printjson(db.getProfilingStatus());
    '
    ;;
  *)
    echo "Usage: bash scripts/db-profiler.sh on|report|off" >&2
    exit 1
    ;;
esac
```

```bash
chmod +x scripts/db-profiler.sh
```

- [ ] **Step 2: Thêm npm scripts**

`package.json`:

```json
"db:profiler:on": "bash scripts/db-profiler.sh on",
"db:profiler:report": "bash scripts/db-profiler.sh report",
"db:profiler:off": "bash scripts/db-profiler.sh off",
```

- [ ] **Step 3: Kiểm tra**

```bash
npm run db:profiler:on
# chạy seed/browser hoặc gọi API vài lần
npm run db:profiler:report
npm run db:profiler:off
```

Expected: on level 1/slowms 100; report JSON array; off level 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/db-profiler.sh package.json
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add database profiler scripts"
```

Ghi top slow query vào `docs/mongodb-notes.md` ở Task 4.

---

### Task 3: Backup và restore drill

**Files:**
- Create: `scripts/db-backup.sh`
- Create: `scripts/db-restore-drill.sh`
- Modify: `package.json`

- [ ] **Step 1: Backup script**

`scripts/db-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

label="${1:-manual}"
mkdir -p backups
timestamp="$(date +%Y%m%d-%H%M%S)"
file="backups/nextask-${label}-${timestamp}.gz"

docker compose exec -T mongo mongodump --db nextask --archive --gzip > "$file"
gzip -t "$file"
ls -lh "$file"
```

```bash
chmod +x scripts/db-backup.sh
```

- [ ] **Step 2: Restore drill script**

`scripts/db-restore-drill.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

archive="${1:-$(ls -t backups/nextask-*.gz | head -n 1)}"
if [[ ! -f "$archive" ]]; then
  echo "Không tìm thấy backup: $archive" >&2
  exit 1
fi
gzip -t "$archive"

docker compose exec -T mongo mongosh --quiet --eval '
  db.getSiblingDB("nextask_restore_drill").dropDatabase();
'

docker compose exec -T mongo mongorestore \
  --archive --gzip \
  --nsFrom='nextask.*' --nsTo='nextask_restore_drill.*' < "$archive"

docker compose exec -T mongo mongosh --quiet --eval '
const app = db.getSiblingDB("nextask");
const drill = db.getSiblingDB("nextask_restore_drill");
const names = ["users", "boards", "items", "tasks", "activities", "voter_budgets", "schema_migrations"];
const result = {};
let failed = false;
for (const name of names) {
  const expected = app.getCollection(name).countDocuments();
  const actual = drill.getCollection(name).countDocuments();
  result[name] = { expected, actual };
  if (expected !== actual) failed = true;
}
const sample = drill.boards.findOne({}, { name: 1 });
printjson({ result, sample, failed });
if (failed) quit(2);
drill.dropDatabase();
'
```

```bash
chmod +x scripts/db-restore-drill.sh
```

- [ ] **Step 3: npm scripts**

`package.json`:

```json
"db:backup": "bash scripts/db-backup.sh",
"db:restore-drill": "bash scripts/db-restore-drill.sh",
```

- [ ] **Step 4: Chạy drill**

```bash
npm run db:backup -- phase7
npm run db:restore-drill
docker compose exec -T mongo mongosh --quiet --eval 'print(db.getSiblingDB("nextask_restore_drill").getCollectionNames().length)'
```

Expected: backup file gzip hợp lệ; counts bằng nhau; `failed: false`; DB drill drop
(`getCollectionNames().length` = 0); app DB không đổi.

- [ ] **Step 5: Commit**

```bash
git add scripts/db-backup.sh scripts/db-restore-drill.sh package.json
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add backup and restore drill scripts"
```

Ghi counts/thời gian vào docs ở Task 4.

---

### Task 4: README, docs và browser demo

**Files:**
- Modify: `README.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `docs/phases/07-ops-seed.md`
- Modify: `docs/session-log.md`

- [ ] **Step 1: Chạy seed trên app DB**

```bash
npm run db:seed
```

Expected: log summary board `NexTask Demo Retro`, 9 item, 5 task, 4 activity, 3 budget.

- [ ] **Step 2: Browser demo**

Đăng nhập owner, mở `NexTask Demo Retro`; kiểm tra:

- 9 note, 5 task; badge promoted trên 4 note.
- Panel note Stop-2 hiện 3 phiếu, quota owner 2/3.
- Tab Hoạt động có 4 promote.
- Tab Báo cáo có Stop-2 trong unpromoted và task Start-2 trong stalled.
- Reload; chạy `npm run db:seed` lần hai; reload không nhân đôi.

- [ ] **Step 3: Cập nhật README**

Thêm/cập nhật:

- Quickstart `npm run db:seed`, tài khoản owner và demo member local.
- Lệnh profiler/backup/restore drill và cảnh báo local-only.
- Tính năng phase 0–7, limitations (không frame/CRDT/một API instance).
- Migration 001–006, backup gần nhất, test suite 38 file/164 test (số thực tế sau test).
- Git history đến v0.6.0; Phase 7 chờ duyệt.

- [ ] **Step 4: Ghi MongoDB notes**

Thêm section Phase 7:

- Profiler: top slow query (`millis`, `planSummary`, keys/docs examined), thời gian bật.
- Backup: file, size, gzip.
- Restore drill: counts khớp, thời gian, DB drill đã drop.
- Seed idempotency: counts lần 1/2, board `_id` ổn định.

- [ ] **Step 5: Session log/spec evidence**

Thêm entry verification Phase 7 với seed/browser/profiler/backup counts.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/mongodb-notes.md docs/phases/07-ops-seed.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 7 verification"
```

---

### Task 5: Gates, docs và merge release/v0.7

**Files:**
- Modify: `docs/phases/07-ops-seed.md`
- Modify: `docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

- [ ] **Step 1: Cập nhật docs trạng thái Phase 7**

Spec/plan: hoàn thành, commit list, merge commit. Architecture: Phase 7 complete. Git
workflow: release/v0.7, feature merge/xóa, main/tag v0.6.0 unchanged.

- [ ] **Step 2: Feature gate**

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
git add docs/phases/07-ops-seed.md docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 7 verification"
```

- [ ] **Step 4: Merge feature**

```bash
git switch release/v0.7
git merge --no-ff feat/phase-7-ops-seed -m "merge: phase 7 ops and seed"
```

- [ ] **Step 5: Release gate**

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

Sau khi biết merge commit, cập nhật spec/plan/session-log/git-workflow với hash và gate
release; commit trên `release/v0.7`:

```bash
git add docs/phases/07-ops-seed.md docs/superpowers/plans/2026-11-17-phase-7-ops-seed.md docs/session-log.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 7 release merge"
git branch -d feat/phase-7-ops-seed
git branch -vv
git log --oneline -1 main
git tag -l
```

Expected: `main` vẫn `2c79479`; tag `v0.2.0`–`v0.6.0`; release chứa Phase 7.

- [ ] **Step 7: Không merge main/không bump 0.7.0**

Không merge `release/v0.7` vào `main`; ghi trạng thái chờ duyệt phát hành v0.7.
Version `0.6.0`, tag `v0.6.0` giữ nguyên; profiler đã tắt.

---

## Self-review checklist

- Spec coverage:
  - Seed demo/idempotency/report: Task 1.
  - Profiler on/report/off: Task 2.
  - Backup/restore drill: Task 3.
  - README/browser/evidence: Task 4.
  - Gates/merge: Task 5.
- Seed chỉ reset board demo; board thật bất biến; demo member local.
- Restore drill không ghi app DB; profiler không level 2 và tắt sau đo.
- Không migration 007/API mới; full suite ba lần; không main/bump/tag.
- Type/field thống nhất: `seedDemoBoard`, `DEMO_BOARD_NAME`, `SeedSummary`,
  `db:seed`, `db:profiler:*`, `db:backup`, `db:restore-drill`.
