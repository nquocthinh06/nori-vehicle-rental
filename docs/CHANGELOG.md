# NHẬT KÝ THAY ĐỔI VÀ NÂNG CẤP HỆ THỐNG NORI (CHANGELOG)

## [Phiên bản 2.8.0] — 2026-11-28: PG18 Logical Replication, AES-256-GCM Encrypted Backup & Smart Vehicle Import

### 1. PostgreSQL 18 Logical Replication + Encrypted Backup + Media Backup

- **Dual-adapter Payload CMS**: `@payloadcms/db-sqlite` (local dev) + `@payloadcms/db-postgres` (Neon Production + Local PG 18), `push: false` trên cả hai adapter; failsafe reject startup khi thiếu `DATABASE_URL` trong production (`VERCEL=1` / `NORI_ENV=production`).
- **Neon Production → Local PG 18 `nori_replica`**: One-way Logical Replication (`wal_level = logical`, direct non-pooler TLS, `PUBLICATION nori_pub`, `SUBSCRIPTION nori_sub`, `REPLICA IDENTITY DEFAULT` trên tất cả bảng có `PRIMARY KEY`). **Trạng thái trên Neon**: hiện đang cấu hình `wal_level = replica` (`PostgreSQL 17.12`, `109` bảng, `2` pending migrations) — BLOCKED, cần **chủ dự án phê duyệt bật `wal_level = logical` trong Neon Console (khởi động lại compute), áp dụng `2` pending migrations và tạo `PUBLICATION nori_pub`** trước khi bật Live Subscription. Đã PASS hoàn toàn trên dual disposable PG 18.6 clusters (`pnpm test:db:replica` — `20/20 PASS`, `132.91s`).
- **Database phân tách**: `nori_replica` (read-only, Antigravity SQL/ERD), `nori_development` (dev + migration), `nori_readonly` (Antigravity queries). `nori_replica` là read-only — ứng dụng **không bao giờ ghi** vào replica.
- **Encrypted Daily Backup**: `pg_dump` + AES-256-GCM + SHA-256 manifest; Windows Task Scheduler `NORI-Daily-Backup-2359` (`State=Ready`, `StartWhenAvailable=True`), `23:59 Asia/Ho_Chi_Minh`, `30d/12w/12m` retention, khuyến nghị off-machine copy.
- **Media Backup**: `pnpm db:media:backup --verify --json` — `ok=true`, `checked=81`, `missing=[]`, `checksumMismatch=[]`, `totalBytes=19,184,067` (`public/media/`).
- **CLI mới**: `pnpm db:sync:status`, `pnpm db:sync:check`, `pnpm db:backup`, `pnpm db:backup:verify`, `pnpm db:restore`, `pnpm db:media:backup`.
- **VSCode extensions**: `.vscode/extensions.json` với `cweijan.vscode-postgresql-client2`, `ms-ossdata.vscode-pgsql`, `bierner.markdown-mermaid`.
- **Schema**: `118` bảng (tăng từ `109` sau 2 migrations: `20261128_010000_ai_assistant_foundation`, `20261128_020000_vehicle_import_jobs`).

### 2. Smart Vehicle Import (5 phương thức, 10 OEM Adapters + Generic, VehicleImportJobs State Machine)

- **5 phương thức import**: URL/SYNC (tự động fetch trang OEM), AI Smart Search (AI đề xuất model), Bulk (URL/CSV/JSON hàng loạt), PDF Brochure (trích xuất thông số từ PDF chính thức), Manual (nhập tay).
- **10 OEM Adapters + Generic**: Toyota, Honda, Ford, Mitsubishi, Mazda, Hyundai, Mercedes-Benz, VinFast, Yamaha, Kawasaki; Generic fallback. Adapters phát hiện WAF 403/TLS/timeout và chuyển sang PDF/JSON fallback tự động.
- **VehicleImportJobs State Machine** (`src/lib/vehicle-import/job-manager.ts`, 12 trạng thái): `QUEUED`, `FETCHING`, `EXTRACTING`, `NORMALIZING`, `VALIDATING`, `PREVIEW_READY`, `AWAITING_APPROVAL`, `IMPORTING`, `COMPLETED`, `PARTIAL_SUCCESS`, `FAILED`, `CANCELLED` (khi phục hồi tiến trình treo sau restart, trạng thái chuyển `FAILED` kèm `errorCode: 'RECOVERED_AFTER_RESTART'`).
- **Preview-Before-Save**: Mọi import hiển thị diff field trước/sau, trường `lockedFields` không được phép ghi đè.
- **Admin UI `<SmartImportDrawer />` trong `/dashboard/models`**: 6 tab (Website hãng, Tìm kiếm thông minh, Nhập hàng loạt, Brochure PDF, Nhập thủ công, Lịch sử nhập liệu); Approve/Draft/Publish/Rollback; double-rollback bị từ chối với HTTP `409` (`"Tiến trình này đã được Rollback trước đó."`).
- **Concurrency cap**: tối đa 3 job đồng thời (`MAX_CONCURRENT_IMPORT_JOBS = 3`); job thứ 4 → `429 CONCURRENCY_LIMIT_REACHED`.
- **Demo separation**: Import chỉ cập nhật `vehicle_models` (Catalogue), **không** tạo hay chỉnh sửa bản ghi đội xe `vehicles` (`isDemo`).
- **SSRF defense-in-depth**: `src/lib/vehicle-import/security.ts` & `fetcher.ts` (`HTTPS_REQUIRED`, `DOMAIN_NOT_ALLOWLISTED`, `SSRF_PRIVATE_IP`, `SSRF_LOCAL_HOST`, `IP_LITERAL_FORBIDDEN`, `UPSTREAM_WAF_BLOCKED`, `TOO_MANY_REDIRECTS`), magic-byte/MIME/pixel limits, HTML/XSS sanitization, `assertOrigin` CSRF (`403 FORBIDDEN`), Audit Logging, external API cost controls.
- **Manufacturer Sync**: `POST /nori-api/dashboard/catalogue-import/sync-check` kiểm tra delta với nguồn OEM.
- **API mới** (`v2.1`, 9 routes): `GET /jobs`, `POST /preview`, `POST /sync-check`, `GET /jobs/[id]`, `POST /jobs/[id]/approve`, `POST /jobs/[id]/cancel`, `POST /jobs/[id]/retry`, `POST /jobs/[id]/rollback`, `PATCH /models/[id]/locks`.

### 3. Verified VN Vehicle Catalogue (21 Dòng Xe)

- **21 models enriched**: `officialName`, `source`, `modelYear`, `market=VN`, `trim`, EV vs ICE vs Motorbike rules.
- **Trạng thái enrichment**: `11` VERIFIED, `10` NEEDS_BROCHURE_CHECK.
- **`pnpm catalogue:validate`**: `ok=true`, `files=12`, `media=67`.
- **CLI mới**: `pnpm catalogue:validate`, `pnpm catalogue:status`, `pnpm catalogue:import --dry-run`, `pnpm catalogue:export`.
- **Data Source Manifest**: `docs/DATA_SOURCE_MANIFEST.md` ghi lại nguồn gốc 21 models từ `sources-manifest.json`, `catalogue-version.json`, `verified-enrichment.json`.

### 4. Kiểm thử & Chất lượng

- **`pnpm test`**: `374/375 PASS` (`1` skip — Postgres live parity), `0` fail, `30,436ms`. `tests/vehicle-import.test.mjs` — `5/5` subtests PASS.
- **`pnpm test:db:replica`**: `20/20 PASS` (`DB-01..22`, `132.91s`, dual PG 18.6 disposable clusters).
- **`pnpm test:e2e:isolated`**: `122/122 PASS`, `6.6 phút`, `postIntegrity=ok`, `postFkViolationsCount=0`, `newLeftoverTestUsersCount=0`. `vehicle-import.spec.ts` — E2E-01..15 PASS.
- **`pnpm release:gate`**: `9/9 PASS` (`env:check`, `format:check`, `typecheck`, `lint`, `media:audit`, `test`, `test:admin`, `db:check`, `build`), build `163.40s`, `114` static/SSG pages.
- **Lint**: `330/330` files. **Format**: `421/421` files. **Typecheck**: `0` errors.
- **`pnpm db:check`**: `118` tables, `integrity=ok`, `0` FK violations.

### 5. 14 Tài Liệu Kỹ Thuật Mới

- `docs/DATABASE_ARCHITECTURE.md` — Kiến trúc Before/After, Mermaid diagrams, 118 bảng scope, PK/FK/sequence inventory.
- `docs/DATABASE_REPLICATION.md` — Neon→Local PG18 Logical Replication setup, monitoring, slot invalidation runbook.
- `docs/BACKUP_RESTORE.md` — SQLite backup/restore + PG Encrypted Backup AES-256-GCM (cập nhật).
- `docs/DISASTER_RECOVERY.md` — 4 kịch bản DR, RPO/RTO, Failover proposal.
- `docs/VEHICLE_CATALOGUE.md` — Tiêu chuẩn làm phong phú catalogue, EV/ICE/Motorbike rules, Demo separation.
- `docs/SMART_VEHICLE_IMPORT.md` — Hướng dẫn admin đầy đủ 5 phương thức, API spec.
- `docs/MANUFACTURER_ADAPTERS.md` — 10 OEM adapters + Generic, reachability matrix, hướng dẫn thêm adapter.
- `docs/DATA_SYNCHRONIZATION.md` — Multi-developer sync qua GitHub + Git LFS, `pnpm catalogue:*`.
- `docs/MEDIA_STORAGE.md` — SHA-256 dedup, `next/image`, focal points, license governance.
- `docs/IMPORT_SECURITY.md` — SSRF defense-in-depth, RBAC, Audit Logging, cost controls.
- `docs/BACKUP_AND_ROLLBACK.md` — Unified runbook: SQLite/PG backup, Smart Import rollback.
- `docs/DATA_SOURCE_MANIFEST.md` — 21 models source manifest từ verified-enrichment.json.
- `docs/DATABASE_TEST_REPORT.md` — Báo cáo kiểm thử DB-01..22, media backup, Neon BLOCKED.
- `docs/IMPORT_TEST_REPORT.md` — Báo cáo kiểm thử Smart Import unit + E2E-01..15.

### 6. Sửa Lỗi (Bug Fixes)

- **`_media_v.version_source_sha256` thiếu trong migration** (P0): Thêm cột vào cả SQLite và PG migrations, `data-sync.ts` schema check, `check-db-schema.mjs` contract. Kết quả: `122/122` E2E PASS (từ `115/122`).
- **Unicode regex trong `normalizer.ts` / `adapters/generic.ts`**: Bổ sung ranh giới từ hỗ trợ Unicode — tránh cắt nhầm ký tự tiếng Việt.
- **Cache invalidation ngoài scope Next.js trong `import-service.ts`**: Bọc dynamic import `await import('../public-cache.ts')` trong `safeInvalidateCatalogueCaches()` kèm `try/catch` để tương thích Node test runner.
- **`mobile-webkit.spec.ts` Journey 2 flake** (`specsTab.click()` → `aria-selected="false"`): Thêm `waitUntil: 'load'` + `.toPass()` hydration-safe retry. Kết quả: `tests/e2e/mobile-webkit.spec.ts` chạy đơn lẻ `PASS`, và toàn bộ `pnpm test:e2e:isolated` đạt `122/122 PASS`.

---

## [Phiên bản 2.7.1] — 2026-11-20: Kiểm Toán Chuyên Sâu Nghiệp Vụ Thanh Toán, Nhất Quán Dữ Liệu User-Admin & Tối Ưu Hóa Responsive Đa Thiết Bị

### 1. Chuẩn hóa Nghiệp vụ Thanh toán, Đặt cọc & Phân định Bản chất Dòng tiền

- **Phân định rõ ràng bản chất 2 khoản tiền**: Tách bạch tuyệt đối **Doanh thu dịch vụ thuê xe** (Doanh thu kinh doanh) và **Ký quỹ bảo đảm tài sản xe** (Tài sản thế chấp giữ hộ, không phải doanh thu, hoàn trả 100% khi trả xe đạt chuẩn).
- **Giải trình và khắc phục triệt để vụ việc bất thường Admin UI (13.010.000 ₫ vs 15.000.000 ₫)**: Dữ liệu thực tế đơn hàng xe VF 3 có tổng tiền thuê 13.010.000 ₫, khách đã thanh toán 100% tiền thuê qua 2 đợt (30% cọc giữ xe 3.903.000 ₫ + 70% còn lại 9.107.000 ₫). Khoản 15.000.000 ₫ là tiền ký quỹ bảo đảm tài sản được giữ khi nhận xe. Đã bổ sung khối "Phân định hạch toán tài chính chuẩn" trên Admin UI và phân định rõ ràng trên CSDL/Giao diện khách hàng.
- **Kế hoạch thanh toán khách hàng linh hoạt (`paymentOption`)**: Bổ sung quyền lựa chọn tại Checkout giữa **A. Đặt cọc giữ xe 30%** (`DEPOSIT`) và **B. Thanh toán toàn bộ 100% tiền thuê** (`FULL`). Persist chuẩn hóa vào `bookings.paymentOption` và `bookings.reservationDepositSnapshot`.
- **Chốt chặn kiểm soát tài chính (Gates)**:
  - Pre-Handover Gate: Yêu cầu thu đủ tiền thuê theo kế hoạch và xác nhận ký quỹ trước khi giao xe (`ONGOING`).
  - Post-Return Settlement Gate (`checkSettlementCompletionEligibility`): Bổ sung kiểm tra bắt buộc `totalRemainingRentalObligation === 0` ngăn hoàn tất đơn khi còn nợ tiền thuê gốc.
- **Tự động xử lý bất thường dữ liệu lịch sử**: Hook `afterChange` tự động hủy (`CANCELLED`) các giao dịch thanh toán treo khi đơn bị từ chối (`REJECTED`) hoặc hủy (`CANCELLED`).

### 2. Tối ưu hóa Giao diện Responsive & Trải nghiệm Đa Thiết Bị (Mobile-First)

- **Hamburger Menu (Site Header)**: Tái thiết kế thành Drawer Container toàn màn hình độc lập (`fixed inset-0 z-50 flex flex-col bg-canvas`), bổ sung Top Bar riêng với Logo và nút Đóng (X) kích thước cảm ứng 44×44px, cuộn độc lập với đệm đáy Safe Area Inset `env(safe-area-inset-bottom)`, khóa cuộn nền (body scroll lock).
- **Admin Account Dropdown (Dashboard Header)**: Triệt tiêu 100% lỗi tràn mép trái màn hình (Left-edge off-screen overflow) trên thiết bị di động (<640px) bằng việc chuyển đổi sang Bottom Sheet với backdrop làm mờ; touch targets cho đổi mật khẩu/về trang chủ/đăng xuất đạt chuẩn tối thiểu 44×44px.
- **Ngăn chặn Safari Auto-Zoom**: Bổ sung CSS quy chuẩn `font-size: 16px !important` cho toàn bộ input/select/textarea trên màn hình di động (<640px).
- **Triệt tiêu Layout Blowout**: Cấu hình `overflow-x: hidden` và `max-width: 100vw` trên `html, body`; kích hoạt cuộn mượt mà có quán tính `-webkit-overflow-scrolling: touch` cho toàn bộ bảng biểu dữ liệu.

### 3. Kiểm thử Tự động Chuyên sâu & Bộ Tài liệu Quy chuẩn Mới

- **Bổ sung test suite nghiệp vụ thanh toán**: `tests/payment-business-audit.test.mjs` kiểm tra 5 kịch bản trọng yếu (Case 13M vs 15M, Kế hoạch cọc 30% vs 100%, Phân định thế chấp, Bất biến máy trạng thái, Chốt chặn giao xe và nghiệm thu). Toàn bộ 5/5 test pass 100%.
- **Biên soạn tài liệu mới**:
  - `docs/PAYMENT_BUSINESS_RULES.md`: Quy chuẩn nghiệp vụ thanh toán, đặt cọc và quyết toán tài chính.
  - `docs/PAYMENT_STATE_MACHINE.md`: Cập nhật 4 máy trạng thái trực giao và ma trận chốt chặn tài chính.
  - `docs/RESPONSIVE_AUDIT.md`: Báo cáo kiểm toán và khắc phục responsive đa thiết bị.

### 4. Khắc phục Triệt để Sự cố Schema Mismatch P0, Nâng cấp Migration Hợp nhất & Startup Preflight Guard

- **Sự cố P0 Release Blocker**: Truy cập 'Đơn thuê của tôi' trên LAN/Mobile gặp lỗi `SQLITE_ERROR: no such column: payment_option` (503) do thuộc tính mới thêm vào schema `Bookings` chưa được áp dụng migration tương ứng trên SQLite `nori.db`.
- **Database Migration 20261120_030000**: Tạo migration chính thức `src/migrations/20261120_030000_booking_payment_option_plans.ts` (Batch 4), bổ sung cột `payment_option` (VARCHAR(32), default 'DEPOSIT') và `reservation_deposit_snapshot` (NUMERIC, default 0), tạo index `bookings_payment_option_idx`.
- **Chiến lược Backfill an toàn**: Gán `payment_option = 'DEPOSIT'` và `reservation_deposit_snapshot = 0` cho các đơn thuê cũ, không ghi đè hay thay đổi bất kỳ trạng thái thanh toán hoặc số tiền nào.
- **Hệ thống Database Preflight & Startup Guard**: Tích hợp `checkDatabaseCompatibility()` vào `pnpm dev`, `pnpm dev:lan`, `pnpm start:standalone` và test runner `scripts/run-e2e-isolated.mjs`. Ngăn chặn tức thì việc khởi động server nếu CSDL thiếu bảng, thiếu cột hoặc còn pending migration.
- **Gia cố API Health Readiness**: Nâng cấp `/nori-api/health` thực hiện truy vấn đồng thời cả `vehicles` và `bookings`. Trả về 503 `NOT_READY` nếu schema CSDL bị lỗi hoặc không khớp.
- **Gia cố Error Handling & Logging**: Cập nhật `src/lib/api-utils.ts` phân định `DATABASE_ERROR` (503) kèm Request Trace ID (`req-<id>`), bảo vệ tuyệt đối không rò rỉ câu lệnh SQL hay schema nội bộ ra phía client.
- **Bộ Kiểm thử Hồi quy Migration (`tests/db-migration-regression.test.mjs`)**: 7 nhóm kiểm thử chuyên sâu (Fresh DB, Existing Upgrade, Pending Migration, Schema Drift, Rerun Idempotency, Disaster Recovery, Data Preservation) - 7/7 PASS (100%).

---

## [Phiên bản 2.7.0] — 2026-11-20: Module 3.7 — Quản Lý Đa Chi Nhánh, Kho Xe, Điểm Giao Nhận, Điều Chuyển Nguyên Tử, Giao Nhận Tận Nơi & Định Giá Địa Điểm

### 1. Kiến trúc Đa Chi Nhánh & Schema Additive-Only (`src/collections/*`, `src/migrations/20261120_020000_multi_branch_management.ts`)

- Bổ sung **10 Payload Collections mới** (`Branches`, `Warehouses`, `ServiceLocations`, `BranchStaff`, `VehicleTransfers`, `VehicleLocationHistory`, `DeliveryZones`, `DeliveryJobs`, `LocationPricingRules`, `OneWayRentalRules`) và mở rộng additive-only 9 collections hiện có (`Admins`, `Vehicles`, `Bookings`, `RentalDays`, `Promotions`, `Payments`, `MaintenanceSchedules`, `Consultations`, `AuditLogs`).
- Nâng cấp lược đồ SQLite `./nori.db` an toàn lũy kế từ **`88` lên `109` bảng** (`+21` bảng mới, `12+` composite indexes), bảo toàn 100% dữ liệu hiện có (`21` xe DEMO giữ nguyên ở trạng thái `UNALLOCATED`, không giả mạo chi nhánh thật).
- Bổ sung bảo vệ xuất snapshot nhạy cảm trong `src/lib/data-sync.ts`: chặn tuyệt đối `branch-staff`, `vehicle-transfers`, `vehicle-location-history`, `delivery-jobs` và các trường địa chỉ/SĐT giao nhận cá nhân.

### 2. Động cơ Timeline Vị trí P0, Điều chuyển Nguyên tử, Giao nhận Tận nơi & Định giá 5 Tầng (`src/lib/multi-branch-rules.ts`, `src/lib/multi-branch-service.ts`)

- Xây dựng **P0 Vehicle Location Timeline Engine (`evaluateVehicleLocationTimeline`)** xác định vị trí vật lý dự kiến của phương tiện theo dòng thời gian, ngăn đặt trùng lịch, sai chi nhánh hoặc đứt gãy chuỗi tuyến một chiều.
- Xây dựng quy trình **Điều chuyển Phương tiện Liên Chi nhánh 9 Trạng thái Nguyên tử** (`createVehicleTransferAtomic`, `transitionVehicleTransferAtomic`) kèm khóa `rental_days`, Optimistic Locking (`revision`), rollback ACID khi lỗi giữa chừng, cấm hủy sau xuất kho (`IN_TRANSIT`) và cấm xác nhận hoàn tất trùng lặp (`409`).
- Triển khai **Phân cấp Định giá 5 Tầng** (`VEHICLE_BRANCH > MODEL_BRANCH > VEHICLE_BASE > BRANCH_DEFAULT > GLOBAL_DEFAULT`), quy tắc tuyến một chiều (`OneWayRentalRules`), khuyến mãi theo phạm vi chi nhánh (`SPECIFIC_BRANCHES`), đóng băng bất biến `pricingRuleSnapshot` và báo cáo doanh thu đa chi nhánh không cộng trùng (`sum(branch) + unassigned === systemTotal`).
- Triển khai **Phân quyền RBAC Theo Phạm vi Chi nhánh** (`src/access/nori.ts`, `src/lib/admin-api.ts`) cho 8 vai trò chức danh × 20 phân hệ (`ALL` / `ASSIGNED`), chống tự nâng quyền, chống `BRANCH_MANAGER` tạo `SUPER_ADMIN`, chặn IDOR (`403 BRANCH_SCOPE_FORBIDDEN`) và thu hồi quyền tức thì (`403 ACCOUNT_REVOKED`).

### 3. Hệ thống API & 8 Phân hệ Quản trị Mới + Nâng cấp Giao diện Khách hàng

- Bổ sung 1 Public API (`/nori-api/locations`) và 8 Admin APIs (`/nori-api/dashboard/{branches,warehouses,locations,staff,transfers,deliveries,location-pricing,branch-reports}`) cùng nâng cấp 12 API hiện hữu (`availability`, `fleet`, `bookings`, `dashboard`, `vehicles`, `bookings`, `maintenance`, `payments`, `promotions`, `reports`, `export`, `admins`).
- Bổ sung 8 màn hình quản trị mới tại `/dashboard/{branches,warehouses,locations,staff,transfers,deliveries,location-pricing,branch-reports}` trong nhóm menu **"Chi nhánh & Địa điểm"** trên `AdminShell`.
- Nâng cấp toàn bộ trải nghiệm khách hàng (`SearchBar`, `Catalogue`, `VehicleCard`, `VehicleDetail`, `CheckoutPanel`, `BookingsPanel`) hỗ trợ chọn chi nhánh nhận/trả, thuê một chiều, lọc tồn kho chi nhánh thời gian thực, chọn điểm giao nhận xác minh, giao/thu hồi tận nơi theo vùng, đối chiếu khuyến mãi theo chi nhánh và `idempotencyKey` chống double-submit.

### 4. Kiểm thử Đa tầng, Benchmark Mở rộng & Bộ Tài liệu Chuyên sâu

- Bổ sung `tests/multi-branch-rules.test.mjs`, `tests/multi-branch-integration.test.mjs`, `tests/e2e/multi-branch-workflow.spec.ts` và `scripts/benchmark-multi-branch.mjs` (`pnpm perf:multi-branch`).
- Nâng tổng kiểm thử tự động lên **`406 / 406 PASS (100%)`** (`305` Unit/Integration/Resilience/Multi-Branch + `1` Isolated Admin + `100` Playwright E2E cô lập DB/Media + `3×` repeat flake check đạt `9/9 PASS`).
- Bổ sung 7 tài liệu chuyên sâu (`docs/MULTI_BRANCH_MANAGEMENT.md`, `docs/VEHICLE_TRANSFER_WORKFLOW.md`, `docs/BRANCH_RBAC_MATRIX.md`, `docs/LOCATION_PRICING_RULES.md`, `docs/DATABASE_MIGRATION.md`, `docs/DATA_SYNC_GUIDE.md`, `docs/BRANCH_OPERATIONS_GUIDE.md`) và cập nhật toàn bộ tài liệu hệ thống.

---

## [Phiên bản 2.6.1] — 2026-11-20: Kiểm Toán Hiệu Năng Toàn Hệ Thống, Khắc Phục Treo Dev/Mất Ảnh, Tối Ưu Media WebP, SQLite WAL & Chuẩn Hóa Production Standalone

### 1. Xử lý Nguyên nhân Gốc Gây Treo `pnpm dev`, Mất Ảnh & Cảnh báo Image Quality (`src/payload.config.ts`, `next.config.ts`, `src/components/home/hero.tsx`)

- Tắt Drizzle interactive `pushDevSchema` (`push: false`) trong `sqliteAdapter`, loại bỏ hoàn toàn tình trạng deadlock trên STDIN khiến mọi request `/nori-api/*` và `/api/media/file/*` bị treo vô hạn ở local `pnpm dev`; đồng thời kích hoạt `wal: { synchronous: 'NORMAL' }` và `busyTimeout: 5000`.
- Bổ sung `images.qualities: [75, 80, 84]` trong `next.config.ts`, chuẩn hóa chất lượng ảnh Hero (`80` desktop / `75` mobile) và loại bỏ lời gọi trùng `getImageProps` khi ảnh mobile trùng desktop.
- Siết chặt `typescript.ignoreBuildErrors: process.env.FIGMA === '1'` để bảo vệ build production cục bộ.

### 2. Pipeline Tối ưu Ảnh WebP Runtime & Media Integrity Audit (`src/lib/media-optimizer.ts`, `src/collections/Media.ts`, `src/components/home/featured.tsx`, `scripts/media-validate.ts`)

- Giữ nguyên `figma-image-loader.ts` và bổ sung `localMediaResizeHandler` (Payload `upload.handlers`, chỉ kích hoạt khi `FIGMA !== '1'`): tôn trọng `?w=&q=`, chuyển sang WebP bằng `sharp`, cache trên đĩa theo `filename + mtime + size + w + q + format` kèm `ETag/304`, tự động vô hiệu hóa khi Admin thay ảnh mới.
- Chuyển 4 ảnh danh mục trong `Featured` sang dùng ảnh cover từ CMS thay vì JPEG gốc chưa nén và gỡ cơ chế trễ 1800ms.
- Giảm **77.3%–90.9%** dung lượng ảnh tải đầu trên `/`, `/vehicles`, `/vehicles/[slug]`, đưa Mobile Detail LCP từ `3,184 ms` xuống **`1,876 ms`** (-41.1%).
- Mở rộng `pnpm media:audit` (`scripts/media-validate.ts --audit`) kiểm tra thiếu tệp, 0 byte, Git LFS pointer, magic-byte header, ảnh gốc lớn và báo cáo tệp đĩa chưa gắn DB (không tự động xóa).

### 3. Tối ưu Frontend RSC, Client Request Safety, Polling Thanh toán & PWA (`src/lib/catalogue.ts`, `src/lib/client-api.ts`, `src/components/{auth-provider,bookings-panel,booking-notification-center,pwa-manager,vehicle-detail}.tsx`, `public/sw.js`)

- Bổ sung `getCatalogueSummary()` và `slimPostForCard()`, cắt giảm **-62.5%** HTML thô trang `/vehicles` (`237.1 KB → 88.9 KB`) và chỉ truyền 12 trường cần thiết (`VehicleDetailSiteInfo`) vào `VehicleDetail`; bỏ remount `<img>` khi đổi tab ảnh nội/ngoại thất và prefetch nhẹ khi hover nút lọc.
- Thêm timeout mặc định `15s` (`REQUEST_TIMEOUT` / `408`) trong `client-api.ts`; deduplicate request `/nori-api/auth/me` trong `AuthProvider`; chuẩn hóa polling thanh toán với in-flight mutex, `AbortController`, exponential backoff hữu hạn (`4s→20s`, dừng sau 5 lỗi, coi timeout là trạng thái chưa xác định) và sửa lỗi bắn lặp 1 req/s khi đếm ngược về `00:00`.
- Chỉ đăng ký Service Worker `/sw.js` ở `production` (tự unregister và xóa cache ở dev); nâng cấp `nori-pwa-v2`, thêm `/favorites` và `request.cache === 'no-store'` vào bypass, dọn cache khi đăng xuất.

### 4. Tối ưu Truy vấn Backend, 7 SQLite Composite Indexes & Production Standalone (`src/lib/payment-service.ts`, `src/migrations/20261120_010000_online_payment_integration.ts`, `src/app/(frontend)/nori-api/**`, `scripts/start-standalone.mjs`)

- Bổ sung 7 composite index additive cho `payments`, `bookings`, `notifications`, `vehicles`, `rental_days` — loại bỏ 100% `USE TEMP B-TREE` trên các truy vấn nóng.
- Bổ sung `GET /nori-api/dashboard?summaryOnly=1` cho `AdminShell` (giảm 18 query → 4 count query nhẹ trên mỗi điều hướng `/dashboard/*`); tối ưu `sweepExpiredPayments` với SQL filter `expiresAt <= nowIso` + throttle 10s; loại bỏ query trùng `nori-site` và giới hạn phạm vi `payments/refunds` theo `bookingIds` trong `dashboard/bookings`; chuyển `dashboard/reports` sang `depth: 0` + `select`.
- Tạo `scripts/start-standalone.mjs` (`pnpm start:standalone`) tự động copy `.next/static`, `public/`, đồng bộ `libvips*.dll` của `sharp` trên Windows và giữ nguyên đường dẫn `nori.db` / `media/` ở thư mục gốc; cập nhật `scripts/run-e2e-isolated.mjs` cô lập cả DB và thư mục Media.

### 5. Dọn Dead Code, Mở rộng Kiểm thử Chịu lỗi / Load Test & Đăng ký Skill `nori-performance`

- Xóa dead code `src/components/dashboard-panel.tsx` (1,245 dòng, 0 tham chiếu) và `package-lock.json` dư thừa; khử 5/5 cảnh báo Turbopack filesystem tracing.
- Bổ sung `tests/payment-resilience.test.mjs` (10 kịch bản chịu lỗi thanh toán), `tests/e2e/performance-media-smoke.spec.ts` (3 kịch bản hiệu năng/WebP/cache revalidation) và `scripts/load-test.mjs` (`pnpm perf:load` — `16,061` reqs ở `1–100 VUs`, `0%` lỗi).
- Đăng ký skill bắt buộc `.agents/skills/nori-performance/SKILL.md`, cập nhật `AGENTS.md`, `SKILL.md` và hoàn thiện `docs/PERFORMANCE_AUDIT.md`, `docs/CODE_QUALITY.md`.

---

## [Phiên bản 2.6.0] — 2026-11-20: Tích Hợp Hệ Thống Thanh Toán Trực Tuyến (SePay + VietQR + Webhook + Payment Adapter Pattern + Đối Soát & Hoàn Tiền)

### 1. Kiến trúc Payment Adapter Pattern & Chuẩn hóa Công thức Tài chính (`src/lib/payment-providers.ts`, `src/lib/rental-rules.ts`, `src/lib/payment-service.ts`)

- Triển khai **Payment Adapter Pattern** với giao diện thống nhất `PaymentProviderAdapter` gồm: `SePayProvider` (VietQR động + xác thực Webhook `Authorization: Apikey` hằng số thời gian + User API), `MockPaymentProvider` (SVG VietQR nội bộ + bộ mô phỏng kiểm soát), `ManualPaymentProvider`, và khung mở rộng cho `PayOSProvider`, `VNPayProvider`, `MoMoProvider`, `ZaloPayProvider`.
- Phân tách 3 môi trường độc lập `MOCK` / `SANDBOX` / `PRODUCTION`, mặc định khóa cứng `PRODUCTION` (`PAYMENT_PRODUCTION_APPROVED=false`).
- Chuẩn hóa công thức tài chính tập trung: tách biệt hoàn toàn **Tiền cọc giữ chỗ (`DEPOSIT`)**, **Tiền thuê còn lại (`RENTAL_FEE`)**, **Thanh toán toàn bộ (`FULL_PAYMENT`)**, **Phụ phí phát sinh (`EXTRA_FEE`)**, **Hoàn tiền (`REFUND`)** và **Tiền cọc bảo đảm tài sản (`SECURITY_DEPOSIT`, không bao giờ cộng gộp vào doanh thu thuê xe)**.
- Áp dụng tuần tự hóa ghi `withBookingWriteLock`, chống trùng lặp Webhook (`payment_events.event_id`), chống sự kiện cũ đến sai thứ tự (`isPaymentEventStale`), và xử lý toàn bộ ngoại lệ (`UNDERPAID`, `OVERPAID`, `LATE_PAYMENT`, `UNMATCHED`).

### 2. Mở rộng Schema Additive-Only & API Thanh toán (`src/migrations/20261120_010000_online_payment_integration.ts`, `src/collections/PaymentEvents.ts`, `src/collections/Refunds.ts`)

- Bổ sung bảng `payment_events` và `refunds` (nâng tổng số bảng trong `nori.db` từ 84 lên 88, giữ nguyên 100% dữ liệu hiện có), mở rộng 21 cột thanh toán trực tuyến trên `payments` và 17 cột cấu hình thanh toán trên `nori_site`.
- Xây dựng đầy đủ 12 nhóm API: Customer Payment (`/nori-api/payments/create`, `/status`, `/status/[id]`, `/history`, `/cancel`, `/mock-simulate`), SePay Webhook (`/nori-api/payments/webhook/sepay`), Admin Payment/Confirm/Reconcile/Refund/Config (`/nori-api/dashboard/payments/*`), và Xuất CSV giao dịch (`export?type=payments`).
- Gắn chặt kiểm soát tài chính trước khi bàn giao (`ONGOING`) và quyết toán hoàn tất (`COMPLETED`) trên `src/collections/Bookings.ts`.

### 3. Nâng cấp Giao diện Khách hàng & Quản trị (`/checkout`, `/my-bookings`, `/dashboard/bookings`, `/dashboard/payments`, `/dashboard/reports`)

- `/checkout`: Hiển thị rõ cơ cấu tiền thuê, cọc giữ chỗ dự kiến sau duyệt, phần còn lại và cọc bảo đảm tài sản tách riêng; giữ nguyên nguyên tắc không thu tiền ở bước tạo đơn `PENDING`.
- `/my-bookings`: Hiển thị trạng thái thanh toán, số tiền đã thu/còn lại, lịch sử giao dịch & hoàn tiền, cùng **Màn hình Thanh toán VietQR** tích hợp đếm ngược, nút sao chép nhanh, Smart Polling có giới hạn (tạm dừng khi ẩn tab) và bộ mô phỏng Webhook kiểm soát được ở chế độ `MOCK`.
- `/dashboard/payments`: Nâng cấp thành không gian quản trị 5 tab (**Giao dịch**, **Đối soát & Ngoại lệ**, **Hoàn tiền**, **Sự kiện Webhook**, **Cấu hình Thanh toán**) kèm xác nhận thủ công bắt buộc lý do & mã chứng từ (`Audit Logs`).
- `/dashboard/reports`: Tách bạch Thực thu tiền thuê đã xác thực, Doanh thu ròng sau hoàn tiền, Cọc bảo đảm tài sản đang giữ, Công nợ còn phải thu và phân bổ theo phương thức/cổng thanh toán.

### 4. Kiểm thử Đa tầng (`PAY-001`..`PAY-050`) & Bộ tài liệu kỹ thuật (`docs/PAYMENT_*.md`)

- Bổ sung bộ kiểm thử Unit (`tests/payment-rules.test.mjs`), Integration + Concurrency 3x + Fault Recovery (`tests/payment-integration.test.mjs`) và E2E (`tests/e2e/payment-workflow.spec.ts`) trên cơ sở dữ liệu cô lập, kèm 12 tài liệu kỹ thuật thanh toán có sơ đồ Mermaid.

---

## [Phiên bản 2.5.0] — 2026-11-18: Chuẩn Hóa Đồng Bộ Dữ Liệu Nhóm (Data Snapshot), Đồng Bộ Hình Ảnh (Media Sync), Gói Sao Lưu Nhất Quán & Quản Trị Hệ Thống (`/dashboard/system`)

### 1. Kiến trúc Data Snapshot & Đồng bộ Nhóm qua GitHub (`src/lib/data-sync.ts`, `data/snapshots/*`, `data/seed/schema.sql`)

- Xây dựng hệ thống **Version-Controlled Data Snapshot** cho phép xuất (`data:export`), kiểm tra toàn vẹn (`data:validate`), xem trước thay đổi (`data:import -- --dry-run`) và đồng bộ (`data:sync`) toàn bộ dữ liệu công khai và cấu hình Admin qua GitHub mà không cần commit cơ sở dữ liệu nhị phân `nori.db`.
- Tách biệt rõ 3 nhóm dữ liệu: **Version-controlled Data** (`data/snapshots/*.json`, `data/seed/schema.sql`, `media/seed/**`), **Shared Runtime Data** (`nori.db`, `media/*`) và **Sensitive Data** (`.env`, password hash/salt, sessions, đơn thuê thực, thanh toán, CCCD/GPLX).
- Tích hợp cơ chế phát hiện và xử lý xung đột 3 chiều (`abort`, `keep-local`, `prefer-snapshot`) theo mã băm `recordHash` và thời điểm `updatedAt`, bảo vệ tuyệt đối dữ liệu cục bộ của các thành viên khi làm việc nhóm.

### 2. Đồng bộ Hình ảnh & Media Manifest (`data/snapshots/media-manifest.json`, `media/seed/**`, `scripts/media-validate.ts`)

- Tự động phát hiện và sao chép các tệp hình ảnh mới do Admin tải lên từ `media/` sang thư mục quản lý phiên bản `media/seed/{vehicles,hero,banners,articles}/`, đồng thời tái sử dụng 63 ảnh mẫu gốc tại `public/seed-media/` qua đối chiếu `SHA-256 checksum` để không lưu trùng lặp file trong Git.
- Khôi phục chính xác 100% khóa ngoại hình ảnh (`cover_id`, `desktop_image_id`, `mobile_image_id`, `image_id`) cho dòng xe, xe thực tế, Hero Slide, Banner và bài viết sau khi clone hoặc pull dự án trên máy mới.

### 3. Gói Sao lưu Nhất quán (Consistent Backup Bundle) & Giao diện Quản trị Hệ thống (`/dashboard/system`)

- Nâng cấp `data:backup` / `db:backup` và `data:restore` / `db:restore` để đóng gói đồng thời cơ sở dữ liệu SQLite (`VACUUM INTO`), toàn bộ tệp hình ảnh tham chiếu (`media/`) và `backup-manifest.json` kèm kiểm tra `PRAGMA integrity_check` và `SHA-256`.
- Bổ sung trang quản trị **Đồng bộ & Sao lưu dữ liệu** (`/dashboard/system` & API `/nori-api/dashboard/system`) hiển thị trực quan chu trình 3 trạng thái dữ liệu, kiểm tra toàn vẹn, Dry-Run Import, Export Snapshot và tạo/khôi phục bản sao lưu ngay trên giao diện Admin.
- Mở rộng `src/hooks/audit-nori.ts` ghi nhận chi tiết giá trị Trước / Sau (`fromStatus` / `toStatus`) đã làm sạch cho các thao tác cập nhật dòng xe, xe thực tế, nội dung website, hình ảnh media và phân quyền Admin.
- Bổ sung bộ kiểm thử `tests/data-sync.test.mjs` (**11 kịch bản kiểm thử chuyên sâu bao phủ 35 tiêu chí `DATA-01..DATA-35`**, nâng tổng số lên **258 Unit Tests**) và kịch bản E2E `/dashboard/system` (**93 Playwright E2E Tests**).

---

## [Phiên bản 2.4.0] — 2026-11-18: Chuẩn Hóa Xác Thực & Phiên Đăng Nhập, Động Cơ Khuyến Mãi Nguyên Tử, Chuyên Mục Bài Viết & Kiểm Toán QA Toàn Diện

### 1. Chuẩn hóa Xác thực, Cách ly Phiên `Customer` / `Admin` & Bảo mật Cookie (`src/lib/session-cookie.ts`, `src/lib/app-auth.ts`)

- Phân tách hoàn toàn phạm vi đăng nhập giữa Khách hàng (`app-session`, thời hạn 7 ngày) và Quản trị viên (`payload-token`, thời hạn 12 giờ), hỗ trợ tham số `scope` tường minh và xử lý triệt để trường hợp trùng email giữa bảng `users` và `admins`.
- Bổ sung mã lỗi chuẩn `403 ADMIN_ROLE_FORBIDDEN` kèm giao diện hướng dẫn chuyển tài khoản khi đang dùng phiên Quản trị viên tại trang Đặt thuê xe (`/checkout`) hoặc Đơn thuê của tôi (`/my-bookings`).
- Tự động suy luận cờ cookie `Secure` và `SameSite` theo giao thức thực tế của Request (`X-Forwarded-Proto` / HTTPS vs HTTP localhost/LAN) và xác thực phiên sống qua `_sid` (`hasActiveSessionRecord`).
- Tự động đồng bộ lại `AuthProvider` khi tab lấy lại tiêu điểm, chuyển trang hoặc khi API trả về `401`.

### 2. Động cơ Khuyến mãi Nguyên tử & Chuẩn hóa Công thức Đặt cọc (`src/lib/promo-service.ts`, `src/lib/rental-rules.ts`)

- Xây dựng `promo-service.ts` dùng chung cho báo giá (`/nori-api/availability`) và giao dịch đặt xe (`/nori-api/bookings`), phân biệt rõ 7 trạng thái mã khuyến mãi (không tồn tại, tạm tắt, sai dịch vụ, chưa đến ngày, hết hạn, hết lượt, chưa đủ ngày thuê tối thiểu).
- Thực thi tăng/hoàn trả lượt sử dụng (`used_count`) nguyên tử ngay trong transaction SQLite kết hợp khóa tuần tự `withBookingWriteLock`, tự động hoàn lượt khi đơn chuyển sang `CANCELLED` hoặc `REJECTED`.
- Tách bạch hoàn toàn Tiền đặt cọc đảm bảo (`depositAmount` / `initialPaymentDue`) khỏi Tổng tiền thuê dự kiến (`estimatedTotal` / `remainingAmount`).

### 3. Chuyên mục Bài viết & Cẩm nang (`/posts`, `/posts/[slug]`), Trình chỉnh sửa Tiêu điểm Hero & Kiểm toán QA

- Bổ sung trang danh mục bài viết `/posts` và chi tiết bài viết `/posts/[slug]` (SSG/ISR), hỗ trợ liên kết bài viết với chương trình khuyến mãi (`20261118_185500_posts_promotion_link`) và trình chọn điểm lấy nét ảnh Hero Carousel (`20261118_120000_hero_slide_focal_point`).
- Bổ sung endpoint kiểm tra sức khỏe hệ thống `/nori-api/health` và công cụ chạy E2E trên cơ sở dữ liệu cô lập `scripts/run-e2e-isolated.mjs` + `scripts/repair-nori-db.mjs`.
- Hoàn thành bộ báo cáo kiểm toán chất lượng toàn diện tại `docs/audit/` với **247 Unit Tests** và **108 Playwright E2E Tests** đạt 100% PASS.

---

## [Phiên bản 2.3.0] — 2026-11-18: Chỉnh Sửa Đơn Chờ Duyệt, Thông Báo & Tư Vấn Sau Duyệt, Hero Carousel CMS & Quản Trị Phương Tiện Động

### 1. Nghiệp vụ Chỉnh sửa Đơn thuê Đang Chờ Duyệt (`PENDING`)

- Bổ sung thao tác **Xem chi tiết** và **Chỉnh sửa thông tin thuê** tại `/my-bookings` kèm bảng đối chiếu **Trước / Sau** và chênh lệch chi phí thời gian thực.
- Khóa chỉnh sửa nghiêm ngặt tại Backend (`PUT /nori-api/bookings`) theo chủ sở hữu, trạng thái `PENDING`, giao dịch `payments` chưa phát sinh, và cơ chế `revision` chống ghi đè khi Admin duyệt đơn đồng thời (`HTTP 409 CONFLICT`).
- Hoán đổi lịch giữ chỗ `rental_days` nguyên tử (loại trừ chính đơn đang sửa qua `excludeBookingId`), lưu đầy đủ `modificationHistory` và `AuditLogs`.

### 2. Thông báo Popup Sau Duyệt & Quy trình Nhân viên Liên hệ Tư vấn

- Bổ sung 2 collections `Notifications` và `Consultations`; tự động kích hoạt idempotent ngay khi đơn chuyển sang `CONFIRMED`.
- Xây dựng `NotificationProvider` + Popup xác nhận đơn thuê (chỉ tự bật 1 lần/sự kiện duyệt, xem lại mọi lúc qua Chuông thông báo trên Header, nêu rõ xác nhận đơn chưa bao gồm thanh toán, tự ẩn nếu đơn bị hủy trước khi đọc).
- Bổ sung bộ tính lịch làm việc kế tiếp (`calculateNextContactSlot`) theo giờ hành chính, ngày làm việc trong tuần và ngày nghỉ lễ cấu hình từ Admin (`Asia/Ho_Chi_Minh`); tự động phát hiện và gắn nhãn `Đơn thuê gấp` cùng bộ lọc trạng thái tư vấn tại `/dashboard/bookings`.

### 3. Chuẩn hóa Hero Carousel Phương tiện & Đồng bộ CMS (`NoriSite`)

- Khắc phục triệt để lỗi ghi đè ảnh phong cảnh và lỗi dừng autoplay do vùng hover quá rộng; chuẩn hóa 5 slide phương tiện sắc nét quản trị trực tiếp từ `/dashboard/content`, đạt chuẩn tiếp cận WCAG 2.2 AA (`target-size >= 28×28px`), giữ nguyên dữ liệu `<SearchBar />` khi chuyển slide.

### 4. Bảo mật Tải Đa Ảnh, Không Gian Quản Trị Dòng Xe 10 Tab & Làm Giàu Dữ Liệu

- Nâng cấp `/nori-api/dashboard/media`: xác thực chữ ký magic-byte (JPEG/PNG/WebP/AVIF), kiểm tra kích thước thực bằng `sharp`, tải nhiều ảnh đồng thời kèm báo cáo từng tệp, và chặn xóa ảnh đang được tham chiếu (`HTTP 409`).
- Nâng cấp `/dashboard/models` thành Workspace 10 tab thích ứng động theo `CAR` / `MOTORBIKE` / `PICKUP` / `Điện (EV)` cùng quản lý đa ảnh cá thể tại `/dashboard/vehicles` và bộ chuyển nguồn ảnh Catalogue / Xe thực tế trên `/vehicles/[slug]`.
- Chuẩn hóa và bổ sung đầy đủ thông số kỹ thuật xác thực cho mẫu xe máy điện `VinFast Evo Max` (`vinfast-evo-max`) và sắp xếp deterministic `reference` trên `/nori-api/fleet`.
- Nâng tổng số bài kiểm thử tự động lên **225 Unit Tests** + **62 Playwright E2E Tests** + **Isolated Admin Test**.

---

## [Phiên bản 2.2.0] — 2026-11-18: Nâng Cấp Toàn Diện UI/UX, Design System, Hero Carousel, Sticky Header, Category Cards & 8 Tabs Chi Tiết Xe

### 1. Nâng cấp Hero Banner & Carousel Tự động (`src/components/home/hero.tsx`)

- **Hệ thống Carousel 5 Slide đại diện cho đầy đủ 5 phân khúc phương tiện**:
  1. Xe Ô tô Phổ thông & SUV (Toyota Vios, Fortuner, Mazda CX-5).
  2. Xe Ô tô Hạng sang (Mercedes-Benz C300 AMG).
  3. Xe Máy & Mô tô Phân khối lớn (Honda SH350i, PCX 160, Kawasaki Z650).
  4. Xe Bán tải Địa hình 4x4 & Hiệu năng cao (Ford Ranger Raptor, Triton Athlete).
  5. Xe Thuần điện Thông minh (VinFast VF 8 EV, VinFast Evo200).
- **Hành vi thông minh & Tiếp cận (Accessibility)**:
  - Tự động chuyển slide sau 6 giây mượt mà với hiệu ứng cross-fade.
  - Hỗ trợ cử chỉ vuốt chạm (Touch Swipe) trên mobile với ngưỡng dịch chuyển 50px.
  - Tự động tạm dừng khi rê chuột (Hover), chạm màn hình (Touch) hoặc nhận tiêu điểm (Focus).
  - Tích hợp nút Tạm dừng / Tiếp tục (Play/Pause accessible toggle) có nhãn ARIA rõ ràng.
  - Tự động nhận diện và tuân thủ `prefers-reduced-motion` của hệ điều hành.
  - Không gây cuộn trang ngoài ý muốn; bảo toàn 100% dữ liệu biểu mẫu tìm kiếm xe khi banner chuyển đổi.

### 2. Cố định & Nâng cấp Thanh điều hướng Header (`src/components/site-header.tsx`)

- **Sticky Header đa nền tảng (Desktop, Tablet, Mobile)**:
  - Thiết lập `sticky top-0 z-40 bg-canvas/95 backdrop-blur-md`.
  - Thanh tiện ích phía trên (Top utility bar) tự động thu gọn êm ái khi cuộn trang (`scrollY > 24px`) giúp tiết kiệm tối đa không gian màn hình.
  - Tự động chuyển sang hiệu ứng đổ bóng mờ sang trọng (`shadow-card border-b border-line/90`) khi ở trạng thái dính.
- **Tối ưu hóa Giao diện Mobile**:
  - Menu di động dạng Drawer trượt xuống hỗ trợ khóa cuộn trang nền (`document.body.style.overflow = 'hidden'`) tránh cuộn lồng nhau.
  - Tương thích hoàn hảo với vùng an toàn `env(safe-area-inset-top)`.
  - Phân tầng Z-index chuẩn hóa: Header (`z-40`), Mobile Bottom Navigation (`z-50`), Dialog/Modal (`z-50`/`z-60`).

### 3. Chuẩn hóa Dropdown, Form Controls & Searchable Select (`src/components/ui/*`)

- **Component `SearchableSelect` mới (`src/components/ui/searchable-select.tsx`)**:
  - Dropdown tùy biến hoàn chỉnh theo Design System NORI, loại bỏ giao diện mặc định thô của hệ điều hành.
  - Tích hợp thanh tìm kiếm nhanh bên trong dropdown, hỗ trợ lọc tức thì danh sách dài (thương hiệu, kiểu dáng, địa điểm).
  - Điều hướng bằng bàn phím (ArrowUp, ArrowDown, Enter, Escape).
  - Tự động đóng khi nhấn phím Escape hoặc nhấn ngoài vùng hiển thị.
  - Áp dụng trực tiếp vào bộ lọc thương hiệu và phân loại xe trên Catalogue (`src/components/catalogue.tsx`).
- **Component `ConfirmDialog` mới (`src/components/ui/confirm-dialog.tsx`)**:
  - Hộp thoại xác nhận thao tác nghiệp vụ quan trọng (hủy đơn, duyệt thanh toán, hoàn cọc).
- **CSS Utility `.no-scrollbar` (`src/app/(frontend)/styles.css`)**:
  - Ẩn thanh cuộn ngang/dọc mặc định của trình duyệt trong khi vẫn bảo toàn 100% khả năng cuộn mượt mà trên chuột và cảm ứng.

### 4. Thẻ Danh Mục Phương Tiện Nâng Cấp (`src/components/home/featured.tsx`)

- **Category Cards với Hình ảnh Chân thực**:
  - Thay thế danh mục icon thô bằng 4 thẻ hình ảnh phương tiện thực tế sắc nét (Ô tô, Xe máy, Bán tải, Xe điện xanh).
  - Hiển thị số lượng dòng xe khả dụng thời gian thực (`X dòng xe khả dụng`).
  - Danh sách huy hiệu kiểu dáng chi tiết (Sedan, SUV, CUV, MPV, Tay ga, Côn tay, PKL, 4x4, ADAS).
  - Toàn bộ card có thể nhấn chuyển hướng trực tiếp đến danh mục xe đã áp dụng bộ lọc tương ứng.

### 5. Nâng cấp 8 Nhóm Tab Trang Chi Tiết Xe (`src/components/vehicle-detail.tsx`)

- **Tổ chức nội dung thành 8 nhóm chuyên biệt**:
  1. _Tổng quan & Thiết kế_: Đoạn giới thiệu, đối tượng phù hợp, các điểm nhấn thiết kế.
  2. _Thông số kỹ thuật_: Bảng thông số kỹ thuật nhóm theo Động cơ, Kích thước, Khung gầm, EV/Bán tải.
  3. _Công nghệ & An toàn_: Danh mục tiện nghi, giải trí, hỗ trợ lái ADAS và an toàn.
  4. _Xe thực tế & ODO_: Danh sách từng xe thực tế trong đội xe (biển số, màu sắc, ODO, kiểm định, lịch sử bảo dưỡng).
  5. _Giá & Chính sách_: Bảng giá thuê, biểu phí phụ trội km/giờ, bảng tính giá lăn bánh tham khảo, điều kiện thuê xe.
  6. _Lịch khả dụng (Tab mới)_: Giao diện lịch trực quan chuyên biệt, hiển thị rõ ràng ngày trống, ngày đã có khách thuê, ngày bảo dưỡng kỹ thuật định kỳ.
  7. _Đánh giá_: Điểm trung bình và nhận xét từ khách hàng đã hoàn thành đơn thuê.
  8. _Liên hệ & Hỗ trợ (Tab mới)_: Hotline tổng đài 24/7, email hỗ trợ, địa chỉ showroom/bãi xe, giờ làm việc và bộ giải đáp thắc mắc thường gặp.
- **Thanh Tab bám dính (Sticky Tab Bar)**:
  - Bám dính bên dưới Header (`sticky top-[4.75rem] z-20`) kèm hiệu ứng mờ hậu cảnh `backdrop-blur-md`.
  - Triệt tiêu hoàn toàn scrollbar thô với class `no-scrollbar`.
  - Chuyển tab tức thì ở client, không reload toàn trang, giữ nguyên trạng thái đặt xe ở sidebar.

### 6. Bổ sung Kịch bản Kiểm thử Nghiệp vụ & Chất lượng

- **`tests/rental-rules.test.mjs`**:
  - Bổ sung 8 test cases chuyên sâu kiểm thử tính giá lăn bánh xe điện 0% thuế trước bạ (`SALE`), thuế trước bạ bán tải 6%, xe máy 2%, xe ô tô lướt 2%, phân tách tiền cọc độc lập với tiền thuê (`DEP`), phụ phí giao xe tận nơi và kiểm tra dữ liệu dịch vụ bổ sung (`RENT`).
  - Nâng tổng số unit test từ **205 lên 213 tests PASS (100%)**.

---

## [Phiên bản 2.1.0] — 2026-11-18: Kiểm định & Hoàn thiện Responsive, PWA, Hiệu năng & Đồng bộ Dữ liệu

### 1. Đồng bộ Dữ liệu & Dynamic Routing

- **`src/app/(frontend)/vehicles/[slug]/page.tsx`**:
  - Bổ sung `export const dynamicParams = true` cho phép Next.js render động theo yêu cầu (On-Demand SSR) các dòng xe mới tạo trong Payload Admin ngoài danh sách 20 slug tĩnh được sinh tại build-time.
  - Thay thế Suspense skeleton tối giản bằng `VehicleDetailSkeleton` hai cột hoàn chỉnh với chiều cao chuẩn `min-h-[1200px]`, triệt tiêu layout shift trong quá trình streaming hydration.
- **`src/hooks/revalidate-nori.ts`**:
  - Nâng cấp `revalidateCatalogue` và `revalidateDeletedCatalogue` với hàm phụ trợ `extractModelSlug` để tự động bóc tách slug dòng xe từ bản ghi xe cụ thể, xóa sạch cache tag `nori-model-${slug}` và `nori-catalogue-v3`.
- **`src/app/(frontend)/nori-api/fleet/route.ts`**:
  - Bổ sung hỗ trợ tra cứu xe đồng thời bằng UUID hoặc `modelSlug`, giúp các thành phần frontend và test script truy vấn danh sách xe vật lý linh hoạt.

### 2. Tối ưu Hiệu năng & Core Web Vitals (CLS Fix)

- **`src/components/vehicle-detail.tsx`**:
  - Khởi tạo giá niêm yết `displayPrice = price ?? fallbackPrice` và cờ xe demo `isDemoActive = selectedVehicle ? selectedVehicle.isDemo : model.hasDemoFleet` ngay tại thời điểm SSR, ngăn ngừa việc giật nhãn/giá khi Client Component hydrate.
  - Bổ sung container có chiều cao cố định `min-h-[20px]` cho dòng thông báo tiền cọc bất đồng bộ.
  - Chuẩn hóa skeleton của dropdown chọn xe (`fleetLoading`) thành `66px` (`h-4 w-28` label + `h-control` input) khớp 100% với kích thước của thẻ `<Select>`.
  - **Kết quả đo đạc**: Đưa chỉ số CLS tại trang chi tiết Toyota Fortuner từ **`0.1327` (và đỉnh `0.1824`) xuống `0.0038`** (đạt xuất sắc ngưỡng CLS ≤ 0.1000). LCP đạt `516ms`, INP đạt `40ms`.

### 3. Nghiệp vụ, Kiểm soát Giao dịch Đồng thời & Bảo mật

- **`src/app/(frontend)/nori-api/dashboard/payments/route.ts`**:
  - Bổ sung cơ chế Idempotency Guard: Tự động kiểm tra các bản ghi thanh toán gần nhất cho cùng `bookingId`. Nếu phát hiện request trùng lặp loại thanh toán và số tiền trong vòng 30 giây, từ chối với mã lỗi `HTTP 409 DUPLICATE_PAYMENT`.
- **`src/lib/api-utils.ts`**:
  - Cải tiến hàm kiểm tra lỗi `apiError` với cơ chế duck-typing (`status in error && typeof error.status === 'number'`), ngăn chặn hiện tượng đóng gói module khác nhau của Turbopack/Next.js làm rơi mất mã trạng thái `409` và biến thành `503`.
- **`src/components/checkout-panel.tsx` & `src/components/auth-provider.tsx`**:
  - Gắn định danh người dùng vào khóa lưu trữ bản nháp giỏ hàng: `nori_checkout_draft:${user?.id ?? 'anon'}:${id}:${startDate}:${endDate}`.
  - Tích hợp hook xóa sạch mọi key `nori_checkout_draft` trong `sessionStorage` khi người dùng đăng xuất.
- **`public/sw.js`**:
  - Bổ sung `/reset-password` vào danh sách tiền tố nhạy cảm (`SENSITIVE_PREFIXES`).
  - Thiết lập bộ lọc chặn cache mọi response chứa header `Set-Cookie` hoặc chỉ thị `no-store` / `private`.
  - Bổ sung listener lắng nghe sự kiện `CLEAR_CACHES` để xóa trắng runtime cache của Service Worker khi người dùng đăng xuất.

### 4. Sao lưu & Quản trị Cơ sở Dữ liệu SQLite

- **`scripts/backup-db.mjs`**:
  - Triển khai lệnh sao lưu trực tuyến an toàn không gián đoạn `VACUUM INTO '<destination>'`.
  - Tích hợp kiểm tra tính toàn vẹn `PRAGMA integrity_check` trên tệp sao lưu.
- **`scripts/restore-db.mjs`**:
  - Triển khai script phục hồi cơ sở dữ liệu có sao lưu an toàn bản hiện tại và kiểm tra khóa ngoại sau khôi phục.
- **`package.json`**:
  - Bổ sung script `"db:backup"` và `"db:restore"`.

### 5. Bộ Kiểm thử Đa nền tảng & Tự động hóa

- **`tests/e2e/data-sync.spec.ts`**:
  - Bổ sung 8 kịch bản E2E kiểm tra đồng bộ dữ liệu động, revalidation hooks, xác thực giá Backend, race condition đặt xe trùng lịch (409), chống trùng lặp thanh toán (409), Service Worker allowlist và cách ly giỏ hàng nháp.
- **`tests/e2e/mobile-webkit.spec.ts`**:
  - Bổ sung 5 kịch bản E2E chạy trên engine WebKit thực tế (mô phỏng Safari trên iPhone 14) kiểm tra toàn bộ luồng tìm xe, lọc chip danh mục, đặt thuê xe, tư vấn mua xe và quản lý tài khoản.
- **Tổng kết kiểm thử**: Đạt **268 / 268 test PASS (100%)** bao gồm 205 unit tests và 63 Playwright E2E tests.
