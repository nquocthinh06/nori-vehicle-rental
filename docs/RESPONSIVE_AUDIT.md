# BÁO CÁO KIỂM TOÁN VÀ KHẮC PHỤC RESPONSIVE ĐA THIẾT BỊ (RESPONSIVE AUDIT & OPTIMIZATION REPORT)

# NORI VEHICLE RENTAL SYSTEM — PHIÊN BẢN 2.7.1

---

## I. MỤC TIÊU VÀ PHẠM VI KIỂM TOÁN

Báo cáo này tài liệu hóa chi tiết các lỗi hiển thị, xung đột không gian (layout collision), tràn màn hình (viewport blowout), và các cải tiến giao diện người dùng trên đa thiết bị (Mobile, Tablet, Desktop) của hệ thống **NORI Vehicle Rental**.

### Ma trận thiết bị & Viewport kiểm thử:

- **Mobile nhỏ (Small Mobile)**: 320px × 568px (iPhone SE thế hệ 1), 360px × 640px (Android phổ thông).
- **Mobile tiêu chuẩn (Standard Mobile)**: 375px × 667px (iPhone 8), 390px × 844px (iPhone 12/13/14/15), 412px × 915px (Samsung Galaxy S20/S22/S24).
- **Tablet (Chân dung & Cảnh quan)**: 768px × 1024px (iPad Mini), 820px × 1180px (iPad Air), 1024px × 768px (Landscape).
- **Desktop & Laptop**: 1280px × 800px, 1440px × 900px, 1920px × 1080px (Full HD).

---

## II. DANH MỤC LỖI GIAO DIỆN ĐÃ PHÁT HIỆN & PHƯƠNG ÁN KHẮC PHỤC

### 1. Hamburger Menu (Site Header & Mobile Navigation)

#### Vấn đề trước khi sửa:

- Menu di động trước đây được nhúng như một khối thẻ tuyệt đối (`absolute top-full left-0 right-0`) phụ thuộc vào chiều cao của thanh Header cha.
- Khi người dùng cuộn trang hoặc trên màn hình chiều dọc thấp (như chế độ xoay ngang Landscape 320px - 480px chiều cao):
  - Menu bị khuất các liên kết phía dưới (như Đơn của tôi, Hotline, Nút Đăng nhập/Đăng xuất).
  - Không có thanh cuộn độc lập (`overflow-y-auto`), không hỗ trợ chạm lướt mượt mà (`-webkit-overflow-scrolling: touch`).
  - Không khóa cuộn màn hình nền (`body scroll lock`), dẫn đến hiện tượng cuộn kép (cả trang web bên dưới và menu đều bị cuộn).
  - Thiếu nút Đóng (X) rõ ràng, người dùng phải bấm lại chính xác vào icon hamburger nhỏ ở góc trên để tắt.

#### Giải pháp thiết kế & kỹ thuật đã triển khai (`src/components/site-header.tsx`):

- **Cấu trúc Drawer Container Toàn màn hình Độc lập**:
  ```tsx
  <div className="fixed inset-0 z-50 flex flex-col bg-canvas sm:hidden animate-in fade-in duration-200">
    {/* Dedicated Top Bar */}
    <div className="flex h-16 items-center justify-between border-b border-border px-4">
      <NoriLogo />
      <button
        aria-label="Đóng menu"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border"
      >
        <CloseIcon />
      </button>
    </div>
    {/* Independent Scroll Container */}
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      ...
    </div>
  </div>
  ```
- **Top Bar độc lập với nút Đóng (X) cỡ lớn**: Kích thước vùng bấm đạt chuẩn **44×44px**, dễ dàng nhận diện và thao tác bằng ngón tay cái.
- **Vùng cuộn độc lập**: Áp dụng `overflow-y-auto`, `overscroll-contain`, và đệm đáy an toàn `pb-[calc(5rem+env(safe-area-inset-bottom,0px))]` tránh bị che khuất bởi thanh điều hướng hệ thống (Home Indicator) trên iOS/Android.
- **Tự động khóa cuộn trang chính**: Khi menu mở, nền phía sau đứng yên, trải nghiệm đóng/mở mượt mà và tự nhiên như ứng dụng Native.

---

### 2. Menu Tài khoản Quản trị viên (Admin Account Dropdown)

#### Vấn đề trước khi sửa:

- Trên thanh tiêu đề Admin Dashboard (`AdminShell`), nút bấm thông tin người dùng được đặt ở góc trên bên phải.
- Khi nhấn mở menu, menu dropdown sử dụng vị trí `absolute right-0 top-full mt-2 w-72`.
- Trên các màn hình di động hẹp (320px, 360px, 375px):
  - Chiều rộng của Dropdown (288px - 320px) cộng với lề phải làm cho **cạnh trái của menu bị tràn ra ngoài khung nhìn bên trái màn hình** (Left-edge off-screen overflow).
  - Người dùng không thể đọc được nội dung chữ bên trái hoặc không bấm được vào các nút chức năng.
  - Các mục như "Đổi mật khẩu", "Về trang chủ", "Đăng xuất" có chiều cao nhỏ hơn 36px, khó bấm chính xác trên màn hình cảm ứng.

#### Giải pháp thiết kế & kỹ thuật đã triển khai (`src/components/admin/admin-shell.tsx`):

- **Phân tách hành vi giao diện theo kích thước màn hình (Adaptive UI)**:
  - **Trên Mobile (`<sm`, <640px)**: Chuyển đổi thành **Bottom Sheet** (Ngăn kéo từ đáy màn hình):
    ```tsx
    {
      /* Backdrop mờ phía sau */
    }
    ;<div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden"
      onClick={() => setUserMenuOpen(false)}
    />

    {
      /* Bottom Sheet trượt từ đáy */
    }
    ;<div className="fixed inset-x-0 bottom-0 z-50 rounded-t-panel border-t border-border bg-canvas p-4 shadow-xl sm:hidden">
      <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-border" />
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <UserBadge />
        <CloseButton />
      </div>
      <div className="flex flex-col gap-1 pt-2">
        {/* Nút bấm chuẩn Touch Target >= 44px */}
        <button className="flex min-h-[44px] items-center gap-3 px-3 py-2.5 rounded-btn hover:bg-canvas-subtle">
          Đổi mật khẩu
        </button>
        ...
      </div>
    </div>
    ```
  - **Trên Tablet/Desktop (`>=sm`)**: Duy trì Dropdown căn phải thanh lịch với ràng buộc `max-w-[calc(100vw-2rem)]`, đảm bảo không bao giờ bị tràn lề.
- **Chuẩn hóa Touch Targets**: Toàn bộ nút bấm thao tác trên Mobile đều có chiều cao tối thiểu **`min-h-[44px]`**, có phản hồi thị giác khi chạm.

---

### 3. Ngăn chặn hiện tượng Phóng to tự động (Auto-zoom) trên iOS Safari

#### Vấn đề:

- Trên hệ điều hành iOS (iPhone), khi người dùng nhấn (focus) vào một ô nhập liệu (`input`, `select`, `textarea`) có kích thước chữ nhỏ hơn `16px`, trình duyệt Safari sẽ **tự động phóng to toàn bộ giao diện (zoom-in)**.
- Điều này phá vỡ bố cục, làm lệch thanh Header cố định và khiến người dùng phải dùng 2 ngón tay thu nhỏ lại rất phiền toái.

#### Khắc phục trong `src/app/(frontend)/styles.css`:

```css
@media (max-width: 639.98px) {
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
  select,
  textarea {
    font-size: 16px !important;
  }
}
```

- Đảm bảo font size trên thiết bị di động luôn đạt 16px, loại bỏ 100% tình trạng tự động zoom không mong muốn.

---

### 4. Triệt tiêu tràn viền ngang (Horizontal Overflow & Layout Blowout)

#### Khắc phục trong `src/app/(frontend)/styles.css`:

```css
html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

.overflow-x-auto,
.overflow-y-auto {
  -webkit-overflow-scrolling: touch;
}
```

- Khóa toàn bộ hiện tượng trượt ngang ngoài ý muốn do các phần tử con có kích thước cố định.
- Cho phép cuộn quán tính mượt mà (Inertial smooth scrolling) trên các bảng dữ liệu quản trị (Bookings Table, Payments Table, Fleets Table).

---

## III. BẢNG TỔNG HỢP KIỂM CHỨNG TOUCH TARGET & VIEWPORT

| Thành phần giao diện                        | Viewport kiểm thử | Kích thước Touch Target  | Kết quả kiểm tra                  | Trạng thái |
| :------------------------------------------ | :---------------- | :----------------------- | :-------------------------------- | :--------: |
| **Nút mở Hamburger**                        | 320px - 412px     | 44px × 44px              | Nhấn nhạy, không bấm nhầm         |   `PASS`   |
| **Nút đóng Mobile Menu (X)**                | 320px - 412px     | 44px × 44px              | Vị trí thuận tay cái, dễ bấm      |   `PASS`   |
| **Liên kết trong Drawer Menu**              | 320px - 412px     | Chiều cao 48px           | Cách đều, không đè lấn            |   `PASS`   |
| **Admin User Bottom Sheet**                 | 320px - 412px     | Min-height 44px/mục      | Hiển thị trọn vẹn, không tràn     |   `PASS`   |
| **Nút chọn Kế hoạch thanh toán (Checkout)** | 320px - 412px     | Thẻ chạm 100% chiều rộng | Phân biệt rõ Cọc 30% vs Đóng 100% |   `PASS`   |
| **Bảng danh sách đơn thuê (Admin)**         | 320px - 768px     | Cuộn ngang độc lập       | Có bóng chỉ báo cuộn, mượt mà     |   `PASS`   |
| **Form nhập liệu tìm kiếm xe**              | 320px - 412px     | Font-size 16px           | Không bị Safari phóng to          |   `PASS`   |

---

_Tài liệu ban hành bởi Nhóm UI/UX & QA NORI Vehicle Rental — 2026-11-20._
