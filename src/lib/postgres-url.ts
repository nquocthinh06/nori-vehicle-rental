export interface PostgresPoolConfig {
  connectionString: string
  max: number
  idleTimeoutMillis: number
  connectionTimeoutMillis: number
  statement_timeout: number
  query_timeout: number
  allowExitOnIdle: boolean
  application_name: string
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
 * and bounded pool / query / connection timeouts suitable for Vercel serverless functions
 * connecting to Neon Pooler and long-lived Node servers.
 */
export function createPostgresPoolConfig(rawUrl: string): PostgresPoolConfig {
  const isServerless =
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV?.trim()) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  const defaultMax = isServerless ? 5 : 10
  const maxRaw = Number(process.env.NORI_PG_POOL_MAX ?? String(defaultMax))
  const max =
    Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= 50 ? Math.round(maxRaw) : defaultMax
  const stmtTimeoutRaw = Number(process.env.NORI_PG_STATEMENT_TIMEOUT_MS ?? '8000')
  const statement_timeout =
    Number.isFinite(stmtTimeoutRaw) && stmtTimeoutRaw >= 1000 && stmtTimeoutRaw <= 60_000
      ? Math.round(stmtTimeoutRaw)
      : 8000
  return {
    connectionString: normalizePostgresUrl(rawUrl),
    max,
    idleTimeoutMillis: isServerless ? 15_000 : 30_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout,
    query_timeout: statement_timeout + 1_000,
    allowExitOnIdle: isServerless,
    application_name: 'nori-rental',
  }
}
