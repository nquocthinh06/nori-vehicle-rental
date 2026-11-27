import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  PAYMENT_COLUMN_ADDITIONS,
  PAYMENT_COLUMN_INDEXES_SQL,
  PAYMENT_TABLES_AND_INDEXES_SQL,
} from '../migrations/20261120_010000_online_payment_integration.ts'
import {
  MULTI_BRANCH_COLUMN_ADDITIONS,
  MULTI_BRANCH_COLUMN_INDEXES_SQL,
  MULTI_BRANCH_TABLES_AND_INDEXES_SQL,
} from '../migrations/20261120_020000_multi_branch_management.ts'
import {
  BOOKING_PAYMENT_OPTION_COLUMN_ADDITIONS,
  BOOKING_PAYMENT_OPTION_INDEXES_SQL,
} from '../migrations/20261120_030000_booking_payment_option_plans.ts'
import { MEDIA_CLOUD_STORAGE_COLUMN_ADDITIONS } from '../migrations/20261121_040000_media_cloud_storage_columns.ts'
import { AI_ASSISTANT_TABLES_AND_INDEXES_SQL } from '../migrations/20261128_010000_ai_assistant_foundation.ts'
import {
  VEHICLE_IMPORT_COLUMN_ADDITIONS,
  VEHICLE_IMPORT_COLUMN_INDEXES_SQL,
  VEHICLE_IMPORT_OPTIONAL_MEDIA_V_INDEX_SQL,
  VEHICLE_IMPORT_TABLES_AND_INDEXES_SQL,
} from '../migrations/20261128_020000_vehicle_import_jobs.ts'

export const CURRENT_SCHEMA_VERSION = 'nori-payload-sqlite-v2.5'
export const SNAPSHOT_FORMAT_VERSION = '1.0.0'

export const ALLOWLISTED_SNAPSHOT_COLLECTIONS = [
  'categories',
  'brands',
  'vehicle-models',
  'vehicles',
  'site-settings',
  'hero-slides',
  'banners',
  'articles',
  'promotions',
  'roles-permissions',
  'media-manifest',
] as const

export const EXCLUDED_SENSITIVE_COLLECTIONS = [
  'admins',
  'users',
  'bookings',
  'rental-days',
  'payments',
  'sales-inquiries',
  'consultations',
  'notifications',
  'reviews',
  'audit-logs',
  'admins-sessions',
  'users-sessions',
  'branch-staff',
  'vehicle-transfers',
  'vehicle-location-history',
  'delivery-jobs',
  'ai-settings',
  'ai-usage-logs',
  'ai-feedback',
  'vehicle-import-jobs',
] as const

const FORBIDDEN_FIELD_NAMES = new Set([
  'password',
  'hash',
  'salt',
  'resetPasswordToken',
  'reset_password_token',
  'resetPasswordExpiration',
  'reset_password_expiration',
  'lockUntil',
  'lock_until',
  'loginAttempts',
  'login_attempts',
  'driverLicenseNumber',
  'driver_license_number',
  'idCardNumber',
  'id_card_number',
  'customerPhone',
  'customer_phone',
  'deliveryAddress',
  'delivery_address',
  'pickupAddress',
  'pickup_address',
  'contactPhone',
  'contact_phone',
  'apiKey',
  'api_key',
  'openaiApiKey',
  'openai_api_key',
  'payloadSecret',
  'sessionSecret',
  'sessions',
])

const SENSITIVE_VALUE_PATTERNS = [
  /pbkdf2-sha256-v1:[0-9a-f]{32,}/i,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /NORI_SESSION_SECRET\s*=/,
  /PAYLOAD_SECRET\s*=/,
  /NORI_ADMIN_PASSWORD\s*=/,
  /OPENAI_API_KEY\s*=/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
]

export type ConflictStrategy = 'abort' | 'keep-local' | 'prefer-snapshot'

export type MediaManifestItem = {
  stableKey: string
  id: string
  filename: string
  repoPath: string
  mimeType: string
  filesize: number
  width: number
  height: number
  focalX: number
  focalY: number
  alt: string
  sourceUrl: string | null
  sourceName: string | null
  license: string | null
  modelYear: string | null
  variantName: string | null
  colorName: string | null
  mediaCategory: string
  verified: boolean
  checksum: string
  version: number
  updatedAt: string
  usedBy: string[]
}

export type SnapshotManifest = {
  snapshotVersion: string
  formatVersion: string
  schemaVersion: string
  exportedAt: string
  contentHash: string
  counts: {
    categories: number
    brands: number
    vehicleModels: number
    vehicles: number
    heroSlides: number
    banners: number
    articles: number
    promotions: number
    media: number
    rolesPermissions: number
  }
  files: Record<string, { sha256: string; recordCount: number }>
  allowlistedCollections: readonly string[]
  excludedSensitiveCollections: readonly string[]
}

export type SyncConflict = {
  collection: string
  key: string
  changedFields: string[]
  mediaConflict: boolean
  localMedia?: string[]
  snapshotMedia?: string[]
  localUpdatedAt: string | null
  snapshotUpdatedAt: string | null
  localHash: string
  snapshotHash: string
  resolutionHint: string
}

export type ImportResult = {
  ok: boolean
  status: 'SUCCESS' | 'DRY_RUN' | 'CONFLICT' | 'VALIDATION_FAILED' | 'ERROR'
  dryRun: boolean
  schemaVersion: string
  snapshotVersion: string
  backupPath?: string
  summary: {
    toCreate: number
    toUpdate: number
    unchanged: number
    conflicts: number
    mediaCopied: number
  }
  details: {
    created: string[]
    updated: string[]
    unchanged: string[]
    skippedConflicts: string[]
  }
  conflicts: SyncConflict[]
  errors: string[]
}

export type ValidationReport = {
  ok: boolean
  schemaVersion: string
  snapshotVersion: string | null
  checkedFiles: number
  mediaChecked: number
  sensitiveViolations: string[]
  referentialErrors: string[]
  mediaErrors: string[]
  schemaErrors: string[]
  warnings: string[]
}

export function resolvePaths(options?: {
  rootDir?: string
  dbPath?: string
  snapshotsDir?: string
  mediaDir?: string
  seedMediaDir?: string
  sharedSeedMediaDir?: string
  backupsDir?: string
}) {
  const rootDir = path.resolve(
    /*turbopackIgnore: true*/ options?.rootDir ||
      process.env.NORI_ROOT_DIR?.trim() ||
      process.cwd(),
  )
  const rawDb =
    options?.dbPath ||
    process.env.NORI_SQLITE_PATH ||
    (process.env.DATABASE_URI?.startsWith('file:')
      ? process.env.DATABASE_URI.slice(5)
      : process.env.DATABASE_URI) ||
    'nori.db'
  const dbPath = path.resolve(/*turbopackIgnore: true*/ rootDir, rawDb)
  const snapshotsDir = path.resolve(
    /*turbopackIgnore: true*/
    options?.snapshotsDir || path.join(/*turbopackIgnore: true*/ rootDir, 'data', 'snapshots'),
  )
  const runtimeDir = path.resolve(/*turbopackIgnore: true*/ rootDir, 'data', 'runtime')
  const seedDir = path.resolve(/*turbopackIgnore: true*/ rootDir, 'data', 'seed')
  const envMediaDir = !options?.rootDir
    ? process.env.MEDIA_DIR?.trim() || process.env.NORI_MEDIA_DIR?.trim()
    : undefined
  const mediaDir = path.resolve(
    /*turbopackIgnore: true*/
    options?.mediaDir || envMediaDir || path.join(/*turbopackIgnore: true*/ rootDir, 'media'),
  )
  const seedMediaDir = path.resolve(
    /*turbopackIgnore: true*/
    options?.seedMediaDir || path.join(/*turbopackIgnore: true*/ rootDir, 'public', 'seed-media'),
  )
  const sharedSeedMediaDir = path.resolve(
    /*turbopackIgnore: true*/
    options?.sharedSeedMediaDir || path.join(/*turbopackIgnore: true*/ rootDir, 'media', 'seed'),
  )
  const envBackupDir = !options?.rootDir
    ? process.env.BACKUP_DIR?.trim() || process.env.NORI_BACKUP_DIR?.trim()
    : undefined
  const backupsDir = path.resolve(
    /*turbopackIgnore: true*/
    options?.backupsDir || envBackupDir || path.join(/*turbopackIgnore: true*/ rootDir, 'backups'),
  )
  const syncStatePath = path.join(/*turbopackIgnore: true*/ runtimeDir, 'sync-state.json')

  return {
    rootDir,
    dbPath,
    snapshotsDir,
    runtimeDir,
    seedDir,
    mediaDir,
    seedMediaDir,
    sharedSeedMediaDir,
    backupsDir,
    syncStatePath,
  }
}

export function sha256Buffer(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath))
}

export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep)
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    const out: Record<string, unknown> = {}
    for (const [k, v] of entries) {
      out[k] = sortDeep(v)
    }
    return out
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + '\n'
}

export function computeRecordHash(record: Record<string, unknown>): string {
  const copy: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (
      k === 'id' ||
      k === 'updatedAt' ||
      k === 'createdAt' ||
      k === 'recordHash' ||
      k === 'coverId' ||
      k === 'modelId'
    ) {
      continue
    }
    copy[k] = v
  }
  return sha256Buffer(JSON.stringify(sortDeep(copy))).slice(0, 24)
}

function deterministicUuid(namespace: string, key: string): string {
  const hex = sha256Buffer(`nori:${namespace}:${key}`).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function writeAuditLogSql(
  db: DatabaseSync,
  entry: {
    action: string
    entity: string
    entityId?: string | null
    entityLabel?: string | null
    summary: string
    fromStatus?: string | null
    toStatus?: string | null
    actorType?: 'ADMIN' | 'CUSTOMER' | 'SYSTEM'
    actorId?: string | null
    actorEmail?: string | null
  },
) {
  try {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    db.prepare(
      `INSERT INTO audit_logs (
        id, action, entity, entity_id, entity_label, summary,
        from_status, to_status, actor_type, actor_id, actor_email,
        updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      entry.action.slice(0, 80),
      entry.entity.slice(0, 60),
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      entry.summary.slice(0, 500),
      entry.fromStatus ?? null,
      entry.toStatus ?? null,
      entry.actorType ?? 'SYSTEM',
      entry.actorId ?? null,
      entry.actorEmail ?? null,
      now,
      now,
    )
  } catch {
    // Do not fail operation if audit_logs table is not yet initialized
  }
}

export function applyAdditivePaymentSchema(db: DatabaseSync): void {
  for (const stmt of PAYMENT_TABLES_AND_INDEXES_SQL) {
    db.exec(stmt)
  }
  const colsCache = new Map<string, Set<string>>()
  for (const [tableName, columnName, colDef] of PAYMENT_COLUMN_ADDITIONS) {
    let colSet = colsCache.get(tableName)
    if (!colSet) {
      const rows = db.prepare(`PRAGMA table_info('${tableName}')`).all() as { name?: string }[]
      colSet = new Set(rows.map((r) => String(r.name ?? '')))
      colsCache.set(tableName, colSet)
    }
    if (!colSet.has(columnName)) {
      db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`)
      colSet.add(columnName)
    }
  }
  for (const idxStmt of PAYMENT_COLUMN_INDEXES_SQL) {
    db.exec(idxStmt)
  }
}

export function applyAdditiveMultiBranchSchema(db: DatabaseSync): void {
  for (const stmt of MULTI_BRANCH_TABLES_AND_INDEXES_SQL) {
    db.exec(stmt)
  }
  const colsCache = new Map<string, Set<string>>()
  for (const [tableName, columnName, colDef] of MULTI_BRANCH_COLUMN_ADDITIONS) {
    let colSet = colsCache.get(tableName)
    if (!colSet) {
      const rows = db.prepare(`PRAGMA table_info('${tableName}')`).all() as { name?: string }[]
      colSet = new Set(rows.map((r) => String(r.name ?? '')))
      colsCache.set(tableName, colSet)
    }
    if (!colSet.has(columnName)) {
      db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`)
      colSet.add(columnName)
    }
  }
  for (const idxStmt of MULTI_BRANCH_COLUMN_INDEXES_SQL) {
    db.exec(idxStmt)
  }
}

export function applyAdditiveBookingPaymentOptionSchema(db: DatabaseSync): void {
  const colsCache = new Map<string, Set<string>>()
  for (const [tableName, columnName, colDef] of BOOKING_PAYMENT_OPTION_COLUMN_ADDITIONS) {
    let colSet = colsCache.get(tableName)
    if (!colSet) {
      const rows = db.prepare(`PRAGMA table_info('${tableName}')`).all() as { name?: string }[]
      colSet = new Set(rows.map((r) => String(r.name ?? '')))
      colsCache.set(tableName, colSet)
    }
    if (!colSet.has(columnName)) {
      db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`)
      colSet.add(columnName)
    }
  }
  db.exec(
    `UPDATE \`bookings\` SET \`payment_option\` = 'DEPOSIT' WHERE \`payment_option\` IS NULL;`,
  )
  db.exec(
    `UPDATE \`bookings\` SET \`reservation_deposit_snapshot\` = 0 WHERE \`reservation_deposit_snapshot\` IS NULL;`,
  )
  for (const idxStmt of BOOKING_PAYMENT_OPTION_INDEXES_SQL) {
    db.exec(idxStmt)
  }
}

export function applyAdditiveMediaCloudStorageSchema(db: DatabaseSync): void {
  const existingTables = new Set(
    (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('media', '_media_v')",
        )
        .all() as { name?: string }[]
    )
      .map((r) => String(r.name ?? ''))
      .filter(Boolean),
  )
  const colsCache = new Map<string, Set<string>>()
  for (const [tableName, columnName, colDef] of MEDIA_CLOUD_STORAGE_COLUMN_ADDITIONS) {
    if (!existingTables.has(tableName)) continue
    let colSet = colsCache.get(tableName)
    if (!colSet) {
      const rows = db.prepare(`PRAGMA table_info('${tableName}')`).all() as { name?: string }[]
      colSet = new Set(rows.map((r) => String(r.name ?? '')))
      colsCache.set(tableName, colSet)
    }
    if (!colSet.has(columnName)) {
      db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`)
      colSet.add(columnName)
    }
  }
}

export function applyAdditiveAIAssistantSchema(db: DatabaseSync): void {
  for (const stmt of AI_ASSISTANT_TABLES_AND_INDEXES_SQL) {
    db.exec(stmt)
  }
}

export function applyAdditiveVehicleImportSchema(db: DatabaseSync): void {
  const existingTables = new Set(
    (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vehicle_models', 'media', '_media_v')",
        )
        .all() as { name?: string }[]
    )
      .map((r) => String(r.name ?? ''))
      .filter(Boolean),
  )
  const colsCache = new Map<string, Set<string>>()
  for (const [tableName, columnName, colDef] of VEHICLE_IMPORT_COLUMN_ADDITIONS) {
    if (!existingTables.has(tableName)) continue
    let colSet = colsCache.get(tableName)
    if (!colSet) {
      const rows = db.prepare(`PRAGMA table_info('${tableName}')`).all() as { name?: string }[]
      colSet = new Set(rows.map((r) => String(r.name ?? '')))
      colsCache.set(tableName, colSet)
    }
    if (!colSet.has(columnName)) {
      db.exec(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`)
      colSet.add(columnName)
    }
  }
  for (const stmt of VEHICLE_IMPORT_TABLES_AND_INDEXES_SQL) {
    db.exec(stmt)
  }
  for (const idxStmt of VEHICLE_IMPORT_COLUMN_INDEXES_SQL) {
    db.exec(idxStmt)
  }
  if (existingTables.has('_media_v')) {
    db.exec(VEHICLE_IMPORT_OPTIONAL_MEDIA_V_INDEX_SQL)
  }
}

export function runDatabaseMigration(options?: { rootDir?: string; dbPath?: string }) {
  const paths = resolvePaths(options)
  const schemaSqlPath = path.join(paths.seedDir, 'schema.sql')
  if (!fs.existsSync(schemaSqlPath)) {
    throw new Error(`Không tìm thấy file schema migration: ${schemaSqlPath}`)
  }

  fs.mkdirSync(path.dirname(paths.dbPath), { recursive: true })
  const sqlContent = fs.readFileSync(schemaSqlPath, 'utf8')
  const db = new DatabaseSync(paths.dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sqlContent)
      applyAdditivePaymentSchema(db)
      applyAdditiveMultiBranchSchema(db)
      applyAdditiveBookingPaymentOptionSchema(db)
      applyAdditiveMediaCloudStorageSchema(db)
      applyAdditiveAIAssistantSchema(db)
      applyAdditiveVehicleImportSchema(db)
      const now = new Date().toISOString()
      const existingDev = db
        .prepare("SELECT id FROM payload_migrations WHERE name = 'dev' LIMIT 1")
        .get() as { id?: string } | undefined
      if (!existingDev) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), 'dev', -1, now, now)
      }
      const existingVersion = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(CURRENT_SCHEMA_VERSION) as { id?: string } | undefined
      if (!existingVersion) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), CURRENT_SCHEMA_VERSION, 1, now, now)
      }
      const paymentMigName = '20261120_010000_online_payment_integration'
      const existingPaymentMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(paymentMigName) as { id?: string } | undefined
      if (!existingPaymentMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), paymentMigName, 2, now, now)
      }
      const multiBranchMigName = '20261120_020000_multi_branch_management'
      const existingMultiBranchMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(multiBranchMigName) as { id?: string } | undefined
      if (!existingMultiBranchMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), multiBranchMigName, 3, now, now)
      }
      const bookingPaymentOptionMigName = '20261120_030000_booking_payment_option_plans'
      const existingBookingPaymentOptionMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(bookingPaymentOptionMigName) as { id?: string } | undefined
      if (!existingBookingPaymentOptionMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), bookingPaymentOptionMigName, 4, now, now)
      }
      const mediaCloudMigName = '20261121_040000_media_cloud_storage_columns'
      const existingMediaCloudMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(mediaCloudMigName) as { id?: string } | undefined
      if (!existingMediaCloudMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), mediaCloudMigName, 5, now, now)
      }
      const aiAssistantMigName = '20261128_010000_ai_assistant_foundation'
      const existingAiAssistantMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(aiAssistantMigName) as { id?: string } | undefined
      if (!existingAiAssistantMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), aiAssistantMigName, 6, now, now)
      }
      const vehicleImportMigName = '20261128_020000_vehicle_import_jobs'
      const existingVehicleImportMig = db
        .prepare('SELECT id FROM payload_migrations WHERE name = ? LIMIT 1')
        .get(vehicleImportMigName) as { id?: string } | undefined
      if (!existingVehicleImportMig) {
        db.prepare(
          'INSERT INTO payload_migrations (id, name, batch, updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(crypto.randomUUID(), vehicleImportMigName, 7, now, now)
      }
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    const tablesCount = (
      db
        .prepare(
          "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as { c: number }
    ).c
    const integrity = (
      db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined
    )?.integrity_check
    const fkViolations = db.prepare('PRAGMA foreign_key_check').all()

    return {
      ok: integrity === 'ok' && fkViolations.length === 0 && tablesCount >= 80,
      dbPath: paths.dbPath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tablesCount,
      integrity: integrity ?? 'unknown',
      fkViolations: fkViolations.length,
    }
  } finally {
    db.close()
  }
}

type SyncStateFile = {
  snapshotVersion: string
  contentHash: string
  syncedAt: string
  recordHashes: Record<string, string>
}

function readSyncState(syncStatePath: string, db?: DatabaseSync): SyncStateFile | null {
  if (db) {
    try {
      const row = db
        .prepare("SELECT data FROM payload_kv WHERE key = 'nori_data_sync_state' LIMIT 1")
        .get() as { data?: string } | undefined
      if (row?.data) return JSON.parse(row.data) as SyncStateFile
    } catch {
      // fallback to file
    }
  }
  if (fs.existsSync(syncStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(syncStatePath, 'utf8')) as SyncStateFile
    } catch {
      return null
    }
  }
  return null
}

function writeSyncState(syncStatePath: string, state: SyncStateFile, db?: DatabaseSync) {
  fs.mkdirSync(path.dirname(syncStatePath), { recursive: true })
  const raw = canonicalJson(state)
  fs.writeFileSync(syncStatePath, raw, 'utf8')
  if (db) {
    try {
      const existing = db
        .prepare("SELECT id FROM payload_kv WHERE key = 'nori_data_sync_state' LIMIT 1")
        .get() as { id?: string } | undefined
      if (existing?.id) {
        db.prepare('UPDATE payload_kv SET data = ? WHERE id = ?').run(raw, existing.id)
      } else {
        db.prepare('INSERT INTO payload_kv (id, key, data) VALUES (?, ?, ?)').run(
          crypto.randomUUID(),
          'nori_data_sync_state',
          raw,
        )
      }
    } catch {
      // ignore if payload_kv is read-only
    }
  }
}

export function extractDatabaseState(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  seedMediaDir?: string
  sharedSeedMediaDir?: string
}) {
  const paths = resolvePaths(options)
  if (!fs.existsSync(paths.dbPath)) {
    throw new Error(`Không tìm thấy cơ sở dữ liệu SQLite tại: ${paths.dbPath}`)
  }

  // Map starter seed media by SHA-256 hash to avoid duplicating existing files in Git
  const starterHashToRelPath = new Map<string, string>()
  if (fs.existsSync(paths.seedMediaDir)) {
    for (const f of fs.readdirSync(paths.seedMediaDir).sort()) {
      const full = path.join(paths.seedMediaDir, f)
      if (fs.statSync(full).isFile()) {
        starterHashToRelPath.set(sha256File(full), `public/seed-media/${f}`)
      }
    }
  }

  const db = new DatabaseSync(paths.dbPath, { readOnly: true })
  try {
    const mediaRows = db
      .prepare('SELECT * FROM media ORDER BY filename ASC, id ASC')
      .all() as Record<string, unknown>[]
    const mediaById = new Map<string, Record<string, unknown>>()
    for (const r of mediaRows) {
      mediaById.set(String(r.id), r)
    }

    const usedMediaRefs = new Map<string, Set<string>>()
    const markMedia = (mediaId: unknown, usageRef: string) => {
      if (!mediaId || typeof mediaId !== 'string') return
      if (!mediaById.has(mediaId)) return
      const set = usedMediaRefs.get(mediaId) ?? new Set<string>()
      set.add(usageRef)
      usedMediaRefs.set(mediaId, set)
    }
    const mediaKeyOf = (mediaId: unknown): string | null => {
      if (!mediaId || typeof mediaId !== 'string') return null
      const row = mediaById.get(mediaId)
      return row && typeof row.filename === 'string' ? row.filename : null
    }

    // 1. Vehicle Models
    const modelRows = db
      .prepare('SELECT * FROM vehicle_models ORDER BY sort_order ASC, slug ASC')
      .all() as Record<string, unknown>[]
    const modelSlugById = new Map<string, string>()
    for (const m of modelRows) {
      modelSlugById.set(String(m.id), String(m.slug))
    }

    const vehicleModels = modelRows.map((m) => {
      const mId = String(m.id)
      const slug = String(m.slug)
      markMedia(m.cover_id, `vehicle-model:${slug}:cover`)

      const highlights = (
        db
          .prepare(
            'SELECT text FROM vehicle_models_highlights WHERE _parent_id = ? ORDER BY _order ASC',
          )
          .all(mId) as { text: string }[]
      ).map((h) => h.text)

      const features = (
        db
          .prepare(
            'SELECT name, category, status, variant_note FROM vehicle_models_features WHERE _parent_id = ? ORDER BY _order ASC',
          )
          .all(mId) as Record<string, unknown>[]
      ).map((f) => ({
        name: String(f.name),
        category: String(f.category ?? 'COMFORT'),
        status: String(f.status ?? 'EQUIPPED'),
        variantNote: f.variant_note ? String(f.variant_note) : null,
      }))

      const gallery = (
        db
          .prepare('SELECT * FROM vehicle_models_gallery WHERE _parent_id = ? ORDER BY _order ASC')
          .all(mId) as Record<string, unknown>[]
      )
        .map((g, idx) => {
          const mediaKey = mediaKeyOf(g.image_id)
          if (!mediaKey) return null
          markMedia(g.image_id, `vehicle-model:${slug}:gallery:${idx + 1}`)
          return {
            mediaKey,
            kind: String(g.kind ?? 'EXTERIOR'),
            photoType: g.photo_type ? String(g.photo_type) : null,
            isPrimary: Boolean(g.is_primary),
            sortOrder: Number(g.sort_order ?? idx),
            altText: g.alt_text ? String(g.alt_text) : null,
            caption: g.caption ? String(g.caption) : null,
            variantName: g.variant_name ? String(g.variant_name) : null,
            colorName: g.color_name ? String(g.color_name) : null,
            sourceUrl: g.source_url ? String(g.source_url) : null,
            license: g.license ? String(g.license) : null,
            verified: g.verified !== 0,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      const specifications = (
        db
          .prepare(
            'SELECT * FROM vehicle_models_specifications WHERE _parent_id = ? ORDER BY _order ASC',
          )
          .all(mId) as Record<string, unknown>[]
      ).map((s) => ({
        group: String(s.group ?? 'OVERVIEW'),
        label: String(s.label),
        value: String(s.value),
        variantName: s.variant_name ? String(s.variant_name) : null,
        source: s.source ? String(s.source) : null,
      }))

      const variantRows = db
        .prepare('SELECT * FROM vehicle_models_variants WHERE _parent_id = ? ORDER BY _order ASC')
        .all(mId) as Record<string, unknown>[]
      const variants = variantRows.map((v) => {
        const vId = String(v.id)
        const colorRows = db
          .prepare(
            'SELECT * FROM vehicle_models_variants_colors WHERE _parent_id = ? ORDER BY _order ASC',
          )
          .all(vId) as Record<string, unknown>[]
        const colors = colorRows.map((c) => {
          const mediaKey = mediaKeyOf(c.image_id)
          if (mediaKey) {
            markMedia(
              c.image_id,
              `vehicle-model:${slug}:variant:${String(v.name)}:${String(c.name)}`,
            )
          }
          return {
            name: String(c.name),
            hex: c.hex ? String(c.hex) : null,
            sourceUrl: c.source_url ? String(c.source_url) : null,
            mediaKey,
          }
        })
        return {
          name: String(v.name),
          year: v.year != null ? Number(v.year) : null,
          listedPrice: v.listed_price != null ? Number(v.listed_price) : null,
          referenceRentPrice:
            v.reference_rent_price != null ? Number(v.reference_rent_price) : null,
          fuelType: v.fuel_type ? String(v.fuel_type) : null,
          transmission: v.transmission ? String(v.transmission) : null,
          driveType: v.drive_type ? String(v.drive_type) : null,
          seats: v.seats != null ? Number(v.seats) : null,
          summary: v.summary ? String(v.summary) : null,
          colors,
        }
      })

      const base = {
        id: mId,
        slug,
        name: String(m.name),
        officialName: m.official_name ? String(m.official_name) : null,
        brand: String(m.brand),
        modelLine: m.model_line ? String(m.model_line) : null,
        versionName: m.version_name ? String(m.version_name) : null,
        generation: m.generation ? String(m.generation) : null,
        category: String(m.category),
        subCategory: m.sub_category ? String(m.sub_category) : null,
        bodyStyle: m.body_style ? String(m.body_style) : null,
        segment: m.segment ? String(m.segment) : null,
        origin: m.origin ? String(m.origin) : null,
        modelYear: m.model_year != null ? Number(m.model_year) : null,
        seats: m.seats != null ? Number(m.seats) : null,
        fuelType: m.fuel_type ? String(m.fuel_type) : null,
        transmission: m.transmission ? String(m.transmission) : null,
        driveType: m.drive_type ? String(m.drive_type) : null,
        listedPrice: m.listed_price != null ? Number(m.listed_price) : null,
        referenceRentPrice: m.reference_rent_price != null ? Number(m.reference_rent_price) : null,
        defaultDepositSuggestion:
          m.default_deposit_suggestion != null ? Number(m.default_deposit_suggestion) : null,
        suitableFor: m.suitable_for ? String(m.suitable_for) : null,
        usagePurpose: m.usage_purpose ? String(m.usage_purpose) : null,
        shortDescription: m.short_description ? String(m.short_description) : null,
        description: m.description ? String(m.description) : null,
        exteriorOverview: m.exterior_overview ? String(m.exterior_overview) : null,
        interiorOverview: m.interior_overview ? String(m.interior_overview) : null,
        engineOverview: m.engine_overview ? String(m.engine_overview) : null,
        coverMediaKey: mediaKeyOf(m.cover_id),
        highlights,
        features,
        gallery,
        specifications,
        variants,
        source: m.source ? String(m.source) : null,
        verificationStatus: String(m.verification_status ?? 'VERIFIED'),
        visible: Boolean(m.visible),
        featured: Boolean(m.featured),
        sortOrder: Number(m.sort_order ?? 0),
        updatedAt: String(m.updated_at),
      }
      return {
        ...base,
        recordHash: computeRecordHash(base),
      }
    })

    // 2. Shareable Demo Vehicles (is_demo = 1)
    const vehicleRows = db
      .prepare('SELECT * FROM vehicles WHERE is_demo = 1 ORDER BY reference ASC')
      .all() as Record<string, unknown>[]
    const vehicles = vehicleRows
      .map((v) => {
        const vId = String(v.id)
        const reference = String(v.reference)
        const modelSlug = modelSlugById.get(String(v.model_id))
        if (!modelSlug) return null

        const photos = (
          db
            .prepare('SELECT * FROM vehicles_photos WHERE _parent_id = ? ORDER BY _order ASC')
            .all(vId) as Record<string, unknown>[]
        )
          .map((p, idx) => {
            const mediaKey = mediaKeyOf(p.image_id)
            if (!mediaKey) return null
            markMedia(p.image_id, `vehicle:${reference}:photo:${idx + 1}`)
            return {
              mediaKey,
              caption: p.caption ? String(p.caption) : null,
              kind: String(p.kind ?? 'EXTERIOR'),
              photoType: p.photo_type ? String(p.photo_type) : null,
              isPrimary: Boolean(p.is_primary),
              sortOrder: Number(p.sort_order ?? idx),
              altText: p.alt_text ? String(p.alt_text) : null,
              sourceName: p.source_name ? String(p.source_name) : null,
            }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        const base = {
          id: vId,
          reference,
          modelSlug,
          licensePlate: String(v.license_plate),
          intent: String(v.intent ?? 'RENT'),
          isDemo: true,
          vehicleConditionType: String(v.vehicle_condition_type ?? 'USED'),
          manufactureYear: v.manufacture_year != null ? Number(v.manufacture_year) : null,
          pricePerDay: v.price_per_day != null ? Number(v.price_per_day) : null,
          pricePerHour: v.price_per_hour != null ? Number(v.price_per_hour) : null,
          pricePerWeek: v.price_per_week != null ? Number(v.price_per_week) : null,
          pricePerMonth: v.price_per_month != null ? Number(v.price_per_month) : null,
          weekendSurcharge: v.weekend_surcharge != null ? Number(v.weekend_surcharge) : null,
          holidaySurcharge: v.holiday_surcharge != null ? Number(v.holiday_surcharge) : null,
          depositAmount: v.deposit_amount != null ? Number(v.deposit_amount) : null,
          deliveryFee: v.delivery_fee != null ? Number(v.delivery_fee) : null,
          kmLimitPerDay: v.km_limit_per_day != null ? Number(v.km_limit_per_day) : 300,
          overKmFee: v.over_km_fee != null ? Number(v.over_km_fee) : null,
          lateReturnFeePerHour:
            v.late_return_fee_per_hour != null ? Number(v.late_return_fee_per_hour) : null,
          bufferHours: v.buffer_hours != null ? Number(v.buffer_hours) : 2,
          salePrice: v.sale_price != null ? Number(v.sale_price) : null,
          listedPrice: v.listed_price != null ? Number(v.listed_price) : null,
          discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
          reservationDeposit: v.reservation_deposit != null ? Number(v.reservation_deposit) : null,
          estimatedRollingPrice:
            v.estimated_rolling_price != null ? Number(v.estimated_rolling_price) : null,
          negotiable: Boolean(v.negotiable),
          warrantyPolicy: v.warranty_policy ? String(v.warranty_policy) : null,
          priceSourceNote: v.price_source_note ? String(v.price_source_note) : null,
          odometer: v.odometer != null ? Number(v.odometer) : null,
          condition: v.condition ? String(v.condition) : null,
          exteriorCondition: v.exterior_condition ? String(v.exterior_condition) : null,
          interiorCondition: v.interior_condition ? String(v.interior_condition) : null,
          engineCondition: v.engine_condition ? String(v.engine_condition) : null,
          maintenanceHistory: v.maintenance_history ? String(v.maintenance_history) : null,
          inspectedAt: v.inspected_at ? String(v.inspected_at) : null,
          version: v.version ? String(v.version) : null,
          color: v.color ? String(v.color) : null,
          location: v.location ? String(v.location) : null,
          pickupLocation: v.pickup_location ? String(v.pickup_location) : null,
          operationStatus: String(v.operation_status ?? 'READY'),
          status: String(v.status ?? 'ACTIVE'),
          photos,
          updatedAt: String(v.updated_at),
        }
        return {
          ...base,
          recordHash: computeRecordHash(base),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    // 3. Site Settings, Hero Slides & Banners
    const siteRow = db.prepare('SELECT * FROM nori_site LIMIT 1').get() as
      | Record<string, unknown>
      | undefined
    const siteId = siteRow ? String(siteRow.id) : 'nori-site-default'
    if (siteRow) {
      markMedia(siteRow.logo_id, 'nori-site:logo')
      markMedia(siteRow.favicon_id, 'nori-site:favicon')
      markMedia(siteRow.og_image_id, 'nori-site:ogImage')
      markMedia(siteRow.story_image_id, 'nori-site:storyImage')
    }

    const slideRows = siteRow
      ? (db
          .prepare('SELECT * FROM nori_site_hero_slides WHERE _parent_id = ? ORDER BY _order ASC')
          .all(siteId) as Record<string, unknown>[])
      : []
    const heroSlides = slideRows.map((s, idx) => {
      const slideKey = `slide-${idx + 1}`
      markMedia(s.desktop_image_id, `hero-slide:${idx + 1}:desktop`)
      markMedia(s.mobile_image_id, `hero-slide:${idx + 1}:mobile`)
      const base = {
        slideKey,
        id: String(s.id ?? slideKey),
        order: Number(s.order ?? idx),
        titleFirst: String(s.title_first ?? ''),
        titleSecond: s.title_second ? String(s.title_second) : null,
        eyebrow: s.eyebrow ? String(s.eyebrow) : null,
        categoryBadge: s.category_badge ? String(s.category_badge) : null,
        description: s.description ? String(s.description) : null,
        ctaText: String(s.cta_text ?? 'Khám phá ngay'),
        ctaHref: String(s.cta_href ?? '/vehicles'),
        secondaryText: s.secondary_text ? String(s.secondary_text) : null,
        secondaryHref: s.secondary_href ? String(s.secondary_href) : null,
        desktopMediaKey: mediaKeyOf(s.desktop_image_id),
        mobileMediaKey: mediaKeyOf(s.mobile_image_id),
        focalX: Number(s.focal_x ?? 50),
        focalY: Number(s.focal_y ?? 50),
        mobileFocalX: Number(s.mobile_focal_x ?? 50),
        mobileFocalY: Number(s.mobile_focal_y ?? 50),
        relatedCategory: s.related_category ? String(s.related_category) : null,
        relatedModelSlug: s.related_model_id
          ? (modelSlugById.get(String(s.related_model_id)) ?? null)
          : null,
        credit: s.credit ? String(s.credit) : null,
        sourceUrl: s.source_url ? String(s.source_url) : null,
        durationSeconds: s.duration_seconds != null ? Number(s.duration_seconds) : 6,
        active: s.active !== 0,
        updatedAt: siteRow?.updated_at ? String(siteRow.updated_at) : null,
      }
      return {
        ...base,
        recordHash: computeRecordHash(base),
      }
    })

    const bannerRows = siteRow
      ? (db
          .prepare('SELECT * FROM nori_site_hero_images WHERE _parent_id = ? ORDER BY _order ASC')
          .all(siteId) as Record<string, unknown>[])
      : []
    const banners = bannerRows
      .map((b, idx) => {
        const mediaKey = mediaKeyOf(b.image_id)
        if (!mediaKey) return null
        markMedia(b.image_id, `banner:${idx + 1}:image`)
        const base = {
          bannerKey: `banner-${idx + 1}`,
          order: idx + 1,
          mediaKey,
          credit: b.credit ? String(b.credit) : null,
          updatedAt: siteRow?.updated_at ? String(siteRow.updated_at) : null,
        }
        return {
          ...base,
          recordHash: computeRecordHash(base),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const headerMenu = siteRow
      ? (
          db
            .prepare('SELECT * FROM nori_site_header_menu WHERE _parent_id = ? ORDER BY _order ASC')
            .all(siteId) as Record<string, unknown>[]
        ).map((m) => ({
          label: String(m.label),
          href: String(m.href),
          visible: m.visible !== 0,
        }))
      : []

    const footerLinks = siteRow
      ? (
          db
            .prepare(
              'SELECT * FROM nori_site_footer_links WHERE _parent_id = ? ORDER BY _order ASC',
            )
            .all(siteId) as Record<string, unknown>[]
        ).map((f) => ({
          label: String(f.label),
          href: String(f.href),
          group: String(f.group ?? 'Khám phá'),
        }))
      : []

    const socialLinks = siteRow
      ? (
          db
            .prepare(
              'SELECT * FROM nori_site_social_links WHERE _parent_id = ? ORDER BY _order ASC',
            )
            .all(siteId) as Record<string, unknown>[]
        ).map((s) => ({
          platform: String(s.platform),
          url: String(s.url),
        }))
      : []

    const holidays = siteRow
      ? (
          db
            .prepare('SELECT * FROM nori_site_holidays WHERE _parent_id = ? ORDER BY _order ASC')
            .all(siteId) as Record<string, unknown>[]
        ).map((h) => ({
          date: String(h.date),
          name: String(h.name),
        }))
      : []

    const faqs = siteRow
      ? (
          db
            .prepare('SELECT * FROM nori_site_faqs WHERE _parent_id = ? ORDER BY _order ASC')
            .all(siteId) as Record<string, unknown>[]
        ).map((f, idx) => ({
          question: String(f.question),
          answer: String(f.answer),
          order: Number(f.order ?? idx),
        }))
      : []

    const siteSettingsBase = {
      key: 'nori-site',
      id: siteId,
      siteName: String(siteRow?.site_name ?? 'NORI'),
      tagline: String(siteRow?.tagline ?? 'Your way. Every day.'),
      logoMediaKey: mediaKeyOf(siteRow?.logo_id),
      faviconMediaKey: mediaKeyOf(siteRow?.favicon_id),
      ogImageMediaKey: mediaKeyOf(siteRow?.og_image_id),
      storyImageMediaKey: mediaKeyOf(siteRow?.story_image_id),
      seoTitle: siteRow?.seo_title ? String(siteRow.seo_title) : null,
      seoDescription: siteRow?.seo_description ? String(siteRow.seo_description) : null,
      heroAutoplaySeconds: Number(siteRow?.hero_autoplay_seconds ?? 6),
      homeIntroTitle: siteRow?.home_intro_title ? String(siteRow.home_intro_title) : null,
      homeIntroDescription: siteRow?.home_intro_description
        ? String(siteRow.home_intro_description)
        : null,
      showHeroSection: siteRow?.show_hero_section !== 0,
      showBenefitsSection: siteRow?.show_benefits_section !== 0,
      showFeaturedSection: siteRow?.show_featured_section !== 0,
      showHowItWorksSection: siteRow?.show_how_it_works_section !== 0,
      showStorySection: siteRow?.show_story_section !== 0,
      showCtaSection: siteRow?.show_cta_section !== 0,
      headerMenu,
      footerLinks,
      socialLinks,
      aboutSummary: siteRow?.about_summary ? String(siteRow.about_summary) : null,
      address: siteRow?.address ? String(siteRow.address) : null,
      phone: siteRow?.phone ? String(siteRow.phone) : null,
      email: siteRow?.email ? String(siteRow.email) : null,
      openingHours: siteRow?.opening_hours ? String(siteRow.opening_hours) : null,
      businessTimezone: String(siteRow?.business_timezone ?? 'Asia/Ho_Chi_Minh'),
      workingDays: String(siteRow?.working_days ?? '1,2,3,4,5'),
      workStartTime: siteRow?.work_start_time ? String(siteRow.work_start_time) : null,
      workEndTime: siteRow?.work_end_time ? String(siteRow.work_end_time) : null,
      lunchBreakStart: siteRow?.lunch_break_start ? String(siteRow.lunch_break_start) : null,
      lunchBreakEnd: siteRow?.lunch_break_end ? String(siteRow.lunch_break_end) : null,
      holidays,
      contactNote: siteRow?.contact_note ? String(siteRow.contact_note) : null,
      rentalPolicySummary: siteRow?.rental_policy_summary
        ? String(siteRow.rental_policy_summary)
        : null,
      purchasePolicySummary: siteRow?.purchase_policy_summary
        ? String(siteRow.purchase_policy_summary)
        : null,
      ageRequirement: siteRow?.age_requirement ? String(siteRow.age_requirement) : null,
      licenseRequirement: siteRow?.license_requirement ? String(siteRow.license_requirement) : null,
      cancellationPolicy: siteRow?.cancellation_policy ? String(siteRow.cancellation_policy) : null,
      depositPolicy: siteRow?.deposit_policy ? String(siteRow.deposit_policy) : null,
      privacyPolicy: siteRow?.privacy_policy ? String(siteRow.privacy_policy) : null,
      termsOfUse: siteRow?.terms_of_use ? String(siteRow.terms_of_use) : null,
      faqs,
      depositHoldHours: Number(siteRow?.deposit_hold_hours ?? 24),
      maxPendingBookings: Number(siteRow?.max_pending_bookings ?? 5),
      maintenanceBannerEnabled: Boolean(siteRow?.maintenance_banner_enabled),
      maintenanceBannerText: siteRow?.maintenance_banner_text
        ? String(siteRow.maintenance_banner_text)
        : null,
      _status: String(siteRow?._status ?? 'published'),
      updatedAt: siteRow?.updated_at ? String(siteRow.updated_at) : new Date(0).toISOString(),
    }
    const siteSettings = {
      ...siteSettingsBase,
      recordHash: computeRecordHash(siteSettingsBase),
    }

    // 4. Promotions (Shareable public promo definitions; usedCount reset to 0 in snapshot)
    const promoRows = db.prepare('SELECT * FROM promotions ORDER BY code ASC').all() as Record<
      string,
      unknown
    >[]
    const promoCodeById = new Map<string, string>()
    const promotions = promoRows.map((p) => {
      const code = String(p.code)
      promoCodeById.set(String(p.id), code)
      const base = {
        id: String(p.id),
        code,
        name: String(p.name),
        description: p.description ? String(p.description) : null,
        discountType: String(p.discount_type ?? 'PERCENT'),
        discountValue: Number(p.discount_value),
        maxDiscount: p.max_discount != null ? Number(p.max_discount) : null,
        minDays: Number(p.min_days ?? 1),
        appliesTo: String(p.applies_to ?? 'RENT'),
        validFrom: p.valid_from ? String(p.valid_from) : null,
        validTo: p.valid_to ? String(p.valid_to) : null,
        usageLimit: p.usage_limit != null ? Number(p.usage_limit) : null,
        active: Boolean(p.active),
        updatedAt: String(p.updated_at),
      }
      return {
        ...base,
        recordHash: computeRecordHash(base),
      }
    })

    // 5. Articles / Posts (Published public articles only)
    const postRows = db
      .prepare("SELECT * FROM posts WHERE _status = 'published' ORDER BY slug ASC")
      .all() as Record<string, unknown>[]
    const articles = postRows
      .filter((p) => Boolean(p.slug && p.title))
      .map((p) => {
        const slug = String(p.slug)
        markMedia(p.cover_id, `post:${slug}:cover`)
        const base = {
          id: String(p.id),
          slug,
          title: String(p.title),
          category: String(p.category ?? 'NEWS'),
          excerpt: p.excerpt ? String(p.excerpt) : null,
          content: String(p.content ?? ''),
          coverMediaKey: mediaKeyOf(p.cover_id),
          promotionCode: p.promotion_id
            ? (promoCodeById.get(String(p.promotion_id)) ?? null)
            : null,
          publishedAt: p.published_at ? String(p.published_at) : null,
          seoTitle: p.seo_title ? String(p.seo_title) : null,
          seoDescription: p.seo_description ? String(p.seo_description) : null,
          _status: 'published' as const,
          updatedAt: String(p.updated_at),
        }
        return {
          ...base,
          recordHash: computeRecordHash(base),
        }
      })

    // 6. Categories & Brands derived from catalogue
    const categories = [
      {
        code: 'CAR',
        label: 'Ô tô',
        subCategories: [
          { code: 'HATCHBACK', label: 'Hatchback' },
          { code: 'SEDAN', label: 'Sedan' },
          { code: 'SUV', label: 'SUV' },
          { code: 'CUV', label: 'CUV' },
          { code: 'MPV', label: 'MPV' },
          { code: 'COUPE', label: 'Coupe' },
          { code: 'SPORTS', label: 'Xe thể thao' },
          { code: 'ELECTRIC_CAR', label: 'Xe điện' },
        ],
      },
      {
        code: 'MOTORBIKE',
        label: 'Xe máy',
        subCategories: [
          { code: 'MANUAL_BIKE', label: 'Xe số' },
          { code: 'SCOOTER', label: 'Xe tay ga' },
          { code: 'CLUTCH_BIKE', label: 'Xe côn tay' },
          { code: 'BIG_BIKE', label: 'Mô tô phân khối lớn' },
          { code: 'ELECTRIC_BIKE', label: 'Xe máy điện' },
        ],
      },
      {
        code: 'PICKUP',
        label: 'Bán tải',
        subCategories: [
          { code: 'STANDARD_PICKUP', label: 'Bán tải phổ thông' },
          { code: 'WORK_PICKUP', label: 'Bán tải công việc' },
          { code: 'PREMIUM_PICKUP', label: 'Bán tải cao cấp' },
          { code: 'PERFORMANCE_PICKUP', label: 'Bán tải hiệu năng cao' },
        ],
      },
    ]

    const brandMap = new Map<
      string,
      { name: string; categories: Set<string>; modelCount: number }
    >()
    for (const m of vehicleModels) {
      const existing = brandMap.get(m.brand) ?? {
        name: m.brand,
        categories: new Set<string>(),
        modelCount: 0,
      }
      existing.categories.add(m.category)
      existing.modelCount++
      brandMap.set(m.brand, existing)
    }
    const brands = Array.from(brandMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({
        slug: b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: b.name,
        categories: Array.from(b.categories).sort(),
        modelCount: b.modelCount,
      }))

    // 7. Roles & Permissions schema definition (never real accounts!)
    const rolesPermissions = {
      roles: [
        {
          code: 'SUPER_ADMIN',
          collection: 'admins',
          label: 'Quản trị viên cấp cao',
          description: 'Toàn quyền quản trị hệ thống, phân quyền RBAC, đồng bộ dữ liệu và sao lưu.',
        },
        {
          code: 'OPERATOR',
          collection: 'admins',
          label: 'Nhân viên vận hành',
          description: 'Quản lý vận hành theo ma trận quyền RBAC từng module.',
        },
        {
          code: 'CUSTOMER',
          collection: 'users',
          label: 'Khách hàng',
          description: 'Đặt thuê xe, gửi yêu cầu mua xe, quản lý đơn thuê và hồ sơ cá nhân.',
        },
      ],
      modules: [
        'vehicles',
        'models',
        'bookings',
        'inquiries',
        'maintenance',
        'promotions',
        'payments',
        'customers',
        'content',
        'posts',
        'reports',
        'admins',
        'settings',
      ],
      actions: ['read', 'create', 'update', 'delete', 'publish'],
      defaultOperatorPermissions: {
        vehicles: ['read', 'create', 'update'],
        models: ['read', 'update'],
        bookings: ['read', 'update'],
        inquiries: ['read', 'update'],
        maintenance: ['read', 'create', 'update'],
        promotions: ['read'],
        payments: ['read', 'create', 'update'],
        customers: ['read', 'update'],
        content: ['read'],
        posts: ['read', 'create', 'update'],
        reports: ['read'],
        admins: [],
        settings: [],
      },
    }

    // 8. Media Manifest for all referenced media items
    const mediaManifest: MediaManifestItem[] = []
    for (const [mediaId, usageSet] of usedMediaRefs.entries()) {
      const m = mediaById.get(mediaId)
      if (!m || typeof m.filename !== 'string') continue
      const filename = m.filename
      const usedBy = Array.from(usageSet).sort()

      // Locate physical file
      const runtimeFile = path.join(paths.mediaDir, filename)
      let physicalPath: string | null = fs.existsSync(runtimeFile) ? runtimeFile : null
      if (!physicalPath) {
        const seedCandidate = path.join(paths.seedMediaDir, filename)
        if (fs.existsSync(seedCandidate)) physicalPath = seedCandidate
      }
      if (!physicalPath) {
        for (const sub of ['vehicles', 'hero', 'banners', 'articles']) {
          const sharedCandidate = path.join(
            /*turbopackIgnore: true*/ paths.sharedSeedMediaDir,
            sub,
            filename,
          )
          if (fs.existsSync(sharedCandidate)) {
            physicalPath = sharedCandidate
            break
          }
        }
      }

      const checksum = physicalPath ? sha256File(physicalPath) : ''
      const actualSize = physicalPath ? fs.statSync(physicalPath).size : Number(m.filesize ?? 0)

      let repoPath = starterHashToRelPath.get(checksum) || ''
      if (!repoPath) {
        const subFolder = usedBy.some((u) => u.startsWith('hero-slide:'))
          ? 'hero'
          : usedBy.some((u) => u.startsWith('banner:') || u.startsWith('nori-site:'))
            ? 'banners'
            : usedBy.some((u) => u.startsWith('post:'))
              ? 'articles'
              : 'vehicles'
        repoPath = `media/seed/${subFolder}/${filename}`
      }

      mediaManifest.push({
        stableKey: filename,
        id: mediaId,
        filename,
        repoPath,
        mimeType: String(m.mime_type ?? 'image/jpeg'),
        filesize: actualSize,
        width: Number(m.width ?? 1200),
        height: Number(m.height ?? 800),
        focalX: Number(m.focal_x ?? 50),
        focalY: Number(m.focal_y ?? 50),
        alt: String(m.alt ?? filename),
        sourceUrl: m.source_url ? String(m.source_url) : null,
        sourceName: m.source_name ? String(m.source_name) : null,
        license: m.license ? String(m.license) : null,
        modelYear: m.model_year ? String(m.model_year) : null,
        variantName: m.variant_name ? String(m.variant_name) : null,
        colorName: m.color_name ? String(m.color_name) : null,
        mediaCategory: String(m.media_category ?? 'CATALOGUE_REFERENCE'),
        verified: m.verified !== 0,
        checksum,
        version: 1,
        updatedAt: String(m.updated_at),
        usedBy,
      })
    }
    mediaManifest.sort((a, b) => a.stableKey.localeCompare(b.stableKey))

    // Build recordHashes map for conflict tracking
    const recordHashes: Record<string, string> = {}
    for (const m of vehicleModels) recordHashes[`vehicle-model:${m.slug}`] = m.recordHash
    for (const v of vehicles) recordHashes[`vehicle:${v.reference}`] = v.recordHash
    recordHashes['site-settings:nori-site'] = siteSettings.recordHash
    for (const s of heroSlides) recordHashes[`hero-slide:${s.slideKey}`] = s.recordHash
    for (const b of banners) recordHashes[`banner:${b.bannerKey}`] = b.recordHash
    for (const a of articles) recordHashes[`article:${a.slug}`] = a.recordHash
    for (const p of promotions) recordHashes[`promotion:${p.code}`] = p.recordHash
    for (const mm of mediaManifest) recordHashes[`media:${mm.stableKey}`] = mm.checksum.slice(0, 24)

    const contentHash = sha256Buffer(
      JSON.stringify({
        categories,
        brands,
        vehicleModels: vehicleModels.map((x) => x.recordHash),
        vehicles: vehicles.map((x) => x.recordHash),
        siteSettings: siteSettings.recordHash,
        heroSlides: heroSlides.map((x) => x.recordHash),
        banners: banners.map((x) => x.recordHash),
        articles: articles.map((x) => x.recordHash),
        promotions: promotions.map((x) => x.recordHash),
        mediaManifest: mediaManifest.map((x) => ({
          k: x.stableKey,
          c: x.checksum,
          alt: x.alt,
        })),
      }),
    ).slice(0, 24)

    return {
      categories,
      brands,
      vehicleModels,
      vehicles,
      siteSettings,
      heroSlides,
      banners,
      articles,
      promotions,
      rolesPermissions,
      mediaManifest,
      recordHashes,
      contentHash,
    }
  } finally {
    db.close()
  }
}

export function exportSnapshots(options?: {
  rootDir?: string
  dbPath?: string
  snapshotsDir?: string
  mediaDir?: string
  seedMediaDir?: string
  sharedSeedMediaDir?: string
  force?: boolean
  actorEmail?: string
  actorId?: string
}) {
  const paths = resolvePaths(options)
  const manifestPath = path.join(paths.snapshotsDir, 'manifest.json')

  // Guard: Do not overwrite an un-synced external snapshot without --force
  if (!options?.force && fs.existsSync(manifestPath)) {
    try {
      const existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SnapshotManifest
      let syncState: SyncStateFile | null = null
      if (fs.existsSync(paths.dbPath)) {
        const checkDb = new DatabaseSync(paths.dbPath, { readOnly: true })
        try {
          syncState = readSyncState(paths.syncStatePath, checkDb)
        } finally {
          checkDb.close()
        }
      } else {
        syncState = readSyncState(paths.syncStatePath)
      }
      if (
        syncState &&
        syncState.contentHash &&
        existingManifest.contentHash &&
        syncState.contentHash !== existingManifest.contentHash
      ) {
        throw new Error(
          `Snapshot trên đĩa (${existingManifest.snapshotVersion}) đã thay đổi so với lần đồng bộ gần nhất (${syncState.snapshotVersion}). Hãy chạy "npm run data:sync" hoặc "npm run data:import -- --dry-run" trước khi export, hoặc dùng "--force" nếu bạn chắc chắn muốn ghi đè.`,
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Snapshot trên đĩa')) throw err
    }
  }

  const state = extractDatabaseState(options)

  // Copy custom shared media files into media/seed/<subfolder>/
  let copiedMediaFiles = 0
  for (const item of state.mediaManifest) {
    if (item.repoPath.startsWith('media/seed/')) {
      const targetPath = path.join(paths.rootDir, item.repoPath)
      const sourcePath = path.join(paths.mediaDir, item.filename)
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      if (fs.existsSync(sourcePath)) {
        const needsCopy = !fs.existsSync(targetPath) || sha256File(targetPath) !== item.checksum
        if (needsCopy) {
          fs.copyFileSync(sourcePath, targetPath)
          copiedMediaFiles++
        }
      }
    }
  }

  fs.mkdirSync(paths.snapshotsDir, { recursive: true })
  const payloadMap: Record<string, { data: unknown; count: number }> = {
    'categories.json': { data: state.categories, count: state.categories.length },
    'brands.json': { data: state.brands, count: state.brands.length },
    'vehicle-models.json': { data: state.vehicleModels, count: state.vehicleModels.length },
    'vehicles.json': { data: state.vehicles, count: state.vehicles.length },
    'site-settings.json': { data: state.siteSettings, count: 1 },
    'hero-slides.json': { data: state.heroSlides, count: state.heroSlides.length },
    'banners.json': { data: state.banners, count: state.banners.length },
    'articles.json': { data: state.articles, count: state.articles.length },
    'promotions.json': { data: state.promotions, count: state.promotions.length },
    'roles-permissions.json': {
      data: state.rolesPermissions,
      count: state.rolesPermissions.roles.length,
    },
    'media-manifest.json': { data: state.mediaManifest, count: state.mediaManifest.length },
  }

  const filesMeta: Record<string, { sha256: string; recordCount: number }> = {}
  for (const [filename, entry] of Object.entries(payloadMap)) {
    const serialized = canonicalJson(entry.data)
    const targetFile = path.join(paths.snapshotsDir, filename)
    fs.writeFileSync(targetFile, serialized, 'utf8')
    filesMeta[filename] = {
      sha256: sha256Buffer(serialized),
      recordCount: entry.count,
    }
  }

  // Keep exportedAt stable if contentHash hasn't changed, so git diff stays clean!
  let exportedAt = new Date().toISOString()
  if (fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SnapshotManifest
      if (prev.contentHash === state.contentHash && prev.exportedAt) {
        exportedAt = prev.exportedAt
      }
    } catch {
      // ignore
    }
  }

  const snapshotVersion = `snap-${state.contentHash.slice(0, 12)}`
  const manifest: SnapshotManifest = {
    snapshotVersion,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    contentHash: state.contentHash,
    counts: {
      categories: state.categories.length,
      brands: state.brands.length,
      vehicleModels: state.vehicleModels.length,
      vehicles: state.vehicles.length,
      heroSlides: state.heroSlides.length,
      banners: state.banners.length,
      articles: state.articles.length,
      promotions: state.promotions.length,
      media: state.mediaManifest.length,
      rolesPermissions: state.rolesPermissions.roles.length,
    },
    files: filesMeta,
    allowlistedCollections: ALLOWLISTED_SNAPSHOT_COLLECTIONS,
    excludedSensitiveCollections: EXCLUDED_SENSITIVE_COLLECTIONS,
  }

  fs.writeFileSync(manifestPath, canonicalJson(manifest), 'utf8')

  const db = new DatabaseSync(paths.dbPath)
  try {
    writeSyncState(
      paths.syncStatePath,
      {
        snapshotVersion,
        contentHash: state.contentHash,
        syncedAt: new Date().toISOString(),
        recordHashes: state.recordHashes,
      },
      db,
    )
    writeAuditLogSql(db, {
      action: 'data.export',
      entity: 'data-sync',
      entityId: snapshotVersion,
      entityLabel: `Snapshot ${snapshotVersion}`,
      summary: `Xuất dữ liệu Snapshot ${snapshotVersion} (${state.vehicleModels.length} dòng xe, ${state.vehicles.length} xe mẫu, ${state.mediaManifest.length} media)`,
      fromStatus: 'LOCAL_DB',
      toStatus: 'SUCCESS',
      actorType: options?.actorEmail ? 'ADMIN' : 'SYSTEM',
      actorId: options?.actorId ?? null,
      actorEmail: options?.actorEmail ?? null,
    })
  } finally {
    db.close()
  }

  // Validate immediately after export
  const validation = validateSnapshotsAndMedia(options)
  if (!validation.ok) {
    throw new Error(
      `Export hoàn tất nhưng kiểm tra toàn vẹn phát hiện lỗi: ${[
        ...validation.sensitiveViolations,
        ...validation.referentialErrors,
        ...validation.mediaErrors,
        ...validation.schemaErrors,
      ].join('; ')}`,
    )
  }

  return {
    ok: true,
    snapshotVersion,
    contentHash: state.contentHash,
    exportedAt,
    copiedMediaFiles,
    counts: manifest.counts,
    snapshotsDir: paths.snapshotsDir,
  }
}

function scanObjectForSensitiveData(obj: unknown, pathPrefix: string, violations: string[]) {
  if (obj === null || obj === undefined) return
  if (typeof obj === 'string') {
    for (const regex of SENSITIVE_VALUE_PATTERNS) {
      if (regex.test(obj)) {
        violations.push(`${pathPrefix}: Phát hiện giá trị nhạy cảm khớp mẫu bảo mật (${regex})`)
      }
    }
    return
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) =>
      scanObjectForSensitiveData(item, `${pathPrefix}[${idx}]`, violations),
    )
    return
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_FIELD_NAMES.has(k)) {
        violations.push(
          `${pathPrefix}.${k}: Trường dữ liệu nhạy cảm bị cấm xuất hiện trong snapshot`,
        )
      }
      scanObjectForSensitiveData(v, `${pathPrefix}.${k}`, violations)
    }
  }
}

export function validateSnapshotsAndMedia(options?: {
  rootDir?: string
  dbPath?: string
  snapshotsDir?: string
  mediaDir?: string
  seedMediaDir?: string
  sharedSeedMediaDir?: string
}): ValidationReport {
  const paths = resolvePaths(options)
  const sensitiveViolations: string[] = []
  const referentialErrors: string[] = []
  const mediaErrors: string[] = []
  const schemaErrors: string[] = []
  const warnings: string[] = []
  let checkedFiles = 0
  let mediaChecked = 0
  let snapshotVersion: string | null = null

  const manifestPath = path.join(paths.snapshotsDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    schemaErrors.push(`Không tìm thấy manifest.json tại ${manifestPath}`)
    return {
      ok: false,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: null,
      checkedFiles: 0,
      mediaChecked: 0,
      sensitiveViolations,
      referentialErrors,
      mediaErrors,
      schemaErrors,
      warnings,
    }
  }

  let manifest: SnapshotManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SnapshotManifest
    checkedFiles++
    snapshotVersion = manifest.snapshotVersion
  } catch (err) {
    schemaErrors.push(`manifest.json không phải JSON hợp lệ: ${(err as Error).message}`)
    return {
      ok: false,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: null,
      checkedFiles,
      mediaChecked,
      sensitiveViolations,
      referentialErrors,
      mediaErrors,
      schemaErrors,
      warnings,
    }
  }

  if (manifest.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    schemaErrors.push(
      `Phiên bản Schema không tương thích: Snapshot yêu cầu "${manifest.schemaVersion}", hệ thống hiện tại là "${CURRENT_SCHEMA_VERSION}".`,
    )
  }

  // Check for any unauthorized JSON files in snapshotsDir
  const allowedFiles = new Set([
    'manifest.json',
    'categories.json',
    'brands.json',
    'vehicle-models.json',
    'vehicles.json',
    'site-settings.json',
    'hero-slides.json',
    'banners.json',
    'articles.json',
    'promotions.json',
    'roles-permissions.json',
    'media-manifest.json',
  ])
  for (const f of fs.readdirSync(paths.snapshotsDir)) {
    if (f.endsWith('.json') && !allowedFiles.has(f)) {
      const stem = f.replace(/\.json$/i, '')
      if ((EXCLUDED_SENSITIVE_COLLECTIONS as readonly string[]).includes(stem)) {
        sensitiveViolations.push(`Phát hiện file collection nhạy cảm bị cấm trong snapshots: ${f}`)
      } else {
        warnings.push(`File không nằm trong danh sách chuẩn của snapshots: ${f}`)
      }
    }
  }

  const parsedFiles: Record<string, unknown> = {}
  for (const [filename, meta] of Object.entries(manifest.files || {})) {
    const filePath = path.join(paths.snapshotsDir, filename)
    if (!fs.existsSync(filePath)) {
      schemaErrors.push(`Thiếu file snapshot được khai báo trong manifest: ${filename}`)
      continue
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      const actualHash = sha256Buffer(canonicalJson(parsed))
      if (meta.sha256 && actualHash !== meta.sha256) {
        schemaErrors.push(`Checksum của ${filename} không khớp với manifest.json`)
      }
      parsedFiles[filename] = parsed
      checkedFiles++
      scanObjectForSensitiveData(parsed, filename, sensitiveViolations)
    } catch (err) {
      schemaErrors.push(`Lỗi đọc/parse JSON tại ${filename}: ${(err as Error).message}`)
    }
  }

  const mediaManifest =
    (parsedFiles['media-manifest.json'] as MediaManifestItem[] | undefined) || []
  const mediaKeySet = new Set<string>()
  for (const item of mediaManifest) {
    mediaChecked++
    mediaKeySet.add(item.stableKey)
    const repoFile = path.resolve(paths.rootDir, item.repoPath)
    if (!fs.existsSync(repoFile)) {
      mediaErrors.push(`Thiếu file hình ảnh mẫu cho "${item.stableKey}" tại "${item.repoPath}"`)
      continue
    }
    const stat = fs.statSync(repoFile)
    if (stat.size <= 0) {
      mediaErrors.push(`File hình ảnh rỗng (0 byte): "${item.repoPath}"`)
    } else if (stat.size > 8 * 1024 * 1024) {
      mediaErrors.push(
        `File hình ảnh vượt quá giới hạn 8MB: "${item.repoPath}" (${stat.size} bytes)`,
      )
    }
    const actualChecksum = sha256File(repoFile)
    if (item.checksum && actualChecksum !== item.checksum) {
      mediaErrors.push(
        `Checksum file hình ảnh "${item.repoPath}" không khớp với media-manifest.json`,
      )
    }
  }

  // Referential integrity checks
  const models = (parsedFiles['vehicle-models.json'] as Record<string, unknown>[] | undefined) || []
  const modelSlugs = new Set<string>()
  for (const m of models) {
    const slug = String(m.slug ?? '')
    if (!slug) {
      referentialErrors.push('Dòng xe trong vehicle-models.json thiếu slug định danh.')
      continue
    }
    modelSlugs.add(slug)
    if (m.coverMediaKey && !mediaKeySet.has(String(m.coverMediaKey))) {
      referentialErrors.push(
        `Dòng xe "${slug}" tham chiếu coverMediaKey "${m.coverMediaKey}" không tồn tại trong media-manifest.json`,
      )
    }
    const gallery = Array.isArray(m.gallery) ? (m.gallery as Record<string, unknown>[]) : []
    for (const g of gallery) {
      if (g.mediaKey && !mediaKeySet.has(String(g.mediaKey))) {
        referentialErrors.push(
          `Dòng xe "${slug}" gallery tham chiếu mediaKey "${g.mediaKey}" không tồn tại trong media-manifest.json`,
        )
      }
    }
  }

  const vehicles = (parsedFiles['vehicles.json'] as Record<string, unknown>[] | undefined) || []
  for (const v of vehicles) {
    const ref = String(v.reference ?? '')
    const modelSlug = String(v.modelSlug ?? '')
    if (v.isDemo !== true) {
      sensitiveViolations.push(
        `Phương tiện "${ref}" trong vehicles.json không phải dữ liệu mẫu (isDemo != true).`,
      )
    }
    if (!modelSlugs.has(modelSlug)) {
      referentialErrors.push(
        `Phương tiện "${ref}" tham chiếu modelSlug "${modelSlug}" không tồn tại trong vehicle-models.json`,
      )
    }
    const photos = Array.isArray(v.photos) ? (v.photos as Record<string, unknown>[]) : []
    for (const p of photos) {
      if (p.mediaKey && !mediaKeySet.has(String(p.mediaKey))) {
        referentialErrors.push(
          `Phương tiện "${ref}" tham chiếu mediaKey "${p.mediaKey}" không tồn tại trong media-manifest.json`,
        )
      }
    }
  }

  const slides = (parsedFiles['hero-slides.json'] as Record<string, unknown>[] | undefined) || []
  for (const s of slides) {
    const key = String(s.slideKey ?? '')
    if (s.desktopMediaKey && !mediaKeySet.has(String(s.desktopMediaKey))) {
      referentialErrors.push(
        `Hero Slide "${key}" tham chiếu desktopMediaKey "${s.desktopMediaKey}" không tồn tại trong media-manifest.json`,
      )
    }
    if (s.mobileMediaKey && !mediaKeySet.has(String(s.mobileMediaKey))) {
      referentialErrors.push(
        `Hero Slide "${key}" tham chiếu mobileMediaKey "${s.mobileMediaKey}" không tồn tại trong media-manifest.json`,
      )
    }
    if (s.relatedModelSlug && !modelSlugs.has(String(s.relatedModelSlug))) {
      referentialErrors.push(
        `Hero Slide "${key}" tham chiếu relatedModelSlug "${s.relatedModelSlug}" không tồn tại trong vehicle-models.json`,
      )
    }
  }

  const promos = (parsedFiles['promotions.json'] as Record<string, unknown>[] | undefined) || []
  const promoCodes = new Set(promos.map((p) => String(p.code ?? '')))

  const articles = (parsedFiles['articles.json'] as Record<string, unknown>[] | undefined) || []
  for (const a of articles) {
    const slug = String(a.slug ?? '')
    if (a.coverMediaKey && !mediaKeySet.has(String(a.coverMediaKey))) {
      referentialErrors.push(
        `Bài viết "${slug}" tham chiếu coverMediaKey "${a.coverMediaKey}" không tồn tại trong media-manifest.json`,
      )
    }
    if (a.promotionCode && !promoCodes.has(String(a.promotionCode))) {
      referentialErrors.push(
        `Bài viết "${slug}" tham chiếu promotionCode "${a.promotionCode}" không tồn tại trong promotions.json`,
      )
    }
  }

  const ok =
    sensitiveViolations.length === 0 &&
    referentialErrors.length === 0 &&
    mediaErrors.length === 0 &&
    schemaErrors.length === 0

  return {
    ok,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshotVersion,
    checkedFiles,
    mediaChecked,
    sensitiveViolations,
    referentialErrors,
    mediaErrors,
    schemaErrors,
    warnings,
  }
}

function getGitCommitSha(rootDir: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export type BackupManifest = {
  backupId: string
  createdAt: string
  gitCommit: string
  schemaVersion: string
  dbFilename: string
  dbSize: number
  dbSha256: string
  integrityCheck: string
  foreignKeyViolations: number
  migrations: unknown[]
  recordCounts: Record<string, number>
  mediaFiles: { filename: string; size: number; sha256: string }[]
}

export function createFullBackup(options?: {
  rootDir?: string
  dbPath?: string
  mediaDir?: string
  backupsDir?: string
  outPath?: string
  label?: string
  actorEmail?: string
  actorId?: string
}) {
  const paths = resolvePaths(options)
  if (!fs.existsSync(paths.dbPath)) {
    throw new Error(`Không tìm thấy cơ sở dữ liệu nguồn tại: ${paths.dbPath}`)
  }

  fs.mkdirSync(paths.backupsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupId = `nori-backup-${timestamp}`
  const bundleDir = path.join(paths.backupsDir, backupId)
  const bundleMediaDir = path.join(bundleDir, 'media')
  fs.mkdirSync(bundleMediaDir, { recursive: true })

  const targetDbPath = options?.outPath
    ? path.resolve(options.outPath)
    : path.join(paths.backupsDir, `${backupId}.db`)
  const bundleDbPath = path.join(bundleDir, 'nori.db')

  // Consistent SQLite backup using VACUUM INTO
  const sourceDb = new DatabaseSync(paths.dbPath, { readOnly: true })
  let migrations: unknown[] = []
  const recordCounts: Record<string, number> = {}
  let referencedMediaFiles: string[] = []
  try {
    const sanitizedTarget = targetDbPath.replace(/\\/g, '/').replace(/'/g, "''")
    sourceDb.exec(`VACUUM INTO '${sanitizedTarget}'`)
    try {
      migrations = sourceDb.prepare('SELECT * FROM payload_migrations').all()
    } catch {
      migrations = []
    }
    for (const tbl of [
      'admins',
      'users',
      'vehicle_models',
      'vehicles',
      'media',
      'posts',
      'promotions',
      'bookings',
      'sales_inquiries',
      'audit_logs',
    ]) {
      try {
        const c = (sourceDb.prepare(`SELECT count(*) as c FROM ${tbl}`).get() as { c: number }).c
        recordCounts[tbl] = c
      } catch {
        recordCounts[tbl] = 0
      }
    }
    try {
      referencedMediaFiles = (
        sourceDb.prepare('SELECT filename FROM media WHERE filename IS NOT NULL').all() as {
          filename: string
        }[]
      ).map((r) => r.filename)
    } catch {
      referencedMediaFiles = []
    }
  } finally {
    sourceDb.close()
  }

  if (targetDbPath !== bundleDbPath) {
    fs.copyFileSync(targetDbPath, bundleDbPath)
  }

  const verifyDb = new DatabaseSync(targetDbPath, { readOnly: true })
  let integrityCheck = 'unknown'
  let fkViolationsCount = 0
  try {
    const ic = verifyDb.prepare('PRAGMA integrity_check').get() as
      | { integrity_check?: string }
      | undefined
    integrityCheck = ic?.integrity_check ?? 'unknown'
    fkViolationsCount = verifyDb.prepare('PRAGMA foreign_key_check').all().length
  } finally {
    verifyDb.close()
  }

  if (integrityCheck !== 'ok') {
    throw new Error(`Kiểm tra toàn vẹn bản sao lưu thất bại: ${integrityCheck}`)
  }

  // Backup media files referenced in DB
  const backedUpMedia: { filename: string; size: number; sha256: string }[] = []
  if (fs.existsSync(paths.mediaDir)) {
    const uniqueFiles = Array.from(new Set(referencedMediaFiles))
    for (const fname of uniqueFiles) {
      const srcFile = path.join(paths.mediaDir, fname)
      if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
        const destFile = path.join(bundleMediaDir, fname)
        fs.copyFileSync(srcFile, destFile)
        backedUpMedia.push({
          filename: fname,
          size: fs.statSync(destFile).size,
          sha256: sha256File(destFile),
        })
      }
    }
  }

  const dbStat = fs.statSync(targetDbPath)
  const manifest: BackupManifest = {
    backupId,
    createdAt: new Date().toISOString(),
    gitCommit: getGitCommitSha(paths.rootDir),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dbFilename: path.basename(targetDbPath),
    dbSize: dbStat.size,
    dbSha256: sha256File(targetDbPath),
    integrityCheck,
    foreignKeyViolations: fkViolationsCount,
    migrations,
    recordCounts,
    mediaFiles: backedUpMedia,
  }

  const manifestPath = path.join(bundleDir, 'backup-manifest.json')
  fs.writeFileSync(manifestPath, canonicalJson(manifest), 'utf8')

  // Record audit log in source DB
  try {
    const writableDb = new DatabaseSync(paths.dbPath)
    try {
      writeAuditLogSql(writableDb, {
        action: 'data.backup',
        entity: 'backup',
        entityId: backupId,
        entityLabel: `Backup ${backupId}`,
        summary: `Tạo bản sao lưu nhất quán ${backupId} (${(dbStat.size / 1024).toFixed(1)} KB, ${backedUpMedia.length} media files)`,
        fromStatus: 'ONLINE',
        toStatus: 'SUCCESS',
        actorType: options?.actorEmail ? 'ADMIN' : 'SYSTEM',
        actorId: options?.actorId ?? null,
        actorEmail: options?.actorEmail ?? null,
      })
    } finally {
      writableDb.close()
    }
  } catch {
    // ignore if source DB is read-only
  }

  return {
    ok: true,
    backupId,
    dbBackupPath: targetDbPath,
    bundleDir,
    manifestPath,
    manifest,
  }
}

export function restoreFromBackup(options?: {
  rootDir?: string
  sourceBackup?: string
  targetDbPath?: string
  targetMediaDir?: string
  backupsDir?: string
  skipPreBackup?: boolean
  actorEmail?: string
  actorId?: string
}) {
  const paths = resolvePaths({
    rootDir: options?.rootDir,
    dbPath: options?.targetDbPath,
    mediaDir: options?.targetMediaDir,
    backupsDir: options?.backupsDir,
  })

  let selectedDbPath = ''
  let bundleDir: string | null = null
  let manifest: BackupManifest | null = null

  if (options?.sourceBackup) {
    const resolved = path.resolve(paths.rootDir, options.sourceBackup)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      bundleDir = resolved
      selectedDbPath = path.join(resolved, 'nori.db')
      const mPath = path.join(resolved, 'backup-manifest.json')
      if (fs.existsSync(mPath)) {
        manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')) as BackupManifest
      }
    } else if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      selectedDbPath = resolved
      const potentialBundle = resolved.replace(/\.db$/i, '')
      if (fs.existsSync(potentialBundle) && fs.statSync(potentialBundle).isDirectory()) {
        bundleDir = potentialBundle
        const mPath = path.join(potentialBundle, 'backup-manifest.json')
        if (fs.existsSync(mPath)) {
          manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')) as BackupManifest
        }
      }
    } else {
      const byIdInBackups = path.join(paths.backupsDir, options.sourceBackup)
      if (fs.existsSync(byIdInBackups) && fs.statSync(byIdInBackups).isDirectory()) {
        bundleDir = byIdInBackups
        selectedDbPath = path.join(byIdInBackups, 'nori.db')
        const mPath = path.join(byIdInBackups, 'backup-manifest.json')
        if (fs.existsSync(mPath)) {
          manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')) as BackupManifest
        }
      } else if (fs.existsSync(`${byIdInBackups}.db`)) {
        selectedDbPath = `${byIdInBackups}.db`
      } else {
        throw new Error(`Không tìm thấy bản sao lưu cần khôi phục: ${options.sourceBackup}`)
      }
    }
  } else {
    if (!fs.existsSync(paths.backupsDir)) {
      throw new Error(`Không tìm thấy thư mục sao lưu tại: ${paths.backupsDir}`)
    }
    const entries = fs
      .readdirSync(paths.backupsDir)
      .filter((f) => f.startsWith('nori-backup-') && f.endsWith('.db'))
      .sort()
      .reverse()
    if (!entries.length) {
      throw new Error(`Không có file sao lưu nào trong thư mục: ${paths.backupsDir}`)
    }
    selectedDbPath = path.join(paths.backupsDir, entries[0])
    const candidateBundle = selectedDbPath.replace(/\.db$/i, '')
    if (fs.existsSync(candidateBundle) && fs.statSync(candidateBundle).isDirectory()) {
      bundleDir = candidateBundle
      const mPath = path.join(candidateBundle, 'backup-manifest.json')
      if (fs.existsSync(mPath)) {
        manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')) as BackupManifest
      }
    }
  }

  if (!fs.existsSync(/*turbopackIgnore: true*/ selectedDbPath)) {
    throw new Error(`Không tìm thấy file database trong bản sao lưu: ${selectedDbPath}`)
  }

  // Verify backup integrity before touching target
  if (manifest?.dbSha256) {
    const actualSha = sha256File(selectedDbPath)
    if (actualSha !== manifest.dbSha256) {
      throw new Error('Checksum SHA-256 của database sao lưu không khớp với backup-manifest.json.')
    }
  }

  const testDb = new DatabaseSync(selectedDbPath, { readOnly: true })
  try {
    const check = testDb.prepare('PRAGMA integrity_check').get() as
      | { integrity_check?: string }
      | undefined
    if (check?.integrity_check !== 'ok') {
      throw new Error(
        `Bản sao lưu bị hỏng (integrity_check=${check?.integrity_check ?? 'null'}), hủy khôi phục.`,
      )
    }
  } finally {
    testDb.close()
  }

  // Create pre-restore safety backup if target exists
  let preRestoreBackupId: string | null = null
  if (!options?.skipPreBackup && fs.existsSync(paths.dbPath)) {
    try {
      const pre = createFullBackup({
        rootDir: paths.rootDir,
        dbPath: paths.dbPath,
        mediaDir: paths.mediaDir,
        backupsDir: paths.backupsDir,
      })
      preRestoreBackupId = pre.backupId
    } catch {
      // ignore if target DB was corrupted (which is why we're restoring!)
    }
  }

  const targets = options?.targetDbPath
    ? [path.resolve(paths.rootDir, options.targetDbPath)]
    : [paths.dbPath, path.resolve(paths.rootDir, '.next/standalone/nori.db')].filter(
        (p, idx) => idx === 0 || fs.existsSync(path.dirname(p)),
      )

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const sidecar = `${target}${suffix}`
      if (fs.existsSync(/*turbopackIgnore: true*/ sidecar)) {
        fs.unlinkSync(/*turbopackIgnore: true*/ sidecar)
      }
    }
    fs.copyFileSync(selectedDbPath, target)
    const verifyRestored = new DatabaseSync(target, { readOnly: true })
    try {
      const res = verifyRestored.prepare('PRAGMA integrity_check').get() as
        | { integrity_check?: string }
        | undefined
      if (res?.integrity_check !== 'ok') {
        throw new Error(`Kiểm tra toàn vẹn sau khôi phục thất bại tại: ${target}`)
      }
    } finally {
      verifyRestored.close()
    }
  }

  // Restore media files if bundle contains media/
  let restoredMediaCount = 0
  if (bundleDir) {
    const bundleMediaDir = path.join(bundleDir, 'media')
    if (fs.existsSync(bundleMediaDir)) {
      fs.mkdirSync(paths.mediaDir, { recursive: true })
      const files = fs.readdirSync(bundleMediaDir)
      for (const f of files) {
        const srcFile = path.join(bundleMediaDir, f)
        if (!fs.statSync(srcFile).isFile()) continue
        if (manifest?.mediaFiles) {
          const expected = manifest.mediaFiles.find((m) => m.filename === f)
          if (expected && sha256File(srcFile) !== expected.sha256) {
            throw new Error(`Checksum media sao lưu không khớp cho file: ${f}`)
          }
        }
        const destFile = path.join(paths.mediaDir, f)
        fs.copyFileSync(srcFile, destFile)
        restoredMediaCount++
      }
    }
  }

  // Write audit log into restored DB
  try {
    const restoredDb = new DatabaseSync(targets[0])
    try {
      writeAuditLogSql(restoredDb, {
        action: 'data.restore',
        entity: 'backup',
        entityId: manifest?.backupId ?? path.basename(selectedDbPath),
        entityLabel: `Restore ${manifest?.backupId ?? path.basename(selectedDbPath)}`,
        summary: `Khôi phục dữ liệu từ bản sao lưu ${manifest?.backupId ?? path.basename(selectedDbPath)} (${restoredMediaCount} media files)`,
        fromStatus: preRestoreBackupId ?? 'CORRUPTED_OR_PREVIOUS',
        toStatus: 'SUCCESS',
        actorType: options?.actorEmail ? 'ADMIN' : 'SYSTEM',
        actorId: options?.actorId ?? null,
        actorEmail: options?.actorEmail ?? null,
      })
    } finally {
      restoredDb.close()
    }
  } catch {
    // ignore
  }

  return {
    ok: true,
    restoredFrom: selectedDbPath,
    backupId: manifest?.backupId ?? path.basename(selectedDbPath),
    preRestoreBackupId,
    restoredTargets: targets,
    restoredMediaCount,
  }
}

function diffRecordFields(
  localRec: Record<string, unknown>,
  snapRec: Record<string, unknown>,
): {
  changedFields: string[]
  mediaConflict: boolean
  localMedia: string[]
  snapshotMedia: string[]
} {
  const changedFields: string[] = []
  let mediaConflict = false
  const localMedia: string[] = []
  const snapshotMedia: string[] = []

  const allKeys = new Set([...Object.keys(localRec), ...Object.keys(snapRec)])
  for (const k of allKeys) {
    if (k === 'id' || k === 'updatedAt' || k === 'createdAt' || k === 'recordHash') continue
    const lv = JSON.stringify(sortDeep(localRec[k] ?? null))
    const sv = JSON.stringify(sortDeep(snapRec[k] ?? null))
    if (lv !== sv) {
      changedFields.push(k)
      if (
        k.toLowerCase().includes('media') ||
        k === 'photos' ||
        k === 'gallery' ||
        k === 'variants'
      ) {
        mediaConflict = true
        localMedia.push(`${k}=${lv.slice(0, 80)}`)
        snapshotMedia.push(`${k}=${sv.slice(0, 80)}`)
      }
    }
  }
  return { changedFields, mediaConflict, localMedia, snapshotMedia }
}

export function importSnapshots(options?: {
  rootDir?: string
  dbPath?: string
  snapshotsDir?: string
  mediaDir?: string
  seedMediaDir?: string
  sharedSeedMediaDir?: string
  backupsDir?: string
  dryRun?: boolean
  onConflict?: ConflictStrategy
  allowProductionImport?: boolean
  skipBackup?: boolean
  simulateFailure?: boolean
  actorEmail?: string
  actorId?: string
}): ImportResult {
  const paths = resolvePaths(options)
  const dryRun = Boolean(options?.dryRun)
  const onConflict: ConflictStrategy = options?.onConflict || 'abort'

  // Guard against accidental Production snapshot import (writes only; dry-run preview is read-only)
  if (!dryRun && process.env.NORI_ENV === 'production' && !options?.allowProductionImport) {
    return {
      ok: false,
      status: 'ERROR',
      dryRun,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: 'unknown',
      summary: { toCreate: 0, toUpdate: 0, unchanged: 0, conflicts: 0, mediaCopied: 0 },
      details: { created: [], updated: [], unchanged: [], skippedConflicts: [] },
      conflicts: [],
      errors: [
        'Chặn tự động import Development Snapshot vào môi trường Production. Sử dụng cờ --allow-production-import nếu đây là thao tác khởi tạo có chủ đích.',
      ],
    }
  }

  // 1. Validate snapshot integrity, schema version & media files before touching DB
  const validation = validateSnapshotsAndMedia(options)
  if (!validation.ok) {
    return {
      ok: false,
      status: 'VALIDATION_FAILED',
      dryRun,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: validation.snapshotVersion ?? 'invalid',
      summary: { toCreate: 0, toUpdate: 0, unchanged: 0, conflicts: 0, mediaCopied: 0 },
      details: { created: [], updated: [], unchanged: [], skippedConflicts: [] },
      conflicts: [],
      errors: [
        ...validation.schemaErrors,
        ...validation.sensitiveViolations,
        ...validation.referentialErrors,
        ...validation.mediaErrors,
      ],
    }
  }

  // Ensure DB exists and schema is migrated
  if (!fs.existsSync(paths.dbPath)) {
    if (!dryRun) {
      runDatabaseMigration({ rootDir: paths.rootDir, dbPath: paths.dbPath })
    }
  } else {
    const dbCheck = new DatabaseSync(paths.dbPath, { readOnly: true })
    const tableCount = (
      dbCheck
        .prepare(
          "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as { c: number }
    ).c
    dbCheck.close()
    if (tableCount < 80 && !dryRun) {
      runDatabaseMigration({ rootDir: paths.rootDir, dbPath: paths.dbPath })
    }
  }

  const readSnap = <T>(name: string): T =>
    JSON.parse(fs.readFileSync(path.join(paths.snapshotsDir, name), 'utf8')) as T

  const manifest = readSnap<SnapshotManifest>('manifest.json')
  const snapMedia = readSnap<MediaManifestItem[]>('media-manifest.json')
  const snapModels = readSnap<Record<string, unknown>[]>('vehicle-models.json')
  const snapVehicles = readSnap<Record<string, unknown>[]>('vehicles.json')
  const snapSite = readSnap<Record<string, unknown>>('site-settings.json')
  const snapSlides = readSnap<Record<string, unknown>[]>('hero-slides.json')
  const snapBanners = readSnap<Record<string, unknown>[]>('banners.json')
  const snapPromos = readSnap<Record<string, unknown>[]>('promotions.json')
  const snapArticles = readSnap<Record<string, unknown>[]>('articles.json')

  const localExists =
    fs.existsSync(paths.dbPath) &&
    (() => {
      const d = new DatabaseSync(paths.dbPath, { readOnly: true })
      const c = (
        d
          .prepare(
            "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='vehicle_models'",
          )
          .get() as { c: number }
      ).c
      d.close()
      return c > 0
    })()

  const localState = localExists ? extractDatabaseState(options) : null
  const syncState = localExists
    ? (() => {
        const d = new DatabaseSync(paths.dbPath, { readOnly: true })
        try {
          return readSyncState(paths.syncStatePath, d)
        } finally {
          d.close()
        }
      })()
    : null

  const created: string[] = []
  const updated: string[] = []
  const unchanged: string[] = []
  const skippedConflicts: string[] = []
  const conflicts: SyncConflict[] = []

  const checkRecordDisposition = (
    collection: string,
    key: string,
    localRec: Record<string, unknown> | undefined,
    snapRec: Record<string, unknown>,
  ): 'create' | 'update' | 'unchanged' | 'conflict' => {
    const fullKey = `${collection}:${key}`
    const snapHash = String(snapRec.recordHash ?? computeRecordHash(snapRec))
    if (!localRec) {
      created.push(fullKey)
      return 'create'
    }
    const localHash = String(localRec.recordHash ?? computeRecordHash(localRec))
    if (localHash === snapHash) {
      unchanged.push(fullKey)
      return 'unchanged'
    }

    // Check if local record was modified independently from baseline
    const baselineHash = syncState?.recordHashes?.[fullKey]
    const localModifiedSinceSync = baselineHash ? localHash !== baselineHash : false
    const snapModifiedSinceSync = baselineHash ? snapHash !== baselineHash : true
    const localTime = localRec.updatedAt ? Date.parse(String(localRec.updatedAt)) : 0
    const snapTime = snapRec.updatedAt ? Date.parse(String(snapRec.updatedAt)) : 0
    const localIsNewer = localTime > 0 && snapTime > 0 && localTime > snapTime + 1000

    if ((localModifiedSinceSync && snapModifiedSinceSync) || (!baselineHash && localIsNewer)) {
      const diff = diffRecordFields(localRec, snapRec)
      conflicts.push({
        collection,
        key,
        changedFields: diff.changedFields,
        mediaConflict: diff.mediaConflict,
        localMedia: diff.localMedia.length ? diff.localMedia : undefined,
        snapshotMedia: diff.snapshotMedia.length ? diff.snapshotMedia : undefined,
        localUpdatedAt: localRec.updatedAt ? String(localRec.updatedAt) : null,
        snapshotUpdatedAt: snapRec.updatedAt ? String(snapRec.updatedAt) : null,
        localHash,
        snapshotHash: snapHash,
        resolutionHint:
          'Sử dụng --on-conflict=keep-local để giữ dữ liệu máy hiện tại hoặc --on-conflict=prefer-snapshot để áp dụng dữ liệu từ Snapshot.',
      })
      if (onConflict === 'prefer-snapshot') {
        updated.push(fullKey)
        return 'update'
      }
      skippedConflicts.push(fullKey)
      return 'conflict'
    }

    updated.push(fullKey)
    return 'update'
  }

  const localModelsBySlug = new Map(
    (localState?.vehicleModels ?? []).map((m) => [m.slug, m as unknown as Record<string, unknown>]),
  )
  const localVehiclesByRef = new Map(
    (localState?.vehicles ?? []).map((v) => [v.reference, v as unknown as Record<string, unknown>]),
  )
  const localSlidesByKey = new Map(
    (localState?.heroSlides ?? []).map((s) => [
      s.slideKey,
      s as unknown as Record<string, unknown>,
    ]),
  )
  const localBannersByKey = new Map(
    (localState?.banners ?? []).map((b) => [b.bannerKey, b as unknown as Record<string, unknown>]),
  )
  const localPromosByCode = new Map(
    (localState?.promotions ?? []).map((p) => [p.code, p as unknown as Record<string, unknown>]),
  )
  const localArticlesBySlug = new Map(
    (localState?.articles ?? []).map((a) => [a.slug, a as unknown as Record<string, unknown>]),
  )
  const localMediaByKey = new Map((localState?.mediaManifest ?? []).map((m) => [m.stableKey, m]))

  const mediaPlan = new Map<string, 'create' | 'update' | 'unchanged'>()
  let mediaToCopyCount = 0
  for (const m of snapMedia) {
    const targetFile = path.join(paths.mediaDir, m.filename)
    const fileNeedsCopy = !fs.existsSync(targetFile) || sha256File(targetFile) !== m.checksum
    if (fileNeedsCopy) mediaToCopyCount++
    const loc = localMediaByKey.get(m.stableKey)
    if (!loc) {
      mediaPlan.set(m.stableKey, 'create')
      created.push(`media:${m.stableKey}`)
    } else if (loc.checksum !== m.checksum || loc.alt !== m.alt) {
      mediaPlan.set(m.stableKey, 'update')
      updated.push(`media:${m.stableKey}`)
    } else {
      mediaPlan.set(m.stableKey, 'unchanged')
      unchanged.push(`media:${m.stableKey}`)
    }
  }

  const modelPlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const m of snapModels) {
    const slug = String(m.slug)
    modelPlan.set(
      slug,
      checkRecordDisposition('vehicle-model', slug, localModelsBySlug.get(slug), m),
    )
  }

  const vehiclePlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const v of snapVehicles) {
    const ref = String(v.reference)
    vehiclePlan.set(ref, checkRecordDisposition('vehicle', ref, localVehiclesByRef.get(ref), v))
  }

  const siteDisposition = checkRecordDisposition(
    'site-settings',
    'nori-site',
    localState?.siteSettings && localState.siteSettings.address
      ? (localState.siteSettings as unknown as Record<string, unknown>)
      : undefined,
    snapSite,
  )

  const slidePlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const s of snapSlides) {
    const key = String(s.slideKey)
    slidePlan.set(key, checkRecordDisposition('hero-slide', key, localSlidesByKey.get(key), s))
  }

  const bannerPlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const b of snapBanners) {
    const key = String(b.bannerKey)
    bannerPlan.set(key, checkRecordDisposition('banner', key, localBannersByKey.get(key), b))
  }

  const promoPlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const p of snapPromos) {
    const code = String(p.code)
    promoPlan.set(code, checkRecordDisposition('promotion', code, localPromosByCode.get(code), p))
  }

  const articlePlan = new Map<string, ReturnType<typeof checkRecordDisposition>>()
  for (const a of snapArticles) {
    const slug = String(a.slug)
    articlePlan.set(slug, checkRecordDisposition('article', slug, localArticlesBySlug.get(slug), a))
  }

  if (conflicts.length > 0 && onConflict === 'abort') {
    return {
      ok: false,
      status: 'CONFLICT',
      dryRun,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: manifest.snapshotVersion,
      summary: {
        toCreate: created.length,
        toUpdate: updated.length,
        unchanged: unchanged.length,
        conflicts: conflicts.length,
        mediaCopied: 0,
      },
      details: { created, updated, unchanged, skippedConflicts },
      conflicts,
      errors: [
        `Phát hiện ${conflicts.length} xung đột dữ liệu giữa Database cục bộ và Snapshot (${manifest.snapshotVersion}). Không tự động ghi đè.`,
      ],
    }
  }

  if (dryRun) {
    return {
      ok: true,
      status: 'DRY_RUN',
      dryRun: true,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: manifest.snapshotVersion,
      summary: {
        toCreate: created.length,
        toUpdate: updated.length,
        unchanged: unchanged.length,
        conflicts: conflicts.length,
        mediaCopied: mediaToCopyCount,
      },
      details: { created, updated, unchanged, skippedConflicts },
      conflicts,
      errors: [],
    }
  }

  // Create pre-import backup if database already had records
  let backupPath: string | undefined
  if (!options?.skipBackup && localExists) {
    const b = createFullBackup({
      rootDir: paths.rootDir,
      dbPath: paths.dbPath,
      mediaDir: paths.mediaDir,
      backupsDir: paths.backupsDir,
    })
    backupPath = b.dbBackupPath
  }

  // Copy media files to runtime media/ directory
  fs.mkdirSync(paths.mediaDir, { recursive: true })
  let actualMediaCopied = 0
  const stagedMediaCopies: string[] = []
  for (const m of snapMedia) {
    const srcFile = path.resolve(paths.rootDir, m.repoPath)
    const destFile = path.join(paths.mediaDir, m.filename)
    const existedBefore = fs.existsSync(destFile)
    if (!existedBefore || sha256File(destFile) !== m.checksum) {
      fs.copyFileSync(srcFile, destFile)
      actualMediaCopied++
      if (!existedBefore) stagedMediaCopies.push(destFile)
    }
  }

  const db = new DatabaseSync(paths.dbPath)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('BEGIN IMMEDIATE')
    try {
      const now = new Date().toISOString()

      // Upsert Media records
      const mediaIdByKey = new Map<string, string>()
      for (const r of db.prepare('SELECT id, filename FROM media').all() as {
        id: string
        filename: string
      }[]) {
        if (r.filename) mediaIdByKey.set(r.filename, r.id)
      }

      for (const m of snapMedia) {
        const existingId = mediaIdByKey.get(m.stableKey)
        const mediaId = existingId || m.id || deterministicUuid('media', m.stableKey)
        const url = `/api/media/file/${encodeURIComponent(m.filename)}`
        if (existingId) {
          db.prepare(
            `UPDATE media SET
              alt = ?, url = ?, filename = ?, mime_type = ?, filesize = ?,
              width = ?, height = ?, focal_x = ?, focal_y = ?,
              source_url = ?, source_name = ?, license = ?, model_year = ?,
              variant_name = ?, color_name = ?, media_category = ?, verified = ?,
              updated_at = ?
            WHERE id = ?`,
          ).run(
            m.alt,
            url,
            m.filename,
            m.mimeType,
            m.filesize,
            m.width,
            m.height,
            m.focalX,
            m.focalY,
            m.sourceUrl,
            m.sourceName,
            m.license,
            m.modelYear,
            m.variantName,
            m.colorName,
            m.mediaCategory,
            m.verified ? 1 : 0,
            m.updatedAt || now,
            existingId,
          )
        } else {
          db.prepare(
            `INSERT INTO media (
              id, alt, url, filename, mime_type, filesize, width, height,
              focal_x, focal_y, source_url, source_name, license, model_year,
              variant_name, color_name, media_category, verified, _stored,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          ).run(
            mediaId,
            m.alt,
            url,
            m.filename,
            m.mimeType,
            m.filesize,
            m.width,
            m.height,
            m.focalX,
            m.focalY,
            m.sourceUrl,
            m.sourceName,
            m.license,
            m.modelYear,
            m.variantName,
            m.colorName,
            m.mediaCategory,
            m.verified ? 1 : 0,
            m.updatedAt || now,
            m.updatedAt || now,
          )
          mediaIdByKey.set(m.stableKey, mediaId)
        }
      }

      if (options?.simulateFailure) {
        throw new Error('Mô phỏng lỗi giữa quá trình Import để kiểm증 cơ chế Rollback Transaction.')
      }

      // Upsert Vehicle Models
      const modelIdBySlug = new Map<string, string>()
      for (const r of db.prepare('SELECT id, slug FROM vehicle_models').all() as {
        id: string
        slug: string
      }[]) {
        modelIdBySlug.set(r.slug, r.id)
      }

      for (const m of snapModels) {
        const slug = String(m.slug)
        const disp = modelPlan.get(slug)
        const existingId = modelIdBySlug.get(slug)
        const modelId = existingId || String(m.id || deterministicUuid('model', slug))
        modelIdBySlug.set(slug, modelId)

        if (disp === 'unchanged' || disp === 'conflict') continue

        const coverId = m.coverMediaKey ? (mediaIdByKey.get(String(m.coverMediaKey)) ?? null) : null
        const updatedAt = String(m.updatedAt || now)

        if (existingId) {
          db.prepare(
            `UPDATE vehicle_models SET
              name = ?, official_name = ?, brand = ?, model_line = ?, version_name = ?,
              generation = ?, category = ?, sub_category = ?, body_style = ?, segment = ?,
              origin = ?, model_year = ?, seats = ?, fuel_type = ?, transmission = ?,
              drive_type = ?, listed_price = ?, reference_rent_price = ?,
              default_deposit_suggestion = ?, suitable_for = ?, usage_purpose = ?,
              short_description = ?, description = ?, exterior_overview = ?,
              interior_overview = ?, engine_overview = ?, cover_id = ?, source = ?,
              verification_status = ?, visible = ?, featured = ?, sort_order = ?,
              updated_at = ?
            WHERE id = ?`,
          ).run(
            String(m.name),
            m.officialName ? String(m.officialName) : null,
            String(m.brand),
            m.modelLine ? String(m.modelLine) : null,
            m.versionName ? String(m.versionName) : null,
            m.generation ? String(m.generation) : null,
            String(m.category),
            m.subCategory ? String(m.subCategory) : null,
            m.bodyStyle ? String(m.bodyStyle) : null,
            m.segment ? String(m.segment) : null,
            m.origin ? String(m.origin) : null,
            m.modelYear != null ? Number(m.modelYear) : null,
            m.seats != null ? Number(m.seats) : null,
            m.fuelType ? String(m.fuelType) : null,
            m.transmission ? String(m.transmission) : null,
            m.driveType ? String(m.driveType) : null,
            m.listedPrice != null ? Number(m.listedPrice) : null,
            m.referenceRentPrice != null ? Number(m.referenceRentPrice) : null,
            m.defaultDepositSuggestion != null ? Number(m.defaultDepositSuggestion) : null,
            m.suitableFor ? String(m.suitableFor) : null,
            m.usagePurpose ? String(m.usagePurpose) : null,
            m.shortDescription ? String(m.shortDescription) : null,
            m.description ? String(m.description) : null,
            m.exteriorOverview ? String(m.exteriorOverview) : null,
            m.interiorOverview ? String(m.interiorOverview) : null,
            m.engineOverview ? String(m.engineOverview) : null,
            coverId,
            m.source ? String(m.source) : null,
            String(m.verificationStatus ?? 'VERIFIED'),
            m.visible !== false ? 1 : 0,
            m.featured ? 1 : 0,
            Number(m.sortOrder ?? 0),
            updatedAt,
            existingId,
          )
        } else {
          db.prepare(
            `INSERT INTO vehicle_models (
              id, slug, name, official_name, brand, model_line, version_name,
              generation, category, sub_category, body_style, segment, origin,
              model_year, seats, fuel_type, transmission, drive_type, listed_price,
              reference_rent_price, default_deposit_suggestion, suitable_for,
              usage_purpose, short_description, description, exterior_overview,
              interior_overview, engine_overview, cover_id, source,
              verification_status, visible, featured, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            modelId,
            slug,
            String(m.name),
            m.officialName ? String(m.officialName) : null,
            String(m.brand),
            m.modelLine ? String(m.modelLine) : null,
            m.versionName ? String(m.versionName) : null,
            m.generation ? String(m.generation) : null,
            String(m.category),
            m.subCategory ? String(m.subCategory) : null,
            m.bodyStyle ? String(m.bodyStyle) : null,
            m.segment ? String(m.segment) : null,
            m.origin ? String(m.origin) : null,
            m.modelYear != null ? Number(m.modelYear) : null,
            m.seats != null ? Number(m.seats) : null,
            m.fuelType ? String(m.fuelType) : null,
            m.transmission ? String(m.transmission) : null,
            m.driveType ? String(m.driveType) : null,
            m.listedPrice != null ? Number(m.listedPrice) : null,
            m.referenceRentPrice != null ? Number(m.referenceRentPrice) : null,
            m.defaultDepositSuggestion != null ? Number(m.defaultDepositSuggestion) : null,
            m.suitableFor ? String(m.suitableFor) : null,
            m.usagePurpose ? String(m.usagePurpose) : null,
            m.shortDescription ? String(m.shortDescription) : null,
            m.description ? String(m.description) : null,
            m.exteriorOverview ? String(m.exteriorOverview) : null,
            m.interiorOverview ? String(m.interiorOverview) : null,
            m.engineOverview ? String(m.engineOverview) : null,
            coverId,
            m.source ? String(m.source) : null,
            String(m.verificationStatus ?? 'VERIFIED'),
            m.visible !== false ? 1 : 0,
            m.featured ? 1 : 0,
            Number(m.sortOrder ?? 0),
            updatedAt,
            updatedAt,
          )
        }

        // Replace child arrays for this model
        const oldVariants = db
          .prepare('SELECT id FROM vehicle_models_variants WHERE _parent_id = ?')
          .all(modelId) as { id: string }[]
        for (const ov of oldVariants) {
          db.prepare('DELETE FROM vehicle_models_variants_colors WHERE _parent_id = ?').run(ov.id)
        }
        db.prepare('DELETE FROM vehicle_models_variants WHERE _parent_id = ?').run(modelId)
        db.prepare('DELETE FROM vehicle_models_highlights WHERE _parent_id = ?').run(modelId)
        db.prepare('DELETE FROM vehicle_models_features WHERE _parent_id = ?').run(modelId)
        db.prepare('DELETE FROM vehicle_models_gallery WHERE _parent_id = ?').run(modelId)
        db.prepare('DELETE FROM vehicle_models_specifications WHERE _parent_id = ?').run(modelId)

        const highlights = Array.isArray(m.highlights) ? (m.highlights as string[]) : []
        highlights.forEach((hText, idx) => {
          db.prepare(
            'INSERT INTO vehicle_models_highlights (_order, _parent_id, id, text) VALUES (?, ?, ?, ?)',
          ).run(idx + 1, modelId, deterministicUuid('mh', `${slug}:${idx}`), String(hText))
        })

        const features = Array.isArray(m.features) ? (m.features as Record<string, unknown>[]) : []
        features.forEach((f, idx) => {
          db.prepare(
            'INSERT INTO vehicle_models_features (_order, _parent_id, id, name, category, status, variant_note) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            modelId,
            deterministicUuid('mf', `${slug}:${idx}`),
            String(f.name),
            String(f.category ?? 'COMFORT'),
            String(f.status ?? 'EQUIPPED'),
            f.variantNote ? String(f.variantNote) : null,
          )
        })

        const gallery = Array.isArray(m.gallery) ? (m.gallery as Record<string, unknown>[]) : []
        gallery.forEach((g, idx) => {
          const imgId = mediaIdByKey.get(String(g.mediaKey ?? ''))
          if (!imgId) return
          db.prepare(
            `INSERT INTO vehicle_models_gallery (
              _order, _parent_id, id, image_id, kind, photo_type, is_primary,
              sort_order, alt_text, caption, variant_name, color_name,
              source_url, license, verified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            idx + 1,
            modelId,
            deterministicUuid('mg', `${slug}:${idx}`),
            imgId,
            String(g.kind ?? 'EXTERIOR'),
            g.photoType ? String(g.photoType) : null,
            g.isPrimary ? 1 : 0,
            Number(g.sortOrder ?? idx),
            g.altText ? String(g.altText) : null,
            g.caption ? String(g.caption) : null,
            g.variantName ? String(g.variantName) : null,
            g.colorName ? String(g.colorName) : null,
            g.sourceUrl ? String(g.sourceUrl) : null,
            g.license ? String(g.license) : null,
            g.verified !== false ? 1 : 0,
          )
        })

        const specs = Array.isArray(m.specifications)
          ? (m.specifications as Record<string, unknown>[])
          : []
        specs.forEach((s, idx) => {
          db.prepare(
            'INSERT INTO vehicle_models_specifications (_order, _parent_id, id, "group", label, value, variant_name, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            modelId,
            deterministicUuid('ms', `${slug}:${idx}`),
            String(s.group ?? 'OVERVIEW'),
            String(s.label),
            String(s.value),
            s.variantName ? String(s.variantName) : null,
            s.source ? String(s.source) : null,
          )
        })

        const variants = Array.isArray(m.variants) ? (m.variants as Record<string, unknown>[]) : []
        variants.forEach((v, idx) => {
          const varId = deterministicUuid('mv', `${slug}:${idx}`)
          db.prepare(
            `INSERT INTO vehicle_models_variants (
              _order, _parent_id, id, name, year, listed_price, reference_rent_price,
              fuel_type, transmission, drive_type, seats, summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            idx + 1,
            modelId,
            varId,
            String(v.name),
            v.year != null ? Number(v.year) : null,
            v.listedPrice != null ? Number(v.listedPrice) : null,
            v.referenceRentPrice != null ? Number(v.referenceRentPrice) : null,
            v.fuelType ? String(v.fuelType) : null,
            v.transmission ? String(v.transmission) : null,
            v.driveType ? String(v.driveType) : null,
            v.seats != null ? Number(v.seats) : null,
            v.summary ? String(v.summary) : null,
          )
          const colors = Array.isArray(v.colors) ? (v.colors as Record<string, unknown>[]) : []
          colors.forEach((c, cIdx) => {
            const cImgId = c.mediaKey ? (mediaIdByKey.get(String(c.mediaKey)) ?? null) : null
            db.prepare(
              'INSERT INTO vehicle_models_variants_colors (_order, _parent_id, id, name, image_id, hex, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ).run(
              cIdx + 1,
              varId,
              deterministicUuid('mvc', `${slug}:${idx}:${cIdx}`),
              String(c.name),
              cImgId,
              c.hex ? String(c.hex) : null,
              c.sourceUrl ? String(c.sourceUrl) : null,
            )
          })
        })
      }

      // Upsert Vehicles
      const vehicleIdByRef = new Map<string, string>()
      for (const r of db.prepare('SELECT id, reference FROM vehicles').all() as {
        id: string
        reference: string
      }[]) {
        vehicleIdByRef.set(r.reference, r.id)
      }

      for (const v of snapVehicles) {
        const ref = String(v.reference)
        const disp = vehiclePlan.get(ref)
        if (disp === 'unchanged' || disp === 'conflict') continue

        const modelId = modelIdBySlug.get(String(v.modelSlug))
        if (!modelId) continue
        const existingId = vehicleIdByRef.get(ref)
        const vehicleId = existingId || String(v.id || deterministicUuid('vehicle', ref))
        const updatedAt = String(v.updatedAt || now)

        if (existingId) {
          db.prepare(
            `UPDATE vehicles SET
              model_id = ?, license_plate = ?, intent = ?, is_demo = 1,
              vehicle_condition_type = ?, manufacture_year = ?, price_per_day = ?,
              price_per_hour = ?, price_per_week = ?, price_per_month = ?,
              weekend_surcharge = ?, holiday_surcharge = ?, deposit_amount = ?,
              delivery_fee = ?, km_limit_per_day = ?, over_km_fee = ?,
              late_return_fee_per_hour = ?, buffer_hours = ?, sale_price = ?,
              listed_price = ?, discount_price = ?, reservation_deposit = ?,
              estimated_rolling_price = ?, negotiable = ?, warranty_policy = ?,
              price_source_note = ?, odometer = ?, condition = ?,
              exterior_condition = ?, interior_condition = ?, engine_condition = ?,
              maintenance_history = ?, inspected_at = ?, version = ?, color = ?,
              location = ?, pickup_location = ?, operation_status = ?, status = ?,
              updated_at = ?
            WHERE id = ?`,
          ).run(
            modelId,
            String(v.licensePlate),
            String(v.intent ?? 'RENT'),
            String(v.vehicleConditionType ?? 'USED'),
            v.manufactureYear != null ? Number(v.manufactureYear) : null,
            v.pricePerDay != null ? Number(v.pricePerDay) : null,
            v.pricePerHour != null ? Number(v.pricePerHour) : null,
            v.pricePerWeek != null ? Number(v.pricePerWeek) : null,
            v.pricePerMonth != null ? Number(v.pricePerMonth) : null,
            v.weekendSurcharge != null ? Number(v.weekendSurcharge) : null,
            v.holidaySurcharge != null ? Number(v.holidaySurcharge) : null,
            v.depositAmount != null ? Number(v.depositAmount) : null,
            v.deliveryFee != null ? Number(v.deliveryFee) : null,
            v.kmLimitPerDay != null ? Number(v.kmLimitPerDay) : 300,
            v.overKmFee != null ? Number(v.overKmFee) : null,
            v.lateReturnFeePerHour != null ? Number(v.lateReturnFeePerHour) : null,
            v.bufferHours != null ? Number(v.bufferHours) : 2,
            v.salePrice != null ? Number(v.salePrice) : null,
            v.listedPrice != null ? Number(v.listedPrice) : null,
            v.discountPrice != null ? Number(v.discountPrice) : null,
            v.reservationDeposit != null ? Number(v.reservationDeposit) : null,
            v.estimatedRollingPrice != null ? Number(v.estimatedRollingPrice) : null,
            v.negotiable ? 1 : 0,
            v.warrantyPolicy ? String(v.warrantyPolicy) : null,
            v.priceSourceNote ? String(v.priceSourceNote) : null,
            v.odometer != null ? Number(v.odometer) : null,
            v.condition ? String(v.condition) : null,
            v.exteriorCondition ? String(v.exteriorCondition) : null,
            v.interiorCondition ? String(v.interiorCondition) : null,
            v.engineCondition ? String(v.engineCondition) : null,
            v.maintenanceHistory ? String(v.maintenanceHistory) : null,
            v.inspectedAt ? String(v.inspectedAt) : null,
            v.version ? String(v.version) : null,
            v.color ? String(v.color) : null,
            v.location ? String(v.location) : null,
            v.pickupLocation ? String(v.pickupLocation) : null,
            String(v.operationStatus ?? 'READY'),
            String(v.status ?? 'ACTIVE'),
            updatedAt,
            existingId,
          )
        } else {
          db.prepare(
            `INSERT INTO vehicles (
              id, reference, model_id, license_plate, intent, is_demo,
              vehicle_condition_type, manufacture_year, price_per_day,
              price_per_hour, price_per_week, price_per_month,
              weekend_surcharge, holiday_surcharge, deposit_amount,
              delivery_fee, km_limit_per_day, over_km_fee,
              late_return_fee_per_hour, buffer_hours, sale_price,
              listed_price, discount_price, reservation_deposit,
              estimated_rolling_price, negotiable, warranty_policy,
              price_source_note, odometer, condition, exterior_condition,
              interior_condition, engine_condition, maintenance_history,
              inspected_at, version, color, location, pickup_location,
              operation_status, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            vehicleId,
            ref,
            modelId,
            String(v.licensePlate),
            String(v.intent ?? 'RENT'),
            String(v.vehicleConditionType ?? 'USED'),
            v.manufactureYear != null ? Number(v.manufactureYear) : null,
            v.pricePerDay != null ? Number(v.pricePerDay) : null,
            v.pricePerHour != null ? Number(v.pricePerHour) : null,
            v.pricePerWeek != null ? Number(v.pricePerWeek) : null,
            v.pricePerMonth != null ? Number(v.pricePerMonth) : null,
            v.weekendSurcharge != null ? Number(v.weekendSurcharge) : null,
            v.holidaySurcharge != null ? Number(v.holidaySurcharge) : null,
            v.depositAmount != null ? Number(v.depositAmount) : null,
            v.deliveryFee != null ? Number(v.deliveryFee) : null,
            v.kmLimitPerDay != null ? Number(v.kmLimitPerDay) : 300,
            v.overKmFee != null ? Number(v.overKmFee) : null,
            v.lateReturnFeePerHour != null ? Number(v.lateReturnFeePerHour) : null,
            v.bufferHours != null ? Number(v.bufferHours) : 2,
            v.salePrice != null ? Number(v.salePrice) : null,
            v.listedPrice != null ? Number(v.listedPrice) : null,
            v.discountPrice != null ? Number(v.discountPrice) : null,
            v.reservationDeposit != null ? Number(v.reservationDeposit) : null,
            v.estimatedRollingPrice != null ? Number(v.estimatedRollingPrice) : null,
            v.negotiable ? 1 : 0,
            v.warrantyPolicy ? String(v.warrantyPolicy) : null,
            v.priceSourceNote ? String(v.priceSourceNote) : null,
            v.odometer != null ? Number(v.odometer) : null,
            v.condition ? String(v.condition) : null,
            v.exteriorCondition ? String(v.exteriorCondition) : null,
            v.interiorCondition ? String(v.interiorCondition) : null,
            v.engineCondition ? String(v.engineCondition) : null,
            v.maintenanceHistory ? String(v.maintenanceHistory) : null,
            v.inspectedAt ? String(v.inspectedAt) : null,
            v.version ? String(v.version) : null,
            v.color ? String(v.color) : null,
            v.location ? String(v.location) : null,
            v.pickupLocation ? String(v.pickupLocation) : null,
            String(v.operationStatus ?? 'READY'),
            String(v.status ?? 'ACTIVE'),
            updatedAt,
            updatedAt,
          )
          vehicleIdByRef.set(ref, vehicleId)
        }

        db.prepare('DELETE FROM vehicles_photos WHERE _parent_id = ?').run(vehicleId)
        const photos = Array.isArray(v.photos) ? (v.photos as Record<string, unknown>[]) : []
        photos.forEach((p, idx) => {
          const imgId = mediaIdByKey.get(String(p.mediaKey ?? ''))
          if (!imgId) return
          db.prepare(
            `INSERT INTO vehicles_photos (
              _order, _parent_id, id, image_id, caption, kind, photo_type,
              is_primary, sort_order, alt_text, source_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            idx + 1,
            vehicleId,
            deterministicUuid('vp', `${ref}:${idx}`),
            imgId,
            p.caption ? String(p.caption) : null,
            String(p.kind ?? 'EXTERIOR'),
            p.photoType ? String(p.photoType) : null,
            p.isPrimary ? 1 : 0,
            Number(p.sortOrder ?? idx),
            p.altText ? String(p.altText) : null,
            p.sourceName ? String(p.sourceName) : null,
          )
        })
      }

      // Upsert Site Settings, Hero Slides & Banners
      const anySlideChanged = Array.from(slidePlan.values()).some(
        (d) => d === 'create' || d === 'update',
      )
      const anyBannerChanged = Array.from(bannerPlan.values()).some(
        (d) => d === 'create' || d === 'update',
      )
      const shouldUpdateSite =
        siteDisposition === 'create' ||
        siteDisposition === 'update' ||
        anySlideChanged ||
        anyBannerChanged

      if (shouldUpdateSite && siteDisposition !== 'conflict') {
        const existingSite = db.prepare('SELECT id FROM nori_site LIMIT 1').get() as
          | { id: string }
          | undefined
        const siteId =
          existingSite?.id || String(snapSite.id || deterministicUuid('global', 'nori-site'))
        const logoId = snapSite.logoMediaKey
          ? (mediaIdByKey.get(String(snapSite.logoMediaKey)) ?? null)
          : null
        const faviconId = snapSite.faviconMediaKey
          ? (mediaIdByKey.get(String(snapSite.faviconMediaKey)) ?? null)
          : null
        const ogImageId = snapSite.ogImageMediaKey
          ? (mediaIdByKey.get(String(snapSite.ogImageMediaKey)) ?? null)
          : null
        const storyImageId = snapSite.storyImageMediaKey
          ? (mediaIdByKey.get(String(snapSite.storyImageMediaKey)) ?? null)
          : null
        const siteUpdatedAt = String(snapSite.updatedAt || now)

        if (existingSite) {
          db.prepare(
            `UPDATE nori_site SET
              site_name = ?, tagline = ?, logo_id = ?, favicon_id = ?, seo_title = ?,
              seo_description = ?, og_image_id = ?, story_image_id = ?,
              hero_autoplay_seconds = ?, home_intro_title = ?, home_intro_description = ?,
              show_hero_section = ?, show_benefits_section = ?, show_featured_section = ?,
              show_how_it_works_section = ?, show_story_section = ?, show_cta_section = ?,
              about_summary = ?, address = ?, phone = ?, email = ?, opening_hours = ?,
              business_timezone = ?, working_days = ?, work_start_time = ?, work_end_time = ?,
              lunch_break_start = ?, lunch_break_end = ?, contact_note = ?,
              rental_policy_summary = ?, purchase_policy_summary = ?, age_requirement = ?,
              license_requirement = ?, cancellation_policy = ?, deposit_policy = ?,
              privacy_policy = ?, terms_of_use = ?, deposit_hold_hours = ?,
              max_pending_bookings = ?, maintenance_banner_enabled = ?,
              maintenance_banner_text = ?, _status = 'published', updated_at = ?
            WHERE id = ?`,
          ).run(
            String(snapSite.siteName ?? 'NORI'),
            String(snapSite.tagline ?? 'Your way. Every day.'),
            logoId,
            faviconId,
            snapSite.seoTitle ? String(snapSite.seoTitle) : null,
            snapSite.seoDescription ? String(snapSite.seoDescription) : null,
            ogImageId,
            storyImageId,
            Number(snapSite.heroAutoplaySeconds ?? 6),
            snapSite.homeIntroTitle ? String(snapSite.homeIntroTitle) : null,
            snapSite.homeIntroDescription ? String(snapSite.homeIntroDescription) : null,
            snapSite.showHeroSection !== false ? 1 : 0,
            snapSite.showBenefitsSection !== false ? 1 : 0,
            snapSite.showFeaturedSection !== false ? 1 : 0,
            snapSite.showHowItWorksSection !== false ? 1 : 0,
            snapSite.showStorySection !== false ? 1 : 0,
            snapSite.showCtaSection !== false ? 1 : 0,
            snapSite.aboutSummary ? String(snapSite.aboutSummary) : null,
            snapSite.address ? String(snapSite.address) : null,
            snapSite.phone ? String(snapSite.phone) : null,
            snapSite.email ? String(snapSite.email) : null,
            snapSite.openingHours ? String(snapSite.openingHours) : null,
            String(snapSite.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
            String(snapSite.workingDays ?? '1,2,3,4,5'),
            snapSite.workStartTime ? String(snapSite.workStartTime) : null,
            snapSite.workEndTime ? String(snapSite.workEndTime) : null,
            snapSite.lunchBreakStart ? String(snapSite.lunchBreakStart) : null,
            snapSite.lunchBreakEnd ? String(snapSite.lunchBreakEnd) : null,
            snapSite.contactNote ? String(snapSite.contactNote) : null,
            snapSite.rentalPolicySummary ? String(snapSite.rentalPolicySummary) : null,
            snapSite.purchasePolicySummary ? String(snapSite.purchasePolicySummary) : null,
            snapSite.ageRequirement ? String(snapSite.ageRequirement) : null,
            snapSite.licenseRequirement ? String(snapSite.licenseRequirement) : null,
            snapSite.cancellationPolicy ? String(snapSite.cancellationPolicy) : null,
            snapSite.depositPolicy ? String(snapSite.depositPolicy) : null,
            snapSite.privacyPolicy ? String(snapSite.privacyPolicy) : null,
            snapSite.termsOfUse ? String(snapSite.termsOfUse) : null,
            Number(snapSite.depositHoldHours ?? 24),
            Number(snapSite.maxPendingBookings ?? 5),
            snapSite.maintenanceBannerEnabled ? 1 : 0,
            snapSite.maintenanceBannerText ? String(snapSite.maintenanceBannerText) : null,
            siteUpdatedAt,
            siteId,
          )
        } else {
          db.prepare(
            `INSERT INTO nori_site (
              id, site_name, tagline, logo_id, favicon_id, seo_title, seo_description,
              og_image_id, story_image_id, hero_autoplay_seconds, home_intro_title,
              home_intro_description, show_hero_section, show_benefits_section,
              show_featured_section, show_how_it_works_section, show_story_section,
              show_cta_section, about_summary, address, phone, email, opening_hours,
              business_timezone, working_days, work_start_time, work_end_time,
              lunch_break_start, lunch_break_end, contact_note, rental_policy_summary,
              purchase_policy_summary, age_requirement, license_requirement,
              cancellation_policy, deposit_policy, privacy_policy, terms_of_use,
              deposit_hold_hours, max_pending_bookings, maintenance_banner_enabled,
              maintenance_banner_text, _status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
          ).run(
            siteId,
            String(snapSite.siteName ?? 'NORI'),
            String(snapSite.tagline ?? 'Your way. Every day.'),
            logoId,
            faviconId,
            snapSite.seoTitle ? String(snapSite.seoTitle) : null,
            snapSite.seoDescription ? String(snapSite.seoDescription) : null,
            ogImageId,
            storyImageId,
            Number(snapSite.heroAutoplaySeconds ?? 6),
            snapSite.homeIntroTitle ? String(snapSite.homeIntroTitle) : null,
            snapSite.homeIntroDescription ? String(snapSite.homeIntroDescription) : null,
            snapSite.showHeroSection !== false ? 1 : 0,
            snapSite.showBenefitsSection !== false ? 1 : 0,
            snapSite.showFeaturedSection !== false ? 1 : 0,
            snapSite.showHowItWorksSection !== false ? 1 : 0,
            snapSite.showStorySection !== false ? 1 : 0,
            snapSite.showCtaSection !== false ? 1 : 0,
            snapSite.aboutSummary ? String(snapSite.aboutSummary) : null,
            snapSite.address ? String(snapSite.address) : null,
            snapSite.phone ? String(snapSite.phone) : null,
            snapSite.email ? String(snapSite.email) : null,
            snapSite.openingHours ? String(snapSite.openingHours) : null,
            String(snapSite.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
            String(snapSite.workingDays ?? '1,2,3,4,5'),
            snapSite.workStartTime ? String(snapSite.workStartTime) : null,
            snapSite.workEndTime ? String(snapSite.workEndTime) : null,
            snapSite.lunchBreakStart ? String(snapSite.lunchBreakStart) : null,
            snapSite.lunchBreakEnd ? String(snapSite.lunchBreakEnd) : null,
            snapSite.contactNote ? String(snapSite.contactNote) : null,
            snapSite.rentalPolicySummary ? String(snapSite.rentalPolicySummary) : null,
            snapSite.purchasePolicySummary ? String(snapSite.purchasePolicySummary) : null,
            snapSite.ageRequirement ? String(snapSite.ageRequirement) : null,
            snapSite.licenseRequirement ? String(snapSite.licenseRequirement) : null,
            snapSite.cancellationPolicy ? String(snapSite.cancellationPolicy) : null,
            snapSite.depositPolicy ? String(snapSite.depositPolicy) : null,
            snapSite.privacyPolicy ? String(snapSite.privacyPolicy) : null,
            snapSite.termsOfUse ? String(snapSite.termsOfUse) : null,
            Number(snapSite.depositHoldHours ?? 24),
            Number(snapSite.maxPendingBookings ?? 5),
            snapSite.maintenanceBannerEnabled ? 1 : 0,
            snapSite.maintenanceBannerText ? String(snapSite.maintenanceBannerText) : null,
            siteUpdatedAt,
            siteUpdatedAt,
          )
        }

        // Replace nori_site child arrays
        db.prepare('DELETE FROM nori_site_hero_slides WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_hero_images WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_header_menu WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_footer_links WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_social_links WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_holidays WHERE _parent_id = ?').run(siteId)
        db.prepare('DELETE FROM nori_site_faqs WHERE _parent_id = ?').run(siteId)

        snapSlides.forEach((s, idx) => {
          const dId = s.desktopMediaKey
            ? (mediaIdByKey.get(String(s.desktopMediaKey)) ?? null)
            : null
          const mId = s.mobileMediaKey ? (mediaIdByKey.get(String(s.mobileMediaKey)) ?? null) : null
          const relModelId = s.relatedModelSlug
            ? (modelIdBySlug.get(String(s.relatedModelSlug)) ?? null)
            : null
          const slideRowId = String(s.id || deterministicUuid('slide', String(s.slideKey ?? idx)))
          db.prepare(
            `INSERT INTO nori_site_hero_slides (
              _order, _parent_id, id, title_first, title_second, eyebrow,
              category_badge, description, cta_text, cta_href, secondary_text,
              secondary_href, desktop_image_id, mobile_image_id, related_category,
              related_model_id, credit, source_url, duration_seconds, "order",
              active, focal_x, focal_y, mobile_focal_x, mobile_focal_y
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            idx + 1,
            siteId,
            slideRowId,
            String(s.titleFirst ?? ''),
            s.titleSecond ? String(s.titleSecond) : null,
            s.eyebrow ? String(s.eyebrow) : null,
            s.categoryBadge ? String(s.categoryBadge) : null,
            s.description ? String(s.description) : null,
            String(s.ctaText ?? 'Khám phá ngay'),
            String(s.ctaHref ?? '/vehicles'),
            s.secondaryText ? String(s.secondaryText) : null,
            s.secondaryHref ? String(s.secondaryHref) : null,
            dId,
            mId,
            s.relatedCategory ? String(s.relatedCategory) : null,
            relModelId,
            s.credit ? String(s.credit) : null,
            s.sourceUrl ? String(s.sourceUrl) : null,
            s.durationSeconds != null ? Number(s.durationSeconds) : 6,
            Number(s.order ?? idx),
            s.active !== false ? 1 : 0,
            Number(s.focalX ?? 50),
            Number(s.focalY ?? 50),
            Number(s.mobileFocalX ?? 50),
            Number(s.mobileFocalY ?? 50),
          )
        })

        snapBanners.forEach((b, idx) => {
          const imgId = b.mediaKey ? (mediaIdByKey.get(String(b.mediaKey)) ?? null) : null
          if (!imgId) return
          db.prepare(
            'INSERT INTO nori_site_hero_images (_order, _parent_id, id, image_id, credit) VALUES (?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('banner', String(b.bannerKey ?? idx)),
            imgId,
            b.credit ? String(b.credit) : null,
          )
        })

        const hMenu = Array.isArray(snapSite.headerMenu)
          ? (snapSite.headerMenu as Record<string, unknown>[])
          : []
        hMenu.forEach((m, idx) => {
          db.prepare(
            'INSERT INTO nori_site_header_menu (_order, _parent_id, id, label, href, visible) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('hmenu', String(idx)),
            String(m.label),
            String(m.href),
            m.visible !== false ? 1 : 0,
          )
        })

        const fLinks = Array.isArray(snapSite.footerLinks)
          ? (snapSite.footerLinks as Record<string, unknown>[])
          : []
        fLinks.forEach((f, idx) => {
          db.prepare(
            'INSERT INTO nori_site_footer_links (_order, _parent_id, id, label, href, "group") VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('flink', String(idx)),
            String(f.label),
            String(f.href),
            String(f.group ?? 'Khám phá'),
          )
        })

        const sLinks = Array.isArray(snapSite.socialLinks)
          ? (snapSite.socialLinks as Record<string, unknown>[])
          : []
        sLinks.forEach((s, idx) => {
          db.prepare(
            'INSERT INTO nori_site_social_links (_order, _parent_id, id, platform, url) VALUES (?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('slink', String(idx)),
            String(s.platform),
            String(s.url),
          )
        })

        const hols = Array.isArray(snapSite.holidays)
          ? (snapSite.holidays as Record<string, unknown>[])
          : []
        hols.forEach((h, idx) => {
          db.prepare(
            'INSERT INTO nori_site_holidays (_order, _parent_id, id, date, name) VALUES (?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('hol', String(idx)),
            String(h.date),
            String(h.name),
          )
        })

        const faqList = Array.isArray(snapSite.faqs)
          ? (snapSite.faqs as Record<string, unknown>[])
          : []
        faqList.forEach((f, idx) => {
          db.prepare(
            'INSERT INTO nori_site_faqs (_order, _parent_id, id, question, answer, "order") VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            siteId,
            deterministicUuid('faq', String(idx)),
            String(f.question),
            String(f.answer),
            Number(f.order ?? idx),
          )
        })

        // Also synchronize _nori_site_v (latest = 1) so Payload draft queries see the imported version
        db.prepare('UPDATE _nori_site_v SET latest = 0').run()
        const verId = crypto.randomUUID()
        db.prepare(
          `INSERT INTO _nori_site_v (
            id, version_site_name, version_tagline, version_logo_id, version_favicon_id,
            version_seo_title, version_seo_description, version_og_image_id,
            version_story_image_id, version_hero_autoplay_seconds,
            version_home_intro_title, version_home_intro_description,
            version_show_hero_section, version_show_benefits_section,
            version_show_featured_section, version_show_how_it_works_section,
            version_show_story_section, version_show_cta_section,
            version_about_summary, version_address, version_phone, version_email,
            version_opening_hours, version_business_timezone, version_working_days,
            version_work_start_time, version_work_end_time, version_lunch_break_start,
            version_lunch_break_end, version_contact_note, version_rental_policy_summary,
            version_purchase_policy_summary, version_age_requirement,
            version_license_requirement, version_cancellation_policy,
            version_deposit_policy, version_privacy_policy, version_terms_of_use,
            version_deposit_hold_hours, version_max_pending_bookings,
            version_maintenance_banner_enabled, version_maintenance_banner_text,
            version__status, version_created_at, version_updated_at,
            created_at, updated_at, latest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, 1)`,
        ).run(
          verId,
          String(snapSite.siteName ?? 'NORI'),
          String(snapSite.tagline ?? 'Your way. Every day.'),
          logoId,
          faviconId,
          snapSite.seoTitle ? String(snapSite.seoTitle) : null,
          snapSite.seoDescription ? String(snapSite.seoDescription) : null,
          ogImageId,
          storyImageId,
          Number(snapSite.heroAutoplaySeconds ?? 6),
          snapSite.homeIntroTitle ? String(snapSite.homeIntroTitle) : null,
          snapSite.homeIntroDescription ? String(snapSite.homeIntroDescription) : null,
          snapSite.showHeroSection !== false ? 1 : 0,
          snapSite.showBenefitsSection !== false ? 1 : 0,
          snapSite.showFeaturedSection !== false ? 1 : 0,
          snapSite.showHowItWorksSection !== false ? 1 : 0,
          snapSite.showStorySection !== false ? 1 : 0,
          snapSite.showCtaSection !== false ? 1 : 0,
          snapSite.aboutSummary ? String(snapSite.aboutSummary) : null,
          snapSite.address ? String(snapSite.address) : null,
          snapSite.phone ? String(snapSite.phone) : null,
          snapSite.email ? String(snapSite.email) : null,
          snapSite.openingHours ? String(snapSite.openingHours) : null,
          String(snapSite.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
          String(snapSite.workingDays ?? '1,2,3,4,5'),
          snapSite.workStartTime ? String(snapSite.workStartTime) : null,
          snapSite.workEndTime ? String(snapSite.workEndTime) : null,
          snapSite.lunchBreakStart ? String(snapSite.lunchBreakStart) : null,
          snapSite.lunchBreakEnd ? String(snapSite.lunchBreakEnd) : null,
          snapSite.contactNote ? String(snapSite.contactNote) : null,
          snapSite.rentalPolicySummary ? String(snapSite.rentalPolicySummary) : null,
          snapSite.purchasePolicySummary ? String(snapSite.purchasePolicySummary) : null,
          snapSite.ageRequirement ? String(snapSite.ageRequirement) : null,
          snapSite.licenseRequirement ? String(snapSite.licenseRequirement) : null,
          snapSite.cancellationPolicy ? String(snapSite.cancellationPolicy) : null,
          snapSite.depositPolicy ? String(snapSite.depositPolicy) : null,
          snapSite.privacyPolicy ? String(snapSite.privacyPolicy) : null,
          snapSite.termsOfUse ? String(snapSite.termsOfUse) : null,
          Number(snapSite.depositHoldHours ?? 24),
          Number(snapSite.maxPendingBookings ?? 5),
          snapSite.maintenanceBannerEnabled ? 1 : 0,
          snapSite.maintenanceBannerText ? String(snapSite.maintenanceBannerText) : null,
          siteUpdatedAt,
          siteUpdatedAt,
          siteUpdatedAt,
          siteUpdatedAt,
        )

        snapSlides.forEach((s, idx) => {
          const dId = s.desktopMediaKey
            ? (mediaIdByKey.get(String(s.desktopMediaKey)) ?? null)
            : null
          const mId = s.mobileMediaKey ? (mediaIdByKey.get(String(s.mobileMediaKey)) ?? null) : null
          const relModelId = s.relatedModelSlug
            ? (modelIdBySlug.get(String(s.relatedModelSlug)) ?? null)
            : null
          db.prepare(
            `INSERT INTO _nori_site_v_version_hero_slides (
              _order, _parent_id, id, _uuid, title_first, title_second, eyebrow,
              category_badge, description, cta_text, cta_href, secondary_text,
              secondary_href, desktop_image_id, mobile_image_id, related_category,
              related_model_id, credit, source_url, duration_seconds, "order",
              active, focal_x, focal_y, mobile_focal_x, mobile_focal_y
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            String(s.id ?? `slide-${idx + 1}`),
            String(s.titleFirst ?? ''),
            s.titleSecond ? String(s.titleSecond) : null,
            s.eyebrow ? String(s.eyebrow) : null,
            s.categoryBadge ? String(s.categoryBadge) : null,
            s.description ? String(s.description) : null,
            String(s.ctaText ?? 'Khám phá ngay'),
            String(s.ctaHref ?? '/vehicles'),
            s.secondaryText ? String(s.secondaryText) : null,
            s.secondaryHref ? String(s.secondaryHref) : null,
            dId,
            mId,
            s.relatedCategory ? String(s.relatedCategory) : null,
            relModelId,
            s.credit ? String(s.credit) : null,
            s.sourceUrl ? String(s.sourceUrl) : null,
            s.durationSeconds != null ? Number(s.durationSeconds) : 6,
            Number(s.order ?? idx),
            s.active !== false ? 1 : 0,
            Number(s.focalX ?? 50),
            Number(s.focalY ?? 50),
            Number(s.mobileFocalX ?? 50),
            Number(s.mobileFocalY ?? 50),
          )
        })

        snapBanners.forEach((b, idx) => {
          const imgId = b.mediaKey ? (mediaIdByKey.get(String(b.mediaKey)) ?? null) : null
          if (!imgId) return
          db.prepare(
            'INSERT INTO _nori_site_v_version_hero_images (_order, _parent_id, id, _uuid, image_id, credit) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            String(b.bannerKey ?? idx),
            imgId,
            b.credit ? String(b.credit) : null,
          )
        })

        hMenu.forEach((m, idx) => {
          db.prepare(
            'INSERT INTO _nori_site_v_version_header_menu (_order, _parent_id, id, _uuid, label, href, visible) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            `hm-${idx + 1}`,
            String(m.label),
            String(m.href),
            m.visible !== false ? 1 : 0,
          )
        })

        fLinks.forEach((f, idx) => {
          db.prepare(
            'INSERT INTO _nori_site_v_version_footer_links (_order, _parent_id, id, _uuid, label, href, "group") VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            `fl-${idx + 1}`,
            String(f.label),
            String(f.href),
            String(f.group ?? 'Khám phá'),
          )
        })

        sLinks.forEach((s, idx) => {
          db.prepare(
            'INSERT INTO _nori_site_v_version_social_links (_order, _parent_id, id, _uuid, platform, url) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            `sl-${idx + 1}`,
            String(s.platform),
            String(s.url),
          )
        })

        hols.forEach((h, idx) => {
          db.prepare(
            'INSERT INTO _nori_site_v_version_holidays (_order, _parent_id, id, _uuid, date, name) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            `hol-${idx + 1}`,
            String(h.date),
            String(h.name),
          )
        })

        faqList.forEach((f, idx) => {
          db.prepare(
            'INSERT INTO _nori_site_v_version_faqs (_order, _parent_id, id, _uuid, question, answer, "order") VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            idx + 1,
            verId,
            crypto.randomUUID(),
            `faq-${idx + 1}`,
            String(f.question),
            String(f.answer),
            Number(f.order ?? idx),
          )
        })
      }

      // Upsert Promotions
      const promoIdByCode = new Map<string, string>()
      for (const r of db.prepare('SELECT id, code FROM promotions').all() as {
        id: string
        code: string
      }[]) {
        promoIdByCode.set(r.code, r.id)
      }

      for (const p of snapPromos) {
        const code = String(p.code)
        const disp = promoPlan.get(code)
        const existingId = promoIdByCode.get(code)
        const promoId = existingId || String(p.id || deterministicUuid('promo', code))
        promoIdByCode.set(code, promoId)
        if (disp === 'unchanged' || disp === 'conflict') continue

        const updatedAt = String(p.updatedAt || now)
        if (existingId) {
          db.prepare(
            `UPDATE promotions SET
              name = ?, description = ?, discount_type = ?, discount_value = ?,
              max_discount = ?, min_days = ?, applies_to = ?, valid_from = ?,
              valid_to = ?, usage_limit = ?, active = ?, updated_at = ?
            WHERE id = ?`,
          ).run(
            String(p.name),
            p.description ? String(p.description) : null,
            String(p.discountType ?? 'PERCENT'),
            Number(p.discountValue),
            p.maxDiscount != null ? Number(p.maxDiscount) : null,
            Number(p.minDays ?? 1),
            String(p.appliesTo ?? 'RENT'),
            p.validFrom ? String(p.validFrom) : null,
            p.validTo ? String(p.validTo) : null,
            p.usageLimit != null ? Number(p.usageLimit) : null,
            p.active !== false ? 1 : 0,
            updatedAt,
            existingId,
          )
        } else {
          db.prepare(
            `INSERT INTO promotions (
              id, code, name, description, discount_type, discount_value,
              max_discount, min_days, applies_to, valid_from, valid_to,
              usage_limit, used_count, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          ).run(
            promoId,
            code,
            String(p.name),
            p.description ? String(p.description) : null,
            String(p.discountType ?? 'PERCENT'),
            Number(p.discountValue),
            p.maxDiscount != null ? Number(p.maxDiscount) : null,
            Number(p.minDays ?? 1),
            String(p.appliesTo ?? 'RENT'),
            p.validFrom ? String(p.validFrom) : null,
            p.validTo ? String(p.validTo) : null,
            p.usageLimit != null ? Number(p.usageLimit) : null,
            p.active !== false ? 1 : 0,
            updatedAt,
            updatedAt,
          )
        }
      }

      // Upsert Articles (Posts)
      const postIdBySlug = new Map<string, string>()
      for (const r of db.prepare('SELECT id, slug FROM posts WHERE slug IS NOT NULL').all() as {
        id: string
        slug: string
      }[]) {
        postIdBySlug.set(r.slug, r.id)
      }

      for (const a of snapArticles) {
        const slug = String(a.slug)
        const disp = articlePlan.get(slug)
        if (disp === 'unchanged' || disp === 'conflict') continue

        const existingId = postIdBySlug.get(slug)
        const postId = existingId || String(a.id || deterministicUuid('post', slug))
        const coverId = a.coverMediaKey ? (mediaIdByKey.get(String(a.coverMediaKey)) ?? null) : null
        const promoId = a.promotionCode
          ? (promoIdByCode.get(String(a.promotionCode)) ?? null)
          : null
        const updatedAt = String(a.updatedAt || now)

        if (existingId) {
          db.prepare(
            `UPDATE posts SET
              title = ?, category = ?, excerpt = ?, content = ?, cover_id = ?,
              promotion_id = ?, published_at = ?, seo_title = ?, seo_description = ?,
              _status = 'published', updated_at = ?
            WHERE id = ?`,
          ).run(
            String(a.title),
            String(a.category ?? 'NEWS'),
            a.excerpt ? String(a.excerpt) : null,
            String(a.content ?? ''),
            coverId,
            promoId,
            a.publishedAt ? String(a.publishedAt) : null,
            a.seoTitle ? String(a.seoTitle) : null,
            a.seoDescription ? String(a.seoDescription) : null,
            updatedAt,
            existingId,
          )
        } else {
          db.prepare(
            `INSERT INTO posts (
              id, slug, title, category, excerpt, content, cover_id,
              promotion_id, published_at, seo_title, seo_description,
              _status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
          ).run(
            postId,
            slug,
            String(a.title),
            String(a.category ?? 'NEWS'),
            a.excerpt ? String(a.excerpt) : null,
            String(a.content ?? ''),
            coverId,
            promoId,
            a.publishedAt ? String(a.publishedAt) : null,
            a.seoTitle ? String(a.seoTitle) : null,
            a.seoDescription ? String(a.seoDescription) : null,
            updatedAt,
            updatedAt,
          )
          postIdBySlug.set(slug, postId)
        }

        // Sync _posts_v version row for Payload draft-aware queries
        db.prepare('UPDATE _posts_v SET latest = 0 WHERE parent_id = ?').run(postId)
        db.prepare(
          `INSERT INTO _posts_v (
            id, parent_id, version_title, version_slug, version_category,
            version_excerpt, version_content, version_cover_id,
            version_promotion_id, version_published_at, version_seo_title,
            version_seo_description, version__status, version_created_at,
            version_updated_at, created_at, updated_at, latest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, 1)`,
        ).run(
          crypto.randomUUID(),
          postId,
          String(a.title),
          slug,
          String(a.category ?? 'NEWS'),
          a.excerpt ? String(a.excerpt) : null,
          String(a.content ?? ''),
          coverId,
          promoId,
          a.publishedAt ? String(a.publishedAt) : null,
          a.seoTitle ? String(a.seoTitle) : null,
          a.seoDescription ? String(a.seoDescription) : null,
          updatedAt,
          updatedAt,
          updatedAt,
          updatedAt,
        )
      }

      writeAuditLogSql(db, {
        action: 'data.import',
        entity: 'data-sync',
        entityId: manifest.snapshotVersion,
        entityLabel: `Import ${manifest.snapshotVersion}`,
        summary: `Đồng bộ dữ liệu từ Snapshot ${manifest.snapshotVersion}: +${created.length} mới, ~${updated.length} cập nhật, =${unchanged.length} giữ nguyên`,
        fromStatus: syncState?.snapshotVersion ?? 'INITIAL',
        toStatus: 'SUCCESS',
        actorType: options?.actorEmail ? 'ADMIN' : 'SYSTEM',
        actorId: options?.actorId ?? null,
        actorEmail: options?.actorEmail ?? null,
      })

      db.exec('COMMIT')
    } catch (txErr) {
      db.exec('ROLLBACK')
      for (const staged of stagedMediaCopies) {
        try {
          if (fs.existsSync(staged)) fs.unlinkSync(staged)
        } catch {
          // ignore
        }
      }
      throw txErr
    }
  } catch (err) {
    db.close()
    return {
      ok: false,
      status: 'ERROR',
      dryRun: false,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      snapshotVersion: manifest.snapshotVersion,
      backupPath,
      summary: {
        toCreate: 0,
        toUpdate: 0,
        unchanged: unchanged.length,
        conflicts: conflicts.length,
        mediaCopied: 0,
      },
      details: { created: [], updated: [], unchanged, skippedConflicts },
      conflicts,
      errors: [(err as Error).message],
    }
  }
  db.close()

  // Update sync state after successful commit
  const postState = extractDatabaseState(options)
  const dbForKv = new DatabaseSync(paths.dbPath)
  try {
    writeSyncState(
      paths.syncStatePath,
      {
        snapshotVersion: manifest.snapshotVersion,
        contentHash: postState.contentHash,
        syncedAt: new Date().toISOString(),
        recordHashes: postState.recordHashes,
      },
      dbForKv,
    )
  } finally {
    dbForKv.close()
  }

  return {
    ok: true,
    status: 'SUCCESS',
    dryRun: false,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshotVersion: manifest.snapshotVersion,
    backupPath,
    summary: {
      toCreate: created.length,
      toUpdate: updated.length,
      unchanged: unchanged.length,
      conflicts: conflicts.length,
      mediaCopied: actualMediaCopied,
    },
    details: { created, updated, unchanged, skippedConflicts },
    conflicts,
    errors: [],
  }
}

export function getDataSyncStatus(options?: {
  rootDir?: string
  dbPath?: string
  snapshotsDir?: string
  mediaDir?: string
  backupsDir?: string
}) {
  const paths = resolvePaths(options)
  const manifestPath = path.join(paths.snapshotsDir, 'manifest.json')
  const hasSnapshot = fs.existsSync(manifestPath)
  let manifest: SnapshotManifest | null = null
  if (hasSnapshot) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SnapshotManifest
    } catch {
      manifest = null
    }
  }

  const dbState = fs.existsSync(paths.dbPath) ? extractDatabaseState(options) : null
  const validation = hasSnapshot ? validateSnapshotsAndMedia(options) : null
  const dryRunImport = hasSnapshot ? importSnapshots({ ...options, dryRun: true }) : null

  // Compare DB records vs Snapshot records to see how many local DB records are unexported
  let unexportedCount = 0
  const unexportedByCollection: Record<string, number> = {
    vehicleModels: 0,
    vehicles: 0,
    siteSettings: 0,
    heroSlides: 0,
    banners: 0,
    articles: 0,
    promotions: 0,
    media: 0,
  }

  if (dbState && hasSnapshot) {
    try {
      const snapModels = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'vehicle-models.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapVehicles = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'vehicles.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapSite = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'site-settings.json'), 'utf8'),
      ) as Record<string, unknown>
      const snapSlides = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'hero-slides.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapBanners = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'banners.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapArticles = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'articles.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapPromos = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'promotions.json'), 'utf8'),
      ) as Record<string, unknown>[]
      const snapMedia = JSON.parse(
        fs.readFileSync(path.join(paths.snapshotsDir, 'media-manifest.json'), 'utf8'),
      ) as MediaManifestItem[]

      const diffCount = (
        dbItems: { key: string; hash: string }[],
        snapItems: { key: string; hash: string }[],
      ) => {
        const sMap = new Map(snapItems.map((i) => [i.key, i.hash]))
        let c = 0
        for (const d of dbItems) {
          if (sMap.get(d.key) !== d.hash) c++
        }
        return c
      }

      unexportedByCollection.vehicleModels = diffCount(
        dbState.vehicleModels.map((m) => ({ key: m.slug, hash: m.recordHash })),
        snapModels.map((m) => ({ key: String(m.slug), hash: String(m.recordHash) })),
      )
      unexportedByCollection.vehicles = diffCount(
        dbState.vehicles.map((v) => ({ key: v.reference, hash: v.recordHash })),
        snapVehicles.map((v) => ({ key: String(v.reference), hash: String(v.recordHash) })),
      )
      unexportedByCollection.siteSettings =
        dbState.siteSettings.recordHash !== String(snapSite.recordHash) ? 1 : 0
      unexportedByCollection.heroSlides = diffCount(
        dbState.heroSlides.map((s) => ({ key: s.slideKey, hash: s.recordHash })),
        snapSlides.map((s) => ({ key: String(s.slideKey), hash: String(s.recordHash) })),
      )
      unexportedByCollection.banners = diffCount(
        dbState.banners.map((b) => ({ key: b.bannerKey, hash: b.recordHash })),
        snapBanners.map((b) => ({ key: String(b.bannerKey), hash: String(b.recordHash) })),
      )
      unexportedByCollection.articles = diffCount(
        dbState.articles.map((a) => ({ key: a.slug, hash: a.recordHash })),
        snapArticles.map((a) => ({ key: String(a.slug), hash: String(a.recordHash) })),
      )
      unexportedByCollection.promotions = diffCount(
        dbState.promotions.map((p) => ({ key: p.code, hash: p.recordHash })),
        snapPromos.map((p) => ({ key: String(p.code), hash: String(p.recordHash) })),
      )
      unexportedByCollection.media = diffCount(
        dbState.mediaManifest.map((m) => ({ key: m.stableKey, hash: m.checksum })),
        snapMedia.map((m) => ({ key: m.stableKey, hash: m.checksum })),
      )

      unexportedCount = Object.values(unexportedByCollection).reduce((a, b) => a + b, 0)
    } catch {
      // ignore
    }
  } else if (dbState && !hasSnapshot) {
    unexportedCount =
      dbState.vehicleModels.length +
      dbState.vehicles.length +
      dbState.heroSlides.length +
      dbState.articles.length +
      dbState.promotions.length +
      1
  }

  // Recent backups list
  const backups: {
    backupId: string
    createdAt: string
    sizeBytes: number
    hasMediaBundle: boolean
    mediaCount: number
    integrity: string
  }[] = []
  if (fs.existsSync(paths.backupsDir)) {
    const dbFiles = fs
      .readdirSync(paths.backupsDir)
      .filter((f) => f.startsWith('nori-backup-') && f.endsWith('.db'))
      .sort()
      .reverse()
      .slice(0, 10)
    for (const f of dbFiles) {
      const fullDb = path.join(paths.backupsDir, f)
      const stat = fs.statSync(fullDb)
      const bId = f.replace(/\.db$/i, '')
      const bundleManifestPath = path.join(paths.backupsDir, bId, 'backup-manifest.json')
      let hasBundle = false
      let mediaCount = 0
      let createdAt = stat.mtime.toISOString()
      let integrity = 'ok'
      if (fs.existsSync(bundleManifestPath)) {
        try {
          const bm = JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8')) as BackupManifest
          hasBundle = true
          mediaCount = bm.mediaFiles?.length ?? 0
          createdAt = bm.createdAt || createdAt
          integrity = bm.integrityCheck || 'ok'
        } catch {
          // ignore
        }
      }
      backups.push({
        backupId: bId,
        createdAt,
        sizeBytes: stat.size,
        hasMediaBundle: hasBundle,
        mediaCount,
        integrity,
      })
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshotVersion: manifest?.snapshotVersion ?? null,
    lastExportedAt: manifest?.exportedAt ?? null,
    snapshotContentHash: manifest?.contentHash ?? null,
    dbContentHash: dbState?.contentHash ?? null,
    inSyncWithSnapshot:
      Boolean(manifest && dbState && manifest.contentHash === dbState.contentHash) &&
      unexportedCount === 0,
    unexportedCount,
    unexportedByCollection,
    counts: dbState
      ? {
          vehicleModels: dbState.vehicleModels.length,
          vehicles: dbState.vehicles.length,
          heroSlides: dbState.heroSlides.length,
          banners: dbState.banners.length,
          articles: dbState.articles.length,
          promotions: dbState.promotions.length,
          referencedMedia: dbState.mediaManifest.length,
        }
      : null,
    validation: validation
      ? {
          ok: validation.ok,
          checkedFiles: validation.checkedFiles,
          mediaChecked: validation.mediaChecked,
          errorCount:
            validation.schemaErrors.length +
            validation.sensitiveViolations.length +
            validation.referentialErrors.length +
            validation.mediaErrors.length,
          errors: [
            ...validation.schemaErrors,
            ...validation.sensitiveViolations,
            ...validation.referentialErrors,
            ...validation.mediaErrors,
          ],
        }
      : null,
    pendingImportPreview: dryRunImport
      ? {
          status: dryRunImport.status,
          toCreate: dryRunImport.summary.toCreate,
          toUpdate: dryRunImport.summary.toUpdate,
          unchanged: dryRunImport.summary.unchanged,
          conflicts: dryRunImport.summary.conflicts,
          conflictDetails: dryRunImport.conflicts,
        }
      : null,
    lastBackupAt: backups[0]?.createdAt ?? null,
    backups,
  }
}
