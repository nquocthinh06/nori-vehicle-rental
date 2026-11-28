import { NoriAIError } from './errors.ts'

type WindowBucket = {
  timestamps: number[]
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const MAX_CONCURRENT_GLOBAL = 20
const MAX_CONCURRENT_PER_KEY = 2
const CIRCUIT_FAILURE_THRESHOLD = 5
const CIRCUIT_OPEN_MS = 60_000

const minuteBuckets = new Map<string, WindowBucket>()
const dayBuckets = new Map<string, WindowBucket>()
const inflightByKey = new Map<string, number>()
let inflightGlobal = 0

const circuitState = {
  consecutiveFailures: 0,
  openedUntil: 0,
  lastErrorCode: null as string | null,
}

let dailyBudgetTracker = {
  dayKey: '',
  spentUsd: 0,
}

function currentDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

function pruneMapIfLarge(map: Map<string, WindowBucket>, cutoffMs: number, maxSize = 4000) {
  if (map.size <= maxSize) return
  for (const [key, bucket] of map.entries()) {
    const fresh = bucket.timestamps.filter((t) => t > cutoffMs)
    if (fresh.length === 0) {
      map.delete(key)
    } else {
      bucket.timestamps = fresh
    }
  }
}

export function checkAndConsumeAIRateLimit(params: {
  key: string
  limitPerMinute: number
  limitPerDay: number
  now?: number
}): {
  allowed: boolean
  code?: 'AI_RATE_LIMITED' | 'AI_DAILY_LIMIT_EXCEEDED'
  scope?: 'SESSION' | 'IP' | 'PROJECT'
  retryAfterSeconds?: number
  remainingMinute: number
  remainingDay: number
} {
  const now = params.now ?? Date.now()
  const minuteCutoff = now - MINUTE_MS
  const dayCutoff = now - DAY_MS

  pruneMapIfLarge(minuteBuckets, minuteCutoff)
  pruneMapIfLarge(dayBuckets, dayCutoff)

  const minBucket = minuteBuckets.get(params.key) ?? { timestamps: [] }
  minBucket.timestamps = minBucket.timestamps.filter((t) => t > minuteCutoff)

  if (minBucket.timestamps.length >= params.limitPerMinute) {
    const oldest = minBucket.timestamps[0] ?? now
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1000))
    minuteBuckets.set(params.key, minBucket)
    return {
      allowed: false,
      code: 'AI_RATE_LIMITED',
      retryAfterSeconds,
      remainingMinute: 0,
      remainingDay: Math.max(
        0,
        params.limitPerDay -
          (dayBuckets.get(params.key)?.timestamps.filter((t) => t > dayCutoff).length ?? 0),
      ),
    }
  }

  const dayBucket = dayBuckets.get(params.key) ?? { timestamps: [] }
  dayBucket.timestamps = dayBucket.timestamps.filter((t) => t > dayCutoff)

  if (dayBucket.timestamps.length >= params.limitPerDay) {
    const oldest = dayBucket.timestamps[0] ?? now
    const retryAfterSeconds = Math.max(60, Math.ceil((oldest + DAY_MS - now) / 1000))
    dayBuckets.set(params.key, dayBucket)
    return {
      allowed: false,
      code: 'AI_DAILY_LIMIT_EXCEEDED',
      retryAfterSeconds,
      remainingMinute: Math.max(0, params.limitPerMinute - minBucket.timestamps.length),
      remainingDay: 0,
    }
  }

  minBucket.timestamps.push(now)
  dayBucket.timestamps.push(now)
  minuteBuckets.set(params.key, minBucket)
  dayBuckets.set(params.key, dayBucket)

  return {
    allowed: true,
    remainingMinute: Math.max(0, params.limitPerMinute - minBucket.timestamps.length),
    remainingDay: Math.max(0, params.limitPerDay - dayBucket.timestamps.length),
  }
}

/**
 * Multi-tier Free-Tier quota guard across Session/User, IP, and Project scopes.
 * Called before EVERY LLM round (including Function Calling follow-up rounds)
 * so multi-turn tool loops never silently exceed project/session/IP Free Tier limits.
 */
export function checkAndConsumeMultiScopeModelCall(params: {
  sessionKey: string
  sessionRpm: number
  sessionRpd: number
  includeSession?: boolean
  ipKey?: string | null
  ipRpm: number
  ipRpd: number
  projectRpm: number
  projectRpd: number
  now?: number
}): {
  allowed: boolean
  code?: 'AI_RATE_LIMITED' | 'AI_DAILY_LIMIT_EXCEEDED'
  scope?: 'SESSION' | 'IP' | 'PROJECT'
  retryAfterSeconds?: number
} {
  const now = params.now ?? Date.now()
  const includeSession = params.includeSession !== false
  const scopes: Array<{
    scope: 'SESSION' | 'IP' | 'PROJECT'
    key: string
    rpm: number
    rpd: number
  }> = [
    {
      scope: 'PROJECT',
      key: 'project:nori-gemini',
      rpm: params.projectRpm,
      rpd: params.projectRpd,
    },
    ...(params.ipKey
      ? [{ scope: 'IP' as const, key: `ip:${params.ipKey}`, rpm: params.ipRpm, rpd: params.ipRpd }]
      : []),
    ...(includeSession
      ? [
          {
            scope: 'SESSION' as const,
            key: `sess:${params.sessionKey}`,
            rpm: params.sessionRpm,
            rpd: params.sessionRpd,
          },
        ]
      : []),
  ]

  // First dry-check all scopes before mutating any bucket so a blocked session doesn't burn project quota
  const minuteCutoff = now - MINUTE_MS
  const dayCutoff = now - DAY_MS
  for (const s of scopes) {
    const minTs = (minuteBuckets.get(s.key)?.timestamps ?? []).filter((t) => t > minuteCutoff)
    if (minTs.length >= s.rpm) {
      const oldest = minTs[0] ?? now
      return {
        allowed: false,
        code: 'AI_RATE_LIMITED',
        scope: s.scope,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + MINUTE_MS - now) / 1000)),
      }
    }
    const dayTs = (dayBuckets.get(s.key)?.timestamps ?? []).filter((t) => t > dayCutoff)
    if (dayTs.length >= s.rpd) {
      const oldest = dayTs[0] ?? now
      return {
        allowed: false,
        code: 'AI_DAILY_LIMIT_EXCEEDED',
        scope: s.scope,
        retryAfterSeconds: Math.max(60, Math.ceil((oldest + DAY_MS - now) / 1000)),
      }
    }
  }

  // Consume 1 unit in all active scopes
  for (const s of scopes) {
    checkAndConsumeAIRateLimit({
      key: s.key,
      limitPerMinute: s.rpm,
      limitPerDay: s.rpd,
      now,
    })
  }
  return { allowed: true }
}

export function acquireAIConcurrencySlot(key: string): () => void {
  const currentForKey = inflightByKey.get(key) ?? 0
  if (currentForKey >= MAX_CONCURRENT_PER_KEY || inflightGlobal >= MAX_CONCURRENT_GLOBAL) {
    throw new NoriAIError({
      code: 'AI_CONCURRENCY_LIMIT',
      status: 429,
      retryable: true,
      userMessage:
        'Yêu cầu trước của bạn đang được Trợ lý AI xử lý. Vui lòng chờ hoàn tất trước khi gửi câu hỏi mới.',
    })
  }
  inflightByKey.set(key, currentForKey + 1)
  inflightGlobal += 1

  let released = false
  return () => {
    if (released) return
    released = true
    inflightGlobal = Math.max(0, inflightGlobal - 1)
    const next = Math.max(0, (inflightByKey.get(key) ?? 1) - 1)
    if (next === 0) inflightByKey.delete(key)
    else inflightByKey.set(key, next)
  }
}

export function checkDailyBudget(
  dailyBudgetUsd: number,
  extraKnownSpentUsd = 0,
  now = Date.now(),
): {
  allowed: boolean
  spentUsd: number
  budgetUsd: number
} {
  const today = currentDayKey(now)
  if (dailyBudgetTracker.dayKey !== today) {
    dailyBudgetTracker = { dayKey: today, spentUsd: 0 }
  }
  const effectiveSpent = Math.max(dailyBudgetTracker.spentUsd, extraKnownSpentUsd)
  return {
    allowed: effectiveSpent < dailyBudgetUsd,
    spentUsd: Number(effectiveSpent.toFixed(6)),
    budgetUsd: dailyBudgetUsd,
  }
}

export function recordDailyBudgetSpend(costUsd: number, now = Date.now()): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return
  const today = currentDayKey(now)
  if (dailyBudgetTracker.dayKey !== today) {
    dailyBudgetTracker = { dayKey: today, spentUsd: 0 }
  }
  dailyBudgetTracker.spentUsd = Number((dailyBudgetTracker.spentUsd + costUsd).toFixed(6))
}

export function checkCircuitBreaker(now = Date.now()): {
  open: boolean
  consecutiveFailures: number
  retryAfterSeconds: number
  lastErrorCode: string | null
} {
  if (circuitState.openedUntil > now) {
    return {
      open: true,
      consecutiveFailures: circuitState.consecutiveFailures,
      retryAfterSeconds: Math.max(1, Math.ceil((circuitState.openedUntil - now) / 1000)),
      lastErrorCode: circuitState.lastErrorCode,
    }
  }
  if (circuitState.openedUntil > 0 && circuitState.openedUntil <= now) {
    circuitState.openedUntil = 0
    circuitState.consecutiveFailures = Math.max(0, CIRCUIT_FAILURE_THRESHOLD - 1)
  }
  return {
    open: false,
    consecutiveFailures: circuitState.consecutiveFailures,
    retryAfterSeconds: 0,
    lastErrorCode: circuitState.lastErrorCode,
  }
}

export function recordCircuitSuccess(): void {
  circuitState.consecutiveFailures = 0
  circuitState.openedUntil = 0
  circuitState.lastErrorCode = null
}

export function recordCircuitFailure(errorCode: string, now = Date.now()): void {
  circuitState.consecutiveFailures += 1
  circuitState.lastErrorCode = errorCode
  if (
    errorCode === 'AI_QUOTA_EXCEEDED' ||
    errorCode === 'AI_INVALID_API_KEY' ||
    circuitState.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD
  ) {
    circuitState.openedUntil = now + CIRCUIT_OPEN_MS
  }
}

export function resetAIRateLimitStateForTests(): void {
  minuteBuckets.clear()
  dayBuckets.clear()
  inflightByKey.clear()
  inflightGlobal = 0
  circuitState.consecutiveFailures = 0
  circuitState.openedUntil = 0
  circuitState.lastErrorCode = null
  dailyBudgetTracker = { dayKey: '', spentUsd: 0 }
}
