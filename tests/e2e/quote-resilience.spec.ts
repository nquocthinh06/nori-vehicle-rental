import { expect, test } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { addDays, businessToday } from '../../src/lib/rental-rules'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

function getIsolatedDbPath(): string {
  const envPath =
    process.env.NORI_SQLITE_PATH?.trim() || process.env.DATABASE_URI?.replace(/^file:/, '').trim()
  const resolved = envPath
    ? path.resolve(envPath)
    : fs.existsSync(path.resolve('.next/standalone/nori.db'))
      ? path.resolve('.next/standalone/nori.db')
      : path.resolve('nori.db')
  if (resolved === path.resolve('nori.db') && process.env.NORI_ALLOW_LIVE_DB_TEST !== '1') {
    throw new Error('[SAFEGUARD] Refusing E2E access to live ./nori.db.')
  }
  return resolved
}

function findRentableVehicleWithWindow() {
  const db = new DatabaseSync(getIsolatedDbPath(), { readOnly: true })
  try {
    const today = businessToday()
    const vehicles = db
      .prepare(
        "SELECT id, reference, price_per_day FROM vehicles WHERE status = 'ACTIVE' AND intent != 'SALE' AND operation_status = 'READY' AND price_per_day > 0",
      )
      .all() as { id: string; reference: string; price_per_day: number }[]
    for (const v of vehicles) {
      const busyRows = db.prepare('SELECT day FROM rental_days WHERE vehicle_id = ?').all(v.id) as {
        day: string
      }[]
      const busy = new Set(busyRows.map((r) => r.day))
      for (let offset = 15; offset <= 75; offset += 1) {
        const s = addDays(today, offset)
        const d1 = addDays(s, 1)
        const e = addDays(s, 2)
        if (!busy.has(s) && !busy.has(d1)) {
          return { vehicleId: v.id, startDate: s, endDate: e }
        }
      }
    }
    throw new Error('Không tìm được xe trống để chạy E2E quote-resilience.')
  } finally {
    db.close()
  }
}

function cleanupQrUsers(emails: string[]) {
  if (!emails.length) return
  const db = new DatabaseSync(getIsolatedDbPath())
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const email of emails) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as
        | { id: string }
        | undefined
      if (!user) continue
      const bookings = db
        .prepare('SELECT id, booking_key FROM bookings WHERE customer_id = ?')
        .all(user.id) as { id: string; booking_key: string }[]
      for (const b of bookings) {
        db.prepare(
          'DELETE FROM rental_days_rels WHERE parent_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(b.booking_key)
        db.prepare(
          'DELETE FROM payload_locked_documents_rels WHERE rental_days_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(b.booking_key)
        db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(b.booking_key)
        db.prepare(
          'DELETE FROM notifications_rels WHERE parent_id IN (SELECT id FROM notifications WHERE booking_id = ?)',
        ).run(b.id)
        db.prepare('DELETE FROM notifications WHERE booking_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_rels WHERE parent_id = ?').run(b.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE bookings_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings WHERE id = ?').run(b.id)
      }
      db.prepare('DELETE FROM audit_logs_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM audit_logs WHERE actor_id = ? OR entity_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }
  } finally {
    db.close()
  }
}

async function registerCustomer(
  request: import('@playwright/test').APIRequestContext,
  tag: string,
) {
  const email = `qr-${tag}@example.test`
  const password = `QrPass1!${tag}`
  const phone = `09${String(Math.floor(10000000 + Math.random() * 89999999))}`
  const res = await request.post(`${ORIGIN}/nori-api/auth/register`, {
    headers: AUTH_HEADERS,
    data: {
      fullName: `Khách QR ${tag}`,
      email,
      phone,
      password,
      confirmPassword: password,
    },
  })
  expect(res.status()).toBe(201)
  return { email, password, phone }
}

test.describe('NORI Quote Reliability, Retry, Input Preservation & Concurrency', () => {
  test('QUOTE-E2E-01: Delayed & transient 503 quote responses NEVER flash premature error; auto-retry recovers seamlessly', async ({
    browser,
  }) => {
    const target = findRentableVehicleWithWindow()
    const tag = randomBytes(3).toString('hex')
    const ctx = await browser.newContext()
    let registeredEmail = ''
    try {
      const cust = await registerCustomer(ctx.request, tag)
      registeredEmail = cust.email
      const page = await ctx.newPage()
      await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
      // Reload clean on /checkout with slow + transient 1st failure on /availability
      let availabilityAttempts = 0
      await page.route('**/nori-api/availability*', async (route) => {
        availabilityAttempts += 1
        if (availabilityAttempts === 1) {
          await new Promise((r) => setTimeout(r, 450))
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'x-nori-request-id': 'nr-test503' },
            body: JSON.stringify({
              success: false,
              error: {
                message: 'Kết nối cơ sở dữ liệu tạm thời gián đoạn.',
                code: 'DATABASE_UNAVAILABLE',
              },
            }),
          })
          return
        }
        await route.continue()
      })

      await page.goto(
        `${ORIGIN}/checkout?vehicle=${target.vehicleId}&startDate=${target.startDate}&endDate=${target.endDate}`,
        { waitUntil: 'domcontentloaded' },
      )

      // Form renders smoothly without flashing "Chưa thể lấy báo giá của xe."
      await expect(page.getByText('Chưa thể lấy báo giá của xe.')).toHaveCount(0)
      await page.locator('#checkout-terms').check()
      const confirmBtn = page.getByRole('button', { name: /Xác nhận đặt thuê/i })
      // Wait for transient 503 auto-retry to complete and enable booking confirmation
      await expect(page.getByText('Đang tính báo giá & kiểm tra lịch xe...')).toBeHidden({
        timeout: 15_000,
      })
      await expect(confirmBtn).toBeEnabled({ timeout: 15_000 })
      // Verify bounded retry ran (>=2 attempts) and never flashed error text
      await expect(page.getByText('Chưa thể lấy báo giá của xe.')).toHaveCount(0)
      expect(availabilityAttempts).toBeGreaterThanOrEqual(2)
      await expect(page.locator('main').getByText('Chưa cập nhật')).toHaveCount(0)
    } finally {
      await ctx.close()
      if (registeredEmail) cleanupQrUsers([registeredEmail])
    }
  })

  test('QUOTE-E2E-02: Hard 504 timeout keeps user inputs intact, blocks stale submit, and allows recovery retry', async ({
    browser,
  }) => {
    const target = findRentableVehicleWithWindow()
    const tag = randomBytes(3).toString('hex')
    const ctx = await browser.newContext()
    let registeredEmail = ''
    try {
      const cust = await registerCustomer(ctx.request, tag)
      registeredEmail = cust.email
      const page = await ctx.newPage()
      let forceFail504 = false

      await page.route('**/nori-api/availability*', async (route) => {
        if (forceFail504) {
          await route.fulfill({
            status: 504,
            contentType: 'application/json',
            headers: { 'x-nori-request-id': 'nr-timeout504' },
            body: JSON.stringify({
              success: false,
              error: {
                message: 'Hệ thống đang xử lý chậm hoặc quá thời gian chờ phản hồi.',
                code: 'DATABASE_TIMEOUT',
              },
            }),
          })
          return
        }
        await route.continue()
      })

      await page.goto(
        `${ORIGIN}/checkout?vehicle=${target.vehicleId}&startDate=${target.startDate}&endDate=${target.endDate}`,
        { waitUntil: 'networkidle' },
      )

      // Customer enters form details before triggering a quote recalculation under 504
      await page.locator('#checkout-phone').fill('0988777666')
      await page.locator('#checkout-license').fill('79A1-998877')
      await page.locator('#checkout-note').fill('Giao xe đúng giờ tại sảnh A')
      await page.locator('#checkout-terms').check()

      forceFail504 = true
      await page.locator('#checkout-pickup-time').selectOption('10:00')

      // Expect timeout notice + Request ID + retry button, AND form inputs preserved + Submit disabled!
      await expect(page.getByText(/nr-timeout504/)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('#checkout-phone')).toHaveValue('0988777666')
      await expect(page.locator('#checkout-license')).toHaveValue('79A1-998877')
      await expect(page.locator('#checkout-note')).toHaveValue('Giao xe đúng giờ tại sảnh A')
      await expect(page.getByRole('button', { name: /Xác nhận đặt thuê/i })).toBeDisabled()

      // Recover and retry cleanly
      forceFail504 = false
      await page.getByRole('button', { name: /Thử lấy báo giá lại/i }).click()
      await expect(page.getByRole('button', { name: /Xác nhận đặt thuê/i })).toBeEnabled({
        timeout: 15_000,
      })

      // Confirm real booking submission returns confirmation screen
      await page.getByRole('button', { name: /Xác nhận đặt thuê/i }).click()
      await expect(page.getByText(/Đã tiếp nhận hành trình mới/i)).toBeVisible({ timeout: 15_000 })
    } finally {
      await ctx.close()
      if (registeredEmail) cleanupQrUsers([registeredEmail])
    }
  })

  test('QUOTE-E2E-03: Concurrent double-booking race allows strictly 1 booking (201) and rejects concurrent second (409)', async ({
    browser,
  }) => {
    const target = findRentableVehicleWithWindow()
    const tagA = randomBytes(3).toString('hex')
    const tagB = randomBytes(3).toString('hex')
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const emails: string[] = []
    try {
      const custA = await registerCustomer(ctxA.request, tagA)
      const custB = await registerCustomer(ctxB.request, tagB)
      emails.push(custA.email, custB.email)

      const quoteRes = await ctxA.request.get(
        `${ORIGIN}/nori-api/availability?vehicle=${target.vehicleId}&startDate=${target.startDate}&endDate=${target.endDate}`,
      )
      expect(quoteRes.status()).toBe(200)
      const quoteBody = (await quoteRes.json()).data
      expect(quoteBody.available).toBe(true)

      const payloadBody = {
        vehicle: target.vehicleId,
        startDate: target.startDate,
        endDate: target.endDate,
        pickupTime: '08:00',
        returnTime: '20:00',
        expectedTotalPrice: quoteBody.estimatedTotal,
      }

      const [resA, resB] = await Promise.all([
        ctxA.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: { ...payloadBody, customerPhone: custA.phone },
        }),
        ctxB.request.post(`${ORIGIN}/nori-api/bookings`, {
          headers: AUTH_HEADERS,
          data: { ...payloadBody, customerPhone: custB.phone },
        }),
      ])

      const statuses = [resA.status(), resB.status()].sort((x, y) => x - y)
      expect(statuses).toEqual([201, 409])
    } finally {
      await ctxA.close()
      await ctxB.close()
      cleanupQrUsers(emails)
    }
  })
})
