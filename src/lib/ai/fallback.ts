import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { analyzeConversationTurn, type ParsedNLUAnalysis } from './nlu.ts'
import { executeAllowedTool } from './tool-registry.ts'
import type {
  AIBookingHandoff,
  AIChatMessageInput,
  AIChatResponsePayload,
  AIComparisonTable,
  AIPolicyCitation,
  AIProviderToolCall,
  AIQuoteSummary,
  AIResolvedConfig,
  AISessionContextSummary,
  AIVehicleCard,
  AllowedToolName,
  NoriAIIntent,
} from './types.ts'

export const RULE_BASED_MODE_LABEL = 'Chế độ tư vấn cơ bản'

export function extractComparisonNames(text: string): string[] {
  const analyzed = analyzeConversationTurn({ message: text })
  return analyzed.comparisonQueries
}

export function synthesizeDeterministicReply(data: Record<string, unknown>): string {
  if (typeof data.summary === 'string' && data.summary.trim()) {
    return data.summary.trim()
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }
  return 'Tôi đã tra cứu dữ liệu thực tế từ hệ thống NORI. Bạn có thể xem chi tiết thông tin bên dưới.'
}

export type PlannedDeterministicTurn =
  | {
      kind: 'ASK'
      text: string
      intent: NoriAIIntent
      analysis: ParsedNLUAnalysis
    }
  | {
      kind: 'TOOL_CALL'
      intent: NoriAIIntent
      toolName: AllowedToolName
      argumentsObj: Record<string, unknown>
      toolCall: AIProviderToolCall
      analysis: ParsedNLUAnalysis
    }

/**
 * Shared context-aware deterministic intent-to-tool planner used by BOTH:
 * 1) NORI Rule-based Engine (when Gemini is unconfigured, 429, quota exhausted, timeout, or offline)
 * 2) MockTestAIProvider (`NORI_AI_TEST_MOCK=1`)
 * Supports all 14 business intents and multi-turn session history!
 */
export function planDeterministicToolTurn(
  userText: string,
  history: AIChatMessageInput[] = [],
): PlannedDeterministicTurn {
  const analysis = analyzeConversationTurn({ message: userText, history })

  const makeCall = (
    prefix: string,
    intent: NoriAIIntent,
    name: AllowedToolName,
    args: Record<string, unknown>,
  ): PlannedDeterministicTurn => ({
    kind: 'TOOL_CALL',
    intent,
    toolName: name,
    argumentsObj: args,
    analysis,
    toolCall: {
      callId: `nori-call-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      argumentsJson: JSON.stringify(args),
    },
  })

  switch (analysis.intent) {
    case 'GREETING':
      return {
        kind: 'ASK',
        intent: 'GREETING',
        analysis,
        text: 'Xin chào bạn! Tôi là **Trợ lý AI của NORI**. Tôi có thể giúp bạn:\n- Tìm dòng xe cụ thể hoặc gợi ý xe theo **số chỗ, ngân sách, nhu cầu đi lại**.\n- Kiểm tra **lịch trống** và tính **báo giá thuê xe** chính xác theo ngày.\n- Giải đáp **khuyến mãi, chính sách đặt cọc, hủy đơn** và hướng dẫn đặt thuê.\n\nBạn đang quan tâm dòng xe nào hoặc cần thuê xe cho nhu cầu gì ạ?',
      }

    case 'OUT_OF_SCOPE':
      return {
        kind: 'ASK',
        intent: 'OUT_OF_SCOPE',
        analysis,
        text: 'Xin lỗi, tôi là trợ lý chuyên trách về dịch vụ **thuê xe và tư vấn mua xe tại NORI** nên chưa thể hỗ trợ các chủ đề ngoài phạm vi phương tiện. Bạn cần tìm ô tô, xe máy, bán tải hay tra cứu giá thuê và chính sách của NORI ạ?',
      }

    case 'CLARIFICATION':
      return {
        kind: 'ASK',
        intent: 'CLARIFICATION',
        analysis,
        text: 'Để tư vấn đúng phương tiện phù hợp nhất trong đội xe NORI, bạn vui lòng cho tôi biết thêm một vài thông tin nhé:\n- Bạn muốn tìm **ô tô (4–5 chỗ, 7 chỗ)**, **xe máy** hay **xe bán tải**?\n- **Ngân sách dự kiến** mỗi ngày hoặc **tên dòng xe** bạn đang quan tâm?\n- **Ngày nhận và trả xe** dự kiến (nếu đã có lịch trình)?',
      }

    case 'BOOKING_STATUS':
      return makeCall('bstatus', 'BOOKING_STATUS', 'getCustomerBookingStatus', {
        bookingKey: analysis.bookingKey ?? undefined,
        limit: 3,
      })

    case 'PURCHASE_CONSULTATION':
      return makeCall('buy', 'PURCHASE_CONSULTATION', 'getPurchaseConsultationInfo', {
        query: analysis.modelQuery ?? analysis.brand ?? undefined,
        category: analysis.category ?? undefined,
      })

    case 'VEHICLE_COMPARISON': {
      if (analysis.comparisonQueries.length < 2) {
        return {
          kind: 'ASK',
          intent: 'VEHICLE_COMPARISON',
          analysis,
          text: analysis.modelDisplayName
            ? `Bạn muốn so sánh **${analysis.modelDisplayName}** với dòng xe nào khác tại NORI (ví dụ: Toyota Fortuner, Mitsubishi Xpander, Honda CR-V, VinFast VF 8)?`
            : 'Vui lòng cho tôi biết **ít nhất 2 dòng xe** bạn muốn so sánh (ví dụ: *So sánh Toyota Fortuner và Mitsubishi Xpander*).',
        }
      }
      return makeCall('cmp', 'VEHICLE_COMPARISON', 'compareVehicles', {
        queries: analysis.comparisonQueries,
        startDate: analysis.startDate ?? undefined,
        endDate: analysis.endDate ?? undefined,
      })
    }

    case 'PROMOTION_QUERY':
      return makeCall('promo', 'PROMOTION_QUERY', 'getActivePromotions', {
        code: analysis.promoCode ?? undefined,
      })

    case 'RENTAL_POLICY':
      return makeCall('policy', 'RENTAL_POLICY', 'getRentalPolicy', {
        query: userText,
      })

    case 'BOOKING_GUIDANCE':
      return makeCall('book', 'BOOKING_GUIDANCE', 'prepareBooking', {
        vehicleQuery: analysis.modelQuery ?? undefined,
        startDate: analysis.startDate ?? undefined,
        endDate: analysis.endDate ?? undefined,
      })

    case 'PRICE_QUOTE': {
      // Both startDate & endDate known -> official Business Rule Engine quote
      if (analysis.startDate && analysis.endDate && analysis.modelQuery) {
        return makeCall('price', 'PRICE_QUOTE', 'calculateRentalPrice', {
          vehicleQuery: analysis.modelQuery,
          startDate: analysis.startDate,
          endDate: analysis.endDate,
          promoCode: analysis.promoCode ?? undefined,
        })
      }
      // Specific model known, but missing exact dates (e.g. "Xe VF8 giá sao?", "Xe đó giá bao nhiêu?", "Thuê 3 ngày thì sao?")
      // -> If user explicitly asked total/availability without dates AND no duration, check if they asked "kiểm tra ... tổng tiền" vs daily rate:
      if (analysis.modelQuery && !/\b(kiem tra|con trong)\b/.test(analysis.normalizedQuery)) {
        return makeCall('vprice', 'PRICE_QUOTE', 'getVehicleDetails', {
          query: analysis.modelQuery,
          durationDays: analysis.durationDays ?? undefined,
        })
      }
      return {
        kind: 'ASK',
        intent: 'PRICE_QUOTE',
        analysis,
        text: analysis.modelDisplayName
          ? `Để kiểm tra lịch trống thực tế và tính tổng báo giá chính xác cho **${analysis.modelDisplayName}** theo Business Rule Engine của NORI, bạn vui lòng cung cấp **ngày nhận xe** và **ngày trả xe** cụ thể (định dạng YYYY-MM-DD, ví dụ: nhận 2026-12-01, trả 2026-12-04).`
          : 'Để tính báo giá thuê xe chính xác, bạn vui lòng cho tôi biết **dòng xe bạn quan tâm** cùng **ngày nhận xe** và **ngày trả xe** cụ thể (định dạng YYYY-MM-DD).',
      }
    }

    case 'AVAILABILITY_CHECK': {
      if (!analysis.startDate || !analysis.endDate) {
        return {
          kind: 'ASK',
          intent: 'AVAILABILITY_CHECK',
          analysis,
          text: analysis.modelDisplayName
            ? `Tôi cần biết chính xác **ngày nhận xe** và **ngày trả xe** (định dạng YYYY-MM-DD) để kiểm tra lịch trống thực tế của **${analysis.modelDisplayName}** trong hệ thống NORI. Bạn dự kiến thuê từ ngày nào đến ngày nào?`
            : 'Vui lòng cho tôi biết **tên dòng xe** cùng **ngày nhận xe** và **ngày trả xe** (YYYY-MM-DD) để kiểm tra lịch trống thực tế trong hệ thống NORI.',
        }
      }
      if (!analysis.modelQuery) {
        return makeCall('searchavail', 'AVAILABILITY_CHECK', 'searchVehicles', {
          category: analysis.category ?? undefined,
          brand: analysis.brand ?? undefined,
          minSeats: analysis.minSeats ?? undefined,
          maxPricePerDay: analysis.maxBudgetPerDay ?? undefined,
          startDate: analysis.startDate,
          endDate: analysis.endDate,
          limit: 4,
        })
      }
      return makeCall('avail', 'AVAILABILITY_CHECK', 'checkAvailability', {
        vehicleQuery: analysis.modelQuery,
        startDate: analysis.startDate,
        endDate: analysis.endDate,
      })
    }

    case 'VEHICLE_LOOKUP':
      return makeCall('lookup', 'VEHICLE_LOOKUP', 'getVehicleDetails', {
        query: analysis.modelQuery ?? userText,
        durationDays: analysis.durationDays ?? undefined,
      })

    case 'BRAND_LOOKUP':
      return makeCall('brand', 'BRAND_LOOKUP', 'searchVehicles', {
        brand: analysis.brand ?? undefined,
        category: analysis.category ?? undefined,
        startDate: analysis.startDate ?? undefined,
        endDate: analysis.endDate ?? undefined,
        limit: 6,
      })

    case 'VEHICLE_RECOMMENDATION':
    default:
      return makeCall('rec', 'VEHICLE_RECOMMENDATION', 'recommendVehicles', {
        userQuery: userText,
        category: analysis.category ?? undefined,
        brand: analysis.brand ?? undefined,
        seats: analysis.minSeats ?? undefined,
        maxBudgetPerDay: analysis.maxBudgetPerDay ?? undefined,
        strictBudget: analysis.strictBudget,
        fuelType: analysis.fuelType ?? undefined,
        transmission: analysis.transmission ?? undefined,
        purpose: analysis.purpose ?? undefined,
        startDate: analysis.startDate ?? undefined,
        endDate: analysis.endDate ?? undefined,
        limit: 4,
      })
  }
}

export async function runRuleBasedFallback(params: {
  payload: Payload
  requestId: string
  message: string
  history?: AIChatMessageInput[]
  config: AIResolvedConfig
  user: { id: string; collection: string } | null
  reasonCode: string
  reasonMessage: string
  startedAt: number
  disclaimer: string
  fallbackLinks: { label: string; href: string }[]
  buildFollowUps: (args: {
    intent: string
    cards: AIVehicleCard[]
    hasQuote: boolean
    sessionContext?: AISessionContextSummary
  }) => string[]
}): Promise<{
  response: AIChatResponsePayload
  toolsCalled: string[]
  noResultFound: boolean
  intent: string
}> {
  const plan = planDeterministicToolTurn(params.message, params.history ?? [])

  let replyBody = ''
  const intent = plan.intent
  const toolsCalled: string[] = []
  let vehicleCards: AIVehicleCard[] = []
  let comparison: AIComparisonTable | null = null
  let quote: AIQuoteSummary | null = null
  let bookingHandoff: AIBookingHandoff | null = null
  let citations: AIPolicyCitation[] = []
  let noResultFound = false

  if (plan.kind === 'ASK') {
    replyBody = plan.text
  } else {
    toolsCalled.push(plan.toolName)
    const executed = await executeAllowedTool(
      {
        payload: params.payload,
        weights: params.config.weights,
        knowledgeNote: params.config.knowledgeNote,
        user: params.user,
      },
      plan.toolName,
      plan.toolCall.argumentsJson,
    )
    const res = executed.result
    vehicleCards = (res.vehicleCards ?? []).slice(0, 6)
    comparison = res.comparison ?? null
    quote = res.quote ?? null
    bookingHandoff = res.bookingHandoff ?? null
    citations = (res.citations ?? []).slice(0, 5)
    noResultFound = Boolean(res.noResultFound)
    replyBody = synthesizeDeterministicReply(res.toolOutputForLLM)
  }

  const latencyMs = Math.round(performance.now() - params.startedAt)

  return {
    toolsCalled,
    noResultFound,
    intent,
    response: {
      requestId: params.requestId,
      reply: replyBody,
      status: 'DEGRADED',
      mode: 'RULE_BASED_FALLBACK',
      modeLabel: RULE_BASED_MODE_LABEL,
      fallbackMode: true,
      fallbackReason: params.reasonCode,
      intent,
      vehicleCards,
      comparison,
      quote,
      bookingHandoff,
      citations,
      toolsCalled,
      sessionContext: plan.analysis.sessionContext,
      followUpSuggestions: params.buildFollowUps({
        intent,
        cards: vehicleCards,
        hasQuote: Boolean(quote),
        sessionContext: plan.analysis.sessionContext,
      }),
      fallbackLinks: params.fallbackLinks,
      usage: {
        totalTokens: 0,
        latencyMs,
      },
      disclaimer: params.disclaimer,
    },
  }
}
