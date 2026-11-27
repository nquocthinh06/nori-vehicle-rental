# NORI AI Assistant — Hướng Dẫn Tích Hợp, API & Vận Hành (AI Integration Guide)

---

## 1. Hướng dẫn tạo OpenAI API Key & Cấu hình môi trường

### 1.1. Tạo API Key chính thức
1. Truy cập [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) bằng tài khoản OpenAI Platform hợp lệ.
2. Chọn **Create new secret key**, đặt tên dự án (ví dụ: `nori-vehicle-rental-prod`), cấp quyền tối thiểu (Responses API / Models).
3. Thiết lập hạn mức chi tiêu tháng (Monthly Usage Limit) trên OpenAI Billing bên cạnh giới hạn ngân sách ứng dụng của NORI.
4. Lưu API Key vào file `.env` trên máy chủ hoặc Secret Manager (Vercel Environment Variables / GitHub Secrets).

> **QUY TẮC BẢO MẬT TUYỆT ĐỐI**:
> - Không commit `.env` lên GitHub.
> - Không đặt `OPENAI_API_KEY` dưới tiền tố `NEXT_PUBLIC_*`.
> - Không dán API Key vào mã nguồn, tài liệu, log hoặc Admin Dashboard.
> - Không sử dụng cookie hoặc phiên đăng nhập ChatGPT Web thay cho OpenAI API chính thức.

### 1.2. Các biến môi trường bắt buộc & tùy chọn

Xem cấu hình mẫu tại [.env.example](../.env.example):

```env
NORI_AI_ENABLED=true
NORI_AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NORI_AI_MAX_OUTPUT_TOKENS=1000
NORI_AI_MAX_TOOL_ROUNDS=5
NORI_AI_RATE_LIMIT_PER_MINUTE=5
NORI_AI_RATE_LIMIT_PER_DAY=30
NORI_AI_TIMEOUT_MS=30000
NORI_AI_DAILY_BUDGET_USD=5
NORI_AI_STORE_CONVERSATIONS=false
```

---

## 2. Lựa chọn Model OpenAI (`OPENAI_MODEL`)

Model được cấu hình hoàn toàn qua biến môi trường `OPENAI_MODEL` (mặc định fallback `gpt-4.1-mini`, không hardcode cố định trong nghiệp vụ):

| Model | Chi phí tham khảo (USD / 1M tokens) | Đánh giá cho NORI |
| :--- | :--- | :--- |
| **`gpt-4.1-mini`** *(Khuyến nghị mặc định)* | Input: `$0.40` · Output: `$1.60` | Hỗ trợ tiếng Việt tự nhiên, tuân thủ nghiêm ngặt Function Calling + JSON Schema, chống prompt injection tốt, tốc độ nhanh và chi phí rất thấp (~`$0.0005`–`$0.002` / lượt tư vấn). |
| `gpt-4o-mini` | Input: `$0.15` · Output: `$0.60` | Chi phí thấp nhất cho nhu cầu ngân sách cực tối ưu. |
| `gpt-5-mini` | Input: `$0.25` · Output: `$2.00` | Phương án thay thế thế hệ mới cho truy vấn suy luận nhiều bước. |

---

## 3. Đặc tả API Endpoints

Tất cả endpoint AI trả về header `Cache-Control: private, no-store` và mọi mutation endpoint đều bắt buộc kiểm tra CSRF `assertOrigin(request)`.

### 3.1. `GET /nori-api/ai/config` (Public — An toàn)
Trả về trạng thái sẵn sàng công khai của AI Assistant (không chứa API Key hoặc tham số bảo mật nội bộ):
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "configured": true,
    "ready": true,
    "provider": "openai",
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
- **Response**: `{ requestId, reply, status, intent, vehicleCards, comparison, quote, bookingHandoff, citations, toolsCalled, followUpSuggestions, fallbackLinks, usage, disclaimer }`.
- **Degraded behavior**: Khi chưa có API Key, hết quota, lỗi 429/timeout hoặc Admin tắt AI, trả thông báo tiếng Việt thân thiện kèm `fallbackLinks` — website NORI vẫn hoạt động bình thường.

### 3.3. `POST /nori-api/ai/feedback`
Gửi đánh giá chất lượng `HELPFUL` / `NOT_HELPFUL` cho một `requestId` cụ thể. Lưu vào collection `ai-feedback` (Admin-only read).

### 3.4. `POST /nori-api/ai/event`
Ghi nhận sự kiện attribution (`VEHICLE_CLICK`, `CHECKOUT_HANDOFF`) phục vụ thống kê tỷ lệ chuyển đổi thực tế trên Admin Dashboard.

### 3.5. `GET /nori-api/dashboard/ai` & `PATCH /nori-api/dashboard/ai` (Admin RBAC)
- Yêu cầu phiên `admins` có quyền `ai` hoặc `settings`/`reports`.
- `GET`: trả trạng thái runtime an toàn (`apiKeyConfigured: boolean`), cấu hình `ai-settings`, thống kê token/chi phí/chuyển đổi thực tế, danh sách lỗi, câu hỏi không có kết quả và phản hồi khách hàng.
- `PATCH`: bật/tắt AI, cập nhật lời chào, quick suggestions, giới hạn trong ngưỡng an toàn server, trọng số Recommendation Engine, ghi chú kiến thức công khai hoặc đánh dấu rà soát feedback (tự động ghi `audit-logs`).

### 3.6. `POST /nori-api/dashboard/ai/test` (Admin RBAC)
Thực hiện kiểm tra kết nối trực tiếp tới OpenAI Responses API với yêu cầu tối thiểu (`max_output_tokens: 16`, `store: false`), trả độ trễ và model phản hồi.

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
- **Hướng dẫn phía Admin**: Truy cập `/dashboard/ai` để bật/tắt AI, kiểm tra kết nối OpenAI, tinh chỉnh giới hạn an toàn, điều chỉnh trọng số đề xuất, theo dõi token/chi phí ước tính và rà soát phản hồi khách hàng.
