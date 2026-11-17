import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomBytes } from 'node:crypto'
import { addDays, businessToday } from '../../src/lib/rental-rules'

const publicRoutes = [
  '/',
  '/vehicles',
  '/vehicles/toyota-fortuner',
  '/vehicles/honda-pcx',
  '/vehicles/ford-ranger-raptor',
  '/about',
  '/support',
  '/login',
  '/register',
  '/account',
  '/my-bookings',
  '/checkout',
  '/dashboard',
  '/design-system',
]

for (const route of publicRoutes) {
  test(`public route renders without runtime errors: ${route}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(route, { waitUntil: 'networkidle' })
    expect(response?.status()).toBe(200)
    await expect(page.locator('main h1')).toHaveCount(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true)
    expect(errors).toEqual([])
    for (const image of await page.locator('main img:visible').all()) {
      await image.scrollIntoViewIfNeeded()
      await expect(image).toHaveJSProperty('complete', true)
      expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0)
    }
  })
}

test('hero carousel switches on explicit user action', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Xem thông điệp 2' }).click()
  await expect(page.locator('h1')).toContainText('Một lựa chọn.')
  await page.getByRole('button', { name: 'Xem thông điệp 3' }).click()
  await expect(page.locator('h1')).toContainText('Chạm ước mơ.')
})

test('mega menu is keyboard operable and dismissible', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Thuê xe', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#mega-rent')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
})

test('home search navigates with category and service', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Loại phương tiện', { exact: true }).selectOption('PICKUP')
  await page.getByRole('button', { name: 'Tìm xe phù hợp' }).click()
  await expect(page).toHaveURL(/type=PICKUP/)
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('article')).toContainText('Ford Ranger Raptor')
})

test('selected rental dates survive search and opening a vehicle detail', async ({ page }) => {
  const startDate = addDays(businessToday(), 2)
  const endDate = addDays(startDate, 3)
  await page.goto('/')
  await page.getByLabel('Loại phương tiện', { exact: true }).selectOption('CAR')
  await expect(page.getByLabel(/^Ngày nhận xe/)).toHaveAttribute('min', businessToday())
  await page.getByLabel(/^Ngày nhận xe/).fill(startDate)
  await page.getByLabel(/^Ngày trả xe/).fill(endDate)
  await page.getByRole('button', { name: 'Tìm xe phù hợp' }).click()
  await expect(page).toHaveURL(new RegExp(`/vehicles\\?.*startDate=${startDate}`))
  await expect(page.locator('article')).toHaveCount(1)
  const vehicle = page.getByRole('link', { name: 'Xem Toyota Fortuner', exact: true })
  await expect(vehicle).toHaveAttribute('href', new RegExp(`startDate=${startDate}`))
  await vehicle.click()
  await expect(page).toHaveURL(/\/vehicles\/toyota-fortuner\?/)
  await expect(page.getByLabel(/^Ngày nhận xe/)).toHaveValue(startDate)
  await expect(page.getByLabel(/^Ngày trả xe/)).toHaveValue(endDate)
  await expect(page.getByRole('button', { name: 'Kiểm tra lịch & giá' })).toBeDisabled()
  const back = page.getByRole('link', { name: 'Khám phá xe khác' })
  await expect(back).toHaveAttribute('href', new RegExp(`startDate=${startDate}`))
  await back.click()
  await expect(page).toHaveURL(new RegExp(`startDate=${startDate}`))
  await expect(page).toHaveURL(new RegExp(`endDate=${endDate}`))
})

test('catalogue search, empty state and reset are connected', async ({ page }) => {
  await page.goto('/vehicles')
  const search = page.getByRole('searchbox')
  await search.fill('Honda')
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('article')).toContainText('Honda PCX')
  await search.fill('no-vehicle-with-this-name')
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy xe phù hợp' })).toBeVisible()
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
  await expect(page.locator('article')).toHaveCount(3)
})

test('price filter excludes models with missing inventory price', async ({ page }) => {
  await page.goto('/vehicles')
  await page.getByLabel('Từ', { exact: true }).fill('100000')
  await expect(page.locator('article')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy xe phù hợp' })).toBeVisible()
})

test('catalogue category and brand filters affect results', async ({ page }) => {
  await page.goto('/vehicles?type=CAR')
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('article')).toContainText('Toyota Fortuner')
  await page.getByLabel('Thương hiệu', { exact: true }).selectOption('Honda')
  await expect(page.locator('article')).toHaveCount(0)
})

test('invalid category query degrades safely and list view changes layout', async ({ page }) => {
  await page.goto('/vehicles?type=unrecognized')
  await expect(page.locator('article')).toHaveCount(3)
  await page.getByRole('button', { name: 'Hiển thị dạng danh sách' }).click()
  await expect(page.getByRole('button', { name: 'Hiển thị dạng danh sách' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    await page
      .locator('article')
      .first()
      .evaluate((node) => getComputedStyle(node).display),
  ).toBe('grid')
  await page.getByRole('button', { name: 'Hiển thị dạng lưới' }).click()
  expect(
    await page
      .locator('article')
      .first()
      .evaluate((node) => getComputedStyle(node).display),
  ).toBe('block')
  await page.getByLabel('Sắp xếp theo', { exact: true }).selectOption('name')
  await expect(page.locator('article h3')).toHaveText([
    'Ford Ranger Raptor',
    'Honda PCX',
    'Toyota Fortuner',
  ])
})

test('detail distinguishes missing actual inventory and missing interior photography', async ({
  page,
}) => {
  await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Chưa công bố xe thực tế' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Kiểm tra lịch & giá' })).toBeDisabled()
  await page.getByRole('button', { name: 'Nội thất', exact: true }).click()
  await expect(page.getByText('Chưa cập nhật ảnh nội thất', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ngoại thất', exact: true }).click()
  await page.getByRole('button', { name: 'Xem ảnh lớn' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').locator('img')).toHaveJSProperty('complete', true)
  expect(
    await page
      .getByRole('dialog')
      .locator('img')
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Xem ảnh lớn' })).toBeFocused()
})

test('buy consultation gates private submission on app login', async ({ page }) => {
  await page.goto('/vehicles/honda-pcx?intent=buy', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Đăng ký tư vấn mua xe' }).click()
  await expect(page.getByRole('dialog')).toContainText('Đăng nhập để gửi')
  await page.getByRole('link', { name: 'Đăng nhập để tiếp tục' }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
})

test('missing slug renders native not-found and is not indexed', async ({ page }) => {
  const response = await page.goto('/vehicles/not-a-real-model')
  // Next documents 200 for already-streamed notFound responses, 404 otherwise.
  expect([200, 404]).toContain(response?.status())
  await expect(page.getByRole('heading', { name: 'Có vẻ bạn vừa đi lạc một chút.' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/)
})

test('unsigned cache notification is rejected', async ({ request }) => {
  const response = await request.post('/nori-api/revalidate', {
    data: { slugs: [], allDetails: true },
  })
  expect(response.status()).toBe(401)
})

test('anonymous callers cannot read private orders or submit inquiries', async ({ request }) => {
  expect((await request.get('/nori-api/bookings')).status()).toBe(401)
  expect(
    (
      await request.post('/nori-api/inquiries', { data: { model: 'unknown', phone: '0912345678' } })
    ).status(),
  ).toBe(401)
  expect((await request.get('/nori-api/dashboard')).status()).toBe(403)
})

test('signup rejects client-owned role and workflow fields', async ({ request }) => {
  const response = await request.post('/nori-api/auth/register', {
    data: {
      fullName: 'Kiểm thử',
      email: 'invalid@example.test',
      password: 'NotSaved123',
      confirmPassword: 'NotSaved123',
      role: 'ADMIN',
    },
  })
  expect(response.status()).toBe(400)
})

test('signup, profile save, inquiry, logout and login work using Payload', async ({ page }) => {
  const email = `nori-qa-${Date.now()}@example.test`
  const password = randomBytes(18).toString('base64url') + '9a'
  await page.goto('/register')
  await page.getByLabel(/^Họ và tên/).fill('Kiểm thử NORI')
  await page.getByLabel(/^Email/).fill(email)
  await page.getByLabel(/^Mật khẩu/).fill(password)
  await page.getByLabel(/^Xác nhận mật khẩu/).fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Tạo tài khoản NORI', exact: true }).click()
  await expect(page).toHaveURL('/account')
  await expect(page.getByRole('heading', { name: 'Thông tin cá nhân' })).toBeVisible()
  expect((await page.request.get('/nori-api/dashboard')).status()).toBe(403)
  expect((await page.request.get('/nori-api/bookings?page=1.5')).status()).toBe(400)
  await page.getByLabel(/^Họ và tên/).fill('Kiểm thử NORI cập nhật')
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Thông tin của bạn đã được cập nhật.' }),
  ).toBeVisible()
  await page.goto('/my-bookings')
  await expect(page.getByRole('heading', { name: 'Chưa có hành trình nào' })).toBeVisible()
  await page.goto('/vehicles/toyota-fortuner?intent=buy', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Đăng ký tư vấn mua xe' }).click()
  await page.getByLabel(/^Số điện thoại liên hệ/).fill('0000000000')
  await page
    .getByLabel('Bạn muốn NORI tư vấn điều gì?')
    .fill('BẢN GHI KIỂM THỬ TỰ ĐỘNG — không liên hệ, không phải khách mua thực tế.')
  await page.getByRole('button', { name: 'Gửi yêu cầu tư vấn' }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toContainText(
    'NORI đã tiếp nhận yêu cầu',
  )
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Yêu cầu tư vấn mua xe' })).toBeVisible()
  await expect(page.getByText('Toyota Fortuner', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL('/login')
  await page.getByLabel(/^Email/).fill(email)
  await page.getByLabel(/^Mật khẩu/).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL('/account')
  await expect(page.getByLabel(/^Họ và tên/)).toHaveValue('Kiểm thử NORI cập nhật')
})

test('shared controls expose loading, disabled and dialog focus states', async ({ page }) => {
  await page.goto('/design-system')
  await page.getByRole('button', { name: 'Kiểm tra loading' }).click()
  await expect(page.getByRole('button', { name: 'Đang tải trạng thái…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Đang tải trạng thái…' })).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(
    page.getByRole('status').filter({ hasText: 'Component đã trở về trạng thái thành công.' }),
  ).toBeVisible()
  const open = page.getByRole('button', { name: 'Mở hộp thoại', exact: true })
  await open.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(open).toBeFocused()
})

test('network errors retain login input and never announce success', async ({ page }) => {
  await page.route('**/nori-api/auth/login', (route) => route.abort('failed'))
  await page.goto('/login')
  await page.getByLabel(/^Email/).fill('nori-network-qa@example.test')
  await page.getByLabel(/^Mật khẩu/).fill('NotSent123')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Không thể kết nối' })).toBeVisible()
  await expect(page.getByLabel(/^Email/)).toHaveValue('nori-network-qa@example.test')
  await expect(page.getByLabel(/^Mật khẩu/)).toHaveValue('NotSent123')
  await expect(page).toHaveURL('/login')
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled()
})

test('long unbroken titles and card content fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/vehicles')
  await page.locator('h1').evaluate((node) => {
    node.textContent = 'NORI'.repeat(80)
  })
  await page
    .locator('article h3')
    .first()
    .evaluate((node) => {
      node.textContent = 'PhươngTiện'.repeat(40)
    })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true)
})

for (const route of [
  '/',
  '/vehicles',
  '/vehicles/toyota-fortuner',
  '/login',
  '/support',
  '/design-system',
]) {
  test(`WCAG automated scan: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}

test('mobile navigation and all principal views fit 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  for (const route of [
    '/',
    '/vehicles',
    '/vehicles/toyota-fortuner',
    '/login',
    '/register',
    '/account',
    '/checkout',
    '/support',
  ]) {
    await page.goto(route, { waitUntil: 'networkidle' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      route,
    ).toBe(true)
  }
  await page.goto('/')
  const how = page.getByRole('link', { name: 'Cách NORI hoạt động', exact: true })
  await how.scrollIntoViewIfNeeded()
  await expect(how).toBeInViewport()
  const howBox = await how.boundingBox()
  const searchBox = await page.getByRole('search', { name: 'Tìm phương tiện' }).boundingBox()
  const pagerBox = await page.getByRole('button', { name: 'Xem thông điệp 1' }).boundingBox()
  expect(howBox).not.toBeNull()
  expect(searchBox).not.toBeNull()
  expect(pagerBox).not.toBeNull()
  expect(howBox!.y + howBox!.height).toBeLessThan(pagerBox!.y)
  expect(pagerBox!.y + pagerBox!.height).toBeLessThan(searchBox!.y)
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click()
  await expect(page.locator('#mobile-menu')).toBeVisible()
  await page.locator('#mobile-menu').getByRole('link', { name: 'Thuê xe máy' }).click()
  await expect(page).toHaveURL(/type=MOTORBIKE/)
  await expect(page.locator('#mobile-menu')).not.toBeVisible()
})

test('reduced-motion preference disables nonessential motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const duration = await page
    .locator('.animate-enter')
    .first()
    .evaluate((node) => getComputedStyle(node).animationDuration)
  expect(parseFloat(duration)).toBeLessThan(0.01)
})
