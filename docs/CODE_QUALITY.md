# NORI — BÁO CÁO CHẤT LƯỢNG MÃ NGUỒN & CHUẨN HÓA KỸ THUẬT (CODE QUALITY)

- **Ngày cập nhật**: `2026-11-20`
- **Phạm vi**: Toàn bộ `src/`, `scripts/`, `tests/`, cấu hình Next.js / Payload / pnpm và bộ Skill quản trị chất lượng.

---

## 1. Dọn dẹp Dead Code & Chuẩn hóa Package Manager

| Hạng mục                                            | Hành động            | Bằng chứng xác minh                                                                         | Lý do                                                                                                                       |
| :-------------------------------------------------- | :------------------- | :------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard-panel.tsx` (`1,245` dòng) | **Đã xóa**           | `git grep` xác nhận `0` import trong `src/`, `tests/`, `scripts/`, `importMap.js`.          | Component đơn khối legacy đã được thay thế hoàn toàn bởi 13 module quản trị dưới `src/components/admin/*`.                  |
| `package-lock.json` (`342 KB`)                      | **Đã xóa**           | Dự án chuẩn hóa `pnpm` (`package.json` `engines.pnpm`, `pnpm-lock.yaml`, `.mise.toml`).     | Loại bỏ xung đột lockfile kép npm/pnpm.                                                                                     |
| `next.config.ts` (`typescript.ignoreBuildErrors`)   | **Siết chặt**        | Đổi thành `ignoreBuildErrors: process.env.FIGMA === '1'`.                                   | Ngăn lỗi TypeScript lọt qua `pnpm build` ở local & CI, trong khi vẫn tương thích Figma Make sandbox.                        |
| Cảnh báo Turbopack Dynamic FS Tracing               | **Đã xử lý (5 → 0)** | Thêm `/*turbopackIgnore: true*/` tại `src/lib/media-optimizer.ts` & `src/lib/data-sync.ts`. | Ngăn Next.js standalone kéo cả cây thư mục repo vào server bundle; rút ngắn build xuống ~`9.4s` compile + `7.3s` typecheck. |

---

## 2. Kiểm toán Dependency (`package.json`)

- **Không thêm dependency mới**: Toàn bộ tối ưu ảnh (`sharp`), benchmark, load test, resilience test và kiểm toán media đều tái sử dụng trực tiếp các thư viện đã cài sẵn (`sharp`, `node:sqlite`, `node:test`, `@playwright/test`).
- **Kiểm chứng dependency lớn qua `pnpm why`**:
  - `monaco-editor`: Bắt buộc bởi `@monaco-editor/react` → `@payloadcms/ui` (chỉ phục vụ Payload Admin `/admin`, **không lọt vào public bundle** — JS nén trang public chỉ `179.6–200.5 KB <= 250 KB`). **Giữ nguyên.**
  - `@payloadcms/plugin-cloud-storage`: Bắt buộc bởi `@payloadcms/figma`. **Giữ nguyên.**
  - `html-react-parser`: Dùng cho hiển thị nội dung HTML bài viết/CMS. **Giữ nguyên.**
- **Chuẩn hóa Scripts (`package.json`)**:
  - `pnpm start:standalone`: Khởi chạy production standalone (`scripts/start-standalone.mjs`) chuẩn trên cả Windows & Linux (tự copy `.next/static`, `public/`, đồng bộ `libvips*.dll` trên Windows, neo đúng `DATABASE_URI` và `NORI_MEDIA_DIR`).
  - `pnpm media:audit`: Kiểm toán toàn vẹn media (`scripts/media-validate.ts --audit`).
  - `pnpm perf:load`: Chạy Load/Stress/WAL Write Concurrency test cô lập (`scripts/load-test.mjs`).

---

## 3. Tái cấu trúc Kiến trúc & Nguyên tắc Single Source of Truth

1. **Tách nhẹ truy vấn công khai vs chi tiết (`src/lib/catalogue.ts`)**:
   - Bổ sung `getCatalogueSummary()` (`depth: 1`, `select` tối thiểu) và `slimPostForCard()` cho trang danh sách (`/`, `/vehicles`, `/posts`) thay vì serialize toàn bộ chi tiết 21 dòng xe (`getCatalogue()` vẫn giữ nguyên cho các luồng cần đầy đủ gallery/specs).
   - Cắt props `site` của `VehicleDetail` qua type `VehicleDetailSiteInfo` (12 trường thực sự dùng).
2. **Tách nguồn sự thật cấu hình & tính toán tài chính (`src/lib/payment-service.ts`)**:
   - Tách `buildSitePaymentConfigFromDoc()` để route đã đọc `nori-site` (`dashboard/bookings`) không query lặp `nori-site` lần 2.
   - Tách `computeBookingFinancialsSync()` dùng chung giữa `computeBookingFinancialsFromDb()`, `/nori-api/bookings` và `/nori-api/dashboard/bookings`, loại bỏ vòng `Promise.all(async)` dư thừa.
   - Chuẩn hóa 7 composite index trong 1 nguồn duy nhất (`src/migrations/20261120_010000_online_payment_integration.ts`), được cả `pnpm db:migrate` (`data-sync.ts`) và startup hook (`seed-nori.ts`) tái sử dụng.
3. **Chuẩn hóa Request Safety & Resource Cleanup ở Client**:
   - `src/lib/client-api.ts`: Timeout hữu hạn mặc định `15s` + phân biệt `AbortError` từ caller với `REQUEST_TIMEOUT` (`408`).
   - `src/components/auth-provider.tsx`: Deduplicate in-flight `/nori-api/auth/me`, timeout `10s`, cooldown `5s` cho `visibilitychange`/`focus`, dọn cache SW khi `logout()`.
   - `src/components/bookings-panel.tsx`: Mutex in-flight, `AbortController`, backoff hữu hạn (`4s→20s`, dừng sau 5 lỗi), bắn expiry check tối đa 1 lần, cleanup toàn bộ timer/controller khi unmount.
   - `src/components/booking-notification-center.tsx`: Mutex in-flight, `AbortController`, chu kỳ 60s.
   - `src/components/admin/admin-shell.tsx`: Chuyển sang `/nori-api/dashboard?summaryOnly=1` + `AbortController` (giảm 18 query → 4 count query nhẹ trên mỗi điều hướng).

---

## 4. Chuẩn hóa Quy tắc Bắt buộc cho Các Lần Triển khai Tiếp theo

- Đăng ký chính thức skill **`nori-performance`** tại [`.agents/skills/nori-performance/SKILL.md`](../.agents/skills/nori-performance/SKILL.md) (theo cơ chế skill discovery chuẩn của Antigravity).
- Tham chiếu chéo từ [`AGENTS.md`](../AGENTS.md) và [`SKILL.md`](../SKILL.md) (đồng thời cập nhật mục Checkout trong `SKILL.md` phản ánh đúng kiến trúc thanh toán trực tuyến sau duyệt `v2.6.x`).
- Mọi thay đổi trong tương lai bắt buộc qua cổng kiểm soát:
  `pnpm format:check` → `pnpm typecheck` → `pnpm lint` → `pnpm media:audit` → `pnpm data:validate` → `pnpm test` → `pnpm test:admin` → `pnpm build` → `pnpm test:e2e:isolated`.
