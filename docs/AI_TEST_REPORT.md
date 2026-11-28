# NORI AI Assistant — Báo Cáo Kết Quả Kiểm Thử & Nghiệm Thu (AI Test Report)

> **Ngày kiểm thử**: `2026-11-28`  
> **Môi trường kiểm thử**: Local Isolated Production Standalone (Next.js `16.4.6`, Payload `4.0.0-beta.8`, SQLite WAL cô lập, `@google/genai` `3.6.1`, `GEMINI_MODEL=gemini-3.5-flash-lite`, Node.js `24.22.3`, Playwright `1.65.1`)  
> **Mức độ nghiệm thu tổng thể**: **CONDITIONAL PASS** *(Toàn bộ kiến trúc Gemini Free Tier, Rule-based Fallback Engine, bảo mật đa lớp, production build, `376` Unit/Integration tests, `122/122` Playwright E2E cô lập đạt `100%`; phần Live Gemini Generation Evaluation đang **PAUSE CHỜ XÁC NHẬN BILLING** do hệ thống không tự suy luận Cloud Billing từ API Key — chủ dự án cần xác nhận Project Google AI Studio không bật Cloud Billing trả phí trước khi chạy `NORI_CONFIRM_GEMINI_FREE_TIER=1 pnpm eval:ai:live`)*

---

## 1. Tổng hợp kết quả Quality Gate & Regression

Mọi kiểm thử thay đổi dữ liệu đều chạy trên bản sao SQLite & Media cô lập, bảo toàn 100% dữ liệu thực trong `nori.db` và `media/`.

| Cổng kiểm tra (Release Gate) | Lệnh thực thi | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Environment Validation (with `.env`)** | `node --env-file=.env scripts/validate-env.mjs` | Xác nhận `AI Assistant: ENABLED (gemini / gemini-3.5-flash-lite / apiKey=CONFIGURED)` (không in giá trị API Key) | **PASS** |
| **Format Check** | `pnpm format:check` | `423` tệp chuẩn định dạng `oxfmt` (`0` lỗi, `118 ms`) | **PASS** |
| **Static & Security Lint** | `pnpm lint` | `332` tệp qua quét AST bảo mật (`0` vấn đề; cấm `GEMINI_API_KEY` & `OPENAI_API_KEY` trong client, cấm `dangerouslySetInnerHTML`, bắt buộc `assertOrigin`) | **PASS** |
| **TypeScript Strict Check** | `pnpm typecheck` | `tsc --noEmit` — `0` lỗi kiểu dữ liệu | **PASS** |
| **Database Schema & Integrity** | `pnpm db:check` | `118` bảng SQLite (không đổi cấu trúc DB), `integrity=ok`, `0` lỗi khóa ngoại, `0` pending migration | **PASS** |
| **Unit, Integration & Security Suite** | `pnpm test` | **376 tests** (`14` suites): **375 pass**, `0` fail, `1` skipped (Postgres live test không truyền Postgres `DATABASE_URL`); riêng `tests/ai-assistant.test.mjs`: **8/8 PASS** | **PASS** |
| **Isolated Admin Auth Test** | `pnpm test:admin` | `ISOLATED_ADMIN_TEST_PASS` (`pbkdf2-sha256-v1`, `integrity=ok`, `0` FK violations) | **PASS** |
| **Production Build** | `pnpm build` | Next.js `16.4.6` Turbopack biên dịch thành công, **114/114** route tĩnh/SSG (`0` route công khai bị `ƒ Dynamic`), `/dashboard/ai` là `○ Static` | **PASS** |
| **AI Assistant E2E (Isolated)** | `pnpm test:e2e:isolated tests/e2e/ai-assistant.spec.ts` | **6/6 PASS** (`11.6 s`, `postIntegrity=ok`, `0` FK violations, `0` user rác còn lại) | **PASS** |
| **Full Regression E2E (Isolated)** | `pnpm test:e2e:isolated` | **122/122 PASS** (`7.0m`, bao gồm Chromium + Mobile WebKit, `postIntegrity=ok`, `0` FK violations, `0` user rác) | **PASS** |
| **Live Gemini Billing Safety Gate** | `pnpm eval:ai:live` | Từ chối an toàn gửi request `generateContent` khi chưa có `NORI_CONFIRM_GEMINI_FREE_TIER=1` (exit code `2`, `0` token tiêu thụ) | **PAUSED (Manual Billing Check Required)** |

---

## 2. Kết quả chi tiết Unit & Resilience Tests (`tests/ai-assistant.test.mjs`)

Toàn bộ **8 nhóm kiểm thử** đạt **100% PASS**:

1. **Intent Extraction (`extractStructuredIntent`)**: Bóc tách đúng tiếng Việt có dấu & không dấu (`dưới 1.5 triệu`, `200k`, `7 chỗ`, `từ ngày mai 3 ngày`, `xe bán tải chạy dầu`).
2. **Hybrid Recommendation (`recommendVehiclesEngine`)**: Lọc cứng đúng số chỗ, loại xe, ngân sách nghiêm ngặt và khả dụng; chuẩn hóa trọng số 35/25/20/10/10; xử lý trung tính khi thiếu đánh giá (`65/100`), xuất lý do đề xuất rõ ràng.
3. **Tool Registry & Schema Validation**: Chặn 100% hàm ngoài allowlist (`executeSql`, `dropTable`, `approveBooking`); chặn JSON lỗi; yêu cầu đủ `startDate`/`endDate` cho `checkAvailability`; lọc allowlist `addons` cho `calculateRentalPrice`.
4. **Security Guardrails**: Chặn 6/6 nhóm tấn công (`SECRET_EXFILTRATION`, `PROMPT_INJECTION`, `ADMIN_ESCALATION`, `CROSS_USER_DATA`, `SQL_OR_SYSTEM_EXEC`, input > 1000 ký tự); vô hiệu hóa Indirect Prompt Injection & `<script>` từ CMS; lọc sạch `AIza*`, `AQ.*`, `sk-proj-*`, email, SĐT, `CCCD`/`GPLX`.
5. **Rate Limit, Budget, Circuit Breaker & Error Mapping**: Thực thi chính xác giới hạn đa phạm vi (`PROJECT`, `IP`, `SESSION`), concurrency limit (`2`/phiên), Circuit Breaker và ánh xạ lỗi Gemini `401/403/404/429/RESOURCE_EXHAUSTED`, `timeout`, `SQLITE_BUSY`.
6. **Orchestrator Graceful Degradation**: Xác minh trạng thái `UNCONFIGURED` (khi `NORI_AI_FALLBACK_ENABLED=false`), `DISABLED` (Admin tắt AI) và `BLOCKED` (guardrail chặn, `0` lần gọi provider).
7. **Provider & DB Failure Resilience (Fallback Off)**: Xác minh luồng `runNoriAIChat` trả lỗi chuẩn cho `AI_INVALID_API_KEY`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_QUOTA_EXCEEDED` (+ `AI_CIRCUIT_OPEN`), và `AI_DB_UNAVAILABLE`, đảm bảo không lộ stack trace hoặc secret.
8. **Gemini Free Tier Policy & Rule-based Fallback Engine**: Xác minh allowlist `GEMINI_FREE_TIER_MODELS`, khóa `openai` (`AI_PAID_PROVIDER_BLOCKED`), chặn model trả phí (`AI_MODEL_NOT_FREE_TIER`), `getOpenAIApiKeyServerOnly() === null` khi `freeTierOnly=true`, đỏ/che `GPLX`/`AQ.*`/`AIza*`, tính lượt gọi Function Calling vào hạn mức Project/IP/Session, và tự động chuyển sang **`Chế độ tư vấn cơ bản (Rule-based Engine)`** (`DEGRADED`, `fallbackMode: true`) kèm Vehicle Cards thật khi thiếu `GEMINI_API_KEY` hoặc gặp `429 RESOURCE_EXHAUSTED`.

---

## 3. Kết quả chi tiết Playwright E2E AI Suite (`tests/e2e/ai-assistant.spec.ts`)

Chạy trong bộ `pnpm test:e2e:isolated` (Production Standalone Server với SQLite DB & Media cô lập, `NORI_AI_TEST_MOCK=1` để không tiêu tốn quota Gemini thật):

| Test | Kịch bản kiểm chứng | Thời gian | Kết quả |
| :-: | :--- | :-: | :-: |
| **1** | Khách vãng lai mở Trợ lý AI trên `/`, hỏi xe gia đình 7 chỗ dưới 1.5 triệu -> hiển thị Vehicle Card thật, ảnh tải thành công (`naturalWidth > 0`, `naturalHeight > 0`), nhấn **Xem chi tiết** điều hướng đúng `/vehicles/[slug]` | `2.9s` | **PASS** |
| **2** | Hỏi lịch & giá thiếu ngày -> AI hỏi bổ sung; kiểm tra lịch xe trống; khóa lịch xe thực tế trong `rental_days` -> AI từ chối xác nhận trống; báo giá qua `calculateRentalPrice` khớp tuyệt đối `100%` với `/nori-api/availability` | `223ms` | **PASS** |
| **3** | Kiểm tra mã khuyến mãi công khai & từ chối mã giả `KHONGTONTAI999`; chặn 4 kịch bản tấn công (lộ API Key, leo thang Admin, xem dữ liệu người khác, Prompt Injection); chặn tin nhắn > 1000 ký tự (`400 AI_INPUT_TOO_LONG`) | `127ms` | **PASS** |
| **4** | Đồng bộ dữ liệu thời gian thực: sửa giá xe & trạng thái `MAINTENANCE` + cập nhật chính sách CMS kèm payload Indirect Prompt Injection trong DB cô lập -> AI phản ánh ngay giá mới, loại xe đang bảo dưỡng và lọc sạch `<script>` / prompt ẩn | `166ms` | **PASS** |
| **5** | Khách đã đăng nhập chat AI -> gửi đánh giá `HELPFUL` lưu DB -> điều hướng sang `/checkout` giữ nguyên phiên đăng nhập; khách gọi `/nori-api/dashboard/ai` bị chặn `403`; Admin xem thống kê thật (`totalRequests > 0`, `totalTokens > 0`, `fallbackRequests`, `billingStatus: 'UNVERIFIED_MANUAL_CHECK_REQUIRED'`, `0` rò rỉ `AIza`/`AQ.`/`sk-proj-`), bật/tắt AI (`DISABLED`), kiểm tra Rate Limit (`429 AI_RATE_LIMITED`) và giao diện `/dashboard/ai` hiển thị Free Tier Only & cảnh báo Cloud Billing | `4.2s` | **PASS** |
| **6** | Kiểm thử di động `375×812`: nút AI không đè lên `MobileBottomNav` (`box.bottom <= nav.top`), không tràn ngang (`scrollWidth <= innerWidth`), mở full-screen chat sheet và xử lý mượt khi bật chế độ Offline PWA | `1.4s` | **PASS** |

---

## 4. Trạng thái Live Gemini API Smoke Evaluation (`pnpm eval:ai:live`)

- **Trạng thái hiện tại**: **CHƯA CHẠY SINH VĂN BẢN LIVE (`PAUSED`)**.
- **Lý do kỹ thuật & chính sách chi phí**: Mặc dù `GEMINI_API_KEY` đã được cấu hình trong tệp `.env` cục bộ (không commit Git) và `node --env-file=.env scripts/validate-env.mjs` xác nhận `apiKey=CONFIGURED`, **không thể xác minh trạng thái Cloud Billing trả phí hay Free Tier chỉ dựa vào việc API Key tồn tại hoặc hoạt động**. Theo yêu cầu bắt buộc về kiểm soát chi phí, NORI không tự chạy các lệnh `generateContent` tới Google Gemini API trước khi chủ dự án kiểm tra thủ công.
- **Số liệu Token Live**: `0` token live đã tiêu thụ trong quá trình nghiệm thu tự động.

### Cách chủ dự án tự kiểm tra Billing và chạy Live Smoke Evaluation (tùy chọn)
1. Đăng nhập [Google AI Studio](https://aistudio.google.com/apikey) và Google Cloud Console của Project chứa `GEMINI_API_KEY`, xác nhận **Project ở gói Free Tier và chưa gắn tài khoản Cloud Billing trả phí**.
2. Thực thi một lượng nhỏ kiểm thử live trên bản sao DB cô lập (không chạm `nori.db` thật):
   ```powershell
   $env:NORI_CONFIRM_GEMINI_FREE_TIER="1"; pnpm eval:ai:live
   ```
3. Script sẽ kiểm tra allowlist `gemini-3.5-flash-lite`, ping metadata qua `models.get`, chạy kiểm thử cô lập trên `nori.db` copy và báo cáo chi tiết độ trễ, token và các ca đạt/không đạt.
