import { recordAudit } from '@/hooks/audit-nori'
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger(
    'nori-api/dashboard/catalogue-import/models/[id]/locks',
    request,
  )
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-locks', 30, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã dòng xe.')

    const data = await body(request, ['lockedFields'], 8192)
    if (!Array.isArray(data.lockedFields)) {
      return fail('lockedFields phải là mảng tên trường dữ liệu.')
    }

    const cleanLocks = [
      ...new Set(data.lockedFields.map((f) => text(f, 80)).filter(Boolean)),
    ].slice(0, 40)

    const existing = await payload.findByID({
      collection: 'vehicle-models',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })

    const prevRev = Number((existing as unknown as Record<string, unknown>).revisionNumber ?? 1)
    const updated = await payload.update({
      collection: 'vehicle-models',
      id,
      user,
      overrideAccess: false,
      data: {
        lockedFields: cleanLocks,
      } as never,
    })

    await recordAudit(payload, user, {
      action: 'vehicle-model.lock_fields',
      entity: 'vehicle-model',
      entityId: String(updated.id),
      entityLabel: updated.name,
      summary: `Cập nhật danh sách trường khóa đồng bộ (${cleanLocks.length} trường) cho ${updated.name}`,
    })

    logger.logSuccess(200, { lockCount: cleanLocks.length })
    return json(
      {
        id: String(updated.id),
        lockedFields: cleanLocks,
        revisionNumber: prevRev,
      },
      200,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, {
      logger,
      route: 'nori-api/dashboard/catalogue-import/models/[id]/locks',
    })
  }
}
