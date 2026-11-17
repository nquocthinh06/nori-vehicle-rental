# NHẬT KÝ THAY ĐỔI VÀ NÂNG CẤP HỆ THỐNG NORI (CHANGELOG)

## [Phiên bản 2.1.0] — 2026-11-18: Kiểm định & Hoàn thiện Responsive, PWA, Hiệu năng & Đồng bộ Dữ liệu

### 1. Đồng bộ Dữ liệu & Dynamic Routing

- **`src/app/(frontend)/vehicles/[slug]/page.tsx`**:
  - Bổ sung `export const dynamicParams = true` cho phép Next.js render động theo yêu cầu (On-Demand SSR) các dòng xe mới tạo trong Payload Admin ngoài danh sách 20 slug tĩnh được sinh tại build-time.
  - Thay thế Suspense skeleton tối giản bằng `VehicleDetailSkeleton` hai cột hoàn chỉnh với chiều cao chuẩn `min-h-[1200px]`, triệt tiêu layout shift trong quá trình streaming hydration.
- **`src/hooks/revalidate-nori.ts`**:
  - Nâng cấp `revalidateCatalogue` và `revalidateDeletedCatalogue` với hàm phụ trợ `extractModelSlug` để tự động bóc tách slug dòng xe từ bản ghi xe cụ thể, xóa sạch cache tag `nori-model-${slug}` và `nori-catalogue-v3`.
- **`src/app/(frontend)/nori-api/fleet/route.ts`**:
  - Bổ sung hỗ trợ tra cứu xe đồng thời bằng UUID hoặc `modelSlug`, giúp các thành phần frontend và test script truy vấn danh sách xe vật lý linh hoạt.

### 2. Tối ưu Hiệu năng & Core Web Vitals (CLS Fix)

- **`src/components/vehicle-detail.tsx`**:
  - Khởi tạo giá niêm yết `displayPrice = price ?? fallbackPrice` và cờ xe demo `isDemoActive = selectedVehicle ? selectedVehicle.isDemo : model.hasDemoFleet` ngay tại thời điểm SSR, ngăn ngừa việc giật nhãn/giá khi Client Component hydrate.
  - Bổ sung container có chiều cao cố định `min-h-[20px]` cho dòng thông báo tiền cọc bất đồng bộ.
  - Chuẩn hóa skeleton của dropdown chọn xe (`fleetLoading`) thành `66px` (`h-4 w-28` label + `h-control` input) khớp 100% với kích thước của thẻ `<Select>`.
  - **Kết quả đo đạc**: Đưa chỉ số CLS tại trang chi tiết Toyota Fortuner từ **`0.1327` (và đỉnh `0.1824`) xuống `0.0038`** (đạt xuất sắc ngưỡng CLS ≤ 0.1000). LCP đạt `516ms`, INP đạt `40ms`.

### 3. Nghiệp vụ, Kiểm soát Giao dịch Đồng thời & Bảo mật

- **`src/app/(frontend)/nori-api/dashboard/payments/route.ts`**:
  - Bổ sung cơ chế Idempotency Guard: Tự động kiểm tra các bản ghi thanh toán gần nhất cho cùng `bookingId`. Nếu phát hiện request trùng lặp loại thanh toán và số tiền trong vòng 30 giây, từ chối với mã lỗi `HTTP 409 DUPLICATE_PAYMENT`.
- **`src/lib/api-utils.ts`**:
  - Cải tiến hàm kiểm tra lỗi `apiError` với cơ chế duck-typing (`status in error && typeof error.status === 'number'`), ngăn chặn hiện tượng đóng gói module khác nhau của Turbopack/Next.js làm rơi mất mã trạng thái `409` và biến thành `503`.
- **`src/components/checkout-panel.tsx` & `src/components/auth-provider.tsx`**:
  - Gắn định danh người dùng vào khóa lưu trữ bản nháp giỏ hàng: `nori_checkout_draft:${user?.id ?? 'anon'}:${id}:${startDate}:${endDate}`.
  - Tích hợp hook xóa sạch mọi key `nori_checkout_draft` trong `sessionStorage` khi người dùng đăng xuất.
- **`public/sw.js`**:
  - Bổ sung `/reset-password` vào danh sách tiền tố nhạy cảm (`SENSITIVE_PREFIXES`).
  - Thiết lập bộ lọc chặn cache mọi response chứa header `Set-Cookie` hoặc chỉ thị `no-store` / `private`.
  - Bổ sung listener lắng nghe sự kiện `CLEAR_CACHES` để xóa trắng runtime cache của Service Worker khi người dùng đăng xuất.

### 4. Sao lưu & Quản trị Cơ sở Dữ liệu SQLite

- **`scripts/backup-db.mjs`**:
  - Triển khai lệnh sao lưu trực tuyến an toàn không gián đoạn `VACUUM INTO '<destination>'`.
  - Tích hợp kiểm tra tính toàn vẹn `PRAGMA integrity_check` trên tệp sao lưu.
- **`scripts/restore-db.mjs`**:
  - Triển khai script phục hồi cơ sở dữ liệu có sao lưu an toàn bản hiện tại và kiểm tra khóa ngoại sau khôi phục.
- **`package.json`**:
  - Bổ sung script `"db:backup"` và `"db:restore"`.

### 5. Bộ Kiểm thử Đa nền tảng & Tự động hóa

- **`tests/e2e/data-sync.spec.ts`**:
  - Bổ sung 8 kịch bản E2E kiểm tra đồng bộ dữ liệu động, revalidation hooks, xác thực giá Backend, race condition đặt xe trùng lịch (409), chống trùng lặp thanh toán (409), Service Worker allowlist và cách ly giỏ hàng nháp.
- **`tests/e2e/mobile-webkit.spec.ts`**:
  - Bổ sung 5 kịch bản E2E chạy trên engine WebKit thực tế (mô phỏng Safari trên iPhone 14) kiểm tra toàn bộ luồng tìm xe, lọc chip danh mục, đặt thuê xe, tư vấn mua xe và quản lý tài khoản.
- **Tổng kết kiểm thử**: Đạt **268 / 268 test PASS (100%)** bao gồm 205 unit tests và 63 Playwright E2E tests.
