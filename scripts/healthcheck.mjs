#!/usr/bin/env node
import process from 'node:process'

const args = process.argv.slice(2)

function readArg(flag) {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? String(args[idx + 1]).trim() : ''
}

const customUrl = readArg('--url') || process.env.NORI_HEALTHCHECK_URL?.trim() || ''
const isPostDeploy = args.includes('--post-deploy')
const port = process.env.PORT || '3000'
const host = process.env.HOST || '127.0.0.1'
const baseUrl = customUrl ? customUrl.replace(/\/$/, '') : `http://${host}:${port}`
const healthToken = process.env.PAYLOAD_SECRET?.trim() || ''

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = performance.now()
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const elapsedMs = Math.round(performance.now() - started)
    return { res, elapsedMs }
  } finally {
    clearTimeout(timer)
  }
}

async function runBasicHealthcheck() {
  const targetUrl = `${baseUrl}/nori-api/health`
  try {
    const headers = healthToken ? { 'x-health-token': healthToken } : {}
    const { res, elapsedMs } = await fetchWithTimeout(targetUrl, { headers })
    if (!res.ok) {
      const text = await res.text()
      console.error(
        `[HEALTHCHECK FAILED] HTTP ${res.status} from ${targetUrl}: ${text.slice(0, 300)}`,
      )
      process.exit(1)
    }
    const data = await res.json()
    if (data.status !== 'ok' || data.db !== 'connected') {
      console.error(
        `[HEALTHCHECK FAILED] Unhealthy payload from ${targetUrl}: ${JSON.stringify(data)}`,
      )
      process.exit(1)
    }
    console.log(
      `[HEALTHCHECK OK] Status=${data.status}, DB=${data.db} (${data.dbLatencyMs ?? 'n/a'}ms), Readiness=${data.readiness ?? 'n/a'}, HTTP=${elapsedMs}ms, ReqId=${res.headers.get('x-nori-request-id') ?? 'n/a'}`,
    )
  } catch (err) {
    console.error(
      `[HEALTHCHECK FAILED] Unable to reach ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exit(1)
  }
}

async function runPostDeploySmokeSuite() {
  console.log(`\n=== NORI POST-DEPLOY SMOKE VERIFICATION (${baseUrl}) ===`)
  const checks = [
    {
      name: 'Liveness probe',
      path: '/nori-api/health?type=live',
      validate: async (res) => {
        const body = await res.json()
        return res.status === 200 && body.status === 'ok' && body.liveness === 'ALIVE'
      },
    },
    {
      name: 'Readiness probe & DB ping',
      path: '/nori-api/health',
      headers: healthToken ? { 'x-health-token': healthToken } : {},
      validate: async (res) => {
        const body = await res.json()
        if (res.status !== 200 || body.status !== 'ok' || body.db !== 'connected') return false
        console.log(
          `   dbLatencyMs=${body.dbLatencyMs ?? 'n/a'}, readiness=${body.readiness}, tier=${body.runtimeTier ?? 'public'}`,
        )
        return true
      },
    },
    {
      name: 'Home page SSR & headers',
      path: '/',
      validate: async (res) => {
        const html = await res.text()
        return res.status === 200 && html.includes('NORI')
      },
    },
    {
      name: 'Vehicles catalogue SSR',
      path: '/vehicles',
      validate: async (res) => res.status === 200,
    },
    {
      name: 'Locations public API',
      path: '/nori-api/locations',
      validate: async (res) => {
        const body = await res.json()
        return res.status === 200 && body.success === true && Array.isArray(body.data?.branches)
      },
    },
    {
      name: 'Availability catalogue API',
      path: '/nori-api/availability?mode=catalogue',
      validate: async (res) => {
        const body = await res.json()
        return (
          res.status === 200 &&
          body?.success === true &&
          Array.isArray(body?.data?.availableModelIds) &&
          Array.isArray(body?.data?.availableVehicleIds)
        )
      },
    },
    {
      name: 'Auth boundary on private bookings API',
      path: '/nori-api/bookings',
      validate: async (res) => {
        const cc = res.headers.get('cache-control') || ''
        return res.status === 401 && cc.includes('no-store')
      },
    },
    {
      name: 'Service Worker no-cache policy',
      path: '/sw.js',
      validate: async (res) => {
        const text = await res.text()
        return (
          res.status === 200 && text.includes("'/nori-api'") && text.includes('SENSITIVE_PREFIXES')
        )
      },
    },
  ]

  let failed = 0
  for (const check of checks) {
    try {
      const { res, elapsedMs } = await fetchWithTimeout(`${baseUrl}${check.path}`, {
        headers: check.headers ?? {},
        redirect: 'manual',
      })
      const ok = await check.validate(res)
      if (!ok) {
        failed += 1
        console.error(`[FAIL] ${check.name} (${check.path}) -> HTTP ${res.status} (${elapsedMs}ms)`)
      } else {
        console.log(`[PASS] ${check.name} (${check.path}) -> HTTP ${res.status} (${elapsedMs}ms)`)
      }
    } catch (err) {
      failed += 1
      console.error(
        `[FAIL] ${check.name} (${check.path}) -> ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (failed > 0) {
    console.error(`\n[POST-DEPLOY SMOKE FAILED] ${failed}/${checks.length} checks failed.`)
    process.exit(1)
  }
  console.log(`\n[POST-DEPLOY SMOKE OK] All ${checks.length} checks passed cleanly.`)
}

if (isPostDeploy) {
  await runPostDeploySmokeSuite()
} else {
  await runBasicHealthcheck()
}
