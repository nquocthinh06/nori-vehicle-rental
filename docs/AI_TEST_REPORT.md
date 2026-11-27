# NORI AI Assistant — Báo Cáo Kết Quả Kiểm Thử & Nghiệm Thu (AI Test Report)

> **Ngày kiểm thử**: `2026-11-28`  
> **Môi trường kiểm thử**: Local Isolated Production Standalone (Next.js `16.4.6`, Payload `4.0.0-beta.8`, SQLite WAL cô lập, Node.js `24.22.3`, Playwright `1.65.1`)  
> **Mức độ nghiệm thu tổng thể**: **CONDITIONAL PASS** *(Kiến trúc, mã nguồn, bảo mật, build production, Unit/Integration và Playwright E2E đạt 100%; phần Live OpenAI Generation Evaluation đang **BLOCKED** do tài khoản OpenAI API Key đi kèm trả về `429 insufficient_quota` — hết số dư billing credit bên phía OpenAI)*

---

## 1. Tổng hợp kết quả Quality Gate & Regression

Mọi kiểm thử thay đổi dữ liệu đều chạy trên bản sao SQLite & Media cô lập, bảo toàn 100% dữ liệu thực trong `nori.db` và `media/`.

| Cổng kiểm tra (Release Gate) | Lệnh thực thi | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Format Check** | `pnpm format:check` | `372` tệp chuẩn định dạng `oxfmt` (`0` lỗi) | **PASS** |
| **Static & Security Lint** | `pnpm lint` | `290` tệp qua quét AST bảo mật (`0` vấn đề; cấm `OPENAI_API_KEY` trong client, cấm `dangerouslySetInnerHTML`, bắt buộc `assertOrigin`) | **PASS** |
| **TypeScript Strict Check** | `pnpm typecheck` | `tsc --noEmit` — `0` lỗi kiểu dữ liệu | **PASS** |
| **Database Schema & Integrity** | `pnpm db:check` | `116` bảng SQLite (`+7` bảng AI additive), `integrity=ok`, `0` lỗi khóa ngoại, `0` pending migration | **PASS** |
| **Unit, Integration & Security Suite** | `pnpm test` | **370 tests** (`13` suites): **369 pass**, `0` fail, `1` skipped (Postgres live test không có `DATABASE_URL` Postgres); riêng `tests/ai-assistant.test.mjs`: **7/7 PASS** (`305 ms`) | **PASS** |
| **Isolated Admin Auth Test** | `pnpm test:admin` | `ISOLATED_ADMIN_TEST_PASS` (`pbkdf2-sha256-v1`, `integrity=ok`, `0` FK violations) | **PASS** |
| **Production Build** | `pnpm build` | Next.js `16.4.6` Turbopack biên dịch `55s`, **111/111** route tĩnh/SSG (`0` route công khai bị `ƒ Dynamic`), `/dashboard/ai` là `○ Static` | **PASS** |
| **AI Assistant E2E (Isolated)** | `pnpm test:e2e:isolated tests/e2e/ai-assistant.spec.ts` | **6/6 PASS** (`20.8s`, `postIntegrity=ok`, `0` FK violations, `0` user rác còn lại) | **PASS** |
| **Full Regression E2E (Isolated)** | `pnpm test:e2e:isolated` | **118/119 PASS** ở lượt chạy gộp `11.5m` (`1` flake thời điểm hydrate trên `mobile-webkit` Journey 2), xác minh lại `pnpm test:e2e:isolated tests/e2e/mobile-webkit.spec.ts`: **6/6 PASS** (`34.0s`) — **0 hồi quy** | **PASS** |
| **Live OpenAI API Connectivity Ping** | `pnpm eval:ai:live` (`POST /nori-api/dashboard/ai/test`) | Kết nối thành công tới OpenAI Responses API thật (`model=gpt-4.1-mini`, `store=false`, độ trễ `7359ms`), OpenAI phản hồi `429 insufficient_quota` -> NORI ánh xạ an toàn thành `AI_QUOTA_EXCEEDED` và kích hoạt Circuit Breaker | **BLOCKED (Billing Quota)** |
| **Live OpenAI 12-Case Vietnamese Eval** | `pnpm eval:ai:live` (`EV-01..EV-12`) | Chưa thể chạy sinh văn bản thật cho đến khi chủ dự án nạp credit billing trên OpenAI Platform hoặc thay bằng API Key còn hạn mức | **BLOCKED (Billing Quota)** |

---

## 2. Kết quả chi tiết Unit & Resilience Tests (`tests/ai-assistant.test.mjs`)

Toàn bộ **7 nhóm kiểm thử** đạt **100% PASS** (`305 ms`):

1. **Intent Extraction (`extractStructuredIntent`)**: Bóc tách đúng tiếng Việt có dấu & không dấu (`dưới 1.5 triệu`, `200k`, `7 chỗ`, `từ ngày mai 3 ngày`, `xe bán tải chạy dầu`).
2. **Hybrid Recommendation (`recommendVehiclesEngine`)**: Lọc cứng đúng số chỗ, loại xe, ngân sách nghiêm ngặt và khả dụng; chuẩn hóa trọng số 35/25/20/10/10; xử lý trung tính khi thiếu đánh giá (`65/100`), xuất lý do đề xuất rõ ràng.
3. **Tool Registry & Schema Validation**: Chặn 100% hàm ngoài allowlist (`executeSql`, `dropTable`, `approveBooking`); chặn JSON lỗi; yêu cầu đủ `startDate`/`endDate` cho `checkAvailability`; lọc allowlist `addons` cho `calculateRentalPrice`.
4. **Security Guardrails**: Chặn 6/6 nhóm tấn công (`SECRET_EXFILTRATION`, `PROMPT_INJECTION`, `ADMIN_ESCALATION`, `CROSS_USER_DATA`, `SQL_OR_SYSTEM_EXEC`, input > 1000 ký tự); vô hiệu hóa Indirect Prompt Injection & `<script>` từ CMS; lọc sạch `sk-proj-*`, email và SĐT.
5. **Rate Limit, Budget, Circuit Breaker & Error Mapping**: Thực thi chính xác giới hạn phút/ngày, concurrency limit (`2`/phiên), daily USD cap, Circuit Breaker và ánh xạ lỗi `401`, `insufficient_quota`, `429`, `timeout`, `SQLITE_BUSY`.
6. **Orchestrator Graceful Degradation**: Xác minh trạng thái `UNCONFIGURED` (thiếu key), `DISABLED` (Admin tắt AI) và `BLOCKED` (guardrail chặn, `0` lần gọi OpenAI).
7. **Provider & DB Failure Resilience**: Xác minh luồng đầy đủ `runNoriAIChat` cho cả 5 kịch bản lỗi (`AI_INVALID_API_KEY`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_QUOTA_EXCEEDED` + tự mở mạch `AI_CIRCUIT_OPEN`, và `AI_DB_UNAVAILABLE` khi SQLite lỗi), đảm bảo không lộ stack trace hoặc secret.

---

## 3. Kết quả chi tiết Playwright E2E AI Suite (`tests/e2e/ai-assistant.spec.ts`)

Chạy trên Production Standalone Server với SQLite DB & Media cô lập (`NORI_AI_TEST_MOCK=1` chỉ dùng để mô phỏng lượt gọi LLM còn toàn bộ nghiệp vụ, DB, giá, lịch và bảo mật chạy thật 100%):

| Test | Kịch bản kiểm chứng | Thời gian | Kết quả |
| :-: | :--- | :-: | :-: |
| **1** | Khách vãng lai mở Trợ lý AI trên `/`, hỏi xe gia đình 7 chỗ dưới 1.5 triệu -> hiển thị Vehicle Card thật, ảnh tải thành công (`naturalWidth > 0`, `naturalHeight > 0`), nhấn **Xem chi tiết** điều hướng đúng `/vehicles/[slug]` | `6.0s` | **PASS** |
| **2** | Hỏi lịch & giá thiếu ngày -> AI hỏi bổ sung; kiểm tra lịch xe trống; khóa lịch xe thực tế trong `rental_days` -> AI từ chối xác nhận trống; báo giá qua `calculateRentalPrice` khớp tuyệt đối `100%` với `/nori-api/availability` | `0.6s` | **PASS** |
| **3** | Kiểm tra mã khuyến mãi công khai & từ chối mã giả `KHONGTONTAI999`; chặn 4 kịch bản tấn công (lộ API Key, leo thang Admin, xem dữ liệu người khác, Prompt Injection); chặn tin nhắn > 1000 ký tự (`400 AI_INPUT_TOO_LONG`) | `0.3s` | **PASS** |
| **4** | Đồng bộ dữ liệu thời gian thực: sửa giá xe & trạng thái `MAINTENANCE` + cập nhật chính sách CMS kèm payload Indirect Prompt Injection trong DB cô lập -> AI phản ánh ngay giá mới, loại xe đang bảo dưỡng và lọc sạch `<script>` / prompt ẩn | `0.4s` | **PASS** |
| **5** | Khách đã đăng nhập chat AI -> gửi đánh giá `HELPFUL` lưu DB -> điều hướng sang `/checkout` giữ nguyên phiên đăng nhập; khách gọi `/nori-api/dashboard/ai` bị chặn `403`; Admin xem thống kê thật (`totalRequests > 0`, `totalTokens > 0`, `0` rò rỉ API Key), bật/tắt AI (`DISABLED`), kiểm tra Rate Limit (`429 AI_RATE_LIMITED`) | `7.3s` | **PASS** |
| **6** | Kiểm thử di động `375×812`: nút AI không đè lên `MobileBottomNav` (`box.bottom <= nav.top`), không tràn ngang (`scrollWidth <= innerWidth`), mở full-screen chat sheet và xử lý mượt khi bật chế độ Offline PWA | `3.4s` | **PASS** |

---

## 4. Kết quả kiểm thử Live OpenAI API (`pnpm eval:ai:live`)

- **Cấu hình thực thi**: Isolated Standalone Server kết nối trực tiếp tới OpenAI Responses API thật (`NORI_AI_TEST_MOCK=0`, `model=gpt-4.1-mini`, `store=false`).
- **Kết quả kết nối thực tế (`POST /nori-api/dashboard/ai/test`)**:
  - Yêu cầu tới OpenAI Responses API đi qua mạng thành công và nhận phản hồi sau **`7359 ms`**.
  - OpenAI trả về lỗi `429 insufficient_quota` (*tài khoản API hiện không còn số dư billing credit*).
  - NORI ánh xạ an toàn thành `AI_QUOTA_EXCEEDED`, hiển thị thông báo tiếng Việt thân thiện, không lộ API Key, không làm gián đoạn website chính.
- **Số liệu Token & Chi phí Live API**: `0` token sinh thành công do bị chặn bởi hạn mức billing `insufficient_quota` phía OpenAI. **Không sử dụng số liệu ước lượng hay số liệu mock để thay thế cho kết quả Live Evaluation.**

### Cách kích hoạt và chạy lại Live AI Evaluation sau khi nạp credit
1. Thu hồi (revoke) API Key cũ từng dán qua khung chat và tạo API Key mới tại OpenAI Platform kèm hạn mức billing hợp lệ.
2. Cập nhật `OPENAI_API_KEY` trong tệp `.env` cục bộ trên máy chủ (không commit lên Git).
3. Chạy lệnh đánh giá cô lập:
   ```bash
   pnpm eval:ai:live
   ```
4. Lệnh sẽ tự động chạy trên bản sao cô lập của `nori.db` (không ảnh hưởng dữ liệu thật), kiểm tra kết nối thật và chấm điểm đầy đủ 12 kịch bản tiếng Việt (`EV-01..EV-12`) kèm báo cáo token và chi phí USD thực tế.
