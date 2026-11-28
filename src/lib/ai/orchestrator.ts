import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { mapGlobalDocToAISettings, resolveEffectiveAIConfig } from './config.ts'
import { AI_FALLBACK_LINKS, mapToNoriAIError, NoriAIError, sanitizeErrorMessage } from './errors.ts'
import { runRuleBasedFallback } from './fallback.ts'
import {
  evaluateInputGuardrails,
  sanitizeAssistantOutput,
  validateAndSanitizeChatInput,
} from './guardrails.ts'
import { analyzeConversationTurn } from './nlu.ts'
import { resolveAIProvider } from './provider.ts'
import {
  acquireAIConcurrencySlot,
  checkAndConsumeMultiScopeModelCall,
  checkCircuitBreaker,
  checkDailyBudget,
  recordCircuitFailure,
  recordCircuitSuccess,
  recordDailyBudgetSpend,
} from './rate-limit.ts'
import { buildNoriSystemPrompt } from './system-prompt.ts'
import { executeAllowedTool, getAllowedToolDefinitions } from './tool-registry.ts'
import type {
  AIBookingHandoff,
  AIChatResponsePayload,
  AIComparisonTable,
  AIPolicyCitation,
  AIProvider,
  AIProviderInputItem,
  AIQuoteSummary,
  AIResolvedConfig,
  AISessionContextSummary,
  AIUserRole,
  AIVehicleCard,
  NoriAIIntent,
} from './types.ts'
import { estimateTokenCostUsd, hashSessionIdentifier, recordAIUsageLog } from './usage.ts'

const STANDARD_DISCLAIMER =
  'Thông tin khả dụng và báo giá từ Trợ lý AI mang tính tham khảo tại thời điểm tra cứu. Đơn thuê chính thức chỉ được xác nhận sau khi bạn hoàn tất bước Checkout trên NORI.'

export async function loadResolvedAIConfig(payload: Payload): Promise<AIResolvedConfig> {
  try {
    const doc = (await payload.findGlobal({
      slug: 'ai-settings' as never,
      overrideAccess: true,
      depth: 0,
    })) as unknown as Record<string, unknown> | null
    return resolveEffectiveAIConfig(mapGlobalDocToAISettings(doc))
  } catch {
    return resolveEffectiveAIConfig(null)
  }
}

async function getTodayRecordedSpendUsd(payload: Payload): Promise<number> {
  try {
    const todayPrefix = new Date().toISOString().slice(0, 10)
    const res = await payload.find({
      collection: 'ai-usage-logs' as never,
      overrideAccess: true,
      depth: 0,
      limit: 500,
      where: {
        and: [
          { eventType: { equals: 'CHAT' } },
          { createdAt: { greater_than_equal: `${todayPrefix}T00:00:00.000Z` } },
        ],
      },
      select: { estimatedCostUsd: true } as never,
    })
    let total = 0
    for (const doc of res.docs as unknown as Array<{ estimatedCostUsd?: number }>) {
      if (typeof doc.estimatedCostUsd === 'number' && Number.isFinite(doc.estimatedCostUsd)) {
        total += doc.estimatedCostUsd
      }
    }
    return Number(total.toFixed(6))
  } catch {
    return 0
  }
}

function deriveCanonicalIntent(toolsCalled: string[], nluIntent: NoriAIIntent): string {
  if (toolsCalled.includes('prepareBooking')) return 'BOOKING_GUIDANCE'
  if (toolsCalled.includes('getCustomerBookingStatus')) return 'BOOKING_STATUS'
  if (toolsCalled.includes('getPurchaseConsultationInfo')) return 'PURCHASE_CONSULTATION'
  if (toolsCalled.includes('calculateRentalPrice')) return 'PRICE_QUOTE'
  if (toolsCalled.includes('checkAvailability')) return 'AVAILABILITY_CHECK'
  if (toolsCalled.includes('compareVehicles')) return 'VEHICLE_COMPARISON'
  if (toolsCalled.includes('getActivePromotions')) return 'PROMOTION_QUERY'
  if (toolsCalled.includes('getRentalPolicy')) return 'RENTAL_POLICY'
  if (toolsCalled.includes('recommendVehicles')) return 'VEHICLE_RECOMMENDATION'
  if (toolsCalled.includes('searchVehicles')) {
    return nluIntent === 'BRAND_LOOKUP' ? 'BRAND_LOOKUP' : 'VEHICLE_RECOMMENDATION'
  }
  if (toolsCalled.includes('getVehicleDetails')) {
    return nluIntent === 'PRICE_QUOTE' ? 'PRICE_QUOTE' : 'VEHICLE_LOOKUP'
  }
  return nluIntent
}

function buildFollowUpSuggestions(params: {
  intent: string
  cards: AIVehicleCard[]
  hasQuote: boolean
  sessionContext?: AISessionContextSummary
}): string[] {
  const first = params.cards[0]
  if (params.intent === 'VEHICLE_LOOKUP' && !first) {
    if (params.sessionContext?.category === 'CAR') {
      return [
        'Tư vấn xe ô tô 7 chỗ đang có tại NORI',
        'Có xe Toyota Fortuner hoặc Mitsubishi Xpander không?',
        'Xem các mã khuyến mãi đang hiệu lực',
      ]
    }
    return [
      'Tư vấn xe ô tô gia đình 7 chỗ dưới 1.5 triệu/ngày',
      'Gợi ý xe máy tay ga đi phố dưới 200k',
      'Chính sách đặt cọc & giấy tờ thuê xe',
    ]
  }
  if (
    params.intent === 'VEHICLE_LOOKUP' ||
    params.intent === 'BRAND_LOOKUP' ||
    params.intent === 'VEHICLE_RECOMMENDATION'
  ) {
    const out: string[] = []
    if (first) {
      out.push(`Kiểm tra lịch trống và tính giá thuê ${first.name} 3 ngày từ ngày mai`)
    }
    if (params.cards.length >= 2) {
      out.push(`So sánh ${params.cards[0]!.name} và ${params.cards[1]!.name}`)
    } else if (first) {
      out.push('Thuê 3 ngày thì sao?')
    }
    out.push('Hiện có mã khuyến mãi nào áp dụng được không?')
    return out.slice(0, 3)
  }
  if (params.hasQuote && first) {
    return [
      `Chuẩn bị đặt thuê ${first.name} theo lịch vừa tính`,
      'Quy định đặt cọc và hủy đơn thế nào?',
    ]
  }
  return [
    'Tư vấn xe gia đình 7 chỗ dưới 1.5 triệu/ngày',
    'Xem các mã khuyến mãi đang hiệu lực',
    'Chính sách đặt cọc & giấy tờ thuê xe',
  ]
}

export async function runNoriAIChat(params: {
  payload: Payload
  message: unknown
  history?: unknown
  sessionKey: string
  ipKey?: string | null
  user: { id: string; collection: string } | null
  userRole: AIUserRole
  providerOverride?: AIProvider
  signal?: AbortSignal
}): Promise<AIChatResponsePayload> {
  const startedAt = performance.now()
  const requestId = `ai-${crypto.randomUUID().slice(0, 12)}`
  const sessionHash = hashSessionIdentifier(params.sessionKey)
  const ipHash = params.ipKey ? hashSessionIdentifier(`ip:${params.ipKey}`) : null

  const config = await loadResolvedAIConfig(params.payload)

  // 1. Validate message & history size before any work
  const validated = validateAndSanitizeChatInput({
    message: params.message,
    history: params.history,
  })
  if (!validated.ok) {
    throw new NoriAIError({
      code: validated.code,
      status: 400,
      retryable: false,
      userMessage: validated.error,
    })
  }

  // 2. Check Admin / env toggle
  if (!config.enabled) {
    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'DISABLED',
      provider: config.provider,
      model: config.model,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      intent: 'AI_DISABLED',
      latencyMs: Math.round(performance.now() - startedAt),
    })
    return {
      requestId,
      reply:
        'Trợ lý AI NORI hiện đang tạm tắt bởi quản trị viên. Bạn vẫn có thể tìm xe bằng bộ lọc, kiểm tra lịch trực tiếp và đặt thuê bình thường trên NORI.',
      status: 'DISABLED',
      mode: 'DISABLED',
      intent: 'AI_DISABLED',
      vehicleCards: [],
      comparison: null,
      quote: null,
      bookingHandoff: null,
      citations: [],
      toolsCalled: [],
      followUpSuggestions: [],
      fallbackLinks: AI_FALLBACK_LINKS,
      usage: { totalTokens: 0, latencyMs: Math.round(performance.now() - startedAt) },
      disclaimer: STANDARD_DISCLAIMER,
    }
  }

  // Pre-analyze NLU & multi-turn session context (isolated strictly to this request's validated history)
  const nluAnalysis = analyzeConversationTurn({
    message: validated.message,
    history: validated.history,
  })

  const executeAndLogFallback = async (
    reasonCode: string,
    reasonMessage: string,
    extraUsage?: {
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      priorTools?: string[]
      errorDetail?: string
    },
  ): Promise<AIChatResponsePayload> => {
    let fb: Awaited<ReturnType<typeof runRuleBasedFallback>>
    try {
      fb = await runRuleBasedFallback({
        payload: params.payload,
        requestId,
        message: validated.message,
        history: validated.history,
        config,
        user: params.user,
        reasonCode,
        reasonMessage,
        startedAt,
        disclaimer: STANDARD_DISCLAIMER,
        fallbackLinks: AI_FALLBACK_LINKS,
        buildFollowUps: buildFollowUpSuggestions,
      })
    } catch (fbErr) {
      const mappedFbErr = mapToNoriAIError(fbErr)
      await recordAIUsageLog(params.payload, {
        requestId,
        eventType: 'CHAT',
        status: 'ERROR',
        provider: 'rule-based-fallback',
        model: config.model,
        userType: params.userRole,
        userId: params.user?.id ?? null,
        sessionHash,
        latencyMs: Math.round(performance.now() - startedAt),
        errorCode: mappedFbErr.code,
        errorCategory: mappedFbErr.code,
      }).catch(() => undefined)
      throw mappedFbErr
    }
    const combinedTools = [...new Set([...(extraUsage?.priorTools ?? []), ...fb.toolsCalled])]
    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'SUCCESS',
      provider: 'rule-based-fallback',
      model: config.model,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      intent: fb.intent,
      toolsCalled: combinedTools,
      recommendedModelSlugs: fb.response.vehicleCards.map((c) => c.slug),
      noResultFound: fb.noResultFound,
      inputTokens: extraUsage?.inputTokens ?? 0,
      outputTokens: extraUsage?.outputTokens ?? 0,
      totalTokens: extraUsage?.totalTokens ?? 0,
      estimatedCostUsd: 0,
      latencyMs: fb.response.usage.latencyMs,
      errorCode: `FALLBACK_${reasonCode}`,
      errorCategory: extraUsage?.errorDetail ?? reasonMessage.slice(0, 80),
      querySummary: fb.noResultFound || config.storeConversations ? validated.message : null,
    })
    return fb.response
  }

  // 3. Input Security Guardrails BEFORE spending tokens or running fallback
  const guardrail = evaluateInputGuardrails(validated.message)
  if (!guardrail.allowed && guardrail.safeReply) {
    const latencyMs = Math.round(performance.now() - startedAt)
    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'BLOCKED',
      provider: config.provider,
      model: config.model,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      intent: guardrail.intent ?? 'BLOCKED',
      guardrailTriggered: guardrail.category ?? 'PROMPT_INJECTION',
      querySummary: validated.message,
      latencyMs,
    })
    return {
      requestId,
      reply: guardrail.safeReply,
      status: 'BLOCKED',
      mode: 'GUARDRAIL',
      intent: guardrail.intent ?? 'BLOCKED',
      vehicleCards: [],
      comparison: null,
      quote: null,
      bookingHandoff: null,
      citations: [],
      toolsCalled: [],
      followUpSuggestions: [
        'Tư vấn xe gia đình 7 chỗ dưới 1.5 triệu/ngày',
        'Chính sách đặt cọc và hủy đơn của NORI',
      ],
      fallbackLinks: AI_FALLBACK_LINKS,
      usage: { totalTokens: 0, latencyMs },
      disclaimer: STANDARD_DISCLAIMER,
    }
  }

  // 4. Multi-tier Rate Limiting (Session, IP, Project) BEFORE provider call
  const rateRes = checkAndConsumeMultiScopeModelCall({
    sessionKey: sessionHash,
    sessionRpm: config.rateLimitPerMinute,
    sessionRpd: config.rateLimitPerDay,
    ipKey: ipHash,
    ipRpm: config.ipRateLimitPerMinute,
    ipRpd: config.ipRateLimitPerDay,
    projectRpm: config.projectRateLimitPerMinute,
    projectRpd: config.projectRateLimitPerDay,
  })
  if (!rateRes.allowed) {
    if (rateRes.scope === 'PROJECT' && config.fallbackEnabled && !params.providerOverride) {
      return executeAndLogFallback(
        'PROJECT_RATE_LIMIT',
        'Project Gemini RPM/RPD limit reached; served via Rule-based Engine.',
      )
    }
    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'RATE_LIMITED',
      provider: config.provider,
      model: config.model,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      errorCode: rateRes.code ?? 'AI_RATE_LIMITED',
      errorCategory: `RATE_LIMIT_${rateRes.scope ?? 'SESSION'}`,
      latencyMs: Math.round(performance.now() - startedAt),
    })
    throw new NoriAIError({
      code: rateRes.code ?? 'AI_RATE_LIMITED',
      status: 429,
      retryable: true,
      userMessage:
        rateRes.code === 'AI_DAILY_LIMIT_EXCEEDED'
          ? 'Bạn đã đạt giới hạn số lượt hỏi Trợ lý AI trong hôm nay. Bạn vẫn có thể sử dụng bộ lọc tìm xe và đặt xe trực tiếp trên NORI.'
          : `Bạn đang gửi câu hỏi hơi nhanh. Vui lòng thử lại sau khoảng ${rateRes.retryAfterSeconds ?? 15} giây.`,
    })
  }

  // 5. API Key check -> Rule-based Fallback when fallbackEnabled=true, else UNCONFIGURED
  if (!config.configured && !params.providerOverride) {
    if (config.fallbackEnabled) {
      return executeAndLogFallback(
        'AI_UNCONFIGURED',
        'GEMINI_API_KEY not configured on server; served via Rule-based Engine.',
      )
    }
    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'UNCONFIGURED',
      provider: config.provider,
      model: config.model,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      intent: 'AI_UNCONFIGURED',
      latencyMs: Math.round(performance.now() - startedAt),
    })
    return {
      requestId,
      reply:
        'Trợ lý AI NORI hiện đang tạm ngưng tự động. Bạn vẫn có thể sử dụng đầy đủ bộ lọc tìm xe, xem giá thuê và đặt xe trực tiếp trên NORI.',
      status: 'UNCONFIGURED',
      mode: 'UNCONFIGURED',
      intent: 'AI_UNCONFIGURED',
      vehicleCards: [],
      comparison: null,
      quote: null,
      bookingHandoff: null,
      citations: [],
      toolsCalled: [],
      followUpSuggestions: [],
      fallbackLinks: AI_FALLBACK_LINKS,
      usage: { totalTokens: 0, latencyMs: Math.round(performance.now() - startedAt) },
      disclaimer: STANDARD_DISCLAIMER,
    }
  }

  // 6. Circuit Breaker check (prevents hammering Gemini when quota/key failed)
  const circuit = checkCircuitBreaker()
  if (circuit.open && !params.providerOverride) {
    if (config.fallbackEnabled) {
      return executeAndLogFallback(
        'AI_CIRCUIT_OPEN',
        `Gemini circuit open (${circuit.retryAfterSeconds}s); served via Rule-based Engine.`,
      )
    }
    throw new NoriAIError({
      code: 'AI_CIRCUIT_OPEN',
      status: 503,
      retryable: true,
      userMessage: `Trợ lý AI NORI đang tạm ngưng tự động (${circuit.retryAfterSeconds} giây) do nhà cung cấp AI tạm gián đoạn. Website và chức năng đặt xe vẫn hoạt động bình thường.`,
    })
  }

  // 7. Daily App-level Budget Cap (ignored when freeTierOnly=true with dailyBudgetUsd=0)
  if (!config.freeTierOnly && config.dailyBudgetUsd > 0) {
    const dbTodaySpent = await getTodayRecordedSpendUsd(params.payload)
    const budgetCheck = checkDailyBudget(config.dailyBudgetUsd, dbTodaySpent)
    if (!budgetCheck.allowed) {
      await recordAIUsageLog(params.payload, {
        requestId,
        eventType: 'CHAT',
        status: 'ERROR',
        provider: config.provider,
        model: config.model,
        userType: params.userRole,
        userId: params.user?.id ?? null,
        sessionHash,
        errorCode: 'AI_BUDGET_EXCEEDED',
        errorCategory: 'COST_CONTROL',
        latencyMs: Math.round(performance.now() - startedAt),
      })
      throw new NoriAIError({
        code: 'AI_BUDGET_EXCEEDED',
        status: 503,
        retryable: false,
        userMessage:
          'Trợ lý AI NORI tạm dừng do đã đạt hạn mức vận hành trong ngày. Bạn vẫn có thể tìm xe qua bộ lọc, xem báo giá và đặt thuê trực tiếp trên NORI.',
      })
    }
  }

  // 8. Concurrency guard
  const releaseSlot = acquireAIConcurrencySlot(sessionHash)

  let provider: AIProvider
  try {
    provider = params.providerOverride ?? resolveAIProvider()
  } catch (err) {
    releaseSlot()
    const mapped = mapToNoriAIError(err)
    if (
      config.fallbackEnabled &&
      (mapped.code === 'AI_PAID_PROVIDER_BLOCKED' ||
        mapped.code === 'AI_MODEL_NOT_FREE_TIER' ||
        mapped.code === 'AI_UNCONFIGURED')
    ) {
      return executeAndLogFallback(
        mapped.code,
        'Provider/model blocked under Free Tier policy; served via Rule-based Engine.',
      )
    }
    throw mapped
  }

  const systemInstructions = buildNoriSystemPrompt({
    knowledgeNote: config.knowledgeNote,
    userAuthenticated: params.userRole === 'CUSTOMER',
    sessionContext: nluAnalysis.sessionContext,
  })
  const toolDefs = getAllowedToolDefinitions()

  const conversationInput: AIProviderInputItem[] = [
    ...validated.history.map((m) => ({
      type: 'message' as const,
      role: m.role,
      content: m.content,
    })),
    {
      type: 'message',
      role: 'user',
      content: validated.message,
    },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokens = 0
  let resolvedModel = config.model
  const toolsCalled: string[] = []
  const vehicleCardMap = new Map<string, AIVehicleCard>()
  let comparison: AIComparisonTable | null = null
  let quote: AIQuoteSummary | null = null
  let bookingHandoff: AIBookingHandoff | null = null
  const citations: AIPolicyCitation[] = []
  let noResultFound = false
  let finalText = ''

  try {
    for (let round = 0; round <= config.maxToolRounds; round += 1) {
      if (round > 0) {
        const roundRate = checkAndConsumeMultiScopeModelCall({
          sessionKey: sessionHash,
          sessionRpm: config.rateLimitPerMinute,
          sessionRpd: config.rateLimitPerDay,
          includeSession: false,
          ipKey: ipHash,
          ipRpm: config.ipRateLimitPerMinute,
          ipRpd: config.ipRateLimitPerDay,
          projectRpm: config.projectRateLimitPerMinute,
          projectRpd: config.projectRateLimitPerDay,
        })
        if (!roundRate.allowed) {
          if (config.fallbackEnabled && !params.providerOverride) {
            return await executeAndLogFallback(
              'ROUND_QUOTA_REACHED',
              'Multi-round Function Calling quota reached; completed via Rule-based Engine.',
              {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                totalTokens,
                priorTools: toolsCalled,
              },
            )
          }
          throw new NoriAIError({
            code: roundRate.code ?? 'AI_RATE_LIMITED',
            status: 429,
            retryable: true,
            userMessage:
              'Bạn đã chạm giới hạn lượt xử lý AI trong chu kỳ này. Vui lòng thử lại sau ít giây.',
          })
        }
      }

      const turn = await provider.generateTurn({
        model: config.model,
        instructions: systemInstructions,
        input: conversationInput,
        tools: round < config.maxToolRounds ? toolDefs : [],
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.timeoutMs,
        signal: params.signal,
      })

      resolvedModel = turn.model || config.model
      totalInputTokens += turn.inputTokens
      totalOutputTokens += turn.outputTokens
      totalTokens += turn.totalTokens

      if (turn.toolCalls.length === 0) {
        finalText = turn.outputText
        break
      }

      conversationInput.push(...turn.rawOutputItems)

      const toolResults = await Promise.all(
        turn.toolCalls.slice(0, 6).map(async (tc) => {
          toolsCalled.push(tc.name)
          const executed = await executeAllowedTool(
            {
              payload: params.payload,
              weights: config.weights,
              knowledgeNote: config.knowledgeNote,
              user: params.user,
            },
            tc.name,
            tc.argumentsJson,
          )
          return { tc, executed }
        }),
      )

      for (const { tc, executed } of toolResults) {
        const res = executed.result
        if (res.vehicleCards) {
          for (const card of res.vehicleCards) {
            vehicleCardMap.set(card.slug, card)
          }
        }
        if (res.comparison) comparison = res.comparison
        if (res.quote) quote = res.quote
        if (res.bookingHandoff) bookingHandoff = res.bookingHandoff
        if (res.citations) {
          for (const cite of res.citations) {
            if (!citations.some((c) => c.title === cite.title && c.href === cite.href)) {
              citations.push(cite)
            }
          }
        }
        if (res.noResultFound) noResultFound = true

        conversationInput.push({
          type: 'function_call_output',
          call_id: tc.callId,
          name: tc.name,
          output: JSON.stringify(res.toolOutputForLLM),
        })
      }

      if (round === config.maxToolRounds) {
        finalText =
          turn.outputText ||
          'Tôi đã tra cứu xong thông tin thực tế từ hệ thống NORI. Bạn vui lòng xem các phương tiện và chi tiết báo giá bên dưới.'
      }
    }

    // Safety guard against LLM skipping tools on data-dependent intents (prevents any hallucinated price/vehicle)
    const dataDependentIntents: NoriAIIntent[] = [
      'VEHICLE_LOOKUP',
      'BRAND_LOOKUP',
      'VEHICLE_RECOMMENDATION',
      'PROMOTION_QUERY',
      'BOOKING_STATUS',
      'RENTAL_POLICY',
      'PURCHASE_CONSULTATION',
    ]
    if (
      toolsCalled.length === 0 &&
      dataDependentIntents.includes(nluAnalysis.intent) &&
      config.fallbackEnabled
    ) {
      return await executeAndLogFallback(
        'UNVERIFIED_DIRECT_REPLY_GUARD',
        'Model attempted direct reply without calling NORI verification tool; routed through deterministic tool verification.',
        {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens,
        },
      )
    }

    recordCircuitSuccess()

    const safeReply = sanitizeAssistantOutput(finalText)
    const vehicleCards = Array.from(vehicleCardMap.values()).slice(0, 6)
    const intent = deriveCanonicalIntent(toolsCalled, nluAnalysis.intent)
    const latencyMs = Math.round(performance.now() - startedAt)
    const estimatedCostUsd = estimateTokenCostUsd(
      resolvedModel,
      totalInputTokens,
      totalOutputTokens,
      { freeTierOnly: config.freeTierOnly },
    )
    recordDailyBudgetSpend(estimatedCostUsd)

    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: 'SUCCESS',
      provider: provider.name,
      model: resolvedModel,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      intent,
      toolsCalled: [...new Set(toolsCalled)],
      recommendedModelSlugs: vehicleCards.map((c) => c.slug),
      noResultFound,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      estimatedCostUsd,
      latencyMs,
      querySummary: noResultFound || config.storeConversations ? validated.message : null,
    })

    return {
      requestId,
      reply: safeReply,
      status: 'SUCCESS',
      mode: 'LIVE_AI',
      intent,
      vehicleCards,
      comparison,
      quote,
      bookingHandoff,
      citations: citations.slice(0, 5),
      toolsCalled: [...new Set(toolsCalled)],
      sessionContext: nluAnalysis.sessionContext,
      followUpSuggestions: buildFollowUpSuggestions({
        intent,
        cards: vehicleCards,
        hasQuote: Boolean(quote),
        sessionContext: nluAnalysis.sessionContext,
      }),
      fallbackLinks: AI_FALLBACK_LINKS,
      usage: {
        totalTokens,
        latencyMs,
      },
      disclaimer: STANDARD_DISCLAIMER,
    }
  } catch (error) {
    const mapped = mapToNoriAIError(error)
    if (
      mapped.code === 'AI_PROVIDER_ERROR' ||
      mapped.code === 'AI_TIMEOUT' ||
      mapped.code === 'AI_QUOTA_EXCEEDED' ||
      mapped.code === 'AI_INVALID_API_KEY' ||
      mapped.code === 'AI_MODEL_UNAVAILABLE' ||
      mapped.code === 'AI_MODEL_NOT_FREE_TIER'
    ) {
      recordCircuitFailure(mapped.code)
    }

    const canFallback =
      config.fallbackEnabled &&
      mapped.code !== 'AI_ABORTED' &&
      mapped.code !== 'AI_DB_UNAVAILABLE' &&
      !params.signal?.aborted

    if (canFallback) {
      try {
        return await executeAndLogFallback(
          mapped.code,
          sanitizeErrorMessage(mapped.message).slice(0, 120),
          {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens,
            priorTools: toolsCalled,
            errorDetail: sanitizeErrorMessage(mapped.message).slice(0, 80),
          },
        )
      } catch (fallbackErr) {
        const fbMapped = mapToNoriAIError(fallbackErr)
        if (fbMapped.code === 'AI_DB_UNAVAILABLE') throw fbMapped
      }
    }

    const latencyMs = Math.round(performance.now() - startedAt)
    const estimatedCostUsd = estimateTokenCostUsd(
      resolvedModel,
      totalInputTokens,
      totalOutputTokens,
      { freeTierOnly: config.freeTierOnly },
    )
    recordDailyBudgetSpend(estimatedCostUsd)

    await recordAIUsageLog(params.payload, {
      requestId,
      eventType: 'CHAT',
      status: mapped.code === 'AI_RATE_LIMITED' ? 'RATE_LIMITED' : 'ERROR',
      provider: provider.name,
      model: resolvedModel,
      userType: params.userRole,
      userId: params.user?.id ?? null,
      sessionHash,
      toolsCalled: [...new Set(toolsCalled)],
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      estimatedCostUsd,
      latencyMs,
      errorCode: mapped.code,
      errorCategory: sanitizeErrorMessage(mapped.message).slice(0, 80),
    })

    throw mapped
  } finally {
    releaseSlot()
  }
}
