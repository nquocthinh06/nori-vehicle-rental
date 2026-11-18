# BÁO CÁO QA/QC TOÀN DIỆN, KHẮC PHỤC LỖI VÀ KIỂM THỬ HỒI QUY NGHIỆP VỤ ĐẶT XE – NORI

- **Dự án**: NORI Vehicle Rental (`https://github.com/nquocthinh06/nori-vehicle-rental`)
- **Ngày thực hiện**: `18/11/2026` (Múi giờ `Asia/Ho_Chi_Minh`)
- **Phạm vi kiểm định**: Hydration SSR/CSR, Nghiệp vụ Mã khuyến mãi, Tính toán chi phí & Đặt cọc, Quy trình Checkout, Chỉnh sửa/Hủy/Xét duyệt đơn thuê, Quản trị Khuyến mãi Admin, Bảo mật API/RBAC, WCAG 2.2 AA, Responsive & PWA.
- **Môi trường kiểm thử E2E**: Bản sao SQLite cô lập (`nori-qa-isolated.db`), bảo toàn nguyên trạng 100% dữ liệu thật trong `./nori.db`.

---

## 1. Danh sách lỗi phát hiện, Nguyên nhân gốc & Mức độ nghiêm trọng (P0–P3)

Qua quá trình rà soát mã nguồn và kiểm thử động toàn hệ thống, tổng cộng **20 lỗi** (`5 P0`, `9 P1`, `6 P2`) đã được phát hiện và xử lý triệt để:

| Mã lỗi     | Mức độ | Phân hệ / File                                                                                                   | Mô tả lỗi phát hiện                                                                                                                                                                                                                                             | Nguyên nhân gốc (Root Cause)                                                                                                                                                                                                                                 |
| :--------- | :----: | :--------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUG-01** | **P0** | Checkout (`src/components/checkout-panel.tsx`)                                                                   | Khách xóa mã khuyến mãi trên ô nhập nhưng bấm **Xác nhận đặt thuê** vẫn gửi mã cũ lên Backend gây lỗi `400` chặn đặt xe.                                                                                                                                        | Tách rời hai biến `promoCode` (ô nhập) và `appliedPromo` (gửi API): khi sửa hoặc xóa trắng `promoCode`, `appliedPromo` không được xóa và không có nút **Bỏ mã khuyến mãi**. Kể cả mã bị Backend từ chối vẫn nằm trong `appliedPromo`.                        |
| **BUG-02** | **P0** | Tính phí & Đặt cọc (`availability/route.ts`, `Bookings.ts`)                                                      | Tiền đặt cọc đảm bảo (`depositAmount` / `initialPaymentDue`) bị trừ nhầm vào `remainingAmount` (tiền thuê còn lại), làm đơn thuê `5.150.000 ₫` (cọc `20.000.000 ₫`) có `remainingAmount = 0` hoặc đơn `34.430.000 ₫` (cọc `30.000.000 ₫`) còn `4.430.000 ₫`.    | `calculateRentalQuote` đã tách đúng `remainingAmount = estimatedTotal`, nhưng 3 nơi tính lại sau khuyến mãi (`availability/route.ts:187`, `Bookings.ts:227`, `Bookings.ts:705`) ghi đè `Math.max(0, finalTotal - quote.initialPaymentDue)`.                  |
| **BUG-03** | **P0** | Vòng đời lượt khuyến mãi (`src/collections/Bookings.ts`)                                                         | Đơn thuê có áp mã khuyến mãi khi bị khách hủy (`CANCELLED`) hoặc Admin từ chối (`REJECTED`) không hoàn trả `usedCount`, làm mất vĩnh viễn lượt dùng của mã giới hạn 1 lượt.                                                                                     | Hook `afterChange` trong `Bookings.ts` chỉ giải phóng lịch `rental-days` khi sang `CANCELLED` / `REJECTED` mà quên giảm `promotions.used_count`.                                                                                                             |
| **BUG-04** | **P0** | Đồng thời & Transaction (`Bookings.ts`, `bookings/route.ts`)                                                     | Hai khách hàng cùng đặt mã chỉ còn 1 lượt hoặc đặt trùng xe cùng lúc gây tranh chấp khóa SQLite hoặc nguy cơ vượt `usageLimit`.                                                                                                                                 | Kiểm tra `(promo.usedCount ?? 0) >= promo.usageLimit` thực hiện bằng đọc-ghi tách rời trong JS thay vì câu lệnh `UPDATE ... WHERE COALESCE(used_count, 0) < usage_limit` nguyên tử trong cùng transaction kết hợp hàng đợi tuần tự ghi đơn.                  |
| **BUG-05** | **P0** | Báo giá sửa đơn chờ duyệt (`availability/route.ts`, `RentalDays.ts`)                                             | Khi mở hộp thoại **Chỉnh sửa thông tin thuê** tại `/my-bookings`, API `/nori-api/availability?...&excludeBookingId=...` trả lỗi `400: The following path cannot be queried: bookingKey`.                                                                        | `RentalDays.ts` khóa `bookingKey.access.read = () => false` để bảo mật public API, nhưng `availability/route.ts` lại truy vấn `where: { bookingKey: { not_equals: excludeBookingKey } }` với `overrideAccess: false` dù đã xác thực chủ sở hữu đơn trước đó. |
| **BUG-06** | **P1** | Bảo mật & Kiểm tra mã (`Promotions.ts`, `availability/route.ts`)                                                 | Endpoint `/api/promotions` cho phép người dùng ẩn danh đọc danh sách tất cả mã đang bật; đồng thời `/nori-api/availability` không phân biệt được mã không tồn tại với mã đang tạm tắt (`active = false`).                                                       | `Promotions.access.read` trả `{ active: { equals: true } }` cho public và `availability/route.ts` gọi `find` với `overrideAccess: false`.                                                                                                                    |
| **BUG-07** | **P1** | Hydration SSR/CSR (`src/app/(frontend)/layout.tsx`)                                                              | Cảnh báo Hydration của React 19 tại `RootLayout` dòng 77 khi trình duyệt có extension bảo mật (Kaspersky/Bisect...) chèn thuộc tính `__processed_<uuid>__` lên `<body>`.                                                                                        | Thẻ `<html>` và `<body>` gốc trong `layout.tsx` chưa gắn `suppressHydrationWarning` có mục tiêu cho thuộc tính ngoại lai do extension trình duyệt tiêm vào trước thời điểm hydrate.                                                                          |
| **BUG-08** | **P1** | Hydration SSG/CSR (`availability-calendar.tsx`, `vehicle-detail.tsx`, `pwa-manager.tsx`)                         | Sai lệch HTML giữa bản build tĩnh SSG và client CSR khi sang ngày mới theo múi giờ VN.                                                                                                                                                                          | `AvailabilityCalendar` và `VehicleDetail` gọi trực tiếp `businessToday()` (`new Date()`) ngay trong thân hàm render thay vì khởi tạo sau khi mount trong `useEffect`, và `PwaManager` đọc `window.navigator` trực tiếp lúc render.                           |
| **BUG-09** | **P1** | Thông báo khuyến mãi (`availability/route.ts`, `Bookings.ts`)                                                    | Trùng lặp logic kiểm tra mã ở 3 nơi và chỉ trả thông báo chung `"Mã khuyến mãi không hợp lệ hoặc chưa đủ điều kiện"`.                                                                                                                                           | Chưa tách module dùng chung và chưa phân nhánh mã trạng thái cụ thể (không tồn tại, tạm ngưng, sai dịch vụ, chưa bắt đầu, đã kết thúc, hết lượt, thiếu ngày thuê tối thiểu).                                                                                 |
| **BUG-10** | **P1** | Admin Khuyến mãi (`dashboard/promotions/route.ts`, `Promotions.ts`, `promotions-panel.tsx`)                      | Cho phép lưu phần trăm giảm `> 100%`, giá trị âm/thập phân, `validTo < validFrom`, `usageLimit < usedCount`, và lỗi `503` khi tạo trùng mã `code`.                                                                                                              | Thiếu hàm kiểm định biên dữ liệu tập trung ở cả Collection Hook `beforeValidate`, API `POST/PATCH`, và form Admin.                                                                                                                                           |
| **BUG-11** | **P1** | Đối soát giá khi Checkout (`checkout-panel.tsx`, `Bookings.ts`)                                                  | Nếu Admin tắt hoặc đổi giá trị mã khuyến mãi ngay trước lúc khách bấm xác nhận, khách không nhận được thông báo làm mới báo giá rõ ràng; đồng thời `requestQuote` chạy nền xóa mất thông báo lỗi gửi đơn sau vài mili-giây.                                     | Thiếu tham chiếu `expectedTotalPrice` đối chiếu giá tại thời điểm xác nhận và `requestQuote` gọi `setError('')` đè lên lỗi của `confirm()`.                                                                                                                  |
| **BUG-12** | **P1** | Hộp thoại sửa đơn chờ duyệt (`src/components/bookings-panel.tsx`)                                                | Thiếu cơ chế xác nhận/bỏ mã khuyến mãi tường minh khi sửa đơn `PENDING`; xung đột giữa `openEditModal` tải nền và bộ đếm debounce `180ms` làm hủy yêu cầu kiểm tra mã vừa nhấn.                                                                                 | Chưa tách 3 trạng thái mã trong modal sửa đơn, chưa hủy timer debounce khi nhấn **Áp dụng**/**Bỏ mã**, và `openEditModal` gọi lại `populateEditForm(fresh)` ghi đè dữ liệu người dùng vừa nhập.                                                              |
| **BUG-13** | **P1** | Chống gửi trùng & Kiểm tra SĐT (`checkout-panel.tsx`, `Bookings.ts`)                                             | Nhấn đúp nhanh nút xác nhận có nguy cơ gửi 2 request trước khi state `busy` kịp render; API tạo đơn chưa kiểm tra định dạng `customerPhone` hợp lệ.                                                                                                             | Thiếu khóa đồng bộ `useRef` (`submittingRef`) tại sự kiện submit và thiếu regex kiểm tra `customerPhone` / `pickupTime` / `returnTime` ở nhánh `operation === 'create'` của `Bookings.ts`.                                                                   |
| **BUG-14** | **P1** | Cô lập Database E2E (`tests/e2e/nori.spec.ts`, `data-sync.spec.ts`, `upgrade-workflows.spec.ts`)                 | Các script kiểm thử E2E mở cứng `./nori.db` qua `DatabaseSync`, gây rủi ro tác động vào DB thật khi chạy E2E.                                                                                                                                                   | Chưa ưu tiên đọc `process.env.NORI_SQLITE_PATH` và `process.env.DATABASE_URI` trong `getDbPath()`.                                                                                                                                                           |
| **BUG-15** | **P2** | Hiển thị trạng thái Admin (`src/components/admin/promotions-panel.tsx`)                                          | Chỉ hiển thị `Đang bật` / `Tạm tắt` theo cờ `active`, khiến mã `NORIXINCAMON` (`validFrom: 2026-11-19`) hiển thị như đang chạy dù thực tế **Chưa bắt đầu**; thiếu số lượt còn lại, bộ chọn phạm vi (`RENT`/`SALE`/`ALL`), nút Xóa và công cụ tính thử mức giảm. | Chưa tính toán trạng thái hiệu lực thời gian thực (`Đang diễn ra`, `Chưa bắt đầu`, `Hết hạn`, `Hết lượt`, `Vô hiệu hóa`) tách biệt với công tắc `active`.                                                                                                    |
| **BUG-16** | **P2** | Định dạng tiền `0 ₫` (`rental-rules.ts`, `checkout-panel.tsx`, `bookings-panel.tsx`, `admin/bookings-panel.tsx`) | Các khoản phí bằng `0` hoặc tổng tiền sau khuyến mãi `100%` (`0 ₫`) bị hiển thị thành `"Chưa cập nhật"`.                                                                                                                                                        | Dùng chung `formatMoney` (vốn quy ước `0 -> 'Chưa cập nhật'` cho giá niêm yết xe chưa nhập) cho cả các trường tổng tiền/phụ phí tính toán.                                                                                                                   |
| **BUG-17** | **P2** | Lưu nháp khi Refresh Checkout (`src/components/checkout-panel.tsx`)                                              | Khi F5 / Refresh trang `/checkout`, số điện thoại liên hệ và mã khuyến mãi đã xác nhận bị mất.                                                                                                                                                                  | `sessionStorage` draft chưa lưu `customerPhone` và `confirmedPromoCode`.                                                                                                                                                                                     |
| **BUG-18** | **P2** | Đua phản hồi API báo giá (`checkout-panel.tsx`, `bookings-panel.tsx`, `client-api.ts`)                           | Thay đổi nhiều mã hoặc dịch vụ liên tiếp có thể để phản hồi `/availability` cũ ghi đè lên báo giá mới; hủy request bằng `AbortController` bị `client-api.ts` biến thành lỗi `"Không thể kết nối"`.                                                              | Thiếu `AbortController` kết hợp bộ đếm tuần tự `quoteSeqRef` và `client-api.ts` chưa rethrow `AbortError`.                                                                                                                                                   |
| **BUG-19** | **P2** | WCAG 2.2 AA Mobile (`src/components/vehicle-card.tsx`)                                                           | Vi phạm quy tắc `label-content-name-mismatch` (WCAG 2.5.3) trên liên kết ảnh của `VehicleCard` tại viewport di động `375px`.                                                                                                                                    | Nhãn văn bản hiển thị (`Ảnh catalogue`, `Xe DEMO`) đặt lồng bên trong thẻ `<a aria-label="Xem <Tên xe>">` làm nội dung văn bản con không khớp với `aria-label`.                                                                                              |
| **BUG-20** | **P2** | Bộ lọc Danh mục phương tiện (`src/components/catalogue.tsx`)                                                     | Bộ lọc **Thương hiệu** và **Kiểu dáng** không đồng bộ chuẩn `<select>` bản địa với các bộ lọc còn lại, làm gãy tương tác chọn chuẩn HTML `<select>` trên trình duyệt/kiểm thử hồi quy.                                                                          | Sử dụng combobox tùy biến thay vì component `<Select>` chuẩn của Design System NORI cho danh sách ngắn.                                                                                                                                                      |

---

## 2. Danh sách File đã chỉnh sửa & thêm mới

### File thêm mới (3 file)

1. `src/lib/promo-service.ts` — Dịch vụ Backend dùng chung cho tra cứu, đánh giá điều kiện khuyến mãi, khóa tuần tự giao dịch đặt xe (`withBookingWriteLock`), tăng/hoàn trả `used_count` nguyên tử trong SQLite transaction.
2. `tests/e2e/promo-checkout-regression.spec.ts` — Bộ Playwright E2E Regression chuyên sâu cho Hydration, Admin Promotions, Checkout Promo State Machine, Concurrency Race Conditions và Vòng đời sau đặt xe.
3. `docs/audit/QA_REGRESSION_REPORT.md` — Báo cáo kiểm định QA/QC & hồi quy toàn diện.

### File chỉnh sửa (19 file)

1. `src/app/(frontend)/layout.tsx` — Gắn `suppressHydrationWarning` có mục tiêu trên `<html>` và `<body>` kèm giải thích kỹ thuật cho thuộc tính `__processed_*` từ extension trình duyệt.
2. `src/components/availability-calendar.tsx` — Đồng bộ khởi tạo `today` / `month` sau mount (`useEffect`) đảm bảo đồng nhất 100% giữa SSG và CSR.
3. `src/components/vehicle-detail.tsx` — Chuyển `businessToday()` khỏi thân render sang state `today` cập nhật sau mount.
4. `src/components/pwa-manager.tsx` — Đưa kiểm tra `window.matchMedia` và `navigator.userAgent` vào `useEffect`.
5. `src/lib/rental-rules.ts` — Bổ sung `formatVnd`, `evaluatePromotion`, `applyPromotionToQuote`, `getPromotionRuntimeStatus`, `validatePromotionInput`, `PROMO_REMOVED_MESSAGE`.
6. `src/lib/domain-types.ts` — Mở rộng kiểu `Quote` với `promoCode`, `promoStatus`, `promoMessage`.
7. `src/lib/client-api.ts` — Bảo toàn `AbortError` khi chủ động hủy request báo giá cũ.
8. `src/collections/Promotions.ts` — Khóa `access.read: isAdmin` bảo vệ danh sách mã khuyến mãi và bổ sung kiểm định toàn diện trong `beforeValidate`.
9. `src/collections/Bookings.ts` — Tích hợp `promo-service.ts` cho tạo đơn, sửa đơn `PENDING`, hoàn trả `usedCount` khi `CANCELLED`/`REJECTED`, kiểm tra `expectedTotalPrice`, chuẩn hóa `remainingAmount = finalQuote.estimatedTotal` tách biệt hoàn toàn khỏi tiền cọc.
10. `src/app/(frontend)/nori-api/availability/route.ts` — Dùng chung `lookupAndEvaluatePromotion` + `applyPromotionToQuote`, sửa lỗi truy vấn `bookingKey` khi loại trừ đơn đang sửa (`excludeBookingId`).
11. `src/app/(frontend)/nori-api/bookings/route.ts` — Bọc `withBookingWriteLock` cho `POST`/`PUT`/`PATCH`, hỗ trợ kiểm tra đối chiếu `expectedTotalPrice`, đồng bộ `remainingAmount`.
12. `src/app/(frontend)/nori-api/dashboard/bookings/route.ts` — Bọc `withBookingWriteLock` khi Admin chuyển trạng thái đơn và chuẩn hóa `remainingAmount`.
13. `src/app/(frontend)/nori-api/dashboard/promotions/route.ts` — Kiểm định chặt `POST`/`PATCH`, trả lỗi `409` rõ ràng khi trùng mã, bổ sung `runtimeStatus`, `runtimeStatusLabel`, `remainingUses`.
14. `src/app/(frontend)/nori-api/dashboard/route.ts` — Đồng bộ `remainingAmount` tách rời khỏi tiền đặt cọc trên trang tổng quan Dashboard.
15. `src/components/checkout-panel.tsx` — Máy trạng thái khuyến mãi 3 pha (`promoDraft` / `checkingPromoCode` / `confirmedPromoCode`), nút **Bỏ mã khuyến mãi**, hủy request cũ bằng `AbortController` + `quoteSeqRef`, khóa chống nhấn đúp `submittingRef`, giữ thông báo lỗi khi làm mới báo giá (`preserveSubmitError`), lưu nháp `sessionStorage`.
16. `src/components/bookings-panel.tsx` — Đồng bộ máy trạng thái khuyến mãi 3 pha & nút **Bỏ mã khuyến mãi** trong modal chỉnh sửa đơn `PENDING`, triệt tiêu xung đột timer debounce & tải nền.
17. `src/components/admin/promotions-panel.tsx` — Nâng cấp toàn diện quản trị khuyến mãi: phân biệt công tắc kích hoạt với 5 trạng thái hiệu lực thực tế, hiển thị lượt đã dùng & còn lại, gợi ý định dạng VNĐ trực tiếp, hộp thoại xóa an toàn và công cụ **Kiểm tra thử mức giảm theo giá trị đơn thuê mẫu**.
18. `src/components/admin/bookings-panel.tsx` — Chuẩn hóa hiển thị `formatVnd` cho chi phí `0 ₫` và nhãn tiền đặt cọc tách riêng.
19. `src/components/vehicle-card.tsx`, `src/components/catalogue.tsx`, `tests/rental-rules.test.mjs`, `tests/e2e/nori.spec.ts`, `tests/e2e/data-sync.spec.ts`, `tests/e2e/upgrade-workflows.spec.ts` — Khắc phục WCAG 2.2 AA `label-content-name-mismatch`, đồng bộ `<Select>` bộ lọc xe và hỗ trợ biến môi trường `NORI_SQLITE_PATH` cho DB kiểm thử cô lập.

---

## 3. Giải pháp kỹ thuật đã triển khai

1. **Khắc phục triệt để Hydration Error & sai lệch SSR/CSR**:
   - Xác định nguyên nhân thuộc tính `__processed_<uuid>__` xuất hiện trên `<body>` tại `RootLayout` dòng 77 là do trình cắm bảo mật trình duyệt can thiệp DOM trước khi React hydrate (file `.figma/make/site.json` hoàn toàn rỗng `{}`). Áp dụng `suppressHydrationWarning` đúng chuẩn chỉ trên `<html>` và `<body>` gốc, tuyệt đối không gắn tràn lan lên component con.
   - Chuyển toàn bộ phép đọc ngày động `businessToday()` và `window`/`navigator` trong `AvailabilityCalendar`, `VehicleDetail`, `PwaManager` sang state cập nhật trong `useEffect`.
2. **Chuẩn hóa kiến trúc Khuyến mãi & Tính phí có thẩm quyền từ Backend**:
   - Mọi phép kiểm tra điều kiện mã (tồn tại, kích hoạt, phạm vi dịch vụ `RENT`/`SALE`/`ALL`, ngày bắt đầu/kết thúc theo múi giờ `Asia/Ho_Chi_Minh`, số ngày tối thiểu, giới hạn lượt dùng, trần giảm tối đa `maxDiscount`, kết hợp sau chiết khấu thuê dài ngày 5%/12%) được gom về một hàm thuần duy nhất `evaluatePromotion()` trong `src/lib/rental-rules.ts` và dịch vụ `src/lib/promo-service.ts`.
   - Cả 8 thông báo trạng thái khuyến mãi đều cụ thể, rõ nghĩa bằng tiếng Việt và không làm mất dữ liệu khách đã nhập trên biểu mẫu.
   - Tách bạch tuyệt đối **Tiền đặt cọc đảm bảo (hoàn trả)** (`depositAmount` / `depositSnapshot`) khỏi **Tổng tiền thuê** (`totalPrice`) và **Tiền thuê còn lại dự kiến** (`remainingAmount = totalPrice`).
3. **An toàn Giao dịch, Chống Race Condition & Chính sách Hoàn lượt Khuyến mãi**:
   - Tăng lượt dùng bằng câu lệnh SQL có điều kiện nguyên tử ngay trên phiên giao dịch Drizzle/SQLite hiện hành (`WHERE id = ? AND active = 1 AND (usage_limit IS NULL OR COALESCE(used_count, 0) < usage_limit)`), tự động rollback nếu bước giữ lịch `rental-days` hoặc tạo đơn thất bại.
   - Giữ nguyên mã trên cùng đơn `PENDING` khi chỉnh sửa không tiêu hao thêm lượt (`+0`); đổi mã `A -> B` tăng `B (+1)` và hoàn `A (-1)`; bỏ mã hoặc chuyển đơn sang `CANCELLED` / `REJECTED` tự động hoàn trả `1` lượt (`MAX(0, used_count - 1)`) đúng một lần duy nhất; đơn `COMPLETED` giữ nguyên lượt đã tiêu thụ.

---

## 4. Danh sách Test Case bổ sung

### 4.1. Unit Tests bổ sung (`tests/rental-rules.test.mjs` — 11 kịch bản mới `PROMO-01` → `PROMO-11`)

- `PROMO-01`: Định dạng tiền `formatVnd(0) === '0 ₫'` và giữ nguyên `formatMoney(0) === 'Chưa cập nhật'` cho giá catalogue chưa cấu hình.
- `PROMO-02`: Thông báo riêng khi mã khuyến mãi không tồn tại (`NOT_FOUND`).
- `PROMO-03`: Thông báo riêng khi chương trình đang tạm ngưng kích hoạt (`INACTIVE`).
- `PROMO-04`: Từ chối mã sai phạm vi dịch vụ (`SALE` áp vào đơn `RENT` → `INVALID_SCOPE`).
- `PROMO-05`: Kiểm tra ngày bắt đầu / ngày kết thúc chính xác tại mốc nửa đêm múi giờ `Asia/Ho_Chi_Minh`.
- `PROMO-06`: Chặn mã hết lượt (`USAGE_LIMIT_REACHED`) với khách mới nhưng cho phép giữ nguyên mã trên chính đơn `PENDING` đang chỉnh sửa (`alreadyHeldByCurrentBooking = true`).
- `PROMO-07`: Kiểm tra số ngày thuê tối thiểu (`MIN_DAYS_NOT_MET`) kèm thông báo rõ số ngày yêu cầu.
- `PROMO-08`: Tính giảm `PERCENT`, giới hạn trần `maxDiscount`, giảm `FIXED` vượt tổng đơn (chặn âm về `0 ₫`), và làm tròn số nguyên VNĐ (`Math.round`).
- `PROMO-09`: Kết hợp ưu đãi thuê dài ngày (7 ngày `-5%`) + mã khuyến mãi và chứng minh `remainingAmount` không bao giờ bị trừ nhầm bởi `depositAmount`.
- `PROMO-10`: Phân loại chính xác 5 trạng thái hiệu lực thực tế (`Vô hiệu hóa`, `Chưa bắt đầu`, `Hết hạn`, `Hết lượt`, `Đang diễn ra`) và tính số lượt còn lại.
- `PROMO-11`: Kiểm định đầu vào Admin chặn `PERCENT > 100%`, số tiền âm, ngày kết thúc trước ngày bắt đầu, ký tự mã không hợp lệ và `usageLimit < usedCount`.

### 4.2. Playwright E2E & Concurrency Integration Tests bổ sung (`tests/e2e/promo-checkout-regression.spec.ts` — 6 kịch bản lớn bao phủ hơn 25 luồng kiểm thử)

- `QA-E2E-01`: Giả lập extension trình duyệt tiêm `__processed_qa_ext_uuid__="true"` lên `<body>` trước hydrate trên cả Desktop (`1440×900`), Tablet (`768×1024`), Mobile (`390×844`) → xác nhận `0` Hydration Error, `0` Console/Page Error, và xác nhận `/api/promotions` chặn truy cập ẩn danh (`401/403`).
- `QA-E2E-02`: Kiểm thử toàn diện Admin Promotions CRUD: chặn `>100%`, số âm, ngược ngày, trùng mã (`409`); kiểm chứng hiển thị 5 badge trạng thái hiệu lực, định dạng VNĐ, số lượt còn lại, xóa mã có xác nhận và công cụ **Kiểm tra thử mức giảm theo đơn mẫu**.
- `QA-E2E-03`: Hành trình Checkout đầy đủ: khách chưa đăng nhập, chưa tích điều khoản, SĐT sai định dạng (giữ nguyên dữ liệu đã nhập), kiểm tra đủ 6 thông báo lỗi khuyến mãi riêng biệt, **nhập mã lỗi → xóa mã → đặt xe thành công không gửi mã cũ**, chuyển đổi liên tiếp nhiều mã, F5 Refresh trang giữ nguyên nháp, bấm **Bỏ mã khuyến mãi**, và đối soát khớp 100% giá báo giá ↔ đơn khách hàng ↔ Admin Dashboard ↔ tách biệt tiền cọc.
- `QA-E2E-04`: Mô phỏng mất mạng tạm thời khi nhấn xác nhận đặt thuê (không tạo đơn trùng, `used_count = 0`) + Admin tắt mã khuyến mãi ngay trước khi khách xác nhận lại (cảnh báo rõ ràng, tự động làm mới báo giá không mã, bảo toàn ghi chú khách đã nhập).
- `QA-E2E-05`: Kiểm thử tranh chấp đồng thời (`Promise.all`): (a) 2 khách cùng áp mã chỉ còn đúng `1` lượt → đúng `1` đơn `201`, `1` đơn `409 Hết lượt`, `used_count === 1`; (b) 2 khách cùng đặt trùng 1 xe & khoảng ngày kèm mã khuyến mãi → đơn thua cuộc bị `409` và tự động rollback không làm tăng `used_count`.
- `QA-E2E-06`: Toàn bộ vòng đời sau đặt xe: sửa đơn `PENDING` giữ nguyên mã (`used_count` không tăng thêm), đổi mã `A → B` trên UI (`A: 0, B: 1`), bấm **Bỏ mã khuyến mãi** trên UI (`B: 0`), khách hủy đơn hoàn lượt về `0`, Admin từ chối đơn hoàn lượt về `0`, và luồng Admin duyệt đơn (`CONFIRMED`) → hiển thị Popup thông báo giờ hành chính → khóa sửa đơn (`409`) → ghi nhận đặt cọc → bàn giao (`ONGOING`) → hoàn tất (`COMPLETED`, giữ nguyên `used_count = 1`).

---

## 5. Kết quả Kiểm thử Trước & Sau khi sửa

| Hạng mục / Lệnh kiểm thử                    |                                        Trước khi sửa                                        |         Sau khi sửa         | Chi tiết kết quả thực tế                                                            |
| :------------------------------------------ | :-----------------------------------------------------------------------------------------: | :-------------------------: | :---------------------------------------------------------------------------------- |
| `pnpm typecheck` (`tsc --noEmit`)           |                                            PASS                                             |          **PASS**           | `0` lỗi kiểu TypeScript trên toàn bộ dự án                                          |
| `pnpm lint` (`scripts/static-lint.mjs`)     |                                     PASS (`149` files)                                      |   **PASS (`151` files)**    | `0` vi phạm bảo mật, AST, secret hay thiếu `assertOrigin`                           |
| `pnpm format:check` (`oxfmt`)               |                                            PASS                                             |          **PASS**           | Định dạng chuẩn đồng nhất trên `213` files                                          |
| `pnpm test` (Unit Tests)                    |                    `225` tests (FAIL khi thêm 11 test tái hiện lỗi mới)                     |   **PASS (`236 / 236`)**    | `236` PASS, `0` FAIL, thời gian chạy `~255ms`                                       |
| `pnpm test:admin` (Isolated Admin DB)       |                                            PASS                                             |          **PASS**           | `admin@nori.vn` idempotent, `PBKDF2-SHA256`, `integrity_check = ok`, `fkCheck = []` |
| `pnpm test:e2e` — Chromium (`68` tests)     | FAIL (tái hiện lỗi Checkout Promo, `bookingKey` query `400`, WCAG card link & brand filter) |    **PASS (`68 / 68`)**     | Đạt tuyệt đối trên toàn bộ `5` file spec Chromium (`5.2 phút`)                      |
| `pnpm test:e2e` — Mobile WebKit (`5` tests) |                                            PASS                                             |     **PASS (`5 / 5`)**      | Đạt tuyệt đối các hành trình iPhone 14 Safari WebKit (`16.0s`)                      |
| `pnpm build` (`payload build`)              |                                    PASS (`74/74` routes)                                    | **PASS (`74 / 74` routes)** | Next.js `16.4.6` Turbopack biên dịch thành công, `0` cảnh báo lỗi                   |

### Tổng hợp số lượng Test Case toàn hệ thống sau nâng cấp

- **Tổng số Test thực thi**: **310** (`236` Unit Tests + `1` Isolated Admin DB Suite + `68` Chromium E2E Tests + `5` Mobile WebKit E2E Tests)
- **PASS**: **310**
- **FAIL**: **0**
- **SKIP**: **0**
- **BLOCKED**: **0**

---

## 6. Kiểm tra đồng bộ Admin ↔ Frontend ↔ Backend ↔ Database & Production Build

1. **Đồng bộ thời gian thực Admin ↔ Khách hàng ↔ Database**:
   - Tạo, sửa, bật/tắt hoặc xóa chương trình khuyến mãi tại `/dashboard/promotions` phản ánh tức thời sang `/nori-api/availability`, trang `/checkout` và hộp thoại chỉnh sửa đơn tại `/my-bookings` mà không cần build lại.
   - Giá trị báo giá tại Checkout khớp tuyệt đối đến từng đồng VNĐ với bản ghi lưu trong bảng `bookings`, trang `/my-bookings` của khách hàng và bảng chi tiết đơn tại `/dashboard/bookings` của Admin.
2. **Bảo toàn dữ liệu thật `./nori.db`**:
   - Đã kiểm tra sau toàn bộ quá trình kiểm thử: `PRAGMA integrity_check = 'ok'`, `PRAGMA foreign_key_check = []`, toàn bộ `9` đơn thuê hiện có và mã khuyến mãi `NORIXINCAMON` trong `./nori.db` được giữ nguyên vẹn 100%, không bị ghi đè hay xóa bởi kiểm thử.
3. **Production Build**:
   - `pnpm build` (`payload build`) hoàn tất sạch sẽ, tạo đầy đủ `74/74` trang tĩnh/SSG (bao gồm `/`, `/vehicles`, `21` trang `/vehicles/[slug]`, `/checkout`, `/my-bookings`, `13` trang `/dashboard/*`) và toàn bộ route API động `/nori-api/*`.

---

## 7. Các vấn đề / Lưu ý vận hành còn tồn đọng

- **Không còn lỗi kỹ thuật hoặc lỗi chặn nghiệp vụ (0 P0/P1/P2/P3 tồn đọng trong mã nguồn)**.
- **Lưu ý dữ liệu nghiệp vụ hiện có trong `./nori.db` (giữ nguyên theo nguyên tắc không tự ý sửa dữ liệu thật)**:
  - Bản ghi khuyến mãi `NORIXINCAMON` do người dùng tạo trước đó đang có cấu hình `valid_from = '2026-11-19'` (sẽ bắt đầu hiệu lực từ ngày `19/11/2026`), `min_days = 10` ngày, `usage_limit = 1`, và `max_discount = 30` (`30 ₫`). Trên giao diện Admin `/dashboard/promotions` mới nâng cấp, hệ thống nay đã hiển thị rõ nhãn **`Chưa bắt đầu`** cùng mức trần **`(tối đa 30 ₫)`** để quản trị viên dễ dàng nhận biết và chủ động cập nhật thành `30.000 ₫` (`30000`) khi có nhu cầu.
