import { redactSensitiveData } from '@/lib/ai/guardrails'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'

const ALLOWED_REASONS = new Set([
  'ACCURATE',
  'WRONG_PRICE',
  'WRONG_RECOMMENDATION',
  'UNAVAILABLE_VEHICLE',
  'INCOMPLETE_INFO',
  'OTHER',
])

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'ai-feedback', 20, 60_000)

    const data = await body(
      request,
      ['requestId', 'rating', 'reasonCategory', 'comment', 'recommendedSlugs'],
      4000,
    )

    const requestId = text(data.requestId, 60)
    if (!requestId || !/^[a-zA-Z0-9_-]{4,60}$/.test(requestId)) {
      return fail('Mã yêu cầu AI không hợp lệ.')
    }

    const rating = text(data.rating, 20).toUpperCase()
    if (rating !== 'HELPFUL' && rating !== 'NOT_HELPFUL') {
      return fail('Đánh giá phải là HELPFUL hoặc NOT_HELPFUL.')
    }

    const rawReason = text(data.reasonCategory, 40).toUpperCase()
    const reasonCategory = ALLOWED_REASONS.has(rawReason)
      ? rawReason
      : rating === 'HELPFUL'
        ? 'ACCURATE'
        : 'OTHER'

    const commentRaw = text(data.comment, 500)
    const comment = commentRaw ? redactSensitiveData(commentRaw, 500) : undefined

    const recommendedSlugs = Array.isArray(data.recommendedSlugs)
      ? data.recommendedSlugs
          .map((s) => text(s, 100))
          .filter(Boolean)
          .slice(0, 6)
      : []

    const [payload, currentUser] = await Promise.all([
      getPayloadClient(),
      appAuth.currentUser().catch(() => null),
    ])

    const created = (await payload.create({
      collection: 'ai-feedback' as never,
      overrideAccess: true,
      data: {
        requestId,
        rating,
        reasonCategory,
        comment,
        recommendedSlugs,
        userType: currentUser ? 'CUSTOMER' : 'GUEST',
        reviewStatus: 'NEW',
      } as never,
    })) as unknown as { id?: string }

    return json(
      {
        id: String(created.id ?? ''),
        message: 'Cảm ơn phản hồi của bạn! NORI sẽ dùng đánh giá này để cải thiện Trợ lý AI.',
      },
      201,
    )
  } catch (error) {
    return apiError(error, { route: 'nori-api/ai/feedback' })
  }
}
