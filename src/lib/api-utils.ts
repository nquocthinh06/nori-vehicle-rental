import 'server-only'
import { APIError } from 'payload'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie',
}

export function json(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status, headers: NO_STORE_HEADERS })
}

export function fail(
  message: string,
  status = 400,
  code = 'VALIDATION_ERROR',
  fields?: Record<string, string>,
) {
  return Response.json(
    { success: false, error: { message, code, fields } },
    { status, headers: NO_STORE_HEADERS },
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
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip')?.trim() || 'local'
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
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.FIGMA_PUBLIC_URL,
    request.url,
  ]) {
    if (!value) continue
    try {
      allowed.add(new URL(value).origin)
    } catch {
      // ignore malformed env URL
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
  if (!allowed.has(candidateOrigin)) throw new APIError('Nguồn yêu cầu không hợp lệ.', 403)
}

export function apiError(error: unknown) {
  const isApiError =
    error instanceof APIError ||
    (typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number')
  if (isApiError) {
    const err = error as { status: number; message: string; data?: { code?: string } | null }
    if (err.status === 404)
      return fail('Không tìm thấy thông tin được yêu cầu.', 404, 'RESOURCE_NOT_FOUND')
    if (err.status >= 500 && err.status !== 503)
      return fail('NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.', 503, 'SERVICE_UNAVAILABLE')
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
              : 'VALIDATION_ERROR')
    return fail(err.message, err.status, code)
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  const isDbError =
    errorMessage.includes('SQLITE_ERROR') ||
    errorMessage.includes('LibsqlError') ||
    errorMessage.includes('no such column') ||
    errorMessage.includes('no such table')

  const requestId = Math.random().toString(36).slice(2, 10)
  if (isDbError) {
    // Distinguish database schema/query errors without leaking raw SQL or schema internals to client
    const isColumnMissing = errorMessage.includes('no such column')
    const isTableMissing = errorMessage.includes('no such table')
    const summary = isColumnMissing
      ? 'Cơ sở dữ liệu đang thiếu cột dữ liệu nghiệp vụ (cần chạy migration).'
      : isTableMissing
        ? 'Cơ sở dữ liệu chưa hoàn thiện bảng nghiệp vụ (cần chạy migration).'
        : 'Lỗi truy vấn cơ sở dữ liệu.'
    console.error(`[NORI DB ERROR][req-${requestId}] ${summary}: ${errorMessage.slice(0, 300)}`)
    return fail(
      'Hệ thống đang bảo trì dữ liệu hoặc cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.',
      503,
      'DATABASE_ERROR',
    )
  }

  console.error(`[NORI][req-${requestId}] Request failed:`, errorMessage.slice(0, 300))
  return fail('NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.', 503, 'SERVICE_UNAVAILABLE')
}
