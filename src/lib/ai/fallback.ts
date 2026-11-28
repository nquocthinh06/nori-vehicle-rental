import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { stripVietnameseAccents } from './guardrails.ts'
import { extractStructuredIntent } from './recommendation.ts'
import { executeAllowedTool } from './tool-registry.ts'
import type {
  AIBookingHandoff,
  AIChatResponsePayload,
  AIComparisonTable,
  AIPolicyCitation,
  AIProviderToolCall,
  AIQuoteSummary,
  AIResolvedConfig,
  AIVehicleCard,
  AllowedToolName,
} from './types.ts'

export const RULE_BASED_MODE_LABEL = 'Chế độ tư vấn cơ bản (Rule-based Engine)'

const KNOWN_VEHICLE_NAMES = [
  'fortuner',
  'xpander',
  'vios',
  'accent',
  'ranger',
  'raptor',
  'cx-5',
  'cr-v',
  'innova',
  'veloz',
  'vf 8',
  'vf 5',
  'vf 3',
  'evo max',
  'evo200',
  'pcx',
  'sh350i',
  'sh160i',
  'sh',
  'vision',
  'wave alpha',
  'air blade',
  'exciter',
  'z650',
  'triton',
  'hilux',
  'c300',
]

export function extractComparisonNames(text: string): string[] {
  const norm = stripVietnameseAccents(text).toLowerCase()
  return KNOWN_VEHICLE_NAMES.filter((k) => norm.includes(k)).slice(0, 4)
}

export function synthesizeDeterministicReply(data: Record<string, unknown>): string {
  if (typeof data.summary === 'string' && data.summary.trim()) {
    return data.summary.trim()
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }
  return 'Tôi đã tra cứu dữ liệu thực tế từ hệ thống NORI. Bạn có thể xem chi tiết thông tin trong thẻ kết quả bên dưới.'
}

export type PlannedDeterministicTurn =
  | {
      kind: 'ASK'
      text: string
      intent: string
    }
  | {
      kind: 'TOOL_CALL'
      toolName: AllowedToolName
      argumentsObj: Record<string, unknown>
      toolCall: AIProviderToolCall
    }

/**
 * Shared deterministic intent-to-tool planner used by BOTH:
 * 1) NORI Rule-based Recommendation Fallback (when Gemini is unconfigured, 429, quota exhausted, or offline)
 * 2) MockTestAIProvider (`NORI_AI_TEST_MOCK=1`)
 * All vehicle, price, availability, promotion, and policy results still go through real NORI tools.
 */
export function planDeterministicToolTurn(userText: string): PlannedDeterministicTurn {
  const norm = stripVietnameseAccents(userText).toLowerCase()
  const intent = extractStructuredIntent(userText)
  const makeCall = (
    prefix: string,
    name: AllowedToolName,
    args: Record<string, unknown>,
  ): PlannedDeterministicTurn => ({
    kind: 'TOOL_CALL',
    toolName: name,
    argumentsObj: args,
    toolCall: {
      callId: `nori-call-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
      name,
      argumentsJson: JSON.stringify(args),
    },
  })

  if (/\b(so sanh|compare)\b/.test(norm)) {
    const names = extractComparisonNames(userText)
    return makeCall('cmp', 'compareVehicles', {
      queries: names.length >= 2 ? names : ['fortuner', 'xpander'],
      startDate: intent.startDate ?? undefined,
      endDate: intent.endDate ?? undefined,
    })
  }

  if (
    /\b(khuyen mai|ma giam gia|voucher|promo|uu dai|giam gia)\b/.test(norm) &&
    !/\b(tinh gia|bao gia)\b/.test(norm)
  ) {
    const codeMatch = userText.match(/\b([A-Z0-9]{4,20})\b/)
    return makeCall('promo', 'getActivePromotions', {
      code: codeMatch ? codeMatch[1] : undefined,
    })
  }

  if (
    /\b(chinh sach|dat coc|huy don|hoan tien|bao hiem|giay to|faq|dieu kien thue|lien he|hotline|giao nhan)\b/.test(
      norm,
    )
  ) {
    return makeCall('policy', 'getRentalPolicy', { query: userText })
  }

  if (/\b(dat xe|thue xe nay|chuan bi dat|checkout|dat thue)\b/.test(norm) && intent.query) {
    return makeCall('book', 'prepareBooking', {
      vehicleQuery: intent.query,
      startDate: intent.startDate ?? undefined,
      endDate: intent.endDate ?? undefined,
    })
  }

  if (/\b(tinh gia|bao gia|het bao nhieu|tong chi phi|tong tien)\b/.test(norm)) {
    if (!intent.startDate || !intent.endDate) {
      return {
        kind: 'ASK',
        intent: 'CALCULATE_PRICE',
        text: 'Để tính báo giá chính xác theo Business Rule Engine của NORI, vui lòng cung cấp giúp tôi **ngày nhận xe** và **ngày trả xe** cụ thể (ví dụ: nhận 2026-12-01, trả 2026-12-04).',
      }
    }
    const promoMatch = userText.match(/\b(?:ma|code)\s+([A-Za-z0-9_-]{3,24})/i)
    return makeCall('price', 'calculateRentalPrice', {
      vehicleQuery: intent.query || userText,
      startDate: intent.startDate,
      endDate: intent.endDate,
      promoCode: promoMatch ? promoMatch[1].toUpperCase() : undefined,
    })
  }

  if (/\b(con trong|kiem tra lich|kha dung|co san|het lich)\b/.test(norm)) {
    if (!intent.startDate || !intent.endDate) {
      return {
        kind: 'ASK',
        intent: 'CHECK_AVAILABILITY',
        text: 'Tôi cần biết chính xác **ngày nhận xe** và **ngày trả xe** (định dạng YYYY-MM-DD) để kiểm tra lịch trống thực tế của xe trong hệ thống NORI. Bạn dự kiến thuê từ ngày nào đến ngày nào?',
      }
    }
    return makeCall('avail', 'checkAvailability', {
      vehicleQuery: intent.query || userText,
      startDate: intent.startDate,
      endDate: intent.endDate,
    })
  }

  if (/\b(chi tiet|thong so)\b/.test(norm) && intent.query) {
    return makeCall('detail', 'getVehicleDetails', { query: intent.query })
  }

  return makeCall('rec', 'recommendVehicles', {
    userQuery: userText,
    category: intent.category ?? undefined,
    seats: intent.minSeats ?? undefined,
    maxBudgetPerDay: intent.maxBudgetPerDay ?? undefined,
    strictBudget: intent.strictBudget,
    fuelType: intent.fuelType ?? undefined,
    transmission: intent.transmission ?? undefined,
    purpose: intent.purpose ?? undefined,
    startDate: intent.startDate ?? undefined,
    endDate: intent.endDate ?? undefined,
    limit: 4,
  })
}

export async function runRuleBasedFallback(params: {
  payload: Payload
  requestId: string
  message: string
  config: AIResolvedConfig
  user: { id: string; collection: string } | null
  reasonCode: string
  reasonMessage: string
  startedAt: number
  disclaimer: string
  fallbackLinks: { label: string; href: string }[]
  buildFollowUps: (args: { intent: string; cards: AIVehicleCard[]; hasQuote: boolean }) => string[]
}): Promise<{
  response: AIChatResponsePayload
  toolsCalled: string[]
  noResultFound: boolean
  intent: string
}> {
  const plan = planDeterministicToolTurn(params.message)

  let replyBody = ''
  let intent = 'RECOMMEND_VEHICLES'
  const toolsCalled: string[] = []
  let vehicleCards: AIVehicleCard[] = []
  let comparison: AIComparisonTable | null = null
  let quote: AIQuoteSummary | null = null
  let bookingHandoff: AIBookingHandoff | null = null
  let citations: AIPolicyCitation[] = []
  let noResultFound = false

  if (plan.kind === 'ASK') {
    replyBody = plan.text
    intent = plan.intent
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
    intent =
      plan.toolName === 'prepareBooking'
        ? 'PREPARE_BOOKING'
        : plan.toolName === 'calculateRentalPrice'
          ? 'CALCULATE_PRICE'
          : plan.toolName === 'checkAvailability'
            ? 'CHECK_AVAILABILITY'
            : plan.toolName === 'compareVehicles'
              ? 'COMPARE_VEHICLES'
              : plan.toolName === 'getActivePromotions'
                ? 'PROMOTIONS'
                : plan.toolName === 'getRentalPolicy'
                  ? 'POLICY_QA'
                  : plan.toolName === 'getVehicleDetails'
                    ? 'VEHICLE_DETAILS'
                    : 'RECOMMEND_VEHICLES'
  }

  const latencyMs = Math.round(performance.now() - params.startedAt)
  const fullReply = `[${RULE_BASED_MODE_LABEL}] ${params.reasonMessage}\n\n${replyBody}`

  return {
    toolsCalled,
    noResultFound,
    intent,
    response: {
      requestId: params.requestId,
      reply: fullReply,
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
      followUpSuggestions: params.buildFollowUps({
        intent,
        cards: vehicleCards,
        hasQuote: Boolean(quote),
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
