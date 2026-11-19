import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 3199
      srv.close(() => resolve(String(port)))
    })
  })
}

async function stopChild(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return
  const closed = new Promise((r) => proc.once('close', r))
  if (process.platform === 'win32' && proc.pid) {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    proc.kill('SIGTERM')
  }
  await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))])
}

function removeSqliteFiles(basePath) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = `${basePath}${suffix}`
    if (fs.existsSync(p)) fs.rmSync(p, { force: true })
  }
}

function getProcessRssMb(pid) {
  if (!pid) return null
  try {
    if (process.platform === 'win32') {
      const out = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`,
        ],
        { encoding: 'utf8' },
      )
      const bytes = Number(out.stdout.trim())
      return Number.isFinite(bytes) && bytes > 0 ? Number((bytes / (1024 * 1024)).toFixed(1)) : null
    }
    const statm = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').trim().split(' ')
    return Number(((Number(statm[1]) * 4096) / (1024 * 1024)).toFixed(1))
  } catch {
    return null
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
  return Number(sorted[idx].toFixed(1))
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
      // retry
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for isolated server health at ${url}`)
}

async function runStage({ baseUrl, vus, durationMs, endpoints, serverPid }) {
  const latencies = []
  const statusCounts = {}
  let errors = 0
  let totalBytes = 0
  let peakRssMb = getProcessRssMb(serverPid) ?? 0
  const start = performance.now()
  const deadline = start + durationMs

  const rssTimer = setInterval(() => {
    const rss = getProcessRssMb(serverPid)
    if (rss && rss > peakRssMb) peakRssMb = rss
  }, 1000)

  const worker = async (workerIdx) => {
    let i = workerIdx
    while (performance.now() < deadline) {
      const ep = endpoints[i % endpoints.length]
      i++
      const t0 = performance.now()
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method || 'GET',
          headers: ep.headers || {},
          body: ep.body,
          signal: AbortSignal.timeout(10_000),
        })
        const buf = await res.arrayBuffer()
        totalBytes += buf.byteLength
        const elapsed = performance.now() - t0
        latencies.push(elapsed)
        statusCounts[res.status] = (statusCounts[res.status] || 0) + 1
        if (res.status >= 500) errors += 1
      } catch {
        const elapsed = performance.now() - t0
        latencies.push(elapsed)
        statusCounts.NETWORK_ERR = (statusCounts.NETWORK_ERR || 0) + 1
        errors += 1
      }
    }
  }

  await Promise.all(Array.from({ length: vus }, (_, idx) => worker(idx)))
  clearInterval(rssTimer)

  const elapsedSec = (performance.now() - start) / 1000
  const sorted = [...latencies].sort((a, b) => a - b)
  const totalRequests = sorted.length

  return {
    vus,
    durationSec: Number(elapsedSec.toFixed(2)),
    totalRequests,
    throughputRps: Number((totalRequests / Math.max(0.01, elapsedSec)).toFixed(1)),
    errorCount: errors,
    errorRatePct: Number(((errors / Math.max(1, totalRequests)) * 100).toFixed(2)),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(1)) : 0,
    totalTransferMB: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    statusCounts,
    peakRssMb,
  }
}

async function runWriteConcurrencyTest(baseUrl) {
  // Concurrent customer registration + availability quote checks to stress SQLite WAL write lock
  const origin = baseUrl
  const batchSize = 20
  const t0 = performance.now()
  const results = await Promise.all(
    Array.from({ length: batchSize }, async (_, idx) => {
      const email = `load_writer_${Date.now()}_${idx}@nori.test`
      const start = performance.now()
      try {
        const res = await fetch(`${baseUrl}/nori-api/auth/register`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin,
            referer: `${origin}/register`,
          },
          body: JSON.stringify({
            fullName: `Load Writer ${idx}`,
            email,
            password: 'Password123!',
            confirmPassword: 'Password123!',
            phone: `091234${String(1000 + idx).slice(-4)}`,
          }),
          signal: AbortSignal.timeout(10_000),
        })
        const text = await res.text()
        const isSqliteBusy = /SQLITE_BUSY|database is locked/i.test(text)
        return {
          status: res.status,
          ms: Number((performance.now() - start).toFixed(1)),
          isSqliteBusy,
        }
      } catch {
        return {
          status: 0,
          ms: Number((performance.now() - start).toFixed(1)),
          isSqliteBusy: false,
        }
      }
    }),
  )
  const totalMs = Number((performance.now() - t0).toFixed(1))
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b)
  const sqliteBusyCount = results.filter((r) => r.isSqliteBusy).length
  const statusCounts = {}
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
  return {
    concurrentWrites: batchSize,
    totalMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
    sqliteBusyCount,
    statusCounts,
  }
}

async function main() {
  const rootDir = process.cwd()
  const sourceDb = path.resolve(rootDir, process.env.NORI_SOURCE_DB || 'nori.db')
  const isolatedDb = path.resolve(rootDir, 'nori-load-isolated.db')
  const sourceMedia = path.resolve(rootDir, 'media')
  const isolatedMedia = path.resolve(rootDir, '.tmp-load-media')
  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`

  const stageDurationMs = Number(process.env.NORI_LOAD_STAGE_MS || 6000)
  const vuLevels = (process.env.NORI_LOAD_VUS || '1,10,25,50,100')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)

  if (!fs.existsSync(sourceDb)) {
    throw new Error(`Missing source DB: ${sourceDb}`)
  }

  removeSqliteFiles(isolatedDb)
  fs.copyFileSync(sourceDb, isolatedDb)
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${sourceDb}${suffix}`)) {
      fs.copyFileSync(`${sourceDb}${suffix}`, `${isolatedDb}${suffix}`)
    }
  }
  fs.rmSync(isolatedMedia, { recursive: true, force: true })
  if (fs.existsSync(sourceMedia)) {
    fs.cpSync(sourceMedia, isolatedMedia, { recursive: true })
  } else {
    fs.mkdirSync(isolatedMedia, { recursive: true })
  }

  const standaloneStarter = path.resolve(rootDir, 'scripts', 'start-standalone.mjs')
  const useStandalone =
    fs.existsSync(path.resolve(rootDir, '.next', 'standalone', 'server.js')) &&
    fs.existsSync(standaloneStarter)
  const nextBin = path.resolve(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next')

  const serverEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    HOSTNAME: '127.0.0.1',
    DATABASE_URI: `file:${isolatedDb}`,
    NORI_SQLITE_PATH: isolatedDb,
    NORI_MEDIA_DIR: isolatedMedia,
    NORI_DISABLE_DEMO_SEED: '1',
    PAYMENT_MODE: 'mock',
    PAYMENT_PROVIDER: 'MOCK',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'nori-load-test-payload-secret-0123456789',
    NORI_SESSION_SECRET:
      process.env.NORI_SESSION_SECRET || 'nori-load-test-session-secret-0123456789',
    NEXT_PUBLIC_SITE_URL: baseUrl,
  }

  const serverProc = useStandalone
    ? spawn(process.execPath, [standaloneStarter], {
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawn(process.execPath, [nextBin, 'start', '-p', port, '-H', '127.0.0.1'], {
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

  let stderrTail = ''
  serverProc.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-10_000)
  })
  let stdoutTail = ''
  serverProc.stdout.on('data', (d) => {
    stdoutTail = (stdoutTail + d.toString()).slice(-10_000)
  })

  try {
    await waitForHealth(`${baseUrl}/nori-api/health`).catch((err) => {
      console.error('[load-test] Server stdout tail:\n' + stdoutTail)
      console.error('[load-test] Server stderr tail:\n' + stderrTail)
      throw err
    })

    const endpoints = [
      { path: '/' },
      { path: '/vehicles' },
      { path: '/vehicles/toyota-fortuner' },
      { path: '/posts' },
      { path: '/nori-api/health' },
      { path: '/nori-api/fleet?modelSlug=toyota-fortuner' },
      {
        path: '/api/media/file/toyota-fortuner-ext-10.jpg?w=640&q=80',
        headers: { accept: 'image/webp,image/*,*/*;q=0.8' },
      },
    ]

    // Warmup 1 pass
    for (const ep of endpoints) {
      await fetch(`${baseUrl}${ep.path}`, { headers: ep.headers || {} }).then((r) =>
        r.arrayBuffer(),
      )
    }

    const rssBeforeMb = getProcessRssMb(serverProc.pid)
    const stages = []
    for (const vus of vuLevels) {
      const stageRes = await runStage({
        baseUrl,
        vus,
        durationMs: stageDurationMs,
        endpoints,
        serverPid: serverProc.pid,
      })
      stages.push(stageRes)
    }

    const writeConcurrency = await runWriteConcurrencyTest(baseUrl)
    const rssAfterMb = getProcessRssMb(serverProc.pid)

    // Verify isolated DB integrity after load & write concurrency
    const postDb = new DatabaseSync(isolatedDb, { readOnly: true })
    const integrity = postDb.prepare('PRAGMA integrity_check').get()?.integrity_check
    const fkCount = postDb.prepare('PRAGMA foreign_key_check').all().length
    const journalMode = postDb.prepare('PRAGMA journal_mode').get()?.journal_mode
    postDb.close()

    const sqliteLockMentionedInLogs = /SQLITE_BUSY|database is locked/i.test(stderrTail)

    const report = {
      timestamp: new Date().toISOString(),
      serverMode: useStandalone ? 'standalone' : 'next-start',
      nodeVersion: process.version,
      stageDurationMs,
      rssBeforeMb,
      rssAfterMb,
      stages,
      writeConcurrency,
      dbPostCheck: {
        integrity,
        fkViolations: fkCount,
        journalMode,
        sqliteLockMentionedInLogs,
      },
    }

    const outArgIdx = process.argv.indexOf('--out')
    if (outArgIdx !== -1 && process.argv[outArgIdx + 1]) {
      fs.writeFileSync(process.argv[outArgIdx + 1], JSON.stringify(report, null, 2))
    }
    console.log(JSON.stringify(report, null, 2))

    if (integrity !== 'ok' || fkCount > 0 || writeConcurrency.sqliteBusyCount > 0) {
      process.exitCode = 1
    }
  } finally {
    await stopChild(serverProc)
    removeSqliteFiles(isolatedDb)
    fs.rmSync(isolatedMedia, { recursive: true, force: true })
  }
}

main()
