import { runDatabaseMigration } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')

try {
  const res = runDatabaseMigration({ dbPath })
  console.log(`[DB-MIGRATE] Database:       ${res.dbPath}`)
  console.log(`[DB-MIGRATE] Schema Version: ${res.schemaVersion}`)
  console.log(`[DB-MIGRATE] Tables Count:   ${res.tablesCount}`)
  console.log(`[DB-MIGRATE] Integrity:      ${res.integrity}`)
  console.log(`[DB-MIGRATE] FK Violations:  ${res.fkViolations}`)
  if (!res.ok) {
    process.exit(1)
  }
} catch (err) {
  console.error('[DB-MIGRATE] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
