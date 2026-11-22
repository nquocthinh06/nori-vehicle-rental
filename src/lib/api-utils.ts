import 'server-only'
import crypto from 'node:crypto'
import { APIError } from 'payload'
import { classifyUnexpectedError } from './error-classifier'
import { extractClientIp } from './session-cookie'

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie',
}

export type RequestLogger = {
  requestId: string
  route: string
  step: (name: string, durationMs: number) => void
  time: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  steps: () => Record<string, number>
  totalMs: () => number
  responseHeaders: (extra?: Record<string, string>) => Record<string, string>
  logSuccess: (status: number, extra?: Record<string, string | number | boolean | null>) => void
  logError: (
    category: string,
    status: number,
    summary: string,
    extra?: Record<string, string | number | boolean | null>,
  ) => void
}

function sanitizeIncomingRequestId(raw: string | null): string {
  const clean = (raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32)
  return clean || `nr-${crypto.randomUUID().slice(0, 12)}`
}

export function createRequestLogger(route: string, request?: Request): RequestLogger {
  const requestId = sanitizeIncomingRequestId(
    request?.headers.get('x-nori-request-id') ||
      request?.headers.get('x-request-id') ||
      request?.headers.get('x-vercel-id') ||
      null,
  )
  const startedAt = performance.now()
  const stepTimings: Record<string, number> = {}

  const recordStep = (name: string, durationMs: number) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
    stepTimings[safeName] = Number(durationMs.toFixed(1))
  }

  return {
    requestId,
    route,
    step: recordStep,
    async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const t0 = performance.now()
      try {
        return await fn()
      } finally {
        recordStep(name, performance.now() - t0)
      }
    },
    steps: () => ({ ...stepTimings }),
    totalMs: () => Number((performance.now() - startedAt).toFixed(1)),
    responseHeaders(extra?: Record<string, string>) {
      const total = Number((performance.now() - startedAt).toFixed(1))
      const serverTiming = [
        ...Object.entries(stepTimings).map(([k, v]) => `${k};dur=${v}`),
        `total;dur=${total}`,
      ].join(', ')
      return {
        'X-NORI-Request-Id': requestId,
        'Server-Timing': serverTiming,
        ...extra,
      }
    },
    logSuccess(status: number, extra?: Record<string, string | number | boolean | null>) {
      const totalMs = Number((performance.now() - startedAt).toFixed(1))
      if (process.env.NORI_LOG_REQUESTS === '1' || totalMs >= 500) {
        console.info(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: totalMs >= 1000 ? 'warn' : 'info',
            event: 'nori_api_request',
            requestId,
            route,
            status,
            durationMs: totalMs,
            steps: stepTimings,
            ...extra,
          }),
        )
      }
    },
    logError(
      category: string,
      status: number,
      summary: string,
      extra?: Record<string, string | number | boolean | null>,
    ) {
      const totalMs = Number((performance.now() - startedAt).toFixed(1))
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: status >= 500 ? 'error' : 'warn',
          event: 'nori_api_error',
          requestId,
          route,
          status,
          category,
          durationMs: totalMs,
          steps: stepTimings,
          summary: summary.slice(0, 240),
          ...extra,
        }),
      )
    },
  }
}

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(
    { success: true, data },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } },
  )
}

export function fail(
  message: string,
  status = 400,
  code = 'VALIDATION_ERROR',
  fields?: Record<string, string>,
  extraHeaders?: Record<string, string>,
) {
  return Response.json(
    { success: false, error: { message, code, fields } },
    { status, headers: { ...NO_STORE_HEADERS, ...extraHeaders } },
  )
}

export async function body(
  request: Request,
  allowlist: string[],
  maxBytes = 6000,
): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.length > maxBytes) throw new APIError('Nội dung gửi lên quá dài.', 400)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new APIError('Dữ liệu gửi lên không hợp lệ.', 400)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new APIError('Dữ liệu gửi lên không hợp lệ.', 400)
  if (Object.keys(value).some((key) => !allowlist.includes(key)))
    throw new APIError('Yêu cầu chứa trường không được phép.', 400)
  return value as Record<string, unknown>
}

export function text(value: unknown, max = 254) {
  return typeof value === 'string' ? value.trim().slice(0, max + 1) : ''
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

export function assertRateLimit(
  request: Request,
  bucket: string,
  maxRequests = 40,
  windowMs = 60_000,
) {
  const ip = extractClientIp(request.headers)
  const key = `${bucket}:${ip}`
  const now = Date.now()
  if (rateLimitBuckets.size > 5000) {
    for (const [k, entry] of rateLimitBuckets.entries()) {
      if (entry.resetAt <= now) rateLimitBuckets.delete(k)
    }
  }
  const existing = rateLimitBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  if (existing.count >= maxRequests) {
    throw new APIError('Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.', 429)
  }
  existing.count += 1
}

export function assertOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new APIError('Nguồn yêu cầu không hợp lệ.', 403)
  }
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  let candidateOrigin = origin
  if (!candidateOrigin && referer) {
    try {
      candidateOrigin = new URL(referer).origin
    } catch {
      throw new APIError('Nguồn yêu cầu không hợp lệ.', 403)
    }
  }
  if (!candidateOrigin) return
  const allowed = new Set<string>()
  for (const value of [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.FIGMA_PUBLIC_URL,
    request.url,
  ]) {
    if (!value) continue
    try {
      allowed.add(new URL(value).origin)
    } catch {
      // ignore invalid env URLs
    }
  }

  const rawAllowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? []
  for (const item of rawAllowedOrigins) {
    const trimmed = item.trim()
    if (!trimmed) continue
    try {
      allowed.add(new URL(trimmed).origin)
    } catch {
      // ignore invalid URLs
    }
  }

  const urlProto = new URL(request.url).protocol
  const rawForwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
  const forwardedProto =
    rawForwardedProto === 'https' || rawForwardedProto === 'http' ? `${rawForwardedProto}:` : null
  const host = request.headers.get('host')?.trim()
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  // Next can build request.url from its bind address behind a reverse proxy or LAN interface.
  // Allow exact Host / X-Forwarded-Host origins under both direct and forwarded protocol.
  for (const h of [host, forwardedHost]) {
    if (!h) continue
    allowed.add(`${urlProto}//${h}`)
    if (forwardedProto) allowed.add(`${forwardedProto}//${h}`)
  }

  // Also support cf-visitor header scheme matching
  const cfVisitor = request.headers.get('cf-visitor')
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor)
      if (parsed?.scheme === 'https' && candidateOrigin.startsWith('http://')) {
        candidateOrigin = candidateOrigin.replace('http://', 'https://')
      }
    } catch {
      // ignore
    }
  }

  if (!allowed.has(candidateOrigin)) {
    throw new APIError('Nguồn yêu cầu không được phép.', 403)
  }
}

export function apiError(error: unknown, context?: { logger?: RequestLogger; route?: string }) {
  const logger = context?.logger
  const headers = logger ? logger.responseHeaders() : undefined
  const isApiError =
    error instanceof APIError ||
    (typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number')
  if (isApiError) {
    const err = error as { status: number; message: string; data?: { code?: string } | null }
    if (err.status === 404) {
      logger?.logError('RESOURCE_NOT_FOUND', 404, err.message)
      return fail(
        'Không tìm thấy thông tin được yêu cầu.',
        404,
        'RESOURCE_NOT_FOUND',
        undefined,
        headers,
      )
    }
    if (err.status >= 500 && err.status !== 503 && err.status !== 504) {
      logger?.logError('INTERNAL_API_ERROR', 503, err.message)
      return fail(
        'NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.',
        503,
        'SERVICE_UNAVAILABLE',
        undefined,
        headers,
      )
    }
    const explicitCode =
      typeof err.data?.code === 'string' && err.data.code.trim() ? err.data.code.trim() : null
    const code =
      explicitCode ??
      (err.status === 409
        ? 'CONFLICT'
        : err.status === 401
          ? 'UNAUTHORIZED'
          : err.status === 403
            ? 'FORBIDDEN'
            : err.status === 429
              ? 'RATE_LIMITED'
              : err.status === 504
                ? 'REQUEST_TIMEOUT'
                : err.status === 503
                  ? 'SERVICE_UNAVAILABLE'
                  : 'VALIDATION_ERROR')
    logger?.logError(code, err.status, err.message)
    return fail(err.message, err.status, code, undefined, headers)
  }

  const classified = classifyUnexpectedError(error)
  const requestId = logger?.requestId ?? `nr-${crypto.randomUUID().slice(0, 8)}`
  const routeTag = context?.route ?? logger?.route ?? 'api'

  logger?.logError(classified.category, classified.status, classified.summary, {
    dbCode: classified.dbCode,
  })
  if (!logger) {
    console.error(
      `[NORI ${classified.category}][${routeTag}][${requestId}] code=${classified.dbCode || 'none'} msg=${classified.summary}`,
    )
  }
  return fail(
    classified.userMessage,
    classified.status,
    classified.code,
    undefined,
    headers ?? { 'X-NORI-Request-Id': requestId },
  )
}
