import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`admins_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	\`refresh_count\` numeric,
  	\`refreshed_at\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`admins_sessions_order_idx\` ON \`admins_sessions\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`admins_sessions_parent_id_idx\` ON \`admins_sessions\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`admins\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`admins_updated_at_idx\` ON \`admins\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`admins_created_at_idx\` ON \`admins\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`admins_email_idx\` ON \`admins\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`admins_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`admins_rels_order_idx\` ON \`admins_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`admins_rels_parent_idx\` ON \`admins_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`admins_rels_path_idx\` ON \`admins_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`admins_rels_admins_id_idx\` ON \`admins_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`admins_rels_users_id_idx\` ON \`admins_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`alt\` text NOT NULL,
  	\`source_url\` text,
  	\`source_name\` text,
  	\`license\` text,
  	\`model_year\` text,
  	\`variant_name\` text,
  	\`color_name\` text,
  	\`media_category\` text DEFAULT 'CATALOGUE_REFERENCE',
  	\`verified\` integer DEFAULT true,
  	\`_h_folders_id\` text(36),
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`_stored\` integer,
  	\`_transforms\` text,
  	\`original_filename\` text,
  	\`original_url\` text,
  	\`original_mime_type\` text,
  	\`original_filesize\` numeric,
  	\`original_width\` numeric,
  	\`original_height\` numeric,
  	\`original_prefix\` text,
  	\`original__objectkey\` text,
  	\`original__stored\` integer,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	FOREIGN KEY (\`_h_folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`media__h_folders_idx\` ON \`media\` (\`_h_folders_id\`);`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(
    sql`CREATE INDEX \`media_original_original_filename_idx\` ON \`media\` (\`original_filename\`);`,
  )
  await db.run(sql`CREATE TABLE \`media_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`tags_id\` text(36),
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`media_rels_order_idx\` ON \`media_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_parent_idx\` ON \`media_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_path_idx\` ON \`media_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_tags_id_idx\` ON \`media_rels\` (\`tags_id\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_admins_id_idx\` ON \`media_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`media_rels_users_id_idx\` ON \`media_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`_media_v\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`parent_id\` text(36),
  	\`version_alt\` text NOT NULL,
  	\`version_source_url\` text,
  	\`version_source_name\` text,
  	\`version_license\` text,
  	\`version_model_year\` text,
  	\`version_variant_name\` text,
  	\`version_color_name\` text,
  	\`version_media_category\` text DEFAULT 'CATALOGUE_REFERENCE',
  	\`version_verified\` integer DEFAULT true,
  	\`version__h_folders_id\` text(36),
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version_url\` text,
  	\`version_thumbnail_u_r_l\` text,
  	\`version_filename\` text,
  	\`version_mime_type\` text,
  	\`version_filesize\` numeric,
  	\`version_width\` numeric,
  	\`version_height\` numeric,
  	\`version__stored\` integer,
  	\`version__transforms\` text,
  	\`version_original_filename\` text,
  	\`version_original_url\` text,
  	\`version_original_mime_type\` text,
  	\`version_original_filesize\` numeric,
  	\`version_original_width\` numeric,
  	\`version_original_height\` numeric,
  	\`version_original_prefix\` text,
  	\`version_original__objectkey\` text,
  	\`version_original__stored\` integer,
  	\`version_focal_x\` numeric,
  	\`version_focal_y\` numeric,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version__h_folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_media_v_parent_idx\` ON \`_media_v\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_media_v_version_version__h_folders_idx\` ON \`_media_v\` (\`version__h_folders_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_media_v_version_version_updated_at_idx\` ON \`_media_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_media_v_version_version_created_at_idx\` ON \`_media_v\` (\`version_created_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_media_v_version_version_filename_idx\` ON \`_media_v\` (\`version_filename\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_media_v_version_original_version_original_filename_idx\` ON \`_media_v\` (\`version_original_filename\`);`,
  )
  await db.run(sql`CREATE INDEX \`_media_v_created_at_idx\` ON \`_media_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_media_v_updated_at_idx\` ON \`_media_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_media_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`tags_id\` text(36),
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_media_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_media_v_rels_order_idx\` ON \`_media_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_media_v_rels_parent_idx\` ON \`_media_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_media_v_rels_path_idx\` ON \`_media_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_media_v_rels_tags_id_idx\` ON \`_media_v_rels\` (\`tags_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_media_v_rels_admins_id_idx\` ON \`_media_v_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_media_v_rels_users_id_idx\` ON \`_media_v_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`folders\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`_h_folders_id\` text(36),
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`_h_folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`folders__h_folders_idx\` ON \`folders\` (\`_h_folders_id\`);`)
  await db.run(sql`CREATE INDEX \`folders_updated_at_idx\` ON \`folders\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`folders_created_at_idx\` ON \`folders\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`folders_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`folders_rels_order_idx\` ON \`folders_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`folders_rels_parent_idx\` ON \`folders_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`folders_rels_path_idx\` ON \`folders_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`folders_rels_admins_id_idx\` ON \`folders_rels\` (\`admins_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`folders_rels_users_id_idx\` ON \`folders_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`_folders_v\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`parent_id\` text(36),
  	\`version__h_folders_id\` text(36),
  	\`version_name\` text NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version__h_folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_folders_v_parent_idx\` ON \`_folders_v\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_folders_v_version_version__h_folders_idx\` ON \`_folders_v\` (\`version__h_folders_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_folders_v_version_version_updated_at_idx\` ON \`_folders_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_folders_v_version_version_created_at_idx\` ON \`_folders_v\` (\`version_created_at\`);`,
  )
  await db.run(sql`CREATE INDEX \`_folders_v_created_at_idx\` ON \`_folders_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_folders_v_updated_at_idx\` ON \`_folders_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_folders_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_folders_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_folders_v_rels_order_idx\` ON \`_folders_v_rels\` (\`order\`);`)
  await db.run(
    sql`CREATE INDEX \`_folders_v_rels_parent_idx\` ON \`_folders_v_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`_folders_v_rels_path_idx\` ON \`_folders_v_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`_folders_v_rels_admins_id_idx\` ON \`_folders_v_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_folders_v_rels_users_id_idx\` ON \`_folders_v_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`tags\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`_h_tags_id\` text(36),
  	\`name\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`_h_tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`tags__h_tags_idx\` ON \`tags\` (\`_h_tags_id\`);`)
  await db.run(sql`CREATE INDEX \`tags_updated_at_idx\` ON \`tags\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`tags_created_at_idx\` ON \`tags\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`tags_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`tags_rels_order_idx\` ON \`tags_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`tags_rels_parent_idx\` ON \`tags_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`tags_rels_path_idx\` ON \`tags_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`tags_rels_admins_id_idx\` ON \`tags_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`tags_rels_users_id_idx\` ON \`tags_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`_tags_v\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`parent_id\` text(36),
  	\`version__h_tags_id\` text(36),
  	\`version_name\` text NOT NULL,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version__h_tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_tags_v_parent_idx\` ON \`_tags_v\` (\`parent_id\`);`)
  await db.run(
    sql`CREATE INDEX \`_tags_v_version_version__h_tags_idx\` ON \`_tags_v\` (\`version__h_tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_tags_v_version_version_updated_at_idx\` ON \`_tags_v\` (\`version_updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_tags_v_version_version_created_at_idx\` ON \`_tags_v\` (\`version_created_at\`);`,
  )
  await db.run(sql`CREATE INDEX \`_tags_v_created_at_idx\` ON \`_tags_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_tags_v_updated_at_idx\` ON \`_tags_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_tags_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_tags_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_tags_v_rels_order_idx\` ON \`_tags_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_tags_v_rels_parent_idx\` ON \`_tags_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_tags_v_rels_path_idx\` ON \`_tags_v_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`_tags_v_rels_admins_id_idx\` ON \`_tags_v_rels\` (\`admins_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`_tags_v_rels_users_id_idx\` ON \`_tags_v_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	\`refresh_count\` numeric,
  	\`refreshed_at\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`full_name\` text NOT NULL,
  	\`phone\` text,
  	\`role\` text DEFAULT 'CUSTOMER' NOT NULL,
  	\`status\` text DEFAULT 'ACTIVE' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`reset_password_requested_at\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`users_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_rels_order_idx\` ON \`users_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`users_rels_parent_idx\` ON \`users_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`users_rels_path_idx\` ON \`users_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`users_rels_admins_id_idx\` ON \`users_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`users_rels_users_id_idx\` ON \`users_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`vehicle_models_highlights\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_highlights_order_idx\` ON \`vehicle_models_highlights\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_highlights_parent_id_idx\` ON \`vehicle_models_highlights\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_features\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`category\` text DEFAULT 'COMFORT' NOT NULL,
  	\`variant_note\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_features_order_idx\` ON \`vehicle_models_features\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_features_parent_id_idx\` ON \`vehicle_models_features\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_gallery\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` text(36) NOT NULL,
  	\`kind\` text NOT NULL,
  	\`caption\` text,
  	\`variant_name\` text,
  	\`color_name\` text,
  	\`source_url\` text,
  	\`license\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_gallery_order_idx\` ON \`vehicle_models_gallery\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_gallery_parent_id_idx\` ON \`vehicle_models_gallery\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_gallery_image_idx\` ON \`vehicle_models_gallery\` (\`image_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_specifications\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`group\` text DEFAULT 'OVERVIEW',
  	\`label\` text NOT NULL,
  	\`value\` text NOT NULL,
  	\`variant_name\` text,
  	\`source\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_specifications_order_idx\` ON \`vehicle_models_specifications\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_specifications_parent_id_idx\` ON \`vehicle_models_specifications\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_variants_colors\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`hex\` text,
  	\`source_url\` text,
  	\`image_id\` text(36),
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models_variants\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_variants_colors_order_idx\` ON \`vehicle_models_variants_colors\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_variants_colors_parent_id_idx\` ON \`vehicle_models_variants_colors\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_variants_colors_image_idx\` ON \`vehicle_models_variants_colors\` (\`image_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_variants\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`year\` numeric,
  	\`listed_price\` numeric,
  	\`reference_rent_price\` numeric,
  	\`fuel_type\` text,
  	\`transmission\` text,
  	\`drive_type\` text,
  	\`seats\` numeric,
  	\`summary\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_variants_order_idx\` ON \`vehicle_models_variants\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_variants_parent_id_idx\` ON \`vehicle_models_variants\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`brand\` text NOT NULL,
  	\`category\` text NOT NULL,
  	\`sub_category\` text,
  	\`body_style\` text,
  	\`segment\` text,
  	\`origin\` text,
  	\`model_year\` numeric,
  	\`seats\` numeric,
  	\`fuel_type\` text,
  	\`transmission\` text,
  	\`drive_type\` text,
  	\`listed_price\` numeric,
  	\`reference_rent_price\` numeric,
  	\`suitable_for\` text,
  	\`description\` text,
  	\`exterior_overview\` text,
  	\`interior_overview\` text,
  	\`engine_overview\` text,
  	\`cover_id\` text(36),
  	\`source\` text,
  	\`verification_status\` text DEFAULT 'VERIFIED',
  	\`visible\` integer DEFAULT true,
  	\`featured\` integer DEFAULT false,
  	\`sort_order\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`vehicle_models_slug_idx\` ON \`vehicle_models\` (\`slug\`);`,
  )
  await db.run(sql`CREATE INDEX \`vehicle_models_brand_idx\` ON \`vehicle_models\` (\`brand\`);`)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_category_idx\` ON \`vehicle_models\` (\`category\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_sub_category_idx\` ON \`vehicle_models\` (\`sub_category\`);`,
  )
  await db.run(sql`CREATE INDEX \`vehicle_models_cover_idx\` ON \`vehicle_models\` (\`cover_id\`);`)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_visible_idx\` ON \`vehicle_models\` (\`visible\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_updated_at_idx\` ON \`vehicle_models\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_created_at_idx\` ON \`vehicle_models\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicle_models_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`vehicle_models_rels_order_idx\` ON \`vehicle_models_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_rels_parent_idx\` ON \`vehicle_models_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_rels_path_idx\` ON \`vehicle_models_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_rels_admins_id_idx\` ON \`vehicle_models_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicle_models_rels_users_id_idx\` ON \`vehicle_models_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicles_photos\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` text(36) NOT NULL,
  	\`caption\` text,
  	\`kind\` text DEFAULT 'EXTERIOR',
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`vehicles_photos_order_idx\` ON \`vehicles_photos\` (\`_order\`);`)
  await db.run(
    sql`CREATE INDEX \`vehicles_photos_parent_id_idx\` ON \`vehicles_photos\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicles_photos_image_idx\` ON \`vehicles_photos\` (\`image_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`vehicles\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`reference\` text NOT NULL,
  	\`model_id\` text(36) NOT NULL,
  	\`license_plate\` text NOT NULL,
  	\`intent\` text DEFAULT 'RENT' NOT NULL,
  	\`is_demo\` integer DEFAULT true,
  	\`vehicle_condition_type\` text DEFAULT 'USED',
  	\`manufacture_year\` numeric,
  	\`price_per_day\` numeric,
  	\`price_per_hour\` numeric,
  	\`price_per_week\` numeric,
  	\`price_per_month\` numeric,
  	\`weekend_surcharge\` numeric,
  	\`holiday_surcharge\` numeric,
  	\`deposit_amount\` numeric,
  	\`delivery_fee\` numeric,
  	\`km_limit_per_day\` numeric DEFAULT 300,
  	\`over_km_fee\` numeric,
  	\`late_return_fee_per_hour\` numeric,
  	\`buffer_hours\` numeric DEFAULT 2,
  	\`sale_price\` numeric,
  	\`listed_price\` numeric,
  	\`discount_price\` numeric,
  	\`reservation_deposit\` numeric,
  	\`estimated_rolling_price\` numeric,
  	\`negotiable\` integer DEFAULT false,
  	\`warranty_policy\` text,
  	\`price_source_note\` text,
  	\`odometer\` numeric,
  	\`condition\` text,
  	\`exterior_condition\` text,
  	\`interior_condition\` text,
  	\`engine_condition\` text,
  	\`maintenance_history\` text,
  	\`inspected_at\` text,
  	\`version\` text,
  	\`color\` text,
  	\`location\` text,
  	\`pickup_location\` text,
  	\`operation_status\` text DEFAULT 'READY',
  	\`status\` text DEFAULT 'INACTIVE' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`vehicles_reference_idx\` ON \`vehicles\` (\`reference\`);`)
  await db.run(sql`CREATE INDEX \`vehicles_model_idx\` ON \`vehicles\` (\`model_id\`);`)
  await db.run(
    sql`CREATE UNIQUE INDEX \`vehicles_license_plate_idx\` ON \`vehicles\` (\`license_plate\`);`,
  )
  await db.run(sql`CREATE INDEX \`vehicles_status_idx\` ON \`vehicles\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`vehicles_updated_at_idx\` ON \`vehicles\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`vehicles_created_at_idx\` ON \`vehicles\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`vehicles_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`vehicles_rels_order_idx\` ON \`vehicles_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`vehicles_rels_parent_idx\` ON \`vehicles_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`vehicles_rels_path_idx\` ON \`vehicles_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`vehicles_rels_admins_id_idx\` ON \`vehicles_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`vehicles_rels_users_id_idx\` ON \`vehicles_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`rental_days\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`vehicle_id\` text(36) NOT NULL,
  	\`day\` text NOT NULL,
  	\`booking_key\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`rental_days_key_idx\` ON \`rental_days\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`rental_days_vehicle_idx\` ON \`rental_days\` (\`vehicle_id\`);`)
  await db.run(
    sql`CREATE INDEX \`rental_days_booking_key_idx\` ON \`rental_days\` (\`booking_key\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`rental_days_updated_at_idx\` ON \`rental_days\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`rental_days_created_at_idx\` ON \`rental_days\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`rental_days_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`rental_days\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`rental_days_rels_order_idx\` ON \`rental_days_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`rental_days_rels_parent_idx\` ON \`rental_days_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`rental_days_rels_path_idx\` ON \`rental_days_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`rental_days_rels_admins_id_idx\` ON \`rental_days_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`rental_days_rels_users_id_idx\` ON \`rental_days_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`bookings\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`booking_key\` text,
  	\`customer_id\` text(36),
  	\`vehicle_id\` text(36) NOT NULL,
  	\`start_date\` text NOT NULL,
  	\`end_date\` text NOT NULL,
  	\`pickup_time\` text DEFAULT '08:00',
  	\`return_time\` text DEFAULT '20:00',
  	\`pickup_location\` text,
  	\`delivery_requested\` integer DEFAULT false,
  	\`addon_services\` text,
  	\`customer_phone\` text,
  	\`driver_license_number\` text,
  	\`note\` text,
  	\`total_days\` numeric,
  	\`vehicle_name_snapshot\` text,
  	\`vehicle_reference_snapshot\` text,
  	\`daily_price_snapshot\` numeric,
  	\`base_rent_price\` numeric,
  	\`weekend_surcharge_total\` numeric,
  	\`delivery_fee_snapshot\` numeric,
  	\`addon_fee_total\` numeric,
  	\`discount_amount\` numeric,
  	\`total_price\` numeric,
  	\`deposit_snapshot\` numeric,
  	\`initial_payment_due\` numeric,
  	\`remaining_amount\` numeric,
  	\`handover_note\` text,
  	\`status\` text DEFAULT 'PENDING',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`bookings_booking_key_idx\` ON \`bookings\` (\`booking_key\`);`,
  )
  await db.run(sql`CREATE INDEX \`bookings_customer_idx\` ON \`bookings\` (\`customer_id\`);`)
  await db.run(sql`CREATE INDEX \`bookings_vehicle_idx\` ON \`bookings\` (\`vehicle_id\`);`)
  await db.run(sql`CREATE INDEX \`bookings_updated_at_idx\` ON \`bookings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`bookings_created_at_idx\` ON \`bookings\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`bookings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`bookings_rels_order_idx\` ON \`bookings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`bookings_rels_parent_idx\` ON \`bookings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`bookings_rels_path_idx\` ON \`bookings_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`bookings_rels_admins_id_idx\` ON \`bookings_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`bookings_rels_users_id_idx\` ON \`bookings_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`sales_inquiries\` (
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
  );
  `)
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_customer_idx\` ON \`sales_inquiries\` (\`customer_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_model_idx\` ON \`sales_inquiries\` (\`model_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_updated_at_idx\` ON \`sales_inquiries\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_created_at_idx\` ON \`sales_inquiries\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`sales_inquiries_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_inquiries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_rels_order_idx\` ON \`sales_inquiries_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_rels_parent_idx\` ON \`sales_inquiries_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_rels_path_idx\` ON \`sales_inquiries_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_rels_admins_id_idx\` ON \`sales_inquiries_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`sales_inquiries_rels_users_id_idx\` ON \`sales_inquiries_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`reviews\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`customer_id\` text(36),
  	\`booking_id\` text(36) NOT NULL,
  	\`model_id\` text(36) NOT NULL,
  	\`vehicle_id\` text(36),
  	\`rating\` numeric NOT NULL,
  	\`title\` text,
  	\`comment\` text NOT NULL,
  	\`status\` text DEFAULT 'PUBLISHED',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`customer_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`booking_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`model_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`reviews_customer_idx\` ON \`reviews\` (\`customer_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`reviews_booking_idx\` ON \`reviews\` (\`booking_id\`);`)
  await db.run(sql`CREATE INDEX \`reviews_model_idx\` ON \`reviews\` (\`model_id\`);`)
  await db.run(sql`CREATE INDEX \`reviews_vehicle_idx\` ON \`reviews\` (\`vehicle_id\`);`)
  await db.run(sql`CREATE INDEX \`reviews_updated_at_idx\` ON \`reviews\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`reviews_created_at_idx\` ON \`reviews\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`reviews_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`reviews\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`reviews_rels_order_idx\` ON \`reviews_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`reviews_rels_parent_idx\` ON \`reviews_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`reviews_rels_path_idx\` ON \`reviews_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`reviews_rels_admins_id_idx\` ON \`reviews_rels\` (\`admins_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`reviews_rels_users_id_idx\` ON \`reviews_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`media_id\` text(36),
  	\`folders_id\` text(36),
  	\`tags_id\` text(36),
  	\`users_id\` text(36),
  	\`vehicle_models_id\` text(36),
  	\`vehicles_id\` text(36),
  	\`rental_days_id\` text(36),
  	\`bookings_id\` text(36),
  	\`sales_inquiries_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`vehicle_models_id\`) REFERENCES \`vehicle_models\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`vehicles_id\`) REFERENCES \`vehicles\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`rental_days_id\`) REFERENCES \`rental_days\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`bookings_id\`) REFERENCES \`bookings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`sales_inquiries_id\`) REFERENCES \`sales_inquiries\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_admins_id_idx\` ON \`payload_locked_documents_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_folders_id_idx\` ON \`payload_locked_documents_rels\` (\`folders_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`tags_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_vehicle_models_id_idx\` ON \`payload_locked_documents_rels\` (\`vehicle_models_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_vehicles_id_idx\` ON \`payload_locked_documents_rels\` (\`vehicles_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_rental_days_id_idx\` ON \`payload_locked_documents_rels\` (\`rental_days_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_bookings_id_idx\` ON \`payload_locked_documents_rels\` (\`bookings_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_sales_inquiries_id_idx\` ON \`payload_locked_documents_rels\` (\`sales_inquiries_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_admins_id_idx\` ON \`payload_preferences_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_llm_instructions\` (
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`entity_slug\` text NOT NULL,
  	\`entity_type\` text NOT NULL,
  	\`additional_instructions\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_entity_slug_idx\` ON \`payload_llm_instructions\` (\`entity_slug\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_updated_at_idx\` ON \`payload_llm_instructions\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_created_at_idx\` ON \`payload_llm_instructions\` (\`created_at\`);`,
  )
  await db.run(sql`CREATE TABLE \`payload_llm_instructions_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_llm_instructions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_order_idx\` ON \`payload_llm_instructions_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_parent_idx\` ON \`payload_llm_instructions_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_path_idx\` ON \`payload_llm_instructions_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_admins_id_idx\` ON \`payload_llm_instructions_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_llm_instructions_rels_users_id_idx\` ON \`payload_llm_instructions_rels\` (\`users_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`nori_site_hero_images\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text(36) NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` text(36) NOT NULL,
  	\`credit\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`nori_site\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`nori_site_hero_images_order_idx\` ON \`nori_site_hero_images\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`nori_site_hero_images_parent_id_idx\` ON \`nori_site_hero_images\` (\`_parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`nori_site_hero_images_image_idx\` ON \`nori_site_hero_images\` (\`image_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`nori_site\` (
  	\`id\` text(36) PRIMARY KEY NOT NULL,
  	\`story_image_id\` text(36),
  	\`address\` text,
  	\`phone\` text,
  	\`email\` text,
  	\`opening_hours\` text,
  	\`rental_policy_summary\` text,
  	\`purchase_policy_summary\` text,
  	\`age_requirement\` text,
  	\`license_requirement\` text,
  	\`cancellation_policy\` text,
  	\`deposit_policy\` text,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`story_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX \`nori_site_story_image_idx\` ON \`nori_site\` (\`story_image_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`nori_site_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` text(36) NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` text(36),
  	\`users_id\` text(36),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`nori_site\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`nori_site_rels_order_idx\` ON \`nori_site_rels\` (\`order\`);`)
  await db.run(
    sql`CREATE INDEX \`nori_site_rels_parent_idx\` ON \`nori_site_rels\` (\`parent_id\`);`,
  )
  await db.run(sql`CREATE INDEX \`nori_site_rels_path_idx\` ON \`nori_site_rels\` (\`path\`);`)
  await db.run(
    sql`CREATE INDEX \`nori_site_rels_admins_id_idx\` ON \`nori_site_rels\` (\`admins_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`nori_site_rels_users_id_idx\` ON \`nori_site_rels\` (\`users_id\`);`,
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`admins_sessions\`;`)
  await db.run(sql`DROP TABLE \`admins\`;`)
  await db.run(sql`DROP TABLE \`admins_rels\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`media_rels\`;`)
  await db.run(sql`DROP TABLE \`_media_v\`;`)
  await db.run(sql`DROP TABLE \`_media_v_rels\`;`)
  await db.run(sql`DROP TABLE \`folders\`;`)
  await db.run(sql`DROP TABLE \`folders_rels\`;`)
  await db.run(sql`DROP TABLE \`_folders_v\`;`)
  await db.run(sql`DROP TABLE \`_folders_v_rels\`;`)
  await db.run(sql`DROP TABLE \`tags\`;`)
  await db.run(sql`DROP TABLE \`tags_rels\`;`)
  await db.run(sql`DROP TABLE \`_tags_v\`;`)
  await db.run(sql`DROP TABLE \`_tags_v_rels\`;`)
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`users_rels\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_highlights\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_features\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_gallery\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_specifications\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_variants_colors\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_variants\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models\`;`)
  await db.run(sql`DROP TABLE \`vehicle_models_rels\`;`)
  await db.run(sql`DROP TABLE \`vehicles_photos\`;`)
  await db.run(sql`DROP TABLE \`vehicles\`;`)
  await db.run(sql`DROP TABLE \`vehicles_rels\`;`)
  await db.run(sql`DROP TABLE \`rental_days\`;`)
  await db.run(sql`DROP TABLE \`rental_days_rels\`;`)
  await db.run(sql`DROP TABLE \`bookings\`;`)
  await db.run(sql`DROP TABLE \`bookings_rels\`;`)
  await db.run(sql`DROP TABLE \`sales_inquiries\`;`)
  await db.run(sql`DROP TABLE \`sales_inquiries_rels\`;`)
  await db.run(sql`DROP TABLE \`reviews\`;`)
  await db.run(sql`DROP TABLE \`reviews_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`payload_llm_instructions\`;`)
  await db.run(sql`DROP TABLE \`payload_llm_instructions_rels\`;`)
  await db.run(sql`DROP TABLE \`nori_site_hero_images\`;`)
  await db.run(sql`DROP TABLE \`nori_site\`;`)
  await db.run(sql`DROP TABLE \`nori_site_rels\`;`)
}
