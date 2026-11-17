import { headers } from 'next/headers'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import type { BookingStatus } from '@/lib/rental-rules'

export async function GET() {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: await headers() })
    if (user?.collection !== 'admins')
      return fail('Trang này chỉ dành cho quản trị viên NORI.', 403, 'FORBIDDEN')
    const [vehicles, models, customers, bookings, pending, confirmed, ongoing, completed] =
      await Promise.all([
        payload.count({
          collection: 'vehicles',
          user,
          overrideAccess: false,
          where: { status: { equals: 'ACTIVE' } },
        }),
        payload.count({ collection: 'vehicle-models', user, overrideAccess: false }),
        payload.count({ collection: 'users', user, overrideAccess: false }),
        payload.find({
          collection: 'bookings',
          user,
          overrideAccess: false,
          depth: 2,
          limit: 20,
          sort: '-createdAt',
        }),
        payload.count({
          collection: 'bookings',
          user,
          overrideAccess: false,
          where: { status: { equals: 'PENDING' } },
        }),
        payload.count({
          collection: 'bookings',
          user,
          overrideAccess: false,
          where: { status: { equals: 'CONFIRMED' } },
        }),
        payload.count({
          collection: 'bookings',
          user,
          overrideAccess: false,
          where: { status: { equals: 'ONGOING' } },
        }),
        payload.count({
          collection: 'bookings',
          user,
          overrideAccess: false,
          where: { status: { equals: 'COMPLETED' } },
        }),
      ])
    return json({
      vehicles: vehicles.totalDocs,
      models: models.totalDocs,
      customers: customers.totalDocs,
      totalBookings: bookings.totalDocs,
      statuses: {
        PENDING: pending.totalDocs,
        CONFIRMED: confirmed.totalDocs,
        ONGOING: ongoing.totalDocs,
        COMPLETED: completed.totalDocs,
      },
      bookings: bookings.docs.map((b) => ({
        id: b.id,
        bookingKey: b.bookingKey,
        status: b.status,
        customerName: typeof b.customer === 'object' ? b.customer?.fullName : 'Chưa cập nhật',
        reference: typeof b.vehicle === 'object' ? b.vehicle.reference : '',
        modelName:
          typeof b.vehicle === 'object' && typeof b.vehicle.model === 'object'
            ? b.vehicle.model.name
            : 'Chưa cập nhật',
        startDate: b.startDate,
        endDate: b.endDate,
        totalPrice: b.totalPrice,
        createdAt: b.createdAt,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: await headers() })
    if (user?.collection !== 'admins')
      return fail('Bạn không có quyền thực hiện thao tác này.', 403, 'FORBIDDEN')
    const data = await body(request, ['id', 'status'])
    const status = text(data.status, 15)
    if (!['CONFIRMED', 'REJECTED', 'ONGOING', 'CANCELLED', 'COMPLETED'].includes(status))
      return fail('Trạng thái không hợp lệ.')
    const result = await payload.update({
      collection: 'bookings',
      id: text(data.id, 100),
      user,
      overrideAccess: false,
      data: { status: status as BookingStatus },
    })
    return json({ id: result.id, status: result.status })
  } catch (error) {
    return apiError(error)
  }
}
