# NORI AI Assistant — Ma Trận Kịch Bản Kiểm Thử (AI Test Cases v2.9)

---

## 1. Unit, NLU, Hard-Constraint & Security Tests (`tests/ai-assistant.test.mjs` — 11 Test Groups)

| ID | Nhóm kiểm thử | Kịch bản kiểm chứng | Kết quả kỳ vọng |
| :--- | :--- | :--- | :--- |
| AI-U01 | Intent & Budget Extraction | Tiếng Việt có dấu/không dấu, ngân sách thập phân (`dưới 1.5 triệu/ngày`, `dưới 200k`), số chỗ (`7 chỗ`), ngày tuyệt đối & tương đối (`từ ngày mai 3 ngày`) | Bóc tách chính xác `1.500.000đ`, `200.000đ`, `strictBudget=true`, `minSeats=7`, `startDate`, `endDate` |
| AI-U02 | Hybrid Recommendation | Lọc cứng số chỗ, danh mục, ngân sách nghiêm ngặt, khả dụng ngày thuê; chấm điểm 35/25/20/10/10; Bayesian rating trung tính | Chỉ giữ xe đạt mọi điều kiện bắt buộc trước khi chấm điểm, không ép đủ 4 xe |
| AI-U03 | Tool Registry & Schema | Allowlist 11 hàm; chặn `executeSql`, `dropTable`, `approveBooking`; kiểm tra JSON schema cho `checkAvailability` & `calculateRentalPrice` | Từ chối 100% hàm trái phép và tham số sai định dạng |
| AI-U04 | Security Guardrails | Prompt Injection, Secret Exfiltration (`GEMINI_API_KEY`, `OPENAI_API_KEY`), Admin Escalation, Cross-user data, SQL/FS, Indirect Prompt Injection CMS, PII redaction | Chặn trước khi gọi Gemini (`status = BLOCKED`), 0 rò rỉ secret/PII |
| AI-U05 | Cost & Resilience | Rate Limit đa phạm vi (`PROJECT`, `IP`, `SESSION`), Concurrency guard, Daily Budget, Circuit Breaker, Error Mapping | Thực thi đúng giới hạn và mã lỗi chuẩn hóa |
| AI-U06 | Orchestrator Degradation | Thiếu API Key (`UNCONFIGURED` khi tắt fallback), Admin tắt AI (`DISABLED`), Guardrail block (`BLOCKED`) | Không gọi provider khi bị chặn hoặc tắt |
| AI-U07 | Upstream & DB Failures | `INVALID_KEY`, `QUOTA_EXCEEDED` (mở Circuit Breaker), `RATE_429`, `TIMEOUT`, `SQLITE_BUSY` (`AI_DB_UNAVAILABLE`) | Ánh xạ chuẩn sang `NoriAIError`, không lộ stack trace SQLite |
| AI-U08 | Gemini Free Tier & Fallback | Allowlist model (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-4-hydrogen`), chặn model trả phí, tự chuyển sang Rule-based Fallback khi thiếu key hoặc `429` | Phản hồi sạch không chứa thông báo lỗi `API Key` thô, gắn `modeLabel: "Chế độ tư vấn cơ bản"` |
| **AI-U09** | **Regression `"innova có xe này không"`** | (A) Khi DB không có Innova (nhưng có 4 xe máy + Fortuner/Xpander); (B) Khi DB có Innova `READY`; (C) Khi Innova đang `MAINTENANCE` | **(A) Trả `0` xe máy (`vehicleCards = []`), báo rõ chưa có Toyota Innova & gợi ý xe 7 chỗ; (B) Trả đúng card Innova; (C) Báo rõ đang bảo dưỡng** |
| **AI-U10** | **14 Intents, Typos & Multi-turn Context** | Kiểm chứng đủ 14 Intent, lỗi chính tả (`inova`, `fotuner`, `expander`), hội thoại nhiều lượt (`Fortuner` → `"Xe đó giá bao nhiêu?"` → `"Thuê 3 ngày thì sao?"` → `"Đổi sang Xpander đi"`) và cô lập phiên mới | Phân loại đúng 14/14 Intent, nhớ đúng dòng xe/số ngày trong phiên và trả `CLARIFICATION` ở phiên mới độc lập |
| **AI-U11** | **Transmission, Ownership, Markdown XSS & Fallback DB Error** | Lọc cứng `Số tự động` loại `Số sàn`; chặn khách chưa đăng nhập / khách khác xem đơn thuê (`getCustomerBookingStatus`); lọc XSS `javascript:`/`data:` trong `markdown.ts`; lỗi `SQLITE_BUSY` trong Fallback trả `AI_DB_UNAVAILABLE` | Đạt 100% điều kiện cứng, bảo mật quyền sở hữu đơn, không còn `**` thô và không đánh đồng lỗi DB với hết xe |

---

## 2. Playwright E2E Tests trên DB Cô Lập (`tests/e2e/ai-assistant.spec.ts` — 7 End-to-End Suites)

| ID | Kịch bản E2E thực tế | Phương thức kiểm chứng |
| :--- | :--- | :--- |
| AI-E01 | Khách vãng lai tư vấn xe gia đình 7 chỗ dưới 1.5 triệu, tải ảnh thật (`naturalWidth > 0`) và mở trang chi tiết `/vehicles/[slug]` | Browser Chromium + Image/Navigation check |
| AI-E02 | Hỏi lịch thiếu ngày -> yêu cầu bổ sung; khóa lịch `rental_days` -> báo `UNAVAILABLE`; báo giá khớp 100% `/nori-api/availability` | API + Isolated SQLite `rental_days` lock |
| AI-E03 | Từ chối mã giảm giá giả `KHONGTONTAI999`; chặn 4 kịch bản tấn công bảo mật & input > 1000 ký tự | API + Guardrail assertions |
| AI-E04 | Đồng bộ tức thời khi Admin sửa giá xe, chuyển `MAINTENANCE` và cập nhật chính sách CMS kèm Indirect Prompt Injection | Isolated DB write + immediate AI verification |
| AI-E05 | Khách đăng nhập chuyển sang `/checkout` giữ nguyên session; chặn `403` khách gọi Admin API; Admin kiểm tra badge trạng thái kết nối (`ai-connection-status-badge`), bật/tắt AI & Rate Limit | Multi-context Customer + Admin RBAC |
| AI-E06 | Giao diện di động `375×812`: không đè `MobileBottomNav`, không tràn ngang, xử lý Offline PWA | Mobile Chromium 375×812 |
| **AI-E07** | **Regression `"innova có xe này không"` trên UI + Render Markdown (`<strong>`, `0` ký tự `**`) + Admin thêm mới / đổi giá / ẩn `Toyota Innova Cross` không cần rebuild + Đa lượt `"Xe đó thuê 3 ngày thì giá sao?"` + Nút Reset xoay `sessionId`** | **Browser UI + Dynamic Isolated SQLite CRUD** |

---

## 3. Live Gemini API Evaluation (`scripts/eval-ai-live.mjs` — 16 Kịch bản Live)

Đánh giá trực tiếp với Google Gemini API (`gemini-3.5-flash-lite`) trên bản sao cô lập của `nori.db`, kiểm chứng:
- Handshake `POST /nori-api/dashboard/ai/test` (`connectionStatusLabel === "Gemini Connected"`).
- `EV-01..EV-12`: Tư vấn nhu cầu rõ/mơ hồ, tính giá BRE, thiếu ngày thuê, tiếng Việt không dấu, chống hallucination (`Bugatti Chiron`), lọc cứng ngân sách, mã giảm giá giả, RAG chính sách, Prompt Injection, so sánh 2 dòng xe.
- `EV-13`: Regression thực tế `"innova có xe này không"` trên Gemini live (`0` xe máy, trả lời trực tiếp về Innova).
- `EV-14`: Tra cứu không dấu viết tắt `"co xe fortuner ko"`.
- `EV-15`: Lọc cứng `"xe máy dưới 200k"`.
- `EV-16`: Hội thoại nhiều lượt `"Có Fortuner không?"` → `"Xe đó giá bao nhiêu?"` qua Gemini Interactions API.
