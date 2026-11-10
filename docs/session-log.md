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

---

## 2026-10-28 - Phiên 4: Đề xuất và spec Phase 2A

### Bối cảnh

- Người dùng yêu cầu đề xuất nội dung Phase 2 trước khi quyết định.
- Đã kiểm tra dữ liệu ứng dụng: 1 board, 2 note, 2 task, chưa có `users` hoặc `members`.
- Chưa thay đổi code.

### Quyết định của người dùng

1. Chia Phase 2 thành 2A và 2B.
2. Giữ dữ liệu Phase 1 bằng seed owner từ `.env`.
3. Một JWT cookie 7 ngày, chưa có refresh token.
4. Invitation chỉ tạo link; không gửi email.

### File tài liệu

- `docs/phases/02-proposal.md`: đề xuất, so sánh một phase và 2A/2B, các quyết định.
- `docs/phases/02a-auth-membership.md`: spec chi tiết Auth, membership, invitation, quyền, migration và seed owner.
- `docs/architecture.md`: cập nhật lộ trình thành 2A/2B.
- `docs/session-log.md`: mục này.

### Nội dung Phase 2A đã chốt trong spec

- `users`, argon2id, JWT HttpOnly cookie, login/register/logout/me.
- `members[]`, owner member, board list theo membership.
- Owner đổi tên board, tạo invitation link; Member accept.
- Member bị chặn 403 ở thao tác Owner-only; non-member 404.
- Migration runner có version; seed owner id demo; backfill members; chuyển index sang migration.
- Chưa làm `$jsonSchema` và optimistic concurrency; hai phần này thuộc 2B.
- Test auth, invitation, role, migration và preservation dữ liệu Phase 1.

### Trạng thái

- Spec 2A đã được người dùng duyệt.
- Implementation plan đã được lập trên nhánh feature.
- Chưa viết code.

---

## 2026-10-28 - Phiên 5: Implementation plan 2A và branch workflow

### Quyết định Git của người dùng

- Mỗi phase/phần việc làm trên nhánh riêng, không commit trực tiếp vào `main`.
- Có nhánh quản lý phiên bản và các nhánh `feat`, `fix`, `chore`, `docs`, `hotfix`.
- Hoàn thành feature thì merge vào nhánh phiên bản; phiên bản hoàn tất mới merge vào `main`.

### Nhánh đã tạo

- `release/v0.2` từ `main`.
- `feat/phase-2a-auth-membership` từ `release/v0.2`.
- `main` giữ nguyên tại `6d3d11b`.
- Feature hiện tại chứa plan và sẽ chứa toàn bộ triển khai 2A.

### File tài liệu

- `docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md`: plan chi tiết Task 0-8, TDD, migration, auth, membership, invitation, UI, Docker và merge.
- `docs/git-workflow.md`: mô hình `main`, `release/vX.Y`, `feat/*`, `fix/*`, `chore/*`, `docs/*`, `hotfix/*`; quy tắc merge `--no-ff`, xóa feature sau merge, không push/amend/config.
- `docs/phases/02a-auth-membership.md`: cập nhật trạng thái đã duyệt và link plan.
- `docs/session-log.md`: mục này.

### Trạng thái

- Chưa viết code.
- Chờ người dùng duyệt plan để bắt đầu thực thi trên `feat/phase-2a-auth-membership`.
- Sau khi 2A xong: merge feature vào `release/v0.2`; chưa merge vào `main` cho tới khi 2B hoàn tất.

---

## 2026-10-28 - Phiên 6: Triển khai Giai đoạn 2A

### Bối cảnh

- Người dùng duyệt plan và yêu cầu bắt đầu 2A.
- Làm trên `feat/phase-2a-auth-membership`; không commit vào `main`.

### Commit trên feature

- `370ff99` `feat: add auth primitives and configuration`
- `8c89e88` `feat: add versioned migration and legacy owner seed`
- `4853230` `feat: add cookie auth API and middleware`
- `d1d94f4` `feat: add board membership and server-side roles`
- `766e6e0` `feat: add invitation link and transactional accept`
- `500f8dc` `feat: add web authentication and protected board list`
- `61879bf` `feat: add invite, accept, and owner rename UI`
- `69114a8` `docs: record phase 2a verification`
- `c15603e` `merge: phase 2a auth and membership` vào `release/v0.2`

### Đã triển khai

- `users`, argon2id, JWT HS256 cookie 7 ngày.
- Register/login/logout/me, rate limit và origin guard.
- `members[]`, owner member, board access middleware, owner-only rename/invite.
- Invitation token hash, TTL, email ràng buộc, accept transaction.
- Migration runner `schema_migrations`, migration `001-phase-2a`, seed owner, backfill member, toàn bộ index.
- Compose service `migrate`; API dừng nếu schema chưa migrate.
- Web login/register/logout, cookie credentials, bảo vệ board list, invite/accept/rename UI.

### Backup và migration dữ liệu thật

- Backup: `backups/nextask-before-2a-2026-10-28.gz`, 1.8 KB, `gzip -t` pass.
- Rehearsal trên `nextask_phase2_rehearsal`: thành công; database rehearsal đã xóa sau kiểm tra.
- Migration thật: `applied: ["001-phase-2a"]`.
- Trước migration: 1 board, 2 item, 2 task, 0 user.
- Sau migration: 1 board, 2 item, 2 task, 1 seed user, owner member.
- Item version giữ `31`, `13`; task version giữ `4`, `1`.
- Browser E2E tạo thêm user member; hiện có 2 user, board có owner + member, invitation đã dùng.
- Backup không bị xóa.

### Kiểm chứng

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full suite ba lần liên tiếp, mỗi lần 10 file, 46 test pass:
  - Lần 1: 8.06 s.
  - Lần 2: 7.77 s.
  - Lần 3: 7.82 s.
- Docker: `mongo`, `api`, `web` healthy; migrate exit 0.
- Browser:
  - Chưa đăng nhập chuyển `/login`.
  - Seed owner đăng nhập, thấy board và dữ liệu cũ.
  - Owner tạo invitation link.
  - Member đăng ký, accept, vào board với role Member.
  - Member không thấy nút Mời/Đổi tên.
  - PATCH board bằng cookie Member trả `403 FORBIDDEN`.
- API auth/membership/invitation tests dùng MongoDB thật.

### Sự cố và điều chỉnh

- Test logout ban đầu kỳ vọng `Max-Age=0`, Express dùng `Expires=epoch`; sửa test theo hành vi chuẩn của cookie xóa.
- Migration test task fixture dùng description rỗng bị Mongoose required từ chối; dùng mô tả hợp lệ.
- Test DB Phase 2 tách khỏi Phase 1; migration test có DB riêng để tránh drop dữ liệu test khác.
- Không dùng mock DB.

### Merge release

- Merge `feat/phase-2a-auth-membership` vào `release/v0.2` bằng `--no-ff`: `c15603e`.
- Chạy quality gate trên release lần đầu: typecheck/lint/format pass; full suite ba lần 46 test, 7.84/7.83/8.02 s.
- Xóa feature branch bằng `git branch -d`; branch đã merge.
- Sau merge, rà soát UI phát hiện label stale `Demo owner`; sửa trên `fix/phase-2a-release-record` (`375cc07`), docs `a098a99`, merge follow-up `9aa67ec`; xóa fix branch.
- Chạy quality gate cuối trên release sau fix:
  - Typecheck/lint/format pass.
  - Full suite ba lần, mỗi lần 10 file, 46 test pass:
    - Lần 1: 7.95 s.
    - Lần 2: 7.86 s.
    - Lần 3: 8.01 s.
- `main` vẫn ở `6d3d11b`, chưa nhận 2A.
- Docker vẫn healthy; migration đã áp dụng trên app DB.

### Trạng thái cuối

- 2A hoàn thành và đã merge `release/v0.2`.
- Không còn feature/fix 2A; release đang chờ 2B.
- Chưa có `$jsonSchema`, expectedVersion, realtime hoặc demote.
- Chưa merge `main`; v0.2 chỉ lên main sau khi 2B hoàn tất và được duyệt.

## 2026-10-28 - Phase 2B bắt đầu

- Nhánh `feat/phase-2b-data-integrity` từ `release/v0.2` tại `611e893`.
- Spec: `docs/phases/02b-data-integrity.md`.
- Plan: `docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md`.
- Phạm vi: `$jsonSchema`, expectedVersion cho board/task/promote/item sync, sync
  transaction, client conflict reload/refetch.
- Quyết định: sync item dùng `deleted[]` tường minh; board version tăng khi membership
  thay đổi; conflict chung `409 VERSION_CONFLICT`.
- Chưa merge `main`.

## 2026-10-28 - Phase 2B hoàn thành

### Commit trên feature

- `83ed3b2` `docs: plan phase 2b data integrity`
- `46728d4` `feat: add version conflict contract`
- `84eacb3` `feat: add phase 2b json schema validators`
- `9b7debc` `fix: type collection validator assertions`
- `5e07952` `feat: enforce expected versions for board and task writes`
- `e9ef947` `feat: enforce expected item version on promote`
- `60c6f68` `feat: make item sync versioned and transactional`
- `d296e5f` `feat: send versions and handle conflicts in web`
- Commit tài liệu kiểm chứng 2B nằm sau danh sách code ở trên.

### Đã triển khai

- `$jsonSchema` strict/error cho `users`, `boards`, `items`, `tasks`, `invitations`;
  migration `002-phase-2b` idempotent bằng `collMod`/`createCollection`.
- API startup yêu cầu `LATEST_MIGRATION_NAME = 002-phase-2b`.
- `409 VERSION_CONFLICT` với `currentVersion` và `shapeId` khi sync.
- Board rename, task move, promote, item sync đều lọc theo version.
- Item sync transaction `snapshot`/`majority`, all-or-nothing, `deleted[]` tường minh.
- Accept invitation tăng board version.
- Web gửi version; board/task/promote/rename reload khi conflict; whiteboard refetch và
  retry một lần.
- Thêm test race tạo cùng `shapeId`; test validator raw insert code 121.

### Backup và migration dữ liệu thật

- Backup: `backups/nextask-before-2b-2026-10-28.gz`, 2.6 KB, `gzip -t` pass.
- Rehearsal `nextask_2b_rehearsal`: restore 2 user, 1 board, 2 item, 2 task, 1 invitation;
  migration `applied: ["002-phase-2b"]`; no-op update hợp lệ cả 5 collection; đã drop.
- Migration thật: `applied: ["002-phase-2b"]`.
- Trước/sau migration: counts không đổi; item version `31`, `13`; task version `4`, `1`;
  `_id`, nội dung, `createdAt`, `updatedAt` khớp giữa bản gốc và rehearsal.
- Browser/autosave sau migration làm item version `33`, `14` (nội dung không đổi) và
  task thứ hai version `4` (đã trả về `To Do`); board name được phục hồi, version 3.

### Kiểm chứng

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full suite 13 file, 67 test, ba lần liên tiếp:
  - Lần 1: 8.99 s.
  - Lần 2: 8.65 s.
  - Lần 3: 8.70 s.
- Docker: `mongo`, `api`, `web` healthy; migrate exit 0; health `ok`, `rs0`, primary.
- Browser:
  - Board cũ còn 2 note, 2 task; quyền Owner hiển thị đúng.
  - Rename conflict: `PATCH 200` (client B), `PATCH 409` (client A), UI reload tên B.
  - Task move conflict: `PATCH 200`, `PATCH 409`, UI reload cột B.
  - Whiteboard save conflict: `PUT 409`, `GET items 200`, `PUT 200`, notice đồng bộ,
    không có lỗi 500.
  - Move thành công qua UI sang `Review`; sau test trả task về `To Do` bằng version hiện
    tại.
- In-app browser chỉ mở một tab; client thứ hai dùng fetch cùng cookie; drag dùng
  synthetic `DragEvent` + `DataTransfer`.

### Còn chờ

- Merge feature vào `release/v0.2` bằng `--no-ff`, chạy lại gate trên release, xóa feature.
- Không merge `release/v0.2` vào `main`; chờ người dùng duyệt phát hành v0.2.

### Merge release

- Merge `feat/phase-2b-data-integrity` vào `release/v0.2` bằng `--no-ff`: `bfc1da2`.
- Quality gate trên release: typecheck/lint/format pass; full suite 13 file, 67 test, ba
  lần 8.87/8.64/8.65 s.
- Xóa feature branch bằng `git branch -d`; branch đã merge.
- `main` vẫn ở `6d3d11b`, chưa nhận 2A/2B.
- Backups `nextask-before-2a-2026-10-28.gz` và `nextask-before-2b-2026-10-28.gz` vẫn giữ;
  database rehearsal đã drop.
- Trạng thái cuối: 2B hoàn thành trên `release/v0.2`; chờ người dùng duyệt phát hành v0.2
  trước khi merge vào `main`.

## 2026-11-10 - Phát hành v0.2.0

- Người dùng duyệt phát hành v0.2 sau khi 2A và 2B hoàn tất trên `release/v0.2`.
- Bump version root/API/web/contracts và `package-lock.json` lên `0.2.0`.
- Bump `SERVICE_VERSION` trong `.env.example` và `docker-compose.yml` lên `0.2.0`.
- Merge `release/v0.2` vào `main` bằng `--no-ff` với message
  `release: v0.2 auth membership and data integrity`: `53f2391`.
- Sau merge main: typecheck/lint/format pass; full suite 13 file, 67 test, ba lần
  8.81/8.67/8.68 s.
- Docker rebuild: `mongo`, `api`, `web` healthy; health báo `version: 0.2.0`, migrate
  `applied: []` (001/002 đã có).
- Không tạo tag v0.2.0 vì chưa được yêu cầu rõ; không push.
- Lưu ý: invitation cũ đã hết hạn và bị TTL index xóa trong lúc kiểm tra ngày
  2026-11-10; đây là hành vi đúng của TTL, không phải mất dữ liệu ngoài ý muốn.

## 2026-11-10 - Phase 3A spec

- Tạo `release/v0.3` từ `main` tại `da0547a` và feature
  `feat/phase-3a-kanban-ordering`.
- Chốt chia Phase 3 thành 3A/3B; 3A gồm fractional ordering, filter/search, limit 100,
  index + explain, UI kéo thả/filter.
- 3B dự kiến: sửa/tạo task, quản lý cột, cursor pagination.
- Spec: `docs/phases/03a-kanban-ordering.md`; đang chờ duyệt trước khi viết plan/code.

## 2026-11-10 - Phase 3A verification

- Backup `backups/nextask-before-3a-2026-11-10.gz`; rehearsal `nextask_3a_rehearsal`
  áp `003-phase-3a`, dữ liệu/version giữ nguyên; đã drop.
- App DB áp `003-phase-3a`; unique order index và 3 filter indexes tồn tại.
- Explain trên 1000 task tạm: assignee 1 key/1 doc; priority 250/250; labels 250/250;
  toàn board 1000/1000; `q` 1000/1000 trả 143 trong 6 ms.
- Browser: reorder đầu/cuối cột, reload giữ thứ tự; filter search/priority đúng; drag bị
  khóa khi filter bật; POST move 200.
- Sửa UI sort từ `localeCompare` sang so sánh chuỗi trực tiếp để khớp thứ tự binary
  MongoDB (`Zz` trước `a0`).
- Task test tạm đã xóa; app còn 2 task, version `4`, `4`.

## 2026-11-10 - Phase 3A hoàn thành

- Commit chính: contracts `55cb4d8`, migration `1a2d5c6`, move API `8a84809`, filter
  `294db5b`, web `ad08ea5`, sort fix `4483ee2`, docs evidence `d87fb0f`.
- Feature gate: typecheck/lint/format pass; full suite 16 file, 82 test ba lần
  11.51/11.45/11.47 s.
- Migration 003 đã áp rehearsal và app DB; backup 3A còn; rehearsal đã drop.
- Explain 1000 task tạm; browser reorder/filter pass; task tạm đã xóa.
- UI sort được sửa từ `localeCompare` sang so sánh chuỗi trực tiếp để khớp binary order.
- Chờ merge `feat/phase-3a-kanban-ordering` vào `release/v0.3`; không merge `main`.

### Merge release/v0.3

- Merge `feat/phase-3a-kanban-ordering` vào `release/v0.3` bằng `--no-ff`: `0d7dd2d`.
- Release gate: typecheck/lint/format pass; full suite 16 file, 82 test ba lần
  11.43/11.54/11.54 s.
- Xóa feature bằng `git branch -d`.
- `main` vẫn `da0547a`, tag `v0.2.0` vẫn trỏ `da0547a`.
- Docker chạy code 3A; migration 003 đã áp app DB; task test tạm đã xóa.

## 2026-11-10 - Phase 3B spec

- Tạo feature `feat/phase-3b-task-editing` từ `release/v0.3`.
- Phạm vi: tạo/sửa task, Owner quản lý cột, UI dialog; không cursor/text index,
  không migration mới.
- Quyết định: task create append fractional; edit không đổi cột/order; assignee phải là
  member; board 1–12 cột, đúng một Done, không xóa cột còn task active.
- Spec: `docs/phases/03b-task-editing-columns.md`; chờ duyệt trước khi viết plan/code.

## 2026-11-10 - Phase 3B plan

- Spec `docs/phases/03b-task-editing-columns.md` đã duyệt.
- Plan `docs/superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md`.
- Phạm vi: task create/edit, Owner columns, UI dialog; không migration/cursor.
- Bắt đầu Inline Execution; chưa merge `main`.

## 2026-11-10 - Phase 3B verification

- Browser tạo board tạm `Phase 3B E2E`, tạo task tay với assignee/priority/labels/due date.
- Sửa task qua dialog: title, labels, priority; card cập nhật, filter priority `Khẩn cấp` đúng.
- Owner mở `Cột`, thêm `QA`, đổi thứ tự; lưu thành công.
- Xóa cột `To Do` còn task bị chặn, UI hiện `Cột còn task, không thể xóa`.
- Board tạm và task/item của nó đã xóa; app còn 1 board, 2 task.
- Member bị 403 quản lý cột được kiểm chứng ở API test, không chạy browser vì cần đăng nhập lại.

## 2026-11-10 - Phase 3B hoàn thành

- Commit chính: contracts `ed6375b`, create `cde3356`, edit `c45eeaf`, columns `ae1bd52`,
  web dialogs `8a92808`, docs verification `b376b74`.
- Feature gate: typecheck/lint/format pass; full suite 20 file, 99 test ba lần
  14.42/14.35/14.62 s.
- Browser: tạo/sửa task, filter priority, thêm/reorder cột; xóa cột còn task bị chặn
  `COLUMN_NOT_EMPTY`; board test đã xóa.
- Không migration; app DB vẫn 001/002/003.
- Chờ merge `feat/phase-3b-task-editing` vào `release/v0.3`; không merge `main`.

### Merge release/v0.3 (3B)

- Merge `feat/phase-3b-task-editing` vào `release/v0.3` bằng `--no-ff`: `463a294`.
- Release gate: typecheck/lint/format pass; full suite 20 file, 99 test ba lần
  14.52/14.40/14.32 s.
- Xóa feature bằng `git branch -d`.
- `main` vẫn `da0547a`, tag `v0.2.0` vẫn trỏ `da0547a`.
- Docker chạy code 3B; không migration mới; app DB vẫn 001/002/003.
- Chờ người dùng duyệt v0.3 trước khi merge `main`.

## 2026-11-10 - Phát hành v0.3.0

- Bump version root/API/web/contracts và `package-lock.json` lên `0.3.0`.
- Bump `SERVICE_VERSION` trong `.env.example` và `docker-compose.yml` lên `0.3.0`.
- Merge `release/v0.3` vào `main` bằng `--no-ff` với message
  `release: v0.3 kanban editing`.
- Sau merge: gate 3 lần, Docker health `0.3.0`; không tạo tag nếu chưa được yêu cầu rõ.

### Merge main v0.3.0

- Merge `release/v0.3` vào `main` bằng `--no-ff`: `d327c74`
  (`release: v0.3 kanban editing`).
- Main gate: typecheck/lint/format pass; full suite 20 file, 99 test ba lần
  14.01/13.98/14.17 s.
- Docker rebuild; health `0.3.0`, `rs0`, primary; app DB vẫn 001/002/003.
- `main` trước merge ở `da0547a`; tag `v0.2.0` giữ nguyên; chưa tạo tag v0.3.0.

## 2026-11-10 - Phase 4 spec

- Tạo `release/v0.4` từ `main` tại `52840fe` (v0.3.0) và feature
  `feat/phase-4-realtime`.
- Chốt phạm vi: Change Streams per board, resume token/checkpoint, Socket.IO auth/room,
  Kanban+badge realtime, whiteboard refetch (không live-merge tldraw), presence/cursor.
- Spec: `docs/phases/04-realtime.md`; chờ duyệt trước khi viết plan/code.
