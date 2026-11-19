import { getPayloadClient } from '@/lib/payload'
import { assertOrigin, assertRateLimit } from '@/lib/api-utils'
import { processProviderWebhook } from '@/lib/payment-service'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
}

export async function POST(request: Request) {
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
      return Response.json(
        {
          success: false,
          error: { code: 'INVALID_JSON', message: 'Nội dung JSON Webhook không hợp lệ.' },
        },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    const payload = await getPayloadClient()
    const result = await processProviderWebhook({
      payload,
      providerName: 'SEPAY',
      headers: request.headers,
      rawBody,
      parsedBody,
    })

    return Response.json(result.body, {
      status: result.httpStatus,
      headers: NO_STORE_HEADERS,
    })
  } catch (error) {
    console.error('[NORI Webhook Error]:', error)
    return Response.json(
      {
        success: false,
        error: {
          code: 'WEBHOOK_INTERNAL_ERROR',
          message: 'Máy chủ chưa thể xử lý sự kiện Webhook. Vui lòng thử lại.',
        },
      },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
