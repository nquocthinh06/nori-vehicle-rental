import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { runDatabaseMigration, importSnapshots } from '../src/lib/data-sync.ts'

console.log('========================================================')
console.log(' NORI CI DATABASE INITIALIZATION & SEEDING')
console.log('========================================================')

const rootDir = process.cwd()
const rawDb =
  process.env.NORI_SQLITE_PATH ||
  (process.env.DATABASE_URI?.startsWith('file:')
    ? process.env.DATABASE_URI.slice(5)
    : process.env.DATABASE_URI) ||
  'nori.db'
const dbPath = path.resolve(rootDir, rawDb)

console.log(`[CI-INIT] Target Database Path: ${dbPath}`)

// 1. Run Schema Migration
console.log('[CI-INIT] 1. Applying SQLite schema and migrations...')
const migRes = runDatabaseMigration({ dbPath, rootDir })
if (!migRes.ok) {
  console.error('[CI-INIT] Schema migration failed:', migRes)
  process.exit(1)
}
console.log(
  `[CI-INIT] Schema OK: ${migRes.tablesCount} tables, version=${migRes.schemaVersion}, integrity=${migRes.integrity}`,
)

// 2. Import Snapshot Data (vehicles, brands, models, promotions, etc.)
console.log('[CI-INIT] 2. Importing canonical snapshot datasets...')
const impRes = importSnapshots({
  dbPath,
  rootDir,
  skipBackup: true,
  allowProductionImport: true,
})
if (!impRes.ok) {
  console.error('[CI-INIT] Snapshot import failed:', impRes.status, impRes.errors)
  process.exit(1)
}
console.log(
  `[CI-INIT] Snapshot Import OK: status=${impRes.status}, created=${impRes.summary.toCreate}, unchanged=${impRes.summary.unchanged}`,
)

// 3. Ensure test admin and test customer user exist for integration test suites
console.log('[CI-INIT] 3. Verifying baseline test accounts...')
const db = new DatabaseSync(dbPath)
try {
  db.exec('PRAGMA foreign_keys = ON')
  const now = new Date().toISOString()

  // Ensure Admin
  const adminEmail = (process.env.NORI_ADMIN_EMAIL || 'admin@nori.vn').trim().toLowerCase()
  const adminPassword = process.env.NORI_ADMIN_PASSWORD?.trim() || 'Admin@12345678'
  const adminRow = db.prepare('SELECT id FROM admins LIMIT 1').get()
  if (!adminRow) {
    const adminId = 'adm-ci-test-super-admin'
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync(adminPassword, salt, 600_000, 32, 'sha256').toString('hex')
    db.prepare(`
      INSERT INTO admins (
        id, email, hash, salt, admin_role, staff_title, branch_scope_mode, account_status, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      adminEmail,
      `pbkdf2-sha256-v1:${hash}`,
      salt,
      'SUPER_ADMIN',
      'SUPER_ADMIN',
      'ALL',
      'ACTIVE',
      now,
      now,
    )
    console.log(`[CI-INIT] Created baseline test admin: ${adminEmail}`)
  }

  // Ensure Customer User
  const userRow = db.prepare('SELECT id FROM users LIMIT 1').get()
  if (!userRow) {
    const userId = 'usr-ci-test-customer-01'
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.pbkdf2Sync('Customer@12345678', salt, 600_000, 32, 'sha256').toString('hex')
    db.prepare(`
      INSERT INTO users (
        id, email, hash, salt, full_name, phone, role, status, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      'customer.test@nori.vn',
      `pbkdf2-sha256-v1:${hash}`,
      salt,
      'Nguyen Van Test CI',
      '0901234567',
      'CUSTOMER',
      'ACTIVE',
      now,
      now,
    )
    console.log('[CI-INIT] Created baseline test customer: customer.test@nori.vn')
  }
} finally {
  db.close()
}

console.log('[CI-INIT] Database initialization completed successfully!')
process.exit(0)
