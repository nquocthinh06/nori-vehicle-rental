# NORI Vehicle Rental — Triển Khai Home Server Trên Windows (Windows 10/11)

Hướng dẫn chi tiết biến một chiếc máy tính cá nhân chạy Windows 10 hoặc Windows 11 không dùng đến thành một **Home Server** hoạt động ổn định 24/7, tự động chạy khi bật máy, chống ngủ (sleep prevention) và tích hợp sẵn Cloudflare Tunnel.

---

## 1. Chuẩn bị Hệ thống Windows

### 1.1. Cấu hình Chống Ngủ (Prevent Sleep Mode)
Để Home Server không bị ngắt quãng kết nối khi không có người tương tác:
1. Mở **Settings** → **System** → **Power & sleep**.
2. Tại mục **Sleep**:
   - Chọn **Never** (Khi cắm nguồn) cho cả Screen và Sleep.
3. Mở **Control Panel** → **Power Options** → chọn **High performance** (hoặc nhấn **Change plan settings** → **Change advanced power settings** → đặt **Sleep after** = `Never`).
4. (Nếu là Laptop): Trong **Power Options** → **Choose what closing the lid does** → chọn **Do nothing** khi gập màn hình.

### 1.2. Cài đặt Môi trường Thực thi
- Cài đặt **Node.js LTS** (v20 hoặc v22) từ trang chủ [nodejs.org](https://nodejs.org/).
- Cài đặt **pnpm**:
  ```powershell
  npm install -g pnpm
  ```
- Cài đặt **Git for Windows**.

---

## 2. Thiết lập Thư mục Dữ liệu Độc lập (Persistent Storage)

Tạo thư mục dữ liệu nằm ngoài source code (ví dụ tại `C:\NORI`):

```powershell
New-Item -ItemType Directory -Path "C:\NORI\data\media" -Force
New-Item -ItemType Directory -Path "C:\NORI\backups" -Force
New-Item -ItemType Directory -Path "C:\NORI\logs" -Force
```

---

## 3. Clone Mã Nguồn & Cấu hình Production

```powershell
cd C:\NORI
git clone https://github.com/nquocthinh06/nori-vehicle-rental.git app
cd C:\NORI\app

# Cài đặt thư viện
pnpm install

# Tạo file .env.production
Copy-Item .env.example .env.production
```

Mở `.env.production` và điền cấu hình Production:
```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
APP_URL=https://nori.yourdomain.com
ALLOWED_ORIGINS=https://nori.yourdomain.com,http://127.0.0.1:3000
PAYLOAD_SECRET=dien-chuoi-bi-mat-ngau-nhien-it-nhat-32-ky-tu-o-day
DATABASE_URL=file:C:/NORI/data/nori.db
DATA_DIR=C:/NORI/data
MEDIA_DIR=C:/NORI/data/media
BACKUP_DIR=C:/NORI/backups
LOG_DIR=C:/NORI/logs
TRUST_PROXY=true
```

Build ứng dụng sang phiên bản Standalone tối ưu:
```powershell
pnpm build
```

---

## 4. Vận hành Bằng Script Tự Động (`deploy/windows/`)

Dự án cung cấp đầy đủ các script PowerShell phục vụ việc quản lý tiến trình:

### 4.1. Khởi động / Dừng Server thủ công
```powershell
# Khởi động server trong background (lưu log ra C:\NORI\logs)
.\deploy\windows\start-nori.ps1

# Dừng server
.\deploy\windows\stop-nori.ps1
```

### 4.2. Sao lưu và Khôi phục
```powershell
# Tạo bản sao lưu hot backup SQLite + Media
.\deploy\windows\backup.ps1

# Khôi phục từ bản sao lưu gần nhất
.\deploy\windows\restore.ps1
```

### 4.3. Cập nhật Code mới từ GitHub không gián đoạn
Khi bạn push code mới lên GitHub từ máy tính chính, trên Home Server chỉ cần chạy:
```powershell
.\deploy\windows\update.ps1
```
Script sẽ tự động:
1. Tạo backup cơ sở dữ liệu hiện tại để phòng ngừa rủi ro.
2. Kéo code mới nhất từ GitHub (`git pull`).
3. Cài đặt dependencies mới (nếu có).
4. Thực thi database migrations tự động (`pnpm db:migrate:safe`).
5. Build lại Next.js Standalone.
6. Khởi động lại tiến trình server mượt mà.

---

## 5. Tự động Khởi Chạy Khi Bật Máy (Windows Service / Task Scheduler)

Để NORI tự động chạy mỗi khi Windows khởi động mà không cần người dùng đăng nhập:

Mở PowerShell với quyền **Run as Administrator** và chạy:
```powershell
cd C:\NORI\app
powershell -ExecutionPolicy Bypass -File .\deploy\windows\install-service.ps1
```

Script sẽ tạo một **Scheduled Task** mang tên `NORI_Vehicle_Rental_Server`:
- Chạy dưới quyền `SYSTEM` hoặc tài khoản dịch vụ.
- Tự động kích hoạt khi hệ thống khởi động (`AtStartup`).
- Tự động khởi động lại nếu tiến trình gặp sự cố bất ngờ.
- Ghi toàn bộ output và lỗi vào `C:\NORI\logs\nori-service.log`.

Để gỡ bỏ Task tự khởi động khi không dùng nữa:
```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\install-service.ps1 -Uninstall
```
