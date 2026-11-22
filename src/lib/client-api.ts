'use client'

import type { PublicLocationsPayload } from './domain-types'

export const AUTH_INVALIDATED_EVENT = 'nori:auth-invalidated'

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
    public code: string = '',
    public requestId: string = '',
  ) {
    super(message)
  }
}

const NON_SESSION_401_PATHS = ['/auth/login', '/auth/register', '/auth/password']

function shouldInvalidateSessionOn401(path: string): boolean {
  return !NON_SESSION_401_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}?`))
}

const DEFAULT_API_TIMEOUT_MS = 15_000
const TRANSIENT_STATUSES = new Set([0, 408, 502, 503, 504])
const TRANSIENT_CODES = new Set([
  'REQUEST_TIMEOUT',
  'DATABASE_TIMEOUT',
  'DATABASE_UNAVAILABLE',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
])

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
}

export type RetryOptions = ApiRequestOptions & {
  retries?: number
  retryDelayMs?: number
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
  if (status === 504) return 'Hệ thống phản hồi chậm vượt thời gian chờ. Vui lòng thử lại.'
  if (status >= 500) return 'Hệ thống tạm thời chưa thể xử lý yêu cầu. Vui lòng thử lại sau.'
  return 'Chưa thể xử lý yêu cầu. Vui lòng thử lại.'
}

export async function api<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const {
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: callerSignal,
    cache = 'no-store',
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
      cache,
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

  const reqId = response.headers.get('x-nori-request-id') ?? ''

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
      reqId,
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
      reqId,
    )
  }

  return result.data as T
}

function waitAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function isTransientRequestError(err: unknown): boolean {
  if (!(err instanceof RequestError)) return false
  return TRANSIENT_STATUSES.has(err.status) || TRANSIENT_CODES.has(err.code)
}

/**
 * Performs an idempotent GET request with bounded exponential backoff + jitter
 * ONLY on transient network/timeout/502-504 failures. Never retries business 4xx errors.
 */
export async function getWithRetry<T>(path: string, options?: RetryOptions): Promise<T> {
  const { retries = 2, retryDelayMs = 280, ...apiOpts } = options ?? {}
  const maxRetries = Math.max(0, Math.min(3, Math.trunc(retries)))
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await api<T>(path, { ...apiOpts, method: 'GET' })
    } catch (err) {
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        apiOpts.signal?.aborted ||
        !isTransientRequestError(err) ||
        attempt === maxRetries
      ) {
        throw err
      }
      lastError = err
      const backoff = retryDelayMs * 2 ** attempt + Math.floor(Math.random() * 140)
      await waitAbortable(backoff, apiOpts.signal ?? undefined)
    }
  }
  throw lastError
}

export function formatApiErrorDetail(
  err: unknown,
  fallback: string,
): {
  category: 'timeout' | 'db' | 'unavailable' | 'validation' | 'system'
  retryable: boolean
  message: string
} {
  if (err instanceof RequestError) {
    const suffix = err.requestId ? ` (Mã tra cứu: ${err.requestId})` : ''
    if (
      err.status === 408 ||
      err.status === 504 ||
      err.code === 'REQUEST_TIMEOUT' ||
      err.code === 'DATABASE_TIMEOUT'
    ) {
      return {
        category: 'timeout',
        retryable: true,
        message: `${err.message || 'Yêu cầu lấy báo giá quá thời gian chờ.'}${suffix}`,
      }
    }
    if (
      err.status === 0 ||
      err.status === 502 ||
      err.status === 503 ||
      err.code === 'NETWORK_ERROR' ||
      err.code === 'DATABASE_UNAVAILABLE' ||
      err.code === 'DATABASE_ERROR' ||
      err.code === 'SERVICE_UNAVAILABLE'
    ) {
      return {
        category: 'db',
        retryable: true,
        message: `${err.message || 'Kết nối hệ thống báo giá tạm thời gián đoạn.'}${suffix}`,
      }
    }
    if (err.status === 409) {
      return {
        category: 'unavailable',
        retryable: false,
        message: err.message,
      }
    }
    if (err.status >= 400 && err.status < 500) {
      return {
        category: 'validation',
        retryable: false,
        message: err.message,
      }
    }
    return {
      category: 'system',
      retryable: true,
      message: `${err.message || fallback}${suffix}`,
    }
  }
  return {
    category: 'system',
    retryable: true,
    message: err instanceof Error && err.message ? err.message : fallback,
  }
}

let cachedLocations: { data: PublicLocationsPayload; expiresAt: number } | null = null
let locationsInFlight: Promise<PublicLocationsPayload> | null = null

export async function getSharedPublicLocations(): Promise<PublicLocationsPayload> {
  const now = Date.now()
  if (cachedLocations && cachedLocations.expiresAt > now) {
    return cachedLocations.data
  }
  if (locationsInFlight) {
    return locationsInFlight
  }
  const task = getWithRetry<PublicLocationsPayload>('/locations', {
    cache: 'default',
    retries: 1,
    timeoutMs: 10_000,
  })
    .then((data) => {
      cachedLocations = { data, expiresAt: Date.now() + 120_000 }
      return data
    })
    .finally(() => {
      if (locationsInFlight === task) {
        locationsInFlight = null
      }
    })
  locationsInFlight = task
  return task
}
