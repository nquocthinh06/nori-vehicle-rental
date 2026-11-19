# Quy trình Rollback & Dự phòng Sự cố Thanh toán — NORI Vehicle Rental

## 1. Tắt nóng Thanh toán Trực tuyến (Zero-Downtime Kill Switch)

Khi phát hiện sự cố từ phía ngân hàng, SePay Webhook hoặc nghi ngờ bất thường bảo mật:

1. **Cách 1 (Không cần khởi động lại server)**:
   - Đăng nhập Quản trị viên → mở `/dashboard/payments` → tab **Cấu hình Thanh toán**.
   - Bỏ chọn **Bật thanh toán trực tuyến cho đơn thuê đã được duyệt** (`onlinePaymentEnabled = false`) và nhấn **Lưu cấu hình thanh toán**.
   - Ngay lập tức API `POST /nori-api/payments/create` trả mã `503 PAYMENT_DISABLED` với hướng dẫn chuyển sang chuyển khoản thủ công / thanh toán tại quầy; toàn bộ luồng đặt xe, duyệt đơn, xác nhận thanh toán thủ công và vận hành đội xe vẫn hoạt động bình thường 100%.

2. **Cách 2 (Cấp hạ tầng biến môi trường)**:
   - Đặt `PAYMENT_ENABLED=false` hoặc `PAYMENT_PRODUCTION_APPROVED=false` và khởi động lại ứng dụng.

## 2. Xử lý khi Webhook bị gián đoạn tạm thời

- SePay tự động thử lại (retry) Webhook khi endpoint không trả `2xx`.
- Do NORI bảo đảm idempotency qua `payment_events.event_id`, việc SePay retry nhiều lần hoặc Admin đối soát thủ công song song sẽ **không bao giờ gây cộng tiền 2 lần**.
- Quản trị viên có thể dùng chức năng **Xác nhận thu thủ công** kèm mã giao dịch ngân hàng để giải phóng đơn cho khách ngay lập tức.

## 3. Khôi phục Cơ sở dữ liệu (Database Rollback)

Schema mở rộng cho thanh toán trực tuyến là **100% additive-only** (không sửa đổi hay xóa bảng/cột cũ), do đó:

- Bản backup nhất quán trước khi triển khai đã được lưu tại `backups/nori-backup-2026-11-19T17-56-48-107Z.db` (đã kiểm tra `PRAGMA integrity_check = ok`, `foreignKeyViolations = 0`).
- Trong trường hợp cần khôi phục khẩn cấp cơ sở dữ liệu về trạng thái trước nâng cấp:

```bash
pnpm db:restore -- --source backups/nori-backup-2026-11-19T17-56-48-107Z.db
```

- **Lưu ý quan trọng**: Không bao giờ rollback cơ sở dữ liệu sau khi đã phát sinh giao dịch tiền thật trên Production mà chưa xuất bản sao lưu mới nhất (`pnpm db:backup`) và chốt sổ đối soát kế toán.
