# Self-host public bằng máy cá nhân

Mô hình này chạy toàn bộ NexTask bằng Docker trên máy của bạn và mở link public qua
Cloudflare Named Tunnel. Không cần VPS, không mở cổng inbound, không cần domain trỏ A
record về máy.

## 1. Yêu cầu

- Docker Engine + Docker Compose.
- Domain đã add vào Cloudflare.
- Một Cloudflare Named Tunnel token.
- License tldraw nếu muốn bỏ watermark production.

## 2. Tạo Cloudflare Tunnel

1. Vào Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel.
2. Chọn Cloudflared, đặt tên, copy **tunnel token**.
3. Public Hostname:
   - Subdomain/domain: ví dụ `nextask.example.com`.
   - Service type: `HTTP`.
   - URL: `public-proxy:8080`.
4. Không cần cài cloudflared trên host; container trong stack sẽ kết nối bằng token.

`public-proxy:8080` là tên service trong Docker Compose public, không phải domain public.

## 3. Chạy một lệnh

Từ thư mục repo:

```bash
PUBLIC_DOMAIN=nextask.example.com \
CLOUDFLARE_TUNNEL_TOKEN='<token>' \
NEXT_PUBLIC_TLDRAW_LICENSE_KEY='<license>' \
./scripts/start-public.sh
```

Script sẽ:

1. Tạo `.env.public` với JWT/Mongo password ngẫu nhiên (file 600, không commit).
2. Build API/web production.
3. Bootstrap Mongo auth/keyfile trong volume riêng `nextask-public`.
4. Chạy migration, seed demo và tạo owner mới với mật khẩu ngẫu nhiên.
5. Khởi động API, web, Caddy proxy và cloudflared.
6. Chờ `https://<domain>/api/v1/health` rồi in URL + tài khoản owner.

Tài khoản owner có dạng:

```text
Owner email: owner@nextask.example.com
Owner password: <random, in ra terminal>
```

Demo board `NexTask Demo Retro` có sẵn 9 note, 3 frame, 5 task. Demo member có mật khẩu
ngẫu nhiên không in ra; chỉ owner dùng để đăng nhập.

Nếu chưa có `.env.public`, script tạo mới. Các lần sau chạy lại cùng lệnh để dùng lại
domain/token/dữ liệu; có thể bỏ các biến môi trường vì script đọc `.env.public`.

## 4. Dừng và dữ liệu

```bash
./scripts/stop-public.sh
```

Lệnh này giữ volume dữ liệu. Chỉ dùng `down -v` khi chủ động xóa toàn bộ dữ liệu public.

Backup public dùng lại script production với env/compose public:

```bash
ENV_FILE=.env.public COMPOSE_FILE=docker-compose.public.yml \
BACKUP_DIR=backups/public BACKUP_LABEL=public bash scripts/prod-backup.sh

ENV_FILE=.env.public COMPOSE_FILE=docker-compose.public.yml \
BACKUP_DIR=backups/public bash scripts/prod-restore-drill.sh
```

Đổi license sau lần đầu: sửa `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` trong `.env.public`, rebuild
web và recreate:

```bash
docker compose --env-file .env.public -f docker-compose.public.yml build web
docker compose --env-file .env.public -f docker-compose.public.yml up -d web public-proxy cloudflared
```

## 5. Kiểm tra

```bash
curl -fsS https://nextask.example.com/api/v1/health
docker compose --env-file .env.public -f docker-compose.public.yml ps
docker compose --env-file .env.public -f docker-compose.public.yml logs -f --tail=200 api web public-proxy cloudflared
```

Health phải trả `version=1.0.0`, Mongo `rs0`, primary. Không có cổng 3000/4000/27017
public trên máy; chỉ cloudflared outbound.

## 6. Bảo mật và giới hạn

- Máy phải bật và kết nối Internet thì link mới sống.
- `.env.public` và tunnel token là secret; không commit/chia sẻ. Tunnel token lộ phải
  rotate trong Cloudflare.
- Đăng ký tài khoản đang mở; ai có link có thể đăng ký và tạo board riêng. Nếu chỉ muốn
  người được mời, bật Cloudflare Access hoặc tắt đăng ký ở phase sau.
- Đây là self-host một máy; không có failover. Backup định kỳ nếu dữ liệu quan trọng.
- Cloudflare Tunnel chịu TLS public; Caddy nội bộ chỉ HTTP trong Docker network.
- Nếu health public fail: kiểm tra token, public hostname `public-proxy:8080`, DNS
  Cloudflare và log `cloudflared`.
