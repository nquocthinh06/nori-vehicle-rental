# NORI Vehicle Rental — Multi-Branch Data Sync & Team Persistence Guide

## 1. Quy tắc đồng bộ dữ liệu nhóm (Git & Local SQLite)

Dự án tiếp tục giữ nguyên cơ chế đồng bộ không commit `nori.db` lên Git:

- **`nori.db` luôn nằm trong `.gitignore`** — mỗi thành viên vận hành database SQLite cục bộ độc lập, bền vững qua mọi lần restart server.
- **Schema & Migration đi theo mã nguồn Git**: Khi thành viên khác `git pull`, chỉ cần chạy:
  ```bash
  pnpm install
  pnpm db:migrate
  ```
  `runDatabaseMigration()` trong `src/lib/data-sync.ts` tự động áp dụng cả migration thanh toán (`20261120_010000`) và migration đa chi nhánh (`20261120_020000`) lên DB cục bộ mà không mất bất kỳ bản ghi cũ nào.

---

## 2. Phân loại dữ liệu được đồng bộ và dữ liệu bị chặn tuyệt đối

| Nhóm dữ liệu                                                                      | Trạng thái Snapshot                                   | Lý do                                                                                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dòng xe, mẫu xe catalogue, cài đặt trang, bài viết, khuyến mãi, media manifest    | **Allowlist**                                         | Dữ liệu dùng chung để phát triển UI & kiểm thử                                                                                    |
| `admins`, `users`, `bookings`, `rental-days`, `payments`, `audit-logs`, `reviews` | **Chặn tuyệt đối (`EXCLUDED_SENSITIVE_COLLECTIONS`)** | Chứa PII, mật khẩu hash, giao dịch & dữ liệu vận hành riêng                                                                       |
| `branch-staff`, `vehicle-transfers`, `vehicle-location-history`, `delivery-jobs`  | **Chặn tuyệt đối (`EXCLUDED_SENSITIVE_COLLECTIONS`)** | Chứa phân quyền nhân sự thật, địa chỉ nhà riêng khách hàng (`deliveryAddress`, `pickupAddress`, `contactPhone`) và luồng vận hành |

Mọi lệnh `pnpm data:export` và `pnpm data:validate` tự động quét `FORBIDDEN_FIELD_NAMES` và từ chối ngay lập tức nếu phát hiện trường nhạy cảm hoặc địa chỉ giao nhận cá nhân lọt vào snapshot.

---

## 3. Lưu ý triển khai thực tế

- Các phương tiện demo hiện có không tự động gán vào chi nhánh bịa đặt — giữ nguyên `allocationStatus = 'UNALLOCATED'`.
- Khi thiết lập môi trường vận hành thực tế hoặc môi trường kiểm thử cục bộ, quản trị viên tạo chi nhánh, kho xe và phân bổ xe tại `/dashboard/branches` và `/dashboard/warehouses`.
- Sao lưu định kỳ bằng `pnpm db:backup` (tạo cả file `.db` độc lập lẫn bundle kèm `backup-manifest.json` + SHA-256 + thư mục `media/`).
