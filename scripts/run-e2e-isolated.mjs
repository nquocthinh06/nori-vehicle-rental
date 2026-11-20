import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { detectLanIPv4 } from './lan-network.mjs'

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
  const rawArgs = process.argv.slice(2)
  const useLan = rawArgs.includes('--lan')
  const extraArgs = rawArgs.filter((arg) => arg !== '--lan')

  let targetHost = process.env.NORI_E2E_HOST?.trim() || 'localhost'
  if (useLan) {
    const detected = detectLanIPv4({ explicitIp: process.env.NORI_LAN_IP })
    if (!detected.ip) {
      throw new Error(
        '[isolated-e2e] --lan requires an active LAN IPv4 interface or NORI_LAN_IP=<ipv4>.',
      )
    }
    targetHost = detected.ip
  }

  const sourceDb = path.resolve(process.cwd(), process.env.NORI_SOURCE_DB || 'nori.db')
  const isolatedDb = path.resolve(process.cwd(), 'nori-e2e-isolated.db')
  const sourceMediaDir = path.resolve(process.cwd(), process.env.NORI_SOURCE_MEDIA_DIR || 'media')
  const isolatedMediaDir = path.resolve(process.cwd(), '.tmp-e2e-media')
  const port = process.env.NORI_E2E_PORT ? String(process.env.NORI_E2E_PORT) : await getFreePort()
  const localBaseUrl = `http://localhost:${port}`
  const baseUrl = `http://${targetHost}:${port}`

  if (!fs.existsSync(sourceDb)) {
    throw new Error(`Source database not found: ${sourceDb}`)
  }

  const preCheckDb = new DatabaseSync(sourceDb, { readOnly: true })
  const preIntegrity = preCheckDb.prepare('PRAGMA integrity_check').get()
  const preFk = preCheckDb.prepare('PRAGMA foreign_key_check').all()
  const preTestUsersCount = preCheckDb
    .prepare(
      "SELECT count(*) AS count FROM users WHERE email LIKE '%@example.test' OR email LIKE '%@nori.test'",
    )
    .get().count
  preCheckDb.close()
  if (preIntegrity?.integrity_check !== 'ok' || preFk.length > 0) {
    throw new Error(
      `Source DB ${sourceDb} failed pre-copy health check (integrity=${preIntegrity?.integrity_check}, fkViolations=${preFk.length})`,
    )
  }

  removeSqliteFiles(isolatedDb)
  fs.copyFileSync(sourceDb, isolatedDb)
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${sourceDb}${suffix}`)) {
      fs.copyFileSync(`${sourceDb}${suffix}`, `${isolatedDb}${suffix}`)
    }
  }

  fs.rmSync(isolatedMediaDir, { recursive: true, force: true })
  if (fs.existsSync(sourceMediaDir)) {
    fs.cpSync(sourceMediaDir, isolatedMediaDir, { recursive: true })
  } else {
    fs.mkdirSync(isolatedMediaDir, { recursive: true })
  }

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    DATABASE_URI: `file:./nori-e2e-isolated.db`,
    NORI_SQLITE_PATH: isolatedDb,
    NORI_MEDIA_DIR: isolatedMediaDir,
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
    if (baseUrl !== localBaseUrl) {
      await waitForHealth(`${localBaseUrl}/nori-api/health`)
    }

    const pwBin = path.resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js')
    const pwRes = await runAsyncCommand(process.execPath, [pwBin, 'test', ...extraArgs], {
      env: {
        ...serverEnv,
        NORI_TEST_BASE_URL: baseUrl,
        ...(baseUrl !== localBaseUrl ? { NORI_TEST_LOCAL_URL: localBaseUrl } : {}),
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
        baseUrl,
        exitCode: pwRes.status ?? 1,
        serverUnexpectedExit,
        postIntegrity: postIntegrity.integrity_check,
        postFkViolationsCount: postFk.length,
        baselineTestUsersCount: preTestUsersCount,
        postTestUsersCount: leftoverTestUsers.length,
        newLeftoverTestUsersCount: Math.max(0, leftoverTestUsers.length - preTestUsersCount),
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
    fs.rmSync(isolatedMediaDir, { recursive: true, force: true })
  }
}

main()
