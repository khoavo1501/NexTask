# Giai đoạn 1 - Slice dọc Promote

- Trạng thái: Hoàn thành ngày 2026-10-28
- Ngày lập: 2026-10-28
- Kiến trúc: [../architecture.md](../architecture.md)
- Kế hoạch thực thi: [../superpowers/plans/2026-10-28-phase-1-vertical-slice.md](../superpowers/plans/2026-10-28-phase-1-vertical-slice.md)
- Biên bản kiểm chứng: [Kết quả triển khai](#11-kết-quả-triển-khai)

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
- tldraw SDK có điều kiện license riêng; build production hiển thị license watermark và cần license key trước khi dùng thương mại.

## 11. Kết quả triển khai

### Git

- Commit kế hoạch: `18b7c03`.
- Contracts/model/index: `b27e92c`.
- Board/item API: `ef9e298`.
- Promote transaction và task move: `8ab8261`.
- Board list/create UI: `f53799a`.
- tldraw workspace, promote, Kanban: `9f0d008`.
- Layout/drag fix: `7058d5b`.
- Fit cột và bỏ selection khi reload: `a7f804f`.
- Commit tài liệu cuối được tạo sau biên bản này; xem `git log --oneline`.
- Repository vẫn không có remote; không push.

### Kiểm chứng tự động

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full suite ba lần liên tiếp: mỗi lần `5` file, `18` test pass.
  - Lần 1: `2.19 s`.
  - Lần 2: `2.27 s`.
  - Lần 3: `2.22 s`.
- Integration test dùng MongoDB replica set thật, database `nextask_phase1_test`, không mock DB.
- Test promote đồng thời: một request `201`, một request `409`, đúng một task.
- Test rollback: tiêm lỗi sau insert task; task count `0`, item vẫn chưa promote.
- Index thật trong database ứng dụng:

```json
{"key":{"sourceItemId":1},"name":"uniq_active_task_per_item","unique":true,"partialFilterExpression":{"sourceItemId":{"$type":"objectId"},"lifecycle":"active"}}
```

### Kiểm chứng Docker và browser

- `docker compose ps`: `mongo`, `api`, `web` đều healthy.
- API health: `status: "ok"`, `replicaSet: "rs0"`, `primary: true`, `latencyMs: 1`.
- Tạo board qua UI thành công: board `Retro E2E Phase 1`.
- Tạo note qua tldraw, nhập nội dung `Giữ daily ngắn và tập trung`; nội dung được lưu vào item.
- Promote thành công: task xuất hiện ở cột `To Do`, assignee `Demo User`.
- Badge trên note hiển thị `Đã thành task · To Do · Demo User`.
- Task được chuyển sang `Done` bằng chuỗi `DragEvent` + `DataTransfer` trên card; badge đổi thành `Đã thành task · Done · Demo User`.
- Reload trang: badge vẫn là `Done`, task vẫn nằm trong cột `Done`.
- Gọi promote lại cùng item: HTTP `409 ALREADY_PROMOTED`; số task vẫn là `1`.
- Restart API: health trả 200, task và badge vẫn còn sau reload.

### Giới hạn kiểm chứng

- Công cụ browser tự động không phát native HTML5 drag khi dùng thao tác `drag` phần tử; vì vậy drag được kiểm chứng bằng chuỗi sự kiện `dragstart` → `dragover` → `drop` với `DataTransfer`, không phải thao tác chuột vật lý. Người dùng cần xác nhận thêm bằng chuột thật.
- tldraw production hiển thị license watermark vì chưa có license key. Không ẩn hoặc vô hiệu hóa watermark.
- E2E tạo dữ liệu thật trong database ứng dụng `nextask`: một board, một note, một task. Dữ liệu được giữ lại để tiếp tục kiểm tra.

### Tiêu chí Phase 1

- [x] Tạo board từ UI, danh sách board hoạt động.
- [x] Note tldraw được lưu và dựng lại sau reload.
- [x] Promote tạo task và cập nhật item trong cùng transaction.
- [x] Unique partial index chống task trùng.
- [x] Lỗi sau insert task rollback toàn bộ.
- [x] Task hiện trên Kanban.
- [x] Chuyển task sang cột Done qua event drag/drop và API.
- [x] Badge cập nhật sau reload với cột hiện tại.
- [x] Owner scoping ở server.
- [x] Test với MongoDB thật; typecheck/lint/format sạch.
- [ ] Xác nhận thao tác kéo chuột vật lý bởi người dùng (công cụ hiện tại không mô phỏng native HTML5 drag).
