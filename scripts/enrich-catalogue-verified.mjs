import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ICE_ONLY_SPEC_PATTERNS = [
  /dung tích bình xăng/i,
  /bình xăng/i,
  /xi-lanh/i,
  /dung tích xi-lanh/i,
  /tiêu hao nhiên liệu/i,
  /mức tiêu thụ nhiên liệu/i,
  /động cơ đốt trong/i,
]

const CAR_INTERIOR_SPEC_PATTERNS = [
  /khoang hành lý/i,
  /dung tích cốp xe ô tô/i,
  /hàng ghế/i,
  /cửa sổ trời/i,
  /điều hòa 2 vùng/i,
  /điều hòa 3 vùng/i,
]

function parseArgs(argv) {
  let dryRun = false
  let dbPath = 'nori.db'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--db' && argv[i + 1]) {
      dbPath = argv[++i]
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice(5)
    }
  }
  return { dryRun, dbPath: path.resolve(process.cwd(), dbPath) }
}

function stableHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

function main() {
  const { dryRun, dbPath } = parseArgs(process.argv.slice(2))
  const enrichmentPath = path.resolve(
    process.cwd(),
    'data',
    'vehicle-catalogue',
    'verified-enrichment.json',
  )

  if (!fs.existsSync(dbPath)) {
    console.error(`[enrich-catalogue] Database not found: ${dbPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(enrichmentPath)) {
    console.error(`[enrich-catalogue] Enrichment file not found: ${enrichmentPath}`)
    process.exit(1)
  }

  const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, 'utf8'))
  const db = new DatabaseSync(dbPath, { readOnly: dryRun })

  try {
    const vmCols = new Set(
      db
        .prepare('PRAGMA table_info(vehicle_models)')
        .all()
        .map((c) => c.name),
    )

    const hasImportCols =
      vmCols.has('import_source_url') &&
      vmCols.has('import_source_type') &&
      vmCols.has('import_source_hash') &&
      vmCols.has('last_imported_at')

    const nowIso = new Date().toISOString()
    const stats = {
      dryRun,
      dbPath,
      hasImportCols,
      modelsScanned: 0,
      modelsUpdated: 0,
      modelsUnchanged: 0,
      modelsMissing: [],
      iceSpecsRemovedFromEv: 0,
      carSpecsRemovedFromMotorbike: 0,
      mediaUpdated: 0,
      galleryMetaUpdated: 0,
      integrityCheck: 'skipped',
      fkViolations: 0,
    }

    if (!dryRun) {
      db.exec('BEGIN IMMEDIATE')
    }

    try {
      const findModel = db.prepare('SELECT * FROM vehicle_models WHERE slug = ?')
      const getSpecs = db.prepare(
        'SELECT id, "group", label, value FROM vehicle_models_specifications WHERE _parent_id = ?',
      )
      const deleteSpec = db.prepare('DELETE FROM vehicle_models_specifications WHERE id = ?')

      for (const entry of enrichment.models) {
        stats.modelsScanned += 1
        const row = findModel.get(entry.slug)
        if (!row) {
          stats.modelsMissing.push(entry.slug)
          continue
        }

        const entryHash = stableHash({
          officialName: entry.officialName,
          modelLine: entry.modelLine,
          versionName: entry.versionName,
          generation: entry.generation,
          shortDescription: entry.shortDescription,
          source: entry.source,
        })

        const changes = {}
        if ((row.official_name ?? null) !== entry.officialName) {
          changes.official_name = entry.officialName
        }
        if ((row.model_line ?? null) !== entry.modelLine) {
          changes.model_line = entry.modelLine
        }
        if ((row.version_name ?? null) !== entry.versionName) {
          changes.version_name = entry.versionName
        }
        if ((row.generation ?? null) !== entry.generation) {
          changes.generation = entry.generation
        }
        if ((row.short_description ?? null) !== entry.shortDescription) {
          changes.short_description = entry.shortDescription
        }
        if ((row.source ?? null) !== entry.source) {
          changes.source = entry.source
        }

        if (hasImportCols) {
          if ((row.import_source_url ?? null) !== entry.source) {
            changes.import_source_url = entry.source
          }
          if ((row.import_source_type ?? null) !== entry.importSourceType) {
            changes.import_source_type = entry.importSourceType
          }
          if ((row.import_source_hash ?? null) !== entryHash) {
            changes.import_source_hash = entryHash
            changes.last_imported_at = nowIso
          }
        }

        const changeKeys = Object.keys(changes)
        if (changeKeys.length > 0) {
          stats.modelsUpdated += 1
          if (!dryRun) {
            const setClause = changeKeys.map((k) => `"${k}" = ?`).join(', ')
            const values = changeKeys.map((k) => changes[k])
            db.prepare(`UPDATE vehicle_models SET ${setClause} WHERE id = ?`).run(...values, row.id)
          }
        } else {
          stats.modelsUnchanged += 1
        }

        // Enforce domain-type spec hygiene (EV has zero ICE specs; Motorbike has zero car-interior specs)
        const specs = getSpecs.all(row.id)
        for (const s of specs) {
          const label = String(s.label ?? '')
          if (
            row.fuel_type === 'Điện (EV)' &&
            ICE_ONLY_SPEC_PATTERNS.some((re) => re.test(label))
          ) {
            stats.iceSpecsRemovedFromEv += 1
            if (!dryRun) deleteSpec.run(s.id)
          } else if (
            row.category === 'MOTORBIKE' &&
            CAR_INTERIOR_SPEC_PATTERNS.some((re) => re.test(label))
          ) {
            stats.carSpecsRemovedFromMotorbike += 1
            if (!dryRun) deleteSpec.run(s.id)
          }
        }
      }

      // Apply traceable media metadata fixes without deleting any files or rows
      const findMedia = db.prepare('SELECT * FROM media WHERE filename = ?')
      for (const fix of enrichment.mediaMetadataFixes ?? []) {
        const mediaRow = findMedia.get(fix.filename)
        if (!mediaRow) continue
        const mediaChanges = {}
        if (fix.alt && mediaRow.alt !== fix.alt) mediaChanges.alt = fix.alt
        if (fix.sourceUrl && (mediaRow.source_url ?? null) !== fix.sourceUrl) {
          mediaChanges.source_url = fix.sourceUrl
        }
        if (fix.license && (mediaRow.license ?? null) !== fix.license) {
          mediaChanges.license = fix.license
        }
        if (fix.mediaCategory && mediaRow.media_category !== fix.mediaCategory) {
          mediaChanges.media_category = fix.mediaCategory
        }
        const mKeys = Object.keys(mediaChanges)
        if (mKeys.length > 0) {
          stats.mediaUpdated += 1
          if (!dryRun) {
            const setClause = mKeys.map((k) => `"${k}" = ?`).join(', ')
            db.prepare(`UPDATE media SET ${setClause} WHERE id = ?`).run(
              ...mKeys.map((k) => mediaChanges[k]),
              mediaRow.id,
            )
          }
        }
      }

      // Sync traceable sourceUrl/license on vehicle_models_gallery rows referencing fixed media
      const evoMaxMedia = findMedia.get('xe-dien-vinfast-evo-max-1.jpg')
      if (evoMaxMedia) {
        const galRows = db
          .prepare(
            "SELECT id, source_url, license FROM vehicle_models_gallery WHERE image_id = ? AND (source_url IS NULL OR source_url = '' OR license IS NULL OR license = '')",
          )
          .all(evoMaxMedia.id)
        for (const g of galRows) {
          stats.galleryMetaUpdated += 1
          if (!dryRun) {
            db.prepare(
              'UPDATE vehicle_models_gallery SET source_url = ?, license = ? WHERE id = ?',
            ).run('https://vinfastauto.com/vn_vi', 'Tư liệu tham chiếu hãng (VinFast VN)', g.id)
          }
        }
      }

      if (!dryRun) {
        db.exec('COMMIT')
      }
    } catch (err) {
      if (!dryRun) {
        db.exec('ROLLBACK')
      }
      throw err
    }

    const ic = db.prepare('PRAGMA integrity_check').get()
    const fks = db.prepare('PRAGMA foreign_key_check').all()
    stats.integrityCheck = ic?.integrity_check ?? 'unknown'
    stats.fkViolations = fks.length

    if (stats.integrityCheck !== 'ok' || stats.fkViolations > 0) {
      console.error('[enrich-catalogue] Integrity check failed:', stats)
      process.exit(1)
    }

    console.log(JSON.stringify(stats, null, 2))
  } finally {
    db.close()
  }
}

main()
