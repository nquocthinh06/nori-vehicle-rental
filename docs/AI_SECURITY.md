# NORI AI Assistant — Thiết Kế Bảo Mật (AI Security Architecture)

> **Nguyên tắc cốt lõi**: Least Privilege (Đặc quyền tối thiểu) · Defense in Depth (Phòng thủ đa lớp) · Zero Trust đối với LLM Output.

---

## 1. Bảo vệ thông tin xác thực & Bí mật (Secret Hygiene)

1. **Server-side Only Execution**: Toàn bộ lời gọi OpenAI API đi qua `src/lib/ai/openai.ts` trên server Next.js. Frontend chỉ gọi `/nori-api/ai/*` của chính NORI.
2. **Static Security Linter**: `scripts/static-lint.mjs` kiểm tra AST toàn bộ component `'use client'` và cấm tuyệt đối tham chiếu `OPENAI_API_KEY`.
3. **Env Validation Guard**: `src/lib/env.ts` từ chối mọi biến `NEXT_PUBLIC_*` chứa từ khóa `api_key`, `secret`, `password`, `token`.
4. **No Key in Database / Dashboard**: Global `ai-settings` không có trường lưu API Key; giao diện `/dashboard/ai` chỉ hiển thị trạng thái boolean `Đã cấu hình (Server)` / `Chưa cấu hình`.
5. **Snapshot & Backup Exclusion**: `src/lib/data-sync.ts` loại trừ `ai-settings`, `ai-usage-logs`, `ai-feedback` khỏi Git snapshots và quét chặn mẫu `\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b`.
6. **Output & Error Redaction**: `sanitizeErrorMessage`, `redactSensitiveData` và `sanitizeAssistantOutput` loại bỏ mọi chuỗi dạng `sk-*`, JWT, email/SĐT khỏi log lỗi và phản hồi.

---

## 2. Ma trận phòng thủ mối đe dọa AI (Threat Mitigation Matrix)

| Mối đe dọa | Cơ chế phòng thủ nhiều lớp tại NORI |
| :--- | :--- |
| **Prompt Injection / Jailbreak** | Lớp 1: `evaluateInputGuardrails()` chặn các mẫu `ignore previous instructions`, `bỏ qua chỉ thị`, `jailbreak`, `roleplay root` **trước khi gọi OpenAI** (0 token tiêu tốn). Lớp 2: System Prompt cố định quy tắc bất biến. Lớp 3: Tool Registry allowlist. |
| **Indirect Prompt Injection (IPI)** | Mọi văn bản đọc từ CMS (`nori-site`, `posts`, `faqs`, `knowledgeNote`) đi qua `sanitizeUntrustedCmsText()` để tước bỏ thẻ HTML/script và vô hiệu hóa chỉ thị ẩn, đồng thời bao bọc trong thẻ `<untrusted_cms_data>...</untrusted_cms_data>`. |
| **Secret Exfiltration** | Chặn từ lớp input (`SECRET_EXFILTRATION`), không truyền secret vào context LLM, lọc lại bằng regex tại lớp output (`sanitizeAssistantOutput`). |
| **Admin Privilege Escalation** | AI hoàn toàn không có công cụ ghi/duyệt đơn/sửa giá/xác nhận thanh toán/hoàn tiền. Chat API chỉ đọc `appAuth.currentUser()` (khách hàng), không kế thừa quyền Admin để thao tác quản trị. |
| **Cross-user Data Exposure** | Mọi truy vấn phương tiện/đánh giá dùng `overrideAccess: false`; không có tool đọc danh sách `users`, `admins`, `bookings` của người khác hoặc biển số nội bộ (`licensePlate`). |
| **Unauthorized Tool Execution** | `src/lib/ai/tool-registry.ts` kiểm tra nghiêm ngặt `ALLOWED_TOOL_NAMES` (chỉ 9 hàm đọc/chuẩn bị). Mọi tham số từ LLM được xác thực qua `validateToolArguments()` trước khi gọi Payload/BRE. |
| **Financial / Price Tampering** | Thẻ xe, báo giá và nút Checkout trên UI render từ JSON có cấu trúc do Backend Business Rule Engine tính, không parse từ text AI sinh ra. Checkout kiểm tra lại toàn bộ giá & khóa ngày nguyên tử. |
| **XSS / Injection UI** | React escape mặc định + cấm `dangerouslySetInnerHTML` (được kiểm soát bởi `pnpm lint`) + `sanitizeAssistantOutput()` loại bỏ `<script>`, `<iframe>`, `javascript:`. |
| **CSRF & Cross-site Abuse** | Mọi route `POST`/`PATCH` trong `/nori-api/ai/*` và `/nori-api/dashboard/ai/*` bắt buộc gọi `assertOrigin(request)`. |
| **API Abuse & Cost Amplification** | Rate limit 2 tầng (phút + ngày), giới hạn độ dài input (`1000` ký tự), giới hạn concurrency (`2` req/session, `20` toàn cục), `max_output_tokens`, `max_tool_rounds`, daily USD budget cap và Circuit Breaker. |
| **Privacy & Provider Retention** | Responses API luôn gửi `store: false`. Mặc định `NORI_AI_STORE_CONVERSATIONS=false` (không lưu nguyên văn hội thoại). Bảng `ai_usage_logs` chỉ lưu `sessionHash` (SHA-256 rút gọn), không lưu IP thô hay PII. |

---

## 3. Phân quyền quản trị AI (RBAC)

- Module mới `ai` được đăng ký trong `src/access/nori.ts`:
  - `SUPER_ADMIN`: toàn quyền (`read`, `create`, `update`, `delete`, `publish`).
  - `SYSTEM_ADMIN`: quyền `read`, `update` (xem thống kê, bật/tắt AI, cập nhật giới hạn & trọng số, kiểm tra kết nối).
  - Các vai trò chi nhánh (`OPERATOR`, `RENTAL_STAFF`, `WAREHOUSE_STAFF`, `DELIVERY_STAFF`, `ACCOUNTANT`, `BRANCH_MANAGER`) và tài khoản khách hàng (`users`): **không có quyền truy cập** `/nori-api/dashboard/ai` (nhận HTTP `403 Forbidden`).
- Toàn bộ collections `ai-usage-logs`, `ai-feedback` và global `ai-settings` **không cấp quyền public read**.
