# SỔ TAY PHẢN ỨNG NHANH: SAO LƯU & HOÀN TÁC (BACKUP & ROLLBACK RUNBOOK) — NORI

> **Mục đích**: Tài liệu tra cứu nhanh (Quick-Reference Runbook) dành cho kỹ sư trực vận hành khi cần **sao lưu trước nâng cấp/migration**, **hoàn tác một đợt Smart Vehicle Import**, **hoàn tác đồng bộ Catalogue**, hoặc **khôi phục khẩn cấp SQLite / PostgreSQL**.

---

## 1. Bảng Tra cứu Nhanh Tình huống → Lệnh Hành động

| Tình huống khẩn cấp | Công cụ / Lệnh ưu tiên | Thời gian xử lý | Dữ liệu được bảo toàn |
| :--- | :--- | :---: | :--- |
| **Nhập sai / Ghi đè nhầm một dòng xe qua Smart Vehicle Import** | Dashboard nút **Rollback** hoặc `POST /nori-api/dashboard/catalogue-import/jobs/[id]/rollback` | **< 5 giây** | Phục hồi nguyên trạng `VehicleModels` từ `rollbackSnapshot`; không chạm `Vehicles` / `Bookings` |
| **Đồng bộ nhầm `catalogue:import` / `data:import` trên SQLite** | `pnpm restore --source <preImportBackupId>` | **< 15 giây** | Toàn bộ `nori.db` + `media/` quay về trạng thái ngay trước lúc import |
| **Chuẩn bị chạy Migration SQLite mới** | `pnpm db:migrate:safe` (hoặc `pnpm backup` trước) | **< 10 giây** | Tự động backup trước khi chạy `runDatabaseMigration()`, tự rollback nếu lỗi |
| **Chuẩn bị chạy Migration PostgreSQL (Neon)** | `pnpm db:backup` + `pnpm db:pg:audit` trước khi chạy `pnpm db:pg:migrate` | **1 – 3 phút** | Có sẵn bản `.pgdump.enc` + kiểm tra parity trước khi thay đổi schema |
| **Lỗi dữ liệu nghiêm trọng trên Neon Production** | Xem chi tiết [docs/DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) (Kịch bản S3 / S4) | **15 – 90 phút** | Phục hồi qua Neon PITR hoặc `pnpm db:restore` + reset 42+ sequences |

---

## 2. Quy trình Sao lưu Bắt buộc Trước Mọi Migration (Pre-Migration Checklist)

### 2.1. Với SQLite (`nori.db`)
```bash
# Bước 1: Kiểm tra trạng thái schema hiện tại
pnpm db:check

# Bước 2: Tạo bản sao lưu nhất quán trước migration (hoặc dùng db:migrate:safe làm gộp)
pnpm backup

# Bước 3: Thực thi migration an toàn (tự động tạo pre-migrate backup & rollback nếu lỗi)
pnpm db:migrate:safe
```

### 2.2. Với PostgreSQL (`Neon` / `Local PG18`)
```powershell
# Bước 1: Kiểm tra trạng thái replica & migration parity
pnpm db:sync:status
pnpm db:sync:check
pnpm db:pg:audit

# Bước 2: Tạo bản sao lưu mã hóa AES-256-GCM và kiểm chứng tức thì
pnpm db:backup
pnpm db:backup:verify

# Bước 3: Áp dụng migration PostgreSQL (trên nori_replica / nori_development trước, rồi Neon)
pnpm db:pg:migrate
```

---

## 3. Quy trình Hoàn tác Smart Vehicle Import (`rollbackSnapshot`)

Mỗi khi Admin nhấn **Approve & Save** một Import Job, backend (`import-service.ts`) chụp toàn bộ trạng thái trước đó của bản ghi `VehicleModels` (gồm `name`, `officialName`, `specifications`, `features`, `gallery`, `variants`, `cover`, `lockedFields`, `revisionNumber`...) vào trường `rollbackSnapshot` của bảng `vehicle_import_jobs`.

### Các bước thực hiện Rollback:
1. Đăng nhập trang quản trị NORI (`/dashboard`), mở lịch sử **Smart Vehicle Import Jobs**.
2. Xác định `jobCode` của đợt import gây lỗi (trạng thái `COMPLETED` hoặc `PARTIAL_SUCCESS`).
3. Nhấn **Hoàn tác (Rollback)** (hoặc gọi API `POST /nori-api/dashboard/catalogue-import/jobs/[id]/rollback` kèm header `Origin` hợp lệ).
4. Hệ thống thực hiện nguyên tử:
   - Đọc `rollbackSnapshot` từ `vehicle-import-jobs`.
   - Khôi phục bản ghi `vehicle-models` tương ứng về đúng phiên bản trước import (hoặc đánh dấu vô hiệu/ẩn nếu trước đó là bản tạo mới hoàn toàn).
   - Gọi `invalidateNoriCaches({ slugs: [slug], allDetails: true })` để xóa cache trang `/vehicles/[slug]`.
   - Ghi nhận sự kiện `vehicle-model.import_rollback` vào `audit_logs`.
5. **Xác nhận sau Rollback**: Mở lại trang công khai `/vehicles/[slug]` và kiểm tra thông số, giá tham khảo, ảnh đại diện đã trở lại bình thường.

---

## 4. Quy trình Hoàn tác Đồng bộ Catalogue (`pnpm catalogue:import` / `data:sync`)

Mỗi lệnh `pnpm catalogue:import` hoặc `pnpm data:import` đều tự động tạo một bản sao lưu trước khi ghi (`preImportBackupId`) trong thư mục `backups/`.

1. **Dừng ngay các thao tác ghi khác** trên môi trường cục bộ.
2. **Xem danh sách bản sao lưu gần nhất**:
   ```powershell
   ls backups | Sort-Object LastWriteTime -Descending | Select-Object -First 5
   ```
3. **Khôi phục về bản trước import**:
   ```powershell
   pnpm restore --source backups/<pre-import-backup-folder>
   ```
4. **Kiểm tra lại toàn vẹn sau khôi phục**:
   ```powershell
   pnpm db:check
   pnpm media:audit
   pnpm catalogue:status
   ```

---

## 5. Khôi phục Kiểm chứng Cô lập Cho PostgreSQL (Không chạm Production)

Khi cần xác minh nội dung một bản backup mã hóa trước khi quyết định khôi phục chính thức:

```powershell
# 1. Kiểm tra giải mã, auth tag AES-256-GCM, SHA-256 và danh sách object pg_restore
pnpm db:backup:verify --backup <path-to-backup-dir>

# 2. Khôi phục vào database tạm cô lập trên Local PG 18
pnpm db:restore --backup <path-to-backup-dir> --target "<LOCAL_RESTORE_VERIFY_URL>"

# 3. Kiểm tra parity và reset sequence
pnpm db:sync:check --replica "<LOCAL_RESTORE_VERIFY_URL>"
```

> **Cảnh báo**: Tuyệt đối không trỏ `--target` về Neon Production (và không truyền `--confirm-production`) trừ khi đang thực hiện Kịch bản S3 trong [docs/DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) đã có phê duyệt thủ công.
