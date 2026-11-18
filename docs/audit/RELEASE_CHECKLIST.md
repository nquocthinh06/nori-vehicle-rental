# NORI Vehicle Rental — Go-Live & Commercial Release Checklist (`RELEASE_CHECKLIST.md`)

> **Phiên bản**: Sau đợt khắc phục QA toàn diện & tối ưu hiệu năng (`2026-11-18`).  
> Checklist phân tầng theo đúng mức độ sẵn sàng để tránh đánh đồng môi trường demo/staging với vận hành thu tiền thật.

---

## 1. Bảng điều kiện Go-Live Bắt buộc (Hard Gates)

| Hạng mục                                     | Tiêu chí kiểm chứng                                                                                             |                                                   Trạng thái hiện tại                                                   | Ghi chú hành động                                                                  |
| :------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------- |
| **Toàn vẹn Database Live (`./nori.db`)**     | `PRAGMA integrity_check = ok`, `PRAGMA foreign_key_check = []`, Hero Slide #1 hiển thị `'Mọi hành trình.'`      |        Đã kiểm chứng trên bản sao `nori-qa-remediation.db` (`0` FK); `./nori.db` **chờ xác nhận của chủ sở hữu**        | Thực thi `node scripts/repair-nori-db.mjs --apply` sau bước xác nhận (`Yes`/`No`). |
| **Static Checks & Unit Suite**               | `format:check`, `lint`, `typecheck`, `pnpm test` (`247/247`), `pnpm test:admin`                                 |                                      **PASS** (sẽ chạy kiểm chứng lại ở bước cuối)                                      | Chạy full regression trước khi tag release.                                        |
| **Production Build & E2E + Stability**       | `pnpm build` sạch, Chromium E2E, Mobile WebKit E2E, `--repeat-each=3`                                           |                                           Đang hoàn tất vòng regression cuối                                            | Không bỏ qua hoặc làm nhẹ assertion.                                               |
| **Phân quyền RBAC 3 tầng**                   | Guest / Customer / Operator / SUPER_ADMIN, `Folders`/`Tags`, `/api/*`, quyền `publish`                          |                                **VERIFIED** (`tests/rbac-access.test.mjs`, `QA-SEC-02`)                                 | Kiểm tra lại quyền operator mới trước khi giao tài khoản nhân viên.                |
| **Biến môi trường Production**               | `PAYLOAD_SECRET` (≥32 chars), `NORI_SESSION_SECRET` (riêng), `NEXT_PUBLIC_SITE_URL=https://...`, `DATABASE_URI` |                                          Đã tài liệu hóa trong `.env.example`                                           | **Không** dùng secret mặc định của môi trường dev.                                 |
| **Tắt Seed Dữ liệu Demo**                    | Đặt `NORI_DISABLE_DEMO_SEED=1` trên DB thương mại; tạo mới/chuyển xe thực (`isDemo = false`)                    |                              Code hook **READY**; DB hiện hành còn `21/21` xe `isDemo = 1`                              | Nhập xe kinh doanh thật và ẩn/gỡ xe demo trước khi mở bán thương mại.              |
| **Hạ tầng Media & CDN Mobile**               | Đặt Cloudflare Proxy / Reverse Proxy TLS + tối ưu/cache `/api/media/file/*` hoặc cấu hình `imageSizes` WebP     |                           Standalone VPS OK; Mobile Slow 4G raw JPEG đang ở `2.87–3.06s` LCP                            | Khuyến nghị bật Cloudflare Polish / Resize để đạt `< 2.5s` trên Slow 4G thật.      |
| **Backup tự động & Giám sát**                | Cron `node scripts/backup-db.mjs` hằng ngày + copy ngoài máy chủ + theo dõi `GET /nori-api/health`              |                                        Script & Healthcheck **READY & DRILLED**                                         | Thiết lập Uptime monitor gọi `/nori-api/health` (mỗi 60s, cảnh báo khi != 200).    |
| **Thanh toán trực tuyến / SMS / Email thật** | Cấu hình `NORI_NOTIFY_WEBHOOK_URL` hoặc tích hợp cổng thanh toán / SMTP được phê duyệt                          |                            Hỗ trợ webhook degrade-safe; chưa tích hợp thanh toán thẻ tự động                            | Phù hợp mô hình xác nhận & thu tiền/chuyển khoản kiểm tra thủ công trong Phase 1.  |
| **Figma Make CLI (`figma make deploy`)**     | `figma make deploy` & `verify-deploy` trong sandbox                                                             | **`NOT VERIFIED / BLOCKED`** tại máy cục bộ (không có CLI `figma` & môi trường Make Serverless không hợp SQLite cục bộ) | Triển khai thực tế trên Node.js VPS / Docker với persistent disk.                  |

---

## 2. Quy trình Triển khai lên VPS Production (Runbook tóm tắt)

1. **Sao lưu trước khi nâng cấp**:
   ```bash
   node scripts/backup-db.mjs --db ./nori.db
   ```
2. **Nạp cấu hình môi trường** (`.env` production):
   - Đặt `NODE_ENV=production`, `PAYLOAD_SECRET=<random-64-hex>`, `NORI_SESSION_SECRET=<distinct-random-64-hex>`, `DATABASE_URI=file:./nori.db`, `NORI_SQLITE_PATH=./nori.db`, `NEXT_PUBLIC_SITE_URL=https://your-domain.com`.
   - Với database thương mại sạch (không dùng xe mẫu): đặt `NORI_DISABLE_DEMO_SEED=1`.
   - Nếu có hệ thống gửi Email/Zalo/Slack webhook ngoài: đặt `NORI_NOTIFY_WEBHOOK_URL=https://...`.
3. **Build & Khởi động tiến trình**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm lint
   pnpm build
   node .next/standalone/server.js # hoặc pnpm start qua PM2 / systemd
   ```
4. **Kiểm tra sau khi khởi động (Smoke Verification)**:
   - Kiểm tra `GET https://your-domain.com/nori-api/health` trả `200 OK` và `"db": "connected"`.
   - Mở `/` (kiểm tra Hero Slide #1 `"Mọi hành trình."` & ảnh tải đầy đủ), `/vehicles`, `/vehicles/toyota-fortuner`, `/login`, và đăng nhập Admin đổi mật khẩu mặc định ngay lần đầu.
5. **Quy trình Rollback khẩn cấp**:
   - Dừng service Node.js → chạy `node scripts/restore-db.mjs --source backups/<file-gan-nhat>.db --target ./nori.db` (script tự dọn `-wal`/`-shm` và kiểm tra `PRAGMA integrity_check = ok`) → khởi động lại bản build ổn định trước đó.
