# Hướng Dẫn Cấu Hình Cloudflare Tunnel Cho NORI Vehicle Rental

Tài liệu hướng dẫn chi tiết cách đưa website NORI trên Home Server ra Internet thông qua **Cloudflare Tunnel** (công nghệ Zero Trust). Hoàn toàn miễn phí, không cần mở port modem (No Port Forwarding), không cần IP tĩnh công khai (No Public Static IP), tự động có chứng chỉ HTTPS/SSL và chống DDoS toàn diện.

---

## 1. So sánh: Quick Tunnel vs Named Tunnel

| Tiêu chí          | Quick Tunnel (Dùng thử / Demo)                                                                    | Named Tunnel (Chính thức / Production)                                                            |
| :---------------- | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------ |
| **Mục đích**      | Kiểm thử nhanh, demo cho nhóm hoặc khách xem trước                                                | Vận hành chính thức, production lâu dài                                                           |
| **Tên miền**      | Ngẫu nhiên: `https://*.trycloudflare.com`                                                         | Tên miền riêng: `https://nori.yourdomain.com`                                                     |
| **Cấu hình**      | 1 dòng lệnh, không cần tài khoản Cloudflare                                                       | Cần tài khoản Cloudflare & domain trỏ về Cloudflare Nameservers                                   |
| **Tính cố định**  | Đổi URL mỗi khi tắt/bật lại tiến trình                                                            | URL cố định vĩnh viễn, không đổi                                                                  |
| **Script có sẵn** | `deploy/cloudflare/run-quick-tunnel.bat` (Win)<br>`deploy/cloudflare/run-quick-tunnel.sh` (Linux) | `deploy/cloudflare/run-named-tunnel.bat` (Win)<br>`deploy/cloudflare/run-named-tunnel.sh` (Linux) |

---

## 2. Cài Đặt `cloudflared` Trên Máy Chủ

### Trên Windows:

1. Tải file `cloudflared-windows-amd64.exe` từ [trang phát hành chính thức của Cloudflare](https://github.com/cloudflare/cloudflared/releases).
2. Đổi tên thành `cloudflared.exe` và đặt vào thư mục trong `PATH` (ví dụ `C:\Windows\System32` hoặc thư mục dự án `deploy\cloudflare\`).
3. Hoặc cài đặt qua Winget trong PowerShell:
   ```powershell
   winget install Cloudflare.cloudflared
   ```

### Trên Ubuntu Linux:

```bash
# Tải và cài đặt file .deb
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

---

## 3. Cách 1: Chạy Quick Tunnel (1-Click, Không Cần Domain)

1. Đảm bảo ứng dụng NORI đang chạy ở cổng 3000 (`pnpm start:standalone` hoặc `pnpm dev`).
2. Khởi chạy script Quick Tunnel:
   - **Trên Windows**: Nhấp đúp vào `deploy\cloudflare\run-quick-tunnel.bat` hoặc chạy trong PowerShell:
     ```powershell
     .\deploy\cloudflare\run-quick-tunnel.bat
     ```
   - **Trên Linux**:
     ```bash
     bash deploy/cloudflare/run-quick-tunnel.sh
     ```
3. Màn hình console sẽ xuất hiện đường link dạng:
   ```text
   +--------------------------------------------------------------------------------------------+
   |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
   |  https://sweet-autumn-mountain.trycloudflare.com                                           |
   +--------------------------------------------------------------------------------------------+
   ```
4. Cập nhật `APP_URL` trong file `.env.production` bằng đường link trên và khởi động lại server NORI để hệ thống nhận diện đúng Origin.

---

## 4. Cách 2: Cấu Hình Named Tunnel Với Tên Miền Riêng (Production)

Có hai cách thiết lập Named Tunnel:

- **Tùy chọn A (Giao diện Cloudflare Zero Trust Dashboard - Khuyên Dùng)**: Đơn giản nhất, quản lý từ xa.
- **Tùy chọn B (Quản lý qua tệp cấu hình CLI local)**: Phù hợp cho sysadmin muốn lưu file config tại máy chủ.

### Tùy chọn A: Quản Lý Qua Cloudflare Zero Trust Dashboard (Khuyên Dùng)

1. Đăng nhập vào [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Chọn **Networks** → **Tunnels** → Nhấn **Add a tunnel**.
3. Chọn loại **Cloudflare (Recommended)** → Đặt tên tunnel (ví dụ: `nori-home-server`).
4. Tại bước **Install and run a connector**:
   - Chọn hệ điều hành (**Windows** hoặc **Debian/Ubuntu**).
   - Cloudflare sẽ hiển thị một dòng lệnh cài đặt có chứa Token bí mật, ví dụ:
     ```powershell
     cloudflared.exe service install eyJhIjoiYmE5NGEy...
     ```
   - Copy và chạy dòng lệnh đó trên Home Server với quyền Administrator / sudo.
5. Tại bước **Public Hostname Page**:
   - **Subdomain**: Nhập subdomain bạn muốn (ví dụ: `nori` hoặc để trống nếu dùng domain gốc).
   - **Domain**: Chọn tên miền đã trỏ về Cloudflare của bạn (ví dụ: `yourdomain.com`).
   - **Type**: Chọn `HTTP`.
   - **URL**: Nhập `127.0.0.1:3000`.
   - Trong mục **Additional application settings** → **HTTP Settings**:
     - Bật `HTTP2` = On.
     - `No TLS Verify` = Off.
6. Nhấn **Save tunnel**. Trạng thái tunnel sẽ chuyển sang màu xanh lá (**HEALTHY**).
7. Bây giờ bạn có thể truy cập `https://nori.yourdomain.com` từ bất kỳ đâu trên thế giới!

---

### Tùy chọn B: Quản Lý Qua Tệp Cấu Hình Local (`config.yml`)

1. Đăng nhập tài khoản Cloudflare qua CLI:
   ```bash
   cloudflared tunnel login
   ```
   (Trình duyệt sẽ mở ra để bạn xác nhận cấp quyền cho domain).
2. Tạo Tunnel mới:
   ```bash
   cloudflared tunnel create nori-production
   ```
   Lệnh này sẽ tạo ra một file chứng thực `.json` trong thư mục `~/.cloudflared/<TUNNEL_ID>.json`.
3. Trỏ DNS về Tunnel:
   ```bash
   cloudflared tunnel route dns nori-production nori.yourdomain.com
   ```
4. Tạo tệp cấu hình từ mẫu có sẵn:
   Copy file `deploy/cloudflare/config.yml.example` thành `deploy/cloudflare/config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID_CUA_BAN>
   credentials-file: C:\Users\<Username>\.cloudflared\<TUNNEL_ID>.json # hoặc /home/nori/.cloudflared/...

   ingress:
     - hostname: nori.yourdomain.com
       service: http://127.0.0.1:3000
       originRequest:
         connectTimeout: 30s
         noTLSVerify: false
     - service: http_status:404
   ```
5. Khởi chạy Tunnel:
   - **Trên Windows**: `.\deploy\cloudflare\run-named-tunnel.bat`
   - **Trên Linux**: Cài đặt service qua `deploy/linux/cloudflared.service`.

---

## 5. Tự Động Hóa Nhận Diện HTTPS & Bảo Mật Cookie

NORI đã được tích hợp sẵn cơ chế tương thích tuyệt đối với Cloudflare Tunnel:

- Cloudflare gửi kèm header `cf-visitor: {"scheme":"https"}`.
- Module `src/lib/session-cookie.ts` tự động kích hoạt cờ `Secure: true` cho cookie xác thực khách hàng và quản trị viên khi truy cập qua Tunnel.
- Module `src/lib/api-utils.ts` tự động đọc địa chỉ IP thật của người dùng từ header `cf-connecting-ip` để tính toán chính xác Rate Limiting, ngăn chặn giả mạo IP.
- Next.js Server Actions được bảo vệ chống lỗi CSRF thông qua cấu hình `experimental.serverActions.allowedOrigins` trong `next.config.ts`.
