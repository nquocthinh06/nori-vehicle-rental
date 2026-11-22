import { appAuth } from '@/lib/app-auth'
import { isUniqueConstraintError, txReqOptions, withAtomicResourceLock } from '@/lib/db-tx'
import { getPayloadClient } from '@/lib/payload'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  body,
  createRequestLogger,
  fail,
  json,
  text,
} from '@/lib/api-utils'
import {
  computeBookingFinancialsFromDb,
  computeBookingFinancialsSync,
  getSitePaymentConfig,
  sweepExpiredPayments,
  type SitePaymentConfiguration,
} from '@/lib/payment-service'
import { canModifyBooking, relationId, type BookingFinancialSummary } from '@/lib/rental-rules'
import type { Booking, Payment, Refund } from '@/payload-types'
import type { BookingView, PaymentItemView, RefundItemView } from '@/lib/domain-types'

const VALID_BOOKING_STATUSES = [
  'PENDING',
  'DEPOSIT_PENDING',
  'CONFIRMED',
  'READY_FOR_HANDOVER',
  'ONGOING',
  'INSPECTING',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]

function toPaymentItemView(
  p: Payment,
  booking: Booking,
  siteConfig?: SitePaymentConfiguration,
): PaymentItemView {
  return {
    id: p.id,
    reference: p.reference ?? p.id,
    bookingId: booking.id,
    bookingKey: booking.bookingKey ?? booking.id,
    paymentType: p.paymentType,
    method: p.method,
    provider: p.provider ?? 'MANUAL',
    environment: p.environment ?? siteConfig?.environment ?? 'MOCK',
    amount: p.amount,
    expectedAmount: p.expectedAmount ?? p.amount,
    receivedAmount: p.receivedAmount ?? 0,
    refundedAmount: p.refundedAmount ?? 0,
    overpaidAmount: p.overpaidAmount ?? 0,
    status: p.status,
    reconciliationStatus: p.reconciliationStatus ?? 'NONE',
    providerTransactionId: p.providerTransactionId ?? null,
    providerPaymentRef: p.providerPaymentRef ?? null,
    qrImageUrl: p.qrImageUrl ?? null,
    paymentUrl: p.paymentUrl ?? null,
    bankCode: p.bankCode ?? siteConfig?.bankConfig.bankCode ?? 'VCB',
    bankAccountNumber:
      p.bankAccountNumber ?? siteConfig?.bankConfig.bankAccountNumber ?? '1017588888',
    bankAccountName:
      p.bankAccountName ??
      siteConfig?.bankConfig.bankAccountHolder ??
      'CONG TY TNHH DICH VU PHUONG TIEN NORI',
    transferContent: p.transferContent ?? p.providerPaymentRef ?? p.reference ?? p.id,
    expiresAt: p.expiresAt ?? null,
    verifiedAt: p.verifiedAt ?? null,
    paidAt: p.paidAt ?? null,
    failureReason: p.failureReason ?? null,
    reconciliationNote: p.reconciliationNote ?? null,
    note: p.note ?? null,
    createdAt: p.createdAt,
  }
}

function toRefundItemView(r: Refund, booking: Booking): RefundItemView {
  return {
    id: r.id,
    reference: r.reference ?? r.id,
    bookingId: booking.id,
    bookingKey: booking.bookingKey ?? booking.id,
    paymentId: relationId(r.payment) ?? null,
    refundType: r.refundType,
    amount: r.amount,
    reason: r.reason,
    status: r.status,
    provider: r.provider ?? 'MANUAL',
    providerRefundId: r.providerRefundId ?? null,
    requestedAt: r.requestedAt ?? r.createdAt,
    approvedAt: r.approvedAt ?? null,
    completedAt: r.completedAt ?? null,
    createdAt: r.createdAt,
  }
}

function bookingView(
  booking: Booking,
  paymentMeta?: {
    hasPaymentRecord: boolean
    paymentConfirmed: boolean
    financial?: BookingFinancialSummary
    payments?: Payment[]
    refunds?: Refund[]
    siteConfig?: SitePaymentConfiguration
  },
): BookingView {
  const vehicle = typeof booking.vehicle === 'object' ? booking.vehicle : null
  const modelObj = vehicle && typeof vehicle.model === 'object' ? vehicle.model : null
  const dailyPriceSnapshot = booking.dailyPriceSnapshot ?? 0
  const totalDays = booking.totalDays ?? 0
  const totalPrice = booking.totalPrice ?? 0
  const status = booking.status ?? 'PENDING'
  const hasPaymentRecord = Boolean(paymentMeta?.hasPaymentRecord)
  const modCheck = canModifyBooking({
    status,
    isLoggedIn: true,
    isOwner: true,
    hasPaymentRecord,
  })
  const fin = paymentMeta?.financial
  return {
    id: booking.id,
    bookingKey: booking.bookingKey ?? booking.id,
    revision: booking.revision ?? 1,
    status,
    modelName:
      booking.vehicleNameSnapshot ?? (modelObj ? modelObj.name : 'Thông tin xe đang cập nhật'),
    modelSlug: modelObj?.slug ?? undefined,
    reference: booking.vehicleReferenceSnapshot ?? vehicle?.reference ?? '',
    vehicleId: vehicle ? vehicle.id : typeof booking.vehicle === 'string' ? booking.vehicle : '',
    startDate: booking.startDate,
    endDate: booking.endDate,
    pickupTime: booking.pickupTime ?? '08:00',
    returnTime: booking.returnTime ?? '20:00',
    pickupLocation: booking.pickupLocation ?? null,
    returnLocation: booking.returnLocation ?? booking.pickupLocation ?? null,
    pickupBranchId: relationId(booking.pickupBranch) ?? null,
    pickupBranchName:
      typeof booking.pickupBranch === 'object' && booking.pickupBranch
        ? booking.pickupBranch.name
        : null,
    returnBranchId: relationId(booking.returnBranch) ?? null,
    returnBranchName:
      typeof booking.returnBranch === 'object' && booking.returnBranch
        ? booking.returnBranch.name
        : null,
    pickupServiceLocationId: relationId(booking.pickupServiceLocation) ?? null,
    returnServiceLocationId: relationId(booking.returnServiceLocation) ?? null,
    isOneWay: Boolean(booking.isOneWay),
    pickupMethod: booking.pickupMethod ?? 'BRANCH_PICKUP',
    returnMethod: booking.returnMethod ?? 'BRANCH_RETURN',
    deliveryZoneId: relationId(booking.deliveryZone) ?? null,
    deliveryAddress: booking.deliveryAddress ?? null,
    pickupAddress: booking.pickupAddress ?? null,
    deliveryContactName: booking.deliveryContactName ?? null,
    deliveryContactPhone: booking.deliveryContactPhone ?? null,
    deliveryDirections: booking.deliveryDirections ?? null,
    deliveryRequested: Boolean(booking.deliveryRequested),
    addonServices: booking.addonServices ?? null,
    customerPhone: booking.customerPhone ?? null,
    customerEmail: booking.customerEmail ?? null,
    driverLicenseNumber: booking.driverLicenseNumber ?? null,
    note: booking.note ?? null,
    promoCode: booking.promoCode ?? null,
    promoDiscountAmount: booking.promoDiscountAmount ?? 0,
    totalDays,
    dailyPriceSnapshot,
    baseRentPrice: booking.baseRentPrice ?? dailyPriceSnapshot * totalDays,
    weekendSurchargeTotal: booking.weekendSurchargeTotal ?? 0,
    locationSurchargeSnapshot: booking.locationSurchargeSnapshot ?? 0,
    oneWayFeeSnapshot: booking.oneWayFeeSnapshot ?? 0,
    deliveryFeeSnapshot: booking.deliveryFeeSnapshot ?? 0,
    pickupFeeSnapshot: booking.pickupFeeSnapshot ?? 0,
    afterHoursFeeSnapshot: booking.afterHoursFeeSnapshot ?? 0,
    addonFeeTotal: booking.addonFeeTotal ?? 0,
    discountAmount: booking.discountAmount ?? 0,
    extraFee: booking.extraFee ?? 0,
    extraFeeNote: booking.extraFeeNote ?? null,
    totalPrice,
    paymentOption: (booking.paymentOption as 'DEPOSIT' | 'FULL') ?? 'DEPOSIT',
    reservationDepositSnapshot: booking.reservationDepositSnapshot ?? 0,
    depositSnapshot: booking.depositSnapshot ?? 0,
    initialPaymentDue:
      fin?.reservationDepositRequired ?? booking.initialPaymentDue ?? booking.depositSnapshot ?? 0,
    remainingAmount: fin?.totalRemainingRentalObligation ?? totalPrice,
    handoverNote: booking.handoverNote ?? null,
    expectedContactDate: booking.expectedContactDate ?? null,
    workingHoursSnapshot: booking.workingHoursSnapshot ?? null,
    isUrgentApproval: Boolean(booking.isUrgentApproval),
    hasPaymentRecord,
    paymentConfirmed: Boolean(paymentMeta?.paymentConfirmed),
    paymentStatusSummary: fin?.paymentStatusSummary ?? 'UNPAID',
    ...(fin
      ? {
          financial: {
            reservationDepositRequired: fin.reservationDepositRequired,
            securityDepositAmount: fin.securityDepositAmount,
            paidDepositAmount: fin.paidDepositAmount,
            paidRentalAmount: fin.paidRentalAmount,
            paidExtraFeeAmount: fin.paidExtraFeeAmount,
            paidSecurityDepositAmount: fin.paidSecurityDepositAmount,
            totalVerifiedReceived: fin.totalVerifiedReceived,
            rentalRevenueCollected: fin.rentalRevenueCollected,
            securityDepositHeld: fin.securityDepositHeld,
            overpaidAmount: fin.overpaidAmount,
            totalRefundedAmount: fin.totalRefundedAmount,
            pendingRefundAmount: fin.pendingRefundAmount,
            netCollectedAmount: fin.netCollectedAmount,
            remainingDepositDue: fin.remainingDepositDue,
            remainingRentalBeforeExtra: fin.remainingRentalBeforeExtra,
            remainingExtraFeeDue: fin.remainingExtraFeeDue,
            totalRemainingRentalObligation: fin.totalRemainingRentalObligation,
            remainingSecurityDepositDue: fin.remainingSecurityDepositDue,
            refundableBalance: fin.refundableBalance,
            paymentStatusSummary: fin.paymentStatusSummary,
            hasPendingPayment: fin.hasPendingPayment,
            hasAnomaly: fin.hasAnomaly,
            activePendingPaymentId: fin.activePendingPaymentId,
          },
        }
      : {}),
    payments: (paymentMeta?.payments ?? []).map((p) =>
      toPaymentItemView(p, booking, paymentMeta?.siteConfig),
    ),
    refunds: (paymentMeta?.refunds ?? []).map((r) => toRefundItemView(r, booking)),
    canModify: modCheck.allowed,
    modifyLockReason: modCheck.reason ?? null,
    statusHistory: (booking.statusHistory ?? []).map((h) => ({
      status: h.status,
      changedAt: h.changedAt,
      changedBy: h.changedBy ?? null,
      note: h.note ?? null,
    })),
    modificationHistory: (booking.modificationHistory ?? []).map((m) => ({
      modifiedAt: m.modifiedAt,
      modifiedBy: m.modifiedBy ?? null,
      actorType: m.actorType ?? null,
      statusAtChange: m.statusAtChange ?? null,
      reason: m.reason ?? null,
      previousTotalPrice: m.previousTotalPrice ?? 0,
      newTotalPrice: m.newTotalPrice ?? 0,
      previousDeposit: m.previousDeposit ?? 0,
      newDeposit: m.newDeposit ?? 0,
      changes: (m.changes ?? []).map((c) => ({
        field: c.field,
        label: c.label,
        before: c.before ?? null,
        after: c.after ?? null,
      })),
    })),
    createdAt: booking.createdAt,
  }
}

export async function GET(request: Request) {
  try {
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để xem đơn thuê.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để xem đơn thuê cá nhân.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const params = new URL(request.url).searchParams
    const singleId = params.get('id')
    const payload = await getPayloadClient()
    const siteConfig = await getSitePaymentConfig(payload)

    if (singleId) {
      const booking = await payload.findByID({
        collection: 'bookings',
        id: singleId,
        user,
        overrideAccess: false,
        depth: 2,
      })
      await sweepExpiredPayments(payload, { bookingId: booking.id })
      const { financial, payments, refunds } = await computeBookingFinancialsFromDb(
        payload,
        booking,
        { siteConfig },
      )
      const activePayStatuses = [
        'PENDING',
        'PROCESSING',
        'CONFIRMED',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ]
      return json(
        bookingView(booking, {
          hasPaymentRecord: payments.some((p) => activePayStatuses.includes(p.status)),
          paymentConfirmed: payments.some((p) =>
            ['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(p.status),
          ),
          financial,
          payments,
          refunds,
          siteConfig,
        }),
      )
    }

    const page = Number(params.get('page') ?? '1')
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000)
      return fail('Số trang chưa hợp lệ.')
    const status = params.get('status')
    if (status && !VALID_BOOKING_STATUSES.includes(status))
      return fail('Bộ lọc trạng thái chưa hợp lệ.')

    const result = await payload.find({
      collection: 'bookings',
      user,
      overrideAccess: false,
      depth: 2,
      limit: 10,
      page,
      sort: '-createdAt',
      ...(status ? { where: { status: { equals: status } } } : {}),
    })

    const bookingIds = result.docs.map((b) => b.id)
    const payByBooking = new Map<string, Payment[]>()
    const refundByBooking = new Map<string, Refund[]>()
    if (bookingIds.length > 0) {
      await sweepExpiredPayments(payload, { bookingIds })
      const [paymentsRes, refundsRes] = await Promise.all([
        payload.find({
          collection: 'payments',
          overrideAccess: true,
          depth: 0,
          limit: 300,
          sort: '-createdAt',
          where: { booking: { in: bookingIds } },
        }),
        payload
          .find({
            collection: 'refunds',
            overrideAccess: true,
            depth: 0,
            limit: 300,
            sort: '-createdAt',
            where: { booking: { in: bookingIds } },
          })
          .catch(() => ({ docs: [] as Refund[] })),
      ])
      for (const p of paymentsRes.docs) {
        const bId = relationId(p.booking)
        if (!bId) continue
        const list = payByBooking.get(String(bId)) ?? []
        list.push(p)
        payByBooking.set(String(bId), list)
      }
      for (const r of refundsRes.docs) {
        const bId = relationId(r.booking)
        if (!bId) continue
        const list = refundByBooking.get(String(bId)) ?? []
        list.push(r)
        refundByBooking.set(String(bId), list)
      }
    }

    const activePayStatuses = [
      'PENDING',
      'PROCESSING',
      'CONFIRMED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]
    const docs = result.docs.map((b) => {
      const bPayments = payByBooking.get(String(b.id)) ?? []
      const bRefunds = refundByBooking.get(String(b.id)) ?? []
      const financial = computeBookingFinancialsSync(b, bPayments, bRefunds, siteConfig)
      return bookingView(b, {
        hasPaymentRecord: bPayments.some((p) => activePayStatuses.includes(p.status)),
        paymentConfirmed: bPayments.some((p) =>
          ['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(p.status),
        ),
        financial,
        payments: bPayments,
        refunds: bRefunds,
        siteConfig,
      })
    })

    return json({
      docs,
      page: result.page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/bookings', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'bookings-create', 40, 60_000)
    const auth = await logger.time('auth', () =>
      appAuth.requireCustomer({
        unauthMessage: 'Vui lòng đăng nhập để đặt xe.',
        adminForbiddenMessage:
          'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để thực hiện đặt thuê.',
      }),
    )
    if (!auth.ok) return auth.response
    const user = auth.user
    const data = await body(request, [
      'vehicle',
      'startDate',
      'endDate',
      'pickupTime',
      'returnTime',
      'pickupLocation',
      'returnLocation',
      'pickupBranch',
      'returnBranch',
      'pickupServiceLocation',
      'returnServiceLocation',
      'pickupMethod',
      'returnMethod',
      'deliveryZone',
      'deliveryAddress',
      'pickupAddress',
      'deliveryContactName',
      'deliveryContactPhone',
      'deliveryDirections',
      'deliveryRequested',
      'addonServices',
      'customerPhone',
      'customerEmail',
      'driverLicenseNumber',
      'note',
      'promoCode',
      'paymentOption',
      'expectedTotalPrice',
      'idempotencyKey',
    ])
    const expectedTotalPrice =
      data.expectedTotalPrice !== undefined && data.expectedTotalPrice !== null
        ? Number(data.expectedTotalPrice)
        : undefined
    if (
      expectedTotalPrice !== undefined &&
      (!Number.isSafeInteger(expectedTotalPrice) || expectedTotalPrice < 0)
    ) {
      return fail(
        'Báo giá đối chiếu không hợp lệ.',
        400,
        'VALIDATION_ERROR',
        undefined,
        logger.responseHeaders(),
      )
    }
    const idempotencyKey = text(data.idempotencyKey, 120) || undefined
    const targetVehicleId = text(data.vehicle, 100)
    const lockKey = targetVehicleId
      ? `vehicle-booking:${targetVehicleId}`
      : `booking-create:${user.id}:${idempotencyKey ?? 'default'}`

    const payload = await logger.time('payload', () => getPayloadClient())
    try {
      return await logger.time('create_booking', () =>
        withAtomicResourceLock(payload, lockKey, async (tx) => {
          // Idempotency guard against Double Submit (BK-15)
          if (idempotencyKey) {
            const existing = await payload.find({
              collection: 'bookings',
              user,
              overrideAccess: false,
              depth: 2,
              limit: 1,
              ...txReqOptions(tx.req, undefined, user),
              where: {
                and: [
                  { customer: { equals: user.id } },
                  { idempotencyKey: { equals: idempotencyKey } },
                ],
              },
            })
            if (existing.docs[0]) {
              logger.logSuccess(200, { action: 'create', idempotent: true })
              return json(bookingView(existing.docs[0]), 200, logger.responseHeaders())
            }
          }

          const booking = await payload.create({
            collection: 'bookings',
            user,
            overrideAccess: false,
            depth: 2,
            ...txReqOptions(
              tx.req,
              expectedTotalPrice !== undefined ? { expectedTotalPrice } : undefined,
              user,
            ),
            data: {
              vehicle: targetVehicleId,
              startDate: text(data.startDate, 10),
              endDate: text(data.endDate, 10),
              pickupTime: text(data.pickupTime, 5) || undefined,
              returnTime: text(data.returnTime, 5) || undefined,
              pickupLocation: text(data.pickupLocation, 200) || undefined,
              returnLocation: text(data.returnLocation, 200) || undefined,
              pickupBranch: text(data.pickupBranch, 100) || undefined,
              returnBranch: text(data.returnBranch, 100) || undefined,
              pickupServiceLocation: text(data.pickupServiceLocation, 100) || undefined,
              returnServiceLocation: text(data.returnServiceLocation, 100) || undefined,
              pickupMethod:
                data.pickupMethod === 'HOME_DELIVERY' || Boolean(data.deliveryRequested)
                  ? 'HOME_DELIVERY'
                  : 'BRANCH_PICKUP',
              returnMethod: data.returnMethod === 'HOME_PICKUP' ? 'HOME_PICKUP' : 'BRANCH_RETURN',
              deliveryZone: text(data.deliveryZone, 100) || undefined,
              deliveryAddress: text(data.deliveryAddress, 300) || undefined,
              pickupAddress: text(data.pickupAddress, 300) || undefined,
              deliveryContactName: text(data.deliveryContactName, 120) || undefined,
              deliveryContactPhone: text(data.deliveryContactPhone, 20) || undefined,
              deliveryDirections: text(data.deliveryDirections, 500) || undefined,
              deliveryRequested:
                Boolean(data.deliveryRequested) || data.pickupMethod === 'HOME_DELIVERY',
              addonServices: Array.isArray(data.addonServices)
                ? data.addonServices.map((s) => text(s, 40)).join(',')
                : text(data.addonServices, 200) || undefined,
              customerPhone:
                data.customerPhone !== undefined ? text(data.customerPhone, 16) : undefined,
              customerEmail:
                data.customerEmail !== undefined ? text(data.customerEmail, 254) : undefined,
              driverLicenseNumber: text(data.driverLicenseNumber, 40) || undefined,
              note: text(data.note, 500) || undefined,
              promoCode: text(data.promoCode, 40) || undefined,
              paymentOption: data.paymentOption === 'FULL' ? 'FULL' : 'DEPOSIT',
              idempotencyKey,
            },
          })
          logger.logSuccess(201, { action: 'create', idempotent: false })
          return json(bookingView(booking), 201, logger.responseHeaders())
        }),
      )
    } catch (err) {
      if (idempotencyKey && isUniqueConstraintError(err)) {
        const existing = await payload.find({
          collection: 'bookings',
          user,
          overrideAccess: false,
          depth: 2,
          limit: 1,
          where: {
            and: [
              { customer: { equals: user.id } },
              { idempotencyKey: { equals: idempotencyKey } },
            ],
          },
        })
        if (existing.docs[0]) {
          logger.logSuccess(200, { action: 'create', idempotent: true, dbRaceRecovered: true })
          return json(bookingView(existing.docs[0]), 200, logger.responseHeaders())
        }
      }
      throw err
    }
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/bookings' })
  }
}

export async function PUT(request: Request) {
  const logger = createRequestLogger('nori-api/bookings', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'bookings-modify', 30, 60_000)
    const auth = await logger.time('auth', () =>
      appAuth.requireCustomer({
        unauthMessage: 'Vui lòng đăng nhập để chỉnh sửa đơn thuê.',
        adminForbiddenMessage:
          'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để chỉnh sửa đơn thuê.',
      }),
    )
    if (!auth.ok) return auth.response
    const user = auth.user

    const data = await body(request, [
      'id',
      'expectedRevision',
      'expectedTotalPrice',
      'vehicle',
      'startDate',
      'endDate',
      'pickupTime',
      'returnTime',
      'pickupLocation',
      'returnLocation',
      'pickupBranch',
      'returnBranch',
      'pickupServiceLocation',
      'returnServiceLocation',
      'pickupMethod',
      'returnMethod',
      'deliveryZone',
      'deliveryAddress',
      'pickupAddress',
      'deliveryRequested',
      'addonServices',
      'customerPhone',
      'customerEmail',
      'note',
      'promoCode',
      'paymentOption',
      'reason',
    ])
    const id = text(data.id, 100)
    if (!id) {
      return fail(
        'Thiếu mã đơn thuê cần chỉnh sửa.',
        400,
        'VALIDATION_ERROR',
        undefined,
        logger.responseHeaders(),
      )
    }

    const expectedRevision =
      data.expectedRevision !== undefined && data.expectedRevision !== null
        ? Number(data.expectedRevision)
        : undefined
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    ) {
      return fail(
        'Phiên bản đơn thuê không hợp lệ.',
        400,
        'VALIDATION_ERROR',
        undefined,
        logger.responseHeaders(),
      )
    }

    const expectedTotalPrice =
      data.expectedTotalPrice !== undefined && data.expectedTotalPrice !== null
        ? Number(data.expectedTotalPrice)
        : undefined
    if (
      expectedTotalPrice !== undefined &&
      (!Number.isSafeInteger(expectedTotalPrice) || expectedTotalPrice < 0)
    ) {
      return fail(
        'Báo giá đối chiếu không hợp lệ.',
        400,
        'VALIDATION_ERROR',
        undefined,
        logger.responseHeaders(),
      )
    }

    const payload = await logger.time('payload', () => getPayloadClient())
    const modifyPayload: Record<string, unknown> = {}
    if (data.vehicle !== undefined) modifyPayload.vehicle = text(data.vehicle, 100)
    if (data.startDate !== undefined) modifyPayload.startDate = text(data.startDate, 10)
    if (data.endDate !== undefined) modifyPayload.endDate = text(data.endDate, 10)
    if (data.pickupTime !== undefined) modifyPayload.pickupTime = text(data.pickupTime, 5)
    if (data.returnTime !== undefined) modifyPayload.returnTime = text(data.returnTime, 5)
    if (data.pickupLocation !== undefined)
      modifyPayload.pickupLocation = text(data.pickupLocation, 200)
    if (data.returnLocation !== undefined)
      modifyPayload.returnLocation = text(data.returnLocation, 200)
    if (data.pickupBranch !== undefined) modifyPayload.pickupBranch = text(data.pickupBranch, 100)
    if (data.returnBranch !== undefined) modifyPayload.returnBranch = text(data.returnBranch, 100)
    if (data.pickupServiceLocation !== undefined)
      modifyPayload.pickupServiceLocation = text(data.pickupServiceLocation, 100)
    if (data.returnServiceLocation !== undefined)
      modifyPayload.returnServiceLocation = text(data.returnServiceLocation, 100)
    if (data.pickupMethod !== undefined) modifyPayload.pickupMethod = text(data.pickupMethod, 20)
    if (data.returnMethod !== undefined) modifyPayload.returnMethod = text(data.returnMethod, 20)
    if (data.deliveryZone !== undefined) modifyPayload.deliveryZone = text(data.deliveryZone, 100)
    if (data.deliveryAddress !== undefined)
      modifyPayload.deliveryAddress = text(data.deliveryAddress, 300)
    if (data.pickupAddress !== undefined)
      modifyPayload.pickupAddress = text(data.pickupAddress, 300)
    if (data.deliveryRequested !== undefined)
      modifyPayload.deliveryRequested = Boolean(data.deliveryRequested)
    if (data.addonServices !== undefined) {
      modifyPayload.addonServices = Array.isArray(data.addonServices)
        ? data.addonServices.map((s) => text(s, 40)).join(',')
        : text(data.addonServices, 200)
    }
    if (data.customerPhone !== undefined) modifyPayload.customerPhone = text(data.customerPhone, 16)
    if (data.customerEmail !== undefined)
      modifyPayload.customerEmail = text(data.customerEmail, 254)
    if (data.note !== undefined) modifyPayload.note = text(data.note, 500)
    if (data.promoCode !== undefined) modifyPayload.promoCode = text(data.promoCode, 40)
    if (data.paymentOption !== undefined)
      modifyPayload.paymentOption = data.paymentOption === 'FULL' ? 'FULL' : 'DEPOSIT'
    if (data.reason !== undefined) modifyPayload.reason = text(data.reason, 300)

    const preBooking = await payload
      .findByID({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        depth: 0,
      })
      .catch(() => null)
    const lockVehicleId =
      (typeof modifyPayload.vehicle === 'string' && modifyPayload.vehicle) ||
      relationId(preBooking?.vehicle)
    const lockKey = lockVehicleId ? `vehicle-booking:${lockVehicleId}` : `booking:${id}`

    return await logger.time('modify_booking', () =>
      withAtomicResourceLock(payload, lockKey, async (tx) => {
        const updated = await payload.update({
          collection: 'bookings',
          id,
          user,
          overrideAccess: false,
          ...txReqOptions(
            tx.req,
            {
              noriCustomerModify: true,
              expectedRevision,
              ...(expectedTotalPrice !== undefined ? { expectedTotalPrice } : {}),
              noriModifyPayload: modifyPayload,
            },
            user,
          ),
          data: {},
          depth: 2,
        })

        logger.logSuccess(200, { action: 'modify' })
        return json(
          bookingView(updated, { hasPaymentRecord: false, paymentConfirmed: false }),
          200,
          logger.responseHeaders(),
        )
      }),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/bookings' })
  }
}

export async function PATCH(request: Request) {
  const logger = createRequestLogger('nori-api/bookings', request)
  try {
    assertOrigin(request)
    const auth = await logger.time('auth', () =>
      appAuth.requireCustomer({
        unauthMessage: 'Vui lòng đăng nhập.',
        adminForbiddenMessage:
          'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để hủy đơn thuê cá nhân.',
      }),
    )
    if (!auth.ok) return auth.response
    const user = auth.user
    const data = await body(request, ['id'])
    const payload = await logger.time('payload', () => getPayloadClient())
    const id = text(data.id, 100)
    const preBooking = await payload
      .findByID({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        depth: 0,
      })
      .catch(() => null)
    const lockVehicleId = relationId(preBooking?.vehicle)
    const lockKey = lockVehicleId ? `vehicle-booking:${lockVehicleId}` : `booking:${id}`

    return await logger.time('cancel_booking', () =>
      withAtomicResourceLock(payload, lockKey, async (tx) => {
        const booking = await payload.findByID({
          collection: 'bookings',
          id,
          user,
          overrideAccess: false,
          depth: 0,
          ...txReqOptions(tx.req, undefined, user),
        })
        if (!['PENDING', 'DEPOSIT_PENDING'].includes(booking.status ?? ''))
          return fail(
            'Chỉ có thể hủy đơn đang chờ xác nhận hoặc chờ đặt cọc.',
            409,
            'INVALID_BOOKING_TRANSITION',
            undefined,
            logger.responseHeaders(),
          )
        const updated = await payload.update({
          collection: 'bookings',
          id,
          user,
          overrideAccess: false,
          ...txReqOptions(tx.req, { noriCustomerCancel: true }, user),
          data: {},
          depth: 2,
        })
        logger.logSuccess(200, { action: 'cancel' })
        return json(bookingView(updated), 200, logger.responseHeaders())
      }),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/bookings' })
  }
}
