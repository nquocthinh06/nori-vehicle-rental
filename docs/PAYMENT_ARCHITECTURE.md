# Kiến trúc Hệ thống Thanh toán — NORI Vehicle Rental

## 1. Sơ đồ kiến trúc tổng thể

```mermaid
flowchart TB
  subgraph Client["Frontend (Next.js App Router + React 19)"]
    CO["/checkout\nTóm tắt chi phí & chính sách cọc"]
    MB["/my-bookings\nQuản lý đơn & Màn hình VietQR"]
    ADP["/dashboard/payments\nGiao dịch · Đối soát · Hoàn tiền · Webhook · Cấu hình"]
    ADB["/dashboard/bookings\nTrạng thái tài chính & Kiểm soát bàn giao"]
    ADR["/dashboard/reports\nDoanh thu thực thu · Ròng · Cọc bảo đảm tách riêng"]
  end

  subgraph API["API Layer (/nori-api/*)"]
    PAPI["Customer Payment APIs\n/payments/create · /status · /history · /cancel · /mock-simulate"]
    WHAPI["Webhook Endpoint\n/payments/webhook/sepay"]
    DAPI["Admin Payment APIs\n/dashboard/payments · /confirm · /reconcile · /refund · /config"]
    EAPI["Export & Reports\n/dashboard/reports · /dashboard/export?type=payments|financial"]
  end

  subgraph Core["Domain & Service Layer"]
    RULES["src/lib/rental-rules.ts\nCông thức tài chính · State Machine · Guards"]
    SVC["src/lib/payment-service.ts\nIdempotency · Lock · Webhook Engine · Reconciliation · Refund"]
    LOCK["withBookingWriteLock\nTuần tự hóa ghi SQLite chống Race Condition"]
  end

  subgraph Adapters["Payment Provider Adapter Pattern (src/lib/payment-providers.ts)"]
    IF["PaymentProviderAdapter Interface"]
    SEPAY["SePayProvider\n(VietQR + Webhook Apikey + User API)"]
    MOCK["MockPaymentProvider\n(SVG QR + Controlled Simulator)"]
    MANUAL["ManualPaymentProvider\n(Đối soát chứng từ thủ công)"]
    FUTURE["Future Stubs\nPayOS · VNPay · MoMo · ZaloPay"]
  end

  subgraph Data["Persistence Layer (Payload CMS + SQLite nori.db)"]
    BK[("bookings")]
    PAY[("payments")]
    EV[("payment_events")]
    REF[("refunds")]
    NOTIF[("notifications")]
    AUDIT[("audit_logs")]
    SITE[("nori_site")]
  end

  CO --> PAPI
  MB --> PAPI
  ADP --> DAPI
  ADB --> DAPI
  ADR --> EAPI

  PAPI --> SVC
  WHAPI --> SVC
  DAPI --> SVC
  EAPI --> SVC

  SVC --> RULES
  SVC --> LOCK
  SVC --> IF
  IF --> SEPAY
  IF --> MOCK
  IF --> MANUAL
  IF -.-> FUTURE

  SVC --> BK
  SVC --> PAY
  SVC --> EV
  SVC --> REF
  SVC --> NOTIF
  SVC --> AUDIT
  SVC --> SITE
```

## 2. Payment Adapter Pattern

Mọi cổng thanh toán đều triển khai chuẩn `PaymentProviderAdapter` trong [`src/lib/payment-providers.ts`](../src/lib/payment-providers.ts):

- `isConfigured(env, bankConfig)`: Kiểm tra khóa môi trường & tài khoản ngân hàng hợp lệ.
- `createPayment(input)`: Khởi tạo yêu cầu thanh toán, mã tham chiếu `NORIPAY...`, URL VietQR và dữ liệu SVG QR dự phòng.
- `verifyWebhook(params)`: Xác thực chữ ký / `Apikey` bằng so sánh hằng số thời gian (`crypto.timingSafeEqual`).
- `normalizeWebhookEvent(payload, env)`: Chuẩn hóa payload nhà cung cấp về `NormalizedWebhookEvent` thống nhất.
- `queryTransaction(params)`: Tra cứu trạng thái giao dịch tại cổng (hỗ trợ SePay User API).
- `cancelPayment(params)`: Hủy mã thanh toán đang chờ.
- `createRefund(params)`: Hỗ trợ quy trình hoàn tiền (trả trạng thái đối soát thủ công với SePay/Manual hoặc hoàn tức thì với Mock).

## 3. Phân tách dữ liệu tài chính chuẩn hóa

Toàn bộ công thức tài chính được tập trung duy nhất tại [`src/lib/rental-rules.ts`](../src/lib/rental-rules.ts) (`calculateBookingFinancialSummary`):

1. **Doanh thu thuê xe thực thu (`rentalRevenueCollected`)**: Chỉ tính tổng tiền đã xác thực (`CONFIRMED`, `PARTIALLY_REFUNDED`, `REFUNDED` trước khi trừ hoàn) từ các loại `DEPOSIT`, `RENTAL_FEE`, `FULL_PAYMENT`, `EXTRA_FEE`.
2. **Tiền cọc bảo đảm tài sản (`securityDepositHeld`)**: Được hạch toán hoàn toàn độc lập từ loại `SECURITY_DEPOSIT`, **không bao giờ cộng gộp vào doanh thu thuê xe**.
3. **Doanh thu ròng sau hoàn tiền (`netCollectedAmount`)**: `max(0, totalVerifiedReceived - totalRefundedAmount)`.
4. **Còn phải thu (`totalRemainingRentalObligation`)**: `remainingRentalBeforeExtra + remainingExtraFeeDue`.
