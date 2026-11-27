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
import { approveAndCommitImportJob } from '@/lib/vehicle-import/import-service'
import type { ConflictPolicy } from '@/lib/vehicle-import/types'

const APPROVE_ALLOWLIST = [
  'publishMode',
  'verificationStatus',
  'visible',
  'selectedFields',
  'overrides',
  'conflictPolicy',
  'lockFields',
  'downloadMedia',
  'selectedMediaUrls',
  'targetModelId',
]

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const logger = createRequestLogger('nori-api/dashboard/catalogue-import/approve', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'catalogue-import-approve', 20, 60_000)

    const auth = await requireAdmin({ permission: ['models', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const { id } = await context.params
    if (!id) return fail('Thiếu mã tiến trình cần phê duyệt.')

    const data = await body(request, APPROVE_ALLOWLIST, 200_000)
    const rawPublishMode = text(data.publishMode, 30)
    const publishMode =
      rawPublishMode === 'DRAFT' ||
      rawPublishMode === 'VERIFIED_HIDDEN' ||
      rawPublishMode === 'PUBLISH'
        ? rawPublishMode
        : undefined
    const rawVerif = text(data.verificationStatus, 20)
    const verificationStatus =
      rawVerif === 'VERIFIED' || rawVerif === 'UNVERIFIED' || rawVerif === 'DRAFT'
        ? rawVerif
        : undefined
    const rawPolicy = text(data.conflictPolicy, 30)
    const conflictPolicy =
      rawPolicy === 'SKIP_EXISTING' ||
      rawPolicy === 'MERGE_EMPTY' ||
      rawPolicy === 'OVERWRITE_UNLOCKED'
        ? (rawPolicy as ConflictPolicy)
        : undefined

    const res = await approveAndCommitImportJob({
      payload,
      user,
      jobId: id,
      publishMode,
      verificationStatus,
      visible: typeof data.visible === 'boolean' ? data.visible : undefined,
      selectedFields: Array.isArray(data.selectedFields)
        ? data.selectedFields.map((f) => text(f, 80)).filter(Boolean)
        : undefined,
      overrides:
        data.overrides && typeof data.overrides === 'object' && !Array.isArray(data.overrides)
          ? (data.overrides as Record<string, unknown>)
          : undefined,
      conflictPolicy,
      lockFields: Array.isArray(data.lockFields)
        ? data.lockFields.map((f) => text(f, 80)).filter(Boolean)
        : undefined,
      downloadMedia: typeof data.downloadMedia === 'boolean' ? data.downloadMedia : undefined,
      selectedMediaUrls: Array.isArray(data.selectedMediaUrls)
        ? data.selectedMediaUrls.map((u) => text(u, 500)).filter(Boolean)
        : undefined,
      targetModelId: text(data.targetModelId, 100) || undefined,
    })

    logger.logSuccess(200, { modelId: res.model.id })
    return json(res, 200, logger.responseHeaders())
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/catalogue-import/approve' })
  }
}
