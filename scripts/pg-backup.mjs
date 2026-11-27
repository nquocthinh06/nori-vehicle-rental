import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isPostgresUrl,
  loadDotEnvIfAbsent,
  resolveLocalReplicaUrl,
  resolveNeonDirectUrl,
} from '../src/lib/pg-replication.ts'
import { createEncryptedPgBackup } from '../src/lib/pg-backup.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const useSqlite = process.argv.includes('--sqlite')
const forcePostgres = process.argv.includes('--postgres')
const allowUnencryptedDev = process.argv.includes('--allow-unencrypted-dev')
const isJson = process.argv.includes('--json')
const sourceMode = parseArg('--source') || 'auto'
const outDir = parseArg('--out-dir')
const explicitTier = parseArg('--tier')

async function main() {
  const hasPgEnv =
    isPostgresUrl(process.env.DATABASE_URL) ||
    isPostgresUrl(process.env.NEON_DIRECT_URL) ||
    isPostgresUrl(process.env.LOCAL_REPLICA_URL) ||
    isPostgresUrl(sourceMode)

  if (useSqlite || (!forcePostgres && !hasPgEnv)) {
    const dirname = path.dirname(fileURLToPath(import.meta.url))
    const sqliteScript = path.join(dirname, 'backup-db.mjs')
    const res = spawnSync(process.execPath, [sqliteScript, ...process.argv.slice(2)], {
      stdio: 'inherit',
    })
    process.exit(res.status ?? 1)
  }

  let sourceUrl
  if (isPostgresUrl(sourceMode)) {
    sourceUrl = sourceMode
  } else if (sourceMode === 'replica') {
    sourceUrl = resolveLocalReplicaUrl()
  } else if (sourceMode === 'neon' || sourceMode === 'direct') {
    sourceUrl = resolveNeonDirectUrl().directUrl
  } else {
    // Prefer local replica if reachable/configured, else Neon direct (read-only pg_dump)
    if (process.env.LOCAL_REPLICA_URL?.trim()) {
      sourceUrl = process.env.LOCAL_REPLICA_URL.trim()
    } else if (process.env.NEON_DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim()) {
      sourceUrl = resolveNeonDirectUrl().directUrl
    } else {
      sourceUrl = resolveLocalReplicaUrl()
    }
  }

  const res = await createEncryptedPgBackup({
    sourceUrl,
    outDir,
    tier: explicitTier,
    allowUnencryptedDev,
  })

  if (isJson) {
    console.log(JSON.stringify(res, null, 2))
    return
  }

  console.log(`[PG-BACKUP] Backup ID:   ${res.backupId}`)
  console.log(`[PG-BACKUP] Tier:        ${res.manifest.tier} (${res.manifest.timezone})`)
  console.log(`[PG-BACKUP] Source:      ${res.manifest.sourceRedacted}`)
  console.log(`[PG-BACKUP] Encrypted:   ${res.manifest.encrypted} (${res.manifest.cipher})`)
  console.log(`[PG-BACKUP] Archive:     ${res.archivePath}`)
  console.log(`[PG-BACKUP] SHA-256:     ${res.manifest.archiveSha256}`)
  console.log(
    `[PG-BACKUP] Tables/Objs: ${res.manifest.publicTableCount} tables, ${res.manifest.schemaObjectsListed} pg_restore objects`,
  )
  if (res.pruned.length > 0) {
    console.log(`[PG-BACKUP] Pruned old:  ${res.pruned.join(', ')}`)
  }
}

main().catch((err) => {
  console.error('[PG-BACKUP] Failed:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
