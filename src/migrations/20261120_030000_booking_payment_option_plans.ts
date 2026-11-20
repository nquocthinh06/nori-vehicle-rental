import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export const BOOKING_PAYMENT_OPTION_COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['bookings', 'payment_option', "text DEFAULT 'DEPOSIT'"],
  ['bookings', 'reservation_deposit_snapshot', 'numeric DEFAULT 0'],
]

export const BOOKING_PAYMENT_OPTION_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS \`bookings_payment_option_idx\` ON \`bookings\` (\`payment_option\`);`,
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all(sql.raw(`PRAGMA table_info('bookings');`))
  for (const [tableName, columnName, colDef] of BOOKING_PAYMENT_OPTION_COLUMN_ADDITIONS) {
    if (!hasColumn(cols, columnName)) {
      await db.run(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`))
    }
  }

  // Safe backfill: ensure existing historical bookings have standardized values
  // without altering existing total_price, deposit_snapshot, initial_payment_due or remaining_amount
  await db.run(
    sql.raw(
      `UPDATE \`bookings\` SET \`payment_option\` = 'DEPOSIT' WHERE \`payment_option\` IS NULL;`,
    ),
  )
  await db.run(
    sql.raw(
      `UPDATE \`bookings\` SET \`reservation_deposit_snapshot\` = 0 WHERE \`reservation_deposit_snapshot\` IS NULL;`,
    ),
  )

  for (const idxStmt of BOOKING_PAYMENT_OPTION_INDEXES_SQL) {
    await db.run(sql.raw(idxStmt))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop indexes safely. Columns remain backward compatible in SQLite.
  for (const _idx of BOOKING_PAYMENT_OPTION_INDEXES_SQL) {
    await db.run(sql.raw(`DROP INDEX IF EXISTS \`bookings_payment_option_idx\`;`))
  }
}
