import { adminHasAnyPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import {
  getAIRuntimeConfig,
  mapGlobalDocToAISettings,
  normalizeRecommendationWeights,
  resolveEffectiveAIConfig,
} from '@/lib/ai/config'
import { checkCircuitBreaker } from '@/lib/ai/rate-limit'
import { MODEL_PRICING_PER_1M_USD } from '@/lib/ai/usage'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    if (
      !adminHasAnyPermission(admin, [
        ['ai', 'read'],
        ['settings', 'read'],
        ['reports', 'read'],
      ])
    ) {
      return fail('Tài khoản chưa được cấp quyền xem phân hệ Quản trị AI.', 403, 'FORBIDDEN')
    }

    const runtime = getAIRuntimeConfig()
    const circuit = checkCircuitBreaker()

    const [settingsDoc, logsRes, feedbackRes] = await Promise.all([
      payload
        .findGlobal({
          slug: 'ai-settings' as never,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null),
      payload
        .find({
          collection: 'ai-usage-logs' as never,
          overrideAccess: true,
          depth: 0,
          limit: 500,
          sort: '-createdAt',
        })
        .catch(() => ({ docs: [], totalDocs: 0 })),
      payload
        .find({
          collection: 'ai-feedback' as never,
          overrideAccess: true,
          depth: 0,
          limit: 100,
          sort: '-createdAt',
        })
        .catch(() => ({ docs: [], totalDocs: 0 })),
    ])

    const settings = mapGlobalDocToAISettings(settingsDoc as Record<string, unknown> | null)
    const effective = resolveEffectiveAIConfig(settings)

    const logs = logsRes.docs as unknown as Array<Record<string, unknown>>
    const feedbacks = feedbackRes.docs as unknown as Array<Record<string, unknown>>

    const chatLogs = logs.filter((l) => l.eventType === 'CHAT')
    const clickLogs = logs.filter((l) => l.eventType === 'VEHICLE_CLICK')
    const checkoutLogs = logs.filter((l) => l.eventType === 'CHECKOUT_HANDOFF')

    const totalRequests = chatLogs.length
    const successRequests = chatLogs.filter((l) => l.status === 'SUCCESS').length
    const failedRequests = chatLogs.filter((l) => l.status === 'ERROR').length
    const blockedRequests = chatLogs.filter((l) => l.status === 'BLOCKED').length
    const rateLimitedRequests = chatLogs.filter((l) => l.status === 'RATE_LIMITED').length

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalTokens = 0
    let totalEstimatedCostUsd = 0
    let todayEstimatedCostUsd = 0
    let totalRecommendedVehicles = 0
    const latencies: number[] = []
    const todayPrefix = new Date().toISOString().slice(0, 10)

    for (const l of chatLogs) {
      const inTok = Number(l.inputTokens ?? 0)
      const outTok = Number(l.outputTokens ?? 0)
      const totTok = Number(l.totalTokens ?? 0)
      const cost = Number(l.estimatedCostUsd ?? 0)
      const lat = Number(l.latencyMs ?? 0)
      if (Number.isFinite(inTok)) totalInputTokens += inTok
      if (Number.isFinite(outTok)) totalOutputTokens += outTok
      if (Number.isFinite(totTok)) totalTokens += totTok
      if (Number.isFinite(cost)) {
        totalEstimatedCostUsd += cost
        if (typeof l.createdAt === 'string' && l.createdAt.startsWith(todayPrefix)) {
          todayEstimatedCostUsd += cost
        }
      }
      if (Number.isFinite(lat) && lat > 0) latencies.push(lat)
      if (Array.isArray(l.recommendedModelSlugs)) {
        totalRecommendedVehicles += l.recommendedModelSlugs.length
      }
    }

    latencies.sort((a, b) => a - b)
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0
    const p95LatencyMs = latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]!
      : 0

    const helpfulCount = feedbacks.filter((f) => f.rating === 'HELPFUL').length
    const notHelpfulCount = feedbacks.filter((f) => f.rating === 'NOT_HELPFUL').length

    const sessionsWithRecommendations = new Set(
      chatLogs
        .filter((l) => Array.isArray(l.recommendedModelSlugs) && l.recommendedModelSlugs.length > 0)
        .map((l) => String(l.sessionHash ?? '')),
    )
    const checkoutConversionRate =
      sessionsWithRecommendations.size > 0
        ? Number(((checkoutLogs.length / sessionsWithRecommendations.size) * 100).toFixed(1))
        : null

    const budgetUtilizationPct =
      effective.dailyBudgetUsd > 0
        ? Number(((todayEstimatedCostUsd / effective.dailyBudgetUsd) * 100).toFixed(1))
        : 0

    const recentErrors = logs
      .filter((l) => l.status === 'ERROR' || l.status === 'BLOCKED' || l.status === 'RATE_LIMITED')
      .slice(0, 20)
      .map((l) => ({
        id: String(l.id),
        requestId: String(l.requestId ?? ''),
        status: String(l.status ?? ''),
        errorCode: typeof l.errorCode === 'string' ? l.errorCode : null,
        errorCategory: typeof l.errorCategory === 'string' ? l.errorCategory : null,
        guardrailTriggered: typeof l.guardrailTriggered === 'string' ? l.guardrailTriggered : null,
        querySummary: typeof l.querySummary === 'string' ? l.querySummary : null,
        createdAt: String(l.createdAt ?? ''),
      }))

    const noResultQueries = chatLogs
      .filter((l) => Boolean(l.noResultFound))
      .slice(0, 20)
      .map((l) => ({
        id: String(l.id),
        requestId: String(l.requestId ?? ''),
        intent: typeof l.intent === 'string' ? l.intent : null,
        querySummary: typeof l.querySummary === 'string' ? l.querySummary : 'Chưa lưu nội dung',
        createdAt: String(l.createdAt ?? ''),
      }))

    const feedbackItems = feedbacks.slice(0, 30).map((f) => ({
      id: String(f.id),
      requestId: String(f.requestId ?? ''),
      rating: String(f.rating ?? ''),
      reasonCategory: String(f.reasonCategory ?? 'OTHER'),
      comment: typeof f.comment === 'string' ? f.comment : null,
      recommendedSlugs: Array.isArray(f.recommendedSlugs) ? f.recommendedSlugs : [],
      userType: String(f.userType ?? 'GUEST'),
      reviewStatus: String(f.reviewStatus ?? 'NEW'),
      adminNote: typeof f.adminNote === 'string' ? f.adminNote : null,
      createdAt: String(f.createdAt ?? ''),
    }))

    return json({
      runtime: {
        envEnabled: runtime.envEnabled,
        provider: runtime.provider,
        model: runtime.model,
        apiKeyConfigured: runtime.apiKeyConfigured,
        testMockEnabled: runtime.testMockEnabled,
        storeConversations: runtime.storeConversations,
        timeoutMs: runtime.timeoutMs,
        hardCaps: {
          maxOutputTokens: runtime.maxOutputTokensCap,
          maxToolRounds: runtime.maxToolRoundsCap,
          rateLimitPerMinute: runtime.rateLimitPerMinuteCap,
          rateLimitPerDay: runtime.rateLimitPerDayCap,
          dailyBudgetUsd: runtime.dailyBudgetUsdCap,
        },
        circuitBreaker: circuit,
        pricingReferenceUsdPer1M:
          MODEL_PRICING_PER_1M_USD[runtime.model] ?? MODEL_PRICING_PER_1M_USD['gpt-4.1-mini'],
      },
      settings,
      effectiveConfig: {
        enabled: effective.enabled,
        configured: effective.configured,
        maxOutputTokens: effective.maxOutputTokens,
        maxToolRounds: effective.maxToolRounds,
        rateLimitPerMinute: effective.rateLimitPerMinute,
        rateLimitPerDay: effective.rateLimitPerDay,
        dailyBudgetUsd: effective.dailyBudgetUsd,
        weights: effective.weights,
      },
      stats: {
        totalRequests,
        successRequests,
        failedRequests,
        blockedRequests,
        rateLimitedRequests,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        avgLatencyMs,
        p95LatencyMs,
        totalRecommendedVehicles,
        vehicleClickCount: clickLogs.length,
        checkoutHandoffCount: checkoutLogs.length,
        checkoutConversionRate,
        totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
        todayEstimatedCostUsd: Number(todayEstimatedCostUsd.toFixed(6)),
        dailyBudgetUsd: effective.dailyBudgetUsd,
        budgetUtilizationPct,
        budgetWarning: budgetUtilizationPct >= 80,
        helpfulCount,
        notHelpfulCount,
        noResultCount: noResultQueries.length,
        costDisclaimer:
          'Chi phí hiển thị là số liệu ước tính phía NORI dựa trên token usage và bảng giá tham khảo của model. Chi phí thanh toán thực tế được ghi nhận chính thức tại OpenAI Platform.',
      },
      recentErrors,
      noResultQueries,
      feedbackItems,
      canUpdate: adminHasAnyPermission(admin, [
        ['ai', 'update'],
        ['settings', 'update'],
      ]),
    })
  } catch (error) {
    return apiError(error, { route: 'nori-api/dashboard/ai' })
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    if (
      !adminHasAnyPermission(admin, [
        ['ai', 'update'],
        ['settings', 'update'],
      ])
    ) {
      return fail('Tài khoản chưa được cấp quyền cập nhật cấu hình Trợ lý AI.', 403, 'FORBIDDEN')
    }

    // Strict allowlist: NEVER allows apiKey / OPENAI_API_KEY mutation through dashboard
    const data = await body(
      request,
      [
        'action',
        'feedbackId',
        'reviewStatus',
        'adminNote',
        'enabled',
        'greetingMessage',
        'quickSuggestions',
        'maxOutputTokens',
        'maxToolRounds',
        'rateLimitPerMinute',
        'rateLimitPerDay',
        'dailyBudgetUsd',
        'weights',
        'knowledgeNote',
      ],
      16_000,
    )

    // Action A: Review customer AI feedback item
    if (data.action === 'review_feedback') {
      const feedbackId = text(data.feedbackId, 80)
      const reviewStatus = text(data.reviewStatus, 20).toUpperCase()
      if (!feedbackId || !['NEW', 'REVIEWED', 'RESOLVED'].includes(reviewStatus)) {
        return fail('Thông tin cập nhật trạng thái phản hồi không hợp lệ.')
      }
      const adminNote = text(data.adminNote, 500)
      await payload.update({
        collection: 'ai-feedback' as never,
        id: feedbackId,
        overrideAccess: true,
        data: {
          reviewStatus,
          adminNote,
        } as never,
      })
      return json({ message: 'Đã cập nhật trạng thái rà soát phản hồi AI.' })
    }

    // Action B: Update AI Assistant operational settings
    const runtime = getAIRuntimeConfig()
    const patch: Record<string, unknown> = {
      updatedByEmail: admin.email,
    }

    if (data.enabled !== undefined) {
      patch.enabled = Boolean(data.enabled)
    }
    if (data.greetingMessage !== undefined) {
      const msg = text(data.greetingMessage, 500)
      if (!msg) return fail('Lời chào Trợ lý AI không được để trống.')
      patch.greetingMessage = msg
    }
    if (data.quickSuggestions !== undefined) {
      if (!Array.isArray(data.quickSuggestions)) {
        return fail('Danh sách Quick Suggestions không hợp lệ.')
      }
      const cleaned = data.quickSuggestions
        .slice(0, 8)
        .map((item) => {
          const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          return {
            label: text(rec.label, 80),
            prompt: text(rec.prompt, 240),
          }
        })
        .filter((item) => item.label && item.prompt)
      patch.quickSuggestions = cleaned
    }
    if (data.maxOutputTokens !== undefined) {
      const n = Number(data.maxOutputTokens)
      if (!Number.isSafeInteger(n) || n < 200 || n > runtime.maxOutputTokensCap) {
        return fail(
          `Giới hạn output tokens phải nằm trong khoảng 200 – ${runtime.maxOutputTokensCap} (giới hạn máy chủ).`,
        )
      }
      patch.maxOutputTokens = n
    }
    if (data.maxToolRounds !== undefined) {
      const n = Number(data.maxToolRounds)
      if (!Number.isSafeInteger(n) || n < 1 || n > runtime.maxToolRoundsCap) {
        return fail(`Số vòng Function Calling tối đa phải từ 1 đến ${runtime.maxToolRoundsCap}.`)
      }
      patch.maxToolRounds = n
    }
    if (data.rateLimitPerMinute !== undefined) {
      const n = Number(data.rateLimitPerMinute)
      if (!Number.isSafeInteger(n) || n < 1 || n > runtime.rateLimitPerMinuteCap) {
        return fail(
          `Giới hạn yêu cầu mỗi phút phải từ 1 đến ${runtime.rateLimitPerMinuteCap} (giới hạn máy chủ).`,
        )
      }
      patch.rateLimitPerMinute = n
    }
    if (data.rateLimitPerDay !== undefined) {
      const n = Number(data.rateLimitPerDay)
      if (!Number.isSafeInteger(n) || n < 1 || n > runtime.rateLimitPerDayCap) {
        return fail(
          `Giới hạn yêu cầu mỗi ngày phải từ 1 đến ${runtime.rateLimitPerDayCap} (giới hạn máy chủ).`,
        )
      }
      patch.rateLimitPerDay = n
    }
    if (data.dailyBudgetUsd !== undefined) {
      const n = Number(data.dailyBudgetUsd)
      if (!Number.isFinite(n) || n < 0.5 || n > runtime.dailyBudgetUsdCap) {
        return fail(
          `Ngân sách tối đa mỗi ngày phải nằm trong khoảng $0.50 – $${runtime.dailyBudgetUsdCap} USD.`,
        )
      }
      patch.dailyBudgetUsd = Number(n.toFixed(2))
    }
    if (data.weights !== undefined && data.weights && typeof data.weights === 'object') {
      const w = data.weights as Record<string, unknown>
      const normalized = normalizeRecommendationWeights({
        budget: Number(w.budget),
        purpose: Number(w.purpose),
        capacity: Number(w.capacity),
        rating: Number(w.rating),
        fuel: Number(w.fuel),
      })
      patch.weightBudget = normalized.budget
      patch.weightPurpose = normalized.purpose
      patch.weightCapacity = normalized.capacity
      patch.weightRating = normalized.rating
      patch.weightFuel = normalized.fuel
    }
    if (data.knowledgeNote !== undefined) {
      patch.knowledgeNote = text(data.knowledgeNote, 3000)
    }

    await payload.updateGlobal({
      slug: 'ai-settings' as never,
      overrideAccess: true,
      data: patch as never,
    })

    await payload
      .create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'ai.settings_update',
          entity: 'ai-settings',
          entityId: 'ai-settings',
          entityLabel: 'Cấu hình Trợ lý AI NORI',
          summary: `Admin ${admin.email} cập nhật cấu hình AI Assistant (enabled=${String(patch.enabled ?? 'unchanged')})`,
          fromStatus: 'CONFIG',
          toStatus: patch.enabled === false ? 'DISABLED' : 'ENABLED',
          actorType: 'ADMIN',
          actorId: admin.id,
          actorEmail: admin.email,
        },
      })
      .catch(() => null)

    return json({
      message: 'Đã lưu cấu hình Trợ lý AI NORI thành công.',
    })
  } catch (error) {
    return apiError(error, { route: 'nori-api/dashboard/ai' })
  }
}
