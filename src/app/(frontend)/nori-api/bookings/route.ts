import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { withBookingWriteLock } from '@/lib/promo-service'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
import { canModifyBooking } from '@/lib/rental-rules'
import type { Booking } from '@/payload-types'
import type { BookingView } from '@/lib/domain-types'

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

function bookingView(
  booking: Booking,
  paymentMeta?: { hasPaymentRecord: boolean; paymentConfirmed: boolean },
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
    deliveryFeeSnapshot: booking.deliveryFeeSnapshot ?? 0,
    addonFeeTotal: booking.addonFeeTotal ?? 0,
    discountAmount: booking.discountAmount ?? 0,
    totalPrice,
    depositSnapshot: booking.depositSnapshot ?? 0,
    initialPaymentDue: booking.initialPaymentDue ?? booking.depositSnapshot ?? 0,
    remainingAmount: totalPrice,
    handoverNote: booking.handoverNote ?? null,
    expectedContactDate: booking.expectedContactDate ?? null,
    workingHoursSnapshot: booking.workingHoursSnapshot ?? null,
    isUrgentApproval: Boolean(booking.isUrgentApproval),
    hasPaymentRecord,
    paymentConfirmed: Boolean(paymentMeta?.paymentConfirmed),
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

    if (singleId) {
      const booking = await payload.findByID({
        collection: 'bookings',
        id: singleId,
        user,
        overrideAccess: false,
        depth: 2,
      })
      const payRes = await payload.find({
        collection: 'payments',
        overrideAccess: true,
        depth: 0,
        limit: 20,
        where: {
          and: [
            { booking: { equals: booking.id } },
            { status: { in: ['PENDING', 'CONFIRMED', 'REFUNDED'] } },
          ],
        },
      })
      return json(
        bookingView(booking, {
          hasPaymentRecord: payRes.docs.length > 0,
          paymentConfirmed: payRes.docs.some((p) => p.status === 'CONFIRMED'),
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
    const payMap = new Map<string, { hasPaymentRecord: boolean; paymentConfirmed: boolean }>()
    if (bookingIds.length > 0) {
      const paymentsRes = await payload.find({
        collection: 'payments',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        where: {
          and: [
            { booking: { in: bookingIds } },
            { status: { in: ['PENDING', 'CONFIRMED', 'REFUNDED'] } },
          ],
        },
      })
      for (const p of paymentsRes.docs) {
        const bId = typeof p.booking === 'object' && p.booking ? p.booking.id : p.booking
        if (!bId) continue
        const prev = payMap.get(String(bId)) ?? {
          hasPaymentRecord: false,
          paymentConfirmed: false,
        }
        payMap.set(String(bId), {
          hasPaymentRecord: true,
          paymentConfirmed: prev.paymentConfirmed || p.status === 'CONFIRMED',
        })
      }
    }

    return json({
      docs: result.docs.map((b) => bookingView(b, payMap.get(String(b.id)))),
      page: result.page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'bookings-create', 40, 60_000)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để đặt xe.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để thực hiện đặt thuê.',
    })
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
      'deliveryRequested',
      'addonServices',
      'customerPhone',
      'customerEmail',
      'driverLicenseNumber',
      'note',
      'promoCode',
      'expectedTotalPrice',
    ])
    const expectedTotalPrice =
      data.expectedTotalPrice !== undefined && data.expectedTotalPrice !== null
        ? Number(data.expectedTotalPrice)
        : undefined
    if (
      expectedTotalPrice !== undefined &&
      (!Number.isSafeInteger(expectedTotalPrice) || expectedTotalPrice < 0)
    ) {
      return fail('Báo giá đối chiếu không hợp lệ.')
    }

    const payload = await getPayloadClient()
    return await withBookingWriteLock(async () => {
      const booking = await payload.create({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 2,
        context: {
          ...(expectedTotalPrice !== undefined ? { expectedTotalPrice } : {}),
        },
        data: {
          vehicle: text(data.vehicle, 100),
          startDate: text(data.startDate, 10),
          endDate: text(data.endDate, 10),
          pickupTime: text(data.pickupTime, 5) || undefined,
          returnTime: text(data.returnTime, 5) || undefined,
          pickupLocation: text(data.pickupLocation, 200) || undefined,
          returnLocation: text(data.returnLocation, 200) || undefined,
          deliveryRequested: Boolean(data.deliveryRequested),
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
        },
      })
      return json(bookingView(booking), 201)
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PUT(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'bookings-modify', 30, 60_000)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để chỉnh sửa đơn thuê.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để chỉnh sửa đơn thuê.',
    })
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
      'deliveryRequested',
      'addonServices',
      'customerPhone',
      'customerEmail',
      'note',
      'promoCode',
      'reason',
    ])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã đơn thuê cần chỉnh sửa.')

    const expectedRevision =
      data.expectedRevision !== undefined && data.expectedRevision !== null
        ? Number(data.expectedRevision)
        : undefined
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    ) {
      return fail('Phiên bản đơn thuê không hợp lệ.')
    }

    const expectedTotalPrice =
      data.expectedTotalPrice !== undefined && data.expectedTotalPrice !== null
        ? Number(data.expectedTotalPrice)
        : undefined
    if (
      expectedTotalPrice !== undefined &&
      (!Number.isSafeInteger(expectedTotalPrice) || expectedTotalPrice < 0)
    ) {
      return fail('Báo giá đối chiếu không hợp lệ.')
    }

    const payload = await getPayloadClient()
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
    if (data.reason !== undefined) modifyPayload.reason = text(data.reason, 300)

    return await withBookingWriteLock(async () => {
      const updated = await payload.update({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        context: {
          noriCustomerModify: true,
          expectedRevision,
          ...(expectedTotalPrice !== undefined ? { expectedTotalPrice } : {}),
          noriModifyPayload: modifyPayload,
        },
        data: {},
        depth: 2,
      })

      return json(bookingView(updated, { hasPaymentRecord: false, paymentConfirmed: false }))
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để hủy đơn thuê cá nhân.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const data = await body(request, ['id'])
    const payload = await getPayloadClient()
    const id = text(data.id, 100)
    return await withBookingWriteLock(async () => {
      const booking = await payload.findByID({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        depth: 0,
      })
      if (!['PENDING', 'DEPOSIT_PENDING'].includes(booking.status ?? ''))
        return fail(
          'Chỉ có thể hủy đơn đang chờ xác nhận hoặc chờ đặt cọc.',
          409,
          'INVALID_BOOKING_TRANSITION',
        )
      const updated = await payload.update({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        context: { noriCustomerCancel: true },
        data: {},
        depth: 2,
      })
      return json(bookingView(updated))
    })
  } catch (error) {
    return apiError(error)
  }
}
