import crypto from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import {
  getAIRuntimeConfig,
  getGeminiApiKeyServerOnly,
  getGeminiModelCapabilities,
  isGeminiModelInFreeTierAllowlist,
  resolveSupportedGeminiModel,
} from './config.ts'
import { mapToNoriAIError, NoriAIError } from './errors.ts'
import { redactSensitiveData } from './guardrails.ts'
import type {
  AIConnectionStatus,
  AIProvider,
  AIProviderInputItem,
  AIProviderToolCall,
  AIProviderTurnResult,
  AIToolDefinition,
  NoriAIIntent,
} from './types.ts'

// Free-Tier policy: NEVER retry 429 / quota / auth / model errors.
// At most 1 short retry for transient 5xx / network glitches.
const MAX_TRANSIENT_RETRIES = 1
const BASE_BACKOFF_MS = 450

type GeminiHealthSnapshot = {
  lastCheckedAt: string | null
  lastStatus: AIConnectionStatus | null
  lastLatencyMs: number | null
  lastErrorCode: string | null
  verifiedLiveRequest: boolean
}

const geminiHealthState: GeminiHealthSnapshot = {
  lastCheckedAt: null,
  lastStatus: null,
  lastLatencyMs: null,
  lastErrorCode: null,
  verifiedLiveRequest: false,
}

export function getGeminiRuntimeHealthSnapshot(): GeminiHealthSnapshot {
  return { ...geminiHealthState }
}

export function recordGeminiLiveSuccess(latencyMs: number): void {
  geminiHealthState.lastCheckedAt = new Date().toISOString()
  geminiHealthState.lastStatus = 'GEMINI_CONNECTED'
  geminiHealthState.lastLatencyMs = Math.max(0, Math.round(latencyMs))
  geminiHealthState.lastErrorCode = null
  geminiHealthState.verifiedLiveRequest = true
}

export function recordGeminiLiveFailure(errorCode: string): void {
  geminiHealthState.lastCheckedAt = new Date().toISOString()
  geminiHealthState.lastErrorCode = errorCode
  if (errorCode === 'AI_UNCONFIGURED') {
    geminiHealthState.lastStatus = 'API_CONFIG_MISSING'
  } else if (errorCode === 'AI_QUOTA_EXCEEDED' || errorCode === 'AI_RATE_LIMITED') {
    geminiHealthState.lastStatus = 'QUOTA_EXCEEDED'
  } else {
    geminiHealthState.lastStatus = 'CONNECTION_ERROR'
  }
}

export function resetGeminiHealthStateForTests(): void {
  geminiHealthState.lastCheckedAt = null
  geminiHealthState.lastStatus = null
  geminiHealthState.lastLatencyMs = null
  geminiHealthState.lastErrorCode = null
  geminiHealthState.verifiedLiveRequest = false
}

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

function stripUnsupportedJsonSchemaKeys(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }
  const src = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(src)) {
    if (key === 'additionalProperties') continue
    if (key === 'properties' && val && typeof val === 'object' && !Array.isArray(val)) {
      const props: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(val as Record<string, unknown>)) {
        props[pk] =
          pv && typeof pv === 'object' && !Array.isArray(pv)
            ? stripUnsupportedJsonSchemaKeys(pv)
            : pv
      }
      out.properties = props
    } else if (key === 'items' && val && typeof val === 'object' && !Array.isArray(val)) {
      out.items = stripUnsupportedJsonSchemaKeys(val)
    } else {
      out[key] = val
    }
  }
  return out
}

type InteractionStepPayload = Record<string, unknown>

/**
 * Maps allowlisted NORI tools to `@google/genai` v3.6+ Interactions API function tool declarations.
 * Explicitly excludes Google Search, Google Maps, Code Execution, and URL Context.
 */
function mapToolsToInteractions(tools: AIToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: stripUnsupportedJsonSchemaKeys(tool.parameters),
  }))
}

/**
 * Converts NORI's stateless conversation items into `@google/genai` Interactions API `steps` input,
 * redacting PII/secrets from user messages and preserving `thought` signatures + `function_call` / `function_result`.
 */
function mapInputToInteractionSteps(items: AIProviderInputItem[]): InteractionStepPayload[] {
  const steps: InteractionStepPayload[] = []
  const callNamesById = new Map<string, string>()

  for (const item of items) {
    if (item.type === 'message') {
      const text =
        item.role === 'user' ? redactSensitiveData(item.content, 1000) : item.content.trim()
      if (!text) continue
      steps.push({
        type: item.role === 'assistant' ? 'model_output' : 'user_input',
        content: [{ type: 'text', text }],
      })
      continue
    }

    if (item.type === 'thought') {
      steps.push({
        type: 'thought',
        signature: item.signature,
        ...(item.summary ? { summary: item.summary } : {}),
      })
      continue
    }

    if (item.type === 'function_call') {
      callNamesById.set(item.call_id, item.name)
      if (item.thoughtSignature) {
        const prev = steps[steps.length - 1]
        if (!prev || prev.type !== 'thought' || prev.signature !== item.thoughtSignature) {
          steps.push({ type: 'thought', signature: item.thoughtSignature })
        }
      }
      steps.push({
        type: 'function_call',
        id: item.call_id,
        name: item.name,
        arguments: safeParseJsonObject(item.arguments),
      })
      continue
    }

    if (item.type === 'function_call_output') {
      const fnName = item.name || callNamesById.get(item.call_id) || 'unknownTool'
      steps.push({
        type: 'function_result',
        call_id: item.call_id,
        name: fnName,
        result: [{ type: 'text', text: item.output }],
      })
    }
  }

  return steps
}

export type GeminiStructuredCustomerQuery = {
  intent: NoriAIIntent
  vehicleModel: string | null
  brand: string | null
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  minSeats: number | null
  maxBudgetPerDay: number | null
  strictBudget: boolean
  fuelType: string | null
  transmission: string | null
  startDate: string | null
  endDate: string | null
  durationDays: number | null
  needsClarification: boolean
}

export const GEMINI_CUSTOMER_QUERY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'VEHICLE_LOOKUP',
        'BRAND_LOOKUP',
        'VEHICLE_RECOMMENDATION',
        'AVAILABILITY_CHECK',
        'PRICE_QUOTE',
        'VEHICLE_COMPARISON',
        'PROMOTION_QUERY',
        'BOOKING_GUIDANCE',
        'BOOKING_STATUS',
        'RENTAL_POLICY',
        'PURCHASE_CONSULTATION',
        'GREETING',
        'CLARIFICATION',
        'OUT_OF_SCOPE',
      ],
    },
    vehicleModel: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], enum: ['CAR', 'MOTORBIKE', 'PICKUP', null] },
    minSeats: { type: ['integer', 'null'] },
    maxBudgetPerDay: { type: ['number', 'null'] },
    strictBudget: { type: 'boolean' },
    fuelType: { type: ['string', 'null'] },
    transmission: { type: ['string', 'null'] },
    startDate: { type: ['string', 'null'] },
    endDate: { type: ['string', 'null'] },
    durationDays: { type: ['integer', 'null'] },
    needsClarification: { type: 'boolean' },
  },
  required: [
    'intent',
    'vehicleModel',
    'brand',
    'category',
    'minSeats',
    'maxBudgetPerDay',
    'strictBudget',
    'needsClarification',
  ],
}

/**
 * Official Google Gemini Provider using `@google/genai` v3.6+ GA Interactions API (`ai.interactions.create`).
 * - Strict Free-Tier-Only model allowlist guard & deprecated model remapping (`gemini-3.5-flash-lite` default).
 * - Server-only `GEMINI_API_KEY` (never returned or logged).
 * - Stateless (`store: false`) for customer privacy with full multi-round `thought` + `function_call` + `function_result`.
 * - Supports Structured Output (`response_format` JSON Schema) for intent/entity extraction and health verification.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const

  private assertModelAllowed(rawModel: string): string {
    const runtime = getAIRuntimeConfig()
    if (runtime.freeTierOnly && !isGeminiModelInFreeTierAllowlist(rawModel)) {
      throw new NoriAIError({
        code: 'AI_MODEL_NOT_FREE_TIER',
        status: 503,
        retryable: false,
        userMessage: `Model "${rawModel}" không nằm trong danh sách Gemini Free Tier được phép của NORI.`,
        message: `Blocked non-free-tier Gemini model: ${rawModel}`,
      })
    }
    return resolveSupportedGeminiModel(rawModel).effectiveModel
  }

  private createClient(): GoogleGenAI {
    const apiKey = getGeminiApiKeyServerOnly()
    if (!apiKey) {
      recordGeminiLiveFailure('AI_UNCONFIGURED')
      throw new NoriAIError({
        code: 'AI_UNCONFIGURED',
        status: 503,
        retryable: false,
        userMessage: 'Trợ lý AI đang hoạt động ở chế độ tư vấn cơ bản trực tiếp từ dữ liệu NORI.',
        message: 'GEMINI_API_KEY is not configured on server',
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
    const started = performance.now()
    const model = this.assertModelAllowed(params.model)
    const client = this.createClient()
    const stepsInput = mapInputToInteractionSteps(params.input)
    const tools = params.tools.length > 0 ? mapToolsToInteractions(params.tools) : undefined

    let lastError: unknown = null

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const onCallerAbort = () => {}
      params.signal?.addEventListener('abort', onCallerAbort, { once: true })

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            reject(new Error('Request timed out'))
          }, params.timeoutMs)
        })

        const interactionPromise = client.interactions.create({
          model,
          store: false,
          system_instruction: params.instructions,
          input: stepsInput as never,
          ...(tools ? { tools: tools as never } : {}),
          generation_config: {
            max_output_tokens: params.maxOutputTokens,
            temperature: 0.15,
          },
        } as never)

        const interaction = (await Promise.race([
          interactionPromise,
          timeoutPromise,
        ])) as unknown as {
          id?: string
          status?: string
          output_text?: string | null
          steps?: Array<Record<string, unknown>>
          usage?: {
            total_tokens?: number
            total_input_tokens?: number
            total_output_tokens?: number
            total_thought_tokens?: number
          }
        }

        const steps = Array.isArray(interaction.steps) ? interaction.steps : []
        const toolCalls: AIProviderToolCall[] = []
        const rawItems: AIProviderInputItem[] = []
        const textChunks: string[] = []

        for (const step of steps) {
          const stepType = String(step.type ?? '')
          if (stepType === 'thought' && typeof step.signature === 'string') {
            rawItems.push({
              type: 'thought',
              signature: step.signature,
              ...(typeof step.summary === 'string' ? { summary: step.summary } : {}),
            })
            continue
          }
          if (stepType === 'function_call' && typeof step.name === 'string' && step.name) {
            const callId =
              typeof step.id === 'string' && step.id
                ? step.id
                : `gem-call-${crypto.randomUUID().slice(0, 10)}`
            const argsJson = JSON.stringify(
              step.arguments && typeof step.arguments === 'object' ? step.arguments : {},
            )
            toolCalls.push({
              callId,
              name: step.name,
              argumentsJson: argsJson,
            })
            rawItems.push({
              type: 'function_call',
              call_id: callId,
              name: step.name,
              arguments: argsJson,
            })
            continue
          }
          if (stepType === 'model_output' && Array.isArray(step.content)) {
            for (const part of step.content as Array<Record<string, unknown>>) {
              if (part?.type === 'text' && typeof part.text === 'string' && part.text) {
                textChunks.push(part.text)
              }
            }
          }
        }

        const outputText = (
          (typeof interaction.output_text === 'string' ? interaction.output_text : '') ||
          textChunks.join('\n')
        ).trim()

        if (outputText && toolCalls.length === 0) {
          rawItems.push({ type: 'message', role: 'assistant', content: outputText })
        }

        const inputTokens = Number(interaction.usage?.total_input_tokens ?? 0)
        const outputTokens =
          Number(interaction.usage?.total_output_tokens ?? 0) +
          Number(interaction.usage?.total_thought_tokens ?? 0)
        const totalTokens = Number(interaction.usage?.total_tokens ?? inputTokens + outputTokens)

        recordGeminiLiveSuccess(performance.now() - started)

        return {
          responseId: interaction.id || `gem-inter-${crypto.randomUUID().slice(0, 10)}`,
          model,
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
        if (timedOut) {
          lastError = new NoriAIError({
            code: 'AI_TIMEOUT',
            status: 504,
            retryable: true,
            userMessage:
              'Trợ lý AI phản hồi chậm hơn dự kiến. Hệ thống đã sẵn sàng hỗ trợ qua dữ liệu NORI trực tiếp.',
          })
        }

        if (attempt < MAX_TRANSIENT_RETRIES && isRetryableTransient5xx(lastError)) {
          await sleep(BASE_BACKOFF_MS + Math.floor(Math.random() * 120), params.signal)
          continue
        }
        const mapped = mapToNoriAIError(lastError)
        recordGeminiLiveFailure(mapped.code)
        throw mapped
      } finally {
        if (timer) clearTimeout(timer)
        params.signal?.removeEventListener('abort', onCallerAbort)
      }
    }

    const mapped = mapToNoriAIError(lastError)
    recordGeminiLiveFailure(mapped.code)
    throw mapped
  }

  /**
   * Structured Output helper using Gemini Interactions API `response_format` JSON Schema.
   * Constrains Gemini to return strictly valid JSON for intent & entity extraction without fabricating fleet data.
   */
  async generateStructuredJson<T>(params: {
    model: string
    instructions: string
    prompt: string
    schema: Record<string, unknown>
    maxOutputTokens?: number
    timeoutMs: number
  }): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
    const started = performance.now()
    const model = this.assertModelAllowed(params.model)
    const client = this.createClient()
    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Request timed out')), params.timeoutMs)
      })

      const interactionPromise = client.interactions.create({
        model,
        store: false,
        system_instruction: params.instructions,
        input: redactSensitiveData(params.prompt, 1000),
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: stripUnsupportedJsonSchemaKeys(params.schema),
        },
        generation_config: {
          max_output_tokens: params.maxOutputTokens ?? 320,
          temperature: 0,
        },
      } as never)

      const interaction = (await Promise.race([interactionPromise, timeoutPromise])) as unknown as {
        output_text?: string | null
        usage?: { total_input_tokens?: number; total_output_tokens?: number }
      }

      const rawText = (interaction.output_text ?? '{}').trim()
      const parsed = JSON.parse(rawText) as T
      recordGeminiLiveSuccess(performance.now() - started)

      return {
        data: parsed,
        inputTokens: Number(interaction.usage?.total_input_tokens ?? 0),
        outputTokens: Number(interaction.usage?.total_output_tokens ?? 0),
      }
    } catch (err) {
      const mapped = mapToNoriAIError(err)
      recordGeminiLiveFailure(mapped.code)
      throw mapped
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async classifyCustomerQueryStructured(params: {
    model: string
    prompt: string
    timeoutMs: number
  }): Promise<{
    analysis: GeminiStructuredCustomerQuery
    inputTokens: number
    outputTokens: number
  }> {
    const res = await this.generateStructuredJson<GeminiStructuredCustomerQuery>({
      model: params.model,
      instructions:
        'Phân tích câu hỏi tiếng Việt của khách thuê/mua xe NORI thành JSON theo đúng schema. Không tự bịa ngày thuê nếu khách không nêu.',
      prompt: params.prompt,
      schema: GEMINI_CUSTOMER_QUERY_JSON_SCHEMA,
      maxOutputTokens: 256,
      timeoutMs: params.timeoutMs,
    })
    return {
      analysis: res.data,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    }
  }

  /**
   * Verifies real Gemini connectivity (`models.get` + lightweight `interactions.create` JSON handshake)
   * so `Gemini Connected` is ONLY reported when a real API request succeeds!
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
      const effectiveTimeout = Math.min(params.timeoutMs, 15_000)

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), effectiveTimeout),
      )

      const modelMeta = await Promise.race([client.models.get({ model }), timeoutPromise])

      // Execute a minimal 20-token Structured Output handshake (`store: false`) to prove live generation quota & auth
      const probe = await this.generateStructuredJson<{ status: string }>({
        model,
        instructions: 'Return JSON {"status":"ok"}',
        prompt: 'ping',
        schema: {
          type: 'object',
          properties: { status: { type: 'string' } },
          required: ['status'],
        },
        maxOutputTokens: 32,
        timeoutMs: effectiveTimeout,
      })

      const latencyMs = Math.round(performance.now() - started)
      if (!probe.data || typeof probe.data.status !== 'string') {
        recordGeminiLiveFailure('AI_PROVIDER_ERROR')
        return {
          ok: false,
          model,
          latencyMs,
          message: 'Gemini phản hồi không đúng cấu trúc JSON kỳ vọng.',
        }
      }

      recordGeminiLiveSuccess(latencyMs)
      return {
        ok: true,
        model,
        latencyMs,
        message: `Gemini Connected (${modelMeta.displayName || model}, ${latencyMs}ms · Interactions API v1 · Function Calling: ${cap?.supportsFunctionCalling ? 'Có' : 'Theo model'} · Structured Output: ${cap?.supportsStructuredOutputs ? 'Có' : 'Theo model'}).`,
      }
    } catch (err) {
      const mapped = mapToNoriAIError(err)
      recordGeminiLiveFailure(mapped.code)
      return {
        ok: false,
        model: resolveSupportedGeminiModel(params.model).effectiveModel,
        latencyMs: Math.round(performance.now() - started),
        message: mapped.userMessage,
      }
    }
  }
}
