# NexTask Phase 2B - Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Thêm `$jsonSchema` validator và optimistic concurrency (`expectedVersion`) cho board, task, promote và item sync; client gửi version và xử lý 409; giữ nguyên dữ liệu Phase 1/2A.

**Architecture:** Migration `002-phase-2b` áp validator strict/error cho 5 collection. Mỗi mutation lọc theo version trong DB và trả `409 VERSION_CONFLICT` kèm `currentVersion`. Item sync chạy trong transaction snapshot/majority, kiểm tra toàn bộ version trước khi ghi và nhận danh sách xóa tường minh. Web gửi version thật, reload workspace khi conflict; whiteboard refetch version và retry một lần.

**Tech Stack:** Node 26, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, zod 4.6.7, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5.

**Spec:** `docs/phases/02b-data-integrity.md`

**Branch:** `feat/phase-2b-data-integrity` từ `release/v0.2` tại `611e893`. Không commit trực tiếp vào `main`; không merge `main` trong phase này.

**Trạng thái thực thi:** Hoàn thành ngày 2026-10-28; đã merge vào `release/v0.2` bằng
`bfc1da2`; feature branch đã xóa. Commit chính trên feature:

- `83ed3b2` `docs: plan phase 2b data integrity`
- `46728d4` `feat: add version conflict contract`
- `84eacb3` `feat: add phase 2b json schema validators`
- `9b7debc` `fix: type collection validator assertions`
- `5e07952` `feat: enforce expected versions for board and task writes`
- `e9ef947` `feat: enforce expected item version on promote`
- `60c6f68` `feat: make item sync versioned and transactional`
- `d296e5f` `feat: send versions and handle conflicts in web`
- `b5bcf28` `fix: format and lint phase 2b code`
- `f69b746` `test: cover item sync create race`
- `0054b46` `docs: record phase 2b verification`
- `bfc1da2` `merge: phase 2b data integrity` vào `release/v0.2`

**Điều chỉnh thực tế:**

- Test DB dùng chung được drop một lần để 001 + 002 chạy lại với validator mới; không
  drop database ứng dụng.
- `deleted[].expectedVersion` là số dương; test xóa stale dùng `version + 1`.
- Web board/task gửi version được nối sớm ở Task 3 để giữ typecheck xanh; conflict UX
  hoàn tất ở Task 6.
- Thêm test race hai client cùng tạo một shapeId.
- In-app browser chỉ mở một tab; client thứ hai dùng fetch cùng cookie. Drag dùng
  synthetic `DragEvent` + `DataTransfer`.
- Browser test đổi tên board và cột task rồi phục hồi bằng API với version hiện tại;
  item version tăng do test conflict, nội dung không đổi.
- Rehearsal và migration thật dùng backup `nextask-before-2b-2026-10-28.gz`; no-op update
  xác nhận toàn bộ document cũ hợp lệ.

## Global Constraints

- Node 26, TypeScript 6.0.3 strict; giữ cấu trúc monorepo hiện có.
- MongoDB replica set thật cho integration test; không mock DB, không nới timeout test.
- Giữ nguyên dữ liệu ứng dụng: không xóa collection/volume, không sửa `_id`, nội dung,
  `createdAt` hoặc version hiện có ngoài mutation có kiểm soát.
- `$jsonSchema` dùng `validationLevel: 'strict'`, `validationAction: 'error'`,
  `additionalProperties: false`.
- `version` bắt đầu từ 1; mutation tăng đúng 1; xóa không tăng.
- Item mới trong sync gửi `expectedVersion: 0`; item cũ gửi version hiện tại.
- Conflict chung: HTTP 409, code `VERSION_CONFLICT`, `details.currentVersion`; sync thêm
  `details.shapeId` khi biết.
- Item sync là transaction `snapshot` + `majority` + journal + primary.
- Không thêm realtime, demote, batch, voting, report, refresh token.
- Git local, không remote, không push, không amend, không tag, không đổi git config.
- Identity commit theo lệnh:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage bằng đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Không merge feature vào `main`; chỉ merge vào `release/v0.2` sau khi hoàn tất.
- Mọi tuyên bố pass phải kèm lệnh chạy thật và output.

---

### Task 0: Docs baseline và nhánh 2B

**Files:**
- Create: `docs/phases/02b-data-integrity.md`
- Create: `docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md`
- Modify: `docs/git-workflow.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: spec 2A hoàn thành, `release/v0.2` tại `611e893`.
- Produces: spec/plan 2B, baseline tài liệu trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git switch feat/phase-2b-data-integrity
git status --short --branch
git log --oneline -1
```

Expected: đang ở `feat/phase-2b-data-integrity`; working tree sạch; HEAD `611e893`.

- [ ] **Step 2: Cập nhật git workflow**

Trong `docs/git-workflow.md`:

- Mục 1: `release/v0.2` tại `611e893`; feature đang mở
  `feat/phase-2b-data-integrity`; 2A merged; 2B chưa xong.
- Thêm mục 9:

```markdown
## 9. Phase 2B

- Feature: `feat/phase-2b-data-integrity`, tạo từ `release/v0.2` tại `611e893`.
- Phạm vi: `$jsonSchema`, expectedVersion, item sync transaction, client conflict.
- 2B merge vào `release/v0.2` bằng `--no-ff` sau khi quality gate pass.
- Không merge `release/v0.2` vào `main` cho tới khi người dùng duyệt phát hành v0.2.
```

- [ ] **Step 3: Ghi baseline session log**

Thêm mục đầu file `docs/session-log.md` (hoặc cuối mục 2A, cùng định dạng hiện có):

```markdown
## 2026-10-28 - Phase 2B bắt đầu

- Nhánh `feat/phase-2b-data-integrity` từ `release/v0.2` tại `611e893`.
- Spec: `docs/phases/02b-data-integrity.md`.
- Plan: `docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md`.
- Phạm vi: `$jsonSchema`, expectedVersion, item sync transaction, client conflict.
- Chưa merge `main`.
```

- [ ] **Step 4: Commit baseline**

```bash
git add docs/phases/02b-data-integrity.md docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md docs/git-workflow.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 2b data integrity"
```

Expected: một commit mới trên feature; `main` và `release/v0.2` không đổi.

---

### Task 1: Version conflict contract và helper

**Files:**
- Create: `packages/contracts/src/version.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/lib/versioning.ts`
- Create: `apps/api/test/versioning.test.ts`

**Interfaces:**
- Produces:
  - `VERSION_CONFLICT_CODE = 'VERSION_CONFLICT'`
  - `versionConflictDetailsSchema` / `VersionConflictDetails`
  - `versionConflict(currentVersion: number, shapeId?: string): AppError`

- [ ] **Step 1: Viết test helper thất bại**

`apps/api/test/versioning.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { versionConflict } from '../src/lib/versioning.js';

describe('versionConflict', () => {
  it('tạo AppError 409 với currentVersion và shapeId', () => {
    const error = versionConflict(4, 'shape:one');

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.details).toEqual({ currentVersion: 4, shapeId: 'shape:one' });
  });

  it('không thêm shapeId khi không truyền', () => {
    expect(versionConflict(2).details).toEqual({ currentVersion: 2 });
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

Run:

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/versioning.test.ts
```

Expected: FAIL vì `../src/lib/versioning.js` chưa tồn tại.

- [ ] **Step 3: Thêm contract**

`packages/contracts/src/version.ts`:

```ts
import { z } from 'zod';

export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT' as const;

export const versionConflictDetailsSchema = z.object({
  currentVersion: z.number().int().nonnegative(),
  shapeId: z.string().min(1).optional(),
});

export type VersionConflictDetails = z.infer<typeof versionConflictDetailsSchema>;
```

`packages/contracts/src/index.ts` thêm:

```ts
export * from './version.js';
```

- [ ] **Step 4: Thêm helper server**

`apps/api/src/lib/versioning.ts`:

```ts
import { VERSION_CONFLICT_CODE, type VersionConflictDetails } from '@nextask/contracts';
import { AppError } from './errors.js';

export function versionConflict(currentVersion: number, shapeId?: string): AppError {
  const details: VersionConflictDetails = { currentVersion };
  if (shapeId !== undefined) {
    details.shapeId = shapeId;
  }

  return new AppError(
    409,
    VERSION_CONFLICT_CODE,
    'Dữ liệu đã thay đổi, vui lòng tải lại',
    details,
  );
}
```

- [ ] **Step 5: Chạy test và typecheck**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/versioning.test.ts
npm run typecheck
```

Expected: 2 test pass; typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/version.ts packages/contracts/src/index.ts apps/api/src/lib/versioning.ts apps/api/test/versioning.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add version conflict contract"
```

---

### Task 2: Migration 002 và collection validators

**Files:**
- Create: `apps/api/src/db/collection-validators.ts`
- Create: `apps/api/src/db/migrations/002-phase-2b.ts`
- Modify: `apps/api/src/db/migration-runner.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/test/validators.integration.test.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`

**Interfaces:**
- Consumes: `Migration`, `MigrationOptions` từ migration runner.
- Produces:
  - `COLLECTION_VALIDATORS: Record<string, Document>`
  - `phase2bMigration`
  - `MIGRATION_002_NAME = '002-phase-2b'`
  - `LATEST_MIGRATION_NAME = MIGRATION_002_NAME`

- [ ] **Step 1: Viết test validator thất bại**

`apps/api/test/validators.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestDb } from './helpers/test-db.js';

const collections = ['users', 'boards', 'items', 'tasks', 'invitations'] as const;
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

function db() {
  if (!connection.db) throw new Error('DB chưa kết nối');
  return connection.db;
}

describe('collection validators', () => {
  it('áp strict/error cho 5 collection nghiệp vụ', async () => {
    for (const name of collections) {
      const [info] = await db().listCollections({ name }).toArray();
      expect(info?.options?.validator, name).toBeDefined();
      expect(info?.options?.validationLevel, name).toBe('strict');
      expect(info?.options?.validationAction, name).toBe('error');
    }
  });

  it('users thiếu passwordHash bị từ chối', async () => {
    await expect(
      db().collection('users').insertOne({
        email: 'raw@example.com',
        emailNormalized: 'raw@example.com',
        name: 'Raw',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('boards sai role member bị từ chối', async () => {
    await expect(
      db()
        .collection('boards')
        .insertOne({
          name: 'Raw',
          ownerId: new Types.ObjectId(),
          members: [
            { userId: new Types.ObjectId(), role: 'admin', joinedAt: new Date() },
          ],
          columns: [],
          settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('items version 0 bị từ chối', async () => {
    await expect(
      db()
        .collection('items')
        .insertOne({
          boardId: new Types.ObjectId(),
          shapeId: 'shape:raw',
          type: 'note',
          content: '',
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
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('tasks sai priority bị từ chối', async () => {
    await expect(
      db()
        .collection('tasks')
        .insertOne({
          boardId: new Types.ObjectId(),
          columnId: 'todo',
          order: 'a0',
          title: 'Raw',
          description: '',
          assigneeId: null,
          labels: [],
          priority: 'critical',
          dueDate: null,
          lifecycle: 'active',
          sourceItemId: null,
          origin: null,
          version: 1,
          createdBy: new Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('invitations sai role bị từ chối', async () => {
    await expect(
      db()
        .collection('invitations')
        .insertOne({
          boardId: new Types.ObjectId(),
          emailNormalized: null,
          tokenHash: 'a'.repeat(64),
          role: 'owner',
          createdBy: new Types.ObjectId(),
          expiresAt: new Date(),
          usedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/validators.integration.test.ts
```

Expected: FAIL vì collection chưa có validator.

- [ ] **Step 3: Tạo file validator**

`apps/api/src/db/collection-validators.ts`:

```ts
import type { Document } from 'mongodb';

const objectId = { bsonType: 'objectId' } as const;
const nullableObjectId = { bsonType: ['objectId', 'null'] } as const;
const date = { bsonType: 'date' } as const;
const nullableDate = { bsonType: ['date', 'null'] } as const;
const number = { bsonType: 'number' } as const;

const pointSchema = {
  bsonType: 'object',
  required: ['x', 'y'],
  additionalProperties: false,
  properties: { x: number, y: number },
} as const;

const sizeSchema = {
  bsonType: 'object',
  required: ['w', 'h'],
  additionalProperties: false,
  properties: {
    w: { bsonType: 'number', minimum: 0 },
    h: { bsonType: 'number', minimum: 0 },
  },
} as const;

const timestampProperties = {
  createdAt: date,
  updatedAt: date,
} as const;

export const COLLECTION_VALIDATORS: Record<string, Document> = {
  users: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'email',
        'emailNormalized',
        'name',
        'passwordHash',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        email: { bsonType: 'string', minLength: 1 },
        emailNormalized: { bsonType: 'string', minLength: 1 },
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        passwordHash: { bsonType: 'string', minLength: 1 },
        ...timestampProperties,
      },
    },
  },
  boards: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'name',
        'ownerId',
        'members',
        'columns',
        'settings',
        'version',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        ownerId: objectId,
        members: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['userId', 'role', 'joinedAt'],
            additionalProperties: false,
            properties: {
              userId: objectId,
              role: { bsonType: 'string', enum: ['owner', 'member'] },
              joinedAt: date,
            },
          },
        },
        columns: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['id', 'name', 'order', 'isDone'],
            additionalProperties: false,
            properties: {
              id: { bsonType: 'string', minLength: 1 },
              name: { bsonType: 'string', minLength: 1 },
              order: number,
              isDone: { bsonType: 'bool' },
            },
          },
        },
        settings: {
          bsonType: 'object',
          required: ['votingLimit', 'minVotes', 'stalledAfterDays'],
          additionalProperties: false,
          properties: {
            votingLimit: { bsonType: 'number', minimum: 0 },
            minVotes: { bsonType: 'number', minimum: 0 },
            stalledAfterDays: { bsonType: 'number', minimum: 1 },
          },
        },
        version: { bsonType: 'number', minimum: 1 },
        ...timestampProperties,
      },
    },
  },
  items: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'shapeId',
        'type',
        'content',
        'style',
        'props',
        'position',
        'size',
        'rotation',
        'tldrawIndex',
        'parentFrameId',
        'authorId',
        'votes',
        'promotedTaskId',
        'version',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        shapeId: { bsonType: 'string', minLength: 1, maxLength: 200 },
        type: { bsonType: 'string', enum: ['note'] },
        content: { bsonType: 'string', maxLength: 10_000 },
        style: { bsonType: 'object' },
        props: { bsonType: 'object' },
        position: pointSchema,
        size: sizeSchema,
        rotation: number,
        tldrawIndex: { bsonType: 'string', minLength: 1, maxLength: 100 },
        parentFrameId: nullableObjectId,
        authorId: objectId,
        votes: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['userId', 'createdAt'],
            additionalProperties: false,
            properties: {
              userId: objectId,
              createdAt: date,
            },
          },
        },
        promotedTaskId: nullableObjectId,
        version: { bsonType: 'number', minimum: 1 },
        ...timestampProperties,
      },
    },
  },
  tasks: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'columnId',
        'order',
        'title',
        'description',
        'assigneeId',
        'labels',
        'priority',
        'dueDate',
        'lifecycle',
        'sourceItemId',
        'origin',
        'version',
        'createdBy',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        columnId: { bsonType: 'string', minLength: 1 },
        order: { bsonType: 'string', minLength: 1 },
        title: { bsonType: 'string', minLength: 1, maxLength: 200 },
        description: { bsonType: 'string' },
        assigneeId: nullableObjectId,
        labels: { bsonType: 'array', items: { bsonType: 'string' } },
        priority: { bsonType: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: nullableDate,
        lifecycle: { bsonType: 'string', enum: ['active', 'demoted'] },
        sourceItemId: nullableObjectId,
        origin: {
          anyOf: [
            { bsonType: 'null' },
            {
              bsonType: 'object',
              required: [
                'itemId',
                'frameId',
                'position',
                'voteCount',
                'authorId',
                'itemCreatedAt',
              ],
              additionalProperties: false,
              properties: {
                itemId: objectId,
                frameId: nullableObjectId,
                position: pointSchema,
                voteCount: { bsonType: 'number', minimum: 0 },
                authorId: objectId,
                itemCreatedAt: date,
              },
            },
          ],
        },
        version: { bsonType: 'number', minimum: 1 },
        createdBy: objectId,
        ...timestampProperties,
      },
    },
  },
  invitations: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'boardId',
        'emailNormalized',
        'tokenHash',
        'role',
        'createdBy',
        'expiresAt',
        'usedAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        boardId: objectId,
        emailNormalized: { bsonType: ['string', 'null'] },
        tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
        role: { bsonType: 'string', enum: ['member'] },
        createdBy: objectId,
        expiresAt: date,
        usedAt: nullableDate,
        ...timestampProperties,
      },
    },
  },
};

export const VALIDATED_COLLECTIONS = Object.keys(COLLECTION_VALIDATORS);
```

- [ ] **Step 4: Tạo migration 002**

`apps/api/src/db/migrations/002-phase-2b.ts`:

```ts
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

async function applyValidators(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  for (const [name, validator] of Object.entries(COLLECTION_VALIDATORS)) {
    const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (existing.length === 0) {
      await db.createCollection(name, { validator, ...VALIDATION });
      continue;
    }

    await db.command({ collMod: name, validator, ...VALIDATION });
  }
}

export const phase2bMigration: Migration = {
  name: '002-phase-2b',
  async up(options) {
    await applyValidators(options);
  },
};
```

- [ ] **Step 5: Nối migration runner và startup**

`apps/api/src/db/migration-runner.ts`:

```ts
import { phase2aMigration } from './migrations/001-phase-2a.js';
import { phase2bMigration } from './migrations/002-phase-2b.js';

export const MIGRATION_001_NAME = '001-phase-2a';
export const MIGRATION_002_NAME = '002-phase-2b';
export const LATEST_MIGRATION_NAME = MIGRATION_002_NAME;

const migrations: Migration[] = [phase2aMigration, phase2bMigration];
```

Giữ nguyên phần còn lại của file.

`apps/api/src/server.ts` đổi import và lời gọi:

```ts
import { LATEST_MIGRATION_NAME } from './db/migration-runner.js';
// ...
await assertSchemaVersion(connection, LATEST_MIGRATION_NAME);
```

- [ ] **Step 6: Cập nhật migration test**

Trong `apps/api/test/migrations.integration.test.ts`:

```ts
import {
  MIGRATION_001_NAME,
  MIGRATION_002_NAME,
  runMigrations,
} from '../src/db/migration-runner.js';
import { COLLECTION_VALIDATORS } from '../src/db/collection-validators.js';
```

Đổi assert version cuối thành:

```ts
await expect(assertSchemaVersion(connection, MIGRATION_002_NAME)).resolves.toBeUndefined();
```

Thêm test:

```ts
it('áp validator 002 và idempotent', async () => {
  if (!connection.db) throw new Error('DB chưa kết nối');

  for (const name of Object.keys(COLLECTION_VALIDATORS)) {
    const [info] = await connection.db.listCollections({ name }).toArray();
    expect(info?.options?.validator, name).toBeDefined();
    expect(info?.options?.validationLevel, name).toBe('strict');
    expect(info?.options?.validationAction, name).toBe('error');
  }

  const applied = await runMigrations({ connection, env: migrationEnv });
  expect(applied).not.toContain(MIGRATION_001_NAME);
  expect(applied).not.toContain(MIGRATION_002_NAME);
});
```

- [ ] **Step 7: Reset test DB và chạy test validator/migration**

Test DB dùng chung đang ở 001; drop một lần để 001 + 002 chạy lại từ đầu với validator
mới. Chỉ drop database test, không đụng `nextask`.

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_phase2_test").dropDatabase()'
npm run build:contracts
npm run test --workspace @nextask/api -- test/validators.integration.test.ts test/migrations.integration.test.ts
```

Expected: pass; shared test DB được áp 001 + 002 ở lần chạy đầu. Nếu sửa định nghĩa
validator sau bước này, drop lại test DB trước khi chạy lại; không sửa tay
`schema_migrations`.

- [ ] **Step 8: Chạy full suite để phát hiện validator chặn write hợp lệ**

```bash
npm run test
```

Expected: toàn bộ test hiện có pass. Nếu fail do validator, sửa validator hoặc dữ liệu
test cho đúng schema; không nới `strict/error`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/db/collection-validators.ts apps/api/src/db/migrations/002-phase-2b.ts apps/api/src/db/migration-runner.ts apps/api/src/server.ts apps/api/test/validators.integration.test.ts apps/api/test/migrations.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add phase 2b json schema validators"
```

---

### Task 3: OCC cho board rename và task move

**Files:**
- Modify: `packages/contracts/src/board.ts`
- Modify: `packages/contracts/src/task.ts`
- Modify: `apps/api/src/modules/boards/board.service.ts`
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Create: `apps/api/test/concurrency.integration.test.ts`
- Modify: `apps/api/test/membership.integration.test.ts`
- Modify: `apps/api/test/promotion.integration.test.ts`

**Interfaces:**
- Consumes: `versionConflict` từ Task 1.
- Produces:
  - `RenameBoardRequest = { name: string; expectedVersion: number }`
  - `MoveTaskRequest = { columnId: string; expectedVersion: number }`
  - `renameBoard(board, input)` lọc theo `version`
  - `moveTask(board, taskId, input)` lọc theo `version`

- [ ] **Step 1: Viết test OCC thất bại**

Tạo `apps/api/test/concurrency.integration.test.ts`:

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

function note(shapeId: string, content: string) {
  return {
    shapeId,
    type: 'note',
    content,
    style: { color: 'yellow' },
    props: { color: 'yellow' },
    position: { x: 10, y: 20 },
    size: { w: 200, h: 200 },
    rotation: 0,
    tldrawIndex: 'a1',
    parentFrameId: null,
    expectedVersion: 0,
  };
}

async function setupPromotedTask() {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const boardResponse = await owner.agent
    .post('/api/v1/boards')
    .send({ name: 'Retro' })
    .expect(201);
  const boardId = boardResponse.body.data._id as string;

  const synced = await owner.agent
    .put(`/api/v1/boards/${boardId}/items`)
    .send({ items: [note('shape:one', 'Task OCC')] })
    .expect(200);

  const promoted = await owner.agent
    .post(`/api/v1/boards/${boardId}/items/${synced.body.data[0]._id}/promote`)
    .send({ columnId: 'todo', assignToMe: false })
    .expect(201);

  return {
    owner,
    boardId,
    item: synced.body.data[0] as { _id: string; version: number },
    task: promoted.body.data.task as { _id: string; version: number },
  };
}

describe('board rename OCC', () => {
  it('version đúng tăng 1, version cũ trả 409 và không ghi đè', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const renamed = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Retro mới', expectedVersion: board.body.data.version })
      .expect(200);
    expect(renamed.body.data.version).toBe(board.body.data.version + 1);

    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Ghi đè', expectedVersion: board.body.data.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: renamed.body.data.version },
    });

    const current = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
    expect(current.body.data.name).toBe('Retro mới');
  });
});

describe('task move OCC', () => {
  it('version đúng tăng 1, version cũ trả 409', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const moved = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'done', expectedVersion: task.version })
      .expect(200);
    expect(moved.body.data.columnId).toBe('done');
    expect(moved.body.data.version).toBe(task.version + 1);

    const stale = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'review', expectedVersion: task.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: moved.body.data.version },
    });

    const saved = await TaskModel.findById(task._id).exec();
    expect(saved?.columnId).toBe('done');
  });

  it('hai move đồng thời với cùng version chỉ một thành công', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const [first, second] = await Promise.all([
      owner.agent
        .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
        .send({ columnId: 'backlog', expectedVersion: task.version }),
      owner.agent
        .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
        .send({ columnId: 'done', expectedVersion: task.version }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const saved = await TaskModel.findById(task._id).exec();
    expect(saved?.version).toBe(task.version + 1);
  });

  it('move cùng cột với version đúng không tăng version', async () => {
    const { owner, boardId, task } = await setupPromotedTask();

    const moved = await owner.agent
      .patch(`/api/v1/boards/${boardId}/tasks/${task._id}`)
      .send({ columnId: 'todo', expectedVersion: task.version })
      .expect(200);

    expect(moved.body.data.columnId).toBe('todo');
    expect(moved.body.data.version).toBe(task.version);
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/concurrency.integration.test.ts
```

Expected: FAIL vì payload thiếu `expectedVersion` (422) và service chưa kiểm tra version.

- [ ] **Step 3: Thêm expectedVersion vào contract**

`packages/contracts/src/board.ts`:

```ts
export const renameBoardRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().positive(),
});
```

`packages/contracts/src/task.ts`:

```ts
export const moveTaskRequestSchema = z.object({
  columnId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
});
```

- [ ] **Step 4: Sửa board service**

`apps/api/src/modules/boards/board.service.ts` thêm import:

```ts
import { versionConflict } from '../../lib/versioning.js';
```

Thay `renameBoard`:

```ts
export async function renameBoard(
  board: BoardDocument,
  input: RenameBoardRequest,
): Promise<BoardDocument> {
  const updated = await BoardModel.findOneAndUpdate(
    { _id: board._id, version: input.expectedVersion },
    { $set: { name: input.name }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();

  if (!updated) {
    const current = await BoardModel.findById(board._id).select({ version: 1 }).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }

  return updated;
}
```

- [ ] **Step 5: Sửa task service**

`apps/api/src/modules/tasks/task.service.ts` thêm import:

```ts
import { versionConflict } from '../../lib/versioning.js';
```

Trong `moveTask`, sau khi có `task` và trước `if (task.columnId === targetColumn.id)`:

```ts
if (task.version !== input.expectedVersion) {
  throw versionConflict(task.version);
}
```

Đổi filter update:

```ts
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
```

Thay nhánh `if (!updated)`:

```ts
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
```

- [ ] **Step 6: Cập nhật test cũ**

`apps/api/test/membership.integration.test.ts`:

- Rename owner:

```ts
.patch(`/api/v1/boards/${boardId}`)
.send({ name: 'Retro mới', expectedVersion: board.body.data.version })
```

- Move task của member:

```ts
.patch(`/api/v1/boards/${boardId}/tasks/${promoted.body.data.task._id}`)
.send({ columnId: 'done', expectedVersion: promoted.body.data.task.version })
```

`apps/api/test/promotion.integration.test.ts`:

- Move task:

```ts
.patch(`/api/v1/boards/${boardId}/tasks/${taskId}`)
.send({ columnId: 'done', expectedVersion: promoted.body.data.task.version })
```

- [ ] **Step 7: Chạy test liên quan**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/concurrency.integration.test.ts test/membership.integration.test.ts test/promotion.integration.test.ts test/workspace.integration.test.ts
```

Expected: pass; board/task OCC hoạt động, các test cũ đã gửi version.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/board.ts packages/contracts/src/task.ts apps/api/src/modules/boards/board.service.ts apps/api/src/modules/tasks/task.service.ts apps/api/test/concurrency.integration.test.ts apps/api/test/membership.integration.test.ts apps/api/test/promotion.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: enforce expected versions for board and task writes"
```

---

### Task 4: OCC cho promote

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Modify: `apps/api/src/modules/items/promotion.service.ts`
- Modify: `apps/api/src/modules/invitations/invitation.service.ts`
- Modify: `apps/api/test/promotion.integration.test.ts`
- Modify: `apps/api/test/membership.integration.test.ts`
- Modify: `apps/api/test/invitations.integration.test.ts`
- Modify: `apps/api/test/concurrency.integration.test.ts`

**Interfaces:**
- Consumes: `versionConflict`.
- Produces:
  - `PromoteRequest = { columnId: string; assignToMe: boolean; expectedItemVersion: number }`
  - Promote kiểm tra version trước trạng thái promoted.
  - Accept invitation tăng board version.

- [ ] **Step 1: Viết test promote stale thất bại**

Thêm vào `concurrency.integration.test.ts`:

```ts
import { ItemModel } from '../src/modules/items/item.model.js';

describe('promote OCC', () => {
  it('expectedItemVersion cũ trả 409 và không tạo task', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;
    const synced = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Stale promote')] })
      .expect(200);
    const item = synced.body.data[0] as { _id: string; version: number };

    await ItemModel.updateOne({ _id: item._id }, { $inc: { version: 1 } }).exec();

    const stale = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: item.version })
      .expect(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: item.version + 1 },
    });
    expect(await TaskModel.countDocuments({ boardId })).toBe(0);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: item.version + 1,
      })
      .expect(201);
  });

  it('version đúng nhưng đã promote trả ALREADY_PROMOTED', async () => {
    const { owner, boardId, item } = await setupPromotedTask();
    const current = await ItemModel.findById(item._id).exec();
    if (!current) throw new Error('Item missing');

    const response = await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${item._id}/promote`)
      .send({
        columnId: 'todo',
        assignToMe: false,
        expectedItemVersion: current.version,
      })
      .expect(409);
    expect(response.body.error.code).toBe('ALREADY_PROMOTED');
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/concurrency.integration.test.ts
```

Expected: FAIL vì schema chưa có `expectedItemVersion`.

- [ ] **Step 3: Thêm expectedItemVersion vào contract**

`packages/contracts/src/task.ts`:

```ts
export const promoteRequestSchema = z.object({
  columnId: z.string().min(1),
  assignToMe: z.boolean().default(false),
  expectedItemVersion: z.number().int().positive(),
});
```

- [ ] **Step 4: Sửa promote service**

`apps/api/src/modules/items/promotion.service.ts` thêm import:

```ts
import { versionConflict } from '../../lib/versioning.js';
```

Sau khi tìm thấy `item`, trước kiểm tra `promotedTaskId`:

```ts
if (item.version !== input.request.expectedItemVersion) {
  throw versionConflict(item.version);
}
```

Đổi filter update item:

```ts
const updatedItem = await ItemModel.findOneAndUpdate(
  {
    _id: item._id,
    boardId: input.board._id,
    promotedTaskId: null,
    version: input.request.expectedItemVersion,
  },
  {
    $set: { promotedTaskId: task._id },
    $inc: { version: 1 },
  },
  { returnDocument: 'after', session },
);
```

Giữ nguyên nhánh `if (!updatedItem) throw ALREADY_PROMOTED`.

- [ ] **Step 5: Tăng board version khi accept invitation**

Trong `apps/api/src/modules/invitations/invitation.service.ts`, update board:

```ts
const updatedBoard = await BoardModel.findOneAndUpdate(
  {
    _id: board._id,
    'members.userId': { $ne: user._id },
  },
  {
    $push: {
      members: {
        userId: user._id,
        role: 'member' as const,
        joinedAt: new Date(),
      },
    },
    $inc: { version: 1 },
  },
  { returnDocument: 'after', session },
);
```

- [ ] **Step 6: Cập nhật payload promote trong test cũ**

`apps/api/test/promotion.integration.test.ts`:

- Lần promote đầu: `expectedItemVersion: item.version`.
- Promote lần hai: `expectedItemVersion: response.body.data.item.version` (version sau lần
  đầu) để nhận `ALREADY_PROMOTED`.
- Hai promote đồng thời: cả hai gửi `expectedItemVersion: item.version`.
- Rollback: `expectedItemVersion: 1` (item mới từ sync).
- Setup helper trả `item` có `version`.

Ví dụ lần hai:

```ts
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
```

`apps/api/test/membership.integration.test.ts`:

```ts
.send({
  columnId: 'todo',
  assignToMe: true,
  expectedItemVersion: synced.body.data[0].version,
})
```

`apps/api/test/concurrency.integration.test.ts`, helper `setupPromotedTask`:

```ts
const promoted = await owner.agent
  .post(`/api/v1/boards/${boardId}/items/${synced.body.data[0]._id}/promote`)
  .send({
    columnId: 'todo',
    assignToMe: false,
    expectedItemVersion: synced.body.data[0].version,
  })
  .expect(201);
```

`apps/api/test/invitations.integration.test.ts` thêm assert sau accept:

```ts
const boardAfterAccept = await owner.agent.get(`/api/v1/boards/${boardId}`).expect(200);
expect(boardAfterAccept.body.data.version).toBe(2);
```

- [ ] **Step 7: Chạy test liên quan**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/concurrency.integration.test.ts test/promotion.integration.test.ts test/membership.integration.test.ts test/invitations.integration.test.ts
```

Expected: pass; stale promote không tạo task; accept tăng board version.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/task.ts apps/api/src/modules/items/promotion.service.ts apps/api/src/modules/invitations/invitation.service.ts apps/api/test/concurrency.integration.test.ts apps/api/test/promotion.integration.test.ts apps/api/test/membership.integration.test.ts apps/api/test/invitations.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: enforce expected item version on promote"
```

---

### Task 5: OCC và transaction cho item sync

**Files:**
- Modify: `packages/contracts/src/item.ts`
- Modify: `apps/api/src/modules/items/item.service.ts`
- Modify: `apps/api/src/modules/items/item.router.ts`
- Modify: `apps/api/test/workspace.integration.test.ts`
- Modify: `apps/api/test/promotion.integration.test.ts`
- Modify: `apps/api/test/membership.integration.test.ts`
- Modify: `apps/api/test/concurrency.integration.test.ts`

**Interfaces:**
- Consumes: `versionConflict`.
- Produces:
  - `syncItemInputSchema` có `expectedVersion` (>= 0)
  - `syncDeletedItemInputSchema`, `SyncDeletedItemInput`
  - `syncItemsRequestSchema = { items, deleted }` với kiểm tra shapeId lặp
  - `syncItems(board, userId, input: SyncItemsRequest): Promise<ItemDocument[]>`
  - Item sync transaction all-or-nothing.

- [ ] **Step 1: Viết test sync OCC thất bại**

Thêm vào `concurrency.integration.test.ts`:

```ts
describe('item sync OCC', () => {
  it('một item stale làm toàn bộ request không ghi', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
      .expect(200);
    const [one, two] = first.body.data as Array<{ _id: string; version: number }>;

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [
          { ...note('shape:one', 'Một đã sửa'), expectedVersion: 0 },
          { ...note('shape:two', 'Hai đã sửa'), expectedVersion: two.version },
        ],
      })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:one', currentVersion: one.version },
    });

    const saved = await ItemModel.find({ boardId }).sort({ shapeId: 1 }).exec();
    expect(saved.map((item) => item.content)).toEqual(['Một', 'Hai']);
    expect(saved.every((item) => item.version === 1)).toBe(true);
  });

  it('item mới phải gửi expectedVersion 0', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const response = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [{ ...note('shape:new', 'Mới'), expectedVersion: 5 }] })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { shapeId: 'shape:new', currentVersion: 0 },
    });
  });

  it('xóa đúng version, xóa stale 409, item promoted bị bỏ qua', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [note('shape:one', 'Một'), note('shape:two', 'Hai'), note('shape:three', 'Ba')],
      })
      .expect(200);
    const [one, two, three] = first.body.data as Array<{
      _id: string;
      shapeId: string;
      version: number;
    }>;

    const staleDelete = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [], deleted: [{ shapeId: two.shapeId, expectedVersion: 0 }] })
      .expect(409);
    expect(staleDelete.body.error.code).toBe('VERSION_CONFLICT');

    const deleted = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [], deleted: [{ shapeId: two.shapeId, expectedVersion: two.version }] })
      .expect(200);
    expect(deleted.body.data.map((item: { shapeId: string }) => item.shapeId)).toEqual([
      one.shapeId,
      three.shapeId,
    ]);

    await owner.agent
      .post(`/api/v1/boards/${boardId}/items/${three._id}/promote`)
      .send({ columnId: 'todo', assignToMe: false, expectedItemVersion: three.version })
      .expect(201);

    const ignored = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [],
        deleted: [{ shapeId: three.shapeId, expectedVersion: three.version + 1 }],
      })
      .expect(200);
    expect(ignored.body.data.map((item: { shapeId: string }) => item.shapeId)).toContain(
      three.shapeId,
    );
  });

  it('hai sync đồng thời trên cùng item chỉ một thành công', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    const first = await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({ items: [note('shape:one', 'Gốc')] })
      .expect(200);
    const item = first.body.data[0] as { version: number };

    const [left, right] = await Promise.all([
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [{ ...note('shape:one', 'Trái'), expectedVersion: item.version }] }),
      owner.agent
        .put(`/api/v1/boards/${boardId}/items`)
        .send({ items: [{ ...note('shape:one', 'Phải'), expectedVersion: item.version }] }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const saved = await ItemModel.findOne({ boardId, shapeId: 'shape:one' }).exec();
    expect(saved?.version).toBe(2);
  });

  it('shapeId lặp giữa items và deleted trả 422', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

    await owner.agent
      .put(`/api/v1/boards/${boardId}/items`)
      .send({
        items: [note('shape:one', 'Một')],
        deleted: [{ shapeId: 'shape:one', expectedVersion: 1 }],
      })
      .expect(422);
  });
});
```

- [ ] **Step 2: Chạy test để thấy fail**

```bash
npm run build:contracts
npm run test --workspace @nextask/api -- test/concurrency.integration.test.ts
```

Expected: FAIL vì sync contract chưa có `expectedVersion`/`deleted`.

- [ ] **Step 3: Cập nhật contract item**

`packages/contracts/src/item.ts`:

```ts
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
  expectedVersion: z.number().int().nonnegative(),
});

export const syncDeletedItemInputSchema = z.object({
  shapeId: z.string().min(1).max(200),
  expectedVersion: z.number().int().positive(),
});

export const syncItemsRequestSchema = z
  .object({
    items: z.array(syncItemInputSchema).max(200),
    deleted: z.array(syncDeletedItemInputSchema).max(200).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const entry of [...value.items, ...value.deleted]) {
      if (seen.has(entry.shapeId)) {
        ctx.addIssue({
          code: 'custom',
          message: `shapeId bị lặp: ${entry.shapeId}`,
          path: ['items'],
        });
        return;
      }
      seen.add(entry.shapeId);
    }
  });

export type SyncDeletedItemInput = z.infer<typeof syncDeletedItemInputSchema>;
export type SyncItemsRequest = z.infer<typeof syncItemsRequestSchema>;
```

- [ ] **Step 4: Viết lại item service**

Thay toàn bộ `apps/api/src/modules/items/item.service.ts`:

```ts
import type { SyncItemsRequest } from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { versionConflict } from '../../lib/versioning.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

interface DuplicateKeyShape {
  shapeId?: unknown;
}

function duplicateShapeId(error: unknown): string | null {
  const direct = error as { code?: number; keyValue?: DuplicateKeyShape };
  if (direct.code === 11_000 && typeof direct.keyValue?.shapeId === 'string') {
    return direct.keyValue.shapeId;
  }

  const writeErrors = (
    error as {
      writeErrors?: Array<{ err?: { code?: number; keyValue?: DuplicateKeyShape } }>;
    }
  ).writeErrors;
  const first = writeErrors?.[0]?.err;
  if (first?.code === 11_000 && typeof first.keyValue?.shapeId === 'string') {
    return first.keyValue.shapeId;
  }

  return null;
}

export async function listItems(board: BoardDocument): Promise<ItemDocument[]> {
  return ItemModel.find({ boardId: board._id, type: 'note' })
    .sort({ createdAt: 1, _id: 1 })
    .exec();
}

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
          type: 'note',
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
          if (!current || current.promotedTaskId) continue;
          if (current.version !== deleted.expectedVersion) {
            throw versionConflict(current.version, deleted.shapeId);
          }
        }

        const now = new Date();
        const updateOps = input.items.map((item) => {
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

        const deleteOps = input.deleted.flatMap((deleted) => {
          const current = byShapeId.get(deleted.shapeId);
          if (!current || current.promotedTaskId) return [];
          return [
            {
              deleteOne: {
                filter: { _id: current._id, version: deleted.expectedVersion },
              },
            },
          ];
        });

        if (updateOps.length > 0) {
          await ItemModel.bulkWrite(updateOps, { session });
        }
        if (deleteOps.length > 0) {
          await ItemModel.bulkWrite(deleteOps, { session });
        }

        return ItemModel.find({ boardId: board._id, type: 'note' })
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

export async function syncItems(
  board: BoardDocument,
  userId: Types.ObjectId,
  input: SyncItemsRequest,
): Promise<ItemDocument[]> {
  try {
    return await runSyncTransaction(board, userId, input);
  } catch (error) {
    const shapeId = duplicateShapeId(error);
    if (!shapeId) throw error;

    const current = await ItemModel.findOne({
      boardId: board._id,
      shapeId,
    }).exec();
    throw versionConflict(current?.version ?? 1, shapeId);
  }
}
```

- [ ] **Step 5: Sửa item router**

`apps/api/src/modules/items/item.router.ts`:

```ts
const input = syncItemsRequestSchema.parse(request.body);
const items = await syncItems(request.board, request.user._id, input);
```

- [ ] **Step 6: Cập nhật test cũ theo sync request mới**

`apps/api/test/workspace.integration.test.ts`:

- `note(shapeId, content, expectedVersion = 0)` trả thêm `expectedVersion`.
- Test sync idempotent:

```ts
const first = await owner.agent
  .put(`/api/v1/boards/${boardId}/items`)
  .send({ items: [note('shape:one', 'Ý tưởng')] })
  .expect(200);

const second = await owner.agent
  .put(`/api/v1/boards/${boardId}/items`)
  .send({
    items: [note('shape:one', 'Ý tưởng đã sửa', first.body.data[0].version)],
  })
  .expect(200);
```

- Test xóa note:

```ts
const first = await owner.agent
  .put(`/api/v1/boards/${boardId}/items`)
  .send({ items: [note('shape:one', 'Một'), note('shape:two', 'Hai')] })
  .expect(200);
const two = first.body.data.find(
  (item: { shapeId: string }) => item.shapeId === 'shape:two',
) as { version: number };

const response = await owner.agent
  .put(`/api/v1/boards/${boardId}/items`)
  .send({
    items: [note('shape:one', 'Một', first.body.data[0].version)],
    deleted: [{ shapeId: 'shape:two', expectedVersion: two.version }],
  })
  .expect(200);
```

`apps/api/test/promotion.integration.test.ts` setup sync thêm `expectedVersion: 0`.

`apps/api/test/membership.integration.test.ts` sync note thêm `expectedVersion: 0`.

- [ ] **Step 7: Chạy full API suite**

```bash
npm run build:contracts
npm run test
```

Expected: tất cả file/test pass; không còn payload sync thiếu version.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/item.ts apps/api/src/modules/items/item.service.ts apps/api/src/modules/items/item.router.ts apps/api/test/workspace.integration.test.ts apps/api/test/promotion.integration.test.ts apps/api/test/membership.integration.test.ts apps/api/test/concurrency.integration.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: make item sync versioned and transactional"
```

---

### Task 6: Web gửi version và xử lý conflict

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/features/workspace/kanban-board.tsx`
- Modify: `apps/web/features/workspace/rename-board-dialog.tsx`
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`

**Interfaces:**
- Consumes: contract request types từ Task 3-5.
- Produces:
  - `renameBoard(boardId, name, expectedVersion)`
  - `syncItems(boardId, items, deleted)`
  - `isVersionConflict(error)`
  - UI gửi version và reload/refetch khi 409.

- [ ] **Step 1: Cập nhật API client**

`apps/web/lib/api.ts`:

- Import thêm `syncDeletedItemInputSchema`, `syncItemsRequestSchema`, type
  `SyncDeletedItemInput`.
- Thêm helper:

```ts
export function isVersionConflict(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === 'VERSION_CONFLICT';
}
```

- Đổi `renameBoard`:

```ts
export async function renameBoard(
  boardId: string,
  name: string,
  expectedVersion: number,
): Promise<BoardDto> {
  const body: RenameBoardRequest = renameBoardRequestSchema.parse({
    name,
    expectedVersion,
  });
  return (
    await request(`/boards/${boardId}`, boardResponseSchema, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  ).data;
}
```

- Đổi `syncItems`:

```ts
export async function syncItems(
  boardId: string,
  items: SyncItemInput[],
  deleted: SyncDeletedItemInput[],
): Promise<ItemDto[]> {
  const body = syncItemsRequestSchema.parse({ items, deleted });
  return (
    await request(`/boards/${boardId}/items`, itemsResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  ).data;
}
```

`moveTask` và `promoteItem` giữ signature `input`; type contract đã chứa version nên
không cần đổi thân hàm.

- [ ] **Step 2: Cập nhật workspace**

`apps/web/features/workspace/board-workspace.tsx`:

- Import `isVersionConflict`.
- `handlePromote`:

```ts
const result = await promoteItem(boardId, promoteTarget._id, {
  columnId: input.columnId,
  assignToMe: input.assignToMe,
  expectedItemVersion: promoteTarget.version,
});
```

Bọc trong try/catch:

```ts
try {
  // gọi promote và cập nhật state như hiện tại
} catch (caught) {
  if (isVersionConflict(caught)) {
    setPromoteTarget(null);
    setNotice('Ghi chú vừa thay đổi từ tab/người khác. Đã tải lại board.');
    await loadWorkspace();
    return;
  }
  throw caught;
}
```

- `handleMoveTask` đổi signature và gửi version:

```ts
const handleMoveTask = useCallback(
  async (taskId: string, columnId: string, expectedVersion: number) => {
    setNotice(null);
    try {
      const moved = await moveTask(boardId, taskId, { columnId, expectedVersion });
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          tasks: current.tasks.map((task) => (task._id === moved._id ? moved : task)),
        };
      });
    } catch (caught) {
      if (isVersionConflict(caught)) {
        setNotice('Board vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
        await loadWorkspace();
        return;
      }
      setNotice(caught instanceof ApiClientError ? caught.message : 'Không di chuyển được task.');
    }
  },
  [boardId, loadWorkspace],
);
```

- Thêm callback conflict cho rename:

```ts
const handleRenameConflict = useCallback(() => {
  setShowRename(false);
  setNotice('Board vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu.');
  void loadWorkspace();
}, [loadWorkspace]);
```

- Truyền `onConflict={handleRenameConflict}` vào `RenameBoardDialog`.

- [ ] **Step 3: Kanban truyền version**

`apps/web/features/workspace/kanban-board.tsx`:

```ts
interface KanbanBoardProps {
  board: BoardDto;
  tasks: TaskDto[];
  onMoveTask: (taskId: string, columnId: string, expectedVersion: number) => Promise<void>;
}
```

Trong `dropTask`:

```ts
function dropTask(columnId: string, taskId: string) {
  if (!taskId) return;
  const task = tasks.find((entry) => entry._id === taskId);
  if (!task) return;
  void onMoveTask(taskId, columnId, task.version);
  setDraggingTaskId(null);
  setDragOverColumn(null);
}
```

- [ ] **Step 4: Rename dialog gửi board.version**

`apps/web/features/workspace/rename-board-dialog.tsx`:

```ts
interface RenameBoardDialogProps {
  board: BoardDto;
  onClose: () => void;
  onRenamed: (board: BoardDto) => void;
  onConflict: () => void;
}
```

```ts
const updated = await renameBoard(board._id, name, board.version);
```

Trong catch:

```ts
if (isVersionConflict(caught)) {
  onConflict();
  return;
}
setError(caught instanceof ApiClientError ? caught.message : 'Không đổi tên được board.');
```

Import `isVersionConflict`.

- [ ] **Step 5: Whiteboard giữ version, gửi deleted và retry một lần**

`apps/web/features/whiteboard/whiteboard-canvas.tsx`:

- Import `getItems`, `isVersionConflict` và type `SyncDeletedItemInput`, `SyncItemInput`.
- Thêm ref sau `initialItemsRef`:

```ts
const knownItemsRef = useRef(
  new Map(
    initialItems.map((item) => [
      item.shapeId,
      { version: item.version, promotedTaskId: item.promotedTaskId },
    ]),
  ),
);
const [versionNotice, setVersionNotice] = useState<string | null>(null);
```

- Thêm effect đồng bộ prop `items` (không thêm shape lạ):

```ts
useEffect(() => {
  const known = knownItemsRef.current;
  for (const item of items) {
    const entry = known.get(item.shapeId);
    if (entry && item.version >= entry.version) {
      known.set(item.shapeId, {
        version: item.version,
        promotedTaskId: item.promotedTaskId,
      });
    }
  }
}, [items]);
```

- Trong `syncNow`, sau khi tạo `payload`:

```ts
const known = knownItemsRef.current;
const localShapeIds = new Set(shapes.map((shape) => shape.id));
const payload: SyncItemInput[] = shapes.map((shape) => {
  const bounds = currentEditor.getShapePageBounds(shape);
  const props = shape.props as TLNoteShapeProps;
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
    parentFrameId: null,
    expectedVersion: known.get(shape.id)?.version ?? 0,
  };
});
const deleted: SyncDeletedItemInput[] = [...known.entries()]
  .filter(([shapeId, entry]) => !localShapeIds.has(shapeId) && entry.promotedTaskId === null)
  .map(([shapeId, entry]) => ({ shapeId, expectedVersion: entry.version }));
```

- Thêm hàm gửi có retry:

```ts
async function sendSync(
  payloadItems: SyncItemInput[],
  deletedItems: SyncDeletedItemInput[],
): Promise<ItemDto[]> {
  try {
    return await syncItems(board._id, payloadItems, deletedItems);
  } catch (caught) {
    if (!isVersionConflict(caught)) throw caught;

    const serverItems = await getItems(board._id);
    const serverByShapeId = new Map(serverItems.map((item) => [item.shapeId, item]));
    const missing: string[] = [];

    for (const entry of payloadItems) {
      const item = serverByShapeId.get(entry.shapeId);
      if (item) {
        knownItemsRef.current.set(entry.shapeId, {
          version: item.version,
          promotedTaskId: item.promotedTaskId,
        });
      } else if (entry.expectedVersion > 0) {
        missing.push(entry.shapeId);
      }
    }

    for (const entry of deletedItems) {
      const item = serverByShapeId.get(entry.shapeId);
      if (item) {
        knownItemsRef.current.set(entry.shapeId, {
          version: item.version,
          promotedTaskId: item.promotedTaskId,
        });
      } else {
        knownItemsRef.current.delete(entry.shapeId);
      }
    }

    if (missing.length > 0) throw caught;

    const retryPayload = payloadItems.map((entry) => ({
      ...entry,
      expectedVersion: knownItemsRef.current.get(entry.shapeId)?.version ?? 0,
    }));
    const retryDeleted = deletedItems
      .filter((entry) => knownItemsRef.current.has(entry.shapeId))
      .map((entry) => ({
        ...entry,
        expectedVersion:
          knownItemsRef.current.get(entry.shapeId)?.version ?? entry.expectedVersion,
      }));

    setVersionNotice('Board vừa thay đổi từ tab khác; đã đồng bộ lại.');
    return syncItems(board._id, retryPayload, retryDeleted);
  }
}
```

- Trong `syncNow`, thay `await syncItems(board._id, payload)` bằng
  `await sendSync(payload, deleted)`.
- Sau khi có `saved`, cập nhật map trước `onItemsChange`:

```ts
const savedByShapeId = new Map(saved.map((item) => [item.shapeId, item]));
for (const shapeId of localShapeIds) {
  const savedItem = savedByShapeId.get(shapeId);
  if (savedItem) {
    knownItemsRef.current.set(shapeId, {
      version: savedItem.version,
      promotedTaskId: savedItem.promotedTaskId,
    });
  }
}
for (const shapeId of [...knownItemsRef.current.keys()]) {
  const entry = knownItemsRef.current.get(shapeId);
  if (!entry) continue;
  if (!localShapeIds.has(shapeId) && entry.promotedTaskId === null) {
    knownItemsRef.current.delete(shapeId);
  }
}
onItemsChange(saved);
```

- Hiển thị notice trong toolbar cạnh `saveLabel`:

```tsx
{versionNotice ? (
  <span className="px-1 text-[11px] text-amber-700">{versionNotice}</span>
) : null}
```

- `handlePromoteClick` giữ nguyên: `syncNow()` trả item đã có version mới.

- [ ] **Step 6: Typecheck web và full typecheck**

```bash
npm run typecheck
```

Expected: pass; không còn chỗ gọi `renameBoard`/`syncItems`/`onMoveTask` sai signature.

- [ ] **Step 7: Build web**

```bash
npm run build:web
```

Expected: build pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/api.ts apps/web/features/workspace/board-workspace.tsx apps/web/features/workspace/kanban-board.tsx apps/web/features/workspace/rename-board-dialog.tsx apps/web/features/whiteboard/whiteboard-canvas.tsx
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: send versions and handle conflicts in web"
```

---

### Task 7: Backup, rehearsal và browser verification

**Files:**
- Modify: `docs/session-log.md` (ghi evidence tạm; hoàn tất ở Task 8)

**Interfaces:**
- Consumes: migration 002 và code 2B đã pass test.
- Produces: database thật đã migrate 002, Docker healthy, browser evidence.

- [ ] **Step 1: Backup database ứng dụng**

```bash
docker compose exec -T mongo mongodump --db nextask --archive --gzip > backups/nextask-before-2b-2026-10-28.gz
gzip -t backups/nextask-before-2b-2026-10-28.gz
ls -lh backups/nextask-before-2b-2026-10-28.gz
```

Expected: `gzip -t` exit 0; file tồn tại. Không xóa backup 2A.

- [ ] **Step 2: Restore bản copy rehearsal**

```bash
docker compose exec -T mongo mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_2b_rehearsal.*' < backups/nextask-before-2b-2026-10-28.gz
```

Expected: restore thành công vào `nextask_2b_rehearsal`; database `nextask` không đổi.

- [ ] **Step 3: Chạy migration 002 trên rehearsal**

```bash
docker compose run --rm -e MONGODB_URI='mongodb://mongo:27017/nextask_2b_rehearsal?replicaSet=rs0' migrate
```

Expected: log `applied: ["002-phase-2b"]`, exit 0.

- [ ] **Step 4: Kiểm tra rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_2b_rehearsal");
printjson({
  boards: db.boards.countDocuments(),
  items: db.items.countDocuments(),
  tasks: db.tasks.countDocuments(),
  users: db.users.countDocuments(),
  invitations: db.invitations.countDocuments(),
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
});
printjson(db.getCollectionInfos({name:"items"})[0].options);
'
```

Expected: số lượng bằng bản gốc; có `002-phase-2b`; validator strict/error.

- [ ] **Step 5: Validate toàn bộ document cũ bằng no-op update**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask_2b_rehearsal");
for (const name of ["users","boards","items","tasks","invitations"]) {
  const result = db.runCommand({
    update: name,
    updates: [{ q: {}, u: [{ $set: { updatedAt: "$updatedAt" } }], multi: true }],
  });
  print(name, JSON.stringify({ ok: result.ok, errors: result.writeErrors ?? [] }));
}
'
```

Expected: cả 5 collection `ok: 1`, không `writeErrors`. Nếu lỗi 121, dừng và điều tra
document không hợp lệ.

- [ ] **Step 6: So sánh dữ liệu mẫu rehearsal với bản gốc**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const source = db.getSiblingDB("nextask");
const copy = db.getSiblingDB("nextask_2b_rehearsal");
for (const name of ["boards","items","tasks"]) {
  const a = source.getCollection(name).find().sort({_id:1}).toArray();
  const b = copy.getCollection(name).find().sort({_id:1}).toArray();
  print(name, a.length, b.length, JSON.stringify(a.map(d => [d._id, d.version, d.updatedAt])) === JSON.stringify(b.map(d => [d._id, d.version, d.updatedAt])));
}
'
```

Expected: cùng số lượng và cùng `_id`, `version`, `updatedAt`.

- [ ] **Step 7: Áp migration lên database thật**

```bash
docker compose up --build -d
docker compose logs --no-color migrate | tail -20
docker compose ps
```

Expected: migrate exit 0 với `002-phase-2b`; `mongo`, `api`, `web` healthy.

- [ ] **Step 8: Kiểm tra database thật**

```bash
docker compose exec -T mongo mongosh --quiet --eval '
const db = db.getSiblingDB("nextask");
printjson({
  migrations: db.schema_migrations.find().sort({_id:1}).toArray(),
  validators: db.getCollectionInfos({ name: { $in: ["users","boards","items","tasks","invitations"] } }).map(c => [c.name, c.options.validationLevel, c.options.validationAction]),
  counts: { boards: db.boards.countDocuments(), items: db.items.countDocuments(), tasks: db.tasks.countDocuments(), users: db.users.countDocuments(), invitations: db.invitations.countDocuments() },
});
'
curl -fsS http://localhost:4000/api/v1/health
```

Expected: `002-phase-2b`; validator strict/error; counts không đổi; health `ok`.

- [ ] **Step 9: Drop database rehearsal**

```bash
docker compose exec -T mongo mongosh --quiet --eval 'db.getSiblingDB("nextask_2b_rehearsal").dropDatabase()'
```

Expected: `ok: 1`; database `nextask` vẫn còn.

- [ ] **Step 10: Browser golden path**

Dùng browser-use MCP:

1. Mở `http://localhost:3000`, đăng nhập `owner@nextask.local` /
   `nextask-local-owner-2026`.
2. Mở board hiện có; xác nhận board, note, task cũ còn.
3. Tạo note mới, chọn note, promote vào `To Do`; kéo task sang `Done`; reload; note có
   badge `Đã thành task · Done`.
4. Không có lỗi console/network 500.

- [ ] **Step 11: Browser conflict rename**

1. Mở cùng board ở tab A và tab B (hai page trong cùng browser context).
2. Tab B mở `Đổi tên`, đổi tên board, lưu.
3. Tab A mở `Đổi tên` (dialog đang giữ version cũ), nhập tên khác, lưu.
4. Expected: tab A nhận notice "Board vừa thay đổi...", dialog đóng, dữ liệu reload và
   hiển thị tên do tab B đặt; không có 500.
5. Ghi lại network response 409 `VERSION_CONFLICT` của tab A.

- [ ] **Step 12: Browser conflict task move**

1. Reload tab A và tab B để cùng version.
2. Tab B kéo một task sang cột khác.
3. Tab A kéo cùng task sang cột khác nữa.
4. Expected: tab A notice reload; task hiển thị ở cột tab B đã chọn; network có 409
   `VERSION_CONFLICT`.
5. Nếu browser-use không tạo được HTML5 drag thật, dùng synthetic `DragEvent` +
   `DataTransfer` như Phase 1 và ghi rõ giới hạn.

- [ ] **Step 13: Browser whiteboard conflict retry**

1. Tab A mở board, chưa sửa note.
2. Dùng `fetch` trong tab B (cùng cookie) gọi `PUT /items` cập nhật note với version
   hiện tại để tăng version.
3. Tab A sửa note và bấm `Lưu`.
4. Expected: request đầu 409; client gọi `GET /items`, retry thành công; toolbar hiện
   notice đồng bộ lại; không có lỗi đỏ/500; reload tab A thấy nội dung vừa lưu.

- [ ] **Step 14: Ghi evidence**

Ghi vào `docs/session-log.md`:

- Kích thước backup, `gzip -t`.
- Migration applied trên rehearsal và app.
- Counts/version trước và sau.
- Health và Docker.
- Kết quả từng browser check, kèm request 409 quan sát được.

---

### Task 8: Quality gates, docs và merge release

**Files:**
- Modify: `docs/phases/02b-data-integrity.md`
- Modify: `docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `README.md`
- Modify: `docs/git-workflow.md`

**Interfaces:**
- Consumes: code 2B, migration thật, browser evidence.
- Produces: phase 2B hoàn tất trên `release/v0.2`; feature branch xóa; `main` không đổi.

- [ ] **Step 1: Cập nhật docs phase và plan**

- Spec: đổi trạng thái thành `Hoàn thành ngày 2026-10-28; đã merge vào release/v0.2`.
  Thêm mục kết quả ngắn: migration 002, validators, OCC, sync transaction, test counts,
  backup, browser evidence.
- Plan: thêm dòng `Trạng thái thực thi: Hoàn thành ...` và ghi các điều chỉnh thực tế.
- Đánh dấu checkbox đã làm (không cần sửa code block).

- [ ] **Step 2: Cập nhật architecture, MongoDB notes, README**

`docs/architecture.md`:

- Trạng thái Phase 2B hoàn thành.
- Thêm `db/collection-validators.ts`, `db/migrations/002-phase-2b.ts`,
  `lib/versioning.ts`.
- Ghi rõ item sync transaction và conflict 409.

`docs/mongodb-notes.md` thêm:

- `$jsonSchema` strict/error, `additionalProperties`, `collMod` idempotent.
- Validator chỉ kiểm tra write sau khi áp; rehearsal no-op update để kiểm tra document cũ.
- OCC bằng filter `version`, `$inc`, transaction retry và write conflict.
- Vì sao xóa item dùng `deleted[]` tường minh.
- Duplicate key 11000 khi tạo cùng shapeId được đổi thành 409.

`README.md`:

- Phase 2B đã xong.
- Payload mutation cần `expectedVersion`; sync item có `deleted[]`.
- Hành vi 409 và reload/refetch.
- Migration 002, backup/rehearsal.
- Giữ ghi chú tldraw license và Git local.

`docs/git-workflow.md`:

- Mục 1: release head sau merge 2B.
- Mục 9: 2B hoàn thành, feature đã xóa, main vẫn chưa nhận v0.2.

- [ ] **Step 3: Chạy quality gate lần 1**

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Expected: tất cả pass. Ghi lại số file/test và thời gian.

- [ ] **Step 4: Chạy full suite lần 2 và 3**

```bash
npm run test
npm run test
```

Expected: pass cả hai; ghi thời gian. Không nới timeout.

- [ ] **Step 5: Commit docs hoàn tất**

```bash
git add docs/phases/02b-data-integrity.md docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md docs/session-log.md docs/architecture.md docs/mongodb-notes.md README.md docs/git-workflow.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 2b verification"
```

- [ ] **Step 6: Kiểm tra trạng thái trước merge**

```bash
git status --short --branch
git log --oneline release/v0.2..HEAD
```

Expected: working tree sạch; chỉ có commit 2B trên feature.

- [ ] **Step 7: Merge feature vào release**

```bash
git switch release/v0.2
git merge --no-ff feat/phase-2b-data-integrity -m "merge: phase 2b data integrity"
```

Expected: merge commit mới trên `release/v0.2`; không conflict.

- [ ] **Step 8: Chạy gate trên release sau merge**

```bash
git status --short --branch
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Expected: pass; ghi kết quả.

- [ ] **Step 9: Xóa feature branch**

```bash
git branch -d feat/phase-2b-data-integrity
git branch -vv
```

Expected: feature đã xóa; `main` vẫn ở `6d3d11b`; `release/v0.2` chứa 2A + 2B.

- [ ] **Step 10: Không merge main**

Không chạy merge `release/v0.2` vào `main`. Ghi trạng thái chờ người dùng duyệt phát hành
v0.2 vào session log và báo lại trong kết thúc phiên.

---

## Self-review checklist

- Spec coverage:
  - `$jsonSchema` 5 collection: Task 2.
  - Startup version 002: Task 2.
  - Board/task/promote/sync expectedVersion: Task 3-5.
  - Sync transaction + deleted: Task 5.
  - Client conflict: Task 6.
  - Backup/rehearsal/browser: Task 7.
  - Docs/merge: Task 8.
- Không có placeholder `TBD/TODO`.
- Tên type/field thống nhất: `expectedVersion`, `expectedItemVersion`, `deleted`,
  `currentVersion`, `shapeId`, `SyncDeletedItemInput`, `SyncItemsRequest`.
- Không task nào merge `main`.
