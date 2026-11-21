import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en');
  CREATE TYPE "public"."enum_admins_admin_role" AS ENUM('SUPER_ADMIN', 'OPERATOR');
  CREATE TYPE "public"."enum_admins_staff_title" AS ENUM('SUPER_ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER', 'RENTAL_STAFF', 'WAREHOUSE_STAFF', 'DELIVERY_STAFF', 'ACCOUNTANT', 'OPERATOR');
  CREATE TYPE "public"."enum_admins_branch_scope_mode" AS ENUM('ALL', 'ASSIGNED');
  CREATE TYPE "public"."enum_admins_account_status" AS ENUM('ACTIVE', 'REVOKED', 'SUSPENDED');
  CREATE TYPE "public"."enum_audit_logs_actor_type" AS ENUM('ADMIN', 'CUSTOMER', 'SYSTEM');
  CREATE TYPE "public"."enum_audit_logs_outcome" AS ENUM('SUCCESS', 'DENIED', 'FAILED');
  CREATE TYPE "public"."enum_media_media_category" AS ENUM('CATALOGUE_OFFICIAL', 'CATALOGUE_REFERENCE', 'ACTUAL_VEHICLE', 'ILLUSTRATION');
  CREATE TYPE "public"."enum__media_v_version_media_category" AS ENUM('CATALOGUE_OFFICIAL', 'CATALOGUE_REFERENCE', 'ACTUAL_VEHICLE', 'ILLUSTRATION');
  CREATE TYPE "public"."enum_users_role" AS ENUM('CUSTOMER');
  CREATE TYPE "public"."enum_users_status" AS ENUM('ACTIVE', 'DISABLED');
  CREATE TYPE "public"."enum_users_verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
  CREATE TYPE "public"."enum_branches_status" AS ENUM('ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED', 'ARCHIVED');
  CREATE TYPE "public"."enum_warehouses_warehouse_type" AS ENUM('SHOWROOM', 'PARKING_LOT', 'STORAGE', 'MAINTENANCE_CENTER', 'STAGING_POINT');
  CREATE TYPE "public"."enum_warehouses_status" AS ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED');
  CREATE TYPE "public"."enum_service_locations_location_type" AS ENUM('BRANCH', 'SHOWROOM', 'WAREHOUSE', 'FIXED_POINT', 'AIRPORT', 'TRAIN_STATION', 'PARTNER_HOTEL');
  CREATE TYPE "public"."enum_service_locations_status" AS ENUM('ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED');
  CREATE TYPE "public"."enum_branch_staff_staff_role" AS ENUM('BRANCH_MANAGER', 'RENTAL_STAFF', 'WAREHOUSE_STAFF', 'DELIVERY_STAFF', 'ACCOUNTANT');
  CREATE TYPE "public"."enum_branch_staff_status" AS ENUM('ACTIVE', 'REVOKED', 'INACTIVE');
  CREATE TYPE "public"."enum_vehicle_models_features_category" AS ENUM('COMFORT', 'SAFETY', 'DRIVER_ASSIST', 'TECHNOLOGY');
  CREATE TYPE "public"."enum_vehicle_models_features_status" AS ENUM('EQUIPPED', 'NOT_EQUIPPED', 'UNVERIFIED', 'NOT_APPLICABLE');
  CREATE TYPE "public"."enum_vehicle_models_gallery_kind" AS ENUM('OVERVIEW', 'EXTERIOR', 'INTERIOR', 'ENGINE', 'FEATURE');
  CREATE TYPE "public"."enum_vehicle_models_specifications_group" AS ENUM('OVERVIEW', 'ENGINE', 'DIMENSIONS', 'CHASSIS', 'PICKUP', 'MOTORBIKE', 'EV');
  CREATE TYPE "public"."enum_vehicle_models_category" AS ENUM('CAR', 'MOTORBIKE', 'PICKUP');
  CREATE TYPE "public"."enum_vehicle_models_sub_category" AS ENUM('MANUAL_BIKE', 'SCOOTER', 'CLUTCH_BIKE', 'BIG_BIKE', 'ELECTRIC_BIKE', 'HATCHBACK', 'SEDAN', 'SUV', 'CUV', 'MPV', 'COUPE', 'SPORTS', 'ELECTRIC_CAR', 'STANDARD_PICKUP', 'WORK_PICKUP', 'PREMIUM_PICKUP', 'PERFORMANCE_PICKUP');
  CREATE TYPE "public"."enum_vehicle_models_fuel_type" AS ENUM('Xăng', 'Dầu (Diesel)', 'Điện (EV)', 'Hybrid');
  CREATE TYPE "public"."enum_vehicle_models_verification_status" AS ENUM('VERIFIED', 'UNVERIFIED', 'DRAFT');
  CREATE TYPE "public"."enum_vehicles_photos_kind" AS ENUM('EXTERIOR', 'INTERIOR', 'ENGINE', 'ACTUAL');
  CREATE TYPE "public"."enum_vehicles_intent" AS ENUM('RENT', 'SALE', 'BOTH');
  CREATE TYPE "public"."enum_vehicles_vehicle_condition_type" AS ENUM('NEW', 'USED');
  CREATE TYPE "public"."enum_vehicles_allocation_status" AS ENUM('UNALLOCATED', 'ALLOCATED');
  CREATE TYPE "public"."enum_vehicles_operation_status" AS ENUM('READY', 'RENTED', 'RESERVED', 'MAINTENANCE', 'IN_TRANSIT', 'PENDING_INSPECTION', 'SOLD', 'INACTIVE');
  CREATE TYPE "public"."enum_vehicles_status" AS ENUM('ACTIVE', 'INACTIVE');
  CREATE TYPE "public"."enum_vehicle_transfers_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXCEPTION');
  CREATE TYPE "public"."enum_vehicle_location_history_event_type" AS ENUM('INITIAL_ALLOCATION', 'BOOKING_HANDOVER', 'BOOKING_RETURN', 'ONE_WAY_RETURN', 'TRANSFER_DEPARTURE', 'TRANSFER_ARRIVAL', 'TRANSFER_COMPLETED', 'DELIVERY_DISPATCH', 'PICKUP_RETURN', 'MANUAL_RELOCATION', 'INSPECTION_CLEARED', 'MAINTENANCE_MOVE');
  CREATE TYPE "public"."enum_delivery_jobs_job_type" AS ENUM('DELIVERY', 'PICKUP');
  CREATE TYPE "public"."enum_delivery_jobs_status" AS ENUM('PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'FAILED', 'CANCELLED');
  CREATE TYPE "public"."enum_location_pricing_rules_scope_type" AS ENUM('VEHICLE_BRANCH', 'MODEL_BRANCH', 'BRANCH_DEFAULT', 'GLOBAL_DEFAULT');
  CREATE TYPE "public"."enum_one_way_rental_rules_vehicle_category" AS ENUM('ALL', 'CAR', 'MOTORBIKE', 'PICKUP');
  CREATE TYPE "public"."enum_one_way_rental_rules_revenue_split_mode" AS ENUM('PICKUP_BRANCH', 'RETURN_BRANCH', 'SPLIT_50_50', 'CUSTOM_PERCENT');
  CREATE TYPE "public"."enum_maintenance_schedules_maintenance_type" AS ENUM('ROUTINE', 'REPAIR', 'INSPECTION');
  CREATE TYPE "public"."enum_maintenance_schedules_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  CREATE TYPE "public"."enum_rental_days_lock_type" AS ENUM('BOOKING', 'TRANSFER', 'MAINTENANCE', 'PREPARATION');
  CREATE TYPE "public"."enum_bookings_pickup_method" AS ENUM('BRANCH_PICKUP', 'HOME_DELIVERY');
  CREATE TYPE "public"."enum_bookings_return_method" AS ENUM('BRANCH_RETURN', 'HOME_PICKUP');
  CREATE TYPE "public"."enum_bookings_return_inspection_status" AS ENUM('NOT_APPLICABLE', 'PENDING_INSPECTION', 'PASSED', 'DAMAGED_NEEDS_REPAIR');
  CREATE TYPE "public"."enum_bookings_payment_option" AS ENUM('DEPOSIT', 'FULL');
  CREATE TYPE "public"."enum_bookings_status" AS ENUM('PENDING', 'DEPOSIT_PENDING', 'CONFIRMED', 'READY_FOR_HANDOVER', 'ONGOING', 'INSPECTING', 'COMPLETED', 'CANCELLED', 'REJECTED');
  CREATE TYPE "public"."enum_consultations_status" AS ENUM('PENDING_CONTACT', 'CONTACTING', 'NO_ANSWER', 'CALLBACK_SCHEDULED', 'CONSULTED', 'COMPLETED', 'CANCELLED');
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('BOOKING_CONFIRMED', 'BOOKING_UPDATED', 'CONSULTATION_UPDATE', 'PAYMENT_REQUIRED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'PAYMENT_EXPIRING_SOON', 'PAYMENT_EXPIRED', 'REFUND_PROCESSING', 'REFUND_COMPLETED', 'BOOKING_CANCELLED', 'BOOKING_COMPLETED', 'SYSTEM');
  CREATE TYPE "public"."enum_sales_inquiries_inquiry_type" AS ENUM('CONSULTATION', 'QUOTE', 'VIEWING', 'TEST_DRIVE', 'PURCHASE_REQUEST');
  CREATE TYPE "public"."enum_sales_inquiries_payment_method" AS ENUM('DIRECT', 'INSTALLMENT', 'CONSULT_FINANCE');
  CREATE TYPE "public"."enum_sales_inquiries_status" AS ENUM('NEW', 'CONTACTED', 'TEST_DRIVE_SCHEDULED', 'DEPOSIT_PENDING', 'CONTRACT_SIGNED', 'DELIVERED', 'CLOSED', 'CANCELLED');
  CREATE TYPE "public"."enum_promotions_discount_type" AS ENUM('PERCENT', 'FIXED');
  CREATE TYPE "public"."enum_promotions_applies_to" AS ENUM('ALL', 'RENT', 'SALE');
  CREATE TYPE "public"."enum_promotions_branch_scope" AS ENUM('ALL_BRANCHES', 'SPECIFIC_BRANCHES');
  CREATE TYPE "public"."enum_payments_payment_type" AS ENUM('DEPOSIT', 'RENTAL_FEE', 'FULL_PAYMENT', 'SECURITY_DEPOSIT', 'EXTRA_FEE', 'PURCHASE_DEPOSIT', 'REFUND');
  CREATE TYPE "public"."enum_payments_method" AS ENUM('VIETQR_SEPAY', 'ONLINE_MOCK', 'BANK_TRANSFER', 'CASH', 'CARD_POS');
  CREATE TYPE "public"."enum_payments_provider" AS ENUM('MANUAL', 'MOCK', 'SEPAY', 'PAYOS', 'VNPAY', 'MOMO', 'ZALOPAY');
  CREATE TYPE "public"."enum_payments_environment" AS ENUM('MOCK', 'SANDBOX', 'PRODUCTION');
  CREATE TYPE "public"."enum_payments_status" AS ENUM('PENDING', 'PROCESSING', 'CONFIRMED', 'PARTIALLY_PAID', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED');
  CREATE TYPE "public"."enum_payments_reconciliation_status" AS ENUM('NONE', 'MATCHED', 'UNDERPAID', 'OVERPAID', 'LATE_PAYMENT', 'UNMATCHED', 'MANUAL_OVERRIDE', 'RESOLVED');
  CREATE TYPE "public"."enum_payment_events_provider" AS ENUM('SEPAY', 'MOCK', 'MANUAL');
  CREATE TYPE "public"."enum_payment_events_environment" AS ENUM('MOCK', 'SANDBOX', 'PRODUCTION');
  CREATE TYPE "public"."enum_payment_events_verification_result" AS ENUM('VERIFIED', 'INVALID_SIGNATURE', 'INVALID_PAYLOAD', 'ENVIRONMENT_MISMATCH', 'DUPLICATE');
  CREATE TYPE "public"."enum_payment_events_processing_status" AS ENUM('PROCESSED', 'IGNORED_DUPLICATE', 'REVIEW_REQUIRED', 'FAILED', 'REJECTED');
  CREATE TYPE "public"."enum_refunds_refund_type" AS ENUM('CANCELLATION', 'DEPOSIT_RETURN', 'OVERPAYMENT', 'PARTIAL_ADJUSTMENT', 'SECURITY_DEPOSIT_RETURN');
  CREATE TYPE "public"."enum_refunds_status" AS ENUM('REQUESTED', 'APPROVED', 'PROCESSING', 'REFUNDED', 'REJECTED', 'FAILED');
  CREATE TYPE "public"."enum_refunds_provider" AS ENUM('MANUAL', 'MOCK', 'SEPAY');
  CREATE TYPE "public"."enum_refunds_requested_by_type" AS ENUM('CUSTOMER', 'ADMIN', 'SYSTEM');
  CREATE TYPE "public"."enum_reviews_status" AS ENUM('PUBLISHED', 'HIDDEN');
  CREATE TYPE "public"."enum_posts_category" AS ENUM('NEWS', 'GUIDE', 'PROMOTION');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_category" AS ENUM('NEWS', 'GUIDE', 'PROMOTION');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_published_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_payload_llm_instructions_entity_type" AS ENUM('collection', 'global');
  CREATE TYPE "public"."enum_nori_site_hero_slides_related_category" AS ENUM('CAR', 'MOTORBIKE', 'PICKUP');
  CREATE TYPE "public"."enum_nori_site_active_payment_provider" AS ENUM('SEPAY', 'MOCK', 'MANUAL');
  CREATE TYPE "public"."enum_nori_site_reservation_deposit_policy_mode" AS ENUM('VEHICLE_FIXED', 'PERCENT_OF_RENTAL');
  CREATE TYPE "public"."enum_nori_site_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__nori_site_v_version_hero_slides_related_category" AS ENUM('CAR', 'MOTORBIKE', 'PICKUP');
  CREATE TYPE "public"."enum__nori_site_v_version_active_payment_provider" AS ENUM('SEPAY', 'MOCK', 'MANUAL');
  CREATE TYPE "public"."enum__nori_site_v_version_reservation_deposit_policy_mode" AS ENUM('VEHICLE_FIXED', 'PERCENT_OF_RENTAL');
  CREATE TYPE "public"."enum__nori_site_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__nori_site_v_published_locale" AS ENUM('en');
  CREATE TABLE "admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"refresh_count" numeric,
  	"refreshed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "admins" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"full_name" varchar,
  	"admin_role" "enum_admins_admin_role" DEFAULT 'OPERATOR',
  	"permissions" jsonb,
  	"staff_title" "enum_admins_staff_title" DEFAULT 'OPERATOR',
  	"branch_scope_mode" "enum_admins_branch_scope_mode" DEFAULT 'ALL',
  	"assigned_branch_ids" jsonb,
  	"account_status" "enum_admins_account_status" DEFAULT 'ACTIVE',
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "admins_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "audit_logs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"action" varchar NOT NULL,
  	"entity" varchar NOT NULL,
  	"entity_id" varchar,
  	"entity_label" varchar,
  	"summary" varchar NOT NULL,
  	"from_status" varchar,
  	"to_status" varchar,
  	"actor_type" "enum_audit_logs_actor_type" DEFAULT 'SYSTEM',
  	"actor_id" varchar,
  	"actor_email" varchar,
  	"actor_role" varchar,
  	"branch_id" varchar,
  	"outcome" "enum_audit_logs_outcome" DEFAULT 'SUCCESS',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_logs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "media" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"alt" varchar NOT NULL,
  	"source_url" varchar,
  	"source_name" varchar,
  	"license" varchar,
  	"model_year" varchar,
  	"variant_name" varchar,
  	"color_name" varchar,
  	"media_category" "enum_media_media_category" DEFAULT 'CATALOGUE_REFERENCE',
  	"verified" boolean DEFAULT true,
  	"_h_folders_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"_stored" boolean,
  	"_transforms" jsonb,
  	"original_filename" varchar,
  	"original_url" varchar,
  	"original_mime_type" varchar,
  	"original_filesize" numeric,
  	"original_width" numeric,
  	"original_height" numeric,
  	"original_prefix" varchar,
  	"original__objectkey" varchar,
  	"original__stored" boolean,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "media_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_media_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_alt" varchar NOT NULL,
  	"version_source_url" varchar,
  	"version_source_name" varchar,
  	"version_license" varchar,
  	"version_model_year" varchar,
  	"version_variant_name" varchar,
  	"version_color_name" varchar,
  	"version_media_category" "enum__media_v_version_media_category" DEFAULT 'CATALOGUE_REFERENCE',
  	"version_verified" boolean DEFAULT true,
  	"version__h_folders_id" uuid,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version__stored" boolean,
  	"version__transforms" jsonb,
  	"version_original_filename" varchar,
  	"version_original_url" varchar,
  	"version_original_mime_type" varchar,
  	"version_original_filesize" numeric,
  	"version_original_width" numeric,
  	"version_original_height" numeric,
  	"version_original_prefix" varchar,
  	"version_original__objectkey" varchar,
  	"version_original__stored" boolean,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_media_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" uuid,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "folders" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_h_folders_id" uuid,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "folders_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_folders_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version__h_folders_id" uuid,
  	"version_name" varchar NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_folders_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_h_tags_id" uuid,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_tags_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version__h_tags_id" uuid,
  	"version_name" varchar NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_tags_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"refresh_count" numeric,
  	"refreshed_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "users" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"full_name" varchar NOT NULL,
  	"phone" varchar,
  	"role" "enum_users_role" DEFAULT 'CUSTOMER' NOT NULL,
  	"status" "enum_users_status" DEFAULT 'ACTIVE' NOT NULL,
  	"driver_license_number" varchar,
  	"id_card_number" varchar,
  	"verification_status" "enum_users_verification_status" DEFAULT 'UNVERIFIED',
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "branches_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid NOT NULL,
  	"caption" varchar
  );
  
  CREATE TABLE "branches" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"address" varchar NOT NULL,
  	"province" varchar NOT NULL,
  	"ward" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"hotline" varchar,
  	"email" varchar,
  	"manager_id" uuid,
  	"manager_name_snapshot" varchar,
  	"timezone" varchar DEFAULT 'Asia/Ho_Chi_Minh',
  	"working_days" varchar DEFAULT '1,2,3,4,5,6,0',
  	"work_start_time" varchar DEFAULT '07:30',
  	"work_end_time" varchar DEFAULT '21:00',
  	"lunch_break_start" varchar,
  	"lunch_break_end" varchar,
  	"operating_hours_label" varchar,
  	"holidays" jsonb,
  	"cover_image_id" uuid,
  	"description" varchar,
  	"supports_home_delivery" boolean DEFAULT false,
  	"supports_home_pickup" boolean DEFAULT false,
  	"delivery_start_time" varchar DEFAULT '08:00',
  	"delivery_end_time" varchar DEFAULT '20:00',
  	"default_delivery_fee" numeric,
  	"default_pickup_fee" numeric,
  	"after_hours_fee" numeric,
  	"free_delivery_min_order" numeric,
  	"max_delivery_distance_km" numeric,
  	"delivery_staff_capacity_per_slot" numeric DEFAULT 2,
  	"default_preparation_minutes" numeric DEFAULT 120,
  	"status" "enum_branches_status" DEFAULT 'ACTIVE' NOT NULL,
  	"is_demo" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "branches_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "warehouses" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"branch_id" uuid NOT NULL,
  	"warehouse_type" "enum_warehouses_warehouse_type" DEFAULT 'SHOWROOM' NOT NULL,
  	"address" varchar NOT NULL,
  	"capacity" numeric DEFAULT 20 NOT NULL,
  	"allow_over_capacity" boolean DEFAULT false,
  	"manager_id" uuid,
  	"manager_name_snapshot" varchar,
  	"operating_hours" varchar,
  	"is_customer_facing" boolean DEFAULT false,
  	"status" "enum_warehouses_status" DEFAULT 'ACTIVE' NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "warehouses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "service_locations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"branch_id" uuid NOT NULL,
  	"warehouse_id" uuid,
  	"location_type" "enum_service_locations_location_type" DEFAULT 'BRANCH' NOT NULL,
  	"address" varchar NOT NULL,
  	"province" varchar,
  	"ward" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"operating_hours" varchar,
  	"open_time" varchar DEFAULT '07:30',
  	"close_time" varchar DEFAULT '21:00',
  	"pickup_instructions" varchar,
  	"return_instructions" varchar,
  	"supports_pickup" boolean DEFAULT true,
  	"supports_return" boolean DEFAULT true,
  	"supports_home_delivery" boolean DEFAULT false,
  	"supports_home_pickup" boolean DEFAULT false,
  	"supported_categories" varchar DEFAULT 'CAR,MOTORBIKE,PICKUP',
  	"surcharge_fee" numeric,
  	"verified" boolean DEFAULT true,
  	"status" "enum_service_locations_status" DEFAULT 'ACTIVE' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "service_locations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "branch_staff" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"assignment_key" varchar,
  	"admin_id" uuid NOT NULL,
  	"branch_id" uuid NOT NULL,
  	"warehouses" jsonb,
  	"staff_role" "enum_branch_staff_staff_role" DEFAULT 'RENTAL_STAFF' NOT NULL,
  	"is_primary" boolean DEFAULT false,
  	"status" "enum_branch_staff_status" DEFAULT 'ACTIVE' NOT NULL,
  	"assigned_by" varchar,
  	"assigned_at" varchar,
  	"revoked_at" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "branch_staff_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "vehicle_models_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "vehicle_models_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"category" "enum_vehicle_models_features_category" DEFAULT 'COMFORT' NOT NULL,
  	"status" "enum_vehicle_models_features_status" DEFAULT 'EQUIPPED',
  	"variant_note" varchar
  );
  
  CREATE TABLE "vehicle_models_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid NOT NULL,
  	"kind" "enum_vehicle_models_gallery_kind" NOT NULL,
  	"photo_type" varchar,
  	"is_primary" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"alt_text" varchar,
  	"caption" varchar,
  	"variant_name" varchar,
  	"color_name" varchar,
  	"source_url" varchar,
  	"license" varchar,
  	"verified" boolean DEFAULT true
  );
  
  CREATE TABLE "vehicle_models_specifications" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"group" "enum_vehicle_models_specifications_group" DEFAULT 'OVERVIEW',
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL,
  	"variant_name" varchar,
  	"source" varchar
  );
  
  CREATE TABLE "vehicle_models_variants_colors" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"hex" varchar,
  	"source_url" varchar,
  	"image_id" uuid
  );
  
  CREATE TABLE "vehicle_models_variants" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"year" numeric,
  	"listed_price" numeric,
  	"reference_rent_price" numeric,
  	"fuel_type" varchar,
  	"transmission" varchar,
  	"drive_type" varchar,
  	"seats" numeric,
  	"summary" varchar
  );
  
  CREATE TABLE "vehicle_models" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"official_name" varchar,
  	"slug" varchar NOT NULL,
  	"brand" varchar NOT NULL,
  	"model_line" varchar,
  	"version_name" varchar,
  	"generation" varchar,
  	"category" "enum_vehicle_models_category" NOT NULL,
  	"sub_category" "enum_vehicle_models_sub_category",
  	"body_style" varchar,
  	"segment" varchar,
  	"origin" varchar,
  	"model_year" numeric,
  	"seats" numeric,
  	"fuel_type" "enum_vehicle_models_fuel_type",
  	"transmission" varchar,
  	"drive_type" varchar,
  	"listed_price" numeric,
  	"reference_rent_price" numeric,
  	"default_deposit_suggestion" numeric,
  	"suitable_for" varchar,
  	"usage_purpose" varchar,
  	"short_description" varchar,
  	"description" varchar,
  	"exterior_overview" varchar,
  	"interior_overview" varchar,
  	"engine_overview" varchar,
  	"cover_id" uuid,
  	"source" varchar,
  	"verification_status" "enum_vehicle_models_verification_status" DEFAULT 'VERIFIED',
  	"visible" boolean DEFAULT true,
  	"featured" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vehicle_models_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "vehicles_photos" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid NOT NULL,
  	"caption" varchar,
  	"kind" "enum_vehicles_photos_kind" DEFAULT 'EXTERIOR',
  	"photo_type" varchar,
  	"is_primary" boolean DEFAULT false,
  	"sort_order" numeric DEFAULT 0,
  	"alt_text" varchar,
  	"source_name" varchar
  );
  
  CREATE TABLE "vehicles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"reference" varchar NOT NULL,
  	"model_id" uuid NOT NULL,
  	"license_plate" varchar NOT NULL,
  	"intent" "enum_vehicles_intent" DEFAULT 'RENT' NOT NULL,
  	"is_demo" boolean DEFAULT true,
  	"vehicle_condition_type" "enum_vehicles_vehicle_condition_type" DEFAULT 'USED',
  	"manufacture_year" numeric,
  	"price_per_day" numeric,
  	"price_per_hour" numeric,
  	"price_per_week" numeric,
  	"price_per_month" numeric,
  	"weekend_surcharge" numeric,
  	"holiday_surcharge" numeric,
  	"deposit_amount" numeric,
  	"delivery_fee" numeric,
  	"km_limit_per_day" numeric DEFAULT 300,
  	"over_km_fee" numeric,
  	"late_return_fee_per_hour" numeric,
  	"buffer_hours" numeric DEFAULT 2,
  	"sale_price" numeric,
  	"listed_price" numeric,
  	"discount_price" numeric,
  	"reservation_deposit" numeric,
  	"estimated_rolling_price" numeric,
  	"negotiable" boolean DEFAULT false,
  	"warranty_policy" varchar,
  	"price_source_note" varchar,
  	"odometer" numeric,
  	"condition" varchar,
  	"exterior_condition" varchar,
  	"interior_condition" varchar,
  	"engine_condition" varchar,
  	"maintenance_history" varchar,
  	"inspected_at" timestamp(3) with time zone,
  	"version" varchar,
  	"color" varchar,
  	"location" varchar,
  	"pickup_location" varchar,
  	"managing_branch_id" uuid,
  	"current_branch_id" uuid,
  	"current_warehouse_id" uuid,
  	"next_expected_branch_id" uuid,
  	"next_expected_location_note" varchar,
  	"allocation_status" "enum_vehicles_allocation_status" DEFAULT 'UNALLOCATED',
  	"operation_status" "enum_vehicles_operation_status" DEFAULT 'READY',
  	"status" "enum_vehicles_status" DEFAULT 'INACTIVE' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vehicles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "vehicle_transfers" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"transfer_code" varchar NOT NULL,
  	"vehicle_id" uuid NOT NULL,
  	"vehicle_reference_snapshot" varchar,
  	"from_branch_id" uuid NOT NULL,
  	"from_warehouse_id" uuid NOT NULL,
  	"to_branch_id" uuid NOT NULL,
  	"to_warehouse_id" uuid NOT NULL,
  	"reason" varchar NOT NULL,
  	"start_date" varchar NOT NULL,
  	"end_date" varchar NOT NULL,
  	"scheduled_departure_at" varchar NOT NULL,
  	"scheduled_arrival_at" varchar NOT NULL,
  	"actual_departure_at" varchar,
  	"actual_arrival_at" varchar,
  	"completed_at" varchar,
  	"assigned_staff_id" uuid,
  	"assigned_staff_name" varchar,
  	"transfer_cost" numeric DEFAULT 0,
  	"status" "enum_vehicle_transfers_status" DEFAULT 'DRAFT' NOT NULL,
  	"condition_before" varchar,
  	"condition_after" varchar,
  	"odometer_before" numeric,
  	"odometer_after" numeric,
  	"handover_photos" jsonb,
  	"handover_report_note" varchar,
  	"created_by" varchar,
  	"approved_by" varchar,
  	"received_by" varchar,
  	"exception_note" varchar,
  	"delayed_warning" boolean DEFAULT false,
  	"affected_booking_keys" jsonb,
  	"revision" numeric DEFAULT 1,
  	"idempotency_key" varchar,
  	"status_history" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vehicle_transfers_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "vehicle_location_history" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"vehicle_id" uuid NOT NULL,
  	"vehicle_reference_snapshot" varchar,
  	"event_type" "enum_vehicle_location_history_event_type" NOT NULL,
  	"from_branch_id" uuid,
  	"from_warehouse_id" uuid,
  	"to_branch_id" uuid,
  	"to_warehouse_id" uuid,
  	"related_booking_id" uuid,
  	"related_transfer_id" uuid,
  	"related_delivery_job_id" uuid,
  	"odometer" numeric,
  	"condition_note" varchar,
  	"actor_email" varchar,
  	"actor_role" varchar,
  	"occurred_at" varchar NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "vehicle_location_history_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "delivery_zones" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"branch_id" uuid NOT NULL,
  	"province" varchar NOT NULL,
  	"wards" varchar,
  	"delivery_fee" numeric DEFAULT 0 NOT NULL,
  	"pickup_fee" numeric DEFAULT 0 NOT NULL,
  	"after_hours_fee" numeric DEFAULT 0,
  	"free_over_order_amount" numeric,
  	"estimated_travel_minutes" numeric DEFAULT 45,
  	"service_start_time" varchar DEFAULT '08:00',
  	"service_end_time" varchar DEFAULT '20:00',
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_zones_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "delivery_jobs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"job_code" varchar NOT NULL,
  	"booking_id" uuid NOT NULL,
  	"booking_key_snapshot" varchar,
  	"vehicle_id" uuid NOT NULL,
  	"vehicle_reference_snapshot" varchar,
  	"branch_id" uuid NOT NULL,
  	"delivery_zone_id" uuid,
  	"job_type" "enum_delivery_jobs_job_type" DEFAULT 'DELIVERY' NOT NULL,
  	"scheduled_date" varchar NOT NULL,
  	"scheduled_time" varchar NOT NULL,
  	"estimated_duration_minutes" numeric DEFAULT 60,
  	"address" varchar NOT NULL,
  	"contact_name" varchar NOT NULL,
  	"contact_phone" varchar NOT NULL,
  	"directions_note" varchar,
  	"assigned_staff_id" uuid,
  	"assigned_staff_name" varchar,
  	"status" "enum_delivery_jobs_status" DEFAULT 'PENDING' NOT NULL,
  	"delivery_fee_snapshot" numeric DEFAULT 0,
  	"extra_cost" numeric DEFAULT 0,
  	"extra_cost_note" varchar,
  	"odometer_at_handover" numeric,
  	"fuel_or_battery_level" varchar,
  	"condition_report" varchar,
  	"handover_photos" jsonb,
  	"failure_reason" varchar,
  	"completed_at" varchar,
  	"revision" numeric DEFAULT 1,
  	"status_history" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "delivery_jobs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "location_pricing_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"scope_type" "enum_location_pricing_rules_scope_type" DEFAULT 'MODEL_BRANCH' NOT NULL,
  	"branch_id" uuid,
  	"vehicle_model_id" uuid,
  	"vehicle_id" uuid,
  	"daily_price" numeric,
  	"weekly_price" numeric,
  	"monthly_price" numeric,
  	"weekend_surcharge" numeric,
  	"holiday_surcharge" numeric,
  	"deposit_amount" numeric,
  	"location_surcharge" numeric,
  	"after_hours_fee" numeric,
  	"weekly_discount_percent" numeric,
  	"monthly_discount_percent" numeric,
  	"valid_from" varchar,
  	"valid_to" varchar,
  	"priority" numeric DEFAULT 100,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "location_pricing_rules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "one_way_rental_rules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"route_key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"from_branch_id" uuid NOT NULL,
  	"to_branch_id" uuid NOT NULL,
  	"vehicle_category" "enum_one_way_rental_rules_vehicle_category" DEFAULT 'ALL' NOT NULL,
  	"allowed" boolean DEFAULT true,
  	"fee" numeric DEFAULT 0 NOT NULL,
  	"min_rental_days" numeric DEFAULT 1,
  	"estimated_transit_hours" numeric DEFAULT 4,
  	"preparation_buffer_hours" numeric DEFAULT 4,
  	"revenue_split_mode" "enum_one_way_rental_rules_revenue_split_mode" DEFAULT 'PICKUP_BRANCH' NOT NULL,
  	"pickup_branch_share_percent" numeric DEFAULT 100,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "one_way_rental_rules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "maintenance_schedules" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"vehicle_id" uuid NOT NULL,
  	"branch_id" uuid,
  	"warehouse_id" uuid,
  	"title" varchar NOT NULL,
  	"maintenance_type" "enum_maintenance_schedules_maintenance_type" DEFAULT 'ROUTINE' NOT NULL,
  	"start_date" varchar NOT NULL,
  	"end_date" varchar NOT NULL,
  	"odometer_at_service" numeric,
  	"cost" numeric,
  	"status" "enum_maintenance_schedules_status" DEFAULT 'SCHEDULED' NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "maintenance_schedules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "rental_days" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"vehicle_id" uuid NOT NULL,
  	"day" varchar NOT NULL,
  	"booking_key" varchar NOT NULL,
  	"lock_type" "enum_rental_days_lock_type" DEFAULT 'BOOKING',
  	"reference_id" varchar,
  	"branch_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "rental_days_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "bookings_modification_history_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"before" varchar,
  	"after" varchar
  );
  
  CREATE TABLE "bookings_modification_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"modified_at" varchar NOT NULL,
  	"modified_by" varchar,
  	"actor_type" varchar,
  	"status_at_change" varchar,
  	"reason" varchar,
  	"previous_total_price" numeric,
  	"new_total_price" numeric,
  	"previous_deposit" numeric,
  	"new_deposit" numeric
  );
  
  CREATE TABLE "bookings_status_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"status" varchar NOT NULL,
  	"changed_at" varchar NOT NULL,
  	"changed_by" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "bookings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"booking_key" varchar,
  	"revision" numeric DEFAULT 1,
  	"customer_id" uuid,
  	"vehicle_id" uuid NOT NULL,
  	"start_date" varchar NOT NULL,
  	"end_date" varchar NOT NULL,
  	"pickup_time" varchar DEFAULT '08:00',
  	"return_time" varchar DEFAULT '20:00',
  	"pickup_location" varchar,
  	"return_location" varchar,
  	"pickup_branch_id" uuid,
  	"return_branch_id" uuid,
  	"pickup_service_location_id" uuid,
  	"return_service_location_id" uuid,
  	"is_one_way" boolean DEFAULT false,
  	"pickup_method" "enum_bookings_pickup_method" DEFAULT 'BRANCH_PICKUP',
  	"return_method" "enum_bookings_return_method" DEFAULT 'BRANCH_RETURN',
  	"delivery_zone_id" uuid,
  	"delivery_address" varchar,
  	"pickup_address" varchar,
  	"delivery_contact_name" varchar,
  	"delivery_contact_phone" varchar,
  	"delivery_directions" varchar,
  	"delivery_requested" boolean DEFAULT false,
  	"addon_services" varchar,
  	"customer_phone" varchar,
  	"customer_email" varchar,
  	"driver_license_number" varchar,
  	"note" varchar,
  	"total_days" numeric,
  	"vehicle_name_snapshot" varchar,
  	"vehicle_reference_snapshot" varchar,
  	"daily_price_snapshot" numeric,
  	"base_rent_price" numeric,
  	"weekend_surcharge_total" numeric,
  	"delivery_fee_snapshot" numeric,
  	"location_surcharge_snapshot" numeric DEFAULT 0,
  	"one_way_fee_snapshot" numeric DEFAULT 0,
  	"pickup_fee_snapshot" numeric DEFAULT 0,
  	"after_hours_fee_snapshot" numeric DEFAULT 0,
  	"pricing_rule_snapshot" jsonb,
  	"revenue_attribution_branch_id" uuid,
  	"revenue_split_pickup_percent" numeric DEFAULT 100,
  	"actual_return_branch_id" uuid,
  	"actual_return_warehouse_id" uuid,
  	"actual_return_at" varchar,
  	"return_fuel_or_battery" varchar,
  	"return_inspection_status" "enum_bookings_return_inspection_status" DEFAULT 'NOT_APPLICABLE',
  	"schedule_conflict_alert" varchar,
  	"idempotency_key" varchar,
  	"addon_fee_total" numeric,
  	"discount_amount" numeric,
  	"promo_code" varchar,
  	"promo_discount_amount" numeric DEFAULT 0,
  	"total_price" numeric,
  	"payment_option" "enum_bookings_payment_option" DEFAULT 'DEPOSIT',
  	"reservation_deposit_snapshot" numeric DEFAULT 0,
  	"deposit_snapshot" numeric,
  	"initial_payment_due" numeric,
  	"remaining_amount" numeric,
  	"expected_contact_date" varchar,
  	"working_hours_snapshot" varchar,
  	"is_urgent_approval" boolean DEFAULT false,
  	"handover_note" varchar,
  	"extra_fee" numeric DEFAULT 0,
  	"extra_fee_note" varchar,
  	"contract_number" varchar,
  	"return_odometer" numeric,
  	"return_condition" varchar,
  	"status" "enum_bookings_status" DEFAULT 'PENDING',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bookings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "consultations_contact_logs" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"contacted_at" varchar NOT NULL,
  	"staff_name" varchar,
  	"outcome" varchar NOT NULL,
  	"note" varchar,
  	"next_callback_at" varchar
  );
  
  CREATE TABLE "consultations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"consultation_key" varchar,
  	"booking_id" uuid NOT NULL,
  	"customer_id" uuid,
  	"branch_id" uuid,
  	"booking_key_snapshot" varchar,
  	"customer_name_snapshot" varchar,
  	"customer_phone_snapshot" varchar,
  	"customer_email_snapshot" varchar,
  	"vehicle_name_snapshot" varchar,
  	"start_date_snapshot" varchar,
  	"end_date_snapshot" varchar,
  	"approved_at" varchar NOT NULL,
  	"approved_by" varchar,
  	"expected_contact_date" varchar NOT NULL,
  	"working_hours_window" varchar,
  	"is_urgent" boolean DEFAULT false,
  	"assigned_staff_id" uuid,
  	"assigned_staff_name" varchar,
  	"status" "enum_consultations_status" DEFAULT 'PENDING_CONTACT' NOT NULL,
  	"callback_scheduled_at" varchar,
  	"internal_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consultations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "notifications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"event_key" varchar,
  	"customer_id" uuid NOT NULL,
  	"booking_id" uuid,
  	"type" "enum_notifications_type" DEFAULT 'BOOKING_CONFIRMED' NOT NULL,
  	"title" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"booking_key" varchar,
  	"vehicle_name" varchar,
  	"start_date" varchar,
  	"end_date" varchar,
  	"pickup_time" varchar,
  	"return_time" varchar,
  	"expected_contact_date" varchar,
  	"working_hours_label" varchar,
  	"customer_phone_masked" varchar,
  	"hotline" varchar,
  	"is_urgent" boolean DEFAULT false,
  	"payment_confirmed" boolean DEFAULT false,
  	"superseded" boolean DEFAULT false,
  	"is_read" boolean DEFAULT false,
  	"read_at" varchar,
  	"popup_dismissed" boolean DEFAULT false,
  	"popup_dismissed_at" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "sales_inquiries_status_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"status" varchar NOT NULL,
  	"changed_at" varchar NOT NULL,
  	"changed_by" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "sales_inquiries" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"reference" varchar,
  	"inquiry_type" "enum_sales_inquiries_inquiry_type" DEFAULT 'CONSULTATION',
  	"customer_id" uuid,
  	"model_id" uuid NOT NULL,
  	"vehicle_id" uuid,
  	"vehicle_reference" varchar,
  	"variant_name" varchar,
  	"color_name" varchar,
  	"payment_method" "enum_sales_inquiries_payment_method" DEFAULT 'DIRECT',
  	"preferred_date" varchar,
  	"preferred_location" varchar,
  	"quoted_price_snapshot" numeric,
  	"estimated_rolling_snapshot" numeric,
  	"phone" varchar NOT NULL,
  	"note" varchar,
  	"admin_note" varchar,
  	"status" "enum_sales_inquiries_status" DEFAULT 'NEW',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sales_inquiries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "promotions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"discount_type" "enum_promotions_discount_type" DEFAULT 'PERCENT' NOT NULL,
  	"discount_value" numeric NOT NULL,
  	"max_discount" numeric,
  	"min_days" numeric DEFAULT 1,
  	"applies_to" "enum_promotions_applies_to" DEFAULT 'RENT',
  	"valid_from" varchar,
  	"valid_to" varchar,
  	"usage_limit" numeric,
  	"used_count" numeric DEFAULT 0,
  	"branch_scope" "enum_promotions_branch_scope" DEFAULT 'ALL_BRANCHES',
  	"applicable_branch_ids" jsonb,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "promotions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "payments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"reference" varchar,
  	"booking_id" uuid,
  	"inquiry_id" uuid,
  	"customer_id" uuid,
  	"branch_id" uuid,
  	"payment_type" "enum_payments_payment_type" DEFAULT 'DEPOSIT' NOT NULL,
  	"method" "enum_payments_method" DEFAULT 'BANK_TRANSFER' NOT NULL,
  	"provider" "enum_payments_provider" DEFAULT 'MANUAL',
  	"environment" "enum_payments_environment" DEFAULT 'MOCK',
  	"currency" varchar DEFAULT 'VND',
  	"amount" numeric NOT NULL,
  	"expected_amount" numeric,
  	"received_amount" numeric DEFAULT 0,
  	"refunded_amount" numeric DEFAULT 0,
  	"overpaid_amount" numeric DEFAULT 0,
  	"status" "enum_payments_status" DEFAULT 'CONFIRMED' NOT NULL,
  	"reconciliation_status" "enum_payments_reconciliation_status" DEFAULT 'NONE',
  	"provider_transaction_id" varchar,
  	"provider_payment_ref" varchar,
  	"qr_image_url" varchar,
  	"payment_url" varchar,
  	"bank_code" varchar,
  	"bank_account_number" varchar,
  	"bank_account_name" varchar,
  	"transfer_content" varchar,
  	"expires_at" varchar,
  	"idempotency_key" varchar,
  	"verified_at" varchar,
  	"paid_at" varchar,
  	"recorded_by" varchar,
  	"failure_reason" varchar,
  	"reconciliation_note" varchar,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "payment_events" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"event_id" varchar NOT NULL,
  	"provider" "enum_payment_events_provider" DEFAULT 'SEPAY' NOT NULL,
  	"environment" "enum_payment_events_environment" DEFAULT 'MOCK' NOT NULL,
  	"external_transaction_id" varchar,
  	"payment_reference" varchar,
  	"event_type" varchar NOT NULL,
  	"transfer_amount" numeric DEFAULT 0,
  	"verification_result" "enum_payment_events_verification_result" DEFAULT 'VERIFIED' NOT NULL,
  	"processing_status" "enum_payment_events_processing_status" DEFAULT 'PROCESSED' NOT NULL,
  	"retry_count" numeric DEFAULT 0,
  	"received_at" varchar NOT NULL,
  	"processed_at" varchar,
  	"error_reason" varchar,
  	"payment_id" uuid,
  	"booking_id" uuid,
  	"sanitized_payload" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payment_events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "refunds" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"reference" varchar,
  	"payment_id" uuid,
  	"booking_id" uuid NOT NULL,
  	"customer_id" uuid,
  	"refund_type" "enum_refunds_refund_type" DEFAULT 'DEPOSIT_RETURN' NOT NULL,
  	"amount" numeric NOT NULL,
  	"reason" varchar NOT NULL,
  	"status" "enum_refunds_status" DEFAULT 'REQUESTED' NOT NULL,
  	"provider" "enum_refunds_provider" DEFAULT 'MANUAL',
  	"provider_refund_id" varchar,
  	"requested_by" varchar,
  	"requested_by_type" "enum_refunds_requested_by_type" DEFAULT 'ADMIN',
  	"approved_by" varchar,
  	"completed_by" varchar,
  	"requested_at" varchar,
  	"approved_at" varchar,
  	"completed_at" varchar,
  	"reconciliation_note" varchar,
  	"bank_account_info" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "refunds_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "reviews" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"customer_id" uuid,
  	"booking_id" uuid NOT NULL,
  	"model_id" uuid NOT NULL,
  	"vehicle_id" uuid,
  	"rating" numeric NOT NULL,
  	"title" varchar,
  	"comment" varchar NOT NULL,
  	"status" "enum_reviews_status" DEFAULT 'PUBLISHED',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reviews_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "posts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"category" "enum_posts_category" DEFAULT 'NEWS',
  	"excerpt" varchar,
  	"content" varchar,
  	"cover_id" uuid,
  	"promotion_id" uuid,
  	"published_at" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_posts_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_category" "enum__posts_v_version_category" DEFAULT 'NEWS',
  	"version_excerpt" varchar,
  	"version_content" varchar,
  	"version_cover_id" uuid,
  	"version_promotion_id" uuid,
  	"version_published_at" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"published_locale" "enum__posts_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_kv" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"media_id" uuid,
  	"folders_id" uuid,
  	"tags_id" uuid,
  	"users_id" uuid,
  	"vehicle_models_id" uuid,
  	"vehicles_id" uuid,
  	"maintenance_schedules_id" uuid,
  	"rental_days_id" uuid,
  	"bookings_id" uuid,
  	"sales_inquiries_id" uuid,
  	"promotions_id" uuid,
  	"payments_id" uuid,
  	"posts_id" uuid
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_llm_instructions" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"entity_slug" varchar NOT NULL,
  	"entity_type" "enum_payload_llm_instructions_entity_type" NOT NULL,
  	"additional_instructions" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_llm_instructions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "nori_site_hero_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title_first" varchar,
  	"title_second" varchar,
  	"eyebrow" varchar,
  	"category_badge" varchar,
  	"description" varchar,
  	"cta_text" varchar,
  	"cta_href" varchar,
  	"secondary_text" varchar,
  	"secondary_href" varchar,
  	"desktop_image_id" uuid,
  	"mobile_image_id" uuid,
  	"focal_x" numeric DEFAULT 50,
  	"focal_y" numeric DEFAULT 50,
  	"mobile_focal_x" numeric DEFAULT 50,
  	"mobile_focal_y" numeric DEFAULT 50,
  	"related_category" "enum_nori_site_hero_slides_related_category",
  	"related_model_id" uuid,
  	"credit" varchar,
  	"source_url" varchar,
  	"duration_seconds" numeric,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true
  );
  
  CREATE TABLE "nori_site_hero_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid,
  	"credit" varchar
  );
  
  CREATE TABLE "nori_site_header_menu" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"visible" boolean DEFAULT true
  );
  
  CREATE TABLE "nori_site_footer_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"group" varchar DEFAULT 'Khám phá'
  );
  
  CREATE TABLE "nori_site_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "nori_site_holidays" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" varchar,
  	"name" varchar
  );
  
  CREATE TABLE "nori_site_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"order" numeric DEFAULT 0
  );
  
  CREATE TABLE "nori_site" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"site_name" varchar DEFAULT 'NORI',
  	"tagline" varchar DEFAULT 'Your way. Every day.',
  	"logo_id" uuid,
  	"favicon_id" uuid,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"og_image_id" uuid,
  	"hero_autoplay_seconds" numeric DEFAULT 6,
  	"story_image_id" uuid,
  	"home_intro_title" varchar,
  	"home_intro_description" varchar,
  	"show_hero_section" boolean DEFAULT true,
  	"show_benefits_section" boolean DEFAULT true,
  	"show_featured_section" boolean DEFAULT true,
  	"show_how_it_works_section" boolean DEFAULT true,
  	"show_story_section" boolean DEFAULT true,
  	"show_cta_section" boolean DEFAULT true,
  	"about_summary" varchar,
  	"address" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"opening_hours" varchar,
  	"business_timezone" varchar DEFAULT 'Asia/Ho_Chi_Minh',
  	"working_days" varchar DEFAULT '1,2,3,4,5',
  	"work_start_time" varchar,
  	"work_end_time" varchar,
  	"lunch_break_start" varchar,
  	"lunch_break_end" varchar,
  	"contact_note" varchar,
  	"rental_policy_summary" varchar,
  	"purchase_policy_summary" varchar,
  	"age_requirement" varchar,
  	"license_requirement" varchar,
  	"cancellation_policy" varchar,
  	"deposit_policy" varchar,
  	"privacy_policy" varchar,
  	"terms_of_use" varchar,
  	"deposit_hold_hours" numeric DEFAULT 24,
  	"max_pending_bookings" numeric DEFAULT 5,
  	"maintenance_banner_enabled" boolean DEFAULT false,
  	"maintenance_banner_text" varchar,
  	"online_payment_enabled" boolean DEFAULT true,
  	"active_payment_provider" "enum_nori_site_active_payment_provider" DEFAULT 'MOCK',
  	"allow_sepay_qr" boolean DEFAULT true,
  	"allow_manual_bank_transfer" boolean DEFAULT true,
  	"allow_cash_on_handover" boolean DEFAULT true,
  	"allow_full_payment_online" boolean DEFAULT true,
  	"reservation_deposit_policy_mode" "enum_nori_site_reservation_deposit_policy_mode" DEFAULT 'VEHICLE_FIXED',
  	"reservation_deposit_percent" numeric DEFAULT 30,
  	"payment_expiry_minutes" numeric DEFAULT 30,
  	"require_deposit_before_handover" boolean DEFAULT true,
  	"require_settlement_before_complete" boolean DEFAULT false,
  	"bank_name" varchar DEFAULT 'Vietcombank',
  	"bank_code" varchar DEFAULT 'VCB',
  	"bank_account_number" varchar DEFAULT '1017588888',
  	"bank_account_holder" varchar DEFAULT 'CONG TY TNHH DICH VU PHUONG TIEN NORI',
  	"payment_instruction_note" varchar,
  	"refund_policy_summary" varchar,
  	"_status" "enum_nori_site_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "nori_site_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_nori_site_v_version_hero_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title_first" varchar,
  	"title_second" varchar,
  	"eyebrow" varchar,
  	"category_badge" varchar,
  	"description" varchar,
  	"cta_text" varchar,
  	"cta_href" varchar,
  	"secondary_text" varchar,
  	"secondary_href" varchar,
  	"desktop_image_id" uuid,
  	"mobile_image_id" uuid,
  	"focal_x" numeric DEFAULT 50,
  	"focal_y" numeric DEFAULT 50,
  	"mobile_focal_x" numeric DEFAULT 50,
  	"mobile_focal_y" numeric DEFAULT 50,
  	"related_category" "enum__nori_site_v_version_hero_slides_related_category",
  	"related_model_id" uuid,
  	"credit" varchar,
  	"source_url" varchar,
  	"duration_seconds" numeric,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_hero_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"image_id" uuid,
  	"credit" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_header_menu" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"visible" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_footer_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"label" varchar,
  	"href" varchar,
  	"group" varchar DEFAULT 'Khám phá',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"platform" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_holidays" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"date" varchar,
  	"name" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v_version_faqs" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"order" numeric DEFAULT 0,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_nori_site_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"version_site_name" varchar DEFAULT 'NORI',
  	"version_tagline" varchar DEFAULT 'Your way. Every day.',
  	"version_logo_id" uuid,
  	"version_favicon_id" uuid,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_og_image_id" uuid,
  	"version_hero_autoplay_seconds" numeric DEFAULT 6,
  	"version_story_image_id" uuid,
  	"version_home_intro_title" varchar,
  	"version_home_intro_description" varchar,
  	"version_show_hero_section" boolean DEFAULT true,
  	"version_show_benefits_section" boolean DEFAULT true,
  	"version_show_featured_section" boolean DEFAULT true,
  	"version_show_how_it_works_section" boolean DEFAULT true,
  	"version_show_story_section" boolean DEFAULT true,
  	"version_show_cta_section" boolean DEFAULT true,
  	"version_about_summary" varchar,
  	"version_address" varchar,
  	"version_phone" varchar,
  	"version_email" varchar,
  	"version_opening_hours" varchar,
  	"version_business_timezone" varchar DEFAULT 'Asia/Ho_Chi_Minh',
  	"version_working_days" varchar DEFAULT '1,2,3,4,5',
  	"version_work_start_time" varchar,
  	"version_work_end_time" varchar,
  	"version_lunch_break_start" varchar,
  	"version_lunch_break_end" varchar,
  	"version_contact_note" varchar,
  	"version_rental_policy_summary" varchar,
  	"version_purchase_policy_summary" varchar,
  	"version_age_requirement" varchar,
  	"version_license_requirement" varchar,
  	"version_cancellation_policy" varchar,
  	"version_deposit_policy" varchar,
  	"version_privacy_policy" varchar,
  	"version_terms_of_use" varchar,
  	"version_deposit_hold_hours" numeric DEFAULT 24,
  	"version_max_pending_bookings" numeric DEFAULT 5,
  	"version_maintenance_banner_enabled" boolean DEFAULT false,
  	"version_maintenance_banner_text" varchar,
  	"version_online_payment_enabled" boolean DEFAULT true,
  	"version_active_payment_provider" "enum__nori_site_v_version_active_payment_provider" DEFAULT 'MOCK',
  	"version_allow_sepay_qr" boolean DEFAULT true,
  	"version_allow_manual_bank_transfer" boolean DEFAULT true,
  	"version_allow_cash_on_handover" boolean DEFAULT true,
  	"version_allow_full_payment_online" boolean DEFAULT true,
  	"version_reservation_deposit_policy_mode" "enum__nori_site_v_version_reservation_deposit_policy_mode" DEFAULT 'VEHICLE_FIXED',
  	"version_reservation_deposit_percent" numeric DEFAULT 30,
  	"version_payment_expiry_minutes" numeric DEFAULT 30,
  	"version_require_deposit_before_handover" boolean DEFAULT true,
  	"version_require_settlement_before_complete" boolean DEFAULT false,
  	"version_bank_name" varchar DEFAULT 'Vietcombank',
  	"version_bank_code" varchar DEFAULT 'VCB',
  	"version_bank_account_number" varchar DEFAULT '1017588888',
  	"version_bank_account_holder" varchar DEFAULT 'CONG TY TNHH DICH VU PHUONG TIEN NORI',
  	"version_payment_instruction_note" varchar,
  	"version_refund_policy_summary" varchar,
  	"version__status" "enum__nori_site_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"published_locale" "enum__nori_site_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_nori_site_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  ALTER TABLE "admins_sessions" ADD CONSTRAINT "admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admins_rels" ADD CONSTRAINT "admins_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admins_rels" ADD CONSTRAINT "admins_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admins_rels" ADD CONSTRAINT "admins_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audit_logs_rels" ADD CONSTRAINT "audit_logs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audit_logs_rels" ADD CONSTRAINT "audit_logs_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audit_logs_rels" ADD CONSTRAINT "audit_logs_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media__h_folders_id_folders_id_fk" FOREIGN KEY ("_h_folders_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_parent_id_media_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version__h_folders_id_folders_id_fk" FOREIGN KEY ("version__h_folders_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v_rels" ADD CONSTRAINT "_media_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_media_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_media_v_rels" ADD CONSTRAINT "_media_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_media_v_rels" ADD CONSTRAINT "_media_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_media_v_rels" ADD CONSTRAINT "_media_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "folders" ADD CONSTRAINT "folders__h_folders_id_folders_id_fk" FOREIGN KEY ("_h_folders_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "folders_rels" ADD CONSTRAINT "folders_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "folders_rels" ADD CONSTRAINT "folders_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "folders_rels" ADD CONSTRAINT "folders_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_folders_v" ADD CONSTRAINT "_folders_v_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_folders_v" ADD CONSTRAINT "_folders_v_version__h_folders_id_folders_id_fk" FOREIGN KEY ("version__h_folders_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_folders_v_rels" ADD CONSTRAINT "_folders_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_folders_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_folders_v_rels" ADD CONSTRAINT "_folders_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_folders_v_rels" ADD CONSTRAINT "_folders_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags__h_tags_id_tags_id_fk" FOREIGN KEY ("_h_tags_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_tags_v" ADD CONSTRAINT "_tags_v_parent_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_tags_v" ADD CONSTRAINT "_tags_v_version__h_tags_id_tags_id_fk" FOREIGN KEY ("version__h_tags_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_tags_v_rels" ADD CONSTRAINT "_tags_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_tags_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_tags_v_rels" ADD CONSTRAINT "_tags_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_tags_v_rels" ADD CONSTRAINT "_tags_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branches_gallery" ADD CONSTRAINT "branches_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "branches_gallery" ADD CONSTRAINT "branches_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_id_admins_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "branches" ADD CONSTRAINT "branches_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "branches_rels" ADD CONSTRAINT "branches_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branches_rels" ADD CONSTRAINT "branches_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branches_rels" ADD CONSTRAINT "branches_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_id_admins_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "warehouses_rels" ADD CONSTRAINT "warehouses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "warehouses_rels" ADD CONSTRAINT "warehouses_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "warehouses_rels" ADD CONSTRAINT "warehouses_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "service_locations_rels" ADD CONSTRAINT "service_locations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."service_locations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "service_locations_rels" ADD CONSTRAINT "service_locations_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "service_locations_rels" ADD CONSTRAINT "service_locations_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "branch_staff" ADD CONSTRAINT "branch_staff_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "branch_staff_rels" ADD CONSTRAINT "branch_staff_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."branch_staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branch_staff_rels" ADD CONSTRAINT "branch_staff_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "branch_staff_rels" ADD CONSTRAINT "branch_staff_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_highlights" ADD CONSTRAINT "vehicle_models_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_features" ADD CONSTRAINT "vehicle_models_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_gallery" ADD CONSTRAINT "vehicle_models_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_models_gallery" ADD CONSTRAINT "vehicle_models_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_specifications" ADD CONSTRAINT "vehicle_models_specifications_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_variants_colors" ADD CONSTRAINT "vehicle_models_variants_colors_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_models_variants_colors" ADD CONSTRAINT "vehicle_models_variants_colors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models_variants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_variants" ADD CONSTRAINT "vehicle_models_variants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_models_rels" ADD CONSTRAINT "vehicle_models_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_rels" ADD CONSTRAINT "vehicle_models_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_models_rels" ADD CONSTRAINT "vehicle_models_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicles_photos" ADD CONSTRAINT "vehicles_photos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles_photos" ADD CONSTRAINT "vehicles_photos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_managing_branch_id_branches_id_fk" FOREIGN KEY ("managing_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_branch_id_branches_id_fk" FOREIGN KEY ("current_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_warehouse_id_warehouses_id_fk" FOREIGN KEY ("current_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_next_expected_branch_id_branches_id_fk" FOREIGN KEY ("next_expected_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicles_rels" ADD CONSTRAINT "vehicles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicles_rels" ADD CONSTRAINT "vehicles_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicles_rels" ADD CONSTRAINT "vehicles_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers" ADD CONSTRAINT "vehicle_transfers_assigned_staff_id_admins_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_transfers_rels" ADD CONSTRAINT "vehicle_transfers_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vehicle_transfers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_transfers_rels" ADD CONSTRAINT "vehicle_transfers_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_transfers_rels" ADD CONSTRAINT "vehicle_transfers_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_related_booking_id_bookings_id_fk" FOREIGN KEY ("related_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_related_transfer_id_vehicle_transfers_id_fk" FOREIGN KEY ("related_transfer_id") REFERENCES "public"."vehicle_transfers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history" ADD CONSTRAINT "vehicle_location_history_related_delivery_job_id_delivery_jobs_id_fk" FOREIGN KEY ("related_delivery_job_id") REFERENCES "public"."delivery_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "vehicle_location_history_rels" ADD CONSTRAINT "vehicle_location_history_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vehicle_location_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_location_history_rels" ADD CONSTRAINT "vehicle_location_history_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "vehicle_location_history_rels" ADD CONSTRAINT "vehicle_location_history_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_zones_rels" ADD CONSTRAINT "delivery_zones_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_zones_rels" ADD CONSTRAINT "delivery_zones_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_zones_rels" ADD CONSTRAINT "delivery_zones_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_assigned_staff_id_admins_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "delivery_jobs_rels" ADD CONSTRAINT "delivery_jobs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."delivery_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_jobs_rels" ADD CONSTRAINT "delivery_jobs_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "delivery_jobs_rels" ADD CONSTRAINT "delivery_jobs_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "location_pricing_rules" ADD CONSTRAINT "location_pricing_rules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_pricing_rules" ADD CONSTRAINT "location_pricing_rules_vehicle_model_id_vehicle_models_id_fk" FOREIGN KEY ("vehicle_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_pricing_rules" ADD CONSTRAINT "location_pricing_rules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "location_pricing_rules_rels" ADD CONSTRAINT "location_pricing_rules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."location_pricing_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "location_pricing_rules_rels" ADD CONSTRAINT "location_pricing_rules_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "location_pricing_rules_rels" ADD CONSTRAINT "location_pricing_rules_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "one_way_rental_rules" ADD CONSTRAINT "one_way_rental_rules_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "one_way_rental_rules" ADD CONSTRAINT "one_way_rental_rules_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "one_way_rental_rules_rels" ADD CONSTRAINT "one_way_rental_rules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."one_way_rental_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "one_way_rental_rules_rels" ADD CONSTRAINT "one_way_rental_rules_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "one_way_rental_rules_rels" ADD CONSTRAINT "one_way_rental_rules_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "maintenance_schedules_rels" ADD CONSTRAINT "maintenance_schedules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maintenance_schedules_rels" ADD CONSTRAINT "maintenance_schedules_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "maintenance_schedules_rels" ADD CONSTRAINT "maintenance_schedules_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rental_days" ADD CONSTRAINT "rental_days_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "rental_days_rels" ADD CONSTRAINT "rental_days_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."rental_days"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rental_days_rels" ADD CONSTRAINT "rental_days_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rental_days_rels" ADD CONSTRAINT "rental_days_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_modification_history_changes" ADD CONSTRAINT "bookings_modification_history_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bookings_modification_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_modification_history" ADD CONSTRAINT "bookings_modification_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_status_history" ADD CONSTRAINT "bookings_status_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_branch_id_branches_id_fk" FOREIGN KEY ("pickup_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_return_branch_id_branches_id_fk" FOREIGN KEY ("return_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_service_location_id_service_locations_id_fk" FOREIGN KEY ("pickup_service_location_id") REFERENCES "public"."service_locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_return_service_location_id_service_locations_id_fk" FOREIGN KEY ("return_service_location_id") REFERENCES "public"."service_locations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_revenue_attribution_branch_id_branches_id_fk" FOREIGN KEY ("revenue_attribution_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_actual_return_branch_id_branches_id_fk" FOREIGN KEY ("actual_return_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_actual_return_warehouse_id_warehouses_id_fk" FOREIGN KEY ("actual_return_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings_rels" ADD CONSTRAINT "bookings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_rels" ADD CONSTRAINT "bookings_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_rels" ADD CONSTRAINT "bookings_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consultations_contact_logs" ADD CONSTRAINT "consultations_contact_logs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consultations" ADD CONSTRAINT "consultations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consultations" ADD CONSTRAINT "consultations_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consultations" ADD CONSTRAINT "consultations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consultations" ADD CONSTRAINT "consultations_assigned_staff_id_admins_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consultations_rels" ADD CONSTRAINT "consultations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consultations_rels" ADD CONSTRAINT "consultations_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consultations_rels" ADD CONSTRAINT "consultations_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications_rels" ADD CONSTRAINT "notifications_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notifications_rels" ADD CONSTRAINT "notifications_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notifications_rels" ADD CONSTRAINT "notifications_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sales_inquiries_status_history" ADD CONSTRAINT "sales_inquiries_status_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sales_inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sales_inquiries" ADD CONSTRAINT "sales_inquiries_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sales_inquiries_rels" ADD CONSTRAINT "sales_inquiries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sales_inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sales_inquiries_rels" ADD CONSTRAINT "sales_inquiries_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sales_inquiries_rels" ADD CONSTRAINT "sales_inquiries_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "promotions_rels" ADD CONSTRAINT "promotions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "promotions_rels" ADD CONSTRAINT "promotions_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "promotions_rels" ADD CONSTRAINT "promotions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_inquiry_id_sales_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."sales_inquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments_rels" ADD CONSTRAINT "payments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payments_rels" ADD CONSTRAINT "payments_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payments_rels" ADD CONSTRAINT "payments_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payment_events_rels" ADD CONSTRAINT "payment_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payment_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_events_rels" ADD CONSTRAINT "payment_events_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payment_events_rels" ADD CONSTRAINT "payment_events_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds_rels" ADD CONSTRAINT "refunds_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "refunds_rels" ADD CONSTRAINT "refunds_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "refunds_rels" ADD CONSTRAINT "refunds_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reviews_rels" ADD CONSTRAINT "reviews_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_cover_id_media_id_fk" FOREIGN KEY ("version_cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_promotion_id_promotions_id_fk" FOREIGN KEY ("version_promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_folders_fk" FOREIGN KEY ("folders_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_vehicle_models_fk" FOREIGN KEY ("vehicle_models_id") REFERENCES "public"."vehicle_models"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_vehicles_fk" FOREIGN KEY ("vehicles_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_maintenance_schedules_fk" FOREIGN KEY ("maintenance_schedules_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rental_days_fk" FOREIGN KEY ("rental_days_id") REFERENCES "public"."rental_days"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sales_inquiries_fk" FOREIGN KEY ("sales_inquiries_id") REFERENCES "public"."sales_inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promotions_fk" FOREIGN KEY ("promotions_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_llm_instructions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_hero_slides" ADD CONSTRAINT "nori_site_hero_slides_desktop_image_id_media_id_fk" FOREIGN KEY ("desktop_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site_hero_slides" ADD CONSTRAINT "nori_site_hero_slides_mobile_image_id_media_id_fk" FOREIGN KEY ("mobile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site_hero_slides" ADD CONSTRAINT "nori_site_hero_slides_related_model_id_vehicle_models_id_fk" FOREIGN KEY ("related_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site_hero_slides" ADD CONSTRAINT "nori_site_hero_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_hero_images" ADD CONSTRAINT "nori_site_hero_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site_hero_images" ADD CONSTRAINT "nori_site_hero_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_header_menu" ADD CONSTRAINT "nori_site_header_menu_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_footer_links" ADD CONSTRAINT "nori_site_footer_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_social_links" ADD CONSTRAINT "nori_site_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_holidays" ADD CONSTRAINT "nori_site_holidays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_faqs" ADD CONSTRAINT "nori_site_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site" ADD CONSTRAINT "nori_site_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site" ADD CONSTRAINT "nori_site_favicon_id_media_id_fk" FOREIGN KEY ("favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site" ADD CONSTRAINT "nori_site_og_image_id_media_id_fk" FOREIGN KEY ("og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site" ADD CONSTRAINT "nori_site_story_image_id_media_id_fk" FOREIGN KEY ("story_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "nori_site_rels" ADD CONSTRAINT "nori_site_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."nori_site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_rels" ADD CONSTRAINT "nori_site_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "nori_site_rels" ADD CONSTRAINT "nori_site_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_slides" ADD CONSTRAINT "_nori_site_v_version_hero_slides_desktop_image_id_media_id_fk" FOREIGN KEY ("desktop_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_slides" ADD CONSTRAINT "_nori_site_v_version_hero_slides_mobile_image_id_media_id_fk" FOREIGN KEY ("mobile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_slides" ADD CONSTRAINT "_nori_site_v_version_hero_slides_related_model_id_vehicle_models_id_fk" FOREIGN KEY ("related_model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_slides" ADD CONSTRAINT "_nori_site_v_version_hero_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_images" ADD CONSTRAINT "_nori_site_v_version_hero_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_hero_images" ADD CONSTRAINT "_nori_site_v_version_hero_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_header_menu" ADD CONSTRAINT "_nori_site_v_version_header_menu_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_footer_links" ADD CONSTRAINT "_nori_site_v_version_footer_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_social_links" ADD CONSTRAINT "_nori_site_v_version_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_holidays" ADD CONSTRAINT "_nori_site_v_version_holidays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_version_faqs" ADD CONSTRAINT "_nori_site_v_version_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v" ADD CONSTRAINT "_nori_site_v_version_logo_id_media_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v" ADD CONSTRAINT "_nori_site_v_version_favicon_id_media_id_fk" FOREIGN KEY ("version_favicon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v" ADD CONSTRAINT "_nori_site_v_version_og_image_id_media_id_fk" FOREIGN KEY ("version_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v" ADD CONSTRAINT "_nori_site_v_version_story_image_id_media_id_fk" FOREIGN KEY ("version_story_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_nori_site_v_rels" ADD CONSTRAINT "_nori_site_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_nori_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_rels" ADD CONSTRAINT "_nori_site_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_nori_site_v_rels" ADD CONSTRAINT "_nori_site_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_sessions_order_idx" ON "admins_sessions" USING btree ("_order");
  CREATE INDEX "admins_sessions_parent_id_idx" ON "admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "admins_account_status_idx" ON "admins" USING btree ("account_status");
  CREATE INDEX "admins_updated_at_idx" ON "admins" USING btree ("updated_at");
  CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");
  CREATE INDEX "admins_rels_order_idx" ON "admins_rels" USING btree ("order");
  CREATE INDEX "admins_rels_parent_idx" ON "admins_rels" USING btree ("parent_id");
  CREATE INDEX "admins_rels_path_idx" ON "admins_rels" USING btree ("path");
  CREATE INDEX "admins_rels_admins_id_idx" ON "admins_rels" USING btree ("admins_id");
  CREATE INDEX "admins_rels_users_id_idx" ON "admins_rels" USING btree ("users_id");
  CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");
  CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity");
  CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs" USING btree ("entity_id");
  CREATE INDEX "audit_logs_branch_id_idx" ON "audit_logs" USING btree ("branch_id");
  CREATE INDEX "audit_logs_updated_at_idx" ON "audit_logs" USING btree ("updated_at");
  CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
  CREATE INDEX "audit_logs_rels_order_idx" ON "audit_logs_rels" USING btree ("order");
  CREATE INDEX "audit_logs_rels_parent_idx" ON "audit_logs_rels" USING btree ("parent_id");
  CREATE INDEX "audit_logs_rels_path_idx" ON "audit_logs_rels" USING btree ("path");
  CREATE INDEX "audit_logs_rels_admins_id_idx" ON "audit_logs_rels" USING btree ("admins_id");
  CREATE INDEX "audit_logs_rels_users_id_idx" ON "audit_logs_rels" USING btree ("users_id");
  CREATE INDEX "media__h_folders_idx" ON "media" USING btree ("_h_folders_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_original_original_filename_idx" ON "media" USING btree ("original_filename");
  CREATE INDEX "media_rels_order_idx" ON "media_rels" USING btree ("order");
  CREATE INDEX "media_rels_parent_idx" ON "media_rels" USING btree ("parent_id");
  CREATE INDEX "media_rels_path_idx" ON "media_rels" USING btree ("path");
  CREATE INDEX "media_rels_tags_id_idx" ON "media_rels" USING btree ("tags_id");
  CREATE INDEX "media_rels_admins_id_idx" ON "media_rels" USING btree ("admins_id");
  CREATE INDEX "media_rels_users_id_idx" ON "media_rels" USING btree ("users_id");
  CREATE INDEX "_media_v_parent_idx" ON "_media_v" USING btree ("parent_id");
  CREATE INDEX "_media_v_version_version__h_folders_idx" ON "_media_v" USING btree ("version__h_folders_id");
  CREATE INDEX "_media_v_version_version_updated_at_idx" ON "_media_v" USING btree ("version_updated_at");
  CREATE INDEX "_media_v_version_version_created_at_idx" ON "_media_v" USING btree ("version_created_at");
  CREATE INDEX "_media_v_version_version_filename_idx" ON "_media_v" USING btree ("version_filename");
  CREATE INDEX "_media_v_version_original_version_original_filename_idx" ON "_media_v" USING btree ("version_original_filename");
  CREATE INDEX "_media_v_created_at_idx" ON "_media_v" USING btree ("created_at");
  CREATE INDEX "_media_v_updated_at_idx" ON "_media_v" USING btree ("updated_at");
  CREATE INDEX "_media_v_rels_order_idx" ON "_media_v_rels" USING btree ("order");
  CREATE INDEX "_media_v_rels_parent_idx" ON "_media_v_rels" USING btree ("parent_id");
  CREATE INDEX "_media_v_rels_path_idx" ON "_media_v_rels" USING btree ("path");
  CREATE INDEX "_media_v_rels_tags_id_idx" ON "_media_v_rels" USING btree ("tags_id");
  CREATE INDEX "_media_v_rels_admins_id_idx" ON "_media_v_rels" USING btree ("admins_id");
  CREATE INDEX "_media_v_rels_users_id_idx" ON "_media_v_rels" USING btree ("users_id");
  CREATE INDEX "folders__h_folders_idx" ON "folders" USING btree ("_h_folders_id");
  CREATE INDEX "folders_updated_at_idx" ON "folders" USING btree ("updated_at");
  CREATE INDEX "folders_created_at_idx" ON "folders" USING btree ("created_at");
  CREATE INDEX "folders_rels_order_idx" ON "folders_rels" USING btree ("order");
  CREATE INDEX "folders_rels_parent_idx" ON "folders_rels" USING btree ("parent_id");
  CREATE INDEX "folders_rels_path_idx" ON "folders_rels" USING btree ("path");
  CREATE INDEX "folders_rels_admins_id_idx" ON "folders_rels" USING btree ("admins_id");
  CREATE INDEX "folders_rels_users_id_idx" ON "folders_rels" USING btree ("users_id");
  CREATE INDEX "_folders_v_parent_idx" ON "_folders_v" USING btree ("parent_id");
  CREATE INDEX "_folders_v_version_version__h_folders_idx" ON "_folders_v" USING btree ("version__h_folders_id");
  CREATE INDEX "_folders_v_version_version_updated_at_idx" ON "_folders_v" USING btree ("version_updated_at");
  CREATE INDEX "_folders_v_version_version_created_at_idx" ON "_folders_v" USING btree ("version_created_at");
  CREATE INDEX "_folders_v_created_at_idx" ON "_folders_v" USING btree ("created_at");
  CREATE INDEX "_folders_v_updated_at_idx" ON "_folders_v" USING btree ("updated_at");
  CREATE INDEX "_folders_v_rels_order_idx" ON "_folders_v_rels" USING btree ("order");
  CREATE INDEX "_folders_v_rels_parent_idx" ON "_folders_v_rels" USING btree ("parent_id");
  CREATE INDEX "_folders_v_rels_path_idx" ON "_folders_v_rels" USING btree ("path");
  CREATE INDEX "_folders_v_rels_admins_id_idx" ON "_folders_v_rels" USING btree ("admins_id");
  CREATE INDEX "_folders_v_rels_users_id_idx" ON "_folders_v_rels" USING btree ("users_id");
  CREATE INDEX "tags__h_tags_idx" ON "tags" USING btree ("_h_tags_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "tags_rels_order_idx" ON "tags_rels" USING btree ("order");
  CREATE INDEX "tags_rels_parent_idx" ON "tags_rels" USING btree ("parent_id");
  CREATE INDEX "tags_rels_path_idx" ON "tags_rels" USING btree ("path");
  CREATE INDEX "tags_rels_admins_id_idx" ON "tags_rels" USING btree ("admins_id");
  CREATE INDEX "tags_rels_users_id_idx" ON "tags_rels" USING btree ("users_id");
  CREATE INDEX "_tags_v_parent_idx" ON "_tags_v" USING btree ("parent_id");
  CREATE INDEX "_tags_v_version_version__h_tags_idx" ON "_tags_v" USING btree ("version__h_tags_id");
  CREATE INDEX "_tags_v_version_version_updated_at_idx" ON "_tags_v" USING btree ("version_updated_at");
  CREATE INDEX "_tags_v_version_version_created_at_idx" ON "_tags_v" USING btree ("version_created_at");
  CREATE INDEX "_tags_v_created_at_idx" ON "_tags_v" USING btree ("created_at");
  CREATE INDEX "_tags_v_updated_at_idx" ON "_tags_v" USING btree ("updated_at");
  CREATE INDEX "_tags_v_rels_order_idx" ON "_tags_v_rels" USING btree ("order");
  CREATE INDEX "_tags_v_rels_parent_idx" ON "_tags_v_rels" USING btree ("parent_id");
  CREATE INDEX "_tags_v_rels_path_idx" ON "_tags_v_rels" USING btree ("path");
  CREATE INDEX "_tags_v_rels_admins_id_idx" ON "_tags_v_rels" USING btree ("admins_id");
  CREATE INDEX "_tags_v_rels_users_id_idx" ON "_tags_v_rels" USING btree ("users_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_admins_id_idx" ON "users_rels" USING btree ("admins_id");
  CREATE INDEX "users_rels_users_id_idx" ON "users_rels" USING btree ("users_id");
  CREATE INDEX "branches_gallery_order_idx" ON "branches_gallery" USING btree ("_order");
  CREATE INDEX "branches_gallery_parent_id_idx" ON "branches_gallery" USING btree ("_parent_id");
  CREATE INDEX "branches_gallery_image_idx" ON "branches_gallery" USING btree ("image_id");
  CREATE UNIQUE INDEX "branches_code_idx" ON "branches" USING btree ("code");
  CREATE UNIQUE INDEX "branches_slug_idx" ON "branches" USING btree ("slug");
  CREATE INDEX "branches_province_idx" ON "branches" USING btree ("province");
  CREATE INDEX "branches_manager_idx" ON "branches" USING btree ("manager_id");
  CREATE INDEX "branches_cover_image_idx" ON "branches" USING btree ("cover_image_id");
  CREATE INDEX "branches_status_idx" ON "branches" USING btree ("status");
  CREATE INDEX "branches_updated_at_idx" ON "branches" USING btree ("updated_at");
  CREATE INDEX "branches_created_at_idx" ON "branches" USING btree ("created_at");
  CREATE INDEX "branches_rels_order_idx" ON "branches_rels" USING btree ("order");
  CREATE INDEX "branches_rels_parent_idx" ON "branches_rels" USING btree ("parent_id");
  CREATE INDEX "branches_rels_path_idx" ON "branches_rels" USING btree ("path");
  CREATE INDEX "branches_rels_admins_id_idx" ON "branches_rels" USING btree ("admins_id");
  CREATE INDEX "branches_rels_users_id_idx" ON "branches_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "warehouses_code_idx" ON "warehouses" USING btree ("code");
  CREATE INDEX "warehouses_branch_idx" ON "warehouses" USING btree ("branch_id");
  CREATE INDEX "warehouses_manager_idx" ON "warehouses" USING btree ("manager_id");
  CREATE INDEX "warehouses_status_idx" ON "warehouses" USING btree ("status");
  CREATE INDEX "warehouses_updated_at_idx" ON "warehouses" USING btree ("updated_at");
  CREATE INDEX "warehouses_created_at_idx" ON "warehouses" USING btree ("created_at");
  CREATE INDEX "warehouses_rels_order_idx" ON "warehouses_rels" USING btree ("order");
  CREATE INDEX "warehouses_rels_parent_idx" ON "warehouses_rels" USING btree ("parent_id");
  CREATE INDEX "warehouses_rels_path_idx" ON "warehouses_rels" USING btree ("path");
  CREATE INDEX "warehouses_rels_admins_id_idx" ON "warehouses_rels" USING btree ("admins_id");
  CREATE INDEX "warehouses_rels_users_id_idx" ON "warehouses_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "service_locations_code_idx" ON "service_locations" USING btree ("code");
  CREATE INDEX "service_locations_branch_idx" ON "service_locations" USING btree ("branch_id");
  CREATE INDEX "service_locations_warehouse_idx" ON "service_locations" USING btree ("warehouse_id");
  CREATE INDEX "service_locations_province_idx" ON "service_locations" USING btree ("province");
  CREATE INDEX "service_locations_status_idx" ON "service_locations" USING btree ("status");
  CREATE INDEX "service_locations_updated_at_idx" ON "service_locations" USING btree ("updated_at");
  CREATE INDEX "service_locations_created_at_idx" ON "service_locations" USING btree ("created_at");
  CREATE INDEX "service_locations_rels_order_idx" ON "service_locations_rels" USING btree ("order");
  CREATE INDEX "service_locations_rels_parent_idx" ON "service_locations_rels" USING btree ("parent_id");
  CREATE INDEX "service_locations_rels_path_idx" ON "service_locations_rels" USING btree ("path");
  CREATE INDEX "service_locations_rels_admins_id_idx" ON "service_locations_rels" USING btree ("admins_id");
  CREATE INDEX "service_locations_rels_users_id_idx" ON "service_locations_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "branch_staff_assignment_key_idx" ON "branch_staff" USING btree ("assignment_key");
  CREATE INDEX "branch_staff_admin_idx" ON "branch_staff" USING btree ("admin_id");
  CREATE INDEX "branch_staff_branch_idx" ON "branch_staff" USING btree ("branch_id");
  CREATE INDEX "branch_staff_staff_role_idx" ON "branch_staff" USING btree ("staff_role");
  CREATE INDEX "branch_staff_status_idx" ON "branch_staff" USING btree ("status");
  CREATE INDEX "branch_staff_updated_at_idx" ON "branch_staff" USING btree ("updated_at");
  CREATE INDEX "branch_staff_created_at_idx" ON "branch_staff" USING btree ("created_at");
  CREATE INDEX "branch_staff_rels_order_idx" ON "branch_staff_rels" USING btree ("order");
  CREATE INDEX "branch_staff_rels_parent_idx" ON "branch_staff_rels" USING btree ("parent_id");
  CREATE INDEX "branch_staff_rels_path_idx" ON "branch_staff_rels" USING btree ("path");
  CREATE INDEX "branch_staff_rels_admins_id_idx" ON "branch_staff_rels" USING btree ("admins_id");
  CREATE INDEX "branch_staff_rels_users_id_idx" ON "branch_staff_rels" USING btree ("users_id");
  CREATE INDEX "vehicle_models_highlights_order_idx" ON "vehicle_models_highlights" USING btree ("_order");
  CREATE INDEX "vehicle_models_highlights_parent_id_idx" ON "vehicle_models_highlights" USING btree ("_parent_id");
  CREATE INDEX "vehicle_models_features_order_idx" ON "vehicle_models_features" USING btree ("_order");
  CREATE INDEX "vehicle_models_features_parent_id_idx" ON "vehicle_models_features" USING btree ("_parent_id");
  CREATE INDEX "vehicle_models_gallery_order_idx" ON "vehicle_models_gallery" USING btree ("_order");
  CREATE INDEX "vehicle_models_gallery_parent_id_idx" ON "vehicle_models_gallery" USING btree ("_parent_id");
  CREATE INDEX "vehicle_models_gallery_image_idx" ON "vehicle_models_gallery" USING btree ("image_id");
  CREATE INDEX "vehicle_models_specifications_order_idx" ON "vehicle_models_specifications" USING btree ("_order");
  CREATE INDEX "vehicle_models_specifications_parent_id_idx" ON "vehicle_models_specifications" USING btree ("_parent_id");
  CREATE INDEX "vehicle_models_variants_colors_order_idx" ON "vehicle_models_variants_colors" USING btree ("_order");
  CREATE INDEX "vehicle_models_variants_colors_parent_id_idx" ON "vehicle_models_variants_colors" USING btree ("_parent_id");
  CREATE INDEX "vehicle_models_variants_colors_image_idx" ON "vehicle_models_variants_colors" USING btree ("image_id");
  CREATE INDEX "vehicle_models_variants_order_idx" ON "vehicle_models_variants" USING btree ("_order");
  CREATE INDEX "vehicle_models_variants_parent_id_idx" ON "vehicle_models_variants" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "vehicle_models_slug_idx" ON "vehicle_models" USING btree ("slug");
  CREATE INDEX "vehicle_models_brand_idx" ON "vehicle_models" USING btree ("brand");
  CREATE INDEX "vehicle_models_category_idx" ON "vehicle_models" USING btree ("category");
  CREATE INDEX "vehicle_models_sub_category_idx" ON "vehicle_models" USING btree ("sub_category");
  CREATE INDEX "vehicle_models_cover_idx" ON "vehicle_models" USING btree ("cover_id");
  CREATE INDEX "vehicle_models_visible_idx" ON "vehicle_models" USING btree ("visible");
  CREATE INDEX "vehicle_models_updated_at_idx" ON "vehicle_models" USING btree ("updated_at");
  CREATE INDEX "vehicle_models_created_at_idx" ON "vehicle_models" USING btree ("created_at");
  CREATE INDEX "vehicle_models_rels_order_idx" ON "vehicle_models_rels" USING btree ("order");
  CREATE INDEX "vehicle_models_rels_parent_idx" ON "vehicle_models_rels" USING btree ("parent_id");
  CREATE INDEX "vehicle_models_rels_path_idx" ON "vehicle_models_rels" USING btree ("path");
  CREATE INDEX "vehicle_models_rels_admins_id_idx" ON "vehicle_models_rels" USING btree ("admins_id");
  CREATE INDEX "vehicle_models_rels_users_id_idx" ON "vehicle_models_rels" USING btree ("users_id");
  CREATE INDEX "vehicles_photos_order_idx" ON "vehicles_photos" USING btree ("_order");
  CREATE INDEX "vehicles_photos_parent_id_idx" ON "vehicles_photos" USING btree ("_parent_id");
  CREATE INDEX "vehicles_photos_image_idx" ON "vehicles_photos" USING btree ("image_id");
  CREATE UNIQUE INDEX "vehicles_reference_idx" ON "vehicles" USING btree ("reference");
  CREATE INDEX "vehicles_model_idx" ON "vehicles" USING btree ("model_id");
  CREATE UNIQUE INDEX "vehicles_license_plate_idx" ON "vehicles" USING btree ("license_plate");
  CREATE INDEX "vehicles_managing_branch_idx" ON "vehicles" USING btree ("managing_branch_id");
  CREATE INDEX "vehicles_current_branch_idx" ON "vehicles" USING btree ("current_branch_id");
  CREATE INDEX "vehicles_current_warehouse_idx" ON "vehicles" USING btree ("current_warehouse_id");
  CREATE INDEX "vehicles_next_expected_branch_idx" ON "vehicles" USING btree ("next_expected_branch_id");
  CREATE INDEX "vehicles_allocation_status_idx" ON "vehicles" USING btree ("allocation_status");
  CREATE INDEX "vehicles_status_idx" ON "vehicles" USING btree ("status");
  CREATE INDEX "vehicles_updated_at_idx" ON "vehicles" USING btree ("updated_at");
  CREATE INDEX "vehicles_created_at_idx" ON "vehicles" USING btree ("created_at");
  CREATE INDEX "vehicles_rels_order_idx" ON "vehicles_rels" USING btree ("order");
  CREATE INDEX "vehicles_rels_parent_idx" ON "vehicles_rels" USING btree ("parent_id");
  CREATE INDEX "vehicles_rels_path_idx" ON "vehicles_rels" USING btree ("path");
  CREATE INDEX "vehicles_rels_admins_id_idx" ON "vehicles_rels" USING btree ("admins_id");
  CREATE INDEX "vehicles_rels_users_id_idx" ON "vehicles_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "vehicle_transfers_transfer_code_idx" ON "vehicle_transfers" USING btree ("transfer_code");
  CREATE INDEX "vehicle_transfers_vehicle_idx" ON "vehicle_transfers" USING btree ("vehicle_id");
  CREATE INDEX "vehicle_transfers_from_branch_idx" ON "vehicle_transfers" USING btree ("from_branch_id");
  CREATE INDEX "vehicle_transfers_from_warehouse_idx" ON "vehicle_transfers" USING btree ("from_warehouse_id");
  CREATE INDEX "vehicle_transfers_to_branch_idx" ON "vehicle_transfers" USING btree ("to_branch_id");
  CREATE INDEX "vehicle_transfers_to_warehouse_idx" ON "vehicle_transfers" USING btree ("to_warehouse_id");
  CREATE INDEX "vehicle_transfers_start_date_idx" ON "vehicle_transfers" USING btree ("start_date");
  CREATE INDEX "vehicle_transfers_end_date_idx" ON "vehicle_transfers" USING btree ("end_date");
  CREATE INDEX "vehicle_transfers_assigned_staff_idx" ON "vehicle_transfers" USING btree ("assigned_staff_id");
  CREATE INDEX "vehicle_transfers_status_idx" ON "vehicle_transfers" USING btree ("status");
  CREATE INDEX "vehicle_transfers_idempotency_key_idx" ON "vehicle_transfers" USING btree ("idempotency_key");
  CREATE INDEX "vehicle_transfers_updated_at_idx" ON "vehicle_transfers" USING btree ("updated_at");
  CREATE INDEX "vehicle_transfers_created_at_idx" ON "vehicle_transfers" USING btree ("created_at");
  CREATE INDEX "vehicle_transfers_rels_order_idx" ON "vehicle_transfers_rels" USING btree ("order");
  CREATE INDEX "vehicle_transfers_rels_parent_idx" ON "vehicle_transfers_rels" USING btree ("parent_id");
  CREATE INDEX "vehicle_transfers_rels_path_idx" ON "vehicle_transfers_rels" USING btree ("path");
  CREATE INDEX "vehicle_transfers_rels_admins_id_idx" ON "vehicle_transfers_rels" USING btree ("admins_id");
  CREATE INDEX "vehicle_transfers_rels_users_id_idx" ON "vehicle_transfers_rels" USING btree ("users_id");
  CREATE INDEX "vehicle_location_history_vehicle_idx" ON "vehicle_location_history" USING btree ("vehicle_id");
  CREATE INDEX "vehicle_location_history_vehicle_reference_snapshot_idx" ON "vehicle_location_history" USING btree ("vehicle_reference_snapshot");
  CREATE INDEX "vehicle_location_history_event_type_idx" ON "vehicle_location_history" USING btree ("event_type");
  CREATE INDEX "vehicle_location_history_from_branch_idx" ON "vehicle_location_history" USING btree ("from_branch_id");
  CREATE INDEX "vehicle_location_history_from_warehouse_idx" ON "vehicle_location_history" USING btree ("from_warehouse_id");
  CREATE INDEX "vehicle_location_history_to_branch_idx" ON "vehicle_location_history" USING btree ("to_branch_id");
  CREATE INDEX "vehicle_location_history_to_warehouse_idx" ON "vehicle_location_history" USING btree ("to_warehouse_id");
  CREATE INDEX "vehicle_location_history_related_booking_idx" ON "vehicle_location_history" USING btree ("related_booking_id");
  CREATE INDEX "vehicle_location_history_related_transfer_idx" ON "vehicle_location_history" USING btree ("related_transfer_id");
  CREATE INDEX "vehicle_location_history_related_delivery_job_idx" ON "vehicle_location_history" USING btree ("related_delivery_job_id");
  CREATE INDEX "vehicle_location_history_occurred_at_idx" ON "vehicle_location_history" USING btree ("occurred_at");
  CREATE INDEX "vehicle_location_history_updated_at_idx" ON "vehicle_location_history" USING btree ("updated_at");
  CREATE INDEX "vehicle_location_history_created_at_idx" ON "vehicle_location_history" USING btree ("created_at");
  CREATE INDEX "vehicle_location_history_rels_order_idx" ON "vehicle_location_history_rels" USING btree ("order");
  CREATE INDEX "vehicle_location_history_rels_parent_idx" ON "vehicle_location_history_rels" USING btree ("parent_id");
  CREATE INDEX "vehicle_location_history_rels_path_idx" ON "vehicle_location_history_rels" USING btree ("path");
  CREATE INDEX "vehicle_location_history_rels_admins_id_idx" ON "vehicle_location_history_rels" USING btree ("admins_id");
  CREATE INDEX "vehicle_location_history_rels_users_id_idx" ON "vehicle_location_history_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "delivery_zones_code_idx" ON "delivery_zones" USING btree ("code");
  CREATE INDEX "delivery_zones_branch_idx" ON "delivery_zones" USING btree ("branch_id");
  CREATE INDEX "delivery_zones_active_idx" ON "delivery_zones" USING btree ("active");
  CREATE INDEX "delivery_zones_updated_at_idx" ON "delivery_zones" USING btree ("updated_at");
  CREATE INDEX "delivery_zones_created_at_idx" ON "delivery_zones" USING btree ("created_at");
  CREATE INDEX "delivery_zones_rels_order_idx" ON "delivery_zones_rels" USING btree ("order");
  CREATE INDEX "delivery_zones_rels_parent_idx" ON "delivery_zones_rels" USING btree ("parent_id");
  CREATE INDEX "delivery_zones_rels_path_idx" ON "delivery_zones_rels" USING btree ("path");
  CREATE INDEX "delivery_zones_rels_admins_id_idx" ON "delivery_zones_rels" USING btree ("admins_id");
  CREATE INDEX "delivery_zones_rels_users_id_idx" ON "delivery_zones_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "delivery_jobs_job_code_idx" ON "delivery_jobs" USING btree ("job_code");
  CREATE INDEX "delivery_jobs_booking_idx" ON "delivery_jobs" USING btree ("booking_id");
  CREATE INDEX "delivery_jobs_booking_key_snapshot_idx" ON "delivery_jobs" USING btree ("booking_key_snapshot");
  CREATE INDEX "delivery_jobs_vehicle_idx" ON "delivery_jobs" USING btree ("vehicle_id");
  CREATE INDEX "delivery_jobs_branch_idx" ON "delivery_jobs" USING btree ("branch_id");
  CREATE INDEX "delivery_jobs_delivery_zone_idx" ON "delivery_jobs" USING btree ("delivery_zone_id");
  CREATE INDEX "delivery_jobs_job_type_idx" ON "delivery_jobs" USING btree ("job_type");
  CREATE INDEX "delivery_jobs_scheduled_date_idx" ON "delivery_jobs" USING btree ("scheduled_date");
  CREATE INDEX "delivery_jobs_assigned_staff_idx" ON "delivery_jobs" USING btree ("assigned_staff_id");
  CREATE INDEX "delivery_jobs_status_idx" ON "delivery_jobs" USING btree ("status");
  CREATE INDEX "delivery_jobs_updated_at_idx" ON "delivery_jobs" USING btree ("updated_at");
  CREATE INDEX "delivery_jobs_created_at_idx" ON "delivery_jobs" USING btree ("created_at");
  CREATE INDEX "delivery_jobs_rels_order_idx" ON "delivery_jobs_rels" USING btree ("order");
  CREATE INDEX "delivery_jobs_rels_parent_idx" ON "delivery_jobs_rels" USING btree ("parent_id");
  CREATE INDEX "delivery_jobs_rels_path_idx" ON "delivery_jobs_rels" USING btree ("path");
  CREATE INDEX "delivery_jobs_rels_admins_id_idx" ON "delivery_jobs_rels" USING btree ("admins_id");
  CREATE INDEX "delivery_jobs_rels_users_id_idx" ON "delivery_jobs_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "location_pricing_rules_code_idx" ON "location_pricing_rules" USING btree ("code");
  CREATE INDEX "location_pricing_rules_scope_type_idx" ON "location_pricing_rules" USING btree ("scope_type");
  CREATE INDEX "location_pricing_rules_branch_idx" ON "location_pricing_rules" USING btree ("branch_id");
  CREATE INDEX "location_pricing_rules_vehicle_model_idx" ON "location_pricing_rules" USING btree ("vehicle_model_id");
  CREATE INDEX "location_pricing_rules_vehicle_idx" ON "location_pricing_rules" USING btree ("vehicle_id");
  CREATE INDEX "location_pricing_rules_active_idx" ON "location_pricing_rules" USING btree ("active");
  CREATE INDEX "location_pricing_rules_updated_at_idx" ON "location_pricing_rules" USING btree ("updated_at");
  CREATE INDEX "location_pricing_rules_created_at_idx" ON "location_pricing_rules" USING btree ("created_at");
  CREATE INDEX "location_pricing_rules_rels_order_idx" ON "location_pricing_rules_rels" USING btree ("order");
  CREATE INDEX "location_pricing_rules_rels_parent_idx" ON "location_pricing_rules_rels" USING btree ("parent_id");
  CREATE INDEX "location_pricing_rules_rels_path_idx" ON "location_pricing_rules_rels" USING btree ("path");
  CREATE INDEX "location_pricing_rules_rels_admins_id_idx" ON "location_pricing_rules_rels" USING btree ("admins_id");
  CREATE INDEX "location_pricing_rules_rels_users_id_idx" ON "location_pricing_rules_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "one_way_rental_rules_route_key_idx" ON "one_way_rental_rules" USING btree ("route_key");
  CREATE INDEX "one_way_rental_rules_from_branch_idx" ON "one_way_rental_rules" USING btree ("from_branch_id");
  CREATE INDEX "one_way_rental_rules_to_branch_idx" ON "one_way_rental_rules" USING btree ("to_branch_id");
  CREATE INDEX "one_way_rental_rules_active_idx" ON "one_way_rental_rules" USING btree ("active");
  CREATE INDEX "one_way_rental_rules_updated_at_idx" ON "one_way_rental_rules" USING btree ("updated_at");
  CREATE INDEX "one_way_rental_rules_created_at_idx" ON "one_way_rental_rules" USING btree ("created_at");
  CREATE INDEX "one_way_rental_rules_rels_order_idx" ON "one_way_rental_rules_rels" USING btree ("order");
  CREATE INDEX "one_way_rental_rules_rels_parent_idx" ON "one_way_rental_rules_rels" USING btree ("parent_id");
  CREATE INDEX "one_way_rental_rules_rels_path_idx" ON "one_way_rental_rules_rels" USING btree ("path");
  CREATE INDEX "one_way_rental_rules_rels_admins_id_idx" ON "one_way_rental_rules_rels" USING btree ("admins_id");
  CREATE INDEX "one_way_rental_rules_rels_users_id_idx" ON "one_way_rental_rules_rels" USING btree ("users_id");
  CREATE INDEX "maintenance_schedules_vehicle_idx" ON "maintenance_schedules" USING btree ("vehicle_id");
  CREATE INDEX "maintenance_schedules_branch_idx" ON "maintenance_schedules" USING btree ("branch_id");
  CREATE INDEX "maintenance_schedules_warehouse_idx" ON "maintenance_schedules" USING btree ("warehouse_id");
  CREATE INDEX "maintenance_schedules_start_date_idx" ON "maintenance_schedules" USING btree ("start_date");
  CREATE INDEX "maintenance_schedules_end_date_idx" ON "maintenance_schedules" USING btree ("end_date");
  CREATE INDEX "maintenance_schedules_status_idx" ON "maintenance_schedules" USING btree ("status");
  CREATE INDEX "maintenance_schedules_updated_at_idx" ON "maintenance_schedules" USING btree ("updated_at");
  CREATE INDEX "maintenance_schedules_created_at_idx" ON "maintenance_schedules" USING btree ("created_at");
  CREATE INDEX "maintenance_schedules_rels_order_idx" ON "maintenance_schedules_rels" USING btree ("order");
  CREATE INDEX "maintenance_schedules_rels_parent_idx" ON "maintenance_schedules_rels" USING btree ("parent_id");
  CREATE INDEX "maintenance_schedules_rels_path_idx" ON "maintenance_schedules_rels" USING btree ("path");
  CREATE INDEX "maintenance_schedules_rels_admins_id_idx" ON "maintenance_schedules_rels" USING btree ("admins_id");
  CREATE INDEX "maintenance_schedules_rels_users_id_idx" ON "maintenance_schedules_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "rental_days_key_idx" ON "rental_days" USING btree ("key");
  CREATE INDEX "rental_days_vehicle_idx" ON "rental_days" USING btree ("vehicle_id");
  CREATE INDEX "rental_days_booking_key_idx" ON "rental_days" USING btree ("booking_key");
  CREATE INDEX "rental_days_lock_type_idx" ON "rental_days" USING btree ("lock_type");
  CREATE INDEX "rental_days_reference_id_idx" ON "rental_days" USING btree ("reference_id");
  CREATE INDEX "rental_days_branch_id_idx" ON "rental_days" USING btree ("branch_id");
  CREATE INDEX "rental_days_updated_at_idx" ON "rental_days" USING btree ("updated_at");
  CREATE INDEX "rental_days_created_at_idx" ON "rental_days" USING btree ("created_at");
  CREATE INDEX "rental_days_rels_order_idx" ON "rental_days_rels" USING btree ("order");
  CREATE INDEX "rental_days_rels_parent_idx" ON "rental_days_rels" USING btree ("parent_id");
  CREATE INDEX "rental_days_rels_path_idx" ON "rental_days_rels" USING btree ("path");
  CREATE INDEX "rental_days_rels_admins_id_idx" ON "rental_days_rels" USING btree ("admins_id");
  CREATE INDEX "rental_days_rels_users_id_idx" ON "rental_days_rels" USING btree ("users_id");
  CREATE INDEX "bookings_modification_history_changes_order_idx" ON "bookings_modification_history_changes" USING btree ("_order");
  CREATE INDEX "bookings_modification_history_changes_parent_id_idx" ON "bookings_modification_history_changes" USING btree ("_parent_id");
  CREATE INDEX "bookings_modification_history_order_idx" ON "bookings_modification_history" USING btree ("_order");
  CREATE INDEX "bookings_modification_history_parent_id_idx" ON "bookings_modification_history" USING btree ("_parent_id");
  CREATE INDEX "bookings_status_history_order_idx" ON "bookings_status_history" USING btree ("_order");
  CREATE INDEX "bookings_status_history_parent_id_idx" ON "bookings_status_history" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "bookings_booking_key_idx" ON "bookings" USING btree ("booking_key");
  CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");
  CREATE INDEX "bookings_vehicle_idx" ON "bookings" USING btree ("vehicle_id");
  CREATE INDEX "bookings_pickup_branch_idx" ON "bookings" USING btree ("pickup_branch_id");
  CREATE INDEX "bookings_return_branch_idx" ON "bookings" USING btree ("return_branch_id");
  CREATE INDEX "bookings_pickup_service_location_idx" ON "bookings" USING btree ("pickup_service_location_id");
  CREATE INDEX "bookings_return_service_location_idx" ON "bookings" USING btree ("return_service_location_id");
  CREATE INDEX "bookings_is_one_way_idx" ON "bookings" USING btree ("is_one_way");
  CREATE INDEX "bookings_delivery_zone_idx" ON "bookings" USING btree ("delivery_zone_id");
  CREATE INDEX "bookings_revenue_attribution_branch_idx" ON "bookings" USING btree ("revenue_attribution_branch_id");
  CREATE INDEX "bookings_actual_return_branch_idx" ON "bookings" USING btree ("actual_return_branch_id");
  CREATE INDEX "bookings_actual_return_warehouse_idx" ON "bookings" USING btree ("actual_return_warehouse_id");
  CREATE INDEX "bookings_idempotency_key_idx" ON "bookings" USING btree ("idempotency_key");
  CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
  CREATE INDEX "bookings_rels_order_idx" ON "bookings_rels" USING btree ("order");
  CREATE INDEX "bookings_rels_parent_idx" ON "bookings_rels" USING btree ("parent_id");
  CREATE INDEX "bookings_rels_path_idx" ON "bookings_rels" USING btree ("path");
  CREATE INDEX "bookings_rels_admins_id_idx" ON "bookings_rels" USING btree ("admins_id");
  CREATE INDEX "bookings_rels_users_id_idx" ON "bookings_rels" USING btree ("users_id");
  CREATE INDEX "consultations_contact_logs_order_idx" ON "consultations_contact_logs" USING btree ("_order");
  CREATE INDEX "consultations_contact_logs_parent_id_idx" ON "consultations_contact_logs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "consultations_consultation_key_idx" ON "consultations" USING btree ("consultation_key");
  CREATE INDEX "consultations_booking_idx" ON "consultations" USING btree ("booking_id");
  CREATE INDEX "consultations_customer_idx" ON "consultations" USING btree ("customer_id");
  CREATE INDEX "consultations_branch_idx" ON "consultations" USING btree ("branch_id");
  CREATE INDEX "consultations_expected_contact_date_idx" ON "consultations" USING btree ("expected_contact_date");
  CREATE INDEX "consultations_is_urgent_idx" ON "consultations" USING btree ("is_urgent");
  CREATE INDEX "consultations_assigned_staff_idx" ON "consultations" USING btree ("assigned_staff_id");
  CREATE INDEX "consultations_status_idx" ON "consultations" USING btree ("status");
  CREATE INDEX "consultations_updated_at_idx" ON "consultations" USING btree ("updated_at");
  CREATE INDEX "consultations_created_at_idx" ON "consultations" USING btree ("created_at");
  CREATE INDEX "consultations_rels_order_idx" ON "consultations_rels" USING btree ("order");
  CREATE INDEX "consultations_rels_parent_idx" ON "consultations_rels" USING btree ("parent_id");
  CREATE INDEX "consultations_rels_path_idx" ON "consultations_rels" USING btree ("path");
  CREATE INDEX "consultations_rels_admins_id_idx" ON "consultations_rels" USING btree ("admins_id");
  CREATE INDEX "consultations_rels_users_id_idx" ON "consultations_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "notifications_event_key_idx" ON "notifications" USING btree ("event_key");
  CREATE INDEX "notifications_customer_idx" ON "notifications" USING btree ("customer_id");
  CREATE INDEX "notifications_booking_idx" ON "notifications" USING btree ("booking_id");
  CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "notifications_rels_order_idx" ON "notifications_rels" USING btree ("order");
  CREATE INDEX "notifications_rels_parent_idx" ON "notifications_rels" USING btree ("parent_id");
  CREATE INDEX "notifications_rels_path_idx" ON "notifications_rels" USING btree ("path");
  CREATE INDEX "notifications_rels_admins_id_idx" ON "notifications_rels" USING btree ("admins_id");
  CREATE INDEX "notifications_rels_users_id_idx" ON "notifications_rels" USING btree ("users_id");
  CREATE INDEX "sales_inquiries_status_history_order_idx" ON "sales_inquiries_status_history" USING btree ("_order");
  CREATE INDEX "sales_inquiries_status_history_parent_id_idx" ON "sales_inquiries_status_history" USING btree ("_parent_id");
  CREATE INDEX "sales_inquiries_customer_idx" ON "sales_inquiries" USING btree ("customer_id");
  CREATE INDEX "sales_inquiries_model_idx" ON "sales_inquiries" USING btree ("model_id");
  CREATE INDEX "sales_inquiries_vehicle_idx" ON "sales_inquiries" USING btree ("vehicle_id");
  CREATE INDEX "sales_inquiries_updated_at_idx" ON "sales_inquiries" USING btree ("updated_at");
  CREATE INDEX "sales_inquiries_created_at_idx" ON "sales_inquiries" USING btree ("created_at");
  CREATE INDEX "sales_inquiries_rels_order_idx" ON "sales_inquiries_rels" USING btree ("order");
  CREATE INDEX "sales_inquiries_rels_parent_idx" ON "sales_inquiries_rels" USING btree ("parent_id");
  CREATE INDEX "sales_inquiries_rels_path_idx" ON "sales_inquiries_rels" USING btree ("path");
  CREATE INDEX "sales_inquiries_rels_admins_id_idx" ON "sales_inquiries_rels" USING btree ("admins_id");
  CREATE INDEX "sales_inquiries_rels_users_id_idx" ON "sales_inquiries_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "promotions_code_idx" ON "promotions" USING btree ("code");
  CREATE INDEX "promotions_branch_scope_idx" ON "promotions" USING btree ("branch_scope");
  CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("active");
  CREATE INDEX "promotions_updated_at_idx" ON "promotions" USING btree ("updated_at");
  CREATE INDEX "promotions_created_at_idx" ON "promotions" USING btree ("created_at");
  CREATE INDEX "promotions_rels_order_idx" ON "promotions_rels" USING btree ("order");
  CREATE INDEX "promotions_rels_parent_idx" ON "promotions_rels" USING btree ("parent_id");
  CREATE INDEX "promotions_rels_path_idx" ON "promotions_rels" USING btree ("path");
  CREATE INDEX "promotions_rels_admins_id_idx" ON "promotions_rels" USING btree ("admins_id");
  CREATE INDEX "promotions_rels_users_id_idx" ON "promotions_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "payments_reference_idx" ON "payments" USING btree ("reference");
  CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");
  CREATE INDEX "payments_inquiry_idx" ON "payments" USING btree ("inquiry_id");
  CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");
  CREATE INDEX "payments_branch_idx" ON "payments" USING btree ("branch_id");
  CREATE INDEX "payments_provider_idx" ON "payments" USING btree ("provider");
  CREATE INDEX "payments_environment_idx" ON "payments" USING btree ("environment");
  CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");
  CREATE INDEX "payments_reconciliation_status_idx" ON "payments" USING btree ("reconciliation_status");
  CREATE INDEX "payments_provider_transaction_id_idx" ON "payments" USING btree ("provider_transaction_id");
  CREATE INDEX "payments_provider_payment_ref_idx" ON "payments" USING btree ("provider_payment_ref");
  CREATE INDEX "payments_idempotency_key_idx" ON "payments" USING btree ("idempotency_key");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  CREATE INDEX "payments_rels_order_idx" ON "payments_rels" USING btree ("order");
  CREATE INDEX "payments_rels_parent_idx" ON "payments_rels" USING btree ("parent_id");
  CREATE INDEX "payments_rels_path_idx" ON "payments_rels" USING btree ("path");
  CREATE INDEX "payments_rels_admins_id_idx" ON "payments_rels" USING btree ("admins_id");
  CREATE INDEX "payments_rels_users_id_idx" ON "payments_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "payment_events_event_id_idx" ON "payment_events" USING btree ("event_id");
  CREATE INDEX "payment_events_provider_idx" ON "payment_events" USING btree ("provider");
  CREATE INDEX "payment_events_environment_idx" ON "payment_events" USING btree ("environment");
  CREATE INDEX "payment_events_external_transaction_id_idx" ON "payment_events" USING btree ("external_transaction_id");
  CREATE INDEX "payment_events_payment_reference_idx" ON "payment_events" USING btree ("payment_reference");
  CREATE INDEX "payment_events_event_type_idx" ON "payment_events" USING btree ("event_type");
  CREATE INDEX "payment_events_processing_status_idx" ON "payment_events" USING btree ("processing_status");
  CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");
  CREATE INDEX "payment_events_booking_idx" ON "payment_events" USING btree ("booking_id");
  CREATE INDEX "payment_events_updated_at_idx" ON "payment_events" USING btree ("updated_at");
  CREATE INDEX "payment_events_created_at_idx" ON "payment_events" USING btree ("created_at");
  CREATE INDEX "payment_events_rels_order_idx" ON "payment_events_rels" USING btree ("order");
  CREATE INDEX "payment_events_rels_parent_idx" ON "payment_events_rels" USING btree ("parent_id");
  CREATE INDEX "payment_events_rels_path_idx" ON "payment_events_rels" USING btree ("path");
  CREATE INDEX "payment_events_rels_admins_id_idx" ON "payment_events_rels" USING btree ("admins_id");
  CREATE INDEX "payment_events_rels_users_id_idx" ON "payment_events_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "refunds_reference_idx" ON "refunds" USING btree ("reference");
  CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");
  CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");
  CREATE INDEX "refunds_customer_idx" ON "refunds" USING btree ("customer_id");
  CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");
  CREATE INDEX "refunds_provider_refund_id_idx" ON "refunds" USING btree ("provider_refund_id");
  CREATE INDEX "refunds_updated_at_idx" ON "refunds" USING btree ("updated_at");
  CREATE INDEX "refunds_created_at_idx" ON "refunds" USING btree ("created_at");
  CREATE INDEX "refunds_rels_order_idx" ON "refunds_rels" USING btree ("order");
  CREATE INDEX "refunds_rels_parent_idx" ON "refunds_rels" USING btree ("parent_id");
  CREATE INDEX "refunds_rels_path_idx" ON "refunds_rels" USING btree ("path");
  CREATE INDEX "refunds_rels_admins_id_idx" ON "refunds_rels" USING btree ("admins_id");
  CREATE INDEX "refunds_rels_users_id_idx" ON "refunds_rels" USING btree ("users_id");
  CREATE INDEX "reviews_customer_idx" ON "reviews" USING btree ("customer_id");
  CREATE UNIQUE INDEX "reviews_booking_idx" ON "reviews" USING btree ("booking_id");
  CREATE INDEX "reviews_model_idx" ON "reviews" USING btree ("model_id");
  CREATE INDEX "reviews_vehicle_idx" ON "reviews" USING btree ("vehicle_id");
  CREATE INDEX "reviews_updated_at_idx" ON "reviews" USING btree ("updated_at");
  CREATE INDEX "reviews_created_at_idx" ON "reviews" USING btree ("created_at");
  CREATE INDEX "reviews_rels_order_idx" ON "reviews_rels" USING btree ("order");
  CREATE INDEX "reviews_rels_parent_idx" ON "reviews_rels" USING btree ("parent_id");
  CREATE INDEX "reviews_rels_path_idx" ON "reviews_rels" USING btree ("path");
  CREATE INDEX "reviews_rels_admins_id_idx" ON "reviews_rels" USING btree ("admins_id");
  CREATE INDEX "reviews_rels_users_id_idx" ON "reviews_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  CREATE INDEX "posts_cover_idx" ON "posts" USING btree ("cover_id");
  CREATE INDEX "posts_promotion_idx" ON "posts" USING btree ("promotion_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_admins_id_idx" ON "posts_rels" USING btree ("admins_id");
  CREATE INDEX "posts_rels_users_id_idx" ON "posts_rels" USING btree ("users_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v" USING btree ("version_slug");
  CREATE INDEX "_posts_v_version_version_cover_idx" ON "_posts_v" USING btree ("version_cover_id");
  CREATE INDEX "_posts_v_version_version_promotion_idx" ON "_posts_v" USING btree ("version_promotion_id");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_published_locale_idx" ON "_posts_v" USING btree ("published_locale");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_admins_id_idx" ON "_posts_v_rels" USING btree ("admins_id");
  CREATE INDEX "_posts_v_rels_users_id_idx" ON "_posts_v_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_folders_id_idx" ON "payload_locked_documents_rels" USING btree ("folders_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_vehicle_models_id_idx" ON "payload_locked_documents_rels" USING btree ("vehicle_models_id");
  CREATE INDEX "payload_locked_documents_rels_vehicles_id_idx" ON "payload_locked_documents_rels" USING btree ("vehicles_id");
  CREATE INDEX "payload_locked_documents_rels_maintenance_schedules_id_idx" ON "payload_locked_documents_rels" USING btree ("maintenance_schedules_id");
  CREATE INDEX "payload_locked_documents_rels_rental_days_id_idx" ON "payload_locked_documents_rels" USING btree ("rental_days_id");
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("bookings_id");
  CREATE INDEX "payload_locked_documents_rels_sales_inquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("sales_inquiries_id");
  CREATE INDEX "payload_locked_documents_rels_promotions_id_idx" ON "payload_locked_documents_rels" USING btree ("promotions_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_admins_id_idx" ON "payload_preferences_rels" USING btree ("admins_id");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "payload_llm_instructions_entity_slug_idx" ON "payload_llm_instructions" USING btree ("entity_slug");
  CREATE INDEX "payload_llm_instructions_updated_at_idx" ON "payload_llm_instructions" USING btree ("updated_at");
  CREATE INDEX "payload_llm_instructions_created_at_idx" ON "payload_llm_instructions" USING btree ("created_at");
  CREATE INDEX "payload_llm_instructions_rels_order_idx" ON "payload_llm_instructions_rels" USING btree ("order");
  CREATE INDEX "payload_llm_instructions_rels_parent_idx" ON "payload_llm_instructions_rels" USING btree ("parent_id");
  CREATE INDEX "payload_llm_instructions_rels_path_idx" ON "payload_llm_instructions_rels" USING btree ("path");
  CREATE INDEX "payload_llm_instructions_rels_admins_id_idx" ON "payload_llm_instructions_rels" USING btree ("admins_id");
  CREATE INDEX "payload_llm_instructions_rels_users_id_idx" ON "payload_llm_instructions_rels" USING btree ("users_id");
  CREATE INDEX "nori_site_hero_slides_order_idx" ON "nori_site_hero_slides" USING btree ("_order");
  CREATE INDEX "nori_site_hero_slides_parent_id_idx" ON "nori_site_hero_slides" USING btree ("_parent_id");
  CREATE INDEX "nori_site_hero_slides_desktop_image_idx" ON "nori_site_hero_slides" USING btree ("desktop_image_id");
  CREATE INDEX "nori_site_hero_slides_mobile_image_idx" ON "nori_site_hero_slides" USING btree ("mobile_image_id");
  CREATE INDEX "nori_site_hero_slides_related_model_idx" ON "nori_site_hero_slides" USING btree ("related_model_id");
  CREATE INDEX "nori_site_hero_images_order_idx" ON "nori_site_hero_images" USING btree ("_order");
  CREATE INDEX "nori_site_hero_images_parent_id_idx" ON "nori_site_hero_images" USING btree ("_parent_id");
  CREATE INDEX "nori_site_hero_images_image_idx" ON "nori_site_hero_images" USING btree ("image_id");
  CREATE INDEX "nori_site_header_menu_order_idx" ON "nori_site_header_menu" USING btree ("_order");
  CREATE INDEX "nori_site_header_menu_parent_id_idx" ON "nori_site_header_menu" USING btree ("_parent_id");
  CREATE INDEX "nori_site_footer_links_order_idx" ON "nori_site_footer_links" USING btree ("_order");
  CREATE INDEX "nori_site_footer_links_parent_id_idx" ON "nori_site_footer_links" USING btree ("_parent_id");
  CREATE INDEX "nori_site_social_links_order_idx" ON "nori_site_social_links" USING btree ("_order");
  CREATE INDEX "nori_site_social_links_parent_id_idx" ON "nori_site_social_links" USING btree ("_parent_id");
  CREATE INDEX "nori_site_holidays_order_idx" ON "nori_site_holidays" USING btree ("_order");
  CREATE INDEX "nori_site_holidays_parent_id_idx" ON "nori_site_holidays" USING btree ("_parent_id");
  CREATE INDEX "nori_site_faqs_order_idx" ON "nori_site_faqs" USING btree ("_order");
  CREATE INDEX "nori_site_faqs_parent_id_idx" ON "nori_site_faqs" USING btree ("_parent_id");
  CREATE INDEX "nori_site_logo_idx" ON "nori_site" USING btree ("logo_id");
  CREATE INDEX "nori_site_favicon_idx" ON "nori_site" USING btree ("favicon_id");
  CREATE INDEX "nori_site_og_image_idx" ON "nori_site" USING btree ("og_image_id");
  CREATE INDEX "nori_site_story_image_idx" ON "nori_site" USING btree ("story_image_id");
  CREATE INDEX "nori_site__status_idx" ON "nori_site" USING btree ("_status");
  CREATE INDEX "nori_site_rels_order_idx" ON "nori_site_rels" USING btree ("order");
  CREATE INDEX "nori_site_rels_parent_idx" ON "nori_site_rels" USING btree ("parent_id");
  CREATE INDEX "nori_site_rels_path_idx" ON "nori_site_rels" USING btree ("path");
  CREATE INDEX "nori_site_rels_admins_id_idx" ON "nori_site_rels" USING btree ("admins_id");
  CREATE INDEX "nori_site_rels_users_id_idx" ON "nori_site_rels" USING btree ("users_id");
  CREATE INDEX "_nori_site_v_version_hero_slides_order_idx" ON "_nori_site_v_version_hero_slides" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_hero_slides_parent_id_idx" ON "_nori_site_v_version_hero_slides" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_hero_slides_desktop_image_idx" ON "_nori_site_v_version_hero_slides" USING btree ("desktop_image_id");
  CREATE INDEX "_nori_site_v_version_hero_slides_mobile_image_idx" ON "_nori_site_v_version_hero_slides" USING btree ("mobile_image_id");
  CREATE INDEX "_nori_site_v_version_hero_slides_related_model_idx" ON "_nori_site_v_version_hero_slides" USING btree ("related_model_id");
  CREATE INDEX "_nori_site_v_version_hero_images_order_idx" ON "_nori_site_v_version_hero_images" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_hero_images_parent_id_idx" ON "_nori_site_v_version_hero_images" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_hero_images_image_idx" ON "_nori_site_v_version_hero_images" USING btree ("image_id");
  CREATE INDEX "_nori_site_v_version_header_menu_order_idx" ON "_nori_site_v_version_header_menu" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_header_menu_parent_id_idx" ON "_nori_site_v_version_header_menu" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_footer_links_order_idx" ON "_nori_site_v_version_footer_links" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_footer_links_parent_id_idx" ON "_nori_site_v_version_footer_links" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_social_links_order_idx" ON "_nori_site_v_version_social_links" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_social_links_parent_id_idx" ON "_nori_site_v_version_social_links" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_holidays_order_idx" ON "_nori_site_v_version_holidays" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_holidays_parent_id_idx" ON "_nori_site_v_version_holidays" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_faqs_order_idx" ON "_nori_site_v_version_faqs" USING btree ("_order");
  CREATE INDEX "_nori_site_v_version_faqs_parent_id_idx" ON "_nori_site_v_version_faqs" USING btree ("_parent_id");
  CREATE INDEX "_nori_site_v_version_version_logo_idx" ON "_nori_site_v" USING btree ("version_logo_id");
  CREATE INDEX "_nori_site_v_version_version_favicon_idx" ON "_nori_site_v" USING btree ("version_favicon_id");
  CREATE INDEX "_nori_site_v_version_version_og_image_idx" ON "_nori_site_v" USING btree ("version_og_image_id");
  CREATE INDEX "_nori_site_v_version_version_story_image_idx" ON "_nori_site_v" USING btree ("version_story_image_id");
  CREATE INDEX "_nori_site_v_version_version__status_idx" ON "_nori_site_v" USING btree ("version__status");
  CREATE INDEX "_nori_site_v_created_at_idx" ON "_nori_site_v" USING btree ("created_at");
  CREATE INDEX "_nori_site_v_updated_at_idx" ON "_nori_site_v" USING btree ("updated_at");
  CREATE INDEX "_nori_site_v_published_locale_idx" ON "_nori_site_v" USING btree ("published_locale");
  CREATE INDEX "_nori_site_v_latest_idx" ON "_nori_site_v" USING btree ("latest");
  CREATE INDEX "_nori_site_v_rels_order_idx" ON "_nori_site_v_rels" USING btree ("order");
  CREATE INDEX "_nori_site_v_rels_parent_idx" ON "_nori_site_v_rels" USING btree ("parent_id");
  CREATE INDEX "_nori_site_v_rels_path_idx" ON "_nori_site_v_rels" USING btree ("path");
  CREATE INDEX "_nori_site_v_rels_admins_id_idx" ON "_nori_site_v_rels" USING btree ("admins_id");
  CREATE INDEX "_nori_site_v_rels_users_id_idx" ON "_nori_site_v_rels" USING btree ("users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admins_sessions" CASCADE;
  DROP TABLE "admins" CASCADE;
  DROP TABLE "admins_rels" CASCADE;
  DROP TABLE "audit_logs" CASCADE;
  DROP TABLE "audit_logs_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_rels" CASCADE;
  DROP TABLE "_media_v" CASCADE;
  DROP TABLE "_media_v_rels" CASCADE;
  DROP TABLE "folders" CASCADE;
  DROP TABLE "folders_rels" CASCADE;
  DROP TABLE "_folders_v" CASCADE;
  DROP TABLE "_folders_v_rels" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_rels" CASCADE;
  DROP TABLE "_tags_v" CASCADE;
  DROP TABLE "_tags_v_rels" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "branches_gallery" CASCADE;
  DROP TABLE "branches" CASCADE;
  DROP TABLE "branches_rels" CASCADE;
  DROP TABLE "warehouses" CASCADE;
  DROP TABLE "warehouses_rels" CASCADE;
  DROP TABLE "service_locations" CASCADE;
  DROP TABLE "service_locations_rels" CASCADE;
  DROP TABLE "branch_staff" CASCADE;
  DROP TABLE "branch_staff_rels" CASCADE;
  DROP TABLE "vehicle_models_highlights" CASCADE;
  DROP TABLE "vehicle_models_features" CASCADE;
  DROP TABLE "vehicle_models_gallery" CASCADE;
  DROP TABLE "vehicle_models_specifications" CASCADE;
  DROP TABLE "vehicle_models_variants_colors" CASCADE;
  DROP TABLE "vehicle_models_variants" CASCADE;
  DROP TABLE "vehicle_models" CASCADE;
  DROP TABLE "vehicle_models_rels" CASCADE;
  DROP TABLE "vehicles_photos" CASCADE;
  DROP TABLE "vehicles" CASCADE;
  DROP TABLE "vehicles_rels" CASCADE;
  DROP TABLE "vehicle_transfers" CASCADE;
  DROP TABLE "vehicle_transfers_rels" CASCADE;
  DROP TABLE "vehicle_location_history" CASCADE;
  DROP TABLE "vehicle_location_history_rels" CASCADE;
  DROP TABLE "delivery_zones" CASCADE;
  DROP TABLE "delivery_zones_rels" CASCADE;
  DROP TABLE "delivery_jobs" CASCADE;
  DROP TABLE "delivery_jobs_rels" CASCADE;
  DROP TABLE "location_pricing_rules" CASCADE;
  DROP TABLE "location_pricing_rules_rels" CASCADE;
  DROP TABLE "one_way_rental_rules" CASCADE;
  DROP TABLE "one_way_rental_rules_rels" CASCADE;
  DROP TABLE "maintenance_schedules" CASCADE;
  DROP TABLE "maintenance_schedules_rels" CASCADE;
  DROP TABLE "rental_days" CASCADE;
  DROP TABLE "rental_days_rels" CASCADE;
  DROP TABLE "bookings_modification_history_changes" CASCADE;
  DROP TABLE "bookings_modification_history" CASCADE;
  DROP TABLE "bookings_status_history" CASCADE;
  DROP TABLE "bookings" CASCADE;
  DROP TABLE "bookings_rels" CASCADE;
  DROP TABLE "consultations_contact_logs" CASCADE;
  DROP TABLE "consultations" CASCADE;
  DROP TABLE "consultations_rels" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "notifications_rels" CASCADE;
  DROP TABLE "sales_inquiries_status_history" CASCADE;
  DROP TABLE "sales_inquiries" CASCADE;
  DROP TABLE "sales_inquiries_rels" CASCADE;
  DROP TABLE "promotions" CASCADE;
  DROP TABLE "promotions_rels" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "payments_rels" CASCADE;
  DROP TABLE "payment_events" CASCADE;
  DROP TABLE "payment_events_rels" CASCADE;
  DROP TABLE "refunds" CASCADE;
  DROP TABLE "refunds_rels" CASCADE;
  DROP TABLE "reviews" CASCADE;
  DROP TABLE "reviews_rels" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "payload_llm_instructions" CASCADE;
  DROP TABLE "payload_llm_instructions_rels" CASCADE;
  DROP TABLE "nori_site_hero_slides" CASCADE;
  DROP TABLE "nori_site_hero_images" CASCADE;
  DROP TABLE "nori_site_header_menu" CASCADE;
  DROP TABLE "nori_site_footer_links" CASCADE;
  DROP TABLE "nori_site_social_links" CASCADE;
  DROP TABLE "nori_site_holidays" CASCADE;
  DROP TABLE "nori_site_faqs" CASCADE;
  DROP TABLE "nori_site" CASCADE;
  DROP TABLE "nori_site_rels" CASCADE;
  DROP TABLE "_nori_site_v_version_hero_slides" CASCADE;
  DROP TABLE "_nori_site_v_version_hero_images" CASCADE;
  DROP TABLE "_nori_site_v_version_header_menu" CASCADE;
  DROP TABLE "_nori_site_v_version_footer_links" CASCADE;
  DROP TABLE "_nori_site_v_version_social_links" CASCADE;
  DROP TABLE "_nori_site_v_version_holidays" CASCADE;
  DROP TABLE "_nori_site_v_version_faqs" CASCADE;
  DROP TABLE "_nori_site_v" CASCADE;
  DROP TABLE "_nori_site_v_rels" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_admins_admin_role";
  DROP TYPE "public"."enum_admins_staff_title";
  DROP TYPE "public"."enum_admins_branch_scope_mode";
  DROP TYPE "public"."enum_admins_account_status";
  DROP TYPE "public"."enum_audit_logs_actor_type";
  DROP TYPE "public"."enum_audit_logs_outcome";
  DROP TYPE "public"."enum_media_media_category";
  DROP TYPE "public"."enum__media_v_version_media_category";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_users_verification_status";
  DROP TYPE "public"."enum_branches_status";
  DROP TYPE "public"."enum_warehouses_warehouse_type";
  DROP TYPE "public"."enum_warehouses_status";
  DROP TYPE "public"."enum_service_locations_location_type";
  DROP TYPE "public"."enum_service_locations_status";
  DROP TYPE "public"."enum_branch_staff_staff_role";
  DROP TYPE "public"."enum_branch_staff_status";
  DROP TYPE "public"."enum_vehicle_models_features_category";
  DROP TYPE "public"."enum_vehicle_models_features_status";
  DROP TYPE "public"."enum_vehicle_models_gallery_kind";
  DROP TYPE "public"."enum_vehicle_models_specifications_group";
  DROP TYPE "public"."enum_vehicle_models_category";
  DROP TYPE "public"."enum_vehicle_models_sub_category";
  DROP TYPE "public"."enum_vehicle_models_fuel_type";
  DROP TYPE "public"."enum_vehicle_models_verification_status";
  DROP TYPE "public"."enum_vehicles_photos_kind";
  DROP TYPE "public"."enum_vehicles_intent";
  DROP TYPE "public"."enum_vehicles_vehicle_condition_type";
  DROP TYPE "public"."enum_vehicles_allocation_status";
  DROP TYPE "public"."enum_vehicles_operation_status";
  DROP TYPE "public"."enum_vehicles_status";
  DROP TYPE "public"."enum_vehicle_transfers_status";
  DROP TYPE "public"."enum_vehicle_location_history_event_type";
  DROP TYPE "public"."enum_delivery_jobs_job_type";
  DROP TYPE "public"."enum_delivery_jobs_status";
  DROP TYPE "public"."enum_location_pricing_rules_scope_type";
  DROP TYPE "public"."enum_one_way_rental_rules_vehicle_category";
  DROP TYPE "public"."enum_one_way_rental_rules_revenue_split_mode";
  DROP TYPE "public"."enum_maintenance_schedules_maintenance_type";
  DROP TYPE "public"."enum_maintenance_schedules_status";
  DROP TYPE "public"."enum_rental_days_lock_type";
  DROP TYPE "public"."enum_bookings_pickup_method";
  DROP TYPE "public"."enum_bookings_return_method";
  DROP TYPE "public"."enum_bookings_return_inspection_status";
  DROP TYPE "public"."enum_bookings_payment_option";
  DROP TYPE "public"."enum_bookings_status";
  DROP TYPE "public"."enum_consultations_status";
  DROP TYPE "public"."enum_notifications_type";
  DROP TYPE "public"."enum_sales_inquiries_inquiry_type";
  DROP TYPE "public"."enum_sales_inquiries_payment_method";
  DROP TYPE "public"."enum_sales_inquiries_status";
  DROP TYPE "public"."enum_promotions_discount_type";
  DROP TYPE "public"."enum_promotions_applies_to";
  DROP TYPE "public"."enum_promotions_branch_scope";
  DROP TYPE "public"."enum_payments_payment_type";
  DROP TYPE "public"."enum_payments_method";
  DROP TYPE "public"."enum_payments_provider";
  DROP TYPE "public"."enum_payments_environment";
  DROP TYPE "public"."enum_payments_status";
  DROP TYPE "public"."enum_payments_reconciliation_status";
  DROP TYPE "public"."enum_payment_events_provider";
  DROP TYPE "public"."enum_payment_events_environment";
  DROP TYPE "public"."enum_payment_events_verification_result";
  DROP TYPE "public"."enum_payment_events_processing_status";
  DROP TYPE "public"."enum_refunds_refund_type";
  DROP TYPE "public"."enum_refunds_status";
  DROP TYPE "public"."enum_refunds_provider";
  DROP TYPE "public"."enum_refunds_requested_by_type";
  DROP TYPE "public"."enum_reviews_status";
  DROP TYPE "public"."enum_posts_category";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_category";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum__posts_v_published_locale";
  DROP TYPE "public"."enum_payload_llm_instructions_entity_type";
  DROP TYPE "public"."enum_nori_site_hero_slides_related_category";
  DROP TYPE "public"."enum_nori_site_active_payment_provider";
  DROP TYPE "public"."enum_nori_site_reservation_deposit_policy_mode";
  DROP TYPE "public"."enum_nori_site_status";
  DROP TYPE "public"."enum__nori_site_v_version_hero_slides_related_category";
  DROP TYPE "public"."enum__nori_site_v_version_active_payment_provider";
  DROP TYPE "public"."enum__nori_site_v_version_reservation_deposit_policy_mode";
  DROP TYPE "public"."enum__nori_site_v_version_status";
  DROP TYPE "public"."enum__nori_site_v_published_locale";`)
}
