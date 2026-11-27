import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "ai_settings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "enabled" boolean DEFAULT true,
      "greeting_message" varchar,
      "max_output_tokens" numeric DEFAULT 1000,
      "max_tool_rounds" numeric DEFAULT 5,
      "rate_limit_per_minute" numeric DEFAULT 5,
      "rate_limit_per_day" numeric DEFAULT 30,
      "daily_budget_usd" numeric DEFAULT 5,
      "weight_budget" numeric DEFAULT 35,
      "weight_purpose" numeric DEFAULT 25,
      "weight_capacity" numeric DEFAULT 20,
      "weight_rating" numeric DEFAULT 10,
      "weight_fuel" numeric DEFAULT 10,
      "knowledge_note" varchar,
      "updated_by_email" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now(),
      "created_at" timestamp(3) with time zone DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "ai_settings_quick_suggestions" (
      "_order" integer NOT NULL,
      "_parent_id" uuid NOT NULL REFERENCES "ai_settings"("id") ON DELETE cascade,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "prompt" varchar NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "ai_settings_quick_suggestions_order_idx" ON "ai_settings_quick_suggestions" ("_order");
    CREATE INDEX IF NOT EXISTS "ai_settings_quick_suggestions_parent_id_idx" ON "ai_settings_quick_suggestions" ("_parent_id");

    CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "request_id" varchar NOT NULL,
      "event_type" varchar DEFAULT 'CHAT' NOT NULL,
      "status" varchar DEFAULT 'SUCCESS' NOT NULL,
      "provider" varchar DEFAULT 'openai',
      "model" varchar,
      "user_type" varchar DEFAULT 'GUEST',
      "user_id" varchar,
      "session_hash" varchar,
      "intent" varchar,
      "tools_called" jsonb,
      "recommended_model_slugs" jsonb,
      "clicked_model_slug" varchar,
      "no_result_found" boolean DEFAULT false,
      "input_tokens" numeric DEFAULT 0,
      "output_tokens" numeric DEFAULT 0,
      "total_tokens" numeric DEFAULT 0,
      "estimated_cost_usd" numeric DEFAULT 0,
      "latency_ms" numeric DEFAULT 0,
      "error_code" varchar,
      "error_category" varchar,
      "guardrail_triggered" varchar,
      "query_summary" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_logs_request_id_idx" ON "ai_usage_logs" ("request_id");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_event_type_idx" ON "ai_usage_logs" ("event_type");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_status_idx" ON "ai_usage_logs" ("status");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_model_idx" ON "ai_usage_logs" ("model");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_session_hash_idx" ON "ai_usage_logs" ("session_hash");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_intent_idx" ON "ai_usage_logs" ("intent");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_clicked_model_slug_idx" ON "ai_usage_logs" ("clicked_model_slug");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_no_result_found_idx" ON "ai_usage_logs" ("no_result_found");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_guardrail_triggered_idx" ON "ai_usage_logs" ("guardrail_triggered");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_event_created_idx" ON "ai_usage_logs" ("event_type", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_status_created_idx" ON "ai_usage_logs" ("status", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_updated_at_idx" ON "ai_usage_logs" ("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_created_at_idx" ON "ai_usage_logs" ("created_at");

    CREATE TABLE IF NOT EXISTS "ai_feedback" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "request_id" varchar NOT NULL,
      "rating" varchar NOT NULL,
      "reason_category" varchar DEFAULT 'OTHER',
      "comment" varchar,
      "recommended_slugs" jsonb,
      "user_type" varchar DEFAULT 'GUEST',
      "review_status" varchar DEFAULT 'NEW',
      "admin_note" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "ai_feedback_request_id_idx" ON "ai_feedback" ("request_id");
    CREATE INDEX IF NOT EXISTS "ai_feedback_rating_idx" ON "ai_feedback" ("rating");
    CREATE INDEX IF NOT EXISTS "ai_feedback_review_status_idx" ON "ai_feedback" ("review_status");
    CREATE INDEX IF NOT EXISTS "ai_feedback_updated_at_idx" ON "ai_feedback" ("updated_at");
    CREATE INDEX IF NOT EXISTS "ai_feedback_created_at_idx" ON "ai_feedback" ("created_at");

    CREATE TABLE IF NOT EXISTS "ai_settings_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "ai_settings"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "admins_id" uuid REFERENCES "admins"("id") ON DELETE cascade,
      "users_id" uuid REFERENCES "users"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "ai_settings_rels_order_idx" ON "ai_settings_rels" ("order");
    CREATE INDEX IF NOT EXISTS "ai_settings_rels_parent_idx" ON "ai_settings_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "ai_settings_rels_path_idx" ON "ai_settings_rels" ("path");
    CREATE INDEX IF NOT EXISTS "ai_settings_rels_admins_id_idx" ON "ai_settings_rels" ("admins_id");
    CREATE INDEX IF NOT EXISTS "ai_settings_rels_users_id_idx" ON "ai_settings_rels" ("users_id");

    CREATE TABLE IF NOT EXISTS "ai_usage_logs_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "ai_usage_logs"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "admins_id" uuid REFERENCES "admins"("id") ON DELETE cascade,
      "users_id" uuid REFERENCES "users"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_rels_order_idx" ON "ai_usage_logs_rels" ("order");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_rels_parent_idx" ON "ai_usage_logs_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_rels_path_idx" ON "ai_usage_logs_rels" ("path");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_rels_admins_id_idx" ON "ai_usage_logs_rels" ("admins_id");
    CREATE INDEX IF NOT EXISTS "ai_usage_logs_rels_users_id_idx" ON "ai_usage_logs_rels" ("users_id");

    CREATE TABLE IF NOT EXISTS "ai_feedback_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" uuid NOT NULL REFERENCES "ai_feedback"("id") ON DELETE cascade,
      "path" varchar NOT NULL,
      "admins_id" uuid REFERENCES "admins"("id") ON DELETE cascade,
      "users_id" uuid REFERENCES "users"("id") ON DELETE cascade
    );
    CREATE INDEX IF NOT EXISTS "ai_feedback_rels_order_idx" ON "ai_feedback_rels" ("order");
    CREATE INDEX IF NOT EXISTS "ai_feedback_rels_parent_idx" ON "ai_feedback_rels" ("parent_id");
    CREATE INDEX IF NOT EXISTS "ai_feedback_rels_path_idx" ON "ai_feedback_rels" ("path");
    CREATE INDEX IF NOT EXISTS "ai_feedback_rels_admins_id_idx" ON "ai_feedback_rels" ("admins_id");
    CREATE INDEX IF NOT EXISTS "ai_feedback_rels_users_id_idx" ON "ai_feedback_rels" ("users_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "ai_feedback_rels";
    DROP TABLE IF EXISTS "ai_feedback";
    DROP TABLE IF EXISTS "ai_usage_logs_rels";
    DROP TABLE IF EXISTS "ai_usage_logs";
    DROP TABLE IF EXISTS "ai_settings_rels";
    DROP TABLE IF EXISTS "ai_settings_quick_suggestions";
    DROP TABLE IF EXISTS "ai_settings";
  `)
}
