# TÀI LIỆU CƠ SỞ DỮ LIỆU NORI (DATABASE DOCUMENTATION)

- **Hệ quản trị CSDL**: SQLite (`file:./nori.db`) qua `@payloadcms/db-sqlite` (Drizzle ORM, `idType: 'uuid'`).
- **Tính toàn vẹn hiện tại**: `PRAGMA integrity_check = 'ok'`, `PRAGMA foreign_key_check = []`.

## Danh mục Bảng & Thực thể Chính

| Bảng (`nori.db`)             | Collection / Global    | Mục đích & Ghi chú                                                                                                   |
| :--------------------------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `admins`                     | `Admins`               | Tài khoản quản trị (`admin_role`: `SUPER_ADMIN` / `OPERATOR`, `permissions` JSON RBAC).                              |
| `users`                      | `Users`                | Tài khoản khách hàng (`role: CUSTOMER`, `status`, `driver_license_number`, `id_card_number`, `verification_status`). |
| `vehicle_models`             | `VehicleModels`        | Catalogue dòng xe (`slug` unique, thông số, phiên bản, bộ ảnh).                                                      |
| `vehicles`                   | `Vehicles`             | Xe thực tế (`reference` unique, `license_plate` nội bộ, `operation_status`, `odometer`, `is_demo`).                  |
| `maintenance_schedules`      | `MaintenanceSchedules` | Lịch bảo trì/sửa chữa theo khoảng ngày (`start_date`, `end_date`, `status`).                                         |
| `rental_days`                | `RentalDays`           | Khóa ngày thuê `key = vehicleId:YYYY-MM-DD` unique chống đặt trùng đồng thời.                                        |
| `bookings`                   | `Bookings`             | Đơn thuê xe kèm price snapshot, `promo_code`, `contract_number`, `extra_fee`, `return_odometer`, `status_history`.   |
| `sales_inquiries`            | `SalesInquiries`       | Yêu cầu mua xe (`vehicle_id` FK, `admin_note`, `status_history`).                                                    |
| `promotions`                 | `Promotions`           | Mã giảm giá (`code` unique, `discount_type`, `discount_value`, `used_count`, `active`).                              |
| `payments`                   | `Payments`             | Phiếu thu/chi & hoàn tiền (`reference` unique, `payment_type`, `method`, `amount`, `status`).                        |
| `reviews`                    | `Reviews`              | Đánh giá sau hoàn thành chuyến thuê (`booking_id` unique).                                                           |
| `posts` + `_posts_v`         | `Posts`                | Bài viết CMS hỗ trợ Bản nháp / Xuất bản & lịch sử phiên bản.                                                         |
| `nori_site` + `_nori_site_v` | `NoriSite`             | Global CMS nội dung website, chính sách, FAQ, cấu hình hệ thống + lịch sử phiên bản.                                 |
| `audit_logs`                 | `AuditLogs`            | Nhật ký thao tác append-only (không cho phép sửa/xóa qua API).                                                       |
| `media`                      | `Media`                | Thư viện ảnh dùng chung (`CACHE-CONTROL: max-age=3600`).                                                             |
