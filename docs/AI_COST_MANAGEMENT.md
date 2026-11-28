# NORI AI Assistant — Kiểm Soát Chi Phí $0 & Giới Hạn Free Tier (AI Cost Management)

---

## 1. Chiến lược bảo đảm chi phí $0 (Gemini Free Tier Only)

NORI áp dụng chính sách **Zero Paid API (`NORI_AI_FREE_TIER_ONLY=true`, `NORI_AI_PAID_PROVIDERS_ALLOWED=false`)** và thực thi các lớp bảo vệ ngay trong backend (`src/lib/ai/config.ts`, `src/lib/ai/rate-limit.ts`, `src/lib/ai/gemini.ts`, `src/lib/ai/orchestrator.ts`):

| Lớp kiểm soát | Biến môi trường / Hằng số | Mặc định Free Tier | Hành vi khi chạm ngưỡng |
| :--- | :--- | :---: | :--- |
| 1. Khóa provider trả phí | `NORI_AI_FREE_TIER_ONLY` / `NORI_AI_PAID_PROVIDERS_ALLOWED` | `true` / `false` | Từ chối `openai` (`AI_PAID_PROVIDER_BLOCKED`), chuyển sang Rule-based Engine |
| 2. Allowlist model Free Tier | `GEMINI_FREE_TIER_MODELS` (`GEMINI_MODEL`) | `gemini-3.5-flash-lite` | Từ chối mọi model ngoài allowlist (`AI_MODEL_NOT_FREE_TIER`), không tự nâng cấp |
| 3. Giới hạn độ dài tin nhắn | `MAX_USER_MESSAGE_CHARS` / `MAX_HISTORY_MESSAGES` | `1.000` ký tự · `12` tin | Trả HTTP `400 AI_INPUT_TOO_LONG` trước khi gọi Gemini |
| 4. Giới hạn token & tool rounds | `NORI_AI_MAX_OUTPUT_TOKENS` / `NORI_AI_MAX_TOOL_ROUNDS` | `1024` tokens · `3` vòng | Truyền `maxOutputTokens` cho Gemini & dừng vòng lặp ở ngưỡng tối đa |
| 5. Rate Limit đa phạm vi | `SESSION`, `IP`, `PROJECT` (RPM / RPD) | Session `3/20`, IP `6/40`, Project `10/200` | Tính **từng vòng gọi model trong Function Calling**; quá hạn mức phiên/IP trả `429`, hết hạn mức Project chuyển sang Fallback |
| 6. Giới hạn đồng thời | `MAX_CONCURRENT_PER_KEY` / `MAX_CONCURRENT_GLOBAL` | `2`/phiên · `20` toàn cục | Trả HTTP `429 AI_CONCURRENCY_LIMIT` chống spam song song |
| 7. Cấm grounding phát sinh phí | `GeminiProvider` tool config | Tắt hoàn toàn | Chỉ truyền `functionDeclarations` của 9 tool NORI, không bật Google Search/Maps Grounding |

> **Chống vượt quyền cấu hình**: Admin có thể thu hẹp giới hạn tại `/dashboard/ai`, nhưng backend luôn kẹp (`clamp`) giá trị không được vượt trần cứng do biến môi trường server quy định. Khi `NORI_AI_FREE_TIER_ONLY=true`, `dailyBudgetUsdCap` được ép bằng `$0`.

---

## 2. Cơ chế Không Tự Retry Quota, Timeout và Circuit Breaker

- **Timeout hữu hạn**: Mỗi lượt gọi Gemini API được bảo vệ bởi `AbortController` theo `NORI_AI_TIMEOUT_MS` (mặc định `30000 ms`) và tôn trọng tín hiệu hủy khi khách nhấn nút **Dừng**.
- **Chính sách Retry nghiêm ngặt cho Free Tier**: Tuyệt đối **không tự động gọi lại (0 retry)** khi gặp `429 Too Many Requests`, hết quota (`RESOURCE_EXHAUSTED`), sai API Key (`401/403`), hoặc model không khả dụng (`404`). Chỉ cho phép tối đa `1` lần thử lại ngắn (`450ms`) khi gặp lỗi máy chủ tạm thời HTTP `5xx`.
- **Circuit Breaker**: Mở mạch ngắt trong 60 giây khi provider gặp lỗi xác thực/quota hoặc thất bại liên tiếp `>= 5` lần, ngăn gọi lặp lãng phí quota và tự động chuyển ngay sang Rule-based Fallback.

---

## 3. Minhh bạch trạng thái Billing & Thống kê Token

- Khi `NORI_AI_FREE_TIER_ONLY=true`, `estimateTokenCostUsd` luôn trả về `0` — NORI **không** hiển thị hay giả lập chi phí trả phí.
- Hệ thống ghi nhận trung thực `input_tokens`, `output_tokens`, `total_tokens`, `latency_ms` và `fallbackRequests` vào `ai_usage_logs`.
- Dashboard `/dashboard/ai` luôn hiển thị cảnh báo: **NORI không thể tự suy luận trạng thái Cloud Billing từ API Key**; chủ dự án cần xác nhận thủ công trên Google AI Studio / Google Cloud Console rằng Project chưa gắn Billing trả phí trước khi chạy kiểm thử live.

---

## 4. Chế độ dự phòng Rule-based Engine (`src/lib/ai/fallback.ts`)

Khi `GEMINI_API_KEY` chưa cấu hình, hết quota (`429`), timeout, mất kết nối hoặc model không khả dụng (và `NORI_AI_FALLBACK_ENABLED=true`):
1. Hệ thống tự động chuyển sang **`Rule-based Recommendation Engine`** (hoạt động 100% không cần API Key).
2. Sử dụng `extractStructuredIntent`, `recommendVehiclesEngine`, `evaluateVehicleBookingAvailabilityAndPricing` và RAG nội bộ để lọc xe theo số chỗ, ngân sách, nhu cầu, tính giá thuê chính xác và kiểm tra lịch trống.
3. Giao diện chat hiển thị rõ nhãn **`Chế độ tư vấn cơ bản (Rule-based Engine)`** kèm đầy đủ Vehicle Cards và nút chuyển tới bộ lọc `/vehicles` & `/support`. Toàn bộ website đặt xe & thanh toán tiếp tục hoạt động 100%.
