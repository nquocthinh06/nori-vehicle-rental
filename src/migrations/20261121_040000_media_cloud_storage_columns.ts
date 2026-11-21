import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export const MEDIA_CLOUD_STORAGE_COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['media', 'prefix', 'text'],
  ['media', '_objectkey', 'text'],
  ['_media_v', 'version_prefix', 'text'],
  ['_media_v', 'version__objectkey', 'text'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tables = await db.all(
    sql.raw(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('media', '_media_v');`),
  )
  const existingTables = new Set(
    Array.isArray(tables)
      ? tables
          .map((t) => (typeof t === 'object' && t !== null ? (t as { name?: string }).name : ''))
          .filter(Boolean)
      : [],
  )

  const colsByTable = new Map<string, unknown>()
  for (const [tableName, columnName, colDef] of MEDIA_CLOUD_STORAGE_COLUMN_ADDITIONS) {
    if (!existingTables.has(tableName)) continue
    if (!colsByTable.has(tableName)) {
      colsByTable.set(tableName, await db.all(sql.raw(`PRAGMA table_info('${tableName}');`)))
    }
    if (!hasColumn(colsByTable.get(tableName), columnName)) {
      await db.run(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`))
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Columns are nullable and backward compatible; preserve existing metadata on rollback.
  void db
}
