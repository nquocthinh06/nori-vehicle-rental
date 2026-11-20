-- NORI Vehicle Rental - Canonical Payload CMS 4.0 SQLite Schema (nori-payload-sqlite-v2.5)
-- Generated from verified baseline schema (84 tables, 452 DDL statements)

CREATE TABLE IF NOT EXISTS `_folders_v` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`parent_id` text(36),
	`version__h_folders_id` text(36),
	`version_name` text NOT NULL,
	`version_updated_at` text,
	`version_created_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version__h_folders_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `_folders_v_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `_folders_v`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_media_v` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`parent_id` text(36),
	`version_alt` text NOT NULL,
	`version__h_folders_id` text(36),
	`version_updated_at` text,
	`version_created_at` text,
	`version_url` text,
	`version_thumbnail_u_r_l` text,
	`version_filename` text,
	`version_mime_type` text,
	`version_filesize` numeric,
	`version_width` numeric,
	`version_height` numeric,
	`version__stored` integer,
	`version__transforms` text,
	`version_original_filename` text,
	`version_original_url` text,
	`version_original_mime_type` text,
	`version_original_filesize` numeric,
	`version_original_width` numeric,
	`version_original_height` numeric,
	`version_original_prefix` text,
	`version_original__objectkey` text,
	`version_original__stored` integer,
	`version_focal_x` numeric,
	`version_focal_y` numeric,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `version_source_url` text, `version_source_name` text, `version_license` text, `version_model_year` text, `version_variant_name` text, `version_color_name` text, `version_media_category` text DEFAULT 'CATALOGUE_REFERENCE', `version_verified` integer DEFAULT true,
	FOREIGN KEY (`parent_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version__h_folders_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `_media_v_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`tags_id` text(36),
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `_media_v`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tags_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`version_site_name` text DEFAULT 'NORI',
	`version_tagline` text DEFAULT 'Your way. Every day.',
	`version_logo_id` text(36),
	`version_favicon_id` text(36),
	`version_seo_title` text,
	`version_seo_description` text,
	`version_og_image_id` text(36),
	`version_story_image_id` text(36),
	`version_home_intro_title` text,
	`version_home_intro_description` text,
	`version_show_hero_section` integer DEFAULT true,
	`version_show_benefits_section` integer DEFAULT true,
	`version_show_featured_section` integer DEFAULT true,
	`version_show_how_it_works_section` integer DEFAULT true,
	`version_show_story_section` integer DEFAULT true,
	`version_show_cta_section` integer DEFAULT true,
	`version_about_summary` text,
	`version_address` text,
	`version_phone` text,
	`version_email` text,
	`version_opening_hours` text,
	`version_contact_note` text,
	`version_rental_policy_summary` text,
	`version_purchase_policy_summary` text,
	`version_age_requirement` text,
	`version_license_requirement` text,
	`version_cancellation_policy` text,
	`version_deposit_policy` text,
	`version_privacy_policy` text,
	`version_terms_of_use` text,
	`version_deposit_hold_hours` numeric DEFAULT 24,
	`version_max_pending_bookings` numeric DEFAULT 5,
	`version_maintenance_banner_enabled` integer DEFAULT false,
	`version_maintenance_banner_text` text,
	`version__status` text DEFAULT 'draft',
	`version_updated_at` text,
	`version_created_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_locale` text,
	`latest` integer, `version_hero_autoplay_seconds` numeric DEFAULT 6, `version_business_timezone` text DEFAULT 'Asia/Ho_Chi_Minh', `version_working_days` text DEFAULT '1,2,3,4,5', `version_work_start_time` text, `version_work_end_time` text, `version_lunch_break_start` text, `version_lunch_break_end` text,
	FOREIGN KEY (`version_logo_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_favicon_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_og_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_story_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_faqs` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`question` text,
	`answer` text,
	`order` numeric DEFAULT 0,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_footer_links` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`label` text,
	`href` text,
	`group` text DEFAULT 'Khám phá',
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_header_menu` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`label` text,
	`href` text,
	`visible` integer DEFAULT true,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_hero_images` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`image_id` text(36),
	`credit` text,
	`_uuid` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_hero_slides` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`title_first` text,
	`title_second` text,
	`eyebrow` text,
	`category_badge` text,
	`description` text,
	`cta_text` text,
	`cta_href` text,
	`secondary_text` text,
	`secondary_href` text,
	`desktop_image_id` text(36),
	`mobile_image_id` text(36),
	`related_category` text,
	`related_model_id` text(36),
	`credit` text,
	`source_url` text,
	`duration_seconds` numeric,
	`order` numeric DEFAULT 0,
	`active` integer DEFAULT true,
	`_uuid` text, focal_x numeric DEFAULT 50, focal_y numeric DEFAULT 50, mobile_focal_x numeric DEFAULT 50, mobile_focal_y numeric DEFAULT 50,
	FOREIGN KEY (`desktop_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`mobile_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_holidays` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`date` text,
	`name` text,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_nori_site_v_version_social_links` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text(36) PRIMARY KEY NOT NULL,
	`platform` text,
	`url` text,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_nori_site_v`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_posts_v` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`parent_id` text(36),
	`version_title` text,
	`version_slug` text,
	`version_category` text DEFAULT 'NEWS',
	`version_excerpt` text,
	`version_content` text,
	`version_cover_id` text(36),
	`version_published_at` text,
	`version_seo_title` text,
	`version_seo_description` text,
	`version_updated_at` text,
	`version_created_at` text,
	`version__status` text DEFAULT 'draft',
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_locale` text,
	`latest` integer, `version_promotion_id` text(36) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `_posts_v_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `_tags_v` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`parent_id` text(36),
	`version__h_tags_id` text(36),
	`version_name` text NOT NULL,
	`version_updated_at` text,
	`version_created_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version__h_tags_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `_tags_v_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `_tags_v`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `admins` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`email` text NOT NULL,
	`reset_password_token` text,
	`reset_password_expiration` text,
	`salt` text,
	`hash` text,
	`reset_password_requested_at` text,
	`login_attempts` numeric DEFAULT 0,
	`lock_until` text
, `full_name` text, `admin_role` text DEFAULT 'OPERATOR', "permissions" text);

CREATE TABLE IF NOT EXISTS `admins_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `admins_sessions` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text,
	`expires_at` text NOT NULL,
	`refresh_count` numeric,
	`refreshed_at` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`entity_label` text,
	`summary` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`actor_type` text DEFAULT 'SYSTEM',
	`actor_id` text,
	`actor_email` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `audit_logs_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `bookings` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`booking_key` text,
	`customer_id` text(36),
	`vehicle_id` text(36) NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_days` numeric,
	`vehicle_name_snapshot` text,
	`vehicle_reference_snapshot` text,
	`daily_price_snapshot` numeric,
	`total_price` numeric,
	`status` text DEFAULT 'PENDING',
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `pickup_time` text DEFAULT '08:00', `return_time` text DEFAULT '20:00', `pickup_location` text, `delivery_requested` integer DEFAULT false, `addon_services` text, `customer_phone` text, `driver_license_number` text, `note` text, `base_rent_price` numeric, `weekend_surcharge_total` numeric, `delivery_fee_snapshot` numeric, `addon_fee_total` numeric, `discount_amount` numeric, `payment_option` text DEFAULT 'DEPOSIT', `reservation_deposit_snapshot` numeric DEFAULT 0, `deposit_snapshot` numeric, `initial_payment_due` numeric, `remaining_amount` numeric, `handover_note` text, `extra_fee` numeric DEFAULT 0, `extra_fee_note` text, "promo_code" text, "promo_discount_amount" numeric DEFAULT 0, "contract_number" text, "return_odometer" numeric, "return_condition" text, `revision` numeric DEFAULT 1, `return_location` text, `customer_email` text, `expected_contact_date` text, `working_hours_snapshot` text, `is_urgent_approval` integer DEFAULT false,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `bookings_modification_history` (
    `_order` integer NOT NULL,
    `_parent_id` text(36) NOT NULL,
    `id` text PRIMARY KEY NOT NULL,
    `modified_at` text NOT NULL,
    `modified_by` text,
    `actor_type` text,
    `status_at_change` text,
    `reason` text,
    `previous_total_price` numeric,
    `new_total_price` numeric,
    `previous_deposit` numeric,
    `new_deposit` numeric,
    FOREIGN KEY (`_parent_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE TABLE IF NOT EXISTS `bookings_modification_history_changes` (
    `_order` integer NOT NULL,
    `_parent_id` text NOT NULL,
    `id` text PRIMARY KEY NOT NULL,
    `field` text NOT NULL,
    `label` text NOT NULL,
    `before` text,
    `after` text,
    FOREIGN KEY (`_parent_id`) REFERENCES `bookings_modification_history`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE TABLE IF NOT EXISTS `bookings_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `bookings_status_history` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`changed_at` text NOT NULL,
	`changed_by` text,
	`note` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `consultations` (
    `id` text(36) PRIMARY KEY NOT NULL,
    `consultation_key` text,
    `booking_id` text(36) NOT NULL,
    `customer_id` text(36),
    `booking_key_snapshot` text,
    `customer_name_snapshot` text,
    `customer_phone_snapshot` text,
    `customer_email_snapshot` text,
    `vehicle_name_snapshot` text,
    `start_date_snapshot` text,
    `end_date_snapshot` text,
    `approved_at` text NOT NULL,
    `approved_by` text,
    `expected_contact_date` text NOT NULL,
    `working_hours_window` text,
    `is_urgent` integer DEFAULT false,
    `assigned_staff_id` text(36),
    `assigned_staff_name` text,
    `status` text DEFAULT 'PENDING_CONTACT' NOT NULL,
    `callback_scheduled_at` text,
    `internal_note` text,
    `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`assigned_staff_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE set null
  );

CREATE TABLE IF NOT EXISTS `consultations_contact_logs` (
    `_order` integer NOT NULL,
    `_parent_id` text(36) NOT NULL,
    `id` text PRIMARY KEY NOT NULL,
    `contacted_at` text NOT NULL,
    `staff_name` text,
    `outcome` text NOT NULL,
    `note` text,
    `next_callback_at` text,
    FOREIGN KEY (`_parent_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE TABLE IF NOT EXISTS `consultations_rels` (
    `id` integer PRIMARY KEY NOT NULL,
    `order` integer,
    `parent_id` text(36) NOT NULL,
    `path` text NOT NULL,
    `admins_id` text(36),
    `users_id` text(36),
    FOREIGN KEY (`parent_id`) REFERENCES `consultations`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE TABLE IF NOT EXISTS `folders` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`_h_folders_id` text(36),
	`name` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`_h_folders_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `folders_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `maintenance_schedules` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`vehicle_id` text(36) NOT NULL,
	`title` text NOT NULL,
	`maintenance_type` text DEFAULT 'ROUTINE' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`odometer_at_service` numeric,
	`cost` numeric,
	`status` text DEFAULT 'SCHEDULED' NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `maintenance_schedules_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `maintenance_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `media` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`alt` text NOT NULL,
	`_h_folders_id` text(36),
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`url` text,
	`thumbnail_u_r_l` text,
	`filename` text,
	`mime_type` text,
	`filesize` numeric,
	`width` numeric,
	`height` numeric,
	`_stored` integer,
	`_transforms` text,
	`original_filename` text,
	`original_url` text,
	`original_mime_type` text,
	`original_filesize` numeric,
	`original_width` numeric,
	`original_height` numeric,
	`original_prefix` text,
	`original__objectkey` text,
	`original__stored` integer,
	`focal_x` numeric,
	`focal_y` numeric, `source_url` text, `source_name` text, `license` text, `model_year` text, `variant_name` text, `color_name` text, `media_category` text DEFAULT 'CATALOGUE_REFERENCE', `verified` integer DEFAULT true,
	FOREIGN KEY (`_h_folders_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `media_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`tags_id` text(36),
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tags_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "nori_site" (
	`id` text(36) PRIMARY KEY NOT NULL,
	`site_name` text DEFAULT 'NORI',
	`tagline` text DEFAULT 'Your way. Every day.',
	`logo_id` text(36),
	`favicon_id` text(36),
	`seo_title` text,
	`seo_description` text,
	`og_image_id` text(36),
	`story_image_id` text(36),
	`home_intro_title` text,
	`home_intro_description` text,
	`show_hero_section` integer DEFAULT true,
	`show_benefits_section` integer DEFAULT true,
	`show_featured_section` integer DEFAULT true,
	`show_how_it_works_section` integer DEFAULT true,
	`show_story_section` integer DEFAULT true,
	`show_cta_section` integer DEFAULT true,
	`about_summary` text,
	`address` text,
	`phone` text,
	`email` text,
	`opening_hours` text,
	`contact_note` text,
	`rental_policy_summary` text,
	`purchase_policy_summary` text,
	`age_requirement` text,
	`license_requirement` text,
	`cancellation_policy` text,
	`deposit_policy` text,
	`privacy_policy` text,
	`terms_of_use` text,
	`deposit_hold_hours` numeric DEFAULT 24,
	`max_pending_bookings` numeric DEFAULT 5,
	`maintenance_banner_enabled` integer DEFAULT false,
	`maintenance_banner_text` text,
	`_status` text DEFAULT 'draft',
	`updated_at` text,
	`created_at` text, `hero_autoplay_seconds` numeric DEFAULT 6, `business_timezone` text DEFAULT 'Asia/Ho_Chi_Minh', `working_days` text DEFAULT '1,2,3,4,5', `work_start_time` text, `work_end_time` text, `lunch_break_start` text, `lunch_break_end` text,
	FOREIGN KEY (`logo_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`favicon_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`story_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `nori_site_faqs` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`question` text,
	`answer` text,
	`order` numeric DEFAULT 0,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_footer_links` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`href` text,
	`group` text DEFAULT 'Khám phá',
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_header_menu` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text,
	`href` text,
	`visible` integer DEFAULT true,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "nori_site_hero_images" (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text(36),
	`credit` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_hero_slides` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`title_first` text,
	`title_second` text,
	`eyebrow` text,
	`category_badge` text,
	`description` text,
	`cta_text` text,
	`cta_href` text,
	`secondary_text` text,
	`secondary_href` text,
	`desktop_image_id` text(36),
	`mobile_image_id` text(36),
	`related_category` text,
	`related_model_id` text(36),
	`credit` text,
	`source_url` text,
	`duration_seconds` numeric,
	`order` numeric DEFAULT 0,
	`active` integer DEFAULT true, focal_x numeric DEFAULT 50, focal_y numeric DEFAULT 50, mobile_focal_x numeric DEFAULT 50, mobile_focal_y numeric DEFAULT 50,
	FOREIGN KEY (`desktop_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`mobile_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`related_model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_holidays` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`date` text,
	`name` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `nori_site_social_links` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`platform` text,
	`url` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `nori_site`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` text(36) PRIMARY KEY NOT NULL,
    `event_key` text,
    `customer_id` text(36) NOT NULL,
    `booking_id` text(36),
    `type` text DEFAULT 'BOOKING_CONFIRMED' NOT NULL,
    `title` text NOT NULL,
    `message` text NOT NULL,
    `booking_key` text,
    `vehicle_name` text,
    `start_date` text,
    `end_date` text,
    `pickup_time` text,
    `return_time` text,
    `expected_contact_date` text,
    `working_hours_label` text,
    `customer_phone_masked` text,
    `hotline` text,
    `is_urgent` integer DEFAULT false,
    `payment_confirmed` integer DEFAULT false,
    `superseded` integer DEFAULT false,
    `is_read` integer DEFAULT false,
    `read_at` text,
    `popup_dismissed` integer DEFAULT false,
    `popup_dismissed_at` text,
    `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
  );

CREATE TABLE IF NOT EXISTS `notifications_rels` (
    `id` integer PRIMARY KEY NOT NULL,
    `order` integer,
    `parent_id` text(36) NOT NULL,
    `path` text NOT NULL,
    `admins_id` text(36),
    `users_id` text(36),
    FOREIGN KEY (`parent_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
  );

CREATE TABLE IF NOT EXISTS `payload_kv` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `payload_llm_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_slug` text NOT NULL,
	`entity_type` text NOT NULL,
	`additional_instructions` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `payload_llm_instructions_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `payload_llm_instructions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `payload_locked_documents` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`global_slug` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`media_id` text(36),
	`folders_id` text(36),
	`tags_id` text(36),
	`users_id` text(36),
	`vehicle_models_id` text(36),
	`vehicles_id` text(36),
	`maintenance_schedules_id` text(36),
	`rental_days_id` text(36),
	`bookings_id` text(36),
	`sales_inquiries_id` text(36),
	`promotions_id` text(36),
	`payments_id` text(36),
	`posts_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `payload_locked_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folders_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tags_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_models_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicles_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maintenance_schedules_id`) REFERENCES `maintenance_schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rental_days_id`) REFERENCES `rental_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookings_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sales_inquiries_id`) REFERENCES `sales_inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promotions_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payments_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`posts_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `payload_migrations` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`name` text,
	`batch` numeric,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `payload_preferences` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`key` text,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `payload_preferences_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `payload_preferences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `payments` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`reference` text,
	`booking_id` text(36),
	`inquiry_id` text(36),
	`customer_id` text(36),
	`payment_type` text DEFAULT 'DEPOSIT' NOT NULL,
	`method` text DEFAULT 'BANK_TRANSFER' NOT NULL,
	`amount` numeric NOT NULL,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`paid_at` text,
	`recorded_by` text,
	`note` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`inquiry_id`) REFERENCES `sales_inquiries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `payments_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `posts` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`title` text,
	`slug` text,
	`category` text DEFAULT 'NEWS',
	`excerpt` text,
	`content` text,
	`cover_id` text(36),
	`published_at` text,
	`seo_title` text,
	`seo_description` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`_status` text DEFAULT 'draft', `promotion_id` text(36) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `posts_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `promotions` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text DEFAULT 'PERCENT' NOT NULL,
	`discount_value` numeric NOT NULL,
	`max_discount` numeric,
	`min_days` numeric DEFAULT 1,
	`applies_to` text DEFAULT 'RENT',
	`valid_from` text,
	`valid_to` text,
	`usage_limit` numeric,
	`used_count` numeric DEFAULT 0,
	`active` integer DEFAULT true,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS `promotions_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `promotions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `rental_days` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`vehicle_id` text(36) NOT NULL,
	`day` text NOT NULL,
	`booking_key` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `rental_days_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `rental_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `reviews` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`customer_id` text(36),
	`booking_id` text(36) NOT NULL,
	`model_id` text(36) NOT NULL,
	`vehicle_id` text(36),
	`rating` numeric NOT NULL,
	`title` text,
	`comment` text NOT NULL,
	`status` text DEFAULT 'PUBLISHED',
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `reviews_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "sales_inquiries" (
    `id` text(36) PRIMARY KEY NOT NULL,
    `reference` text,
    `inquiry_type` text DEFAULT 'CONSULTATION',
    `customer_id` text(36),
    `model_id` text(36) NOT NULL,
    `vehicle_id` text(36),
    `vehicle_reference` text,
    `variant_name` text,
    `color_name` text,
    `payment_method` text DEFAULT 'DIRECT',
    `preferred_date` text,
    `preferred_location` text,
    `quoted_price_snapshot` numeric,
    `estimated_rolling_snapshot` numeric,
    `phone` text NOT NULL,
    `note` text,
    `status` text DEFAULT 'NEW',
    `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `admin_note` text,
    FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
  );

CREATE TABLE IF NOT EXISTS `sales_inquiries_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `sales_inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `sales_inquiries_status_history` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`changed_at` text NOT NULL,
	`changed_by` text,
	`note` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `sales_inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `tags` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`_h_tags_id` text(36),
	`name` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`_h_tags_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `tags_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `users` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`role` text DEFAULT 'CUSTOMER' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`email` text NOT NULL,
	`reset_password_token` text,
	`reset_password_expiration` text,
	`salt` text,
	`hash` text,
	`reset_password_requested_at` text,
	`login_attempts` numeric DEFAULT 0,
	`lock_until` text
, "driver_license_number" text, "id_card_number" text, "verification_status" text DEFAULT 'UNVERIFIED', "verification_note" text);

CREATE TABLE IF NOT EXISTS `users_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `users_sessions` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text,
	`expires_at` text NOT NULL,
	`refresh_count` numeric,
	`refreshed_at` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`brand` text NOT NULL,
	`category` text NOT NULL,
	`body_style` text,
	`description` text,
	`cover_id` text(36),
	`source` text,
	`visible` integer DEFAULT true,
	`featured` integer DEFAULT false,
	`sort_order` numeric DEFAULT 0,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `sub_category` text, `segment` text, `origin` text, `model_year` numeric, `seats` numeric, `fuel_type` text, `transmission` text, `drive_type` text, `listed_price` numeric, `reference_rent_price` numeric, `suitable_for` text, `exterior_overview` text, `interior_overview` text, `engine_overview` text, `verification_status` text DEFAULT 'VERIFIED', `official_name` text, `model_line` text, `version_name` text, `generation` text, `default_deposit_suggestion` numeric, `usage_purpose` text, `short_description` text,
	FOREIGN KEY (`cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `vehicle_models_features` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'COMFORT' NOT NULL,
	`variant_note` text, `status` text DEFAULT 'EQUIPPED',
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_gallery` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text(36) NOT NULL,
	`kind` text NOT NULL,
	`caption` text, `variant_name` text, `color_name` text, `source_url` text, `license` text, `photo_type` text, `is_primary` integer DEFAULT false, `sort_order` numeric DEFAULT 0, `alt_text` text, `verified` integer DEFAULT true,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_highlights` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_specifications` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`source` text, `group` text DEFAULT 'OVERVIEW', `variant_name` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_variants` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL, `year` numeric, `listed_price` numeric, `reference_rent_price` numeric, `fuel_type` text, `transmission` text, `drive_type` text, `seats` numeric, `summary` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicle_models_variants_colors` (
	`_order` integer NOT NULL,
	`_parent_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image_id` text(36), `hex` text, `source_url` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicle_models_variants`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicles` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`model_id` text(36) NOT NULL,
	`license_plate` text NOT NULL,
	`intent` text DEFAULT 'RENT' NOT NULL,
	`price_per_day` numeric,
	`sale_price` numeric,
	`odometer` numeric,
	`condition` text,
	`inspected_at` text,
	`version` text,
	`color` text,
	`status` text DEFAULT 'INACTIVE' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `is_demo` integer DEFAULT true, `vehicle_condition_type` text DEFAULT 'USED', `manufacture_year` numeric, `price_per_hour` numeric, `price_per_week` numeric, `price_per_month` numeric, `weekend_surcharge` numeric, `holiday_surcharge` numeric, `deposit_amount` numeric, `delivery_fee` numeric, `km_limit_per_day` numeric DEFAULT 300, `over_km_fee` numeric, `late_return_fee_per_hour` numeric, `buffer_hours` numeric DEFAULT 2, `listed_price` numeric, `discount_price` numeric, `reservation_deposit` numeric, `estimated_rolling_price` numeric, `negotiable` integer DEFAULT false, `warranty_policy` text, `price_source_note` text, `exterior_condition` text, `interior_condition` text, `engine_condition` text, `maintenance_history` text, `location` text, `pickup_location` text, `operation_status` text DEFAULT 'READY',
	FOREIGN KEY (`model_id`) REFERENCES `vehicle_models`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `vehicles_photos` (
	`_order` integer NOT NULL,
	`_parent_id` text(36) NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text(36) NOT NULL,
	`caption` text,
	`kind` text DEFAULT 'EXTERIOR', `photo_type` text, `is_primary` integer DEFAULT false, `sort_order` numeric DEFAULT 0, `alt_text` text, `source_name` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`_parent_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `vehicles_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` text(36) NOT NULL,
	`path` text NOT NULL,
	`admins_id` text(36),
	`users_id` text(36),
	FOREIGN KEY (`parent_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admins_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `_folders_v_created_at_idx` ON `_folders_v` (`created_at`);

CREATE INDEX IF NOT EXISTS `_folders_v_parent_idx` ON `_folders_v` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_folders_v_rels_admins_id_idx` ON `_folders_v_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `_folders_v_rels_order_idx` ON `_folders_v_rels` (`order`);

CREATE INDEX IF NOT EXISTS `_folders_v_rels_parent_idx` ON `_folders_v_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_folders_v_rels_path_idx` ON `_folders_v_rels` (`path`);

CREATE INDEX IF NOT EXISTS `_folders_v_rels_users_id_idx` ON `_folders_v_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `_folders_v_updated_at_idx` ON `_folders_v` (`updated_at`);

CREATE INDEX IF NOT EXISTS `_folders_v_version_version__h_folders_idx` ON `_folders_v` (`version__h_folders_id`);

CREATE INDEX IF NOT EXISTS `_folders_v_version_version_created_at_idx` ON `_folders_v` (`version_created_at`);

CREATE INDEX IF NOT EXISTS `_folders_v_version_version_updated_at_idx` ON `_folders_v` (`version_updated_at`);

CREATE INDEX IF NOT EXISTS `_media_v_created_at_idx` ON `_media_v` (`created_at`);

CREATE INDEX IF NOT EXISTS `_media_v_parent_idx` ON `_media_v` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_admins_id_idx` ON `_media_v_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_order_idx` ON `_media_v_rels` (`order`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_parent_idx` ON `_media_v_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_path_idx` ON `_media_v_rels` (`path`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_tags_id_idx` ON `_media_v_rels` (`tags_id`);

CREATE INDEX IF NOT EXISTS `_media_v_rels_users_id_idx` ON `_media_v_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `_media_v_updated_at_idx` ON `_media_v` (`updated_at`);

CREATE INDEX IF NOT EXISTS `_media_v_version_original_version_original_filename_idx` ON `_media_v` (`version_original_filename`);

CREATE INDEX IF NOT EXISTS `_media_v_version_version__h_folders_idx` ON `_media_v` (`version__h_folders_id`);

CREATE INDEX IF NOT EXISTS `_media_v_version_version_created_at_idx` ON `_media_v` (`version_created_at`);

CREATE INDEX IF NOT EXISTS `_media_v_version_version_filename_idx` ON `_media_v` (`version_filename`);

CREATE INDEX IF NOT EXISTS `_media_v_version_version_updated_at_idx` ON `_media_v` (`version_updated_at`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_created_at_idx` ON `_nori_site_v` (`created_at`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_latest_idx` ON `_nori_site_v` (`latest`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_published_locale_idx` ON `_nori_site_v` (`published_locale`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_rels_admins_id_idx` ON `_nori_site_v_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_rels_order_idx` ON `_nori_site_v_rels` (`order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_rels_parent_idx` ON `_nori_site_v_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_rels_path_idx` ON `_nori_site_v_rels` (`path`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_rels_users_id_idx` ON `_nori_site_v_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_updated_at_idx` ON `_nori_site_v` (`updated_at`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_faqs_order_idx` ON `_nori_site_v_version_faqs` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_faqs_parent_id_idx` ON `_nori_site_v_version_faqs` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_footer_links_order_idx` ON `_nori_site_v_version_footer_links` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_footer_links_parent_id_idx` ON `_nori_site_v_version_footer_links` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_header_menu_order_idx` ON `_nori_site_v_version_header_menu` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_header_menu_parent_id_idx` ON `_nori_site_v_version_header_menu` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_images_image_idx` ON `_nori_site_v_version_hero_images` (`image_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_images_order_idx` ON `_nori_site_v_version_hero_images` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_images_parent_id_idx` ON `_nori_site_v_version_hero_images` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_slides_desktop_image_idx` ON `_nori_site_v_version_hero_slides` (`desktop_image_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_slides_mobile_image_idx` ON `_nori_site_v_version_hero_slides` (`mobile_image_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_slides_order_idx` ON `_nori_site_v_version_hero_slides` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_slides_parent_id_idx` ON `_nori_site_v_version_hero_slides` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_hero_slides_related_model_idx` ON `_nori_site_v_version_hero_slides` (`related_model_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_holidays_order_idx` ON `_nori_site_v_version_holidays` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_holidays_parent_id_idx` ON `_nori_site_v_version_holidays` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_social_links_order_idx` ON `_nori_site_v_version_social_links` (`_order`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_social_links_parent_id_idx` ON `_nori_site_v_version_social_links` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_version__status_idx` ON `_nori_site_v` (`version__status`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_version_favicon_idx` ON `_nori_site_v` (`version_favicon_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_version_logo_idx` ON `_nori_site_v` (`version_logo_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_version_og_image_idx` ON `_nori_site_v` (`version_og_image_id`);

CREATE INDEX IF NOT EXISTS `_nori_site_v_version_version_story_image_idx` ON `_nori_site_v` (`version_story_image_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_created_at_idx` ON `_posts_v` (`created_at`);

CREATE INDEX IF NOT EXISTS `_posts_v_latest_idx` ON `_posts_v` (`latest`);

CREATE INDEX IF NOT EXISTS `_posts_v_parent_idx` ON `_posts_v` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_published_locale_idx` ON `_posts_v` (`published_locale`);

CREATE INDEX IF NOT EXISTS `_posts_v_rels_admins_id_idx` ON `_posts_v_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_rels_order_idx` ON `_posts_v_rels` (`order`);

CREATE INDEX IF NOT EXISTS `_posts_v_rels_parent_idx` ON `_posts_v_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_rels_path_idx` ON `_posts_v_rels` (`path`);

CREATE INDEX IF NOT EXISTS `_posts_v_rels_users_id_idx` ON `_posts_v_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_updated_at_idx` ON `_posts_v` (`updated_at`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version__status_idx` ON `_posts_v` (`version__status`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version_cover_idx` ON `_posts_v` (`version_cover_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version_created_at_idx` ON `_posts_v` (`version_created_at`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version_promotion_idx` ON `_posts_v` (`version_promotion_id`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version_slug_idx` ON `_posts_v` (`version_slug`);

CREATE INDEX IF NOT EXISTS `_posts_v_version_version_updated_at_idx` ON `_posts_v` (`version_updated_at`);

CREATE INDEX IF NOT EXISTS `_tags_v_created_at_idx` ON `_tags_v` (`created_at`);

CREATE INDEX IF NOT EXISTS `_tags_v_parent_idx` ON `_tags_v` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_tags_v_rels_admins_id_idx` ON `_tags_v_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `_tags_v_rels_order_idx` ON `_tags_v_rels` (`order`);

CREATE INDEX IF NOT EXISTS `_tags_v_rels_parent_idx` ON `_tags_v_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `_tags_v_rels_path_idx` ON `_tags_v_rels` (`path`);

CREATE INDEX IF NOT EXISTS `_tags_v_rels_users_id_idx` ON `_tags_v_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `_tags_v_updated_at_idx` ON `_tags_v` (`updated_at`);

CREATE INDEX IF NOT EXISTS `_tags_v_version_version__h_tags_idx` ON `_tags_v` (`version__h_tags_id`);

CREATE INDEX IF NOT EXISTS `_tags_v_version_version_created_at_idx` ON `_tags_v` (`version_created_at`);

CREATE INDEX IF NOT EXISTS `_tags_v_version_version_updated_at_idx` ON `_tags_v` (`version_updated_at`);

CREATE INDEX IF NOT EXISTS `admins_created_at_idx` ON `admins` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `admins_email_idx` ON `admins` (`email`);

CREATE INDEX IF NOT EXISTS `admins_rels_admins_id_idx` ON `admins_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `admins_rels_order_idx` ON `admins_rels` (`order`);

CREATE INDEX IF NOT EXISTS `admins_rels_parent_idx` ON `admins_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `admins_rels_path_idx` ON `admins_rels` (`path`);

CREATE INDEX IF NOT EXISTS `admins_rels_users_id_idx` ON `admins_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `admins_sessions_order_idx` ON `admins_sessions` (`_order`);

CREATE INDEX IF NOT EXISTS `admins_sessions_parent_id_idx` ON `admins_sessions` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `admins_updated_at_idx` ON `admins` (`updated_at`);

CREATE INDEX IF NOT EXISTS `audit_logs_action_idx` ON `audit_logs` (`action`);

CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);

CREATE INDEX IF NOT EXISTS `audit_logs_entity_id_idx` ON `audit_logs` (`entity_id`);

CREATE INDEX IF NOT EXISTS `audit_logs_entity_idx` ON `audit_logs` (`entity`);

CREATE INDEX IF NOT EXISTS `audit_logs_rels_admins_id_idx` ON `audit_logs_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `audit_logs_rels_order_idx` ON `audit_logs_rels` (`order`);

CREATE INDEX IF NOT EXISTS `audit_logs_rels_parent_idx` ON `audit_logs_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `audit_logs_rels_path_idx` ON `audit_logs_rels` (`path`);

CREATE INDEX IF NOT EXISTS `audit_logs_rels_users_id_idx` ON `audit_logs_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `audit_logs_updated_at_idx` ON `audit_logs` (`updated_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `bookings_booking_key_idx` ON `bookings` (`booking_key`);

CREATE INDEX IF NOT EXISTS `bookings_created_at_idx` ON `bookings` (`created_at`);

CREATE INDEX IF NOT EXISTS `bookings_customer_idx` ON `bookings` (`customer_id`);

CREATE INDEX IF NOT EXISTS `bookings_modification_history_changes_order_idx` ON `bookings_modification_history_changes` (`_order`);

CREATE INDEX IF NOT EXISTS `bookings_modification_history_changes_parent_id_idx` ON `bookings_modification_history_changes` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `bookings_modification_history_order_idx` ON `bookings_modification_history` (`_order`);

CREATE INDEX IF NOT EXISTS `bookings_modification_history_parent_id_idx` ON `bookings_modification_history` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `bookings_rels_admins_id_idx` ON `bookings_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `bookings_rels_order_idx` ON `bookings_rels` (`order`);

CREATE INDEX IF NOT EXISTS `bookings_rels_parent_idx` ON `bookings_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `bookings_rels_path_idx` ON `bookings_rels` (`path`);

CREATE INDEX IF NOT EXISTS `bookings_rels_users_id_idx` ON `bookings_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `bookings_status_history_order_idx` ON `bookings_status_history` (`_order`);

CREATE INDEX IF NOT EXISTS `bookings_status_history_parent_id_idx` ON `bookings_status_history` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `bookings_updated_at_idx` ON `bookings` (`updated_at`);

CREATE INDEX IF NOT EXISTS `bookings_vehicle_idx` ON `bookings` (`vehicle_id`);

CREATE INDEX IF NOT EXISTS `consultations_assigned_staff_idx` ON `consultations` (`assigned_staff_id`);

CREATE INDEX IF NOT EXISTS `consultations_booking_idx` ON `consultations` (`booking_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `consultations_consultation_key_idx` ON `consultations` (`consultation_key`);

CREATE INDEX IF NOT EXISTS `consultations_contact_logs_order_idx` ON `consultations_contact_logs` (`_order`);

CREATE INDEX IF NOT EXISTS `consultations_contact_logs_parent_id_idx` ON `consultations_contact_logs` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `consultations_created_at_idx` ON `consultations` (`created_at`);

CREATE INDEX IF NOT EXISTS `consultations_customer_idx` ON `consultations` (`customer_id`);

CREATE INDEX IF NOT EXISTS `consultations_expected_contact_date_idx` ON `consultations` (`expected_contact_date`);

CREATE INDEX IF NOT EXISTS `consultations_is_urgent_idx` ON `consultations` (`is_urgent`);

CREATE INDEX IF NOT EXISTS `consultations_rels_admins_id_idx` ON `consultations_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `consultations_rels_order_idx` ON `consultations_rels` (`order`);

CREATE INDEX IF NOT EXISTS `consultations_rels_parent_idx` ON `consultations_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `consultations_rels_path_idx` ON `consultations_rels` (`path`);

CREATE INDEX IF NOT EXISTS `consultations_rels_users_id_idx` ON `consultations_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `consultations_status_idx` ON `consultations` (`status`);

CREATE INDEX IF NOT EXISTS `consultations_updated_at_idx` ON `consultations` (`updated_at`);

CREATE INDEX IF NOT EXISTS `folders__h_folders_idx` ON `folders` (`_h_folders_id`);

CREATE INDEX IF NOT EXISTS `folders_created_at_idx` ON `folders` (`created_at`);

CREATE INDEX IF NOT EXISTS `folders_rels_admins_id_idx` ON `folders_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `folders_rels_order_idx` ON `folders_rels` (`order`);

CREATE INDEX IF NOT EXISTS `folders_rels_parent_idx` ON `folders_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `folders_rels_path_idx` ON `folders_rels` (`path`);

CREATE INDEX IF NOT EXISTS `folders_rels_users_id_idx` ON `folders_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `folders_updated_at_idx` ON `folders` (`updated_at`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_created_at_idx` ON `maintenance_schedules` (`created_at`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_end_date_idx` ON `maintenance_schedules` (`end_date`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_rels_admins_id_idx` ON `maintenance_schedules_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_rels_order_idx` ON `maintenance_schedules_rels` (`order`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_rels_parent_idx` ON `maintenance_schedules_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_rels_path_idx` ON `maintenance_schedules_rels` (`path`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_rels_users_id_idx` ON `maintenance_schedules_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_start_date_idx` ON `maintenance_schedules` (`start_date`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_status_idx` ON `maintenance_schedules` (`status`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_updated_at_idx` ON `maintenance_schedules` (`updated_at`);

CREATE INDEX IF NOT EXISTS `maintenance_schedules_vehicle_idx` ON `maintenance_schedules` (`vehicle_id`);

CREATE INDEX IF NOT EXISTS `media__h_folders_idx` ON `media` (`_h_folders_id`);

CREATE INDEX IF NOT EXISTS `media_created_at_idx` ON `media` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `media_filename_idx` ON `media` (`filename`);

CREATE INDEX IF NOT EXISTS `media_original_original_filename_idx` ON `media` (`original_filename`);

CREATE INDEX IF NOT EXISTS `media_rels_admins_id_idx` ON `media_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `media_rels_order_idx` ON `media_rels` (`order`);

CREATE INDEX IF NOT EXISTS `media_rels_parent_idx` ON `media_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `media_rels_path_idx` ON `media_rels` (`path`);

CREATE INDEX IF NOT EXISTS `media_rels_tags_id_idx` ON `media_rels` (`tags_id`);

CREATE INDEX IF NOT EXISTS `media_rels_users_id_idx` ON `media_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `media_updated_at_idx` ON `media` (`updated_at`);

CREATE INDEX IF NOT EXISTS `nori_site__status_idx` ON `nori_site` (`_status`);

CREATE INDEX IF NOT EXISTS `nori_site_faqs_order_idx` ON `nori_site_faqs` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_faqs_parent_id_idx` ON `nori_site_faqs` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_favicon_idx` ON `nori_site` (`favicon_id`);

CREATE INDEX IF NOT EXISTS `nori_site_footer_links_order_idx` ON `nori_site_footer_links` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_footer_links_parent_id_idx` ON `nori_site_footer_links` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_header_menu_order_idx` ON `nori_site_header_menu` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_header_menu_parent_id_idx` ON `nori_site_header_menu` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_images_image_idx` ON `nori_site_hero_images` (`image_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_images_order_idx` ON `nori_site_hero_images` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_images_parent_id_idx` ON `nori_site_hero_images` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_slides_desktop_image_idx` ON `nori_site_hero_slides` (`desktop_image_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_slides_mobile_image_idx` ON `nori_site_hero_slides` (`mobile_image_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_slides_order_idx` ON `nori_site_hero_slides` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_slides_parent_id_idx` ON `nori_site_hero_slides` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_hero_slides_related_model_idx` ON `nori_site_hero_slides` (`related_model_id`);

CREATE INDEX IF NOT EXISTS `nori_site_holidays_order_idx` ON `nori_site_holidays` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_holidays_parent_id_idx` ON `nori_site_holidays` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_logo_idx` ON `nori_site` (`logo_id`);

CREATE INDEX IF NOT EXISTS `nori_site_og_image_idx` ON `nori_site` (`og_image_id`);

CREATE INDEX IF NOT EXISTS `nori_site_rels_admins_id_idx` ON `nori_site_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `nori_site_rels_order_idx` ON `nori_site_rels` (`order`);

CREATE INDEX IF NOT EXISTS `nori_site_rels_parent_idx` ON `nori_site_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_rels_path_idx` ON `nori_site_rels` (`path`);

CREATE INDEX IF NOT EXISTS `nori_site_rels_users_id_idx` ON `nori_site_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `nori_site_social_links_order_idx` ON `nori_site_social_links` (`_order`);

CREATE INDEX IF NOT EXISTS `nori_site_social_links_parent_id_idx` ON `nori_site_social_links` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `nori_site_story_image_idx` ON `nori_site` (`story_image_id`);

CREATE INDEX IF NOT EXISTS `notifications_booking_idx` ON `notifications` (`booking_id`);

CREATE INDEX IF NOT EXISTS `notifications_created_at_idx` ON `notifications` (`created_at`);

CREATE INDEX IF NOT EXISTS `notifications_customer_idx` ON `notifications` (`customer_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `notifications_event_key_idx` ON `notifications` (`event_key`);

CREATE INDEX IF NOT EXISTS `notifications_is_read_idx` ON `notifications` (`is_read`);

CREATE INDEX IF NOT EXISTS `notifications_rels_admins_id_idx` ON `notifications_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `notifications_rels_order_idx` ON `notifications_rels` (`order`);

CREATE INDEX IF NOT EXISTS `notifications_rels_parent_idx` ON `notifications_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `notifications_rels_path_idx` ON `notifications_rels` (`path`);

CREATE INDEX IF NOT EXISTS `notifications_rels_users_id_idx` ON `notifications_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `notifications_updated_at_idx` ON `notifications` (`updated_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `payload_kv_key_idx` ON `payload_kv` (`key`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_created_at_idx` ON `payload_llm_instructions` (`created_at`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_entity_slug_idx` ON `payload_llm_instructions` (`entity_slug`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_rels_admins_id_idx` ON `payload_llm_instructions_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_rels_order_idx` ON `payload_llm_instructions_rels` (`order`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_rels_parent_idx` ON `payload_llm_instructions_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_rels_path_idx` ON `payload_llm_instructions_rels` (`path`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_rels_users_id_idx` ON `payload_llm_instructions_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `payload_llm_instructions_updated_at_idx` ON `payload_llm_instructions` (`updated_at`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_created_at_idx` ON `payload_locked_documents` (`created_at`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_global_slug_idx` ON `payload_locked_documents` (`global_slug`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_admins_id_idx` ON `payload_locked_documents_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_bookings_id_idx` ON `payload_locked_documents_rels` (`bookings_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_folders_id_idx` ON `payload_locked_documents_rels` (`folders_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_maintenance_schedules_id_idx` ON `payload_locked_documents_rels` (`maintenance_schedules_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_media_id_idx` ON `payload_locked_documents_rels` (`media_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_order_idx` ON `payload_locked_documents_rels` (`order`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_parent_idx` ON `payload_locked_documents_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_path_idx` ON `payload_locked_documents_rels` (`path`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_payments_id_idx` ON `payload_locked_documents_rels` (`payments_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_posts_id_idx` ON `payload_locked_documents_rels` (`posts_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_promotions_id_idx` ON `payload_locked_documents_rels` (`promotions_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_rental_days_id_idx` ON `payload_locked_documents_rels` (`rental_days_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_sales_inquiries_id_idx` ON `payload_locked_documents_rels` (`sales_inquiries_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_tags_id_idx` ON `payload_locked_documents_rels` (`tags_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_users_id_idx` ON `payload_locked_documents_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_vehicle_models_id_idx` ON `payload_locked_documents_rels` (`vehicle_models_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_vehicles_id_idx` ON `payload_locked_documents_rels` (`vehicles_id`);

CREATE INDEX IF NOT EXISTS `payload_locked_documents_updated_at_idx` ON `payload_locked_documents` (`updated_at`);

CREATE INDEX IF NOT EXISTS `payload_migrations_created_at_idx` ON `payload_migrations` (`created_at`);

CREATE INDEX IF NOT EXISTS `payload_migrations_updated_at_idx` ON `payload_migrations` (`updated_at`);

CREATE INDEX IF NOT EXISTS `payload_preferences_created_at_idx` ON `payload_preferences` (`created_at`);

CREATE INDEX IF NOT EXISTS `payload_preferences_key_idx` ON `payload_preferences` (`key`);

CREATE INDEX IF NOT EXISTS `payload_preferences_rels_admins_id_idx` ON `payload_preferences_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `payload_preferences_rels_order_idx` ON `payload_preferences_rels` (`order`);

CREATE INDEX IF NOT EXISTS `payload_preferences_rels_parent_idx` ON `payload_preferences_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `payload_preferences_rels_path_idx` ON `payload_preferences_rels` (`path`);

CREATE INDEX IF NOT EXISTS `payload_preferences_rels_users_id_idx` ON `payload_preferences_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `payload_preferences_updated_at_idx` ON `payload_preferences` (`updated_at`);

CREATE INDEX IF NOT EXISTS `payments_booking_idx` ON `payments` (`booking_id`);

CREATE INDEX IF NOT EXISTS `payments_created_at_idx` ON `payments` (`created_at`);

CREATE INDEX IF NOT EXISTS `payments_customer_idx` ON `payments` (`customer_id`);

CREATE INDEX IF NOT EXISTS `payments_inquiry_idx` ON `payments` (`inquiry_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `payments_reference_idx` ON `payments` (`reference`);

CREATE INDEX IF NOT EXISTS `payments_rels_admins_id_idx` ON `payments_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `payments_rels_order_idx` ON `payments_rels` (`order`);

CREATE INDEX IF NOT EXISTS `payments_rels_parent_idx` ON `payments_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `payments_rels_path_idx` ON `payments_rels` (`path`);

CREATE INDEX IF NOT EXISTS `payments_rels_users_id_idx` ON `payments_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `payments_status_idx` ON `payments` (`status`);

CREATE INDEX IF NOT EXISTS `payments_updated_at_idx` ON `payments` (`updated_at`);

CREATE INDEX IF NOT EXISTS `posts__status_idx` ON `posts` (`_status`);

CREATE INDEX IF NOT EXISTS `posts_cover_idx` ON `posts` (`cover_id`);

CREATE INDEX IF NOT EXISTS `posts_created_at_idx` ON `posts` (`created_at`);

CREATE INDEX IF NOT EXISTS `posts_promotion_idx` ON `posts` (`promotion_id`);

CREATE INDEX IF NOT EXISTS `posts_rels_admins_id_idx` ON `posts_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `posts_rels_order_idx` ON `posts_rels` (`order`);

CREATE INDEX IF NOT EXISTS `posts_rels_parent_idx` ON `posts_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `posts_rels_path_idx` ON `posts_rels` (`path`);

CREATE INDEX IF NOT EXISTS `posts_rels_users_id_idx` ON `posts_rels` (`users_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `posts_slug_idx` ON `posts` (`slug`);

CREATE INDEX IF NOT EXISTS `posts_updated_at_idx` ON `posts` (`updated_at`);

CREATE INDEX IF NOT EXISTS `promotions_active_idx` ON `promotions` (`active`);

CREATE UNIQUE INDEX IF NOT EXISTS `promotions_code_idx` ON `promotions` (`code`);

CREATE INDEX IF NOT EXISTS `promotions_created_at_idx` ON `promotions` (`created_at`);

CREATE INDEX IF NOT EXISTS `promotions_rels_admins_id_idx` ON `promotions_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `promotions_rels_order_idx` ON `promotions_rels` (`order`);

CREATE INDEX IF NOT EXISTS `promotions_rels_parent_idx` ON `promotions_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `promotions_rels_path_idx` ON `promotions_rels` (`path`);

CREATE INDEX IF NOT EXISTS `promotions_rels_users_id_idx` ON `promotions_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `promotions_updated_at_idx` ON `promotions` (`updated_at`);

CREATE INDEX IF NOT EXISTS `rental_days_booking_key_idx` ON `rental_days` (`booking_key`);

CREATE INDEX IF NOT EXISTS `rental_days_created_at_idx` ON `rental_days` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `rental_days_key_idx` ON `rental_days` (`key`);

CREATE INDEX IF NOT EXISTS `rental_days_rels_admins_id_idx` ON `rental_days_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `rental_days_rels_order_idx` ON `rental_days_rels` (`order`);

CREATE INDEX IF NOT EXISTS `rental_days_rels_parent_idx` ON `rental_days_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `rental_days_rels_path_idx` ON `rental_days_rels` (`path`);

CREATE INDEX IF NOT EXISTS `rental_days_rels_users_id_idx` ON `rental_days_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `rental_days_updated_at_idx` ON `rental_days` (`updated_at`);

CREATE INDEX IF NOT EXISTS `rental_days_vehicle_idx` ON `rental_days` (`vehicle_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `reviews_booking_idx` ON `reviews` (`booking_id`);

CREATE INDEX IF NOT EXISTS `reviews_created_at_idx` ON `reviews` (`created_at`);

CREATE INDEX IF NOT EXISTS `reviews_customer_idx` ON `reviews` (`customer_id`);

CREATE INDEX IF NOT EXISTS `reviews_model_idx` ON `reviews` (`model_id`);

CREATE INDEX IF NOT EXISTS `reviews_rels_admins_id_idx` ON `reviews_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `reviews_rels_order_idx` ON `reviews_rels` (`order`);

CREATE INDEX IF NOT EXISTS `reviews_rels_parent_idx` ON `reviews_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `reviews_rels_path_idx` ON `reviews_rels` (`path`);

CREATE INDEX IF NOT EXISTS `reviews_rels_users_id_idx` ON `reviews_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `reviews_updated_at_idx` ON `reviews` (`updated_at`);

CREATE INDEX IF NOT EXISTS `reviews_vehicle_idx` ON `reviews` (`vehicle_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_created_at_idx` ON `sales_inquiries` (`created_at`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_customer_idx` ON `sales_inquiries` (`customer_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_model_idx` ON `sales_inquiries` (`model_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_rels_admins_id_idx` ON `sales_inquiries_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_rels_order_idx` ON `sales_inquiries_rels` (`order`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_rels_parent_idx` ON `sales_inquiries_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_rels_path_idx` ON `sales_inquiries_rels` (`path`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_rels_users_id_idx` ON `sales_inquiries_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_status_history_order_idx` ON `sales_inquiries_status_history` (`_order`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_status_history_parent_id_idx` ON `sales_inquiries_status_history` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_updated_at_idx` ON `sales_inquiries` (`updated_at`);

CREATE INDEX IF NOT EXISTS `sales_inquiries_vehicle_idx` ON `sales_inquiries` (`vehicle_id`);

CREATE INDEX IF NOT EXISTS `tags__h_tags_idx` ON `tags` (`_h_tags_id`);

CREATE INDEX IF NOT EXISTS `tags_created_at_idx` ON `tags` (`created_at`);

CREATE INDEX IF NOT EXISTS `tags_rels_admins_id_idx` ON `tags_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `tags_rels_order_idx` ON `tags_rels` (`order`);

CREATE INDEX IF NOT EXISTS `tags_rels_parent_idx` ON `tags_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `tags_rels_path_idx` ON `tags_rels` (`path`);

CREATE INDEX IF NOT EXISTS `tags_rels_users_id_idx` ON `tags_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `tags_updated_at_idx` ON `tags` (`updated_at`);

CREATE INDEX IF NOT EXISTS `users_created_at_idx` ON `users` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `users_email_idx` ON `users` (`email`);

CREATE INDEX IF NOT EXISTS `users_rels_admins_id_idx` ON `users_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `users_rels_order_idx` ON `users_rels` (`order`);

CREATE INDEX IF NOT EXISTS `users_rels_parent_idx` ON `users_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `users_rels_path_idx` ON `users_rels` (`path`);

CREATE INDEX IF NOT EXISTS `users_rels_users_id_idx` ON `users_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `users_sessions_order_idx` ON `users_sessions` (`_order`);

CREATE INDEX IF NOT EXISTS `users_sessions_parent_id_idx` ON `users_sessions` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `users_updated_at_idx` ON `users` (`updated_at`);

CREATE INDEX IF NOT EXISTS `vehicle_models_brand_idx` ON `vehicle_models` (`brand`);

CREATE INDEX IF NOT EXISTS `vehicle_models_category_idx` ON `vehicle_models` (`category`);

CREATE INDEX IF NOT EXISTS `vehicle_models_cover_idx` ON `vehicle_models` (`cover_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_created_at_idx` ON `vehicle_models` (`created_at`);

CREATE INDEX IF NOT EXISTS `vehicle_models_features_order_idx` ON `vehicle_models_features` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_features_parent_id_idx` ON `vehicle_models_features` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_gallery_image_idx` ON `vehicle_models_gallery` (`image_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_gallery_order_idx` ON `vehicle_models_gallery` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_gallery_parent_id_idx` ON `vehicle_models_gallery` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_highlights_order_idx` ON `vehicle_models_highlights` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_highlights_parent_id_idx` ON `vehicle_models_highlights` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_rels_admins_id_idx` ON `vehicle_models_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_rels_order_idx` ON `vehicle_models_rels` (`order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_rels_parent_idx` ON `vehicle_models_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_rels_path_idx` ON `vehicle_models_rels` (`path`);

CREATE INDEX IF NOT EXISTS `vehicle_models_rels_users_id_idx` ON `vehicle_models_rels` (`users_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `vehicle_models_slug_idx` ON `vehicle_models` (`slug`);

CREATE INDEX IF NOT EXISTS `vehicle_models_specifications_order_idx` ON `vehicle_models_specifications` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_specifications_parent_id_idx` ON `vehicle_models_specifications` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_sub_category_idx` ON `vehicle_models` (`sub_category`);

CREATE INDEX IF NOT EXISTS `vehicle_models_updated_at_idx` ON `vehicle_models` (`updated_at`);

CREATE INDEX IF NOT EXISTS `vehicle_models_variants_colors_image_idx` ON `vehicle_models_variants_colors` (`image_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_variants_colors_order_idx` ON `vehicle_models_variants_colors` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_variants_colors_parent_id_idx` ON `vehicle_models_variants_colors` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_variants_order_idx` ON `vehicle_models_variants` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicle_models_variants_parent_id_idx` ON `vehicle_models_variants` (`_parent_id`);

CREATE INDEX IF NOT EXISTS `vehicle_models_visible_idx` ON `vehicle_models` (`visible`);

CREATE INDEX IF NOT EXISTS `vehicles_created_at_idx` ON `vehicles` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `vehicles_license_plate_idx` ON `vehicles` (`license_plate`);

CREATE INDEX IF NOT EXISTS `vehicles_model_idx` ON `vehicles` (`model_id`);

CREATE INDEX IF NOT EXISTS `vehicles_photos_image_idx` ON `vehicles_photos` (`image_id`);

CREATE INDEX IF NOT EXISTS `vehicles_photos_order_idx` ON `vehicles_photos` (`_order`);

CREATE INDEX IF NOT EXISTS `vehicles_photos_parent_id_idx` ON `vehicles_photos` (`_parent_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `vehicles_reference_idx` ON `vehicles` (`reference`);

CREATE INDEX IF NOT EXISTS `vehicles_rels_admins_id_idx` ON `vehicles_rels` (`admins_id`);

CREATE INDEX IF NOT EXISTS `vehicles_rels_order_idx` ON `vehicles_rels` (`order`);

CREATE INDEX IF NOT EXISTS `vehicles_rels_parent_idx` ON `vehicles_rels` (`parent_id`);

CREATE INDEX IF NOT EXISTS `vehicles_rels_path_idx` ON `vehicles_rels` (`path`);

CREATE INDEX IF NOT EXISTS `vehicles_rels_users_id_idx` ON `vehicles_rels` (`users_id`);

CREATE INDEX IF NOT EXISTS `vehicles_status_idx` ON `vehicles` (`status`);

CREATE INDEX IF NOT EXISTS `vehicles_updated_at_idx` ON `vehicles` (`updated_at`);
