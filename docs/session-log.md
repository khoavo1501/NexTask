# Lịch sử phiên làm việc

Tài liệu này ghi lại thay đổi theo phiên vì workspace chưa phải git repository. Mỗi mục cần nêu bối cảnh, quyết định, file đã tạo/sửa, kiểm chứng thực tế và việc còn chờ.

## 2026-10-28 - Phiên 1: Khảo sát và lập spec Giai đoạn 0

### Bối cảnh

- Workspace `/mnt/storage/WorkSpace/126/126CPQH/NexTask` trống tại thời điểm bắt đầu.
- Workspace chưa phải git repository.
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
