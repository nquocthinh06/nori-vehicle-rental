# BÁO CÁO KIỂM THỬ SMART VEHICLE IMPORT — NORI (`v2.8.0`)

- **Ngày kiểm thử**: `2026-11-28`
- **Phiên bản**: `v2.8.0` — Smart Vehicle Import (5 phương thức, 10 Adapter OEM, VehicleImportJobs State Machine)
- **Node.js**: `v24.22.3`, Windows, DB & Media cô lập
- **Tác giả kiểm thử**: `@verifier` (xác minh tự động) + `@docs-writer` (biên soạn báo cáo)

> Báo cáo này tổng hợp **toàn bộ kết quả kiểm thử thực tế** cho module Smart Vehicle Import từ hai bộ kiểm thử:
> `tests/vehicle-import.test.mjs` (unit/integration) và `tests/e2e/vehicle-import.spec.ts` (Playwright E2E cô lập).

---

## 1. Tóm Tắt Kết Quả

| Bộ kiểm thử | Lệnh | Kết quả | Trạng thái |
| :---------- | :--- | :------ | :--------: |
| **Unit/Integration — Smart Vehicle Import** | `pnpm test` (`tests/vehicle-import.test.mjs`) | `5/5` subtests PASS | **`PASS`** |
| **E2E — Smart Vehicle Import** | `pnpm test:e2e:isolated tests/e2e/vehicle-import.spec.ts` | `3/3` test groups PASS (`E2E-01..15`) | **`PASS`** |
| **Toàn bộ unit tests** | `pnpm test` | **`374/375 PASS`**, `1 skip` (Postgres live parity — `NORI_PG_PARITY_URL` chưa cấu hình), `0 fail` (`30,436ms`) | **`PASS`** |
| **Toàn bộ Playwright E2E** | `pnpm test:e2e:isolated` | **`122/122 PASS`**, `6.6 phút`, `postIntegrity=ok`, `postFkViolationsCount=0`, `newLeftoverTestUsersCount=0` | **`PASS`** |
| **DB Replication & Backup** | `pnpm test:db:replica` | **`20/20 PASS`** (`132.91s`) | **`PASS`** |
| **Release Gate** | `pnpm release:gate` | **`9/9 PASS`** (`env:check`, `format:check`, `typecheck`, `lint`, `media:audit`, `test`, `test:admin`, `db:check`, `build`), build `163.40s`, `114` static/SSG pages | **`PASS`** |

---

## 2. Kiểm Thử Unit/Integration — `tests/vehicle-import.test.mjs`

### 2.1. Thống kê tổng thể

- **Số subtests (`it(...)`)**: `5` subtests, tất cả `PASS` (nằm trong `pnpm test`: `374/375 PASS`, `1 skip`, `0 fail`)
- **Bao phủ**: 10 OEM Adapters + Generic, SSRF & Security, Normalizer & PDF, Media Processor, Job State Machine

### 2.2. Subtest 1 — Manufacturer Adapters (10 Nhà Sản Xuất VN + Generic)

| Adapter | Nhà sản xuất | Kết quả | Domain chính thức (`security.ts`) |
| :------ | :----------- | :-----: | :-------------------------------- |
| `toyota` | Toyota VN | `PASS` | `toyota.com.vn` |
| `honda` | Honda VN | `PASS` | `honda.com.vn` |
| `ford` | Ford VN | `PASS` | `ford.com.vn` |
| `mitsubishi` | Mitsubishi VN | `PASS` | `mitsubishi-motors.com.vn` |
| `mazda` | Mazda VN | `PASS` | `mazdamotors.vn` |
| `hyundai` | Hyundai VN | `PASS` | `hyundai.thanhcong.vn` |
| `mercedes-benz` | Mercedes-Benz VN | `PASS` | `mercedes-benz.com.vn` |
| `vinfast` | VinFast | `PASS` | `vinfastauto.com` |
| `yamaha` | Yamaha Motor VN | `PASS` | `yamaha-motor.com.vn` |
| `kawasaki` | Kawasaki VN | `PASS` | `kawasakivietnam.vn` |
| `generic` | Generic Adapter | `PASS` | Fallback cho domain ngoài danh sách OEM chuyên biệt |

> [!NOTE] Reachability thực tế từ môi trường phát triển: Nhiều trang OEM áp dụng WAF/CAPTCHA (`UPSTREAM_WAF_BLOCKED`), TLS legacy hoặc timeout. Adapters phát hiện tự động và gợi ý fallback sang **PDF Brochure** / **NORI JSON/CSV** / **Nhập thủ công**. Xem chi tiết tại [docs/MANUFACTURER_ADAPTERS.md](./MANUFACTURER_ADAPTERS.md).

### 2.3. Subtest 2 — SSRF & Security

Mọi kiểm tra đều thực thi qua `src/lib/vehicle-import/security.ts` và `src/lib/vehicle-import/fetcher.ts`:

| Kịch bản | Input / Điều kiện | Kết quả mong đợi | Trạng thái |
| :------- | :---------------- | :--------------- | :--------: |
| Chặn giao thức không phải HTTPS | `http://www.toyota.com.vn/fortuner` | `ImportSecurityError` (`HTTPS_REQUIRED`) | `PASS` |
| Chặn thông tin xác thực nhúng trong URL | `https://user:pass@www.toyota.com.vn/fortuner` | `ImportSecurityError` (`URL_CREDENTIALS_FORBIDDEN`) | `PASS` |
| Chặn cổng ngoài `443` | `https://www.toyota.com.vn:8443/fortuner` | `ImportSecurityError` (`PORT_FORBIDDEN`) | `PASS` |
| Chặn hostname nội bộ | `https://localhost/admin` | `ImportSecurityError` (`SSRF_LOCAL_HOST`) | `PASS` |
| Chặn IP literal trực tiếp | `https://127.0.0.1/secret` | `ImportSecurityError` (`IP_LITERAL_FORBIDDEN`) | `PASS` |
| Chặn domain không trong allowlist | `https://evil.example.com/car` | `ImportSecurityError` (`DOMAIN_NOT_ALLOWLISTED`) | `PASS` |
| Chặn DNS phân giải ra IP riêng tư | `169.254.169.254`, IPv4 RFC 1918, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:127.0.0.1`, `64:ff9b::/96` | `ImportSecurityError` (`SSRF_PRIVATE_IP`) | `PASS` |
| Chặn redirect tới địa chỉ nội bộ & vượt > 3 hop | Redirect `302` → `http://127.0.0.1/...` hoặc vòng lặp > 3 hop | Chặn ở `validateImportUrl` / `ImportFetchError` (`TOO_MANY_REDIRECTS`) | `PASS` |
| Phát hiện WAF / CAPTCHA không bypass | HTTP `403` + `"Access Denied - Cloudflare Turnstile"` | `ImportFetchError` (`UPSTREAM_WAF_BLOCKED`) | `PASS` |
| Magic bytes, anti-XSS & payload nhúng độc hại | Ảnh giả chứa `<script>` / `<?php`, filename traversal `../../etc/passwd`, HTML entities XSS | `detectImageMagicBytes = null`, `containsSuspiciousBinaryPayload = true`, `stripHtmlAndXss` loại bỏ script/event handlers | `PASS` |

### 2.4. Subtest 3 — Normalizer & PDF Extractor

| Kịch bản | Kết quả | Trạng thái |
| :------- | :------ | :--------: |
| Chuẩn hóa thông số EV (loại bỏ `Dung tích bình xăng`, `Số xi-lanh`, giữ `EV`) | Đúng spec EV rules (`verificationStatus = VERIFIED`) | `PASS` |
| Chuẩn hóa thông số xe máy (chặn thông số nội thất/ghế ô tô, bỏ ảnh `INTERIOR`) | `seats = 2`, `driveType = null`, `interiorOverview = null`, cảnh báo `market != VN` | `PASS` |
| PDF brochure extraction (`/FlateDecode`) → `pageRef` đúng trang, `uncertaintyFlags` gắn `REVIEW` | `pageRef = 1`, phát hiện giá trị ước lượng `~10.5 lit/100km` | `PASS` |
| PDF scan không có text layer | Gắn `uncertaintyFlags` cho `pdfTextLayer` | `PASS` |

> [!NOTE] Bug đã vá: `normalizer.ts` / `adapters/generic.ts` sử dụng regex thiếu Unicode-aware word boundary dẫn đến cắt nhầm ký tự tiếng Việt. Đã sửa trong commit của `@import-architect` (#60).

### 2.5. Subtest 4 — Media Processor (`src/lib/vehicle-import/media-processor.ts`)

| Kịch bản | Kết quả | Trạng thái |
| :------- | :------ | :--------: |
| Kiểm tra magic bytes ảnh & kích thước qua `sharp` | Loại bỏ payload giả chứa `<script>` (`status: 'FAILED'`) | `PASS` |
| SHA-256 deduplication trong cùng batch import | Ảnh trùng hash được đánh dấu `status: 'DEDUPLICATED'`, không tạo bản ghi thứ 2 | `PASS` |
| SHA-256 deduplication xuyên job (cross-job) | Tái sử dụng `mediaId` sẵn có trong DB | `PASS` |

### 2.6. Subtest 5 — Job State Machine (`job-manager.ts` & `import-service.ts`)

| Kịch bản | Kết quả | Trạng thái |
| :------- | :------ | :--------: |
| Chuyển trạng thái hợp lệ (`QUEUED → FETCHING`, `FAILED → QUEUED`, chặn `COMPLETED → QUEUED`) | Đúng `LEGAL_JOB_TRANSITIONS` | `PASS` |
| Phục hồi stale job khi khởi động lại máy chủ (`recoverStaleImportJobs`) | Job treo quá 10 phút chuyển sang `FAILED` kèm `errorCode: 'RECOVERED_AFTER_RESTART'` | `PASS` |
| Giới hạn đồng thời (`MAX_CONCURRENT_IMPORT_JOBS = 3`) & hủy job | Job thứ 4 bị từ chối với HTTP `429` (`CONCURRENCY_LIMIT_REACHED`); job đã `CANCELLED` bị chặn tiếp tục (`409 JOB_CANCELLED`) | `PASS` |
| Diff Preview, `lockedFields` & bảo vệ giá thuê NORI nội bộ | Trường `shortDescription` bị khóa (`locked = true`, `selected = false`) được giữ nguyên; `referenceRentPrice` và `defaultDepositSuggestion` không bao giờ bị ghi đè | `PASS` |
| Approve idempotent & tăng `revisionNumber` | Không tạo trùng bản ghi `vehicle-models`, `revisionNumber` tăng `3 → 4` | `PASS` |
| Rollback & chặn double-rollback | Khôi phục nguyên trạng bản ghi trước import (`revisionNumber` về `3`); gọi rollback lần 2 trả HTTP `409` (`"Tiến trình này đã được Rollback trước đó."`) | `PASS` |

---

## 3. Kiểm Thử E2E — `tests/e2e/vehicle-import.spec.ts`

### 3.1. Thống kê

- **Tổng số test groups**: `3` (`E2E-01..03`, `E2E-04..12`, `E2E-13..15`), tất cả `PASS`
- **Thời gian thực thi**: `~15.8s` (`E2E-01..03`: `800ms`, `E2E-04..12`: `5.8s`, `E2E-13..15`: `9.2s`)
- **DB integrity sau chạy**: `postIntegrity=ok`, `postFkViolationsCount=0`, `newLeftoverTestUsersCount=0`

### 3.2. `E2E-01..03` — Bảo Mật RBAC, CSRF Origin & SSRF (`800ms`)

| Kiểm tra | Mô tả trong `vehicle-import.spec.ts` | Kết quả | Trạng thái |
| :------- | :----------------------------------- | :------ | :--------: |
| Chưa đăng nhập | `GET /nori-api/dashboard/catalogue-import/jobs` không có cookie | `403` | `PASS` |
| Cross-origin CSRF (`assertOrigin`) | `POST /preview` với `Origin: https://evil.example.com` | `403` | `PASS` |
| Khách hàng đã đăng nhập (Customer RBAC) | Tài khoản `users` gọi `GET /jobs` & `POST /preview` | `403` | `PASS` |
| Admin gửi URL SSRF | `http://...`, `https://127.0.0.1/admin`, `https://localhost/internal`, `https://evil-untrusted-domain.example/car` | `400` (không fetch ra ngoài) | `PASS` |

### 3.3. `E2E-04..12` — Admin Smart Import Drawer UI bên trong `/dashboard/models` (`5.8s`)

Kiểm tra giao diện **`<SmartImportDrawer />`** tích hợp trong **`/dashboard/models`** với 6 tab và luồng Preview / Lock / Publish / Rollback:

| Bước kiểm thử | Mô tả | Trạng thái |
| :------------ | :---- | :--------: |
| Toolbar & Filters `/dashboard/models` | Kiểm tra đủ 6 nút thao tác & 3 bộ lọc (`#model-brand-filter`, `#model-ver-filter`, `#model-visible-filter`) | `PASS` |
| 6 Tab của `<SmartImportDrawer />` | Website hãng, Tìm kiếm thông minh, Nhập hàng loạt, Brochure PDF, Nhập thủ công, Lịch sử nhập liệu | `PASS` |
| Tab `AI_SEARCH` + Unsaved-Changes Guard | Tìm kiếm ở chế độ `NORI_AI_TEST_MOCK=1`, hiện preview, bấm `Hủy` kích hoạt dialog xác nhận `"Đóng trình nhập thông minh?"` | `PASS` |
| Tab `BULK` (NORI JSON) + `VERIFIED_HIDDEN` | Phân tích danh sách, xem `"Xem trước trước khi lưu"`, xác nhận nhập dữ liệu | `PASS` |
| Re-import Diff + Khóa trường + Xuất bản | Đối chiếu diff 2 lần nhập, khóa `Mô tả ngắn` (`PATCH .../models/[id]/locks`), bấm `Lưu & Xuất bản` | `PASS` |
| Nguồn Catalogue & Tách biệt `DEMO` Fleet | Trang công khai hiển thị `"Thông số & phiên bản hãng (không phải DEMO)"`, giữ nguyên `short_description` đã khóa; `/vehicles/toyota-fortuner` vẫn giữ `"Có xe thực tế (DEMO)"` — việc import `vehicle_models` **không** động chạm hay tạo bản ghi đội xe `vehicles` (`isDemo`) | `PASS` |
| Tab `PDF_BROCHURE` | Tải tệp PDF Brochure, trích xuất thông số có flag `"Cần xác minh"`, lưu & xuất bản | `PASS` |
| Tab `Lịch sử nhập liệu` + Rollback | Bấm `"Khôi phục phiên bản trước"` → `"Xác nhận khôi phục"` → hiển thị thông báo `"Đã khôi phục dòng xe..."` | `PASS` |

### 3.4. `E2E-13..15` — CLI `scripts/catalogue-cli.mjs` (`9.2s`)

| Kiểm tra | Lệnh | Kết quả | Trạng thái |
| :------- | :--- | :------ | :--------: |
| E2E-13 | `node scripts/catalogue-cli.mjs validate` | Chứa `ok=true` (`files=12`, `media=67`) | `PASS` |
| E2E-14 | `node scripts/catalogue-cli.mjs status --model toyota-fortuner --db <dbPath>` | Chứa `toyota-fortuner` | `PASS` |
| E2E-15 | `node scripts/catalogue-cli.mjs import --dry-run --db <dbPath>` | Chứa `DRY_RUN` (không ghi DB) | `PASS` |

---

## 4. Lỗi Phát Hiện & Khắc Phục Trong Quá Trình Kiểm Thử

### 4.1. Lỗi P0 — Cột `_media_v.version_source_sha256` Thiếu Trong Migration

- **Phát hiện**: `@verifier` trong quá trình chạy E2E — `115/122` PASS ban đầu, 7 lỗi liên quan đến cột thiếu
- **Nguyên nhân**: Migration SQLite và PostgreSQL chưa thêm cột `version_source_sha256` vào bảng `_media_v`
- **Khắc phục**: `@import-architect` (#60) thêm cột vào cả hai migration, `data-sync.ts` schema check và `check-db-schema.mjs` contract
- **Kết quả sau vá**: Full `pnpm test:e2e:isolated` đạt `122/122 PASS`

### 4.2. Lỗi — Unicode Regex trong Normalizer

- **Phát hiện**: `@verifier` (#32) — bộ kiểm thử Normalizer cắt nhầm ký tự tiếng Việt
- **Nguyên nhân**: Regex word boundary `\b` không nhận diện đúng ký tự Unicode tiếng Việt
- **Khắc phục**: `@import-architect` (#60) — cập nhật word boundary hỗ trợ Unicode trong `normalizer.ts` và `adapters/generic.ts`
- **Kết quả**: Subtest Normalizer `PASS`

### 4.3. Lỗi — Cache Invalidation Ngoài Scope Next.js Trong `import-service.ts`

- **Phát hiện**: `@verifier` (#32) — Node test runner không thể gọi trực tiếp `revalidateTag`/`revalidatePath` của `next/cache` ngoài Next request scope
- **Khắc phục**: `@import-architect` (#60) — bọc dynamic import `await import('../public-cache.ts')` trong `safeInvalidateCatalogueCaches()` kèm `try/catch` an toàn
- **Kết quả**: Subtest Job State Machine `PASS`

### 4.4. Flake — `mobile-webkit.spec.ts` Journey 2 (`specsTab.click()`)

- **Phát hiện**: `@verifier` (#72) — `specsTab.click()` đôi khi nhận `aria-selected="false"` ngay sau click do hydration chậm trên Mobile WebKit
- **Khắc phục**: Thêm `waitUntil: 'load'` trước thao tác và `.toPass()` retry chờ hydration hoàn tất
- **Kết quả**: `tests/e2e/mobile-webkit.spec.ts` chạy đơn lẻ `PASS`, và toàn bộ `pnpm test:e2e:isolated` đạt `122/122 PASS`

---

## 5. Trạng Thái Neon PostgreSQL & Replication (BLOCKED)

> [!WARNING] Các kiểm thử đồng bộ trực tiếp với Neon Production hiện đang `BLOCKED`.

| Hạng mục | Trạng thái hiện tại | Lý do BLOCKED |
| :------- | :------------------ | :------------ |
| Neon PG `wal_level` | `wal_level = "replica"` (`PostgreSQL 17.12`) | Neon hiện đang cấu hình `wal_level = replica`, chưa bật `wal_level = logical` |
| Logical Replication `PUBLICATION` | Chưa tạo được | Phụ thuộc bật `wal_level = logical` và khởi động lại compute trên Neon |
| `SUBSCRIPTION` trên Local PG 18 | Chưa tạo được | Phụ thuộc `PUBLICATION nori_pub` trên Neon |
| Neon pending migrations | `2` migrations chưa áp dụng | `20261128_010000_ai_assistant_foundation`, `20261128_020000_vehicle_import_jobs` |
| Neon table count | `109` bảng (cần `118` sau migrations) | 2 pending migrations chưa áp dụng |

**Hành động cần thực hiện**: Cần **chủ dự án phê duyệt bật `wal_level = logical` trong Neon Console (khởi động lại compute), áp dụng `2` pending migrations và tạo `PUBLICATION nori_pub`** trước khi kích hoạt Live Subscription sang Local PG 18 `nori_replica`. Xem hướng dẫn chi tiết tại [docs/DATABASE_REPLICATION.md](./DATABASE_REPLICATION.md).

---

## 6. Catalogue Enrichment — 21 Dòng Xe

| Hạng mục | Số liệu | Trạng thái |
| :------- | :------ | :--------: |
| Tổng số dòng xe (`vehicle_models`) | `21` | ✅ |
| `VERIFIED` (xác minh đầy đủ) | `11` | ✅ |
| `NEEDS_BROCHURE_CHECK` (cần kiểm tra thêm brochure) | `10` | ⚠️ |
| `pnpm catalogue:validate` | `ok=true`, `files=12`, `media=67` | `PASS` |

> [!TIP] Các dòng xe `NEEDS_BROCHURE_CHECK` có thể sử dụng tab **Nhập từ Brochure PDF** trong `<SmartImportDrawer />` tại `/dashboard/models` để bổ sung thông số từ brochure chính thức của nhà sản xuất.

---

## 7. API Contract Đã Xác Minh (9 Routes)

Tất cả 9 route dưới `/nori-api/dashboard/catalogue-import/*` dùng `requireAdmin({ permission: ['models', 'read' | 'create' | 'update'] })` và `assertOrigin(request)` trên mọi mutation:

| Endpoint | Method | Chức năng | Trạng thái |
| :------- | :----- | :-------- | :--------: |
| `/nori-api/dashboard/catalogue-import/jobs` | `GET` | Danh sách jobs (`items`, `totalDocs`, `page`, `totalPages`, `activeCount`, `maxConcurrency`, `aiAvailable`, `aiReason`) | ✅ |
| `/nori-api/dashboard/catalogue-import/preview` | `POST` | Tạo job & xem trước diff (JSON hoặc `multipart/form-data`) | ✅ |
| `/nori-api/dashboard/catalogue-import/sync-check` | `POST` | Kiểm tra đồng bộ lại thông số một dòng xe hiện hữu từ nguồn OEM | ✅ |
| `/nori-api/dashboard/catalogue-import/jobs/[id]` | `GET` | Chi tiết job (`{ job }`) | ✅ |
| `/nori-api/dashboard/catalogue-import/jobs/[id]/approve` | `POST` | Duyệt job → trả `{ job, model: { id, slug, name, verificationStatus, visible, revisionNumber }, mediaReport }` | ✅ |
| `/nori-api/dashboard/catalogue-import/jobs/[id]/cancel` | `POST` | Hủy job đang chờ/chạy (`{ job }`) | ✅ |
| `/nori-api/dashboard/catalogue-import/jobs/[id]/retry` | `POST` | Chạy lại job `FAILED` / `CANCELLED` | ✅ |
| `/nori-api/dashboard/catalogue-import/jobs/[id]/rollback` | `POST` | Khôi phục `vehicle-models` từ `rollbackSnapshot` | ✅ |
| `/nori-api/dashboard/catalogue-import/models/[id]/locks` | `PATCH` | Cập nhật `lockedFields` → trả `{ id, lockedFields, revisionNumber }` | ✅ |

---

## 8. Liên Kết Tài Liệu Liên Quan

- [docs/SMART_VEHICLE_IMPORT.md](./SMART_VEHICLE_IMPORT.md) — Hướng dẫn admin đầy đủ 5 phương thức import
- [docs/MANUFACTURER_ADAPTERS.md](./MANUFACTURER_ADAPTERS.md) — Kiến trúc adapter 10 OEM + Generic
- [docs/IMPORT_SECURITY.md](./IMPORT_SECURITY.md) — SSRF defense-in-depth, RBAC, Audit Logging
- [docs/VEHICLE_CATALOGUE.md](./VEHICLE_CATALOGUE.md) — Tiêu chuẩn làm phong phú catalogue
- [docs/DATABASE_TEST_REPORT.md](./DATABASE_TEST_REPORT.md) — Báo cáo kiểm thử DB replication & backup
- [docs/TEST_REPORT.md](./TEST_REPORT.md) — Báo cáo kiểm thử tổng hợp toàn hệ thống
