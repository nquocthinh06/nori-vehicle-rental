export const CUSTOMER_COOKIE_NAME = 'app-session'
export const ADMIN_COOKIE_NAME = 'payload-token'

export type SessionCarrier = {
  _sid?: string
  sessions?: Array<{ id?: string; expiresAt?: string | null }> | null
}

/**
 * Verifies an authenticated Payload document's `_sid` claim still exists in its active `sessions` array.
 * Allows immediate session revocation across logout and password rotation.
 */
export function hasActiveSessionRecord(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const carrier = user as SessionCarrier
  if (!carrier._sid || !Array.isArray(carrier.sessions)) return true
  const matched = carrier.sessions.find((s) => s && s.id === carrier._sid)
  if (!matched) return false
  if (matched.expiresAt) {
    const expMs = new Date(matched.expiresAt).getTime()
    if (Number.isFinite(expMs) && expMs <= Date.now()) return false
  }
  return true
}

/** 7 days for customer rental research, booking, PWA reopen & next-day approval follow-up */
export const CUSTOMER_SESSION_MAX_AGE = 60 * 60 * 24 * 7

/** 24 hours for privileged administrator sessions */
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24

export type SessionCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: 'lax' | 'none'
  path: '/'
  maxAge: number
}

/**
 * Derives cookie security attributes from the ACTUAL incoming HTTP/HTTPS request
 * rather than assuming `NEXT_PUBLIC_SITE_URL` matches the live origin.
 *
 * - Plain HTTP (`http://localhost`, `http://127.0.0.1`, `http://192.168.x.x`):
 *   `secure: false, sameSite: 'lax'` even when `NEXT_PUBLIC_SITE_URL` is `https://...`.
 * - HTTPS direct or behind TLS reverse proxy (`X-Forwarded-Proto: https`):
 *   `secure: true, sameSite: 'lax'` (or `'none'` only inside cross-origin Figma Make preview).
 */
export function resolveRequestCookieConfig(input: {
  requestUrl?: string | null
  forwardedProto?: string | null
  originHeader?: string | null
  refererHeader?: string | null
  figmaPublicUrl?: string | null
  maxAge: number
}): SessionCookieOptions {
  const firstForwardedProto = input.forwardedProto?.split(',')[0]?.trim().toLowerCase()

  let isHttps = false
  if (firstForwardedProto === 'https') {
    isHttps = true
  } else if (firstForwardedProto === 'http') {
    isHttps = false
  } else if (input.requestUrl) {
    try {
      isHttps = new URL(input.requestUrl).protocol === 'https:'
    } catch {
      isHttps = false
    }
  } else {
    const candidate = input.originHeader || input.refererHeader || ''
    if (candidate) {
      try {
        isHttps = new URL(candidate).protocol === 'https:'
      } catch {
        isHttps = false
      }
    }
  }

  const isCrossOriginPreview = isHttps && Boolean(input.figmaPublicUrl?.trim())

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isCrossOriginPreview ? 'none' : 'lax',
    path: '/',
    maxAge: input.maxAge,
  }
}
