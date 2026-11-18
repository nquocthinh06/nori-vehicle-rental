# TÀI LIỆU API HỆ THỐNG NORI (API SPECIFICATION & DOCUMENTATION)

- **Phiên bản**: 2.3 (Bổ sung Chỉnh sửa Đơn thuê Chờ duyệt, Thông báo & Lịch Tư vấn Sau Duyệt, Tải đa ảnh Magic-Byte, Quản trị Hero Slides & Phương tiện Động)
- **Tiêu chuẩn giao tiếp**: RESTful JSON API (`Cache-Control: private, no-store` cho dữ liệu phiên & giao dịch).
- **Tiêu chuẩn phản hồi (Envelope Pattern)**:
  - Thành công: `{ "success": true, "data": <PayloadObject | PayloadArray> }`
  - Thất bại: `{ "success": false, "error": { "code": "<ERROR_CODE>", "message": "<Thông báo tiếng Việt>", "fields": { ... } } }`
- **Bảo mật cơ sở**:
  - Mọi route mutation (`POST`, `PATCH`, `PUT`, `DELETE`) bắt buộc kiểm tra `assertOrigin(request)` chống tấn công CSRF (được kiểm tra tự động qua `scripts/static-lint.mjs`).
  - Mọi trường dữ liệu gửi lên đều đi qua allowlist nghiêm ngặt (`body(request, allowlist, maxBytes)`), từ chối ngay (`HTTP 400`) nếu chèn trường trái phép (`totalPrice`, `dailyPriceSnapshot`, `role`, `status`, ...).
  - Phân quyền RBAC tách biệt bằng HttpOnly Cookie `payload-token` (`admins`) và phiên người dùng ứng dụng (`users`).

---

## 1. Giao diện Lập trình Công khai & Khách hàng (Public & Customer APIs)

### 1.1. Xác thực & Tài khoản (`/nori-api/auth/*`)

- `GET /nori-api/auth/me`: Lấy thông tin phiên đăng nhập hiện tại (User hoặc Admin, ẩn hoàn toàn `salt`/`hash`).
- `POST /nori-api/auth/login`: Đăng nhập với `{ email, password }`.
- `POST /nori-api/auth/register`: Đăng ký tài khoản khách hàng (`users`). Chặn chèn `role` trái phép (`400`).
- `POST /nori-api/auth/logout`: Đăng xuất và xóa sạch cookie phiên.
- `POST /nori-api/auth/password`: Đổi mật khẩu (`{ currentPassword, newPassword, confirmPassword }`, trả `401` nếu sai mật khẩu hiện tại).
- `PATCH /nori-api/auth/me`: Cập nhật hồ sơ cá nhân (`fullName`, `phone`, `driverLicenseNumber`, `idCardNumber`, `address`).

### 1.2. Đội xe & Khả dụng (`/nori-api/fleet`, `/nori-api/availability`)

- `GET /nori-api/fleet?model=<slug_or_id>&modelSlug=<slug>`: Trả danh sách cá thể xe thực tế sắp xếp theo `reference` tăng dần, kèm mảng đa ảnh cá thể (`isPrimary`, `photoType`, `sortOrder`).
- `GET /nori-api/availability?vehicle=<id>&startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>&delivery=<0|1>&addons=<keys>&promoCode=<code>&excludeBookingId=<id>`:
  - Kiểm tra lịch trống đối chiếu `rental_days` và `maintenance_schedules`.
  - Khi truyền `excludeBookingId` (chủ sở hữu đơn hợp lệ), loại trừ các ngày giữ chỗ hiện tại của chính đơn đó nhưng vẫn kiểm tra xung đột với mọi đơn khác.
  - Tính toán báo giá chi tiết từ máy chủ (`basePrice`, `weekendSurchargeTotal`, `holidaySurchargeTotal`, `deliveryFee`, `addonFee`, `discountAmount`, `promoDiscountAmount`, `estimatedTotal`, `depositAmount`).

### 1.3. Đơn thuê xe (`/nori-api/bookings`)

- `GET /nori-api/bookings`: Danh sách đơn thuê của khách hàng đăng nhập (hoặc chi tiết 1 đơn qua `?id=<uuid>`), kèm cờ `canModify`, `modifyLockReason`, `revision` và `modificationHistory`.
- `POST /nori-api/bookings`: Tạo đơn thuê mới nguyên tử kèm khóa ngày `rental_days` (`HTTP 409 CONFLICT` nếu trùng lịch).
- `PUT /nori-api/bookings`: **Chỉnh sửa thông tin đơn thuê đang chờ duyệt (`PENDING`)**:
  - **Allowlist**: `id`, `expectedRevision`, `startDate`, `endDate`, `pickupTime`, `returnTime`, `pickupLocation`, `returnLocation`, `deliveryRequested`, `addonServices`, `customerPhone`, `customerEmail`, `promoCode`, `note`, `reason`.
  - **Điều kiện khóa**: Chỉ cho phép chủ đơn khi `status === 'PENDING'`, chưa phát sinh bản ghi `payments`, và `expectedRevision` khớp `revision` hiện tại. Trả `HTTP 409 CONFLICT` nếu đơn vừa được Admin duyệt đồng thời hoặc đã có giao dịch đặt cọc/thanh toán cần đối soát.
  - **Hoán đổi lịch nguyên tử**: Tính phần giao/bù `computeRentalDayDiff`, khóa ngày mới trước khi giải phóng ngày thừa, tính lại toàn bộ giá trên Backend và ghi `modificationHistory` + `AuditLogs`.
- `PATCH /nori-api/bookings`: Hủy đơn thuê khi đơn ở trạng thái `PENDING` hoặc `DEPOSIT_PENDING` (`403`/`404` nếu cố hủy đơn người khác).

### 1.4. Thông báo Xác nhận Đơn thuê (`/nori-api/notifications`)

- `GET /nori-api/notifications`: Lấy danh sách thông báo của khách hàng hiện tại, `unreadCount`, và `activePopup` (thông báo `BOOKING_CONFIRMED` mới nhất có `popupDismissed = false` và `superseded = false`).
- `PATCH /nori-api/notifications`: Đánh dấu đã đọc (`markRead`, `markAllRead`) và/hoặc đã đóng Popup (`dismissPopup: true`) để đảm bảo Popup xác nhận chỉ tự bật đúng 01 lần cho mỗi sự kiện duyệt đơn.

### 1.5. Yêu cầu Mua xe & Đánh giá (`/nori-api/inquiries`, `/nori-api/reviews`)

- `GET / POST /nori-api/inquiries`: Gửi và tra cứu yêu cầu tư vấn/xem xe/lái thử/mua xe.
- `GET / POST /nori-api/reviews`: Xem và gửi đánh giá thực tế cho chuyến thuê đã `COMPLETED` (tối đa 1 đánh giá / đơn).

---

## 2. Giao diện Lập trình Quản trị Tập trung (`/nori-api/dashboard/*`)

Mọi route dưới `/nori-api/dashboard/*` yêu cầu phiên đăng nhập `admins` hợp lệ; trả `HTTP 403 FORBIDDEN` với khách hàng hoặc người dùng ẩn danh.

### 2.1. Tổng quan, Báo cáo & Xuất dữ liệu

- `GET /nori-api/dashboard`: Thống kê KPI, biểu đồ hoạt động 14 ngày, mức độ hoàn thiện dữ liệu Catalogue.
- `GET /nori-api/dashboard/reports`: Báo cáo vận hành & doanh thu theo khoảng ngày.
- `GET /nori-api/dashboard/export?type=<bookings|inquiries|vehicles|customers|financial>`: Xuất CSV chuẩn UTF-8 BOM.

### 2.2. Quản lý Dòng xe, Cá thể xe & Thư viện Media

- `GET / POST / PATCH / DELETE /nori-api/dashboard/vehicles`:
  - Hỗ trợ đầy đủ tham số `entity: 'model'` (10 nhóm thông tin dòng xe, đa ảnh `gallery[]`, thông số kỹ thuật động, tính năng kèm trạng thái `EQUIPPED`/`NOT_EQUIPPED`/`UNVERIFIED`/`NOT_APPLICABLE`, phiên bản & màu sắc) và cá thể xe thực tế (`photos[]` đa góc chụp, ảnh chính `isPrimary`, giá thuê/bán, ODO, tình trạng).
  - Kiểm tra chéo `subCategory` hợp lệ theo `category` (`CAR` / `MOTORBIKE` / `PICKUP`) và tự động kích hoạt `revalidateCatalogue` đồng bộ sang giao diện khách hàng.
- `GET / POST / DELETE /nori-api/dashboard/media`:
  - `POST`: Hỗ trợ tải 1 hoặc nhiều ảnh (`file` / `files[]`, tối đa 12 tệp/lượt, `<= 8MB`/tệp). Xác thực chữ ký nhị phân (magic bytes JPEG, PNG, WebP, AVIF), quét chuỗi script/thực thi nhúng, kiểm tra kích thước thực qua `sharp` (`>= 64×64px`), chuẩn hóa tên tệp an toàn và trả báo cáo `{ uploaded, failed, partialFailure }`.
  - `DELETE ?id=<uuid>`: Kiểm tra toàn bộ tham chiếu trên `vehicle-models`, `vehicles`, `nori-site`, `posts`; trả `HTTP 409 CONFLICT` nếu ảnh đang được sử dụng.

### 2.3. Quản lý Đơn thuê & Theo dõi Nhân viên Liên hệ Tư vấn

- `GET / PATCH /nori-api/dashboard/bookings`: Quản lý vòng đời 9 trạng thái đơn thuê, hỗ trợ bộ lọc tư vấn (`consultFilter`: `PENDING_CONTACT`, `DUE_TODAY`, `OVERDUE`, `URGENT`, `CONSULTED`), cảnh báo đơn thuê gấp trước khi duyệt và hiển thị lịch sử khách chỉnh sửa đơn.
- `GET / PATCH /nori-api/dashboard/consultations`: Phân công nhân viên phụ trách (`assignedStaffId`/`assignedStaffName`), cập nhật trạng thái liên hệ tư vấn (`PENDING_CONTACT`, `CONTACTED`, `NO_ANSWER`, `CALLBACK_SCHEDULED`, `CONSULTED`, `NEED_EXTRA_DOCS`, `WAITING_DEPOSIT`, `CANCELLED_AFTER_CONTACT`), hẹn gọi lại và lưu nhật ký cuộc gọi (`contactLogs[]`) độc lập hoàn toàn với trạng thái thanh toán/hợp đồng.
- `GET / PATCH /nori-api/dashboard/inquiries`: Quản lý yêu cầu tư vấn mua xe & lịch lái thử.

### 2.4. Nội dung CMS, Khung giờ Hành chính & Các Phân hệ Vận hành Khác

- `GET / PATCH /nori-api/dashboard/content`: Quản trị `NoriSite` gồm danh sách slide Hero Carousel (`heroSlides[]`, `heroAutoplaySeconds`), cấu hình khung giờ hành chính & ngày nghỉ lễ (`businessTimezone`, `workingDays`, `workStartTime`, `workEndTime`, `lunchBreakStart`, `lunchBreakEnd`, `holidays[]`), chính sách, FAQ và lưu nháp/xuất bản.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/maintenance`: Quản lý lịch bảo trì phương tiện.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/promotions`: Quản lý mã khuyến mãi.
- `GET / POST / PATCH /nori-api/dashboard/payments`: Sổ thu chi & đối soát đặt cọc (có Idempotency Guard 30 giây).
- `GET / PATCH /nori-api/dashboard/customers`: Quản lý khách hàng & kiểm duyệt đánh giá.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/posts`: Quản lý tin tức & cẩm nang.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/admins`: Quản lý quản trị viên & tra cứu `audit-logs`.
