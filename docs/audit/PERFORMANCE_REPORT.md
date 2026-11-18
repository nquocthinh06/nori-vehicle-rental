# BÁO CÁO ĐO LƯỜNG HIỆU NĂNG, TỐI ƯU & TẢI ĐỒNG THỜI — NORI (`PERFORMANCE_REPORT.md`)

- **Ngày cập nhật**: `2026-11-18` (Đo lại sau đợt tối ưu hiệu năng Production Build — 3 lần đo độc lập cho mỗi kịch bản CWV)
- **Cấu hình thử nghiệm**: Production build (`pnpm build` + `next start -p 3100 -H 0.0.0.0`), Chromium headless `PerformanceObserver` (Desktop `1440×1000`, Mobile `375×812` bật CPU `4x` throttling + Slow 4G `1.6 Mbps / 150ms RTT`), kết nối `./nori-qa-isolated.db` (bản sao đã khôi phục FK sạch).
- **Script đo lường**: [`scripts/measure-perf.mjs`](../../scripts/measure-perf.mjs) (`NORI_PERF_RUNS=3`).

---

## 1. Các tối ưu kỹ thuật đã triển khai (Sections VIII)

1. **Loại bỏ font-blocking & giảm phân tranh socket trên Mobile**:
   - Chuyển từ `@import url('https://fonts.googleapis.com/...')` render-blocking sang `next/font/google` (`Be_Vietnam_Pro`, `display: 'swap'`, `preload: false`, tinh gọn trọng số về `['400', '600']` trong [`layout.tsx`](<../../src/app/(frontend)/layout.tsx>)), giảm mạnh tệp `.woff2` tranh chấp băng thông ngay khi bắt đầu tải trang.
   - Chỉnh `@keyframes enter` trong [`styles.css`](<../../src/app/(frontend)/styles.css>) bắt đầu từ `opacity: 0.98` (240ms) để giữ hiệu ứng mượt mà theo `reducedMotion` mà không làm ẩn nội dung text trên màn hình đầu tiên.
2. **Loại bỏ `<Suspense>` skeleton che LCP trên trang chi tiết xe**:
   - Bỏ `useSearchParams()` trong [`vehicle-detail.tsx`](../../src/components/vehicle-detail.tsx) (chuyển sang đọc `window.location.search` trong `useEffect`) và bỏ `<Suspense fallback={<VehicleDetailSkeleton />}>` trong [`vehicles/[slug]/page.tsx`](<../../src/app/(frontend)/vehicles/[slug]/page.tsx>). HTML SSG ban đầu chứa trực tiếp `<h1>` và ảnh chính (`fetchPriority="high"`, `decoding="sync"`), không phải chờ tải xong toàn bộ JS & hydrate trên CPU yếu mới hiển thị ảnh/tiêu đề.
   - Đẩy fail-safe tải ảnh thumbnail từ `1200ms` lên `4000ms` (hoặc ngay khi `onLoad` ảnh chính hoàn tất) để ngăn trình duyệt tải trùng `?w=96` (`161 KB`) trước khi ảnh chính (`?w=640`) hoàn tất; tách `AvailabilityCalendar` bằng `next/dynamic(..., { ssr: false })`; chỉ render ảnh lightbox khi `galleryOpen === true`; bọc `startTransition` cho lọc tab/loại ảnh.
3. **Thu gọn RSC payload & prefetch trên Trang chủ `/` + UI Links**:
   - Trong [`page.tsx`](<../../src/app/(frontend)/page.tsx>), rút gọn `models` truyền vào `<Featured />` (cắt `gallery.slice(0, 1)`, lược bỏ `specifications`, `variants`, `features`, `description` vốn không dùng ở card trang chủ), giảm HTML ban đầu của `/` từ `~47 KB` xuống chuẩn nhẹ.
   - Đặt `prefetch={false}` mặc định trên `NoriLink` & `ButtonLink` trong [`ui/index.tsx`](../../src/components/ui/index.tsx) (chỉ prefetch khi tương tác), loại bỏ ~`105 KB` request `_rsc` nền ngay lúc vừa mở trang trên Slow 4G.
   - Hoãn nạp nhóm ảnh danh mục dưới nếp gấp trong [`featured.tsx`](../../src/components/home/featured.tsx) đến khi Hero tải xong (`load`) hoặc người dùng cuộn gần (`IntersectionObserver` `rootMargin: 200px`), tránh ảnh `/seed-media/toyota-fortuner-ext-1.jpg` (`161 KB`) cạnh tranh băng thông với ảnh Hero chính (`vinfast-vf8-ext-10.jpg`).
4. **Tối ưu API `/nori-api/fleet` & Cache Invalidation**:
   - Viết lại [`nori-api/fleet/route.ts`](<../../src/app/(frontend)/nori-api/fleet/route.ts>) dùng `unstable_cache` (tag `nori-catalogue`), truy vấn `depth: 0` có chọn lọc (`select`), và gộp batch `media` thay cho `depth: 1`/`depth: 2` lặp. Tự động làm mới cache qua [`revalidate-nori.ts`](../../src/hooks/revalidate-nori.ts) khi CRUD xe, dòng xe, khuyến mãi, bài viết, bảo trì, đánh giá, hoặc `nori-site`.

---

## 2. Core Web Vitals — So sánh Trước vs Sau tối ưu (3 lần đo độc lập)

### 2.1. Kết quả sau tối ưu (Median & Range của 3 lần đo liên tiếp)

| Kịch bản & Đường dẫn           | Viewport & Mạng                        |           CLS (≤0.1)            |      LCP Median (Range)      |   INP Median (Range)    |   Load Median (Range)    | Candidate LCP & Trạng thái                                                                                    |
| :----------------------------- | :------------------------------------- | :-----------------------------: | :--------------------------: | :---------------------: | :----------------------: | :------------------------------------------------------------------------------------------------------------ |
| `/vehicles/toyota-fortuner`    | Desktop `1440×1000`                    |   `0.0066` (`0.0066..0.0072`)   |  **`408 ms`** (`248..1760`)  | **`32 ms`** (`32..112`) |  `322 ms` (`249..1405`)  | `IMG(...toyota-fortuner-ext-10.jpg)` — **GOOD**                                                               |
| `/vehicles/honda-pcx`          | Desktop `1440×1000`                    |   `0.0072` (`0.0066..0.0072`)   |  **`296 ms`** (`208..464`)   | **`32 ms`** (`32..32`)  |  `257 ms` (`243..413`)   | `IMG(...honda-pcx-ext-10.jpg)` — **GOOD**                                                                     |
| `/vehicles/ford-ranger-raptor` | Desktop `1440×1000`                    |   `0.0075` (`0.0066..0.0075`)   |  **`244 ms`** (`228..348`)   | **`32 ms`** (`24..32`)  |  `277 ms` (`216..352`)   | `IMG(...ford-ranger-raptor-ext-10.jpg)` — **GOOD**                                                            |
| `/vehicles` (Catalogue)        | **Mobile `375×812` (4x CPU, Slow 4G)** | **`0.0000`** (`0.0000..0.0000`) | **`2260 ms`** (`1920..2388`) | **`72 ms`** (`64..112`) | `2381 ms` (`2114..2674`) | `H1` — **GOOD (≤ 2500ms)**                                                                                    |
| `/vehicles/toyota-fortuner`    | **Mobile `375×812` (4x CPU, Slow 4G)** | **`0.0000`** (`0.0000..0.0000`) | **`3064 ms`** (`3052..3116`) | **`64 ms`** (`56..88`)  | `3722 ms` (`3678..3895`) | `IMG(...toyota-fortuner-ext-10.jpg)` — **INP/CLS GOOD · LCP cải thiện -45% (còn phụ thuộc CDN ảnh)**          |
| `/` (Trang chủ)                | **Mobile `375×812` (4x CPU, Slow 4G)** | **`0.0000`** (`0.0000..0.0000`) | **`2876 ms`** (`2868..3976`) |   **`0 ms`** (`0..0`)   | `3982 ms` (`3544..4285`) | `IMG(/api/media/file/vinfast-vf8-ext-10.jpg)` — **INP/CLS GOOD · LCP cải thiện -29% (còn phụ thuộc CDN ảnh)** |

### 2.2. Đối chiếu Trước vs Sau tối ưu (Mobile `375×812`, CPU `4x` + Slow 4G)

| Đường dẫn                   | Chỉ số                       | Baseline Trước Tối Ưu | Sau Tối Ưu (Median 3 runs) |     Mức cải thiện     | Đánh giá mục tiêu                                       |
| :-------------------------- | :--------------------------- | :-------------------: | :------------------------: | :-------------------: | :------------------------------------------------------ |
| `/vehicles/toyota-fortuner` | Mobile **LCP**               |       `5576 ms`       |       **`3064 ms`**        | **-2512 ms (-45.0%)** | Gần ngưỡng 2.5s (xem ghi chú hạ tầng ảnh bên dưới)      |
| `/vehicles/toyota-fortuner` | Mobile **INP**               |       `240 ms`        |        **`64 ms`**         | **-176 ms (-73.3%)**  | **ĐẠT (≤ 200ms)**                                       |
| `/vehicles/toyota-fortuner` | Mobile **Load**              |      `11180 ms`       |       **`3722 ms`**        | **-7458 ms (-66.7%)** | Cải thiện rất lớn                                       |
| `/` (Home)                  | Mobile **LCP** (bị throttle) |       `4064 ms`       |       **`2876 ms`**        | **-1188 ms (-29.2%)** | Đã loại toàn bộ tắc nghẽn font/prefetch/HTML/seed-media |
| Toàn bộ route đo            | **CLS**                      |   `0.0003 – 0.0086`   |   **`0.0000 – 0.0075`**    |  Giữ mức tiệm cận 0   | **ĐẠT (≤ 0.1)**                                         |

> **Phân tích nguyên nhân `~376–564ms` còn vượt trên 2.5s tại localhost Slow 4G**:
> Dù [`figma-image-loader.ts`](../../figma-image-loader.ts) đã sinh đúng truy vấn responsive (`?w=640&q=80`), trên server `next start` độc lập ở local (khi không đi qua Figma CDN hoặc Cloudflare Image Resizing), route tĩnh `/api/media/file/*` của Payload bỏ qua `?w=640` và trả về **nguyên file JPEG gốc** (`vinfast-vf8-ext-10.jpg` = `212 KB`, `toyota-fortuner-ext-10.jpg` = `161 KB`). Ở tốc độ bóp băng thông Slow 4G (`1.6 Mbps ≈ 200 KB/s`, RTT `150ms`), riêng thời gian truyền `212 KB` đã tốn tối thiểu ~`1.1s` cộng HTML/CSS/JS ban đầu. Khi triển khai thật sau Cloudflare Proxy / Figma CDN có bật Image Resizing / Polish WebP (cắt ảnh 640px xuống ~`35–50 KB`), LCP Mobile trên `/` và `/vehicles/[slug]` theo tính toán sẽ rơi về khoảng `~1.8s–2.2s` (cần đo xác thực lại sau khi bật CDN trên domain thật).

---

## 3. Kiểm thử Chịu tải & Tương tranh (`1 → 5 → 10 → 25 → 50` Concurrent Requests)

Đo bằng tập lệnh Node `fetch` song song trên bản production build `http://localhost:3100` sau tối ưu (làm nóng cache 1 request trước khi đo; mỗi mức đo chạy `5` đến `100` request đồng thời):

| Endpoint                                          | Mức `c` (`1 / 5 / 10 / 25 / 50`) |     Tổng req     | Lỗi `5xx` | RPS (`c=50`) | `p50` (ms) (`1 / 5 / 10 / 25 / 50`) | `p95` (ms) (`1 / 5 / 10 / 25 / 50`) | `Max` (ms) | So sánh `p95` `c=50` vs Baseline                   |
| :------------------------------------------------ | :------------------------------: | :--------------: | :-------: | :----------: | :---------------------------------: | :---------------------------------: | :--------: | :------------------------------------------------- |
| `/` (`○ Static`)                                  |          `1/5/10/25/50`          | `5/10/20/50/100` |  **`0`**  |  **`268`**   |      `10 / 20 / 33 / 87 / 172`      |      `10 / 23 / 40 / 99 / 195`      |   `195`    | `341ms → 195ms` (**-43%**, `268 RPS`)              |
| `/vehicles/toyota-fortuner` (`● SSG`)             |          `1/5/10/25/50`          | `5/10/20/50/100` |  **`0`**  |  **`384`**   |      `5 / 12 / 26 / 68 / 126`       |      `5 / 12 / 30 / 71 / 128`       |   `129`    | `281ms → 128ms` (**-54%**, `384 RPS`)              |
| `/nori-api/fleet?modelSlug=toyota-fortuner`       |          `1/5/10/25/50`          | `5/10/20/50/100` |  **`0`**  |  **`606`**   |       `3 / 10 / 17 / 45 / 78`       |       `4 / 10 / 22 / 51 / 83`       |    `83`    | **`1042ms → 83ms` (-92%), `52 → 606 RPS` (11.6x)** |
| `/nori-api/availability?...` (`vehicle` sẵn sàng) |          `1/5/10/25/50`          | `5/10/20/50/100` |  **`0`**  |  **`197`**   |      `8 / 30 / 54 / 132 / 238`      |      `8 / 34 / 55 / 141 / 266`      |   `266`    | `337ms → 266ms` (**-21%**, `197 RPS`)              |

- **Xác minh Cache Invalidation (`QA-REVAL-01` & `QA-CONC-02`)**: Đã kiểm chứng tự động việc chỉnh sửa giá thuê xe trên `/nori-api/dashboard/vehicles` lập tức vô hiệu hóa cache tag `nori-catalogue` và phản ánh giá mới ngay ở lần gọi `/nori-api/fleet` kế tiếp.
- **Tỷ lệ lỗi dưới tải `50` luồng song song**: `0` HTTP `500`, `100%` HTTP `200 OK` trên cả 4 endpoint.
