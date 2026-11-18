import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('NORI Mobile WebKit & Safari Mobile Journeys', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  })

  test('Mobile Journey 1: Search, Bottom Sheet filters, and active filter chips on mobile viewport', async ({
    page,
  }) => {
    // 1. Home Search
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const locationSelect = page.locator('#hero-location')
    await expect(locationSelect).toBeVisible()
    const options = await locationSelect.locator('option').allTextContents()
    if (options.length > 1) {
      await locationSelect.selectOption({ index: 1 })
    }
    await page.getByRole('button', { name: /Tìm xe phù hợp/ }).click()
    await expect(page).toHaveURL(/\/vehicles/)

    // 2. Open Mobile Filter Bottom Sheet
    const filterBtn = page.getByRole('button', { name: /Bộ lọc/ })
    await filterBtn.click()

    const closeBtn = page.getByRole('button', { name: 'Đóng bộ lọc' })
    await expect(closeBtn).toBeVisible()

    // Select 'Ô tô' category in bottom sheet
    await page.getByRole('button', { name: /Ô tô/ }).click()
    await page.getByRole('button', { name: /Xem \d+ kết quả/ }).click()
    await expect(closeBtn).toBeHidden()
    await expect(page).toHaveURL(/type=CAR/)

    // 3. Verify Active Chips
    const chipsRegion = page.getByLabel('Bộ lọc đang áp dụng')
    await expect(chipsRegion).toBeVisible()
    await expect(chipsRegion.getByText('Loại: Ô tô')).toBeVisible()

    // Remove filter chip
    await chipsRegion.getByRole('button', { name: /Xóa tất cả/i }).click()
    await expect(chipsRegion).toBeHidden()
  })

  test('Mobile Journey 2: Vehicle Detail gallery, specs, quote calculator, and sticky booking bar', async ({
    page,
  }) => {
    await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'domcontentloaded' })

    // Check Mobile Sticky Action Bar
    const mobileBar = page.locator('.fixed.inset-x-0.bottom-0.lg\\:hidden')
    await expect(mobileBar).toBeVisible()
    await expect(mobileBar.getByText(/Giá thuê \/ ngày/)).toBeVisible()

    // Test tab navigation on mobile
    const specsTab = page.getByRole('tab', { name: /Thông số kỹ thuật/i })
    await expect(specsTab).toBeVisible()
    await specsTab.click()
    await expect(specsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#specifications')).toBeVisible()

    // Test overview tab
    const overviewTab = page.getByRole('tab', { name: /Tổng quan/i })
    await overviewTab.click()
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true')
  })

  test('Mobile Journey 3: Test drive & purchase inquiry modal submission on mobile', async ({
    page,
  }) => {
    const custEmail = `mobile_usr_${Date.now()}@nori.vn`
    const origin = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
    const authHeaders = { origin, referer: `${origin}/` }

    // Register test mobile user
    await page.request.post('/nori-api/auth/register', {
      headers: authHeaders,
      data: {
        fullName: 'Nguyễn Văn Mobile',
        email: custEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '0912345678',
      },
    })

    await page.goto('/vehicles/toyota-fortuner?intent=buy', { waitUntil: 'domcontentloaded' })

    // Open consultation modal
    const consultBtn = page.getByRole('button', { name: /Đăng ký tư vấn mua xe/i })
    await expect(consultBtn).toBeVisible()
    await consultBtn.click()

    // Dialog should open
    const dialog = page.getByRole('dialog', { name: /Tư vấn mua xe/i })
    await expect(dialog).toBeVisible()

    // Verify consultation dialog form for authenticated customer
    const submitBtn = dialog.getByRole('button', { name: /Gửi yêu cầu/i })
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()

    // Confirmation appears
    await expect(dialog.getByText(/NORI đã tiếp nhận yêu cầu/i)).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole('link', { name: /Đến tài khoản của tôi/i })).toBeVisible()

    // Close dialog
    await dialog.getByRole('button', { name: /Đóng hộp thoại/i }).click()
    await expect(dialog).toBeHidden()
  })

  test('Mobile Journey 4: Favorites lifecycle and Mobile Bottom Navigation', async ({ page }) => {
    await page.goto('/vehicles', { waitUntil: 'domcontentloaded' })

    const bottomNav = page.getByRole('navigation', { name: 'Điều hướng nhanh trên di động' })
    await expect(bottomNav).toBeVisible()

    // Favorite first vehicle
    const favButton = page.locator('button[aria-label*="yêu thích"]').first()
    await favButton.click()
    await expect(favButton).toHaveAttribute('aria-pressed', 'true')

    // Navigate to /favorites using bottom nav
    await bottomNav.getByRole('link', { name: /Yêu thích/i }).click()
    await expect(page).toHaveURL(/\/favorites/)
    await expect(page.getByText(/Đã lưu 1 dòng xe/i)).toBeVisible()

    // Clean up favorites
    await page.getByRole('button', { name: /Xóa tất cả/i }).click()
    await expect(page.getByText('Chưa có phương tiện yêu thích')).toBeVisible()
  })

  test('Mobile Journey 5: Mobile Offline fallback and WCAG 2.2 AA accessibility', async ({
    page,
  }) => {
    await page.goto('/offline', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Không có kết nối Internet' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Thử kết nối lại/i })).toBeVisible()

    // WCAG 2.2 AA audit
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('Mobile Journey 6: Mobile Safari / WebKit Login, app-session cookie persistence, Checkout, and My Bookings', async ({
    page,
    context,
  }) => {
    const custEmail = `webkit_rent_${Date.now()}@nori.vn`
    const origin = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
    const authHeaders = { origin, referer: `${origin}/` }

    // 1. Register via UI on mobile WebKit
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await page.fill('#auth-name', 'Nguyễn Safari Mobile')
    await page.fill('#auth-email', custEmail)
    await page.fill('#auth-phone', '0938112233')
    await page.fill('#auth-password', 'Password123!')
    await page.fill('#auth-confirm', 'Password123!')
    await page.check('#auth-terms')
    await page.getByRole('button', { name: /Tạo tài khoản NORI/i }).click()
    await expect(page).toHaveURL(/\/account/)

    // 2. Verify app-session cookie in WebKit jar
    const cookies = await context.cookies()
    const appSession = cookies.find((c) => c.name === 'app-session')
    expect(appSession).toBeDefined()
    expect(appSession?.httpOnly).toBe(true)
    expect(appSession?.path).toBe('/')

    // 3. Pick an available rent vehicle and complete Checkout on Mobile WebKit
    const fleetRes = await page.request.get('/nori-api/fleet?modelSlug=toyota-fortuner', {
      headers: authHeaders,
    })
    expect(fleetRes.status()).toBe(200)
    const fleetJson = await fleetRes.json()
    const rentVehicle = (
      fleetJson.data as Array<{
        id: string
        intent: string
        pricePerDay?: number | null
      }>
    ).find((v) => v.intent !== 'SALE' && Boolean(v.pricePerDay))
    expect(rentVehicle).toBeDefined()

    // Find a free 2-day future window
    let chosenStart = ''
    let chosenEnd = ''
    const base = new Date()
    base.setUTCDate(base.getUTCDate() + 45)
    for (let offset = 0; offset < 30; offset += 3) {
      const s = new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
      const e = new Date(base.getTime() + (offset + 2) * 86_400_000).toISOString().slice(0, 10)
      const qRes = await page.request.get(
        `/nori-api/availability?vehicle=${encodeURIComponent(rentVehicle!.id)}&startDate=${s}&endDate=${e}`,
      )
      const qJson = await qRes.json()
      if (qJson.success && qJson.data?.available) {
        chosenStart = s
        chosenEnd = e
        break
      }
    }
    expect(chosenStart).toBeTruthy()

    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(rentVehicle!.id)}&startDate=${chosenStart}&endDate=${chosenEnd}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('Nguyễn Safari Mobile')).toBeVisible()
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)

    await page.check('#checkout-terms')
    const createPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    const createRes = await createPromise
    expect(createRes.status()).toBe(201)

    await expect(page.getByRole('heading', { name: /Đã tiếp nhận hành trình mới/i })).toBeVisible()
    await page.getByRole('link', { name: /Xem đơn thuê của tôi/i }).click()
    await expect(page).toHaveURL(/\/my-bookings/)
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)
    await expect(page.getByText(/1 đơn thuê/)).toBeVisible()
  })
})
