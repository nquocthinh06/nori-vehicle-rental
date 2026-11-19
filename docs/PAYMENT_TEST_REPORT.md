# BÁO CÁO KẾT QUẢ KIỂM THỬ THANH TOÁN TRỰC TUYẾN — NORI VEHICLE RENTAL

- **Ngày kiểm thử & nghiệm thu**: `2026-11-20`
- **Phiên bản**: `v2.6.0` (Online Payment Integration — SePay + VietQR + Webhook + Payment Adapter Pattern + Mock Simulator + Manual Confirm + Refund + Reconciliation)
- **Môi trường thực thi**: Windows (`Node.js v24.22.3`, `pnpm`, `Next.js 16.4.6`, `React 19.3.1`, `Payload CMS 4.0.0-beta.8`, `SQLite` cô lập)
- **Cơ sở dữ liệu kiểm thử**: Bản sao SQLite cô lập hoàn toàn (`nori-e2e-isolated.db`, `nori-payment-test-*.db`, `nori-admin-isolated.db`) — **không ghi trực tiếp lên `./nori.db` gốc**.
- **Bản sao lưu trước triển khai**: `backups/nori-backup-2026-11-19T17-56-48-107Z.db` (`PRAGMA integrity_check = ok`, `0` lỗi khóa ngoại).

---

## 1. Bảng Tổng Hợp Kết Quả Thực Thi Tự Động

| Hạng mục / Lệnh kiểm thử           | Phạm vi kiểm tra                                                                   |       Tổng |    PASS |  FAIL | BLOCKED / NOT_RUN | Trạng thái      |
| :--------------------------------- | :--------------------------------------------------------------------------------- | ---------: | ------: | ----: | ----------------: | :-------------- |
| `pnpm format:check`                | `oxfmt` (`src/`, `tests/`, `scripts/`, `docs/audit/`)                              |    249 tệp |     249 |     0 |                 0 | `PASS`          |
| `pnpm lint`                        | `scripts/static-lint.mjs` (AST, `assertOrigin`, cấm lộ secret client)              |    190 tệp |     190 |     0 |                 0 | `PASS`          |
| `pnpm typecheck`                   | `tsc --noEmit` (TypeScript strict)                                                 | Toàn dự án |    100% |     0 |                 0 | `PASS`          |
| `pnpm test` (Node Test Runner)     | `rental-rules`, `rbac-access`, `data-sync`, `payment-rules`, `payment-integration` |        275 |     275 |     0 |                 0 | `PASS`          |
| `pnpm test:admin`                  | `scripts/test-admin-isolated.mjs` (Admin seed, PBKDF2-SHA256, integrity)           |          1 |       1 |     0 |                 0 | `PASS`          |
| `pnpm test:e2e:isolated`           | 9 spec files Playwright (Desktop Chromium + Mobile 375px + Mobile WebKit)          |         94 |      94 |     0 |                 0 | `PASS`          |
| `pnpm data:validate`               | Kiểm tra 12 file snapshot & 67 tệp media tham chiếu                                |    12 + 67 | 12 + 67 |     0 |                 0 | `PASS`          |
| `pnpm media:validate`              | Checksum & kích thước thực của 67 media đang tham chiếu                            |         67 |      67 |     0 |                 0 | `PASS`          |
| `pnpm build` (`payload build`)     | Build production Next.js 16 + Payload CMS (87 trang tĩnh/SSG + 12 API thanh toán)  |   87 trang |      87 |     0 |                 0 | `PASS`          |
| **TỔNG CỘNG AUTOMATED TESTS**      | **Unit + Integration + RBAC + Concurrency + Fault Recovery + Admin + E2E**         |    **370** | **370** | **0** |             **0** | **PASS (100%)** |
| SePay Sandbox / Live Webhook HTTPS | Gọi máy chủ SePay thật & nhận Webhook qua HTTPS public                             | 1 hạng mục |       0 |     0 |                 1 | `BLOCKED`       |
| Giao dịch tiền thật (Production)   | Chuyển khoản thật trên tài khoản ngân hàng thực tế                                 | 1 hạng mục |       0 |     0 |                 1 | `BLOCKED`       |

> **Lưu ý trung thực về phạm vi `BLOCKED`**:
>
> - Môi trường hiện tại không có `SEPAY_API_KEY` / `SEPAY_WEBHOOK_SECRET` thật của tài khoản merchant và không có public HTTPS domain kết nối với hệ thống SePay thật.
> - Do đó, **tuyệt đối không tuyên bố tích hợp SePay Sandbox/Production thật đã hoàn thành**. Toàn bộ pipeline nghiệp vụ, xác thực `Authorization: Apikey`, giải mã payload biến động số dư SePay, idempotency, state machine, đối soát chênh lệch, hoàn tiền và UI đã được chứng minh hoàn chỉnh 100% thông qua `MockPaymentProvider` + `SePayProvider` adapter trong chế độ `MOCK` và kiểm thử tích hợp cô lập.

---

## 2. Độ Phủ Ma Trận Kiểm Thử `PAY-001` .. `PAY-050`

| Nhóm kiểm thử                                                        | Mã Test Case                                 | Bộ test thực thi                                                                                           | Kết quả |
| :------------------------------------------------------------------- | :------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------ |
| Khởi tạo, trạng thái đơn, bảo vệ giá & quyền sở hữu                  | `PAY-001` .. `PAY-010`, `PAY-023`            | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`, `tests/e2e/payment-workflow.spec.ts` | `PASS`  |
| Xác thực Webhook, Idempotency (5x replay), Out-of-order, Unmatched   | `PAY-011` .. `PAY-016`                       | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`, `tests/e2e/payment-workflow.spec.ts` | `PASS`  |
| Thanh toán thiếu, thanh toán dư, Webhook đến muộn, đơn đã hủy        | `PAY-017` .. `PAY-020`                       | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`                                       | `PASS`  |
| Phần tiền thuê còn lại, phụ phí, xác nhận thủ công, RBAC Admin       | `PAY-021`, `PAY-022`, `PAY-024` .. `PAY-027` | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`, `tests/e2e/payment-workflow.spec.ts` | `PASS`  |
| Hoàn tiền toàn phần/một phần, vượt số dư, hoàn trùng                 | `PAY-028` .. `PAY-031`                       | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`, `tests/e2e/payment-workflow.spec.ts` | `PASS`  |
| Concurrency & Race Conditions (lặp 3 vòng liên tiếp mỗi kịch bản)    | `PAY-032` .. `PAY-035`                       | `tests/payment-integration.test.mjs`                                                                       | `PASS`  |
| Fault Injection, Retry Recovery, Chặn bàn giao/quyết toán            | `PAY-036` .. `PAY-040`                       | `tests/payment-rules.test.mjs`, `tests/payment-integration.test.mjs`                                       | `PASS`  |
| Responsive Mobile 375px, UI States, Báo cáo & CSV Export             | `PAY-041` .. `PAY-046`                       | `tests/e2e/payment-workflow.spec.ts`, `tests/payment-integration.test.mjs`                                 | `PASS`  |
| Bảo mật XSS/SQLi, Redaction secret, Backup/Restore, Cô lập `nori.db` | `PAY-047` .. `PAY-050`                       | `tests/payment-integration.test.mjs`, `scripts/static-lint.mjs`                                            | `PASS`  |

---

## 3. Phân Tích Nguyên Nhân Gốc & Lỗi Đã Khắc Phục Trong Quá Trình Kiểm Thử

1. **Lỗi `404` khi Webhook hệ thống tự động chuyển đơn thuê `DEPOSIT_PENDING -> CONFIRMED`**:
   - **Nguyên nhân gốc (Root Cause)**: Hook `beforeChange` của `src/collections/Bookings.ts` suy luận `actor = req.user?.collection === 'admins' ? 'admin' : 'customer'`. Khi `processProviderWebhook()` và `confirmPaymentManuallyByAdmin()` cập nhật trạng thái đơn thuê qua Local API nội bộ với `overrideAccess: true` (không đính kèm `req.user`), hook đánh giá `actor === 'customer'` và từ chối bằng `APIError('Không tìm thấy đơn thuê.', 404)`.
   - **Khắc phục**: Bổ sung ngữ cảnh nội bộ có kiểm soát `req.context.noriSystemPaymentSync === true` kèm `noriSystemActorLabel` trong `src/lib/payment-service.ts` và nhận diện tại `src/collections/Bookings.ts` để ghi nhận chính xác `changedBy` trong `statusHistory`.
   - **Regression Test**: Đã được xác minh toàn diện trong `tests/e2e/payment-workflow.spec.ts` (bước Webhook tự động chuyển đơn `DEPOSIT_PENDING -> CONFIRMED`).
2. **Không đồng nhất tham số truy vấn tại `/nori-api/payments/status` và thiếu `reconciliationStatus` tại `/nori-api/payments/create`**:
   - **Nguyên nhân gốc**: `bookings-panel.tsx` gửi `?paymentId=...` trong khi `status/route.ts` chỉ đọc `id`, đồng thời phản hồi `POST /payments/create` chưa trả trường `reconciliationStatus`.
   - **Khắc phục**: `status/route.ts` hỗ trợ cả `id` và `paymentId`, `bookings-panel.tsx` chuẩn hóa `?id=...` và guard hiển thị khối đối soát, `/payments/create` trả tường minh `reconciliationStatus`.
3. **Lọc bí mật `sanitizeWebhookPayload` bỏ sót khóa dạng camelCase (`webhookSecret`)**:
   - **Nguyên nhân gốc**: Sử dụng tập tên khóa tĩnh chữ thường.
   - **Khắc phục**: Đổi sang biểu thức chính quy không phân biệt hoa thường `/secret|apikey|api_key|token|password|authorization|signature/i` trong `src/lib/payment-providers.ts`.
4. **Mất mã lỗi nghiệp vụ chi tiết trong `apiError()`**:
   - **Nguyên nhân gốc**: `src/lib/api-utils.ts` gán cứng `CONFLICT` cho mọi `HTTP 409`.
   - **Khắc phục**: Ưu tiên `err.data.code` (ví dụ `BOOKING_NOT_APPROVED`, `EXCEEDS_REFUNDABLE_BALANCE`, `DUPLICATE_REFUND_REQUEST`) khi có mặt.

---

## 4. Xác Minh Tính Toàn Vẹn Cơ Sở Dữ Liệu `./nori.db` Sau Kiểm Thử

Kết quả kiểm tra chỉ đọc trên `./nori.db` sau khi hoàn tất toàn bộ 370 test:

```json
{
  "integrity": "ok",
  "fkViolations": 0,
  "tables": 88,
  "counts": {
    "users": 16,
    "admins": 2,
    "vehicle_models": 21,
    "vehicles": 21,
    "bookings": 10,
    "payments": 1,
    "payment_events": 0,
    "refunds": 0
  }
}
```

- Không có dữ liệu rác kiểm thử rò rỉ vào `./nori.db`.
- Không còn tệp DB tạm (`nori-e2e-isolated.db`, `nori-payment-test-*.db`) tồn đọng trong workspace.

---

## 5. Kết Luận Release Gate

- **Cấp độ MOCK / DEVELOPMENT**: **`PASS`** (370/370 automated tests PASS, 0 regression, 0 lỗi lint/typecheck/build, DB toàn vẹn 100%).
- **Cấp độ SANDBOX / PRODUCTION**: **`CONDITIONAL PASS — CHƯA MỞ PRODUCTION`** cho đến khi chủ dự án hoàn tất cấu hình biến môi trường SePay thật, đăng ký HTTPS Webhook URL, thực hiện kiểm thử Sandbox thực tế và bật cờ phê duyệt `PAYMENT_PRODUCTION_APPROVED=true`.
