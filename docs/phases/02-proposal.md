# Đề xuất nội dung Giai đoạn 2

- Trạng thái: Chờ quyết định
- Ngày lập: 2026-10-28
- Tiền đề: Giai đoạn 1 đã hoàn thành
- Kiến trúc: [../architecture.md](../architecture.md)
- Biên bản Giai đoạn 1: [01-vertical-slice.md](./01-vertical-slice.md)

## 1. Hiện trạng cần tính đến

Kiểm tra database ứng dụng `nextask` ngày 2026-10-28:

- Có `1` board tên `Retro E2E Phase 1`.
- Có `2` item note và `2` task.
- Board có `ownerId = 000000000000000000000001` nhưng chưa có trường `members`.
- Chưa có collection `users`.
- Item/task đã có trường `version`, nhưng client chưa gửi expected version.
- API board hiện scope theo `DEMO_OWNER_ID`; chưa có auth.
- `ensureIndexes()` đang chạy lúc API khởi động.
- Chưa có `$jsonSchema`, migration runner hay activity collection.

Vì đã có dữ liệu thật từ Phase 1, Phase 2 phải migration và giữ nguyên board, note, task, version hiện tại.

## 2. Mục tiêu Phase 2 theo spec

1. Auth: đăng ký, đăng nhập, logout, JWT, hash mật khẩu.
2. Board membership và vai trò Owner/Member.
3. `$jsonSchema` validation ở tầng collection.
4. Optimistic concurrency bằng `version`.
5. Cổng nghiệm thu:
   - Member bị chặn thao tác chỉ Owner ở server.
   - Ghi đồng thời cùng task: bên sau nhận lỗi version.
   - Dữ liệu sai bị MongoDB từ chối.
   - Dữ liệu Phase 1 vẫn truy cập được.

## 3. Đề xuất chia Phase 2

Phase 2 theo lộ trình gốc gồm bốn mảng lớn. Làm tất cả trong một lần sẽ tạo một cổng duyệt quá rộng, khó kiểm chứng độc lập.

### Phương án A - chia 2A và 2B (khuyến nghị)

#### Phase 2A - Identity, membership và quyền

Phạm vi:

- Collection `users`.
- Auth bằng email/mật khẩu, argon2id, JWT cookie.
- Middleware xác thực và board access.
- `members[]` nhúng trong board; backfill owner hiện tại.
- Invitation bằng link; accept invitation.
- Owner-only: đổi tên/cài đặt board, tạo invitation.
- Member được đọc board, sửa note, promote, move task.
- UI đăng ký/đăng nhập/logout, danh sách board theo membership, invitation.
- Migration runner phiên bản tối thiểu, migration seed owner và backfill board cũ.
- Test auth, membership, role, preservation dữ liệu.

Cổng 2A:

- User đăng ký/đăng nhập được.
- Board Phase 1 vẫn mở được bằng owner seed.
- Owner mời Member bằng link; Member accept được.
- Member gọi endpoint Owner-only bị `403` ở server.
- Người ngoài board nhận `404`/`403` theo quy ước.
- Không có dữ liệu Phase 1 bị mất.

#### Phase 2B - Schema validation và optimistic concurrency

Phạm vi:

- Mở rộng migration runner của 2A.
- `$jsonSchema` cho `users`, `boards`, `items`, `tasks`, `invitations`.
- Chuyển việc tạo index từ `ensureIndexes()` sang migration; API kiểm tra schema đã migrate.
- Version enforcement cho board update, task move, promote và item sync.
- Client gửi expected version; xử lý `409 VERSION_CONFLICT`.
- Test direct DB insert sai, concurrent writes, stale version.
- UI hiển thị xung đột và refetch.

Cổng 2B:

- Ghi sai enum/required field bị MongoDB từ chối.
- Migration idempotent, chạy lại không đổi dữ liệu.
- Hai update cùng task: một thành công, một `409`; không mất update.
- Promote với item version cũ bị `409`.
- Sync note với version cũ bị `409` và không ghi đè.
- Client phục hồi được sau conflict.

### Phương án B - một Phase 2 duy nhất

Làm cả bốn mảng trong một cổng.

Ưu điểm:

- Ít lần chuyển phase.
- Toàn bộ yêu cầu Phase 2 hoàn tất trong một lần.

Nhược điểm:

- Cổng duyệt rất lớn.
- Migration, auth và version chồng chéo debug.
- Khó xác định lỗi thuộc auth hay schema/concurrency.
- Rủi ro làm hỏng dữ liệu Phase 1 trước khi auth được kiểm chứng.

Khuyến nghị: Phương án A.

## 4. Thiết kế Auth đề xuất

### Thư viện

- `argon2` 0.45.1 cho hash argon2id.
- `jose` 6.2.13 cho JWT ESM; tránh callback API của `jsonwebtoken`.
- `express-rate-limit` 8.7.1 cho auth.
- `cookie-parser` 1.4.7 để đọc cookie.
- `node:crypto` cho token invitation và hash token.

### Session

- JWT HS256, thời hạn 7 ngày.
- Cookie `nextask_session`: HttpOnly, SameSite=Lax, Secure khi production, Path=/.
- Không refresh token, không thu hồi token ở v1. Đây là đánh đổi có chủ đích; password reset và refresh nằm ngoài phạm vi.
- `JWT_SECRET` bắt buộc, tối thiểu 32 byte. Compose local dùng giá trị dev rõ ràng và README yêu cầu đổi ngoài local.
- `POST /auth/register` tạo user, hash argon2id, set cookie.
- `POST /auth/login` trả lỗi chung `INVALID_CREDENTIALS` cho email không tồn tại hoặc sai mật khẩu.
- `POST /auth/logout` xóa cookie.
- `GET /auth/me` trả user hiện tại.

### CSRF và CORS

- CORS exact origin, credentials.
- Request thay đổi dữ liệu kiểm tra `Origin` nếu header có mặt; origin phải nằm trong allowlist.
- SameSite=Lax giảm CSRF; origin check là lớp thứ hai.
- Không dùng localStorage cho JWT.
- Rate limit auth: ví dụ 5 request/phút/IP; store bộ nhớ vì v1 một instance.

### User model

- `email`, `emailNormalized` unique.
- `passwordHash`.
- `name`.
- `createdAt`, `updatedAt`.
- Index unique trên `emailNormalized`.

## 5. Membership và invitation

### Board member

Nhúng trong board:

```text
members: [{ userId, role: owner|member, joinedAt }]
```

- Owner nằm trong `members`.
- `ownerId` vẫn là nguồn xác thực quyền sở hữu.
- Danh sách board của user dùng `{ "members.userId": userId }`, không chỉ `ownerId`.
- Board access kiểm tra membership ở server; role lấy từ member document, không tin client.

### Ma trận quyền Phase 2

| Hành động | Owner | Member |
| --- | --- | --- |
| Xem board/items/tasks | Có | Có |
| Tạo/sửa note | Có | Có |
| Promote, move task | Có | Có |
| Đổi tên/cài đặt board | Có | Không |
| Tạo invitation | Có | Không |
| Xem member | Có | Có |

- Non-member trả `404` để không lộ board tồn tại.
- Member gọi thao tác Owner-only trả `403`.
- Chưa có xóa member, đổi role hoặc chuyển ownership trong Phase 2.

### Invitation

- Owner tạo invitation; server sinh token ngẫu nhiên 32 byte.
- Chỉ lưu SHA-256 của token, không lưu token thô.
- `expiresAt` 7 ngày; TTL index.
- Email là tùy chọn; nếu có, accept phải đúng email.
- API trả link một lần để Owner copy. Không gửi email tự động vì v1 không có SMTP.
- Accept invitation chạy trong transaction:
  - Xác thực token hash, hạn, chưa dùng.
  - Thêm user vào board nếu chưa là member.
  - Đánh dấu `usedAt`.
- Role invitation v1 luôn là `member`.
- UI trang `/invitations/[token]` và dialog mời.

## 6. `$jsonSchema` và migration

### Migration runner

- 2A đưa vào migration runner tối thiểu có version, collection `schema_migrations`.
- Mỗi migration chạy một lần, idempotent theo version.
- Lệnh:
  - `npm run db:migrate`.
  - Compose có service một lần `migrate` chạy sau `mongo-init`, trước `api`.
  - API kiểm tra schema version hiện tại; nếu chưa migrate thì fail rõ ràng.
- Test integration chạy migration trên `nextask_phase2_test`.

### Nội dung migration Phase 2

2A:

1. Tạo `users` và index email unique.
2. Tạo user seed cho owner cũ.
3. Backfill `members` cho board cũ.
4. Tạo `invitations` và index/TTL.

2B:

1. Chuyển toàn bộ index từ `ensureIndexes()` sang migration.
2. Áp `$jsonSchema` cho `users`, `boards`, `items`, `tasks`, `invitations`.
3. Kiểm tra dữ liệu Phase 1 thỏa validator.

### Validator

- Bắt buộc trường cốt lõi.
- Enum cho role, type, priority, lifecycle.
- Kiểu BSON cho ObjectId, Date, number, array.
- `validationLevel: "strict"`, `validationAction: "error"`.
- Test insert trực tiếp qua driver vào dữ liệu sai; MongoDB phải từ chối.
- Không dựa vào Mongoose schema để thay `$jsonSchema`.

## 7. Optimistic concurrency

### Phạm vi

- Board update: expectedVersion.
- Task move: expectedVersion.
- Promote: expected item version.
- Item sync: mỗi item hiện có gửi expectedVersion.
- Item/task persist version; client nhận version trong response và event.

### Cơ chế

- Filter update gồm `_id`/business key và `version`.
- Update tăng `$inc: { version: 1 }`.
- Nếu không match:
  - Không tồn tại: `404`.
  - Tồn tại nhưng version khác: `409 VERSION_CONFLICT`, trả `currentVersion` và dữ liệu mới nhất.
- Không dùng `updatedAt` thay version.

### Item sync

Đề xuất chạy sync note trong transaction:

- Đọc item hiện có.
- Kiểm tra expectedVersion.
- Upsert note mới, update note cũ, delete note chưa promote bị bỏ khỏi canvas.
- Nếu bất kỳ item nào conflict, abort toàn bộ transaction và trả 409.

Lý do: tránh nửa bảng đã ghi, nửa bảng chưa; đây cũng là bài học transaction thứ hai.

### Client

- Task move conflict: refetch tasks, hiển thị cảnh báo.
- Promote conflict: refetch items/board.
- Whiteboard sync conflict: dừng ghi, refetch workspace; Phase 2 có thể yêu cầu reload board vì chưa có realtime.
- Không âm thầm ghi đè.

## 8. API và UI thay đổi

### API mới

| Method | Path | Quyền |
| --- | --- | --- |
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/logout` | Auth |
| GET | `/auth/me` | Auth |
| PATCH | `/boards/:boardId` | Owner |
| POST | `/boards/:boardId/invitations` | Owner |
| POST | `/invitations/:token/accept` | Auth |
| GET | `/boards/:boardId/members` | Member |
| PATCH | `/boards/:boardId/tasks/:taskId` | Member + expectedVersion |
| POST | `/boards/:boardId/items/:itemId/promote` | Member + expectedItemVersion |
| PUT | `/boards/:boardId/items` | Member + expectedVersion từng note |

- Bỏ `DEMO_OWNER_ID` khỏi request context.
- Board DTO bổ sung `members`, `role` của viewer nếu cần.
- Lỗi mới: `UNAUTHENTICATED`, `FORBIDDEN`, `VERSION_CONFLICT`, `INVITATION_INVALID`.
- Mọi response lỗi vẫn dùng envelope và requestId hiện có.

### UI

- `/login`, `/register`.
- `/` danh sách board của user; chưa đăng nhập chuyển login.
- Board page dùng cookie credentials.
- Header có user menu/logout.
- Owner thấy nút mời; Member không thấy.
- Dialog tạo link invitation và copy.
- Trang accept invitation.
- Conflict banner và nút tải lại dữ liệu.
- Server page đọc cookie và forward `Cookie` header khi fetch nội bộ.

## 9. Dữ liệu Phase 1 và phương án owner

Board hiện tại thuộc demo id `000000000000000000000001`; user collection chưa tồn tại. Có ba cách xử lý.

### Cách A - seed owner thật từ env (khuyến nghị)

- Migration tạo user có `_id = 000000000000000000000001`, email/password lấy từ `SEED_OWNER_EMAIL`/`SEED_OWNER_PASSWORD` trong `.env` local.
- Compose local có giá trị dev-only mặc định để `docker compose up` vẫn chạy; README bắt buộc đổi ngoài local.
- Backfill member owner cho board.
- User đăng nhập bằng email/password đã cấu hình, thấy dữ liệu cũ.
- Không đặt mật khẩu trong chat; chỉ đặt trong `.env` local.
- Nếu chưa có board cũ, không cần seed.
- Có thể tạo user thứ hai để test Member.

Ưu điểm: giữ dữ liệu, không cần script đổi owner. Nhược điểm: cần cấu hình env một lần.

### Cách B - tạo tài khoản mới rồi transfer board

- Auth chạy trước.
- Người dùng đăng ký tài khoản thật.
- Chạy CLI một lần để chuyển `ownerId`/member owner của board cũ sang email mới.
- Phức tạp hơn nhưng giữ được email thật nếu không muốn seed bằng email cấu hình.

### Cách C - bỏ board Phase 1

- Không migrate dữ liệu cũ.
- Tạo tài khoản mới và board mới.
- Đơn giản nhưng mất dữ liệu đang có; không khuyến nghị.

Khuyến nghị: Cách A.

## 10. Kiểm thử và nghiệm thu

### Phase 2A

- Register tạo user, email unique, password hash không phải plaintext.
- Login đúng trả cookie HttpOnly; sai trả 401.
- Logout xóa cookie.
- `/auth/me` cần cookie.
- Board list chỉ trả board có membership.
- Owner tạo invitation; Member accept; member vào board.
- Invitation hết hạn/đã dùng bị từ chối.
- Member gọi rename board và invitation bị 403.
- Non-member bị chặn.
- Migration chạy trên bản sao dữ liệu Phase 1, board/note/task/version giữ nguyên.
- Browser: đăng ký, đăng nhập, tạo board, mời và accept.

### Phase 2B

- `$jsonSchema` từ chối insert trực tiếp sai enum/required.
- Migration idempotent.
- Concurrent task update: 200/409, version tăng một lần.
- Stale item sync: 409, transaction không ghi nửa chừng.
- Stale promote: 409.
- Client refetch sau conflict.
- Typecheck/lint/format pass.
- Full suite ba lần liên tiếp pass.
- Docker Compose chạy migration trước API, health vẫn xanh.

## 11. Ngoài phạm vi Phase 2

- Refresh token, thu hồi session, password reset, email verification.
- OAuth, 2FA.
- Gửi email SMTP.
- Xóa member, đổi role, chuyển ownership.
- Facilitator role.
- Realtime, change streams.
- CRDT/collaborative editing.
- Column editing nâng cao, filter/report.
- `$jsonSchema` cho các collection của phase sau.

## 12. Rủi ro

- Migration và `$jsonSchema` có thể làm hỏng dữ liệu nếu chạy sai; phải test trên database copy/trước, backup trước khi migrate.
- Cookie/JWT trên hai port localhost cần cấu hình CORS/cookie đúng.
- Version conflict ở whiteboard có thể gây reload; chưa có realtime.
- Invitation email không được gửi tự động; Owner phải copy link.
- Rate limit bộ nhớ chỉ đúng một instance.
- Seed owner bằng env là tiện cho local nhưng phải tránh dùng mật khẩu mặc định ngoài local.
- tldraw license vẫn là giới hạn UI hiện có.

## 13. Quyết định cần chốt

1. Chia Phase 2 thành 2A và 2B, hay làm một Phase 2 duy nhất?
   - Khuyến nghị: chia 2A/2B.
2. Giữ dữ liệu Phase 1 bằng seed owner từ env, transfer sau khi đăng ký, hay bỏ dữ liệu cũ?
   - Khuyến nghị: seed owner từ env.
3. Session dùng một JWT cookie 7 ngày, hay access token + refresh token?
   - Khuyến nghị: một JWT cookie 7 ngày cho v1.

Giả định đã chốt trong proposal: invitation chỉ tạo link để Owner copy; không gửi email thật trong v1. Email delivery ngoài phạm vi.

Sau khi chốt ba điểm trên, bước tiếp theo là viết spec Phase 2 và implementation plan, chưa viết code.
