# Tích hợp Hệ thống Thanh toán Trực tuyến — NORI Vehicle Rental

Tài liệu tổng quan về hệ thống thanh toán trực tuyến tích hợp cho **NORI Vehicle Rental** theo kiến trúc **SePay + VietQR + Webhook + Payment Adapter Pattern**.

## 1. Mục tiêu và Phạm vi

- Tích hợp thanh toán đặt cọc giữ chỗ (`DEPOSIT`), thanh toán phần tiền thuê còn lại (`RENTAL_FEE`), thanh toán toàn bộ (`FULL_PAYMENT`), phụ phí phát sinh (`EXTRA_FEE`), và quản lý tách biệt tiền cọc bảo đảm tài sản (`SECURITY_DEPOSIT`).
- Đảm bảo **không thu tiền khi đơn thuê đang ở trạng thái `PENDING`**. Thanh toán trực tuyến chỉ mở sau khi Admin duyệt đơn (`DEPOSIT_PENDING`, `CONFIRMED`, `READY_FOR_HANDOVER`, `ONGOING`, `INSPECTING`).
- Tự động đối soát giao dịch qua **SePay Webhook** với xác thực `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>` theo cơ chế so sánh hằng số thời gian (`timingSafeSecretCompare`).
- Hỗ trợ 3 môi trường tách biệt:
  - `MOCK` (mặc định cho phát triển & kiểm thử tự động): Sinh mã QR VietQR SVG nội bộ không phụ thuộc DNS ngoài và cung cấp bộ mô phỏng Webhook kiểm soát được trên UI/API.
  - `SANDBOX`: Kết nối tài khoản SePay Sandbox qua HTTPS public URL + `SEPAY_API_KEY` + `SEPAY_WEBHOOK_SECRET`.
  - `PRODUCTION`: **Khóa mặc định** (`PAYMENT_PRODUCTION_APPROVED=false`). Chỉ kích hoạt khi chủ dự án phê duyệt, hoàn tất nghiệm thu Sandbox và cấu hình đầy đủ khóa Production.

## 2. Cơ sở khảo sát SePay chính thức

Tham khảo tài liệu chính thức tại `https://sepay.vn/` và `https://developer.sepay.vn/`:

| Thành phần SePay      | Quy chuẩn áp dụng trong NORI                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sản phẩm sử dụng      | SePay Bank Transaction Notification (Biến động số dư ngân hàng qua Webhook) kết hợp VietQR động (`qr.sepay.vn/img`)                                                                                          |
| Mã QR VietQR động     | `https://qr.sepay.vn/img?acc=<STK>&bank=<BANK_CODE>&amount=<VND>&des=<NORIPAY...>&template=compact`                                                                                                          |
| Xác thực Webhook      | Header `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>` (hoặc `x-sepay-api-key`)                                                                                                                               |
| Payload Webhook       | `id`, `gateway`, `transactionDate`, `accountNumber`, `subAccount`, `code`, `content`, `transferType`, `description`, `transferAmount`, `accumulated`, `referenceCode`                                        |
| Quy tắc mã tham chiếu | `NORIPAY<10_ALPHANUMERIC>` (ví dụ `NORIPAY764410B0F2`), tương thích hoàn toàn chuẩn nội dung chuyển khoản liên ngân hàng NAPAS 247                                                                           |
| API tra cứu lịch sử   | `GET https://my.sepay.vn/userapi/transactions/list` với `Authorization: Bearer <SEPAY_API_KEY>`                                                                                                              |
| Hoàn tiền (Refund)    | SePay không cung cấp API tự động hoàn tiền ngân hàng ra ngoài; NORI quản lý đầy đủ vòng đời hoàn tiền (`REQUESTED` → `APPROVED` → `PROCESSING` → `REFUNDED` / `REJECTED`) kèm chứng từ chuyển khoản đối soát |

## 3. Biến môi trường cấu hình

Xem chi tiết trong [`.env.example`](../.env.example). Các biến chứa bí mật (`SEPAY_API_KEY`, `SEPAY_SECRET_KEY`, `SEPAY_WEBHOOK_SECRET`) chỉ được đọc tại Server Runtime, bị cấm tuyệt đối trong client bundle (kiểm soát tự động bởi `scripts/static-lint.mjs`).

## 4. Cấu hình quản trị trên Dashboard

Quản trị viên có quyền truy cập `/dashboard/payments` → tab **Cấu hình Thanh toán** để điều chỉnh:

- Bật/tắt thanh toán trực tuyến (`onlinePaymentEnabled`).
- Chọn nhà cung cấp hoạt động (`SEPAY`, `MOCK`, `MANUAL`).
- Bật/tắt từng phương thức (VietQR/SePay, Chuyển khoản thủ công, Tiền mặt khi nhận xe, Thanh toán toàn bộ 100%).
- Chính sách cọc giữ chỗ (`VEHICLE_FIXED` hoặc `PERCENT_OF_RENTAL` + tỷ lệ %).
- Thời hạn hiệu lực mã QR (`paymentExpiryMinutes`, 5–1440 phút).
- Chính sách kiểm soát bàn giao (`requireDepositBeforeHandover`) và quyết toán hoàn tất (`requireSettlementBeforeComplete`).
- Thông tin tài khoản ngân hàng thụ hưởng và hướng dẫn hiển thị cho khách hàng.
