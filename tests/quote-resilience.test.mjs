import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyUnexpectedError } from '../src/lib/error-classifier.ts'
import { createPostgresPoolConfig } from '../src/lib/postgres-url.ts'
import { consumePromoSlotAtomically, releasePromoSlotAtomically } from '../src/lib/promo-service.ts'

describe('NORI Quote, Promo Dialect & PostgreSQL Resilience', () => {
  it('PROMO-PG-01: consumePromoSlotAtomically uses Postgres execute + boolean active = true + rowCount', async () => {
    const statements = []
    let nextRowCount = 1
    const mockPayload = {
      db: {
        name: 'postgres',
        sessions: {
          'tx-pg-1': {
            db: {
              execute: async (stmt) => {
                statements.push(stmt)
                return { rowCount: nextRowCount }
              },
            },
          },
        },
      },
    }
    const mockReq = { transactionID: Promise.resolve('tx-pg-1') }

    await consumePromoSlotAtomically(mockPayload, 'promo-uuid-1', mockReq)
    assert.equal(statements.length, 1)
    const renderedSql = statements[0].queryChunks
      ? statements[0].queryChunks.map((c) => (c?.value ? c.value.join('') : '?')).join('')
      : JSON.stringify(statements[0])
    assert.match(renderedSql, /active = true/i)
    assert.doesNotMatch(renderedSql, /active = 1/i)

    nextRowCount = 0
    await assert.rejects(
      () => consumePromoSlotAtomically(mockPayload, 'promo-uuid-1', mockReq),
      /Mã đã hết lượt sử dụng/,
    )

    await releasePromoSlotAtomically(mockPayload, ' norixincamon ', mockReq)
    assert.equal(statements.length, 3)
  })

  it('PROMO-SQLITE-01: consumePromoSlotAtomically uses SQLite run + active = 1 + rowsAffected', async () => {
    const statements = []
    let nextAffected = 1
    const mockPayload = {
      db: {
        name: 'sqlite',
        sessions: {
          'tx-sq-1': {
            db: {
              run: async (stmt) => {
                statements.push(stmt)
                return { rowsAffected: nextAffected }
              },
            },
          },
        },
      },
    }
    const mockReq = { transactionID: Promise.resolve('tx-sq-1') }

    await consumePromoSlotAtomically(mockPayload, 'promo-sqlite-1', mockReq)
    assert.equal(statements.length, 1)
    const renderedSql = statements[0].queryChunks
      ? statements[0].queryChunks.map((c) => (c?.value ? c.value.join('') : '?')).join('')
      : JSON.stringify(statements[0])
    assert.match(renderedSql, /active = 1/i)

    nextAffected = 0
    await assert.rejects(
      () => consumePromoSlotAtomically(mockPayload, 'promo-sqlite-1', mockReq),
      /Mã đã hết lượt sử dụng/,
    )

    await releasePromoSlotAtomically(mockPayload, 'NORITEST', mockReq)
    assert.equal(statements.length, 3)
  })

  it('PG-POOL-01: createPostgresPoolConfig adapts pool max, idleTimeoutMillis & query timeouts for Vercel serverless', () => {
    const origVercel = process.env.VERCEL
    const origVercelEnv = process.env.VERCEL_ENV
    const origMax = process.env.NORI_PG_POOL_MAX
    try {
      delete process.env.NORI_PG_POOL_MAX
      delete process.env.VERCEL
      delete process.env.VERCEL_ENV
      const localCfg = createPostgresPoolConfig('postgresql://user:pass@localhost:5432/nori')
      assert.equal(localCfg.max, 10)
      assert.equal(localCfg.allowExitOnIdle, false)
      assert.equal(localCfg.statement_timeout, 8000)

      process.env.VERCEL = '1'
      process.env.VERCEL_ENV = 'production'
      const vercelCfg = createPostgresPoolConfig(
        'postgresql://user:pass@ep-test.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
      )
      assert.equal(vercelCfg.max, 5)
      assert.equal(vercelCfg.allowExitOnIdle, true)
      assert.equal(vercelCfg.idleTimeoutMillis, 15_000)
      assert.ok(vercelCfg.connectionString.includes('sslmode=verify-full'))
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel
      else delete process.env.VERCEL
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv
      else delete process.env.VERCEL_ENV
      if (origMax !== undefined) process.env.NORI_PG_POOL_MAX = origMax
      else delete process.env.NORI_PG_POOL_MAX
    }
  })

  it('ERR-CLASS-01: classifyUnexpectedError separates DB timeouts, disconnects, deadlocks, UUID validation & schema errors', () => {
    const stmtTimeout = classifyUnexpectedError(
      Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
    )
    assert.equal(stmtTimeout.category, 'DATABASE_TIMEOUT')
    assert.equal(stmtTimeout.status, 504)
    assert.equal(stmtTimeout.code, 'DATABASE_TIMEOUT')

    const reqTimeout = classifyUnexpectedError(
      Object.assign(new Error('network operation timed out'), { name: 'TimeoutError' }),
    )
    assert.equal(reqTimeout.category, 'REQUEST_TIMEOUT')
    assert.equal(reqTimeout.status, 504)

    const pgConnLost = classifyUnexpectedError(
      Object.assign(new Error('Connection terminated unexpectedly'), { code: '57P01' }),
    )
    assert.equal(pgConnLost.category, 'DATABASE_UNAVAILABLE')
    assert.equal(pgConnLost.status, 503)

    const deadlock = classifyUnexpectedError(
      Object.assign(new Error('deadlock detected'), { code: '40P01' }),
    )
    assert.equal(deadlock.category, 'CONFLICT')
    assert.equal(deadlock.status, 409)

    const badUuid = classifyUnexpectedError(
      Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }),
    )
    assert.equal(badUuid.category, 'VALIDATION_ERROR')
    assert.equal(badUuid.status, 400)

    const missingCol = classifyUnexpectedError(
      Object.assign(new Error('column "foo" does not exist'), { code: '42703' }),
    )
    assert.equal(missingCol.category, 'DATABASE_SCHEMA_ERROR')
    assert.equal(missingCol.status, 503)
  })
})
