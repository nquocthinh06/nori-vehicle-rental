# NORI Progressive Web App (PWA)

Phiên bản: 1.0 · Next.js 16 App Router

## 1. Kiến trúc PWA

NORI triển khai PWA trực tiếp trên nền Next.js App Router hiện tại, giữ nguyên nhận diện thương hiệu (`nori.`, màu chủ đạo `#087568`, nền `#ffffff`, font `Be Vietnam Pro`).

### Các thành phần chính

- **Web App Manifest** (`src/app/manifest.ts` → `/manifest.webmanifest`):
  - `name`: `NORI — Thuê xe linh hoạt. Mua xe tự tin.`
  - `short_name`: `NORI`
  - `start_url`: `/` · `scope`: `/`
  - `display`: `standalone` · `orientation`: `portrait-primary`
  - `theme_color`: `#087568` · `background_color`: `#ffffff`
  - **Icons**:
    - `/icons/icon-192.png` (`192×192`, `image/png`)
    - `/icons/icon-512.png` (`512×512`, `image/png`)
    - `/icons/icon-maskable-512.png` (`512×512`, `purpose: maskable`)
    - `/icons/apple-touch-icon.png` (`180×180`, Apple Touch Icon)
    - `/nori-mark.svg` (`any`, `image/svg+xml`)
- **Service Worker** (`public/sw.js`):
  - Precache tối thiểu tài nguyên công khai an toàn: `/offline`, `/nori-mark.svg`, `/icons/icon-192.png`, `/icons/icon-512.png`.
  - Cache-first / stale-while-revalidate chỉ áp dụng cho tài nguyên tĩnh công khai (`/_next/static/*`, `/icons/*`, `/nori-mark.svg`, `/favicon.svg`).
  - Navigation requests dùng chiến lược **Network-First**; khi mất mạng, chuyển sang `/offline` (`src/app/(frontend)/offline/page.tsx`).
- **PWA Manager** (`src/components/pwa-manager.tsx`):
  - Đăng ký `/sw.js`.
  - Theo dõi `online` / `offline` để hiển thị banner cảnh báo mất kết nối và tự khôi phục khi có mạng lại.
  - Hỗ trợ `beforeinstallprompt` trên Chrome/Edge/Android (chỉ hiện nút cài đặt khi trình duyệt hỗ trợ) và hướng dẫn cài đặt thủ công trên iOS Safari ("Chia sẻ → Thêm vào MH chính").
  - Phát hiện phiên bản Service Worker mới và cho phép người dùng bấm **Cập nhật** (`SKIP_WAITING`).

## 2. Chính sách bảo mật & Offline

Service Worker tuân thủ nghiêm ngặt nguyên tắc **Chỉ cache tài nguyên tĩnh công khai (Public Allowlist)** và **TUYỆT ĐỐI KHÔNG CACHE**:

- Các API endpoints (`/nori-api/*`, `/api/*`).
- Khu vực quản trị (`/dashboard*`, `/admin*`).
- Dữ liệu cá nhân, xác thực và giao dịch (`/account*`, `/my-bookings*`, `/checkout*`, `/login*`, `/register*`, `/reset-password*`).
- Mọi request không phải `GET` hoặc có header `Authorization`.
- Mọi response chứa header `Set-Cookie` hoặc chỉ thị cache `no-store` / `private`.

### Cơ chế dọn dẹp Cache và Cách ly dữ liệu khách hàng

1. **Xóa Cache khi Đăng xuất**: Khi người dùng nhấn Đăng xuất, ứng dụng gửi message `CLEAR_CACHES` tới Service Worker để xóa toàn bộ runtime caches (`nori-pwa-runtime`), ngăn ngừa lưu lại bất kỳ dữ liệu tạm thời nào.
2. **Cách ly Checkout Draft**: Bản nháp giỏ hàng (`sessionStorage`) được gắn định danh người dùng: `nori_checkout_draft:${userId}:${modelId}:${startDate}:${endDate}`. Khi đăng xuất hoặc chuyển tài khoản, toàn bộ draft session của người dùng được dọn dẹp sạch sẽ (`removeItem`), đảm bảo không có nguy cơ lộ thông tin chéo tài khoản.

Giá thuê, giá bán, lịch khả dụng và tạo đơn thuê/mua luôn được xác thực trực tuyến với Backend (`Payload` + `nori.db`). Khi ngoại tuyến, khách hàng không thể xác nhận đặt xe hoặc xem dữ liệu giá/lịch đã cache như dữ liệu còn hiệu lực.

## 3. Hướng dẫn cài đặt cho người dùng

- **Android (Chrome / Edge)**: Khi trình duyệt hỗ trợ, nhấn **Cài đặt** trên thanh gợi ý của NORI hoặc mở menu trình duyệt → **Cài đặt ứng dụng / Thêm vào màn hình chính**.
- **iOS (Safari)**: Nhấn biểu tượng **Chia sẻ (Share)** trên thanh công cụ Safari → chọn **Thêm vào MH chính (Add to Home Screen)** → **Thêm**.
- **Desktop (Chrome / Edge)**: Nhấn biểu tượng cài đặt trên thanh địa chỉ trình duyệt.

## 4. Hướng dẫn kiểm thử PWA thực tế trên iPhone và Android thật qua HTTPS

Để kiểm thử tính năng PWA trên thiết bị di động vật lý (iOS Safari và Android Chrome), bắt buộc phải có môi trường an toàn HTTPS hợp lệ.

### Bước 1: Tạo HTTPS Tunnel tới máy chủ cục bộ

Do máy chủ dev/production chạy ở cổng 3000 trên máy tính phát triển, sử dụng một trong các công cụ tunnel sau để cấp phát chứng chỉ HTTPS hợp lệ:

```bash
# Cách 1: Sử dụng Cloudflare Tunnel (Miễn phí, không cần tài khoản)
npx cloudflared tunnel --url http://localhost:3000

# Cách 2: Sử dụng Ngrok
ngrok http 3000
```

Sao chép URL HTTPS công khai được cấp (ví dụ: `https://nori-preview.trycloudflare.com`).

### Bước 2: Kiểm thử trên iPhone thật (iOS 16.4+ / Safari)

1. Mở trình duyệt Safari trên iPhone và truy cập URL HTTPS.
2. Kiểm tra giao diện Mobile-First: Bottom Navigation hiển thị cố định ở đáy, không bị Home Indicator che khuất (`env(safe-area-inset-bottom)`).
3. Nhấn nút **Chia sẻ (Share)** trên thanh công cụ Safari → chọn **Thêm vào MH chính (Add to Home Screen)** → xác nhận tên "NORI" và icon hiển thị sắc nét.
4. Thoát Safari và mở ứng dụng từ màn hình chính:
   - Ứng dụng khởi động ở chế độ `standalone` (toàn màn hình, không có thanh URL của Safari).
   - Kiểm tra cuộn trang, Bottom Sheet bộ lọc, thanh Sticky Booking CTA trên trang chi tiết xe (`/vehicles/toyota-fortuner`).
5. **Kiểm thử Offline**: Bật chế độ Máy bay (Airplane mode) trên iPhone → điều hướng tới một trang mới → xác nhận hiển thị trang `/offline` với thông báo thân thiện và nút "Thử lại".
6. Tắt chế độ Máy bay → bấm "Thử lại" → xác nhận kết nối phục hồi bình thường.

### Bước 3: Kiểm thử trên Android thật (Android 11+ / Chrome)

1. Mở Chrome trên Android và truy cập URL HTTPS.
2. Chờ 3-5 giây để sự kiện `beforeinstallprompt` kích hoạt → thanh banner cài đặt PWA của NORI xuất hiện ở chân trang.
3. Bấm **Cài đặt** → xác nhận hộp thoại hệ thống của Chrome để cài đặt Web APK lên máy.
4. Mở ứng dụng NORI từ App Drawer:
   - Kiểm tra theme color thanh trạng thái `#087568`.
   - Thử nghiệm đăng nhập, đặt xe và thanh toán giả lập.
   - Đăng xuất → kiểm tra Application Storage trong Chrome DevTools remote debug (thấy cache runtime được xóa).
5. Bật chế độ Máy bay → kiểm tra trang `/offline`.

## 5. Giới hạn của PWA hiện tại

- Push Notification chưa bật ở giai đoạn này (chỉ triển khai sau khi các nghiệp vụ cốt lõi và adapter thông báo hoàn thiện).
- Trên iOS Safari, trình duyệt không hỗ trợ sự kiện `beforeinstallprompt`, do đó người dùng thao tác qua menu Chia sẻ của Safari.
- Cài đặt PWA yêu cầu ngữ cảnh an toàn (`HTTPS` trên production hoặc `localhost` khi phát triển).
