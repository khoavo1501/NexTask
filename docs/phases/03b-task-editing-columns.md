# Giai đoạn 3B - Task editing và quản lý cột

- Trạng thái: Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.3`
- Ngày lập: 2026-11-10
- Tiền đề: Phase 3A hoàn thành trên `release/v0.3`; `main` và tag `v0.2.0` không đổi
- Kiến trúc: [../architecture.md](../architecture.md)
- Phase 3A: [03a-kanban-ordering.md](./03a-kanban-ordering.md)
- Nhánh: `feat/phase-3b-task-editing`, tạo từ `release/v0.3`
- Implementation plan: [2026-11-10-phase-3b-task-editing-columns.md](../superpowers/plans/2026-11-10-phase-3b-task-editing-columns.md)
- Không merge `release/v0.3` vào `main` trong phase này

## 1. Mục tiêu

Hoàn thiện thao tác Kanban ngoài kéo thả:

1. Tạo task tay trong một cột.
2. Sửa title, description, assignee, labels, priority, due date của task.
3. Owner quản lý cột: thêm, đổi tên, đổi thứ tự, chọn cột Done, xóa cột rỗng.
4. Giữ optimistic concurrency cho task/board và giữ nguyên thứ tự fractional.
5. Không phá dữ liệu task/item đang có; không thêm migration.

Sau 3B, người dùng có thể dùng Kanban như bảng công việc đầy đủ mà không cần promote note
cho mọi task.

## 2. Quyết định đã chốt

1. 3B gồm task create/edit và column management; **không** gồm cursor pagination hay
   text index. Explain 3A cho thấy `q` 1000 task khoảng 6 ms.
2. `POST /tasks` append cuối cột; client không gửi `order`.
3. `PATCH /tasks/:taskId` chỉ sửa trường nội dung; di chuyển vẫn qua
   `POST /tasks/:taskId/move`.
4. Assignee phải là member của board hoặc `null`.
5. Labels là mảng string; UI nhập comma-separated; server trim, bỏ rỗng, dedupe,
   tối đa 10 label, mỗi label tối đa 50 ký tự.
6. Board columns được cập nhật bằng một request thay thế toàn bộ danh sách theo thứ tự;
   server giữ id cũ, sinh id mới, gán `order = index`.
7. Board phải có ít nhất 1 cột và đúng 1 cột `isDone`.
8. Không xóa cột còn task active; trả `409 COLUMN_NOT_EMPTY`. Task demoted (tương lai)
   không chặn xóa cột.
9. Column management chỉ Owner; task create/edit Member và Owner đều được.
10. Không có migration mới; `$jsonSchema` hiện tại đã phủ board columns và task fields.
11. Không bump version `0.3.0`; chưa merge `main`; tag `v0.2.0` giữ nguyên.

## 3. Hiện trạng

- Task có đủ field `title`, `description`, `assigneeId`, `labels`, `priority`, `dueDate`,
  nhưng chỉ tạo được qua Promote.
- `PATCH /tasks/:taskId` hiện không tồn tại sau 3A; chỉ có `POST /move`.
- Board columns nằm trong document board, Owner chưa có API/UI sửa.
- Kanban UI hiển thị label/assignee/due date nhưng chưa có form sửa hoặc tạo task.
- Task DTO và `$jsonSchema` đã có các field cần dùng; không đổi cấu trúc collection.

## 4. Phạm vi

### Có trong 3B

- `POST /boards/:boardId/tasks`.
- `PATCH /boards/:boardId/tasks/:taskId`.
- `PATCH /boards/:boardId/columns` (Owner).
- Contract create/update task, update columns; mã lỗi `COLUMN_NOT_EMPTY`.
- Service tạo task append fractional order, retry khi trùng key.
- Service sửa task với `expectedVersion`, validate assignee là member.
- Service cập nhật columns với `expectedVersion`, validate cột/xóa/task active.
- UI dialog tạo task, dialog sửa task, dialog quản lý cột.
- Member name/assignee select dùng danh sách member đã có từ 3A.
- Test API, browser, full gate.

### Không có trong 3B

- Cursor pagination, text index.
- Xóa task, archive task, bulk edit.
- Kéo thả hoặc sửa trực tiếp cột trên board.
- Activity/undo, realtime, demote, vote, report.
- Đổi `sourceItemId`/`origin`; task tạo tay giữ hai field này `null`.
- Đồng bộ ngược task title/description về item.
- Migration mới hoặc thay đổi index.

## 5. Contract

### 5.1. Tạo task

```http
POST /api/v1/boards/:boardId/tasks
```

```ts
export const createTaskRequestSchema = z.object({
  columnId: z.string().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  assigneeId: objectIdSchema.nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: isoDateSchema.nullable().optional(),
});
```

- Mặc định: `description = ''`, `assigneeId = null`, `labels = []`,
  `priority = 'medium'`, `dueDate = null`, `version = 1`.
- `columnId` phải thuộc board; sai trả 422.
- `assigneeId` nếu có phải là member của board; sai trả 422.
- Server append cuối cột bằng fractional order, không nhận `order`.
- Response 201: task DTO.

### 5.2. Sửa task

```http
PATCH /api/v1/boards/:boardId/tasks/:taskId
```

```ts
export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    assigneeId: objectIdSchema.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: isoDateSchema.nullable().optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.assigneeId !== undefined ||
      value.labels !== undefined ||
      value.priority !== undefined ||
      value.dueDate !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  );
```

- Không nhận `columnId`, `order`, `version`, `sourceItemId`, `origin`; zod bỏ các field
  không khai báo.
- `assigneeId` thay đổi phải là member board hoặc `null`.
- `labels` được trim, bỏ rỗng, dedupe trước khi lưu.
- Stale version trả `409 VERSION_CONFLICT` kèm `currentVersion`.
- Response 200: task DTO sau update.
- Task title/description không đồng bộ về item nguồn (snapshot tại promote).

### 5.3. Cập nhật cột

```http
PATCH /api/v1/boards/:boardId/columns
```

```ts
export const updateColumnsRequestSchema = z.object({
  columns: z
    .array(
      z.object({
        id: z.string().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(60),
        isDone: z.boolean(),
      }),
    )
    .min(1)
    .max(12),
  expectedVersion: z.number().int().positive(),
});
```

- Chỉ Owner; Member trả 403.
- `id` có mặt phải là cột hiện tại; id lạ trả 422.
- Id không được lặp; cột mới không có `id`.
- Đúng một cột có `isDone: true`; sai trả 422.
- Server sinh id cột mới dạng `col-<uuid>`.
- Server gán `order` theo index của mảng.
- Cột bị bỏ khỏi mảng:
  - Nếu có task active: `409 COLUMN_NOT_EMPTY`, details `{ columnId, taskCount }`.
  - Không có task active: xóa khỏi board.
- Board version phải khớp `expectedVersion`; stale trả 409.
- Update board `columns` và `$inc version: 1`, trả board DTO.
- Rename/reorder không sửa task; task giữ `columnId`.

## 6. Mã lỗi

Thêm:

```json
{
  "error": {
    "code": "COLUMN_NOT_EMPTY",
    "message": "Cột còn task, không thể xóa",
    "details": { "columnId": "todo", "taskCount": 3 }
  },
  "meta": { "requestId": "..." }
}
```

- HTTP 409.
- Dùng khi xóa cột còn task active.
- Các lỗi khác giữ nguyên: 401, 403, 404, 409 `VERSION_CONFLICT`, 409
  `ORDER_CONFLICT`, 422 `VALIDATION_ERROR`.

## 7. Service

### 7.1. Tạo task

1. Board access; validate `columnId` thuộc board.
2. Validate assignee là member (nếu có).
3. Normalize labels: trim, bỏ rỗng, dedupe, kiểm tra lại giới hạn.
4. Tìm task active cuối cột đích; `order = generateKeyBetween(last?.order ?? null, null)`.
5. Tạo task với `version: 1`, `lifecycle: 'active'`, `sourceItemId: null`,
   `origin: null`, `createdBy: actor._id`.
6. Nếu duplicate key order: tính lại một lần; vẫn trùng trả `409 ORDER_CONFLICT`.
7. Trả task.

### 7.2. Sửa task

1. Board access; validate task active thuộc board.
2. So `expectedVersion`; stale trả 409.
3. Validate assignee là member (nếu có).
4. Normalize labels.
5. Update filter `{ _id, boardId, lifecycle: 'active', version: expectedVersion }`,
   `$set` các field được gửi, `$inc version: 1`.
6. Nếu update null: đọc task; không có 404; có trả 409 `VERSION_CONFLICT` với version
   hiện tại.
7. Không đổi `columnId`, `order`, `sourceItemId`, `origin`, `createdBy`.

### 7.3. Cập nhật cột

1. Board access + `requireOwner`.
2. So board `expectedVersion`; stale trả 409.
3. Validate danh sách cột: 1–12 cột, tên 1–60, id hiện tại/không lặp, đúng một Done.
4. Xác định cột bị xóa; đếm task active theo từng `columnId` bị xóa.
5. Nếu có task: trả `COLUMN_NOT_EMPTY` với columnId và taskCount.
6. Tạo id mới nếu thiếu; map columns với `order = index`.
7. Update board filter `{ _id, version: expectedVersion }`, `$set columns`,
   `$inc version: 1`.
8. Nếu update null: đọc board; stale trả 409.
9. Trả board.

## 8. UI

### 8.1. Sửa task

- Card có nút `Sửa` (không mở khi đang kéo).
- Dialog gồm:
  - Title, description.
  - Assignee select: `Chưa gán` + member board.
  - Labels input comma-separated.
  - Priority select.
  - Due date input `type="date"`.
  - Save/Cancel.
- Save gửi `expectedVersion = task.version`.
- Thành công: đóng dialog, reload workspace/tasks (filter hiện tại).
- `VERSION_CONFLICT`: notice, reload; `ORDER_CONFLICT` không xảy ra cho edit.
- Lỗi validation hiển thị message API.

### 8.2. Tạo task

- Nút `+` ở header mỗi cột.
- Dialog với column đã chọn, title, description, assignee, labels, priority, due date.
- Tạo xong reload workspace/tasks; task mới append cuối cột (nếu filter không che).
- Không gửi `order`/`version`.
- Nếu cột bị xóa đồng thời: API 422, hiện lỗi và reload board.

### 8.3. Quản lý cột

- Owner thấy nút `Cột` cạnh `Đổi tên`/`Mời`.
- Dialog:
  - Danh sách cột theo thứ tự; input tên.
  - Nút lên/xuống đổi thứ tự.
  - Radio `Cột Done` đảm bảo đúng một.
  - Nút xóa; server chặn nếu còn task, UI hiển thị lỗi.
  - Ô thêm cột mới + nút `Thêm`.
- Save gửi toàn bộ mảng + `board.version`.
- Thành công: cập nhật board, reload tasks/workspace.
- `VERSION_CONFLICT`/`COLUMN_NOT_EMPTY`: notice, reload board.
- Member không thấy nút; gọi API trực tiếp bị 403.

### 8.4. Hiển thị

- Card hiển thị title, labels, priority, assignee, due date như 3A.
- Dialog dùng member list đã tải từ 3A.
- Date input hiển thị `YYYY-MM-DD`; gửi ISO UTC
  `new Date(`${value}T00:00:00.000Z`).toISOString()`; null nếu để trống.

## 9. Test

### API

- Tạo task:
  - Append cuối cột, order lớn hơn task cuối, version 1.
  - Defaults đúng; labels trim/dedupe; assignee member.
  - Column không thuộc board → 422.
  - Assignee không phải member → 422.
  - Hai create đồng thời cùng cột: không trùng order; một có thể `ORDER_CONFLICT`.
- Sửa task:
  - Sửa từng field và kết hợp; version tăng 1.
  - Clear assignee/dueDate bằng null.
  - Stale version → 409.
  - Assignee ngoài board → 422.
  - Body có `columnId`/`order` không làm task đổi cột/order.
  - Title/description/labels vượt giới hạn → 422.
- Cột:
  - Owner thêm/đổi tên/reorder; order 0..n-1; board version tăng.
  - Đổi cột Done; đúng một Done.
  - Xóa cột rỗng.
  - Xóa cột còn task → 409 `COLUMN_NOT_EMPTY` details.
  - Cột cuối/không cột → 422.
  - Hai cột Done, id lặp, id lạ → 422.
  - Member → 403; stale board version → 409.
  - Task giữ `columnId` sau rename/reorder.
- Regression: toàn bộ test 3A pass.

### Web

- Typecheck/build.
- Browser:
  - Tạo task tay, thấy card, reload còn.
  - Sửa title/priority/assignee/labels/due date, reload còn.
  - Filter theo assignee/priority thấy task đã sửa.
  - Member không thấy nút `Cột`; Owner thấy.
  - Owner thêm cột, rename, reorder, đổi Done, xóa cột rỗng.
  - Xóa cột còn task bị chặn, notice reload.
  - Conflict task/board (client thứ hai qua fetch) reload đúng.
  - Không có lỗi 500.

## 10. Tiêu chí chấp nhận

1. Tạo task tay append cuối cột, version 1, order unique.
2. Sửa task đúng field, version tăng, validate assignee/labels/priority/dueDate.
3. Stale task/board trả 409 `VERSION_CONFLICT`; client reload.
4. Owner quản lý cột; Member bị 403; board version tăng.
5. Không xóa cột còn task active; lỗi `COLUMN_NOT_EMPTY` có taskCount.
6. Board luôn có 1–12 cột và đúng một cột Done.
7. Task giữ columnId khi rename/reorder cột.
8. UI create/edit/columns hoạt động; filter cập nhật; member bị ẩn nút.
9. Typecheck/lint/format pass; full suite ba lần; Docker healthy.
10. Feature merge vào `release/v0.3`; `main`/tag `v0.2.0` không đổi.

## 11. Rủi ro và cách xử lý

- **Order collision khi create đồng thời**: unique index + retry một lần +
  `ORDER_CONFLICT`.
- **Assignee không còn là member**: validate tại thời điểm ghi; task cũ có thể giữ
  assignee đã rời board (chưa có chức năng xóa member).
- **Xóa cột còn task**: server đếm active; UI chỉ hiển thị lỗi.
- **Pending task chưa tải do filter/limit**: UI không tự quyết định xóa cột; server là
  nguồn kiểm tra.
- **Column id bị đổi**: server chỉ giữ id có sẵn; cột mới sinh id; không cho client đổi
  id cột cũ.
- **Date timezone**: dùng ISO UTC; UI hiển thị theo ngày local có thể lệch múi giờ nếu
  trình duyệt khác UTC; ghi rõ trong UI/test.
- **Task snapshot**: sửa task không cập nhật item nguồn; đúng thiết kế mô hình A.
- **Board version đổi do invite**: rename/columns có thể conflict; client reload.

## 12. Git

- `release/v0.3` hiện tại; feature `feat/phase-3b-task-editing` tạo từ release.
- Không migration mới; `LATEST_MIGRATION_NAME` vẫn `003-phase-3a`.
- Không bump version `0.3.0`.
- Merge feature vào `release/v0.3` bằng `--no-ff` sau gate; xóa feature.
- Không merge `release/v0.3` vào `main`; tag `v0.2.0` giữ nguyên.

## 13. Kết quả thực hiện

- Task create/edit API và UI hoạt động; task mới append cuối cột, version 1.
- Task edit không đổi cột/order; assignee/labels/priority/due date validate.
- Owner column manager thêm/đổi tên/đổi thứ tự/lưu thành công; cột còn task bị chặn
  `COLUMN_NOT_EMPTY`.
- Browser filter priority thấy task đã sửa; task/column dialog hiển thị đúng.
- Board test `Phase 3B E2E` đã xóa; dữ liệu ứng dụng còn 1 board, 2 task.
- Không migration; app DB vẫn 001/002/003.
- Member 403 column management được kiểm chứng bằng API integration test.
- Feature gate: typecheck/lint/format pass; full suite 20 file, 99 test ba lần
  14.42/14.35/14.62 s.
- `release/v0.3` chứa 3A + 3B; chưa merge `main`; tag `v0.2.0` giữ nguyên.
