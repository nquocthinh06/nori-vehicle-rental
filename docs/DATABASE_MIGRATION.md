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
# 1. Luôn sao lưu toàn bộ DB + media trước khi migrate
pnpm db:backup

# 2. Chạy migration additive-only (idempotent)
pnpm db:migrate

# 3. Nếu cần khôi phục về bản backup trước đó
pnpm db:restore
```
