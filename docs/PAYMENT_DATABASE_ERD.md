# Thiết kế Cơ sở dữ liệu & ERD Thanh toán — NORI Vehicle Rental

## 1. Sơ đồ quan hệ thực thể (Mermaid ERD)

```mermaid
erDiagram
  USERS ||--o{ BOOKINGS : "places"
  VEHICLES ||--o{ BOOKINGS : "assigned_to"
  BOOKINGS ||--o{ PAYMENTS : "has_transactions"
  USERS ||--o{ PAYMENTS : "owns"
  PAYMENTS ||--o{ PAYMENT_EVENTS : "receives_webhooks"
  BOOKINGS ||--o{ PAYMENT_EVENTS : "referenced_by"
  BOOKINGS ||--o{ REFUNDS : "has_refunds"
  PAYMENTS ||--o{ REFUNDS : "refunded_from"
  USERS ||--o{ REFUNDS : "beneficiary"

  BOOKINGS {
    text id PK
    text booking_key UK
    text status
    numeric total_price
    numeric deposit_snapshot
    numeric initial_payment_due
    numeric remaining_amount
    numeric extra_fee
    text promo_code
    numeric promo_discount_amount
  }

  PAYMENTS {
    text id PK
    text reference UK
    text booking_id FK
    text customer_id FK
    text payment_type
    text method
    text provider
    text environment
    text currency
    numeric amount
    numeric expected_amount
    numeric received_amount
    numeric refunded_amount
    numeric overpaid_amount
    text status
    text reconciliation_status
    text provider_transaction_id
    text provider_payment_ref
    text qr_image_url
    text payment_url
    text bank_code
    text bank_account_number
    text bank_account_name
    text transfer_content
    text expires_at
    text idempotency_key
    text verified_at
    text paid_at
    text failure_reason
    text reconciliation_note
  }

  PAYMENT_EVENTS {
    text id PK
    text event_id UK
    text provider
    text environment
    text external_transaction_id
    text payment_reference
    text event_type
    numeric transfer_amount
    text verification_result
    text processing_status
    numeric retry_count
    text received_at
    text processed_at
    text error_reason
    text payment_id FK
    text booking_id FK
    text sanitized_payload
  }

  REFUNDS {
    text id PK
    text reference UK
    text payment_id FK
    text booking_id FK
    text customer_id FK
    text refund_type
    numeric amount
    text reason
    text status
    text provider
    text provider_refund_id
    text requested_by
    text approved_by
    text completed_by
    text requested_at
    text approved_at
    text completed_at
    text reconciliation_note
    text bank_account_info
  }
```

## 2. Migration mở rộng an toàn (Additive-Only)

File migration: [`src/migrations/20261120_010000_online_payment_integration.ts`](../src/migrations/20261120_010000_online_payment_integration.ts) (tích hợp đồng thời vào `applyAdditivePaymentSchema` trong [`src/lib/data-sync.ts`](../src/lib/data-sync.ts)):

- **Không xóa cột**, **không sửa đổi kiểu dữ liệu cũ**, **không ghi đè dữ liệu hiện có** trong `nori.db`.
- Thêm 4 bảng mới: `payment_events`, `payment_events_rels`, `refunds`, `refunds_rels` (nâng tổng số bảng trong `nori.db` từ 84 lên 88 bảng).
- Bổ sung 21 cột mới trên `payments` và 17 cột cấu hình thanh toán trên `nori_site` với giá trị mặc định tương thích ngược hoàn toàn.
- Bổ sung các Unique Index & Index quan trọng:
  - `payment_events_event_id_idx` (UNIQUE) — chống xử lý trùng lặp sự kiện Webhook ở tầng Database.
  - `payments_provider_payment_ref_idx`, `payments_provider_transaction_id_idx`, `payments_idempotency_key_idx`, `payments_reconciliation_status_idx`.
  - `refunds_reference_idx` (UNIQUE), `refunds_booking_idx`, `refunds_payment_idx`, `refunds_status_idx`.
