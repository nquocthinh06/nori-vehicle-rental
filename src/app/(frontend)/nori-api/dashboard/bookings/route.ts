import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { isDepositExpired, type BookingStatus } from '@/lib/rental-rules'

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
] as const

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const status = sp.get('status') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (
      status &&
      !VALID_BOOKING_STATUSES.includes(status as (typeof VALID_BOOKING_STATUSES)[number])
    ) {
      return fail('Bộ lọc trạng thái đơn thuê chưa hợp lệ.')
    }

    const res = await payload.find({
      collection: 'bookings',
      user,
      overrideAccess: false,
      depth: 2,
      limit: 500,
      sort: '-createdAt',
      ...(status ? { where: { status: { equals: status } } } : {}),
    })

    const filtered = res.docs
      .filter((b) => {
        if (!q) return true
        const custName = typeof b.customer === 'object' ? (b.customer?.fullName ?? '') : ''
        const custEmail = typeof b.customer === 'object' ? (b.customer?.email ?? '') : ''
        const hay =
          `${b.bookingKey ?? ''} ${b.vehicleReferenceSnapshot ?? ''} ${b.vehicleNameSnapshot ?? ''} ${custName} ${custEmail} ${b.customerPhone ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .map((b) => ({
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        status: b.status ?? 'PENDING',
        customerId: typeof b.customer === 'object' ? b.customer?.id : undefined,
        customerName: typeof b.customer === 'object' ? b.customer?.fullName : 'Chưa cập nhật',
        customerEmail: typeof b.customer === 'object' ? b.customer?.email : undefined,
        vehicleId: typeof b.vehicle === 'object' ? b.vehicle?.id : String(b.vehicle),
        reference:
          b.vehicleReferenceSnapshot ?? (typeof b.vehicle === 'object' ? b.vehicle.reference : ''),
        modelName:
          b.vehicleNameSnapshot ??
          (typeof b.vehicle === 'object' && typeof b.vehicle.model === 'object'
            ? b.vehicle.model.name
            : 'Chưa cập nhật'),
        startDate: b.startDate,
        endDate: b.endDate,
        pickupTime: b.pickupTime ?? '08:00',
        returnTime: b.returnTime ?? '20:00',
        pickupLocation: b.pickupLocation ?? null,
        deliveryRequested: Boolean(b.deliveryRequested),
        addonServices: b.addonServices ?? null,
        customerPhone: b.customerPhone ?? null,
        driverLicenseNumber: b.driverLicenseNumber ?? null,
        note: b.note ?? null,
        handoverNote: b.handoverNote ?? null,
        extraFee: b.extraFee ?? 0,
        extraFeeNote: b.extraFeeNote ?? null,
        contractNumber: b.contractNumber ?? null,
        returnOdometer: b.returnOdometer ?? null,
        returnCondition: b.returnCondition ?? null,
        promoCode: b.promoCode ?? null,
        promoDiscountAmount: b.promoDiscountAmount ?? 0,
        statusHistory: (b.statusHistory ?? []).map((h) => ({
          status: h.status,
          changedAt: h.changedAt,
          changedBy: h.changedBy ?? null,
          note: h.note ?? null,
        })),
        totalDays: b.totalDays ?? 0,
        dailyPriceSnapshot: b.dailyPriceSnapshot ?? 0,
        baseRentPrice: b.baseRentPrice ?? 0,
        weekendSurchargeTotal: b.weekendSurchargeTotal ?? 0,
        deliveryFeeSnapshot: b.deliveryFeeSnapshot ?? 0,
        addonFeeTotal: b.addonFeeTotal ?? 0,
        discountAmount: b.discountAmount ?? 0,
        totalPrice: b.totalPrice ?? 0,
        depositSnapshot: b.depositSnapshot ?? 0,
        initialPaymentDue: b.initialPaymentDue ?? b.depositSnapshot ?? 0,
        remainingAmount: b.remainingAmount ?? b.totalPrice ?? 0,
        depositExpired: isDepositExpired(b.createdAt, b.status ?? 'PENDING'),
        createdAt: b.createdAt,
      }))

    const pageSize = 15
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safePage = Math.min(page, totalPages)

    return json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      totalDocs: filtered.length,
      page: safePage,
      totalPages,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'id',
      'status',
      'handoverNote',
      'extraFee',
      'extraFeeNote',
      'contractNumber',
      'returnOdometer',
      'returnCondition',
    ])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id) return fail('Thiếu mã đơn thuê.')
    if (!VALID_BOOKING_STATUSES.includes(status as (typeof VALID_BOOKING_STATUSES)[number])) {
      return fail('Trạng thái đơn thuê không hợp lệ.')
    }
    const handoverNote = text(data.handoverNote, 1000)
    const extraFeeNote = text(data.extraFeeNote, 300)
    const contractNumber = text(data.contractNumber, 80)
    const returnCondition = text(data.returnCondition, 500)
    const extraFee =
      data.extraFee !== undefined && data.extraFee !== null && data.extraFee !== ''
        ? Number(data.extraFee)
        : undefined
    if (extraFee !== undefined && (!Number.isSafeInteger(extraFee) || extraFee < 0)) {
      return fail('Phụ phí phát sinh phải là số nguyên không âm.')
    }
    const returnOdometer =
      data.returnOdometer !== undefined &&
      data.returnOdometer !== null &&
      data.returnOdometer !== ''
        ? Number(data.returnOdometer)
        : undefined
    if (
      returnOdometer !== undefined &&
      (!Number.isSafeInteger(returnOdometer) || returnOdometer < 0)
    ) {
      return fail('ODO lúc nhận lại xe phải là số nguyên không âm.')
    }

    const updated = await payload.update({
      collection: 'bookings',
      id,
      user,
      overrideAccess: false,
      data: {
        status: status as BookingStatus,
        ...(handoverNote ? { handoverNote } : {}),
        ...(extraFee !== undefined ? { extraFee } : {}),
        ...(extraFeeNote ? { extraFeeNote } : {}),
        ...(contractNumber ? { contractNumber } : {}),
        ...(returnOdometer !== undefined ? { returnOdometer } : {}),
        ...(returnCondition ? { returnCondition } : {}),
      },
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}
