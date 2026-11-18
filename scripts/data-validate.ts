import { validateSnapshotsAndMedia } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')

const report = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })

console.log(`[DATA-VALIDATE] Snapshot Version: ${report.snapshotVersion ?? 'none'}`)
console.log(`[DATA-VALIDATE] Schema Version:   ${report.schemaVersion}`)
console.log(`[DATA-VALIDATE] Checked Files:    ${report.checkedFiles}`)
console.log(`[DATA-VALIDATE] Media Checked:    ${report.mediaChecked}`)

if (!report.ok) {
  for (const e of [
    ...report.schemaErrors,
    ...report.sensitiveViolations,
    ...report.referentialErrors,
    ...report.mediaErrors,
  ]) {
    console.error(`  [ERROR] ${e}`)
  }
  process.exit(1)
}

console.log('[DATA-VALIDATE] Validation PASSED (0 sensitive/referential/media/schema errors).')
