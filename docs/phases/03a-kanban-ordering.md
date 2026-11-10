# Giai đoạn 3A - Kanban ordering, filter và index

- Trạng thái: Hoàn thành ngày 2026-11-10; đã merge vào `release/v0.3`
- Ngày lập: 2026-11-10
- Tiền đề: v0.2.0 đã phát hành tại `main` (`da0547a`), tag `v0.2.0`
- Kiến trúc: [../architecture.md](../architecture.md)
- Nhánh: `feat/phase-3a-kanban-ordering`, tạo từ `release/v0.3`, release tạo từ `main`
- Implementation plan: [2026-11-10-phase-3a-kanban-ordering.md](../superpowers/plans/2026-11-10-phase-3a-kanban-ordering.md)
- Phase 3B dự kiến: task detail edit, tạo task tay, quản lý cột, cursor pagination

## 1. Mục tiêu

Nâng Kanban từ danh sách task theo cột thành bảng có thứ tự thật sự:

1. Kéo thả task trong cùng cột và giữa các cột, chèn đúng vị trí.
2. Server tự sinh `order` bằng fractional indexing; client không gửi key.
3. Chỉ một document task bị ghi cho mỗi lần kéo thả, không cập nhật hàng loạt.
4. Lọc task phía server theo cột, người gán, priority, label và từ khóa.
5. Đảm bảo `(boardId, columnId, order)` duy nhất cho task active.
6. Đo `explain("executionStats")` cho các truy vấn Kanban và ghi lại kết quả thật.

Sau 3A, người dùng có thể sắp xếp lại thẻ và tìm task nhanh; task vẫn chỉ đọc, chưa sửa
nội dung.

## 2. Quyết định đã chốt

1. Chia Phase 3 thành 3A và 3B; tài liệu này chỉ là 3A.
2. 3A chưa có cursor pagination: `GET /tasks` trả tối đa 100 task kèm
   `meta.hasMore`. Cursor để 3B hoặc phase sau.
3. Thêm endpoint move riêng:
   `POST /boards/:boardId/tasks/:taskId/move`.
   `PATCH /tasks/:taskId` không còn là move; 3B sẽ dùng PATCH cho sửa task.
4. Client gửi `beforeTaskId` — task mốc để chèn trước. `null`/không gửi là chèn cuối
   cột. Server tự tính `order`.
5. Unique partial index `(boardId, columnId, order)` cho task active. Trùng key do
   đua request: service tính lại một lần; vẫn trùng trả `409 ORDER_CONFLICT`.
6. Filter server-side: `columnId`, `assigneeId`, `priority`, `labels`, `q`, `limit`.
7. 3A chưa có UI sửa label/assignee; label chỉ có ở API filter. Filter bar UI gồm
   search, assignee và priority.
8. Khi filter đang bật, tạm khóa kéo thả để tránh chèn sai tương quan với task bị ẩn.
9. Không bump version `package.json`; v0.3 chưa hoàn tất.
10. Không merge `release/v0.3` vào `main` cho tới khi v0.3 được duyệt.

## 3. Hiện trạng

- Kanban hiện chỉ đổi cột; task luôn được append cuối cột đích.
- `PATCH /tasks/:taskId` nhận `{ columnId, expectedVersion }` và đã có OCC.
- `tasks_kanban_order` là index thường `(boardId, columnId, order)`, partial active,
  chưa unique.
- `GET /tasks` trả toàn bộ task active, chưa lọc, chưa giới hạn.
- Task model có `assigneeId`, `labels`, `priority`, `dueDate`; UI chưa hiển thị đầy đủ.
- Dữ liệu ứng dụng hiện có 2 task, order không trùng trong cùng cột.

## 4. Phạm vi

### Có trong 3A

- Endpoint move mới với `beforeTaskId`.
- Thuật toán chèn đầu/giữa/cuối và di chuyển cột.
- Unique index order active; retry một lần và lỗi `ORDER_CONFLICT`.
- Filter task list phía server và `meta.hasMore`.
- Index cho assignee, priority, labels; giữ index order cho Kanban.
- Migration `003-phase-3a`: backfill order trùng (nếu có), đổi index order sang unique,
  thêm index filter.
- Contract query/filter và response list mới.
- UI filter bar; kéo thả trong cột và giữa cột; khóa kéo thả khi filter bật.
- Cập nhật web/tests từ `PATCH` move sang `POST /move`.
- Đo explain và ghi vào `docs/mongodb-notes.md`.
- Test API, migration, browser, full gate.

### Không có trong 3A

- Sửa task, tạo task tay, đổi assignee/label/priority/due date.
- Quản lý cột (thêm/đổi tên/xóa/sắp cột).
- Label filter UI; chỉ có API.
- Cursor pagination; chỉ `limit` + `hasMore`.
- Text index cho `q`; chỉ thêm nếu explain chứng minh cần.
- Realtime, demote, batch, undo, vote, report.
- Đổi `items`, promote hoặc whiteboard sync.

## 5. Endpoint và contract

### 5.1. Move task

```http
POST /api/v1/boards/:boardId/tasks/:taskId/move
```

Request:

```ts
{
  columnId: string;
  beforeTaskId?: string | null; // null/không gửi = cuối cột
  expectedVersion: number;      // > 0
}
```

Contract:

```ts
export const moveTaskRequestSchema = z.object({
  columnId: z.string().min(1),
  beforeTaskId: objectIdSchema.nullable().default(null),
  expectedVersion: z.number().int().positive(),
});
```

- `beforeTaskId` là ObjectId hợp lệ hoặc `null`.
- Task mốc phải là task active cùng board và cùng cột đích.
- `beforeTaskId === taskId` trả 422.
- Response 200: task DTO sau khi move.
- Quyền: Member và Owner đều được move; board access middleware giữ nguyên.

`PATCH /tasks/:taskId` không còn route move. Toàn bộ test/web 2B chuyển sang POST.
3B sẽ thêm `PATCH` cho sửa task.

### 5.2. Danh sách task

```http
GET /api/v1/boards/:boardId/tasks?columnId=&assigneeId=&priority=&labels=&q=&limit=
```

| Tham số | Kiểu | Quy tắc |
| --- | --- | --- |
| `columnId` | string | 1–50 ký tự; phải là cột của board nếu có |
| `assigneeId` | ObjectId hoặc `none` | `none` lọc task chưa gán |
| `priority` | `low\|medium\|high\|urgent` | enum |
| `labels` | string | comma-separated, tối đa 10 label, mỗi label 1–50 ký tự |
| `q` | string | trim, tối đa 100 ký tự; tìm title/description |
| `limit` | số | 1–100, mặc định 100 |

- Query sai kiểu/enum/độ dài trả 422 `VALIDATION_ERROR`.
- `labels` dùng `$all`: task phải có đủ các label được chọn.
- `assigneeId=none` map thành `assigneeId: null`.
- `q` được escape regex, so khớp case-insensitive trên `title` hoặc `description`.
- Không nhận `$where`, object lồng hoặc raw query từ client.
- Sort cố định `{ columnId: 1, order: 1, _id: 1 }`.
- Response `data` tối đa `limit`; `meta.hasMore` cho biết còn task khớp filter.

Contract mới:

```ts
export const taskListQuerySchema = z.object({
  columnId: z.string().min(1).max(50).optional(),
  assigneeId: z.union([objectIdSchema, z.literal('none')]).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  labels: z.string().max(500).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const tasksListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema.extend({ hasMore: z.boolean() }),
});
```

### 5.3. Mã lỗi mới

Thêm `ORDER_CONFLICT` (HTTP 409):

```json
{
  "error": {
    "code": "ORDER_CONFLICT",
    "message": "Vị trí vừa thay đổi, vui lòng tải lại",
    "details": { "columnId": "todo" }
  },
  "meta": { "requestId": "..." }
}
```

- `VERSION_CONFLICT` vẫn dùng khi version task stale.
- `ORDER_CONFLICT` chỉ dùng khi đã retry một lần mà order vẫn trùng.
- Client xử lý cả hai bằng cách reload task/workspace và hiện notice.

## 6. Thuật toán move

1. Board access và validate `columnId` thuộc board; sai trả 422.
2. Tìm task active theo `_id`, `boardId`; không có trả 404.
3. Nếu `task.version !== expectedVersion` trả 409 `VERSION_CONFLICT`.
4. Resolve task mốc:
   - `beforeTaskId` null/không gửi: mốc cuối cột.
   - Có giá trị: ObjectId hợp lệ, khác `taskId`; tìm task active cùng board và cột đích.
     Không có trả 422.
5. Tìm task đứng trước vị trí chèn:
   - Chèn cuối: task active cuối cột đích, loại trừ chính task đang move.
   - Chèn trước mốc: task active có `order` nhỏ hơn order của mốc, loại trừ task đang
     move; sắp xếp giảm dần.
6. Sinh `order = generateKeyBetween(prev?.order ?? null, before?.order ?? null)`.
7. Nếu task đang ở đúng cột và `order` tính ra bằng `order` hiện tại: trả task, không
   tăng version (no-op).
8. Update một document:
   filter `{ _id, boardId, lifecycle: 'active', version: expectedVersion }`,
   `$set: { columnId, order }`, `$inc: { version: 1 }`.
9. Nếu update không khớp: đọc task hiện tại; không có trả 404; có trả 409
   `VERSION_CONFLICT` kèm `currentVersion`.
10. Nếu gặp duplicate key trên index order: chạy lại bước 3–8 đúng một lần với dữ liệu
    mới. Nếu vẫn duplicate: 409 `ORDER_CONFLICT`.
11. Trả task sau update.

### 6.1. Tính đúng đắn

- Không cập nhật các task khác; chỉ task được kéo bị ghi.
- Thứ tự đọc là `order` tăng dần, tie-breaker `_id` tăng dần.
- Hai client move cùng task: version filter bảo đảm một request thắng.
- Hai client chèn hai task khác nhau vào cùng vị trí: unique index bảo đảm không có hai
  order trùng; request thua retry hoặc nhận 409.
- Fractional index có thể dài dần; 3A chưa rebalance, chấp nhận giới hạn thực tế của
  `fractional-indexing`.

## 7. Migration 003 và index

Tên migration: `003-phase-3a`. Server startup dùng `LATEST_MIGRATION_NAME =
MIGRATION_003_NAME`.

### 7.1. Backfill order trùng

- Quét task active sort `{ boardId: 1, columnId: 1, order: 1, _id: 1 }`.
- Trong mỗi cặp `(boardId, columnId)`, nếu order trùng:
  - Giữ task đầu theo `_id`.
  - Các task sau sinh order mới bằng `generateKeyBetween(previousOrder, null)`.
  - Set `order`, `updatedAt = now`, `$inc version: 1`.
- Không đổi task không trùng.
- Backfill chạy trước khi tạo unique index.

### 7.2. Index

| Tên | Key | Loại |
| --- | --- | --- |
| `tasks_kanban_order` | `{ boardId: 1, columnId: 1, order: 1 }` | unique, partial `{ lifecycle: "active" }` |
| `tasks_board_assignee` | `{ boardId: 1, lifecycle: 1, assigneeId: 1, columnId: 1, order: 1 }` | partial `{ lifecycle: "active" }` |
| `tasks_board_priority` | `{ boardId: 1, lifecycle: 1, priority: 1, columnId: 1, order: 1 }` | partial `{ lifecycle: "active" }` |
| `tasks_board_labels` | `{ boardId: 1, lifecycle: 1, labels: 1, columnId: 1, order: 1 }` | partial `{ lifecycle: "active" }`, multikey |

- Index `tasks_kanban_order` cũ (không unique) phải drop trước khi tạo lại.
- Migration idempotent: kiểm tra index tồn tại/khác options thì drop và tạo lại.
- Không đổi các index `uniq_active_task_per_item`, `tasks_board_created` và index khác.
- Migration test chạy trên database riêng, có fixture task order trùng.

### 7.3. Vận hành migration

1. Backup `nextask` trước khi chạy 003, ví dụ
   `backups/nextask-before-3a-2026-11-10.gz`; kiểm tra `gzip -t`.
2. Restore vào database rehearsal riêng; chạy migration 003 trên rehearsal.
3. Kiểm tra:
   - `schema_migrations` có `003-phase-3a`.
   - Số task, `_id`, nội dung và version của task không trùng order không đổi.
   - Task bị backfill order có version tăng đúng 1.
   - Unique index và 3 index filter tồn tại.
4. Chỉ sau rehearsal mới áp lên `nextask`; kiểm tra lại cùng tiêu chí.
5. Giữ backup; drop database rehearsal sau xác nhận.

## 8. Filter và hiệu năng

### 8.1. Query

```ts
const filter = {
  boardId: board._id,
  lifecycle: 'active',
  ...(columnId ? { columnId } : {}),
  ...(assigneeId === 'none'
    ? { assigneeId: null }
    : assigneeId
      ? { assigneeId: new Types.ObjectId(assigneeId) }
      : {}),
  ...(priority ? { priority } : {}),
  ...(labels.length > 0 ? { labels: { $all: labels } } : {}),
  ...(q ? { $or: [{ title: regex }, { description: regex }] } : {}),
};
```

- Fetch `limit + 1`, trả `limit`, `hasMore = rows.length > limit`.
- Không dùng offset.
- Không dùng `$where`, `$expr` từ input.
- Regex escape toàn bộ ký tự đặc biệt; giới hạn 100 ký tự.
- `q` rỗng sau trim thì bỏ qua.
- `labels` trim, bỏ rỗng, tối đa 10; label quá dài trả 422.

### 8.2. Explain

Sau migration, chạy `explain("executionStats")` cho:

1. Toàn bộ task active của board.
2. `assigneeId` cụ thể.
3. `priority` cụ thể.
4. `labels` một label.
5. `q` tìm theo text.

- Ghi `winningPlan`, `indexName`, `totalKeysExamined`, `totalDocsExamined`,
  `executionTimeMillis` vào `docs/mongodb-notes.md`.
- Nếu dữ liệu ứng dụng quá nhỏ để planner chọn index, seed database tạm
  `nextask_explain` với khoảng 1000 task hợp lệ, chạy explain, ghi kết quả rồi drop.
- Không thêm text index trong 3A trừ khi explain cho thấy regex scan quá đắt và có số
  liệu chứng minh.

## 9. UI

### 9.1. Filter bar

- Ô search `q`, debounce 300 ms.
- Select assignee: thành viên board + `Chưa gán`.
- Select priority: tất cả + 4 mức.
- Nút `Xóa lọc`.
- Khi filter đổi: chỉ gọi lại `GET /tasks`, không reload board/items.
- Dùng request sequence counter để bỏ response cũ.
- Nếu `hasMore`: hiện dòng "Còn task chưa tải; thu hẹp bộ lọc để xem thêm."
- Label filter chỉ có API trong 3A; UI label để 3B.

### 9.2. Kéo thả

- Card draggable khi không có filter active.
- Thả lên một card: chèn trước card đó (`beforeTaskId = card._id`).
- Thả vào vùng trống cuối cột: append (`beforeTaskId = null`).
- Thả vào cột khác, vùng trống: chuyển cột + append.
- Hiển thị highlight card mốc và cột đích.
- Khi filter active: disable drag, hiện hint "Xóa bộ lọc để kéo thả."
- Gọi `moveTask` với `expectedVersion` của task đang kéo.
- Thành công: thay task trong state bằng response.
- `VERSION_CONFLICT` hoặc `ORDER_CONFLICT`: notice và reload workspace/tasks.
- Lỗi khác: giữ notice hiện tại.

### 9.3. Hiển thị card

- Giữ title, priority, nguồn note.
- Hiển thị thêm label (nếu có), assignee, due date.
- Không mở form sửa task trong 3A.

## 10. Test

### API

- Move:
  - Chèn đầu, giữa, cuối trong cùng cột; order tăng dần đúng.
  - Chuyển cột sang cột trống và cột có task; append.
  - `beforeTaskId` sai ObjectId, sai cột, task không tồn tại, bằng chính task → 422.
  - Stale `expectedVersion` → 409 `VERSION_CONFLICT`.
  - Move cùng vị trí hiện tại → 200, version không đổi.
  - Unique index: raw insert order trùng bị 11000; service không tạo order trùng.
  - Hai move đồng thời hai task vào cùng mốc: không có order trùng; kết quả
    `[200, 200]` hoặc `[200, 409 ORDER_CONFLICT]`.
- Filter:
  - `columnId`, `assigneeId`, `assigneeId=none`, `priority`, `labels` ($all), `q`
    case-insensitive và escape ký tự regex.
  - `limit` + `hasMore`; limit > 100 hoặc 0 → 422.
  - Query lạ/không hợp lệ → 422.
- Migration:
  - Backfill order trùng, version tăng cho task bị đổi.
  - Index order unique partial; index filter tồn tại.
  - Idempotent, dữ liệu không trùng giữ nguyên.
- Regression:
  - Toàn bộ test 2A/2B pass sau khi đổi move sang POST.
  - Item sync, promote, membership không đổi.

### Web

- Typecheck/build.
- Browser:
  - Kéo task cuối lên đầu cột, reload giữ thứ tự.
  - Kéo task sang cột khác, thả lên card mốc; reload đúng vị trí.
  - Filter search, assignee, priority; số lượng card đúng.
  - Filter active: drag bị khóa.
  - Conflict move (client thứ hai qua fetch): 409 và reload.
  - Không có lỗi console/500.

### Explain

- Chạy 5 truy vấn ở mục 8.2; ghi kết quả thật vào `docs/mongodb-notes.md`.
- Kiểm tra index bằng `db.tasks.getIndexes()` trên app DB và test DB.

## 11. Tiêu chí chấp nhận

1. Kéo thả chèn đúng đầu/giữa/cuối và giữa cột; chỉ một task bị ghi mỗi lần.
2. Unique index order active tồn tại; không thể có hai active task cùng
   `(boardId, columnId, order)`.
3. Hai client đua vị trí không tạo order trùng; request thua retry hoặc nhận
   `ORDER_CONFLICT`.
4. Filter server-side đúng semantics, escape regex, limit 100 và `hasMore`.
5. Migration 003 áp thành công trên rehearsal và database thật; dữ liệu không trùng
   order giữ nguyên.
6. Explain của 5 truy vấn được ghi lại; index filter tồn tại.
7. Web kéo thả/filter hoạt động; conflict reload; filter active khóa drag.
8. Typecheck, lint, format pass; full suite ba lần; Docker healthy.
9. Feature merge vào `release/v0.3`; `main` không đổi và tag `v0.2.0` không đổi.

## 12. Rủi ro và cách xử lý

- **Trùng fractional key**: unique index + retry một lần + `ORDER_CONFLICT`; không
  fallback sang ghi đè.
- **Index order cũ không unique**: migration drop và tạo lại; test fixture order trùng.
- **Backfill đổi version**: task bị đổi order tăng version để client cũ nhận conflict.
- **Explain trên dữ liệu nhỏ**: dùng database tạm 1000 task; ghi rõ nguồn số liệu.
- **Filter regex xấu**: escape, giới hạn độ dài, không dựng regex từ object.
- **Filter ẩn task gây kéo thả sai**: khóa drag khi filter active.
- **Bỏ PATCH move**: chỉ web/tests nội bộ gọi; cập nhật cùng commit.
- **Mất thứ tự khi client cũ**: version và unique index vẫn bảo vệ; client phải reload.

## 13. Phase 3B dự kiến

- `PATCH /tasks/:taskId` sửa title, description, assignee, labels, priority, dueDate.
- `POST /tasks` tạo task tay.
- Owner quản lý cột: thêm, đổi tên, sắp xếp, xóa cột rỗng.
- UI task detail và form tạo task.
- Có thể bổ sung cursor pagination và text index nếu 3A/explain cho thấy cần.

## 14. Git và phát hành

- `release/v0.3` tạo từ `main` tại `da0547a`.
- Feature `feat/phase-3a-kanban-ordering` tạo từ `release/v0.3`.
- Migration 003 nằm trong feature; không bump version `0.3.0` giữa chừng.
- Sau khi 3A pass gate, merge feature vào `release/v0.3` bằng `--no-ff`.
- Chưa merge `release/v0.3` vào `main`; tag `v0.2.0` giữ nguyên.

## 15. Kết quả thực hiện

### Migration và dữ liệu

- Backup trước migration: `backups/nextask-before-3a-2026-11-10.gz`, 3.4 KB,
  `gzip -t` pass.
- Rehearsal `nextask_3a_rehearsal`: `applied: ["003-phase-3a"]`; counts và version
  không đổi; đã drop sau kiểm tra.
- App DB: `applied: ["003-phase-3a"]`; 1 board, 2 item, 2 task, 2 user; task version
  `4`, `4` giữ nguyên.
- Unique index `tasks_kanban_order` và 3 filter indexes tồn tại.
- Task tạm dùng cho browser drag đã xóa; không còn dữ liệu test trong app DB.

### API và web

- `POST /tasks/:taskId/move` nhận `beforeTaskId`; chèn đầu/giữa/cuối và cross-column.
- Fractional order do server sinh; unique index chặn trùng; stale version trả 409.
- `GET /tasks` filter `columnId`, `assigneeId`, `priority`, `labels`, `q`, `limit`;
  `meta.hasMore`.
- Web filter bar search/assignee/priority; drag trong cột và sang cột khác; drag bị khóa
  khi filter active.
- UI sort dùng so sánh chuỗi trực tiếp để khớp thứ tự binary MongoDB; sửa sau browser
  test với key `Zz`/`a0`.

### Kiểm chứng

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full API suite 16 file, 82 test, ba lần liên tiếp:
  - Lần 1: 11.51 s.
  - Lần 2: 11.45 s.
  - Lần 3: 11.47 s.
- Docker `mongo`, `api`, `web` healthy; health `0.2.0` (chưa bump v0.3).
- Explain 1000 task tạm:
  - assignee: 1 key/1 doc/0 ms.
  - priority: 250/250/2 ms.
  - labels: 250/250/2 ms.
  - all board: 1000/1000/9 ms.
  - `q` regex: 1000/1000/6 ms, trả 143.
- Browser: kéo task cuối lên đầu, reload giữ thứ tự; kéo về cuối; filter search và
  priority đúng; drag không phát sinh request khi filter bật; POST move 200.

### Ghi chú

- `fractional-indexing` chỉ nhận key hợp lệ dạng `a0`; fixture migration dùng `a0` cho
  cột `backlog`, không dùng `b0`.
- Mongoose 9 không export `FilterQuery`; service dùng type `Filter` từ driver MongoDB.
- Chưa có cursor pagination, text index, task edit/create hoặc column management.
- `release/v0.3` chưa merge `main`; tag `v0.2.0` giữ nguyên.
