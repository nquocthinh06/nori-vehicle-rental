import { chromium } from '@playwright/test'

const BASE_URL = process.env.NORI_PERF_BASE_URL || 'http://127.0.0.1:3000'
const RUNS = Math.max(1, Number(process.env.NORI_PERF_RUNS || 3))

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function measurePage(browser, url, options = {}) {
  const { width = 1440, height = 1000, throttle = false } = options
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
  })
  const page = await context.newPage()

  if (throttle) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  await page.addInitScript(() => {
    window.__cls = 0
    window.__lcp = 0
    window.__lcpNode = ''
    window.__shifts = []
    window.__inp = 0

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__cls += entry.value
          window.__shifts.push({
            value: entry.value,
            sources: (entry.sources || []).map((s) => ({
              node: s.node ? s.node.nodeName : 'unknown',
              currentRect: s.currentRect,
              previousRect: s.previousRect,
            })),
          })
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })

    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      if (entries.length > 0) {
        const last = entries[entries.length - 1]
        window.__lcp = last.startTime
        const el = last.element
        if (el) {
          window.__lcpNode = `${el.tagName}${el.getAttribute('src') ? `(${el.getAttribute('src')})` : ''}`
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > window.__inp) {
          window.__inp = entry.duration
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  })

  const t0 = performance.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForLoadState('load', { timeout: 25000 }).catch(() => {})
  const navTime = performance.now() - t0

  await page.waitForTimeout(1000)

  const button = page.getByRole('button', { name: /Nội thất|Thông số|Thuê xe/i }).first()
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => {})
    await page.waitForTimeout(300)
  }

  const metrics = await page.evaluate(() => ({
    cls: window.__cls,
    lcp: window.__lcp,
    lcpNode: window.__lcpNode,
    inp: window.__inp,
    shifts: window.__shifts,
  }))

  await context.close()
  return { ...metrics, navTime: Math.round(navTime) }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox'],
  })

  console.log(`--- PRODUCTION PERFORMANCE BENCHMARK (${BASE_URL}, runs=${RUNS}) ---`)

  const tests = [
    {
      name: 'Desktop (1440px) - /vehicles/toyota-fortuner',
      url: `${BASE_URL}/vehicles/toyota-fortuner`,
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Desktop (1440px) - /vehicles/honda-pcx',
      url: `${BASE_URL}/vehicles/honda-pcx`,
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Desktop (1440px) - /vehicles/ford-ranger-raptor',
      url: `${BASE_URL}/vehicles/ford-ranger-raptor`,
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Mobile (375px, CPU 4x, Slow 4G) - /vehicles/toyota-fortuner',
      url: `${BASE_URL}/vehicles/toyota-fortuner`,
      options: { width: 375, height: 812, throttle: true },
    },
    {
      name: 'Mobile (375px, CPU 4x, Slow 4G) - / (Home)',
      url: `${BASE_URL}/`,
      options: { width: 375, height: 812, throttle: true },
    },
    {
      name: 'Mobile (375px, CPU 4x, Slow 4G) - /vehicles (Catalogue)',
      url: `${BASE_URL}/vehicles`,
      options: { width: 375, height: 812, throttle: true },
    },
  ]

  for (const t of tests) {
    const samples = []
    for (let i = 0; i < RUNS; i++) {
      try {
        samples.push(await measurePage(browser, t.url, t.options))
      } catch (e) {
        console.error(`Error measuring ${t.name} (run ${i + 1}):`, e.message)
      }
    }
    if (samples.length === 0) continue
    const clsVals = samples.map((s) => s.cls)
    const lcpVals = samples.map((s) => Math.round(s.lcp))
    const inpVals = samples.map((s) => Math.round(s.inp))
    const navVals = samples.map((s) => s.navTime)
    const medLcp = Math.round(median(lcpVals))
    const medInp = Math.round(median(inpVals))
    const medCls = median(clsVals)

    console.log(`\n[${t.name}] (${samples.length} runs)`)
    console.log(
      `  CLS median: ${medCls.toFixed(4)} (range ${Math.min(...clsVals).toFixed(4)}..${Math.max(...clsVals).toFixed(4)}) ${medCls <= 0.1 ? 'PASS' : 'FAIL'}`,
    )
    console.log(
      `  LCP median: ${medLcp}ms (range ${Math.min(...lcpVals)}..${Math.max(...lcpVals)}ms) ${medLcp <= 2500 ? 'GOOD' : 'OVER'} [candidate: ${samples[samples.length - 1].lcpNode || 'none'}]`,
    )
    console.log(
      `  INP median: ${medInp}ms (range ${Math.min(...inpVals)}..${Math.max(...inpVals)}ms) ${medInp <= 200 ? 'GOOD' : 'OVER'}`,
    )
    console.log(
      `  Load median: ${Math.round(median(navVals))}ms (range ${Math.min(...navVals)}..${Math.max(...navVals)}ms)`,
    )
  }

  await browser.close()
}

main()
