import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

const ADMIN_VIEWPORTS = [320, 375, 390, 414, 768, 1024, 1440]
const MOBILE_VIEWPORTS = [320, 375, 390, 414]

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

async function loginAsAdmin(page: import('@playwright/test').Page) {
  const { email, password } = getAdminCredentials()
  test.skip(!password, 'NORI_ADMIN_PASSWORD not configured in .env')
  const res = await page.request.post(`${ORIGIN}/nori-api/auth/login`, {
    headers: AUTH_HEADERS,
    data: { email, password, accountType: 'admin' },
  })
  expect(res.status()).toBe(200)
}

test.describe('NORI Admin Responsive UI & Notification Bell Viewport Integrity', () => {
  test('ADMIN-RESP-01: Notification bell opens bottom sheet on mobile (<768px) and popover on tablet/desktop (>=768px) fully within viewport', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    for (const width of ADMIN_VIEWPORTS) {
      const height = width < 768 ? 812 : width === 768 ? 1024 : 900
      await page.setViewportSize({ width, height })
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, `Admin /dashboard overflow at ${width}px`).toBeLessThanOrEqual(1)

      const bellBtn = page.getByRole('button', { name: 'Thông báo vận hành' })
      await expect(bellBtn).toBeVisible()
      await bellBtn.click()

      const panel = page.locator('#admin-notification-panel')
      await expect(panel).toBeVisible()
      // Allow entrance animation (240ms) to settle before measuring viewport bounds
      await page.waitForTimeout(300)

      const box = await panel.boundingBox()
      expect(box, `Notification panel bounding box missing at ${width}px`).not.toBeNull()
      if (box) {
        expect(box.x, `Panel left edge clipped at ${width}px`).toBeGreaterThanOrEqual(0)
        expect(box.y, `Panel top edge clipped at ${width}px`).toBeGreaterThanOrEqual(0)
        expect(
          box.x + box.width,
          `Panel right edge overflows viewport at ${width}px`,
        ).toBeLessThanOrEqual(width + 1)
        expect(
          box.y + box.height,
          `Panel bottom edge overflows viewport at ${width}px`,
        ).toBeLessThanOrEqual(height + 1)
        expect(box.width, `Panel too narrow at ${width}px`).toBeGreaterThanOrEqual(260)
      }

      // Close button visible and clickable (>=44px on mobile)
      const closeBtn = panel.getByRole('button', { name: 'Đóng thông báo' })
      await expect(closeBtn).toBeVisible()
      if (width < 768) {
        const closeBox = await closeBtn.boundingBox()
        expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44)
        expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44)
        // Mobile sheet should have aria-modal="true"
        await expect(panel).toHaveAttribute('aria-modal', 'true')
      }

      // Page must still have zero horizontal overflow with notification open
      const openOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(openOverflow, `Overflow while notification open at ${width}px`).toBeLessThanOrEqual(1)

      // Escape closes and returns focus to bell button
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await expect(bellBtn).toBeFocused()
    }
  })

  test('ADMIN-RESP-02: Exclusivity between notification panel, mobile sidebar, account menu, and click-to-navigate', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    // Desktop exclusivity: clicking account button while notification popover is open switches cleanly
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const desktopBell = page.getByRole('button', { name: 'Thông báo vận hành' })
    const desktopAccount = page.getByRole('button', { name: 'Menu tài khoản quản trị' })
    await desktopBell.click()
    await expect(page.locator('#admin-notification-panel')).toBeVisible()
    await desktopAccount.click()
    await expect(page.locator('#admin-notification-panel')).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Menu tài khoản quản trị' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Mobile exclusivity & backdrop close & click-to-navigate
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    const bellBtn = page.getByRole('button', { name: 'Thông báo vận hành' })
    const accountBtn = page.getByRole('button', { name: 'Menu tài khoản quản trị' })
    const menuBtn = page.getByRole('button', { name: 'Mở menu quản trị' })

    // Open notification -> clicking outside backdrop closes notification -> open account
    await bellBtn.click()
    await expect(page.locator('#admin-notification-panel')).toBeVisible()
    await page.mouse.click(20, 20)
    await expect(page.locator('#admin-notification-panel')).toBeHidden()

    await accountBtn.click()
    await expect(page.getByRole('dialog', { name: 'Tài khoản quản trị' })).toBeVisible()

    // Close account via close button
    await page.getByRole('button', { name: 'Đóng menu tài khoản' }).click()
    await expect(page.getByRole('dialog', { name: 'Tài khoản quản trị' })).toBeHidden()

    // Open mobile sidebar -> close sidebar -> open notification -> click link navigates cleanly
    await menuBtn.click()
    await expect(page.getByRole('button', { name: 'Đóng menu điều hướng' })).toBeVisible()
    await page.getByRole('button', { name: 'Đóng menu điều hướng' }).click()
    await expect(page.getByRole('button', { name: 'Đóng menu điều hướng' })).toBeHidden()

    await bellBtn.click()
    const notifPanel = page.locator('#admin-notification-panel')
    await expect(notifPanel).toBeVisible()

    // Body scroll is locked on mobile while bottom sheet is open, and restored after navigation/close
    const lockedOverflow = await page.evaluate(() => document.body.style.overflow)
    expect(lockedOverflow).toBe('hidden')

    await notifPanel.getByRole('link', { name: /Đơn thuê chờ xác nhận/ }).click()
    await expect(page).toHaveURL(/\/dashboard\/bookings\?status=PENDING/)
    await expect(notifPanel).toBeHidden()

    const restoredOverflow = await page.evaluate(() => document.body.style.overflow)
    expect(restoredOverflow).not.toBe('hidden')
  })

  test('ADMIN-RESP-03: Notification loading, error+retry, and empty states work cleanly', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.setViewportSize({ width: 390, height: 844 })

    let mode: 'error' | 'empty' | 'normal' = 'error'
    await page.route('**/nori-api/dashboard?summaryOnly=1', async (route) => {
      if (mode === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Lỗi tải dữ liệu giả lập' }),
        })
        return
      }
      if (mode === 'empty') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              statuses: { PENDING: 0 },
              fleetStats: { byOperationStatus: { MAINTENANCE: 0 }, expiredDepositCount: 0 },
              newInquiriesCount: 0,
            },
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const bellBtn = page.getByRole('button', { name: 'Thông báo vận hành' })
    await bellBtn.click()

    const panel = page.locator('#admin-notification-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('alert')).toBeVisible()

    // Switch to empty state and retry
    mode = 'empty'
    await panel.getByRole('button', { name: 'Thử tải lại thông báo' }).click()
    await expect(panel.getByText(/Chưa có cảnh báo tồn đọng/)).toBeVisible()

    // Close and clean up route
    await page.getByRole('button', { name: 'Đóng thông báo' }).click()
    await expect(panel).toBeHidden()
    await page.unroute('**/nori-api/dashboard?summaryOnly=1')
  })

  test('ADMIN-RESP-04: Key Admin routes have zero horizontal overflow across mobile and tablet viewports', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    const routes = [
      '/dashboard',
      '/dashboard/bookings',
      '/dashboard/vehicles',
      '/dashboard/models',
      '/dashboard/content',
      '/dashboard/promotions',
      '/dashboard/reports',
      '/dashboard/system',
    ]

    for (const width of [...MOBILE_VIEWPORTS, 768]) {
      await page.setViewportSize({ width, height: 844 })
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(300)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `Overflow at ${width}px on ${route}`).toBeLessThanOrEqual(1)
      }
    }
  })

  test('ADMIN-RESP-05: Admin header stays pinned at top and left sidebar has zero blank space when scrolling', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    // 1. Desktop (1440x900) — expanded and collapsed sidebar during deep vertical scroll
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Ensure page is tall enough to scroll significantly past 100vh
    await page.evaluate(() => {
      const filler = document.createElement('div')
      filler.id = 'e2e-scroll-filler'
      filler.style.height = '2200px'
      filler.style.pointerEvents = 'none'
      document.querySelector('main')?.appendChild(filler)
    })

    const topbar = page.getByTestId('admin-topbar')
    const sidebar = page.getByTestId('admin-desktop-sidebar')
    await expect(topbar).toBeVisible()
    await expect(sidebar).toBeVisible()

    const initialHeaderBox = await topbar.boundingBox()
    const initialSidebarBox = await sidebar.boundingBox()
    expect(initialHeaderBox).not.toBeNull()
    expect(initialSidebarBox).not.toBeNull()
    expect(Math.abs(initialHeaderBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(initialSidebarBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(initialSidebarBox!.height - 900)).toBeLessThanOrEqual(1)
    expect(Math.abs(initialHeaderBox!.x - initialSidebarBox!.width)).toBeLessThanOrEqual(1)

    // Scroll deep past viewport height (1200px > 900px)
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }))
    await page.waitForTimeout(150)

    const scrollY = await page.evaluate(() => window.scrollY)
    expect(scrollY).toBeGreaterThanOrEqual(1000)

    const scrolledHeaderBox = await topbar.boundingBox()
    const scrolledSidebarBox = await sidebar.boundingBox()
    expect(scrolledHeaderBox).not.toBeNull()
    expect(scrolledSidebarBox).not.toBeNull()

    // Header must remain pinned at y = 0
    expect(Math.abs(scrolledHeaderBox!.y)).toBeLessThanOrEqual(1)
    // Left sidebar must remain pinned from y = 0 to bottom = 900 (no white blank space on left)
    expect(Math.abs(scrolledSidebarBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(scrolledSidebarBox!.height - 900)).toBeLessThanOrEqual(1)

    // Verify pixel hit-testing along the left column (top, middle, bottom) hits dark sidebar, never white background
    const leftColumnBg = await page.evaluate(() => {
      const sampleYs = [36, 450, 860]
      return sampleYs.map((y) => {
        const el = document.elementFromPoint(24, y)
        const aside = el?.closest('aside')
        const bg = aside ? window.getComputedStyle(aside).backgroundColor : 'none'
        return { y, insideSidebar: Boolean(aside), bg }
      })
    })
    for (const sample of leftColumnBg) {
      expect(sample.insideSidebar, `Left column at y=${sample.y} missing sidebar`).toBe(true)
      expect(sample.bg).not.toBe('rgba(0, 0, 0, 0)')
      expect(sample.bg).not.toBe('rgb(255, 255, 255)')
    }

    // Collapse sidebar while scrolled and verify header left edge adapts cleanly
    await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click()
    await page.waitForTimeout(250)
    const collapsedHeaderBox = await topbar.boundingBox()
    const collapsedSidebarBox = await sidebar.boundingBox()
    expect(collapsedHeaderBox).not.toBeNull()
    expect(collapsedSidebarBox).not.toBeNull()
    expect(Math.abs(collapsedHeaderBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(collapsedSidebarBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(collapsedSidebarBox!.height - 900)).toBeLessThanOrEqual(1)
    expect(Math.abs(collapsedHeaderBox!.x - collapsedSidebarBox!.width)).toBeLessThanOrEqual(1)

    // 2. Mobile (375x812) — header stays pinned at y = 0 during vertical scroll
    await page.setViewportSize({ width: 375, height: 812 })
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
    await page.waitForTimeout(150)

    const mobileScrollY = await page.evaluate(() => window.scrollY)
    expect(mobileScrollY).toBeGreaterThanOrEqual(700)
    const mobileHeaderBox = await topbar.boundingBox()
    expect(mobileHeaderBox).not.toBeNull()
    expect(Math.abs(mobileHeaderBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(mobileHeaderBox!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(mobileHeaderBox!.width - 375)).toBeLessThanOrEqual(1)
  })
})
