# NexTask Production Runbook

## 1. Chuẩn bị VPS

- Ubuntu/Debian có Docker Engine và Docker Compose plugin.
- Firewall chỉ mở `22/tcp`, `80/tcp`, `443/tcp`.
- DNS A/AAAA của domain trỏ về IP VPS trước khi bật Caddy.
- Clone repo vào `/opt/nextask` hoặc thư mục tương đương.
- Không chạy seed demo trên production.

## 2. Cấu hình secret

```bash
cd /opt/nextask
cp .env.production.example .env.production
chmod 600 .env.production
```

Điền:

- `DOMAIN`: domain thật.
- `ACME_EMAIL`: email vận hành.
- `JWT_SECRET`: `openssl rand -base64 48`.
- `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`: chuỗi dài ngẫu nhiên, chỉ chữ/số
  hoặc percent-encode nếu có ký tự đặc biệt trong URI.
- `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`: license key thật.
- `SERVICE_VERSION=1.0.0`.

Không commit `.env.production`. Không đưa license/secret vào chat hoặc issue.

## 3. Build và bootstrap

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
bash scripts/prod-mongo-bootstrap.sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

`prod-mongo-bootstrap.sh` chạy Mongo tạm không auth trên cùng volume, initiate
replica set, tạo root/app user, rồi dừng service tạm. Marker `secrets/mongo-initialized`
ngăn bootstrap lại.

Kiểm tra:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS "https://$DOMAIN/api/v1/health"
```

Health phải trả `version=1.0.0`, Mongo `rs0`, primary. Chỉ Caddy publish 80/443;
Mongo/API/web chỉ ở network nội bộ.

## 4. Smoke test

1. Mở `https://$DOMAIN`, đăng ký user đầu tiên.
2. Tạo board, tạo note, promote, kéo Kanban, reload.
3. Kiểm tra frame, Tải thêm, search token.
4. Kiểm tra tldraw không còn watermark.
5. Kiểm tra HTTP redirect HTTPS và cookie có `Secure`.
6. Kiểm tra không truy cập được `:27017`, `:4000`, `:3000` từ ngoài.

Nếu bất kỳ mục fail: không tag `v1.0`, xem log và rollback.

## 5. Backup

Chạy thủ công:

```bash
bash scripts/prod-backup.sh
bash scripts/prod-restore-drill.sh
```

Cron mẫu trên host:

```cron
0 3 * * * cd /opt/nextask && ./scripts/prod-backup.sh >> /var/log/nextask-backup.log 2>&1
```

Retention mặc định 14 ngày trong `backups/prod`. Backup keyfile volume:

```bash
mkdir -p backups/prod
docker run --rm \
  -v nextask-prod_mongo-keyfile:/key:ro \
  -v "$PWD/backups/prod":/backup \
  alpine:3.20 \
  tar czf "/backup/mongo-keyfile-$(date +%Y%m%d-%H%M%S).tgz" -C /key .
```

Restore drill chỉ restore vào `nextask_restore_drill`, so counts rồi drop. Không
restore đè production khi chưa backup và chưa có cửa sổ bảo trì.

## 6. Logs và health

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=200 api web caddy
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS "https://$DOMAIN/api/v1/health"
```

Docker dùng json-file `max-size=10m`, `max-file=5`. Không bật profiler mức 2 trên
production.

## 7. Rotate secret

- JWT: đổi `JWT_SECRET`, recreate API; mọi session cũ mất hiệu lực.
- Mongo app password:

```js
db.getSiblingDB("admin").changeUserPassword("nextask_app", "new-password")
```

Cập nhật `.env.production`, recreate `migrate`/`api`, kiểm tra health.

## 8. Rollback

- Giữ image/tag ổn định trước (ví dụ `v0.8`).
- Nếu deploy lỗi: checkout tag cũ hoặc dùng image cũ, build/up lại.
- Nếu migration/dữ liệu lỗi: dừng API, restore backup đã kiểm tra, rồi đưa API lên.
- Ghi thời điểm, tag, backup và lý do rollback vào session log.

## 9. Sự cố đã biết

- VPS một máy hoặc Mongo một node: mất host là mất dịch vụ đến khi restore.
- DNS sai làm Caddy không cấp được certificate.
- Keyfile volume mất: backup keyfile volume cùng dữ liệu; không xóa volume khi chưa
  backup.
- License tldraw sai/hết hạn: watermark có thể trở lại; kiểm tra sau deploy.
- Không chạy `docker compose down -v` trên production trừ khi đã backup và chủ động
  xóa dữ liệu.

## 10. Self-host public bằng máy cá nhân

Nếu không dùng VPS, có thể chạy stack public ngay trên máy cá nhân qua Cloudflare Named
Tunnel. Xem [public-host.md](public-host.md) và dùng:

```bash
PUBLIC_DOMAIN=nextask.example.com \
CLOUDFLARE_TUNNEL_TOKEN='<token>' \
NEXT_PUBLIC_TLDRAW_LICENSE_KEY='<license>' \
./scripts/start-public.sh
```

Cloudflare Public Hostname trỏ `http://public-proxy:8080`. Stack dùng volume
`nextask-public` riêng, không đụng DB dev. Dừng bằng `./scripts/stop-public.sh`.
