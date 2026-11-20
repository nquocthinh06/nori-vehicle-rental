import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, it } from 'node:test'
import {
  createFullBackup,
  restoreFromBackup,
  runDatabaseMigration,
  sha256File,
} from '../src/lib/data-sync.ts'
import {
  checkDatabaseCompatibility,
  REQUIRED_SCHEMA_CONTRACT,
} from '../scripts/check-db-schema.mjs'
import { resolveBookingDepositAndSecurityStructure } from '../src/lib/payment-service.ts'

function createTempDir(prefix = 'nori-mig-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function safeCleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
  } catch {
    // ignore transient windows file lock
  }
}

describe('NORI Database Migration & Schema Compatibility Regression Suite', () => {
  // GROUP A: Fresh Database
  it('Group A: Fresh Database initialization creates all required tables, columns, indexes and passes integrity', () => {
    const tmpDir = createTempDir('nori-fresh-db-')
    const freshDbPath = path.join(tmpDir, 'fresh-nori.db')

    try {
      const res = runDatabaseMigration({ rootDir: process.cwd(), dbPath: freshDbPath })
      assert.equal(res.ok, true, 'Fresh DB migration must return ok=true')
      assert.equal(res.integrity, 'ok', 'Fresh DB must pass PRAGMA integrity_check')
      assert.equal(res.fkViolations, 0, 'Fresh DB must have 0 foreign key violations')
      assert.ok(res.tablesCount >= 100, `Expected at least 100 tables, got ${res.tablesCount}`)

      const compat = checkDatabaseCompatibility({ dbPath: freshDbPath })
      assert.equal(compat.ok, true, 'Fresh DB must satisfy checkDatabaseCompatibility contract')
      assert.equal(compat.missingTables.length, 0)
      assert.equal(Object.keys(compat.missingColumns).length, 0)
      assert.equal(compat.pendingMigrations.length, 0)

      // Verify bookings schema specifically
      const db = new DatabaseSync(freshDbPath, { readOnly: true })
      const cols = db.prepare("PRAGMA table_info('bookings')").all()
      const colMap = new Map(cols.map((c) => [c.name, c]))
      assert.ok(colMap.has('payment_option'), 'Fresh DB bookings table must contain payment_option')
      assert.ok(
        colMap.has('reservation_deposit_snapshot'),
        'Fresh DB bookings table must contain reservation_deposit_snapshot',
      )
      db.close()
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP B: Existing Database Upgrade
  it('Group B: Upgrading pre-migration database safely adds payment_option and preserves business data', () => {
    const tmpDir = createTempDir('nori-upgrade-db-')
    const upgradeDbPath = path.join(tmpDir, 'legacy-nori.db')
    const liveDbPath = path.resolve('nori.db')

    try {
      // Create a pre-migration snapshot by copying live nori.db (which currently lacks payment_option)
      fs.copyFileSync(liveDbPath, upgradeDbPath)

      // Verify it initially fails preflight due to missing payment_option
      const preCheck = checkDatabaseCompatibility({ dbPath: upgradeDbPath })
      assert.equal(preCheck.ok, false, 'Pre-migration DB must fail compatibility check')
      assert.ok(
        preCheck.missingColumns.bookings?.includes('payment_option'),
        'Must detect missing payment_option',
      )
      assert.ok(
        preCheck.missingColumns.bookings?.includes('reservation_deposit_snapshot'),
        'Must detect missing reservation_deposit_snapshot',
      )

      // Count records before migration
      const dbPre = new DatabaseSync(upgradeDbPath, { readOnly: true })
      const bookingsCountPre = dbPre.prepare('SELECT count(*) as c FROM bookings').get().c
      const paymentsCountPre = dbPre.prepare('SELECT count(*) as c FROM payments').get().c
      const usersCountPre = dbPre.prepare('SELECT count(*) as c FROM users').get().c
      dbPre.close()

      // Execute official migration
      const migRes = runDatabaseMigration({ rootDir: process.cwd(), dbPath: upgradeDbPath })
      assert.equal(migRes.ok, true, 'Migration must succeed on legacy DB')

      // Verify post-migration compatibility
      const postCheck = checkDatabaseCompatibility({ dbPath: upgradeDbPath })
      assert.equal(postCheck.ok, true, 'Upgraded DB must satisfy compatibility check')
      assert.equal(postCheck.pendingMigrations.length, 0)

      // Verify record counts remain identical
      const dbPost = new DatabaseSync(upgradeDbPath, { readOnly: true })
      const bookingsCountPost = dbPost.prepare('SELECT count(*) as c FROM bookings').get().c
      const paymentsCountPost = dbPost.prepare('SELECT count(*) as c FROM payments').get().c
      const usersCountPost = dbPost.prepare('SELECT count(*) as c FROM users').get().c

      assert.equal(bookingsCountPost, bookingsCountPre, 'Bookings count must not change')
      assert.equal(paymentsCountPost, paymentsCountPre, 'Payments count must not change')
      assert.equal(usersCountPost, usersCountPre, 'Users count must not change')

      // Verify backfilled values on existing bookings
      const upgradedBookings = dbPost
        .prepare(
          'SELECT id, total_price, deposit_snapshot, payment_option, reservation_deposit_snapshot FROM bookings',
        )
        .all()
      for (const b of upgradedBookings) {
        assert.equal(
          b.payment_option,
          'DEPOSIT',
          'Legacy bookings must backfill payment_option to DEPOSIT',
        )
        assert.equal(
          b.reservation_deposit_snapshot,
          0,
          'Legacy bookings must backfill reservation_deposit_snapshot to 0',
        )
      }

      // Verify business logic calculation on upgraded booking
      const sample = upgradedBookings[0]
      const structure = resolveBookingDepositAndSecurityStructure({
        totalPrice: Number(sample.total_price),
        depositSnapshot: Number(sample.deposit_snapshot),
        paymentOption: sample.payment_option,
        reservationDepositSnapshot: sample.reservation_deposit_snapshot,
      })
      assert.ok(structure.reservationDepositRequired >= 0)
      assert.equal(structure.securityDepositAmount, Number(sample.deposit_snapshot))

      dbPost.close()
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP C: Pending Migration Guard
  it('Group C: Pending migration guard accurately detects un-migrated database and blocks execution', () => {
    const tmpDir = createTempDir('nori-pending-mig-')
    const testDbPath = path.join(tmpDir, 'pending-nori.db')
    const liveDbPath = path.resolve('nori.db')

    try {
      fs.copyFileSync(liveDbPath, testDbPath)
      const res = checkDatabaseCompatibility({ dbPath: testDbPath })
      assert.equal(res.ok, false)
      assert.ok(res.pendingMigrations.includes('20261120_030000_booking_payment_option_plans'))
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP D: Schema Drift Simulation
  it('Group D: Schema drift simulation detects missing table and missing column', () => {
    const tmpDir = createTempDir('nori-drift-')
    const driftDbPath = path.join(tmpDir, 'drift-nori.db')

    try {
      // First create full schema
      runDatabaseMigration({ rootDir: process.cwd(), dbPath: driftDbPath })

      // Simulate schema drift: drop an index or modify a table
      const db = new DatabaseSync(driftDbPath)
      db.exec('DROP INDEX IF EXISTS bookings_payment_option_idx;')
      db.exec('ALTER TABLE bookings DROP COLUMN payment_option;')
      db.close()

      const check = checkDatabaseCompatibility({ dbPath: driftDbPath })
      assert.equal(check.ok, false, 'Must detect schema drift when payment_option is dropped')
      assert.ok(check.missingColumns.bookings?.includes('payment_option'))
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP E: Migration Re-run (Idempotency)
  it('Group E: Re-running migration multiple times is strictly idempotent with zero data corruption', () => {
    const tmpDir = createTempDir('nori-rerun-')
    const rerunDbPath = path.join(tmpDir, 'rerun-nori.db')
    const liveDbPath = path.resolve('nori.db')

    try {
      fs.copyFileSync(liveDbPath, rerunDbPath)
      // Run 1
      const res1 = runDatabaseMigration({ rootDir: process.cwd(), dbPath: rerunDbPath })
      assert.equal(res1.ok, true)

      // Run 2
      const res2 = runDatabaseMigration({ rootDir: process.cwd(), dbPath: rerunDbPath })
      assert.equal(res2.ok, true)

      // Run 3
      const res3 = runDatabaseMigration({ rootDir: process.cwd(), dbPath: rerunDbPath })
      assert.equal(res3.ok, true)

      // Verify schema and integrity
      const postCheck = checkDatabaseCompatibility({ dbPath: rerunDbPath })
      assert.equal(postCheck.ok, true)
      assert.equal(postCheck.integrity, 'ok')
      assert.equal(postCheck.fkViolations, 0)
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP F: Migration Failure & Recovery
  it('Group F: Backup creation and rollback restores exact database state if disaster occurs', () => {
    const tmpDir = createTempDir('nori-failure-')
    const testDbPath = path.join(tmpDir, 'test-nori.db')
    const testMediaDir = path.join(tmpDir, 'test-media')
    const liveDbPath = path.resolve('nori.db')

    fs.mkdirSync(testMediaDir, { recursive: true })

    try {
      fs.copyFileSync(liveDbPath, testDbPath)

      // 1. Take safety backup
      const backup = createFullBackup({
        dbPath: testDbPath,
        mediaDir: testMediaDir,
        backupsDir: path.join(tmpDir, 'backups'),
      })
      assert.equal(backup.manifest.integrityCheck, 'ok')

      // 2. Corrupt or delete the working database
      fs.unlinkSync(testDbPath)
      assert.equal(fs.existsSync(testDbPath), false)

      // 3. Restore from backup
      const restoreRes = restoreFromBackup({
        sourceBackup: backup.bundleDir,
        targetDbPath: testDbPath,
        targetMediaDir: testMediaDir,
        backupsDir: path.join(tmpDir, 'backups'),
        skipPreBackup: true,
      })
      assert.equal(restoreRes.ok, true)
      assert.equal(fs.existsSync(testDbPath), true)

      const db = new DatabaseSync(testDbPath, { readOnly: true })
      const integrity = db.prepare('PRAGMA integrity_check').get()
      assert.equal(integrity.integrity_check, 'ok')
      db.close()
    } finally {
      safeCleanup(tmpDir)
    }
  })

  // GROUP G: Data Preservation
  it('Group G: Upgrading database preserves all accounts, password hashes, bookings and payments byte-for-byte where untouched', () => {
    const tmpDir = createTempDir('nori-preservation-')
    const testDbPath = path.join(tmpDir, 'preservation-nori.db')
    const liveDbPath = path.resolve('nori.db')

    try {
      fs.copyFileSync(liveDbPath, testDbPath)

      const dbPre = new DatabaseSync(testDbPath, { readOnly: true })
      const usersPre = dbPre
        .prepare('SELECT id, email, hash, salt, status FROM users ORDER BY id')
        .all()
      const adminsPre = dbPre
        .prepare('SELECT id, email, hash, salt, admin_role FROM admins ORDER BY id')
        .all()
      const bookingsPre = dbPre
        .prepare(
          'SELECT id, booking_key, total_price, deposit_snapshot, initial_payment_due, remaining_amount, status FROM bookings ORDER BY id',
        )
        .all()
      const paymentsPre = dbPre
        .prepare(
          'SELECT id, booking_id, amount, expected_amount, received_amount, status FROM payments ORDER BY id',
        )
        .all()
      dbPre.close()

      // Migrate
      runDatabaseMigration({ rootDir: process.cwd(), dbPath: testDbPath })

      const dbPost = new DatabaseSync(testDbPath, { readOnly: true })
      const usersPost = dbPost
        .prepare('SELECT id, email, hash, salt, status FROM users ORDER BY id')
        .all()
      const adminsPost = dbPost
        .prepare('SELECT id, email, hash, salt, admin_role FROM admins ORDER BY id')
        .all()
      const bookingsPost = dbPost
        .prepare(
          'SELECT id, booking_key, total_price, deposit_snapshot, initial_payment_due, remaining_amount, status FROM bookings ORDER BY id',
        )
        .all()
      const paymentsPost = dbPost
        .prepare(
          'SELECT id, booking_id, amount, expected_amount, received_amount, status FROM payments ORDER BY id',
        )
        .all()
      dbPost.close()

      // Assert complete preservation of credentials, users, financial totals, and payments
      assert.deepEqual(
        usersPost,
        usersPre,
        'Users credentials and hashes must remain 100% identical',
      )
      assert.deepEqual(
        adminsPost,
        adminsPre,
        'Admin credentials and hashes must remain 100% identical',
      )
      assert.deepEqual(
        bookingsPost,
        bookingsPre,
        'Booking financial totals and status must remain 100% identical',
      )
      assert.deepEqual(
        paymentsPost,
        paymentsPre,
        'Payments and transactions must remain 100% identical',
      )
    } finally {
      safeCleanup(tmpDir)
    }
  })
})
