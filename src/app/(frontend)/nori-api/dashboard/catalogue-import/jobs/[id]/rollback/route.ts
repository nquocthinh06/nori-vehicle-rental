import { requireAdmin } from '@/lib/admin-api'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  createRequestLogger,
  fail,
  json,
} from '@/lib/api-utils'
import { rollbackImportJob } from '@/lib/vehicle-import/import-service'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/rollback', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-rollback', 15, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã tiến trình cần khôi phục.')

    const res = await rollbackImportJob({ payload, user, jobId: id })
    logger.logSuccess(200, { targetModelId: res.targetModelId })
    return json(res, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/rollback' })
  }
}
