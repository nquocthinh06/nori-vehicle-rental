# NORI Vehicle Rental — Branch RBAC Matrix (Ma trận phân quyền đa chi nhánh)

## 1. Nguyên tắc kiến trúc bảo mật

- **Tách biệt danh tính**: Không trộn lẫn `admins` (nhân viên & quản trị) và `users` (khách hàng). Khách hàng tuyệt đối không thể truy cập `/nori-api/dashboard/*`.
- **Kiểm tra đa tầng (Defense in Depth)**: Mọi quyền đều được xác thực đồng thời tại:
  1. **Payload Collection Access** (`src/access/nori.ts`: `adminBranchPermission`, `branchScopedWhere`).
  2. **API Route Handlers** (`requireAdmin({ permission, branchId })` + `assertBranchScopeOrFail()`).
  3. **Domain Service** (`createVehicleTransferAtomic`, `transitionVehicleTransferAtomic`, `canManageStaffAssignment`).
  4. **Frontend UI** (`AdminShell` ẩn menu không thuộc quyền — chỉ là lớp trải nghiệm, không thay thế backend).
- **Thu hồi quyền tức thời (RB-05)**: Khi `accountStatus = 'REVOKED'` hoặc `'SUSPENDED'`, `isAdminAccountActive()` và `requireAdmin()` trả về `403 ACCOUNT_REVOKED` ngay lập tức ở mọi request tiếp theo.
- **Chống leo thang đặc quyền (RB-03, RB-04)**:
  - Không ai được tự sửa `adminRole`, `staffTitle`, `branchScopeMode` hay `assignedBranchIds` của chính mình.
  - `BRANCH_MANAGER` tuyệt đối không được tạo `SUPER_ADMIN`, `SYSTEM_ADMIN`, không được cấp `branchScopeMode = 'ALL'`, và chỉ được phân công nhân viên thuộc đúng danh sách chi nhánh mình quản lý.

---

## 2. Ma trận Vai trò × Phạm vi Chi nhánh

| Vai trò (`staffTitle`)                  | `adminRole`   | Phạm vi chi nhánh               | Chi nhánh          | Kho xe          | Điểm giao nhận       | Nhân sự CN               | Đơn thuê         | Điều chuyển         | Giao tận nơi           | Giá & 1 chiều   | Thanh toán      | Báo cáo & CSV |
| --------------------------------------- | ------------- | ------------------------------- | ------------------ | --------------- | -------------------- | ------------------------ | ---------------- | ------------------- | ---------------------- | --------------- | --------------- | ------------- |
| **Super Admin** (`SUPER_ADMIN`)         | `SUPER_ADMIN` | Toàn hệ thống (`ALL`)           | CRUD               | CRUD            | CRUD                 | CRUD                     | CRUD             | CRUD                | CRUD                   | CRUD            | CRUD            | Toàn hệ thống |
| **System Admin** (`SYSTEM_ADMIN`)       | `OPERATOR`    | Toàn hệ thống (`ALL`)           | R/C/U              | R/C/U           | R/C/U                | R/C/U                    | R/U              | R/C/U               | R/C/U                  | R/C/U           | R/C/U           | Toàn hệ thống |
| **Branch Manager** (`BRANCH_MANAGER`)   | `OPERATOR`    | Chi nhánh được gán (`ASSIGNED`) | R/U (CN mình)      | R/C/U (CN mình) | R/C/U (CN mình)      | R/C/U (cấp dưới CN mình) | R/U (CN mình)    | R/C/U + Duyệt       | R/C/U (CN mình)        | R/C/U (CN mình) | R/C/U (CN mình) | Chỉ CN mình   |
| **Rental Staff** (`RENTAL_STAFF`)       | `OPERATOR`    | Chi nhánh được gán              | R                  | R               | R                    | —                        | R/U (CN mình)    | R                   | R/C/U                  | R               | R/C             | —             |
| **Warehouse Staff** (`WAREHOUSE_STAFF`) | `OPERATOR`    | Chi nhánh được gán              | R                  | R/U             | R                    | —                        | R                | R/C/U (không duyệt) | R                      | —               | —               | —             |
| **Delivery Staff** (`DELIVERY_STAFF`)   | `OPERATOR`    | Chỉ nhiệm vụ được gán cho mình  | R                  | —               | R                    | —                        | —                | —                   | R/U (chỉ job của mình) | —               | —               | —             |
| **Accountant** (`ACCOUNTANT`)           | `OPERATOR`    | Chi nhánh được gán              | R                  | —               | —                    | —                        | R                | R                   | —                      | R               | R/C/U           | Chỉ CN mình   |
| **Customer** (`users`)                  | —             | Chỉ bản ghi của chính mình      | Công khai (ACTIVE) | —               | Công khai (Verified) | —                        | Chỉ đơn của mình | —                   | —                      | —               | Chỉ GD của mình | —             |

---

## 3. Kiểm soát chống IDOR & Rò rỉ dữ liệu liên chi nhánh

- Mọi tham số truy vấn `?branchId=...`, `?pickupBranchId=...`, `?returnBranchId=...` trên `/nori-api/dashboard/*` và `/nori-api/dashboard/export` đều qua `assertBranchScopeOrFail(admin, branchId)` — giả mạo `branchId` của chi nhánh khác luôn nhận `403 BRANCH_SCOPE_FORBIDDEN`.
- `DELIVERY_STAFF` chỉ nhìn thấy bản ghi trong `delivery-jobs` có `assignedStaff = req.user.id` — không xem được địa chỉ nhà riêng hay số điện thoại khách hàng của nhiệm vụ không được giao.
- Mọi thao tác tạo/sửa chi nhánh, kho xe, phân công/thu hồi nhân sự, điều chuyển và giao nhận thất bại đều ghi vào `audit_logs` kèm `actorEmail`, `actorRole`, `branchId`, `outcome`.
