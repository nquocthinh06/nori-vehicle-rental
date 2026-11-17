# ĐÁNH GIÁ NGHIỆP VỤ THUÊ VÀ MUA XE NORI (BUSINESS FLOW REVIEW — PHASE 2)

## 1. Đánh giá tổng quan quy trình nghiệp vụ

Hệ thống NORI tách biệt hai dịch vụ **Thuê xe (`RENT`)** và **Mua xe (`SALE`)** trên cùng nền tảng Catalogue dòng xe (`vehicle-models`) và Kho xe thực tế (`vehicles`). Sau đợt hoàn thiện Phase 2, **toàn bộ vòng đời cốt lõi từ Tìm kiếm → Đặt thuê/Mua → Duyệt/Giao/Nhận/Hoàn thành trên Dashboard Admin → Thông báo & Đổi mật khẩu Khách hàng → Đánh giá thực tế đều hoạt động thông suốt đầu-cuối (đã kiểm chứng bằng `43/43` Playwright E2E, `17/17` HTTP API, `12/12` Local API)**.

---

## 2. Quy trình Thuê xe (Sau Phase 2)

1. **Tìm kiếm & Lọc Catalogue**: Hỗ trợ tìm đa từ khóa không dấu tiếng Việt (`"xe dien"`), lọc danh mục/hãng/kiểu dáng/nhiên liệu/chỗ/vị trí/khoảng giá (bỏ qua xe thiếu giá) và truyền tham số sang trang chi tiết.
2. **Kiểm tra Lịch khả dụng (`[startDate, endDate)`)**: Đọc lịch bận thời gian thực từ `rental-days`; hỗ trợ đón khách mới ngay vào ngày trả của đơn trước (`HTTP-RENT-EDGE PASS: 201`), hiển thị chuẩn 2 chữ số cả trên Mobile `375px`.
3. **Báo giá chi tiết & Đặt cọc (`calculateRentalQuote`)**:
   - Server tính lại toàn bộ `baseRentPrice`, phụ phí cuối tuần (`T7–CN`), phụ phí ngày lễ VN (`VIETNAM_HOLIDAYS`), ưu đãi dài ngày tự động chọn mức có lợi hơn cho khách (giảm `5%`/`12%` so với gói `weeklyPrice`/`monthlyPrice`), phí giao xe tận nơi và phụ kiện.
   - Tách riêng **Tiền đặt cọc đảm bảo (`depositSnapshot`)** khỏi **Tổng tiền thuê (`totalPrice`)**, ghi rõ thanh toán ngoại tuyến.
4. **Giữ lịch & Chống Race Condition**: Transaction SQLite tạo khóa unique `vehicleId:YYYY-MM-DD`; 2 khách đặt đồng thời 1 xe cùng ngày cho kết quả `Promise.all = [201, 409]`. Chặn tối đa `5` đơn `PENDING` đồng thời để chống spam khóa kho.
5. **Vòng đời vận hành & Xung đột bảo trì (`canTransition`)**:
   - Khách tự hủy khi ở `PENDING`/`DEPOSIT_PENDING` để giải phóng ngày.
   - Admin xử lý trên `/dashboard` (gồm nhập `handoverNote` khi giao/nhận xe), đồng bộ `Vehicles.operationStatus` thành `RENTED` khi `ONGOING`, **chặn chuyển xe sang `MAINTENANCE`/`INACTIVE` trong lúc đang có đơn `ONGOING` (`LOC-ADM-02 PASS: 409`)**, và giải phóng `rental-days` về `0` khi `COMPLETED`/`CANCELLED`/`REJECTED`.
   - Hệ thống đánh dấu cảnh báo **`Quá hạn đặt cọc (>24h)`** (`isDepositExpired`) cho các đơn `DEPOSIT_PENDING` quá hạn tại `/dashboard`.
6. **Giới hạn phạm vi hiện tại**: Thuê theo giờ (`pricePerHour`) và thời gian đệm theo giờ (`bufferHours`) giữ ở mức hiển thị bảng giá tham khảo; luồng đặt hiện tại khóa theo ngày nguyên (`YYYY-MM-DD`).

---

## 3. Quy trình Mua xe, Báo giá & Lái thử (Sau Phase 2)

1. Khách xem bảng giá niêm yết phiên bản, giá bán NORI, ODO, bảo hành, công cụ dự toán **Chi phí lăn bánh** và gửi 5 loại yêu cầu (`CONSULTATION`, `QUOTE`, `VIEWING`, `TEST_DRIVE`, `PURCHASE_REQUEST`).
2. Cột `SalesInquiries.vehicle` đã được migration sang quan hệ FK chuẩn `relationship -> vehicles` (`BUG-05 FIXED`).
3. **Kiểm soát luồng trạng thái (`canTransitionInquiry`)**: Ngăn Admin chuyển trạng thái nhảy cóc bất hợp lệ (`LOC-INQ-TRANSITION PASS`).
4. **Khóa xung đột Thuê ↔ Mua (`BUG-01 FIXED`)**:
   - Khi yêu cầu mua có gắn xe cụ thể chuyển sang `DEPOSIT_PENDING` hoặc `CONTRACT_SIGNED`, xe tự động chuyển `RESERVED` và **chặn hoàn toàn đơn thuê mới** (`LOC-BUG01-CHECK PROTECTED`).
   - Khi Admin chuyển `DELIVERED`, hệ thống chặn nếu còn đơn thuê trong `HOLD_STATUSES` (`LOC-CONF-02`), và tự động khóa xe `SOLD` + `INACTIVE` khi lịch sạch (`LOC-BUY-02`).

---

## 4. Nghiệp vụ Đánh giá, Thông báo & Tài khoản Khách hàng

- **Đánh giá (`Reviews`)**: Khóa chặt chỉ tài khoản sở hữu đơn `COMPLETED` mới gửi được đúng `1` đánh giá/đơn; đã kiểm chứng cả qua API (`403` đơn chưa hoàn thành), Local DB (chặn gửi trùng), và **qua giao diện trình duyệt tab `#tab-reviews` (`E2E #43 PASS`)**.
- **Thông báo trong App (`/account`)**: Đã bổ sung bảng tổng hợp **Thông báo trạng thái gần đây** cập nhật theo đơn thuê và yêu cầu mua mới nhất; đồng thời ghi chú rõ Email/SMS tự động chưa khả dụng do chưa cấu hình Email Adapter.
- **Tài khoản Khách hàng**: Hỗ trợ cập nhật họ tên/SĐT và **Đổi mật khẩu trực tiếp trên `/account`** (`#pwd-current` xác thực 401/200); riêng đổi email và quên mật khẩu qua email đang khóa chờ Email Adapter.

---

## 5. Tính minh bạch Dữ liệu `DEMO` trước khi Go-Live

- `21/21` xe thực tế hiện gắn `isDemo: true` (`is_demo = 1`) với nhãn `(DEMO)` tại danh mục, chi tiết, checkout, footer và `/support`. Trước khi mở bán/nhận khách thật, doanh nghiệp cần ẩn/xóa dữ liệu DEMO, nạp danh sách xe & hotline chính thức, đồng thời bổ sung thông số còn thiếu cho `3/20` mẫu (`hyundai-accent`, `ford-ranger-wildtrak`, `mitsubishi-triton`).
