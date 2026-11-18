# TRẠNG THÁI TỔNG QUAN DỰ ÁN NORI (PROJECT STATUS)

- **Ngày kiểm toán & hoàn thiện**: `2026-11-18`
- **Phiên bản kiến trúc**: Centralized NORI Admin & CMS + Version-Controlled Data Snapshot & Media Sync + Mobile-First Responsive & PWA (`Next.js 16.4.6` + `React 19.3.1` + `Payload CMS 4.0.0-beta.8` + `SQLite` `v2.5`)
- **Kết luận nghiệm thu kỹ thuật**: Hệ thống **vận hành hoàn toàn ổn định và đạt chuẩn trên môi trường local / production build**. Toàn bộ **352 tests** (**258 unit tests** + **93 Playwright E2E tests** trên môi trường DB cô lập + **1 Isolated Admin Test**) đạt tỷ lệ **100% PASS**. Đã xử lý triệt để layout shift trên desktop (`CLS` từ `0.1327` giảm xuống `0.0038`), hoàn thiện đồng bộ dữ liệu nhóm qua Git Snapshot (`data/snapshots/`, `media/seed/`), chống giao dịch đồng thời (409 Conflict), chặn thanh toán trùng lặp (30s window), bảo mật Service Worker allowlist và sao lưu nhất quán SQLite + Media (`VACUUM INTO`).
- **Phân loại mức độ sẵn sàng triển khai**:
  - **Sẵn sàng kỹ thuật (Technical Ready)**: `100%` (Build, Typecheck, Lint, Format, Data Sync, Media Sync, E2E, Core Web Vitals, Security, Backup & Restore).
  - **Sẵn sàng thương mại (Commercial Ready)**: `CHƯA HOÀN TOÀN` do đội xe 21 chiếc vẫn gắn cờ `DEMO`, thanh toán và Email/SMS đang ở chế độ mô phỏng an toàn (Sandbox).

---

## 1. Tổng hợp Kết quả Kiểm thử Hệ thống

| Hạng mục                                      | Công cụ                       | Kết quả quan sát                                                                                                                            | Trạng thái |
| :-------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :--------- |
| `pnpm format:check`                           | `oxfmt 0.73.0`                | `230/230` tệp mã nguồn và tài liệu đúng chuẩn format                                                                                        | `PASS`     |
| `pnpm lint`                                   | `scripts/static-lint.mjs`     | `171/171` tệp (`0` vấn đề AST / `assertOrigin` / secret)                                                                                    | `PASS`     |
| `pnpm typecheck`                              | `tsc --noEmit`                | `0` lỗi TypeScript                                                                                                                          | `PASS`     |
| `pnpm test` (Unit tests)                      | Node Test Runner              | `258/258 PASS` (`tests/rental-rules.test.mjs`, `tests/rbac-access.test.mjs`, `tests/data-sync.test.mjs`)                                    | `PASS`     |
| `pnpm data:validate` & `pnpm media:validate`  | `src/lib/data-sync.ts`        | `12/12` snapshot files & `67/67` media files hợp lệ, `0` dữ liệu nhạy cảm, `0` lỗi khóa ngoại                                               | `PASS`     |
| `pnpm build` (`payload build`)                | Next.js 16 Production Build   | `75/75` trang tĩnh/SSG (`○`/`●`), gồm toàn bộ 15 `/dashboard/*` (`○ (Static)`), `/posts`, `/favorites`, `/offline`, `/manifest.webmanifest` | `PASS`     |
| `node scripts/test-admin-isolated.mjs`        | `node:sqlite` + `pbkdf2`      | `ISOLATED_ADMIN_TEST_PASS` (seed idempotent, PBKDF2-SHA256, integrity ok)                                                                   | `PASS`     |
| Playwright E2E Isolated (`test:e2e:isolated`) | Playwright Chromium & WebKit  | `93/93 PASS` trên `nori-e2e-isolated.db` (`8/8` spec files), bảo toàn 100% `./nori.db` gốc (`integrity = ok`, `fk = 0`)                     | `PASS`     |
| **TỔNG CỘNG TEST AUTOMATION**                 | **Unit + E2E + Admin**        | **352 / 352 TEST PASS (100%)**                                                                                                              | **PASS**   |
| Đo lường Core Web Vitals (Production)         | Performance Timeline & Chrome | Desktop `/vehicles/toyota-fortuner`: CLS = `0.0038`, LCP = `516ms`, INP = `40ms`. Mobile throttled 4x CPU: CLS = `0.0003`                   | `PASS`     |
| Cơ chế sao lưu & phục hồi DB + Media          | `scripts/data-backup.ts`      | Sao lưu trực tuyến không khóa qua SQLite `VACUUM INTO` + `media/` + `backup-manifest.json` + `PRAGMA integrity_check = ok`                  | `PASS`     |
| `figma make verify-deploy`                    | Cloud CLI                     | Không thể chạy trên shell Windows cục bộ do thiếu binary `figma` CLI                                                                        | `NOT_RUN`  |
| Kiểm thử trên thiết bị di động thật qua HTTPS | Physical iPhone & Android     | Yêu cầu thiết lập HTTPS tunnel (`cloudflared` / `ngrok`) trên thiết bị người dùng thật                                                      | `NOT_RUN`  |

---

## 2. Các Cải tiến Trọng điểm Đã Hoàn thiện

1. **Đồng bộ Dữ liệu Toàn diện (Data Synchronization)**:
   - Kích hoạt `export const dynamicParams = true` tại `src/app/(frontend)/vehicles/[slug]/page.tsx`, cho phép hiển thị các mẫu xe mới tạo từ Admin ngoài danh sách build tĩnh mà không cần build lại ứng dụng.
   - Hoàn thiện Payload hooks `revalidateCatalogue` và `revalidateDeletedCatalogue` với cơ chế bóc tách slug phụ thuộc và xóa tag cache Next.js tương ứng (`nori-catalogue-v3`, `nori-model-${slug}`).
   - Backend luôn xác thực giá và lịch khả dụng (`rental_days` + `maintenance_schedules`) trước khi lưu đơn giao dịch.
2. **Nghiệp vụ & An ninh Bảo mật (Business & Security)**:
   - Kiểm soát giao dịch đồng thời: Trả về mã lỗi `HTTP 409` khi xảy ra xung đột trùng lịch thuê (Double-booking collision).
   - Kiểm soát thanh toán lặp: Tích hợp Idempotency guard trong vòng 30 giây đối với các giao dịch trùng `bookingId`, `paymentType`, `amount`, trả về `HTTP 409 DUPLICATE_PAYMENT`.
   - Phân quyền RBAC nghiêm ngặt: 13 route Dashboard và toàn bộ API `/nori-api/dashboard/*` chỉ cho phép quyền Admin (`admins` collection), khách hàng (`users`) bị từ chối `403`.
   - Bảo mật PWA & Service Worker: Cấu hình allowlist tuyệt đối không cache tài nguyên nhạy cảm (cookie, auth, checkout, account); gửi lệnh `CLEAR_CACHES` dọn dẹp sạch sẽ khi đăng xuất.
   - Cách ly dữ liệu Checkout Draft: Bản nháp giỏ hàng được khóa theo user ID trong `sessionStorage`, xóa sạch khi logout.
3. **Hiệu năng & Trải nghiệm Người dùng (Performance & UX)**:
   - Xóa bỏ hiện tượng giật cục Layout Shift (CLS): Khởi tạo fallback giá và trạng thái xe ngay từ SSR; chuẩn hóa chiều cao Skeleton hai cột `min-h-[1200px]` và sidebar `h-4 w-28` + `h-control`, đưa CLS từ `0.1327` xuống `0.0038`.
   - Thời gian phản hồi LCP đạt `516ms`, tương tác INP đạt `40ms`, đáp ứng xuất sắc ngưỡng Web Vitals (Tốt: LCP < 2.5s, CLS < 0.1, INP < 200ms).
4. **Kiểm thử Đa nền tảng (Cross-Platform)**:
   - Toàn bộ 5 luồng nghiệp vụ lớn (Tìm kiếm, Lọc danh mục, Đặt xe, Mua xe, Tài khoản) được kiểm thử tự động trên cả Mobile Chromium và Mobile WebKit (mô phỏng Safari iOS 16 trên iPhone 14).
