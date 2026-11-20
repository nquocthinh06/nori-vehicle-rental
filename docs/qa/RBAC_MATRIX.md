# NORI VEHICLE RENTAL — MA TRẬN PHÂN QUYỀN TRUY CẬP (RBAC & SECURITY MATRIX)

- **Ngày kiểm toán**: 2026-11-20
- **Phạm vi bảo vệ**: 2 vai trò khách hàng (`Guest`, `Customer`) và 8 vai trò chức danh quản trị (`Admins`) trên toàn bộ 21 phân hệ và API endpoints.

---

## 1. Danh sách Vai trò Người dùng trong Hệ thống

1. **Guest**: Khách truy cập vãng lai chưa đăng nhập.
2. **Customer (`users`)**: Khách hàng đã đăng ký tài khoản và có phiên làm việc hợp lệ.
3. **Quản trị viên (`admins`)**:
   - `SUPER_ADMIN`: Quản trị viên cấp cao nhất. Toàn quyền trên mọi chi nhánh, phân hệ, quản lý tài khoản admin và cấu hình hệ thống.
   - `SYSTEM_ADMIN`: Quản trị viên hệ thống kỹ thuật. Quản lý danh mục, đội xe, khách hàng, bảo trì.
   - `BRANCH_MANAGER`: Giám đốc / Trưởng chi nhánh. Quản lý toàn diện trong phạm vi chi nhánh được phân công (`ASSIGNED`). Không thể tự nâng quyền thành Super Admin.
   - `RENTAL_STAFF`: Nhân viên lễ tân / thủ tục thuê xe tại chi nhánh.
   - `WAREHOUSE_STAFF`: Nhân viên thủ kho, quản lý hiện trạng xe, lập lịch bảo dưỡng.
   - `DELIVERY_STAFF`: Nhân viên giao xe và thu hồi xe tận nơi theo nhiệm vụ được giao.
   - `ACCOUNTANT`: Kế toán viên. Quản lý dòng tiền, phiếu thu, tiền cọc, hoàn tiền, báo cáo doanh thu.
   - `OPERATOR`: Nhân viên điều phối tổng đài và lịch trình phương tiện.

---

## 2. Ma trận Phân quyền Truy cập Phân hệ Giao diện (Route Access Matrix)

| Tuyến đường (Route)           |   Guest    |   Customer    | Super Admin | System Admin | Branch Manager | Rental Staff | Warehouse Staff | Delivery Staff | Accountant | Operator |
| :---------------------------- | :--------: | :-----------: | :---------: | :----------: | :------------: | :----------: | :-------------: | :------------: | :--------: | :------: |
| `/`, `/vehicles`, `/posts`    |     ✅     |      ✅       |     ✅      |      ✅      |       ✅       |      ✅      |       ✅        |       ✅       |     ✅     |    ✅    |
| `/account`, `/checkout`       | ❌ (Login) |      ✅       |     ❌      |      ❌      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/my-bookings`                | ❌ (Login) | ✅ (Own data) |     ❌      |      ❌      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard` (Tổng quan)      |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   | ✅ Assigned  |   ✅ Assigned   |  ✅ Assigned   |   ✅ All   |  ✅ All  |
| `/dashboard/bookings`         |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   | ✅ Assigned  |     👁️ Xem      |     👁️ Xem     | ✅ Xem/Thu |  👁️ Xem  |
| `/dashboard/vehicles`         |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |    👁️ Xem    |   ✅ Assigned   |     👁️ Xem     |   👁️ Xem   |  👁️ Xem  |
| `/dashboard/models`           |     ❌     |      ❌       |     ✅      |      ✅      |     👁️ Xem     |    👁️ Xem    |     👁️ Xem      |       ❌       |     ❌     |  👁️ Xem  |
| `/dashboard/inquiries`        |     ❌     |      ❌       |     ✅      |      ✅      |  ✅ Assigned   | ✅ Assigned  |       ❌        |       ❌       |     ❌     |    ✅    |
| `/dashboard/customers`        |     ❌     |      ❌       |     ✅      |      ✅      |     👁️ Xem     |    👁️ Xem    |       ❌        |       ❌       |   👁️ Xem   |    ❌    |
| `/dashboard/maintenance`      |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |      ❌      |   ✅ Assigned   |       ❌       |   👁️ Xem   |  👁️ Xem  |
| `/dashboard/payments`         |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |    👁️ Xem    |       ❌        |       ❌       |   ✅ All   |    ❌    |
| `/dashboard/promotions`       |     ❌     |      ❌       |     ✅      |      ✅      |     👁️ Xem     |    👁️ Xem    |       ❌        |       ❌       |   👁️ Xem   |    ❌    |
| `/dashboard/content`          |     ❌     |      ❌       |     ✅      |      ✅      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard/posts`            |     ❌     |      ❌       |     ✅      |      ✅      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard/reports`          |     ❌     |      ❌       |   ✅ All    |    ✅ All    |       ❌       |      ❌      |       ❌        |       ❌       |   ✅ All   |    ❌    |
| `/dashboard/admins`           |     ❌     |      ❌       | ✅ Duy nhất |      ❌      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard/system`           |     ❌     |      ❌       |     ✅      |      ✅      |       ❌       |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard/branches`         |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  👁️ Assigned   |      ❌      |       ❌        |       ❌       |   👁️ All   |    ❌    |
| `/dashboard/warehouses`       |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |    👁️ Xem    |   ✅ Assigned   |       ❌       |     ❌     |  👁️ Xem  |
| `/dashboard/locations`        |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |    👁️ Xem    |       ❌        |     👁️ Xem     |     ❌     |  👁️ Xem  |
| `/dashboard/staff`            |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |      ❌      |       ❌        |       ❌       |     ❌     |    ❌    |
| `/dashboard/transfers`        |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |      ❌      |   ✅ Assigned   |       ❌       |     ❌     |  ✅ All  |
| `/dashboard/deliveries`       |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |    👁️ Xem    |       ❌        |  ✅ Assigned   |     ❌     |  👁️ Xem  |
| `/dashboard/location-pricing` |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  👁️ Assigned   |      ❌      |       ❌        |       ❌       |   👁️ All   |    ❌    |
| `/dashboard/branch-reports`   |     ❌     |      ❌       |   ✅ All    |    ✅ All    |  ✅ Assigned   |      ❌      |       ❌        |       ❌       |   ✅ All   |    ❌    |

---

## 3. Chốt chặn Bảo mật Phân quyền Phía Server (Server-Side RBAC Enforcement)

1. **Phòng chống Leo thang Đặc quyền (Privilege Escalation Guard)**:
   - Nhân viên `BRANCH_MANAGER` tuyệt đối không thể tạo mới hoặc cập nhật tài khoản thành `SUPER_ADMIN` hoặc `SYSTEM_ADMIN`.
   - Nhân viên không phải quản lý không thể tự cấp quyền hoặc tạo thêm tài khoản quản trị.
2. **Cách ly Dữ liệu Chi nhánh (Branch Scope Isolation & Anti-IDOR)**:
   - Quản trị viên thuộc chế độ `ASSIGNED` gửi request truy vấn dữ liệu thuộc chi nhánh khác sẽ nhận ngay lỗi `403 BRANCH_SCOPE_FORBIDDEN`.
   - Khách hàng Customer A gửi request truy vấn đơn thuê hoặc thông tin của Customer B sẽ nhận ngay lỗi `403 IDOR_FORBIDDEN` hoặc `404 NOT_FOUND`.
3. **Thu hồi Quyền Tức thì (Instant Permission Revocation)**:
   - Khi tài khoản quản trị bị chuyển trạng thái sang `accountStatus = 'REVOKED'`, middleware và token verification lập tức từ chối mọi API request tiếp theo (`403 ACCOUNT_REVOKED`), vô hiệu hóa hoàn toàn token JWT cũ đang lưu tại client.
4. **Bảo vệ Thao tác Nhạy cảm (Sensitive Action Guards)**:
   - Xóa xe có lịch sử đơn: Chặn cứng `409 CANNOT_DELETE_ACTIVE_VEHICLE`.
   - Hoàn tiền (`/nori-api/dashboard/payments/refund`): Chỉ `SUPER_ADMIN` hoặc `ACCOUNTANT` mới có thẩm quyền thực thi.
   - Xuất dữ liệu CSV: Chống CSV Formula Injection bằng cơ chế chuẩn hóa prefix nháy đơn `'` trên các ký tự nguy hiểm (`=`, `+`, `-`, `@`, `\t`, `\r`).
