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
  return { email, password }
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
})
