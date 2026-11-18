# NORI Vehicle Rental — Database Integrity & Forensic Remediation Report

> **Trạng thái `./nori.db` hiện tại**: **`VERIFIED CLEAN & REPAIRED`** (đã thực thi sửa chữa trong transaction theo đúng phạm vi được chủ sở hữu phê duyệt ngày `2026-11-18`, `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = []`, Hero Slide #1 khôi phục đúng `"Mọi hành trình."`).  
> **Script sửa chữa**: [`scripts/repair-nori-db.mjs`](../../scripts/repair-nori-db.mjs)  
> **Log thực thi thực tế**: [`backups/nori-repair-apply-log.json`](../../backups/nori-repair-apply-log.json)

---

## 1. Sao lưu & Kiểm tra An toàn Trước Thực thi

Trước khi mở transaction sửa chữa `./nori.db`:

1. **Dừng toàn bộ tiến trình ứng dụng / daemon**: Đã xác minh không có tiến trình hoặc task chạy nền nào kết nối tới `./nori.db` (`walExists: false`, `shmExists: false`).
2. **Tạo và kiểm chứng bản sao lưu `VACUUM INTO`**:
   - Bản sao lưu tiền kiểm chứng: [`backups/nori-pre-repair-verified.db`](../../backups/nori-pre-repair-verified.db) (`2936.0 KB`) — đã mở đọc thực tế bằng `node:sqlite`, kiểm tra `PRAGMA integrity_check = ok` và đối chiếu số bản ghi (`bookings: 10`, `users: 16`, `admins: 2`, `vehicles: 21`, `promotions: 1`).
   - Bản sao lưu nguyên tử tự động ngay trước `BEGIN IMMEDIATE`: [`backups/nori-pre-repair-2026-11-18T14-43-27-141Z.db`](../../backups/nori-pre-repair-2026-11-18T14-43-27-141Z.db).
   - Các bản sao lưu nền trước đó được giữ nguyên: `backups/nori-backup-2026-11-18T12-24-55-238Z.db`, `backups/nori-backup-2026-11-18T13-16-58-621Z.db`.
3. **Thử nghiệm Rollback & Dry-Run**:
   - `--dry-run --verify-rollback` kiểm chứng transaction rollback khôi phục nguyên vẹn tiêu đề và giữ số vi phạm không đổi trước khi apply.
   - Đã sửa thử thành công trên bản sao cô lập (`nori-qa-remediation.db`, `postFkCount = 0`) trước khi áp dụng cho `./nori.db`.
   - Chạy lại `--dry-run` ngay trước khi `--apply` xác nhận `25` dòng vi phạm & dữ liệu kinh doanh khớp `100%` với bản đã phê duyệt.

---

## 2. Xác minh Tính Không thể Khôi phục Quan hệ & Danh sách Dữ liệu Đã Sửa

Kiểm tra chéo bằng truy vấn SQL đọc trước khi áp dụng cho thấy **toàn bộ `25` UUID mồ côi đều không còn bản ghi cha trong `./nori.db`**:

- `Hero orphan media UUIDs` (`4` IDs: `fdf807ae...`, `e32db5fa...`, `65c35a90...`, `b665630e...`) → không có mặt trong cả `media` lẫn `_media_v` (đây là tệp upload tạm của bài test `"Hero Test 6e1f916c"` / `"Hero Test 3f6e6319"` đã xóa).
- `Media version parent UUIDs` (`9` IDs) → không còn bản ghi cha trong `media` (tệp `banner-jpg/png/webp-...` từ bài test banner cũ).
- `Audit user UUIDs` (`3` IDs: `09947ce6...`, `18299e68...`, `8836bf2e...`) → không còn trong `users` (tài khoản test `bk-cust-...@example.test`, `nt-cust-...@example.test` đã bị xóa ở các vòng E2E trước), trong khi các trường chữ đọc được như `actor_email` và `entity_label` vẫn nằm đầy đủ trên `451` dòng cha của bảng `audit_logs`.

### Bảng 3 nhóm xử lý FK & Khôi phục Hero Slide #1

| Hạng mục                    | Bảng & Dòng bị tác động                                                                                                                                  | Thao tác trong Transaction                                                                                                           |            Số lượng            | Bảo toàn dữ liệu liên quan                                                                  |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :----------------------------: | :------------------------------------------------------------------------------------------ |
| **Nhóm FK #1**              | `_nori_site_v_version_hero_slides` (`rowids: 121, 171, 176, 181, 186`, đều là `latest = 0`)                                                              | `SET desktop_image_id = NULL / mobile_image_id = NULL` (`ON DELETE SET NULL`)                                                        | **`8` cột FK** (trên `5` dòng) | Giữ nguyên `100%` lịch sử phiên bản `_nori_site_v`                                          |
| **Nhóm FK #2**              | `_media_v` (`rowids: 77, 78, 79, 80, 83, 84, 85, 86, 87`)                                                                                                | `SET parent_id = NULL` (`ON DELETE SET NULL`)                                                                                        |         **`9` cột FK**         | Giữ nguyên bản ghi lịch sử media                                                            |
| **Nhóm FK #3**              | `audit_logs_rels` (`ids: 613, 614, 615, 616, 617, 618, 625, 626`)                                                                                        | `DELETE` dòng quan hệ mồ côi `users_id`                                                                                              |       **`8` dòng rels**        | Giữ nguyên toàn bộ **`451 / 451`** dòng `audit_logs` (vẫn giữ `actor_email` & `action`)     |
| **Khôi phục Hero Slide #1** | `nori_site_hero_slides` (`id: 6afcd7cab8279657a8c49cb1`) & `_nori_site_v_version_hero_slides` (`id: 4a28ed6b-8f41-4687-a311-5da8ca75b054`, `latest = 1`) | Khôi phục từ snapshot đã xuất bản hợp lệ `618bc4b7-2372-4543-b4d9-89aca6de3d65` (`vinfast-vf8-ext-10.jpg` xác minh tồn tại trên đĩa) |     **`2` dòng Slide #1**      | Chỉ cập nhật Slide #1: `"Hero Test 6e1f916c"` (`63/59`) → **`"Mọi hành trình."`** (`50/50`) |

---

## 3. Đối chiếu Số lượng & Dữ liệu Trọng yếu Trước ↔ Sau Sửa chữa (`./nori.db`)

| Bảng / Đối tượng                    |                   Trước khi sửa                   |                            Sau khi sửa                            |        Kết luận bảo toàn        |
| :---------------------------------- | :-----------------------------------------------: | :---------------------------------------------------------------: | :-----------------------------: |
| `PRAGMA integrity_check`            |                       `ok`                        |                             **`ok`**                              | Toàn vẹn cấu trúc B-tree SQLite |
| `PRAGMA foreign_key_check`          |                 **`25` vi phạm**                  |                      **`0` vi phạm (`[]`)**                       |  Sạch 100% vi phạm khóa ngoại   |
| `bookings`                          |                       `10`                        |                             **`10`**                              |       Bảo toàn nguyên vẹn       |
| `payments`                          |               `1` (`PAY-A425C2A1`)                |                              **`1`**                              |       Bảo toàn nguyên vẹn       |
| `promotions` (`NORIXINCAMON`)       | `1` (`PERCENT 10`, `max_discount=30`, `used=1/1`) |       **`1`** (`PERCENT 10`, `max_discount=30`, `used=1/1`)       |     Không bị ghi đè/sửa đổi     |
| `vehicles` / `vehicle_models`       |                    `21` / `21`                    |                          **`21` / `21`**                          |       Bảo toàn nguyên vẹn       |
| `admins` / `users`                  |                    `2` / `16`                     |                          **`2` / `16`**                           |       Bảo toàn nguyên vẹn       |
| `media` / `posts`                   |                    `78` / `0`                     |                          **`78` / `0`**                           |       Bảo toàn nguyên vẹn       |
| `audit_logs`                        |                       `451`                       |                             **`451`**                             |     Không mất log kiểm toán     |
| Hero Slide #1 (`_order = 1`)        |      `"Hero Test 6e1f916c"` (`focal 63/59`)       | **`"Mọi hành trình."`** (`vinfast-vf8-ext-10.jpg`, `focal 50/50`) |  Khôi phục đúng nội dung & ảnh  |
| Hero Slides #2–#5 (`_order = 2..5`) | Slides #2–#5 (`focal 21/46, 72/43, 66/55, 9/50`)  |      **Giữ nguyên 100% (`focal 21/46, 72/43, 66/55, 9/50`)**      |     Không ghi đè slide khác     |

---

## 4. Cơ chế Phòng ngừa Tái diễn Hậu Khắc phục

1. **Khóa an toàn chống chạy E2E lên `./nori.db` gốc**:
   - [`playwright.config.ts`](../../playwright.config.ts) từ chối khởi chạy Playwright (`[NORI SAFETY GUARD]`) nếu `NORI_SQLITE_PATH` / `DATABASE_URI` không trỏ vào bản sao cô lập (trừ khi truyền cờ tường minh `NORI_ALLOW_LIVE_DB_TEST=1`).
   - `getDbPath()` trong toàn bộ **`8/8`** tệp E2E có mở DB (`nori.spec.ts`, `qa-comprehensive-audit.spec.ts`, `auth-session-booking-regression.spec.ts`, `data-sync.spec.ts`, `hero-cms.spec.ts`, `posts-banner.spec.ts`, `promo-checkout-regression.spec.ts`, `upgrade-workflows.spec.ts`) đều tự chặn truy cập tới `path.resolve('nori.db')` khi thiếu `NORI_ALLOW_LIVE_DB_TEST=1`.
   - Lệnh chuẩn [`pnpm test:e2e:isolated`](../../scripts/run-e2e-isolated.mjs): tự sao chép `./nori.db` → `nori-e2e-isolated.db`, chạy toàn bộ `92` E2E trên port trống động với `NORI_DISABLE_DEMO_SEED=1`, tự kiểm tra **`PRAGMA integrity_check = ok`**, **`PRAGMA foreign_key_check = []`** và **`newLeftoverTestUsersCount = 0`** rồi dọn process tree & xóa bản tạm (`PASS 92/92` trong `4.8m` sau khi sửa `./nori.db`).
2. **Bảo vệ Build, Seed & Khởi động lại thực tế**:
   - [`scripts/test-admin-isolated.mjs`](../../scripts/test-admin-isolated.mjs) sao chép nguồn sang `nori-test-isolated.db` và fail ngay nếu `fkCheck.length > 0` (**`ISOLATED_ADMIN_TEST_PASS`** sau khi sửa `./nori.db`).
   - [`src/lib/seed-nori.ts`](../../src/lib/seed-nori.ts) tôn trọng `NORI_DISABLE_DEMO_SEED=1` và tự thoát sớm nếu dữ liệu đã tồn tại, không bao giờ ghi đè cấu hình Hero/Admin hiện hành.
   - Đã kiểm chứng khởi động lại cả `next dev` (`:3000`) và production `next start` (port động, `NORI_DISABLE_DEMO_SEED=1`, chỉ gửi HTTP `GET` read-only `/nori-api/health`, `/`, `/vehicles/toyota-fortuner`, `/login`, `/dashboard`, `/admin`): mọi route `200`, `/` hiển thị **`"Mọi hành trình."`**, và bảo toàn 100% số lượng bản ghi cùng `integrity_check = ok`, `foreign_key_check = []` trên `./nori.db`.

---

## 5. Hướng dẫn Rollback Khẩn cấp (Nếu cần khôi phục nguyên trạng trước sửa)

1. Dừng mọi tiến trình Node.js / Payload đang chạy:
   ```bash
   # Kiểm tra không còn process Node giữ lock trên nori.db
   ```
2. Chạy script khôi phục an toàn (tự xóa `-wal`/`-shm` và kiểm tra `integrity_check = ok`):
   ```bash
   node scripts/restore-db.mjs --source backups/nori-pre-repair-verified.db --target ./nori.db
   ```
   _(Hoặc dùng bản sao tự động ngay lúc chạy `--apply`: `backups/nori-pre-repair-2026-11-18T14-43-27-141Z.db`.)_
