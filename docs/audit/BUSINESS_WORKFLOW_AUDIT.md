# KIỂM TOÁN QUY TRÌNH NGHIỆP VỤ E2E — NORI VEHICLE RENTAL (`BUSINESS_WORKFLOW_AUDIT.md`)

- **Ngày cập nhật**: `2026-11-18`
- **Phương pháp**: Đối chiếu mã nguồn Backend/Hooks/Frontend kết hợp chạy thực nghiệm toàn bộ các quy trình trên server production cô lập (`nori-qa-isolated.db`, `http://localhost:3100`) thông qua Unit Tests, Playwright E2E và Browser UAT Walkthrough.

---

## 1. Quy trình Khách hàng Thuê xe & Áp dụng Khuyến mãi (`RENT`)

1. **Khám phá & Tìm kiếm (`/` → `/vehicles`)**: Hỗ trợ tìm kiếm đa từ khóa không dấu tiếng Việt, lọc loại xe (`CAR`, `MOTORBIKE`, `PICKUP`), hãng, kiểu dáng, nhiên liệu, số chỗ, vị trí, khoảng giá và sắp xếp 5 tiêu chí. Trang chủ đã được tối ưu gọn RSC payload & ảnh Hero Slide #1 (`"Mọi hành trình. Luôn có NORI."`).
2. **Kiểm tra Lịch & Báo giá (`/vehicles/[slug]` → `/nori-api/availability`)**:
   - Đọc lịch thực tế từ `rental_days` và `maintenance_schedules` thông qua query nội bộ chọn lọc trường tối thiểu (`select: { startDate, endDate, status }`), không mở công khai bảng chi phí/ODO bảo trì (`BUG-QA-09`).
   - Server tính giá theo ngày thường, phụ phí cuối tuần (T7–CN), phụ phí ngày lễ VN (`VIETNAM_HOLIDAYS`), chiết khấu tuần/tháng tự chọn mức có lợi hơn, phí giao nhận và phụ kiện. Tiền đặt cọc (`depositAmount`) tách biệt hoàn toàn với tổng tiền thuê (`totalPrice`).
3. **Checkout & Khuyến mãi (`/checkout` → `POST /nori-api/bookings`)**:
   - Xác thực phiên `nori-customer-session` ổn định trên Chrome, Edge và Mobile WebKit Safari.
   - Bổ sung kiểm tra `expectedTotalPrice`: nếu Admin vừa đổi đơn giá xe trong lúc khách mở trang checkout, API chặn **`HTTP 409`** thay vì tạo đơn âm thầm sai giá (`QA-CONC-02`).
   - Khuyến mãi: kiểm tra kích hoạt, thời hạn (`Asia/Ho_Chi_Minh`), `usageLimit`, `minDays`, dịch vụ áp dụng (`RENT`/`SALE`/`ALL`). Giao diện quản trị [`promotions-panel.tsx`](../../src/components/admin/promotions-panel.tsx) đã bổ sung cảnh báo đơn vị VNĐ `< 1000` và ghi chú giới hạn chung toàn chương trình (tránh nhầm lẫn như mã lịch sử `NORIXINCAMON` trong `./nori.db` có `max_discount = 30`, `used_count = 1/1`).
   - Giới hạn đơn `PENDING` đọc trực tiếp từ `NoriSite.maxPendingBookings`; khóa giao dịch `withBookingWriteLock()` bảo đảm `8` yêu cầu đặt trùng đồng thời chỉ tạo đúng `1` đơn `201` và `7` lỗi `409`.

---

## 2. Vòng đời Đơn thuê, Thanh toán & Chống Đua lệnh (`Bookings` ↔ `Payments`)

1. **Sửa đơn & Hủy đơn phía Khách (`/my-bookings` → `PUT/PATCH /nori-api/bookings`)**:
   - Chỉ chủ sở hữu `ACTIVE` được sửa đơn khi trạng thái là `PENDING` và chưa có giao dịch thanh toán hợp lệ. Hoán đổi `rental_days` nguyên tử có `excludeBookingId`.
   - **Ràng buộc mới (`BUG-QA-10`)**: Khách hàng **không thể tự hủy đơn (`409`)** nếu đơn đã ghi nhận phiếu thanh toán `CONFIRMED` (không phải `REFUND`), đảm bảo phải qua quy trình đối soát/hoàn tiền của Admin (`QA-CONC-01`).
2. **Duyệt đơn, Khóa lạc quan & Quy trình Bàn giao (`/dashboard/bookings`)**:
   - Đã bổ sung kiểm tra **`expectedRevision`** ở `Bookings.beforeChange`, `/nori-api/dashboard/bookings`, `/nori-api/dashboard` và giao diện `bookings-panel.tsx`: hai Admin cùng xử lý một đơn tại cùng thời điểm chỉ có `1` người thành công (`200`), người thứ hai nhận **`HTTP 409 Conflict`** tránh ghi đè mù.
   - Quy tắc ngày giao xe: đơn có `startDate` trong tương lai sau khi `CONFIRMED` chỉ hiển thị nút **`Chuẩn bị giao xe`** (`READY_FOR_HANDOVER`) và khóa chuyển sang `ONGOING` (`Đã giao xe`) cho đến ngày nhận xe (đã xác minh trong `UAT-05`).
   - Thông báo & Webhook (`dispatchBookingConfirmationNotice` tại [`src/lib/notifications.ts`](../../src/lib/notifications.ts)): được bọc `try/catch` & timeout `4000ms` giúp lỗi kênh thông báo ngoài không bao giờ làm hỏng giao dịch duyệt đơn.
3. **Tính nhất quán Giữa Đơn thuê và Thanh toán (`/dashboard/payments` & `Payments.ts`)**:
   - Không thể tạo/xác nhận khoản thu (`status !== 'CANCELLED' && paymentType !== 'REFUND'`) cho đơn đã `CANCELLED` hoặc `REJECTED` (`HTTP 409`), và trên giao diện [`payments-panel.tsx`](../../src/components/admin/payments-panel.tsx) đã lọc bỏ đơn đã hủy/từ chối khỏi danh sách chọn thu tiền.
   - Không cho đảo ngược phiếu đã `REFUNDED` (`409`), giữ lock `withBookingWriteLock()` & chặn gửi lặp trong 30 giây (`409 DUPLICATE_PAYMENT`).
   - Khi đơn chuyển sang `CANCELLED` hoặc `REJECTED`, `remainingAmount` tự đưa về `0` và các phiếu `PENDING` đang treo thuộc đơn đó tự động hủy (`CANCELLED`).

---

## 3. Quy trình Mua xe, CMS Nội dung & Phân quyền Xuất bản (`publish`)

- **Mua xe (`SALE` & `SalesInquiries`)**: giữ chỗ xe (`RESERVED`) khi `DEPOSIT_PENDING`/`CONTRACT_SIGNED` và chuyển `SOLD` + `INACTIVE` chỉ khi không còn đơn thuê mở.
- **CMS Hero Carousel & Tin tức (`/dashboard/content`, `/dashboard/posts`)**:
  - Áp dụng quyền thứ 5 **`publish`** tách biệt khỏi `create`/`update`: Operator chỉ có quyền tạo/sửa bài viết hoặc nội dung chỉ lưu được **`draft`** (`Bản nháp`), cố gắng xuất bản hoặc gỡ bài đang công khai trả **`HTTP 403`** và nút **Xuất bản** bị vô hiệu hóa trên UI (`QA-SEC-03`).
  - Lệnh gỡ bài đã xuất bản về `draft` đồng bộ ẩn ngay bài viết khỏi `/posts` và `/posts/[slug]` (`HTTP 404`), làm mới cache tức thì qua `revalidate-nori.ts`.
