# NORI Vehicle Rental — Module 3.7: Multi-Branch & Multi-Location Management

## 1. Tổng quan kiến trúc

Module 3.7 (`v2.7.0`) nâng cấp NORI Vehicle Rental từ mô hình một địa điểm sang hệ thống quản trị đa chi nhánh, đa kho phương tiện, đa điểm nhận/trả xe, điều chuyển nội bộ, giao nhận tận nơi và định giá theo địa điểm — chạy tập trung trên cùng nền tảng **Next.js 16 App Router + React 19 + Payload CMS 4.0 + SQLite (`nori.db`)**.

### Nguyên tắc thiết kế cốt lõi

1. **Một phương tiện = Một định danh duy nhất (`vehicles.id`)**: Tuyệt đối không nhân bản bản ghi phương tiện theo chi nhánh. Hệ thống tách biệt rõ `managingBranch` (chi nhánh quản lý tài sản), `currentBranch` / `currentWarehouse` (vị trí vật lý hiện tại) và `nextExpectedBranch` (vị trí dự kiến tiếp theo).
2. **Động cơ khả dụng theo dòng thời gian (P0 Vehicle Location Timeline Engine)**: Một xe chỉ khả dụng cho đơn `[startDate, endDate)` tại chi nhánh nhận `A` và trả tại `B` khi:
   - Không trùng `bookings` đang giữ lịch, `maintenance-schedules`, `vehicle-transfers` hoặc khóa toàn cục `rental-days`.
   - Chi nhánh nhận `A` và chi nhánh trả `B` đều ở trạng thái `ACTIVE`.
   - Tuyến một chiều `A → B` (nếu `A ≠ B`) được cho phép trong `one-way-rental-rules` và đáp ứng `minRentalDays`.
   - Vị trí vật lý dự kiến của xe vào `startDate` khớp `A`, và vị trí trả `B` vào `endDate` không làm đứt gãy điểm nhận của đơn thuê kế tiếp (nếu chưa có phiếu điều chuyển trung gian).
3. **Không cộng trùng doanh thu & Tách biệt tài sản ký quỹ**: Doanh thu đơn thuê một chiều được phân bổ chính xác theo tỷ lệ `revenueSplitPickupPercent` (mặc định `100%` chi nhánh nhận, hoặc `50/50`, `0/100`, tỷ lệ tùy chỉnh), bảo đảm $\sum \text{Doanh thu chi nhánh} = \text{Tổng toàn hệ thống}$. Tiền cọc tài sản (`SECURITY_DEPOSIT`) và chi phí điều chuyển nội bộ (`transferCost`) tách biệt hoàn toàn.
4. **Không giả mạo dữ liệu thật**: Các phương tiện minh họa hiện có giữ `allocationStatus = 'UNALLOCATED'` cho đến khi quản trị viên chủ động gán vào chi nhánh/kho thực tế bằng công cụ phân bổ hàng loạt.

---

## 2. Use Case Diagram

```mermaid
flowchart LR
  Customer["Khách hàng"]
  BranchMgr["Quản lý chi nhánh"]
  Staff["Nhân viên Thuê / Kho / Giao nhận"]
  SuperAdmin["Super Admin / System Admin"]

  UC1["Tìm & lọc xe khả dụng theo chi nhánh"]
  UC2["Đặt thuê cùng chi nhánh / một chiều A → B"]
  UC3["Đặt giao / thu hồi xe tận nơi theo khu vực"]
  UC4["Quản lý Chi nhánh, Kho & Điểm giao nhận"]
  UC5["Phân bổ xe & Điều chuyển xe A → B"]
  UC6["Điều phối nhiệm vụ giao nhận tận nơi"]
  UC7["Cấu hình Giá theo địa điểm & Tuyến một chiều"]
  UC8["Quản lý Nhân viên & Phân quyền theo chi nhánh"]
  UC9["Xem & Xuất Báo cáo đa chi nhánh"]

  Customer --> UC1
  Customer --> UC2
  Customer --> UC3
  Staff --> UC5
  Staff --> UC6
  BranchMgr --> UC4
  BranchMgr --> UC5
  BranchMgr --> UC6
  BranchMgr --> UC7
  BranchMgr --> UC8
  BranchMgr --> UC9
  SuperAdmin --> UC4
  SuperAdmin --> UC5
  SuperAdmin --> UC6
  SuperAdmin --> UC7
  SuperAdmin --> UC8
  SuperAdmin --> UC9
```

---

## 3. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
  BRANCHES ||--o{ WAREHOUSES : "quản lý"
  BRANCHES ||--o{ SERVICE_LOCATIONS : "phụ trách"
  BRANCHES ||--o{ DELIVERY_ZONES : "phục vụ"
  BRANCHES ||--o{ BRANCH_STAFF : "phân công"
  ADMINS ||--o{ BRANCH_STAFF : "thuộc"
  BRANCHES ||--o{ VEHICLES : "managing / current"
  WAREHOUSES ||--o{ VEHICLES : "currentWarehouse"
  VEHICLES ||--o{ BOOKINGS : "đơn thuê"
  VEHICLES ||--o{ RENTAL_DAYS : "khóa ngày toàn cục"
  VEHICLES ||--o{ VEHICLE_TRANSFERS : "điều chuyển"
  VEHICLES ||--o{ VEHICLE_LOCATION_HISTORY : "lịch sử vị trí"
  BOOKINGS ||--o{ DELIVERY_JOBS : "giao / thu hồi tận nơi"
  BRANCHES ||--o{ LOCATION_PRICING_RULES : "áp dụng giá"
  BRANCHES ||--o{ ONE_WAY_RENTAL_RULES : "tuyến A -> B"
```

---

## 4. Booking Multi-Location & One-Way Sequence Diagram

```mermaid
sequenceDiagram
  actor C as "Khách hàng"
  participant UI as "Checkout / Catalogue UI"
  participant API as "NORI API (/availability, /bookings)"
  participant SVC as "multi-branch-service.ts"
  participant DB as "SQLite (nori.db)"

  C->>UI: Chọn chi nhánh nhận A, trả B, ngày thuê, giao tận nơi
  UI->>API: GET /nori-api/availability?vehicle&startDate&endDate&pickupBranchId&returnBranchId
  API->>SVC: evaluateVehicleBookingAvailabilityAndPricing()
  SVC->>DB: Đọc branches, bookings, transfers, maintenance, rental_days, pricing_rules, one_way_rules
  SVC-->>API: { available, quote, pricingRuleSnapshot, reasonCode }
  API-->>UI: Hiển thị báo giá chi tiết (phí một chiều, phụ phí địa điểm, phí giao)
  C->>UI: Nhấn "Xác nhận đặt thuê" (kèm idempotencyKey)
  UI->>API: POST /nori-api/bookings
  API->>DB: Transaction + UNIQUE(rental_days.key) + lưu pricingRuleSnapshot
  DB-->>API: Booking PENDING (rev=1)
  API-->>UI: 201 Created (hoặc 200 nếu trùng idempotencyKey)
```

---

## 5. Các route & API mới

| Admin Dashboard Route         | API Endpoint                           | Collection chính                                                        |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `/dashboard/branches`         | `/nori-api/dashboard/branches`         | `branches`                                                              |
| `/dashboard/warehouses`       | `/nori-api/dashboard/warehouses`       | `warehouses`, `vehicles`                                                |
| `/dashboard/locations`        | `/nori-api/dashboard/locations`        | `service-locations`                                                     |
| `/dashboard/staff`            | `/nori-api/dashboard/staff`            | `admins`, `branch-staff`                                                |
| `/dashboard/transfers`        | `/nori-api/dashboard/transfers`        | `vehicle-transfers`, `rental-days`, `vehicle-location-history`          |
| `/dashboard/deliveries`       | `/nori-api/dashboard/deliveries`       | `delivery-zones`, `delivery-jobs`                                       |
| `/dashboard/location-pricing` | `/nori-api/dashboard/location-pricing` | `location-pricing-rules`, `one-way-rental-rules`                        |
| `/dashboard/branch-reports`   | `/nori-api/dashboard/branch-reports`   | Báo cáo tổng hợp + CSV `/nori-api/dashboard/export?type=branch-reports` |
| _(Public)_                    | `/nori-api/locations`                  | Chi nhánh, điểm xác minh, khu vực giao, tuyến 1 chiều đang `ACTIVE`     |
