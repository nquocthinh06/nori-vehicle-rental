import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { checkDatabaseCompatibility } from './check-db-schema.mjs'

const rootDir = process.cwd()
const standaloneDir = path.join(rootDir, '.next', 'standalone')
const serverEntry = path.join(standaloneDir, 'server.js')

if (!fs.existsSync(serverEntry)) {
  console.error(
    '[start:standalone] Missing .next/standalone/server.js. Run `pnpm build` before starting standalone production server.',
  )
  process.exit(1)
}

function syncDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true, force: true })
}

// Next.js standalone bundles do not copy .next/static or public/ automatically
syncDir(path.join(rootDir, '.next', 'static'), path.join(standaloneDir, '.next', 'static'))
syncDir(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'))

// On Windows, Next.js NFT standalone tracing omits sharp's sibling libvips DLLs (libvips-42.dll, libvips-cpp-*.dll)
if (process.platform === 'win32') {
  const rootPnpm = path.join(rootDir, 'node_modules', '.pnpm')
  const standPnpm = path.join(standaloneDir, 'node_modules', '.pnpm')
  if (fs.existsSync(rootPnpm) && fs.existsSync(standPnpm)) {
    for (const entry of fs.readdirSync(rootPnpm)) {
      if (!entry.startsWith('@img+sharp-win32-')) continue
      const pkgName = entry.split('@')[1]?.replace('+', path.sep)
      if (!pkgName) continue
      const srcLib = path.join(rootPnpm, entry, 'node_modules', `@${pkgName}`, 'lib')
      const destLib = path.join(standPnpm, entry, 'node_modules', `@${pkgName}`, 'lib')
      if (fs.existsSync(srcLib) && fs.existsSync(destLib)) {
        for (const file of fs.readdirSync(srcLib)) {
          if (file.endsWith('.dll')) {
            const target = path.join(destLib, file)
            if (!fs.existsSync(target)) {
              fs.copyFileSync(path.join(srcLib, file), target)
            }
          }
        }
      }
    }
  }
}

function resolveSqliteUriFromStandalone(rawUri, fallbackAbsPath) {
  const raw = rawUri?.trim()
  let absPath = fallbackAbsPath
  if (raw) {
    if (raw.startsWith('libsql:') || raw.startsWith('http:') || raw.startsWith('https:')) {
      return raw
    }
    const stripped = raw.startsWith('file:') ? raw.slice(5) : raw
    absPath = path.resolve(rootDir, stripped)
  }
  // Check if same drive / root on Windows
  const standaloneRoot = path.parse(standaloneDir).root.toLowerCase()
  const targetRoot = path.parse(absPath).root.toLowerCase()
  if (standaloneRoot !== targetRoot) {
    return `file:${absPath.replace(/\\/g, '/')}`
  }

  const relFromStandalone = path.relative(standaloneDir, absPath).replace(/\\/g, '/')
  return `file:${relFromStandalone.startsWith('.') ? relFromStandalone : `./${relFromStandalone}`}`
}

const explicitDbUri = process.env.DATABASE_URL?.trim() || process.env.DATABASE_URI?.trim()
const explicitSqlitePath = process.env.NORI_SQLITE_PATH?.trim()
const configuredDataDir = process.env.DATA_DIR?.trim() || process.env.NORI_DATA_DIR?.trim()

const resolvedDbPath = path.resolve(
  rootDir,
  explicitSqlitePath ||
    (explicitDbUri?.startsWith('file:') ? explicitDbUri.slice(5) : explicitDbUri) ||
    (configuredDataDir ? path.join(configuredDataDir, 'nori.db') : 'nori.db'),
)
const resolvedMediaDir = path.resolve(
  rootDir,
  process.env.MEDIA_DIR?.trim() ||
    process.env.NORI_MEDIA_DIR?.trim() ||
    (configuredDataDir ? path.join(configuredDataDir, 'media') : 'media'),
)
const resolvedCacheDir = path.resolve(
  rootDir,
  process.env.NORI_IMAGE_CACHE_DIR?.trim() || path.join('.next', 'cache', 'nori-media-opt'),
)
const resolvedBackupDir = path.resolve(
  rootDir,
  process.env.BACKUP_DIR?.trim() ||
    process.env.NORI_BACKUP_DIR?.trim() ||
    (configuredDataDir ? path.join(configuredDataDir, 'backups') : 'backups'),
)
const resolvedLogDir = path.resolve(
  rootDir,
  process.env.LOG_DIR?.trim() ||
    process.env.NORI_LOG_DIR?.trim() ||
    (configuredDataDir ? path.join(configuredDataDir, 'logs') : 'logs'),
)

// Ensure storage directories exist
for (const dir of [
  path.dirname(resolvedDbPath),
  resolvedMediaDir,
  resolvedCacheDir,
  resolvedBackupDir,
  resolvedLogDir,
]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const port = String(process.env.PORT || '3000')
const hostname = String(process.env.HOST || process.env.HOSTNAME || '0.0.0.0')

const resolvedDbUri = resolveSqliteUriFromStandalone(explicitDbUri, resolvedDbPath)
const isSqliteTarget =
  resolvedDbUri.startsWith('file:') ||
  resolvedDbUri.startsWith('libsql:') ||
  !process.env.DATABASE_URL?.trim()

const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  HOST: hostname,
  HOSTNAME: hostname,
  // Clear DATABASE_URL when running SQLite standalone so copied .next/standalone/.env
  // cannot silently override isolated/local SQLite with remote Neon PostgreSQL.
  ...(isSqliteTarget ? { DATABASE_URL: '' } : {}),
  DATABASE_URI: resolvedDbUri,
  NORI_ROOT_DIR: rootDir,
  NORI_SQLITE_PATH: resolvedDbPath,
  NORI_MEDIA_DIR: resolvedMediaDir,
  NORI_IMAGE_CACHE_DIR: resolvedCacheDir,
  NORI_BACKUP_DIR: resolvedBackupDir,
  NORI_LOG_DIR: resolvedLogDir,
}

// Preflight Database Compatibility Guard
const dbCheck = checkDatabaseCompatibility({ dbPath: resolvedDbPath })
if (!dbCheck.ok) {
  console.error('\n========================================================')
  console.error(' [NORI STANDALONE BLOCKED] DATABASE SCHEMA INCOMPATIBLE')
  console.error('========================================================')
  console.error(`Database:  ${dbCheck.dbPath}`)
  console.error(`Integrity: ${dbCheck.integrity} (FK Violations: ${dbCheck.fkViolations})`)
  if (dbCheck.missingColumns && Object.keys(dbCheck.missingColumns).length > 0) {
    for (const [table, cols] of Object.entries(dbCheck.missingColumns)) {
      console.error(`  - Table "${table}": missing [${cols.join(', ')}]`)
    }
  }
  if (dbCheck.pendingMigrations?.length > 0) {
    console.error(`\nPending migrations: [${dbCheck.pendingMigrations.join(', ')}]`)
  }
  console.error('\nVui lòng chạy migration trước khi khởi động production server:')
  console.error('  pnpm db:migrate')
  console.error('========================================================\n')
  process.exit(1)
}

console.log(
  `[start:standalone] Starting NORI production standalone on http://${hostname}:${port} (db=${resolvedDbPath}, media=${resolvedMediaDir})`,
)

const child = spawn(process.execPath, [serverEntry], {
  cwd: standaloneDir,
  env: childEnv,
  stdio: 'inherit',
})

const forwardSignal = (sig) => {
  if (!child.killed) child.kill(sig)
}
process.on('SIGINT', () => forwardSignal('SIGINT'))
process.on('SIGTERM', () => forwardSignal('SIGTERM'))

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
