import { requireAdmin } from '@/lib/admin-api'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  createRequestLogger,
  fail,
  json,
} from '@/lib/api-utils'
import { transitionImportJob } from '@/lib/vehicle-import/job-manager'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/cancel', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-cancel', 30, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã tiến trình cần hủy.')

    const job = await transitionImportJob({
      payload,
      user,
      jobId: id,
      toStatus: 'CANCELLED',
      currentStage: 'Đã hủy theo yêu cầu quản trị viên',
    })

    logger.logSuccess(200)
    return json({ job }, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/cancel' })
  }
}
