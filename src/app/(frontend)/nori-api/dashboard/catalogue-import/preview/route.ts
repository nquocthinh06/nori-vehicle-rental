import { requireAdmin } from '@/lib/admin-api'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  body,
  createRequestLogger,
  fail,
  json,
  text,
} from '@/lib/api-utils'
import { runVehicleImportPreview } from '@/lib/vehicle-import/import-service'
import { MAX_PDF_BYTES } from '@/lib/vehicle-import/security'
import type { ConflictPolicy, ImportDataGroup, ImportMethod } from '@/lib/vehicle-import/types'

const PREVIEW_ALLOWLIST = [
  'method',
  'url',
  'urls',
  'query',
  'brand',
  'modelName',
  'modelYear',
  'variant',
  'market',
  'modelNames',
  'csvText',
  'jsonPayload',
  'targetModelId',
  'conflictPolicy',
  'dataGroups',
  'pdfBase64',
  'pdfFileName',
]

const VALID_METHODS = new Set<ImportMethod>(['URL', 'AI_SEARCH', 'BULK', 'PDF_BROCHURE', 'MANUAL'])
const VALID_POLICIES = new Set<ConflictPolicy>([
  'SKIP_EXISTING',
  'MERGE_EMPTY',
  'OVERWRITE_UNLOCKED',
])

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/preview', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-preview', 20, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const contentType = (request.headers.get('content-type') ?? '').toLowerCase()
    let method: ImportMethod = 'URL'
    let url: string | undefined
    let urls: string[] | undefined
    let query: string | undefined
    let brand: string | undefined
    let modelName: string | undefined
    let modelYear: number | undefined
    let variant: string | undefined
    let market: string | undefined
    let modelNames: string[] | undefined
    let csvText: string | undefined
    let jsonPayload: unknown
    let targetModelId: string | undefined
    let conflictPolicy: ConflictPolicy = 'MERGE_EMPTY'
    let dataGroups: ImportDataGroup[] | undefined
    let pdfBuffer: Buffer | undefined
    let pdfFileName: string | undefined

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return fail('Vui lòng chọn tệp Brochure PDF hợp lệ.', 400, 'VALIDATION_ERROR')
      }
      if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
        return fail('Tệp PDF phải lớn hơn 0 byte và không vượt quá 25 MB.', 400, 'INVALID_PDF_SIZE')
      }
      method = 'PDF_BROCHURE'
      pdfFileName = text(file.name, 160) || 'brochure.pdf'
      pdfBuffer = Buffer.from(await file.arrayBuffer())
      url = text(form.get('url'), 500) || undefined
      targetModelId = text(form.get('targetModelId'), 100) || undefined
      const rawPolicy = text(form.get('conflictPolicy'), 30) as ConflictPolicy
      if (VALID_POLICIES.has(rawPolicy)) conflictPolicy = rawPolicy
    } else {
      const data = await body(request, PREVIEW_ALLOWLIST, 2_500_000)
      const rawMethod = text(data.method, 30).toUpperCase() as ImportMethod
      if (!VALID_METHODS.has(rawMethod)) {
        return fail('Phương thức nhập không hợp lệ.', 400, 'VALIDATION_ERROR')
      }
      method = rawMethod
      url = text(data.url, 500) || undefined
      urls = Array.isArray(data.urls)
        ? data.urls.map((u) => text(u, 500)).filter(Boolean)
        : undefined
      query = text(data.query, 240) || undefined
      brand = text(data.brand, 80) || undefined
      modelName = text(data.modelName, 120) || undefined
      modelYear = typeof data.modelYear === 'number' ? data.modelYear : undefined
      variant = text(data.variant, 100) || undefined
      market = text(data.market, 20) || undefined
      modelNames = Array.isArray(data.modelNames)
        ? data.modelNames.map((n) => text(n, 120)).filter(Boolean)
        : undefined
      csvText = typeof data.csvText === 'string' ? data.csvText.slice(0, 1_500_000) : undefined
      jsonPayload = data.jsonPayload
      targetModelId = text(data.targetModelId, 100) || undefined
      const rawPolicy = text(data.conflictPolicy, 30) as ConflictPolicy
      if (VALID_POLICIES.has(rawPolicy)) conflictPolicy = rawPolicy
      dataGroups = Array.isArray(data.dataGroups)
        ? data.dataGroups.map((g) => text(g, 30) as ImportDataGroup).filter(Boolean)
        : undefined
      if (typeof data.pdfBase64 === 'string' && data.pdfBase64.trim()) {
        pdfBuffer = Buffer.from(data.pdfBase64.trim(), 'base64')
        pdfFileName = text(data.pdfFileName, 160) || 'brochure.pdf'
      }
    }

    const result = await runVehicleImportPreview({
      payload,
      user,
      method,
      targetModelId,
      conflictPolicy,
      dataGroups,
      url,
      urls,
      query,
      brand,
      modelName,
      modelYear,
      variant,
      market,
      modelNames,
      csvText,
      jsonPayload,
      pdfBuffer,
      pdfFileName,
    })

    logger.logSuccess(200, { method })
    return json(result, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/preview' })
  }
}
