import { APIError, type Payload, type PayloadRequest } from 'payload'
import {
  evaluatePromotion,
  type PromoEvaluationResult,
  type PromoRecordLike,
} from './rental-rules.ts'

type SqlResult = { rowsAffected?: number; changes?: number; rowCount?: number }
type SqlRunner = {
  run?: (statement: unknown) => Promise<SqlResult> | SqlResult
  execute?: (statement: unknown) => Promise<SqlResult> | SqlResult
}

let bookingWriteQueue: Promise<unknown> = Promise.resolve()

/**
 * Serializes booking/schedule/promo-quota write transactions inside a single Node.js
 * process so simultaneous SQLite requests queue cleanly (<10ms) and return deterministic
 * 409/400 business responses instead of colliding with SQLITE_BUSY on DEFERRED lock upgrades.
 */
export function withBookingWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const next = bookingWriteQueue.then(task, task)
  bookingWriteQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function isPostgresPayload(payload: Payload): boolean {
  const dbName = String((payload.db as unknown as { name?: string })?.name ?? '').toLowerCase()
  if (dbName.includes('postgres')) return true
  const rawUri = (process.env.DATABASE_URL || process.env.DATABASE_URI || '').trim()
  return !dbName && (rawUri.startsWith('postgres://') || rawUri.startsWith('postgresql://'))
}

async function getSqlRunner(payload: Payload, req?: PayloadRequest): Promise<SqlRunner | null> {
  const dbAdapter = payload.db as unknown as {
    drizzle?: SqlRunner
    sessions?: Record<string, { db?: SqlRunner }>
  }
  if (req?.transactionID) {
    const txId = await req.transactionID
    if (txId && dbAdapter.sessions?.[String(txId)]?.db) {
      return dbAdapter.sessions[String(txId)].db!
    }
  }
  return dbAdapter.drizzle ?? null
}

async function executeDialectSql(
  payload: Payload,
  runner: SqlRunner,
  buildStatement: (
    dialect: 'postgres' | 'sqlite',
    sqlTag: typeof import('@payloadcms/db-postgres').sql,
  ) => unknown,
): Promise<number> {
  const isPg = isPostgresPayload(payload)
  if (isPg && typeof runner.execute === 'function') {
    const { sql: pgSql } = await import('@payloadcms/db-postgres')
    const stmt = buildStatement('postgres', pgSql as never)
    const res = await runner.execute(stmt)
    return Number(res?.rowCount ?? res?.rowsAffected ?? 0)
  }
  if (typeof runner.run === 'function') {
    const { sql: sqliteSql } = await import('@payloadcms/db-sqlite')
    const stmt = buildStatement('sqlite', sqliteSql as never)
    const res = await runner.run(stmt)
    return Number(res?.rowsAffected ?? res?.changes ?? 0)
  }
  if (typeof runner.execute === 'function') {
    const { sql: pgSql } = await import('@payloadcms/db-postgres')
    const stmt = buildStatement('postgres', pgSql as never)
    const res = await runner.execute(stmt)
    return Number(res?.rowCount ?? res?.rowsAffected ?? res?.changes ?? 0)
  }
  return -1
}

export type PromoWithScope = PromoRecordLike & {
  id: string
  branchScope?: string | null
  applicableBranchIds?: unknown
}

export async function findPromotionByCode(
  payload: Payload,
  rawCode: string,
  req?: PayloadRequest,
): Promise<PromoWithScope | null> {
  const normalized = String(rawCode ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return null

  const res = await payload.find({
    collection: 'promotions',
    overrideAccess: true,
    ...(req ? { req } : {}),
    depth: 0,
    limit: 1,
    select: {
      code: true,
      name: true,
      description: true,
      discountType: true,
      discountValue: true,
      maxDiscount: true,
      minDays: true,
      appliesTo: true,
      validFrom: true,
      validTo: true,
      usageLimit: true,
      usedCount: true,
      active: true,
      branchScope: true,
      applicableBranchIds: true,
    },
    where: { code: { equals: normalized } },
  })
  const doc = res.docs[0]
  if (!doc) return null
  return {
    id: String(doc.id),
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    maxDiscount: doc.maxDiscount ?? null,
    minDays: doc.minDays ?? 1,
    appliesTo: doc.appliesTo ?? 'RENT',
    validFrom: doc.validFrom ?? null,
    validTo: doc.validTo ?? null,
    usageLimit: doc.usageLimit ?? null,
    usedCount: doc.usedCount ?? 0,
    active: Boolean(doc.active),
    branchScope: (doc as { branchScope?: string | null }).branchScope ?? null,
    applicableBranchIds: (doc as { applicableBranchIds?: unknown }).applicableBranchIds ?? null,
  }
}

export async function lookupAndEvaluatePromotion(
  payload: Payload,
  params: {
    code: string
    serviceType?: 'RENT' | 'SALE'
    totalDays: number
    subtotalBeforePromo: number
    today?: string
    alreadyHeldByCurrentBooking?: boolean
    req?: PayloadRequest
  },
): Promise<{
  promo: PromoWithScope | null
  evaluation: PromoEvaluationResult
}> {
  const promo = await findPromotionByCode(payload, params.code, params.req)
  const evaluation = evaluatePromotion(promo, {
    code: params.code,
    serviceType: params.serviceType ?? 'RENT',
    totalDays: params.totalDays,
    subtotalBeforePromo: params.subtotalBeforePromo,
    today: params.today,
    alreadyHeldByCurrentBooking: params.alreadyHeldByCurrentBooking,
  })
  return { promo, evaluation }
}

export function promoErrorHttpStatus(evaluation: PromoEvaluationResult): number {
  if (
    evaluation.status === 'USAGE_LIMIT_REACHED' ||
    evaluation.status === 'INACTIVE' ||
    evaluation.status === 'EXPIRED'
  ) {
    return 409
  }
  return 400
}

/**
 * Atomically increments `promotions.used_count` within the active Payload SQLite transaction
 * only if the promotion is still active and strictly below `usage_limit`.
 * Rolls back automatically if the enclosing booking create/update transaction fails.
 */
export async function consumePromoSlotAtomically(
  payload: Payload,
  promoId: string,
  req?: PayloadRequest,
): Promise<void> {
  const runner = await getSqlRunner(payload, req)
  const nowIso = new Date().toISOString()
  if (runner) {
    const affected = await executeDialectSql(payload, runner, (dialect, sqlTag) =>
      dialect === 'postgres'
        ? sqlTag`UPDATE promotions
            SET used_count = COALESCE(used_count, 0) + 1,
                updated_at = ${nowIso}
            WHERE id = ${promoId}
              AND active = true
              AND (usage_limit IS NULL OR COALESCE(used_count, 0) < usage_limit)`
        : sqlTag`UPDATE promotions
            SET used_count = COALESCE(used_count, 0) + 1,
                updated_at = ${nowIso}
            WHERE id = ${promoId}
              AND active = 1
              AND (usage_limit IS NULL OR COALESCE(used_count, 0) < usage_limit)`,
    )
    if (affected >= 0) {
      if (affected !== 1) {
        throw new APIError('Mã đã hết lượt sử dụng.', 409)
      }
      return
    }
  }

  const latest = await payload.findByID({
    collection: 'promotions',
    id: promoId,
    ...(req ? { req } : {}),
    overrideAccess: true,
    depth: 0,
  })
  if (
    !latest ||
    !latest.active ||
    (latest.usageLimit != null && (latest.usedCount ?? 0) >= latest.usageLimit)
  ) {
    throw new APIError('Mã đã hết lượt sử dụng.', 409)
  }
  await payload.update({
    collection: 'promotions',
    id: promoId,
    ...(req ? { req } : {}),
    overrideAccess: true,
    context: { skipAudit: true },
    data: { usedCount: (latest.usedCount ?? 0) + 1 },
  })
}

/**
 * Atomically restores 1 usage slot (`used_count = MAX(0, used_count - 1)`) when a booking
 * holding `promoCode` is cancelled, rejected, or edited to remove/replace that promo.
 */
export async function releasePromoSlotAtomically(
  payload: Payload,
  promoCode: string | null | undefined,
  req?: PayloadRequest,
): Promise<void> {
  const normalized = String(promoCode ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return

  const runner = await getSqlRunner(payload, req)
  const nowIso = new Date().toISOString()
  if (runner) {
    const affected = await executeDialectSql(
      payload,
      runner,
      (_dialect, sqlTag) =>
        sqlTag`UPDATE promotions
          SET used_count = CASE
                WHEN COALESCE(used_count, 0) > 0 THEN COALESCE(used_count, 0) - 1
                ELSE 0
              END,
              updated_at = ${nowIso}
          WHERE code = ${normalized}`,
    )
    if (affected >= 0) return
  }

  const found = await findPromotionByCode(payload, normalized, req)
  if (!found) return
  await payload.update({
    collection: 'promotions',
    id: found.id,
    ...(req ? { req } : {}),
    overrideAccess: true,
    context: { skipAudit: true },
    data: { usedCount: Math.max(0, (found.usedCount ?? 1) - 1) },
  })
}
