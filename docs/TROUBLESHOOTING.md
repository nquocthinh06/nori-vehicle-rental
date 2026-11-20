# NORI Vehicle Rental — Cẩm Nang Xử Lý Sự Cố (Troubleshooting Guide)

Tài liệu tập hợp các vấn đề thường gặp trong quá trình vận hành NORI trên Home Server, mạng LAN và Cloudflare Tunnel, kèm theo nguyên nhân gốc rễ và hướng dẫn khắc phục nhanh chóng.

---

## 1. Sự Cố Cơ Sở Dữ Liệu SQLite

### Vấn đề 1: Lỗi `SQLITE_BUSY: database is locked`
- **Nguyên nhân**:
  1. Cơ sở dữ liệu đang bị khóa bởi một tiến trình khác (ví dụ: đang mở bằng công cụ DB Browser for SQLite hoặc một script chạy ngầm).
  2. Chưa kích hoạt chế độ WAL hoặc `busy_timeout` quá thấp.
- **Cách khắc phục**:
  1. Kiểm tra và tắt các phần mềm quản trị database đang mở trực tiếp file `nori.db`.
  2. Đảm bảo cấu hình trong `src/payload.config.ts` có dòng `PRAGMA journal_mode = WAL;` và `PRAGMA busy_timeout = 10000;`.
  3. Kiểm tra xem có file `-shm` hoặc `-wal` bị treo không. Nếu server đã tắt hoàn toàn, bạn có thể xóa các file `-shm` và `-wal` rồi khởi động lại server.

### Vấn đề 2: Lỗi `SQLITE_ERROR: no such column` sau khi cập nhật code
- **Nguyên nhân**: Mã nguồn mới có thêm các trường mới trong Payload Schema nhưng chưa áp dụng database migrations.
- **Cách khắc phục**:
  Chạy lệnh cập nhật an toàn:
  ```bash
  pnpm db:migrate:safe
  ```

---

## 2. Sự Cố Kết Nối Cloudflare Tunnel

### Vấn đề 1: Trình duyệt báo lỗi `502 Bad Gateway` hoặc `504 Gateway Timeout`
- **Nguyên nhân**:
  1. Ứng dụng Next.js trên Home Server chưa được khởi động hoặc đã bị crash.
  2. Tunnel đang trỏ sai cổng nội bộ (ví dụ cấu hình trỏ vào port 8080 trong khi Next.js chạy port 3000).
- **Cách khắc phục**:
  1. Kiểm tra ứng dụng có phản hồi nội bộ không:
     ```bash
     curl -I http://127.0.0.1:3000/nori-api/health
     ```
  2. Nếu ứng dụng chưa chạy, khởi động lại:
     - Trên Windows: `.\deploy\windows\start-nori.ps1`
     - Trên Linux: `sudo systemctl restart nori.service`
  3. Kiểm tra lại cấu hình cổng trong tệp `config.yml` hoặc trên Cloudflare Dashboard (phải là `http://127.0.0.1:3000`).

### Vấn đề 2: Đăng nhập Admin hoặc gọi Server Action bị lỗi `Invalid Server Actions request` / 403 Forbidden
- **Nguyên nhân**: Next.js chặn request do Host header từ Cloudflare Tunnel không nằm trong danh sách `allowedOrigins`.
- **Cách khắc phục**:
  1. Mở file `.env.production`.
  2. Cập nhật biến `APP_URL` và `ALLOWED_ORIGINS` chứa chính xác tên miền của bạn (ví dụ: `APP_URL=https://nori.yourdomain.com`).
  3. Khởi động lại server để Next.js nạp cấu hình mới.

### Vấn đề 3: Khách hàng hoặc Admin bị văng đăng nhập liên tục khi truy cập qua Tunnel
- **Nguyên nhân**: Cookie phiên bị từ chối do trình duyệt yêu cầu kênh HTTPS nhưng server lại phát cookie dạng không an toàn (`Secure=false`), hoặc ngược lại.
- **Cách khắc phục**:
  1. Kiểm tra header chuyển tiếp từ Cloudflare: Đảm bảo SSL trên Cloudflare Dashboard đặt ở chế độ **Full** hoặc **Flexible**.
  2. Đảm bảo biến `TRUST_PROXY=true` trong file `.env.production`.
  3. Module `src/lib/session-cookie.ts` sẽ tự động đọc header `cf-visitor` để bật cờ `Secure: true` đồng bộ với HTTPS.

---

## 3. Sự Cố Tiến Trình & Môi Trường

### Vấn đề 1: Lỗi `Port 3000 is already in use` (EADDRINUSE)
- **Nguyên nhân**: Có một phiên bản Node.js cũ đang chạy ngầm và chiếm cổng 3000.
- **Cách khắc phục**:
  - **Trên Windows**:
    ```powershell
    # Tìm tiến trình đang chiếm cổng 3000
    Get-NetTCPConnection -LocalPort 3000 | Format-Table OwningProcess
    # Dừng tiến trình cũ
    Stop-Process -Id <ProcessId> -Force
    ```
  - **Trên Linux**:
    ```bash
    sudo fuser -k 3000/tcp
    ```

### Vấn đề 2: Lệnh `pnpm env:check` báo đỏ `Missing required environment variable: PAYLOAD_SECRET`
- **Nguyên nhân**: File `.env` chưa được tạo hoặc chưa có khóa bảo mật.
- **Cách khắc phục**:
  Chạy lệnh khởi tạo tự động:
  ```bash
  pnpm setup
  ```
  Lệnh này sẽ tự động tạo file `.env` kèm theo chuỗi bí mật ngẫu nhiên đạt chuẩn an toàn 32 byte.
