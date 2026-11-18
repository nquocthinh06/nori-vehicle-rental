import { getDataSyncStatus } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const jsonMode = process.argv.includes('--json')

const status = getDataSyncStatus({ dbPath, snapshotsDir })

if (jsonMode) {
  console.log(JSON.stringify(status, null, 2))
} else {
  console.log('=== NORI DATA SYNCHRONIZATION STATUS ===')
  console.log(`Schema Version:      ${status.schemaVersion}`)
  console.log(`Snapshot Version:    ${status.snapshotVersion ?? 'Chưa có snapshot'}`)
  console.log(`Last Exported At:    ${status.lastExportedAt ?? '—'}`)
  console.log(`Last Backup At:      ${status.lastBackupAt ?? '—'}`)
  console.log(
    `In Sync w/ Snapshot: ${status.inSyncWithSnapshot ? 'YES (Đồng bộ)' : 'NO (Có thay đổi chưa đồng bộ)'}`,
  )
  console.log(`Unexported Records:  ${status.unexportedCount}`)
  if (status.unexportedCount > 0) {
    console.log('  Chi tiết chưa export:', status.unexportedByCollection)
  }
  if (status.counts) {
    console.log('  Số lượng bản ghi DB:', status.counts)
  }
  if (status.validation) {
    console.log(
      `Validation Status:   ${status.validation.ok ? 'VALID' : `INVALID (${status.validation.errorCount} errors)`}`,
    )
  }
}
