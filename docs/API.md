# TÀI LIỆU API HỆ THỐNG NORI (API SPECIFICATION & DOCUMENTATION)

- **Phiên bản**: 2.0 (Hỗ trợ Centralized Admin, Responsive & PWA, Idempotency Guard, Concurrency Control)
- **Tiêu chuẩn giao tiếp**: RESTful JSON API.
- **Tiêu chuẩn phản hồi (Envelope Pattern)**:
  - Thành công: `{ "success": true, "data": <PayloadObject | PayloadArray> }`
  - Thất bại: `{ "success": false, "error": { "code": "<ERROR_CODE>", "message": "<Thông báo tiếng Việt>", "fields": { ... } } }`
- **Bảo mật cơ sở**:
  - Mọi route mutation (`POST`, `PATCH`, `PUT`, `DELETE`) bắt buộc kiểm tra `assertOrigin(request)` chống tấn công CSRF.
  - Phân quyền RBAC bằng HttpOnly Cookie `payload-token` (Admins) và `app-session` (Users).

---

## 1. Giao diện Lập trình Công khai & Khách hàng (Public & Customer APIs)

### 1.1. Xác thực & Tài khoản (`/nori-api/auth/*`)

- `GET /nori-api/auth/me`: Lấy thông tin phiên đăng nhập hiện tại (trả về thông tin User hoặc Admin, không bao gồm salt/hash).
- `POST /nori-api/auth/login`: Đăng nhập với `{ email, password }`. Cấp cookie phiên HttpOnly.
- `POST /nori-api/auth/register`: Đăng ký tài khoản khách hàng (`users`). Chặn chèn trường `role` trái phép (trả `400`). Yêu cầu `confirmPassword`.
- `POST /nori-api/auth/logout`: Đăng xuất và xóa sạch cookie phiên.
- `POST /nori-api/auth/password`: Đổi mật khẩu. Yêu cầu `{ currentPassword, newPassword, confirmPassword }`. Trả `401` nếu sai mật khẩu hiện tại.
- `PATCH /nori-api/auth/me`: Cập nhật thông tin cá nhân (`fullName`, `phone`, `driverLicense`).

### 1.2. Đội xe & Khả dụng (`/nori-api/fleet`, `/nori-api/availability`)

- `GET /nori-api/fleet?model=<slug_or_id>`: Lấy danh sách xe thực tế của dòng xe. Hỗ trợ tra cứu theo cả UUID hoặc `modelSlug`.
- `GET /nori-api/availability?vehicle=<id>&startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&promoCode=<code>`: Kiểm tra xe có bị khóa lịch bởi `rental_days` hoặc `maintenance_schedules` hay không, và tính toán báo giá chi tiết từ Backend.

### 1.3. Đơn thuê xe (`/nori-api/bookings`)

- `GET /nori-api/bookings`: Danh sách đơn thuê của khách hàng đăng nhập.
- `POST /nori-api/bookings`: Tạo đơn thuê mới. Thực thi trong transaction, khóa ngày `rental_days`. Trả về `HTTP 409 CONFLICT` nếu xảy ra va chạm lịch thuê (Race Condition).
- `PATCH /nori-api/bookings`: Hủy đơn thuê khi đơn ở trạng thái `PENDING` hoặc `DEPOSIT_PENDING`. Trả về `404` nếu cố tình hủy đơn của người khác (Chống IDOR).

### 1.4. Yêu cầu mua xe & Đánh giá (`/nori-api/inquiries`, `/nori-api/reviews`)

- `GET / POST /nori-api/inquiries`: Gửi và xem yêu cầu tư vấn/lái thử/mua xe.
- `GET / POST /nori-api/reviews`: Xem và gửi đánh giá cho dòng xe. Backend chỉ cho phép gửi đánh giá đối với đơn thuê đã `COMPLETED` và mỗi đơn chỉ được đánh giá 1 lần.

---

## 2. Giao diện Lập trình Quản trị Tập trung (`/nori-api/dashboard/*`)

Tất cả API quản trị yêu cầu cookie `payload-token` hợp lệ thuộc collection `admins`. Mọi người dùng thuộc `users` hoặc người chưa đăng nhập đều bị từ chối truy cập với mã `HTTP 403 FORBIDDEN`.

### 2.1. Phân hệ Tổng quan & Thống kê

- `GET /nori-api/dashboard`: Thống kê tổng quan KPI, biểu đồ doanh thu 14 ngày, số lượng xe sẵn sàng, đơn thuê mới, yêu cầu mua xe.
- `GET /nori-api/dashboard/reports`: Báo cáo chi tiết theo khoảng thời gian (`startDate`, `endDate`).
- `GET /nori-api/dashboard/export?type=<bookings|inquiries|vehicles|customers|financial>`: Xuất file CSV định dạng UTF-8 kèm BOM.

### 2.2. Phân hệ Quản lý Đội xe & Đa phương tiện

- `GET / POST / PATCH / DELETE /nori-api/dashboard/vehicles`: CRUD danh mục dòng xe (`vehicle-models`) và từng chiếc xe thực tế (`vehicles`). Bảo vệ chống xóa xe đang có hợp đồng hoạt động.
- `GET / POST /nori-api/dashboard/media`: Tải lên hình ảnh xe thật hoặc hình ảnh CMS (`multipart/form-data`, giới hạn tối đa 8MB).

### 2.3. Phân hệ Quản lý Đơn thuê & Yêu cầu Mua xe

- `GET / PATCH /nori-api/dashboard/bookings`: Quản lý 9 trạng thái đơn thuê, ghi chú số hợp đồng (`contractNumber`), phụ phí phát sinh (`extraFee`), chỉ số ODO khi nhận/trả xe (`returnOdometer`), tình trạng xe (`returnCondition`).
- `GET / PATCH /nori-api/dashboard/inquiries`: Tiếp nhận, phân công nhân viên tư vấn, đặt lịch lái thử và chuyển trạng thái đơn mua xe.

### 2.4. Phân hệ Bảo trì & Khuyến mãi

- `GET / POST / PATCH / DELETE /nori-api/dashboard/maintenance`: Quản lý lịch bảo trì, sửa chữa xe định kỳ. Tự động khóa ngày trên lịch xe để ngăn khách đặt trùng.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/promotions`: Quản lý mã giảm giá (`PERCENT` hoặc `FIXED`), ngày hiệu lực và số lượt sử dụng tối đa.

### 2.5. Phân hệ Sổ quỹ & Giao dịch Thanh toán

- `GET / POST / PATCH /nori-api/dashboard/payments`: Quản lý sổ thu chi, xác nhận cọc, thanh toán và hoàn tiền.
  - **Idempotency Guard**: Tự động phát hiện và chặn request thanh toán trùng lặp có cùng `bookingId`, `paymentType`, `amount` trong vòng 30 giây, trả về `HTTP 409 DUPLICATE_PAYMENT`.

### 2.6. Phân hệ Khách hàng, Nội dung CMS & Quản trị viên

- `GET / PATCH /nori-api/dashboard/customers`: Quản lý danh sách khách hàng, khóa/mở tài khoản, xác minh GPLX/CCCD, kiểm duyệt ẩn/hiện đánh giá.
- `GET / PATCH /nori-api/dashboard/content`: Chỉnh sửa cấu hình toàn trang `NoriSite` (Hero banner, thông tin liên hệ, chính sách, FAQ). Hỗ trợ Lưu nháp (Draft), Xuất bản (Publish) và Khôi phục phiên bản (Version Restore).
- `GET / POST / PATCH / DELETE /nori-api/dashboard/posts`: Quản lý bài viết tin tức, bài cẩm nang du lịch (Draft/Publish).
- `GET / POST / PATCH / DELETE /nori-api/dashboard/admins`: Quản lý tài khoản quản trị viên và phân quyền RBAC (Chỉ `SUPER_ADMIN`). Xem nhật ký thao tác `audit-logs`.

---

## 3. Bảng Mã Lỗi Chuẩn Hóa (Error Codes)

| Mã lỗi (Code)           | HTTP Status | Mô tả nghiệp vụ                                                   |
| :---------------------- | :---------- | :---------------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400         | Thiếu trường bắt buộc hoặc dữ liệu không hợp lệ                   |
| `CSRF_DETECTED`         | 403         | Header Origin hoặc Referer không trùng khớp với máy chủ           |
| `UNAUTHORIZED`          | 401         | Chưa đăng nhập hoặc phiên làm việc đã hết hạn                     |
| `FORBIDDEN`             | 403         | Không có quyền truy cập tài nguyên (Ví dụ: khách vào trang Admin) |
| `NOT_FOUND`             | 404         | Không tìm thấy bản ghi hoặc không có quyền sở hữu (chống IDOR)    |
| `SLOT_UNAVAILABLE`      | 409         | Xe đã có người đặt hoặc đang trong lịch bảo trì (Race Condition)  |
| `DUPLICATE_PAYMENT`     | 409         | Yêu cầu thanh toán trùng lặp được gửi trong khoảng thời gian 30s  |
| `INTERNAL_SERVER_ERROR` | 500         | Lỗi máy chủ ngoài dự kiến                                         |
