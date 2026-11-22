import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import sharp from 'sharp'
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

function cleanupQaRecords({
  userEmails = [],
  adminEmails = [],
  postIds = [],
  mediaIds = [],
  bookingIds = [],
}: {
  userEmails?: string[]
  adminEmails?: string[]
  postIds?: string[]
  mediaIds?: string[]
  bookingIds?: string[]
}) {
  const db = new DatabaseSync(getDbPath())
  try {
    db.exec('PRAGMA foreign_keys = OFF')

    const allBookingIds = new Set<string>(bookingIds)
    const userIds: string[] = []
    for (const email of userEmails) {
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as
        | { id: string }
        | undefined
      if (!u) continue
      userIds.push(u.id)
      const rows = db.prepare('SELECT id FROM bookings WHERE customer_id = ?').all(u.id) as {
        id: string
      }[]
      for (const b of rows) allBookingIds.add(b.id)
    }

    for (const bId of allBookingIds) {
      const bRow = db.prepare('SELECT booking_key FROM bookings WHERE id = ?').get(bId) as
        | { booking_key?: string }
        | undefined
      if (bRow?.booking_key) {
        db.prepare(
          'DELETE FROM rental_days_rels WHERE parent_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(bRow.booking_key)
        db.prepare(
          'DELETE FROM payload_locked_documents_rels WHERE rental_days_id IN (SELECT id FROM rental_days WHERE booking_key = ?)',
        ).run(bRow.booking_key)
        db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(bRow.booking_key)
      }
      db.prepare(
        'DELETE FROM payments_rels WHERE parent_id IN (SELECT id FROM payments WHERE booking_id = ?)',
      ).run(bId)
      db.prepare(
        'DELETE FROM payload_locked_documents_rels WHERE payments_id IN (SELECT id FROM payments WHERE booking_id = ?)',
      ).run(bId)
      db.prepare('DELETE FROM payments WHERE booking_id = ?').run(bId)
      db.prepare(
        'DELETE FROM consultations_contact_logs WHERE _parent_id IN (SELECT id FROM consultations WHERE booking_id = ?)',
      ).run(bId)
      db.prepare(
        'DELETE FROM consultations_rels WHERE parent_id IN (SELECT id FROM consultations WHERE booking_id = ?)',
      ).run(bId)
      db.prepare('DELETE FROM consultations WHERE booking_id = ?').run(bId)
      db.prepare(
        'DELETE FROM notifications_rels WHERE parent_id IN (SELECT id FROM notifications WHERE booking_id = ?)',
      ).run(bId)
      db.prepare('DELETE FROM notifications WHERE booking_id = ?').run(bId)
      db.prepare(
        'DELETE FROM bookings_modification_history_changes WHERE _parent_id IN (SELECT id FROM bookings_modification_history WHERE _parent_id = ?)',
      ).run(bId)
      db.prepare('DELETE FROM bookings_modification_history WHERE _parent_id = ?').run(bId)
      db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(bId)
      db.prepare('DELETE FROM bookings_rels WHERE parent_id = ?').run(bId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE bookings_id = ?').run(bId)
      db.prepare('DELETE FROM bookings WHERE id = ?').run(bId)
    }

    for (const uId of userIds) {
      db.prepare('DELETE FROM rental_days_rels WHERE users_id = ?').run(uId)
      db.prepare('DELETE FROM consultations_rels WHERE users_id = ?').run(uId)
      db.prepare('DELETE FROM bookings_rels WHERE users_id = ?').run(uId)
      db.prepare(
        'DELETE FROM notifications_rels WHERE users_id = ? OR parent_id IN (SELECT id FROM notifications WHERE customer_id = ?)',
      ).run(uId, uId)
      db.prepare('DELETE FROM notifications WHERE customer_id = ?').run(uId)
      db.prepare(
        'DELETE FROM audit_logs_rels WHERE users_id = ? OR parent_id IN (SELECT id FROM audit_logs WHERE actor_id = ? OR entity_id = ?)',
      ).run(uId, uId, uId)
      db.prepare('DELETE FROM audit_logs WHERE actor_id = ? OR entity_id = ?').run(uId, uId)
      db.prepare('DELETE FROM users_sessions WHERE _parent_id = ?').run(uId)
      db.prepare('DELETE FROM users_rels WHERE parent_id = ? OR users_id = ?').run(uId, uId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE users_id = ?').run(uId)
      db.prepare('DELETE FROM users WHERE id = ?').run(uId)
    }

    for (const email of adminEmails) {
      const a = db.prepare('SELECT id FROM admins WHERE email = ?').get(email.toLowerCase()) as
        | { id: string }
        | undefined
      if (!a) continue
      db.prepare(
        'DELETE FROM audit_logs_rels WHERE admins_id = ? OR parent_id IN (SELECT id FROM audit_logs WHERE actor_id = ? OR entity_id = ?)',
      ).run(a.id, a.id, a.id)
      db.prepare('DELETE FROM audit_logs WHERE actor_id = ? OR entity_id = ?').run(a.id, a.id)
      db.prepare('DELETE FROM admins_sessions WHERE _parent_id = ?').run(a.id)
      db.prepare('DELETE FROM admins_rels WHERE parent_id = ?').run(a.id)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE admins_id = ?').run(a.id)
      db.prepare('DELETE FROM admins WHERE id = ?').run(a.id)
    }

    for (const pId of postIds) {
      db.prepare(
        'DELETE FROM _posts_v_rels WHERE parent_id IN (SELECT id FROM _posts_v WHERE parent_id = ?)',
      ).run(pId)
      db.prepare('DELETE FROM _posts_v WHERE parent_id = ?').run(pId)
      db.prepare('DELETE FROM posts_rels WHERE parent_id = ?').run(pId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE posts_id = ?').run(pId)
      db.prepare('DELETE FROM posts WHERE id = ?').run(pId)
    }

    for (const mId of mediaIds) {
      const row = db.prepare('SELECT filename FROM media WHERE id = ?').get(mId) as
        | { filename?: string }
        | undefined
      db.prepare(
        'DELETE FROM _media_v_rels WHERE parent_id IN (SELECT id FROM _media_v WHERE parent_id = ?)',
      ).run(mId)
      db.prepare('DELETE FROM _media_v WHERE parent_id = ?').run(mId)
      db.prepare('DELETE FROM media_rels WHERE parent_id = ?').run(mId)
      db.prepare('DELETE FROM payload_locked_documents_rels WHERE media_id = ?').run(mId)
      db.prepare('DELETE FROM media WHERE id = ?').run(mId)
      if (row?.filename) {
        const fp = path.resolve(process.cwd(), 'media', row.filename)
        if (fs.existsSync(fp)) fs.unlinkSync(fp)
      }
    }

    db.exec('PRAGMA foreign_keys = ON')
  } finally {
    db.close()
  }
}

function findFreeWindow(
  db: DatabaseSync,
  vehicleId: string,
  daysCount: number,
  startOffset = 30,
): { startDate: string; endDate: string } {
  const busySet = new Set<string>(
    (
      db.prepare('SELECT day FROM rental_days WHERE vehicle_id = ?').all(vehicleId) as {
        day: string
      }[]
    ).map((r) => r.day),
  )
  const maintRows = db
    .prepare(
      "SELECT start_date, end_date FROM maintenance_schedules WHERE vehicle_id = ? AND status IN ('SCHEDULED', 'IN_PROGRESS')",
    )
    .all(vehicleId) as { start_date: string; end_date: string }[]
  for (const m of maintRows) {
    let cur = m.start_date
    while (cur <= m.end_date) {
      busySet.add(cur)
      cur = addDays(cur, 1)
    }
  }
  const today = businessToday()
  for (let off = startOffset; off <= 85 - daysCount; off++) {
    let ok = true
    for (let d = 0; d < daysCount; d++) {
      if (busySet.has(addDays(today, off + d))) {
        ok = false
        break
      }
    }
    if (ok) {
      return {
        startDate: addDays(today, off),
        endDate: addDays(today, off + daysCount),
      }
    }
  }
  throw new Error(`No free ${daysCount}-day window found for vehicle ${vehicleId}`)
}

test.describe('NORI Comprehensive Security, RBAC, CMS Unpublish & Concurrency Audit', () => {
  test('QA-SEC-01: Limited OPERATOR enforces module RBAC across both AdminShell UI and all Dashboard API routes', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: superEmail, password: superPassword } = getAdminCredentials()
    const opEmail = `qa-operator-${tag}@nori.test`
    const opPassword = 'Password123!'

    const superCtx = await browser.newContext()
    const opCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const opPage = await opCtx.newPage()

    try {
      const superLogin = await superCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: superEmail, password: superPassword },
      })
      expect(superLogin.status()).toBe(200)

      // Create restricted OPERATOR with ONLY read permission on vehicles & bookings
      const createOp = await superCtx.request.post(`${ORIGIN}/nori-api/dashboard/admins`, {
        headers: AUTH_HEADERS,
        data: {
          email: opEmail,
          fullName: `Restricted Operator ${tag}`,
          password: opPassword,
          adminRole: 'OPERATOR',
          permissions: {
            vehicles: ['read'],
            bookings: ['read'],
            models: [],
            maintenance: [],
            inquiries: [],
            promotions: [],
            payments: [],
            customers: [],
            content: [],
            posts: [],
            reports: [],
            admins: [],
          },
        },
      })
      expect(createOp.status()).toBe(201)

      // Operator logs in through UI
      await opPage.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' })
      await opPage.locator('#auth-email').fill(opEmail)
      await opPage.locator('#auth-password').fill(opPassword)
      await opPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await expect(opPage).toHaveURL(/\/dashboard$/, { timeout: 10_000 })

      // Verify AdminShell sidebar shows ONLY permitted links & hides restricted links + /admin CMS
      const sidebar = opPage.getByRole('navigation', { name: 'Điều hướng quản trị NORI' })
      await expect(sidebar.getByRole('link', { name: 'Tổng quan' })).toBeVisible()
      await expect(sidebar.getByRole('link', { name: 'Kho xe thực tế' })).toBeVisible()
      await expect(sidebar.getByRole('link', { name: 'Đơn thuê xe' })).toBeVisible()

      for (const hiddenLabel of [
        'Catalogue dòng xe',
        'Lịch bảo trì',
        'Yêu cầu mua xe',
        'Khuyến mãi',
        'Thanh toán & Hoàn tiền',
        'Khách hàng & Đánh giá',
        'CMS & Cài đặt website',
        'Tin tức & Bài viết',
        'Thống kê & Báo cáo',
        'Tài khoản & Bảo mật',
      ]) {
        await expect(sidebar.getByRole('link', { name: hiddenLabel })).toHaveCount(0)
      }
      await expect(opPage.getByRole('link', { name: /Payload CMS/ })).toHaveCount(0)

      // Direct visit to restricted UI route displays explicit access-denied EmptyState
      await opPage.goto(`${ORIGIN}/dashboard/admins`, { waitUntil: 'networkidle' })
      await expect(
        opPage.getByText('Tài khoản chưa được cấp quyền truy cập phân hệ này'),
      ).toBeVisible()

      // Direct API RBAC enforcement checks (must return 403 FORBIDDEN for unauthorized modules/actions)
      const forbiddenChecks: [
        string,
        'GET' | 'POST' | 'PATCH' | 'DELETE',
        Record<string, unknown>?,
      ][] = [
        ['/nori-api/dashboard/admins', 'GET'],
        ['/nori-api/dashboard/reports', 'GET'],
        ['/nori-api/dashboard/export?type=financial', 'GET'],
        ['/nori-api/dashboard/export?type=customers', 'GET'],
        ['/nori-api/dashboard/customers', 'GET'],
        ['/nori-api/dashboard/customers', 'PATCH', { id: 'x', status: 'DISABLED' }],
        ['/nori-api/dashboard/inquiries', 'GET'],
        ['/nori-api/dashboard/inquiries', 'PATCH', { id: 'x', status: 'CONTACTED' }],
        ['/nori-api/dashboard/posts', 'GET'],
        ['/nori-api/dashboard/promotions', 'GET'],
        ['/nori-api/dashboard/vehicles?view=models', 'GET'],
        [
          '/nori-api/dashboard/vehicles',
          'POST',
          { entity: 'model', name: 'Blocked Model', brand: 'Test', category: 'CAR' },
        ],
        ['/nori-api/dashboard/vehicles', 'PATCH', { id: 'x', operationStatus: 'READY' }],
        ['/nori-api/dashboard/vehicles?entity=vehicle&id=x', 'DELETE'],
        ['/nori-api/dashboard/media', 'POST'],
        ['/nori-api/dashboard/media?id=x', 'DELETE'],
        ['/nori-api/dashboard', 'PATCH', { entity: 'booking', id: 'x', status: 'CONFIRMED' }],
        ['/nori-api/dashboard', 'PATCH', { entity: 'user', id: 'x', status: 'DISABLED' }],
        ['/nori-api/dashboard', 'PATCH', { entity: 'vehicle', id: 'x', operationStatus: 'READY' }],
      ]

      for (const [endpoint, method, payload] of forbiddenChecks) {
        const res = await opCtx.request.fetch(`${ORIGIN}${endpoint}`, {
          method,
          headers: AUTH_HEADERS,
          ...(payload ? { data: payload } : {}),
        })
        expect(res.status(), `${method} ${endpoint} should be 403`).toBe(403)
      }

      // Permitted Operator endpoints succeed (vehicles:read enables read-only media gallery view too)
      expect((await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/vehicles`)).status()).toBe(200)
      expect((await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/media`)).status()).toBe(200)
      expect((await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/bookings`)).status()).toBe(200)
      expect(
        (await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/export?type=bookings`)).status(),
      ).toBe(200)
      const ovRes = await opCtx.request.get(`${ORIGIN}/nori-api/dashboard`)
      expect(ovRes.status()).toBe(200)
      const ovData = (await ovRes.json()).data
      expect(ovData.customersList).toEqual([])
      expect(ovData.inquiries).toEqual([])
      expect(ovData.dataCompleteness).toEqual([])
      expect(ovData.fleetStats.confirmedRevenue).toBe(0)
    } finally {
      await superCtx.close()
      await opCtx.close()
      cleanupQaRecords({ adminEmails: [opEmail] })
    }
  })

  test('QA-SEC-02: Revoked Admin JWT replay is blocked, CSV formulas are escaped, and XSS input stays safe', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const custEmail = `qa-csv-${tag}@nori.test`
    const db = new DatabaseSync(getDbPath(), { readOnly: true })
    const vehicle = db
      .prepare(
        "SELECT id FROM vehicles WHERE operation_status = 'READY' AND status = 'ACTIVE' AND intent IN ('RENT', 'BOTH') LIMIT 1",
      )
      .get() as { id: string }
    const freeSlot = findFreeWindow(db, vehicle.id, 2, 35)
    db.close()

    const ctx1 = await browser.newContext()
    const custCtx = await browser.newContext()

    try {
      // 1. Capture Admin session cookie, log out, then replay old cookie header directly
      const loginRes = await ctx1.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })
      expect(loginRes.status()).toBe(200)
      const cookieHeader = loginRes
        .headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value.split(';')[0])
        .join('; ')
      expect(cookieHeader).toContain('payload-token=')

      expect((await ctx1.request.get(`${ORIGIN}/nori-api/dashboard/reports`)).status()).toBe(200)
      expect(
        (
          await ctx1.request.post(`${ORIGIN}/nori-api/auth/logout`, { headers: AUTH_HEADERS })
        ).status(),
      ).toBe(200)

      // Replay revoked Admin token directly via raw fetch headers (not cookie jar)
      for (const route of [
        '/nori-api/dashboard/reports',
        '/nori-api/dashboard/admins',
        '/nori-api/dashboard/export?type=bookings',
      ]) {
        const replay = await ctx1.request.get(`${ORIGIN}${route}`, {
          headers: { ...AUTH_HEADERS, cookie: cookieHeader },
        })
        expect(replay.status(), `Replay ${route} after logout must be 403`).toBe(403)
      }
      const replayMe = await (
        await ctx1.request.get(`${ORIGIN}/nori-api/auth/me`, {
          headers: { ...AUTH_HEADERS, cookie: cookieHeader },
        })
      ).json()
      expect(replayMe.data?.user ?? replayMe.data ?? null).toBeNull()

      // 2. CSV Formula Injection protection check
      await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: `=CMD|' /C calc'!A0_${tag}`,
          email: custEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
          phone: '0908887766',
        },
      })
      const start = freeSlot.startDate
      const end = freeSlot.endDate
      const bRes = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicle.id,
          startDate: start,
          endDate: end,
          customerPhone: '0908887766',
          note: `@SUM(1+1)`,
        },
      })
      expect(bRes.status()).toBe(201)

      const superCtx = await browser.newContext()
      await superCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })
      const csvRes = await superCtx.request.get(`${ORIGIN}/nori-api/dashboard/export?type=bookings`)
      expect(csvRes.status()).toBe(200)
      const csvText = await csvRes.text()
      expect(csvText).toContain("'=CMD|")
      expect(csvText).not.toContain(',"=CMD|')
      await superCtx.close()
    } finally {
      await ctx1.close()
      await custCtx.close()
      cleanupQaRecords({ userEmails: [custEmail] })
    }
  })

  test('QA-CMS-01: Published Post -> Save as Draft unpublishes immediately from /posts and /posts/[slug]', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const createdPostIds: string[] = []
    const createdMediaIds: string[] = []

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const pubCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const adminPage = await adminCtx.newPage()
    const pubPage = await pubCtx.newPage()

    try {
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      const jpgBuf = await sharp({
        create: { width: 1280, height: 720, channels: 3, background: { r: 12, g: 112, b: 98 } },
      })
        .jpeg({ quality: 85 })
        .toBuffer()

      await adminPage.goto(`${ORIGIN}/dashboard/posts`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('button', { name: /Viết bài mới/ }).click()
      const dialog = adminPage.getByRole('dialog')
      const postTitle = `Mùa đông không lạnh, vi vu cùng Nori QA ${tag}`
      await dialog.locator('#post-title').fill(postTitle)
      await dialog.locator('#post-cat').selectOption('PROMOTION')
      await dialog.locator('#post-content').fill(`Nội dung bài viết kiểm thử gỡ xuất bản ${tag}.`)

      const uploadWait = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/media') && r.request().method() === 'POST',
      )
      await dialog.locator('#post-banner-input').setInputFiles({
        name: `qa-unpub-${tag}.jpg`,
        mimeType: 'image/jpeg',
        buffer: jpgBuf,
      })
      const upJson = await (await uploadWait).json()
      createdMediaIds.push(upJson.data.id as string)

      const pubWait = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'POST',
      )
      await dialog.getByRole('button', { name: 'Xuất bản' }).click()
      const pubRes = await pubWait
      expect(pubRes.status()).toBe(201)
      const created = (await pubRes.json()).data as { id: string; slug: string }
      createdPostIds.push(created.id)

      // Public pages show newly published post with loaded banner
      await pubPage.goto(`${ORIGIN}/posts/${created.slug}`, { waitUntil: 'networkidle' })
      await expect(pubPage.getByRole('heading', { level: 1 })).toContainText(postTitle)
      const bannerLoaded = await pubPage
        .getByTestId('post-detail-banner')
        .locator('img')
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
      expect(bannerLoaded).toBe(true)

      // Edit published post -> click "Lưu bản nháp" -> must UNPUBLISH from public pages immediately!
      const row = adminPage.getByTestId(`admin-post-row-${created.id}`)
      await row.getByRole('button', { name: 'Chỉnh sửa' }).click()
      const editDialog = adminPage.getByRole('dialog')
      const draftWait = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'PATCH',
      )
      await editDialog.getByRole('button', { name: 'Lưu bản nháp' }).click()
      expect((await draftWait).status()).toBe(200)
      await expect(row).toContainText('Bản nháp')

      const detailAfterUnpublish = await pubCtx.request.get(`${ORIGIN}/posts/${created.slug}`)
      expect(detailAfterUnpublish.status()).toBe(404)
      await pubPage.goto(`${ORIGIN}/posts`, { waitUntil: 'networkidle' })
      await expect(pubPage.locator('main')).not.toContainText(postTitle)

      // Re-publish -> immediately public again!
      await row.getByRole('button', { name: 'Chỉnh sửa' }).click()
      const repubWait = adminPage.waitForResponse(
        (r) => r.url().includes('/nori-api/dashboard/posts') && r.request().method() === 'PATCH',
      )
      await adminPage.getByRole('dialog').getByRole('button', { name: 'Xuất bản' }).click()
      expect((await repubWait).status()).toBe(200)
      expect((await pubCtx.request.get(`${ORIGIN}/posts/${created.slug}`)).status()).toBe(200)
    } finally {
      await adminCtx.close()
      await pubCtx.close()
      cleanupQaRecords({ postIds: createdPostIds, mediaIds: createdMediaIds })
    }
  })

  test('QA-BIZ-01: NoriSite.maxPendingBookings enforcement + 8-way concurrent booking race integrity', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const { email: adminEmail, password: adminPassword } = getAdminCredentials()
    const db = new DatabaseSync(getDbPath(), { readOnly: true })
    const vehicles = db
      .prepare(
        "SELECT id FROM vehicles WHERE operation_status = 'READY' AND status = 'ACTIVE' AND intent IN ('RENT', 'BOTH') LIMIT 2",
      )
      .all() as { id: string }[]
    const v1 = vehicles[0].id
    const v2 = vehicles[1]?.id || v1
    const w1Slot = findFreeWindow(db, v1, 2, 20)
    const w2Slot = findFreeWindow(db, v1, 2, 30)
    const w3Slot = findFreeWindow(db, v1, 2, 40)
    const stormSlot = findFreeWindow(db, v2, 2, 55)
    db.close()

    const adminCtx = await browser.newContext()
    const custEmails: string[] = []
    const stormCtxs: Awaited<ReturnType<typeof browser.newContext>>[] = []
    let originalMaxPending = 5

    try {
      await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: adminEmail, password: adminPassword },
      })

      const curContent = (
        await (await adminCtx.request.get(`${ORIGIN}/nori-api/dashboard/content`)).json()
      ).data
      originalMaxPending = curContent.maxPendingBookings ?? 5

      // 1. Set maxPendingBookings = 2 -> verify 3rd PENDING booking returns 429
      const setMaxRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: { _status: 'published', maxPendingBookings: 2 },
      })
      expect(setMaxRes.status()).toBe(200)

      const limitEmail = `qa-limit-${tag}@nori.test`
      custEmails.push(limitEmail)
      const limitCtx = await browser.newContext()
      stormCtxs.push(limitCtx)
      await limitCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'Limit Tester',
          email: limitEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
          phone: '0901111222',
        },
      })

      const r1 = await limitCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: v1,
          startDate: w1Slot.startDate,
          endDate: w1Slot.endDate,
          customerPhone: '0901111222',
        },
      })
      const r2 = await limitCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: v1,
          startDate: w2Slot.startDate,
          endDate: w2Slot.endDate,
          customerPhone: '0901111222',
        },
      })
      expect(r1.status()).toBe(201)
      expect(r2.status()).toBe(201)

      const r3 = await limitCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: v1,
          startDate: w3Slot.startDate,
          endDate: w3Slot.endDate,
          customerPhone: '0901111222',
        },
      })
      expect(r3.status()).toBe(429)
      expect((await r3.json()).error.message).toContain('tối đa 2 đơn')

      // Restore original maxPendingBookings before running 8-way race
      await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: { _status: 'published', maxPendingBookings: originalMaxPending },
      })

      // 2. 8 parallel customer requests targeting the EXACT SAME vehicle + dates
      const stormStart = stormSlot.startDate
      const stormEnd = stormSlot.endDate
      for (let i = 0; i < 8; i++) {
        const email = `qa-storm-${i}-${tag}@nori.test`
        custEmails.push(email)
        const ctx = await browser.newContext()
        stormCtxs.push(ctx)
        const reg = await ctx.request.post(`${ORIGIN}/nori-api/auth/register`, {
          headers: AUTH_HEADERS,
          data: {
            fullName: `Storm User ${i}`,
            email,
            password: 'Password123!',
            confirmPassword: 'Password123!',
            phone: `09055500${i}1`,
          },
        })
        expect(reg.status()).toBe(201)
      }

      const stormResults = await Promise.all(
        stormCtxs.slice(1).map((ctx, i) =>
          ctx.request.post(`${ORIGIN}/nori-api/bookings`, {
            headers: AUTH_HEADERS,
            data: {
              vehicle: v2,
              startDate: stormStart,
              endDate: stormEnd,
              customerPhone: `09055500${i}1`,
            },
          }),
        ),
      )

      const statuses = stormResults.map((r) => r.status())
      expect(statuses.filter((s) => s === 201)).toHaveLength(1)
      expect(statuses.filter((s) => s === 409)).toHaveLength(7)

      const verifyDb = new DatabaseSync(getDbPath(), { readOnly: true })
      const heldDays = verifyDb
        .prepare('SELECT id FROM rental_days WHERE vehicle_id = ? AND day >= ? AND day < ?')
        .all(v2, stormStart, stormEnd)
      verifyDb.close()
      expect(heldDays).toHaveLength(2)
    } finally {
      await adminCtx.request
        .patch(`${ORIGIN}/nori-api/dashboard/content`, {
          headers: AUTH_HEADERS,
          data: { _status: 'published', maxPendingBookings: originalMaxPending },
        })
        .catch(() => undefined)
      await adminCtx.close()
      for (const ctx of stormCtxs) await ctx.close()
      cleanupQaRecords({ userEmails: custEmails })
    }
  })

  test('QA-SEC-03: Payload native /api/* RBAC, Folders/Tags lockdown, publish action & live permission revocation', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const opEmail = `qa-rbac-pub-${tag}@nori.test`
    const opPassword = `QaOp!${tag}99`
    const custEmail = `qa-rbac-cust-${tag}@nori.test`
    const custPassword = `QaCust!${tag}99`
    const createdPostIds: string[] = []

    const adminCtx = await browser.newContext()
    const opCtx = await browser.newContext()
    const custCtx = await browser.newContext()
    const guestCtx = await browser.newContext()

    try {
      const creds = getAdminCredentials()
      const superLogin = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: creds.email, password: creds.password },
      })
      expect(superLogin.status()).toBe(200)

      // 1. Guest checks on Payload native /api/* + export
      expect((await guestCtx.request.get(`${ORIGIN}/api/folders`)).status()).toBe(403)
      expect((await guestCtx.request.get(`${ORIGIN}/api/tags`)).status()).toBe(403)
      expect((await guestCtx.request.get(`${ORIGIN}/api/maintenance-schedules`)).status()).toBe(403)
      expect((await guestCtx.request.get(`${ORIGIN}/api/audit-logs`)).status()).toBe(403)
      expect((await guestCtx.request.get(`${ORIGIN}/api/admins`)).status()).toBe(403)
      expect(
        (await guestCtx.request.get(`${ORIGIN}/nori-api/dashboard/export?type=customers`)).status(),
      ).toBe(403)
      const guestVehicles = await guestCtx.request.get(`${ORIGIN}/api/vehicles?limit=5`)
      expect(guestVehicles.status()).toBe(200)
      const guestVehicleDocs =
        ((await guestVehicles.json()) as { docs?: Array<{ licensePlate?: unknown }> }).docs ?? []
      expect(guestVehicleDocs.every((v) => v.licensePlate === undefined)).toBe(true)

      // 2. Customer checks on BUG-QA-07 (Folders/Tags) & BUG-QA-08 (/api/maintenance-schedules)
      const regCust = await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'QA RBAC Customer',
          email: custEmail,
          password: custPassword,
          confirmPassword: custPassword,
          phone: '0907778899',
        },
      })
      expect(regCust.status()).toBe(201)
      const custNativeLogin = await custCtx.request.post(`${ORIGIN}/api/users/login`, {
        data: { email: custEmail, password: custPassword },
      })
      expect(custNativeLogin.status()).toBe(200)
      const custJwt = ((await custNativeLogin.json()) as { token?: string }).token
      expect(custJwt).toBeTruthy()
      const custJwtHeaders = { Authorization: `JWT ${custJwt}` }

      expect(
        (await custCtx.request.get(`${ORIGIN}/api/folders`, { headers: custJwtHeaders })).status(),
      ).toBe(403)
      expect(
        (await custCtx.request.get(`${ORIGIN}/api/tags`, { headers: custJwtHeaders })).status(),
      ).toBe(403)
      expect(
        (
          await custCtx.request.post(`${ORIGIN}/api/folders`, {
            headers: custJwtHeaders,
            data: { name: `hack-folder-${tag}` },
          })
        ).status(),
      ).toBe(403)
      expect(
        (
          await custCtx.request.get(`${ORIGIN}/api/maintenance-schedules`, {
            headers: custJwtHeaders,
          })
        ).status(),
      ).toBe(403)

      // 3. Create Restricted Operator with posts read/create/update (NO publish), content read/update (NO publish), reports read ONLY
      const createOp = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/admins`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: `QA Operator ${tag}`,
          email: opEmail,
          password: opPassword,
          adminRole: 'OPERATOR',
          permissions: {
            posts: ['read', 'create', 'update'],
            content: ['read', 'update'],
            reports: ['read'],
            vehicles: [],
            models: [],
            bookings: [],
            inquiries: [],
            maintenance: [],
            promotions: [],
            payments: [],
            customers: [],
            admins: [],
            settings: [],
          },
        },
      })
      expect(createOp.status()).toBe(201)
      const opId = ((await createOp.json()) as { data: { id: string } }).data.id

      const opLogin = await opCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: opEmail, password: opPassword },
      })
      expect(opLogin.status()).toBe(200)

      const opNativeLogin = await opCtx.request.post(`${ORIGIN}/api/admins/login`, {
        data: { email: opEmail, password: opPassword },
      })
      expect(opNativeLogin.status()).toBe(200)
      const opJwt = ((await opNativeLogin.json()) as { token?: string }).token
      expect(opJwt).toBeTruthy()
      const opJwtHeaders = { Authorization: `JWT ${opJwt}` }

      // Operator without admins:read sees only self on /api/admins, never other admins
      const opAdminsRes = await opCtx.request.get(`${ORIGIN}/api/admins`, { headers: opJwtHeaders })
      expect(opAdminsRes.status()).toBe(200)
      const opAdminsBody = (await opAdminsRes.json()) as {
        totalDocs: number
        docs: Array<{ id: string }>
      }
      expect(opAdminsBody.totalDocs).toBe(1)
      expect(opAdminsBody.docs[0]?.id).toBe(opId)

      // Operator without maintenance/customers permissions is blocked on /api/* & export?type=customers
      expect(
        (
          await opCtx.request.get(`${ORIGIN}/api/maintenance-schedules`, { headers: opJwtHeaders })
        ).status(),
      ).toBe(403)
      expect(
        (await opCtx.request.get(`${ORIGIN}/api/users`, { headers: opJwtHeaders })).status(),
      ).toBe(403)
      expect(
        (await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/export?type=customers`)).status(),
      ).toBe(403)

      // 4. Publish action enforcement across Posts, Content, and UI
      const draftPostRes = await opCtx.request.post(`${ORIGIN}/nori-api/dashboard/posts`, {
        headers: AUTH_HEADERS,
        data: {
          title: `QA Draft Only ${tag}`,
          category: 'NEWS',
          content: 'Draft content without publish permission',
          _status: 'draft',
        },
      })
      expect(draftPostRes.status()).toBe(201)
      const draftPostId = ((await draftPostRes.json()) as { data: { id: string } }).data.id
      createdPostIds.push(draftPostId)

      const pubAttemptRes = await opCtx.request.post(`${ORIGIN}/nori-api/dashboard/posts`, {
        headers: AUTH_HEADERS,
        data: {
          title: `QA Forbidden Publish ${tag}`,
          category: 'NEWS',
          content: 'Should be blocked by publish check',
          _status: 'published',
        },
      })
      expect(pubAttemptRes.status()).toBe(403)

      const patchPubRes = await opCtx.request.patch(`${ORIGIN}/nori-api/dashboard/posts`, {
        headers: AUTH_HEADERS,
        data: { id: draftPostId, title: `QA Draft Updated ${tag}`, _status: 'published' },
      })
      expect(patchPubRes.status()).toBe(403)

      const contentPubRes = await opCtx.request.patch(`${ORIGIN}/nori-api/dashboard/content`, {
        headers: AUTH_HEADERS,
        data: { _status: 'published', tagline: 'Unauthorized publish attempt' },
      })
      expect(contentPubRes.status()).toBe(403)

      // Verify /dashboard/posts UI disables Publish button while allowing Lưu bản nháp
      const page = await opCtx.newPage()
      await page.goto(`${ORIGIN}/dashboard/posts`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Viết bài mới' }).click()
      await expect(page.getByRole('button', { name: 'Lưu bản nháp' })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Xuất bản' })).toBeDisabled()
      await page.close()

      // 5. Live permission revocation takes effect on the very next API request without re-login
      const revokeRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/admins`, {
        headers: AUTH_HEADERS,
        data: {
          id: opId,
          permissions: {
            posts: [],
            content: [],
            reports: ['read'],
            vehicles: [],
            models: [],
            bookings: [],
            inquiries: [],
            maintenance: [],
            promotions: [],
            payments: [],
            customers: [],
            admins: [],
            settings: [],
          },
        },
      })
      expect(revokeRes.status()).toBe(200)

      expect((await opCtx.request.get(`${ORIGIN}/nori-api/dashboard/posts`)).status()).toBe(403)
      expect(
        (
          await opCtx.request.patch(`${ORIGIN}/nori-api/dashboard/posts`, {
            headers: AUTH_HEADERS,
            data: { id: draftPostId, title: 'After Revoke', _status: 'draft' },
          })
        ).status(),
      ).toBe(403)
    } finally {
      await adminCtx.close()
      await opCtx.close()
      await custCtx.close()
      await guestCtx.close()
      cleanupQaRecords({
        userEmails: [custEmail],
        adminEmails: [opEmail],
        postIds: createdPostIds,
      })
    }
  })

  test('QA-CONC-01: Optimistic locking (expectedRevision), payment lock vs cancel & booking rejection cascading cleanup', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const custEmail = `qa-conc-cust-${tag}@nori.test`
    const createdBookingIds: string[] = []

    const adminCtx = await browser.newContext()
    const custCtx = await browser.newContext()

    const dbRead = new DatabaseSync(getDbPath(), { readOnly: true })
    let vId = ''
    let slotA = { startDate: '', endDate: '' }
    let slotB = { startDate: '', endDate: '' }
    try {
      const vRow = dbRead
        .prepare(
          "SELECT v.id FROM vehicles v JOIN vehicle_models m ON v.model_id = m.id WHERE v.status='ACTIVE' AND v.operation_status!='SOLD' AND m.visible=1 AND v.price_per_day > 0 ORDER BY v.id LIMIT 1",
        )
        .get() as { id: string }
      vId = vRow.id
      slotA = findFreeWindow(dbRead, vId, 2, 42)
      slotB = findFreeWindow(dbRead, vId, 2, 50)
    } finally {
      dbRead.close()
    }

    try {
      const creds = getAdminCredentials()
      const adminLogin = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: creds.email, password: creds.password },
      })
      expect(adminLogin.status()).toBe(200)

      const reg = await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'QA Concurrency Customer',
          email: custEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
          phone: '0906667788',
        },
      })
      expect(reg.status()).toBe(201)

      // 1. Booking A: Dual-admin concurrent transition with identical expectedRevision
      const createA = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vId,
          startDate: slotA.startDate,
          endDate: slotA.endDate,
          customerPhone: '0906667788',
        },
      })
      expect(createA.status()).toBe(201)
      const bA = ((await createA.json()) as { data: { id: string; bookingKey: string } }).data
      createdBookingIds.push(bA.id)

      const listRes = await adminCtx.request.get(
        `${ORIGIN}/nori-api/dashboard/bookings?q=${bA.bookingKey}`,
      )
      expect(listRes.status()).toBe(200)
      const bARecord = (
        (await listRes.json()) as { data: { items: Array<{ id: string; revision: number }> } }
      ).data.items.find((i) => i.id === bA.id)
      expect(bARecord).toBeTruthy()
      const rev = bARecord!.revision

      const [r1, r2] = await Promise.all([
        adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
          headers: AUTH_HEADERS,
          data: { id: bA.id, status: 'CONFIRMED', expectedRevision: rev },
        }),
        adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
          headers: AUTH_HEADERS,
          data: { id: bA.id, status: 'CONFIRMED', expectedRevision: rev },
        }),
      ])
      const statuses = [r1.status(), r2.status()]
      expect(statuses.filter((s) => s === 200)).toHaveLength(1)
      expect(statuses.filter((s) => s === 409)).toHaveLength(1)

      // Record CONFIRMED deposit and verify duplicate rapid submit returns 409
      const [pay1, pay2] = await Promise.all([
        adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
          headers: AUTH_HEADERS,
          data: {
            bookingId: bA.id,
            paymentType: 'DEPOSIT',
            method: 'BANK_TRANSFER',
            amount: 500_000,
            status: 'CONFIRMED',
            note: 'QA deposit concurrency test',
          },
        }),
        adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
          headers: AUTH_HEADERS,
          data: {
            bookingId: bA.id,
            paymentType: 'DEPOSIT',
            method: 'BANK_TRANSFER',
            amount: 500_000,
            status: 'CONFIRMED',
            note: 'QA deposit concurrency test',
          },
        }),
      ])
      const payStatuses = [pay1.status(), pay2.status()]
      expect(payStatuses.filter((s) => s === 201)).toHaveLength(1)
      expect(payStatuses.filter((s) => s === 409)).toHaveLength(1)

      // Customer cancel MUST be blocked with 409 once non-refund CONFIRMED payment exists
      const custCancelRes = await custCtx.request.patch(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: bA.id },
      })
      expect(custCancelRes.status()).toBe(409)

      // Also verify PENDING/DEPOSIT_PENDING booking with a CONFIRMED payment cannot be cancelled by customer (409)
      const dbC = new DatabaseSync(getDbPath(), { readOnly: true })
      const slotC = findFreeWindow(dbC, vId, 2, 70)
      dbC.close()
      const createC = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vId,
          startDate: slotC.startDate,
          endDate: slotC.endDate,
          customerPhone: '0906667788',
        },
      })
      expect(createC.status()).toBe(201)
      const bC = ((await createC.json()) as { data: { id: string } }).data
      createdBookingIds.push(bC.id)
      const payC = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
        headers: AUTH_HEADERS,
        data: {
          bookingId: bC.id,
          paymentType: 'DEPOSIT',
          method: 'BANK_TRANSFER',
          amount: 400_000,
          status: 'CONFIRMED',
        },
      })
      expect(payC.status()).toBe(201)
      const custCancelPendingPaid = await custCtx.request.patch(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: bC.id },
      })
      expect(custCancelPendingPaid.status()).toBe(409)

      // 2. Booking B: PENDING payment auto-cancels & remainingAmount becomes 0 when REJECTED, and post-reject payment fails 409
      const createB = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vId,
          startDate: slotB.startDate,
          endDate: slotB.endDate,
          customerPhone: '0906667788',
        },
      })
      expect(createB.status()).toBe(201)
      const bB = ((await createB.json()) as { data: { id: string; bookingKey: string } }).data
      createdBookingIds.push(bB.id)

      const pendingPay = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
        headers: AUTH_HEADERS,
        data: {
          bookingId: bB.id,
          paymentType: 'DEPOSIT',
          method: 'BANK_TRANSFER',
          amount: 300_000,
          status: 'PENDING',
        },
      })
      expect(pendingPay.status()).toBe(201)
      const pendingPayId = ((await pendingPay.json()) as { data: { id: string } }).data.id

      const bBList = await adminCtx.request.get(
        `${ORIGIN}/nori-api/dashboard/bookings?q=${bB.bookingKey}`,
      )
      const bBRev = (
        (await bBList.json()) as { data: { items: Array<{ id: string; revision: number }> } }
      ).data.items.find((i) => i.id === bB.id)!.revision

      const rejectRes = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
        headers: AUTH_HEADERS,
        data: { id: bB.id, status: 'REJECTED', expectedRevision: bBRev },
      })
      expect(rejectRes.status()).toBe(200)

      const dbVerify = new DatabaseSync(getDbPath(), { readOnly: true })
      try {
        const bRow = dbVerify
          .prepare('SELECT status, remaining_amount FROM bookings WHERE id = ?')
          .get(bB.id) as { status: string; remaining_amount: number }
        expect(bRow.status).toBe('REJECTED')
        expect(bRow.remaining_amount).toBe(0)

        const pRow = dbVerify
          .prepare('SELECT status FROM payments WHERE id = ?')
          .get(pendingPayId) as {
          status: string
        }
        expect(pRow.status).toBe('CANCELLED')
      } finally {
        dbVerify.close()
      }

      // Recording new CONFIRMED payment against REJECTED booking must fail 409
      const postRejectPay = await adminCtx.request.post(`${ORIGIN}/nori-api/dashboard/payments`, {
        headers: AUTH_HEADERS,
        data: {
          bookingId: bB.id,
          paymentType: 'DEPOSIT',
          method: 'CASH',
          amount: 200_000,
          status: 'CONFIRMED',
        },
      })
      expect(postRejectPay.status()).toBe(409)
    } finally {
      await adminCtx.close()
      await custCtx.close()
      cleanupQaRecords({ userEmails: [custEmail], bookingIds: createdBookingIds })
    }
  })

  test('QA-CONC-02: Checkout expectedTotalPrice 409 guard, /nori-api/fleet cache invalidation, /nori-api/health & security headers', async ({
    browser,
  }) => {
    const tag = randomBytes(4).toString('hex')
    const custEmail = `qa-price-${tag}@nori.test`
    const adminCtx = await browser.newContext()
    const custCtx = await browser.newContext()
    const guestCtx = await browser.newContext()

    const dbRead = new DatabaseSync(getDbPath(), { readOnly: true })
    let vehicleInfo: { id: string; modelSlug: string; origPrice: number } = {
      id: '',
      modelSlug: '',
      origPrice: 0,
    }
    let freeSlot = { startDate: '', endDate: '' }
    try {
      const row = dbRead
        .prepare(
          "SELECT v.id, v.price_per_day as pricePerDay, m.slug as modelSlug FROM vehicles v JOIN vehicle_models m ON v.model_id = m.id WHERE v.status='ACTIVE' AND v.operation_status!='SOLD' AND m.visible=1 AND v.price_per_day > 100000 ORDER BY v.id LIMIT 1",
        )
        .get() as { id: string; pricePerDay: number; modelSlug: string }
      vehicleInfo = { id: row.id, modelSlug: row.modelSlug, origPrice: row.pricePerDay }
      freeSlot = findFreeWindow(dbRead, row.id, 2, 60)
    } finally {
      dbRead.close()
    }

    let restoredPrice = true
    try {
      // 1. Health endpoint & security headers
      const healthRes = await guestCtx.request.get(`${ORIGIN}/nori-api/health`)
      expect(healthRes.status()).toBe(200)
      expect(healthRes.headers()['cache-control'] ?? '').toContain('no-store')
      const healthBody = (await healthRes.json()) as {
        status: string
        db: string
        vehiclesCount: number
      }
      expect(healthBody.status).toBe('ok')
      expect(healthBody.db).toBe('connected')
      expect(healthBody.vehiclesCount).toBeGreaterThan(0)

      const homeRes = await guestCtx.request.get(`${ORIGIN}/`)
      expect(homeRes.status()).toBe(200)
      expect(homeRes.headers()['x-content-type-options']).toBe('nosniff')
      expect(homeRes.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')

      // Unsigned /nori-api/revalidate call must be 401
      const badReval = await guestCtx.request.post(`${ORIGIN}/nori-api/revalidate`, {
        data: { slugs: [], allDetails: false },
      })
      expect(badReval.status()).toBe(401)

      // 2. expectedTotalPrice mismatch returns 409 without creating booking
      const reg = await custCtx.request.post(`${ORIGIN}/nori-api/auth/register`, {
        headers: AUTH_HEADERS,
        data: {
          fullName: 'QA Price Guard Customer',
          email: custEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
          phone: '0904445566',
        },
      })
      expect(reg.status()).toBe(201)

      const mismatchRes = await custCtx.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicleInfo.id,
          startDate: freeSlot.startDate,
          endDate: freeSlot.endDate,
          customerPhone: '0904445566',
          expectedTotalPrice: 1,
        },
      })
      expect(mismatchRes.status()).toBe(409)

      // 3. Vehicle price update immediately invalidates cached /nori-api/fleet
      const creds = getAdminCredentials()
      const adminLogin = await adminCtx.request.post(`${ORIGIN}/nori-api/auth/login`, {
        headers: AUTH_HEADERS,
        data: { email: creds.email, password: creds.password },
      })
      expect(adminLogin.status()).toBe(200)

      const beforeFleet = await guestCtx.request.get(
        `${ORIGIN}/nori-api/fleet?modelSlug=${vehicleInfo.modelSlug}`,
      )
      expect(beforeFleet.status()).toBe(200)

      const bumpedPrice = vehicleInfo.origPrice + 50_000
      restoredPrice = false
      const patchPrice = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: { entity: 'vehicle', id: vehicleInfo.id, pricePerDay: bumpedPrice },
      })
      expect(patchPrice.status()).toBe(200)

      const afterFleet = await guestCtx.request.get(
        `${ORIGIN}/nori-api/fleet?modelSlug=${vehicleInfo.modelSlug}`,
      )
      expect(afterFleet.status()).toBe(200)
      const afterVehicles =
        ((await afterFleet.json()) as { data?: Array<{ id: string; pricePerDay: number }> }).data ??
        []
      const matched = afterVehicles.find((v) => v.id === vehicleInfo.id)
      expect(matched?.pricePerDay).toBe(bumpedPrice)

      const restorePatch = await adminCtx.request.patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
        headers: AUTH_HEADERS,
        data: { entity: 'vehicle', id: vehicleInfo.id, pricePerDay: vehicleInfo.origPrice },
      })
      expect(restorePatch.status()).toBe(200)
      restoredPrice = true
    } finally {
      if (!restoredPrice && vehicleInfo.id) {
        await adminCtx.request
          .patch(`${ORIGIN}/nori-api/dashboard/vehicles`, {
            headers: AUTH_HEADERS,
            data: { entity: 'vehicle', id: vehicleInfo.id, pricePerDay: vehicleInfo.origPrice },
          })
          .catch(() => undefined)
      }
      await adminCtx.close()
      await custCtx.close()
      await guestCtx.close()
      cleanupQaRecords({ userEmails: [custEmail] })
    }
  })
})
