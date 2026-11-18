# BÁO CÁO KIỂM THỬ HỒI QUY — NORI VEHICLE RENTAL (`REGRESSION_TEST_REPORT.md`)

- **Ngày cập nhật**: `2026-11-18` (Sau khi sửa `./nori.db`, khóa bảo vệ E2E và chạy regression cuối)
- **Môi trường kiểm chứng**: Production build (`75/75` static/SSG route entries trong build table) qua `pnpm test:e2e:isolated` trên bản sao `./nori-e2e-isolated.db` lấy từ `./nori.db` đã sửa sạch (`0` FK) cùng `next start` read-only smoke check trên `./nori.db`.

---

## 1. So sánh Baseline Trước Sửa vs Đợt Remediation Cuối

| Hạng mục                                         | Baseline Ban Đầu (Trước Remediation) | Đợt Remediation Hiện Tại                      | Chú giải thay đổi & xác minh                                                                                                            |
| :----------------------------------------------- | :----------------------------------- | :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck (`tsc --noEmit`)                       | `0` lỗi                              | **`0` lỗi**                                   | Toàn bộ mã RBAC 3 tầng, `publish`, concurrency & healthcheck hợp kiểu 100%                                                              |
| Static AST Lint (`static-lint.mjs`)              | `163/163` (`0` issues)               | **`166/166` (`0` issues)**                    | Đã xác minh `assertOrigin()` & anti-placeholder rules trên tất cả file mới                                                              |
| Format Check (`oxfmt`)                           | `100%`                               | **`100%`**                                    | Bao gồm toàn bộ `src/`, `tests/`, `scripts/`, `docs/audit/`                                                                             |
| Unit Tests (`pnpm test` + coverage)              | `241/241` PASS                       | **`247/247` PASS**                            | Bổ sung `tests/rbac-access.test.mjs` (`6` tests: `nori.ts` `100%` line cov, `notifications.ts` `97.03%` line cov); tổng `93.54%` lines  |
| Playwright Full Suite (`pnpm test:e2e:isolated`) | `89/89` PASS                         | **`92/92` PASS (`4.8m`, `0` fail, `0` skip)** | Chạy trên bản sao `./nori.db` đã sửa (`86` Chromium + `6` Mobile WebKit); hậu E2E **`postIntegrity = ok`, `fk = 0`, `newLeftover = 0`** |
| Repeat Stability (`--repeat-each=3`)             | `21/21` PASS                         | **`30/30` PASS (`3.8m`, `0` flaky)**          | Lặp 3x trên `hero-cms` + `posts-banner` + `qa-comprehensive-audit` (`10` tests x 3); hậu chạy **`fk = 0`**                              |
| Cross-Browser (`Microsoft Edge`)                 | Chưa chạy riêng                      | **`9/9` PASS (`23.4s`)**                      | Xác minh `data-sync.spec.ts` & điều hướng bàn phím Mega Menu qua `msedge.exe`                                                           |
| Browser UAT Walkthrough                          | Chưa chạy                            | **`7/7` PASS (`0` console/page/5xx)**         | Thực thi trọn vẹn luồng Customer → Checkout → Cancel → Admin Duyệt → Thanh toán → Promo → Post → Logout                                 |
| Backend DB Admin Suite (`pnpm test:admin`)       | Pass trên clean seed                 | **`ISOLATED_ADMIN_TEST_PASS`**                | Đã xác minh trực tiếp trên bản sao `./nori.db` đã sửa (`integrity_check = ok`, `fkCheck = []`)                                          |

---

## 2. Xác nhận Hồi quy các Lỗi & Vấn đề Đã Vá

1. **Auth, Session Revocation & Separation (`BUG-QA-02`)**: PASS `8/8` (`auth-session-booking-regression`), `6/6` Mobile WebKit, `QA-SEC-02`.
2. **RBAC 3 tầng, `Folders`/`Tags` & quyền `publish` (`BUG-QA-01`, `BUG-QA-08`, `BUG-QA-09`)**: PASS `QA-SEC-01` (18 endpoint `403`), `QA-SEC-03` (Payload `/api/*`, `/api/admins`, `/api/maintenance-schedules`, `publish` disabled UI & `403`, live permission revocation), và `tests/rbac-access.test.mjs`.
3. **Đồng bộ `Bookings` ↔ `Payments` & Optimistic Locking (`BUG-QA-04`, `BUG-QA-10`)**: PASS `QA-CONC-01` (`expectedRevision` `409`, payment lock vs cancel `409`, auto-cancel phiếu `PENDING`, `remaining_amount = 0`, duplicate payment `409`).
4. **Checkout `expectedTotalPrice`, Khuyến mãi & Cache Revalidation (`BUG-QA-05`, `BUG-QA-11`, `BUG-QA-12`)**: PASS `QA-CONC-02`, `promo-checkout-regression` (`6/6`), `UAT-06`, `/nori-api/fleet` `606 RPS (p95=83ms)` dưới 50 luồng song song.
5. **CMS Hero Carousel & Unpublish Bài viết (`BUG-QA-03`, `BUG-QA-06`)**: PASS `hero-cms` + `posts-banner` + `QA-CMS-01` qua 3 lượt lặp liên tiếp.
