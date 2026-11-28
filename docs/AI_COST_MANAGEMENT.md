# NORI AI Assistant — Kiểm Soát Chi Phí & Giới Hạn Free Tier (AI Cost Management v2.9)

---

## 1. Chiến lược bảo đảm chi phí $0 (Gemini Free Tier Only)

NORI áp dụng chính sách **Zero Paid API (`NORI_AI_FREE_TIER_ONLY=true`, `NORI_AI_PAID_PROVIDERS_ALLOWED=false`)** ngay trong backend (`src/lib/ai/config.ts`, `src/lib/ai/rate-limit.ts`, `src/lib/ai/gemini.ts`, `src/lib/ai/orchestrator.ts`):

| Lớp kiểm soát | Biến môi trường / Hằng số | Mặc định Free Tier | Hành vi khi chạm ngưỡng |
| :--- | :--- | :---: | :--- |
| 1. Khóa provider trả phí | `NORI_AI_FREE_TIER_ONLY` / `NORI_AI_PAID_PROVIDERS_ALLOWED` | `true` / `false` | Từ chối `openai` (`AI_PAID_PROVIDER_BLOCKED`), chuyển sang Rule-based Engine |
| 2. Allowlist model Free Tier | `GEMINI_FREE_TIER_MODELS` (`GEMINI_MODEL`) | `gemini-3.5-flash-lite` | Từ chối mọi model ngoài allowlist (`AI_MODEL_NOT_FREE_TIER`), tự ánh xạ alias cũ sang `gemini-3.5-flash-lite` |
| 3. Giới hạn độ dài tin nhắn | `MAX_USER_MESSAGE_CHARS` / `MAX_HISTORY_MESSAGES` | `1.000` ký tự · `12` tin | Trả HTTP `400 AI_INPUT_TOO_LONG` trước khi gọi Gemini |
| 4. Giới hạn token & tool rounds | `NORI_AI_MAX_OUTPUT_TOKENS` / `NORI_AI_MAX_TOOL_ROUNDS` | `1024` tokens · `3` vòng | Truyền `generation_config.max_output_tokens` & dừng vòng lặp Function Calling ở ngưỡng tối đa |
| 5. Rate Limit đa phạm vi | `SESSION`, `IP`, `PROJECT` (RPM / RPD) | Session `3/20`, IP `6/40`, Project `10/200` | Tính **từng vòng gọi model trong Function Calling**; quá hạn mức phiên/IP trả `429`, hết hạn mức Project chuyển sang Fallback |
| 6. Giới hạn đồng thời | `MAX_CONCURRENT_PER_KEY` / `MAX_CONCURRENT_GLOBAL` | `2`/phiên · `20` toàn cục | Trả HTTP `429 AI_CONCURRENCY_LIMIT` chống spam song song |
| 7. Tắt lưu trữ & Grounding có phí | `store: false` + 11 allowlisted function tools | Tắt hoàn toàn | Không bật Google Search/Maps Grounding và không lưu lịch sử hội thoại trên máy chủ Google |

---

## 2. Cơ chế Không Tự Retry Quota, Timeout và Circuit Breaker

- **Timeout hữu hạn**: Mỗi lượt gọi Gemini Interactions API được bảo vệ bởi `AbortController` theo `NORI_AI_TIMEOUT_MS` (mặc định `30000 ms`).
- **Không retry lỗi Quota/Auth**: Tuyệt đối **0 retry** khi gặp `429 Too Many Requests`, `RESOURCE_EXHAUSTED`, sai API Key (`401/403`), hoặc model không khả dụng (`404`). Chỉ cho phép tối đa `1` lần thử lại ngắn (`450ms`) khi gặp lỗi mạng/máy chủ tạm thời HTTP `5xx`.
- **Circuit Breaker**: Tự động mở mạch ngắt khi gặp lỗi xác thực/quota hoặc thất bại liên tiếp, hiển thị rõ trạng thái `Quota Exceeded` / `Connection Error` + `Fallback Active` trên `/dashboard/ai` và chuyển tức thời sang Rule-based Engine.
