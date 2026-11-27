import {
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_REDIRECT_HOPS,
  validateImportUrl,
  type DnsLookupFn,
} from './security.ts'

export type FetchResult = {
  finalUrl: string
  status: number
  contentType: string
  buffer: Buffer
  text?: string
}

export class ImportFetchError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  readonly suggestion: string

  constructor(params: {
    message: string
    code: string
    status?: number
    retryable?: boolean
    suggestion?: string
  }) {
    super(params.message)
    this.name = 'ImportFetchError'
    this.code = params.code
    this.status = params.status ?? 502
    this.retryable = Boolean(params.retryable)
    this.suggestion =
      params.suggestion ??
      'Bạn có thể tải Brochure PDF chính thức (Phương thức 4), nhập file NORI JSON/CSV (Phương thức 3) hoặc nhập thủ công (Phương thức 5).'
  }
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const lenHeader = response.headers.get('content-length')
  if (lenHeader) {
    const parsedLen = Number(lenHeader)
    if (Number.isFinite(parsedLen) && parsedLen > maxBytes) {
      throw new ImportFetchError({
        message: `Kích thước phản hồi (${Math.round(parsedLen / 1024)} KB) vượt quá giới hạn an toàn (${Math.round(maxBytes / 1024)} KB).`,
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
      })
    }
  }

  if (!response.body) {
    const arr = await response.arrayBuffer()
    if (arr.byteLength > maxBytes) {
      throw new ImportFetchError({
        message: `Dữ liệu tải về vượt quá giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
      })
    }
    return Buffer.from(arr)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new ImportFetchError({
          message: `Dữ liệu tải về vượt quá giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB.`,
          code: 'PAYLOAD_TOO_LARGE',
          status: 413,
        })
      }
      chunks.push(value)
    }
  }
  return Buffer.concat(chunks, total)
}

function detectBotOrCaptchaChallenge(status: number, bodySample: string): boolean {
  if (status === 403 || status === 429) return true
  return /cloudflare|cf-browser-verification|turnstile|g-recaptcha|hcaptcha|verify you are human|access denied/i.test(
    bodySample.slice(0, 6000),
  )
}

export async function safeFetchUrl(
  rawUrl: string,
  options?: {
    kind?: 'html' | 'pdf' | 'image'
    timeoutMs?: number
    maxBytes?: number
    requireAllowlist?: boolean
    extraAllowedDomains?: string[]
    dnsLookup?: DnsLookupFn
    skipDnsCheck?: boolean
    fetchImpl?: typeof fetch
  },
): Promise<FetchResult> {
  const kind = options?.kind ?? 'html'
  const timeoutMs = options?.timeoutMs ?? (kind === 'html' ? 10_000 : 20_000)
  const maxBytes =
    options?.maxBytes ??
    (kind === 'pdf' ? MAX_PDF_BYTES : kind === 'image' ? MAX_IMAGE_BYTES : MAX_HTML_BYTES)
  const fetchFn = options?.fetchImpl ?? fetch

  let currentUrl = await validateImportUrl(rawUrl, {
    requireAllowlist: options?.requireAllowlist,
    extraAllowedDomains: options?.extraAllowedDomains,
    dnsLookup: options?.dnsLookup,
    skipDnsCheck: options?.skipDnsCheck,
  })

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    let response: Response
    try {
      response = await fetchFn(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'NORI-Catalogue-Importer/1.0 (+https://nori.vn)',
          Accept:
            kind === 'pdf'
              ? 'application/pdf,application/octet-stream'
              : kind === 'image'
                ? 'image/avif,image/webp,image/png,image/jpeg,image/*'
                : 'text/html,application/xhtml+xml,application/json;q=0.9',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
        },
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const causeCode =
        err &&
        typeof err === 'object' &&
        'cause' in err &&
        err.cause &&
        typeof err.cause === 'object'
          ? String((err.cause as { code?: unknown }).code ?? '')
          : ''
      if (
        errMsg.includes('ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED') ||
        causeCode.includes('SSL')
      ) {
        throw new ImportFetchError({
          message: `Máy chủ ${currentUrl.hostname} sử dụng cấu hình TLS/SSL cũ không an toàn (${causeCode || 'TLS_ERROR'}).`,
          code: 'TLS_LEGACY_UNSUPPORTED',
          status: 502,
          retryable: false,
        })
      }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ImportFetchError({
          message: `Kết nối tới ${currentUrl.hostname} quá thời gian chờ (${Math.round(timeoutMs / 1000)}s).`,
          code: 'FETCH_TIMEOUT',
          status: 504,
          retryable: true,
        })
      }
      throw new ImportFetchError({
        message: `Không thể kết nối tới ${currentUrl.hostname}: ${errMsg.slice(0, 160)}`,
        code: 'FETCH_NETWORK_ERROR',
        status: 502,
        retryable: true,
      })
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new ImportFetchError({
          message: `Máy chủ trả về mã chuyển hướng ${response.status} nhưng thiếu header Location.`,
          code: 'INVALID_REDIRECT',
          status: 502,
        })
      }
      if (hop >= MAX_REDIRECT_HOPS) {
        throw new ImportFetchError({
          message: `URL chuyển hướng quá ${MAX_REDIRECT_HOPS} lần.`,
          code: 'TOO_MANY_REDIRECTS',
          status: 400,
        })
      }
      const nextUrlStr = new URL(location, currentUrl).toString()
      currentUrl = await validateImportUrl(nextUrlStr, {
        requireAllowlist: options?.requireAllowlist,
        extraAllowedDomains: options?.extraAllowedDomains,
        dnsLookup: options?.dnsLookup,
        skipDnsCheck: options?.skipDnsCheck,
      })
      continue
    }

    const buffer = await readResponseWithLimit(response, maxBytes)
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    const text =
      kind === 'html' || contentType.includes('text/') || contentType.includes('json')
        ? buffer.toString('utf8')
        : undefined

    if (kind === 'html' && detectBotOrCaptchaChallenge(response.status, text ?? '')) {
      throw new ImportFetchError({
        message: `Website ${currentUrl.hostname} từ chối truy cập tự động (HTTP ${response.status} / WAF hoặc CAPTCHA). NORI không vượt qua cơ chế bảo vệ này.`,
        code: response.status === 429 ? 'RATE_LIMITED_UPSTREAM' : 'UPSTREAM_WAF_BLOCKED',
        status: 422,
        retryable: false,
        suggestion:
          'Hãy tải Brochure PDF chính thức của hãng và dùng tab "Nhập từ brochure PDF", hoặc dùng NORI JSON / Nhập thủ công.',
      })
    }

    if (response.status >= 400) {
      throw new ImportFetchError({
        message: `Trang nguồn ${currentUrl.hostname} trả về lỗi HTTP ${response.status}.`,
        code: response.status === 404 ? 'UPSTREAM_NOT_FOUND' : 'UPSTREAM_HTTP_ERROR',
        status: response.status === 404 ? 404 : 502,
        retryable: response.status >= 500,
      })
    }

    if (kind === 'html' && contentType && !/html|xml|json|text\/plain/i.test(contentType)) {
      throw new ImportFetchError({
        message: `Định dạng phản hồi (${contentType}) không phải trang HTML/JSON hợp lệ.`,
        code: 'UNSUPPORTED_CONTENT_TYPE',
        status: 415,
      })
    }

    return {
      finalUrl: currentUrl.toString(),
      status: response.status,
      contentType,
      buffer,
      text,
    }
  }

  throw new ImportFetchError({
    message: 'Vượt quá số lần chuyển hướng cho phép.',
    code: 'TOO_MANY_REDIRECTS',
    status: 400,
  })
}
