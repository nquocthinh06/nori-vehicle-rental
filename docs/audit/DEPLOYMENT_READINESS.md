# NORI Vehicle Rental — Deployment, Data Separation & Release Readiness Report

> **Mục đích**: Đánh giá khả năng vận hành thực tế trên môi trường thương mại (Self-hosted VPS + Cloudflare Tunnel + Domain riêng vs Figma Make Serverless), tách bạch dữ liệu Demo, cơ chế dự phòng thông báo/thanh toán, Healthcheck, và quy trình Backup/Restore đã diễn tập thực tế.  
> **Ngày đánh giá**: `2026-11-18`  
> **Runtime đã xác minh**: `Node v24.22.3`, `pnpm 10.34.9`, `Next.js 16.4.6 (Turbopack)`, `Payload CMS 4.0.0-beta.8`, `@payloadcms/db-sqlite`.

---

## 1. Kiến trúc hạ tầng & Khuyến nghị môi trường Triển khai

### Phương án khuyến nghị: Node.js Stateful VPS + SQLite WAL + Cloudflare Tunnel + Domain

| Thành phần                                  | Hiện trạng mã nguồn & cấu hình                                                                                                                                                                                                                                                  | Khuyến nghị Production                                                                                                                                                                                                                                                  |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database (`SQLite`)**                     | `@payloadcms/db-sqlite` đọc `process.env.DATABASE_URI` (mặc định `file:./nori.db`). Payload hỗ trợ `NORI_SQLITE_PATH` cho script & công cụ vận hành.                                                                                                                            | Bắt buộc lưu trên ổ cứng gắn kết lâu dài (VPS NVMe / Docker persistent volume), **không** chạy trên nền tảng stateless/serverless không có persistent filesystem.                                                                                                       |
| **Media Uploads**                           | `src/collections/Media.ts` lưu file tải lên cục bộ trong `./media/` (không cấu hình adapter S3/R2).                                                                                                                                                                             | Mount thư mục `./media/` cùng backup định kỳ với DB. Bật Cloudflare Image Resizing / Polish hoặc nâng cấp S3/R2 nếu mở rộng nhiều node.                                                                                                                                 |
| **Secrets & Session**                       | [`src/payload.config.ts`](../../src/payload.config.ts) kiểm tra bắt buộc `process.env.PAYLOAD_SECRET` khi `NODE_ENV=production`. [`src/lib/session-cookie.ts`](../../src/lib/session-cookie.ts) tách cookie Customer (`nori-customer-session`) vs Admin (`nori-admin-session`). | Cấu hình `PAYLOAD_SECRET` (≥32 ký tự ngẫu nhiên) và `NORI_SESSION_SECRET` riêng biệt trong `.env` / secrets manager trên máy chủ; đặt `NEXT_PUBLIC_SITE_URL=https://<domain-chinh-thuc>` để cookie `Secure` hoạt động chuẩn sau TLS proxy (`X-Forwarded-Proto: https`). |
| **Security Headers**                        | [`next.config.ts`](../../next.config.ts) đặt `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, và `X-Frame-Options: SAMEORIGIN` (khi `FIGMA !== '1'`).                     | Bổ sung HSTS (`Strict-Transport-Security`) và rate-limit WAF ở tầng Cloudflare Edge / Nginx Reverse Proxy.                                                                                                                                                              |
| **Figma Make (`deploy` / `verify-deploy`)** | `.figma/make/deploy.json` cấu hình `adapter: "aws/lambda/nextjs"`, và CLI `figma` **không** được cài đặt ở môi trường offline cục bộ (`figma: command not found` → **`NOT VERIFIED / BLOCKED`** ở local shell).                                                                 | Kiến trúc `SQLite + local ./media` nội bộ không phù hợp với AWS Lambda ephemeral stateless; giữ `.figma/make/*` nguyên trạng theo quy định template nhưng khuyến nghị triển khai thương mại bằng **Node.js VPS + Cloudflare Tunnel** hoặc **Docker Compose**.           |

---

## 2. Tách bạch Dữ liệu Demo vs Dữ liệu Thương mại (Sections XI)

Kiểm tra trực tiếp cơ sở dữ liệu hiện hành (`nori-qa-remediation.db` đồng nhất cấu trúc dữ liệu kinh doanh với `nori.db`) và quy trình khởi tạo trong [`src/lib/seed-nori.ts`](../../src/lib/seed-nori.ts):

1. **Thực trạng dữ liệu mẫu hiện tại**:
   - **Tổng số dòng xe (`vehicle_models`)**: `21` (`8` Ô tô, `9` Xe máy, `4` Bán tải — tất cả `visible = 1`).
   - **Tổng số xe thực tế (`vehicles`)**: **`21 / 21` xe đều đang mang cờ `is_demo = 1`** (`17` xe `ACTIVE/READY`, `3` xe `ACTIVE/MAINTENANCE`, `1` xe `INACTIVE/SOLD`), kèm `63` ảnh seed tĩnh tại `public/seed-media/`.
   - **Khuyến mãi (`NORIXINCAMON`)**: Đang tồn tại trong bảng `promotions` (`PERCENT 10%`, `max_discount = 30`, `usage_limit = 1`, `used_count = 1`), gắn với lịch sử đơn hoàn tất `NR-15f47c3d...`. Được giữ nguyên toàn vẹn lịch sử, không tự ý xóa/sửa để bảo toàn hạch toán cũ; trong UI Admin [`promotions-panel.tsx`](../../src/components/admin/promotions-panel.tsx) đã bổ sung cảnh báo đơn vị khi `maxDiscount < 1000` VNĐ và chú thích rõ `Tổng lượt dùng toàn CT (mọi khách)`.
2. **Cơ chế tắt tự động seed demo trên môi trường sạch**:
   - Đã bổ sung biến môi trường `NORI_DISABLE_DEMO_SEED=1` (đã ghi chú trong [`.env.example`](../../.env.example)).
   - Trong [`seed-nori.ts`](../../src/lib/seed-nori.ts), hàm `seedNoriIfEmpty(payload)` vẫn gọi `ensureOfficialAdmin(payload)` để đảm bảo tài khoản quản trị khởi tạo hợp lệ, sau đó **thoát sớm (`return`) ngay khi `process.env.NORI_DISABLE_DEMO_SEED === '1'`** — ngăn chặn tuyệt đối việc hệ thống tự chèn lại `21` xe demo, dữ liệu mẫu Hero/Story hoặc bài viết mẫu nếu quản trị viên triển khai trên database trắng cho kinh doanh thật.

---

## 3. Khả năng chống lỗi Thanh toán, Tư vấn & Thông báo (Section XII)

| Hạng mục                                             | Cơ chế trước đó                                                                                                                                                  | Cơ chế sau khắc phục                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                   Trạng thái                   |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------: |
| **Gửi thông báo xác nhận đơn (`BOOKING_CONFIRMED`)** | `bookings.afterChange` gọi trực tiếp `payload.create({ collection: 'notifications' })` không tách lớp; chưa có hỗ trợ webhook ngoài an toàn.                     | Tách ra [`src/lib/notifications.ts`](../../src/lib/notifications.ts) (`dispatchBookingConfirmationNotice`): ghi thông báo nội bộ trong khối `try/catch` (lỗi notification không làm sập transaction duyệt đơn) và hỗ trợ webhook tùy chọn qua `NORI_NOTIFY_WEBHOOK_URL` với timeout `4000ms`, tự chuyển trạng thái `NOT_CONFIGURED` hoặc `DEGRADED` mà không ném exception. Đã kiểm chứng bằng unit test mô phỏng lỗi DB & webhook unreachable trong [`tests/rbac-access.test.mjs`](../../tests/rbac-access.test.mjs).                                                                        |               **VERIFIED PASS**                |
| **Thanh toán & Trạng thái đơn**                      | Có thể ghi nhận thu tiền trên đơn đã hủy hoặc hủy đơn khi đã thu tiền; dữ liệu lịch sử từng phát sinh `remaining_amount` chưa về `0` khi `REJECTED`/`CANCELLED`. | [`Payments.ts`](../../src/collections/Payments.ts) `beforeChange` chặn HTTP `409` khi ghi nhận/xác nhận khoản thu (`!= REFUND`, `!= CANCELLED`) vào đơn `CANCELLED`/`REJECTED`, chặn đảo ngược phiếu `REFUNDED`; [`dashboard/payments/route.ts`](<../../src/app/(frontend)/nori-api/dashboard/payments/route.ts>) chạy trong `withBookingWriteLock()` chống gửi trùng lặp `30s`; [`Bookings.ts`](../../src/collections/Bookings.ts) ép `remainingAmount = 0` + tự động chuyển phiếu `PENDING` sang `CANCELLED` khi đơn bị hủy/từ chối, và chặn khách tự hủy nếu đã có thanh toán `CONFIRMED`. |        **VERIFIED PASS** (`QA-CONC-01`)        |
| **Kiểm soát giá lúc Checkout & Đua lệnh**            | Thiếu khóa lạc quan trên form Admin, khách dễ đặt nhầm giá cũ nếu Admin vừa đổi giá.                                                                             | Bổ sung `expectedRevision` (`409` khi sửa đồng thời) trên `/nori-api/dashboard/bookings` và `expectedTotalPrice` (`409` nếu lệch giá) khi khách đặt xe trên `/nori-api/bookings`.                                                                                                                                                                                                                                                                                                                                                                                                             | **VERIFIED PASS** (`QA-CONC-01`, `QA-CONC-02`) |

---

## 4. Giám sát sức khỏe (`/nori-api/health`) & Kiểm thử Bảo mật Phụ thuộc (`pnpm audit`)

- **Healthcheck Endpoint ([`src/app/(frontend)/nori-api/health/route.ts`](<../../src/app/(frontend)/nori-api/health/route.ts>))**:
  - `GET /nori-api/health` (`force-dynamic`, `Cache-Control: private, no-store`) truy vấn thực tế bảng `vehicles` qua Payload Local API.
  - Khi DB sẵn sàng: HTTP `200` `{"status":"ok","db":"connected","vehiclesCount":21,"uptimeSeconds":...,"timestamp":"..."}` (đã xác minh thực tế trên `http://127.0.0.1:3100/nori-api/health` và trong test `QA-CONC-02`).
  - Khi DB ngắt kết nối: HTTP `503` `{"status":"error","db":"disconnected","timestamp":"..."}`.
- **Kết quả quét bảo mật phụ thuộc (`pnpm audit --json`)**:
  - Tổng hợp: **`0 Critical | 2 High | 4 Moderate | 0 Low`** (`6` đường dẫn phụ thuộc bắc cầu).
  - **`picomatch` (`GHSA-fc5q-39xc-vjpf`, High, ReDoS)** tại 2 nhánh: `@payloadcms/figma > ts-morph > fast-glob > micromatch > picomatch` và `payload > json-schema-to-typescript > tinyglobby > picomatch` → chỉ chạy ở bước CLI build/typegen, **không** nhận regex/glob từ HTTP người dùng ở runtime.
  - **`esbuild` (`GHSA-67mh-4wv8-2f99`, Moderate)** tại `@payloadcms/db-sqlite > drizzle-kit > @esbuild-kit/* > esbuild` → chỉ dùng trong Drizzle dev CLI, **không** mở cổng dev server ở production.
  - **`uuid`, `glob`, `minimatch` (Moderate)** đều nằm sâu bên trong `@payloadcms/figma` CLI bundling, không lộ ra route web công khai.
  - Không tự ý nâng cấp ép buộc Payload `4.0.0-beta.8` để bảo đảm ổn định API hiện hành; đặt vào danh mục theo dõi khi Payload phát hành bản stable tiếp theo.

---

## 5. Diễn tập Backup & Restore Thực tế (Verified Offline Drill)

Cập nhật [`scripts/backup-db.mjs`](../../scripts/backup-db.mjs) (hỗ trợ `--db`, kiểm tra cả `PRAGMA integrity_check` và `PRAGMA foreign_key_check`) và [`scripts/restore-db.mjs`](../../scripts/restore-db.mjs) (hỗ trợ `--source`, `--target`, **tự động dọn các file `-wal`, `-shm`, `-journal` cũ trước khi chép file khôi phục** để tránh hỏng trang WAL cũ).

- **Kết quả chạy diễn tập trên bản sao (`nori-qa-remediation.db` → `backups/drill-test.db` → `nori-drill-restored.db`)**:
  - Dung lượng bản sao lưu `VACUUM INTO`: `2936.0 KB`
  - `PRAGMA integrity_check` bản sao lưu & bản sau restore: **`ok`**
  - `PRAGMA foreign_key_check`: **`0` vi phạm**
  - Khớp 100% số bản ghi: `admins: 2/2`, `users: 16/16`, `vehicle_models: 21/21`, `vehicles: 21/21`, `bookings: 10/10`, `payments: 1/1`, `promotions: 1/1`, `media: 78/78`, `audit_logs: 451/451`.
  - Đã xóa sạch file diễn tập tạm `backups/drill-test.db` và `nori-drill-restored.db*` ngay sau diễn tập.
