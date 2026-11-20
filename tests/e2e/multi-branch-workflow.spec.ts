import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { addDays, businessToday } from '../../src/lib/rental-rules'

const ORIGIN = process.env.NORI_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const AUTH_HEADERS = { origin: ORIGIN, referer: `${ORIGIN}/` }

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

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
  accountType: 'admin' | 'customer',
) {
  const res = await request.post(`${ORIGIN}/nori-api/auth/login`, {
    headers: AUTH_HEADERS,
    data: { email, password, accountType },
  })
  expect(res.status(), `Login failed for ${email}`).toBe(200)
}

test.describe.serial('Module 3.7 — Multi-Branch & Multi-Location Full E2E Suite', () => {
  const uid = randomBytes(3).toString('hex').toUpperCase()
  const branchACode = `E2E-HCM-${uid}`
  const branchBCode = `E2E-HN-${uid}`
  const whACode = `WH-HCM-${uid}`
  const whBCode = `WH-HN-${uid}`
  const locACode = `LOC-HCM-${uid}`
  const zoneACode = `ZN-HCM-${uid}`
  const pricingCode = `PR-HCM-${uid}`
  const promoBranchCode = `BRPROMO${uid}`

  const custEmail = `mb_cust_${uid.toLowerCase()}@nori.vn`
  const custPass = 'NoriTest123!'
  const staffAEmail = `mb_staff_a_${uid.toLowerCase()}@nori.vn`
  const mgrAEmail = `mb_mgr_a_${uid.toLowerCase()}@nori.vn`
  const staffPass = 'NoriStaff123!'

  let branchAId = ''
  let branchBId = ''
  let whAId = ''
  let whBId = ''
  let locAId = ''
  let zoneAId = ''
  let pricingRuleId = ''
  let oneWayRuleId = ''
  let vehicleId = ''
  let vehicle2Id = ''
  let modelId = ''
  let staffAId = ''
  let oneWayBookingId = ''

  test('Scenario 1 & 2: Admin configures branches, warehouses, locations, pricing, one-way rules; customer books one-way with idempotency & concurrency safety', async ({
    browser,
    page,
  }) => {
    const adminCreds = getAdminCredentials()
    expect(adminCreds.password).toBeTruthy()

    // 1. Login as Super Admin in browser context
    await loginAs(page.request, adminCreds.email, adminCreds.password, 'admin')

    // Verify all 8 new Admin Dashboard routes render with HTTP 200 & zero uncaught console errors
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    for (const route of [
      '/dashboard/branches',
      '/dashboard/warehouses',
      '/dashboard/locations',
      '/dashboard/staff',
      '/dashboard/transfers',
      '/dashboard/deliveries',
      '/dashboard/location-pricing',
      '/dashboard/branch-reports',
    ]) {
      const resp = await page.goto(route, { waitUntil: 'domcontentloaded' })
      expect(resp?.status(), `Route ${route} failed`).toBe(200)
      await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
    }
    expect(pageErrors).toEqual([])

    // 2. Create Branch A (HCM) & Branch B (HN)
    const brARes = await page.request.post(`${ORIGIN}/nori-api/dashboard/branches`, {
      headers: AUTH_HEADERS,
      data: {
        code: branchACode,
        name: `NORI E2E HCM ${uid}`,
        province: 'TP. Hồ Chí Minh',
        ward: 'Phường Bến Nghé',
        address: '100 Đường E2E Quận 1',
        hotline: '0281234567',
        workStartTime: '07:30',
        workEndTime: '21:00',
        supportsHomeDelivery: true,
        supportsHomePickup: true,
        defaultDeliveryFee: 150_000,
        defaultPickupFee: 150_000,
        afterHoursFee: 100_000,
        status: 'ACTIVE',
      },
    })
    expect(brARes.status()).toBe(201)
    branchAId = (await brARes.json()).data.id

    // BR-02: Duplicate branch code rejected 409
    const dupRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/branches`, {
      headers: AUTH_HEADERS,
      data: {
        code: branchACode,
        name: 'Duplicate Branch',
        province: 'TP. Hồ Chí Minh',
        address: '999 Duplicate St',
      },
    })
    expect(dupRes.status()).toBe(409)

    const brBRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/branches`, {
      headers: AUTH_HEADERS,
      data: {
        code: branchBCode,
        name: `NORI E2E Hà Nội ${uid}`,
        province: 'Hà Nội',
        ward: 'Phường Tràng Tiền',
        address: '200 Đường E2E Hoàn Kiếm',
        workStartTime: '07:30',
        workEndTime: '21:00',
        supportsHomeDelivery: true,
        supportsHomePickup: true,
        defaultDeliveryFee: 120_000,
        defaultPickupFee: 120_000,
        status: 'ACTIVE',
      },
    })
    expect(brBRes.status()).toBe(201)
    branchBId = (await brBRes.json()).data.id

    // 3. Create Warehouses A & B
    const whARes = await page.request.post(`${ORIGIN}/nori-api/dashboard/warehouses`, {
      headers: AUTH_HEADERS,
      data: {
        code: whACode,
        name: `Kho E2E HCM ${uid}`,
        branchId: branchAId,
        warehouseType: 'SHOWROOM',
        address: '100 Đường E2E Quận 1',
        capacity: 15,
        isCustomerFacing: true,
      },
    })
    expect(whARes.status()).toBe(201)
    whAId = (await whARes.json()).data.id

    const whBRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/warehouses`, {
      headers: AUTH_HEADERS,
      data: {
        code: whBCode,
        name: `Kho E2E Hà Nội ${uid}`,
        branchId: branchBId,
        warehouseType: 'SHOWROOM',
        address: '200 Đường E2E Hoàn Kiếm',
        capacity: 15,
        isCustomerFacing: true,
      },
    })
    expect(whBRes.status()).toBe(201)
    whBId = (await whBRes.json()).data.id

    // BR-03: Hard-delete Branch A with linked warehouse must be blocked (409)
    const delBrRes = await page.request.delete(
      `${ORIGIN}/nori-api/dashboard/branches?id=${encodeURIComponent(branchAId)}`,
      { headers: AUTH_HEADERS },
    )
    expect(delBrRes.status()).toBe(409)

    // 4. Create verified Service Location at Branch A + Delivery Zone A
    const locRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/locations`, {
      headers: AUTH_HEADERS,
      data: {
        code: locACode,
        name: `Điểm nhận sân bay E2E ${uid}`,
        branchId: branchAId,
        locationType: 'AIRPORT',
        address: 'Ga quốc nội E2E',
        province: 'TP. Hồ Chí Minh',
        surchargeFee: 50_000,
        verified: true,
        supportsPickup: true,
        supportsReturn: true,
      },
    })
    expect(locRes.status()).toBe(201)
    locAId = (await locRes.json()).data.id

    const zoneRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/deliveries`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'zone',
        code: zoneACode,
        name: `Khu vực Trung tâm HCM ${uid}`,
        branchId: branchAId,
        province: 'TP. Hồ Chí Minh',
        wards: 'Quận 1, Quận 3',
        deliveryFee: 150_000,
        pickupFee: 150_000,
        afterHoursFee: 100_000,
        serviceStartTime: '08:00',
        serviceEndTime: '20:00',
      },
    })
    expect(zoneRes.status()).toBe(201)
    zoneAId = (await zoneRes.json()).data.id

    // 5. Pick 2 rentable vehicles from existing fleet and allocate both to Branch A / WH-A
    const fleetRes = await page.request.get(`${ORIGIN}/nori-api/dashboard/vehicles?status=ACTIVE`)
    expect(fleetRes.status()).toBe(200)
    const fleetItems = (await fleetRes.json()).data.items as Array<{
      id: string
      modelId: string
      intent: string
      pricePerDay: number | null
      operationStatus: string
    }>
    const rentableVehicles = fleetItems.filter(
      (v) => v.intent !== 'SALE' && Boolean(v.pricePerDay) && v.operationStatus === 'READY',
    )
    expect(rentableVehicles.length).toBeGreaterThanOrEqual(2)
    vehicleId = rentableVehicles[0].id
    modelId = rentableVehicles[0].modelId
    vehicle2Id = rentableVehicles[1].id

    const allocRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/warehouses`, {
      headers: AUTH_HEADERS,
      data: {
        action: 'bulk_allocate',
        vehicleIds: [vehicleId, vehicle2Id],
        managingBranchId: branchAId,
        warehouseId: whAId,
      },
    })
    expect(allocRes.status()).toBe(200)

    // 6. Create Location Pricing Rule (MODEL_BRANCH) + One-Way Rule (A -> B allowed, fee 500k, min 2 days, 50/50 split)
    const prRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/location-pricing`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'pricing',
        code: pricingCode,
        name: `Giá riêng HCM ${uid}`,
        scopeType: 'MODEL_BRANCH',
        branchId: branchAId,
        vehicleModelId: modelId,
        dailyPrice: 1_200_000,
        locationSurcharge: 0,
      },
    })
    expect(prRes.status()).toBe(201)
    pricingRuleId = (await prRes.json()).data.id

    const owRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/location-pricing`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'one-way',
        fromBranchId: branchAId,
        toBranchId: branchBId,
        vehicleCategory: 'ALL',
        allowed: true,
        fee: 500_000,
        minRentalDays: 2,
        revenueSplitMode: 'SPLIT_50_50',
        pickupBranchSharePercent: 50,
      },
    })
    expect(owRes.status()).toBe(201)
    oneWayRuleId = (await owRes.json()).data.id

    // Branch-scoped Promotion (only Branch A)
    const promoRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/promotions`, {
      headers: AUTH_HEADERS,
      data: {
        code: promoBranchCode,
        name: `Ưu đãi riêng CN HCM ${uid}`,
        discountType: 'FIXED',
        discountValue: 200_000,
        minDays: 2,
        appliesTo: 'RENT',
        branchScope: 'SPECIFIC_BRANCHES',
        applicableBranchIds: [branchAId],
        active: true,
      },
    })
    expect(promoRes.status()).toBe(201)

    // Verify public /locations returns our new active branches & rules
    const pubLocs = await page.request.get(`${ORIGIN}/nori-api/locations`)
    expect(pubLocs.status()).toBe(200)
    const pubData = (await pubLocs.json()).data
    expect(pubData.branches.some((b: { id: string }) => b.id === branchAId)).toBe(true)

    // 7. Customer registers in a fresh isolated browser context (separate cookie jar from Admin!)
    const custContext = await browser.newContext()
    const custPage = await custContext.newPage()
    const regRes = await custPage.request.post(`${ORIGIN}/nori-api/auth/register`, {
      headers: AUTH_HEADERS,
      data: {
        fullName: `Khách E2E ${uid}`,
        email: custEmail,
        password: custPass,
        confirmPassword: custPass,
        phone: '0912345678',
      },
    })
    expect(regRes.status()).toBe(201)

    const today = businessToday()
    const startDate = addDays(today, 35)
    const endDate = addDays(today, 37) // 2 days

    // BK-04: Catalogue availability shows model at Branch A, NOT at Branch B
    const catA = await custPage.request.get(
      `${ORIGIN}/nori-api/availability?mode=catalogue&pickupBranchId=${branchAId}&startDate=${startDate}&endDate=${endDate}`,
    )
    expect((await catA.json()).data.availableModelIds).toContain(modelId)

    const catB = await custPage.request.get(
      `${ORIGIN}/nori-api/availability?mode=catalogue&pickupBranchId=${branchBId}&startDate=${startDate}&endDate=${endDate}`,
    )
    expect((await catB.json()).data.availableModelIds).not.toContain(modelId)

    // BK-03: Disallowed one-way route B -> A is rejected
    const badOneWay = await custPage.request.get(
      `${ORIGIN}/nori-api/availability?vehicle=${vehicleId}&startDate=${startDate}&endDate=${endDate}&pickupBranchId=${branchBId}&returnBranchId=${branchAId}`,
    )
    expect((await badOneWay.json()).data.available).toBe(false)

    // BK-02 + PR-02 + PR-04: Quote for one-way A -> B + Service Location A + Home Delivery Zone A + Branch A Promo
    const quoteRes = await custPage.request.get(
      `${ORIGIN}/nori-api/availability?vehicle=${vehicleId}&startDate=${startDate}&endDate=${endDate}&pickupBranchId=${branchAId}&returnBranchId=${branchBId}&pickupServiceLocationId=${locAId}&pickupMethod=HOME_DELIVERY&delivery=1&deliveryZoneId=${zoneAId}&promoCode=${promoBranchCode}`,
    )
    expect(quoteRes.status()).toBe(200)
    const qData = (await quoteRes.json()).data
    expect(qData.available).toBe(true)
    expect(qData.dailyPrice).toBe(1_200_000)
    expect(qData.oneWayFee).toBe(500_000)
    expect(qData.locationSurcharge).toBe(50_000)
    expect(qData.deliveryFee).toBe(150_000)
    expect(qData.promoDiscountAmount).toBe(200_000)

    // BK-15: Create one-way booking with idempotencyKey -> repeat identical request returns SAME booking!
    const idemKey = `e2e-idem-${uid}`
    const bkPayload = {
      vehicle: vehicleId,
      startDate,
      endDate,
      pickupTime: '09:00',
      returnTime: '18:00',
      pickupBranch: branchAId,
      returnBranch: branchBId,
      pickupServiceLocation: locAId,
      pickupMethod: 'HOME_DELIVERY',
      deliveryRequested: true,
      deliveryZone: zoneAId,
      deliveryAddress: '123 Lê Lợi, Quận 1, TP.HCM',
      customerPhone: '0912345678',
      promoCode: promoBranchCode,
      expectedTotalPrice: qData.estimatedTotal,
      idempotencyKey: idemKey,
    }
    const bk1Res = await custPage.request.post(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: bkPayload,
    })
    expect(bk1Res.status()).toBe(201)
    const bk1 = (await bk1Res.json()).data
    oneWayBookingId = bk1.id
    expect(bk1.isOneWay).toBe(true)
    expect(bk1.oneWayFeeSnapshot).toBe(500_000)

    const bk1Repeat = await custPage.request.post(`${ORIGIN}/nori-api/bookings`, {
      headers: AUTH_HEADERS,
      data: bkPayload,
    })
    expect(bk1Repeat.status()).toBe(200)
    expect((await bk1Repeat.json()).data.id).toBe(oneWayBookingId)

    // BK-13: Concurrent race condition on vehicle2Id for overlapping dates -> strictly 1 succeeds, 1 fails 409!
    const raceStart = addDays(today, 40)
    const raceEnd = addDays(today, 42)
    const [r1, r2] = await Promise.all([
      custPage.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicle2Id,
          startDate: raceStart,
          endDate: raceEnd,
          pickupBranch: branchAId,
          returnBranch: branchAId,
          customerPhone: '0912345678',
          idempotencyKey: `race-1-${uid}`,
        },
      }),
      custPage.request.post(`${ORIGIN}/nori-api/bookings`, {
        headers: AUTH_HEADERS,
        data: {
          vehicle: vehicle2Id,
          startDate: raceStart,
          endDate: raceEnd,
          pickupBranch: branchAId,
          returnBranch: branchAId,
          customerPhone: '0912345678',
          idempotencyKey: `race-2-${uid}`,
        },
      }),
    ])
    const statuses = [r1.status(), r2.status()].sort((a, b) => a - b)
    expect(statuses).toEqual([201, 409])

    // PR-07/PR-08: Admin changes pricing rule after booking -> existing booking totalPrice stays immutable!
    const patchPr = await page.request.patch(`${ORIGIN}/nori-api/dashboard/location-pricing`, {
      headers: AUTH_HEADERS,
      data: { entity: 'pricing', id: pricingRuleId, dailyPrice: 2_500_000 },
    })
    expect(patchPr.status()).toBe(200)

    const checkBk = await custPage.request.get(
      `${ORIGIN}/nori-api/bookings?id=${encodeURIComponent(oneWayBookingId)}`,
    )
    expect((await checkBk.json()).data.totalPrice).toBe(bk1.totalPrice)

    // Verify customer UI /my-bookings renders one-way badge & route!
    await custPage.goto('/my-bookings', { waitUntil: 'domcontentloaded' })
    await expect(custPage.getByText('Thuê một chiều').first()).toBeVisible({ timeout: 10_000 })

    await custContext.close()
  })

  test('Scenario 3 & 4: Atomic Vehicle Transfer A->B + Delivery Staff Conflict DL-06 + Failed Delivery DL-07', async ({
    page,
  }) => {
    const adminCreds = getAdminCredentials()
    await loginAs(page.request, adminCreds.email, adminCreds.password, 'admin')

    // Confirm one-way booking first so we can dispatch delivery job
    const confirmBk = await page.request.patch(`${ORIGIN}/nori-api/dashboard/bookings`, {
      headers: AUTH_HEADERS,
      data: { id: oneWayBookingId, status: 'CONFIRMED' },
    })
    expect(confirmBk.status()).toBe(200)

    // Create Transfer A -> B for vehicle2Id on future free dates
    const trStart = addDays(businessToday(), 55)
    const trEnd = addDays(businessToday(), 56)
    const trCreate = await page.request.post(`${ORIGIN}/nori-api/dashboard/transfers`, {
      headers: AUTH_HEADERS,
      data: {
        vehicleId: vehicle2Id,
        toBranchId: branchBId,
        toWarehouseId: whBId,
        reason: 'E2E Transfer Test',
        scheduledDepartureAt: `${trStart}T08:00:00.000Z`,
        scheduledArrivalAt: `${trEnd}T18:00:00.000Z`,
        transferCost: 300_000,
        submitForApproval: true,
      },
    })
    expect(trCreate.status()).toBe(201)
    const trData = (await trCreate.json()).data
    const trId = trData.id

    // Approve -> Depart -> Block Cancel (TR-10) -> Arrived -> Complete -> Block Double-Complete (TR-08)
    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: { transferId: trId, nextStatus: 'APPROVED', expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200)

    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: {
            transferId: trId,
            nextStatus: 'IN_TRANSIT',
            expectedRevision: 2,
            odometerBefore: 15000,
          },
        })
      ).status(),
    ).toBe(200)

    // TR-10: Cancel after departure blocked
    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: { transferId: trId, nextStatus: 'CANCELLED', expectedRevision: 3 },
        })
      ).status(),
    ).toBe(409)

    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: { transferId: trId, nextStatus: 'ARRIVED', expectedRevision: 3 },
        })
      ).status(),
    ).toBe(200)

    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: {
            transferId: trId,
            nextStatus: 'COMPLETED',
            expectedRevision: 4,
            odometerAfter: 15600,
          },
        })
      ).status(),
    ).toBe(200)

    // TR-08: Double-complete blocked
    expect(
      (
        await page.request.patch(`${ORIGIN}/nori-api/dashboard/transfers`, {
          headers: AUTH_HEADERS,
          data: { transferId: trId, nextStatus: 'COMPLETED', expectedRevision: 5 },
        })
      ).status(),
    ).toBe(409)

    // Scenario 4: Delivery Job + DL-06 Staff Conflict + DL-07 Failed Delivery
    const meRes = await page.request.get(`${ORIGIN}/nori-api/auth/me`)
    const adminId = (await meRes.json()).data.id
    const dlvDate = addDays(businessToday(), 35)

    const job1 = await page.request.post(`${ORIGIN}/nori-api/dashboard/deliveries`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'job',
        bookingId: oneWayBookingId,
        jobType: 'DELIVERY',
        scheduledDate: dlvDate,
        scheduledTime: '09:00',
        assignedStaffId: adminId,
        address: '123 Lê Lợi, Q1',
      },
    })
    expect(job1.status()).toBe(201)
    const job1Id = (await job1.json()).data.id

    // DL-06: Same staff overlapping at 09:30 -> 409 CONFLICT
    const jobConflict = await page.request.post(`${ORIGIN}/nori-api/dashboard/deliveries`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'job',
        bookingId: oneWayBookingId,
        jobType: 'DELIVERY',
        scheduledDate: dlvDate,
        scheduledTime: '09:30',
        assignedStaffId: adminId,
        address: '456 Đồng Khởi, Q1',
      },
    })
    expect(jobConflict.status()).toBe(409)

    // DL-07: Fail job -> booking remains CONFIRMED (NOT falsely ONGOING)
    const failRes = await page.request.patch(`${ORIGIN}/nori-api/dashboard/deliveries`, {
      headers: AUTH_HEADERS,
      data: {
        entity: 'job',
        id: job1Id,
        status: 'FAILED',
        failureReason: 'Khách hẹn dời lịch nhận xe sang buổi chiều',
      },
    })
    expect(failRes.status()).toBe(200)
    const bkCheck = await page.request.get(`${ORIGIN}/nori-api/dashboard/bookings?status=CONFIRMED`)
    const found = ((await bkCheck.json()).data.items as Array<{ id: string }>).find(
      (b) => b.id === oneWayBookingId,
    )
    expect(found).toBeDefined()
  })

  test('Scenario 5 & 6: Branch RBAC Isolation/IDOR (RB-01..RB-07), Revocation, Zero Double-Count Reports (RP-01..RP-03) & Mobile/Tablet UI', async ({
    browser,
    page,
  }) => {
    const adminCreds = getAdminCredentials()
    await loginAs(page.request, adminCreds.email, adminCreds.password, 'admin')

    // Create Branch A Staff & Branch A Manager
    const stRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/staff`, {
      headers: AUTH_HEADERS,
      data: {
        action: 'create_staff',
        email: staffAEmail,
        password: staffPass,
        fullName: `Staff A ${uid}`,
        staffTitle: 'RENTAL_STAFF',
        branchIds: [branchAId],
      },
    })
    expect(stRes.status()).toBe(201)
    staffAId = (await stRes.json()).data.id

    const mgrRes = await page.request.post(`${ORIGIN}/nori-api/dashboard/staff`, {
      headers: AUTH_HEADERS,
      data: {
        action: 'create_staff',
        email: mgrAEmail,
        password: staffPass,
        fullName: `Manager A ${uid}`,
        staffTitle: 'BRANCH_MANAGER',
        branchIds: [branchAId],
      },
    })
    expect(mgrRes.status()).toBe(201)

    // Test Branch A Staff isolation & IDOR protection in separate context
    const staffCtx = await browser.newContext()
    await loginAs(staffCtx.request, staffAEmail, staffPass, 'admin')

    // RB-01: Staff A CAN read own Branch A and bookings
    expect(
      (
        await staffCtx.request.get(`${ORIGIN}/nori-api/dashboard/branches?branchId=${branchAId}`)
      ).status(),
    ).toBe(200)
    expect((await staffCtx.request.get(`${ORIGIN}/nori-api/dashboard/bookings`)).status()).toBe(200)

    // RB-02: IDOR attempting to read Branch B -> 403
    expect(
      (
        await staffCtx.request.get(`${ORIGIN}/nori-api/dashboard/branches?branchId=${branchBId}`)
      ).status(),
    ).toBe(403)
    // RB-07 / RP-03: Attempting to export Branch B CSV -> 403
    expect(
      (
        await staffCtx.request.get(
          `${ORIGIN}/nori-api/dashboard/export?type=branch-reports&branchId=${branchBId}`,
        )
      ).status(),
    ).toBe(403)

    // Test Branch A Manager anti-privilege-escalation (RB-03)
    const mgrCtx = await browser.newContext()
    await loginAs(mgrCtx.request, mgrAEmail, staffPass, 'admin')
    const escRes = await mgrCtx.request.post(`${ORIGIN}/nori-api/dashboard/staff`, {
      headers: AUTH_HEADERS,
      data: {
        action: 'create_staff',
        email: `evil_super_${uid.toLowerCase()}@nori.vn`,
        password: staffPass,
        fullName: 'Evil Super',
        staffTitle: 'SUPER_ADMIN',
        branchIds: [branchAId],
      },
    })
    expect(escRes.status()).toBe(403)
    await mgrCtx.close()

    // RB-05: Super Admin revokes Staff A -> Staff A immediately blocked 403!
    const revokeRes = await page.request.patch(`${ORIGIN}/nori-api/dashboard/staff`, {
      headers: AUTH_HEADERS,
      data: { adminId: staffAId, accountStatus: 'REVOKED' },
    })
    expect(revokeRes.status()).toBe(200)
    expect((await staffCtx.request.get(`${ORIGIN}/nori-api/dashboard/bookings`)).status()).toBe(403)
    await staffCtx.close()

    // RP-01/RP-02: Branch reports revenue zero double-counting + CSV export
    const repRes = await page.request.get(`${ORIGIN}/nori-api/dashboard/branch-reports`)
    expect(repRes.status()).toBe(200)
    const repData = (await repRes.json()).data
    const sumBranchNet =
      (repData.branches as Array<{ metrics: { netRevenue: number } }>).reduce(
        (s, b) => s + b.metrics.netRevenue,
        0,
      ) + (repData.unassigned?.netRevenue ?? 0)
    expect(sumBranchNet).toBe(repData.systemTotal.netRevenue)

    const csvRes = await page.request.get(`${ORIGIN}/nori-api/dashboard/export?type=branch-reports`)
    expect(csvRes.status()).toBe(200)
    const csvText = await csvRes.text()
    expect(csvText).toContain('MaChiNhanh')
    expect(csvText).toContain(branchACode)

    // UI-02: Responsive check on Mobile (375x812) and Tablet (768x1024) — zero horizontal overflow
    for (const vp of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(vp)
      for (const route of ['/dashboard/branches', '/dashboard/branch-reports', '/vehicles']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `Horizontal overflow on ${route} at ${vp.width}px`).toBeLessThanOrEqual(4)
      }
    }
  })
})
