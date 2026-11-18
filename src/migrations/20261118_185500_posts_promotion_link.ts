import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const postsCols = await db.all(sql.raw("PRAGMA table_info('posts');"))
  if (!hasColumn(postsCols, 'promotion_id')) {
    await db.run(
      sql.raw(
        'ALTER TABLE `posts` ADD COLUMN `promotion_id` text(36) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE set null;',
      ),
    )
    await db.run(
      sql.raw('CREATE INDEX IF NOT EXISTS `posts_promotion_idx` ON `posts` (`promotion_id`);'),
    )
  }

  const postsVCols = await db.all(sql.raw("PRAGMA table_info('_posts_v');"))
  if (!hasColumn(postsVCols, 'version_promotion_id')) {
    await db.run(
      sql.raw(
        'ALTER TABLE `_posts_v` ADD COLUMN `version_promotion_id` text(36) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE set null;',
      ),
    )
    await db.run(
      sql.raw(
        'CREATE INDEX IF NOT EXISTS `_posts_v_version_version_promotion_idx` ON `_posts_v` (`version_promotion_id`);',
      ),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  void db
}
