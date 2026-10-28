# NexTask

Whiteboard và Kanban cho team Agile, gộp brainstorm và thực thi trên cùng một board. Giai đoạn 0 dựng nền tảng: MongoDB replica set, API health check thật và web Next.js hiển thị trạng thái.

## Yêu cầu

- Docker và Docker Compose
- Node.js 26 và npm 12 cho phát triển ngoài container

## Chạy toàn hệ thống

```bash
docker compose up --build
```

Sau lần build đầu, có thể dùng:

```bash
docker compose up
```

Các URL local:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/v1/health`
- MongoDB: `127.0.0.1:27017`

Kiểm tra nhanh:

```bash
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
docker compose exec -T mongo mongosh --quiet --eval 'rs.status().set'
```

## Phát triển local

Khởi động MongoDB:

```bash
docker compose up -d mongo mongo-init
```

Chuẩn bị biến môi trường và chạy API/web:

```bash
cp .env.example .env
npm install
npm run dev
```

API tự đọc `.env` ở thư mục gốc. Khi chạy ngoài Docker, dùng URI có `directConnection=true` vì member của replica set được cấu hình là `mongo:27017`.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Test API dùng MongoDB replica set thật, không mock database. Test health chỉ đọc và dùng database `nextask_phase0_test`; có thể override bằng `MONGODB_TEST_URI`.

## Bảo mật local

MongoDB local không bật auth và chỉ publish cổng ra `127.0.0.1`. Cấu hình này chỉ dành cho phát triển. Không dùng nguyên trạng cho production; production cần auth, TLS, mạng riêng và secret management.

## Git

Repository Git cục bộ trên `main`, chưa cấu hình remote. Không tự push. Quy tắc commit và identity nằm trong [docs/git-workflow.md](docs/git-workflow.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Giai đoạn 0](docs/phases/00-setup.md)
- [Ghi chú MongoDB](docs/mongodb-notes.md)
- [Lịch sử phiên](docs/session-log.md)
