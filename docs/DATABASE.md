# KIẾN TRÚC CƠ SỞ DỮ LIỆU & LƯU TRỮ (DATABASE ARCHITECTURE) — NORI VEHICLE RENTAL

## 1. Tổng quan Hệ quản trị Cơ sở dữ liệu

- **Database Engine**: SQLite 3 (thông qua `@payloadcms/db-sqlite` 4.0.0-beta.8 & Drizzle ORM, kết hợp `node:sqlite` `DatabaseSync` cho các tác vụ đồng bộ, kiểm toán và sao lưu nguyên tử).
- **Vị trí mặc định**: `./nori.db` (cấu hình qua biến môi trường `DATABASE_URI` và `NORI_SQLITE_PATH`).
- **Định danh khóa chính**: UUID v4 (`idType: 'uuid'`), kết hợp các trường định danh nghiệp vụ ổn định (`slug`, `reference`, `code`, `bookingKey`) có đánh chỉ mục `UNIQUE`.
- **Phiên bản Schema hiện tại**: `nori-payload-sqlite-v2.5` (84 bảng, 452 câu lệnh DDL trong `data/seed/schema.sql`).

---

## 2. Kiểm kê Lưu trữ Dữ liệu (Data Storage Inventory)

| STT | Nguồn lưu trữ                                             | Dữ liệu nắm giữ                                                                                                                                                                                                                                                                                                                                      | Vai trò & Vòng đời                                                                                            |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **SQLite Database (`nori.db`)**                           | 18 Payload Collections (`admins`, `users`, `vehicle-models`, `vehicles`, `media`, `posts`, `promotions`, `bookings`, `rental-days`, `payments`, `sales-inquiries`, `consultations`, `maintenance-schedules`, `reviews`, `notifications`, `audit-logs`, `folders`, `tags`) + 1 Global (`nori-site`) + các bảng versions (`_nori_site_v`, `_posts_v`). | **Nguồn dữ liệu nghiệp vụ chính thức (Primary Persistent Store)**. Bền vững qua restart server và build.      |
| 2   | **Runtime Media (`./media/`)**                            | Tệp hình ảnh thực tế đang được phục vụ qua `/api/media/file/<filename>`.                                                                                                                                                                                                                                                                             | Lưu trữ vật lý cho mọi ảnh đã seed và ảnh do Admin upload.                                                    |
| 3   | **Versioned Media (`public/seed-media/`, `media/seed/`)** | 63 ảnh mẫu gốc (`public/seed-media/`) + các ảnh mới do Admin tải lên được xuất qua `data:export` (`media/seed/{vehicles,hero,banners,articles}/`).                                                                                                                                                                                                   | Lưu trữ trên GitHub để đồng bộ hình ảnh giữa các thành viên.                                                  |
| 4   | **JSON Snapshots (`data/snapshots/*.json`)**              | Bản chụp dữ liệu công khai đã làm sạch (`vehicle-models`, `vehicles`, `site-settings`, `hero-slides`, `banners`, `articles`, `promotions`, `media-manifest`, `manifest`).                                                                                                                                                                            | Lưu trữ trên GitHub để khôi phục và đồng bộ dữ liệu mẫu giữa các máy phát triển.                              |
| 5   | **Environment Variables (`.env`)**                        | `DATABASE_URI`, `NORI_SQLITE_PATH`, `PAYLOAD_SECRET`, `NORI_SESSION_SECRET`, `NORI_ADMIN_EMAIL`, `NORI_ADMIN_PASSWORD`.                                                                                                                                                                                                                              | Cấu hình theo từng môi trường, không commit lên Git.                                                          |
| 6   | **Browser Storage (`localStorage`)**                      | Danh sách xe yêu thích (`nori:favorites`) và cờ ẩn thông báo đã đọc trên trình duyệt khách.                                                                                                                                                                                                                                                          | Chỉ lưu tiện ích phía giao diện cá nhân; **không dùng làm nguồn lưu trữ nghiệp vụ**.                          |
| 7   | **Next.js Cache & PWA Cache**                             | Tag cache (`nori-catalogue`, `nori-site`, `nori-posts`, `nori-model-[slug]`) và Service Worker (`nori-pwa-v1` chỉ cache static assets `/_next/static/`, `/icons/`, `/offline`).                                                                                                                                                                      | Tăng tốc độ phản hồi; tự động vô hiệu hóa (`revalidateTag`/`revalidatePath`) ngay khi Admin cập nhật dữ liệu. |

---

## 3. Phân nhóm Bảng Dữ liệu trong SQLite

### 3.1. Nhóm Phương tiện & Catalogue

- `vehicle_models`: Dòng xe, thương hiệu, danh mục (`CAR`, `MOTORBIKE`, `PICKUP`), kiểu dáng (`sub_category`), thông số tổng quan, giá tham khảo, ảnh đại diện (`cover_id`).
- `vehicle_models_specifications`, `vehicle_models_features`, `vehicle_models_highlights`, `vehicle_models_gallery`, `vehicle_models_variants`, `vehicle_models_variants_colors`: Các bảng con 1-N lưu thông số kỹ thuật, tiện nghi/an toàn, bộ ảnh và phiên bản/màu sắc.
- `vehicles` & `vehicles_photos`: Cá thể xe thực tế (`reference`, `license_plate`), giá thuê/ngày, giá bán, tiền cọc, ODO, tình trạng thực tế, lịch sử bảo dưỡng, trạng thái vận hành (`READY`, `RENTED`, `RESERVED`, `MAINTENANCE`, `SOLD`, `INACTIVE`).
- `maintenance_schedules`: Lịch trình bảo dưỡng định kỳ và đột xuất.

### 3.2. Nhóm Nội dung Website & Truyền thông

- `nori_site` & `_nori_site_v`: Cấu hình thương hiệu, Logo, Favicon, SEO, liên hệ, giờ hành chính, chính sách thuê/mua, điều khoản sử dụng.
- `nori_site_hero_slides` & `_nori_site_v_version_hero_slides`: Cấu hình Hero Slider (tiêu đề, CTA, ảnh Desktop/Mobile, tâm cắt ảnh `focal_x`/`focal_y`, dòng xe liên kết).
- `nori_site_hero_images`, `nori_site_header_menu`, `nori_site_footer_links`, `nori_site_social_links`, `nori_site_holidays`, `nori_site_faqs`.
- `posts` & `_posts_v`: Bài viết tin tức, cẩm nang, sự kiện và liên kết khuyến mãi.
- `media`: Quản lý metadata tệp hình ảnh, kích thước, MIME type, phân loại nguồn ảnh và kiểm tra khóa ngoại chống xóa ảnh đang dùng.

### 3.3. Nhóm Nghiệp vụ, Tài khoản & Kiểm toán

- `admins` & `admins_sessions`: Tài khoản quản trị viên (`SUPER_ADMIN`, `OPERATOR`), phân quyền RBAC chi tiết theo module (`permissions` JSON).
- `users` & `users_sessions`: Tài khoản khách hàng, trạng thái xác minh GPLX/CCCD.
- `bookings`, `bookings_status_history`, `bookings_modification_history`, `rental_days`: Đơn đặt thuê xe, lịch sử chuyển trạng thái, lịch sử chỉnh sửa đơn chờ duyệt và bảng khóa ngày chống đặt trùng (`UNIQUE(vehicle_id, date)`).
- `promotions`: Mã khuyến mãi, điều kiện áp dụng, giới hạn lượt dùng (`usage_limit`) và bộ đếm nguyên tử (`used_count`).
- `payments`: Giao dịch thu cọc, thu tiền thuê, hoàn tiền.
- `sales_inquiries` & `consultations`: Yêu cầu tư vấn mua xe, đặt lịch xem xe và yêu cầu hỗ trợ.
- `reviews` & `notifications`: Đánh giá sau chuyến thuê và thông báo hệ thống.
- `audit_logs`: Nhật ký kiểm toán chỉ nối thêm (append-only), lưu vết mọi thao tác thêm/sửa/xóa/đồng bộ/sao lưu kèm giá trị trước và sau đã làm sạch.
