export type AIProviderName = 'gemini' | 'openai' | 'mock' | 'rule-based-fallback'

export type AIUserRole = 'GUEST' | 'CUSTOMER' | 'ADMIN'

export type NoriAIIntent =
  | 'VEHICLE_LOOKUP'
  | 'BRAND_LOOKUP'
  | 'VEHICLE_RECOMMENDATION'
  | 'AVAILABILITY_CHECK'
  | 'PRICE_QUOTE'
  | 'VEHICLE_COMPARISON'
  | 'PROMOTION_QUERY'
  | 'BOOKING_GUIDANCE'
  | 'BOOKING_STATUS'
  | 'RENTAL_POLICY'
  | 'PURCHASE_CONSULTATION'
  | 'GREETING'
  | 'CLARIFICATION'
  | 'OUT_OF_SCOPE'

export type AIConnectionStatus =
  | 'GEMINI_CONNECTED'
  | 'FALLBACK_ACTIVE'
  | 'API_CONFIG_MISSING'
  | 'QUOTA_EXCEEDED'
  | 'CONNECTION_ERROR'
  | 'DISABLED'
  | 'MOCK_ACTIVE'

export type AIChatMessageInput = {
  role: 'user' | 'assistant'
  content: string
}

export type AIQuickSuggestion = {
  label: string
  prompt: string
}

export type RecommendationWeights = {
  budget: number
  purpose: number
  capacity: number
  rating: number
  fuel: number
}

export type AISettingsData = {
  enabled: boolean
  greetingMessage: string
  quickSuggestions: AIQuickSuggestion[]
  maxOutputTokens: number
  maxToolRounds: number
  rateLimitPerMinute: number
  rateLimitPerDay: number
  dailyBudgetUsd: number
  weights: RecommendationWeights
  knowledgeNote: string | null
  updatedByEmail: string | null
}

export type AIRuntimeConfig = {
  envEnabled: boolean
  provider: AIProviderName
  model: string
  configuredModelRaw: string
  modelRemappedFromDeprecated: boolean
  apiKeyConfigured: boolean
  freeTierOnly: boolean
  paidProvidersAllowed: boolean
  fallbackEnabled: boolean
  maxOutputTokensCap: number
  maxToolRoundsCap: number
  rateLimitPerMinuteCap: number
  rateLimitPerDayCap: number
  projectRateLimitPerMinuteCap: number
  projectRateLimitPerDayCap: number
  ipRateLimitPerMinuteCap: number
  ipRateLimitPerDayCap: number
  timeoutMs: number
  dailyBudgetUsdCap: number
  storeConversations: boolean
  testMockEnabled: boolean
}

export type AIResolvedConfig = {
  enabled: boolean
  configured: boolean
  provider: AIProviderName
  model: string
  freeTierOnly: boolean
  paidProvidersAllowed: boolean
  fallbackEnabled: boolean
  maxOutputTokens: number
  maxToolRounds: number
  rateLimitPerMinute: number
  rateLimitPerDay: number
  projectRateLimitPerMinute: number
  projectRateLimitPerDay: number
  ipRateLimitPerMinute: number
  ipRateLimitPerDay: number
  timeoutMs: number
  dailyBudgetUsd: number
  storeConversations: boolean
  greetingMessage: string
  quickSuggestions: AIQuickSuggestion[]
  weights: RecommendationWeights
  knowledgeNote: string | null
}

export type AIVehicleCard = {
  modelId: string
  vehicleId: string | null
  vehicleReference: string | null
  slug: string
  name: string
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  subCategory: string | null
  seats: number | null
  fuelType: string | null
  transmission: string | null
  imageUrl: string | null
  imageAlt: string
  pricePerDay: number | null
  estimatedTotal: number | null
  totalDays: number | null
  startDate: string | null
  endDate: string | null
  availabilityStatus: 'AVAILABLE_REFERENCE' | 'UNAVAILABLE' | 'NOT_CHECKED'
  availabilityNote: string
  reasons: string[]
  score: number | null
  isDemo: boolean
  ratingAvg: number | null
  ratingCount: number
  detailHref: string
  bookingHref: string
}

export type AIComparisonRow = {
  label: string
  values: string[]
}

export type AIComparisonTable = {
  vehicles: {
    slug: string
    name: string
    brand: string
    category: string
    detailHref: string
    pricePerDay: number | null
    estimatedTotal: number | null
    isDemo: boolean
  }[]
  rows: AIComparisonRow[]
  dateRange: { startDate: string; endDate: string; totalDays: number } | null
}

export type AIQuoteSummary = {
  vehicleId: string
  vehicleReference: string
  modelName: string
  modelSlug: string
  startDate: string
  endDate: string
  totalDays: number
  available: boolean
  availabilityReason: string | null
  dailyPrice: number
  basePrice: number
  weekendDays: number
  weekendSurchargeTotal: number
  holidayDays: number
  holidaySurchargeTotal: number
  addonFee: number
  deliveryFee: number
  discountAmount: number
  promoCode: string | null
  promoDiscountAmount: number
  promoMessage: string | null
  estimatedTotal: number
  depositAmount: number
  remainingAmount: number
  bookingHref: string
  disclaimer: string
}

export type AIBookingHandoff = {
  readyForCheckout: boolean
  vehicleId: string | null
  vehicleReference: string | null
  modelSlug: string
  modelName: string
  startDate: string | null
  endDate: string | null
  addons: string[]
  pickupBranchId: string | null
  targetUrl: string
  actionLabel: string
  note: string
}

export type AIPolicyCitation = {
  title: string
  sourceType: 'POLICY' | 'FAQ' | 'POST' | 'CONTACT' | 'BRANCH'
  href: string
  excerpt: string
}

export type AISessionContextSummary = {
  activeModelQuery: string | null
  activeModelName: string | null
  brand: string | null
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  minSeats: number | null
  maxBudgetPerDay: number | null
  fuelType: string | null
  transmission: string | null
  startDate: string | null
  endDate: string | null
  durationDays: number | null
}

export type AITokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export type AIChatResponsePayload = {
  requestId: string
  reply: string
  status: 'SUCCESS' | 'BLOCKED' | 'UNCONFIGURED' | 'DISABLED' | 'DEGRADED'
  mode?: 'LIVE_AI' | 'RULE_BASED_FALLBACK' | 'GUARDRAIL' | 'DISABLED' | 'UNCONFIGURED'
  modeLabel?: string
  fallbackMode?: boolean
  fallbackReason?: string | null
  intent: string
  vehicleCards: AIVehicleCard[]
  comparison: AIComparisonTable | null
  quote: AIQuoteSummary | null
  bookingHandoff: AIBookingHandoff | null
  citations: AIPolicyCitation[]
  toolsCalled: string[]
  followUpSuggestions: string[]
  fallbackLinks: { label: string; href: string }[]
  sessionContext?: AISessionContextSummary
  usage: {
    totalTokens: number
    latencyMs: number
  }
  disclaimer: string
}

export type AIToolDefinition = {
  name: AllowedToolName
  description: string
  parameters: Record<string, unknown>
}

export const ALLOWED_TOOL_NAMES = [
  'searchVehicles',
  'getVehicleDetails',
  'checkAvailability',
  'calculateRentalPrice',
  'getActivePromotions',
  'compareVehicles',
  'getRentalPolicy',
  'recommendVehicles',
  'prepareBooking',
  'getCustomerBookingStatus',
  'getPurchaseConsultationInfo',
] as const

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number]

export type AIProviderToolCall = {
  callId: string
  name: string
  argumentsJson: string
}

export type AIProviderInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant'
      content: string
    }
  | {
      type: 'thought'
      signature: string
      summary?: string
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
      thoughtSignature?: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      name?: string
      output: string
    }

export type AIProviderTurnResult = {
  responseId: string
  model: string
  outputText: string
  toolCalls: AIProviderToolCall[]
  inputTokens: number
  outputTokens: number
  totalTokens: number
  rawOutputItems: AIProviderInputItem[]
}

export interface AIProvider {
  readonly name: AIProviderName
  generateTurn(params: {
    model: string
    instructions: string
    input: AIProviderInputItem[]
    tools: AIToolDefinition[]
    maxOutputTokens: number
    timeoutMs: number
    signal?: AbortSignal
  }): Promise<AIProviderTurnResult>
  ping(params: {
    model: string
    timeoutMs: number
  }): Promise<{ ok: boolean; model: string; latencyMs: number; message: string }>
}
