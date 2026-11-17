import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const VIEWPORTS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920]

test.describe('NORI Mobile-First, Responsive & PWA', () => {
  test('No horizontal overflow across all 11 breakpoints on key customer routes', async ({
    page,
  }) => {
    const routes = ['/', '/vehicles', '/favorites', '/login', '/offline']
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 844 })
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `Horizontal overflow at ${width}px on ${route}`).toBeLessThanOrEqual(1)
      }
    }
  })

  test('Mobile Bottom Navigation shows 5 real routes, active state, >=44px touch targets, and hides on desktop & detail', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const bottomNav = page.getByRole('navigation', { name: 'Điều hướng nhanh trên di động' })
    await expect(bottomNav).toBeVisible()

    const links = bottomNav.locator('a')
    await expect(links).toHaveCount(5)

    for (const label of ['Trang chủ', 'Tìm xe', 'Yêu thích', 'Đơn hàng', 'Tài khoản']) {
      const link = bottomNav.getByRole('link', { name: new RegExp(label) })
      await expect(link).toBeVisible()
      const box = await link.boundingBox()
      expect(box?.height ?? 0, `Touch target height for ${label}`).toBeGreaterThanOrEqual(44)
    }

    await expect(bottomNav.getByRole('link', { name: /Trang chủ/ })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Navigate to /vehicles via Bottom Nav
    await bottomNav.getByRole('link', { name: /Tìm xe/ }).click()
    await expect(page).toHaveURL(/\/vehicles/)
    await expect(bottomNav.getByRole('link', { name: /Tìm xe/ })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Open first vehicle detail: Bottom Nav must hide so Sticky Booking Bar has no conflict
    const firstCardLink = page.locator('article a[href^="/vehicles/"]').first()
    await firstCardLink.click()
    await expect(page).toHaveURL(/\/vehicles\/.+/)
    await expect(bottomNav).toBeHidden()

    // Desktop hides Bottom Nav
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(bottomNav).toBeHidden()
  })

  test('Favorites flow persists across reload and uses real catalogue data', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/vehicles', { waitUntil: 'domcontentloaded' })

    const favButtons = page.locator('button[aria-label*="yêu thích"]')
    const firstFav = favButtons.first()
    await expect(firstFav).toBeVisible()
    const count = await favButtons.count()
    expect(count).toBeGreaterThan(0)
    const box = await firstFav.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    await firstFav.click()
    await expect(firstFav).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/favorites', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Đã lưu 1 dòng xe/)).toBeVisible()
    await expect(page.locator('article')).toHaveCount(1)

    await page.getByRole('button', { name: /Xóa tất cả/ }).click()
    await expect(page.getByText('Chưa có phương tiện yêu thích')).toBeVisible()
  })

  test('Mobile Catalogue Bottom Sheet filters & active filter chips work cleanly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/vehicles', { waitUntil: 'domcontentloaded' })

    const filterBtn = page.getByRole('button', { name: /Bộ lọc/ })
    await filterBtn.click()

    const closeBtn = page.getByRole('button', { name: 'Đóng bộ lọc' })
    await expect(closeBtn).toBeVisible()

    await page.getByRole('button', { name: /Ô tô/ }).click()
    await page.getByRole('button', { name: /Xem \d+ kết quả/ }).click()
    await expect(closeBtn).toBeHidden()

    const chipsRegion = page.getByLabel('Bộ lọc đang áp dụng')
    await expect(chipsRegion).toBeVisible()
    await expect(chipsRegion.getByText('Loại: Ô tô')).toBeVisible()
  })

  test('Home SearchBar supports location selection and passes it to /vehicles', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const locationSelect = page.locator('#hero-location')
    await expect(locationSelect).toBeVisible()
    const options = await locationSelect.locator('option').allTextContents()
    if (options.length > 1) {
      await locationSelect.selectOption({ index: 1 })
      await page.getByRole('button', { name: /Tìm xe phù hợp/ }).click()
      await expect(page).toHaveURL(/\/vehicles\?.*location=/)
    }
  })

  test('PWA manifest, icons, service worker, and offline fallback are valid', async ({
    request,
    page,
  }) => {
    const manifestRes = await request.get('/manifest.webmanifest')
    expect(manifestRes.status()).toBe(200)
    const manifest = await manifestRes.json()
    expect(manifest.short_name).toBe('NORI')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#087568')
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true)
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)

    const swRes = await request.get('/sw.js')
    expect(swRes.status()).toBe(200)
    const swText = await swRes.text()
    expect(swText).toContain('/nori-api')
    expect(swText).toContain('/dashboard')
    expect(swText).toContain('/offline')

    await page.goto('/offline', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Không có kết nối Internet' })).toBeVisible()
  })

  test('WCAG 2.2 AA accessibility check on mobile viewport (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    for (const route of ['/', '/vehicles', '/favorites', '/offline']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations, `WCAG violations on ${route}`).toEqual([])
    }
  })
})
