# Lịch sử phiên làm việc

Tài liệu này ghi lại thay đổi theo phiên song song với Git. Mỗi mục cần nêu bối cảnh, quyết định, file đã tạo/sửa, kiểm chứng thực tế và việc còn chờ.

## 2026-10-28 - Phiên 1: Khảo sát và lập spec Giai đoạn 0

### Bối cảnh

- Workspace `/mnt/storage/WorkSpace/126/126CPQH/NexTask` trống tại thời điểm bắt đầu.
- Workspace chưa phải git repository tại thời điểm khảo sát ban đầu.
- Đã kiểm tra công cụ: Node, npm, Docker và Docker Compose có sẵn.
- Người dùng cung cấp brief đầy đủ cho NexTask v1 và yêu cầu làm tuần tự, dừng ở từng giai đoạn.

### Quyết định của người dùng

- Backend: Express 5 + TypeScript.
- Truy cập MongoDB: Mongoose.
- Tài liệu tiếng Việt; code và tên trường tiếng Anh.
- Duyệt Giai đoạn 0 và yêu cầu thêm quản lý Git cục bộ.

### Quyết định kỹ thuật đã chốt trong spec

- Monorepo npm workspaces gồm API, web và contracts.
- MongoDB 8.0 replica set một nút `rs0` cho local.
- TypeScript 6.0.3, không dùng TypeScript 7 vì `typescript-eslint` 8.72.1 giới hạn `<6.1.0`.
- Express 5.3.0, Mongoose 9.11.4, Next.js 16.4.3, React 19.3.1.
- Mongoose đặt `autoIndex: false`, `bufferCommands: false`, tắt `versionKey`, dùng trường `version` riêng.
- Mô hình A: hai collection `items` và `tasks`, transaction Promote/Demote, unique partial index trên task active.
- Demote dùng soft delete: task giữ lịch sử với `lifecycle: "demoted"`.
- Change Streams theo board, resume token trong `change_stream_checkpoints`, presence trong bộ nhớ.
- Local Mongo không auth, chỉ bind loopback; production phải hardening.

### File đã tạo

- `docs/architecture.md`: kiến trúc, schema, index, transaction, realtime, API, test, vận hành, lộ trình và tiêu chí nghiệm thu.
- `docs/phases/00-setup.md`: mục tiêu, kiến thức MongoDB, quyết định, danh sách file, thiết kế health, Docker Compose, cách kiểm chứng, câu hỏi hiểu bài, rủi ro.
- `docs/mongodb-notes.md`: ghi chú sống về mô hình A, hành vi Mongoose, index, transaction, Change Streams, TTL và các nội dung cần đo.
- `docs/git-workflow.md`: quy tắc commit, stage, identity và giới hạn remote.
- `docs/superpowers/plans/2026-10-28-phase-0-setup.md`: kế hoạch triển khai Giai đoạn 0.
- `docs/session-log.md`: file này.

### Kiểm chứng trong phiên

- `pwd`, `ls -la`, `find`: workspace trống.
- `git status`: không phải git repository.
- `node --version`: v26.10.0.
- `npm --version`: 12.2.0.
- `docker --version`: 29.8.2.
- `docker compose version`: 5.6.0.
- Kiểm tra npm registry cho các phiên bản package.
- Kiểm tra `docker manifest inspect` cho `mongo:8.0`, `node:26-bookworm-slim`, `node:26-alpine`: có sẵn.
- Kiểm tra peer dependency: `typescript-eslint` hỗ trợ TypeScript `<6.1.0`; Next 16 yêu cầu Node >= 20.9; Mongoose 9 yêu cầu Node >= 20.19.

### Chưa làm tại thời điểm lập spec

- Chưa tạo mã nguồn, Dockerfile, package.json hay file cấu hình.
- Chưa chạy `npm install`.
- Chưa triển khai Giai đoạn 0.

### Trạng thái sau duyệt

- Người dùng đã duyệt Giai đoạn 0.
- Git repository cục bộ được khởi tạo trên nhánh `main`, chưa cấu hình remote.
- Kế hoạch triển khai chi tiết nằm trong `docs/superpowers/plans/2026-10-28-phase-0-setup.md`.
- Quy tắc Git nằm trong `docs/git-workflow.md`.

### Việc tiếp theo sau khi duyệt

1. Tạo workspace, cấu hình TypeScript/ESLint/Prettier.
2. Tạo API health và kết nối Mongoose với kiểm tra replica set.
3. Tạo web tối giản.
4. Tạo Docker Compose, script init replica set, Dockerfile.
5. Chạy kiểm chứng thực tế và cập nhật mục kết quả của phiên.

---

## 2026-10-28 - Phiên 2: Triển khai Giai đoạn 0

### Bối cảnh

- Người dùng duyệt Giai đoạn 0 và yêu cầu thêm quản lý Git cục bộ.
- Kế hoạch thực thi nằm trong `docs/superpowers/plans/2026-10-28-phase-0-setup.md`.
- Thực thi trực tiếp trong phiên, không dùng subagent.

### Git

- `git init -b main`; không cấu hình remote, không push.
- Identity truyền theo từng lệnh commit, không sửa git config.
- Các commit:
  - `0058ff7` `docs: establish NexTask architecture and phase 0 plan`
  - `ce50898` `chore: scaffold workspace, contracts, and mongo replica set`
  - `cbefc35` `feat: add replica-set-aware API health endpoint`
  - `ef1eaa4` `feat: add web health status page`
  - `eecd027` `chore: containerize api and web with compose healthchecks`
  - `d9e87bd` `style: format web health fetch and ignore generated next env`

### File chính đã tạo

- `package.json`, `package-lock.json`, `tsconfig.base.json`, ESLint, Prettier, ignore files.
- `packages/contracts`: health envelope và schema dùng chung.
- `apps/api`: env validation, Mongoose connection, replica set assertion, health service/router, Express app, server, test env và integration test.
- `apps/web`: Next.js App Router, Tailwind, fetch health, trang trạng thái.
- `docker-compose.yml`, `docker/mongo/init-replica.js`.
- `apps/api/Dockerfile`, `apps/web/Dockerfile`.
- `README.md`.
- Cập nhật `docs/git-workflow.md`, `docs/phases/00-setup.md`.

### Kiểm chứng

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass sau khi thêm `apps/web/next-env.d.ts` vào `.prettierignore`.
- Full test ba lần liên tiếp:
  - Lần 1: 2 file, 6 test pass, 517 ms.
  - Lần 2: 2 file, 6 test pass, 505 ms.
  - Lần 3: 2 file, 6 test pass, 512 ms.
- Integration test dùng MongoDB replica set thật, database `nextask_phase0_test`, `directConnection=true`.
- `docker compose build` thành công cho API và web.
- `docker compose up -d`: `mongo`, `api`, `web` healthy; `mongo-init` exit 0.
- Health: HTTP 200, `status: "ok"`, `replicaSet: "rs0"`, `primary: true`, `latencyMs: 1`.
- Browser tại `http://localhost:3000`: xác nhận NexTask, badge Hoạt động, `rs0`, primary `true`, request id.
- `docker compose restart api`: health trả 200 với `rs0` và primary.
- `docker compose down` rồi `up -d`: ba service healthy, health và web trả 200, `rs.status().set` là `rs0`, volume giữ nguyên.
- API local đọc `.env` thư mục gốc: chạy cổng 4101, health trả `ok`.

### Sự cố và điều chỉnh

- `mongo-init` lần đầu exit 1 vì `connect ECONNREFUSED` trước khi Mongo mở cổng. Volume cũ đã có replica set `rs0`.
- Sửa Compose: `mongo-init` phụ thuộc `mongo` healthy và có `restart: on-failure:5`.
- Chạy lại `mongo-init`: exit 0, log `replica set rs0 ready`.
- `npm` 12 chặn install script của `esbuild`; đã approve `esbuild@0.28.2` trong `allowScripts` để Vitest/tsx chạy.
- Next build không nhận `next-env.d.ts` theo format của Prettier; đã ignore file do Next quản lý.

### Môi trường Docker

- Volume `nextask_mongo-data` đã tồn tại từ trước, chứa nhiều database cũ. Không xóa hoặc sửa dữ liệu cũ.
- Database `nextask` rỗng tại thời điểm kiểm tra.
- Test chỉ dùng `nextask_phase0_test`; không ghi vào database ứng dụng.
- Mongo local không auth, bind `127.0.0.1`; chỉ dùng cho phát triển.

### Kết quả

- Giai đoạn 0 đạt các tiêu chí trong `docs/phases/00-setup.md`.
- Chưa có auth, board, item, task, tldraw, Kanban hay Change Streams.
- Chờ người dùng duyệt để chuyển sang Giai đoạn 1.

---

## 2026-10-28 - Phiên 3: Triển khai Giai đoạn 1

### Bối cảnh

- Người dùng duyệt Giai đoạn 1.
- Phạm vi: slice dọc board, note tldraw, promote transaction, Kanban, badge sau reload.
- Không làm auth, member, `$jsonSchema`, realtime, demote, voting hay report.

### Commit

- `18b7c03` `docs: plan phase 1 vertical promote slice`
- `b27e92c` `feat: add phase 1 contracts, models, and indexes`
- `ef9e298` `feat: add board and item workspace API`
- `8ab8261` `feat: implement transactional promote and task move`
- `f53799a` `feat: add board list and creation UI`
- `9f0d008` `feat: add tldraw note workspace, promote flow, and kanban drag`
- `7058d5b` `style: fit all kanban columns and stabilize card dragging`
- `a7f804f` `style: fit kanban columns and clear selection on reload`
- Commit tài liệu cuối được tạo sau biên bản này.

### Đã triển khai

- Contracts board/item/task, Mongoose model, serializer và lỗi API.
- `ensureIndexes()` tường minh, gồm unique partial index `uniq_active_task_per_item`.
- Demo owner qua `DEMO_OWNER_ID`, không có user document.
- Board list/create/get; item list/sync; promote; task list/move.
- Promote dùng `session.withTransaction`, `readConcern: snapshot`, `writeConcern: majority + journal`.
- tldraw 5.5.2, dynamic import client-only, custom toolbar note/select/hand, màu note, zoom, lưu.
- Note sync khi thả chuột và debounce; delete note chưa promote; giữ note đã promote.
- Promote dialog chọn cột, checkbox giao Demo User.
- Kanban 5 cột full-width, native HTML5 drag/drop; badge overlay theo task state.
- Trang health chuyển sang `/health`; trang chủ thành danh sách board.

### Kiểm chứng

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full suite ba lần liên tiếp, mỗi lần 5 file, 18 test pass:
  - Lần 1: 2.19 s.
  - Lần 2: 2.27 s.
  - Lần 3: 2.22 s.
- Docker Compose: `mongo`, `api`, `web` healthy.
- Health API: 200, `rs0`, primary, latency 1 ms.
- Browser:
  - Tạo board `Retro E2E Phase 1`.
  - Tạo note `Giữ daily ngắn và tập trung`.
  - Promote sang `To Do`, giao Demo User.
  - Badge ban đầu `Đã thành task · To Do · Demo User`.
  - Chuyển task sang `Done` bằng chuỗi `DragEvent`/`DataTransfer`.
  - Reload: badge `Đã thành task · Done · Demo User`, task ở cột `Done`.
  - Restart API: dữ liệu và badge vẫn còn.
- Gọi promote lại cùng item: 409 `ALREADY_PROMOTED`, số task vẫn là 1.
- Test transaction rollback pass: không task, item không đổi.
- Index thật trong app DB có unique partial filter đúng.

### Sự cố và điều chỉnh

- Browser automation `drag` không phát native HTML5 drag; đã kiểm chứng pipeline bằng `DragEvent` + `DataTransfer`, chưa có thao tác chuột vật lý.
- Layout ban đầu để Kanban hẹp và cột Done ngoài vùng nhìn; đã chuyển Kanban full-width dưới whiteboard và cho 5 cột co giãn.
- tldraw production hiển thị license watermark; không ẩn vì đây là yêu cầu license. Cần license key trước khi dùng thương mại.
- Note đã promote bị xóa trên canvas sẽ xuất hiện lại sau reload để tránh mất liên kết task.

### Dữ liệu môi trường

- Database ứng dụng `nextask` có một board, một note, một task từ browser E2E.
- Database test Phase 1 là `nextask_phase1_test`; có thể override bằng `MONGODB_TEST_URI`.
- Volume `nextask_mongo-data` cũ vẫn được giữ nguyên.

### Kết quả

- Slice dọc Phase 1 chạy được và đạt kiểm chứng tự động.
- Còn một việc xác nhận thủ công: kéo task bằng chuột thật trong trình duyệt.
- Chờ người dùng duyệt để chuyển sang Giai đoạn 2.
