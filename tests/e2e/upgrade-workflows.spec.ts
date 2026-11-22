import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
import { addDays, BOOKING_CONFIRMED_LOCK_MESSAGE, businessToday } from '../../src/lib/rental-rules'

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

function cleanupUpgradeTestData({
  customerEmails = [],
  mediaIds = [],
  modelIds = [],
  promoCodes = [],
}: {
  customerEmails?: string[]
  mediaIds?: string[]
  modelIds?: string[]
  promoCodes?: string[]
}) {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = OFF')
    for (const code of promoCodes) {
      const pRows = db.prepare('SELECT id FROM promotions WHERE code = ?').all(code) as {
        id: string
      }[]
      for (const p of pRows) {
        db.prepare('DELETE FROM promotions_rels WHERE parent_id = ?').run(p.id)
        db.prepare('DELETE FROM payload_locked_documents_rels WHERE promotions_id = ?').run(p.id)
        db.prepare('DELETE FROM promotions WHERE id = ?').run(p.id)
      }
    }

    for (const email of customerEmails) {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
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
        db.prepare('DELETE FROM payments WHERE booking_id = ?').run(b.id)
        db.prepare(
          'DELETE FROM rental_days_rels WHERE parent_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
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
      db.prepare(
        'DELETE FROM notifications_rels WHERE parent_id IN (SELECT id FROM notifications WHERE customer_id = ?)',
      ).run(user.id)
      db.prepare('DELETE FROM notifications WHERE customer_id = ?').run(user.id)
      db.prepare(
        'DELETE FROM consultations_rels WHERE parent_id IN (SELECT id FROM consultations WHERE customer_id = ?)',
      ).run(user.id)
      db.prepare('DELETE FROM consultations WHERE customer_id = ?').run(user.id)
      db.prepare('DELETE FROM audit_logs_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM bookings_rels WHERE users_id = ?').run(user.id)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(user.id)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(user.id, user.id)
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
    }

    for (const modelId of modelIds) {
      db.prepare('DELETE FROM vehicle_models_gallery WHERE _parent_id = ?').run(modelId)
      db.prepare('DELETE FROM vehicle_models_specifications WHERE _parent_id = ?').run(modelId)
      db.prepare('DELETE FROM vehicle_models_features WHERE _parent_id = ?').run(modelId)
      db.prepare('DELETE FROM vehicle_models_highlights WHERE _parent_id = ?').run(modelId)
      const vRows = db
        .prepare('SELECT id FROM vehicle_models_variants WHERE _parent_id = ?')
        .all(modelId) as { id: string }[]
      for (const v of vRows) {
        db.prepare('DELETE FROM vehicle_models_variants_colors WHERE _parent_id = ?').run(v.id)
      }
      db.prepare('DELETE FROM vehicle_models_variants WHERE _parent_id = ?').run(modelId)
      db.prepare('DELETE FROM vehicle_models_rels WHERE parent_id = ?').run(modelId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE vehicle_models_id = ?').run(
        modelId,
      )
      db.prepare('DELETE FROM vehicle_models WHERE id = ?').run(modelId)
    }

    for (const mediaId of mediaIds) {
      const mRow = db.prepare('SELECT filename FROM media WHERE id = ?').get(mediaId) as
        | { filename?: string }
        | undefined
      db.prepare(
        'DELETE FROM _media_v_rels WHERE parent_id IN (SELECT id FROM _media_v WHERE parent_id = ?)',
      ).run(mediaId)
      db.prepare('DELETE FROM _media_v WHERE parent_id = ?').run(mediaId)
      db.prepare('DELETE FROM media_rels WHERE parent_id = ?').run(mediaId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE media_id = ?').run(mediaId)
      db.prepare('DELETE FROM media WHERE id = ?').run(mediaId)
      if (mRow?.filename) {
        const fp = path.resolve(process.cwd(), 'media', mRow.filename)
        if (fs.existsSync(fp)) fs.unlinkSync(fp)
      }
    }
    db.exec('PRAGMA foreign_keys = ON')
  } finally {
    db.close()
  }
}

test.describe('NORI Upgrade Suite: Booking Edit, Post-Approval Notification, Hero Carousel, Media & Dynamic Vehicles', () => {
  test('BK-01..BK-24: Customer pending booking modification, self-overlap exclusion, payment/concurrent locks & audit history', async ({
    browser,
    page,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const custA = `bk-cust-a-${tag}@example.test`
    const custB = `bk-cust-b-${tag}@example.test`
    const password = `NoriBk1!${tag}`
    const promoCode = `E2EMOD${tag.toUpperCase().slice(0, 4)}`
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()

    const adminCtx = await browser.newContext()
    const custBCtx = await browser.newContext()
    const adminReq = adminCtx.request
    const custBReq = custBCtx.request

    try {
      // Admin logs in & creates an active promo code for BK-09
      const adminLogin = await adminReq.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })
      expect(adminLogin.status()).toBe(200)

      const promoRes = await adminReq.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
        headers: AUTH_HEADERS,
        data: {
          code: promoCode,
          name: 'Ưu đãi kiểm thử chỉnh sửa đơn',
          discountType: 'FIXED',
          discountValue: 100_000,
          minDays: 2,
          active: true,
        },
      })
      expect([200, 201]).toContain(promoRes.status())

      // Register Customer A & Customer B
      await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách Chỉnh Sửa A',
          email: custA,
          password,
          confirmPassword: password,
          phone: '0901112233',
        },
      })
      await custBReq.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách Trùng Lịch B',
          email: custB,
          password,
          confirmPassword: password,
          phone: '0909998877',
        },
      })

      // Fetch Honda CR-V fleet vehicle (NR-OT-CRV01)
      const fleetRes = await page.request.get(`${ORIGIN}/nori-api/fleet?modelSlug=honda-cr-v`)
      const fleetJson = await fleetRes.json()
      const vehicle = (Array.isArray(fleetJson) ? fleetJson : fleetJson.data)[0]
      expect(vehicle).toBeTruthy()

      const baseStart = addDays(businessToday(), 52)
      const baseEnd = addDays(baseStart, 2) // 2 days: +52, +53
      const custBStart = addDays(businessToday(), 58)
      const custBEnd = addDays(custBStart, 2) // +58, +59 occupied by Customer B

      // Customer B reserves +58..+60
      const bOtherRes = await custBReq.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { vehicle: vehicle.id, startDate: custBStart, endDate: custBEnd },
      })
      expect(bOtherRes.status()).toBe(201)

      // Customer A reserves +52..+54
      const createRes = await page.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicle.id,
          startDate: baseStart,
          endDate: baseEnd,
          pickupTime: '08:00',
          returnTime: '20:00',
          pickupLocation: 'Showroom Sala Q2',
          customerPhone: '0901112233',
          note: 'Lịch gốc ban đầu',
        },
      })
      expect(createRes.status()).toBe(201)
      const createdJson = await createRes.json()
      const createdBooking = createdJson.data ?? createdJson

      // BK-19 & BK-20: IDOR protection & DevTools forged price rejection on PUT /nori-api/bookings
      const idorEdit = await custBReq.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          startDate: addDays(baseStart, 1),
          endDate: addDays(baseEnd, 1),
        },
      })
      expect(idorEdit.status()).toBe(403)

      const forgedEdit = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          startDate: baseStart,
          endDate: addDays(baseStart, 3),
          totalPrice: 5000,
          status: 'CONFIRMED',
        },
      })
      expect(forgedEdit.status()).toBe(400)

      // BK-10: Modifying into Customer B's occupied dates (+58..+60) returns 409 Conflict
      const conflictEdit = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          startDate: custBStart,
          endDate: custBEnd,
        },
      })
      expect(conflictEdit.status()).toBe(409)

      // BK-01..BK-09 & BK-21..BK-24: UI modification on /my-bookings (prefill, self-overlap +53..+56, delivery, addon, promo, contact, before/after comparison, reload persistence)
      await page.goto('/my-bookings', { waitUntil: 'networkidle' })
      await expect(page.getByRole('button', { name: 'Xem chi tiết' }).first()).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' }).first(),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Hủy đơn thuê' }).first()).toBeVisible()

      await page.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' }).first().click()
      const editDialog = page.getByRole('dialog')
      await expect(editDialog).toBeVisible()
      await expect(page.locator('#edit-start-date')).toHaveValue(baseStart)
      await expect(page.locator('#edit-end-date')).toHaveValue(baseEnd)
      await expect(page.locator('#edit-customer-phone')).toHaveValue('0901112233')

      // Shift to +53..+56 (overlaps own previous day +53 -> proves self-exclusion works!)
      const modStart = addDays(baseStart, 1)
      const modEnd = addDays(modStart, 3) // 3 days
      await page.locator('#edit-start-date').fill(modStart)
      await page.locator('#edit-end-date').fill(modEnd)
      await page.locator('#edit-pickup-time').selectOption('09:00')
      await page.locator('#edit-return-time').selectOption('18:00')
      await page.locator('#edit-delivery-mode').check()
      await page.locator('#edit-pickup-location').fill('Sân bay Tân Sơn Nhất')
      await page.locator('#edit-return-location').fill('Quận 1, TP.HCM')
      await page.locator('#edit-customer-phone').fill('0918889999')
      await page.locator('#edit-customer-email').fill(custA)
      await page.locator('#edit-promo-code').fill(promoCode)
      await page.locator('#edit-addon-DASHCAM').check()
      await page.locator('#edit-booking-note').fill('Đổi giờ bay sang 09:30 sáng')
      await page.locator('#edit-booking-reason').fill('Cập nhật lịch chuyến công tác')

      // Verify Before vs After comparison box renders recalculated quote
      await expect(
        editDialog.getByText('Đối chiếu thông tin & Chi phí Trước / Sau thay đổi'),
      ).toBeVisible()
      const saveBtn = editDialog.getByRole('button', { name: 'Xác nhận lưu thay đổi' })
      await expect(saveBtn).toBeEnabled({ timeout: 8000 })
      await saveBtn.click()

      await expect(
        page.getByRole('status').filter({ hasText: /Đã cập nhật thông tin đơn thuê/ }),
      ).toBeVisible()

      // BK-24: Reload page and verify modified data + modification history persist
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Xem chi tiết' }).first().click()
      const detailDialog = page.getByRole('dialog')
      await expect(detailDialog).toContainText('Sân bay Tân Sơn Nhất')
      await expect(detailDialog).toContainText('Quận 1, TP.HCM')
      await expect(detailDialog).toContainText('09:00')
      await expect(detailDialog).toContainText('Lịch sử chỉnh sửa thông tin thuê (1)')
      await detailDialog.getByRole('button', { name: 'Đóng', exact: true }).click()

      // BK-17: Payment reconciliation lock — if a deposit/payment record exists on PENDING booking, block direct edit
      const payCreate = await adminReq.post(`${ORIGIN}/nori-api/dashboard/payments`, {
        headers: AUTH_HEADERS,
        data: {
          bookingId: createdBooking.id,
          paymentType: 'DEPOSIT',
          method: 'BANK_TRANSFER',
          amount: 2_000_000,
          status: 'PENDING',
          note: 'Khách đã chuyển khoản chờ đối soát',
        },
      })
      expect(payCreate.status()).toBe(201)
      const payJson = await payCreate.json()
      const payId = payJson.data?.id ?? payJson.id

      const lockedByPaymentEdit = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          id: createdBooking.id,
          note: 'Cố sửa khi đã có giao dịch đặt cọc',
        },
      })
      expect(lockedByPaymentEdit.status()).toBe(409)
      const lockedByPaymentJson = await lockedByPaymentEdit.json()
      expect(lockedByPaymentJson.code || lockedByPaymentJson.error?.code).toBe('CONFLICT')
      expect(lockedByPaymentJson.message || lockedByPaymentJson.error?.message).toMatch(
        /đối soát|đặt cọc|thanh toán/i,
      )

      // Remove temporary payment and ensure booking remains PENDING so we can test BK-18 concurrent Admin approval while Customer modal is open
      const db = new DatabaseSync(getDbPath())
      db.prepare('DELETE FROM payments_rels WHERE parent_id = ?').run(payId)
      db.prepare('DELETE FROM payments WHERE id = ?').run(payId)
      db.prepare("UPDATE bookings SET status = 'PENDING' WHERE id = ?").run(createdBooking.id)
      db.close()

      // BK-18 & BK-12..BK-16: Customer opens Edit modal -> Admin concurrently approves booking -> Customer clicks Save -> receives exact lock message & Edit button disappears
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' }).first().click()
      await expect(page.locator('#edit-booking-note')).toBeVisible()
      await page.locator('#edit-booking-note').fill('Thử lưu khi Admin vừa duyệt đơn')

      // Admin approves the booking concurrently in the background
      const approveRes = await adminReq.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: createdBooking.id, status: 'CONFIRMED' },
      })
      expect(approveRes.status()).toBe(200)

      // Customer submits open form -> UI gracefully catches 409 lock and shows exact Section 4.4 guidance
      await page.getByRole('button', { name: 'Xác nhận lưu thay đổi' }).click()
      await expect(page.getByRole('dialog')).toContainText(BOOKING_CONFIRMED_LOCK_MESSAGE)
      await page.getByRole('dialog').getByRole('button', { name: 'Đã hiểu' }).click()

      // Dismiss post-approval popup if shown and verify "Chỉnh sửa thông tin thuê" button is hidden on CONFIRMED card
      const ackBtn = page.getByRole('button', { name: 'Tôi đã hiểu', exact: true })
      if (await ackBtn.isVisible()) {
        await ackBtn.click()
      }
      await expect(page.getByRole('button', { name: 'Chỉnh sửa thông tin thuê' })).toHaveCount(0)

      // Direct API edit on CONFIRMED booking is also rejected (BK-15)
      const afterConfirmApiEdit = await page.request.put(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: createdBooking.id, note: 'Bypass UI attempt' },
      })
      expect(afterConfirmApiEdit.status()).toBe(409)
    } finally {
      await adminCtx.close()
      await custBCtx.close()
      cleanupUpgradeTestData({
        customerEmails: [custA, custB],
        promoCodes: [promoCode],
      })
    }
  })

  test('NT-01..NT-18 & VH-19..VH-20: Post-approval customer popup, show-once persistence, notification bell, consultation workflow, urgent/cancelled handling & price snapshot immutability', async ({
    browser,
    page,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const custEmail = `nt-cust-${tag}@example.test`
    const otherEmail = `nt-other-${tag}@example.test`
    const password = `NoriNt1!${tag}`
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const otherCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()

    try {
      await page.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách Nhận Thông Báo',
          email: custEmail,
          password,
          confirmPassword: password,
          phone: '0987654321',
        },
      })
      await otherCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Khách Độc Lập',
          email: otherEmail,
          password,
          confirmPassword: password,
        },
      })

      // Pick Mazda CX-5 (NR-OT-CX5-01) and create an URGENT booking starting today (NT-13)
      const fleetRes = await page.request.get(`${ORIGIN}/nori-api/fleet?modelSlug=mazda-cx-5`)
      const fleetJson = await fleetRes.json()
      const vehicle = (Array.isArray(fleetJson) ? fleetJson : fleetJson.data)[0]
      const originalDailyPrice = vehicle.pricePerDay

      const urgentStart = businessToday()
      const urgentEnd = addDays(urgentStart, 2)
      const bRes = await page.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicle.id,
          startDate: urgentStart,
          endDate: urgentEnd,
          pickupTime: '08:00',
          returnTime: '20:00',
          customerPhone: '0987654321',
        },
      })
      expect(bRes.status()).toBe(201)
      const booking = (await bRes.json()).data

      // Admin logs in via UI and checks urgent badge on /dashboard/bookings, then approves booking
      await adminPage.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' })
      await adminPage.getByLabel(/^Email/).fill(adminEmail)
      await adminPage.getByLabel(/^Mật khẩu/).fill(adminPassword)
      await adminPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await expect(adminPage).toHaveURL(`${ORIGIN}/dashboard`)

      await adminPage.goto(`${ORIGIN}/dashboard/bookings`, { waitUntil: 'networkidle' })
      const bCard = adminPage.locator('article').filter({ hasText: 'Khách Nhận Thông Báo' }).first()
      await expect(bCard).toBeVisible()
      await expect(bCard).toContainText('Đơn thuê gấp')

      await bCard.getByRole('button', { name: 'Duyệt đơn' }).click()
      await adminPage.getByRole('dialog').getByRole('button', { name: 'Xác nhận thao tác' }).click()
      await expect(bCard.getByRole('button', { name: 'Đã giao xe' })).toBeVisible()

      // NT-07: Verify idempotency — exactly 1 notification & 1 consultation created for this booking
      const dbCheck = new DatabaseSync(getDbPath(), { readOnly: true })
      const notifCount = dbCheck
        .prepare('SELECT COUNT(*) AS c FROM notifications WHERE booking_id = ?')
        .get(booking.id) as { c: number }
      const consultCount = dbCheck
        .prepare('SELECT COUNT(*) AS c FROM consultations WHERE booking_id = ?')
        .get(booking.id) as { c: number }
      dbCheck.close()
      expect(notifCount.c).toBe(1)
      expect(consultCount.c).toBe(1)

      // NT-08: Other customer does NOT see this notification
      const otherNotifRes = await otherCtx.request.get(`${ORIGIN}/nori-api/notifications`)
      const otherNotifJson = await otherNotifRes.json()
      const otherData = otherNotifJson.data ?? otherNotifJson
      expect(otherData.items.length).toBe(0)
      expect(otherData.activePopup).toBeNull()

      // NT-02..NT-06 & NT-17: Customer visits homepage -> Confirmation Popup opens automatically with exact copy, masked phone & non-payment note
      await page.goto('/', { waitUntil: 'networkidle' })
      const popupDialog = page.getByRole('dialog', {
        name: 'Đơn thuê của bạn đã được xác nhận!',
      })
      await expect(popupDialog).toBeVisible({ timeout: 8000 })
      await expect(popupDialog).toContainText('Cảm ơn quý khách đã lựa chọn NORI.')
      await expect(popupDialog).toContainText(
        'Nhân viên NORI sẽ liên hệ tư vấn và hướng dẫn các bước tiếp theo trong khung giờ hành chính của ngày hôm sau.',
      )
      await expect(popupDialog).toContainText('098***4321')
      await expect(popupDialog).toContainText(
        'Xác nhận đơn thuê chưa bao gồm xác nhận đã thanh toán',
      )

      // Acknowledge popup once -> reload page -> popup must NOT appear again (NT-04, NT-05)
      await popupDialog.getByRole('button', { name: 'Tôi đã hiểu', exact: true }).click()
      await expect(popupDialog).toBeHidden()

      await page.reload({ waitUntil: 'networkidle' })
      await expect(
        page.getByRole('dialog', { name: 'Đơn thuê của bạn đã được xác nhận!' }),
      ).toHaveCount(0)

      // NT-06: Customer clicks Notification Bell in header -> re-views the notification detail cleanly
      await page.getByRole('button', { name: /Thông báo của bạn/ }).click()
      const bellRegion = page.getByRole('region', { name: 'Danh sách thông báo' })
      await expect(bellRegion).toBeVisible()
      await bellRegion.getByText('Đơn thuê của bạn đã được xác nhận!').first().click()
      await expect(
        page.getByRole('dialog', { name: 'Đơn thuê của bạn đã được xác nhận!' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Tôi đã hiểu', exact: true }).click()

      // NT-14..NT-16: Admin updates Consultation tracking (PENDING_CONTACT -> CONSULTED) & filters without changing booking/payment status
      await bCard.getByRole('button', { name: /Xem chi tiết, Tư vấn/ }).click()
      const adminDetailModal = adminPage.getByRole('dialog')
      await expect(
        adminDetailModal.getByText('Theo dõi nhân viên liên hệ tư vấn khách hàng'),
      ).toBeVisible()
      await adminDetailModal.locator('#consult-status').selectOption('CONSULTED')
      await adminDetailModal
        .locator('#consult-outcome')
        .fill('Đã gọi xác nhận giấy tờ CCCD/GPLX và điểm nhận xe')
      await adminDetailModal
        .getByRole('button', { name: /Lưu cập nhật tư vấn|Cập nhật tư vấn/ })
        .click()
      await expect(adminDetailModal).toContainText('Đã tư vấn')
      await adminPage.keyboard.press('Escape')

      // Verify booking status is STILL 'CONFIRMED' (consultation did not auto-mark paid or signed)
      const bAfterConsultRes = await page.request.get(
        `${ORIGIN}/nori-api/bookings?id=${booking.id}`,
      )
      const bAfterConsult = (await bAfterConsultRes.json()).data
      expect(bAfterConsult.status).toBe('CONFIRMED')

      // VH-19 & VH-20: Admin updates Mazda CX-5 daily price -> public page reflects new price immediately, while CONFIRMED booking keeps original snapshot!
      const bumpedPrice = originalDailyPrice + 70_000
      const priceUpdateRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: { id: vehicle.id, pricePerDay: bumpedPrice },
      })
      expect(priceUpdateRes.status()).toBe(200)

      try {
        const bSnapshotCheck = await page.request.get(
          `${ORIGIN}/nori-api/bookings?id=${booking.id}`,
        )
        const bSnapData = (await bSnapshotCheck.json()).data
        expect(bSnapData.dailyPriceSnapshot).toBe(originalDailyPrice)
        expect(bSnapData.totalPrice).toBe(booking.totalPrice)
      } finally {
        await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
          headers: AUTH_HEADERS,
          data: { id: vehicle.id, pricePerDay: originalDailyPrice },
        })
      }

      // NT-18: If Admin cancels the confirmed booking before customer sees popup, notification is marked superseded
      const cancelConfirmedRes = await adminCtx.request.patch(
        `${ORIGIN}/nori-api/dashboard/bookings`,
        {
          headers: AUTH_HEADERS,
          data: { id: booking.id, status: 'CANCELLED' },
        },
      )
      expect(cancelConfirmedRes.status()).toBe(200)
      const notifAfterCancel = await page.request.get(`${ORIGIN}/nori-api/notifications`)
      const notifJsonAfterCancel = (await notifAfterCancel.json()).data
      expect(notifJsonAfterCancel.activePopup).toBeNull()
    } finally {
      await adminCtx.close()
      await otherCtx.close()
      cleanupUpgradeTestData({ customerEmails: [custEmail, otherEmail] })
    }
  })

  test('HR-01..HR-20 & Responsive Matrix (320px-1920px): Hero Carousel autoplay, controls, swipe, SearchBar state preservation, CMS sync & zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 840 })
    await page.goto('/', { waitUntil: 'networkidle' })

    const carousel = page.getByRole('region', {
      name: 'Bộ sưu tập phương tiện & Hành trình NORI',
    })
    await expect(carousel).toBeVisible()
    await expect(carousel.locator('h1')).toContainText('Mọi hành trình.')

    // HR-01: First slide vehicle image loaded sharply with naturalWidth > 0
    const firstHeroImg = carousel.locator('img').first()
    await expect(firstHeroImg).toHaveJSProperty('complete', true)
    expect(await firstHeroImg.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(
      600,
    )

    // HR-11: Fill SearchBar inputs BEFORE transitioning Hero slides -> verify SearchBar state is 100% preserved!
    const testStart = addDays(businessToday(), 14)
    const testEnd = addDays(testStart, 3)
    const heroStartInput = page.getByLabel('Ngày nhận xe', { exact: true })
    const heroEndInput = page.getByLabel('Ngày trả xe', { exact: true })
    await heroStartInput.fill(testStart)
    await heroEndInput.fill(testEnd)
    await page.getByLabel('Loại phương tiện', { exact: true }).selectOption('MOTORBIKE')

    // HR-05 & HR-06: Next / Prev buttons & indicator synchronization
    await carousel.getByRole('button', { name: 'Chuyển sang slide tiếp theo' }).click()
    await expect(carousel.locator('h1')).toContainText('Một lựa chọn.')
    await expect(carousel).toContainText('02')

    // HR-02 & HR-04: Loop last -> first cleanly
    await carousel.getByRole('button', { name: 'Xem thông điệp 5' }).click()
    await expect(carousel.locator('h1')).toContainText('Vượt cung đường xa.')
    await carousel.getByRole('button', { name: 'Chuyển sang slide tiếp theo' }).click()
    await expect(carousel.locator('h1')).toContainText('Mọi hành trình.')

    // HR-07: Pause & Resume button toggles aria-pressed cleanly
    const pauseBtn = carousel.getByRole('button', { name: 'Tạm dừng tự động chuyển slide' })
    await pauseBtn.click()
    const resumeBtn = carousel.getByRole('button', { name: 'Tiếp tục tự động chuyển slide' })
    await expect(resumeBtn).toHaveAttribute('aria-pressed', 'true')
    await resumeBtn.click()

    // Confirm SearchBar inputs remained untouched across all slide transitions (HR-11)!
    await expect(heroStartInput).toHaveValue(testStart)
    await expect(heroEndInput).toHaveValue(testEnd)
    await expect(page.getByLabel('Loại phương tiện', { exact: true })).toHaveValue('MOTORBIKE')

    // Section 34 Responsive Matrix across all 9 required widths (320px -> 1920px)
    for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 860 })
      const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      )
      expect(noOverflow, `Expected zero horizontal overflow on / at ${width}px`).toBe(true)
    }
  })

  test('MD-01..MD-18 & VH-01..VH-18: Media upload magic-byte security, multi-file batch, reference-safe delete & Dynamic Admin/Customer Vehicle sync', async ({
    browser,
    page,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const custEmail = `md-cust-${tag}@example.test`
    const password = `NoriMd1!${tag}`
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const uploadedMediaIds: string[] = []
    const createdModelIds: string[] = []

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 960 } })
    const custCtx = await browser.newContext()

    try {
      // MD-14: Unauthenticated upload rejected 403
      const validPngBuf = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 24, g: 98, b: 74 },
        },
      })
        .png()
        .toBuffer()

      const validWebpBuf = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 35, g: 65, b: 110 },
        },
      })
        .webp()
        .toBuffer()

      const unauthUpload = await page.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: 'unauth.png', mimeType: 'image/png', buffer: validPngBuf },
          alt: 'Unauthenticated test',
        },
      })
      expect(unauthUpload.status()).toBe(403)

      // MD-13: Authenticated regular customer upload rejected 403
      await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Cust Media Test',
          email: custEmail,
          password,
          confirmPassword: password,
        },
      })
      const custUpload = await custCtx.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: 'cust.png', mimeType: 'image/png', buffer: validPngBuf },
          alt: 'Customer upload attempt',
        },
      })
      expect(custUpload.status()).toBe(403)

      // Admin logs in
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      // MD-10: Spoofed magic-byte file (.exe / script bytes disguised as .jpg) rejected 400
      const spoofedBuf = Buffer.from('MZ\x90\x00<!DOCTYPE html><script>alert(1)</script>')
      const spoofRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: 'malware.jpg', mimeType: 'image/jpeg', buffer: spoofedBuf },
          alt: 'Spoofed file',
        },
      })
      expect(spoofRes.status()).toBe(400)

      // MD-12: Oversized file (>8MB) rejected 400
      const oversizedBuf = Buffer.alloc(8 * 1024 * 1024 + 1024, 0xff)
      const overRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          file: { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: oversizedBuf },
          alt: 'Huge file',
        },
      })
      expect(overRes.status()).toBe(400)

      // MD-01 & MD-02: Multi-file batch upload (PNG + WebP simultaneously) succeeds 201
      const batchRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/media`, {
        headers: AUTH_HEADERS,
        multipart: {
          files: { name: `e2e-front-${tag}.png`, mimeType: 'image/png', buffer: validPngBuf },
          file: { name: `e2e-side-${tag}.webp`, mimeType: 'image/webp', buffer: validWebpBuf },
          alt: 'Ảnh kiểm thử đa góc nhìn E2E',
          mediaCategory: 'CATALOGUE_REFERENCE',
        },
      })
      expect(batchRes.status()).toBe(201)
      const batchData = (await batchRes.json()).data
      const uploadedList = batchData.uploaded ?? [batchData]
      for (const u of uploadedList) {
        if (u?.id) uploadedMediaIds.push(u.id)
      }
      expect(uploadedMediaIds.length).toBeGreaterThanOrEqual(1)
      const primaryMediaId = uploadedMediaIds[0]

      // Create an Electric Motorbike model via Admin API with multi-image gallery & EV specs (VH-02, VH-04, VH-06..VH-09)
      const createModelRes = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: {
          entity: 'model',
          name: `NORI EV Test ${tag}`,
          officialName: `NORI EV Scooter Official ${tag}`,
          brand: 'VinFast',
          category: 'MOTORBIKE',
          subCategory: 'ELECTRIC_BIKE',
          fuelType: 'Điện (EV)',
          seats: 2,
          modelYear: 2025,
          listedPrice: 22_000_000,
          referenceRentPrice: 140_000,
          coverId: primaryMediaId,
          visible: false, // keep hidden from public 21-model catalogue count while still accessible by direct slug or inspectable
          gallery: uploadedMediaIds.map((mId, idx) => ({
            image: mId,
            kind: idx === 0 ? 'EXTERIOR' : 'OVERVIEW',
            photoType: idx === 0 ? 'FRONT' : 'OVERVIEW',
            isPrimary: idx === 0,
            sortOrder: idx,
            caption: `Góc chụp E2E #${idx + 1}`,
          })),
          specifications: [
            { group: 'EV', label: 'Dung lượng pin', value: '3,5 kWh LFP', source: 'E2E Spec' },
            { group: 'ENGINE', label: 'Dung tích xi-lanh', value: 'Không áp dụng', source: 'Test' },
          ],
          features: [
            { name: 'Chống nước IP67', category: 'SAFETY', status: 'EQUIPPED' },
            { name: 'Cửa sổ trời', category: 'COMFORT', status: 'NOT_APPLICABLE' },
          ],
        },
      })
      expect(createModelRes.status()).toBe(201)
      const createdModel = (await createModelRes.json()).data
      createdModelIds.push(createdModel.id)

      // MD-15: Attempt to delete media currently referenced by the model -> blocked with HTTP 409!
      const deleteInUseRes = await adminCtx.request.delete(
        `${ORIGIN}/nori-api/dashboard/media?id=${primaryMediaId}`,
        { headers: AUTH_HEADERS },
      )
      expect(deleteInUseRes.status()).toBe(409)

      // VH-15..VH-18: Verify enriched VinFast Evo Max public detail page (/vehicles/vinfast-evo-max)
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/vehicles/vinfast-evo-max', { waitUntil: 'networkidle' })
      await expect(page.locator('main h1')).toContainText('VinFast Evo')
      // Exact Catalogue disclaimer badge required by Section 16.2
      await expect(
        page.getByText('Ảnh Catalogue – không phải hình ảnh của cá thể xe đang cho thuê.'),
      ).toBeVisible()
      // Motorbike hides misleading "Nội thất" filter button (Section 18.3)
      await expect(page.getByRole('button', { name: 'Nội thất', exact: true })).toHaveCount(0)
      // EV Specifications tab renders verified LFP/Inhub specs without ICE cylinder specs
      await page.getByRole('tab', { name: 'Thông số kỹ thuật' }).click()
      await expect(page.locator('#specifications')).toContainText('BLDC Inhub')
      await expect(page.locator('#specifications')).toContainText('Pin LFP')
      await expect(page.locator('#specifications')).not.toContainText('Dung tích xi-lanh')

      // Verify Dynamic Admin Workspace UI (/dashboard/models) adapts tabs & fields cleanly across CAR / MOTORBIKE / PICKUP
      const adminPage = await adminCtx.newPage()
      await adminPage.goto(`${ORIGIN}/dashboard/models`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('button', { name: /Thêm dòng xe/ }).click()
      await expect(
        adminPage.getByRole('heading', { name: 'Thông tin định danh & Phân loại phương tiện' }),
      ).toBeVisible()
      await adminPage.locator('#model-cat').selectOption('MOTORBIKE')
      const subCatOptions = await adminPage.locator('#model-subcat option').allTextContents()
      expect(subCatOptions.join(' ')).not.toContain('Ô tô điện')
      await adminPage.locator('#model-cat').selectOption('PICKUP')
      const pickupSubOptions = await adminPage.locator('#model-subcat option').allTextContents()
      expect(pickupSubOptions.join(' ')).toMatch(/Bán tải/i)
    } finally {
      await adminCtx.close()
      await custCtx.close()
      cleanupUpgradeTestData({
        customerEmails: [custEmail],
        modelIds: createdModelIds,
        mediaIds: uploadedMediaIds,
      })
    }
  })
})
