import { createFullBackup } from '../src/lib/data-sync.ts'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const explicitDb = parseArg('--db')
const backupsDir = parseArg('--out-dir')
const explicitOut = parseArg('--out')

try {
  const res = createFullBackup({
    dbPath: explicitDb,
    backupsDir,
    outPath: explicitOut,
  })
  console.log(`[BACKUP] Source database backed up -> ${res.dbBackupPath}`)
  console.log(`[BACKUP] Backup bundle:            -> ${res.bundleDir}`)
  console.log(`[BACKUP] Integrity check: ${res.manifest.integrityCheck}`)
  console.log(`[BACKUP] Foreign-key violations: ${res.manifest.foreignKeyViolations}`)
  console.log(
    `[BACKUP] Successfully created backup (${(res.manifest.dbSize / 1024).toFixed(1)} KB, ${res.manifest.mediaFiles.length} media files)`,
  )
} catch (error) {
  console.error('[BACKUP] Backup failed:', error)
  process.exit(1)
}
