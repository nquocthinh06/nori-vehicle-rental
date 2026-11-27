import crypto from 'node:crypto'
import { getAIRuntimeConfig } from '@/lib/ai/config'
import { hashSessionIdentifier, recordAIUsageLog } from '@/lib/ai/usage'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { extractClientIp } from '@/lib/session-cookie'

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'ai-event', 60, 60_000)

    const data = await body(request, ['eventType', 'modelSlug', 'requestId', 'sessionId'], 2000)
    const eventType = text(data.eventType, 30).toUpperCase()
    if (eventType !== 'VEHICLE_CLICK' && eventType !== 'CHECKOUT_HANDOFF') {
      return fail('Loại sự kiện theo dõi không hợp lệ.')
    }

    const modelSlug = text(data.modelSlug, 120)
    if (!modelSlug || !/^[a-z0-9-]+$/i.test(modelSlug)) {
      return fail('Slug phương tiện không hợp lệ.')
    }

    const [payload, currentUser] = await Promise.all([
      getPayloadClient(),
      appAuth.currentUser().catch(() => null),
    ])

    const runtime = getAIRuntimeConfig()
    const ip = extractClientIp(request.headers)
    const sessionRaw = currentUser
      ? `user:${currentUser.id}`
      : text(data.sessionId, 64)
        ? `sess:${ip}:${text(data.sessionId, 64)}`
        : `ip:${ip}`

    await recordAIUsageLog(payload, {
      requestId: `evt-${crypto.randomUUID().slice(0, 12)}`,
      eventType,
      status: 'SUCCESS',
      provider: runtime.provider,
      model: runtime.model,
      userType: currentUser ? 'CUSTOMER' : 'GUEST',
      userId: currentUser ? String(currentUser.id) : null,
      sessionHash: hashSessionIdentifier(sessionRaw),
      intent: eventType,
      clickedModelSlug: modelSlug,
    })

    return json({ recorded: true })
  } catch (error) {
    return apiError(error, { route: 'nori-api/ai/event' })
  }
}
