# ĐÁNH GIÁ HỆ THỐNG API & CƠ SỞ DỮ LIỆU (API & DATABASE REVIEW — PHASE 2)

## 1. Đánh giá Cơ sở dữ liệu (SQLite + Payload ORM/Drizzle)

### 1.1. Tổng quan Schema, Migration & Toàn vẹn Dữ liệu

- **Engine**: SQLite file `./nori.db`, adapter `@payloadcms/db-sqlite` với `idType: 'uuid'` và `transactionOptions: {}`.
- **Migrations đã triển khai**:
  1. [20261117_080926_upgrade_nori_vehicles_and_workflows.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/migrations/20261117_080926_upgrade_nori_vehicles_and_workflows.ts)
  2. [20261117_211500_sales_inquiries_vehicle_fk.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/migrations/20261117_211500_sales_inquiries_vehicle_fk.ts) — Migration 2 chiều (`up`/`down`, đã kiểm tra round-trip trên bản sao) chuyển đổi an toàn bảng `sales_inquiries` (sử dụng `PRAGMA foreign_keys = OFF` ngoài transaction) sang cột `vehicle_id` có `FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL`.
- **Kiểm tra Toàn vẹn `./nori.db` sau kiểm thử Phase 2**:
  - Số lượng bản ghi sạch: `vehicle_models: 20`, `vehicles: 21 (is_demo = 1)`, `media: 70`, `users: 7`, `admins: 0`, `bookings: 5`, `inquiries: 5 (4 gắn vehicle_id, 1 NULL)`, `reviews: 0`, `rental_days: 6`.
  - `PRAGMA integrity_check`: `ok`
  - `PRAGMA foreign_key_check`: `[]` (`0` vi phạm).

### 1.2. Các Collection, Primary Key, Foreign Key & Index

| Collection       | Mục đích                              | Ràng buộc & Khóa ngoại xác minh                                                                          | Trạng thái Phase 2                                                                                                           |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `Admins`         | Quản trị CMS `/admin` & `/dashboard`  | Email unique (Payload auth)                                                                              | `0` bản ghi mặc định; test E2E tạo & dọn sạch qua `/api/admins/first-register`                                               |
| `Users`          | Tài khoản khách hàng                  | Email unique, lock 10p sau 8 lần sai                                                                     | Tách riêng khỏi `Admins`; có thêm luồng đổi mật khẩu & Admin vô hiệu hóa `ACTIVE`/`DISABLED`                                 |
| `Media`          | Ảnh thực tế, nguồn & bản quyền        | `70/70` file tồn tại vật lý (`>0` bytes); `63` Wikimedia JPG có `sourceUrl`/`license`; `7` PNG cũ `NULL` | `Cache-Control: max-age=3600`                                                                                                |
| `VehicleModels`  | Catalogue 20 dòng xe                  | `slug` unique index, `brand`, `category`, `subCategory`, `visible` index                                 | `17/20` mẫu đủ 100%; `3` mẫu (`ford-ranger-wildtrak`, `hyundai-accent`, `mitsubishi-triton`) cần bổ sung thêm specs/nội thất |
| `Vehicles`       | Kho xe thực tế (`21/21` `isDemo`)     | `reference` unique, `licensePlate` ẩn công chúng, FK `model -> vehicle-models`                           | Hook chặn `SOLD`, chặn `MAINTENANCE`/`INACTIVE` khi `ONGOING` (`LOC-ADM-02 PASS`), tự đồng bộ `RESERVED`/`RENTED`/`READY`    |
| `RentalDays`     | Bảng khóa ngày chống double-booking   | `key` unique, FK `vehicle_id -> vehicles`, lưu `booking_key` ẩn công chúng                               | Chống Race Condition hiệu quả `[201, 409]`                                                                                   |
| `Bookings`       | Đơn thuê xe                           | `bookingKey` unique, FK `customer_id -> users`, `vehicle_id -> vehicles`                                 | Toàn bộ snapshot giá/ngày/status đều `serverField`; hỗ trợ `handoverNote`                                                    |
| `SalesInquiries` | Tư vấn, báo giá, xem xe, lái thử, mua | **`3` FK** (`vehicle_id -> vehicles`, `model_id -> vehicle_models`, `customer_id -> users`), **`6` idx** | **Đã khắc phục `BUG-05`**: `SalesInquiries.vehicle` là `relationship`, ép ma trận `canTransitionInquiry`                     |
| `Reviews`        | Đánh giá sau chuyến đi                | `booking` unique & FK -> `bookings`, FK `customer`, `model` (index), `vehicle`                           | Chặn đơn chưa `COMPLETED` (`403`), chặn trùng, E2E UI `#43 PASS`                                                             |

### 1.3. Transaction & Race Condition

- SQLite `transactionOptions: {}` giữ `req.transactionID` xuyên suốt `Bookings.beforeChange` tạo các dòng `rental-days`.
- Kết quả thực nghiệm `HTTP-RENT-RACE` (`Promise.all` 2 user đặt trùng xe `NR-OT-VIOS01`): `[201, 409]`, giao dịch thua tự rollback toàn bộ không để lại dữ liệu rác.

---

## 2. Đánh giá 9 API Endpoints (`/nori-api/*`)

| Endpoint                     | Method                                                                  | Xác thực                                                    | Validation, Allowlist & Bảo vệ Phase 2                                                                                          | Cache               | Kiểm chứng thực tế                                                 |
| ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| `/nori-api/auth/[action]`    | `GET` (`me`), `POST` (`login/register/logout/password`), `PATCH` (`me`) | `appAuth.currentUser()`                                     | Allowlist nghiêm ngặt; `password` kiểm tra `currentPassword` qua `appAuth.login` (`401` sai, `200` đúng) + CSRF + Rate limit    | `private, no-store` | `HTTP-AUTH-01`, `HTTP-AUTH-PWD-XSS PASS`, E2E `#29, #30, #32, #43` |
| `/nori-api/fleet`            | `GET` (`?model=` hoặc `?id=`)                                           | Public (`overrideAccess: false`)                            | Bắt buộc `model` hoặc `id` (`400` nếu thiếu), tự ẩn `licensePlate`                                                              | Request-time        | `HTTP-SEC-03 PASS`, E2E `#18, #30, #43`                            |
| `/nori-api/availability`     | `GET` (`?vehicle=` + ngày/giao/addons)                                  | Public (`overrideAccess: false`)                            | Chặn `RESERVED`/`INACTIVE`/`SALE`/`SOLD`/`MAINTENANCE` (`409`); `calculateRentalQuote` đủ ngày/tuần/tháng/lễ/cuối tuần/addons   | Request-time        | `HTTP-RENT-PRICE`, E2E `#18, #24, #43`                             |
| `/nori-api/bookings`         | `GET`, `POST`, `PATCH`                                                  | Bắt buộc `users`                                            | Allowlist 11 trường `POST`, `['id']` `PATCH`; cap `5` `PENDING` mỗi user (`429`); phân trang & validate `page` (`400` nếu lẻ)   | `private, no-store` | `HTTP-RENT-RACE [201,409]`, `HTTP-RENT-EDGE`, `HTTP-SEC-04`        |
| `/nori-api/inquiries`        | `GET`, `POST`                                                           | Bắt buộc `users`                                            | Allowlist 10 trường, `relationId` chuẩn hóa `vehicle`, lưu snapshot giá bán & ước tính lăn bánh server                          | `private, no-store` | `HTTP-BUY-01 PASS`, E2E `#30 PASS`                                 |
| `/nori-api/reviews`          | `GET`, `POST`                                                           | `GET` public (+ eligible bookings); `POST` bắt buộc `users` | Rating nguyên `1..5`, `comment >= 5`, allowlist 5 trường, hook chặn chưa `COMPLETED` (`403`)                                    | `private, no-store` | `HTTP-REV-01`, `LOC-REV-01`, E2E `#43 PASS`                        |
| `/nori-api/dashboard`        | `GET`, `PATCH`                                                          | Bắt buộc `admins` (`403` non-admin)                         | Phân trang & lọc trạng thái; trả `fleetStats`, `customersList`, `depositExpired`; `PATCH` hỗ trợ Booking, Inquiry & User status | `private, no-store` | E2E `#43 PASS`, `HTTP-SEC-04 PASS` (`403` customer)                |
| `/nori-api/dashboard/export` | `GET` (`?type=bookings\|inquiries\|vehicles`)                           | Bắt buộc `admins` (`403` non-admin)                         | Xuất CSV UTF-8 BOM `\uFEFF`, ép vô hiệu hóa công thức `= + - @ \t \r` chống CSV Injection                                       | `private, no-store` | **`HTTP-SEC-05` (`403` non-admin), E2E `#43` (`200` CSV) `PASS`**  |
| `/nori-api/revalidate`       | `POST`                                                                  | HMAC SHA-256 + timestamp `<= 120s` + `timingSafeEqual`      | Kiểm tra regex mảng `slugs`, giới hạn body `<= 6000` bytes                                                                      | —                   | E2E `#27 PASS` (`401`)                                             |
