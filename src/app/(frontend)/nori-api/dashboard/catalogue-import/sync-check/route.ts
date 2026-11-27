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
import type { ConflictPolicy } from '@/lib/vehicle-import/types'

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/sync-check', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-sync-check', 15, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['targetModelId', 'url', 'conflictPolicy'], 8192)
    const targetModelId = text(data.targetModelId, 100)
    if (!targetModelId) {
      return fail('Thiếu mã dòng xe cần đồng bộ từ nhà sản xuất.')
    }

    const model = (await payload.findByID({
      collection: 'vehicle-models',
      id: targetModelId,
      user,
      overrideAccess: false,
      depth: 0,
    })) as unknown as Record<string, unknown>

    const syncUrl =
      text(data.url, 500) ||
      (typeof model.importSourceUrl === 'string' && model.importSourceUrl.startsWith('https://')
        ? model.importSourceUrl
        : typeof model.source === 'string' && model.source.startsWith('https://')
          ? model.source
          : '')

    if (!syncUrl) {
      return fail(
        'Dòng xe này chưa có URL nguồn chính thức để đồng bộ. Vui lòng nhập URL website hãng.',
        400,
        'MISSING_SOURCE_URL',
      )
    }

    const rawPolicy = text(data.conflictPolicy, 30)
    const conflictPolicy: ConflictPolicy =
      rawPolicy === 'SKIP_EXISTING' ||
      rawPolicy === 'MERGE_EMPTY' ||
      rawPolicy === 'OVERWRITE_UNLOCKED'
        ? (rawPolicy as ConflictPolicy)
        : 'OVERWRITE_UNLOCKED'

    const result = await runVehicleImportPreview({
      payload,
      user,
      method: 'URL',
      url: syncUrl,
      targetModelId,
      conflictPolicy,
    })

    logger.logSuccess(200, { targetModelId })
    return json(result, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/sync-check' })
  }
}
