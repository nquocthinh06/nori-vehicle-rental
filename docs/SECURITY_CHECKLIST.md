# NORI Vehicle Rental — Danh Mục Kiểm Soát An Ninh & Bảo Mật (Security Checklist)

Tài liệu rà soát toàn bộ các cơ chế bảo mật đã được cài đặt và kiểm chứng trên hệ thống NORI trước khi đưa vào vận hành Production.

---

## 1. Bảo Vệ Xác Thực & Phiên Làm Việc (Authentication & Cookies)

- [x] **Phân tách Tài khoản Khách hàng và Quản trị viên**:
  - Khách hàng đăng ký trên web/PWA thuộc bảng `users`.
  - Quản trị viên và nhân viên vận hành thuộc bảng `admins` với 8 vai trò phân quyền chi tiết.
  - Khách hàng tuyệt đối không có quyền đăng nhập vào `/admin` hoặc `/dashboard`.
- [x] **Cấu hình Cookie Tương thích Reverse Proxy & Cloudflare**:
  - Module `src/lib/session-cookie.ts` tự động kiểm tra `cf-visitor: {"scheme":"https"}` và `x-forwarded-ssl: on`.
  - Khi chạy qua Cloudflare Tunnel (HTTPS), cookie tự động kích hoạt:
    - `HttpOnly: true` (Ngăn chặn tấn công XSS đọc cắp cookie).
    - `Secure: true` (Chỉ truyền qua kênh mã hóa HTTPS).
    - `SameSite: Lax` (Chống tấn công CSRF điều hướng).
  - Khi chạy trên mạng LAN hoặc Localhost (HTTP), cờ `Secure` được linh hoạt tắt để không làm mất phiên đăng nhập của người dùng.
- [x] **Thu Hồi Quyền Tức Thì (Instant Token Revocation)**:
  - Khi một tài khoản nhân viên bị chuyển sang trạng thái `account_status: 'REVOKED'`, mọi request tiếp theo từ phiên cũ đều bị từ chối ngay lập tức tại middleware/API layer mà không cần chờ JWT hết hạn.

---

## 2. Bảo Vệ Tầng Mạng & Phòng Chống Tấn Công (Network & WAF)

- [x] **Ẩn Hoàn Toàn Địa Chỉ IP Gốc (No Port Forwarding)**:
  - Sử dụng Cloudflare Tunnel, Home Server hoàn toàn không mở cổng ra Internet (cổng 80/443 đóng hoàn toàn trên Router).
  - Kẻ tấn công trên mạng Internet không thể quét cổng hoặc tấn công trực tiếp vào địa chỉ IP nhà mạng của bạn.
- [x] **Chống Tấn Công DDoS & WAF**:
  - Lưu lượng truy cập đi qua mạng lưới toàn cầu của Cloudflare, hưởng lợi từ hệ thống tự động giảm thiểu DDoS quy mô lớn.
- [x] **Bảo Vệ Tấn Công Brute-Force & Rate Limiting**:
  - Module `src/lib/api-utils.ts` kích hoạt giới hạn tần suất gọi API (Rate Limiting) trên các endpoint nhạy cảm:
    - Đăng nhập / Đổi mật khẩu.
    - Tạo đơn đặt xe mới (`/nori-api/bookings`).
    - Gửi yêu cầu tư vấn (`/nori-api/inquiries`).
  - Địa chỉ IP được định danh chính xác từ tiêu đề `cf-connecting-ip` do Cloudflare cung cấp, ngăn chặn việc kẻ xấu giả mạo header `X-Forwarded-For`.

---

## 3. Bảo Vệ Dữ Liệu & Chống Tấn Công Giả Mạo Request (CSRF & Origin)

- [x] **Xác Minh Origin Trên Mọi Request Ghi (Origin Guard)**:
  - Hàm `assertOrigin` trong `src/lib/api-utils.ts` đối chiếu Origin của request với danh sách `ALLOWED_ORIGINS` và `APP_URL`.
  - Các request có Origin lạ hoặc không hợp lệ lập tức bị chặn với mã lỗi HTTP 403 Forbidden.
- [x] **Bảo Vệ Next.js Server Actions CSRF**:
  - File `next.config.ts` tự động trích xuất các hostname hợp lệ từ biến môi trường vào `experimental.serverActions.allowedOrigins`, giúp các thao tác trong Admin Panel qua Cloudflare Tunnel được chấp nhận mà không bị lỗi CSRF rejection.
- [x] **Bảo Vệ Tính Toàn Vẹn Giao Dịch & Khóa Lịch Nguyên Tử**:
  - Ràng buộc khóa ngoại `PRAGMA foreign_keys = ON` được kích hoạt trên SQLite.
  - Bảng khóa lịch xe `rental_days` sở hữu Unique Constraint `(vehicle_id, date)` ngăn chặn triệt để tình trạng đặt trùng xe trong cùng một ngày.

---

## 4. Quản Lý Khóa Bí Mật & Môi Trường (Secret Management)

- [x] **Không Rò Rỉ Secret Ra Phía Client**:
  - `PAYLOAD_SECRET` chỉ tồn tại trên Server-side, tuyệt đối không xuất hiện trong các biến `NEXT_PUBLIC_*` hay bundle JavaScript của trình duyệt.
- [x] **Chặn Commit File Nhạy Cảm**:
  - File `.gitignore` đã chặn toàn bộ: `.env`, `.env.local`, `.env.production`, các chứng chỉ Cloudflare (`cert.pem`, `*.json`), cơ sở dữ liệu (`*.db`, `*.db-wal`) và thư mục `backups/`, `logs/`.
- [x] **Xác Thực Cấu Hình Ngay Khi Khởi Động**:
  - Module `scripts/validate-env.mjs` cảnh báo đỏ nếu phát hiện `PAYLOAD_SECRET` ngắn hơn 32 ký tự hoặc sử dụng giá trị mặc định trên môi trường Production.
