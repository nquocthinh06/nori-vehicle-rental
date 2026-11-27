import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_vehicle_models_import_source_type" AS ENUM('OFFICIAL_URL', 'PDF_BROCHURE', 'AI_ASSISTED', 'BULK_FILE', 'MANUAL');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_vehicle_import_jobs_method" AS ENUM('URL', 'AI_SEARCH', 'BULK', 'PDF_BROCHURE', 'MANUAL');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_vehicle_import_jobs_status" AS ENUM('QUEUED', 'FETCHING', 'EXTRACTING', 'NORMALIZING', 'VALIDATING', 'PREVIEW_READY', 'AWAITING_APPROVAL', 'IMPORTING', 'COMPLETED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_vehicle_import_jobs_conflict_policy" AS ENUM('SKIP_EXISTING', 'MERGE_EMPTY', 'OVERWRITE_UNLOCKED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "msrp_reference_vnd" numeric;
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "import_source_url" varchar;
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "import_source_type" "public"."enum_vehicle_models_import_source_type" DEFAULT 'MANUAL';
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "import_source_hash" varchar;
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "last_imported_at" varchar;
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "locked_fields" jsonb;
    ALTER TABLE "vehicle_models" ADD COLUMN IF NOT EXISTS "revision_number" numeric DEFAULT 1;

    ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "source_sha256" varchar;
    CREATE INDEX IF NOT EXISTS "media_source_sha256_idx" ON "media" ("source_sha256");
    ALTER TABLE IF EXISTS "_media_v" ADD COLUMN IF NOT EXISTS "version_source_sha256" varchar;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_media_v') THEN
        CREATE INDEX IF NOT EXISTS "_media_v_version_source_sha256_idx" ON "_media_v" ("version_source_sha256");
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS "vehicle_import_jobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "job_code" varchar NOT NULL,
      "method" "public"."enum_vehicle_import_jobs_method" NOT NULL,
      "status" "public"."enum_vehicle_import_jobs_status" DEFAULT 'QUEUED' NOT NULL,
      "target_model_id" uuid REFERENCES "vehicle_models"("id") ON DELETE set null,
      "source_input" jsonb,
      "normalized_draft" jsonb,
      "diff_preview" jsonb,
      "uncertainty_flags" jsonb,
      "media_report" jsonb,
      "rollback_snapshot" jsonb,
      "conflict_policy" "public"."enum_vehicle_import_jobs_conflict_policy" DEFAULT 'MERGE_EMPTY' NOT NULL,
      "progress_pct" numeric DEFAULT 0,
      "current_stage" varchar,
      "attempt_count" numeric DEFAULT 1,
      "error_code" varchar,
      "error_message" varchar,
      "created_by_admin_id" varchar,
      "started_at" varchar,
      "finished_at" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_import_jobs_job_code_idx" ON "vehicle_import_jobs" ("job_code");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_method_idx" ON "vehicle_import_jobs" ("method");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_status_idx" ON "vehicle_import_jobs" ("status");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_target_model_idx" ON "vehicle_import_jobs" ("target_model_id");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_created_by_admin_id_idx" ON "vehicle_import_jobs" ("created_by_admin_id");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_updated_at_idx" ON "vehicle_import_jobs" ("updated_at");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_created_at_idx" ON "vehicle_import_jobs" ("created_at");

    CREATE TABLE IF NOT EXISTS "vehicle_import_jobs_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "vehicle_import_jobs"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "admins_id" uuid REFERENCES "admins"("id") ON DELETE cascade,
      "users_id" uuid REFERENCES "users"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_rels_order_idx" ON "vehicle_import_jobs_rels" ("order");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_rels_parent_idx" ON "vehicle_import_jobs_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_rels_path_idx" ON "vehicle_import_jobs_rels" ("path");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_rels_admins_id_idx" ON "vehicle_import_jobs_rels" ("admins_id");
    CREATE INDEX IF NOT EXISTS "vehicle_import_jobs_rels_users_id_idx" ON "vehicle_import_jobs_rels" ("users_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "vehicle_import_jobs_rels";
    DROP TABLE IF EXISTS "vehicle_import_jobs";
    DROP INDEX IF EXISTS "_media_v_version_source_sha256_idx";
    ALTER TABLE IF EXISTS "_media_v" DROP COLUMN IF EXISTS "version_source_sha256";
    DROP INDEX IF EXISTS "media_source_sha256_idx";
    ALTER TABLE "media" DROP COLUMN IF EXISTS "source_sha256";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "revision_number";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "locked_fields";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "last_imported_at";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "import_source_hash";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "import_source_type";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "import_source_url";
    ALTER TABLE "vehicle_models" DROP COLUMN IF EXISTS "msrp_reference_vnd";
    DROP TYPE IF EXISTS "public"."enum_vehicle_import_jobs_conflict_policy";
    DROP TYPE IF EXISTS "public"."enum_vehicle_import_jobs_status";
    DROP TYPE IF EXISTS "public"."enum_vehicle_import_jobs_method";
    DROP TYPE IF EXISTS "public"."enum_vehicle_models_import_source_type";
  `)
}
