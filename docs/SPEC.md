# ĐẶC TẢ YÊU CẦU HỆ THỐNG NORI (SYSTEM SPECIFICATION)

- **Tên dự án**: NORI — Dịch vụ Cho thuê xe Linh hoạt & Tìm mua xe Tự tin
- **Phiên bản tài liệu**: 2.0 (Kiểm định & Hoàn thiện sau Nâng cấp Responsive & PWA)
- **Kiến trúc công nghệ**: Next.js 16.4.6 (App Router), React 19.3.1, Payload CMS 4.0.0-beta.8, SQLite (`@payloadcms/db-sqlite` + Drizzle ORM), Tailwind CSS 4.
- **Trạng thái thực thi**: 268/268 test cases đạt chuẩn (205 unit + 63 Playwright E2E).

---

## 1. Yêu cầu Kiến trúc & Giao diện (Architecture & UI Requirements)

- **`SPEC-01` — Thiết kế Mobile-First & Responsive Đa màn hình**:
  - Giao diện đáp ứng liền mạch từ màn hình nhỏ nhất `320px` đến màn hình lớn `1920px` qua 11 breakpoints (`320px`, `360px`, `375px`, `390px`, `412px`, `428px`, `640px`, `768px`, `1024px`, `1280px`, `1440px`).
  - Trên thiết bị di động (<768px): Cố định thanh Bottom Navigation (5 mục: Khám phá, Xe, Yêu thích, Đơn thuê, Tài khoản), hỗ trợ safe area (`env(safe-area-inset-bottom)`).
  - Trang chi tiết xe có thanh đặt xe cố định chân trang (Sticky Booking CTA).
  - Bộ lọc tìm kiếm trên di động hiển thị dạng Bottom Sheet có hỗ trợ thao tác vuốt và chip lọc đang kích hoạt.
- **`SPEC-02` — Khả năng tiếp cận & Tiêu chuẩn WCAG 2.2 AA**:
  - Độ tương phản chữ đạt tối thiểu `4.5:1` cho nội dung thông thường và `3:1` cho tiêu đề lớn.
  - Vùng chạm tương tác tối thiểu `44×44px` cho các nút bấm chính.
  - Hỗ trợ đầy đủ điều hướng bàn phím (`Tab`, `Shift+Tab`, `Escape`, `Enter`, `Space`) và focus ring rõ ràng (`outline-focus`).
  - `0` lỗi vi phạm khi quét tự động bằng công cụ `@axe-core/playwright`.

---

## 2. Yêu cầu Đồng bộ Dữ liệu (Data Synchronization Requirements)

- **`SPEC-03` — Đồng bộ Tức thì giữa Admin và Khách hàng (Desktop, Mobile, PWA)**:
  - Khi Admin thêm, sửa, ẩn xe hoặc thay đổi giá, thông số, ảnh: Payload hooks (`revalidateCatalogue`, `revalidateDeletedCatalogue`) tự động kích hoạt `revalidateTag` bóc tách slug phụ thuộc và xóa tag cache Next.js (`nori-catalogue-v3`, `nori-model-${slug}`).
  - Khách hàng tải lại hoặc chuyển trang sẽ thấy ngay dữ liệu mới nhất mà không cần build lại máy chủ.
- **`SPEC-04` — Hỗ trợ Dynamic Slug ngoài Build-time**:
  - Tuyến đường `src/app/(frontend)/vehicles/[slug]/page.tsx` khai báo `export const dynamicParams = true`.
  - Mọi dòng xe mới được tạo trên Admin sau thời điểm build sản xuất đều được Next.js tự động render động theo yêu cầu (On-Demand SSR) mà không bị lỗi HTTP 404.
- **`SPEC-05` — Xác thực Giá & Khả dụng Backend Tuyệt đối**:
  - Mọi thao tác tạo đơn thuê (`POST /nori-api/bookings`) hoặc tính giá (`GET /nori-api/availability`) đều thực hiện tính toán lại toàn bộ trên Backend dựa theo đơn giá xe trong DB, phụ phí, thời điểm cuối tuần/ngày lễ và mã khuyến mãi.
  - Từ chối ngay lập tức (`HTTP 400`) mọi nỗ lực giả mạo tổng tiền (`totalPrice`) hoặc tiền cọc (`depositAmount`) từ phía Client.

---

## 3. Yêu cầu Nghiệp vụ & Kiểm soát Giao dịch (Business & Concurrency)

- **`SPEC-06` — Kiểm soát Đặt xe Trùng lịch Đồng thời (Double-Booking Race Condition)**:
  - Sử dụng SQLite Transaction và bảng khóa ngày `rental_days`.
  - Khi 2 người dùng gửi request đặt cùng một xe trên cùng một khoảng ngày, chỉ duy nhất 1 giao dịch được xác nhận (`HTTP 201`), giao dịch còn lại lập tức bị từ chối với mã lỗi `HTTP 409 CONFLICT`.
- **`SPEC-07` — Chống Thanh toán Trùng lặp (Payment Idempotency Guard)**:
  - API `/nori-api/dashboard/payments` kiểm tra lịch sử thanh toán trong vòng **30 giây**.
  - Nếu phát hiện giao dịch có cùng `bookingId`, `paymentType` và `amount`, hệ thống từ chối với mã lỗi `HTTP 409 DUPLICATE_PAYMENT`.
- **`SPEC-08` — Vòng đời Đơn thuê xe (9 trạng thái)**:
  - `PENDING` → `DEPOSIT_PENDING` / `CONFIRMED` / `REJECTED` → `READY_FOR_HANDOVER` → `ONGOING` → `INSPECTING` → `COMPLETED` / `DISPUTED`.
  - Hủy đơn (`CANCELLED`) chỉ cho phép khi ở trạng thái `PENDING` hoặc `DEPOSIT_PENDING` và tự động giải phóng ngày khóa trên lịch.
- **`SPEC-09` — Vòng đời Yêu cầu Mua xe (8 trạng thái)**:
  - `NEW` → `CONTACTED` → `TEST_DRIVE_SCHEDULED` → `DEPOSIT_PENDING` → `CONTRACT_SIGNED` → `DELIVERED` → `COMPLETED`.
  - Khóa xe `RESERVED` khi ký hợp đồng và chuyển `SOLD` khi bàn giao xe. Chặn bán xe nếu xe đang có đơn thuê giữ lịch trong tương lai.

---

## 4. Yêu cầu Bảo mật & Phân quyền (Security & RBAC)

- **`SPEC-10` — Phân quyền Quản trị Tập trung (Centralized RBAC)**:
  - 13 route Dashboard (`/dashboard/*`) và API tương ứng (`/nori-api/dashboard/*`) chỉ cho phép tài khoản Admin (`admins` collection) có cookie `payload-token` hợp lệ.
  - Phân cấp 2 vai trò quản trị: `SUPER_ADMIN` (toàn quyền, quản lý nhân viên, cấu hình hệ thống) và `OPERATOR` (kiểm tra quyền theo từng hành động cụ thể `[module, action]`).
  - Khách hàng (`users`) bị từ chối `HTTP 403` trên toàn bộ khu vực quản trị.
- **`SPEC-11` — Bảo mật PWA & Service Worker Allowlist**:
  - Service Worker chỉ cache tài nguyên công khai an toàn (JS, CSS, static images, offline fallback).
  - Nghiêm cấm cache dữ liệu API, cookie xác thực, hoặc các trang nhạy cảm (`/account`, `/checkout`, `/dashboard`, `/login`, `/register`, `/reset-password`).
  - Tự động dọn dẹp sạch cache (`CLEAR_CACHES`) khi người dùng đăng xuất.
- **`SPEC-12` — Cách ly Dữ liệu Bản nháp Giỏ hàng (Checkout Draft)**:
  - Khóa lưu trữ bản nháp `sessionStorage` gắn kèm định danh tài khoản (`userId`), xóa sạch khi đăng xuất nhằm chống rò rỉ dữ liệu giữa các phiên sử dụng trên cùng thiết bị.

---

## 5. Yêu cầu Hiệu năng & Chỉ số Trải nghiệm Web (Performance & Core Web Vitals)

- **`SPEC-13` — Khắc phục Triệt để Layout Shift (CLS ≤ 0.1000)**:
  - Chuẩn hóa kích thước Skeleton trước khi Hydration khớp 100% với layout thực tế (ví dụ: `VehicleDetailSkeleton` hai cột `min-h-[1200px]`).
  - Khởi tạo giá fallback và cờ `isDemo` ngay tại SSR để tránh nhấp nháy nhãn/giá.
  - Điểm đo thực tế tại trang chi tiết Toyota Fortuner trên production build: **CLS = `0.0038`** (giảm từ `0.1327`).
- **`SPEC-14` — Tốc độ Tải trang & Tương tác (LCP & INP)**:
  - LCP thực tế trên máy chủ sản xuất đạt `< 600ms` (ngưỡng chuẩn < 2500ms).
  - INP (Interaction to Next Paint) đạt `< 50ms` (ngưỡng chuẩn < 200ms).
  - Đảm bảo hiệu năng mượt mà ngay cả khi giả lập mạng chậm và CPU suy giảm 4 lần (Throttled Mobile: CLS = `0.0003`).

---

## 6. Yêu cầu Quản trị Dữ liệu & Triển khai (Data & Operations)

- **`SPEC-15` — Sao lưu & Khôi phục Trực tuyến SQLite**:
  - Hỗ trợ sao lưu an toàn `VACUUM INTO` qua script `scripts/backup-db.mjs` mà không làm gián đoạn hệ thống.
  - Kiểm tra tính toàn vẹn `PRAGMA integrity_check` tự động trên tệp sao lưu.
  - Cung cấp script phục hồi `scripts/restore-db.mjs`.
- **`SPEC-16` — Minh bạch Dữ liệu DEMO & Giới hạn Thương mại**:
  - Toàn bộ 21 xe trong kho hiện tại gắn cờ `isDemo` rõ ràng trên giao diện.
  - Cổng thanh toán và dịch vụ gửi SMS/Email đang ở chế độ mô phỏng an toàn (Sandbox), thông báo minh bạch cho người dùng trước khi tiến hành tích hợp thương mại thực tế.
