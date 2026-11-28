# NORI AI Assistant — Thiết Kế Bảo Mật (AI Security Architecture v2.9)

> **Nguyên tắc cốt lõi**: Least Privilege (Đặc quyền tối thiểu) · Defense in Depth (Phòng thủ đa lớp) · Zero Trust đối với LLM Output & Untrusted CMS Data.

---

## 1. Bảo vệ thông tin xác thực & Bí mật (Secret Hygiene)

1. **Server-side Only Execution**: Toàn bộ lời gọi Google Gemini API đi qua `src/lib/ai/gemini.ts` trên server Next.js. Khóa `GEMINI_API_KEY` tuyệt đối không dùng `NEXT_PUBLIC_*`, không ghi log, không lưu DB và không trả về trong bất kỳ JSON API nào.
2. **Static Security Linter**: `scripts/static-lint.mjs` quét AST toàn bộ mã nguồn, cấm tuyệt đối `GEMINI_API_KEY` / `OPENAI_API_KEY` trong client components và cấm `dangerouslySetInnerHTML`, `eval`, `new Function`.
3. **Input PII Minimization & Output Redaction**: `redactSensitiveData` ẩn CCCD/CMND, GPLX, email, số điện thoại và chuỗi dạng `AIza*` / `AQ.*` / `sk-*` trước khi gửi sang Gemini; `sanitizeErrorMessage` và `sanitizeAssistantOutput` lọc sạch mọi thông báo lỗi và văn bản đầu ra.

---

## 2. Ma trận phòng thủ mối đe dọa AI (Threat Mitigation Matrix)

| Mối đe dọa | Cơ chế phòng thủ nhiều lớp tại NORI (`v2.9.0`) |
| :--- | :--- |
| **Prompt Injection / Jailbreak** | Lớp 1: `evaluateInputGuardrails()` chặn `ignore previous instructions`, `bỏ qua chỉ thị`, `roleplay root` trước khi gọi Gemini (`0` token tiêu tốn). Lớp 2: System Prompt bất biến. Lớp 3: Tool Registry allowlist (11 hàm chỉ đọc / chuẩn bị điều hướng). |
| **Indirect Prompt Injection (IPI)** | Văn bản đọc từ CMS (`nori-site`, `posts`, `faqs`, `knowledgeNote`) đi qua `sanitizeUntrustedCmsText()` và bao bọc trong `<untrusted_cms_data>...</untrusted_cms_data>`. |
| **Cross-user Booking Exposure** | Công cụ `getCustomerBookingStatus` yêu cầu `ctx.user.collection === 'users'`, gọi Payload Local API với `overrideAccess: false` + điều kiện `customer === ctx.user.id`, đồng thời lọc kiểm chứng lại quyền sở hữu trong bộ nhớ trước khi trả kết quả. Khách chưa đăng nhập hoặc hỏi mã đơn của người khác đều bị từ chối an toàn. |
| **Hallucination / Price Tampering** | Orchestrator kiểm tra `unverifiedClaimGuard`: nếu LLM tự sinh con số giá tiền hoặc khẳng định còn lịch trống mà chưa gọi tool nghiệp vụ, hệ thống tự động bác bỏ và chạy xác thực qua Backend. Checkout vẫn kiểm tra lại nguyên tử toàn bộ giá và khóa `rental_days`. |
| **Markdown XSS & Unsafe Schemes** | `<AIMarkdown />` (`src/components/ai/ai-markdown.tsx` + `src/lib/ai/markdown.ts`) phân tích AST thuần React nodes (không dùng `dangerouslySetInnerHTML`). `sanitizeMarkdownHref()` chỉ cho phép đường dẫn nội bộ `/...` và `https:`/`http:`/`tel:`/`mailto:`, vô hiệu hóa hoàn toàn `javascript:`, `data:`, `vbscript:` và `//evil.domain`. |
| **Session Context Leakage** | Ngữ cảnh hội thoại được tính toán cô lập theo lịch sử của từng phiên (`sessionId`); khi khách nhấn **Bắt đầu hội thoại mới**, client xoay mã `nori_ai_session_id` mới hoàn toàn. |
