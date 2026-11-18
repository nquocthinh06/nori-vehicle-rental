import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import { adminHasPermission, resolveAdminPermissions } from '../src/access/nori.ts'
import { changedFieldSnapshots } from '../src/hooks/audit-nori.ts'
import {
  CURRENT_SCHEMA_VERSION,
  createFullBackup,
  exportSnapshots,
  extractDatabaseState,
  getDataSyncStatus,
  importSnapshots,
  restoreFromBackup,
  runDatabaseMigration,
  sha256File,
  validateSnapshotsAndMedia,
} from '../src/lib/data-sync.ts'
import { calculateRentalQuote, validatePromotionInput } from '../src/lib/rental-rules.ts'

describe('NORI Data Persistence, Synchronization, Media Storage & Team Workflow (DATA-01 .. DATA-35)', () => {
  let tmpRoot = ''
  let envADir = ''
  let envBDir = ''
  let sharedSnapshotsDir = ''
  let sharedSeedMediaDir = ''
  const projectRoot = process.cwd()

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-data-sync-test-'))
    envADir = path.join(tmpRoot, 'member-a')
    envBDir = path.join(tmpRoot, 'member-b')
    sharedSnapshotsDir = path.join(tmpRoot, 'git-repo', 'data', 'snapshots')
    sharedSeedMediaDir = path.join(tmpRoot, 'git-repo', 'media', 'seed')

    for (const dir of [envADir, envBDir, sharedSnapshotsDir, sharedSeedMediaDir]) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Copy canonical schema.sql and current snapshots into isolated git-repo simulation
    const repoSeedDir = path.join(tmpRoot, 'git-repo', 'data', 'seed')
    fs.mkdirSync(repoSeedDir, { recursive: true })
    fs.copyFileSync(
      path.join(projectRoot, 'data', 'seed', 'schema.sql'),
      path.join(repoSeedDir, 'schema.sql'),
    )

    // Copy snapshots from project root to isolated git-repo
    const srcSnapshots = path.join(projectRoot, 'data', 'snapshots')
    for (const f of fs.readdirSync(srcSnapshots)) {
      fs.copyFileSync(path.join(srcSnapshots, f), path.join(sharedSnapshotsDir, f))
    }

    // Copy media/seed subfolders to isolated git-repo
    const srcSharedMedia = path.join(projectRoot, 'media', 'seed')
    if (fs.existsSync(srcSharedMedia)) {
      fs.cpSync(srcSharedMedia, sharedSeedMediaDir, { recursive: true })
    }

    // Link/copy public/seed-media into isolated git-repo
    const destPublicSeed = path.join(tmpRoot, 'git-repo', 'public', 'seed-media')
    fs.mkdirSync(destPublicSeed, { recursive: true })
    fs.cpSync(path.join(projectRoot, 'public', 'seed-media'), destPublicSeed, {
      recursive: true,
    })
  })

  after(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      } catch {
        // Ignore Windows SQLite WAL handle release delay in temp folder
      }
    }
  })

  it('DATA-01 & DATA-02: Clone project into fresh environment A & initialize SQLite DB via migration', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    assert.equal(fs.existsSync(dbAPath), false, 'Fresh clone must not have pre-existing nori.db')

    const migRes = runDatabaseMigration({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
    })
    assert.equal(migRes.ok, true)
    assert.equal(migRes.schemaVersion, CURRENT_SCHEMA_VERSION)
    assert.equal(migRes.integrity, 'ok')
    assert.equal(migRes.fkViolations, 0)
    assert.ok(migRes.tablesCount >= 84, `Expected >= 84 tables, got ${migRes.tablesCount}`)
  })

  it('DATA-03 & DATA-29: Import starter snapshot & media into fresh clone A and verify all images on disk', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')
    const backupsADir = path.join(envADir, 'backups')

    const impRes = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
    })

    assert.equal(impRes.ok, true)
    assert.equal(impRes.status, 'SUCCESS')
    assert.ok(impRes.summary.toCreate >= 100)
    assert.ok(impRes.summary.mediaCopied >= 67)

    // Verify all 67 media files exist in Member A's runtime media/ folder with non-zero size and matching SHA-256
    const stateA = extractDatabaseState({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      mediaDir: mediaADir,
    })
    assert.equal(stateA.vehicleModels.length, 21)
    assert.equal(stateA.vehicles.length, 21)
    assert.equal(stateA.heroSlides.length, 5)
    assert.equal(stateA.mediaManifest.length, 67)

    for (const m of stateA.mediaManifest) {
      const runtimeFile = path.join(mediaADir, m.filename)
      assert.equal(fs.existsSync(runtimeFile), true, `Missing restored media file: ${m.filename}`)
      const stat = fs.statSync(runtimeFile)
      assert.ok(stat.size > 0, `Empty media file: ${m.filename}`)
      assert.equal(sha256File(runtimeFile), m.checksum, `Checksum mismatch for ${m.filename}`)
    }
  })

  it('DATA-14: Idempotent import — running import multiple times creates zero duplicates', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')
    const backupsADir = path.join(envADir, 'backups')

    const secondRun = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
      skipBackup: true,
    })
    assert.equal(secondRun.ok, true)
    assert.equal(secondRun.summary.toCreate, 0)
    assert.equal(secondRun.summary.toUpdate, 0)
    assert.equal(secondRun.summary.conflicts, 0)
    assert.equal(secondRun.summary.mediaCopied, 0)

    const thirdRun = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
      skipBackup: true,
    })
    assert.equal(thirdRun.ok, true)
    assert.equal(thirdRun.summary.toCreate, 0)
    assert.equal(thirdRun.summary.toUpdate, 0)
  })

  it('DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-30: Member B updates images, vehicles, specs, hero slider, banner, site content, price, and article -> exports -> Member A imports', () => {
    // Initialize Member B environment from the same baseline snapshot
    const dbBPath = path.join(envBDir, 'nori.db')
    const mediaBDir = path.join(envBDir, 'media')
    const backupsBDir = path.join(envBDir, 'backups')

    runDatabaseMigration({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbBPath,
    })
    const initB = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbBPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaBDir,
      backupsDir: backupsBDir,
      skipBackup: true,
    })
    assert.equal(initB.ok, true)

    // Member B performs Admin changes in DB B and mediaBDir:
    // 1. Upload a new custom image file in Member B's runtime media/ folder (DATA-06, DATA-07, DATA-08)
    const newMediaFilename = 'member-b-custom-hero-banner.webp'
    const existingSampleImg = path.join(
      tmpRoot,
      'git-repo',
      'public',
      'seed-media',
      'nori-hero-1.jpg',
    )
    // Create a unique binary payload by appending a comment byte so its SHA-256 is distinct from starter seed media
    const customImgBuf = Buffer.concat([
      fs.readFileSync(existingSampleImg),
      Buffer.from('NORI-MEMBER-B-UPLOAD-V1'),
    ])
    fs.writeFileSync(path.join(mediaBDir, newMediaFilename), customImgBuf)

    const dbB = new DatabaseSync(dbBPath)
    const nowB = new Date(Date.now() + 60_000).toISOString()
    const newMediaId = crypto.randomUUID()

    dbB
      .prepare(
        `INSERT INTO media (
          id, alt, url, filename, mime_type, filesize, width, height,
          focal_x, focal_y, source_name, media_category, verified, _stored,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'image/webp', ?, 1920, 1080, 50, 50, 'Member B Admin', 'ACTUAL_VEHICLE', 1, 1, ?, ?)`,
      )
      .run(
        newMediaId,
        'Ảnh mới do Thành viên B cập nhật từ Admin',
        `/api/media/file/${newMediaFilename}`,
        newMediaFilename,
        customImgBuf.length,
        nowB,
        nowB,
      )

    // 2. DATA-04: Add a new Demo Vehicle in Member B's DB
    const vf8Model = dbB
      .prepare("SELECT id FROM vehicle_models WHERE slug = 'vinfast-vf-8' LIMIT 1")
      .get()
    const newVehicleId = crypto.randomUUID()
    dbB
      .prepare(
        `INSERT INTO vehicles (
          id, reference, model_id, license_plate, intent, is_demo,
          vehicle_condition_type, manufacture_year, price_per_day, deposit_amount,
          km_limit_per_day, buffer_hours, sale_price, odometer, version, color,
          location, pickup_location, operation_status, status, created_at, updated_at
        ) VALUES (?, 'NR-OT-VF8-02', ?, '51K-99999', 'BOTH', 1, 'NEW', 2025, 1650000, 15000000, 300, 2, 960000000, 1200, 'Plus AWD', 'Trắng Ngọc Trai', 'TP. Hồ Chí Minh', 'Quận 1, TP.HCM', 'READY', 'ACTIVE', ?, ?)`,
      )
      .run(newVehicleId, vf8Model.id, nowB, nowB)
    dbB
      .prepare(
        `INSERT INTO vehicles_photos (_order, _parent_id, id, image_id, caption, kind, photo_type, is_primary, sort_order)
         VALUES (1, ?, ?, ?, 'Ảnh thực tế VF8 Plus do B chụp', 'EXTERIOR', 'ACTUAL', 1, 0)`,
      )
      .run(newVehicleId, crypto.randomUUID(), newMediaId)

    // 3. DATA-05 & DATA-06: Update VehicleModel specs & cover image
    dbB
      .prepare(
        "UPDATE vehicle_models SET short_description = 'Mô tả cập nhật bởi Thành viên B', cover_id = ?, updated_at = ? WHERE slug = 'vinfast-vf-8'",
      )
      .run(newMediaId, nowB)

    // 4. DATA-11: Update rental price of NR-OT-VF8-01
    dbB
      .prepare(
        "UPDATE vehicles SET price_per_day = 1580000, updated_at = ? WHERE reference = 'NR-OT-VF8-01'",
      )
      .run(nowB)

    // 5. DATA-07, DATA-08, DATA-09: Update Hero Slider image, Banner, and Website Content in nori_site
    dbB
      .prepare(
        "UPDATE nori_site SET home_intro_title = 'NORI — Hành trình chuẩn hóa bởi Thành viên B', updated_at = ?",
      )
      .run(nowB)
    dbB
      .prepare(
        'UPDATE nori_site_hero_slides SET title_first = ?, desktop_image_id = ? WHERE _order = 1',
      )
      .run('Hành trình mới cùng B.', newMediaId)
    dbB
      .prepare('UPDATE nori_site_hero_images SET image_id = ?, credit = ? WHERE _order = 1')
      .run(newMediaId, 'Banner mới từ Thành viên B')

    // 6. DATA-10: Create a published Article (Post) linked to promotion NORIXINCAMON
    const promo = dbB.prepare("SELECT id FROM promotions WHERE code = 'NORIXINCAMON' LIMIT 1").get()
    const newPostId = crypto.randomUUID()
    dbB
      .prepare(
        `INSERT INTO posts (
          id, slug, title, category, excerpt, content, cover_id, promotion_id,
          published_at, seo_title, seo_description, _status, created_at, updated_at
        ) VALUES (?, 'cam-nang-dong-bo-nori', 'Cẩm nang thuê xe NORI mới nhất', 'PROMOTION', 'Tóm tắt bài viết của B', 'Nội dung chi tiết bài viết do Thành viên B biên tập.', ?, ?, '2026-11-18', 'Cẩm nang NORI', 'SEO Description', 'published', ?, ?)`,
      )
      .run(newPostId, newMediaId, promo?.id ?? null, nowB, nowB)

    dbB.close()

    // Member B checks status before export -> must show unexported changes!
    const statusBeforeExport = getDataSyncStatus({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbBPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaBDir,
    })
    assert.equal(statusBeforeExport.inSyncWithSnapshot, false)
    assert.ok(statusBeforeExport.unexportedCount >= 5)

    // Member B exports snapshot & shared media to the shared git-repo folder
    const expRes = exportSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbBPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaBDir,
      sharedSeedMediaDir,
      actorEmail: 'member.b@nori.vn',
    })
    assert.equal(expRes.ok, true)
    assert.equal(expRes.counts.vehicles, 22)
    assert.equal(expRes.counts.articles, 1)
    assert.ok(expRes.copiedMediaFiles >= 1, 'Custom uploaded image must be copied to media/seed/')

    // Now Member A runs dry-run import first, then imports the new snapshot!
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')
    const backupsADir = path.join(envADir, 'backups')

    const dryA = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
      dryRun: true,
    })
    assert.equal(dryA.ok, true)
    assert.equal(dryA.status, 'DRY_RUN')
    assert.ok(dryA.summary.toCreate >= 3) // new media + new vehicle + new article
    assert.ok(dryA.summary.toUpdate >= 4) // updated model, vehicle price, site settings, slide, banner

    const impA = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
      actorEmail: 'member.a@nori.vn',
    })
    assert.equal(impA.ok, true)
    assert.equal(impA.status, 'SUCCESS')

    // Verify Member A now has the exact image file on disk and all updated records in DB A!
    assert.equal(
      fs.existsSync(path.join(mediaADir, newMediaFilename)),
      true,
      'Member A must receive Member B uploaded image file in media/',
    )
    const dbA = new DatabaseSync(dbAPath, { readOnly: true })
    const vf8PriceA = dbA
      .prepare("SELECT price_per_day FROM vehicles WHERE reference = 'NR-OT-VF8-01'")
      .get().price_per_day
    const newVehA = dbA
      .prepare(
        "SELECT reference, license_plate, price_per_day FROM vehicles WHERE reference = 'NR-OT-VF8-02'",
      )
      .get()
    const siteA = dbA.prepare('SELECT home_intro_title FROM nori_site LIMIT 1').get()
    const slide1A = dbA
      .prepare('SELECT title_first FROM nori_site_hero_slides WHERE _order = 1')
      .get()
    const postA = dbA
      .prepare("SELECT title, _status FROM posts WHERE slug = 'cam-nang-dong-bo-nori'")
      .get()
    dbA.close()

    assert.equal(vf8PriceA, 1580000)
    assert.equal(newVehA?.license_plate, '51K-99999')
    assert.equal(siteA?.home_intro_title, 'NORI — Hành trình chuẩn hóa bởi Thành viên B')
    assert.equal(slide1A?.title_first, 'Hành trình mới cùng B.')
    assert.equal(postA?.title, 'Cẩm nang thuê xe NORI mới nhất')
    assert.equal(postA?._status, 'published')
  })

  it('DATA-12, DATA-13, DATA-31, DATA-32: Accounts, RBAC roles/permissions, and business data persist across DB connection restarts', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const adminId = crypto.randomUUID()
    const customerId = crypto.randomUUID()
    const customPerms = {
      vehicles: ['read', 'update'],
      bookings: ['read', 'update'],
      content: ['read', 'update', 'publish'],
      settings: ['read', 'update'],
    }

    // Session 1: Create Admin with custom RBAC permissions and Customer account, then close connection
    {
      const db1 = new DatabaseSync(dbAPath)
      const now = new Date().toISOString()
      db1
        .prepare(
          `INSERT INTO admins (id, email, full_name, admin_role, permissions, salt, hash, login_attempts, created_at, updated_at)
           VALUES (?, 'operator.b@nori.vn', 'Nhân viên B', 'OPERATOR', ?, 'salt123', 'pbkdf2-sha256-v1:hash123', 0, ?, ?)`,
        )
        .run(adminId, JSON.stringify(customPerms), now, now)

      db1
        .prepare(
          `INSERT INTO users (id, email, full_name, phone, role, status, salt, hash, login_attempts, created_at, updated_at)
           VALUES (?, 'customer.test@nori.vn', 'Khách Hàng Kiểm Thử', '0901234567', 'CUSTOMER', 'ACTIVE', 'salt456', 'pbkdf2-sha256-v1:hash456', 0, ?, ?)`,
        )
        .run(customerId, now, now)
      db1.close()
    }

    // Session 2 (Simulating server restart / rebuild): Reopen DB and verify persistence & RBAC evaluation
    {
      const db2 = new DatabaseSync(dbAPath, { readOnly: true })
      const savedAdmin = db2
        .prepare('SELECT id, email, admin_role, permissions FROM admins WHERE id = ?')
        .get(adminId)
      const savedUser = db2
        .prepare('SELECT id, email, full_name, role, status FROM users WHERE id = ?')
        .get(customerId)
      db2.close()

      assert.equal(savedAdmin?.email, 'operator.b@nori.vn')
      assert.equal(savedAdmin?.admin_role, 'OPERATOR')
      const parsedPerms = JSON.parse(savedAdmin.permissions)
      const adminObj = {
        id: savedAdmin.id,
        collection: 'admins',
        adminRole: savedAdmin.admin_role,
        permissions: parsedPerms,
      }
      assert.deepEqual(resolveAdminPermissions(adminObj), customPerms)
      assert.equal(adminHasPermission(adminObj, 'content', 'publish'), true)
      assert.equal(adminHasPermission(adminObj, 'admins', 'delete'), false)

      assert.equal(savedUser?.email, 'customer.test@nori.vn')
      assert.equal(savedUser?.status, 'ACTIVE')
    }
  })

  it('DATA-20, DATA-21, DATA-33: Prevent exporting real users, bookings, password hashes, tokens, or real admin permissions to Git snapshots', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')

    // Export from DB A (which now contains operator.b@nori.vn and customer.test@nori.vn with password hashes!)
    const exp = exportSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      force: true,
    })
    assert.equal(exp.ok, true)

    // Inspect all generated snapshot files to confirm zero leakage of accounts, hashes, or PII
    for (const f of fs.readdirSync(sharedSnapshotsDir)) {
      const content = fs.readFileSync(path.join(sharedSnapshotsDir, f), 'utf8')
      assert.equal(content.includes('operator.b@nori.vn'), false, `Leaked admin email in ${f}`)
      assert.equal(content.includes('customer.test@nori.vn'), false, `Leaked user email in ${f}`)
      assert.equal(content.includes('pbkdf2-sha256-v1:'), false, `Leaked password hash in ${f}`)
    }

    // Now test that validateSnapshotsAndMedia catches injected sensitive data (DATA-20, DATA-21)
    const badSnapDir = path.join(tmpRoot, 'bad-snapshots-sensitive')
    fs.cpSync(sharedSnapshotsDir, badSnapDir, { recursive: true })
    const vehiclesPath = path.join(badSnapDir, 'vehicles.json')
    const vehiclesData = JSON.parse(fs.readFileSync(vehiclesPath, 'utf8'))
    vehiclesData[0].password = 'pbkdf2-sha256-v1:0123456789abcdef0123456789abcdef'
    vehiclesData[0].idCardNumber = '079099001122'
    fs.writeFileSync(vehiclesPath, JSON.stringify(vehiclesData), 'utf8')

    const report = validateSnapshotsAndMedia({
      rootDir: path.join(tmpRoot, 'git-repo'),
      snapshotsDir: badSnapDir,
    })
    assert.equal(report.ok, false)
    assert.ok(report.sensitiveViolations.length >= 2)
  })

  it('DATA-15 & DATA-16: Detect missing Media file and incompatible Schema Version before import', () => {
    const dbAPath = path.join(envADir, 'nori.db')

    // 1. Missing media file test (DATA-15)
    const missingMediaSnapDir = path.join(tmpRoot, 'bad-snapshots-media')
    fs.cpSync(sharedSnapshotsDir, missingMediaSnapDir, { recursive: true })
    const mmPath = path.join(missingMediaSnapDir, 'media-manifest.json')
    const mm = JSON.parse(fs.readFileSync(mmPath, 'utf8'))
    mm[0].repoPath = 'media/seed/vehicles/non-existent-ghost-image.webp'
    fs.writeFileSync(mmPath, JSON.stringify(mm), 'utf8')

    const resMissingMedia = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: missingMediaSnapDir,
    })
    assert.equal(resMissingMedia.ok, false)
    assert.equal(resMissingMedia.status, 'VALIDATION_FAILED')
    assert.ok(resMissingMedia.errors.some((e) => e.includes('non-existent-ghost-image.webp')))

    // 2. Incompatible schema version test (DATA-16)
    const badSchemaSnapDir = path.join(tmpRoot, 'bad-snapshots-schema')
    fs.cpSync(sharedSnapshotsDir, badSchemaSnapDir, { recursive: true })
    const manPath = path.join(badSchemaSnapDir, 'manifest.json')
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'))
    man.schemaVersion = 'nori-incompatible-schema-v0.0'
    fs.writeFileSync(manPath, JSON.stringify(man), 'utf8')

    const resBadSchema = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: badSchemaSnapDir,
    })
    assert.equal(resBadSchema.ok, false)
    assert.equal(resBadSchema.status, 'VALIDATION_FAILED')
    assert.ok(resBadSchema.errors.some((e) => e.includes('Phiên bản Schema không tương thích')))
  })

  it('DATA-17: Failed import rolls back transaction completely without losing existing data', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')

    const dbBefore = new DatabaseSync(dbAPath, { readOnly: true })
    const countBefore = dbBefore.prepare('SELECT count(*) as c FROM vehicles').get().c
    dbBefore.close()

    const failedImp = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      skipBackup: true,
      simulateFailure: true,
    })
    assert.equal(failedImp.ok, false)
    assert.equal(failedImp.status, 'ERROR')

    const dbAfter = new DatabaseSync(dbAPath, { readOnly: true })
    const countAfter = dbAfter.prepare('SELECT count(*) as c FROM vehicles').get().c
    const integrity = dbAfter.prepare('PRAGMA integrity_check').get().integrity_check
    dbAfter.close()

    assert.equal(countAfter, countBefore, 'Vehicle count must remain unchanged after rollback')
    assert.equal(integrity, 'ok')
  })

  it('DATA-18 & DATA-19 (Scenario 4): Detect data & image conflicts when Member A and Member B modify the same record concurrently', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const dbBPath = path.join(envBDir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')
    const mediaBDir = path.join(envBDir, 'media')

    // Member B modifies NR-OT-FTN01 pricePerDay to 1490000 and changes its photo in B, then exports Snapshot
    const dbB = new DatabaseSync(dbBPath)
    const ftnB = dbB.prepare("SELECT id FROM vehicles WHERE reference = 'NR-OT-FTN01'").get()
    const mediaRowsB = dbB
      .prepare('SELECT id, filename FROM media ORDER BY filename ASC LIMIT 3')
      .all()
    const mediaB = mediaRowsB[1]
    const futureTimeB = new Date(Date.now() + 120_000).toISOString()
    dbB
      .prepare('UPDATE vehicles SET price_per_day = 1490000, updated_at = ? WHERE id = ?')
      .run(futureTimeB, ftnB.id)
    if (mediaB) {
      dbB
        .prepare('UPDATE vehicles_photos SET image_id = ? WHERE _parent_id = ? AND _order = 1')
        .run(mediaB.id, ftnB.id)
    }
    dbB.close()

    exportSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbBPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaBDir,
      sharedSeedMediaDir,
      force: true,
    })

    // Meanwhile, Member A independently modifies NR-OT-FTN01 pricePerDay to 1620000 and changes its photo in A!
    const dbA = new DatabaseSync(dbAPath)
    const ftnA = dbA.prepare("SELECT id FROM vehicles WHERE reference = 'NR-OT-FTN01'").get()
    const mediaRowsA = dbA
      .prepare('SELECT id, filename FROM media ORDER BY filename ASC LIMIT 3')
      .all()
    const mediaA = mediaRowsA[2]
    const futureTimeA = new Date(Date.now() + 180_000).toISOString()
    dbA
      .prepare('UPDATE vehicles SET price_per_day = 1620000, updated_at = ? WHERE id = ?')
      .run(futureTimeA, ftnA.id)
    if (mediaA) {
      dbA
        .prepare('UPDATE vehicles_photos SET image_id = ? WHERE _parent_id = ? AND _order = 1')
        .run(mediaA.id, ftnA.id)
    }
    dbA.close()

    // Default import (onConflict = 'abort') MUST detect conflict and refuse to overwrite!
    const conflictRes = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      skipBackup: true,
    })
    assert.equal(conflictRes.ok, false)
    assert.equal(conflictRes.status, 'CONFLICT')
    assert.ok(conflictRes.conflicts.length >= 1)
    const ftnConflict = conflictRes.conflicts.find((c) => c.key === 'NR-OT-FTN01')
    assert.ok(ftnConflict, 'Must report conflict on NR-OT-FTN01')
    assert.ok(ftnConflict.changedFields.includes('pricePerDay'))
    assert.equal(
      ftnConflict.mediaConflict,
      true,
      'Must flag mediaConflict=true when photos diverge',
    )

    // Verify Member A's local price (1620000) was NOT overwritten!
    const checkLocalA = new DatabaseSync(dbAPath, { readOnly: true })
    assert.equal(
      checkLocalA
        .prepare("SELECT price_per_day FROM vehicles WHERE reference = 'NR-OT-FTN01'")
        .get().price_per_day,
      1620000,
    )
    checkLocalA.close()

    // Now resolve conflict using --on-conflict=prefer-snapshot
    const resolvedRes = importSnapshots({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      snapshotsDir: sharedSnapshotsDir,
      mediaDir: mediaADir,
      onConflict: 'prefer-snapshot',
      skipBackup: true,
    })
    assert.equal(resolvedRes.ok, true)
    assert.equal(resolvedRes.status, 'SUCCESS')

    const checkMergedA = new DatabaseSync(dbAPath, { readOnly: true })
    assert.equal(
      checkMergedA
        .prepare("SELECT price_per_day FROM vehicles WHERE reference = 'NR-OT-FTN01'")
        .get().price_per_day,
      1490000,
    )
    checkMergedA.close()
  })

  it('DATA-24, DATA-25, DATA-26 (Scenario 5): Backup, simulate disaster/deletion of DB & media, Restore, and verify Migration preserves all data', () => {
    const dbAPath = path.join(envADir, 'nori.db')
    const mediaADir = path.join(envADir, 'media')
    const backupsADir = path.join(envADir, 'backups')

    // 1. Create consistent full backup (DB + Media + Manifest)
    const backupRes = createFullBackup({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
      mediaDir: mediaADir,
      backupsDir: backupsADir,
      actorEmail: 'admin@nori.vn',
    })
    assert.equal(backupRes.ok, true)
    assert.equal(backupRes.manifest.integrityCheck, 'ok')
    assert.ok(backupRes.manifest.mediaFiles.length >= 67)

    // 2. Simulate disaster: delete vehicles in DB A and delete a media file from mediaADir
    const deletedMediaFile = path.join(mediaADir, 'member-b-custom-hero-banner.webp')
    if (fs.existsSync(deletedMediaFile)) fs.unlinkSync(deletedMediaFile)

    const dbCorrupt = new DatabaseSync(dbAPath)
    dbCorrupt.prepare('DELETE FROM vehicles_photos').run()
    dbCorrupt.prepare("DELETE FROM vehicles WHERE reference = 'NR-OT-VF8-02'").run()
    dbCorrupt.close()

    // 3. Restore from the backup created in step 1
    const restoreRes = restoreFromBackup({
      rootDir: path.join(tmpRoot, 'git-repo'),
      sourceBackup: backupRes.backupId,
      targetDbPath: dbAPath,
      targetMediaDir: mediaADir,
      backupsDir: backupsADir,
      skipPreBackup: true,
      actorEmail: 'admin@nori.vn',
    })
    assert.equal(restoreRes.ok, true)
    assert.ok(restoreRes.restoredMediaCount >= 67)
    assert.equal(
      fs.existsSync(deletedMediaFile),
      true,
      'Deleted media file must be restored from backup bundle',
    )

    // 4. Verify restored DB has NR-OT-VF8-02 and photos intact, then run db:migrate (DATA-26)
    const migAfterRestore = runDatabaseMigration({
      rootDir: path.join(tmpRoot, 'git-repo'),
      dbPath: dbAPath,
    })
    assert.equal(migAfterRestore.ok, true)

    const dbVerify = new DatabaseSync(dbAPath, { readOnly: true })
    const restoredVeh = dbVerify
      .prepare("SELECT reference FROM vehicles WHERE reference = 'NR-OT-VF8-02'")
      .get()
    const totalVehicles = dbVerify.prepare('SELECT count(*) as c FROM vehicles').get().c
    dbVerify.close()

    assert.equal(restoredVeh?.reference, 'NR-OT-VF8-02')
    assert.equal(totalVehicles, 22)
  })

  it('DATA-22, DATA-23, DATA-27, DATA-28, DATA-34, DATA-35: Verify Audit Logs, Production Import Guard, PWA Cache Policy, E2E Isolation, and Rental Rules after sync', () => {
    const dbAPath = path.join(envADir, 'nori.db')

    // DATA-23: Verify Audit Log sanitization & entries in DB
    const snapDiff = changedFieldSnapshots(
      { pricePerDay: 1450000, password: 'secret-old', hash: 'pbkdf2-sha256-v1:old' },
      { pricePerDay: 1580000, password: 'secret-new', hash: 'pbkdf2-sha256-v1:new' },
      { pricePerDay: 'Giá thuê/ngày', password: 'Mật khẩu', hash: 'Hash' },
    )
    assert.deepEqual(snapDiff.labels, ['Giá thuê/ngày'])
    assert.equal(snapDiff.fromSummary.includes('secret'), false)
    assert.equal(snapDiff.toSummary.includes('pbkdf2'), false)
    assert.equal(snapDiff.fromSummary, 'pricePerDay=1450000')
    assert.equal(snapDiff.toSummary, 'pricePerDay=1580000')

    const dbA = new DatabaseSync(dbAPath, { readOnly: true })
    const syncLogs = dbA
      .prepare(
        "SELECT action, entity, to_status FROM audit_logs WHERE entity IN ('data-sync', 'backup')",
      )
      .all()
    dbA.close()
    assert.ok(syncLogs.length >= 2, 'Audit log must contain data-sync / backup entries')

    // DATA-34: Production guard blocks automatic import when NORI_ENV=production
    const prevEnv = process.env.NORI_ENV
    process.env.NORI_ENV = 'production'
    try {
      const blockedProd = importSnapshots({
        rootDir: path.join(tmpRoot, 'git-repo'),
        dbPath: dbAPath,
        snapshotsDir: sharedSnapshotsDir,
      })
      assert.equal(blockedProd.ok, false)
      assert.ok(blockedProd.errors[0].includes('Production'))
    } finally {
      if (prevEnv === undefined) delete process.env.NORI_ENV
      else process.env.NORI_ENV = prevEnv
    }

    // DATA-28: Verify Service Worker (public/sw.js) never caches /api/media or /nori-api
    const swContent = fs.readFileSync(path.join(projectRoot, 'public', 'sw.js'), 'utf8')
    assert.ok(swContent.includes("'/api'"), 'Service worker must exclude /api from caching')
    assert.ok(
      swContent.includes("'/nori-api'"),
      'Service worker must exclude /nori-api from caching',
    )

    // DATA-27: Verify E2E runner uses isolated DB nori-e2e-isolated.db
    const e2eRunnerContent = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'run-e2e-isolated.mjs'),
      'utf8',
    )
    assert.ok(e2eRunnerContent.includes('nori-e2e-isolated.db'))

    // DATA-35: Verify rental quote & promotion business logic on synced vehicle data
    const quote = calculateRentalQuote({
      dailyPrice: 1580000,
      weekendSurcharge: 150000,
      vehicleDeposit: 15000000,
      vehicleDeliveryFee: 150000,
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      deliveryRequested: true,
      addonKeys: [],
    })
    assert.equal(quote.totalDays, 4)
    assert.ok(quote.estimatedTotal > 0)
    assert.equal(quote.depositAmount, 15000000)

    const promoCheck = validatePromotionInput(
      {
        code: 'NORIXINCAMON',
        name: 'Mùa đông không lạnh cùng với Nori',
        discountType: 'PERCENT',
        discountValue: 10,
        maxDiscount: 300000,
        minDays: 2,
        appliesTo: 'RENT',
        validFrom: '2026-11-17',
        validTo: '2026-12-31',
        usageLimit: 100,
        active: true,
      },
      1,
    )
    assert.equal(promoCheck.error, undefined)
    assert.equal(promoCheck.normalized?.code, 'NORIXINCAMON')
  })
})
