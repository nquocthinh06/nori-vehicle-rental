import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import {
  exportDevDatabase,
  importDevDatabase,
  prepareTestDatabaseBaseline,
  verifyDevDatabase,
} from '../src/lib/dev-sync.ts'

describe('NORI Dev Synchronization via GitHub & Multi-Machine Workflow (DEV-SYNC-01 .. DEV-SYNC-06)', () => {
  let tmpRoot = ''
  let machineADir = ''
  let machineBDir = ''
  let sharedRepoDir = ''
  let repoDevData = ''
  const projectRoot = process.cwd()

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-dev-sync-suite-'))
    machineADir = path.join(tmpRoot, 'machine-a')
    machineBDir = path.join(tmpRoot, 'machine-b')
    sharedRepoDir = path.join(tmpRoot, 'git-repo')
    repoDevData = path.join(sharedRepoDir, 'dev-data')

    for (const dir of [machineADir, machineBDir, sharedRepoDir, repoDevData]) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Prepare canonical dev-data in sharedRepoDir
    fs.mkdirSync(path.join(repoDevData, 'database'), { recursive: true })
    fs.mkdirSync(path.join(repoDevData, 'media'), { recursive: true })

    fs.copyFileSync(
      path.join(projectRoot, 'dev-data', 'database', 'nori-dev.db'),
      path.join(repoDevData, 'database', 'nori-dev.db'),
    )
    fs.copyFileSync(
      path.join(projectRoot, 'dev-data', 'manifest.json'),
      path.join(repoDevData, 'manifest.json'),
    )

    // Copy sample media files
    const projMediaDir = path.join(projectRoot, 'dev-data', 'media')
    if (fs.existsSync(projMediaDir)) {
      for (const f of fs.readdirSync(projMediaDir).slice(0, 10)) {
        fs.copyFileSync(path.join(projMediaDir, f), path.join(repoDevData, 'media', f))
      }
    }
  })

  after(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {}
  })

  // TEST 1: Clean Clone Simulation
  it('DEV-SYNC-01: Clean clone can import dev-data, initialize database and media without manual input', () => {
    const freshDbPath = path.join(machineBDir, 'nori.db')
    const freshMediaDir = path.join(machineBDir, 'media')

    assert.equal(fs.existsSync(freshDbPath), false, 'Initial fresh machine must have no DB')

    const importRes = importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: freshDbPath,
      mediaDir: freshMediaDir,
    })

    assert.equal(importRes.ok, true)
    assert.equal(importRes.status, 'SUCCESS')
    assert.ok(fs.existsSync(freshDbPath), 'Import must create local SQLite database')

    const db = new DatabaseSync(freshDbPath)
    const integrity = db.prepare('PRAGMA integrity_check').get()
    assert.equal(integrity.integrity_check, 'ok')

    const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
    const vehiclesCount = db.prepare('SELECT COUNT(*) as c FROM vehicles').get().c
    assert.ok(usersCount >= 1, 'Imported DB must have test users')
    assert.ok(vehiclesCount >= 1, 'Imported DB must have vehicles')
    db.close()
  })

  // TEST 2: Account Synchronization
  it('DEV-SYNC-02: Machine A creates test customer, exports -> Machine B imports and can verify credentials', () => {
    const dbA = path.join(machineADir, 'nori.db')
    const mediaA = path.join(machineADir, 'media')
    const dbB = path.join(machineBDir, 'nori.db')
    const mediaB = path.join(machineBDir, 'media')

    // Initialize machine A from snapshot
    importDevDatabase({
      rootDir: machineADir,
      devDataDir: repoDevData,
      dbPath: dbA,
      mediaDir: mediaA,
      force: true,
    })

    // Machine A registers a new customer
    const newUserId = crypto.randomUUID()
    const testEmail = 'sync-test-user@nori.vn'
    const now = new Date().toISOString()
    const testHash = 'pbkdf2:dummy-hashed-password-12345678'
    const testSalt = 'dummy-salt'

    const connA = new DatabaseSync(dbA)
    connA
      .prepare(
        `INSERT INTO users (id, email, hash, salt, full_name, role, status, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newUserId,
        testEmail,
        testHash,
        testSalt,
        'Nguyễn Văn Đồng Bộ',
        'CUSTOMER',
        'ACTIVE',
        now,
        now,
      )
    connA.close()

    // Machine A exports dev database to shared repo
    const exportRes = exportDevDatabase({
      rootDir: machineADir,
      devDataDir: repoDevData,
      dbPath: dbA,
      mediaDir: mediaA,
      force: true,
    })
    assert.equal(exportRes.ok, true)
    assert.ok(exportRes.counts.users >= 1)

    // Machine B imports updated snapshot
    const importRes = importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: dbB,
      mediaDir: mediaB,
      force: true,
    })
    assert.equal(importRes.ok, true)

    // Verify Machine B now has the customer with exact hash and credentials
    const connB = new DatabaseSync(dbB)
    const userRow = connB
      .prepare('SELECT id, email, hash, salt, full_name, role FROM users WHERE id = ?')
      .get(newUserId)
    assert.ok(userRow, 'New customer must exist on Machine B after sync')
    assert.equal(userRow.email, testEmail)
    assert.equal(userRow.hash, testHash)
    assert.equal(userRow.salt, testSalt)
    assert.equal(userRow.full_name, 'Nguyễn Văn Đồng Bộ')
    assert.equal(userRow.role, 'CUSTOMER')
    connB.close()
  })

  // TEST 3: Admin & Vehicle & Banner Synchronization
  it('DEV-SYNC-03: Machine A adds vehicle, updates model and banner -> Machine B receives all updates', () => {
    const dbA = path.join(machineADir, 'nori.db')
    const mediaA = path.join(machineADir, 'media')
    const dbB = path.join(machineBDir, 'nori.db')
    const mediaB = path.join(machineBDir, 'media')

    const newVehicleId = crypto.randomUUID()
    const now = new Date().toISOString()

    const connA = new DatabaseSync(dbA)
    const modelRow = connA.prepare('SELECT id FROM vehicle_models LIMIT 1').get()
    assert.ok(modelRow, 'Must have at least one vehicle model')

    connA
      .prepare(
        `INSERT INTO vehicles (id, model_id, reference, license_plate, status, price_per_day, deposit_amount, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newVehicleId,
        modelRow.id,
        'NORI-SYNC-TEST-99',
        '51G-888.88',
        'ACTIVE',
        1200000,
        10000000,
        now,
        now,
      )

    // Create a mock banner image file and DB record
    const mockBannerFilename = 'test-banner-sync.jpg'
    fs.writeFileSync(path.join(mediaA, mockBannerFilename), 'mock-image-bytes-nori-banner-123')
    const bannerMediaId = crypto.randomUUID()
    connA
      .prepare(
        `INSERT INTO media (id, alt, filename, mime_type, filesize, media_category, verified, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bannerMediaId,
        'Test Banner Sync',
        mockBannerFilename,
        'image/jpeg',
        31,
        'ILLUSTRATION',
        1,
        now,
        now,
      )

    connA.close()

    // Export from Machine A
    const exp = exportDevDatabase({
      rootDir: machineADir,
      devDataDir: repoDevData,
      dbPath: dbA,
      mediaDir: mediaA,
      force: true,
    })
    assert.equal(exp.ok, true)
    assert.ok(fs.existsSync(path.join(repoDevData, 'media', mockBannerFilename)))

    // Import on Machine B
    const imp = importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: dbB,
      mediaDir: mediaB,
      force: true,
    })
    assert.equal(imp.ok, true)

    // Verify vehicle and banner image exist on Machine B
    const connB = new DatabaseSync(dbB)
    const veh = connB
      .prepare('SELECT reference, price_per_day, license_plate FROM vehicles WHERE id = ?')
      .get(newVehicleId)
    assert.ok(veh, 'New vehicle must exist on Machine B')
    assert.equal(veh.reference, 'NORI-SYNC-TEST-99')
    assert.equal(veh.price_per_day, 1200000)

    const mediaRecord = connB.prepare('SELECT filename FROM media WHERE id = ?').get(bannerMediaId)
    assert.ok(mediaRecord, 'Media record must exist on Machine B')
    assert.ok(
      fs.existsSync(path.join(mediaB, mockBannerFilename)),
      'Physical media file must exist on Machine B',
    )
    connB.close()
  })

  // TEST 4: Rental Business Data & Relationship Integrity
  it('DEV-SYNC-04: Machine A creates rental booking and payment -> Machine B preserves full relationship integrity', () => {
    const dbA = path.join(machineADir, 'nori.db')
    const mediaA = path.join(machineADir, 'media')
    const dbB = path.join(machineBDir, 'nori.db')
    const mediaB = path.join(machineBDir, 'media')

    const connA = new DatabaseSync(dbA)
    const userRow = connA.prepare('SELECT id FROM users LIMIT 1').get()
    const vehRow = connA.prepare('SELECT id FROM vehicles LIMIT 1').get()
    const now = new Date().toISOString()

    const bookingId = crypto.randomUUID()
    const bookingKey = `NR-SYNC-${Date.now()}`
    connA
      .prepare(
        `INSERT INTO bookings (
          id, booking_key, customer_id, vehicle_id, start_date, end_date, total_days,
          daily_price_snapshot, total_price, deposit_snapshot,
          status, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bookingId,
        bookingKey,
        userRow.id,
        vehRow.id,
        '2026-12-01',
        '2026-12-05',
        4,
        1200000,
        4800000,
        5000000,
        'CONFIRMED',
        now,
        now,
      )

    const paymentId = crypto.randomUUID()
    connA
      .prepare(
        `INSERT INTO payments (
          id, booking_id, amount, expected_amount, received_amount, status,
          payment_type, provider, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(paymentId, bookingId, 4800000, 4800000, 4800000, 'SUCCESS', 'RENTAL', 'MOCK', now, now)

    connA.close()

    // Export and sync to Machine B
    exportDevDatabase({
      rootDir: machineADir,
      devDataDir: repoDevData,
      dbPath: dbA,
      mediaDir: mediaA,
      force: true,
    })
    importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: dbB,
      mediaDir: mediaB,
      force: true,
    })

    // Verify on Machine B with foreign key integrity
    const connB = new DatabaseSync(dbB)
    connB.exec('PRAGMA foreign_keys = ON;')
    const fks = connB.prepare('PRAGMA foreign_key_check').all()
    assert.equal(fks.length, 0, 'Foreign keys must have 0 violations')

    const bk = connB
      .prepare('SELECT id, customer_id, vehicle_id, status, total_price FROM bookings WHERE id = ?')
      .get(bookingId)
    assert.ok(bk)
    assert.equal(bk.customer_id, userRow.id)
    assert.equal(bk.vehicle_id, vehRow.id)
    assert.equal(bk.status, 'CONFIRMED')

    const pay = connB
      .prepare('SELECT id, booking_id, amount, status FROM payments WHERE id = ?')
      .get(paymentId)
    assert.ok(pay)
    assert.equal(pay.booking_id, bookingId)
    assert.equal(pay.amount, 4800000)
    connB.close()
  })

  // TEST 5: Conflict Detection & Safety Halt
  it('DEV-SYNC-05: Concurrent uncommitted modifications on Machine B trigger CONFLICT and block silent overwrite', () => {
    const dbA = path.join(machineADir, 'nori.db')
    const mediaA = path.join(machineADir, 'media')
    const dbB = path.join(machineBDir, 'nori.db')
    const mediaB = path.join(machineBDir, 'media')

    // Machine B modifies a record locally (making uncommitted changes)
    const connB = new DatabaseSync(dbB)
    const promoId = crypto.randomUUID()
    const now = new Date().toISOString()
    connB
      .prepare(
        `INSERT INTO promotions (id, code, name, discount_type, discount_value, active, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(promoId, 'CONCURRENT-B', 'Promo Machine B', 'PERCENT', 15, 1, now, now)
    connB.close()

    // Machine A modifies another record and exports a new snapshot to sharedRepoDir
    const connA = new DatabaseSync(dbA)
    const promoAId = crypto.randomUUID()
    connA
      .prepare(
        `INSERT INTO promotions (id, code, name, discount_type, discount_value, active, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(promoAId, 'CONCURRENT-A', 'Promo Machine A', 'PERCENT', 20, 1, now, now)
    connA.close()

    exportDevDatabase({
      rootDir: machineADir,
      devDataDir: repoDevData,
      dbPath: dbA,
      mediaDir: mediaA,
      force: true,
    })

    // Machine B attempts import with default onConflict='abort'
    const conflictResult = importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: dbB,
      mediaDir: mediaB,
      onConflict: 'abort',
    })

    assert.equal(conflictResult.ok, false, 'Import must fail when uncommitted local changes exist')
    assert.equal(conflictResult.status, 'CONFLICT')
    assert.ok(conflictResult.errors.length > 0)

    // Verify Machine B database was NOT overwritten: promo 'CONCURRENT-B' is still intact
    const verifyB = new DatabaseSync(dbB)
    const bPromo = verifyB.prepare('SELECT code FROM promotions WHERE id = ?').get(promoId)
    assert.ok(bPromo, 'Local uncommitted promotion must NOT be lost')
    assert.equal(bPromo.code, 'CONCURRENT-B')
    verifyB.close()

    // Now test with --force: should backup and proceed
    const forceResult = importDevDatabase({
      rootDir: machineBDir,
      devDataDir: repoDevData,
      dbPath: dbB,
      mediaDir: mediaB,
      force: true,
    })
    assert.equal(forceResult.ok, true, 'Import with force must succeed')
    assert.ok(forceResult.backupPath, 'Must create automated backup before force overwriting')
    assert.ok(fs.existsSync(forceResult.backupPath), 'Backup folder must exist on disk')
  })

  // TEST 6: Baseline Resolver Fallback
  it('DEV-SYNC-06: prepareTestDatabaseBaseline creates functional baseline even when nori.db is completely absent', () => {
    const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-baseline-test-'))
    const isolatedDbPath = path.join(isolatedDir, 'isolated-test.db')

    try {
      // Point to our sharedRepo snapshot
      const res = prepareTestDatabaseBaseline(isolatedDbPath, sharedRepoDir)
      assert.ok(res.vehiclesCount >= 1, 'Baseline must provide vehicles')
      assert.ok(res.usersCount >= 1, 'Baseline must provide users')
      assert.ok(fs.existsSync(isolatedDbPath), 'Target database must be created')

      const db = new DatabaseSync(isolatedDbPath)
      const integrity = db.prepare('PRAGMA integrity_check').get()
      assert.equal(integrity.integrity_check, 'ok')
      db.close()
    } finally {
      try {
        fs.rmSync(isolatedDir, { recursive: true, force: true })
      } catch {}
    }
  })
})
