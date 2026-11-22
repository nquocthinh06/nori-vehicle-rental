import { APIError, type Payload, type PayloadRequest } from 'payload'
import { adminCanAccessAnyBranch, adminCanAccessBranch, staffTitleOf } from '../access/nori.ts'
import { recordAudit } from '../hooks/audit-nori.ts'
import {
  ACTIVE_TRANSFER_LOCK_STATUSES,
  calculateMultiBranchRentalQuote,
  canTransitionTransfer,
  computeWarehouseOccupancy,
  evaluateVehicleLocationTimeline,
  isPromotionEligibleForBranch,
  isTimeWithinWindow,
  matchOneWayRule,
  resolveLocationPricing,
  transferStatusLabels,
  type DeliveryZoneLike,
  type LocationPricingRuleLike,
  type MultiBranchQuoteBreakdown,
  type OneWayRuleLike,
  type PickupMethod,
  type ReturnMethod,
  type TransferStatus,
  type VehicleInventoryRecord,
} from './multi-branch-rules.ts'
import { findPromotionByCode, withBookingWriteLock, type PromoWithScope } from './promo-service.ts'
import {
  HOLD_STATUSES,
  addDays,
  applyPromotionToQuote,
  businessToday,
  dateNumber,
  evaluatePromotion,
  parseAddonKeys,
  relationId,
  rentalDays,
  roundVndInteger,
  validateRentalDates,
  validateTimeString,
  type PromoEvaluationResult,
} from './rental-rules.ts'

export async function recordVehicleLocationEvent(
  payload: Payload,
  req: PayloadRequest | undefined,
  entry: {
    vehicleId: string
    vehicleReference?: string | null
    eventType:
      | 'INITIAL_ALLOCATION'
      | 'BOOKING_HANDOVER'
      | 'BOOKING_RETURN'
      | 'ONE_WAY_RETURN'
      | 'TRANSFER_DEPARTURE'
      | 'TRANSFER_ARRIVAL'
      | 'TRANSFER_COMPLETED'
      | 'DELIVERY_DISPATCH'
      | 'PICKUP_RETURN'
      | 'MANUAL_RELOCATION'
      | 'INSPECTION_CLEARED'
      | 'MAINTENANCE_MOVE'
    fromBranchId?: string | null
    fromWarehouseId?: string | null
    toBranchId?: string | null
    toWarehouseId?: string | null
    relatedBookingId?: string | null
    relatedTransferId?: string | null
    relatedDeliveryJobId?: string | null
    odometer?: number | null
    conditionNote?: string | null
    actorEmail?: string | null
    actorRole?: string | null
    note?: string | null
  },
) {
  await payload.create({
    collection: 'vehicle-location-history' as never,
    overrideAccess: true,
    ...(req ? { req } : {}),
    data: {
      vehicle: entry.vehicleId,
      vehicleReferenceSnapshot: entry.vehicleReference ?? undefined,
      eventType: entry.eventType,
      fromBranch: entry.fromBranchId ?? undefined,
      fromWarehouse: entry.fromWarehouseId ?? undefined,
      toBranch: entry.toBranchId ?? undefined,
      toWarehouse: entry.toWarehouseId ?? undefined,
      relatedBooking: entry.relatedBookingId ?? undefined,
      relatedTransfer: entry.relatedTransferId ?? undefined,
      relatedDeliveryJob: entry.relatedDeliveryJobId ?? undefined,
      odometer: typeof entry.odometer === 'number' ? entry.odometer : undefined,
      conditionNote: entry.conditionNote ?? undefined,
      actorEmail: entry.actorEmail ?? undefined,
      actorRole: entry.actorRole ?? undefined,
      occurredAt: new Date().toISOString(),
      note: entry.note ?? undefined,
    } as never,
  })
}

export async function syncAdminAssignedBranches(
  payload: Payload,
  adminId: string,
  req?: PayloadRequest,
): Promise<string[]> {
  const assignments = await payload.find({
    collection: 'branch-staff' as never,
    overrideAccess: true,
    ...(req ? { req } : {}),
    depth: 0,
    limit: 200,
    where: {
      and: [{ admin: { equals: adminId } }, { status: { equals: 'ACTIVE' } }],
    },
  })
  const branchIds = [
    ...new Set(
      (assignments.docs as Array<{ branch?: unknown }>)
        .map((a) => relationId(a.branch as string | { id: string } | null))
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  await payload.update({
    collection: 'admins',
    id: adminId,
    overrideAccess: true,
    ...(req ? { req } : {}),
    context: { skipAudit: true },
    data: { assignedBranchIds: branchIds } as never,
  })
  return branchIds
}

export type EvaluateBookingMultiBranchInput = {
  vehicleId: string
  startDate: string
  endDate: string
  pickupTime?: string
  returnTime?: string
  pickupBranchId?: string | null
  returnBranchId?: string | null
  pickupServiceLocationId?: string | null
  returnServiceLocationId?: string | null
  pickupMethod?: PickupMethod
  returnMethod?: ReturnMethod
  deliveryRequested?: boolean
  deliveryZoneId?: string | null
  deliveryAddress?: string | null
  pickupAddress?: string | null
  addonKeys?: string[] | string | null
  promoCode?: string | null
  excludeBookingId?: string | null
  excludeBookingKey?: string | null
  alreadyHeldPromoCode?: string | null
  preloadedVehicle?: Record<string, unknown> | null
  preloadedModel?: Record<string, unknown> | null
  preloadedBranches?: Record<string, unknown>[] | null
  preloadedPricingRules?: Record<string, unknown>[] | null
  preloadedOneWayRules?: Record<string, unknown>[] | null
  req?: PayloadRequest
  user?: unknown
}

export type EvaluateBookingMultiBranchResult = {
  available: boolean
  reasonCode: string
  reason: string | null
  isOneWay: boolean
  pickupBranchId: string | null
  returnBranchId: string | null
  pickupBranchName: string | null
  returnBranchName: string | null
  pickupLocationLabel: string | null
  returnLocationLabel: string | null
  pickupServiceLocationId: string | null
  returnServiceLocationId: string | null
  deliveryZoneId: string | null
  deliveryZoneName: string | null
  revenueSplitPickupPercent: number
  quote: (MultiBranchQuoteBreakdown & { promoDiscountAmount: number }) | null
  promoEval: PromoEvaluationResult | null
  promoId: string | null
  promoCodeNormalized: string | null
  pricingRuleSnapshot: Record<string, unknown> | null
  vehicle: Record<string, unknown> | null
  model: Record<string, unknown> | null
}

export async function evaluateVehicleBookingAvailabilityAndPricing(
  payload: Payload,
  input: EvaluateBookingMultiBranchInput,
): Promise<EvaluateBookingMultiBranchResult> {
  const reqOpt = input.req ? { req: input.req } : {}
  const emptyFail = (
    reasonCode: string,
    reason: string,
    extra?: Partial<EvaluateBookingMultiBranchResult>,
  ): EvaluateBookingMultiBranchResult => ({
    available: false,
    reasonCode,
    reason,
    isOneWay: false,
    pickupBranchId: extra?.pickupBranchId ?? null,
    returnBranchId: extra?.returnBranchId ?? null,
    pickupBranchName: extra?.pickupBranchName ?? null,
    returnBranchName: extra?.returnBranchName ?? null,
    pickupLocationLabel: extra?.pickupLocationLabel ?? null,
    returnLocationLabel: extra?.returnLocationLabel ?? null,
    pickupServiceLocationId: extra?.pickupServiceLocationId ?? null,
    returnServiceLocationId: extra?.returnServiceLocationId ?? null,
    deliveryZoneId: extra?.deliveryZoneId ?? null,
    deliveryZoneName: extra?.deliveryZoneName ?? null,
    revenueSplitPickupPercent: 100,
    quote: extra?.quote ?? null,
    promoEval: extra?.promoEval ?? null,
    promoId: null,
    promoCodeNormalized: null,
    pricingRuleSnapshot: null,
    vehicle: extra?.vehicle ?? null,
    model: extra?.model ?? null,
  })

  const dateVal = validateRentalDates(input.startDate, input.endDate)
  if (dateVal.error || !dateVal.totalDays) {
    return emptyFail('INVALID_DATES', dateVal.error ?? 'Ngày thuê không hợp lệ.')
  }

  const vehicle =
    input.preloadedVehicle ??
    ((await payload
      .findByID({
        collection: 'vehicles',
        id: input.vehicleId,
        overrideAccess: true,
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
        ...reqOpt,
      })
      .catch(() => null)) as Record<string, unknown> | null)

  if (!vehicle) {
    return emptyFail('VEHICLE_NOT_FOUND', 'Không tìm thấy phương tiện đã chọn.')
  }
  const modelId = relationId(vehicle.model as string | { id: string } | null)
  const model =
    input.preloadedModel ??
    (modelId
      ? ((await payload
          .findByID({
            collection: 'vehicle-models',
            id: modelId,
            overrideAccess: true,
            depth: 0,
            select: { name: true, slug: true, visible: true, category: true },
            ...reqOpt,
          })
          .catch(() => null)) as Record<string, unknown> | null)
      : null)

  if (!model || !model.visible) {
    return emptyFail('MODEL_UNAVAILABLE', 'Dòng xe chưa được công bố.', { vehicle })
  }

  // Resolve service locations -> branch IDs (in parallel when both specified)
  const [pickupLocDocRaw, returnLocDocRaw] = await Promise.all([
    input.pickupServiceLocationId
      ? (payload
          .findByID({
            collection: 'service-locations' as never,
            id: input.pickupServiceLocationId,
            overrideAccess: true,
            depth: 0,
            select: {
              name: true,
              address: true,
              status: true,
              verified: true,
              supportsPickup: true,
              supportedCategories: true,
              branch: true,
              openTime: true,
              closeTime: true,
              surchargeFee: true,
            } as never,
            ...reqOpt,
          })
          .catch(() => null) as Promise<Record<string, unknown> | null>)
      : Promise.resolve(null),
    input.returnServiceLocationId
      ? (payload
          .findByID({
            collection: 'service-locations' as never,
            id: input.returnServiceLocationId,
            overrideAccess: true,
            depth: 0,
            select: {
              name: true,
              address: true,
              status: true,
              verified: true,
              supportsReturn: true,
              branch: true,
              openTime: true,
              closeTime: true,
              surchargeFee: true,
            } as never,
            ...reqOpt,
          })
          .catch(() => null) as Promise<Record<string, unknown> | null>)
      : Promise.resolve(null),
  ])
  const pickupLocDoc = pickupLocDocRaw
  const returnLocDoc = returnLocDocRaw

  if (input.pickupServiceLocationId) {
    if (!pickupLocDoc) {
      return emptyFail('PICKUP_LOCATION_NOT_FOUND', 'Điểm nhận xe đã chọn không tồn tại.', {
        vehicle,
        model,
      })
    }
    if (pickupLocDoc.status !== 'ACTIVE' || pickupLocDoc.verified === false) {
      return emptyFail(
        'PICKUP_LOCATION_INACTIVE',
        'Điểm nhận xe này hiện đang ngừng hoạt động hoặc chưa xác minh.',
        { vehicle, model },
      )
    }
    if (pickupLocDoc.supportsPickup === false) {
      return emptyFail(
        'PICKUP_NOT_SUPPORTED',
        'Địa điểm này không hỗ trợ nhận xe. Vui lòng chọn điểm nhận xe hợp lệ.',
        { vehicle, model },
      )
    }
    const cats = String(pickupLocDoc.supportedCategories ?? 'CAR,MOTORBIKE,PICKUP')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    if (cats.length > 0 && !cats.includes(String(model.category ?? 'CAR'))) {
      return emptyFail(
        'CATEGORY_NOT_SUPPORTED_AT_LOCATION',
        'Điểm nhận xe này hiện không phục vụ loại phương tiện bạn đã chọn.',
        { vehicle, model },
      )
    }
  }

  if (input.returnServiceLocationId) {
    if (!returnLocDoc) {
      return emptyFail('RETURN_LOCATION_NOT_FOUND', 'Điểm trả xe đã chọn không tồn tại.', {
        vehicle,
        model,
      })
    }
    if (returnLocDoc.status !== 'ACTIVE' || returnLocDoc.verified === false) {
      return emptyFail(
        'RETURN_LOCATION_INACTIVE',
        'Điểm trả xe này hiện đang ngừng hoạt động hoặc không thể tiếp nhận xe.',
        { vehicle, model },
      )
    }
    if (returnLocDoc.supportsReturn === false) {
      return emptyFail(
        'RETURN_NOT_SUPPORTED',
        'Địa điểm này không hỗ trợ trả xe. Vui lòng chọn điểm trả xe hợp lệ.',
        { vehicle, model },
      )
    }
  }

  const vehCurrentBranchId =
    relationId(vehicle.currentBranch as string | { id: string } | null) ?? null
  const vehManagingBranchId =
    relationId(vehicle.managingBranch as string | { id: string } | null) ?? null

  const requestedPickupBranchId =
    (pickupLocDoc ? relationId(pickupLocDoc.branch as string | { id: string } | null) : null) ||
    input.pickupBranchId ||
    null

  const requestedReturnBranchId =
    (returnLocDoc ? relationId(returnLocDoc.branch as string | { id: string } | null) : null) ||
    input.returnBranchId ||
    requestedPickupBranchId ||
    null

  const effectivePickupBranchId =
    requestedPickupBranchId ?? vehCurrentBranchId ?? vehManagingBranchId
  const effectiveReturnBranchId = requestedReturnBranchId ?? effectivePickupBranchId

  const branchIdsToFetch = [
    ...new Set(
      [effectivePickupBranchId, effectiveReturnBranchId].filter((x): x is string => Boolean(x)),
    ),
  ]

  const promoCodeNorm = (input.promoCode ?? '').trim().toUpperCase()
  const branchIdSet = new Set(branchIdsToFetch)

  const [
    branchesRes,
    bookingsRes,
    transfersRes,
    maintRes,
    rentalDaysCount,
    pricingRulesRes,
    oneWayRulesRes,
    deliveryZoneDoc,
    promoDoc,
  ] = await Promise.all([
    input.preloadedBranches
      ? Promise.resolve({
          docs: input.preloadedBranches.filter((b) => branchIdSet.has(String(b.id))),
        })
      : branchIdsToFetch.length
        ? payload.find({
            collection: 'branches' as never,
            overrideAccess: true,
            depth: 0,
            limit: 10,
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
            where: { id: { in: branchIdsToFetch } },
            ...reqOpt,
          })
        : Promise.resolve({ docs: [] }),
    payload.find({
      collection: 'bookings',
      overrideAccess: true,
      depth: 0,
      limit: 200,
      select: {
        bookingKey: true,
        startDate: true,
        endDate: true,
        status: true,
        pickupBranch: true,
        returnBranch: true,
      },
      where: {
        and: [{ vehicle: { equals: input.vehicleId } }, { status: { in: [...HOLD_STATUSES] } }],
      },
      ...reqOpt,
    }),
    payload.find({
      collection: 'vehicle-transfers' as never,
      overrideAccess: true,
      depth: 0,
      limit: 100,
      select: {
        transferCode: true,
        fromBranch: true,
        toBranch: true,
        startDate: true,
        endDate: true,
        status: true,
      } as never,
      where: {
        and: [
          { vehicle: { equals: input.vehicleId } },
          { status: { in: [...ACTIVE_TRANSFER_LOCK_STATUSES] } },
        ],
      },
      ...reqOpt,
    }),
    payload.find({
      collection: 'maintenance-schedules',
      overrideAccess: true,
      depth: 0,
      limit: 50,
      select: { startDate: true, endDate: true, status: true },
      where: {
        and: [
          { vehicle: { equals: input.vehicleId } },
          { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
        ],
      },
      ...reqOpt,
    }),
    payload.count({
      collection: 'rental-days',
      overrideAccess: true,
      where: {
        and: [
          { vehicle: { equals: input.vehicleId } },
          { day: { greater_than_equal: input.startDate, less_than: input.endDate } },
          ...(input.excludeBookingKey
            ? [{ bookingKey: { not_equals: input.excludeBookingKey } }]
            : []),
        ],
      },
      ...reqOpt,
    }),
    input.preloadedPricingRules
      ? Promise.resolve({ docs: input.preloadedPricingRules })
      : payload.find({
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
          ...reqOpt,
        }),
    effectivePickupBranchId &&
    effectiveReturnBranchId &&
    effectivePickupBranchId !== effectiveReturnBranchId
      ? input.preloadedOneWayRules
        ? Promise.resolve({
            docs: input.preloadedOneWayRules.filter(
              (r) =>
                String(relationId(r.fromBranch as string | { id: string } | null) ?? '') ===
                  effectivePickupBranchId &&
                String(relationId(r.toBranch as string | { id: string } | null) ?? '') ===
                  effectiveReturnBranchId,
            ),
          })
        : payload.find({
            collection: 'one-way-rental-rules' as never,
            overrideAccess: true,
            depth: 0,
            limit: 50,
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
            where: {
              and: [
                { fromBranch: { equals: effectivePickupBranchId } },
                { toBranch: { equals: effectiveReturnBranchId } },
                { active: { equals: true } },
              ],
            },
            ...reqOpt,
          })
      : Promise.resolve({ docs: [] }),
    input.deliveryZoneId
      ? payload
          .findByID({
            collection: 'delivery-zones' as never,
            id: input.deliveryZoneId,
            overrideAccess: true,
            depth: 0,
            select: {
              active: true,
              branch: true,
              name: true,
              serviceStartTime: true,
              serviceEndTime: true,
              afterHoursFee: true,
              deliveryFee: true,
              pickupFee: true,
              freeOverOrderAmount: true,
            } as never,
            ...reqOpt,
          })
          .catch(() => null)
      : Promise.resolve(null),
    promoCodeNorm ? findPromotionByCode(payload, promoCodeNorm, input.req) : Promise.resolve(null),
  ])

  const branchMap = new Map<string, Record<string, unknown>>()
  for (const b of branchesRes.docs as unknown as Record<string, unknown>[]) {
    branchMap.set(String(b.id), b)
  }
  const pickupBranch = effectivePickupBranchId
    ? (branchMap.get(effectivePickupBranchId) ?? null)
    : null
  const returnBranch = effectiveReturnBranchId
    ? (branchMap.get(effectiveReturnBranchId) ?? null)
    : null

  if (requestedPickupBranchId && !pickupBranch) {
    return emptyFail('PICKUP_BRANCH_NOT_FOUND', 'Chi nhánh nhận xe không tồn tại.', {
      vehicle,
      model,
    })
  }
  if (requestedReturnBranchId && !returnBranch) {
    return emptyFail('RETURN_BRANCH_NOT_FOUND', 'Chi nhánh trả xe không tồn tại.', {
      vehicle,
      model,
    })
  }

  const isOneWay = Boolean(
    effectivePickupBranchId &&
    effectiveReturnBranchId &&
    effectivePickupBranchId !== effectiveReturnBranchId,
  )

  const mappedOneWayRules: OneWayRuleLike[] = (
    oneWayRulesRes.docs as unknown as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    routeKey: String(r.routeKey ?? ''),
    fromBranchId: String(relationId(r.fromBranch as string | { id: string } | null) ?? ''),
    toBranchId: String(relationId(r.toBranch as string | { id: string } | null) ?? ''),
    vehicleCategory: (r.vehicleCategory as 'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP') ?? 'ALL',
    allowed: r.allowed !== false,
    fee: Number(r.fee ?? 0),
    minRentalDays: Number(r.minRentalDays ?? 1),
    estimatedTransitHours: Number(r.estimatedTransitHours ?? 4),
    preparationBufferHours: Number(r.preparationBufferHours ?? 4),
    revenueSplitMode: (r.revenueSplitMode as OneWayRuleLike['revenueSplitMode']) ?? 'PICKUP_BRANCH',
    pickupBranchSharePercent: Number(r.pickupBranchSharePercent ?? 100),
    active: r.active !== false,
  }))

  const matchedOneWay = isOneWay
    ? matchOneWayRule(
        mappedOneWayRules,
        effectivePickupBranchId!,
        effectiveReturnBranchId!,
        (model.category as 'CAR' | 'MOTORBIKE' | 'PICKUP') ?? 'CAR',
      )
    : null

  // Timeline & branch availability check
  const timeline = evaluateVehicleLocationTimeline({
    vehicleOperationStatus: String(vehicle.operationStatus ?? 'READY'),
    vehicleBusinessStatus: String(vehicle.status ?? 'INACTIVE'),
    currentBranchId: vehCurrentBranchId,
    managingBranchId: vehManagingBranchId,
    startDate: input.startDate,
    endDate: input.endDate,
    requestedPickupBranchId,
    requestedReturnBranchId,
    pickupBranchStatus: pickupBranch ? (pickupBranch.status as never) : null,
    returnBranchStatus: returnBranch ? (returnBranch.status as never) : null,
    oneWayRule: matchedOneWay,
    bookings: (bookingsRes.docs as unknown as Record<string, unknown>[]).map((b) => ({
      id: String(b.id),
      bookingKey: String(b.bookingKey ?? b.id),
      startDate: String(b.startDate),
      endDate: String(b.endDate),
      status: String(b.status ?? 'PENDING'),
      pickupBranchId: relationId(b.pickupBranch as string | { id: string } | null) ?? null,
      returnBranchId: relationId(b.returnBranch as string | { id: string } | null) ?? null,
    })),
    transfers: (transfersRes.docs as unknown as Record<string, unknown>[]).map((t) => ({
      id: String(t.id),
      transferCode: String(t.transferCode ?? t.id),
      fromBranchId: String(relationId(t.fromBranch as string | { id: string } | null) ?? ''),
      toBranchId: String(relationId(t.toBranch as string | { id: string } | null) ?? ''),
      startDate: String(t.startDate),
      endDate: String(t.endDate),
      status: String(t.status ?? 'APPROVED') as TransferStatus,
    })),
    maintenances: (maintRes.docs as unknown as Record<string, unknown>[]).map((m) => ({
      id: String(m.id),
      startDate: String(m.startDate),
      endDate: String(m.endDate),
      status: String(m.status ?? 'SCHEDULED'),
    })),
    excludeBookingId: input.excludeBookingId,
  })

  // Also verify global `rental-days` lock table consistency
  const hasGlobalLockConflict = rentalDaysCount.totalDocs > 0

  // Validate delivery & pickup methods + zone + operating hours
  const pickupMethod: PickupMethod =
    input.pickupMethod ?? (input.deliveryRequested ? 'HOME_DELIVERY' : 'BRANCH_PICKUP')
  const returnMethod: ReturnMethod = input.returnMethod ?? 'BRANCH_RETURN'
  const isHomeDelivery = pickupMethod === 'HOME_DELIVERY' || Boolean(input.deliveryRequested)
  const isHomePickup = returnMethod === 'HOME_PICKUP'

  const pickupTime = validateTimeString(input.pickupTime) ? input.pickupTime! : '08:00'
  const returnTime = validateTimeString(input.returnTime) ? input.returnTime! : '20:00'

  let deliveryFeeResolved = 0
  let pickupFeeResolved = 0
  let afterHoursFeeTotal = 0
  let deliveryValidationError: { code: string; message: string } | null = null
  const zoneRec = deliveryZoneDoc as Record<string, unknown> | null

  // Operating hours check (BR-06 & DL-05)
  const branchOpenTime = String(pickupLocDoc?.openTime ?? pickupBranch?.workStartTime ?? '07:30')
  const branchCloseTime = String(pickupLocDoc?.closeTime ?? pickupBranch?.workEndTime ?? '21:00')
  const returnOpenTime = String(returnLocDoc?.openTime ?? returnBranch?.workStartTime ?? '07:30')
  const returnCloseTime = String(returnLocDoc?.closeTime ?? returnBranch?.workEndTime ?? '21:00')

  const pickupOutsideBranchHours =
    Boolean(pickupBranch || pickupLocDoc) &&
    !isTimeWithinWindow(pickupTime, branchOpenTime, branchCloseTime)
  const returnOutsideBranchHours =
    Boolean(returnBranch || returnLocDoc) &&
    !isTimeWithinWindow(returnTime, returnOpenTime, returnCloseTime)

  if (isHomeDelivery || isHomePickup) {
    if (pickupBranch && isHomeDelivery && pickupBranch.supportsHomeDelivery === false) {
      deliveryValidationError = {
        code: 'HOME_DELIVERY_NOT_SUPPORTED',
        message: `Chi nhánh ${String(pickupBranch.name)} hiện chưa hỗ trợ dịch vụ giao xe tận nơi.`,
      }
    } else if (returnBranch && isHomePickup && returnBranch.supportsHomePickup === false) {
      deliveryValidationError = {
        code: 'HOME_PICKUP_NOT_SUPPORTED',
        message: `Chi nhánh ${String(returnBranch.name)} hiện chưa hỗ trợ dịch vụ thu hồi xe tận nơi.`,
      }
    } else if (input.deliveryZoneId) {
      if (!zoneRec || zoneRec.active === false) {
        deliveryValidationError = {
          code: 'DELIVERY_ZONE_OUT_OF_AREA',
          message: 'Khu vực giao nhận đã chọn không thuộc vùng phục vụ hoặc đã ngừng hoạt động.',
        }
      } else {
        const zoneBranchId = relationId(zoneRec.branch as string | { id: string } | null)
        if (effectivePickupBranchId && zoneBranchId && zoneBranchId !== effectivePickupBranchId) {
          deliveryValidationError = {
            code: 'DELIVERY_ZONE_BRANCH_MISMATCH',
            message: 'Khu vực giao xe tận nơi không thuộc phạm vi phục vụ của chi nhánh nhận xe.',
          }
        } else {
          const zStart = String(
            zoneRec.serviceStartTime ?? pickupBranch?.deliveryStartTime ?? '08:00',
          )
          const zEnd = String(zoneRec.serviceEndTime ?? pickupBranch?.deliveryEndTime ?? '20:00')
          if (
            (isHomeDelivery && !isTimeWithinWindow(pickupTime, zStart, zEnd)) ||
            (isHomePickup && !isTimeWithinWindow(returnTime, zStart, zEnd))
          ) {
            if (Number(zoneRec.afterHoursFee ?? pickupBranch?.afterHoursFee ?? 0) > 0) {
              afterHoursFeeTotal += roundVndInteger(
                Number(zoneRec.afterHoursFee ?? pickupBranch?.afterHoursFee ?? 0),
              )
            } else {
              deliveryValidationError = {
                code: 'DELIVERY_TIME_NOT_SUPPORTED',
                message: `Khung giờ giao nhận tận nơi tại khu vực ${String(zoneRec.name)} chỉ hỗ trợ từ ${zStart} đến ${zEnd}.`,
              }
            }
          }
          if (isHomeDelivery)
            deliveryFeeResolved = roundVndInteger(Number(zoneRec.deliveryFee ?? 0))
          if (isHomePickup) pickupFeeResolved = roundVndInteger(Number(zoneRec.pickupFee ?? 0))
        }
      }
    } else {
      // No delivery zone specified -> check if branch has configured delivery zones or fallback to branch/vehicle fee
      const branchDeliveryFee = pickupBranch?.defaultDeliveryFee
      const branchPickupFee = returnBranch?.defaultPickupFee
      if (isHomeDelivery) {
        if (branchDeliveryFee !== undefined && branchDeliveryFee !== null) {
          deliveryFeeResolved = roundVndInteger(Number(branchDeliveryFee))
        } else if (vehicle.deliveryFee !== undefined && vehicle.deliveryFee !== null) {
          deliveryFeeResolved = roundVndInteger(Number(vehicle.deliveryFee))
        } else if (pickupBranch) {
          deliveryValidationError = {
            code: 'DELIVERY_ZONE_REQUIRED',
            message: 'Vui lòng chọn khu vực phục vụ giao xe tận nơi hợp lệ thuộc chi nhánh.',
          }
        }
        if (
          !deliveryValidationError &&
          pickupBranch &&
          !isTimeWithinWindow(
            pickupTime,
            String(pickupBranch.deliveryStartTime ?? '08:00'),
            String(pickupBranch.deliveryEndTime ?? '20:00'),
          )
        ) {
          if (Number(pickupBranch.afterHoursFee ?? 0) > 0) {
            afterHoursFeeTotal += roundVndInteger(Number(pickupBranch.afterHoursFee))
          } else {
            deliveryValidationError = {
              code: 'DELIVERY_TIME_NOT_SUPPORTED',
              message: `Chi nhánh chỉ hỗ trợ giao xe tận nơi trong khung giờ ${String(pickupBranch.deliveryStartTime ?? '08:00')} – ${String(pickupBranch.deliveryEndTime ?? '20:00')}.`,
            }
          }
        }
      }
      if (isHomePickup && !deliveryValidationError) {
        if (branchPickupFee !== undefined && branchPickupFee !== null) {
          pickupFeeResolved = roundVndInteger(Number(branchPickupFee))
        } else if (vehicle.deliveryFee !== undefined && vehicle.deliveryFee !== null) {
          pickupFeeResolved = roundVndInteger(Number(vehicle.deliveryFee))
        } else if (returnBranch) {
          deliveryValidationError = {
            code: 'PICKUP_ZONE_REQUIRED',
            message: 'Vui lòng chọn khu vực thu hồi xe tận nơi hợp lệ thuộc chi nhánh trả xe.',
          }
        }
      }
    }
  }

  // Location-based pricing resolution
  const mappedPricingRules: LocationPricingRuleLike[] = (
    pricingRulesRes.docs as unknown as Record<string, unknown>[]
  ).map((r) => ({
    id: String(r.id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    scopeType: String(r.scopeType ?? 'MODEL_BRANCH') as LocationPricingRuleLike['scopeType'],
    branchId: relationId(r.branch as string | { id: string } | null) ?? null,
    vehicleModelId: relationId(r.vehicleModel as string | { id: string } | null) ?? null,
    vehicleId: relationId(r.vehicle as string | { id: string } | null) ?? null,
    dailyPrice: r.dailyPrice != null ? Number(r.dailyPrice) : null,
    weeklyPrice: r.weeklyPrice != null ? Number(r.weeklyPrice) : null,
    monthlyPrice: r.monthlyPrice != null ? Number(r.monthlyPrice) : null,
    weekendSurcharge: r.weekendSurcharge != null ? Number(r.weekendSurcharge) : null,
    holidaySurcharge: r.holidaySurcharge != null ? Number(r.holidaySurcharge) : null,
    depositAmount: r.depositAmount != null ? Number(r.depositAmount) : null,
    locationSurcharge: r.locationSurcharge != null ? Number(r.locationSurcharge) : null,
    afterHoursFee: r.afterHoursFee != null ? Number(r.afterHoursFee) : null,
    weeklyDiscountPercent: r.weeklyDiscountPercent != null ? Number(r.weeklyDiscountPercent) : null,
    monthlyDiscountPercent:
      r.monthlyDiscountPercent != null ? Number(r.monthlyDiscountPercent) : null,
    validFrom: r.validFrom ? String(r.validFrom) : null,
    validTo: r.validTo ? String(r.validTo) : null,
    priority: r.priority != null ? Number(r.priority) : 100,
    active: r.active !== false,
  }))

  const resolvedPricing = resolveLocationPricing({
    vehicleId: String(vehicle.id),
    vehicleModelId: String(model.id),
    pickupBranchId: effectivePickupBranchId,
    referenceDate: input.startDate,
    vehicleBase: {
      pricePerDay: vehicle.pricePerDay != null ? Number(vehicle.pricePerDay) : null,
      pricePerWeek: vehicle.pricePerWeek != null ? Number(vehicle.pricePerWeek) : null,
      pricePerMonth: vehicle.pricePerMonth != null ? Number(vehicle.pricePerMonth) : null,
      weekendSurcharge: vehicle.weekendSurcharge != null ? Number(vehicle.weekendSurcharge) : null,
      holidaySurcharge: vehicle.holidaySurcharge != null ? Number(vehicle.holidaySurcharge) : null,
      depositAmount: vehicle.depositAmount != null ? Number(vehicle.depositAmount) : null,
    },
    rules: mappedPricingRules,
    serviceLocationSurcharge:
      (pickupLocDoc?.surchargeFee != null ? Number(pickupLocDoc.surchargeFee) : 0) +
      (returnLocDoc && returnLocDoc.id !== pickupLocDoc?.id && returnLocDoc.surchargeFee != null
        ? Number(returnLocDoc.surchargeFee)
        : 0),
    branchAfterHoursFee:
      pickupBranch?.afterHoursFee != null ? Number(pickupBranch.afterHoursFee) : null,
  })

  if (!resolvedPricing.ok || !resolvedPricing.dailyPrice) {
    return emptyFail(
      'PRICE_NOT_CONFIGURED',
      resolvedPricing.error ?? 'Giá thuê của phương tiện chưa được cấu hình tại địa điểm này.',
      {
        vehicle,
        model,
        pickupBranchId: effectivePickupBranchId,
        returnBranchId: effectiveReturnBranchId,
      },
    )
  }

  // Branch after-hours surcharge or rejection when pickup/return outside branch operating hours (BR-06)
  if ((pickupOutsideBranchHours || returnOutsideBranchHours) && !isHomeDelivery && !isHomePickup) {
    if (resolvedPricing.afterHoursFee > 0) {
      const outsideSlots = (pickupOutsideBranchHours ? 1 : 0) + (returnOutsideBranchHours ? 1 : 0)
      afterHoursFeeTotal += resolvedPricing.afterHoursFee * outsideSlots
    } else if (pickupBranch || returnBranch) {
      deliveryValidationError = {
        code: 'BRANCH_OUTSIDE_OPERATING_HOURS',
        message: `Giờ giao nhận nằm ngoài khung giờ làm việc của chi nhánh (${branchOpenTime} – ${branchCloseTime}) và chưa áp dụng chính sách ngoài giờ.`,
      }
    }
  }

  // Check free-delivery threshold if configured on zone or branch
  const addonKeys = parseAddonKeys(input.addonKeys)
  const prelimQuote = calculateMultiBranchRentalQuote({
    startDate: input.startDate,
    endDate: input.endDate,
    dailyPrice: resolvedPricing.dailyPrice,
    weeklyPrice: resolvedPricing.weeklyPrice,
    monthlyPrice: resolvedPricing.monthlyPrice,
    weekendSurcharge: resolvedPricing.weekendSurcharge,
    holidaySurcharge: resolvedPricing.holidaySurcharge,
    locationSurcharge: resolvedPricing.locationSurcharge,
    oneWayFee: matchedOneWay ? matchedOneWay.fee : 0,
    isOneWay,
    deliveryRequested: isHomeDelivery,
    deliveryFee: deliveryFeeResolved,
    pickupRequested: isHomePickup,
    pickupFee: pickupFeeResolved,
    afterHoursFee: afterHoursFeeTotal,
    addonKeys,
    vehicleDeposit: resolvedPricing.depositAmount,
    pricingRuleScope: resolvedPricing.appliedRuleScope,
    pricingRuleCode: resolvedPricing.appliedRuleCode,
  })

  const freeThreshold =
    zoneRec?.freeOverOrderAmount != null
      ? Number(zoneRec.freeOverOrderAmount)
      : pickupBranch?.freeDeliveryMinOrder != null
        ? Number(pickupBranch.freeDeliveryMinOrder)
        : null
  const finalBaseQuote =
    freeThreshold !== null && freeThreshold > 0 && prelimQuote.basePrice >= freeThreshold
      ? calculateMultiBranchRentalQuote({
          startDate: input.startDate,
          endDate: input.endDate,
          dailyPrice: resolvedPricing.dailyPrice,
          weeklyPrice: resolvedPricing.weeklyPrice,
          monthlyPrice: resolvedPricing.monthlyPrice,
          weekendSurcharge: resolvedPricing.weekendSurcharge,
          holidaySurcharge: resolvedPricing.holidaySurcharge,
          locationSurcharge: resolvedPricing.locationSurcharge,
          oneWayFee: matchedOneWay ? matchedOneWay.fee : 0,
          isOneWay,
          deliveryRequested: isHomeDelivery,
          deliveryFee: 0,
          pickupRequested: isHomePickup,
          pickupFee: 0,
          afterHoursFee: afterHoursFeeTotal,
          addonKeys,
          vehicleDeposit: resolvedPricing.depositAmount,
          pricingRuleScope: resolvedPricing.appliedRuleScope,
          pricingRuleCode: resolvedPricing.appliedRuleCode,
        })
      : prelimQuote

  // Evaluate Promotion with Branch Scope (PR-04, PR-05, PR-06) using pre-fetched promoDoc
  let promoEval: PromoEvaluationResult | null = null
  let promoId: string | null = null
  if (promoCodeNorm) {
    const promo = promoDoc as PromoWithScope | null
    const evaluation = evaluatePromotion(promo, {
      code: promoCodeNorm,
      serviceType: 'RENT',
      totalDays: finalBaseQuote.totalDays,
      subtotalBeforePromo: finalBaseQuote.estimatedTotal,
      alreadyHeldByCurrentBooking: input.alreadyHeldPromoCode === promoCodeNorm,
    })
    if (promo && evaluation.valid) {
      const branchCheck = isPromotionEligibleForBranch(
        {
          branchScope: promo.branchScope ?? null,
          applicableBranchIds: promo.applicableBranchIds ?? null,
        },
        effectivePickupBranchId,
      )
      if (!branchCheck.eligible) {
        promoEval = {
          valid: false,
          status: 'INVALID_SCOPE',
          promoCode: null,
          promoName: promo.name,
          discountAmount: 0,
          finalTotal: finalBaseQuote.estimatedTotal,
          message:
            branchCheck.message ?? 'Mã khuyến mãi không áp dụng tại chi nhánh nhận xe đã chọn.',
        }
      } else {
        promoEval = evaluation
        promoId = promo.id
      }
    } else {
      promoEval = evaluation
    }
  }

  const promoApplied = applyPromotionToQuote(finalBaseQuote, promoEval)
  const finalQuote = {
    ...finalBaseQuote,
    promoDiscountAmount: promoApplied.promoDiscountAmount,
    estimatedTotal: promoApplied.estimatedTotal,
    remainingAmount: promoApplied.remainingAmount,
  }

  const isAvailable = timeline.available && !hasGlobalLockConflict && !deliveryValidationError

  let finalReasonCode = timeline.reasonCode as string
  let finalReason = timeline.reason ?? null
  if (timeline.available && hasGlobalLockConflict) {
    finalReasonCode = 'DATE_OVERLAP_LOCK'
    finalReason = 'Xe đã có lịch giữ trong khoảng ngày này. Vui lòng chọn ngày hoặc xe khác.'
  } else if (timeline.available && deliveryValidationError) {
    finalReasonCode = deliveryValidationError.code
    finalReason = deliveryValidationError.message
  }

  const pickupLocationLabel =
    (pickupLocDoc ? `${String(pickupLocDoc.name)} — ${String(pickupLocDoc.address)}` : null) ??
    (pickupBranch ? `${String(pickupBranch.name)} — ${String(pickupBranch.address)}` : null) ??
    (typeof vehicle.pickupLocation === 'string' ? vehicle.pickupLocation : null) ??
    (typeof vehicle.location === 'string' ? vehicle.location : null)

  const returnLocationLabel =
    (returnLocDoc ? `${String(returnLocDoc.name)} — ${String(returnLocDoc.address)}` : null) ??
    (returnBranch ? `${String(returnBranch.name)} — ${String(returnBranch.address)}` : null) ??
    pickupLocationLabel

  const pricingRuleSnapshot = {
    version: 'v2.7.0',
    capturedAt: new Date().toISOString(),
    pickupBranchId: effectivePickupBranchId,
    pickupBranchName: pickupBranch ? String(pickupBranch.name) : null,
    returnBranchId: effectiveReturnBranchId,
    returnBranchName: returnBranch ? String(returnBranch.name) : null,
    pickupServiceLocationId: pickupLocDoc ? String(pickupLocDoc.id) : null,
    returnServiceLocationId: returnLocDoc ? String(returnLocDoc.id) : null,
    pickupMethod,
    returnMethod,
    deliveryZoneId: zoneRec ? String(zoneRec.id) : null,
    deliveryZoneName: zoneRec ? String(zoneRec.name) : null,
    appliedRuleId: resolvedPricing.appliedRuleId,
    appliedRuleCode: resolvedPricing.appliedRuleCode,
    appliedRuleScope: resolvedPricing.appliedRuleScope,
    oneWayRuleId: matchedOneWay?.id ?? null,
    revenueSplitPickupPercent: matchedOneWay?.pickupBranchSharePercent ?? 100,
    totalDays: finalQuote.totalDays,
    dailyPrice: finalQuote.dailyPrice,
    basePrice: finalQuote.basePrice,
    weekendSurchargeTotal: finalQuote.weekendSurchargeTotal,
    holidaySurchargeTotal: finalQuote.holidaySurchargeTotal,
    locationSurcharge: finalQuote.locationSurcharge,
    oneWayFee: finalQuote.oneWayFee,
    deliveryFee: finalQuote.deliveryFee,
    pickupFee: finalQuote.pickupFee,
    afterHoursFee: finalQuote.afterHoursFee,
    addonFee: finalQuote.addonFee,
    longTermDiscount: finalQuote.discountAmount,
    promoCode: promoEval?.valid ? promoEval.promoCode : null,
    promoDiscount: finalQuote.promoDiscountAmount,
    depositAmount: finalQuote.depositAmount,
    estimatedTotal: finalQuote.estimatedTotal,
  }

  return {
    available: isAvailable,
    reasonCode: isAvailable ? 'AVAILABLE' : finalReasonCode,
    reason: isAvailable ? null : finalReason,
    isOneWay,
    pickupBranchId: effectivePickupBranchId,
    returnBranchId: effectiveReturnBranchId,
    pickupBranchName: pickupBranch ? String(pickupBranch.name) : null,
    returnBranchName: returnBranch ? String(returnBranch.name) : null,
    pickupLocationLabel,
    returnLocationLabel,
    pickupServiceLocationId: pickupLocDoc ? String(pickupLocDoc.id) : null,
    returnServiceLocationId: returnLocDoc ? String(returnLocDoc.id) : null,
    deliveryZoneId: zoneRec ? String(zoneRec.id) : null,
    deliveryZoneName: zoneRec ? String(zoneRec.name) : null,
    revenueSplitPickupPercent: matchedOneWay?.pickupBranchSharePercent ?? 100,
    quote: finalQuote,
    promoEval,
    promoId,
    promoCodeNormalized: promoEval?.valid ? promoEval.promoCode : null,
    pricingRuleSnapshot,
    vehicle,
    model,
  }
}

// ============================================================================
// ATOMIC VEHICLE TRANSFER ENGINE (Section V — TR-01 .. TR-12)
// ============================================================================

async function runInAtomicDbTransaction<T>(
  payload: Payload,
  lockKey: string,
  fn: (req: PayloadRequest) => Promise<T>,
  actorUser?: unknown,
): Promise<T> {
  const dbAdapter = payload.db as unknown as {
    name?: string
    url?: string
    sessions?: Record<string, { db?: { execute?: (stmt: unknown) => Promise<unknown> } }>
  }
  const dbName = String(dbAdapter?.name ?? '').toLowerCase()
  const rawUri = String(
    dbAdapter?.url ?? process.env.DATABASE_URL ?? process.env.DATABASE_URI ?? '',
  )
    .trim()
    .toLowerCase()
  const isPg =
    dbName.includes('postgres') ||
    (!dbName && (rawUri.startsWith('postgres://') || rawUri.startsWith('postgresql://')))

  const runTxBody = async (): Promise<T> => {
    const txId = await payload.db.beginTransaction?.()
    const req = {
      payload,
      transactionID: txId ?? undefined,
      user: actorUser ?? undefined,
      context: {},
    } as unknown as PayloadRequest
    try {
      if (isPg && txId != null) {
        const sessionDb = dbAdapter?.sessions?.[String(txId)]?.db
        if (sessionDb?.execute) {
          const { sql: pgSql } = await import('@payloadcms/db-postgres')
          await sessionDb.execute(pgSql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
        }
      }
      const result = await fn(req)
      if (txId) await payload.db.commitTransaction?.(txId)
      return result
    } catch (err) {
      if (txId) {
        try {
          await payload.db.rollbackTransaction?.(txId)
        } catch {
          // ignore rollback error
        }
      }
      throw err
    }
  }

  return isPg ? runTxBody() : withBookingWriteLock(runTxBody)
}

export async function createVehicleTransferAtomic(
  payload: Payload,
  actor: {
    id: string
    email: string
    collection: 'admins'
    adminRole?: string
    staffTitle?: string
    branchScopeMode?: string
    assignedBranchIds?: string[]
  },
  input: {
    vehicleId: string
    fromBranchId?: string
    fromWarehouseId?: string
    toBranchId: string
    toWarehouseId: string
    reason: string
    scheduledDepartureAt: string
    scheduledArrivalAt: string
    assignedStaffId?: string | null
    assignedStaffName?: string | null
    transferCost?: number
    conditionBefore?: string | null
    odometerBefore?: number | null
    handoverReportNote?: string | null
    submitForApproval?: boolean
    allowMaintenanceException?: boolean
    idempotencyKey?: string | null
  },
) {
  return runInAtomicDbTransaction(
    payload,
    `vehicle-transfer:${input.vehicleId}`,
    async (req) => {
      if (input.idempotencyKey) {
        const dup = await payload.find({
          collection: 'vehicle-transfers' as never,
          overrideAccess: true,
          depth: 0,
          limit: 1,
          req,
          where: { idempotencyKey: { equals: input.idempotencyKey } },
        })
        if (dup.docs[0]) {
          return { transfer: dup.docs[0], reused: true }
        }
      }
      const vehicle = (await payload
        .findByID({
          collection: 'vehicles',
          id: input.vehicleId,
          overrideAccess: true,
          depth: 0,
          req,
        })
        .catch(() => null)) as Record<string, unknown> | null
      if (!vehicle) throw new APIError('Không tìm thấy phương tiện cần điều chuyển.', 404)

      const opStatus = String(vehicle.operationStatus ?? 'READY')
      if (opStatus === 'RENTED') {
        throw new APIError('Không thể tạo phiếu điều chuyển khi xe đang được khách thuê.', 409)
      }
      if (opStatus === 'SOLD') {
        throw new APIError('Không thể điều chuyển phương tiện đã bán.', 409)
      }
      if (opStatus === 'IN_TRANSIT') {
        throw new APIError('Phương tiện hiện đang trong một chuyến điều chuyển khác.', 409)
      }
      if (opStatus === 'MAINTENANCE' && !input.allowMaintenanceException) {
        throw new APIError(
          'Xe đang trong trạng thái bảo dưỡng; cần phê duyệt quy trình ngoại lệ để điều chuyển.',
          409,
        )
      }

      const fromBranchId =
        input.fromBranchId ||
        relationId(vehicle.currentBranch as string | { id: string } | null) ||
        relationId(vehicle.managingBranch as string | { id: string } | null)
      const fromWarehouseId =
        input.fromWarehouseId ||
        relationId(vehicle.currentWarehouse as string | { id: string } | null)
      if (!fromBranchId || !fromWarehouseId) {
        throw new APIError(
          'Phương tiện chưa được phân bổ chi nhánh / kho xuất hợp lệ. Hãy phân bổ xe trước khi điều chuyển.',
          400,
        )
      }
      if (fromWarehouseId === input.toWarehouseId) {
        throw new APIError('Kho nhận phải khác kho xuất.', 400)
      }

      // Branch RBAC guard: actor must have access to source or destination branch
      if (!adminCanAccessAnyBranch(actor, [fromBranchId, input.toBranchId])) {
        throw new APIError(
          'Bạn không có quyền tạo phiếu điều chuyển cho chi nhánh ngoài phạm vi được phân công.',
          403,
        )
      }

      // Validate destination branch & warehouse active + capacity
      const [toBranch, toWarehouse, fromWarehouse] = await Promise.all([
        payload
          .findByID({
            collection: 'branches' as never,
            id: input.toBranchId,
            overrideAccess: true,
            depth: 0,
            req,
          })
          .catch(() => null) as Promise<Record<string, unknown> | null>,
        payload
          .findByID({
            collection: 'warehouses' as never,
            id: input.toWarehouseId,
            overrideAccess: true,
            depth: 0,
            req,
          })
          .catch(() => null) as Promise<Record<string, unknown> | null>,
        payload
          .findByID({
            collection: 'warehouses' as never,
            id: fromWarehouseId,
            overrideAccess: true,
            depth: 0,
            req,
          })
          .catch(() => null) as Promise<Record<string, unknown> | null>,
      ])
      if (!toBranch || toBranch.status !== 'ACTIVE') {
        throw new APIError('Chi nhánh nhận hiện không hoạt động.', 409)
      }
      if (!fromWarehouse) {
        throw new APIError('Kho xuất không tồn tại.', 404)
      }
      if (!toWarehouse || toWarehouse.status !== 'ACTIVE') {
        throw new APIError('Kho nhận hiện không hoạt động hoặc đang bảo trì.', 409)
      }
      const toWhBranchId = relationId(toWarehouse.branch as string | { id: string } | null)
      if (toWhBranchId !== input.toBranchId) {
        throw new APIError('Kho nhận không trực thuộc chi nhánh nhận đã chọn.', 400)
      }

      // Check destination warehouse capacity (WH-03)
      const allVehInDestWh = await payload.find({
        collection: 'vehicles',
        overrideAccess: true,
        depth: 0,
        limit: 500,
        where: { currentWarehouse: { equals: input.toWarehouseId } },
        req,
      })
      const occ = computeWarehouseOccupancy(
        (allVehInDestWh.docs as unknown as Record<string, unknown>[]).map((v) => ({
          id: String(v.id),
          managingBranchId: relationId(v.managingBranch as string | { id: string } | null) ?? null,
          currentBranchId: relationId(v.currentBranch as string | { id: string } | null) ?? null,
          currentWarehouseId:
            relationId(v.currentWarehouse as string | { id: string } | null) ?? null,
          operationStatus: String(v.operationStatus ?? 'READY'),
          status: String(v.status ?? 'ACTIVE'),
        })),
        input.toWarehouseId,
        Number(toWarehouse.capacity ?? 1),
      )
      if (occ.availableSlots <= 0 && !toWarehouse.allowOverCapacity) {
        throw new APIError(
          `Kho nhận "${String(toWarehouse.name)}" đã đạt sức chứa tối đa (${occ.physicalCount}/${occ.capacity} xe).`,
          409,
        )
      }

      const startDate = input.scheduledDepartureAt.slice(0, 10)
      const endDate = input.scheduledArrivalAt.slice(0, 10)
      if (
        !Number.isFinite(dateNumber(startDate)) ||
        !Number.isFinite(dateNumber(endDate)) ||
        endDate < startDate
      ) {
        throw new APIError('Ngày giờ xuất và ngày giờ đến dự kiến không hợp lệ.', 400)
      }

      // Check conflicting bookings, transfers, and rental-days (TR-02, TR-03, TR-04)
      const endExclusive = addDays(endDate, 1)
      const [conflictDays, conflictTransfers] = await Promise.all([
        payload.count({
          collection: 'rental-days',
          overrideAccess: true,
          req,
          where: {
            and: [
              { vehicle: { equals: input.vehicleId } },
              { day: { greater_than_equal: startDate, less_than: endExclusive } },
            ],
          },
        }),
        payload.find({
          collection: 'vehicle-transfers' as never,
          overrideAccess: true,
          depth: 0,
          limit: 50,
          req,
          where: {
            and: [
              { vehicle: { equals: input.vehicleId } },
              {
                status: {
                  in: [
                    'DRAFT',
                    'PENDING_APPROVAL',
                    'APPROVED',
                    'IN_TRANSIT',
                    'ARRIVED',
                    'EXCEPTION',
                  ],
                },
              },
            ],
          },
        }),
      ])
      if (conflictDays.totalDocs > 0) {
        throw new APIError(
          'Phương tiện đã có lịch thuê hoặc lịch giữ trong khoảng thời gian điều chuyển dự kiến.',
          409,
        )
      }
      const hasTransferOverlap = (
        conflictTransfers.docs as unknown as Array<{ startDate: string; endDate: string }>
      ).some((t) => t.startDate <= endDate && t.endDate >= startDate)
      if (hasTransferOverlap) {
        throw new APIError(
          'Phương tiện đã có phiếu điều chuyển khác trùng khoảng thời gian này.',
          409,
        )
      }

      const initialStatus: TransferStatus = input.submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT'
      const transferCode = `TRF-${businessToday().replaceAll('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
      const nowIso = new Date().toISOString()

      const created = await payload.create({
        collection: 'vehicle-transfers' as never,
        overrideAccess: true,
        req,
        data: {
          transferCode,
          vehicle: input.vehicleId,
          vehicleReferenceSnapshot: String(vehicle.reference ?? input.vehicleId),
          fromBranch: fromBranchId,
          fromWarehouse: fromWarehouseId,
          toBranch: input.toBranchId,
          toWarehouse: input.toWarehouseId,
          reason: input.reason.trim().slice(0, 300),
          startDate,
          endDate,
          scheduledDepartureAt: input.scheduledDepartureAt,
          scheduledArrivalAt: input.scheduledArrivalAt,
          assignedStaff: input.assignedStaffId || undefined,
          assignedStaffName: input.assignedStaffName || undefined,
          transferCost: Math.max(0, roundVndInteger(input.transferCost ?? 0)),
          status: initialStatus,
          conditionBefore: input.conditionBefore ?? undefined,
          odometerBefore:
            typeof input.odometerBefore === 'number'
              ? input.odometerBefore
              : vehicle.odometer != null
                ? Number(vehicle.odometer)
                : undefined,
          handoverReportNote: input.handoverReportNote ?? undefined,
          createdBy: actor.email,
          revision: 1,
          idempotencyKey: input.idempotencyKey ?? undefined,
          statusHistory: [
            {
              status: initialStatus,
              changedAt: nowIso,
              changedBy: actor.email,
              note: `Tạo phiếu điều chuyển (${initialStatus === 'PENDING_APPROVAL' ? 'gửi phê duyệt' : 'bản nháp'})`,
            },
          ],
        } as never,
      })

      return { transfer: created, reused: false }
    },
    actor,
  )
}

export async function transitionVehicleTransferAtomic(
  payload: Payload,
  actor: {
    id: string
    email: string
    collection: 'admins'
    adminRole?: string
    staffTitle?: string
    branchScopeMode?: string
    assignedBranchIds?: string[]
  },
  input: {
    transferId: string
    nextStatus?: TransferStatus
    expectedRevision?: number
    note?: string | null
    odometerBefore?: number | null
    odometerAfter?: number | null
    conditionBefore?: string | null
    conditionAfter?: string | null
    handoverPhotos?: unknown
    exceptionNote?: string | null
    scheduledArrivalAt?: string | null
    requirePostArrivalInspection?: boolean
    simulateMidTxFailure?: boolean
  },
) {
  return runInAtomicDbTransaction(
    payload,
    `vehicle-transfer:${input.transferId}`,
    async (req) => {
      const doc = (await payload
        .findByID({
          collection: 'vehicle-transfers' as never,
          id: input.transferId,
          overrideAccess: true,
          depth: 0,
          req,
        })
        .catch(() => null)) as Record<string, unknown> | null
      if (!doc) throw new APIError('Không tìm thấy phiếu điều chuyển.', 404)

      const fromBranchId = String(
        relationId(doc.fromBranch as string | { id: string } | null) ?? '',
      )
      const toBranchId = String(relationId(doc.toBranch as string | { id: string } | null) ?? '')
      const fromWarehouseId = String(
        relationId(doc.fromWarehouse as string | { id: string } | null) ?? '',
      )
      const toWarehouseId = String(
        relationId(doc.toWarehouse as string | { id: string } | null) ?? '',
      )
      const vehicleId = String(relationId(doc.vehicle as string | { id: string } | null) ?? '')

      if (!adminCanAccessAnyBranch(actor, [fromBranchId, toBranchId])) {
        throw new APIError(
          'Bạn không có quyền thao tác trên phiếu điều chuyển ngoài chi nhánh.',
          403,
        )
      }

      const currentRev = Number(doc.revision ?? 1)
      if (input.expectedRevision !== undefined && input.expectedRevision !== currentRev) {
        throw new APIError(
          'Phiếu điều chuyển vừa được cập nhật từ phiên làm việc khác. Vui lòng tải lại trước khi xác nhận.',
          409,
        )
      }

      const currentStatus = String(doc.status ?? 'DRAFT') as TransferStatus
      const nowIso = new Date().toISOString()
      const actorTitle = staffTitleOf(actor) ?? 'OPERATOR'
      const transferCode = String(doc.transferCode ?? doc.id)

      // Delay update without changing status (TR-12)
      if (!input.nextStatus && input.scheduledArrivalAt) {
        const newEndDate = input.scheduledArrivalAt.slice(0, 10)
        const futureBookings = await payload.find({
          collection: 'bookings',
          overrideAccess: true,
          depth: 0,
          limit: 50,
          req,
          where: {
            and: [
              { vehicle: { equals: vehicleId } },
              { status: { in: [...HOLD_STATUSES] } },
              { startDate: { less_than_equal: newEndDate } },
              { endDate: { greater_than_equal: String(doc.startDate) } },
            ],
          },
        })
        const affectedKeys = futureBookings.docs.map((b) => String(b.bookingKey ?? b.id))
        const isDelayed = input.scheduledArrivalAt > String(doc.scheduledArrivalAt)
        const updated = await payload.update({
          collection: 'vehicle-transfers' as never,
          id: input.transferId,
          overrideAccess: true,
          req,
          data: {
            scheduledArrivalAt: input.scheduledArrivalAt,
            endDate: newEndDate,
            delayedWarning: isDelayed || affectedKeys.length > 0,
            affectedBookingKeys: affectedKeys,
            revision: currentRev + 1,
          } as never,
        })
        return { transfer: updated, affectedBookingKeys: affectedKeys }
      }

      const targetStatus = input.nextStatus
      if (!targetStatus) {
        throw new APIError('Thiếu trạng thái điều chuyển cần cập nhật.', 400)
      }

      const check = canTransitionTransfer(currentStatus, targetStatus, actorTitle)
      if (!check.allowed) {
        throw new APIError(check.reason ?? 'Chuyển trạng thái điều chuyển không hợp lệ.', 409)
      }

      // Branch-specific role checks for departure vs arrival confirmation
      if (targetStatus === 'IN_TRANSIT' && !adminCanAccessBranch(actor, fromBranchId)) {
        throw new APIError(
          'Chỉ nhân viên chi nhánh xuất hoặc Quản trị tổng mới được xác nhận xuất kho.',
          403,
        )
      }
      if (
        (targetStatus === 'ARRIVED' || targetStatus === 'COMPLETED') &&
        !adminCanAccessBranch(actor, toBranchId)
      ) {
        throw new APIError(
          'Chỉ nhân viên chi nhánh nhận hoặc Quản trị tổng mới được xác nhận tiếp nhận xe.',
          403,
        )
      }

      const updatePayload: Record<string, unknown> = {
        status: targetStatus,
        revision: currentRev + 1,
        ...(input.odometerBefore != null ? { odometerBefore: input.odometerBefore } : {}),
        ...(input.odometerAfter != null ? { odometerAfter: input.odometerAfter } : {}),
        ...(input.conditionBefore ? { conditionBefore: input.conditionBefore } : {}),
        ...(input.conditionAfter ? { conditionAfter: input.conditionAfter } : {}),
        ...(input.handoverPhotos ? { handoverPhotos: input.handoverPhotos } : {}),
        ...(input.exceptionNote ? { exceptionNote: input.exceptionNote } : {}),
      }

      // Lock rental-days globally on APPROVED
      if (targetStatus === 'APPROVED') {
        updatePayload.approvedBy = actor.email
        const daysToLock = rentalDays(String(doc.startDate), addDays(String(doc.endDate), 1))
        for (const day of daysToLock) {
          try {
            await payload.create({
              collection: 'rental-days',
              overrideAccess: true,
              req,
              data: {
                key: `${vehicleId}:${day}`,
                vehicle: vehicleId,
                day,
                bookingKey: transferCode,
                lockType: 'TRANSFER',
                referenceId: String(doc.id),
                branchId: fromBranchId,
              } as never,
            })
          } catch {
            throw new APIError(
              `Không thể khóa lịch điều chuyển ngày ${day} do phương tiện đã có đơn thuê hoặc lịch giữ trùng.`,
              409,
            )
          }
        }
      }

      // Departure (TR-05): Vehicle is IN_TRANSIT, not in source or destination physical warehouse stock
      if (targetStatus === 'IN_TRANSIT') {
        updatePayload.actualDepartureAt = nowIso
        await payload.update({
          collection: 'vehicles',
          id: vehicleId,
          overrideAccess: true,
          req,
          data: {
            operationStatus: 'IN_TRANSIT',
            currentWarehouse: null,
            nextExpectedBranch: toBranchId,
            nextExpectedLocationNote: `Đang điều chuyển theo phiếu ${transferCode}`,
            ...(input.odometerBefore != null ? { odometer: input.odometerBefore } : {}),
          } as never,
        })
        await recordVehicleLocationEvent(payload, req, {
          vehicleId,
          vehicleReference: String(doc.vehicleReferenceSnapshot ?? ''),
          eventType: 'TRANSFER_DEPARTURE',
          fromBranchId,
          fromWarehouseId,
          toBranchId,
          toWarehouseId,
          relatedTransferId: String(doc.id),
          odometer:
            input.odometerBefore ??
            (doc.odometerBefore != null ? Number(doc.odometerBefore) : null),
          conditionNote:
            input.conditionBefore ?? (doc.conditionBefore ? String(doc.conditionBefore) : null),
          actorEmail: actor.email,
          actorRole: actorTitle,
          note: input.note ?? `Xuất xe điều chuyển ${transferCode}`,
        })
      }

      // Arrival at destination (TR-06): DO NOT update destination physical inventory until COMPLETED!
      if (targetStatus === 'ARRIVED') {
        updatePayload.actualArrivalAt = nowIso
        await recordVehicleLocationEvent(payload, req, {
          vehicleId,
          vehicleReference: String(doc.vehicleReferenceSnapshot ?? ''),
          eventType: 'TRANSFER_ARRIVAL',
          fromBranchId,
          fromWarehouseId,
          toBranchId,
          toWarehouseId,
          relatedTransferId: String(doc.id),
          odometer: input.odometerAfter ?? null,
          conditionNote: input.conditionAfter ?? null,
          actorEmail: actor.email,
          actorRole: actorTitle,
          note: input.note ?? `Xe đã đến kho đích, chờ kiểm tra tiếp nhận (${transferCode})`,
        })
      }

      // Complete transfer (TR-07, TR-08, TR-11): Update vehicle currentBranch & currentWarehouse atomically and release locks!
      if (targetStatus === 'COMPLETED') {
        updatePayload.completedAt = nowIso
        updatePayload.receivedBy = actor.email

        const toBranchDoc = (await payload
          .findByID({
            collection: 'branches' as never,
            id: toBranchId,
            overrideAccess: true,
            depth: 0,
            req,
          })
          .catch(() => null)) as Record<string, unknown> | null

        await payload.update({
          collection: 'vehicles',
          id: vehicleId,
          overrideAccess: true,
          req,
          data: {
            currentBranch: toBranchId,
            currentWarehouse: toWarehouseId,
            allocationStatus: 'ALLOCATED',
            operationStatus: input.requirePostArrivalInspection ? 'PENDING_INSPECTION' : 'READY',
            nextExpectedBranch: null,
            nextExpectedLocationNote: null,
            ...(toBranchDoc?.province ? { location: String(toBranchDoc.province) } : {}),
            ...(toBranchDoc?.address
              ? { pickupLocation: `${String(toBranchDoc.name)} — ${String(toBranchDoc.address)}` }
              : {}),
            ...(input.odometerAfter != null ? { odometer: input.odometerAfter } : {}),
            ...(input.conditionAfter ? { condition: input.conditionAfter } : {}),
          } as never,
        })

        if (input.simulateMidTxFailure) {
          throw new APIError(
            'Simulated mid-transaction failure for atomic rollback test (TR-11).',
            500,
          )
        }

        await payload.delete({
          collection: 'rental-days',
          overrideAccess: true,
          req,
          where: { bookingKey: { equals: transferCode } },
        })

        await recordVehicleLocationEvent(payload, req, {
          vehicleId,
          vehicleReference: String(doc.vehicleReferenceSnapshot ?? ''),
          eventType: 'TRANSFER_COMPLETED',
          fromBranchId,
          fromWarehouseId,
          toBranchId,
          toWarehouseId,
          relatedTransferId: String(doc.id),
          odometer: input.odometerAfter ?? null,
          conditionNote: input.conditionAfter ?? null,
          actorEmail: actor.email,
          actorRole: actorTitle,
          note: input.note ?? `Hoàn tất tiếp nhận điều chuyển ${transferCode}`,
        })
      }

      // Cancel before departure (TR-09): release locked rental-days
      if (targetStatus === 'CANCELLED' || targetStatus === 'REJECTED') {
        await payload.delete({
          collection: 'rental-days',
          overrideAccess: true,
          req,
          where: { bookingKey: { equals: transferCode } },
        })
        // If cancelling from EXCEPTION after departure, keep vehicle status safe (PENDING_INSPECTION at source branch)
        if (currentStatus === 'EXCEPTION') {
          await payload.update({
            collection: 'vehicles',
            id: vehicleId,
            overrideAccess: true,
            req,
            data: {
              operationStatus: 'PENDING_INSPECTION',
              nextExpectedBranch: null,
              nextExpectedLocationNote: `Hủy ngoại lệ phiếu ${transferCode} — cần kiểm tra xác minh vị trí thực tế`,
            } as never,
          })
        }
      }

      const prevHistory = Array.isArray(doc.statusHistory) ? doc.statusHistory : []
      updatePayload.statusHistory = [
        ...prevHistory,
        {
          status: targetStatus,
          changedAt: nowIso,
          changedBy: actor.email,
          note:
            input.note ||
            input.exceptionNote ||
            `Chuyển trạng thái sang ${transferStatusLabels[targetStatus]}`,
        },
      ]

      const updated = await payload.update({
        collection: 'vehicle-transfers' as never,
        id: input.transferId,
        overrideAccess: true,
        req,
        data: updatePayload as never,
      })

      await recordAudit(
        payload,
        actor,
        {
          action: `transfer.${targetStatus.toLowerCase()}`,
          entity: 'vehicle-transfer',
          entityId: String(doc.id),
          entityLabel: transferCode,
          summary: `Điều chuyển ${transferCode}: ${transferStatusLabels[currentStatus]} → ${transferStatusLabels[targetStatus]}`,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          branchId:
            targetStatus === 'COMPLETED' || targetStatus === 'ARRIVED' ? toBranchId : fromBranchId,
        },
        req,
      )

      return { transfer: updated }
    },
    actor,
  )
}

export async function detectReturnScheduleConflicts(
  payload: Payload,
  req: PayloadRequest,
  params: {
    bookingId: string
    vehicleId: string
    actualReturnBranchId: string | null
    expectedReturnBranchId: string | null
    expectedEndDate: string
    isLateReturn: boolean
    isDamaged: boolean
  },
): Promise<string | null> {
  const nextBookings = await payload.find({
    collection: 'bookings',
    overrideAccess: true,
    req,
    depth: 0,
    limit: 5,
    sort: 'startDate',
    where: {
      and: [
        { vehicle: { equals: params.vehicleId } },
        { id: { not_equals: params.bookingId } },
        { status: { in: [...HOLD_STATUSES] } },
        { startDate: { greater_than_equal: params.expectedEndDate } },
      ],
    },
  })
  const nextB = nextBookings.docs[0]
  if (!nextB) return null

  const nextPickupBranchId = relationId(
    (nextB as unknown as { pickupBranch?: string | { id: string } | null }).pickupBranch,
  )
  const alerts: string[] = []
  if (params.isDamaged) {
    alerts.push(
      `Xe phát sinh hư hỏng cần kiểm tra/sửa chữa, có nguy cơ ảnh hưởng đơn tiếp theo ${nextB.bookingKey} (${nextB.startDate}).`,
    )
  }
  if (params.isLateReturn) {
    alerts.push(
      `Khách trả xe trễ so với hạn ${params.expectedEndDate}, cần rà soát thời gian chuẩn bị cho đơn tiếp theo ${nextB.bookingKey} (${nextB.startDate}).`,
    )
  }
  if (
    params.actualReturnBranchId &&
    nextPickupBranchId &&
    params.actualReturnBranchId !== nextPickupBranchId
  ) {
    alerts.push(
      `Xe đang ở chi nhánh khác với điểm nhận của đơn tiếp theo ${nextB.bookingKey} (${nextB.startDate}); cần lập kế hoạch điều chuyển ngay.`,
    )
  }
  return alerts.length > 0 ? alerts.join(' ') : null
}

export type { DeliveryZoneLike, VehicleInventoryRecord }
