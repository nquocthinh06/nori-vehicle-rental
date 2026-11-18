# QUY TRÌNH LÀM VIỆC NHÓM QUA GITHUB (TEAM DEVELOPMENT WORKFLOW) — NORI VEHICLE RENTAL

## 1. Phân biệt 3 Trạng thái Dữ liệu khi Làm việc Nhóm

Mọi thành viên phát triển hoặc vận hành Admin cần phân biệt rõ ba trạng thái dữ liệu:

1. **Trạng thái 1 — Dữ liệu chưa lưu (Unsaved UI State)**:
   - Đang chỉnh sửa trên biểu mẫu trình duyệt, chưa nhấn **Lưu thay đổi** hoặc **Xuất bản**.
2. **Trạng thái 2 — Đã lưu vào Database cục bộ (`nori.db`) & Media (`media/`)**:
   - Đã ghi lâu dài trên máy hiện tại (tồn tại qua restart server và `npm run build`), nhưng **chưa tự động có trên GitHub** vì `nori.db` và `media/*` runtime nằm trong `.gitignore`.
3. **Trạng thái 3 — Đã Export ra Git Snapshot (`data/snapshots/` & `media/seed/`)**:
   - Đã chạy `npm run data:export` (hoặc nhấn **Export ra Snapshot** tại `/dashboard/system`), sẵn sàng để `git add`, `git commit`, `git push` và tạo Pull Request chia sẻ cho cả nhóm.

---

## 2. Quy trình cho Thành viên mới Clone dự án (Onboarding)

Khi clone dự án trên máy tính mới (Windows, macOS hoặc Linux):

```bash
# 1. Clone repository
git clone https://github.com/nquocthinh06/nori-vehicle-rental.git
cd nori-vehicle-rental

# 2. Cài đặt dependencies
pnpm install

# 3. Khởi tạo file cấu hình môi trường cục bộ
cp .env.example .env

# 4. Khởi tạo cấu trúc SQLite Database bằng migration (84 bảng)
npm run db:migrate

# 5. Nhập bộ dữ liệu mẫu & khôi phục toàn bộ hình ảnh mới nhất từ Snapshot
npm run data:import

# 6. Khởi tạo tài khoản Admin cục bộ an toàn (mật khẩu sinh ngẫu nhiên vào .env)
npm run seed:admin -- --init-env

# 7. Kiểm tra trạng thái đồng bộ & toàn vẹn media
npm run data:status
npm run media:validate

# 8. Khởi động máy chủ phát triển
npm run dev
```

> **Lưu ý bảo mật**: Không bao giờ sao chép file `nori.db` chứa dữ liệu thật hoặc file `.env` từ máy thành viên khác.

---

## 3. Quy trình khi Thành viên chỉnh sửa Source Code

1. Cập nhật nhánh chính mới nhất:
   ```bash
   git checkout main
   git pull origin main
   npm run data:sync
   ```
2. Tạo nhánh tính năng/sửa lỗi:
   ```bash
   git checkout -b feat/ten-tinh-nang
   ```
3. Phát triển tính năng và chạy bộ kiểm thử tự động:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
4. Kiểm tra `git status` và `git diff`, sau đó commit, push và tạo Pull Request.

---

## 4. Quy trình khi Thành viên chỉ thay đổi Dữ liệu hoặc Hình ảnh từ Admin (Không sửa code)

Ví dụ: Thành viên B đăng nhập `/dashboard`, tải lên ảnh Hero Slider mới, đổi ảnh nền phương tiện, cập nhật giá thuê hoặc thêm bài viết mới.

### Bước thực hiện của Thành viên B (Người cập nhật):

1. Đăng nhập Admin (`/login` → `/dashboard`) trên môi trường Development.
2. Thực hiện thay đổi hình ảnh, thông số xe, Hero Slider, Banner hoặc bài viết và nhấn **Lưu / Xuất bản**.
3. Kiểm tra hiển thị thực tế trên website (`http://localhost:3000`).
4. Xuất dữ liệu và hình ảnh được phép chia sẻ ra Snapshot (chọn 1 trong 2 cách):
   - **Qua giao diện Admin**: Mở `/dashboard/system` → Nhấn **Export ra Snapshot**.
   - **Qua dòng lệnh CLI**:
     ```bash
     npm run data:export
     npm run data:validate
     npm run media:validate
     ```
5. Kiểm tra các file thay đổi qua Git:
   ```bash
   git status
   git diff data/snapshots/
   ```
   _(Git sẽ ghi nhận thay đổi trong `data/snapshots/*.json` và các file ảnh mới trong `media/seed/...`)._
6. Commit, push lên branch và tạo Pull Request:
   ```bash
   git checkout -b content/cap-nhat-hinh-anh-va-xe
   git add data/snapshots/ media/seed/
   git commit -m "content: update vehicle photos and hero slider snapshot"
   git push -u origin content/cap-nhat-hinh-anh-va-xe
   ```

### Bước thực hiện của Thành viên A (Người nhận cập nhật):

1. Pull code và snapshot mới nhất từ GitHub:
   ```bash
   git pull origin main
   ```
2. Chạy migration (nếu có thay đổi cấu trúc bảng) và kiểm tra trước khi import (Dry Run):
   ```bash
   npm run db:migrate
   npm run data:import -- --dry-run
   ```
3. Đồng bộ dữ liệu và hình ảnh vào Database cục bộ:
   ```bash
   npm run data:sync
   ```
   _(Hệ thống tự động tạo bản backup trước khi cập nhật `nori.db` và sao chép ảnh mới vào `media/`)._

---

## 5. Quy trình Xử lý Xung đột Dữ liệu giữa Thành viên A và B

Nếu Thành viên A và Thành viên B cùng chỉnh sửa một phương tiện (ví dụ `NR-OT-FTN01`) trên hai máy độc lập, khi Thành viên A chạy `npm run data:import`, hệ thống sẽ báo `Status: CONFLICT` và **dừng lại để bảo vệ dữ liệu của A**.

Cách giải quyết:

1. Xem chi tiết trường và hình ảnh bị xung đột bằng lệnh:
   ```bash
   npm run data:import -- --dry-run
   ```
2. Chọn phương án xử lý:
   - **Giữ thay đổi của máy hiện tại (A)**:
     ```bash
     npm run data:import -- --on-conflict=keep-local
     ```
   - **Chấp nhận thay đổi từ Snapshot của nhóm (B)**:
     ```bash
     npm run data:import -- --on-conflict=prefer-snapshot
     ```
3. Sau khi thống nhất dữ liệu cuối cùng, chạy lại `npm run data:export` và `npm run data:validate`.

---

## 6. Danh mục File Được phép và Bị cấm đưa lên GitHub

### Được phép commit lên GitHub:

- Mã nguồn (`src/**`, `scripts/**`, `tests/**`, `public/**`).
- Cấu hình mẫu (`.env.example`, `package.json`, `tsconfig.json`, `next.config.ts`).
- Lược đồ và dữ liệu mẫu (`data/seed/schema.sql`, `data/snapshots/*.json`).
- Hình ảnh mẫu chia sẻ (`public/seed-media/**`, `media/seed/**`).
- Tài liệu kỹ thuật (`docs/**`, `README.md`, `DESIGN.md`, `SKILL.md`).

### Tuyệt đối KHÔNG commit lên GitHub:

- File `.env`, `.env.local`, `.env.production` chứa khóa bí mật hoặc mật khẩu.
- Cơ sở dữ liệu runtime (`nori.db`, `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite`).
- Thư mục ảnh runtime chưa qua kiểm duyệt (`media/*` ngoài `media/seed/`).
- Thư mục sao lưu (`backups/`, `data/backups/`, `data/runtime/`).
