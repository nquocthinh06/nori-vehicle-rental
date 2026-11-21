import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createPostgresPoolConfig } from '../src/lib/postgres-url.ts'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const rootDir = path.resolve(dirname, '..')

const CORE_TABLES = [
  'admins',
  'users',
  'branches',
  'warehouses',
  'service_locations',
  'branch_staff',
  'vehicle_models',
  'vehicles',
  'bookings',
  'rental_days',
  'payments',
  'payment_events',
  'refunds',
  'promotions',
  'reviews',
  'notifications',
  'posts',
  'media',
  'audit_logs',
  'nori_site',
  'consultations',
  'sales_inquiries',
]

export function loadDotEnvIfNeeded() {
  if (!process.env.DATABASE_URL && fs.existsSync(path.join(rootDir, '.env'))) {
    const content = fs.readFileSync(path.join(rootDir, '.env'), 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      const k = line.slice(0, eq).trim()
      let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[k]) process.env[k] = v
    }
  }
}

export function extractExpectedPostgresSchema(
  schemaPath = path.join(rootDir, 'src/payload-generated-schema.ts'),
) {
  const schemaSrc = fs.readFileSync(schemaPath, 'utf8')
  const tableBlocks = [
    ...schemaSrc.matchAll(/export const \w+ = pgTable\(\s*'([^']+)',\s*\{([\s\S]*?)\n  \},/g),
  ]
  const expectedColsByTable = new Map()
  for (const [, tableName, body] of tableBlocks) {
    const cols = new Set()
    for (const m of body.matchAll(
      /\b(?:uuid|varchar|text|boolean|numeric|integer|serial|timestamp|jsonb|enum_[\w]+)\(\s*'([^']+)'/g,
    )) {
      cols.add(m[1])
    }
    if (tableName === 'media') {
      cols.add('prefix')
      cols.add('_objectkey')
    }
    if (tableName === '_media_v') {
      cols.add('version_prefix')
      cols.add('version__objectkey')
    }
    expectedColsByTable.set(tableName, cols)
  }
  return expectedColsByTable
}

export function getRegisteredPostgresMigrationNames(
  migrationsDir = path.join(rootDir, 'src/migrations-postgres'),
) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort()
    .map((f) => f.replace(/\.ts$/, ''))
}

export function assertMigrationEnvironmentAllowed({
  isAuditOnly,
  isProductionTarget,
  confirmProduction,
}) {
  if (isAuditOnly) return
  if (isProductionTarget && !confirmProduction) {
    throw new Error(
      '[PG-MIGRATE-GUARD] Refusing to mutate Neon Production without explicit --confirm-production flag (or NORI_CONFIRM_PG_PROD_MIGRATION=1). Preview, CI, and Local Dev must never auto-modify Production.',
    )
  }
}

export async function auditPostgresDatabase(client) {
  const expectedColsByTable = extractExpectedPostgresSchema()
  const actualColsRes = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  )
  const actualColsByTable = new Map()
  for (const row of actualColsRes.rows) {
    if (!actualColsByTable.has(row.table_name)) {
      actualColsByTable.set(row.table_name, new Set())
    }
    actualColsByTable.get(row.table_name).add(row.column_name)
  }

  const schemaDiffs = []
  for (const [tableName, expectedCols] of expectedColsByTable.entries()) {
    const actualCols = actualColsByTable.get(tableName)
    if (!actualCols) {
      schemaDiffs.push({ table: tableName, issue: 'MISSING_TABLE', missingCols: [], extraCols: [] })
      continue
    }
    const missingCols = [...expectedCols].filter((c) => !actualCols.has(c))
    const extraCols = [...actualCols].filter((c) => !expectedCols.has(c))
    if (missingCols.length > 0 || extraCols.length > 0) {
      schemaDiffs.push({ table: tableName, issue: 'COLUMN_DIFF', missingCols, extraCols })
    }
  }

  const migRes = await client.query(
    'SELECT id, name, batch, created_at, updated_at FROM payload_migrations ORDER BY id ASC',
  )
  const appliedMigrations = migRes.rows
  const devMarkers = appliedMigrations.filter((m) => Number(m.batch) === -1)
  const appliedNames = new Set(
    appliedMigrations.filter((m) => Number(m.batch) !== -1).map((m) => m.name),
  )
  const registeredMigrations = getRegisteredPostgresMigrationNames()
  const pendingMigrations = registeredMigrations.filter((name) => !appliedNames.has(name))

  const rowCounts = {}
  for (const table of CORE_TABLES) {
    if (actualColsByTable.has(table)) {
      const r = await client.query(`SELECT count(*)::int AS c FROM "${table}"`)
      rowCounts[table] = r.rows[0].c
    } else {
      rowCounts[table] = null
    }
  }

  const orphanRes = await client.query(`
    SELECT
      (SELECT count(*)::int FROM bookings b LEFT JOIN users u ON b.customer_id = u.id WHERE b.customer_id IS NOT NULL AND u.id IS NULL) AS orphan_booking_customer,
      (SELECT count(*)::int FROM bookings b LEFT JOIN vehicles v ON b.vehicle_id = v.id WHERE b.vehicle_id IS NOT NULL AND v.id IS NULL) AS orphan_booking_vehicle,
      (SELECT count(*)::int FROM rental_days rd LEFT JOIN vehicles v ON rd.vehicle_id = v.id WHERE rd.vehicle_id IS NOT NULL AND v.id IS NULL) AS orphan_rentalday_vehicle,
      (SELECT count(*)::int FROM payments p LEFT JOIN bookings b ON p.booking_id = b.id WHERE p.booking_id IS NOT NULL AND b.id IS NULL) AS orphan_payment_booking,
      (SELECT count(*)::int FROM vehicles v LEFT JOIN vehicle_models m ON v.model_id = m.id WHERE v.model_id IS NOT NULL AND m.id IS NULL) AS orphan_vehicle_model
  `)

  const orphanFk = orphanRes.rows[0]
  const totalOrphans = Object.values(orphanFk).reduce((acc, n) => acc + Number(n || 0), 0)

  return {
    ok:
      schemaDiffs.length === 0 &&
      devMarkers.length === 0 &&
      pendingMigrations.length === 0 &&
      totalOrphans === 0,
    tablesExpected: expectedColsByTable.size,
    tablesActual: actualColsByTable.size,
    schemaDiffs,
    registeredMigrations,
    appliedMigrations,
    devMarkers,
    pendingMigrations,
    rowCounts,
    orphanFk,
    totalOrphans,
  }
}

async function runCli() {
  loadDotEnvIfNeeded()
  const args = process.argv.slice(2)
  const isAuditOnly =
    args.includes('--audit') ||
    !args.some((a) => a === '--resolve-dev-marker' || a === '--apply-pending')
  const shouldResolveDevMarker = args.includes('--resolve-dev-marker')
  const shouldApplyPending = args.includes('--apply-pending')
  const confirmProduction =
    args.includes('--confirm-production') || process.env.NORI_CONFIRM_PG_PROD_MIGRATION === '1'
  const isProductionTarget =
    args.includes('--env=production') ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NORI_PG_ENV === 'production'

  assertMigrationEnvironmentAllowed({
    isAuditOnly,
    isProductionTarget,
    confirmProduction,
  })

  const rawDbUrl = (process.env.DATABASE_URL || process.env.DATABASE_URI || '').trim()
  if (!rawDbUrl.startsWith('postgresql:') && !rawDbUrl.startsWith('postgres:')) {
    throw new Error('[PG-MIGRATE] DATABASE_URL must point to a PostgreSQL instance.')
  }

  const pool = new pg.Pool(createPostgresPoolConfig(rawDbUrl))
  const client = await pool.connect()
  try {
    const preAudit = await auditPostgresDatabase(client)
    console.log('='.repeat(68))
    console.log(' NORI POSTGRESQL MIGRATION & PARITY AUDIT')
    console.log('='.repeat(68))
    console.log(`Tables matched:      ${preAudit.tablesActual}/${preAudit.tablesExpected}`)
    console.log(`Schema diffs:        ${preAudit.schemaDiffs.length}`)
    console.log(`Dev markers (b=-1):  ${preAudit.devMarkers.length}`)
    console.log(`Pending migrations:  ${preAudit.pendingMigrations.length}`)
    console.log(`Orphan FK rows:      ${preAudit.totalOrphans}`)
    console.log('Migrations in DB:')
    for (const m of preAudit.appliedMigrations) {
      console.log(`  - [batch=${m.batch}] ${m.name}`)
    }

    if (isAuditOnly) {
      if (preAudit.schemaDiffs.length > 0) {
        console.error('\n[SCHEMA DIFFS]:', JSON.stringify(preAudit.schemaDiffs, null, 2))
      }
      process.exitCode = preAudit.ok ? 0 : 1
      return
    }

    // Create full pre-operation metadata & table backup before any mutation
    const backupDir = path.join(rootDir, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(backupDir, `neon-pg-pre-migrate-${Date.now()}.json`)
    fs.writeFileSync(
      backupPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          targetEnv: isProductionTarget ? 'production' : 'staging',
          preAudit,
        },
        null,
        2,
      ),
    )
    console.log(`\n[BACKUP] Pre-operation snapshot saved: ${path.basename(backupPath)}`)

    if (preAudit.schemaDiffs.length > 0) {
      throw new Error(
        `[PG-MIGRATE] Refusing to resolve dev marker or migrate while un-migrated schema diffs exist: ${JSON.stringify(preAudit.schemaDiffs)}`,
      )
    }

    if (shouldResolveDevMarker && preAudit.devMarkers.length > 0) {
      if (preAudit.pendingMigrations.length > 0) {
        throw new Error(
          `[PG-MIGRATE] Pending migrations exist (${preAudit.pendingMigrations.join(', ')}). Apply or verify migrations before resolving dev marker.`,
        )
      }
      await client.query('BEGIN')
      try {
        const delRes = await client.query(
          "DELETE FROM payload_migrations WHERE name = 'dev' AND batch = -1 RETURNING id, name, batch",
        )
        await client.query('COMMIT')
        console.log(
          `[RESOLVED] Archived & removed verified obsolete dev push marker (${delRes.rowCount} row) after 100% schema parity check.`,
        )
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }

    if (shouldApplyPending && preAudit.pendingMigrations.length > 0) {
      console.log(
        '[PG-MIGRATE] Pending migrations detected. Run `pnpm payload migrate` after verifying backup and dev marker resolution.',
      )
    }

    const postAudit = await auditPostgresDatabase(client)
    console.log(
      '\n[POST-AUDIT] ok=' + postAudit.ok,
      'devMarkers=' + postAudit.devMarkers.length,
      'pending=' + postAudit.pendingMigrations.length,
      'orphans=' + postAudit.totalOrphans,
    )
    if (!postAudit.ok) {
      process.exitCode = 1
    }
  } finally {
    client.release()
    await pool.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runCli().catch((err) => {
    console.error('[PG-MIGRATE] Error:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
