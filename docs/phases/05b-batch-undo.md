# Giai đoạn 5B - Batch promote và Undo promote

- Trạng thái: Draft chờ duyệt
- Ngày lập: 2026-11-10
- Tiền đề: Phase 5A đã merge `release/v0.5` tại `0a34cce`; `main` tại `9fd19b6`,
  tag annotated `v0.4.0`
- Kiến trúc: [../architecture.md](../architecture.md), mục 6.4, 6.6, 4.6 và 11
- Phase 5A: [05a-demote-activity.md](./05a-demote-activity.md)
- Nhánh: feature `feat/phase-5b-batch-undo` từ `release/v0.5`
- Không tạo migration mới; không merge `main`; không bump `0.5.0`; tag `v0.4.0` giữ nguyên
- Hoàn tất v0.5 gồm 5A và 5B; chờ duyệt phát hành riêng

## 1. Mục tiêu

Hoàn tất chuỗi Promote/Demote của v0.5:

1. Promote nhiều note đã chọn trên whiteboard trong một transaction nguyên tử.
2. Mỗi note trong batch có task, item update và activity riêng; có thể undo từng note.
3. Undo promote trong 10 phút, chỉ khi task chưa bị sửa hoặc di chuyển.
4. UI chọn nhiều note, dialog batch và nút Undo trong tab Hoạt động.
5. Fault injection chứng minh transaction rollback ở promote/demote/batch/undo.
6. Không phá vỡ Promote/Demote đơn, realtime, activity TTL và dữ liệu hiện có.

## 2. Quyết định đã chốt

1. Batch promote lấy từ **multi-select note** trên whiteboard, không dựa vào frame.
2. Tối đa **100 item** mỗi batch, tất cả cùng board và cùng cột đích.
3. Batch chạy **một transaction**: insert task, update item, insert activity; một lỗi
   làm abort toàn bộ.
4. Mỗi item trong batch có activity `item.promoted` riêng với `undoableUntil` 10 phút.
5. Undo áp dụng **từng activity** `item.promoted`; batch không có undo nhóm.
6. Undo trong 10 phút; `task.version` phải bằng `snapshot.taskVersionAtPromote`.
7. Undo ghi activity `item.promote_undone`; không xóa activity gốc.
8. Không thêm collection/migration: `activities` và action enum đã có từ 5A.
9. Không thêm event realtime mới; dùng `task:*`/`item:*` và refresh activity hiện có.
10. Fault injection chỉ qua hook test, không có endpoint/flag production.
11. Giữ `release/v0.5`; không merge `main`, không bump `0.5.0`, không tạo tag v0.5.

## 3. Hiện trạng

- 5A đã có promote/demote transaction, activity `item.promoted`/`item.demoted`,
  `undoableUntil` 10 phút khi promote, API activity và tab Hoạt động.
- `activityActionSchema` đã có `item.promote_undone`; collection validator đã cho action này.
- `promoteItem` trả `{ item, task, activity }`; activity snapshot có
  `taskVersionAtPromote`, `itemVersionAtPromote`.
- Web whiteboard chỉ theo dõi một `selectedShapeId`; chưa có multi-select/batch UI.
- Chưa có endpoint `promote-batch` hoặc `activities/:id/undo`.
- Chưa có nút Undo trong activity panel.
- `promoteItem`/`demoteTask` đã có hook test `beforeActivityInsert`; chưa có fault injection
  đầy đủ cho batch/undo.
- Không có migration mới cần thiết; app DB đang ở `005-phase-5a`.

## 4. Phạm vi

### Trong 5B

- Contracts batch promote và undo promote.
- Service batch promote transaction, activity từng item.
- Service undo promote transaction, guard thời gian/version.
- Endpoint `POST /items/promote-batch` và `POST /activities/:activityId/undo`.
- Web multi-select note, batch dialog, nút Undo và dialog xác nhận.
- Realtime/activity refresh cho batch/undo.
- Fault injection tests cho promote/demote/batch/undo.
- Browser verification và gates.

### Ngoài 5B

- Frame support, `parentFrameId` sync và batch theo frame.
- Undo nhóm cho batch.
- Undo task move/edit hoặc activity khác promote.
- Activity realtime watcher riêng.
- Cursor pagination activity; vẫn limit tối đa 100.
- Bulk undo nhiều activity trong một request.

## 5. API Batch Promote

`POST /api/v1/boards/:boardId/items/promote-batch`

Request:

```ts
{
  columnId: string;          // cột active của board
  assignToMe: boolean;       // default false
  items: Array<{
    itemId: string;          // ObjectId
    expectedItemVersion: number; // positive integer
  }>;                        // 1..100, itemId không trùng
}
```

Response 201:

```ts
{
  data: {
    items: ItemDto[];
    tasks: TaskDto[];
    activities: ActivityDto[];
  };
  meta: { requestId: string };
}
```

Quyền: Owner và Member, giống Promote đơn.

Lỗi:

| HTTP | Code | Tình huống |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Board không thuộc quyền truy cập |
| 409 | `BATCH_PROMOTE_CONFLICT` | Một hoặc nhiều item không promote được |
| 422 | `VALIDATION_ERROR` | Body sai schema, >100 item, itemId trùng, cột không tồn tại |
| 503 | `TRANSACTION_OUTCOME_UNKNOWN` | Commit không rõ kết quả |

`BATCH_PROMOTE_CONFLICT.details`:

```ts
{
  errors: Array<{
    itemId: string;
    shapeId?: string;
    code: 'NOT_FOUND' | 'ALREADY_PROMOTED' | 'VERSION_CONFLICT' | 'NOT_A_NOTE';
    currentVersion?: number;
    message: string;
  }>;
}
```

- Batch không trả thành công một phần.
- Item không tồn tại/không thuộc board → lỗi `NOT_FOUND` trong danh sách.
- Item đã có task active → `ALREADY_PROMOTED`.
- Item version lệch → `VERSION_CONFLICT` kèm `currentVersion`.
- Item không phải note → `NOT_A_NOTE`.
- Client hiển thị danh sách lỗi; có thể tải lại workspace rồi thử lại.

## 6. Transaction Batch Promote

Service mới `promoteBatch` trong `apps/api/src/modules/items/promotion.service.ts` (hoặc
file riêng cùng module) nhận board, actor, request và session:

1. Validate board/column; column phải tồn tại trong board.
2. Validate 1..100 item, `itemId` không trùng; assignee (nếu có) là member.
3. Mở transaction snapshot/majority/primary.
4. Trong transaction:
   - Load tất cả item theo `_id` + `boardId`; đủ số lượng, đúng `type: "note"`.
   - Kiểm tra từng item: version khớp, `promotedTaskId` null.
   - Nếu có lỗi, throw `AppError` với danh sách lỗi; transaction abort.
   - Lấy task active cuối cột đích; sinh `order` tuần tự bằng `generateKeyBetween`
     theo thứ tự item trong request, không dùng cùng key.
   - Insert từng task active với `sourceItemId`, `origin`, `createdBy`, `version: 1`.
   - Update từng item bằng filter `{_id, boardId, promotedTaskId: null, version: expected}`;
     set `promotedTaskId`, `$inc: { version: 1 }`.
   - Insert activity `item.promoted` cho từng item trong cùng transaction:
     `refs`, `snapshot` như Promote đơn, `undoableUntil = now + 10 phút`.
5. Commit; trả items/tasks/activities đã serialize.
6. Không emit socket trong transaction; Change Streams phát event sau commit.

Thứ tự task trong cột đích theo thứ tự item trong request. Nếu request chứa item đã
promote, toàn bộ batch abort, không tạo task/activity nào.

### 6.1 Hook fault injection

Thêm hook optional chỉ dùng test:

```ts
beforeTaskInsert?: () => Promise<void>;
beforeItemUpdate?: () => Promise<void>;
beforeActivityInsert?: () => Promise<void>;
```

Hook ném lỗi phải làm rollback toàn bộ. Không expose hook qua HTTP/env.

## 7. API Undo Promote

`POST /api/v1/boards/:boardId/activities/:activityId/undo`

Request: không body (body rỗng hoặc `{}`).

Response 200:

```ts
{
  data: {
    task: TaskDto;     // lifecycle demoted
    item: ItemDto;     // promotedTaskId null
    activity: ActivityDto; // item.promote_undone
  };
  meta: { requestId: string };
}
```

Quyền: Owner và Member.

Lỗi:

| HTTP | Code | Tình huống |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Activity không thuộc board hoặc không tồn tại |
| 409 | `UNDO_NOT_AVAILABLE` | Activity không phải `item.promoted` hoặc thiếu refs |
| 409 | `UNDO_NO_LONGER_SAFE` | Hết 10 phút, task đã đổi version, task không active, item không còn liên kết |
| 503 | `TRANSACTION_OUTCOME_UNKNOWN` | Commit không rõ kết quả |

Undo không áp dụng cho activity `item.demoted` hoặc `item.promote_undone`.

## 8. Transaction Undo Promote

Service mới `undoPromote` trong `apps/api/src/modules/activities/undo.service.ts`:

1. Validate activityId; tìm activity theo `_id` + `boardId`.
2. Nếu action không phải `item.promoted`: `409 UNDO_NOT_AVAILABLE`.
3. Nếu `undoableUntil` null hoặc `<= now`: `409 UNDO_NO_LONGER_SAFE`.
4. Load task/item theo refs; kiểm tra:
   - Task tồn tại, `lifecycle: "active"`.
   - `task.version === snapshot.taskVersionAtPromote`.
   - Item tồn tại, `promotedTaskId` bằng task `_id`.
   - Nếu bất kỳ điều kiện sai: `409 UNDO_NO_LONGER_SAFE`.
5. Mở transaction snapshot/majority/primary:
   - Update task filter `{_id, version: snapshot.taskVersionAtPromote, lifecycle: "active"}`:
     set `lifecycle: "demoted"`, `demotedAt`, `demotedBy`, tăng version.
   - Update item filter `{_id, promotedTaskId: task._id}`: set `promotedTaskId: null`,
     tăng version.
   - Insert activity `item.promote_undone`:
     refs giống activity gốc; snapshot `{ taskTitle, columnId, originalActivityId }`;
     `undoableUntil: null`.
6. Commit; trả task/item/activity.
7. Activity gốc vẫn tồn tại; không cập nhật/xóa. Activity mới là bằng chứng undo.

Hai request undo đồng thời: một commit; request còn lại thấy task không active/version
lệch và nhận `UNDO_NO_LONGER_SAFE`.

### 8.1 Hook fault injection

Thêm hook optional:

```ts
beforeTaskUpdate?: () => Promise<void>;
beforeActivityInsert?: () => Promise<void>;
```

Hook ném lỗi phải rollback task/item/activity. Không expose qua HTTP.

## 9. Activity và UI

### 9.1 Activity sau undo

- Activity gốc `item.promoted` giữ nguyên, kể cả `undoableUntil`.
- Activity undo có `action: "item.promote_undone"`, snapshot chứa `originalActivityId`.
- UI xác định activity promote đã undo nếu tồn tại activity undo có
  `snapshot.originalActivityId === promoteActivityId`.
- Activity TTL 90 ngày vẫn đủ dài; không cần migration.
- `GET /activities` hiện tại trả cả promote, demote và undo; không đổi response shape.

### 9.2 Web multi-select

Whiteboard hiện chỉ có một `selectedShapeId`. 5B cần:

- Theo dõi tập shape đang chọn từ tldraw (`editor.getSelectedShapeIds()`), cập nhật khi
  selection thay đổi.
- Khi chọn đúng 1 note: giữ panel Promote đơn hiện tại.
- Khi chọn từ 2 note trở lên: hiện panel batch với số lượng và nút `Promote selected`.
- Chỉ tính shape note đã có item; shape khác bị bỏ qua.
- Note mới chưa sync: lưu/sync trước khi gửi batch; nếu sync lỗi, không gửi.
- Note đã promote: hiện notice và không gửi batch; server vẫn là chốt chặn cuối.
- Chọn >100 note: chặn ở UI với notice; server trả 422 nếu vượt.
- Multi-select dùng shift-click của tldraw; không thêm công cụ chọn mới.

### 9.3 Batch dialog

- Hiển thị số note, cột đích, checkbox assign to me.
- Xác nhận gọi `POST /items/promote-batch` với `expectedItemVersion` từng item.
- Khi thành công:
  - cập nhật items/tasks từ response;
  - tăng whiteboard revision để badge cập nhật;
  - tăng activity revision;
  - notice `Đã promote N ghi chú`.
- Khi 409 `BATCH_PROMOTE_CONFLICT`: hiển thị danh sách lỗi trong dialog; đóng dialog và
  tải lại workspace/task list khi conflict/version.
- Khi 409/503 khác: giữ dialog, hiện lỗi, cho phép thử lại sau khi tải lại.
- Promote đơn hiện tại không đổi.

### 9.4 Undo UI

- Activity panel hiển thị nút `Undo` cho activity `item.promoted` khi:
  - `undoableUntil` còn hiệu lực;
  - task tương ứng còn active;
  - chưa có activity `item.promote_undone` với `originalActivityId` tương ứng.
- Bấm Undo mở dialog xác nhận (tương tự Demote) với tiêu đề task.
- Thành công: cập nhật item/task state, tăng activity revision, notice;
  task rời Kanban, badge biến mất.
- 409 `UNDO_NO_LONGER_SAFE`: đóng dialog, notice, tải lại workspace/activity.
- 409 `UNDO_NOT_AVAILABLE`: tải lại activity; ẩn nút.
- 503: giữ dialog, hiện lỗi.
- Batch tạo nhiều activity; mỗi dòng có Undo riêng, không có Undo all.

## 10. Realtime

- Batch promote tạo nhiều event từ Change Streams: `task:created` cho từng task,
  `item:promoted` cho từng item.
- Client hiện có upsert task theo version và refetch item snapshot; batch response xử lý
  trước, event đến sau phải idempotent.
- Undo tạo `task:demoted` + `item:demoted`; client 5A đã gỡ task/refetch và làm mới activity.
- Không thêm event type; không thêm watcher mới.
- Activity panel refresh sau batch/undo và khi nhận event demote; không cần watcher
  `activities`.

## 11. Fault injection

Thêm test dùng hook optional, không thay đổi production:

- Promote đơn: lỗi sau insert task trước update item; lỗi trước activity.
- Demote: lỗi trước activity.
- Batch: lỗi trước task insert, trước item update, trước activity insert; mọi trường hợp
  không có task/item/activity một phần.
- Undo: lỗi trước task update và trước activity insert; task/item không đổi.
- Transaction trả `TRANSACTION_OUTCOME_UNKNOWN` giữ nguyên hành vi 503 cho commit không
  rõ kết quả; test các nhánh hook là đại diện cho rollback.

## 12. Test

### 12.1 Contracts

- Batch request: 1..100, itemId không trùng, expected version dương, assignToMe default.
- Batch response parse items/tasks/activities.
- Undo response parse task/item/activity.
- Error code `BATCH_PROMOTE_CONFLICT`/`UNDO_NOT_AVAILABLE`/`UNDO_NO_LONGER_SAFE` qua API.

### 12.2 Batch service

- 2–3 item thành công: đúng số task/item/activity; order tăng dần theo request.
- Activity mỗi item có refs/snapshot/undoableUntil đúng.
- Một item version lệch/đã promote/không tồn tại/không phải note: abort toàn bộ;
  không task/item/activity nào được ghi.
- 101 item hoặc itemId trùng: 422, không ghi.
- Hai batch đồng thời cùng item: một thành công, một 409; không nhân đôi.
- Batch với assignee không phải member: 422.
- Promote lại item sau batch tạo task mới; task cũ demote vẫn còn.

### 12.3 Undo service

- Undo thành công trong 10 phút: task demoted, item null, activity undo.
- Hết hạn: 409 UNDO_NO_LONGER_SAFE; task/item không đổi.
- Task đã sửa/move: 409 UNDO_NO_LONGER_SAFE.
- Activity demote/undo: 409 UNDO_NOT_AVAILABLE.
- Task đã demote/item không liên kết: 409 UNDO_NO_LONGER_SAFE.
- Hai undo đồng thời: một thành công, một 409; không hai activity undo.
- Undo một item trong batch không ảnh hưởng task item khác.
- Activity gốc còn; activity undo có `originalActivityId`.

### 12.4 Fault injection

- Các hook ở mục 11 rollback đúng; không có activity/task/item một phần.
- Promote/demote regression sau khi thêm batch/undo.

### 12.5 Web/browser

- Typecheck/build pass.
- Chọn 2 note bằng shift-click: panel batch hiện số lượng.
- Batch dialog promote 2 note: Kanban có 2 task, badge cả 2 note, activity có 2 dòng.
- Reload giữ dữ liệu batch.
- Undo một activity promote: task đó rời Kanban, note kia và task kia còn; activity undo xuất hiện.
- Undo quá hạn/không an toàn: nút ẩn hoặc 409 hiển thị notice, tải lại.
- Chọn quá 100 note: UI chặn; API vẫn trả 422 nếu gọi trực tiếp.
- Batch conflict (item đã promote) hiển thị danh sách lỗi, không ghi một phần.
- Không lỗi console/500.

### 12.6 Vận hành

- Không migration mới; app DB vẫn 001–005.
- Docker rebuild; health `0.4.0`.
- Full suite ba lần; typecheck/lint/format pass.

## 13. Tiêu chí chấp nhận

1. Batch promote nhiều note trong một transaction; một lỗi làm rollback toàn bộ.
2. Mỗi note batch có task, item update và activity riêng; order đúng thứ tự request.
3. Batch tối đa 100; lỗi danh sách rõ item nào/version nào.
4. Undo từng promote trong 10 phút; task đã sửa/move bị chặn.
5. Undo ghi activity `item.promote_undone`; activity gốc còn.
6. UI multi-select, batch dialog, Undo trong activity panel hoạt động.
7. Realtime/activity cập nhật sau batch/undo; không cần reload.
8. Fault injection chứng minh rollback promote/demote/batch/undo.
9. Full suite ba lần; browser evidence; không lỗi console/500.
10. Feature merge `release/v0.5`; `main`, tag `v0.4.0`, version `0.4.0` không đổi.

## 14. Rủi ro và cách xử lý

- **Batch 100 item vượt transaction/oplog**: giới hạn 100, một transaction; test với
  fixture lớn; không nhận frame ID.
- **Order trùng trong batch**: sinh tuần tự, unique index là chốt chặn; lỗi duplicate
  abort toàn bộ.
- **Event storm sau batch**: client upsert/refetch idempotent; batch response xử lý trước;
  không thêm event type.
- **Undo stale**: kiểm tra task version + lifecycle + item link; 409 UNDO_NO_LONGER_SAFE.
- **Undo hai lần**: filter task active/version; activity undo chỉ một.
- **Activity TTL xóa trước undo**: TTL 90 ngày > 10 phút.
- **Multi-select shape không có item**: bỏ qua/notice; sync trước khi gửi.
- **Note đã promote trong selection**: UI chặn sớm; server trả BATCH_PROMOTE_CONFLICT.
- **Batch UI làm chậm whiteboard**: chỉ tính shape note đã có item; không sync lại toàn bộ.
- **Fault injection lọt production**: hook optional chỉ service/test, không route/env.
- **Không bump version**: 5B là phần cuối v0.5; chờ duyệt phát hành.

## 15. Git

- Feature `feat/phase-5b-batch-undo` từ `release/v0.5` (5A đã ở `0a34cce`).
- Spec commit trên feature; chưa code trước khi spec được duyệt.
- Implementation TDD; merge feature vào `release/v0.5` bằng `--no-ff` sau gate; xóa feature.
- Không merge `release/v0.5` vào `main`; không bump `0.5.0`; tag `v0.4.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
