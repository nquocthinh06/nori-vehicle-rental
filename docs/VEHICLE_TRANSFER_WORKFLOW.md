# NORI Vehicle Rental — Vehicle Transfer Workflow (Quy trình điều chuyển phương tiện)

## 1. Máy trạng thái (State Machine)

```mermaid
stateDiagram-v2
  [*] --> DRAFT : Tạo phiếu nháp
  [*] --> PENDING_APPROVAL : Tạo & gửi duyệt
  DRAFT --> PENDING_APPROVAL : Gửi phê duyệt
  DRAFT --> CANCELLED : Hủy trước duyệt
  PENDING_APPROVAL --> APPROVED : Phê duyệt & khóa rental_days
  PENDING_APPROVAL --> REJECTED : Từ chối
  PENDING_APPROVAL --> CANCELLED : Hủy trước duyệt
  APPROVED --> IN_TRANSIT : Xuất kho (xe rời tồn kho nguồn)
  APPROVED --> CANCELLED : Hủy trước xuất kho (giải phóng khóa ngày)
  IN_TRANSIT --> ARRIVED : Đến kho đích (chưa sẵn sàng thuê)
  IN_TRANSIT --> EXCEPTION : Phát sinh sự cố / trễ / hư hỏng
  ARRIVED --> COMPLETED : Xác nhận kiểm tra & nhập kho đích
  ARRIVED --> EXCEPTION : Phát hiện sự cố khi nhận
  EXCEPTION --> IN_TRANSIT : Tiếp tục hành trình
  EXCEPTION --> ARRIVED : Đưa về kho đích
  EXCEPTION --> COMPLETED : Hoàn tất xử lý ngoại lệ
  EXCEPTION --> CANCELLED : Hủy ngoại lệ (chuyển xe sang PENDING_INSPECTION)
  COMPLETED --> [*]
  REJECTED --> [*]
  CANCELLED --> [*]
```

---

## 2. Quy tắc toàn vẹn nghiệp vụ (TR-01 → TR-12)

1. **Chặn điều chuyển bất hợp lệ**: Không cho phép tạo phiếu nếu xe đang `RENTED`, `SOLD`, `IN_TRANSIT`, hoặc `MAINTENANCE` (trừ quy trình ngoại lệ), hoặc kho đích hết sức chứa (khi `allowOverCapacity = false`), hoặc trùng lịch `bookings` / `rental-days` / `vehicle-transfers` khác.
2. **Khóa lịch toàn cục khi `APPROVED`**: Ghi các bản ghi `rental_days` (`lockType = 'TRANSFER'`, khóa `vehicleId:day`) trong SQLite transaction. Mọi đơn thuê mới chồng chéo sẽ bị chặn ngay lập tức.
3. **Xuất kho (`IN_TRANSIT`)**: Cập nhật `vehicles.operationStatus = 'IN_TRANSIT'`, `currentWarehouse = null`, `nextExpectedBranch = toBranch`, ghi `vehicle-location-history (TRANSFER_DEPARTURE)`. Xe **không được tính vào tồn kho vật lý** của cả kho xuất lẫn kho nhận!
4. **Cấm hủy trực tiếp sau khi xuất kho (TR-10)**: Từ `IN_TRANSIT` không được chuyển sang `CANCELLED`; bắt buộc qua quy trình `EXCEPTION` để bảo toàn dấu vết vị trí thực tế.
5. **Xe đến nơi (`ARRIVED`, TR-06)**: Ghi nhận `TRANSFER_ARRIVAL` nhưng **chưa chuyển xe thành `READY` tại kho đích** cho đến khi nhân viên chi nhánh nhận hoàn tất đối chiếu và xác nhận `COMPLETED`.
6. **Hoàn tất nguyên tử (`COMPLETED`, TR-07 / TR-08 / TR-11)**:
   - Thực hiện trong SQLite `BEGIN IMMEDIATE ... COMMIT` transaction.
   - Cập nhật đồng thời `vehicles.currentBranch = toBranch`, `currentWarehouse = toWarehouse`, `operationStatus = 'READY'` (hoặc `'PENDING_INSPECTION'`), giải phóng `rental_days`, ghi `TRANSFER_COMPLETED` và tăng `revision`.
   - Nếu xảy ra lỗi giữa transaction, toàn bộ thay đổi được `ROLLBACK` nguyên tử.
   - Chặn xác nhận hoàn tất 2 lần (double-complete) bằng cả kiểm tra trạng thái terminal lẫn optimistic locking `expectedRevision`.
7. **Cảnh báo trễ lịch (TR-12)**: Cập nhật `scheduledArrivalAt` tự động đối chiếu các đơn thuê tương lai của xe đó và gắn `delayedWarning = true` cùng danh sách `affectedBookingKeys`.

---

## 3. Sequence Diagram: Atomic Transfer Completion

```mermaid
sequenceDiagram
  actor Mgr as "Nhân viên Kho Đích"
  participant API as "PATCH /nori-api/dashboard/transfers"
  participant Svc as "transitionVehicleTransferAtomic()"
  participant DB as "SQLite Transaction"

  Mgr->>API: PATCH { transferId, nextStatus: "COMPLETED", expectedRevision, odometerAfter }
  API->>Svc: Kiểm tra quyền chi nhánh nhận + revision + state transition
  Svc->>DB: BEGIN IMMEDIATE
  Svc->>DB: UPDATE vehicles (currentBranch=B, currentWarehouse=whB, operationStatus=READY)
  Svc->>DB: DELETE rental_days WHERE booking_key = transferCode
  Svc->>DB: INSERT vehicle_location_history (TRANSFER_COMPLETED)
  Svc->>DB: UPDATE vehicle_transfers (status=COMPLETED, revision+1)
  Svc->>DB: INSERT audit_logs
  alt Thành công
    Svc->>DB: COMMIT
    Svc-->>API: 200 OK
  else Lỗi bất kỳ giữa chừng
    Svc->>DB: ROLLBACK (xe & khóa lịch giữ nguyên vẹn)
    Svc-->>API: 409 / 500 Error
  end
```
