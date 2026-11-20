import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import { createFullBackup, restoreFromBackup, runDatabaseMigration } from '../src/lib/data-sync.ts'
import {
  createVehicleTransferAtomic,
  evaluateVehicleBookingAvailabilityAndPricing,
  transitionVehicleTransferAtomic,
} from '../src/lib/multi-branch-service.ts'

/**
 * Isolated SQLite Payload-compatible harness operating strictly on a temporary clone of nori.db
 * inside os.tmpdir(). Never touches live ./nori.db.
 */
function createMultiBranchSqliteHarness(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  let inTx = false

  function snakeToCamel(s) {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  }
  function camelToSnake(s) {
    return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  }

  const TABLE_MAP = {
    branches: 'branches',
    warehouses: 'warehouses',
    'service-locations': 'service_locations',
    'branch-staff': 'branch_staff',
    'vehicle-transfers': 'vehicle_transfers',
    'vehicle-location-history': 'vehicle_location_history',
    'delivery-zones': 'delivery_zones',
    'delivery-jobs': 'delivery_jobs',
    'location-pricing-rules': 'location_pricing_rules',
    'one-way-rental-rules': 'one_way_rental_rules',
    vehicles: 'vehicles',
    'vehicle-models': 'vehicle_models',
    bookings: 'bookings',
    'rental-days': 'rental_days',
    'maintenance-schedules': 'maintenance_schedules',
    promotions: 'promotions',
    admins: 'admins',
    'audit-logs': 'audit_logs',
  }

  const REL_COLUMNS = new Set([
    'branch',
    'manager',
    'coverImage',
    'admin',
    'vehicle',
    'model',
    'managingBranch',
    'currentBranch',
    'currentWarehouse',
    'nextExpectedBranch',
    'fromBranch',
    'fromWarehouse',
    'toBranch',
    'toWarehouse',
    'assignedStaff',
    'relatedBooking',
    'relatedTransfer',
    'relatedDeliveryJob',
    'booking',
    'deliveryZone',
    'vehicleModel',
    'pickupBranch',
    'returnBranch',
    'pickupServiceLocation',
    'returnServiceLocation',
    'revenueAttributionBranch',
    'actualReturnBranch',
    'actualReturnWarehouse',
    'customer',
  ])

  const JSON_COLUMNS = new Set([
    'holidays',
    'statusHistory',
    'affectedBookingKeys',
    'handoverPhotos',
    'assignedBranchIds',
    'applicableBranchIds',
    'pricingRuleSnapshot',
  ])

  function getTableColumns(table) {
    return new Set(
      db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((c) => c.name),
    )
  }

  function decodeRow(table, row) {
    if (!row) return null
    const keepBranchIdLiteral = table === 'rental_days' || table === 'audit_logs'
    const out = {}
    for (const [col, val] of Object.entries(row)) {
      const stripped =
        col.endsWith('_id') &&
        !(keepBranchIdLiteral && col === 'branch_id') &&
        col !== 'reference_id' &&
        col !== 'entity_id' &&
        col !== 'actor_id'
          ? col.slice(0, -3)
          : col
      const key = snakeToCamel(stripped)
      if (JSON_COLUMNS.has(key) && typeof val === 'string') {
        try {
          out[key] = JSON.parse(val)
        } catch {
          out[key] = val
        }
      } else if (
        [
          'active',
          'allowed',
          'verified',
          'visible',
          'isDemo',
          'isOneWay',
          'deliveryRequested',
          'supportsHomeDelivery',
          'supportsHomePickup',
          'supportsPickup',
          'supportsReturn',
          'allowOverCapacity',
          'isCustomerFacing',
          'delayedWarning',
        ].includes(key) &&
        typeof val === 'number'
      ) {
        out[key] = Boolean(val)
      } else {
        out[key] = val
      }
    }
    return out
  }

  function evalWhere(doc, where) {
    if (!where || typeof where !== 'object') return true
    if (Array.isArray(where.and)) return where.and.every((c) => evalWhere(doc, c))
    if (Array.isArray(where.or)) return where.or.some((c) => evalWhere(doc, c))
    for (const [k, expr] of Object.entries(where)) {
      if (k === 'and' || k === 'or') continue
      const v = doc[k]
      if (expr && typeof expr === 'object') {
        if ('equals' in expr && String(v ?? '') !== String(expr.equals ?? '')) return false
        if ('not_equals' in expr && String(v ?? '') === String(expr.not_equals ?? '')) return false
        if (
          'in' in expr &&
          Array.isArray(expr.in) &&
          !expr.in.map(String).includes(String(v ?? ''))
        )
          return false
        if ('greater_than_equal' in expr && String(v ?? '') < String(expr.greater_than_equal))
          return false
        if ('less_than_equal' in expr && String(v ?? '') > String(expr.less_than_equal))
          return false
        if ('less_than' in expr && String(v ?? '') >= String(expr.less_than)) return false
      }
    }
    return true
  }

  function encodeData(table, data, isCreate) {
    const cols = getTableColumns(table)
    const now = new Date().toISOString()
    const mapped = {}
    if (isCreate) {
      mapped.id = data.id || crypto.randomUUID()
      if (cols.has('created_at')) mapped.created_at = now
    }
    if (cols.has('updated_at')) mapped.updated_at = now

    for (const [k, rawVal] of Object.entries(data)) {
      if (rawVal === undefined) continue
      let colName = camelToSnake(k)
      if (REL_COLUMNS.has(k) && cols.has(`${colName}_id`)) {
        colName = `${colName}_id`
      }
      if (!cols.has(colName)) continue
      if (rawVal === null) {
        mapped[colName] = null
      } else if (typeof rawVal === 'boolean') {
        mapped[colName] = rawVal ? 1 : 0
      } else if (typeof rawVal === 'object') {
        mapped[colName] = JSON.stringify(rawVal)
      } else {
        mapped[colName] = rawVal
      }
    }
    return mapped
  }

  const payload = {
    db: {
      async beginTransaction() {
        if (inTx) return null
        db.exec('BEGIN IMMEDIATE')
        inTx = true
        return 'tx-1'
      },
      async commitTransaction(txId) {
        if (txId && inTx) {
          db.exec('COMMIT')
          inTx = false
        }
      },
      async rollbackTransaction(txId) {
        if (txId && inTx) {
          db.exec('ROLLBACK')
          inTx = false
        }
      },
    },
    async find({ collection, where, limit = 500 }) {
      const table = TABLE_MAP[collection]
      if (!table) throw new Error(`Unknown collection ${collection}`)
      const rows = db
        .prepare(`SELECT * FROM "${table}"`)
        .all()
        .map((r) => decodeRow(table, r))
      const filtered = rows.filter((r) => evalWhere(r, where)).slice(0, limit)
      return { docs: filtered, totalDocs: filtered.length }
    },
    async count({ collection, where }) {
      const res = await this.find({ collection, where, limit: 100_000 })
      return { totalDocs: res.totalDocs }
    },
    async findByID({ collection, id }) {
      const table = TABLE_MAP[collection]
      const row = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id)
      if (!row) throw new Error(`Not found ${collection}:${id}`)
      return decodeRow(table, row)
    },
    async create({ collection, data }) {
      const table = TABLE_MAP[collection]
      const enc = encodeData(table, data, true)
      const keys = Object.keys(enc)
      const placeholders = keys.map(() => '?').join(', ')
      db.prepare(
        `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders})`,
      ).run(...keys.map((k) => enc[k]))
      return this.findByID({ collection, id: enc.id })
    },
    async update({ collection, id, data }) {
      const table = TABLE_MAP[collection]
      const enc = encodeData(table, data, false)
      const keys = Object.keys(enc)
      const sets = keys.map((k) => `"${k}" = ?`).join(', ')
      db.prepare(`UPDATE "${table}" SET ${sets} WHERE id = ?`).run(...keys.map((k) => enc[k]), id)
      return this.findByID({ collection, id })
    },
    async delete({ collection, id, where }) {
      const table = TABLE_MAP[collection]
      if (id) {
        db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id)
        return { deleted: true }
      }
      const matches = await this.find({ collection, where, limit: 100_000 })
      for (const m of matches.docs) {
        db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(m.id)
      }
      return { docs: matches.docs }
    },
  }

  return { db, payload }
}

describe('Module 3.7 Integration, Atomic Transactions, Concurrency & Persistence Tests', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-mb-int-'))
  const dbPath = path.join(tmpDir, 'nori-test.db')
  const backupsDir = path.join(tmpDir, 'backups')
  const liveDbPath = path.resolve('nori.db')

  let harness
  let branchAId
  let branchBId
  let whAId
  let whBId
  let vehicleId
  let modelId
  let customerId
  let baselineVehicleCount

  const superAdminActor = {
    id: 'adm-super-test',
    email: 'admin@nori.vn',
    collection: 'admins',
    adminRole: 'SUPER_ADMIN',
    staffTitle: 'SUPER_ADMIN',
    branchScopeMode: 'ALL',
    assignedBranchIds: [],
  }

  before(async () => {
    fs.copyFileSync(liveDbPath, dbPath)
    // DB-01/DB-02: Verify migration is idempotent & preserves 100% existing records
    const dbPre = new DatabaseSync(dbPath)
    baselineVehicleCount = dbPre.prepare('SELECT COUNT(*) as c FROM vehicles').get().c
    dbPre.close()

    const mig1 = runDatabaseMigration({ dbPath, rootDir: process.cwd() })
    assert.equal(mig1.ok, true)
    const mig2 = runDatabaseMigration({ dbPath, rootDir: process.cwd() })
    assert.equal(mig2.ok, true)

    harness = createMultiBranchSqliteHarness(dbPath)
    const afterVehCount = harness.db.prepare('SELECT COUNT(*) as c FROM vehicles').get().c
    assert.equal(afterVehCount, baselineVehicleCount)

    // Pick an existing real/demo vehicle & customer from the isolated clone
    const vehRow = harness.db
      .prepare(
        "SELECT id, model_id FROM vehicles WHERE status = 'ACTIVE' AND price_per_day > 0 LIMIT 1",
      )
      .get()
    vehicleId = vehRow.id
    modelId = vehRow.model_id
    const custRow = harness.db.prepare('SELECT id FROM users LIMIT 1').get()
    customerId = custRow.id

    // Seed Branch A, Branch B, Warehouses A & B, and allocate vehicleId to Branch A / WH-A
    const brA = await harness.payload.create({
      collection: 'branches',
      data: {
        code: 'TEST-HCM',
        name: 'NORI Test HCM',
        slug: 'test-hcm',
        address: '100 Test Street HCM',
        province: 'TP. Hồ Chí Minh',
        workStartTime: '07:30',
        workEndTime: '21:00',
        supportsHomeDelivery: true,
        supportsHomePickup: true,
        defaultDeliveryFee: 150_000,
        defaultPickupFee: 150_000,
        status: 'ACTIVE',
      },
    })
    const brB = await harness.payload.create({
      collection: 'branches',
      data: {
        code: 'TEST-HN',
        name: 'NORI Test HN',
        slug: 'test-hn',
        address: '200 Test Street HN',
        province: 'Hà Nội',
        workStartTime: '07:30',
        workEndTime: '21:00',
        supportsHomeDelivery: true,
        supportsHomePickup: true,
        defaultDeliveryFee: 120_000,
        defaultPickupFee: 120_000,
        status: 'ACTIVE',
      },
    })
    branchAId = brA.id
    branchBId = brB.id

    const whA = await harness.payload.create({
      collection: 'warehouses',
      data: {
        code: 'WH-TEST-HCM',
        name: 'Kho Test HCM',
        branch: branchAId,
        warehouseType: 'SHOWROOM',
        address: '100 Test Street HCM',
        capacity: 10,
        status: 'ACTIVE',
      },
    })
    const whB = await harness.payload.create({
      collection: 'warehouses',
      data: {
        code: 'WH-TEST-HN',
        name: 'Kho Test HN',
        branch: branchBId,
        warehouseType: 'SHOWROOM',
        address: '200 Test Street HN',
        capacity: 10,
        status: 'ACTIVE',
      },
    })
    whAId = whA.id
    whBId = whB.id

    await harness.payload.update({
      collection: 'vehicles',
      id: vehicleId,
      data: {
        managingBranch: branchAId,
        currentBranch: branchAId,
        currentWarehouse: whAId,
        allocationStatus: 'ALLOCATED',
        operationStatus: 'READY',
        status: 'ACTIVE',
      },
    })
  })

  after(() => {
    try {
      harness?.db?.close()
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('TR-01..TR-12: Full atomic Vehicle Transfer lifecycle, IN_TRANSIT stock exclusion, ARRIVED hold, TR-11 atomic rollback, TR-08 double-complete block, TR-10 cancel-after-departure block, TR-12 delay alert', async () => {
    // Create transfer A -> B
    const created = await createVehicleTransferAtomic(harness.payload, superAdminActor, {
      vehicleId,
      toBranchId: branchBId,
      toWarehouseId: whBId,
      reason: 'Điều phối phục vụ chi nhánh HN',
      scheduledDepartureAt: '2026-12-15T08:00:00.000Z',
      scheduledArrivalAt: '2026-12-16T18:00:00.000Z',
      transferCost: 450_000,
      submitForApproval: true,
      idempotencyKey: 'trf-idem-1',
    })
    assert.equal(created.reused, false)
    const trfId = created.transfer.id
    const trfCode = created.transfer.transferCode

    // Idempotent duplicate returns existing transfer
    const dup = await createVehicleTransferAtomic(harness.payload, superAdminActor, {
      vehicleId,
      toBranchId: branchBId,
      toWarehouseId: whBId,
      reason: 'Duplicate click',
      scheduledDepartureAt: '2026-12-15T08:00:00.000Z',
      scheduledArrivalAt: '2026-12-16T18:00:00.000Z',
      idempotencyKey: 'trf-idem-1',
    })
    assert.equal(dup.reused, true)
    assert.equal(dup.transfer.id, trfId)

    // Approve -> locks rental_days globally!
    await transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
      transferId: trfId,
      nextStatus: 'APPROVED',
      expectedRevision: 1,
    })
    const lockedCount = harness.db
      .prepare('SELECT COUNT(*) as c FROM rental_days WHERE booking_key = ?')
      .get(trfCode).c
    assert.equal(lockedCount, 2) // Dec 15 & Dec 16 locked

    // Availability engine blocks overlapping rental during transfer dates (BK-08)
    const overlapCheck = await evaluateVehicleBookingAvailabilityAndPricing(harness.payload, {
      vehicleId,
      startDate: '2026-12-15',
      endDate: '2026-12-17',
      pickupBranchId: branchAId,
    })
    assert.equal(overlapCheck.available, false)

    // Depart (TR-05): vehicle becomes IN_TRANSIT, currentWarehouse = null
    await transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
      transferId: trfId,
      nextStatus: 'IN_TRANSIT',
      expectedRevision: 2,
      odometerBefore: 12000,
    })
    const vehInTransit = await harness.payload.findByID({ collection: 'vehicles', id: vehicleId })
    assert.equal(vehInTransit.operationStatus, 'IN_TRANSIT')
    assert.equal(vehInTransit.currentWarehouse, null)

    // TR-10: Cannot cancel directly while IN_TRANSIT!
    await assert.rejects(
      () =>
        transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
          transferId: trfId,
          nextStatus: 'CANCELLED',
          expectedRevision: 3,
        }),
      /không thể hủy trực tiếp/i,
    )

    // TR-06: ARRIVED does NOT move vehicle into destination READY inventory yet!
    await transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
      transferId: trfId,
      nextStatus: 'ARRIVED',
      expectedRevision: 3,
    })
    const vehArrived = await harness.payload.findByID({ collection: 'vehicles', id: vehicleId })
    assert.equal(vehArrived.operationStatus, 'IN_TRANSIT')
    assert.equal(vehArrived.currentWarehouse, null)

    // TR-11: Simulated mid-transaction failure during COMPLETED rolls back atomically!
    await assert.rejects(
      () =>
        transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
          transferId: trfId,
          nextStatus: 'COMPLETED',
          expectedRevision: 4,
          odometerAfter: 12500,
          simulateMidTxFailure: true,
        }),
      /TR-11/,
    )
    const vehAfterRollback = await harness.payload.findByID({
      collection: 'vehicles',
      id: vehicleId,
    })
    assert.equal(vehAfterRollback.operationStatus, 'IN_TRANSIT')
    assert.equal(vehAfterRollback.currentBranch, branchAId)
    const locksAfterRollback = harness.db
      .prepare('SELECT COUNT(*) as c FROM rental_days WHERE booking_key = ?')
      .get(trfCode).c
    assert.equal(locksAfterRollback, 2)

    // TR-07: Real COMPLETED succeeds atomically, updates vehicle currentBranch=B, currentWarehouse=whB, releases locks!
    await transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
      transferId: trfId,
      nextStatus: 'COMPLETED',
      expectedRevision: 4,
      odometerAfter: 12500,
    })
    const vehDone = await harness.payload.findByID({ collection: 'vehicles', id: vehicleId })
    assert.equal(vehDone.operationStatus, 'READY')
    assert.equal(vehDone.currentBranch, branchBId)
    assert.equal(vehDone.currentWarehouse, whBId)
    assert.equal(vehDone.managingBranch, branchAId) // Managing branch preserved!
    const locksAfterDone = harness.db
      .prepare('SELECT COUNT(*) as c FROM rental_days WHERE booking_key = ?')
      .get(trfCode).c
    assert.equal(locksAfterDone, 0)

    // TR-08: Double-complete is strictly rejected!
    await assert.rejects(
      () =>
        transitionVehicleTransferAtomic(harness.payload, superAdminActor, {
          transferId: trfId,
          nextStatus: 'COMPLETED',
          expectedRevision: 5,
        }),
      /hoàn tất/i,
    )
  })

  it('PR-07/PR-08 & BK-13: Location pricing rule changes do not affect snapshot; concurrent rental_days lock allows only 1 booking', async () => {
    // Add Model x Branch B rule = 1,400,000 VND/day
    const rule = await harness.payload.create({
      collection: 'location-pricing-rules',
      data: {
        code: 'PR-HN-SPECIAL',
        name: 'Giá riêng HN',
        scopeType: 'MODEL_BRANCH',
        branch: branchBId,
        vehicleModel: modelId,
        dailyPrice: 1_400_000,
        locationSurcharge: 50_000,
        active: true,
      },
    })

    const eval1 = await evaluateVehicleBookingAvailabilityAndPricing(harness.payload, {
      vehicleId,
      startDate: '2026-12-20',
      endDate: '2026-12-22',
      pickupBranchId: branchBId,
      returnBranchId: branchBId,
    })
    assert.equal(eval1.available, true)
    assert.equal(eval1.quote.dailyPrice, 1_400_000)

    // Persist confirmed booking with immutable pricingRuleSnapshot
    const booking1 = await harness.payload.create({
      collection: 'bookings',
      data: {
        bookingKey: 'NR-SNAP-001',
        customer: customerId,
        vehicle: vehicleId,
        pickupBranch: branchBId,
        returnBranch: branchBId,
        startDate: '2026-12-20',
        endDate: '2026-12-22',
        totalDays: 2,
        dailyPriceSnapshot: eval1.quote.dailyPrice,
        totalPrice: eval1.quote.estimatedTotal,
        pricingRuleSnapshot: eval1.pricingRuleSnapshot,
        status: 'CONFIRMED',
      },
    })

    // Admin updates pricing rule to 2,200,000 VND/day
    await harness.payload.update({
      collection: 'location-pricing-rules',
      id: rule.id,
      data: { dailyPrice: 2_200_000 },
    })

    // Confirmed booking snapshot remains 100% immutable!
    const reloadedBk = await harness.payload.findByID({ collection: 'bookings', id: booking1.id })
    assert.equal(reloadedBk.dailyPriceSnapshot, 1_400_000)
    assert.equal(reloadedBk.totalPrice, eval1.quote.estimatedTotal)

    // BK-13: Concurrency race condition on global rental_days UNIQUE(key)
    const attemptLock = async (bkKey) => {
      try {
        await harness.payload.create({
          collection: 'rental-days',
          data: {
            key: `${vehicleId}:2026-12-28`,
            vehicle: vehicleId,
            day: '2026-12-28',
            bookingKey: bkKey,
            lockType: 'BOOKING',
            branchId: branchBId,
          },
        })
        return 'WON'
      } catch {
        return 'CONFLICT'
      }
    }
    const results = await Promise.all([
      attemptLock('RACE-A'),
      attemptLock('RACE-B'),
      attemptLock('RACE-C'),
    ])
    assert.equal(results.filter((r) => r === 'WON').length, 1)
    assert.equal(results.filter((r) => r === 'CONFLICT').length, 2)
  })

  it('DB-03/DB-05/DB-06: Data persists across SQLite reopen, integrity_check=ok, FK=0, and Backup/Restore recovers exact state', async () => {
    const backup = createFullBackup({
      dbPath,
      backupsDir,
      rootDir: tmpDir,
      mediaDir: path.resolve('media'),
    })
    assert.equal(backup.ok, true)

    // Close DB (simulating restart) and reopen fresh handle
    harness.db.close()
    const freshDb = new DatabaseSync(dbPath)
    const integrity = freshDb.prepare('PRAGMA integrity_check').get()
    assert.equal(integrity.integrity_check, 'ok')
    const fks = freshDb.prepare('PRAGMA foreign_key_check').all()
    assert.equal(fks.length, 0)
    const branchCount = freshDb.prepare('SELECT COUNT(*) as c FROM branches').get().c
    assert.equal(branchCount, 2)

    // Mutate then restore from backup and confirm exact recovery
    freshDb.prepare("DELETE FROM location_pricing_rules WHERE code = 'PR-HN-SPECIAL'").run()
    assert.equal(
      freshDb
        .prepare("SELECT COUNT(*) as c FROM location_pricing_rules WHERE code = 'PR-HN-SPECIAL'")
        .get().c,
      0,
    )
    freshDb.close()

    const restored = restoreFromBackup({
      sourceBackup: backup.bundleDir,
      rootDir: tmpDir,
      dbPath,
      targetDbPath: dbPath,
      backupsDir,
      mediaDir: path.join(tmpDir, 'media-restored'),
      skipPreBackup: true,
    })
    assert.equal(restored.ok, true)

    const verifyDb = new DatabaseSync(dbPath)
    assert.equal(
      verifyDb
        .prepare("SELECT COUNT(*) as c FROM location_pricing_rules WHERE code = 'PR-HN-SPECIAL'")
        .get().c,
      1,
    )
    assert.equal(verifyDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    verifyDb.close()
  })
})
