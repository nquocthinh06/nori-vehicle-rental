import { createFullBackup } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const backupsDir = parseArg('--out-dir')
const outPath = parseArg('--out')
const mediaDir = parseArg('--media')

try {
  const res = createFullBackup({ dbPath, backupsDir, outPath, mediaDir })
  console.log(`[DATA-BACKUP] Backup ID:        ${res.backupId}`)
  console.log(`[DATA-BACKUP] DB Backup Path:   ${res.dbBackupPath}`)
  console.log(`[DATA-BACKUP] Bundle Directory: ${res.bundleDir}`)
  console.log(`[DATA-BACKUP] Integrity Check:  ${res.manifest.integrityCheck}`)
  console.log(`[DATA-BACKUP] Media Files:      ${res.manifest.mediaFiles.length}`)
} catch (err) {
  console.error('[DATA-BACKUP] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
