import {
  assertNotProductionTarget,
  buildPoolForUrl,
  buildSlotReinitRunbook,
  compareSourceAndReplicaParity,
  loadDotEnvIfAbsent,
  refreshSubscriptionSafe,
  resolveLocalReplicaUrl,
  resolveNeonDirectUrl,
  syncAllSerialSequences,
  verifyReadOnlyRoleAccess,
} from '../src/lib/pg-replication.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const isJson = process.argv.includes('--json')
const showReinitPlan = process.argv.includes('--reinit-plan')
const doRefresh = process.argv.includes('--refresh')
const doSyncSequences = process.argv.includes('--sync-sequences')
const sourceOverride = parseArg('--source')
const replicaOverride = parseArg('--replica')
const subName = parseArg('--subscription') || 'nori_sub'

async function main() {
  if (showReinitPlan) {
    const plan = buildSlotReinitRunbook({ subscriptionName: subName })
    if (isJson) {
      console.log(JSON.stringify({ ok: true, reinitPlan: plan }, null, 2))
    } else {
      console.log('=== NORI REPLICA SAFE RE-INIT RUNBOOK ===')
      for (const line of plan) console.log(line)
    }
    return
  }

  const sourceUrl = sourceOverride || resolveNeonDirectUrl().directUrl
  const replicaUrl = replicaOverride || resolveLocalReplicaUrl()

  if (doRefresh) {
    assertNotProductionTarget(replicaUrl, 'subscription refresh')
    const refreshRes = await refreshSubscriptionSafe(replicaUrl, subName, {
      enableFirst: true,
      copyData: false,
    })
    if (!isJson) {
      console.log('[DB-SYNC-CHECK] Refreshed subscription:', refreshRes.actions.join('; '))
    }
  }

  if (doSyncSequences) {
    assertNotProductionTarget(replicaUrl, 'sequence sync')
    const pool = buildPoolForUrl(replicaUrl, 1)
    try {
      const updated = await syncAllSerialSequences(pool)
      if (!isJson) {
        console.log(`[DB-SYNC-CHECK] Synced ${updated.length} serial sequence(s) on replica.`)
      }
    } finally {
      await pool.end()
    }
  }

  const parity = await compareSourceAndReplicaParity(sourceUrl, replicaUrl)
  const readonly = await verifyReadOnlyRoleAccess(replicaUrl)

  const report = {
    ok: parity.ok && readonly.ok,
    parity,
    readonlyRole: readonly,
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('='.repeat(72))
    console.log(' NORI POSTGRESQL PARITY & READ-ONLY CHECK')
    console.log('='.repeat(72))
    console.log(`Source:   ${parity.sourceRedacted}`)
    console.log(`Replica:  ${parity.replicaRedacted}`)
    console.log(
      `Tables:   ${parity.matchedTables}/${parity.sourceTableCount} matched (replica has ${parity.replicaTableCount})`,
    )
    console.log(`Rows:     source=${parity.totalSourceRows}, replica=${parity.totalReplicaRows}`)
    console.log(
      `FKs:      source=${parity.fkConstraintCountSource}, replica=${parity.fkConstraintCountReplica}`,
    )
    console.log(`SeqDrift: ${parity.sequenceDrifts.length} serial sequence(s)`)
    console.log(
      `ReadOnly: role=${readonly.roleExists}, select=${readonly.canSelect}, writeBlocked=${readonly.insertBlocked && readonly.updateBlocked && readonly.deleteBlocked && readonly.createBlocked}`,
    )

    if (parity.rowCountMismatches.length > 0) {
      console.log('\nRow Count Mismatches:')
      for (const m of parity.rowCountMismatches) {
        console.log(`  - ${m.table}: source=${m.sourceRows}, replica=${m.replicaRows}`)
      }
    }
    if (parity.alerts.length > 0) {
      console.log('\nAlerts:')
      for (const a of parity.alerts) console.log(`  ! ${a}`)
    }
    if (!readonly.ok) {
      console.log('\nReadOnly Errors:')
      for (const e of readonly.errors) console.log(`  ! ${e}`)
    }
  }

  if (!report.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[DB-SYNC-CHECK] Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
