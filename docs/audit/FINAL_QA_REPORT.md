# BÁO CÁO NGHIỆM THU QA CUỐI CÙNG — NORI VEHICLE RENTAL (`FINAL_QA_REPORT.md`)

- **Ngày phát hành báo cáo**: `2026-11-18`
- **Môi trường kiểm chứng cuối**: Production Next.js `16.4.6` (`next build` + `next start` trên `http://127.0.0.1:3100`) kết nối bản sao DB cô lập sạch (`./nori-qa-isolated.db`), giữ nguyên 100% `./nori.db` gốc + backup tại [backups/nori-backup-2026-11-18T12-24-55-238Z.db](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/backups/nori-backup-2026-11-18T12-24-55-238Z.db).

---

## 1. Quyết định Cổng Nghiệm thu (Release Gate)

- **Chất lượng Kỹ thuật & Nghiệp vụ Ứng dụng (Technical Staging / Demo Gate)**: **`CONDITIONAL PASS`**
  - Toàn bộ chức năng cốt lõi Khách hàng & Quản trị vận hành đồng bộ, ổn định và đạt chuẩn bảo mật RBAC sau khi khắc phục triệt để `BUG-QA-01` → `BUG-QA-06`.
- **Sẵn sàng Thương mại Production (Commercial Go-Live Gate)**: **`NO-GO (Chờ điều kiện doanh nghiệp & hạ tầng)`** do các điều kiện môi trường và dữ liệu thật bên dưới.

---

## 2. Tổng hợp Bằng chứng Kiểm thử Thực tế Sau Bản vá Cuối

| Hạng mục Kiểm tra                             | Phạm vi                                                                       | Kết quả quan sát                                                            |
| :-------------------------------------------- | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| TypeScript (`pnpm typecheck`)                 | Toàn bộ `src/`, `tests/`                                                      | **PASS (`0` lỗi)**                                                          |
| Static AST & Security Lint (`pnpm lint`)      | `163` tệp (`scripts/static-lint.mjs`)                                         | **PASS (`0` vấn đề)**                                                       |
| Unit Tests (`pnpm test`)                      | `tests/rental-rules.test.mjs`                                                 | **PASS (`241/241` tests, `0` skip, `220ms`)**                               |
| Production Build (`pnpm build`)               | App Router + Payload 4                                                        | **PASS (`75/75` route tĩnh/SSG; `0` public route bị `ƒ (Dynamic)`)**        |
| Playwright E2E Suite (Cô lập)                 | `10` spec files (`Chromium` + `Mobile WebKit`)                                | **PASS (`89/89` tests, `5.3m`, `0` fail, `0` skip)**                        |
| Stability Repeat Check (`--repeat-each=3`)    | `qa-comprehensive-audit`, `hero-cms`, `posts-banner`                          | **PASS (`21/21` runs, `3.0m`, `0` flaky, `0` FK orphans)**                  |
| Isolated DB Integrity (`nori-qa-isolated.db`) | Sau toàn bộ `89` + `21` lượt E2E                                              | **`PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = 0`**           |
| Desktop Core Web Vitals (`1440×900`)          | 5 route chính                                                                 | **PASS (`CLS 0.0008–0.0086`, `LCP 260–964ms`, `INP 0–56ms`)**               |
| Concurrent Load (`1, 5, 10, 25, 50` users)    | `/`, `/vehicles/toyota-fortuner`, `/nori-api/fleet`, `/nori-api/availability` | **PASS (`0` lỗi `5xx`; `8/8` booking storm `[1x201, 7x409]`)**              |
| `pnpm test:admin` (trên bản sao `./nori.db`)  | Kiểm tra toàn vẹn bản DB gốc hiện tại                                         | **FAIL tại assertion mới (`25` FK mồ côi tiền hiện hữu trong `./nori.db`)** |
| `figma make verify-deploy`                    | Deploy cloud verification                                                     | **BLOCKED (không có CLI `figma` trên shell Windows cục bộ)**                |

---

## 3. Các Vấn đề Tồn đọng / Điều kiện Trước khi Go-Live

1. **Vệ sinh `./nori.db` gốc (Chờ chủ sở hữu xác nhận)**: `./nori.db` đang tồn tại `25` bản ghi FK mồ côi (`_nori_site_v_version_hero_slides`, `_media_v`, `audit_logs_rels`) và Slide 1 `"Hero Test 6e1f916c"` từ các đợt test trước phiên kiểm toán hôm nay. Khuyến nghị chạy dọn sạch 25 dòng mồ côi + khôi phục Slide 1 `"Mọi hành trình."` (từ backup/version `618bc4b7...`) sau khi sao lưu.
2. **Dữ liệu `DEMO` & Khuyến mãi**: `21/21` xe thực tế là xe `DEMO` (`is_demo = 1`); mã `NORIXINCAMON` trong `./nori.db` đang đặt `usage_limit = 1` (`used_count = 1`) và `max_discount = 30` (30 VNĐ).
3. **Hạ tầng ngoài MVP**: Chưa có cổng thanh toán trực tuyến, chưa có SMTP/SMS Adapter thật, và **Mobile Throttled Slow 4G + 4x CPU** có LCP đạt `3.1s – 5.6s` (cần tối ưu ảnh & code-split khi scale).
4. **Phụ thuộc bên ngoài (`pnpm audit`)**: Còn `2` advisories `high` (`picomatch <= 4.0.7` trong cây `payload`/`@payloadcms/figma`, chưa có bản vá upstream) và `4` `moderate`.

---

## 4. Bộ Tài liệu Kiểm toán Đầy đủ (`docs/audit/`)

- [SYSTEM_AUDIT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/SYSTEM_AUDIT.md) · [REQUIREMENTS_TRACEABILITY_MATRIX.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/REQUIREMENTS_TRACEABILITY_MATRIX.md)
- [TEST_PLAN.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/TEST_PLAN.md) · [TEST_CASES.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/TEST_CASES.md) · [BUG_REPORT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/BUG_REPORT.md)
- [BUSINESS_WORKFLOW_AUDIT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/BUSINESS_WORKFLOW_AUDIT.md) · [API_TEST_REPORT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/API_TEST_REPORT.md) · [SECURITY_TEST_REPORT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/SECURITY_TEST_REPORT.md)
- [PERFORMANCE_REPORT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/PERFORMANCE_REPORT.md) · [REGRESSION_TEST_REPORT.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/REGRESSION_TEST_REPORT.md) · [TEST_PROGRESS.md](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/audit/TEST_PROGRESS.md)
