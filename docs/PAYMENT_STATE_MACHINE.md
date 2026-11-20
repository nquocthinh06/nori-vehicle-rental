# MA TRẬN MÁY TRẠNG THÁI THANH TOÁN, HOÀN TIỀN & ĐƠN THUÊ — NORI VEHICLE RENTAL

# PHIÊN BẢN KIẾN TRÚC 2.7.1

Tài liệu này định nghĩa hệ thống **4 máy trạng thái trực giao (4 Orthogonal State Machines)** của NORI Vehicle Rental:

1. **Giao dịch Thanh toán (`Payment.status`)**
2. **Yêu cầu Hoàn tiền (`Refund.status`)**
3. **Vòng đời Đơn thuê (`Booking.status`)**
4. **Tổng hợp Tài chính Đơn thuê (`FinancialSummary.paymentStatusSummary`)**
5. **Ký quỹ Bảo đảm Tài sản (`AssetCollateral.status`)**

---

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

---

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

---

## 3. Sơ đồ trạng thái Vòng đời Đơn thuê (`Booking.status`)

```mermaid
stateDiagram-v2
  [*] --> PENDING: Khách tạo đơn thuê
  PENDING --> CONFIRMED: Admin phê duyệt đơn
  PENDING --> CANCELLED: Khách hủy đơn trước duyệt
  PENDING --> REJECTED: Admin từ chối đơn

  CONFIRMED --> READY_FOR_HANDOVER: Khách đóng đủ cọc giữ xe 30% hoặc 100%
  CONFIRMED --> CANCELLED: Khách hủy đơn / Quá hạn cọc

  READY_FOR_HANDOVER --> ONGOING: Bàn giao xe thành công (Handover Gate)
  READY_FOR_HANDOVER --> CANCELLED: Hủy trước giờ nhận xe

  ONGOING --> INSPECTING: Khách trả xe tại kho / chi nhánh

  INSPECTING --> COMPLETED: Quyết toán thành công 100% (Settlement Gate)
```

---

## 4. Sơ đồ trạng thái Tổng hợp Tài chính Đơn thuê (`paymentStatusSummary`)

Được tính toán động qua `calculateBookingFinancialSummary()`:

```mermaid
stateDiagram-v2
  [*] --> UNPAID: Chưa có khoản thanh toán nào được xác nhận
  UNPAID --> PARTIALLY_PAID: Đã thanh toán một phần (ví dụ cọc 30%)
  PARTIALLY_PAID --> FULLY_PAID: Đã thanh toán đủ 100% tiền thuê
  FULLY_PAID --> OVERPAID: Khách chuyển thừa tiền thuê

  FULLY_PAID --> REFUND_PENDING: Phát sinh khoản hoàn tiền (hủy đơn / thừa tiền)
  PARTIALLY_PAID --> REFUND_PENDING: Hủy đơn có hoàn cọc
  REFUND_PENDING --> SETTLED: Đã hoàn tất chi trả toàn bộ tiền hoàn
```

---

## 5. Sơ đồ trạng thái Ký quỹ Bảo đảm Tài sản (`AssetCollateral.status`)

Khoản tiền bảo đảm xe được theo dõi độc lập với doanh thu dịch vụ thuê xe:

```mermaid
stateDiagram-v2
  [*] --> PENDING_HOLD: Khởi tạo cùng đơn thuê (chưa thu)
  PENDING_HOLD --> HELD_AT_HANDOVER: Đã ký quỹ khi nhận xe (Tiền mặt / CK / Hiện vật)

  HELD_AT_HANDOVER --> RELEASED: Hoàn trả 100% cho khách sau khi trả xe đạt chuẩn
  HELD_AT_HANDOVER --> PARTIALLY_DEDUCTED: Khấu trừ một phần đền bù hư hỏng / vi phạm
  HELD_AT_HANDOVER --> FORFEITED: Tịch thu toàn bộ do vi phạm hợp đồng nghiêm trọng
```

---

## 6. Ma trận Chốt chặn Chuyển trạng thái & Bất biến Tài chính (Financial Invariants)

| Chuyển trạng thái                | Điều kiện tiên quyết (Prerequisites)                                | Chốt chặn tài chính (Financial Gate)                                                                                             |
| :------------------------------- | :------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING → CONFIRMED`            | Xe còn trống lịch, khách cung cấp đủ CCCD/GPLX                      | Đơn được phê duyệt, gửi link thanh toán cọc giữ xe (30% hoặc 100%)                                                               |
| `CONFIRMED → READY_FOR_HANDOVER` | Đã nhận đủ tiền cọc giữ xe quy định theo `paymentOption`            | `totalRentalPaid >= reservationDepositRequired`                                                                                  |
| `READY_FOR_HANDOVER → ONGOING`   | Đúng ngày bắt đầu thuê (`today >= startDate`), ký biên bản bàn giao | `totalRemainingRentalObligation === 0` (hoặc duyệt công nợ tại quầy) VÀ Đã xác nhận ký quỹ tài sản                               |
| `ONGOING → INSPECTING`           | Xe đã được trả về chi nhánh/kho, hoàn thành biên bản kiểm tra xe    | Ghi nhận số km, tình trạng xăng/pin và hư tổn phát sinh nếu có                                                                   |
| `INSPECTING → COMPLETED`         | Biên bản kiểm tra xe hoàn tất không còn tranh chấp                  | `totalRemainingRentalObligation === 0` VÀ `remainingExtraFeeDue === 0` VÀ `pendingRefundAmount === 0` VÀ đã xử lý ký quỹ tài sản |
| `PENDING/CONFIRMED → CANCELLED`  | Khách hoặc Admin thực hiện hủy đơn                                  | Tự động hủy (`CANCELLED`) các mã thanh toán `PENDING`/`PROCESSING` chưa thu                                                      |
| `Bất kỳ → REJECTED`              | Admin từ chối đơn                                                   | Tự động hủy toàn bộ giao dịch thanh toán đang treo                                                                               |

---

## 7. Quy tắc Chống sự kiện đến sai thứ tự (Out-of-Order / Stale Event Guard)

Được kiểm soát trong `isPaymentEventStale(currentStatus, incomingStatus)` tại [`src/lib/rental-rules.ts`](../src/lib/rental-rules.ts):

- Khi `Payment` đã đạt `CONFIRMED`, mọi sự kiện muộn báo `PENDING`, `PROCESSING`, `FAILED`, `EXPIRED`, `CANCELLED` đều bị bỏ qua an toàn (`ignoredStaleEvent: true`) và ghi nhận trong `payment_events`.
- Khi `Payment` đã ở trạng thái `REFUNDED`, không có bất kỳ sự kiện Webhook hay thao tác Admin nào được phép đưa ngược về `CONFIRMED` hoặc `PENDING`.
- Khách hàng chỉ được phép chuyển `PENDING → CANCELLED` cho mã thanh toán do chính mình tạo trước khi có xác nhận thu tiền.
