# BÁO CÁO LỖI & ĐIỂM TỒN TẠI (BUG REPORT — PHASE 2)

> Tổng hợp toàn bộ `8` lỗi đã phát hiện trong đợt kiểm toán đầu tiên (`2026-11-17`). Sau đợt nâng cấp Phase 2, **cả `8/8` lỗi (bao gồm `BUG-05` vừa migrate & xác minh)** đều đã được khắc phục triệt để và kiểm chứng bằng test tự động.

## Tóm tắt theo mức độ nghiêm trọng

| Mức độ            | Tổng phát hiện | Đã khắc phục | Còn lại | Mã lỗi                                                               |
| ----------------- | -------------: | -----------: | ------: | -------------------------------------------------------------------- |
| **P0 – Critical** |            `0` |          `0` |     `0` | —                                                                    |
| **P1 – High**     |            `1` |          `1` |     `0` | ~~`BUG-01`~~ _(Đã sửa & xác minh `PROTECTED`)_                       |
| **P2 – Medium**   |            `5` |          `5` |     `0` | ~~`BUG-02`~~, ~~`BUG-03`~~, ~~`BUG-04`~~, ~~`BUG-05`~~, ~~`BUG-06`~~ |
| **P3 – Low**      |            `2` |          `2` |     `0` | ~~`BUG-07`~~, ~~`BUG-08`~~                                           |
| **Tổng cộng**     |        **`8`** |      **`8`** | **`0`** | **`8/8` lỗi đã khắc phục hoàn toàn; `0` lỗi tồn đọng chưa sửa**      |

---

## Chi tiết từng lỗi và trạng thái xác minh cuối cùng

### [BUG-01] `P1 – High` ✅ ĐÃ KHẮC PHỤC & XÁC MINH: Xung đột giữ xe giữa nghiệp vụ Mua và Thuê

- **Tệp đã sửa**: [SalesInquiries.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/SalesInquiries.ts), [Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts), [Vehicles.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Vehicles.ts), [availability/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/availability/route.ts>).
- **Xác minh Phase 2**: `audit-local.ts` xác nhận `LOC-BUG01-CHECK` (`[PROTECTED]`) chặn đặt thuê khi xe giữ chỗ mua `DEPOSIT_PENDING`/`CONTRACT_SIGNED`, và `LOC-ADM-02` xác nhận `opStatusDuringOngoing=RENTED`, `maintDuringOngoingBlocked=true` (chặn đưa xe vào bảo trì `MAINTENANCE`/`INACTIVE` khi đang `ONGOING`).

---

### [BUG-02] `P2 – Medium` ✅ ĐÃ KHẮC PHỤC & XÁC MINH: Bộ tính giá thiếu gói tuần, tháng & phụ phí ngày lễ

- **Tệp đã sửa**: [rental-rules.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/rental-rules.ts), [Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts), [availability/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/availability/route.ts>), [vehicle-detail.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/vehicle-detail.tsx), [checkout-panel.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/checkout-panel.tsx).
- **Xác minh Phase 2**: `205/205` unit tests `PASS` (kết hợp quy chuẩn gói `weeklyPrice`/`monthlyPrice` tốt nhất và `VIETNAM_HOLIDAYS` ngày lễ + giao diện báo giá đồng bộ server).

---

### [BUG-03] `P2 – Medium` ✅ ĐÃ KHẮC PHỤC & XÁC MINH: Mâu thuẫn chính sách hủy trên `/support` & thiếu 6 trường `NoriSite`

- **Tệp đã sửa**: [support/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/support/page.tsx>).
- **Xác minh Phase 2**: E2E `#7` & `#39` (WCAG 2.2 AA `0` violations) + Production Smoke Test `HTTP 200`.

---

### [BUG-04] `P2 – Medium` ✅ ĐÃ KHẮC PHỤC & XÁC MINH E2E TRÌNH DUYỆT: Dashboard thiếu phân trang, thông tin hành trình và ô `handoverNote`

- **Tệp đã sửa**: [dashboard/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/dashboard/route.ts>), [dashboard-panel.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/dashboard-panel.tsx).
- **Xác minh Phase 2**: E2E `#43 PASS` (`30.0s`) — đã xác minh bằng trình duyệt thực tế với phiên `admins`: duyệt đơn, nhập `#dashboard-handover-note`, xác nhận hiển thị `"Ghi chú bàn giao: ..."`, hoàn thành giải phóng lịch, thống kê đội xe, bảng khách hàng và xuất CSV `200`.

---

### [BUG-05] `P2 – Medium` ✅ ĐÃ KHẮC PHỤC & XÁC MINH MIGRATION (PHASE 2): Chuyển `SalesInquiries.vehicle` sang `relationship` có Khóa ngoại SQLite

- **Vấn đề trước đây**: Cột `vehicle` trong `sales_inquiries` sử dụng kiểu `text` rời rạc thay vì khóa ngoại chuẩn Payload `relationship`.
- **Giải pháp Phase 2 (An toàn, không reset DB)**:
  1. Sao lưu dự phòng `./nori.db` trước khi migration; kiểm tra `0` bản ghi mồ côi trên `sales_inquiries`.
  2. Xây dựng migration 2 chiều [20261117_211500_sales_inquiries_vehicle_fk.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/migrations/20261117_211500_sales_inquiries_vehicle_fk.ts) (đã test round-trip `up` -> `down` trên bản sao) và chuyển đổi an toàn bảng `sales_inquiries` sang cột `vehicle_id` có `FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL`.
  3. Cập nhật [SalesInquiries.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/SalesInquiries.ts) sang `type: 'relationship', relationTo: 'vehicles'`.
- **Xác minh thực tế trên `./nori.db`**:
  - Bảo toàn nguyên vẹn `5/5` bản ghi `sales_inquiries` (`4` gắn `vehicle_id` tới xe thực tế, `1` tư vấn theo dòng xe `NULL`) và `10/10` dòng `sales_inquiries_rels`.
  - `PRAGMA foreign_key_list(sales_inquiries)` xác nhận `3` FK (`vehicle_id -> vehicles`, `model_id -> vehicle_models`, `customer_id -> users`); `PRAGMA index_list(sales_inquiries)` xác nhận `6` index (`sales_inquiries_vehicle_idx`).
  - `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = []`.
  - `audit-local.ts` (`LOC-INQ-TRANSITION PASS`) xác nhận `depth: 1` trả đối tượng quan hệ `vehicles` (`NR-OT-VIOS01`) và chặn chuyển trạng thái nhảy cóc qua `canTransitionInquiry`.

---

### [BUG-06] `P2 – Medium` ✅ ĐÃ KHẮC PHỤC: Hardcode `PAYLOAD_SECRET` làm fallback ở production

- **Tệp đã sửa**: [src/payload.config.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/payload.config.ts) (`throw new Error` khi `NODE_ENV === 'production'` mà thiếu `PAYLOAD_SECRET`).

---

### [BUG-07] `P3 – Low` ✅ ĐÃ KHẮC PHỤC: Hiển thị đầy đủ ghi chú/phương thức mua tại `/account` & nhãn `(DEMO)` cho thông tin liên hệ minh họa

- **Tệp đã sửa**: [account-panel.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/account-panel.tsx), [site-footer.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/site-footer.tsx), [support/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/support/page.tsx>).

---

### [BUG-08] `P3 – Low` ✅ ĐÃ KHẮC PHỤC: Tăng cường `assertOrigin()` (check `sec-fetch-site`/`Referer`) & Rate Limit / giới hạn đơn `PENDING`

- **Tệp đã sửa**: [api-utils.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/api-utils.ts), [Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts). Đã mở rộng bảo vệ tương tự cho `/nori-api/auth/password` & `/nori-api/dashboard/export` (`HTTP-AUTH-PWD-XSS`, `HTTP-SEC-05 PASS`).

---

## Cảnh báo phụ thuộc, Lỗ hổng Khởi tạo Admin đã xử lý & Khoảng trống Dữ liệu

1. **Đã xử lý khoảng trống Tài khoản Admin Chính thức (`admins: 0` → `2` tài khoản hoạt động trên `./nori.db`)**:
   - **Nguyên nhân trước đây**: `seedNoriIfEmpty()` chưa khởi tạo `admin@nori.vn`, script E2E cũ xóa bản ghi trong `admins`, `app-auth.ts` / `/nori-api/auth/*` chưa xác thực collection `admins` (`payload-token`), `SiteFooter` đặt link `/dashboard` công khai trong khi `SiteHeader` chưa ẩn/hiện menu `Quản trị hệ thống` theo vai trò.
   - **Khắc phục**: Bổ sung [seed-admin.mjs](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/scripts/seed-admin.mjs), `ensureOfficialAdmin()` trong [seed-nori.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/seed-nori.ts), hỗ trợ `currentAdmin()`/`loginAdmin()` tại [app-auth.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/app-auth.ts), khóa `first-register` (`HTTP 403`), phân quyền menu tại [site-header.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/site-header.tsx) và [site-footer.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/site-footer.tsx), đồng thời bỏ xóa `admins` khỏi `cleanupE2ERecords()` trong [nori.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/nori.spec.ts).
2. **`pnpm audit` — `0 High / 0 Critical`, còn `4 moderate` transitive**: Sau khi override `"dompurify": ">=3.4.17"`, `1 high` CVE và toàn bộ advisories `dompurify` đã được loại bỏ hoàn toàn (`0 high`, `0 critical`, `0 low`), chỉ còn `4 moderate` trong công cụ dev/build nội bộ (`esbuild` từ `drizzle-kit`; `uuid`, `glob`, `minimatch` từ `@payloadcms/figma`).
3. **Dữ liệu catalogue `3/20` mẫu chưa đạt ngưỡng 100% của Audit**: `ford-ranger-wildtrak` thiếu ảnh nội thất, `hyundai-accent` có `5/6` thông số, `mitsubishi-triton` có `5/6` thông số và thiếu ảnh nội thất; `21/21` xe trong `vehicles` là dữ liệu `DEMO`.
