import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { evaluateVehicleBookingAvailabilityAndPricing } from '@/lib/multi-branch-service'
import {
  ACTIVE_TRANSFER_LOCK_STATUSES,
  evaluateVehicleLocationTimeline,
  matchOneWayRule,
  type OneWayRuleLike,
  type PickupMethod,
  type ReturnMethod,
  type TransferStatus,
} from '@/lib/multi-branch-rules'
import {
  HOLD_STATUSES,
  addDays,
  businessToday,
  parseAddonKeys,
  relationId,
  validateRentalDates,
} from '@/lib/rental-rules'
import { apiError, fail, json } from '@/lib/api-utils'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const payload = await getPayloadClient()

    // Mode 1: Real-time Catalogue Availability Filtering by Branch / Location / Dates (Section 4.2 & VIII)
    if (params.get('mode') === 'catalogue') {
      const pickupBranchIdParam = params.get('pickupBranchId')?.trim() || null
      const returnBranchIdParam = params.get('returnBranchId')?.trim() || null
      const pickupLocationId =
        params.get('pickupServiceLocationId')?.trim() ||
        params.get('pickupLocationId')?.trim() ||
        null
      const returnLocationId =
        params.get('returnServiceLocationId')?.trim() ||
        params.get('returnLocationId')?.trim() ||
        null
      const startDate = params.get('startDate')?.trim() || ''
      const endDate = params.get('endDate')?.trim() || ''
      const category = params.get('category')?.trim().toUpperCase() || ''

      if (startDate || endDate) {
        const dv = validateRentalDates(startDate, endDate)
        if (dv.error) return fail(dv.error, 400, 'INVALID_DATES')
      }

      let pickupBranchId = pickupBranchIdParam
      let returnBranchId = returnBranchIdParam
      if (pickupLocationId && !pickupBranchId) {
        const loc = await payload
          .findByID({
            collection: 'service-locations',
            id: pickupLocationId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
        if (!loc || loc.status !== 'ACTIVE' || loc.supportsPickup === false) {
          return json({
            availableModelIds: [],
            availableVehicleIds: [],
            countsByModel: {},
            routeAllowed: false,
            warning: 'Điểm nhận xe đã chọn hiện không khả dụng.',
          })
        }
        pickupBranchId = relationId(loc.branch) ?? null
      }
      if (returnLocationId && !returnBranchId) {
        const loc = await payload
          .findByID({
            collection: 'service-locations',
            id: returnLocationId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
        if (!loc || loc.status !== 'ACTIVE' || loc.supportsReturn === false) {
          return json({
            availableModelIds: [],
            availableVehicleIds: [],
            countsByModel: {},
            routeAllowed: false,
            warning: 'Điểm trả xe đã chọn hiện không tiếp nhận trả xe.',
          })
        }
        returnBranchId = relationId(loc.branch) ?? null
      }
      if (!returnBranchId) returnBranchId = pickupBranchId

      const [vehiclesRes, branchesRes, bookingsRes, transfersRes, maintRes, oneWayRes] =
        await Promise.all([
          payload.find({
            collection: 'vehicles',
            overrideAccess: true,
            depth: 1,
            limit: 1000,
            where: {
              and: [
                { status: { equals: 'ACTIVE' } },
                { intent: { not_equals: 'SALE' } },
                { operationStatus: { not_in: ['SOLD', 'INACTIVE', 'MAINTENANCE', 'RESERVED'] } },
              ],
            },
          }),
          payload.find({
            collection: 'branches',
            overrideAccess: true,
            depth: 0,
            limit: 200,
          }),
          startDate && endDate
            ? payload.find({
                collection: 'bookings',
                overrideAccess: true,
                depth: 0,
                limit: 1000,
                where: { status: { in: [...HOLD_STATUSES] } },
              })
            : Promise.resolve({ docs: [] }),
          payload.find({
            collection: 'vehicle-transfers',
            overrideAccess: true,
            depth: 0,
            limit: 500,
            where: { status: { in: [...ACTIVE_TRANSFER_LOCK_STATUSES] } },
          }),
          startDate && endDate
            ? payload.find({
                collection: 'maintenance-schedules',
                overrideAccess: true,
                depth: 0,
                limit: 500,
                where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
              })
            : Promise.resolve({ docs: [] }),
          pickupBranchId && returnBranchId && pickupBranchId !== returnBranchId
            ? payload.find({
                collection: 'one-way-rental-rules',
                overrideAccess: true,
                depth: 0,
                limit: 50,
                where: {
                  and: [
                    { fromBranch: { equals: pickupBranchId } },
                    { toBranch: { equals: returnBranchId } },
                    { active: { equals: true } },
                  ],
                },
              })
            : Promise.resolve({ docs: [] }),
        ])

      const branchStatusMap = new Map(branchesRes.docs.map((b) => [String(b.id), b.status]))
      const bookingsByVeh = new Map<string, typeof bookingsRes.docs>()
      for (const b of bookingsRes.docs) {
        const vId = relationId(b.vehicle)
        if (!vId) continue
        const arr = bookingsByVeh.get(String(vId)) ?? []
        arr.push(b)
        bookingsByVeh.set(String(vId), arr)
      }
      const transfersByVeh = new Map<string, typeof transfersRes.docs>()
      for (const t of transfersRes.docs) {
        const vId = relationId(t.vehicle)
        if (!vId) continue
        const arr = transfersByVeh.get(String(vId)) ?? []
        arr.push(t)
        transfersByVeh.set(String(vId), arr)
      }
      const maintByVeh = new Map<string, typeof maintRes.docs>()
      for (const m of maintRes.docs) {
        const vId = relationId(m.vehicle)
        if (!vId) continue
        const arr = maintByVeh.get(String(vId)) ?? []
        arr.push(m)
        maintByVeh.set(String(vId), arr)
      }

      const mappedOneWay: OneWayRuleLike[] = oneWayRes.docs.map((r) => ({
        id: String(r.id),
        fromBranchId: String(relationId(r.fromBranch) ?? ''),
        toBranchId: String(relationId(r.toBranch) ?? ''),
        vehicleCategory: r.vehicleCategory ?? 'ALL',
        allowed: r.allowed !== false,
        fee: r.fee ?? 0,
        minRentalDays: r.minRentalDays ?? 1,
        active: r.active !== false,
      }))

      const availableVehicleIds: string[] = []
      const countsByModel: Record<string, number> = {}
      let routeBlockedWarning: string | null = null
      const effectiveStart = startDate || businessToday()
      const effectiveEnd = endDate || addDays(effectiveStart, 1)

      for (const v of vehiclesRes.docs) {
        const modelObj = typeof v.model === 'object' && v.model ? v.model : null
        if (!modelObj || !modelObj.visible) continue
        if (category && modelObj.category !== category) continue
        const vCurrBranch = relationId(v.currentBranch) ?? null
        const vMgmtBranch = relationId(v.managingBranch) ?? null

        const oneWayRule =
          pickupBranchId && returnBranchId && pickupBranchId !== returnBranchId
            ? matchOneWayRule(mappedOneWay, pickupBranchId, returnBranchId, modelObj.category)
            : null

        const res = evaluateVehicleLocationTimeline({
          vehicleOperationStatus: String(v.operationStatus ?? 'READY'),
          vehicleBusinessStatus: String(v.status ?? 'ACTIVE'),
          currentBranchId: vCurrBranch,
          managingBranchId: vMgmtBranch,
          startDate: effectiveStart,
          endDate: effectiveEnd,
          requestedPickupBranchId: pickupBranchId,
          requestedReturnBranchId: returnBranchId,
          pickupBranchStatus: pickupBranchId
            ? ((branchStatusMap.get(pickupBranchId) as never) ?? null)
            : null,
          returnBranchStatus: returnBranchId
            ? ((branchStatusMap.get(returnBranchId) as never) ?? null)
            : null,
          oneWayRule,
          bookings: (bookingsByVeh.get(String(v.id)) ?? []).map((b) => ({
            id: String(b.id),
            bookingKey: b.bookingKey ?? String(b.id),
            startDate: b.startDate,
            endDate: b.endDate,
            status: String(b.status ?? 'PENDING'),
            pickupBranchId: relationId(b.pickupBranch) ?? null,
            returnBranchId: relationId(b.returnBranch) ?? null,
          })),
          transfers: (transfersByVeh.get(String(v.id)) ?? []).map((t) => ({
            id: String(t.id),
            transferCode: t.transferCode,
            fromBranchId: String(relationId(t.fromBranch) ?? ''),
            toBranchId: String(relationId(t.toBranch) ?? ''),
            startDate: t.startDate,
            endDate: t.endDate,
            status: t.status as TransferStatus,
          })),
          maintenances: (maintByVeh.get(String(v.id)) ?? []).map((m) => ({
            id: String(m.id),
            startDate: m.startDate,
            endDate: m.endDate,
            status: m.status,
          })),
        })

        if (res.available) {
          availableVehicleIds.push(String(v.id))
          countsByModel[String(modelObj.id)] = (countsByModel[String(modelObj.id)] ?? 0) + 1
        } else if (
          res.reasonCode === 'ONE_WAY_NOT_ALLOWED' ||
          res.reasonCode === 'ONE_WAY_MIN_DAYS_NOT_MET' ||
          res.reasonCode === 'PICKUP_BRANCH_INACTIVE' ||
          res.reasonCode === 'RETURN_BRANCH_INACTIVE'
        ) {
          routeBlockedWarning = res.reason ?? routeBlockedWarning
        }
      }

      return json({
        availableModelIds: Object.keys(countsByModel),
        availableVehicleIds,
        countsByModel,
        routeAllowed: !routeBlockedWarning,
        warning: routeBlockedWarning,
      })
    }

    // Mode 2: Single-vehicle calendar & authoritative multi-branch quote
    const id = params.get('vehicle')
    if (!id) return fail('Vui lòng chọn xe thực tế.')
    const vehicle = await payload.findByID({
      collection: 'vehicles',
      id,
      overrideAccess: false,
      depth: 0,
    })
    if (
      !vehicle ||
      vehicle.status !== 'ACTIVE' ||
      vehicle.intent === 'SALE' ||
      vehicle.operationStatus === 'SOLD' ||
      vehicle.operationStatus === 'MAINTENANCE' ||
      vehicle.operationStatus === 'INACTIVE' ||
      vehicle.operationStatus === 'RESERVED'
    )
      return fail('Xe đang được giữ chỗ hoặc chưa nhận đặt thuê.', 409, 'VEHICLE_NOT_AVAILABLE')

    const excludeBookingId = (params.get('excludeBookingId') ?? '').trim()
    let excludeBookingKey: string | null = null
    let existingBookingPromo: string | null = null
    if (excludeBookingId) {
      const user = await appAuth.currentUser()
      if (user) {
        const ownBooking = await payload
          .findByID({
            collection: 'bookings',
            id: excludeBookingId,
            user,
            overrideAccess: false,
            depth: 0,
          })
          .catch(() => null)
        if (ownBooking?.bookingKey) {
          excludeBookingKey = ownBooking.bookingKey
          existingBookingPromo = ownBooking.promoCode?.trim().toUpperCase() ?? null
        }
      }
    }

    const startDate = params.get('startDate')
    const endDate = params.get('endDate')
    if (!startDate && !endDate) {
      const [slots, maints, transfers] = await Promise.all([
        payload.find({
          collection: 'rental-days',
          overrideAccess: Boolean(excludeBookingKey),
          depth: 0,
          limit: 150,
          where: {
            and: [
              { vehicle: { equals: id } },
              {
                day: {
                  greater_than_equal: businessToday(),
                  less_than: addDays(businessToday(), 121),
                },
              },
              ...(excludeBookingKey ? [{ bookingKey: { not_equals: excludeBookingKey } }] : []),
            ],
          },
          select: { day: true },
        }),
        payload.find({
          collection: 'maintenance-schedules',
          overrideAccess: true,
          depth: 0,
          limit: 30,
          where: {
            and: [{ vehicle: { equals: id } }, { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } }],
          },
          select: { startDate: true, endDate: true, status: true },
        }),
        payload.find({
          collection: 'vehicle-transfers',
          overrideAccess: true,
          depth: 0,
          limit: 30,
          where: {
            and: [
              { vehicle: { equals: id } },
              { status: { in: [...ACTIVE_TRANSFER_LOCK_STATUSES] } },
            ],
          },
          select: { startDate: true, endDate: true, status: true },
        }),
      ])
      const busySet = new Set(slots.docs.map((d) => d.day))
      for (const m of maints.docs) {
        let cur = m.startDate
        for (let i = 0; i < 90 && cur <= m.endDate; i += 1) {
          busySet.add(cur)
          cur = addDays(cur, 1)
        }
      }
      for (const t of transfers.docs) {
        let cur = t.startDate
        for (let i = 0; i < 30 && cur <= t.endDate; i += 1) {
          busySet.add(cur)
          cur = addDays(cur, 1)
        }
      }
      return json({ busyDays: Array.from(busySet) })
    }

    const validation = validateRentalDates(startDate ?? '', endDate ?? '')
    if (validation.error || !validation.totalDays)
      return fail(validation.error ?? 'Ngày thuê không hợp lệ.')

    const deliveryRequested = ['1', 'true'].includes(params.get('delivery') ?? '')
    const pickupMethodParam = params.get('pickupMethod')?.trim().toUpperCase()
    const returnMethodParam = params.get('returnMethod')?.trim().toUpperCase()
    const pickupMethod: PickupMethod =
      pickupMethodParam === 'HOME_DELIVERY' || deliveryRequested ? 'HOME_DELIVERY' : 'BRANCH_PICKUP'
    const returnMethod: ReturnMethod =
      returnMethodParam === 'HOME_PICKUP' ? 'HOME_PICKUP' : 'BRANCH_RETURN'

    const evaluation = await evaluateVehicleBookingAvailabilityAndPricing(payload, {
      vehicleId: id,
      startDate: startDate!,
      endDate: endDate!,
      pickupTime: params.get('pickupTime') ?? undefined,
      returnTime: params.get('returnTime') ?? undefined,
      pickupBranchId: params.get('pickupBranchId')?.trim() || null,
      returnBranchId: params.get('returnBranchId')?.trim() || null,
      pickupServiceLocationId:
        params.get('pickupServiceLocationId')?.trim() ||
        params.get('pickupLocationId')?.trim() ||
        null,
      returnServiceLocationId:
        params.get('returnServiceLocationId')?.trim() ||
        params.get('returnLocationId')?.trim() ||
        null,
      pickupMethod,
      returnMethod,
      deliveryRequested: pickupMethod === 'HOME_DELIVERY',
      deliveryZoneId: params.get('deliveryZoneId')?.trim() || null,
      addonKeys: parseAddonKeys(params.get('addons')),
      promoCode: (params.get('promoCode') ?? '').trim().toUpperCase() || null,
      excludeBookingId: excludeBookingId || null,
      excludeBookingKey,
      alreadyHeldPromoCode: existingBookingPromo,
    })

    if (!evaluation.quote) {
      return fail(
        evaluation.reason ?? 'Giá thuê của xe chưa được cập nhật.',
        409,
        evaluation.reasonCode || 'PRICE_NOT_SET',
      )
    }

    return json({
      available: evaluation.available,
      reasonCode: evaluation.reasonCode,
      reason: evaluation.reason,
      pickupBranchId: evaluation.pickupBranchId,
      returnBranchId: evaluation.returnBranchId,
      pickupBranchName: evaluation.pickupBranchName,
      returnBranchName: evaluation.returnBranchName,
      ...evaluation.quote,
      isOneWay: evaluation.isOneWay,
      promoCode: evaluation.promoEval?.valid ? evaluation.promoEval.promoCode : null,
      promoName: evaluation.promoEval?.valid ? evaluation.promoEval.promoName : null,
      promoStatus: evaluation.promoEval?.status ?? null,
      promoMessage: evaluation.promoEval?.valid ? evaluation.promoEval.message : null,
      promoError:
        evaluation.promoEval && !evaluation.promoEval.valid ? evaluation.promoEval.message : null,
      kmLimitPerDay: vehicle.kmLimitPerDay ?? null,
      overKmFee: vehicle.overKmFee ?? null,
      lateReturnFeePerHour: vehicle.lateReturnFeePerHour ?? null,
      startDate,
      endDate,
    })
  } catch (error) {
    return apiError(error)
  }
}
