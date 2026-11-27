import { addDays, businessToday, formatMoney } from '../rental-rules.ts'
import { DEFAULT_RECOMMENDATION_WEIGHTS, normalizeRecommendationWeights } from './config.ts'
import { stripVietnameseAccents } from './guardrails.ts'
import type { RecommendationWeights } from './types.ts'

export type UsagePurposeTag =
  | 'FAMILY'
  | 'CITY'
  | 'ROADTRIP'
  | 'BUSINESS'
  | 'CARGO_OFFROAD'
  | 'ECONOMY'

export type ExtractedUserIntent = {
  rawQuery: string
  query: string | null
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
}

export type RecommendationCandidate = {
  modelId: string
  slug: string
  name: string
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

const KNOWN_BRANDS = [
  'toyota',
  'honda',
  'ford',
  'hyundai',
  'kia',
  'mazda',
  'mitsubishi',
  'vinfast',
  'yamaha',
  'suzuki',
  'nissan',
  'mercedes',
  'bmw',
  'audi',
  'isuzu',
  'chevrolet',
  'piaggio',
  'vespa',
]

function parseVietnameseBudget(normText: string): { amount: number | null; strict: boolean } {
  const strict = /\b(duoi|khong qua|toi da|max|<=|under|khong vuot|chi co)\b/.test(normText)

  // Match patterns like "1.5 trieu", "1,5tr", "2 trieu", "1tr5"
  const trCompact = normText.match(/\b(\d{1,2})\s*(?:tr|trieu)\s*(\d)\b/)
  if (trCompact) {
    const val = Number(trCompact[1]) * 1_000_000 + Number(trCompact[2]) * 100_000
    if (val >= 100_000 && val <= 50_000_000) return { amount: val, strict }
  }

  const trDecimal = normText.match(/\b(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)\b/)
  if (trDecimal) {
    const val = Math.round(Number(trDecimal[1].replace(',', '.')) * 1_000_000)
    if (val >= 100_000 && val <= 50_000_000) return { amount: val, strict }
  }

  const kMatch = normText.match(/\b(\d{2,4})\s*(?:k|nghin|ngan)\b/)
  if (kMatch) {
    const val = Number(kMatch[1]) * 1_000
    if (val >= 50_000 && val <= 50_000_000) return { amount: val, strict }
  }

  const vndMatch = normText.match(/\b(\d{1,2}(?:[.,]\d{3}){2})\s*(?:d|vnd|dong)?\b/)
  if (vndMatch) {
    const val = Number(vndMatch[1].replace(/[.,]/g, ''))
    if (val >= 50_000 && val <= 50_000_000) return { amount: val, strict }
  }

  return { amount: null, strict: false }
}

function parseDateRange(
  rawText: string,
  normText: string,
  today = businessToday(),
): { startDate: string | null; endDate: string | null } {
  // 1. Explicit ISO YYYY-MM-DD dates
  const isoDates = rawText.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []
  if (isoDates.length >= 2) {
    return { startDate: isoDates[0]!, endDate: isoDates[1]! }
  }

  // 2. Explicit DD/MM/YYYY or DD-MM-YYYY
  const dmyMatches = [...rawText.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g)]
  if (dmyMatches.length >= 2) {
    const toIso = (m: RegExpMatchArray) =>
      `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    return { startDate: toIso(dmyMatches[0]!), endDate: toIso(dmyMatches[1]!) }
  }

  // 3. Relative Vietnamese phrasing: "từ ngày mai ... 3 ngày", "hôm nay ... 2 ngày"
  const durationMatch = normText.match(/\b(\d{1,2})\s*ngay\b/)
  const duration = durationMatch ? Math.min(30, Math.max(1, Number(durationMatch[1]))) : null

  if (isoDates.length === 1 && duration) {
    return { startDate: isoDates[0]!, endDate: addDays(isoDates[0]!, duration) }
  }
  if (dmyMatches.length === 1 && duration) {
    const m = dmyMatches[0]!
    const start = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    return { startDate: start, endDate: addDays(start, duration) }
  }
  if (/\b(ngay mai|mai)\b/.test(normText) && duration) {
    const start = addDays(today, 1)
    return { startDate: start, endDate: addDays(start, duration) }
  }
  if (/\b(hom nay)\b/.test(normText) && duration) {
    return { startDate: today, endDate: addDays(today, duration) }
  }
  if (/\b(cuoi tuan nay|thu 7|thu bay)\b/.test(normText)) {
    // Find upcoming Saturday in Asia/Ho_Chi_Minh
    const baseWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay()
    const daysUntilSat = (6 - baseWeekday + 7) % 7 || 7
    const start = addDays(today, daysUntilSat)
    return { startDate: start, endDate: addDays(start, duration ?? 2) }
  }

  return { startDate: null, endDate: null }
}

/**
 * Deterministic Vietnamese NLP + Structured Intent Extraction (diacritic-insensitive).
 */
export function extractStructuredIntent(
  userQuery: string,
  today = businessToday(),
): ExtractedUserIntent {
  const norm = stripVietnameseAccents(userQuery).toLowerCase().replace(/\s+/g, ' ').trim()

  // Category detection
  let category: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null = null
  if (/\b(ban tai|pickup|ranger|hilux|triton|navara|cho hang|offroad|dia hinh)\b/.test(norm)) {
    category = 'PICKUP'
  } else if (
    /\b(xe may|tay ga|xe so|con tay|moto|mo to|scooter|pcx|vision|air blade|sh\b|exciter|winner|xe may dien|2 banh)\b/.test(
      norm,
    )
  ) {
    category = 'MOTORBIKE'
  } else if (
    /\b(o to|oto|xe hoi|sedan|suv|cuv|mpv|hatchback|4 cho|5 cho|7 cho|8 cho|gia dinh|du lich gia dinh|xe dien o to)\b/.test(
      norm,
    )
  ) {
    category = 'CAR'
  }

  // Brand detection
  const brand = KNOWN_BRANDS.find((b) => new RegExp(`\\b${b}\\b`, 'i').test(norm)) ?? null

  // Seats detection
  let minSeats: number | null = null
  const seatMatch = norm.match(/\b(\d{1,2})\s*(?:cho|nguoi|khach|thanh vien)\b/)
  if (seatMatch) {
    const parsedSeats = Number(seatMatch[1])
    if (parsedSeats >= 1 && parsedSeats <= 60) {
      minSeats = parsedSeats
      if (!category && parsedSeats >= 4) category = 'CAR'
    }
  } else if (/\b(gia dinh dong|nhom ban|ca nha|gia dinh)\b/.test(norm)) {
    minSeats = 5
    if (!category) category = 'CAR'
  }

  // Budget detection
  const { amount: maxBudgetPerDay, strict: strictBudget } = parseVietnameseBudget(norm)

  // Fuel detection
  let fuelType: string | null = null
  if (/\b(xe dien|thuan dien|\bev\b|chay dien)\b/.test(norm)) fuelType = 'Điện (EV)'
  else if (/\b(hybrid|xang dien)\b/.test(norm)) fuelType = 'Hybrid'
  else if (/\b(may dau|diesel|chay dau)\b/.test(norm)) fuelType = 'Dầu (Diesel)'
  else if (/\b(may xang|chay xang)\b/.test(norm)) fuelType = 'Xăng'

  // Transmission detection
  let transmission: string | null = null
  if (/\b(so tu dong|tu dong|automatic|\bat\b|\bcvt\b|tay ga)\b/.test(norm)) {
    transmission = 'Tự động'
  } else if (/\b(so san|manual|\bmt\b|con tay)\b/.test(norm)) {
    transmission = 'Số sàn'
  }

  // Usage purpose detection
  let purpose: UsagePurposeTag | null = null
  if (/\b(gia dinh|tre em|bo me|ca nha|du lich gia dinh)\b/.test(norm)) purpose = 'FAMILY'
  else if (/\b(cho hang|cong trinh|offroad|dia hinh|deo doc|cam trai|ban tai)\b/.test(norm))
    purpose = 'CARGO_OFFROAD'
  else if (/\b(cong tac|tiep khach|sang trong|doanh nhan|su kien|cuoi)\b/.test(norm))
    purpose = 'BUSINESS'
  else if (/\b(phuot|duong dai|lien tinh|di da lat|di vung tau|du lich xa)\b/.test(norm))
    purpose = 'ROADTRIP'
  else if (/\b(tiet kiem|gia re|sinh vien|re nhat|it ton xang)\b/.test(norm)) purpose = 'ECONOMY'
  else if (/\b(di pho|noi thanh|di lam|di hoc|thanh pho|nho gon)\b/.test(norm)) purpose = 'CITY'

  const { startDate, endDate } = parseDateRange(userQuery, norm, today)

  // Specific model keyword extraction
  const knownModelTokens = [
    'fortuner',
    'xpander',
    'vios',
    'accent',
    'ranger',
    'raptor',
    'cx-5',
    'cr-v',
    'innova',
    'veloz',
    'vf 8',
    'vf 5',
    'vf 3',
    'pcx',
    'vision',
    'air blade',
    'sh',
    'exciter',
    'winner',
    'triton',
    'hilux',
    'navara',
    'camry',
    'city',
    'civic',
    'seltos',
    'carnival',
    'staria',
    'santafe',
    'tucson',
    'klara',
    'evo',
    'feliz',
  ]
  const matchedModel = knownModelTokens.find((tok) =>
    new RegExp(`\\b${tok.replace('-', '[-\\s]?')}\\b`, 'i').test(norm),
  )

  return {
    rawQuery: userQuery,
    query: matchedModel ?? brand,
    category,
    brand: brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null,
    minSeats,
    maxBudgetPerDay,
    strictBudget,
    fuelType,
    transmission,
    purpose,
    startDate,
    endDate,
  }
}

function matchesFuel(candidateFuel: string | null, requiredFuel: string): boolean {
  if (!candidateFuel) return false
  const c = stripVietnameseAccents(candidateFuel).toLowerCase()
  const r = stripVietnameseAccents(requiredFuel).toLowerCase()
  if (r.includes('dien') || r.includes('ev')) return c.includes('dien') || c.includes('ev')
  if (r.includes('dau') || r.includes('diesel')) return c.includes('dau') || c.includes('diesel')
  if (r.includes('hybrid')) return c.includes('hybrid')
  if (r.includes('xang')) return c.includes('xang')
  return c.includes(r)
}

function matchesTransmission(candidateTrans: string | null, requiredTrans: string): boolean {
  if (!candidateTrans) return false
  const c = stripVietnameseAccents(candidateTrans).toLowerCase()
  const r = stripVietnameseAccents(requiredTrans).toLowerCase()
  if (r.includes('tu dong') || r.includes('auto') || r.includes('cvt') || r.includes('tay ga')) {
    return (
      c.includes('tu dong') ||
      c.includes('auto') ||
      c.includes('cvt') ||
      c.includes('at') ||
      c.includes('vo cap') ||
      c.includes('dien')
    )
  }
  if (r.includes('so san') || r.includes('manual') || r.includes('con tay')) {
    return c.includes('so san') || c.includes('manual') || c.includes('mt') || c.includes('con tay')
  }
  return c.includes(r)
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
      // Best value sits comfortably within budget (0.55..0.95 of budget) without penalizing cheaper vehicles harshly
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
  // No explicit budget -> normalize relative to candidate cohort (more affordable scores gently higher)
  if (cohortMax > cohortMin) {
    const normalized = 1 - (pricePerDay - cohortMin) / (cohortMax - cohortMin)
    return {
      score: Math.round(55 + normalized * 40),
      reason: `Giá thuê cạnh tranh (${formatMoney(pricePerDay)}/ngày)`,
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
        score = 25
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
        score = 30
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
        score = 65
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
    return { score: seats ? 75 : 60, reason: null }
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
    // Neutral baseline when no verified reviews exist yet (no bias / no fabrication)
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

function computeFuelEfficiencyScore(
  fuelType: string | null,
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP',
): { score: number; reason: string | null } {
  if (!fuelType) return { score: 60, reason: null }
  const norm = stripVietnameseAccents(fuelType).toLowerCase()
  if (norm.includes('dien') || norm.includes('ev')) {
    return { score: 98, reason: 'Xe thuần điện (EV) vận hành êm và tiết kiệm năng lượng' }
  }
  if (norm.includes('hybrid')) {
    return { score: 90, reason: 'Động cơ Hybrid tiết kiệm nhiên liệu vượt trội' }
  }
  if (norm.includes('dau') || norm.includes('diesel')) {
    return { score: 78, reason: 'Động cơ Diesel bền bỉ, tiết kiệm trên đường trường' }
  }
  if (category === 'MOTORBIKE') {
    return { score: 85, reason: 'Tiêu hao nhiên liệu thấp, tối ưu chi phí đi lại' }
  }
  return { score: 68, reason: null }
}

export type RecommendationFilterCriteria = {
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
 * NORI Hybrid Recommendation Engine:
 * 1) Strict rule-based hard filtering (business eligibility, seats, category, strict budget,
 *    mandatory fuel/transmission, live date availability when dates are provided).
 * 2) Content-based + Transparent Weighted Scoring (default: Budget 35%, Purpose 25%,
 *    Capacity 20%, Verified Rating 10%, Fuel Efficiency 10%).
 * 3) Explainable Vietnamese rationales derived strictly from real verified attributes.
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

  // Step 1: Hard Rule-based Filtering
  const eligible = candidates.filter((c) => {
    if (!c.businessActive) return false
    if (c.availableRentCount <= 0) return false
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
    if (criteria.strictBudget && criteria.maxBudgetPerDay && criteria.maxBudgetPerDay > 0) {
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
    const fuelEval = computeFuelEfficiencyScore(candidate.fuelType, candidate.category)

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
      'Xếp hạng bởi NORI Hybrid Recommendation Engine (Lọc điều kiện bắt buộc + Chấm điểm có trọng số minh bạch; không phải mô hình ML tự sinh dữ liệu).',
  }
}
