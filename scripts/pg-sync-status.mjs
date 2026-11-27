import fs from 'node:fs'
import path from 'node:path'
import {
  inspectPostgresEndpoint,
  loadDotEnvIfAbsent,
  resolveLocalReplicaUrl,
  resolveNeonDirectUrl,
} from '../src/lib/pg-replication.ts'
import { listPgBackups, resolvePgBackupRootDir } from '../src/lib/pg-backup.ts'

loadDotEnvIfAbsent()

const isJson = process.argv.includes('--json')
const skipNeon = process.argv.includes('--local-only')
const skipReplica = process.argv.includes('--neon-only')

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let idx = 0
  let v = bytes
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024
    idx++
  }
  return `${v.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`
}

function getBackupDiskUsageBytes(dir) {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) total += fs.statSync(full).size
    }
  }
  return total
}

async function main() {
  let neonInfo = null
  let neonUrls = null
  if (!skipNeon) {
    try {
      neonUrls = resolveNeonDirectUrl()
      neonInfo = await inspectPostgresEndpoint(neonUrls.directUrl)
    } catch (err) {
      neonInfo = {
        ok: false,
        redactedUrl: '<unconfigured>',
        alerts: [err instanceof Error ? err.message : String(err)],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  let replicaInfo = null
  if (!skipReplica) {
    const replicaUrl = resolveLocalReplicaUrl()
    replicaInfo = await inspectPostgresEndpoint(replicaUrl)
  }

  const backupRoot = resolvePgBackupRootDir()
  const backups = listPgBackups(backupRoot)
  const latestBackup = backups[0]?.manifest || null
  const backupDiskBytes = getBackupDiskUsageBytes(backupRoot)

  const alerts = [
    ...(neonInfo?.alerts || []).map((a) => `[NEON] ${a}`),
    ...(replicaInfo?.alerts || []).map((a) => `[REPLICA] ${a}`),
  ]

  if (neonInfo?.ok && neonInfo.walLevel !== 'logical') {
    alerts.push(
      `[NEON] wal_level is "${neonInfo.walLevel}" (must be "logical" in Neon Console for Logical Replication).`,
    )
  }
  if (neonInfo?.ok && neonInfo.publications.length === 0) {
    alerts.push('[NEON] No PostgreSQL PUBLICATION configured yet (e.g. nori_pub).')
  }
  if (!latestBackup) {
    alerts.push('[BACKUP] No encrypted PostgreSQL backup bundle found yet.')
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    neon: neonInfo
      ? {
          ok: neonInfo.ok,
          host: neonUrls?.directHost || neonInfo.host || null,
          convertedFromPooler: neonUrls?.convertedFromPooler ?? false,
          version: neonInfo.version || null,
          walLevel: neonInfo.walLevel || null,
          publicTableCount: neonInfo.publicTableCount ?? 0,
          pkTableCount: neonInfo.pkTableCount ?? 0,
          pendingMigrations: neonInfo.pendingMigrations || [],
          publications: neonInfo.publications || [],
          replicationSlots: neonInfo.replicationSlots || [],
          activeSenders: neonInfo.activeSenders || [],
          databaseSizeBytes: neonInfo.databaseSizeBytes ?? 0,
          error: neonInfo.error || null,
        }
      : null,
    localReplica: replicaInfo
      ? {
          ok: replicaInfo.ok,
          redactedUrl: replicaInfo.redactedUrl,
          version: replicaInfo.version || null,
          publicTableCount: replicaInfo.publicTableCount ?? 0,
          pendingMigrations: replicaInfo.pendingMigrations || [],
          subscriptions: replicaInfo.subscriptions || [],
          databaseSizeBytes: replicaInfo.databaseSizeBytes ?? 0,
          error: replicaInfo.error || null,
        }
      : null,
    backups: {
      rootDir: backupRoot,
      totalBundles: backups.length,
      diskUsageBytes: backupDiskBytes,
      latest: latestBackup
        ? {
            backupId: latestBackup.backupId,
            tier: latestBackup.tier,
            createdAt: latestBackup.createdAt,
            encrypted: latestBackup.encrypted,
            archiveSizeBytes: latestBackup.archiveSizeBytes,
            archiveSha256: latestBackup.archiveSha256,
          }
        : null,
    },
    alerts,
  }

  if (isJson) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log('='.repeat(72))
  console.log(' NORI POSTGRESQL REPLICATION & BACKUP STATUS')
  console.log('='.repeat(72))
  if (summary.neon) {
    console.log(
      `Neon Direct (${summary.neon.host || 'n/a'}): ${summary.neon.ok ? 'ONLINE' : 'OFFLINE'} | PG=${summary.neon.version || 'n/a'} | wal_level=${summary.neon.walLevel || 'n/a'} | tables=${summary.neon.publicTableCount} | size=${formatBytes(summary.neon.databaseSizeBytes)}`,
    )
    console.log(
      `  Publications: ${summary.neon.publications.length} | Slots: ${summary.neon.replicationSlots.length} | Active Senders: ${summary.neon.activeSenders.length}`,
    )
    for (const s of summary.neon.activeSenders) {
      console.log(
        `  -> Sender[${s.applicationName}]: state=${s.state}, byteLag=${s.byteLag ?? 'n/a'} B, replayLag=${s.replayLagMs ?? 'n/a'} ms`,
      )
    }
  }
  if (summary.localReplica) {
    console.log(
      `Local Replica (${summary.localReplica.redactedUrl}): ${summary.localReplica.ok ? 'ONLINE' : 'OFFLINE'} | PG=${summary.localReplica.version || 'n/a'} | tables=${summary.localReplica.publicTableCount} | size=${formatBytes(summary.localReplica.databaseSizeBytes)}`,
    )
    for (const sub of summary.localReplica.subscriptions) {
      console.log(
        `  -> Sub[${sub.subname}]: enabled=${sub.enabled}, workerPid=${sub.pid ?? 'none'}, receivedLsn=${sub.receivedLsn ?? 'none'}, latestEndTime=${sub.latestEndTime ?? 'n/a'}`,
      )
    }
  }
  console.log(
    `PG Backups (${summary.backups.rootDir}): ${summary.backups.totalBundles} bundle(s), total ${formatBytes(summary.backups.diskUsageBytes)}`,
  )
  if (summary.backups.latest) {
    console.log(
      `  -> Latest: ${summary.backups.latest.backupId} (${summary.backups.latest.tier}, encrypted=${summary.backups.latest.encrypted}, ${formatBytes(summary.backups.latest.archiveSizeBytes)})`,
    )
  }
  if (alerts.length > 0) {
    console.log('\nAlerts:')
    for (const a of alerts) console.log(`  ! ${a}`)
  } else {
    console.log('\nStatus: HEALTHY (0 alerts)')
  }
}

main().catch((err) => {
  console.error('[DB-SYNC-STATUS] Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
