import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { addDays, businessToday } from '../../src/lib/rental-rules'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

function getDbPath(): string {
  const envPath =
    process.env.NORI_SQLITE_PATH?.trim() || process.env.DATABASE_URI?.replace(/^file:/, '').trim()
  const resolved = envPath
    ? path.resolve(envPath)
    : fs.existsSync(path.resolve('.next/standalone/nori.db'))
      ? path.resolve('.next/standalone/nori.db')
      : path.resolve('nori.db')
  if (resolved === path.resolve('nori.db') && process.env.NORI_ALLOW_LIVE_DB_TEST !== '1') {
    throw new Error(
      '[SAFEGUARD] Refusing E2E access to live ./nori.db without NORI_ALLOW_LIVE_DB_TEST=1.',
    )
  }
  return resolved
}

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

const trackedEmails = new Set<string>()
const trackedPromoCodes = new Set<string>()

function uniqueCustomerEmail(tag: string) {
  const email = `nori-auth-${tag}-${randomBytes(4).toString('hex')}@example.test`
  trackedEmails.add(email)
  return email
}

async function pickAvailableRentVehicleAndWindow(
  request: APIRequestContext,
  preferredOffsetStart = 35,
): Promise<{
  vehicleId: string
  modelId: string
  modelSlug: string
  modelName: string
  reference: string
  startDate: string
  endDate: string
  estimatedTotal: number
}> {
  const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
  expect(fleetRes.status()).toBe(200)
  const fleetJson = await fleetRes.json()
  const candidates = (
    fleetJson.data as Array<{
      id: string
      modelId: string
      modelSlug: string
      modelName: string
      reference: string
      intent: string
      pricePerDay?: number | null
    }>
  ).filter((v) => v.intent !== 'SALE' && Boolean(v.pricePerDay))
  expect(candidates.length).toBeGreaterThan(0)

  const today = businessToday()
  for (const v of candidates) {
    for (let offset = preferredOffsetStart; offset < preferredOffsetStart + 65; offset += 3) {
      const s = addDays(today, offset)
      const e = addDays(today, offset + 2)
      const qRes = await request.get(
        `${ORIGIN}/nori-api/availability?vehicle=${encodeURIComponent(v.id)}&startDate=${s}&endDate=${e}`,
      )
      if (qRes.status() !== 200) continue
      const qJson = await qRes.json()
      if (qJson.success && qJson.data?.available) {
        return {
          vehicleId: v.id,
          modelId: v.modelId,
          modelSlug: v.modelSlug,
          modelName: v.modelName,
          reference: v.reference,
          startDate: s,
          endDate: e,
          estimatedTotal: qJson.data.estimatedTotal,
        }
      }
    }
  }
  throw new Error('Could not find an available 2-day rental window for auth regression test.')
}

function cleanupAuthTestData() {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const email of trackedEmails) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as
        | { id: string }
        | undefined
      if (!user) continue

      // Reviews (no payload_locked_documents_rels column for reviews in this schema)
      const revRows = db.prepare('SELECT id FROM reviews WHERE customer_id = ?').all(user.id) as {
        id: string
      }[]
      for (const r of revRows) {
        db.prepare('DELETE FROM reviews WHERE id = ?').run(r.id)
      }

      // Bookings & linked records
      const bookings = db
        .prepare('SELECT id, booking_key FROM bookings WHERE customer_id = ?')
        .all(user.id) as { id: string; booking_key: string }[]
      for (const b of bookings) {
        db.prepare(
          'DELETE FROM payments_rels WHERE parent_id IN (SELECT id FROM payments WHERE booking_id = ?)',
        ).run(b.id)
        db.prepare(
          'DELETE FROM payload_locked_documents_rels WHERE payments_id IN (SELECT id FROM payments WHERE booking_id = ?)',
        ).run(b.id)
        db.prepare('DELETE FROM payments WHERE booking_id = ?').run(b.id)

        db.prepare(
          'DELETE FROM rental_days_rels WHERE parent_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(b.booking_key)
        db.prepare(
          'DELETE FROM payload_locked_documents_rels WHERE rental_days_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(b.booking_key)
        db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(b.booking_key)

        const cRows = db.prepare('SELECT id FROM consultations WHERE booking_id = ?').all(b.id) as {
          id: string
        }[]
        for (const c of cRows) {
          db.prepare('DELETE FROM consultations_contact_logs WHERE _parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations_rels WHERE parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id)
        }

        const nRows = db.prepare('SELECT id FROM notifications WHERE booking_id = ?').all(b.id) as {
          id: string
        }[]
        for (const n of nRows) {
          // notifications_rels has admins_id and users_id cols only; no notifications_id in payload_locked_documents_rels
          db.prepare('DELETE FROM notifications_rels WHERE parent_id = ?').run(n.id)
          db.prepare('DELETE FROM notifications WHERE id = ?').run(n.id)
        }

        const mRows = db
          .prepare('SELECT id FROM bookings_modification_history WHERE _parent_id = ?')
          .all(b.id) as { id: string }[]
        for (const m of mRows) {
          db.prepare('DELETE FROM bookings_modification_history_changes WHERE _parent_id = ?').run(
            m.id,
          )
        }
        db.prepare('DELETE FROM bookings_modification_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_rels WHERE parent_id = ?').run(b.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE bookings_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings WHERE id = ?').run(b.id)
      }

      db.prepare('DELETE FROM bookings_rels WHERE users_id = ?').run(user.id)
      db.prepare(
        'DELETE FROM notifications_rels WHERE users_id = ? OR parent_id IN (SELECT id FROM notifications WHERE customer_id = ?)',
      ).run(user.id, user.id)
      db.prepare('DELETE FROM notifications WHERE customer_id = ?').run(user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(user.id)
      db.prepare(
        'DELETE FROM audit_logs_rels WHERE users_id = ? OR parent_id IN (SELECT id FROM audit_logs WHERE actor_id = ? OR entity_id = ?)',
      ).run(user.id, user.id, user.id)
      db.prepare('DELETE FROM audit_logs WHERE actor_id = ? OR entity_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }

    for (const code of trackedPromoCodes) {
      const promo = db.prepare('SELECT id FROM promotions WHERE code = ?').get(code) as
        | { id: string }
        | undefined
      if (!promo) continue
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE promotions_id = ?').run(promo.id)
      db.prepare('DELETE FROM audit_logs WHERE entity_id = ?').run(promo.id)
      db.prepare('DELETE FROM promotions WHERE id = ?').run(promo.id)
    }
  } finally {
    db.close()
  }
}

test.describe('NORI Authentication, Session, Cookie, Authorization & Booking Lifecycle Regression', () => {
  test.afterAll(() => {
    cleanupAuthTestData()
  })

  test('API Integration Suite (Sections 19, 23, 27): Login Set-Cookie, /auth/me, /bookings 200/201, Logout cookie + DB session revocation, 401 vs 403', async ({
    playwright,
  }) => {
    const anonReq = await playwright.request.newContext({ baseURL: ORIGIN })
    const custReq = await playwright.request.newContext({ baseURL: ORIGIN })
    const adminReq = await playwright.request.newContext({ baseURL: ORIGIN })

    try {
      const email = uniqueCustomerEmail('api')
      const password = 'Password123!'

      // 1. Anonymous callers receive semantic 401 + private, no-store cache headers
      const anonMe = await anonReq.get('/nori-api/auth/me')
      expect(anonMe.status()).toBe(200)
      expect((await anonMe.json()).data).toBeNull()
      expect(anonMe.headers()['cache-control']).toContain('no-store')
      expect(anonMe.headers()['cache-control']).toContain('private')

      const anonBookings = await anonReq.get('/nori-api/bookings')
      expect(anonBookings.status()).toBe(401)
      expect((await anonBookings.json()).error.code).toBe('UNAUTHORIZED')

      const anonCreateBooking = await anonReq.post('/nori-api/bookings', {
        headers: AUTH_HEADERS,
        data: { vehicle: 'x', startDate: '2026-12-10', endDate: '2026-12-12' },
      })
      expect(anonCreateBooking.status()).toBe(401)

      // 2. Register Customer, then Logout, then test explicit POST /auth/login
      const regRes = await custReq.post('/nori-api/auth/register', {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách API Tích Hợp',
          email,
          phone: '0901223344',
          password,
          confirmPassword: password,
        },
      })
      expect(regRes.status()).toBe(201)
      await custReq.post('/nori-api/auth/logout', { headers: AUTH_HEADERS })

      // 3. POST /auth/login -> 200 + Set-Cookie: app-session
      const loginRes = await custReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email, password },
      })
      expect(loginRes.status()).toBe(200)
      const setCookieHeaders = loginRes
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
      const appSessionHeader = setCookieHeaders.find((v) => v.startsWith('app-session='))
      expect(appSessionHeader).toBeDefined()
      expect(appSessionHeader).toMatch(/HttpOnly/i)
      expect(appSessionHeader).toMatch(/Path=\//i)
      expect(appSessionHeader).toMatch(/SameSite=lax/i)
      expect(appSessionHeader).toMatch(/Max-Age=604800/i)

      const capturedTokenPair = appSessionHeader!.split(';')[0]

      // 4. GET /auth/me -> 200 CUSTOMER
      const meRes = await custReq.get('/nori-api/auth/me')
      expect(meRes.status()).toBe(200)
      const meJson = await meRes.json()
      expect(meJson.data.email).toBe(email)
      expect(meJson.data.role).toBe('CUSTOMER')
      expect(meJson.data.isAdmin).toBe(false)

      // 5. GET /bookings -> 200 + POST /bookings -> 201
      const slot = await pickAvailableRentVehicleAndWindow(custReq, 20)
      const postBookingRes = await custReq.post('/nori-api/bookings', {
        headers: AUTH_HEADERS,
        data: {
          vehicle: slot.vehicleId,
          startDate: slot.startDate,
          endDate: slot.endDate,
          pickupTime: '08:00',
          returnTime: '20:00',
          customerPhone: '0901223344',
          expectedTotalPrice: slot.estimatedTotal,
        },
      })
      expect(postBookingRes.status()).toBe(201)
      const createdBooking = (await postBookingRes.json()).data

      const listBookingsRes = await custReq.get('/nori-api/bookings')
      expect(listBookingsRes.status()).toBe(200)
      const listJson = await listBookingsRes.json()
      expect(listJson.data.docs.some((b: { id: string }) => b.id === createdBooking.id)).toBe(true)

      // 6. Admin logged in receives semantic 403 ADMIN_ROLE_FORBIDDEN on Customer endpoints (never 401!)
      const adminCreds = getAdminCredentials()
      const adminLoginRes = await adminReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email: adminCreds.email, password: adminCreds.password },
      })
      expect(adminLoginRes.status()).toBe(200)

      for (const check of [
        await adminReq.get('/nori-api/bookings'),
        await adminReq.post('/nori-api/bookings', {
          headers: AUTH_HEADERS,
          data: {
            vehicle: slot.vehicleId,
            startDate: slot.startDate,
            endDate: slot.endDate,
          },
        }),
        await adminReq.put('/nori-api/bookings', {
          headers: AUTH_HEADERS,
          data: { id: createdBooking.id },
        }),
        await adminReq.patch('/nori-api/bookings', {
          headers: AUTH_HEADERS,
          data: { id: createdBooking.id },
        }),
        await adminReq.get('/nori-api/notifications'),
        await adminReq.get('/nori-api/inquiries'),
        await adminReq.patch('/nori-api/auth/me', {
          headers: AUTH_HEADERS,
          data: { fullName: 'Admin Test', phone: '0901223344' },
        }),
      ]) {
        expect(check.status()).toBe(403)
        const errJson = await check.json()
        expect(errJson.error.code).toBe('ADMIN_ROLE_FORBIDDEN')
        expect(errJson.error.message).toMatch(/tài khoản quản trị/i)
      }

      // 7. POST /auth/logout -> 200 + clears cookie + revokes DB session (`_sid`)
      const logoutRes = await custReq.post('/nori-api/auth/logout', { headers: AUTH_HEADERS })
      expect(logoutRes.status()).toBe(200)
      const logoutCookies = logoutRes
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
      expect(logoutCookies.some((v) => v.startsWith('app-session=;') && /Max-Age=0/i.test(v))).toBe(
        true,
      )

      const afterLogoutMe = await custReq.get('/nori-api/auth/me')
      expect((await afterLogoutMe.json()).data).toBeNull()

      const afterLogoutBookings = await custReq.get('/nori-api/bookings')
      expect(afterLogoutBookings.status()).toBe(401)

      // Even replaying the old JWT cookie manually after logout is rejected 401 because _sid was revoked in DB!
      const replayRes = await anonReq.get('/nori-api/bookings', {
        headers: { Cookie: capturedTokenPair },
      })
      expect(replayRes.status()).toBe(401)
    } finally {
      await anonReq.dispose()
      await custReq.dispose()
      await adminReq.dispose()
    }
  })

  test('Scenario 1 (Sections 22.1, 24, 25, 26, 27): Register → Account → Vehicle → Checkout → POST Booking (201) → My Bookings + Cookie & SQLite DB verification', async ({
    page,
    context,
  }) => {
    const email = uniqueCustomerEmail('sc1')
    const slot = await pickAvailableRentVehicleAndWindow(page.request, 24)

    // 1. Register via UI
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await page.fill('#auth-name', 'Trần Minh Đăng Ký')
    await page.fill('#auth-email', email)
    await page.fill('#auth-phone', '0912345678')
    await page.fill('#auth-password', 'Password123!')
    await page.fill('#auth-confirm', 'Password123!')
    await page.check('#auth-terms')

    const regApiPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/auth/register') && r.request().method() === 'POST',
    )
    const meAfterRegPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/auth/me') && r.request().method() === 'GET',
    )
    await page.getByRole('button', { name: /Tạo tài khoản NORI/i }).click()

    expect((await regApiPromise).status()).toBe(201)
    const meAfterReg = await meAfterRegPromise
    expect(meAfterReg.status()).toBe(200)
    expect((await meAfterReg.json()).data.role).toBe('CUSTOMER')

    await expect(page).toHaveURL(/\/account/)
    await expect(page.getByRole('heading', { name: 'Trần Minh Đăng Ký' })).toBeVisible()

    // 2. Inspect actual cookie in Playwright context (Section 24)
    const cookies = await context.cookies()
    const appSession = cookies.find((c) => c.name === 'app-session')
    expect(appSession).toBeDefined()
    expect(appSession!.path).toBe('/')
    expect(appSession!.httpOnly).toBe(true)
    expect(appSession!.secure).toBe(false)
    expect(appSession!.sameSite.toLowerCase()).toBe('lax')
    expect(appSession!.expires).toBeGreaterThan(Math.floor(Date.now() / 1000) + 86_000)
    expect(cookies.find((c) => c.name === 'payload-token' && c.value !== '')).toBeUndefined()

    // 3. Visit Vehicle Detail -> proceed to Checkout
    await page.goto(
      `/vehicles/${slot.modelSlug}?startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByRole('heading', { level: 1 })).toContainText(slot.modelName)

    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('Trần Minh Đăng Ký')).toBeVisible()
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)

    await page.fill('#checkout-license', 'B2-7900112233')
    await page.fill('#checkout-note', 'Nhận xe buổi sáng đúng giờ')
    await page.check('#checkout-terms')

    const postBookingPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    const postBookingRes = await postBookingPromise
    expect(postBookingRes.status()).toBe(201)
    const createdBooking = (await postBookingRes.json()).data

    await expect(page.getByRole('heading', { name: /Đã tiếp nhận hành trình mới/i })).toBeVisible()

    // 4. Verify real SQLite DB records (Sections 26 & 27)
    const db = new DatabaseSync(getDbPath(), { open: true, readOnly: true })
    try {
      const dbUser = db
        .prepare('SELECT id, email, role, status FROM users WHERE email = ?')
        .get(email) as { id: string; email: string; role: string; status: string } | undefined
      expect(dbUser).toBeDefined()
      expect(dbUser!.role).toBe('CUSTOMER')
      expect(dbUser!.status).toBe('ACTIVE')

      const dbSessions = db
        .prepare('SELECT id, expires_at FROM users_sessions WHERE _parent_id = ?')
        .all(dbUser!.id) as Array<{ id: string; expires_at: string }>
      expect(dbSessions.length).toBeGreaterThan(0)

      const dbBooking = db
        .prepare(
          'SELECT id, customer_id, vehicle_id, status, booking_key, total_price FROM bookings WHERE id = ?',
        )
        .get(createdBooking.id) as
        | {
            id: string
            customer_id: string
            vehicle_id: string
            status: string
            booking_key: string
            total_price: number
          }
        | undefined
      expect(dbBooking).toBeDefined()
      expect(dbBooking!.customer_id).toBe(dbUser!.id)
      expect(dbBooking!.vehicle_id).toBe(slot.vehicleId)
      expect(dbBooking!.status).toBe('PENDING')
      expect(dbBooking!.booking_key).toBeTruthy()
      expect(dbBooking!.total_price).toBe(slot.estimatedTotal)

      const lockedDays = db
        .prepare('SELECT day FROM rental_days WHERE booking_key = ? ORDER BY day ASC')
        .all(dbBooking!.booking_key) as Array<{ day: string }>
      expect(lockedDays.map((d) => d.day)).toEqual([slot.startDate, addDays(slot.startDate, 1)])
    } finally {
      db.close()
    }

    // 5. Navigate to My Bookings & verify GET /bookings = 200 and booking card appears
    const getBookingsPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'GET',
    )
    await page.getByRole('link', { name: /Xem đơn thuê của tôi/i }).click()
    expect((await getBookingsPromise).status()).toBe(200)
    await expect(page).toHaveURL(/\/my-bookings/)
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)
    await expect(page.getByText(createdBooking.bookingKey.slice(0, 11).toUpperCase())).toBeVisible()
  })

  test('Scenarios 2, 3, 4, 5: Existing Customer Login → Direct My Bookings → Reloads on Website & Checkout → Booking (201)', async ({
    page,
  }) => {
    const email = uniqueCustomerEmail('sc2345')
    const password = 'Password123!'
    await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Lê Thị Thuê Xe',
        email,
        phone: '0987654321',
        password,
        confirmPassword: password,
      },
    })
    await page.request.post(`${ORIGIN}/nori-api/auth/logout`, { headers: AUTH_HEADERS })

    // Scenario 2: Login via UI
    await page.goto('/login?returnTo=%2Fmy-bookings', { waitUntil: 'domcontentloaded' })
    await page.fill('#auth-email', email)
    await page.fill('#auth-password', password)

    const loginPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/auth/login') && r.request().method() === 'POST',
    )
    const mePromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/auth/me') && r.request().method() === 'GET',
    )
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()
    expect((await loginPromise).status()).toBe(200)
    expect((await mePromise).status()).toBe(200)

    // Scenario 4: Direct /my-bookings after Login never says "Vui lòng đăng nhập"
    await expect(page).toHaveURL(/\/my-bookings/)
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)
    await expect(page.getByText(/0 đơn thuê|Chưa có đơn thuê/i).first()).toBeVisible()

    // Scenario 3: Reload page -> /auth/me remains CUSTOMER
    const reloadMePromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/auth/me') && r.request().method() === 'GET',
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloadMeRes = await reloadMePromise
    expect(reloadMeRes.status()).toBe(200)
    expect((await reloadMeRes.json()).data.role).toBe('CUSTOMER')
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)

    // Scenario 5: Checkout -> fill fields -> reload -> remains authenticated + draft preserved -> Booking (201)
    const slot = await pickAvailableRentVehicleAndWindow(page.request, 28)
    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('Lê Thị Thuê Xe')).toBeVisible()
    await page.fill('#checkout-location', '123 Nguyễn Huệ, Quận 1')
    await page.fill('#checkout-note', 'Giữ nguyên ghi chú sau khi reload')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Lê Thị Thuê Xe')).toBeVisible()
    await expect(page.locator('#checkout-location')).toHaveValue('123 Nguyễn Huệ, Quận 1')
    await expect(page.locator('#checkout-note')).toHaveValue('Giữ nguyên ghi chú sau khi reload')

    await page.check('#checkout-terms')
    const createResPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    expect((await createResPromise).status()).toBe(201)
    await expect(page.getByRole('heading', { name: /Đã tiếp nhận hành trình mới/i })).toBeVisible()
  })

  test('Scenarios 6 & 7: Stale Session Auto-Sync on 401/DB Expiry & Blocked Cookie Login Guard', async ({
    page,
    context,
  }) => {
    const email = uniqueCustomerEmail('sc67')
    const password = 'Password123!'
    await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Phạm Văn Phiên Hết Hạn',
        email,
        phone: '0911222333',
        password,
        confirmPassword: password,
      },
    })

    // Scenario 6A: User is on /my-bookings holding `user` in React state; expire session in DB & trigger API
    await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/0 đơn thuê/)).toBeVisible()

    // Expire the DB session row (`expires_at` in the past) while browser still sends the cookie!
    const db = new DatabaseSync(getDbPath())
    try {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }
      db.prepare('UPDATE users_sessions SET expires_at = ? WHERE _parent_id = ?').run(
        '2020-01-01T00:00:00.000Z',
        u.id,
      )
    } finally {
      db.close()
    }

    // Trigger a protected API request on /my-bookings by changing status filter -> API returns 401 -> AuthProvider clears user -> Login EmptyState appears!
    const unauthBookingsPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'GET',
    )
    await page.selectOption('#booking-status', 'PENDING')
    expect((await unauthBookingsPromise).status()).toBe(401)

    await expect(page.getByRole('link', { name: /Đăng nhập để xem đơn/i })).toBeVisible()
    // Header also synced to unauthenticated ("Đăng nhập"), never stuck showing customer's name
    await expect(page.locator('header').getByText('Hạn')).toHaveCount(0)

    await context.clearCookies()

    // Scenario 7: Login API returns 200, but session cookie fails verification on `/auth/me` -> must NOT redirect!
    await page.goto('/login?returnTo=%2Fmy-bookings', { waitUntil: 'domcontentloaded' })
    let interceptAuthMe = false
    await page.route('**/nori-api/auth/me', async (route) => {
      if (interceptAuthMe) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: null }),
        })
        return
      }
      await route.continue()
    })

    await page.fill('#auth-email', email)
    await page.fill('#auth-password', password)
    interceptAuthMe = true
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/Không thể xác minh phiên đăng nhập/i)).toBeVisible()

    interceptAuthMe = false
    await page.unroute('**/nori-api/auth/me')
  })

  test('Scenarios 8, 9, 10, 11: Admin Role Separation on Checkout/MyBookings/Account, Logout Role Switching & Dual-Email Safety', async ({
    page,
    context,
  }) => {
    const adminCreds = getAdminCredentials()
    const custEmail = uniqueCustomerEmail('sc891011')
    const custPassword = 'Password123!'
    const slot = await pickAvailableRentVehicleAndWindow(page.request, 32)

    // Register Customer first (Scenario 10 start: Customer logged in)
    await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Khách Chuyển Vai Trò',
        email: custEmail,
        phone: '0933445566',
        password: custPassword,
        confirmPassword: custPassword,
      },
    })
    await page.goto('/account', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Khách Chuyển Vai Trò' })).toBeVisible()

    // Scenario 10: Customer -> Logout -> Admin Login -> no cookie conflict
    await page.getByRole('button', { name: /Đăng xuất/i }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(
      (await context.cookies()).find((c) => c.name === 'app-session' && c.value),
    ).toBeUndefined()

    await page.fill('#auth-email', adminCreds.email)
    await page.fill('#auth-password', adminCreds.password)
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    const adminCookies = await context.cookies()
    expect(adminCookies.find((c) => c.name === 'payload-token' && c.value)).toBeDefined()
    expect(adminCookies.find((c) => c.name === 'app-session' && c.value)).toBeUndefined()

    // Scenario 8: Admin visits Checkout -> explicit Admin role message, NEVER "Vui lòng đăng nhập", button disabled
    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText(/Bạn đang đăng nhập bằng tài khoản quản trị/i)).toBeVisible()
    await expect(page.getByText(/Vui lòng đăng nhập để đặt xe/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Xác nhận đặt thuê/i })).toBeDisabled()

    // Scenario 9: Admin visits My Bookings & Account -> explicit Admin message, NEVER "Vui lòng đăng nhập"
    await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /Bạn đang đăng nhập bằng tài khoản quản trị/i }),
    ).toBeVisible()
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)

    await page.goto('/account', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Quản trị viên NORI').first()).toBeVisible()
    await expect(page.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)

    // Scenario 11: Admin switches to Customer via Checkout button -> logs in as Customer -> books normally!
    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.getByRole('button', { name: /Đăng nhập bằng tài khoản khách hàng/i }).click()
    await expect(page).toHaveURL(/\/login\?accountType=customer/)

    await page.fill('#auth-email', custEmail)
    await page.fill('#auth-password', custPassword)
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()

    await expect(page).toHaveURL(/\/checkout/)
    await expect(page.getByText('Khách Chuyển Vai Trò')).toBeVisible()
    const switchedCookies = await context.cookies()
    expect(switchedCookies.find((c) => c.name === 'app-session' && c.value)).toBeDefined()
    expect(switchedCookies.find((c) => c.name === 'payload-token' && c.value)).toBeUndefined()

    await page.check('#checkout-terms')
    const bookResPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    expect((await bookResPromise).status()).toBe(201)
    await expect(page.getByRole('heading', { name: /Đã tiếp nhận hành trình mới/i })).toBeVisible()
  })

  test('Scenarios 12 & 13: Customer A / Customer B Ownership Isolation, Session Timeout During Checkout + Draft Restore & Draft Account Isolation', async ({
    page,
    context,
    playwright,
  }) => {
    const emailA = uniqueCustomerEmail('custA')
    const emailB = uniqueCustomerEmail('custB')
    const password = 'Password123!'
    const slot = await pickAvailableRentVehicleAndWindow(page.request, 38)

    for (const [email, fullName, phone] of [
      [emailA, 'Khách Hàng Alpha', '0905111222'],
      [emailB, 'Khách Hàng Beta', '0905333444'],
    ]) {
      await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: { fullName, email, phone, password, confirmPassword: password },
      })
    }
    await context.clearCookies()

    // Scenario 13: Customer A logs in -> fills Checkout -> session expires -> clicks Confirm -> 401 -> /login?expired=1&returnTo=... -> re-login -> draft restored -> Booking 201!
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.fill('#auth-email', emailA)
    await page.fill('#auth-password', password)
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()
    await expect(page).toHaveURL(/\/account/)

    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('Khách Hàng Alpha')).toBeVisible()

    await page.fill('#checkout-location', 'Sân bay Tân Sơn Nhất - Ga Quốc Nội')
    await page.fill('#checkout-license', 'B2-ALPHA-9988')
    await page.fill('#checkout-note', 'Ghi chú quan trọng của Alpha trước khi hết phiên')
    await page.check('#checkout-terms')

    // Simulate session expiration right before clicking Confirm
    await context.clearCookies({ name: 'app-session' })

    const expiredPostPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    expect((await expiredPostPromise).status()).toBe(401)

    // Redirected to /login?expired=1&returnTo=/checkout... with preservation notice
    await expect(page).toHaveURL(/\/login\?expired=1&returnTo=/)
    await expect(page.getByText(/Phiên đăng nhập đã hết hạn/i)).toBeVisible()

    // Re-login as Customer A -> returns to Checkout with all draft fields intact!
    await page.fill('#auth-email', emailA)
    await page.fill('#auth-password', password)
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()

    await expect(page).toHaveURL(/\/checkout/)
    await expect(page.getByText('Khách Hàng Alpha')).toBeVisible()
    await expect(page.locator('#checkout-location')).toHaveValue(
      'Sân bay Tân Sơn Nhất - Ga Quốc Nội',
    )
    await expect(page.locator('#checkout-license')).toHaveValue('B2-ALPHA-9988')
    await expect(page.locator('#checkout-note')).toHaveValue(
      'Ghi chú quan trọng của Alpha trước khi hết phiên',
    )

    await page.check('#checkout-terms')
    const successPostPromise = page.waitForResponse(
      (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
    const successPost = await successPostPromise
    expect(successPost.status()).toBe(201)
    const bookingA = (await successPost.json()).data

    // Also verify draft isolation across Logout -> Customer B on another slot
    const slot2 = await pickAvailableRentVehicleAndWindow(page.request, 44)
    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot2.vehicleId)}&startDate=${slot2.startDate}&endDate=${slot2.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.fill('#checkout-note', 'Nháp riêng của Alpha không được lộ sang Beta')
    await page.goto('/account', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Đăng xuất/i }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.fill('#auth-email', emailB)
    await page.fill('#auth-password', password)
    await page.getByRole('button', { name: /^Đăng nhập/i }).click()
    await expect(page).toHaveURL(/\/account/)

    await page.goto(
      `/checkout?vehicle=${encodeURIComponent(slot2.vehicleId)}&startDate=${slot2.startDate}&endDate=${slot2.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(page.getByText('Khách Hàng Beta')).toBeVisible()
    await expect(page.locator('#checkout-note')).toHaveValue('')
    await expect(page.locator('#checkout-phone')).toHaveValue('0905333444')

    // Scenario 12: Customer B cannot see, read, edit, or cancel Customer A's Booking A
    await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/0 đơn thuê/)).toBeVisible()
    await expect(page.getByText(bookingA.bookingKey.slice(0, 11).toUpperCase())).toHaveCount(0)

    const custBReq = await playwright.request.newContext({ baseURL: ORIGIN })
    try {
      await custBReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email: emailB, password },
      })
      const readById = await custBReq.get(
        `/nori-api/bookings?id=${encodeURIComponent(bookingA.id)}`,
      )
      expect([403, 404]).toContain(readById.status())

      const editByB = await custBReq.put('/nori-api/bookings', {
        headers: AUTH_HEADERS,
        data: { id: bookingA.id, note: 'Hack IDOR' },
      })
      expect([403, 404]).toContain(editByB.status())

      const cancelByB = await custBReq.patch('/nori-api/bookings', {
        headers: AUTH_HEADERS,
        data: { id: bookingA.id },
      })
      expect([403, 404]).toContain(cancelByB.status())
    } finally {
      await custBReq.dispose()
    }
  })

  test('Scenarios 14, 15, 16: Mobile Viewports (375x812 & 390x844) + PWA SW Cache Safety + Browser Reopen + HTTPS Proxy Cookie', async ({
    browser,
    playwright,
  }) => {
    const email = uniqueCustomerEmail('sc141516')
    const password = 'Password123!'

    // Scenario 14A: Mobile 375x812 Register/Login -> Select Vehicle -> Checkout -> Booking -> My Bookings + SW Cache inspection
    const mobile375 = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    })
    const page375 = await mobile375.newPage()
    let savedStorageState: Awaited<ReturnType<typeof mobile375.storageState>> | null = null

    try {
      await page375.goto(`${ORIGIN}/register`, { waitUntil: 'domcontentloaded' })
      await page375.fill('#auth-name', 'Nguyễn Di Động PWA')
      await page375.fill('#auth-email', email)
      await page375.fill('#auth-phone', '0977888999')
      await page375.fill('#auth-password', password)
      await page375.fill('#auth-confirm', password)
      await page375.check('#auth-terms')
      const regApiPromise = page375.waitForResponse(
        (r) => r.url().includes('/nori-api/auth/register') && r.request().method() === 'POST',
      )
      await page375.getByRole('button', { name: /Tạo tài khoản NORI/i }).click()
      expect((await regApiPromise).status()).toBe(201)
      await expect(page375).toHaveURL(/\/account/)

      const slot = await pickAvailableRentVehicleAndWindow(page375.request, 50)
      await page375.goto(
        `${ORIGIN}/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
        { waitUntil: 'domcontentloaded' },
      )
      await expect(page375.getByText('Nguyễn Di Động PWA')).toBeVisible()
      await page375.check('#checkout-terms')
      const mobileBookPromise = page375.waitForResponse(
        (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
      )
      await page375.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      expect((await mobileBookPromise).status()).toBe(201)

      await page375.getByRole('link', { name: /Xem đơn thuê của tôi/i }).click()
      await expect(page375).toHaveURL(/\/my-bookings/)
      await expect(page375.getByText(/1 đơn thuê/)).toBeVisible()

      // Verify Service Worker cache contains ZERO sensitive auth/booking routes (Section 18)
      const cachedSensitiveUrls = await page375.evaluate(async () => {
        if (!('caches' in window)) return []
        const keys = await window.caches.keys()
        const bad: string[] = []
        const prefixes = [
          '/nori-api',
          '/api',
          '/login',
          '/register',
          '/account',
          '/my-bookings',
          '/checkout',
          '/dashboard',
          '/admin',
        ]
        for (const k of keys) {
          const cache = await window.caches.open(k)
          const reqs = await cache.keys()
          for (const req of reqs) {
            const p = new URL(req.url).pathname
            if (prefixes.some((pre) => p === pre || p.startsWith(`${pre}/`))) {
              bad.push(p)
            }
          }
        }
        return bad
      })
      expect(cachedSensitiveUrls).toEqual([])

      savedStorageState = await mobile375.storageState()
    } finally {
      await mobile375.close()
    }

    // Scenario 15 & Scenario 14B: Browser Reopen on Mobile 390x844 using persisted cookies -> still authenticated!
    expect(savedStorageState).toBeTruthy()
    const reopen390 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: savedStorageState!,
    })
    const page390 = await reopen390.newPage()
    try {
      await page390.goto(`${ORIGIN}/my-bookings`, { waitUntil: 'domcontentloaded' })
      await expect(page390.getByText(/Vui lòng đăng nhập/i)).toHaveCount(0)
      await expect(page390.getByText(/1 đơn thuê/)).toBeVisible()

      await page390.goto(`${ORIGIN}/account`, { waitUntil: 'domcontentloaded' })
      await expect(page390.getByRole('heading', { name: 'Nguyễn Di Động PWA' })).toBeVisible()
    } finally {
      await reopen390.close()
    }

    // Scenario 16: HTTPS Reverse-Proxy Production Cookie (`Secure; HttpOnly; SameSite=lax`) vs Plain HTTP (`127.0.0.1`)
    const proxyReq = await playwright.request.newContext({ baseURL: ORIGIN })
    try {
      const httpsLoginRes = await proxyReq.post('/nori-api/auth/login', {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'nori.vn',
          origin: 'https://nori.vn',
          referer: 'https://nori.vn/login',
        },
        data: { email, password },
      })
      expect(httpsLoginRes.status()).toBe(200)
      const httpsCookies = httpsLoginRes
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
      const httpsAppSession = httpsCookies.find((v) => v.startsWith('app-session='))
      expect(httpsAppSession).toBeDefined()
      expect(httpsAppSession).toMatch(/Secure/i)
      expect(httpsAppSession).toMatch(/HttpOnly/i)
      expect(httpsAppSession).toMatch(/SameSite=lax/i)

      const httpLanLoginRes = await proxyReq.post('/nori-api/auth/login', {
        headers: {
          'x-forwarded-proto': 'http',
          'x-forwarded-host': '192.168.1.88:3005',
          origin: 'http://192.168.1.88:3005',
        },
        data: { email, password },
      })
      expect(httpLanLoginRes.status()).toBe(200)
      const httpCookies = httpLanLoginRes
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value)
      const httpAppSession = httpCookies.find((v) => v.startsWith('app-session='))
      expect(httpAppSession).toBeDefined()
      expect(httpAppSession).not.toMatch(/;\s*Secure/i)
      expect(httpAppSession).toMatch(/SameSite=lax/i)
    } finally {
      await proxyReq.dispose()
    }
  })

  test('Full Booking Lifecycle + Promotion + Pending-Edit + Approval Notification + Review Regression (Sections 34–37)', async ({
    page,
    playwright,
  }) => {
    const adminCreds = getAdminCredentials()
    const custEmail = uniqueCustomerEmail('lifecycle')
    const custPassword = 'Password123!'
    const promoCode = `AUTHQA${randomBytes(3).toString('hex').toUpperCase()}`
    trackedPromoCodes.add(promoCode)

    const adminReq = await playwright.request.newContext({ baseURL: ORIGIN })
    try {
      const adminLogin = await adminReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email: adminCreds.email, password: adminCreds.password },
      })
      expect(adminLogin.status()).toBe(200)

      // 1. Admin creates a Promotion
      const createPromo = await adminReq.post('/nori-api/dashboard/promotions', {
        headers: AUTH_HEADERS,
        data: {
          code: promoCode,
          name: 'Ưu đãi Kiểm thử Lifecycle',
          discountType: 'FIXED',
          discountValue: 100_000,
          minDays: 1,
          appliesTo: 'RENT',
          active: true,
        },
      })
      expect(createPromo.status()).toBe(201)

      // 2. Customer registers, logs in, visits Checkout -> applies promo -> clears promo -> re-applies promo -> books (PENDING)
      await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Vũ Hoàng Trọn Vòng Đời',
          email: custEmail,
          phone: '0944556677',
          password: custPassword,
          confirmPassword: custPassword,
        },
      })

      const slot = await pickAvailableRentVehicleAndWindow(page.request, 56)
      await page.goto(
        `/checkout?vehicle=${encodeURIComponent(slot.vehicleId)}&startDate=${slot.startDate}&endDate=${slot.endDate}`,
        { waitUntil: 'domcontentloaded' },
      )
      await expect(page.getByText('Vũ Hoàng Trọn Vòng Đời')).toBeVisible()

      await page.fill('#checkout-promo', promoCode)
      await page.getByRole('button', { name: 'Áp dụng' }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoCode}`)).toBeVisible()

      // Remove promo -> verify cleared, then re-apply
      await page.getByRole('button', { name: /Bỏ mã khuyến mãi/i }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoCode}`)).toHaveCount(0)

      await page.fill('#checkout-promo', promoCode)
      await page.getByRole('button', { name: 'Áp dụng' }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoCode}`)).toBeVisible()

      await page.check('#checkout-terms')
      const createBookingPromise = page.waitForResponse(
        (r) => r.url().includes('/nori-api/bookings') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      const createBookingRes = await createBookingPromise
      expect(createBookingRes.status()).toBe(201)
      const createdBooking = (await createBookingRes.json()).data
      expect(createdBooking.promoCode).toBe(promoCode)
      expect(createdBooking.promoDiscountAmount).toBe(100_000)

      // 3. Customer edits PENDING booking (Section 36)
      const editRes = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          expectedRevision: createdBooking.revision,
          note: 'Đã cập nhật ghi chú khi đơn còn PENDING',
          pickupLocation: 'Showroom Trung Tâm NORI',
        },
      })
      expect(editRes.status()).toBe(200)
      const editedBooking = (await editRes.json()).data
      expect(editedBooking.note).toBe('Đã cập nhật ghi chú khi đơn còn PENDING')

      // 4. Admin approves Booking -> CONFIRMED -> Customer receives Notification & can no longer edit CONFIRMED booking
      const approveRes = await adminReq.patch('/nori-api/dashboard/bookings', {
        headers: AUTH_HEADERS,
        data: { id: createdBooking.id, status: 'CONFIRMED', handoverNote: 'Duyệt đơn kiểm thử' },
      })
      expect(approveRes.status()).toBe(200)

      const notifRes = await page.request.get(`${ORIGIN}/nori-api/notifications`)
      expect(notifRes.status()).toBe(200)
      const notifJson = await notifRes.json()
      expect(
        notifJson.data.items.some(
          (n: { bookingId: string; type: string }) =>
            n.bookingId === createdBooking.id && n.type === 'BOOKING_CONFIRMED',
        ),
      ).toBe(true)

      const lockedEditRes = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          note: 'Cố sửa sau khi đã CONFIRMED',
        },
      })
      expect([403, 409]).toContain(lockedEditRes.status())

      // Update booking startDate to today in isolated DB so vehicle is eligible for handover/ongoing
      const db = new DatabaseSync(getDbPath())
      db.prepare('UPDATE bookings SET start_date = ? WHERE id = ?').run(
        businessToday(),
        createdBooking.id,
      )
      db.close()

      // 5. Admin transitions READY_FOR_HANDOVER -> ONGOING -> INSPECTING -> COMPLETED
      for (const nextStatus of ['READY_FOR_HANDOVER', 'ONGOING', 'INSPECTING', 'COMPLETED']) {
        const stepRes = await adminReq.patch('/nori-api/dashboard/bookings', {
          headers: AUTH_HEADERS,
          data: { id: createdBooking.id, status: nextStatus },
        })
        expect(stepRes.status()).toBe(200)
      }

      // 6. Customer posts verified Review on COMPLETED booking
      const reviewRes = await page.request.post(`${ORIGIN}/nori-api/reviews`, {
        headers: AUTH_HEADERS,
        data: {
          booking: createdBooking.id,
          model: slot.modelId,
          rating: 5,
          title: 'Trải nghiệm thuê xe mượt mà',
          comment: 'Phiên đăng nhập ổn định, nhận xe nhanh và xe sạch đẹp.',
        },
      })
      expect(reviewRes.status()).toBe(201)
    } finally {
      await adminReq.dispose()
    }
  })
})
