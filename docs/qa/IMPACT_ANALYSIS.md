# NORI VEHICLE RENTAL — PHÂN TÍCH TÁC ĐỘNG HỆ THỐNG (IMPACT ANALYSIS MATRIX)

- **Ngày thực hiện**: 2026-11-20
- **Phiên bản khảo sát**: `v2.7.1` (Hotfix sau Module 3.7, LAN Server & Payment Overhaul)
- **Baseline so sánh**: Commit `8da407e` (LAN Server release) & Commit `0746dd7` (Module 3.7 release)

---

## 1. Ma trận Phân tích Tác động (Impact Analysis Matrix)

| Chức năng thay đổi                                         | File / Module trực tiếp                                                                  | Phân hệ / Chức năng bị ảnh hưởng                                                                                      | Collection / Bảng CSDL                  | Vai trò bị ảnh hưởng          |   Mức độ rủi ro   | Bộ Test Case xác minh tương ứng                                                                                                            |
| :--------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- | :---------------------------- | :---------------: | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **Bổ sung `paymentOption` & `reservationDepositSnapshot`** | `src/collections/Bookings.ts`, `src/components/checkout-panel.tsx`                       | - Khách hàng Checkout<br>- Quản lý Đơn thuê Customer<br>- Dashboard Đơn thuê Admin<br>- Chuông thông báo (Join depth) | `bookings`, `notifications`, `payments` | Customer, Admin               | **P0 (Critical)** | `tests/db-migration-regression.test.mjs`<br>`tests/payment-business-audit.test.mjs`<br>`tests/e2e/auth-session-booking-regression.spec.ts` |
| **Database Migration Batch 4 (`20261120_030000`)**         | `src/migrations/20261120_030000_booking_payment_option_plans.ts`, `src/lib/data-sync.ts` | - DDL cấu trúc CSDL SQLite<br>- Khởi tạo máy mới (`schema.sql`)<br>- Di trú nâng cấp CSDL cũ                          | `bookings`, `payload_migrations`        | Toàn bộ hệ thống              | **P0 (Critical)** | `tests/db-migration-regression.test.mjs` (Groups A, B, C, D, E, F, G)                                                                      |
| **Startup Preflight Guard (`check-db-schema.mjs`)**        | `scripts/check-db-schema.mjs`, `scripts/start-*.mjs`                                     | - Khởi động Server Dev, LAN, Standalone<br>- Isolated Test Runner                                                     | Toàn bộ 109 bảng SQLite                 | Developer, DevOps             |   **P1 (High)**   | `tests/db-migration-regression.test.mjs` (Group C & D)                                                                                     |
| **Gia cố API Health Readiness Probe**                      | `src/app/(frontend)/nori-api/health/route.ts`                                            | - Giám sát sức khỏe hệ thống<br>- Test runner readiness wait (`waitForHealth`)                                        | `vehicles`, `bookings`                  | Customer, Monitor             |   **P1 (High)**   | `tests/db-migration-regression.test.mjs`<br>`tests/e2e/lan-multi-device.spec.ts`                                                           |
| **Chuẩn hóa Error Handling & Request Trace ID**            | `src/lib/api-utils.ts`                                                                   | - Toàn bộ API response trả về lỗi<br>- Bảo mật không lộ raw SQL query                                                 | Toàn bộ API routes                      | Khách hàng, Security          |  **P2 (Medium)**  | `tests/db-migration-regression.test.mjs`<br>`tests/e2e/data-sync.spec.ts`                                                                  |
| **Phân định Hạch toán Ký quỹ vs Doanh thu Thuê**           | `src/lib/payment-service.ts`, `src/components/admin/bookings-panel.tsx`                  | - Admin Dashboard Bookings<br>- Khách hàng xem chi phí cọc<br>- Báo cáo tài chính kế toán                             | `bookings`, `payments`, `refunds`       | Customer, Accountant, Manager |   **P1 (High)**   | `tests/payment-business-audit.test.mjs`<br>`tests/payment-rules.test.mjs`                                                                  |
| **Drawer Menu & Mobile Bottom Sheet Responsive**           | `src/components/site-header.tsx`, `src/components/admin/admin-shell.tsx`                 | - Trải nghiệm di động (<640px)<br>- Menu điều hướng, touch targets<br>- Admin Account Dropdown                        | Giao diện Frontend                      | Mobile Guest, Mobile Admin    |  **P2 (Medium)**  | `tests/e2e/lan-multi-device.spec.ts`<br>`tests/e2e/mobile-webkit.spec.ts`                                                                  |
| **Module 3.7: Đa Chi Nhánh, Kho Xe & Điều Chuyển**         | `src/collections/Branches.ts`, `src/lib/multi-branch-rules.ts`                           | - Tìm kiếm lọc xe theo chi nhánh<br>- Điều chuyển xe liên chi nhánh<br>- Giao nhận tận nơi theo vùng                  | 10 collections mới, 21 bảng mới         | Staff, Manager, Customer      |   **P1 (High)**   | `tests/multi-branch-rules.test.mjs`<br>`tests/multi-branch-integration.test.mjs`<br>`tests/e2e/multi-branch-workflow.spec.ts`              |
| **Cơ chế Máy chủ LAN & Dynamic IPv4 Detection**            | `scripts/start-lan.mjs`, `scripts/lan-network.mjs`                                       | - Truy cập Wi-Fi nội bộ từ điện thoại<br>- Đăng nhập cookie không bật Secure trên LAN HTTP                            | `session-cookie.ts`, Network binding    | Mobile Customer, LAN Testers  |   **P1 (High)**   | `tests/lan-network.test.mjs`<br>`tests/e2e/lan-multi-device.spec.ts`                                                                       |

---

## 2. Đánh giá Mối đe dọa Rủi ro & Chiến lược Kiểm soát

1. **Rủi ro hồi quy Schema CSDL (Database Schema Regression)**:
   - _Nguy cơ_: Thêm trường vào schema Payload nhưng quên migration $\rightarrow$ API ném SQLITE_ERROR khi truy vấn thực tế.
   - _Chiến lược kiểm soát_: Bắt buộc chạy `scripts/check-db-schema.mjs` trước mọi lệnh start/dev/e2e; kiểm tra tự động 7 nhóm hồi quy migration.
2. **Rủi ro xung đột dữ liệu & Deadlock SQLite (Concurrency Conflict)**:
   - _Nguy cơ_: Nhiều khách cùng đặt 1 xe hoặc Admin và Khách cùng sửa 1 đơn.
   - _Chiến lược kiểm soát_: Khóa `rental_days`, Optimistic Locking (`expectedRevision`), `busyTimeout = 10000` và chế độ WAL mode.
3. **Rủi ro vỡ giao diện trên điện thoại (Mobile Responsive Blowout)**:
   - _Nguy cơ_: Input chữ nhỏ gây Safari auto-zoom, bảng dữ liệu tràn ngang, touch targets dưới 44×44px.
   - _Chiến lược kiểm soát_: Quy chuẩn font-size 16px mobile, khóa tràn ngang `overflow-x: hidden`, kiểm thử Mobile WebKit tự động.
