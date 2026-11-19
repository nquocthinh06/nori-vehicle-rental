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

async function pickAvailableVehicle(request: APIRequestContext, offsetStart = 62) {
  const fleetRes = await request.get(`${ORIGIN}/nori-api/fleet?modelSlug=toyota-fortuner`)
  expect(fleetRes.status()).toBe(200)
  const fleet = (await fleetRes.json()).data as Array<{
    id: string
    modelSlug: string
    intent: string
    pricePerDay?: number | null
  }>
  const candidate = fleet.find((v) => v.intent !== 'SALE' && Boolean(v.pricePerDay))
  expect(candidate).toBeDefined()
  const today = businessToday()
  for (let offset = offsetStart; offset < offsetStart + 24; offset += 3) {
    const startDate = addDays(today, offset)
    const endDate = addDays(today, offset + 3)
    const qRes = await request.get(
      `${ORIGIN}/nori-api/availability?vehicle=${encodeURIComponent(candidate!.id)}&startDate=${startDate}&endDate=${endDate}`,
    )
    if (qRes.status() !== 200) continue
    const qJson = await qRes.json()
    if (qJson.success && qJson.data?.available) {
      return {
        vehicleId: candidate!.id,
        startDate,
        endDate,
        estimatedTotal: qJson.data.estimatedTotal as number,
      }
    }
  }
  throw new Error('Could not find an available vehicle slot for payment E2E test.')
}

function cleanupPaymentE2E(emails: string[]) {
  const db = new DatabaseSync(getDbPath())
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
        db.prepare('DELETE FROM payment_events WHERE booking_id = ?').run(b.id)
        db.prepare('DELETE FROM refunds WHERE booking_id = ?').run(b.id)
        db.prepare(
          'DELETE FROM payments_rels WHERE parent_id IN (SELECT id FROM payments WHERE booking_id = ?)',
        ).run(b.id)
        db.prepare(
          'DELETE FROM payload_locked_documents_rels WHERE payments_id IN (SELECT id FROM payments WHERE booking_id = ?)',
        ).run(b.id)
        db.prepare('DELETE FROM payments WHERE booking_id = ?').run(b.id)
        db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(b.booking_key)
        const consults = db
          .prepare('SELECT id FROM consultations WHERE booking_id = ?')
          .all(b.id) as { id: string }[]
        for (const c of consults) {
          db.prepare('DELETE FROM consultations_contact_logs WHERE _parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations_rels WHERE parent_id = ?').run(c.id)
          db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id)
        }
        db.prepare('DELETE FROM notifications WHERE booking_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_modification_history WHERE _parent_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings_rels WHERE parent_id = ?').run(b.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE bookings_id = ?').run(b.id)
        db.prepare('DELETE FROM bookings WHERE id = ?').run(b.id)
      }
      db.prepare('DELETE FROM notifications WHERE customer_id = ?').run(user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }
  } finally {
    db.close()
  }
}

test.describe('NORI Online Payment End-to-End Integration (PAY-001 .. PAY-050)', () => {
  test('Full E2E: Checkout -> Pending Payment Blocked -> Admin Approve -> VietQR Modal -> Mock Webhook Confirm -> IDOR & Forged Webhook Blocked -> Remaining Payment -> Admin Refund, Reports & CSV Export + Mobile 375px', async ({
    page,
    browser,
    playwright,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const emailA = `nori-pay-a-${tag}@example.test`
    const emailB = `nori-pay-b-${tag}@example.test`
    const password = `NoriPay1!${tag}`
    const adminCreds = getAdminCredentials()
    const adminReq = await playwright.request.newContext({ baseURL: ORIGIN })
    const custBReq = await playwright.request.newContext({ baseURL: ORIGIN })
    let adminContext: Awaited<ReturnType<typeof browser.newContext>> | null = null

    try {
      // 1. Register Customer A and Customer B
      for (const [email, name] of [
        [emailA, 'Khách Thanh Toán A'],
        [emailB, 'Khách Thanh Toán B'],
      ]) {
        const reg = await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
          headers: AUTH_HEADERS,
          data: {
            fullName: name,
            email,
            phone: '0912345678',
            password,
            confirmPassword: password,
          },
        })
        expect(reg.status()).toBe(201)
      }
      await page.request.post(`${ORIGIN}/nori-api/auth/logout`, { headers: AUTH_HEADERS })

      // Login Customer A in browser page
      await page.goto('/login?returnTo=%2Fmy-bookings', { waitUntil: 'domcontentloaded' })
      await page.fill('#auth-email', emailA)
      await page.fill('#auth-password', password)
      await page.getByRole('button', { name: /^Đăng nhập/i }).click()
      await expect(page).toHaveURL(/\/my-bookings/)

      // Login Customer B in separate API context (for IDOR testing)
      const loginB = await custBReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email: emailB, password },
      })
      expect(loginB.status()).toBe(200)

      // 2. Customer A creates booking via API (verified PENDING)
      const slot = await pickAvailableVehicle(page.request, 64)
      const createRes = await page.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: slot.vehicleId,
          startDate: slot.startDate,
          endDate: slot.endDate,
          pickupTime: '08:00',
          returnTime: '20:00',
          customerPhone: '0912345678',
          expectedTotalPrice: slot.estimatedTotal,
        },
      })
      expect(createRes.status()).toBe(201)
      const booking = (await createRes.json()).data as {
        id: string
        bookingKey: string
        status: string
      }
      expect(booking.status).toBe('PENDING')

      // PAY-001: Online payment MUST be blocked while booking is PENDING
      const pendingPayAttempt = await page.request.post(`${ORIGIN}/nori-api/payments/create`, {
        headers: AUTH_HEADERS,
        data: { bookingId: booking.id, paymentType: 'DEPOSIT' },
      })
      expect(pendingPayAttempt.status()).toBe(409)
      const pendingPayErr = await pendingPayAttempt.json()
      expect(pendingPayErr.error.code).toBe('BOOKING_NOT_APPROVED')

      // Verify on /my-bookings UI that no payment button is shown for PENDING booking
      await page.goto('/my-bookings', { waitUntil: 'networkidle' })
      const cardA = page.locator(`article[data-booking-key="${booking.bookingKey}"]`)
      await expect(cardA).toBeVisible()
      await expect(cardA.getByRole('button', { name: /Thanh toán đặt cọc/i })).toHaveCount(0)

      // 3. Admin approves booking -> DEPOSIT_PENDING (PAY-002)
      const adminLogin = await adminReq.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email: adminCreds.email, password: adminCreds.password },
      })
      expect(adminLogin.status()).toBe(200)

      const approveRes = await adminReq.patch('/nori-api/dashboard/bookings', {
        headers: AUTH_HEADERS,
        data: {
          id: booking.id,
          status: 'DEPOSIT_PENDING',
          handoverNote: 'Duyệt đơn yêu cầu đặt cọc',
        },
      })
      expect(approveRes.status()).toBe(200)

      // PAY-006: Customer B cannot create payment or view payment history of Customer A's booking
      const idorCreate = await custBReq.post('/nori-api/payments/create', {
        headers: AUTH_HEADERS,
        data: { bookingId: booking.id, paymentType: 'DEPOSIT' },
      })
      expect(idorCreate.status()).toBe(403)
      const idorHist = await custBReq.get(
        `/nori-api/payments/history?bookingId=${encodeURIComponent(booking.id)}`,
      )
      expect(idorHist.status()).toBe(403)

      // PAY-011 / PAY-012: Forged SePay Webhook without valid Apikey is rejected 401
      const forgedWebhook = await page.request.post(`${ORIGIN}/nori-api/payments/webhook/sepay`, {
        headers: { authorization: 'Apikey invalid-forged-secret' },
        data: {
          id: 999888,
          gateway: 'Vietcombank',
          accountNumber: '1017588888',
          content: 'NORIPAYFORGED123',
          transferType: 'in',
          transferAmount: 500000,
        },
      })
      expect(forgedWebhook.status()).toBe(401)

      // 4. Customer A reloads /my-bookings -> opens VietQR Payment Screen Dialog -> verifies QR image & details
      await page.reload({ waitUntil: 'networkidle' })
      await expect(cardA.getByRole('button', { name: /Thanh toán đặt cọc/i })).toBeVisible()
      // PAY-008: Edit button must NOT exist after approval
      await expect(cardA.getByRole('button', { name: /Chỉnh sửa thông tin thuê/i })).toHaveCount(0)

      await cardA.getByRole('button', { name: /Thanh toán đặt cọc/i }).click()
      const payDialog = page.locator('[data-testid="online-payment-dialog"]')
      await expect(payDialog).toBeVisible()
      await expect(payDialog.locator('[data-testid="payment-transfer-content"]')).toContainText(
        /^NORIPAY/,
      )
      const qrImg = payDialog.locator('img').first()
      await expect(qrImg).toBeVisible()
      expect(await qrImg.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

      // PAY-041 & PAY-042: Verify Payment Screen fits 375px mobile viewport with zero horizontal overflow
      await page.setViewportSize({ width: 375, height: 812 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true)
      await page.setViewportSize({ width: 1280, height: 800 })

      // 5. Customer A triggers Mock Webhook Simulator -> Confirmed automatically! (PAY-013)
      const simBtn = payDialog.getByRole('button', { name: /Mô phỏng chuyển khoản thành công/i })
      await expect(simBtn).toBeVisible()
      await simBtn.click()
      await expect(payDialog.locator('[data-testid="payment-confirmed-banner"]')).toBeVisible()

      // Close modal and verify booking card updated to CONFIRMED + Đã thanh toán cọc
      await payDialog.getByRole('button', { name: 'Đóng', exact: true }).click()
      await expect(cardA).toContainText('Đã xác nhận')
      await expect(cardA).toContainText('Đã thanh toán cọc')

      // 6. Customer A pays remaining rental fee -> FULLY_PAID (PAY-021)
      await cardA.getByRole('button', { name: /Thanh toán phần còn lại/i }).click()
      await expect(payDialog).toBeVisible()
      await payDialog.getByRole('button', { name: /Mô phỏng chuyển khoản thành công/i }).click()
      await expect(payDialog.locator('[data-testid="payment-confirmed-banner"]')).toBeVisible()
      await payDialog.getByRole('button', { name: 'Đóng', exact: true }).click()
      await expect(cardA).toContainText('Đã thanh toán đủ')

      // 7. Admin verifies /dashboard/payments, issues partial refund, verifies /dashboard/reports & CSV export
      adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
      const adminPage = await adminContext.newPage()
      await adminPage.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' })
      await adminPage.fill('#auth-email', adminCreds.email)
      await adminPage.fill('#auth-password', adminCreds.password)
      await adminPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await expect(adminPage).toHaveURL(`${ORIGIN}/dashboard`)

      await adminPage.goto(`${ORIGIN}/dashboard/payments`, { waitUntil: 'networkidle' })
      await expect(adminPage.getByText('Thực thu đã xác nhận')).toBeVisible()
      await expect(adminPage.getByRole('tab', { name: /Sự kiện Webhook/i })).toBeVisible()
      await expect(adminPage.getByRole('tab', { name: /Cấu hình Thanh toán/i })).toBeVisible()

      // Issue partial refund via Admin API (PAY-028)
      const refundRes = await adminReq.post('/nori-api/dashboard/payments/refund', {
        headers: AUTH_HEADERS,
        data: {
          action: 'create',
          bookingId: booking.id,
          amount: 100_000,
          refundType: 'PARTIAL_ADJUSTMENT',
          reason: 'Hoàn trả ưu đãi kiểm thử E2E',
          providerRefundId: `REF-E2E-${tag}`,
          completeImmediately: true,
        },
      })
      expect(refundRes.status()).toBe(201)

      // Verify /dashboard/reports renders separated financial metrics
      await adminPage.goto(`${ORIGIN}/dashboard/reports`, { waitUntil: 'networkidle' })
      await expect(adminPage.getByText('Thực thu tiền thuê đã xác thực')).toBeVisible()
      await expect(adminPage.getByText('Doanh thu ròng sau hoàn tiền')).toBeVisible()
      await expect(adminPage.getByText(/Cọc bảo đảm tài sản/i).first()).toBeVisible()

      // Verify payments CSV export works and leaks zero secrets (PAY-046)
      const csvRes = await adminReq.get('/nori-api/dashboard/export?type=payments')
      expect(csvRes.status()).toBe(200)
      const csvText = await csvRes.text()
      expect(csvText).toContain('MaGiaoDich')
      expect(csvText).toContain(booking.bookingKey)
      expect(csvText).not.toMatch(/SEPAY_API_KEY|SEPAY_WEBHOOK_SECRET|PAYLOAD_SECRET/)
    } finally {
      if (adminContext) await adminContext.close()
      await adminReq.dispose()
      await custBReq.dispose()
      cleanupPaymentE2E([emailA, emailB])
    }
  })
})
