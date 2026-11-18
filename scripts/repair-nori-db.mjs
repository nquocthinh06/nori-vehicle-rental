import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CRITICAL_TABLES = [
  'bookings',
  'payments',
  'promotions',
  'posts',
  'vehicles',
  'vehicle_models',
  'admins',
  'users',
  'media',
  'audit_logs',
]

function parseArgs(argv) {
  const opts = {
    dbPath: path.resolve(process.cwd(), 'nori.db'),
    apply: false,
    verifyRollback: false,
    noBackup: false,
    logPath: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--db' && argv[i + 1]) {
      opts.dbPath = path.resolve(process.cwd(), argv[++i])
    } else if (arg === '--apply') {
      opts.apply = true
    } else if (arg === '--dry-run') {
      opts.apply = false
    } else if (arg === '--verify-rollback') {
      opts.verifyRollback = true
    } else if (arg === '--no-backup') {
      opts.noBackup = true
    } else if (arg === '--log' && argv[i + 1]) {
      opts.logPath = path.resolve(process.cwd(), argv[++i])
    }
  }
  return opts
}

function getTableCounts(db) {
  const counts = {}
  for (const table of CRITICAL_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get()
    counts[table] = Number(row?.c ?? 0)
  }
  return counts
}

function resolveMediaDiskPath(filename) {
  if (!filename) return null
  const candidates = [
    path.resolve(process.cwd(), 'media', filename),
    path.resolve(process.cwd(), 'public', 'media', filename),
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

function collectPlan(db) {
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all()
  const unexpectedTables = [
    ...new Set(
      fkViolations
        .map((v) => String(v.table))
        .filter(
          (t) =>
            t !== '_nori_site_v_version_hero_slides' && t !== '_media_v' && t !== 'audit_logs_rels',
        ),
    ),
  ]
  if (unexpectedTables.length > 0) {
    throw new Error(
      `Unexpected FK violations outside allowlisted repair tables: ${unexpectedTables.join(', ')}`,
    )
  }

  const orphanHeroSlides = db
    .prepare(
      `SELECT s.rowid, s.id, s._parent_id, s._order, s.title_first, s.desktop_image_id, s.mobile_image_id,
              EXISTS(SELECT 1 FROM media m WHERE m.id = s.desktop_image_id) AS desktop_ok,
              CASE WHEN s.mobile_image_id IS NULL THEN 1
                   ELSE EXISTS(SELECT 1 FROM media m WHERE m.id = s.mobile_image_id) END AS mobile_ok,
              v.latest AS parent_latest, v.version__status AS parent_status, v.updated_at AS parent_updated_at
       FROM _nori_site_v_version_hero_slides s
       LEFT JOIN _nori_site_v v ON v.id = s._parent_id
       WHERE (s.desktop_image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media m WHERE m.id = s.desktop_image_id))
          OR (s.mobile_image_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM media m WHERE m.id = s.mobile_image_id))
       ORDER BY s.rowid`,
    )
    .all()

  const orphanMediaVersions = db
    .prepare(
      `SELECT mv.rowid, mv.id, mv.parent_id, mv.version_filename, mv.version_alt, mv.updated_at
       FROM _media_v mv
       WHERE mv.parent_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM media m WHERE m.id = mv.parent_id)
       ORDER BY mv.rowid`,
    )
    .all()

  const orphanAuditRels = db
    .prepare(
      `SELECT r.id AS rowid, r.parent_id, r.path, r.users_id,
              a.action, a.entity, a.actor_email, a.summary, a.created_at
       FROM audit_logs_rels r
       LEFT JOIN audit_logs a ON a.id = r.parent_id
       WHERE (r.users_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.users_id))
          OR (r.admins_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM admins ad WHERE ad.id = r.admins_id))
          OR NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.id = r.parent_id)
       ORDER BY r.id`,
    )
    .all()

  const liveSlide1 = db
    .prepare('SELECT * FROM nori_site_hero_slides ORDER BY _order ASC LIMIT 1')
    .get()
  const latestVersion = db
    .prepare(
      'SELECT id, latest, version__status, updated_at FROM _nori_site_v WHERE latest = 1 LIMIT 1',
    )
    .get()
  const latestSlide1 = latestVersion
    ? db
        .prepare(
          'SELECT * FROM _nori_site_v_version_hero_slides WHERE _parent_id = ? ORDER BY _order ASC LIMIT 1',
        )
        .get(latestVersion.id)
    : null

  const cleanSource = db
    .prepare(
      `SELECT s.*, v.updated_at AS source_updated_at, v.version__status AS source_status,
              m.filename AS desktop_filename, m.alt AS desktop_alt
       FROM _nori_site_v_version_hero_slides s
       JOIN _nori_site_v v ON v.id = s._parent_id
       JOIN media m ON m.id = s.desktop_image_id
       WHERE s._order = 1
         AND s.title_first = 'Mọi hành trình.'
         AND v.version__status = 'published'
       ORDER BY v.updated_at DESC
       LIMIT 1`,
    )
    .get()

  let heroSlidePlan = null
  const isTestTitle = (val) => typeof val === 'string' && /^Hero Test\b/i.test(val.trim())
  const needsLiveRestore = Boolean(liveSlide1 && isTestTitle(liveSlide1.title_first))
  const needsLatestRestore = Boolean(latestSlide1 && isTestTitle(latestSlide1.title_first))

  if (cleanSource && (needsLiveRestore || needsLatestRestore)) {
    const diskPath = resolveMediaDiskPath(cleanSource.desktop_filename)
    if (!diskPath) {
      throw new Error(
        `Historical Slide #1 desktop image file missing on disk: ${cleanSource.desktop_filename}`,
      )
    }
    heroSlidePlan = {
      sourceVersionId: cleanSource._parent_id,
      sourceSlideId: cleanSource.id,
      sourceUpdatedAt: cleanSource.source_updated_at,
      desktopFilename: cleanSource.desktop_filename,
      desktopDiskVerified: Boolean(diskPath),
      targetLiveSlideId: isTestTitle(liveSlide1?.title_first) ? liveSlide1.id : null,
      targetLatestVersionId: needsLatestRestore ? latestVersion.id : null,
      targetLatestSlideId: needsLatestRestore ? latestSlide1.id : null,
      beforeLive: liveSlide1
        ? {
            title_first: liveSlide1.title_first,
            title_second: liveSlide1.title_second,
            desktop_image_id: liveSlide1.desktop_image_id,
            mobile_image_id: liveSlide1.mobile_image_id,
            focal_x: liveSlide1.focal_x,
            focal_y: liveSlide1.focal_y,
          }
        : null,
      after: {
        title_first: cleanSource.title_first,
        title_second: cleanSource.title_second,
        eyebrow: cleanSource.eyebrow,
        category_badge: cleanSource.category_badge,
        description: cleanSource.description,
        cta_text: cleanSource.cta_text,
        cta_href: cleanSource.cta_href,
        secondary_text: cleanSource.secondary_text,
        secondary_href: cleanSource.secondary_href,
        desktop_image_id: cleanSource.desktop_image_id,
        mobile_image_id: cleanSource.mobile_image_id,
        related_category: cleanSource.related_category,
        related_model_id: cleanSource.related_model_id,
        credit: cleanSource.credit,
        source_url: cleanSource.source_url,
        duration_seconds: cleanSource.duration_seconds,
        active: cleanSource.active,
        focal_x: cleanSource.focal_x,
        focal_y: cleanSource.focal_y,
        mobile_focal_x: cleanSource.mobile_focal_x,
        mobile_focal_y: cleanSource.mobile_focal_y,
      },
    }
  } else if (needsLiveRestore) {
    throw new Error(
      'Live Slide #1 looks corrupted by test text, but clean historical source was not found.',
    )
  }

  return {
    fkViolationsCount: fkViolations.length,
    orphanHeroSlides,
    orphanMediaVersions,
    orphanAuditRels,
    heroSlidePlan,
  }
}

function applyPlanInTransaction(db, plan, preCounts) {
  let repairedFkColumns = 0
  let deletedAuditRels = 0
  let heroSlidesUpdated = 0

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const row of plan.orphanHeroSlides) {
      if (!row.desktop_ok && row.desktop_image_id !== null) {
        db.prepare(
          'UPDATE _nori_site_v_version_hero_slides SET desktop_image_id = NULL WHERE rowid = ?',
        ).run(row.rowid)
        repairedFkColumns += 1
      }
      if (!row.mobile_ok && row.mobile_image_id !== null) {
        db.prepare(
          'UPDATE _nori_site_v_version_hero_slides SET mobile_image_id = NULL WHERE rowid = ?',
        ).run(row.rowid)
        repairedFkColumns += 1
      }
    }

    for (const row of plan.orphanMediaVersions) {
      db.prepare('UPDATE _media_v SET parent_id = NULL WHERE rowid = ?').run(row.rowid)
      repairedFkColumns += 1
    }

    for (const row of plan.orphanAuditRels) {
      db.prepare('DELETE FROM audit_logs_rels WHERE id = ?').run(row.rowid)
      deletedAuditRels += 1
    }

    if (plan.heroSlidePlan) {
      const a = plan.heroSlidePlan.after
      const cols = [
        'title_first',
        'title_second',
        'eyebrow',
        'category_badge',
        'description',
        'cta_text',
        'cta_href',
        'secondary_text',
        'secondary_href',
        'desktop_image_id',
        'mobile_image_id',
        'related_category',
        'related_model_id',
        'credit',
        'source_url',
        'duration_seconds',
        'active',
        'focal_x',
        'focal_y',
        'mobile_focal_x',
        'mobile_focal_y',
      ]
      const assignments = cols.map((c) => `"${c}" = ?`).join(', ')
      const values = cols.map((c) => a[c] ?? null)

      if (plan.heroSlidePlan.targetLiveSlideId) {
        db.prepare(`UPDATE nori_site_hero_slides SET ${assignments} WHERE id = ?`).run(
          ...values,
          plan.heroSlidePlan.targetLiveSlideId,
        )
        heroSlidesUpdated += 1
      }
      if (plan.heroSlidePlan.targetLatestSlideId) {
        db.prepare(`UPDATE _nori_site_v_version_hero_slides SET ${assignments} WHERE id = ?`).run(
          ...values,
          plan.heroSlidePlan.targetLatestSlideId,
        )
        heroSlidesUpdated += 1
      }
    }

    const postIntegrity = db.prepare('PRAGMA integrity_check').get()
    if (!postIntegrity || postIntegrity.integrity_check !== 'ok') {
      throw new Error(`Post-repair integrity_check failed: ${JSON.stringify(postIntegrity)}`)
    }
    const postFk = db.prepare('PRAGMA foreign_key_check').all()
    if (postFk.length > 0) {
      throw new Error(
        `Post-repair foreign_key_check non-empty (${postFk.length}): ${JSON.stringify(postFk)}`,
      )
    }

    const postCounts = getTableCounts(db)
    for (const table of CRITICAL_TABLES) {
      if (postCounts[table] !== preCounts[table]) {
        throw new Error(
          `Row count mismatch on "${table}": before=${preCounts[table]} after=${postCounts[table]}`,
        )
      }
    }

    db.exec('COMMIT')
    return {
      repairedFkColumns,
      deletedAuditRels,
      heroSlidesUpdated,
      postIntegrity: postIntegrity.integrity_check,
      postFkCount: postFk.length,
      postCounts,
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // Ignore rollback errors if transaction already aborted
    }
    throw error
  }
}

function createBackup(db, dbPath) {
  const backupsDir = path.resolve(process.cwd(), 'backups')
  fs.mkdirSync(backupsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const baseName = path.basename(dbPath, path.extname(dbPath))
  const backupPath = path.join(backupsDir, `${baseName}-pre-repair-${stamp}.db`)
  const sanitized = backupPath.replace(/\\/g, '/')
  db.exec(`VACUUM INTO '${sanitized}'`)
  const verifyDb = new DatabaseSync(backupPath, { readOnly: true })
  try {
    const check = verifyDb.prepare('PRAGMA integrity_check').get()
    if (!check || check.integrity_check !== 'ok') {
      throw new Error(`Backup verification failed: ${JSON.stringify(check)}`)
    }
  } finally {
    verifyDb.close()
  }
  return backupPath
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(opts.dbPath)) {
    throw new Error(`Database not found: ${opts.dbPath}`)
  }

  const walExists = fs.existsSync(`${opts.dbPath}-wal`)
  const shmExists = fs.existsSync(`${opts.dbPath}-shm`)
  const db = new DatabaseSync(opts.dbPath, { readOnly: !opts.apply })

  try {
    if (opts.apply) {
      db.exec('PRAGMA busy_timeout = 5000')
    }
    const preIntegrity = db.prepare('PRAGMA integrity_check').get()
    if (!preIntegrity || preIntegrity.integrity_check !== 'ok') {
      throw new Error(`Pre-repair integrity_check failed: ${JSON.stringify(preIntegrity)}`)
    }

    const preCounts = getTableCounts(db)
    const plan = collectPlan(db)

    let backupPath = null
    let rollbackVerified = null
    if (opts.verifyRollback) {
      const tmpCopy = `${opts.dbPath}.rollback-verify-${Date.now()}.tmp`
      fs.copyFileSync(opts.dbPath, tmpCopy)
      try {
        const tmpDb = new DatabaseSync(tmpCopy)
        try {
          const beforeSlide = tmpDb
            .prepare('SELECT title_first FROM nori_site_hero_slides ORDER BY _order ASC LIMIT 1')
            .get()?.title_first
          tmpDb.exec('BEGIN IMMEDIATE')
          tmpDb
            .prepare(
              "UPDATE nori_site_hero_slides SET title_first = '__ROLLBACK_PROBE__' WHERE _order = 1",
            )
            .run()
          tmpDb
            .prepare(
              'DELETE FROM audit_logs_rels WHERE id IN (SELECT id FROM audit_logs_rels LIMIT 1)',
            )
            .run()
          tmpDb.exec('ROLLBACK')
          const afterSlide = tmpDb
            .prepare('SELECT title_first FROM nori_site_hero_slides ORDER BY _order ASC LIMIT 1')
            .get()?.title_first
          const tmpFk = tmpDb.prepare('PRAGMA foreign_key_check').all()
          rollbackVerified = {
            tested: true,
            titleRestoredOnRollback: beforeSlide === afterSlide,
            fkCheckPreserved: tmpFk.length === plan.fkViolationsCount,
          }
        } finally {
          tmpDb.close()
        }
      } finally {
        if (fs.existsSync(tmpCopy)) fs.unlinkSync(tmpCopy)
      }
    }

    let applyResult = null
    if (opts.apply) {
      if (!opts.noBackup) {
        backupPath = createBackup(db, opts.dbPath)
      }
      applyResult = applyPlanInTransaction(db, plan, preCounts)
    }

    const summary = {
      mode: opts.apply ? 'APPLY' : 'DRY_RUN',
      timestamp: new Date().toISOString(),
      dbPath: opts.dbPath,
      sidecarFiles: { walExists, shmExists },
      preIntegrity: preIntegrity.integrity_check,
      preFkViolationsCount: plan.fkViolationsCount,
      preCounts,
      plannedChanges: {
        nullifyHeroVersionMediaRefs: plan.orphanHeroSlides.map((r) => ({
          rowid: r.rowid,
          id: r.id,
          parentVersionId: r._parent_id,
          titleFirst: r.title_first,
          nullifyDesktopMediaId: r.desktop_ok ? null : r.desktop_image_id,
          nullifyMobileMediaId: r.mobile_ok ? null : r.mobile_image_id,
        })),
        nullifyMediaVersionParents: plan.orphanMediaVersions.map((r) => ({
          rowid: r.rowid,
          id: r.id,
          missingParentId: r.parent_id,
          versionFilename: r.version_filename,
        })),
        deleteOrphanAuditLogRels: plan.orphanAuditRels.map((r) => ({
          auditLogRelId: r.rowid,
          auditLogId: r.parent_id,
          path: r.path,
          missingUserId: r.users_id,
          action: r.action,
          actorEmail: r.actor_email,
          createdAt: r.created_at,
        })),
        restoreHeroSlide1: plan.heroSlidePlan,
      },
      backupPath,
      rollbackVerified,
      applyResult,
    }

    const logTarget =
      opts.logPath ||
      (opts.apply
        ? path.resolve(
            process.cwd(),
            'backups',
            `repair-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
          )
        : null)
    if (logTarget) {
      fs.mkdirSync(path.dirname(logTarget), { recursive: true })
      fs.writeFileSync(logTarget, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
      summary.logFile = logTarget
    }

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    db.close()
  }
}

main()
