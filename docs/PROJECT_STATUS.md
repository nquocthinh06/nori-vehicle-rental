# TRẠNG THÁI TỔNG QUAN DỰ ÁN NORI (PROJECT STATUS)

- **Ngày kiểm toán & hoàn thiện**: `2026-11-20`
- **Phiên bản kiến trúc**: **Hệ Thống Thanh Toán, Nhất Quán Dữ Liệu & Tối Ưu Hóa Responsive (`v2.7.1`)** trên nền tảng Module 3.7 Multi-Branch & Multi-Location (`v2.7.0`), Centralized Admin, Online Payment (`v2.6.0`) & Full-System Performance Hardening (`v2.6.1`) (`Next.js 16.4.6` + `React 19.3.1` + `Payload CMS 4.0.0-beta.8` + `SQLite`)
- **Kết luận nghiệm thu kỹ thuật**: Hệ thống **hoàn tất kiểm toán toàn diện nghiệp vụ thanh toán, phân định rành mạch giữa doanh thu dịch vụ thuê xe và tài sản bảo đảm thế chấp (xử lý dứt điểm trường hợp 13.010.000 ₫ vs 15.000.000 ₫), triển khai kế hoạch thanh toán cọc 30% vs thanh toán 100% cho khách hàng, bổ sung chốt chặn tài chính trước giao xe và tất toán sau trả xe, tối ưu toàn diện giao diện responsive đa thiết bị (Full-screen Drawer Menu, Mobile Bottom Sheet cho Admin Menu, chặn iOS auto-zoom 16px, chống tràn màn hình)**. Toàn bộ các bộ kiểm thử tự động đạt **100% PASS (0 FAIL, 0 SKIPPED)**.
- **Phân loại mức độ sẵn sàng triển khai (Release Gate)**:
  - **Sẵn sàng kỹ thuật, Dev, Standalone Production Build & Isolated Verification**: **`PASS (100%)`** (Build `104/104` static/SSG, Typecheck, Lint, Format, Media Audit, Data Sync, Multi-Branch Unit/Integration/E2E, Payment Business Audit Suite, Security/RBAC/IDOR, Concurrency, Backup & Restore).
  - **Sẵn sàng Thương mại / Vận hành Tiền thật (`PRODUCTION`)**: **`CONDITIONAL PASS — CHƯA MỞ PRODUCTION`** do: (1) 21 xe hiện tại vẫn là dữ liệu minh họa `DEMO` (`allocationStatus: 'UNALLOCATED'`), chưa khai báo chi nhánh/kho thực tế đã xác minh của doanh nghiệp; (2) chưa cấu hình SePay Merchant credentials / HTTPS Webhook thật (`PAYMENT_MODE=mock`, `PAYMENT_PRODUCTION_APPROVED=false`); (3) chưa có `figma make verify-deploy` và dữ liệu Field RUM p75.

---

## 1. Tổng hợp Kết quả Kiểm thử & Kiểm toán (`v2.7.1`)

| Hạng mục                                  | Công cụ                                                          | Kết quả quan sát                                                                                                                                              | Trạng thái |
| :---------------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------: |
| `pnpm lint`                               | `scripts/static-lint.mjs`                                        | `237/237` tệp (`0` lỗi AST / `assertOrigin` / rò rỉ secret client)                                                                                            |   `PASS`   |
| `pnpm typecheck`                          | `tsc --noEmit`                                                   | `0` lỗi TypeScript (`ignoreBuildErrors` chỉ bật khi `FIGMA=1`)                                                                                                |   `PASS`   |
| `pnpm format:check`                       | `oxfmt --check`                                                  | `304/304` tệp chuẩn định dạng code                                                                                                                            |   `PASS`   |
| `pnpm db:check`                           | `scripts/check-db-schema.mjs`                                    | `109` bảng, `PRAGMA integrity_check = ok`, `0` FK violations, `0` pending migrations                                                                          |   `PASS`   |
| `pnpm media:audit` & `pnpm data:validate` | `scripts/media-validate.ts`, `data-sync.ts`                      | `81/81` DB media & `67/67` snapshot media hợp lệ, `12/12` snapshot files đạt chuẩn, `0` lỗi nhạy cảm/FK/schema                                                |   `PASS`   |
| `pnpm test`                               | Node Test Runner (`v24.22.3`)                                    | **`322/322 PASS`** (`10` suites: gồm `db-migration-regression`, `payment-business-audit`, `multi-branch-*`, `payment-*`, `data-sync`, `rbac`, `rental-rules`) |   `PASS`   |
| `pnpm test:admin`                         | `scripts/test-admin-isolated.mjs`                                | `ISOLATED_ADMIN_TEST_PASS` (seed idempotent, PBKDF2-SHA256, `integrity = ok`, `fk = 0`)                                                                       |   `PASS`   |
| `pnpm test:e2e:isolated`                  | Playwright Chromium & Mobile WebKit                              | **`106/106 PASS`** (`14` spec files trên DB + Media cô lập, `postIntegrity = ok`, `fk = 0`, `0` leftover users)                                               |   `PASS`   |
| `pnpm perf:multi-branch`                  | `scripts/benchmark-multi-branch.mjs` (DB cô lập)                 | `100 CN / 10k Xe / 100k Đơn (82.25 MB)`: xe CN `0.086 ms`, timeline `0.044 ms`, báo cáo `5.541 ms`, `5,974 tx/s`, `0` full scan                               |   `PASS`   |
| **TỔNG CỘNG TEST AUTOMATION**             | **Unit + Integration + Resilience + Multi-Branch + Admin + E2E** | **`429 / 429 TEST PASS (100%)`**                                                                                                                              | **`PASS`** |
| Tính toàn vẹn `./nori.db` gốc             | `node:sqlite` (`readOnly`)                                       | `109` bảng, `journal_mode = wal`, `PRAGMA integrity_check = ok`, `fkViolations = 0`, bảo toàn 100% dữ liệu gốc                                                |   `PASS`   |
| Bản sao lưu nhất quán                     | `pnpm db:backup`                                                 | Bản sao lưu cơ sở dữ liệu và media toàn vẹn trong `backups/`                                                                                                  |   `PASS`   |
| SePay Sandbox / Live Webhook HTTPS        | External SePay Gateway                                           | Chưa cấu hình credentials merchant & HTTPS public domain                                                                                                      | `BLOCKED`  |
| `figma make verify-deploy`                | Cloud CLI                                                        | Không có binary `figma` CLI trên shell Windows cục bộ                                                                                                         | `NOT_RUN`  |

---

## 2. Các Phân Hệ Trọng Điểm Đã Hoàn Thiện

1. **Kiểm Toán Nghiệp Vụ Thanh Toán, Đặt Cọc & Quyết Toán (`v2.7.1`)**:
   - Tách biệt tuyệt đối giữa Doanh thu tiền thuê xe và Ký quỹ bảo đảm tài sản xe (thế chấp).
   - Xử lý triệt để nguyên nhân gốc vụ việc 13.010.000 ₫ vs 15.000.000 ₫ trên giao diện quản trị.
   - Bổ sung tùy chọn Kế hoạch thanh toán khách hàng: Đặt cọc 30% (`DEPOSIT`) vs Thanh toán trọn gói 100% (`FULL`).
   - Thiết lập chốt chặn bàn giao xe (Pre-Handover Gate) và chốt chặn tất toán hợp đồng (Post-Return Settlement Gate).
   - Thiết kế lại Drawer Menu di động toàn màn hình và Admin User Bottom Sheet, chống tràn ngang và chặn Safari zoom.
2. **Quản lý Đa Chi Nhánh & Đa Địa Điểm (`v2.7.0` — Module 3.7)**:
   - **10 Collections mới & Migration Additive-Only (`88 → 109` bảng)**: `Branches`, `Warehouses`, `ServiceLocations`, `BranchStaff`, `VehicleTransfers`, `VehicleLocationHistory`, `DeliveryZones`, `DeliveryJobs`, `LocationPricingRules`, `OneWayRentalRules` cùng 12+ composite indexes tối ưu truy vấn chi nhánh/timeline/báo cáo; bảo toàn 100% dữ liệu hiện hữu (`21` xe DEMO ở `UNALLOCATED`).
   - **Động cơ Timeline Vị trí P0, Điều chuyển Nguyên tử & Giao nhận Tận nơi**: Tính vị trí vật lý theo thời gian thực (`evaluateVehicleLocationTimeline`), giao dịch điều chuyển 9 trạng thái ACID kèm Optimistic Locking và rollback nguyên tử, chặn xung đột lịch nhân viên giao nhận (`409`).
   - **Định giá 5 tầng, Thuê Một Chiều & RBAC Chi nhánh**: Ưu tiên `VEHICLE_BRANCH > MODEL_BRANCH > VEHICLE_BASE > BRANCH_DEFAULT > GLOBAL_DEFAULT`, snapshot giá bất biến, 8 vai trò chức danh × 20 phân hệ × phạm vi chi nhánh (`ALL`/`ASSIGNED`), chống leo thang/IDOR, thu hồi quyền tức thì và báo cáo đa chi nhánh không cộng trùng doanh thu.
   - **8 Không gian Quản trị Mới & Nâng cấp Toàn bộ Frontend Khách hàng**: `/dashboard/{branches,warehouses,locations,staff,transfers,deliveries,location-pricing,branch-reports}` cùng `SearchBar`, `Catalogue`, `VehicleCard`, `VehicleDetail`, `CheckoutPanel`, `BookingsPanel` hỗ trợ chọn chi nhánh nhận/trả, thuê một chiều và giao nhận tận nơi.
3. **Kiểm toán Hiệu năng, Tối ưu Media & Chuẩn hóa Production (`v2.6.1`)**:
   - Pipeline nén ảnh WebP runtime (`media-optimizer.ts`), `push: false` + SQLite WAL, `getCatalogueSummary()`, `scripts/start-standalone.mjs`, `.agents/skills/nori-performance/SKILL.md`.
4. **Hệ thống Thanh toán Trực tuyến (`v2.6.0`)**:
   - Payment Adapter Pattern (`SePay`, `Mock`, `Manual`, mở rộng 4 cổng), tách bạch doanh thu thuê và cọc tài sản, idempotency Webhook, đối soát, hoàn tiền và 10 kịch bản chịu lỗi.
5. **Đồng bộ Dữ liệu, Bảo mật, RBAC & PWA (`v2.4.0 – v2.5.0`)**:
   - Git Snapshot & Media Sync (`data/snapshots/`, `media/seed/`), `dynamicParams = true` + `revalidateTag` hooks, kiểm soát concurrency 409 + optimistic locking và PWA Service Worker v2.
