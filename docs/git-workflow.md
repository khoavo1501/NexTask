# Quy trình Git của NexTask

## 1. Trạng thái hiện tại

- Repository cục bộ, chưa có remote.
- Nhánh ổn định: `main` tại `52840fe` (v0.3.0, tag `v0.3.0`).
- Nhánh phiên bản: `release/v0.4` tạo từ `main`; Phase 4 đang hoàn tất trên feature.
- Feature đang mở: `feat/phase-4-realtime`, tạo từ `release/v0.4`.
- Phase 0–4 hoàn thành; Phase 4 chờ merge vào `release/v0.4`, chưa phát hành v0.4.
- Tag `v0.2.0` và `v0.3.0` giữ nguyên.
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
- Chờ merge feature vào `release/v0.4` bằng `--no-ff`; sau merge xóa feature.
- Không bump `0.4.0`; không merge `main`; tag `v0.3.0` giữ nguyên.
