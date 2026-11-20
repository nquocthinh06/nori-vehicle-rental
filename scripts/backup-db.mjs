import fs from 'node:fs'
import path from 'node:path'
import { createFullBackup } from '../src/lib/data-sync.ts'
import { resolveBackupDir, resolveSqlitePath } from '../src/lib/env.ts'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const explicitDb = parseArg('--db') || resolveSqlitePath()
const backupsDir = parseArg('--out-dir') || resolveBackupDir()
const explicitOut = parseArg('--out')
const retentionCount = Number(parseArg('--keep') || process.env.BACKUP_RETENTION_COUNT || '14')

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

  // Automated Backup Retention Pruning
  if (retentionCount > 0 && fs.existsSync(backupsDir)) {
    const entries = fs
      .readdirSync(backupsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('nori-backup-'))
      .map((d) => d.name)
      .sort()

    if (entries.length > retentionCount) {
      const toDelete = entries.slice(0, entries.length - retentionCount)
      for (const oldFolder of toDelete) {
        const fullOldPath = path.join(backupsDir, oldFolder)
        try {
          fs.rmSync(fullOldPath, { recursive: true, force: true })
          // Also clean up any loose .db copy with matching prefix
          const dbFile = path.join(backupsDir, `${oldFolder}.db`)
          if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile)
          console.log(`[BACKUP PRUNED] Removed old backup bundle: ${oldFolder}`)
        } catch (pruneErr) {
          console.warn(`[BACKUP PRUNE WARN] Could not delete ${oldFolder}: ${pruneErr.message}`)
        }
      }
    }
  }
} catch (error) {
  console.error('[BACKUP] Backup failed:', error)
  process.exit(1)
}
