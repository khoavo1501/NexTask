# NexTask

Whiteboard và Kanban cho team Agile, gộp brainstorm và thực thi trên cùng một board.

Giai đoạn 1 đã có slice dọc:

- Tạo board.
- Đặt sticky note trên tldraw.
- Promote note thành task trong transaction.
- Task xuất hiện trên Kanban.
- Kéo task sang cột khác.
- Reload và thấy badge `Đã thành task` kèm cột hiện tại trên note.

Phase 1 dùng một demo owner cố định, chưa có đăng nhập. Auth, member, `$jsonSchema`, realtime và Demote thuộc các giai đoạn sau.

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

## Luồng thử Phase 1

1. Mở web, tạo board.
2. Chọn công cụ `Note`, bấm lên canvas và nhập nội dung.
3. Chọn ghi chú, bấm `Promote thành task`, chọn cột và xác nhận.
4. Kéo task trên Kanban sang cột khác, ví dụ `Done`.
5. Reload trang: note phải còn badge `Đã thành task · Done`.

`Done` xác định bằng trường `isDone` của cột. Phase 1 chưa có realtime nên badge chỉ buộc cập nhật sau reload.

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

Test API dùng MongoDB replica set thật, không mock database. Mỗi giai đoạn dùng database test riêng, có thể override bằng `MONGODB_TEST_URI`.

## Bảo mật local

MongoDB local không bật auth và chỉ publish cổng ra `127.0.0.1`. Cấu hình này chỉ dành cho phát triển. Không dùng nguyên trạng cho production; production cần auth, TLS, mạng riêng và secret management.

## tldraw license

Bản web đang build production nên tldraw hiển thị nút/license watermark. Đây là yêu cầu license của tldraw SDK, không bị ẩn bởi dự án. Cần license key phù hợp trước khi dùng thương mại hoặc phát hành production.

## Git

Repository Git cục bộ trên `main`, chưa cấu hình remote. Không tự push. Quy tắc commit và identity nằm trong [docs/git-workflow.md](docs/git-workflow.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Giai đoạn 0](docs/phases/00-setup.md)
- [Giai đoạn 1](docs/phases/01-vertical-slice.md)
- [Ghi chú MongoDB](docs/mongodb-notes.md)
- [Lịch sử phiên](docs/session-log.md)
- [Quy trình Git](docs/git-workflow.md)
