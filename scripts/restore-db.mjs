import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const explicitSource = parseArg('--source')
const explicitTarget = parseArg('--target')

let selectedBackup
if (explicitSource) {
  selectedBackup = path.resolve(explicitSource)
  if (!fs.existsSync(selectedBackup)) {
    console.error('[RESTORE] Specified backup file not found:', selectedBackup)
    process.exit(1)
  }
} else {
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
  selectedBackup = path.join(backupsDir, backupFiles[0])
}

console.log(`[RESTORE] Selected backup: ${selectedBackup}`)

const testDb = new DatabaseSync(selectedBackup, { readOnly: true })
const integrity = testDb.prepare('PRAGMA integrity_check').get()
testDb.close()

if (!integrity || integrity.integrity_check !== 'ok') {
  console.error(
    '[RESTORE] Corrupted backup, aborting:',
    integrity ? integrity.integrity_check : 'null',
  )
  process.exit(1)
}

const targets = explicitTarget
  ? [path.resolve(explicitTarget)]
  : [path.resolve('nori.db'), path.resolve('.next/standalone/nori.db')].filter((p) =>
      fs.existsSync(path.dirname(p)),
    )

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = `${target}${suffix}`
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar)
    }
  }
  fs.copyFileSync(selectedBackup, target)
  const restoredCheck = new DatabaseSync(target, { readOnly: true })
  const checkRes = restoredCheck.prepare('PRAGMA integrity_check').get()
  restoredCheck.close()
  if (checkRes?.integrity_check !== 'ok') {
    throw new Error(`Post-restore integrity check failed for ${target}`)
  }
  console.log(`[RESTORE] Successfully restored & verified integrity_check=ok -> ${target}`)
}

console.log('[RESTORE] Restore completed successfully!')
