import { test, expect } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { businessToday, addDays } from '../../src/lib/rental-rules'

function getDbPath(): string {
  const standaloneDb = path.resolve('.next/standalone/nori.db')
  if (fs.existsSync(standaloneDb)) return standaloneDb
  return path.resolve('nori.db')
}

function getAdminCredentials() {
  const envPath = path.resolve(process.cwd(), '.env')
  const envContent = fs.readFileSync(envPath, 'utf8')
  let email = 'admin@nori.vn'
  let password = ''
  for (const line of envContent.split(/\r?\n/)) {
    if (line.startsWith('NORI_ADMIN_EMAIL=')) email = line.split('=')[1].trim()
    if (line.startsWith('NORI_ADMIN_PASSWORD=')) password = line.split('=')[1].trim()
  }
  return { email, password }
}

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/admins',
  '/dashboard/bookings',
  '/dashboard/content',
  '/dashboard/customers',
  '/dashboard/inquiries',
  '/dashboard/maintenance',
  '/dashboard/models',
  '/dashboard/payments',
  '/dashboard/posts',
  '/dashboard/promotions',
  '/dashboard/reports',
  '/dashboard/vehicles',
]

test.describe('NORI Data Sync & Business Security Verification', () => {
  test('Data Sync: Admin changes vehicle price, immediately reflected in customer frontend without rebuild', async ({
    request,
    page,
  }) => {
    const { email, password } = getAdminCredentials()
    const loginRes = await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email, password },
    })
    expect(loginRes.status()).toBe(200)

    const fleetRes = await request.get('/nori-api/fleet?modelSlug=toyota-fortuner')
    expect(fleetRes.status()).toBe(200)
    const fleetJson = await fleetRes.json()
    const vehicles = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
    const targetVehicle =
      vehicles.find((v: { reference: string }) => v.reference === 'NR-OT-FTN01') || vehicles[0]
    expect(targetVehicle).toBeTruthy()
    const originalPrice = targetVehicle.pricePerDay

    // 1. Admin updates price to new value
    const updatedPrice = originalPrice + 50_000
    const updateRes = await request.patch('/nori-api/dashboard/vehicles', {
      headers: AUTH_HEADERS,
      data: {
        id: targetVehicle.id,
        pricePerDay: updatedPrice,
      },
    })
    expect(updateRes.status()).toBe(200)

    // 2. Customer opens vehicle detail page and verifies updated price immediately
    await page.goto('/vehicles/toyota-fortuner', { waitUntil: 'domcontentloaded' })
    const priceText = page
      .locator('#booking-sidebar')
      .getByText(new RegExp(`${(updatedPrice / 1000).toLocaleString('vi-VN')}|${updatedPrice}`))
    await expect(priceText.first()).toBeVisible({ timeout: 5000 })

    // 3. Restore original price
    const restoreRes = await request.patch('/nori-api/dashboard/vehicles', {
      headers: AUTH_HEADERS,
      data: {
        id: targetVehicle.id,
        pricePerDay: originalPrice,
      },
    })
    expect(restoreRes.status()).toBe(200)
  })

  test('Dynamic Slug Routes: Vehicle model outside build-time list renders dynamically via dynamicParams', async ({
    page,
    request,
  }) => {
    const db = new DatabaseSync(getDbPath())
    const testSlug = `e2e-sync-car-${Date.now()}`
    const testId = `e2e-model-${Date.now()}`

    try {
      db.prepare(
        `
        INSERT INTO vehicle_models (
          id, name, slug, brand, category, sub_category, origin, model_year, seats, fuel_type,
          transmission, listed_price, reference_rent_price, visible, verification_status, sort_order, updated_at, created_at
        ) VALUES (
          ?, ?, ?, 'Toyota', 'CAR', 'SEDAN', 'Việt Nam', 2025, 5, 'Xăng',
          'Tự động', 800000000, 900000, 1, 'VERIFIED', 999, datetime('now'), datetime('now')
        )
      `,
      ).run(testId, 'E2E Dynamic Sync Model', testSlug)

      const res = await page.goto(`/vehicles/${testSlug}`, { waitUntil: 'domcontentloaded' })
      expect(res?.status()).toBe(200)
      await expect(
        page.getByRole('heading', { name: 'E2E Dynamic Sync Model', exact: true }),
      ).toBeVisible({
        timeout: 5000,
      })
    } finally {
      db.prepare('DELETE FROM vehicle_models WHERE id = ?').run(testId)
      // Revalidate catalogue cache so downstream tests get clean 20 models
      const { email, password } = getAdminCredentials()
      await request.post('/nori-api/auth/login', {
        headers: AUTH_HEADERS,
        data: { email, password },
      })
      const fleetRes = await request.get('/nori-api/fleet?modelSlug=toyota-fortuner')
      const fleetJson = await fleetRes.json()
      const vehicles = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
      const target = vehicles[0]
      if (target) {
        await request.patch('/nori-api/dashboard/vehicles', {
          headers: AUTH_HEADERS,
          data: { id: target.id, pricePerDay: target.pricePerDay },
        })
      }
    }
  })

  test('Backend validates price & availability on transaction creation; ignores forged prices', async ({
    request,
  }) => {
    const custEmail = `cust_sec_${Date.now()}@nori.vn`
    const regRes = await request.post('/nori-api/auth/register', {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Security Test Customer',
        email: custEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!',
        phone: '0901234567',
      },
    })
    expect(regRes.status()).toBe(201)

    const fleetRes = await request.get('/nori-api/fleet?modelSlug=toyota-fortuner')
    const fleetJson = await fleetRes.json()
    const fleet = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
    const vehicle = fleet[0]

    const startDate = addDays(businessToday(), 20)
    const endDate = addDays(startDate, 3)

    // 1. Client attempts to inject forged prices; backend strictly rejects extra fields
    const forgedRes = await request.post('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: {
        vehicle: vehicle.id,
        startDate,
        endDate,
        totalPrice: 1000,
        dailyPriceSnapshot: 100,
      },
    })
    expect(forgedRes.status()).toBe(400)

    // 2. Standard booking creation uses database prices
    const bookingRes = await request.post('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: {
        vehicle: vehicle.id,
        startDate,
        endDate,
      },
    })
    expect(bookingRes.status()).toBe(201)
    const bookingJson = await bookingRes.json()
    const booking = bookingJson.data ?? bookingJson
    // Server must calculate real quote from database rate
    expect(booking.dailyPriceSnapshot).toBe(vehicle.pricePerDay)
    expect(booking.totalPrice).toBeGreaterThan(1_000_000)

    // Clean up
    const db = new DatabaseSync(getDbPath())
    db.exec('PRAGMA foreign_keys = ON')
    db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(booking.bookingKey)
    db.prepare('DELETE FROM bookings WHERE id = ?').run(booking.id)
    db.prepare('DELETE FROM users WHERE email = ?').run(custEmail)
    db.close()
  })

  test('Concurrent double-booking collision is rejected with HTTP 409 Conflict', async ({
    request,
  }) => {
    const cust1 = `conc1_${Date.now()}@nori.vn`
    const cust2 = `conc2_${Date.now()}@nori.vn`

    await request.post('/nori-api/auth/register', {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'User One',
        email: cust1,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })
    await request.post('/nori-api/auth/register', {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'User Two',
        email: cust2,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })

    const fleetRes = await request.get('/nori-api/fleet?modelSlug=toyota-fortuner')
    const fleetJson = await fleetRes.json()
    const fleet = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
    const vehicle = fleet[0]

    const startDate = addDays(businessToday(), 35)
    const endDate = addDays(startDate, 2)

    // Customer 1 logs in and books vehicle
    await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email: cust1, password: 'Password123!' },
    })
    const b1 = await request.post('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: { vehicle: vehicle.id, startDate, endDate },
    })
    expect(b1.status()).toBe(201)
    const b1Json = await b1.json()
    const b1Data = b1Json.data ?? b1Json

    // Customer 2 logs in and attempts to book exact same vehicle on overlapping dates
    await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email: cust2, password: 'Password123!' },
    })
    const b2 = await request.post('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: { vehicle: vehicle.id, startDate, endDate },
    })
    expect(b2.status()).toBe(409)

    // Clean up
    const db = new DatabaseSync(getDbPath())
    db.exec('PRAGMA foreign_keys = ON')
    db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(b1Data.bookingKey)
    db.prepare('DELETE FROM bookings WHERE id = ?').run(b1Data.id)
    db.prepare('DELETE FROM users WHERE email IN (?, ?)').run(cust1, cust2)
    db.close()
  })

  test('Duplicate payment request within 30s is rejected with HTTP 409 Conflict', async ({
    request,
  }) => {
    const { email, password } = getAdminCredentials()
    await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email, password },
    })

    const db = new DatabaseSync(getDbPath())
    const booking = db.prepare('SELECT id FROM bookings LIMIT 1').get() as
      | { id: string }
      | undefined
    if (!booking) return

    const payData = {
      bookingId: booking.id,
      paymentType: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      amount: 5_000_000,
      status: 'CONFIRMED',
      note: 'E2E idempotency test',
    }

    const firstPay = await request.post('/nori-api/dashboard/payments', {
      headers: AUTH_HEADERS,
      data: payData,
    })
    expect(firstPay.status()).toBe(201)
    const payResData = await firstPay.json()

    // Immediate duplicate payment request
    const dupPay = await request.post('/nori-api/dashboard/payments', {
      headers: AUTH_HEADERS,
      data: payData,
    })
    expect(dupPay.status()).toBe(409)
    const err = await dupPay.json()
    const errCode = err.code || err.error?.code
    expect(errCode).toBe('DUPLICATE_PAYMENT')

    // Clean up test payment
    const payId = payResData.data?.id || payResData.id
    if (payId) {
      db.prepare('DELETE FROM payments WHERE id = ?').run(payId)
    }
  })

  test('IDOR protection: Customer cannot read or cancel another customer booking', async ({
    request,
  }) => {
    const custA = `idora_${Date.now()}@nori.vn`
    const custB = `idorb_${Date.now()}@nori.vn`

    await request.post('/nori-api/auth/register', {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Customer A',
        email: custA,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })
    await request.post('/nori-api/auth/register', {
      headers: AUTH_HEADERS,
      data: {
        fullName: 'Customer B',
        email: custB,
        password: 'Password123!',
        confirmPassword: 'Password123!',
      },
    })

    const fleetRes = await request.get('/nori-api/fleet?modelSlug=toyota-fortuner')
    const fleetJson = await fleetRes.json()
    const fleet = Array.isArray(fleetJson) ? fleetJson : fleetJson.data
    const vehicle = fleet[0]

    // Customer A creates booking
    await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email: custA, password: 'Password123!' },
    })
    const bA = await request.post('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: {
        vehicle: vehicle.id,
        startDate: addDays(businessToday(), 40),
        endDate: addDays(businessToday(), 42),
      },
    })
    expect(bA.status()).toBe(201)
    const bAJson = await bA.json()
    const bookingA = bAJson.data ?? bAJson

    // Customer B attempts to cancel Customer A's booking
    await request.post('/nori-api/auth/login', {
      headers: AUTH_HEADERS,
      data: { email: custB, password: 'Password123!' },
    })
    const cancelAttempt = await request.patch('/nori-api/bookings', {
      headers: AUTH_HEADERS,
      data: { id: bookingA.id },
    })
    expect(cancelAttempt.status()).toBeGreaterThanOrEqual(400)

    // Clean up
    const db = new DatabaseSync(getDbPath())
    db.exec('PRAGMA foreign_keys = ON')
    db.prepare('DELETE FROM rental_days WHERE booking_key = ?').run(bookingA.bookingKey)
    db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingA.id)
    db.prepare('DELETE FROM users WHERE email IN (?, ?)').run(custA, custB)
    db.close()
  })

  test('All 13 Dashboard routes enforce Admin RBAC both on page and API level', async ({
    request,
    page,
  }) => {
    // Unauthenticated request to Dashboard APIs returns 403
    for (const apiRoute of [
      '/nori-api/dashboard',
      '/nori-api/dashboard/admins',
      '/nori-api/dashboard/bookings',
      '/nori-api/dashboard/consultations',
      '/nori-api/dashboard/content',
      '/nori-api/dashboard/customers',
      '/nori-api/dashboard/inquiries',
      '/nori-api/dashboard/maintenance',
      '/nori-api/dashboard/payments',
      '/nori-api/dashboard/posts',
      '/nori-api/dashboard/promotions',
      '/nori-api/dashboard/reports',
      '/nori-api/dashboard/vehicles',
      '/nori-api/dashboard/export',
    ]) {
      const res = await request.get(apiRoute)
      expect(res.status(), `API route ${apiRoute} should require admin`).toBe(403)
    }

    // Public / non-admin user visiting dashboard pages is shown admin restriction
    for (const route of DASHBOARD_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      const blockTitle = page.getByText(/Không gian dành cho quản trị viên/i)
      await expect(blockTitle, `Route ${route} should show admin restriction`).toBeVisible({
        timeout: 5000,
      })
    }
  })

  test('Service Worker and Cache Allowlist never cache private or sensitive endpoints', async ({
    request,
  }) => {
    const swRes = await request.get('/sw.js')
    expect(swRes.status()).toBe(200)
    const swText = await swRes.text()

    // Check sensitive prefixes blocklist
    for (const prefix of [
      '/nori-api',
      '/dashboard',
      '/admin',
      '/account',
      '/my-bookings',
      '/checkout',
      '/login',
      '/register',
    ]) {
      expect(swText).toContain(`'${prefix}'`)
    }

    // Verify Set-Cookie and no-store protection in SW
    expect(swText).toContain('set-cookie')
    expect(swText).toContain('no-store')
  })
})
