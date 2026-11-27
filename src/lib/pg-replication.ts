import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { createPostgresPoolConfig, normalizePostgresUrl } from './postgres-url.ts'

export interface ResolvedNeonUrls {
  poolerUrl: string
  directUrl: string
  convertedFromPooler: boolean
  poolerHost: string
  directHost: string
  database: string
}

export interface PostgresEndpointHealth {
  ok: boolean
  redactedUrl: string
  host: string
  database: string
  user: string
  version: string
  inRecovery: boolean
  walLevel: string | null
  maxReplicationSlots: number | null
  maxWalSenders: number | null
  databaseSizeBytes: number
  publicTableCount: number
  pkTableCount: number
  tablesWithoutPk: string[]
  sequenceCount: number
  appliedMigrations: Array<{ name: string; batch: number }>
  registeredMigrations: string[]
  pendingMigrations: string[]
  publications: Array<{ pubname: string; puballtables: boolean; tablesCount: number }>
  replicationSlots: Array<{
    slotName: string
    plugin: string | null
    slotType: string
    active: boolean
    walStatus: string | null
    restartLsn: string | null
    confirmedFlushLsn: string | null
  }>
  activeSenders: Array<{
    applicationName: string | null
    clientAddr: string | null
    state: string | null
    sentLsn: string | null
    writeLsn: string | null
    flushLsn: string | null
    replayLsn: string | null
    replayLagMs: number | null
    byteLag: number | null
  }>
  subscriptions: Array<{
    subname: string
    enabled: boolean
    pid: number | null
    receivedLsn: string | null
    latestEndLsn: string | null
    latestEndTime: string | null
    relStates: Record<string, number>
  }>
  alerts: string[]
  error?: string
}

export interface ParityCheckReport {
  ok: boolean
  sourceRedacted: string
  replicaRedacted: string
  sourceTableCount: number
  replicaTableCount: number
  missingTablesOnReplica: string[]
  extraTablesOnReplica: string[]
  columnDiffs: Array<{ table: string; missingCols: string[]; extraCols: string[] }>
  migrationDiff: {
    missingOnReplica: string[]
    extraOnReplica: string[]
  }
  rowCountMismatches: Array<{ table: string; sourceRows: number; replicaRows: number }>
  matchedTables: number
  totalSourceRows: number
  totalReplicaRows: number
  sequenceDrifts: Array<{
    sequenceName: string
    tableName: string
    lastValue: number
    maxId: number
  }>
  fkConstraintCountSource: number
  fkConstraintCountReplica: number
  alerts: string[]
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function loadDotEnvIfAbsent(rootDir = process.cwd()): void {
  const envPath = path.resolve(rootDir, '.env')
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const eq = line.indexOf('=')
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = val
    }
  }
}

export function redactPostgresUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return '<empty>'
  try {
    const u = new URL(trimmed)
    const portPart = u.port ? `:${u.port}` : ''
    const userPart = u.username ? `${u.username}:***@` : ''
    return `${u.protocol}//${userPart}${u.hostname}${portPart}${u.pathname}`
  } catch {
    return '<invalid-postgres-url>'
  }
}

export function isPostgresUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return false
  const t = rawUrl.trim().toLowerCase()
  return t.startsWith('postgres://') || t.startsWith('postgresql://')
}

export function isLocalPostgresHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl.trim())
    return LOCAL_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Resolves Neon Pooler vs Direct (non-pooler) URLs.
 * Logical replication (`CREATE SUBSCRIPTION` / `pgoutput`) requires a direct endpoint,
 * because Neon PgBouncer `-pooler` endpoints reject replication protocol startup.
 */
export function resolveNeonDirectUrl(rawInputUrl?: string): ResolvedNeonUrls {
  const explicitDirect = (
    rawInputUrl ||
    process.env.NEON_DIRECT_URL ||
    process.env.NEON_REPLICATION_URL ||
    ''
  ).trim()
  const baseUrl = (
    rawInputUrl ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URI ||
    explicitDirect
  ).trim()

  if (!isPostgresUrl(baseUrl)) {
    throw new Error('[PG-REPLICATION] Missing PostgreSQL URL (NEON_DIRECT_URL or DATABASE_URL).')
  }

  const normalizedPooler = normalizePostgresUrl(baseUrl)
  const poolerParsed = new URL(normalizedPooler)

  let directUrl: string
  let convertedFromPooler = false

  if (
    !rawInputUrl &&
    explicitDirect &&
    isPostgresUrl(explicitDirect) &&
    !new URL(explicitDirect).hostname.includes('-pooler.')
  ) {
    directUrl = normalizePostgresUrl(explicitDirect)
  } else {
    const directParsed = new URL(normalizedPooler)
    if (directParsed.hostname.includes('-pooler.')) {
      directParsed.hostname = directParsed.hostname.replace('-pooler.', '.')
      convertedFromPooler = true
    } else if (directParsed.hostname.includes('-pooler')) {
      directParsed.hostname = directParsed.hostname.replace('-pooler', '')
      convertedFromPooler = true
    }
    directUrl = directParsed.toString()
  }

  const directParsed = new URL(directUrl)
  return {
    poolerUrl: normalizedPooler,
    directUrl,
    convertedFromPooler,
    poolerHost: poolerParsed.hostname,
    directHost: directParsed.hostname,
    database: directParsed.pathname.replace(/^\/+/, '') || 'neondb',
  }
}

export function resolveLocalReplicaUrl(): string {
  const explicit = (
    process.env.LOCAL_REPLICA_URL ||
    process.env.NORI_LOCAL_REPLICA_URL ||
    ''
  ).trim()
  if (explicit) return explicit
  const pass = process.env.LOCAL_PG_PASSWORD || process.env.PGPASSWORD || ''
  const auth = pass ? `postgres:${encodeURIComponent(pass)}@` : 'postgres@'
  const port = process.env.LOCAL_PG_PORT || '5432'
  const db = process.env.LOCAL_REPLICA_DB || 'nori_replica'
  return `postgresql://${auth}127.0.0.1:${port}/${db}`
}

export function resolveLocalDevPostgresUrl(): string {
  const explicit = (
    process.env.LOCAL_DEV_POSTGRES_URL ||
    process.env.NORI_LOCAL_DEV_POSTGRES_URL ||
    ''
  ).trim()
  if (explicit) return explicit
  const pass = process.env.LOCAL_PG_PASSWORD || process.env.PGPASSWORD || ''
  const auth = pass ? `postgres:${encodeURIComponent(pass)}@` : 'postgres@'
  const port = process.env.LOCAL_PG_PORT || '5432'
  const db = process.env.LOCAL_DEV_DB || 'nori_development'
  return `postgresql://${auth}127.0.0.1:${port}/${db}`
}

export function isProductionTargetUrl(rawUrl: string): boolean {
  if (!isPostgresUrl(rawUrl)) return false
  const parsed = new URL(rawUrl.trim())
  const host = parsed.hostname.toLowerCase()
  const prodHost = (process.env.NORI_PRODUCTION_DB_HOST || '').trim().toLowerCase()
  if (prodHost && host === prodHost) return true
  if (host.includes('.neon.tech') || host.includes('.aws.neon.tech')) {
    return true
  }
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NORI_ENV === 'production' ||
    process.env.NORI_PG_ENV === 'production'
  )
}

export function assertNotProductionTarget(
  rawUrl: string,
  operation: string,
  options?: { confirmProduction?: boolean },
): void {
  if (options?.confirmProduction) return
  if (isProductionTargetUrl(rawUrl) && !isLocalPostgresHost(rawUrl)) {
    throw new Error(
      `[PG-SAFETY-GUARD] Refusing ${operation} against remote/production PostgreSQL (${redactPostgresUrl(rawUrl)}). Pass --confirm-production only for explicitly approved production maintenance.`,
    )
  }
}

export function getRegisteredPostgresMigrations(
  migrationsDir = path.resolve(process.cwd(), 'src/migrations-postgres'),
): string[] {
  if (!fs.existsSync(migrationsDir)) return []
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort()
    .map((f) => f.replace(/\.ts$/, ''))
}

export function buildPoolForUrl(rawUrl: string, max = 2): pg.Pool {
  const cfg = createPostgresPoolConfig(rawUrl)
  return new pg.Pool({
    ...cfg,
    max,
    statement_timeout: Math.max(cfg.statement_timeout, 15_000),
    query_timeout: Math.max(cfg.query_timeout, 16_000),
  })
}

export async function inspectPostgresEndpoint(
  rawUrl: string,
  options?: { migrationsDir?: string },
): Promise<PostgresEndpointHealth> {
  const redactedUrl = redactPostgresUrl(rawUrl)
  const parsed = new URL(normalizePostgresUrl(rawUrl))
  const registeredMigrations = getRegisteredPostgresMigrations(options?.migrationsDir)
  const alerts: string[] = []

  const pool = buildPoolForUrl(rawUrl, 1)
  try {
    const baseRes = await pool.query(`
      SELECT
        version() AS ver,
        current_database() AS db,
        current_user AS usr,
        pg_is_in_recovery() AS in_recovery,
        current_setting('wal_level', true) AS wal_level,
        current_setting('max_replication_slots', true) AS max_slots,
        current_setting('max_wal_senders', true) AS max_senders,
        pg_database_size(current_database())::bigint AS db_size
    `)
    const base = baseRes.rows[0]

    const tablesRes = await pool.query(`
      SELECT
        t.table_name,
        EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          WHERE tc.table_schema = 'public'
            AND tc.table_name = t.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
        ) AS has_pk
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC
    `)
    const tablesWithoutPk = tablesRes.rows.filter((r) => !r.has_pk).map((r) => String(r.table_name))

    const seqRes = await pool.query(
      "SELECT count(*)::int AS c FROM information_schema.sequences WHERE sequence_schema = 'public'",
    )

    let appliedMigrations: Array<{ name: string; batch: number }> = []
    if (tablesRes.rows.some((r) => r.table_name === 'payload_migrations')) {
      const migRes = await pool.query(
        'SELECT name, batch::int AS batch FROM payload_migrations ORDER BY id ASC',
      )
      appliedMigrations = migRes.rows.map((r) => ({
        name: String(r.name),
        batch: Number(r.batch),
      }))
    }
    const appliedSet = new Set(appliedMigrations.filter((m) => m.batch !== -1).map((m) => m.name))
    const pendingMigrations = registeredMigrations.filter((m) => !appliedSet.has(m))

    const pubRes = await pool.query(`
      SELECT
        p.pubname,
        p.puballtables,
        (SELECT count(*)::int FROM pg_publication_tables pt WHERE pt.pubname = p.pubname) AS tables_count
      FROM pg_publication p
      ORDER BY p.pubname ASC
    `)

    const slotRes = await pool.query(`
      SELECT
        slot_name,
        plugin,
        slot_type,
        active,
        wal_status,
        restart_lsn::text AS restart_lsn,
        confirmed_flush_lsn::text AS confirmed_flush_lsn
      FROM pg_replication_slots
      ORDER BY slot_name ASC
    `)

    let activeSenders: PostgresEndpointHealth['activeSenders'] = []
    try {
      const senderRes = await pool.query(`
        SELECT
          application_name,
          client_addr::text AS client_addr,
          state,
          sent_lsn::text AS sent_lsn,
          write_lsn::text AS write_lsn,
          flush_lsn::text AS flush_lsn,
          replay_lsn::text AS replay_lsn,
          EXTRACT(EPOCH FROM replay_lag) * 1000 AS replay_lag_ms,
          pg_wal_lsn_diff(pg_current_wal_lsn(), COALESCE(replay_lsn, flush_lsn, sent_lsn))::bigint AS byte_lag
        FROM pg_stat_replication
        ORDER BY application_name ASC
      `)
      activeSenders = senderRes.rows.map((r) => ({
        applicationName: r.application_name ? String(r.application_name) : null,
        clientAddr: r.client_addr ? String(r.client_addr) : null,
        state: r.state ? String(r.state) : null,
        sentLsn: r.sent_lsn ? String(r.sent_lsn) : null,
        writeLsn: r.write_lsn ? String(r.write_lsn) : null,
        flushLsn: r.flush_lsn ? String(r.flush_lsn) : null,
        replayLsn: r.replay_lsn ? String(r.replay_lsn) : null,
        replayLagMs: r.replay_lag_ms != null ? Math.round(Number(r.replay_lag_ms)) : null,
        byteLag: r.byte_lag != null ? Number(r.byte_lag) : null,
      }))
    } catch {
      // Non-superuser roles on managed Postgres may have restricted pg_stat_replication visibility
    }

    let subscriptions: PostgresEndpointHealth['subscriptions'] = []
    try {
      const subRes = await pool.query(`
        SELECT
          s.subname,
          s.subenabled,
          ss.pid,
          ss.received_lsn::text AS received_lsn,
          ss.latest_end_lsn::text AS latest_end_lsn,
          ss.latest_end_time::text AS latest_end_time
        FROM pg_subscription s
        LEFT JOIN pg_stat_subscription ss ON ss.subid = s.oid AND ss.relid IS NULL
        ORDER BY s.subname ASC
      `)
      for (const s of subRes.rows) {
        const relRes = await pool.query(
          `
          SELECT sr.srsubstate::text AS st, count(*)::int AS c
          FROM pg_subscription_rel sr
          JOIN pg_subscription sub ON sub.oid = sr.srsubid
          WHERE sub.subname = $1
          GROUP BY sr.srsubstate
          `,
          [s.subname],
        )
        const relStates: Record<string, number> = {}
        for (const rr of relRes.rows) {
          relStates[String(rr.st)] = Number(rr.c)
        }
        subscriptions.push({
          subname: String(s.subname),
          enabled: Boolean(s.subenabled),
          pid: s.pid != null ? Number(s.pid) : null,
          receivedLsn: s.received_lsn ? String(s.received_lsn) : null,
          latestEndLsn: s.latest_end_lsn ? String(s.latest_end_lsn) : null,
          latestEndTime: s.latest_end_time ? String(s.latest_end_time) : null,
          relStates,
        })
      }
    } catch {
      // pg_subscription is superuser-only on some servers; non-fatal for publisher inspection
    }

    const walLevel = base.wal_level ? String(base.wal_level) : null
    if (tablesWithoutPk.length > 0) {
      alerts.push(`Tables missing PRIMARY KEY: ${tablesWithoutPk.join(', ')}`)
    }
    if (pendingMigrations.length > 0) {
      alerts.push(
        `Pending postgres migrations (${pendingMigrations.length}): ${pendingMigrations.join(', ')}`,
      )
    }
    for (const sl of slotRes.rows) {
      if (sl.wal_status === 'lost' || sl.wal_status === 'unreserved') {
        alerts.push(
          `Replication slot "${sl.slot_name}" wal_status=${sl.wal_status} (requires re-init)`,
        )
      }
    }
    for (const sub of subscriptions) {
      if (!sub.enabled) {
        alerts.push(`Subscription "${sub.subname}" is DISABLED`)
      } else if (!sub.pid) {
        alerts.push(
          `Subscription "${sub.subname}" has no active apply worker (disconnected/retrying)`,
        )
      }
    }

    return {
      ok: true,
      redactedUrl,
      host: parsed.hostname,
      database: String(base.db),
      user: String(base.usr),
      version: String(base.ver).split(' on ')[0],
      inRecovery: Boolean(base.in_recovery),
      walLevel,
      maxReplicationSlots: base.max_slots != null ? Number(base.max_slots) : null,
      maxWalSenders: base.max_senders != null ? Number(base.max_senders) : null,
      databaseSizeBytes: Number(base.db_size || 0),
      publicTableCount: tablesRes.rows.length,
      pkTableCount: tablesRes.rows.length - tablesWithoutPk.length,
      tablesWithoutPk,
      sequenceCount: Number(seqRes.rows[0]?.c || 0),
      appliedMigrations,
      registeredMigrations,
      pendingMigrations,
      publications: pubRes.rows.map((p) => ({
        pubname: String(p.pubname),
        puballtables: Boolean(p.puballtables),
        tablesCount: Number(p.tables_count || 0),
      })),
      replicationSlots: slotRes.rows.map((sl) => ({
        slotName: String(sl.slot_name),
        plugin: sl.plugin ? String(sl.plugin) : null,
        slotType: String(sl.slot_type),
        active: Boolean(sl.active),
        walStatus: sl.wal_status ? String(sl.wal_status) : null,
        restartLsn: sl.restart_lsn ? String(sl.restart_lsn) : null,
        confirmedFlushLsn: sl.confirmed_flush_lsn ? String(sl.confirmed_flush_lsn) : null,
      })),
      activeSenders,
      subscriptions,
      alerts,
    }
  } catch (err) {
    return {
      ok: false,
      redactedUrl,
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\/+/, ''),
      user: parsed.username || '',
      version: 'unavailable',
      inRecovery: false,
      walLevel: null,
      maxReplicationSlots: null,
      maxWalSenders: null,
      databaseSizeBytes: 0,
      publicTableCount: 0,
      pkTableCount: 0,
      tablesWithoutPk: [],
      sequenceCount: 0,
      appliedMigrations: [],
      registeredMigrations,
      pendingMigrations: registeredMigrations,
      publications: [],
      replicationSlots: [],
      activeSenders: [],
      subscriptions: [],
      alerts: [err instanceof Error ? err.message : String(err)],
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    await pool.end()
  }
}

async function fetchSchemaMetadata(pool: pg.Pool) {
  const colsRes = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name ASC, ordinal_position ASC
  `)
  const colsByTable = new Map<string, Set<string>>()
  for (const r of colsRes.rows) {
    const t = String(r.table_name)
    if (!colsByTable.has(t)) colsByTable.set(t, new Set())
    colsByTable.get(t)!.add(String(r.column_name))
  }

  let migrations: string[] = []
  if (colsByTable.has('payload_migrations')) {
    const mRes = await pool.query(
      'SELECT name FROM payload_migrations WHERE batch <> -1 ORDER BY id ASC',
    )
    migrations = mRes.rows.map((r) => String(r.name))
  }

  const fkRes = await pool.query(`
    SELECT count(*)::int AS c
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
  `)

  const counts = new Map<string, number>()
  for (const tableName of colsByTable.keys()) {
    const cRes = await pool.query(`SELECT count(*)::int AS c FROM "${tableName}"`)
    counts.set(tableName, Number(cRes.rows[0]?.c || 0))
  }

  return {
    colsByTable,
    migrations,
    fkCount: Number(fkRes.rows[0]?.c || 0),
    counts,
  }
}

export async function inspectSequenceDrifts(
  pool: pg.Pool,
): Promise<Array<{ sequenceName: string; tableName: string; lastValue: number; maxId: number }>> {
  const res = await pool.query(`
    SELECT
      s.relname AS sequence_name,
      t.relname AS table_name,
      a.attname AS column_name
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND n.nspname = 'public'
    ORDER BY t.relname ASC, s.relname ASC
  `)

  const drifts: Array<{
    sequenceName: string
    tableName: string
    lastValue: number
    maxId: number
  }> = []
  for (const row of res.rows) {
    const seqName = String(row.sequence_name)
    const tableName = String(row.table_name)
    const colName = String(row.column_name)
    const seqState = await pool.query(
      `SELECT last_value::bigint AS lv, is_called FROM "${seqName}"`,
    )
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX("${colName}"), 0)::bigint AS m FROM "${tableName}"`,
    )
    const lv = Number(seqState.rows[0]?.lv || 0)
    const isCalled = Boolean(seqState.rows[0]?.is_called)
    const effectiveLast = isCalled ? lv : 0
    const maxId = Number(maxRes.rows[0]?.m || 0)
    if (maxId > 0 && effectiveLast < maxId) {
      drifts.push({
        sequenceName: seqName,
        tableName,
        lastValue: effectiveLast,
        maxId,
      })
    }
  }
  return drifts
}

export async function syncAllSerialSequences(
  pool: pg.Pool,
): Promise<Array<{ sequenceName: string; tableName: string; setTo: number }>> {
  const res = await pool.query(`
    SELECT
      s.relname AS sequence_name,
      t.relname AS table_name,
      a.attname AS column_name
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND n.nspname = 'public'
    ORDER BY t.relname ASC, s.relname ASC
  `)

  const updated: Array<{ sequenceName: string; tableName: string; setTo: number }> = []
  for (const row of res.rows) {
    const seqName = String(row.sequence_name)
    const tableName = String(row.table_name)
    const colName = String(row.column_name)
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX("${colName}"), 0)::bigint AS m FROM "${tableName}"`,
    )
    const maxId = Number(maxRes.rows[0]?.m || 0)
    if (maxId > 0) {
      await pool.query('SELECT setval($1::regclass, $2, true)', [`public."${seqName}"`, maxId])
      updated.push({ sequenceName: seqName, tableName, setTo: maxId })
    } else {
      await pool.query('SELECT setval($1::regclass, 1, false)', [`public."${seqName}"`])
      updated.push({ sequenceName: seqName, tableName, setTo: 0 })
    }
  }
  return updated
}

export async function compareSourceAndReplicaParity(
  sourceUrl: string,
  replicaUrl: string,
): Promise<ParityCheckReport> {
  const sourcePool = buildPoolForUrl(sourceUrl, 1)
  const replicaPool = buildPoolForUrl(replicaUrl, 1)

  try {
    const [srcMeta, repMeta, sequenceDrifts] = await Promise.all([
      fetchSchemaMetadata(sourcePool),
      fetchSchemaMetadata(replicaPool),
      inspectSequenceDrifts(replicaPool),
    ])

    const srcTables = [...srcMeta.colsByTable.keys()].sort()
    const repTables = [...repMeta.colsByTable.keys()].sort()
    const missingTablesOnReplica = srcTables.filter((t) => !repMeta.colsByTable.has(t))
    const extraTablesOnReplica = repTables.filter((t) => !srcMeta.colsByTable.has(t))

    const columnDiffs: ParityCheckReport['columnDiffs'] = []
    const rowCountMismatches: ParityCheckReport['rowCountMismatches'] = []
    let matchedTables = 0
    let totalSourceRows = 0
    let totalReplicaRows = 0

    for (const table of srcTables) {
      totalSourceRows += srcMeta.counts.get(table) ?? 0
      if (!repMeta.colsByTable.has(table)) continue

      const srcCols = srcMeta.colsByTable.get(table)!
      const repCols = repMeta.colsByTable.get(table)!
      const missingCols = [...srcCols].filter((c) => !repCols.has(c))
      const extraCols = [...repCols].filter((c) => !srcCols.has(c))
      if (missingCols.length > 0 || extraCols.length > 0) {
        columnDiffs.push({ table, missingCols, extraCols })
      }

      const sCount = srcMeta.counts.get(table) ?? 0
      const rCount = repMeta.counts.get(table) ?? 0
      if (sCount !== rCount) {
        rowCountMismatches.push({ table, sourceRows: sCount, replicaRows: rCount })
      } else {
        matchedTables++
      }
    }
    for (const table of repTables) {
      totalReplicaRows += repMeta.counts.get(table) ?? 0
    }

    const srcMigSet = new Set(srcMeta.migrations)
    const repMigSet = new Set(repMeta.migrations)
    const migrationDiff = {
      missingOnReplica: srcMeta.migrations.filter((m) => !repMigSet.has(m)),
      extraOnReplica: repMeta.migrations.filter((m) => !srcMigSet.has(m)),
    }

    const alerts: string[] = []
    if (missingTablesOnReplica.length > 0) {
      alerts.push(
        `SCHEMA_DRIFT: ${missingTablesOnReplica.length} table(s) exist on source but not replica (${missingTablesOnReplica.join(', ')}). Apply migrations on replica before refreshing subscription.`,
      )
    }
    if (columnDiffs.length > 0) {
      alerts.push(
        `SCHEMA_DRIFT: ${columnDiffs.length} table(s) have column mismatches (DDL changes are not auto-replicated by pgoutput).`,
      )
    }
    if (rowCountMismatches.length > 0) {
      alerts.push(`ROW_COUNT_MISMATCH on ${rowCountMismatches.length} table(s).`)
    }
    if (sequenceDrifts.length > 0) {
      alerts.push(
        `SEQUENCE_SYNC_NOTE: ${sequenceDrifts.length} serial sequence(s) on replica lag behind MAX(id) — expected in PG logical replication; run sequence sync before any failover promotion.`,
      )
    }

    const ok =
      missingTablesOnReplica.length === 0 &&
      extraTablesOnReplica.length === 0 &&
      columnDiffs.length === 0 &&
      migrationDiff.missingOnReplica.length === 0 &&
      rowCountMismatches.length === 0

    return {
      ok,
      sourceRedacted: redactPostgresUrl(sourceUrl),
      replicaRedacted: redactPostgresUrl(replicaUrl),
      sourceTableCount: srcTables.length,
      replicaTableCount: repTables.length,
      missingTablesOnReplica,
      extraTablesOnReplica,
      columnDiffs,
      migrationDiff,
      rowCountMismatches,
      matchedTables,
      totalSourceRows,
      totalReplicaRows,
      sequenceDrifts,
      fkConstraintCountSource: srcMeta.fkCount,
      fkConstraintCountReplica: repMeta.fkCount,
      alerts,
    }
  } finally {
    await Promise.all([sourcePool.end(), replicaPool.end()])
  }
}

export async function verifyReadOnlyRoleAccess(
  replicaUrl: string,
  roleName = 'nori_readonly',
  sampleTable = 'bookings',
): Promise<{
  ok: boolean
  roleExists: boolean
  canSelect: boolean
  insertBlocked: boolean
  updateBlocked: boolean
  deleteBlocked: boolean
  createBlocked: boolean
  errors: string[]
}> {
  const errors: string[] = []
  const adminPool = buildPoolForUrl(replicaUrl, 1)
  try {
    const roleRes = await adminPool.query('SELECT rolname FROM pg_roles WHERE rolname = $1', [
      roleName,
    ])
    if (roleRes.rowCount === 0) {
      return {
        ok: false,
        roleExists: false,
        canSelect: false,
        insertBlocked: false,
        updateBlocked: false,
        deleteBlocked: false,
        createBlocked: false,
        errors: [`Role "${roleName}" does not exist.`],
      }
    }

    const privRes = await adminPool.query(
      `
      SELECT
        has_table_privilege($1, $2, 'SELECT') AS can_select,
        has_table_privilege($1, $2, 'INSERT') AS can_insert,
        has_table_privilege($1, $2, 'UPDATE') AS can_update,
        has_table_privilege($1, $2, 'DELETE') AS can_delete,
        has_schema_privilege($1, 'public', 'CREATE') AS can_create
      `,
      [roleName, `public."${sampleTable}"`],
    )
    const p = privRes.rows[0]
    const canSelect = Boolean(p.can_select)
    const insertBlocked = !p.can_insert
    const updateBlocked = !p.can_update
    const deleteBlocked = !p.can_delete
    const createBlocked = !p.can_create

    if (!canSelect) errors.push(`Role "${roleName}" lacks SELECT on ${sampleTable}.`)
    if (!insertBlocked) errors.push(`Role "${roleName}" still has INSERT privilege!`)
    if (!updateBlocked) errors.push(`Role "${roleName}" still has UPDATE privilege!`)
    if (!deleteBlocked) errors.push(`Role "${roleName}" still has DELETE privilege!`)
    if (!createBlocked)
      errors.push(`Role "${roleName}" still has CREATE privilege on public schema!`)

    return {
      ok: errors.length === 0,
      roleExists: true,
      canSelect,
      insertBlocked,
      updateBlocked,
      deleteBlocked,
      createBlocked,
      errors,
    }
  } finally {
    await adminPool.end()
  }
}

export async function refreshSubscriptionSafe(
  replicaUrl: string,
  subscriptionName = 'nori_sub',
  options?: { enableFirst?: boolean; copyData?: boolean },
): Promise<{ ok: boolean; actions: string[] }> {
  assertNotProductionTarget(replicaUrl, 'subscription refresh')
  const pool = buildPoolForUrl(replicaUrl, 1)
  const actions: string[] = []
  try {
    if (options?.enableFirst) {
      await pool.query(`ALTER SUBSCRIPTION "${subscriptionName}" ENABLE`)
      actions.push(`ALTER SUBSCRIPTION "${subscriptionName}" ENABLE`)
    }
    const copyDataFlag = options?.copyData ? 'true' : 'false'
    await pool.query(
      `ALTER SUBSCRIPTION "${subscriptionName}" REFRESH PUBLICATION WITH (copy_data = ${copyDataFlag})`,
    )
    actions.push(
      `ALTER SUBSCRIPTION "${subscriptionName}" REFRESH PUBLICATION WITH (copy_data = ${copyDataFlag})`,
    )
    return { ok: true, actions }
  } finally {
    await pool.end()
  }
}

export function buildSubscriptionSetupRunbook(params: {
  publicationName?: string
  subscriptionName?: string
  slotName?: string
  directHost?: string
  database?: string
}): {
  neonPrerequisiteSteps: string[]
  publisherSql: string[]
  subscriberSqlTemplate: string[]
} {
  const pub = params.publicationName || 'nori_pub'
  const sub = params.subscriptionName || 'nori_sub'
  const slot = params.slotName || 'nori_sub_slot'
  const host = params.directHost || '<neon-direct-host-without-pooler>'
  const db = params.database || 'neondb'

  return {
    neonPrerequisiteSteps: [
      '1. In Neon Console -> Project Settings -> Logical Replication, enable Logical Replication (`wal_level = logical`). Note: Neon restarts compute once and setting is permanent.',
      `2. Use the DIRECT (non-pooler) Neon endpoint (${host}), never the -pooler endpoint.`,
      '3. Ensure all pending schema migrations in src/migrations-postgres/ are applied identically on both Neon and local nori_replica BEFORE creating the subscription.',
      '4. Truncate payload_migrations on local nori_replica right before CREATE SUBSCRIPTION (copy_data = true) so Neon migration rows copy cleanly without duplicate UUIDs.',
    ],
    publisherSql: [`CREATE PUBLICATION "${pub}" FOR ALL TABLES;`],
    subscriberSqlTemplate: [
      'TRUNCATE TABLE "payload_migrations";',
      `CREATE SUBSCRIPTION "${sub}" CONNECTION 'host=${host} port=5432 dbname=${db} user=<neon_role> password=<neon_password> sslmode=verify-full' PUBLICATION "${pub}" WITH (copy_data = true, create_slot = true, slot_name = '${slot}', enabled = true, streaming = on);`,
    ],
  }
}

export function buildSlotReinitRunbook(params?: {
  publicationName?: string
  subscriptionName?: string
  slotName?: string
}): string[] {
  const pub = params?.publicationName || 'nori_pub'
  const sub = params?.subscriptionName || 'nori_sub'
  const slot = params?.slotName || 'nori_sub_slot'

  return [
    `-- Step 1 (Local Subscriber nori_replica): Disable and detach broken subscription`,
    `ALTER SUBSCRIPTION "${sub}" DISABLE;`,
    `ALTER SUBSCRIPTION "${sub}" SET (slot_name = NONE);`,
    `DROP SUBSCRIPTION IF EXISTS "${sub}";`,
    `-- Step 2 (Neon Publisher, only if slot still exists): SELECT pg_drop_replication_slot('${slot}');`,
    `-- Step 3 (Local Subscriber): Ensure DDL schema matches Neon (run pending migrations), truncate subscriber tables + payload_migrations cleanly, and recreate subscription:`,
    `-- TRUNCATE TABLE "payload_migrations";`,
    `-- CREATE SUBSCRIPTION "${sub}" CONNECTION '<NEON_DIRECT_URL>' PUBLICATION "${pub}" WITH (copy_data = true, create_slot = true, slot_name = '${slot}', enabled = true, streaming = on);`,
  ]
}

function extractUpSqlFromMigrationFile(filePath: string): string {
  const src = fs.readFileSync(filePath, 'utf8')
  const upIdx = src.search(/export\s+async\s+function\s+up\b/)
  if (upIdx === -1) {
    throw new Error(
      `[PG-MIGRATIONS] Missing export async function up in ${path.basename(filePath)}`,
    )
  }
  const downIdx = src.search(/export\s+async\s+function\s+down\b/)
  const upSlice = downIdx > upIdx ? src.slice(upIdx, downIdx) : src.slice(upIdx)

  const sqlBlocks: string[] = []
  const marker = /db\.execute\(\s*sql`/g
  let match: RegExpExecArray | null
  while ((match = marker.exec(upSlice)) !== null) {
    let i = match.index + match[0].length
    let out = ''
    let closed = false
    while (i < upSlice.length) {
      const ch = upSlice[i]
      if (ch === '\\' && i + 1 < upSlice.length) {
        const next = upSlice[i + 1]
        if (next === '`' || next === '\\' || next === '$') {
          out += next
          i += 2
          continue
        }
      }
      if (ch === '`') {
        closed = true
        break
      }
      out += ch
      i += 1
    }
    if (!closed) {
      throw new Error(`[PG-MIGRATIONS] Unterminated sql template in ${path.basename(filePath)}`)
    }
    sqlBlocks.push(out)
  }

  if (sqlBlocks.length === 0) {
    throw new Error(`[PG-MIGRATIONS] No db.execute(sql\`...\`) found in ${path.basename(filePath)}`)
  }
  return sqlBlocks.join('\n;\n')
}

export async function applyPostgresMigrationsDirect(
  rawUrl: string,
  options?: { migrationsDir?: string; confirmProduction?: boolean },
): Promise<{ applied: string[]; skipped: string[]; totalTables: number }> {
  assertNotProductionTarget(rawUrl, 'direct schema migration', {
    confirmProduction: options?.confirmProduction,
  })
  const migrationsDir =
    options?.migrationsDir || path.resolve(process.cwd(), 'src/migrations-postgres')
  const names = getRegisteredPostgresMigrations(migrationsDir)

  const pool = buildPoolForUrl(rawUrl, 1)
  const applied: string[] = []
  const skipped: string[] = []

  try {
    const hasMigTableRes = await pool.query(
      "SELECT to_regclass('public.payload_migrations') AS reg",
    )
    const appliedSet = new Set<string>()
    let maxBatch = 0

    if (hasMigTableRes.rows[0]?.reg) {
      const mRes = await pool.query(
        'SELECT name, batch::int AS batch FROM payload_migrations WHERE batch <> -1',
      )
      for (const r of mRes.rows) {
        if (r.name) appliedSet.add(String(r.name))
        if (Number(r.batch) > maxBatch) maxBatch = Number(r.batch)
      }
    }

    for (const migName of names) {
      if (appliedSet.has(migName)) {
        skipped.push(migName)
        continue
      }
      const sqlText = extractUpSqlFromMigrationFile(path.join(migrationsDir, `${migName}.ts`))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sqlText)
        maxBatch += 1
        await client.query('INSERT INTO payload_migrations (name, batch) VALUES ($1, $2)', [
          migName,
          maxBatch,
        ])
        await client.query('COMMIT')
        applied.push(migName)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    }

    const tblRes = await pool.query(
      "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
    return {
      applied,
      skipped,
      totalTables: Number(tblRes.rows[0]?.c || 0),
    }
  } finally {
    await pool.end()
  }
}
