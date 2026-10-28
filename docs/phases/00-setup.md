# Giai đoạn 0 - Thiết lập nền tảng

- Trạng thái: Hoàn thành ngày 2026-10-28
- Ngày lập: 2026-10-28
- Tài liệu kiến trúc: [../architecture.md](../architecture.md)
- Biên bản kiểm chứng: [Kết quả triển khai](#11-kết-quả-triển-khai)

## 1. Mục tiêu

Dựng bộ khung chạy được bằng một lệnh, tạo nền đúng cho các giai đoạn sau:

- MongoDB 8.0 chạy replica set một nút `rs0`, có transaction và Change Streams.
- API Express 5 + TypeScript strict, kết nối Mongoose, endpoint health kiểm tra cả kết nối lẫn replica set.
- Web Next.js tối giản hiển thị trạng thái API.
- Docker Compose chạy cả ba service, có healthcheck và volume dữ liệu.
- Monorepo npm workspaces, lint, format, typecheck và test nền.
- Tài liệu phiên và quyết định được cập nhật.

Giai đoạn này chưa có auth, board, item, task, tldraw, Kanban hay Change Streams.

## 2. Kiến thức MongoDB của giai đoạn

### Replica set là điều kiện tiên quyết

Transaction nhiều document và Change Streams yêu cầu MongoDB chạy dưới dạng replica set (hoặc sharded cluster). Một `mongod` đơn lẻ không đủ.

Replica set một nút vẫn hợp lệ cho local:

- `rs.initiate` tạo một member.
- Majority trên một nút là một, nên `w: "majority"` vẫn chạy.
- Có oplog để Change Streams hoạt động.
- Không có failover thật. Đây là đánh đổi có chủ đích để giảm tài nguyên local.

### `hello` và trạng thái primary

`db.admin().command({ hello: 1 })` trả thông tin topology. API health dùng:

- `setName` phải bằng `rs0`. Nếu thiếu, deployment không phải replica set.
- `isWritablePrimary` phải là true để nhận ghi.
- `ping` xác nhận DB phản hồi.

Kết nối TCP thành công chưa đủ. Một MongoDB standalone vẫn ping được nhưng mọi transaction/Change Streams sẽ thất bại. Vì vậy API phải kiểm tra `setName` ngay lúc khởi động và trong health.

### Ghi majority

`w: "majority"` chờ đa số member xác nhận. Trên một nút, đa số là một, nhưng dùng đúng ngữ nghĩa ngay từ đầu giúp mã chuyển sang replica set ba nút mà không phải sửa logic. Giai đoạn 0 chưa ghi dữ liệu nghiệp vụ; lựa chọn này được ghi lại để dùng ở Giai đoạn 1.

### Mongoose trong giai đoạn này

- Tắt `autoIndex`; giai đoạn này chưa tạo index nghiệp vụ.
- Tắt buffer để lỗi kết nối lộ ra ngay, không giữ request chờ vô hạn.
- Đăng ký sự kiện connected/disconnected để log.
- Health đọc trạng thái kết nối và gọi `hello` qua driver bên dưới.

## 3. Quyết định kỹ thuật

| Hạng mục | Quyết định |
| --- | --- |
| Workspace | npm workspaces với `apps/api`, `apps/web`, `packages/contracts` |
| Node | 26, image `node:26-bookworm-slim` |
| TypeScript | 6.0.3, strict, `noUncheckedIndexedAccess` |
| API | Express 5.3.0, pino, zod |
| DB | MongoDB 8.0, replica set `rs0`, một nút |
| ODM | Mongoose 9.11.4, `autoIndex: false`, `bufferCommands: false` |
| Web | Next.js 16.4.3 App Router, Tailwind 4.3.3 |
| Test | Vitest 5.0.5; integration dùng MongoDB thật |
| Contracts | Package `@nextask/contracts` build bằng `tsc`; API và web dùng `dist`; root build contracts trước khi typecheck/dev |
| Container | Multi-stage Dockerfile; API và web chạy non-root |
| Mongo local | Không auth, chỉ publish cổng ra `127.0.0.1`; production phải bật auth/TLS |
| Mạng nội bộ | Tên member replica set là `mongo:27017` để API container truy cập |
| Host access | Dùng `directConnection=true` hoặc `docker compose exec mongo mongosh` |

### Vì sao TypeScript 6.0.3

TypeScript 7.0.2 là bản mới nhất tại thời điểm lập kế hoạch, nhưng `typescript-eslint` 8.72.1 công bố peer dependency `typescript >=4.8.4 <6.1.0`. Dùng TypeScript 6.0.3 giữ lint và type-aware rule hoạt động. Khi `typescript-eslint` hỗ trợ TypeScript 7, nâng cấp sẽ được đánh giá riêng.

### Vì sao chưa bật auth MongoDB

MongoDB có auth cần keyfile, khởi tạo user và phối hợp restart trong Compose. Giai đoạn 0 ưu tiên dựng đúng replica set và luồng kết nối. Cổng Mongo chỉ bind vào loopback nên không lộ ra mạng ngoài máy phát triển. README sẽ ghi rõ cấu hình này không dùng cho production. Auth DB là hạng mục hardening, không phải tiêu chí v1.

## 4. Danh sách file dự kiến

```text
package.json
package-lock.json
tsconfig.base.json
eslint.config.mjs
.prettierrc.json
.prettierignore
.gitignore
.dockerignore
.env.example
docker-compose.yml
README.md

apps/api/package.json
apps/api/tsconfig.json
apps/api/vitest.config.ts
apps/api/Dockerfile
apps/api/src/config/env.ts
apps/api/src/lib/logger.ts
apps/api/src/db/mongoose.ts
apps/api/src/db/assert-replica-set.ts
apps/api/src/middleware/request-id.ts
apps/api/src/middleware/error-handler.ts
apps/api/src/modules/health/health.service.ts
apps/api/src/modules/health/health.router.ts
apps/api/src/app.ts
apps/api/src/server.ts
apps/api/src/types/express.d.ts
apps/api/test/env.test.ts
apps/api/test/health.integration.test.ts

apps/web/package.json
apps/web/tsconfig.json
apps/web/next.config.ts
apps/web/postcss.config.mjs
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/globals.css
apps/web/lib/health.ts
apps/web/Dockerfile

packages/contracts/package.json
packages/contracts/tsconfig.json
packages/contracts/src/index.ts
packages/contracts/src/envelope.ts
packages/contracts/src/health.ts

docker/mongo/init-replica.js

docs/phases/00-setup.md
docs/session-log.md
docs/mongodb-notes.md
```

Một số file cấu hình nhỏ có thể gộp nếu không cần thiết; danh sách này là phạm vi tối đa của Giai đoạn 0.

## 5. Thiết kế API health

### Hợp đồng

`GET /api/v1/health`

Thành công, HTTP 200:

```json
{
  "data": {
    "status": "ok",
    "service": "nextask-api",
    "version": "0.0.0",
    "uptimeSeconds": 12,
    "timestamp": "2026-10-28T05:00:00.000Z",
    "checks": {
      "mongo": {
        "status": "ok",
        "latencyMs": 2,
        "replicaSet": "rs0",
        "primary": true
      }
    }
  },
  "meta": {
    "requestId": "..."
  }
}
```

Thất bại, HTTP 503, cùng cấu trúc `data` với `status: "degraded"` và trường lỗi tương ứng. Endpoint không trả URI, credential, stack trace hay chi tiết driver.

### Hành vi khởi động

1. Validate env bằng zod; thiếu biến bắt buộc thì thoát với log rõ ràng.
2. Kết nối Mongoose với timeout hữu hạn.
3. Gọi `hello`, xác nhận `setName` khớp env. Nếu không, log lỗi và thoát.
4. Khởi động HTTP server.
5. Health gọi `ping`/`hello` mỗi request, không cache trạng thái.

Nếu DB mất kết nối sau khi server đã chạy, health trả 503; process không tự restart để tránh vòng lặp. Docker healthcheck và restart policy sẽ xử lý ở mức container khi cần.

## 6. Docker Compose

### Service

| Service | Vai trò | Cổng host |
| --- | --- | --- |
| `mongo` | MongoDB 8.0, `--replSet rs0`, volume dữ liệu | `127.0.0.1:27017` |
| `mongo-init` | Chờ Mongo, initiate `rs0`, chờ primary, thoát | Không |
| `api` | Express, phụ thuộc `mongo-init` hoàn tất | `127.0.0.1:4000` |
| `web` | Next.js, fetch API nội bộ | `127.0.0.1:3000` |

### Luồng khởi động

1. `mongo` khởi động, healthcheck ping.
2. `mongo-init` chạy sau khi `mongo` healthy và có retry khi lỗi:
   - Thử `rs.status()`.
   - Nếu chưa có replica set, gọi `rs.initiate` với member `mongo:27017`.
   - Chờ `hello().isWritablePrimary`.
   - Nếu đã có, kiểm tra tên replica set và thoát thành công.
   - `depends_on: service_healthy` và `restart: on-failure:5` tránh race `ECONNREFUSED` lúc Mongo chưa mở cổng.
3. `api` chỉ chạy khi `mongo-init` hoàn tất. API kết nối `mongodb://mongo:27017/nextask?replicaSet=rs0`.
4. `web` chạy sau API; server component gọi `http://api:4000/api/v1/health` để hiển thị trạng thái.

### Mạng và host

- Trong compose network, API dùng hostname `mongo`.
- Member của replica set phải là `mongo:27017`; nếu dùng `localhost:27017`, API container sẽ hiểu localhost là chính nó và không kết nối được.
- Từ host, kết nối trực tiếp bằng `mongodb://localhost:27017/nextask?directConnection=true` hoặc chạy `mongosh` trong container. Không dựa vào DNS `mongo` trên host.
- Test integration trên host dùng URI có `directConnection=true`; test trong container dùng URI chuẩn.

### Một lệnh

`docker compose up --build`

Mọi biến cần thiết có giá trị mặc định an toàn cho local trong compose. `.env.example` dùng khi muốn đổi cấu hình; `.env` bị ignore. Không có secret thật trong repo.

## 7. Web tối giản

- Trang chủ hiển thị tên NexTask, trạng thái API, replica set, primary và request id.
- Server component fetch với `cache: "no-store"`.
- Nếu API không đạt, hiển thị trạng thái lỗi thay vì crash trang.
- Tailwind dùng cấu hình tối thiểu; chưa dựng design system đầy đủ.
- Không gọi API từ browser trong giai đoạn này, tránh phức tạp CORS khi chưa có auth.

## 8. Kiểm thử và cổng nghiệm thu

### Lệnh sẽ chạy

```bash
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:4000/api/v1/health
curl -fsS http://localhost:3000
docker compose exec mongo mongosh --quiet --eval 'rs.status().ok'
npm run typecheck
npm run lint
npm run test
docker compose restart api
curl -fsS http://localhost:4000/api/v1/health
```

Các lệnh trên là kế hoạch kiểm chứng. Sau khi triển khai, kết quả thực tế phải được ghi vào `docs/session-log.md`; không đánh dấu đạt nếu chưa chạy.

### Tiêu chí đạt

- [x] Cả `mongo`, `api`, `web` chuyển healthy, `mongo-init` exit 0.
- [x] Health trả HTTP 200, `replicaSet: "rs0"`, `primary: true`.
- [x] Web hiển thị trạng thái API lấy qua mạng nội bộ Docker.
- [x] `docker compose up` không cần secret hay bước cài DB thủ công.
- [x] Typecheck, lint và test đều pass.
- [x] Restart API vẫn kết nối được DB và health trả 200.
- [x] Dữ liệu Mongo nằm trong volume; `down` rồi `up` không mất volume.
- [x] Không có code auth, board, tldraw hay Change Streams trong giai đoạn này.

### Test

- Unit test env schema: thiếu biến, sai URL, giá trị mặc định.
- Integration test health: kết nối replica set thật, gọi service, xác nhận `rs0`, primary và latency là số không âm.
- Test không mock MongoDB.
- Nếu Mongo không chạy, test integration báo skip rõ ràng hay fail? Quyết định: fail với hướng dẫn chạy compose, không âm thầm skip. Test đạt phải có DB thật.

## 9. Câu hỏi kiểm tra hiểu bài

1. Nếu Mongoose kết nối được tới một MongoDB standalone, vì sao API vẫn phải từ chối trạng thái ready? Hãy nêu hai tính năng của dự án sẽ hỏng.
2. Vì sao chọn `w: "majority"` ngay cả khi replica set local chỉ có một nút? Lợi ích và chi phí là gì?

## 10. Rủi ro và giả định

### Rủi ro

- Replica set một nút không có failover; mất container là mất DB tạm thời.
- Không auth Mongo: chỉ chấp nhận vì cổng bind loopback và đây là môi trường học local.
- Cổng 3000, 4000, 27017 có thể bị chiếm.
- Docker build lần đầu tải image và cài dependency, có thể lâu.
- Tên member `mongo:27017` khiến host không thể dùng URI replica set thông thường; phải `directConnection=true` hoặc chạy trong mạng Docker.
- TypeScript 6.0.3 là phiên bản được chọn theo ràng buộc lint, không phải bản mới nhất.
- Next.js server component phụ thuộc `API_INTERNAL_URL`; cấu hình sai sẽ hiển thị lỗi dù API khỏe.

### Giả định

- Docker và Docker Compose đã cài trên máy.
- Node 26 và npm 12 dùng cho phát triển ngoài container.
- Volume `nextask_mongo-data` đã tồn tại từ trước và được giữ nguyên; database `nextask` rỗng tại thời điểm kiểm tra.
- Test dùng database riêng `nextask_phase0_test`, không ghi vào database ứng dụng.
- UI tiếng Việt, code tiếng Anh.
- MongoDB local không cần auth; production sẽ cấu hình riêng.

## 11. Kết quả triển khai

### Git

- Repository cục bộ trên nhánh `main`, chưa có remote.
- Commit nền: `0058ff7` docs, `ce50898` scaffold, `cbefc35` API, `ef1eaa4` web, `eecd027` Docker/README, `d9e87bd` formatting.

### Kiểm chứng

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0.
- Full test ba lần liên tiếp, mỗi lần `2` file và `6` test pass. Thời gian ba lần lần lượt `517 ms`, `505 ms`, `512 ms`.
- `docker compose ps`: `mongo`, `api`, `web` đều healthy; `mongo-init` exit 0.
- Health thật: HTTP 200, `status: "ok"`, `replicaSet: "rs0"`, `primary: true`, `latencyMs: 1`.
- Browser tại `http://localhost:3000`: thấy tiêu đề NexTask, badge Hoạt động, replica set `rs0`, primary `true`, request id.
- `docker compose restart api`: health trả 200 với `rs0` và primary.
- `docker compose down` rồi `docker compose up -d`: cả ba service healthy; health và web trả 200; `rs.status().set` là `rs0`; volume được giữ.
- API local đọc `.env` ở thư mục gốc: chạy trên cổng `4101`, health trả `ok`.

### Sự cố và điều chỉnh

- Lần chạy `mongo-init` đầu tiên exit 1 với `connect ECONNREFUSED` vì Mongo chưa mở cổng, dù replica set `rs0` đã tồn tại từ volume cũ.
- Đã sửa Compose để `mongo-init` phụ thuộc `mongo` ở trạng thái healthy và thêm `restart: on-failure:5`.
- Chạy lại: `mongo-init` exit 0, log `replica set rs0 ready`.
- Database test được đổi sang `nextask_phase0_test` để không đụng dữ liệu cũ.

### Giới hạn còn lại

- Mongo local không auth, chỉ bind loopback.
- Replica set một nút không có failover.
- Chưa có nghiệp vụ board, item, task, tldraw hay realtime; đó là các giai đoạn sau.

## 12. Việc chuyển sang Giai đoạn 1

Chỉ sau khi người dùng duyệt kết quả Giai đoạn 0:

- Thêm model `users`, `boards`, `items`, `tasks`, `activities` và migration `$jsonSchema`.
- Tạo slice dọc tối thiểu với một user tạm thời, board demo, tldraw note, promote, Kanban và reload badge.
- Bắt đầu dùng transaction, unique partial index và optimistic concurrency.
- Chưa làm realtime; badge cập nhật sau reload.
