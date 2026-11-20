# NORI Vehicle Rental — Hướng dẫn vận hành Đa chi nhánh (Branch Operations Guide)

## 1. Thiết lập ban đầu (Super Admin)

1. **Tạo chi nhánh (`/dashboard/branches`)**:
   - Nhấn **Thêm chi nhánh mới**, nhập Mã chi nhánh duy nhất (VD: `HCM-Q1`, `HN-HK`), Tên, Địa chỉ xác thực, Tỉnh/Thành, Giờ mở/đóng cửa và cấu hình chính sách giao nhận tận nơi.
   - Khi cần tạm đóng chi nhánh, hệ thống cảnh báo số đơn thuê tương lai và giữ nguyên toàn bộ đơn đã xác nhận (không tự động hủy).
2. **Tạo kho xe & phân bổ phương tiện (`/dashboard/warehouses`)**:
   - Tạo ít nhất 1 kho xe (`SHOWROOM`, `PARKING_LOT`, `STORAGE`, `MAINTENANCE_CENTER`, `STAGING_POINT`) kèm sức chứa tối đa.
   - Sử dụng nút **Phân bổ xe hàng loạt** để gán các xe `UNALLOCATED` vào đúng chi nhánh quản lý và kho hiện tại.
3. **Thiết lập điểm nhận trả xe (`/dashboard/locations`)**:
   - Khai báo showroom, điểm sân bay/nhà ga hoặc đối tác đã xác minh (`verified = true`), kèm hướng dẫn nhận/trả xe và phụ phí (nếu có).
4. **Cấu hình giá địa điểm & tuyến một chiều (`/dashboard/location-pricing`)**:
   - Thiết lập quy tắc giá riêng theo thứ tự ưu tiên (`VEHICLE_BRANCH` → `MODEL_BRANCH` → `BRANCH_DEFAULT` → `GLOBAL_DEFAULT`).
   - Mở các tuyến thuê một chiều `A → B` được phép, quy định phí một chiều, số ngày tối thiểu và tỷ lệ chia doanh thu.
5. **Tạo & phân quyền nhân viên (`/dashboard/staff`)**:
   - Chọn vai trò chuẩn (`BRANCH_MANAGER`, `RENTAL_STAFF`, `WAREHOUSE_STAFF`, `DELIVERY_STAFF`, `ACCOUNTANT`) và tích chọn 1 hoặc nhiều chi nhánh phụ trách.
   - Khi nhân viên nghỉ việc, nhấn **Thu hồi quyền** — tài khoản bị chặn truy cập ngay lập tức ở mọi API.

---

## 2. Quy trình vận hành hàng ngày

### A. Xử lý đơn thuê cùng chi nhánh và đơn một chiều

- Nhân viên chi nhánh nhận chỉ thấy đơn thuộc phạm vi chi nhánh mình trong `/dashboard/bookings`.
- Với đơn một chiều `A → B`: Chi nhánh A thực hiện bàn giao (`ONGOING`), Chi nhánh B tiếp nhận xe trả (`INSPECTING` → `COMPLETED`) kèm cập nhật `actualReturnBranch`, `actualReturnWarehouse`, `returnOdometer`, `returnInspectionStatus`.
- Nếu khách trả xe trễ, hư hỏng hoặc khác chi nhánh dự kiến gây xung đột đơn kế tiếp, hệ thống tự động hiển thị cảnh báo trong `scheduleConflictAlert` và tại `/dashboard/branch-reports`.

### B. Điều chuyển xe giữa các chi nhánh (`/dashboard/transfers`)

1. Nhân viên kho tạo phiếu điều chuyển (xe nguồn → kho đích, ngày đi/đến, chi phí nội bộ).
2. Quản lý chi nhánh hoặc Admin **Phê duyệt** → hệ thống tự động khóa lịch xe trên toàn hệ thống.
3. Chi nhánh nguồn xác nhận **Xuất kho điều chuyển** (`IN_TRANSIT`) → xe biến mất khỏi tồn kho sẵn sàng ở cả 2 đầu.
4. Chi nhánh đích xác nhận **Đã đến kho đích** (`ARRIVED`), kiểm tra thực tế và ODO, sau đó nhấn **Hoàn tất nhập kho đích** (`COMPLETED`) → vị trí xe chuyển sang kho đích và sẵn sàng nhận đơn mới.

### C. Điều phối giao nhận tận nơi (`/dashboard/deliveries`)

1. Khai báo khu vực phục vụ và biểu phí cố định tại tab **Khu vực & Biểu phí giao**.
2. Tạo nhiệm vụ giao (`DELIVERY`) hoặc thu hồi (`PICKUP`) gắn với đơn thuê và phân công nhân viên giao nhận (hệ thống tự chặn trùng khung giờ nhân viên).
3. Nhân viên giao nhận cập nhật tiến độ `ASSIGNED → EN_ROUTE → ARRIVED → COMPLETED` (hoặc `FAILED` kèm lý do cụ thể; trạng thái thất bại không bao giờ tự chuyển đơn sang đang thuê).

### D. Theo dõi báo cáo & xuất CSV (`/dashboard/branch-reports`)

- Lọc theo chi nhánh, dòng xe và khoảng ngày.
- Xuất CSV theo phạm vi chi nhánh được phân công bằng nút **Xuất CSV chi nhánh**.
