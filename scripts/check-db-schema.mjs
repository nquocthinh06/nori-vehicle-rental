import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Standard schema expectations for all NORI collections and migrations
export const REQUIRED_SCHEMA_CONTRACT = {
  bookings: [
    'id',
    'booking_key',
    'customer_id',
    'vehicle_id',
    'start_date',
    'end_date',
    'total_price',
    'status',
    'deposit_snapshot',
    'initial_payment_due',
    'remaining_amount',
    'payment_option',
    'reservation_deposit_snapshot',
    'pickup_branch_id',
    'return_branch_id',
    'is_one_way',
  ],
  payments: [
    'id',
    'booking_id',
    'payment_type',
    'amount',
    'status',
    'provider',
    'environment',
    'received_amount',
    'reconciliation_status',
  ],
  notifications: ['id', 'customer_id', 'booking_id', 'type', 'title', 'message', 'is_read'],
  vehicles: [
    'id',
    'reference',
    'license_plate',
    'model_id',
    'status',
    'operation_status',
    'managing_branch_id',
    'current_branch_id',
    'allocation_status',
  ],
  admins: [
    'id',
    'email',
    'hash',
    'salt',
    'admin_role',
    'staff_title',
    'branch_scope_mode',
    'account_status',
  ],
  users: ['id', 'email', 'hash', 'salt', 'full_name', 'status'],
  branches: ['id', 'code', 'name', 'status'],
  warehouses: ['id', 'code', 'name', 'branch_id', 'status'],
  service_locations: ['id', 'code', 'name', 'branch_id', 'status'],
  delivery_jobs: ['id', 'job_code', 'booking_id', 'status'],
  location_pricing_rules: ['id', 'code', 'scope_type', 'active'],
  one_way_rental_rules: ['id', 'route_key', 'from_branch_id', 'to_branch_id', 'active'],
  nori_site: ['id', 'online_payment_enabled', 'allow_sepay_qr'],
  media: ['id', 'filename', 'url', 'prefix', '_objectkey'],
}

export const REGISTERED_MIGRATIONS = [
  '20261120_010000_online_payment_integration',
  '20261120_020000_multi_branch_management',
  '20261120_030000_booking_payment_option_plans',
  '20261121_040000_media_cloud_storage_columns',
]

export function checkDatabaseCompatibility(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd())
  const rawDb =
    options.dbPath ||
    process.env.NORI_SQLITE_PATH ||
    (process.env.DATABASE_URI?.startsWith('file:')
      ? process.env.DATABASE_URI.slice(5)
      : process.env.DATABASE_URI) ||
    'nori.db'
  const dbPath = path.resolve(rootDir, rawDb)

  if (!fs.existsSync(dbPath)) {
    return {
      ok: false,
      dbPath,
      exists: false,
      reason: 'FILE_NOT_FOUND',
      error: `Database file does not exist: ${dbPath}`,
      missingTables: Object.keys(REQUIRED_SCHEMA_CONTRACT),
      missingColumns: {},
      pendingMigrations: REGISTERED_MIGRATIONS,
      integrity: 'unknown',
      fkViolations: 0,
    }
  }

  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const integrityRow = db.prepare('PRAGMA integrity_check').get()
    const integrity = integrityRow?.integrity_check ?? 'unknown'
    const fkRows = db.prepare('PRAGMA foreign_key_check').all()
    const fkViolations = fkRows.length

    // 1. Check Tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
    const tableNames = new Set(tables.map((t) => t.name))

    const missingTables = []
    const missingColumns = {}

    for (const [table, reqCols] of Object.entries(REQUIRED_SCHEMA_CONTRACT)) {
      if (!tableNames.has(table)) {
        missingTables.push(table)
        continue
      }
      const cols = db.prepare(`PRAGMA table_info('${table}')`).all()
      const colNames = new Set(cols.map((c) => c.name))
      const missingInTable = reqCols.filter((c) => !colNames.has(c))
      if (missingInTable.length > 0) {
        missingColumns[table] = missingInTable
      }
    }

    // 2. Check Migrations
    const hasMigrationsTable = tableNames.has('payload_migrations')
    const appliedMigrations = new Set()
    if (hasMigrationsTable) {
      const migRows = db.prepare('SELECT name FROM payload_migrations').all()
      for (const m of migRows) {
        if (m?.name) appliedMigrations.add(m.name)
      }
    }

    const pendingMigrations = REGISTERED_MIGRATIONS.filter((m) => !appliedMigrations.has(m))

    const isSchemaValid =
      missingTables.length === 0 &&
      Object.keys(missingColumns).length === 0 &&
      pendingMigrations.length === 0
    const isIntegrityOk = integrity === 'ok' && fkViolations === 0

    const ok = isSchemaValid && isIntegrityOk

    return {
      ok,
      dbPath,
      exists: true,
      integrity,
      fkViolations,
      tablesCount: tableNames.size,
      missingTables,
      missingColumns,
      pendingMigrations,
      appliedMigrationsCount: appliedMigrations.size,
    }
  } finally {
    db.close()
  }
}

function parseCliArgs() {
  const args = process.argv.slice(2)
  let dbPath = null
  let quiet = false
  let jsonMode = false
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--db' && args[i + 1]) {
      dbPath = args[i + 1]
      i += 1
    } else if (args[i].startsWith('--db=')) {
      dbPath = args[i].slice(5)
    } else if (args[i] === '--quiet' || args[i] === '-q') {
      quiet = true
    } else if (args[i] === '--json') {
      jsonMode = true
    }
  }
  return { dbPath, quiet, jsonMode }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename || '')) {
  const { dbPath, quiet, jsonMode } = parseCliArgs()
  const res = checkDatabaseCompatibility({ dbPath })

  if (jsonMode) {
    console.log(JSON.stringify(res, null, 2))
    process.exit(res.ok ? 0 : 1)
  }

  if (res.ok) {
    if (!quiet) {
      console.log(
        `[DB-PREFLIGHT] OK: ${path.basename(res.dbPath)} (${res.tablesCount} tables, integrity=${res.integrity}, 0 FK violations, 0 pending migrations)`,
      )
    }
    process.exit(0)
  } else {
    console.error('\n========================================================')
    console.error(' [DB-PREFLIGHT] DATABASE SCHEMA MISMATCH / INCOMPATIBLE')
    console.error('========================================================')
    console.error(`Database:  ${res.dbPath}`)
    console.error(`Integrity: ${res.integrity} (FK Violations: ${res.fkViolations})`)

    if (res.missingTables?.length > 0) {
      console.error(`\nMissing required tables (${res.missingTables.length}):`)
      for (const t of res.missingTables) {
        console.error(`  - [TABLE] ${t}`)
      }
    }

    if (res.missingColumns && Object.keys(res.missingColumns).length > 0) {
      console.error('\nMissing required columns by table:')
      for (const [table, cols] of Object.entries(res.missingColumns)) {
        console.error(`  - Table "${table}": missing [${cols.join(', ')}]`)
      }
    }

    if (res.pendingMigrations?.length > 0) {
      console.error(`\nPending migrations to apply (${res.pendingMigrations.length}):`)
      for (const m of res.pendingMigrations) {
        console.error(`  - [MIGRATION] ${m}`)
      }
    }

    console.error('\n--------------------------------------------------------')
    console.error('Hướng dẫn khắc phục an toàn:')
    console.error('  1. Chạy lệnh migration chính thức:')
    console.error('     pnpm db:migrate')
    console.error('  2. Hoặc khởi động kèm tự động sao lưu & migrate an toàn:')
    console.error('     node scripts/migrate-db-safe.mjs')
    console.error('========================================================\n')
    process.exit(1)
  }
}
