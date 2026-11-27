import { requireAdmin } from '@/lib/admin-api'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  createRequestLogger,
  fail,
  json,
} from '@/lib/api-utils'
import { runVehicleImportPreview } from '@/lib/vehicle-import/import-service'
import type { ConflictPolicy, ImportDataGroup, ImportMethod } from '@/lib/vehicle-import/types'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/retry', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-retry', 15, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã tiến trình cần thử lại.')

    const job = (await payload.findByID({
      collection: 'vehicle-import-jobs' as never,
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })) as unknown as Record<string, unknown>

    const attempts = Number(job.attemptCount ?? 1)
    if (attempts >= 5) {
      return fail('Tiến trình đã vượt quá số lần thử lại tối đa (5 lần).', 429, 'MAX_RETRIES')
    }

    const src = (job.sourceInput as Record<string, unknown> | null) ?? {}
    const method = String(job.method ?? 'URL') as ImportMethod
    if (method === 'PDF_BROCHURE') {
      return fail(
        'Vui lòng tải lại tệp PDF Brochure để chạy lại tiến trình PDF.',
        400,
        'PDF_REUPLOAD_REQUIRED',
      )
    }

    const result = await runVehicleImportPreview({
      payload,
      user,
      method,
      targetModelId: typeof job.targetModel === 'string' ? job.targetModel : undefined,
      conflictPolicy: String(job.conflictPolicy ?? 'MERGE_EMPTY') as ConflictPolicy,
      url: typeof src.url === 'string' ? src.url : undefined,
      query: typeof src.query === 'string' ? src.query : undefined,
      brand: typeof src.brand === 'string' ? src.brand : undefined,
      modelName: typeof src.modelName === 'string' ? src.modelName : undefined,
      modelYear: typeof src.modelYear === 'number' ? src.modelYear : undefined,
      variant: typeof src.variant === 'string' ? src.variant : undefined,
      market: typeof src.market === 'string' ? src.market : undefined,
      dataGroups: Array.isArray(src.dataGroups) ? (src.dataGroups as ImportDataGroup[]) : undefined,
    })

    logger.logSuccess(200, { retriedFrom: id })
    return json(result, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/retry' })
  }
}
