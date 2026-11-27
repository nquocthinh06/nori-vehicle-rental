import { getAIRuntimeConfig, getOpenAIApiKeyServerOnly } from '../ai/config.ts'
import { OpenAIResponsesProvider } from '../ai/openai.ts'
import { resolveAdapterByBrand, resolveAdapterForUrl } from './adapters/registry.ts'
import { extractBaseFromHtmlSignals, extractHtmlSignals } from './extractor.ts'
import { safeFetchUrl } from './fetcher.ts'
import { stripHtmlAndXss, validateImportUrl } from './security.ts'
import type { ExtractedVehicleRaw } from './types.ts'

export type AISearchAvailability = {
  available: boolean
  reason: string | null
}

const KNOWN_OFFICIAL_VN_HINTS: Record<string, string[]> = {
  toyota: [
    'https://www.toyota.com.vn/fortuner',
    'https://www.toyota.com.vn/vios',
    'https://www.toyota.com.vn/hilux',
  ],
  mitsubishi: [
    'https://www.mitsubishi-motors.com.vn/xpander',
    'https://www.mitsubishi-motors.com.vn/triton',
  ],
  honda: ['https://www.honda.com.vn/'],
  mazda: ['https://mazdamotors.vn/'],
  ford: ['https://www.ford.com.vn/'],
  vinfast: ['https://vinfastauto.com/'],
  hyundai: ['https://hyundai.thanhcong.vn/'],
  'mercedes-benz': ['https://www.mercedes-benz.com.vn/'],
  yamaha: ['https://yamaha-motor.com.vn/'],
  kawasaki: ['https://www.kawasakivietnam.vn/'],
}

export function getImportAISearchAvailability(): AISearchAvailability {
  const runtime = getAIRuntimeConfig()
  if (runtime.testMockEnabled) {
    return { available: true, reason: null }
  }
  if (!runtime.envEnabled) {
    return {
      available: false,
      reason: 'Tính năng AI phía máy chủ đang tắt (NORI_AI_ENABLED=false).',
    }
  }
  if (!getOpenAIApiKeyServerOnly() && !process.env.NORI_WEB_SEARCH_ENDPOINT?.trim()) {
    return {
      available: false,
      reason:
        'Chưa cấu hình OPENAI_API_KEY hoặc NORI_WEB_SEARCH_ENDPOINT trên máy chủ. Không thể thực hiện AI Smart Search mà không có nguồn xác thực.',
    }
  }
  return { available: true, reason: null }
}

export async function runSmartVehicleSearch(params: {
  query?: string
  brand?: string
  modelName?: string
  modelYear?: number
  variant?: string
  market?: string
  officialUrl?: string
}): Promise<{
  ok: boolean
  code?: string
  message?: string
  extracted?: ExtractedVehicleRaw
  candidateUrls?: string[]
}> {
  const availability = getImportAISearchAvailability()
  if (!availability.available) {
    return {
      ok: false,
      code: 'AI_SEARCH_UNCONFIGURED',
      message:
        availability.reason ??
        'Dịch vụ Tìm kiếm thông minh (AI Search) chưa khả dụng trên máy chủ.',
      candidateUrls: KNOWN_OFFICIAL_VN_HINTS[resolveAdapterByBrand(params.brand).id] ?? [],
    }
  }

  const runtime = getAIRuntimeConfig()
  const searchQuery = stripHtmlAndXss(
    params.query ||
      [params.brand, params.modelName, params.variant, params.modelYear, params.market || 'VN']
        .filter(Boolean)
        .join(' '),
    200,
  )

  if (!searchQuery) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Vui lòng nhập tên dòng xe hoặc từ khóa tìm kiếm.',
    }
  }

  // Deterministic test mode (only when NORI_AI_TEST_MOCK=1 outside production)
  if (runtime.testMockEnabled) {
    return {
      ok: true,
      extracted: {
        brand: params.brand || 'Toyota',
        name: params.modelName || searchQuery,
        officialName: `${params.brand || 'Toyota'} ${params.modelName || searchQuery}`.trim(),
        modelYear: params.modelYear ?? 2025,
        market: params.market || 'VN',
        category: 'CAR',
        shortDescription: `Kết quả tìm kiếm có nguồn kiểm chứng cho ${searchQuery}.`,
        sourceUrl: params.officialUrl || 'https://www.toyota.com.vn/fortuner',
        sourceLabel: 'AI Smart Search (Mock Verified)',
        sourceType: 'AI_ASSISTED',
        specifications: [
          {
            group: 'OVERVIEW',
            label: 'Thị trường',
            value: params.market || 'VN',
            source: 'Mock verified source',
            confidence: 'MEDIUM',
          },
        ],
        uncertaintyFlags: [
          {
            field: 'aiSearch',
            reason:
              'Dữ liệu trích xuất từ chế độ thử nghiệm AI Search, cần đối chiếu trước khi xuất bản.',
            severity: 'REVIEW',
          },
        ],
      },
    }
  }

  // 1. If a specific official URL was supplied or hinted by brand, fetch & verify real HTML first
  let fetchedUrl: string | null = null
  let fetchedHtmlSnippet = ''
  let baseExtracted: ExtractedVehicleRaw | null = null

  const candidateUrls: string[] = []
  if (params.officialUrl) candidateUrls.push(params.officialUrl)
  const adapter = resolveAdapterByBrand(params.brand || searchQuery)
  for (const hint of KNOWN_OFFICIAL_VN_HINTS[adapter.id] ?? []) {
    if (!candidateUrls.includes(hint)) candidateUrls.push(hint)
  }

  for (const cand of candidateUrls.slice(0, 2)) {
    try {
      await validateImportUrl(cand)
      const fetched = await safeFetchUrl(cand, { kind: 'html', timeoutMs: 8000 })
      const signals = extractHtmlSignals(fetched.text ?? '', fetched.finalUrl)
      const base = extractBaseFromHtmlSignals(signals, fetched.finalUrl)
      const urlAdapter = resolveAdapterForUrl(fetched.finalUrl)
      baseExtracted = urlAdapter.extract({
        url: fetched.finalUrl,
        html: fetched.text ?? '',
        signals,
        base,
      })
      fetchedUrl = fetched.finalUrl
      fetchedHtmlSnippet = [
        signals.title,
        signals.description,
        ...signals.tableRows.slice(0, 40).map((r) => `${r.label}: ${r.value}`),
        ...signals.paragraphs.slice(0, 5),
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 8000)
      break
    } catch {
      // Continue to next candidate or report unavailable
    }
  }

  if (!fetchedUrl || !fetchedHtmlSnippet) {
    return {
      ok: false,
      code: 'AI_SOURCE_NOT_VERIFIED',
      message:
        'Không tìm thấy trang web chính thức có thể truy xuất cho truy vấn này. NORI không tự bịa thông số khi thiếu nguồn xác thực — vui lòng nhập URL chính thức hoặc tải Brochure PDF.',
      candidateUrls,
    }
  }

  // 2. Ask OpenAI Responses API ONLY to structure & summarize the verified fetched text
  try {
    const provider = new OpenAIResponsesProvider()
    const turn = await provider.generateTurn({
      model: runtime.model,
      instructions:
        'Bạn là trợ lý trích xuất dữ liệu catalogue xe cho NORI. CHỈ được tổng hợp từ dữ liệu văn bản đính kèm; TUYỆT ĐỐI KHÔNG tự bịa thông số, giá bán hoặc trang bị không có trong văn bản. Trả về JSON thuần theo schema: {"brand":string,"name":string,"modelYear":number|null,"segment":string|null,"shortDescription":string,"highlights":string[]}.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: `Truy vấn: ${searchQuery}\nURL nguồn: ${fetchedUrl}\n\nDữ liệu trang chính thức:\n${fetchedHtmlSnippet}`,
        },
      ],
      tools: [],
      maxOutputTokens: Math.min(800, runtime.maxOutputTokensCap),
      timeoutMs: Math.min(20_000, runtime.timeoutMs),
    })

    const jsonMatch = turn.outputText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      return {
        ok: true,
        candidateUrls,
        extracted: {
          ...baseExtracted,
          brand: typeof parsed.brand === 'string' ? parsed.brand : baseExtracted?.brand,
          name: typeof parsed.name === 'string' ? parsed.name : baseExtracted?.name,
          modelYear:
            typeof parsed.modelYear === 'number' ? parsed.modelYear : baseExtracted?.modelYear,
          segment: typeof parsed.segment === 'string' ? parsed.segment : baseExtracted?.segment,
          shortDescription:
            typeof parsed.shortDescription === 'string'
              ? parsed.shortDescription
              : baseExtracted?.shortDescription,
          highlights: Array.isArray(parsed.highlights)
            ? parsed.highlights.filter((h): h is string => typeof h === 'string').slice(0, 8)
            : baseExtracted?.highlights,
          sourceUrl: fetchedUrl,
          sourceType: 'AI_ASSISTED',
          uncertaintyFlags: [
            ...(baseExtracted?.uncertaintyFlags ?? []),
            {
              field: 'aiSummary',
              reason: `Nội dung được AI tổng hợp từ nguồn ${fetchedUrl}. Vui lòng kiểm tra trước khi xuất bản.`,
              severity: 'REVIEW',
            },
          ],
        },
      }
    }
  } catch {
    // Fall back safely to pure deterministic HTML extraction if OpenAI call fails
  }

  return {
    ok: true,
    candidateUrls,
    extracted: baseExtracted
      ? {
          ...baseExtracted,
          sourceType: 'AI_ASSISTED',
        }
      : undefined,
  }
}
