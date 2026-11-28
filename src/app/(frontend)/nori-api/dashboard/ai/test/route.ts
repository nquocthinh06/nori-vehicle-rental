import crypto from 'node:crypto'
import { adminHasAnyPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { getAIRuntimeConfig } from '@/lib/ai/config'
import { getGeminiRuntimeHealthSnapshot } from '@/lib/ai/gemini'
import { resolveAIProvider } from '@/lib/ai/provider'
import type { AIConnectionStatus } from '@/lib/ai/types'
import { hashSessionIdentifier, recordAIUsageLog } from '@/lib/ai/usage'
import { apiError, assertOrigin, assertRateLimit, fail, json } from '@/lib/api-utils'

const TEST_STATUS_LABELS: Record<AIConnectionStatus, string> = {
  GEMINI_CONNECTED: 'Gemini Connected',
  FALLBACK_ACTIVE: 'Fallback Active',
  API_CONFIG_MISSING: 'API Configuration Missing',
  QUOTA_EXCEEDED: 'Quota Exceeded',
  CONNECTION_ERROR: 'Connection Error',
  DISABLED: 'Disabled',
  MOCK_ACTIVE: 'Mock Provider Active',
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    assertRateLimit(request, 'ai-admin-test', 6, 60_000)

    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    if (
      !adminHasAnyPermission(admin, [
        ['ai', 'update'],
        ['settings', 'update'],
      ])
    ) {
      return fail('Tài khoản chưa được cấp quyền kiểm tra kết nối API AI.', 403, 'FORBIDDEN')
    }

    const runtime = getAIRuntimeConfig()
    if (!runtime.apiKeyConfigured && !runtime.testMockEnabled) {
      const expectedVar = runtime.provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
      return json({
        ok: false,
        provider: runtime.provider,
        model: runtime.model,
        latencyMs: 0,
        connectionStatus: 'API_CONFIG_MISSING' as AIConnectionStatus,
        connectionStatusLabel: TEST_STATUS_LABELS.API_CONFIG_MISSING,
        fallbackActive: runtime.fallbackEnabled,
        message: `Biến môi trường ${expectedVar} chưa được cấu hình trên máy chủ.${runtime.fallbackEnabled ? ' Website đang dùng Chế độ tư vấn cơ bản (Fallback Active).' : ''}`,
      })
    }

    const provider = resolveAIProvider()
    const pingRes = await provider.ping({
      model: runtime.model,
      timeoutMs: Math.min(runtime.timeoutMs, 15_000),
    })

    const health = getGeminiRuntimeHealthSnapshot()
    const connectionStatus: AIConnectionStatus = pingRes.ok
      ? runtime.testMockEnabled
        ? 'MOCK_ACTIVE'
        : 'GEMINI_CONNECTED'
      : health.lastStatus === 'QUOTA_EXCEEDED'
        ? 'QUOTA_EXCEEDED'
        : 'CONNECTION_ERROR'

    await recordAIUsageLog(payload, {
      requestId: `ping-${crypto.randomUUID().slice(0, 10)}`,
      eventType: 'CONNECTION_TEST',
      status: pingRes.ok ? 'SUCCESS' : 'ERROR',
      provider: provider.name,
      model: pingRes.model,
      userType: 'ADMIN',
      userId: admin.id,
      sessionHash: hashSessionIdentifier(`admin:${admin.id}`),
      latencyMs: pingRes.latencyMs,
      errorCode: pingRes.ok
        ? null
        : connectionStatus === 'QUOTA_EXCEEDED'
          ? 'AI_QUOTA_EXCEEDED'
          : 'CONNECTION_TEST_FAILED',
    })

    return json({
      ok: pingRes.ok,
      provider: provider.name,
      model: pingRes.model,
      latencyMs: pingRes.latencyMs,
      connectionStatus,
      connectionStatusLabel: TEST_STATUS_LABELS[connectionStatus],
      fallbackActive: !pingRes.ok && runtime.fallbackEnabled,
      message: pingRes.message,
    })
  } catch (error) {
    return apiError(error, { route: 'nori-api/dashboard/ai/test' })
  }
}
