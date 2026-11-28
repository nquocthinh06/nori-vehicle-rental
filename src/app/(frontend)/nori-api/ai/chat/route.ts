import { AI_FALLBACK_LINKS, mapToNoriAIError } from '@/lib/ai/errors'
import { runNoriAIChat } from '@/lib/ai/orchestrator'
import { apiError, assertOrigin, body, createRequestLogger, json } from '@/lib/api-utils'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { extractClientIp } from '@/lib/session-cookie'

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/ai/chat', request)
  try {
    assertOrigin(request)
    const data = await body(request, ['message', 'history', 'sessionId'], 18_000)

    const [payload, currentUser] = await Promise.all([
      getPayloadClient(),
      appAuth.currentUser().catch(() => null),
    ])

    const ip = extractClientIp(request.headers)
    const clientSessionId =
      typeof data.sessionId === 'string' && data.sessionId.trim()
        ? data.sessionId.trim().slice(0, 64)
        : ''
    const sessionKey = currentUser
      ? `user:${currentUser.id}`
      : clientSessionId
        ? `sess:${ip}:${clientSessionId}`
        : `ip:${ip}`

    const result = await runNoriAIChat({
      payload,
      message: data.message,
      history: data.history,
      sessionKey,
      ipKey: ip,
      user: currentUser ? { id: String(currentUser.id), collection: 'users' } : null,
      userRole: currentUser ? 'CUSTOMER' : 'GUEST',
      signal: request.signal,
    })

    logger.logSuccess(200, {
      status: result.status,
      intent: result.intent,
      cards: result.vehicleCards.length,
      tokens: result.usage.totalTokens,
    })
    return json(result, 200, logger.responseHeaders())
  } catch (error) {
    const mapped = mapToNoriAIError(error)
    // Preserve clean structured fallback payload for AI-specific failures
    if (mapped.code !== 'AI_PROVIDER_ERROR' || error instanceof Error) {
      logger.logError(mapped.code, mapped.status, mapped.message)
      return Response.json(
        {
          success: false,
          error: {
            message: mapped.userMessage,
            code: mapped.code,
            retryable: mapped.retryable,
            fallbackLinks: AI_FALLBACK_LINKS,
          },
        },
        {
          status: mapped.status === 499 ? 499 : mapped.status,
          headers: {
            'Cache-Control': 'private, no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
            Vary: 'Cookie',
            ...logger.responseHeaders(),
          },
        },
      )
    }
    return apiError(error, { logger, route: 'nori-api/ai/chat' })
  }
}
