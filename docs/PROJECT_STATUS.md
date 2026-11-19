# TRẠNG THÁI TỔNG QUAN DỰ ÁN NORI (PROJECT STATUS)

- **Ngày kiểm toán & hoàn thiện**: `2026-11-20`
- **Phiên bản kiến trúc**: Centralized NORI Admin & CMS + Online Payment Integration (`v2.6.0`) + Full-System Performance Audit, Media WebP Pipeline, SQLite WAL/Composite Indexing & Standalone Production Hardening (`v2.6.1`) (`Next.js 16.4.6` + `React 19.3.1` + `Payload CMS 4.0.0-beta.8` + `SQLite`)
- **Kết luận nghiệm thu kỹ thuật**: Hệ thống **vận hành nhanh, ổn định và đạt chuẩn hiệu năng/chất lượng trên local dev, production standalone build và MOCK payment sandbox**. Toàn bộ **383 automated tests** (**285 unit, integration & 10-scenario payment resilience tests** + **97 Playwright E2E tests** trên môi trường DB & Media cô lập + **1 Isolated Admin Test**) đạt **100% PASS (0 FAIL, 0 SKIPPED)**. Load Test trên `.next/standalone/server.js` đạt **16,061 requests / 0% lỗi / 669.5 req/s / p95 314.3 ms ở 100 VUs** và **0 `SQLITE_BUSY`** dưới 20 concurrent writes.
- **Phân loại mức độ sẵn sàng triển khai (Release Gate)**:
  - **Sẵn sàng kỹ thuật, Dev, Standalone Production Build & MOCK Sandbox**: **`PASS (100%)`** (Build, Typecheck, Lint, Format, Media Audit, Data Sync, Performance & Load Test, Payment Resilience, Security, Concurrency, E2E, Backup & Restore).
  - **Sẵn sàng Thương mại / Thanh toán Tiền thật (`PRODUCTION`)**: **`CONDITIONAL PASS — CHƯA MỞ PRODUCTION`** do đội xe 21 chiếc vẫn gắn cờ minh họa `DEMO`, chưa cấu hình SePay Merchant credentials / HTTPS Webhook thật (`PAYMENT_MODE=mock`, `PAYMENT_PRODUCTION_APPROVED=false`), và chưa có dữ liệu đo Field CWV p75 từ người dùng thực.

---

## 1. Tổng hợp Kết quả Kiểm thử & Kiểm toán (`v2.6.1`)

| Hạng mục                                  | Công cụ                                           | Kết quả quan sát                                                                                                                       | Trạng thái |
| :---------------------------------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------- | :--------: |
| `pnpm format:check`                       | `oxfmt`                                           | `253/253` tệp mã nguồn & tài liệu đúng chuẩn format                                                                                    |   `PASS`   |
| `pnpm lint`                               | `scripts/static-lint.mjs`                         | `192/192` tệp (`0` lỗi AST / `assertOrigin` / rò rỉ secret client)                                                                     |   `PASS`   |
| `pnpm typecheck`                          | `tsc --noEmit`                                    | `0` lỗi TypeScript (`ignoreBuildErrors` chỉ bật khi `FIGMA=1`)                                                                         |   `PASS`   |
| `pnpm media:audit` & `pnpm data:validate` | `scripts/media-validate.ts`, `data-sync.ts`       | `81/81` DB media & `67/67` snapshot media hợp lệ, `0` missing/zero-byte/Git LFS/invalid header (`190` tệp đĩa chưa gắn DB chỉ báo cáo) |   `PASS`   |
| `pnpm test`                               | Node Test Runner (`v24.22.3`)                     | **`285/285 PASS`** (`rental-rules`, `rbac-access`, `data-sync`, `payment-rules`, `payment-integration`, `payment-resilience`)          |   `PASS`   |
| `pnpm test:admin`                         | `scripts/test-admin-isolated.mjs`                 | `ISOLATED_ADMIN_TEST_PASS` (seed idempotent, PBKDF2-SHA256, `integrity = ok`, `fk = 0`)                                                |   `PASS`   |
| `pnpm build` (`payload build`)            | Next.js 16 Production Build                       | `87/87` trang tĩnh/SSG (`○`/`●`), `0` route công khai bị `ƒ (Dynamic)`, `0` cảnh báo Turbopack                                         |   `PASS`   |
| `pnpm test:e2e:isolated`                  | Playwright Chromium & Mobile WebKit               | **`97/97 PASS`** (`12` spec files trên DB + Media cô lập, bao gồm `performance-media-smoke.spec.ts`), `0` leftover users               |   `PASS`   |
| `pnpm perf:load`                          | `scripts/load-test.mjs` (Standalone)              | `16,061` reqs (`1–100 VUs`), `0%` lỗi, `669.5 req/s`, `314.3 ms p95` @ `100 VUs`, `0` `SQLITE_BUSY`                                    |   `PASS`   |
| **TỔNG CỘNG TEST AUTOMATION**             | **Unit + Integration + Resilience + Admin + E2E** | **`383 / 383 TEST PASS (100%)`**                                                                                                       | **`PASS`** |
| Tính toàn vẹn `./nori.db` gốc             | `node:sqlite` (`readOnly`)                        | `88` bảng, `410` index, `journal_mode = wal`, `PRAGMA integrity_check = ok`, `fkViolations = 0`                                        |   `PASS`   |
| Bản sao lưu nhất quán trước kiểm toán     | `pnpm db:backup`                                  | `backups/nori-backup-2026-11-19T19-42-11-792Z.db` + `81` media (`integrity = ok`, `fk = 0`)                                            |   `PASS`   |
| SePay Sandbox / Live Webhook HTTPS        | External SePay Gateway                            | Chưa cấu hình credentials merchant & HTTPS public domain                                                                               | `BLOCKED`  |
| `figma make verify-deploy`                | Cloud CLI                                         | Không có binary `figma` CLI trên shell Windows cục bộ                                                                                  | `NOT_RUN`  |

---

## 2. Các Phân Hệ Trọng Điểm Đã Hoàn Thiện

1. **Kiểm toán Hiệu năng, Tối ưu Media & Chuẩn hóa Production (`v2.6.1`)**:
   - **Khắc phục triệt để treo `pnpm dev` & mất ảnh**: Tắt Drizzle interactive `pushDevSchema` (`push: false`) + bật `SQLite WAL`, `synchronous: 'NORMAL'`, `busyTimeout: 5000`; cấu hình `images.qualities: [75, 80, 84]` loại bỏ cảnh báo Next.js 16.
   - **Pipeline nén ảnh WebP cục bộ (`src/lib/media-optimizer.ts`)**: Giữ nguyên `figma-image-loader.ts`, xử lý `?w=&q=` qua Payload `upload.handlers` với disk cache & `ETag/304`, giảm `77%–91%` dung lượng ảnh trên `/`, `/vehicles`, `/vehicles/[slug]` và giảm Mobile Detail LCP từ `3,184 ms → 1,876 ms`.
   - **Tối ưu RSC, Polling, Admin & DB**: Thêm `getCatalogueSummary()`, `slimPostForCard()`, `/nori-api/dashboard?summaryOnly=1`, 7 composite SQLite indexes (`0` `TEMP B-TREE`), timeout `15s` cho `client-api.ts`, sửa bão request khi QR hết hạn và giới hạn backoff polling thanh toán, tắt Service Worker trong dev, và bổ sung `scripts/start-standalone.mjs` tự động đồng bộ `libvips*.dll` trên Windows.
   - **Chuẩn hóa Skill & Quản trị Chất lượng**: Đăng ký skill bắt buộc `.agents/skills/nori-performance/SKILL.md`, xóa dead code `dashboard-panel.tsx` (1,245 dòng) và `package-lock.json`, bổ sung `docs/PERFORMANCE_AUDIT.md` & `docs/CODE_QUALITY.md`.
2. **Hệ thống Thanh toán Trực tuyến (`v2.6.0`)**:
   - Payment Adapter Pattern (`SePayProvider`, `MockPaymentProvider`, `ManualPaymentProvider`, và 4 adapter mở rộng), 3 môi trường `MOCK`/`SANDBOX`/`PRODUCTION`, tách bạch doanh thu thuê xe với cọc bảo đảm tài sản, idempotency Webhook, đối soát bất thường, hoàn tiền & bộ kiểm thử 10 kịch bản chịu lỗi (`tests/payment-resilience.test.mjs`).
3. **Đồng bộ Dữ liệu, Bảo mật, RBAC & PWA (`v2.4.0 – v2.5.0`)**:
   - Git Snapshot & Media Sync (`data/snapshots/`, `media/seed/`), `dynamicParams = true` + `revalidateTag` hooks, kiểm soát concurrency 409 + optimistic locking, RBAC 13 phân hệ Admin và PWA Service Worker v2 an toàn.
