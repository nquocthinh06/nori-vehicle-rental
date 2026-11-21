import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const rootDir = path.resolve(dirname, '..')

const devMediaDir = path.resolve(rootDir, 'dev-data', 'media')
const publicMediaDir = path.resolve(rootDir, 'public', 'media')

function isRealBinary(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size === 0) return false
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(Math.min(256, stat.size))
    try {
      fs.readSync(fd, buf, 0, buf.length, 0)
    } finally {
      fs.closeSync(fd)
    }
    const head = buf.toString('utf8')
    if (head.startsWith('version https://git-lfs')) return false
    return true
  } catch {
    return false
  }
}

export function syncPublicMedia() {
  if (!fs.existsSync(publicMediaDir)) {
    fs.mkdirSync(publicMediaDir, { recursive: true })
  }

  if (!fs.existsSync(devMediaDir)) {
    console.warn('[SYNC-PUBLIC-MEDIA] dev-data/media does not exist. Skipping.')
    return { count: 0, synced: 0, skipped: 0 }
  }

  const devFiles = new Set(fs.readdirSync(devMediaDir))
  let synced = 0
  let skipped = 0

  for (const f of devFiles) {
    const srcFile = path.join(devMediaDir, f)
    const destFile = path.join(publicMediaDir, f)

    if (!isRealBinary(srcFile)) continue

    const srcStat = fs.statSync(srcFile)
    let needsCopy = true
    if (fs.existsSync(destFile)) {
      const destStat = fs.statSync(destFile)
      if (destStat.size === srcStat.size && isRealBinary(destFile)) {
        needsCopy = false
        skipped++
      }
    }

    if (needsCopy) {
      fs.copyFileSync(srcFile, destFile)
      synced++
    }
  }

  // Remove stale files in public/media that are not in dev-data/media
  const currentPublic = fs.readdirSync(publicMediaDir)
  let removed = 0
  for (const f of currentPublic) {
    if (!devFiles.has(f)) {
      try {
        fs.unlinkSync(path.join(publicMediaDir, f))
        removed++
      } catch {
        // ignore
      }
    }
  }

  const finalPublic = fs.readdirSync(publicMediaDir)
  console.log(`[SYNC-PUBLIC-MEDIA] public/media synchronized: ${finalPublic.length} files (copied: ${synced}, unchanged: ${skipped}, purged stale: ${removed}).`)
  return { count: finalPublic.length, synced, skipped, removed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncPublicMedia()
}
