# Quy trình Git của NexTask

## 1. Trạng thái hiện tại

- Repository cục bộ, chưa có remote.
- Nhánh ổn định: `main` tại `ff9734d`; đã phát hành version `0.5.0`.
- Nhánh phiên bản: `release/v0.5` tại `ccffef6`; đã merge Phase 5A/5B và bump `0.5.0`.
- Phase 0–5B hoàn thành; `release/v0.5` đã merge `main`.
- Feature `feat/phase-5b-batch-undo` và các feature cũ đã merge/xóa.
- Tag annotated `v0.4.0` và các tag cũ giữ nguyên.
- Phase 2A đã merge vào `release/v0.2` bằng `c15603e`; follow-up label fix merge `9aa67ec`; docs release `611e893`.
- Hai nhánh `feat/phase-2a-auth-membership` và `fix/phase-2a-release-record` đã merge và xóa.
- Phase 2B đã merge vào `release/v0.2` bằng `bfc1da2`; feature `feat/phase-2b-data-integrity` đã xóa.
- Từ Phase 2A trở đi, không commit trực tiếp vào `main`; mọi thay đổi đi qua nhánh feature và nhánh phiên bản.
- Không có thao tác push, tag hoặc tạo PR ngoài quy trình dưới đây.

## 2. Mô hình nhánh

| Nhánh | Vòng đời | Mục đích |
| --- | --- | --- |
| `main` | Dài hạn | Chỉ chứa phiên bản đã ổn định |
| `release/vX.Y` | Theo phiên bản | Tích hợp các feature của một phiên bản trước khi lên main |
| `feat/<scope>` | Ngắn hạn | Một phase hoặc một phần tính năng |
| `fix/<scope>` | Ngắn hạn | Sửa lỗi trên release đang mở |
| `chore/<scope>` | Ngắn hạn | Hạ tầng, dependency, cấu hình |
| `docs/<scope>` | Ngắn hạn | Tài liệu không gắn với feature đang mở |
| `hotfix/<scope>` | Ngắn hạn | Sửa lỗi khẩn cấp từ `main` |

Không dùng `develop` trong v1. `release/vX.Y` đóng vai trò nhánh tích hợp để giảm số nhánh dài hạn.

## 3. Luồng làm việc

### Bắt đầu phase/feature

```bash
git switch main
git switch release/v0.2
git switch -c feat/phase-2a-auth-membership release/v0.2
```

- Nếu nhánh phiên bản chưa có, tạo từ `main`:

```bash
git switch main
git switch -c release/v0.2
git switch -c feat/phase-2a-auth-membership release/v0.2
```

- Chỉ tạo feature branch từ nhánh phiên bản, không từ một feature branch khác.

### Trong lúc làm

- Commit nhỏ, rõ nghĩa, theo Conventional Commits:
  - `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `style:`.
- Stage bằng đường dẫn cụ thể; không dùng `git add -A` hoặc `git add .`.
- Mỗi commit chỉ nên chứa một thay đổi mạch lạc.
- Không commit secret, `.env`, log, coverage, build output hoặc `node_modules`.
- Trước commit:
  - `git status --short`
  - `git diff`
  - Chạy typecheck/lint/test liên quan.
- Không amend commit đã tạo.
- Không đổi git config; identity truyền theo từng lệnh:

```bash
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "..."
```

### Kết thúc feature

Điều kiện trước khi merge:

1. Working tree sạch.
2. Typecheck, lint, format pass.
3. Test liên quan pass; với phase lớn, full suite ba lần liên tiếp.
4. Tài liệu phase và session log đã cập nhật.
5. Không còn TODO/placeholder trong phạm vi.

Merge feature vào release:

```bash
git switch release/v0.2
git merge --no-ff feat/phase-2a-auth-membership -m "merge: phase 2a auth and membership"
```

- Dùng `--no-ff` để giữ dấu vết feature.
- Sau merge, chạy lại quality gate trên `release/v0.2`.
- Chỉ xóa feature branch sau khi merge và kiểm chứng:

```bash
git branch -d feat/phase-2a-auth-membership
```

- Không xóa feature branch chưa merge.
- Không rebase hoặc force-push nhánh dùng chung.

### Kết thúc phiên bản

- `release/v0.2` tích hợp cả Phase 2A và 2B.
- Khi phiên bản hoàn tất và được duyệt, merge một lần vào main:

```bash
git switch main
git merge --no-ff release/v0.2 -m "release: v0.2 auth membership and data integrity"
```

- Chạy full suite sau merge release.
- Giữ `release/v0.2` để bảo trì hoặc xóa khi người dùng cho phép.
- Không merge release khi còn phase dở dang.
- Không bump version `package.json` giữa chừng; bump lên `0.2.0` khi v0.2 hoàn tất và merge vào main.
- Tag `v0.2.0` chỉ tạo khi người dùng yêu cầu rõ.

### Hotfix

```bash
git switch main
git switch -c hotfix/<scope> main
```

- Sửa, test, commit trên hotfix.
- Merge vào `main` bằng `--no-ff`.
- Merge tiếp `main` vào `release/vX.Y` đang mở để bản phát hành kế tiếp có fix.
- Xóa hotfix branch sau khi xác nhận.

## 4. Merge và lịch sử

- Không commit trực tiếp vào `main` cho feature mới.
- `main` chỉ nhận:
  - Merge từ `release/vX.Y`.
  - Merge từ `hotfix/*`.
- Feature hợp nhất vào release bằng `--no-ff`.
- Release hợp nhất vào main bằng `--no-ff`.
- Không squash mặc định vì cần giữ lịch sử feature và test.
- Nếu cần lịch sử tuyến tính hơn, người dùng phải yêu cầu rõ.
- Tag phiên bản như `v0.2.0` chỉ tạo khi người dùng yêu cầu; không tự tạo tag.
- Không push, không tạo remote, không mở PR trong quy trình local hiện tại.

## 5. Kiểm tra trước và sau merge

Trước merge feature:

```bash
git status --short
npm run typecheck
npm run lint
npm run format:check
npm run test
```

Với phase lớn, chạy `npm run test` ba lần liên tiếp.

Sau merge vào release:

```bash
git status --short --branch
npm run typecheck
npm run lint
npm run test
```

Sau merge release vào main:

- Chạy lại full suite và kiểm tra Docker health.
- Ghi commit merge và kết quả vào `docs/session-log.md`.

## 6. Xử lý xung đột

- Không dùng `git checkout --ours` hoặc `--theirs` để bỏ qua nội dung cần hiểu.
- Đọc cả hai phía, giữ thay đổi đúng, chạy test sau khi resolve.
- Không dùng reset hard, clean -f hoặc xóa file để tránh xung đột.
- Nếu conflict trong migration, ưu tiên backup dữ liệu và test trên database copy trước.

## 7. Identity

Identity hiện có của máy:

```text
khoavo1501 <khoamiden15012005@gmail.com>
```

Luôn truyền theo lệnh commit:

```bash
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "..."
```

Không chạy `git config user.name` hoặc `git config user.email`.

## 8. Phase 2A

- Feature: `feat/phase-2a-auth-membership`; đã merge và xóa.
- Release: `release/v0.2`; 2A merge `c15603e`, follow-up `9aa67ec`.
- Plan: `docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md`.
- 2A đã hoàn thành, kiểm chứng và nằm trên release.
- Không merge `release/v0.2` vào `main` cho tới khi 2B hoàn tất, trừ khi người dùng yêu cầu phát hành sớm.

## 9. Phase 2B

- Feature: `feat/phase-2b-data-integrity`, tạo từ `release/v0.2` tại `611e893`.
- Phạm vi: `$jsonSchema`, expectedVersion, item sync transaction, client conflict.
- 2B merge vào `release/v0.2` bằng `--no-ff` sau khi quality gate pass.
- Không merge `release/v0.2` vào `main` cho tới khi người dùng duyệt phát hành v0.2.
- Plan: `docs/superpowers/plans/2026-10-28-phase-2b-data-integrity.md`.
- Spec: `docs/phases/02b-data-integrity.md`.
- Migration 002 đã áp lên database thật; backup 2B đã lưu; rehearsal đã kiểm tra và drop.
- Quality gate trên feature: typecheck/lint/format pass; full suite 13 file, 67 test, ba
  lần 8.99/8.65/8.70 s.
- Merge release `bfc1da2`; quality gate trên release: typecheck/lint/format pass; full
  suite 67 test ba lần 8.87/8.64/8.65 s.
- Feature đã xóa; `main` đã nhận v0.2.0 qua release merge `53f2391`.
- Người dùng đã duyệt phát hành v0.2 ngày 2026-11-10; merge main theo mục 10.

## 10. Phát hành v0.2.0

- Version `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  được bump lên `0.2.0` trên `release/v0.2`.
- Release v0.2 gồm Phase 2A và 2B; merge vào `main` bằng `--no-ff` với message
  `release: v0.2 auth membership and data integrity`.
- Sau merge main, chạy lại typecheck/lint/format, full suite ba lần và kiểm tra Docker.
- Đã merge `release/v0.2` vào `main` tại `53f2391`; full suite trên main 67 test ba lần
  8.81/8.67/8.68 s; Docker health báo `0.2.0`.
- Không tạo tag `v0.2.0` nếu người dùng chưa yêu cầu rõ.
- Không push; repository vẫn local.

## 11. Phase 3A

- Feature: `feat/phase-3a-kanban-ordering`, tạo từ `release/v0.3`.
- Phạm vi: fractional ordering, filter/search, migration 003, unique/filter indexes,
  drag/filter UI, explain.
- Feature gate: typecheck/lint/format pass; full suite 16 file, 82 test ba lần
  11.51/11.45/11.47 s.
- Migration 003 đã áp rehearsal và app DB; backup
  `backups/nextask-before-3a-2026-11-10.gz`.
- Merge feature vào `release/v0.3` bằng `--no-ff` (`0d7dd2d`); release gate pass:
  typecheck/lint/format; full suite 82 test ba lần 11.43/11.54/11.54 s; feature đã xóa.
- Không merge `release/v0.3` vào `main`; chưa bump version `0.3.0`; tag `v0.2.0` giữ nguyên.

## 12. Phase 3B

- Feature: `feat/phase-3b-task-editing`, tạo từ `release/v0.3`.
- Phạm vi: tạo/sửa task, Owner quản lý cột, UI task/column dialog; không migration,
  không cursor/text index.
- Feature gate: typecheck/lint/format pass; full suite 20 file, 99 test ba lần
  14.42/14.35/14.62 s.
- Merge feature vào `release/v0.3` bằng `--no-ff` (`463a294`); release gate pass:
  typecheck/lint/format; full suite 99 test ba lần 14.52/14.40/14.32 s; feature đã xóa.
- Không merge `release/v0.3` vào `main`; chưa bump version `0.3.0`; tag `v0.2.0` giữ nguyên.

## 13. Phát hành v0.3.0

- Bump `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  lên `0.3.0` trên `release/v0.3`.
- Release v0.3 gồm Phase 3A và 3B; merge vào `main` bằng `--no-ff` với message
  `release: v0.3 kanban editing`: `d327c74`.
- Sau merge main: typecheck/lint/format pass; full suite 99 test ba lần
  14.01/13.98/14.17 s; Docker health `0.3.0`.
- Không tạo tag `v0.3.0` nếu người dùng chưa yêu cầu rõ.
- Không push; repository vẫn local.

## 14. Phase 4

- Feature: `feat/phase-4-realtime`, tạo từ `release/v0.4`.
- Phạm vi: Change Streams per board, checkpoint/resume, Socket.IO auth/room, presence,
  Kanban/badge realtime và whiteboard refetch.
- Migration 004 áp rehearsal và app DB; backup
  `backups/nextask-before-4-2026-11-10.gz`; rehearsal đã drop.
- Feature gate: typecheck/lint/format pass; full suite 24 file, 106 test ba lần
  16.67/16.88/19.67 s.
- Merge feature vào `release/v0.4` bằng `--no-ff` (`b11b326`); release gate pass:
  typecheck/lint/format; full suite 24 file, 106 test ba lần 20.27/16.62/16.63 s.
- Feature đã xóa; `release/v0.4` chứa Phase 4.
- Merge `release/v0.4` vào `main` bằng `--no-ff` (`de15b5a`,
  `release: v0.4 realtime`); main gate pass: typecheck/lint/format; full suite 24 file,
  106 test ba lần 15.60/15.55/15.60 s.
- Docker rebuild; API health `0.3.0`, Mongo `rs0` primary.
- Thời điểm merge này chưa bump `0.4.0`; chưa tạo tag v0.4.0; không push.

## 15. Phát hành v0.4.0

- Bump `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  lên `0.4.0` trên `release/v0.4`.
- Release v0.4 gồm Phase 4; merge vào `main` bằng `--no-ff` với message
  `release: v0.4.0 realtime`: `18588e6`.
- Sau merge main: typecheck/lint/format pass; full suite 24 file, 106 test ba lần
  16.08/16.42/16.41 s; Docker health `0.4.0`, Mongo `rs0` primary.
- Tạo tag annotated `v0.4.0` theo yêu cầu, sau khi main và docs release ổn định.
- Không push.

## 16. Phase 5A

- Feature: `feat/phase-5a-demote-activity`, tạo từ `release/v0.5`.
- Phạm vi: Demote transaction, activity promote/demote + TTL 90 ngày, API activity,
  dialog Demote và tab hoạt động; 5B để batch/undo/fault injection.
- Migration 005 áp rehearsal/app; backup `backups/nextask-before-5a-2026-11-10.gz`.
- Feature gate: typecheck/lint/format pass; full suite 28 file, 126 test ba lần
  19.09/19.08/19.26 s.
- Merge feature vào `release/v0.5` bằng `--no-ff` (`0a34cce`); release gate pass:
  typecheck/lint/format; full suite 28 file, 126 test ba lần 19.47/20.76/19.37 s.
- Feature đã xóa; `release/v0.5` chứa Phase 5A.
- Không bump `0.5.0`; không merge `main`; tag `v0.4.0` giữ nguyên; không push.

## 17. Phase 5B

- Feature: `feat/phase-5b-batch-undo`, tạo từ `release/v0.5`.
- Phạm vi: batch promote multi-select (tối đa 100), undo từng activity promote trong
  10 phút, fault injection hook; không migration 006.
- Feature gate: typecheck/lint/format pass; full suite 31 file, 144 test ba lần
  22.72/22.88/22.77 s.
- Merge feature vào `release/v0.5` bằng `--no-ff` (`f2c194d`); release gate pass:
  typecheck/lint/format; full suite 31 file, 144 test ba lần 25.23/22.74/22.92 s.
- Feature đã xóa; `release/v0.5` chứa Phase 5A và 5B.
- Không bump `0.5.0`; không merge `main`; tag `v0.4.0` giữ nguyên; không push.

## 18. Phát hành v0.5.0

- Bump `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  lên `0.5.0` trên `release/v0.5`.
- Release v0.5 gồm Phase 5A và 5B; merge vào `main` bằng `--no-ff` với message
  `release: v0.5 batch and undo`: `ff9734d`.
- Sau merge main: typecheck/lint/format pass; full suite 31 file, 144 test ba lần
  21.39/21.84/21.55 s; Docker health `0.5.0`.
- Tạo tag annotated `v0.5.0` sau docs release merge.
- Không push.

## 19. Phase 6

- Feature: `feat/phase-6-voting-reports`, tạo từ `release/v0.6`.
- Phạm vi: vote/unvote quota, voter_budgets, results aggregation, stalled-ideas report,
  UI vote/quota và tab Báo cáo; migration 006.
- Feature gate: typecheck/lint/format pass; full suite 37 file, 162 test ba lần
  29.41/29.64/29.50 s.
- Merge feature vào `release/v0.6` bằng `--no-ff` (`9d0ddc5`); release gate pass:
  typecheck/lint/format; full suite 37 file, 162 test ba lần 29.51/29.44/29.77 s.
- Feature đã xóa; `release/v0.6` chứa Phase 6.
- Không bump `0.6.0`; không merge `main`; tag `v0.5.0` giữ nguyên; không push.

## 20. Phát hành v0.6.0

- Bump `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  lên `0.6.0` trên `release/v0.6`.
- Release v0.6 gồm Phase 6; merge vào `main` bằng `--no-ff` với message
  `release: v0.6 voting and reports`: `9b6e8ed`.
- Sau merge main: typecheck/lint/format pass; full suite 37 file, 162 test ba lần
  29.43/28.34/28.39 s; Docker health `0.6.0`.
- Tạo tag annotated `v0.6.0` sau docs release merge.
- Không push.

## 21. Phase 7

- Feature: `feat/phase-7-ops-seed`, tạo từ `release/v0.7`.
- Phạm vi: seed demo idempotent, profiler on/report/off, backup/restore drill, README/test.
- Feature gate: typecheck/lint/format pass; full suite 38 file, 164 test ba lần
  30.08/30.42/30.12 s.
- Merge feature vào `release/v0.7` bằng `--no-ff` (`1962ebf`); release gate pass:
  typecheck/lint/format; full suite 38 file, 164 test ba lần 30.02/30.49/32.60 s.
- Feature đã xóa; `release/v0.7` chứa Phase 7.
- Không bump `0.7.0`; không merge `main`; tag `v0.6.0` giữ nguyên; không push.

## 22. Phát hành v0.7.0

- Bump `package.json`, workspace packages, `package-lock.json` và `SERVICE_VERSION`
  lên `0.7.0` trên `release/v0.7`.
- Release v0.7 gồm Phase 7; merge vào `main` bằng `--no-ff` với message
  `release: v0.7 ops and seed`: `f1fd124`.
- Sau merge main: typecheck/lint/format pass; full suite 38 file, 164 test ba lần
  30.09/35.36/30.05 s; Docker health `0.7.0`.
- Tạo tag annotated `v0.7` theo yêu cầu sau docs release merge.
- Không push.

## 23. Phase 8A

- Feature: `feat/phase-8a-settings-e2e`, tạo từ `release/v0.8` sau note fix `ac56bc8`.
- Phạm vi: board settings transaction với `voter_budgets`, dialog Owner, Playwright smoke.
- Feature gate: typecheck/lint/format pass; `build:web` pass; full suite 39 file, 166 test
  ba lần 31.27/32.46/30.91 s; Playwright 1 test pass.
- Merge feature vào `release/v0.8` bằng `--no-ff` (`ead25f1`); release gate pass:
  typecheck/lint/format; `build:web`; full suite 39 file, 166 test ba lần
  30.35/30.69/31.91 s; Playwright pass.
- Feature đã xóa; `release/v0.8` chứa Phase 8A và note fix.
- Không bump `0.8.0`; không merge `main`; tag `v0.7` giữ nguyên; không push.

## 24. Phase 8B

- Feature: `feat/phase-8b-frames`, tạo từ `release/v0.8`.
- Phạm vi: frame item, sync `parentShapeId`, reparent khi xóa frame, seed 3 frame, E2E header.
- Feature gate: typecheck/lint/format/build:web pass; full suite 41 file, 179 test ba lần
  31.41/31.19/31.12 s; Playwright pass.
- Merge feature vào `release/v0.8` bằng `--no-ff` (`9182212`); release gate pass:
  typecheck/lint/format/build:web; full suite 41 file, 179 test ba lần
  31.08/30.57/31.65 s; Playwright pass; Docker health `0.7.0`.
- Feature đã xóa; `release/v0.8` chứa Phase 8A, 8B và note fix.
- Không bump `0.8.0`; không merge `main`; tag `v0.7` giữ nguyên; không push.

## 25. Phase 8C

- Feature: `feat/phase-8c-cursor-text-search`, tạo từ `release/v0.8`.
- Phạm vi: cursor keyset `nextCursor`, text index `tasks_board_text`, q `$text`,
  UI Tải thêm và khóa drag khi còn trang.
- Feature gate: typecheck/lint/format/build:web pass; full suite 42 file, 186 test ba lần
  33.79/33.66/41.32 s; Playwright pass.
- Merge feature vào `release/v0.8` bằng `--no-ff` (`4ad0f82`); release gate pass:
  typecheck/lint/format/build:web; full suite 42 file, 186 test ba lần
  33.84/33.62/33.73 s; Playwright pass; Docker health `0.7.0`.
- Feature đã xóa; `release/v0.8` chứa Phase 8A, 8B, 8C và note fix.
- Không bump `0.8.0`; không merge `main`; tag `v0.7` giữ nguyên; không push.

## 26. Phát hành v0.8.0

- Bump `package.json`, workspace packages, `package-lock.json`, `.env.example` và
  `SERVICE_VERSION` lên `0.8.0` trên `release/v0.8`: `25ea7c5`.
- Release v0.8 gồm Phase 8A, 8B, 8C và note fix; merge vào `main` bằng `--no-ff`:
  `f78c85f` (`release: v0.8 settings frames and search`).
- Main gate: typecheck/lint/format/build:web pass; full suite 42 file, 186 test ba lần
  33.67/33.91/41.32 s; Playwright pass; Docker health `0.8.0`.
- Docs release merge và tag annotated `v0.8` sau main merge.
- Không push; tag `v0.2.0`–`v0.7` giữ nguyên.

## 27. Release candidate v1.0

- Feature `feat/phase-9-production` merge `release/v1.0` tại `4654e7d`; bump `1.0.0`
  tại `632bc9e`; docs RC `29aae6c`.
- Merge `release/v1.0` vào `main` bằng `--no-ff`: `99d2dfc`
  (`release: v1.0 production hardening`).
- Main gate: typecheck/lint/format/build:web pass; full suite 42 file, 188 test ba lần
  34.17/32.34/32.85 s; Playwright pass; Docker health `1.0.0`.
- Tag `v1.0` chỉ tạo sau live deploy/smoke trên VPS/domain; hiện chưa tag, chưa push
  main/release sau merge.

## 28. Self-host public mode

- Feature `feat/public-selfhost` từ `release/v1.0`; thêm Compose public, Caddy nội bộ,
  Cloudflare Named Tunnel, start/stop script, seed owner/demo random và docs.
- Feature gate: typecheck/lint/format/build:web pass; full suite 42 file, 189 test ba lần
  33.75/34.36/33.29 s; Playwright pass.
- Merge `release/v1.0` tại `13aa965`; release gate pass 42 file, 189 test ba lần
  32.11/34.58/36.46 s; Playwright pass.
- Chưa merge `main`, chưa tag v1.0; live Cloudflare tunnel smoke cần domain/token.
