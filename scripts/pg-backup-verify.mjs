import { loadDotEnvIfAbsent } from '../src/lib/pg-replication.ts'
import { verifyEncryptedPgBackup } from '../src/lib/pg-backup.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const backupDir = parseArg('--backup')
const outDir = parseArg('--out-dir')
const isolatedTestTargetUrl = parseArg('--restore-test')
const allowUnencryptedDev = process.argv.includes('--allow-unencrypted-dev')
const isJson = process.argv.includes('--json')

async function main() {
  const res = await verifyEncryptedPgBackup({
    backupDir,
    outDir,
    allowUnencryptedDev,
    isolatedTestTargetUrl,
  })

  if (isJson) {
    console.log(JSON.stringify(res, null, 2))
  } else {
    console.log(`[PG-BACKUP-VERIFY] Backup ID:         ${res.backupId} (${res.tier})`)
    console.log(
      `[PG-BACKUP-VERIFY] Archive SHA-256:   ${res.archiveSha256Matched ? 'OK' : 'FAILED'}`,
    )
    console.log(
      `[PG-BACKUP-VERIFY] Plaintext SHA-256: ${res.plaintextSha256Matched ? 'OK' : 'FAILED'}`,
    )
    console.log(
      `[PG-BACKUP-VERIFY] pg_restore --list: ${res.pgRestoreListOk ? 'OK' : 'FAILED'} (${res.schemaObjectsListed} objects)`,
    )
    if (res.isolatedRestoreTested) {
      console.log(
        `[PG-BACKUP-VERIFY] Isolated Restore:  OK (${res.isolatedRestoreRowTotal} total rows)`,
      )
    }
    if (res.errors.length > 0) {
      for (const e of res.errors) console.error(`  ! ${e}`)
    }
  }

  if (!res.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[PG-BACKUP-VERIFY] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
