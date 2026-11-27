import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  canonicalJson,
  createFullBackup,
  exportSnapshots,
  extractDatabaseState,
  getDataSyncStatus,
  importSnapshots,
  resolvePaths,
  validateSnapshotsAndMedia,
} from '../src/lib/data-sync.ts'

function parseArg(flag) {
  const eqArg = process.argv.find((a) => a.startsWith(`${flag}=`))
  if (eqArg) return eqArg.slice(flag.length + 1)
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

function writeCatalogueMetadataManifests({ dbPath, rootDir, modelFilter, manufacturerFilter }) {
  const paths = resolvePaths({ rootDir, dbPath })
  if (!fs.existsSync(paths.dbPath)) return null

  const state = extractDatabaseState({ rootDir: paths.rootDir, dbPath: paths.dbPath })
  const models = state.vehicleModels.filter((m) => {
    if (modelFilter && m.slug !== modelFilter) return false
    if (manufacturerFilter && m.brand.toLowerCase() !== manufacturerFilter.toLowerCase()) {
      return false
    }
    return true
  })

  const outDir = path.join(paths.rootDir, 'data', 'vehicle-catalogue')
  fs.mkdirSync(outDir, { recursive: true })

  const sourcesManifest = models.map((m) => ({
    slug: m.slug,
    name: m.name,
    brand: m.brand,
    category: m.category,
    subCategory: m.subCategory,
    modelYear: m.modelYear,
    verificationStatus: m.verificationStatus,
    visible: m.visible,
    source: m.source,
    specsCount: Array.isArray(m.specifications) ? m.specifications.length : 0,
    featuresCount: Array.isArray(m.features) ? m.features.length : 0,
    galleryCount: Array.isArray(m.gallery) ? m.gallery.length : 0,
    variantsCount: Array.isArray(m.variants) ? m.variants.length : 0,
    recordHash: m.recordHash,
  }))

  const manifestJson = canonicalJson(sourcesManifest)
  const manifestSha = crypto.createHash('sha256').update(manifestJson).digest('hex').slice(0, 24)
  const versionPayload = {
    schemaVersion: 'nori-catalogue-v1',
    contentHash: manifestSha,
    modelCount: sourcesManifest.length,
    verifiedCount: sourcesManifest.filter((m) => m.verificationStatus === 'VERIFIED').length,
    generatedAt: new Date().toISOString(),
  }

  fs.writeFileSync(path.join(outDir, 'catalogue-sync-manifest.json'), manifestJson, 'utf8')
  if (!fs.existsSync(path.join(outDir, 'sources-manifest.json'))) {
    fs.writeFileSync(path.join(outDir, 'sources-manifest.json'), manifestJson, 'utf8')
  }
  if (!fs.existsSync(path.join(outDir, 'catalogue-version.json'))) {
    fs.writeFileSync(
      path.join(outDir, 'catalogue-version.json'),
      canonicalJson(versionPayload),
      'utf8',
    )
  }
  return { outDir, count: sourcesManifest.length, contentHash: manifestSha }
}

const subcommand = (process.argv[2] || 'status').toLowerCase()
const dbPath = parseArg('--db')
const snapshotsDir = parseArg('--snapshots')
const mediaDir = parseArg('--media')
const backupsDir = parseArg('--backups')
const modelFilter = parseArg('--model')
const manufacturerFilter = parseArg('--manufacturer')
const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const jsonMode = process.argv.includes('--json')
const conflictArg = parseArg('--on-conflict')
const onConflict =
  conflictArg === 'keep-local' || conflictArg === 'prefer-snapshot' ? conflictArg : 'abort'

if (subcommand === 'validate') {
  const report = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(
      `[CATALOGUE-VALIDATE] ok=${report.ok} files=${report.checkedFiles} media=${report.mediaChecked} schema=${report.schemaVersion}`,
    )
    if (!report.ok) {
      for (const err of [
        ...report.schemaErrors,
        ...report.sensitiveViolations,
        ...report.referentialErrors,
        ...report.mediaErrors,
      ]) {
        console.error(`  - ${err}`)
      }
    }
  }
  process.exit(report.ok ? 0 : 1)
} else if (subcommand === 'export') {
  const res = exportSnapshots({ dbPath, snapshotsDir, mediaDir, force })
  const meta = writeCatalogueMetadataManifests({
    dbPath,
    rootDir: process.cwd(),
    modelFilter,
    manufacturerFilter,
  })
  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshotVersion: res.snapshotVersion,
        counts: res.counts,
        catalogueManifest: meta,
      },
      null,
      2,
    ),
  )
} else if (subcommand === 'import') {
  const res = importSnapshots({
    dbPath,
    snapshotsDir,
    mediaDir,
    backupsDir,
    dryRun,
    onConflict,
  })
  console.log(JSON.stringify(res, null, 2))
  process.exit(res.ok ? 0 : 1)
} else if (subcommand === 'sync') {
  const val = validateSnapshotsAndMedia({ dbPath, snapshotsDir, mediaDir })
  if (!val.ok) {
    console.error('[CATALOGUE-SYNC] Validation failed:', val)
    process.exit(1)
  }
  const dry = importSnapshots({
    dbPath,
    snapshotsDir,
    mediaDir,
    backupsDir,
    dryRun: true,
    onConflict,
  })
  if (!dry.ok) {
    console.error('[CATALOGUE-SYNC] Dry-run conflict/error:', dry.errors, dry.conflicts)
    process.exit(1)
  }
  if (dryRun) {
    console.log(JSON.stringify(dry, null, 2))
    process.exit(0)
  }
  const imp = importSnapshots({
    dbPath,
    snapshotsDir,
    mediaDir,
    backupsDir,
    dryRun: false,
    onConflict,
  })
  const meta = writeCatalogueMetadataManifests({
    dbPath,
    rootDir: process.cwd(),
    modelFilter,
    manufacturerFilter,
  })
  console.log(JSON.stringify({ ok: imp.ok, import: imp.summary, catalogueManifest: meta }, null, 2))
  process.exit(imp.ok ? 0 : 1)
} else if (subcommand === 'backup') {
  const res = createFullBackup({ dbPath, mediaDir, backupsDir })
  console.log(
    JSON.stringify(
      {
        ok: res.ok,
        backupId: res.backupId,
        dbBackupPath: res.dbBackupPath,
        integrity: res.manifest.integrityCheck,
        mediaCount: res.manifest.mediaFiles.length,
      },
      null,
      2,
    ),
  )
} else if (subcommand === 'status') {
  const status = getDataSyncStatus({ dbPath, snapshotsDir, mediaDir, backupsDir })
  const paths = resolvePaths({ rootDir: process.cwd(), dbPath })
  const dbState = fs.existsSync(paths.dbPath)
    ? extractDatabaseState({ rootDir: paths.rootDir, dbPath: paths.dbPath })
    : null
  const models = (dbState?.vehicleModels ?? [])
    .filter((m) => {
      if (modelFilter && m.slug !== modelFilter) return false
      if (manufacturerFilter && m.brand.toLowerCase() !== manufacturerFilter.toLowerCase()) {
        return false
      }
      return true
    })
    .map((m) => ({
      slug: m.slug,
      brand: m.brand,
      category: m.category,
      modelYear: m.modelYear,
      verificationStatus: m.verificationStatus,
      specs: Array.isArray(m.specifications) ? m.specifications.length : 0,
      gallery: Array.isArray(m.gallery) ? m.gallery.length : 0,
      variants: Array.isArray(m.variants) ? m.variants.length : 0,
    }))

  if (jsonMode) {
    console.log(JSON.stringify({ syncStatus: status, models }, null, 2))
  } else {
    console.log('=== NORI VEHICLE CATALOGUE STATUS ===')
    console.log(`Schema Version:      ${status.schemaVersion}`)
    console.log(`Snapshot Version:    ${status.snapshotVersion ?? 'none'}`)
    console.log(`In Sync w/ Snapshot: ${status.inSyncWithSnapshot}`)
    console.log(`Catalogue Models:    ${models.length}`)
    for (const m of models) {
      console.log(
        `  - ${m.slug} (${m.brand}, ${m.category}, ${m.modelYear ?? 'n/a'}) [${m.verificationStatus}] specs=${m.specs} gallery=${m.gallery} variants=${m.variants}`,
      )
    }
  }
} else {
  console.error(
    `Unknown subcommand "${subcommand}". Expected: validate | export | import | sync | backup | status`,
  )
  process.exit(1)
}
