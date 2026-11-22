import { test, expect } from '@playwright/test'
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

function cleanupPromoTestRecords({
  customerEmails = [],
  promoCodes = [],
}: {
  customerEmails?: string[]
  promoCodes?: string[]
}) {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const email of customerEmails) {
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

    for (const code of promoCodes) {
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

function findFreeWindow(
  vehicleId: string,
  durationDays: number,
  minOffset = 5,
): {
  startDate: string
  endDate: string
} {
  const db = new DatabaseSync(getDbPath(), { readOnly: true })
  try {
    const today = businessToday()
    const busyRows = db
      .prepare('SELECT day FROM rental_days WHERE vehicle_id = ?')
      .all(vehicleId) as { day: string }[]
    const maintRows = db
      .prepare(
        "SELECT start_date, end_date FROM maintenance_schedules WHERE vehicle_id = ? AND status IN ('SCHEDULED', 'IN_PROGRESS')",
      )
      .all(vehicleId) as { start_date: string; end_date: string }[]
    const busy = new Set(busyRows.map((r) => r.day))
    for (let offset = minOffset; offset <= 80 - durationDays; offset += 1) {
      const s = addDays(today, offset)
      const e = addDays(s, durationDays)
      let ok = true
      for (let d = 0; d < durationDays; d += 1) {
        if (busy.has(addDays(s, d))) {
          ok = false
          break
        }
      }
      if (ok) {
        for (const m of maintRows) {
          if (m.start_date <= e && m.end_date >= s) {
            ok = false
            break
          }
        }
      }
      if (ok) return { startDate: s, endDate: e }
    }
    throw new Error(`Không tìm được lịch trống ${durationDays} ngày cho xe ${vehicleId}`)
  } finally {
    db.close()
  }
}

async function registerCustomer(
  request: import('@playwright/test').APIRequestContext,
  tag: string,
) {
  const email = `qa-promo-${tag}@example.test`
  const password = `QaPass1!${tag}`
  const phone = `09${String(Math.floor(10000000 + Math.random() * 89999999))}`
  const res = await request.post(`${ORIGIN}/nori-api/auth/register`, {
    headers: AUTH_HEADERS,
    data: {
      fullName: `Khách QA ${tag}`,
      email,
      phone,
      password,
      confirmPassword: password,
    },
  })
  expect(res.status()).toBe(201)
  return { email, password, phone }
}

test.describe('NORI QA Regression — Hydration, Promo Codes, Pricing, Checkout & Lifecycle', () => {
  test('QA-E2E-01: Zero Hydration/Console errors under browser-extension __processed_ body mutation & responsive viewports + secret promo access guard', async ({
    page,
    request,
  }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    // Simulate Kaspersky/security browser extension mutating <body> with __processed_<uuid>__ BEFORE React hydrates
    await page.addInitScript(() => {
      const inject = () => {
        if (document.body && !document.body.hasAttribute('__processed_qa_ext_uuid__')) {
          document.body.setAttribute('__processed_qa_ext_uuid__', 'true')
        }
      }
      const startObserver = () => {
        inject()
        if (document.documentElement) {
          new MutationObserver(() => inject()).observe(document.documentElement, {
            childList: true,
            subtree: true,
          })
        }
      }
      if (document.documentElement) {
        startObserver()
      } else {
        window.addEventListener('DOMContentLoaded', startObserver, { once: true })
      }
    })

    const viewports = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]

    for (const vp of viewports) {
      await page.setViewportSize(vp)
      await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
      await expect(page.locator('body')).toHaveAttribute('__processed_qa_ext_uuid__', 'true')
      await page.goto(`${ORIGIN}/vehicles`, { waitUntil: 'networkidle' })
      await page.goto(`${ORIGIN}/vehicles/toyota-fortuner`, { waitUntil: 'networkidle' })
    }

    const hydrationMessages = [...consoleErrors, ...pageErrors].filter((m) =>
      /hydrat|didn't match|server rendered HTML/i.test(m),
    )
    expect(hydrationMessages).toEqual([])
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])

    // Verify anonymous Payload REST API /api/promotions does NOT leak secret promo codes publicly
    const anonPromoList = await request.get(`${ORIGIN}/api/promotions`)
    expect([401, 403]).toContain(anonPromoList.status())
  })

  test('QA-E2E-02: Admin Promotions CRUD validation, runtime status badges, remaining uses & sample discount simulator', async ({
    browser,
  }) => {
    const tag = randomBytes(3).toString('hex').toUpperCase()
    const codeLive = `QALIVE${tag}`
    const codeUpcoming = `QAUP${tag}`
    const codeExpired = `QAEXP${tag}`
    const { email, password } = getAdminCredentials()
    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()

    try {
      const loginRes = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email, password },
      })
      expect(loginRes.status()).toBe(200)

      // Server-side validation barriers on Admin Promotions API
      const over100Res = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
        headers: AUTH_HEADERS,
        data: {
          code: `QAOVER${tag}`,
          name: 'Sai quá 100%',
          discountType: 'PERCENT',
          discountValue: 150,
        },
      })
      expect(over100Res.status()).toBe(400)

      const negRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
        headers: AUTH_HEADERS,
        data: {
          code: `QANEG${tag}`,
          name: 'Sai số âm',
          discountType: 'FIXED',
          discountValue: -50000,
        },
      })
      expect(negRes.status()).toBe(400)

      const reversedDatesRes = await adminCtx.request.post(
        `${ORIGIN}/nori-api/dashboard/promotions`,
        {
          headers: AUTH_HEADERS,
          data: {
            code: `QADATE${tag}`,
            name: 'Ngày kết thúc trước bắt đầu',
            discountType: 'PERCENT',
            discountValue: 10,
            validFrom: '2026-12-20',
            validTo: '2026-12-10',
          },
        },
      )
      expect(reversedDatesRes.status()).toBe(400)

      const today = businessToday()
      // Create Upcoming & Expired promos via API to verify runtime badges in Admin UI
      expect(
        (
          await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
            headers: AUTH_HEADERS,
            data: {
              code: codeUpcoming,
              name: `Chương trình sắp mở ${tag}`,
              discountType: 'PERCENT',
              discountValue: 15,
              validFrom: addDays(today, 7),
              validTo: addDays(today, 20),
              usageLimit: 5,
              active: true,
            },
          })
        ).status(),
      ).toBe(201)

      expect(
        (
          await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
            headers: AUTH_HEADERS,
            data: {
              code: codeExpired,
              name: `Chương trình đã khép lại ${tag}`,
              discountType: 'FIXED',
              discountValue: 100000,
              validFrom: '2026-01-01',
              validTo: '2026-01-15',
              active: true,
            },
          })
        ).status(),
      ).toBe(201)

      // Open Admin Promotions UI, create a live promo via modal, verify VND format & Simulator
      await adminPage.goto(`${ORIGIN}/dashboard/promotions`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('button', { name: 'Tạo mã khuyến mãi' }).click()
      await adminPage.locator('#promo-code').fill(codeLive)
      await adminPage.locator('#promo-name').fill(`Ưu đãi trực tiếp QA ${tag}`)
      await adminPage.locator('#promo-type').selectOption('PERCENT')
      await adminPage.locator('#promo-val').fill('10')
      await adminPage.locator('#promo-max').fill('250000')
      await adminPage.locator('#promo-mindays').fill('2')
      await adminPage.locator('#promo-limit').fill('4')
      await adminPage.getByRole('button', { name: 'Lưu khuyến mãi' }).click()

      const liveCard = adminPage.locator(`article[data-promo-code="${codeLive}"]`)
      await expect(liveCard).toBeVisible()
      await expect(liveCard).toContainText('Đang diễn ra')
      await expect(liveCard).toContainText('250.000 ₫')
      await expect(liveCard).toContainText('4 lượt')

      const upcomingCard = adminPage.locator(`article[data-promo-code="${codeUpcoming}"]`)
      await expect(upcomingCard).toContainText('Chưa bắt đầu')

      const expiredCard = adminPage.locator(`article[data-promo-code="${codeExpired}"]`)
      await expect(expiredCard).toContainText('Hết hạn')

      // Test Sample Discount Simulator on liveCard: 3,000,000 VND * 10% = 300,000 -> capped at 250,000 VND -> 2,750,000 VND
      await liveCard.getByRole('button', { name: 'Thử mức giảm' }).click()
      await adminPage.locator('#sim-order-amount').fill('3000000')
      await adminPage.locator('#sim-rental-days').fill('3')
      const simSection = adminPage.getByRole('region', {
        name: 'Kiểm tra thử mức giảm khuyến mãi',
      })
      await expect(simSection).toContainText('Đủ điều kiện áp dụng')
      await expect(simSection).toContainText('-250.000 ₫')
      await expect(simSection).toContainText('2.750.000 ₫')

      // Duplicate code creation must return 409
      const dupRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
        headers: AUTH_HEADERS,
        data: {
          code: codeLive,
          name: 'Trùng mã',
          discountType: 'PERCENT',
          discountValue: 10,
        },
      })
      expect(dupRes.status()).toBe(409)

      // Delete promo via UI confirmation dialog
      await expiredCard.getByRole('button', { name: `Xóa mã ${codeExpired}` }).click()
      await adminPage.getByRole('button', { name: 'Xác nhận xóa' }).click()
      await expect(expiredCard).toHaveCount(0)
    } finally {
      await adminCtx.close()
      cleanupPromoTestRecords({ promoCodes: [codeLive, codeUpcoming, codeExpired] })
    }
  })

  test('QA-E2E-03: Full Checkout Promo State Machine — specific errors, clear/remove bug fix, switching promos, refresh draft & pricing/deposit parity', async ({
    browser,
    request,
  }) => {
    const tag = randomBytes(3).toString('hex').toUpperCase()
    const promoValidPct = `QAPCT${tag}`
    const promoValidFix = `QAFIX${tag}`
    const promoUpcoming = `QANOTYET${tag}`
    const promoExpired = `QAOLD${tag}`
    const promoSaleOnly = `QASALE${tag}`
    const promoMinDays = `QAMIN10D${tag}`
    const promoExhausted = `QAFULL${tag}`
    const allPromos = [
      promoValidPct,
      promoValidFix,
      promoUpcoming,
      promoExpired,
      promoSaleOnly,
      promoMinDays,
      promoExhausted,
    ]
    const customerEmails: string[] = []

    const adminCtx = await browser.newContext()
    const custCtx = await browser.newContext()
    const page = await custCtx.newPage()

    try {
      const { email: adminEmail, password: adminPassword } = getAdminCredentials()
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      const today = businessToday()
      for (const p of [
        {
          code: promoValidPct,
          name: 'Giảm 10% tối đa 300k',
          discountType: 'PERCENT',
          discountValue: 10,
          maxDiscount: 300000,
          minDays: 2,
          appliesTo: 'RENT',
          validFrom: today,
          validTo: addDays(today, 30),
          usageLimit: 5,
          active: true,
        },
        {
          code: promoValidFix,
          name: 'Giảm cố định 150k',
          discountType: 'FIXED',
          discountValue: 150000,
          minDays: 1,
          appliesTo: 'RENT',
          validFrom: today,
          validTo: addDays(today, 30),
          usageLimit: 5,
          active: true,
        },
        {
          code: promoUpcoming,
          name: 'Chưa bắt đầu',
          discountType: 'PERCENT',
          discountValue: 10,
          minDays: 1,
          appliesTo: 'RENT',
          validFrom: addDays(today, 10),
          validTo: addDays(today, 25),
          active: true,
        },
        {
          code: promoExpired,
          name: 'Đã hết hạn',
          discountType: 'PERCENT',
          discountValue: 10,
          minDays: 1,
          appliesTo: 'RENT',
          validFrom: '2026-01-01',
          validTo: '2026-01-10',
          active: true,
        },
        {
          code: promoSaleOnly,
          name: 'Chỉ áp dụng mua xe',
          discountType: 'FIXED',
          discountValue: 500000,
          minDays: 1,
          appliesTo: 'SALE',
          active: true,
        },
        {
          code: promoMinDays,
          name: 'Tối thiểu 10 ngày',
          discountType: 'PERCENT',
          discountValue: 15,
          minDays: 10,
          appliesTo: 'RENT',
          active: true,
        },
        {
          code: promoExhausted,
          name: 'Hết lượt',
          discountType: 'FIXED',
          discountValue: 100000,
          minDays: 1,
          appliesTo: 'RENT',
          usageLimit: 1,
          active: true,
        },
      ]) {
        const r = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
          headers: AUTH_HEADERS,
          data: p,
        })
        expect(r.status()).toBe(201)
      }
      // Mark promoExhausted as used_count = 1 in isolated test DB
      {
        const db = new DatabaseSync(getDbPath())
        try {
          db.prepare('UPDATE promotions SET used_count = 1 WHERE code = ?').run(promoExhausted)
        } finally {
          db.close()
        }
      }

      // Pick a READY rental vehicle
      const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
      const fleetJson = await fleetRes.json()
      const vehicles = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
      const targetVehicle = vehicles.find(
        (v: { operationStatus: string; pricePerDay: number }) =>
          v.operationStatus === 'READY' && v.pricePerDay > 0,
      )
      expect(targetVehicle).toBeTruthy()

      const window1 = findFreeWindow(targetVehicle.id, 3, 6)
      const checkoutUrl1 = `${ORIGIN}/checkout?vehicle=${targetVehicle.id}&startDate=${window1.startDate}&endDate=${window1.endDate}`

      // 1. Unauthenticated visitor on Checkout sees login prompt & Submit button is disabled
      await page.goto(checkoutUrl1, { waitUntil: 'networkidle' })
      await expect(page.getByRole('link', { name: /Đăng nhập để tiếp tục/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Xác nhận đặt thuê/i })).toBeDisabled()

      // Register & authenticate customer in custCtx
      const cust = await registerCustomer(custCtx.request, `c3-${tag.toLowerCase()}`)
      customerEmails.push(cust.email)

      // 2. Customer opens Checkout authenticated
      await page.goto(checkoutUrl1, { waitUntil: 'networkidle' })
      const promoInput = page.locator('#checkout-promo')
      const submitBtn = page.getByRole('button', { name: /Xác nhận đặt thuê/i })

      // Terms unchecked -> Submit disabled
      await expect(submitBtn).toBeDisabled()

      // Verify all specific promo error messages
      const cases: [string, RegExp][] = [
        ['MAKHONGTONTAI999', /không tồn tại/i],
        [promoUpcoming, /chưa bắt đầu/i],
        [promoExpired, /đã kết thúc/i],
        [promoSaleOnly, /không áp dụng cho dịch vụ này/i],
        [promoMinDays, /tối thiểu 10 ngày/i],
        [promoExhausted, /hết lượt sử dụng/i],
      ]
      for (const [codeToTry, pattern] of cases) {
        await promoInput.fill(codeToTry)
        await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
        await expect(page.locator('#checkout-promo-message')).toContainText(pattern)
      }

      // 3. CRITICAL BUG REGRESSION: After invalid promo error, clearing the input MUST clear error AND allow booking without promo!
      await promoInput.fill('')
      await expect(page.locator('#checkout-promo-message')).toHaveCount(0)

      // Invalid phone check preserves customer note
      await page.locator('#checkout-note').fill('Ghi chú giữ nguyên khi báo lỗi SĐT')
      await page.locator('#checkout-phone').fill('abc')
      await page.locator('#checkout-terms').check()
      await submitBtn.click()
      await expect(page.getByText(/số điện thoại liên hệ hợp lệ/i)).toBeVisible()
      await expect(page.locator('#checkout-note')).toHaveValue('Ghi chú giữ nguyên khi báo lỗi SĐT')

      // Fix phone and confirm booking WITHOUT promo (proves stale appliedPromo is NOT sent!)
      await page.locator('#checkout-phone').fill(cust.phone)
      await submitBtn.click()
      await expect(page.getByText('Đã tiếp nhận hành trình mới.')).toBeVisible()

      // Cancel that first booking to free dates & test second booking with promo switching + refresh + remove
      const list1Res = await custCtx.request.get(`${ORIGIN}/nori-api/bookings`)
      const list1 = (await list1Res.json()).data
      expect(list1.docs[0].promoCode).toBeNull()
      await custCtx.request.patch(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: list1.docs[0].id },
      })

      // 4. Open Checkout on window2 -> Apply promoValidPct -> Switch to promoValidFix -> Reload page -> Click "Bỏ mã khuyến mãi" -> Re-apply promoValidPct -> Confirm!
      const window2 = findFreeWindow(targetVehicle.id, 3, 12)
      const baseQuoteRes = await custCtx.request.get(
        `${ORIGIN}/nori-api/availability?vehicle=${targetVehicle.id}&startDate=${window2.startDate}&endDate=${window2.endDate}`,
      )
      const baseQuote = (await baseQuoteRes.json()).data
      const pctQuoteRes = await custCtx.request.get(
        `${ORIGIN}/nori-api/availability?vehicle=${targetVehicle.id}&startDate=${window2.startDate}&endDate=${window2.endDate}&promoCode=${promoValidPct}`,
      )
      const pctQuote = (await pctQuoteRes.json()).data
      expect(pctQuote.promoDiscountAmount).toBeGreaterThan(0)
      expect(pctQuote.estimatedTotal).toBe(baseQuote.estimatedTotal - pctQuote.promoDiscountAmount)
      // Deposit is strictly separate from remainingAmount!
      expect(pctQuote.remainingAmount).toBe(pctQuote.estimatedTotal)

      await page.goto(
        `${ORIGIN}/checkout?vehicle=${targetVehicle.id}&startDate=${window2.startDate}&endDate=${window2.endDate}`,
        { waitUntil: 'networkidle' },
      )
      await promoInput.fill(promoValidPct)
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoValidPct}`)).toBeVisible()
      await expect(page.getByText(/Mã đã được áp dụng thành công/i)).toBeVisible()

      // Switch directly to promoValidFix
      await promoInput.fill(promoValidFix)
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoValidFix}`)).toBeVisible()

      // Refresh Checkout page -> sessionStorage restores confirmed promo
      await page.reload({ waitUntil: 'networkidle' })
      await expect(page.locator('#checkout-promo')).toHaveValue(promoValidFix)
      await expect(page.getByText(`Đang áp dụng: ${promoValidFix}`)).toBeVisible()

      // Click "Bỏ mã khuyến mãi" -> clears input, removes discount, shows "Đã bỏ mã khuyến mãi."
      await page.getByRole('button', { name: 'Bỏ mã khuyến mãi' }).click()
      await expect(page.locator('#checkout-promo')).toHaveValue('')
      await expect(page.getByText('Đã bỏ mã khuyến mãi.')).toBeVisible()

      // Re-apply promoValidPct and complete booking
      await promoInput.fill(promoValidPct)
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoValidPct}`)).toBeVisible()

      await page.locator('#checkout-terms').check()
      await submitBtn.click()
      await expect(page.getByText('Đã tiếp nhận hành trình mới.')).toBeVisible()

      // Verify quote-to-booking-to-Admin parity & deposit separation
      const custBookings = (await (await custCtx.request.get(`${ORIGIN}/nori-api/bookings`)).json())
        .data.docs
      const createdBooking = custBookings.find(
        (b: { promoCode: string | null }) => b.promoCode === promoValidPct,
      )
      expect(createdBooking).toBeTruthy()
      expect(createdBooking.totalPrice).toBe(pctQuote.estimatedTotal)
      expect(createdBooking.promoDiscountAmount).toBe(pctQuote.promoDiscountAmount)
      expect(createdBooking.depositSnapshot).toBe(pctQuote.depositAmount)
      expect(createdBooking.remainingAmount).toBe(pctQuote.estimatedTotal)

      const adminBookings = (
        await (
          await adminCtx.request.get(
            `${ORIGIN}/nori-api/dashboard/bookings?q=${encodeURIComponent(createdBooking.bookingKey)}`,
          )
        ).json()
      ).data.items
      expect(adminBookings[0].totalPrice).toBe(pctQuote.estimatedTotal)
      expect(adminBookings[0].remainingAmount).toBe(pctQuote.estimatedTotal)
    } finally {
      await adminCtx.close()
      await custCtx.close()
      cleanupPromoTestRecords({ customerEmails, promoCodes: allPromos })
    }
  })

  test('QA-E2E-04: Mid-Checkout Admin promo disable alert + transient network error recovery without consuming promo quota', async ({
    browser,
    request,
  }) => {
    const tag = randomBytes(3).toString('hex').toUpperCase()
    const promoMid = `QAMID${tag}`
    const customerEmails: string[] = []
    const adminCtx = await browser.newContext()
    const custCtx = await browser.newContext()
    const page = await custCtx.newPage()

    try {
      const { email: adminEmail, password: adminPassword } = getAdminCredentials()
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })
      const createPromoRes = await adminCtx.request.post(
        `${ORIGIN}/nori-api/dashboard/promotions`,
        {
          headers: AUTH_HEADERS,
          data: {
            code: promoMid,
            name: 'Mã thay đổi giữa chừng',
            discountType: 'FIXED',
            discountValue: 200000,
            minDays: 1,
            appliesTo: 'RENT',
            usageLimit: 2,
            active: true,
          },
        },
      )
      expect(createPromoRes.status()).toBe(201)
      const promoId = (await createPromoRes.json()).data.id

      const cust = await registerCustomer(custCtx.request, `c4-${tag.toLowerCase()}`)
      customerEmails.push(cust.email)

      const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
      const fleetJson = await fleetRes.json()
      const vehicles = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
      const targetVehicle = vehicles.find(
        (v: { operationStatus: string; pricePerDay: number }) =>
          v.operationStatus === 'READY' && v.pricePerDay > 0,
      )
      const win = findFreeWindow(targetVehicle.id, 2, 20)

      await page.goto(
        `${ORIGIN}/checkout?vehicle=${targetVehicle.id}&startDate=${win.startDate}&endDate=${win.endDate}`,
        { waitUntil: 'networkidle' },
      )
      await page.locator('#checkout-promo').fill(promoMid)
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await expect(page.getByText(`Đang áp dụng: ${promoMid}`)).toBeVisible()
      await page.locator('#checkout-note').fill('Khách kiểm tra mạng và Admin tắt mã')
      await page.locator('#checkout-terms').check()

      // 1. Simulate network failure on first booking submit -> must NOT create booking or consume promo
      let interceptOnce = true
      await page.route('**/nori-api/bookings', async (route) => {
        if (interceptOnce && route.request().method() === 'POST') {
          interceptOnce = false
          await route.abort('failed')
          return
        }
        await route.continue()
      })

      await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      await expect(page.getByText(/Không thể kết nối/i)).toBeVisible()

      {
        const db = new DatabaseSync(getDbPath(), { readOnly: true })
        try {
          const row = db
            .prepare('SELECT used_count FROM promotions WHERE code = ?')
            .get(promoMid) as { used_count: number }
          expect(row.used_count).toBe(0)
        } finally {
          db.close()
        }
      }

      // 2. Admin disables promoMid BEFORE customer retries confirm!
      const disableRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/promotions`, {
        headers: AUTH_HEADERS,
        data: { id: promoId, active: false },
      })
      expect(disableRes.status()).toBe(200)

      // Customer clicks confirm -> Backend rejects with clear inactive notice, quote refreshes to un-discounted price, customer note preserved!
      await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      await expect(page.getByText(/tạm ngưng áp dụng/i).first()).toBeVisible()
      await expect(page.locator('#checkout-note')).toHaveValue(
        'Khách kiểm tra mạng và Admin tắt mã',
      )

      // Customer removes disabled promo or confirms refreshed un-discounted quote consciously
      await page.getByRole('button', { name: 'Bỏ mã khuyến mãi' }).click()
      await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      await expect(page.getByText('Đã tiếp nhận hành trình mới.')).toBeVisible()
    } finally {
      await adminCtx.close()
      await custCtx.close()
      cleanupPromoTestRecords({ customerEmails, promoCodes: [promoMid] })
    }
  })

  test('QA-E2E-05: Concurrent races — 2 customers on 1-slot promo & 2 customers on same vehicle dates rollback promo cleanly', async ({
    browser,
    request,
  }) => {
    const tag = randomBytes(3).toString('hex').toUpperCase()
    const promoOneSlot = `QARACE1${tag}`
    const promoRollback = `QAROLL${tag}`
    const customerEmails: string[] = []

    const adminCtx = await browser.newContext()
    const custACtx = await browser.newContext()
    const custBCtx = await browser.newContext()

    try {
      const { email: adminEmail, password: adminPassword } = getAdminCredentials()
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      for (const p of [
        {
          code: promoOneSlot,
          name: 'Chỉ còn đúng 1 lượt',
          discountType: 'FIXED',
          discountValue: 100000,
          minDays: 1,
          appliesTo: 'RENT',
          usageLimit: 1,
          active: true,
        },
        {
          code: promoRollback,
          name: 'Kiểm tra rollback khi trùng xe',
          discountType: 'FIXED',
          discountValue: 120000,
          minDays: 1,
          appliesTo: 'RENT',
          usageLimit: 5,
          active: true,
        },
      ]) {
        expect(
          (
            await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
              headers: AUTH_HEADERS,
              data: p,
            })
          ).status(),
        ).toBe(201)
      }

      const custA = await registerCustomer(custACtx.request, `ca-${tag.toLowerCase()}`)
      const custB = await registerCustomer(custBCtx.request, `cb-${tag.toLowerCase()}`)
      customerEmails.push(custA.email, custB.email)

      const [f1Res, f2Res] = await Promise.all([
        request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`),
        request.get(`${ORIGIN}/nori-api/fleet?modelSlug=honda-pcx`),
      ])
      const f1List = (await f1Res.json()).data ?? []
      const f2List = (await f2Res.json()).data ?? []
      const allFleet = [...f1List, ...f2List].filter(
        (v: { operationStatus: string; intent: string; pricePerDay: number | null }) =>
          v.operationStatus === 'READY' && v.intent !== 'SALE' && (v.pricePerDay ?? 0) > 0,
      )
      expect(allFleet.length).toBeGreaterThanOrEqual(2)
      const veh1 = allFleet[0]
      const veh2 = allFleet[1]

      const win1 = findFreeWindow(veh1.id, 2, 26)
      const win2 = findFreeWindow(veh2.id, 2, 26)

      // RACE 1: CustA and CustB redeem promoOneSlot (usageLimit = 1) at the exact same time on different vehicles
      const [rA, rB] = await Promise.all([
        custACtx.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: {
            vehicle: veh1.id,
            startDate: win1.startDate,
            endDate: win1.endDate,
            promoCode: promoOneSlot,
          },
        }),
        custBCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: {
            vehicle: veh2.id,
            startDate: win2.startDate,
            endDate: win2.endDate,
            promoCode: promoOneSlot,
          },
        }),
      ])

      const statuses1 = [rA.status(), rB.status()].sort()
      expect(statuses1).toEqual([201, 409])
      const loserRes = rA.status() === 409 ? rA : rB
      const loserBody = await loserRes.json()
      expect(loserBody.error.message).toMatch(/hết lượt sử dụng/i)

      // RACE 2: CustA and CustB simultaneously book the EXACT SAME vehicle & dates WITH promoRollback
      // Loser fails on rental-days conflict -> promoRollback.used_count MUST be 1 (rolled back cleanly, NOT 2!)
      const winConflict = findFreeWindow(veh1.id, 2, 34)
      const [cA, cB] = await Promise.all([
        custACtx.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: {
            vehicle: veh1.id,
            startDate: winConflict.startDate,
            endDate: winConflict.endDate,
            promoCode: promoRollback,
          },
        }),
        custBCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: {
            vehicle: veh1.id,
            startDate: winConflict.startDate,
            endDate: winConflict.endDate,
            promoCode: promoRollback,
          },
        }),
      ])
      expect([cA.status(), cB.status()].sort()).toEqual([201, 409])

      const db = new DatabaseSync(getDbPath(), { readOnly: true })
      try {
        const oneSlotRow = db
          .prepare('SELECT used_count FROM promotions WHERE code = ?')
          .get(promoOneSlot) as { used_count: number }
        const rollbackRow = db
          .prepare('SELECT used_count FROM promotions WHERE code = ?')
          .get(promoRollback) as { used_count: number }
        expect(oneSlotRow.used_count).toBe(1)
        expect(rollbackRow.used_count).toBe(1)
      } finally {
        db.close()
      }
    } finally {
      await adminCtx.close()
      await custACtx.close()
      await custBCtx.close()
      cleanupPromoTestRecords({
        customerEmails,
        promoCodes: [promoOneSlot, promoRollback],
      })
    }
  })

  test('QA-E2E-06: Post-booking promo lifecycle — pending edit keep/swap/remove, cancel & reject quota restore, approval popup & handover completion', async ({
    browser,
    request,
  }) => {
    const tag = randomBytes(3).toString('hex').toUpperCase()
    const promoA = `QALIFEA${tag}`
    const promoB = `QALIFEB${tag}`
    const customerEmails: string[] = []

    const adminCtx = await browser.newContext()
    const custCtx = await browser.newContext()
    const custPage = await custCtx.newPage()

    try {
      const { email: adminEmail, password: adminPassword } = getAdminCredentials()
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      for (const p of [
        {
          code: promoA,
          name: 'Mã vòng đời A (1 lượt)',
          discountType: 'FIXED',
          discountValue: 100000,
          minDays: 1,
          appliesTo: 'RENT',
          usageLimit: 1,
          active: true,
        },
        {
          code: promoB,
          name: 'Mã vòng đời B (1 lượt)',
          discountType: 'PERCENT',
          discountValue: 10,
          maxDiscount: 400000,
          minDays: 1,
          appliesTo: 'RENT',
          usageLimit: 1,
          active: true,
        },
      ]) {
        expect(
          (
            await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
              headers: AUTH_HEADERS,
              data: p,
            })
          ).status(),
        ).toBe(201)
      }

      const cust = await registerCustomer(custCtx.request, `c6-${tag.toLowerCase()}`)
      customerEmails.push(cust.email)

      const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
      const vehicles = (await fleetRes.json()).data ?? (await fleetRes.json())
      const veh = vehicles.find(
        (v: { operationStatus: string; pricePerDay: number }) =>
          v.operationStatus === 'READY' && v.pricePerDay > 0,
      )

      const readCounts = () => {
        const db = new DatabaseSync(getDbPath(), { readOnly: true })
        try {
          const a = db.prepare('SELECT used_count FROM promotions WHERE code = ?').get(promoA) as {
            used_count: number
          }
          const b = db.prepare('SELECT used_count FROM promotions WHERE code = ?').get(promoB) as {
            used_count: number
          }
          return { a: a.used_count, b: b.used_count }
        } finally {
          db.close()
        }
      }

      // 1. Create booking 1 with promoA -> a=1, b=0
      const win1 = findFreeWindow(veh.id, 4, 42)
      const create1 = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: veh.id,
          startDate: win1.startDate,
          endDate: addDays(win1.startDate, 2),
          promoCode: promoA,
        },
      })
      expect(create1.status()).toBe(201)
      const b1 = (await create1.json()).data
      expect(readCounts()).toEqual({ a: 1, b: 0 })

      // 2. Modify PENDING booking 1 keeping SAME promoA (extend 2 -> 3 days): must NOT consume extra slot (a stays 1!)
      const modKeep = await custCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: b1.id,
          expectedRevision: b1.revision,
          startDate: win1.startDate,
          endDate: addDays(win1.startDate, 3),
          promoCode: promoA,
          reason: 'Thêm 1 ngày nhưng giữ nguyên mã A',
        },
      })
      expect(modKeep.status()).toBe(200)
      const b1AfterKeep = (await modKeep.json()).data
      expect(b1AfterKeep.totalDays).toBe(3)
      expect(b1AfterKeep.promoCode).toBe(promoA)
      expect(readCounts()).toEqual({ a: 1, b: 0 })

      // 3. Modify PENDING booking 1 via UI (/my-bookings): swap promoA -> promoB (a becomes 0, b becomes 1!)
      await custPage.goto(`${ORIGIN}/my-bookings`, { waitUntil: 'networkidle' })
      const card1 = custPage.locator(`article[data-booking-key="${b1.bookingKey}"]`)
      await card1.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' }).click()
      await custPage.locator('#edit-promo-code').fill(promoB)
      await custPage
        .getByRole('dialog')
        .getByRole('button', { name: 'Áp dụng', exact: true })
        .click()
      await expect(custPage.getByText(`Đang áp dụng: ${promoB}`)).toBeVisible()
      await custPage.getByRole('button', { name: 'Xác nhận lưu thay đổi' }).click()
      await expect(custPage.getByRole('dialog')).toHaveCount(0)
      await expect(custPage.getByText(/Đã cập nhật thông tin đơn thuê/i)).toBeVisible()
      expect(readCounts()).toEqual({ a: 0, b: 1 })

      // 4. Modify PENDING booking 1 via UI: click "Bỏ mã khuyến mãi" -> b becomes 0!
      await card1.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' }).click()
      await expect(custPage.getByRole('dialog')).toBeVisible()
      await custPage.getByRole('dialog').getByRole('button', { name: 'Bỏ mã khuyến mãi' }).click()
      await expect(custPage.getByText('Đã bỏ mã khuyến mãi.')).toBeVisible()
      await custPage.getByRole('button', { name: 'Xác nhận lưu thay đổi' }).click()
      await expect(custPage.getByRole('dialog')).toHaveCount(0)
      expect(readCounts()).toEqual({ a: 0, b: 0 })

      // Re-add promoA on booking 1, then CUSTOMER CANCELS -> promoA restored to 0!
      const latestB1 = (
        await (await custCtx.request.get(`${ORIGIN}/nori-api/bookings?id=${b1.id}`)).json()
      ).data
      expect(
        (
          await custCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
            headers: AUTH_HEADERS,
            data: {
              id: b1.id,
              expectedRevision: latestB1.revision,
              promoCode: promoA,
            },
          })
        ).status(),
      ).toBe(200)
      expect(readCounts()).toEqual({ a: 1, b: 0 })

      expect(
        (
          await custCtx.request.patch(`${ORIGIN}/nori-api/bookings`, {
            headers: AUTH_HEADERS,
            data: { id: b1.id },
          })
        ).status(),
      ).toBe(200)
      expect(readCounts()).toEqual({ a: 0, b: 0 })

      // 5. Booking 2 with promoA -> ADMIN REJECTS -> promoA restored to 0!
      const create2 = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: veh.id,
          startDate: win1.startDate,
          endDate: addDays(win1.startDate, 2),
          promoCode: promoA,
        },
      })
      expect(create2.status()).toBe(201)
      const b2 = (await create2.json()).data
      expect(readCounts()).toEqual({ a: 1, b: 0 })

      expect(
        (
          await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
            headers: AUTH_HEADERS,
            data: { id: b2.id, status: 'REJECTED', handoverNote: 'Từ chối kiểm thử hoàn lượt mã' },
          })
        ).status(),
      ).toBe(200)
      expect(readCounts()).toEqual({ a: 0, b: 0 })

      // 6. Booking 3 starting today with promoB -> Admin CONFIRMS -> Customer sees Approval Popup -> Edit locked -> ONGOING -> COMPLETED (promoB stays consumed = 1!)
      const today = businessToday()
      const [carFleetRes, bikeFleetRes] = await Promise.all([
        request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`),
        request.get(`${ORIGIN}/nori-api/fleet?modelSlug=honda-pcx`),
      ])
      const fleetAll = [
        ...((await carFleetRes.json()).data ?? []),
        ...((await bikeFleetRes.json()).data ?? []),
      ]
      let todayVeh = veh
      for (const candidate of fleetAll) {
        if (
          candidate.operationStatus !== 'READY' ||
          candidate.intent === 'SALE' ||
          !candidate.pricePerDay
        )
          continue
        const availToday = (
          await (
            await request.get(
              `${ORIGIN}/nori-api/availability?vehicle=${candidate.id}&startDate=${today}&endDate=${addDays(today, 1)}`,
            )
          ).json()
        ).data
        if (availToday?.available) {
          todayVeh = candidate
          break
        }
      }

      const create3 = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: todayVeh.id,
          startDate: today,
          endDate: addDays(today, 1),
          promoCode: promoB,
        },
      })
      expect(create3.status()).toBe(201)
      const b3 = (await create3.json()).data
      expect(readCounts()).toEqual({ a: 0, b: 1 })

      // Admin approves b3 -> CONFIRMED
      expect(
        (
          await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
            headers: AUTH_HEADERS,
            data: { id: b3.id, status: 'CONFIRMED', contractNumber: `HD-${tag}` },
          })
        ).status(),
      ).toBe(200)

      // Customer sees confirmation popup on /my-bookings & edit is locked
      await custPage.goto(`${ORIGIN}/my-bookings`, { waitUntil: 'networkidle' })
      await expect(
        custPage.getByRole('dialog', { name: /Đơn thuê của bạn đã được xác nhận!/i }),
      ).toBeVisible()
      await custPage.getByRole('button', { name: 'Tôi đã hiểu' }).click()

      const lockedEditAttempt = await custCtx.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: b3.id, note: 'Cố sửa sau duyệt' },
      })
      expect(lockedEditAttempt.status()).toBe(409)

      // Admin records deposit payment & completes handover -> COMPLETED
      expect(
        (
          await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
            headers: AUTH_HEADERS,
            data: {
              bookingId: b3.id,
              paymentType: 'DEPOSIT',
              method: 'BANK_TRANSFER',
              amount: b3.depositSnapshot || 5000000,
              status: 'CONFIRMED',
            },
          })
        ).status(),
      ).toBe(201)

      expect(
        (
          await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
            headers: AUTH_HEADERS,
            data: { id: b3.id, status: 'ONGOING', handoverNote: 'Đã bàn giao xe đúng giờ' },
          })
        ).status(),
      ).toBe(200)

      expect(
        (
          await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
            headers: AUTH_HEADERS,
            data: {
              id: b3.id,
              status: 'COMPLETED',
              returnOdometer: 15200,
              returnCondition: 'Xe sạch đẹp, hoàn trả cọc đầy đủ',
            },
          })
        ).status(),
      ).toBe(200)

      // Completed booking keeps promoB consumed (b = 1)
      expect(readCounts()).toEqual({ a: 0, b: 1 })
    } finally {
      await adminCtx.close()
      await custCtx.close()
      cleanupPromoTestRecords({ customerEmails, promoCodes: [promoA, promoB] })
    }
  })
})
