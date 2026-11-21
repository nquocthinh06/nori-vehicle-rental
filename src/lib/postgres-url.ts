export interface PostgresPoolConfig {
  connectionString: string
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const WEAK_OR_ALIAS_SSL_MODES = new Set(['prefer', 'require', 'verify-ca'])

/**
 * Normalizes a PostgreSQL connection string so pg-connection-string uses explicit
 * `sslmode=verify-full` instead of deprecated alias modes (`prefer`, `require`, `verify-ca`)
 * unless the caller explicitly opted into `uselibpqcompat=true`.
 */
export function normalizePostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    return trimmed
  }

  const useLibpqCompat = parsed.searchParams.get('uselibpqcompat')?.toLowerCase() === 'true'
  if (useLibpqCompat) {
    return parsed.toString()
  }

  const rawSslMode = parsed.searchParams.get('sslmode')
  const normalizedSslMode = rawSslMode?.trim().toLowerCase()
  const isLocalHost = LOCAL_HOSTS.has(parsed.hostname.toLowerCase())

  if (normalizedSslMode && WEAK_OR_ALIAS_SSL_MODES.has(normalizedSslMode)) {
    parsed.searchParams.set('sslmode', 'verify-full')
  } else if (!normalizedSslMode && !isLocalHost) {
    parsed.searchParams.set('sslmode', 'verify-full')
  }

  return parsed.toString()
}

/**
 * Builds a pg.Pool configuration with strict TLS verification (via normalized sslmode)
 * and bounded pool / timeout settings suitable for serverless and long-lived runtimes.
 */
export function createPostgresPoolConfig(rawUrl: string): PostgresPoolConfig {
  const maxRaw = Number(process.env.NORI_PG_POOL_MAX ?? '10')
  const max = Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= 50 ? Math.round(maxRaw) : 10
  return {
    connectionString: normalizePostgresUrl(rawUrl),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }
}
