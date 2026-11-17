# Giai đoạn 8A - Board settings và Playwright smoke

- Trạng thái: Hoàn thành, chờ merge `release/v0.8`
- Ngày lập: 2026-11-17
- Tiền đề: v0.7.0 đã phát hành; `main` tại `ed61e8c`, tag `v0.7`
- Nhánh: `release/v0.8`; feature `feat/phase-8a-settings-e2e`
- Không migration mới; không merge `main`, không bump `0.8.0`

## 1. Mục tiêu

1. Owner chỉnh `votingLimit`, `minVotes`, `stalledAfterDays` với optimistic concurrency.
2. Cập nhật `voter_budgets.limit` theo `votingLimit` trong cùng transaction.
3. UI dialog Cài đặt cho Owner; Member không thấy/không gọi được.
4. Thêm Playwright smoke test cho luồng đăng nhập → demo board → Kanban → Báo cáo.
5. Giữ API/board data hiện có; không migration.

## 2. Quyết định

1. Endpoint `PATCH /boards/:boardId/settings`, Owner-only, body gồm cả ba setting và
   `expectedVersion`.
2. Transaction cập nhật board (version +1) và `updateMany` budget `limit`, `version +1`.
3. Budget `used > limit` mới vẫn được phép; vote service đã chặn thêm phiếu khi
   `used >= limit`.
4. UI dùng dialog mới `SettingsDialog`, mở từ nút `Cài đặt` cạnh `Cột` cho Owner.
5. Playwright chỉ smoke UI; không thay thế Vitest integration. Test giả định stack
   Docker và demo seed đã chạy.
6. Không frame/pagination trong 8A; để 8B.

## 3. API

`PATCH /api/v1/boards/:boardId/settings`

```ts
{
  votingLimit: number;      // 0..100
  minVotes: number;         // 0..100
  stalledAfterDays: number; // 1..365
  expectedVersion: number;  // positive
}
```

Response 200: `{ data: BoardDto, meta: { requestId } }`.

Lỗi: 403 Member; 409 VERSION_CONFLICT; 422 invalid; 404 board.

## 4. Service

`updateBoardSettings(board, input)`:

- Transaction snapshot/majority/primary.
- `BoardModel.findOneAndUpdate({_id, version}, {$set:{settings}, $inc:{version:1}})`.
- Nếu không match: đọc current, 404/409.
- `VoterBudgetModel.updateMany({boardId}, {$set:{limit: votingLimit}, $inc:{version:1}})`.
- Commit; trả board mới.

## 5. UI

- Nút `Cài đặt` Owner mở dialog 3 số + Lưu/Hủy.
- Thành công cập nhật `data.board`, notice.
- 409: đóng dialog, reload workspace; 403/422 hiện lỗi.
- Member không có nút và API vẫn chặn.

## 6. Playwright

- `@playwright/test`, config baseURL `http://localhost:3000`.
- Test `e2e/mvp-smoke.spec.ts`:
  - login owner;
  - mở `NexTask Demo Retro`;
  - thấy heading, Kanban Backlog/Done;
  - mở tab Báo cáo, thấy heading Báo cáo.
- Script `npm run test:e2e`; chạy sau seed. Không tự khởi động Docker.
- Cài browser bằng `npx playwright install chromium`.

## 7. Test/acceptance

- API settings: owner update, version/budget limit đổi; member 403; stale 409; invalid 422.
- UI typecheck/build; dialog hoạt động; Member không thấy nút.
- Playwright smoke pass với stack + seed.
- Full suite ba lần; typecheck/lint/format.
- Merge feature `release/v0.8`; main/tag v0.7 không đổi; không bump 0.8.0.

## 8. Git

- `release/v0.8` từ `main` `ed61e8c`; feature `feat/phase-8a-settings-e2e`.
- Merge `--no-ff` sau gate; xóa feature; không merge main; tag `v0.7` giữ nguyên.

## 9. Kiểm chứng

- `settings.integration.test.ts`: owner cập nhật board version +1 và budget `limit`;
  Member 403; stale 409; invalid 422.
- Docker API chứa route settings (probe không auth trả 401), web bundle chứa dialog;
  container API/web được tạo lại từ image mới.
- Playwright `e2e/mvp-smoke.spec.ts`: login owner, mở demo board, Kanban, dialog Cài đặt,
  tab Báo cáo; pass 1.1 s với stack Docker và seed hiện có.
- Gate feature: typecheck/lint/format pass; `build:web` pass; full suite 39 file, 166 test
  ba lần 31.27/32.46/30.91 s.
- Không migration, không đổi dữ liệu board ngoài board được cập nhật khi test.
