import { AsyncLocalStorage } from 'node:async_hooks'
import type { Payload, PayloadRequest } from 'payload'
import { withBookingWriteLock } from './promo-service.ts'

type SqlExecuteRunner = {
  execute?: (statement: unknown) => Promise<unknown>
}

type DbAdapterWithTransactions = {
  name?: string
  url?: string
  beginTransaction?: () => Promise<null | number | string>
  commitTransaction?: (id: number | string) => Promise<void>
  rollbackTransaction?: (id: number | string) => Promise<void>
  sessions?: Record<string, { db?: SqlExecuteRunner }>
}

export type AtomicLockContext = {
  req?: PayloadRequest
  transactionID?: number | string
  isPostgresTransaction: boolean
  afterCommit: (fn: () => Promise<unknown> | unknown) => void
}

type StoreState = {
  transactionID?: number | string
  req?: PayloadRequest
  sessionDb?: SqlExecuteRunner
  isPostgresTransaction: boolean
  heldLocks: Set<string>
  afterCommitQueue: Array<() => Promise<unknown> | unknown>
}

const atomicLockStorage = new AsyncLocalStorage<StoreState>()
let savepointSeq = 0

export function isPostgresPayload(payload: Payload): boolean {
  const dbAdapter = payload.db as unknown as DbAdapterWithTransactions | undefined
  const dbName = String(dbAdapter?.name ?? '').toLowerCase()
  if (dbName.includes('postgres')) return true
  const rawUri = String(
    dbAdapter?.url ?? process.env.DATABASE_URL ?? process.env.DATABASE_URI ?? '',
  )
    .trim()
    .toLowerCase()
  return !dbName && (rawUri.startsWith('postgres://') || rawUri.startsWith('postgresql://'))
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as { code?: unknown; cause?: { code?: unknown }; message?: unknown }
  const code = String(rec.code ?? rec.cause?.code ?? '')
  if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') {
    return true
  }
  const msg = String(rec.message ?? '')
  return /unique constraint|duplicate key value|violates unique constraint/i.test(msg)
}

export function txReqOptions(
  req?: PayloadRequest,
  extraContext?: Record<string, unknown>,
  user?: unknown,
): { req?: PayloadRequest; context?: Record<string, unknown> } {
  if (!req) {
    return extraContext ? { context: extraContext } : {}
  }
  const clonedReq =
    extraContext || user !== undefined
      ? ({
          ...req,
          ...(user !== undefined ? { user } : {}),
          ...(extraContext ? { context: { ...(req.context ?? {}), ...extraContext } } : {}),
        } as PayloadRequest)
      : req
  return {
    req: clonedReq,
    ...(extraContext ? { context: extraContext } : {}),
  }
}

async function acquirePgAdvisoryLock(sessionDb: SqlExecuteRunner | undefined, lockKey: string) {
  if (!sessionDb?.execute) return
  const { sql: pgSql } = await import('@payloadcms/db-postgres')
  await sessionDb.execute(pgSql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
}

/**
 * Runs `fn` inside a PostgreSQL SAVEPOINT when an active PG transaction exists, preventing
 * best-effort side effects (audit logs / idempotent notifications) from poisoning the outer
 * PostgreSQL transaction (`25P02`) on duplicate keys or transient errors.
 */
export async function runBestEffortSafe<T>(
  payload: Payload,
  req: PayloadRequest | undefined,
  fn: () => Promise<T>,
  onError?: (error: unknown) => void,
): Promise<T | null> {
  const txId = req?.transactionID
  const dbAdapter = payload.db as unknown as DbAdapterWithTransactions | undefined
  const sessionDb = txId != null ? dbAdapter?.sessions?.[String(txId)]?.db : undefined

  if (isPostgresPayload(payload) && sessionDb?.execute) {
    const { sql: pgSql } = await import('@payloadcms/db-postgres')
    const sp = `nori_sp_${++savepointSeq}`
    await sessionDb.execute(pgSql.raw(`SAVEPOINT ${sp}`))
    try {
      const result = await fn()
      await sessionDb.execute(pgSql.raw(`RELEASE SAVEPOINT ${sp}`))
      return result
    } catch (error) {
      await sessionDb.execute(pgSql.raw(`ROLLBACK TO SAVEPOINT ${sp}`)).catch(() => null)
      onError?.(error)
      return null
    }
  }

  try {
    return await fn()
  } catch (error) {
    onError?.(error)
    return null
  }
}

async function flushAfterCommitQueue(queue: Array<() => Promise<unknown> | unknown>) {
  for (const fn of queue) {
    try {
      await fn()
    } catch (error) {
      console.error(
        '[NORI] Post-commit side effect error:',
        error instanceof Error ? error.name : 'UnknownError',
      )
    }
  }
}

/**
 * Serializes critical booking, payment, promo, and reconciliation mutations across processes
 * (PostgreSQL transaction-scoped advisory locks + ACID transaction) and falls back cleanly to
 * the in-process FIFO mutex on SQLite / unit test harnesses.
 */
export async function withAtomicResourceLock<T>(
  payload: Payload,
  lockKey: string,
  task: (ctx: AtomicLockContext) => Promise<T>,
): Promise<T> {
  const existing = atomicLockStorage.getStore()
  if (existing) {
    if (existing.isPostgresTransaction && !existing.heldLocks.has(lockKey)) {
      await acquirePgAdvisoryLock(existing.sessionDb, lockKey)
      existing.heldLocks.add(lockKey)
    }
    return await task({
      req: existing.req,
      transactionID: existing.transactionID,
      isPostgresTransaction: existing.isPostgresTransaction,
      afterCommit: (fn) => existing.afterCommitQueue.push(fn),
    })
  }

  const dbAdapter = payload.db as unknown as DbAdapterWithTransactions | undefined
  const usePgTx = isPostgresPayload(payload) && typeof dbAdapter?.beginTransaction === 'function'

  if (usePgTx && dbAdapter?.beginTransaction) {
    const txId = await dbAdapter.beginTransaction()
    if (txId != null) {
      const sessionDb = dbAdapter.sessions?.[String(txId)]?.db
      const txReq = {
        payload,
        transactionID: txId,
        context: {},
      } as unknown as PayloadRequest
      const store: StoreState = {
        transactionID: txId,
        req: txReq,
        sessionDb,
        isPostgresTransaction: true,
        heldLocks: new Set([lockKey]),
        afterCommitQueue: [],
      }

      let result: T
      try {
        await acquirePgAdvisoryLock(sessionDb, lockKey)
        result = await atomicLockStorage.run(store, () =>
          task({
            req: txReq,
            transactionID: txId,
            isPostgresTransaction: true,
            afterCommit: (fn) => store.afterCommitQueue.push(fn),
          }),
        )
        await dbAdapter.commitTransaction?.(txId)
      } catch (error) {
        await dbAdapter.rollbackTransaction?.(txId).catch(() => null)
        throw error
      }

      await flushAfterCommitQueue(store.afterCommitQueue)
      return result
    }
  }

  return await withBookingWriteLock(async () => {
    const store: StoreState = {
      isPostgresTransaction: false,
      heldLocks: new Set([lockKey]),
      afterCommitQueue: [],
    }
    const result = await atomicLockStorage.run(store, () =>
      task({
        isPostgresTransaction: false,
        afterCommit: (fn) => store.afterCommitQueue.push(fn),
      }),
    )
    await flushAfterCommitQueue(store.afterCommitQueue)
    return result
  })
}
