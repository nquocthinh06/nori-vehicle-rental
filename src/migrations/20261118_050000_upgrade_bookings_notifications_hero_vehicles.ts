import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function hasColumn(cols: unknown, columnName: string): boolean {
  return (
    Array.isArray(cols) &&
    cols.some(
      (c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === columnName,
    )
  )
}

const STATEMENTS_UP_TABLES_AND_INDEXES = [
  `CREATE TABLE IF NOT EXISTS \`bookings_modification_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`modified_at\` text NOT NULL,
    \`modified_by\` text,
    \`actor_type\` text,
    \`status_at_change\` text,
    \`reason\` text,
    \`previous_total_price\` numeric,
    \`new_total_price\` numeric,
    \`previous_deposit\` numeric,
    \`new_deposit\` numeric,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`bookings_modification_history_order_idx\` ON \`bookings_modification_history\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`bookings_modification_history_parent_id_idx\` ON \`bookings_modification_history\` (\`_parent_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`bookings_modification_history_changes\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`field\` text NOT NULL,
    \`label\` text NOT NULL,
    \`before\` text,
    \`after\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`bookings_modification_history\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`bookings_modification_history_changes_order_idx\` ON \`bookings_modification_history_changes\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`bookings_modification_history_changes_parent_id_idx\` ON \`bookings_modification_history_changes\` (\`_parent_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`consultations\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`consultation_key\` text,
    \`booking_id\` text(36) NOT NULL,
    \`customer_id\` text(36),
    \`booking_key_snapshot\` text,
    \`customer_name_snapshot\` text,
    \`customer_phone_snapshot\` text,
    \`customer_email_snapshot\` text,
    \`vehicle_name_snapshot\` text,
    \`start_date_snapshot\` text,
    \`end_date_snapshot\` text,
    \`approved_at\` text NOT NULL,
    \`approved_by\` text,
    \`expected_contact_date\` text NOT NULL,
    \`working_hours_window\` text,
    \`is_urgent\` integer DEFAULT false,
    \`assigned_staff_id\` text(36),
    \`assigned_staff_name\` text,
    \`status\` text DEFAULT 'PENDING_CONTACT' NOT NULL,
    \`callback_scheduled_at\` text,
    \`internal_note\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`booking_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`assigned_staff_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`consultations_consultation_key_idx\` ON \`consultations\` (\`consultation_key\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_booking_idx\` ON \`consultations\` (\`booking_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_customer_idx\` ON \`consultations\` (\`customer_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_expected_contact_date_idx\` ON \`consultations\` (\`expected_contact_date\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_is_urgent_idx\` ON \`consultations\` (\`is_urgent\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_assigned_staff_idx\` ON \`consultations\` (\`assigned_staff_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_status_idx\` ON \`consultations\` (\`status\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_updated_at_idx\` ON \`consultations\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_created_at_idx\` ON \`consultations\` (\`created_at\`);`,

  `CREATE TABLE IF NOT EXISTS \`consultations_contact_logs\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`contacted_at\` text NOT NULL,
    \`staff_name\` text,
    \`outcome\` text NOT NULL,
    \`note\` text,
    \`next_callback_at\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`consultations\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`consultations_contact_logs_order_idx\` ON \`consultations_contact_logs\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_contact_logs_parent_id_idx\` ON \`consultations_contact_logs\` (\`_parent_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`consultations_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` text(36) NOT NULL,
    \`path\` text NOT NULL,
    \`admins_id\` text(36),
    \`users_id\` text(36),
    FOREIGN KEY (\`parent_id\`) REFERENCES \`consultations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`consultations_rels_order_idx\` ON \`consultations_rels\` (\`order\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_rels_parent_idx\` ON \`consultations_rels\` (\`parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_rels_path_idx\` ON \`consultations_rels\` (\`path\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_rels_admins_id_idx\` ON \`consultations_rels\` (\`admins_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`consultations_rels_users_id_idx\` ON \`consultations_rels\` (\`users_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`notifications\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`event_key\` text,
    \`customer_id\` text(36) NOT NULL,
    \`booking_id\` text(36),
    \`type\` text DEFAULT 'BOOKING_CONFIRMED' NOT NULL,
    \`title\` text NOT NULL,
    \`message\` text NOT NULL,
    \`booking_key\` text,
    \`vehicle_name\` text,
    \`start_date\` text,
    \`end_date\` text,
    \`pickup_time\` text,
    \`return_time\` text,
    \`expected_contact_date\` text,
    \`working_hours_label\` text,
    \`customer_phone_masked\` text,
    \`hotline\` text,
    \`is_urgent\` integer DEFAULT false,
    \`payment_confirmed\` integer DEFAULT false,
    \`superseded\` integer DEFAULT false,
    \`is_read\` integer DEFAULT false,
    \`read_at\` text,
    \`popup_dismissed\` integer DEFAULT false,
    \`popup_dismissed_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`booking_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`notifications_event_key_idx\` ON \`notifications\` (\`event_key\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_customer_idx\` ON \`notifications\` (\`customer_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_booking_idx\` ON \`notifications\` (\`booking_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_is_read_idx\` ON \`notifications\` (\`is_read\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_updated_at_idx\` ON \`notifications\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_created_at_idx\` ON \`notifications\` (\`created_at\`);`,

  `CREATE TABLE IF NOT EXISTS \`notifications_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` text(36) NOT NULL,
    \`path\` text NOT NULL,
    \`admins_id\` text(36),
    \`users_id\` text(36),
    FOREIGN KEY (\`parent_id\`) REFERENCES \`notifications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`notifications_rels_order_idx\` ON \`notifications_rels\` (\`order\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_rels_parent_idx\` ON \`notifications_rels\` (\`parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_rels_path_idx\` ON \`notifications_rels\` (\`path\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_rels_admins_id_idx\` ON \`notifications_rels\` (\`admins_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`notifications_rels_users_id_idx\` ON \`notifications_rels\` (\`users_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`nori_site_hero_slides\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title_first\` text,
    \`title_second\` text,
    \`eyebrow\` text,
    \`category_badge\` text,
    \`description\` text,
    \`cta_text\` text,
    \`cta_href\` text,
    \`secondary_text\` text,
    \`secondary_href\` text,
    \`desktop_image_id\` text(36),
    \`mobile_image_id\` text(36),
    \`related_category\` text,
    \`related_model_id\` text(36),
    \`credit\` text,
    \`source_url\` text,
    \`duration_seconds\` numeric,
    \`order\` numeric DEFAULT 0,
    \`active\` integer DEFAULT true,
    FOREIGN KEY (\`desktop_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`mobile_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`related_model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`nori_site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_hero_slides_order_idx\` ON \`nori_site_hero_slides\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_hero_slides_parent_id_idx\` ON \`nori_site_hero_slides\` (\`_parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_hero_slides_desktop_image_idx\` ON \`nori_site_hero_slides\` (\`desktop_image_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_hero_slides_mobile_image_idx\` ON \`nori_site_hero_slides\` (\`mobile_image_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_hero_slides_related_model_idx\` ON \`nori_site_hero_slides\` (\`related_model_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`nori_site_holidays\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`date\` text,
    \`name\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`nori_site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_holidays_order_idx\` ON \`nori_site_holidays\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`nori_site_holidays_parent_id_idx\` ON \`nori_site_holidays\` (\`_parent_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`_nori_site_v_version_hero_slides\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title_first\` text,
    \`title_second\` text,
    \`eyebrow\` text,
    \`category_badge\` text,
    \`description\` text,
    \`cta_text\` text,
    \`cta_href\` text,
    \`secondary_text\` text,
    \`secondary_href\` text,
    \`desktop_image_id\` text(36),
    \`mobile_image_id\` text(36),
    \`related_category\` text,
    \`related_model_id\` text(36),
    \`credit\` text,
    \`source_url\` text,
    \`duration_seconds\` numeric,
    \`order\` numeric DEFAULT 0,
    \`active\` integer DEFAULT true,
    \`_uuid\` text,
    FOREIGN KEY (\`desktop_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`mobile_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`related_model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_nori_site_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_hero_slides_order_idx\` ON \`_nori_site_v_version_hero_slides\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_hero_slides_parent_id_idx\` ON \`_nori_site_v_version_hero_slides\` (\`_parent_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_hero_slides_desktop_image_idx\` ON \`_nori_site_v_version_hero_slides\` (\`desktop_image_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_hero_slides_mobile_image_idx\` ON \`_nori_site_v_version_hero_slides\` (\`mobile_image_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_hero_slides_related_model_idx\` ON \`_nori_site_v_version_hero_slides\` (\`related_model_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`_nori_site_v_version_holidays\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`date\` text,
    \`name\` text,
    \`_uuid\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`_nori_site_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_holidays_order_idx\` ON \`_nori_site_v_version_holidays\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`_nori_site_v_version_holidays_parent_id_idx\` ON \`_nori_site_v_version_holidays\` (\`_parent_id\`);`,
]

const COLUMN_ADDITIONS: Array<[string, string, string]> = [
  ['bookings', 'revision', 'numeric DEFAULT 1'],
  ['bookings', 'return_location', 'text'],
  ['bookings', 'customer_email', 'text'],
  ['bookings', 'expected_contact_date', 'text'],
  ['bookings', 'working_hours_snapshot', 'text'],
  ['bookings', 'is_urgent_approval', 'integer DEFAULT false'],

  ['vehicle_models', 'official_name', 'text'],
  ['vehicle_models', 'model_line', 'text'],
  ['vehicle_models', 'version_name', 'text'],
  ['vehicle_models', 'generation', 'text'],
  ['vehicle_models', 'default_deposit_suggestion', 'numeric'],
  ['vehicle_models', 'usage_purpose', 'text'],
  ['vehicle_models', 'short_description', 'text'],

  ['vehicle_models_features', 'status', "text DEFAULT 'EQUIPPED'"],

  ['vehicle_models_gallery', 'photo_type', 'text'],
  ['vehicle_models_gallery', 'is_primary', 'integer DEFAULT false'],
  ['vehicle_models_gallery', 'sort_order', 'numeric DEFAULT 0'],
  ['vehicle_models_gallery', 'alt_text', 'text'],
  ['vehicle_models_gallery', 'verified', 'integer DEFAULT true'],

  ['vehicles_photos', 'photo_type', 'text'],
  ['vehicles_photos', 'is_primary', 'integer DEFAULT false'],
  ['vehicles_photos', 'sort_order', 'numeric DEFAULT 0'],
  ['vehicles_photos', 'alt_text', 'text'],
  ['vehicles_photos', 'source_name', 'text'],

  ['nori_site', 'hero_autoplay_seconds', 'numeric DEFAULT 6'],
  ['nori_site', 'business_timezone', "text DEFAULT 'Asia/Ho_Chi_Minh'"],
  ['nori_site', 'working_days', "text DEFAULT '1,2,3,4,5'"],
  ['nori_site', 'work_start_time', 'text'],
  ['nori_site', 'work_end_time', 'text'],
  ['nori_site', 'lunch_break_start', 'text'],
  ['nori_site', 'lunch_break_end', 'text'],

  ['_nori_site_v', 'version_hero_autoplay_seconds', 'numeric DEFAULT 6'],
  ['_nori_site_v', 'version_business_timezone', "text DEFAULT 'Asia/Ho_Chi_Minh'"],
  ['_nori_site_v', 'version_working_days', "text DEFAULT '1,2,3,4,5'"],
  ['_nori_site_v', 'version_work_start_time', 'text'],
  ['_nori_site_v', 'version_work_end_time', 'text'],
  ['_nori_site_v', 'version_lunch_break_start', 'text'],
  ['_nori_site_v', 'version_lunch_break_end', 'text'],
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const stmt of STATEMENTS_UP_TABLES_AND_INDEXES) {
    await db.run(sql.raw(stmt))
  }
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
  const dropTables = [
    'bookings_modification_history_changes',
    'bookings_modification_history',
    'consultations_contact_logs',
    'consultations_rels',
    'consultations',
    'notifications_rels',
    'notifications',
    '_nori_site_v_version_hero_slides',
    '_nori_site_v_version_holidays',
    'nori_site_hero_slides',
    'nori_site_holidays',
  ]
  for (const tbl of dropTables) {
    await db.run(sql.raw(`DROP TABLE IF EXISTS \`${tbl}\`;`))
  }
}
