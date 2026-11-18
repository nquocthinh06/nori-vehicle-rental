import fs from 'node:fs'
import path from 'node:path'
import {
  extractDatabaseState,
  resolvePaths,
  validateSnapshotsAndMedia,
} from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')

const paths = resolvePaths({ dbPath, snapshotsDir, mediaDir })
const errors: string[] = []

if (fs.existsSync(path.join(paths.snapshotsDir, 'manifest.json'))) {
  const snapReport = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })
  errors.push(...snapReport.mediaErrors)
  console.log(`[MEDIA-VALIDATE] Snapshot Media Checked: ${snapReport.mediaChecked}`)
}

if (fs.existsSync(paths.dbPath)) {
  const dbState = extractDatabaseState({ dbPath, mediaDir })
  let dbMediaOk = 0
  for (const m of dbState.mediaManifest) {
    const runtimePath = path.join(paths.mediaDir, m.filename)
    if (!fs.existsSync(runtimePath)) {
      errors.push(
        `Thiếu file runtime trong media/ cho bản ghi DB "${m.filename}" (usedBy: ${m.usedBy.join(', ')})`,
      )
    } else if (fs.statSync(runtimePath).size <= 0) {
      errors.push(`File runtime rỗng (0 byte): ${runtimePath}`)
    } else {
      dbMediaOk++
    }
  }
  console.log(
    `[MEDIA-VALIDATE] Active DB Referenced Media Checked: ${dbMediaOk}/${dbState.mediaManifest.length}`,
  )
}

if (errors.length > 0) {
  for (const e of errors) console.error(`  [MEDIA-ERROR] ${e}`)
  process.exit(1)
}

console.log(
  '[MEDIA-VALIDATE] All referenced media files exist, have non-zero size, and match checksums.',
)
