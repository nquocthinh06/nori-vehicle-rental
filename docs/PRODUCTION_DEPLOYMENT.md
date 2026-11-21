# NORI Vehicle Rental — Danh Mục Kiểm Tra & Triển Khai Production (Production Deployment)

Tài liệu quy định quy trình nghiệm thu, danh mục kiểm tra và các bước triển khai ứng dụng NORI lên môi trường **Production (Home Server hoặc VPS)**.

---

## 1. Danh Mục Kiểm Tra Trước Triển Khai (Pre-flight Checklist)

Trước khi kích hoạt trạng thái phục vụ công khai, quản trị viên bắt buộc phải kiểm tra và xác nhận các tiêu chí sau:

- [ ] **Môi trường & Biến cấu hình**:
  - `NODE_ENV` đã đặt thành `production`.
  - `PAYLOAD_SECRET` là một chuỗi ngẫu nhiên bảo mật cao (ít nhất 32 ký tự), không dùng chuỗi mặc định.
  - `APP_URL` khớp chính xác với tên miền công khai (ví dụ: `https://nori.yourdomain.com`).
  - Lệnh `pnpm env:check` vượt qua mà không có bất kỳ cảnh báo đỏ nào.
- [ ] **Tách biệt Dữ liệu Bền vững**:
  - `DATABASE_URL` trỏ vào file SQLite nằm trong thư mục lưu trữ độc lập (`data/nori.db` hoặc đường dẫn ngoài source code).
  - Thư mục `media/`, `backups/`, `logs/` có quyền ghi (writeable) cho tiến trình Node.js.
- [ ] **Kiểm thử & Chất lượng Code**:
  - Chạy `pnpm typecheck` đạt 0 lỗi TypeScript.
  - Chạy `pnpm lint` đạt 0 cảnh báo vi phạm.
  - Chạy `pnpm test` vượt qua toàn bộ 330+ unit & integration test suites.
- [ ] **Bản Build Standalone**:
  - Lệnh `pnpm build` kết thúc thành công với mã thoát 0.
  - Thư mục `.next/standalone` tồn tại và đầy đủ tệp tĩnh.
- [ ] **Định tuyến & Bảo mật Reverse Proxy**:
  - Đã cấu hình Cloudflare Tunnel hoặc Nginx trỏ về `http://127.0.0.1:3000`.
  - Cookie xác thực được thiết lập thuộc tính `HttpOnly; Secure; SameSite=Lax`.
  - Endpoint `/nori-api/health?type=deep` trả về HTTP 200 kèm `status: "healthy"`.

---

## 2. Quy Trình Triển Khai Lần Đầu Tiên (First-Time Deployment)

### Bước 1: Chuẩn bị Thư mục & Clone Source Code

```bash
git clone https://github.com/nquocthinh06/nori-vehicle-rental.git nori-app
cd nori-app
pnpm install
```

### Bước 2: Thiết lập File Môi trường

Tạo file `.env.production` và điền thông số chính xác:

```bash
cp .env.example .env.production
# Sử dụng công cụ soạn thảo để điền PAYLOAD_SECRET, APP_URL, DATABASE_URL...
pnpm env:check
```

### Bước 3: Di chuyển & Xác minh Schema Cơ sở Dữ liệu

```bash
pnpm db:check
pnpm db:migrate:safe
```

### Bước 4: Tạo Bản Build Production Tối Ưu

```bash
pnpm build
```

### Bước 5: Khởi Chạy Dịch Vụ

- **Trên Windows**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\deploy\windows\install-service.ps1
  ```
- **Trên Ubuntu Linux**:
  ```bash
  sudo cp deploy/linux/nori.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now nori.service
  ```

### Bước 6: Khởi Chạy Cloudflare Tunnel

- Kết nối Named Tunnel trỏ về `http://127.0.0.1:3000` (xem chi tiết tại [CLOUDFLARE_TUNNEL.md](file:///f:/1.%20University/2.%20%C4%90%E1%BB%93%20%C3%A1n/3.%20B%C3%A0i%20t%E1%BA%ADp/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/docs/CLOUDFLARE_TUNNEL.md)).

---

## 3. Nghiệm Thu & Kiểm Tra Sau Triển Khai (Post-Deployment Verification)

Sau khi dịch vụ khởi chạy, thực hiện các bước kiểm tra thực tế:

1. **Kiểm tra Healthcheck API**:
   ```bash
   pnpm healthcheck
   # Hoặc kiểm tra qua curl
   curl -I https://nori.yourdomain.com/nori-api/health
   ```
2. **Kiểm tra Giao diện Khách hàng**:
   - Truy cập trang chủ: Tải nhanh, hiển thị đầy đủ xe và danh mục.
   - Thử nghiệm tìm kiếm và bộ lọc xe theo giá, hãng, số chỗ.
   - Thử nghiệm đăng ký/đăng nhập tài khoản khách hàng.
3. **Kiểm tra Quy trình Đặt xe**:
   - Chọn 1 xe còn trống, nhập ngày thuê và kiểm tra tính toán chi phí (phụ phí, cọc).
   - Xác nhận đơn đặt xe, kiểm tra đơn xuất hiện tại trang `/my-bookings`.
4. **Kiểm tra Trung tâm Quản trị (`/dashboard`)**:
   - Đăng nhập tài khoản quản trị viên.
   - Kiểm tra xem đơn hàng vừa tạo có xuất hiện trong danh sách `/dashboard/bookings` không.
   - Thử nghiệm duyệt đơn và kiểm tra lịch xe tự động khóa ngày.
5. **Kiểm tra Tải ảnh & Media**:
   - Tải lên 1 ảnh mới trong Payload Admin (`/admin`).
   - Kiểm tra ảnh hiển thị đúng trên trang sản phẩm và tệp được lưu vào `MEDIA_DIR`.
