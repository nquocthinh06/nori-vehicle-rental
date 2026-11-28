# NORI AI Assistant — Hướng Dẫn Tích Hợp, API & Vận Hành (AI Integration Guide v2.9)

---

## 1. Cấu hình Gemini API (`@google/genai` v3.6.1) & Biến môi trường

### 1.1. Nguyên tắc lưu trữ & sử dụng khóa API
1. Khóa `GEMINI_API_KEY` **chỉ được đọc trên server** qua `getGeminiApiKeyServerOnly()` (`src/lib/ai/config.ts`).
2. Tuyệt đối **không sử dụng tiền tố `NEXT_PUBLIC_`** cho API Key (`src/lib/env.ts` tự động chặn khi khởi động).
3. Không commit `.env` lên GitHub, không in giá trị API Key ra console/log, và không bao giờ trả về trong bất kỳ API response nào (kể cả Admin API `/nori-api/dashboard/ai`).
4. Cả `scripts/start-dev.mjs`, `scripts/start-standalone.mjs` và `scripts/validate-env.mjs` đều tự động nạp `.env` gốc (chế độ không ghi đè biến môi trường hệ thống), đảm bảo Standalone Production Server luôn nhận đúng cấu hình `GEMINI_API_KEY`.

### 1.2. Cấu hình mẫu trong `.env.example`

Xem tệp [.env.example](file:///f:/1.%20University/2.%20Đồ%20án/3.%20Bài%20tập/nori-vehicle-rental/nori-vehicle-rental/nori-vehicle-rental/.env.example):

```env
NORI_AI_ENABLED=true
NORI_AI_PROVIDER=gemini

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite

NORI_AI_FREE_TIER_ONLY=true
NORI_AI_PAID_PROVIDERS_ALLOWED=false
NORI_AI_FALLBACK_ENABLED=true

NORI_AI_MAX_OUTPUT_TOKENS=1024
NORI_AI_MAX_TOOL_ROUNDS=3
NORI_AI_RATE_LIMIT_PER_MINUTE=3
NORI_AI_RATE_LIMIT_PER_DAY=20
NORI_AI_PROJECT_RPM_CAP=10
NORI_AI_PROJECT_RPD_CAP=200
NORI_AI_IP_RPM_CAP=6
NORI_AI_IP_RPD_CAP=40
NORI_AI_TIMEOUT_MS=30000
NORI_AI_STORE_CONVERSATIONS=false
```

---

## 2. Danh sách Model Gemini Hỗ trợ (`GEMINI_MODEL`)

NORI sử dụng chuẩn **Interactions API** (`client.interactions.create({ store: false, ... })`) của `@google/genai` `3.6.1`:

| Model (`GEMINI_MODEL`) | Function Calling | Structured Output | Free Tier Allowlist | Ghi chú vận hành |
| :--- | :---: | :---: | :---: | :--- |
| **`gemini-3.5-flash-lite`** *(Mặc định)* | Có (`thought` + `function_call`) | Có (`response_format`) | Có | Model mặc định tốc độ cao cho tư vấn tiếng Việt, phân loại ý định & Function Calling. |
| `gemini-3.1-flash-lite` | Có | Có | Có | Model dự phòng ổn định thuộc dòng Flash-Lite. |
| `gemini-4-hydrogen` | Có | Có | Có | Model suy luận đa bước thế hệ mới thuộc allowlist. |
| `gemini-2.5-flash-lite` / `2.0-flash-lite` | Tự động ánh xạ | Tự động ánh xạ | Tương thích cấu hình cũ | Tự động nâng cấp runtime sang `gemini-3.5-flash-lite` để tránh lỗi model ngừng hỗ trợ. |

---

## 3. Đặc tả API Endpoints & Trạng thái Chẩn đoán Admin

### 3.1. `GET /nori-api/ai/config` (Public — Dành cho Chat Widget)
Trả về trạng thái sẵn sàng công khai, lời chào và gợi ý câu hỏi nhanh. **Không bao giờ hiển thị thông báo lỗi kỹ thuật về `API Key` cho khách hàng** (sử dụng nhãn thân thiện `Chế độ tư vấn cơ bản`).

### 3.2. `POST /nori-api/ai/chat` (Hội thoại nhiều lượt)
- **Body**: `{ message: string, history?: Array<{ role: "user"|"assistant", content: string }>, sessionId?: string }`.
- **Response**: `{ requestId, reply, status, mode, modeLabel, fallbackMode, fallbackReason, intent, sessionContext, vehicleCards, comparison, quote, bookingHandoff, citations, toolsCalled, followUpSuggestions, fallbackLinks, usage, disclaimer }`.

### 3.3. `GET /nori-api/dashboard/ai` & `POST /nori-api/dashboard/ai/test` (Admin Diagnostics)
Trả về trạng thái chẩn đoán tường minh (`connectionStatus` & `connectionStatusLabel`) trên `/dashboard/ai`:
- `Gemini Connected` (`GEMINI_CONNECTED`): Kết nối Gemini hoạt động bình thường.
- `Fallback Active` (`FALLBACK_ACTIVE`): Hệ thống đang phục vụ bằng Rule-based Engine dự phòng.
- `API Configuration Missing` (`API_CONFIG_MISSING`): Máy chủ chưa được cấu hình `GEMINI_API_KEY`.
- `Quota Exceeded` (`QUOTA_EXCEEDED`): Chạm hạn mức `429` / Quota của Gemini API.
- `Connection Error` (`CONNECTION_ERROR`): Lỗi xác thực, timeout hoặc mạng tới nhà cung cấp AI.

---

## 4. Danh sách 11 Allowlisted Function Calling Tools

| # | Tên hàm | Mục đích nghiệp vụ | Nguồn dữ liệu / Service xác thực |
| :-: | :--- | :--- | :--- |
| 1 | `searchVehicles` | Tìm kiếm danh sách xe theo từ khóa, hãng, loại xe, số chỗ, giá | Payload `vehicle-models`, `vehicles` (`overrideAccess: false`) |
| 2 | `getVehicleDetails` | Kiểm tra dòng xe cụ thể (VD: `"innova có không"`), thông số, giá theo ngày/số ngày, trạng thái thực tế vs `MAINTENANCE` vs `DEMO` | Payload `vehicle-models`, `vehicles`, `reviews` |
| 3 | `checkAvailability` | Kiểm tra lịch trống thực tế theo `startDate` & `endDate` | `evaluateVehicleBookingAvailabilityAndPricing` + `rental_days` |
| 4 | `calculateRentalPrice` | Báo giá thuê chính xác đồng nhất với Checkout | `evaluateVehicleBookingAvailabilityAndPricing` & `rental-rules.ts` |
| 5 | `getActivePromotions` | Tra cứu và xác thực điều kiện mã khuyến mãi | `promotions` + `evaluatePromotion` |
| 6 | `compareVehicles` | So sánh 2–3 dòng xe theo thông số & báo giá cùng ngày | Payload live + Business Rule Engine |
| 7 | `getRentalPolicy` | Tra cứu điều kiện thuê, đặt cọc, hủy đơn, chi nhánh, hỗ trợ | `knowledge.ts` RAG (`nori-site`, `posts`, `branches`) |
| 8 | `recommendVehicles` | Tư vấn phương tiện theo nhu cầu (lọc cứng trước khi chấm điểm) | `recommendVehiclesEngine` + live availability |
| 9 | `prepareBooking` | Chuẩn bị liên kết chuyển sang `/checkout` để khách tự xác nhận | Validation DB + URL builder (không tự tạo đơn) |
| 10 | `getCustomerBookingStatus` | Tra cứu trạng thái đơn thuê của chính khách hàng đang đăng nhập | Payload `bookings` (`overrideAccess: false` + kiểm tra `customer === user.id`) |
| 11 | `getPurchaseConsultationInfo` | Tư vấn xe mở bán, ước tính giá lăn bánh & đăng ký lái thử | Payload `vehicles` (`SALE`/`BOTH`) + `calculateRollingPrice` |
