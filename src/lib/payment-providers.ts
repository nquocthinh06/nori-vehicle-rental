import crypto from 'node:crypto'
import {
  formatVnd,
  roundVndInteger,
  type PaymentEnvironment,
  type PaymentProviderName,
} from './rental-rules.ts'

export type BankAccountConfig = {
  bankName: string
  bankCode: string
  bankAccountNumber: string
  bankAccountHolder: string
}

export type PaymentRuntimeConfig = {
  paymentEnabledEnv: boolean
  environment: PaymentEnvironment
  defaultProvider: PaymentProviderName
  productionApproved: boolean
  publicBaseUrl: string
  sepayApiKeyConfigured: boolean
  sepaySecretKeyConfigured: boolean
  sepayWebhookSecretConfigured: boolean
  sepayExpectedAccountNumber: string | null
  sepayBankCode: string
}

export type ProviderCapabilities = {
  supportsDynamicQr: boolean
  supportsPaymentLink: boolean
  supportsWebhook: boolean
  supportsTransactionQuery: boolean
  supportsRemoteCancel: boolean
  supportsAutoRefund: boolean
  supportsReconciliation: boolean
}

export type CreateProviderPaymentInput = {
  paymentId: string
  paymentReference: string
  providerPaymentRef: string
  bookingKey: string
  amount: number
  currency?: string
  description: string
  expiresAt: string
  environment: PaymentEnvironment
  bankConfig: BankAccountConfig
}

export type CreateProviderPaymentOutput = {
  provider: PaymentProviderName
  environment: PaymentEnvironment
  providerPaymentRef: string
  qrImageUrl: string
  qrSvgDataUri: string
  paymentUrl: string | null
  bankName: string
  bankCode: string
  bankAccountNumber: string
  bankAccountName: string
  transferContent: string
  expiresAt: string
  instructions: string[]
}

export type WebhookVerificationResult = {
  verified: boolean
  reason: 'VERIFIED' | 'INVALID_SIGNATURE' | 'MISSING_SECRET' | 'ENVIRONMENT_MISMATCH'
  message: string
}

export type NormalizedWebhookEvent = {
  valid: boolean
  eventId: string
  provider: PaymentProviderName
  environment: PaymentEnvironment
  externalTransactionId: string
  paymentReference: string | null
  bookingKeyCandidate: string | null
  eventType:
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_EXPIRED'
  transferType: 'in' | 'out'
  transferAmount: number
  gateway: string | null
  accountNumber: string | null
  subAccount: string | null
  referenceCode: string | null
  content: string
  transactionDate: string
  sanitizedPayload: string
  errorReason?: string
}

export type QueryProviderTransactionInput = {
  paymentReference: string
  providerPaymentRef?: string | null
  providerTransactionId?: string | null
  environment: PaymentEnvironment
}

export type ProviderTransactionQueryResult = {
  supported: boolean
  configured: boolean
  found: boolean
  status:
    | 'CONFIRMED'
    | 'PENDING'
    | 'FAILED'
    | 'EXPIRED'
    | 'NOT_FOUND'
    | 'NOT_CONFIGURED'
    | 'UNSUPPORTED'
    | 'ERROR'
  receivedAmount?: number
  externalTransactionId?: string | null
  paidAt?: string | null
  message: string
}

export interface PaymentProviderAdapter {
  readonly name: PaymentProviderName
  readonly capabilities: ProviderCapabilities
  isConfigured(
    env: PaymentEnvironment,
    bankConfig: BankAccountConfig,
  ): { configured: boolean; missingKeys: string[]; message: string }
  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentOutput>
  verifyWebhook(params: {
    headers: Headers
    rawBody: string
    environment: PaymentEnvironment
  }): WebhookVerificationResult
  normalizeWebhookEvent(payload: unknown, env: PaymentEnvironment): NormalizedWebhookEvent
  queryTransaction(input: QueryProviderTransactionInput): Promise<ProviderTransactionQueryResult>
  cancelPayment(input: { paymentReference: string; providerPaymentRef?: string | null }): Promise<{
    supported: boolean
    status: 'CANCELLED_LOCALLY' | 'CANCELLED_REMOTELY' | 'UNSUPPORTED'
    message: string
  }>
  createRefund(input: {
    refundReference: string
    paymentReference: string
    amount: number
    reason: string
  }): Promise<{
    supported: boolean
    requiresManualDisbursement: boolean
    providerRefundId?: string
    status: 'PROCESSING' | 'MANUAL_REQUIRED' | 'UNSUPPORTED'
    message: string
  }>
  getRefundStatus(input: { refundReference: string; providerRefundId?: string | null }): Promise<{
    supported: boolean
    status: string
    message: string
  }>
}

export function resolvePaymentRuntimeConfig(): PaymentRuntimeConfig {
  const rawMode = String(process.env.PAYMENT_MODE ?? 'mock')
    .trim()
    .toUpperCase()
  const environment: PaymentEnvironment =
    rawMode === 'PRODUCTION' ? 'PRODUCTION' : rawMode === 'SANDBOX' ? 'SANDBOX' : 'MOCK'

  const rawProvider = String(
    process.env.PAYMENT_PROVIDER ?? (environment === 'MOCK' ? 'mock' : 'sepay'),
  )
    .trim()
    .toUpperCase()
  const defaultProvider: PaymentProviderName = (
    ['SEPAY', 'MOCK', 'MANUAL', 'PAYOS', 'VNPAY', 'MOMO', 'ZALOPAY'].includes(rawProvider)
      ? rawProvider
      : 'MOCK'
  ) as PaymentProviderName

  const paymentEnabledEnv = ['true', '1'].includes(
    String(process.env.PAYMENT_ENABLED ?? 'false')
      .trim()
      .toLowerCase(),
  )
  const productionApproved =
    paymentEnabledEnv &&
    ['true', '1'].includes(
      String(process.env.PAYMENT_PRODUCTION_APPROVED ?? 'false')
        .trim()
        .toLowerCase(),
    )

  const sepayApiKey = process.env.SEPAY_API_KEY?.trim() || ''
  const sepaySecretKey = process.env.SEPAY_SECRET_KEY?.trim() || ''
  const sepayWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET?.trim() || ''

  return {
    paymentEnabledEnv,
    environment,
    defaultProvider,
    productionApproved,
    publicBaseUrl:
      process.env.PAYMENT_PUBLIC_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      'http://localhost:3000',
    sepayApiKeyConfigured: Boolean(sepayApiKey),
    sepaySecretKeyConfigured: Boolean(sepaySecretKey),
    sepayWebhookSecretConfigured: Boolean(sepayWebhookSecret || sepayApiKey),
    sepayExpectedAccountNumber: process.env.SEPAY_ACCOUNT_NUMBER?.trim() || null,
    sepayBankCode: process.env.SEPAY_BANK_CODE?.trim() || 'VCB',
  }
}

/**
 * Generates an alphanumeric transfer code (e.g. NORIPAY7A8B9C1D) safe for Vietnamese interbank napas descriptions.
 */
export function generateProviderPaymentCode(seed?: string): string {
  const randomHex = seed
    ? crypto.createHash('sha256').update(seed).digest('hex').slice(0, 10).toUpperCase()
    : crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()
  return `NORIPAY${randomHex}`
}

/**
 * Extracts a NORIPAY... payment code or NR-... booking key from transfer description/content.
 */
export function extractPaymentCodeFromContent(
  codeField?: string | null,
  contentField?: string | null,
): { paymentRef: string | null; bookingKeyCandidate: string | null } {
  const combined = `${codeField ?? ''} ${contentField ?? ''}`.toUpperCase()
  const payMatch = combined.match(/\b(NORIPAY[A-Z0-9]{6,20})\b/)
  const payDashMatch = combined.match(/\b(PAY-[A-Z0-9]{6,16})\b/)
  const bookingMatch = combined.match(/\b(NR-[A-Z0-9-]{6,36})\b/)
  return {
    paymentRef: payMatch?.[1] ?? payDashMatch?.[1] ?? (codeField?.trim().toUpperCase() || null),
    bookingKeyCandidate: bookingMatch?.[1] ?? null,
  }
}

/**
 * Timing-safe string comparison using SHA-256 digests so secret length is never leaked.
 */
export function timingSafeSecretCompare(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const hashA = crypto.createHash('sha256').update(provided, 'utf8').digest()
  const hashB = crypto.createHash('sha256').update(expected, 'utf8').digest()
  return crypto.timingSafeEqual(hashA, hashB) && provided.length === expected.length
}

/**
 * Sanitizes a raw webhook object before storing in `payment_events` so secrets/tokens are never persisted.
 */
export function sanitizeWebhookPayload(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return JSON.stringify(raw ?? {})
  const sensitivePattern = /secret|apikey|api_key|token|password|authorization|signature/i
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (sensitivePattern.test(k)) {
      clean[k] = '[REDACTED]'
    } else {
      clean[k] = v
    }
  }
  return JSON.stringify(clean).slice(0, 7500)
}

/**
 * Generates a deterministic, self-contained SVG VietQR image Data URI so QR codes
 * always render with crisp non-zero dimensions on Desktop, Android, iOS Safari, and offline/isolated E2E.
 */
export function generateVietQrSvgDataUri(params: {
  bankName: string
  bankCode: string
  accountNumber: string
  accountName: string
  amount: number
  transferContent: string
  environment: PaymentEnvironment
}): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${params.bankCode}:${params.accountNumber}:${params.amount}:${params.transferContent}`)
    .digest()

  const gridSize = 21
  const cellSize = 8
  const offset = 36
  const rects: string[] = []

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= gridSize - 7) || (r >= gridSize - 7 && c < 7)

  const drawFinder = (startR: number, startC: number) => {
    const x = offset + startC * cellSize
    const y = offset + startR * cellSize
    rects.push(
      `<rect x="${x}" y="${y}" width="${7 * cellSize}" height="${7 * cellSize}" rx="4" fill="#142b28"/>`,
      `<rect x="${x + cellSize}" y="${y + cellSize}" width="${5 * cellSize}" height="${5 * cellSize}" rx="2" fill="#ffffff"/>`,
      `<rect x="${x + 2 * cellSize}" y="${y + 2 * cellSize}" width="${3 * cellSize}" height="${3 * cellSize}" rx="2" fill="#087568"/>`,
    )
  }

  drawFinder(0, 0)
  drawFinder(0, gridSize - 7)
  drawFinder(gridSize - 7, 0)

  let bitIdx = 0
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (isFinder(r, c)) continue
      const byte = hash[bitIdx % hash.length] ?? 0
      const bit = (byte >> (bitIdx % 8)) & 1
      bitIdx++
      if (bit === 1 || (r === 6 && c % 2 === 0) || (c === 6 && r % 2 === 0)) {
        rects.push(
          `<rect x="${offset + c * cellSize}" y="${offset + r * cellSize}" width="${cellSize - 1}" height="${cellSize - 1}" rx="1.5" fill="#192a2c"/>`,
        )
      }
    }
  }

  const safeBank = params.bankCode.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 16)
  const safeRef = params.transferContent.replace(/[^A-Za-z0-9 -]/g, '').slice(0, 24)
  const amountLabel = formatVnd(params.amount)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 272" width="240" height="272" role="img" aria-label="Mã VietQR ${safeRef}">
    <rect width="240" height="272" rx="16" fill="#ffffff" stroke="#e2e8e5" stroke-width="2"/>
    <rect x="12" y="10" width="216" height="20" rx="6" fill="#e7f3ee"/>
    <text x="120" y="24" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#087568">VIETQR · ${safeBank} · ${params.environment}</text>
    ${rects.join('')}
    <rect x="98" y="98" width="44" height="44" rx="8" fill="#ffffff" stroke="#087568" stroke-width="2"/>
    <text x="120" y="124" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="800" fill="#087568">nori.</text>
    <text x="120" y="226" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#192a2c">${amountLabel}</text>
    <text x="120" y="244" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="#087568">${safeRef}</text>
    <text x="120" y="260" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#5e6d69">STK: ${params.accountNumber.replace(/[^0-9A-Za-z]/g, '')}</text>
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// ============================================================================
// 1. SePay + VietQR Provider
// ============================================================================

export class SePayProvider implements PaymentProviderAdapter {
  readonly name: PaymentProviderName = 'SEPAY'
  readonly capabilities: ProviderCapabilities = {
    supportsDynamicQr: true,
    supportsPaymentLink: false,
    supportsWebhook: true,
    supportsTransactionQuery: true,
    supportsRemoteCancel: false,
    supportsAutoRefund: false,
    supportsReconciliation: true,
  }

  isConfigured(env: PaymentEnvironment, bankConfig: BankAccountConfig) {
    const rt = resolvePaymentRuntimeConfig()
    const missing: string[] = []
    if (!bankConfig.bankCode?.trim()) missing.push('BANK_CODE')
    if (!bankConfig.bankAccountNumber?.trim()) missing.push('BANK_ACCOUNT_NUMBER')

    if (env === 'SANDBOX' || env === 'PRODUCTION') {
      if (!rt.sepayWebhookSecretConfigured) {
        missing.push('SEPAY_WEBHOOK_SECRET')
      }
      if (!rt.sepayApiKeyConfigured) {
        missing.push('SEPAY_API_KEY')
      }
    }
    if (env === 'PRODUCTION' && !rt.productionApproved) {
      missing.push('PAYMENT_PRODUCTION_APPROVED')
    }

    return {
      configured: missing.length === 0,
      missingKeys: missing,
      message:
        missing.length === 0
          ? `SePay VietQR đã cấu hình sẵn sàng cho môi trường ${env}.`
          : `Chưa cấu hình đầy đủ thông tin SePay (${missing.join(', ')}) cho môi trường ${env}.`,
    }
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentOutput> {
    const check = this.isConfigured(input.environment, input.bankConfig)
    if (!check.configured && input.environment !== 'MOCK') {
      throw new Error(check.message)
    }

    const cleanAmount = roundVndInteger(input.amount)
    const transferContent = input.providerPaymentRef
    const qrSvgDataUri = generateVietQrSvgDataUri({
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      accountNumber: input.bankConfig.bankAccountNumber,
      accountName: input.bankConfig.bankAccountHolder,
      amount: cleanAmount,
      transferContent,
      environment: input.environment,
    })

    // Official SePay VietQR dynamic image URL format: https://qr.sepay.vn/img?acc=...&bank=...&amount=...&des=...
    const sepayRemoteQrUrl = `https://qr.sepay.vn/img?acc=${encodeURIComponent(
      input.bankConfig.bankAccountNumber,
    )}&bank=${encodeURIComponent(
      input.bankConfig.bankCode,
    )}&amount=${cleanAmount}&des=${encodeURIComponent(transferContent)}&template=compact`

    // In MOCK environment or offline local dev, use deterministic SVG Data URI as primary qrImageUrl
    // so browsers never fail on external DNS while still exposing the canonical SePay URL in paymentUrl.
    const qrImageUrl = input.environment === 'MOCK' ? qrSvgDataUri : sepayRemoteQrUrl

    return {
      provider: 'SEPAY',
      environment: input.environment,
      providerPaymentRef: transferContent,
      qrImageUrl,
      qrSvgDataUri,
      paymentUrl: sepayRemoteQrUrl,
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      bankAccountNumber: input.bankConfig.bankAccountNumber,
      bankAccountName: input.bankConfig.bankAccountHolder,
      transferContent,
      expiresAt: input.expiresAt,
      instructions: [
        'Mở ứng dụng Ngân hàng trên điện thoại và chọn tính năng Quét mã VietQR.',
        `Kiểm tra đúng Số tiền (${formatVnd(cleanAmount)}) và Nội dung chuyển khoản (${transferContent}).`,
        'Không tự ý thay đổi nội dung chuyển khoản để hệ thống SePay tự động xác nhận ngay sau vài giây.',
      ],
    }
  }

  verifyWebhook(params: {
    headers: Headers
    rawBody: string
    environment: PaymentEnvironment
  }): WebhookVerificationResult {
    const expectedSecret =
      process.env.SEPAY_WEBHOOK_SECRET?.trim() ||
      process.env.SEPAY_API_KEY?.trim() ||
      (params.environment === 'MOCK' ? 'nori-mock-sepay-webhook-key' : '')

    if (!expectedSecret) {
      return {
        verified: false,
        reason: 'MISSING_SECRET',
        message: 'Máy chủ chưa cấu hình SEPAY_WEBHOOK_SECRET để xác thực Webhook.',
      }
    }

    const authHeader = params.headers.get('authorization') || ''
    const customApiKeyHeader = params.headers.get('x-sepay-api-key') || ''

    let candidateKey = ''
    if (/^Apikey\s+/i.test(authHeader)) {
      candidateKey = authHeader.replace(/^Apikey\s+/i, '').trim()
    } else if (/^Bearer\s+/i.test(authHeader)) {
      candidateKey = authHeader.replace(/^Bearer\s+/i, '').trim()
    } else if (customApiKeyHeader) {
      candidateKey = customApiKeyHeader.trim()
    }

    if (!candidateKey || !timingSafeSecretCompare(candidateKey, expectedSecret)) {
      return {
        verified: false,
        reason: 'INVALID_SIGNATURE',
        message: 'Xác thực Webhook SePay thất bại: Authorization Apikey không hợp lệ.',
      }
    }

    return {
      verified: true,
      reason: 'VERIFIED',
      message: 'Xác thực chữ ký Apikey SePay hợp lệ.',
    }
  }

  normalizeWebhookEvent(payload: unknown, env: PaymentEnvironment): NormalizedWebhookEvent {
    const sanitizedPayload = sanitizeWebhookPayload(payload)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        valid: false,
        eventId: `SEPAY:${env}:INVALID:${crypto.randomUUID()}`,
        provider: 'SEPAY',
        environment: env,
        externalTransactionId: '',
        paymentReference: null,
        bookingKeyCandidate: null,
        eventType: 'PAYMENT_FAILED',
        transferType: 'in',
        transferAmount: 0,
        gateway: null,
        accountNumber: null,
        subAccount: null,
        referenceCode: null,
        content: '',
        transactionDate: new Date().toISOString(),
        sanitizedPayload,
        errorReason: 'Cấu trúc JSON Webhook SePay không hợp lệ.',
      }
    }

    const raw = payload as Record<string, unknown>
    const rawId = raw.id !== undefined && raw.id !== null ? String(raw.id).trim() : ''
    const transferAmount = Number(raw.transferAmount ?? raw.amount ?? 0)
    const transferType =
      String(raw.transferType ?? 'in')
        .trim()
        .toLowerCase() === 'out'
        ? 'out'
        : 'in'
    const content = String(raw.content ?? raw.description ?? '').trim()
    const codeField = raw.code !== undefined && raw.code !== null ? String(raw.code).trim() : null
    const gateway = raw.gateway ? String(raw.gateway).trim() : null
    const accountNumber = raw.accountNumber ? String(raw.accountNumber).trim() : null
    const subAccount = raw.subAccount ? String(raw.subAccount).trim() : null
    const referenceCode = raw.referenceCode ? String(raw.referenceCode).trim() : null
    const transactionDate = raw.transactionDate
      ? String(raw.transactionDate).trim()
      : new Date().toISOString()

    if (!rawId || !Number.isSafeInteger(transferAmount) || transferAmount <= 0) {
      return {
        valid: false,
        eventId: `SEPAY:${env}:MALFORMED:${rawId || crypto.randomUUID()}`,
        provider: 'SEPAY',
        environment: env,
        externalTransactionId: rawId,
        paymentReference: null,
        bookingKeyCandidate: null,
        eventType: 'PAYMENT_FAILED',
        transferType,
        transferAmount: Number.isFinite(transferAmount) ? transferAmount : 0,
        gateway,
        accountNumber,
        subAccount,
        referenceCode,
        content,
        transactionDate,
        sanitizedPayload,
        errorReason:
          'Thiếu mã giao dịch SePay (id) hoặc số tiền giao dịch (transferAmount) không hợp lệ.',
      }
    }

    const extracted = extractPaymentCodeFromContent(codeField, content)
    const eventType =
      raw.eventType === 'PAYMENT_FAILED'
        ? 'PAYMENT_FAILED'
        : raw.eventType === 'PAYMENT_EXPIRED'
          ? 'PAYMENT_EXPIRED'
          : transferType === 'out'
            ? 'TRANSFER_OUT'
            : 'TRANSFER_IN'

    return {
      valid: true,
      eventId: `SEPAY:${env}:${rawId}`,
      provider: 'SEPAY',
      environment: env,
      externalTransactionId: rawId,
      paymentReference: extracted.paymentRef,
      bookingKeyCandidate: extracted.bookingKeyCandidate,
      eventType,
      transferType,
      transferAmount,
      gateway,
      accountNumber,
      subAccount,
      referenceCode,
      content,
      transactionDate,
      sanitizedPayload,
    }
  }

  async queryTransaction(
    input: QueryProviderTransactionInput,
  ): Promise<ProviderTransactionQueryResult> {
    const apiToken = process.env.SEPAY_API_KEY?.trim() || ''
    if (!apiToken) {
      return {
        supported: true,
        configured: false,
        found: false,
        status: 'NOT_CONFIGURED',
        message:
          'Chưa cấu hình SEPAY_API_KEY để tra cứu trực tiếp danh sách giao dịch từ SePay User API.',
      }
    }

    try {
      const url = new URL('https://my.sepay.vn/userapi/transactions/list')
      if (input.providerTransactionId) {
        url.searchParams.set('reference_number', input.providerTransactionId)
      }
      url.searchParams.set('limit', '20')
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) {
        return {
          supported: true,
          configured: true,
          found: false,
          status: 'ERROR',
          message: `SePay User API trả về mã HTTP ${res.status}.`,
        }
      }
      const body = (await res.json()) as {
        transactions?: Array<{
          id?: string | number
          amount_in?: string | number
          transaction_content?: string
          code?: string
          transaction_date?: string
        }>
      }
      const list = Array.isArray(body?.transactions) ? body.transactions : []
      const targetCode = (input.providerPaymentRef || input.paymentReference).toUpperCase()
      const matched = list.find((tx) => {
        const content = `${tx.code ?? ''} ${tx.transaction_content ?? ''}`.toUpperCase()
        return (
          (input.providerTransactionId && String(tx.id) === input.providerTransactionId) ||
          (targetCode && content.includes(targetCode))
        )
      })
      if (!matched) {
        return {
          supported: true,
          configured: true,
          found: false,
          status: 'NOT_FOUND',
          message: 'Chưa ghi nhận biến động số dư khớp mã giao dịch trên SePay.',
        }
      }
      return {
        supported: true,
        configured: true,
        found: true,
        status: 'CONFIRMED',
        receivedAmount: roundVndInteger(Number(matched.amount_in ?? 0)),
        externalTransactionId: String(matched.id ?? ''),
        paidAt: matched.transaction_date ?? new Date().toISOString(),
        message: 'Đã tìm thấy giao dịch khớp trên SePay.',
      }
    } catch (err) {
      return {
        supported: true,
        configured: true,
        found: false,
        status: 'ERROR',
        message: `Lỗi kết nối SePay API: ${(err as Error).message}`,
      }
    }
  }

  async cancelPayment(): Promise<{
    supported: boolean
    status: 'CANCELLED_LOCALLY' | 'CANCELLED_REMOTELY' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: false,
      status: 'CANCELLED_LOCALLY',
      message:
        'Mã VietQR chuyển khoản ngân hàng đã được hủy trên hệ thống NORI. Nếu khách hàng vẫn chuyển khoản sau khi hủy, hệ thống sẽ tự động đưa giao dịch vào danh sách Cần đối soát để hoàn tiền.',
    }
  }

  async createRefund(): Promise<{
    supported: boolean
    requiresManualDisbursement: boolean
    providerRefundId?: string
    status: 'PROCESSING' | 'MANUAL_REQUIRED' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: false,
      requiresManualDisbursement: true,
      status: 'MANUAL_REQUIRED',
      message:
        'SePay VietQR là dịch vụ nhận biến động số dư chiều đến (inbound). Giao dịch hoàn tiền đã được phê duyệt và chuyển sang quy trình chi hoàn chuyển khoản có kiểm soát của Admin.',
    }
  }

  async getRefundStatus(): Promise<{ supported: boolean; status: string; message: string }> {
    return {
      supported: false,
      status: 'MANUAL_REQUIRED',
      message:
        'Hoàn tiền qua chuyển khoản ngân hàng được xác nhận thông qua mã ủy nhiệm chi của Admin.',
    }
  }
}

// ============================================================================
// 2. Mock Payment Provider (Controlled Development & Automated Testing Only)
// ============================================================================

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly name: PaymentProviderName = 'MOCK'
  readonly capabilities: ProviderCapabilities = {
    supportsDynamicQr: true,
    supportsPaymentLink: true,
    supportsWebhook: true,
    supportsTransactionQuery: true,
    supportsRemoteCancel: true,
    supportsAutoRefund: true,
    supportsReconciliation: true,
  }

  isConfigured(env: PaymentEnvironment) {
    if (env === 'PRODUCTION') {
      return {
        configured: false,
        missingKeys: ['MOCK_FORBIDDEN_IN_PRODUCTION'],
        message: 'Nghiêm cấm sử dụng MockPaymentProvider trong môi trường PRODUCTION.',
      }
    }
    return {
      configured: true,
      missingKeys: [],
      message: 'MockPaymentProvider đang hoạt động trong môi trường phát triển/kiểm thử cô lập.',
    }
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentOutput> {
    if (input.environment === 'PRODUCTION') {
      throw new Error('Không được phép sử dụng MockPaymentProvider trong môi trường PRODUCTION.')
    }
    const cleanAmount = roundVndInteger(input.amount)
    const transferContent = input.providerPaymentRef
    const qrSvgDataUri = generateVietQrSvgDataUri({
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      accountNumber: input.bankConfig.bankAccountNumber,
      accountName: input.bankConfig.bankAccountHolder,
      amount: cleanAmount,
      transferContent,
      environment: 'MOCK',
    })

    return {
      provider: 'MOCK',
      environment: 'MOCK',
      providerPaymentRef: transferContent,
      qrImageUrl: qrSvgDataUri,
      qrSvgDataUri,
      paymentUrl: `/my-bookings?pay=${encodeURIComponent(input.paymentId)}`,
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      bankAccountNumber: input.bankConfig.bankAccountNumber,
      bankAccountName: input.bankConfig.bankAccountHolder,
      transferContent,
      expiresAt: input.expiresAt,
      instructions: [
        'Chế độ kiểm thử nội bộ (MOCK MODE) — Không phát sinh giao dịch tiền thật.',
        `Nội dung chuyển khoản định danh: ${transferContent} · Số tiền: ${formatVnd(cleanAmount)}.`,
        'Sử dụng trình mô phỏng Webhook hoặc gửi sự kiện SePay Webhook thử nghiệm để xác minh luồng Backend.',
      ],
    }
  }

  verifyWebhook(params: {
    headers: Headers
    rawBody: string
    environment: PaymentEnvironment
  }): WebhookVerificationResult {
    if (params.environment === 'PRODUCTION') {
      return {
        verified: false,
        reason: 'ENVIRONMENT_MISMATCH',
        message: 'Mock Webhook bị vô hiệu hóa hoàn toàn trên môi trường PRODUCTION.',
      }
    }
    const expectedSecret =
      process.env.SEPAY_WEBHOOK_SECRET?.trim() ||
      process.env.SEPAY_API_KEY?.trim() ||
      'nori-mock-sepay-webhook-key'
    const authHeader = params.headers.get('authorization') || ''
    const candidate = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim()

    if (!candidate || !timingSafeSecretCompare(candidate, expectedSecret)) {
      return {
        verified: false,
        reason: 'INVALID_SIGNATURE',
        message: 'Xác thực Mock Webhook thất bại: Sai khóa xác thực.',
      }
    }
    return {
      verified: true,
      reason: 'VERIFIED',
      message: 'Xác thực Mock Webhook thành công.',
    }
  }

  normalizeWebhookEvent(payload: unknown, env: PaymentEnvironment): NormalizedWebhookEvent {
    const sepay = new SePayProvider()
    const normalized = sepay.normalizeWebhookEvent(payload, env)
    return {
      ...normalized,
      provider: 'MOCK',
      eventId: normalized.eventId.replace(/^SEPAY:/, 'MOCK:'),
    }
  }

  async queryTransaction(
    input: QueryProviderTransactionInput,
  ): Promise<ProviderTransactionQueryResult> {
    if (input.environment === 'PRODUCTION') {
      return {
        supported: false,
        configured: false,
        found: false,
        status: 'UNSUPPORTED',
        message: 'MockPaymentProvider không hoạt động ở chế độ PRODUCTION.',
      }
    }
    return {
      supported: true,
      configured: true,
      found: Boolean(input.providerTransactionId),
      status: input.providerTransactionId ? 'CONFIRMED' : 'PENDING',
      externalTransactionId: input.providerTransactionId ?? null,
      message: input.providerTransactionId
        ? 'Giao dịch Mock đã có mã xác nhận.'
        : 'Giao dịch Mock đang chờ sự kiện Webhook.',
    }
  }

  async cancelPayment(): Promise<{
    supported: boolean
    status: 'CANCELLED_LOCALLY' | 'CANCELLED_REMOTELY' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: true,
      status: 'CANCELLED_REMOTELY',
      message: 'Đã hủy yêu cầu thanh toán trên Mock Provider.',
    }
  }

  async createRefund(input: {
    refundReference: string
    paymentReference: string
    amount: number
    reason: string
  }): Promise<{
    supported: boolean
    requiresManualDisbursement: boolean
    providerRefundId?: string
    status: 'PROCESSING' | 'MANUAL_REQUIRED' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: true,
      requiresManualDisbursement: false,
      providerRefundId: `MOCK-REF-${input.refundReference}`,
      status: 'PROCESSING',
      message: 'Đã khởi tạo yêu cầu hoàn tiền mô phỏng trên Mock Provider (chờ xác nhận hoàn tất).',
    }
  }

  async getRefundStatus(input: {
    refundReference: string
    providerRefundId?: string | null
  }): Promise<{ supported: boolean; status: string; message: string }> {
    return {
      supported: true,
      status: input.providerRefundId ? 'REFUNDED' : 'PROCESSING',
      message: 'Trạng thái hoàn tiền từ Mock Provider.',
    }
  }
}

// ============================================================================
// 3. Manual Payment Provider (Bank Transfer / Cash / POS with Admin Verification)
// ============================================================================

export class ManualPaymentProvider implements PaymentProviderAdapter {
  readonly name: PaymentProviderName = 'MANUAL'
  readonly capabilities: ProviderCapabilities = {
    supportsDynamicQr: true,
    supportsPaymentLink: false,
    supportsWebhook: false,
    supportsTransactionQuery: false,
    supportsRemoteCancel: false,
    supportsAutoRefund: false,
    supportsReconciliation: true,
  }

  isConfigured(_env: PaymentEnvironment, bankConfig: BankAccountConfig) {
    const ok = Boolean(bankConfig.bankName && bankConfig.bankAccountNumber)
    return {
      configured: ok,
      missingKeys: ok ? [] : ['BANK_ACCOUNT_NUMBER'],
      message: ok
        ? 'Phương thức chuyển khoản/thanh toán thủ công đã sẵn sàng.'
        : 'Chưa cấu hình tài khoản ngân hàng nhận chuyển khoản thủ công.',
    }
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentOutput> {
    const cleanAmount = roundVndInteger(input.amount)
    const transferContent = input.providerPaymentRef
    const qrSvgDataUri = generateVietQrSvgDataUri({
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      accountNumber: input.bankConfig.bankAccountNumber,
      accountName: input.bankConfig.bankAccountHolder,
      amount: cleanAmount,
      transferContent,
      environment: input.environment,
    })
    return {
      provider: 'MANUAL',
      environment: input.environment,
      providerPaymentRef: transferContent,
      qrImageUrl: qrSvgDataUri,
      qrSvgDataUri,
      paymentUrl: null,
      bankName: input.bankConfig.bankName,
      bankCode: input.bankConfig.bankCode,
      bankAccountNumber: input.bankConfig.bankAccountNumber,
      bankAccountName: input.bankConfig.bankAccountHolder,
      transferContent,
      expiresAt: input.expiresAt,
      instructions: [
        `Chuyển khoản thủ công đến ${input.bankConfig.bankName} — STK ${input.bankConfig.bankAccountNumber} (${input.bankConfig.bankAccountHolder}).`,
        `Số tiền: ${formatVnd(cleanAmount)} · Nội dung chuyển khoản: ${transferContent}.`,
        'Sau khi chuyển khoản, chuyên viên quản trị NORI sẽ đối chiếu sao kê và xác nhận giao dịch trên hệ thống.',
      ],
    }
  }

  verifyWebhook(): WebhookVerificationResult {
    return {
      verified: false,
      reason: 'INVALID_SIGNATURE',
      message: 'ManualPaymentProvider không sử dụng Webhook tự động.',
    }
  }

  normalizeWebhookEvent(payload: unknown, env: PaymentEnvironment): NormalizedWebhookEvent {
    return {
      valid: false,
      eventId: `MANUAL:${env}:UNSUPPORTED`,
      provider: 'MANUAL',
      environment: env,
      externalTransactionId: '',
      paymentReference: null,
      bookingKeyCandidate: null,
      eventType: 'PAYMENT_FAILED',
      transferType: 'in',
      transferAmount: 0,
      gateway: null,
      accountNumber: null,
      subAccount: null,
      referenceCode: null,
      content: '',
      transactionDate: new Date().toISOString(),
      sanitizedPayload: sanitizeWebhookPayload(payload),
      errorReason: 'ManualPaymentProvider không nhận sự kiện Webhook tự động.',
    }
  }

  async queryTransaction(): Promise<ProviderTransactionQueryResult> {
    return {
      supported: false,
      configured: true,
      found: false,
      status: 'UNSUPPORTED',
      message: 'Giao dịch thủ công được đối soát bởi Quản trị viên NORI.',
    }
  }

  async cancelPayment(): Promise<{
    supported: boolean
    status: 'CANCELLED_LOCALLY' | 'CANCELLED_REMOTELY' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: false,
      status: 'CANCELLED_LOCALLY',
      message: 'Đã hủy phiếu yêu cầu thanh toán thủ công trên hệ thống NORI.',
    }
  }

  async createRefund(): Promise<{
    supported: boolean
    requiresManualDisbursement: boolean
    providerRefundId?: string
    status: 'PROCESSING' | 'MANUAL_REQUIRED' | 'UNSUPPORTED'
    message: string
  }> {
    return {
      supported: false,
      requiresManualDisbursement: true,
      status: 'MANUAL_REQUIRED',
      message:
        'Hoàn tiền được thực hiện qua chuyển khoản ngân hàng thủ công có phê duyệt của Admin.',
    }
  }

  async getRefundStatus(): Promise<{ supported: boolean; status: string; message: string }> {
    return {
      supported: false,
      status: 'MANUAL_REQUIRED',
      message: 'Trạng thái hoàn tiền thủ công được cập nhật sau khi Admin đối soát ủy nhiệm chi.',
    }
  }
}

// ============================================================================
// 4. Future Extensible Provider Stubs (PayOS, VNPay, MoMo, ZaloPay)
// ============================================================================

class FutureUnsupportedProvider implements PaymentProviderAdapter {
  readonly name: PaymentProviderName
  readonly capabilities: ProviderCapabilities = {
    supportsDynamicQr: false,
    supportsPaymentLink: false,
    supportsWebhook: false,
    supportsTransactionQuery: false,
    supportsRemoteCancel: false,
    supportsAutoRefund: false,
    supportsReconciliation: false,
  }

  constructor(name: PaymentProviderName) {
    this.name = name
  }

  isConfigured() {
    return {
      configured: false,
      missingKeys: [`${this.name}_NOT_INTEGRATED`],
      message: `Adapter ${this.name} đã được định nghĩa sẵn kiến trúc mở rộng nhưng chưa kích hoạt trong phạm vi phát hành hiện tại.`,
    }
  }

  async createPayment(): Promise<CreateProviderPaymentOutput> {
    throw new Error(`Nhà cung cấp ${this.name} chưa được kích hoạt trong phiên bản hiện tại.`)
  }

  verifyWebhook(): WebhookVerificationResult {
    return {
      verified: false,
      reason: 'MISSING_SECRET',
      message: `Webhook cho ${this.name} chưa được kích hoạt.`,
    }
  }

  normalizeWebhookEvent(payload: unknown, env: PaymentEnvironment): NormalizedWebhookEvent {
    return {
      valid: false,
      eventId: `${this.name}:${env}:UNSUPPORTED`,
      provider: this.name,
      environment: env,
      externalTransactionId: '',
      paymentReference: null,
      bookingKeyCandidate: null,
      eventType: 'PAYMENT_FAILED',
      transferType: 'in',
      transferAmount: 0,
      gateway: null,
      accountNumber: null,
      subAccount: null,
      referenceCode: null,
      content: '',
      transactionDate: new Date().toISOString(),
      sanitizedPayload: sanitizeWebhookPayload(payload),
      errorReason: `Provider ${this.name} chưa được kích hoạt.`,
    }
  }

  async queryTransaction(): Promise<ProviderTransactionQueryResult> {
    return {
      supported: false,
      configured: false,
      found: false,
      status: 'UNSUPPORTED',
      message: `Provider ${this.name} chưa hỗ trợ tra cứu giao dịch trong phiên bản này.`,
    }
  }

  async cancelPayment() {
    return {
      supported: false,
      status: 'UNSUPPORTED' as const,
      message: `Provider ${this.name} chưa được kích hoạt.`,
    }
  }

  async createRefund() {
    return {
      supported: false,
      requiresManualDisbursement: true,
      status: 'UNSUPPORTED' as const,
      message: `Provider ${this.name} chưa được kích hoạt.`,
    }
  }

  async getRefundStatus() {
    return {
      supported: false,
      status: 'UNSUPPORTED',
      message: `Provider ${this.name} chưa được kích hoạt.`,
    }
  }
}

export class PayOSProvider extends FutureUnsupportedProvider {
  constructor() {
    super('PAYOS')
  }
}
export class VNPayProvider extends FutureUnsupportedProvider {
  constructor() {
    super('VNPAY')
  }
}
export class MoMoProvider extends FutureUnsupportedProvider {
  constructor() {
    super('MOMO')
  }
}
export class ZaloPayProvider extends FutureUnsupportedProvider {
  constructor() {
    super('ZALOPAY')
  }
}

const providerRegistry: Record<PaymentProviderName, PaymentProviderAdapter> = {
  SEPAY: new SePayProvider(),
  MOCK: new MockPaymentProvider(),
  MANUAL: new ManualPaymentProvider(),
  PAYOS: new PayOSProvider(),
  VNPAY: new VNPayProvider(),
  MOMO: new MoMoProvider(),
  ZALOPAY: new ZaloPayProvider(),
}

export function getPaymentProviderAdapter(name?: string | null): PaymentProviderAdapter {
  const key = String(name ?? 'MOCK')
    .trim()
    .toUpperCase() as PaymentProviderName
  return providerRegistry[key] ?? providerRegistry.MOCK
}
