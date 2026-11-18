# HƯỚNG DẪN TRIỂN KHAI & PHÂN TÁCH MÔI TRƯỜNG (DEPLOYMENT & ENVIRONMENTS) — NORI VEHICLE RENTAL

## 1. Phân tách 4 Môi trường Chuẩn hóa

| Môi trường               | Cơ sở dữ liệu                                                                  | Media Storage                                                       | Dữ liệu khởi tạo                                                                                 | Mục đích sử dụng                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Local Development** | `./nori.db` cục bộ trên máy từng thành viên                                    | `./media/` cục bộ + `media/seed/`                                   | Import từ `data/snapshots/` (`npm run data:import`)                                              | Phát triển tính năng, cập nhật nội dung mẫu và xuất Snapshot chia sẻ qua GitHub.                                                                    |
| **2. Automated Test**    | `nori-e2e-isolated.db`, `nori-test-isolated.db` hoặc thư mục tạm `os.tmpdir()` | Thư mục media cô lập trong bài kiểm thử                             | Bản sao cô lập hoặc import từ Snapshot, tự động dọn dẹp sau khi chạy xong                        | Chạy Unit Test (`npm test`), Admin Test (`npm run test:admin`) và Playwright E2E (`npm run test:e2e:isolated`) mà **không chạm vào `nori.db` gốc**. |
| **3. Shared Staging**    | SQLite trên Persistent Volume của VPS chung (hoặc PostgreSQL khi mở rộng)      | Persistent Volume `/var/lib/nori/media` (hoặc S3/R2 Object Storage) | Import lần đầu từ Snapshot đã làm sạch; quản lý tài khoản & đơn thử nghiệm tập trung             | Kiểm thử tích hợp nhóm (Member A & B cùng truy cập 1 Backend), UAT và duyệt nội dung trực tiếp.                                                     |
| **4. Production**        | Database thực tế trên ổ đĩa bền vững (Persistent SSD Volume / Managed DB)      | Persistent Media Volume / S3-compatible Storage                     | `NORI_DISABLE_DEMO_SEED=1`; **chặn tự động import Development Snapshot** (`NORI_ENV=production`) | Vận hành thương mại thực tế với Backup định kỳ và kiểm soát quyền truy cập nghiêm ngặt.                                                             |

---

## 2. Triển khai Shared Staging / Production trên Máy chủ VPS (Single-Node Persistent Storage)

Khi triển khai NORI trên một máy chủ VPS (Ubuntu/Debian Linux) dùng chung cho nhóm (Shared Staging) hoặc vận hành thực tế quy mô vừa:

### 2.1. Yêu cầu Hạ tầng Lưu trữ Bền vững (Persistent Directories)

Để dữ liệu và hình ảnh **không bao giờ bị mất khi pull code mới, build lại ứng dụng hoặc khởi động lại container/process**, hãy đặt cơ sở dữ liệu và thư mục media trên phân vùng lưu trữ bền vững bên ngoài thư mục build tạm thời (hoặc gắn symlink/volume):

```bash
sudo mkdir -p /var/lib/nori/data
sudo mkdir -p /var/lib/nori/media
sudo mkdir -p /var/lib/nori/backups
sudo chown -R $USER:$USER /var/lib/nori
```

### 2.2. Cấu hình `.env` trên Máy chủ (Staging / Production)

```env
NODE_ENV=production
# Đặt NORI_ENV=staging cho Shared Staging, hoặc NORI_ENV=production cho Production
NORI_ENV=production

DATABASE_URI=file:/var/lib/nori/data/nori.db
NORI_SQLITE_PATH=/var/lib/nori/data/nori.db

PAYLOAD_SECRET=<chuoi-ngau-nhien-it-nhat-32-ky-tu>
NORI_SESSION_SECRET=<chuoi-ngau-nhien-khac-it-nhat-32-ky-tu>

NEXT_PUBLIC_SITE_URL=https://nori.example.com
PORT=3000

# Bật bằng 1 trên Production thương mại để tắt tự động nạp xe DEMO
NORI_DISABLE_DEMO_SEED=1
```

### 2.3. Liên kết Thư mục Media và Quy trình Build & Rollout An toàn

```bash
# 1. Liên kết thư mục media của ứng dụng tới phân vùng bền vững
ln -sfn /var/lib/nori/media ./media

# 2. Tạo bản sao lưu trước khi cập nhật code
npm run data:backup -- --db /var/lib/nori/data/nori.db --out-dir /var/lib/nori/backups

# 3. Cập nhật source code và cài đặt gói phụ thuộc
git pull origin main
pnpm install --frozen-lockfile

# 4. Chạy migration cập nhật cấu trúc bảng (không làm mất dữ liệu)
npm run db:migrate -- --db /var/lib/nori/data/nori.db

# 5. Build ứng dụng Next.js Standalone
npm run build

# 6. Liên kết thư mục static, public và media vào .next/standalone
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
ln -sfn /var/lib/nori/media .next/standalone/media

# 7. Khởi động lại dịch vụ (systemd / PM2)
NODE_ENV=production PORT=3000 node .next/standalone/server.js
```

---

## 3. Lưu ý Quan trọng về SQLite và Lộ trình Mở rộng (PostgreSQL & S3)

1. **Nguyên tắc an toàn với SQLite**:
   - SQLite hoạt động xuất sắc cho Local Development, Automated Test và Shared Staging / Single-VPS Production khi toàn bộ tiến trình Node.js truy cập trên cùng một ổ đĩa SSD cục bộ.
   - **Tuyệt đối không** đặt file `nori.db` đang hoạt động trên thư mục đồng bộ đám mây (Google Drive, OneDrive, Dropbox) hoặc hệ thống tệp mạng (NFS/SMB) không hỗ trợ khóa tệp POSIX vì sẽ gây hỏng cơ sở dữ liệu (`SQLITE_CORRUPT`).
2. **Khi nào chuyển sang PostgreSQL & S3 Object Storage?**:
   - Khi hệ thống cần chạy **nhiều instance Backend song song (Horizontal Scaling / Load Balancing)** hoặc triển khai trên môi trường Serverless không có ổ đĩa gắn kèm.
   - Khi đó, chỉ cần thay `@payloadcms/db-sqlite` bằng `@payloadcms/db-postgres` trong `src/payload.config.ts` và cấu hình `@payloadcms/plugin-cloud-storage` (đã có sẵn trong `package.json`) kết nối tới AWS S3 / Cloudflare R2.
   - Hệ thống Snapshot (`data/snapshots/*.json`) của NORI sử dụng UUID và định danh nghiệp vụ ổn định (`slug`, `reference`, `code`) thay vì Auto-Increment ID nên hoàn toàn tương thích khi di trú dữ liệu từ SQLite sang PostgreSQL.
