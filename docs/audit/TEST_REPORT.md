# BÁO CÁO KẾT QUẢ KIỂM THỬ & NGHIỆM THU HỆ THỐNG NORI (TEST REPORT — v2.3)

- **Ngày kiểm thử**: `2026-11-18`
- **Môi trường**: Windows · Node.js `v24.22.3` · Next.js `16.4.6` (Production Build & `next start`) · Payload CMS `4.0.0-beta.8` · SQLite (`./nori.db`) · Google Chrome (Playwright `1.65.1` + `@axe-core/playwright` `4.14.0`).
- **Sao lưu CSDL trước nâng cấp**: `backups/nori-backup-2026-11-17T21-26-01-443Z.db` (`PRAGMA integrity_check = ok`).

---

## 1. Tổng hợp Kết quả Thực thi Lệnh Kiểm định

| Bộ kiểm thử                      | Lệnh thực thi                                  |  Tổng số ca   |   PASS   | FAIL  |                BLOCKED / NOT_RUN                | Thời gian |
| :------------------------------- | :--------------------------------------------- | :-----------: | :------: | :---: | :---------------------------------------------: | :-------: |
| **Code Formatting**              | `pnpm format:check`                            |    211 tệp    |   211    |   0   |                        0                        |  `~60ms`  |
| **TypeScript Strict Check**      | `pnpm typecheck`                               |  Toàn dự án   |   PASS   |   0   |                        0                        |  `~4.5s`  |
| **AST Security & CSRF Lint**     | `pnpm lint`                                    |    149 tệp    |   149    |   0   |                        0                        |  `~0.4s`  |
| **Domain Unit Tests**            | `pnpm test`                                    |    **225**    | **225**  | **0** |                        0                        | `210.8ms` |
| **Isolated Admin Auth & FK**     | `pnpm test:admin`                              |    1 suite    | **PASS** |   0   |                        0                        |  `~2.1s`  |
| **Production Build & SSG**       | `pnpm build`                                   | 74 trang tĩnh |  **74**  |   0   |                        0                        |  `~12s`   |
| **Playwright E2E & WCAG 2.2 AA** | `pnpm exec playwright test --project=chromium` |    **62**     |  **62**  | **0** |                        0                        |  `2.5m`   |
| **Figma Sandbox Deploy Check**   | `figma make verify-deploy`                     |       1       |    0     |   0   | **1 (`BLOCKED` — thiếu binary `figma` cục bộ)** |     —     |

---

## 2. Kết quả Chi tiết Theo Nhóm Chức năng Nâng cấp

1. **Phần A – Chỉnh sửa đơn thuê đang chờ duyệt (`BK-01..BK-24`)**: **`24/24 PASS`**
   - Cho phép xem chi tiết, chỉnh sửa thông tin thuê và hủy đơn khi `status === 'PENDING'` và chưa có giao dịch `payments`.
   - Loại trừ chính `bookingKey` đang chỉnh sửa khi kiểm tra trùng lịch nhưng chặn `HTTP 409` nếu trùng với đơn của khách khác hoặc lịch bảo trì.
   - Chặn giả mạo `totalPrice`/`status` (`HTTP 400`), chặn sửa chéo tài khoản IDOR (`HTTP 403`), chặn sửa khi có giao dịch đối soát (`HTTP 409`), và chặn xung đột khi Admin duyệt đơn đồng thời bằng Optimistic Locking `revision` (`HTTP 409` kèm thông báo hướng dẫn chuẩn).
   - Lưu đầy đủ `modificationHistory` và `AuditLogs`, hiển thị đồng bộ trên cả `/my-bookings` và `/dashboard/bookings`.

2. **Phần B – Thông báo xác nhận đơn & Quy trình liên hệ tư vấn (`NT-01..NT-18`)**: **`18/18 PASS`**
   - Tự động tạo idempotent `Notifications` (`eventKey` duy nhất) và `Consultations` ngay khi Admin duyệt đơn sang `CONFIRMED`.
   - Hiển thị Popup `"Đơn thuê của bạn đã được xác nhận!"` đúng 01 lần cho khách hàng sở hữu đơn (không bật lại sau khi bấm `"Tôi đã hiểu"` và tải lại trang; xem lại mọi lúc qua Chuông thông báo trên Header), che số điện thoại nhạy cảm (`098***4321`) và ghi rõ xác nhận đơn chưa bao gồm xác nhận đã thanh toán.
   - Tính chính xác ngày làm việc kế tiếp (`calculateNextContactSlot`) bỏ qua Thứ Bảy/Chủ Nhật và ngày nghỉ lễ cấu hình từ Admin; tự động gắn nhãn `Đơn thuê gấp` khi lịch nhận xe diễn ra trước khung giờ liên hệ dự kiến; tự động ẩn popup (`superseded = true`) nếu đơn bị hủy trước khi khách đọc.
   - Nhân viên cập nhật kết quả cuộc gọi và lọc trạng thái tư vấn tại `/dashboard/bookings` độc lập hoàn toàn với trạng thái thanh toán/hợp đồng.

3. **Phần C – Hero Carousel phương tiện & Responsive (`HR-01..HR-20`)**: **`20/20 PASS`**
   - Đã khắc phục lỗi mảng `heroImages` phong cảnh ghi đè ảnh xe và lỗi dừng autoplay khi chuột nằm trong vùng Hero rộng.
   - Chuẩn hóa 5 slide phương tiện sắc nét (`1280×826`) quản trị từ `/dashboard/content` (`NoriSite.heroSlides`), tự động chuyển slide mượt, hỗ trợ Next/Prev, Pause/Resume, vuốt cảm ứng, bảo toàn 100% dữ liệu `<SearchBar />`, đạt `0` tràn ngang trên 9 độ rộng (`320px`–`1920px`) và `0` lỗi `axe-core` WCAG 2.2 AA (`target-size >= 28×28px`).

4. **Phần D, E, F, G – Bảo mật Media, Quản trị Phương tiện 10 Tab & Đồng bộ Dữ liệu (`MD-01..18`, `VH-01..20`)**: **`38/38 PASS`**
   - API `/nori-api/dashboard/media` kiểm tra chữ ký nhị phân magic-byte, kích thước thực qua `sharp`, tải nhiều ảnh một lần, chặn khách thường tải ảnh (`403`), chặn tệp giả mạo/quá cỡ (`400`) và chặn xóa ảnh đang được tham chiếu (`409`).
   - Không gian `/dashboard/models` 10 tab và `/vehicles/[slug]` tự động thích ứng cho Ô tô, Xe máy, Bán tải và Xe điện; hoàn thiện đầy đủ hồ sơ xác thực cho `VinFast Evo Max` (`vinfast-evo-max`); sắp xếp deterministic `reference` trên `/nori-api/fleet`; đảm bảo đổi giá Admin cập nhật tức thì trang công khai nhưng giữ nguyên snapshot giá của các đơn đã xác nhận.

---

## 3. Kiểm tra Toàn vẹn Cơ sở Dữ liệu Sau Kiểm thử

- `PRAGMA integrity_check` = `'ok'`
- `PRAGMA foreign_key_check` = `[]` (`0` vi phạm khóa ngoại)
- Toàn bộ tài khoản và dữ liệu kiểm thử tạm thời của Playwright đã được dọn sạch hoàn toàn.
