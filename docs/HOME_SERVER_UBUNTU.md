# NORI Vehicle Rental — Triển Khai Home Server Trên Ubuntu Linux

Hướng dẫn chi tiết cài đặt và cấu hình NORI trên **Ubuntu Server 22.04 / 24.04 LTS** (hoặc Debian), sử dụng **systemd** để quản lý tiến trình tự động chạy nền và cấu hình tường lửa UFW tối ưu.

---

## 1. Chuẩn bị Môi trường Ubuntu

Cập nhật hệ điều hành và cài đặt các gói cần thiết:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential
```

Cài đặt **Node.js LTS (v20.x hoặc v22.x)** và **pnpm**:

```bash
# Cài đặt Node.js qua NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Cài đặt pnpm
sudo npm install -g pnpm
```

---

## 2. Thiết lập Thư mục Dữ liệu & Người Dùng Dịch Vụ

Tạo người dùng hệ thống riêng biệt `nori` không có quyền shell để tăng cường bảo mật:

```bash
sudo useradd -r -s /bin/false -d /var/lib/nori nori
```

Tạo các thư mục dữ liệu bền vững:

```bash
sudo mkdir -p /opt/nori/app
sudo mkdir -p /var/lib/nori/media
sudo mkdir -p /var/backups/nori
sudo mkdir -p /var/log/nori

# Cấp quyền cho user nori
sudo chown -R nori:nori /opt/nori
sudo chown -R nori:nori /var/lib/nori
sudo chown -R nori:nori /var/backups/nori
sudo chown -R nori:nori /var/log/nori
```

---

## 3. Cài Đặt Ứng Dụng & Cấu Hình Production

Clone mã nguồn về thư mục `/opt/nori/app`:

```bash
sudo git clone https://github.com/nquocthinh06/nori-vehicle-rental.git /opt/nori/app
cd /opt/nori/app

# Cài đặt dependencies
sudo pnpm install

# Tạo file cấu hình môi trường
sudo cp .env.example .env.production
```

Chỉnh sửa `/opt/nori/app/.env.production`:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_URL=https://nori.yourdomain.com
ALLOWED_ORIGINS=https://nori.yourdomain.com,http://127.0.0.1:3000
PAYLOAD_SECRET=chuoi-bi-mat-ngau-nhien-32-ky-tu-chuan-production
DATABASE_URL=file:/var/lib/nori/nori.db
DATA_DIR=/var/lib/nori
MEDIA_DIR=/var/lib/nori/media
BACKUP_DIR=/var/backups/nori
LOG_DIR=/var/log/nori
TRUST_PROXY=true
```

Build ứng dụng sang phiên bản Standalone:

```bash
sudo pnpm build
sudo chown -R nori:nori /opt/nori/app
```

---

## 4. Quản lý Dịch vụ qua Systemd (`deploy/linux/nori.service`)

Dự án cung cấp sẵn tệp cấu hình systemd unit tại `deploy/linux/nori.service`.

Cài đặt service vào hệ thống:

```bash
sudo cp deploy/linux/nori.service /etc/systemd/system/nori.service
sudo systemctl daemon-reload

# Kích hoạt tự khởi chạy khi bật máy
sudo systemctl enable nori.service

# Khởi động dịch vụ ngay
sudo systemctl start nori.service

# Kiểm tra trạng thái
sudo systemctl status nori.service
```

Xem nhật ký thời gian thực qua `journalctl`:

```bash
sudo journalctl -u nori.service -f
```

---

## 5. Cấu hình Tường Lửa (UFW Firewall)

Vì ứng dụng được định tuyến an toàn thông qua Cloudflare Tunnel, **bạn không cần mở port 3000 ra ngoài Internet**:

```bash
# Cho phép SSH để quản trị máy chủ
sudo ufw allow ssh

# (Tùy chọn) Cho phép truy cập cổng 3000 từ mạng nội bộ LAN
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp

# Bật tường lửa
sudo ufw enable
sudo ufw status
```

---

## 6. Quy trình Tự Động Cập Nhật (`deploy/linux/update.sh`)

Mỗi khi có cập nhật mới từ GitHub:

```bash
cd /opt/nori/app
sudo bash deploy/linux/update.sh
```

Script sẽ tự động sao lưu dữ liệu, kéo code mới, migrate database, build lại và reload systemd service mà không gây downtime dài.
