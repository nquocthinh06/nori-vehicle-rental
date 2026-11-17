# LỘ TRÌNH PHÁT TRIỂN & TRẠNG THÁI CÁC PHASE (DEVELOPMENT ROADMAP — PHASE 2)

> Cập nhật tiến độ thực hiện 7 Phase kỹ thuật sau đợt hoàn thiện **NORI Phase 2** (`2026-11-17`). Toàn bộ **Phase 1, Phase 2 (Schema/Migration), Phase 3, Phase 4, Phase 5 (Dashboard/Thông báo In-App/CSV), và Phase 6 (Bảo mật/Linter/E2E Admin)** đã được hoàn thành; chỉ còn phần thay dữ liệu thật, tích hợp hạ tầng Email/Payment và nghiệm thu trên môi trường deploy thật (`figma` CLI / SSO).

---

### ✅ Phase 1 — Khắc phục lỗi nghiêm trọng & xung đột nghiệp vụ (`BUG-01`, `BUG-06`) — `ĐÃ HOÀN THÀNH`

- Hoàn thiện khóa `RESERVED` khi mua đặt cọc/ký hợp đồng, đồng bộ `RENTED`/`READY`, chặn `MAINTENANCE`/`INACTIVE` khi `ONGOING` và bắt buộc `PAYLOAD_SECRET` ở production. (`LOC-BUG01-CHECK PROTECTED`, `LOC-ADM-02 PASS`).

---

### ✅ Phase 2A — Migration Khóa ngoại DB (`BUG-05`) — `ĐÃ HOÀN THÀNH`

- Đã sao lưu DB, kiểm tra `0` dữ liệu mồ côi, test round-trip `up`/`down`, chạy migration [20261117_211500_sales_inquiries_vehicle_fk.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/migrations/20261117_211500_sales_inquiries_vehicle_fk.ts) bảo toàn `5/5` rows (`4` `vehicle_id`, `1` `NULL`), `3` FK, `6` index, `integrity_check = ok`, `fkCheck = []`.

---

### ✅ Phase 3 & 4 — Công thức Thuê xe (`BUG-02`), Chính sách & Hiển thị Khách hàng (`BUG-03`, `BUG-07`) — `ĐÃ HOÀN THÀNH`

- Hỗ trợ đầy đủ gói tuần/tháng, phụ phí ngày lễ VN (`VIETNAM_HOLIDAYS`), đồng bộ `NoriSite` lên `/support`, hiển thị đủ chi tiết yêu cầu mua, thêm **Đổi mật khẩu** (`POST /nori-api/auth/password`) và **Thông báo trạng thái gần đây (In-App)** trên `/account` (đã E2E `#43 PASS`).

---

### ✅ Phase 5 — Hoàn thiện Dashboard Admin & Xuất CSV (`BUG-04`) — `ĐÃ HOÀN THÀNH (trừ Email Adapter)`

- Mở rộng `/dashboard` với phân trang, lọc trạng thái, `handoverNote`, **Thống kê Đội xe & Giá trị Hợp đồng (Dự kiến)**, cảnh báo **`Quá hạn đặt cọc (>24h)`**, **Quản lý Tài khoản Khách hàng**, và API xuất **CSV (`/nori-api/dashboard/export`)** UTF-8 BOM chống CSV injection. Toàn bộ vòng đời Admin trên UI đã E2E `#43 PASS` + `0` vi phạm WCAG 2.2 AA.

---

### ✅ Phase 6 — Bảo mật, Vá `High` CVE, AST Linter & Hoàn thiện E2E — `ĐÃ HOÀN THÀNH`

- Override `dompurify >= 3.4.17` đưa `pnpm audit` về **`0 High / 0 Critical / 0 Low`** (`4 moderate` công cụ dev/plugin).
- Tách riêng `pnpm lint` (`scripts/static-lint.mjs`) khỏi `pnpm format:check` (`oxfmt`).
- Phủ đủ `205/205` Unit Test, `17/17` HTTP API/Race/XSS/Export `403`, `12/12` Local API, `43/43` E2E Playwright (`WCAG 2.2 AA 8/8` màn hình) và `7/7` Tablet `768×1024`.

---

### ⏳ Phase 2B & Phase 7 — Chuẩn bị Dữ liệu Thật, Tích hợp Hạ tầng & Go-Live — `CHỜ DOANH NGHIỆP / HẠ TẦNG`

Xem chi tiết danh sách đầu việc ưu tiên và điều kiện thực hiện tại [NEXT_ACTIONS.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/NEXT_ACTIONS.md). Tóm tắt 4 hạng mục còn lại:

1. **Dữ liệu thật thay thế `DEMO`**: Vô hiệu hóa `21` xe `isDemo: true`, nhập danh sách xe thật/biển số thật/ảnh thật, cập nhật hotline/email/địa điểm thật tại `NoriSite`, và bổ sung thông số + ảnh nội thất cho `3` dòng xe (`ford-ranger-wildtrak`, `hyundai-accent`, `mitsubishi-triton`).
2. **Email/SMS Adapter & Đặt lại mật khẩu**: Cấu hình SMTP/Resend Adapter trong `payload.config.ts` để kích hoạt email xác nhận đơn, quên mật khẩu và mở khóa đổi email.
3. **Cổng thanh toán & Nghiệp vụ mở rộng (nếu kinh doanh cần)**: Tích hợp VNPay/MoMo/Stripe (kèm webhook & hoàn tiền), mở tính cước theo giờ (`pricePerHour`/`bufferHours`) và bổ sung case E2E click khóa user / chuyển từng bước inquiry trên `/dashboard`.
4. **Kiểm thử trên Figma Make Host thật**: Chạy `figma make verify-deploy`, xác minh đăng nhập Figma SSO `/admin` trên môi trường deploy đích với `PAYLOAD_SECRET` production.
