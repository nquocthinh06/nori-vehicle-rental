# NORI AI Assistant — Kiến Trúc Hệ Thống (AI Architecture)

> **Tên tính năng chính thức**: NORI AI Assistant – Intelligent Vehicle Recommendation & Rental Assistant  
> **Nhà cung cấp AI chính thức**: OpenAI API (Responses API qua `openai` Node/TypeScript SDK chính thức)  
> **Model mặc định**: Cấu hình qua biến môi trường `OPENAI_MODEL` (khuyến nghị `gpt-4.1-mini`)

---

## 1. Kiến trúc tổng thể (High-Level Architecture)

NORI AI Assistant được thiết kế theo kiến trúc phân tầng rõ ràng, cô lập hoàn toàn lời gọi OpenAI ở phía máy chủ và buộc mọi thông tin phương tiện, lịch trống, báo giá, khuyến mãi và chính sách phải đi qua các dịch vụ nghiệp vụ chuẩn của NORI.

```mermaid
flowchart LR
  CustomerUI["Customer Chat UI\n(Desktop Floating / Mobile Full-screen PWA)"]
  AdminUI["Admin AI Management Center\n(/dashboard/ai)"]
  AIChatAPI["NORI AI API\n(/nori-api/ai/*)"]
  AdminAIAPI["Admin AI API\n(/nori-api/dashboard/ai/*)"]
  Orchestrator["AI Orchestrator\n(src/lib/ai/orchestrator.ts)"]
  Guardrails["Security Guardrails & Rate Limit\n(guardrails.ts, rate-limit.ts)"]
  OpenAIProvider["OpenAI Responses API Provider\n(openai.ts, store: false)"]
  ToolRegistry["Allowlisted Tool Registry\n(9 Tools + Schema Validation)"]
  RecEngine["Hybrid Recommendation Engine\n(recommendation.ts)"]
  KnowledgeRAG["Knowledge Base & Live RAG\n(knowledge.ts)"]
  BusinessServices["NORI Business Services\n(rental-rules.ts, multi-branch-service.ts, promo-service.ts)"]
  PayloadDB[("Payload CMS & SQLite\n(nori.db / PostgreSQL)")]

  CustomerUI -->|"HTTPS POST + Origin Check"| AIChatAPI
  AdminUI -->|"RBAC Admin Session"| AdminAIAPI
  AIChatAPI --> Orchestrator
  Orchestrator --> Guardrails
  Orchestrator -->|"Controlled Function Calling Loop"| OpenAIProvider
  OpenAIProvider -->|"function_call"| ToolRegistry
  ToolRegistry --> RecEngine
  ToolRegistry --> KnowledgeRAG
  ToolRegistry --> BusinessServices
  RecEngine --> PayloadDB
  KnowledgeRAG --> PayloadDB
  BusinessServices --> PayloadDB
  AdminAIAPI --> PayloadDB
```

---

## 2. Luồng xử lý chi tiết (Sequence Diagram)

```mermaid
sequenceDiagram
  actor Customer as Khách hàng (Guest / Logged-in)
  participant UI as AI Chat UI
  participant API as POST /nori-api/ai/chat
  participant Orch as AI Orchestrator
  participant Guard as Guardrails & Rate Limit
  participant OAI as OpenAI Responses API
  participant Tools as Allowlisted Tool Registry
  participant BRE as NORI Services & Payload DB

  Customer->>UI: Gửi câu hỏi (VD: "Xe 7 chỗ dưới 1.5tr từ 01/12 đến 04/12")
  UI->>API: POST { message, history, sessionId }
  API->>Orch: runNoriAIChat(sessionKey, user, signal)
  Orch->>Guard: Kiểm tra độ dài, Prompt Injection, Rate Limit, Budget, Circuit Breaker
  alt Vi phạm Guardrail / Hết hạn mức
    Guard-->>UI: Trả về phản hồi từ chối an toàn + Fallback Links
  else Hợp lệ
    Orch->>OAI: responses.create({ model, instructions, input, tools, store: false })
    OAI-->>Orch: function_call (VD: recommendVehicles / calculateRentalPrice)
    Orch->>Tools: Validate JSON Schema + Allowlist
    Tools->>BRE: Truy vấn Payload (overrideAccess: false) & Business Rule Engine
    BRE-->>Tools: Dữ liệu thật + Structured UI Cards / Quote
    Tools-->>Orch: toolOutputForLLM + Verified UI Artifacts
    Orch->>OAI: responses.create(input + function_call_output, store: false)
    OAI-->>Orch: Final Vietnamese Response + Token Usage
    Orch->>BRE: Ghi telemetry vào ai_usage_logs (không lưu PII/API Key)
    Orch-->>UI: { reply, vehicleCards, quote, comparison, bookingHandoff, citations }
    UI-->>Customer: Hiển thị câu trả lời + Vehicle Recommendation Cards tương tác
  end
```

---

## 3. Luồng dữ liệu (Data Flow Diagram)

```mermaid
flowchart TD
  UserMsg["User Natural Language Input"] --> SanitizeIn["validateAndSanitizeChatInput\n+ evaluateInputGuardrails"]
  SanitizeIn --> ContextBuild["Build Context Window\n(System Prompt + Safe History)"]
  ContextBuild --> OpenAICall["OpenAI Responses API\n(store: false, max_output_tokens)"]
  OpenAICall -->|"Tool Call JSON"| ArgValidate["validateToolArguments\n(Allowlist + Strict Types)"]
  ArgValidate --> LiveDB["Live Payload CMS Queries\n(vehicle-models, vehicles, reviews, promotions, nori-site, posts)"]
  LiveDB -->|"Structured Verified Artifacts"| UIRender["Frontend Cards / Quote / Comparison\n(Render trực tiếp từ Backend JSON)"]
  LiveDB -->|"Sanitized CMS Data\n(<untrusted_cms_data>)"| OpenAICall
  OpenAICall -->|"Text Reply"| SanitizeOut["sanitizeAssistantOutput\n(Strip XSS & Secret Patterns)"]
  SanitizeOut --> UIRender
  OpenAICall -->|"Token Usage"| UsageLog[("ai_usage_logs\n(No Raw PII / No Transcript by default)")]
```

---

## 4. Cấu trúc mã nguồn (`src/lib/ai/`)

| Module | Trách nhiệm chính |
| :--- | :--- |
| `src/lib/ai/types.ts` | Khai báo kiểu dữ liệu cho Provider, 9 Allowlisted Tools, Structured UI Cards, Quote, Comparison, Handoff, Telemetry. |
| `src/lib/ai/config.ts` | Đọc biến môi trường server, chuẩn hóa cấu hình và kẹp giới hạn Admin trong trần an toàn server. |
| `src/lib/ai/errors.ts` | Phân loại lỗi chuẩn hóa (`NoriAIError`), ánh xạ mã lỗi OpenAI (401/403/429/quota/timeout/5xx) & DB sang thông điệp tiếng Việt an toàn, ẩn secret. |
| `src/lib/ai/guardrails.ts` | Bảo vệ Input (Prompt Injection, Secret Exfiltration, Admin Escalation, Cross-User, SQL/FS), Indirect Prompt Injection sanitizer cho CMS, Redaction PII và Output XSS sanitizer. |
| `src/lib/ai/rate-limit.ts` | Rate limiting theo phút & ngày, giới hạn đồng thời, ngân sách USD/ngày và Circuit Breaker cho OpenAI provider. |
| `src/lib/ai/usage.ts` | Bảng giá tham khảo ước tính chi phí theo model và ghi nhận telemetry vào `ai-usage-logs`. |
| `src/lib/ai/system-prompt.ts` | System Prompt chuyên biệt tiếng Việt cho NORI, ranh giới bảo mật `<untrusted_cms_data>` và chuẩn phân biệt giá tham khảo / báo giá / đơn xác nhận. |
| `src/lib/ai/schemas.ts` | JSON Schema cho OpenAI Function Calling và bộ validate tham số runtime cho cả 9 hàm. |
| `src/lib/ai/recommendation.ts` | **NORI Hybrid Recommendation Engine**: NLP tiếng Việt không dấu, lọc cứng điều kiện bắt buộc, chấm điểm có trọng số minh bạch (35/25/20/10/10) và sinh lý do đề xuất. |
| `src/lib/ai/knowledge.ts` | **Lightweight RAG** truy vấn live `nori-site`, bài viết `published` (`posts`) và chi nhánh `ACTIVE`, kèm nguồn trích dẫn URL. |
| `src/lib/ai/tools.ts` | Triển khai nghiệp vụ cho 9 Business Tools tái sử dụng trực tiếp `rental-rules.ts`, `multi-branch-service.ts`, `promo-service.ts`. |
| `src/lib/ai/tool-registry.ts` | Allowlist dispatcher chặn tuyệt đối hàm ngoài danh sách. |
| `src/lib/ai/openai.ts` | Tích hợp chính thức `OpenAIResponsesProvider` (`client.responses.create`, `store: false`, exponential backoff retry, timeout & abort). |
| `src/lib/ai/provider.ts` | AI Provider Interface factory + `MockTestAIProvider` cô lập hoàn toàn chỉ bật khi `NORI_AI_TEST_MOCK=1`. |
| `src/lib/ai/orchestrator.ts` | Điều phối vòng lặp Function Calling, kiểm soát giới hạn vòng gọi và hợp nhất dữ liệu xác thực cho UI. |

---

## 5. Sơ đồ ERD phần bổ sung AI (Additive-only Schema)

Migration additive-only `20261128_010000_ai_assistant_foundation` bổ sung 7 bảng mới trên cả SQLite và PostgreSQL (`ai_settings`, `ai_settings_quick_suggestions`, `ai_usage_logs`, `ai_feedback` cùng 3 bảng quan hệ hệ thống Payload 4.0 `ai_settings_rels`, `ai_usage_logs_rels`, `ai_feedback_rels`, nâng tổng số bảng SQLite từ `109 → 116`) mà không xóa hay sửa bất kỳ bảng nghiệp vụ hiện có nào:

```mermaid
erDiagram
  ai_settings ||--o{ ai_settings_quick_suggestions : "has"
  ai_settings {
    text id PK
    integer enabled
    text greeting_message
    numeric max_output_tokens
    numeric max_tool_rounds
    numeric rate_limit_per_minute
    numeric rate_limit_per_day
    numeric daily_budget_usd
    numeric weight_budget
    numeric weight_purpose
    numeric weight_capacity
    numeric weight_rating
    numeric weight_fuel
    text knowledge_note
    text updated_by_email
  }
  ai_settings_quick_suggestions {
    text id PK
    text _parent_id FK
    integer _order
    text label
    text prompt
  }
  ai_usage_logs {
    text id PK
    text request_id UK
    text event_type
    text status
    text provider
    text model
    text user_type
    text session_hash
    text intent
    text tools_called
    text recommended_model_slugs
    text clicked_model_slug
    integer no_result_found
    numeric input_tokens
    numeric output_tokens
    numeric total_tokens
    numeric estimated_cost_usd
    numeric latency_ms
    text error_code
    text guardrail_triggered
  }
  ai_feedback {
    text id PK
    text request_id
    text rating
    text reason_category
    text comment
    text recommended_slugs
    text user_type
    text review_status
    text admin_note
  }
```

---

## 6. Thuật toán Hybrid Recommendation System

Thuật toán của NORI là hệ thống **Hybrid Deterministic Recommendation** (kết hợp NLP + Structured Intent Extraction + Rule-based Hard Filtering + Content-based Weighted Scoring + Explainable Rationale) — **không phải mô hình Machine Learning huấn luyện trên lịch sử cá nhân hóa**.

1. **Giai đoạn 1 — Structured Intent Extraction (`extractStructuredIntent`)**: Chuẩn hóa tiếng Việt không dấu, bóc tách ngân sách (`dưới 1.5 triệu`, `500k`), số chỗ (`7 chỗ`, `gia đình`), loại xe (`CAR`/`MOTORBIKE`/`PICKUP`), nhiên liệu, hộp số, mục đích sử dụng và khoảng ngày thuê.
2. **Giai đoạn 2 — Hard Filtering (Lọc cứng bắt buộc)**: Loại bỏ trước khi chấm điểm mọi xe không đáp ứng:
   - Không đủ số chỗ ngồi yêu cầu.
   - Sai danh mục phương tiện (`CAR` / `MOTORBIKE` / `PICKUP`).
   - Vượt ngân sách tối đa khi khách yêu cầu nghiêm ngặt (`strictBudget = true`).
   - Không khớp loại hộp số hoặc nhiên liệu bắt buộc.
   - Không khả dụng trong khoảng ngày thuê đã xác định.
   - Không ở trạng thái kinh doanh `ACTIVE` / dòng xe chưa `visible`.
3. **Giai đoạn 3 — Weighted Scoring (Trọng số mặc định chuẩn hóa 100%)**:
   - Phù hợp ngân sách: **35%**
   - Phù hợp mục đích sử dụng: **25%**
   - Phù hợp sức chứa / số chỗ: **20%**
   - Đánh giá đã xác minh: **10%** (áp dụng Bayesian smoothing với `priorMean = 4.2`, `priorWeight = 3`; dòng xe chưa có đánh giá nhận điểm trung tính `65/100`, tuyệt đối không tự bịa điểm).
   - Hiệu quả sử dụng nhiên liệu: **10%**
4. **Giai đoạn 4 — Explainable Output**: Sinh tối đa 4 lý do bằng tiếng Việt trích trực tiếp từ thuộc tính xác thực của xe và hiển thị trực quan trên Vehicle Recommendation Card.
