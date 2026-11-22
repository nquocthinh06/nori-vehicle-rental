import { getPayloadClient } from '@/lib/payload'
import { assertOrigin, assertRateLimit, createRequestLogger } from '@/lib/api-utils'
import { classifyUnexpectedError } from '@/lib/error-classifier'
import { processProviderWebhook } from '@/lib/payment-service'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
}

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/payments/webhook/sepay', request)
  try {
    // Only apply browser Origin CSRF check if the request came from a browser CORS context;
    // server-to-server SePay webhook requests authenticate via `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>`.
    if (request.headers.get('sec-fetch-mode') === 'cors') {
      assertOrigin(request)
    }
    assertRateLimit(request, 'sepay-webhook', 120, 60_000)

    const rawBody = await request.text()
    let parsedBody: unknown = null
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      logger.logError('INVALID_JSON', 400, 'Malformed webhook JSON payload')
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_JSON', message: 'Nội dung JSON Webhook không hợp lệ.' },
        },
        { status: 400, headers: { ...NO_STORE_HEADERS, ...logger.responseHeaders() } },
      )
    }

    const payload = await logger.time('payload', () => getPayloadClient())
    const result = await logger.time('process_webhook', () =>
      processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: request.headers,
        rawBody,
        parsedBody,
      }),
    )

    if (result.httpStatus >= 400) {
      logger.logError(
        String((result.body.error as { code?: unknown } | undefined)?.code ?? 'WEBHOOK_REJECTED'),
        result.httpStatus,
        'Webhook rejected',
      )
    } else {
      logger.logSuccess(result.httpStatus, {
        duplicate: Boolean(result.body.duplicate),
        eventId: result.body.eventId ? String(result.body.eventId) : null,
      })
    }

    return Response.json(result.body, {
      status: result.httpStatus,
      headers: { ...NO_STORE_HEADERS, ...logger.responseHeaders() },
    })
  } catch (error) {
    const classified = classifyUnexpectedError(error)
    logger.logError(classified.category, classified.status, classified.summary)
    return Response.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_INTERNAL_ERROR',
          message: 'Máy chủ chưa thể xử lý sự kiện Webhook. Vui lòng thử lại.',
        },
      },
      { status: 500, headers: { ...NO_STORE_HEADERS, ...logger.responseHeaders() } },
    )
  }
}
