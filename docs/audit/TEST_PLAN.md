# KẾ HOẠCH KIỂM THỬ HỆ THỐNG NORI (TEST PLAN — v2.3 UPGRADE)

## 1. Mục tiêu & Nguyên tắc Kiểm thử

- Kiểm định toàn diện bản nâng cấp nghiệp vụ, quản trị phương tiện và UI/UX hệ thống **NORI** trên môi trường sản xuất cục bộ (`pnpm build` + `next start`) và cơ sở dữ liệu SQLite (`./nori.db`).
- Phạm vi bao phủ 100% 5 nhóm mã kiểm thử bắt buộc:
  - **`BK-01..BK-24`**: Chỉnh sửa đơn thuê chờ duyệt, loại trừ tự trùng lịch, khóa đối soát thanh toán, khóa xung đột duyệt đồng thời (Optimistic Locking) và lịch sử thay đổi.
  - **`NT-01..NT-18`**: Thông báo Popup sau duyệt đơn (hiển thị 1 lần, Chuông thông báo, phân biệt chưa thanh toán, chống trùng idempotent, tính lịch làm việc kế tiếp qua cuối tuần/ngày lễ, cảnh báo đơn gấp, quy trình nhân viên gọi tư vấn, và ẩn popup khi đơn bị hủy).
  - **`HR-01..HR-20`**: Hero Carousel 5 slide phương tiện quản trị từ CMS (`NoriSite`), chuyển slide mượt, điều hướng, Pause/Play, vuốt cảm ứng, bảo toàn `<SearchBar />`, `prefers-reduced-motion`, fallback ảnh lỗi/0 slide và tương thích 9 độ rộng màn hình (`320px`–`1920px`).
  - **`MD-01..MD-18`**: Tải 1 ảnh & đa ảnh, chọn ảnh chính, sắp xếp, phân loại góc chụp động, chặn giả mạo magic-byte, chặn tệp >8MB, phân quyền Admin `403`, và chặn xóa ảnh đang được tham chiếu (`409`).
  - **`VH-01..VH-20`**: Không gian quản trị dòng xe 10 tab thích ứng động (`CAR`, `MOTORBIKE`, `PICKUP`, `Điện (EV)`), làm giàu dữ liệu xác thực `VinFast Evo Max`, đồng bộ tức thì Admin → Khách hàng, và bảo toàn snapshot giá của đơn đã xác nhận khi Admin đổi giá xe.
- Mọi bản ghi sinh ra trong quá trình kiểm thử tự động đều được dọn sạch trong khối `finally`, giữ nguyên toàn vẹn dữ liệu thực của người dùng và đạt `PRAGMA integrity_check = 'ok'`, `PRAGMA foreign_key_check = []`.

---

## 2. Công cụ & Lệnh Thực thi

| Hạng mục                                   | Lệnh thực thi                                              | Kết quả yêu cầu                                                               |
| :----------------------------------------- | :--------------------------------------------------------- | :---------------------------------------------------------------------------- |
| Định dạng mã nguồn                         | `pnpm format:check` (`oxfmt`)                              | `0` lỗi định dạng                                                             |
| Kiểm tra kiểu tĩnh                         | `pnpm typecheck` (`tsc --noEmit`)                          | `0` lỗi TypeScript                                                            |
| Phân tích tĩnh & Bảo mật CSRF              | `pnpm lint` (`node scripts/static-lint.mjs`)               | `0` vi phạm trên toàn bộ `149` tệp nguồn                                      |
| Unit Tests nghiệp vụ                       | `pnpm test` (`node --test tests/rental-rules.test.mjs`)    | `225/225 PASS`                                                                |
| Kiểm thử Admin cô lập                      | `pnpm test:admin` (`node scripts/test-admin-isolated.mjs`) | `PASS` (`pbkdf2-sha256-v1`, `integrity = ok`)                                 |
| Production Build & Route Table             | `pnpm build` (`payload build` + `next build`)              | `74/74` trang tĩnh prerender thành công, `0` route công khai bị `ƒ (Dynamic)` |
| Playwright E2E & Accessibility             | `pnpm exec playwright test --project=chromium`             | `62/62 PASS` (`0` vi phạm `axe-core` WCAG 2.2 AA)                             |
| Cloud Sandbox (`figma make verify-deploy`) | `NOT_RUN` / `BLOCKED`                                      | Không có binary `figma` trên máy Windows cục bộ                               |
