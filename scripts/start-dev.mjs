import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { checkDatabaseCompatibility } from './check-db-schema.mjs'

function main() {
  const rootDir = process.cwd()
  const nextBin = path.resolve(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (!fs.existsSync(nextBin)) {
    console.error('[NORI DEV] Không tìm thấy Next.js CLI. Vui lòng chạy `pnpm install` trước.')
    process.exit(1)
  }

  // Preflight Database Compatibility Guard
  const dbCheck = checkDatabaseCompatibility({ rootDir })
  if (!dbCheck.ok) {
    console.error('\n========================================================')
    console.error(' [NORI DEV BLOCKED] DATABASE SCHEMA MISMATCH / PENDING MIGRATION')
    console.error('========================================================')
    console.error(`Database:  ${dbCheck.dbPath}`)
    console.error(`Integrity: ${dbCheck.integrity} (FK Violations: ${dbCheck.fkViolations})`)
    if (dbCheck.missingColumns && Object.keys(dbCheck.missingColumns).length > 0) {
      console.error('\nMissing columns detected:')
      for (const [table, cols] of Object.entries(dbCheck.missingColumns)) {
        console.error(`  - Table "${table}": missing [${cols.join(', ')}]`)
      }
    }
    if (dbCheck.pendingMigrations?.length > 0) {
      console.error(`\nPending migrations: [${dbCheck.pendingMigrations.join(', ')}]`)
    }
    console.error('\nHướng dẫn xử lý: Vui lòng chạy lệnh migration an toàn:')
    console.error('  pnpm db:migrate')
    console.error('========================================================\n')
    process.exit(1)
  }

  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const hasExplicitHost = rawArgs.some(
    (arg) => arg === '--hostname' || arg === '-H' || arg.startsWith('--hostname='),
  )
  const hasExplicitPort = rawArgs.some(
    (arg) => arg === '--port' || arg === '-p' || arg.startsWith('--port='),
  )

  const portRaw = process.env.PORT?.trim() || '3000'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[NORI DEV] PORT không hợp lệ: "${portRaw}".`)
    process.exit(1)
  }

  // Bind strictly to IPv4 loopback on local developer machines so accidental LAN/public IPv6
  // exposure cannot occur even if Windows Firewall is turned off, while preserving 0.0.0.0 in Figma sandbox.
  const bindHost =
    process.env.NORI_DEV_BIND_HOST?.trim() || (process.env.FIGMA === '1' ? '0.0.0.0' : '127.0.0.1')

  const nextArgs = ['dev']
  if (!hasExplicitHost) nextArgs.push('--hostname', bindHost)
  if (!hasExplicitPort) nextArgs.push('--port', String(port))
  nextArgs.push(...rawArgs)

  const child = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: 'inherit',
  })

  let shuttingDown = false
  let childExited = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let killTimer = null

  const shutdown = (sig) => {
    if (childExited || shuttingDown) return
    shuttingDown = true
    if (!child.killed) {
      try {
        child.kill(sig)
      } catch {
        // ignore signal forwarding errors
      }
    }
    if (process.platform === 'win32' && child.pid) {
      killTimer = setTimeout(() => {
        if (!childExited && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
        }
      }, 2500)
      killTimer.unref()
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  child.on('exit', (code, signal) => {
    childExited = true
    if (killTimer) {
      clearTimeout(killTimer)
      killTimer = null
    }
    if (shuttingDown) {
      process.exit(0)
      return
    }
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

main()
