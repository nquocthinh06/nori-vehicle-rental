import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateEnvironment } from '../src/lib/env.ts'
import {
  isUniqueConstraintError,
  runBestEffortSafe,
  txReqOptions,
  withAtomicResourceLock,
} from '../src/lib/db-tx.ts'
import { createPostgresPoolConfig } from '../src/lib/postgres-url.ts'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readRepoFile = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8')

const ENV_KEYS = [
  'NODE_ENV',
  'APP_ENV',
  'NORI_ENV',
  'VERCEL',
  'VERCEL_ENV',
  'CI',
  'GITHUB_ACTIONS',
  'DATABASE_URL',
  'DATABASE_URI',
  'NORI_REQUIRE_POSTGRES',
  'NORI_SQLITE_PATH',
  'PAYLOAD_SECRET',
  'NORI_SESSION_SECRET',
  'BLOB_READ_WRITE_TOKEN',
  'BLOB_STORAGE_PREFIX',
  'NORI_PRODUCTION_DB_HOST',
  'NORI_PRODUCTION_BLOB_PREFIX',
  'PAYMENT_ENABLED',
  'PAYMENT_PROVIDER',
  'PAYMENT_MODE',
  'SEPAY_API_KEY',
  'SEPAY_WEBHOOK_SECRET',
]

function withTempEnv(overrides, fn) {
  const backup = new Map()
  for (const key of ENV_KEYS) {
    backup.set(key, process.env[key])
    delete process.env[key]
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const key of ENV_KEYS) {
      const orig = backup.get(key)
      if (orig === undefined) delete process.env[key]
      else process.env[key] = orig
    }
  }
}

test('fail-fast env: production & vercel require PostgreSQL, strong secrets, blob & SePay keys', () => {
  const validSecret = 'nori-strong-secret-key-at-least-32-chars-2026'

  withTempEnv(
    {
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      DATABASE_URL: 'file:./nori.db',
      PAYLOAD_SECRET: validSecret,
      NORI_SESSION_SECRET: `${validSecret}-sess`,
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_teststoreid12_secretkeyvalue34',
    },
    () => {
      const res = validateEnvironment({ checkStorageWritable: false })
      assert.equal(res.ok, false)
      assert.ok(
        res.errors.some((e) => /PostgreSQL|DATABASE_URL/i.test(e)),
        `Expected PG error, got: ${JSON.stringify(res.errors)}`,
      )
    },
  )

  withTempEnv(
    {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@prod.db.example.com/nori?sslmode=require',
      PAYLOAD_SECRET: 'dev-secret-change-me',
      NORI_SESSION_SECRET: 'short',
      PAYMENT_ENABLED: 'true',
      PAYMENT_PROVIDER: 'SEPAY',
      PAYMENT_MODE: 'PRODUCTION',
    },
    () => {
      const res = validateEnvironment({ checkStorageWritable: false })
      assert.equal(res.ok, false)
      assert.ok(res.errors.some((e) => /PAYLOAD_SECRET/i.test(e)))
      assert.ok(res.errors.some((e) => /NORI_SESSION_SECRET/i.test(e)))
      assert.ok(res.errors.some((e) => /BLOB_READ_WRITE_TOKEN/i.test(e)))
      assert.ok(res.errors.some((e) => /SEPAY_API_KEY/i.test(e)))
    },
  )

  withTempEnv(
    {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@prod.db.example.com/nori?sslmode=require',
      PAYLOAD_SECRET: validSecret,
      NORI_SESSION_SECRET: `${validSecret}-sess`,
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_teststoreid12_secretkeyvalue34',
      PAYMENT_ENABLED: 'true',
      PAYMENT_PROVIDER: 'SEPAY',
      PAYMENT_MODE: 'PRODUCTION',
      SEPAY_API_KEY: 'sepay-live-key-placeholder',
      SEPAY_WEBHOOK_SECRET: 'sepay-live-webhook-placeholder',
    },
    () => {
      const res = validateEnvironment({ checkStorageWritable: false })
      assert.equal(res.ok, true, `Unexpected errors: ${JSON.stringify(res.errors)}`)
      assert.equal(res.config.deploymentTier, 'production')
      assert.equal(res.config.databaseEngine, 'postgres')
    },
  )
})

test('staging isolation: blocks PAYMENT_MODE=PRODUCTION, prod DB host reuse & prod blob prefix', () => {
  const validSecret = 'nori-staging-secret-key-32-chars-minimum-2026'

  withTempEnv(
    {
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      DATABASE_URL: 'postgresql://user:pass@ep-prod-shared.ap-southeast-1.aws.neon.tech/neondb',
      NORI_PRODUCTION_DB_HOST: 'ep-prod-shared.ap-southeast-1.aws.neon.tech',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_stagingstore_secretkeyvalue34',
      BLOB_STORAGE_PREFIX: 'prod',
      NORI_PRODUCTION_BLOB_PREFIX: 'prod',
      PAYLOAD_SECRET: validSecret,
      NORI_SESSION_SECRET: `${validSecret}-sess`,
      PAYMENT_MODE: 'PRODUCTION',
    },
    () => {
      const res = validateEnvironment({ checkStorageWritable: false })
      assert.equal(res.ok, false)
      assert.ok(res.errors.some((e) => /NORI_PRODUCTION_DB_HOST/i.test(e)))
      assert.ok(res.errors.some((e) => /NORI_PRODUCTION_BLOB_PREFIX/i.test(e)))
      assert.ok(res.errors.some((e) => /PAYMENT_MODE=PRODUCTION/i.test(e)))
    },
  )
})

test('startup boot guard: payload.config refuses non-PG fallback & seed-nori disables auto-seed on Prod', () => {
  const payloadCfg = readRepoFile('src/payload.config.ts')
  assert.ok(payloadCfg.includes('[NORI DB CONFIG ERROR]'))
  assert.ok(payloadCfg.includes('NORI_REQUIRE_POSTGRES'))

  const seedSrc = readRepoFile('src/lib/seed-nori.ts')
  assert.ok(seedSrc.includes('export function isProtectedProductionRuntime'))
  assert.ok(seedSrc.includes("vercelEnv === 'production' || appEnv === 'production'"))
  assert.ok(seedSrc.includes("process.env.NORI_ALLOW_STARTUP_BOOTSTRAP !== '1'"))
})

test('PostgreSQL SAVEPOINT + advisory lock helper prevents 25P02 tx poison and executes afterCommit post-commit', async () => {
  const executedSql = []
  let txSeq = 0
  const committed = []
  const rolledBack = []

  const fakePayload = {
    db: {
      name: 'postgres',
      sessions: {},
      async beginTransaction() {
        const id = `tx-${++txSeq}`
        this.sessions[id] = {
          db: {
            async execute(stmt) {
              const sqlText =
                typeof stmt === 'string'
                  ? stmt
                  : Array.isArray(stmt?.queryChunks)
                    ? stmt.queryChunks
                        .map((c) => (typeof c === 'string' ? c : (c?.value ?? '?')))
                        .join('')
                    : String(stmt)
              executedSql.push(sqlText)
              return { rows: [] }
            },
          },
        }
        return id
      },
      async commitTransaction(id) {
        committed.push(id)
        delete this.sessions[id]
      },
      async rollbackTransaction(id) {
        rolledBack.push(id)
        delete this.sessions[id]
      },
    },
  }

  let afterCommitRan = false
  const outcome = await withAtomicResourceLock(fakePayload, 'payment-booking:bk-1', async (tx) => {
    assert.equal(tx.isPostgresTransaction, true)
    assert.ok(tx.transactionID)
    assert.ok(
      executedSql.some((q) => q.includes('pg_advisory_xact_lock')),
      'Advisory lock must be acquired before task runs',
    )

    // Best-effort duplicate inside PG tx must savepoint-rollback cleanly without aborting outer tx
    const bestEffortRes = await runBestEffortSafe(fakePayload, tx.req, async () => {
      const dupErr = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      })
      assert.equal(isUniqueConstraintError(dupErr), true)
      throw dupErr
    })
    assert.equal(bestEffortRes, null)
    assert.ok(executedSql.some((q) => q.includes('SAVEPOINT nori_sp_')))
    assert.ok(executedSql.some((q) => q.includes('ROLLBACK TO SAVEPOINT nori_sp_')))

    // afterCommit must NOT run until commitTransaction finishes
    tx.afterCommit(() => {
      assert.equal(committed.length, 1)
      afterCommitRan = true
    })
    assert.equal(afterCommitRan, false)

    const opts = txReqOptions(tx.req, { noriSystemPaymentSync: true }, { id: 'admin-1' })
    assert.equal(opts.req.context.noriSystemPaymentSync, true)
    assert.deepEqual(opts.req.user, { id: 'admin-1' })

    return 'COMMITTED_OK'
  })

  assert.equal(outcome, 'COMMITTED_OK')
  assert.equal(committed.length, 1)
  assert.equal(rolledBack.length, 0)
  assert.equal(afterCommitRan, true)

  // Rollback case: afterCommit MUST NOT run if task throws
  let failedAfterCommit = false
  await assert.rejects(
    withAtomicResourceLock(fakePayload, 'payment-booking:bk-2', async (tx) => {
      tx.afterCommit(() => {
        failedAfterCommit = true
      })
      throw new Error('forced business rollback')
    }),
    /forced business rollback/,
  )
  assert.equal(rolledBack.length, 1)
  assert.equal(failedAfterCommit, false)
})

test('business integrity parity: Bookings modify allows rule-priced vehicles & Maintenance blocks active bookings', () => {
  const bookingsSrc = readRepoFile('src/collections/Bookings.ts')
  assert.ok(
    !bookingsSrc.includes('!vehicle.pricePerDay ||'),
    'Customer modify must not reject vehicles priced via model/tier rules',
  )
  assert.ok(bookingsSrc.includes('preloadedVehicle: vehicle as unknown as Record<string, unknown>'))
  assert.ok(bookingsSrc.includes('runBestEffortSafe(req.payload, req'))

  const maintSrc = readRepoFile('src/collections/MaintenanceSchedules.ts')
  assert.ok(maintSrc.includes('beforeChange'))
  assert.ok(maintSrc.includes('endDate < startDate'))
  assert.ok(maintSrc.includes("'ONGOING'"))

  const reconcileSrc = readRepoFile(
    'src/app/(frontend)/nori-api/dashboard/payments/reconcile/route.ts',
  )
  assert.ok(reconcileSrc.includes('noriSystemPaymentSync: true'))
  assert.ok(reconcileSrc.includes('withAtomicResourceLock'))

  const deliveriesSrc = readRepoFile('src/app/(frontend)/nori-api/dashboard/deliveries/route.ts')
  assert.ok(deliveriesSrc.includes('noriSystemPaymentSync: true'))
  assert.ok(deliveriesSrc.includes('withAtomicResourceLock'))

  for (const routeRel of [
    'src/app/(frontend)/nori-api/health/route.ts',
    'src/app/(frontend)/nori-api/fleet/route.ts',
    'src/app/(frontend)/nori-api/locations/route.ts',
    'src/app/(frontend)/nori-api/auth/[action]/route.ts',
    'src/app/(frontend)/nori-api/bookings/route.ts',
    'src/app/(frontend)/nori-api/payments/create/route.ts',
    'src/app/(frontend)/nori-api/payments/cancel/route.ts',
    'src/app/(frontend)/nori-api/payments/mock-simulate/route.ts',
    'src/app/(frontend)/nori-api/payments/webhook/sepay/route.ts',
    'src/app/(frontend)/nori-api/dashboard/bookings/route.ts',
    'src/app/(frontend)/nori-api/dashboard/payments/route.ts',
    'src/app/(frontend)/nori-api/dashboard/payments/confirm/route.ts',
    'src/app/(frontend)/nori-api/dashboard/payments/refund/route.ts',
  ]) {
    assert.ok(
      readRepoFile(routeRel).includes('createRequestLogger'),
      `${routeRel} must emit structured logs & X-NORI-Request-Id`,
    )
  }
})

const livePgUrl = process.env.NORI_PG_PARITY_URL?.trim() || ''

if (/^postgres(ql)?:\/\//i.test(livePgUrl)) {
  test('live PostgreSQL parity: partial unique indexes, rollback safety, advisory locks & SAVEPOINT recovery', async () => {
    const pgMod = await import('pg')
    const pg = pgMod.default ?? pgMod
    const pool = new pg.Pool(createPostgresPoolConfig(livePgUrl))
    const tag = `parity_${crypto.randomUUID().slice(0, 8)}`
    const clientA = await pool.connect()

    let bookingId = null
    let brId = null
    let mdlId = null
    let vehId = null
    let usrId = null

    try {
      await clientA.query(`DELETE FROM branches WHERE code LIKE 'BR-parity_%'`)

      // 1. Verify all 3 parity unique indexes exist on live Postgres
      const idxRes = await clientA.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[]) ORDER BY indexname`,
        [
          [
            'bookings_customer_idempotency_uniq',
            'payments_booking_active_pending_uniq',
            'payments_env_provider_tx_uniq',
          ],
        ],
      )
      assert.deepEqual(
        idxRes.rows.map((r) => r.indexname),
        [
          'bookings_customer_idempotency_uniq',
          'payments_booking_active_pending_uniq',
          'payments_env_provider_tx_uniq',
        ],
      )

      // 2. Seed isolated branch, model, vehicle, user
      const br = (
        await clientA.query(
          `INSERT INTO branches (code, name, province, address, status) VALUES ($1, $2, 'TP. Hồ Chí Minh', 'Test', 'ACTIVE') RETURNING id`,
          [`BR-${tag}`, `Branch ${tag}`],
        )
      ).rows[0]
      brId = br.id
      const mdl = (
        await clientA.query(
          `INSERT INTO vehicle_models (name, slug, brand, category, seats) VALUES ($1, $2, 'VinFast', 'CAR', 4) RETURNING id`,
          [`Model ${tag}`, `mdl-${tag}`],
        )
      ).rows[0]
      mdlId = mdl.id
      const veh = (
        await clientA.query(
          `INSERT INTO vehicles (reference, license_plate, model_id, managing_branch_id, current_branch_id, intent, status, operation_status, price_per_day, deposit_amount) VALUES ($1, $2, $3, $4, $4, 'RENT', 'ACTIVE', 'READY', 800000, 1500000) RETURNING id`,
          [`VEH-${tag}`, `51A-${tag.slice(-5).toUpperCase()}`, mdl.id, br.id],
        )
      ).rows[0]
      vehId = veh.id
      const usr = (
        await clientA.query(
          `INSERT INTO users (email, full_name, role, status) VALUES ($1, 'Parity User', 'CUSTOMER', 'ACTIVE') RETURNING id`,
          [`${tag}@nori-parity.local`],
        )
      ).rows[0]
      usrId = usr.id

      // 3. Concurrent booking idempotency race against bookings_customer_idempotency_uniq
      const idemKey = `idem-${tag}`
      const raceBookingResults = await Promise.allSettled(
        Array.from({ length: 4 }, (_, idx) =>
          pool.query(
            `INSERT INTO bookings (booking_key, customer_id, vehicle_id, start_date, end_date, status, idempotency_key, total_price)
             VALUES ($1, $2, $3, '2026-12-20', '2026-12-21', 'PENDING', $4, 800000) RETURNING id`,
            [`BK-${tag}-${idx}`, usr.id, veh.id, idemKey],
          ),
        ),
      )
      const bkFulfilled = raceBookingResults.filter((r) => r.status === 'fulfilled')
      const bkRejected = raceBookingResults.filter((r) => r.status === 'rejected')
      assert.equal(
        bkFulfilled.length,
        1,
        'Exactly one booking should succeed under idempotency race',
      )
      assert.equal(bkRejected.length, 3)
      for (const rej of bkRejected) {
        assert.equal(rej.reason?.code, '23505')
      }
      bookingId = bkFulfilled[0].value.rows[0].id

      // 4. Concurrent PENDING payment creation against payments_booking_active_pending_uniq
      const racePayResults = await Promise.allSettled(
        Array.from({ length: 4 }, (_, idx) =>
          pool.query(
            `INSERT INTO payments (reference, booking_id, customer_id, payment_type, method, provider, environment, amount, status)
             VALUES ($1, $2, $3, 'DEPOSIT', 'VIETQR_SEPAY', 'MOCK', 'MOCK', 800000, 'PENDING') RETURNING id`,
            [`PAY-${tag}-${idx}`, bookingId, usr.id],
          ),
        ),
      )
      assert.equal(racePayResults.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(racePayResults.filter((r) => r.status === 'rejected').length, 3)

      // 5. Concurrent provider_transaction_id against payments_env_provider_tx_uniq
      const providerTx = `SEPAY-TX-${tag}`
      const raceTxResults = await Promise.allSettled(
        Array.from({ length: 4 }, (_, idx) =>
          pool.query(
            `INSERT INTO payments (reference, booking_id, customer_id, payment_type, method, provider, environment, amount, status, provider_transaction_id)
             VALUES ($1, $2, $3, 'DEPOSIT', 'VIETQR_SEPAY', 'SEPAY', 'SANDBOX', 800000, 'CONFIRMED', $4) RETURNING id`,
            [`PAYTX-${tag}-${idx}`, bookingId, usr.id, providerTx],
          ),
        ),
      )
      assert.equal(raceTxResults.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(raceTxResults.filter((r) => r.status === 'rejected').length, 3)

      // 6. Real Postgres pg_advisory_xact_lock cross-connection serialization
      const lockTimeline = []
      const lockKey = `parity-lock:${tag}`
      await Promise.all(
        ['c1', 'c2'].map(async (worker) => {
          const conn = await pool.connect()
          try {
            await conn.query('BEGIN')
            await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey])
            lockTimeline.push(`${worker}:enter`)
            await new Promise((r) => setTimeout(r, 35))
            lockTimeline.push(`${worker}:exit`)
            await conn.query('COMMIT')
          } finally {
            conn.release()
          }
        }),
      )
      assert.equal(lockTimeline.length, 4)
      assert.equal(lockTimeline[0].split(':')[0], lockTimeline[1].split(':')[0])
      assert.equal(lockTimeline[2].split(':')[0], lockTimeline[3].split(':')[0])

      // 7. Real Postgres SAVEPOINT recovery (23505 inside tx without triggering 25P02 on commit)
      await clientA.query('BEGIN')
      await clientA.query('SAVEPOINT sp_test_notif')
      await assert.rejects(
        clientA.query(
          `INSERT INTO bookings (booking_key, customer_id, vehicle_id, start_date, end_date, status, idempotency_key, total_price)
           VALUES ($1, $2, $3, '2026-12-20', '2026-12-21', 'PENDING', $4, 800000)`,
          [`BK-DUP-${tag}`, usr.id, veh.id, idemKey],
        ),
        (err) => err?.code === '23505',
      )
      await clientA.query('ROLLBACK TO SAVEPOINT sp_test_notif')
      await clientA.query('RELEASE SAVEPOINT sp_test_notif')
      const countCheck = await clientA.query(
        'SELECT count(*)::int AS cnt FROM bookings WHERE id = $1',
        [bookingId],
      )
      assert.equal(countCheck.rows[0].cnt, 1)
      await clientA.query('COMMIT')
    } finally {
      await clientA.query('ROLLBACK').catch(() => null)
      if (bookingId) {
        await clientA
          .query('DELETE FROM payments WHERE booking_id = $1', [bookingId])
          .catch(() => null)
        await clientA.query('DELETE FROM bookings WHERE id = $1', [bookingId]).catch(() => null)
      }
      if (usrId) await clientA.query('DELETE FROM users WHERE id = $1', [usrId]).catch(() => null)
      if (vehId)
        await clientA.query('DELETE FROM vehicles WHERE id = $1', [vehId]).catch(() => null)
      if (mdlId)
        await clientA.query('DELETE FROM vehicle_models WHERE id = $1', [mdlId]).catch(() => null)
      if (brId) await clientA.query('DELETE FROM branches WHERE id = $1', [brId]).catch(() => null)
      clientA.release()
      await pool.end()
    }
  })
} else {
  test('live PostgreSQL parity suite (skipped cleanly when NORI_PG_PARITY_URL is unset)', (t) => {
    t.skip('Set NORI_PG_PARITY_URL to run live PostgreSQL constraint & concurrency tests')
  })
}
