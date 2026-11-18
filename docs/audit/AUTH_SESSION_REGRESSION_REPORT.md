# BÁO CÁO RÀ SOÁT, KHẮC PHỤC GỐC NGHIỆP VỤ & KIỂM THỬ HỒI QUY: ĐĂNG NHẬP, SESSION, CHECKOUT VÀ ĐẶT THUÊ XE — NORI

- **Ngày thực hiện:** 18/11/2026
- **Dự án:** NORI Vehicle Rental (`https://github.com/nquocthinh06/nori-vehicle-rental`)
- **Phạm vi kiểm toán & khắc phục:** Authentication (`users` vs `admins`), Session Cookie (`app-session` vs `payload-token`), JWT & DB Session Revocation (`_sid`), Authorization Role Separation (`401 UNAUTHORIZED` vs `403 ADMIN_ROLE_FORBIDDEN`), Client Auth State Synchronization (`AuthProvider`, `client-api.ts`), Checkout Draft Account Isolation, PWA Service Worker Cache Safety, và toàn trình Đặt thuê xe (`Register → Login → Checkout → POST /bookings → My Bookings`).

---

## A. Nguyên nhân gốc rễ (Root Cause Analysis)

Qua quá trình đọc mã nguồn và tái hiện lỗi thực tế trên hệ thống trước khi sửa, chúng tôi xác định **4 nguyên nhân gốc rễ** gây ra hiện tượng người dùng hiển thị đã đăng nhập trên giao diện nhưng bị báo _"Vui lòng đăng nhập để đặt xe"_ hoặc _"Vui lòng đăng nhập để xem đơn thuê"_ khi tới bước Checkout hoặc vào trang Đơn thuê của tôi:

### 1. Xung đột phiên đăng nhập giữa Admin (`payload-token`) và Customer (`app-session`) trên cùng trình duyệt hoặc trùng email (`Dual-Email Collision`)

- **File & vị trí xảy ra lỗi:**
  - `src/app/(frontend)/nori-api/auth/[action]/route.ts` (dòng 37–43 và 174–191 trước khi sửa).
  - `src/lib/app-auth.ts` (`loginAdmin()` xóa `app-session`; `currentUser()` chỉ đọc `app-session`).
  - `src/components/checkout-panel.tsx`, `src/components/bookings-panel.tsx`, `src/components/account-panel.tsx`.
- **Cơ chế gây lỗi:**
  1. Khi người dùng đăng nhập bằng email tồn tại đồng thời trong bảng `admins` và `users` (ví dụ `nquocthinh06@gmail.com`) hoặc đăng nhập quản trị trước đó trên cùng trình duyệt, `POST /nori-api/auth/login` ưu tiên gọi `appAuth.loginAdmin()`.
  2. `loginAdmin()` thiết lập cookie `payload-token` và **xóa trắng cookie `app-session`** (`maxAge: 0`).
  3. Endpoint `GET /nori-api/auth/me` kiểm tra `currentAdmin()` trước `currentUser()`, trả về HTTP `200` với `{ id, email, fullName, role: 'ADMIN', isAdmin: true }`.
  4. `AuthProvider` lưu đối tượng này vào `user`. Các component `Header`, `CheckoutPanel`, `BookingsPanel` chỉ kiểm tra `if (user)` nên hiển thị trạng thái **đã đăng nhập** và cho phép điền form đặt xe.
  5. Khi nhấn **"Xác nhận đặt thuê"** (`POST /nori-api/bookings`) hoặc mở **Đơn thuê của tôi** (`GET /nori-api/bookings`), Backend chỉ gọi `appAuth.currentUser()` (kiểm tra duy nhất cookie `app-session` của collection `users`). Vì `app-session` không tồn tại, API trả về `401: "Vui lòng đăng nhập để đặt xe."` / `"Vui lòng đăng nhập để xem đơn thuê."`.

### 2. Mất đồng bộ trạng thái phiên giữa `AuthProvider` (Client) và `app-session` (Server) khi phiên hết hạn hoặc bị thu hồi

- **File & vị trí xảy ra lỗi:**
  - `src/collections/Users.ts` (`tokenExpiration: 7200` — chỉ 2 giờ).
  - `src/components/auth-provider.tsx` (chỉ gọi `/nori-api/auth/me` duy nhất 1 lần lúc mount lần đầu).
  - `src/lib/client-api.ts` (ném `RequestError` khi gặp `401` nhưng không phát tín hiệu đồng bộ lại `AuthProvider`).
- **Cơ chế gây lỗi:**
  - Khi khách hàng mở tab trình duyệt quá thời hạn token hoặc cookie `app-session` hết hạn/bị xóa, state `user` trong React memory của `AuthProvider` vẫn giữ nguyên thông tin cũ (`user !== null`).
  - Khi khách hàng chuyển trang bằng App Router (`Link` / `router.push`) sang `/checkout` hoặc `/my-bookings`, `AuthProvider` không re-fetch `/auth/me`. Giao diện Checkout vẫn hiển thị tên khách hàng và nút _"Xác nhận đặt thuê"_, nhưng khi gửi `POST /nori-api/bookings` thì nhận lỗi `401`.

### 3. Cấu hình thuộc tính Cookie `secure` tĩnh theo biến môi trường thay vì theo giao thức thực tế của Request

- **File & vị trí xảy ra lỗi:**
  - `src/lib/app-auth.ts` (hàm `cookieOptions()` tĩnh dựa vào `process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://')`).
- **Cơ chế gây lỗi:**
  - Nếu biến môi trường `NEXT_PUBLIC_SITE_URL` được cấu hình `https://...` nhưng hệ thống được truy cập qua HTTP nội bộ (`http://localhost`, `http://127.0.0.1`, hoặc IP LAN `http://192.168.x.x`), cookie `app-session` bị gắn cờ `Secure`.
  - Trình duyệt (đặc biệt là Safari/WebKit và Chromium) từ chối lưu hoặc từ chối gửi lại cookie `Secure` trên kết nối HTTP thuần, khiến mọi request tiếp theo tới `/nori-api/bookings` mất cookie.

### 4. `AuthForm` chuyển hướng ngay sau `POST /auth/login` mà không xác minh phiên thực tế từ `/auth/me`

- **File & vị trí xảy ra lỗi:**
  - `src/components/auth-form.tsx` (hàm `submit()`).
- **Cơ chế gây lỗi:**
  - Trước khi sửa, `refresh()` trong `AuthProvider` trả về `Promise<void>` và nuốt lỗi. `AuthForm` gọi `await refresh()` rồi lập tức `router.push(destination)` mà không kiểm tra xem trình duyệt đã thực sự lưu cookie và `/nori-api/auth/me` có trả về đúng `user.id` vừa đăng nhập hay không.

### Sơ đồ luồng Authentication trước khi sửa (chỉ rõ điểm đứt gãy)

```text
Register / Login (POST /nori-api/auth/login)
  │  [Đứt gãy #1]: Nếu email trùng trong bảng admins -> gọi loginAdmin() -> set payload-token, XÓA app-session!
  │  [Đứt gãy #3]: Nếu cookieOptions() gắn Secure=true trên HTTP -> trình duyệt drop cookie Set-Cookie!
  ▼
GET /nori-api/auth/me
  │  [Đứt gãy #1]: Kiểm tra currentAdmin() trước -> trả về { role: 'ADMIN', isAdmin: true }
  ▼
AuthProvider (React Context)
  │  [Đứt gãy #2]: Chỉ fetch 1 lần khi mount; giữ stale user trong RAM ngay cả khi cookie hết hạn
  │  [Đứt gãy #4]: AuthForm không kiểm tra kết quả refresh() đã khớp user.id hay chưa
  ▼
Vehicle Detail -> Checkout (/checkout)
  │  UI chỉ kiểm tra `if (user)` -> hiển thị form đặt xe như Customer hợp lệ
  ▼
POST /nori-api/bookings  /  GET /nori-api/bookings (/my-bookings)
  │  Backend gọi appAuth.currentUser() -> tìm cookie `app-session`
  ✕  KHÔNG CÓ `app-session` -> Trả về HTTP 401: "Vui lòng đăng nhập để đặt xe / xem đơn thuê"!
```

---

## B. Giải pháp kỹ thuật đã triển khai

1. **Module quản lý Cookie & Session chuẩn hóa (`src/lib/session-cookie.ts`)**:
   - Tách biệt rõ hằng số `CUSTOMER_COOKIE_NAME = 'app-session'` (TTL `604800` giây = **7 ngày**) và `ADMIN_COOKIE_NAME = 'payload-token'` (TTL `86400` giây = **24 giờ**).
   - Đồng bộ `tokenExpiration` trong `src/collections/Users.ts` (`604_800`) và `src/collections/Admins.ts` (`86_400`).
   - Hàm `resolveRequestCookieConfig()` tự động nhận diện giao thức thực tế từ `request.url`, `x-forwarded-proto`, `origin`, `referer`:
     - Trên `http://localhost`, `127.0.0.1`, IP LAN HTTP: luôn đặt `secure: false, sameSite: 'lax', path: '/', httpOnly: true`.
     - Trên HTTPS trực tiếp hoặc sau Reverse Proxy (`X-Forwarded-Proto: https`): đặt `secure: true, sameSite: 'lax', path: '/', httpOnly: true`.

2. **Xác thực phiên chặt chẽ & Thu hồi phiên phía Server (`src/lib/app-auth.ts`)**:
   - Bọc `JWTAuthentication` trong `try/catch` với header `DisableAutologin: 'true'` để không phát sinh ngoại lệ không kiểm soát.
   - Thêm `hasActiveSessionRecord()` kiểm tra `_sid` trong JWT đối chiếu với danh sách `user.sessions[]` và `expiresAt` trong SQLite DB — đảm bảo khi phiên bị xóa hoặc hết hạn trong DB thì JWT cũ bị từ chối ngay lập tức.
   - Khi `logout()`, hàm `revokeServerSession()` xóa `_sid` hiện tại khỏi bảng `users_sessions` / `admins_sessions` trong DB đồng thời xóa cả 2 cookie (`maxAge: 0, expires: new Date(0)`).
   - Bổ sung helper `appAuth.requireCustomer()`:
     - Nếu có phiên Customer hợp lệ (`app-session`): trả về `{ ok: true, user }`.
     - Nếu không có phiên Customer nhưng đang có phiên Admin (`payload-token`): trả về HTTP **`403 Forbidden`** với mã lỗi `ADMIN_ROLE_FORBIDDEN` và thông báo rõ: _"Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để thực hiện đặt thuê."_
     - Nếu hoàn toàn chưa đăng nhập: trả về HTTP **`401 Unauthorized`** với mã lỗi `UNAUTHORIZED`.

3. **Đồng bộ bất biến `/nori-api/auth/me` & Xử lý tài khoản trùng email (`src/app/(frontend)/nori-api/auth/[action]/route.ts`)**:
   - `GET /nori-api/auth/me` kiểm tra `appAuth.currentUser()` trước `appAuth.currentAdmin()`, đảm bảo tính bất biến: nếu `/auth/me` trả về `role: 'CUSTOMER'` thì `appAuth.currentUser()` tại `/bookings` chắc chắn hợp lệ.
   - `POST /nori-api/auth/login` hỗ trợ tham số `accountType: 'CUSTOMER'` (tự động gửi khi người dùng đăng nhập từ luồng `/checkout`, `/my-bookings` hoặc chuyển vai trò), cho phép đăng nhập đúng vào collection `users` ngay cả khi email đó cũng có trong bảng `admins`.
   - Áp dụng `appAuth.requireCustomer()` đồng nhất trên toàn bộ API khách hàng:
     - `src/app/(frontend)/nori-api/bookings/route.ts` (`GET`, `POST`, `PUT`, `PATCH`)
     - `src/app/(frontend)/nori-api/notifications/route.ts` (`GET`, `PATCH`)
     - `src/app/(frontend)/nori-api/inquiries/route.ts` (`GET`, `POST`)
     - `src/app/(frontend)/nori-api/reviews/route.ts` (`POST`)
     - `src/app/(frontend)/nori-api/auth/[action]/route.ts` (`PATCH /auth/me`)

4. **Đồng bộ trạng thái Auth phía Client & Bảo toàn dữ liệu nháp Checkout (`src/lib/client-api.ts`, `src/components/auth-provider.tsx`, `src/components/auth-form.tsx`, `src/components/checkout-panel.tsx`)**:
   - `client-api.ts`: Lưu mã lỗi `code` vào `RequestError` và phát sự kiện `nori:auth-invalidated` mỗi khi nhận HTTP `401` từ các API nghiệp vụ.
   - `AuthProvider`:
     - `refresh()` trả về `Promise<AppUser | null>` có bộ đếm sequence chống race condition.
     - Tự động lắng nghe `nori:auth-invalidated`, `visibilitychange`, `focus`, và `pageshow` (BFCache) để làm mới phiên.
     - Cung cấp cờ `isCustomer` và `isAdmin` rõ ràng cho toàn bộ UI.
     - Khi `logout()`, gọi `clearAllCheckoutDrafts()` để xóa sạch mọi bản nháp checkout trong `sessionStorage`.
   - `AuthForm`:
     - Sau khi gọi `POST /auth/login` hoặc `POST /auth/register`, bắt buộc chờ `const verifiedUser = await refresh()` và kiểm tra `verifiedUser.id === signedIn.id`. Nếu cookie bị trình duyệt chặn, hiển thị cảnh báo rõ ràng tại chỗ thay vì redirect.
     - Khi Admin đã đăng nhập truy cập `/login?returnTo=/checkout...`, hiển thị thông báo vai trò quản trị và nút **"Đăng xuất quản trị để đăng nhập Khách hàng"**.
   - `CheckoutPanel`, `BookingsPanel`, `AccountPanel`, `VehicleDetail`:
     - Tự động gọi `void refresh()` khi vào trang để xác thực phiên sống với Backend.
     - Phân tách rõ giao diện cho 3 trạng thái: `isCustomer` (hiển thị đầy đủ chức năng), `isAdmin` (hiển thị thông báo đang dùng tài khoản quản trị + nút chuyển sang tài khoản khách hàng, tuyệt đối không báo _"Vui lòng đăng nhập"_), và `unauthenticated` (nút đăng nhập kèm `returnTo`).
     - Phân vùng khóa nháp Checkout theo từng tài khoản (`nori_checkout_draft:user:<userId>:<vehicleId>:<startDate>:<endDate>`). Nếu phiên hết hạn đúng lúc nhấn _"Xác nhận đặt thuê"_, hệ thống lưu nháp, chuyển hướng sang `/login?expired=1&returnTo=...`, và tự động khôi phục đầy đủ thông tin (địa điểm nhận, số GPLX, ghi chú, mã khuyến mãi) ngay sau khi đăng nhập lại.

5. **Header Cache-Control & PWA Service Worker (`src/lib/api-utils.ts`, `public/sw.js`)**:
   - Mọi phản hồi JSON từ `/nori-api/*` đều đính kèm `Cache-Control: private, no-store, no-cache, must-revalidate`, `Pragma: no-cache`, và `Vary: Cookie`.
   - Service Worker (`public/sw.js`) loại trừ hoàn toàn `/nori-api/*`, `/api/*`, `/login`, `/register`, `/account`, `/my-bookings`, `/checkout`, `/dashboard`, `/admin` khỏi bộ nhớ đệm.

---

## C. Danh sách các file đã tạo mới và cập nhật

| STT | File                                                 | Loại thay đổi | Mô tả chi tiết                                                                                                                                                       |
| :-- | :--------------------------------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/session-cookie.ts`                          | Tạo mới       | Định nghĩa hằng số cookie (`app-session`, `payload-token`), TTL (7 ngày / 24 giờ) và hàm `resolveRequestCookieConfig()` theo giao thức thực tế.                      |
| 2   | `src/lib/app-auth.ts`                                | Cập nhật      | Xác thực `_sid` trong DB (`hasActiveSessionRecord`), thu hồi session khi logout (`revokeServerSession`), thêm `requireCustomer()` phân tách `401` vs `403`.          |
| 3   | `src/lib/api-utils.ts`                               | Cập nhật      | Bổ sung `Cache-Control: private, no-store, no-cache, must-revalidate`, `Vary: Cookie`, và nâng cấp `assertOrigin()` hỗ trợ `x-forwarded-host` / `x-forwarded-proto`. |
| 4   | `src/lib/admin-api.ts`                               | Cập nhật      | Hỗ trợ fallback xác thực JWT `payload-token` an toàn cho các route quản trị khi gọi nội bộ.                                                                          |
| 5   | `src/lib/client-api.ts`                              | Cập nhật      | Bổ sung thuộc tính `code` cho `RequestError` và phát sự kiện `nori:auth-invalidated` khi gặp `401`.                                                                  |
| 6   | `src/collections/Users.ts`                           | Cập nhật      | Tăng `tokenExpiration` của khách hàng lên `604_800` (7 ngày).                                                                                                        |
| 7   | `src/collections/Admins.ts`                          | Cập nhật      | Chuẩn hóa `tokenExpiration` của quản trị viên thành `86_400` (24 giờ).                                                                                               |
| 8   | `src/app/(frontend)/nori-api/auth/[action]/route.ts` | Cập nhật      | Ưu tiên `currentUser()` trong `GET /auth/me`, xử lý `accountType: 'CUSTOMER'` khi trùng email Admin/Customer, bảo vệ `PATCH /auth/me` bằng `requireCustomer()`.      |
| 9   | `src/app/(frontend)/nori-api/bookings/route.ts`      | Cập nhật      | Sử dụng `appAuth.requireCustomer()` cho toàn bộ `GET`, `POST`, `PUT`, `PATCH`.                                                                                       |
| 10  | `src/app/(frontend)/nori-api/notifications/route.ts` | Cập nhật      | Sử dụng `appAuth.requireCustomer()` cho `GET`, `PATCH`.                                                                                                              |
| 11  | `src/app/(frontend)/nori-api/inquiries/route.ts`     | Cập nhật      | Sử dụng `appAuth.requireCustomer()` cho `GET`, `POST`.                                                                                                               |
| 12  | `src/app/(frontend)/nori-api/reviews/route.ts`       | Cập nhật      | Sử dụng `appAuth.requireCustomer()` cho `POST`.                                                                                                                      |
| 13  | `src/components/auth-provider.tsx`                   | Cập nhật      | Đồng bộ tự động qua `nori:auth-invalidated`, `focus`, `visibilitychange`; cung cấp `isCustomer`, `isAdmin`; xóa nháp checkout khi logout.                            |
| 14  | `src/components/auth-form.tsx`                       | Cập nhật      | Xác minh `await refresh()` khớp `user.id` trước khi redirect; hỗ trợ chuyển đổi vai trò Admin sang Customer; hiển thị thông báo phiên hết hạn (`expired=1`).         |
| 15  | `src/components/checkout-panel.tsx`                  | Cập nhật      | Lưu nháp theo từng `user.id`, tự động chuyển hướng kèm bảo toàn nháp khi gặp `401`, hiển thị thông báo rõ ràng khi đăng nhập bằng tài khoản Admin.                   |
| 16  | `src/components/bookings-panel.tsx`                  | Cập nhật      | Phân biệt rõ trạng thái Admin (`isAdmin`) vs Khách hàng (`isCustomer`) vs Chưa đăng nhập; tự động đồng bộ lại khi gặp `401`.                                         |
| 17  | `src/components/account-panel.tsx`                   | Cập nhật      | Hiển thị thẻ thông tin Quản trị viên chuyên biệt khi `isAdmin = true`, không gọi nhầm API của Customer.                                                              |
| 18  | `src/components/vehicle-detail.tsx`                  | Cập nhật      | Phân tách thông báo và nút chuyển đổi tài khoản cho Admin trong hộp thoại đăng ký tư vấn/lái thử.                                                                    |
| 19  | `tests/rental-rules.test.mjs`                        | Cập nhật      | Bổ sung 4 bộ unit test kiểm tra `session-cookie` (HTTP localhost/LAN vs HTTPS reverse proxy vs Figma preview).                                                       |
| 20  | `tests/e2e/auth-session-booking-regression.spec.ts`  | Tạo mới       | Bộ kiểm thử E2E & API Integration chuyên sâu gồm 8 test lớn bao phủ toàn bộ 16 kịch bản nghiệp vụ, kiểm tra Cookie jar, Network status và SQLite DB.                 |
| 21  | `tests/e2e/mobile-webkit.spec.ts`                    | Cập nhật      | Bổ sung Mobile Journey 6 kiểm thử luồng Đăng ký → Cookie `app-session` → Checkout → Đặt xe → My Bookings trên Mobile Safari / WebKit.                                |

---

## D. Kết quả thực thi 16 Kịch bản Kiểm thử E2E & Tích hợp (Sections 22–27)

Toàn bộ kịch bản được thực thi tự động bằng Playwright trên cơ sở dữ liệu cách ly (`nori-auth-qa.db`), giữ nguyên vẹn 100% cơ sở dữ liệu chính (`./nori.db`):

| Kịch bản        | Nội dung kiểm thử                                                                                                          | Kết quả  | Bằng chứng xác thực (Cookie / HTTP / DB)                                                                                                                                                                      |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------- | :------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scenario 1**  | Đăng ký mới → `/account` → Chọn xe → `/checkout` → Đặt xe → `/my-bookings`                                                 | **PASS** | `POST /auth/register` (`201`), `GET /auth/me` (`200`, `CUSTOMER`), Cookie `app-session` (`HttpOnly`, `Path=/`, `SameSite=Lax`), `POST /bookings` (`201`), bản ghi SQLite `bookings.customer_id === users.id`. |
| **Scenario 2**  | Khách hàng đã có tài khoản đăng nhập → Chọn xe → `/checkout` → Đặt xe → `/my-bookings`                                     | **PASS** | `POST /auth/login` (`200`), `POST /bookings` (`201`), hiển thị ngay trong `/my-bookings` mà không báo lỗi đăng nhập.                                                                                          |
| **Scenario 3**  | Đăng nhập → Truy cập trực tiếp `/my-bookings` từ thanh điều hướng                                                          | **PASS** | `GET /nori-api/bookings` trả `200`, hiển thị danh sách đơn thuê của khách hàng.                                                                                                                               |
| **Scenario 4**  | Đăng nhập → Reload (`F5`) nhiều lần trên trang chủ, danh mục, chi tiết xe, tài khoản                                       | **PASS** | Cookie `app-session` được trình duyệt giữ nguyên qua mọi lần reload; `GET /auth/me` luôn trả `200`.                                                                                                           |
| **Scenario 5**  | Đăng nhập → Vào `/checkout` → Reload (`F5`) tại trang Checkout → Nhấn xác nhận đặt thuê                                    | **PASS** | Dữ liệu nháp trên Checkout và phiên đăng nhập được giữ nguyên sau reload; `POST /bookings` trả `201`.                                                                                                         |
| **Scenario 6**  | Phiên hết hạn hoặc bị thu hồi trong DB khi tab đang mở (`Stale Session Auto-Sync`)                                         | **PASS** | Khi `_sid` bị xóa hoặc cookie mất hiệu lực, sự kiện `nori:auth-invalidated` cập nhật ngay `AuthProvider` về `user = null`, không để UI hiển thị trạng thái đăng nhập giả.                                     |
| **Scenario 7**  | Trình duyệt chặn lưu Cookie khi đăng nhập (`Blocked Cookie Guard`)                                                         | **PASS** | `AuthForm` phát hiện `await refresh()` trả về `null`, giữ người dùng ở lại `/login` và hiển thị thông báo lỗi cookie rõ ràng.                                                                                 |
| **Scenario 8**  | Đang đăng nhập Admin (`payload-token`) → Truy cập `/checkout`                                                              | **PASS** | Hiển thị thông báo đang dùng tài khoản quản trị kèm nút _"Đăng nhập bằng tài khoản khách hàng"_; API trả `403 ADMIN_ROLE_FORBIDDEN` (không trả `401`).                                                        |
| **Scenario 9**  | Đang đăng nhập Admin (`payload-token`) → Truy cập `/my-bookings` & `/account`                                              | **PASS** | Hiển thị hướng dẫn chuyển về `/dashboard/bookings` hoặc đổi sang tài khoản khách hàng; tuyệt đối không hiển thị _"Vui lòng đăng nhập để xem đơn thuê"_.                                                       |
| **Scenario 10** | Đăng xuất Customer → Truy cập lại `/my-bookings` và `/checkout`                                                            | **PASS** | `POST /auth/logout` xóa cookie `app-session` (`Max-Age=0`) và xóa `_sid` trong bảng `users_sessions`. Mọi попыт replay lại JWT cũ đều bị từ chối `401`.                                                       |
| **Scenario 11** | Chuyển đổi vai trò: Admin → Logout / Switch → Login Customer → Đặt thuê xe (kể cả tài khoản trùng email)                   | **PASS** | Cookie `payload-token` được xóa, `app-session` được thiết lập mới; đặt xe thành công (`201`).                                                                                                                 |
| **Scenario 12** | Cô lập quyền sở hữu đơn thuê giữa Customer A và Customer B (`IDOR Protection`)                                             | **PASS** | Customer B không nhìn thấy đơn của Customer A; gọi trực tiếp `GET/PUT/PATCH /nori-api/bookings?id=<bookingA>` trả về `404`.                                                                                   |
| **Scenario 13** | Hết hạn phiên ngay trước khi bấm xác nhận tại `/checkout` → Đăng nhập lại → Khôi phục nháp & Cô lập nháp khi đổi tài khoản | **PASS** | Chuyển hướng tới `/login?expired=1&returnTo=...`, sau khi đăng nhập lại tự động điền lại địa điểm, GPLX, ghi chú; khi Logout sang Customer B thì nháp của Customer A bị xóa sạch.                             |
| **Scenario 14** | Kiểm thử trên Mobile Viewport (`375×812` & `390×844`) + Mobile Safari (`WebKit`) + Kiểm tra bộ nhớ đệm PWA Service Worker  | **PASS** | Đặt xe thành công trên cả Chromium Mobile và WebKit (`iPhone 14`); `window.caches` không chứa bất kỳ route nhạy cảm nào.                                                                                      |
| **Scenario 15** | Đóng trình duyệt và mở lại phiên từ `storageState` (Persistent Cookie 7 ngày)                                              | **PASS** | Cookie `app-session` có `expires` > 6.9 ngày nên không bị xóa như session-cookie tạm thời; mở lại `/my-bookings` vào thẳng danh sách đơn.                                                                     |
| **Scenario 16** | Kiểm thử Cookie dưới HTTPS Reverse Proxy (`X-Forwarded-Proto: https`) vs HTTP LAN IP (`192.168.1.88`)                      | **PASS** | Dưới HTTPS proxy sinh `Secure; HttpOnly; SameSite=lax`; dưới HTTP LAN IP không gắn `Secure` để trình duyệt không chặn cookie.                                                                                 |

---

## E. Kết quả chạy toàn bộ Lệnh Kiểm Tra (Verification Suite)

| Lệnh kiểm tra                                                               | Kết quả  | Chi tiết                                                                                        |
| :-------------------------------------------------------------------------- | :------: | :---------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                         | **PASS** | 100% file tuân thủ định dạng Prettier.                                                          |
| `pnpm lint`                                                                 | **PASS** | `Static lint passed across 153 files (0 issues).`                                               |
| `pnpm typecheck`                                                            | **PASS** | `tsc --noEmit` hoàn tất với **0 lỗi**.                                                          |
| `pnpm test`                                                                 | **PASS** | **240 / 240** unit tests PASS (`tests/rental-rules.test.mjs`).                                  |
| `pnpm test:admin`                                                           | **PASS** | `ISOLATED_ADMIN_TEST_PASS` (`pbkdf2-sha256-v1`, `integrity_check: ok`).                         |
| `pnpm test:e2e` (`auth-session-booking-regression.spec.ts`)                 | **PASS** | **8 / 8** suites PASS (bao phủ toàn bộ 16 kịch bản + API Integration + Full Booking Lifecycle). |
| `pnpm test:e2e` (`data-sync.spec.ts` & `promo-checkout-regression.spec.ts`) | **PASS** | **14 / 14** tests PASS (đồng bộ giá, chống double-booking, khuyến mãi, RBAC, Service Worker).   |
| `pnpm test:e2e` (`mobile-webkit.spec.ts`)                                   | **PASS** | **6 / 6** Mobile Safari / WebKit journeys PASS (bao gồm WCAG 2.2 AA & Mobile Checkout).         |
| `pnpm build`                                                                | **PASS** | Next.js 16.4.6 production build hoàn tất thành công với 0 lỗi.                                  |

---

## Mục 41. Đối chiếu 27 Tiêu chí Nghiệm thu (Acceptance Criteria Checklist)

- [x] **1.** Đã đọc và phân tích đầy đủ source hiện tại trước khi sửa.
- [x] **2.** Đã xác định và ghi rõ nguyên nhân gốc của lỗi đã đăng nhập nhưng không đặt được xe / không xem được đơn thuê.
- [x] **3.** Đăng ký tài khoản mới hoạt động đúng.
- [x] **4.** Đăng nhập tài khoản khách hàng hoạt động đúng.
- [x] **5.** Cookie session khách hàng (`app-session`) được set và gửi lại đúng trong các request tiếp theo.
- [x] **6.** `/auth/me` trả đúng thông tin khách hàng đang đăng nhập (kiểm tra `currentUser()` trước `currentAdmin()`).
- [x] **7.** `AuthProvider` đồng bộ đúng với session thực trên backend (qua `nori:auth-invalidated`, `focus`, `visibilitychange`, `pageshow`).
- [x] **8.** Không còn trạng thái UI hiển thị đã đăng nhập nhưng API coi là chưa đăng nhập.
- [x] **9.** Khách hàng đã đăng nhập có thể chọn xe và sang `/checkout`.
- [x] **10.** Khách hàng đã đăng nhập có thể bấm xác nhận đặt thuê thành công.
- [x] **11.** `POST /nori-api/bookings` trả `201` và lưu đúng `customer` (`users.id`).
- [x] **12.** Sau khi đặt xe, khách hàng xem được đơn thuê trong `/my-bookings`.
- [x] **13.** `GET /nori-api/bookings` trả `200` và đúng danh sách đơn của khách hàng đó.
- [x] **14.** Reload trang `/checkout` hoặc `/my-bookings` không làm mất session.
- [x] **15.** Khách hàng có thể chỉnh sửa đơn khi `PENDING` và hủy đơn hợp lệ.
- [x] **16.** Khách hàng nhận được thông báo khi Admin duyệt đơn (`BOOKING_CONFIRMED`) và gửi được đánh giá khi `COMPLETED`.
- [x] **17.** Khách hàng A không xem/sửa/hủy được đơn của Khách hàng B (`IDOR Protection`).
- [x] **18.** Admin và Customer không bị xung đột cookie/session (`403 ADMIN_ROLE_FORBIDDEN` tách biệt hoàn toàn với `401 UNAUTHORIZED`).
- [x] **19.** Nếu đang là Admin, hệ thống thông báo rõ vai trò quản trị kèm nút chuyển tài khoản, không báo sai _"Vui lòng đăng nhập"_.
- [x] **20.** Nếu session hết hạn giữa chừng tại Checkout, hệ thống lưu nháp, dẫn tới đăng nhập lại và khôi phục đầy đủ dữ liệu nháp.
- [x] **21.** Service Worker / cache không lưu nhầm `/auth/me`, `/bookings`, `/checkout`, `/my-bookings`, `/account`.
- [x] **22.** Hoạt động đúng trên Desktop (`1440×1000`), Mobile Chromium (`375×812`, `390×844`) và Mobile WebKit (`iPhone 14`).
- [x] **23.** Toàn bộ 16 kịch bản E2E + API Integration đều PASS.
- [x] **24.** `pnpm format:check`, `pnpm lint`, `pnpm typecheck` đều PASS (0 lỗi).
- [x] **25.** `pnpm test` (240 unit tests) và `pnpm test:admin` đều PASS.
- [x] **26.** `pnpm build` thành công.
- [x] **27.** Database chính `./nori.db` không còn dữ liệu rác sau khi kiểm thử và đạt `PRAGMA integrity_check = 'ok'`.
