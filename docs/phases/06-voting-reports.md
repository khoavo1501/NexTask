# Giai đoạn 6 - Dot voting, quota và báo cáo ý tưởng

- Trạng thái: Draft chờ duyệt
- Ngày lập: 2026-11-17
- Tiền đề: v0.5.0 đã phát hành; `main` tại `3bf6d66`, tag annotated `v0.5.0`
- Kiến trúc: [../architecture.md](../architecture.md), mục 4.4, 4.9, 4.10, 12
- Phase 5: [05a-demote-activity.md](./05a-demote-activity.md),
  [05b-batch-undo.md](./05b-batch-undo.md)
- Nhánh: `release/v0.6` tạo từ `main`; feature `feat/phase-6-voting-reports`
- Không merge `main`, không bump `0.6.0` trong phase này
- Tag `v0.5.0` giữ nguyên

## 1. Mục tiêu

Đưa ý tưởng có nhiều phiếu vào hành động và phát hiện việc bị kẹt:

1. Vote/unvote một note với quota theo từng board-user.
2. Giữ quota bằng transaction `voter_budgets`, không tin đếm ở client.
3. Tổng hợp kết quả vote bằng aggregation, không lưu bộ đếm dư thừa.
4. Báo cáo hai nhóm: ý tưởng nhiều phiếu chưa promote và task đang kẹt.
5. UI vote trong panel note, quota hiển thị rõ, tab Báo cáo có hai nhóm.
6. Có `explain()` cho pipeline báo cáo và test trên dữ liệu tổng hợp.

## 2. Quyết định đã chốt

1. Phase 6 làm trọn gói: voting + quota + results + reports + UI.
2. Mỗi user tối đa một phiếu trên một item; phiếu nằm trong `items.votes`.
3. Quota lưu trong `voter_budgets` theo `(boardId, userId)`; `limit` là bản sao
   `settings.votingLimit` tại thời điểm tạo/cập nhật.
4. Vote/unvote chạy transaction; budget là điểm tuần tự hóa quota.
5. **Vote không tăng `item.version`**. Đây là subresource riêng để tránh mọi người
   nhận `VERSION_CONFLICT` khi đang sửa note; budget có `version` riêng.
6. Không ghi activity cho từng vote để tránh nhiễu feed.
7. Kết quả và báo cáo dùng aggregation; không thêm `voteCount` vào item.
8. Báo cáo trả cả `unpromotedIdeas` và `stalledTasks` trong một response `$facet`.
9. UI vote dùng panel note đang chọn; báo cáo ở tab mới trong khu vực Kanban.
10. Không thêm event realtime mới; item event hiện có kích hoạt refetch/report refresh.
11. Migration 006 tạo `voter_budgets`, backfill budget cho board/member hiện có.
12. Không làm endpoint chỉnh `settings`; dùng giá trị hiện có của board.

## 3. Hiện trạng

- `items.votes` đã có schema `{ userId, createdAt }`; `ItemDto` trả mảng votes.
- Board có `settings.votingLimit`, `minVotes`, `stalledAfterDays`.
- Chưa có `voter_budgets`, model/service, API vote/unvote/results/reports.
- Board create và invitation accept chưa tạo budget.
- Migration mới nhất `005-phase-5a`; chưa có 006.
- Chưa có UI vote, quota, kết quả vote hoặc báo cáo.
- Index item/task phục vụ báo cáo đã có từ các phase trước; sẽ kiểm tra lại trong 006.
- Activity/Realtime đã ổn định; không cần event mới.

## 4. Phạm vi

### Trong Phase 6

- Migration 006: `voter_budgets` validator + unique index; backfill budget.
- Budget service: ensure/read/update quota; tạo khi board/member mới; lazy ensure khi vote.
- Endpoint vote/unvote với transaction.
- Endpoint kết quả vote bằng aggregation.
- Endpoint báo cáo stalled-ideas với `$facet` + params.
- UI vote trong panel note; quota; tab Báo cáo.
- Explain pipeline báo cáo trên DB tạm.
- Test migration/vote/quota/results/reports/browser.

### Ngoài Phase 6

- Chỉnh `settings` qua API/UI; limit thay đổi giữa chừng.
- Nhiều phiếu trên cùng item hoặc weighted voting.
- Activity cho từng vote.
- Realtime event riêng cho vote/report; dùng item event hiện có.
- Cursor pagination report; v1 chỉ `limit` tối đa 100.
- Seed mới hoặc thay đổi seed hiện có.

## 5. Mô hình dữ liệu

### 5.1 `voter_budgets`

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `_id` | ObjectId | |
| `boardId` | ObjectId | |
| `userId` | ObjectId | |
| `used` | number | Số phiếu hiện tại, >= 0 |
| `limit` | number | Bản sao `settings.votingLimit`, >= 0 |
| `version` | number | Tăng khi used thay đổi; dùng cho quota |
| `createdAt`, `updatedAt` | Date | |

Index:

```js
db.voter_budgets.createIndex(
  { boardId: 1, userId: 1 },
  { unique: true, name: "voter_budgets_board_user_unique" }
);
```

Validator strict/error với `additionalProperties: false`; `used`/`limit` number >= 0,
`version` number >= 1.

### 5.2 Backfill migration 006

1. Tạo collection `voter_budgets` nếu chưa có; `collMod` validator nếu đã có.
2. Tạo unique index trên `(boardId, userId)`.
3. Với mỗi board:
   - Lấy `settings.votingLimit` (mặc định 3 nếu thiếu).
   - Với mỗi member, tính `used` bằng aggregation trên `items.votes` của board.
   - Upsert budget: `{boardId,userId}`, `$setOnInsert` limit/createdAt, `$set` used/updatedAt.
4. Idempotent: chạy lại không nhân đôi, không reset `used` sai.
5. Cập nhật `MIGRATION_006_NAME`, `LATEST_MIGRATION_NAME`.

Không có migration cho `items`/`tasks`; votes array đã tồn tại.

### 5.3 Tạo budget cho board/member mới

- `createBoard` tạo budget owner với `used: 0`, `limit: settings.votingLimit`.
- `acceptInvitation` khi thêm member tạo/ensure budget trong cùng transaction.
- Vote service gọi `ensureVoterBudget` nếu budget chưa có (lazy), dùng
  `settings.votingLimit` hiện tại; tránh board cũ thiếu budget.
- Invitation cho member đã tồn tại cũng ensure budget.

## 6. API Voting

### 6.1 Vote

`POST /api/v1/boards/:boardId/items/:itemId/votes`

Không body. Quyền: Owner/Member.

Response 200:

```ts
{
  data: {
    item: ItemDto;
    budget: { used: number; limit: number };
  };
  meta: { requestId: string };
}
```

Transaction:

1. Validate item thuộc board, type note.
2. Đọc budget; nếu chưa có, tạo với `used = count votes hiện tại của user`.
3. Nếu `item.votes` đã có user → `409 ALREADY_VOTED`.
4. Nếu `budget.used >= budget.limit` → `409 VOTE_LIMIT_REACHED`.
5. Update item filter `{_id, boardId, "votes.userId": {$ne: userId}}`,
   `$push: { votes: { userId, createdAt } }`; **không** đổi `version`.
6. Update budget filter `{boardId,userId,used: {$lt: limit}}`:
   `$inc: { used: 1, version: 1 }`.
7. Nếu budget update không match, rollback toàn bộ và trả `VOTE_LIMIT_REACHED`.
8. Commit; trả item/budget. Không emit socket; Change Streams phát item update.

`item.version` không tăng; `updatedAt` được cập nhật bởi timestamps.

### 6.2 Unvote

`DELETE /api/v1/boards/:boardId/items/:itemId/votes`

Transaction:

1. Item phải tồn tại; nếu user chưa vote → `409 NOT_VOTED`.
2. `$pull` vote của user khỏi item; không đổi `version`.
3. Budget `$inc used: -1, version: 1` với filter `used: {$gt: 0}`.
4. Commit; trả item/budget.

### 6.3 Mã lỗi

| HTTP | Code | Tình huống |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Item không thuộc board |
| 409 | `ALREADY_VOTED` | User đã vote item |
| 409 | `NOT_VOTED` | User chưa vote item |
| 409 | `VOTE_LIMIT_REACHED` | Budget đã dùng hết |
| 503 | `TRANSACTION_OUTCOME_UNKNOWN` | Commit không rõ kết quả |

### 6.4 Kết quả vote

`GET /api/v1/boards/:boardId/votes/results?limit=50`

- `limit` 1..100, mặc định 50.
- Aggregation trên items note của board:
  - `$project voteCount: { $size: "$votes" }`.
  - `$sort voteCount desc, createdAt asc, _id asc`.
  - `$limit`.
  - Trả `voters` (userId) và `promotedTaskId`.
- Usage lấy từ `voter_budgets` của board, sort `used` desc, `userId` asc.
- Viewer usage của request.user.
- Response:

```ts
{
  data: {
    items: Array<{ itemId: string; shapeId: string; content: string; voteCount: number;
      voters: string[]; promotedTaskId: string | null }>;
    usage: Array<{ userId: string; used: number; limit: number }>;
    viewer: { userId: string; used: number; limit: number };
  };
  meta: { requestId: string };
}
```

Không trả `voteCount` trong ItemDto; kết quả là projection riêng.

## 7. API Báo cáo

`GET /api/v1/boards/:boardId/reports/stalled-ideas`

Query:

| Tham số | Mặc định | Giới hạn |
| --- | --- | --- |
| `minVotes` | `board.settings.minVotes` | 0..1000 |
| `stalledDays` | `board.settings.stalledAfterDays` | 1..365 |
| `limit` | 50 | 1..100 |

Pipeline `$facet`:

1. **unpromotedIdeas**
   - `$match`: `boardId`, `type: "note"`, `promotedTaskId: null`.
   - `$project` voteCount `$size`.
   - `$lookup` tasks active theo `sourceItemId` + boardId; chỉ giữ item không còn task
     active.
   - `$match voteCount >= minVotes`.
   - `$sort voteCount desc, createdAt asc, _id asc`.
   - `$limit`.
   - Project itemId/shapeId/content/voteCount/createdAt.
2. **stalledTasks**
   - `$match`: boardId, `lifecycle: "active"`, `sourceItemId != null`,
     `columnId` không thuộc cột Done (service truyền danh sách done column IDs),
     `createdAt <= now - stalledDays`.
   - `$lookup` items nguồn theo `sourceItemId`; project taskId/title/columnId/createdAt
     và item content/shapeId.
   - `$sort createdAt asc, _id asc`.
   - `$limit`.
3. **summary**
   - Đếm số item mỗi nhóm (từ facet output hoặc `$count`).

Response:

```ts
{
  data: {
    unpromotedIdeas: Array<{
      itemId: string; shapeId: string; content: string; voteCount: number; createdAt: string;
    }>;
    stalledTasks: Array<{
      taskId: string; title: string; columnId: string; createdAt: string;
      sourceItem: { itemId: string; shapeId: string; content: string } | null;
    }>;
    summary: { unpromotedIdeas: number; stalledTasks: number };
    params: { minVotes: number; stalledDays: number; limit: number };
  };
  meta: { requestId: string };
}
```

- Item đã demote có `promotedTaskId: null` nên quay lại nhóm unpromoted nếu đủ vote.
- Task ở cột Done không vào stalledTasks; task tạo tay không có sourceItemId cũng bị loại.
- `limit` áp cho từng nhóm, không áp tổng.

### 7.1 Explain

Khi verification, tạo database tạm `nextask_explain_v6` với 1000 item/1000 task cùng
shape index; chạy `aggregate(pipeline).explain("executionStats")` cho report và
`find` Kanban hiện có. Ghi keys/docs/ms vào MongoDB notes; drop database sau khi đo.

## 8. Quota semantics

- `used` là số phiếu hiện tại của user trong board, không phải tổng lịch sử.
- Unvote giảm `used`; vote lại tăng.
- Nếu `votingLimit` đổi bên ngoài phase này, budget `limit` không tự đổi; phase 6 không
  có endpoint settings. Ghi rõ đây là giới hạn v1.
- User có thể vote nhiều item khác nhau đến `limit`; một item tối đa một phiếu.
- Budget thiếu được tạo lazy; used tính từ votes hiện có để không vượt quota.
- Xóa item có vote không nằm trong scope (item delete đã bị chặn nếu promoted và UI
  không xóa note tùy tiện); nếu tương lai xóa, phải giảm used trong transaction.

## 9. UI

### 9.1 Vote trong panel note

- Panel note đang chọn hiển thị:
  - số phiếu hiện tại;
  - nút `Vote` hoặc `Unvote` theo trạng thái viewer;
  - quota `Đã dùng x/y`.
- Disable Vote khi `used >= limit` và viewer chưa vote; disable Unvote khi chưa vote.
- Sau vote/unvote cập nhật item trong state và viewer usage; hiện notice ngắn.
- Nếu `ALREADY_VOTED`/`NOT_VOTED` do client cũ: refetch items/results và hiện notice.
- `VOTE_LIMIT_REACHED`: giữ trạng thái, hiện notice quota.
- Không optimistic vượt quá server; dùng response transaction.

### 9.2 Tab Báo cáo

- Thêm tab thứ ba `Báo cáo` cạnh Kanban/Hoạt động.
- Gọi report API với defaults; hiển thị:
  - summary hai nhóm;
  - danh sách ý tưởng nhiều vote chưa promote (content, voteCount);
  - danh sách task kẹt (title, cột, tuổi task, note nguồn).
- Có nút làm mới; empty state từng nhóm.
- Không có nút hành động từ report trong Phase 6 (promote/demote vẫn qua whiteboard/Kanban).
- Report lỗi không chặn Kanban/whiteboard.

### 9.3 Realtime/refresh

- Vote/unvote phát item event hiện có; board workspace refetch item snapshot như Phase 4.
- Report/quota refresh:
  - sau vote/unvote;
  - sau promote/demote/batch/undo (item/task event);
  - khi mở tab Báo cáo hoặc bấm làm mới.
- Không thêm socket event mới; không watcher `voter_budgets`.

## 10. Test

### 10.1 Contracts

- Vote response, results response, report query/response parse.
- Error codes `ALREADY_VOTED`, `NOT_VOTED`, `VOTE_LIMIT_REACHED` qua API.
- Report query coerce/default min/max.

### 10.2 Migration 006

- Latest 006; chạy lại idempotent.
- `voter_budgets` validator strict/error; unique `(boardId,userId)`.
- Backfill tạo đủ budget cho member hiện có; `used` đúng theo votes; counts item/task
  không đổi.
- Budget limit lấy từ settings; budget member không vote used 0.
- Board/member mới có budget; lazy ensure hoạt động.

### 10.3 Vote transaction

- Vote thành công: item có vote, budget used +1/version +1, item.version không đổi.
- Vote lại cùng item: 409 ALREADY_VOTED; budget không tăng.
- Vote khi used = limit: 409 VOTE_LIMIT_REACHED; item không có vote.
- Hai vote đồng thời vào hai item khác nhau khi chỉ còn một quota: một thành công, một
  409; used không vượt limit.
- Hai vote đồng thời cùng item: một thành công, một ALREADY_VOTED.
- Unvote thành công: item bỏ vote, used giảm; unvote lần hai NOT_VOTED.
- Vote/unvote không làm `item.version` tăng.
- Member và Owner vote được; non-member 404.

### 10.4 Results aggregation

- Vote counts đúng, sort giảm dần, voters đúng.
- Usage khớp budget; viewer usage đúng.
- Item không vote voteCount 0; limit áp đúng.
- Không trả voteCount trong ItemDto (chỉ projection report/results).

### 10.5 Reports

- Defaults lấy từ board settings; override minVotes/stalledDays/limit đúng.
- Unpromoted ideas lọc promotedTaskId null, voteCount >= minVotes, sort đúng.
- Task active ở cột thường quá stalledDays vào nhóm; task Done hoặc mới hơn bị loại.
- Task tạo tay không sourceItemId bị loại.
- Item demote quay lại unpromoted nếu đủ vote.
- Summary đúng; limit áp từng nhóm.
- Pipeline có `explain` evidence trên DB tạm.

### 10.6 Web/browser

- Typecheck/build pass.
- Panel note: Vote/Unvote, count/quota cập nhật; hết quota disable; reload giữ.
- Tab Báo cáo hiển thị hai nhóm và summary; refresh hoạt động.
- Client thứ hai vote: tab đang mở cập nhật count/quota qua item event.
- Promote note đủ vote làm item rời unpromoted report; demote làm quay lại.
- Không lỗi console/500.

### 10.7 Vận hành

- Backup trước migration 006; rehearsal; áp app DB.
- Docker rebuild; health vẫn `0.5.0` (không bump trong phase).
- Full suite ba lần; typecheck/lint/format pass.
- Explain ghi vào MongoDB notes; drop DB tạm.

## 11. Tiêu chí chấp nhận

1. Vote/unvote đúng một phiếu/item; quota board-user không vượt limit.
2. Vote/unvote transaction; lỗi/thua race không để item/budget lệch.
3. Vote không làm item.version tăng; whiteboard không bị conflict do vote.
4. Migration 006 tạo/backfill budget đúng; dữ liệu item/task giữ nguyên.
5. Results aggregation trả voteCount, voters, usage, viewer đúng.
6. Report trả đúng hai nhóm + summary, lọc promoted/Done/stalled đúng.
7. UI vote/quota và tab Báo cáo hoạt động; realtime cập nhật.
8. Explain pipeline được ghi lại; index được dùng hợp lý.
9. Full suite ba lần; browser evidence; không lỗi console/500.
10. Feature merge `release/v0.6`; `main`, tag `v0.5.0`, version `0.5.0` không đổi.

## 12. Rủi ro và cách xử lý

- **Quota race**: budget document là điểm tuần tự hóa; transaction kiểm tra used/limit.
- **Vote làm version item tăng**: cố ý không tăng; votes là subresource, test xác nhận.
- **Budget thiếu**: lazy ensure + backfill migration; invitation/board create ensure.
- **Backfill sai used**: aggregation theo user/board; test board nhiều member/vote.
- **Item delete có vote**: ngoài scope v1; ghi chú tương lai phải giảm used.
- **Settings đổi**: không có endpoint; limit snapshot; ghi rõ giới hạn.
- **Report pipeline chậm**: index board/type/promoted, board/lifecycle/createdAt; explain;
  limit 100.
- **$lookup sai**: lọc active task và done column IDs; test task demoted/Done.
- **Realtime vote storm**: item events refetch; report refresh chỉ khi tab mở/refresh;
  không watcher budget.
- **Quota hiển thị lệch**: dùng response transaction và results API; không optimistic vượt.
- **Không bump version**: Phase 6 là một phần v0.6; chờ duyệt phát hành.

## 13. Git

- `release/v0.6` tạo từ `main` tại `3bf6d66` (v0.5.0).
- Feature `feat/phase-6-voting-reports` tạo từ `release/v0.6`.
- Spec commit trên feature; chưa code trước khi spec được duyệt.
- Implementation TDD; merge feature vào `release/v0.6` bằng `--no-ff` sau gate; xóa feature.
- Không merge `release/v0.6` vào `main`; không bump `0.6.0`; tag `v0.5.0` giữ nguyên.
- Không push/tag/amend/đổi git config; identity commit
  `khoavo1501 <khoamiden15012005@gmail.com>`.
