# NORI Vehicle Rental — Hướng Dẫn Di Chuyển Máy Chủ (Server Migration Playbook)

Tài liệu cung cấp cẩm nang chi tiết từng bước để di chuyển toàn bộ hệ thống NORI (Bao gồm mã nguồn, cơ sở dữ liệu SQLite, tệp hình ảnh media và cấu hình) từ máy tính này sang máy tính khác, hoặc từ **Home Server lên VPS / Dedicated Server** mà không gây mất mát dữ liệu hoặc gián đoạn dịch vụ kéo dài.

---

## 1. Nguyên Tắc Cốt Lõi Khi Di Chuyển (Zero Data Loss)

1. **Khóa tạm thời hoạt động ghi nếu cần**: Để tránh phát sinh đơn hàng mới trong lúc đang copy dữ liệu, có thể thông báo bảo trì trong 5 phút.
2. **Sử dụng Backup Bundle chuẩn hóa**: Dữ liệu di chuyển bao gồm tệp SQLite đã chạy `VACUUM INTO` và toàn bộ thư mục `media/`, kèm mã băm SHA-256 đối soát.
3. **Không phụ thuộc đường dẫn tuyệt đối**: Hệ thống NORI sử dụng biến môi trường linh hoạt, cho phép máy chủ mới có cấu trúc thư mục hoàn toàn khác máy chủ cũ.
4. **Chuyển hướng Cloudflare Tunnel tức thì**: Khi máy chủ mới đã khởi chạy và kiểm tra thành công, chỉ cần cập nhật điểm kết nối trên Cloudflare Zero Trust Dashboard, tên miền sẽ trỏ ngay sang máy chủ mới mà không cần chờ thời gian truyền tải DNS (Zero DNS Propagation Delay).

---

## 2. Quy Trình Di Chuyển Chi Tiết 5 Bước

### Bước 1: Tạo Bản Sao Lưu Hoàn Chỉnh Tại Máy Chủ Cũ

Tại máy chủ nguồn (Home Server hiện tại):

```bash
# Tạo backup bundle đầy đủ với cơ chế VACUUM an toàn
pnpm backup
```

Bản sao lưu sẽ được tạo tại thư mục `backups/nori-backup-<timestamp>/`:

- `nori.db`: Cơ sở dữ liệu SQLite đã được nén và nhất quán giao dịch.
- `media/`: Toàn bộ tệp ảnh xe, hợp đồng, tài liệu.
- `backup-manifest.json`: Chứa mã kiểm tra tính toàn vẹn SHA-256.

Nén gói sao lưu thành file zip:

- **Windows**: `Compress-Archive -Path backups\nori-backup-* -DestinationPath C:\NORI-transfer-bundle.zip`
- **Linux**: `tar -czvf nori-transfer-bundle.tar.gz backups/nori-backup-*/`

---

### Bước 2: Chuẩn Bị Máy Chủ Đích (Target Machine / VPS)

1. Cài đặt Node.js LTS (v20+), pnpm và Git trên máy chủ mới.
2. Clone repository mã nguồn:
   ```bash
   git clone https://github.com/nquocthinh06/nori-vehicle-rental.git /opt/nori/app
   cd /opt/nori/app
   pnpm install
   ```
3. Tạo thư mục dữ liệu trên máy chủ mới:
   ```bash
   mkdir -p /var/lib/nori/media
   mkdir -p /var/backups/nori
   mkdir -p /var/log/nori
   ```

---

### Bước 3: Chuyển Dữ Liệu Sang Máy Chủ Mới

Chuyển file nén sang máy chủ mới bằng `scp`, `rsync`, USB hoặc công cụ truyền file an toàn:

```bash
# Ví dụ sử dụng scp từ máy tính sang VPS
scp nori-transfer-bundle.tar.gz user@target-server:/tmp/
```

Giải nén và khôi phục vào máy chủ mới:

```bash
cd /opt/nori/app
# Khôi phục cơ sở dữ liệu và media tự động
pnpm restore --source /tmp/nori-backup-<timestamp>
```

---

### Bước 4: Cấu Hình Môi Trường & Build Trên Máy Chủ Mới

Tạo file `.env.production` trên máy chủ mới:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_URL=https://nori.yourdomain.com
PAYLOAD_SECRET=giu-nguyen-payload-secret-tu-may-chu-cu
DATABASE_URL=file:/var/lib/nori/nori.db
DATA_DIR=/var/lib/nori
MEDIA_DIR=/var/lib/nori/media
BACKUP_DIR=/var/backups/nori
LOG_DIR=/var/log/nori
TRUST_PROXY=true
```

> **Cực kỳ quan trọng**: Giữ nguyên giá trị `PAYLOAD_SECRET` từ máy chủ cũ để đảm bảo tất cả mật khẩu và token người dùng hiện có vẫn giải mã và xác thực được bình thường.

Build và chạy thử:

```bash
pnpm build
pnpm healthcheck
```

---

### Bước 5: Chuyển Hướng Lưu Lượng Trên Cloudflare Tunnel

1. Truy cập **Cloudflare Zero Trust Dashboard** → **Networks** → **Tunnels**.
2. Chọn tunnel của bạn:
   - Nếu bạn chuyển cài đặt connector sang máy chủ mới: Copy lệnh connector của Cloudflare chạy trên máy chủ mới và tắt connector trên máy chủ cũ.
   - Nếu bạn dùng Cloudflare Dashboard: Chỉ cần cập nhật Hostname URL hoặc trỏ tunnel mới vào tên miền `nori.yourdomain.com`.
3. Lưu lại cấu hình. Toàn bộ người dùng trên Internet sẽ được chuyển mượt mà sang máy chủ mới mà không bị lỗi gián đoạn!
