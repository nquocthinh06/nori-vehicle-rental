import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  validateEnvironment,
  resolveStoragePath,
  toSqliteUri,
  resolveSqlitePath,
  resolveMediaDir,
  parseAllowedOrigins,
} from '../src/lib/env.ts'
import {
  resolveRequestCookieConfig,
  extractClientIp,
  isValidIp,
} from '../src/lib/session-cookie.ts'

test('ENV-01: validateEnvironment passes for valid development and test configurations', () => {
  const original = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'development'
    const res = validateEnvironment()
    assert.equal(res.ok, true)
    assert.equal(res.config.nodeEnv, 'development')
    assert.equal(typeof res.config.databaseUri, 'string')
    assert.equal(res.config.databaseUri.startsWith('file:'), true)
  } finally {
    process.env.NODE_ENV = original
  }
})

test('ENV-02: validateEnvironment enforces 32+ character non-placeholder PAYLOAD_SECRET in production', () => {
  const origEnv = process.env.NODE_ENV
  const origSecret = process.env.PAYLOAD_SECRET
  try {
    process.env.NODE_ENV = 'production'
    process.env.PAYLOAD_SECRET = 'short-secret'
    const shortRes = validateEnvironment()
    assert.equal(shortRes.ok, false)
    assert.equal(shortRes.errors.some((e) => e.includes('quá ngắn')), true)

    process.env.PAYLOAD_SECRET = 'your-secure-random-payload-secret-at-least-32-chars-long'
    const placeholderRes = validateEnvironment()
    assert.equal(placeholderRes.ok, false)
    assert.equal(placeholderRes.errors.some((e) => e.includes('giá trị mặc định/placeholder')), true)

    process.env.PAYLOAD_SECRET = 'a'.repeat(32)
    const validRes = validateEnvironment()
    assert.equal(validRes.ok, true)
  } finally {
    process.env.NODE_ENV = origEnv
    process.env.PAYLOAD_SECRET = origSecret
  }
})

test('ENV-03: validateEnvironment flags sensitive secrets leaked into NEXT_PUBLIC_*', () => {
  process.env.NEXT_PUBLIC_ADMIN_SECRET = 'forbidden-leak'
  try {
    const res = validateEnvironment()
    assert.equal(res.ok, false)
    assert.equal(res.errors.some((e) => e.includes('NEXT_PUBLIC_ADMIN_SECRET')), true)
  } finally {
    delete process.env.NEXT_PUBLIC_ADMIN_SECRET
  }
})

test('ENV-04: Path resolution and SQLite URI formatting are cross-platform safe', () => {
  const relUri = toSqliteUri('./data/nori.db')
  assert.equal(relUri, 'file:data/nori.db')

  const absPath = path.resolve('data', 'nori.db')
  const absUri = toSqliteUri(absPath)
  assert.equal(absUri.startsWith('file:'), true)
  assert.equal(absUri.includes('\\'), false) // No unescaped Windows backslashes in SQLite URI

  const storagePath = resolveStoragePath('./custom-data')
  assert.equal(path.isAbsolute(storagePath), true)
})

test('ENV-05: parseAllowedOrigins parses ALLOWED_ORIGINS, APP_URL, and NEXT_PUBLIC_SITE_URL', () => {
  const origAllowed = process.env.ALLOWED_ORIGINS
  const origApp = process.env.APP_URL
  try {
    process.env.ALLOWED_ORIGINS = 'https://nori.vn,https://car.nori.vn,http://192.168.1.100:3000'
    process.env.APP_URL = 'https://nori.vn'
    const origins = parseAllowedOrigins()
    assert.equal(origins.includes('https://nori.vn'), true)
    assert.equal(origins.includes('https://car.nori.vn'), true)
    assert.equal(origins.includes('http://192.168.1.100:3000'), true)
  } finally {
    process.env.ALLOWED_ORIGINS = origAllowed
    process.env.APP_URL = origApp
  }
})

test('TUNNEL-01: resolveRequestCookieConfig detects Cloudflare Tunnel HTTPS via cf-visitor', () => {
  const cookieConfig = resolveRequestCookieConfig({
    cfVisitorHeader: '{"scheme":"https"}',
    forwardedProto: 'http', // edge proxy termination
    requestUrl: 'http://127.0.0.1:3000/nori-api/auth/me',
    maxAge: 86400,
  })
  assert.equal(cookieConfig.secure, true)
  assert.equal(cookieConfig.sameSite, 'lax')
  assert.equal(cookieConfig.httpOnly, true)
  assert.equal(cookieConfig.path, '/')
})

test('TUNNEL-02: resolveRequestCookieConfig detects x-forwarded-ssl: on', () => {
  const cookieConfig = resolveRequestCookieConfig({
    forwardedSsl: 'on',
    requestUrl: 'http://127.0.0.1:3000/nori-api/auth/me',
    maxAge: 86400,
  })
  assert.equal(cookieConfig.secure, true)
  assert.equal(cookieConfig.sameSite, 'lax')
})

test('TUNNEL-03: resolveRequestCookieConfig preserves plain HTTP on local and LAN', () => {
  const cookieConfig = resolveRequestCookieConfig({
    requestUrl: 'http://192.168.1.150:3000/nori-api/auth/me',
    maxAge: 86400,
  })
  assert.equal(cookieConfig.secure, false)
  assert.equal(cookieConfig.sameSite, 'lax')
})

test('TUNNEL-04: resolveRequestCookieConfig sets sameSite none only in cross-origin preview over HTTPS', () => {
  const previewHttps = resolveRequestCookieConfig({
    figmaPublicUrl: 'https://preview.figma.com/sandbox',
    forwardedProto: 'https',
    maxAge: 3600,
  })
  assert.equal(previewHttps.secure, true)
  assert.equal(previewHttps.sameSite, 'none')

  const previewHttp = resolveRequestCookieConfig({
    figmaPublicUrl: 'https://preview.figma.com/sandbox',
    forwardedProto: 'http',
    maxAge: 3600,
  })
  assert.equal(previewHttp.secure, false)
  assert.equal(previewHttp.sameSite, 'lax')
})

test('TUNNEL-05: resolveRequestCookieConfig ignores spoofed proxy headers when trustProxy is false', () => {
  const cookieConfig = resolveRequestCookieConfig({
    trustProxy: false,
    cfVisitorHeader: '{"scheme":"https"}',
    forwardedProto: 'https',
    forwardedSsl: 'on',
    requestUrl: 'http://192.168.1.100:3000/nori-api/auth/me',
    maxAge: 86400,
  })
  // Plain HTTP URL must remain secure: false when proxy headers are not trusted
  assert.equal(cookieConfig.secure, false)
})

test('TUNNEL-06: extractClientIp ignores spoofed client headers when TRUST_PROXY is false', () => {
  const fakeHeaders = new Map([
    ['cf-connecting-ip', '203.0.113.195'],
    ['x-forwarded-for', '198.51.100.1'],
  ])
  const ip = extractClientIp(fakeHeaders, false)
  assert.equal(ip, 'direct-client')
})

test('TUNNEL-07: extractClientIp validates IPv4 and IPv6 format and rejects malformed values', () => {
  assert.equal(isValidIp('192.168.1.1'), true)
  assert.equal(isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), true)
  assert.equal(isValidIp('invalid.ip.string'), false)
  assert.equal(isValidIp('192.168.1.300'), false)
  assert.equal(isValidIp("127.0.0.1'; DROP TABLE users;--"), false)

  const maliciousHeaders = new Map([
    ['cf-connecting-ip', "127.0.0.1'; DROP TABLE users;--"],
    ['x-forwarded-for', 'invalid-ip'],
  ])
  const sanitizedIp = extractClientIp(maliciousHeaders, true)
  assert.equal(sanitizedIp, 'proxy-client')

  const validCfHeaders = new Map([
    ['cf-connecting-ip', '14.161.42.18'],
  ])
  assert.equal(extractClientIp(validCfHeaders, true), '14.161.42.18')
})
