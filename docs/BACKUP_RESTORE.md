# NORI Vehicle Rental — Cẩm Nang Sao Lưu & Khôi Phục Dữ Liệu (Backup & Restore)

Tài liệu cung cấp hướng dẫn toàn diện về cơ chế sao lưu, kiểm tra tính toàn vẹn và khôi phục cơ sở dữ liệu SQLite cùng tệp hình ảnh trong hệ thống NORI.

---

## 1. Cơ Chế Sao Lưu Nhất Quán Giao Dịch (`VACUUM INTO`)

Khác với việc sao chép file thông thường có thể gây hỏng cơ sở dữ liệu khi hệ thống đang ghi (do SQLite chạy ở chế độ WAL), NORI sử dụng cơ chế sao lưu an toàn tuyệt đối:

1. **`VACUUM INTO`**: SQLite tạo ra một tệp cơ sở dữ liệu độc lập, sạch sẽ, hoàn toàn nhất quán về mặt giao dịch ngay cả khi các luồng khác đang đọc/ghi.
2. **Kiểm tra Toàn vẹn Tức thì (Integrity Check)**:
   - Tự động chạy `PRAGMA integrity_check` và `PRAGMA foreign_key_check` trên tệp sao lưu vừa tạo.
   - Tính toán mã băm SHA-256 (`dbSha256`) để chống giả mạo hoặc hư hại phần cứng.
3. **Đồng Bộ Tệp Hình Ảnh (`media/`)**:
   - Sao chép toàn bộ tệp hình ảnh tải lên vào thư mục sao lưu tương ứng.
4. **Tệp Manifest Xác Thực (`backup-manifest.json`)**:
   - Lưu trữ số lượng bản ghi các bảng, thời gian tạo, git commit SHA hiện tại và danh sách checksum của toàn bộ tệp ảnh.
5. **Tự Động Dọn Dẹp Bản Cũ (Retention Policy)**:
   - Script hỗ trợ cờ `--keep <số lượng>` (mặc định giữ lại 14 bản sao lưu gần nhất) để tránh làm đầy ổ cứng.

---

## 2. Các Lệnh Sao Lưu (Backup Commands)

### 2.1. Sao Lưu Qua Dòng Lệnh pnpm
```bash
# Tạo bản sao lưu đầy đủ (mặc định giữ lại 14 bản gần nhất)
pnpm backup

# Tạo bản sao lưu và tùy chỉnh số lượng lưu trữ (ví dụ giữ 30 bản)
pnpm backup --keep 30
```

### 2.2. Sao Lưu Tự Động Theo Lịch Trình (Scheduled Backup)
- **Trên Windows Home Server**:
  Sử dụng Windows Task Scheduler để chạy script `deploy\windows\backup.ps1` hàng ngày lúc 02:00 sáng.
- **Trên Linux Ubuntu**:
  Cấu hình cron job:
  ```bash
  0 2 * * * cd /opt/nori/app && bash deploy/linux/backup.sh >> /var/log/nori/backup.log 2>&1
  ```

### 2.3. Sao Lưu Qua Giao Diện Quản Trị
1. Đăng nhập tài khoản `SUPER_ADMIN`.
2. Truy cập **Hệ thống** → **Đồng bộ & Sao lưu dữ liệu** (`/dashboard/system`).
3. Nhấn nút **Tạo Backup ngay**. Tiến trình sẽ tự động tạo gói sao lưu và ghi nhật ký vào `audit_logs`.

---

## 3. Quy Trình Khôi Phục Dữ Liệu (Restore Playbook)

### Khi nào cần khôi phục?
- Có sự cố thao tác nhầm từ người dùng quản trị.
- Cần khôi phục lại trạng thái cũ sau khi thử nghiệm.
- Di chuyển sang máy tính hoặc máy chủ mới.

### Quy Trình Khôi Phục An Toàn 5 Bước:
```bash
# Khôi phục từ bản sao lưu gần nhất trong thư mục backups/
pnpm restore

# Khôi phục từ một bản sao lưu chỉ định
pnpm restore --source backups/nori-backup-2026-11-20T12-00-00-000Z
```

**Các bước an toàn tự động được thực hiện**:
1. Xác minh mã băm SHA-256 và `PRAGMA integrity_check` của bản sao lưu nguồn. Nếu file sao lưu bị hỏng, lệnh dừng ngay lập tức.
2. Tự động tạo một bản sao lưu dự phòng khẩn cấp (`preRestoreBackupId`) của database hiện tại trước khi thực hiện ghi đè.
3. Đóng các kết nối đang mở và dọn dẹp các tệp tạm (`-wal`, `-shm`).
4. Ghi đè file `nori.db` và đồng bộ lại thư mục hình ảnh `media/`.
5. Kiểm tra tính toàn vẹn của database mới sau khi khôi phục và làm mới cache.

---

## 4. Kiểm Thử Khôi Phục Định Kỳ (Disaster Recovery Drill)

Khuyến nghị thực hiện diễn tập khôi phục ít nhất 1 lần mỗi tháng trên môi trường test:
1. Sao chép file backup sang máy tính cá nhân.
2. Chạy lệnh:
   ```bash
   node scripts/data-restore.ts --source <path-to-backup> --target ./test-verify.db --media ./test-media
   ```
3. Khởi động ứng dụng kiểm thử trỏ vào `test-verify.db` để xác nhận toàn bộ dữ liệu xe và đơn đặt phòng hiển thị chính xác 100%.
