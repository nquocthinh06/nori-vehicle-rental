# NORI VEHICLE RENTAL — MA TRẬN CHUYỂN ĐỔI TRẠNG THÁI (STATE TRANSITION MATRIX)

- **Ngày kiểm toán**: 2026-11-20
- **Phạm vi**: 3 máy trạng thái cốt lõi: Đơn thuê (`Bookings`), Điều chuyển xe (`VehicleTransfers`) và Giao dịch thanh toán (`Payments`).

---

## 1. Ma trận Chuyển đổi Trạng thái Đơn thuê (Bookings 9×9 Matrix)

Hệ thống quản lý vòng đời đơn thuê thông qua 9 trạng thái chuẩn hóa:

1. `PENDING`: Đơn mới tạo, đang chờ quản trị viên duyệt.
2. `CONFIRMED`: Đơn đã được duyệt, chờ khách đặt cọc giữ xe.
3. `DEPOSIT_PAID`: Khách đã hoàn tất cọc 30% giữ xe (hoặc trả 100% tiền thuê).
4. `READY_FOR_HANDOVER`: Xe đã được kiểm tra, rửa sạch và sẵn sàng bàn giao tại chi nhánh/điểm hẹn.
5. `ONGOING`: Khách đã nhận bàn giao xe, xe đang trong thời gian di chuyển thực tế.
6. `INSPECTING`: Khách đã trả xe, nhân viên kỹ thuật đang kiểm tra hiện trạng xe, ODO, xăng/pin.
7. `COMPLETED`: Quyết toán tất toán hợp đồng, thu đủ tiền thuê và hoàn trả ký quỹ thế chấp.
8. `CANCELLED`: Đơn bị hủy (do khách hàng chủ động hủy khi còn PENDING hoặc thỏa thuận).
9. `REJECTED`: Đơn bị từ chối phê duyệt bởi quản trị viên.

### Bảng Ma trận 9×9 Chuyển đổi Trạng thái

| Trạng thái hiện tại       | $\rightarrow$ PENDING | $\rightarrow$ CONFIRMED | $\rightarrow$ DEPOSIT_PAID | $\rightarrow$ READY_FOR_HANDOVER |       $\rightarrow$ ONGOING       | $\rightarrow$ INSPECTING |         $\rightarrow$ COMPLETED          | $\rightarrow$ CANCELLED | $\rightarrow$ REJECTED |
| :------------------------ | :-------------------: | :---------------------: | :------------------------: | :------------------------------: | :-------------------------------: | :----------------------: | :--------------------------------------: | :---------------------: | :--------------------: |
| **1. PENDING**            |          Cấm          |        **Admin**        |            Cấm             |               Cấm                |                Cấm                |           Cấm            |                   Cấm                    |    **Khách / Admin**    |       **Admin**        |
| **2. CONFIRMED**          |          Cấm          |           Cấm           |    **Hệ thống / Admin**    |               Cấm                |                Cấm                |           Cấm            |                   Cấm                    |        **Admin**        |          Cấm           |
| **3. DEPOSIT_PAID**       |          Cấm          |           Cấm           |            Cấm             |        **Admin / Staff**         |                Cấm                |           Cấm            |                   Cấm                    |  **Admin** (Hoàn cọc)   |          Cấm           |
| **4. READY_FOR_HANDOVER** |          Cấm          |           Cấm           |            Cấm             |               Cấm                | **Admin / Staff** (Handover Gate) |           Cấm            |                   Cấm                    |        **Admin**        |          Cấm           |
| **5. ONGOING**            |          Cấm          |           Cấm           |            Cấm             |               Cấm                |                Cấm                |    **Admin / Staff**     |                   Cấm                    |   Cấm (Đang lăn bánh)   |          Cấm           |
| **6. INSPECTING**         |          Cấm          |           Cấm           |            Cấm             |               Cấm                |                Cấm                |           Cấm            | **Admin / Accountant** (Settlement Gate) |           Cấm           |          Cấm           |
| **7. COMPLETED**          |          Cấm          |           Cấm           |            Cấm             |               Cấm                |                Cấm                |           Cấm            |          Cấm (Trạng thái cuối)           |           Cấm           |          Cấm           |
| **8. CANCELLED**          |          Cấm          |           Cấm           |            Cấm             |               Cấm                |                Cấm                |           Cấm            |                   Cấm                    |  Cấm (Trạng thái cuối)  |          Cấm           |
| **9. REJECTED**           |          Cấm          |           Cấm           |            Cấm             |               Cấm                |                Cấm                |           Cấm            |                   Cấm                    |           Cấm           | Cấm (Trạng thái cuối)  |

### Các Chốt chặn Kiểm soát Nghiệp vụ (Business Integrity Gates)

1. **Chốt chặn Giao xe (Pre-Handover Gate)**:
   Không thể chuyển từ `READY_FOR_HANDOVER` sang `ONGOING` nếu:
   - Chưa thu đủ tiền thuê theo kế hoạch đã chọn (`paidAmount < requiredPreHandoverAmount`).
   - Chưa xác nhận tài sản thế chấp / ký quỹ bảo đảm tài sản (`isDepositSatisfied === false`).
2. **Chốt chặn Tất toán Hợp đồng (Post-Return Settlement Gate)**:
   Không thể chuyển từ `INSPECTING` sang `COMPLETED` nếu:
   - Khách hàng còn nợ bất kỳ khoản tiền thuê gốc hoặc phụ phí phát sinh nào (`totalRemainingRentalObligation > 0`).
3. **Quyền Chỉnh sửa Đơn thuê của Khách hàng**:
   Khách hàng chỉ được phép chỉnh sửa ngày, giờ, ghi chú, tùy chọn khi đơn ở trạng thái `PENDING` và chưa có khoản thanh toán nào phát sinh. Khi Admin duyệt sang `CONFIRMED`, backend từ chối mọi yêu cầu chỉnh sửa từ client (`403 FORBIDDEN`).

---

## 2. Ma trận Chuyển đổi Điều chuyển Phương tiện (Vehicle Transfers 9×9 Matrix)

Hệ thống quản lý luồng điều chuyển xe giữa các chi nhánh (`VehicleTransfers`) theo chuẩn ACID:

- `DRAFT`: Bản nháp kế hoạch điều chuyển.
- `PENDING_APPROVAL`: Chờ người quản lý chi nhánh phê duyệt.
- `APPROVED`: Đã duyệt kế hoạch điều chuyển, khóa lịch xe nguyên tử.
- `IN_TRANSIT`: Xe đã rời kho/chi nhánh xuất phát, đang trên đường vận chuyển.
- `ARRIVED`: Xe đã đến chi nhánh nhận, đang kiểm tra tiếp nhận.
- `COMPLETED`: Hoàn tất điều chuyển, cập nhật chi nhánh hiện tại của xe sang chi nhánh mới.
- `EXCEPTION`: Sự cố phát sinh trong hành trình (hư hỏng, va chạm, chậm trễ).
- `CANCELLED`: Hủy điều chuyển (chỉ cho phép trước khi xuất phát `IN_TRANSIT`).
- `REJECTED`: Từ chối kế hoạch điều chuyển.

### Bất biến nghiêm ngặt của Điều chuyển xe:

- **Cấm hủy sau khi đã xuất phát**: Khi đơn đã ở trạng thái `IN_TRANSIT`, hệ thống chặn tuyệt đối thao tác `CANCEL` để tránh mất dấu vết vị trí xe trên thực địa.
- **Chống hoàn tất trùng lặp (Double-Complete Guard)**: Chặn `409 CONFLICT` nếu đơn đã được xác nhận hoàn tất trước đó.
- **Tự động Rollback**: Nếu quá trình cập nhật chi nhánh sở hữu của cá thể xe gặp lỗi, toàn bộ giao dịch cập nhật trạng thái điều chuyển được khôi phục nguyên trạng.

---

## 3. Ma trận Giao dịch Thanh toán (Payments 5 Trạng thái)

1. `PENDING`: Yêu cầu thanh toán vừa được tạo, mã QR VietQR SePay đang hiển thị.
2. `COMPLETED`: Giao dịch đã khớp tiền thành công qua Webhook SePay hoặc xác nhận thủ công.
3. `FAILED`: Giao dịch bị ngân hàng hoặc cổng thanh toán báo lỗi.
4. `CANCELLED`: Khách hàng bấm hủy giao dịch hoặc đơn thuê tương ứng bị từ chối.
5. `REFUNDED`: Kế toán đã thực hiện hoàn trả tiền cho khách hàng.

### Bất biến thanh toán:

- Giao dịch ở trạng thái cuối (`COMPLETED`, `REFUNDED`, `CANCELLED`) không thể bị sửa đổi hoặc chuyển ngược về `PENDING`.
- Tự động hủy giao dịch treo: Khi một đơn thuê bị `CANCELLED` hoặc `REJECTED`, hook `afterChange` tự động quét các bản ghi `payments` đang `PENDING` của đơn đó và chuyển sang `CANCELLED`.
