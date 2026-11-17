# KẾ HOẠCH KIỂM THỬ HỆ THỐNG NORI (TEST PLAN — PHASE 2)

## 1. Mục tiêu & Nguyên tắc kiểm thử

- Đánh giá khách quan và tái kiểm định toàn bộ nền tảng **NORI** ở Phase 2 trên `13` hạng mục Production Readiness: `format:check`, `lint` AST, `typecheck`, Production Build, Production Smoke Test, Unit Test, Local API cô lập, HTTP API/Race/Security, Playwright E2E (Desktop + Mobile + Admin + Review UI), Accessibility (`axe-core` WCAG 2.2 AA), Tablet `768×1024`, CVE Security (`pnpm audit`) và toàn vẹn SQLite (`./nori.db`).
- Mọi dữ liệu tạo bởi test tự động trên `./nori.db` đều phải tự hoàn nguyên chính xác trong khối `finally`; các thao tác thay đổi trạng thái hoặc test rollback migration thực hiện trên bản copy cô lập trong `scratch/` sau khi đã sao lưu `./nori.db`.
- Không ghi `PASS` nếu chưa chạy thực tế; đánh dấu `BLOCKED` nếu thiếu hạ tầng ngoài (`figma` CLI / Figma SSO / Email / Payment gateway).

---

## 2. Phạm vi kiểm thử

| Hạng mục                              | Trong phạm vi (`In Scope`)                                                                                                                                                      | Ngoài phạm vi / Bị chặn (`Out of Scope` / `BLOCKED`)                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Quy tắc nghiệp vụ (`rental-rules.ts`) | Ngày/giờ VN (`DD/MM/YYYY`), validate `[1..30]` ngày, gói tuần/tháng, phụ phí cuối tuần & ngày lễ, lăn bánh VN, ma trận đơn thuê `9×9`, ma trận inquiry `8×8`, quá hạn cọc `24h` | Thuê theo giờ (`pricePerHour`), giữ đệm `bufferHours` theo giờ                                          |
| Giao diện Public, Customer & Admin    | `14` routes công khai/khách hàng/admin trên Chromium Desktop (`1440×1000`), Tablet (`768×1024`), Mobile (`375×812`), `axe-core` WCAG 2.2 AA trên 8 màn hình (gồm `/dashboard`)  | Kiểm thử đọc màn hình thủ công NVDA/VoiceOver; đăng nhập Figma SSO `/admin` (`BLOCKED` tại local shell) |
| API & Database                        | `9` routes `/nori-api/*`, Payload Local API hooks, SQLite transaction, migration FK `BUG-05` (`up`/`down` round-trip), Race condition `2` user đồng thời, Export CSV            | Cổng thanh toán trực tuyến (`VNPay`/`MoMo`/`Stripe`) và Email/SMS adapter                               |
| Bảo mật & Chất lượng mã nguồn         | CSRF `Origin`/`sec-fetch-site`/`Referer`, Client tampering, SQLi, XSS persistence, IDOR, Rate Limit, Password verify `401`, Admin CSV `403`, AST linter, `pnpm audit` CVE scan  | Pentest/DDoS mạng bên ngoài; chạy `figma make verify-deploy` (`figma` CLI không tồn tại ở máy local)    |

---

## 3. Công cụ & Môi trường thực thi

- **Runtime**: Node.js `v24.22.3`, Next.js `16.4.6` (Turbopack dev server `localhost:3000` & Production `pnpm build`/`pnpm start`), Payload `4.0.0-beta.8`, SQLite (`./nori.db`).
- **Tĩnh, Định dạng & Bảo mật phụ thuộc**: `tsc --noEmit` (`pnpm typecheck`), `oxfmt --check` (`pnpm format:check`), AST Static Linter (`node scripts/static-lint.mjs`), `pnpm audit --json`.
- **Unit Test**: `node --test tests/rental-rules.test.mjs` (`205` assertions).
- **E2E & Accessibility**: `@playwright/test` (`1.65.1`) + Google Chrome local + `@axe-core/playwright` (`4.14.0`).
- **API & DB Cô lập**: `scratch/audit-http.mjs` (`17` ca), `scratch/audit-local.ts` (`12` ca trên `audit-local.db`), `scratch/test-migration.ts`, `scratch/audit-tablet.mjs` (`7` routes Tablet).

---

## 4. Quản lý & Hoàn nguyên Dữ liệu kiểm thử

- `./nori.db` được sao lưu trước migration sang `scratch/nori-pre-phase2-backup.db`.
- Trong Playwright `tests/e2e/nori.spec.ts`, hàm `cleanupE2ERecords()` dọn sạch theo email/key mọi `reviews`, `rental_days` (`booking_key`), `bookings`, `sales_inquiries`, `users`, `admins` phát sinh từ E2E `#30` & `#43` và đặt lại `NR-OT-VIOS01` về `READY`/`ACTIVE`.
- Sau kết thúc mọi bài test, `./nori.db` được xác nhận hoàn nguyên chính xác `{ models: 20, vehicles: 21, media: 70, users: 7, admins: 0, bookings: 5, inquiries: 5, reviews: 0, rental_days: 6 }`, `PRAGMA integrity_check = 'ok'`, `PRAGMA foreign_key_check = []`.

---

## 5. Tiêu chí nghiệm thu (Exit Criteria — Phase 2)

1. `pnpm format:check`, `pnpm lint` (`static-lint.mjs`), `pnpm typecheck`, `pnpm build` đạt `0` lỗi và Production Smoke Test trả `HTTP 200` trên tất cả `9/9` đường dẫn mẫu.
2. `205/205` Unit Test, `43/43` E2E Playwright (`0` vi phạm WCAG 2.2 AA), `17/17` HTTP API, `12/12` Local API và `7/7` Tablet đạt `PASS`.
3. `0` lỗ hổng `High` / `Critical` trong `pnpm audit`; `BUG-01..08` đạt trạng thái đã khắc phục & xác minh `100%`.
4. Dữ liệu `./nori.db` không thất thoát bản ghi khi migration FK và giữ nguyên tính toàn vẹn ràng buộc khóa ngoại.
