import { unstable_cache } from 'next/cache'
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
import { apiError, createRequestLogger, fail, json } from '@/lib/api-utils'

const getCachedQuoteReferenceData = unstable_cache(
  async () => {
    const payload = await getPayloadClient()
    const [branchesRes, pricingRulesRes, oneWayRulesRes] = await Promise.all([
      payload.find({
        collection: 'branches' as never,
        overrideAccess: true,
        depth: 0,
        limit: 200,
        select: {
          name: true,
          address: true,
          status: true,
          workStartTime: true,
          workEndTime: true,
          supportsHomeDelivery: true,
          supportsHomePickup: true,
          deliveryStartTime: true,
          deliveryEndTime: true,
          defaultDeliveryFee: true,
          defaultPickupFee: true,
          afterHoursFee: true,
          freeDeliveryMinOrder: true,
        } as never,
      }),
      payload.find({
        collection: 'location-pricing-rules' as never,
        overrideAccess: true,
        depth: 0,
        limit: 200,
        select: {
          code: true,
          name: true,
          scopeType: true,
          branch: true,
          vehicleModel: true,
          vehicle: true,
          dailyPrice: true,
          weeklyPrice: true,
          monthlyPrice: true,
          weekendSurcharge: true,
          holidaySurcharge: true,
          depositAmount: true,
          locationSurcharge: true,
          afterHoursFee: true,
          weeklyDiscountPercent: true,
          monthlyDiscountPercent: true,
          validFrom: true,
          validTo: true,
          priority: true,
          active: true,
        } as never,
        where: { active: { equals: true } },
      }),
      payload.find({
        collection: 'one-way-rental-rules' as never,
        overrideAccess: true,
        depth: 0,
        limit: 200,
        select: {
          routeKey: true,
          fromBranch: true,
          toBranch: true,
          vehicleCategory: true,
          allowed: true,
          fee: true,
          minRentalDays: true,
          estimatedTransitHours: true,
          preparationBufferHours: true,
          revenueSplitMode: true,
          pickupBranchSharePercent: true,
          active: true,
        } as never,
        where: { active: { equals: true } },
      }),
    ])
    return {
      branches: branchesRes.docs as unknown as Record<string, unknown>[],
      pricingRules: pricingRulesRes.docs as unknown as Record<string, unknown>[],
      oneWayRules: oneWayRulesRes.docs as unknown as Record<string, unknown>[],
    }
  },
  ['nori-quote-reference-data-v1'],
  { tags: ['nori-catalogue', 'nori-branches'] },
)

const getCachedVisibleModelMeta = unstable_cache(
  async () => {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'vehicle-models',
      overrideAccess: true,
      depth: 0,
      limit: 500,
      select: { category: true, visible: true },
      where: { visible: { equals: true } },
    })
    return res.docs.map((m) => ({
      id: String(m.id),
      category: m.category as 'CAR' | 'MOTORBIKE' | 'PICKUP',
      visible: Boolean(m.visible),
    }))
  },
  ['nori-visible-model-meta-v1'],
  { tags: ['nori-catalogue'] },
)

export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/availability', request)
  try {
    const params = new URL(request.url).searchParams
    const payload = await logger.time('payload', () => getPayloadClient())

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
        if (dv.error) {
          return fail(dv.error, 400, 'INVALID_DATES', undefined, logger.responseHeaders())
        }
      }

      let pickupBranchId = pickupBranchIdParam
      let returnBranchId = returnBranchIdParam
      if ((pickupLocationId && !pickupBranchId) || (returnLocationId && !returnBranchId)) {
        const [pickupLocDoc, returnLocDoc] = await logger.time('service_locations', () =>
          Promise.all([
            pickupLocationId && !pickupBranchId
              ? payload
                  .findByID({
                    collection: 'service-locations',
                    id: pickupLocationId,
                    overrideAccess: true,
                    depth: 0,
                    select: { status: true, supportsPickup: true, branch: true },
                  })
                  .catch(() => null)
              : Promise.resolve(null),
            returnLocationId && !returnBranchId
              ? payload
                  .findByID({
                    collection: 'service-locations',
                    id: returnLocationId,
                    overrideAccess: true,
                    depth: 0,
                    select: { status: true, supportsReturn: true, branch: true },
                  })
                  .catch(() => null)
              : Promise.resolve(null),
          ]),
        )
        if (pickupLocationId && !pickupBranchId) {
          if (
            !pickupLocDoc ||
            pickupLocDoc.status !== 'ACTIVE' ||
            pickupLocDoc.supportsPickup === false
          ) {
            return json(
              {
                availableModelIds: [],
                availableVehicleIds: [],
                availableVehicleCount: 0,
                countsByModel: {},
                routeAllowed: false,
                warning: 'Điểm nhận xe đã chọn hiện không khả dụng.',
              },
              200,
              logger.responseHeaders(),
            )
          }
          pickupBranchId = relationId(pickupLocDoc.branch) ?? null
        }
        if (returnLocationId && !returnBranchId) {
          if (
            !returnLocDoc ||
            returnLocDoc.status !== 'ACTIVE' ||
            returnLocDoc.supportsReturn === false
          ) {
            return json(
              {
                availableModelIds: [],
                availableVehicleIds: [],
                availableVehicleCount: 0,
                countsByModel: {},
                routeAllowed: false,
                warning: 'Điểm trả xe đã chọn hiện không tiếp nhận trả xe.',
              },
              200,
              logger.responseHeaders(),
            )
          }
          returnBranchId = relationId(returnLocDoc.branch) ?? null
        }
      }
      if (!returnBranchId) returnBranchId = pickupBranchId

      const effectiveStart = startDate || businessToday()
      const effectiveEnd = endDate || addDays(effectiveStart, 1)

      const [vehiclesRes, refData, visibleModels, bookingsRes, transfersRes, maintRes] =
        await logger.time('catalogue_queries', () =>
          Promise.all([
            payload.find({
              collection: 'vehicles',
              overrideAccess: true,
              depth: 0,
              limit: 1000,
              select: {
                model: true,
                status: true,
                intent: true,
                operationStatus: true,
                currentBranch: true,
                managingBranch: true,
              },
              where: {
                and: [
                  { status: { equals: 'ACTIVE' } },
                  { intent: { not_equals: 'SALE' } },
                  { operationStatus: { not_in: ['SOLD', 'INACTIVE', 'MAINTENANCE', 'RESERVED'] } },
                ],
              },
            }),
            getCachedQuoteReferenceData(),
            getCachedVisibleModelMeta(),
            startDate && endDate
              ? payload.find({
                  collection: 'bookings',
                  overrideAccess: true,
                  depth: 0,
                  limit: 1000,
                  select: {
                    vehicle: true,
                    bookingKey: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    pickupBranch: true,
                    returnBranch: true,
                  },
                  where: {
                    and: [
                      { status: { in: [...HOLD_STATUSES] } },
                      { endDate: { greater_than_equal: effectiveStart } },
                    ],
                  },
                })
              : Promise.resolve({ docs: [] }),
            payload.find({
              collection: 'vehicle-transfers',
              overrideAccess: true,
              depth: 0,
              limit: 500,
              select: {
                vehicle: true,
                transferCode: true,
                fromBranch: true,
                toBranch: true,
                startDate: true,
                endDate: true,
                status: true,
              },
              where: { status: { in: [...ACTIVE_TRANSFER_LOCK_STATUSES] } },
            }),
            startDate && endDate
              ? payload.find({
                  collection: 'maintenance-schedules',
                  overrideAccess: true,
                  depth: 0,
                  limit: 500,
                  select: {
                    vehicle: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                  },
                  where: {
                    and: [
                      { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
                      { endDate: { greater_than_equal: effectiveStart } },
                    ],
                  },
                })
              : Promise.resolve({ docs: [] }),
          ]),
        )

      const modelMetaMap = new Map(visibleModels.map((m) => [m.id, m]))
      const branchStatusMap = new Map(
        refData.branches.map((b) => [String(b.id), b.status as string | undefined]),
      )
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

      const mappedOneWay: OneWayRuleLike[] =
        pickupBranchId && returnBranchId && pickupBranchId !== returnBranchId
          ? refData.oneWayRules
              .filter(
                (r) =>
                  String(relationId(r.fromBranch as string | { id: string } | null) ?? '') ===
                    pickupBranchId &&
                  String(relationId(r.toBranch as string | { id: string } | null) ?? '') ===
                    returnBranchId,
              )
              .map((r) => ({
                id: String(r.id),
                fromBranchId: String(
                  relationId(r.fromBranch as string | { id: string } | null) ?? '',
                ),
                toBranchId: String(relationId(r.toBranch as string | { id: string } | null) ?? ''),
                vehicleCategory: (r.vehicleCategory as OneWayRuleLike['vehicleCategory']) ?? 'ALL',
                allowed: r.allowed !== false,
                fee: Number(r.fee ?? 0),
                minRentalDays: Number(r.minRentalDays ?? 1),
                active: r.active !== false,
              }))
          : []

      const availableVehicleIds: string[] = []
      const countsByModel: Record<string, number> = {}
      let routeBlockedWarning: string | null = null

      for (const v of vehiclesRes.docs) {
        const mId = relationId(v.model)
        const modelObj = mId ? (modelMetaMap.get(String(mId)) ?? null) : null
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

      logger.logSuccess(200, { mode: 'catalogue', availableCount: availableVehicleIds.length })
      return json(
        {
          availableModelIds: Object.keys(countsByModel),
          availableVehicleIds,
          availableVehicleCount: availableVehicleIds.length,
          countsByModel,
          routeAllowed: !routeBlockedWarning,
          warning: routeBlockedWarning,
        },
        200,
        logger.responseHeaders(),
      )
    }

    // Mode 2: Single-vehicle calendar & authoritative multi-branch quote
    const id = params.get('vehicle')?.trim() || ''
    if (!id) {
      return fail(
        'Vui lòng chọn xe thực tế.',
        400,
        'VALIDATION_ERROR',
        undefined,
        logger.responseHeaders(),
      )
    }

    const startDate = params.get('startDate')
    const endDate = params.get('endDate')
    const isBusyDaysOnly = !startDate && !endDate
    if (!isBusyDaysOnly) {
      const validation = validateRentalDates(startDate ?? '', endDate ?? '')
      if (validation.error || !validation.totalDays) {
        return fail(
          validation.error ?? 'Ngày thuê không hợp lệ.',
          400,
          'INVALID_DATES',
          undefined,
          logger.responseHeaders(),
        )
      }
    }

    const excludeBookingId = (params.get('excludeBookingId') ?? '').trim()

    const [vehicle, ownBooking, quoteRefData] = await logger.time('precheck', () =>
      Promise.all([
        payload.findByID({
          collection: 'vehicles',
          id,
          overrideAccess: false,
          depth: 0,
          select: {
            model: true,
            status: true,
            intent: true,
            operationStatus: true,
            currentBranch: true,
            managingBranch: true,
            pricePerDay: true,
            pricePerWeek: true,
            pricePerMonth: true,
            weekendSurcharge: true,
            holidaySurcharge: true,
            depositAmount: true,
            deliveryFee: true,
            kmLimitPerDay: true,
            overKmFee: true,
            lateReturnFeePerHour: true,
            pickupLocation: true,
            location: true,
            reference: true,
          },
        }),
        excludeBookingId
          ? (async () => {
              const user = await appAuth.currentUser()
              if (!user) return null
              return payload
                .findByID({
                  collection: 'bookings',
                  id: excludeBookingId,
                  user,
                  overrideAccess: false,
                  depth: 0,
                  select: { bookingKey: true, promoCode: true },
                })
                .catch(() => null)
            })()
          : Promise.resolve(null),
        isBusyDaysOnly ? Promise.resolve(null) : getCachedQuoteReferenceData(),
      ]),
    )

    if (
      !vehicle ||
      vehicle.status !== 'ACTIVE' ||
      vehicle.intent === 'SALE' ||
      vehicle.operationStatus === 'SOLD' ||
      vehicle.operationStatus === 'MAINTENANCE' ||
      vehicle.operationStatus === 'INACTIVE' ||
      vehicle.operationStatus === 'RESERVED'
    ) {
      logger.logSuccess(409, {
        mode: isBusyDaysOnly ? 'busyDays' : 'quote',
        reason: 'VEHICLE_NOT_AVAILABLE',
      })
      return fail(
        'Xe đang được giữ chỗ hoặc chưa nhận đặt thuê.',
        409,
        'VEHICLE_NOT_AVAILABLE',
        undefined,
        logger.responseHeaders(),
      )
    }

    const excludeBookingKey = ownBooking?.bookingKey ?? null
    const existingBookingPromo = ownBooking?.promoCode?.trim().toUpperCase() ?? null

    if (isBusyDaysOnly) {
      const [slots, maints, transfers] = await logger.time('busy_days', () =>
        Promise.all([
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
        ]),
      )
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
      logger.logSuccess(200, { mode: 'busyDays', busyCount: busySet.size })
      return json({ busyDays: Array.from(busySet) }, 200, logger.responseHeaders())
    }

    const deliveryRequested = ['1', 'true'].includes(params.get('delivery') ?? '')
    const pickupMethodParam = params.get('pickupMethod')?.trim().toUpperCase()
    const returnMethodParam = params.get('returnMethod')?.trim().toUpperCase()
    const pickupMethod: PickupMethod =
      pickupMethodParam === 'HOME_DELIVERY' || deliveryRequested ? 'HOME_DELIVERY' : 'BRANCH_PICKUP'
    const returnMethod: ReturnMethod =
      returnMethodParam === 'HOME_PICKUP' ? 'HOME_PICKUP' : 'BRANCH_RETURN'
    const promoParam = (params.get('promoCode') ?? '').trim().toUpperCase() || null

    const evaluation = await logger.time('evaluate_quote', () =>
      evaluateVehicleBookingAvailabilityAndPricing(payload, {
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
        promoCode: promoParam,
        excludeBookingId: excludeBookingId || null,
        excludeBookingKey,
        alreadyHeldPromoCode: existingBookingPromo,
        preloadedVehicle: vehicle as unknown as Record<string, unknown>,
        preloadedBranches: quoteRefData?.branches ?? null,
        preloadedPricingRules: quoteRefData?.pricingRules ?? null,
        preloadedOneWayRules: quoteRefData?.oneWayRules ?? null,
      }),
    )

    if (!evaluation.quote) {
      logger.logSuccess(409, {
        mode: 'quote',
        available: false,
        reasonCode: evaluation.reasonCode || 'PRICE_NOT_SET',
      })
      return fail(
        evaluation.reason ?? 'Giá thuê của xe chưa được cập nhật.',
        409,
        evaluation.reasonCode || 'PRICE_NOT_SET',
        undefined,
        logger.responseHeaders(),
      )
    }

    logger.logSuccess(200, {
      mode: 'quote',
      available: evaluation.available,
      hasPromo: Boolean(promoParam),
    })
    return json(
      {
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
      },
      200,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/availability' })
  }
}
