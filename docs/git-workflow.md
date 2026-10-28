# Quy trình Git của NexTask

## 1. Trạng thái hiện tại

- Repository cục bộ, chưa có remote.
- Nhánh ổn định: `main` tại `6d3d11b`.
- Nhánh phiên bản đang mở: `release/v0.2`.
- Nhánh feature đang làm: `feat/phase-2a-auth-membership`.
- Phase 0 và Phase 1 đã nằm trên `main`.
- Từ Phase 2A trở đi, không commit trực tiếp vào `main`; mọi thay đổi đi qua nhánh feature và nhánh phiên bản.
- Không có thao tác push, merge, tag hoặc tạo PR ngoài quy trình dưới đây.

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

- Feature: `feat/phase-2a-auth-membership`.
- Release: `release/v0.2`.
- Plan: `docs/superpowers/plans/2026-10-28-phase-2a-auth-membership.md`.
- Sau khi 2A xong, merge feature vào `release/v0.2`.
- Không merge `release/v0.2` vào `main` cho tới khi 2B hoàn tất, trừ khi người dùng yêu cầu phát hành sớm.
