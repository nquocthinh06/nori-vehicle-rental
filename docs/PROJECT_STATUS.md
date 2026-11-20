# TRẠNG THÁI TỔNG QUAN DỰ ÁN NORI (PROJECT STATUS)

- **Ngày kiểm toán & hoàn thiện**: `2026-11-20`
- **Phiên bản kiến trúc**: **Module 3.7 — Multi-Branch & Multi-Location Management (`v2.7.0`)** trên nền tảng Centralized Admin, Online Payment (`v2.6.0`) & Full-System Performance Hardening (`v2.6.1`) (`Next.js 16.4.6` + `React 19.3.1` + `Payload CMS 4.0.0-beta.8` + `SQLite`)
- **Kết luận nghiệm thu kỹ thuật**: Hệ thống **vận hành hoàn chỉnh mô hình đa chi nhánh, đa kho xe, đa điểm nhận trả, điều chuyển phương tiện nguyên tử, giao nhận tận nơi, định giá theo địa điểm, phân quyền RBAC theo chi nhánh và báo cáo không đếm trùng** trên local dev, production standalone build và cơ sở dữ liệu SQLite (`109` bảng, `0` lỗi khóa ngoại). Toàn bộ **406 automated tests** (**305** unit/integration/resilience/multi-branch + **100** Playwright E2E trên DB & Media cô lập + **1** Isolated Admin Test) đạt **100% PASS (0 FAIL, 0 SKIPPED)**, kèm **3× chạy lặp độc lập** đạt `9/9 PASS` trên luồng đa chi nhánh và benchmark mở rộng đạt `5.54 ms` báo cáo ở quy mô `100 chi nhánh / 10,000 xe / 100,000 đơn`.
- **Phân loại mức độ sẵn sàng triển khai (Release Gate)**:
  - **Sẵn sàng kỹ thuật, Dev, Standalone Production Build & Isolated Verification**: **`PASS (100%)`** (Build `104/104` static/SSG, Typecheck, Lint, Format, Media Audit, Data Sync, Multi-Branch Unit/Integration/E2E 3×, Scalability Benchmark, Security/RBAC/IDOR, Concurrency, Backup & Restore).
  - **Sẵn sàng Thương mại / Vận hành Tiền thật (`PRODUCTION`)**: **`CONDITIONAL PASS — CHƯA MỞ PRODUCTION`** do: (1) 21 xe hiện tại vẫn là dữ liệu minh họa `DEMO` (`allocationStatus: 'UNALLOCATED'`), chưa khai báo chi nhánh/kho thực tế đã xác minh của doanh nghiệp; (2) chưa cấu hình SePay Merchant credentials / HTTPS Webhook thật (`PAYMENT_MODE=mock`, `PAYMENT_PRODUCTION_APPROVED=false`); (3) chưa có `figma make verify-deploy` và dữ liệu Field RUM p75.

---

## 1. Tổng hợp Kết quả Kiểm thử & Kiểm toán (`v2.7.0`)

| Hạng mục                                    | Công cụ                                                          | Kết quả quan sát                                                                                                                        | Trạng thái |
| :------------------------------------------ | :--------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :--------: |
| `pnpm lint`                                 | `scripts/static-lint.mjs`                                        | `233/233` tệp (`0` lỗi AST / `assertOrigin` / rò rỉ secret client)                                                                      |   `PASS`   |
| `pnpm typecheck`                            | `tsc --noEmit`                                                   | `0` lỗi TypeScript (`ignoreBuildErrors` chỉ bật khi `FIGMA=1`)                                                                          |   `PASS`   |
| `pnpm media:audit` & `pnpm data:validate`   | `scripts/media-validate.ts`, `data-sync.ts`                      | `81/81` DB media & `67/67` snapshot media hợp lệ, `12/12` snapshot files đạt chuẩn, `0` lỗi nhạy cảm/FK/schema                          |   `PASS`   |
| `pnpm test`                                 | Node Test Runner (`v24.22.3`)                                    | **`305/305 PASS`** (`9` suites: gồm `multi-branch-rules`, `multi-branch-integration`, `payment-*`, `data-sync`, `rbac`, `rental-rules`) |   `PASS`   |
| `pnpm test:admin`                           | `scripts/test-admin-isolated.mjs`                                | `ISOLATED_ADMIN_TEST_PASS` (seed idempotent, PBKDF2-SHA256, `integrity = ok`, `fk = 0`)                                                 |   `PASS`   |
| `pnpm build` (`payload build`)              | Next.js 16 Production Build                                      | `104/104` trang tĩnh/SSG (`○`/`●`), `0` route công khai bị `ƒ (Dynamic)`, `0` cảnh báo Turbopack                                        |   `PASS`   |
| `multi-branch-workflow.spec.ts` (3× repeat) | Playwright Chromium (3 DB cô lập độc lập)                        | **`9/9 PASS`** (`0` flake, `postIntegrity = ok`, `fk = 0`, `0` leftover users)                                                          |   `PASS`   |
| `pnpm test:e2e:isolated`                    | Playwright Chromium & Mobile WebKit                              | **`100/100 PASS`** (`13` spec files trên DB + Media cô lập, `postIntegrity = ok`, `fk = 0`, `0` leftover users)                         |   `PASS`   |
| `pnpm perf:multi-branch`                    | `scripts/benchmark-multi-branch.mjs` (DB cô lập)                 | `100 CN / 10k Xe / 100k Đơn (82.25 MB)`: xe CN `0.086 ms`, timeline `0.044 ms`, báo cáo `5.541 ms`, `5,974 tx/s`, `0` full scan         |   `PASS`   |
| **TỔNG CỘNG TEST AUTOMATION**               | **Unit + Integration + Resilience + Multi-Branch + Admin + E2E** | **`406 / 406 TEST PASS (100%)`**                                                                                                        | **`PASS`** |
| Tính toàn vẹn `./nori.db` gốc               | `node:sqlite` (`readOnly`)                                       | `109` bảng (`+21` additive), `journal_mode = wal`, `PRAGMA integrity_check = ok`, `fkViolations = 0`, giữ nguyên 100% dữ liệu gốc       |   `PASS`   |
| Bản sao lưu nhất quán trước migration       | `pnpm db:backup`                                                 | `backups/nori-backup-2026-11-20T08-35-21-746Z.db` + `81` media (`3,216 KB`, `integrity = ok`, `fk = 0`)                                 |   `PASS`   |
| SePay Sandbox / Live Webhook HTTPS          | External SePay Gateway                                           | Chưa cấu hình credentials merchant & HTTPS public domain                                                                                | `BLOCKED`  |
| `figma make verify-deploy`                  | Cloud CLI                                                        | Không có binary `figma` CLI trên shell Windows cục bộ                                                                                   | `NOT_RUN`  |

---

## 2. Các Phân Hệ Trọng Điểm Đã Hoàn Thiện

1. **Quản lý Đa Chi Nhánh & Đa Địa Điểm (`v2.7.0` — Module 3.7)**:
   - **10 Collections mới & Migration Additive-Only (`88 → 109` bảng)**: `Branches`, `Warehouses`, `ServiceLocations`, `BranchStaff`, `VehicleTransfers`, `VehicleLocationHistory`, `DeliveryZones`, `DeliveryJobs`, `LocationPricingRules`, `OneWayRentalRules` cùng 12+ composite indexes tối ưu truy vấn chi nhánh/timeline/báo cáo; bảo toàn 100% dữ liệu hiện hữu (`21` xe DEMO ở `UNALLOCATED`).
   - **Động cơ Timeline Vị trí P0, Điều chuyển Nguyên tử & Giao nhận Tận nơi**: Tính vị trí vật lý theo thời gian thực (`evaluateVehicleLocationTimeline`), giao dịch điều chuyển 9 trạng thái ACID kèm Optimistic Locking và rollback nguyên tử, chặn xung đột lịch nhân viên giao nhận (`409`).
   - **Định giá 5 tầng, Thuê Một Chiều & RBAC Chi nhánh**: Ưu tiên `VEHICLE_BRANCH > MODEL_BRANCH > VEHICLE_BASE > BRANCH_DEFAULT > GLOBAL_DEFAULT`, snapshot giá bất biến, 8 vai trò chức danh × 20 phân hệ × phạm vi chi nhánh (`ALL`/`ASSIGNED`), chống leo thang/IDOR, thu hồi quyền tức thì và báo cáo đa chi nhánh không cộng trùng doanh thu.
   - **8 Không gian Quản trị Mới & Nâng cấp Toàn bộ Frontend Khách hàng**: `/dashboard/{branches,warehouses,locations,staff,transfers,deliveries,location-pricing,branch-reports}` cùng `SearchBar`, `Catalogue`, `VehicleCard`, `VehicleDetail`, `CheckoutPanel`, `BookingsPanel` hỗ trợ chọn chi nhánh nhận/trả, thuê một chiều và giao nhận tận nơi.
2. **Kiểm toán Hiệu năng, Tối ưu Media & Chuẩn hóa Production (`v2.6.1`)**:
   - Pipeline nén ảnh WebP runtime (`media-optimizer.ts`), `push: false` + SQLite WAL, `getCatalogueSummary()`, `scripts/start-standalone.mjs`, `.agents/skills/nori-performance/SKILL.md`.
3. **Hệ thống Thanh toán Trực tuyến (`v2.6.0`)**:
   - Payment Adapter Pattern (`SePay`, `Mock`, `Manual`, mở rộng 4 cổng), tách bạch doanh thu thuê và cọc tài sản, idempotency Webhook, đối soát, hoàn tiền và 10 kịch bản chịu lỗi.
4. **Đồng bộ Dữ liệu, Bảo mật, RBAC & PWA (`v2.4.0 – v2.5.0`)**:
   - Git Snapshot & Media Sync (`data/snapshots/`, `media/seed/`), `dynamicParams = true` + `revalidateTag` hooks, kiểm soát concurrency 409 + optimistic locking và PWA Service Worker v2.
