import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

const COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['nori_site_hero_slides', 'focal_x', 'numeric DEFAULT 50'],
  ['nori_site_hero_slides', 'focal_y', 'numeric DEFAULT 50'],
  ['nori_site_hero_slides', 'mobile_focal_x', 'numeric DEFAULT 50'],
  ['nori_site_hero_slides', 'mobile_focal_y', 'numeric DEFAULT 50'],
  ['_nori_site_v_version_hero_slides', 'focal_x', 'numeric DEFAULT 50'],
  ['_nori_site_v_version_hero_slides', 'focal_y', 'numeric DEFAULT 50'],
  ['_nori_site_v_version_hero_slides', 'mobile_focal_x', 'numeric DEFAULT 50'],
  ['_nori_site_v_version_hero_slides', 'mobile_focal_y', 'numeric DEFAULT 50'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const colsCache = new Map<string, unknown>()
  for (const [tableName, columnName, colDef] of COLUMN_ADDITIONS) {
    let cols = colsCache.get(tableName)
    if (!cols) {
      cols = await db.all(sql.raw(`PRAGMA table_info('${tableName}');`))
      colsCache.set(tableName, cols)
    }
    if (!hasColumn(cols, columnName)) {
      await db.run(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`))
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
