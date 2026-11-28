import { addDays, businessToday } from '../rental-rules.ts'
import { stripVietnameseAccents } from './guardrails.ts'
import type { AIChatMessageInput, AISessionContextSummary, NoriAIIntent } from './types.ts'

export type UsagePurposeTag =
  | 'FAMILY'
  | 'CITY'
  | 'ROADTRIP'
  | 'BUSINESS'
  | 'CARGO_OFFROAD'
  | 'ECONOMY'

export type AutomotiveModelLexiconEntry = {
  canonicalQuery: string
  displayName: string
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  seats?: number
  aliases: string[]
}

/**
 * Domain lexicon ONLY for Vietnamese NLU entity recognition, typo normalization, and
 * implied vehicle class inference (e.g. knowing "Innova" is a 7-seat Toyota CAR so we
 * NEVER suggest motorbikes if Innova is absent from the database).
 * Actual vehicle availability, pricing, and inventory ALWAYS come live from Payload/SQLite!
 */
export const AUTOMOTIVE_MODEL_LEXICON: readonly AutomotiveModelLexiconEntry[] = [
  // Cars (SUV / MPV / Sedan / Hatchback / EV)
  {
    canonicalQuery: 'innova',
    displayName: 'Toyota Innova',
    brand: 'Toyota',
    category: 'CAR',
    seats: 7,
    aliases: ['innova', 'inova', 'innova cross', 'inova cross', 'toyota innova'],
  },
  {
    canonicalQuery: 'fortuner',
    displayName: 'Toyota Fortuner',
    brand: 'Toyota',
    category: 'CAR',
    seats: 7,
    aliases: ['fortuner', 'fotuner', 'fortuna', 'for tuner', 'toyota fortuner'],
  },
  {
    canonicalQuery: 'vios',
    displayName: 'Toyota Vios',
    brand: 'Toyota',
    category: 'CAR',
    seats: 5,
    aliases: ['vios', 'viot', 'toyota vios'],
  },
  {
    canonicalQuery: 'veloz',
    displayName: 'Toyota Veloz Cross',
    brand: 'Toyota',
    category: 'CAR',
    seats: 7,
    aliases: ['veloz', 'veloz cross', 'toyota veloz'],
  },
  {
    canonicalQuery: 'camry',
    displayName: 'Toyota Camry',
    brand: 'Toyota',
    category: 'CAR',
    seats: 5,
    aliases: ['camry', 'cam ry', 'toyota camry'],
  },
  {
    canonicalQuery: 'corolla cross',
    displayName: 'Toyota Corolla Cross',
    brand: 'Toyota',
    category: 'CAR',
    seats: 5,
    aliases: ['corolla cross', 'corola cross', 'toyota cross'],
  },
  {
    canonicalQuery: 'xpander',
    displayName: 'Mitsubishi Xpander',
    brand: 'Mitsubishi',
    category: 'CAR',
    seats: 7,
    aliases: ['xpander', 'expander', 'xpader', 'x pander', 'mitsubishi xpander'],
  },
  {
    canonicalQuery: 'cr-v',
    displayName: 'Honda CR-V',
    brand: 'Honda',
    category: 'CAR',
    seats: 7,
    aliases: ['cr-v', 'crv', 'cr v', 'honda cr-v', 'honda crv'],
  },
  {
    canonicalQuery: 'civic',
    displayName: 'Honda Civic',
    brand: 'Honda',
    category: 'CAR',
    seats: 5,
    aliases: ['civic', 'honda civic'],
  },
  {
    canonicalQuery: 'honda city',
    displayName: 'Honda City',
    brand: 'Honda',
    category: 'CAR',
    seats: 5,
    aliases: ['honda city', 'xe city'],
  },
  {
    canonicalQuery: 'cx-5',
    displayName: 'Mazda CX-5',
    brand: 'Mazda',
    category: 'CAR',
    seats: 5,
    aliases: ['cx-5', 'cx5', 'cx 5', 'mazda cx5', 'mazda cx-5'],
  },
  {
    canonicalQuery: 'mazda 3',
    displayName: 'Mazda 3',
    brand: 'Mazda',
    category: 'CAR',
    seats: 5,
    aliases: ['mazda 3', 'mazda3'],
  },
  {
    canonicalQuery: 'accent',
    displayName: 'Hyundai Accent',
    brand: 'Hyundai',
    category: 'CAR',
    seats: 5,
    aliases: ['accent', 'acent', 'hyundai accent', 'huyndai accent'],
  },
  {
    canonicalQuery: 'santafe',
    displayName: 'Hyundai Santa Fe',
    brand: 'Hyundai',
    category: 'CAR',
    seats: 7,
    aliases: ['santafe', 'santa fe', 'hyundai santafe'],
  },
  {
    canonicalQuery: 'tucson',
    displayName: 'Hyundai Tucson',
    brand: 'Hyundai',
    category: 'CAR',
    seats: 5,
    aliases: ['tucson', 'tuson', 'hyundai tucson'],
  },
  {
    canonicalQuery: 'staria',
    displayName: 'Hyundai Staria',
    brand: 'Hyundai',
    category: 'CAR',
    seats: 7,
    aliases: ['staria', 'hyundai staria'],
  },
  {
    canonicalQuery: 'carnival',
    displayName: 'Kia Carnival',
    brand: 'Kia',
    category: 'CAR',
    seats: 7,
    aliases: ['carnival', 'canival', 'kia carnival', 'sedona'],
  },
  {
    canonicalQuery: 'seltos',
    displayName: 'Kia Seltos',
    brand: 'Kia',
    category: 'CAR',
    seats: 5,
    aliases: ['seltos', 'kia seltos'],
  },
  {
    canonicalQuery: 'everest',
    displayName: 'Ford Everest',
    brand: 'Ford',
    category: 'CAR',
    seats: 7,
    aliases: ['everest', 'everet', 'ford everest'],
  },
  {
    canonicalQuery: 'c 300',
    displayName: 'Mercedes-Benz C 300 AMG',
    brand: 'Mercedes-Benz',
    category: 'CAR',
    seats: 5,
    aliases: ['c300', 'c 300', 'c300 amg', 'c 300 amg', 'mec c300', 'mer c300'],
  },
  {
    canonicalQuery: 'vf 8',
    displayName: 'VinFast VF 8',
    brand: 'VinFast',
    category: 'CAR',
    seats: 5,
    aliases: ['vf8', 'vf 8', 'vinfast vf8', 'vinfast vf 8'],
  },
  {
    canonicalQuery: 'vf 9',
    displayName: 'VinFast VF 9',
    brand: 'VinFast',
    category: 'CAR',
    seats: 7,
    aliases: ['vf9', 'vf 9', 'vinfast vf9', 'vinfast vf 9'],
  },
  {
    canonicalQuery: 'vf 7',
    displayName: 'VinFast VF 7',
    brand: 'VinFast',
    category: 'CAR',
    seats: 5,
    aliases: ['vf7', 'vf 7', 'vinfast vf7', 'vinfast vf 7'],
  },
  {
    canonicalQuery: 'vf 6',
    displayName: 'VinFast VF 6',
    brand: 'VinFast',
    category: 'CAR',
    seats: 5,
    aliases: ['vf6', 'vf 6', 'vinfast vf6', 'vinfast vf 6'],
  },
  {
    canonicalQuery: 'vf 5',
    displayName: 'VinFast VF 5',
    brand: 'VinFast',
    category: 'CAR',
    seats: 5,
    aliases: ['vf5', 'vf 5', 'vinfast vf5', 'vinfast vf 5'],
  },
  {
    canonicalQuery: 'vf 3',
    displayName: 'VinFast VF 3',
    brand: 'VinFast',
    category: 'CAR',
    seats: 4,
    aliases: ['vf3', 'vf 3', 'vinfast vf3', 'vinfast vf 3'],
  },
  // Pickups
  {
    canonicalQuery: 'ranger raptor',
    displayName: 'Ford Ranger Raptor',
    brand: 'Ford',
    category: 'PICKUP',
    seats: 5,
    aliases: ['ranger raptor', 'raptor', 'ford raptor'],
  },
  {
    canonicalQuery: 'ranger wildtrak',
    displayName: 'Ford Ranger Wildtrak',
    brand: 'Ford',
    category: 'PICKUP',
    seats: 5,
    aliases: ['ranger wildtrak', 'wildtrak', 'ford wildtrak'],
  },
  {
    canonicalQuery: 'ranger',
    displayName: 'Ford Ranger',
    brand: 'Ford',
    category: 'PICKUP',
    seats: 5,
    aliases: ['ranger', 'ford ranger'],
  },
  {
    canonicalQuery: 'hilux',
    displayName: 'Toyota Hilux',
    brand: 'Toyota',
    category: 'PICKUP',
    seats: 5,
    aliases: ['hilux', 'hi lux', 'toyota hilux'],
  },
  {
    canonicalQuery: 'triton',
    displayName: 'Mitsubishi Triton',
    brand: 'Mitsubishi',
    category: 'PICKUP',
    seats: 5,
    aliases: ['triton', 'mitsubishi triton', 'triton athlete'],
  },
  {
    canonicalQuery: 'navara',
    displayName: 'Nissan Navara',
    brand: 'Nissan',
    category: 'PICKUP',
    seats: 5,
    aliases: ['navara', 'nissan navara'],
  },
  // Motorbikes
  {
    canonicalQuery: 'pcx',
    displayName: 'Honda PCX',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['pcx', 'honda pcx'],
  },
  {
    canonicalQuery: 'sh350i',
    displayName: 'Honda SH350i',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['sh350i', 'sh 350i', 'sh350', 'sh 350', 'honda sh350i'],
  },
  {
    canonicalQuery: 'sh160i',
    displayName: 'Honda SH160i',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['sh160i', 'sh 160i', 'sh160', 'sh 160', 'honda sh160i'],
  },
  {
    canonicalQuery: 'vision',
    displayName: 'Honda Vision',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['vision', 'vison', 'honda vision'],
  },
  {
    canonicalQuery: 'wave alpha',
    displayName: 'Honda Wave Alpha 110',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['wave alpha', 'wave 110', 'honda wave', 'xe wave'],
  },
  {
    canonicalQuery: 'air blade',
    displayName: 'Honda Air Blade',
    brand: 'Honda',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['air blade', 'airblade', 'honda ab', 'xe ab'],
  },
  {
    canonicalQuery: 'exciter',
    displayName: 'Yamaha Exciter 155 VVA',
    brand: 'Yamaha',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['exciter', 'ex 155', 'exciter 155', 'yamaha exciter'],
  },
  {
    canonicalQuery: 'evo max',
    displayName: 'VinFast Evo Max',
    brand: 'VinFast',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['evo max', 'evomax', 'vinfast evo max'],
  },
  {
    canonicalQuery: 'evo200',
    displayName: 'VinFast Evo200',
    brand: 'VinFast',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['evo200', 'evo 200', 'vinfast evo200', 'vinfast evo 200'],
  },
  {
    canonicalQuery: 'z650',
    displayName: 'Kawasaki Z650 ABS',
    brand: 'Kawasaki',
    category: 'MOTORBIKE',
    seats: 2,
    aliases: ['z650', 'z 650', 'kawasaki z650'],
  },
]

export const KNOWN_BRAND_ALIASES: readonly { canonical: string; aliases: string[] }[] = [
  { canonical: 'Toyota', aliases: ['toyota', 'toyta'] },
  { canonical: 'Honda', aliases: ['honda'] },
  { canonical: 'Ford', aliases: ['ford'] },
  { canonical: 'Mitsubishi', aliases: ['mitsubishi', 'mitsu', 'mitshubishi'] },
  { canonical: 'Mazda', aliases: ['mazda'] },
  { canonical: 'Hyundai', aliases: ['hyundai', 'huyndai', 'hyndai'] },
  { canonical: 'Kia', aliases: ['kia'] },
  {
    canonical: 'Mercedes-Benz',
    aliases: ['mercedes-benz', 'mercedes benz', 'mercedes', 'mec', 'mer'],
  },
  { canonical: 'VinFast', aliases: ['vinfast', 'vin fast', 'vinfat'] },
  { canonical: 'Yamaha', aliases: ['yamaha'] },
  { canonical: 'Kawasaki', aliases: ['kawasaki'] },
  { canonical: 'Suzuki', aliases: ['suzuki'] },
  { canonical: 'Nissan', aliases: ['nissan'] },
  { canonical: 'BMW', aliases: ['bmw'] },
  { canonical: 'Audi', aliases: ['audi'] },
  { canonical: 'Subaru', aliases: ['subaru'] },
  { canonical: 'Peugeot', aliases: ['peugeot'] },
  { canonical: 'Piaggio', aliases: ['piaggio', 'vespa'] },
]

/**
 * Normalizes Vietnamese text with slang/abbreviation expansion for robust NLU.
 */
export function normalizeVietnameseNLU(raw: string): string {
  let s = stripVietnameseAccents(raw)
    .toLowerCase()
    .replace(/[?!;:"'()[\]{}]+/g, ' ')
    .replace(/(?<!\d)[.,]+|[.,]+(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Expand common Vietnamese chat abbreviations at word boundaries
  const slangReplacements: Array<[RegExp, string]> = [
    [/\b(ko|khg|hok|hong|hem|kh)\b/g, 'khong'],
    [/\b(dc|dk)\b/g, 'duoc'],
    [/\b(bn|bnh|bnhiu)\b/g, 'bao nhieu'],
    [/\b(oto|o-to)\b/g, 'o to'],
    [/\b(std)\b/g, 'so tu dong'],
    [/\b(ksao)\b/g, 'khong sao'],
    [/\b(ng)\b/g, 'nguoi'],
    [/\b(\d+(?:[.,]\d+)?)\s*cu\b/g, '$1 trieu'],
  ]
  for (const [pattern, replacement] of slangReplacements) {
    s = s.replace(pattern, replacement)
  }
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Bounded Damerau-Levenshtein edit distance for typo-tolerant vehicle/brand matching.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (Math.abs(a.length - b.length) > 3) return Math.abs(a.length - b.length)

  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let val = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2]![j - 2]! + cost)
      }
      dp[i]![j] = val
    }
  }
  return dp[a.length]![b.length]!
}

function containsWholePhrase(normText: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]?')
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(normText)
}

const GENERIC_VI_STOPWORDS = new Set([
  'co',
  'khong',
  'xe',
  'nay',
  'do',
  'kia',
  'cho',
  'minh',
  'toi',
  'em',
  'shop',
  'ben',
  'nori',
  'hoi',
  'tim',
  'xem',
  'muon',
  'can',
  'thue',
  'mua',
  'gia',
  'sao',
  'bao',
  'nhieu',
  'tien',
  'ngay',
  'tuan',
  'thang',
  'mai',
  'hom',
  'tu',
  'den',
  'va',
  'hay',
  'hoac',
  'voi',
  'loai',
  'dong',
  'chiec',
  'mau',
  'nao',
  'gi',
  'the',
  'vay',
  'nhi',
  'a',
  'ạ',
  'oi',
  'di',
  'duoi',
  'tren',
  'tam',
  'khoang',
  'trieu',
  'nghin',
  'ngan',
  'con',
  'trong',
  'lich',
  'dat',
  'coc',
  'chinh',
  'sach',
  'ma',
  'giam',
  'khuyen',
  'so',
  'sanh',
  'tu',
  'van',
  'goi',
  'y',
  'phu',
  'hop',
  'gia',
  'dinh',
  'pho',
  'thanh',
  'hang',
])

export function matchLexiconModels(rawText: string): AutomotiveModelLexiconEntry[] {
  const norm = normalizeVietnameseNLU(rawText)
  const found: Array<{ entry: AutomotiveModelLexiconEntry; matchLen: number; pos: number }> = []

  for (const entry of AUTOMOTIVE_MODEL_LEXICON) {
    let bestAliasLen = 0
    let bestPos = Number.MAX_SAFE_INTEGER
    for (const alias of entry.aliases) {
      const normAlias = normalizeVietnameseNLU(alias)
      if (!normAlias) continue
      const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]?')
      const m = new RegExp(`(?:^|\\b)(${escaped})(?:\\b|$)`, 'i').exec(norm)
      if (m && m.index !== undefined) {
        if (normAlias.length > bestAliasLen) {
          bestAliasLen = normAlias.length
          bestPos = m.index
        }
      }
    }
    if (bestAliasLen > 0) {
      found.push({ entry, matchLen: bestAliasLen, pos: bestPos })
      continue
    }

    // Typo tolerance on single distinctive tokens >= 5 chars (e.g. "fortuna", "inova", "xpader")
    const words = norm.split(/\s+/).filter((w) => w.length >= 5 && !GENERIC_VI_STOPWORDS.has(w))
    const primaryToken = normalizeVietnameseNLU(entry.canonicalQuery)
    if (!primaryToken.includes(' ') && primaryToken.length >= 5) {
      for (const [idx, word] of words.entries()) {
        const dist = editDistance(word, primaryToken)
        const maxDist = primaryToken.length >= 7 ? 2 : 1
        const sim = 1 - dist / Math.max(word.length, primaryToken.length)
        if (dist <= maxDist && sim >= 0.75 && word[0] === primaryToken[0]) {
          found.push({ entry, matchLen: primaryToken.length - dist, pos: idx * 10 })
          break
        }
      }
    }
  }

  // Deduplicate overlapping generic/specific matches (e.g. "ranger raptor" beats "ranger")
  found.sort((a, b) => b.matchLen - a.matchLen || a.pos - b.pos)
  const deduped: AutomotiveModelLexiconEntry[] = []
  for (const item of found) {
    const isSubsumed = deduped.some((existing) =>
      existing.canonicalQuery.includes(item.entry.canonicalQuery),
    )
    if (!isSubsumed) deduped.push(item.entry)
  }
  return deduped.sort((a, b) => {
    const pa = found.find((x) => x.entry === a)?.pos ?? 0
    const pb = found.find((x) => x.entry === b)?.pos ?? 0
    return pa - pb
  })
}

export function detectBrandEntity(rawText: string): string | null {
  const norm = normalizeVietnameseNLU(rawText)
  for (const b of KNOWN_BRAND_ALIASES) {
    for (const alias of b.aliases) {
      if (containsWholePhrase(norm, alias)) return b.canonical
    }
  }
  return null
}

/**
 * Extracts a candidate unknown vehicle model name when the user clearly asks about a specific
 * vehicle not in the static lexicon (e.g. "có xe Bugatti Chiron không", "có xe Subaru Forester ko",
 * "cho xem xe Porsche Macan").
 */
export function extractExplicitUnknownModelCandidate(rawText: string): string | null {
  const norm = normalizeVietnameseNLU(rawText)

  // Pattern 1: "co (cho thue)? xe <MODEL> khong" / "cho xem (xe)? <MODEL>"
  const patterns = [
    /\b(?:co\s+cho\s+thue|ben\s+minh\s+co|nori\s+co|co)\s+(?:dong\s+xe|mau\s+xe|chiec|xe)\s+([a-z0-9][a-z0-9\s-]{1,34}?)\s+(?:nay\s+)?(?:khong|chua|gia|bao\s+nhieu)\b/i,
    /\b(?:cho\s+minh\s+xem|cho\s+xem|tim\s+xe|kiem\s+tra\s+xe|hoi\s+xe)\s+([a-z0-9][a-z0-9\s-]{2,34}?)(?:\s+(?:co\s+khong|gia\s+sao|con\s+trong|khong))?$/i,
    /^([a-z0-9][a-z0-9\s-]{2,28}?)\s+co\s+(?:xe\s+nay\s+|chiec\s+nay\s+|dong\s+nay\s+)?khong$/i,
  ]

  for (const pat of patterns) {
    const m = pat.exec(norm)
    if (!m?.[1]) continue
    const candidate = m[1].trim()
    // Ignore pure generic category/seat/budget phrases like "o to 7 cho", "xe may duoi 200k", "gia dinh"
    if (
      /^(o to|xe hoi|xe may|tay ga|xe so|ban tai|pickup|sedan|suv|mpv|xe dien|\d+\s*cho|gia dinh|di pho|so tu dong|so san|duoi\s+\d+)/i.test(
        candidate,
      )
    ) {
      continue
    }
    const meaningfulTokens = candidate
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !GENERIC_VI_STOPWORDS.has(t))
    if (meaningfulTokens.length >= 1 && meaningfulTokens.length <= 4) {
      const candidateJoined = meaningfulTokens.join(' ')
      const matchedBrand = detectBrandEntity(candidateJoined)
      if (matchedBrand) {
        const brandEntry = KNOWN_BRAND_ALIASES.find((b) => b.canonical === matchedBrand)
        const brandTokenSet = new Set((brandEntry?.aliases ?? []).flatMap((a) => a.split(/[-\s]+/)))
        const nonBrandTokens = meaningfulTokens.filter((t) => !brandTokenSet.has(t))
        if (nonBrandTokens.length === 0) {
          continue
        }
      }
      return candidateJoined
    }
  }
  return null
}

export function parseVietnameseBudget(normText: string): {
  amount: number | null
  strict: boolean
} {
  // Whenever a customer states a target/ceiling budget ("dưới 1tr", "tầm 200k đổ lại", "ngân sách 1 triệu"),
  // treat it as a hard upper bound unless they explicitly say "trên" / "từ ... trở lên".
  const isMinimumOnly = /\b(tren|tu\s+\d+[^\n]{0,12}tro\s+len)\b/.test(normText)
  if (isMinimumOnly) return { amount: null, strict: false }

  const explicitStrict =
    /\b(duoi|khong qua|toi da|max|<=|under|khong vuot|chi co|do lai|tro xuong|ngan sach)\b/.test(
      normText,
    )

  // "1tr5", "1 trieu 5"
  const trCompact = normText.match(/\b(\d{1,2})\s*(?:tr|trieu)\s*(\d)\b/)
  if (trCompact) {
    const val = Number(trCompact[1]) * 1_000_000 + Number(trCompact[2]) * 100_000
    if (val >= 50_000 && val <= 50_000_000) return { amount: val, strict: true || explicitStrict }
  }

  const trDecimal = normText.match(/\b(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)\b/)
  if (trDecimal) {
    const val = Math.round(Number(trDecimal[1]!.replace(',', '.')) * 1_000_000)
    if (val >= 50_000 && val <= 50_000_000) return { amount: val, strict: true || explicitStrict }
  }

  const kMatch = normText.match(/\b(\d{2,4})\s*(?:k|nghin|ngan)\b/)
  if (kMatch) {
    const val = Number(kMatch[1]) * 1_000
    if (val >= 40_000 && val <= 50_000_000) return { amount: val, strict: true || explicitStrict }
  }

  const vndMatch = normText.match(/\b(\d{1,3}(?:[.,]\d{3}){1,2}|\d{5,8})\s*(?:d|vnd|dong)\b/)
  if (vndMatch) {
    const val = Number(vndMatch[1]!.replace(/[.,]/g, ''))
    if (val >= 40_000 && val <= 50_000_000) return { amount: val, strict: true || explicitStrict }
  }

  // Formatted VND like 50.000 or 1.000.000 even without "đ" when budget words are present
  if (explicitStrict) {
    const formattedNum = normText.match(/(\d{1,3}(?:[.,]\d{3}){1,2})/)
    if (formattedNum) {
      const val = Number(formattedNum[1]!.replace(/[.,]/g, ''))
      if (val >= 40_000 && val <= 50_000_000) return { amount: val, strict: true }
    }
  }

  return { amount: null, strict: false }
}

export function parseDateAndDuration(
  rawText: string,
  normText: string,
  today = businessToday(),
): {
  startDate: string | null
  endDate: string | null
  durationDays: number | null
} {
  const durationMatch = normText.match(/\b(\d{1,2})\s*ngay\b/)
  const weekMatch = !durationMatch ? normText.match(/\b(\d{1,2})\s*tuan\b/) : null
  const durationDays = durationMatch
    ? Math.min(30, Math.max(1, Number(durationMatch[1])))
    : weekMatch
      ? Math.min(30, Math.max(1, Number(weekMatch[1]) * 7))
      : null

  const isoDates = rawText.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? []
  if (isoDates.length >= 2) {
    return { startDate: isoDates[0]!, endDate: isoDates[1]!, durationDays }
  }

  const dmyMatches = [...rawText.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g)]
  if (dmyMatches.length >= 2) {
    const toIso = (m: RegExpMatchArray) =>
      `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    return { startDate: toIso(dmyMatches[0]!), endDate: toIso(dmyMatches[1]!), durationDays }
  }

  if (isoDates.length === 1 && durationDays) {
    return {
      startDate: isoDates[0]!,
      endDate: addDays(isoDates[0]!, durationDays),
      durationDays,
    }
  }
  if (isoDates.length === 1) {
    return { startDate: isoDates[0]!, endDate: null, durationDays }
  }

  if (dmyMatches.length === 1) {
    const m = dmyMatches[0]!
    const start = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
    return {
      startDate: start,
      endDate: durationDays ? addDays(start, durationDays) : null,
      durationDays,
    }
  }

  if (/\b(ngay mai|sang mai|chieu mai|\bmai\b)\b/.test(normText)) {
    const start = addDays(today, 1)
    return {
      startDate: start,
      endDate: durationDays ? addDays(start, durationDays) : null,
      durationDays,
    }
  }
  if (/\b(ngay kia|mot)\b/.test(normText) && durationDays) {
    const start = addDays(today, 2)
    return { startDate: start, endDate: addDays(start, durationDays), durationDays }
  }
  if (/\b(hom nay)\b/.test(normText) && durationDays) {
    return { startDate: today, endDate: addDays(today, durationDays), durationDays }
  }
  if (/\b(cuoi tuan nay|thu 7 nay|dip cuoi tuan)\b/.test(normText)) {
    const baseWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay()
    const daysUntilSat = (6 - baseWeekday + 7) % 7 || 7
    const start = addDays(today, daysUntilSat)
    const dur = durationDays ?? 2
    return { startDate: start, endDate: addDays(start, dur), durationDays: dur }
  }

  return { startDate: null, endDate: null, durationDays }
}

export type ParsedNLUAnalysis = {
  intent: NoriAIIntent
  rawQuery: string
  normalizedQuery: string
  modelQuery: string | null
  modelDisplayName: string | null
  matchedLexiconModels: AutomotiveModelLexiconEntry[]
  comparisonQueries: string[]
  brand: string | null
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  minSeats: number | null
  maxBudgetPerDay: number | null
  strictBudget: boolean
  fuelType: string | null
  transmission: string | null
  purpose: UsagePurposeTag | null
  startDate: string | null
  endDate: string | null
  durationDays: number | null
  promoCode: string | null
  bookingKey: string | null
  usesAnaphora: boolean
  isContextSwitch: boolean
  sessionContext: AISessionContextSummary
}

function extractSingleTurnSignals(rawText: string, today = businessToday()) {
  const norm = normalizeVietnameseNLU(rawText)
  const lexiconMatches = matchLexiconModels(rawText)
  const primaryLex = lexiconMatches[0] ?? null
  const unknownCandidate = !primaryLex ? extractExplicitUnknownModelCandidate(rawText) : null
  const explicitBrand = detectBrandEntity(rawText)

  // Explicit category keywords override implied model category only if user explicitly wrote category
  let explicitCategory: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null = null
  if (/\b(ban tai|pickup|cho hang|offroad|dia hinh)\b/.test(norm)) {
    explicitCategory = 'PICKUP'
  } else if (
    /\b(xe may|tay ga|xe so|con tay|moto|mo to|scooter|xe may dien|2 banh|hai banh)\b/.test(norm)
  ) {
    explicitCategory = 'MOTORBIKE'
  } else if (
    /\b(o to|xe hoi|sedan|suv|cuv|mpv|hatchback|4 cho|5 cho|7 cho|8 cho|xe dien o to|4 banh|bon banh)\b/.test(
      norm,
    )
  ) {
    explicitCategory = 'CAR'
  }

  let minSeats: number | null = null
  const seatMatch = norm.match(/\b(\d{1,2})\s*(?:cho|nguoi|khach|thanh vien)\b/)
  if (seatMatch) {
    const parsedSeats = Number(seatMatch[1])
    if (parsedSeats >= 1 && parsedSeats <= 60) {
      minSeats = parsedSeats
      if (!explicitCategory && parsedSeats >= 4) explicitCategory = 'CAR'
    }
  } else if (/\b(gia dinh dong|dai gia dinh)\b/.test(norm)) {
    minSeats = 7
    if (!explicitCategory) explicitCategory = 'CAR'
  } else if (/\b(gia dinh|nhom ban|ca nha)\b/.test(norm)) {
    minSeats = 5
    if (!explicitCategory) explicitCategory = 'CAR'
  }

  const category = explicitCategory ?? primaryLex?.category ?? null
  const brand = explicitBrand ?? primaryLex?.brand ?? null

  const { amount: maxBudgetPerDay, strict: strictBudget } = parseVietnameseBudget(norm)

  let fuelType: string | null = null
  if (/\b(xe dien|thuan dien|\bev\b|chay dien|pin)\b/.test(norm)) fuelType = 'Điện (EV)'
  else if (/\b(hybrid|xang dien)\b/.test(norm)) fuelType = 'Hybrid'
  else if (/\b(may dau|diesel|chay dau|dau diesel)\b/.test(norm)) fuelType = 'Dầu (Diesel)'
  else if (/\b(may xang|chay xang|dong co xang)\b/.test(norm)) fuelType = 'Xăng'

  let transmission: string | null = null
  if (/\b(so tu dong|tu dong|automatic|\bat\b|\bcvt\b|tay ga)\b/.test(norm)) {
    transmission = 'Tự động'
  } else if (/\b(so san|manual|\bmt\b|con tay)\b/.test(norm)) {
    transmission = 'Số sàn'
  }

  let purpose: UsagePurposeTag | null = null
  if (/\b(gia dinh|tre em|bo me|ca nha|du lich gia dinh)\b/.test(norm)) purpose = 'FAMILY'
  else if (/\b(cho hang|cong trinh|offroad|dia hinh|deo doc|cam trai|ban tai)\b/.test(norm))
    purpose = 'CARGO_OFFROAD'
  else if (/\b(cong tac|tiep khach|sang trong|doanh nhan|su kien|xe cuoi)\b/.test(norm))
    purpose = 'BUSINESS'
  else if (/\b(phuot|duong dai|lien tinh|di da lat|di vung tau|du lich xa)\b/.test(norm))
    purpose = 'ROADTRIP'
  else if (/\b(tiet kiem|gia re|sinh vien|re nhat|it ton xang)\b/.test(norm)) purpose = 'ECONOMY'
  else if (/\b(di pho|noi thanh|di lam|di hoc|thanh pho|nho gon)\b/.test(norm)) purpose = 'CITY'

  const { startDate, endDate, durationDays } = parseDateAndDuration(rawText, norm, today)

  // Promo code extraction
  let promoCode: string | null = null
  const explicitCodeMatch = rawText.match(
    /\b(?:ma|mã|code|voucher)\s+(?:giam\s+gia\s+)?([A-Za-z0-9_-]{4,24})\b/i,
  )
  if (explicitCodeMatch?.[1]) {
    const up = explicitCodeMatch[1].toUpperCase()
    if (!['GIAM', 'KHUYEN', 'NORI', 'THUE', 'NGAY'].includes(up) || /\d/.test(up)) {
      promoCode = up
    }
  } else if (/\b(khuyen mai|ma giam gia|voucher|promo)\b/.test(norm)) {
    const upperToken = rawText.match(/\b([A-Z][A-Z0-9_-]{3,20})\b/)
    if (upperToken?.[1] && upperToken[1] !== 'NORI') {
      promoCode = upperToken[1]
    }
  }

  // Booking reference extraction (e.g. BK-..., NR-...)
  const bookingKeyMatch = rawText.match(/\b((?:BK|NR)-[A-Z0-9-]{4,24})\b/i)
  const bookingKey = bookingKeyMatch?.[1] ? bookingKeyMatch[1].toUpperCase() : null

  const usesAnaphora =
    !primaryLex &&
    !unknownCandidate &&
    /\b(xe do|chiec do|dong do|mau do|xe nay|chiec nay|mau nay|con do|em do|xe vua roi)\b/.test(
      norm,
    )

  const isContextSwitch =
    /\b(doi sang|chuyen sang|vay con|the con|con xe|con chiec|con dong|thay bang)\b/.test(norm)

  return {
    norm,
    lexiconMatches,
    modelQuery: primaryLex?.canonicalQuery ?? unknownCandidate ?? null,
    modelDisplayName: primaryLex?.displayName ?? unknownCandidate ?? null,
    impliedSeats: primaryLex?.seats ?? null,
    explicitCategory,
    category,
    explicitBrand,
    brand,
    minSeats,
    maxBudgetPerDay,
    strictBudget,
    fuelType,
    transmission,
    purpose,
    startDate,
    endDate,
    durationDays,
    promoCode,
    bookingKey,
    usesAnaphora,
    isContextSwitch,
  }
}

/**
 * Full multi-turn NLU analyzer:
 * 1) Reconstructs session memory purely from `history` of the current conversation.
 * 2) Resolves pronouns/anaphora ("xe đó", "thuê 3 ngày thì sao", "đổi sang Xpander đi").
 * 3) Classifies into one of the 14 canonical business intents.
 */
export function analyzeConversationTurn(params: {
  message: string
  history?: AIChatMessageInput[]
  today?: string
}): ParsedNLUAnalysis {
  const today = params.today ?? businessToday()
  const history = params.history ?? []

  // Build isolated session context from prior user & assistant messages
  const ctx: AISessionContextSummary = {
    activeModelQuery: null,
    activeModelName: null,
    brand: null,
    category: null,
    minSeats: null,
    maxBudgetPerDay: null,
    fuelType: null,
    transmission: null,
    startDate: null,
    endDate: null,
    durationDays: null,
  }

  for (const h of history) {
    const sig = extractSingleTurnSignals(h.content, today)
    if (h.role === 'user') {
      if (sig.modelQuery) {
        // Switching to a different model updates model/brand/category while preserving dates/budget
        if (ctx.activeModelQuery && ctx.activeModelQuery !== sig.modelQuery) {
          ctx.minSeats = sig.minSeats
          ctx.fuelType = sig.fuelType
          ctx.transmission = sig.transmission
        }
        ctx.activeModelQuery = sig.modelQuery
        ctx.activeModelName = sig.modelDisplayName
      }
      if (sig.brand) ctx.brand = sig.brand
      if (sig.category) ctx.category = sig.category
      if (sig.minSeats !== null) ctx.minSeats = sig.minSeats
      if (sig.maxBudgetPerDay !== null) ctx.maxBudgetPerDay = sig.maxBudgetPerDay
      if (sig.fuelType) ctx.fuelType = sig.fuelType
      if (sig.transmission) ctx.transmission = sig.transmission
      if (sig.startDate) ctx.startDate = sig.startDate
      if (sig.endDate) ctx.endDate = sig.endDate
      if (sig.durationDays !== null) {
        ctx.durationDays = sig.durationDays
        if (ctx.startDate && !sig.endDate) {
          ctx.endDate = addDays(ctx.startDate, sig.durationDays)
        }
      }
    } else if (h.role === 'assistant' && !ctx.activeModelQuery) {
      // If user asked a general question and assistant highlighted a single model, capture it softly
      if (sig.lexiconMatches.length === 1) {
        ctx.activeModelQuery = sig.lexiconMatches[0]!.canonicalQuery
        ctx.activeModelName = sig.lexiconMatches[0]!.displayName
      }
    }
  }

  // Analyze current user message
  const cur = extractSingleTurnSignals(params.message, today)
  const norm = cur.norm

  // Merge current turn with prior context safely
  let resolvedModelQuery = cur.modelQuery
  let resolvedModelDisplayName = cur.modelDisplayName
  let resolvedCategory = cur.category
  let resolvedBrand = cur.brand
  let resolvedSeats = cur.minSeats
  let resolvedBudget = cur.maxBudgetPerDay
  let resolvedStrictBudget = cur.strictBudget
  let resolvedFuel = cur.fuelType
  let resolvedTrans = cur.transmission
  let resolvedStartDate = cur.startDate
  let resolvedEndDate = cur.endDate
  let resolvedDuration = cur.durationDays

  const isFollowUpOnActiveModel =
    !cur.modelQuery &&
    !cur.explicitCategory &&
    !cur.explicitBrand &&
    Boolean(ctx.activeModelQuery) &&
    (cur.usesAnaphora ||
      cur.durationDays !== null ||
      Boolean(cur.startDate) ||
      /\b(gia|bao nhieu|con trong|kiem tra lich|dat xe|thue luon|chot|thong so|chi tiet|coc bao nhieu)\b/.test(
        norm,
      ))

  if (cur.modelQuery) {
    // Explicit model in current turn (including "Đổi sang Xpander đi")
    if (cur.isContextSwitch || (ctx.activeModelQuery && ctx.activeModelQuery !== cur.modelQuery)) {
      resolvedStartDate = cur.startDate ?? ctx.startDate
      resolvedDuration = cur.durationDays ?? ctx.durationDays
      resolvedEndDate =
        cur.endDate ??
        (resolvedStartDate && resolvedDuration
          ? addDays(resolvedStartDate, resolvedDuration)
          : ctx.endDate)
      resolvedBudget = cur.maxBudgetPerDay ?? ctx.maxBudgetPerDay
      resolvedStrictBudget = cur.strictBudget || Boolean(resolvedBudget)
    }
  } else if (isFollowUpOnActiveModel) {
    resolvedModelQuery = ctx.activeModelQuery ?? ''
    resolvedModelDisplayName = ctx.activeModelName ?? ''
    resolvedBrand = cur.brand ?? ctx.brand
    resolvedCategory = cur.category ?? ctx.category
    resolvedStartDate = cur.startDate ?? ctx.startDate
    resolvedDuration = cur.durationDays ?? ctx.durationDays
    if (cur.endDate) {
      resolvedEndDate = cur.endDate
    } else if (resolvedStartDate && resolvedDuration) {
      resolvedEndDate = addDays(resolvedStartDate, resolvedDuration)
    } else {
      resolvedEndDate = ctx.endDate
    }
    resolvedBudget = cur.maxBudgetPerDay ?? ctx.maxBudgetPerDay
    resolvedStrictBudget = cur.strictBudget || Boolean(resolvedBudget)
  } else if (!cur.explicitCategory && (cur.maxBudgetPerDay || cur.minSeats || cur.transmission)) {
    // Filter refinement turn (e.g. Turn 1: "Tìm xe 7 chỗ", Turn 2: "Dưới 1.2 triệu số tự động")
    resolvedCategory = cur.category ?? ctx.category
    resolvedSeats = cur.minSeats ?? ctx.minSeats
    resolvedBudget = cur.maxBudgetPerDay ?? ctx.maxBudgetPerDay
    resolvedStrictBudget = cur.strictBudget || Boolean(resolvedBudget)
    resolvedFuel = cur.fuelType ?? ctx.fuelType
    resolvedTrans = cur.transmission ?? ctx.transmission
    resolvedStartDate = cur.startDate ?? ctx.startDate
    resolvedEndDate = cur.endDate ?? ctx.endDate
  }

  if (resolvedStartDate && !resolvedEndDate && resolvedDuration) {
    resolvedEndDate = addDays(resolvedStartDate, resolvedDuration)
  }

  // Comparison extraction (handles "So sánh Fortuner với Xpander" or "So sánh nó với Xpander")
  const comparisonQueries = cur.lexiconMatches.map((m) => m.canonicalQuery)
  if (
    comparisonQueries.length === 1 &&
    ctx.activeModelQuery &&
    ctx.activeModelQuery !== comparisonQueries[0]
  ) {
    comparisonQueries.unshift(ctx.activeModelQuery)
  }

  // Classify into 14 canonical intents
  const intent = classifyIntentFromSignals({
    norm,
    rawMessage: params.message,
    resolvedModelQuery,
    comparisonQueries,
    explicitBrand: cur.explicitBrand,
    resolvedCategory,
    resolvedSeats,
    resolvedBudget,
    resolvedFuel,
    resolvedTrans,
    purpose: cur.purpose,
    resolvedStartDate,
    resolvedEndDate,
    resolvedDuration,
    promoCode: cur.promoCode,
    bookingKey: cur.bookingKey,
    usesAnaphora: cur.usesAnaphora,
    isContextSwitch: cur.isContextSwitch,
  })

  const updatedContext: AISessionContextSummary = {
    activeModelQuery: resolvedModelQuery ?? ctx.activeModelQuery,
    activeModelName: resolvedModelDisplayName ?? ctx.activeModelName,
    brand: resolvedBrand ?? ctx.brand,
    category: resolvedCategory ?? ctx.category,
    minSeats: resolvedSeats ?? ctx.minSeats,
    maxBudgetPerDay: resolvedBudget ?? ctx.maxBudgetPerDay,
    fuelType: resolvedFuel ?? ctx.fuelType,
    transmission: resolvedTrans ?? ctx.transmission,
    startDate: resolvedStartDate ?? ctx.startDate,
    endDate: resolvedEndDate ?? ctx.endDate,
    durationDays: resolvedDuration ?? ctx.durationDays,
  }

  return {
    intent,
    rawQuery: params.message,
    normalizedQuery: norm,
    modelQuery: resolvedModelQuery,
    modelDisplayName: resolvedModelDisplayName,
    matchedLexiconModels: cur.lexiconMatches,
    comparisonQueries: comparisonQueries.slice(0, 4),
    brand: resolvedBrand,
    category: resolvedCategory,
    minSeats: resolvedSeats,
    maxBudgetPerDay: resolvedBudget,
    strictBudget: resolvedStrictBudget,
    fuelType: resolvedFuel,
    transmission: resolvedTrans,
    purpose: cur.purpose,
    startDate: resolvedStartDate,
    endDate: resolvedEndDate,
    durationDays: resolvedDuration,
    promoCode: cur.promoCode,
    bookingKey: cur.bookingKey,
    usesAnaphora: cur.usesAnaphora,
    isContextSwitch: cur.isContextSwitch,
    sessionContext: updatedContext,
  }
}

function classifyIntentFromSignals(s: {
  norm: string
  rawMessage: string
  resolvedModelQuery: string | null
  comparisonQueries: string[]
  explicitBrand: string | null
  resolvedCategory: 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  resolvedSeats: number | null
  resolvedBudget: number | null
  resolvedFuel: string | null
  resolvedTrans: string | null
  purpose: UsagePurposeTag | null
  resolvedStartDate: string | null
  resolvedEndDate: string | null
  resolvedDuration: number | null
  promoCode: string | null
  bookingKey: string | null
  usesAnaphora: boolean
  isContextSwitch: boolean
}): NoriAIIntent {
  const { norm } = s
  // Unresolved pronoun ("xe đó", "chiếc đó", "mẫu này") with zero prior context -> ask clarification
  if (s.usesAnaphora && !s.resolvedModelQuery && !s.explicitBrand && !s.resolvedCategory) {
    return 'CLARIFICATION'
  }
  const hasDomainSignal = Boolean(
    s.resolvedModelQuery ||
    s.explicitBrand ||
    s.resolvedCategory ||
    s.resolvedSeats ||
    s.resolvedBudget ||
    s.resolvedFuel ||
    s.resolvedTrans ||
    s.purpose ||
    s.resolvedStartDate ||
    s.resolvedDuration ||
    s.promoCode ||
    s.bookingKey,
  )

  // 1. Pure greeting
  if (
    !hasDomainSignal &&
    /^(xin chao|chao|chao ban|chao shop|chao nori|hello|hi|hey|alo|good morning|chao buoi sang)(\s+(ban|nori|shop|ad|admin|anh|chi|em))?$/.test(
      norm,
    )
  ) {
    return 'GREETING'
  }

  // 2. Customer's own booking status lookup
  if (
    s.bookingKey ||
    /\b(don thue cua toi|don cua toi|don hang cua toi|don cua minh|kiem tra don thue|tra cuu don|trang thai don|don dat xe cua toi|lich su don)\b/.test(
      norm,
    )
  ) {
    return 'BOOKING_STATUS'
  }

  // 3. Vehicle comparison
  if (
    /\b(so sanh|compare|khac nhau|khac gi|nen chon .+ hay .+)\b/.test(norm) &&
    (s.comparisonQueries.length >= 2 || /\b(so sanh|compare)\b/.test(norm))
  ) {
    return 'VEHICLE_COMPARISON'
  }

  // 4. Promotion / voucher query (when not combined with a specific rental price calculation)
  if (
    (s.promoCode || /\b(khuyen mai|ma giam gia|voucher|promo|uu dai|code giam)\b/.test(norm)) &&
    !/\b(tinh gia|bao gia|tong chi phi|tong tien)\b/.test(norm)
  ) {
    return 'PROMOTION_QUERY'
  }

  // 5. Purchase / test drive consultation
  if (
    /\b(mua xe|tim mua|gia ban|gia lan banh|dang ky lai thu|lai thu xe|muon mua|ban đứt|ban xe)\b/.test(
      norm,
    )
  ) {
    return 'PURCHASE_CONSULTATION'
  }

  // 6. Rental policy / deposit / cancellation / documents / support / branch locations
  if (
    /\b(chinh sach|quy dinh|dieu kien thue|dat coc|ky quy|hoan coc|huy don|hoan tien|bao hiem|giay to|bang lai|giay phep lai xe|cccd|cmnd|do tuoi|hotline|so dien thoai|lien he|dia chi chi nhanh|he thong chi nhanh|faq|giao xe tan noi|qua bien gioi|lao|campuchia)\b/.test(
      norm,
    ) &&
    !(/\b(tinh gia|bao gia)\b/.test(norm) && s.resolvedModelQuery)
  ) {
    return 'RENTAL_POLICY'
  }

  // 7. Booking guidance / Checkout handoff
  if (
    /\b(dat xe nay|thue xe nay|thue chiec nay|chuan bi dat|chuyen den checkout|muon dat thue|cach dat xe|huong dan dat xe|lam sao de thue|quy trinh dat xe)\b/.test(
      norm,
    )
  ) {
    return 'BOOKING_GUIDANCE'
  }

  // 8. Price quote (explicit price question, or duration follow-up like "Thuê 3 ngày thì sao?", or context switch with active dates/duration)
  if (
    /\b(tinh gia|bao gia|gia sao|gia the nao|gia bao nhieu|bao nhieu tien|het bao nhieu|tong chi phi|tong tien|chi phi thue)\b/.test(
      norm,
    ) ||
    (s.resolvedModelQuery &&
      s.resolvedDuration !== null &&
      /\b(thue|ngay|tuan|sao|tinh)\b/.test(norm)) ||
    (s.isContextSwitch && s.resolvedModelQuery && Boolean(s.resolvedStartDate && s.resolvedEndDate))
  ) {
    return 'PRICE_QUOTE'
  }

  // 9. Availability check
  if (
    /\b(con trong|kiem tra lich|lich trong|kha dung|co san|het lich|con xe ngay|ngay .+ con khong)\b/.test(
      norm,
    ) ||
    (s.resolvedModelQuery && Boolean(s.resolvedStartDate && s.resolvedEndDate))
  ) {
    return 'AVAILABILITY_CHECK'
  }

  // 10. Specific vehicle model lookup ("innova có xe này không", "có xe fortuner ko", "cho mình xem xpander", "Đổi sang Xpander đi")
  if (s.resolvedModelQuery) {
    return 'VEHICLE_LOOKUP'
  }

  // 11. Brand lookup ("có xe toyota không", "hãng vinfast có mẫu nào")
  if (s.explicitBrand && !s.resolvedSeats && !s.resolvedBudget && !s.purpose && !s.resolvedTrans) {
    return 'BRAND_LOOKUP'
  }

  // 12. Criteria-based vehicle recommendation ("có xe 7 chỗ không", "xe máy dưới 200k", "xe số tự động đi gia đình")
  if (
    s.resolvedCategory ||
    s.explicitBrand ||
    s.resolvedSeats ||
    s.resolvedBudget ||
    s.resolvedFuel ||
    s.resolvedTrans ||
    s.purpose
  ) {
    return 'VEHICLE_RECOMMENDATION'
  }

  // 13. Out-of-scope detection (non-automotive topics)
  if (
    /\b(thoi tiet|bong da|chung khoan|bitcoin|crypto|gia vang|nau an|cong thuc|giai phuong trinh|lap trinh|viet code|python|javascript|bai tho|ke chuyen| dịch sang tieng|ai tao ra ban|tong thong|thu do)\b/.test(
      norm,
    ) ||
    (!/\b(xe|thue|nori|di chuyen|hanh trinh|du lich|phuong tien|gia|lich|don|tu van|hoi|ho tro)\b/.test(
      norm,
    ) &&
      norm.split(/\s+/).length >= 4)
  ) {
    return 'OUT_OF_SCOPE'
  }

  // 14. Vague vehicle request needing clarification ("tôi muốn thuê xe", "tư vấn giúp mình")
  return 'CLARIFICATION'
}
