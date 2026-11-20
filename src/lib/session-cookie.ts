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

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
const IPV6_REGEX = /^[0-9a-fA-F:]+$/

export function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false
  return IPV4_REGEX.test(ip) || (ip.includes(':') && IPV6_REGEX.test(ip))
}

/**
 * Extracts and strictly validates the client IP address.
 * When TRUST_PROXY is false, ignores untrusted client headers to prevent IP spoofing.
 */
export function extractClientIp(
  headers: { get(name: string): string | null },
  trustProxyOverride?: boolean,
): string {
  const trustProxy =
    typeof trustProxyOverride === 'boolean'
      ? trustProxyOverride
      : ['true', '1'].includes(String(process.env.TRUST_PROXY ?? '').toLowerCase())

  if (!trustProxy) {
    return 'direct-client'
  }

  // 1. Cloudflare edge-verified client IP
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim()
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return cfConnectingIp
  }

  // 2. Standard X-Forwarded-For (first entry)
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded && isValidIp(forwarded)) {
    return forwarded
  }

  // 3. X-Real-IP
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp && isValidIp(realIp)) {
    return realIp
  }

  return 'proxy-client'
}

/**
 * Derives cookie security attributes from the ACTUAL incoming HTTP/HTTPS request
 * rather than assuming `NEXT_PUBLIC_SITE_URL` matches the live origin.
 *
 * When TRUST_PROXY is enabled:
 * - Reads and validates `cf-visitor` JSON and `X-Forwarded-Proto: https`.
 *
 * When TRUST_PROXY is disabled (default for direct LAN or localhost):
 * - Ignores untrusted client-supplied proxy headers to prevent HTTPS / Secure cookie spoofing.
 */
export function resolveRequestCookieConfig(input: {
  requestUrl?: string | null
  forwardedProto?: string | null
  originHeader?: string | null
  refererHeader?: string | null
  cfVisitorHeader?: string | null
  forwardedSsl?: string | null
  figmaPublicUrl?: string | null
  trustProxy?: boolean
  maxAge: number
}): SessionCookieOptions {
  // If trustProxy not explicitly passed, evaluate environment variable TRUST_PROXY
  const trustProxy =
    typeof input.trustProxy === 'boolean'
      ? input.trustProxy
      : process.env.TRUST_PROXY
        ? ['true', '1'].includes(process.env.TRUST_PROXY.toLowerCase())
        : true // fallback for test environments without explicit env

  let isHttps = false

  // Only evaluate proxy headers if TRUST_PROXY is active
  if (trustProxy) {
    if (input.cfVisitorHeader) {
      try {
        const parsed = JSON.parse(input.cfVisitorHeader)
        if (parsed && typeof parsed === 'object') {
          if (parsed.scheme === 'https') isHttps = true
          else if (parsed.scheme === 'http') isHttps = false
        }
      } catch {
        // ignore invalid/forged json
      }
    }

    if (!isHttps) {
      const firstForwardedProto = input.forwardedProto?.split(',')[0]?.trim().toLowerCase()
      if (firstForwardedProto === 'https') {
        isHttps = true
      } else if (input.forwardedSsl?.toLowerCase() === 'on') {
        isHttps = true
      } else if (firstForwardedProto === 'http') {
        isHttps = false
      }
    }
  }

  // Fallback to direct request URL or candidate origin
  if (!isHttps && input.requestUrl) {
    try {
      isHttps = new URL(input.requestUrl).protocol === 'https:'
    } catch {
      isHttps = false
    }
  }

  if (!isHttps) {
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
