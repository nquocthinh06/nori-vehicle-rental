# BÁO CÁO KIỂM THỬ CƠ SỞ DỮ LIỆU, REPLICATION & SAO LƯU MÃ HÓA (DATABASE TEST REPORT) — NORI

> **Ngày kiểm thử**: `2026-11-28`  
> **Môi trường kiểm thử**: Windows 11 Pro (`10.0.26300`), Node.js `v24.22.3`, `pnpm 10.34.9`, Local PostgreSQL `18.6` (Dual Disposable Clusters cho kiểm thử cô lập), Neon Serverless PostgreSQL `17.12` (chỉ đọc Read-Only Probe)  
> **Kết luận nghiệm thu tổng thể**: **CONDITIONAL PASS** *(Toàn bộ **20/20** bài kiểm thử tự động trên 2 cụm PostgreSQL 18.6 độc lập `DB-01..DB-22`, mã hóa AES-256-GCM, kiểm thử phá hủy/giả mạo, phục hồi sequence, Task Scheduler `23:59` và Media Backup đều đạt **100% PASS**; phần **Kích hoạt Live Logical Subscription trên Neon** hiện đang **`BLOCKED`** chờ người dùng phê duyệt bật `wal_level = logical` trên Neon Console và chạy 2 pending migrations)*

---

## 1. Tổng hợp Kết quả Quality Gate & Kiểm thử Cơ sở dữ liệu

| Hạng mục kiểm thử | Lệnh thực thi | Kết quả thực tế quan sát được | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Bộ kiểm thử PG18 Replication & Backup** | `pnpm test:db:replica` (`node --test tests/db-replica-backup.test.mjs`) | **20/20 PASS, 0 FAIL, 0 SKIP** (`132.91s` / `132,907.6 ms`) trên 2 cụm PostgreSQL 18.6 cô lập (`DB-01..DB-22`) | **PASS** |
| **Khả năng di động CI (khi thiếu PG18)** | `tests/db-replica-backup.test.mjs` (`HAS_PG_BIN` guard) | Tự động bỏ qua sạch các bài cluster với thông báo `'PostgreSQL 18 initdb/pg_ctl binaries not installed'`, vẫn chạy 5 unit test độc lập (`DB-11/13`, `DB-14`, `DB-16`, `DB-18`, `DB-19`) | **PASS** |
| **Sao lưu Media Tăng dần & Xác minh SHA-256** | `pnpm db:media:backup` & `pnpm db:media:backup -- --verify --json` | Lần đầu: `Total=81 \| Copied=81 \| Corrupt=0`. Lần tăng dần: `totalScanned=81`, `backedUpTotal=81`, `copied=0`, `skippedUnchanged=81`, `totalBytes=19,184,067` (`mediaDir=public/media`, `backupRoot=backups/media`). Verify: `ok=true`, `checked=81`, `missing=[]`, `checksumMismatch=[]` | **PASS** |
| **Kiểm tra Trạng thái Neon (Read-Only Probe)** | `pnpm db:sync:status -- --neon-only --json` | Exit code `0`, **0** bí mật/mật khẩu/token trong JSON đầu ra; xác nhận chuyển đổi `-pooler` → Direct URL (`convertedFromPooler: true`, `sslmode=verify-full`) | **PASS** |
| **Đăng ký Lịch Sao lưu Tự động Windows** | `scripts/windows/register-backup-task.ps1 -Status` | Tác vụ **`NORI-Daily-Backup-2359`** đã đăng ký (`State=Ready`, `StartWhenAvailable=True`, `WakeToRun=False`, lịch chạy `23:59 Asia/Ho_Chi_Minh`) | **PASS** |
| **Chất lượng Mã nguồn & Typecheck (sau chỉnh sửa cuối)** | `pnpm lint`, `oxfmt --check`, `pnpm typecheck` | `static-lint.mjs`: `330` tệp `0` vấn đề; `oxfmt`: `PASS`; `tsc --noEmit`: `0` lỗi | **PASS** |
| **Kích hoạt Live `CREATE SUBSCRIPTION` từ Neon thật** | Neon Console + `CREATE PUBLICATION` / `CREATE SUBSCRIPTION` | Neon hiện ở `wal_level = "replica"`, `publications = []`, và còn 2 pending migrations chưa áp dụng lên Neon | **BLOCKED (Chờ phê duyệt Neon)** |

---

## 2. Kết quả Chi tiết 22 Kịch bản Nghiệp vụ (`DB-01` .. `DB-22`)

Toàn bộ các kịch bản dưới đây được chạy thực tế trên **2 cụm PostgreSQL 18.6 tạm thời cô lập hoàn toàn** (Publisher cluster & Subscriber cluster), **tuyệt đối không ghi lên Neon** và tự dọn dẹp sau khi chạy xong:

| Mã kịch bản | Kịch bản kiểm chứng | Thời gian | Kết quả |
| :---: | :--- | :-: | :-: |
| **DB-01** | Khởi tạo schema `118` bảng từ `src/migrations-postgres/` + `CREATE PUBLICATION` + `CREATE SUBSCRIPTION (copy_data = true)` | `13.7s` | **PASS** |
| **DB-02** | Đồng bộ thao tác `INSERT` thời gian thực (`notifications` / `bookings`) từ Publisher sang Subscriber | `302ms` | **PASS** |
| **DB-03** | Đồng bộ thao tác `UPDATE` (`bookings.status`, `vehicles.operation_status`, `nori_site`) | `65ms` | **PASS** |
| **DB-04** | Đồng bộ thao tác `DELETE` theo `PRIMARY KEY` (`REPLICA IDENTITY DEFAULT`) | `12ms` | **PASS** |
| **DB-05** | Đồng bộ thao tác `TRUNCATE CASCADE` | `99ms` | **PASS** |
| **DB-06** | Đối chiếu toàn vẹn schema & dữ liệu toàn bộ `118` bảng (`columns`, `FKs = 283`, `migrations`, `rowCounts`) | — | **PASS** |
| **DB-07** | Tạm dừng Subscription (`DISABLE`) → ghi dữ liệu phía nguồn → chạy `refreshSubscriptionSafe()` bắt kịp dữ liệu | `409ms` | **PASS** |
| **DB-08** | Tắt dịch vụ Subscriber (`pg_ctl stop`) → ghi thêm dữ liệu phía nguồn → bật lại (`pg_ctl start`) kiểm tra **Auto-Reconnect** | `49.0s` | **PASS** |
| **DB-09** | Giám sát Replication Slot, Sender và độ trễ WAL (`pg_replication_slots`, `pg_stat_replication`) | `1.0s` | **PASS** |
| **DB-10** | Mô phỏng mất/vô hiệu hóa Slot (`pg_drop_replication_slot`) → chạy `buildSlotReinitRunbook()` → dọn sạch & tái thiết lập Subscription | `15.5s` | **PASS** |
| **DB-11** | Chạy `pg_dump --format=custom` + `gzip` + mã hóa AES-256-GCM (`NORIENC1`) + xuất `backup-manifest.json` kèm SHA-256 | — | **PASS** |
| **DB-12** | Atomic Staging: khi tiến trình backup gặp lỗi, bản sao lưu hợp lệ trước đó và `latest-backup.json` được bảo toàn nguyên vẹn | — | **PASS** |
| **DB-13** | `verifyEncryptedPgBackup` đạt chuẩn với bản lưu hợp lệ và **từ chối ngay** khi bị sửa đổi dù chỉ **1 byte** (Auth Tag / SHA-256 tamper detection) | — | **PASS** |
| **DB-14** | Chính sách lưu trữ phân tầng **`30d / 12w / 12m`**: dọn dẹp các bản cũ quá hạn nhưng giữ nguyên các bản mới nhất | `145ms` | **PASS** |
| **DB-15** | Khôi phục cô lập (`pg_restore`) + tự động `setval()` đồng bộ **≥ 42 serial sequences** + thử `INSERT` bản ghi mới không trùng khóa | `7.1s` | **PASS** |
| **DB-16** | `scripts/media-backup.mjs`: bỏ qua file không đổi (incremental), phát hiện file bị sửa đổi khi `--verify`, và khôi phục nguyên vẹn với `--restore` | `3.8s` | **PASS** |
| **DB-17** | Vai trò chỉ đọc **`nori_readonly`**: truy vấn `SELECT` thành công; mọi lệnh `INSERT`, `UPDATE`, `DELETE`, `CREATE` đều bị từ chối | — | **PASS** |
| **DB-18** | Kiểm tra không tồn tại Publication ngược từ `nori_replica` và lớp bảo vệ chặn ghi ngược lên Production (`assertNotProductionTarget`) ném lỗi ngay | — | **PASS** |
| **DB-19** | `resolveNeonDirectUrl()` tự động loại bỏ hậu tố `-pooler` và ép buộc `sslmode=verify-full` | — | **PASS** |
| **DB-20** | Quét toàn bộ JSON đầu ra của health check và backup manifest: **0** mật khẩu, **0** khóa mã hóa, **0** token rò rỉ | — | **PASS** |
| **DB-21** | Phát hiện lệch DDL (`ALTER TABLE ADD COLUMN`) giữa nguồn và replica → đồng bộ lại sạch sau khi khớp DDL | `2.4s` | **PASS** |
| **DB-22** | Khi cụm nguồn dừng hoạt động (outage), `nori_replica` cục bộ vẫn truy vấn đọc ổn định qua `nori_readonly` | `246ms` | **PASS** |

---

## 3. Hiện trạng Thực tế của Neon Cloud & Các Hạng mục Chờ Phê duyệt (`BLOCKED`)

Kết quả kiểm tra chỉ đọc qua `pnpm db:sync:status -- --neon-only --json` (không ghi dữ liệu, không lộ chuỗi kết nối):

- **Engine & Khu vực**: `PostgreSQL 17.12 (82f091e)` tại AWS `ap-southeast-1` (Neon Direct Host trích xuất tự động từ `-pooler`).
- **Dung lượng & Bảng**: `22,847,488 bytes` (~`21.79 MB`), `109` bảng (`109/109` bảng có `PRIMARY KEY`).
- **Trạng thái Replication hiện tại trên Neon**:
  - `wal_level = "replica"` *(chưa bật `logical`)*.
  - `publications = []` *(chưa tạo `nori_pub`)*.
  - `replicationSlots`: Có 2 slot nội bộ của Neon (`wal_proposer_slot` đang active, `wal_retention_slot` inactive).
  - `pendingMigrations`: Còn **2** migration chưa chạy trên Neon:
    1. `20261128_010000_ai_assistant_foundation`
    2. `20261128_020000_vehicle_import_jobs`

### Điều kiện để mở khóa Live Neon Subscription (Action Required):
1. Người dùng/chủ dự án bật **`wal_level = logical`** trong **Neon Console** (thao tác sẽ khởi động lại Neon compute).
2. Chạy `pnpm db:backup -- --source neon` để tạo bản dự phòng trước nâng cấp, sau đó áp dụng 2 pending migrations lên Neon.
3. Chạy `pnpm db:pg:setup` trên máy Windows cục bộ (cung cấp mật khẩu `postgres` và `LOCAL_PG_READONLY_PASSWORD` trong `.env` cục bộ) để khởi tạo `nori_replica`, `nori_development` và `nori_readonly`.
4. Tạo `CREATE PUBLICATION nori_pub FOR ALL TABLES;` trên Neon Direct và `CREATE SUBSCRIPTION nori_sub ...` trên `nori_replica`, rồi xác nhận bằng `pnpm db:sync:status` và `pnpm db:sync:check`.

> **Xác nhận đường dẫn Media hoạt động (`resolveMediaDir()`)**: Theo thứ tự ưu tiên trong `src/lib/env.ts` (`MEDIA_DIR`/`NORI_MEDIA_DIR` → `DATA_DIR/media` → `public/media` → `dev-data/media` → `media/`), vì `scripts/sync-public-media.mjs` (`prebuild`) đồng bộ `public/media/`, Payload (`Media.ts`) và `media-optimizer.ts` đang dùng **`public/media/`** làm thư mục lưu & phục vụ upload thực tế (`81/81` bản ghi trong bảng `media` khớp `19,184,067 B`, được `media-backup.mjs` sao lưu & kiểm chứng `SHA-256` đầy đủ). Các tệp dư trong `./media/` (`190` tệp mồ côi + `4` tệp `media/seed/`) được bảo toàn nguyên vẹn.
