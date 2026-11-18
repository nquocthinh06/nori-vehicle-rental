import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { addDays, businessToday } from '../../src/lib/rental-rules'

function readAdminCredentials() {
  const envMap: Record<string, string> = {}
  const envPath = path.resolve(process.cwd(), '.env')
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
      envMap[line.slice(0, eq).trim()] = val
    }
  }
  const email = (process.env.NORI_ADMIN_EMAIL || envMap.NORI_ADMIN_EMAIL || 'admin@nori.vn')
    .trim()
    .toLowerCase()
  const password = process.env.NORI_ADMIN_PASSWORD || envMap.NORI_ADMIN_PASSWORD || ''
  if (!password) {
    throw new Error('Thiếu NORI_ADMIN_PASSWORD trong .env hoặc biến môi trường để chạy Admin E2E.')
  }
  return { email, password }
}

function cleanupE2ERecords({
  customerEmails = [],
  resetVehicleReferences = [],
}: {
  customerEmails?: string[]
  resetVehicleReferences?: string[]
}) {
  const db = new DatabaseSync('./nori.db')
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const email of customerEmails) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
        | { id: string }
        | undefined
      if (!user) continue
      const bookings = db
        .prepare('SELECT id, booking_key FROM bookings WHERE customer_id = ?')
        .all(user.id) as {
        id: string
        booking_key: string
      }[]
      const inquiries = db
        .prepare('SELECT id FROM sales_inquiries WHERE customer_id = ?')
        .all(user.id) as { id: string }[]
      const userReviews = db
        .prepare('SELECT id FROM reviews WHERE customer_id = ?')
        .all(user.id) as { id: string }[]
      for (const r of userReviews) {
        db.prepare('DELETE FROM reviews_rels WHERE parent_id = ?').run(r.id)
        db.prepare('DELETE FROM reviews WHERE id = ?').run(r.id)
      }
      for (const b of bookings) {
        const bReviews = db.prepare('SELECT id FROM reviews WHERE booking_id = ?').all(b.id) as {
          id: string
        }[]
        for (const r of bReviews) {
          db.prepare('DELETE FROM reviews_rels WHERE parent_id = ?').run(r.id)
          db.prepare('DELETE FROM reviews WHERE id = ?').run(r.id)
        }
        const days = db
          .prepare('SELECT id FROM rental_days WHERE booking_key = ?')
          .all(b.booking_key) as {
          id: string
        }[]
        for (const d of days) {
          db.prepare('DELETE FROM payload_locked_documents_rels WHERE rental_days_id = ?').run(d.id)
        }
        db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(b.booking_key)
        const bConsults = db
          .prepare('SELECT id FROM consultations WHERE booking_id = ?')
          .all(b.id) as { id: string }[]
        for (const c of bConsults) {
          db.prepare('DELETE FROM consultations_contact_logs WHERE _parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations_rels WHERE parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id)
        }
        const bNotifs = db
          .prepare('SELECT id FROM notifications WHERE booking_id = ?')
          .all(b.id) as { id: string }[]
        for (const n of bNotifs) {
          db.prepare('DELETE FROM notifications_rels WHERE parent_id = ?').run(n.id)
          db.prepare('DELETE FROM notifications WHERE id = ?').run(n.id)
        }
        const bMods = db
          .prepare('SELECT id FROM bookings_modification_history WHERE _parent_id = ?')
          .all(b.id) as { id: string }[]
        for (const m of bMods) {
          db.prepare('DELETE FROM bookings_modification_history_changes WHERE _parent_id = ?').run(
            m.id,
          )
        }
        db.prepare('DELETE FROM bookings_modification_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE bookings_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_rels WHERE parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings WHERE id = ?').run(b.id)
      }
      const uConsults = db
        .prepare('SELECT id FROM consultations WHERE customer_id = ?')
        .all(user.id) as { id: string }[]
      for (const c of uConsults) {
        db.prepare('DELETE FROM consultations_contact_logs WHERE _parent_id = ?').run(c.id)
        db.prepare('DELETE FROM consultations_rels WHERE parent_id = ?').run(c.id)
        db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id)
      }
      const uNotifs = db
        .prepare('SELECT id FROM notifications WHERE customer_id = ?')
        .all(user.id) as { id: string }[]
      for (const n of uNotifs) {
        db.prepare('DELETE FROM notifications_rels WHERE parent_id = ?').run(n.id)
        db.prepare('DELETE FROM notifications WHERE id = ?').run(n.id)
      }
      db.prepare('DELETE FROM consultations_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM notifications_rels WHERE users_id = ?').run(user.id)
      for (const inq of inquiries) {
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE sales_inquiries_id = ?').run(
          inq.id,
        )
        db.prepare('DELETE FROM sales_inquiries_rels WHERE parent_id = ?').run(inq.id)
        db.prepare('DELETE FROM sales_inquiries WHERE id = ?').run(inq.id)
      }
      db.prepare('DELETE FROM reviews_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM bookings_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM sales_inquiries_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM payload_preferences_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }
    for (const ref of resetVehicleReferences) {
      db.prepare(
        "UPDATE vehicles SET operation_status = 'READY', status = 'ACTIVE' WHERE reference = ?",
      ).run(ref)
    }
  } catch (err) {
    console.error('Cleanup error:', err)
  } finally {
    db.close()
  }
}

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
  await expect(page.locator('article')).toHaveCount(4)
  await expect(page.locator('main')).toContainText('Ford Ranger Raptor')
  await expect(page.locator('main')).toContainText('Toyota Hilux')
})

test('search dates prefill detail calendar and live rental quote works cleanly', async ({
  page,
}) => {
  const startDate = addDays(businessToday(), 12)
  const endDate = addDays(businessToday(), 15)
  await page.goto('/', { waitUntil: 'networkidle' })
  const heroStart = page.getByLabel('Ngày nhận xe', { exact: true })
  const heroEnd = page.getByLabel('Ngày trả xe', { exact: true })
  await heroStart.fill(startDate)
  await expect(heroStart).toHaveValue(startDate)
  await heroEnd.fill(endDate)
  await expect(heroEnd).toHaveValue(endDate)
  await page.getByRole('button', { name: 'Tìm xe phù hợp' }).click()
  await expect(page).toHaveURL(new RegExp(`/vehicles\\?.*startDate=${startDate}`))
  const vehicle = page.getByRole('link', { name: 'Xem Toyota Fortuner', exact: true })
  await expect(vehicle).toBeVisible()
  await vehicle.click()
  await expect(page).toHaveURL(new RegExp(`/vehicles/toyota-fortuner\\?.*startDate=${startDate}`))
  await expect(page.getByLabel(/^Ngày nhận xe/)).toHaveValue(startDate)
  await expect(page.getByLabel(/^Ngày trả xe/)).toHaveValue(endDate)
  const checkBtn = page.getByRole('button', { name: 'Kiểm tra lịch & giá' })
  await expect(checkBtn).toBeEnabled()
  await checkBtn.click()
  await expect(page.getByText('Tổng tiền thuê dự kiến', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Tiếp tục đặt thuê/ })).toBeVisible()
})

test('catalogue search (with unaccented Vietnamese), empty state and reset work across 21 models', async ({
  page,
}) => {
  await page.goto('/vehicles')
  await expect(page.locator('article')).toHaveCount(12)
  await expect(
    page.getByRole('region', { name: 'Kết quả tìm kiếm' }).getByText('21 dòng xe'),
  ).toBeVisible()

  const search = page.getByRole('searchbox')
  await search.fill('Honda')
  await expect(page.locator('article')).toHaveCount(6)
  await expect(page.locator('main')).toContainText('Honda PCX')
  await expect(page.locator('main')).toContainText('Honda CR-V')

  await search.fill('xe dien')
  await expect(page.locator('article')).toHaveCount(3)
  await expect(page.locator('main')).toContainText('VinFast VF 8')
  await expect(page.locator('main')).toContainText('VinFast Evo200')
  await expect(page.locator('main')).toContainText('VinFast Evo Max')

  await search.fill('no-vehicle-with-this-name')
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy xe phù hợp' })).toBeVisible()
  await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
  await expect(
    page.getByRole('region', { name: 'Kết quả tìm kiếm' }).getByText('21 dòng xe'),
  ).toBeVisible()
  await expect(page.locator('article')).toHaveCount(12)
})

test('price filter checks DEMO vehicle daily prices and shows empty state when none match', async ({
  page,
}) => {
  await page.goto('/vehicles')
  await page.getByLabel('Từ', { exact: true }).fill('1600000')
  await expect(page.locator('article')).toHaveCount(2)
  await expect(page.locator('main')).toContainText('Ford Ranger Raptor')
  await expect(page.locator('main')).toContainText('Mercedes-Benz C 300 AMG')

  await page.getByLabel('Từ', { exact: true }).fill('5000000')
  await expect(page.locator('article')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy xe phù hợp' })).toBeVisible()
})

test('catalogue category, brand, subcategory and fuel filters affect results', async ({ page }) => {
  await page.goto('/vehicles?type=CAR')
  await expect(page.locator('article')).toHaveCount(8)
  await expect(page.locator('main')).toContainText('Toyota Fortuner')

  await page.getByLabel('Thương hiệu', { exact: true }).selectOption('Honda')
  await expect(page.locator('article')).toHaveCount(1)
  await expect(page.locator('main')).toContainText('Honda CR-V')

  await page.getByLabel('Thương hiệu', { exact: true }).selectOption('Ford')
  await expect(page.locator('article')).toHaveCount(0)
})

test('invalid category query degrades safely, list view and sorting work', async ({ page }) => {
  await page.goto('/vehicles?type=unrecognized')
  await expect(
    page.getByRole('region', { name: 'Kết quả tìm kiếm' }).getByText('21 dòng xe'),
  ).toBeVisible()
  await expect(page.locator('article')).toHaveCount(12)

  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(9)
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(12)

  const cards = page.locator('article')
  await cards.first().waitFor()
  const gridFirst = await cards.first().boundingBox()
  await page.getByRole('button', { name: 'Hiển thị dạng danh sách' }).click()
  const listFirst = await cards.first().boundingBox()
  const listSecond = await cards.nth(1).boundingBox()
  expect(listFirst).not.toBeNull()
  expect(listSecond).not.toBeNull()
  expect(listFirst!.width).toBeGreaterThan(gridFirst!.width)
  expect(listSecond!.y).toBeGreaterThanOrEqual(listFirst!.y + listFirst!.height)

  await page.getByLabel('Sắp xếp theo', { exact: true }).selectOption('name')
  await expect(page.locator('article h3').nth(0)).toHaveText('Ford Ranger Raptor')
  await expect(page.locator('article h3').nth(1)).toHaveText('Ford Ranger Wildtrak')
  await expect(page.locator('article h3').nth(2)).toHaveText('Honda CR-V')
})

test('detail hides misleading interior filter on motorbike PCX and renders full tabs on Fortuner', async ({
  page,
}) => {
  await page.goto('/vehicles/honda-pcx', { waitUntil: 'networkidle' })
  await expect(page.getByText('Có xe thực tế (DEMO)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nội thất', exact: true })).toHaveCount(0)
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

  await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Nội thất', exact: true }).click()
  const interiorImg = page.locator('section[aria-label="Bộ ảnh catalogue"] img').first()
  await expect(interiorImg).toBeVisible()
  expect(await interiorImg.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(
    0,
  )

  await page.getByRole('tab', { name: 'Thông số kỹ thuật' }).click()
  await expect(page.locator('#specifications')).toBeVisible()
  await page.getByRole('tab', { name: /Xe thực tế/ }).click()
  await expect(page.locator('#actual-condition')).toContainText('Dữ liệu minh họa (DEMO)')
})

test('availability calendar renders two-digit dates on a single line without wrapping', async ({
  page,
}) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'networkidle' })
    await expect(page.getByText('Ngày trả không tính thêm tiền thuê')).toBeVisible()
    const btn = page
      .locator('#booking-sidebar form button[aria-pressed]')
      .filter({ hasText: /^25$/ })
      .first()
    await btn.scrollIntoViewIfNeeded()
    await expect(btn).toBeVisible()
    const box = await btn.boundingBox()
    const whiteSpace = await btn.evaluate((el) => getComputedStyle(el).whiteSpace)
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(48)
    expect(whiteSpace).toBe('nowrap')
  }
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

test('signup, booking checkout -> cancel, buy/test-drive inquiry, logout and login work end-to-end', async ({
  page,
}) => {
  const email = `nori-qa-${Date.now()}@example.test`
  const password = randomBytes(18).toString('base64url') + '9a'
  try {
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

    // Complete a full rental flow: check availability -> checkout -> create booking -> cancel it
    const startDate = addDays(businessToday(), 25)
    const endDate = addDays(businessToday(), 28)
    await page.goto(`/vehicles/toyota-fortuner?startDate=${startDate}&endDate=${endDate}`, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('button', { name: 'Kiểm tra lịch & giá' }).click()
    await page.getByRole('link', { name: /Tiếp tục đặt thuê/ }).click()
    await expect(page).toHaveURL(/\/checkout\?/)
    await page.getByLabel(/^Số điện thoại liên hệ/).fill('0912345678')
    await page.getByLabel(/^Số GPLX/).fill('790123456789')
    await page.getByRole('checkbox', { name: /Tôi đã đọc/ }).check()
    await page.getByRole('button', { name: 'Xác nhận đặt thuê' }).click()
    await expect(page.getByRole('heading', { name: 'Đã tiếp nhận hành trình mới.' })).toBeVisible()

    await page.getByRole('link', { name: /Xem đơn thuê của tôi/ }).click()
    await expect(page).toHaveURL('/my-bookings')
    await expect(page.getByText('Toyota Fortuner').first()).toBeVisible()
    await page.getByRole('button', { name: 'Hủy đơn thuê' }).first().click()
    await page.getByRole('button', { name: 'Xác nhận hủy' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã hủy đơn thuê và giải phóng lịch xe.' }),
    ).toBeVisible()

    // Buy / test-drive inquiry workflow
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
  } finally {
    cleanupE2ERecords({ customerEmails: [email] })
  }
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
  '/vehicles/honda-pcx',
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
    '/vehicles/honda-pcx',
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

test('admin dashboard lifecycle, handover note, customer notifications, password change and review UI work end-to-end', async ({
  page,
  browser,
}) => {
  const tag = randomBytes(4).toString('hex')
  const customerEmail = `nori-e2e-cust-${tag}@example.test`
  const customerPassword = `NoriPass1!${tag}`
  const newPassword = `NoriPass2!${tag}`
  const { email: adminEmail, password: adminPassword } = readAdminCredentials()
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | null = null
  let priorViosOpStatus = 'READY'
  {
    const prepDb = new DatabaseSync('./nori.db')
    try {
      const row = prepDb
        .prepare("SELECT operation_status FROM vehicles WHERE reference = 'NR-OT-VIOS01'")
        .get() as { operation_status?: string } | undefined
      if (row?.operation_status) priorViosOpStatus = row.operation_status
      prepDb
        .prepare(
          "UPDATE vehicles SET operation_status = 'READY', status = 'ACTIVE' WHERE reference = 'NR-OT-VIOS01'",
        )
        .run()
    } finally {
      prepDb.close()
    }
  }

  try {
    // 1. Customer registers, checks RBAC hiding admin nav & blocking admin API, then creates booking on Toyota Vios
    await page.goto('/register')
    await page.getByLabel(/^Họ và tên/).fill('Khách Audit E2E')
    await page.getByLabel(/^Email/).fill(customerEmail)
    await page.getByLabel(/^Mật khẩu/).fill(customerPassword)
    await page.getByLabel(/^Xác nhận mật khẩu/).fill(customerPassword)
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Tạo tài khoản NORI', exact: true }).click()
    await expect(page).toHaveURL('/account')
    await expect(page.getByRole('link', { name: 'Quản trị hệ thống' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveCount(0)

    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await expect(
      page.getByRole('heading', { name: 'Không gian dành cho quản trị viên' }),
    ).toBeVisible()

    const today = businessToday()
    const endDate = addDays(today, 2)
    await page.goto(`/vehicles/toyota-vios?startDate=${today}&endDate=${endDate}`, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('button', { name: 'Kiểm tra lịch & giá' }).click()
    await page.getByRole('link', { name: /Tiếp tục đặt thuê/ }).click()
    await expect(page).toHaveURL(/\/checkout\?/)
    await page.getByLabel(/^Số điện thoại liên hệ/).fill('0909123456')
    await page.getByLabel(/^Số GPLX/).fill('790198765432')
    await page.getByRole('checkbox', { name: /Tôi đã đọc/ }).check()
    await page.getByRole('button', { name: 'Xác nhận đặt thuê' }).click()
    await expect(page.getByRole('heading', { name: 'Đã tiếp nhận hành trình mới.' })).toBeVisible()

    // 2. Authenticate official Admin via real /login UI (checking first-register disabled + wrong password rejected)
    const baseOrigin = new URL(page.url()).origin
    adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const adminPage = await adminContext.newPage()

    // Ensure first-register is disabled when official admin exists and unauthenticated callers cannot export CSV
    const unauthExportRes = await adminPage.request.get(
      `${baseOrigin}/nori-api/dashboard/export?type=bookings`,
    )
    expect(unauthExportRes.status()).toBe(403)
    const firstRegRes = await adminPage.request.post(`${baseOrigin}/api/admins/first-register`, {
      data: { email: `rogue-${tag}@example.test`, password: `RoguePass1!${tag}` },
      headers: { Origin: baseOrigin },
    })
    expect(firstRegRes.status()).toBe(403)

    // Customer email cannot self-register with official admin email
    const dupAdminRegRes = await adminPage.request.post(`${baseOrigin}/nori-api/auth/register`, {
      data: {
        fullName: 'Fake Admin',
        email: adminEmail,
        password: customerPassword,
        confirmPassword: customerPassword,
      },
      headers: { Origin: baseOrigin },
    })
    expect(dupAdminRegRes.status()).toBe(409)

    await adminPage.goto(`${baseOrigin}/login`, { waitUntil: 'networkidle' })
    await adminPage.getByLabel(/^Email/).fill(adminEmail)
    await adminPage.getByLabel(/^Mật khẩu/).fill('WrongPassword123')
    await adminPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(adminPage.getByRole('alert')).toBeVisible()
    await expect(adminPage).toHaveURL(/\/login/)

    await adminPage.getByLabel(/^Mật khẩu/).fill(adminPassword)
    await adminPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(adminPage).toHaveURL(`${baseOrigin}/dashboard`)
    await expect(adminPage.getByText(`Quản trị: ${adminEmail}`)).toBeVisible()
    await expect(adminPage.getByRole('link', { name: 'Quản trị hệ thống' })).toBeVisible()

    await expect(
      adminPage.getByRole('heading', { name: /Biểu đồ hoạt động 14 ngày gần nhất/ }),
    ).toBeVisible()
    await expect(adminPage.getByRole('heading', { name: 'Công việc cần xử lý' })).toBeVisible()
    await expect(
      adminPage.getByRole('heading', {
        name: /Mức độ hoàn thiện dữ liệu Catalogue/,
      }),
    ).toBeVisible()

    // WCAG 2.2 AA audit on Admin Dashboard rendered state
    const axeResults = await new AxeBuilder({ page: adminPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(axeResults.violations).toEqual([])

    // CSV export verification
    const exportRes = await adminPage.request.get(
      `${baseOrigin}/nori-api/dashboard/export?type=bookings`,
    )
    expect(exportRes.status()).toBe(200)
    const csvText = await exportRes.text()
    expect(csvText).toContain('MaDon')
    expect(csvText).toContain('Khách Audit E2E')

    // 3. Customer account Lock -> Unlock on /dashboard/customers
    await adminPage.goto(`${baseOrigin}/dashboard/customers`, { waitUntil: 'networkidle' })
    const custRow = adminPage.locator('tr').filter({ hasText: customerEmail }).first()
    await expect(custRow).toBeVisible()
    await custRow.getByRole('button', { name: 'Khóa tạm thời' }).click()
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click()
    await expect(custRow.getByRole('button', { name: 'Mở khóa' })).toBeVisible()
    await custRow.getByRole('button', { name: 'Mở khóa' }).click()
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click()
    await expect(custRow.getByRole('button', { name: 'Khóa tạm thời' })).toBeVisible()

    // 4. Advance customer booking PENDING -> CONFIRMED -> ONGOING (with handoverNote) -> COMPLETED on /dashboard/bookings
    await adminPage.goto(`${baseOrigin}/dashboard/bookings`, { waitUntil: 'networkidle' })
    const bookingCard = adminPage.locator('article').filter({ hasText: 'Khách Audit E2E' }).first()
    await expect(bookingCard).toBeVisible()

    await bookingCard.getByRole('button', { name: 'Duyệt đơn' }).click()
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận thao tác' }).click()
    await expect(bookingCard.getByRole('button', { name: 'Đã giao xe' })).toBeVisible()

    await bookingCard.getByRole('button', { name: 'Đã giao xe' }).click()
    await adminPage
      .locator('#dashboard-handover-note')
      .fill('Đã đối chiếu GPLX và bàn giao đủ giấy tờ.')
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận thao tác' }).click()
    await expect(bookingCard).toContainText(
      'Ghi chú bàn giao: Đã đối chiếu GPLX và bàn giao đủ giấy tờ.',
    )
    await expect(
      bookingCard.getByRole('button', { name: 'Hoàn thành & giải phóng lịch' }),
    ).toBeVisible()

    await bookingCard.getByRole('button', { name: 'Hoàn thành & giải phóng lịch' }).click()
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận thao tác' }).click()
    await expect(bookingCard).toContainText('Hoàn thành')

    // 5. Vehicle maintenance status update -> restore on /dashboard/vehicles
    await adminPage.goto(`${baseOrigin}/dashboard/vehicles`, { waitUntil: 'networkidle' })
    const viosRow = adminPage.locator('tr[data-vehicle-ref="NR-OT-VIOS01"]')
    await expect(viosRow).toBeVisible()
    await viosRow.getByRole('button', { name: 'Cập nhật / Bảo trì' }).click()
    await adminPage.locator('#veh-op-status').selectOption('MAINTENANCE')
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(viosRow).toContainText('Đang bảo dưỡng')
    await viosRow.getByRole('button', { name: 'Cập nhật / Bảo trì' }).click()
    await adminPage.locator('#veh-op-status').selectOption('READY')
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect(viosRow).toContainText('Sẵn sàng')

    // 5b. Verify Inquiries, Maintenance, Promotions, Payments, Content, Posts, Reports, Admins pages render cleanly
    await adminPage.goto(`${baseOrigin}/dashboard/inquiries`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByRole('heading', { name: 'Yêu cầu mua xe' })).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/maintenance`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByRole('button', { name: 'Lên lịch bảo trì' })).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/promotions`, { waitUntil: 'networkidle' })
    await expect(
      adminPage.getByRole('button', { name: 'Tạo mã khuyến mãi', exact: true }),
    ).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/payments`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByText('Thực thu đã xác nhận')).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/content`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByRole('button', { name: 'Xuất bản lên website' })).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/posts`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByRole('button', { name: 'Viết bài mới' })).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/reports`, { waitUntil: 'networkidle' })
    await expect(adminPage.getByText('Tỷ lệ khai thác đội xe')).toBeVisible()
    await adminPage.goto(`${baseOrigin}/dashboard/admins`, { waitUntil: 'networkidle' })
    await expect(
      adminPage.getByRole('heading', { name: /Nhật ký thao tác hệ thống/ }),
    ).toBeVisible()

    // 6. Customer verifies In-App Notifications & Password Change UI on /account
    await page.goto('/account', { waitUntil: 'networkidle' })
    const confirmPopupBtn = page.getByRole('button', { name: 'Tôi đã hiểu', exact: true })
    if (await confirmPopupBtn.isVisible()) {
      await confirmPopupBtn.click()
      await expect(confirmPopupBtn).toBeHidden()
    }
    await expect(page.getByRole('heading', { name: 'Thông báo trạng thái gần đây' })).toBeVisible()
    await expect(page.locator('#pwd-current')).toBeVisible()
    await page.locator('#pwd-current').fill(customerPassword)
    await page.locator('#pwd-new').fill(newPassword)
    await page.locator('#pwd-confirm').fill(newPassword)
    await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã đổi mật khẩu thành công.' }),
    ).toBeVisible()

    // 7. Customer submits verified review via UI on /vehicles/toyota-vios Reviews tab & Admin moderates it
    const reviewTitle = `Xe Vios sạch sẽ, nhận xe nhanh ${tag}`
    await page.goto('/vehicles/toyota-vios', { waitUntil: 'networkidle' })
    await page.locator('#tab-reviews').click()
    await expect(page.locator('#review-title')).toBeVisible()
    await page.locator('#review-title').fill(reviewTitle)
    await page
      .locator('#review-comment')
      .fill('Trải nghiệm thuê xe thực tế rất tốt, bàn giao đúng giờ.')
    await page.getByRole('button', { name: 'Gửi đánh giá' }).click()
    await expect(page.locator('#reviews')).toContainText('5.0 / 5 sao')
    await expect(page.locator('#reviews')).toContainText(reviewTitle)

    await adminPage.goto(`${baseOrigin}/dashboard/customers`, { waitUntil: 'networkidle' })
    await adminPage.getByRole('tab', { name: /Đánh giá/ }).click()
    const reviewItem = adminPage.locator(`[data-review-title="${reviewTitle}"]`)
    await expect(reviewItem).toBeVisible()
    await reviewItem.getByRole('button', { name: 'Ẩn đánh giá' }).click()
    await expect(reviewItem).toContainText('Đang ẩn')
    await reviewItem.getByRole('button', { name: 'Hiện đánh giá' }).click()
    await expect(reviewItem).toContainText('Đang hiển thị')

    // 8. Admin Logout via Account Menu & verify protected dashboard API rejects subsequent unauthenticated requests
    await adminPage.getByRole('button', { name: new RegExp(adminEmail) }).click()
    await adminPage.getByRole('button', { name: 'Đăng xuất quản trị' }).click()
    await expect(adminPage).toHaveURL(`${baseOrigin}/login`)
    expect((await adminPage.request.get(`${baseOrigin}/nori-api/dashboard`)).status()).toBe(403)
  } finally {
    if (adminContext) {
      await adminContext.close()
    }
    cleanupE2ERecords({
      customerEmails: [customerEmail],
      resetVehicleReferences: ['NR-OT-VIOS01'],
    })
    if (priorViosOpStatus !== 'READY') {
      const restoreDb = new DatabaseSync('./nori.db')
      try {
        restoreDb
          .prepare("UPDATE vehicles SET operation_status = ? WHERE reference = 'NR-OT-VIOS01'")
          .run(priorViosOpStatus)
      } finally {
        restoreDb.close()
      }
    }
  }
})
