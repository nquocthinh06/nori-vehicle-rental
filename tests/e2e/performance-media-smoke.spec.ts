import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

function getAdminCredentials() {
  const envPath = path.resolve(process.cwd(), '.env')
  let email = process.env.NORI_ADMIN_EMAIL || 'admin@nori.vn'
  let password = process.env.NORI_ADMIN_PASSWORD || ''
  if (fs.existsSync(envPath)) {
    for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      let val = line.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      const k = line.slice(0, eq).trim()
      if (k === 'NORI_ADMIN_EMAIL') email = val
      if (k === 'NORI_ADMIN_PASSWORD') password = val
    }
  }
  return {
    email: process.env.NORI_ADMIN_EMAIL || email,
    password: process.env.NORI_ADMIN_PASSWORD || password,
  }
}

test.describe('NORI Performance Smoke, Media Integrity, Payment Isolation & Cache Revalidation', () => {
  test('PERF-MEDIA-01: Public routes decode Hero Carousel, Vehicle Catalogue, Detail Gallery & Posts with WebP optimization and zero payment requests', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const paymentRequests: string[] = []
    const mediaResponses: Array<{
      url: string
      status: number
      contentType: string
      bytes: number
    }> = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/nori-api/payments') || url.includes('sepay.vn')) {
        paymentRequests.push(url)
      }
    })
    page.on('response', async (res) => {
      const url = res.url()
      if (url.includes('/api/media/file/')) {
        const lenHeader = res.headers()['content-length']
        const bytes = lenHeader ? Number(lenHeader) : 0
        mediaResponses.push({
          url,
          status: res.status(),
          contentType: res.headers()['content-type'] || '',
          bytes,
        })
      }
    })

    // 1. Home page & Hero Carousel
    await page.goto('/', { waitUntil: 'networkidle' })
    const heroImg = page.locator('section img').first()
    await expect(heroImg).toBeVisible()
    const heroDims = await heroImg.evaluate((el: HTMLImageElement) => ({
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      src: el.currentSrc || el.src,
    }))
    expect(heroDims.complete).toBe(true)
    expect(heroDims.naturalWidth).toBeGreaterThan(0)
    expect(heroDims.naturalHeight).toBeGreaterThan(0)

    // Advance Hero Carousel slide and verify slide 2 decodes cleanly without request storm
    const nextBtn = page
      .getByRole('button', { name: /Slide tiếp theo|Ảnh tiếp theo|Next/i })
      .first()
    if (await nextBtn.isVisible().catch(() => false)) {
      const reqCountBefore = mediaResponses.length
      await nextBtn.click()
      await page.waitForTimeout(800)
      const slideDims = await page.locator('section img').evaluateAll((imgs) =>
        (imgs as HTMLImageElement[])
          .filter((img) => {
            const rect = img.getBoundingClientRect()
            return rect.width > 50 && rect.height > 50
          })
          .map((img) => ({
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          })),
      )
      expect(slideDims.some((d) => d.naturalWidth > 0 && d.naturalHeight > 0)).toBe(true)
      // Must NOT trigger runaway image fetches
      expect(mediaResponses.length - reqCountBefore).toBeLessThan(15)
    }

    // 2. Vehicle Catalogue (/vehicles)
    const beforeVehiclesIdx = mediaResponses.length
    await page.goto('/vehicles', { waitUntil: 'networkidle' })
    // Scroll down to trigger lazy vehicle cards so we verify real catalogue image integrity
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 80))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle')

    const catalogueImgs = await page.locator('main img').evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).map((img) => ({
        alt: img.alt,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.currentSrc || img.src,
      })),
    )
    expect(catalogueImgs.length).toBeGreaterThanOrEqual(8)
    const brokenCatalogue = catalogueImgs.filter(
      (i) => !i.complete || i.naturalWidth === 0 || i.naturalHeight === 0,
    )
    expect(brokenCatalogue).toEqual([])

    // Verify local media optimizer returned HTTP 200 WebP for resized requests (?w=...)
    const resizedVehiclesMedia = mediaResponses
      .slice(beforeVehiclesIdx)
      .filter((r) => r.url.includes('w='))
    expect(resizedVehiclesMedia.length).toBeGreaterThan(0)
    for (const r of resizedVehiclesMedia) {
      expect(r.status).toBe(200)
      expect(r.contentType).toContain('image/webp')
    }

    // 3. Vehicle Detail Gallery (/vehicles/toyota-fortuner)
    await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'networkidle' })
    const detailImgs = await page.locator('main img').evaluateAll((imgs) =>
      (imgs as HTMLImageElement[])
        .filter((img) => img.getBoundingClientRect().width > 20)
        .map((img) => ({
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })),
    )
    expect(detailImgs.length).toBeGreaterThan(0)
    for (const img of detailImgs) {
      expect(img.complete).toBe(true)
      expect(img.naturalWidth).toBeGreaterThan(0)
      expect(img.naturalHeight).toBeGreaterThan(0)
    }

    // 4. Posts page (/posts)
    const postsRes = await page.goto('/posts', { waitUntil: 'networkidle' })
    expect(postsRes?.status()).toBe(200)

    // Strict assertions: ZERO payment calls on public routes, ZERO hydration/runtime errors
    expect(paymentRequests).toEqual([])
    expect(pageErrors).toEqual([])
    const hydrationErrors = consoleErrors.filter((e) => /hydrat|mismatch|quality/i.test(e))
    expect(hydrationErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('PERF-MEDIA-02: Mobile viewport (375x812) renders Hero & Vehicle cards cleanly with zero horizontal overflow and zero payment requests', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    const paymentRequests: string[] = []
    const pageErrors: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/nori-api/payments') || req.url().includes('sepay.vn')) {
        paymentRequests.push(req.url())
      }
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    for (const route of ['/', '/vehicles', '/vehicles/toyota-fortuner']) {
      await page.goto(route, { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, `Horizontal overflow on mobile ${route}`).toBeLessThanOrEqual(2)

      const firstImg = page.locator('main img, section img').first()
      await expect(firstImg).toBeVisible()
      const dims = await firstImg.evaluate((el: HTMLImageElement) => ({
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
      }))
      expect(dims.naturalWidth).toBeGreaterThan(0)
      expect(dims.naturalHeight).toBeGreaterThan(0)
    }

    expect(paymentRequests).toEqual([])
    expect(pageErrors).toEqual([])
    await context.close()
  })

  test('PERF-CACHE-03: CMS Admin edit invalidates production cache and appears immediately in fresh HTTP request', async ({
    request,
  }) => {
    const { email, password } = getAdminCredentials()
    test.skip(!password, 'NORI_ADMIN_PASSWORD not configured in .env')

    const loginRes = await request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email, password, accountType: 'admin' },
    })
    expect(loginRes.status()).toBe(200)

    // Read current site settings
    const getRes = await request.get(`${ORIGIN}/nori-api/dashboard/content`, {
      headers: AUTH_HEADERS,
    })
    expect(getRes.status()).toBe(200)
    const contentJson = await getRes.json()
    const originalAddress = String(contentJson.data?.site?.address || '')
    const marker = `NORI-REVAL-${Date.now()}`
    const updatedAddress = `${originalAddress || 'TP. Hồ Chí Minh'} [${marker}]`.trim()

    try {
      const patchRes = await request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: { address: updatedAddress, _status: 'published' },
      })
      expect(patchRes.status()).toBe(200)

      // Fresh production HTTP request to `/` MUST reflect the live CMS edit immediately (no rebuild!)
      const homeHtml = await (await request.get(`${ORIGIN}/`)).text()
      expect(homeHtml).toContain(marker)
    } finally {
      // Restore original address cleanly
      await request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: { address: originalAddress, _status: 'published' },
      })
    }
  })
})
