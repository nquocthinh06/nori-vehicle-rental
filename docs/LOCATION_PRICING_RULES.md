# NORI Vehicle Rental — Location-Based Pricing & One-Way Rules

## 1. Thứ tự ưu tiên xác định giá thuê (Pricing Priority Hierarchy)

Hàm thuần `resolveLocationPricing()` trong `src/lib/multi-branch-rules.ts` đánh giá theo thứ tự ưu tiên chặt chẽ từ cao xuống thấp cho ngày nhận xe (`referenceDate`):

1. **`VEHICLE_BRANCH`** _(Ưu tiên 1)_: Quy tắc áp dụng cho đúng `vehicleId` tại đúng `pickupBranchId` (và trong hiệu lực `[validFrom, validTo]`).
2. **`MODEL_BRANCH`** _(Ưu tiên 2)_: Quy tắc áp dụng cho đúng `vehicleModelId` tại đúng `pickupBranchId`.
3. **`VEHICLE_BASE`** _(Ưu tiên 3)_: Giá cơ sở (`pricePerDay`, `pricePerWeek`, `pricePerMonth`, `weekendSurcharge`, `holidaySurcharge`, `depositAmount`) được cấu hình trực tiếp trên hồ sơ phương tiện (`vehicles`).
4. **`BRANCH_DEFAULT`** _(Ưu tiên 4)_: Quy tắc giá mặc định của `pickupBranchId`.
5. **`GLOBAL_DEFAULT`** _(Ưu tiên 5)_: Quy tắc giá mặc định toàn hệ thống.

### Quy tắc an toàn tài chính (PR-01 → PR-10)

- **Không mặc định giá thiếu bằng 0**: Nếu không tầng nào có `dailyPrice > 0`, hệ thống trả về `PRICE_NOT_CONFIGURED` (`409`) và chặn đặt thuê — tuyệt đối không tính `0 ₫`.
- **Phân biệt `0` và `null`**: Các phụ phí (`deliveryFee`, `oneWayFee`, `locationSurcharge`, `afterHoursFee`) chấp nhận `0` (miễn phí tường minh) và tách biệt với `null`/`undefined` (chưa cấu hình → kế thừa tầng thấp hơn).
- **Chặn số âm / số thập phân**: Mọi trường tiền tệ kiểm tra bằng `validateNonNegativeVnd()` (số nguyên an toàn `>= 0`, đơn vị VNĐ).
- **Phí một chiều không bao giờ cộng cho đơn cùng chi nhánh (PR-03)**: Khi `pickupBranchId === returnBranchId`, `oneWayFee` luôn bị ép bằng `0`.
- **Tiền đặt cọc tách biệt hoàn toàn (PR-10)**: `depositAmount` hiển thị tách riêng và không cộng dồn vào `estimatedTotal` hay `rentalRevenue`.

---

## 2. Công thức tính tổng giá đơn thuê đa chi nhánh

$$\text{estimatedTotal} = \max\Big(0,\; \text{basePrice} + \text{weekendSurcharge} + \text{holidaySurcharge} + \text{locationSurcharge} + \text{oneWayFee} + \text{deliveryFee} + \text{pickupFee} + \text{afterHoursFee} + \text{addonFee} - \text{longTermDiscount} - \text{promoDiscount}\Big)$$

- Toàn bộ tính toán thực hiện lại có thẩm quyền ở **Backend** (`evaluateVehicleBookingAvailabilityAndPricing` & `Bookings.beforeValidate`).
- Khi đạt ngưỡng `freeOverOrderAmount` (khu vực giao) hoặc `freeDeliveryMinOrder` (chi nhánh), hệ thống tự động miễn phí giao/thu hồi tận nơi.
- **Khuyến mãi theo phạm vi chi nhánh (PR-04..PR-06)**: `promotions.branchScope = 'SPECIFIC_BRANCHES'` chỉ hợp lệ khi `pickupBranchId` nằm trong `applicableBranchIds`. Nếu khách đổi chi nhánh nhận tại Checkout, backend tự động kiểm tra lại và gỡ mã nếu không còn hợp lệ.

---

## 3. Price Snapshot bất biến (PR-07, PR-08)

Tại thời điểm tạo hoặc cập nhật đơn `PENDING`, toàn bộ cấu trúc giá và quy tắc đã áp dụng được đóng băng vào `bookings.pricingRuleSnapshot` (JSON) cùng các cột snapshot (`dailyPriceSnapshot`, `locationSurchargeSnapshot`, `oneWayFeeSnapshot`, `deliveryFeeSnapshot`, `pickupFeeSnapshot`, `afterHoursFeeSnapshot`, `revenueSplitPickupPercent`).

> Khi quản trị viên thay đổi hoặc xóa quy tắc giá / phí một chiều về sau, mọi đơn thuê đã tạo hoặc đã xác nhận vẫn giữ nguyên 100% giá trị ban đầu.

---

## 4. Chính sách phân bổ doanh thu tuyến một chiều (Zero Double-Counting)

Trong `one-way-rental-rules`:

- `PICKUP_BRANCH`: 100% chi nhánh nhận (A), 0% chi nhánh trả (B).
- `RETURN_BRANCH`: 0% chi nhánh nhận (A), 100% chi nhánh trả (B).
- `SPLIT_50_50`: 50% / 50%.
- `CUSTOM_PERCENT`: Tỷ lệ `pickupBranchSharePercent` (`0..100%`) cho A, phần bù nguyên VNĐ `(100 - p)%` cho B (`returnShare = amount - pickupShare`), đảm bảo tổng không bao giờ lệch 1 VNĐ do làm tròn.
