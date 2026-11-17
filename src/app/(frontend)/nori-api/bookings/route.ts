import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
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

function bookingView(booking: Booking): BookingView {
  const vehicle = typeof booking.vehicle === 'object' ? booking.vehicle : null
  const dailyPriceSnapshot = booking.dailyPriceSnapshot ?? 0
  const totalDays = booking.totalDays ?? 0
  const totalPrice = booking.totalPrice ?? 0
  return {
    id: booking.id,
    bookingKey: booking.bookingKey ?? booking.id,
    status: booking.status ?? 'PENDING',
    modelName:
      booking.vehicleNameSnapshot ??
      (vehicle && typeof vehicle.model === 'object'
        ? vehicle.model.name
        : 'Thông tin xe đang cập nhật'),
    reference: booking.vehicleReferenceSnapshot ?? vehicle?.reference ?? '',
    startDate: booking.startDate,
    endDate: booking.endDate,
    pickupTime: booking.pickupTime ?? '08:00',
    returnTime: booking.returnTime ?? '20:00',
    pickupLocation: booking.pickupLocation ?? null,
    deliveryRequested: Boolean(booking.deliveryRequested),
    addonServices: booking.addonServices ?? null,
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
    remainingAmount: booking.remainingAmount ?? totalPrice,
    handoverNote: booking.handoverNote ?? null,
    createdAt: booking.createdAt,
  }
}

export async function GET(request: Request) {
  try {
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập để xem đơn thuê.', 401, 'UNAUTHORIZED')
    const params = new URL(request.url).searchParams
    const page = Number(params.get('page') ?? '1')
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000)
      return fail('Số trang chưa hợp lệ.')
    const status = params.get('status')
    if (status && !VALID_BOOKING_STATUSES.includes(status))
      return fail('Bộ lọc trạng thái chưa hợp lệ.')
    const payload = await getPayloadClient()
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
    return json({
      docs: result.docs.map(bookingView),
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
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập để đặt xe.', 401, 'UNAUTHORIZED')
    const data = await body(request, [
      'vehicle',
      'startDate',
      'endDate',
      'pickupTime',
      'returnTime',
      'pickupLocation',
      'deliveryRequested',
      'addonServices',
      'customerPhone',
      'driverLicenseNumber',
      'note',
      'promoCode',
    ])
    const payload = await getPayloadClient()
    const booking = await payload.create({
      collection: 'bookings',
      user,
      overrideAccess: false,
      depth: 2,
      data: {
        vehicle: text(data.vehicle, 100),
        startDate: text(data.startDate, 10),
        endDate: text(data.endDate, 10),
        pickupTime: text(data.pickupTime, 5) || undefined,
        returnTime: text(data.returnTime, 5) || undefined,
        pickupLocation: text(data.pickupLocation, 200) || undefined,
        deliveryRequested: Boolean(data.deliveryRequested),
        addonServices: Array.isArray(data.addonServices)
          ? data.addonServices.map((s) => text(s, 40)).join(',')
          : text(data.addonServices, 200) || undefined,
        customerPhone: text(data.customerPhone, 16) || undefined,
        driverLicenseNumber: text(data.driverLicenseNumber, 40) || undefined,
        note: text(data.note, 500) || undefined,
        promoCode: text(data.promoCode, 40) || undefined,
      },
    })
    return json(bookingView(booking), 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập.', 401, 'UNAUTHORIZED')
    const data = await body(request, ['id'])
    const payload = await getPayloadClient()
    const id = text(data.id, 100)
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
  } catch (error) {
    return apiError(error)
  }
}
