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

    const ready = config.enabled && (config.configured || config.fallbackEnabled)
    const fallbackActive = config.enabled && !config.configured && config.fallbackEnabled

    logger.logSuccess(200, {
      enabled: config.enabled,
      configured: config.configured,
      fallbackActive,
    })
    return json(
      {
        enabled: config.enabled,
        configured: config.configured,
        ready,
        fallbackEnabled: config.fallbackEnabled,
        fallbackActive,
        freeTierOnly: config.freeTierOnly,
        provider: runtime.testMockEnabled ? 'mock' : config.provider,
        model: config.model,
        greetingMessage: config.greetingMessage,
        quickSuggestions: config.quickSuggestions,
        fallbackLinks: AI_FALLBACK_LINKS,
        statusMessage: !config.enabled
          ? 'Trợ lý AI hiện đang tạm tắt bởi quản trị viên.'
          : fallbackActive
            ? 'Đang chạy ở chế độ tư vấn cơ bản (Rule-based Engine) do chưa cấu hình API Key AI trên máy chủ.'
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
