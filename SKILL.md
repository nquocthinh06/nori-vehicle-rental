---
name: design-system-nori
description: Xây dựng, duy trì và kiểm thử giao diện NORI cho thuê và tìm mua xe bằng semantic tokens, component dùng chung, dữ liệu Payload xác thực và các quy tắc WCAG 2.2 AA.
---

# NORI Design System Skill

## 1. Context & goals

NORI giúp khách chọn phương tiện phù hợp và an tâm lên kế hoạch cho hành trình. Giao diện must rõ ràng, tinh tế, có khoảng thở và trung thực về dữ liệu.

Tài liệu này chuyển hóa SKILL.md/ DESIGN.md tham khảo của VinFast thành hướng dẫn riêng cho NORI. Tham khảo cách đặt hình ảnh lớn, phân tầng nội dung và điều hướng; không tái sử dụng logo, màu nhận diện, nội dung, số liệu hoặc bố cục nguyên bản của VinFast.

Khung ban đầu không có bộ nhận diện NORI hoặc component sẵn có. Phiên bản này giữ tên NORI, sử dụng wordmark riêng `nori.`, xanh ngọc, nền trắng và font Be Vietnam Pro hỗ trợ tiếng Việt.

## 2. Sources of truth

1. Yêu cầu của người dùng và đặc tả nghiệp vụ được cung cấp.
2. `DESIGN.md` và semantic tokens trong `src/app/(frontend)/styles.css`.
3. Primitives trong `src/components/ui/`.
4. Dữ liệu và relationship thực tế trong Payload.
5. `.agents/skills/nori-performance/SKILL.md` (`nori-performance`) — bộ quy tắc bắt buộc về hiệu năng, tối giản mã nguồn, tối ưu media, cô lập thanh toán và release gate.

Component must dùng primitives NORI thay vì tái tạo button, input, heading hoặc badge cục bộ. Chỉ lớp primitive được định nghĩa HTML control và typography cơ bản.

## 3. Foundation workflow

Trước khi sửa giao diện:

1. Đọc component, service và schema liên quan; không suy luận rằng API không có khi chưa kiểm tra.
2. Xác định loại route: static, cached/ISR hay operational request-time.
3. Chọn semantic tokens và primitives hiện có.
4. Mô tả trạng thái, dữ liệu còn thiếu và hành vi trên mobile.
5. Triển khai, chạy typecheck, kiểm thử hành vi và kiểm thử production delivery.

Không thay đổi managed Payload runtime, image loader, Admin auth hoặc lifecycle scripts để né lỗi giao diện.

## 4. Tokens

Màu must thể hiện vai trò: `brand`, `brand-hover`, `ink`, `muted`, `canvas`, `subtle`, `soft`, `line`, `danger`, `warning`, `focus`, `night`, `inverse`.

Typography must dùng scale `micro → caption → small → body → lead → subtitle → title → section → display → hero`. Không thêm giá trị riêng trong từng component.

Spacing should dùng thang Tailwind 4px, cho phép nửa bước 2px cho icon/label. Layout must dùng `Container`, `page`, `section`, `header`, `gallery` và các sizing token có tên.

Radius must dùng `control`, `card`, `panel`, `pill`. Elevation must dùng `card`, `float`, `focus` đúng ngữ cảnh.

## 5. Component rules

### Button / ButtonLink / IconButton

- Button must mặc định `type="button"`; thao tác gửi form phải khai báo `type="submit"`.
- Link must dùng cho điều hướng; không bọc link trong button hoặc ngược lại.
- IconButton must có accessible name cụ thể bằng tiếng Việt.
- Loading must có `aria-busy` và khóa gửi lặp; không đổi chiều rộng hoặc giả mạo thành công.
- Disabled must dùng native disabled, không chỉ giảm opacity.
- Hành vi nguy hiểm must có xác nhận trước khi gửi yêu cầu.

### Input / Select / Textarea / Checkbox

- Label must luôn hiển thị và liên kết bằng `htmlFor`/`id`.
- Lỗi must hiển thị tại field với `aria-invalid` và `aria-describedby`.
- Placeholder must không thay thế label.
- Dữ liệu must được validate và allowlist lại phía server.
- Form should dùng đúng `autocomplete`, `inputMode`, type và giới hạn nội dung.
- Giá/ODO must không được điền mặc định bằng dữ liệu giả.

### Header / Mega menu

- Trigger must là button với `aria-expanded` và `aria-controls`.
- Menu must mở bằng click, Enter/Space; không phụ thuộc hover.
- Escape must đóng menu; focus must trở về trigger.
- Mobile must có đường dẫn tương đương desktop; không giấu chức năng thiết yếu.
- Điều hướng cùng route nhưng khác query must áp dụng bộ lọc mới và đóng menu.

### VehicleCard / Catalogue

- Card must phân biệt ảnh catalogue với ảnh chiếc xe thực tế.
- Giá must lấy từ inventory đang kinh doanh, không lấy từ mảng mock.
- Không có giá must hiển thị “Chưa cập nhật”.
- Tìm kiếm/filter/sort/page must thay đổi kết quả thực tế.
- Không có kết quả must có giải thích và hành động xóa bộ lọc.
- Tên dài must wrap hoặc clamp hợp lý, không kéo tràn layout.

### Vehicle detail / Gallery / Variants

- Public detail must dùng unique slug và `findBySlug` thông qua query dùng chung.
- Slug không tồn tại hoặc không được công bố must trả giao diện 404.
- Nội/ngoại thất must không dùng ảnh của dòng hoặc phiên bản khác để lấp chỗ trống.
- Chọn màu/phiên bản must cập nhật đúng relationship hình ảnh; thiếu ảnh phải thông báo.
- Lightbox must giữ focus, hỗ trợ Escape và trả focus về nút mở.
- ODO, ngày kiểm tra và tình trạng must thuộc từng xe thực tế.

### Calendar / Booking / Checkout

- Ngày must là `YYYY-MM-DD`, xử lý theo `Asia/Ho_Chi_Minh`.
- Khoảng thuê must là `[startDate, endDate)`, 1–30 ngày; ngày nhận không quá 90 ngày tới.
- Lịch chưa tải hoặc lỗi must không được hiển thị như lịch trống.
- Kiểm tra khả dụng must chỉ là báo giá tham khảo; tạo đơn phải kiểm tra lại.
- Customer/giá/tổng tiền/trạng thái must do server quyết định.
- Không có transaction an toàn must từ chối giữ lịch.
- Checkout must giữ rõ bước tạo đơn `PENDING` chưa thu tiền ngay; mọi giao dịch đặt cọc/thanh toán trực tuyến chỉ được khởi tạo sau khi đơn được duyệt tại `/my-bookings` thông qua Payment Adapter Pattern (`MOCK` / `SANDBOX` / `PRODUCTION`), không tự xác nhận thanh toán từ phía client và không dùng tiền thật trong kiểm thử.

### Account / Administration

- App users must tách biệt khỏi CMS admins.
- Tài khoản khách must không truy cập Admin bằng cách sửa UI hoặc request.
- Mọi read/update bản ghi riêng tư must có ownership và `overrideAccess: false`.
- Trạng thái booking must theo ma trận được định nghĩa ở `rental-rules.ts`.
- Dashboard must đọc dữ liệu thật; không sinh số liệu, biểu đồ hoặc doanh thu ảo.

## 6. Required state matrix

Mỗi family must xử lý trạng thái phù hợp:

| State         | Yêu cầu                                                       |
| ------------- | ------------------------------------------------------------- |
| Default       | Vai trò, label và ưu tiên rõ                                  |
| Hover         | Đổi màu/elevation nhẹ; không là cách duy nhất để tiếp cận     |
| Focus-visible | Viền focus rõ, không bị cắt hoặc bị header che                |
| Active        | Phản hồi bấm nhẹ, không dịch layout                           |
| Disabled      | Native disabled; có lý do gần control khi cần                 |
| Loading       | Spinner/skeleton, aria-busy/status, không gửi lặp             |
| Error         | Thông báo có thể hiểu, giữ dữ liệu đã nhập, có bước khắc phục |
| Empty         | Giải thích ngắn gọn, không dùng dữ liệu giả                   |

## 7. Accessibility acceptance criteria

- Must có `lang="vi"`, một h1, main landmark và skip link.
- Must vận hành được toàn bộ luồng bằng bàn phím, không keyboard trap ngoài dialog chủ ý.
- Must không dùng màu là tín hiệu trạng thái duy nhất.
- Text thông thường must đạt 4.5:1; text lớn và UI boundary/focus must hướng tới 3:1.
- Pointer target must tối thiểu 24×24 CSS px theo WCAG 2.2 AA; control chính should ít nhất 44px.
- 375px viewport must không có tràn ngang cấp trang.
- 200% zoom must không làm mất nội dung hoặc CTA.
- `prefers-reduced-motion` must loại bỏ chuyển động không thiết yếu.
- Ảnh nội dung must có alt và intrinsic dimensions; ảnh trang trí phải được ẩn phù hợp.
- Mọi kết luận “đạt” must có bằng chứng từ kiểm thử; axe không thay thế kiểm thử thủ công.

## 8. Content & tone

Ngắn gọn, bình tĩnh, có hướng tiếp theo.

- Nên: “Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày khác.”
- Không: “Error 409” hoặc “Đặt xe thành công!” khi server chưa xác nhận.
- Nên: “Chưa cập nhật ODO thực tế.”
- Không: suy đoán “Xe mới, chạy ít”, điểm đánh giá hoặc giá gạch ngang.

## 9. Anti-patterns

- Hardcode bản ghi nghiệp vụ hoặc remote image URL trong component.
- Tạo mảng inventory để lấp empty state.
- Dùng reviews, số khách, số chuyến, địa chỉ hoặc hotline không có căn cứ.
- Chỉ bảo vệ quyền ở frontend.
- Lưu token app trong localStorage hoặc trộn cookie CMS/app.
- Đặt onClick trong Server Component.
- Bỏ qua lỗi typecheck vì Next build được cấu hình cho phép bỏ qua lỗi type.
- Dùng snapshot build-time nhưng quảng cáo nội dung tự cập nhật.

## 10. Delivery checklist

- [ ] Dùng semantic tokens và primitives NORI.
- [ ] Kiểm tra tất cả trạng thái liên quan, nội dung dài và dữ liệu thiếu.
- [ ] Kiểm tra mobile, bàn phím, focus, reduced-motion và contrast.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm media:audit`, `pnpm test`, `pnpm test:admin`, `pnpm test:e2e:isolated` thành công.
- [ ] Tuân thủ đầy đủ `.agents/skills/nori-performance/SKILL.md` (ngân sách ảnh, JS, API p95, cô lập thanh toán, không polling/fetch lặp).
- [ ] `figma make verify-deploy` thành công khi chạy trong runtime Figma Make; trên local Windows kiểm chứng bằng `pnpm build` + `pnpm start:standalone` / `pnpm perf:load`.
- [ ] Truy cập mọi public route trên production artifact.
- [ ] Chứng minh CMS edit mới xuất hiện ở request production mới.
- [ ] Kiểm tra ảnh có `naturalWidth > 0 && naturalHeight > 0`, kể cả sau khi thay upload.
- [ ] Ghi rõ chức năng chưa kiểm thử hoặc dữ liệu còn thiếu.
