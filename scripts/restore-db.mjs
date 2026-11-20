import { restoreFromBackup } from '../src/lib/data-sync.ts'
import { resolveMediaDir, resolveSqlitePath } from '../src/lib/env.ts'

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const explicitSource = parseArg('--source')
const explicitTarget = parseArg('--target') || resolveSqlitePath()
const explicitMedia = parseArg('--media') || resolveMediaDir()

try {
  const res = restoreFromBackup({
    sourceBackup: explicitSource,
    targetDbPath: explicitTarget,
    targetMediaDir: explicitMedia,
  })
  console.log(`[RESTORE] Selected backup: ${res.restoredFrom}`)
  console.log(`[RESTORE] Restored targets: ${res.restoredTargets.join(', ')}`)
  console.log(`[RESTORE] Restored media files: ${res.restoredMediaCount}`)
  console.log('[RESTORE] Restore completed successfully!')
} catch (error) {
  console.error('[RESTORE] Restore failed:', error)
  process.exit(1)
}
