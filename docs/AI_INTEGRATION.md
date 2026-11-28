# NORI AI Assistant — Hướng Dẫn Tích Hợp, API & Vận Hành (AI Integration Guide)

---

## 1. Hướng dẫn tạo Gemini API Key (Google AI Studio) & Cấu hình môi trường

### 1.1. Tạo API Key & Kiểm tra Free Tier thủ công
1. Truy cập [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) và tạo hoặc chọn Google Cloud Project dùng cho NORI.
2. **Xác nhận thủ công trạng thái Billing (BẮT BUỘC)**: Kiểm tra trong Google AI Studio / Google Cloud Console rằng Project hiện ở gói **Free Tier** và **chưa gắn Cloud Billing trả phí**. *(Không thể suy luận Billing Tier chỉ từ việc API Key hoạt động.)*
3. Lưu API Key vào file `.env` trên máy chủ hoặc Secret Manager (Vercel Environment Variables / GitHub Secrets).
4. Tuyệt đối **không kích hoạt** Google Search Grounding, Google Maps Grounding hoặc bất kỳ công cụ trả phí nào nếu chưa được chủ dự án cho phép.

> **QUY TẮC BẢO MẬT & CHI PHÍ TUYỆT ĐỐI**:
> - Không commit `.env` lên GitHub.
> - Không đặt `GEMINI_API_KEY` dưới tiền tố `NEXT_PUBLIC_*`.
> - Không dán API Key vào mã nguồn, tài liệu, log hoặc Admin Dashboard.
> - Không luân chuyển nhiều API Key hoặc nhiều Google Cloud Project để cố tình vượt hạn mức miễn phí.
> - Giữ nguyên `NORI_AI_FREE_TIER_ONLY=true` và `NORI_AI_PAID_PROVIDERS_ALLOWED=false` để chặn mọi provider trả phí (bao gồm OpenAI).

### 1.2. Các biến môi trường bắt buộc & tùy chọn

Xem cấu hình mẫu tại [.env.example](../.env.example):

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

## 2. Danh sách Model Gemini Free Tier (`GEMINI_MODEL`)

NORI chỉ cho phép các model Flash / Flash-Lite thuộc tài liệu chính thức Free Tier của Google Gemini API (`GEMINI_FREE_TIER_MODELS` trong `src/lib/ai/config.ts`). Mọi model không nằm trong allowlist bị từ chối với mã `AI_MODEL_NOT_FREE_TIER` và không bao giờ tự nâng cấp sang model trả phí:

| Model (`GEMINI_MODEL`) | Function Calling | Structured Outputs | Tài liệu Free Tier | Ghi chú cho NORI |
| :--- | :---: | :---: | :---: | :--- |
| **`gemini-3.5-flash-lite`** *(Mặc định)* | Có | Có | Chính thức (`ai.google.dev`) | Ưu tiên mặc định cho tác vụ tư vấn tiếng Việt & Function Calling tốc độ cao trên Free Tier. |
| `gemini-2.5-flash-lite` | Có | Có | Chính thức (`ai.google.dev`) | Phương án dự phòng nhẹ thuộc nhóm Flash-Lite Free Tier. |
| `gemini-2.5-flash` | Có | Có | Chính thức (`ai.google.dev`) | Hỗ trợ tốt suy luận nhiều bước & JSON Schema trong hạn mức Free Tier. |
| `gemini-2.0-flash` | Có | Có | Chính thức (`ai.google.dev`) | Ổn định cho hội thoại tiếng Việt và Function Calling. |
| `gemini-2.0-flash-lite` | Có | Có | Chính thức (`ai.google.dev`) | Phiên bản tiết kiệm token thuộc dòng 2.0 Free Tier. |

---

## 3. Đặc tả API Endpoints

Tất cả endpoint AI trả về header `Cache-Control: private, no-store` và mọi mutation endpoint đều bắt buộc kiểm tra CSRF `assertOrigin(request)`.

### 3.1. `GET /nori-api/ai/config` (Public — An toàn)
Trả về trạng thái sẵn sàng công khai của AI Assistant (tuyệt đối không chứa `GEMINI_API_KEY` hay tham số bảo mật nội bộ):
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "configured": true,
    "ready": true,
    "fallbackReady": true,
    "freeTierOnly": true,
    "provider": "gemini",
    "model": "gemini-3.5-flash-lite",
    "greetingMessage": "Xin chào! Tôi là Trợ lý AI của NORI...",
    "quickSuggestions": [{ "label": "...", "prompt": "..." }],
    "fallbackLinks": [
      { "label": "Tìm xe bằng bộ lọc", "href": "/vehicles" },
      { "label": "Xem chính sách & hỗ trợ", "href": "/support" }
    ],
    "statusMessage": null
  }
}
```

### 3.2. `POST /nori-api/ai/chat` (Khách vãng lai & Khách đã đăng nhập)
- **Allowlist Body**: `{ message: string, history?: Array<{ role: "user"|"assistant", content: string }>, sessionId?: string }` (tối đa 18 KB, message tối đa 1.000 ký tự).
- **Response**: `{ requestId, reply, status, mode, modeLabel, fallbackMode, fallbackReason, intent, vehicleCards, comparison, quote, bookingHandoff, citations, toolsCalled, followUpSuggestions, fallbackLinks, usage, disclaimer }`.
- **Fallback Engine behavior (`NORI_AI_FALLBACK_ENABLED=true`)**: Khi `GEMINI_API_KEY` chưa cấu hình, hết quota, lỗi 429, timeout hoặc model không khả dụng, Orchestrator tự động chuyển sang **Rule-based Recommendation Engine** (`status: "DEGRADED"`, `mode: "rule-based-fallback"`, `modeLabel: "Chế độ tư vấn cơ bản (Rule-based Engine)"`), truy vấn trực tiếp dữ liệu thật + tính giá bằng BRE — website NORI vẫn tư vấn và đặt xe bình thường.

### 3.3. `POST /nori-api/ai/feedback`
Gửi đánh giá chất lượng `HELPFUL` / `NOT_HELPFUL` cho một `requestId` cụ thể. Lưu vào collection `ai-feedback` (Admin-only read).

### 3.4. `POST /nori-api/ai/event`
Ghi nhận sự kiện attribution (`VEHICLE_CLICK`, `CHECKOUT_HANDOFF`) phục vụ thống kê tỷ lệ chuyển đổi thực tế trên Admin Dashboard.

### 3.5. `GET /nori-api/dashboard/ai` & `PATCH /nori-api/dashboard/ai` (Admin RBAC)
- Yêu cầu phiên `admins` có quyền `ai` hoặc `settings`/`reports`.
- `GET`: trả trạng thái runtime an toàn (`apiKeyConfigured: boolean`, `freeTierOnly`, `paidProvidersAllowed`, `fallbackEnabled`, `model`, `modelCapabilities`, `billingVerificationRequired: true`), cấu hình `ai-settings`, thống kê token/request/fallback thực tế (`fallbackRequests`), danh sách lỗi, câu hỏi không có kết quả và phản hồi khách hàng.
- `PATCH`: bật/tắt AI, cập nhật lời chào, quick suggestions, giới hạn trong ngưỡng an toàn server, trọng số Recommendation Engine, ghi chú kiến thức công khai hoặc đánh dấu rà soát feedback (tự động ghi `audit-logs`).

### 3.6. `POST /nori-api/dashboard/ai/test` (Admin RBAC)
Thực hiện kiểm tra metadata kết nối tới Gemini API qua `client.models.get({ model })` (không tiêu tốn quota sinh token văn bản, không tự suy luận Billing Tier), trả độ trễ, model khả dụng và thông báo nhắc chủ dự án xác nhận thủ công trạng thái Free Tier / Cloud Billing.

---

## 4. Danh sách 9 Function Calling Tools (Allowlisted)

| # | Tên hàm | Nguồn nghiệp vụ tái sử dụng | Ghi chú toàn vẹn |
| :-: | :--- | :--- | :--- |
| 1 | `searchVehicles` | Payload `vehicle-models`, `vehicles` (`overrideAccess: false`) | Chỉ trả xe đang kinh doanh, không trả biển số nội bộ |
| 2 | `getVehicleDetails` | Payload `vehicle-models`, `vehicles`, `reviews` (`PUBLISHED`) | Phân biệt rõ dòng xe catalogue và từng cá thể xe thực tế |
| 3 | `checkAvailability` | `evaluateVehicleBookingAvailabilityAndPricing` | Kiểm tra trạng thái, booking holds, bảo dưỡng, điều chuyển & `rental_days` |
| 4 | `calculateRentalPrice` | `evaluateVehicleBookingAvailabilityAndPricing` & `rental-rules.ts` | Backend là nguồn xác thực duy nhất, timezone `Asia/Ho_Chi_Minh` |
| 5 | `getActivePromotions` | `promotions` + `evaluatePromotion` | Chỉ trả mã công khai còn hiệu lực & còn lượt dùng |
| 6 | `compareVehicles` | Payload live + optional quote theo cùng khoảng ngày | Thiếu dữ liệu hiển thị chính xác `"Chưa cập nhật"` |
| 7 | `getRentalPolicy` | `knowledge.ts` RAG (`nori-site`, published `posts`, `branches`) | Chống Indirect Prompt Injection, kèm link chính sách |
| 8 | `recommendVehicles` | `recommendVehiclesEngine` + live availability | Lọc cứng + Weighted Scoring minh bạch + lý do đề xuất |
| 9 | `prepareBooking` | Validation DB + sinh URL `/checkout?...` hoặc `/vehicles/[slug]` | Chỉ điều hướng; không tự tạo đơn, không duyệt đơn, không thu tiền |

---

## 5. Hướng dẫn vận hành & đồng bộ dữ liệu

- **Tính đồng bộ thời gian thực**: Mọi tool AI truy vấn trực tiếp từ Payload CMS / SQLite theo từng yêu cầu. Khi Admin thay đổi giá xe, trạng thái vận hành (`MAINTENANCE`/`INACTIVE`), khuyến mãi hoặc chính sách CMS tại `/dashboard/*`, Trợ lý AI phản ánh dữ liệu mới ngay ở lượt hỏi tiếp theo mà không cần restart hay đồng bộ thủ công.
- **Hướng dẫn phía Khách hàng**: Nhấn nút **Trợ lý AI** ở góc dưới phải (tự động tránh thanh điều hướng Mobile Bottom Navigation và Sticky Booking Bar), chọn gợi ý nhanh hoặc nhập nhu cầu bằng tiếng Việt tự nhiên, xem thẻ xe đề xuất và nhấn **Xem chi tiết** / **Chọn thuê** / **So sánh xe**.
- **Hướng dẫn phía Admin**: Truy cập `/dashboard/ai` để bật/tắt AI, kiểm tra kết nối metadata Gemini Free Tier, theo dõi số lượt chuyển sang **Chế độ tư vấn cơ bản**, tinh chỉnh giới hạn an toàn, điều chỉnh trọng số đề xuất, theo dõi token thực tế và rà soát phản hồi khách hàng.
