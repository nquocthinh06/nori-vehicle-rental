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

---

## 4. API Đa Chi Nhánh & Đa Địa Điểm (Module 3.7 — `v2.7.0`)

### 4.1. Public & Customer Multi-Branch APIs

- `GET /nori-api/locations`: Trả về danh sách chi nhánh đang hoạt động (`ACTIVE`), điểm nhận/trả xe đã xác minh (`service-locations`), khu vực giao nhận tận nơi (`delivery-zones`) và các tuyến thuê một chiều hợp lệ (`one-way-rental-rules`).
- `GET /nori-api/availability?mode=catalogue&pickupBranchId=...&returnBranchId=...&startDate=...&endDate=...`: Lọc danh mục dòng xe khả dụng theo thời gian thực dựa trên vị trí vật lý hiện tại, lịch thuê, lịch điều chuyển và bảo dưỡng (`evaluateVehicleLocationTimeline`).
- `GET /nori-api/availability?vehicle=<id>&startDate=...&endDate=...&pickupBranchId=...&returnBranchId=...&pickupServiceLocationId=...&pickupMethod=...&deliveryZoneId=...&promoCode=...`: Trả về khả dụng theo tuyến + báo giá chi tiết 5 tầng giá (`dailyPrice`, `locationSurcharge`, `oneWayFee`, `deliveryFee`, `pickupFee`, `afterHoursFee`, `promoDiscountAmount`, `estimatedTotal`).
- `POST /nori-api/bookings`: Hỗ trợ đầy đủ `pickupBranch`, `returnBranch`, `pickupServiceLocation`, `returnServiceLocation`, `pickupMethod`, `returnMethod`, `deliveryZone`, `deliveryAddress`, `pickupAddress`, `deliveryDirections`, `idempotencyKey` (chống double-submit) và khóa ngày nguyên tử `rental_days` chống race condition (`409`).

### 4.2. Admin Multi-Branch APIs (`/nori-api/dashboard/*`)

Tất cả endpoint dưới đây áp dụng đồng thời `assertOrigin(request)` (trên mutation), RBAC theo phân hệ `[module, action]` và kiểm soát phạm vi chi nhánh `assertBranchScopeOrFail` (trả `403` cho mọi nỗ lực IDOR ngoài chi nhánh):

- `GET / POST / PATCH / DELETE /nori-api/dashboard/branches`: Quản lý chi nhánh, kiểm tra đơn tương lai trước khi tạm ngừng, chặn xóa cứng nếu có xe/nhân viên/đơn/điều chuyển (`409`).
- `GET / POST / PATCH / DELETE /nori-api/dashboard/warehouses`: Quản lý kho xe, sức chứa thực tế và phân bổ hàng loạt xe chưa gắn chi nhánh (`action: "bulk_allocate"`).
- `GET / POST / PATCH / DELETE /nori-api/dashboard/locations`: Quản lý điểm nhận/trả xe đã xác minh, loại phương tiện hỗ trợ và phụ phí điểm.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/staff`: Tạo tài khoản nhân viên theo chức danh (`STAFF_TITLES`), gán 1..N chi nhánh, thu hồi quyền tức thì (`accountStatus: "REVOKED"`), chặn leo thang quyền (`403 PRIVILEGE_ESCALATION_BLOCKED`).
- `GET / POST / PATCH /nori-api/dashboard/transfers`: Điều chuyển xe liên chi nhánh nguyên tử 9 trạng thái (`DRAFT → PENDING_APPROVAL → APPROVED → IN_TRANSIT → ARRIVED → COMPLETED` + `EXCEPTION`), hỗ trợ Optimistic Locking (`expectedRevision`), chặn hủy sau khi xuất kho (`409`) và chặn xác nhận hoàn tất trùng (`409`).
- `GET / POST / PATCH / DELETE /nori-api/dashboard/deliveries`: Quản lý khu vực giao nhận (`entity: "zone"`) và nhiệm vụ giao/thu hồi xe (`entity: "job"`), kiểm tra xung đột khung giờ nhân viên (`409 DELIVERY_STAFF_TIME_CONFLICT`) và xử lý giao thất bại không đẩy sai trạng thái đơn thuê.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/location-pricing`: Quản lý bảng giá 5 tầng (`entity: "pricing"`) và quy tắc tuyến thuê một chiều + tỷ lệ chia doanh thu (`entity: "one-way"`).
- `GET /nori-api/dashboard/branch-reports`: Báo cáo hiệu quả kinh doanh và tồn kho từng chi nhánh không cộng trùng doanh thu (`sum(branch) + unassigned === systemTotal`).
- `GET /nori-api/dashboard/export?type=branch-reports[&branchId=...]`: Xuất CSV báo cáo chi nhánh UTF-8 BOM, lọc nghiêm ngặt theo phạm vi chi nhánh được phân công.

### 4.3. Bảng Mã Lỗi Bổ sung (`v2.7.0`)

| Mã lỗi (Code)                  | HTTP Status | Mô tả nghiệp vụ                                                              |
| :----------------------------- | :---------- | :--------------------------------------------------------------------------- |
| `BRANCH_SCOPE_FORBIDDEN`       | 403         | Truy cập/thao tác/xuất dữ liệu chi nhánh ngoài phạm vi được phân công (IDOR) |
| `PRIVILEGE_ESCALATION_BLOCKED` | 403         | Chặn tự nâng quyền hoặc tạo/sửa `SUPER_ADMIN` / `ALL` scope trái phép        |
| `ACCOUNT_REVOKED`              | 403         | Tài khoản nhân viên đã bị thu hồi quyền hoặc tạm khóa                        |
| `ONE_WAY_NOT_ALLOWED`          | 409         | Tuyến trả xe khác chi nhánh chưa được cấu hình cho phép                      |
| `VEHICLE_BRANCH_MISMATCH`      | 409         | Xe không có mặt tại chi nhánh nhận xe vào thời điểm yêu cầu                  |
| `TRANSFER_CONFLICT`            | 409         | Trùng lịch đơn thuê / bảo dưỡng / điều chuyển hoặc sai chuyển trạng thái     |
| `DELIVERY_STAFF_TIME_CONFLICT` | 409         | Nhân viên giao nhận đã có nhiệm vụ trùng khung giờ trong ngày                |
