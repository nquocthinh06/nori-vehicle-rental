import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const explicitDb = parseArg('--db')
const sourceDbPath = explicitDb
  ? path.resolve(explicitDb)
  : fs.existsSync(path.resolve('.next/standalone/nori.db'))
    ? path.resolve('.next/standalone/nori.db')
    : path.resolve('nori.db')

const backupsDir = path.resolve(parseArg('--out-dir') || 'backups')
fs.mkdirSync(backupsDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const explicitOut = parseArg('--out')
const targetBackupPath = explicitOut
  ? path.resolve(explicitOut)
  : path.join(backupsDir, `nori-backup-${timestamp}.db`)

console.log(`[BACKUP] Source database: ${sourceDbPath}`)
console.log(`[BACKUP] Target backup:   ${targetBackupPath}`)

try {
  const db = new DatabaseSync(sourceDbPath, { readOnly: true })
  const sanitizedPath = targetBackupPath.replace(/\\/g, '/').replace(/'/g, "''")
  db.exec(`VACUUM INTO '${sanitizedPath}'`)
  db.close()

  const backupDb = new DatabaseSync(targetBackupPath, { readOnly: true })
  const integrity = backupDb.prepare('PRAGMA integrity_check').get()
  const fkViolations = backupDb.prepare('PRAGMA foreign_key_check').all()
  backupDb.close()

  if (!integrity || integrity.integrity_check !== 'ok') {
    throw new Error(`Integrity check failed: ${integrity ? integrity.integrity_check : 'null'}`)
  }

  const stat = fs.statSync(targetBackupPath)
  console.log(`[BACKUP] Integrity check: ${integrity.integrity_check}`)
  console.log(`[BACKUP] Foreign-key violations: ${fkViolations.length}`)
  console.log(`[BACKUP] Successfully created backup (${(stat.size / 1024).toFixed(1)} KB)`)
} catch (error) {
  console.error('[BACKUP] Backup failed:', error)
  process.exit(1)
}
