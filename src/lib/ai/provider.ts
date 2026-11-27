import { getAIRuntimeConfig } from './config.ts'
import { NoriAIError } from './errors.ts'
import { stripVietnameseAccents } from './guardrails.ts'
import { OpenAIResponsesProvider } from './openai.ts'
import { extractStructuredIntent } from './recommendation.ts'
import type {
  AIProvider,
  AIProviderInputItem,
  AIProviderToolCall,
  AIProviderTurnResult,
  AIToolDefinition,
} from './types.ts'

/**
 * Isolated deterministic MockAIProvider strictly for automated Unit/Integration/E2E tests
 * when `NORI_AI_TEST_MOCK=1`. NEVER activated on real production traffic to fake AI.
 * It still routes all vehicle/price/availability/promo/policy work through real NORI tools!
 */
export class MockTestAIProvider implements AIProvider {
  readonly name = 'mock' as const

  async generateTurn(params: {
    model: string
    instructions: string
    input: AIProviderInputItem[]
    tools: AIToolDefinition[]
    maxOutputTokens: number
    timeoutMs: number
    signal?: AbortSignal
  }): Promise<AIProviderTurnResult> {
    const scenario = (process.env.NORI_AI_TEST_SCENARIO ?? '').trim().toUpperCase()
    if (scenario === 'INVALID_KEY') {
      throw new NoriAIError({
        code: 'AI_INVALID_API_KEY',
        status: 503,
        retryable: false,
        userMessage:
          'Trợ lý AI NORI hiện đang tạm gián đoạn cấu hình kết nối. Website và chức năng đặt xe vẫn hoạt động bình thường.',
      })
    }
    if (scenario === 'QUOTA_EXCEEDED') {
      throw new NoriAIError({
        code: 'AI_QUOTA_EXCEEDED',
        status: 503,
        retryable: false,
        userMessage:
          'Trợ lý AI NORI tạm thời hết hạn mức phục vụ. Bạn vẫn có thể tìm xe qua bộ lọc, xem báo giá trực tiếp hoặc liên hệ NORI.',
      })
    }
    if (scenario === 'RATE_429') {
      throw new NoriAIError({
        code: 'AI_RATE_LIMITED',
        status: 429,
        retryable: true,
        userMessage:
          'Hệ thống trợ lý AI đang nhận nhiều yêu cầu cùng lúc. Vui lòng chờ ít giây rồi thử lại.',
      })
    }
    if (scenario === 'TIMEOUT') {
      throw new NoriAIError({
        code: 'AI_TIMEOUT',
        status: 504,
        retryable: true,
        userMessage:
          'Trợ lý AI phản hồi chậm hơn dự kiến và đã hết thời gian chờ. Bạn có thể thử lại hoặc dùng bộ lọc tìm xe trực tiếp.',
      })
    }

    const toolOutputs = params.input.filter(
      (i): i is Extract<AIProviderInputItem, { type: 'function_call_output' }> =>
        i.type === 'function_call_output',
    )
    const lastUserMessage = [...params.input]
      .reverse()
      .find(
        (i): i is Extract<AIProviderInputItem, { type: 'message' }> =>
          i.type === 'message' && i.role === 'user',
      )
    const userText = lastUserMessage?.content ?? ''
    const norm = stripVietnameseAccents(userText).toLowerCase()

    // Round 2: Synthesize concise Vietnamese summary strictly from actual backend tool output
    if (toolOutputs.length > 0) {
      const latestOutputRaw = toolOutputs[toolOutputs.length - 1]!.output
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(latestOutputRaw) as Record<string, unknown>
      } catch {
        parsed = {}
      }

      const summary = synthesizeFromToolOutput(parsed)
      return {
        responseId: `mock-resp-final-${Date.now()}`,
        model: params.model,
        outputText: summary,
        toolCalls: [],
        inputTokens: 180,
        outputTokens: 95,
        totalTokens: 275,
        rawOutputItems: [{ type: 'message', role: 'assistant', content: summary }],
      }
    }

    // Round 1: Deterministic function calling based on user intent
    const intent = extractStructuredIntent(userText)
    const toolCalls: AIProviderToolCall[] = []

    if (/\b(so sanh|compare)\b/.test(norm)) {
      const slugs = extractCandidateNames(userText)
      toolCalls.push({
        callId: `mock-call-cmp-${Date.now()}`,
        name: 'compareVehicles',
        argumentsJson: JSON.stringify({
          queries: slugs.length >= 2 ? slugs : ['fortuner', 'xpander'],
          startDate: intent.startDate ?? undefined,
          endDate: intent.endDate ?? undefined,
        }),
      })
    } else if (
      /\b(khuyen mai|ma giam gia|voucher|promo|uu dai|giam gia)\b/.test(norm) &&
      !/\b(tinh gia|bao gia)\b/.test(norm)
    ) {
      const codeMatch = userText.match(/\b([A-Z0-9]{4,20})\b/)
      toolCalls.push({
        callId: `mock-call-promo-${Date.now()}`,
        name: 'getActivePromotions',
        argumentsJson: JSON.stringify({
          code: codeMatch ? codeMatch[1] : undefined,
        }),
      })
    } else if (
      /\b(chinh sach|dat coc|huy don|hoan tien|bao hiem|giay to|faq|dieu kien thue|lien he|hotline|giao nhan)\b/.test(
        norm,
      )
    ) {
      toolCalls.push({
        callId: `mock-call-policy-${Date.now()}`,
        name: 'getRentalPolicy',
        argumentsJson: JSON.stringify({ query: userText }),
      })
    } else if (
      /\b(dat xe|thue xe nay|chuan bi dat|checkout|dat thue)\b/.test(norm) &&
      intent.query
    ) {
      toolCalls.push({
        callId: `mock-call-book-${Date.now()}`,
        name: 'prepareBooking',
        argumentsJson: JSON.stringify({
          vehicleQuery: intent.query,
          startDate: intent.startDate ?? undefined,
          endDate: intent.endDate ?? undefined,
        }),
      })
    } else if (/\b(tinh gia|bao gia|het bao nhieu|tong chi phi|tong tien)\b/.test(norm)) {
      if (!intent.startDate || !intent.endDate) {
        const askText =
          'Để tính báo giá chính xác theo Business Rule Engine của NORI, vui lòng cung cấp giúp tôi **ngày nhận xe** và **ngày trả xe** cụ thể (ví dụ: nhận 2026-12-01, trả 2026-12-04).'
        return {
          responseId: `mock-resp-ask-dates-${Date.now()}`,
          model: params.model,
          outputText: askText,
          toolCalls: [],
          inputTokens: 110,
          outputTokens: 48,
          totalTokens: 158,
          rawOutputItems: [{ type: 'message', role: 'assistant', content: askText }],
        }
      }
      const promoMatch = userText.match(/\b(?:ma|code)\s+([A-Za-z0-9_-]{3,24})/i)
      toolCalls.push({
        callId: `mock-call-price-${Date.now()}`,
        name: 'calculateRentalPrice',
        argumentsJson: JSON.stringify({
          vehicleQuery: intent.query || userText,
          startDate: intent.startDate,
          endDate: intent.endDate,
          promoCode: promoMatch ? promoMatch[1].toUpperCase() : undefined,
        }),
      })
    } else if (/\b(con trong|kiem tra lich|kha dung|co san|het lich)\b/.test(norm)) {
      if (!intent.startDate || !intent.endDate) {
        const askText =
          'Tôi cần biết chính xác **ngày nhận xe** và **ngày trả xe** (định dạng YYYY-MM-DD) để kiểm tra lịch trống thực tế của xe trong hệ thống NORI. Bạn dự kiến thuê từ ngày nào đến ngày nào?'
        return {
          responseId: `mock-resp-ask-avail-${Date.now()}`,
          model: params.model,
          outputText: askText,
          toolCalls: [],
          inputTokens: 115,
          outputTokens: 52,
          totalTokens: 167,
          rawOutputItems: [{ type: 'message', role: 'assistant', content: askText }],
        }
      }
      toolCalls.push({
        callId: `mock-call-avail-${Date.now()}`,
        name: 'checkAvailability',
        argumentsJson: JSON.stringify({
          vehicleQuery: intent.query || userText,
          startDate: intent.startDate,
          endDate: intent.endDate,
        }),
      })
    } else if (/\b(chi tiet|thong so)\b/.test(norm) && intent.query) {
      toolCalls.push({
        callId: `mock-call-detail-${Date.now()}`,
        name: 'getVehicleDetails',
        argumentsJson: JSON.stringify({ query: intent.query }),
      })
    } else {
      toolCalls.push({
        callId: `mock-call-rec-${Date.now()}`,
        name: 'recommendVehicles',
        argumentsJson: JSON.stringify({
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
        }),
      })
    }

    return {
      responseId: `mock-resp-tool-${Date.now()}`,
      model: params.model,
      outputText: '',
      toolCalls,
      inputTokens: 140,
      outputTokens: 45,
      totalTokens: 185,
      rawOutputItems: toolCalls.map((tc) => ({
        type: 'function_call',
        call_id: tc.callId,
        name: tc.name,
        arguments: tc.argumentsJson,
      })),
    }
  }

  async ping(params: {
    model: string
    timeoutMs: number
  }): Promise<{ ok: boolean; model: string; latencyMs: number; message: string }> {
    return {
      ok: true,
      model: params.model,
      latencyMs: 5,
      message: `Mock Test Provider sẵn sàng (chế độ kiểm thử cô lập, model: ${params.model}).`,
    }
  }
}

function extractCandidateNames(text: string): string[] {
  const known = [
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
    'pcx',
    'sh',
    'vision',
    'air blade',
    'exciter',
    'winner',
    'triton',
    'hilux',
    'navara',
  ]
  const norm = stripVietnameseAccents(text).toLowerCase()
  return known.filter((k) => norm.includes(k)).slice(0, 4)
}

function synthesizeFromToolOutput(data: Record<string, unknown>): string {
  if (typeof data.summary === 'string' && data.summary.trim()) {
    return data.summary.trim()
  }
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }
  return 'Tôi đã tra cứu dữ liệu thực tế từ hệ thống NORI. Bạn có thể xem chi tiết thông tin trong thẻ kết quả bên dưới.'
}

export function resolveAIProvider(): AIProvider {
  const runtime = getAIRuntimeConfig()
  if (runtime.testMockEnabled) {
    return new MockTestAIProvider()
  }
  return new OpenAIResponsesProvider()
}
