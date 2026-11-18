# HƯỚNG DẪN SAO LƯU & KHÔI PHỤC (BACKUP & RESTORE) — NORI VEHICLE RENTAL

## 1. Kiến trúc Sao lưu Nhất quán (Consistent Backup Bundle)

Cơ chế sao lưu của NORI (`src/lib/data-sync.ts` → `createFullBackup`) đảm bảo tính nhất quán đồng thời giữa **Cơ sở dữ liệu SQLite (`nori.db`)** và **Tệp hình ảnh (`media/`)**:

1. **Sao lưu SQLite an toàn khi đang có giao dịch (`VACUUM INTO`)**:
   - Không dùng lệnh copy file thô khi database đang mở chế độ WAL.
   - Sử dụng câu lệnh `VACUUM INTO` của SQLite để tạo một tệp cơ sở dữ liệu độc lập, nhất quán về mặt giao dịch (transactional consistency).
2. **Kiểm tra toàn vẹn tức thì**:
   - Chạy `PRAGMA integrity_check` và `PRAGMA foreign_key_check` ngay trên tệp sao lưu vừa tạo.
   - Tính mã băm `SHA-256` (`dbSha256`) của tệp cơ sở dữ liệu.
3. **Sao lưu toàn bộ tệp hình ảnh tham chiếu (`media/`)**:
   - Sao chép tất cả tệp ảnh đang được tham chiếu trong bảng `media` vào `backups/nori-backup-<timestamp>/media/` kèm mã băm `SHA-256` cho từng tệp.
4. **Metadata xác minh (`backup-manifest.json`)**:
   - Lưu `backupId`, `createdAt`, `gitCommit` (commit SHA hiện tại), `schemaVersion`, `migrations`, `recordCounts` (số lượng bản ghi các bảng) và danh sách `mediaFiles`.

---

## 2. Cấu trúc Thư mục Bản sao lưu

Mỗi lần chạy sao lưu sẽ tạo ra tại thư mục `backups/` (được loại trừ khỏi Git qua `.gitignore`):

```text
backups/
  nori-backup-2026-11-18T16-00-00-000Z.db                # File SQLite tương thích ngược
  nori-backup-2026-11-18T16-00-00-000Z/                  # Gói Backup Bundle đầy đủ
    nori.db                                              # Cơ sở dữ liệu SQLite đã VACUUM
    backup-manifest.json                                 # Metadata, SHA-256 checksum & counts
    media/                                               # Toàn bộ tệp hình ảnh tại thời điểm backup
```

---

## 3. Cách Thực hiện Sao lưu (Backup)

### Cách 1: Qua Dòng lệnh CLI

```bash
# Tạo bản sao lưu đầy đủ (Database + Media + Manifest)
npm run data:backup

# Hoặc lệnh tương đương
npm run db:backup

# Sao lưu từ một file DB chỉ định sang thư mục tùy chọn
node scripts/data-backup.ts --db ./nori.db --out-dir ./backups
```

### Cách 2: Qua Giao diện Quản trị (`/dashboard/system`)

1. Đăng nhập với quyền `SUPER_ADMIN` (hoặc nhân viên có quyền cấu hình hệ thống).
2. Truy cập **Quản trị hệ thống → Hệ thống → Đồng bộ & Sao lưu dữ liệu** (`/dashboard/system`).
3. Nhấn nút **Tạo Backup ngay**.
4. Bản sao lưu mới xuất hiện ngay trong bảng **Danh sách Bản sao lưu (Database & Media)** và được ghi vết vào `audit_logs` (`action: data.backup`).

---

## 4. Cách Khôi phục Dữ liệu (Restore)

### Khi nào cần Restore?

- Cơ sở dữ liệu bị lỗi hoặc thao tác nhầm từ Admin.
- Tệp hình ảnh trong `media/` bị xóa nhầm hoặc thất lạc.
- Quá trình nâng cấp hoặc thử nghiệm tính năng gặp sự cố.
- Di chuyển hệ thống sang máy chủ mới.

### Cách 1: Khôi phục qua Dòng lệnh CLI

```bash
# Khôi phục từ bản sao lưu mới nhất trong thư mục backups/
npm run data:restore

# Khôi phục từ một mã bản sao lưu cụ thể
node scripts/data-restore.ts --source nori-backup-2026-11-18T16-00-00-000Z

# Khôi phục vào một môi trường cô lập để kiểm thử trước khi áp dụng thật
node scripts/data-restore.ts --source nori-backup-2026-11-18T16-00-00-000Z --target ./nori-verify-restore.db --media ./media-verify
```

### Cách 2: Khôi phục qua Giao diện Quản trị (`/dashboard/system`)

1. Đăng nhập tài khoản `SUPER_ADMIN`.
2. Mở `/dashboard/system`, tìm đến bảng **Danh sách Bản sao lưu**.
3. Nhấn **Khôi phục** tại phiên bản mong muốn và xác nhận trong hộp thoại cảnh báo.

### Quy trình An toàn Tự động khi Restore:

1. Kiểm tra `SHA-256 checksum` và `PRAGMA integrity_check` của bản sao lưu nguồn trước khi chạm vào dữ liệu đích. Nếu bản sao lưu nguồn bị hỏng, quá trình Restore dừng ngay lập tức.
2. Tự động tạo một bản sao lưu dự phòng (`preRestoreBackupId`) của database hiện tại trước khi ghi đè.
3. Dọn dẹp các tệp journal tạm (`-wal`, `-shm`, `-journal`) để tránh xung đột trang nhớ SQLite.
4. Khôi phục tệp `nori.db` và toàn bộ tệp hình ảnh trong `media/`.
5. Kiểm tra lại `PRAGMA integrity_check = ok` sau khi khôi phục, xóa cache Next.js (`invalidateNoriCaches`) và ghi nhật ký `data.restore` vào `audit_logs`.
