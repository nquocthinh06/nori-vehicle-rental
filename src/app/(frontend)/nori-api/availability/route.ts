import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { lookupAndEvaluatePromotion } from '@/lib/promo-service'
import {
  addDays,
  applyPromotionToQuote,
  businessToday,
  calculateRentalQuote,
  parseAddonKeys,
  validateRentalDates,
} from '@/lib/rental-rules'
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
      const [slots, maints] = await Promise.all([
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
      ])
      const busySet = new Set(slots.docs.map((d) => d.day))
      for (const m of maints.docs) {
        let cur = m.startDate
        for (let i = 0; i < 90 && cur <= m.endDate; i += 1) {
          busySet.add(cur)
          cur = addDays(cur, 1)
        }
      }
      return json({ busyDays: Array.from(busySet) })
    }
    const validation = validateRentalDates(startDate ?? '', endDate ?? '')
    if (validation.error || !validation.totalDays)
      return fail(validation.error ?? 'Ngày thuê không hợp lệ.')
    if (!vehicle.pricePerDay)
      return fail('Giá thuê của xe chưa được cập nhật.', 409, 'PRICE_NOT_SET')
    const [slots, maints] = await Promise.all([
      payload.count({
        collection: 'rental-days',
        overrideAccess: Boolean(excludeBookingKey),
        where: {
          and: [
            { vehicle: { equals: id } },
            { day: { greater_than_equal: startDate, less_than: endDate } },
            ...(excludeBookingKey ? [{ bookingKey: { not_equals: excludeBookingKey } }] : []),
          ],
        },
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
    ])
    const hasMaintenanceConflict = maints.docs.some(
      (m) => m.startDate <= endDate! && m.endDate >= startDate!,
    )
    const deliveryRequested = ['1', 'true'].includes(params.get('delivery') ?? '')
    const addonKeys = parseAddonKeys(params.get('addons'))
    const baseQuote = calculateRentalQuote({
      startDate: startDate!,
      endDate: endDate!,
      dailyPrice: vehicle.pricePerDay,
      weeklyPrice: vehicle.pricePerWeek,
      monthlyPrice: vehicle.pricePerMonth,
      weekendSurcharge: vehicle.weekendSurcharge,
      holidaySurcharge: vehicle.holidaySurcharge,
      deliveryRequested,
      vehicleDeliveryFee: vehicle.deliveryFee,
      addonKeys,
      vehicleDeposit: vehicle.depositAmount,
    })

    const promoCodeParam = (params.get('promoCode') ?? '').trim().toUpperCase()
    let promoEval = null
    if (promoCodeParam) {
      const { evaluation } = await lookupAndEvaluatePromotion(payload, {
        code: promoCodeParam,
        serviceType: 'RENT',
        totalDays: baseQuote.totalDays,
        subtotalBeforePromo: baseQuote.estimatedTotal,
        alreadyHeldByCurrentBooking: existingBookingPromo === promoCodeParam,
      })
      promoEval = evaluation
    }

    const finalQuote = applyPromotionToQuote(baseQuote, promoEval)

    return json({
      available: slots.totalDocs === 0 && !hasMaintenanceConflict,
      ...finalQuote,
      promoCode: promoEval?.valid ? promoEval.promoCode : null,
      promoName: promoEval?.valid ? promoEval.promoName : null,
      promoStatus: promoEval?.status ?? null,
      promoMessage: promoEval?.valid ? promoEval.message : null,
      promoError: promoEval && !promoEval.valid ? promoEval.message : null,
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
