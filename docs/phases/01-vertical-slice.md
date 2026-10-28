# Giai đoạn 1 - Slice dọc Promote

- Trạng thái: Đang chuẩn bị triển khai
- Ngày lập: 2026-10-28
- Kiến trúc: [../architecture.md](../architecture.md)
- Kế hoạch thực thi: [../superpowers/plans/2026-10-28-phase-1-vertical-slice.md](../superpowers/plans/2026-10-28-phase-1-vertical-slice.md)

## 1. Mục tiêu

Hoàn thành luồng sản phẩm nhỏ nhất nhưng chạy thật:

```text
Tạo board
  -> đặt sticky note trên tldraw
  -> Promote chọn cột
  -> task xuất hiện trên Kanban
  -> kéo task sang Done
  -> reload
  -> note hiển thị huy hiệu "Đã thành task" kèm cột hiện tại
```

Đây là cột mốc quan trọng nhất của dự án. Giai đoạn này chưa có realtime; badge đúng sau reload.

## 2. Kiến thức MongoDB

### Transaction nhiều document

Promote ghi hai document:

- Insert một task mới.
- Update item gắn `promotedTaskId`.

Hai ghi này phải cùng commit hoặc cùng abort. MongoDB transaction yêu cầu replica set, đã có từ Giai đoạn 0.

Giai đoạn này dùng:

- `readConcern: "snapshot"`.
- `writeConcern: { w: "majority", j: true }`.
- Read preference primary.
- `session.withTransaction`.

Lý do: item và task phải nhất quán tại mọi thời điểm; không được có task mồ côi hoặc item trỏ tới task không tồn tại.

### Unique partial index

Chống promote trùng ở tầng database:

```js
db.tasks.createIndex(
  { sourceItemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceItemId: { $type: "objectId" },
      lifecycle: "active"
    },
    name: "uniq_active_task_per_item"
  }
)
```

Hai request đồng thời:

- Cả hai thấy item chưa promote.
- Cả hai cố insert task.
- Một insert thắng; insert còn lại nhận duplicate key.
- Transaction của request thua abort, không để lại item update.

### Test rollback thật

Test tiêm lỗi sau khi insert task nhưng trước khi update item. Kỳ vọng:

- Transaction abort.
- Không có task.
- Item vẫn `promotedTaskId: null`.
- Không có activity (Phase 1 chưa có activity).

### Index và sắp xếp

- Item unique theo `(boardId, shapeId)` để đồng bộ shape tldraw idempotent.
- Task có index Kanban `(boardId, columnId, order)`.
- `order` là fractional indexing string; task mới luôn nằm cuối cột.
- Chưa làm optimistic concurrency cho client trong phase này; trường `version` được tăng nhưng chưa dùng để chặn ghi.

## 3. Phạm vi

### Có trong Phase 1

- Một demo owner cố định, không đăng nhập.
- Tạo board, danh sách board.
- Board mặc định 5 cột: Backlog, To Do, In Progress, Review, Done.
- tldraw canvas với sticky note.
- Lưu note vào MongoDB; tạo, sửa nội dung, di chuyển, xóa note chưa promote.
- Promote một note: chọn cột, tùy chọn giao cho demo owner.
- Task xuất hiện trên Kanban.
- Kéo task giữa các cột bằng HTML5 drag and drop.
- Badge trên note sau reload, hiển thị cột hiện tại.
- API tests dùng MongoDB replica set thật.
- Browser kiểm tra luồng chính.

### Không có trong Phase 1

- Auth, user thật, member, role.
- `$jsonSchema` collection validator.
- Optimistic concurrency chặn ghi.
- Frame, text, arrow, template Retro.
- Demote, batch, undo, activity log.
- Realtime/Change Streams.
- Báo cáo, voting.
- Kéo thả note giữa frame hoặc connector.
- CRDT.

## 4. Quyết định và giả định

### Demo owner

Phase 1 dùng `DEMO_OWNER_ID` cố định, không có user document. Board lưu `ownerId` bằng ObjectId này. Mọi request board được scope theo owner id ở server.

Đây là giải pháp tạm cho slice dọc; Phase 2 thay bằng JWT, user thật và membership. Không dùng cơ chế này ngoài local.

### tldraw

- Dùng tldraw 5.5.2, không tự viết canvas.
- Phase 1 chỉ hỗ trợ shape `note`; toolbar tùy biến chỉ có Select, Hand, Note, màu note và zoom.
- Note được lưu thành item với `shapeId`, content, style, props, position, size, rotation, `tldrawIndex`.
- Khi load board, item được dựng lại thành shape tldraw.
- Lưu khi thả chuột và debounce sau thay đổi; không gửi theo từng frame di chuyển.
- Note đã promote không bị xóa khỏi DB nếu người dùng xóa shape; lần reload sau note sẽ xuất hiện lại. Đây là bảo vệ liên kết task trong phase chưa có Demote.

### Badge

- Badge không ghi denormalize cột/assignee vào item.
- Frontend lấy task active theo `promotedTaskId`/`sourceItemId` và vẽ overlay trên note.
- Sau reload, dữ liệu task được fetch lại; badge hiển thị cột hiện tại.
- Phase 4 sẽ cập nhật badge trực tiếp qua Change Streams.

### Assignee

Task có `assigneeId` nullable. UI Phase 1 có checkbox "Giao cho tôi"; khi chọn, server gán `DEMO_OWNER_ID`. Hiển thị tên "Demo User". Chưa chọn được thành viên khác.

## 5. Dữ liệu Phase 1

### `boards`

- `name`
- `ownerId`
- `columns[]`: `{ id, name, order, isDone }`
- `settings`: `{ votingLimit, minVotes, stalledAfterDays }`
- `version`
- timestamps

### `items`

- `boardId`, `shapeId`, `type: "note"`, `content`
- `style`, `props` (Mixed, dữ liệu tldraw)
- `position`, `size`, `rotation`, `tldrawIndex`
- `parentFrameId: null`
- `authorId`
- `votes: []`
- `promotedTaskId: ObjectId | null`
- `version`
- timestamps

### `tasks`

- `boardId`, `columnId`, `order`
- `title`, `description`
- `assigneeId`, `labels`, `priority`, `dueDate`
- `lifecycle: "active"`
- `sourceItemId`
- `origin`: snapshot item
- `version`, `createdBy`
- timestamps

### Index bắt buộc

- `items`: unique `(boardId, shapeId)`.
- `tasks`: unique partial `sourceItemId` cho task active.
- `tasks`: `(boardId, columnId, order)`.
- `boards`: `(ownerId, updatedAt)`.
- `items`: `(boardId, type)`.

Index được tạo bằng hàm `ensureIndexes()` idempotent khi server khởi động và trong test, không dựa vào `autoIndex` của Mongoose.

## 6. API Phase 1

Tất cả endpoint dưới `/api/v1`, dùng envelope hiện có.

| Method | Path | Mục đích |
| --- | --- | --- |
| GET | `/boards` | Board của demo owner |
| POST | `/boards` | Tạo board với cột mặc định |
| GET | `/boards/:boardId` | Chi tiết board |
| GET | `/boards/:boardId/items` | Danh sách note |
| PUT | `/boards/:boardId/items` | Đồng bộ note từ tldraw |
| GET | `/boards/:boardId/tasks` | Task active, sort theo cột/order |
| POST | `/boards/:boardId/items/:itemId/promote` | Promote transaction |
| PATCH | `/boards/:boardId/tasks/:taskId` | Đổi cột |

Mã lỗi mới:

- `NOT_FOUND` cho board/item/task không thuộc owner.
- `VALIDATION_ERROR` 422.
- `ALREADY_PROMOTED` 409.
- `TRANSACTION_OUTCOME_UNKNOWN` 503 nếu commit không rõ kết quả.

## 7. UI Phase 1

### `/`

- Danh sách board của demo owner.
- Form tạo board.
- Liên kết trang health.

### `/boards/[boardId]`

- Header: tên board, quay lại, trạng thái lưu.
- Whiteboard bên trái.
- Kanban bên phải.
- Toolbar tldraw:
  - Select.
  - Hand.
  - Note.
  - Màu note.
  - Zoom in/out/fit.
  - Lưu.
- Panel note đang chọn:
  - Nội dung rút gọn.
  - Nút Promote.
  - Nếu đã promote: hiển thị cột hiện tại.
- Modal Promote:
  - Chọn cột đích.
  - Checkbox giao cho Demo User.
- Kanban:
  - Cột mặc định.
  - Card task.
  - Drag card sang cột khác.
- Badge overlay trên note đã promote: `Đã thành task · <tên cột>`.

### Trạng thái

- Đang tải.
- Lỗi API.
- Đang lưu.
- Đã lưu.
- Lỗi promote/move.

## 8. Kiểm thử

### API integration

1. Tạo board trả 5 cột mặc định, owner đúng.
2. Danh sách board chỉ chứa board của owner hiện tại.
3. Board của owner khác trả 404.
4. Sync item tạo note; sync lại cùng shape id không tạo trùng.
5. Sync bỏ note chưa promote không còn trong payload.
6. Sync giữ note đã promote dù shape bị xóa.
7. Promote tạo task và cập nhật item trong transaction.
8. Promote lần hai trả 409, không tạo task thứ hai.
9. Hai promote đồng thời: một 201, một 409, đúng một task.
10. Lỗi sau insert task làm transaction rollback: không task, item không đổi.
11. Move task sang Done cập nhật cột và order.
12. Index unique partial tồn tại.
13. Request sai schema trả 422.

### Browser

- Tạo board.
- Đặt note.
- Promote.
- Task hiện trên Kanban.
- Kéo sang Done.
- Reload.
- Badge hiển thị Done.

### Cổng chất lượng

- `npm run typecheck`.
- `npm run lint`.
- `npm run format:check`.
- Ba lần full test pass liên tiếp.
- Docker Compose build và health sau thay đổi.
- Browser check thật.
- Ghi kết quả vào phase doc và session log.

## 9. Câu hỏi kiểm tra hiểu bài

1. Vì sao chỉ unique index là chưa đủ để bảo đảm item và task luôn nhất quán? Transaction bảo vệ thêm điều gì?
2. Nếu transaction commit trả `UnknownTransactionCommitResult`, vì sao không được vội trả lỗi thất bại cho client?

## 10. Rủi ro

- tldraw thay đổi API giữa các phiên bản; đã khóa 5.5.2.
- Phase 1 chỉ hỗ trợ note; frame/text/arrow sẽ bổ sung sau.
- Badge là overlay tính theo viewport; cần cập nhật khi pan/zoom.
- Không có auth; mọi request dùng demo owner.
- Note đã promote bị xóa trên canvas sẽ xuất hiện lại sau reload để bảo vệ liên kết.
- Không có optimistic concurrency; hai tab sửa cùng note có thể ghi đè.
- tldraw SDK có điều kiện license riêng; cần kiểm tra trước khi dùng thương mại.
