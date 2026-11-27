import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isPostgresUrl,
  loadDotEnvIfAbsent,
  resolveLocalDevPostgresUrl,
} from '../src/lib/pg-replication.ts'
import { restoreEncryptedPgBackup } from '../src/lib/pg-backup.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const useSqlite = process.argv.includes('--sqlite')
const forcePostgres = process.argv.includes('--postgres')
const confirmProduction = process.argv.includes('--confirm-production')
const allowUnencryptedDev = process.argv.includes('--allow-unencrypted-dev')
const isJson = process.argv.includes('--json')
const backupDir = parseArg('--backup')
const outDir = parseArg('--out-dir')
const targetOverride = parseArg('--target')

async function main() {
  if (
    useSqlite ||
    (!forcePostgres &&
      !targetOverride &&
      !isPostgresUrl(process.env.LOCAL_DEV_POSTGRES_URL) &&
      !isPostgresUrl(process.env.DATABASE_URL))
  ) {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const sqliteScript = path.join(dirname, 'restore-db.mjs')
    const res = spawnSync(process.execPath, [sqliteScript, ...process.argv.slice(2)], {
      stdio: 'inherit',
    })
    process.exit(res.status ?? 1)
  }

  const targetUrl = targetOverride || resolveLocalDevPostgresUrl()
  const res = await restoreEncryptedPgBackup({
    backupDir,
    outDir,
    targetUrl,
    allowUnencryptedDev,
    confirmProduction,
  })

  if (isJson) {
    console.log(JSON.stringify(res, null, 2))
    return
  }

  console.log(`[PG-RESTORE] Restored From: ${res.backupId}`)
  console.log(`[PG-RESTORE] Target DB:     ${res.targetRedacted}`)
  console.log(
    `[PG-RESTORE] Tables/Rows:   ${res.restoredTableCount} tables, ${res.restoredRowTotal} rows`,
  )
  console.log(`[PG-RESTORE] Sequences:     ${res.sequencesReset} serial sequence(s) synced`)
  console.log(`[PG-RESTORE] Duration:      ${res.durationMs} ms`)
}

main().catch((err) => {
  console.error('[PG-RESTORE] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
