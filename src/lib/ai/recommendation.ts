import { businessToday, formatMoney } from '../rental-rules.ts'
import { DEFAULT_RECOMMENDATION_WEIGHTS, normalizeRecommendationWeights } from './config.ts'
import { stripVietnameseAccents } from './guardrails.ts'
import {
  analyzeConversationTurn,
  editDistance,
  normalizeVietnameseNLU,
  type UsagePurposeTag,
} from './nlu.ts'
import type { RecommendationWeights } from './types.ts'

export type { UsagePurposeTag }

export type ExtractedUserIntent = {
  intentType: string
  rawQuery: string
  query: string | null
  modelQuery: string | null
  modelDisplayName: string | null
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  brand: string | null
  minSeats: number | null
  maxBudgetPerDay: number | null
  strictBudget: boolean
  fuelType: string | null
  transmission: string | null
  purpose: UsagePurposeTag | null
  startDate: string | null
  endDate: string | null
  durationDays: number | null
}

export type RecommendationCandidate = {
  modelId: string
  slug: string
  name: string
  officialName?: string | null
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  subCategory: string | null
  bodyStyle: string | null
  segment: string | null
  seats: number | null
  fuelType: string | null
  transmission: string | null
  suitableFor: string | null
  usagePurpose: string | null
  shortDescription: string | null
  highlights: string[]
  imageUrl: string | null
  imageAlt: string
  pricePerDay: number | null
  bestVehicleId: string | null
  bestVehicleReference: string | null
  availableRentCount: number
  maintenanceCount?: number
  realVehicleCount?: number
  demoVehicleCount?: number
  isDemo: boolean
  businessActive: boolean
  /** Undefined when no dates were checked; true/false when live availability was verified */
  availableForDates?: boolean
  availabilityNote?: string
  estimatedTotal?: number | null
  totalDays?: number | null
  ratingAvg: number | null
  ratingCount: number
}

export type RecommendationScoreBreakdown = {
  budget: number
  purpose: number
  capacity: number
  rating: number
  fuel: number
  weightedTotal: number
}

export type RankedRecommendation = {
  candidate: RecommendationCandidate
  score: number
  breakdown: RecommendationScoreBreakdown
  reasons: string[]
}

/**
 * Deterministic Vietnamese NLP + Structured Intent Extraction (diacritic- & typo-tolerant).
 */
export function extractStructuredIntent(
  userQuery: string,
  today = businessToday(),
): ExtractedUserIntent {
  const analyzed = analyzeConversationTurn({ message: userQuery, today })
  return {
    intentType: analyzed.intent,
    rawQuery: userQuery,
    query: analyzed.modelQuery ?? analyzed.brand,
    modelQuery: analyzed.modelQuery,
    modelDisplayName: analyzed.modelDisplayName,
    category: analyzed.category,
    brand: analyzed.brand,
    minSeats: analyzed.minSeats,
    maxBudgetPerDay: analyzed.maxBudgetPerDay,
    strictBudget: analyzed.strictBudget,
    fuelType: analyzed.fuelType,
    transmission: analyzed.transmission,
    purpose: analyzed.purpose,
    startDate: analyzed.startDate,
    endDate: analyzed.endDate,
    durationDays: analyzed.durationDays,
  }
}

export function matchesFuel(candidateFuel: string | null, requiredFuel: string): boolean {
  if (!candidateFuel) return false
  const c = stripVietnameseAccents(candidateFuel).toLowerCase()
  const r = stripVietnameseAccents(requiredFuel).toLowerCase()
  if (r.includes('dien') || /\bev\b/.test(r)) return c.includes('dien') || /\bev\b/.test(c)
  if (r.includes('dau') || r.includes('diesel')) return c.includes('dau') || c.includes('diesel')
  if (r.includes('hybrid')) return c.includes('hybrid')
  if (r.includes('xang')) return c.includes('xang') && !c.includes('thuan dien')
  return c.includes(r)
}

export function matchesTransmission(candidateTrans: string | null, requiredTrans: string): boolean {
  if (!candidateTrans) return false
  const c = stripVietnameseAccents(candidateTrans).toLowerCase()
  const r = stripVietnameseAccents(requiredTrans).toLowerCase()

  const candidateIsManual = /\b(so san|manual|mt|con tay|xe so)\b/.test(c)
  const candidateIsAuto =
    !candidateIsManual && /\b(tu dong|automatic|auto|cvt|at|vo cap|tay ga|dien)\b/.test(c)

  if (/\b(tu dong|automatic|auto|cvt|at|tay ga)\b/.test(r)) {
    return candidateIsAuto && !candidateIsManual
  }
  if (/\b(so san|manual|mt|con tay|xe so)\b/.test(r)) {
    return candidateIsManual
  }
  return c.includes(r)
}

export function matchesModelQueryStrict(
  candidate: Pick<RecommendationCandidate, 'name' | 'officialName' | 'brand' | 'slug'>,
  rawModelQuery: string,
): boolean {
  const qNorm = normalizeVietnameseNLU(rawModelQuery)
  if (!qNorm) return true

  const hay = normalizeVietnameseNLU(
    `${candidate.name} ${candidate.officialName ?? ''} ${candidate.brand} ${candidate.slug.replace(/-/g, ' ')}`,
  )
  const escaped = qNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]?')
  if (new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(hay)) {
    return true
  }

  const qTokens = qNorm.split(/\s+/).filter((t) => t.length >= 2)
  const hayTokens = hay.split(/\s+/).filter((t) => t.length >= 2)
  if (qTokens.length === 0) return false

  return qTokens.every((qt) =>
    hayTokens.some((ht) => {
      if (ht === qt) return true
      if (qt.length >= 5 && ht.length >= 5 && qt[0] === ht[0]) {
        const dist = editDistance(qt, ht)
        const maxDist = qt.length >= 7 ? 2 : 1
        const sim = 1 - dist / Math.max(qt.length, ht.length)
        return dist <= maxDist && sim >= 0.78
      }
      return false
    }),
  )
}

function mapPurposeStringToTag(raw?: string | null): UsagePurposeTag | null {
  if (!raw) return null
  const n = stripVietnameseAccents(raw).toLowerCase()
  if (n.includes('gia dinh') || n.includes('family')) return 'FAMILY'
  if (
    n.includes('cho hang') ||
    n.includes('offroad') ||
    n.includes('dia hinh') ||
    n.includes('cargo')
  )
    return 'CARGO_OFFROAD'
  if (n.includes('cong tac') || n.includes('business') || n.includes('sang')) return 'BUSINESS'
  if (n.includes('phuot') || n.includes('duong dai') || n.includes('roadtrip')) return 'ROADTRIP'
  if (n.includes('tiet kiem') || n.includes('economy') || n.includes('gia re')) return 'ECONOMY'
  if (n.includes('pho') || n.includes('city') || n.includes('noi thanh')) return 'CITY'
  return null
}

function computeBudgetScore(
  pricePerDay: number | null,
  maxBudgetPerDay: number | null,
  cohortMin: number,
  cohortMax: number,
): { score: number; reason: string | null } {
  if (pricePerDay === null || pricePerDay <= 0) {
    return { score: 40, reason: null }
  }
  if (maxBudgetPerDay && maxBudgetPerDay > 0) {
    if (pricePerDay <= maxBudgetPerDay) {
      const ratio = pricePerDay / maxBudgetPerDay
      const score = ratio <= 0.85 ? 95 : Math.round(95 - (ratio - 0.85) * 60)
      return {
        score: Math.max(70, Math.min(100, score)),
        reason: `Phù hợp ngân sách (${formatMoney(pricePerDay)}/ngày ≤ ${formatMoney(maxBudgetPerDay)}/ngày)`,
      }
    }
    const overRatio = (pricePerDay - maxBudgetPerDay) / maxBudgetPerDay
    const score = Math.max(10, Math.round(65 - overRatio * 120))
    return {
      score,
      reason: `Cao hơn ngân sách mục tiêu ${Math.round(overRatio * 100)}%`,
    }
  }
  if (cohortMax > cohortMin) {
    const normalized = 1 - (pricePerDay - cohortMin) / (cohortMax - cohortMin)
    return {
      score: Math.round(60 + normalized * 35),
      reason: `Giá thuê từ ${formatMoney(pricePerDay)}/ngày`,
    }
  }
  return { score: 75, reason: null }
}

function computePurposeScore(
  candidate: RecommendationCandidate,
  purpose: UsagePurposeTag | null,
): { score: number; reason: string | null } {
  if (!purpose) return { score: 70, reason: null }

  const textBlob = stripVietnameseAccents(
    [
      candidate.suitableFor,
      candidate.usagePurpose,
      candidate.shortDescription,
      candidate.bodyStyle,
      candidate.segment,
      candidate.subCategory,
      ...candidate.highlights,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase()

  const sub = (candidate.subCategory ?? '').toUpperCase()
  let score = 45
  let reason: string | null = null

  switch (purpose) {
    case 'FAMILY': {
      if (['SUV', 'MPV', 'CUV'].includes(sub) || (candidate.seats ?? 0) >= 7) {
        score = 95
        reason = 'Không gian rộng rãi, phù hợp đi gia đình và hành lý'
      } else if (candidate.category === 'CAR' && (candidate.seats ?? 0) >= 5) {
        score = 80
        reason = 'Ô tô 5 chỗ tiện nghi cho gia đình nhỏ'
      } else if (textBlob.includes('gia dinh')) {
        score = 85
        reason = 'Được thiết kế phù hợp cho nhu cầu gia đình'
      } else if (candidate.category === 'MOTORBIKE') {
        score = 20
      }
      break
    }
    case 'CITY': {
      if (
        ['SCOOTER', 'ELECTRIC_BIKE', 'MANUAL_BIKE', 'HATCHBACK', 'SEDAN', 'ELECTRIC_CAR'].includes(
          sub,
        )
      ) {
        score = 92
        reason = 'Linh hoạt, nhỏ gọn, dễ xoay trở khi di chuyển nội thành'
      } else if (textBlob.includes('pho') || textBlob.includes('noi thanh')) {
        score = 85
        reason = 'Phù hợp di chuyển hàng ngày trong thành phố'
      } else if (candidate.category === 'PICKUP') {
        score = 45
      }
      break
    }
    case 'ROADTRIP': {
      if (
        ['SUV', 'CUV', 'MPV', 'SEDAN', 'BIG_BIKE'].includes(sub) ||
        candidate.category === 'PICKUP'
      ) {
        score = 90
        reason = 'Vận hành ổn định cho hành trình đường dài / liên tỉnh'
      } else if (textBlob.includes('duong dai') || textBlob.includes('du lich')) {
        score = 85
        reason = 'Thích hợp cho chuyến du lịch đường dài'
      }
      break
    }
    case 'BUSINESS': {
      if (['SEDAN', 'SUV', 'CUV', 'ELECTRIC_CAR'].includes(sub)) {
        score = 90
        reason = 'Kiểu dáng lịch sự, phù hợp đi công tác hoặc tiếp khách'
      } else if (textBlob.includes('cong tac') || textBlob.includes('cao cap')) {
        score = 88
        reason = 'Phù hợp cho lịch trình công tác chuyên nghiệp'
      } else if (candidate.category === 'MOTORBIKE') {
        score = 25
      }
      break
    }
    case 'CARGO_OFFROAD': {
      if (candidate.category === 'PICKUP') {
        score = 98
        reason = 'Xe bán tải gầm cao, thùng chở hàng và vượt địa hình mạnh mẽ'
      } else if (sub === 'SUV') {
        score = 78
        reason = 'SUV gầm cao linh hoạt trên đường đèo dốc'
      }
      break
    }
    case 'ECONOMY': {
      if (
        ['MANUAL_BIKE', 'SCOOTER', 'ELECTRIC_BIKE', 'HATCHBACK', 'ELECTRIC_CAR'].includes(sub) ||
        (candidate.fuelType ?? '').includes('Điện') ||
        (candidate.fuelType ?? '').includes('Hybrid')
      ) {
        score = 92
        reason = 'Tối ưu chi phí thuê và vận hành tiết kiệm'
      } else {
        score = 68
      }
      break
    }
  }

  return { score, reason }
}

function computeCapacityScore(
  seats: number | null,
  requiredSeats: number | null,
): { score: number; reason: string | null } {
  if (!requiredSeats) {
    return { score: seats ? 75 : 65, reason: null }
  }
  if (seats === null) {
    return { score: 45, reason: null }
  }
  if (seats === requiredSeats) {
    return { score: 100, reason: `Đúng sức chứa ${seats} chỗ ngồi theo nhu cầu` }
  }
  if (seats > requiredSeats && seats <= requiredSeats + 2) {
    return { score: 92, reason: `${seats} chỗ ngồi rộng rãi cho nhóm ${requiredSeats} người` }
  }
  if (seats > requiredSeats + 2) {
    return { score: 78, reason: `Đáp ứng dư sức chứa (${seats} chỗ ngồi)` }
  }
  return { score: 15, reason: null }
}

/**
 * Bayesian smoothed rating score so models with 0 or 1 reviews do not distort rankings
 * and never fabricate non-existent reviews.
 */
function computeRatingScore(
  ratingAvg: number | null,
  ratingCount: number,
): { score: number; reason: string | null } {
  if (ratingAvg === null || ratingCount <= 0) {
    return { score: 65, reason: null }
  }
  const priorMean = 4.2
  const priorWeight = 3
  const bayesianAvg =
    (ratingAvg * ratingCount + priorMean * priorWeight) / (ratingCount + priorWeight)
  const score = Math.round(Math.min(100, Math.max(20, (bayesianAvg / 5) * 100)))
  const reason =
    ratingAvg >= 4.0
      ? `Đánh giá thực tế ${ratingAvg.toFixed(1)}/5 (${ratingCount} lượt đã xác minh)`
      : null
  return { score, reason }
}

function computeFuelEfficiencyScore(fuelType: string | null): {
  score: number
  reason: string | null
} {
  if (!fuelType) return { score: 65, reason: null }
  const norm = stripVietnameseAccents(fuelType).toLowerCase()
  if (norm.includes('dien') || /\bev\b/.test(norm)) {
    return { score: 94, reason: 'Thuần điện (EV) vận hành êm ái và tiết kiệm năng lượng' }
  }
  if (norm.includes('hybrid')) {
    return { score: 90, reason: 'Động cơ Hybrid tiết kiệm nhiên liệu vượt trội' }
  }
  if (norm.includes('dau') || norm.includes('diesel')) {
    return { score: 78, reason: 'Động cơ Diesel bền bỉ, tiết kiệm trên đường trường' }
  }
  return { score: 72, reason: null }
}

export type RecommendationFilterCriteria = {
  modelQuery?: string | null
  category?: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  brand?: string | null
  minSeats?: number | null
  maxBudgetPerDay?: number | null
  strictBudget?: boolean
  fuelType?: string | null
  transmission?: string | null
  purpose?: string | UsagePurposeTag | null
  requireAvailableForDates?: boolean
  limit?: number
}

/**
 * NORI Hybrid Recommendation Engine (7-step verified pipeline):
 * 1) Strict mandatory hard filtering BEFORE scoring:
 *    - Active inventory (`businessActive` & `availableRentCount > 0`)
 *    - Specific `modelQuery` (when user named a model)
 *    - `category` (CAR never returns MOTORBIKE; MOTORBIKE never returns CAR)
 *    - `brand`
 *    - `minSeats` (7-seat request never returns 4–5 seat cars or 2-seat motorbikes)
 *    - `maxBudgetPerDay` (enforced strictly by default when budget is specified)
 *    - `fuelType` & `transmission` (auto request never returns manual as a matching vehicle)
 *    - Live date availability when `startDate` & `endDate` are provided
 * 2) Transparent Weighted Scoring (Budget 35%, Purpose 25%, Capacity 20%, Rating 10%, Fuel 10%).
 * 3) Returns ONLY genuinely matching vehicles (0..limit, never padded to 4).
 */
export function recommendVehiclesEngine(
  candidates: RecommendationCandidate[],
  criteria: RecommendationFilterCriteria,
  customWeights?: Partial<RecommendationWeights> | null,
): {
  results: RankedRecommendation[]
  filteredOutCount: number
  weightsUsed: RecommendationWeights
  methodologyNote: string
} {
  const weights = normalizeRecommendationWeights(customWeights ?? DEFAULT_RECOMMENDATION_WEIGHTS)
  const purposeTag =
    criteria.purpose &&
    ['FAMILY', 'CITY', 'ROADTRIP', 'BUSINESS', 'CARGO_OFFROAD', 'ECONOMY'].includes(
      String(criteria.purpose),
    )
      ? (criteria.purpose as UsagePurposeTag)
      : mapPurposeStringToTag(criteria.purpose ? String(criteria.purpose) : null)

  // Budget is enforced strictly by default whenever maxBudgetPerDay > 0 unless explicitly set false
  const enforceBudgetCeiling =
    Boolean(criteria.maxBudgetPerDay && criteria.maxBudgetPerDay > 0) &&
    criteria.strictBudget !== false

  // Step 1: Mandatory Hard Constraints BEFORE Scoring
  const eligible = candidates.filter((c) => {
    if (!c.businessActive) return false
    if (c.availableRentCount <= 0) return false
    if (criteria.modelQuery && !matchesModelQueryStrict(c, criteria.modelQuery)) {
      return false
    }
    if (criteria.category && c.category !== criteria.category) return false
    if (
      criteria.brand &&
      !stripVietnameseAccents(c.brand)
        .toLowerCase()
        .includes(stripVietnameseAccents(criteria.brand).toLowerCase())
    ) {
      return false
    }
    if (criteria.minSeats && (c.seats === null || c.seats < criteria.minSeats)) {
      return false
    }
    if (enforceBudgetCeiling && criteria.maxBudgetPerDay) {
      if (c.pricePerDay === null || c.pricePerDay > criteria.maxBudgetPerDay) return false
    }
    if (criteria.fuelType && !matchesFuel(c.fuelType, criteria.fuelType)) {
      return false
    }
    if (criteria.transmission && !matchesTransmission(c.transmission, criteria.transmission)) {
      return false
    }
    if (criteria.requireAvailableForDates && c.availableForDates !== true) {
      return false
    }
    return true
  })

  const prices = eligible.map((c) => c.pricePerDay).filter((p): p is number => p !== null && p > 0)
  const cohortMin = prices.length ? Math.min(...prices) : 0
  const cohortMax = prices.length ? Math.max(...prices) : 0

  // Step 2: Transparent Weighted Scoring
  const ranked: RankedRecommendation[] = eligible.map((candidate) => {
    const budgetEval = computeBudgetScore(
      candidate.pricePerDay,
      criteria.maxBudgetPerDay ?? null,
      cohortMin,
      cohortMax,
    )
    const purposeEval = computePurposeScore(candidate, purposeTag)
    const capacityEval = computeCapacityScore(candidate.seats, criteria.minSeats ?? null)
    const ratingEval = computeRatingScore(candidate.ratingAvg, candidate.ratingCount)
    const fuelEval = computeFuelEfficiencyScore(candidate.fuelType)

    const weightedTotal = Number(
      (
        (budgetEval.score * weights.budget +
          purposeEval.score * weights.purpose +
          capacityEval.score * weights.capacity +
          ratingEval.score * weights.rating +
          fuelEval.score * weights.fuel) /
        100
      ).toFixed(1),
    )

    const reasons: string[] = []
    if (budgetEval.reason) reasons.push(budgetEval.reason)
    if (purposeEval.reason) reasons.push(purposeEval.reason)
    if (capacityEval.reason) reasons.push(capacityEval.reason)
    if (ratingEval.reason) reasons.push(ratingEval.reason)
    if (fuelEval.reason) reasons.push(fuelEval.reason)
    if (candidate.availableForDates === true) {
      reasons.push('Còn xe sẵn sàng trong khoảng ngày bạn chọn (tham khảo tại thời điểm tra cứu)')
    }
    if (reasons.length === 0) {
      reasons.push('Đang sẵn sàng cho thuê trong đội xe NORI')
    }

    return {
      candidate,
      score: weightedTotal,
      breakdown: {
        budget: budgetEval.score,
        purpose: purposeEval.score,
        capacity: capacityEval.score,
        rating: ratingEval.score,
        fuel: fuelEval.score,
        weightedTotal,
      },
      reasons: reasons.slice(0, 4),
    }
  })

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const priceA = a.candidate.pricePerDay ?? Number.MAX_SAFE_INTEGER
    const priceB = b.candidate.pricePerDay ?? Number.MAX_SAFE_INTEGER
    return priceA - priceB
  })

  const limit = Math.max(1, Math.min(8, criteria.limit ?? 4))
  return {
    results: ranked.slice(0, limit),
    filteredOutCount: candidates.length - eligible.length,
    weightsUsed: weights,
    methodologyNote:
      'Xếp hạng bởi NORI Hybrid Recommendation Engine (Lọc điều kiện bắt buộc trước khi chấm điểm trọng số minh bạch; không ép trả đủ 4 xe khi không đủ kết quả hợp lệ).',
  }
}
