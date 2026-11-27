export type AIProviderName = 'openai' | 'mock'

export type AIUserRole = 'GUEST' | 'CUSTOMER' | 'ADMIN'

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
  apiKeyConfigured: boolean
  maxOutputTokensCap: number
  maxToolRoundsCap: number
  rateLimitPerMinuteCap: number
  rateLimitPerDayCap: number
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
  maxOutputTokens: number
  maxToolRounds: number
  rateLimitPerMinute: number
  rateLimitPerDay: number
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
  intent: string
  vehicleCards: AIVehicleCard[]
  comparison: AIComparisonTable | null
  quote: AIQuoteSummary | null
  bookingHandoff: AIBookingHandoff | null
  citations: AIPolicyCitation[]
  toolsCalled: string[]
  followUpSuggestions: string[]
  fallbackLinks: { label: string; href: string }[]
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
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
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
