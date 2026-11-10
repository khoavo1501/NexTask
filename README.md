# NexTask

Whiteboard và Kanban cho team Agile, gộp brainstorm và thực thi trên cùng một board.

Phiên bản hiện tại: `0.2.0`; Phase 3A đang trên `release/v0.3`, chưa phát hành v0.3.

## Trạng thái hiện tại

- Phase 0: Docker Compose, MongoDB replica set, health.
- Phase 1: tldraw note, Promote transaction, Kanban, badge sau reload.
- Phase 2A: tài khoản, JWT cookie, board membership, Owner/Member, invitation link.
- Phase 2B: `$jsonSchema` validator, expectedVersion, item sync transaction, client conflict handling.
- Phase 3A: fractional ordering, filter/search task, unique order index, explain.
- Chưa có realtime, Demote, task edit/create, column management hoặc cursor pagination.

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

Compose chạy service một lần `migrate` trước API. API chỉ khởi động khi migration version hiện tại đã áp dụng.

Các URL local:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/v1/health`
- MongoDB: `127.0.0.1:27017`

## Tài khoản local

Migration seed owner cũ bằng cấu hình trong `.env` local:

```text
owner@nextask.local
nextask-local-owner-2026
```

Đây là giá trị dev-only trong `.env.example`, không dùng ngoài local. Seed owner giữ `_id` demo cũ nên board và dữ liệu Phase 1 vẫn mở được.

Người dùng khác có thể đăng ký tài khoản mới. Owner tạo invitation link trong board; Member mở link để tham gia. Hệ thống chưa gửi email tự động.

## Luồng thử

1. Mở web, đăng nhập seed owner hoặc đăng ký.
2. Tạo board nếu chưa có.
3. Chọn công cụ `Note`, bấm lên canvas và nhập nội dung.
4. Chọn ghi chú, bấm `Promote thành task`, chọn cột và xác nhận.
5. Kéo task trên Kanban sang cột khác.
6. Reload: badge `Đã thành task` hiển thị cột hiện tại.
7. Owner bấm `Mời`, copy invitation link.
8. Tài khoản Member đăng nhập, mở link, accept và làm việc trên board.
9. Member không thấy nút `Mời`/`Đổi tên`; gọi API trực tiếp vẫn bị server chặn `403`.

`Done` xác định bằng trường `isDone` của cột. Chưa có realtime nên badge cập nhật sau reload hoặc thao tác phía client.

## Đồng bộ và xung đột

- Board rename, task move, promote và item sync đều gửi `expectedVersion` (promote dùng
  `expectedItemVersion`); item mới trong sync gửi `0`.
- Nếu version đã cũ, API trả `409 VERSION_CONFLICT` kèm `currentVersion` (sync thêm
  `shapeId`). UI board/task/promote/rename tải lại workspace và hiện notice.
- Whiteboard gặp 409 sẽ refetch version item, cập nhật map version và thử lại một lần;
  conflict lần hai hiện lỗi thay vì ghi đè.
- Sync gửi `deleted[]` tường minh cho note đã xóa; note không có trong payload và không
  có trong `deleted` được giữ nguyên.
- Toàn bộ sync chạy trong transaction; một item stale làm cả request không ghi.

## Kanban ordering và filter

- Kéo thả dùng `POST /tasks/:taskId/move` với `beforeTaskId`; server tự sinh fractional
  `order`, không cập nhật hàng loạt.
- Thả lên card để chèn trước; thả vùng trống cuối cột để append; kéo sang cột khác được.
- `GET /tasks` lọc theo `columnId`, `assigneeId`, `priority`, `labels`, `q`; trả tối đa
  100 task kèm `meta.hasMore`.
- Filter đang bật thì tạm khóa kéo thả để tránh chèn sai tương quan với task bị ẩn.
- Chưa có cursor pagination; thu hẹp filter nếu còn task chưa tải.

## Phát triển local

Khởi động MongoDB replica set và migration:

```bash
docker compose up -d mongo mongo-init
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

API tự đọc `.env` ở thư mục gốc. Khi chạy ngoài Docker, dùng URI có `directConnection=true` vì member của replica set được cấu hình là `mongo:27017`.

## Migration và backup

- Migration nằm trong `apps/api/src/db/migrations`; trạng thái lưu ở `schema_migrations`.
- Chạy thủ công: `npm run db:migrate`.
- Trước migration dữ liệu thật, backup:

```bash
mkdir -p backups
docker compose exec -T mongo mongodump --archive --gzip --db=nextask > backups/nextask-before-migration.gz
```

- Backup local đã dùng cho Phase 2A: `backups/nextask-before-2a-2026-10-28.gz`.
- Backup local đã dùng cho Phase 2B: `backups/nextask-before-2b-2026-10-28.gz`.
- Backup local đã dùng cho Phase 3A: `backups/nextask-before-3a-2026-11-10.gz`.
- Migration `002-phase-2b` áp `$jsonSchema` cho `users`, `boards`, `items`, `tasks`,
  `invitations`; không tự sửa dữ liệu cũ.
- Không xóa backup hoặc chạy migration trên dữ liệu chưa backup.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Test API dùng MongoDB replica set thật, không mock database. Test DB Phase 2 là `nextask_phase2_test`; migration test dùng database riêng; có thể override bằng `MONGODB_TEST_URI` và `MONGODB_MIGRATION_TEST_URI`.

## Bảo mật local

- JWT nằm trong cookie HttpOnly, SameSite=Lax; local đặt `COOKIE_SECURE=false`, production phải bật.
- `JWT_SECRET`, seed owner password và Mongo local chỉ dành cho phát triển.
- MongoDB local không bật auth và chỉ publish cổng ra `127.0.0.1`.
- Auth endpoint có rate limit; CORS giới hạn origin; mutation có kiểm tra Origin.
- `$jsonSchema` strict/error là chốt chặn cuối ở DB; zod vẫn kiểm tra request ở API.
- Không dùng nguyên trạng cho production; production cần secret management, auth DB, TLS và mạng riêng.

## tldraw license

Bản web build production nên tldraw hiển thị license watermark. Cần license key phù hợp trước khi dùng thương mại hoặc phát hành production.

## Git

Repository Git cục bộ, chưa cấu hình remote, không tự push. Phase 2A và 2B đã merge vào `release/v0.2` và `main` tại `53f2391` (tag `v0.2.0`). Phase 3A đang trên `release/v0.3`, chưa merge `main`. Quy tắc branch, merge và identity nằm trong [docs/git-workflow.md](docs/git-workflow.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Giai đoạn 0](docs/phases/00-setup.md)
- [Giai đoạn 1](docs/phases/01-vertical-slice.md)
- [Đề xuất Phase 2](docs/phases/02-proposal.md)
- [Phase 2A](docs/phases/02a-auth-membership.md)
- [Phase 2B](docs/phases/02b-data-integrity.md)
- [Phase 3A](docs/phases/03a-kanban-ordering.md)
- [Ghi chú MongoDB](docs/mongodb-notes.md)
- [Lịch sử phiên](docs/session-log.md)
- [Quy trình Git](docs/git-workflow.md)
