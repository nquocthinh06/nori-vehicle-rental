export type NoriAIErrorCode =
  | 'AI_DISABLED'
  | 'AI_UNCONFIGURED'
  | 'AI_INVALID_API_KEY'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RATE_LIMITED'
  | 'AI_DAILY_LIMIT_EXCEEDED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_CONCURRENCY_LIMIT'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_CIRCUIT_OPEN'
  | 'AI_INPUT_TOO_LONG'
  | 'AI_VALIDATION_ERROR'
  | 'AI_GUARDRAIL_BLOCKED'
  | 'AI_DB_UNAVAILABLE'
  | 'AI_ABORTED'

export class NoriAIError extends Error {
  readonly code: NoriAIErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly userMessage: string

  constructor(options: {
    code: NoriAIErrorCode
    status: number
    userMessage: string
    message?: string
    retryable?: boolean
  }) {
    super(options.message ?? options.userMessage)
    this.name = 'NoriAIError'
    this.code = options.code
    this.status = options.status
    this.userMessage = options.userMessage
    this.retryable = Boolean(options.retryable)
  }
}

export const AI_FALLBACK_LINKS = [
  { label: 'Tìm xe bằng bộ lọc', href: '/vehicles' },
  { label: 'Xem chính sách & hỗ trợ', href: '/support' },
]

/**
 * Strips potential API keys, bearer tokens, or internal paths from any error string
 * before logging or diagnostics.
 */
export function sanitizeErrorMessage(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? 'Unknown error')
  return msg
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, 'OPENAI_API_KEY=[REDACTED]')
    .slice(0, 260)
}

/**
 * Maps unknown provider, network, or database exceptions into safe Vietnamese
 * customer-facing errors without leaking raw stack traces or credentials.
 */
export function mapToNoriAIError(error: unknown): NoriAIError {
  if (error instanceof NoriAIError) return error

  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const status = typeof errObj.status === 'number' ? errObj.status : 0
  const errCode = typeof errObj.code === 'string' ? errObj.code.toLowerCase() : ''
  const errType = typeof errObj.type === 'string' ? errObj.type.toLowerCase() : ''
  const name = error instanceof Error ? error.name : ''
  const rawMsg = sanitizeErrorMessage(error)
  const lower = rawMsg.toLowerCase()

  if (
    name === 'AbortError' ||
    errCode === 'aborted' ||
    lower.includes('request was aborted') ||
    lower.includes('user aborted')
  ) {
    return new NoriAIError({
      code: 'AI_ABORTED',
      status: 499,
      retryable: false,
      userMessage: 'Yêu cầu đã được dừng theo thao tác của bạn.',
      message: rawMsg,
    })
  }

  if (
    name === 'APIConnectionTimeoutError' ||
    errCode === 'etimedout' ||
    errCode === 'timeout' ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return new NoriAIError({
      code: 'AI_TIMEOUT',
      status: 504,
      retryable: true,
      userMessage:
        'Trợ lý AI phản hồi chậm hơn dự kiến và đã hết thời gian chờ. Bạn có thể thử lại hoặc dùng bộ lọc tìm xe trực tiếp.',
      message: rawMsg,
    })
  }

  if (
    status === 401 ||
    status === 403 ||
    errCode === 'invalid_api_key' ||
    lower.includes('incorrect api key') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication')
  ) {
    return new NoriAIError({
      code: 'AI_INVALID_API_KEY',
      status: 503,
      retryable: false,
      userMessage:
        'Trợ lý AI NORI hiện đang tạm gián đoạn cấu hình kết nối. Website và chức năng đặt xe vẫn hoạt động bình thường.',
      message: 'Provider authentication failed',
    })
  }

  if (
    errCode === 'insufficient_quota' ||
    errType === 'insufficient_quota' ||
    lower.includes('exceeded your current quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('billing')
  ) {
    return new NoriAIError({
      code: 'AI_QUOTA_EXCEEDED',
      status: 503,
      retryable: false,
      userMessage:
        'Trợ lý AI NORI tạm thời hết hạn mức phục vụ. Bạn vẫn có thể tìm xe qua bộ lọc, xem báo giá trực tiếp hoặc liên hệ NORI.',
      message: 'Provider quota exhausted',
    })
  }

  if (status === 429 || errCode === 'rate_limit_exceeded' || lower.includes('rate limit')) {
    return new NoriAIError({
      code: 'AI_RATE_LIMITED',
      status: 429,
      retryable: true,
      userMessage:
        'Hệ thống trợ lý AI đang nhận nhiều yêu cầu cùng lúc. Vui lòng chờ ít giây rồi thử lại.',
      message: rawMsg,
    })
  }

  if (
    lower.includes('sqlite') ||
    lower.includes('database') ||
    lower.includes('econnrefused') ||
    lower.includes('postgres')
  ) {
    return new NoriAIError({
      code: 'AI_DB_UNAVAILABLE',
      status: 503,
      retryable: true,
      userMessage:
        'Hệ thống dữ liệu phương tiện tạm thời gián đoạn nên Trợ lý AI chưa thể xác thực thông tin. Vui lòng thử lại sau ít phút.',
      message: rawMsg,
    })
  }

  return new NoriAIError({
    code: 'AI_PROVIDER_ERROR',
    status: status >= 500 || status === 0 ? 503 : 502,
    retryable: status >= 500 || status === 0,
    userMessage:
      'Trợ lý AI NORI hiện gặp sự cố kết nối tạm thời. Bạn có thể thử lại hoặc dùng trực tiếp bộ lọc tìm xe bên dưới.',
    message: rawMsg,
  })
}
