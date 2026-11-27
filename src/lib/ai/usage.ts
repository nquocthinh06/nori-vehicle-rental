import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { redactSensitiveData } from './guardrails.ts'
import type { AIUserRole } from './types.ts'

/**
 * Reference USD pricing per 1,000,000 tokens for OpenAI models.
 * NOTE: These are NORI reference estimates for internal budgeting and monitoring only.
 * Actual billing is determined strictly by the OpenAI Platform invoice.
 */
export const MODEL_PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5': { input: 1.25, output: 10.0 },
}

export function resolveModelPricing(model: string): { input: number; output: number } {
  const norm = model.trim().toLowerCase()
  if (norm in MODEL_PRICING_PER_1M_USD) {
    return MODEL_PRICING_PER_1M_USD[norm]!
  }
  for (const [key, rates] of Object.entries(MODEL_PRICING_PER_1M_USD)) {
    if (norm.startsWith(key)) return rates
  }
  // Conservative default aligned with gpt-4.1-mini
  return MODEL_PRICING_PER_1M_USD['gpt-4.1-mini']!
}

export function estimateTokenCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = resolveModelPricing(model)
  const inCost = (Math.max(0, inputTokens) / 1_000_000) * rates.input
  const outCost = (Math.max(0, outputTokens) / 1_000_000) * rates.output
  return Number((inCost + outCost).toFixed(6))
}

export function hashSessionIdentifier(raw: string): string {
  return crypto.createHash('sha256').update(`nori-ai:${raw}`).digest('hex').slice(0, 20)
}

export type AIUsageLogEntry = {
  requestId: string
  eventType: 'CHAT' | 'VEHICLE_CLICK' | 'CHECKOUT_HANDOFF' | 'CONNECTION_TEST'
  status: 'SUCCESS' | 'ERROR' | 'BLOCKED' | 'RATE_LIMITED' | 'UNCONFIGURED' | 'DISABLED'
  provider: string
  model: string
  userType: AIUserRole
  userId?: string | null
  sessionHash: string
  intent?: string | null
  toolsCalled?: string[]
  recommendedModelSlugs?: string[]
  clickedModelSlug?: string | null
  noResultFound?: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  latencyMs?: number
  errorCode?: string | null
  errorCategory?: string | null
  guardrailTriggered?: string | null
  querySummary?: string | null
}

/**
 * Persists structured AI telemetry into `ai-usage-logs`.
 * Non-fatal: logging failures never crash customer chat responses.
 */
export async function recordAIUsageLog(payload: Payload, entry: AIUsageLogEntry): Promise<void> {
  try {
    await payload.create({
      collection: 'ai-usage-logs' as never,
      overrideAccess: true,
      data: {
        requestId: entry.requestId,
        eventType: entry.eventType,
        status: entry.status,
        provider: entry.provider,
        model: entry.model,
        userType: entry.userType,
        userId: entry.userId ?? undefined,
        sessionHash: entry.sessionHash,
        intent: entry.intent ?? undefined,
        toolsCalled: entry.toolsCalled ?? [],
        recommendedModelSlugs: entry.recommendedModelSlugs ?? [],
        clickedModelSlug: entry.clickedModelSlug ?? undefined,
        noResultFound: Boolean(entry.noResultFound),
        inputTokens: Math.max(0, Math.round(entry.inputTokens ?? 0)),
        outputTokens: Math.max(0, Math.round(entry.outputTokens ?? 0)),
        totalTokens: Math.max(0, Math.round(entry.totalTokens ?? 0)),
        estimatedCostUsd: Number((entry.estimatedCostUsd ?? 0).toFixed(6)),
        latencyMs: Math.max(0, Math.round(entry.latencyMs ?? 0)),
        errorCode: entry.errorCode ?? undefined,
        errorCategory: entry.errorCategory ?? undefined,
        guardrailTriggered: entry.guardrailTriggered ?? undefined,
        querySummary: entry.querySummary ? redactSensitiveData(entry.querySummary, 200) : undefined,
      } as never,
    })
  } catch {
    // Telemetry errors must never disrupt customer responses
  }
}
