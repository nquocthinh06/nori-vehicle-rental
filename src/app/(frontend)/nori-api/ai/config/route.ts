import { getAIRuntimeConfig } from '@/lib/ai/config'
import { AI_FALLBACK_LINKS } from '@/lib/ai/errors'
import { loadResolvedAIConfig } from '@/lib/ai/orchestrator'
import { apiError, createRequestLogger, json } from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'

/**
 * Public safe AI Assistant configuration endpoint.
 * NEVER exposes API keys, internal server caps, or operational secrets.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/ai/config', request)
  try {
    const payload = await getPayloadClient()
    const config = await loadResolvedAIConfig(payload)
    const runtime = getAIRuntimeConfig()

    logger.logSuccess(200, { enabled: config.enabled, configured: config.configured })
    return json(
      {
        enabled: config.enabled,
        configured: config.configured,
        ready: config.enabled && config.configured,
        provider: runtime.testMockEnabled ? 'mock' : config.provider,
        greetingMessage: config.greetingMessage,
        quickSuggestions: config.quickSuggestions,
        fallbackLinks: AI_FALLBACK_LINKS,
        statusMessage: !config.enabled
          ? 'Trợ lý AI hiện đang tạm tắt bởi quản trị viên.'
          : !config.configured
            ? 'Trợ lý AI chưa được cấu hình API Key trên máy chủ. Bạn vẫn có thể tìm xe qua bộ lọc và đặt xe bình thường.'
            : null,
      },
      200,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/ai/config' })
  }
}
