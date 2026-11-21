# Giai đoạn 9 - Production hardening và phát hành v1.0

- Trạng thái: Release candidate 1.0.0, đã merge main, chờ live deploy/tag v1.0
- Ngày lập: 2026-11-21
- Tiền đề: v0.8.0 đã merge `main`, tag `v0.8`, đã push
- Nhánh: `release/v1.0`; feature `feat/phase-9-production`
- Mục tiêu phát hành: `1.0.0`, tag `v1.0`

## 1. Mục tiêu

1. Chạy NexTask trên VPS một máy bằng Docker Compose production.
2. Caddy làm reverse proxy, tự động HTTPS cho domain thật.
3. MongoDB self-host bật auth, không publish cổng ra ngoài.
4. Tách secret khỏi repo; không dùng seed owner mặc định trên production.
5. Thêm CI, backup/restore, log rotation, health/uptime và runbook vận hành.
6. Gắn license tldraw qua build env; không commit license key.
7. Chạy staging production-like, smoke test, sau đó phát hành `1.0.0`.
8. Không đổi API nghiệp vụ, schema hay UI ngoài cấu hình bảo mật/license.

## 2. Quyết định

1. Một VPS chạy Docker Compose production; không Kubernetes, không multi-node.
2. Caddy là entrypoint công khai duy nhất (80/443); API, web và Mongo không
   publish cổng host.
3. Mongo replica set `rs0` một node, bật `--auth` + keyFile; app dùng user riêng,
   DB `nextask`, `authSource=admin`. Keyfile sinh một lần trong Docker volume bởi
   service one-shot, không commit và không mount từ host.
4. Bootstrap Mongo lần đầu bằng profile service tạm không auth trên cùng volume:
   `rs.initiate`, tạo root/app user, dừng service tạm rồi mới chạy mongo với
   `--auth --keyFile`; script idempotent và có marker.
5. Domain và license lấy từ `.env.production`/build args, không hardcode.
6. `NEXT_PUBLIC_API_URL=https://${DOMAIN}/api/v1`; CORS và cookie production theo
   domain HTTPS.
7. Production không chạy seed owner demo; user đầu tiên đăng ký bình thường, các
   user khác vào board qua invitation.
8. API đọc `TRUST_PROXY` để rate limit và IP đúng sau Caddy.
9. tldraw license truyền qua `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` khi build web.
10. CI GitHub Actions chạy typecheck/lint/format/test/build với MongoDB replica set
    thật; E2E chạy ở gate/staging, không chạy mặc định mỗi push nếu quá nặng.
11. Backup bằng `mongodump` có auth, retention mặc định 14 ngày; restore drill vào
    DB tạm trước khi restore thật.
12. v1.0 chỉ được tag sau khi staging production-like và live smoke trên domain
    thật đạt; không tag chỉ vì code build xanh.

## 3. API/runtime config

Thêm env:

```ts
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb://...
MONGODB_REPLICA_SET=rs0
CORS_ORIGIN=https://<domain>
LOG_LEVEL=info
SERVICE_VERSION=1.0.0
JWT_SECRET=<secret >= 32 bytes>
COOKIE_SECURE=true
TRUST_PROXY=1
AUTH_RATE_LIMIT_MAX=5
```

- `loadEnv` từ chối production nếu `COOKIE_SECURE=false`.
- `loadEnv` từ chối `JWT_SECRET` trùng giá trị dev mẫu hoặc ngắn hơn 32 ký tự.
- `createApp` nhận `trustProxy` và gọi `app.set('trust proxy', trustProxy)`.
- Auth rate limit dùng `AUTH_RATE_LIMIT_MAX`.
- `SEED_OWNER_*` không có trong `.env.production.example`; migration không seed owner.
- Log JSON pino hiện có; Docker log rotation đặt ở compose.

## 4. Production Compose

Tạo `docker-compose.prod.yml` gồm:

- `mongo`: image `mongo:8.0`, command `--replSet rs0 --bind_ip_all --auth --keyFile`,
  volume dữ liệu, keyfile read-only, healthcheck có auth; không ports.
- `mongo-bootstrap`: sidecar một lần, `network_mode: service:mongo`, tạo root/app user
  và initiate replica set; idempotent.
- `migrate`: build API, chạy migration trước API; dùng app Mongo URI.
- `api`: build API, healthcheck nội bộ, không ports.
- `web`: build web với `NEXT_PUBLIC_API_URL` và license key; không ports.
- `caddy`: image Caddy 2, ports 80/443, volume Caddyfile/data/config, phụ thuộc API/web.
- Tất cả service có `restart`, logging `json-file` max-size/max-file.
- Chỉ Caddy publish `0.0.0.0:80`/`443`; Mongo/API/web dùng network nội bộ.
- `docker-compose.prod.yml` đọc `.env.production`; không hardcode secret.

Tạo `.env.production.example` (không chứa giá trị thật):

```text
DOMAIN=nextask.example.com
JWT_SECRET=change-me...
MONGO_ROOT_USERNAME=nextask_root
MONGO_ROOT_PASSWORD=change-me...
MONGO_APP_USERNAME=nextask_app
MONGO_APP_PASSWORD=change-me...
AUTH_RATE_LIMIT_MAX=5
NEXT_PUBLIC_TLDRAW_LICENSE_KEY=change-me...
```

`.env.production` nằm trong `.gitignore`; quyền file 600 trên VPS.

## 5. Caddy

`deploy/Caddyfile`:

```caddy
{$DOMAIN} {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
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

- WebSocket/Socket.IO đi qua Caddy tự động.
- DNS A/AAAA trỏ domain về VPS trước khi bật Caddy.
- Caddy lưu certificate trong volume; không commit certificate.

## 6. Mongo auth và bootstrap

- Keyfile sinh trong Docker volume `mongo-keyfile` bởi service one-shot; không commit,
  không mount host. Volume keyfile cần được backup cùng dữ liệu.
- Bootstrap idempotent:
  1. Chờ Mongo healthy.
  2. `rs.initiate` nếu chưa initiated.
  3. Tạo root user và app user nếu chưa có.
  4. Kiểm tra app user truy vấn được `nextask`.
- App URI dùng `authSource=admin`, không dùng root user cho app.
- Không publish `27017`; chỉ network Docker nội bộ.
- Không bật TLS nội bộ Mongo trong v1 vì không có traffic ngoài Docker network;
  ghi rõ đánh đổi trong runbook.

## 7. tldraw license

- `apps/web/features/whiteboard/whiteboard-canvas.tsx` truyền
  `licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}` vào `<Tldraw>`.
- `apps/web/Dockerfile` nhận build arg `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` và set env
  trước `next build`; compose production truyền build arg từ `.env.production`.
- Local/dev không có key vẫn chạy watermark; production gate kiểm tra watermark biến mất.
- Không log license key.

## 8. CI và chất lượng

Tạo `.github/workflows/ci.yml`:

- Trigger: push và pull_request.
- Node 26, npm cache.
- Khởi động Mongo replica set bằng Docker Compose (`mongo`, `mongo-init`).
- Chạy `npm ci`, typecheck, lint, format:check, full test, build:web.
- Không cần secret production; dùng test env local.
- E2E: job riêng hoặc bước optional sau khi stack Docker build; nếu chạy trong CI,
  cần Playwright Chromium và seed demo.

Gate local/staging vẫn giữ:

- typecheck/lint/format/build:web.
- Full suite ba lần.
- Playwright smoke.
- `docker compose -f docker-compose.prod.yml config` hợp lệ.
- `caddy validate` với Caddyfile.

## 9. Backup, restore, vận hành

- `scripts/prod-backup.sh`:
  - đọc `.env.production`;
  - `mongodump --uri` với app/root user, archive gzip;
  - `gzip -t`;
  - retention 14 ngày;
  - in tên/kích thước file.
- Cron/systemd timer mẫu chạy hằng ngày; không đặt cron tự động trên máy dev.
- `scripts/prod-restore-drill.sh` restore archive vào DB tạm có auth, so counts,
  drop DB tạm; không restore đè production.
- Runbook `docs/production-runbook.md`:
  - DNS/TLS, deploy, migration, rollback image;
  - rotate JWT/Mongo password;
  - xem log Caddy/API, health, disk;
  - backup/restore;
  - sự cố Mongo/VPS một node.
- Log rotation Docker; health endpoint `GET /api/v1/health` và kiểm tra HTTPS.

## 10. Staging và deploy v1.0

1. Tạo `.env.production` trên VPS từ example; điền domain, license, secret mạnh.
2. DNS trỏ domain về VPS.
3. Build images, chạy `mongo-bootstrap`, migrate, API/web/Caddy.
4. Smoke:
   - `https://<domain>/api/v1/health` trả `1.0.0`, Mongo `rs0` primary;
   - register/login, tạo board, note, promote, Kanban, reload;
   - frame + cursor + search hoạt động;
   - cookie `Secure`, HTTP redirect HTTPS, CORS domain đúng;
   - tldraw không còn watermark;
   - backup chạy và restore drill counts khớp.
5. Nếu smoke đạt: bump `1.0.0`, merge `release/v1.0` vào `main`, tag `v1.0`, deploy
   đúng commit đã tag.
6. Nếu smoke fail: không tag v1; sửa trên feature/release và lặp staging.

## 11. Acceptance

- Production config không chứa secret thật trong repo.
- `docker compose -f docker-compose.prod.yml config` pass với env mẫu.
- Mongo không truy cập được từ ngoài; app user auth đúng.
- API health HTTPS, cookie Secure, CORS domain, rate limit sau proxy.
- License tldraw áp dụng, không watermark trên production.
- CI workflow pass; full suite 42 file/186 test ba lần; Playwright pass.
- Backup/restore drill pass; runbook đủ để người khác vận hành.
- v1.0 tag chỉ sau live smoke; rollback image trước đó được ghi lại.

## 12. Git

- `release/v1.0` từ `main` tại `78bf21a`; feature `feat/phase-9-production`.
- Feature merge `release/v1.0` bằng `--no-ff` sau gate.
- Không merge `main`/tag v1.0 trước khi staging/live smoke đạt.
- Không push nếu người dùng chưa yêu cầu; tag `v1.0` annotated.

## 13. Rủi ro và phụ thuộc

- Cần user cung cấp VPS/SSH, domain/DNS và license key thật để deploy; repo chỉ có
  example placeholder.
- VPS một máy và Mongo một node: mất host là mất dịch vụ cho tới khi restore.
- Keyfile/permission Mongo dễ sai; bootstrap phải được kiểm tra trên staging.
- Caddy cần DNS đúng trước khi cấp certificate; không bật production khi DNS chưa trỏ.
- Nếu license key sai/hết hạn, watermark có thể quay lại; smoke phải kiểm tra.
- CI chạy Mongo thật có thể chậm; không nới timeout để xanh.

## 14. Ngoài phạm vi

- Mongo multi-node failover/Atlas, Kubernetes, Redis adapter, CDN/WAF.
- SSO, email invitation tự động, billing, multi-region.
- TLS nội bộ Mongo trong Docker network.
- Thay đổi schema/API nghiệp vụ.

## 15. Kiểm chứng staging

- Production compose config và Caddyfile validate pass; Caddy chưa chạy TLS vì staging
  dùng domain localhost, không có DNS public.
- Mongo bootstrap production-like: replica set `rs0`, keyfile volume, root/app user;
  `listDatabases` không credential bị từ chối, app user truy vấn được.
- API production-like health trả `version=1.0.0`, Mongo primary; web health 200.
- Smoke API: register 201, create board 201, list boards 200.
- Backup production-like 3.2 KB; restore drill counts khớp, schema 8 migration, DB tạm drop.
- Gate: typecheck/lint/format/build:web pass; full suite 42 file, 188 test ba lần
  34.75/32.87/32.29 s; Playwright pass; dev Docker health `1.0.0`.
- License tldraw local dùng placeholder; kiểm tra watermark thật và HTTPS/DNS vẫn là
  điều kiện live deploy.
- Blocker còn lại: cần VPS/SSH, domain/DNS và license key thật trong `.env.production`
  trên server để live smoke, merge `main` và tag `v1.0`.

## 16. Merge main release candidate

- Merge `release/v1.0` vào `main` bằng `--no-ff`: `99d2dfc`
  (`release: v1.0 production hardening`).
- Main gate: typecheck/lint/format/build:web pass; full suite 42 file, 188 test ba lần
  34.17/32.34/32.85 s; Playwright pass; Docker health `1.0.0`.
- Docs release candidate merge sau main; tag `v1.0` vẫn chờ live smoke trên VPS/domain.
- Không push trong bước này.

## 17. Self-host public bằng máy cá nhân

- Bổ sung mode chạy trên máy cá nhân, expose qua Cloudflare Named Tunnel; domain/TLS do
  Cloudflare quản lý, không cần VPS hay mở cổng inbound.
- Stack riêng `docker-compose.public.yml`: Mongo auth/keyfile volume riêng, migration,
  seed, API, web, Caddy nội bộ `public-proxy:8080`, cloudflared.
- `scripts/start-public.sh` tạo `.env.public` với JWT/Mongo/owner password ngẫu nhiên,
  seed demo + owner, build và in URL/tài khoản owner.
- `scripts/stop-public.sh` dừng stack, giữ volume dữ liệu.
- Cloudflare Public Hostname trỏ `http://public-proxy:8080`; token chỉ nằm trong
  `.env.public` (600, ignored).
- Tài liệu: `docs/public-host.md`.
- Giới hạn: máy phải bật, một node, đăng ký mở; dùng Cloudflare Access nếu cần giới hạn.
- Live tunnel smoke vẫn cần domain/token thật trước khi tag v1.0.
