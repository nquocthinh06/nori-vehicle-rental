import { chromium } from '@playwright/test'

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
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps (Fast 3G/Slow 4G)
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  await page.addInitScript(() => {
    window.__cls = 0
    window.__lcp = 0
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
        window.__lcp = entries[entries.length - 1].startTime
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
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {})
  const navTime = performance.now() - t0

  // Wait extra 1000ms for any late hydration/fetches
  await page.waitForTimeout(1000)

  // Trigger interactive action to measure INP / interaction delay
  const button = page.getByRole('button', { name: /Nội thất|Thông số|Thuê xe/i }).first()
  if (await button.isVisible().catch(() => false)) {
    await button.click().catch(() => {})
    await page.waitForTimeout(300)
  }

  const metrics = await page.evaluate(() => ({
    cls: window.__cls,
    lcp: window.__lcp,
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

  console.log('--- ĐO LƯỜNG HIỆU NĂNG PRODUCTION BUILD (Next.js 16.4.6) ---')

  const tests = [
    {
      name: 'Desktop (1440px) - /vehicles/toyota-fortuner (Toyota Fortuner)',
      url: 'http://localhost:3000/vehicles/toyota-fortuner',
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Desktop (1440px) - /vehicles/honda-pcx (Honda PCX)',
      url: 'http://localhost:3000/vehicles/honda-pcx',
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Desktop (1440px) - /vehicles/ford-ranger-raptor (Ford Ranger)',
      url: 'http://localhost:3000/vehicles/ford-ranger-raptor',
      options: { width: 1440, height: 1000 },
    },
    {
      name: 'Mobile (375px, CPU 4x Throttling, Slow 4G) - /vehicles/toyota-fortuner',
      url: 'http://localhost:3000/vehicles/toyota-fortuner',
      options: { width: 375, height: 812, throttle: true },
    },
    {
      name: 'Mobile (375px) - / (Home)',
      url: 'http://localhost:3000/',
      options: { width: 375, height: 812 },
    },
    {
      name: 'Mobile (375px) - /vehicles (Catalogue)',
      url: 'http://localhost:3000/vehicles',
      options: { width: 375, height: 812 },
    },
  ]

  for (const t of tests) {
    try {
      const res = await measurePage(browser, t.url, t.options)
      console.log(`\n[${t.name}]`)
      console.log(
        `  CLS: ${res.cls.toFixed(4)} ${res.cls <= 0.1 ? '✅ PASS (<=0.1)' : '❌ FAIL (>0.1)'}`,
      )
      console.log(
        `  LCP: ${Math.round(res.lcp)}ms ${res.lcp <= 2500 ? '✅ GOOD (<=2.5s)' : '⚠️ NEEDS REVIEW'}`,
      )
      console.log(`  INP: ${Math.round(res.inp)}ms ${res.inp <= 200 ? '✅ GOOD (<=200ms)' : '⚠️'}`)
      console.log(`  Network Idle: ${res.navTime}ms`)
      if (res.shifts.length > 0) {
        console.log(`  Shifts count: ${res.shifts.length}`)
      }
    } catch (e) {
      console.error(`Error measuring ${t.name}:`, e.message)
    }
  }

  await browser.close()
}

main()
