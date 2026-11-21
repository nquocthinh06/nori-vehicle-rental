# NORI Vehicle Rental — Từ Điển Cấu Hình Môi Trường (Environment Configuration)

Tài liệu quy định và chuẩn hóa toàn bộ các biến môi trường của dự án NORI, phục vụ việc vận hành thống nhất giữa các môi trường Local Development, Team Testing, Home Server và Cloudflare Tunnel.

---

## 1. Nguyên tắc Quản lý Biến Môi trường

1. **Không commit secret lên Git**: File `.env` chứa mật khẩu, secret key, token không bao giờ được commit lên repository (đã được cấu hình trong `.gitignore`).
2. **Thống nhất qua `src/lib/env.ts`**: Toàn bộ mã nguồn Server-side chỉ đọc cấu hình thông qua module `src/lib/env.ts` hoặc các hàm helper được cung cấp, không đọc trực tiếp rải rác `process.env`.
3. **Phân tách Server-side và Client-side**:
   - Biến Server-side: Tuyệt đối không có tiền tố `NEXT_PUBLIC_`.
   - Biến Client-side: Chỉ sử dụng tiền tố `NEXT_PUBLIC_` cho thông tin công khai không nhạy cảm (như URL trang web).
4. **Kiểm tra tự động khi khởi động**: Chạy `pnpm env:check` (hoặc `node scripts/validate-env.mjs`) trước khi build hoặc start server. Nếu thiếu biến bắt buộc, tiến trình sẽ báo lỗi chi tiết và dừng ngay lập tức.

---

## 2. Bảng Danh Mục Biến Môi Trường Chi Tiết

| Tên biến                        | Kiểu giá trị         | Bắt buộc (Prod) | Giá trị mặc định                     | Phạm vi         | Mô tả & Hướng dẫn sử dụng                                                                                                                                                                           |
| :------------------------------ | :------------------- | :-------------- | :----------------------------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | String               | Không           | `development`                        | Server          | Chế độ chạy: `development`, `test`, hoặc `production`.                                                                                                                                              |
| `HOST`                          | String               | Không           | `0.0.0.0` (Prod) / `127.0.0.1` (Dev) | Server          | Địa chỉ IP máy chủ lắng nghe. Trong production / standalone, sử dụng `0.0.0.0` để nhận traffic từ localhost và tunnel daemon.                                                                       |
| `PORT`                          | Number               | Không           | `3000`                               | Server          | Cổng HTTP lắng nghe của ứng dụng Next.js.                                                                                                                                                           |
| `APP_URL`                       | URL String           | **Có**          | `http://localhost:3000`              | Server          | URL gốc chính thức của ứng dụng. Ví dụ: `https://nori.yourdomain.com` hoặc `https://abc-xyz.trycloudflare.com`. Dùng để kiểm tra Origin, cấu hình Server Actions và gửi link trong email/thông báo. |
| `NEXT_PUBLIC_SITE_URL`          | URL String           | Không           | Giá trị của `APP_URL`                | Client & Server | URL công khai của trang web, cung cấp cho Next.js Metadata, OpenGraph và Sitemap.                                                                                                                   |
| `NEXT_PUBLIC_APP_URL`           | URL String           | Không           | Giá trị của `APP_URL`                | Client & Server | Alias tương thích cho các Client Component khi gọi API qua URL tuyệt đối.                                                                                                                           |
| `PAYLOAD_SECRET`                | String (>=32 chars)  | **Có**          | Tự động cảnh báo nếu dùng default    | Server          | Khóa bảo mật mật mã dùng cho Payload CMS để băm mật khẩu, mã hóa token session. Bắt buộc phải là chuỗi ngẫu nhiên bảo mật cao trong Production.                                                     |
| `DATABASE_URL` / `DATABASE_URI` | SQLite URI String    | Không           | `file:./data/nori.db`                | Server          | Chuỗi kết nối SQLite. Hỗ trợ đường dẫn tương đối (`file:./data/nori.db`) hoặc đường dẫn tuyệt đối đa nền tảng (`file:C:/NORI/data/nori.db` hoặc `file:/var/lib/nori/nori.db`).                      |
| `DATA_DIR`                      | Path String          | Không           | `./data`                             | Server          | Thư mục chứa dữ liệu runtime chung.                                                                                                                                                                 |
| `MEDIA_DIR`                     | Path String          | Không           | `./data/media`                       | Server          | Thư mục lưu trữ hình ảnh tải lên của phương tiện, tài liệu, banner.                                                                                                                                 |
| `BACKUP_DIR`                    | Path String          | Không           | `./backups`                          | Server          | Thư mục lưu trữ các bản sao lưu SQLite (`.db`) và backup bundle (`media/`, manifest).                                                                                                               |
| `LOG_DIR`                       | Path String          | Không           | `./logs`                             | Server          | Thư mục lưu trữ tệp nhật ký vận hành hàng ngày của hệ thống.                                                                                                                                        |
| `ALLOWED_ORIGINS`               | Comma-separated URLs | Không           | Tự động suy ra từ `APP_URL`          | Server          | Danh sách các Origin được phép gửi request API và Server Actions (phân cách bằng dấu phẩy). Ví dụ: `https://nori.yourdomain.com,http://192.168.1.100:3000`.                                         |
| `TRUST_PROXY`                   | Boolean String       | Không           | `true`                               | Server          | Bật chế độ tin cậy Reverse Proxy / Cloudflare để đọc chính xác IP từ `cf-connecting-ip` và `x-forwarded-for`. Giá trị: `true` hoặc `false`.                                                         |

---

## 3. Mẫu Cấu Hình Theo Từng Môi Trường

### 3.1. Local Development (`.env.local` hoặc `.env`)

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
APP_URL=http://localhost:3000
PAYLOAD_SECRET=dev-nori-local-secret-key-32chars-min-ok
DATABASE_URL=file:./data/nori.db
DATA_DIR=./data
MEDIA_DIR=./data/media
BACKUP_DIR=./backups
LOG_DIR=./logs
TRUST_PROXY=false
```

### 3.2. Mạng Nội Bộ LAN (`.env.production` trên Home Server LAN)

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=http://192.168.1.50:3000
ALLOWED_ORIGINS=http://192.168.1.50:3000,http://localhost:3000
PAYLOAD_SECRET=f9a8b7c6d5e4f3a2b1c0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8
DATABASE_URL=file:./data/nori.db
DATA_DIR=./data
MEDIA_DIR=./data/media
BACKUP_DIR=./backups
LOG_DIR=./logs
TRUST_PROXY=false
```

### 3.3. Cloudflare Quick Tunnel (Môi trường Demo / Staging)

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
# Lưu ý: APP_URL lấy từ domain ngẫu nhiên do Cloudflare cấp khi chạy quick tunnel
APP_URL=https://temporary-subdomain.trycloudflare.com
ALLOWED_ORIGINS=https://temporary-subdomain.trycloudflare.com,http://127.0.0.1:3000
PAYLOAD_SECRET=f9a8b7c6d5e4f3a2b1c0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8
DATABASE_URL=file:./data/nori.db
DATA_DIR=./data
MEDIA_DIR=./data/media
BACKUP_DIR=./backups
LOG_DIR=./logs
TRUST_PROXY=true
```

### 3.4. Cloudflare Named Tunnel (Home Server Production Chính thức)

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=https://nori.yourdomain.com
ALLOWED_ORIGINS=https://nori.yourdomain.com,http://127.0.0.1:3000
PAYLOAD_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
DATABASE_URL=file:C:/NORI/data/nori.db
DATA_DIR=C:/NORI/data
MEDIA_DIR=C:/NORI/data/media
BACKUP_DIR=C:/NORI/backups
LOG_DIR=C:/NORI/logs
TRUST_PROXY=true
```

---

## 4. Công Cụ Kiểm Tra & Khởi Tạo Môi Trường Tự Động

Dự án cung cấp sẵn hai script hỗ trợ chuẩn hóa môi trường:

```bash
# 1. Tự động sinh file .env với secret an toàn 32 byte nếu chưa có
pnpm setup

# 2. Kiểm tra tính hợp lệ của toàn bộ biến môi trường hiện tại
pnpm env:check
```
