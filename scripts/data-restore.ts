import { restoreFromBackup } from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const sourceBackup = parseArg('--source') || parseArg('--backup')
const targetDbPath = parseArg('--target') || parseArg('--db')
const targetMediaDir = parseArg('--media')
const backupsDir = parseArg('--backups')
const skipPreBackup = process.argv.includes('--no-pre-backup')

try {
  const res = restoreFromBackup({
    sourceBackup,
    targetDbPath,
    targetMediaDir,
    backupsDir,
    skipPreBackup,
  })
  console.log(`[DATA-RESTORE] Restored From:    ${res.restoredFrom}`)
  console.log(`[DATA-RESTORE] Backup ID:        ${res.backupId}`)
  console.log(`[DATA-RESTORE] Restored Targets: ${res.restoredTargets.join(', ')}`)
  console.log(`[DATA-RESTORE] Restored Media:   ${res.restoredMediaCount} file(s)`)
  console.log('[DATA-RESTORE] Restore completed and verified integrity_check=ok.')
} catch (err) {
  console.error('[DATA-RESTORE] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
