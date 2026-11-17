import { chromium } from '@playwright/test'

async function traceShifts(url) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox'],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  const page = await context.newPage()

  await page.addInitScript(() => {
    window.__shifts = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          const sources = (entry.sources || []).map((s) => {
            let el = s.node
            let selector = ''
            if (el && el.nodeType === 1) {
              selector = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 3).join('.') : ''}`
            }
            return {
              selector,
              prevRect: s.previousRect ? { y: s.previousRect.y, h: s.previousRect.height } : null,
              currRect: s.currentRect ? { y: s.currentRect.y, h: s.currentRect.height } : null,
            }
          })
          window.__shifts.push({
            value: entry.value,
            sources,
          })
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const shifts = await page.evaluate(() => window.__shifts)
  console.log(`TOTAL SHIFTS for ${url}: ${shifts.length}`)
  let total = 0
  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i]
    total += s.value
    console.log(`\n--- Shift #${i + 1} (value: ${s.value.toFixed(5)}) ---`)
    for (const src of s.sources) {
      console.log(`  Target: <${src.selector}>`)
      console.log(`    prev: y=${src.prevRect?.y}, h=${src.prevRect?.h}`)
      console.log(`    curr: y=${src.currRect?.y}, h=${src.currRect?.h}`)
      if (src.prevRect && src.currRect) {
        console.log(`    deltaY: ${src.currRect.y - src.prevRect.y}`)
      }
    }
  }
  console.log(`\n=> CUMULATIVE CLS: ${total.toFixed(5)}`)
  await browser.close()
}

traceShifts('http://localhost:3000/vehicles/toyota-fortuner')
