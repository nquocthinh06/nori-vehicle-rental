import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

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
  const relFromStandalone = path.relative(standaloneDir, absPath).replace(/\\/g, '/')
  return `file:${relFromStandalone.startsWith('.') ? relFromStandalone : `./${relFromStandalone}`}`
}

const resolvedDbPath = path.resolve(
  rootDir,
  process.env.NORI_SQLITE_PATH?.trim() ||
    (process.env.DATABASE_URI?.startsWith('file:')
      ? process.env.DATABASE_URI.slice(5)
      : process.env.DATABASE_URI) ||
    'nori.db',
)
const resolvedMediaDir = path.resolve(rootDir, process.env.NORI_MEDIA_DIR?.trim() || 'media')
const resolvedCacheDir = path.resolve(
  rootDir,
  process.env.NORI_IMAGE_CACHE_DIR?.trim() || path.join('.next', 'cache', 'nori-media-opt'),
)

const port = String(process.env.PORT || '3000')
const hostname = String(process.env.HOSTNAME || '0.0.0.0')

const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  HOSTNAME: hostname,
  DATABASE_URI: resolveSqliteUriFromStandalone(process.env.DATABASE_URI, resolvedDbPath),
  NORI_SQLITE_PATH: resolvedDbPath,
  NORI_MEDIA_DIR: resolvedMediaDir,
  NORI_IMAGE_CACHE_DIR: resolvedCacheDir,
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
