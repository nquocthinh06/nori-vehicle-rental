import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertRateLimit, createRequestLogger, fail, json } from '@/lib/api-utils'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/jobs/[id]', request)
  try {
    assertRateLimit(request, 'catalogue-import-job-detail', 60, 60_000)
    const auth = await requireAdmin({ permission: ['models', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã tiến trình.')

    const doc = (await payload.findByID({
      collection: 'vehicle-import-jobs' as never,
      id,
      user,
      overrideAccess: false,
      depth: 1,
    })) as unknown as Record<string, unknown>

    logger.logSuccess(200)
    return json({ job: doc }, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/jobs/[id]' })
  }
}
