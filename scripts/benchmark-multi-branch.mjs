import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { runDatabaseMigration } from '../src/lib/data-sync.ts'
import {
  computeBranchFleetStats,
  evaluateVehicleLocationTimeline,
  resolveLocationPricing,
} from '../src/lib/multi-branch-rules.ts'

/**
 * Isolated Multi-Branch Performance & Scalability Benchmark (Section XVII)
 * NEVER touches live ./nori.db — runs strictly on temporary SQLite clones in os.tmpdir().
 * Measures real latency (median & max over 7 iterations), EXPLAIN QUERY PLAN, memory, and write lock throughput.
 */

const SCALES = [
  { name: 'Small (10 CN / 100 Xe / 10k Đơn)', branches: 10, vehicles: 100, bookings: 10_000 },
  { name: 'Medium (50 CN / 1k Xe / 50k Đơn)', branches: 50, vehicles: 1_000, bookings: 50_000 },
  {
    name: 'Large (100 CN / 10k Xe / 100k Đơn)',
    branches: 100,
    vehicles: 10_000,
    bookings: 100_000,
  },
]

function measureMs(fn, iterations = 7) {
  const times = []
  let lastResult
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now()
    lastResult = fn()
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const max = times[times.length - 1]
  return {
    medianMs: Number(median.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
    lastResult,
  }
}

async function runBenchmark() {
  const liveDb = path.resolve('nori.db')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-mb-bench-'))
  const results = []

  try {
    for (const scale of SCALES) {
      const dbPath = path.join(tmpDir, `bench-${scale.branches}-${scale.vehicles}.db`)
      fs.copyFileSync(liveDb, dbPath)
      runDatabaseMigration({ dbPath, rootDir: process.cwd() })

      const db = new DatabaseSync(dbPath)
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA synchronous = NORMAL')

      const baseModelId = db.prepare('SELECT id FROM vehicle_models LIMIT 1').get().id
      const baseCustomerId = db.prepare('SELECT id FROM users LIMIT 1').get().id
      const now = new Date().toISOString()

      const seedT0 = performance.now()
      db.exec('BEGIN')
      const insBranch = db.prepare(
        `INSERT INTO branches (id, code, name, slug, address, province, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      const insWh = db.prepare(
        `INSERT INTO warehouses (id, code, name, branch_id, warehouse_type, address, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'SHOWROOM', ?, 200, 'ACTIVE', ?, ?)`,
      )
      const insVeh = db.prepare(
        `INSERT INTO vehicles (id, reference, license_plate, model_id, intent, price_per_day, managing_branch_id, current_branch_id, current_warehouse_id, allocation_status, operation_status, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'RENT', ?, ?, ?, ?, 'ALLOCATED', 'READY', 'ACTIVE', ?, ?)`,
      )
      const insBooking = db.prepare(
        `INSERT INTO bookings (id, booking_key, customer_id, vehicle_id, pickup_branch_id, return_branch_id, revenue_attribution_branch_id, start_date, end_date, total_days, total_price, status, is_one_way, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 1800000, ?, ?, ?, ?)`,
      )
      const insRule = db.prepare(
        `INSERT INTO location_pricing_rules (id, code, name, scope_type, branch_id, vehicle_model_id, daily_price, priority, active, created_at, updated_at) VALUES (?, ?, ?, 'MODEL_BRANCH', ?, ?, ?, 100, 1, ?, ?)`,
      )

      const branchIds = []
      const whIds = []
      for (let b = 0; b < scale.branches; b += 1) {
        const bId = `br-${b}`
        const wId = `wh-${b}`
        branchIds.push(bId)
        whIds.push(wId)
        insBranch.run(
          bId,
          `B-${b}`,
          `Branch ${b}`,
          `b-${b}`,
          `Addr ${b}`,
          `City ${b % 10}`,
          now,
          now,
        )
        insWh.run(wId, `W-${b}`, `Warehouse ${b}`, bId, `Addr ${b}`, now, now)
        insRule.run(
          `pr-${b}`,
          `PR-${b}`,
          `Rule ${b}`,
          bId,
          baseModelId,
          900_000 + b * 5_000,
          now,
          now,
        )
      }

      const vehicleIds = []
      for (let v = 0; v < scale.vehicles; v += 1) {
        const vId = `veh-${v}`
        const bIdx = v % scale.branches
        vehicleIds.push(vId)
        insVeh.run(
          vId,
          `NR-B-${v}`,
          `51A-${String(v).padStart(5, '0')}`,
          baseModelId,
          850_000,
          branchIds[bIdx],
          branchIds[bIdx],
          whIds[bIdx],
          now,
          now,
        )
      }

      const statuses = ['COMPLETED', 'CONFIRMED', 'PENDING', 'CANCELLED']
      for (let k = 0; k < scale.bookings; k += 1) {
        const vIdx = k % scale.vehicles
        const bIdx = vIdx % scale.branches
        const retIdx = k % 5 === 0 ? (bIdx + 1) % scale.branches : bIdx
        const dayOffset = (k % 25) + 1
        const startD = `2026-12-${String(dayOffset).padStart(2, '0')}`
        const endD = `2026-12-${String(Math.min(28, dayOffset + 2)).padStart(2, '0')}`
        insBooking.run(
          `bk-${k}`,
          `BK-BENCH-${k}`,
          baseCustomerId,
          vehicleIds[vIdx],
          branchIds[bIdx],
          branchIds[retIdx],
          branchIds[bIdx],
          startD,
          endD,
          statuses[k % statuses.length],
          retIdx !== bIdx ? 1 : 0,
          now,
          now,
        )
      }
      db.exec('COMMIT')
      const seedMs = Number((performance.now() - seedT0).toFixed(1))

      // Query 1: Branch-filtered vehicle lookup (uses vehicles_current_branch_status_idx)
      const qBranchVehPlan = db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id, reference, operation_status FROM vehicles WHERE current_branch_id = ? AND status = 'ACTIVE'`,
        )
        .all(branchIds[0])
        .map((r) => r.detail)
      const qBranchVeh = measureMs(() =>
        db
          .prepare(
            `SELECT id, reference, operation_status FROM vehicles WHERE current_branch_id = ? AND status = 'ACTIVE' LIMIT 50`,
          )
          .all(branchIds[0]),
      )

      // Query 2: Multi-branch availability check for a single vehicle
      const targetVeh = vehicleIds[0]
      const qAvailPlan = db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id, start_date, end_date, status, pickup_branch_id, return_branch_id FROM bookings WHERE vehicle_id = ? AND status IN ('PENDING','DEPOSIT_PENDING','CONFIRMED','READY_FOR_HANDOVER','ONGOING','INSPECTING')`,
        )
        .all(targetVeh)
        .map((r) => r.detail)
      const qAvail = measureMs(() => {
        const bks = db
          .prepare(
            `SELECT id, start_date as startDate, end_date as endDate, status, pickup_branch_id as pickupBranchId, return_branch_id as returnBranchId FROM bookings WHERE vehicle_id = ? AND status IN ('PENDING','DEPOSIT_PENDING','CONFIRMED','READY_FOR_HANDOVER','ONGOING','INSPECTING')`,
          )
          .all(targetVeh)
        return evaluateVehicleLocationTimeline({
          vehicleOperationStatus: 'READY',
          vehicleBusinessStatus: 'ACTIVE',
          currentBranchId: branchIds[0],
          managingBranchId: branchIds[0],
          startDate: '2027-01-10',
          endDate: '2027-01-12',
          requestedPickupBranchId: branchIds[0],
          requestedReturnBranchId: branchIds[0],
          pickupBranchStatus: 'ACTIVE',
          returnBranchStatus: 'ACTIVE',
          bookings: bks,
          transfers: [],
          maintenances: [],
          today: '2026-11-20',
        })
      })

      // Query 3: Branch revenue & booking report aggregation (uses bookings_pickup_branch_status_idx)
      const qReportPlan = db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT status, COUNT(*) as cnt, SUM(total_price) as total FROM bookings WHERE pickup_branch_id = ? GROUP BY status`,
        )
        .all(branchIds[0])
        .map((r) => r.detail)
      const qReport = measureMs(() =>
        db
          .prepare(
            `SELECT status, COUNT(*) as cnt, SUM(total_price) as total FROM bookings WHERE pickup_branch_id = ? GROUP BY status`,
          )
          .all(branchIds[0]),
      )

      // Query 4: Pricing rule resolution across all active rules
      const allRules = db
        .prepare(
          `SELECT id, code, name, scope_type as scopeType, branch_id as branchId, vehicle_model_id as vehicleModelId, vehicle_id as vehicleId, daily_price as dailyPrice, priority, active FROM location_pricing_rules WHERE active = 1`,
        )
        .all()
      const qPricing = measureMs(() =>
        resolveLocationPricing({
          vehicleId: targetVeh,
          vehicleModelId: baseModelId,
          pickupBranchId: branchIds[0],
          referenceDate: '2026-12-15',
          vehicleBase: { pricePerDay: 850_000 },
          rules: allRules,
        }),
      )

      // Query 5: Fleet stats calculation across branch vehicles
      const branchVehicles = db
        .prepare(
          `SELECT id, managing_branch_id as managingBranchId, current_branch_id as currentBranchId, current_warehouse_id as currentWarehouseId, operation_status as operationStatus, status FROM vehicles WHERE managing_branch_id = ? OR current_branch_id = ?`,
        )
        .all(branchIds[0], branchIds[0])
      const qFleetStats = measureMs(() => computeBranchFleetStats(branchVehicles, branchIds[0]))

      // Query 6: Write throughput — 50 sequential transactional rental_days inserts (SQLite single-writer contention baseline)
      const writeT0 = performance.now()
      const insLock = db.prepare(
        `INSERT INTO rental_days (id, key, vehicle_id, day, booking_key, lock_type, branch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'BOOKING', ?, ?, ?)`,
      )
      for (let w = 0; w < 50; w += 1) {
        db.exec('BEGIN IMMEDIATE')
        insLock.run(
          crypto.randomUUID(),
          `${vehicleIds[w % vehicleIds.length]}:2027-02-${String((w % 28) + 1).padStart(2, '0')}`,
          vehicleIds[w % vehicleIds.length],
          `2027-02-${String((w % 28) + 1).padStart(2, '0')}`,
          `LOCK-${w}`,
          branchIds[0],
          now,
          now,
        )
        db.exec('COMMIT')
      }
      const write50Ms = Number((performance.now() - writeT0).toFixed(2))
      const dbSizeMb = Number((fs.statSync(dbPath).size / (1024 * 1024)).toFixed(2))
      const rssMb = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1))

      db.close()

      results.push({
        scale: scale.name,
        dbSizeMb,
        rssMb,
        seedMs,
        branchVehicleLookup: {
          medianMs: qBranchVeh.medianMs,
          maxMs: qBranchVeh.maxMs,
          plan: qBranchVehPlan.join(' | '),
        },
        availabilityTimeline: {
          medianMs: qAvail.medianMs,
          maxMs: qAvail.maxMs,
          plan: qAvailPlan.join(' | '),
        },
        branchReportAgg: {
          medianMs: qReport.medianMs,
          maxMs: qReport.maxMs,
          plan: qReportPlan.join(' | '),
        },
        pricingResolution: { medianMs: qPricing.medianMs, maxMs: qPricing.maxMs },
        fleetStatsCalc: { medianMs: qFleetStats.medianMs, maxMs: qFleetStats.maxMs },
        write50TxMs: write50Ms,
        writeTxPerSec: Math.round((50 / write50Ms) * 1000),
      })
    }

    console.log(JSON.stringify({ benchmarkedAt: new Date().toISOString(), results }, null, 2))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

runBenchmark().catch((err) => {
  console.error(err)
  process.exit(1)
})
