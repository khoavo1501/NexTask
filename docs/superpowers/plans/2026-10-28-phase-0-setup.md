# NexTask Giai đoạn 0 - Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) hoặc superpowers:executing-plans để thực hiện kế hoạch này theo từng task. Các bước dùng checkbox (`- [ ]`).

**Goal:** Dựng monorepo NexTask chạy bằng Docker Compose với MongoDB 8.0 replica set một nút, API Express health-check thật và web Next.js hiển thị trạng thái; có Git cục bộ, lint, typecheck và integration test.

**Architecture:** npm workspaces gồm `apps/api`, `apps/web`, `packages/contracts`. MongoDB `rs0` chạy bằng Compose; `mongo-init` initiate replica set idempotent. API kết nối Mongoose, xác nhận `hello.setName` trước khi serve, health gọi MongoDB thật. Web server component gọi API qua mạng nội bộ Docker.

**Tech Stack:** Node 26, TypeScript 6.0.3, Express 5.3.0, Mongoose 9.11.4, MongoDB 8.0, zod 4.6.7, pino 10.4.0, Next.js 16.4.3, React 19.3.1, Tailwind 4.3.3, Vitest 5.0.5, Docker Compose.

**Spec:** `docs/architecture.md` và `docs/phases/00-setup.md`

## Global Constraints

- Node >= 26; image `node:26-bookworm-slim`.
- TypeScript 6.0.3, strict, `noUncheckedIndexedAccess`.
- MongoDB 8.0, replica set `rs0`, một nút, không auth local, chỉ bind `127.0.0.1`.
- API dùng Mongoose với `autoIndex: false`, `bufferCommands: false`.
- Integration test dùng MongoDB replica set thật; không mock DB.
- Không thêm auth, board, item, task, tldraw, Change Streams trong Giai đoạn 0.
- UI tiếng Việt; code và tên trường tiếng Anh.
- Git cục bộ trên `main`, không remote, không push, không amend, không đổi git config.
- Commit với identity theo từng lệnh: `git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit`.
- Stage bằng đường dẫn cụ thể; cấm `git add -A` và `git add .`.
- Không nới timeout test để làm test xanh.
- Mọi số liệu/trạng thái cuối cùng phải lấy từ lệnh chạy thật trong phiên và ghi vào `docs/session-log.md`.

---

### Task 0: Git baseline và tài liệu quản lý Git

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `docs/git-workflow.md`
- Modify: `docs/architecture.md`
- Create: `docs/superpowers/plans/2026-10-28-phase-0-setup.md`

**Interfaces:**
- Consumes: tài liệu spec đã được duyệt.
- Produces: repository Git cục bộ, quy tắc commit, baseline tài liệu.

- [ ] **Step 1: Tạo `.gitignore` và `.gitattributes`**

`.gitignore`:

```gitignore
node_modules/
dist/
.next/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/
.idea/
playwright-report/
test-results/
backups/
```

`.gitattributes`:

```gitattributes
* text=auto eol=lf
```

- [ ] **Step 2: Tạo `docs/git-workflow.md`**

Nội dung tối thiểu:

```markdown
# Quy trình Git của NexTask

- Repository cục bộ, nhánh `main`, chưa có remote.
- Không push, tag, merge hoặc tạo PR nếu người dùng chưa yêu cầu.
- Không sửa git config. Identity truyền theo từng lệnh commit.
- Không amend commit đã tạo.
- Stage bằng đường dẫn cụ thể. Không dùng `git add -A` hoặc `git add .`.
- Mỗi task/phase có commit riêng với tiền tố `docs:`, `chore:`, `feat:`, `test:`, `fix:`.
- Trước commit: `git status --short`, review diff, chạy kiểm tra liên quan.
- Không commit `.env`, secret, log, coverage hoặc build output.
```

- [ ] **Step 3: Liên kết quy trình Git trong kiến trúc**

Thêm mục cuối `docs/architecture.md`:

```markdown
## 19. Quản lý Git

Repository là Git cục bộ trên nhánh `main`, không có remote trong v1. Không push, amend hoặc đổi git config.
Chi tiết quy tắc stage, identity và commit nằm trong [git-workflow.md](./git-workflow.md).
```

- [ ] **Step 4: Khởi tạo Git và commit baseline**

```bash
git init -b main
git add .gitignore .gitattributes docs/architecture.md docs/mongodb-notes.md docs/phases/00-setup.md docs/session-log.md docs/git-workflow.md docs/superpowers/plans/2026-10-28-phase-0-setup.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: establish NexTask architecture and phase 0 plan"
```

- [ ] **Step 5: Kiểm tra**

```bash
git status --short
git log -1 --oneline
git remote -v
```

Expected: working tree sạch; một commit; `git remote -v` không in gì.

---

### Task 1: Workspace, contracts và MongoDB replica set để test

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/envelope.ts`
- Create: `packages/contracts/src/health.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `docker-compose.yml`
- Create: `docker/mongo/init-replica.js`
- Create: `package-lock.json` (npm sinh)

**Interfaces:**
- Consumes: Git baseline.
- Produces:
  - `@nextask/contracts` export `healthDataSchema`, `healthResponseSchema`, `apiErrorSchema`, types `HealthData`, `HealthResponse`.
  - Mongo `rs0` sẵn sàng tại host qua `directConnection=true` và trong Docker qua `mongo:27017`.
  - Root scripts `build:contracts`, `typecheck`, `lint`, `test`, `verify`.

- [ ] **Step 1: Tạo manifest root**

`package.json`:

```json
{
  "name": "nextask",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=26.0.0" },
  "scripts": {
    "build:contracts": "npm run build --workspace @nextask/contracts",
    "build:api": "npm run build --workspace @nextask/api",
    "build:web": "npm run build --workspace @nextask/web",
    "build": "npm run build:contracts && npm run build:api && npm run build:web",
    "dev": "npm run build:contracts && concurrently -n api,web -c blue,magenta \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "npm run dev --workspace @nextask/api",
    "dev:web": "npm run dev --workspace @nextask/web",
    "typecheck": "npm run build:contracts && npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "test": "npm run build:contracts && npm run test --workspace @nextask/api",
    "verify": "npm run typecheck && npm run lint && npm run test"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "concurrently": "10.0.6",
    "eslint": "10.13.0",
    "prettier": "3.9.10",
    "typescript": "6.0.3",
    "typescript-eslint": "8.72.1"
  }
}
```

- [ ] **Step 2: Tạo TypeScript, ESLint, Prettier**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`eslint.config.mjs`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:

```text
node_modules
dist
.next
coverage
package-lock.json
```

`.dockerignore`:

```text
.git
node_modules
**/node_modules
**/dist
**/.next
**/coverage
.env
.env.*
docs
```

- [ ] **Step 3: Tạo contracts**

`packages/contracts/package.json`:

```json
{
  "name": "@nextask/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "4.6.7"
  }
}
```

`packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

`packages/contracts/src/envelope.ts`:

```ts
import { z } from 'zod';

export const envelopeMetaSchema = z.object({
  requestId: z.string().min(1),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  meta: envelopeMetaSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
```

`packages/contracts/src/health.ts`:

```ts
import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';

export const healthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('nextask-api'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  checks: z.object({
    mongo: z.object({
      status: z.enum(['ok', 'down']),
      latencyMs: z.number().nonnegative(),
      replicaSet: z.string().nullable(),
      primary: z.boolean(),
      reason: z.enum(['unreachable', 'replica_set_mismatch', 'not_primary']).optional(),
    }),
  }),
});

export const healthResponseSchema = z.object({
  data: healthDataSchema,
  meta: envelopeMetaSchema,
});

export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
```

`packages/contracts/src/index.ts`:

```ts
export * from './envelope.js';
export * from './health.js';
```

- [ ] **Step 4: Tạo manifest API và web**

`apps/api/package.json`:

```json
{
  "name": "@nextask/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@nextask/contracts": "*",
    "cors": "2.8.6",
    "express": "5.3.0",
    "helmet": "8.3.0",
    "mongoose": "9.11.4",
    "pino": "10.4.0",
    "pino-http": "11.0.0",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@types/cors": "2.8.19",
    "@types/express": "5.0.6",
    "@types/node": "26.6.5",
    "@types/supertest": "7.2.1",
    "supertest": "7.3.1",
    "tsx": "4.23.15",
    "vitest": "5.0.5"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test/**/*.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
```

`apps/web/package.json`:

```json
{
  "name": "@nextask/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@nextask/contracts": "*",
    "next": "16.4.3",
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "tailwindcss": "4.3.3"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Tạo `.env.example` và MongoDB Compose**

`.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://localhost:27017/nextask?replicaSet=rs0&directConnection=true
MONGODB_REPLICA_SET=rs0
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
SERVICE_VERSION=0.1.0
API_INTERNAL_URL=http://localhost:4000/api/v1
```

`docker-compose.yml` (chỉ Mongo trong task này):

```yaml
name: nextask

services:
  mongo:
    image: mongo:8.0
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "127.0.0.1:27017:27017"
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "mongosh --quiet --eval \"try { db.adminCommand({ ping: 1 }).ok } catch (e) { 0 }\" | grep 1",
        ]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 5s

  mongo-init:
    image: mongo:8.0
    depends_on:
      mongo:
        condition: service_started
    volumes:
      - ./docker/mongo/init-replica.js:/scripts/init-replica.js:ro
    entrypoint: ["mongosh", "--host", "mongo:27017", "--quiet", "--file", "/scripts/init-replica.js"]
    restart: "no"

volumes:
  mongo-data:
```

`docker/mongo/init-replica.js`:

```js
const expectedReplicaSet = 'rs0';
const deadline = Date.now() + 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

while (true) {
  try {
    db.adminCommand({ ping: 1 });
    break;
  } catch (error) {
    if (Date.now() > deadline) {
      throw new Error(`MongoDB không phản hồi: ${error.message}`);
    }
    await sleep(1_000);
  }
}

let initialized = false;
try {
  const status = rs.status();
  initialized = status.ok === 1;
} catch {
  initialized = false;
}

if (!initialized) {
  rs.initiate({
    _id: expectedReplicaSet,
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}

while (true) {
  const hello = db.adminCommand({ hello: 1 });
  if (hello.setName === expectedReplicaSet && hello.isWritablePrimary === true) {
    break;
  }
  if (Date.now() > deadline) {
    throw new Error('Replica set chưa có primary');
  }
  await sleep(500);
}

print(`replica set ${expectedReplicaSet} ready`);
```

- [ ] **Step 6: Cài dependency và build contracts**

Run:

```bash
npm install
npm run build:contracts
```

Expected: `package-lock.json` được tạo; `packages/contracts/dist/index.js` tồn tại.

- [ ] **Step 7: Khởi động Mongo và xác nhận replica set**

Run:

```bash
docker compose config
docker compose up -d mongo mongo-init
docker compose wait mongo-init
docker compose logs --no-color mongo-init
docker compose exec -T mongo mongosh --quiet --eval 'rs.status().set'
```

Expected: log có `replica set rs0 ready`; lệnh cuối in `rs0`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json eslint.config.mjs .prettierrc.json .prettierignore .dockerignore .env.example packages/contracts apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/vitest.config.ts apps/web/package.json apps/web/tsconfig.json docker-compose.yml docker/mongo/init-replica.js
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "chore: scaffold workspace, contracts, and mongo replica set"
```

---

### Task 2: API TDD - env, kết nối replica set, health

**Files:**
- Create: `apps/api/test/env.test.ts`
- Create: `apps/api/test/health.integration.test.ts`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/lib/logger.ts`
- Create: `apps/api/src/db/mongoose.ts`
- Create: `apps/api/src/middleware/request-id.ts`
- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/src/modules/health/health.service.ts`
- Create: `apps/api/src/modules/health/health.router.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/types/express.d.ts`

**Interfaces:**
- Consumes: `@nextask/contracts`; Mongo `rs0` từ Task 1.
- Produces:
  - `loadEnv(source?: NodeJS.ProcessEnv): Env`
  - `connectMongo(options: { uri: string; logger: Logger }): Promise<Connection>`
  - `assertReplicaSet(connection: Connection, expectedReplicaSet: string): Promise<ReplicaSetInfo>`
  - `checkHealth(connection: Connection, expectedReplicaSet: string, version: string): Promise<HealthData>`
  - `createApp(deps: AppDependencies): Express`
  - HTTP `GET /api/v1/health`.

- [ ] **Step 1: Viết test env thất bại**

`apps/api/test/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  MONGODB_URI: 'mongodb://localhost:27017/nextask_test?replicaSet=rs0&directConnection=true',
  MONGODB_REPLICA_SET: 'rs0',
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
  SERVICE_VERSION: '0.1.0',
};

describe('loadEnv', () => {
  it('parse hợp lệ và coerce PORT', () => {
    const env = loadEnv(validEnv);
    expect(env.PORT).toBe(4000);
    expect(env.MONGODB_REPLICA_SET).toBe('rs0');
  });

  it('từ chối thiếu MONGODB_URI', () => {
    const input = { ...validEnv, MONGODB_URI: undefined };
    expect(() => loadEnv(input)).toThrow(/MONGODB_URI/);
  });

  it('từ chối URI không phải MongoDB', () => {
    const input = { ...validEnv, MONGODB_URI: 'http://localhost:27017' };
    expect(() => loadEnv(input)).toThrow(/MONGODB_URI/);
  });
});
```

- [ ] **Step 2: Viết integration test thất bại**

`apps/api/test/health.integration.test.ts`:

```ts
import type { Connection } from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectMongo } from '../src/db/mongoose.js';
import { checkHealth } from '../src/modules/health/health.service.js';

const testUri =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/nextask_test?replicaSet=rs0&directConnection=true';

const logger = pino({ level: 'silent' });
let connection: Connection;

beforeAll(async () => {
  connection = await connectMongo({ uri: testUri, logger });
});

afterAll(async () => {
  await connection.close();
});

describe('health với MongoDB thật', () => {
  it('trả ok khi replica set đúng và primary', async () => {
    const health = await checkHealth(connection, 'rs0', '0.1.0-test');
    expect(health.status).toBe('ok');
    expect(health.checks.mongo.replicaSet).toBe('rs0');
    expect(health.checks.mongo.primary).toBe(true);
    expect(health.checks.mongo.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('trả degraded khi tên replica set không khớp', async () => {
    const health = await checkHealth(connection, 'rs-other', '0.1.0-test');
    expect(health.status).toBe('degraded');
    expect(health.checks.mongo.reason).toBe('replica_set_mismatch');
  });

  it('GET /api/v1/health trả envelope và request id', async () => {
    const app = createApp({
      connection,
      expectedReplicaSet: 'rs0',
      version: '0.1.0-test',
      corsOrigin: 'http://localhost:3000',
      logger,
    });

    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.checks.mongo.replicaSet).toBe('rs0');
    expect(response.body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
npm run test --workspace @nextask/api
```

Expected: fail vì `../src/config/env.js` chưa tồn tại.

- [ ] **Step 4: Implement env và logger**

`apps/api/src/config/env.ts`:

```ts
import { z } from 'zod';

const mongoUriSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
    'MONGODB_URI phải bắt đầu bằng mongodb:// hoặc mongodb+srv://',
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  MONGODB_URI: mongoUriSchema,
  MONGODB_REPLICA_SET: z.string().min(1).default('rs0'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_VERSION: z.string().min(1).default('0.1.0'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return result.data;
}
```

`apps/api/src/lib/logger.ts`:

```ts
import pino from 'pino';

export function createLogger(level: string) {
  return pino({ level });
}

export type Logger = ReturnType<typeof createLogger>;
```

- [ ] **Step 5: Implement kết nối Mongoose và assert replica set**

`apps/api/src/db/mongoose.ts`:

```ts
import mongoose, { type Connection } from 'mongoose';
import type { Logger } from '../lib/logger.js';

export interface ReplicaSetInfo {
  replicaSet: string;
  primary: boolean;
}

interface ConnectMongoOptions {
  uri: string;
  logger: Logger;
}

export async function connectMongo({ uri, logger }: ConnectMongoOptions): Promise<Connection> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    autoIndex: false,
    bufferCommands: false,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    maxPoolSize: 10,
  });

  const connection = mongoose.connection;
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  logger.info({ host: connection.host, name: connection.name }, 'MongoDB connected');
  return connection;
}

export async function assertReplicaSet(
  connection: Connection,
  expectedReplicaSet: string,
): Promise<ReplicaSetInfo> {
  if (!connection.db) {
    throw new Error('MongoDB connection is not ready');
  }

  const hello = await connection.db.admin().command<{
    setName?: string;
    isWritablePrimary?: boolean;
  }>({ hello: 1 });

  if (hello.setName !== expectedReplicaSet) {
    throw new Error(
      `Expected replica set "${expectedReplicaSet}", received "${hello.setName ?? 'none'}"`,
    );
  }

  return {
    replicaSet: hello.setName,
    primary: hello.isWritablePrimary === true,
  };
}
```

- [ ] **Step 6: Implement health service**

`apps/api/src/modules/health/health.service.ts`:

```ts
import type { HealthData } from '@nextask/contracts';
import type { Connection } from 'mongoose';

type MongoReason = 'unreachable' | 'replica_set_mismatch' | 'not_primary';

export async function checkHealth(
  connection: Connection,
  expectedReplicaSet: string,
  version: string,
): Promise<HealthData> {
  const startedAt = performance.now();
  let replicaSet: string | null = null;
  let primary = false;
  let reason: MongoReason | undefined;

  try {
    if (!connection.db) {
      throw new Error('MongoDB connection is not ready');
    }
    const admin = connection.db.admin();
    await admin.command({ ping: 1 });
    const hello = await admin.command<{ setName?: string; isWritablePrimary?: boolean }>({
      hello: 1,
    });
    replicaSet = hello.setName ?? null;
    primary = hello.isWritablePrimary === true;

    if (replicaSet !== expectedReplicaSet) {
      reason = 'replica_set_mismatch';
    } else if (!primary) {
      reason = 'not_primary';
    }
  } catch {
    reason = 'unreachable';
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
  const mongoOk = reason === undefined;

  return {
    status: mongoOk ? 'ok' : 'degraded',
    service: 'nextask-api',
    version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      mongo: {
        status: mongoOk ? 'ok' : 'down',
        latencyMs,
        replicaSet,
        primary,
        ...(reason ? { reason } : {}),
      },
    },
  };
}
```

- [ ] **Step 7: Implement middleware, router, app**

`apps/api/src/types/express.d.ts`:

```ts
declare namespace Express {
  interface Request {
    requestId: string;
  }
}
```

`apps/api/src/middleware/request-id.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  request.requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
```

`apps/api/src/middleware/error-handler.ts`:

```ts
import type { ApiError } from '@nextask/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên' },
    meta: { requestId: request.requestId },
  };
  response.status(404).json(body);
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, _next) => {
    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
    const body: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi hệ thống' },
      meta: { requestId: request.requestId },
    };
    response.status(500).json(body);
  };
}
```

`apps/api/src/modules/health/health.router.ts`:

```ts
import type { HealthResponse } from '@nextask/contracts';
import { Router } from 'express';
import type { Connection } from 'mongoose';
import { checkHealth } from './health.service.js';

interface HealthRouterOptions {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
}

export function createHealthRouter({
  connection,
  expectedReplicaSet,
  version,
}: HealthRouterOptions): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const data = await checkHealth(connection, expectedReplicaSet, version);
    const body: HealthResponse = {
      data,
      meta: { requestId: request.requestId },
    };
    response.status(data.status === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
```

`apps/api/src/app.ts`:

```ts
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Connection } from 'mongoose';
import pinoHttp from 'pino-http';
import type { Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './modules/health/health.router.js';

export interface AppDependencies {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
  corsOrigin: string;
  logger: Logger;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (request) => request.requestId,
    }),
  );

  app.use(
    '/api/v1/health',
    createHealthRouter({
      connection: deps.connection,
      expectedReplicaSet: deps.expectedReplicaSet,
      version: deps.version,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
```

- [ ] **Step 8: Implement server startup và graceful shutdown**

`apps/api/src/server.ts`:

```ts
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { assertReplicaSet, connectMongo } from './db/mongoose.js';
import { createLogger } from './lib/logger.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });
  const replica = await assertReplicaSet(connection, env.MONGODB_REPLICA_SET);

  if (!replica.primary) {
    throw new Error('MongoDB replica set has no primary');
  }

  const app = createApp({
    connection,
    expectedReplicaSet: env.MONGODB_REPLICA_SET,
    version: env.SERVICE_VERSION,
    corsOrigin: env.CORS_ORIGIN,
    logger,
  });
  const server = createServer(app);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, replicaSet: replica.replicaSet }, 'Nextask API listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void connection.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 9: Chạy test, typecheck, lint**

```bash
npm run test --workspace @nextask/api
npm run typecheck
npm run lint
```

Expected: toàn bộ pass. Nếu fail, sửa code, không nới timeout.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src apps/api/test
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add replica-set-aware API health endpoint"
```

---

### Task 3: Web health page

**Files:**
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/lib/health.ts`
- Create: `apps/web/public/.gitkeep`

**Interfaces:**
- Consumes: `healthResponseSchema` từ `@nextask/contracts`; API `GET /api/v1/health`.
- Produces: trang `/` hiển thị trạng thái API, replica set, primary, request id hoặc lỗi kết nối.

- [ ] **Step 1: Tạo cấu hình Next và Tailwind**

`apps/web/next.config.ts`:

```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
```

`apps/web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

`apps/web/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// File này do Next.js quản lý.
```

- [ ] **Step 2: Tạo fetch helper**

`apps/web/lib/health.ts`:

```ts
import { healthResponseSchema, type HealthResponse } from '@nextask/contracts';

export type HealthResult =
  | { ok: true; response: HealthResponse }
  | { ok: false; message: string };

export async function fetchHealth(): Promise<HealthResult> {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { ok: false, message: 'Phản hồi health không đúng hợp đồng' };
    }
    return { ok: true, response: parsed.data };
  } catch {
    return { ok: false, message: 'Không kết nối được API' };
  }
}
```

- [ ] **Step 3: Tạo layout, CSS, page**

`apps/web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexTask',
  description: 'Whiteboard và Kanban cho team Agile',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/app/globals.css`:

```css
@import 'tailwindcss';

:root {
  color-scheme: light;
}

body {
  margin: 0;
  background: #f5f5f4;
  color: #1c1917;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

`apps/web/app/page.tsx`:

```tsx
import { fetchHealth } from '../lib/health';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const result = await fetchHealth();
  const health = result.ok ? result.response.data : null;
  const requestId = result.ok ? result.response.meta.requestId : null;
  const isOk = health?.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">NexTask</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
        Nền tảng đã sẵn sàng
      </h1>
      <p className="mt-3 max-w-2xl text-stone-600">
        Giai đoạn 0 kiểm tra Docker Compose, MongoDB replica set và kết nối API.
      </p>

      <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Trạng thái hệ thống</h2>
            <p className="mt-1 text-sm text-stone-500">Dữ liệu lấy trực tiếp từ API mỗi request.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {isOk ? 'Hoạt động' : 'Cần kiểm tra'}
          </span>
        </div>

        {result.ok ? (
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Replica set</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.replicaSet ?? 'không có'}
              </dd>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Primary</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.primary ? 'true' : 'false'}
              </dd>
            </div>
            <div className="rounded-xl bg-stone-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-stone-500">Độ trễ Mongo</dt>
              <dd className="mt-1 font-mono text-lg text-stone-900">
                {health?.checks.mongo.latencyMs ?? '-'} ms
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-6 rounded-xl bg-rose-50 p-4 text-rose-800">{result.message}</p>
        )}

        {requestId ? (
          <p className="mt-6 font-mono text-xs text-stone-400">requestId: {requestId}</p>
        ) : null}
      </section>
    </main>
  );
}
```

Tạo file rỗng `apps/web/public/.gitkeep`.

- [ ] **Step 4: Build web**

```bash
npm run build --workspace @nextask/web
```

Expected: build thành công, có `.next/standalone`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add web health status page"
```

---

### Task 4: Docker hóa API/web và chạy toàn hệ thống

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: API, web, contracts, Mongo replica set.
- Produces: `docker compose up --build` chạy ba service; healthcheck; web hiển thị trạng thái.

- [ ] **Step 1: Tạo API Dockerfile**

`apps/api/Dockerfile`:

```dockerfile
FROM node:26-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build:contracts && npm run build --workspace @nextask/api

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev --workspace @nextask/api --workspace @nextask/contracts --include-workspace-root \
  && npm cache clean --force
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/packages/contracts/dist packages/contracts/dist
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Tạo web Dockerfile**

`apps/web/Dockerfile`:

```dockerfile
FROM node:26-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build:contracts && npm run build --workspace @nextask/web

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Bổ sung service vào Compose**

Thêm vào `docker-compose.yml`:

```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      NODE_ENV: production
      PORT: 4000
      MONGODB_URI: mongodb://mongo:27017/nextask?replicaSet=rs0
      MONGODB_REPLICA_SET: rs0
      CORS_ORIGIN: http://localhost:3000
      LOG_LEVEL: info
      SERVICE_VERSION: 0.1.0
    ports:
      - "127.0.0.1:4000:4000"
    depends_on:
      mongo-init:
        condition: service_completed_successfully
    init: true
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:4000/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      API_INTERNAL_URL: http://api:4000/api/v1
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      api:
        condition: service_healthy
    init: true
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s
```

- [ ] **Step 4: Tạo README Phase 0**

README gồm:

- Mô tả ngắn.
- Yêu cầu Docker, Node 26, npm.
- Chạy toàn hệ thống: `docker compose up --build`.
- URL: web `http://localhost:3000`, API `http://localhost:4000/api/v1/health`, Mongo `127.0.0.1:27017`.
- Kiểm tra: `docker compose ps`, `curl`, `docker compose exec mongo mongosh`.
- Local dev: `docker compose up -d mongo mongo-init`, `npm run dev`.
- Test: `npm run verify`.
- Ghi chú bảo mật: Mongo local không auth, chỉ loopback; không dùng production.
- Git: local, không remote; xem `docs/git-workflow.md`.
- Link docs.

- [ ] **Step 5: Build và chạy toàn hệ thống**

```bash
docker compose build
docker compose up -d
docker compose ps
```

Expected: `mongo`, `api`, `web` healthy; `mongo-init` exit 0.

- [ ] **Step 6: Kiểm tra HTTP và restart**

```bash
curl -fsS http://localhost:4000/api/v1/health
curl -fsS http://localhost:3000
docker compose restart api
curl -fsS http://localhost:4000/api/v1/health
```

Expected: health 200, web 200, sau restart health 200.

- [ ] **Step 7: Commit**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile docker-compose.yml README.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "chore: containerize api and web with compose healthchecks"
```

---

### Task 5: Kiểm chứng cuối, tài liệu và lịch sử phiên

**Files:**
- Modify: `docs/phases/00-setup.md`
- Modify: `docs/session-log.md`
- Modify: `docs/architecture.md` (nếu cần)
- Modify: `docs/mongodb-notes.md` (nếu cần)
- Modify: plan file (đánh dấu checkbox)

**Interfaces:**
- Consumes: toàn bộ hệ thống đã chạy.
- Produces: bằng chứng kiểm chứng, tài liệu hoàn chỉnh, commit cuối.

- [ ] **Step 1: Chạy typecheck và lint**

```bash
npm run typecheck
npm run lint
npm run format:check
```

Expected: exit 0, không có lỗi.

- [ ] **Step 2: Chạy full test ba lần liên tiếp**

```bash
npm run test
npm run test
npm run test
```

Expected: ba lần đều pass. Ghi lại số test và thời gian nếu cần. Không nới timeout.

- [ ] **Step 3: Kiểm tra Docker lần cuối**

```bash
docker compose config
docker compose ps
curl -iS http://localhost:4000/api/v1/health
curl -iS http://localhost:3000
docker compose exec -T mongo mongosh --quiet --eval 'rs.status().set'
```

Expected: cấu hình hợp lệ; service healthy; health 200; web 200; `rs0`.

- [ ] **Step 4: Kiểm tra UI bằng browser**

Mở `http://localhost:3000`, xác nhận:

- Tiêu đề NexTask.
- Badge Hoạt động.
- Replica set `rs0`.
- Primary `true`.
- Có requestId.

Chụp screenshot hoặc đọc DOM bằng browser-use. Nếu UI sai, sửa và lặp lại bước build.

- [ ] **Step 5: Kiểm tra restart và persistence**

```bash
docker compose restart api
curl -fsS http://localhost:4000/api/v1/health
docker compose down
docker compose up -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
```

Expected: health 200 sau restart và sau `down/up`; volume còn.

- [ ] **Step 6: Cập nhật tài liệu bằng số liệu thật**

`docs/phases/00-setup.md`:

- Đổi trạng thái sang `Hoàn thành ngày 2026-10-28`.
- Thêm mục `Kết quả kiểm chứng` với các lệnh và kết quả thực tế.
- Đánh dấu tiêu chí đạt.

`docs/session-log.md`:

- Thêm mục `Kết quả triển khai` gồm file, quyết định Git, commit SHA lấy từ `git log`.
- Ghi ba lần test pass, typecheck, lint, Docker health, browser check, restart.
- Ghi rõ nếu có lỗi hoặc điều chỉnh phát sinh.

`docs/git-workflow.md`:

- Ghi trạng thái local, branch `main`, chưa remote.
- Ghi commit đầu và commit gần nhất.

- [ ] **Step 7: Quét CJK và placeholder**

```bash
grep -RInP '[\x{4e00}-\x{9fff}\x{3040}-\x{30ff}]' docs README.md || true
grep -RInE 'TODO|FIXME|TBD' docs README.md || true
```

Expected: không có kết quả ngoài các ký hiệu minh họa đã biết; sửa nếu có.

- [ ] **Step 8: Commit cuối**

```bash
git add docs/phases/00-setup.md docs/session-log.md docs/git-workflow.md docs/superpowers/plans/2026-10-28-phase-0-setup.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record phase 0 verification and git workflow"
```

- [ ] **Step 9: Kiểm tra Git cuối**

```bash
git status --short
git log --oneline
git remote -v
```

Expected: working tree sạch; lịch sử commit rõ; không remote.

---

## Self-review của kế hoạch

- Spec coverage: replica set, health, web, Docker, TypeScript strict, lint, test thật, Git, tài liệu phiên đều có task.
- Không có auth, board, item, task, tldraw hay Change Streams trong phạm vi.
- Không dùng mock DB.
- Các type và tên hàm được định nghĩa trước khi dùng.
- Không có placeholder; các lệnh kiểm chứng đều cụ thể.
- Git không dùng `git add -A`/`git add .`; không push/remote/amend/config.
