import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertRateLimit, createRequestLogger, json } from '@/lib/api-utils'
import { getImportAISearchAvailability } from '@/lib/vehicle-import/ai-search'
import {
  countActiveImportJobs,
  MAX_CONCURRENT_IMPORT_JOBS,
  recoverStaleImportJobs,
} from '@/lib/vehicle-import/job-manager'

export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/jobs', request)
  try {
    assertRateLimit(request, 'catalogue-import-jobs-read', 60, 60_000)
    const auth = await requireAdmin({ permission: ['models', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    await recoverStaleImportJobs(payload, user)
    const activeCount = await countActiveImportJobs(payload, user)
    const aiStatus = getImportAISearchAvailability()

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const statusFilter = (sp.get('status') || '').trim()
    const methodFilter = (sp.get('method') || '').trim()

    const whereClauses: Record<string, unknown>[] = []
    if (statusFilter) whereClauses.push({ status: { equals: statusFilter } })
    if (methodFilter) whereClauses.push({ method: { equals: methodFilter } })

    const res = await payload.find({
      collection: 'vehicle-import-jobs' as never,
      user,
      overrideAccess: false,
      depth: 1,
      page,
      limit: 15,
      sort: '-createdAt',
      ...(whereClauses.length > 0 ? { where: { and: whereClauses } as never } : {}),
    })

    const items = (res.docs as unknown as Array<Record<string, unknown>>).map((j) => {
      const target =
        typeof j.targetModel === 'object' && j.targetModel
          ? (j.targetModel as { id?: unknown; name?: unknown; slug?: unknown })
          : null
      const snap = j.rollbackSnapshot as { rolledBackAt?: unknown } | null
      return {
        id: String(j.id),
        jobCode: String(j.jobCode ?? ''),
        method: String(j.method ?? 'URL'),
        status: String(j.status ?? 'QUEUED'),
        targetModelId: target
          ? String(target.id ?? '')
          : typeof j.targetModel === 'string'
            ? j.targetModel
            : null,
        targetModelName: target?.name ? String(target.name) : null,
        targetModelSlug: target?.slug ? String(target.slug) : null,
        progressPct: Number(j.progressPct ?? 0),
        currentStage: typeof j.currentStage === 'string' ? j.currentStage : null,
        attemptCount: Number(j.attemptCount ?? 1),
        errorCode: typeof j.errorCode === 'string' ? j.errorCode : null,
        errorMessage: typeof j.errorMessage === 'string' ? j.errorMessage : null,
        conflictPolicy: String(j.conflictPolicy ?? 'MERGE_EMPTY'),
        canRollback: Boolean(
          snap &&
          !snap.rolledBackAt &&
          (j.status === 'COMPLETED' || j.status === 'PARTIAL_SUCCESS'),
        ),
        rolledBackAt: typeof snap?.rolledBackAt === 'string' ? snap.rolledBackAt : null,
        createdAt: String(j.createdAt ?? ''),
        finishedAt: typeof j.finishedAt === 'string' ? j.finishedAt : null,
      }
    })

    logger.logSuccess(200, { count: items.length })
    return json(
      {
        items,
        totalDocs: res.totalDocs,
        page: res.page ?? page,
        totalPages: res.totalPages ?? 1,
        activeCount,
        maxConcurrency: MAX_CONCURRENT_IMPORT_JOBS,
        aiAvailable: aiStatus.available,
        aiReason: aiStatus.reason,
      },
      200,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/jobs' })
  }
}
