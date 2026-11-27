import { stripHtmlAndXss } from '../security.ts'
import type {
  ExtractedSpecItem,
  ExtractedVehicleRaw,
  ExtractedVariantItem,
  VehicleCategory,
} from '../types.ts'
import { classifySpecGroup, type HtmlExtractionResult } from '../extractor.ts'
import type { ManufacturerAdapter } from './types.ts'

export type BrandAdapterPreset = {
  id: string
  brand: string
  domains: readonly string[]
  defaultCategory?: VehicleCategory
  defaultOrigin?: string
  defaultFuelType?: string
  specPairPatterns?: RegExp[]
  variantNamePattern?: RegExp
  noteOnBlocked?: string
}

function inferCategoryFromSignals(text: string, fallback?: VehicleCategory): VehicleCategory {
  const lower = text.toLowerCase()
  if (
    /(?<![\p{L}\p{N}])(?:bán tải|pickup|ranger|hilux|triton|d-max|navara)(?![\p{L}\p{N}])/iu.test(
      lower,
    )
  ) {
    return 'PICKUP'
  }
  if (
    /(?<![\p{L}\p{N}])(?:xe máy|xe số|xe tay ga|xe côn tay|mô tô|exciter|vision|wave\s*alpha|sh\s*160i|sh\s*350i|pcx|evo\s*200|evo\s*max|z650|ninja|yamaha|kawasaki)(?![\p{L}\p{N}])/iu.test(
      lower,
    )
  ) {
    return 'MOTORBIKE'
  }
  return fallback ?? 'CAR'
}

function extractModelYear(text: string): number | undefined {
  const matches = [...text.matchAll(/\b(202[0-9]|203[0-5])\b/g)].map((m) => Number(m[1]))
  if (matches.length === 0) return undefined
  return Math.max(...matches)
}

function extractVndPrice(text: string): number | undefined {
  // Match Vietnamese MSRP like "1.165.000.000 VNĐ" or "1,165 tỷ"
  const fullMatch = text.match(/(\d{1,3}(?:[.,]\d{3}){2,3})\s*(?:vnđ|vnd|đ)/i)
  if (fullMatch?.[1]) {
    const n = Number(fullMatch[1].replace(/[.,]/g, ''))
    if (Number.isFinite(n) && n >= 10_000_000 && n <= 100_000_000_000) return n
  }
  const tyMatch = text.match(/(\d+(?:[.,]\d+)?)\s*tỷ/i)
  if (tyMatch?.[1]) {
    const n = Number(tyMatch[1].replace(',', '.')) * 1_000_000_000
    if (Number.isFinite(n) && n >= 100_000_000) return Math.round(n)
  }
  return undefined
}

function extractBrandSpecsFromHtml(
  html: string,
  sourceUrl: string,
  existing: ExtractedSpecItem[],
  extraPatterns: RegExp[] = [],
): ExtractedSpecItem[] {
  const out = [...existing]
  const seen = new Set(out.map((s) => `${s.label.toLowerCase()}::${s.value.toLowerCase()}`))

  const defaultPatterns = [
    /<div\b[^>]*class="[^"]*(?:spec-item|parameter-item|tskt-row|attribute-row)[^"]*"[^>]*>[\s\S]*?<(?:span|div|label|p)[^>]*>([\s\S]*?)<\/(?:span|div|label|p)>[\s\S]*?<(?:span|div|strong|p)[^>]*>([\s\S]*?)<\/(?:span|div|strong|p)>/gi,
    ...extraPatterns,
  ]

  for (const regex of defaultPatterns) {
    let m: RegExpExecArray | null
    while ((m = regex.exec(html)) !== null && out.length < 90) {
      const label = stripHtmlAndXss(m[1] ?? '', 120)
      const value = stripHtmlAndXss(m[2] ?? '', 240)
      if (!label || !value || label === value) continue
      const key = `${label.toLowerCase()}::${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        group: classifySpecGroup(label),
        label,
        value,
        source: sourceUrl,
        confidence: 'HIGH',
      })
    }
  }
  return out
}

export function createBrandAdapter(preset: BrandAdapterPreset): ManufacturerAdapter {
  return {
    id: preset.id,
    brand: preset.brand,
    domains: preset.domains,
    defaultCategory: preset.defaultCategory,
    supportsUrl(url: URL) {
      const host = url.hostname.toLowerCase()
      return preset.domains.some((d) => host === d || host.endsWith(`.${d}`))
    },
    extract({ url, html, signals, base }) {
      const combinedText = `${signals.title} ${signals.ogTitle ?? ''} ${signals.description} ${signals.paragraphs.slice(0, 4).join(' ')}`
      const category = inferCategoryFromSignals(combinedText, preset.defaultCategory)
      const modelYear = base.modelYear ?? extractModelYear(combinedText)
      const price = base.listedPrice ?? extractVndPrice(combinedText)
      const specifications = extractBrandSpecsFromHtml(
        html,
        url,
        base.specifications ?? [],
        preset.specPairPatterns,
      )

      const variants: ExtractedVariantItem[] = base.variants ? [...base.variants] : []
      if (variants.length === 0 && preset.variantNamePattern) {
        const matches = [...combinedText.matchAll(preset.variantNamePattern)]
        const seenVar = new Set<string>()
        for (const vm of matches) {
          const vName = stripHtmlAndXss(vm[0], 100)
          if (vName && !seenVar.has(vName.toLowerCase())) {
            seenVar.add(vName.toLowerCase())
            variants.push({ name: vName, year: modelYear, colors: [] })
          }
        }
      }

      // Clean brand prefix noise from model title
      const rawName = base.name || signals.ogTitle || signals.title || preset.brand
      const cleanName = stripHtmlAndXss(
        rawName
          .replace(/\s*\|\s*.*$/, '')
          .replace(/\s*-\s*Bảng giá.*$/i, '')
          .replace(/\s*-\s*Thông số.*$/i, ''),
        120,
      )

      const warnings = [...(base.warnings ?? [])]
      if (specifications.length === 0) {
        warnings.push(
          `Không trích xuất được bảng thông số chi tiết từ HTML trang ${preset.brand} (trang có thể render bằng JS). Hãy kiểm tra hoặc bổ sung bằng Brochure PDF.`,
        )
      }

      return {
        ...base,
        adapterId: preset.id,
        brand: preset.brand,
        name: cleanName || preset.brand,
        officialName: base.officialName ?? cleanName,
        category,
        origin: base.origin ?? preset.defaultOrigin,
        fuelType: base.fuelType ?? preset.defaultFuelType,
        modelYear,
        market: 'VN',
        listedPrice: price,
        msrpReferenceVnd: price,
        specifications,
        variants: variants.slice(0, 12),
        mediaCandidates: base.mediaCandidates ?? signals.mediaCandidates,
        sourceUrl: url,
        sourceLabel: `${preset.brand} Việt Nam (${new URL(url).hostname})`,
        sourceType: 'OFFICIAL_URL',
        warnings,
      }
    },
  }
}

export const genericAdapter: ManufacturerAdapter = {
  id: 'generic',
  brand: 'Hãng xe chính thức',
  domains: [],
  supportsUrl: () => true,
  extract({ url, html, signals, base }) {
    const combinedText = `${signals.title} ${signals.ogTitle ?? ''} ${signals.description}`
    const category = inferCategoryFromSignals(combinedText, 'CAR')
    const modelYear = base.modelYear ?? extractModelYear(combinedText)
    const price = base.listedPrice ?? extractVndPrice(combinedText)
    const specifications = extractBrandSpecsFromHtml(html, url, base.specifications ?? [])

    return {
      ...base,
      adapterId: 'generic',
      brand: base.brand || 'Chưa xác định',
      name: base.name || signals.ogTitle || signals.title || 'Dòng xe nhập khẩu',
      category,
      modelYear,
      market: 'VN',
      listedPrice: price,
      msrpReferenceVnd: price,
      specifications,
      mediaCandidates: base.mediaCandidates ?? signals.mediaCandidates,
      sourceUrl: url,
      sourceLabel: new URL(url).hostname,
      sourceType: 'OFFICIAL_URL',
    }
  },
}
