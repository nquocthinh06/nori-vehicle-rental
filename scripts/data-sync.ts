import {
  exportSnapshots,
  importSnapshots,
  validateSnapshotsAndMedia,
  type ConflictStrategy,
} from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')
const exportAfterImport = process.argv.includes('--export')
const conflictArg =
  parseArg('--on-conflict') ||
  process.argv.find((a) => a.startsWith('--on-conflict='))?.split('=')[1]
const onConflict: ConflictStrategy =
  conflictArg === 'keep-local' || conflictArg === 'prefer-snapshot' ? conflictArg : 'abort'

console.log('[DATA-SYNC] Step 1/3: Validating snapshots & media...')
const validation = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })
if (!validation.ok) {
  console.error('[DATA-SYNC] Snapshot validation failed:', validation)
  process.exit(1)
}

console.log('[DATA-SYNC] Step 2/3: Running dry-run import check...')
const dry = importSnapshots({ dbPath, snapshotsDir, mediaDir, dryRun: true, onConflict })
if (!dry.ok) {
  console.error('[DATA-SYNC] Dry-run detected conflicts or errors:', dry.errors, dry.conflicts)
  process.exit(1)
}

console.log('[DATA-SYNC] Step 3/3: Applying safe idempotent import...')
const imported = importSnapshots({ dbPath, snapshotsDir, mediaDir, dryRun: false, onConflict })
if (!imported.ok) {
  console.error('[DATA-SYNC] Import failed:', imported.errors)
  process.exit(1)
}

if (exportAfterImport) {
  const exported = exportSnapshots({ dbPath, snapshotsDir, mediaDir, force: true })
  console.log(`[DATA-SYNC] Exported updated snapshot: ${exported.snapshotVersion}`)
}

console.log('[DATA-SYNC] Synchronization completed safely:', imported.summary)
