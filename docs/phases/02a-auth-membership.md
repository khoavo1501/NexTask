# Giai đoạn 2A - Auth, membership và quyền

- Trạng thái: Hoàn thành ngày 2026-10-28; đã merge vào `release/v0.2`
- Ngày lập: 2026-10-28
- Tiền đề: Giai đoạn 1 hoàn thành
- Đề xuất gốc: [02-proposal.md](./02-proposal.md)
- Implementation plan: [2026-10-28-phase-2a-auth-membership.md](../superpowers/plans/2026-10-28-phase-2a-auth-membership.md)
- Kiến trúc: [../architecture.md](../architecture.md)
- Nhánh: `feat/phase-2a-auth-membership`; merge `c15603e`; follow-up fix merge `9aa67ec`; feature/fix đã xóa

## 1. Mục tiêu

Đưa NexTask từ demo owner cố định sang tài khoản thật và board có thành viên, nhưng chưa làm `$jsonSchema` hay optimistic concurrency. Hai phần đó thuộc Phase 2B.

Sau Phase 2A:

- Người dùng đăng ký, đăng nhập, đăng xuất.
- Mỗi board có Owner và Member.
- Owner mời thành viên bằng link.
- Member nhận lời mời và làm việc trên board.
- Member bị chặn ở server với thao tác chỉ Owner.
- Board và dữ liệu Phase 1 vẫn còn, owner cũ đăng nhập được bằng tài khoản seed.

## 2. Quyết định đã chốt

1. Chia Phase 2 thành 2A và 2B; tài liệu này chỉ là 2A.
2. Giữ dữ liệu Phase 1 bằng cách seed owner từ `.env`, giữ nguyên `_id` demo hiện tại.
3. Session dùng một JWT trong cookie HttpOnly 7 ngày; chưa có refresh token.
4. Invitation chỉ tạo link để Owner copy; không gửi email thật trong v1.

## 3. Hiện trạng dữ liệu

Tại ngày 2026-10-28, database `nextask` có:

- 1 board `Retro E2E Phase 1`, `ownerId = 000000000000000000000001`.
- 2 item note, 2 task.
- Không có `members` trong board.
- Không có collection `users` hoặc `invitations`.
- Item/task đã có trường `version`; Phase 2A không thay đổi ngữ nghĩa version.

Migration 2A phải giữ nguyên số lượng, nội dung, `_id`, `createdAt` và `version` của các document hiện có.

## 4. Phạm vi

### Có trong 2A

- Model `users`.
- Đăng ký, đăng nhập, đăng xuất, `/auth/me`.
- Password hash argon2id.
- JWT cookie HttpOnly, SameSite=Lax, thời hạn 7 ngày.
- Auth middleware, board access middleware.
- `members[]` trong board; owner cũng là member.
- Tạo board mới có owner member.
- Danh sách board theo membership.
- Owner đổi tên board.
- Owner tạo invitation link.
- Người dùng đã đăng nhập accept invitation.
- UI login/register/logout, board list, invite dialog, accept page.
- Ẩn nút Owner-only khỏi Member; server vẫn là nguồn kiểm tra quyền.
- Migration runner tối thiểu, seed owner, backfill member.
- Chuyển toàn bộ index hiện có và index mới sang migration; bỏ `autoIndex` và `ensureIndexes()` khỏi startup runtime.
- API kiểm tra migration version trước khi serve.
- Test auth, invitation, role và preservation dữ liệu.

### Không có trong 2A

- `$jsonSchema` collection validator.
- Optimistic concurrency/expectedVersion.
- Refresh token, thu hồi token, password reset, email verification.
- Gửi email SMTP.
- Xóa thành viên, đổi role, chuyển ownership.
- Facilitator role.
- Realtime/Change Streams.
- Sửa cột, filter, voting, report.
- CRDT.

## 5. Kiến trúc module

### API

```text
apps/api/src/
  config/env.ts                 # JWT_SECRET, cookie, seed owner
  db/
    migrate.ts                  # entrypoint chạy migration
    migrations/001-phase-2a.ts  # index, seed owner, backfill members
    schema-version.ts           # đọc/kiểm tra schema_migrations
  modules/
    auth/
      auth.router.ts
      auth.service.ts
      auth.middleware.ts
      password.ts
      jwt.ts
    users/
      user.model.ts
    invitations/
      invitation.model.ts
      invitation.service.ts
      invitation.router.ts
    boards/
      board.model.ts            # thêm members
      board.service.ts          # scope theo membership
      board.router.ts           # owner-only patch
      board-access.ts           # membership + role
```

Middleware auth:
- Đọc cookie `nextask_session`.
- Verify JWT bằng `jose`.
- Load user theo `sub`.
- Gắn user vào request context.
- Không có user hoặc token hết hạn: 401 `UNAUTHENTICATED`.

Middleware board access:
- Board id hợp lệ.
- User là member của board.
- Non-member: 404 `NOT_FOUND` để không lộ board.
- Gắn board và role vào request context.
- Không tin role do client gửi.

### Web

```text
apps/web/
  app/
    login/page.tsx
    register/page.tsx
    invitations/[token]/page.tsx
  components/
    auth-header.tsx
  features/
    workspace/invite-dialog.tsx
    workspace/board-workspace.tsx
  lib/
    api.ts                      # credentials: include
    server-api.ts               # forward cookie
```

## 6. User model

Collection `users`:

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `_id` | ObjectId | User seed giữ id demo cũ |
| `email` | string | Email gốc |
| `emailNormalized` | string | trim + lowercase; unique |
| `name` | string | 1-80 ký tự |
| `passwordHash` | string | argon2id |
| `createdAt`, `updatedAt` | Date | timestamps |

Index unique: `{ emailNormalized: 1 }`.

Quy tắc mật khẩu:

- Tối thiểu 12 ký tự.
- Tối đa 128 ký tự.
- Không trim mật khẩu.
- Hash bằng argon2id.
- Không trả `passwordHash` trong bất kỳ response nào.

## 7. Auth

### Thư viện

- `jose` 6.2.13 cho JWT.
- `argon2` 0.45.1 cho hash.
- `express-rate-limit` 8.7.1 cho auth endpoint.
- `cookie-parser` 1.4.7 để đọc cookie.

### JWT

- Thuật toán HS256.
- Claims: `sub` = user id, `iss = "nextask-api"`, `aud = "nextask-web"`, `iat`, `exp`.
- Thời hạn 7 ngày.
- Secret `JWT_SECRET`, tối thiểu 32 byte.
- Verify issuer/audience và thời hạn.
- Không đặt email/name trong token nếu không cần.

### Cookie

- Tên `nextask_session`.
- `HttpOnly: true`.
- `SameSite: "lax"`.
- `Path: "/"`.
- `Max-Age: 604800`.
- `Secure` theo env `COOKIE_SECURE`.
- Local Docker HTTP đặt `COOKIE_SECURE=false`; production phải đặt `true`.
- Logout xóa cookie với cùng path/flags.
- Không dùng localStorage.

Token không bị thu hồi trước hạn trong v1. Logout chỉ xóa cookie ở client. Đây là đánh đổi đã biết.

### API

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Tạo user, set cookie, trả user |
| POST | `/api/v1/auth/login` | Xác thực, set cookie |
| POST | `/api/v1/auth/logout` | Xóa cookie; idempotent, không cần token hợp lệ |
| GET | `/api/v1/auth/me` | User hiện tại, yêu cầu đăng nhập |

Register:

- Body: `email`, `password`, `name`.
- Email normalize và unique.
- Trùng email: 409 `EMAIL_IN_USE`.
- Hash password trước khi ghi.
- Set cookie ngay sau khi tạo thành công.

Login:

- Sai email hoặc mật khẩu đều trả 401 `INVALID_CREDENTIALS`.
- Không tiết lộ email có tồn tại hay không.
- Set cookie khi thành công.

### Bảo vệ

- Rate limit auth: 5 request/phút/IP cho login và register.
- Store bộ nhớ vì v1 một API instance.
- CORS exact origin, credentials.
- Với request thay đổi dữ liệu, nếu có header `Origin` thì phải nằm trong allowlist.
- Cookie SameSite=Lax giảm CSRF; kiểm tra Origin là lớp thứ hai.
- Không trả stack trace hoặc chi tiết DB.

### Env mới

- `JWT_SECRET`
- `COOKIE_SECURE`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD`
- `SEED_OWNER_NAME` (mặc định `Demo Owner`)

Compose local có giá trị dev-only để `docker compose up` vẫn chạy. README cảnh báo đổi mọi secret khi ra khỏi local.

## 8. Board membership

### Board model

Thêm trường:

```text
members: [
  {
    userId: ObjectId,
    role: "owner" | "member",
    joinedAt: Date
  }
]
```

Quy ước:

- `ownerId` vẫn là nguồn xác thực owner.
- Owner phải có mặt trong `members` với role `owner`.
- Mỗi user tối đa một membership trong board.
- Owner không thể bị xóa.
- Tạo board mới: `ownerId` là user hiện tại và member owner được thêm ngay.
- Board cũ: migration thêm member owner.

### Board access

- Danh sách board dùng `{ "members.userId": userId }`.
- Không dùng `ownerId` để list board của member.
- Index `{ "members.userId": 1, updatedAt: -1 }`.
- Non-member nhận 404.
- Member gọi endpoint owner-only nhận 403.
- Owner có toàn bộ quyền của member.

### Ma trận quyền

| Hành động | Owner | Member |
| --- | --- | --- |
| Xem board/items/tasks | Có | Có |
| Tạo/sửa note | Có | Có |
| Promote, move task | Có | Có |
| Xem members | Có | Có |
| Đổi tên board | Có | Không |
| Tạo invitation | Có | Không |

### API board

| Method | Path | Quyền |
| --- | --- | --- |
| GET | `/api/v1/boards` | Auth, chỉ board có membership |
| POST | `/api/v1/boards` | Auth, tạo owner member |
| GET | `/api/v1/boards/:boardId` | Member |
| PATCH | `/api/v1/boards/:boardId` | Owner, body `{ name }` |
| GET | `/api/v1/boards/:boardId/members` | Member |
| POST | `/api/v1/boards/:boardId/invitations` | Owner |

Board DTO bổ sung:

- `members: [{ userId, role, joinedAt }]`
- `viewerRole: "owner" | "member"`

`GET /members` trả thêm `name`, `email` của từng user bằng lookup trong application code; không trả passwordHash.

## 9. Invitation

### Model

Collection `invitations`:

| Trường | Kiểu | Ghi chú |
| --- | --- | --- |
| `_id` | ObjectId | |
| `boardId` | ObjectId | |
| `emailNormalized` | string hoặc null | Ràng buộc người nhận nếu có |
| `tokenHash` | string | SHA-256 của token thô |
| `role` | `member` | v1 chỉ member |
| `createdBy` | ObjectId | Owner |
| `expiresAt` | Date | 7 ngày |
| `usedAt` | Date hoặc null | |
| `createdAt` | Date | |

Index:

- unique `{ tokenHash: 1 }`.
- `{ boardId: 1, createdAt: -1 }`.
- TTL `{ expiresAt: 1 }`, `expireAfterSeconds: 0`.

### Tạo invitation

- Owner only.
- Body: `{ email?: string }`.
- Sinh 32 byte ngẫu nhiên, encode base64url.
- Chỉ lưu SHA-256 hash.
- Trả token thô một lần cùng:
  - `path`: `/invitations/<token>`
  - `expiresAt`
- UI ghép origin hiện tại và cho copy link.
- Không gửi email.
- Không log token hoặc hash.

### Accept invitation

- Endpoint yêu cầu đăng nhập.
- Tìm invitation theo token hash.
- Điều kiện:
  - Chưa dùng.
  - Chưa hết hạn.
  - Email khớp nếu invitation có email.
- Nếu user đã là member: đánh dấu used nếu cần và trả 200.
- Nếu chưa: thêm member `role: member`, `joinedAt: now`.
- Dùng transaction để cập nhật board và invitation atomically.
- Token sai/hết hạn/đã dùng: 404 `INVITATION_INVALID` để không lộ thông tin.
- Email không khớp: 403 `INVITATION_EMAIL_MISMATCH`.
- Owner accept invitation vào board mình: trả board hiện tại, không thêm member.
- Link accept:
  - Chưa đăng nhập: chuyển `/login?next=/invitations/<token>`.
  - Sau login/register, quay lại accept page.

## 10. Migration

### Runner

- Collection `schema_migrations` lưu version và appliedAt.
- Migration `001-phase-2a` chạy một lần.
- Lệnh `npm run db:migrate`.
- Compose service `migrate` chạy sau `mongo-init`, trước `api`.
- API kiểm tra version đã áp dụng trước khi listen.
- Nếu chưa migrate, API fail với log rõ ràng.
- Test integration chạy migration trên `nextask_phase2_test`.
- Trước khi migrate database ứng dụng thật, tạo backup `mongodump` một lần; không chạy migration trực tiếp trên dữ liệu chưa backup.
- Từng bước migration phải idempotent/retryable để lần chạy lại sau lỗi giữa chừng không tạo user/member/index trùng.

### Nội dung `001-phase-2a`

1. Đảm bảo index hiện có:
   - board owner/updatedAt.
   - item boardId/shapeId unique.
   - item boardId/type.
   - task sourceItemId unique partial.
   - task boardId/columnId/order.
2. Tạo index mới:
   - users emailNormalized unique.
   - boards members.userId/updatedAt.
   - invitations tokenHash unique.
   - invitations boardId/createdAt.
   - invitations expiresAt TTL.
3. Seed owner:
   - Chỉ khi có board với `ownerId = 000000000000000000000001` và chưa có user id đó.
   - Tạo user cùng `_id`, email/password từ env.
   - Hash mật khẩu bằng argon2id.
   - Không reset mật khẩu nếu user đã tồn tại.
4. Backfill member owner cho mọi board chưa có member owner:
   - `userId = ownerId`.
   - `role: owner`.
   - `joinedAt = board.createdAt`.
5. Xác nhận mọi `board.ownerId` đều có user tương ứng; nếu không, migration fail.
6. Không đổi item, task, version hay timestamp.
7. Ghi version `001-phase-2a` vào `schema_migrations`.

### Seed credentials

- `SEED_OWNER_EMAIL` mặc định local: `owner@nextask.local`.
- `SEED_OWNER_PASSWORD` local: giá trị dev-only tối thiểu 12 ký tự, nằm trong `.env.example`/Compose.
- `SEED_OWNER_NAME` mặc định `Demo Owner`.
- Production không dùng seed này.
- Nếu board cũ tồn tại nhưng thiếu seed env, migration dừng với lỗi rõ ràng.

### Bỏ `ensureIndexes` runtime

- `ensureIndexes()` bị loại khỏi startup và test helper; index do migration tạo.
- API chỉ đọc version migration; không tự sửa schema.
- Test kiểm tra migration idempotent và index tồn tại.

## 11. UI

### Login/register

- `/login`, `/register`.
- Form email, password; register thêm name.
- Hiển thị lỗi API thân thiện.
- Sau thành công chuyển `/` hoặc `next` an toàn.
- `next` chỉ được là đường dẫn tương đối bắt đầu bằng một `/`, không bắt đầu bằng `//`; nếu không hợp lệ, quay về `/`.
- Không lưu token trong localStorage.

### Bảo vệ trang

- Root page server đọc cookie, forward `Cookie` header khi fetch board list nội bộ.
- API trả 401: chuyển `/login`.
- Board page client fetch với `credentials: "include"`; 401 chuyển login.
- Logout gọi API rồi chuyển `/login`.

### Header

- Tên user hiện tại và nút Đăng xuất.
- Link board list.
- Không hiển thị email nếu không cần.
- Board header hiển thị role hiện tại để người dùng biết mình là Owner hay Member.

### Board

- Owner thấy nút `Mời`.
- Member không thấy nút `Mời`.
- Dialog mời:
  - Email tùy chọn.
  - Tạo link, hiển thị và copy.
  - Cảnh báo link chỉ hiện một lần.
- Accept page hiển thị board và thông báo tham gia thành công.
- Member vẫn promote/move note/task bình thường.
- Không thêm UI xóa thành viên/đổi role.
- Owner có nút `Đổi tên` trên header board:
  - Mở dialog nhập tên.
  - Gọi PATCH board.
  - Cập nhật tên trong state.
  - Member không thấy nút; server vẫn trả 403 nếu gọi trực tiếp.

## 12. Contracts và lỗi

Contracts mới:

- Auth request/response.
- User DTO (không có passwordHash).
- Board DTO thêm members, viewerRole.
- Invitation create/accept.
- Member DTO.

Mã lỗi:

- `UNAUTHENTICATED` 401.
- `INVALID_CREDENTIALS` 401.
- `EMAIL_IN_USE` 409.
- `FORBIDDEN` 403.
- `INVITATION_INVALID` 404.
- `INVITATION_EMAIL_MISMATCH` 403.
- `RATE_LIMITED` 429.

Nếu migration version chưa đủ, API fail ngay khi khởi động, ghi log rõ ràng và không listen. Đây không phải response HTTP vì API chưa phục vụ request.

## 13. Kiểm thử

### Auth

- Register tạo user, hash khác plaintext, email normalize.
- Email trùng trả 409.
- Login đúng set cookie HttpOnly.
- Login sai trả 401 chung.
- Logout xóa cookie.
- `/auth/me` thiếu cookie trả 401.
- JWT hết hạn/sai chữ ký bị từ chối.
- Origin không hợp lệ bị chặn ở mutation.
- Rate limit login/register.

### Membership và role

- Tạo board có owner member.
- Board list chỉ trả board có membership.
- Owner mời, member accept thành công.
- Invitation hết hạn/đã dùng/email sai bị từ chối.
- Member đọc/sửa note/promote/move được.
- Member gọi PATCH board và tạo invitation bị 403.
- Owner PATCH đổi tên board thành công.
- Non-member nhận 404.
- Member list không lộ passwordHash.
- Owner không mất membership.

### Migration

- Fixture board Phase 1 không có members; chạy migration thêm owner member.
- Seed owner tạo đúng id demo, đăng nhập được bằng password env.
- Chạy migration hai lần không tạo trùng user/member.
- Số lượng item/task, nội dung, version, createdAt không đổi.
- Toàn bộ index cần thiết tồn tại.
- API fail nếu schema version chưa áp dụng.

### Regression

- Các test Phase 1 được refactor để đăng ký/đăng nhập và dùng cookie.
- Promote transaction, unique partial index và rollback vẫn pass.
- Web build, Docker Compose và browser flow pass.

### Browser

- Seed owner đăng nhập thấy board Phase 1 và dữ liệu cũ.
- Tạo tài khoản Member thứ hai.
- Owner tạo invitation link.
- Member mở link, accept, thấy board.
- Member promote một note và move task được.
- Member không thấy nút mời.
- Request PATCH board từ Member bị 403 (kiểm tra API).

## 14. Tiêu chí nghiệm thu 2A

- [ ] User đăng ký/đăng nhập/logout bằng cookie HttpOnly.
- [ ] Board Phase 1 vẫn còn sau migration; seed owner đăng nhập thấy dữ liệu.
- [ ] Migration idempotent, không đổi item/task/version.
- [ ] Board có members; owner cũng là member.
- [ ] Board list theo membership.
- [ ] Owner tạo invitation link; Member accept.
- [ ] Member bị chặn 403 ở thao tác Owner-only.
- [ ] Non-member bị chặn.
- [ ] Member vẫn promote/move task.
- [ ] Auth/membership tests dùng MongoDB thật.
- [ ] Full test ba lần liên tiếp pass, typecheck/lint/format sạch.
- [ ] Docker Compose chạy migrate trước API, ba service healthy.
- [ ] Không có `$jsonSchema` hoặc version enforcement trong 2A.

## 15. Rủi ro và giả định

- Migration chạy trên dữ liệu thật có thể hỏng nếu sai; bắt buộc backup và test trên bản sao.
- Cookie Secure phải tắt ở local HTTP; production phải bật.
- JWT secret local mặc định chỉ dùng cho dev.
- Password seed owner nằm trong env local; không dùng ngoài local.
- Không gửi email; Owner phải copy link.
- Không có refresh/revocation; token 7 ngày vẫn hợp lệ sau logout ở phía client.
- Rate limit bộ nhớ chỉ đúng một instance.
- Board membership nhúng phù hợp team nhỏ; chưa có xóa/đổi role.
- Chưa có optimistic concurrency; người dùng vẫn có thể ghi đè dữ liệu cũ trong 2A. 2B giải quyết.
- tldraw license watermark vẫn còn.

## 16. Chuyển sang 2B

Sau khi 2A được duyệt và kiểm chứng, 2B sẽ thêm:

- `$jsonSchema` cho các collection.
- Di chuyển/hoàn thiện index migration nếu còn.
- expectedVersion cho board, task, promote và item sync.
- Client conflict handling.
- Test concurrent write và schema rejection.

## 17. Kết quả triển khai 2A

### Git

Các commit trên feature:

- `370ff99` auth primitives và config.
- `8c89e88` migration runner, seed owner.
- `4853230` auth API và middleware.
- `d1d94f4` membership, role và refactor board APIs.
- `766e6e0` invitation link và accept.
- `500f8dc` web auth và board list bảo vệ.
- `61879bf` invite/accept/rename UI.
- `69114a8` docs verification.
- `c15603e` merge 2A vào `release/v0.2`.
- `375cc07` fix label stale, `a098a99` docs follow-up, `9aa67ec` merge follow-up.
- Xem `git log` để lấy commit tài liệu cuối trên release.

`main` và `release/v0.2` vẫn ở `6d3d11b` trong lúc triển khai feature.

### Backup và migration

- Backup trước migration: `backups/nextask-before-2a-2026-10-28.gz`, kích thước `1.8K`, `gzip -t` pass.
- Rehearsal: restore backup vào `nextask_phase2_rehearsal`, migrate thành công, sau đó xóa database rehearsal.
- Migration thật chạy một lần, log `applied: ["001-phase-2a"]`.
- Trước migration: 1 board, 2 item, 2 task, 0 user.
- Sau migration: 1 board, 2 item, 2 task, 1 seed user, owner member được backfill.
- Nội dung và version giữ nguyên:
  - Item version: `31`, `13`.
  - Task version: `4`, `1`.
- Sau browser E2E: 2 user, board có owner + member; invitation đã `usedAt`.
- Browser flow:
  - `/` chưa đăng nhập chuyển `/login`.
  - Seed owner đăng nhập thấy board Phase 1 và dữ liệu cũ.
  - Owner tạo invitation link qua UI.
  - User thứ hai đăng ký, accept link, thấy role `Member`.
  - Member không thấy nút `Mời`/`Đổi tên`.
  - Gọi PATCH board bằng cookie Member trả `403 FORBIDDEN`.
- Docker Compose: `mongo`, `api`, `web` healthy; migrate service exit 0.
- Health: `status: ok`, `rs0`, primary `true`, latency `1 ms`.

### Kiểm chứng tự động

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- Full suite ba lần liên tiếp, mỗi lần `10` file, `46` test pass:
  - Lần 1: 8.06 s.
  - Lần 2: 7.77 s.
  - Lần 3: 7.82 s.
- Test dùng MongoDB replica set thật; test DB Phase 2 là `nextask_phase2_test`, migration test dùng DB riêng.
- Auth: register/login/logout/me, cookie, email trùng, sai mật khẩu, token hết hạn, origin lạ, rate limit.
- Membership: owner/member/non-member, owner rename, member promote/move, member list.
- Invitation: hash token, email match, expiry, used token, member không được invite, TTL index.
- Migration: seed/backfill, idempotent, preservation.
- Promotion transaction, duplicate và rollback tests Phase 1 vẫn pass sau khi refactor auth.

### Giới hạn còn lại

- Chưa có `$jsonSchema`; thuộc 2B.
- Chưa enforce expectedVersion; thuộc 2B.
- Không gửi email invitation; Owner copy link.
- Không có refresh/revocation token, password reset hoặc member removal.
- Rate limit lưu bộ nhớ, phù hợp một API instance.
- Merge feature vào `release/v0.2` được thực hiện sau commit tài liệu; chưa merge vào `main` để chờ 2B.

### Tiêu chí 2A

- [x] Register/login/logout bằng cookie HttpOnly.
- [x] Seed owner đăng nhập thấy dữ liệu Phase 1.
- [x] Migration idempotent, preservation item/task/version.
- [x] Board có members; owner là member.
- [x] Board list theo membership.
- [x] Owner tạo invitation link; Member accept.
- [x] Member bị chặn 403 ở thao tác Owner-only.
- [x] Non-member bị chặn 404.
- [x] Member promote/move được.
- [x] Auth/membership/invitation tests dùng MongoDB thật.
- [x] Full suite ba lần, typecheck/lint/format sạch.
- [x] Docker migrate trước API; ba service healthy.
- [x] Chưa thêm `$jsonSchema` hoặc version enforcement trong 2A.
