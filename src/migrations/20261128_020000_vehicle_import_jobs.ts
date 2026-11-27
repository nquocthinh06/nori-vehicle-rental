import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export const VEHICLE_IMPORT_COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['vehicle_models', 'msrp_reference_vnd', 'numeric'],
  ['vehicle_models', 'import_source_url', 'text'],
  ['vehicle_models', 'import_source_type', "text DEFAULT 'MANUAL'"],
  ['vehicle_models', 'import_source_hash', 'text'],
  ['vehicle_models', 'last_imported_at', 'text'],
  ['vehicle_models', 'locked_fields', 'text'],
  ['vehicle_models', 'revision_number', 'numeric DEFAULT 1'],
  ['media', 'source_sha256', 'text'],
  ['_media_v', 'version_source_sha256', 'text'],
]

export const VEHICLE_IMPORT_TABLES_AND_INDEXES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS \`vehicle_import_jobs\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`job_code\` text NOT NULL,
    \`method\` text NOT NULL,
    \`status\` text DEFAULT 'QUEUED' NOT NULL,
    \`target_model_id\` text(36),
    \`source_input\` text,
    \`normalized_draft\` text,
    \`diff_preview\` text,
    \`uncertainty_flags\` text,
    \`media_report\` text,
    \`rollback_snapshot\` text,
    \`conflict_policy\` text DEFAULT 'MERGE_EMPTY' NOT NULL,
    \`progress_pct\` numeric DEFAULT 0,
    \`current_stage\` text,
    \`attempt_count\` numeric DEFAULT 1,
    \`error_code\` text,
    \`error_message\` text,
    \`created_by_admin_id\` text,
    \`started_at\` text,
    \`finished_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`target_model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`vehicle_import_jobs_job_code_idx\` ON \`vehicle_import_jobs\` (\`job_code\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_method_idx\` ON \`vehicle_import_jobs\` (\`method\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_status_idx\` ON \`vehicle_import_jobs\` (\`status\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_target_model_idx\` ON \`vehicle_import_jobs\` (\`target_model_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_created_by_admin_id_idx\` ON \`vehicle_import_jobs\` (\`created_by_admin_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_updated_at_idx\` ON \`vehicle_import_jobs\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_created_at_idx\` ON \`vehicle_import_jobs\` (\`created_at\`);`,
  `CREATE TABLE IF NOT EXISTS \`vehicle_import_jobs_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` text(36) NOT NULL,
    \`path\` text NOT NULL,
    \`admins_id\` text(36),
    \`users_id\` text(36),
    FOREIGN KEY (\`parent_id\`) REFERENCES \`vehicle_import_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_rels_order_idx\` ON \`vehicle_import_jobs_rels\` (\`order\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_rels_parent_idx\` ON \`vehicle_import_jobs_rels\` (\`parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_rels_path_idx\` ON \`vehicle_import_jobs_rels\` (\`path\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_rels_admins_id_idx\` ON \`vehicle_import_jobs_rels\` (\`admins_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`vehicle_import_jobs_rels_users_id_idx\` ON \`vehicle_import_jobs_rels\` (\`users_id\`);`,
]

export const VEHICLE_IMPORT_COLUMN_INDEXES_SQL: string[] = [
  `CREATE INDEX IF NOT EXISTS \`media_source_sha256_idx\` ON \`media\` (\`source_sha256\`);`,
]

export const VEHICLE_IMPORT_OPTIONAL_MEDIA_V_INDEX_SQL = `CREATE INDEX IF NOT EXISTS \`_media_v_version_source_sha256_idx\` ON \`_media_v\` (\`version_source_sha256\`);`

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tables = await db.all(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vehicle_models', 'media', '_media_v');`,
    ),
  )
  const existingTables = new Set(
    Array.isArray(tables)
      ? tables
          .map((t) => (typeof t === 'object' && t !== null ? (t as { name?: string }).name : ''))
          .filter(Boolean)
      : [],
  )
  const colsByTable = new Map<string, unknown>()
  for (const [tableName, columnName, colDef] of VEHICLE_IMPORT_COLUMN_ADDITIONS) {
    if (!existingTables.has(tableName)) continue
    if (!colsByTable.has(tableName)) {
      colsByTable.set(tableName, await db.all(sql.raw(`PRAGMA table_info('${tableName}');`)))
    }
    if (!hasColumn(colsByTable.get(tableName), columnName)) {
      await db.run(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`))
    }
  }
  for (const stmt of VEHICLE_IMPORT_TABLES_AND_INDEXES_SQL) {
    await db.run(sql.raw(stmt))
  }
  for (const idxStmt of VEHICLE_IMPORT_COLUMN_INDEXES_SQL) {
    await db.run(sql.raw(idxStmt))
  }
  if (existingTables.has('_media_v')) {
    await db.run(sql.raw(VEHICLE_IMPORT_OPTIONAL_MEDIA_V_INDEX_SQL))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS `vehicle_import_jobs_rels`;'))
  await db.run(sql.raw('DROP TABLE IF EXISTS `vehicle_import_jobs`;'))
}
