# Ma trận Trạng thái Thanh toán & Hoàn tiền — NORI Vehicle Rental

## 1. Sơ đồ trạng thái Giao dịch Thanh toán (`Payment.status`)

```mermaid
stateDiagram-v2
  [*] --> PENDING: Khách tạo mã QR / Admin tạo phiếu chờ
  PENDING --> PROCESSING: Cổng đang xác minh
  PENDING --> CONFIRMED: Webhook khớp đủ / Admin xác nhận thủ công
  PENDING --> PARTIALLY_PAID: Webhook nhận thiếu tiền (UNDERPAID)
  PENDING --> REVIEW_REQUIRED: Webhook đến muộn / Đơn đã đóng
  PENDING --> EXPIRED: Quá thời hạn expiresAt
  PENDING --> CANCELLED: Khách hủy mã QR chưa thanh toán
  PENDING --> FAILED: Provider báo thất bại

  PROCESSING --> CONFIRMED: Xác minh thành công
  PROCESSING --> PARTIALLY_PAID: Nhận thiếu tiền
  PROCESSING --> REVIEW_REQUIRED: Cần đối soát
  PROCESSING --> FAILED: Thất bại
  PROCESSING --> EXPIRED: Hết hạn

  PARTIALLY_PAID --> CONFIRMED: Nhận bổ sung đủ / Admin đối soát xong
  PARTIALLY_PAID --> REVIEW_REQUIRED: Chuyển đối soát thủ công
  PARTIALLY_PAID --> REFUND_PENDING: Yêu cầu hoàn phần đã chuyển thiếu

  REVIEW_REQUIRED --> CONFIRMED: Admin xác nhận đối soát hợp lệ
  REVIEW_REQUIRED --> PARTIALLY_PAID: Giữ chờ thu bổ sung
  REVIEW_REQUIRED --> REFUND_PENDING: Chuyển quy trình hoàn tiền

  EXPIRED --> REVIEW_REQUIRED: Khách chuyển khoản muộn sau hết hạn
  CANCELLED --> REVIEW_REQUIRED: Khách chuyển khoản vào mã đã hủy

  CONFIRMED --> REFUND_PENDING: Tạo phiếu hoàn tiền
  CONFIRMED --> PARTIALLY_REFUNDED: Hoàn một phần thành công
  CONFIRMED --> REFUNDED: Hoàn toàn bộ thành công

  REFUND_PENDING --> PARTIALLY_REFUNDED: Hoàn một phần xong
  REFUND_PENDING --> REFUNDED: Hoàn toàn bộ xong
  PARTIALLY_REFUNDED --> REFUNDED: Hoàn nốt phần còn lại
```

## 2. Sơ đồ trạng thái Hoàn tiền (`Refund.status`)

```mermaid
stateDiagram-v2
  [*] --> REQUESTED: Admin khởi tạo yêu cầu hoàn tiền
  REQUESTED --> APPROVED: Admin phê duyệt hoàn tiền
  REQUESTED --> REJECTED: Admin từ chối yêu cầu
  REQUESTED --> REFUNDED: Hoàn tất chi ngay (kèm mã chứng từ)

  APPROVED --> PROCESSING: Đang thực hiện chi hoàn
  APPROVED --> REFUNDED: Đã chuyển khoản hoàn tiền xong
  APPROVED --> REJECTED: Hủy duyệt

  PROCESSING --> REFUNDED: Chuyển khoản hoàn tiền thành công
  PROCESSING --> FAILED: Chi hoàn thất bại
```

## 3. Quy tắc chống sự kiện đến sai thứ tự (Out-of-Order / Stale Event Guard)

Được kiểm soát trong `isPaymentEventStale(currentStatus, incomingStatus)` tại [`src/lib/rental-rules.ts`](../src/lib/rental-rules.ts):

- Khi `Payment` đã đạt `CONFIRMED`, mọi sự kiện muộn báo `PENDING`, `PROCESSING`, `FAILED`, `EXPIRED`, `CANCELLED` đều bị bỏ qua an toàn (`ignoredStaleEvent: true`) và ghi nhận trong `payment_events`.
- Khi `Payment` đã ở trạng thái `REFUNDED`, không có bất kỳ sự kiện Webhook hay thao tác Admin nào được phép đưa ngược về `CONFIRMED` hoặc `PENDING`.
- Khách hàng chỉ được phép chuyển `PENDING → CANCELLED` cho mã thanh toán do chính mình tạo trước khi có xác nhận thu tiền.
