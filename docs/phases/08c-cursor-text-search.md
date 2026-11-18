# Giai đoạn 8C - Cursor pagination và text index cho task

- Trạng thái: Draft chờ duyệt
- Ngày lập: 2026-11-18
- Tiền đề: Phase 8A/8B đã merge `release/v0.8` tại `89cc76c`; `main` và tag `v0.7` giữ nguyên
- Nhánh: `feat/phase-8c-cursor-text-search` từ `release/v0.8`
- Migration mới: `008-phase-8c`
- Không merge `main`, không bump `0.8.0`

## 1. Mục tiêu

1. `GET /boards/:boardId/tasks` hỗ trợ cursor keyset pagination, không dùng offset.
2. Client tải thêm trang, giữ kéo thả chỉ khi đã tải đủ task trong bộ lọc.
3. Thay tìm kiếm regex `q` bằng MongoDB text index trên title/description.
4. Index text dùng `default_language: "none"` để token tiếng Việt hoạt động ổn định.
5. Ghi lại explain của query text và query cursor; cập nhật tài liệu/README.
6. Không đổi Kanban ordering, promote/demote hay realtime ngoài phần reset trang.

## 2. Quyết định

1. `q` chuyển sang `$text` với `$language: "none"`; không còn substring/regex.
   Tìm kiếm theo token, không phân biệt hoa/thường, hỗ trợ cụm trong dấu nháy theo
   cú pháp MongoDB; chuỗi chỉ có ký tự đặc biệt như `C++` có thể không khớp.
2. Giữ `GET /tasks` và thêm `cursor`; response thêm `meta.nextCursor` bên cạnh `hasMore`.
3. Cursor là chuỗi base64url của JSON `{ columnId, order, id }`, không ký; server validate
   cấu trúc và trả `422 INVALID_CURSOR` nếu sai.
4. Sort cố định `{ columnId: 1, order: 1, _id: 1 }`; cursor dùng keyset `$or` để lấy
   trang kế tiếp, không offset.
5. `limit` giữ 1..100, mặc định 100; `nextCursor` chỉ có khi `hasMore = true`.
6. Client reset cursor khi filter đổi; cursor không gắn chữ ký filter nhưng UI không
   tái sử dụng cursor giữa các bộ lọc khác nhau.
7. Kéo thả bị khóa khi filter đang bật hoặc `hasMore = true`; khi tải hết trang thì
   mới cho kéo thả.
8. Mutation task (tạo/sửa/move/promote/batch/demote/undo) và realtime reset danh sách
   task về trang đầu để tránh trộn trang không nhất quán; các trang đã tải có thể mất.
9. Migration `008-phase-8c` tạo text index; không backfill, không đổi dữ liệu.
10. Không cursor cho items/activities/reports; không search trên labels/assignee.

## 3. API contract

`GET /api/v1/boards/:boardId/tasks`

Query hiện có giữ nguyên và thêm:

```ts
{
  columnId?: string;
  assigneeId?: string | 'none';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  labels?: string;       // comma-separated
  q?: string;            // max 100, $text token search
  limit?: number;        // 1..100, default 100
  cursor?: string;       // max 500, opaque base64url
}
```

Response:

```ts
{
  data: TaskDto[],
  meta: {
    requestId: string,
    hasMore: boolean,
    nextCursor: string | null,
  },
}
```

Lỗi mới: `422 INVALID_CURSOR` khi cursor không decode/validate được.

## 4. Cursor

Payload:

```ts
{
  columnId: string;  // cột của task cuối trang
  order: string;     // fractional order của task cuối trang
  id: string;        // ObjectId hex của task cuối trang
}
```

Điều kiện trang kế tiếp:

```ts
{
  $or: [
    { columnId: { $gt: cursor.columnId } },
    { columnId: cursor.columnId, order: { $gt: cursor.order } },
    {
      columnId: cursor.columnId,
      order: cursor.order,
      _id: { $gt: new Types.ObjectId(cursor.id) },
    },
  ],
}
```

- Ghép điều kiện cursor vào `$and` để không đè filter hiện có.
- Query giữ `$text` ở top-level khi có q; đã kiểm tra `$text` + `$and` hoạt động.
- `nextCursor` lấy từ task cuối cùng của trang đã cắt (không lấy task thừa dùng để
  phát hiện `hasMore`).
- Decode dùng zod/`taskCursorSchema`; sai JSON, sai ObjectId hoặc field thiếu đều 422.
- Cursor không đảm bảo snapshot cố định: task chèn/xóa giữa hai trang có thể làm thay
  đổi kết quả; không có duplicate trong dữ liệu không đổi.

## 5. Text index và migration 008

Index:

```ts
{
  key: { boardId: 1, lifecycle: 1, title: 'text', description: 'text' },
  name: 'tasks_board_text',
  default_language: 'none',
}
```

- Migration `008-phase-8c` gọi `createIndex` trên `tasks`.
- Không drop index cũ; index filter Kanban vẫn dùng khi không có q.
- `LATEST_MIGRATION_NAME` cập nhật `008-phase-8c`.
- Trước app DB: backup `backups/nextask-before-8c-YYYYMMDD-HHMMSS.gz`.
- Rehearsal database tạm: restore backup, áp migration 008, kiểm tra index và query
  text; drop DB tạm.
- Migration test: index `tasks_board_text` tồn tại, key đúng, `default_language: 'none'`.

## 6. Search semantics

- `q` rỗng hoặc chỉ khoảng trắng: bỏ filter text.
- `q` khác rỗng: `$text: { $search: q, $language: 'none' }`.
- Token search: `context` khớp `Context`, `CONTEXT`; `sẻ` khớp token `sẻ`.
- Nhiều token mặc định là OR theo MongoDB; cụm trong dấu nháy là phrase.
- Không còn `escapeRegex`; bỏ regex khỏi `listTasks`.
- Cập nhật test cũ `q: 'c++'` sang token có thật, ví dụ `q: 'urgent'`.
- README ghi rõ thay đổi semantics; không quảng cáo substring.

## 7. UI

- `getTasks(boardId, filters, cursor?)` trả `{ tasks, hasMore, nextCursor }`.
- State mới: `nextTaskCursor`, `loadingMore`.
- `loadTasks(filters, cursor = null)`:
  - không cursor: thay danh sách, reset cursor;
  - có cursor: gọi trang kế, append và dedupe theo `_id`;
  - request ID hiện có tiếp tục chống race.
- Filter đổi: reset cursor và tải trang đầu.
- `KanbanBoard` nhận `nextCursor`, `loadingMore`, `onLoadMore`.
- Hiển thị nút `Tải thêm` khi `hasMore`; disable khi đang tải.
- Drag bị khóa khi `filtersActive || hasMore`; hint:
  - filter bật: giữ `Xóa bộ lọc để kéo thả.`;
  - chỉ còn trang: `Tải hết task để kéo thả.`
- Realtime và mutation reset trang đầu như quyết định 8.
- Giữ sort hiện tại ở client; append không cần sort lại toàn bộ.

## 8. Test/acceptance

API integration với MongoDB replica set thật:

1. Tạo 5 task; `limit=2` trả 2 + `hasMore` + `nextCursor`; trang 2 trả 2; trang 3 trả 1;
   không duplicate, `nextCursor=null` ở trang cuối.
2. Cursor + filter `priority`, `labels`, `assigneeId`, `columnId` trả đúng tập.
3. Cursor + `q` token trả đúng trang, không duplicate.
4. Cursor sai định dạng/base64/ObjectId trả 422 `INVALID_CURSOR`.
5. `q` khớp title và description, không phân biệt hoa/thường; `q='urgent'` khớp
   `Daily C++ (urgent)`; `q='c++'` không khớp (semantics mới).
6. Explain query q dùng `TEXT_MATCH` index `tasks_board_text`.
7. Index test xác nhận `tasks_board_text` key và `default_language`.
8. Migration test áp 008 và index tồn tại.

Browser:

- Tạo board tạm với 120 task (script API hoặc Mongo fixture), mở Kanban.
- Trang đầu 100 task; bấm `Tải thêm`; đủ 120, nút biến mất, drag được.
- Filter đổi làm reset trang; hint filter vẫn hiển thị.
- Xóa board tạm sau kiểm tra.

Cổng:

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:web`.
- Full suite ba lần; `npm run test:e2e`.
- Docker health vẫn `0.7.0`.

## 9. Explain và tài liệu

Đo trên database tạm với 1000 task và index mới:

- Query `q='context'` không cursor: ghi index dùng, keys/docs/ms; dự kiến `TEXT_MATCH`
  `tasks_board_text` và SORT theo `columnId/order/_id`.
- Query cursor không q: ghi index filter hiện có và SORT.
- Ghi bảng explain vào `docs/mongodb-notes.md` mục 19.

## 10. Git

- Feature `feat/phase-8c-cursor-text-search` từ `release/v0.8`.
- Merge `--no-ff` sau gate; xóa feature; không merge `main`; không bump `0.8.0`;
  tag `v0.7` giữ nguyên; không push nếu người dùng chưa yêu cầu.

## 11. Rủi ro

- `q` đổi semantics: substring và ký tự đặc biệt không còn khớp; phải ghi rõ README.
- Text index + sort có thể dùng blocking sort; với dữ liệu lớn cần đo lại và cân nhắc
  index bổ sung hoặc giới hạn q.
- Cursor không ký filter; client phải reset khi filter đổi. Server vẫn an toàn vì
  luôn áp board/filter hiện tại.
- Chèn/xóa giữa hai trang có thể làm lệch kết quả; không dùng cursor cho báo cáo.
- Reset trang sau mutation/realtime làm mất các trang đã tải; chấp nhận để đúng dữ liệu.
- Index text tăng dung lượng/ghi; backup và rehearsal trước khi áp app DB.

## 12. Ngoài phạm vi

- Cursor cho items, activities, reports.
- Search labels/assignee/title nâng cao, highlight kết quả.
- Cursor có chữ ký hoặc snapshot isolation.
- Thay đổi Kanban ordering, promote/demote, realtime ngoài reset trang.
