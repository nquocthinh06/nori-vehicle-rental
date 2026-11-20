# NORI VEHICLE RENTAL — BÁO CÁO THEO DÕI SỰ CỐ & KIỂM THỬ HỒI QUY (BUG & REGRESSION REPORT)

- **Ngày kiểm toán**: 2026-11-20
- **Phiên bản hệ thống**: `v2.7.1` (P0 Hotfix & Full System QA)
- **Tổng số lỗi ghi nhận & xử lý**: 7 sự cố (1 P0, 2 P1, 4 P2). Tất cả đã được khắc phục triệt để và có test bảo vệ lâu dài.

---

## 1. Bảng Tổng hợp Sự cố & Kiểm thử Hồi quy (Bug Tracking Table)

|    Bug ID     | Tên Sự Cố & Mô Tả                                                                                 |      Mức Độ       | Module / Phân Hệ                           | Vai Trò Bị Ảnh Hưởng          |  Trạng Thái Xử Lý   | Mã Test Case Hồi Quy Bảo Vệ                                               |
| :-----------: | :------------------------------------------------------------------------------------------------ | :---------------: | :----------------------------------------- | :---------------------------- | :-----------------: | :------------------------------------------------------------------------ |
| **BUG-P0-01** | `SQLITE_ERROR: no such column: payment_option` khi truy cập Đơn thuê & Thông báo                  | **P0 (Critical)** | Bookings / Notifications / SQLite DDL      | Customer, Mobile LAN User     | **RESOLVED (100%)** | `tests/db-migration-regression.test.mjs` (Group B & G)                    |
| **BUG-P1-02** | Khởi chạy server không kiểm tra tính tương thích schema CSDL (Thiếu Startup Preflight Guard)      |   **P1 (High)**   | Startup Scripts (`start-dev`, `start-lan`) | Developer, DevOps             | **RESOLVED (100%)** | `tests/db-migration-regression.test.mjs` (Group C & D)                    |
| **BUG-P1-03** | Endpoint `/nori-api/health` chỉ đếm `vehicles`, báo 200 OK ngay cả khi bảng `bookings` lỗi        |   **P1 (High)**   | Health Check / Readiness Probe             | System Monitor, Test Runner   | **RESOLVED (100%)** | `tests/db-migration-regression.test.mjs`                                  |
| **BUG-P2-04** | Safari Mobile tự động zoom vào form input (<16px) và menu dropdown tràn mép màn hình              |  **P2 (Medium)**  | Frontend Header / Admin Shell CSS          | Mobile Customer, Mobile Admin | **RESOLVED (100%)** | `tests/e2e/lan-multi-device.spec.ts`<br>`tests/e2e/mobile-webkit.spec.ts` |
| **BUG-P2-05** | Gỡ bỏ voucher tại Checkout để lại trạng thái giảm giá treo trong giỏ hàng                         |  **P2 (Medium)**  | Checkout State Machine                     | Customer                      | **RESOLVED (100%)** | `tests/e2e/promo-checkout-regression.spec.ts`                             |
| **BUG-P2-06** | Lỗi khóa tệp Windows (EPERM) khi xóa thư mục CSDL test tạm thời trong regression test             |  **P2 (Medium)**  | Test Runner Harness                        | QA Engineer                   | **RESOLVED (100%)** | `tests/db-migration-regression.test.mjs` (`safeCleanup`)                  |
| **BUG-P2-07** | Thử nghiệm xóa cột trong Schema Drift (Group D) thất bại do chỉ mục `bookings_payment_option_idx` |  **P2 (Medium)**  | Database Migration Testing                 | QA Engineer                   | **RESOLVED (100%)** | `tests/db-migration-regression.test.mjs` (Group D)                        |

---

## 2. Chi tiết Sự cố Trọng điểm & Phân tích Nguyên nhân Gốc

### Sự cố 1: BUG-P0-01 — Thiếu cột `payment_option` trên SQLite `nori.db`

- **Hiện tượng**: Khách hàng truy cập "Đơn thuê của tôi" trên điện thoại qua LAN server `http://192.168.1.7:3000` nhận thông báo lỗi "NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau". Backend ghi log: `SQLITE_ERROR: no such column: payment_option`, HTTP 503 tại `/nori-api/notifications` và `/nori-api/bookings`.
- **Nguyên nhân gốc (RCA)**: Trong đợt cập nhật nghiệp vụ thanh toán, 2 trường `paymentOption` và `reservationDepositSnapshot` được thêm vào `src/collections/Bookings.ts`. Nhưng Payload SQLite adapter được cấu hình `push: false`, không tự động DDL alter table khi dev server chạy. Đồng thời dự án chưa tạo migration chính thức trong `src/migrations/`. Khi Payload thực hiện query JOIN/SELECT cột mới, SQLite báo lỗi thiếu cột.
- **Giải pháp xử lý**:
  1. Tạo file migration chính thức `src/migrations/20261120_030000_booking_payment_option_plans.ts` (Batch 4).
  2. Bổ sung hàm `applyAdditiveBookingPaymentOptionSchema()` vào `src/lib/data-sync.ts`.
  3. Cập nhật `data/seed/schema.sql`.
  4. Thực thi an toàn trên `nori.db` kèm backup: `payment_option` (TEXT NOT NULL DEFAULT 'DEPOSIT'), `reservation_deposit_snapshot` (NUMERIC NOT NULL DEFAULT 0), tạo index `bookings_payment_option_idx`.
  5. Backfill dữ liệu cũ nguyên vẹn, không đổi số tiền, không đổi trạng thái thanh toán cũ.
- **Xác minh hồi quy**: Khách hàng `nguyenvanthuong@gmail.com` truy vấn 4 đơn thuê và 8 thông báo thành công 100% với HTTP 200.

---

### Sự cố 2: BUG-P1-02 — Thiếu Startup Preflight Guard

- **Hiện tượng**: Server Next.js vẫn bind cổng 3000 và báo "Server ready" ngay cả khi database thiếu bảng hoặc cột bắt buộc, dẫn tới việc chỉ phát hiện lỗi khi người dùng thật truy cập tính năng.
- **Nguyên nhân gốc (RCA)**: Các script khởi động (`start-dev.mjs`, `start-lan.mjs`, `start-standalone.mjs`) spawn tiến trình Next.js trực tiếp mà không kiểm tra cấu trúc CSDL trước.
- **Giải pháp xử lý**: Xây dựng module `scripts/check-db-schema.mjs` thực hiện kiểm tra 4 bước trước khi khởi động:
  1. `PRAGMA integrity_check === 'ok'`.
  2. `PRAGMA foreign_key_check` có 0 vi phạm.
  3. Bảng `bookings` có đầy đủ các cột bắt buộc (`payment_option`, `reservation_deposit_snapshot`).
  4. Không còn migration nào ở trạng thái pending trong `src/migrations/index.ts`.
     Nếu phát hiện lỗi, script lập tức từ chối khởi động và in hướng dẫn chạy `pnpm db:migrate:safe`.
- **Xác minh hồi quy**: Group C và Group D trong `tests/db-migration-regression.test.mjs` xác nhận hệ thống chặn khởi động đúng 100% khi CSDL thiếu migration hoặc thiếu cột.

---

### Sự cố 3: BUG-P1-03 — `/nori-api/health` Che giấu Lỗi Nghiệp vụ

- **Hiện tượng**: `GET /nori-api/health` trả về 200 OK ngay trong lúc các API `/nori-api/bookings` và `/nori-api/notifications` đang bị 503.
- **Nguyên nhân gốc (RCA)**: Logic kiểm tra sức khỏe chỉ đếm bản ghi của `vehicles`, không thực hiện bất kỳ truy vấn nào trên `bookings`. Test runner `waitForHealth` dựa vào endpoint này để xác nhận server sẵn sàng, khiến bộ test bỏ lọt sự cố.
- **Giải pháp xử lý**: Nâng cấp `src/app/(frontend)/nori-api/health/route.ts` thực hiện truy vấn đồng thời cả `vehicles` và `bookings`. Nếu bất kỳ collection nào lỗi schema, endpoint trả về ngay HTTP 503 `status: 'degraded'`, `readiness: 'NOT_READY'`.
- **Xác minh hồi quy**: Kiểm thử xác nhận khi bảng `bookings` bị lỗi, `/nori-api/health` lập tức trả về 503, cảnh báo sớm trước khi người dùng gặp lỗi.
