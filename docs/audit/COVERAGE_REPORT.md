# NORI Vehicle Rental — Test Coverage & Cross-Browser Verification Report

> **Nguyên tắc minh bạch (Zero Fabricated Metrics)**: Mọi tỷ lệ % độ phủ mã nguồn dưới đây được đo trực tiếp từ `node --test --experimental-test-coverage`. Các phân hệ không chạy qua Node unit harness (Next.js SSR pages, React Client Components, Payload collection hooks) được ghi nhận trung thực là **`NOT MEASURED (Line Coverage)`** và kiểm chứng bằng E2E / UAT tích hợp ở mức hành vi.  
> **Ngày cập nhật**: `2026-11-18`

---

## 1. Đo lường Unit Test Coverage thực tế (`node --test --experimental-test-coverage`)

Lệnh thực thi: `node --test --experimental-test-coverage tests/*.test.mjs` (`tests/rental-rules.test.mjs` + `tests/rbac-access.test.mjs`) → **`247 / 247` PASS (`0` fail, `0` skip, `272.3ms`)**.

| Tệp mã nguồn được đo (`src/`)                                  |    Line %     |   Branch %   |    Funcs %    | Ghi chú phạm vi dòng chưa phủ (Uncovered)                                                                                                                                                               |
| :------------------------------------------------------------- | :-----------: | :----------: | :-----------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/access/nori.ts`](../../src/access/nori.ts)               | **`100.00%`** | **`91.67%`** | **`100.00%`** | Đã phủ đủ `SUPER_ADMIN`, `OPERATOR`, fallback quyền mặc định, `publish`, `adminMediaWriteAccess`, `adminMediaDeleteAccess`, `ownAccount`, `ownRecords`, `customerOnly`.                                 |
| [`src/lib/notifications.ts`](../../src/lib/notifications.ts)   | **`97.03%`**  | **`77.78%`** | **`100.00%`** | Nhánh `res.ok === true` từ webhook HTTP ngoài thực tế (lines 93–95) cần server webhook đích; đã kiểm chứng cả lỗi DB in-app & webhook unreachable không làm sập luồng duyệt đơn.                        |
| [`src/lib/rental-rules.ts`](../../src/lib/rental-rules.ts)     | **`93.09%`**  | **`84.50%`** | **`93.88%`**  | Phủ đầy đủ nghiệp vụ ngày `Asia/Ho_Chi_Minh`, nửa mở `[startDate, endDate)`, tính giá/giảm tuần-tháng/cuối tuần/lễ/addons, chuyển trạng thái booking & inquiry, promotion engine, thông số xe.          |
| [`src/lib/session-cookie.ts`](../../src/lib/session-cookie.ts) | **`87.78%`**  | **`92.31%`** | **`100.00%`** | Lines `68-69, 71-79`: trường hợp header URL/origin lỗi định dạng; đã phủ localhost HTTP, reverse proxy `X-Forwarded-Proto: https`, cross-origin Figma Make `SameSite=none`, `hasActiveSessionRecord()`. |
| **Tổng cộng trong phạm vi Node Unit Harness**                  | **`93.54%`**  | **`85.68%`** | **`95.77%`**  | Tổng hợp trực tiếp từ V8 coverage report của Node v24.22.3.                                                                                                                                             |

### Phần mã không đo line coverage bằng V8 unit harness (`NOT MEASURED`)

| Lớp kiến trúc                                                    |                    Số lượng tệp / route                    | Tình trạng Line Coverage | Phương thức kiểm chứng thay thế                                                                                                                                      |
| :--------------------------------------------------------------- | :--------------------------------------------------------: | :----------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Router Pages (`src/app/(frontend)/**`)                       | `29` page/not-found files (`76` route build table entries) |    **`NOT MEASURED`**    | Kiểm chứng qua `pnpm build` (Static/SSG) + `92/92` Playwright E2E + `7/7` UAT walkthrough + Load concurrency (`1–50` luồng).                                         |
| Custom API Route Handlers (`/nori-api/*`)                        |     `24` route handlers (`GET/POST/PUT/PATCH/DELETE`)      |    **`NOT MEASURED`**    | Kiểm chứng hành vi HTTP status (`200/201/400/401/403/409/429`), RBAC, concurrency lock & HMAC qua E2E (`QA-SEC-01..03`, `QA-CONC-01..02`, `QA-BIZ-01`, `data-sync`). |
| Payload Collections & Hooks (`src/collections/`, `src/globals/`) |         `18` collections + `1` global (`NoriSite`)         |    **`NOT MEASURED`**    | Kiểm chứng qua `pnpm test:admin` (isolated Payload Local API), `/api/*` REST RBAC probes (`QA-SEC-03`), và UAT walkthrough.                                          |
| UI Components (`src/components/**`)                              |            Toàn bộ storefront & 13 admin panels            |    **`NOT MEASURED`**    | Kiểm chứng tương tác trình duyệt, accessibility WCAG 2.2 AA (`@axe-core/playwright`), responsive `320px–1920px` & `naturalWidth > 0`.                                |

---

## 2. Độ phủ Nghiệp vụ, API & Phân quyền ở mức Tích hợp (Functional Coverage)

| Hạng mục kiểm kê                       |        Đã kiểm chứng         |               Tổng số                | Nhận xét                                                                                                                                           |
| :------------------------------------- | :--------------------------: | :----------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend Routes (`src/app/(frontend)`) |          `29 / 29`           |                 `29`                 | Bao gồm 14 trang khách/công khai, 13 dashboard admin, `/design-system`, `not-found.tsx`.                                                           |
| Custom `/nori-api/*` Handlers          |          `24 / 24`           |                 `24`                 | Bao gồm `/nori-api/health` mới bổ sung và toàn bộ auth, availability, fleet, bookings, inquiries, notifications, reviews, revalidate, dashboard/*. |
| Payload Native Collection Access       |          `19 / 19`           | `19` (`18` collections + `NoriSite`) | Đã rà soát tường minh cả `Folders`, `Tags`, `Admins`, `Users`, `MaintenanceSchedules`, `Bookings`, `Payments`, `Posts`, `NoriSite` (`QA-SEC-03`).  |
| Vai trò người dùng thực tế             |           `5 / 5`            |                 `5`                  | Guest, Customer (`ACTIVE` & `DISABLED`), Restricted Operator, Standard Operator, SUPER_ADMIN.                                                      |
| PlayWright E2E Suites (`tests/e2e/`)   | `10 / 10` specs (`92` tests) |              `92` tests              | `92 / 92` PASS (`0` skipped, `0` relaxed assertions).                                                                                              |

---

## 3. Ma trận Kiểm thử Đa trình duyệt & Thiết bị (Cross-Browser Matrix)

| Trình duyệt / Môi trường                           | Cấu hình thực thi                                                                  |       Kết quả thực tế        | Ghi chú trung thực                                                                                                                                 |
| :------------------------------------------------- | :--------------------------------------------------------------------------------- | :--------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Chrome (`Chromium`)**                     | Desktop `1440×1000` + Mobile emulated viewports (`320px–1920px`)                   | **`PASS` (`86 / 86` tests)** | Toàn bộ specs Chromium trong `pnpm test:e2e`, cộng thêm `7/7` UAT walkthrough.                                                                     |
| **Microsoft Edge (`msedge.exe`)**                  | `PLAYWRIGHT_CHROMIUM_EXECUTABLE=...msedge.exe`, `1440×1000`                        |  **`PASS` (`9 / 9` tests)**  | Đã chạy kiểm chứng `data-sync.spec.ts` (8 tests) + `nori.spec.ts:212` keyboard menu (`23.4s`).                                                     |
| **Apple WebKit Safari Emulated (`mobile-webkit`)** | Playwright `webkit-2388`, profile `iPhone 14` (`390×844`, `isMobile: true`, touch) |  **`PASS` (`6 / 6` tests)**  | `tests/e2e/mobile-webkit.spec.ts`: tìm kiếm bottom sheet, chi tiết xe, tư vấn mua xe, favorites/offline, WCAG, login session & checkout.           |
| **Mozilla Firefox**                                | Kiểm tra `%LOCALAPPDATA%\ms-playwright` & `Program Files`                          |        **`BLOCKED`**         | Firefox binary không được cài đặt trong môi trường Windows kiểm thử hiện tại; không tự giả lập kết quả cho Firefox.                                |
| **Thiết bị vật lý iOS / Android**                  | —                                                                                  |       **`NOT TESTED`**       | Chỉ thực hiện mô phỏng `iPhone 14` WebKit & mobile viewport `320px–390px`; cần kiểm tra smoke trên điện thoại thật trước chiến dịch quảng cáo lớn. |
