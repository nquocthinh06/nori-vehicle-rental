import { getAIRuntimeConfig } from './config.ts'
import { NoriAIError } from './errors.ts'
import { planDeterministicToolTurn, synthesizeDeterministicReply } from './fallback.ts'
import { GeminiProvider } from './gemini.ts'
import { OpenAIResponsesProvider } from './openai.ts'
import type {
  AIChatMessageInput,
  AIProvider,
  AIProviderInputItem,
  AIProviderToolCall,
  AIProviderTurnResult,
  AIToolDefinition,
} from './types.ts'

/**
 * Isolated deterministic MockAIProvider strictly for automated Unit/Integration/E2E tests
 * when `NORI_AI_TEST_MOCK=1`. NEVER activated on real production traffic to fake AI.
 * Routes all 14 intents & multi-turn session history through real NORI tools and SQLite DB!
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
    const messageItems = params.input.filter(
      (i): i is Extract<AIProviderInputItem, { type: 'message' }> => i.type === 'message',
    )
    const lastUserMessage = [...messageItems].reverse().find((i) => i.role === 'user')
    const userText = lastUserMessage?.content ?? ''

    // Prior conversation messages before the current user turn
    const lastUserIdx = messageItems.lastIndexOf(lastUserMessage!)
    const priorHistory: AIChatMessageInput[] =
      lastUserIdx > 0
        ? messageItems.slice(0, lastUserIdx).map((m) => ({ role: m.role, content: m.content }))
        : []

    // Round 2: Synthesize concise Vietnamese summary strictly from actual backend tool output
    if (toolOutputs.length > 0) {
      const latestOutputRaw = toolOutputs[toolOutputs.length - 1]!.output
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(latestOutputRaw) as Record<string, unknown>
      } catch {
        parsed = {}
      }

      const summary = synthesizeDeterministicReply(parsed)
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

    // Round 1: Context-aware deterministic function calling based on shared NLU planner
    const plan = planDeterministicToolTurn(userText, priorHistory)
    if (plan.kind === 'ASK') {
      return {
        responseId: `mock-resp-ask-${Date.now()}`,
        model: params.model,
        outputText: plan.text,
        toolCalls: [],
        inputTokens: 112,
        outputTokens: 50,
        totalTokens: 162,
        rawOutputItems: [{ type: 'message', role: 'assistant', content: plan.text }],
      }
    }

    const toolCalls: AIProviderToolCall[] = [plan.toolCall]

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

export function resolveAIProvider(): AIProvider {
  const runtime = getAIRuntimeConfig()
  if (runtime.testMockEnabled) {
    return new MockTestAIProvider()
  }
  if (runtime.provider === 'openai') {
    if (runtime.freeTierOnly || !runtime.paidProvidersAllowed) {
      throw new NoriAIError({
        code: 'AI_PAID_PROVIDER_BLOCKED',
        status: 503,
        retryable: false,
        userMessage:
          'Nhà cung cấp AI trả phí (OpenAI) đang bị khóa theo chính sách Gemini Free Tier Only của NORI.',
      })
    }
    return new OpenAIResponsesProvider()
  }
  return new GeminiProvider()
}
