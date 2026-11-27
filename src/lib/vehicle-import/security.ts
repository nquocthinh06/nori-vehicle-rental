import dns from 'node:dns/promises'
import net from 'node:net'

export const MAX_HTML_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
export const MAX_IMAGE_DIMENSION_PX = 12_000
export const MAX_REDIRECT_HOPS = 3

/**
 * Official Vietnam manufacturer & authorized brand domains allowed for automated import.
 * Additional trusted domains may be added via `NORI_IMPORT_ALLOWED_DOMAINS` (comma-separated).
 */
export const OFFICIAL_MANUFACTURER_DOMAINS: readonly string[] = [
  'toyota.com.vn',
  'honda.com.vn',
  'ford.com.vn',
  'mitsubishi-motors.com.vn',
  'mazdamotors.vn',
  'hyundai.thanhcong.vn',
  'mercedes-benz.com.vn',
  'vinfastauto.com',
  'yamaha-motor.com.vn',
  'kawasakivietnam.vn',
  // Official global / regional manufacturer media CDN domains
  'toyota-global.com',
  'global.honda',
  'media.ford.com',
  'assets.mercedes-benz.com',
  'media.mercedes-benz.com',
  'static.vinfastauto.com',
  'cdn.vinfastauto.com',
  'storage.vinfastauto.com',
  'images.unsplash.com',
]

export type DnsLookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>

export class ImportSecurityError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code = 'SSRF_BLOCKED', status = 400) {
    super(message)
    this.name = 'ImportSecurityError'
    this.code = code
    this.status = status
  }
}

export function getAllowedImportDomains(): string[] {
  const extra = (process.env.NORI_IMPORT_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^\.+/, ''))
    .filter((d) => d && d !== '*' && !d.includes('*') && d.includes('.'))
  return [...new Set([...OFFICIAL_MANUFACTURER_DOMAINS, ...extra])]
}

export function isHostInAllowlist(hostname: string, allowlist: readonly string[]): boolean {
  const norm = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!norm) return false
  return allowlist.some((domain) => norm === domain || norm.endsWith(`.${domain}`))
}

function parseIpv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let out = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n < 0 || n > 255) return null
    out = (out << 8) | n
  }
  return out >>> 0
}

function inIpv4Cidr(ipInt: number, networkStr: string, prefixLen: number): boolean {
  const netInt = parseIpv4ToInt(networkStr)
  if (netInt === null) return false
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0
  return (ipInt & mask) === (netInt & mask)
}

function expandIpv6Hextets(ip: string): number[] | null {
  const zoneIdx = ip.indexOf('%')
  const clean = (zoneIdx !== -1 ? ip.slice(0, zoneIdx) : ip).toLowerCase()
  const halves = clean.split('::')
  if (halves.length > 2) return null

  const parsePart = (part: string): number[] | null => {
    if (!part) return []
    const tokens = part.split(':')
    const out: number[] = []
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i]
      if (tok.includes('.')) {
        if (i !== tokens.length - 1) return null
        const v4 = parseIpv4ToInt(tok)
        if (v4 === null) return null
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff)
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(tok)) return null
        out.push(Number.parseInt(tok, 16))
      }
    }
    return out
  }

  const left = parsePart(halves[0] ?? '')
  if (!left) return null
  if (halves.length === 1) {
    return left.length === 8 ? left : null
  }
  const right = parsePart(halves[1] ?? '')
  if (!right) return null
  const missing = 8 - (left.length + right.length)
  if (missing < 1) return null
  return [...left, ...new Array<number>(missing).fill(0), ...right]
}

export function isBlockedIpAddress(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase()
  if (!ip) return true
  const ipType = net.isIP(ip)
  if (ipType === 4) {
    const num = parseIpv4ToInt(ip)
    if (num === null) return true
    return (
      inIpv4Cidr(num, '0.0.0.0', 8) || // Current network
      inIpv4Cidr(num, '10.0.0.0', 8) || // RFC1918
      inIpv4Cidr(num, '100.64.0.0', 10) || // CGNAT RFC6598
      inIpv4Cidr(num, '127.0.0.0', 8) || // Loopback
      inIpv4Cidr(num, '169.254.0.0', 16) || // Link-local & AWS/GCP/Azure metadata
      inIpv4Cidr(num, '172.16.0.0', 12) || // RFC1918
      inIpv4Cidr(num, '192.0.0.0', 24) || // IETF protocol assignments
      inIpv4Cidr(num, '192.0.2.0', 24) || // TEST-NET-1
      inIpv4Cidr(num, '192.168.0.0', 16) || // RFC1918
      inIpv4Cidr(num, '198.18.0.0', 15) || // Benchmarking
      inIpv4Cidr(num, '198.51.100.0', 24) || // TEST-NET-2
      inIpv4Cidr(num, '203.0.113.0', 24) || // TEST-NET-3
      inIpv4Cidr(num, '224.0.0.0', 4) || // Multicast
      inIpv4Cidr(num, '240.0.0.0', 4) // Reserved / broadcast
    )
  }
  if (ipType === 6) {
    const hextets = expandIpv6Hextets(ip)
    if (!hextets) return true
    const allZero = hextets.every((h) => h === 0)
    const isLoopback = hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1
    if (allZero || isLoopback) return true
    // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
    const isV4Mapped =
      hextets.slice(0, 5).every((h) => h === 0) && (hextets[5] === 0xffff || hextets[5] === 0)
    if (isV4Mapped) {
      const v4 = ((hextets[6] << 16) | hextets[7]) >>> 0
      const v4Str = `${(v4 >>> 24) & 255}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`
      return isBlockedIpAddress(v4Str)
    }
    const first = hextets[0]
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 Unique local address
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 Link-local
    if ((first & 0xff00) === 0xff00) return true // ff00::/8 Multicast
    // NAT64 well-known prefix 64:ff9b::/96
    if (first === 0x0064 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((h) => h === 0)) {
      const v4 = ((hextets[6] << 16) | hextets[7]) >>> 0
      const v4Str = `${(v4 >>> 24) & 255}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`
      return isBlockedIpAddress(v4Str)
    }
    return false
  }
  return true
}

export async function validateImportUrl(
  rawUrl: string,
  options?: {
    requireAllowlist?: boolean
    extraAllowedDomains?: string[]
    dnsLookup?: DnsLookupFn
    skipDnsCheck?: boolean
  },
): Promise<URL> {
  const trimmed = (rawUrl ?? '').trim()
  if (!trimmed || trimmed.length > 1000) {
    throw new ImportSecurityError('URL không hợp lệ hoặc vượt quá độ dài cho phép.', 'INVALID_URL')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ImportSecurityError('Định dạng URL không hợp lệ.', 'INVALID_URL')
  }

  if (parsed.protocol !== 'https:') {
    throw new ImportSecurityError(
      'Chỉ chấp nhận giao thức HTTPS chính thức từ website hãng xe.',
      'HTTPS_REQUIRED',
    )
  }
  if (parsed.username || parsed.password) {
    throw new ImportSecurityError(
      'URL không được phép chứa thông tin xác thực nhúng.',
      'URL_CREDENTIALS_FORBIDDEN',
    )
  }
  if (parsed.port && parsed.port !== '443') {
    throw new ImportSecurityError(
      'Chỉ cho phép kết nối qua cổng HTTPS chuẩn (443).',
      'PORT_FORBIDDEN',
    )
  }

  const host = parsed.hostname.trim().toLowerCase().replace(/\.$/, '')
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host === 'metadata.google.internal'
  ) {
    throw new ImportSecurityError(
      'Không cho phép truy cập địa chỉ nội bộ hoặc localhost (SSRF guard).',
      'SSRF_LOCAL_HOST',
    )
  }

  if (net.isIP(host) !== 0) {
    throw new ImportSecurityError(
      'Không cho phép nhập trực tiếp địa chỉ IP; vui lòng dùng tên miền chính thức của hãng xe.',
      'IP_LITERAL_FORBIDDEN',
    )
  }

  const requireAllowlist = options?.requireAllowlist !== false
  if (requireAllowlist) {
    const allowlist = [
      ...getAllowedImportDomains(),
      ...(options?.extraAllowedDomains ?? []).map((d) => d.trim().toLowerCase()),
    ]
    if (!isHostInAllowlist(host, allowlist)) {
      throw new ImportSecurityError(
        `Tên miền "${host}" không nằm trong danh sách tên miền chính thức của nhà sản xuất được phép nhập.`,
        'DOMAIN_NOT_ALLOWLISTED',
      )
    }
  }

  if (!options?.skipDnsCheck) {
    const lookup: DnsLookupFn = options?.dnsLookup ?? ((h, opts) => dns.lookup(h, opts))
    let records: Array<{ address: string; family: number }>
    try {
      records = await lookup(host, { all: true })
    } catch {
      throw new ImportSecurityError(
        `Không thể phân giải DNS cho tên miền "${host}".`,
        'DNS_RESOLUTION_FAILED',
      )
    }
    if (!records || records.length === 0) {
      throw new ImportSecurityError(`Tên miền "${host}" không có bản ghi IP hợp lệ.`, 'DNS_EMPTY')
    }
    for (const rec of records) {
      if (isBlockedIpAddress(rec.address)) {
        throw new ImportSecurityError(
          `Chặn kết nối tới IP nội bộ/riêng tư (${rec.address}) cho tên miền "${host}".`,
          'SSRF_PRIVATE_IP',
        )
      }
    }
  }

  return parsed
}

export type VerifiedImageFormat = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'
  ext: 'jpg' | 'png' | 'webp' | 'avif'
}

export function detectImageMagicBytes(buf: Buffer): VerifiedImageFormat | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      return { mime: 'image/avif', ext: 'avif' }
    }
  }
  return null
}

export function detectPdfMagicBytes(buf: Buffer): boolean {
  if (buf.length < 5) return false
  return buf.subarray(0, 5).toString('ascii') === '%PDF-'
}

export function containsSuspiciousBinaryPayload(buf: Buffer): boolean {
  const sample = Buffer.concat([
    buf.subarray(0, Math.min(2048, buf.length)),
    buf.subarray(Math.max(0, buf.length - 2048)),
  ]).toString('latin1')
  return /<\?php|<script\b|<!doctype\s+html|<svg\b/i.test(sample)
}

export function sanitizeImportFilename(rawName: string, verifiedExt: string, index = 0): string {
  const baseOnly = rawName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const safeStem = baseOnly || 'nori-catalogue'
  return `${safeStem}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}.${verifiedExt}`
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num)
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi,
      (match) => HTML_ENTITY_MAP[match.toLowerCase()] ?? match,
    )
}

export function stripHtmlAndXss(raw: unknown, maxLength = 3000): string {
  if (typeof raw !== 'string') return ''
  const withoutScripts = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  const decoded = decodeHtmlEntities(withoutScripts)
  const withoutTags = decoded
    .replace(/<[^>]+>/g, ' ')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '')
  return withoutTags.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
