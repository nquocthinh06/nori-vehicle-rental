import type { AIChatMessageInput } from './types.ts'

export const MAX_USER_MESSAGE_CHARS = 1000
export const MAX_HISTORY_MESSAGES = 12
export const MAX_TOTAL_HISTORY_CHARS = 8000

export type GuardrailCategory =
  | 'SECRET_EXFILTRATION'
  | 'PROMPT_INJECTION'
  | 'ADMIN_ESCALATION'
  | 'CROSS_USER_DATA'
  | 'SQL_OR_SYSTEM_EXEC'
  | 'UNSUPPORTED_MUTATION'

export type GuardrailCheckResult = {
  allowed: boolean
  category?: GuardrailCategory
  safeReply?: string
  intent?: string
}

export function stripVietnameseAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

function normalizeForDetection(input: string): string {
  return stripVietnameseAccents(input)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SECRET_EXFIL_PATTERNS: RegExp[] = [
  /\b(api[_\s-]?key|openai[_\s-]?api[_\s-]?key|payload[_\s-]?secret|session[_\s-]?secret|sepay[_\s-]?secret|webhook[_\s-]?secret)\b/i,
  /\b(process\.env|\.env\b|bien moi truong|mat khau admin|admin password|jwt secret|sk-proj)\b/i,
  /\b(tiet lo|cho xem|in ra|dump|reveal|show|print|leak|extract).{0,32}(key|secret|token|password|mat khau|env|system prompt|chi thi he thong)\b/i,
  /\b(system prompt|developer prompt|hidden instructions|noi dung prompt he thong)\b/i,
]

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|above|all|system|prior|safety|policy|rules|instructions|prompt)\b/i,
  /\b(bo qua|quen het|phot lo|vo hieu hoa|pha bo|ghi de)\b.{0,40}\b(chi thi|quy tac|lenh tren|huong dan he thong|bao mat|han che|prompt)\b/i,
  /\b(you are now|act as|pretend to be|jailbreak|dan mode|developer mode|roleplay as root|bay gio ban la admin)\b/i,
  /\b(new system instruction|begin system prompt|end system prompt|<\/?system>)\b/i,
]

const ADMIN_ESCALATION_PATTERNS: RegExp[] = [
  /\b(cap quyen|nang quyen|tro thanh|dang nhap|truy cap|mo khoa).{0,32}\b(admin|super[_\s-]?admin|quan tri|payload admin|dashboard)\b/i,
  /\b(duyet don|tu choi don|xac nhan thanh toan|hoan tien tu dong|sua gia xe trong db|xoa don thue|xoa du lieu|thay doi trang thai don)\b/i,
  /\b(approve booking|confirm payment|issue refund|grant admin|escalate privilege|delete database|update price in database)\b/i,
]

const CROSS_USER_PATTERNS: RegExp[] = [
  /\b(xem|liet ke|cho biet|lay|doc|truy xuat).{0,40}\b(thong tin khach hang khac|danh sach khach hang|don thue cua nguoi khac|email khach hang|so dien thoai khach|tat ca nguoi dung|tai khoan cua nguoi khac|tai khoan admin|du lieu nguoi dung khac)\b/i,
  /\b(other users?|all customers?|another customer'?s? booking|list all users|admin accounts?|customer emails?|customer phone numbers?)\b/i,
]

const SQL_OR_FS_PATTERNS: RegExp[] = [
  /\b(select\s+\*|drop\s+table|union\s+select|delete\s+from|pragma\s+table_info|sqlite_master)\b/i,
  /\b(readfile|cat\s+\/etc\/passwd|fs\.readfilesync|exec\(|child_process|nori\.db)\b/i,
]

const GUARDRAIL_REPLIES: Record<GuardrailCategory, string> = {
  SECRET_EXFILTRATION:
    'Xin lỗi, tôi không thể tiết lộ API key, cấu hình hệ thống, biến môi trường hoặc thông tin nội bộ của NORI. Tôi có thể hỗ trợ bạn tìm xe, kiểm tra lịch trống, tính giá thuê hoặc tra cứu chính sách công khai.',
  PROMPT_INJECTION:
    'Tôi chỉ hoạt động theo đúng phạm vi tư vấn dịch vụ của NORI và không thể bỏ qua các quy tắc bảo mật hoặc thay đổi quyền hạn hệ thống. Bạn cần NORI tư vấn dòng xe, ngày thuê hay chính sách nào?',
  ADMIN_ESCALATION:
    'Trợ lý AI NORI không có quyền truy cập tài khoản quản trị, duyệt đơn thuê, xác nhận thanh toán hay thay đổi dữ liệu hệ thống. Nếu bạn là khách hàng muốn đặt xe, tôi có thể chuẩn bị liên kết để bạn tự xác nhận trên trang Checkout chính thức.',
  CROSS_USER_DATA:
    'Vì lý do bảo mật và quyền riêng tư, tôi không thể truy xuất dữ liệu tài khoản, đơn thuê hoặc thông tin cá nhân của người dùng khác. Bạn có thể tự xem đơn hàng của chính mình tại mục Đơn thuê của tôi (/my-bookings).',
  SQL_OR_SYSTEM_EXEC:
    'Tôi không thể thực thi truy vấn cơ sở dữ liệu tùy ý hoặc truy cập tệp hệ thống. Tôi chỉ sử dụng các công cụ tra cứu nghiệp vụ công khai của NORI để hỗ trợ chọn xe và báo giá.',
  UNSUPPORTED_MUTATION:
    'Tôi không thể tự tạo đơn thuê, duyệt đơn hay xác nhận thanh toán thay bạn. Tôi có thể kiểm tra lịch trống, tính báo giá chính xác và dẫn bạn đến trang Checkout để bạn tự kiểm tra và xác nhận.',
}

/**
 * Inspects user input for prompt injection, secret requests, admin escalation,
 * cross-user data exfiltration, or SQL/filesystem execution attempts BEFORE calling the LLM.
 */
export function evaluateInputGuardrails(message: string): GuardrailCheckResult {
  const normalized = normalizeForDetection(message)

  if (SECRET_EXFIL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      allowed: false,
      category: 'SECRET_EXFILTRATION',
      intent: 'BLOCKED_SECRET_REQUEST',
      safeReply: GUARDRAIL_REPLIES.SECRET_EXFILTRATION,
    }
  }
  if (SQL_OR_FS_PATTERNS.some((p) => p.test(normalized))) {
    return {
      allowed: false,
      category: 'SQL_OR_SYSTEM_EXEC',
      intent: 'BLOCKED_SYSTEM_EXEC',
      safeReply: GUARDRAIL_REPLIES.SQL_OR_SYSTEM_EXEC,
    }
  }
  if (CROSS_USER_PATTERNS.some((p) => p.test(normalized))) {
    return {
      allowed: false,
      category: 'CROSS_USER_DATA',
      intent: 'BLOCKED_CROSS_USER',
      safeReply: GUARDRAIL_REPLIES.CROSS_USER_DATA,
    }
  }
  if (ADMIN_ESCALATION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      allowed: false,
      category: 'ADMIN_ESCALATION',
      intent: 'BLOCKED_ADMIN_ESCALATION',
      safeReply: GUARDRAIL_REPLIES.ADMIN_ESCALATION,
    }
  }
  if (PROMPT_INJECTION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      allowed: false,
      category: 'PROMPT_INJECTION',
      intent: 'BLOCKED_PROMPT_INJECTION',
      safeReply: GUARDRAIL_REPLIES.PROMPT_INJECTION,
    }
  }

  return { allowed: true }
}

/**
 * Sanitizes untrusted CMS / FAQ / Post / Review text before placing it into tool output
 * to defend against Indirect Prompt Injection (IPI).
 */
export function sanitizeUntrustedCmsText(raw: string | null | undefined, maxLen = 1200): string {
  if (!raw || typeof raw !== 'string') return ''
  let cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Neutralize prompt-injection directives embedded in CMS content
  const ipiPatterns: RegExp[] = [
    /ignore\s+(all\s+)?(previous|prior|above|system)\s+instructions?/gi,
    /disregard\s+(all\s+)?(previous|prior|system)\s+instructions?/gi,
    /override\s+(system|safety|policy)\s*(prompt|rules|instructions)?/gi,
    /(bỏ qua|quên hết|phớt lờ|vô hiệu hóa)\s+(mọi\s+|toàn bộ\s+)?(chỉ thị|quy tắc|hướng dẫn|lệnh)\s*(trên|hệ thống|trước đó)?/gi,
    /(reveal|print|output|tiết lộ|in ra)\s+(the\s+)?(openai[_\s-]?api[_\s-]?key|api[_\s-]?key|system\s+prompt|secret)/gi,
    /\[?\s*system\s*prompt\s*\]?/gi,
    /<\s*\/?\s*(system|developer|assistant|tool)\s*>/gi,
  ]

  for (const pat of ipiPatterns) {
    cleaned = cleaned.replace(pat, '[nội dung hướng dẫn bị loại bỏ]')
  }

  return cleaned.slice(0, maxLen)
}

/**
 * Redacts PII & secrets before storing short quality-review summaries or sending text to external logs.
 */
export function redactSensitiveData(input: string, maxLen = 200): string {
  return input
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+84|0)(?:\d[\s.-]?){8,10}\d/g, '[REDACTED_PHONE]')
    .replace(/\b\d{9,16}\b/g, '[REDACTED_ID]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

/**
 * Final output defense: strips script/HTML tags and guarantees no secret pattern
 * or raw API key can ever be emitted in assistant text.
 */
export function sanitizeAssistantOutput(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  let safe = raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, '[ĐÃ ẨN]')
    .replace(/OPENAI_API_KEY\s*[:=]\s*\S+/gi, 'OPENAI_API_KEY=[ĐÃ ẨN]')
    .replace(/PAYLOAD_SECRET\s*[:=]\s*\S+/gi, 'PAYLOAD_SECRET=[ĐÃ ẨN]')
    .replace(/NORI_SESSION_SECRET\s*[:=]\s*\S+/gi, 'NORI_SESSION_SECRET=[ĐÃ ẨN]')
    .trim()

  if (!safe) {
    safe =
      'Xin lỗi, tôi chưa thể tổng hợp câu trả lời phù hợp. Bạn có thể mô tả rõ hơn nhu cầu (loại xe, số chỗ, ngân sách, ngày thuê) hoặc dùng bộ lọc tìm xe của NORI.'
  }
  return safe
}

/**
 * Validates and normalizes incoming user message and conversation history.
 */
export function validateAndSanitizeChatInput(params: { message: unknown; history?: unknown }):
  | {
      ok: true
      message: string
      history: AIChatMessageInput[]
    }
  | {
      ok: false
      code: 'AI_VALIDATION_ERROR' | 'AI_INPUT_TOO_LONG'
      error: string
    } {
  if (typeof params.message !== 'string') {
    return {
      ok: false,
      code: 'AI_VALIDATION_ERROR',
      error: 'Vui lòng nhập nội dung câu hỏi hợp lệ.',
    }
  }
  const trimmed = params.message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
  if (!trimmed) {
    return {
      ok: false,
      code: 'AI_VALIDATION_ERROR',
      error: 'Vui lòng nhập câu hỏi trước khi gửi.',
    }
  }
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) {
    return {
      ok: false,
      code: 'AI_INPUT_TOO_LONG',
      error: `Tin nhắn quá dài (tối đa ${MAX_USER_MESSAGE_CHARS} ký tự). Vui lòng rút gọn câu hỏi để Trợ lý AI xử lý chính xác hơn.`,
    }
  }

  const normalizedHistory: AIChatMessageInput[] = []
  let totalHistoryChars = 0

  if (Array.isArray(params.history)) {
    const sliced = params.history.slice(-MAX_HISTORY_MESSAGES)
    for (const item of sliced) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const role = rec.role === 'user' || rec.role === 'assistant' ? rec.role : null
      const content = typeof rec.content === 'string' ? rec.content.trim() : ''
      if (!role || !content) continue
      const clipped = content.slice(0, 1200)
      if (totalHistoryChars + clipped.length > MAX_TOTAL_HISTORY_CHARS) break
      totalHistoryChars += clipped.length
      normalizedHistory.push({ role, content: clipped })
    }
  }

  return {
    ok: true,
    message: trimmed,
    history: normalizedHistory,
  }
}
