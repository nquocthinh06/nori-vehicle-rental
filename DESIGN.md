# NORI Design System

Version 1.0 · React 19 / Next.js App Router / Payload 4 / Tailwind CSS 4

## 1. Context & goals

**Ý đồ thiết kế:** Một trải nghiệm chọn, thuê và tìm mua xe rõ ràng, thoáng, cao cấp nhưng gần gũi, để khách tập trung vào hành trình của mình.

Nguồn SKILL.md và DESIGN.md của VinFast được dùng làm tham khảo về phương pháp token hóa, component states và accessibility. NORI không sử dụng logo, wordmark, màu xanh nhận diện hoặc bản sao nguyên mẫu website VinFast.

Source ban đầu là starter Vite trống, không có brand assets, API hoặc UI để giữ lại. Backend Next.js/Payload được kết nối sau xác nhận của người dùng. Bộ nhận diện giao diện dưới đây là đề xuất NORI trong phiên bản này, giữ nguyên tên thương hiệu.

## 2. Visual language

- **Wordmark:** `nori.` tự thiết kế bằng chữ nghiêng đậm, tracking chặt; chấm xanh ngọc.
- **Màu:** xanh ngọc trầm, trắng, xám xanh và nền đêm xanh than.
- **Typography:** Be Vietnam Pro, sans-serif; ưu tiên dấu tiếng Việt và khả năng đọc.
- **Photography:** hình hành trình lớn cho storytelling, ảnh catalogue có nhãn, ảnh thực tế riêng cho inventory.
- **Composition:** container rộng, lưới đều, hierarchy rõ; tránh dashboard hóa trang marketing.
- **Motion:** chủ ý, nhẹ, không autoplay hero, không parallax hoặc hiệu ứng nặng.

## 3. Semantic tokens

Nguồn chạy thực tế: `src/app/(frontend)/styles.css`, khai báo bằng Tailwind v4 `@theme`.

### 3.1 Colors

| Token                      | Value                 | Vai trò                                                   |
| -------------------------- | --------------------- | --------------------------------------------------------- |
| `brand`                    | `#087568`             | CTA chính, liên kết, điểm nhấn                            |
| `brand-hover`              | `#056355`             | Hover/active chính                                        |
| `brand-soft`               | `#e7f3ee`             | Chọn, info, nền hỗ trợ                                    |
| `brand-bright`             | `#b6e5bf`             | Accent trên nền tối                                       |
| `ink`                      | `#192a2c`             | Nội dung chính                                            |
| `muted`                    | `#5e6d69`             | Nội dung phụ, vẫn phải đủ tương phản                      |
| `canvas`                   | `#ffffff`             | Nền chính / card                                          |
| `subtle`                   | `#f4f6f5`             | Khu vực nền phụ                                           |
| `soft`                     | `#eaf4f0`             | Story / CTA nhẹ                                           |
| `line`                     | `#e2e8e5`             | Divider trang trí, không là boundary duy nhất của control |
| `control-line`             | `#7e8e87`             | Đường viền control và số lớn, tương phản trên nền sáng    |
| `night`                    | `#142b28`             | Topbar, footer, hero fallback                             |
| `night-soft`               | `#223b36`             | Tương tác trên nền tối                                    |
| `on-night-muted`           | `#bed0c7`             | Chữ phụ nền tối                                           |
| `inverse`                  | `#ffffff`             | Chữ nền đậm                                               |
| `danger` / `danger-soft`   | `#b42318` / `#fff0ed` | Lỗi, hành động hủy                                        |
| `warning` / `warning-soft` | `#86540a` / `#fff5dc` | Chờ xử lý                                                 |
| `focus`                    | `#168573`             | Viền keyboard focus                                       |

Components must dùng tên semantic (`bg-brand`, `text-muted`…), không dùng mã hex hoặc palette riêng.

### 3.2 Typography

| Token         | Size | Ứng dụng                 |
| ------------- | ---- | ------------------------ |
| `micro`       | 11px | Ghi chú ngắn, badge phụ  |
| `caption`     | 12px | Metadata, điều hướng phụ |
| `small`       | 13px | Label, nội dung compact  |
| `body`        | 14px | Nội dung thông thường    |
| `lead`        | 16px | Intro, input mobile      |
| `subtitle`    | 18px | Tên card / tiểu mục      |
| `title`       | 24px | Section nhỏ              |
| `section`     | 36px | Section desktop          |
| `hero-mobile` | 40px | Hero mobile              |
| `display`     | 52px | Page title desktop       |
| `hero`        | 68px | Hero desktop             |

Heading must dùng component `Heading` đúng semantic level. Cỡ chữ không quyết định heading level. Text dài should có line-height 1.6–2 và giới hạn chiều dài dòng.

### 3.3 Spacing, size & layout

- Thang gốc: Tailwind spacing 4px, cho phép nửa bước 2px khi sắp icon/label.
- Container: `content = 82rem`, padding desktop `page = 3.5rem`; tablet 2rem; mobile 1.25rem.
- Vertical rhythm: `section = 5.5rem` desktop; 3.5rem mobile.
- Header: `header = 5.25rem`, topbar `2rem`.
- Control: `control = 3rem`, compact `control-sm = 2.5rem`, touch `2.75rem`.
- Hero: `hero = 39rem` desktop; mobile tối thiểu `hero-mobile = 34rem`, cao theo nội dung để CTA và pager không bị che.
- Gallery: desktop `33rem`, mobile `20rem`.
- Reading width `46rem`; form `28rem`; dialog `34rem`.
- Vehicle image aspect: `vehicle = 1.55`.

Breakpoints: mobile <768px, tablet 768–1023px, desktop ≥1024px; xl ≥1280px. Utilities `sm` ≥640px chỉ dùng để chia cột khi còn đủ chỗ.

### 3.4 Radius & elevation

| Token          | Value / use                                |
| -------------- | ------------------------------------------ |
| `control`      | 8px — fields, buttons                      |
| `card`         | 14px — inventory / content cards           |
| `panel`        | 18px — search, story, dialog               |
| `pill`         | fully rounded — chips, avatar, icon button |
| `shadow-card`  | nhẹ, nâng card khi hover                   |
| `shadow-float` | search nổi / mega menu / dialog            |
| `shadow-focus` | focus ring hỗ trợ, không thay outline      |

### 3.5 Motion

- Standard transition: 180ms; image hover: 500ms; entrance: 450ms; Hero crossfade: 700ms kèm zoom tinh tế `scale-[1.03]` trong `6s`.
- Easing: `cubic-bezier(.2,.7,.2,1)`.
- Hero Carousel tự động chuyển đổi 5 slide phương tiện quản trị từ CMS (`NoriSite.heroSlides`), tạm dừng khi người dùng bấm Pause, chạm cảm ứng, focus điều khiển hoặc khi tab trình duyệt ẩn (`visibilitychange`). Mọi nút chỉ số & điều hướng Hero đạt tối thiểu `28×28px` (`min-w-7 min-h-7`, vượt chuẩn WCAG 2.2 SC 2.5.8 `24×24px`).
- `prefers-reduced-motion: reduce` must tắt tự động chuyển slide, tắt animation không thiết yếu và smooth scrolling.

### 3.6 Mobile-first & PWA UI Patterns

- **Bottom Navigation**: Cố định đáy màn hình trên thiết bị di động (<768px), gồm 5 tab chính (`Khám phá`, `Xe`, `Yêu thích`, `Đơn thuê`, `Tài khoản`). Chiều cao chuẩn `4rem` (`64px`), tích hợp `padding-bottom: env(safe-area-inset-bottom)` bảo đảm không bị cản trở bởi Home Indicator trên iOS.
- **Sticky Booking Action Bar**: Trên màn hình chi tiết xe di động, thanh đặt xe nhanh gắn cố định đáy (`bottom: calc(4rem + env(safe-area-inset-bottom))`), hiển thị giá thuê và nút CTA `Chọn thuê ngay` để khách hàng có thể hành động mà không cần cuộn trang.
- **Bottom Sheet Filters**: Bộ lọc tìm kiếm trên di động xuất hiện dưới dạng Bottom Sheet trượt từ dưới lên, hỗ trợ gesture vuốt đóng, chip danh mục cuộn ngang và nút xác nhận ghim cố định.
- **Active Filter Chips**: Hiển thị trạng thái các bộ lọc đang kích hoạt với nút gỡ bỏ nhanh hoặc nút `Xóa tất cả` để khôi phục trạng thái danh mục ban đầu.
- **Touch Targets**: Mọi nút bấm, tab và chip điều hướng đều tuân thủ kích thước tối thiểu `44×44px` (WCAG 2.2 Success Criterion 2.5.8).

## 4. Component inventory

| Family        | Source                                  | Anatomy / variants                                                                    |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Typography    | `components/ui/index.tsx`               | Heading, Text, Eyebrow                                                                |
| Action        | cùng file                               | Button primary/dark/secondary/ghost/inverse/danger; ButtonLink; IconButton            |
| Navigation    | cùng file                               | NoriLink, ExternalLink, Container, TabButton có trạng thái ARIA và focus              |
| Form          | cùng file                               | Input, Select, Textarea, Checkbox, hint/error                                         |
| Feedback      | cùng file                               | Notice info/error/success, Badge, StatusBadge                                         |
| Loading/empty | cùng file                               | Skeleton, CardSkeleton, EmptyState                                                    |
| Modal         | `components/ui/dialog.tsx`              | native dialog, backdrop, close, focus containment                                     |
| Icons         | `components/ui/icon.tsx`                | cùng viewBox 24, stroke 1.6, decorative aria-hidden                                   |
| Site shell    | header/footer/brand/bottom-nav          | desktop mega menu, mobile navigation, mobile bottom nav (5 mục), semantic footer      |
| PWA           | `pwa-manager.tsx`, `public/sw.js`       | Web App Manifest, Service Worker an toàn, offline fallback `/offline`, install prompt |
| Vehicles      | vehicle-card/catalogue/vehicle-detail   | catalogue, filters, gallery, variants, actual inventory                               |
| Operations    | availability-calendar/checkout/bookings | live availability, review, confirmation, cancellation                                 |
| Accounts      | auth-form/account-panel                 | native Payload app auth, profile, sales requests                                      |
| Admin         | dashboard-panel                         | real counts, legal workflow transitions, canonical CMS links                          |

`/design-system` là trang kiểm thử component trực tiếp. Đây không phải nguồn mock cho các trang nghiệp vụ.

## 5. States & behavior

| State         | Behavior                                                 |
| ------------- | -------------------------------------------------------- |
| Default       | Label, vai trò và hierarchy rõ                           |
| Hover         | Đổi màu/đường viền, card nâng nhẹ                        |
| Focus-visible | Outline xanh rõ, có offset                               |
| Active        | Phản hồi bấm nhỏ, không đổi layout                       |
| Disabled      | Native disabled, nội dung lý do khi thiếu dữ liệu        |
| Loading       | Spinner hoặc skeleton; aria-busy/status; khóa gửi        |
| Error         | Notice hoặc field error; giữ input; retry khi phù hợp    |
| Empty         | Giải thích và bước tiếp theo; không lấp bằng dữ liệu giả |

### Header / mega menu & Mobile Bottom Nav

Must dùng trigger click/keyboard với expanded state. Escape đóng và trả focus. Mobile có tất cả đích điều hướng chính. Không mở menu chỉ bằng hover.

Trên mobile (`<1024px`), `MobileBottomNav` cố định ở cạnh dưới với safe-area (`env(safe-area-inset-bottom)`) gồm 5 mục thực tế: Trang chủ (`/`), Tìm xe (`/vehicles`), Yêu thích (`/favorites`), Đơn hàng (`/my-bookings`) và Tài khoản (`/account` hoặc `/login`). `MobileBottomNav` tự động ẩn tại `/vehicles/[slug]` (nhường chỗ cho Sticky Booking Bar), `/checkout` và `/dashboard/*` để tránh xung đột thao tác.

### Search / filtering

Phân biệt thuê và mua. Bộ lọc áp dụng thật lên dữ liệu Payload đã lấy từ server: category, brand, name, price; sort giá/tên; pagination 12.

Giá còn thiếu must không lọt vào khoảng giá xác định. Danh sách gọi rõ là “dòng xe”, không gọi số lượng catalogue là số xe còn trống.

### Gallery / variants

Ảnh catalogue must có nhãn. Không nội thất thì hiển thị thiếu nội thất; không thay bằng ngoại thất. Phiên bản và màu dùng relationship ảnh đúng nguồn; không tự recolor ảnh hoặc tạo swatch suy đoán. Lightbox dùng native dialog.

### Availability / checkout

Ngày chưa tải, lỗi và “không có inventory” khác với “ngày còn trống”. Khả dụng dùng endpoint operational không cache. Đơn mới chỉ được tạo sau khi máy chủ xác thực tài khoản, giá, trạng thái, ngày và giữ các rental-day unique trong cùng transaction.

Checkout không có thẻ tín dụng, ví, “đã thanh toán”, coupon hoặc phụ phí không tồn tại trong SPEC. Chỉ xác nhận yêu cầu thuê và thông báo thanh toán ngoài hệ thống.

### Customer / admin boundaries

`users` là tài khoản ứng dụng, cookie `app-session` HttpOnly. `admins` là danh tính CMS/Figma SSO. Không trộn role hoặc cookie.

Khách chỉ đọc/hủy đơn của mình. Giá, customer và workflow fields có field access server-owned. Quản trị thay trạng thái theo ma trận, không hard-delete đơn hoặc xe.

## 6. Data policy

### Domain model

- `vehicle-models`: tên dòng xe, brand/category, ảnh catalogue, thông số/phiên bản có nguồn.
- `vehicles`: từng chiếc xe thực tế, mã quản lý, biển số nội bộ, giá, ODO, tình trạng, ảnh riêng.
- `bookings`: ownership, date-only range, price snapshots, trạng thái.
- `rental-days`: khóa unique theo xe/ngày để chống giữ lịch trùng; không công bố mã booking.
- `sales-inquiries`: yêu cầu tư vấn mua, contact riêng tư, workflow staff.
- `users`: app customer auth.
- `nori-site`: ảnh cảm hứng, câu chuyện và thông tin liên hệ xác nhận.
- `media`: upload relationships dùng chung, không có URL field song song.

### Missing / long content

- Giá, phiên bản, màu, ODO, specification, địa chỉ/hotline thiếu must hiện “Chưa cập nhật”.
- Không có inventory must khóa đặt thuê và giải thích nguyên nhân.
- Tên dài wrap/clamp trên card; đầy đủ trên detail.
- Email và reference dài must break/wrap, không làm tràn viewport.
- Quan hệ chưa populate hoặc bị ẩn must degrade an toàn.

### Sources

Starter content chỉ gồm ba catalogue dòng xe và sáu ảnh có nguồn Unsplash, không có xe cho thuê giả.

| Nội dung           | Nguồn                                                         |
| ------------------ | ------------------------------------------------------------- |
| Infiniti / núi     | Erik Mclean, Unsplash, ảnh `1758411898074-a0652ded95e6`       |
| Land Rover / tuyết | Grant Ritchie, Unsplash, ảnh `1502489597346-dad15683d4c2`     |
| Đường rừng         | Katie Moum, Unsplash, ảnh `1494822493217-c9840aba840c`        |
| Toyota Fortuner    | Devan Mnn, Unsplash, ảnh `1664783856972-ac9922d7b2d3`         |
| Ford Ranger Raptor | Paolo Resteghini, Unsplash, ảnh `1700943937372-12c2611b5af8`  |
| Honda PCX          | Mehmet Talha Onuk, Unsplash, ảnh `1628798211398-29d5c9773fbd` |

Ảnh đã kiểm tra trực quan và nhập qua Payload CLI `externalURL`. Không suy ra năm xe, động cơ, option, giá hoặc ODO từ ảnh. Ảnh hero không thể hiện inventory NORI.

## 7. Content lifecycle & performance

Public catalogue/site dùng `unstable_cache`, không dùng uncached runtime chỉ để đơn giản hóa freshness.

- Tags: `nori-catalogue`, `nori-site`, `nori-model-{slug}`.
- `afterChange`/`afterDelete` invalidation bao gồm list, old slug, new slug và media-dependent detail paths.
- Khi hook chạy ngoài Next (CLI), gửi thông báo cache-only có chữ ký HMAC tới endpoint nội bộ; endpoint không tạo/sửa dữ liệu và từ chối request không ký hoặc hết hạn.
- Cached content phải được kiểm chứng bằng production request mới sau một content write.
- Availability/account/order/admin endpoints private no-store; static page shells không đọc cookies.
- Media dùng `next/image`, `media.url`, loader Figma nguyên bản, `sizes`, bounded containers, lazy loading bên dưới fold.
- Media công khai có cache header một giờ; không dùng `immutable` cho ảnh có thể thay.
- **Layout Stability & CLS Optimization (CLS ≤ 0.1000)**:
  - Skeleton kích thước chuẩn hóa: Pre-hydration skeleton phải khớp tỷ lệ và chiều cao thực tế của giao diện sau khi tải (ví dụ: `VehicleDetailSkeleton` hai cột với `min-h-[1200px]` và sidebar `h-4 w-28` label + `h-control` input).
  - Tránh layout shift do hydrate dữ liệu không đồng bộ: Khởi tạo giá niêm yết fallback và cờ `isDemo` ngay tại SSR để UI không bị giật kích thước khi Client Component hydrate.
  - Vùng chứa thông báo bất đồng bộ (tiền cọc, phụ phí, khuyến mãi) phải có `min-h` cố định (ví dụ `min-h-[20px]`).
  - Đạt chỉ số thực tế: Desktop CLS đạt `0.0038` (giảm từ `0.1327`), LCP `< 600ms`, INP `< 50ms`.

## 8. Accessibility

Mục tiêu WCAG 2.2 AA; không tuyên bố chứng nhận chỉ vì build hoặc axe thành công.

- `lang=vi`, skip link, landmarks, một h1, heading order rõ.
- Native labels, descriptions và error association.
- Full keyboard navigation, focus-visible, native dialog containment.
- Text contrast 4.5:1; large text 3:1. Divider trang trí không thay thế label/boundary.
- Pointer targets ≥24px; hành động chính ≥44px.
- Mobile input should ≥16px để tránh tự zoom trên iOS.
- 375px không tràn ngang; 200% zoom không mất CTA.
- Reduced-motion được tôn trọng.
- Không autoplay hoặc timeout ngắn làm mất nội dung.

## 9. Anti-patterns & migration notes

Must không:

- Sao chép màu/logo hoặc nhận diện VinFast.
- Chuyển các con số về mật độ component trong DESIGN tham khảo thành yêu cầu tạo hàng trăm component giả.
- Hardcode danh sách business hoặc đường dẫn ảnh remote trong UI.
- Giả đặt cọc, bảo hiểm, đánh giá, ưu đãi, kho xe hay doanh thu.
- Dùng empty state như một lỗi kỹ thuật thô.
- Chạy raw seed script, SQL hoặc REST helper thay cho Payload CLI khi chỉnh content.
- Sửa thư mục `(payload)` hoặc bỏ managed auth/image loader.
- Bỏ qua typecheck riêng vì build template cho phép bỏ qua TypeScript errors.

## 10. QA & delivery

Checklist và kết quả thực thi ở `docs/QA.md`. Route lifecycle/tiến độ ở `docs/IMPLEMENTATION.md`. Danh sách file ở `docs/CHANGES.md`.

Lệnh chuẩn:

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format --check <changed-paths>
figma make verify-deploy
```

Build success must không thay thế kiểm thử chức năng. Thiếu dữ liệu thực tế must được ghi rõ là blocker nghiệm thu luồng đặt/nhận/trả xe hoàn chỉnh.
