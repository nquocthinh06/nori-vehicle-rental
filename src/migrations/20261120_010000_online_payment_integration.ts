import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

export const PAYMENT_TABLES_AND_INDEXES_SQL = [
  `CREATE TABLE IF NOT EXISTS \`payment_events\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`event_id\` text NOT NULL,
    \`provider\` text DEFAULT 'SEPAY' NOT NULL,
    \`environment\` text DEFAULT 'MOCK' NOT NULL,
    \`external_transaction_id\` text,
    \`payment_reference\` text,
    \`event_type\` text NOT NULL,
    \`transfer_amount\` numeric DEFAULT 0,
    \`verification_result\` text DEFAULT 'VERIFIED' NOT NULL,
    \`processing_status\` text DEFAULT 'PROCESSED' NOT NULL,
    \`retry_count\` numeric DEFAULT 0,
    \`received_at\` text NOT NULL,
    \`processed_at\` text,
    \`error_reason\` text,
    \`payment_id\` text(36),
    \`booking_id\` text(36),
    \`sanitized_payload\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`payment_id\`) REFERENCES \`payments\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`booking_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`payment_events_event_id_idx\` ON \`payment_events\` (\`event_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_provider_idx\` ON \`payment_events\` (\`provider\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_environment_idx\` ON \`payment_events\` (\`environment\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_external_transaction_id_idx\` ON \`payment_events\` (\`external_transaction_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_payment_reference_idx\` ON \`payment_events\` (\`payment_reference\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_event_type_idx\` ON \`payment_events\` (\`event_type\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_processing_status_idx\` ON \`payment_events\` (\`processing_status\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_payment_idx\` ON \`payment_events\` (\`payment_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_booking_idx\` ON \`payment_events\` (\`booking_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_updated_at_idx\` ON \`payment_events\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_created_at_idx\` ON \`payment_events\` (\`created_at\`);`,

  `CREATE TABLE IF NOT EXISTS \`payment_events_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` text(36) NOT NULL,
    \`path\` text NOT NULL,
    \`admins_id\` text(36),
    \`users_id\` text(36),
    FOREIGN KEY (\`parent_id\`) REFERENCES \`payment_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_rels_order_idx\` ON \`payment_events_rels\` (\`order\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_rels_parent_idx\` ON \`payment_events_rels\` (\`parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_rels_path_idx\` ON \`payment_events_rels\` (\`path\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_rels_admins_id_idx\` ON \`payment_events_rels\` (\`admins_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payment_events_rels_users_id_idx\` ON \`payment_events_rels\` (\`users_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`refunds\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`reference\` text,
    \`payment_id\` text(36),
    \`booking_id\` text(36) NOT NULL,
    \`customer_id\` text(36),
    \`refund_type\` text DEFAULT 'DEPOSIT_RETURN' NOT NULL,
    \`amount\` numeric NOT NULL,
    \`reason\` text NOT NULL,
    \`status\` text DEFAULT 'REQUESTED' NOT NULL,
    \`provider\` text DEFAULT 'MANUAL',
    \`provider_refund_id\` text,
    \`requested_by\` text,
    \`requested_by_type\` text DEFAULT 'ADMIN',
    \`approved_by\` text,
    \`completed_by\` text,
    \`requested_at\` text,
    \`approved_at\` text,
    \`completed_at\` text,
    \`reconciliation_note\` text,
    \`bank_account_info\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`payment_id\`) REFERENCES \`payments\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`booking_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`refunds_reference_idx\` ON \`refunds\` (\`reference\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_payment_idx\` ON \`refunds\` (\`payment_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_booking_idx\` ON \`refunds\` (\`booking_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_customer_idx\` ON \`refunds\` (\`customer_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_status_idx\` ON \`refunds\` (\`status\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_provider_refund_id_idx\` ON \`refunds\` (\`provider_refund_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_updated_at_idx\` ON \`refunds\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_created_at_idx\` ON \`refunds\` (\`created_at\`);`,

  `CREATE TABLE IF NOT EXISTS \`refunds_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` text(36) NOT NULL,
    \`path\` text NOT NULL,
    \`admins_id\` text(36),
    \`users_id\` text(36),
    FOREIGN KEY (\`parent_id\`) REFERENCES \`refunds\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`refunds_rels_order_idx\` ON \`refunds_rels\` (\`order\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_rels_parent_idx\` ON \`refunds_rels\` (\`parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_rels_path_idx\` ON \`refunds_rels\` (\`path\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_rels_admins_id_idx\` ON \`refunds_rels\` (\`admins_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`refunds_rels_users_id_idx\` ON \`refunds_rels\` (\`users_id\`);`,
]

export const PAYMENT_COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['payments', 'provider', "text DEFAULT 'MANUAL'"],
  ['payments', 'environment', "text DEFAULT 'MOCK'"],
  ['payments', 'currency', "text DEFAULT 'VND'"],
  ['payments', 'expected_amount', 'numeric'],
  ['payments', 'received_amount', 'numeric DEFAULT 0'],
  ['payments', 'refunded_amount', 'numeric DEFAULT 0'],
  ['payments', 'overpaid_amount', 'numeric DEFAULT 0'],
  ['payments', 'reconciliation_status', "text DEFAULT 'NONE'"],
  ['payments', 'provider_transaction_id', 'text'],
  ['payments', 'provider_payment_ref', 'text'],
  ['payments', 'qr_image_url', 'text'],
  ['payments', 'payment_url', 'text'],
  ['payments', 'bank_code', 'text'],
  ['payments', 'bank_account_number', 'text'],
  ['payments', 'bank_account_name', 'text'],
  ['payments', 'transfer_content', 'text'],
  ['payments', 'expires_at', 'text'],
  ['payments', 'idempotency_key', 'text'],
  ['payments', 'verified_at', 'text'],
  ['payments', 'failure_reason', 'text'],
  ['payments', 'reconciliation_note', 'text'],

  ['nori_site', 'online_payment_enabled', 'integer DEFAULT true'],
  ['nori_site', 'active_payment_provider', "text DEFAULT 'MOCK'"],
  ['nori_site', 'allow_sepay_qr', 'integer DEFAULT true'],
  ['nori_site', 'allow_manual_bank_transfer', 'integer DEFAULT true'],
  ['nori_site', 'allow_cash_on_handover', 'integer DEFAULT true'],
  ['nori_site', 'allow_full_payment_online', 'integer DEFAULT true'],
  ['nori_site', 'reservation_deposit_policy_mode', "text DEFAULT 'VEHICLE_FIXED'"],
  ['nori_site', 'reservation_deposit_percent', 'numeric DEFAULT 30'],
  ['nori_site', 'payment_expiry_minutes', 'numeric DEFAULT 30'],
  ['nori_site', 'require_deposit_before_handover', 'integer DEFAULT true'],
  ['nori_site', 'require_settlement_before_complete', 'integer DEFAULT false'],
  ['nori_site', 'bank_name', "text DEFAULT 'Vietcombank'"],
  ['nori_site', 'bank_code', "text DEFAULT 'VCB'"],
  ['nori_site', 'bank_account_number', "text DEFAULT '1017588888'"],
  ['nori_site', 'bank_account_holder', "text DEFAULT 'CONG TY TNHH DICH VU PHUONG TIEN NORI'"],
  ['nori_site', 'payment_instruction_note', 'text'],
  ['nori_site', 'refund_policy_summary', 'text'],

  ['_nori_site_v', 'version_online_payment_enabled', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_active_payment_provider', "text DEFAULT 'MOCK'"],
  ['_nori_site_v', 'version_allow_sepay_qr', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_allow_manual_bank_transfer', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_allow_cash_on_handover', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_allow_full_payment_online', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_reservation_deposit_policy_mode', "text DEFAULT 'VEHICLE_FIXED'"],
  ['_nori_site_v', 'version_reservation_deposit_percent', 'numeric DEFAULT 30'],
  ['_nori_site_v', 'version_payment_expiry_minutes', 'numeric DEFAULT 30'],
  ['_nori_site_v', 'version_require_deposit_before_handover', 'integer DEFAULT true'],
  ['_nori_site_v', 'version_require_settlement_before_complete', 'integer DEFAULT false'],
  ['_nori_site_v', 'version_bank_name', "text DEFAULT 'Vietcombank'"],
  ['_nori_site_v', 'version_bank_code', "text DEFAULT 'VCB'"],
  ['_nori_site_v', 'version_bank_account_number', "text DEFAULT '1017588888'"],
  [
    '_nori_site_v',
    'version_bank_account_holder',
    "text DEFAULT 'CONG TY TNHH DICH VU PHUONG TIEN NORI'",
  ],
  ['_nori_site_v', 'version_payment_instruction_note', 'text'],
  ['_nori_site_v', 'version_refund_policy_summary', 'text'],
]

export const PAYMENT_COLUMN_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS \`payments_provider_idx\` ON \`payments\` (\`provider\`);`,
  `CREATE INDEX IF NOT EXISTS \`payments_environment_idx\` ON \`payments\` (\`environment\`);`,
  `CREATE INDEX IF NOT EXISTS \`payments_reconciliation_status_idx\` ON \`payments\` (\`reconciliation_status\`);`,
  `CREATE INDEX IF NOT EXISTS \`payments_provider_transaction_id_idx\` ON \`payments\` (\`provider_transaction_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`payments_provider_payment_ref_idx\` ON \`payments\` (\`provider_payment_ref\`);`,
  `CREATE INDEX IF NOT EXISTS \`payments_idempotency_key_idx\` ON \`payments\` (\`idempotency_key\`);`,
  // Composite indexes verified via EXPLAIN QUERY PLAN to eliminate temp B-tree sorts & full sweeps
  `CREATE INDEX IF NOT EXISTS \`payments_booking_created_idx\` ON \`payments\` (\`booking_id\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`payments_status_expires_idx\` ON \`payments\` (\`status\`, \`expires_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`bookings_customer_created_idx\` ON \`bookings\` (\`customer_id\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`bookings_status_created_idx\` ON \`bookings\` (\`status\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_customer_created_idx\` ON \`notifications\` (\`customer_id\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`vehicles_model_status_idx\` ON \`vehicles\` (\`model_id\`, \`status\`);`,
  `CREATE INDEX IF NOT EXISTS \`rental_days_vehicle_day_idx\` ON \`rental_days\` (\`vehicle_id\`, \`day\`);`,
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const stmt of PAYMENT_TABLES_AND_INDEXES_SQL) {
    await db.run(sql.raw(stmt))
  }
  const colsCache = new Map<string, unknown>()
  for (const [tableName, columnName, colDef] of PAYMENT_COLUMN_ADDITIONS) {
    let cols = colsCache.get(tableName)
    if (!cols) {
      cols = await db.all(sql.raw(`PRAGMA table_info('${tableName}');`))
      colsCache.set(tableName, cols)
    }
    if (!hasColumn(cols, columnName)) {
      await db.run(sql.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${colDef};`))
    }
  }
  for (const idxStmt of PAYMENT_COLUMN_INDEXES_SQL) {
    await db.run(sql.raw(idxStmt))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const dropTables = ['refunds_rels', 'refunds', 'payment_events_rels', 'payment_events']
  for (const tbl of dropTables) {
    await db.run(sql.raw(`DROP TABLE IF EXISTS \`${tbl}\`;`))
  }
}
