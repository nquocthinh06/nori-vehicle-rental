import { importSnapshots, type ConflictStrategy } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')
const backupsDir = parseArg('--backups')
const dryRun = process.argv.includes('--dry-run')
const skipBackup = process.argv.includes('--skip-backup')
const allowProductionImport = process.argv.includes('--allow-production-import')
const simulateFailure = process.argv.includes('--simulate-failure')

const conflictArg =
  parseArg('--on-conflict') ||
  process.argv.find((a) => a.startsWith('--on-conflict='))?.split('=')[1]
const onConflict: ConflictStrategy =
  conflictArg === 'keep-local' || conflictArg === 'prefer-snapshot' ? conflictArg : 'abort'

const res = importSnapshots({
  dbPath,
  snapshotsDir,
  mediaDir,
  backupsDir,
  dryRun,
  onConflict,
  skipBackup,
  allowProductionImport,
  simulateFailure,
})

console.log(`[DATA-IMPORT] Status:           ${res.status}`)
console.log(`[DATA-IMPORT] Snapshot Version: ${res.snapshotVersion}`)
console.log(`[DATA-IMPORT] Dry Run:          ${res.dryRun}`)
console.log('[DATA-IMPORT] Summary:         ', res.summary)

if (res.conflicts.length > 0) {
  console.log('[DATA-IMPORT] Conflicts detected:')
  for (const c of res.conflicts) {
    console.log(
      `  - [${c.collection}:${c.key}] changedFields=${c.changedFields.join(',')} mediaConflict=${c.mediaConflict}`,
    )
  }
}

if (!res.ok) {
  for (const err of res.errors) {
    console.error(`[DATA-IMPORT] Error: ${err}`)
  }
  process.exit(1)
}
