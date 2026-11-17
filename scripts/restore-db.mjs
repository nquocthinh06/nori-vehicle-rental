import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const backupsDir = path.resolve('backups')
if (!fs.existsSync(backupsDir)) {
  console.error('[RESTORE] No backups directory found at', backupsDir)
  process.exit(1)
}

const backupFiles = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith('nori-backup-') && f.endsWith('.db'))
  .sort()
  .reverse()

if (!backupFiles.length) {
  console.error('[RESTORE] No backup files found in', backupsDir)
  process.exit(1)
}

const latestBackup = path.join(backupsDir, backupFiles[0])
console.log(`[RESTORE] Selected latest backup: ${latestBackup}`)

// Verify integrity of the backup before restoring
const testDb = new DatabaseSync(latestBackup)
const integrity = testDb.prepare('PRAGMA integrity_check').get()

if (!integrity || integrity.integrity_check !== 'ok') {
  console.error(
    '[RESTORE] Corrupted backup, aborting:',
    integrity ? integrity.integrity_check : 'null',
  )
  process.exit(1)
}

const targets = [path.resolve('nori.db'), path.resolve('.next/standalone/nori.db')].filter((p) =>
  fs.existsSync(path.dirname(p)),
)

for (const target of targets) {
  fs.copyFileSync(latestBackup, target)
  console.log(`[RESTORE] Successfully restored to: ${target}`)
}

console.log('[RESTORE] Restore completed successfully!')
