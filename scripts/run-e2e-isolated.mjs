import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3105
      srv.close(() => resolve(String(port)))
    })
  })
}

async function stopChildProcess(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return
  const closed = new Promise((resolve) => {
    proc.once('close', resolve)
  })
  if (process.platform === 'win32' && proc.pid) {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    proc.kill('SIGTERM')
  }
  await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))])
}

function runAsyncCommand(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options)
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ status: code, signal }))
  })
}

function removeSqliteFiles(basePath) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = `${basePath}${suffix}`
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
    }
  }
}

async function waitForHealth(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const body = await res.json()
        if (body?.status === 'ok' && body?.db === 'connected') return
      }
    } catch {
      // retry until server listens
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Timed out waiting for isolated server health at ${url}`)
}

async function main() {
  const sourceDb = path.resolve(process.cwd(), process.env.NORI_SOURCE_DB || 'nori.db')
  const isolatedDb = path.resolve(process.cwd(), 'nori-e2e-isolated.db')
  const port = process.env.NORI_E2E_PORT
    ? String(process.env.NORI_E2E_PORT)
    : await getFreePort()
  const baseUrl = `http://localhost:${port}`

  if (!fs.existsSync(sourceDb)) {
    throw new Error(`Source database not found: ${sourceDb}`)
  }

  const preCheckDb = new DatabaseSync(sourceDb, { readOnly: true })
  const preIntegrity = preCheckDb.prepare('PRAGMA integrity_check').get()
  const preFk = preCheckDb.prepare('PRAGMA foreign_key_check').all()
  preCheckDb.close()
  if (preIntegrity?.integrity_check !== 'ok' || preFk.length > 0) {
    throw new Error(
      `Source DB ${sourceDb} failed pre-copy health check (integrity=${preIntegrity?.integrity_check}, fkViolations=${preFk.length})`,
    )
  }

  removeSqliteFiles(isolatedDb)
  fs.copyFileSync(sourceDb, isolatedDb)

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    DATABASE_URI: `file:./nori-e2e-isolated.db`,
    NORI_SQLITE_PATH: isolatedDb,
    NORI_DISABLE_DEMO_SEED: '1',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'nori-isolated-e2e-payload-secret-0123456789',
    NORI_SESSION_SECRET:
      process.env.NORI_SESSION_SECRET || 'nori-isolated-e2e-session-secret-0123456789',
    NEXT_PUBLIC_SITE_URL: baseUrl,
  }

  const nextBin = path.resolve(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  const serverProc = spawn(process.execPath, [nextBin, 'start', '-p', port, '-H', '0.0.0.0'], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLogs = ''
  const appendLog = (chunk) => {
    serverLogs = (serverLogs + chunk.toString()).slice(-32_000)
  }
  serverProc.stdout.on('data', appendLog)
  serverProc.stderr.on('data', appendLog)

  let serverUnexpectedExit = null
  let stoppingServer = false
  serverProc.on('error', (err) => {
    if (!stoppingServer) {
      serverUnexpectedExit = `error: ${err.message}`
      console.error(`[isolated-e2e] Server process error: ${err.message}`)
    }
  })
  serverProc.on('exit', (code, signal) => {
    if (!stoppingServer) {
      serverUnexpectedExit = `code=${code}, signal=${signal}`
      console.error(`[isolated-e2e] Server exited unexpectedly (${serverUnexpectedExit})`)
      if (serverLogs) {
        console.error('[isolated-e2e] Server tail logs:\n' + serverLogs.slice(-6000))
      }
    }
  })

  try {
    await waitForHealth(`${baseUrl}/nori-api/health`)

    const pwBin = path.resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js')
    const extraArgs = process.argv.slice(2)
    const pwRes = await runAsyncCommand(process.execPath, [pwBin, 'test', ...extraArgs], {
      env: {
        ...serverEnv,
        NORI_TEST_BASE_URL: baseUrl,
      },
      stdio: 'inherit',
    })

    const postDb = new DatabaseSync(isolatedDb, { readOnly: true })
    const postIntegrity = postDb.prepare('PRAGMA integrity_check').get()
    const postFk = postDb.prepare('PRAGMA foreign_key_check').all()
    const leftoverTestUsers = postDb
      .prepare(
        "SELECT email FROM users WHERE email LIKE '%@example.test' OR email LIKE '%@nori.test'",
      )
      .all()
    postDb.close()

    if (postIntegrity?.integrity_check !== 'ok' || postFk.length > 0) {
      throw new Error(
        `Isolated DB failed post-E2E integrity/FK check: integrity=${postIntegrity?.integrity_check}, fkViolations=${postFk.length}`,
      )
    }

    console.log(
      JSON.stringify({
        isolatedE2EResult: pwRes.status === 0 && !serverUnexpectedExit ? 'PASS' : 'FAIL',
        exitCode: pwRes.status ?? 1,
        serverUnexpectedExit,
        postIntegrity: postIntegrity.integrity_check,
        postFkViolationsCount: postFk.length,
        leftoverTestUsersCount: leftoverTestUsers.length,
      }),
    )

    if ((pwRes.status ?? 1) !== 0 || serverUnexpectedExit) {
      if (serverLogs) console.error(serverLogs.slice(-6000))
      process.exitCode = pwRes.status && pwRes.status !== 0 ? pwRes.status : 1
    }
  } finally {
    stoppingServer = true
    await stopChildProcess(serverProc)
    removeSqliteFiles(isolatedDb)
  }
}

main()
