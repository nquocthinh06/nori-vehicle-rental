# CƠ CHẾ ĐỒNG BỘ DỮ LIỆU & MEDIA (DATA & MEDIA SYNCHRONIZATION) — NORI VEHICLE RENTAL

## 1. Bối cảnh và Nguyên tắc Kiến trúc

Trong mô hình phát triển nhóm qua GitHub (`https://github.com/nquocthinh06/nori-vehicle-rental`), cơ sở dữ liệu runtime (`nori.db`) và thư mục tệp tải lên runtime (`media/*`) được loại trừ khỏi Git để tránh xung đột nhị phân SQLite và bảo vệ dữ liệu nhạy cảm.

Để các thành viên có thể chia sẻ **nội dung cấu hình động, thông số dòng xe, xe mẫu (Demo), bài viết CMS, chương trình khuyến mãi, Hero Slider, Banner và hình ảnh mới tải lên từ Admin** mà không cần sửa code thủ công, NORI xây dựng kiến trúc **Version-Controlled Data Snapshot & Media Manifest** (`src/lib/data-sync.ts`).

### Nguyên tắc cốt lõi:

- **Database (`nori.db`) là nguồn dữ liệu nghiệp vụ chính thức (Single Source of Truth)** khi ứng dụng vận hành.
- **Snapshot (`data/snapshots/*.json`) và Shared Media (`media/seed/**`, `public/seed-media/**`) là cơ chế chia sẻ và khôi phục dữ liệu được phép quản lý phiên bản qua Git.**
- **Allowlist nghiêm ngặt**: Chỉ xuất các collection và trường dữ liệu được phép công khai/chia sẻ. Tuyệt đối không xuất mật khẩu (`hash`, `salt`), phiên đăng nhập (`sessions`, `token`), tài khoản thực (`admins`, `users`), đơn thuê (`bookings`), thanh toán (`payments`) hoặc thông tin định danh khách hàng (`idCardNumber`, `driverLicenseNumber`, `customerPhone`).

---

## 2. Phân loại 3 Nhóm Dữ liệu

| Nhóm dữ liệu                   | Lưu trữ tại                                                                          | Quản lý trên GitHub | Thành phần bao gồm                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Version-controlled Data** | `data/snapshots/*.json`, `data/seed/schema.sql`, `public/seed-media/`, `media/seed/` | **CÓ**              | Schema SQL, danh mục (`categories.json`), thương hiệu (`brands.json`), dòng xe (`vehicle-models.json`), xe mẫu (`vehicles.json` với `isDemo=true`), cấu hình website (`site-settings.json`), Hero Slider (`hero-slides.json`), Banner (`banners.json`), bài viết đã xuất bản (`articles.json`), khuyến mãi công khai (`promotions.json`), định nghĩa Role/Permission (`roles-permissions.json`), Media Manifest (`media-manifest.json`) và tệp ảnh được phép chia sẻ. |
| **B. Shared Runtime Data**     | `nori.db` (hoặc Shared Staging DB), `media/*`                                        | **KHÔNG**           | Tài khoản thực, phân quyền thực tế của từng tài khoản, đơn thuê xe, lịch khóa ngày (`rental_days`), giao dịch thanh toán, yêu cầu mua xe, đánh giá, thông báo, nhật ký kiểm toán (`audit_logs`).                                                                                                                                                                                                                                                                      |
| **C. Sensitive Data**          | `.env`, bảng `admins`, `users`, `backups/`                                           | **TUYỆT ĐỐI KHÔNG** | `PAYLOAD_SECRET`, `NORI_SESSION_SECRET`, `NORI_ADMIN_PASSWORD`, password hash (`pbkdf2-sha256-v1`), salt, JWT/cookie, CCCD/GPLX, bản sao lưu chứa dữ liệu thực.                                                                                                                                                                                                                                                                                                       |

---

## 3. Cấu trúc Thư mục Chuẩn hóa

```text
data/
  seed/
    schema.sql                  # Lược đồ SQLite chuẩn (84 bảng, 452 câu lệnh DDL idempotent)
  snapshots/
    manifest.json               # Phiên bản Snapshot, Schema Version, Content Hash & Checksum
    media-manifest.json         # Danh mục toàn bộ tệp hình ảnh tham chiếu kèm SHA-256 checksum
    categories.json             # Danh mục & phân loại kiểu dáng phương tiện
    brands.json                 # Thương hiệu phương tiện
    vehicle-models.json         # 21+ dòng xe catalogue, thông số, tiện nghi, phiên bản, gallery
    vehicles.json               # Xe thực tế minh họa (isDemo = true), giá thuê, giá bán, ODO
    site-settings.json          # Cấu hình thương hiệu, Header, Footer, chính sách, FAQ
    hero-slides.json            # Danh sách slide Hero Carousel (Desktop/Mobile image, focal point)
    banners.json                # Danh sách ảnh Banner trang chủ & câu chuyện NORI
    articles.json               # Bài viết & tin tức CMS đã xuất bản
    promotions.json             # Chương trình khuyến mãi & voucher chia sẻ
    roles-permissions.json      # Định nghĩa cấu trúc Role & ma trận quyền RBAC
  runtime/
    sync-state.json             # Trạng thái đồng bộ cục bộ (bị loại trừ khỏi Git)

media/
  seed/                         # Tệp hình ảnh Admin tải lên được phép chia sẻ qua Git
    vehicles/
    hero/
    banners/
    articles/
  *.jpg / *.webp / *.png        # Tệp hình ảnh runtime do Payload phục vụ (bị loại trừ khỏi Git)

public/
  seed-media/                   # 63 tệp ảnh gốc khởi tạo ban đầu (không nhân bản trùng lặp)
```

---

## 4. Cơ chế Đồng bộ Hình ảnh (Media Synchronization)

1. **Khi Admin tải ảnh mới lên (`/dashboard/vehicles`, `/dashboard/models`, `/dashboard/content`, `/dashboard/posts`)**:
   - Tệp hình ảnh được kiểm tra chữ ký nhị phân (magic bytes), tối ưu hóa qua `sharp` và lưu vật lý vào `media/<filename>`.
   - Bản ghi metadata được lưu vào bảng `media` trong `nori.db` và truy cập qua đường dẫn tương đối `/api/media/file/<filename>` (không phụ thuộc đường dẫn máy tính cá nhân).
2. **Khi thực hiện `npm run data:export`**:
   - Hệ thống quét toàn bộ media đang được tham chiếu bởi các bản ghi được phép chia sẻ.
   - Tính mã băm `SHA-256` (`checksum`) cho từng tệp ảnh.
   - Nếu ảnh trùng khớp `SHA-256` với một trong 63 ảnh gốc tại `public/seed-media/`, `repoPath` trong `media-manifest.json` trỏ thẳng về `public/seed-media/<file>` để **không lưu trùng lặp file trong Git**.
   - Nếu là ảnh mới do Admin tải lên, hệ thống tự động sao chép file từ `media/<filename>` sang `media/seed/{vehicles|hero|banners|articles}/<filename>` (được Git theo dõi) và ghi nhận vào `data/snapshots/media-manifest.json`.
3. **Khi thành viên khác thực hiện `npm run data:import` (hoặc `npm run data:sync`)**:
   - Hệ thống kiểm tra sự tồn tại và đối chiếu `SHA-256 checksum` của từng tệp ảnh tại `repoPath`.
   - Sao chép các tệp ảnh còn thiếu hoặc đã cập nhật vào thư mục runtime `media/<filename>`.
   - Upsert bản ghi vào bảng `media` và khôi phục chính xác toàn bộ khóa ngoại (`cover_id`, `desktop_image_id`, `mobile_image_id`, `image_id`) cho dòng xe, xe thực tế, Hero Slide, Banner và bài viết.

---

## 5. Các Lệnh CLI Quản lý Dữ liệu

| Lệnh                               | Chức năng                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run data:status`              | Kiểm tra trạng thái đồng bộ giữa `nori.db` và `data/snapshots/`, số bản ghi chưa export, trạng thái media và bản sao lưu gần nhất.    |
| `npm run data:export`              | Xuất dữ liệu được phép chia sẻ từ `nori.db` và `media/` ra `data/snapshots/*.json` và `media/seed/**`.                                |
| `npm run data:validate`            | Kiểm tra tính toàn vẹn JSON, Schema Version, khóa ngoại giữa các collection và quét chặn dữ liệu nhạy cảm.                            |
| `npm run media:validate`           | Kiểm tra toàn bộ tệp hình ảnh trong `media-manifest.json` và `media/` (tồn tại vật lý, kích thước > 0, khớp SHA-256).                 |
| `npm run data:import -- --dry-run` | Xem trước số bản ghi dự kiến thêm mới (`toCreate`), cập nhật (`toUpdate`), giữ nguyên (`unchanged`) hoặc xung đột (`conflicts`).      |
| `npm run data:import`              | Nhập dữ liệu từ `data/snapshots/` vào `nori.db` và `media/` trong một SQLite Transaction nguyên tử (tự động backup trước khi import). |
| `npm run data:sync`                | Quy trình đồng bộ an toàn 3 bước: `validate` → `dry-run` → `import`.                                                                  |
| `npm run data:backup`              | Tạo bản sao lưu nhất quán gồm database (`VACUUM INTO`), tệp media và `backup-manifest.json`.                                          |
| `npm run data:restore`             | Khôi phục database và media từ bản sao lưu kèm kiểm tra `PRAGMA integrity_check`.                                                     |
| `npm run db:migrate`               | Khởi tạo hoặc cập nhật cấu trúc 84 bảng SQLite an toàn, không làm mất dữ liệu hiện có.                                                |

---

## 6. Cơ chế Phát hiện và Giải quyết Xung đột (Conflict Resolution)

Mỗi bản ghi trong snapshot được gắn định danh ổn định (`slug` cho dòng xe và bài viết, `reference` cho xe, `code` cho khuyến mãi, `slideKey` cho Hero Slide) và mã băm nội dung `recordHash`. Trạng thái đồng bộ cơ sở (`baseline`) của từng môi trường được lưu trong bảng `payload_kv` (`key = 'nori_data_sync_state'`) và `data/runtime/sync-state.json`.

Khi chạy `npm run data:import`:

- Nếu cả Database cục bộ và Snapshot đều đã thay đổi cùng một bản ghi kể từ lần đồng bộ trước (hoặc bản ghi cục bộ có `updatedAt` mới hơn Snapshot với `recordHash` khác nhau), hệ thống phát hiện **Xung đột (`CONFLICT`)** (bao gồm cả xung đột trường dữ liệu và xung đột hình ảnh `mediaConflict`).
- **Mặc định (`--on-conflict=abort`)**: Hệ thống **không tự động ghi đè**, dừng import và liệt kê chi tiết các trường/hình ảnh xung đột.
- **Giữ dữ liệu cục bộ (`--on-conflict=keep-local`)**: Nhập các bản ghi không xung đột và giữ nguyên bản ghi của máy hiện tại.
- **Ưu tiên Snapshot (`--on-conflict=prefer-snapshot`)**: Áp dụng phiên bản từ Snapshot và ghi nhật ký vào `audit_logs`.
