import { exportSnapshots } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')
const force = process.argv.includes('--force')

try {
  const res = exportSnapshots({ dbPath, snapshotsDir, mediaDir, force })
  console.log(`[DATA-EXPORT] Snapshot Version: ${res.snapshotVersion}`)
  console.log(`[DATA-EXPORT] Exported At:      ${res.exportedAt}`)
  console.log(`[DATA-EXPORT] Copied Media:     ${res.copiedMediaFiles} file(s)`)
  console.log('[DATA-EXPORT] Record Counts:   ', res.counts)
  console.log('[DATA-EXPORT] Export completed successfully (Git push is NEVER run automatically).')
} catch (err) {
  console.error('[DATA-EXPORT] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
