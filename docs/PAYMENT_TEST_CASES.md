# Danh mục 50 Kịch bản Kiểm thử Thanh toán Trực tuyến (`PAY-001` .. `PAY-050`)

Toàn bộ 50 kịch bản kiểm thử bắt buộc được phủ kín qua 4 tầng kiểm thử tự động trên cơ sở dữ liệu SQLite cô lập:

- **Tầng 1 (Unit)**: [`tests/payment-rules.test.mjs`](../tests/payment-rules.test.mjs)
- **Tầng 2 (Integration, RBAC, Security, Concurrency 3x, Fault Recovery)**: [`tests/payment-integration.test.mjs`](../tests/payment-integration.test.mjs)
- **Tầng 3 (Playwright E2E Desktop + Mobile 375px + Admin)**: [`tests/e2e/payment-workflow.spec.ts`](../tests/e2e/payment-workflow.spec.ts)
- **Tầng 4 (Regression toàn hệ thống)**: `tests/rental-rules.test.mjs`, `tests/rbac-access.test.mjs`, `tests/data-sync.test.mjs`, `tests/e2e/nori.spec.ts`, `tests/e2e/auth-session-booking-regression.spec.ts`

| Mã TC     | Nhóm kịch bản        | Mô tả kiểm thử                                                                                            | Tầng phủ         |
| --------- | -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| `PAY-001` | Luồng Booking        | Chặn tạo thanh toán trực tuyến khi đơn ở trạng thái `PENDING` (`409 BOOKING_NOT_APPROVED`)                | Unit + Int + E2E |
| `PAY-002` | Luồng Booking        | Admin duyệt đơn (`DEPOSIT_PENDING`/`CONFIRMED`) mở thanh toán & gửi thông báo                             | Int + E2E        |
| `PAY-003` | Khởi tạo Payment     | Tạo giao dịch đặt cọc VietQR/SePay với số tiền chuẩn từ Server & mã `NORIPAY...`                          | Unit + Int + E2E |
| `PAY-004` | Luồng Booking        | Chặn tạo thanh toán trên đơn `CANCELLED` hoặc `REJECTED` (`409 BOOKING_CLOSED`)                           | Unit + Int       |
| `PAY-005` | Bảo mật Auth         | Khách chưa đăng nhập gọi API tạo thanh toán bị từ chối `401`                                              | Unit + E2E       |
| `PAY-006` | Bảo mật IDOR         | Khách B cố tạo hoặc xem giao dịch trên đơn của Khách A bị chặn `403`                                      | Unit + Int + E2E |
| `PAY-007` | Idempotency          | Nhấn thanh toán nhiều lần tái sử dụng mã `PENDING` đang hiệu lực, không tạo trùng                         | Int              |
| `PAY-008` | Khóa chỉnh sửa       | Khách không thể tự sửa đơn sau khi Admin duyệt hoặc đã có bản ghi thanh toán                              | Unit + E2E       |
| `PAY-009` | Hết hạn              | `sweepExpiredPayments` tự động chuyển giao dịch quá `expiresAt` sang `EXPIRED`                            | Int              |
| `PAY-010` | Thử lại              | Sau khi mã cũ hết hạn (`EXPIRED`), khách tạo mới mã thanh toán thành công                                 | Int              |
| `PAY-011` | Bảo mật Webhook      | Webhook thiếu header `Authorization: Apikey` bị từ chối `401`                                             | Int + E2E        |
| `PAY-012` | Bảo mật Webhook      | Webhook sai `Apikey` bị từ chối `401`, ghi `FAILED_SIGNATURE`, không đổi đơn                              | Unit + Int + E2E |
| `PAY-013` | Webhook chuẩn        | Webhook hợp lệ khớp đủ tiền xác nhận `CONFIRMED` & chuyển `DEPOSIT_PENDING → CONFIRMED`                   | Unit + Int + E2E |
| `PAY-014` | Webhook Replay       | Gửi lặp cùng 1 Webhook 5 lần liên tiếp: chỉ xử lý 1 lần, 4 lần trả `duplicate: true`                      | Int              |
| `PAY-015` | Out-of-order         | Sự kiện muộn báo `PENDING`/`FAILED`/`EXPIRED` sau khi đã `CONFIRMED` bị bỏ qua an toàn                    | Unit + Int       |
| `PAY-016` | Ngoại lệ Webhook     | Webhook mang mã tham chiếu không tồn tại được lưu vào `REVIEW_REQUIRED` (`UNMATCHED`)                     | Int              |
| `PAY-017` | Ngoại lệ số tiền     | Chuyển thiếu tiền (`UNDERPAID`) giữ `PARTIALLY_PAID`, chưa xác nhận đơn; chuyển bù đủ mới xác nhận        | Unit + Int       |
| `PAY-018` | Ngoại lệ số tiền     | Chuyển dư tiền (`OVERPAID`) xác nhận nghĩa vụ & ghi `overpaidAmount` chờ hoàn dư                          | Unit + Int       |
| `PAY-019` | Ngoại lệ thời gian   | Webhook đến sau khi mã hết hạn chuyển `REVIEW_REQUIRED` (`LATE_PAYMENT`)                                  | Unit + Int       |
| `PAY-020` | Ngoại lệ đơn hủy     | Webhook đến sau khi đơn `CANCELLED` chuyển `REVIEW_REQUIRED`, không tự mở lại đơn                         | Unit + Int       |
| `PAY-021` | Thanh toán đủ        | Thanh toán phần tiền thuê còn lại sau khi đã đặt cọc đưa tổng công nợ về `0` (`FULLY_PAID`)               | Unit + Int + E2E |
| `PAY-022` | Thanh toán 100%      | Hỗ trợ `FULL_PAYMENT` thanh toán toàn bộ tiền thuê ngay lần đầu                                           | Unit + Int       |
| `PAY-023` | Khuyến mãi           | Công thức tính cọc giữ chỗ & phần còn lại bảo toàn chính xác giảm giá mã KM (`NORIXINCAMON`)              | Unit + Int       |
| `PAY-024` | Phụ phí phát sinh    | Tính và thu tách bạch phụ phí phát sinh (`EXTRA_FEE`) khi quyết toán                                      | Unit + Int       |
| `PAY-025` | Xác nhận thủ công    | Admin xác nhận thủ công bắt buộc nhập lý do (`reason`) và mã chứng từ (`transactionEvidence`)             | Int              |
| `PAY-026` | Đối soát đồng thời   | Admin xác nhận thủ công trùng lúc Webhook đến không cộng tiền 2 lần                                       | Int              |
| `PAY-027` | Hoàn tiền toàn bộ    | Hoàn toàn bộ số tiền đã thu chuyển giao dịch sang `REFUNDED`                                              | Unit + Int       |
| `PAY-028` | Hoàn tiền một phần   | Hoàn một phần chuyển giao dịch sang `PARTIALLY_REFUNDED` & trừ doanh thu ròng                             | Unit + Int + E2E |
| `PAY-029` | Bảo vệ số dư hoàn    | Chặn hoàn tiền vượt quá số tiền thực nhận còn có thể hoàn (`409 EXCEEDS_REFUNDABLE_BALANCE`)              | Unit + Int       |
| `PAY-030` | Chống hoàn trùng     | Chặn tạo trùng yêu cầu hoàn tiền đang mở cùng số tiền/giao dịch (`409 DUPLICATE_REFUND`)                  | Unit + Int       |
| `PAY-031` | RBAC Hoàn tiền       | Khách hàng hoặc Operator không có quyền `payments.update` bị chặn `403` khi hoàn tiền                     | Unit + Int       |
| `PAY-032` | Concurrency (3x)     | 5 yêu cầu `createOrReuseCustomerPayment` đồng thời chỉ tạo đúng 1 giao dịch `PENDING`                     | Int (3 rounds)   |
| `PAY-033` | Concurrency (3x)     | 5 Webhook giống hệt gửi đồng thời: đúng 1 xử lý, 4 trả `duplicate: true`                                  | Int (3 rounds)   |
| `PAY-034` | Concurrency (3x)     | Đồng thời Webhook + Admin Confirm + Polling giữ dữ liệu nhất quán (`CONFIRMED`, không gấp đôi)            | Int (3 rounds)   |
| `PAY-035` | Concurrency (3x)     | 2 yêu cầu hoàn tiền toàn bộ đồng thời: đúng 1 thành công, 1 bị từ chối `409`                              | Int (3 rounds)   |
| `PAY-036` | Fault Injection      | Tiêm lỗi ghi DB giữa luồng Webhook: giao dịch giữ nguyên `PENDING`, không hỏng dữ liệu                    | Int              |
| `PAY-037` | Recovery Retry       | Sau khi lỗi ghi DB qua đi, Webhook gửi lại phục hồi và xác nhận `CONFIRMED` thành công                    | Int              |
| `PAY-038` | Provider Degradation | Môi trường `PRODUCTION` chưa phê duyệt / thiếu cấu hình trả `503` có kiểm soát, không crash               | Unit             |
| `PAY-039` | Bàn giao xe          | Chặn chuyển đơn sang `ONGOING` khi chưa đóng đủ tiền đặt cọc bắt buộc                                     | Unit             |
| `PAY-040` | Quyết toán đơn       | Chặn chuyển `COMPLETED` khi còn phụ phí/hoàn tiền chưa quyết toán (trừ ngoại lệ có lý do)                 | Unit             |
| `PAY-041` | UI VietQR            | Mã VietQR hiển thị rõ nét (`naturalWidth > 0`), nội dung chuyển khoản & nút sao chép đầy đủ               | E2E              |
| `PAY-042` | Responsive Mobile    | Màn hình thanh toán hiển thị không vỡ khung, không tràn ngang ở viewport `375x812`                        | E2E              |
| `PAY-043` | Smart Polling        | Polling giới hạn vòng lặp, tự tạm dừng khi ẩn tab và dừng ngay khi đạt trạng thái kết thúc                | Code + E2E       |
| `PAY-044` | Chống sửa giá        | Máy chủ hoàn toàn bỏ qua số tiền do Client gửi, chỉ tính từ báo giá & công nợ DB                          | Int              |
| `PAY-045` | XSS / SQLi           | Payload chứa `<script>` và `' OR 1=1--` trong nội dung chuyển khoản được lưu an toàn                      | Int              |
| `PAY-046` | Bảo mật Logs/CSV     | `payment_events` lọc sạch `apiKey`/`secret`; CSV xuất giao dịch không lộ bí mật & chống formula injection | Unit + Int + E2E |
| `PAY-047` | Báo cáo Doanh thu    | Báo cáo tách bạch Thực thu tiền thuê, Cọc bảo đảm tài sản, Đã hoàn tiền, Doanh thu ròng                   | Unit + E2E       |
| `PAY-048` | Quản trị cấu hình    | Tab Cấu hình Thanh toán, Đối soát, Hoàn tiền, Webhook hiển thị đầy đủ trên `/dashboard/payments`          | E2E              |
| `PAY-049` | Toàn vẹn SQLite      | `PRAGMA integrity_check = ok` và `PRAGMA foreign_key_check = []` sau toàn bộ luồng ghi                    | Int              |
| `PAY-050` | Cô lập `nori.db`     | SHA-256 checksum của `./nori.db` thật không thay đổi 1 byte nào sau khi chạy kiểm thử                     | Int + E2E        |
