import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { resolveMediaDir } from '../src/lib/env.ts'
import { loadDotEnvIfAbsent } from '../src/lib/pg-replication.ts'

loadDotEnvIfAbsent()

function parseArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const isVerify = process.argv.includes('--verify')
const isRestore = process.argv.includes('--restore')
const isJson = process.argv.includes('--json')
const mediaDir = parseArg('--media') ? path.resolve(parseArg('--media')) : resolveMediaDir()
const backupRoot = parseArg('--out-dir')
  ? path.resolve(parseArg('--out-dir'))
  : path.resolve(process.cwd(), 'backups', 'media')
const restoreTo = parseArg('--to') ? path.resolve(parseArg('--to')) : null

function sha256File(filePath) {
  const h = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(65536)
  try {
    let n = 0
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.subarray(0, n))
    }
  } finally {
    fs.closeSync(fd)
  }
  return h.digest('hex')
}

function inspectImageMagic(filePath) {
  const stat = fs.statSync(filePath)
  if (stat.size <= 0) return { ok: false, reason: 'zero-byte' }
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(Math.min(128, stat.size))
  try {
    fs.readSync(fd, buf, 0, buf.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  const head = buf.toString('utf8')
  if (head.startsWith('version https://git-lfs.github.com/spec/v1')) {
    return { ok: false, reason: 'git-lfs-pointer' }
  }
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const isPng =
    buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isWebp =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  const isAvif = buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp'
  const isGif = buf.subarray(0, 4).toString('ascii') === 'GIF8'
  const isSvg = head.trimStart().startsWith('<svg') || head.includes('<svg')
  if (isJpeg || isPng || isWebp || isAvif || isGif || isSvg) {
    return { ok: true, reason: 'valid-image' }
  }
  return { ok: false, reason: 'unrecognized-magic-bytes' }
}

function collectFilesRecursive(dir, baseDir = dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.tmp') || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFilesRecursive(full, baseDir, out)
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).replaceAll('\\', '/')
      out.push({ fullPath: full, relPath: rel })
    }
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

function runBackup() {
  if (!fs.existsSync(mediaDir)) {
    throw new Error(`[MEDIA-BACKUP] Source media directory does not exist: ${mediaDir}`)
  }
  const objectsDir = path.join(backupRoot, 'files')
  const manifestPath = path.join(backupRoot, 'media-manifest.json')
  fs.mkdirSync(objectsDir, { recursive: true })

  let prevMap = new Map()
  if (fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      for (const f of prev.files || []) {
        prevMap.set(f.relPath, f)
      }
    } catch {
      prevMap = new Map()
    }
  }

  const files = collectFilesRecursive(mediaDir)
  let copied = 0
  let skippedUnchanged = 0
  const corruptFiles = []
  const manifestFiles = []

  for (const item of files) {
    const stat = fs.statSync(item.fullPath)
    const magic = inspectImageMagic(item.fullPath)
    if (!magic.ok) {
      corruptFiles.push({ relPath: item.relPath, reason: magic.reason })
      continue
    }
    const sha256 = sha256File(item.fullPath)
    const destPath = path.join(objectsDir, item.relPath)
    const prev = prevMap.get(item.relPath)

    if (
      prev &&
      prev.sha256 === sha256 &&
      prev.size === stat.size &&
      fs.existsSync(destPath) &&
      fs.statSync(destPath).size === stat.size
    ) {
      skippedUnchanged++
    } else {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(item.fullPath, destPath)
      copied++
    }

    manifestFiles.push({
      relPath: item.relPath,
      size: stat.size,
      sha256,
    })
  }

  const manifest = {
    formatVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    sourceMediaDir: mediaDir,
    cloudProvider: process.env.BLOB_READ_WRITE_TOKEN?.trim()
      ? 'VERCEL_BLOB'
      : process.env.S3_BUCKET?.trim()
        ? 'S3'
        : 'LOCAL_FS',
    totalFiles: manifestFiles.length,
    totalBytes: manifestFiles.reduce((acc, f) => acc + f.size, 0),
    corruptSkipped: corruptFiles.length,
    files: manifestFiles,
  }

  const tmpManifest = `${manifestPath}.tmp.${process.pid}`
  fs.writeFileSync(tmpManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  fs.renameSync(tmpManifest, manifestPath)

  const result = {
    ok: corruptFiles.length === 0,
    action: 'backup',
    mediaDir,
    backupRoot,
    totalScanned: files.length,
    backedUpTotal: manifestFiles.length,
    copied,
    skippedUnchanged,
    corruptFiles,
  }

  if (isJson) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(
      `[MEDIA-BACKUP] Total=${result.backedUpTotal} | Copied=${copied} | UnchangedSkipped=${skippedUnchanged} | Corrupt=${corruptFiles.length}`,
    )
    for (const c of corruptFiles) console.error(`  ! Corrupt media: ${c.relPath} (${c.reason})`)
  }
  if (!result.ok) process.exit(1)
}

function runVerify() {
  const manifestPath = path.join(backupRoot, 'media-manifest.json')
  const objectsDir = path.join(backupRoot, 'files')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[MEDIA-BACKUP] Missing manifest at ${manifestPath}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const missing = []
  const checksumMismatch = []

  for (const f of manifest.files || []) {
    const p = path.join(objectsDir, f.relPath)
    if (!fs.existsSync(p)) {
      missing.push(f.relPath)
      continue
    }
    const actual = sha256File(p)
    if (actual !== f.sha256) {
      checksumMismatch.push(f.relPath)
    }
  }

  const ok = missing.length === 0 && checksumMismatch.length === 0
  const result = {
    ok,
    action: 'verify',
    checked: (manifest.files || []).length,
    missing,
    checksumMismatch,
  }
  if (isJson) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(
      `[MEDIA-BACKUP-VERIFY] Checked=${result.checked} | Missing=${missing.length} | ChecksumMismatch=${checksumMismatch.length}`,
    )
  }
  if (!ok) process.exit(1)
}

function runRestore() {
  if (!restoreTo) {
    throw new Error('[MEDIA-RESTORE] Specify target directory via --to <dir>')
  }
  const manifestPath = path.join(backupRoot, 'media-manifest.json')
  const objectsDir = path.join(backupRoot, 'files')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[MEDIA-RESTORE] Missing manifest at ${manifestPath}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  fs.mkdirSync(restoreTo, { recursive: true })

  let restored = 0
  for (const f of manifest.files || []) {
    const src = path.join(objectsDir, f.relPath)
    if (!fs.existsSync(src)) {
      throw new Error(`[MEDIA-RESTORE] Missing backup object: ${f.relPath}`)
    }
    const actual = sha256File(src)
    if (actual !== f.sha256) {
      throw new Error(`[MEDIA-RESTORE] Checksum mismatch for ${f.relPath}`)
    }
    const dst = path.join(restoreTo, f.relPath)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    restored++
  }

  const result = { ok: true, action: 'restore', restoredTo: restoreTo, restoredFiles: restored }
  if (isJson) console.log(JSON.stringify(result, null, 2))
  else console.log(`[MEDIA-RESTORE] Restored ${restored} verified file(s) -> ${restoreTo}`)
}

try {
  if (isRestore) runRestore()
  else if (isVerify) runVerify()
  else runBackup()
} catch (err) {
  console.error('[MEDIA-BACKUP] Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}
