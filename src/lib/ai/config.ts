import type {
  AIProviderName,
  AIQuickSuggestion,
  AIResolvedConfig,
  AIRuntimeConfig,
  AISettingsData,
  RecommendationWeights,
} from './types.ts'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'

export type GeminiModelCapability = {
  label: string
  supportsFunctionCalling: boolean
  supportsStructuredOutputs: boolean
  documentedFreeTier: true
  docsUrl: string
}

/**
 * Models officially documented by Google Gemini API (ai.google.dev/gemini-api/docs/models & pricing)
 * as having a Free Tier quota. NORI never auto-upgrades or falls back to paid-only models.
 */
export const GEMINI_FREE_TIER_MODELS: Readonly<Record<string, GeminiModelCapability>> = {
  'gemini-3.5-flash-lite': {
    label: 'Gemini 3.5 Flash-Lite',
    supportsFunctionCalling: true,
    supportsStructuredOutputs: true,
    documentedFreeTier: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  'gemini-2.5-flash-lite': {
    label: 'Gemini 2.5 Flash-Lite',
    supportsFunctionCalling: true,
    supportsStructuredOutputs: true,
    documentedFreeTier: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  'gemini-2.5-flash': {
    label: 'Gemini 2.5 Flash',
    supportsFunctionCalling: true,
    supportsStructuredOutputs: true,
    documentedFreeTier: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  'gemini-2.0-flash': {
    label: 'Gemini 2.0 Flash',
    supportsFunctionCalling: true,
    supportsStructuredOutputs: true,
    documentedFreeTier: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  'gemini-2.0-flash-lite': {
    label: 'Gemini 2.0 Flash-Lite',
    supportsFunctionCalling: true,
    supportsStructuredOutputs: true,
    documentedFreeTier: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
}

export function normalizeGeminiModelId(model: string): string {
  return model
    .trim()
    .replace(/^models\//i, '')
    .toLowerCase()
}

export function isGeminiModelInFreeTierAllowlist(model: string): boolean {
  const norm = normalizeGeminiModelId(model)
  return norm in GEMINI_FREE_TIER_MODELS
}

export function getGeminiModelCapabilities(model: string): GeminiModelCapability | null {
  const norm = normalizeGeminiModelId(model)
  return GEMINI_FREE_TIER_MODELS[norm] ?? null
}

export const DEFAULT_GREETING_MESSAGE =
  'Xin chào! Tôi là Trợ lý AI của NORI. Tôi có thể giúp bạn tìm xe phù hợp nhu cầu & ngân sách, kiểm tra lịch trống, tính báo giá thuê xe và giải đáp chính sách của NORI.'

export const DEFAULT_QUICK_SUGGESTIONS: AIQuickSuggestion[] = [
  {
    label: 'Xe gia đình dưới 1.5 triệu/ngày',
    prompt: 'Tư vấn giúp tôi xe ô tô đi gia đình 5-7 chỗ ngân sách dưới 1.5 triệu/ngày',
  },
  {
    label: 'Xe máy đi phố tiết kiệm',
    prompt: 'Gợi ý xe máy tay ga tiết kiệm nhiên liệu đi trong thành phố',
  },
  {
    label: 'Tính giá thuê 3 ngày cuối tuần',
    prompt: 'Tính giúp tôi chi phí thuê Toyota Fortuner 3 ngày từ ngày mai',
  },
  {
    label: 'Khuyến mãi đang có',
    prompt: 'Hiện tại NORI đang có chương trình khuyến mãi hoặc mã giảm giá nào công khai?',
  },
  {
    label: 'Chính sách đặt cọc & hủy đơn',
    prompt: 'Quy định đặt cọc, giấy tờ thuê xe và chính sách hủy đơn của NORI như thế nào?',
  },
]

export const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  budget: 35,
  purpose: 25,
  capacity: 20,
  rating: 10,
  fuel: 10,
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback
  const norm = raw.trim().toLowerCase()
  if (['false', '0', 'no', 'off'].includes(norm)) return false
  if (['true', '1', 'yes', 'on'].includes(norm)) return true
  return fallback
}

function parseIntClamped(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const num = Number(raw)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

function parseFloatClamped(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const num = Number(raw)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Number(num.toFixed(2))))
}

/**
 * Reads runtime environment config for NORI AI.
 * NEVER returns or exposes GEMINI_API_KEY / OPENAI_API_KEY value — only boolean `apiKeyConfigured`.
 */
export function getAIRuntimeConfig(): AIRuntimeConfig {
  const envEnabled = parseBoolEnv(process.env.NORI_AI_ENABLED, true)
  const testMockEnabled =
    process.env.NORI_AI_TEST_MOCK === '1' && process.env.NORI_ALLOW_PROD_MOCK !== '1'
      ? process.env.NORI_AI_TEST_MOCK === '1'
      : false
  const freeTierOnly = parseBoolEnv(process.env.NORI_AI_FREE_TIER_ONLY, true)
  const paidProvidersAllowed =
    !freeTierOnly && parseBoolEnv(process.env.NORI_AI_PAID_PROVIDERS_ALLOWED, false)
  const fallbackEnabled = parseBoolEnv(process.env.NORI_AI_FALLBACK_ENABLED, true)

  const rawProvider = (process.env.NORI_AI_PROVIDER?.trim() || 'gemini').toLowerCase()
  const provider: AIProviderName = testMockEnabled
    ? 'mock'
    : rawProvider === 'openai'
      ? 'openai'
      : 'gemini'

  const model =
    provider === 'openai'
      ? process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
      : process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL

  const apiKeyConfigured =
    provider === 'openai'
      ? Boolean(process.env.OPENAI_API_KEY?.trim())
      : Boolean(process.env.GEMINI_API_KEY?.trim())

  return {
    envEnabled,
    provider,
    model,
    apiKeyConfigured,
    freeTierOnly,
    paidProvidersAllowed,
    fallbackEnabled,
    maxOutputTokensCap: parseIntClamped(process.env.NORI_AI_MAX_OUTPUT_TOKENS, 1024, 150, 2048),
    maxToolRoundsCap: parseIntClamped(process.env.NORI_AI_MAX_TOOL_ROUNDS, 3, 1, 6),
    rateLimitPerMinuteCap: parseIntClamped(process.env.NORI_AI_RATE_LIMIT_PER_MINUTE, 3, 1, 60),
    rateLimitPerDayCap: parseIntClamped(process.env.NORI_AI_RATE_LIMIT_PER_DAY, 20, 1, 1000),
    projectRateLimitPerMinuteCap: parseIntClamped(process.env.NORI_AI_PROJECT_RPM_CAP, 10, 1, 60),
    projectRateLimitPerDayCap: parseIntClamped(process.env.NORI_AI_PROJECT_RPD_CAP, 200, 1, 1500),
    ipRateLimitPerMinuteCap: parseIntClamped(process.env.NORI_AI_IP_RPM_CAP, 6, 1, 60),
    ipRateLimitPerDayCap: parseIntClamped(process.env.NORI_AI_IP_RPD_CAP, 40, 1, 500),
    timeoutMs: parseIntClamped(process.env.NORI_AI_TIMEOUT_MS, 30_000, 3_000, 60_000),
    dailyBudgetUsdCap: freeTierOnly
      ? 0
      : parseFloatClamped(process.env.NORI_AI_DAILY_BUDGET_USD, 5, 0, 500),
    storeConversations: parseBoolEnv(process.env.NORI_AI_STORE_CONVERSATIONS, false),
    testMockEnabled,
  }
}

/**
 * Server-internal helper to fetch the Gemini API key at provider invocation time.
 * Never log, serialize, or return this value to clients.
 */
export function getGeminiApiKeyServerOnly(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim()
  return key && key.length > 0 ? key : null
}

/**
 * Server-internal helper to fetch the OpenAI API key at provider invocation time.
 * Blocked when `freeTierOnly` is true or `paidProvidersAllowed` is false.
 */
export function getOpenAIApiKeyServerOnly(): string | null {
  const runtime = getAIRuntimeConfig()
  if (runtime.freeTierOnly || !runtime.paidProvidersAllowed) return null
  const key = process.env.OPENAI_API_KEY?.trim()
  return key && key.length > 0 ? key : null
}

export function normalizeRecommendationWeights(
  input?: Partial<RecommendationWeights> | null,
): RecommendationWeights {
  const raw: RecommendationWeights = {
    budget:
      typeof input?.budget === 'number' && Number.isFinite(input.budget) && input.budget >= 0
        ? input.budget
        : DEFAULT_RECOMMENDATION_WEIGHTS.budget,
    purpose:
      typeof input?.purpose === 'number' && Number.isFinite(input.purpose) && input.purpose >= 0
        ? input.purpose
        : DEFAULT_RECOMMENDATION_WEIGHTS.purpose,
    capacity:
      typeof input?.capacity === 'number' && Number.isFinite(input.capacity) && input.capacity >= 0
        ? input.capacity
        : DEFAULT_RECOMMENDATION_WEIGHTS.capacity,
    rating:
      typeof input?.rating === 'number' && Number.isFinite(input.rating) && input.rating >= 0
        ? input.rating
        : DEFAULT_RECOMMENDATION_WEIGHTS.rating,
    fuel:
      typeof input?.fuel === 'number' && Number.isFinite(input.fuel) && input.fuel >= 0
        ? input.fuel
        : DEFAULT_RECOMMENDATION_WEIGHTS.fuel,
  }
  const sum = raw.budget + raw.purpose + raw.capacity + raw.rating + raw.fuel
  if (sum <= 0) return { ...DEFAULT_RECOMMENDATION_WEIGHTS }
  if (Math.abs(sum - 100) < 0.01) return raw
  return {
    budget: Number(((raw.budget / sum) * 100).toFixed(2)),
    purpose: Number(((raw.purpose / sum) * 100).toFixed(2)),
    capacity: Number(((raw.capacity / sum) * 100).toFixed(2)),
    rating: Number(((raw.rating / sum) * 100).toFixed(2)),
    fuel: Number(((raw.fuel / sum) * 100).toFixed(2)),
  }
}

/**
 * Combines immutable server-side environment ceilings with Admin-editable database settings.
 * Admin settings can tighten limits or toggle AI off, but cannot bypass hard server cost caps
 * or inject an API key through the database.
 */
export function resolveEffectiveAIConfig(
  dbSettings?: Partial<AISettingsData> | null,
): AIResolvedConfig {
  const runtime = getAIRuntimeConfig()
  const dbEnabled = dbSettings?.enabled !== undefined ? Boolean(dbSettings.enabled) : true
  const enabled = runtime.envEnabled && dbEnabled
  const configured = runtime.testMockEnabled || runtime.apiKeyConfigured

  const suggestions =
    Array.isArray(dbSettings?.quickSuggestions) && dbSettings.quickSuggestions.length > 0
      ? dbSettings.quickSuggestions
          .filter((s) => s && typeof s.label === 'string' && typeof s.prompt === 'string')
          .map((s) => ({
            label: s.label.trim().slice(0, 80),
            prompt: s.prompt.trim().slice(0, 240),
          }))
          .filter((s) => s.label && s.prompt)
          .slice(0, 8)
      : DEFAULT_QUICK_SUGGESTIONS

  const clampAgainstCap = (val: unknown, cap: number, min: number): number => {
    const n = typeof val === 'number' && Number.isFinite(val) ? val : cap
    return Math.max(min, Math.min(cap, Math.round(n)))
  }

  const dailyBudget = runtime.freeTierOnly
    ? 0
    : typeof dbSettings?.dailyBudgetUsd === 'number' && Number.isFinite(dbSettings.dailyBudgetUsd)
      ? Math.max(0, Math.min(runtime.dailyBudgetUsdCap, dbSettings.dailyBudgetUsd))
      : runtime.dailyBudgetUsdCap

  return {
    enabled,
    configured,
    provider: runtime.provider,
    model: runtime.model,
    freeTierOnly: runtime.freeTierOnly,
    paidProvidersAllowed: runtime.paidProvidersAllowed,
    fallbackEnabled: runtime.fallbackEnabled,
    maxOutputTokens: clampAgainstCap(dbSettings?.maxOutputTokens, runtime.maxOutputTokensCap, 200),
    maxToolRounds: clampAgainstCap(dbSettings?.maxToolRounds, runtime.maxToolRoundsCap, 1),
    rateLimitPerMinute: clampAgainstCap(
      dbSettings?.rateLimitPerMinute,
      runtime.rateLimitPerMinuteCap,
      1,
    ),
    rateLimitPerDay: clampAgainstCap(dbSettings?.rateLimitPerDay, runtime.rateLimitPerDayCap, 1),
    projectRateLimitPerMinute: runtime.projectRateLimitPerMinuteCap,
    projectRateLimitPerDay: runtime.projectRateLimitPerDayCap,
    ipRateLimitPerMinute: runtime.ipRateLimitPerMinuteCap,
    ipRateLimitPerDay: runtime.ipRateLimitPerDayCap,
    timeoutMs: runtime.timeoutMs,
    dailyBudgetUsd: dailyBudget,
    storeConversations: runtime.storeConversations,
    greetingMessage:
      typeof dbSettings?.greetingMessage === 'string' && dbSettings.greetingMessage.trim()
        ? dbSettings.greetingMessage.trim().slice(0, 500)
        : DEFAULT_GREETING_MESSAGE,
    quickSuggestions: suggestions,
    weights: normalizeRecommendationWeights(dbSettings?.weights),
    knowledgeNote:
      typeof dbSettings?.knowledgeNote === 'string' && dbSettings.knowledgeNote.trim()
        ? dbSettings.knowledgeNote.trim().slice(0, 3000)
        : null,
  }
}

export function mapGlobalDocToAISettings(
  doc: Record<string, unknown> | null | undefined,
): AISettingsData {
  const raw = doc ?? {}
  const quickSuggestions: AIQuickSuggestion[] = Array.isArray(raw.quickSuggestions)
    ? (raw.quickSuggestions as Record<string, unknown>[])
        .map((item) => ({
          label: typeof item?.label === 'string' ? item.label.trim() : '',
          prompt: typeof item?.prompt === 'string' ? item.prompt.trim() : '',
        }))
        .filter((item) => item.label && item.prompt)
    : DEFAULT_QUICK_SUGGESTIONS

  return {
    enabled: raw.enabled !== false,
    greetingMessage:
      typeof raw.greetingMessage === 'string' && raw.greetingMessage.trim()
        ? raw.greetingMessage.trim()
        : DEFAULT_GREETING_MESSAGE,
    quickSuggestions: quickSuggestions.length > 0 ? quickSuggestions : DEFAULT_QUICK_SUGGESTIONS,
    maxOutputTokens:
      typeof raw.maxOutputTokens === 'number' && Number.isFinite(raw.maxOutputTokens)
        ? raw.maxOutputTokens
        : 1000,
    maxToolRounds:
      typeof raw.maxToolRounds === 'number' && Number.isFinite(raw.maxToolRounds)
        ? raw.maxToolRounds
        : 5,
    rateLimitPerMinute:
      typeof raw.rateLimitPerMinute === 'number' && Number.isFinite(raw.rateLimitPerMinute)
        ? raw.rateLimitPerMinute
        : 5,
    rateLimitPerDay:
      typeof raw.rateLimitPerDay === 'number' && Number.isFinite(raw.rateLimitPerDay)
        ? raw.rateLimitPerDay
        : 30,
    dailyBudgetUsd:
      typeof raw.dailyBudgetUsd === 'number' && Number.isFinite(raw.dailyBudgetUsd)
        ? raw.dailyBudgetUsd
        : 5,
    weights: normalizeRecommendationWeights({
      budget: typeof raw.weightBudget === 'number' ? raw.weightBudget : undefined,
      purpose: typeof raw.weightPurpose === 'number' ? raw.weightPurpose : undefined,
      capacity: typeof raw.weightCapacity === 'number' ? raw.weightCapacity : undefined,
      rating: typeof raw.weightRating === 'number' ? raw.weightRating : undefined,
      fuel: typeof raw.weightFuel === 'number' ? raw.weightFuel : undefined,
    }),
    knowledgeNote:
      typeof raw.knowledgeNote === 'string' && raw.knowledgeNote.trim()
        ? raw.knowledgeNote.trim()
        : null,
    updatedByEmail: typeof raw.updatedByEmail === 'string' ? raw.updatedByEmail : null,
  }
}
