# Giai đoạn 5A - Demote và Activity

- Trạng thái: Draft chờ duyệt
- Ngày lập: 2026-11-10
- Tiền đề: v0.4.0 đã phát hành; `main` tại `9fd19b6`, tag annotated `v0.4.0`
- Kiến trúc: [../architecture.md](../architecture.md), mục 6.5, 4.6 và 11
- Phase 4: [04-realtime.md](./04-realtime.md)
- Nhánh: `release/v0.5` tạo từ `main`; feature `feat/phase-5a-demote-activity`
- Phase 5B (sau 5A): batch promote, undo promote, fault injection transaction
- Không merge `main`, không bump `0.5.0` trong 5A
- Tag `v0.4.0` giữ nguyên

## 1. Mục tiêu

Đưa task từ Kanban trở lại whiteboard mà không mất lịch sử:

1. Demote một task đã promote: task rời Kanban, note gốc vẫn còn trên whiteboard.
2. Demote chạy trong transaction: task, item và activity cùng commit hoặc cùng abort.
3. Ghi activity `item.promoted` khi promote và `item.demoted` khi demote.
4. Activity có TTL 90 ngày, index đọc theo board; chuẩn bị dữ liệu cho undo ở 5B.
5. Web có nút Demote cho task có nguồn note, xác nhận trước khi thực hiện; panel hoạt động
   đọc được activity gần đây.
6. Realtime hiện có phản ánh demote: Kanban gỡ task, badge note biến mất.

## 2. Quyết định đã chốt

1. Phase 5 tách 5A/5B. 5A chỉ gồm Demote + Activity; batch, undo và fault injection ở 5B.
2. Undo ở 5B chỉ áp dụng cho activity `item.promoted`; 5A chỉ ghi dữ liệu cần cho undo,
   chưa mở endpoint undo.
3. Demote không xóa task và không tạo bản sao note. Task giữ `_id`, `sourceItemId`,
   `origin`; chuyển `lifecycle` sang `demoted`.
4. Không đặt lại vị trí note theo `origin`; người dùng có thể đã di chuyển note.
5. Demote dùng OCC với cả task và item: client gửi `expectedTaskVersion` và
   `expectedItemVersion`.
6. Activity của 5A chỉ gồm `item.promoted` và `item.demoted`; `item.promote_undone`
   dành cho 5B. Không ghi activity cho task move/edit trong 5A.
7. Activity không phát realtime riêng; panel tải lại sau thao tác của mình và khi nhận
   event demote từ client khác.
8. Activity TTL 90 ngày; `undoableUntil` của promote là thời điểm promote + 10 phút.
9. Một activity thuộc đúng một board; mọi truy vấn activity đều lọc `boardId`.
10. Không thay đổi REST promote hiện tại ngoài việc ghi thêm activity trong transaction.

## 3. Hiện trạng

- `tasks.lifecycle` đã có `active|demoted` trong model/validator, nhưng chưa có
  `demotedAt`/`demotedBy`.
- Chưa có collection `activities`, model, contract hoặc API activity.
- `promoteItem` chạy transaction task + item nhưng chưa ghi activity.
- Chưa có endpoint demote.
- Event mapper đã map `task:demoted` và `item:demoted`; web đã gỡ task khi nhận
  `task:demoted` và refetch whiteboard khi nhận item event.
- `TaskDto` đang khai báo `lifecycle: "active"` cố định; cần mở rộng cho response demote.
- Kanban card có nút `Sửa`; chưa có nút Demote.
- Migration mới nhất là `004-phase-4`; chưa có migration 005.

## 4. Phạm vi

### Trong 5A

- Migration 005: collection `activities`, validator, index, TTL; bổ sung validator task
  cho `demotedAt`/`demotedBy`.
- Activity model + contract + serializer.
- Ghi activity promote trong transaction promote.
- Endpoint demote + service transaction + contract response.
- API đọc activity gần đây của board.
- Web: nút Demote, dialog xác nhận, panel activity, cập nhật state sau demote.
- Realtime: kiểm tra event demote hiện có; client gỡ task và làm mới activity.
- Test migration, contract, transaction, API, realtime và browser.

### Ngoài 5A

- Batch promote (5B).
- Undo promote và endpoint undo (5B).
- Fault injection toàn diện cho transaction (5B).
- Activity cho task create/move/update.
- Realtime watcher cho collection `activities`.
- Cursor pagination cho activity; 5A chỉ trả tối đa 100 bản ghi gần nhất.
- Xóa thành viên, xóa board, báo cáo và voting.

## 5. Mô hình dữ liệu

### 5.1 `activities`

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `_id` | ObjectId | |
| `boardId` | ObjectId | Bắt buộc |
| `actorId` | ObjectId | User thực hiện |
| `action` | string | 5A: `item.promoted`, `item.demoted`; 5B thêm `item.promote_undone` |
| `refs` | object | `{ itemId?, taskId?, columnId? }` |
| `snapshot` | object | Dữ liệu hiển thị và kiểm tra undo |
| `undoableUntil` | Date hoặc null | Promote: +10 phút; demote: null |
| `createdAt` | Date | Thời điểm ghi activity |

`snapshot` cho `item.promoted`:

```json
{
  "taskTitle": "Giữ daily ngắn",
  "columnId": "todo",
  "taskVersionAtPromote": 1,
  "itemVersionAtPromote": 44
}
```

`snapshot` cho `item.demoted`:

```json
{
  "taskTitle": "Giữ daily ngắn",
  "columnId": "todo"
}
```

Index:

```js
db.activities.createIndex(
  { boardId: 1, createdAt: -1 },
  { name: "activities_board_created" }
);

db.activities.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 7776000, name: "activities_created_ttl" }
);
```

TTL 90 ngày đủ dài hơn cửa sổ undo 10 phút. TTL monitor chạy nền nên không xóa đúng
từng giây; activity là log vận hành có hạn, không phải audit vĩnh viễn.

### 5.2 Bổ sung task

Thêm hai field nullable vào task:

- `demotedAt`: Date hoặc null.
- `demotedBy`: ObjectId hoặc null.

Không backfill dữ liệu cũ. Validator của migration 005 khai báo hai field optional,
nullable; task active hiện có vẫn hợp lệ. Model Mongoose mặc định `null`.

### 5.3 Contract `ActivityDto`

File mới `packages/contracts/src/activity.ts`, export qua `packages/contracts/src/index.ts`.

```ts
{
  _id: string;
  boardId: string;
  actorId: string;
  action: 'item.promoted' | 'item.demoted' | 'item.promote_undone';
  refs: {
    itemId: string | null;
    taskId: string | null;
    columnId: string | null;
  };
  snapshot: Record<string, unknown>;
  undoableUntil: string | null;
  createdAt: string;
}
```

Không trả `actorName` trong activity; web map `actorId` sang tên thành viên đã tải từ
`GET /boards/:boardId/members`. Cách này tránh join và tránh dữ liệu trùng.

### 5.4 Mở rộng `TaskDto`

`taskSchema` đổi:

- `lifecycle`: `z.enum(['active', 'demoted'])` thay vì `z.literal('active')`.
- `demotedAt`: ISO date nullable.
- `demotedBy`: ObjectId nullable.

`serializeTask` trả lifecycle thật và hai field mới. Task list vẫn chỉ trả active; response
demote trả task vừa chuyển demoted. Không đổi shape các field cũ.

## 6. Migration 005

Tên: `005-phase-5a`.

1. Tạo collection `activities` nếu chưa có:
   - validator strict/error;
   - required: `boardId`, `actorId`, `action`, `refs`, `snapshot`, `undoableUntil`,
     `createdAt`;
   - `action` enum `item.promoted`, `item.demoted`, `item.promote_undone`;
   - `refs` và `snapshot` là object; `undoableUntil` date/null;
   - `additionalProperties: false`.
2. Nếu collection đã tồn tại, `collMod` cập nhật validator; không xóa dữ liệu.
3. Tạo index `activities_board_created` và TTL `activities_created_ttl`.
4. `collMod` validator `tasks` để thêm `demotedAt`, `demotedBy` optional; giữ nguyên
   các ràng buộc cũ và `validationLevel: strict`, `validationAction: error`.
5. Migration idempotent; chạy rehearsal trước khi áp app DB.
6. Cập nhật migration runner: `MIGRATION_005_NAME`, `LATEST_MIGRATION_NAME`.

Không cần bật pre/post images cho `activities` vì 5A không watch collection này.

## 7. API

### 7.1 Demote

`POST /api/v1/boards/:boardId/tasks/:taskId/demote`

Request:

```ts
{
  expectedTaskVersion: number; // positive integer
  expectedItemVersion: number; // positive integer
}
```

Response 200:

```ts
{
  data: {
    task: TaskDto;   // lifecycle = demoted, demotedAt/demotedBy có giá trị
    item: ItemDto;   // promotedTaskId = null, version tăng 1
    activity: ActivityDto;
  };
  meta: { requestId: string };
}
```

Quyền: Owner và Member đều được demote, giống Promote.

Lỗi:

| HTTP | Code | Tình huống |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Task không thuộc board hoặc không tồn tại |
| 409 | `ALREADY_DEMOTED` | Task đã ở lifecycle demoted |
| 409 | `TASK_NOT_DEMOTABLE` | Task tạo tay không có `sourceItemId`, hoặc item nguồn không còn khớp |
| 409 | `VERSION_CONFLICT` | Task hoặc item version lệch; `details` có `currentVersion` và `field` |
| 422 | `VALIDATION_ERROR` | Body sai schema |
| 503 | `TRANSACTION_OUTCOME_UNKNOWN` | Commit không rõ kết quả |

`VERSION_CONFLICT.details` dùng một trong hai dạng:

```ts
{ field: 'task', currentVersion: number }
{ field: 'item', currentVersion: number, shapeId?: string }
```

### 7.2 Danh sách activity

`GET /api/v1/boards/:boardId/activities?limit=50`

- `limit`: integer 1..100, mặc định 50.
- Sắp xếp `createdAt` giảm dần, sau đó `_id` giảm dần để ổn định.
- Chỉ trả activity của board; Member và Owner đều đọc được.
- Response:

```ts
{
  data: ActivityDto[];
  meta: { requestId: string };
}
```

5A chưa có cursor pagination; nếu cần xem thêm, giảm phạm vi bằng thời gian hoặc chờ
phase sau. Không thêm endpoint xóa activity.

## 8. Transaction Demote

Service mới `demoteTask` trong `apps/api/src/modules/tasks/demote.service.ts`:

1. Validate ObjectId; tìm task theo `_id` và `boardId` ngoài transaction để trả 404 sớm.
2. Nếu task không active: `409 ALREADY_DEMOTED`.
3. Nếu `sourceItemId` null: `409 TASK_NOT_DEMOTABLE`.
4. Mở transaction với `readConcern: "snapshot"`, `writeConcern: { w: "majority", j: true }`,
   read preference primary.
5. Trong transaction:
   - Đọc lại task và item nguồn.
   - So `task.version` với `expectedTaskVersion`; lệch → version conflict field `task`.
   - So `item.version` với `expectedItemVersion`; lệch → version conflict field `item`.
   - Kiểm tra `item.promotedTaskId` bằng task `_id`; không khớp → `TASK_NOT_DEMOTABLE`.
   - Update task với filter `{ _id, boardId, lifecycle: "active", version: expectedTaskVersion }`:
     set `lifecycle: "demoted"`, `demotedAt`, `demotedBy`, `$inc: { version: 1 }`.
   - Update item với filter `{ _id: item._id, boardId, promotedTaskId: task._id, version: expectedItemVersion }`:
     set `promotedTaskId: null`, `$inc: { version: 1 }`.
   - Kiểm tra `matchedCount` của cả hai update; nếu 0 thì đọc lại và trả conflict tương ứng.
   - Insert activity `item.demoted` với `undoableUntil: null`.
6. Commit; trả task/item/activity đã serialize.
7. Nếu commit không rõ kết quả: `503 TRANSACTION_OUTCOME_UNKNOWN`; client refetch board.

Không emit socket trong transaction. Change Streams phát event sau commit như Phase 4.

### 8.1 Activity promote

Trong `promoteItem`, sau khi update item thành công, insert activity `item.promoted` trong
cùng transaction:

- `actorId`: user promote.
- `refs`: itemId, taskId, columnId.
- `snapshot`: `taskTitle`, `columnId`, `taskVersionAtPromote: 1`,
  `itemVersionAtPromote: updatedItem.version`.
- `undoableUntil`: `now + 10 phút`.

Nếu insert activity lỗi, transaction abort: không có task/item promote một nửa. Response
promote hiện tại giữ nguyên shape; activity chỉ dùng nội bộ và cho panel.

## 9. Realtime

Phase 4 đã có watcher `tasks`/`items`; demote tạo hai update trong một transaction:

- Task active → demoted: event `task:demoted` với `{ taskId, itemId }`.
- Item `promotedTaskId` → null: event `item:demoted` với item mới và taskId cũ.

Client:

1. Nhận `task:demoted`: gỡ task khỏi danh sách Kanban; gọi làm mới activity.
2. Nhận `item:demoted`: cập nhật/refetch snapshot whiteboard; badge note biến mất.
3. Dedupe event id và bỏ event task có version cũ như Phase 4.
4. Sau khi tự demote thành công, cập nhật state ngay từ response; event realtime đến sau
   không tạo trạng thái sai.

Activity không có event riêng. Panel làm mới khi:

- tải workspace;
- sau promote/demote thành công;
- nhận event `task:demoted` hoặc `item:demoted` từ client khác.

## 10. Web

### 10.1 API client

Thêm:

- `demoteTask(boardId, taskId, { expectedTaskVersion, expectedItemVersion })`.
- `getActivities(boardId, limit = 50)`.
- `isTaskNotDemotable(error)` nếu cần hiển thị thông báo riêng.

### 10.2 Kanban

- Task card có nút `Demote` chỉ khi `task.sourceItemId !== null`.
- Bấm nút mở dialog xác nhận:
  - tiêu đề task;
  - cảnh báo task rời Kanban nhưng note vẫn còn trên whiteboard;
  - nút Hủy và Demote.
- Dialog gửi `expectedTaskVersion` của task và `expectedItemVersion` của item nguồn.
  Nếu client không tìm thấy item (dữ liệu lệch), tải lại workspace trước khi gửi.
- Khi thành công:
  - gỡ task khỏi danh sách;
  - cập nhật item trong state (promotedTaskId null, version mới);
  - đóng dialog, hiện notice, làm mới activity;
  - whiteboard remount theo revision hiện có để badge biến mất.
- 409 `VERSION_CONFLICT`: đóng dialog, notice, tải lại workspace và task list.
- 409 `ALREADY_DEMOTED`: tải lại workspace; không coi là lỗi nghiêm trọng.
- 409 `TASK_NOT_DEMOTABLE`: notice task không còn liên kết note; tải lại.
- 503: giữ dialog, hiện lỗi và cho phép thử lại sau khi tải lại.

### 10.3 Activity panel

- Thêm tab `Hoạt động` trong khu vực Kanban (cạnh tab Kanban hiện có).
- Hiển thị tối đa 50 activity gần nhất; mỗi dòng gồm:
  - tên actor (map từ member list; fallback "Không rõ");
  - hành động: `Đã promote` / `Đã demote`;
  - tiêu đề task từ `snapshot.taskTitle`;
  - thời gian tương đối hoặc `Intl.DateTimeFormat('vi-VN')`.
- Có nút làm mới thủ công; trạng thái rỗng hiển thị "Chưa có hoạt động".
- Không có nút undo trong 5A (để 5B).
- Activity lỗi tải không chặn Kanban/whiteboard; hiện notice nhỏ.

## 11. Test

### 11.1 Contracts

- `demoteTaskRequestSchema` từ chối version 0/âm/thiếu.
- `activitySchema` đúng action enum, refs nullable, snapshot object.
- `TaskDto` chấp nhận lifecycle `demoted` và `demotedAt`/`demotedBy` null hoặc có giá trị.
- Web API client parse response demote/activity.

### 11.2 Migration 005

- Latest migration là `005-phase-5a`; chạy lại idempotent.
- `activities` có validator strict/error; thiếu field bắt buộc bị từ chối.
- Index `activities_board_created` và TTL `activities_created_ttl` tồn tại đúng
  `expireAfterSeconds: 7776000`.
- Validator `tasks` chấp nhận task cũ không có `demotedAt`/`demotedBy`; chấp nhận task
  demoted có hai field; vẫn từ chối field lạ.
- Rehearsal giữ nguyên counts board/item/task/activity hiện có.

### 11.3 Promote activity

- Promote thành công tạo đúng một activity `item.promoted`, refs/snapshot/undoableUntil
  đúng.
- Promote thất bại do duplicate active task hoặc version conflict không để lại activity.
- Promote tạo activity trong cùng transaction; test rollback có kiểm soát bằng hook xác
  nhận task/item không đổi khi bước ghi activity lỗi. Fault injection toàn diện để 5B.

### 11.4 Demote transaction

- Demote thành công: task demoted + demotedAt/demotedBy, task.version + 1, item
  promotedTaskId null + version + 1, activity `item.demoted`.
- Demote lần hai: `409 ALREADY_DEMOTED`; không tăng version, không thêm activity.
- Task tạo tay: `409 TASK_NOT_DEMOTABLE`.
- Task version lệch: `409 VERSION_CONFLICT` field `task`; item không đổi.
- Item version lệch: `409 VERSION_CONFLICT` field `item`; task không đổi.
- Hai demote đồng thời: một thành công, một 409/conflict; chỉ một activity.
- Không tìm thấy task/item thuộc board: 404 hoặc 409 theo bảng lỗi; không rò board khác.
- Sau demote, promote lại cùng item tạo task mới; task demoted cũ vẫn còn.
- Badge/Kanban đọc lại sau demote không thấy task active.

### 11.5 Activity API

- Member và Owner đọc được activity của board mình.
- Non-member bị 403.
- Chỉ trả activity đúng board; sort mới nhất trước; limit mặc định 50, tối đa 100.
- Activity `undoableUntil` serialize ISO hoặc null.

### 11.6 Realtime

- Demote phát `task:demoted` và `item:demoted` qua watcher hiện có.
- Client nhận event gỡ task; item event refetch whiteboard; không lỗi console.
- Event từ board khác không lọt room.

### 11.7 Web/browser

- Typecheck/build pass.
- Browser: mở board có task từ note; bấm Demote, xác nhận.
- Kanban gỡ task ngay; badge `Đã thành task` trên note biến mất; activity panel có dòng
  demote.
- Reload: task vẫn không có trên Kanban; note vẫn còn; activity còn.
- Task tạo tay không có nút Demote.
- Client thứ hai demote: tab đang mở tự gỡ task và làm mới activity.
- 409 conflict hiển thị notice và tải lại, không kẹt state.

### 11.8 Vận hành

- Backup app DB trước migration 005.
- Rehearsal `nextask_5a_rehearsal`, áp migration, kiểm tra validator/index/TTL/counts, drop.
- Áp app DB; Docker rebuild; health vẫn `0.4.0` (không bump trong 5A).
- Full suite ba lần; typecheck/lint/format pass.

## 12. Tiêu chí chấp nhận

1. Demote thành công giữ task trong DB với lifecycle demoted, giữ item gốc và lịch sử.
2. Task rời Kanban, badge note biến mất; reload vẫn đúng.
3. Demote chạy transaction; lỗi giữa chừng không để task/item/activity lệch nhau.
4. Activity `item.promoted` và `item.demoted` được ghi đúng board/actor/refs/snapshot.
5. Migration 005 áp rehearsal/app; validator, index và TTL đúng; dữ liệu cũ giữ nguyên.
6. API demote/activity đúng quyền, đúng lỗi OCC và không rò board khác.
7. Realtime demote hoạt động giữa hai client; không cần reload.
8. Web có xác nhận demote, panel hoạt động, xử lý conflict/503 rõ ràng.
9. Typecheck/lint/format pass; full suite ba lần; browser evidence.
10. Feature merge vào `release/v0.5`; `main`, tag `v0.4.0` và version `0.4.0` không đổi.

## 13. Rủi ro và cách xử lý

- **Hai demote đồng thời**: filter lifecycle active + version; một request thắng, request
  còn lại conflict; activity chỉ một.
- **Demote đua với move/edit task**: task version lệch → 409; client tải lại.
- **Demote đua với sửa item**: item version lệch → 409; không ghi nửa transaction.
- **Activity TTL xóa quá sớm**: 90 ngày, dài hơn nhiều cửa sổ undo 10 phút; không dùng
  activity làm audit vĩnh viễn.
- **Validator task additionalProperties**: thêm field optional, không backfill; migration
  rehearsal trước.
- **Activity insert làm promote chậm/fail**: cùng transaction, chấp nhận tăng write; lỗi
  activity abort promote thay vì thiếu log.
- **Realtime item event gây refetch whiteboard**: chấp nhận snapshot refetch như Phase 4;
  không live-merge tldraw.
- **Activity panel lỗi**: không chặn Kanban/whiteboard; hiện notice và nút thử lại.
- **Client cũ**: TaskDto mở rộng lifecycle; web/API deploy cùng phiên bản; reload board cũ
  không phá dữ liệu.
- **Manual task demote**: chặn bằng `TASK_NOT_DEMOTABLE`; UI ẩn nút.
- **Không bump version**: 5A chỉ là một phần của v0.5; chờ 5B và duyệt phát hành.

## 14. Git

- `release/v0.5` tạo từ `main` tại `9fd19b6` (v0.4.0).
- Feature `feat/phase-5a-demote-activity` tạo từ `release/v0.5`.
- Spec commit trên feature; chưa code trước khi spec được duyệt.
- Sau khi implement và gate: merge feature vào `release/v0.5` bằng `--no-ff`; xóa feature.
- Không merge `release/v0.5` vào `main`; không bump `0.5.0`; tag `v0.4.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
