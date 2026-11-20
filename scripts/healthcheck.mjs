#!/usr/bin/env node
const port = process.env.PORT || '3000'
const host = process.env.HOST || '127.0.0.1'
const targetUrl = `http://${host}:${port}/nori-api/health`

async function checkHealth() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(targetUrl, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      console.error(`[HEALTHCHECK FAILED] HTTP ${res.status} from ${targetUrl}`)
      const text = await res.text()
      console.error(`Response: ${text.slice(0, 300)}`)
      process.exit(1)
    }
    const data = await res.json()
    console.log(`[HEALTHCHECK OK] Status=${data.status}, DB=${data.db}, Media=${data.mediaStorage}, Uptime=${data.uptimeSeconds}s`)
    process.exit(0)
  } catch (err) {
    console.error(`[HEALTHCHECK FAILED] Unable to reach ${targetUrl}: ${err.message}`)
    process.exit(1)
  }
}

checkHealth()
