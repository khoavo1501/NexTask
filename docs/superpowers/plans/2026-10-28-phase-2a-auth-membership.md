# NexTask Phase 2A - Auth and Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Chuyển NexTask từ demo owner sang tài khoản thật, board có Owner/Member, invitation link và phân quyền server; giữ nguyên dữ liệu Phase 1.

**Architecture:** Thêm `users`, JWT cookie auth, board `members[]`, board access middleware và migration runner có version. API startup chỉ serve khi migration 2A đã áp dụng. UI thêm login/register/logout, invite/accept và owner rename. Chưa làm `$jsonSchema` hay version enforcement.

**Tech Stack:** Node 26, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0 replica set, `jose` 6.2.13, `argon2` 0.45.1, `express-rate-limit` 8.7.1, `cookie-parser` 1.4.7, Next.js 16.4.3, React 19.3.1, Vitest 5.0.5.

**Spec:** `docs/phases/02a-auth-membership.md`

**Branch:** `feat/phase-2a-auth-membership` từ `release/v0.2`. Không commit trực tiếp vào `main`.

**Trạng thái thực thi:** Hoàn thành ngày 2026-10-28 trên feature; chờ merge vào `release/v0.2`. Biên bản trong `docs/phases/02a-auth-membership.md` và `docs/session-log.md`.

**Điều chỉnh thực tế:**

- Migration 001 gom toàn bộ index Phase 1 và index mới; `ensureIndexes()` đã bị xóa.
- Migration test dùng database riêng, không drop test DB dùng chung.
- Logout xóa cookie bằng `Expires=epoch` do Express, test kiểm tra hành vi đó.
- Member promote/move được kiểm chứng trong integration test.
- App DB migration đã backup và rehearsal trước khi áp dụng thật.
- Invitation accept idempotent cho user đã là member.
- Merge vào release và xóa feature được thực hiện sau commit tài liệu; main chưa nhận 2A.

## Global Constraints

- Node 26, TypeScript 6.0.3 strict; giữ cấu trúc monorepo hiện có.
- MongoDB replica set thật cho integration test; không mock DB.
- Giữ nguyên dữ liệu Phase 1: 1 board, 2 note, 2 task tại thời điểm lập plan.
- Không làm `$jsonSchema`, expectedVersion, realtime, demote, batch, voting hoặc report.
- Không gửi email thật; invitation chỉ tạo link.
- JWT cookie 7 ngày; không refresh token.
- Seed owner giữ `_id = 000000000000000000000001`.
- Migration phải backup trước khi chạy trên database ứng dụng.
- Git local, không remote, không push, không amend, không đổi git config.
- Identity commit theo lệnh:
  `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`
- Stage bằng đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Không merge feature vào main trực tiếp; merge vào `release/v0.2` sau khi hoàn tất.
- Không nới timeout test để làm test xanh.
- Mọi trạng thái cuối phase phải có lệnh chạy thật.

---

### Task 0: Git policy, spec approval và plan baseline

**Files:**
- Modify: `docs/git-workflow.md`
- Modify: `docs/phases/02a-auth-membership.md`
- Create: `docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md`
- Modify: `docs/session-log.md`

**Interfaces:**
- Consumes: spec 2A đã được duyệt nội dung.
- Produces: quy trình nhánh, plan 2A, baseline trên feature branch.

- [ ] **Step 1: Xác nhận nhánh**

```bash
git switch feat/phase-2a-auth-membership
git status --short --branch
git branch -vv
```

Expected: đang ở `feat/phase-2a-auth-membership`; working tree sạch.

- [ ] **Step 2: Ghi chiến lược nhánh**

Đảm bảo `docs/git-workflow.md` có:

- `main`: chỉ nhận release/hotfix.
- `release/v0.2`: tích hợp 2A và 2B.
- `feat/phase-2a-auth-membership`: feature hiện tại.
- Feature merge vào release bằng `--no-ff`.
- Release merge vào main khi v0.2 hoàn tất.
- Không push/remote/amend.
- Tag chỉ khi người dùng yêu cầu.
- Xóa feature sau merge bằng `git branch -d`.

- [ ] **Step 3: Cập nhật spec status**

Đổi đầu `docs/phases/02a-auth-membership.md` thành:

```markdown
- Trạng thái: Đã duyệt; implementation plan: [2026-10-28-phase-2a-auth-membership.md](../superpowers/plans/2026-10-28-phase-2a-auth-membership.md)
```

- [ ] **Step 4: Commit baseline**

```bash
git add docs/git-workflow.md docs/phases/02a-auth-membership.md docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: plan phase 2a auth and membership"
```

Expected: một commit mới trên feature; `main` và `release/v0.2` không đổi.

---

### Task 1: Auth dependencies, env và crypto primitives

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `apps/api/src/config/env.ts`
- Create: `apps/api/src/modules/auth/password.ts`
- Create: `apps/api/src/modules/auth/jwt.ts`
- Create: `apps/api/src/modules/auth/cookies.ts`
- Create: `apps/api/test/auth-primitives.test.ts`
- Modify: `apps/api/test/env.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(hash: string, password: string): Promise<boolean>`
  - `signSessionToken(userId: string, options: { secret: string; ttl?: string }): Promise<string>`
  - `verifySessionToken(token: string, secret: string): Promise<string>`
  - `SESSION_COOKIE_NAME`, `sessionCookieOptions(secure: boolean)`.
  - `Env.JWT_SECRET`, `Env.COOKIE_SECURE`, `Env.SEED_OWNER_EMAIL`, `Env.SEED_OWNER_PASSWORD`, `Env.SEED_OWNER_NAME`.

- [ ] **Step 1: Cài dependency**

```bash
npm install jose@6.2.13 argon2@0.45.1 express-rate-limit@8.7.1 cookie-parser@1.4.7 --workspace @nextask/api
npm install --save-dev @types/cookie-parser@1.4.10 --workspace @nextask/api
```

Nếu npm 12 chặn install script của `argon2`, chỉ approve đúng package đó:

```bash
npm install-scripts approve argon2
```

- [ ] **Step 2: Viết test thất bại cho primitives**

`apps/api/test/auth-primitives.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import { signSessionToken, verifySessionToken } from '../src/modules/auth/jwt.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../src/modules/auth/cookies.js';

const secret = 'local-test-jwt-secret-at-least-32-bytes-long';

describe('auth primitives', () => {
  it('hash argon2id và verify đúng/sai', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('ký và verify JWT, trả userId', async () => {
    const token = await signSessionToken('000000000000000000000002', { secret });
    await expect(verifySessionToken(token, secret)).resolves.toBe('000000000000000000000002');
  });

  it('từ chối token hết hạn', async () => {
    const token = await signSessionToken('000000000000000000000002', {
      secret,
      ttl: '-1s',
    });
    await expect(verifySessionToken(token, secret)).rejects.toThrow();
  });

  it('từ chối secret sai', async () => {
    const token = await signSessionToken('000000000000000000000002', { secret });
    await expect(
      verifySessionToken(token, 'another-test-secret-at-least-32-bytes'),
    ).rejects.toThrow();
  });

  it('cookie có flag an toàn và tên ổn định', () => {
    expect(SESSION_COOKIE_NAME).toBe('nextask_session');
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 604800000,
    });
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
```

- [ ] **Step 3: Chạy test đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì module auth chưa tồn tại.

- [ ] **Step 4: Thêm env schema và test env**

`apps/api/src/config/env.ts` thêm:

```ts
COOKIE_SECURE: z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true'),
JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
SEED_OWNER_EMAIL: z.string().email().optional(),
SEED_OWNER_PASSWORD: z.string().min(12).optional(),
SEED_OWNER_NAME: z.string().min(1).max(80).default('Demo Owner'),
```

Không dùng `z.coerce.boolean()` vì chuỗi `"false"` sẽ bị đổi thành `true`.

`.env.example` thêm:

```dotenv
JWT_SECRET=local-dev-only-nextask-jwt-secret-change-me
COOKIE_SECURE=false
SEED_OWNER_EMAIL=owner@nextask.local
SEED_OWNER_PASSWORD=nextask-local-owner-2026
SEED_OWNER_NAME=Demo Owner
```

`docker-compose.yml` thêm cùng biến vào service `api` và `migrate`; đây là giá trị dev-only, README phải cảnh báo.

Cập nhật `validEnv` trong `env.test.ts` với `JWT_SECRET`, `COOKIE_SECURE`, seed owner. Thêm test:

```ts
it('từ chối JWT_SECRET ngắn', () => {
  expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
});
```

- [ ] **Step 5: Implement primitives**

`password.ts`:

```ts
import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

`jwt.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

export async function signSessionToken(
  userId: string,
  options: { secret: string; ttl?: string },
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('nextask-api')
    .setAudience('nextask-web')
    .setIssuedAt()
    .setExpirationTime(options.ttl ?? '7d')
    .sign(encoder.encode(options.secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), {
    issuer: 'nextask-api',
    audience: 'nextask-web',
    algorithms: ['HS256'],
  });
  if (!payload.sub) {
    throw new Error('Token thiếu subject');
  }
  return payload.sub;
}
```

`cookies.ts`:

```ts
import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'nextask_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}
```

- [ ] **Step 6: Chạy test, typecheck, lint**

```bash
npm run test --workspace @nextask/api
npm run typecheck --workspace @nextask/api
npm run lint
```

Expected: primitives pass; env test pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json package-lock.json .env.example docker-compose.yml apps/api/src/config/env.ts apps/api/src/modules/auth/password.ts apps/api/src/modules/auth/jwt.ts apps/api/src/modules/auth/cookies.ts apps/api/test/auth-primitives.test.ts apps/api/test/env.test.ts
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add auth primitives and configuration"
```

---

### Task 2: User model, migration runner, seed owner và schema version

**Files:**
- Create: `apps/api/src/modules/users/user.model.ts`
- Create: `apps/api/src/db/migration-runner.ts`
- Create: `apps/api/src/db/migrations/001-phase-2a.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/db/schema-version.ts`
- Create: `apps/api/src/config/load-env-file.ts`
- Delete: `apps/api/src/db/indexes.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/helpers/test-db.ts`
- Modify: `apps/api/test/indexes.integration.test.ts`
- Create: `apps/api/test/migrations.integration.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `UserModel`, `UserDocument`.
  - `runMigrations(options: MigrationOptions): Promise<string[]>`
  - `assertSchemaVersion(connection, expected): Promise<void>`
  - `MIGRATION_001_NAME = '001-phase-2a'`
  - Compose service `migrate`.
- Consumes: `hashPassword`, env seed.

- [ ] **Step 1: Viết migration test thất bại**

`apps/api/test/migrations.integration.test.ts`:

```ts
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ItemModel } from '../src/modules/items/item.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { runMigrations, MIGRATION_001_NAME } from '../src/db/migration-runner.js';
import { assertSchemaVersion } from '../src/db/schema-version.js';
import { connectMongo } from '../src/db/mongoose.js';
import { testLogger } from './helpers/test-db.js';

const legacyOwnerId = '000000000000000000000001';
const legacyBoardId = new Types.ObjectId();
const migrationTestUri =
  process.env.MONGODB_MIGRATION_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase2_migration_test?directConnection=true';
const migrationEnv = {
  SEED_OWNER_EMAIL: 'owner@nextask.local',
  SEED_OWNER_PASSWORD: 'nextask-local-owner-2026',
  SEED_OWNER_NAME: 'Demo Owner',
};
let connection: Awaited<ReturnType<typeof connectMongo>>;

beforeAll(async () => {
  connection = await connectMongo({ uri: migrationTestUri, logger: testLogger });
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.dropDatabase();

  await connection.db.collection('boards').insertOne({
    _id: legacyBoardId,
    name: 'Legacy',
    ownerId: new Types.ObjectId(legacyOwnerId),
    columns: [],
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await ItemModel.create({
    boardId: legacyBoardId,
    shapeId: 'shape:legacy',
    type: 'note',
    content: 'Legacy note',
    style: {},
    props: {},
    position: { x: 1, y: 2 },
    size: { w: 100, h: 100 },
    rotation: 0,
    tldrawIndex: 'a0',
    parentFrameId: null,
    authorId: new Types.ObjectId(legacyOwnerId),
    votes: [],
    promotedTaskId: null,
    version: 9,
  });
  await TaskModel.create({
    boardId: legacyBoardId,
    columnId: 'todo',
    order: 'a0',
    title: 'Legacy task',
    description: '',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 4,
    createdBy: new Types.ObjectId(legacyOwnerId),
  });

  await runMigrations({ connection, env: migrationEnv });
});

afterAll(async () => {
  await connection.close();
});

describe('migration 2A', () => {
  it('backfill owner member và tạo seed owner', async () => {
    const owner = await UserModel.findById(legacyOwnerId).exec();
    expect(owner?.emailNormalized).toBe('owner@nextask.local');
    expect(owner?.passwordHash).not.toContain('nextask-local-owner-2026');

    if (!connection.db) throw new Error('DB chưa kết nối');
    const board = await connection.db.collection('boards').findOne({ _id: legacyBoardId });
    expect(board?.members).toEqual([
      expect.objectContaining({
        userId: new Types.ObjectId(legacyOwnerId),
        role: 'owner',
      }),
    ]);
  });

  it('idempotent và giữ item/task/version', async () => {
    const migrations = await runMigrations({ connection, env: migrationEnv });
    expect(migrations).not.toContain(MIGRATION_001_NAME);
    expect((await ItemModel.findOne({ shapeId: 'shape:legacy' }))?.version).toBe(9);
    expect((await TaskModel.findOne({ title: 'Legacy task' }))?.version).toBe(4);
    await expect(
      assertSchemaVersion(connection, MIGRATION_001_NAME),
    ).resolves.toBeUndefined();
  });

  it('index cần thiết tồn tại', async () => {
    const indexes = await UserModel.collection.indexes();
    expect(indexes.some((index) => index.name === 'users_email_normalized_unique')).toBe(true);
  });
});
```

Helper migration test nên được tách nếu các file test khác cần seed; không lặp logic trong production.

- [ ] **Step 2: Chạy test đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì migration runner/user model chưa tồn tại.

- [ ] **Step 3: Tạo User model**

`apps/api/src/modules/users/user.model.ts`:

```ts
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface User {
  email: string;
  emailNormalized: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    email: { type: String, required: true, trim: true },
    emailNormalized: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User> | undefined) ??
  mongoose.model<User>('User', userSchema);
```

Index được tạo trong migration, không khai báo autoIndex.

- [ ] **Step 4: Implement migration runner**

`schema-version.ts` đọc `schema_migrations`; `assertSchemaVersion` ném lỗi nếu thiếu.

`migration-runner.ts`:

```ts
export interface MigrationEnv {
  SEED_OWNER_EMAIL?: string;
  SEED_OWNER_PASSWORD?: string;
  SEED_OWNER_NAME?: string;
}

export interface MigrationOptions {
  connection: Connection;
  env: MigrationEnv;
}

export interface Migration {
  name: string;
  up(options: MigrationOptions): Promise<void>;
}

export const MIGRATION_001_NAME = '001-phase-2a';
const migrations: Migration[] = [phase2aMigration];

export async function runMigrations(options: MigrationOptions): Promise<string[]> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const collection = db.collection('schema_migrations');
  await collection.createIndex({ appliedAt: 1 });
  const applied: string[] = [];
  for (const migration of migrations) {
    const exists = await collection.findOne({ _id: migration.name });
    if (exists) continue;
    await migration.up(options);
    await collection.insertOne({ _id: migration.name, appliedAt: new Date() });
    applied.push(migration.name);
  }
  return applied;
}
```

Mỗi migration `up` phải idempotent để retry sau lỗi giữa chừng.

- [ ] **Step 5: Implement migration 001**

`001-phase-2a.ts` thực hiện theo thứ tự:

1. `createIndex` idempotent cho tất cả index Phase 1 và index mới:
   - boards `{ownerId:1, updatedAt:-1}`.
   - boards `{'members.userId':1, updatedAt:-1}`.
   - items `{boardId:1, shapeId:1}` unique.
   - items `{boardId:1, type:1}`.
   - tasks `{sourceItemId:1}` unique partial active.
   - tasks `{boardId:1, columnId:1, order:1}` partial active.
   - users `{emailNormalized:1}` unique, name `users_email_normalized_unique`.
   - invitations `{tokenHash:1}` unique.
   - invitations `{boardId:1, createdAt:-1}`.
   - invitations `{expiresAt:1}` TTL `expireAfterSeconds: 0`.
2. Seed owner nếu tồn tại board owner legacy:
   - Nếu user id legacy chưa có, yêu cầu `SEED_OWNER_EMAIL` + `SEED_OWNER_PASSWORD`.
   - Hash password bằng `hashPassword`.
   - Tạo user `_id = ObjectId('000000000000000000000001')`, email normalized, name.
   - Nếu user đã có, không reset password.
3. Backfill members:
   - Với mỗi board, nếu chưa có member owner, push `{userId: ownerId, role:'owner', joinedAt: board.createdAt}`.
   - Nếu có owner member nhưng role sai, set role owner.
4. Xác nhận mọi `board.ownerId` có User tương ứng; nếu không, throw.
5. Không update item/task/version/timestamps.
6. Tạo collection `invitations` qua index (Mongo tạo khi cần).
7. Ghi migration version bởi runner.

- [ ] **Step 6: Thêm migration entrypoint và Compose**

`apps/api/src/config/load-env-file.ts`:

```ts
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadRootEnvFile(): void {
  // Từ apps/api/src/config lên root repository là bốn cấp.
  const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
}
```

`apps/api/src/server.ts` thay đoạn load `.env` inline bằng `loadRootEnvFile()`.

`apps/api/src/db/migrate.ts`:

```ts
import { loadEnv } from '../config/env.js';
import { loadRootEnvFile } from '../config/load-env-file.js';
import { connectMongo } from './mongoose.js';
import { runMigrations } from './migration-runner.js';
import { createLogger } from '../lib/logger.js';

loadRootEnvFile();

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });
  const applied = await runMigrations({
    connection,
    env: {
      SEED_OWNER_EMAIL: env.SEED_OWNER_EMAIL,
      SEED_OWNER_PASSWORD: env.SEED_OWNER_PASSWORD,
      SEED_OWNER_NAME: env.SEED_OWNER_NAME,
    },
  });
  logger.info({ applied }, 'Migrations complete');
  await connection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- `apps/api/package.json` thêm script `"db:migrate": "tsx src/db/migrate.ts"` và build script đã có.
- Compose thêm service `migrate` dùng image API, command `node dist/db/migrate.js`, `depends_on mongo-init`, env giống API và seed.
- `api` depends_on `migrate: service_completed_successfully`.
- Dockerfile build đã copy toàn bộ dist; kiểm tra `dist/db/migrate.js` tồn tại.

- [ ] **Step 7: Bỏ ensureIndexes runtime và kiểm tra schema version**

`server.ts`:

```ts
await assertSchemaVersion(connection, MIGRATION_001_NAME);
```

Xóa `ensureIndexes()` khỏi server và `test-db.ts`. Xóa file `db/indexes.ts`.

`test-db.ts`:

- Đổi database test mặc định sang `nextask_phase2_test`:

```ts
export const testUri =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase2_test?directConnection=true';
```

- Chạy migration sau khi kết nối:

```ts
export async function connectTestDb(): Promise<Connection> {
  const connection = await connectMongo({ uri: testUri, logger: testLogger });
  await runMigrations({
    connection,
    env: {
      SEED_OWNER_EMAIL: 'owner@nextask.local',
      SEED_OWNER_PASSWORD: 'nextask-local-owner-2026',
      SEED_OWNER_NAME: 'Demo Owner',
    },
  });
  return connection;
}
```

- `cleanDb` phải giữ collection `schema_migrations`:

```ts
await Promise.all(
  collections
    .filter(
      (collection) =>
        !collection.name.startsWith('system.') && collection.name !== 'schema_migrations',
    )
    .map((collection) => db.collection(collection.name).deleteMany({})),
);
```

- [ ] **Step 8: Chạy test, typecheck, lint**

```bash
npm run test --workspace @nextask/api
npm run typecheck --workspace @nextask/api
npm run lint
```

Expected: migration test pass, index test pass, health/env pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/users/user.model.ts apps/api/src/db/migration-runner.ts apps/api/src/db/migrations/001-phase-2a.ts apps/api/src/db/migrate.ts apps/api/src/db/schema-version.ts apps/api/src/config/load-env-file.ts apps/api/src/db/indexes.ts apps/api/src/server.ts apps/api/test/helpers/test-db.ts apps/api/test/indexes.integration.test.ts apps/api/test/migrations.integration.test.ts apps/api/package.json apps/api/Dockerfile docker-compose.yml .env.example
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add versioned migration and legacy owner seed"
```

---

### Task 3: Auth API và middleware

**Files:**
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.middleware.ts`
- Create: `apps/api/src/modules/auth/auth.router.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/types/express.d.ts`
- Modify: `apps/api/test/health.integration.test.ts`
- Create: `apps/api/test/auth.integration.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/auth.ts`

**Interfaces:**
- Produces:
  - `authenticate` middleware; `request.user: UserDocument`.
  - `createAuthRouter(options:{jwtSecret:string; cookieSecure:boolean; rateLimitMax:number}): Router`.
  - Auth endpoints.
  - `UserDto` không có passwordHash.

- [ ] **Step 1: Viết auth integration test thất bại**

`apps/api/test/auth.integration.test.ts`:

```ts
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signSessionToken } from '../src/modules/auth/jwt.js';
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

const credentials = {
  email: 'Owner@Example.com',
  password: 'correct horse battery staple',
  name: 'Owner',
};

describe('auth', () => {
  it('register, set cookie HttpOnly và trả user không có hash', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);
    expect(response.body.data.emailNormalized).toBe('owner@example.com');
    expect(response.body.data.passwordHash).toBeUndefined();
    const cookie = response.headers['set-cookie']?.join('; ') ?? '';
    expect(cookie).toContain('nextask_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('email trùng trả 409', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    await request(app).post('/api/v1/auth/register').send(credentials).expect(409);
  });

  it('login đúng và /me bằng cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials).expect(201);
    await agent.post('/api/v1/auth/logout').expect(204);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.emailNormalized).toBe('owner@example.com');
  });

  it('login sai trả 401 chung', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong password' })
      .expect(401);
  });

  it('logout xóa cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials).expect(201);
    const response = await agent.post('/api/v1/auth/logout').expect(204);
    expect(response.headers['set-cookie']?.join('; ')).toContain('Max-Age=0');
  });

  it('thiếu cookie /me trả 401', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });

  it('token hết hạn bị từ chối', async () => {
    const token = await signSessionToken('000000000000000000000001', {
      secret: jwtSecret,
      ttl: '-1s',
    });
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `nextask_session=${token}`);
    expect(response.status).toBe(401);
  });

  it('origin lạ bị chặn ở mutation', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://evil.test')
      .send(credentials)
      .expect(403);
  });

  it('rate limit auth', async () => {
    const limited = createApp({
      connection,
      expectedReplicaSet: 'rs0',
      version: '0.1.0-test',
      corsOrigin: 'http://localhost:3000',
      logger,
      jwtSecret,
      cookieSecure: false,
      authRateLimitMax: 1,
    });
    await request(limited).post('/api/v1/auth/login').send({ email: 'a@b.test', password: 'x' }).expect(401);
    await request(limited).post('/api/v1/auth/login').send({ email: 'a@b.test', password: 'x' }).expect(429);
  });
});
```

- [ ] **Step 2: Chạy đỏ**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì auth router/middleware chưa tồn tại.

- [ ] **Step 3: Implement contracts auth**

`packages/contracts/src/auth.ts`:

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';
import { objectIdSchema } from './common.js';

export const registerRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80),
});

export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const userSchema = z.object({
  _id: objectIdSchema,
  email: z.string().email(),
  emailNormalized: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userResponseSchema = z.object({
  data: userSchema,
  meta: envelopeMetaSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserDto = z.infer<typeof userSchema>;
```

Export từ `index.ts`.

- [ ] **Step 4: Implement auth service**

`auth.service.ts`:
- `normalizeEmail`.
- `registerUser(input)`: check duplicate by emailNormalized; `hashPassword`; create; catch duplicate key 11000 -> AppError 409 `EMAIL_IN_USE`.
- `loginUser(input)`: find user; if missing use a dummy hash verify or generic delay? For v1, verify only if exists; ensure same generic error. To reduce timing leak, run `verifyPassword` against a fixed dummy hash when user missing. Include:
  - `DUMMY_HASH` generated? A constant argon2 hash. Could generate at module load asynchronously? Simpler if user missing, call `verifyPassword` on a precomputed valid hash constant. The plan can include a precomputed test hash, but generating now not needed. The implementation can hash once at startup? Too much. For v1, generic error enough; timing side channel accepted? Security basic. We can mention. 
  - Keep simple.
- `sanitizeUser` serializer.
- `findUserById`.

- [ ] **Step 5: Implement JWT/cookie middleware**

`auth.middleware.ts`:
- Read `request.cookies[SESSION_COOKIE_NAME]` (cookie-parser mounted in app).
- Verify token, load user; 401 on any failure.
- Set `request.user`.
- Maybe helper `requireAuth` used on routes.
- `/auth/me` uses it.
- Auth router uses cookie options.
- App uses `cookieParser()`.
- Origin guard:
  - `originGuard(corsOrigin)` for unsafe methods; if `Origin` present and not equal -> 403.
  - Mount before routes.
- Rate limiter in auth router (login/register).
- `express-rate-limit` with standardHeaders, legacyHeaders false, max; skip health. 
- Cookie secure from deps.

- [ ] **Step 6: Router**

- POST register: parse; create; sign token; set cookie; 201 envelope.
- POST login: parse; verify; sign; set; 200.
- POST logout: clear cookie; 204.
- GET me: authenticate; 200.
- Login errors generic.
- No passwordHash.

- [ ] **Step 7: App/server wiring**

- AppDependencies add jwtSecret, cookieSecure, authRateLimitMax.
- `app.use(cookieParser())`.
- `app.use(originGuard(corsOrigin))` for unsafe methods.
- Mount `/api/v1/auth`.
- Health tests/createApp calls update.
- Server passes env values.
- Add `JWT_SECRET` etc to env already.
- Ensure auth routes public, health public.
- Board routes still demo for now; will switch Task 4.

- [ ] **Step 8: Run tests, typecheck, lint**

- [ ] **Step 9: Commit**

---

### Task 4: Board membership, access control và role

**Files:**
- Modify: `packages/contracts/src/board.ts`
- Modify: `apps/api/src/modules/boards/board.model.ts`
- Modify: `apps/api/src/modules/boards/board.service.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Create: `apps/api/src/modules/boards/board-access.ts`
- Modify: `apps/api/src/modules/items/item.router.ts`
- Modify: `apps/api/src/modules/items/item.service.ts`
- Modify: `apps/api/src/modules/items/promotion.service.ts`
- Modify: `apps/api/src/modules/tasks/task.router.ts`
- Modify: `apps/api/src/modules/tasks/task.service.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/types/express.d.ts`
- Modify: `apps/api/src/config/env.ts` (bỏ DEMO_OWNER_ID nếu không còn dùng)
- Modify: `docker-compose.yml`, `.env.example`
- Create: `apps/api/src/modules/users/user.presenter.ts`
- Create: `apps/api/test/helpers/auth.ts`
- Modify: tests Phase 1 và test helpers.
- Create: `apps/api/test/membership.integration.test.ts`.

**Interfaces:**
- Consumes: authenticate, UserModel, migration.
- Produces:
  - Board DTO members/viewerRole.
  - `loadBoardAccess` middleware.
  - `requireOwner` middleware.
  - Board list by membership.
  - Owner rename and member list.
  - Existing item/task/promote endpoints require membership.

- [ ] **Step 1: Viết membership test thất bại**

`apps/api/test/membership.integration.test.ts`:

`apps/api/test/helpers/auth.ts`:

```ts
import request from 'supertest';
import type { Express } from 'express';

export async function registerAgent(app: Express, email: string, name: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/register').send({
    email,
    password: 'correct horse battery staple',
    name,
  });
  if (response.status !== 201) {
    throw new Error(`Register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { agent, user: response.body.data as { _id: string } };
}
```

`apps/api/test/membership.integration.test.ts`:

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

describe('membership và role', () => {
  it('tạo board có owner member và role viewer', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const response = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    expect(response.body.data.viewerRole).toBe('owner');
    expect(response.body.data.members).toHaveLength(1);
    expect(response.body.data.members[0]).toMatchObject({
      userId: owner.user._id,
      role: 'owner',
    });
  });

  it('Member đọc board nhưng không đổi tên', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const member = await registerAgent(app, 'member@example.com', 'Member');
    const board = await owner.agent
      .post('/api/v1/boards')
      .send({ name: 'Retro' })
      .expect(201);
    const boardId = board.body.data._id as string;

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

    const read = await member.agent.get(`/api/v1/boards/${boardId}`).expect(200);
    expect(read.body.data.viewerRole).toBe('member');
    await member.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Hacked' })
      .expect(403);

    const members = await owner.agent
      .get(`/api/v1/boards/${boardId}/members`)
      .expect(200);
    expect(members.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: owner.user._id, role: 'owner' }),
        expect.objectContaining({ userId: member.user._id, role: 'member' }),
      ]),
    );
    expect(members.body.data[0].passwordHash).toBeUndefined();
  });

  it('owner rename thành công', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
    const boardId = board.body.data._id as string;
    const renamed = await owner.agent
      .patch(`/api/v1/boards/${boardId}`)
      .send({ name: 'Retro mới' })
      .expect(200);
    expect(renamed.body.data.name).toBe('Retro mới');
  });

  it('non-member nhận 404', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const stranger = await registerAgent(app, 'stranger@example.com', 'Stranger');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
    await stranger.agent.get(`/api/v1/boards/${board.body.data._id}`).expect(404);
  });

  it('member list theo membership', async () => {
    const owner = await registerAgent(app, 'owner@example.com', 'Owner');
    const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
    const list = await owner.agent.get('/api/v1/boards').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(board.body.data.name).toBe('Retro');
  });
});
```

- [ ] **Step 2: Chạy đỏ**

- [ ] **Step 3: Cập nhật contracts board**

`memberSchema`:

```ts
export const boardMemberSchema = z.object({
  userId: objectIdSchema,
  role: z.enum(['owner', 'member']),
  joinedAt: isoDateSchema,
});
```

Board thêm `members`, `viewerRole`.

- [ ] **Step 4: Cập nhật Board model và service**

- `members` schema `_id:false`.
- Create board thêm owner member.
- List by `members.userId`.
- Get board access by membership; non-member throw 404.
- Rename board name.
- Member list lookup users and return name/email.
- Serializer viewerRole parameter; board list computes membership role.

- [ ] **Step 5: Board access middleware**

`board-access.ts`:

```ts
export async function loadBoardAccess(request, response, next) {
  const boardId = request.params.boardId;
  if (!Types.ObjectId.isValid(boardId)) {
    next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy board'));
    return;
  }
  const board = await BoardModel.findOne({
    _id: boardId,
    'members.userId': request.user._id,
  }).exec();
  if (!board) {
    next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy board'));
    return;
  }
  const member = board.members.find((entry) => entry.userId.equals(request.user._id));
  if (!member) {
    next(new AppError(404, 'NOT_FOUND', 'Không tìm thấy board'));
    return;
  }
  request.board = board;
  request.boardRole = member.role;
  next();
}

export function requireOwner(request, _response, next) {
  if (request.boardRole !== 'owner') {
    next(new AppError(403, 'FORBIDDEN', 'Chỉ Owner được thực hiện thao tác này'));
    return;
  }
  next();
}
```

- Express request type thêm `board?: BoardDocument`, `boardRole?: 'owner'|'member'`, `user: UserDocument`.
- Board routes mount auth + access.
- `GET /boards`, `POST /boards` auth only.
- `/:boardId` access.
- PATCH owner.
- GET members.
- Nested item/task routers use `request.board`.
- Item/task/promotion services refactor to accept `board: BoardDocument` and `userId`; remove owner checks that query board.
- Existing `getBoardForOwner` removed.
- `promoteItem` input `board: BoardDocument`; ensures item boardId.
- Tests refactor.

- [ ] **Step 6: Cập nhật toàn bộ test Phase 1**

- Test helper `registerAgent`.
- Existing workspace/promotion tests create users and boards via agent.
- Remove `demoOwnerId`.
- Every createApp call adds auth deps.
- Existing health test unchanged except app deps.
- Item/task tests use owner agent.
- Board service tests update.
- No test-only bypass; all board APIs authenticated.

- [ ] **Step 7: Remove legacy demo owner runtime**

- Remove `DEMO_OWNER_ID` from env schema, `.env.example`, Compose API env.
- Keep legacy ID constant only in migration.
- Remove `createDemoOwnerMiddleware` and file.
- Update app deps and server.
- `seed owner` still via migration env.

- [ ] **Step 8: Run tests, typecheck, lint**

- [ ] **Step 9: Commit**

---

### Task 5: Invitations

**Files:**
- Create: `packages/contracts/src/invitation.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/modules/invitations/invitation.model.ts`
- Create: `apps/api/src/modules/invitations/invitation.service.ts`
- Create: `apps/api/src/modules/invitations/invitation.router.ts`
- Modify: `apps/api/src/modules/boards/board.router.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/db/migrations/001-phase-2a.ts` nếu index invitation chưa có.
- Create: `apps/api/test/invitations.integration.test.ts`
- Modify: `apps/api/test/membership.integration.test.ts` để dùng invitation thay vì push member.

**Interfaces:**
- Produces:
  - `createInvitation(board, actor, email?)`.
  - `acceptInvitation(rawToken, user)`.
  - `POST /boards/:id/invitations`, `POST /invitations/:token/accept`.

- [ ] **Step 1: Viết test thất bại**

Test cases:

- Owner tạo invitation, nhận token/path, DB chỉ có hash.
- Token accept bởi Member; board members có member mới; usedAt set.
- Token đã dùng trả 404.
- Token hết hạn trả 404.
- Email mismatch trả 403.
- Member tạo invitation 403.
- Non-member accept? Requires auth; any authenticated user with token can accept if email matches.
- Board list member thấy board sau accept.
- TTL index tồn tại.

Code mẫu cho accept:

```ts
it('member accept invitation trong transaction', async () => {
  const owner = await registerAgent(app, 'owner@example.com', 'Owner');
  const invitee = await registerAgent(app, 'invitee@example.com', 'Invitee');
  const board = await owner.agent.post('/api/v1/boards').send({ name: 'Retro' });
  const boardId = board.body.data._id as string;
  const invitation = await owner.agent
    .post(`/api/v1/boards/${boardId}/invitations`)
    .send({ email: 'invitee@example.com' })
    .expect(201);

  const accepted = await invitee.agent
    .post(`/api/v1/invitations/${invitation.body.data.token}/accept`)
    .expect(200);

  expect(accepted.body.data.viewerRole).toBe('member');
  const boards = await invitee.agent.get('/api/v1/boards').expect(200);
  expect(boards.body.data.map((entry: { _id: string }) => entry._id)).toContain(boardId);
  await invitee.agent
    .post(`/api/v1/boards/${boardId}/invitations`)
    .send({})
    .expect(403);
});
```

- [ ] **Step 2: Chạy đỏ**

- [ ] **Step 3: Implement model/contracts**

- Fields per spec.
- Indexes created in migration, not schema.
- `InvitationDto` create response includes token/path/expiresAt; accept response board/user role maybe BoardDto.

- [ ] **Step 4: Implement service**

- `createToken`: `randomBytes(32).toString('base64url')`; hash `sha256`.
- Owner-only enforcement via route middleware.
- Email normalize if present.
- Expiry 7 days.
- Store hash.
- Accept:
  - Find by hash.
  - Check usedAt/expiry/email.
  - If already member, mark used and return board.
  - Transaction: update board `$push` member and invitation usedAt.
  - Return board DTO with role member.
  - Avoid duplicate membership.
- Token not logged.
- TTL index in migration 001.

- [ ] **Step 5: Implement routes and app mounting**

- Board owner router creates invitation.
- `/api/v1/invitations/:token/accept` authenticated; no board access middleware because token grants membership. Auth only.
- Rate limit? no.
- Error mapping.

- [ ] **Step 6: Run tests, typecheck, lint**

- [ ] **Step 7: Commit**

---

### Task 6: Web auth, login/register, protected board list

**Files:**
- Modify: `packages/contracts/src/auth.ts` (nếu cần types)
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/lib/server-api.ts`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/register/page.tsx`
- Create: `apps/web/components/auth-header.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/boards/[boardId]/page.tsx`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/app/layout.tsx` nếu cần.

**Interfaces:**
- Consumes auth contracts/API.
- Produces cookie-based UI auth and protected board list.

- [ ] **Step 1: API client**

- Thêm `credentials: 'include'` vào mọi fetch.
- Hàm `register`, `login`, `logout`, `getMe`.
- `ApiServerError` giữ status.
- 401 trên board page chuyển login.

- [ ] **Step 2: Server board list**

- `fetchBoardsServer(cookieHeader)` gửi header `Cookie`.
- Root page dùng `cookies()` để lấy cookie, nếu rỗng redirect `/login`.
- API trả 401 -> redirect `/login`.
- Không cache.
- Health page vẫn public.

- [ ] **Step 3: Login/register pages**

- Client component.
- Form name/email/password.
- `next` an toàn:
  - Chỉ nhận path bắt đầu `/`, không bắt đầu `//`.
- Register auto-login từ API.
- Lỗi 401/409/422 hiển thị.
- Sau thành công push `next` hoặc `/`.

- [ ] **Step 4: Auth header**

- Client fetch `/auth/me` with credentials.
- Hiển thị tên user.
- Nút logout gọi API, push login.
- Nếu 401, ẩn tên và chuyển login ở trang protected.

- [ ] **Step 5: Board page**

- Client API 401 chuyển login và giữ đường dẫn hiện tại:

```ts
const nextPath = `${window.location.pathname}${window.location.search}`;
router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
```
- Hiển thị role header.
- Giữ chức năng hiện có.

- [ ] **Step 6: Build web**

```bash
npm run build --workspace @nextask/web
```

- [ ] **Step 7: Commit**

---

### Task 7: Invite, accept và owner rename UI

**Files:**
- Create: `apps/web/app/invitations/[token]/page.tsx`
- Create: `apps/web/features/workspace/invite-dialog.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/features/workspace/board-workspace.tsx`
- Modify: `apps/web/components/auth-header.tsx`
- Modify: `apps/web/app/login/page.tsx`, `register/page.tsx` cho `next`.

**Interfaces:**
- Consumes invitation API, board viewerRole.
- Produces owner invite/rename UI and member accept UI.

- [ ] **Step 1: API client**

- `createInvitation(boardId, email?)`.
- `acceptInvitation(token)`.
- `renameBoard(boardId, name)`.
- Parse response contracts.

- [ ] **Step 2: Owner controls**

- BoardWorkspace dùng `viewerRole`.
- Owner thấy nút `Mời` và `Đổi tên`.
- Member không thấy.
- Invite dialog:
  - Email optional.
  - Tạo link; copy bằng `navigator.clipboard.writeText`.
  - Hiển thị link chỉ một lần.
- Rename dialog/input.
- On success cập nhật board name/state.

- [ ] **Step 3: Accept page**

- Client page nhận token.
- Nếu chưa đăng nhập: chuyển `/login?next=/invitations/<token>`.
- Gọi accept, hiển thị board, link vào board.
- Token invalid hiển thị lỗi.

- [ ] **Step 4: Build và browser**

- Owner login seed, mở board.
- Tạo second account, mời, accept.
- Member thấy board, không thấy nút mời/rename.
- Member promote/move.
- Owner rename.
- API verify member PATCH 403.

- [ ] **Step 5: Commit**

---

### Task 8: Apply migration, Docker, verification và merge release

**Files:**
- Modify: `docker-compose.yml`, `apps/api/Dockerfile`, `.env.example`, `README.md`
- Modify: `docs/phases/02a-auth-membership.md`
- Modify: `docs/session-log.md`
- Modify: `docs/mongodb-notes.md`
- Modify: `docs/git-workflow.md`
- Modify: plan file checkboxes/status.

**Interfaces:**
- Consumes toàn bộ 2A.
- Produces migration trên app DB, verification, merge feature vào release.

- [ ] **Step 1: Backup database ứng dụng trước migration**

```bash
mkdir -p backups
docker compose exec -T mongo mongodump --archive --gzip --db=nextask > backups/nextask-before-2a-2026-10-28.gz
```

Expected: file backup tồn tại và có kích thước lớn hơn 0. Không xóa backup.

- [ ] **Step 2: Build và chạy migrate**

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test
npm run test
docker compose build
docker compose up -d
docker compose ps
```

- `migrate` service phải exit 0 trước API.
- Verify board/note/task cũ còn:
  ```bash
  docker compose exec -T mongo mongosh --quiet --eval 'const d=db.getSiblingDB("nextask"); JSON.stringify({boards:d.boards.countDocuments({}),items:d.items.countDocuments({}),tasks:d.tasks.countDocuments({})})'
  ```
- Dùng seed owner đăng nhập; board cũ mở được.
- Health vẫn 200.

- [ ] **Step 3: Browser E2E**

- Seed owner login, thấy board cũ.
- Tạo user Member thứ hai.
- Owner tạo invite link.
- Member mở link, accept, thấy board.
- Member promote/move được.
- Member không thấy nút mời/rename.
- Owner rename board.
- Gọi PATCH board trực tiếp bằng cookie Member: 403.
- Cookie HttpOnly.
- Ghi kết quả vào session log.

- [ ] **Step 4: Cập nhật tài liệu**

- Phase 2A status, results, acceptance.
- Session log: migration, counts before/after, commits, browser, tests.
- MongoDB notes: migration runner, seed, member index, no `$jsonSchema` yet.
- README: login credentials local, JWT env, branch workflow, how to run migrate.
- Git workflow: feature commit list, merge result.
- Plan status: completed, deviations.

- [ ] **Step 5: CJK và placeholder scan**

```bash
grep -RInP '[\x{4e00}-\x{9fff}\x{3040}-\x{30ff}]' docs README.md apps/api/src apps/api/test apps/web/app apps/web/components apps/web/features apps/web/lib packages/contracts/src docker docker-compose.yml 2>/dev/null || true
grep -RInE 'TODO|FIXME|TBD' docs README.md apps/api/src apps/api/test apps/web/app apps/web/components apps/web/features apps/web/lib packages/contracts/src docker docker-compose.yml 2>/dev/null | grep -v 'grep -RInE' || true
```

- [ ] **Step 6: Commit final docs trên feature**

```bash
git add README.md docs/phases/02a-auth-membership.md docs/session-log.md docs/mongodb-notes.md docs/git-workflow.md docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 2a verification"
```

- [ ] **Step 7: Merge feature vào release/v0.2**

```bash
git switch release/v0.2
git merge --no-ff feat/phase-2a-auth-membership -m "merge: phase 2a auth and membership"
```

Sau merge chạy lại:

```bash
npm run typecheck
npm run lint
npm run test
```

- Nếu conflict, resolve và chạy lại; không dùng reset hard.
- Không merge release vào main; v0.2 còn Phase 2B.

- [ ] **Step 8: Xóa feature branch đã merge**

```bash
git branch -d feat/phase-2a-auth-membership
git branch -vv
git status --short --branch
```

Expected: đang ở `release/v0.2`, feature đã xóa, working tree sạch, main chưa đổi.

- [ ] **Step 9: Ghi nhận trạng thái cuối**

Cập nhật session log với:

- commit merge trên release.
- feature branch đã xóa.
- main chưa nhận v0.2.
- việc tiếp theo là Phase 2B.

Sau đó commit session log trên release:

```bash
git add docs/session-log.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 2a branch merge"
```

---

## Self-review của kế hoạch

- Spec coverage: auth, user model, membership, role, invitation, migration, seed owner, UI, tests, Docker, merge đều có task.
- Không có `$jsonSchema` hoặc expectedVersion trong 2A.
- Dữ liệu Phase 1 được backup và test preservation.
- Test auth/migration dùng MongoDB thật.
- Git chỉ commit trên feature; merge vào release; main không nhận 2A.
- Không dùng remote/push/amend/config.
- Các interface `userId`, `boardRole`, `members`, `viewerRole`, `tokenHash` được dùng nhất quán.
- Các bước UI có route và API cụ thể, không có placeholder.
