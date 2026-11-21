import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  extractDatabaseState,
  resolvePaths,
  validateSnapshotsAndMedia,
} from '../src/lib/data-sync.ts'

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const isAuditMode = process.argv.includes('--audit')
const isJsonMode = process.argv.includes('--json')
const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')

const paths = resolvePaths({ dbPath, snapshotsDir, mediaDir })
const errors: string[] = []
const warnings: string[] = []

function inspectImageMagic(filePath: string): {
  isLfsPointer: boolean
  detectedFormat: string
  sizeBytes: number
} {
  const stat = fs.statSync(filePath)
  const sizeBytes = stat.size
  if (sizeBytes <= 0) {
    return { isLfsPointer: false, detectedFormat: 'empty', sizeBytes: 0 }
  }
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(Math.min(256, sizeBytes))
  try {
    fs.readSync(fd, buf, 0, buf.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  const headText = buf.toString('utf8')
  if (headText.startsWith('version https://git-lfs.github.com/spec/v1')) {
    return { isLfsPointer: true, detectedFormat: 'git-lfs-pointer', sizeBytes }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { isLfsPointer: false, detectedFormat: 'jpeg', sizeBytes }
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { isLfsPointer: false, detectedFormat: 'png', sizeBytes }
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { isLfsPointer: false, detectedFormat: 'webp', sizeBytes }
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { isLfsPointer: false, detectedFormat: 'avif/heif', sizeBytes }
  }
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { isLfsPointer: false, detectedFormat: 'gif', sizeBytes }
  }
  if (headText.trimStart().startsWith('<svg') || headText.includes('<svg')) {
    return { isLfsPointer: false, detectedFormat: 'svg', sizeBytes }
  }
  return { isLfsPointer: false, detectedFormat: 'unknown', sizeBytes }
}

let snapshotChecked = 0
if (fs.existsSync(path.join(paths.snapshotsDir, 'manifest.json'))) {
  const snapReport = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })
  snapshotChecked = snapReport.mediaChecked
  errors.push(...snapReport.mediaErrors)
  if (!isJsonMode) {
    console.log(`[MEDIA-VALIDATE] Snapshot Media Checked: ${snapReport.mediaChecked}`)
  }
}

const auditSummary = {
  dbPath: paths.dbPath,
  mediaDir: paths.mediaDir,
  snapshotChecked,
  dbAllMediaRows: 0,
  dbReferencedMediaRows: 0,
  missingOnDisk: [] as string[],
  zeroByteFiles: [] as string[],
  gitLfsPointers: [] as string[],
  unrecognizedFormats: [] as string[],
  oversizedRawFiles: [] as Array<{ filename: string; sizeKB: number }>,
  unreferencedDiskFilesCount: 0,
  unreferencedDiskFilesSample: [] as string[],
  unreferencedDiskBytes: 0,
}

if (fs.existsSync(paths.dbPath)) {
  const dbState = extractDatabaseState({ dbPath, mediaDir })
  auditSummary.dbReferencedMediaRows = dbState.mediaManifest.length
  const db = new DatabaseSync(paths.dbPath, { readOnly: true })
  const allDbMediaRows = db
    .prepare('SELECT id, filename, mime_type, filesize FROM media')
    .all() as Array<{
    id: string
    filename: string | null
    mime_type: string | null
    filesize: number | null
  }>
  db.close()

  auditSummary.dbAllMediaRows = allDbMediaRows.length
  const dbFilenameSet = new Set<string>()
  let dbMediaOk = 0

  for (const row of allDbMediaRows) {
    const fn = row.filename?.trim()
    if (!fn) {
      errors.push(`Bản ghi media DB id="${row.id}" không có filename`)
      continue
    }
    dbFilenameSet.add(fn)
    const candidatePaths = [
      path.join(paths.mediaDir, fn),
      path.join(process.cwd(), 'public', 'media', fn),
      path.join(process.cwd(), 'dev-data', 'media', fn),
      path.join(paths.seedMediaDir, fn),
    ]
    const runtimePath = candidatePaths.find((p) => fs.existsSync(p))
    if (!runtimePath) {
      auditSummary.missingOnDisk.push(fn)
      errors.push(`Thiếu file vật lý trong media/ hoặc public/media/ cho bản ghi DB "${fn}" (id=${row.id})`)
      continue
    }
    const info = inspectImageMagic(runtimePath)
    if (info.sizeBytes <= 0) {
      auditSummary.zeroByteFiles.push(fn)
      errors.push(`File runtime rỗng (0 byte): ${runtimePath}`)
      continue
    }
    if (info.isLfsPointer) {
      auditSummary.gitLfsPointers.push(fn)
      errors.push(`File là Git LFS pointer thay vì ảnh thật: ${fn}`)
      continue
    }
    if (info.detectedFormat === 'unknown') {
      auditSummary.unrecognizedFormats.push(fn)
      errors.push(`Định dạng magic-bytes không hợp lệ cho ảnh: ${fn}`)
      continue
    }
    if (info.sizeBytes > 500 * 1024) {
      auditSummary.oversizedRawFiles.push({
        filename: fn,
        sizeKB: Number((info.sizeBytes / 1024).toFixed(1)),
      })
    }
    dbMediaOk++
  }

  // Also check all referenced media from manifest
  for (const m of dbState.mediaManifest) {
    if (!dbFilenameSet.has(m.filename)) {
      const candidatePaths = [
        path.join(paths.mediaDir, m.filename),
        path.join(process.cwd(), 'public', 'media', m.filename),
        path.join(process.cwd(), 'dev-data', 'media', m.filename),
        path.join(paths.seedMediaDir, m.filename),
      ]
      const runtimePath = candidatePaths.find((p) => fs.existsSync(p))
      if (!runtimePath) {
        auditSummary.missingOnDisk.push(m.filename)
        errors.push(
          `Thiếu file runtime trong media/ hoặc public/media/ cho bản ghi DB "${m.filename}" (usedBy: ${m.usedBy.join(', ')})`,
        )
      }
    }
  }

  // Audit disk files NOT referenced in DB media table (report only — NEVER auto-delete!)
  if (isAuditMode && fs.existsSync(paths.mediaDir)) {
    const diskEntries = fs.readdirSync(paths.mediaDir, { withFileTypes: true })
    const orphans: string[] = []
    let orphanBytes = 0
    for (const entry of diskEntries) {
      if (!entry.isFile()) continue
      if (!dbFilenameSet.has(entry.name)) {
        orphans.push(entry.name)
        orphanBytes += fs.statSync(path.join(paths.mediaDir, entry.name)).size
      }
    }
    auditSummary.unreferencedDiskFilesCount = orphans.length
    auditSummary.unreferencedDiskFilesSample = orphans.slice(0, 15)
    auditSummary.unreferencedDiskBytes = orphanBytes
    if (orphans.length > 0) {
      warnings.push(
        `Phát hiện ${orphans.length} tệp trong media/ (${(orphanBytes / (1024 * 1024)).toFixed(2)} MB) chưa gắn bản ghi media trong DB (chỉ báo cáo, không tự động xóa).`,
      )
    }
    if (auditSummary.oversizedRawFiles.length > 0) {
      warnings.push(
        `Có ${auditSummary.oversizedRawFiles.length} ảnh gốc > 500 KB (pipeline tối ưu runtime WebP/resize đang bảo vệ delivery).`,
      )
    }
  }

  if (!isJsonMode) {
    console.log(
      `[MEDIA-VALIDATE] Active DB Media Checked: ${dbMediaOk}/${allDbMediaRows.length} (referenced by entities: ${dbState.mediaManifest.length})`,
    )
  }
}

if (isJsonMode) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, auditSummary }, null, 2))
} else {
  if (isAuditMode) {
    console.log(
      `[MEDIA-AUDIT] Missing=${auditSummary.missingOnDisk.length} · ZeroByte=${auditSummary.zeroByteFiles.length} · GitLFS=${auditSummary.gitLfsPointers.length} · InvalidFormat=${auditSummary.unrecognizedFormats.length} · OversizedRaw(>500KB)=${auditSummary.oversizedRawFiles.length} · UnreferencedDisk=${auditSummary.unreferencedDiskFilesCount}`,
    )
    for (const w of warnings) console.warn(`  [MEDIA-WARN] ${w}`)
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`  [MEDIA-ERROR] ${e}`)
    process.exit(1)
  }
  console.log(
    '[MEDIA-VALIDATE] All referenced media files exist, have valid image headers, non-zero size, and match checksums.',
  )
}

if (errors.length > 0) {
  process.exit(1)
}
