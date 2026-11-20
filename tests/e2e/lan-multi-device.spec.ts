import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { addDays, businessToday } from '../../src/lib/rental-rules'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const LOCAL_ORIGIN = process.env.NORI_TEST_LOCAL_URL || null
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
  let email = 'admin@nori.vn'
  let password = ''
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

const trackedEmails: string[] = []
const trackedPromoCodes: string[] = []
let savedVehiclePrice: { id: string; pricePerDay: number | null } | null = null

function cleanupLanTestRecords() {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = ON')
    if (savedVehiclePrice) {
      db.prepare('UPDATE vehicles SET price_per_day = ? WHERE id = ?').run(
        savedVehiclePrice.pricePerDay,
        savedVehiclePrice.id,
      )
    }

    for (const email of trackedEmails) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as
        | { id: string }
        | undefined
      if (!user) continue
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
      db.prepare(
        'DELETE FROM audit_logs_rels WHERE users_id = ? OR parent_id IN (SELECT id FROM audit_logs WHERE actor_id = ? OR entity_id = ?)',
      ).run(user.id, user.id, user.id)
      db.prepare('DELETE FROM audit_logs WHERE actor_id = ? OR entity_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }

    for (const code of trackedPromoCodes) {
      const pRows = db
        .prepare('SELECT id FROM promotions WHERE code = ?')
        .all(code.toUpperCase()) as { id: string }[]
      for (const p of pRows) {
        db.prepare('DELETE FROM promotions_rels WHERE parent_id = ?').run(p.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE promotions_id = ?').run(p.id)
        db.prepare('DELETE FROM promotions WHERE id = ?').run(p.id)
      }
    }
  } finally {
    db.close()
  }
}

async function pickFreeVehicleWindow(request: APIRequestContext, preferredOffset = 50, days = 2) {
  const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
  expect(fleetRes.status()).toBe(200)
  const fleet = (await fleetRes.json()).data as Array<{
    id: string
    modelId: string
    intent: string
    pricePerDay: number | null
    operationStatus: string
  }>
  const v = fleet.find(
    (item) =>
      item.intent !== 'SALE' && Boolean(item.pricePerDay) && item.operationStatus === 'READY',
  )
  expect(v).toBeDefined()

  const today = businessToday()
  const availRes = await request.get(`${ORIGIN}/nori-api/availability?vehicle=${v!.id}`)
  const busyDays = new Set<string>((await availRes.json()).data?.busyDays ?? [])
  for (let offset = preferredOffset; offset <= preferredOffset + 30; offset += 1) {
    const startDate = addDays(today, offset)
    const endDate = addDays(startDate, days)
    let collision = false
    for (let d = 0; d < days; d += 1) {
      if (busyDays.has(addDays(startDate, d))) {
        collision = true
        break
      }
    }
    if (!collision) {
      const qRes = await request.get(
        `${ORIGIN}/nori-api/availability?vehicle=${v!.id}&startDate=${startDate}&endDate=${endDate}`,
      )
      const q = (await qRes.json()).data
      if (q?.available) {
        return { vehicleId: v!.id, modelId: v!.modelId, startDate, endDate, quote: q }
      }
    }
  }
  throw new Error(
    `No free ${days}-day window found for vehicle ${v!.id} starting from offset ${preferredOffset}`,
  )
}

test.describe('LAN Multi-Device, Auth/Session, Sync & Responsive Suite', () => {
  test.afterAll(() => {
    cleanupLanTestRecords()
  })

  test('1. Dual-host reachability, security headers & CSRF origin rejection on forged cross-origin requests', async ({
    request,
  }) => {
    for (const route of ['/', '/vehicles', '/login', '/dashboard', '/admin', '/nori-api/health']) {
      const res = await request.get(`${ORIGIN}${route}`)
      expect(res.status(), `Expected 200 on ${ORIGIN}${route}`).toBe(200)
      expect(res.headers()['x-content-type-options']).toBe('nosniff')
    }

    if (LOCAL_ORIGIN && LOCAL_ORIGIN !== ORIGIN) {
      for (const route of ['/', '/nori-api/health']) {
        const res = await request.get(`${LOCAL_ORIGIN}${route}`)
        expect(res.status(), `Expected 200 on ${LOCAL_ORIGIN}${route}`).toBe(200)
      }
    }

    const forgedLogin = await request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: {
        origin: 'http://evil-attacker.test',
        referer: 'http://evil-attacker.test/login',
      },
      data: { email: 'fake@example.test', password: 'Password123', accountType: 'customer' },
    })
    expect(forgedLogin.status()).toBe(403)
  })

  test('2. Customer mobile login/register cookie attributes, reload persistence across Checkout (never redirects to localhost) & Admin access', async ({
    browser,
  }) => {
    const uid = randomBytes(3).toString('hex')
    const email = `nori-lan-cust-${uid}@example.test`
    const password = 'NoriLanUser123!'
    trackedEmails.push(email)
    const promoCode = `LAN${uid.toUpperCase()}`
    trackedPromoCodes.push(promoCode)

    const adminCreds = getAdminCredentials()
    expect(adminCreds.password).toBeTruthy()

    // Admin context creates a promo code via LAN/base origin and verifies Admin + Payload CMS
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const adminPage = await adminCtx.newPage()
    const adminLoginRes = await adminPage.request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email: adminCreds.email, password: adminCreds.password, accountType: 'admin' },
    })
    expect(adminLoginRes.status()).toBe(200)
    const adminSetCookie = adminLoginRes.headers()['set-cookie'] || ''
    expect(adminSetCookie).toContain('payload-token=')
    expect(adminSetCookie.toLowerCase()).toContain('httponly')
    expect(adminSetCookie.toLowerCase()).toContain('samesite=lax')
    expect(adminSetCookie.toLowerCase()).not.toContain('domain=')

    const promoRes = await adminPage.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
      headers: AUTH_HEADERS,
      data: {
        code: promoCode,
        name: `Ưu đãi LAN ${uid}`,
        discountType: 'FIXED',
        discountValue: 100_000,
        minDays: 1,
        appliesTo: 'RENT',
        active: true,
      },
    })
    expect(promoRes.status()).toBe(201)

    await adminPage.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(adminPage.locator('h1').first()).toBeVisible()
    await adminPage.goto('/admin', { waitUntil: 'domcontentloaded' })
    expect(new URL(adminPage.url()).origin).toBe(new URL(ORIGIN).origin)

    // Customer Phone Context registers on /register UI, navigates to Vehicle -> Checkout -> Reload -> Books with Promo
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const phonePage = await phoneCtx.newPage()

    await phonePage.goto('/register', { waitUntil: 'domcontentloaded' })
    await phonePage.fill('#auth-name', `Khách LAN ${uid}`)
    await phonePage.fill('#auth-email', email)
    await phonePage.fill('#auth-phone', '0912345678')
    await phonePage.fill('#auth-password', password)
    await phonePage.fill('#auth-confirm', password)
    await phonePage.check('#auth-terms')

    const [regResponse] = await Promise.all([
      phonePage.waitForResponse(
        (res) => res.url().includes('/nori-api/auth/register') && res.request().method() === 'POST',
      ),
      phonePage.getByRole('button', { name: 'Tạo tài khoản NORI' }).click(),
    ])
    expect(regResponse.status()).toBe(201)
    const browserCookies = await phoneCtx.cookies()
    const sessionCookie = browserCookies.find((c) => c.name === 'app-session')
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie!.httpOnly).toBe(true)
    expect(sessionCookie!.sameSite).toBe('Lax')
    expect(sessionCookie!.secure).toBe(false)
    expect(sessionCookie!.path).toBe('/')
    expect(sessionCookie!.domain).toBe(new URL(ORIGIN).hostname)

    await expect(phonePage).toHaveURL(/\/account/)
    expect(new URL(phonePage.url()).origin).toBe(new URL(ORIGIN).origin)

    // Strict cookie isolation: LAN cookie does NOT silently authenticate localhost if both hosts are tested
    if (LOCAL_ORIGIN && LOCAL_ORIGIN !== ORIGIN) {
      const localCheckCtx = await browser.newContext()
      await localCheckCtx.addCookies(await phoneCtx.cookies())
      const localMe = await localCheckCtx.request.get(`${LOCAL_ORIGIN}/nori-api/auth/me`)
      expect((await localMe.json()).data).toBeNull()
      await localCheckCtx.close()
    }

    const win = await pickFreeVehicleWindow(phonePage.request, 50)
    await phonePage.goto(
      `/checkout?vehicle=${encodeURIComponent(win.vehicleId)}&startDate=${win.startDate}&endDate=${win.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(phonePage.locator('#checkout-phone')).toBeVisible({ timeout: 15_000 })

    // Reload /checkout -> customer MUST stay authenticated and NEVER be told "Vui lòng đăng nhập để đặt xe"
    await phonePage.reload({ waitUntil: 'domcontentloaded' })
    await expect(phonePage.locator('#checkout-phone')).toBeVisible({ timeout: 15_000 })
    await expect(phonePage.getByText('Vui lòng đăng nhập để đặt xe')).toHaveCount(0)

    // Apply promo code in checkout UI and submit booking
    await phonePage.fill('#checkout-promo', promoCode)
    await phonePage.getByRole('button', { name: 'Áp dụng' }).click()
    await expect(phonePage.getByText(`Đang áp dụng: ${promoCode}`)).toBeVisible({ timeout: 10_000 })

    await phonePage.fill('#checkout-phone', '0912345678')
    const termsCheckbox = phonePage.locator('#checkout-terms')
    await termsCheckbox.scrollIntoViewIfNeeded()
    await termsCheckbox.check()
    const [bkResponse] = await Promise.all([
      phonePage.waitForResponse(
        (res) => res.url().includes('/nori-api/bookings') && res.request().method() === 'POST',
      ),
      phonePage.locator('button[type="submit"]').click(),
    ])
    expect(bkResponse.status()).toBe(201)
    expect(new URL(phonePage.url()).origin).toBe(new URL(ORIGIN).origin)

    // Visit /my-bookings -> reload -> logout -> login again -> persists cleanly
    await phonePage.goto('/my-bookings', { waitUntil: 'domcontentloaded' })
    await expect(phonePage.getByText('Toyota Fortuner').first()).toBeVisible({ timeout: 10_000 })
    const logoutRes = await phonePage.request.post(`${ORIGIN}/nori-api/auth/logout`, {
      headers: AUTH_HEADERS,
    })
    expect(logoutRes.status()).toBe(200)
    const meAfterLogout = await phonePage.request.get(`${ORIGIN}/nori-api/auth/me`)
    expect((await meAfterLogout.json()).data).toBeNull()

    await phonePage.goto('/login', { waitUntil: 'domcontentloaded' })
    await phonePage.fill('#auth-email', email)
    await phonePage.fill('#auth-password', password)
    await phonePage.getByRole('button', { name: 'Đăng nhập' }).click()
    await expect(phonePage).toHaveURL(/\/account/)

    await phoneCtx.close()
    await adminCtx.close()
  })

  test('3. Shared SQLite multi-device sync, booking edit, approval, cache invalidation, race guard & non-localhost media URLs', async ({
    browser,
  }) => {
    const uid = randomBytes(3).toString('hex')
    const cust1Email = `nori-sync-a-${uid}@example.test`
    const cust2Email = `nori-sync-b-${uid}@example.test`
    const password = 'NoriSyncPass123!'
    trackedEmails.push(cust1Email, cust2Email)

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const phone1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const phone2Ctx = await browser.newContext({ viewport: { width: 412, height: 915 } })

    const adminCreds = getAdminCredentials()
    await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email: adminCreds.email, password: adminCreds.password, accountType: 'admin' },
    })

    for (const [ctx, email, name] of [
      [phone1Ctx, cust1Email, `Phone One ${uid}`],
      [phone2Ctx, cust2Email, `Phone Two ${uid}`],
    ] as const) {
      const res = await ctx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: name,
          email,
          password,
          confirmPassword: password,
          phone: '0912345678',
        },
      })
      expect(res.status()).toBe(201)
    }

    // Desktop Admin verifies new customer immediately appears in shared SQLite DB
    const custListRes = await adminCtx.request.get(
      `${ORIGIN}/nori-api/dashboard/customers?q=${encodeURIComponent(cust1Email)}`,
    )
    expect(custListRes.status()).toBe(200)
    const foundCust = ((await custListRes.json()).data.items as Array<{ email: string }>).find(
      (c) => c.email === cust1Email,
    )
    expect(foundCust).toBeDefined()

    // Concurrent race from 2 independent mobile devices for same vehicle & dates -> strictly [201, 409]
    const win = await pickFreeVehicleWindow(phone1Ctx.request, 56)
    const [race1, race2] = await Promise.all([
      phone1Ctx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: win.vehicleId,
          startDate: win.startDate,
          endDate: win.endDate,
          customerPhone: '0912345678',
          idempotencyKey: `lan-race-1-${uid}`,
        },
      }),
      phone2Ctx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: win.vehicleId,
          startDate: win.startDate,
          endDate: win.endDate,
          customerPhone: '0987654321',
          idempotencyKey: `lan-race-2-${uid}`,
        },
      }),
    ])
    expect([race1.status(), race2.status()].sort((a, b) => a - b)).toEqual([201, 409])

    const winnerCtx = race1.status() === 201 ? phone1Ctx : phone2Ctx
    const winnerBooking = (await (race1.status() === 201 ? race1 : race2).json()).data

    // Pending booking modification from Phone syncs to Desktop Admin
    const editRes = await winnerCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: {
        id: winnerBooking.id,
        expectedRevision: winnerBooking.revision ?? 1,
        startDate: win.startDate,
        endDate: win.endDate,
        pickupTime: '10:00',
        returnTime: '17:00',
        note: `LAN edit ${uid}`,
      },
    })
    expect(editRes.status()).toBe(200)

    const adminBkRes = await adminCtx.request.get(
      `${ORIGIN}/nori-api/dashboard/bookings?status=PENDING`,
    )
    const adminBk = (
      (await adminBkRes.json()).data.items as Array<{ id: string; pickupTime: string }>
    ).find((b) => b.id === winnerBooking.id)
    expect(adminBk?.pickupTime).toBe('10:00')

    // Desktop Admin confirms booking -> Phone sees CONFIRMED status on refresh
    const approveRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
      headers: AUTH_HEADERS,
      data: { id: winnerBooking.id, status: 'CONFIRMED' },
    })
    expect(approveRes.status()).toBe(200)

    const phoneBkCheck = await winnerCtx.request.get(
      `${ORIGIN}/nori-api/bookings?id=${encodeURIComponent(winnerBooking.id)}`,
    )
    expect((await phoneBkCheck.json()).data.status).toBe('CONFIRMED')

    // Admin updates Vehicle daily price -> Phone sees updated quote & Public UI reflects updated content without localhost URLs
    const phonePage = await phone1Ctx.newPage()
    const origDailyPrice = Number(win.quote.dailyPrice ?? 1_500_000)
    savedVehiclePrice = { id: win.vehicleId, pricePerDay: origDailyPrice }
    const tempPrice = origDailyPrice + 10_000
    const updVehRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
      headers: AUTH_HEADERS,
      data: { id: win.vehicleId, pricePerDay: tempPrice },
    })
    expect(updVehRes.status()).toBe(200)

    const updatedQuoteRes = await phone1Ctx.request.get(
      `${ORIGIN}/nori-api/availability?vehicle=${win.vehicleId}&startDate=${win.startDate}&endDate=${win.endDate}`,
    )
    expect(updatedQuoteRes.status()).toBe(200)
    expect((await updatedQuoteRes.json()).data.dailyPrice).toBe(tempPrice)

    // Verify phone fleet API reflects Admin vehicle update immediately (cache invalidation)
    const phoneFleetRes = await phone1Ctx.request.get(
      `${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`,
    )
    expect(phoneFleetRes.status()).toBe(200)
    const updatedVehView = (
      (await phoneFleetRes.json()).data as Array<{ id: string; pricePerDay: number | null }>
    ).find((v) => v.id === win.vehicleId)
    expect(updatedVehView?.pricePerDay).toBe(tempPrice)

    // Restore vehicle daily price right away too (also guarded in afterAll)
    await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
      headers: AUTH_HEADERS,
      data: { id: win.vehicleId, pricePerDay: origDailyPrice },
    })
    savedVehiclePrice = null

    await phonePage.goto('/vehicles/toyota-fortuner', { waitUntil: 'domcontentloaded' })
    // Verify all loaded <img> tags render cleanly and never point to a wrong origin or hardcoded localhost
    for (const imgRoute of ['/', '/vehicles', '/vehicles/toyota-fortuner']) {
      await phonePage.goto(imgRoute, { waitUntil: 'load' })
      const imgAudit = await phonePage.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')]
        const pageOrigin = window.location.origin
        const isLocalhostHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
        const badOriginImgs = imgs
          .map((img) => img.getAttribute('src') || '')
          .filter((src) => {
            if (!/^https?:\/\//i.test(src)) return false
            try {
              const u = new URL(src)
              if (u.origin !== pageOrigin) return true
              if (!isLocalhostHost && /^(localhost|127\.0\.0\.1)$/i.test(u.hostname)) return true
              return false
            } catch {
              return true
            }
          })
        const brokenVisible = imgs
          .filter((img) => img.complete && img.offsetWidth > 0 && img.naturalWidth === 0)
          .map((img) => img.getAttribute('src') || '')
        return { total: imgs.length, badOriginImgs, brokenVisible }
      })
      expect(imgAudit.total).toBeGreaterThan(0)
      expect(imgAudit.badOriginImgs).toEqual([])
      expect(imgAudit.brokenVisible).toEqual([])
    }

    await adminCtx.close()
    await phone1Ctx.close()
    await phone2Ctx.close()
  })

  test('4. Multi-device responsive viewport matrix (320px–1920px + landscape), touch targets & HTTP LAN Secure Context check', async ({
    page,
  }) => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 430, height: 932 },
      { width: 844, height: 390 }, // Phone landscape
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]

    for (const vp of viewports) {
      await page.setViewportSize(vp)
      for (const route of ['/', '/vehicles', '/login']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `Overflow on ${route} at ${vp.width}x${vp.height}`).toBeLessThanOrEqual(4)
      }
    }

    // Touch target & Secure Context audit on mobile LAN viewport
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const navStats = await page.evaluate(() => {
      const navLinks = [...document.querySelectorAll('nav[aria-label*="di động"] a')]
      const heights = navLinks.map((el) => el.getBoundingClientRect().height)
      return {
        navCount: navLinks.length,
        minHeight: heights.length ? Math.min(...heights) : 0,
        isSecureContext: window.isSecureContext,
        origin: window.location.origin,
      }
    })
    expect(navStats.navCount).toBe(5)
    expect(navStats.minHeight).toBeGreaterThanOrEqual(44)
    if (!/^(localhost|127\.0\.0\.1)$/i.test(new URL(navStats.origin).hostname)) {
      // Plain HTTP over LAN IP is intentionally not a browser Secure Context (PWA SW/install require HTTPS)
      expect(navStats.isSecureContext).toBe(false)
    }
  })

  test('5. Concurrent business guards: 1-slot promo race, Admin approve vs Customer edit optimistic lock & mid-checkout price update', async ({
    browser,
  }) => {
    const uid = randomBytes(3).toString('hex')
    const cust1Email = `nori-race-a-${uid}@example.test`
    const cust2Email = `nori-race-b-${uid}@example.test`
    const password = 'NoriRacePass123!'
    trackedEmails.push(cust1Email, cust2Email)
    const promoCode = `LMT${uid.toUpperCase()}`
    trackedPromoCodes.push(promoCode)

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const phone1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const phone2Ctx = await browser.newContext({ viewport: { width: 412, height: 915 } })

    const adminCreds = getAdminCredentials()
    await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email: adminCreds.email, password: adminCreds.password, accountType: 'admin' },
    })

    for (const [ctx, email, name] of [
      [phone1Ctx, cust1Email, `Race Cust One ${uid}`],
      [phone2Ctx, cust2Email, `Race Cust Two ${uid}`],
    ] as const) {
      const reg = await ctx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: name,
          email,
          password,
          confirmPassword: password,
          phone: '0912345678',
        },
      })
      expect(reg.status()).toBe(201)
    }

    // Admin creates 1-slot limited promo (usageLimit: 1)
    const promoRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
      headers: AUTH_HEADERS,
      data: {
        code: promoCode,
        name: `Khuyến mãi 1 suất ${uid}`,
        discountType: 'FIXED',
        discountValue: 150_000,
        usageLimit: 1,
        minDays: 1,
        appliesTo: 'RENT',
        active: true,
      },
    })
    expect(promoRes.status()).toBe(201)

    // 5a. Two concurrent customers race for the same 1-slot promo
    const win1 = await pickFreeVehicleWindow(phone1Ctx.request, 62, 2)
    const win2 = await pickFreeVehicleWindow(phone2Ctx.request, 65, 2)
    const [raceA, raceB] = await Promise.all([
      phone1Ctx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: win1.vehicleId,
          startDate: win1.startDate,
          endDate: win1.endDate,
          customerPhone: '0912345678',
          promoCode,
          idempotencyKey: `race-promo-1-${uid}`,
        },
      }),
      phone2Ctx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: win2.vehicleId,
          startDate: win2.startDate,
          endDate: win2.endDate,
          customerPhone: '0987654321',
          promoCode,
          idempotencyKey: `race-promo-2-${uid}`,
        },
      }),
    ])
    expect([raceA.status(), raceB.status()].sort((a, b) => a - b)).toEqual([201, 409])

    // Verify promo usage count is strictly 1 and remaining uses is 0
    const promoCheck = await adminCtx.request.get(
      `${ORIGIN}/nori-api/dashboard/promotions?q=${promoCode}`,
    )
    expect(promoCheck.status()).toBe(200)
    const checkedPromo = (
      (await promoCheck.json()).data.items as Array<{
        code: string
        usedCount: number
        remainingUses: number
      }>
    ).find((p) => p.code === promoCode)
    expect(checkedPromo?.usedCount).toBe(1)
    expect(checkedPromo?.remainingUses).toBe(0)

    // 5b. Admin approve racing Customer pending edit (Optimistic locking & status lock)
    const winnerRes = raceA.status() === 201 ? raceA : raceB
    const winnerCtx = raceA.status() === 201 ? phone1Ctx : phone2Ctx
    const winnerBooking = (await winnerRes.json()).data

    const [adminApprove, custEdit] = await Promise.all([
      adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: winnerBooking.id, status: 'CONFIRMED' },
      }),
      winnerCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: winnerBooking.id,
          expectedRevision: 1,
          pickupTime: '11:00',
          note: 'Racing edit',
        },
      }),
    ])
    expect([adminApprove.status(), custEdit.status()]).toContain(200)

    // Ensure booking is CONFIRMED for subsequent stale-edit check
    if (adminApprove.status() !== 200) {
      const confirmRetry = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: winnerBooking.id, status: 'CONFIRMED' },
      })
      expect(confirmRetry.status()).toBe(200)
    }

    // Now that booking is CONFIRMED, any customer edit with stale revision 1 MUST be rejected with 409
    const staleEdit = await winnerCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: {
        id: winnerBooking.id,
        expectedRevision: 1,
        pickupTime: '12:00',
        note: 'Stale edit after confirmation',
      },
    })
    expect(staleEdit.status()).toBe(409)

    // 5c. Mid-checkout price change guard: Admin updates vehicle price while customer is on checkout
    const cust3Email = `nori-price-guard-${uid}@example.test`
    trackedEmails.push(cust3Email)
    const phone3Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const reg3 = await phone3Ctx.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: `Price Guard Cust ${uid}`,
        email: cust3Email,
        password,
        confirmPassword: password,
        phone: '0912345678',
      },
    })
    expect(reg3.status()).toBe(201)

    const win3 = await pickFreeVehicleWindow(phone3Ctx.request, 68, 2)
    const origDailyPrice = Number(win3.quote.dailyPrice ?? 1_500_000)
    savedVehiclePrice = { id: win3.vehicleId, pricePerDay: origDailyPrice }

    const phonePage = await phone3Ctx.newPage()
    try {
      await phonePage.goto(
        `/checkout?vehicle=${encodeURIComponent(win3.vehicleId)}&startDate=${win3.startDate}&endDate=${win3.endDate}`,
        { waitUntil: 'domcontentloaded' },
      )
      await expect(phonePage.locator('#checkout-phone')).toBeVisible({ timeout: 15_000 })

      // While customer is on checkout, Admin raises vehicle daily price by 50,000 VND
      const newPrice = origDailyPrice + 50_000
      const patchVehRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: { id: win3.vehicleId, pricePerDay: newPrice },
      })
      expect(patchVehRes.status()).toBe(200)

      // Customer submits form with stale expectedTotalPrice -> rejected with 409
      await phonePage.fill('#checkout-phone', '0912345678')
      const termsPriceCheck = phonePage.locator('#checkout-terms')
      await termsPriceCheck.scrollIntoViewIfNeeded()
      await termsPriceCheck.check()

      const [staleSubmitRes] = await Promise.all([
        phonePage.waitForResponse(
          (res) => res.url().includes('/nori-api/bookings') && res.request().method() === 'POST',
        ),
        phonePage.locator('button[type="submit"]').click(),
      ])
      expect(staleSubmitRes.status()).toBe(409)
      const errJson = await staleSubmitRes.json().catch(() => null)
      const errMsg = errJson?.error?.message ?? errJson?.message
      expect(errMsg).toContain('cập nhật')

      // UI automatically refreshes quote to new price; customer submits again -> succeeds 201
      await expect(phonePage.locator('button[type="submit"]')).toBeEnabled({ timeout: 10_000 })
      const [freshSubmitRes] = await Promise.all([
        phonePage.waitForResponse(
          (res) => res.url().includes('/nori-api/bookings') && res.request().method() === 'POST',
        ),
        phonePage.locator('button[type="submit"]').click(),
      ])
      expect(freshSubmitRes.status()).toBe(201)
      const freshBooking = (await freshSubmitRes.json()).data
      expect(freshBooking.dailyPriceSnapshot).toBe(newPrice)
    } finally {
      await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: { id: win3.vehicleId, pricePerDay: origDailyPrice },
      })
      savedVehiclePrice = null
      await phone3Ctx.close()
    }

    await adminCtx.close()
    await phone1Ctx.close()
    await phone2Ctx.close()
  })

  test('6. Admin Hero/Banner/Vehicle image live refresh, repeated booking idempotency & simulated Wi-Fi disconnect/reconnect', async ({
    browser,
  }) => {
    const uid = randomBytes(3).toString('hex')
    const custEmail = `nori-idem-${uid}@example.test`
    const password = 'NoriIdemPass123!'
    trackedEmails.push(custEmail)

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })

    const adminCreds = getAdminCredentials()
    await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
      headers: AUTH_HEADERS,
      data: { email: adminCreds.email, password: adminCreds.password, accountType: 'admin' },
    })

    const regRes = await phoneCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: `Idem Cust ${uid}`,
        email: custEmail,
        password,
        confirmPassword: password,
        phone: '0912345678',
      },
    })
    expect(regRes.status()).toBe(201)

    // 6a. Admin Hero & Maintenance Banner live publish -> Customer refresh sees updates without localhost URLs
    const curContentRes = await adminCtx.request.get(`${ORIGIN}/nori-api/dashboard/content`)
    expect(curContentRes.status()).toBe(200)
    const curContent = (await curContentRes.json()).data
    const origHeroSlides = curContent.heroSlides ?? []
    const origBannerEnabled = Boolean(curContent.maintenanceBannerEnabled)
    const origBannerText = curContent.maintenanceBannerText ?? ''

    const testBannerText = `Thong bao bao tri LAN ${uid}`
    const testHeroTitle = `NORI LAN TEST ${uid}`
    const updatedSlides = [...origHeroSlides]
    if (updatedSlides.length > 0) {
      updatedSlides[0] = { ...updatedSlides[0], titleFirst: testHeroTitle }
    }

    try {
      const pubRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: {
          _status: 'published',
          heroSlides: updatedSlides,
          maintenanceBannerEnabled: true,
          maintenanceBannerText: testBannerText,
        },
      })
      expect(pubRes.status()).toBe(200)

      const phonePage = await phoneCtx.newPage()
      await phonePage.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(phonePage.getByText(testBannerText)).toBeVisible({ timeout: 10_000 })
      if (updatedSlides.length > 0) {
        await expect(phonePage.getByText(testHeroTitle)).toBeVisible({ timeout: 10_000 })
      }

      // Verify all image tags on homepage load properly and contain no localhost references
      const homeImgAudit = await phonePage.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')]
        const bad = imgs.filter(
          (img) => img.src.includes('localhost') && !window.location.hostname.includes('localhost'),
        )
        const broken = imgs.filter(
          (img) => img.complete && img.offsetWidth > 0 && img.naturalWidth === 0,
        )
        return { count: imgs.length, badCount: bad.length, brokenCount: broken.length }
      })
      expect(homeImgAudit.count).toBeGreaterThan(0)
      expect(homeImgAudit.badCount).toBe(0)
      expect(homeImgAudit.brokenCount).toBe(0)
    } finally {
      await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: {
          _status: 'published',
          heroSlides: origHeroSlides,
          maintenanceBannerEnabled: origBannerEnabled,
          maintenanceBannerText: origBannerText,
        },
      })
    }

    // 6b. Repeated booking submit idempotency (BK-15): 3 consecutive requests with identical idempotencyKey
    const winIdem = await pickFreeVehicleWindow(phoneCtx.request, 74, 2)
    const idemKey = `lan-idem-key-${uid}`
    const [p1, p2, p3] = await Promise.all([
      phoneCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: winIdem.vehicleId,
          startDate: winIdem.startDate,
          endDate: winIdem.endDate,
          customerPhone: '0912345678',
          idempotencyKey: idemKey,
        },
      }),
      phoneCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: winIdem.vehicleId,
          startDate: winIdem.startDate,
          endDate: winIdem.endDate,
          customerPhone: '0912345678',
          idempotencyKey: idemKey,
        },
      }),
      phoneCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: winIdem.vehicleId,
          startDate: winIdem.startDate,
          endDate: winIdem.endDate,
          customerPhone: '0912345678',
          idempotencyKey: idemKey,
        },
      }),
    ])

    const pStatuses = [p1.status(), p2.status(), p3.status()]
    expect(pStatuses.every((s) => s === 201 || s === 200)).toBe(true)

    const id1 = (await p1.json()).data.id
    const id2 = (await p2.json()).data.id
    const id3 = (await p3.json()).data.id
    expect(id1).toBeTruthy()
    expect(id2).toBe(id1)
    expect(id3).toBe(id1)

    // Verify isolated SQLite DB has strictly 1 booking row for this idempotencyKey
    const db = new DatabaseSync(getDbPath())
    try {
      const bRows = db.prepare('SELECT id FROM bookings WHERE idempotency_key = ?').all(idemKey)
      expect(bRows.length).toBe(1)
    } finally {
      db.close()
    }

    // 6c. Simulated Wi-Fi disconnect and reconnect mid-booking
    // Case 1: Drop before server receives request
    const winDrop1 = await pickFreeVehicleWindow(phoneCtx.request, 78, 2)
    const phonePage = await phoneCtx.newPage()
    await phonePage.goto(
      `/checkout?vehicle=${encodeURIComponent(winDrop1.vehicleId)}&startDate=${winDrop1.startDate}&endDate=${winDrop1.endDate}`,
      { waitUntil: 'domcontentloaded' },
    )
    await expect(phonePage.locator('#checkout-phone')).toBeVisible({ timeout: 15_000 })
    await phonePage.fill('#checkout-phone', '0912345678')
    const termsCheckbox = phonePage.locator('#checkout-terms')
    await termsCheckbox.scrollIntoViewIfNeeded()
    await termsCheckbox.check()

    let shouldAbort = true
    await phonePage.route('**/nori-api/bookings', async (route) => {
      if (shouldAbort && route.request().method() === 'POST') {
        shouldAbort = false
        await route.abort('internetdisconnected')
      } else {
        await route.continue()
      }
    })

    await phonePage.locator('button[type="submit"]').click()
    // UI displays error notice
    await expect(phonePage.locator('button[type="submit"]')).toBeEnabled({ timeout: 10_000 })

    // Verify zero bookings created in DB for winDrop1 so far
    const dbCheck1 = new DatabaseSync(getDbPath())
    try {
      const checkRows = dbCheck1
        .prepare('SELECT id FROM bookings WHERE start_date = ? AND vehicle_id = ?')
        .all(winDrop1.startDate, winDrop1.vehicleId)
      expect(checkRows.length).toBe(0)
    } finally {
      dbCheck1.close()
    }

    // Now simulated Wi-Fi is restored (route continues) -> user clicks submit again
    const [reconnectSubmit] = await Promise.all([
      phonePage.waitForResponse(
        (res) => res.url().includes('/nori-api/bookings') && res.request().method() === 'POST',
      ),
      phonePage.locator('button[type="submit"]').click(),
    ])
    expect(reconnectSubmit.status()).toBe(201)
    await phonePage.unroute('**/nori-api/bookings')

    // Case 2: Server commits 201, then client retries with same idempotencyKey after reconnect
    const winDrop2 = await pickFreeVehicleWindow(phoneCtx.request, 82, 2)
    const dropIdemKey = `lan-drop2-key-${uid}`
    const firstCommitRes = await phoneCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: {
        vehicle: winDrop2.vehicleId,
        startDate: winDrop2.startDate,
        endDate: winDrop2.endDate,
        customerPhone: '0912345678',
        idempotencyKey: dropIdemKey,
      },
    })
    expect(firstCommitRes.status()).toBe(201)
    const committedId = (await firstCommitRes.json()).data.id

    // Client reconnects and retries with same idempotencyKey -> server returns 200 with same booking ID
    const retryRes = await phoneCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: {
        vehicle: winDrop2.vehicleId,
        startDate: winDrop2.startDate,
        endDate: winDrop2.endDate,
        customerPhone: '0912345678',
        idempotencyKey: dropIdemKey,
      },
    })
    expect(retryRes.status()).toBe(200)
    const retriedId = (await retryRes.json()).data.id
    expect(retriedId).toBe(committedId)

    // Verify strictly 1 booking exists in SQLite DB
    const dbCheck2 = new DatabaseSync(getDbPath())
    try {
      const count = dbCheck2
        .prepare('SELECT count(*) as count FROM bookings WHERE idempotency_key = ?')
        .get(dropIdemKey) as { count: number }
      expect(count.count).toBe(1)
    } finally {
      dbCheck2.close()
    }

    await adminCtx.close()
    await phoneCtx.close()
  })
})
