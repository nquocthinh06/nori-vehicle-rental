# HÀNH ĐỘNG TIẾP THEO ĐỂ ĐƯA DỰ ÁN NORI VÀO VẬN HÀNH (NEXT ACTIONS)

> Cập nhật sau khi hoàn thiện hệ thống Admin chính thức (`admin@nori.vn`), luồng đăng nhập `/login` + `/admin/login`, bảng điều hành MVP trên `/dashboard` và tách DB kiểm thử cô lập.

---

## ✅ Các Hạng mục Kỹ thuật Vận hành Đã Hoàn thành

- Đã khởi tạo tài khoản Admin chính thức (`admin@nori.vn`) idempotent qua [scripts/seed-admin.mjs](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/scripts/seed-admin.mjs) với quyền `SUPER_ADMIN` và tự động đảm bảo trong `seedNoriIfEmpty` ([seed-nori.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/seed-nori.ts)); vô hiệu hóa `first-register` (`403`).
- Đã hoàn thiện giao diện quản trị **NORI Administration** tách riêng tại `/dashboard` với 9 module route chuyên biệt (`/dashboard`, `/dashboard/vehicles`, `/dashboard/models`, `/dashboard/bookings`, `/dashboard/inquiries`, `/dashboard/customers`, `/dashboard/content`, `/dashboard/reports`, `/dashboard/admins`), đồng bộ 100% Design System NORI, hỗ trợ CRUD xe/dòng xe, upload ảnh, lịch sử trạng thái, phụ phí phát sinh, cập nhật `NoriSite`, báo cáo & xuất 5 loại CSV, phân quyền Admin và `audit-logs`.
- Đã kiểm thử thực tế với DB cô lập (`scripts/test-admin-isolated.mjs`), `pnpm build`, `pnpm typecheck`, `pnpm lint` (`112/112` tệp), `pnpm test` (`205/205`) và Playwright E2E giữ nguyên `./nori.db`.

---

## Nhóm 1 — Bắt buộc trước khi Go-Live Thương mại (P0 / P1 Dữ liệu & Hạ tầng)

1. **Thay thế 100% Dữ liệu `DEMO` bằng Tài sản Doanh nghiệp thật**:
   - **Xe thực tế (`vehicles`)**: Ẩn/tắt cờ `isDemo` trên `21` bản ghi mẫu và nhập xe thật (biển số thật, ODO thực tế, giá thuê/giá bán/đặt cọc đã duyệt và ảnh `ACTUAL_VEHICLE` thật) thông qua `/admin/collections/vehicles` hoặc `/dashboard`.
   - **Bổ sung `3/20` mẫu Catalogue thiếu chuẩn**:
     - `ford-ranger-wildtrak`: Bổ sung ít nhất `1` ảnh góc nội thất (`INTERIOR`).
     - `hyundai-accent`: Bổ sung ít nhất `1` thông số kỹ thuật (hiện `5/6`).
     - `mitsubishi-triton`: Bổ sung `1` thông số kỹ thuật (hiện `5/6`) và ảnh nội thất (`INTERIOR`).
   - **Thông tin Doanh nghiệp (`NoriSite`)**: Thay hotline `1900 636 000 (DEMO)`, email `hotro@nori.vn (DEMO)` và địa chỉ `(Điểm giao nhận DEMO)` tại `/admin/globals/nori-site`.
2. **Quản trị Tài khoản Admin Production & Deploy Verification**:
   - Trước khi lên server thật, chạy `NORI_ADMIN_PASSWORD='<mat-khau-manh>' pnpm seed:admin -- --reset-password` để đặt mật khẩu riêng cho môi trường production.
   - Đảm bảo môi trường deploy có đủ `PAYLOAD_SECRET`, `DATABASE_URI`, `NEXT_PUBLIC_SITE_URL`, `NORI_REVALIDATE_ORIGINS`.
   - Chạy `figma make verify-deploy` và thử `pnpm build` + `node .next/standalone/server.js` trên môi trường deploy thật (`figma` CLI không tồn tại ở shell Windows cục bộ).

---

## Nhóm 2 — Nâng cấp Vận hành & Mở rộng Nghiệp vụ (P2 / P3)

3. **Tích hợp Email / SMS Adapter**:
   - Gắn SMTP / Resend vào [src/payload.config.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/payload.config.ts) để mở khóa **Quên / Đặt lại mật khẩu qua Email**, xác minh đổi email khách hàng (`F-AUTH-05`, `F-ACC-03`) và gửi email trạng thái đơn thuê.
4. **Bổ sung E2E click chuyển trạng thái Yêu cầu mua (`F-SAL-03`)**:
   - Thêm kịch bản Playwright bấm chuyển `NEW -> CONTACTED` / `DELIVERED` trực tiếp cho Yêu cầu mua trên `/dashboard` (backend & UI nút đã hoàn thiện).
5. **Thanh toán Trực tuyến, Thuê theo giờ & Bảo trì Định kỳ (`F-PAY-03`, `F-RPT-02`, `F-RNT-05`, `F-CAL-03`)**:
   - Tích hợp VNPay / MoMo / Stripe kèm webhook, mở tính cước theo giờ (`pricePerHour`) và khóa thời gian đệm `bufferHours` theo nhu cầu kinh doanh.
   - Sao lưu `./nori.db` định kỳ và theo dõi bản vá cho `4 moderate` transitive (`esbuild`, `uuid`, `glob`, `minimatch`).
