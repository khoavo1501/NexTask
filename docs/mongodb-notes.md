# Ghi chú MongoDB của NexTask

- Trạng thái: Tài liệu sống, cập nhật theo từng giai đoạn
- Ngày bắt đầu: 2026-10-28
- Kiến trúc liên quan: [architecture.md](./architecture.md)

Mục tiêu của tài liệu này là ghi lại các quyết định schema, đánh đổi, hành vi thật của MongoDB và kết quả đo hiệu năng. Không ghi lại kiến thức chung nếu nó không gắn với một lựa chọn cụ thể trong NexTask.

## 1. Quyết định lớn: mô hình A

### Lựa chọn

Hai collection riêng:

- `items`: dữ liệu whiteboard, gồm note, frame, text, connector.
- `tasks`: dữ liệu Kanban.

Promote tạo task mới và cập nhật item trong một transaction. Liên kết:

- `items.promotedTaskId` -> task active.
- `tasks.sourceItemId` -> item gốc.
- `tasks.origin` -> snapshot ngữ cảnh tại thời điểm promote.

### Vì sao

- Kanban cần lọc theo cột, assignee, nhãn, ưu tiên và sắp xếp theo order. Một collection task riêng cho phép đánh compound index đúng và truy vấn đơn giản.
- Item chứa dữ liệu tldraw có kích thước thay đổi và không cần xuất hiện trong mọi truy vấn Kanban.
- Task có vòng đời riêng: active, demoted; có version, assignee, lịch sử.
- Mô hình nhúng task vào item sẽ khiến truy vấn Kanban phải quét/xử lý mảng lớn, khó index cho nhiều bộ lọc và dễ chạm giới hạn document.

### Đánh đổi

- Cần replica set vì transaction.
- Cần unique partial index để chống trùng.
- Báo cáo cần `$lookup`, tốn công viết pipeline và đo hiệu năng.
- Có hai nguồn dữ liệu cần giữ bất biến; nếu quên session ở một thao tác, transaction sẽ không bao phủ thao tác đó.
- Promote hàng loạt bị giới hạn bởi thời gian transaction và oplog.
- Badge trên note không denormalize cột/assignee hiện tại; frontend lấy từ task map để tránh dữ liệu cũ. Đổi lại, client cần xử lý sự kiện task.

### Vì sao không chọn mô hình B (nhúng)

Mô hình B sẽ đơn giản hơn cho một note đơn lẻ nhưng đẩy Kanban vào thế phải query lồng, khó sắp xếp ổn định và khó tách vòng đời task. Dự án ưu tiên học hai collection, transaction và liên kết hai chiều, nên mô hình A là lựa chọn có chủ đích.

## 2. Mongoose che giấu gì

### 2.1 `autoIndex`

Mặc định Mongoose có thể tự tạo index từ schema khi kết nối. Điều này:

- Làm index xuất hiện ngoài migration, khó kiểm soát.
- Có thể gây tạo index nặng lúc khởi động.
- Che việc index nào thực sự tồn tại trong database.
- Không phù hợp với yêu cầu unique partial index có điều kiện phức tạp.

Quyết định: đặt `autoIndex: false`. Index được tạo bằng migration và kiểm tra bằng test `listIndexes()`.

### 2.2 Schema Mongoose không phải `$jsonSchema`

Mongoose validate ở tầng ứng dụng và cast dữ liệu trước khi validate. Nó không bảo vệ database khỏi:

- Script seed viết sai.
- Migration chèn dữ liệu sai.
- Một service khác dùng driver trực tiếp.
- Ghi từ `mongosh` khi debug.

Vì vậy mỗi collection quan trọng có `$jsonSchema` riêng. Hai lớp có mục đích khác nhau:

- Mongoose: lỗi sớm, kiểu TypeScript, default.
- `$jsonSchema`: hàng rào cuối ở database, kiểm tra kiểu BSON và enum.

### 2.3 Casting

Mongoose tự đổi chuỗi thành ObjectId/number theo schema. Casting có thể:

- Che lỗi đầu vào.
- Tạo hành vi khác nhau giữa `find` và aggregation.
- Khiến filter nhận giá trị ngoài dự kiến nếu service truyền thẳng input.

Quyết định: zod parse mọi input, parse ObjectId bằng helper, không truyền raw object vào filter.

### 2.4 Transaction và session

Mongoose không tự đưa mọi thao tác vào transaction. Chỉ thao tác nhận `{ session }` mới tham gia. Middleware, hook hoặc một lời gọi repository quên session sẽ ghi ngoài transaction.

Quy tắc:

- Service mở session.
- Repository nhận session tùy chọn nhưng bắt buộc khi đang trong transaction.
- Không gọi mạng, không emit socket, không ghi file trong callback transaction.
- Callback của `withTransaction` phải chạy lại được.

### 2.5 `__v` và version

Mongoose dùng `__v` cho một số đường ghi, nhưng `updateOne`/`findOneAndUpdate` không tự tăng theo cách client cần. Dự án:

- Tắt `versionKey`.
- Dùng trường `version` số nguyên.
- Tăng bằng `$inc`.
- Filter theo version mong đợi.

### 2.6 Middleware

Hook `pre('save')`, `post('save')` có thể:

- Tạo thêm truy vấn không nằm trong transaction.
- Chạy khi test seed, gây khó dự đoán.
- Che logic nghiệp vụ quan trọng.

Quyết định: không dùng hook để giữ bất biến Promote/Demote; logic nằm trong service và transaction. Hook chỉ dùng cho việc thật sự cục bộ như timestamp mặc định.

### 2.7 `populate` và `$lookup`

`populate` dễ dùng nhưng sinh truy vấn phụ, có thể N+1 và không thể hiện rõ pipeline. Báo cáo dùng aggregation `$lookup`; API snapshot board có thể dùng vài truy vấn có kiểm soát thay vì populate mù.

### 2.8 Change Streams và resume token

Mongoose không quản lý checkpoint. Token phải được lưu bởi ứng dụng. Giai đoạn 4 sẽ dùng collection `change_stream_checkpoints`, ghi sau khi xử lý sự kiện, chấp nhận at-least-once.

### 2.9 `bufferCommands`

Nếu DB chưa kết nối, Mongoose có thể buffer lệnh và giữ request chờ. Trong health và test, điều này che lỗi. Dự án đặt `bufferCommands: false` và kiểm tra trạng thái kết nối rõ ràng.

### 2.10 `readPreference` và transaction

Transaction ghi phải chạy trên primary. Không dùng read preference secondary cho logic Promote/Demote. Health kiểm tra primary.

## 3. Unique partial index chống promote trùng

Index mục tiêu:

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

Điều kiện:

- Task tạo tay không có `sourceItemId`: không vào index.
- Task demoted có `sourceItemId` nhưng lifecycle khác active: không vào index.
- Chỉ một task active cho mỗi item.
- Ghi đồng thời: một insert thắng, insert còn lại lỗi duplicate key.

Vì sao partial: nếu unique trên toàn bộ `sourceItemId`, task demoted sẽ chặn việc promote lại. Soft delete task là lựa chọn bảo toàn lịch sử của dự án, nên index phải hiểu lifecycle.

Lưu ý: partial index chỉ được dùng khi query khớp điều kiện. Các truy vấn tìm task active phải có `lifecycle: "active"` và `sourceItemId` dạng ObjectId.

## 4. Transaction Promote/Demote

### Cấu hình

- `readConcern: "snapshot"`.
- `writeConcern: { w: "majority", j: true }`.
- Read preference primary.
- Dùng `session.withTransaction`.

### Vì sao snapshot

Đọc item, cột và trạng thái promote trong cùng một ảnh dữ liệu. Tránh trường hợp đọc item trước khi một transaction khác commit và đọc task sau đó, dẫn đến quyết định dựa trên hai thời điểm.

### Vì sao majority và journal

Task là dữ liệu cần bền vững. Majority chờ đa số member xác nhận; journal bảo đảm ghi đã xuống đĩa. Trên một nút, majority là một, nên chi phí thấp; khi lên ba nút, mã giữ đúng semantics.

### Xử lý retry

- `TransientTransactionError`: retry toàn bộ transaction.
- `UnknownTransactionCommitResult`: retry commit; không giả định thất bại.
- Duplicate key: không retry, trả xung đột.
- Validation: không retry.
- Write conflict: transient, retry theo driver.

Callback transaction không được có side effect ngoài DB. Nếu callback chạy lại, side effect sẽ lặp dù transaction trước abort.

### Giới hạn

MongoDB giới hạn thời gian transaction (mặc định 60 giây) và kích thước oplog entry (16 MB). Batch promote giới hạn 100 item để có biên an toàn. Nếu item hoặc task chứa dữ liệu lớn bất thường, phải kiểm tra kích thước trước khi mở transaction.

### Bất biến

Sau Promote:

```text
task.lifecycle = active
task.sourceItemId = item._id
item.promotedTaskId = task._id
activity.action = item.promoted
```

Sau Demote:

```text
task.lifecycle = demoted
task.demotedAt != null
item.promotedTaskId = null
activity.action = item.demoted
```

Task demoted vẫn giữ `sourceItemId` và `origin`. Đây là chủ ý để bảo toàn lịch sử. Unique index chỉ chặn task active trùng.

## 5. Optimistic concurrency

Filter cập nhật:

```js
{ _id: itemId, version: expectedVersion }
```

Update:

```js
{ $set: { ... }, $inc: { version: 1 } }
```

Nếu không match, đọc lại để phân biệt không tồn tại và xung đột. Không dựa vào `updatedAt` vì hai cập nhật có thể cùng timestamp hoặc clock khác nhau.

Version cũng dùng để client bỏ qua sự kiện realtime đến muộn. Sự kiện mang `version` của document sau khi ghi.

## 6. Index và ESR

| Query | Index dự kiến | Lý do |
| --- | --- | --- |
| Kanban theo cột, sort order | `{ boardId: 1, columnId: 1, order: 1 }` unique partial active | Equality trước, sort sau; chặn trùng key |
| Lọc assignee | `{ boardId: 1, assigneeId: 1 }` partial active | Board và assignee là equality |
| Lọc item theo loại | `{ boardId: 1, type: 1 }` | Board, type equality |
| Báo cáo ý tưởng | `{ boardId: 1, type: 1, promotedTaskId: 1 }` | Board, type equality; null equality |
| Chống trùng promote | `{ sourceItemId: 1 }` unique partial active | Unique + partial |
| Báo cáo task kẹt | `{ boardId: 1, lifecycle: 1, createdAt: 1 }` | Equality trước, range/sort sau |
| Quota vote | `{ boardId: 1, userId: 1 }` unique | Một ngân sách cho mỗi người/board |
| Activity feed | `{ boardId: 1, createdAt: -1 }` | Board equality, sort giảm |
| TTL activity | `{ createdAt: 1 }` TTL | TTL monitor |

### ESR

- Equality: `boardId`, `columnId`, `lifecycle`.
- Sort: `order`, `createdAt`.
- Range: điều kiện thời gian trong báo cáo.
- Các trường có tính chọn lọc cao hơn đặt trước trong nhóm equality nếu cùng loại truy vấn.

Index được tạo bằng migration, không dựa vào `autoIndex`. Test sẽ kiểm tra tên, unique và partial filter của index quan trọng.

### Kết quả `explain()`

Chưa có kết quả tại ngày 2026-10-28 vì Giai đoạn 0 chưa có collection và truy vấn nghiệp vụ. Khi Giai đoạn 3 và 6 triển khai, tài liệu này sẽ ghi:

- Lệnh `explain("executionStats")` đã chạy.
- `nReturned`, `totalKeysExamined`, `totalDocsExamined`.
- Index được chọn.
- Nhận xét và thay đổi index nếu có.

Không dán số liệu giả hoặc số liệu từ dataset khác.

## 7. Fractional indexing

- `order` là string, so sánh từ điển.
- Sinh key bằng thư viện `fractional-indexing`, không tự viết.
- Không cập nhật hàng loạt khi kéo thả.
- Unique index `(boardId, columnId, order)` cho task active; nếu hai client sinh cùng key, service tính lại một lần.
- Không có nhu cầu rebalancing trong v1; theo dõi độ dài key khi có dữ liệu thật.
- Di chuyển cột và đổi order trong một update kèm version.

## 8. Change Streams

- Watch theo board để pipeline lọc đúng board.
- Bật pre/post images cho collection cần bắt delete.
- Lưu resume token theo board và collection.
- Ghi checkpoint sau xử lý; gửi lặp có thể xảy ra.
- Token hết hạn hoặc oplog cuốn: phát `board:resync`.
- Không ghi presence/cursor vào MongoDB.
- Mỗi API instance có watcher riêng; v1 một instance.

Chi tiết pipeline và sự kiện nằm trong [architecture.md](./architecture.md), mục 9.

## 9. TTL và activity

- TTL index trên `activities.createdAt`, 90 ngày.
- TTL monitor chạy khoảng mỗi 60 giây; không có nghĩa xóa đúng thời điểm.
- Activity là log vận hành có hạn, không phải audit vĩnh viễn.
- Task demoted vẫn nằm trong `tasks`, nên lịch sử task không phụ thuộc TTL activity.
- Invitation có TTL trên `expiresAt`.

## 10. Dot voting và quota

Phiếu được nhúng trong `items.votes` để đọc cùng item và tổng hợp bằng `$size`, `$unwind`, `$group`. Nhưng giới hạn phiếu là tài nguyên dùng chung của một user trên toàn board.

Nếu chỉ đếm phiếu trong transaction:

- Hai request vote vào hai item khác nhau có thể cùng đọc thấy quota còn trống.
- Hai transaction ghi hai document khác nhau nên không có write conflict.
- Cả hai commit và người dùng vượt giới hạn.

Vì vậy dự án thêm `voter_budgets` với unique index `(boardId, userId)` và trường `used`. Mỗi vote cập nhật budget trong cùng transaction với item. Document budget tạo điểm tuần tự hóa cho mỗi user, nên hai thao tác vote đồng thời phải xếp hàng ở mức document.

Đánh đổi:

- Thêm một collection và một bước ghi.
- Cần đồng bộ budget khi thêm thành viên hoặc đổi giới hạn.
- Vote/unvote phải chạy trong transaction, không thể chỉ `$push`.
- Đổi lại, quota đúng dưới tải đồng thời.

Kết quả vote vẫn lấy từ `items.votes` bằng aggregation; budget không phải nguồn hiển thị kết quả.

## 11. `$jsonSchema` và migration

- Validator được áp bằng `collMod` trong migration.
- `validationLevel: "strict"`, `validationAction: "error"`.
- Enum và required fields được test bằng insert sai trực tiếp vào DB.
- Mongoose schema không thay thế validator.
- Khi thêm trường enum mới, migration phải cập nhật validator trước khi deploy code ghi giá trị đó.

## 12. Những điều cần đo, không đoán

- Index nào được dùng cho Kanban và báo cáo.
- Chi phí `$lookup` trên board mẫu.
- Kích thước transaction batch 100 item.
- Tác động của pre/post images.
- Số lượng watcher khi có nhiều board.
- TTL deletion lag trong môi trường local.

Kết quả sẽ được ghi kèm ngày, lệnh và dữ liệu đầu vào. Nếu chưa chạy, ghi rõ chưa có số liệu.

## 13. Quan sát Giai đoạn 0

Lệnh kiểm tra replica set:

```bash
docker compose exec -T mongo mongosh --quiet --eval 'JSON.stringify({set: rs.status().set, primary: db.adminCommand({hello:1}).isWritablePrimary})'
```

Kết quả ngày 2026-10-28:

```json
{"set":"rs0","primary":true}
```

Health API cùng ngày trả `replicaSet: "rs0"`, `primary: true`, `latencyMs: 1`. Đây là một mẫu đo local, không phải benchmark.

### Replica set tồn tại trong volume

Volume `nextask_mongo-data` đã có từ trước và đã chứa cấu hình replica set `rs0`. Khi container Mongo được tạo lại, replica set không mất vì cấu hình nằm trong dữ liệu volume. Điều này giải thích vì sao `rs.status()` thành công ngay cả khi container `mongo-init` đầu tiên lỗi.

### Race khi init

`mongosh` kết nối tới `mongo:27017` trước khi `mongod` mở cổng sẽ thoát với `ECONNREFUSED`; script bên trong không kịp chạy. Cần gate container init sau healthcheck của Mongo và cho phép retry. Sau khi sửa, log là `replica set rs0 ready`.

### Host và container khác hostname

Replica set cấu hình member `mongo:27017`, tên chỉ phân giải trong mạng Docker. Từ host phải dùng `directConnection=true` hoặc chạy `mongosh` trong container. Test integration dùng `directConnection=true` và vẫn đọc được `setName` từ `hello`.

### Health không chỉ là ping

`ping` thành công không chứng minh transaction hay Change Streams dùng được. Health kiểm tra thêm `hello.setName` và `isWritablePrimary`; API từ chối khởi động nếu replica set không khớp. Đây là hành vi có chủ đích, không phải kiểm tra thừa.

## 14. Quan sát Giai đoạn 1

### Index thật trong database ứng dụng

Lệnh:

```bash
docker compose exec -T mongo mongosh --quiet --eval 'JSON.stringify(db.getSiblingDB("nextask").tasks.getIndexes())'
```

Kết quả ngày 2026-10-28, rút gọn:

```json
{
  "key": { "sourceItemId": 1 },
  "name": "uniq_active_task_per_item",
  "unique": true,
  "partialFilterExpression": {
    "sourceItemId": { "$type": "objectId" },
    "lifecycle": "active"
  }
}
```

Index được tạo bởi `ensureIndexes()` khi API khởi động, không bởi `autoIndex`. Test integration cũng gọi cùng hàm trước khi chạy.

### Transaction Promote

- Test đồng thời hai promote: một request nhận 201, request còn lại nhận 409; task count bằng 1. Điều này chứng minh unique partial index là hàng rào cuối, không chỉ là kiểm tra `promotedTaskId` ở ứng dụng.
- Test tiêm lỗi sau khi insert task: transaction abort, task count bằng 0, item vẫn `promotedTaskId: null`.
- Promote tạo task trước, update item sau. Thứ tự này cố ý để test rollback chứng minh cả hai ghi nằm trong một transaction.
- Task và item trả về trong cùng response; origin lưu snapshot vị trí, tác giả và thời điểm item được tạo.

### Chưa áp dụng

- Chưa có `$jsonSchema`; đây là hạng mục Giai đoạn 2.
- Chưa có optimistic concurrency chặn ghi; trường `version` đã có và tăng khi sync/promote/move nhưng client chưa gửi expected version.
- Chưa có `explain()` cho Kanban vì dữ liệu mẫu và báo cáo chưa đủ; kết quả sẽ được ghi khi làm index Phase 3.
- `position` và `props` tldraw được lưu dạng Mixed. Phase 1 chỉ nhận shape `note`; frame/text/arrow chưa được ghi.

### Test database

- Phase 0 dùng `nextask_phase0_test`.
- Phase 1 dùng `nextask_phase1_test`.
- Test integration không mock MongoDB và không đụng database ứng dụng `nextask`.
