# NORI VEHICLE RENTAL — HỆ THỐNG DANH MỤC TỔNG THỂ (SYSTEM INVENTORY)

- **Ngày kiểm toán**: 2026-11-20
- **Phiên bản hệ thống**: `v2.7.1` (P0 Hotfix: Database Schema Compatibility & Preflight Guard)
- **Kiến trúc nền tảng**: Next.js 16.4.6 (App Router / Turbopack), React 19.3.1, Payload CMS 4.0.0-beta.8, SQLite (@payloadcms/db-sqlite / Drizzle ORM)

---

## 1. Danh mục Tuyến đường Công khai (Public Routes)

| Tuyến đường (Route) | Loại trang | Mô tả chức năng                                                                               | Quyền truy cập  |
| :------------------ | :--------: | :-------------------------------------------------------------------------------------------- | :-------------: |
| `/`                 | `○ Static` | Trang chủ: Hero Carousel, Thanh tìm kiếm SearchBar, Top Dòng xe, Banner bài viết              | Guest, Customer |
| `/vehicles`         | `○ Static` | Danh mục xe (Catalogue): Lọc theo loại xe, hãng xe, giá, số chỗ, nhiên liệu, chi nhánh        | Guest, Customer |
| `/vehicles/[slug]`  |  `● SSG`   | Chi tiết xe: Thông số kỹ thuật, bộ sưu tập ảnh, tính giá tự động, lịch trống, đặt lịch tư vấn | Guest, Customer |
| `/posts`            | `○ Static` | Danh sách bài viết tin tức, cẩm nang, sự kiện ưu đãi                                          | Guest, Customer |
| `/posts/[slug]`     |  `● SSG`   | Chi tiết bài viết: Nội dung RichText, banner sự kiện, liên kết voucher khuyến mãi             | Guest, Customer |
| `/about`            | `○ Static` | Trang giới thiệu doanh nghiệp, giá trị cốt lõi, mạng lưới chi nhánh                           | Guest, Customer |
| `/support`          | `○ Static` | Hỗ trợ khách hàng, giải đáp thắc mắc (FAQ), chính sách thuê xe, bảo hiểm                      | Guest, Customer |
| `/login`            | `○ Static` | Đăng nhập tài khoản khách hàng hoặc chuyển tiếp quản trị viên                                 |      Guest      |
| `/register`         | `○ Static` | Đăng ký tài khoản khách hàng mới (Customer)                                                   |      Guest      |
| `/favorites`        | `○ Static` | Danh sách xe yêu thích (Lưu trữ bền vững qua LocalStorage)                                    | Guest, Customer |
| `/offline`          | `○ Static` | Trang thông báo dự phòng khi mất kết nối mạng (PWA Fallback)                                  | Guest, Customer |
| `/design-system`    | `○ Static` | Hệ thống tài nguyên giao diện, design tokens và accessibility primitives                      | Internal / Dev  |

---

## 2. Danh mục Tuyến đường Khách hàng (Customer Protected Routes)

| Tuyến đường (Route) | Loại trang | Mô tả chức năng                                                                                               |  Bảo vệ phân quyền  |
| :------------------ | :--------: | :------------------------------------------------------------------------------------------------------------ | :-----------------: |
| `/account`          | `○ Static` | Quản lý hồ sơ cá nhân, lịch sử đơn thuê, lịch sử yêu cầu tư vấn mua xe                                        | Customer JWT Cookie |
| `/checkout`         | `○ Static` | Tiến trình tạo đơn thuê xe: Chọn gói thanh toán (Cọc 30% / Trọn gói 100%), áp dụng voucher, địa chỉ giao nhận | Customer JWT Cookie |
| `/my-bookings`      | `○ Static` | Quản lý đơn thuê của tôi: Theo dõi trạng thái, chỉnh sửa đơn PENDING, hủy đơn, thanh toán, đánh giá           | Customer JWT Cookie |

---

## 3. Danh mục Trung tâm Quản trị Admin (21 Phân hệ `/dashboard/*`)

| Phân hệ (Admin Route)         | Nhóm chức năng             | Mô tả nghiệp vụ                                                                |    Phạm vi phân quyền    |
| :---------------------------- | :------------------------- | :----------------------------------------------------------------------------- | :----------------------: |
| `/dashboard`                  | Tổng quan hệ thống         | Chỉ số KPI, xe trống, xe đang thuê, doanh thu thực tế, biểu đồ                 | Tất cả 8 chức danh Admin |
| `/dashboard/bookings`         | Vận hành đơn thuê          | Duyệt, từ chối, đặt cọc, bàn giao xe, kiểm tra trả xe, quyết toán đơn thuê     |  All / Assigned Branch   |
| `/dashboard/vehicles`         | Quản lý đội xe             | Danh sách cá thể xe, biển số, ODO, tình trạng hoạt động, kho/chi nhánh quản lý |  All / Assigned Branch   |
| `/dashboard/models`           | Danh mục dòng xe           | Cấu hình dòng xe catalogue, thông số kỹ thuật, giá thuê, ảnh đại diện, album   |    Quản trị viên CMS     |
| `/dashboard/inquiries`        | Tư vấn mua xe              | Tiếp nhận yêu cầu tư vấn mua xe, đặt lịch lái thử, phân công tư vấn            |   Sales / Branch Staff   |
| `/dashboard/customers`        | Khách hàng                 | Danh sách khách hàng, lịch sử thuê, khóa/mở tài khoản khách hàng               |   Super / System Admin   |
| `/dashboard/maintenance`      | Bảo dưỡng xe               | Lập lịch bảo dưỡng, khóa ngày khả dụng, ghi nhận chi phí bảo dưỡng             |    Warehouse / Staff     |
| `/dashboard/payments`         | Tài chính & Thu chi        | Xác nhận tiền cọc, thu tiền thuê, đối soát giao dịch, hoàn tiền/hủy cọc        |    Kế toán / Manager     |
| `/dashboard/promotions`       | Khuyến mãi                 | Tạo voucher, thiết lập hạn mức, chiết khấu %, giới hạn chi nhánh               |    Quản trị Marketing    |
| `/dashboard/content`          | Quản trị nội dung          | Cấu hình Hero Carousel (Desktop/Mobile), banner, hotline, địa chỉ showroom     |    Quản trị viên CMS     |
| `/dashboard/posts`            | Bài viết & Tin tức         | Soạn thảo, xuất bản bài viết cẩm nang, gắn banner khuyến mãi                   |    Quản trị viên CMS     |
| `/dashboard/reports`          | Báo cáo doanh thu          | Thống kê doanh thu thuê xe, đối chiếu dòng tiền cọc và tiền thuê               |  Kế toán / Super Admin   |
| `/dashboard/admins`           | Quản trị viên & Phân quyền | Cấp tài khoản nhân sự, phân vai trò, gán chi nhánh, thu hồi quyền              |   Super Admin duy nhất   |
| `/dashboard/system`           | Đồng bộ & Sao lưu          | Trạng thái đồng bộ, xuất snapshot Git, sao lưu/khôi phục CSDL                  |   Super / System Admin   |
| `/dashboard/branches`         | Chi nhánh (Module 3.7)     | Tạo và quản lý chi nhánh, giờ hoạt động, biểu phí giao nhận                    |   Super / System Admin   |
| `/dashboard/warehouses`       | Kho xe & Bãi đỗ            | Showroom, bãi tập kết, trung tâm bảo dưỡng, phân bổ xe UNALLOCATED             |     Manager / Staff      |
| `/dashboard/locations`        | Điểm nhận/trả xe           | Điểm đón trả xác minh (sân bay, ga tàu, khách sạn), phụ phí địa điểm           |     Manager / Staff      |
| `/dashboard/staff`            | Nhân sự chi nhánh          | Quản lý nhân viên theo chi nhánh, vai trò chức danh, khóa nhân sự              |     Manager / Admin      |
| `/dashboard/transfers`        | Điều chuyển xe             | Quy trình 9 trạng thái điều chuyển xe liên chi nhánh kèm khóa lịch nguyên tử   |    Operator / Manager    |
| `/dashboard/deliveries`       | Giao nhận tận nơi          | Phân vùng giao xe (`DeliveryZones`), giao việc nhân viên (`DeliveryJobs`)      |     Delivery / Staff     |
| `/dashboard/location-pricing` | Định giá địa điểm          | Định giá 5 tầng, quy tắc một chiều (`OneWayRentalRules`), tỷ lệ chia doanh thu |  Manager / Super Admin   |
| `/dashboard/branch-reports`   | Báo cáo chi nhánh          | Báo cáo doanh thu phân tách theo chi nhánh, xuất CSV UTF-8 BOM                 |   Manager / Accountant   |

---

## 4. Danh mục API Endpoints (`/nori-api/*`)

### 4.1. Khách hàng & Công khai

- `GET /nori-api/health`: Kiểm tra sức khỏe, kết nối DB, readiness probe (truy vấn vehicles & bookings).
- `GET /nori-api/locations`: Danh sách chi nhánh, kho xe và điểm giao nhận công khai.
- `GET /nori-api/fleet`: Danh sách đội xe phục vụ catalogue kèm bộ lọc và phân trang.
- `GET /nori-api/availability`: Kiểm tra lịch xe trống theo thời gian thực (loại trừ ngày bảo dưỡng và đơn đã duyệt).
- `GET /nori-api/bookings`: Lấy danh sách đơn thuê của khách hàng đang đăng nhập (`owner = user.id`).
- `POST /nori-api/bookings`: Tạo đơn thuê mới (hỗ trợ `paymentOption: 'DEPOSIT' | 'FULL'`).
- `PATCH /nori-api/bookings`: Chỉnh sửa đơn thuê đang chờ duyệt (`PENDING`), đổi ngày nguyên tử kèm khóa Optimistic Locking.
- `GET /nori-api/notifications`: Lấy danh sách thông báo của khách hàng (popup sau duyệt, tư vấn, giao xe).
- `POST /nori-api/inquiries`: Gửi yêu cầu tư vấn mua xe hoặc đặt lịch lái thử.
- `POST /nori-api/reviews`: Gửi đánh giá cho dòng xe đã hoàn thành đơn thuê.
- `POST /nori-api/auth/[action]`: Xác thực khách hàng (`login`, `register`, `logout`, `me`).
- `POST /nori-api/payments/create`: Khởi tạo yêu cầu thanh toán (VietQR SePay hoặc Mock).
- `POST /nori-api/payments/cancel`: Hủy yêu cầu thanh toán đang treo.
- `GET /nori-api/payments/history`: Lịch sử giao dịch thanh toán của khách hàng.
- `GET /nori-api/payments/status`: Kiểm tra trạng thái thanh toán theo đơn thuê.
- `POST /nori-api/payments/webhook/sepay`: Tiếp nhận Webhook thanh toán SePay với cơ chế chống giả mạo API Key.
- `POST /nori-api/revalidate`: Xóa cache ISR theo tag (`revalidateTag`).

### 4.2. Phân hệ Quản trị Dashboard

- `GET /nori-api/dashboard`: Thống kê KPI tổng quan hệ thống.
- `GET /nori-api/dashboard/admins`: Quản lý danh sách nhân sự quản trị.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/bookings`: Quản lý và xử lý vòng đời đơn thuê.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/vehicles`: CRUD phương tiện và cập nhật trạng thái kho.
- `GET /nori-api/dashboard/customers`: Quản lý danh sách khách hàng.
- `GET / PATCH /nori-api/dashboard/inquiries`: Xử lý yêu cầu tư vấn mua xe.
- `GET / POST / PATCH /nori-api/dashboard/maintenance`: Quản lý lịch bảo dưỡng phương tiện.
- `GET / POST /nori-api/dashboard/payments`: Quản lý giao dịch và phiếu thu.
- `POST /nori-api/dashboard/payments/confirm`: Xác nhận thanh toán thủ công.
- `POST /nori-api/dashboard/payments/refund`: Xử lý hoàn tiền cho khách hàng.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/promotions`: Quản lý mã giảm giá.
- `GET / POST /nori-api/dashboard/content`: Cập nhật cấu hình website và Hero Carousel.
- `GET / POST / PATCH / DELETE /nori-api/dashboard/posts`: Quản lý bài viết và banner.
- `GET /nori-api/dashboard/reports`: Báo cáo tài chính và hiệu suất đội xe.
- `GET /nori-api/dashboard/export`: Xuất dữ liệu CSV an toàn (chống CSV Formula Injection).
- `GET / POST /nori-api/dashboard/branches`: Quản lý chi nhánh.
- `GET / POST /nori-api/dashboard/warehouses`: Quản lý kho xe.
- `GET / POST /nori-api/dashboard/locations`: Quản lý điểm giao nhận.
- `GET / POST /nori-api/dashboard/staff`: Quản lý phân công nhân sự.
- `GET / POST / PATCH /nori-api/dashboard/transfers`: Điều chuyển xe liên chi nhánh.
- `GET / POST / PATCH /nori-api/dashboard/deliveries`: Giao nhận xe tận nơi.
- `GET / POST / PATCH /nori-api/dashboard/location-pricing`: Bảng giá theo địa điểm.
- `GET /nori-api/dashboard/branch-reports`: Báo cáo doanh thu đa chi nhánh.

---

## 5. Danh mục 30 Payload Collections & Globals

1. `Admins`: Tài khoản nhân viên quản trị (8 vai trò chức danh).
2. `AuditLogs`: Nhật ký thao tác hệ thống và audit trail.
3. `Bookings`: Đơn thuê xe, chi phí, lịch thuê, trạng thái, kế hoạch cọc.
4. `Branches`: Chi nhánh hoạt động kinh doanh.
5. `BranchStaff`: Phân công nhân sự theo chi nhánh.
6. `Consultations`: Lịch sử tư vấn khách hàng.
7. `DeliveryJobs`: Nhiệm vụ giao xe tận nơi cho nhân viên.
8. `DeliveryZones`: Khu vực phục vụ và biểu phí giao xe.
9. `Folders`: Phân loại thư mục truyền thông Payload.
10. `LocationPricingRules`: Quy tắc định giá 5 tầng theo địa điểm.
11. `MaintenanceSchedules`: Lịch bảo dưỡng và khóa ngày xe.
12. `Media`: Thư viện hình ảnh và tệp tải lên.
13. `Notifications`: Thông báo hệ thống gửi cho khách hàng.
14. `OneWayRentalRules`: Quy tắc thuê xe một chiều và phí hồi xe.
15. `PaymentEvents`: Nhật ký sự kiện thanh toán và webhook logs.
16. `Payments`: Giao dịch thanh toán tiền thuê và cọc.
17. `Posts`: Bài viết cẩm nang, tin tức và sự kiện.
18. `Promotions`: Mã voucher giảm giá và điều kiện áp dụng.
19. `Refunds`: Giao dịch hoàn tiền cho đơn thuê.
20. `RentalDays`: Khóa nguyên tử ngày thuê xe (atomic locking).
21. `Reviews`: Đánh giá xếp hạng xe của khách hàng.
22. `SalesInquiries`: Yêu cầu tư vấn mua xe và đặt lịch lái thử.
23. `ServiceLocations`: Điểm nhận và trả xe xác minh.
24. `Tags`: Nhãn phân loại bài viết và phương tiện.
25. `Users`: Tài khoản khách hàng ứng dụng (Customer).
26. `VehicleLocationHistory`: Nhật ký vị trí vật lý theo thời gian của xe.
27. `VehicleModels`: Dòng xe và thông số kỹ thuật chuẩn hóa.
28. `Vehicles`: Cá thể xe thực tế (biển số, ODO, kho quản lý).
29. `VehicleTransfers`: Điều chuyển phương tiện 9 trạng thái nguyên tử.
30. `Warehouses`: Kho xe, bãi đỗ và trung tâm sửa chữa.

- **Global**: `NoriSite` (Cấu hình thông tin thương hiệu, hotline, địa chỉ, Hero Carousel, SEO).

---

## 6. Lược đồ Cơ sở dữ liệu SQLite (109 Bảng)

Hệ thống vận hành trên CSDL SQLite (`nori.db`) với chế độ Write-Ahead Logging (WAL):

- **30 bảng nghiệp vụ chính**: Tương ứng 30 collections trên.
- **1 bảng Global**: `nori_site`.
- **32 bảng quan hệ nhiều-nhiều (`*_rels`)**: Chuẩn quan hệ quan hệ của Payload CMS 4.0.
- **32 bảng lịch sử phiên bản (`_versions_*`)**: Lưu trữ lịch sử thay đổi tài liệu CMS.
- **1 bảng migration**: `payload_migrations` (ghi nhận 4 batch di trú).
- **13 bảng mảng lồng nhau (`*_array`)**: `branches_gallery`, `vehicle_models_gallery`, `posts_tags`,...
- **12+ Composite Indexes**: Tối ưu tra cứu chi nhánh, dòng thời gian và khóa đơn thuê.
