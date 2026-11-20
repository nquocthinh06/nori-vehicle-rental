import { runDatabaseMigration, importSnapshots } from '../src/lib/data-sync.ts'

console.log('[CI] Initializing database migration...')
const migRes = runDatabaseMigration()
console.log(`[CI] Migration complete: ${migRes.tablesCount} tables (ok=${migRes.ok}, integrity=${migRes.integrity})`)
if (!migRes.ok) process.exit(1)

console.log('[CI] Importing starter snapshot data...')
const impRes = await importSnapshots({ skipBackup: true, allowProductionImport: true })
console.log(`[CI] Snapshot import complete (ok=${impRes.ok}, status=${impRes.status})`)
if (!impRes.ok) process.exit(1)

console.log('[CI] Database successfully initialized and populated for tests!')
