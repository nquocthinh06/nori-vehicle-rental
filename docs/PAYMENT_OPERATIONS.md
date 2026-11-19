# Sổ tay Vận hành & Đối soát Thanh toán — NORI Vehicle Rental

## 1. Quy trình vận hành hằng ngày (Admin / Kế toán)

1. Mở `/dashboard/payments`:
   - Kiểm tra thẻ KPI **Giao dịch ngoại lệ cần đối soát**.
   - Nhấn **Quét & đóng mã QR quá hạn** nếu cần làm sạch ngay các mã `PENDING` quá hạn (hệ thống cũng tự động quét khi khách hoặc Admin tải trang).
2. Chuyển sang tab **Đối soát & Ngoại lệ**:
   - **Chuyển thiếu tiền (`UNDERPAID`)**:
     - Liên hệ khách hàng chuyển bổ sung phần còn thiếu (hệ thống tự cộng dồn nếu khách chuyển thêm đúng mã `NORIPAY...`), hoặc đối chiếu sao kê và nhấn **Xử lý đối soát**.
   - **Chuyển dư tiền (`OVERPAID`)**:
     - Nghĩa vụ thanh toán đơn thuê đã tự động được xác nhận. Kế toán tạo phiếu hoàn trả khoản dư (`refundType: OVERPAYMENT`) trên tab **Hoàn tiền**.
   - **Thanh toán đến muộn / Đơn đã hủy (`LATE_PAYMENT`)**:
     - Hệ thống **không tự mở lại lịch xe** nhằm bảo vệ chống đặt trùng xe. Admin kiểm tra lịch xe thực tế: nếu xe còn trống có thể tạo đơn mới/xác nhận, nếu không thì tiến hành hoàn tiền `CANCELLATION` cho khách.
   - **Chưa xác định đơn thuê (`UNMATCHED`)**:
     - Khách chuyển khoản sai nội dung không chứa `NORIPAY...`. Kế toán kiểm tra tên/SĐT/số tiền trên sao kê và gọi tác vụ `assign_booking` hoặc xử lý đối soát để gán đúng đơn thuê.

## 2. Quy trình Xác nhận Thủ công (`PAY-025`)

Khi khách thanh toán tiền mặt tại quầy, quẹt thẻ POS hoặc chuyển khoản không qua SePay:

1. Tại `/dashboard/payments` → nhấn **Xác nhận thu** trên giao dịch (hoặc **Ghi nhận thanh toán / hoàn tiền** để tạo mới).
2. Nhập đầy đủ:
   - Số tiền thực nhận (VNĐ).
   - Mã giao dịch ngân hàng / Số phiếu thu biên lai (`transactionEvidence`).
   - Lý do xác nhận thủ công (`reason`).
3. Hệ thống tự động kiểm tra nếu Webhook đã xác nhận cùng thời điểm để chống cộng tiền trùng lặp, cập nhật trạng thái đơn thuê và lưu bản ghi kiểm toán vào `audit_logs`.

## 3. Quy trình Hoàn tiền & Quyết toán Cọc Tài sản

- **Hoàn tiền đặt cọc / Điều chỉnh giá / Hoàn tiền hủy đơn**: Tạo phiếu trên tab **Hoàn tiền** → chuyển khoản ngân hàng cho khách → nhập mã chứng từ ngân hàng (`providerRefundId`) và xác nhận **Hoàn tất chi** (`REFUNDED`).
- **Hoàn trả tiền cọc bảo đảm tài sản (`SECURITY_DEPOSIT`)**: Sau khi kiểm tra xe trả không phát sinh hư hại, tạo phiếu hoàn tiền loại `SECURITY_DEPOSIT_RETURN`. Khoản này luôn được tách biệt khỏi doanh thu tiền thuê trên `/dashboard/reports`.

## 4. Giám sát Webhook & Xuất báo cáo

- Theo dõi tab **Sự kiện Webhook** để kiểm tra tỷ lệ `VERIFIED` vs `FAILED_SIGNATURE` và trạng thái `PROCESSED` / `IGNORED_DUPLICATE` / `REVIEW_REQUIRED`.
- Xuất file CSV định kỳ phục vụ kế toán qua `/dashboard/payments` (`Xuất CSV Giao dịch`) và `/dashboard/reports` (`CSV Tài chính`).
