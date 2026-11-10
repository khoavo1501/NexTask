# Giai đoạn 4 - Realtime Change Streams và presence

- Trạng thái: Hoàn thành; merge vào `release/v0.4` bằng `--no-ff` tại `b11b326`;
  release gate pass; chờ duyệt phát hành v0.4. Implementation plan:
  [2026-11-10-phase-4-realtime.md](../superpowers/plans/2026-11-10-phase-4-realtime.md)
- Ngày lập: 2026-11-10
- Tiền đề: v0.3.0 đã phát hành; tag `v0.3.0` tại `52840fe`
- Kiến trúc: [../architecture.md](../architecture.md)
- Phase 3A/3B: [03a-kanban-ordering.md](./03a-kanban-ordering.md), [03b-task-editing-columns.md](./03b-task-editing-columns.md)
- Nhánh: `feat/phase-4-realtime`, tạo từ `release/v0.4`, release tạo từ `main`
- Implementation plan: [2026-11-10-phase-4-realtime.md](../superpowers/plans/2026-11-10-phase-4-realtime.md)
- Không merge `release/v0.4` vào `main` trong phase này

## 1. Mục tiêu

Đưa thay đổi từ client khác đến board đang mở mà không cần reload:

1. Task move/create/edit từ client khác cập nhật Kanban và badge note ngay.
2. Item thay đổi từ client khác khiến whiteboard refetch snapshot; không live-merge
   tldraw/CRDT.
3. Socket.IO xác thực cookie, kiểm tra membership và room theo board.
4. Change Streams có resume token/checkpoint; watcher mới sau restart nhận được sự kiện
   còn trong oplog.
5. Presence: danh sách participant và cursor trong bộ nhớ, không persist MongoDB.
6. Client reconnect/resync tải lại snapshot để hội tụ; dedupe at-least-once event.

## 2. Quyết định đã chốt

1. Phase 4 dùng Change Streams + Socket.IO; polling không dùng.
2. Kanban/badge realtime; whiteboard chỉ refetch snapshot, **không** live-merge tldraw.
3. Watcher **per board, per collection** (`items`, `tasks`) để checkpoint resume độc lập.
4. Mỗi board watcher mở khi socket đầu tiên join, đóng sau grace 5 giây khi room trống.
5. Một API instance; presence/cursor trong bộ nhớ; không Redis adapter.
6. Event at-least-once; client dedupe `event.id` và cập nhật theo `version`.
7. Checkpoint lưu resume token sau khi emit; nếu mất oplog phát `board:resync`.
8. Bật pre/post images cho `items` và `tasks`; migration 004 tạo collection checkpoint
   và index.
9. Không đổi REST mutation API; Socket.IO dùng chung HTTP server.
10. Không bump version `0.4.0`; chưa merge `main`; tag `v0.3.0` giữ nguyên.

## 3. Hiện trạng

- API Express và Next.js chạy độc lập; Kanban chỉ cập nhật sau reload hoặc request của
  chính client.
- Chưa có Socket.IO, Change Streams, resume token hay presence.
- Board access đã có `findByMember`; auth cookie `nextask_session` đã có.
- `items`/`tasks` có `version`, `$jsonSchema`, transaction; chưa bật pre/post images.
- Chưa có collection `change_stream_checkpoints`.

## 4. Phạm vi

### Có trong Phase 4

- Thêm dependency `socket.io` và `socket.io-client` bản 4.8.4.
- Socket.IO server gắn vào HTTP server hiện tại; CORS credentials.
- Auth socket bằng cookie JWT; load user; từ chối khi thiếu/sai phiên.
- `board:join` kiểm tra membership; room `board:<boardId>`.
- Watcher per board cho `items` và `tasks`; pre/post images.
- Event envelope, event mapper cho item/task.
- Checkpoint collection, resume token, migration 004, bật pre/post images.
- Presence participant + cursor trong bộ nhớ.
- Client socket reconnect, join lại room, refetch snapshot khi reconnect/resync.
- Kanban/badge cập nhật live; item event refetch items/tasks và remount whiteboard.
- Test migration, checkpoint, change stream restart, socket auth/room/presence, browser.
- Backup/rehearsal migration 004; merge feature vào `release/v0.4`.

### Không có trong Phase 4

- Live-merge tldraw/CRDT hoặc xóa/khôi phục shape từ xa.
- Board rename/columns realtime event; board snapshot chỉ refetch khi resync/reconnect.
- Task delete (chưa có API) và demote/undo (Phase 5).
- Multi-instance Socket.IO adapter/Redis.
- Persist presence/cursor.
- Thay đổi REST mutation API hoặc schema task/item ngoài checkpoint/pre-post images.
- Cursor pagination/text index.

## 5. Kiến trúc realtime

```text
apps/api/src/
  realtime/
    realtime.server.ts       # gắn Socket.IO vào HTTP server
    socket-auth.ts           # cookie JWT -> user
    board-room.ts            # join/leave, membership, ref count
    board-watcher.ts         # watcher items/tasks cho một board
    change-stream.service.ts # mở Change Stream, pipeline, resume
    event-mapper.ts          # change -> envelope
    checkpoint.service.ts    # đọc/ghi change_stream_checkpoints
    presence.service.ts      # Map presence/cursor
```

### 5.1. Socket.IO

- Server tạo từ HTTP server trong `server.ts`; không tạo cổng riêng.
- `cors: { origin: env.CORS_ORIGIN, credentials: true }`.
- Handshake:
  - Đọc cookie `nextask_session` từ header.
  - Verify JWT bằng `verifySessionToken`.
  - Load user; gắn `socket.data.user`.
  - Thiếu/sai/hết hạn: emit `auth:error` rồi disconnect.
- Client kết nối với `withCredentials: true`, path mặc định `/socket.io`.

### 5.2. Join room

Client gửi:

```ts
socket.emit('board:join', { boardId }, (ack: { ok: true } | { ok: false; error: string }) => {});
```

Server:

1. Validate `boardId` ObjectId.
2. `findByMember(boardId, user._id)`; không phải member trả `{ ok:false, error:'NOT_FOUND' }`.
3. `socket.join('board:' + boardId)`.
4. Acquire board watcher (ref count +1).
5. Thêm presence; broadcast `presence:list` cho room.
6. Ack `{ ok:true }`.

- Một socket chỉ join một board trong v1; join board khác phải leave board cũ trước.
- Disconnect/leave: remove presence, release watcher; broadcast presence mới.

## 6. Change Streams và checkpoint

### 6.1. Watcher per board

- Key: `${boardId}:items` và `${boardId}:tasks`.
- `BoardWatcher` giữ ref count, `ChangeStream` cho từng collection, grace timer 5 giây.
- Ref count 0: giữ watcher trong grace; hết grace đóng stream và xóa watcher.
- Watcher mới mở:
  - Đọc checkpoint `{ boardId, collection }`.
  - Có token: `resumeAfter: token`.
  - Không có token: mở từ thời điểm hiện tại.
- Options:
  - `fullDocument: 'updateLookup'`.
  - `fullDocumentBeforeChange: 'whenAvailable'`.
- Pipeline:

```js
[
  {
    $match: {
      operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
      $or: [
        { 'fullDocument.boardId': boardId },
        { 'fullDocumentBeforeChange.boardId': boardId },
      ],
    },
  },
  {
    $project: {
      operationType: 1,
      fullDocument: 1,
      fullDocumentBeforeChange: 1,
      documentKey: 1,
      clusterTime: 1,
    },
  },
]
```

- `items`/`tasks` phải bật `changeStreamPreAndPostImages.enabled` để delete lọc được
  boardId và mapper có trạng thái trước.

### 6.2. Resume token và checkpoint

Collection mới:

```text
change_stream_checkpoints
{
  _id: ObjectId,
  boardId: ObjectId,
  collection: "items" | "tasks",
  token: object,        // BSON resume token
  updatedAt: Date
}
```

- Unique index `{ boardId: 1, collection: 1 }`.
- Sau khi emit event xong: upsert `{ boardId, collection }`, `$set: { token, updatedAt }`.
- Không ghi checkpoint trước khi emit; chấp nhận gửi lặp nếu crash giữa emit và ghi.
- Lỗi ghi checkpoint: log lỗi, tiếp tục stream; event sau sẽ cập nhật token.
- Token không resume được (`ChangeStreamHistoryLost`, code 286, hoặc lỗi tương đương):
  - Đóng stream cũ.
  - Mở stream mới không resume từ token.
  - Emit `board:resync` với reason `oplog_lost`.
  - Các event mới vẫn ghi checkpoint.
- Watcher error khác: log, đóng watcher, thử mở lại một lần với checkpoint; nếu vẫn
  lỗi, emit `board:resync` và đóng.

### 6.3. Migration 004

- Tạo collection `change_stream_checkpoints` nếu chưa có, validator strict/error:
  - `boardId`: objectId
  - `collection`: enum `items`, `tasks`
  - `token`: object hoặc binData
  - `updatedAt`: date
  - `additionalProperties: false`
- Unique index `{ boardId: 1, collection: 1 }` tên `change_stream_checkpoints_board_collection`.
- `collMod` `items` và `tasks` bật `changeStreamPreAndPostImages: { enabled: true }`.
- Không backfill dữ liệu.
- `MIGRATION_004_NAME = '004-phase-4'`; `LATEST_MIGRATION_NAME` cập nhật 004.
- Backup trước migration, rehearsal trên database copy, áp app DB, kiểm tra collection/
  index/pre-post images; giữ backup.

## 7. Event contract

Envelope chung:

```ts
export interface RealtimeEvent<T = unknown> {
  id: string;          // sha256 của resume token
  boardId: string;
  type:
    | 'item:created'
    | 'item:updated'
    | 'item:promoted'
    | 'item:demoted'
    | 'item:deleted'
    | 'task:created'
    | 'task:updated'
    | 'task:moved'
    | 'task:demoted'
    | 'board:resync';
  version: number;
  occurredAt: string;  // ISO
  payload: T;
}
```

Socket event name: `board:event` cho mọi envelope trừ `board:resync` cũng dùng cùng
event name với `type: 'board:resync'`.

Payload:

| Type | Payload |
| --- | --- |
| `item:created` | `{ item: ItemDto }` |
| `item:updated` | `{ item: ItemDto }` |
| `item:promoted` | `{ item: ItemDto; taskId: string }` |
| `item:demoted` | `{ item: ItemDto; taskId: string }` |
| `item:deleted` | `{ itemId: string }` |
| `task:created` | `{ task: TaskDto }` |
| `task:updated` | `{ task: TaskDto }` |
| `task:moved` | `{ task: TaskDto }` |
| `task:demoted` | `{ taskId: string; itemId: string | null }` |
| `board:resync` | `{ reason: 'oplog_lost' | 'watcher_error' }` |

### 7.1. Mapping

- `id = sha256(canonical(resumeToken))`; token lấy từ `change._id`.
- `occurredAt = change.clusterTime`.
- `boardId` lấy từ `fullDocument.boardId` hoặc `fullDocumentBeforeChange.boardId`.
- `version = fullDocument.version ?? 0`.
- Item:
  - insert → `item:created`.
  - delete → `item:deleted` với `documentKey._id`.
  - update: so `promotedTaskId` trước/sau:
    - null → ObjectId: `item:promoted` với taskId mới.
    - ObjectId → null: `item:demoted`.
    - còn lại: `item:updated`.
- Task:
  - insert → `task:created`.
  - update: nếu `columnId` đổi → `task:moved`; nếu `lifecycle` active → demoted
    → `task:demoted`; còn lại → `task:updated`.
- Không có `task:deleted` vì chưa có hard delete task.
- Bỏ qua event không xác định được boardId.

## 8. Presence

### 8.1. Server

- `Map<boardId, Map<socketId, PresenceEntry>>`.
- `PresenceEntry`:
  `{ socketId, userId, name, color, cursor: { x, y } | null, updatedAt }`.
- `color` chọn deterministic từ userId trong palette cố định.
- Join:
  - Thêm entry.
  - Broadcast `presence:list` toàn room.
- `presence:cursor` client gửi `{ x, y }` chuẩn hoá 0..1 theo khung whiteboard:
  - Validate số hữu hạn, 0 ≤ x,y ≤ 1; sai bỏ qua.
  - Server rate limit đơn giản: tối đa 30 lần/giây/socket; vượt bỏ qua.
  - Cập nhật entry; broadcast `presence:cursor` `{ socketId, userId, x, y }`.
- Disconnect/leave: xóa entry, broadcast `presence:list`.
- Không ghi MongoDB; restart API xóa toàn bộ presence.

### 8.2. Client

- Participant list trong header board: tên + màu.
- Cursor overlay trên whiteboard:
  - `Whiteboard` nhận `presence` và render cursor theo toạ độ chuẩn hoá.
  - Pointer move trên whiteboard gửi throttle 50 ms qua socket.
- Không gửi cursor khi tab hidden hoặc chưa join.
- Reconnect: presence list mới từ server.

## 9. Client realtime

### 9.1. Socket lifecycle

- Tạo client socket trong `BoardWorkspace` khi mount; disconnect khi unmount.
- `withCredentials: true`.
- Sau `connect`: emit `board:join`.
- Reconnect:
  - Emit `board:join` lại.
  - Gọi `loadWorkspace()` để lấy snapshot mới; hiện notice ngắn.
- `connect_error`/disconnect: hiện trạng thái "Mất kết nối realtime", REST vẫn dùng
  được; tự reconnect theo Socket.IO.

### 9.2. Xử lý event

- Dedupe `event.id` bằng `Set`, giới hạn 500 id gần nhất.
- Task event:
  - `task:created`: upsert task vào state.
  - `task:updated`/`task:moved`: thay task nếu `event.version >= task.version`;
    `task:moved` cập nhật cột/order; badge note tự đổi vì badge đọc tasks.
  - `task:demoted`: xóa task khỏi state Kanban.
- Item event:
  - `item:promoted`/`item:demoted`/`item:deleted`: refetch `items` + `tasks`, cập nhật
    state, tăng `whiteboardRevision` để remount Whiteboard.
  - `item:created`/`item:updated`: refetch `items` (và tasks nếu cần), tăng revision.
  - Không live-merge shape; remount đọc `initialItems` mới.
- `board:resync`: `loadWorkspace()`, notice.
- Nếu event version cũ hơn state hiện tại: bỏ qua.
- Không áp dụng event khi board đã unmount.

### 9.3. UI

- Badge note cập nhật khi task move từ client khác mà không reload.
- Header hiển thị participant realtime.
- Cursor peer overlay trên whiteboard.
- Notice khi resync/reconnect; lỗi socket không chặn thao tác REST.
- Không thay đổi các dialog task/column hiện có.

## 10. Test

### API/Realtime

- Migration 004:
  - Collection checkpoint + validator/index tồn tại.
  - `changeStreamPreAndPostImages.enabled` true cho items/tasks.
  - Latest schema 004; idempotent; backup/rehearsal data giữ nguyên.
- Checkpoint:
  - Lưu/đọc token; upsert theo board/collection.
  - Token hash event id ổn định.
- Change Stream:
  - Watcher nhận task create/move/update; event map đúng type/version.
  - Item promote/delete map đúng; task demote mapping.
  - Room A không nhận event board B.
  - Watcher stop → mutate → start lại với checkpoint → nhận event còn trong oplog.
  - Token giả/hết oplog → `board:resync` và watcher mở lại.
- Socket:
  - Không cookie/sai cookie bị từ chối.
  - Member join được; non-member ack lỗi.
  - Join/leave ref count watcher; grace đóng watcher.
  - Presence join/list/cursor/leave; cursor sai bị bỏ qua.
- Regression REST: full suite cũ pass.

### Web

- Typecheck/build.
- Browser:
  - Tab A board mở; client B (API/socket) move task; Kanban tab A tự đổi, badge note
    đổi không reload.
  - Presence list hiển thị client B; cursor B hiển thị trên whiteboard.
  - Client B sửa item; tab A refetch whiteboard, notice, không lỗi.
  - Reconnect socket: tab A tải snapshot; badge/kanban đúng.
  - Resync giả lập (xoá checkpoint/token) hiện notice và refetch.
  - Không có lỗi console/500.

### Vận hành

- Backup app DB trước 004; rehearsal; áp app; kiểm tra pre/post images/checkpoint.
- Docker API/web healthy; Socket.IO handshake qua `localhost:4000`.
- Không tạo tag; không merge main.

### Kết quả verification 2026-11-10

- Backup `backups/nextask-before-4-2026-11-10.gz` (gzip hợp lệ); restore rehearsal.
- Rehearsal và app DB áp `004-phase-4`; checkpoint có validator + unique index
  `change_stream_checkpoints_board_collection`; pre/post images bật cho `items`/`tasks`;
  counts trước/sau giữ nguyên 1 board, 2 item, 2 task.
- Docker migrate/api/web chạy; health `0.3.0`, Mongo `rs0` primary.
- Browser (tab owner đang mở, client thứ hai bằng `fetch` cùng cookie):
  - `POST /tasks` → Kanban tự thêm task ở Backlog, badge tổng task tăng, không reload.
  - `POST /tasks/:id/move` → task tự chuyển sang In Progress, không reload.
  - `PUT /items` → notice "Whiteboard vừa thay đổi...", tab gọi lại `GET /items` và
    `GET /tasks`, whiteboard remount, không lỗi 500.
  - Presence: dot online + chip participant; synthetic pointermove trong whiteboard
    phát cursor và overlay hiển thị ở 40%/60%.
- Dọn dữ liệu test: xóa task `Realtime E2E Task`; khôi phục nội dung note gốc
  (version 45).
- API không có log level 40/50 trong khoảng verification; checkpoint `items`/`tasks`
  của board được lưu.

## 11. Tiêu chí chấp nhận

1. Task move từ client khác cập nhật Kanban/badge trong tab đang mở.
2. Watcher restart với checkpoint nhận event còn trong oplog; token hỏng phát resync.
3. Member join room; non-member bị từ chối; event không rò room khác.
4. Presence join/leave/cursor hoạt động; restart xóa presence.
5. Item event khiến whiteboard refetch/remount; không live-merge tldraw.
6. Migration 004 áp thành công rehearsal/app; pre/post images bật; dữ liệu giữ nguyên.
7. Typecheck/lint/format pass; full suite ba lần; browser evidence.
8. Feature merge vào `release/v0.4`; `main` và tag `v0.3.0` không đổi.

## 12. Rủi ro và cách xử lý

- **Oplog cuốn**: resume token lỗi → `board:resync` + refetch snapshot; không giả vờ
  không mất event.
- **At-least-once**: client dedupe id và version guard; checkpoint sau emit.
- **Watcher leak**: ref count + grace + đóng stream; test room empty.
- **Quá nhiều cursor**: client throttle 50 ms, server giới hạn 30/s.
- **Change Stream lỗi tạm thời**: thử mở lại một lần với checkpoint; nếu không được
  resync.
- **Pre/post images chưa bật**: migration 004 bật; test collection option.
- **Whiteboard remount mất chỉnh sửa cục bộ**: item event từ client khác chấp nhận
  refetch; hiện notice; không CRDT.
- **Socket auth cookie**: dùng cookie HttpOnly; không nhận token từ query string.
- **Một instance**: restart mất presence; watcher mở lại khi có client; không hỗ trợ
  scale ngang.
- **Test flakiness**: dùng wait có timeout hợp lý cho change stream/socket, không nới
  timeout test để che lỗi.

## 13. Git

- `release/v0.4` tạo từ `main` tại `52840fe` (tag `v0.3.0`).
- Feature `feat/phase-4-realtime` tạo từ `release/v0.4`.
- Không bump version `0.4.0`; tag `v0.3.0` giữ nguyên.
- Merge feature vào `release/v0.4` bằng `--no-ff` sau gate; xóa feature.
- Không merge `release/v0.4` vào `main`; chờ duyệt v0.4.
