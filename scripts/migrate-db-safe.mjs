import fs from 'node:fs'
import path from 'node:path'
import { createFullBackup, runDatabaseMigration } from '../src/lib/data-sync.ts'
import { checkDatabaseCompatibility } from './check-db-schema.mjs'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const rootDir = process.cwd()
const explicitDb = parseArg('--db')
const rawDb =
  explicitDb ||
  process.env.NORI_SQLITE_PATH ||
  (process.env.DATABASE_URI?.startsWith('file:')
    ? process.env.DATABASE_URI.slice(5)
    : process.env.DATABASE_URI) ||
  'nori.db'
const dbPath = path.resolve(rootDir, rawDb)

console.log('========================================================')
console.log(' NORI VEHICLE RENTAL — SAFE DATABASE MIGRATION')
console.log('========================================================')
console.log(`Target Database: ${dbPath}`)

if (!fs.existsSync(dbPath)) {
  console.log(
    `[SAFE-MIGRATE] Database does not exist yet. Initializing fresh database at ${dbPath}...`,
  )
  try {
    const initRes = runDatabaseMigration({ dbPath })
    console.log(
      `[SAFE-MIGRATE] Fresh database initialized successfully: ${initRes.tablesCount} tables, version=${initRes.schemaVersion}, integrity=${initRes.integrity}`,
    )
    process.exit(initRes.ok ? 0 : 1)
  } catch (initErr) {
    console.error('[SAFE-MIGRATE] Fresh database initialization failed:', initErr)
    process.exit(1)
  }
}

const preCheck = checkDatabaseCompatibility({ dbPath })
if (preCheck.ok) {
  console.log('[SAFE-MIGRATE] Database is already 100% up to date and compatible.')
  console.log(`Tables: ${preCheck.tablesCount}, Integrity: ${preCheck.integrity}, FK Violations: 0`)
  process.exit(0)
}

console.log('[SAFE-MIGRATE] Pending schema changes detected:')
if (preCheck.missingColumns && Object.keys(preCheck.missingColumns).length > 0) {
  for (const [table, cols] of Object.entries(preCheck.missingColumns)) {
    console.log(`  - Table "${table}": missing [${cols.join(', ')}]`)
  }
}
if (preCheck.pendingMigrations?.length > 0) {
  for (const m of preCheck.pendingMigrations) {
    console.log(`  - Migration: ${m}`)
  }
}

// 1. Automatic pre-migration backup
console.log('\n[1/3] Creating safety backup before migration...')
let backupRes
try {
  backupRes = createFullBackup({ dbPath })
  console.log(`[BACKUP] Saved -> ${backupRes.dbBackupPath}`)
  console.log(
    `[BACKUP] Integrity=${backupRes.manifest.integrityCheck}, Media=${backupRes.manifest.mediaFiles.length}`,
  )
} catch (err) {
  console.error('[ERROR] Pre-migration backup failed! Aborting migration for safety.', err)
  process.exit(1)
}

// 2. Run Additive Migration
console.log('\n[2/3] Executing additive migrations...')
try {
  const migRes = runDatabaseMigration({ dbPath })
  console.log(
    `[MIGRATE] Migration result: ok=${migRes.ok}, version=${migRes.schemaVersion}, tables=${migRes.tablesCount}`,
  )
  if (!migRes.ok) {
    throw new Error(
      `Migration check failed (integrity=${migRes.integrity}, fkViolations=${migRes.fkViolations})`,
    )
  }
} catch (err) {
  console.error('\n[CRITICAL ERROR] Migration execution failed!', err)
  console.error(`Safety backup is intact at: ${backupRes.dbBackupPath}`)
  console.error('To restore: node scripts/restore-db.mjs --from ' + backupRes.dbBackupPath)
  process.exit(1)
}

// 3. Post-migration Verification
console.log('\n[3/3] Verifying database schema compatibility after migration...')
const postCheck = checkDatabaseCompatibility({ dbPath })
if (!postCheck.ok) {
  console.error('[CRITICAL] Post-migration check failed!')
  console.error(JSON.stringify(postCheck, null, 2))
  process.exit(1)
}

console.log('\n========================================================')
console.log(' [SUCCESS] DATABASE MIGRATION COMPLETED & VERIFIED!')
console.log('========================================================')
console.log(`Database:     ${dbPath}`)
console.log(`Tables Count: ${postCheck.tablesCount}`)
console.log(`Integrity:    ${postCheck.integrity}`)
console.log(`FK Check:     0 violations`)
console.log(`Safety Backup: ${backupRes.dbBackupPath}`)
