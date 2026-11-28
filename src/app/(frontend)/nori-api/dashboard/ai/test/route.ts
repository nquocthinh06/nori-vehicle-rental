import crypto from 'node:crypto'
import { adminHasAnyPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { getAIRuntimeConfig } from '@/lib/ai/config'
import { resolveAIProvider } from '@/lib/ai/provider'
import { hashSessionIdentifier, recordAIUsageLog } from '@/lib/ai/usage'
import { apiError, assertOrigin, assertRateLimit, fail, json } from '@/lib/api-utils'

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
        message: `Biến môi trường ${expectedVar} chưa được cấu hình trên máy chủ.${runtime.fallbackEnabled ? ' Website đang dùng Chế độ tư vấn cơ bản (Rule-based Engine).' : ''}`,
      })
    }

    const provider = resolveAIProvider()
    const pingRes = await provider.ping({
      model: runtime.model,
      timeoutMs: Math.min(runtime.timeoutMs, 15_000),
    })

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
      errorCode: pingRes.ok ? null : 'CONNECTION_TEST_FAILED',
    })

    return json({
      ok: pingRes.ok,
      provider: provider.name,
      model: pingRes.model,
      latencyMs: pingRes.latencyMs,
      message: pingRes.message,
    })
  } catch (error) {
    return apiError(error, { route: 'nori-api/dashboard/ai/test' })
  }
}
