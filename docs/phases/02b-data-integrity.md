# Giai đoạn 2B - $jsonSchema và optimistic concurrency

- Trạng thái: Đang triển khai ngày 2026-10-28
- Ngày lập: 2026-10-28
- Tiền đề: Giai đoạn 2A hoàn thành, đang nằm trên `release/v0.2`
- Đề xuất gốc: [02-proposal.md](./02-proposal.md)
- Implementation plan: [2026-10-28-phase-2b-data-integrity.md](../superpowers/plans/2026-10-28-phase-2b-data-integrity.md)
- Kiến trúc: [../architecture.md](../architecture.md)
- Nhánh: `feat/phase-2b-data-integrity`, tạo từ `release/v0.2` tại `611e893`
- Không merge `release/v0.2` vào `main` trong giai đoạn này

## 1. Mục tiêu

Siết dữ liệu ở tầng MongoDB và chặn ghi đè do request cũ:

1. Mọi collection nghiệp vụ có `$jsonSchema` validator chạy ở `validationLevel: strict`,
   `validationAction: error`.
2. Mọi mutation có ngữ nghĩa cập nhật đều gửi `expectedVersion`; server chỉ ghi khi
   version khớp, ngược lại trả `409 VERSION_CONFLICT`.
3. Item sync chạy trong transaction, all-or-nothing, kể cả xóa note.
4. Web gửi version thật và có hành vi rõ ràng khi conflict: refetch/reload, không im lặng
   ghi đè.

Sau Phase 2B, dữ liệu Phase 1 và 2A vẫn giữ nguyên `_id`, nội dung, `createdAt` và version
hiện có; migration 002 chỉ thêm validator, không backfill lại document.

## 2. Quyết định đã chốt

1. **Validator chỉ áp cho document đã lưu**, không thay thế zod ở biên API. Zod kiểm tra
   request; `$jsonSchema` là chốt chặn cuối nếu code hoặc script ghi sai.
2. Dùng `additionalProperties: false` cho cả document và object con đã biết đủ trường.
   Thêm field mới sau này phải đi kèm migration sửa validator.
3. `version` là số nguyên dương, bắt đầu từ 1; mỗi mutation làm thay đổi document tăng
   đúng 1. Xóa document không tăng version.
4. Board version tăng khi đổi tên **và** khi membership thay đổi (accept invitation).
   Board là aggregate root của member list.
5. Request mutation bắt buộc gửi version:
   - Đổi tên board: `expectedVersion`.
   - Move task: `expectedVersion`.
   - Promote: `expectedItemVersion`.
   - Sync item: `expectedVersion` trên từng item; item mới gửi `0`.
6. Sync item dùng danh sách xóa tường minh `deleted[]`. Item không có trong `items` và
   không có trong `deleted` thì giữ nguyên. Đây là thay đổi có chủ đích so với Phase 1
   (trước đây payload là toàn bộ document và item vắng mặt bị xóa).
7. Conflict dùng một mã chung `VERSION_CONFLICT`, HTTP 409, `details.currentVersion`;
   sync có thêm `details.shapeId` khi xác định được item.
8. Item sync là một transaction `snapshot` + `majority`; kiểm tra toàn bộ version trước
   khi ghi; bất kỳ item nào stale thì không item nào bị ghi.
9. Xóa item đã promote bị bỏ qua (giữ hành vi Phase 1: note đã promote không bị xóa).
10. Client không tự merge version. Với board/task/promote/rename, conflict làm reload
    workspace. Với whiteboard sync, client refetch version, cập nhật map version và thử
    lại đúng một lần; conflict lần hai hiện lỗi.

## 3. Hiện trạng trước 2B

- `boards`, `items`, `tasks`, `users`, `invitations` chưa có validator.
- `version` đã tồn tại trên board/item/task nhưng chỉ để hiển thị; chưa request nào gửi
  expected version.
- `syncItems` đang `bulkWrite` ngoài transaction và xóa mọi note chưa promote vắng mặt
  trong payload.
- `renameBoard`, `moveTask`, `promoteItem` cập nhật không kiểm tra version.
- `acceptInvitation` thêm member nhưng không tăng board version.
- Database ứng dụng đang ở migration `001-phase-2a`, có 1 board, 2 item, 2 task, 2 user.

## 4. Phạm vi

### Có trong 2B

- File validator dùng chung và migration `002-phase-2b`.
- `collMod` idempotent cho collection đã tồn tại; `createCollection` nếu chưa có.
- Startup kiểm tra migration mới nhất là `002-phase-2b`.
- Contract `VERSION_CONFLICT` và helper `versionConflict`.
- `expectedVersion` cho board rename, task move, promote, item sync.
- `deleted[]` cho item sync.
- Transaction cho item sync.
- Tăng board version khi accept invitation.
- Cập nhật toàn bộ test API cũ theo payload mới.
- Test validator bằng insert sai kiểu raw; test stale/concurrent cho từng mutation.
- Web gửi version và xử lý 409.
- Backup, rehearsal trên bản copy, áp migration thật, kiểm tra browser.
- Tài liệu phase, session log, MongoDB notes, README, git workflow.

### Không có trong 2B

- Realtime/Change Streams và CRDT.
- Demote, batch promote, voting, report.
- Refresh token, phân quyền mới, xóa member.
- Migration dữ liệu ngoài validator.
- Merge `release/v0.2` vào `main` hoặc bump version `0.2.0`.

## 5. Thiết kế `$jsonSchema`

### 5.1. Quy tắc chung

- `bsonType: 'object'`, `additionalProperties: false`, liệt kê `_id` trong `properties`.
- `required` chứa toàn bộ field model luôn ghi, kể cả field nullable (giá trị `null` vẫn
  phải tồn tại).
- ObjectId nullable: `bsonType: ['objectId', 'null']`.
- Date nullable: `bsonType: ['date', 'null']`.
- Số: `bsonType: 'number'`; `version` có `minimum: 1`; kích thước có `minimum: 0`.
- Chuỗi có giới hạn theo model/contract: board name 80, task title 200, item content
  10.000, shapeId 200, tldrawIndex 100.
- Object con (`position`, `size`, `settings`, `columns[]`, `members[]`, `votes[]`,
  `origin`) có `required` và `additionalProperties: false` riêng.
- `origin` dùng `anyOf: [{ bsonType: 'null' }, { bsonType: 'object', ... }]` để vừa cho
  phép null vừa kiểm tra object.
- `schema_migrations` không có validator vì là metadata của migration runner.

### 5.2. Collection và field bắt buộc

| Collection | Field bắt buộc |
| --- | --- |
| `users` | `email`, `emailNormalized`, `name`, `passwordHash`, `createdAt`, `updatedAt` |
| `boards` | `name`, `ownerId`, `members`, `columns`, `settings`, `version`, `createdAt`, `updatedAt` |
| `items` | `boardId`, `shapeId`, `type`, `content`, `style`, `props`, `position`, `size`, `rotation`, `tldrawIndex`, `parentFrameId`, `authorId`, `votes`, `promotedTaskId`, `version`, `createdAt`, `updatedAt` |
| `tasks` | `boardId`, `columnId`, `order`, `title`, `description`, `assigneeId`, `labels`, `priority`, `dueDate`, `lifecycle`, `sourceItemId`, `origin`, `version`, `createdBy`, `createdAt`, `updatedAt` |
| `invitations` | `boardId`, `emailNormalized`, `tokenHash`, `role`, `createdBy`, `expiresAt`, `usedAt`, `createdAt`, `updatedAt` |

Enum giữ đúng model hiện tại:

- `boards.members[].role`: `owner`, `member`.
- `items.type`: `note`.
- `tasks.priority`: `low`, `medium`, `high`, `urgent`.
- `tasks.lifecycle`: `active`, `demoted` (model đã có cho tương lai).
- `invitations.role`: `member`.
- `invitations.tokenHash`: chuỗi hex 64 ký tự.

### 5.3. Migration 002

```text
apps/api/src/db/
  collection-validators.ts      # định nghĩa validator
  migrations/002-phase-2b.ts    # áp validator
  migration-runner.ts           # thêm 002, export LATEST_MIGRATION_NAME
```

- Nếu collection chưa tồn tại: `createCollection(name, { validator, validationLevel:
  'strict', validationAction: 'error' })`.
- Nếu đã tồn tại: `collMod` với cùng validator và level/action.
- Migration ghi `schema_migrations._id = '002-phase-2b'` sau khi áp xong.
- Chạy lại migration không đổi dữ liệu và không lỗi.
- API startup dùng `LATEST_MIGRATION_NAME`; database chỉ có 001 sẽ từ chối serve.

## 6. Ngữ nghĩa expectedVersion

### 6.1. Bảng mutation

| Endpoint | Field version | Filter ghi | Conflict |
| --- | --- | --- | --- |
| `PATCH /boards/:id` | `expectedVersion` (> 0) | `_id`, `version` | 409 `VERSION_CONFLICT` |
| `PATCH /boards/:id/tasks/:taskId` | `expectedVersion` (> 0) | `_id`, `boardId`, `lifecycle`, `version` | 409 `VERSION_CONFLICT` |
| `POST /boards/:id/items/:itemId/promote` | `expectedItemVersion` (> 0) | `_id`, `boardId`, `promotedTaskId: null`, `version` | 409 `VERSION_CONFLICT` |
| `PUT /boards/:id/items` | `expectedVersion` từng item (>= 0) | `_id`, `version`; item mới `boardId`, `shapeId`, `version: 0` + upsert | 409 `VERSION_CONFLICT` kèm `shapeId` |

Thứ tự kiểm tra:

1. Quyền và tồn tại tài nguyên (404/403).
2. Dữ liệu request hợp lệ theo zod (422), gồm cột đích tồn tại.
3. Version (409).
4. Trạng thái nghiệp vụ, ví dụ item đã promote (`ALREADY_PROMOTED`).

Riêng promote: nếu version khớp nhưng item đã promote thì trả `ALREADY_PROMOTED`; nếu
version stale thì trả `VERSION_CONFLICT` trước.

### 6.2. Conflict response

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Dữ liệu đã thay đổi, vui lòng tải lại",
    "details": { "currentVersion": 4 }
  },
  "meta": { "requestId": "..." }
}
```

Với sync item, `details` có thêm `shapeId`:

```json
{ "currentVersion": 2, "shapeId": "shape:abc" }
```

Contract:

```ts
export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT' as const;
export const versionConflictDetailsSchema = z.object({
  currentVersion: z.number().int().nonnegative(),
  shapeId: z.string().min(1).optional(),
});
```

### 6.3. Board version và membership

- `createBoard`: version 1.
- `renameBoard`: `$inc: { version: 1 }`.
- `acceptInvitation` thêm member: `$inc: { version: 1 }`.
- Accept lặp lại của user đã là member: không sửa board, không tăng version.
- Tạo invitation không sửa board, không tăng version.

## 7. Item sync trong transaction

### 7.1. Request

```ts
{
  items: Array<{
    shapeId: string;
    type: 'note';
    content: string;
    style: Record<string, unknown>;
    props: Record<string, unknown>;
    position: { x: number; y: number };
    size: { w: number; h: number };
    rotation: number;
    tldrawIndex: string;
    parentFrameId: null;
    expectedVersion: number; // 0 nếu client tin đây là item mới
  }>;
  deleted: Array<{
    shapeId: string;
    expectedVersion: number; // version client đã thấy
  }>;
}
```

- `items` và `deleted` mỗi mảng tối đa 200.
- `shapeId` không được lặp trong toàn bộ request; vi phạm trả 422.
- `deleted` mặc định `[]` nếu client cũ không gửi, nhưng web mới luôn gửi.

### 7.2. Thuật toán

1. Mở transaction `readConcern: snapshot`, `writeConcern: majority + journal`,
   `readPreference: primary`.
2. Đọc tất cả item hiện có của board theo union `shapeId` trong `items` và `deleted`.
3. Với từng item trong `items`:
   - Có trong DB: `expectedVersion` phải bằng `version`; nếu không, 409 kèm shapeId.
   - Không có trong DB: `expectedVersion` phải bằng `0`; nếu không, 409 với
     `currentVersion: 0`.
4. Với từng entry trong `deleted`:
   - Không tồn tại: bỏ qua (idempotent).
   - Đã promote: bỏ qua, không xóa.
   - Chưa promote: `expectedVersion` phải bằng `version`; nếu không, 409.
5. Ghi:
   - Item mới: upsert với filter `{ boardId, shapeId, version: 0 }`, `$inc version: 1`,
     `$setOnInsert` author/votes/promotedTaskId/createdAt.
   - Item cũ: update filter `{ _id, version: expectedVersion }`, `$inc version: 1`.
   - Xóa: delete filter `{ _id, version: expectedVersion }`.
6. Trả toàn bộ item note của board, sắp xếp `createdAt`, `_id`.
7. Nếu transaction trả `null`: 503 `TRANSACTION_OUTCOME_UNKNOWN`.
8. Nếu gặp duplicate key khi hai client cùng tạo một shapeId: đọc item hiện tại ngoài
   transaction và trả 409 `VERSION_CONFLICT` kèm `currentVersion` thực.

Mongoose `withTransaction` tự retry khi gặp write conflict; lần retry đọc snapshot mới
nên version stale sẽ thành 409, không âm thầm ghi đè.

### 7.3. Tại sao xóa tường minh

Với nhiều thành viên, payload toàn bộ document khiến client cũ xóa note do người khác
vừa tạo mà client chưa từng thấy. `deleted[]` chỉ xóa đúng shape client đã biết và đã
xóa; item lạ không bị đụng tới. Server vẫn kiểm tra version của từng entry xóa.

## 8. Hành vi web

### 8.1. API client

- `renameBoard(boardId, name, expectedVersion)`.
- `moveTask(boardId, taskId, { columnId, expectedVersion })`.
- `promoteItem(boardId, itemId, { columnId, assignToMe, expectedItemVersion })`.
- `syncItems(boardId, items, deleted)`; gửi `{ items, deleted }`.
- Helper `isVersionConflict(error)` để nhận diện 409.

### 8.2. Board workspace

- Move task: lấy `task.version` từ task đang kéo; gửi kèm.
- Promote: lấy `promoteTarget.version`; gửi `expectedItemVersion`.
- Rename: dialog gửi `board.version`.
- Khi bất kỳ thao tác nào nhận 409 `VERSION_CONFLICT`:
  - Đóng dialog/drag state liên quan.
  - Hiện notice "Board vừa thay đổi từ tab/người khác. Đã tải lại dữ liệu."
  - Gọi `loadWorkspace()` để lấy board/items/tasks mới; whiteboard remount theo dữ liệu
    mới.
- Lỗi khác giữ thông báo hiện tại.

### 8.3. Whiteboard

- Giữ `knownItemsRef: Map<shapeId, { version, promotedTaskId }>` khởi tạo từ
  `initialItems`.
- Cập nhật map khi prop `items` đổi, nhưng chỉ cho shape đã có trong map và chỉ khi
  version mới không nhỏ hơn version đang biết. Không tự thêm note lạ từ server vào map
  (tránh lần sync sau xóa note của client khác).
- Payload item: `expectedVersion = knownItemsRef.get(shapeId)?.version ?? 0`.
- `deleted`: các entry đã biết, chưa promote, không còn shape trên canvas.
- Trên 409:
  1. Gọi `getItems(boardId)` để lấy version mới.
  2. Cập nhật map cho các shapeId có trong payload/deleted.
  3. Nếu một item cũ (expectedVersion > 0) biến mất trên server, không retry; báo lỗi.
  4. Retry đúng một lần với version mới.
  5. Retry thành công: cập nhật map theo kết quả, hiện notice đã đồng bộ lại.
  6. Retry thất bại: hiện lỗi, giữ save state `error`.
- Sau sync thành công: chỉ cập nhật map cho shape đang có trên canvas; xóa entry đã xóa
  thành công; giữ entry promoted không còn trên canvas.

### 8.4. Kanban và dialog

- `KanbanBoard` truyền `expectedVersion` của task khi drop.
- `RenameBoardDialog` nhận `onConflict` để workspace đóng dialog và reload.
- `PromoteDialog` giữ nguyên API `onConfirm`; workspace xử lý conflict trước khi lỗi tới
  dialog.

## 9. Migration, backup và rehearsal

Trình tự bắt buộc:

1. Backup database `nextask` ra `backups/nextask-before-2b-2026-10-28.gz`; `gzip -t`.
2. Restore backup vào database `nextask_2b_rehearsal`.
3. Chạy migration 002 trên rehearsal.
4. Kiểm tra:
   - `schema_migrations` có `002-phase-2b`.
   - Số lượng board/item/task/user/invitation bằng bản gốc.
   - `_id`, `content`, `createdAt`, `version` của item/task mẫu không đổi.
   - Validator hiện diện trên cả 5 collection.
   - Chạy update no-op bằng aggregation pipeline trên từng collection để MongoDB kiểm
     tra toàn bộ document hiện có với validator; không lỗi 121.
5. Chỉ khi rehearsal đạt: áp migration lên database `nextask`.
6. Kiểm tra lại cùng bộ tiêu chí trên database thật.
7. Giữ backup; drop database rehearsal sau khi xác nhận.

Nếu document cũ không hợp lệ, dừng lại, bổ sung migration backfill có kiểm soát; không
nới validator để che dữ liệu sai.

## 10. Test

### API

- Validator:
  - Cả 5 collection có validator strict/error.
  - Raw insert thiếu field hoặc sai enum/kiểu bị lỗi code 121.
  - App write hợp lệ vẫn chạy (các test cũ).
- Migration:
  - 002 idempotent, giữ version dữ liệu cũ.
  - Startup check nhận 002.
- Board/task:
  - Rename đúng version tăng 1; stale trả 409 `currentVersion`.
  - Move đúng version tăng 1; stale 409; hai move đồng thời một thành công một 409.
  - Move cùng cột với version đúng trả 200, không tăng version.
- Promote:
  - Stale `expectedItemVersion` trả 409, không tạo task.
  - Version đúng nhưng đã promote trả `ALREADY_PROMOTED`.
  - Hai promote đồng thời chỉ một task.
- Item sync:
  - Item mới phải `expectedVersion: 0`; sai trả 409.
  - Một item stale làm toàn bộ request không ghi (kể cả item hợp lệ khác).
  - Xóa đúng version; xóa stale 409; xóa item promoted bị bỏ qua.
  - Hai sync đồng thời trên cùng item một thành công một 409.
  - ShapeId lặp giữa `items`/`deleted` trả 422.
- Invitation:
  - Accept làm board version tăng 1; accept lặp không tăng.

### Web

- Typecheck.
- Browser:
  - Golden path tạo note, promote, move, reload.
  - Hai tab: tab B đổi tên board; tab A đổi tên với version cũ → notice reload, tab A
    thấy tên mới.
  - Hai tab: tab B move task; tab A move cùng task với version cũ → notice reload, task
    ở cột mới.
  - Whiteboard: gây conflict qua API giữa hai lần save; lần save kế tiếp của tab A phải
    refetch và lưu thành công, không hiện lỗi 500.

## 11. Tiêu chí chấp nhận

1. Migration 002 áp được trên bản rehearsal và database thật, giữ nguyên dữ liệu.
2. API startup từ chối database chỉ có 001.
3. Mọi raw insert sai bị MongoDB từ chối với code 121.
4. Tất cả mutation gửi version sai trả 409 `VERSION_CONFLICT` với `currentVersion`.
5. Không mutation nào ghi một phần khi sync có item stale.
6. Web gửi version ở cả bốn luồng và reload/refetch khi conflict.
7. Toàn bộ test API cũ và mới pass ba lần liên tiếp; typecheck, lint, format pass.
8. Docker stack healthy; browser kiểm chứng golden path và ít nhất hai tình huống
   conflict.
9. Feature merge vào `release/v0.2` bằng `--no-ff`; `main` không đổi.

## 12. Rủi ro và cách xử lý

- **Mongoose timestamps chèn field ngoài ý muốn**: validator liệt kê đủ
  `createdAt/updatedAt`, `versionKey: false` đã bật từ trước.
- **`additionalProperties: false` làm lộ field lạ trong dữ liệu cũ**: rehearsal no-op
  update phát hiện trước khi áp database thật.
- **Transaction retry của Mongoose**: không bắt riêng lỗi write conflict; để
  `withTransaction` retry, sau đó version check trả 409.
- **Duplicate key khi hai client tạo cùng shapeId**: bắt lỗi 11000 và đổi thành 409 kèm
  version hiện tại.
- **Mất chỉnh sửa cục bộ khi reload workspace**: chỉ xảy ra khi conflict; ưu tiên dữ
  liệu server và thông báo rõ thay vì ghi đè im lặng.
