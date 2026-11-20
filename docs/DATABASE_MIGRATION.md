# NORI Vehicle Rental — Database Migration Guide (Module 3.7)

## 1. Chiến lược nâng cấp Additive-Only (Không mất dữ liệu)

Migration `src/migrations/20261120_020000_multi_branch_management.ts` được thiết kế hoàn toàn theo nguyên tắc **additive-only** và **idempotent**:

- **Không** `DROP TABLE`, **không** reset `nori.db`, **không** xóa hay ghi đè bất kỳ bản ghi hiện có nào (`admins`, `users`, `vehicles`, `vehicle_models`, `bookings`, `rental_days`, `payments`, `promotions`, `media`, `audit_logs`).
- Chạy lặp lại `pnpm db:migrate` nhiều lần luôn an toàn (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, kiểm tra `PRAGMA table_info` trước khi `ALTER TABLE ADD COLUMN`).

---

## 2. Các bảng & cột bổ sung (`88 → 109` bảng)

### 10 Collection mới (+ `branches_gallery` + 10 bảng `*_rels` chuẩn Payload 4.0)

1. `branches` + `branches_gallery` + `branches_rels`
2. `warehouses` + `warehouses_rels`
3. `service_locations` + `service_locations_rels`
4. `branch_staff` + `branch_staff_rels`
5. `vehicle_transfers` + `vehicle_transfers_rels`
6. `vehicle_location_history` + `vehicle_location_history_rels`
7. `delivery_zones` + `delivery_zones_rels`
8. `delivery_jobs` + `delivery_jobs_rels`
9. `location_pricing_rules` + `location_pricing_rules_rels`
10. `one_way_rental_rules` + `one_way_rental_rules_rels`

### Cột bổ sung vào bảng hiện có

- `admins`: `staff_title`, `branch_scope_mode`, `assigned_branch_ids`, `account_status`, `phone`
- `vehicles`: `managing_branch_id`, `current_branch_id`, `current_warehouse_id`, `next_expected_branch_id`, `next_expected_location_note`, `allocation_status` (mặc định `'UNALLOCATED'` cho xe hiện có)
- `bookings`: `pickup_branch_id`, `return_branch_id`, `pickup_service_location_id`, `return_service_location_id`, `is_one_way`, `pickup_method`, `return_method`, `delivery_zone_id`, `delivery_address`, `pickup_address`, `delivery_contact_name`, `delivery_contact_phone`, `delivery_directions`, `location_surcharge_snapshot`, `one_way_fee_snapshot`, `pickup_fee_snapshot`, `after_hours_fee_snapshot`, `pricing_rule_snapshot`, `revenue_attribution_branch_id`, `revenue_split_pickup_percent`, `actual_return_branch_id`, `actual_return_warehouse_id`, `actual_return_at`, `return_fuel_or_battery`, `return_inspection_status`, `schedule_conflict_alert`, `idempotency_key`
- `rental_days`: `lock_type`, `reference_id`, `branch_id`
- `promotions`: `branch_scope`, `applicable_branch_ids`
- `payments`: `branch_id`
- `maintenance_schedules`: `branch_id`, `warehouse_id`
- `consultations`: `branch_id`
- `audit_logs`: `actor_role`, `branch_id`, `outcome`

### Composite & Lookup Indexes tối ưu hiệu năng

- `vehicles_branch_op_status_idx (current_branch_id, operation_status, status)`
- `vehicles_managing_branch_idx (managing_branch_id)`
- `vehicles_current_warehouse_idx (current_warehouse_id)`
- `warehouses_branch_status_idx (branch_id, status)`
- `bookings_vehicle_status_dates_idx (vehicle_id, status, start_date, end_date)`
- `bookings_pickup_branch_dates_idx (pickup_branch_id, status, start_date, end_date)`
- `bookings_return_branch_idx (return_branch_id)`
- `bookings_idempotency_key_idx (idempotency_key)`
- `location_pricing_rules_branch_active_idx (branch_id, active, scope_type)`
- `one_way_rental_rules_route_lookup_idx (from_branch_id, to_branch_id, active)`
- `vehicle_transfers_vehicle_status_dates_idx (vehicle_id, status, start_date, end_date)`
- `delivery_jobs_staff_date_status_idx (assigned_staff_id, scheduled_date, status)`

---

## 3. Quy trình thực thi & Rollback an toàn

```bash
# 1. Kiểm tra tính tương thích của SQLite Database và các migration đang chờ
pnpm db:check

# 2. Chạy migration an toàn (tự động tạo backup trước khi migrate)
pnpm db:migrate:safe

# 3. Hoặc chạy migration tiêu chuẩn qua data-sync
pnpm db:migrate

# 4. Nếu cần khôi phục về bản backup trước đó
pnpm db:restore
```

---

## 4. Migration 20261120_030000: Kế hoạch thanh toán Bookings (`payment_option` & `reservation_deposit_snapshot`)

### Ngữ cảnh & Nguyên nhân gốc (P0 Hotfix)

Khi người dùng truy cập trang "Đơn thuê của tôi" (`/my-bookings`) hoặc gọi API `/nori-api/bookings` & `/nori-api/notifications` (truy vấn kèm depth liên kết đến booking), Payload CMS yêu cầu ánh xạ hai trường thuộc tính trong `src/collections/Bookings.ts`:

- `paymentOption`: Kế hoạch thanh toán do khách hàng lựa chọn (`DEPOSIT` - Đặt cọc 30% giữ xe hoặc `FULL` - Thanh toán 100% tiền thuê).
- `reservationDepositSnapshot`: Số tiền đặt cọc giữ xe 30% được đóng băng tại thời điểm tạo đơn.

Nếu SQLite database chưa được nâng cấp, truy vấn ORM ném lỗi `SQLITE_ERROR: no such column: payment_option` và API trả về HTTP 503.

### Cấu trúc thay đổi (Batch 4)

- **File migration**: `src/migrations/20261120_030000_booking_payment_option_plans.ts`
- **Tích hợp đồng bộ**: Hàm `applyAdditiveBookingPaymentOptionSchema()` trong `src/lib/data-sync.ts` và cập nhật `data/seed/schema.sql`.
- **Cột bổ sung**:
  - `bookings.payment_option`: Kiểu `text`, mặc định `'DEPOSIT'`, `NOT NULL`.
  - `bookings.reservation_deposit_snapshot`: Kiểu `numeric`, mặc định `0`, `NOT NULL`.
- **Index bổ sung**:
  - `CREATE INDEX IF NOT EXISTS bookings_payment_option_idx ON bookings (payment_option);`
- **Chiến lược Backfill an toàn & Bảo toàn nghiệp vụ**:
  - Các đơn thuê cũ được backfill giá trị `payment_option = 'DEPOSIT'` và `reservation_deposit_snapshot = 0` (nếu null).
  - Không thay đổi số tiền thực thu, không tự suy đoán thay đổi trạng thái thanh toán (`PAYMENT_STATUS`) của đơn cũ, không thay đổi số tiền ký quỹ tài sản.
- **Tính lũy kế & Bất biến (Idempotent)**:
  - Kiểm tra `PRAGMA table_info(bookings)` trước khi `ALTER TABLE ADD COLUMN`.
  - Ghi nhận an toàn vào bảng `payload_migrations` với `batch = 4`. Rerun nhiều lần không gây lỗi trùng cột hay duplicate data.
