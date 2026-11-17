# LỘ TRÌNH HOÀN THIỆN TIẾP THEO (ROADMAP)

1. **Go-Live Dữ liệu Thật (P0)**: Tắt `isDemo` và nhập thông tin xe/biển số/giá/ảnh thật tại `/dashboard/vehicles`; cập nhật hotline/email/địa chỉ thật tại `/dashboard/content`; bổ sung `3/20` mẫu catalogue còn thiếu (`ford-ranger-wildtrak`, `hyundai-accent`, `mitsubishi-triton`).
2. **Tích hợp Email & Thanh toán Trực tuyến (P1)**: Gắn SMTP/Resend vào `payload.config.ts`; tích hợp cổng thanh toán VNPay/MoMo kèm webhook tự động tạo bản ghi `payments` (`CONFIRMED`).
3. **Mở rộng Thuê theo giờ & Bảo mật Production (P2)**: Đổi mật khẩu `admin@nori.vn` bằng `NORI_ADMIN_PASSWORD='<mat-khau-manh>' pnpm seed:admin -- --reset-password`, thiết lập sao lưu định kỳ `nori.db` và chạy `figma make verify-deploy` trên môi trường deploy.
