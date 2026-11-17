import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
import { relationId } from '@/lib/rental-rules'
import type { ReviewView } from '@/lib/domain-types'

export async function GET(request: Request) {
  try {
    const modelId = new URL(request.url).searchParams.get('model')
    if (!modelId) return fail('Vui lòng chọn dòng xe.')
    const payload = await getPayloadClient()
    const [reviewsResult, user] = await Promise.all([
      payload.find({
        collection: 'reviews',
        overrideAccess: false,
        depth: 1,
        limit: 50,
        sort: '-createdAt',
        where: { model: { equals: modelId } },
      }),
      appAuth.currentUser(),
    ])
    const reviews: ReviewView[] = reviewsResult.docs.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title ?? null,
      comment: r.comment,
      customerName:
        typeof r.customer === 'object' && r.customer ? r.customer.fullName : 'Khách hàng NORI',
      vehicleReference: typeof r.vehicle === 'object' && r.vehicle ? r.vehicle.reference : null,
      createdAt: r.createdAt,
    }))

    let eligibleBookings: {
      id: string
      bookingKey: string
      reference: string
      startDate: string
      endDate: string
    }[] = []
    if (user) {
      const completed = await payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 50,
        where: { status: { equals: 'COMPLETED' } },
      })
      const reviewedBookingIds = new Set(
        reviewsResult.docs.map((r) => relationId(r.booking)).filter(Boolean),
      )
      eligibleBookings = completed.docs
        .filter((b) => {
          const vehicleObj = typeof b.vehicle === 'object' ? b.vehicle : null
          const bModelId = vehicleObj ? relationId(vehicleObj.model) : undefined
          return bModelId === modelId && !reviewedBookingIds.has(b.id)
        })
        .map((b) => ({
          id: b.id,
          bookingKey: b.bookingKey ?? b.id,
          reference: b.vehicleReferenceSnapshot ?? '',
          startDate: b.startDate,
          endDate: b.endDate,
        }))
    }

    return json({ reviews, eligibleBookings })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'reviews-create', 40, 60_000)
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập để gửi đánh giá.', 401, 'UNAUTHORIZED')
    const data = await body(request, ['booking', 'model', 'rating', 'title', 'comment'])
    const bookingId = text(data.booking, 100)
    const rating = Number(data.rating)
    const title = text(data.title, 120)
    const comment = text(data.comment, 1000)
    if (!bookingId) return fail('Vui lòng chọn chuyến thuê đã hoàn thành.')
    if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5)
      return fail('Điểm đánh giá cần từ 1 đến 5 sao.')
    if (comment.length < 5) return fail('Vui lòng nhập nhận xét tối thiểu 5 ký tự.')

    const payload = await getPayloadClient()
    const created = await payload.create({
      collection: 'reviews',
      user,
      overrideAccess: false,
      depth: 1,
      data: {
        booking: bookingId,
        model: text(data.model, 100),
        rating,
        title: title || undefined,
        comment,
      },
    })
    return json(
      {
        id: created.id,
        rating: created.rating,
        title: created.title ?? null,
        comment: created.comment,
        customerName: user.fullName,
        vehicleReference:
          typeof created.vehicle === 'object' && created.vehicle ? created.vehicle.reference : null,
        createdAt: created.createdAt,
      },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}
