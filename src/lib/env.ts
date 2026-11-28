import path from 'node:path'
import fs from 'node:fs'
import { isS3Configured, isValidVercelBlobToken, isVercelBlobConfigured } from './cloud-storage.ts'

export type EnvironmentMode = 'development' | 'production' | 'test'
export type DeploymentTier = 'production' | 'staging' | 'ci' | 'local'

export interface NoriEnvironmentConfig {
  nodeEnv: EnvironmentMode
  deploymentTier: DeploymentTier
  isVercelRuntime: boolean
  isProduction: boolean
  isDevelopment: boolean
  isTest: boolean
  port: number
  host: string
  appUrl: string
  allowedOrigins: string[]
  databaseEngine: 'postgres' | 'sqlite'
  databaseUri: string
  sqlitePath: string
  dataDir: string
  mediaDir: string
  backupDir: string
  logDir: string
  payloadSecret: string
  sessionSecret: string
  adminEmail: string
  disableDemoSeed: boolean
  paymentEnabled: boolean
  paymentProvider: 'SEPAY' | 'MOCK' | 'MANUAL'
  paymentMode: 'MOCK' | 'SANDBOX' | 'PRODUCTION'
  aiEnabled: boolean
  aiProvider: string
  aiModel: string
  aiApiKeyConfigured: boolean
}

function normalizeUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.origin
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

/**
 * Resolves an absolute path across Windows and POSIX operating systems without hardcoding drive letters.
 */
export function resolveStoragePath(targetPath: string, baseDir = process.cwd()): string {
  if (!targetPath) return baseDir
  const trimmed = targetPath.trim()
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed)
  }
  return path.resolve(baseDir, trimmed)
}

/**
 * Converts a filesystem database path to an SQLite URI compatible with @payloadcms/db-sqlite and Drizzle.
 */
export function toSqliteUri(filePath: string): string {
  if (!filePath) return 'file:./nori.db'
  if (
    filePath.startsWith('libsql:') ||
    filePath.startsWith('http:') ||
    filePath.startsWith('https:')
  ) {
    return filePath
  }
  const cleanPath = filePath.startsWith('file:') ? filePath.slice(5) : filePath
  const normalized = path.normalize(cleanPath).replace(/\\/g, '/')
  return `file:${normalized}`
}

/**
 * Resolves the SQLite database file path from available environment variables.
 */
export function resolveSqlitePath(rootDir = process.cwd()): string {
  const explicitPath = process.env.NORI_SQLITE_PATH?.trim()
  if (explicitPath) return resolveStoragePath(explicitPath, rootDir)

  const dbUrl = (process.env.DATABASE_URL || process.env.DATABASE_URI)?.trim()
  if (
    dbUrl &&
    !dbUrl.startsWith('libsql:') &&
    !dbUrl.startsWith('http:') &&
    !dbUrl.startsWith('https:')
  ) {
    const stripped = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl
    return resolveStoragePath(stripped, rootDir)
  }

  const dataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim()
  if (dataDir) {
    return path.join(resolveStoragePath(dataDir, rootDir), 'nori.db')
  }

  return path.resolve(rootDir, 'nori.db')
}

/**
 * Resolves the Media upload directory from available environment variables.
 */
export function resolveMediaDir(rootDir = process.cwd()): string {
  const explicit = process.env.MEDIA_DIR?.trim() || process.env.NORI_MEDIA_DIR?.trim()
  if (explicit) return resolveStoragePath(explicit, rootDir)

  const dataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim()
  if (dataDir) {
    return path.join(resolveStoragePath(dataDir, rootDir), 'media')
  }

  const publicMedia = path.resolve(rootDir, 'public', 'media')
  if (fs.existsSync(publicMedia)) return publicMedia

  const devDataMedia = path.resolve(rootDir, 'dev-data', 'media')
  if (fs.existsSync(devDataMedia)) return devDataMedia

  return path.resolve(rootDir, 'media')
}

/**
 * Resolves the Backups directory from available environment variables.
 */
export function resolveBackupDir(rootDir = process.cwd()): string {
  const explicit = process.env.BACKUP_DIR?.trim() || process.env.NORI_BACKUP_DIR?.trim()
  if (explicit) return resolveStoragePath(explicit, rootDir)

  const dataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim()
  if (dataDir) {
    return path.join(resolveStoragePath(dataDir, rootDir), 'backups')
  }

  return path.resolve(rootDir, 'backups')
}

/**
 * Resolves the Logs directory from available environment variables.
 */
export function resolveLogDir(rootDir = process.cwd()): string {
  const explicit = process.env.LOG_DIR?.trim() || process.env.NORI_LOG_DIR?.trim()
  if (explicit) return resolveStoragePath(explicit, rootDir)

  const dataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim()
  if (dataDir) {
    return path.join(resolveStoragePath(dataDir, rootDir), 'logs')
  }

  return path.resolve(rootDir, 'logs')
}

/**
 * Parses allowed origins from environment (ALLOWED_ORIGINS, APP_URL, NEXT_PUBLIC_SITE_URL, FIGMA_PUBLIC_URL).
 */
export function parseAllowedOrigins(): string[] {
  const origins = new Set<string>()

  const rawList = process.env.ALLOWED_ORIGINS?.split(',') ?? []
  for (const item of rawList) {
    const norm = normalizeUrl(item)
    if (norm) origins.add(norm)
  }

  for (const single of [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.FIGMA_PUBLIC_URL,
    process.env.PAYMENT_PUBLIC_BASE_URL,
  ]) {
    const norm = normalizeUrl(single)
    if (norm) origins.add(norm)
  }

  return Array.from(origins)
}

/**
 * Comprehensive environment validation with structured diagnostic reporting.
 */
export function validateEnvironment(options?: {
  rootDir?: string
  checkStorageWritable?: boolean
}): {
  ok: boolean
  errors: string[]
  warnings: string[]
  config: NoriEnvironmentConfig
} {
  const rootDir = options?.rootDir ?? process.cwd()
  const errors: string[] = []
  const warnings: string[] = []

  const nodeEnv = (process.env.NODE_ENV || 'development') as EnvironmentMode
  const isProduction = nodeEnv === 'production'
  const isDevelopment = nodeEnv === 'development'
  const isTest = nodeEnv === 'test'
  const isVercelRuntime = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV?.trim())
  const explicitAppEnv = (process.env.APP_ENV || process.env.NORI_ENV || '').trim().toLowerCase()
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  const deploymentTier: DeploymentTier =
    vercelEnv === 'production' || explicitAppEnv === 'production'
      ? 'production'
      : vercelEnv === 'preview' || explicitAppEnv === 'staging' || explicitAppEnv === 'preview'
        ? 'staging'
        : process.env.CI === 'true' || isTest
          ? 'ci'
          : 'local'
  const requireStrictSecrets = isProduction || isVercelRuntime || deploymentTier === 'production'

  const port = Number(process.env.PORT || '3000')
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`PORT không hợp lệ: "${process.env.PORT}". Cần cổng số từ 1 đến 65535.`)
  }

  const host = process.env.HOST || process.env.HOSTNAME || '127.0.0.1'

  const rawAppUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  const appUrl =
    normalizeUrl(rawAppUrl) || `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  const payloadSecret = process.env.PAYLOAD_SECRET?.trim() || ''
  const defaultDevSecret = 'nori-local-dev-secret-9b4df14a-91bb-4c9b-b923-b2dfa62da7e4'

  if (requireStrictSecrets) {
    if (!payloadSecret) {
      errors.push(
        'PAYLOAD_SECRET là bắt buộc trong môi trường Production/Vercel. Vui lòng tạo chuỗi ngẫu nhiên từ 32 ký tự trở lên.',
      )
    } else if (payloadSecret.length < 32) {
      errors.push(
        `PAYLOAD_SECRET quá ngắn (${payloadSecret.length} ký tự). Cần tối thiểu 32 ký tự bảo mật.`,
      )
    } else if (
      payloadSecret === defaultDevSecret ||
      payloadSecret.includes('CHANGE_ME') ||
      payloadSecret.includes('your-secure-random')
    ) {
      errors.push(
        'PAYLOAD_SECRET đang dùng giá trị mặc định/placeholder. Phải đổi sang chuỗi ngẫu nhiên an toàn trước khi public.',
      )
    }
  } else if (!payloadSecret) {
    warnings.push(
      'PAYLOAD_SECRET chưa thiết lập; đang dùng giá trị dev mặc định (chỉ phù hợp local development).',
    )
  }

  const explicitSessionSecret = process.env.NORI_SESSION_SECRET?.trim() || ''
  if (
    requireStrictSecrets &&
    explicitSessionSecret &&
    (explicitSessionSecret.length < 32 || explicitSessionSecret === defaultDevSecret)
  ) {
    errors.push('NORI_SESSION_SECRET phải dài tối thiểu 32 ký tự và không dùng giá trị mặc định.')
  }

  // Security check: ensure sensitive secrets are NEVER exposed in NEXT_PUBLIC_*
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      const lower = key.toLowerCase()
      if (
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('api_key') ||
        lower.includes('token')
      ) {
        errors.push(
          `Biến bảo mật "${key}" không được đặt tiền tố NEXT_PUBLIC_ vì sẽ bị lộ ra trình duyệt client.`,
        )
      }
    }
  }

  const rawDbUrl = (process.env.DATABASE_URL || process.env.DATABASE_URI || '').trim()
  const isPostgres = rawDbUrl.startsWith('postgres://') || rawDbUrl.startsWith('postgresql://')
  const requirePostgres =
    isVercelRuntime || deploymentTier === 'production' || process.env.NORI_REQUIRE_POSTGRES === '1'
  if (requirePostgres && !isPostgres) {
    errors.push(
      `Môi trường ${deploymentTier === 'production' ? 'Production' : isVercelRuntime ? 'Vercel' : 'Postgres bắt buộc'} yêu cầu DATABASE_URL trỏ tới PostgreSQL; không cho phép fallback SQLite cục bộ.`,
    )
  }

  let pgHost = ''
  if (isPostgres) {
    try {
      pgHost = new URL(rawDbUrl).hostname.toLowerCase()
    } catch {
      errors.push('DATABASE_URL PostgreSQL không đúng định dạng URL hợp lệ.')
    }
  }

  const prodDbHostHint = (process.env.NORI_PRODUCTION_DB_HOST || '').trim().toLowerCase()
  if (deploymentTier === 'staging' && isPostgres && prodDbHostHint && pgHost === prodDbHostHint) {
    errors.push(
      'Staging DATABASE_URL không được trỏ cùng host database Production (NORI_PRODUCTION_DB_HOST).',
    )
  }

  const sqlitePath = resolveSqlitePath(rootDir)
  const databaseEngine: 'postgres' | 'sqlite' = isPostgres ? 'postgres' : 'sqlite'
  const databaseUri = isPostgres ? `postgres://${pgHost || 'configured'}` : toSqliteUri(sqlitePath)
  const dataDir =
    process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim() || path.dirname(sqlitePath)
  const mediaDir = resolveMediaDir(rootDir)
  const backupDir = resolveBackupDir(rootDir)
  const logDir = resolveLogDir(rootDir)

  // Ensure local filesystem storage directories are writable only on stateful non-Vercel SQLite/disk runtimes
  if (options?.checkStorageWritable && !isVercelRuntime && databaseEngine === 'sqlite') {
    for (const [dirLabel, dirPath] of [
      ['Database Dir', path.dirname(sqlitePath)],
      ['Media Dir', mediaDir],
      ['Backup Dir', backupDir],
      ['Log Dir', logDir],
    ]) {
      try {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true })
        }
        const testFile = path.join(dirPath, `.write-test-${Date.now()}`)
        fs.writeFileSync(testFile, 'ok')
        fs.unlinkSync(testFile)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Thư mục lưu trữ ${dirLabel} ("${dirPath}") không thể ghi: ${msg}`)
      }
    }
  }

  const allowedOrigins = parseAllowedOrigins()
  if (isProduction && allowedOrigins.length === 0) {
    warnings.push(
      'Chưa cấu hình ALLOWED_ORIGINS hoặc APP_URL cho Production. Khuyến nghị thiết lập để tăng cường bảo vệ CSRF/CORS.',
    )
  }

  const nodeMajor = Number(process.versions.node.split('.')[0] || 0)
  if (nodeMajor !== 24) {
    warnings.push(
      `Phiên bản Node.js hiện tại (${process.version}) khác Node.js 24 LTS được ghim trong package.json ("engines.node": ">=24.22.1 <25.0.0").`,
    )
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() || ''
  if (blobToken && !isValidVercelBlobToken(blobToken)) {
    errors.push(
      'BLOB_READ_WRITE_TOKEN không đúng định dạng (cần dạng vercel_blob_rw_<store_id>_<secret>).',
    )
  }
  if (
    (isVercelRuntime || deploymentTier === 'production') &&
    !isVercelBlobConfigured() &&
    !isS3Configured()
  ) {
    errors.push(
      `Thiếu BLOB_READ_WRITE_TOKEN cho môi trường ${deploymentTier} (${process.env.VERCEL_ENV || 'server'}). Bắt buộc cấu hình Cloud/Vercel Blob Storage cho Build & Runtime để tránh mất file upload.`,
    )
  }

  const blobPrefix = (process.env.BLOB_STORAGE_PREFIX || process.env.NORI_BLOB_PREFIX || '').trim()
  const prodBlobPrefix = (process.env.NORI_PRODUCTION_BLOB_PREFIX || '').trim()
  if (deploymentTier === 'staging') {
    if (prodBlobPrefix && blobPrefix === prodBlobPrefix) {
      errors.push('Staging BLOB_STORAGE_PREFIX không được trùng với NORI_PRODUCTION_BLOB_PREFIX.')
    } else if (isVercelRuntime && !blobPrefix) {
      warnings.push(
        'Preview/Staging trên Vercel nên dùng Vercel Blob store riêng hoặc cấu hình BLOB_STORAGE_PREFIX=staging để tách biệt khỏi Production.',
      )
    }
  }

  const sessionSecret = explicitSessionSecret || payloadSecret || defaultDevSecret
  const adminEmail = (process.env.NORI_ADMIN_EMAIL?.trim() || 'admin@nori.vn').toLowerCase()
  const disableDemoSeed =
    process.env.NORI_DISABLE_DEMO_SEED === '1' || deploymentTier === 'production'

  const paymentEnabled = ['true', '1'].includes(
    String(process.env.PAYMENT_ENABLED ?? 'true').toLowerCase(),
  )
  const rawProvider = String(process.env.PAYMENT_PROVIDER ?? 'MOCK').toUpperCase()
  const paymentProvider = (
    ['SEPAY', 'MOCK', 'MANUAL'].includes(rawProvider) ? rawProvider : 'MOCK'
  ) as 'SEPAY' | 'MOCK' | 'MANUAL'
  const rawMode = String(process.env.PAYMENT_MODE ?? 'MOCK').toUpperCase()
  const paymentMode = (['MOCK', 'SANDBOX', 'PRODUCTION'].includes(rawMode) ? rawMode : 'MOCK') as
    | 'MOCK'
    | 'SANDBOX'
    | 'PRODUCTION'

  if (deploymentTier === 'staging' && paymentMode === 'PRODUCTION') {
    errors.push('Môi trường Staging/Preview không được bật PAYMENT_MODE=PRODUCTION.')
  }
  if (paymentEnabled && paymentProvider === 'SEPAY' && paymentMode === 'PRODUCTION') {
    if (!process.env.SEPAY_WEBHOOK_SECRET?.trim() || !process.env.SEPAY_API_KEY?.trim()) {
      errors.push(
        'PAYMENT_PROVIDER=SEPAY với PAYMENT_MODE=PRODUCTION yêu cầu SEPAY_API_KEY và SEPAY_WEBHOOK_SECRET.',
      )
    }
  }

  const aiEnabled = !['false', '0', 'off', 'no'].includes(
    String(process.env.NORI_AI_ENABLED ?? 'true')
      .trim()
      .toLowerCase(),
  )
  const freeTierOnly = !['false', '0', 'no', 'off'].includes(
    String(process.env.NORI_AI_FREE_TIER_ONLY ?? 'true')
      .trim()
      .toLowerCase(),
  )
  const paidProvidersAllowed =
    !freeTierOnly &&
    ['true', '1', 'yes', 'on'].includes(
      String(process.env.NORI_AI_PAID_PROVIDERS_ALLOWED ?? 'false')
        .trim()
        .toLowerCase(),
    )
  const aiProvider = (process.env.NORI_AI_PROVIDER?.trim() || 'gemini').toLowerCase()
  if (aiProvider === 'openai' && (freeTierOnly || !paidProvidersAllowed)) {
    errors.push(
      'NORI_AI_PROVIDER=openai bị chặn vì dự án đang khóa chế độ chỉ dùng Free Tier (NORI_AI_FREE_TIER_ONLY=true / NORI_AI_PAID_PROVIDERS_ALLOWED=false).',
    )
  }
  const aiModel =
    aiProvider === 'openai'
      ? process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini'
      : process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
  const aiApiKeyConfigured =
    aiProvider === 'openai'
      ? Boolean(process.env.OPENAI_API_KEY?.trim())
      : Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim())
  if (aiEnabled && !aiApiKeyConfigured) {
    warnings.push(
      `NORI_AI_ENABLED đang bật nhưng ${aiProvider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} chưa được cấu hình. Trợ lý AI sẽ tự động chuyển sang chế độ tư vấn cơ bản (Rule-based Engine) khi fallback được bật.`,
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    config: {
      nodeEnv,
      deploymentTier,
      isVercelRuntime,
      isProduction,
      isDevelopment,
      isTest,
      port,
      host,
      appUrl,
      allowedOrigins,
      databaseEngine,
      databaseUri,
      sqlitePath,
      dataDir,
      mediaDir,
      backupDir,
      logDir,
      payloadSecret: payloadSecret || defaultDevSecret,
      sessionSecret,
      adminEmail,
      disableDemoSeed,
      paymentEnabled,
      paymentProvider,
      paymentMode,
      aiEnabled,
      aiProvider,
      aiModel,
      aiApiKeyConfigured,
    },
  }
}

export function getEnvConfigSummary() {
  const { ok, config } = validateEnvironment({ checkStorageWritable: false })
  return {
    ok,
    tier: config.deploymentTier,
    databaseEngine: config.databaseEngine,
    isVercelRuntime: config.isVercelRuntime,
    paymentMode: config.paymentMode,
    paymentProvider: config.paymentProvider,
    aiEnabled: config.aiEnabled,
    aiProvider: config.aiProvider,
    aiModel: config.aiModel,
    aiApiKeyConfigured: config.aiApiKeyConfigured,
  }
}
