import 'server-only'
import { APIError } from 'payload'

export function json(data: unknown, status = 200) {
  return Response.json(
    { success: true, data },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export function fail(
  message: string,
  status = 400,
  code = 'VALIDATION_ERROR',
  fields?: Record<string, string>,
) {
  return Response.json(
    { success: false, error: { message, code, fields } },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function body(
  request: Request,
  allowlist: string[],
): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.length > 6000) throw new APIError('Nội dung gửi lên quá dài.', 400)
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

export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return
  const allowed = [process.env.NEXT_PUBLIC_SITE_URL, request.url]
    .filter(Boolean)
    .map((value) => new URL(value!).origin)
  const host = request.headers.get('host')
  // Next can build request.url from its bind address behind a proxy.
  // The actual Host supports same-origin local validation without broad wildcards.
  if (host) allowed.push(`${new URL(request.url).protocol}//${host}`)
  if (!allowed.includes(origin)) throw new APIError('Nguồn yêu cầu không hợp lệ.', 403)
}

export function apiError(error: unknown) {
  if (error instanceof APIError) {
    if (error.status === 404)
      return fail('Không tìm thấy thông tin được yêu cầu.', 404, 'RESOURCE_NOT_FOUND')
    if (error.status >= 500 && error.status !== 503)
      return fail('NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.', 503, 'SERVICE_UNAVAILABLE')
    const code =
      error.status === 409
        ? 'CONFLICT'
        : error.status === 401
          ? 'UNAUTHORIZED'
          : error.status === 403
            ? 'FORBIDDEN'
            : 'VALIDATION_ERROR'
    return fail(error.message, error.status, code)
  }
  console.error('[NORI] Request failed:', error instanceof Error ? error.name : 'UnknownError')
  return fail('NORI chưa thể xử lý yêu cầu. Vui lòng thử lại sau.', 503, 'SERVICE_UNAVAILABLE')
}
