'use client'

export const AUTH_INVALIDATED_EVENT = 'nori:auth-invalidated'

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
    public code: string = '',
  ) {
    super(message)
  }
}

const NON_SESSION_401_PATHS = ['/auth/login', '/auth/register', '/auth/password']

function shouldInvalidateSessionOn401(path: string): boolean {
  return !NON_SESSION_401_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}?`))
}

const DEFAULT_API_TIMEOUT_MS = 15_000

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
}

function defaultMessageForStatus(status: number): string {
  if (status === 400) return 'Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.'
  if (status === 401) return 'Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Tài khoản hiện tại không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Không tìm thấy thông tin được yêu cầu.'
  if (status === 408) return 'Yêu cầu quá thời gian chờ phản hồi. Vui lòng thử lại.'
  if (status === 409) return 'Dữ liệu vừa thay đổi hoặc xung đột. Vui lòng kiểm tra lại.'
  if (status === 422) return 'Thông tin chưa đáp ứng điều kiện nghiệp vụ. Vui lòng kiểm tra lại.'
  if (status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.'
  if (status >= 500) return 'Hệ thống tạm thời chưa thể xử lý yêu cầu. Vui lòng thử lại sau.'
  return 'Chưa thể xử lý yêu cầu. Vui lòng thử lại.'
}

export async function api<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: callerSignal,
    ...fetchOptions
  } = options ?? {}
  const controller = new AbortController()
  let timedOut = false

  const onCallerAbort = () => controller.abort(callerSignal?.reason)
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason)
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
  }

  const timer =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : null

  let response: Response
  try {
    response = await fetch(`/nori-api${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
    })
  } catch (err) {
    if (timedOut && !callerSignal?.aborted) {
      throw new RequestError(
        'Yêu cầu quá thời gian chờ phản hồi. Vui lòng kiểm tra kết nối và thử lại.',
        408,
        {},
        'REQUEST_TIMEOUT',
      )
    }
    if (callerSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err
    }
    throw new RequestError(
      'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.',
      0,
      {},
      'NETWORK_ERROR',
    )
  } finally {
    if (timer) clearTimeout(timer)
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
  }

  let result: {
    success?: boolean
    data?: unknown
    error?: { message?: string; code?: string; fields?: Record<string, string> }
  }
  try {
    result = await response.json()
  } catch {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      shouldInvalidateSessionOn401(path)
    ) {
      window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { path } }))
    }
    throw new RequestError(
      'Phản hồi chưa hợp lệ. Vui lòng thử lại sau.',
      response.status,
      {},
      'INVALID_RESPONSE',
    )
  }

  if (!response.ok || !result.success) {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      shouldInvalidateSessionOn401(path)
    ) {
      window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { path } }))
    }
    throw new RequestError(
      result.error?.message ?? defaultMessageForStatus(response.status),
      response.status,
      result.error?.fields ?? {},
      result.error?.code ?? '',
    )
  }

  return result.data as T
}
