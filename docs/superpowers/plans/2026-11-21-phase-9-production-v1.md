# Phase 9 - Production hardening và v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa NexTask lên VPS bằng Docker Compose + Caddy HTTPS + MongoDB auth, có CI/backup/runbook, smoke staging và phát hành `1.0.0`/tag `v1.0`.

**Architecture:** Runtime hardening trong API (env production, trust proxy, rate limit, cookie/license). Production compose tách edge/internal network, Caddy là entrypoint duy nhất, Mongo auth/keyfile bootstrap một lần. CI dùng Mongo replica set thật; backup/restore có auth; live deploy cần domain/DNS/VPS/license do người dùng cung cấp.

**Tech Stack:** TypeScript, Express 5, Mongoose 9, MongoDB 8, Next.js App Router, tldraw 5, Docker Compose, Caddy 2, GitHub Actions, Vitest 5, Playwright 1.65.

**Spec:** `docs/phases/09-production-v1.md`

## Global Constraints

- Branch `feat/phase-9-production` từ `release/v1.0`; không merge `main` trước khi staging/live smoke đạt.
- Không commit secret thật, license key, domain credential, `.env.production`, keyfile hoặc certificate.
- Commit identity từng lệnh: `khoavo1501 <khoamiden15012005@gmail.com>`.
- Chỉ stage đường dẫn cụ thể; không `git add -A`, không `git add .`.
- Test API dùng MongoDB replica set thật, không mock database; không nới timeout.
- Full suite ba lần tại feature gate và release gate; typecheck/lint/format/build:web.
- Live deploy và v1.0 tag chỉ sau khi domain HTTPS, Mongo auth, backup/restore và smoke đạt.
- Không push nếu người dùng chưa yêu cầu.
- Prose tiếng Việt; quét CJK trước commit tài liệu.

---

## File Structure

- `apps/api/src/config/env.ts` - env production, trust proxy, auth rate limit.
- `apps/api/src/app.ts` - `trust proxy`.
- `apps/api/src/server.ts` - truyền env mới.
- `apps/api/test/env.test.ts` - production validation.
- `apps/web/features/whiteboard/whiteboard-canvas.tsx` - tldraw license key.
- `apps/web/Dockerfile` - license build arg.
- `docker-compose.yml` - dev env mới.
- `.env.example` - biến dev mới.
- `.env.production.example` - biến production mẫu, không secret thật.
- `.gitignore` - cho phép `.env.production.example`, ignore secret/backups.
- `docker-compose.prod.yml` - Mongo auth, API/web, Caddy, migrations.
- `deploy/Caddyfile` - HTTPS/reverse proxy/security headers.
- `deploy/mongo/bootstrap.js` - initiate replica set và tạo user.
- `scripts/prod-mongo-bootstrap.sh` - bootstrap một lần, idempotent.
- `scripts/prod-backup.sh` - backup production có auth.
- `scripts/prod-restore-drill.sh` - restore drill DB tạm.
- `.github/workflows/ci.yml` - CI.
- `docs/production-runbook.md` - vận hành/deploy/rollback.
- `README.md`, `docs/architecture.md`, `docs/session-log.md`, `docs/git-workflow.md`,
  `docs/phases/09-production-v1.md` - tài liệu phát hành.

---

### Task 1: Runtime production config và license

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/env.test.ts`
- Modify: `apps/web/features/whiteboard/whiteboard-canvas.tsx`
- Modify: `apps/web/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: env hiện có.
- Produces: `TRUST_PROXY`, `AUTH_RATE_LIMIT_MAX`; `AppDependencies.trustProxy`; license build arg.

- [ ] **Step 1: Viết failing env tests**

Thêm test vào `apps/api/test/env.test.ts`:

```ts
  it('parse production hợp lệ và default trust proxy/rate limit', () => {
    const env = loadEnv({
      ...validEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      CORS_ORIGIN: 'https://nextask.example.com',
      JWT_SECRET: 'production-secret-at-least-32-bytes-long',
      SEED_OWNER_EMAIL: undefined,
      SEED_OWNER_PASSWORD: undefined,
    });
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(5);
  });

  it('từ chối production thiếu cookie secure/https/dev secret/seed owner', () => {
    const base = {
      ...validEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      CORS_ORIGIN: 'https://nextask.example.com',
      JWT_SECRET: 'production-secret-at-least-32-bytes-long',
      SEED_OWNER_EMAIL: undefined,
      SEED_OWNER_PASSWORD: undefined,
    };
    expect(() => loadEnv({ ...base, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() =>
      loadEnv({ ...base, JWT_SECRET: 'local-dev-only-nextask-jwt-secret-change-me' }),
    ).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, CORS_ORIGIN: 'http://nextask.example.com' })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() => loadEnv({ ...base, SEED_OWNER_EMAIL: 'demo@example.com' })).toThrow(
      /SEED_OWNER/,
    );
  });
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test --workspace @nextask/api -- test/env.test.ts`

Expected: FAIL vì chưa có `TRUST_PROXY`, `AUTH_RATE_LIMIT_MAX`, production refinement.

- [ ] **Step 3: Cập nhật env schema**

Trong `apps/api/src/config/env.ts`, thêm hằng số trước schema:

```ts
const DEV_JWT_SECRET = 'local-dev-only-nextask-jwt-secret-change-me';
```

Thêm field vào `envSchema`:

```ts
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
```

Đổi schema thành `.superRefine`:

```ts
const envSchema = z
  .object({
    // ...các field hiện có
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'Production phải bật COOKIE_SECURE=true',
      });
    }
    if (env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Không dùng JWT_SECRET dev trên production',
      });
    }
    if (!env.CORS_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'Production CORS_ORIGIN phải dùng https://',
      });
    }
    if (env.SEED_OWNER_EMAIL || env.SEED_OWNER_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['SEED_OWNER_EMAIL'],
        message: 'Production không seed owner demo',
      });
    }
  });
```

- [ ] **Step 4: Cập nhật app/server**

Trong `apps/api/src/app.ts`:

```ts
export interface AppDependencies {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
  corsOrigin: string;
  logger: Logger;
  jwtSecret: string;
  cookieSecure: boolean;
  authRateLimitMax: number;
  trustProxy?: number;
}
```

Sau `const app = express();`:

```ts
  if (deps.trustProxy && deps.trustProxy > 0) {
    app.set('trust proxy', deps.trustProxy);
  }
```

Trong `apps/api/src/server.ts`, truyền:

```ts
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
    trustProxy: env.TRUST_PROXY,
```

- [ ] **Step 5: Gắn tldraw license**

Trong `apps/web/features/whiteboard/whiteboard-canvas.tsx`:

```tsx
      <Tldraw
        hideUi
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        onMount={handleMount}
      />
```

Trong `apps/web/Dockerfile`, build stage thêm:

```dockerfile
ARG NEXT_PUBLIC_TLDRAW_LICENSE_KEY=
ENV NEXT_PUBLIC_TLDRAW_LICENSE_KEY=${NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
```

- [ ] **Step 6: Cập nhật dev compose/env**

Trong `.env.example`, thêm:

```text
TRUST_PROXY=0
AUTH_RATE_LIMIT_MAX=5
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=
```

Trong `docker-compose.yml`, thêm vào `x-api-environment`:

```yaml
  TRUST_PROXY: 0
  AUTH_RATE_LIMIT_MAX: 5
```

và build args web:

```yaml
      args:
        NEXT_PUBLIC_API_URL: http://localhost:4000/api/v1
        NEXT_PUBLIC_TLDRAW_LICENSE_KEY: ${NEXT_PUBLIC_TLDRAW_LICENSE_KEY:-}
```

- [ ] **Step 7: Chạy test/typecheck**

Run: `npm run test --workspace @nextask/api -- test/env.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/app.ts apps/api/src/server.ts apps/api/test/env.test.ts apps/web/features/whiteboard/whiteboard-canvas.tsx apps/web/Dockerfile docker-compose.yml .env.example
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add production runtime hardening and tldraw license"
```

---

### Task 2: Production Compose, Caddy và Mongo auth bootstrap

**Files:**
- Create: `.env.production.example`
- Create: `docker-compose.prod.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/mongo/bootstrap.js`
- Create: `scripts/prod-mongo-bootstrap.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1 env.
- Produces: production stack; `DOMAIN`, `JWT_SECRET`, Mongo credentials/license; Caddy and Mongo bootstrap.

- [ ] **Step 1: Tạo env production mẫu**

Tạo `.env.production.example`:

```text
DOMAIN=nextask.example.com
ACME_EMAIL=ops@example.com
JWT_SECRET=replace-with-a-random-secret-at-least-32-bytes
MONGO_ROOT_USERNAME=nextask_root
MONGO_ROOT_PASSWORD=replace-with-long-random-password
MONGO_APP_USERNAME=nextask_app
MONGO_APP_PASSWORD=replace-with-long-random-password
AUTH_RATE_LIMIT_MAX=5
SERVICE_VERSION=1.0.0
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=replace-with-tldraw-license-key
```

- [ ] **Step 2: Cập nhật .gitignore**

Thêm:

```gitignore
!.env.production.example
secrets/
```

`.env.*` đã ignore; dòng exception phải đứng sau `.env.*`.

- [ ] **Step 3: Tạo Caddyfile**

Tạo `deploy/Caddyfile`:

```caddy
{
  email {$ACME_EMAIL}
}

{$DOMAIN} {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
  handle /api/* {
    reverse_proxy api:4000
  }
  handle /socket.io/* {
    reverse_proxy api:4000
  }
  handle {
    reverse_proxy web:3000
  }
}
```

- [ ] **Step 4: Tạo Mongo bootstrap JS**

Tạo `deploy/mongo/bootstrap.js`:

```js
const rootUser = process.env.MONGO_ROOT_USERNAME;
const rootPassword = process.env.MONGO_ROOT_PASSWORD;
const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!rootUser || !rootPassword || !appUser || !appPassword) {
  throw new Error('Thiếu biến bootstrap Mongo');
}

try {
  rs.status();
} catch (error) {
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
}

for (let attempt = 0; attempt < 50 && !db.hello().isWritablePrimary; attempt += 1) {
  sleep(200);
}
if (!db.hello().isWritablePrimary) {
  throw new Error('Mongo replica set chưa có primary');
}

const admin = db.getSiblingDB('admin');
if (!admin.getUser(rootUser)) {
  admin.createUser({ user: rootUser, pwd: rootPassword, roles: ['root'] });
}
if (!admin.getUser(appUser)) {
  admin.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [
      { role: 'readWrite', db: 'nextask' },
      { role: 'dbAdmin', db: 'nextask' },
    ],
  });
}

printjson({ ok: true, primary: db.hello().isWritablePrimary, appUser });
```

- [ ] **Step 5: Tạo production compose**

Tạo `docker-compose.prod.yml`:

```yaml
name: nextask-prod

x-logging: &default-logging
  driver: json-file
  options:
    max-size: '10m'
    max-file: '5'

x-api-build: &api-build
  context: .
  dockerfile: apps/api/Dockerfile

x-api-environment: &api-environment
  NODE_ENV: production
  PORT: 4000
  MONGODB_URI: mongodb://${MONGO_APP_USERNAME}:${MONGO_APP_PASSWORD}@mongo:27017/nextask?replicaSet=rs0&authSource=admin
  MONGODB_REPLICA_SET: rs0
  CORS_ORIGIN: https://${DOMAIN}
  LOG_LEVEL: info
  SERVICE_VERSION: ${SERVICE_VERSION:-1.0.0}
  JWT_SECRET: ${JWT_SECRET}
  COOKIE_SECURE: 'true'
  TRUST_PROXY: '1'
  AUTH_RATE_LIMIT_MAX: ${AUTH_RATE_LIMIT_MAX:-5}

services:
  mongo-key-init:
    image: alpine:3.20
    command:
      - sh
      - -c
      - |
        if [ ! -s /key/keyfile ]; then
          head -c 756 /dev/urandom | base64 > /key/keyfile
        fi
        chmod 400 /key/keyfile
        chown 999:999 /key/keyfile
    volumes:
      - mongo-keyfile:/key
    restart: 'no'
    logging: *default-logging

  mongo:
    image: mongo:8.0
    command:
      - mongod
      - --replSet
      - rs0
      - --bind_ip_all
      - --auth
      - --keyFile
      - /etc/mongo/keyfile
    environment:
      MONGO_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - mongo-data:/data/db
      - mongo-keyfile:/etc/mongo:ro
    depends_on:
      mongo-key-init:
        condition: service_completed_successfully
    networks:
      - internal
    restart: unless-stopped
    logging: *default-logging
    healthcheck:
      test:
        - CMD-SHELL
        - >-
          mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok'
          -u "$$MONGO_ROOT_USERNAME" -p "$$MONGO_ROOT_PASSWORD"
          --authenticationDatabase admin | grep 1
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s

  mongo-bootstrap:
    image: mongo:8.0
    profiles: ['bootstrap']
    command: [mongod, --replSet, rs0, --bind_ip_all]
    environment:
      MONGO_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_APP_USERNAME: ${MONGO_APP_USERNAME}
      MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD}
    volumes:
      - mongo-data:/data/db
      - ./deploy/mongo/bootstrap.js:/scripts/bootstrap.js:ro
    networks:
      internal:
        aliases:
          - mongo
    restart: 'no'
    logging: *default-logging

  migrate:
    build: *api-build
    command: ['node', 'dist/db/migrate.js']
    environment: *api-environment
    depends_on:
      mongo:
        condition: service_healthy
    networks:
      - internal
    restart: 'no'
    logging: *default-logging

  api:
    build: *api-build
    environment: *api-environment
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - internal
    restart: unless-stopped
    logging: *default-logging
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:4000/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://${DOMAIN}/api/v1
        NEXT_PUBLIC_TLDRAW_LICENSE_KEY: ${NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
    environment:
      API_INTERNAL_URL: http://api:4000/api/v1
    depends_on:
      api:
        condition: service_healthy
    networks:
      - internal
    restart: unless-stopped
    logging: *default-logging
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

  caddy:
    image: caddy:2
    ports:
      - '80:80'
      - '443:443'
    environment:
      DOMAIN: ${DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      api:
        condition: service_healthy
      web:
        condition: service_healthy
    networks:
      - edge
      - internal
    restart: unless-stopped
    logging: *default-logging

networks:
  edge:
  internal:
    internal: true

volumes:
  mongo-data:
  mongo-keyfile:
  caddy-data:
  caddy-config:
```

- [ ] **Step 6: Tạo bootstrap script**

Tạo `scripts/prod-mongo-bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env.production ]]; then
  echo "Thiếu .env.production; copy từ .env.production.example" >&2
  exit 1
fi

compose=(docker compose --env-file .env.production -f docker-compose.prod.yml)
marker="secrets/mongo-initialized"
mkdir -p secrets

if [[ -f "$marker" ]]; then
  echo "Mongo đã bootstrap; bỏ qua."
  exit 0
fi

"${compose[@]}" stop mongo >/dev/null 2>&1 || true
"${compose[@]}" --profile bootstrap up -d mongo-bootstrap

for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T mongo-bootstrap mongosh --quiet \
    --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 2
done

"${compose[@]}" exec -T mongo-bootstrap mongosh --quiet --file /scripts/bootstrap.js
"${compose[@]}" stop mongo-bootstrap
"${compose[@]}" rm -f mongo-bootstrap
touch "$marker"
chmod 600 "$marker"
echo "Mongo bootstrap xong."
```

```bash
chmod +x scripts/prod-mongo-bootstrap.sh
```

- [ ] **Step 7: Validate compose/Caddy/script**

Run:

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null
docker run --rm -e DOMAIN=nextask.example.com -e ACME_EMAIL=ops@example.com \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile
bash -n scripts/prod-mongo-bootstrap.sh
rm .env.production
```

Expected: tất cả pass. Giữ `.env.production` nếu đang test staging; không commit.

- [ ] **Step 8: Commit**

```bash
git add .env.production.example .gitignore docker-compose.prod.yml deploy/Caddyfile deploy/mongo/bootstrap.js scripts/prod-mongo-bootstrap.sh
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add production compose caddy and mongo auth bootstrap"
```

---

### Task 3: CI, backup/restore và runbook

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/prod-backup.sh`
- Create: `scripts/prod-restore-drill.sh`
- Create: `docs/production-runbook.md`

**Interfaces:**
- Consumes: production compose/env Task 2.
- Produces: CI; backup/restore; runbook.

- [ ] **Step 1: Tạo CI workflow**

Tạo `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 26
          cache: npm
      - run: npm ci
      - run: docker compose up -d mongo mongo-init
      - name: Wait for MongoDB replica set
        run: |
          for i in $(seq 1 30); do
            if docker compose exec -T mongo mongosh --quiet \
              --eval 'db.adminCommand({ ping: 1 }).ok' | grep -q 1; then
              exit 0
            fi
            sleep 2
          done
          docker compose logs mongo mongo-init
          exit 1
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm run test
      - run: npm run build:web
      - name: Validate production compose
        run: |
          cp .env.production.example .env.production
          docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null
          rm .env.production
      - name: Validate Caddyfile
        run: |
          docker run --rm -e DOMAIN=nextask.example.com -e ACME_EMAIL=ops@example.com \
            -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
            caddy:2 caddy validate --config /etc/caddy/Caddyfile
      - if: always()
        run: docker compose down -v
```

- [ ] **Step 2: Tạo backup script**

Tạo `scripts/prod-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source .env.production
mkdir -p backups/prod

timestamp="$(date +%Y%m%d-%H%M%S)"
file="backups/prod/nextask-prod-${timestamp}.gz"

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T mongo \
  mongodump --host localhost \
  --username "$MONGO_ROOT_USERNAME" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db nextask --archive --gzip > "$file"

gzip -t "$file"
find backups/prod -name 'nextask-prod-*.gz' -mtime +14 -delete
ls -lh "$file"
```

```bash
chmod +x scripts/prod-backup.sh
```

- [ ] **Step 3: Tạo restore drill script**

Tạo `scripts/prod-restore-drill.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source .env.production

archive="${1:-$(ls -t backups/prod/nextask-prod-*.gz | head -n 1)}"
[[ -f "$archive" ]] || { echo "Không tìm thấy backup: $archive" >&2; exit 1; }
gzip -t "$archive"

compose=(docker compose --env-file .env.production -f docker-compose.prod.yml)
"${compose[@]}" exec -T mongo mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval 'db.getSiblingDB("nextask_restore_drill").dropDatabase()'

"${compose[@]}" exec -T mongo mongorestore --archive --gzip \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --nsFrom='nextask.*' --nsTo='nextask_restore_drill.*' < "$archive"

"${compose[@]}" exec -T mongo mongosh --quiet \
  --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --eval '
const app = db.getSiblingDB("nextask");
const drill = db.getSiblingDB("nextask_restore_drill");
const names = ["users","boards","items","tasks","activities","voter_budgets","schema_migrations"];
let failed = false;
for (const name of names) {
  const expected = app.getCollection(name).countDocuments();
  const actual = drill.getCollection(name).countDocuments();
  printjson({ name, expected, actual });
  if (expected !== actual) failed = true;
}
drill.dropDatabase();
if (failed) quit(2);
'
```

```bash
chmod +x scripts/prod-restore-drill.sh
```

- [ ] **Step 4: Tạo runbook**

Tạo `docs/production-runbook.md` với các mục:

1. Chuẩn bị VPS: Docker/Compose, firewall chỉ 22/80/443, DNS A/AAAA về VPS.
2. `.env.production`: copy example, điền domain, license, secret mạnh; `chmod 600`.
3. Build: `docker compose --env-file .env.production -f docker-compose.prod.yml build`.
4. Bootstrap Mongo: `bash scripts/prod-mongo-bootstrap.sh`.
5. Start: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.
6. Kiểm tra: `curl https://$DOMAIN/api/v1/health`; đăng ký user đầu tiên; tạo board;
   note/promote/Kanban/reload; không còn watermark tldraw.
7. Backup: cron/systemd timer chạy `scripts/prod-backup.sh`; restore drill.
8. Logs: `docker compose ... logs -f --tail=200 api web caddy`; Docker log rotation.
9. Rollback: giữ image/tag trước, `git checkout v0.8`, build lại, `up -d`.
10. Rotate secrets: JWT logout toàn bộ; Mongo password qua `db.changeUserPassword`,
    cập nhật `.env.production`, recreate `api`/`migrate`.
11. Sự cố: Mongo/VPS một node, khôi phục volume/backup; Caddy certificate/DNS.
12. Không chạy seed demo trên production; không publish cổng Mongo/API/web.

- [ ] **Step 5: Validate script/YAML**

Run:

```bash
bash -n scripts/prod-backup.sh
bash -n scripts/prod-restore-drill.sh
npx prettier --check .github/workflows/ci.yml
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml scripts/prod-backup.sh scripts/prod-restore-drill.sh docs/production-runbook.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "feat: add production ci backup and runbook"
```

---

### Task 4: Staging production-like và gate

**Files:**
- Không commit code mới; dùng `.env.production` local (ignored).
- Evidence cho docs Task 5.

**Interfaces:**
- Consumes: Task 1-3.
- Produces: chứng minh Mongo auth/Caddy config/build/backup; full gates.

- [ ] **Step 1: Tạo env staging local**

```bash
cp .env.production.example .env.production
# Sửa DOMAIN=localhost, JWT_SECRET và Mongo password bằng giá trị test mạnh
```

Giữ `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` placeholder nếu chưa có key local; ghi rõ
watermark local không dùng để kết luận production. Dùng mật khẩu Mongo chỉ gồm chữ/số
hoặc percent-encode nếu có ký tự đặc biệt trong URI.

- [ ] **Step 2: Validate cấu hình**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null
docker run --rm -e DOMAIN=localhost -e ACME_EMAIL=ops@example.com \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile
```

Expected: pass.

- [ ] **Step 3: Build production images**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build api web migrate
```

Expected: build pass. Kiểm tra không có secret thật trong image layers bằng cách không
truyền secret qua `ARG` (chỉ license public và API URL).

- [ ] **Step 4: Bootstrap Mongo auth**

Run:

```bash
bash scripts/prod-mongo-bootstrap.sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d mongo
```

Kiểm tra auth:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T mongo \
  mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

Expected: lệnh không credential bị từ chối. Sau đó chạy health có credential qua API.

- [ ] **Step 5: Start API/web/migrate (không Caddy local)**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d migrate api web
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T api \
  node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(async (r)=>{console.log(r.status, await r.text());process.exit(r.ok?0:1)})"
```

Expected: health `ok`, Mongo primary; API dùng app user auth.

Kiểm tra web sống nội bộ:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web \
  node -e "fetch('http://127.0.0.1:3000').then((r)=>{console.log(r.status);process.exit(r.ok?0:1)})"
```

- [ ] **Step 6: Backup/restore drill**

Run:

```bash
bash scripts/prod-backup.sh
bash scripts/prod-restore-drill.sh
```

Expected: backup `gzip -t` pass; counts khớp; DB drill drop.

- [ ] **Step 7: Full gate**

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

Expected: pass; ghi counts/durations.

- [ ] **Step 8: Dọn staging**

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down -v
rm .env.production
```

Chỉ xóa volume của project `nextask-prod` vừa tạo; không đụng stack dev.

---

### Task 5: V1.0 release và live deploy

**Files:**
- Modify: `package.json`, workspace packages, `package-lock.json`, `.env.example`,
  `docker-compose.yml`, `docker-compose.prod.yml`.
- Modify: `README.md`, `docs/architecture.md`, `docs/session-log.md`,
  `docs/git-workflow.md`, `docs/phases/09-production-v1.md`.

**Interfaces:**
- Consumes: staging evidence Task 4; VPS/domain/license thật.
- Produces: `1.0.0`, live deployment, tag `v1.0`.

Điều kiện bắt buộc: người dùng cung cấp domain/DNS, quyền deploy VPS và license key
qua `.env.production` trên VPS. Không đưa secret vào chat/commit. Nếu thiếu, dừng
sau Task 4 và báo blocker; không tag v1.

- [ ] **Step 1: Merge feature vào release**

```bash
git checkout release/v1.0
git merge --no-ff feat/phase-9-production -m "merge: phase 9 production hardening"
```

- [ ] **Step 2: Bump 1.0.0**

Sửa root/API/web/contracts `version` thành `1.0.0`, `package-lock.json`,
`.env.example`/`docker-compose.yml` `SERVICE_VERSION=1.0.0`;
`docker-compose.prod.yml` đã mặc định `1.0.0`.

Run:

```bash
npm install --package-lock-only --ignore-scripts
```

Expected: lock version `1.0.0`.

- [ ] **Step 3: Release gate trên release/v1.0**

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

Ghi counts/durations.

- [ ] **Step 4: Deploy staging/live trên VPS**

Trên VPS:

```bash
git fetch --all --tags
git checkout release/v1.0
cp .env.production.example .env.production
# điền DOMAIN, ACME_EMAIL, JWT_SECRET, Mongo password, license key thật
chmod 600 .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml build
bash scripts/prod-mongo-bootstrap.sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Expected: Caddy cấp certificate; health HTTPS.

- [ ] **Step 5: Live smoke**

- `curl https://$DOMAIN/api/v1/health` trả version `1.0.0`, Mongo primary.
- HTTP redirect sang HTTPS; cookie login có `Secure`.
- Đăng ký user đầu tiên, tạo board, note, promote, Kanban, reload.
- Frame/whiteboard, cursor Tải thêm, search token hoạt động.
- Không còn watermark tldraw.
- Không truy cập được Mongo/API/web qua cổng public khác.
- Chạy backup/restore drill trên VPS; counts khớp.
- Nếu bất kỳ mục fail: dừng, không tag v1.0.

- [ ] **Step 6: Docs release và merge main**

Cập nhật README version 1.0.0, runbook URL, trạng thái production; session log/git
workflow/phase 09 ghi deployment, gate, tag. Commit docs trên release/v1.0.

```bash
git add README.md docs/architecture.md docs/session-log.md docs/git-workflow.md docs/phases/09-production-v1.md
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "docs: record v1.0.0 production release"
git checkout main
git merge --no-ff release/v1.0 -m "release: v1.0 production"
```

- [ ] **Step 7: Tag v1.0 và push theo yêu cầu**

```bash
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com tag -a v1.0 -m "NexTask v1.0.0 - production"
git branch --show-current
git tag --list 'v1.0'
```

Chỉ push `main`, `release/v1.0`, tag `v1.0` khi người dùng yêu cầu rõ.

- [ ] **Step 8: Rollback plan**

- Giữ tag/image `v0.8.0` và backup pre-v1.
- Nếu live smoke fail sau deploy: `git checkout v0.8` trên VPS, build lại, `up -d`;
  restore backup nếu migration/dữ liệu hỏng.
- Ghi rollback đã dùng vào runbook/session log.

---

## Self-Review Notes

- Spec coverage: Task 1 runtime/license; Task 2 compose/Caddy/Mongo; Task 3 CI/backup/runbook;
  Task 4 staging/gates; Task 5 release/deploy.
- Không commit secret; `.env.production`/`secrets` ignored.
- Type names: `TRUST_PROXY`, `AUTH_RATE_LIMIT_MAX`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`,
  `mongodb://...?authSource=admin`, `nextask-prod`.
- Live deploy/tag v1.0 explicitly blocked on user-supplied VPS/domain/license; nếu thiếu
  dừng ở Task 4.
