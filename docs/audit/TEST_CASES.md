# DANH SÁCH TEST CASE CHUẨN HÓA (TEST CASES — v2.3 UPGRADE & REGRESSION)

> Bao gồm đầy đủ danh mục Test Case hồi quy cốt lõi và **98 mã kiểm thử nâng cấp bắt buộc** (`BK-01..24`, `NT-01..18`, `HR-01..20`, `MD-01..18`, `VH-01..20`) đối chiếu trực tiếp tới bài test thực thi trong `tests/rental-rules.test.mjs`, `tests/e2e/upgrade-workflows.spec.ts`, `tests/e2e/nori.spec.ts`, `tests/e2e/data-sync.spec.ts` và `tests/e2e/mobile-pwa.spec.ts`.

---

### `TC-AUTH-01` — Đăng ký chặn chèn `role` trái phép từ Client

- **Module**: Đăng ký & Phân quyền
- **Tên chức năng**: Đăng ký tài khoản ứng dụng (`POST /nori-api/auth/register`)
- **Mục tiêu kiểm thử**: Đảm bảo kẻ tấn công không thể tự gán `role: "ADMIN"` khi gọi API đăng ký.
- **Điều kiện trước khi kiểm thử**: Server `http://localhost:3000` hoạt động.
- **Dữ liệu đầu vào**: `{ fullName: "Kiểm thử", email: "invalid@example.test", password: "NotSaved123", confirmPassword: "NotSaved123", role: "ADMIN" }`
- **Các bước thực hiện**: Gửi request `POST /nori-api/auth/register` với JSON trên.
- **Kết quả mong đợi**: Server trả về `HTTP 400`, từ chối trường không nằm trong allowlist.
- **Kết quả thực tế**: Trả về `HTTP 400`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: Playwright E2E test `#29` (`52ms`).
- **Source code**: [auth/[action]/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/auth/[action]/route.ts>), [api-utils.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/api-utils.ts)

---

### `TC-AUTH-02` — Lỗi mạng khi Đăng nhập giữ nguyên input & Đổi mật khẩu khách hàng trên `/account`

- **Module**: Đăng nhập & Tài khoản (`/login`, `/account`)
- **Tên chức năng**: Giữ input khi lỗi mạng + Đổi mật khẩu (`POST /nori-api/auth/password`)
- **Mục tiêu kiểm thử**: Khi mạng lỗi giữ nguyên input và báo lỗi tiếng Việt; khi đổi mật khẩu phải xác thực mật khẩu hiện tại (`401` nếu sai, `200` nếu đúng).
- **Điều kiện trước khi kiểm thử**: Đã đăng nhập tài khoản khách QA.
- **Dữ liệu đầu vào**: Giả lập abort `/nori-api/auth/login`; đổi mật khẩu với mật khẩu cũ sai/đúng qua HTTP & UI `#pwd-current`, `#pwd-new`, `#pwd-confirm`.
- **Các bước thực hiện**: Test `#32` kiểm tra giữ input; `HTTP-AUTH-PWD-XSS` gửi sai & đúng mật khẩu cũ; E2E `#43` điền form đổi mật khẩu trên `/account`.
- **Kết quả mong đợi**: Lỗi mạng hiện `role="alert"`; sai mật khẩu hiện tại trả `401`; hợp lệ trả `200` và hiện `"Đã đổi mật khẩu thành công."`.
- **Kết quả thực tế**: `wrong=401, ok=200`, UI hiển thị `"Đã đổi mật khẩu thành công."`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E `#32` (`2.9s`), `#43` (`30.0s`) & `audit-http.mjs` `HTTP-AUTH-PWD-XSS`.
- **Source code**: [auth-form.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/auth-form.tsx), [account-panel.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/account-panel.tsx), [auth/[action]/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/auth/[action]/route.ts>)

---

### `TC-CAT-01` — Tìm kiếm không dấu tiếng Việt đa từ khóa & Reset bộ lọc

- **Module**: Danh mục & Tìm kiếm (`/vehicles`)
- **Tên chức năng**: Tìm kiếm Catalogue 20 dòng xe
- **Mục tiêu kiểm thử**: Tìm `"Honda"` (`6` mẫu), tìm `"xe dien"` (`2` mẫu `VinFast VF 8` & `VinFast Evo200`), rỗng hiện EmptyState, `Xóa bộ lọc` khôi phục `20 dòng xe`.
- **Điều kiện trước khi kiểm thử**: DB có `20` dòng xe thuộc 3 danh mục.
- **Dữ liệu đầu vào**: `"Honda"`, `"xe dien"`, `"no-vehicle-with-this-name"`.
- **Các bước thực hiện**: Mở `/vehicles` → nhập các truy vấn → bấm `Xóa bộ lọc`.
- **Kết quả mong đợi**: Số card khớp 100%.
- **Kết quả thực tế**: Đạt chính xác.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E `#19` (`3.4s`).
- **Source code**: [catalogue.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/catalogue.tsx)

---

### `TC-CAT-02` — Bộ lọc Danh mục, Thương hiệu, Giá & Kiểm kê độ hoàn thiện Catalogue

- **Module**: Danh mục & Bộ lọc (`/vehicles`)
- **Tên chức năng**: Lọc Ô tô/Bán tải/Thương hiệu/Khoảng giá & kiểm kê 20 dòng xe / 21 xe DEMO
- **Mục tiêu kiểm thử**: Lọc khớp đúng giá thực tế và kiểm kê DB (`20` mẫu, `21` xe DEMO, `70` Media).
- **Điều kiện trước khi kiểm thử**: DB seed chuẩn `20/21/70`.
- **Dữ liệu đầu vào**: `type=PICKUP`, `type=CAR + brand=Honda`, `minPrice=1600000`, `minPrice=5000000`.
- **Các bước thực hiện**: Chạy Playwright `#17, #20, #21, #22` + truy vấn kiểm kê SQLite.
- **Kết quả mong đợi**: `PICKUP=4`, `CAR=8`, `CAR+Honda=1`, `minPrice=1.6M -> 2`; `17/20` mẫu đạt 100% specs & ảnh, `3/20` mẫu ghi nhận thiếu dữ liệu rõ ràng.
- **Kết quả thực tế**: Khớp 100%.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E `#17` (`2.7s`), `#20` (`2.8s`), `#21` (`2.5s`), `#22` (`4.7s`).
- **Source code**: [catalogue.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/catalogue.tsx), [vehicle-seed-data.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/vehicle-seed-data.ts)

---

### `TC-DET-01` — Gallery ảnh thật, Zoom Lightbox & Trang `404` `noindex`

- **Module**: Chi tiết phương tiện (`/vehicles/[slug]`)
- **Tên chức năng**: Gallery nhiều góc nhìn, fallback nội thất `Honda PCX`, và route missing slug
- **Mục tiêu kiểm thử**: `Honda PCX` báo `"Chưa cập nhật ảnh nội thất"`, `Toyota Fortuner` hiện ảnh thật `naturalWidth > 0`, missing slug trả 404 `noindex`.
- **Điều kiện trước khi kiểm thử**: `70/70` file media tồn tại vật lý trên đĩa.
- **Dữ liệu đầu vào**: `/vehicles/honda-pcx`, `/vehicles/toyota-fortuner`, `/vehicles/not-a-real-model`.
- **Các bước thực hiện**: Duyệt tab ảnh, mở lightbox, nhấn `Escape`; truy cập slug không tồn tại.
- **Kết quả mong đợi**: Đầy đủ ảnh không gãy; Lightbox trả focus nút mở; 404 có `noindex`.
- **Kết quả thực tế**: Khớp 100%.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E `#3`, `#4`, `#23` (`9.1s`), `#26` (`2.5s`).
- **Source code**: [vehicle-detail.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/vehicle-detail.tsx), [not-found.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/not-found.tsx>)

---

### `TC-CAL-01` — Lịch khả dụng 2 chữ số 1 dòng cả Desktop & Mobile `375px`

- **Module**: Lịch khả dụng (`AvailabilityCalendar`)
- **Tên chức năng**: Render lưới 7 cột các ngày không xuống dòng ký tự
- **Mục tiêu kiểm thử**: Ô ngày `'25'` có `whiteSpace === 'nowrap'` và chiều cao `<= 48px` ở cả `1280px` và `375px`.
- **Điều kiện trước khi kiểm thử**: `Toyota Fortuner` sẵn dữ liệu lịch từ `/nori-api/availability`.
- **Dữ liệu đầu vào**: Viewport `1280×812` & `375×812`.
- **Các bước thực hiện**: Mở trang → đo `boundingBox()` & `getComputedStyle`.
- **Kết quả mong đợi**: `whiteSpace === 'nowrap'` và `box.height <= 48`.
- **Kết quả thực tế**: Đạt ở cả hai viewport.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P2`
- **Bằng chứng**: Playwright E2E `#24` (`7.8s`).
- **Source code**: [availability-calendar.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/availability-calendar.tsx)

---

### `TC-RENT-01` — Chặn tạo đơn khoảng ngày không hợp lệ & Tính giá ngày/tuần/tháng/lễ/cọc

- **Module**: Nghiệp vụ Thuê xe & Báo giá
- **Tên chức năng**: Validation ngày `[1..30]` (`<= +90` ngày), tính chi tiết giá thuê & tách cọc
- **Mục tiêu kiểm thử**: Từ chối quá khứ, cùng ngày, `>30` ngày, `>90` ngày với `HTTP 400`; tính đúng giá cơ bản, cuối tuần, gói tuần/tháng, lễ, giao xe, addons và giữ nguyên `depositSnapshot` riêng.
- **Điều kiện trước khi kiểm thử**: `NR-OT-VIOS01` (`700.000đ/ngày`, cọc `10.000.000đ`).
- **Dữ liệu đầu vào**: 4 khoảng ngày sai + đơn hợp lệ `[start, start+2d]` có 1 cuối tuần + `deliveryRequested: true` + `['EXTENDED_INSURANCE', 'DASHCAM']`.
- **Các bước thực hiện**: Unit `rental-rules.test.mjs` + `audit-http.mjs` (`HTTP-RENT-BAD-*`, `HTTP-RENT-PRICE`).
- **Kết quả mong đợi**: 4 ca sai trả `400`; ca giá trả `base=1400000, weekend=100000, delivery=100000, addon=230000, total=1830000, deposit=10000000`.
- **Kết quả thực tế**: Khớp tuyệt đối từng VNĐ.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Unit `205/205 PASS` + `audit-http.mjs` `HTTP-RENT-BAD-*`, `HTTP-RENT-PRICE`.
- **Source code**: [rental-rules.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/rental-rules.ts), [Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts)

---

### `TC-RENT-02` — Chống tranh chấp đồng thời (Race Condition), Back-to-Back & Toàn trình Checkout → Hủy

- **Module**: Nghiệp vụ Thuê xe & SQLite Transaction
- **Tên chức năng**: Khóa ngày độc nhất `rental-days` trong transaction + luồng Checkout/Hủy E2E
- **Mục tiêu kiểm thử**: `Promise.all` 2 user đặt trùng xe chỉ 1 đơn `201` và 1 đơn `409`; đặt nối tiếp đúng `endDate` được `201`; trình duyệt đặt → hủy trả lịch xe sạch.
- **Điều kiện trước khi kiểm thử**: 2 QA users `User A`, `User B`; `NR-OT-VIOS01` & `Toyota Fortuner` sẵn lịch.
- **Dữ liệu đầu vào**: 2 request song song trùng ngày + 1 request nối tiếp + luồng E2E `#30`.
- **Các bước thực hiện**: Chạy `HTTP-RENT-RACE`, `HTTP-RENT-EDGE`, `HTTP-RENT-CANCEL`, E2E `#30`.
- **Kết quả mong đợi**: `statuses=[201,409]`, back-to-back `201`, hủy đơn giải phóng ngày `200`, E2E `#30 PASS`.
- **Kết quả thực tế**: Đạt 100%.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `audit-http.mjs` + Playwright E2E `#30` (`27.0s`).
- **Source code**: [Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts), [RentalDays.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/RentalDays.ts)

---

### `TC-BUY-01` — Ngăn xung đột Thuê ↔ Mua, Kiểm soát Trạng thái Yêu cầu mua & Khóa ngoại FK `BUG-05`

- **Module**: Nghiệp vụ Mua xe ↔ Thuê xe & Database Schema
- **Tên chức năng**: `SalesInquiries` relationship `vehicle_id`, ma trận `canTransitionInquiry`, khóa `RESERVED` & `SOLD`
- **Mục tiêu kiểm thử**: Chặn tạo đơn thuê khi có inquiry `DEPOSIT_PENDING`/`CONTRACT_SIGNED` (`RESERVED`); chặn `DELIVERED`/`SOLD` khi còn đơn thuê giữ lịch; chặn chuyển trạng thái inquiry nhảy cóc; xác nhận FK `sales_inquiries.vehicle_id -> vehicles.id`.
- **Điều kiện trước khi kiểm thử**: DB sau migration `20261117_211500` (`5` inquiries, `0` orphan) trên bản sao `audit-local.db`.
- **Dữ liệu đầu vào**: Inquiry gắn `NR-OT-VIOS01` chuyển `CONTRACT_SIGNED` + thử tạo booking + thử nhảy cóc trạng thái.
- **Các bước thực hiện**: Chạy `audit-local.ts` (`LOC-INQ-TRANSITION`, `LOC-BUG01-CHECK`, `LOC-CONF-01`, `LOC-CONF-02`, `LOC-BUY-02`) + E2E `#30` tạo inquiry trên UI.
- **Kết quả mong đợi**: Mọi vi phạm xung đột bị chặn `409`; `depth: 1` trả đối tượng `NR-OT-VIOS01`; `DELIVERED` chuyển xe sang `SOLD` + `INACTIVE`.
- **Kết quả thực tế**: `12/12` Local API checks `PASS / PROTECTED`, `fkCheck: []`, E2E `#30 PASS`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: `audit-local.ts` (`LOC-INQ-TRANSITION`, `LOC-BUG01-CHECK`, `LOC-CONF-01/02`, `LOC-BUY-02`), `HTTP-BUY-01`, E2E `#30`.
- **Source code**: [SalesInquiries.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/SalesInquiries.ts), [20261117_211500_sales_inquiries_vehicle_fk.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/migrations/20261117_211500_sales_inquiries_vehicle_fk.ts)

---

### `TC-REV-01` — Đánh giá thật: Chặn đơn chưa `COMPLETED` + Gửi & Hiển thị qua UI Trình duyệt

- **Module**: Đánh giá phương tiện (`/nori-api/reviews`, `/vehicles/[slug]#reviews`)
- **Tên chức năng**: Tạo & hiển thị đánh giá gắn đơn thuê hoàn thành (`Reviews`)
- **Mục tiêu kiểm thử**: Chặn đánh giá khi đơn `PENDING` (`403`), chặn đánh giá trùng lặp cùng đơn ở tầng DB/Hook, cho phép gửi và hiển thị trên UI tab `Đánh giá` sau khi đơn `COMPLETED`.
- **Điều kiện trước khi kiểm thử**: HTTP test + Local DB `audit-local.db` + E2E `#43` vừa chuyển đơn sang `COMPLETED`.
- **Dữ liệu đầu vào**: Review `5` sao, tiêu đề `'Xe Vios sạch sẽ, nhận xe nhanh'`.
- **Các bước thực hiện**: Kiểm thử `HTTP-REV-01` (`403`), `LOC-REV-01` (tạo 1 lần & chặn trùng), và E2E `#43` bấm `#tab-reviews`, điền `#review-title` / `#review-comment`, bấm `Gửi đánh giá`.
- **Kết quả mong đợi**: Đơn `PENDING` trả `403`, trùng bị chặn; qua UI tạo thành công (`201`), hiển thị badge `"5.0 / 5 sao (1 đánh giá)"` và nội dung đánh giá.
- **Kết quả thực tế**: Đạt 100% trên cả API, Local DB và UI trình duyệt (`finally` cleanup sạch DB).
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: `HTTP-REV-01`, `LOC-REV-01`, Playwright E2E `#43` (`30.0s`).
- **Source code**: [Reviews.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Reviews.ts), [reviews/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/reviews/route.ts>), [vehicle-detail.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/vehicle-detail.tsx)

---

### `TC-ADM-01` — Vòng đời Admin UI `/dashboard`, Bàn giao `handoverNote`, Chặn bảo trì khi `ONGOING` & Xuất CSV

- **Module**: Quản trị Vận hành (`/dashboard`, `/nori-api/dashboard/*`)
- **Tên chức năng**: Xử lý đơn thuê qua giao diện `/dashboard`, kiểm tra `isDepositExpired` / thống kê / CSV & bảo vệ quyền Admin
- **Mục tiêu kiểm thử**: Chặn chuyển nhảy cóc & chặn chuyển xe sang `MAINTENANCE`/`INACTIVE` khi có đơn `ONGOING`; xác thực phiên `admins` thật thao tác toàn bộ `Duyệt đơn` → `Đã giao xe` (nhập `#dashboard-handover-note`) → `Hoàn thành & giải phóng lịch` trên `/dashboard`; xuất CSV `200` (Admin) và `403` (Customer).
- **Điều kiện trước khi kiểm thử**: Tài khoản Admin tạo qua `POST /api/admins/first-register`; đơn thuê bắt đầu ngày `businessToday()` trên `NR-OT-VIOS01`.
- **Dữ liệu đầu vào**: Ghi chú `'Đã đối chiếu GPLX và bàn giao đủ giấy tờ.'`; `GET /nori-api/dashboard/export?type=bookings`.
- **Các bước thực hiện**: Chạy `LOC-ADM-01`, `LOC-ADM-02`, `HTTP-SEC-05` (`403`) và E2E `#43` trên browser context Admin riêng + kiểm tra `/account` khách nhận thông báo `"Hoàn thành"`.
- **Kết quả mong đợi**: Mọi trạng thái, ghi chú bàn giao, thống kê, bảng khách hàng, CSV export và WCAG 2.2 AA trên `/dashboard` đạt 100%, không làm hỏng DB.
- **Kết quả thực tế**: **E2E `#43 PASS` (`30.0s`), `AxeBuilder` `/dashboard` = `0` violations, `HTTP-SEC-05` = `403`, `LOC-ADM-02` = `maintDuringOngoingBlocked=true`**.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E `#43`, `audit-http.mjs` `HTTP-SEC-05`, `audit-local.ts` `LOC-ADM-02`, Unit tests `205/205`.
- **Source code**: [dashboard-panel.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/dashboard-panel.tsx), [dashboard/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/dashboard/route.ts>), [export/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/dashboard/export/route.ts>)

---

### `TC-ADM-02` — Kiểm thử đăng nhập Payload `/admin` qua Figma SSO & Lệnh `figma make verify-deploy`

- **Module**: Hệ thống CMS Platform Auth & Deploy
- **Tên chức năng**: Đăng nhập `/admin` SSO & kiểm tra deploy trên hạ tầng Figma Make
- **Mục tiêu kiểm thử**: Xác nhận luồng đăng nhập Figma SSO `/admin` và command `figma make verify-deploy`.
- **Điều kiện trước khi kiểm thử**: Cần runtime Figma Make SSO & CLI `figma` được cài đặt.
- **Dữ liệu đầu vào**: Command `Get-Command figma`.
- **Các bước thực hiện**: Kiểm tra CLI `figma` trong môi trường Windows shell cục bộ.
- **Kết quả mong đợi**: Chạy được `figma make verify-deploy` khi có CLI/platform host.
- **Kết quả thực tế**: `FIGMA_CLI: False` (`figma` không cài đặt ở local shell; auth UI `/dashboard` đã được xác minh thay thế bằng Payload `/api/admins/first-register` hợp lệ trong `TC-ADM-01`, và build production được xác minh bằng `pnpm build` + `pnpm start`).
- **Trạng thái**: `BLOCKED`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Kiểm tra `Get-Command figma` (`False`), `./nori.db` (`admins: 0`).
- **Source code**: [Admins.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Admins.ts)

---

### `TC-SEC-01` — Phòng chống CSRF (`Origin`/`Referer`), Tampering, IDOR, SQLi, XSS & Độc hại Phụ thuộc

- **Module**: Bảo mật & Phân quyền
- **Tên chức năng**: Kiểm soát bảo mật đầu vào, phân quyền API & `pnpm audit`
- **Mục tiêu kiểm thử**: Chặn CSRF (`403`), giả mạo giá/trạng thái (`400`), IDOR hủy đơn người khác (`404`), truy cập `/dashboard` & `/dashboard/export` bằng tài khoản khách (`403`), SQLi (`200 []` / `404`), lưu chuỗi `<script>alert(1)</script>` an toàn không thực thi, và xử lý `High` CVE `dompurify`.
- **Điều kiện trước khi kiểm thử**: 2 tài khoản QA `User A` & `User B` trên `localhost:3000`.
- **Dữ liệu đầu vào**: `Origin: https://evil-attacker.example`, `totalPrice: 1`, `' OR 1=1 --`, `<script>alert(1)</script> quote test`.
- **Các bước thực hiện**: Chạy `audit-http.mjs` (`17` ca) + `pnpm lint` (`static-lint.mjs`) + `pnpm audit --json`.
- **Kết quả mong đợi**: Mọi payload tấn công bị chặn đúng HTTP code; `pnpm audit` còn `0` `High` / `Critical`.
- **Kết quả thực tế**: `17/17 PASS`, `static-lint` `80/80` tệp `0` vấn đề, `pnpm audit` **`0` critical / `0` high / `0` low / `4` moderate**.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `audit-http.mjs`, `scripts/static-lint.mjs`, `pnpm audit --json`.
- **Source code**: [api-utils.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/api-utils.ts), [static-lint.mjs](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/scripts/static-lint.mjs)

---

### `TC-UI-01` — Accessibility WCAG 2.2 AA & Responsive Desktop / Tablet / Mobile

- **Module**: Giao diện & Trải nghiệm người dùng
- **Tên chức năng**: Kiểm tra hiển thị, ảnh, tràn ngang, reduced motion và `axe-core` WCAG 2.2 AA
- **Mục tiêu kiểm thử**: `0` lỗi runtime/console/tràn ngang trên Desktop (`1440px`), Tablet (`768px`), Mobile (`375px`) và `0` vi phạm WCAG 2.2 AA trên `8` màn hình đại diện (bao gồm `/dashboard` Admin).
- **Điều kiện trước khi kiểm thử**: Dev server đang chạy, Chromium Playwright sẵn sàng.
- **Dữ liệu đầu vào**: `14` routes chính, chuỗi dài không ngắt dòng, `8` màn hình `AxeBuilder`, `7` route `audit-tablet.mjs`.
- **Các bước thực hiện**: Chạy Playwright `#1..16`, `#33..43` và `audit-tablet.mjs`.
- **Kết quả mong đợi**: Tất cả `PASS`, `0` vi phạm `axe-core`, `overflow: false`.
- **Kết quả thực tế**: **`43/43` E2E PASS**, `8/8` màn hình `axe-core` `0` violations, `7/7` Tablet `overflow: false`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: Playwright E2E (`43 passed in 3.6m`), `audit-tablet.mjs`.
- **Source code**: [tests/e2e/nori.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/nori.spec.ts)

---

### `TC-SYNC-01` — Dynamic Slug Routes ngoài danh sách Build-Time (`dynamicParams = true`)

- **Module**: Đồng bộ Dữ liệu & Dynamic Routing (`/vehicles/[slug]`)
- **Tên chức năng**: Tự động sinh trang chi tiết cho phương tiện mới tạo từ Admin mà không cần build lại
- **Mục tiêu kiểm thử**: Đảm bảo khi Admin tạo một `vehicle-model` mới ngoài 20 slug tĩnh ban đầu, route `/vehicles/:new-slug` render động thành công (HTTP 200) thay vì trả về 404.
- **Điều kiện trước khi kiểm thử**: Server đang chạy production build.
- **Dữ liệu đầu vào**: Thêm dòng xe mới vào DB: `slug: 'e2e-sync-test-car'`, `name: 'E2E Dynamic Sync Model'`, `category: 'CAR'`.
- **Các bước thực hiện**: Gửi request `GET /vehicles/e2e-sync-test-car` bằng Playwright.
- **Kết quả mong đợi**: Server render trang chi tiết với tiêu đề `E2E Dynamic Sync Model`, mã HTTP 200.
- **Kết quả thực tế**: Trang hiển thị chính xác tên xe và thông số, HTTP 200.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: Playwright `tests/e2e/data-sync.spec.ts` test #1 (`1.2s`).
- **Source code**: [src/app/(frontend)/vehicles/[slug]/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/vehicles/[slug]/page.tsx>)

---

### `TC-SYNC-02` — Revalidation & Invalidation khi cập nhật phương tiện

- **Module**: Cache Invalidation & Payload Hooks
- **Tên chức năng**: Kích hoạt Payload hook xóa cache Next.js khi thay đổi phương tiện
- **Mục tiêu kiểm thử**: Xác minh `revalidateCatalogue` và `revalidateDeletedCatalogue` bóc tách đúng model slug và xóa cache tag `nori-catalogue-v3` và `nori-model-${slug}`.
- **Điều kiện trước khi kiểm thử**: Payload CMS và database hoạt động.
- **Dữ liệu đầu vào**: Thay đổi giá niêm yết hoặc trạng thái xe trong Payload.
- **Các bước thực hiện**: Gọi hook Payload `afterChange` của collection `Vehicles`.
- **Kết quả mong đợi**: Hook thực thi thành công, gọi `revalidateTag` cho các cache tags liên quan.
- **Kết quả thực tế**: Cache được xóa thành công, request tiếp theo phản ánh dữ liệu mới.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #2.
- **Source code**: [src/hooks/revalidate-nori.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/hooks/revalidate-nori.ts)

---

### `TC-SEC-CONCURRENCY-01` — Đặt xe trùng lịch đồng thời (Race Condition)

- **Module**: Giao dịch & Kiểm soát đồng thời (`/nori-api/bookings`)
- **Tên chức năng**: Xử lý xung đột khi 2 người dùng đặt cùng một xe trên cùng khoảng thời gian
- **Mục tiêu kiểm thử**: Đảm bảo Backend sử dụng transaction và khóa ngày `rental_days` để chỉ cho phép 1 đơn thành công (201), đơn còn lại bị từ chối với HTTP 409 Conflict.
- **Điều kiện trước khi kiểm thử**: Xe ở trạng thái `READY`, khoảng ngày đặt trống.
- **Dữ liệu đầu vào**: 2 request `POST /nori-api/bookings` đồng thời từ 2 người dùng khác nhau cho cùng `vehicleId` và khoảng ngày.
- **Các bước thực hiện**: Gửi song song 2 request bằng `Promise.all`.
- **Kết quả mong đợi**: Một request trả về `201 Created`, request thứ hai trả về `409 Conflict`.
- **Kết quả thực tế**: Đúng 1 request thành công `201`, 1 request bị từ chối `409`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #4 (`409 Conflict`).
- **Source code**: [src/app/(frontend)/nori-api/bookings/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/bookings/route.ts>)

---

### `TC-SEC-PAYMENT-01` — Chặn thanh toán trùng lặp (Idempotency Guard)

- **Module**: Sổ quỹ & Thanh toán (`/nori-api/dashboard/payments`)
- **Tên chức năng**: Chống gọi API thanh toán lặp lại trong vòng 30 giây
- **Mục tiêu kiểm thử**: Ngăn chặn người dùng hoặc mạng gửi request thanh toán 2 lần liên tiếp gây trừ tiền/ghi nhận 2 lần.
- **Điều kiện trước khi kiểm thử**: Có đơn thuê hợp lệ.
- **Dữ liệu đầu vào**: 2 request `POST /nori-api/dashboard/payments` có cùng `bookingId`, `paymentType`, `amount`.
- **Các bước thực hiện**: Gửi request 1 (nhận 201), gửi ngay request 2 trong vòng 2 giây.
- **Kết quả mong đợi**: Request 1 trả `201`, request 2 trả `409` với mã lỗi `DUPLICATE_PAYMENT`.
- **Kết quả thực tế**: Trả về `HTTP 409 DUPLICATE_PAYMENT`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #5 (`DUPLICATE_PAYMENT`).
- **Source code**: [src/app/(frontend)/nori-api/dashboard/payments/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/dashboard/payments/route.ts>)

---

### `TC-SEC-SW-01` — Service Worker Allowlist & Xóa Cache khi Đăng xuất

- **Module**: PWA & Bảo mật Service Worker
- **Tên chức năng**: Giới hạn cache tài nguyên tĩnh, không cache API/auth, dọn dẹp cache khi logout
- **Mục tiêu kiểm thử**: Đảm bảo SW không cache request mang cookie/auth hoặc các URL nhạy cảm (`/account`, `/checkout`, `/dashboard`, `/reset-password`), và dọn sạch runtime cache khi logout.
- **Điều kiện trước khi kiểm thử**: PWA đã cài đặt và SW kích hoạt.
- **Dữ liệu đầu vào**: Gọi fetch tới `/nori-api/auth/me` và URL `/account`, sau đó gọi logout.
- **Các bước thực hiện**: Kiểm tra cache storage của Service Worker trước và sau khi logout.
- **Kết quả mong đợi**: Không có bản ghi cache nào cho endpoint nhạy cảm; cache runtime được dọn sạch khi gửi `CLEAR_CACHES`.
- **Kết quả thực tế**: Đáp ứng 100%, không rò rỉ dữ liệu.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #6 & #7.
- **Source code**: [public/sw.js](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/public/sw.js), [src/components/auth-provider.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/auth-provider.tsx)

---

### `TC-MOBILE-WEBKIT-01` — Luồng Người dùng Hoàn chỉnh trên Mobile WebKit (iPhone 14)

- **Module**: Trải nghiệm Đa nền tảng (Cross-Platform Mobile WebKit)
- **Tên chức năng**: Tìm xe, Lọc xe, Đặt thuê, Tư vấn mua xe, Quản lý tài khoản
- **Mục tiêu kiểm thử**: Đảm bảo toàn bộ luồng người dùng hoạt động mượt mà trên engine WebKit (Safari iOS), không bị lỗi cảm ứng, vỡ layout hay lỗi form.
- **Điều kiện trước khi kiểm thử**: Trình giả lập Playwright Mobile WebKit kích hoạt (Viewport 390×844).
- **Dữ liệu đầu vào**: Tài khoản khách hàng thật, thao tác chạm/click trên mobile.
- **Các bước thực hiện**: Chạy 5 kịch bản trong `tests/e2e/mobile-webkit.spec.ts`.
- **Kết quả mong đợi**: Toàn bộ 5 kịch bản PASS.
- **Kết quả thực tế**: `5/5 PASS` (11.6s).
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: `tests/e2e/mobile-webkit.spec.ts` (`5 passed in 11.6s`).
- **Source code**: [tests/e2e/mobile-webkit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/mobile-webkit.spec.ts)

---

### `TC-PERF-CLS-01` — Khắc phục Layout Shift trang chi tiết Toyota Fortuner (CLS ≤ 0.1000)

- **Module**: Hiệu năng & Core Web Vitals (`/vehicles/toyota-fortuner`)
- **Tên chức năng**: Ổn định kích thước giao diện khi hydration
- **Mục tiêu kiểm thử**: Đưa chỉ số CLS từ `0.1327` xuống dưới ngưỡng chuẩn `0.1000`.
- **Điều kiện trước khi kiểm thử**: Production build server đang chạy.
- **Dữ liệu đầu vào**: Truy cập `/vehicles/toyota-fortuner` trên màn hình Desktop (1440×900).
- **Các bước thực hiện**: Đo Cumulative Layout Shift qua Performance Timeline API trong phiên duyệt trang thực tế.
- **Kết quả mong đợi**: CLS ≤ 0.1000.
- **Kết quả thực tế**: CLS đạt **`0.0038`** (giảm 97% so với mức ban đầu).
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: Performance Timeline Measurement script (CLS = `0.0038`, LCP = `516ms`, INP = `40ms`).
- **Source code**: [src/components/vehicle-detail.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/vehicle-detail.tsx), [src/app/(frontend)/vehicles/[slug]/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/vehicles/[slug]/page.tsx>)

---

### `TC-SYNC-01` — Dynamic Slug Routes ngoài danh sách Build-Time (`dynamicParams = true`)

- **Module**: Đồng bộ Dữ liệu & Dynamic Routing (`/vehicles/[slug]`)
- **Tên chức năng**: Tự động sinh trang chi tiết cho phương tiện mới tạo từ Admin mà không cần build lại
- **Mục tiêu kiểm thử**: Đảm bảo khi Admin tạo một `vehicle-model` mới ngoài 20 slug tĩnh ban đầu, route `/vehicles/:new-slug` render động thành công (HTTP 200) thay vì trả về 404.
- **Điều kiện trước khi kiểm thử**: Server đang chạy production build.
- **Dữ liệu đầu vào**: Thêm dòng xe mới vào DB: `slug: 'e2e-sync-test-car'`, `name: 'E2E Dynamic Sync Model'`, `category: 'CAR'`.
- **Các bước thực hiện**: Gửi request `GET /vehicles/e2e-sync-test-car` bằng Playwright.
- **Kết quả mong đợi**: Server render trang chi tiết với tiêu đề `E2E Dynamic Sync Model`, mã HTTP 200.
- **Kết quả thực tế**: Trang hiển thị chính xác tên xe và thông số, HTTP 200.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: Playwright `tests/e2e/data-sync.spec.ts` test #1 (`1.2s`).
- **Source code**: [src/app/(frontend)/vehicles/[slug]/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/vehicles/[slug]/page.tsx>)

---

### `TC-SYNC-02` — Revalidation & Invalidation khi cập nhật phương tiện

- **Module**: Cache Invalidation & Payload Hooks
- **Tên chức năng**: Kích hoạt Payload hook xóa cache Next.js khi thay đổi phương tiện
- **Mục tiêu kiểm thử**: Xác minh `revalidateCatalogue` và `revalidateDeletedCatalogue` bóc tách đúng model slug và xóa cache tag `nori-catalogue-v3` và `nori-model-${slug}`.
- **Điều kiện trước khi kiểm thử**: Payload CMS và database hoạt động.
- **Dữ liệu đầu vào**: Thay đổi giá niêm yết hoặc trạng thái xe trong Payload.
- **Các bước thực hiện**: Gọi hook Payload `afterChange` của collection `Vehicles`.
- **Kết quả mong đợi**: Hook thực thi thành công, gọi `revalidateTag` cho các cache tags liên quan.
- **Kết quả thực tế**: Cache được xóa thành công, request tiếp theo phản ánh dữ liệu mới.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #2.
- **Source code**: [src/hooks/revalidate-nori.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/hooks/revalidate-nori.ts)

---

### `TC-SEC-CONCURRENCY-01` — Đặt xe trùng lịch đồng thời (Race Condition)

- **Module**: Giao dịch & Kiểm soát đồng thời (`/nori-api/bookings`)
- **Tên chức năng**: Xử lý xung đột khi 2 người dùng đặt cùng một xe trên cùng khoảng thời gian
- **Mục tiêu kiểm thử**: Đảm bảo Backend sử dụng transaction và khóa ngày `rental_days` để chỉ cho phép 1 đơn thành công (201), đơn còn lại bị từ chối với HTTP 409 Conflict.
- **Điều kiện trước khi kiểm thử**: Xe ở trạng thái `READY`, khoảng ngày đặt trống.
- **Dữ liệu đầu vào**: 2 request `POST /nori-api/bookings` đồng thời từ 2 người dùng khác nhau cho cùng `vehicleId` và khoảng ngày.
- **Các bước thực hiện**: Gửi song song 2 request bằng `Promise.all`.
- **Kết quả mong đợi**: Một request trả về `201 Created`, request thứ hai trả về `409 Conflict`.
- **Kết quả thực tế**: Đúng 1 request thành công `201`, 1 request bị từ chối `409`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #4 (`409 Conflict`).
- **Source code**: [src/app/(frontend)/nori-api/bookings/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/bookings/route.ts>)

---

### `TC-SEC-PAYMENT-01` — Chặn thanh toán trùng lặp (Idempotency Guard)

- **Module**: Sổ quỹ & Thanh toán (`/nori-api/dashboard/payments`)
- **Tên chức năng**: Chống gọi API thanh toán lặp lại trong vòng 30 giây
- **Mục tiêu kiểm thử**: Ngăn chặn người dùng hoặc mạng gửi request thanh toán 2 lần liên tiếp gây trừ tiền/ghi nhận 2 lần.
- **Điều kiện trước khi kiểm thử**: Có đơn thuê hợp lệ.
- **Dữ liệu đầu vào**: 2 request `POST /nori-api/dashboard/payments` có cùng `bookingId`, `paymentType`, `amount`.
- **Các bước thực hiện**: Gửi request 1 (nhận 201), gửi ngay request 2 trong vòng 2 giây.
- **Kết quả mong đợi**: Request 1 trả `201`, request 2 trả `409` với mã lỗi `DUPLICATE_PAYMENT`.
- **Kết quả thực tế**: Trả về `HTTP 409 DUPLICATE_PAYMENT`.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #5 (`DUPLICATE_PAYMENT`).
- **Source code**: [src/app/(frontend)/nori-api/dashboard/payments/route.ts](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/nori-api/dashboard/payments/route.ts>)

---

### `TC-SEC-SW-01` — Service Worker Allowlist & Xóa Cache khi Đăng xuất

- **Module**: PWA & Bảo mật Service Worker
- **Tên chức năng**: Giới hạn cache tài nguyên tĩnh, không cache API/auth, dọn dẹp cache khi logout
- **Mục tiêu kiểm thử**: Đảm bảo SW không cache request mang cookie/auth hoặc các URL nhạy cảm (`/account`, `/checkout`, `/dashboard`, `/reset-password`), và dọn sạch runtime cache khi logout.
- **Điều kiện trước khi kiểm thử**: PWA đã cài đặt và SW kích hoạt.
- **Dữ liệu đầu vào**: Gọi fetch tới `/nori-api/auth/me` và URL `/account`, sau đó gọi logout.
- **Các bước thực hiện**: Kiểm tra cache storage của Service Worker trước và sau khi logout.
- **Kết quả mong đợi**: Không có bản ghi cache nào cho endpoint nhạy cảm; cache runtime được dọn sạch khi gửi `CLEAR_CACHES`.
- **Kết quả thực tế**: Đáp ứng 100%, không rò rỉ dữ liệu.
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: `tests/e2e/data-sync.spec.ts` test #6 & #7.
- **Source code**: [public/sw.js](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/public/sw.js), [src/components/auth-provider.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/auth-provider.tsx)

---

### `TC-MOBILE-WEBKIT-01` — Luồng Người dùng Hoàn chỉnh trên Mobile WebKit (iPhone 14)

- **Module**: Trải nghiệm Đa nền tảng (Cross-Platform Mobile WebKit)
- **Tên chức năng**: Tìm xe, Lọc xe, Đặt thuê, Tư vấn mua xe, Quản lý tài khoản
- **Mục tiêu kiểm thử**: Đảm bảo toàn bộ luồng người dùng hoạt động mượt mà trên engine WebKit (Safari iOS), không bị lỗi cảm ứng, vỡ layout hay lỗi form.
- **Điều kiện trước khi kiểm thử**: Trình giả lập Playwright Mobile WebKit kích hoạt (Viewport 390×844).
- **Dữ liệu đầu vào**: Tài khoản khách hàng thật, thao tác chạm/click trên mobile.
- **Các bước thực hiện**: Chạy 5 kịch bản trong `tests/e2e/mobile-webkit.spec.ts`.
- **Kết quả mong đợi**: Toàn bộ 5 kịch bản PASS.
- **Kết quả thực tế**: `5/5 PASS` (11.6s).
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P1`
- **Bằng chứng**: `tests/e2e/mobile-webkit.spec.ts` (`5 passed in 11.6s`).
- **Source code**: [tests/e2e/mobile-webkit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/mobile-webkit.spec.ts)

---

### `TC-PERF-CLS-01` — Khắc phục Layout Shift trang chi tiết Toyota Fortuner (CLS ≤ 0.1000)

- **Module**: Hiệu năng & Core Web Vitals (`/vehicles/toyota-fortuner`)
- **Tên chức năng**: Ổn định kích thước giao diện khi hydration
- **Mục tiêu kiểm thử**: Đưa chỉ số CLS từ `0.1327` xuống dưới ngưỡng chuẩn `0.1000`.
- **Điều kiện trước khi kiểm thử**: Production build server đang chạy.
- **Dữ liệu đầu vào**: Truy cập `/vehicles/toyota-fortuner` trên màn hình Desktop (1440×900).
- **Các bước thực hiện**: Đo Cumulative Layout Shift qua Performance Timeline API trong phiên duyệt trang thực tế.
- **Kết quả mong đợi**: CLS ≤ 0.1000.
- **Kết quả thực tế**: CLS đạt **`0.0038`** (giảm 97% so với mức ban đầu).
- **Trạng thái**: `PASS`
- **Mức độ ưu tiên**: `P0`
- **Bằng chứng**: Performance Timeline Measurement script (CLS = `0.0038`, LCP = `516ms`, INP = `40ms`).
- **Source code**: [src/components/vehicle-detail.tsx](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/components/vehicle-detail.tsx), [src/app/(frontend)/vehicles/[slug]/page.tsx](<file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/app/(frontend)/vehicles/[slug]/page.tsx>)

---

## Bổ sung Test Cases Đợt Kiểm thử Toàn diện (`2026-11-18` — `QA-*` & `TC-UNIT-SESSION`)

### `QA-SEC-01` — Kiểm soát Phân quyền Granular `OPERATOR` trên UI `AdminShell` & Toàn bộ `/nori-api/dashboard/*`

- **Module**: Phân quyền Quản trị (`RBAC`) & `AdminShell`
- **Điều kiện trước**: Đăng nhập `SUPER_ADMIN`, tạo tài khoản `OPERATOR` chỉ có quyền `vehicles: ['read']`, `bookings: ['read']`.
- **Các bước thực hiện**:
  1. Đăng nhập `OPERATOR` qua `/login`, kiểm tra sidebar điều hướng tại `/dashboard`.
  2. Truy cập trực tiếp `/dashboard/admins`.
  3. Gọi 18 endpoint không thuộc quyền (`admins`, `reports`, `export?type=financial`, `export?type=customers`, `customers`, `inquiries`, `posts`, `promotions`, `vehicles?view=models`, `POST/PATCH/DELETE` phương tiện/dòng xe, `POST/DELETE /media`, `PATCH /nori-api/dashboard`).
  4. Gọi `GET /nori-api/dashboard/vehicles`, `GET /dashboard/bookings`, `GET /dashboard/export?type=bookings`, `GET /nori-api/dashboard`.
- **Kết quả mong đợi**: Sidebar chỉ hiển thị 3 mục hợp lệ, ẩn `/admin`; `/dashboard/admins` hiện thông báo từ chối quyền; 18 endpoint bị chặn trả `403`; `/dashboard` lọc rỗng `customersList`/`inquiries`/`dataCompleteness`.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `QA-SEC-02` — Chặn Replay Token Admin Đã Đăng xuất, CSV Formula Injection & XSS

- **Module**: Phiên đăng nhập Admin (`admins_sessions`), Xuất CSV & Chống XSS
- **Các bước thực hiện**: Đăng nhập Admin → lấy Cookie → gọi `POST /nori-api/auth/logout` → replay Cookie cũ vào `/nori-api/dashboard/reports`, `/dashboard/admins`, `/dashboard/export`, `/nori-api/auth/me`. Tạo đơn có tên `=CMD|...` và ghi chú `@SUM(...)`, xuất CSV đơn thuê.
- **Kết quả mong đợi**: Replay Cookie bị từ chối `403` và `/auth/me` trả `null`; CSV ép tiền tố `'` vô hiệu hóa công thức.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `QA-CMS-01` — Quy trình Xuất bản → Gỡ xuất bản (Lưu nháp) → Tái xuất bản Bài viết

- **Module**: CMS Tin tức & Sự kiện (`/dashboard/posts`, `/posts`, `/posts/[slug]`)
- **Các bước thực hiện**: Tạo & xuất bản bài viết kèm ảnh banner → kiểm tra `200` trên `/posts/[slug]` → mở Chỉnh sửa và bấm `Lưu bản nháp` (`_status: 'draft'`) → kiểm tra ngay `/posts/[slug]` và `/posts` → xuất bản lại.
- **Kết quả mong đợi**: Khi chuyển về bản nháp, bài viết bị gỡ khỏi `/posts` và `/posts/[slug]` trả `404`; xuất bản lại trả `200`.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `QA-BIZ-01` — Giới hạn `NoriSite.maxPendingBookings` & Đua lệnh 8 người dùng đồng thời

- **Module**: Ràng buộc nghiệp vụ Đặt xe & Khóa Giao dịch SQLite
- **Các bước thực hiện**: Admin cấu hình `maxPendingBookings = 2` → khách tạo 2 đơn `PENDING` (`201`, `201`) → đơn thứ 3 trả `429`; khôi phục cấu hình → phóng 8 request `POST /nori-api/bookings` song song bằng `Promise.all` cùng 1 xe và khoảng ngày.
- **Kết quả mong đợi**: Đúng `1` request trả `201`, `7` request trả `409`, `rental_days` giữ đúng số ngày của đơn thắng cuộc.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `TC-UNIT-SESSION-01` — Kiểm tra `hasActiveSessionRecord`

- **Module**: Quản lý Phiên ([session-cookie.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/lib/session-cookie.ts))
- **Trạng thái**: `PASS` ([rental-rules.test.mjs](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/rental-rules.test.mjs)).

### `QA-SEC-03` — Payload Native `/api/*` RBAC, Khóa `Folders`/`Tags`, Hành động `publish` & Live Revocation

- **Module**: Payload Collection Access (`Admins`, `Users`, `Folders`, `Tags`, `MaintenanceSchedules`, `Vehicles`, `Posts`, `NoriSite`) & Action `publish`
- **Các bước thực hiện**:
  1. Guest gọi `/api/folders`, `/api/tags`, `/api/maintenance-schedules`, `/api/audit-logs`, `/api/admins`, `/nori-api/dashboard/export?type=customers`, `/api/vehicles?limit=5`.
  2. Customer gọi `/api/folders`, `/api/tags`, `POST /api/folders`, `/api/maintenance-schedules` kèm JWT.
  3. Tạo `OPERATOR` có `posts: ['read', 'create', 'update']`, `content: ['read', 'update']`, `reports: ['read']` (không có `publish`, `admins`, `customers`, `maintenance`). Thử đọc `/api/admins`, `/api/users`, `/nori-api/dashboard/export?type=customers`, lưu bài viết `draft`, thử xuất bản `published` bài viết & `NoriSite`, kiểm tra UI `/dashboard/posts`.
  4. `SUPER_ADMIN` thu hồi toàn bộ quyền `posts` của Operator rồi Operator gọi lại API ngay bằng session đang mở.
- **Kết quả mong đợi**: Guest/Customer bị `403`, không lộ `licensePlate` & export khách hàng; Operator chỉ thấy bản ghi của chính mình trên `/api/admins`, lưu được `draft` (`201`) nhưng bị `403` khi xuất bản và nút `Xuất bản` disabled; sau thu hồi lập tức bị `403` không cần đăng xuất.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `QA-CONC-01` — Khóa lạc quan `expectedRevision`, Chặn hủy đơn đã thu tiền & Tự hủy phiếu `PENDING`

- **Module**: Đồng bộ `Bookings` ↔ `Payments` ([Bookings.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Bookings.ts), [Payments.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/src/collections/Payments.ts))
- **Các bước thực hiện**: Hai Admin gọi `PATCH /nori-api/dashboard/bookings` song song với cùng `expectedRevision`; hai request tạo payment giống hệt nhau song song; Khách hàng cố hủy đơn đã có thanh toán `CONFIRMED` (cả ở `CONFIRMED` lẫn `PENDING`); Admin từ chối đơn có sẵn phiếu `PENDING` rồi thử tạo tiếp thanh toán `CONFIRMED`.
- **Kết quả mong đợi**: Duyệt song song trả `[200, 409]`; tạo payment song song trả `[201, 409]`; khách hủy đơn đã thu tiền bị chặn `409`; đơn `REJECTED` đưa `remaining_amount = 0`, tự chuyển phiếu `PENDING` sang `CANCELLED` và chặn thanh toán mới (`409`).
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `QA-CONC-02` — Chống lệch giá Checkout (`expectedTotalPrice`), Invalidation `/nori-api/fleet`, `/nori-api/health` & Security Headers

- **Module**: Checkout, Public Cache & Monitoring
- **Các bước thực hiện**: Kiểm tra `GET /nori-api/health` (`no-store`), kiểm tra headers bảo mật trang `/`, gọi `/nori-api/revalidate` thiếu HMAC (`401`), đặt xe gửi `expectedTotalPrice = 1` (`409`), Admin cập nhật giá xe và gọi ngay `/nori-api/fleet?modelSlug=...`.
- **Kết quả mong đợi**: Giá thay đổi phản ánh tức thì trên `/nori-api/fleet`, healthcheck `200`, sai giá checkout trả `409`.
- **Trạng thái**: `PASS` ([qa-comprehensive-audit.spec.ts](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/e2e/qa-comprehensive-audit.spec.ts))

### `UNIT-RBAC-01..06` — Unit Tests Ma trận Quyền (`src/access/nori.ts`) & Notification Fallback (`src/lib/notifications.ts`)

- **Module**: Access Helpers & Notification Dispatch Resilience
- **Trạng thái**: `PASS` (`6/6` tests mới; `100.00%` line coverage trên `nori.ts` và `97.03%` trên `notifications.ts` trong [`tests/rbac-access.test.mjs`](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/tests/rbac-access.test.mjs); tổng unit suite `247/247` PASS).

### `UAT-01..07` — Real Browser User Acceptance Testing (Customer + Admin)

- **Module**: Trải nghiệm End-to-End Thực tế ([`UAT_REPORT.md`](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/UAT_REPORT.md))
- **Trạng thái**: `PASS` (`7/7` walkthrough steps, `0` console error, `0` page error, `0` lỗi 5xx, `0` FK orphan).
