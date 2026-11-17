# Giai đoạn 7 - Profiler, Backup/Restore, Seed và hoàn thiện

- Trạng thái: Hoàn thành; merge vào `release/v0.7` bằng `--no-ff` tại `1962ebf`;
  release gate pass. Chưa merge `main`, chưa bump `0.7.0`.
- Ngày lập: 2026-11-17
- Tiền đề: v0.6.0 đã phát hành; `main` tại `2c79479`, tag annotated `v0.6.0`
- Kiến trúc: [../architecture.md](../architecture.md), mục 15, 16
- Phase 6: [06-voting-reports.md](./06-voting-reports.md)
- Nhánh: `release/v0.7` tạo từ `main`; feature `feat/phase-7-ops-seed`
- Không migration 007; dùng schema hiện có 001–006
- Không merge `main`, không bump `0.7.0` trong phase này
- Tag `v0.6.0` giữ nguyên

## 1. Mục tiêu

Hoàn thiện mặt vận hành và demo của NexTask:

1. Có script bật/tắt profiler mức 1 và đọc slow query từ `system.profile`.
2. Có script backup archive-gzip và diễn tập restore vào database tạm an toàn.
3. Có seed demo idempotent tạo board Retro đủ badge, vote, activity, report.
4. Hoàn thiện README, tài liệu vận hành và test còn thiếu.
5. Giữ toàn bộ dữ liệu thật; seed chỉ reset board demo.
6. Chạy cổng cuối và merge `release/v0.7`; chưa phát hành cho tới khi duyệt.

## 2. Quyết định đã chốt

1. Phase 7 làm trọn gói: profiler, backup/restore drill, seed, docs/test.
2. Seed tạo/cập nhật **một board demo idempotent** trong app DB, không đụng board khác.
3. Board demo xác định bằng owner seed + tên cố định `NexTask Demo Retro`; chạy lại
   reset dữ liệu của chính board này.
4. Restore chỉ vào `nextask_restore_drill`; kiểm tra rồi drop, không ghi đè app DB.
5. Profiler chỉ mức 1, `slowms: 100`; tắt sau khi đo; không dùng mức 2 trên dữ liệu thật.
6. Không thêm migration/schema; frame chưa hỗ trợ nên seed nhóm note bằng vị trí/màu.
7. Seed là lệnh tường minh `npm run db:seed`, không chạy tự động trong migration/startup.
8. Script vận hành dùng Docker Compose và mongosh/mongodump có sẵn; không thêm dependency.
9. Không thay đổi API/contracts/UI nghiệp vụ; chỉ thêm script, seed và tài liệu.
10. Không bump `0.7.0`; không merge `main`; tag `v0.6.0` giữ nguyên.

## 3. Hiện trạng

- Phase 0–6 hoàn thành; app DB đã áp migration 001–006.
- Chưa có script seed demo, profiler hoặc backup/restore trong repo.
- README đã có hướng dẫn Docker, backup thủ công và migration; chưa có seed demo/ops đầy đủ.
- Seed hiện tại chỉ là migration seed owner; board demo cũ `Retro E2E Phase 1` không đủ dữ liệu
  vote/report.
- `system.profile` chưa được sử dụng trong tài liệu.
- Full suite hiện 37 file, 162 test.
- Không cần thay đổi model/validator.

## 4. Phạm vi

### Trong Phase 7

- `scripts/db-profiler.sh` (on/report/off) và npm scripts.
- `scripts/db-backup.sh`, `scripts/db-restore-drill.sh`.
- `apps/api/src/db/seed-demo.ts` và `npm run db:seed`.
- Test seed idempotent + báo cáo demo.
- README: quickstart, seed demo, profiler, backup/restore, limitations.
- Cập nhật architecture, MongoDB notes, session log, git workflow.
- Chạy profiler/backup/restore drill thật và ghi evidence.
- Browser kiểm tra board demo.
- Cổng cuối và merge `release/v0.7`.

### Ngoài Phase 7

- Migration 007 hoặc thay đổi schema/index.
- Frame support, cursor pagination, text index.
- Seed nhiều template hoặc seed vào production.
- Tự động backup định kỳ/cron.
- Restore đè app DB, failover replica set hoặc HA.
- Thêm API/UI nghiệp vụ mới.

## 5. Công cụ vận hành

### 5.1 Profiler

Thêm `scripts/db-profiler.sh` với subcommand:

```bash
bash scripts/db-profiler.sh on
bash scripts/db-profiler.sh report
bash scripts/db-profiler.sh off
```

- `on`: `db.setProfilingLevel(1, { slowms: 100 })` trên database `nextask`; kiểm tra
  `db.getProfilingStatus()` trả level 1/slowms 100.
- `report`: đọc `system.profile`, lọc `millis >= 100`, sort `ts` giảm dần, limit 20;
  in `op`, `ns`, `millis`, `planSummary`, `keysExamined`, `docsExamined`, `ts`.
- `off`: `db.setProfilingLevel(0)`; kiểm tra level 0.
- Script dùng `docker compose exec -T mongo mongosh --quiet`.
- Không bật level 2; không để profiler bật sau khi kết thúc phase.

Package scripts:

```json
"db:profiler:on": "bash scripts/db-profiler.sh on",
"db:profiler:report": "bash scripts/db-profiler.sh report",
"db:profiler:off": "bash scripts/db-profiler.sh off"
```

Evidence: chạy seed/browser để tạo tải, bật profiler, gọi report/board/filter vài lần,
đọc top slow query, ghi vào `docs/mongodb-notes.md`, tắt profiler.

### 5.2 Backup

`scripts/db-backup.sh [label]`:

1. Tạo `backups/` nếu chưa có.
2. Tên file `backups/nextask-<label>-YYYYMMDD-HHMMSS.gz`; label mặc định `manual`.
3. `docker compose exec -T mongo mongodump --db nextask --archive --gzip > <file>`.
4. `gzip -t`, in kích thước; exit khác 0 nếu lỗi.
5. Không xóa backup cũ.

Package script:

```json
"db:backup": "bash scripts/db-backup.sh"
```

### 5.3 Restore drill

`scripts/db-restore-drill.sh [archive]`:

1. Nếu không truyền archive, dùng file mới nhất trong `backups/nextask-*.gz`.
2. Kiểm tra file tồn tại và `gzip -t`.
3. Xóa database `nextask_restore_drill` nếu còn từ lần trước.
4. Restore archive:
   `mongorestore --archive --gzip --nsFrom='nextask.*' --nsTo='nextask_restore_drill.*'`.
5. Lấy counts của `users`, `boards`, `items`, `tasks`, `activities`, `voter_budgets`,
   `schema_migrations` từ `nextask` và `nextask_restore_drill`; so sánh.
6. In một board mẫu và số item/task của board đó để kiểm tra nội dung.
7. Drop `nextask_restore_drill` sau khi so sánh.
8. Không ghi/lệnh nào thay đổi database `nextask`.

Package script:

```json
"db:restore-drill": "bash scripts/db-restore-drill.sh"
```

Evidence: chạy drill với backup Phase 7; ghi counts, kết quả so sánh, thời gian vào
`docs/mongodb-notes.md`/session log.

## 6. Seed demo

### 6.1 Lệnh

- API script: `"db:seed": "tsx src/db/seed-demo.ts"`.
- Root script: `"db:seed": "npm run db:seed --workspace @nextask/api"`.
- Seed đọc `MONGODB_URI` và `SEED_OWNER_EMAIL`; nếu owner không tồn tại, báo lỗi rõ.
- Không chạy trong migration/startup.

### 6.2 Board demo

Tên cố định: `NexTask Demo Retro`; owner là seed owner. Nếu chưa có, tạo board với cột
Retro mặc định và settings `{votingLimit: 3, minVotes: 3, stalledAfterDays: 7}`.

Nếu đã có board cùng tên thuộc owner:

- Xóa toàn bộ `items`, `tasks`, `activities`, `voter_budgets` của **board demo**.
- Giữ board `_id`, columns, settings.
- Tạo lại dữ liệu seed bên dưới; không đụng board khác.
- Đây là reset demo có chủ đích; ghi rõ trong README.

Seed tạo hai user demo member nếu chưa có:

- Email `demo.member1@nextask.local`, `demo.member2@nextask.local`.
- Password local `demo-only-password-2026` (hash argon2; không dùng production).
- Thêm vào board demo với role `member` nếu chưa có.
- Budget mỗi member và owner: `{used, limit: 3, version: 1}` theo votes seed.

### 6.3 Dữ liệu seed

- **9 note** nhóm Start/Stop/Continue, 3 note mỗi nhóm, màu xen kẽ
  `yellow|blue|green|red`; vị trí theo cột nhóm (x 0/300/600, y 0/240/480).
- Shape ID deterministic: `seed:start-1..3`, `seed:stop-1..3`, `seed:continue-1..3`.
- **4 task promoted** từ note:
  - Start-1 → Backlog, không assignee.
  - Stop-1 → To Do, assignee owner.
  - Continue-1 → In Progress, priority high.
  - Start-2 → To Do, task cũ 10 ngày để vào `stalledTasks`.
- **1 task tạo tay** ở Done, sourceItemId null, title `Demo: chốt retro`.
- Item promoted có `promotedTaskId`; activity `item.promoted` tương ứng với
  `undoableUntil: null` (dữ liệu lịch sử, không mở undo trong demo).
- **Vote demo:**
  - Stop-2 nhận 3 phiếu: owner, demo member1, demo member2.
  - Continue-2 nhận 1 phiếu của owner.
  - Budget used: owner 2, member1 1, member2 1; limit 3.
- `items.votes` có userId/createdAt; không tăng item.version do seed ghi trực tiếp.
- Board demo phải đủ dữ liệu cho:
  - badge task trên note đã promote;
  - activity feed;
  - vote/quota;
  - report unpromotedIdeas (Stop-2 ≥3 vote) và stalledTasks (Start-2 cũ 10 ngày).

### 6.4 Idempotency

- Chạy seed lần hai không tăng số board/items/tasks/activities/budgets của board demo.
- Board demo giữ `_id`; dữ liệu deterministic (cùng shapeId/title/vote count).
- Board thật và dữ liệu ngoài demo không đổi.
- Seed dùng transaction cho phần reset + tạo dữ liệu demo nếu khả thi; nếu transaction
  không bao được toàn bộ, dùng thứ tự xóa/tạo và test lại sau lỗi.
- Seed không xóa user demo member nếu đã tồn tại; chỉ đảm bảo member trong board.

## 7. Test và kiểm chứng

### 7.1 Seed integration

Tạo `apps/api/test/seed-demo.integration.test.ts`:

- Chạy `seedDemoBoard()` trên test DB đã migrate; seed owner tồn tại.
- Lần 1: board demo tồn tại, 9 item note, 4 task promoted + 1 manual, activity promote,
  3 budget, votes đúng.
- Chạy lần 2: counts không đổi; board `_id` không đổi; không nhân đôi vote/task/activity.
- Tạo một board thật khác trước seed; sau hai lần seed board đó và items/tasks vẫn nguyên.
- Gọi report API/service trên board demo: `unpromotedIdeas` có Stop-2 với voteCount 3;
  `stalledTasks` có Start-2.
- Budget owner/member used đúng; vote limit vẫn 3.
- Seed user demo không trả passwordHash qua API (không nằm trong scope nhưng kiểm tra
  không log/hash ra output).

Test dùng `cleanDb` và test DB hiện có; không chạy seed trên app DB trong test.

### 7.2 Profiler

- `db:profiler:on` trả level 1/slowms 100.
- Tạo tải seed/browser; `db:profiler:report` có ít nhất một entry >=100ms hoặc in thông
  báo rõ nếu chưa có slow query.
- `db:profiler:off` trả level 0.
- Không dùng level 2.

### 7.3 Backup/restore drill

- `db:backup` tạo file archive-gzip, `gzip -t` pass, size > 0.
- `db:restore-drill` restore vào `nextask_restore_drill`; counts khớp app DB tại thời
  điểm chạy; board mẫu đọc được.
- Drill drop database tạm; app DB counts không đổi.
- Ghi thời gian/counts/kết quả vào MongoDB notes và session log.

### 7.4 Web/browser

- Chạy seed trên app DB; đăng nhập owner.
- Mở board `NexTask Demo Retro`: thấy 9 note, 5 task, badge promoted, vote/quota, activity,
  report có hai nhóm.
- Reload giữ dữ liệu; chạy seed lần hai và reload không nhân đôi.
- Không có lỗi console/500.

### 7.5 Cổng cuối

- Typecheck/lint/format pass.
- Full suite ba lần.
- Docker rebuild; health `0.6.0` (không bump trong phase).
- Không còn profiler bật.

## 8. README và tài liệu

Cập nhật `README.md`:

- Quickstart Docker, seed demo `npm run db:seed`, tài khoản owner/member demo.
- Tính năng theo phase 0–7 và giới hạn (không frame, không CRDT, một API instance).
- Lệnh profiler/backup/restore drill và cảnh báo local-only.
- Migration 001–006, backup gần nhất, test suite.
- Git/release history đến v0.6.0; phase 7 chờ duyệt.

Cập nhật `docs/architecture.md`:

- Phase 7 complete; seed demo, profiler, backup drill.
- Giữ cảnh báo production (auth DB, TLS, backup off-host).

Cập nhật `docs/mongodb-notes.md`:

- Kết quả profiler (top slow query), backup/restore counts, seed idempotency quan sát.
- Ghi rõ `system.profile` là capped collection, profiler overhead.

### Kết quả verification 2026-11-17

- Seed app DB: 9 note, 5 task, 4 activity, 3 budget; chạy lần hai không đổi counts/boardId;
  board thật không bị ảnh hưởng.
- Browser: board demo dựng whiteboard (4 badge), Kanban 5 task, report có Stop-2 3 phiếu
  và task bị kẹt Start-2. Shape ID seed thiếu `shape:` đã được sửa.
- Profiler: level 1/slowms 100; slow probe 190ms/COLLSCAN được ghi nhận; profiler đã tắt.
- Backup `nextask-phase7-20261117-180043.gz` 4.5 KB; restore drill khớp counts và drop DB tạm.
- Full suite dự kiến 38 file, 164 test (xác nhận ở Task 5).

## 9. Tiêu chí chấp nhận

1. Seed demo idempotent; board demo đủ note/task/vote/activity/report; board thật không đổi.
2. Seed chạy lần hai không nhân đôi; board `_id` ổn định.
3. Profiler on/report/off hoạt động, level 1/slowms 100, tắt sau đo.
4. Backup archive-gzip hợp lệ; restore drill vào DB tạm khớp counts rồi drop.
5. App DB không bị restore drill ghi đè.
6. README có quickstart, seed, ops, limitations; tài liệu phase 7 đầy đủ.
7. Test seed integration pass; full suite ba lần; browser demo pass.
8. Không migration mới; app DB vẫn 001–006.
9. Feature merge `release/v0.7`; `main`, version/tag `v0.6.0` không đổi.
10. Không push/tag phase 7 cho tới khi người dùng duyệt phát hành.

## 10. Rủi ro và cách xử lý

- **Seed reset nhầm board thật**: chỉ xóa board có owner seed + tên chính xác; test board
  khác tồn tại trước seed.
- **Demo member trùng email**: upsert theo emailNormalized; không tạo user trùng.
- **Seed lỗi giữa chừng**: transaction hoặc chạy lại để reset demo; test idempotent.
- **Profiler quên tắt**: script off + verification `getProfilingStatus`; ghi cảnh báo.
- **Profiler overhead**: chỉ bật thời gian ngắn, level 1, slowms 100.
- **Restore nhầm DB**: tên drill cố định, script kiểm tra target; không dùng `--drop` trên
  app DB.
- **Backup hỏng**: `gzip -t`; giữ nhiều bản; không xóa backup cũ.
- **Restore drill đọc phải app DB đang thay đổi**: chạy khi không có ghi; so counts ngay
  sau restore; nếu lệch, dừng và điều tra.
- **Seed dùng timestamp cũ**: set createdAt qua raw update cho task stalled; test report.
- **Frame chưa hỗ trợ**: seed nhóm note bằng vị trí/màu, ghi rõ trong README.
- **Không bump version**: Phase 7 là phase cuối; chờ duyệt phát hành v0.7.

## 11. Git

- `release/v0.7` tạo từ `main` tại `2c79479` (v0.6.0).
- Feature `feat/phase-7-ops-seed` tạo từ `release/v0.7`.
- Spec commit trên feature; chưa code trước khi spec được duyệt.
- Implementation TDD; merge feature vào `release/v0.7` bằng `--no-ff` sau gate; xóa feature.
- Không merge `release/v0.7` vào `main`; không bump `0.7.0`; tag `v0.6.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
