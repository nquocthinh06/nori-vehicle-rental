# TÍCH HỢP NEON POSTGRESQL & BÁO CÁO MIGRATION DỮ LIỆU — DỰ ÁN NORI

## 1. Tổng quan tích hợp

Hệ thống **NORI Vehicle Rental** đã tích hợp thành công cơ sở dữ liệu dùng chung **Neon Serverless PostgreSQL** cho nhánh môi trường **Staging**, đồng thời duy trì khả năng fallback cục bộ hoàn toàn với **SQLite** (`nori.db`) phục vụ phát triển offline và kiểm thử cô lập (isolated tests).

- **Neon Project**: `nori-vehicle-rental` (`red-cake-81594322`)
- **Neon Branch**: `staging` (Nhánh `production` được bảo vệ tuyệt đối, chưa tác động)
- **Database Engine**: PostgreSQL 16+ với SSL/TLS (`sslmode=require`)
- **Payload Database Adapter**: `@payloadcms/db-postgres@4.0.0-beta.8` (tương thích tuyệt đối với Payload CMS core)
- **Postgres Migrations**: Quản lý độc lập tại `src/migrations-postgres/` (tách biệt hoàn toàn khỏi SQLite migrations cũ)

---

## 2. Kiến trúc Dual-Adapter (Dynamic Adapter Switching)

Trong `src/payload.config.ts`, hệ thống tự động nhận diện giao thức chuỗi kết nối:

```typescript
const dbUrl = (process.env.DATABASE_URL || process.env.DATABASE_URI || '').trim()
const isPostgres = dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:')

const dbAdapter = isPostgres
  ? postgresAdapter({
      pool: {
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
      },
      idType: 'uuid',
      push: true,
      migrationDir: path.resolve(dirname, 'migrations-postgres'),
    })
  : sqliteAdapter({
      idType: 'uuid',
      push: false,
      wal: { synchronous: 'NORMAL' },
      busyTimeout: 5000,
      client: {
        url: dbUrl || toSqliteUri(resolveSqlitePath(path.resolve(dirname, '..'))),
      },
    })
```

- **Khi kết nối Neon Staging**: Hệ thống khởi tạo `postgresAdapter` với UUID primary keys, connection pooling và native SSL.
- **Khi làm việc offline hoặc chạy Unit/E2E test**: Hệ thống tự động chuyển về `sqliteAdapter`, đảm bảo kiểm thử chạy nhanh, độc lập mạng và chi phí 0đ.

---

## 3. Kết quả đối chiếu toàn vẹn dữ liệu (Data Reconciliation Audit)

Toán bộ dữ liệu phát triển và nghiệp vụ đã được chuyển đổi an toàn từ SQLite `nori.db` sang Neon Staging thông qua script giao dịch nguyên tử (`scripts/migrate-sqlite-to-neon.mjs`):

- **Tổng số bảng trong public schema**: 109 bảng
- **Tổng số dòng dữ liệu đã chuyển giao**: **2.515 dòng**
- **Tỷ lệ khớp**: **100% MATCH (0 sai lệch)**

### Bảng thống kê đối chiếu chi tiết:

| Thực thể nghiệp vụ                            | Số lượng SQLite | Số lượng Neon Postgres | Trạng thái |
| :-------------------------------------------- | :-------------- | :--------------------- | :--------- |
| **Tài khoản Quản trị (`admins`)**             | 2               | 2                      | **MATCH**  |
| **Khách hàng (`users`)**                      | 17              | 17                     | **MATCH**  |
| **Dòng xe (`vehicle_models`)**                | 21              | 21                     | **MATCH**  |
| **Chi tiết tính năng dòng xe (`features`)**   | 84              | 84                     | **MATCH**  |
| **Hình ảnh thư viện dòng xe (`gallery`)**     | 61              | 61                     | **MATCH**  |
| **Điểm nổi bật dòng xe (`highlights`)**       | 68              | 68                     | **MATCH**  |
| **Thông số kỹ thuật (`specifications`)**      | 142             | 142                    | **MATCH**  |
| **Phiên bản & Màu sắc dòng xe**               | 86              | 86                     | **MATCH**  |
| **Phương tiện thực tế (`vehicles`)**          | 21              | 21                     | **MATCH**  |
| **Hình ảnh phương tiện (`vehicles_photos`)**  | 6               | 6                      | **MATCH**  |
| **Đơn đặt thuê xe (`bookings`)**              | 12              | 12                     | **MATCH**  |
| **Lịch sử trạng thái đơn (`status_history`)** | 25              | 25                     | **MATCH**  |
| **Khóa lịch giữ xe (`rental_days`)**          | 19              | 19                     | **MATCH**  |
| **Giao dịch thanh toán (`payments`)**         | 6               | 6                      | **MATCH**  |
| **Sự kiện Webhook/IPN (`payment_events`)**    | 4               | 4                      | **MATCH**  |
| **Yêu cầu tư vấn (`consultations`)**          | 3               | 3                      | **MATCH**  |
| **Thông báo hệ thống (`notifications`)**      | 8               | 8                      | **MATCH**  |
| **Yêu cầu mua xe (`sales_inquiries`)**        | 10              | 10                     | **MATCH**  |
| **Khuyến mãi (`promotions`)**                 | 1               | 1                      | **MATCH**  |
| **Tập tin Media (`media`)**                   | 81              | 81                     | **MATCH**  |
| **Cấu hình toàn trang (`nori_site`)**         | 1               | 1                      | **MATCH**  |
| **Nhật ký kiểm toán (`audit_logs`)**          | 517             | 517                    | **MATCH**  |
| **Quan hệ đa thực thể (`*_rels`)**            | 988             | 988                    | **MATCH**  |
| **Bản ghi phiên bản (`_v`)**                  | 346             | 346                    | **MATCH**  |

### Xác minh thực thể đặc thù:

1. **Mật khẩu & Mã băm (Password Hashes)**:
   - Super Admin `admin@nori.vn`: Salt và Hash mã hóa PBKDF2 được bảo toàn nguyên vẹn 100%. Đăng nhập trực tiếp không cần reset mật khẩu.
   - Toàn bộ 17 khách hàng thử nghiệm (ví dụ `thinhnq@nori.vn`) giữ nguyên thông tin tài khoản, CCCD, GPLX, số điện thoại và vai trò CUSTOMER.
2. **Khóa ngoại & Tự tăng (Auto-increment Sequences)**:
   - Cập nhật đồng bộ toàn bộ 39 sequence tự tăng trong PostgreSQL (`admins_rels_id_seq`, `bookings_rels_id_seq`, `media_rels_id_seq`, v.v.) về `MAX(id)` hiện tại, ngăn ngừa lỗi trùng khóa khi tạo bản ghi mới từ Admin hoặc giao diện người dùng.

---

## 4. Nghiệm thu các chốt kiểm thử (Verification Gates)

| Chốt kiểm thử            | Lệnh thực hiện           | Kết quả                  | Chi tiết                                                                                                     |
| :----------------------- | :----------------------- | :----------------------- | :----------------------------------------------------------------------------------------------------------- |
| **TypeScript Typecheck** | `pnpm typecheck`         | **PASS (Code 0)**        | 0 lỗi kiểu dữ liệu với `@payloadcms/db-postgres`                                                             |
| **Unit Test Suite**      | `pnpm test`              | **PASS (340/340 tests)** | 11 suites kiểm thử nghiệp vụ thuê xe, thanh toán, RBAC, discount đều vượt qua                                |
| **Production Build**     | `pnpm build`             | **PASS (Code 0)**        | Turbopack compile thành công trong 28.7s; render trước 104 static & dynamic pages truy vấn trực tiếp từ Neon |
| **Dev Sync Suite**       | `pnpm dev:sync:verify`   | **PASS (Code 0)**        | SQLite snapshot & Media trên Git duy trì tính toàn vẹn 100%                                                  |
| **Isolated E2E Tests**   | `pnpm test:e2e:isolated` | **PASS (106/106 tests)** | 106 kịch bản Playwright (Chromium & Mobile WebKit) hoàn thành mỹ mãn trên DB cô lập                          |

---

## 5. Hướng dẫn sử dụng & Chuyển đổi môi trường

### A. Kết nối đến Neon PostgreSQL (Staging)

Trong file cấu hình môi trường `.env`:

```env
DATABASE_URL=postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require
```

Chạy ứng dụng:

```bash
pnpm dev
```

Mọi thành viên trong nhóm làm việc trên branch `staging` sẽ cùng tương tác trên dữ liệu thời gian thực (real-time shared data).

### B. Chuyển đổi về SQLite cục bộ (Offline Fallback)

Khi không có mạng Internet hoặc muốn phát triển cục bộ cô lập, chỉ cần sửa dòng `DATABASE_URL` trong `.env`:

```env
DATABASE_URL=file:./nori.db
```

Khởi động lại server, Payload sẽ lập tức hoạt động trên file SQLite cục bộ với đầy đủ dữ liệu nguyên bản.

### C. Chạy đồng bộ dữ liệu từ SQLite sang Neon

Nếu máy phát triển cập nhật dữ liệu mới trên SQLite và muốn nạp lại vào Neon Staging:

```bash
pnpm db:migrate:neon
```

---

## 6. Phương án Phục hồi & Rollback Khẩn cấp (Rollback Plan)

Trong trường hợp muốn hủy liên kết Neon và hoàn nguyên 100% về trạng thái SQLite ban đầu:

1. **Khôi phục cấu hình môi trường**:
   - File backup `.env` gốc đã được lưu tại: `backups/pre-postgres-migration-20261121_174419/.env.bak`.
   - Đặt lại `DATABASE_URL=file:./nori.db` trong `.env`.
2. **Khôi phục database SQLite**:
   - Database SQLite nguyên bản trước migration được bảo toàn nguyên vẹn tại: `backups/pre-postgres-migration-20261121_174419/nori.db`.
   - File `nori.db` hiện tại ở thư mục gốc vẫn giữ nguyên toàn bộ dữ liệu.
3. **Rollback migration trên Neon** (nếu cần xóa sạch bảng trên Neon):
   - Chạy lệnh: `pnpm payload migrate:down` hoặc `pnpm payload migrate:reset`.
