import { getPayloadClient } from '@/lib/payload'
import { addDays, businessToday, validateRentalDates } from '@/lib/rental-rules'
import { apiError, fail, json } from '@/lib/api-utils'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const id = params.get('vehicle')
    if (!id) return fail('Vui lòng chọn xe thực tế.')
    const payload = await getPayloadClient()
    const vehicle = await payload.findByID({
      collection: 'vehicles',
      id,
      overrideAccess: false,
      depth: 0,
    })
    if (!vehicle || vehicle.status !== 'ACTIVE' || vehicle.intent === 'SALE')
      return fail('Xe chưa nhận đặt thuê.', 409, 'VEHICLE_NOT_AVAILABLE')
    const startDate = params.get('startDate')
    const endDate = params.get('endDate')
    if (!startDate && !endDate) {
      const slots = await payload.find({
        collection: 'rental-days',
        overrideAccess: false,
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
          ],
        },
        select: { day: true },
      })
      return json({ busyDays: slots.docs.map((d) => d.day) })
    }
    const validation = validateRentalDates(startDate ?? '', endDate ?? '')
    if (validation.error || !validation.totalDays)
      return fail(validation.error ?? 'Ngày thuê không hợp lệ.')
    if (!vehicle.pricePerDay)
      return fail('Giá thuê của xe chưa được cập nhật.', 409, 'PRICE_NOT_SET')
    const slots = await payload.count({
      collection: 'rental-days',
      overrideAccess: false,
      where: {
        and: [
          { vehicle: { equals: id } },
          { day: { greater_than_equal: startDate, less_than: endDate } },
        ],
      },
    })
    return json({
      available: slots.totalDocs === 0,
      totalDays: validation.totalDays,
      dailyPrice: vehicle.pricePerDay,
      estimatedTotal: vehicle.pricePerDay * validation.totalDays,
      startDate,
      endDate,
    })
  } catch (error) {
    return apiError(error)
  }
}
