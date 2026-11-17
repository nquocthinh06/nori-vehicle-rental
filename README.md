# NORI

Ứng dụng thuê xe và tư vấn mua xe bằng React, Next.js App Router, Payload và Tailwind CSS v4 trong Figma Make.

## Chạy & kiểm thử

Preview được Figma Make quản lý và tự khởi động. Không chạy thêm development server.

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
figma make verify-deploy
```

`pnpm build` là build script của dự án; `verify-deploy` chạy script này trong lifecycle được quản lý và kiểm tra artifact production, không tự Publish.

Không có lint script sẵn có. `pnpm format --check <paths>` dùng oxfmt để kiểm tra định dạng. Playwright sử dụng Chromium đã có ở `/usr/bin/chromium`; có thể chỉ định executable khác qua `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `NORI_TEST_BASE_URL` cho phép kiểm tra một production artifact đang chạy.

## Các trang

| Đường dẫn             | Chức năng                                                          |
| --------------------- | ------------------------------------------------------------------ |
| `/`                   | Trang chủ, tìm xe, catalogue nổi bật                               |
| `/vehicles`           | Tìm kiếm, lọc loại/hãng/giá, sắp xếp, grid/list, phân trang        |
| `/vehicles/[slug]`    | Gallery, phiên bản/màu, thông số, xe thực tế, ODO, lịch và báo giá |
| `/login`, `/register` | Tài khoản khách hàng bằng email/mật khẩu                           |
| `/account`            | Hồ sơ và các yêu cầu tư vấn riêng tư                               |
| `/my-bookings`        | Đơn thuê của khách và hủy đơn chờ xác nhận                         |
| `/checkout`           | Kiểm tra thông tin và gửi đơn thuê, không thu tiền trực tuyến      |
| `/dashboard`          | Tổng quan, thống kê và xử lý đơn dành cho CMS admin                |
| `/admin`              | Payload Admin nguyên bản, đăng nhập quản trị do Figma quản lý      |
| `/about`, `/support`  | Câu chuyện, hướng dẫn, chính sách và thông tin liên hệ             |
| `/design-system`      | Bộ token và component NORI thực tế                                 |

## Cập nhật dữ liệu thật

Quản trị viên sử dụng phiên CMS/Figma, không dùng tài khoản khách hàng.

1. Mở **Nội dung & liên hệ** để nhập địa chỉ nhận/trả, hotline, email và giờ làm việc đã xác nhận.
2. Quản lý **Catalogue dòng xe**: chỉ nhập thông số, phiên bản và ảnh màu có nguồn. Ảnh nội/ngoại thất được phân loại riêng.
3. Trong **Kho xe thực tế**, tạo từng chiếc xe với mã quản lý, biển số nội bộ, relationship dòng xe, dịch vụ thuê/bán, giá xác nhận, ODO và ảnh đúng chiếc xe.
4. Chỉ kích hoạt xe thực sự đủ điều kiện kinh doanh. Bản ghi mặc định tạm ngừng; giá thiếu không được đặt thuê.
5. Khách chọn xe thực tế, chọn ngày và lấy báo giá từ máy chủ trước khi gửi đơn.
6. Xử lý đơn: chờ xác nhận → xác nhận hoặc từ chối; đã xác nhận → giao xe hoặc hủy theo yêu cầu; đang thuê → nhận lại xe/hoàn thành.

Không có inventory, giá hoặc lịch trống giả. Ba catalogue ban đầu chỉ là nội dung có nguồn, không phải ba xe đang cho thuê.

## Quy tắc nghiệp vụ

- Ngày thuê theo `Asia/Ho_Chi_Minh`, date-only `YYYY-MM-DD`.
- Khoảng thuê `[ngày nhận, ngày trả)`, từ 1–30 ngày; nhận tối đa 90 ngày tới.
- Máy chủ xác định customer, đơn giá snapshot, tổng tiền và trạng thái.
- Rental-day có khóa unique theo xe/ngày, thao tác trong cùng Payload transaction. Nếu runtime không cấp transaction, từ chối giữ lịch thay vì thực hiện thao tác không an toàn.
- Chỉ khách sở hữu đơn được tự hủy khi đang chờ xác nhận.
- Không xóa cứng xe hoặc đơn đã có lịch sử.
- Thanh toán ngoài hệ thống. Trạng thái đơn không đồng nghĩa với đã thanh toán.
- Luồng mua xe lưu yêu cầu tư vấn riêng tư; chưa phải hợp đồng, giữ xe hoặc cổng thanh toán mua xe.

## Content lifecycle

Catalogue và site content dùng cached server reads. Hook thay đổi/xóa làm mới danh sách, slug cũ/mới và nội dung phụ thuộc Media. Availability, tài khoản và đơn thuê luôn đọc tại thời điểm request.

CLI content runs dùng thông báo cache-only có chữ ký; endpoint không cung cấp đường ghi document thứ hai. Tất cả seed/read/update nội dung được thực hiện bằng Payload CLI theo skill của môi trường.

Với CLI chạy ngoài Next, `NORI_REVALIDATE_ORIGINS` có thể chỉ rõ các origin đang chạy cần nhận thông báo (phân cách bằng dấu phẩy, chẳng hạn preview và site đã Publish). Đây là cấu hình đích làm mới cache, không phải secret. Chỉnh nội dung qua CMS trên chính website đang chạy sẽ invalidation trực tiếp trong Next.

App auth dùng cookie HttpOnly `app-session` và collection `users` riêng, không đổi hoặc dùng lại session `admins`. Không cần cấu hình database, Payload secret hoặc Figma-owned environment variables.

## Tài liệu bàn giao

- [SKILL.md](SKILL.md) — hướng dẫn triển khai NORI.
- [DESIGN.md](DESIGN.md) — Design System chính thức.
- [Kế hoạch & lifecycle](docs/IMPLEMENTATION.md).
- [Checklist & kết quả kiểm thử](docs/QA.md).
- [Danh sách file thay đổi](docs/CHANGES.md).

Xem `docs/QA.md` để biết các kiểm thử còn bị chặn bởi dữ liệu thực tế hoặc tích hợp chưa được cung cấp. Không coi build success là bằng chứng luồng đặt/nhận/trả xe đã được nghiệm thu đầy đủ.
