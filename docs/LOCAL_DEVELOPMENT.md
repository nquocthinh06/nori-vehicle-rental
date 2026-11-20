# NORI Vehicle Rental — Hướng Dẫn Phát Triển Cho Thành Viên Nhóm (Local Development)

Tài liệu dành cho lập trình viên và thành viên nhóm khi clone repository về máy tính cá nhân để tham gia phát triển, thử nghiệm và đóng góp mã nguồn cho dự án NORI.

---

## 1. Yêu cầu Môi trường Máy tính

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

- **Hệ điều hành**: Windows 10/11, macOS, hoặc Linux (Ubuntu 22.04+).
- **Node.js**: Phiên bản **v20.x hoặc v22.x** (Khuyến nghị sử dụng LTS mới nhất, dự án hoạt động ổn định từ v20 trở lên).
- **pnpm**: Trình quản lý package chính thức của dự án (phiên bản 9.x hoặc 10.x).
  - Cài đặt pnpm nếu chưa có: `npm install -g pnpm`.
- **Git**: Đã cài đặt và cấu hình thông tin cá nhân (`git config --global user.name` và `user.email`).

---

## 2. Quy trình Cài đặt Dự án (Step-by-Step Setup)

### Bước 1: Clone Repository
```bash
git clone https://github.com/nquocthinh06/nori-vehicle-rental.git
cd nori-vehicle-rental
```

### Bước 2: Cài đặt Dependencies
```bash
pnpm install
```

### Bước 3: Khởi tạo Cấu hình & Dữ liệu Tự động
Dự án cung cấp lệnh thiết lập 1-click giúp tự động:
- Kiểm tra phiên bản Node.js.
- Tạo file `.env` từ `.env.example` với `PAYLOAD_SECRET` bảo mật 32-byte ngẫu nhiên.
- Tạo sẵn các thư mục dữ liệu cần thiết (`data/`, `data/media/`, `backups/`, `logs/`).
- Kiểm tra tính tương thích của cơ sở dữ liệu SQLite.

```bash
pnpm setup
```

### Bước 4: Kiểm tra Cấu hình Môi trường
```bash
pnpm env:check
```
Nếu màn hình hiển thị `[OK] Environment configuration is valid!`, hệ thống đã sẵn sàng.

---

## 3. Khởi chạy Ứng dụng ở Chế độ Development

```bash
pnpm dev
```

- Mở trình duyệt và truy cập: **`http://localhost:3000`**
- Giao diện Admin quản trị: **`http://localhost:3000/dashboard`**
- Trang quản trị Payload CMS: **`http://localhost:3000/admin`**

> **Ghi chú**: Trong quá trình dev, hệ thống tự động Hot-Reload mỗi khi bạn lưu file mã nguồn.

---

## 4. Kiểm thử & Đảm bảo Chất lượng Mã nguồn

Trước khi commit mã nguồn hoặc tạo Pull Request, thành viên nhóm **bắt buộc** phải chạy bộ kiểm tra chất lượng:

```bash
# 1. Kiểm tra cú pháp TypeScript
pnpm typecheck

# 2. Kiểm tra quy chuẩn mã nguồn (ESLint)
pnpm lint

# 3. Chạy toàn bộ 330+ unit/integration tests
pnpm test

# 4. Kiểm tra khả năng build production
pnpm build
```

---

## 5. Quy chuẩn Đóng góp Mã nguồn (Git Contribution Rules)

1. **Không commit trực tiếp vào nhánh `main`**:
   - Luôn tạo nhánh mới từ `main` theo quy ước:
     - Tính năng mới: `feature/ten-tinh-nang`
     - Sửa lỗi: `fix/ten-loi`
     - Tối ưu tài liệu: `docs/noi-dung`
2. **Không commit file dữ liệu thực tế**:
   - Thư mục `data/nori.db`, `data/media/`, `backups/`, `logs/` đã được chặn trong `.gitignore`. Tuyệt đối không force-add các file này vào commit.
3. **Giữ tính toàn vẹn của Payload Collections**:
   - Không tự ý sửa các file trong thư mục `src/app/(payload)/` (đây là thư mục do framework quản lý).
   - Khi sửa đổi schema trong `src/collections/`, hãy tuân thủ nguyên tắc **Additive-Only** (xem chi tiết tại [DATABASE_MIGRATION.md](file:///f:/1.%20University/2.%20%C4%90%E1%BB%93%20%C3%A1n/3.%20B%C3%A0i%20t%E1%BA%ADp/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/DATABASE_MIGRATION.md)).
