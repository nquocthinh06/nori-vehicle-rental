# TRẠNG THÁI TỔNG QUAN DỰ ÁN NORI (PROJECT STATUS)

- **Ngày kiểm toán & hoàn thiện**: `2026-11-28`
- **Phiên bản kiến trúc**: **PG18 Logical Replication, AES-256-GCM Encrypted Backup & Smart Vehicle Import (`v2.8.0`)** trên nền tảng Hệ Thống Thanh Toán & Nhất Quán Dữ Liệu (`v2.7.1`), Multi-Branch & Multi-Location (`v2.7.0`), Centralized Admin & Online Payment (`v2.6.0`) (`Next.js 16.4.6` + `React 19.3.1` + `Payload CMS 4.0.0-beta.8` + `SQLite` + `PostgreSQL 18`)
- **Kết luận nghiệm thu kỹ thuật**: Hệ thống **hoàn tất kiểm toán toàn diện PostgreSQL 18 Logical Replication (Local dual-PG test), Encrypted Daily Backup AES-256-GCM, Media Backup, Smart Vehicle Import (5 phương thức, 10 OEM adapters + Generic, VehicleImportJobs 12 trạng thái, Preview-Before-Save, lockedFields, Rollback), Verified VN Vehicle Catalogue (21 models, 11 VERIFIED, 10 NEEDS_BROCHURE_CHECK), 14 tài liệu kỹ thuật mới**. Toàn bộ các bộ kiểm thử tự động đạt **374/375 unit PASS (1 skip) + 1 admin PASS + 122/122 E2E PASS**.
- **Phân loại mức độ sẵn sàng triển khai (Release Gate)**:
  - **Sẵn sàng kỹ thuật, Dev, Standalone Production Build & Isolated Verification**: **`PASS (9/9)`** (`pnpm release:gate`: `env:check`, `format:check`, `typecheck`, `lint` `330/330`, `media:audit`, `test` `374/375` [1 skip], `test:admin`, `db:check` `118` tables, `build` `114/114` static/SSG `163.40s`) cùng `test:db:replica` (`20/20`), `catalogue:validate`, `db:media:backup --verify` (`81` files), và `test:e2e:isolated` (`122/122`).
  - **Sẵn sàng Thương mại / Vận hành Tiền thật (`PRODUCTION`)**: **`CONDITIONAL PASS — CHƯA MỞ PRODUCTION`** do: (1) 21 xe hiện tại vẫn là dữ liệu minh họa `DEMO` (`allocationStatus: 'UNALLOCATED'`), chưa khai báo chi nhánh/kho thực tế; (2) chưa cấu hình SePay Merchant credentials / HTTPS Webhook thật; (3) Neon hiện đang cấu hình `wal_level = replica` (`PostgreSQL 17.12`, `109` bảng, `2` pending migrations); cần **chủ dự án phê duyệt bật `wal_level = logical` trong Neon Console (khởi động lại compute), áp dụng `2` pending migrations và tạo `PUBLICATION nori_pub`** trước khi bật Live Subscription sang Local PG 18 `nori_replica`.

---

## 1. Tổng hợp Kết quả Kiểm thử & Kiểm toán (`v2.8.0`)

| Hạng mục                                  | Công cụ                                                          | Kết quả quan sát                                                                                                                                              | Trạng thái |
| :---------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------: |
| `pnpm lint`                               | `scripts/static-lint.mjs`                                        | `330/330` tệp (`0` lỗi AST / `assertOrigin` / rò rỉ secret client)                                                                                            |   `PASS`   |
| `pnpm typecheck`                          | `tsc --noEmit`                                                   | `0` lỗi TypeScript                                                                                                                                             |   `PASS`   |
| `pnpm format:check`                       | `oxfmt --check`                                                  | `421/421` tệp chuẩn định dạng code                                                                                                                            |   `PASS`   |
| `pnpm db:check`                           | `scripts/check-db-schema.mjs`                                    | `118` bảng, `PRAGMA integrity_check = ok`, `0` FK violations, `0` pending migrations                                                                          |   `PASS`   |
| `pnpm media:audit` & `pnpm data:validate` | `scripts/media-validate.ts`, `data-sync.ts`                      | `81/81` DB media & `67/67` snapshot media hợp lệ, `12/12` snapshot files đạt chuẩn, `0` lỗi nhạy cảm/FK/schema                                                |   `PASS`   |
| `pnpm catalogue:validate`                 | `scripts/catalogue-cli.mjs`                                      | `ok=true`, `files=12`, `media=67`, `21` models (`11` VERIFIED, `10` NEEDS_BROCHURE_CHECK)                                                                     |   `PASS`   |
| `pnpm test`                               | Node Test Runner (`v24.22.3`)                                    | **`374/375 PASS`** (`1` skip — Postgres live parity, `0` fail, `30,436ms`): bao gồm `tests/vehicle-import.test.mjs` (`5/5` subtests PASS)                              |   `PASS`   |
| `pnpm test:admin`                         | `scripts/test-admin-isolated.mjs`                                | `ISOLATED_ADMIN_TEST_PASS` (seed idempotent, PBKDF2-SHA256, `integrity = ok`, `fk = 0`)                                                                       |   `PASS`   |
| `pnpm test:db:replica`                    | `scripts/pg-sync-*.mjs` (dual PG 18.6 disposable clusters)      | **`20/20 PASS`** (`DB-01..22`, `132.91s`)                                                                                                                     |   `PASS`   |
| `pnpm test:e2e:isolated`                  | Playwright Chromium & Mobile WebKit                              | **`122/122 PASS`** (`6.6 phút`, DB + Media cô lập, `postIntegrity = ok`, `fk = 0`, `0` leftover users) — bao gồm `vehicle-import.spec.ts` E2E-01..15          |   `PASS`   |
| `pnpm release:gate`                       | `scripts/release-gate.mjs`                                       | **`9/9 PASS`** (`env:check`, `format:check`, `typecheck`, `lint`, `media:audit`, `test`, `test:admin`, `db:check`, `build` `163.40s`, `114` static/SSG pages) |   `PASS`   |
| `pnpm perf:multi-branch`                  | `scripts/benchmark-multi-branch.mjs` (DB cô lập)                 | `100 CN / 10k Xe / 100k Đơn (82.25 MB)`: xe CN `0.086 ms`, timeline `0.044 ms`, báo cáo `5.541 ms`, `5,974 tx/s`, `0` full scan                               |   `PASS`   |
| **TỔNG CỘNG TEST AUTOMATION**             | **Unit + DB Replica + Admin + E2E (Tổng `518` kịch bản)**        | **`374/375 unit PASS` (`1` skip) + `20/20 DB replica PASS` + `1 admin PASS` + `122/122 E2E PASS` = `517/518 PASS`** (`0 FAIL`)                             | **`PASS`** |
| Tính toàn vẹn `./nori.db` gốc             | `node:sqlite` (`readOnly`)                                       | `118` bảng, `journal_mode = wal`, `PRAGMA integrity_check = ok`, `fkViolations = 0`                                                                           |   `PASS`   |
| Neon PG Logical Replication               | `pnpm db:sync:status`                                            | `wal_level="replica"` (`PostgreSQL 17.12`, `109` bảng, `2` pending migrations) — cần chủ dự án phê duyệt bật `wal_level=logical` trong Neon Console           | `BLOCKED`  |
| SePay Sandbox / Live Webhook HTTPS        | External SePay Gateway                                           | Chưa cấu hình credentials merchant & HTTPS public domain                                                                                                      | `BLOCKED`  |
| `figma make verify-deploy`                | Cloud CLI                                                        | Không có binary `figma` CLI trên shell Windows cục bộ                                                                                                         | `NOT_RUN`  |

---

## 2. Các Phân Hệ Trọng Điểm Đã Hoàn Thiện

1. **PG18 Logical Replication + Encrypted Backup + Media Backup (`v2.8.0`)**:
   - Dual-adapter Payload CMS: `@payloadcms/db-sqlite` (local dev) + `@payloadcms/db-postgres` (Neon Production), `push: false` trên cả hai.
   - One-way Logical Replication: Neon Production → Local PG 18 `nori_replica` (`wal_level=logical`, `PUBLICATION nori_pub`, `SUBSCRIPTION nori_sub`, `REPLICA IDENTITY DEFAULT`). **BLOCKED trên Neon** (hiện đang cấu hình `wal_level = replica`, `PostgreSQL 17.12`, `109` bảng, `2` pending migrations — cần chủ dự án phê duyệt bật `wal_level = logical` trong Neon Console); đã PASS trên dual disposable PG 18.6 clusters.
   - AES-256-GCM Encrypted Daily Backup + SHA-256 manifest, Task Scheduler `NORI-Daily-Backup-2359` (`State=Ready`, `StartWhenAvailable=True`), `23:59 Asia/Ho_Chi_Minh`, `30d/12w/12m` retention.
   - Media Backup: `81` files, `19,184,067` bytes, `0` missing, `0` checksum mismatch.
   - `nori_replica` read-only — ứng dụng không bao giờ ghi vào replica.

2. **Smart Vehicle Import (5 phương thức, 10 OEM Adapters, VehicleImportJobs State Machine) (`v2.8.0`)**:
   - **5 phương thức**: URL/SYNC, AI Smart Search, Bulk (URL/CSV/JSON), PDF Brochure, Manual (trong `<SmartImportDrawer />` tại `/dashboard/models`).
   - **10 OEM Adapters + Generic**: Toyota, Honda, Ford, Mitsubishi, Mazda, Hyundai, Mercedes-Benz, VinFast, Yamaha, Kawasaki; fallback PDF/JSON khi WAF/TLS.
   - **VehicleImportJobs State Machine** (12 trạng thái: `QUEUED`, `FETCHING`, `EXTRACTING`, `NORMALIZING`, `VALIDATING`, `PREVIEW_READY`, `AWAITING_APPROVAL`, `IMPORTING`, `COMPLETED`, `PARTIAL_SUCCESS`, `FAILED`, `CANCELLED`), Preview-Before-Save diff, `lockedFields`, idempotency, rollback, concurrency cap `3` (`429 CONCURRENCY_LIMIT_REACHED`), stale recovery (`FAILED` + `errorCode: RECOVERED_AFTER_RESTART`).
   - Demo separation: Import chỉ cập nhật `vehicle_models`, không tạo `vehicles` fleet.
   - SSRF defense-in-depth, `assertOrigin` CSRF, Audit Logging, external API cost controls.
   - Catalogue: `21/21` models enriched, `11` VERIFIED, `10` NEEDS_BROCHURE_CHECK.

3. **Verified VN Vehicle Catalogue (21 dòng xe) (`v2.8.0`)**:
   - Toàn bộ 21 models có `officialName`, `source`, `modelYear`, `market=VN`; EV vs ICE vs Motorbike rules áp dụng đúng.
   - `pnpm catalogue:validate`: `ok=true`, `files=12`, `media=67`.
   - `pnpm catalogue:*` CLI: `validate`, `status`, `import --dry-run`, `export`.

4. **14 Tài Liệu Kỹ Thuật Mới (`v2.8.0`)**:
   - `DATABASE_ARCHITECTURE.md`, `DATABASE_REPLICATION.md`, `BACKUP_RESTORE.md` (cập nhật), `DISASTER_RECOVERY.md`, `VEHICLE_CATALOGUE.md`, `SMART_VEHICLE_IMPORT.md`, `MANUFACTURER_ADAPTERS.md`, `DATA_SYNCHRONIZATION.md`, `MEDIA_STORAGE.md`, `IMPORT_SECURITY.md`, `BACKUP_AND_ROLLBACK.md`, `DATA_SOURCE_MANIFEST.md`, `DATABASE_TEST_REPORT.md`, `IMPORT_TEST_REPORT.md`.

5. **Kiểm Toán Nghiệp Vụ Thanh Toán, Đặt Cọc & Quyết Toán (`v2.7.1`)**:
   - Tách biệt tuyệt đối giữa Doanh thu tiền thuê xe và Ký quỹ bảo đảm tài sản xe.
   - Xử lý triệt để nguyên nhân gốc vụ việc 13.010.000 ₫ vs 15.000.000 ₫ trên giao diện quản trị.
   - Kế hoạch thanh toán: Đặt cọc 30% (`DEPOSIT`) vs Thanh toán trọn gói 100% (`FULL`).
   - Pre-Handover Gate và Post-Return Settlement Gate.

6. **Quản lý Đa Chi Nhánh & Đa Địa Điểm (`v2.7.0` — Module 3.7)**:
   - `109 → 118` bảng (sau 2 migrations PG18 Replication + Smart Import), `12+` composite indexes.
   - P0 Vehicle Location Timeline Engine, Điều chuyển Nguyên tử 9 trạng thái, Định giá 5 tầng, RBAC 8 vai trò × 20 phân hệ.

7. **Kiểm toán Hiệu năng, Tối ưu Media & Chuẩn hóa Production (`v2.6.1`)**:
   - Pipeline nén ảnh WebP runtime, `push: false` + SQLite WAL, `start-standalone.mjs`.

8. **Hệ thống Thanh toán Trực tuyến (`v2.6.0`)**:
   - Payment Adapter Pattern (SePay, Mock, Manual), idempotency Webhook, đối soát, hoàn tiền.

9. **Đồng bộ Dữ liệu, Bảo mật, RBAC & PWA (`v2.4.0 – v2.5.0`)**:
   - Git Snapshot & Media Sync, `dynamicParams = true`, `revalidateTag` hooks, PWA Service Worker v2.
