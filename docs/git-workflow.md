# Quy trình Git của NexTask

- Repository cục bộ, nhánh `main`, chưa có remote.
- Không push, tag, merge hoặc tạo PR nếu người dùng chưa yêu cầu.
- Không sửa git config. Identity truyền theo từng lệnh commit.
- Không amend commit đã tạo.
- Stage bằng đường dẫn cụ thể. Không dùng `git add -A` hoặc `git add .`.
- Mỗi task/phase có commit riêng với tiền tố `docs:`, `chore:`, `feat:`, `test:`, `fix:`.
- Trước commit: `git status --short`, review diff, chạy kiểm tra liên quan.
- Không commit `.env`, secret, log, coverage hoặc build output.
- Không đưa `node_modules` hoặc symlink lạ vào commit.
- Sau mỗi commit, kiểm tra `git log --oneline` và `git status --short`.

## Identity

Dùng identity hiện có của máy, truyền riêng cho lệnh commit:

```bash
git -c user.name=khoavo1501 -c user.email=khoamiden15012005@gmail.com commit -m "..."
```

Không chạy `git config user.name` hoặc `git config user.email`.
