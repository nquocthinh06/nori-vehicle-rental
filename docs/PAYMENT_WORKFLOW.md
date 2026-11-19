# Luồng Nghiệp vụ Thanh toán Trực tuyến — NORI Vehicle Rental

## 1. Luồng tổng thể từ Đặt xe → Duyệt đơn → Thanh toán VietQR/Webhook → Bàn giao → Quyết toán

```mermaid
sequenceDiagram
  autonumber
  actor Cust as Khách hàng
  participant UI as /checkout & /my-bookings
  participant API as NORI Backend API
  participant DB as SQLite (Payload)
  actor Admin as Quản trị viên
  participant GW as SePay / Mock Webhook

  Cust->>UI: Chọn xe, ngày thuê, mã KM -> Gửi đơn (/checkout)
  UI->>API: POST /nori-api/bookings
  API->>DB: Tạo booking (status=PENDING) + khóa rental_days
  Note over Cust,API: Bước PENDING: Chưa thu tiền, chặn thanh toán trực tuyến (409)

  Admin->>API: PATCH /nori-api/dashboard/bookings (status=DEPOSIT_PENDING)
  API->>DB: Cập nhật đơn + khóa tự sửa trực tiếp + gửi thông báo PAYMENT_REQUIRED

  Cust->>UI: Mở /my-bookings -> Nhấn "Thanh toán đặt cọc"
  UI->>API: POST /nori-api/payments/create (bookingId, paymentType=DEPOSIT)
  API->>DB: Kiểm tra quyền sở hữu & tính lại số tiền từ Server -> Tạo/Tái sử dụng Payment (PENDING)
  API-->>UI: Trả mã VietQR, STK, Nội dung NORIPAY..., expiresAt

  Cust->>GW: Quét VietQR & chuyển khoản đúng số tiền + nội dung NORIPAY...
  GW->>API: POST /nori-api/payments/webhook/sepay (Header: Authorization: Apikey)
  API->>API: Verify Apikey (timing-safe) + Idempotency check (payment_events)
  API->>DB: Cập nhật Payment=CONFIRMED, Booking DEPOSIT_PENDING -> CONFIRMED + Audit + Notification

  loop Smart Polling (4s, tạm dừng khi ẩn tab, tối đa 45 lần)
    UI->>API: GET /nori-api/payments/status?paymentId=...
    API-->>UI: status=CONFIRMED, financial summary mới nhất
  end
  UI-->>Cust: Hiển thị biên nhận xác nhận thành công & dừng polling

  Admin->>API: PATCH /nori-api/dashboard/bookings (status=ONGOING)
  API->>API: Kiểm tra checkHandoverFinancialEligibility (đủ cọc -> cho phép giao xe)

  Cust->>UI: Thanh toán phần tiền thuê còn lại + phụ phí (nếu có)
  Admin->>API: PATCH /nori-api/dashboard/bookings (status=COMPLETED)
  API->>API: Kiểm tra checkSettlementCompletionEligibility -> giải phóng lịch & hoàn tất
```

## 2. Luồng xử lý Ngoại lệ (Underpaid / Overpaid / Late Payment / Unmatched)

```mermaid
flowchart TD
  WH["Nhận Webhook hợp lệ từ SePay"] --> MATCH{"Khớp Payment\nhoặc Booking?"}
  MATCH -- Không --> UNM["Tạo Payment REVIEW_REQUIRED\nreconciliationStatus=UNMATCHED\nGhi payment_events"]
  MATCH -- Có --> CLOSED{"Đơn đã CANCELLED/REJECTED\nhoặc Payment EXPIRED?"}
  CLOSED -- Có --> LATE["Payment -> REVIEW_REQUIRED\nreconciliationStatus=LATE_PAYMENT\nKHÔNG mở lại lịch xe"]
  CLOSED -- Không --> CMP{"So sánh tổng tiền nhận\nvới expectedAmount"}
  CMP -- "< expectedAmount" --> UNDER["Payment -> PARTIALLY_PAID\nreconciliationStatus=UNDERPAID\nChưa xác nhận đơn thuê"]
  CMP -- "= expectedAmount" --> EXACT["Payment -> CONFIRMED\nreconciliationStatus=MATCHED\nXác nhận đặt cọc/đơn thuê"]
  CMP -- "> expectedAmount" --> OVER["Payment -> CONFIRMED\nreconciliationStatus=OVERPAID\nGhi overpaidAmount chờ hoàn tiền dư"]
```

## 3. Luồng Hoàn tiền (Refund Workflow)

1. Admin (có quyền `payments.update`) tạo yêu cầu hoàn tiền qua `POST /nori-api/dashboard/payments/refund` (`action: 'create'`).
2. Hệ thống kiểm tra:
   - Không vượt quá số dư thực nhận còn có thể hoàn (`totalVerifiedReceived - alreadyRefunded - pendingRefund`).
   - Bắt buộc có lý do kiểm toán (`reason`).
   - Chống tạo trùng hoàn tiền đồng thời (`withBookingWriteLock` + kiểm tra yêu cầu đang mở trùng số tiền/giao dịch).
3. Chuyển trạng thái qua `approve` → `complete` (kèm `providerRefundId` chứng từ chuyển khoản hoàn tiền).
4. Khi `complete` (`status = REFUNDED`):
   - Cộng dồn `refundedAmount` trên giao dịch gốc (`PARTIALLY_REFUNDED` hoặc `REFUNDED`).
   - Tự động cập nhật doanh thu ròng trên `/dashboard/payments` và `/dashboard/reports`.
   - Ghi `audit_logs` và gửi thông báo `REFUND_COMPLETED` cho khách hàng.
