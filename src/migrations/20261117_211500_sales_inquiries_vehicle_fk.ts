import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols = await db.all(sql`PRAGMA table_info('sales_inquiries');`)
  if (!hasColumn(cols, 'vehicle')) return

  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`PRAGMA defer_foreign_keys=ON;`)
  await db.run(sql`CREATE TABLE \`__new_sales_inquiries\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`reference\` text,
  	\`inquiry_type\` text DEFAULT 'CONSULTATION',
  	\`customer_id\` text(36),
  	\`model_id\` text(36) NOT NULL,
  	\`vehicle_id\` text(36),
  	\`vehicle_reference\` text,
  	\`variant_name\` text,
  	\`color_name\` text,
  	\`payment_method\` text DEFAULT 'DIRECT',
  	\`preferred_date\` text,
  	\`preferred_location\` text,
  	\`quoted_price_snapshot\` numeric,
  	\`estimated_rolling_snapshot\` numeric,
  	\`phone\` text NOT NULL,
  	\`note\` text,
  	\`status\` text DEFAULT 'NEW',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`INSERT INTO \`__new_sales_inquiries\` (
  	\`id\`, \`reference\`, \`inquiry_type\`, \`customer_id\`, \`model_id\`, \`vehicle_id\`,
  	\`vehicle_reference\`, \`variant_name\`, \`color_name\`, \`payment_method\`, \`preferred_date\`,
  	\`preferred_location\`, \`quoted_price_snapshot\`, \`estimated_rolling_snapshot\`,
  	\`phone\`, \`note\`, \`status\`, \`updated_at\`, \`created_at\`
  )
  SELECT
  	\`id\`, \`reference\`, \`inquiry_type\`, \`customer_id\`, \`model_id\`,
  	CASE WHEN \`vehicle\` IS NOT NULL AND EXISTS (SELECT 1 FROM \`vehicles\` v WHERE v.\`id\` = \`sales_inquiries\`.\`vehicle\`) THEN \`vehicle\` ELSE NULL END,
  	\`vehicle_reference\`, \`variant_name\`, \`color_name\`, \`payment_method\`, \`preferred_date\`,
  	\`preferred_location\`, \`quoted_price_snapshot\`, \`estimated_rolling_snapshot\`,
  	\`phone\`, \`note\`, \`status\`, \`updated_at\`, \`created_at\`
  FROM \`sales_inquiries\`;`)
  await db.run(sql`DROP TABLE \`sales_inquiries\`;`)
  await db.run(sql`ALTER TABLE \`__new_sales_inquiries\` RENAME TO \`sales_inquiries\`;`)
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_customer_idx\` ON \`sales_inquiries\` (\`customer_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_model_idx\` ON \`sales_inquiries\` (\`model_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_vehicle_idx\` ON \`sales_inquiries\` (\`vehicle_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_updated_at_idx\` ON \`sales_inquiries\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_created_at_idx\` ON \`sales_inquiries\` (\`created_at\`);`,
  )
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const cols = await db.all(sql`PRAGMA table_info('sales_inquiries');`)
  if (!hasColumn(cols, 'vehicle_id')) return

  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`PRAGMA defer_foreign_keys=ON;`)
  await db.run(sql`CREATE TABLE \`__old_sales_inquiries\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`reference\` text,
  	\`inquiry_type\` text DEFAULT 'CONSULTATION',
  	\`customer_id\` text(36),
  	\`model_id\` text(36) NOT NULL,
  	\`vehicle\` text,
  	\`vehicle_reference\` text,
  	\`variant_name\` text,
  	\`color_name\` text,
  	\`payment_method\` text DEFAULT 'DIRECT',
  	\`preferred_date\` text,
  	\`preferred_location\` text,
  	\`quoted_price_snapshot\` numeric,
  	\`estimated_rolling_snapshot\` numeric,
  	\`phone\` text NOT NULL,
  	\`note\` text,
  	\`status\` text DEFAULT 'NEW',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`INSERT INTO \`__old_sales_inquiries\` (
  	\`id\`, \`reference\`, \`inquiry_type\`, \`customer_id\`, \`model_id\`, \`vehicle\`,
  	\`vehicle_reference\`, \`variant_name\`, \`color_name\`, \`payment_method\`, \`preferred_date\`,
  	\`preferred_location\`, \`quoted_price_snapshot\`, \`estimated_rolling_snapshot\`,
  	\`phone\`, \`note\`, \`status\`, \`updated_at\`, \`created_at\`
  )
  SELECT
  	\`id\`, \`reference\`, \`inquiry_type\`, \`customer_id\`, \`model_id\`, \`vehicle_id\`,
  	\`vehicle_reference\`, \`variant_name\`, \`color_name\`, \`payment_method\`, \`preferred_date\`,
  	\`preferred_location\`, \`quoted_price_snapshot\`, \`estimated_rolling_snapshot\`,
  	\`phone\`, \`note\`, \`status\`, \`updated_at\`, \`created_at\`
  FROM \`sales_inquiries\`;`)
  await db.run(sql`DROP TABLE \`sales_inquiries\`;`)
  await db.run(sql`ALTER TABLE \`__old_sales_inquiries\` RENAME TO \`sales_inquiries\`;`)
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_customer_idx\` ON \`sales_inquiries\` (\`customer_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_model_idx\` ON \`sales_inquiries\` (\`model_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_vehicle_idx\` ON \`sales_inquiries\` (\`vehicle\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_updated_at_idx\` ON \`sales_inquiries\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_created_at_idx\` ON \`sales_inquiries\` (\`created_at\`);`,
  )
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}
