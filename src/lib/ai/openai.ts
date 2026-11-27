import OpenAI from 'openai'
import type {
  FunctionTool,
  ResponseInputItem,
  ResponseOutputItem,
} from 'openai/resources/responses/responses'
import { getOpenAIApiKeyServerOnly } from './config.ts'
import { mapToNoriAIError, NoriAIError, sanitizeErrorMessage } from './errors.ts'
import type {
  AIProvider,
  AIProviderInputItem,
  AIProviderToolCall,
  AIProviderTurnResult,
  AIToolDefinition,
} from './types.ts'

const MAX_RETRIES = 2
const BASE_BACKOFF_MS = 450

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isTransientRetryableError(error: unknown): boolean {
  const mapped = mapToNoriAIError(error)
  if (mapped.code === 'AI_INVALID_API_KEY' || mapped.code === 'AI_QUOTA_EXCEEDED') return false
  if (mapped.code === 'AI_ABORTED') return false
  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const status = typeof errObj.status === 'number' ? errObj.status : 0
  if (status === 429) return true
  if (status >= 500) return true
  return mapped.code === 'AI_TIMEOUT'
}

function mapToolsToOpenAI(tools: AIToolDefinition[]): FunctionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }))
}

function mapInputToOpenAI(items: AIProviderInputItem[]): ResponseInputItem[] {
  const mapped: ResponseInputItem[] = []
  for (const item of items) {
    if (item.type === 'message') {
      mapped.push({
        type: 'message',
        role: item.role,
        content: item.content,
      })
    } else if (item.type === 'function_call') {
      mapped.push({
        type: 'function_call',
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      })
    } else if (item.type === 'function_call_output') {
      mapped.push({
        type: 'function_call_output',
        call_id: item.call_id,
        output: item.output,
      })
    }
  }
  return mapped
}

function extractToolCallsAndRawItems(output: ResponseOutputItem[]): {
  toolCalls: AIProviderToolCall[]
  rawItems: AIProviderInputItem[]
} {
  const toolCalls: AIProviderToolCall[] = []
  const rawItems: AIProviderInputItem[] = []

  for (const item of output) {
    if (item.type === 'function_call') {
      toolCalls.push({
        callId: item.call_id,
        name: item.name,
        argumentsJson: item.arguments,
      })
      rawItems.push({
        type: 'function_call',
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      })
    } else if (item.type === 'message') {
      const textParts: string[] = []
      for (const contentPart of item.content ?? []) {
        if (contentPart.type === 'output_text' && typeof contentPart.text === 'string') {
          textParts.push(contentPart.text)
        }
      }
      if (textParts.length > 0) {
        rawItems.push({
          type: 'message',
          role: 'assistant',
          content: textParts.join('\n'),
        })
      }
    }
  }

  return { toolCalls, rawItems }
}

/**
 * Official OpenAI Responses API Provider using `openai` TypeScript SDK.
 * Always calls server-side with `store: false` for data minimization and privacy.
 */
export class OpenAIResponsesProvider implements AIProvider {
  readonly name = 'openai' as const

  private createClient(timeoutMs: number): OpenAI {
    const apiKey = getOpenAIApiKeyServerOnly()
    if (!apiKey) {
      throw new NoriAIError({
        code: 'AI_UNCONFIGURED',
        status: 503,
        retryable: false,
        userMessage:
          'Trợ lý AI NORI chưa được cấu hình API Key trên máy chủ. Website và chức năng đặt xe vẫn hoạt động bình thường.',
      })
    }
    return new OpenAI({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0, // NORI manages controlled exponential backoff retries explicitly
    })
  }

  async generateTurn(params: {
    model: string
    instructions: string
    input: AIProviderInputItem[]
    tools: AIToolDefinition[]
    maxOutputTokens: number
    timeoutMs: number
    signal?: AbortSignal
  }): Promise<AIProviderTurnResult> {
    const client = this.createClient(params.timeoutMs)
    const openAITools = mapToolsToOpenAI(params.tools)
    const openAIInput = mapInputToOpenAI(params.input)

    let lastError: unknown = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const timeoutController = new AbortController()
      const timer = setTimeout(() => timeoutController.abort(), params.timeoutMs)
      const onCallerAbort = () => timeoutController.abort()
      params.signal?.addEventListener('abort', onCallerAbort, { once: true })

      try {
        const response = await client.responses.create(
          {
            model: params.model,
            instructions: params.instructions,
            input: openAIInput,
            tools: openAITools.length > 0 ? openAITools : undefined,
            max_output_tokens: params.maxOutputTokens,
            store: false,
            parallel_tool_calls: true,
          },
          { signal: timeoutController.signal },
        )

        const { toolCalls, rawItems } = extractToolCallsAndRawItems(response.output ?? [])
        const inputTokens = Number(response.usage?.input_tokens ?? 0)
        const outputTokens = Number(response.usage?.output_tokens ?? 0)
        const totalTokens = Number(response.usage?.total_tokens ?? inputTokens + outputTokens)

        return {
          responseId: response.id,
          model: response.model || params.model,
          outputText: (response.output_text ?? '').trim(),
          toolCalls,
          inputTokens,
          outputTokens,
          totalTokens,
          rawOutputItems: rawItems,
        }
      } catch (err) {
        lastError = err
        if (params.signal?.aborted) {
          throw new NoriAIError({
            code: 'AI_ABORTED',
            status: 499,
            retryable: false,
            userMessage: 'Yêu cầu đã được dừng theo thao tác của bạn.',
          })
        }
        if (timeoutController.signal.aborted && !params.signal?.aborted) {
          lastError = new NoriAIError({
            code: 'AI_TIMEOUT',
            status: 504,
            retryable: true,
            userMessage:
              'Trợ lý AI phản hồi chậm hơn dự kiến và đã hết thời gian chờ. Bạn có thể thử lại hoặc dùng bộ lọc tìm xe trực tiếp.',
          })
        }

        if (attempt < MAX_RETRIES && isTransientRetryableError(lastError)) {
          const jitter = Math.floor(Math.random() * 150)
          await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt) + jitter, params.signal)
          continue
        }
        throw mapToNoriAIError(lastError)
      } finally {
        clearTimeout(timer)
        params.signal?.removeEventListener('abort', onCallerAbort)
      }
    }

    throw mapToNoriAIError(lastError)
  }

  async ping(params: {
    model: string
    timeoutMs: number
  }): Promise<{ ok: boolean; model: string; latencyMs: number; message: string }> {
    const started = performance.now()
    try {
      const client = this.createClient(Math.min(params.timeoutMs, 15_000))
      const response = await client.responses.create({
        model: params.model,
        instructions: 'Reply with a single word: OK',
        input: 'Health check ping',
        max_output_tokens: 16,
        store: false,
      })
      const latencyMs = Math.round(performance.now() - started)
      return {
        ok: true,
        model: response.model || params.model,
        latencyMs,
        message: `Kết nối OpenAI Responses API thành công (${latencyMs} ms, model: ${response.model || params.model}).`,
      }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started)
      const mapped = mapToNoriAIError(error)
      return {
        ok: false,
        model: params.model,
        latencyMs,
        message: `${mapped.userMessage} (${mapped.code}: ${sanitizeErrorMessage(mapped.message)})`,
      }
    }
  }
}
