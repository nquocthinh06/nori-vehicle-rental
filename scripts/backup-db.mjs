import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const sourceDbPath = fs.existsSync(path.resolve('.next/standalone/nori.db'))
  ? path.resolve('.next/standalone/nori.db')
  : path.resolve('nori.db')

const backupsDir = path.resolve('backups')
fs.mkdirSync(backupsDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const targetBackupPath = path.join(backupsDir, `nori-backup-${timestamp}.db`)

console.log(`[BACKUP] Source database: ${sourceDbPath}`)
console.log(`[BACKUP] Target backup:   ${targetBackupPath}`)

try {
  const db = new DatabaseSync(sourceDbPath)
  // Safe online transactional backup using SQLite VACUUM INTO
  const sanitizedPath = targetBackupPath.replace(/\\/g, '/')
  db.exec(`VACUUM INTO '${sanitizedPath}'`)

  // Integrity check on backup file
  const backupDb = new DatabaseSync(targetBackupPath)
  const integrity = backupDb.prepare('PRAGMA integrity_check').get()

  if (!integrity || integrity.integrity_check !== 'ok') {
    throw new Error(`Integrity check failed: ${integrity ? integrity.integrity_check : 'null'}`)
  }

  const stat = fs.statSync(targetBackupPath)
  console.log(`[BACKUP] Integrity check: ${integrity.integrity_check}`)
  console.log(`[BACKUP] Successfully created backup (${(stat.size / 1024).toFixed(1)} KB)`)
} catch (error) {
  console.error('[BACKUP] Backup failed:', error)
  process.exit(1)
}
