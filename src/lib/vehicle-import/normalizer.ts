import crypto from 'node:crypto'
import { subCategoriesByCategory } from '../rental-rules.ts'
import { stripHtmlAndXss } from './security.ts'
import type {
  ExtractedFeatureItem,
  ExtractedMediaCandidate,
  ExtractedSpecItem,
  ExtractedVehicleRaw,
  ExtractedVariantItem,
  ImportDataGroup,
  NormalizedVehicleDraft,
  UncertaintyFlag,
  VehicleCategory,
} from './types.ts'

const VALID_CATEGORIES = new Set<VehicleCategory>(['CAR', 'MOTORBIKE', 'PICKUP'])

const ICE_ONLY_SPEC_PATTERN =
  /(?<![\p{L}\p{N}])(?:xi-?lanh|cylinder|dung tích bình xăng|fuel tank|mức tiêu thụ nhiên liệu|tiêu hao nhiên liệu|khí thải|euro\s*[456]|bu-gi|bugi)(?![\p{L}\p{N}])/iu

const CAR_INTERIOR_SPEC_PATTERN =
  /(?<![\p{L}\p{N}])(?:số cửa|khoang hành lý|cốp sau|cửa sổ trời|sunroof|hàng ghế thứ 3|ghế lái chỉnh điện|điều hòa 2 vùng|carplay)(?![\p{L}\p{N}])/iu

export function slugifyModelName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function normalizeFuelType(
  raw: string | undefined,
  category: VehicleCategory,
  subCategory?: string | null,
): NormalizedVehicleDraft['fuelType'] {
  const s = (raw ?? '').trim().toLowerCase()
  if (subCategory === 'ELECTRIC_CAR' || subCategory === 'ELECTRIC_BIKE') return 'Điện (EV)'
  if (/điện|electric|\bev\b|pin\s*lfp|vinfast\s*(vf|evo|klara|vento|theon)/.test(s)) {
    return 'Điện (EV)'
  }
  if (/hybrid|hev|phev|e:hev/.test(s)) return 'Hybrid'
  if (/diesel|dầu|dau/.test(s)) return 'Dầu (Diesel)'
  if (/xăng|xang|petrol|gasoline/.test(s)) return 'Xăng'
  if (category === 'MOTORBIKE') return 'Xăng'
  return null
}

export function inferSubCategory(
  raw: ExtractedVehicleRaw,
  category: VehicleCategory,
  fuelType: NormalizedVehicleDraft['fuelType'],
): string | null {
  const valid = subCategoriesByCategory[category]
  if (raw.subCategory && valid.includes(raw.subCategory)) {
    return raw.subCategory
  }
  const hint =
    `${raw.subCategory ?? ''} ${raw.bodyStyle ?? ''} ${raw.name ?? ''} ${raw.shortDescription ?? ''}`.toLowerCase()
  if (category === 'MOTORBIKE') {
    if (fuelType === 'Điện (EV)' || /điện|evo|klara|vento/.test(hint)) return 'ELECTRIC_BIKE'
    if (/raptor|z650|z900|ninja|650cc|1000cc|phân khối lớn/.test(hint)) return 'BIG_BIKE'
    if (/exciter|winner|côn tay|clutch/.test(hint)) return 'CLUTCH_BIKE'
    if (/wave|sirius|jupiter|xe số/.test(hint)) return 'MANUAL_BIKE'
    return 'SCOOTER'
  }
  if (category === 'PICKUP') {
    if (/raptor|hiệu năng/.test(hint)) return 'PERFORMANCE_PICKUP'
    if (/wildtrak|stormtrak|athlete|cao cấp/.test(hint)) return 'PREMIUM_PICKUP'
    if (/xl\b|work|công việc/.test(hint)) return 'WORK_PICKUP'
    return 'STANDARD_PICKUP'
  }
  if (fuelType === 'Điện (EV)' || /\bvf\s*[356789]\b|xe điện/.test(hint)) return 'ELECTRIC_CAR'
  if (/mpv|xpander|veloz|innova|custin|stargazer/.test(hint)) return 'MPV'
  if (/suv|fortuner|everest|santa fe|pajero/.test(hint)) return 'SUV'
  if (/cuv|cx-?5|cr-?v|tucson|creta|territory|xforce/.test(hint)) return 'CUV'
  if (/sedan|vios|accent|camry|civic|city|c\s*300|c\s*200/.test(hint)) return 'SEDAN'
  if (/hatchback|morning|i10|yaris|wigo/.test(hint)) return 'HATCHBACK'
  if (/coupe/.test(hint)) return 'COUPE'
  return null
}

export function normalizeVehicleDraft(
  raw: ExtractedVehicleRaw,
  options?: { dataGroups?: ImportDataGroup[] },
): NormalizedVehicleDraft {
  const groups =
    options?.dataGroups && options.dataGroups.length > 0 ? new Set(options.dataGroups) : null

  const brand = stripHtmlAndXss(raw.brand || 'Chưa xác định', 80) || 'Chưa xác định'
  const rawName = stripHtmlAndXss(raw.name || raw.officialName || '', 120)
  const name =
    rawName && rawName.toLowerCase().includes(brand.toLowerCase())
      ? rawName
      : rawName
        ? `${brand === 'Chưa xác định' ? '' : `${brand} `}${rawName}`.trim()
        : `${brand} Model`

  const category: VehicleCategory = VALID_CATEGORIES.has(raw.category as VehicleCategory)
    ? (raw.category as VehicleCategory)
    : 'CAR'

  const fuelType = normalizeFuelType(
    `${raw.fuelType ?? ''} ${raw.name ?? ''} ${raw.engineOverview ?? ''}`,
    category,
    raw.subCategory,
  )
  const subCategory = inferSubCategory(raw, category, fuelType)
  const isEv = fuelType === 'Điện (EV)'
  const isMotorbike = category === 'MOTORBIKE'

  const uncertaintyFlags: UncertaintyFlag[] = [...(raw.uncertaintyFlags ?? [])]
  const warnings: string[] = [...(raw.warnings ?? [])]

  const year =
    typeof raw.modelYear === 'number' &&
    Number.isSafeInteger(raw.modelYear) &&
    raw.modelYear >= 1990 &&
    raw.modelYear <= 2035
      ? raw.modelYear
      : null

  const seats = isMotorbike
    ? 2
    : typeof raw.seats === 'number' &&
        Number.isSafeInteger(raw.seats) &&
        raw.seats >= 1 &&
        raw.seats <= 60
      ? raw.seats
      : null

  // Vehicle-type specification filtering:
  // - EV models must hide/exclude ICE-only specifications
  // - Motorbikes must hide/exclude car interior specs
  const specifications: ExtractedSpecItem[] = (raw.specifications ?? [])
    .filter((s) => {
      const labelAndValue = `${s.label} ${s.value}`
      if (isEv && ICE_ONLY_SPEC_PATTERN.test(labelAndValue)) return false
      if (isMotorbike && CAR_INTERIOR_SPEC_PATTERN.test(labelAndValue)) return false
      return Boolean(s.label && s.value)
    })
    .slice(0, 80)
    .map((s) => ({
      ...s,
      label: stripHtmlAndXss(s.label, 120),
      value: stripHtmlAndXss(s.value, 240),
      variantName: s.variantName ? stripHtmlAndXss(s.variantName, 100) : undefined,
      source: s.source ? stripHtmlAndXss(s.source, 200) : undefined,
    }))

  const features: ExtractedFeatureItem[] = (raw.features ?? [])
    .filter((f) => Boolean(f.name))
    .slice(0, 80)
    .map((f) => ({
      name: stripHtmlAndXss(f.name, 140),
      category: f.category,
      status: f.status,
      variantNote: f.variantNote ? stripHtmlAndXss(f.variantNote, 120) : undefined,
    }))

  const variants: ExtractedVariantItem[] = (raw.variants ?? [])
    .filter((v) => Boolean(v.name))
    .slice(0, 20)
    .map((v) => ({
      name: stripHtmlAndXss(v.name, 120),
      year: v.year ?? year ?? undefined,
      listedPrice:
        typeof v.listedPrice === 'number' && v.listedPrice >= 0
          ? Math.round(v.listedPrice)
          : undefined,
      msrpReferenceVnd:
        typeof v.msrpReferenceVnd === 'number' && v.msrpReferenceVnd >= 0
          ? Math.round(v.msrpReferenceVnd)
          : undefined,
      fuelType: v.fuelType ? stripHtmlAndXss(v.fuelType, 40) : (fuelType ?? undefined),
      transmission: v.transmission ? stripHtmlAndXss(v.transmission, 80) : undefined,
      driveType: v.driveType ? stripHtmlAndXss(v.driveType, 80) : undefined,
      seats: isMotorbike ? 2 : (v.seats ?? seats ?? undefined),
      summary: v.summary ? stripHtmlAndXss(v.summary, 300) : undefined,
      colors:
        groups && !groups.has('colors')
          ? []
          : (v.colors ?? []).slice(0, 20).map((c) => ({
              name: stripHtmlAndXss(c.name, 80),
              hex: c.hex ? stripHtmlAndXss(c.hex, 20) : undefined,
              sourceUrl: c.sourceUrl ? stripHtmlAndXss(c.sourceUrl, 300) : undefined,
              imageUrl: c.imageUrl,
            })),
    }))

  // Filter media candidates by category & requested data groups
  const mediaCandidates: ExtractedMediaCandidate[] = (raw.mediaCandidates ?? [])
    .filter((m) => {
      if (isMotorbike && m.kind === 'INTERIOR') return false
      if (!groups) return true
      if (m.kind === 'OVERVIEW' && !groups.has('overview') && !groups.has('banner')) return false
      if (m.kind === 'EXTERIOR' && !groups.has('exterior')) return false
      if (m.kind === 'INTERIOR' && !groups.has('interior')) return false
      if ((m.kind === 'FEATURE' || m.kind === 'ENGINE') && !groups.has('technology')) return false
      return true
    })
    .slice(0, 30)

  const market = (raw.market || 'VN').toUpperCase()
  if (market !== 'VN') {
    uncertaintyFlags.push({
      field: 'market',
      reason: `Thị trường trích xuất là "${market}" (không phải VN). Hãy kiểm tra cấu hình cho Việt Nam.`,
      severity: 'WARN',
    })
  }
  if (!year) {
    uncertaintyFlags.push({
      field: 'modelYear',
      reason: 'Chưa xác định rõ đời xe / năm sản xuất từ nguồn.',
      severity: 'WARN',
    })
  }
  if (specifications.length === 0) {
    uncertaintyFlags.push({
      field: 'specifications',
      reason: 'Chưa có thông số kỹ thuật chi tiết được trích xuất.',
      severity: 'WARN',
    })
  }

  const msrp =
    typeof raw.msrpReferenceVnd === 'number' && raw.msrpReferenceVnd >= 0
      ? Math.round(raw.msrpReferenceVnd)
      : typeof raw.listedPrice === 'number' && raw.listedPrice >= 0
        ? Math.round(raw.listedPrice)
        : null

  const slug = slugifyModelName(name) || `model-${Date.now()}`
  const source =
    stripHtmlAndXss(raw.sourceLabel || raw.sourceUrl || 'Nguồn chính thức', 300) ||
    'Nguồn chính thức'
  const importSourceType = raw.sourceType ?? 'OFFICIAL_URL'
  const hasReviewFlags = uncertaintyFlags.some((f) => f.severity === 'REVIEW')

  const draft: NormalizedVehicleDraft = {
    name,
    officialName: raw.officialName ? stripHtmlAndXss(raw.officialName, 160) : name,
    slug,
    brand,
    modelLine: raw.modelLine ? stripHtmlAndXss(raw.modelLine, 80) : null,
    versionName: raw.versionName ? stripHtmlAndXss(raw.versionName, 100) : null,
    generation: raw.generation ? stripHtmlAndXss(raw.generation, 80) : null,
    category,
    subCategory,
    bodyStyle: raw.bodyStyle ? stripHtmlAndXss(raw.bodyStyle, 80) : null,
    segment: raw.segment ? stripHtmlAndXss(raw.segment, 80) : null,
    origin: raw.origin ? stripHtmlAndXss(raw.origin, 80) : null,
    modelYear: year,
    market,
    seats,
    fuelType,
    transmission: raw.transmission ? stripHtmlAndXss(raw.transmission, 80) : null,
    driveType: isMotorbike ? null : raw.driveType ? stripHtmlAndXss(raw.driveType, 80) : null,
    listedPrice: msrp,
    msrpReferenceVnd: msrp,
    suitableFor: raw.suitableFor ? stripHtmlAndXss(raw.suitableFor, 200) : null,
    usagePurpose: raw.usagePurpose ? stripHtmlAndXss(raw.usagePurpose, 200) : null,
    shortDescription:
      groups && !groups.has('description')
        ? null
        : raw.shortDescription
          ? stripHtmlAndXss(raw.shortDescription, 500)
          : null,
    description:
      groups && !groups.has('description')
        ? null
        : raw.description
          ? stripHtmlAndXss(raw.description, 3000)
          : null,
    exteriorOverview:
      groups && !groups.has('exterior')
        ? null
        : raw.exteriorOverview
          ? stripHtmlAndXss(raw.exteriorOverview, 2000)
          : null,
    interiorOverview:
      isMotorbike || (groups && !groups.has('interior'))
        ? null
        : raw.interiorOverview
          ? stripHtmlAndXss(raw.interiorOverview, 2000)
          : null,
    engineOverview:
      groups && !groups.has('technology')
        ? null
        : raw.engineOverview
          ? stripHtmlAndXss(raw.engineOverview, 2000)
          : null,
    highlights: (raw.highlights ?? [])
      .slice(0, 20)
      .map((h) => ({ text: stripHtmlAndXss(h, 240) }))
      .filter((h) => Boolean(h.text)),
    features,
    specifications: groups && !groups.has('specs') ? [] : specifications,
    variants: groups && !groups.has('variants') ? [] : variants,
    mediaCandidates,
    source: groups && !groups.has('source') ? 'Chưa gắn nguồn' : source,
    importSourceUrl: raw.sourceUrl ?? null,
    importSourceType,
    importSourceHash: '',
    verificationStatus: hasReviewFlags || specifications.length === 0 ? 'UNVERIFIED' : 'VERIFIED',
    warnings,
    uncertaintyFlags,
  }

  draft.importSourceHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        name: draft.name,
        brand: draft.brand,
        category: draft.category,
        modelYear: draft.modelYear,
        msrpReferenceVnd: draft.msrpReferenceVnd,
        specifications: draft.specifications.map((s) => [s.label, s.value]),
        variants: draft.variants.map((v) => v.name),
      }),
    )
    .digest('hex')
    .slice(0, 32)

  return draft
}
