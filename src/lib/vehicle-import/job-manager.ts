import crypto from 'node:crypto'
import { APIError, type Payload } from 'payload'
import type { Admin } from '@/payload-types'
import type { ConflictPolicy, ImportJobStatus, ImportMethod } from './types.ts'

export const MAX_CONCURRENT_IMPORT_JOBS = 3
export const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000

const ACTIVE_JOB_STATUSES: ImportJobStatus[] = [
  'QUEUED',
  'FETCHING',
  'EXTRACTING',
  'NORMALIZING',
  'VALIDATING',
  'IMPORTING',
]

export const LEGAL_JOB_TRANSITIONS: Record<ImportJobStatus, readonly ImportJobStatus[]> = {
  QUEUED: ['FETCHING', 'EXTRACTING', 'FAILED', 'CANCELLED'],
  FETCHING: ['EXTRACTING', 'FAILED', 'CANCELLED'],
  EXTRACTING: ['NORMALIZING', 'FAILED', 'CANCELLED'],
  NORMALIZING: ['VALIDATING', 'FAILED', 'CANCELLED'],
  VALIDATING: ['PREVIEW_READY', 'AWAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  PREVIEW_READY: ['AWAITING_APPROVAL', 'IMPORTING', 'CANCELLED', 'FAILED'],
  AWAITING_APPROVAL: ['IMPORTING', 'CANCELLED', 'FAILED'],
  IMPORTING: ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  PARTIAL_SUCCESS: ['IMPORTING', 'COMPLETED'],
  FAILED: ['QUEUED'],
  CANCELLED: ['QUEUED'],
}

export function isLegalJobTransition(from: ImportJobStatus, to: ImportJobStatus): boolean {
  if (from === to) return true
  return LEGAL_JOB_TRANSITIONS[from]?.includes(to) ?? false
}

export function generateJobCode(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `IMP-${stamp}-${rand}`
}

export async function recoverStaleImportJobs(
  payload: Payload,
  user: Admin & { collection: 'admins' },
): Promise<number> {
  const cutoffIso = new Date(Date.now() - STALE_JOB_TIMEOUT_MS).toISOString()
  const activeRes = await payload.find({
    collection: 'vehicle-import-jobs' as never,
    user,
    overrideAccess: false,
    depth: 0,
    limit: 50,
    where: {
      status: { in: ACTIVE_JOB_STATUSES },
    },
  })

  let recovered = 0
  for (const rawDoc of activeRes.docs as unknown as Array<Record<string, unknown>>) {
    const startedOrUpdated = String(rawDoc.startedAt ?? rawDoc.updatedAt ?? rawDoc.createdAt ?? '')
    if (!startedOrUpdated || startedOrUpdated < cutoffIso) {
      await payload.update({
        collection: 'vehicle-import-jobs' as never,
        id: String(rawDoc.id),
        user,
        overrideAccess: false,
        data: {
          status: 'FAILED',
          currentStage: 'Khôi phục sau khởi động lại máy chủ',
          errorCode: 'RECOVERED_AFTER_RESTART',
          errorMessage:
            'Tiến trình bị gián đoạn khi máy chủ khởi động lại hoặc quá thời gian xử lý. Bạn có thể bấm "Thử lại".',
          finishedAt: new Date().toISOString(),
        } as never,
      })
      recovered += 1
    }
  }
  return recovered
}

export async function countActiveImportJobs(
  payload: Payload,
  user: Admin & { collection: 'admins' },
): Promise<number> {
  const res = await payload.count({
    collection: 'vehicle-import-jobs' as never,
    user,
    overrideAccess: false,
    where: {
      status: { in: ACTIVE_JOB_STATUSES },
    },
  })
  return res.totalDocs
}

export async function createImportJob(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  method: ImportMethod
  conflictPolicy?: ConflictPolicy
  targetModelId?: string | null
  sourceInput: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  await recoverStaleImportJobs(params.payload, params.user)
  const activeCount = await countActiveImportJobs(params.payload, params.user)
  if (activeCount >= MAX_CONCURRENT_IMPORT_JOBS) {
    throw new APIError(
      `Hệ thống đang xử lý ${activeCount} tiến trình nhập dữ liệu. Vui lòng chờ hoàn tất hoặc hủy tiến trình cũ.`,
      429,
      { code: 'CONCURRENCY_LIMIT_REACHED' },
    )
  }

  const doc = await params.payload.create({
    collection: 'vehicle-import-jobs' as never,
    user: params.user,
    overrideAccess: false,
    data: {
      jobCode: generateJobCode(),
      method: params.method,
      status: 'QUEUED',
      targetModel: params.targetModelId || undefined,
      sourceInput: params.sourceInput,
      conflictPolicy: params.conflictPolicy ?? 'MERGE_EMPTY',
      progressPct: 5,
      currentStage: 'Đã tiếp nhận vào hàng đợi',
      attemptCount: 1,
      createdByAdminId: String(params.user.id),
      startedAt: new Date().toISOString(),
    } as never,
  })

  return doc as unknown as Record<string, unknown>
}

export async function transitionImportJob(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  jobId: string
  toStatus: ImportJobStatus
  progressPct?: number
  currentStage?: string
  patch?: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const current = (await params.payload.findByID({
    collection: 'vehicle-import-jobs' as never,
    id: params.jobId,
    user: params.user,
    overrideAccess: false,
    depth: 0,
  })) as unknown as Record<string, unknown>

  const fromStatus = String(current.status ?? 'QUEUED') as ImportJobStatus
  if (!isLegalJobTransition(fromStatus, params.toStatus)) {
    throw new APIError(
      `Không thể chuyển trạng thái tiến trình từ ${fromStatus} sang ${params.toStatus}.`,
      409,
      { code: 'INVALID_JOB_TRANSITION' },
    )
  }

  const isTerminal = ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED'].includes(
    params.toStatus,
  )

  const updated = await params.payload.update({
    collection: 'vehicle-import-jobs' as never,
    id: params.jobId,
    user: params.user,
    overrideAccess: false,
    data: {
      status: params.toStatus,
      ...(params.progressPct !== undefined ? { progressPct: params.progressPct } : {}),
      ...(params.currentStage !== undefined ? { currentStage: params.currentStage } : {}),
      ...(isTerminal ? { finishedAt: new Date().toISOString() } : {}),
      ...(params.patch ?? {}),
    } as never,
  })

  return updated as unknown as Record<string, unknown>
}

export async function assertJobNotCancelled(
  payload: Payload,
  user: Admin & { collection: 'admins' },
  jobId: string,
): Promise<void> {
  const current = (await payload.findByID({
    collection: 'vehicle-import-jobs' as never,
    id: jobId,
    user,
    overrideAccess: false,
    depth: 0,
  })) as unknown as Record<string, unknown>
  if (current.status === 'CANCELLED') {
    throw new APIError('Tiến trình nhập dữ liệu đã bị hủy theo yêu cầu.', 409, {
      code: 'JOB_CANCELLED',
    })
  }
}
