# BÁO CÁO KẾT QUẢ KIỂM THỬ TOÀN DIỆN (TEST REPORT — NORI FINAL AUDIT)

- **Ngày thực thi kiểm toán**: `2026-11-18`
- **Môi trường thực thi**: Node.js v22.13.1, Next.js 16.4.6 Standalone, Payload CMS 4.0.0-beta.8, SQLite (`nori.db`), Windows 11.
- **Trạng thái mã nguồn**: Hoàn tất khắc phục Layout Shift CLS (`0.0038`), hỗ trợ sinh trang động (`dynamicParams = true`), chống đặt trùng lịch 409, chống lặp thanh toán 409, Service Worker allowlist an toàn, cách ly draft theo người dùng, và bổ sung test đa nền tảng Mobile WebKit.
- **Tình trạng cơ sở dữ liệu (`./nori.db`)**: Nguyên vẹn, toàn vẹn (`PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = []`), 20 dòng xe, 21 xe DEMO, tài khoản Admin `admin@nori.vn`.

---

## 1. Bảng Tổng hợp Kết quả Kiểm thử Sau Hoàn thiện

| STT | Hạng mục Kiểm tra                                          | Bộ công cụ                        | Kết quả thực tế                                 | Trạng thái | Ghi chú & Đánh giá                                                                                                               |
| --: | :--------------------------------------------------------- | :-------------------------------- | :---------------------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Kiểm tra chuẩn định dạng mã nguồn                          | `oxfmt 0.73.0` (`pnpm format`)    | **`195/195` tệp đạt chuẩn**                     | `PASS`     | Toàn bộ mã nguồn, cấu hình, test suites và tài liệu markdown                                                                     |
|   2 | Phân tích cú pháp tĩnh & bảo mật (Linter)                  | `scripts/static-lint.mjs` (AST)   | **`140/140` tệp (`0` lỗi)**                     | `PASS`     | Không rò rỉ secret, 100% mutation API được bảo vệ bởi `assertOrigin()`                                                           |
|   3 | Kiểm tra kiểu dữ liệu TypeScript                           | `tsc --noEmit` (`TypeScript 6`)   | **Exit code `0` (`0` lỗi)**                     | `PASS`     | Đồng bộ tuyệt đối kiểu dữ liệu giữa Payload, Server Actions và Client Components                                                 |
|   4 | Build sản xuất (Production Build)                          | `payload build` (`Next.js 16`)    | **`71/71` trang tĩnh (`○`/`●`)**                | `PASS`     | Đầy đủ 13 route Dashboard (`○`), `/favorites`, `/offline`, `/manifest.webmanifest`, các API routes là `ƒ (Dynamic)`              |
|   5 | Kiểm thử đơn vị nghiệp vụ (Unit Tests)                     | `node --test` (Node Test Runner)  | **`205/205 PASS` (`209ms`)**                    | `PASS`     | Kiểm tra toàn diện công thức tính giá ngày/tuần/tháng, phụ phí, ma trận 9×9 trạng thái, voucher, kiểm tra hết hạn cọc            |
|   6 | Kiểm thử DB cô lập Admin                                   | `scripts/test-admin-isolated.mjs` | **`ISOLATED_ADMIN_TEST_PASS`**                  | `PASS`     | Kiểm tra tính lũy kế (idempotency) của seed dữ liệu trên bản sao DB tạm thời, bảo vệ dữ liệu sản xuất                            |
|   7 | Playwright E2E Core Suite                                  | Playwright Chromium Desktop       | **`43/43 PASS` (`2.2m`)**                       | `PASS`     | Toàn trình tìm xe, giỏ hàng, đặt cọc, duyệt đơn, bàn giao xe, kiểm duyệt đánh giá, xuất báo cáo CSV, WCAG 2.2 AA (`0` vi phạm)   |
|   8 | Playwright Responsive & PWA Suite                          | Playwright Chromium Mobile        | **`7/7 PASS` (`29.2s`)**                        | `PASS`     | Kiểm tra 11 breakpoints, Bottom Navigation (5 mục, safe area), Bottom Sheet Filter, Offline Fallback, SW Scope, Viewport 375px   |
|   9 | Playwright Data Sync & Security Suite                      | Playwright Chromium               | **`8/8 PASS` (`12.7s`)**                        | `PASS`     | Dynamic slug rendering ngoài build time, Payload hooks revalidate, Backend price validation, Race 409, Duplicate payment 409, SW |
|  10 | Playwright Mobile WebKit Suite                             | Playwright Real Mobile WebKit     | **`5/5 PASS` (`11.6s`)**                        | `PASS`     | Mô phỏng iPhone 14 Safari WebKit: Tìm xe, lọc chip, đặt thuê xe, tư vấn mua xe, quản lý tài khoản                                |
|  11 | **TỔNG CỘNG TEST AUTOMATION**                              | **Unit + E2E Suites**             | **`268 / 268 PASS` (`100%`)**                   | **PASS**   | **Toàn bộ 268 kịch bản kiểm thử tự động đều vượt qua thành công**                                                                |
|  12 | Đo lường hiệu năng Core Web Vitals (Production)            | Performance Timeline API          | **CLS = `0.0038`, LCP = `516ms`, INP = `40ms`** | `PASS`     | Khắc phục triệt để lỗi CLS `0.1327` trên trang chi tiết Toyota Fortuner; Mobile Throttled 4x CPU đạt CLS `0.0003`                |
|  13 | Cơ chế sao lưu & phục hồi dữ liệu SQLite                   | `scripts/backup-db.mjs`           | **`PRAGMA integrity_check = ok`**               | `PASS`     | Sao lưu trực tuyến an toàn qua `VACUUM INTO` mà không cần ngắt máy chủ; script phục hồi sẵn sàng                                 |
|  14 | Cloud Deploy Verification (`figma make verify-deploy`)     | Figma Platform CLI                | **Chưa hỗ trợ shell Windows cục bộ**            | `NOT_RUN`  | Thiếu binary `figma` CLI trên máy tính phát triển cục bộ                                                                         |
|  15 | Kiểm thử PWA trên thiết bị iPhone/Android vật lý qua HTTPS | Thiết bị thật của người dùng      | **Yêu cầu thiết lập HTTPS tunnel**              | `NOT_RUN`  | Đã cung cấp tài liệu hướng dẫn chi tiết tại `docs/PWA.md`                                                                        |

---

## 2. Kết quả Đo lường Hiệu năng & Core Web Vitals Chi tiết

Đo lường trực tiếp trên máy chủ **Production Build Standalone** (`node .next/standalone/server.js`):

| Tuyến đường (Route)                      | Thiết bị / Môi trường              | CLS Thực tế  | LCP Thực tế | INP / FID | Trạng thái Web Vitals           |
| :--------------------------------------- | :--------------------------------- | :----------- | :---------- | :-------- | :------------------------------ |
| `/vehicles/toyota-fortuner` (Trọng điểm) | Desktop (1440×900)                 | **`0.0038`** | `516 ms`    | `40 ms`   | **ĐẠT (Tốt)** (Chuẩn CLS ≤ 0.1) |
| `/vehicles/honda-pcx`                    | Desktop (1440×900)                 | **`0.0026`** | `516 ms`    | `40 ms`   | **ĐẠT (Tốt)**                   |
| `/vehicles/ford-ranger-raptor`           | Desktop (1440×900)                 | **`0.0031`** | `580 ms`    | `32 ms`   | **ĐẠT (Tốt)**                   |
| `/` (Trang chủ)                          | Mobile (390×844)                   | **`0.0000`** | `544 ms`    | `0 ms`    | **ĐẠT (Tốt)**                   |
| `/vehicles` (Catalogue)                  | Mobile (390×844)                   | **`0.0000`** | `488 ms`    | `24 ms`   | **ĐẠT (Tốt)**                   |
| `/vehicles/toyota-fortuner`              | Mobile Throttled (4x CPU, Slow 4G) | **`0.0003`** | `1240 ms`   | `48 ms`   | **ĐẠT (Tốt)**                   |

_Ghi chú_: Điểm CLS của `/vehicles/toyota-fortuner` ban đầu là `0.1327` (và có lúc đạt `0.1824` trong điều kiện không có skeleton chuẩn). Sau khi triển khai `VehicleDetailSkeleton` đồng bộ kích thước và khởi tạo giá/cờ demo tại SSR, hiện tượng giật layout đã giảm **97%**, đạt `0.0038`.

---

## 3. Xác minh 10 Hạng mục Nghiệp vụ & Bảo mật Trọng yếu

1. **Khắc phục lỗi Dynamic Slug Routes**: Thêm `export const dynamicParams = true` tại `vehicles/[slug]/page.tsx`, giúp người quản trị tạo xe mới trên Admin và khách hàng xem được ngay mà không phải build lại.
2. **Khắc phục đồng bộ dữ liệu tĩnh**: Payload hooks kích hoạt `revalidateTag` bóc tách slug dòng xe từ xe cụ thể để xóa đúng tag `nori-model-${slug}` và `nori-catalogue-v3`.
3. **Chống đặt xe trùng lịch đồng thời**: Hai request đồng thời gửi lên cùng khoảng ngày được xử lý trong transaction; một đơn thành công `201`, đơn còn lại trả `409 Conflict`.
4. **Chống gọi thanh toán lặp**: Cơ chế Idempotency guard 30 giây trong `/nori-api/dashboard/payments` phát hiện request trùng lặp và từ chối với `HTTP 409 DUPLICATE_PAYMENT`.
5. **Kiểm soát phân quyền RBAC**: 13 route Dashboard và toàn bộ API `/nori-api/dashboard/*` từ chối `403` với tài khoản khách hàng thông thường (`users`).
6. **Bảo mật Service Worker**: Chỉ cache tài nguyên công khai tĩnh theo danh sách cho phép (Allowlist), chặn 100% việc cache cookie, auth, API và các trang thông tin cá nhân.
7. **Dọn sạch Cache khi Đăng xuất**: Gửi message `CLEAR_CACHES` xóa sạch runtime caches của Service Worker ngay khi người dùng đăng xuất.
8. **Cách ly Checkout Draft**: Bản nháp giỏ hàng được gán mã `userId` trong `sessionStorage`, xóa sạch khi đăng xuất nhằm bảo đảm không rò rỉ dữ liệu cá nhân sang tài khoản khác.
9. **Kiểm thử Đa nền tảng WebKit**: Chạy thành công 5 kịch bản Playwright trên engine WebKit (Mobile Safari iPhone 14), kiểm tra đầy đủ tìm xe, lọc danh mục, đặt thuê xe, tư vấn mua xe và quản lý tài khoản.
10. **Sao lưu trực tuyến SQLite**: Triển khai `scripts/backup-db.mjs` sử dụng lệnh SQLite chuẩn `VACUUM INTO`, tạo bản sao lưu nhất quán (2.18 MB) với `PRAGMA integrity_check = ok` mà không làm gián đoạn hệ thống.
