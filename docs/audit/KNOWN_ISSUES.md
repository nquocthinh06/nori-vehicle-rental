# CÁC VẤN ĐỀ TỒN ĐỌNG (KNOWN ISSUES)

1. **Dữ liệu Demo (`21` xe & liên hệ `NoriSite`)**: Toàn bộ `21` xe thực tế hiện mang cờ `isDemo = true` và `NoriSite` chứa thông tin liên hệ mẫu `(DEMO)`. Cần thay thế bằng tài sản thật qua `/dashboard/vehicles` và `/dashboard/content` trước khi Go-Live thương mại.
2. **Thanh toán trực tuyến (`VNPay`/`MoMo`/`Stripe`)**: Chưa tích hợp webhook thanh toán tự động; hiện dùng sổ thu/chi xác nhận ngoại tuyến tại `/dashboard/payments`.
3. **Email / SMS Adapter**: Chưa cấu hình SMTP/Resend nên chưa hỗ trợ gửi email đặt lại mật khẩu hoặc thông báo tự động qua email.
4. **Thuê theo giờ (`pricePerHour` / `bufferHours`)**: Chưa kích hoạt đặt thuê theo giờ; lịch khả dụng khóa theo ngày (`YYYY-MM-DD`).
5. **Cloud Deploy Verification (`figma make verify-deploy`)**: Không thể chạy trên shell Windows cục bộ vì thiếu `figma` CLI.
