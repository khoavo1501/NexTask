# Giai đoạn 8B - Frame nhóm note trên whiteboard

- Trạng thái: Draft chờ duyệt
- Ngày lập: 2026-11-18
- Tiền đề: Phase 8A đã merge `release/v0.8` tại `ead25f1`; `main` và tag `v0.7` giữ nguyên
- Nhánh: `feat/phase-8b-frames` từ `release/v0.8`
- Migration mới: `007-phase-8b`
- Không merge `main`, không bump `0.8.0`

## 1. Mục tiêu

1. Dùng frame gốc của tldraw để nhóm note; frame được lưu và đồng bộ như item.
2. Note nằm trong frame giữ quan hệ cha–con; reload dựng lại đúng vị trí và tên frame.
3. Thêm công cụ `Frame` vào toolbar whiteboard; seed demo có frame Start/Stop/Continue.
4. Promote note trong frame ghi `origin.frameId`; frame không promote/vote được.
5. Giữ realtime, conflict handling và phân quyền hiện có.
6. Không làm cursor pagination/text index trong 8B; để 8C.

## 2. Quyết định

1. Frame là item trong collection `items` với `type: "frame"`, không tách collection.
   Cùng transaction sync, OCC version, unique `(boardId, shapeId)` và realtime event.
2. Frame lưu `position` tuyệt đối trên page, `size` lấy từ `props.w/h`, `rotation` bắt buộc 0,
   `props` giữ nguyên `{ w, h, name, color }`; `content` là chuỗi rỗng.
3. Note trong frame lưu `position` tương đối so với frame (đúng semantics tldraw) và
   `parentFrameId` trỏ `_id` của item frame.
4. Sync input dùng `parentShapeId` (shapeId của frame) thay vì ObjectId; server resolve
   sang `parentFrameId` trong cùng transaction. Nhờ vậy frame mới và note con có thể
   sync trong một request.
5. Server ghi frame trước, sau đó resolve frame và ghi note; note tham chiếu frame không
   tồn tại trả `422 FRAME_NOT_FOUND`; frame lồng frame trả `422 VALIDATION_ERROR`.
6. Xóa frame: các item con còn lại được chuyển về page level trong cùng transaction:
   `parentFrameId = null`, `position = frame.position + child.position`, `version + 1`;
   sau đó mới xóa frame. Nhờ vậy note đã promote (sync không xóa) không bị mồ côi.
7. `GET /items` trả cả note và frame; vote/report vẫn chỉ lọc `type: "note"`.
8. Promote đơn được bổ sung kiểm tra `type === "note"` và trả `422 NOT_A_NOTE`; batch
   promote đã có kiểm tra tương đương.
9. Frame không có vote, không có `promotedTaskId`; các trường này luôn rỗng/null.
10. Không nhóm báo cáo theo frame trong 8B.

## 3. Data model

Item `type: "frame"`:

```ts
{
  boardId, shapeId,
  type: 'frame',
  content: '',
  style: { color },
  props: { w, h, name, color },
  position: { x, y },       // page coordinates
  size: { w, h },
  rotation: 0,
  tldrawIndex,
  parentFrameId: null,
  authorId,
  votes: [],
  promotedTaskId: null,
  version,
  createdAt,
  updatedAt
}
```

Item `type: "note"` trong frame:

```ts
{
  type: 'note',
  position: { x, y },       // relative to frame
  parentFrameId: '<frame item _id>',
  // các trường còn lại giữ nguyên
}
```

- `parentFrameId` là tham chiếu mềm; server kiểm tra khi sync, DB không có foreign key.
- Note ngoài frame giữ `parentFrameId: null` và position tuyệt đối như hiện tại.
- `origin.position` của task giữ position lưu trên item; khi `origin.frameId` khác null,
  position là tọa độ tương đối trong frame. Không đổi semantics này trong 8B.

## 4. Sync contract

`PUT /api/v1/boards/:boardId/items`

```ts
type SyncItemInput =
  | {
      type: 'note';
      shapeId: string;
      content: string;
      style: Record<string, unknown>;
      props: Record<string, unknown>;
      position: { x: number; y: number };
      size: { w: number; h: number };
      rotation: number;
      tldrawIndex: string;
      parentShapeId: string | null;
      expectedVersion: number;
    }
  | {
      type: 'frame';
      shapeId: string;
      style: Record<string, unknown>;
      props: { w: number; h: number; name: string; color: string };
      position: { x: number; y: number };
      size: { w: number; h: number };
      rotation: 0;
      tldrawIndex: string;
      parentShapeId: null;
      expectedVersion: number;
    };
```

- `expectedVersion: 0` cho item mới; version hiện tại cho item đã có.
- `deleted[]` giữ nguyên shapeId + expectedVersion; áp dụng cho cả note và frame.
- Duplicate shapeId trong `items` + `deleted` vẫn trả 422 như hiện tại.
- Frame thiếu `w/h/name`, `w/h <= 0`, `rotation != 0`, hoặc `size` khác `props.w/h`
  trả 422.
- `parentShapeId` của frame khác null hoặc trỏ vào note trả 422.

## 5. Transaction sync

Thứ tự trong một transaction snapshot/majority:

1. Đọc item hiện có theo `shapeId` với `type` thuộc `note|frame`.
2. Kiểm tra `expectedVersion` cho toàn bộ item và deleted; stale trả 409 kèm `shapeId`.
3. Upsert/update frame trước; đọc lại frame trong transaction để lập map shapeId → `_id`.
4. Resolve `parentShapeId` của note: map frame trong payload, hoặc query frame đã có
   trong board. Thiếu frame trả 422 `FRAME_NOT_FOUND`.
5. Upsert/update note với `parentFrameId` đã resolve.
6. Xóa note theo `deleted[]`; bỏ qua note đã promote như hiện tại.
7. Với frame bị xóa: cập nhật các item con còn lại về page level như quyết định 6,
   sau đó xóa frame.
8. Trả toàn bộ item note + frame của board, sort `createdAt, _id`.

Một item stale làm toàn bộ request rollback. Không có ghi một phần.

## 6. API và validation

- `GET /items` trả note + frame; `ItemDto.type: 'note' | 'frame'`.
- `PUT /items` nhận union note/frame.
- `POST /items/:itemId/promote`: chỉ note; frame trả `422 NOT_A_NOTE`.
- `POST /items/promote-batch`: đã trả `NOT_A_NOTE`; giữ nguyên.
- Vote/unvote: query `type: "note"`; frame trả 404 như item không tồn tại.
- Report pipeline và voter budget tiếp tục `$match` `type: "note"`.
- Realtime item event serialize được cả frame; client remount whiteboard như hiện tại.

## 7. Migration 007

- Cập nhật `COLLECTION_VALIDATORS.items.properties.type.enum` thành `["note", "frame"]`.
- Migration `007-phase-8b` chỉ `collMod` validator `items` với strict/error; không backfill,
  không đổi index, không sửa dữ liệu.
- `LATEST_MIGRATION_NAME` cập nhật `007-phase-8b`.
- Trước khi áp app DB: backup `backups/nextask-before-8b-YYYYMMDD.gz`; rehearsal trên
  database tạm với fixture note cũ + frame mới; drop DB tạm sau kiểm tra.
- Migration test: note cũ vẫn hợp lệ; insert frame hợp lệ; insert `type: "shape"` bị reject.

## 8. Web

- Toolbar thêm `Frame` cạnh `Chọn`, `Kéo`, `Note`.
- `syncNow` gửi cả note và frame; frame dùng `props` gốc và `parentShapeId: null`;
  note lấy `parentShapeId` từ shape cha nếu cha là frame.
- Hydration tạo frame trước, sau đó note với `parentId` là shapeId frame và position
  tương đối. Note có `parentFrameId` nhưng thiếu frame được dựng ở page level.
- Selection/promote/batch chỉ áp dụng note; chọn frame không mở dialog promote.
- Header hiển thị `X ghi chú · Y frame · Z task`.
- Realtime item event vẫn remount whiteboard; frame từ tab khác xuất hiện sau refetch.
- Lỗi conflict frame/note dùng retry một lần như hiện tại.

## 9. Seed demo

- Thêm 3 frame: `shape:seed-frame-start`, `shape:seed-frame-stop`,
  `shape:seed-frame-continue`, tên `Start`, `Stop`, `Continue`, kích thước 220x700.
- 9 note demo được gán `parentFrameId` theo nhóm và position tương đối trong frame.
- Seed vẫn idempotent, chỉ reset board demo; tổng item thành 12 (9 note + 3 frame),
  5 task, 4 activity, 3 budget.
- Cập nhật test seed và README/architecture.

## 10. Test/acceptance

API integration với MongoDB replica set thật:

1. Sync frame + note con trong một request: frame và note được tạo, `parentFrameId` đúng.
2. Sync note vào frame đã có nhưng frame không nằm trong payload: resolve đúng.
3. `parentShapeId` trỏ note hoặc không tồn tại: 422; stale version: 409.
4. Xóa frame còn note con: note được reparent, position tuyệt đối, version +1.
5. Xóa frame còn note đã promote: frame mất, note còn, `promotedTaskId` giữ nguyên.
6. Promote trực tiếp frame: 422 `NOT_A_NOTE`; batch frame vẫn `NOT_A_NOTE`.
7. Vote/report bỏ qua frame; số liệu không đổi so với trước 8B.
8. Migration 007: validator nhận frame, từ chối type lạ; note cũ không đổi.
9. Seed: 12 item, 3 frame, idempotent; board thật không bị chạm.

Kiểm chứng thủ công trên browser:

- Mở demo board, thấy 3 frame và note nằm đúng nhóm.
- Tạo frame mới, kéo note vào, reload: frame tên/kích thước/note giữ nguyên.
- Promote note trong frame: task xuất hiện, `origin.frameId` có giá trị.
- Xóa frame có note đã promote, reload: note vẫn còn ở page level, task/badge không mất.
- Playwright smoke thêm assertion header có `3 frame`.

Cổng:

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:web`.
- Full suite ba lần; `npm run test:e2e`.
- Docker rebuild; health vẫn `0.7.0` (không bump trong 8B).

## 11. Git

- Feature `feat/phase-8b-frames` từ `release/v0.8`; merge `--no-ff` sau gate.
- Xóa feature sau merge; không merge `main`; không bump `0.8.0`; tag `v0.7` giữ nguyên.
- Không push nếu người dùng chưa yêu cầu.

## 12. Rủi ro

- tldraw có thể tự xóa hoặc reparent note khi xóa frame; server xử lý cả hai trường hợp
  bằng reparent phần còn lại, nhưng cần kiểm chứng browser thật.
- Frame rotation ngoài 0 sẽ làm phép reparent sai; server reject rotation khác 0.
- Note đã promote bị xóa khỏi whiteboard vẫn được giữ theo thiết kế Phase 1; khi frame
  bị xóa, note này được đưa về page level thay vì xóa.
- Không có foreign key DB; dữ liệu cũ hoặc ghi ngoài API có thể tạo `parentFrameId`
  treo. Hydration coi note mồ côi là note page level.
- Thay đổi validator áp dụng cho toàn bộ collection `items`; phải backup và rehearsal
  trước khi áp app DB.

## 13. Ngoài phạm vi

- Cursor pagination, text index (Phase 8C).
- Báo cáo/nhóm task theo frame.
- Frame lồng nhau, vote/promote frame, màu frame tùy chỉnh ngoài mặc định tldraw.
- Di chuyển note giữa frame bằng API riêng; chỉ sync theo thao tác tldraw.
