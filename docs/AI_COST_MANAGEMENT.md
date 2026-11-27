# NORI AI Assistant — Quản Lý Chi Phí & Kiểm Soát Hạn Mức (AI Cost Management)

---

## 1. Chiến lược kiểm soát chi phí nhiều lớp phía NORI

NORI **không chỉ dựa vào thông báo ngân sách trên OpenAI Platform**, mà thực thi trực tiếp 7 lớp kiểm soát chi phí ngay trong backend (`src/lib/ai/config.ts`, `src/lib/ai/rate-limit.ts`, `src/lib/ai/orchestrator.ts`):

| Lớp kiểm soát | Biến môi trường (Trần cứng server) | Mặc định | Hành vi khi chạm ngưỡng |
| :--- | :--- | :---: | :--- |
| 1. Giới hạn độ dài tin nhắn | Hằng số `MAX_USER_MESSAGE_CHARS` | `1.000` ký tự | Trả HTTP `400 AI_INPUT_TOO_LONG` trước khi gọi OpenAI |
| 2. Giới hạn lịch sử hội thoại | `MAX_HISTORY_MESSAGES` / `MAX_TOTAL_HISTORY_CHARS` | `12` tin / `8.000` ký tự | Tự động cắt ngữ cảnh cũ an toàn |
| 3. Giới hạn token đầu ra | `NORI_AI_MAX_OUTPUT_TOKENS` | `1000` tokens | Truyền `max_output_tokens` vào OpenAI Responses API |
| 4. Giới hạn vòng gọi hàm | `NORI_AI_MAX_TOOL_ROUNDS` | `5` vòng | Chấm dứt vòng lặp tool và trả kết quả đã xác thực |
| 5. Rate Limit theo phiên/user | `NORI_AI_RATE_LIMIT_PER_MINUTE` / `PER_DAY` | `5`/phút · `30`/ngày | Trả HTTP `429` kèm thời gian chờ & link bộ lọc tìm xe |
| 6. Giới hạn đồng thời | `MAX_CONCURRENT_PER_KEY` / `GLOBAL` | `2`/phiên · `20` toàn cục | Trả HTTP `429 AI_CONCURRENCY_LIMIT` chống spam song song |
| 7. Ngân sách ước tính/ngày | `NORI_AI_DAILY_BUDGET_USD` | `$5.00` USD/ngày | Cảnh báo ở ≥80% trên `/dashboard/ai`; tự dừng ở ≥100% |

> **Chống vượt quyền cấu hình**: Admin có thể tinh chỉnh giới hạn tại `/dashboard/ai`, nhưng backend luôn kẹp (`clamp`) giá trị không được vượt trần cứng do biến môi trường server quy định. Người dùng frontend tuyệt đối không thể chọn model đắt hơn hoặc tăng `max_output_tokens`.

---

## 2. Cơ chế Retry, Timeout và Circuit Breaker

- **Timeout hữu hạn**: Mỗi lượt gọi OpenAI Responses API được bảo vệ bởi `AbortController` theo `NORI_AI_TIMEOUT_MS` (mặc định `30000 ms`) và tôn trọng tín hiệu hủy khi khách nhấn nút **Dừng**.
- **Exponential Backoff Retry**: Tự động thử lại tối đa 2 lần với thời gian trễ tăng dần (`450ms → 900ms + jitter`) **chỉ đối với lỗi tạm thời** (HTTP 429 rate limit tạm thời, HTTP 5xx, timeout). Không retry mù quáng khi sai API Key (401/403) hoặc hết quota (`insufficient_quota`).
- **Circuit Breaker**: Mở mạch ngắt trong 60 giây khi provider gặp lỗi xác thực/quota hoặc thất bại liên tiếp ≥ 5 lần, ngăn lãng phí thời gian chờ và bảo toàn trải nghiệm website chính.

---

## 3. Phân biệt chi phí ước tính NORI và hóa đơn OpenAI

- Module `src/lib/ai/usage.ts` tính `estimatedCostUsd` từ `usage.input_tokens` và `usage.output_tokens` thực tế OpenAI trả về nhân với bảng giá tham khảo (`MODEL_PRICING_PER_1M_USD`, ví dụ `gpt-4.1-mini`: `$0.40/1M input`, `$1.60/1M output`).
- Dashboard `/dashboard/ai` luôn hiển thị rõ ghi chú phân biệt: **số liệu chi phí tại NORI chỉ là ước tính vận hành để theo dõi ngân sách và cảnh báo sớm; hóa đơn thanh toán thực tế được ghi nhận chính thức tại OpenAI Platform**.

---

## 4. Phương án vận hành khi AI gián đoạn (Graceful Degradation)

Khi `OPENAI_API_KEY` chưa cấu hình, hết quota, hết credit, lỗi mạng hoặc Admin tắt AI:
1. Toàn bộ tính năng cốt lõi của NORI (`/vehicles`, `/vehicles/[slug]`, `/nori-api/availability`, `/checkout`, `/my-bookings`, `/dashboard/*`) tiếp tục vận hành bình thường 100%.
2. Giao diện chat hiển thị rõ trạng thái tiếng Việt dễ hiểu cùng nút điều hướng nhanh đến **Tìm xe bằng bộ lọc (`/vehicles`)** và **Chính sách & Liên hệ NORI (`/support`)**.
