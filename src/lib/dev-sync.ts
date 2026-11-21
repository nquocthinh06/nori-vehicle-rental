import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CURRENT_SCHEMA_VERSION, runDatabaseMigration } from './data-sync.ts'
import { resolveBackupDir, resolveMediaDir, resolveSqlitePath } from './env.ts'

export interface DevSyncPaths {
  rootDir: string
  activeDbPath: string
  activeMediaDir: string
  devDataDir: string
  snapshotDbPath: string
  snapshotMediaDir: string
  manifestPath: string
  localSyncStatePath: string
  backupsDir: string
}

export interface DevSyncManifest {
  snapshotVersion: string
  schemaVersion: string
  exportedAt: string
  dbSha256: string
  dbSizeBytes: number
  counts: Record<string, number>
  mediaCount: number
  mediaFiles: Array<{
    filename: string
    size: number
    sha256: string
  }>
}

export interface DevSyncState {
  lastSyncType: 'export' | 'import'
  snapshotVersion: string
  dbSha256: string
  localDbSha: string
  timestamp: string
  localDbPath: string
}

export interface DevSyncVerificationReport {
  ok: boolean
  snapshotExists: boolean
  manifestExists: boolean
  dbIntegrity: string
  foreignKeysOk: boolean
  mediaOk: boolean
  missingMediaFiles: string[]
  noTempFilesOk: boolean
  tempFilesFound: string[]
  localStatus: 'IN_SYNC' | 'AHEAD' | 'BEHIND' | 'CONFLICT' | 'NO_LOCAL_DB'
  localDbPath: string
  counts?: Record<string, number>
  errors: string[]
  warnings: string[]
}

export function sha256Buffer(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath))
}

export function resolveDevSyncPaths(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  devDataDir?: string
}): DevSyncPaths {
  const rootDir = path.resolve(options?.rootDir || process.cwd())
  const activeDbPath = options?.dbPath
    ? path.resolve(rootDir, options.dbPath)
    : resolveSqlitePath(rootDir)
  const activeMediaDir = options?.mediaDir
    ? path.resolve(rootDir, options.mediaDir)
    : resolveMediaDir(rootDir)
  const devDataDir = options?.devDataDir
    ? path.resolve(rootDir, options.devDataDir)
    : path.join(rootDir, 'dev-data')
  const snapshotDbPath = path.join(devDataDir, 'database', 'nori-dev.db')
  const snapshotMediaDir = path.join(devDataDir, 'media')
  const manifestPath = path.join(devDataDir, 'manifest.json')
  const localSyncStatePath = path.join(rootDir, 'data', 'runtime', 'dev-sync-state.json')
  const backupsDir = resolveBackupDir(rootDir)

  return {
    rootDir,
    activeDbPath,
    activeMediaDir,
    devDataDir,
    snapshotDbPath,
    snapshotMediaDir,
    manifestPath,
    localSyncStatePath,
    backupsDir,
  }
}

/**
 * Prepares a test database baseline for automated tests.
 * Resolves in order:
 * 1. process.env.TEST_DB_BASELINE
 * 2. dev-data/database/nori-dev.db (tracked dev database snapshot)
 * 3. active dev database via resolveSqlitePath()
 * 4. root nori.db
 * If none exists, initializes a fresh schema and minimal test seed records.
 */
export function prepareTestDatabaseBaseline(
  targetDbPath: string,
  rootDir = process.cwd(),
): { source: string; vehiclesCount: number; usersCount: number } {
  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true })

  const candidatePaths: string[] = []
  if (process.env.TEST_DB_BASELINE?.trim()) {
    candidatePaths.push(path.resolve(rootDir, process.env.TEST_DB_BASELINE.trim()))
  }
  candidatePaths.push(path.join(rootDir, 'dev-data', 'database', 'nori-dev.db'))
  candidatePaths.push(resolveSqlitePath(rootDir))
  candidatePaths.push(path.join(rootDir, 'nori.db'))

  let foundSource: string | null = null
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
      foundSource = candidate
      break
    }
  }

  if (foundSource) {
    try {
      const srcDb = new DatabaseSync(foundSource)
      try {
        srcDb.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {}
      srcDb.close()
    } catch {}

    fs.copyFileSync(foundSource, targetDbPath)

    // Remove any leftover temporary journal/wal for the target
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const p = `${targetDbPath}${suffix}`
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p)
        } catch {}
      }
    }

    const testDb = new DatabaseSync(targetDbPath)
    const vehCount =
      (testDb.prepare('SELECT COUNT(*) as c FROM vehicles').get() as { c?: number })?.c ?? 0
    const usrCount =
      (testDb.prepare('SELECT COUNT(*) as c FROM users').get() as { c?: number })?.c ?? 0
    testDb.close()

    return { source: foundSource, vehiclesCount: vehCount, usersCount: usrCount }
  }

  // Fallback: create fresh test database with schema and minimal test records
  runDatabaseMigration({ dbPath: targetDbPath, rootDir })
  const fallbackDb = new DatabaseSync(targetDbPath)
  const now = new Date().toISOString()
  const dummyModelId = crypto.randomUUID()
  const dummyVehicleId = crypto.randomUUID()
  const dummyUserId = crypto.randomUUID()
  const dummyAdminId = crypto.randomUUID()

  fallbackDb.exec('BEGIN IMMEDIATE')
  try {
    fallbackDb
      .prepare(
        `INSERT OR IGNORE INTO vehicle_models (
          id, name, slug, brand, category, body_style, status, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dummyModelId,
        'NORI Test Model',
        'nori-test-model',
        'VinFast',
        'CAR',
        'SUV',
        'ACTIVE',
        now,
        now,
      )

    fallbackDb
      .prepare(
        `INSERT OR IGNORE INTO vehicles (
          id, model_id, reference, license_plate, status, price_per_day, deposit_amount, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dummyVehicleId,
        dummyModelId,
        'NORI-TEST-001',
        '51A-999.99',
        'ACTIVE',
        800000,
        5000000,
        now,
        now,
      )

    fallbackDb
      .prepare(
        `INSERT OR IGNORE INTO users (
          id, email, full_name, role, status, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dummyUserId,
        'test-customer@nori.vn',
        'Khách hàng thử nghiệm',
        'CUSTOMER',
        'ACTIVE',
        now,
        now,
      )

    fallbackDb
      .prepare(
        `INSERT OR IGNORE INTO admins (
          id, email, admin_role, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(dummyAdminId, 'admin@nori.vn', 'SUPER_ADMIN', now, now)

    fallbackDb.exec('COMMIT')
  } catch (err) {
    fallbackDb.exec('ROLLBACK')
    throw err
  } finally {
    fallbackDb.close()
  }

  return { source: 'fresh-seeded-baseline', vehiclesCount: 1, usersCount: 1 }
}

const CORE_COLLECTION_TABLES = [
  'admins',
  'users',
  'branches',
  'warehouses',
  'service_locations',
  'branch_staff',
  'vehicle_models',
  'vehicles',
  'delivery_zones',
  'location_pricing_rules',
  'maintenance_schedules',
  'rental_days',
  'bookings',
  'consultations',
  'notifications',
  'sales_inquiries',
  'promotions',
  'payments',
  'payment_events',
  'refunds',
  'reviews',
  'posts',
  'media',
  'nori_site',
  'audit_logs',
] as const

/**
 * Counts records across all core domain tables.
 */
export function getTableCounts(db: DatabaseSync): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const table of CORE_COLLECTION_TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c?: number }
      counts[table] = row?.c ?? 0
    } catch {
      counts[table] = 0
    }
  }
  return counts
}

/**
 * Exports the active development database and media to `dev-data/`.
 */
export function exportDevDatabase(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  devDataDir?: string
  force?: boolean
}): {
  ok: boolean
  snapshotVersion: string
  exportedAt: string
  dbSha256: string
  counts: Record<string, number>
  copiedMediaFiles: number
  warnings: string[]
} {
  const paths = resolveDevSyncPaths(options)
  const warnings: string[] = []

  if (!fs.existsSync(paths.activeDbPath)) {
    throw new Error(
      `Không tìm thấy database phát triển tại: ${paths.activeDbPath}. Hãy chạy 'pnpm setup' hoặc khởi động dự án trước khi xuất dữ liệu.`,
    )
  }

  // 1. Checkpoint active database WAL
  const activeDb = new DatabaseSync(paths.activeDbPath)
  try {
    activeDb.exec('PRAGMA foreign_keys = ON;')
    const integrity = activeDb.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string
    }
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`Database cục bộ lỗi tính toàn vẹn: ${JSON.stringify(integrity)}`)
    }
    activeDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    activeDb.close()
  }

  // 2. Prepare directories
  fs.mkdirSync(path.join(paths.devDataDir, 'database'), { recursive: true })
  fs.mkdirSync(paths.snapshotMediaDir, { recursive: true })
  fs.mkdirSync(path.dirname(paths.localSyncStatePath), { recursive: true })

  // 3. VACUUM INTO temporary file
  const tempDbPath = path.join(
    paths.devDataDir,
    'database',
    `snapshot-temp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`,
  )
  if (fs.existsSync(tempDbPath)) {
    fs.unlinkSync(tempDbPath)
  }

  const exportSourceDb = new DatabaseSync(paths.activeDbPath, { readOnly: true })
  try {
    const escapedTemp = tempDbPath.replace(/'/g, "''")
    exportSourceDb.exec(`VACUUM INTO '${escapedTemp}'`)
  } finally {
    exportSourceDb.close()
  }

  // 4. Sanitize the snapshot database:
  // - Purge transient browser sessions & lock files
  // - Clear reset password tokens
  // - Preserve all user/admin hashed credentials, vehicles, bookings, etc.
  const snapDb = new DatabaseSync(tempDbPath)
  let counts: Record<string, number> = {}
  let mediaRows: Array<{ id: string; filename: string; mime_type?: string; filesize?: number }> = []

  try {
    snapDb.exec('PRAGMA foreign_keys = ON;')
    snapDb.exec('BEGIN IMMEDIATE')

    // Clean session tokens & locks if tables exist
    try {
      snapDb.exec('DELETE FROM admins_sessions;')
    } catch {}
    try {
      snapDb.exec('DELETE FROM users_sessions;')
    } catch {}
    try {
      snapDb.exec('DELETE FROM payload_locked_documents;')
    } catch {}
    try {
      snapDb.exec('DELETE FROM payload_locked_documents_rels;')
    } catch {}
    try {
      snapDb.exec('UPDATE users SET reset_password_token = NULL, reset_password_expiration = NULL;')
    } catch {}
    try {
      snapDb.exec(
        'UPDATE admins SET reset_password_token = NULL, reset_password_expiration = NULL;',
      )
    } catch {}

    snapDb.exec('COMMIT')

    // Checkpoint & verify
    snapDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
    const finalIntegrity = snapDb.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string
    }
    if (finalIntegrity?.integrity_check !== 'ok') {
      throw new Error(
        `Snapshot sanitized DB integrity check failed: ${JSON.stringify(finalIntegrity)}`,
      )
    }

    counts = getTableCounts(snapDb)
    try {
      mediaRows = snapDb
        .prepare('SELECT id, filename, mime_type, filesize FROM media')
        .all() as typeof mediaRows
    } catch {
      mediaRows = []
    }
  } finally {
    snapDb.close()
  }

  // 5. Replace canonical nori-dev.db atomically
  if (fs.existsSync(paths.snapshotDbPath)) {
    try {
      fs.unlinkSync(paths.snapshotDbPath)
    } catch {}
  }
  fs.renameSync(tempDbPath, paths.snapshotDbPath)

  // Remove any stale journals next to snapshot
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const p = `${paths.snapshotDbPath}${suffix}`
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p)
      } catch {}
    }
  }

  // 6. Collect & synchronize media files
  const searchDirs = [
    paths.activeMediaDir,
    path.join(paths.rootDir, 'media'),
    path.join(paths.rootDir, 'data', 'media'),
    path.join(paths.rootDir, 'media', 'seed'),
    path.join(paths.rootDir, 'public', 'seed-media'),
  ]

  let copiedMediaFiles = 0
  const mediaManifestEntries: DevSyncManifest['mediaFiles'] = []

  for (const m of mediaRows) {
    if (!m.filename) continue

    let foundPath: string | null = null
    for (const d of searchDirs) {
      const candidate = path.join(d, m.filename)
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        foundPath = candidate
        break
      }
    }

    const destPath = path.join(paths.snapshotMediaDir, m.filename)

    if (foundPath) {
      let needsCopy = true
      if (fs.existsSync(destPath)) {
        const srcStat = fs.statSync(foundPath)
        const dstStat = fs.statSync(destPath)
        if (srcStat.size === dstStat.size) {
          needsCopy = false
        }
      }

      if (needsCopy) {
        fs.copyFileSync(foundPath, destPath)
        copiedMediaFiles++
      }

      const fileSha = sha256File(destPath)
      const fileSize = fs.statSync(destPath).size
      mediaManifestEntries.push({
        filename: m.filename,
        size: fileSize,
        sha256: fileSha,
      })
    } else {
      warnings.push(
        `Ảnh "${m.filename}" (ID: ${m.id}) có trong database nhưng không tìm thấy file vật lý!`,
      )
    }
  }

  // 7. Compute snapshot checksum & build manifest
  const dbSha256 = sha256File(paths.snapshotDbPath)
  const dbSizeBytes = fs.statSync(paths.snapshotDbPath).size
  const exportedAt = new Date().toISOString()
  const snapshotVersion = `nori-dev-snapshot-${Date.now()}`

  const manifest: DevSyncManifest = {
    snapshotVersion,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    dbSha256,
    dbSizeBytes,
    counts,
    mediaCount: mediaManifestEntries.length,
    mediaFiles: mediaManifestEntries,
  }

  fs.writeFileSync(paths.manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  // 8. Update local sync state
  const currentActiveSha = sha256File(paths.activeDbPath)
  const localState: DevSyncState = {
    lastSyncType: 'export',
    snapshotVersion,
    dbSha256,
    localDbSha: currentActiveSha,
    timestamp: exportedAt,
    localDbPath: paths.activeDbPath,
  }
  fs.writeFileSync(paths.localSyncStatePath, JSON.stringify(localState, null, 2) + '\n', 'utf8')

  return {
    ok: true,
    snapshotVersion,
    exportedAt,
    dbSha256,
    counts,
    copiedMediaFiles,
    warnings,
  }
}

/**
 * Imports the development database snapshot from `dev-data/` into the local environment.
 */
export function importDevDatabase(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  devDataDir?: string
  force?: boolean
  onConflict?: 'abort' | 'keep-local' | 'prefer-snapshot'
}): {
  ok: boolean
  status: 'SUCCESS' | 'CONFLICT' | 'ALREADY_UP_TO_DATE' | 'ERROR'
  snapshotVersion: string
  importedAt: string
  backupPath?: string
  restoredMediaCount: number
  counts: Record<string, number>
  conflictDetails?: {
    reason: string
    localSha: string
    snapshotSha: string
    lastSyncedVersion?: string
  }
  errors: string[]
} {
  const paths = resolveDevSyncPaths(options)
  const onConflict = options?.onConflict || (options?.force ? 'prefer-snapshot' : 'abort')

  if (!fs.existsSync(paths.snapshotDbPath) || !fs.existsSync(paths.manifestPath)) {
    throw new Error(
      `Không tìm thấy dữ liệu phát triển trong dev-data/ (thiếu ${paths.snapshotDbPath} hoặc manifest.json). Hãy pull phiên bản mới nhất từ GitHub.`,
    )
  }

  // 1. Verify snapshot integrity before doing anything
  const manifestRaw = fs.readFileSync(paths.manifestPath, 'utf8')
  const manifest: DevSyncManifest = JSON.parse(manifestRaw)

  const currentSnapshotSha = sha256File(paths.snapshotDbPath)
  if (currentSnapshotSha !== manifest.dbSha256) {
    throw new Error(
      `Checksum của dev-data/database/nori-dev.db không khớp với manifest.json (snapshot bị hỏng hoặc chưa hoàn chỉnh).`,
    )
  }

  const snapTestDb = new DatabaseSync(paths.snapshotDbPath, { readOnly: true })
  try {
    const snapIntegrity = snapTestDb.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string
    }
    if (snapIntegrity?.integrity_check !== 'ok') {
      throw new Error(`dev-data snapshot bị lỗi SQLite integrity: ${JSON.stringify(snapIntegrity)}`)
    }
  } finally {
    snapTestDb.close()
  }

  // 2. Conflict & local modification check
  let backupPath: string | undefined
  if (fs.existsSync(paths.activeDbPath)) {
    // Checkpoint active DB to get accurate file bytes
    try {
      const activeDb = new DatabaseSync(paths.activeDbPath)
      try {
        activeDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
      } catch {}
      activeDb.close()
    } catch {}

    const localSha = sha256File(paths.activeDbPath)

    let recordedState: DevSyncState | null = null
    if (fs.existsSync(paths.localSyncStatePath)) {
      try {
        recordedState = JSON.parse(fs.readFileSync(paths.localSyncStatePath, 'utf8'))
      } catch {}
    }

    if (localSha === manifest.dbSha256) {
      // Local DB is already identical to incoming snapshot
      // Ensure media is synced just in case
      let mediaSynced = 0
      fs.mkdirSync(paths.activeMediaDir, { recursive: true })
      if (fs.existsSync(paths.snapshotMediaDir)) {
        for (const m of fs.readdirSync(paths.snapshotMediaDir)) {
          const src = path.join(paths.snapshotMediaDir, m)
          const dst = path.join(paths.activeMediaDir, m)
          if (!fs.existsSync(dst)) {
            fs.copyFileSync(src, dst)
            mediaSynced++
          }
        }
      }

      return {
        ok: true,
        status: 'ALREADY_UP_TO_DATE',
        snapshotVersion: manifest.snapshotVersion,
        importedAt: new Date().toISOString(),
        restoredMediaCount: mediaSynced,
        counts: manifest.counts,
        errors: [],
      }
    }

    // If local DB differs from recorded state (uncommitted local work)
    // AND incoming snapshot also differs from recorded state -> CONFLICT!
    const localHasUncommittedChanges = recordedState
      ? localSha !== recordedState.dbSha256 && localSha !== (recordedState.localDbSha ?? '')
      : true
    const snapshotIsNewer = recordedState ? manifest.dbSha256 !== recordedState.dbSha256 : true

    if (localHasUncommittedChanges && snapshotIsNewer && onConflict === 'abort') {
      return {
        ok: false,
        status: 'CONFLICT',
        snapshotVersion: manifest.snapshotVersion,
        importedAt: new Date().toISOString(),
        restoredMediaCount: 0,
        counts: manifest.counts,
        conflictDetails: {
          reason:
            'Database cục bộ trên máy có thay đổi chưa commit/export, đồng thời snapshot từ GitHub cũng có thay đổi mới. Không thể tự ý ghi đè.',
          localSha,
          snapshotSha: manifest.dbSha256,
          lastSyncedVersion: recordedState?.snapshotVersion,
        },
        errors: [
          'PHÁT HIỆN XUNG ĐỘT DỮ LIỆU PHÁT TRIỂN: Cả database cục bộ và git snapshot đều có các thay đổi độc lập.',
          'Để bảo vệ dữ liệu, thao tác import đã dừng lại mà KHÔNG ghi đè database cục bộ.',
          'Nếu bạn muốn giữ dữ liệu máy này và đẩy lên GitHub: chạy "npm run dev:sync:export" sau đó commit & push.',
          'Nếu bạn muốn bỏ dữ liệu máy này và nạp snapshot từ GitHub: chạy "npm run dev:sync:import -- --force" (hệ thống sẽ tự động backup database cũ vào backups/).',
        ],
      }
    }

    // Auto-backup local database before overwriting
    fs.mkdirSync(paths.backupsDir, { recursive: true })
    const backupName = `nori-pre-sync-${Date.now()}`
    const backupFolder = path.join(paths.backupsDir, backupName)
    fs.mkdirSync(backupFolder, { recursive: true })
    fs.copyFileSync(paths.activeDbPath, path.join(backupFolder, 'nori.db'))
    backupPath = backupFolder
  }

  // 3. Perform import
  fs.mkdirSync(path.dirname(paths.activeDbPath), { recursive: true })
  fs.mkdirSync(paths.activeMediaDir, { recursive: true })

  // Clean local journal/wal files
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const p = `${paths.activeDbPath}${suffix}`
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p)
      } catch {}
    }
  }

  fs.copyFileSync(paths.snapshotDbPath, paths.activeDbPath)

  // Verify active DB after copy
  const importedDb = new DatabaseSync(paths.activeDbPath)
  let activeCounts: Record<string, number> = {}
  try {
    importedDb.exec('PRAGMA foreign_keys = ON;')
    const finalIntegrity = importedDb.prepare('PRAGMA integrity_check').get() as {
      integrity_check?: string
    }
    if (finalIntegrity?.integrity_check !== 'ok') {
      throw new Error(
        `Database vừa nạp bị lỗi tính toàn vẹn SQLite: ${JSON.stringify(finalIntegrity)}`,
      )
    }
    activeCounts = getTableCounts(importedDb)
  } finally {
    importedDb.close()
  }

  // 4. Copy media files to local mediaDir
  let restoredMediaCount = 0
  if (fs.existsSync(paths.snapshotMediaDir)) {
    const files = fs.readdirSync(paths.snapshotMediaDir)
    for (const f of files) {
      const src = path.join(paths.snapshotMediaDir, f)
      const dst = path.join(paths.activeMediaDir, f)
      if (!fs.statSync(src).isFile()) continue

      let needsCopy = true
      if (fs.existsSync(dst)) {
        if (fs.statSync(src).size === fs.statSync(dst).size) {
          needsCopy = false
        }
      }

      if (needsCopy) {
        fs.copyFileSync(src, dst)
        restoredMediaCount++
      }
    }
  }

  // 5. Update local sync state
  const importedAt = new Date().toISOString()
  const localState: DevSyncState = {
    lastSyncType: 'import',
    snapshotVersion: manifest.snapshotVersion,
    dbSha256: manifest.dbSha256,
    localDbSha: manifest.dbSha256,
    timestamp: importedAt,
    localDbPath: paths.activeDbPath,
  }
  fs.mkdirSync(path.dirname(paths.localSyncStatePath), { recursive: true })
  fs.writeFileSync(paths.localSyncStatePath, JSON.stringify(localState, null, 2) + '\n', 'utf8')

  return {
    ok: true,
    status: 'SUCCESS',
    snapshotVersion: manifest.snapshotVersion,
    importedAt,
    backupPath,
    restoredMediaCount,
    counts: activeCounts,
    errors: [],
  }
}

/**
 * Verifies snapshot and local environment integrity.
 */
export function verifyDevDatabase(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  devDataDir?: string
}): DevSyncVerificationReport {
  const paths = resolveDevSyncPaths(options)
  const errors: string[] = []
  const warnings: string[] = []
  const missingMediaFiles: string[] = []
  const tempFilesFound: string[] = []

  const snapshotExists = fs.existsSync(paths.snapshotDbPath)
  const manifestExists = fs.existsSync(paths.manifestPath)

  if (!snapshotExists) {
    errors.push(`Thiếu file dev-data/database/nori-dev.db`)
  }
  if (!manifestExists) {
    errors.push(`Thiếu file dev-data/manifest.json`)
  }

  let dbIntegrity = 'unknown'
  let foreignKeysOk = false
  let counts: Record<string, number> | undefined
  let manifest: DevSyncManifest | null = null

  if (snapshotExists && manifestExists) {
    try {
      manifest = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'))
    } catch {
      errors.push('File dev-data/manifest.json bị lỗi định dạng JSON')
    }
    if (manifest) {
      const actualSha = sha256File(paths.snapshotDbPath)
      if (actualSha !== manifest.dbSha256) {
        errors.push(
          `Checksum nori-dev.db (${actualSha}) không khớp manifest (${manifest.dbSha256})`,
        )
      }
    }

    try {
      const db = new DatabaseSync(paths.snapshotDbPath, { readOnly: true })
      const res = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
      dbIntegrity = res?.integrity_check ?? 'failed'
      if (dbIntegrity !== 'ok') {
        errors.push(`PRAGMA integrity_check thất bại: ${dbIntegrity}`)
      }

      const fks = db.prepare('PRAGMA foreign_key_check').all()
      foreignKeysOk = fks.length === 0
      if (!foreignKeysOk) {
        errors.push(`Phát hiện ${fks.length} vi phạm foreign key trong snapshot DB`)
      }

      counts = getTableCounts(db)

      // Verify media references against dev-data/media/
      const mediaRows = db.prepare('SELECT id, filename FROM media').all() as Array<{
        id: string
        filename: string
      }>
      for (const m of mediaRows) {
        if (!m.filename) continue
        const p = path.join(paths.snapshotMediaDir, m.filename)
        if (!fs.existsSync(p)) {
          missingMediaFiles.push(m.filename)
        }
      }

      db.close()
    } catch (err) {
      errors.push(`Lỗi khi mở snapshot DB: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (missingMediaFiles.length > 0) {
    errors.push(
      `Phát hiện ${missingMediaFiles.length} file media có trong DB nhưng thiếu file trong dev-data/media/: ${missingMediaFiles.slice(0, 5).join(', ')}${missingMediaFiles.length > 5 ? '...' : ''}`,
    )
  }

  // Check for forbidden temporary files in dev-data
  if (fs.existsSync(paths.devDataDir)) {
    const checkDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          checkDir(full)
        } else if (
          entry.name.endsWith('-wal') ||
          entry.name.endsWith('-shm') ||
          entry.name.endsWith('-journal') ||
          entry.name.includes('.tmp') ||
          entry.name.startsWith('snapshot-temp-')
        ) {
          tempFilesFound.push(path.relative(paths.rootDir, full))
        }
      }
    }
    checkDir(paths.devDataDir)
  }

  if (tempFilesFound.length > 0) {
    errors.push(
      `Phát hiện file tạm SQLite/lock không được phép trong dev-data/: ${tempFilesFound.join(', ')}`,
    )
  }

  // Check local development database state
  let localStatus: DevSyncVerificationReport['localStatus'] = 'NO_LOCAL_DB'
  if (fs.existsSync(paths.activeDbPath)) {
    try {
      const activeDb = new DatabaseSync(paths.activeDbPath)
      try {
        activeDb.exec('PRAGMA wal_checkpoint(TRUNCATE);')
      } catch {}
      activeDb.close()
    } catch {}

    const localSha = sha256File(paths.activeDbPath)
    let state: DevSyncState | null = null
    if (fs.existsSync(paths.localSyncStatePath)) {
      try {
        state = JSON.parse(fs.readFileSync(paths.localSyncStatePath, 'utf8'))
      } catch {}
    }

    if (snapshotExists && manifestExists && manifest) {
      const isLocalMatchingExport =
        state?.lastSyncType === 'export' && state?.localDbSha === localSha
      const isLocalMatchingSnapshot = localSha === manifest.dbSha256

      if (isLocalMatchingSnapshot || isLocalMatchingExport) {
        localStatus = 'IN_SYNC'
      } else if (
        state &&
        (state.dbSha256 === manifest.dbSha256 || state.localDbSha) &&
        localSha !== state.localDbSha &&
        localSha !== state.dbSha256
      ) {
        localStatus = 'AHEAD'
      } else if (state && state.dbSha256 === localSha && manifest.dbSha256 !== state.dbSha256) {
        localStatus = 'BEHIND'
      } else {
        localStatus = 'CONFLICT'
      }
    }
  }

  return {
    ok: errors.length === 0,
    snapshotExists,
    manifestExists,
    dbIntegrity,
    foreignKeysOk,
    mediaOk: missingMediaFiles.length === 0,
    missingMediaFiles,
    noTempFilesOk: tempFilesFound.length === 0,
    tempFilesFound,
    localStatus,
    localDbPath: paths.activeDbPath,
    counts,
    errors,
    warnings,
  }
}
