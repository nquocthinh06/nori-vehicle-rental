import path from 'node:path'
import fs from 'node:fs'

export type EnvironmentMode = 'development' | 'production' | 'test'

export interface NoriEnvironmentConfig {
  nodeEnv: EnvironmentMode
  isProduction: boolean
  isDevelopment: boolean
  isTest: boolean
  port: number
  host: string
  appUrl: string
  allowedOrigins: string[]
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
  if (filePath.startsWith('libsql:') || filePath.startsWith('http:') || filePath.startsWith('https:')) {
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
  if (dbUrl && !dbUrl.startsWith('libsql:') && !dbUrl.startsWith('http:') && !dbUrl.startsWith('https:')) {
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
export function validateEnvironment(options?: { rootDir?: string; checkStorageWritable?: boolean }): {
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

  const port = Number(process.env.PORT || '3000')
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    errors.push(`PORT không hợp lệ: "${process.env.PORT}". Cần cổng số từ 1 đến 65535.`)
  }

  const host = process.env.HOST || process.env.HOSTNAME || '127.0.0.1'

  const rawAppUrl =
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  const appUrl = normalizeUrl(rawAppUrl) || `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`

  const payloadSecret = process.env.PAYLOAD_SECRET?.trim() || ''
  const defaultDevSecret = 'nori-local-dev-secret-9b4df14a-91bb-4c9b-b923-b2dfa62da7e4'

  if (isProduction) {
    if (!payloadSecret) {
      errors.push('PAYLOAD_SECRET là bắt buộc trong môi trường Production. Vui lòng tạo chuỗi ngẫu nhiên từ 32 ký tự trở lên.')
    } else if (payloadSecret.length < 32) {
      errors.push(`PAYLOAD_SECRET quá ngắn (${payloadSecret.length} ký tự). Cần tối thiểu 32 ký tự bảo mật.`)
    } else if (payloadSecret === defaultDevSecret || payloadSecret.includes('CHANGE_ME') || payloadSecret.includes('your-secure-random')) {
      errors.push('PAYLOAD_SECRET đang dùng giá trị mặc định/placeholder. Phải đổi sang chuỗi ngẫu nhiên an toàn trước khi public.')
    }
  } else if (!payloadSecret) {
    warnings.push('PAYLOAD_SECRET chưa thiết lập; đang dùng giá trị dev mặc định (chỉ phù hợp local development).')
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
        errors.push(`Biến bảo mật "${key}" không được đặt tiền tố NEXT_PUBLIC_ vì sẽ bị lộ ra trình duyệt client.`)
      }
    }
  }

  const sqlitePath = resolveSqlitePath(rootDir)
  const databaseUri = toSqliteUri(sqlitePath)
  const dataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim() || path.dirname(sqlitePath)
  const mediaDir = resolveMediaDir(rootDir)
  const backupDir = resolveBackupDir(rootDir)
  const logDir = resolveLogDir(rootDir)

  // Ensure storage parent directories are writable when requested
  if (options?.checkStorageWritable) {
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
    warnings.push('Chưa cấu hình ALLOWED_ORIGINS hoặc APP_URL cho Production. Khuyến nghị thiết lập để tăng cường bảo vệ CSRF/CORS.')
  }

  const sessionSecret = process.env.NORI_SESSION_SECRET?.trim() || payloadSecret || defaultDevSecret
  const adminEmail = (process.env.NORI_ADMIN_EMAIL?.trim() || 'admin@nori.vn').toLowerCase()
  const disableDemoSeed = process.env.NORI_DISABLE_DEMO_SEED === '1'

  const paymentEnabled = ['true', '1'].includes(String(process.env.PAYMENT_ENABLED ?? 'true').toLowerCase())
  const rawProvider = String(process.env.PAYMENT_PROVIDER ?? 'MOCK').toUpperCase()
  const paymentProvider = (['SEPAY', 'MOCK', 'MANUAL'].includes(rawProvider) ? rawProvider : 'MOCK') as 'SEPAY' | 'MOCK' | 'MANUAL'
  const rawMode = String(process.env.PAYMENT_MODE ?? 'MOCK').toUpperCase()
  const paymentMode = (['MOCK', 'SANDBOX', 'PRODUCTION'].includes(rawMode) ? rawMode : 'MOCK') as 'MOCK' | 'SANDBOX' | 'PRODUCTION'

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    config: {
      nodeEnv,
      isProduction,
      isDevelopment,
      isTest,
      port,
      host,
      appUrl,
      allowedOrigins,
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
    },
  }
}
