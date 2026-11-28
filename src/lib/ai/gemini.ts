import crypto from 'node:crypto'
import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type Part,
  type Tool,
} from '@google/genai'
import {
  getAIRuntimeConfig,
  getGeminiApiKeyServerOnly,
  getGeminiModelCapabilities,
  isGeminiModelInFreeTierAllowlist,
  normalizeGeminiModelId,
} from './config.ts'
import { mapToNoriAIError, NoriAIError } from './errors.ts'
import { redactSensitiveData } from './guardrails.ts'
import type {
  AIProvider,
  AIProviderInputItem,
  AIProviderToolCall,
  AIProviderTurnResult,
  AIToolDefinition,
} from './types.ts'

// Free-Tier policy: NEVER retry 429 / quota / auth / model errors.
// At most 1 short retry for transient 5xx / network glitches.
const MAX_TRANSIENT_RETRIES = 1
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

function isRetryableTransient5xx(error: unknown): boolean {
  const mapped = mapToNoriAIError(error)
  if (
    mapped.code === 'AI_INVALID_API_KEY' ||
    mapped.code === 'AI_QUOTA_EXCEEDED' ||
    mapped.code === 'AI_RATE_LIMITED' ||
    mapped.code === 'AI_MODEL_UNAVAILABLE' ||
    mapped.code === 'AI_MODEL_NOT_FREE_TIER' ||
    mapped.code === 'AI_PAID_PROVIDER_BLOCKED' ||
    mapped.code === 'AI_ABORTED'
  ) {
    return false
  }
  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const status = typeof errObj.status === 'number' ? errObj.status : 0
  return status >= 500
}

function safeParseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return { raw }
  }
}

/**
 * Maps allowlisted NORI tool schemas into Gemini FunctionDeclarations.
 * Explicitly excludes Google Search Grounding, Google Maps Grounding, Code Execution, and URL Context
 * so zero paid or unapproved external grounding tools can be invoked.
 */
function mapToolsToGemini(tools: AIToolDefinition[]): Tool[] | undefined {
  if (tools.length === 0) return undefined
  const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }))
  return [{ functionDeclarations }]
}

/**
 * Converts NORI's provider-agnostic conversation items to Gemini `Content[]`,
 * redacting PII/secrets from user messages before leaving NORI servers
 * and grouping consecutive function calls / responses per turn.
 */
function mapInputToGeminiContents(items: AIProviderInputItem[]): Content[] {
  const contents: Content[] = []
  const callNamesById = new Map<string, string>()

  for (const item of items) {
    if (item.type === 'message') {
      const role = item.role === 'assistant' ? 'model' : 'user'
      const text =
        item.role === 'user' ? redactSensitiveData(item.content, 1000) : item.content.trim()
      if (!text) continue
      const part: Part = { text }
      const prev = contents[contents.length - 1]
      if (prev && prev.role === role && Array.isArray(prev.parts)) {
        prev.parts.push(part)
      } else {
        contents.push({ role, parts: [part] })
      }
      continue
    }

    if (item.type === 'function_call') {
      callNamesById.set(item.call_id, item.name)
      const part: Part = {
        functionCall: {
          id: item.call_id,
          name: item.name,
          args: safeParseJsonObject(item.arguments),
        },
        ...(item.thoughtSignature ? { thoughtSignature: item.thoughtSignature } : {}),
      }
      const prev = contents[contents.length - 1]
      if (prev && prev.role === 'model' && Array.isArray(prev.parts)) {
        prev.parts.push(part)
      } else {
        contents.push({ role: 'model', parts: [part] })
      }
      continue
    }

    if (item.type === 'function_call_output') {
      const fnName = callNamesById.get(item.call_id) ?? 'unknownTool'
      const parsedOutput = safeParseJsonObject(item.output)
      const part: Part = {
        functionResponse: {
          id: item.call_id,
          name: fnName,
          response: { output: parsedOutput },
        },
      }
      const prev = contents[contents.length - 1]
      if (prev && prev.role === 'user' && Array.isArray(prev.parts)) {
        prev.parts.push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
    }
  }

  return contents
}

/**
 * Official Google Gemini Provider using `@google/genai` SDK.
 * - Strict Free-Tier-Only model allowlist guard (never upgrades/switches to paid models).
 * - Server-only `GEMINI_API_KEY` (never returned or logged).
 * - Zero paid grounding tools (`googleSearch` / `googleMaps` omitted).
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const

  private assertModelAllowed(rawModel: string): string {
    const runtime = getAIRuntimeConfig()
    const normalizedModel = normalizeGeminiModelId(rawModel)
    if (runtime.freeTierOnly && !isGeminiModelInFreeTierAllowlist(normalizedModel)) {
      throw new NoriAIError({
        code: 'AI_MODEL_NOT_FREE_TIER',
        status: 503,
        retryable: false,
        userMessage: `Model "${rawModel}" không nằm trong danh sách Gemini Free Tier được phép của NORI.`,
        message: `Blocked non-free-tier Gemini model: ${normalizedModel}`,
      })
    }
    return normalizedModel
  }

  private createClient(): GoogleGenAI {
    const apiKey = getGeminiApiKeyServerOnly()
    if (!apiKey) {
      throw new NoriAIError({
        code: 'AI_UNCONFIGURED',
        status: 503,
        retryable: false,
        userMessage:
          'Trợ lý AI NORI chưa được cấu hình GEMINI_API_KEY trên máy chủ. Đang sử dụng chế độ tư vấn cơ bản.',
      })
    }
    return new GoogleGenAI({ apiKey })
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
    const model = this.assertModelAllowed(params.model)
    const client = this.createClient()
    const contents = mapInputToGeminiContents(params.input)
    const tools = mapToolsToGemini(params.tools)

    let lastError: unknown = null

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      const timeoutController = new AbortController()
      const timer = setTimeout(() => timeoutController.abort(), params.timeoutMs)
      const onCallerAbort = () => timeoutController.abort()
      params.signal?.addEventListener('abort', onCallerAbort, { once: true })

      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: params.instructions,
            tools,
            maxOutputTokens: params.maxOutputTokens,
            temperature: 0.2,
            abortSignal: timeoutController.signal,
          },
        })

        const parts = response.candidates?.[0]?.content?.parts ?? []
        const textChunks: string[] = []
        const toolCalls: AIProviderToolCall[] = []
        const rawItems: AIProviderInputItem[] = []

        for (const part of parts) {
          if (part.functionCall && part.functionCall.name) {
            const callId = part.functionCall.id || `gem-call-${crypto.randomUUID().slice(0, 10)}`
            const argsJson = JSON.stringify(part.functionCall.args ?? {})
            toolCalls.push({
              callId,
              name: part.functionCall.name,
              argumentsJson: argsJson,
            })
            rawItems.push({
              type: 'function_call',
              call_id: callId,
              name: part.functionCall.name,
              arguments: argsJson,
              ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
            })
          } else if (!part.thought && typeof part.text === 'string' && part.text.length > 0) {
            textChunks.push(part.text)
          }
        }

        // Fallback extraction if SDK exposes functionCalls getter without part list
        if (toolCalls.length === 0 && Array.isArray(response.functionCalls)) {
          for (const fc of response.functionCalls) {
            if (!fc.name) continue
            const callId = fc.id || `gem-call-${crypto.randomUUID().slice(0, 10)}`
            const argsJson = JSON.stringify(fc.args ?? {})
            toolCalls.push({ callId, name: fc.name, argumentsJson: argsJson })
            rawItems.push({
              type: 'function_call',
              call_id: callId,
              name: fc.name,
              arguments: argsJson,
            })
          }
        }

        const outputText = (textChunks.join('\n').trim() || response.text?.trim() || '').trim()
        if (outputText && toolCalls.length === 0) {
          rawItems.push({ type: 'message', role: 'assistant', content: outputText })
        }

        const inputTokens = Number(response.usageMetadata?.promptTokenCount ?? 0)
        const outputTokens =
          Number(response.usageMetadata?.candidatesTokenCount ?? 0) +
          Number(response.usageMetadata?.thoughtsTokenCount ?? 0)
        const totalTokens = Number(
          response.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
        )

        return {
          responseId: response.responseId || `gem-resp-${crypto.randomUUID().slice(0, 10)}`,
          model: response.modelVersion || model,
          outputText,
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
              'Trợ lý AI phản hồi chậm hơn dự kiến và đã hết thời gian chờ. Hệ thống có thể chuyển sang chế độ tư vấn cơ bản.',
          })
        }

        if (attempt < MAX_TRANSIENT_RETRIES && isRetryableTransient5xx(lastError)) {
          await sleep(BASE_BACKOFF_MS + Math.floor(Math.random() * 120), params.signal)
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

  /**
   * Optional Structured JSON extraction helper using Gemini `responseJsonSchema`
   * (used for capability verification or structured intent parsing without paid tools).
   */
  async generateStructuredJson<T>(params: {
    model: string
    instructions: string
    prompt: string
    schema: Record<string, unknown>
    maxOutputTokens?: number
    timeoutMs: number
  }): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    const model = this.assertModelAllowed(params.model)
    const client = this.createClient()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), params.timeoutMs)
    try {
      const response = await client.models.generateContent({
        model,
        contents: redactSensitiveData(params.prompt, 1000),
        config: {
          systemInstruction: params.instructions,
          responseMimeType: 'application/json',
          responseJsonSchema: params.schema,
          maxOutputTokens: params.maxOutputTokens ?? 512,
          temperature: 0,
          abortSignal: controller.signal,
        },
      })
      const rawText = (response.text ?? '{}').trim()
      return {
        data: JSON.parse(rawText) as T,
        inputTokens: Number(response.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(response.usageMetadata?.candidatesTokenCount ?? 0),
      }
    } catch (err) {
      throw mapToNoriAIError(err)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Checks API key authentication + model metadata availability via `ai.models.get`
   * without consuming generation quota or inferring Cloud Billing status.
   */
  async ping(params: {
    model: string
    timeoutMs: number
  }): Promise<{ ok: boolean; model: string; latencyMs: number; message: string }> {
    const started = performance.now()
    try {
      const model = this.assertModelAllowed(params.model)
      const client = this.createClient()
      const cap = getGeminiModelCapabilities(model)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timed out')),
          Math.min(params.timeoutMs, 15_000),
        ),
      )
      const modelMeta = await Promise.race([client.models.get({ model }), timeoutPromise])
      const supportsGen =
        !Array.isArray(modelMeta.supportedActions) ||
        modelMeta.supportedActions.includes('generateContent')
      const latencyMs = Math.round(performance.now() - started)

      if (!supportsGen) {
        return {
          ok: false,
          model,
          latencyMs,
          message: `Model ${model} không hỗ trợ generateContent trên project hiện tại.`,
        }
      }

      return {
        ok: true,
        model,
        latencyMs,
        message: `Kết nối Gemini API thành công (${modelMeta.displayName || model}, ${latencyMs}ms · Function Calling: ${cap?.supportsFunctionCalling ? 'Có' : 'Theo model'} · Structured Output: ${cap?.supportsStructuredOutputs ? 'Có' : 'Theo model'}). Lưu ý: Trạng thái Cloud Billing cần chủ dự án kiểm tra thủ công trong Google AI Studio.`,
      }
    } catch (err) {
      const mapped = mapToNoriAIError(err)
      return {
        ok: false,
        model: normalizeGeminiModelId(params.model),
        latencyMs: Math.round(performance.now() - started),
        message: mapped.userMessage,
      }
    }
  }
}
