import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Additive PostgreSQL composite indexes matching high-frequency availability,
 * booking, rental-days calendar, payment, maintenance, and notification queries.
 * Safe to run forward and roll back via DROP INDEX IF EXISTS without touching table data.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "bookings_vehicle_status_idx"
      ON "bookings" ("vehicle_id", "status");
    CREATE INDEX IF NOT EXISTS "bookings_customer_created_idx"
      ON "bookings" ("customer_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "bookings_status_created_idx"
      ON "bookings" ("status", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "bookings_status_end_date_idx"
      ON "bookings" ("status", "end_date");
    CREATE INDEX IF NOT EXISTS "bookings_pickup_branch_status_idx"
      ON "bookings" ("pickup_branch_id", "status");
    CREATE INDEX IF NOT EXISTS "bookings_return_branch_status_idx"
      ON "bookings" ("return_branch_id", "status");
    CREATE INDEX IF NOT EXISTS "rental_days_vehicle_day_idx"
      ON "rental_days" ("vehicle_id", "day");
    CREATE INDEX IF NOT EXISTS "vehicles_model_status_idx"
      ON "vehicles" ("model_id", "status", "operation_status");
    CREATE INDEX IF NOT EXISTS "vehicles_current_branch_status_idx"
      ON "vehicles" ("current_branch_id", "status", "operation_status");
    CREATE INDEX IF NOT EXISTS "payments_booking_created_idx"
      ON "payments" ("booking_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "payments_status_expires_idx"
      ON "payments" ("status", "expires_at");
    CREATE INDEX IF NOT EXISTS "notifications_customer_created_idx"
      ON "notifications" ("customer_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "maintenance_vehicle_status_dates_idx"
      ON "maintenance_schedules" ("vehicle_id", "status", "start_date", "end_date");
    CREATE INDEX IF NOT EXISTS "transfers_vehicle_status_dates_idx"
      ON "vehicle_transfers" ("vehicle_id", "status", "start_date", "end_date");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "transfers_vehicle_status_dates_idx";
    DROP INDEX IF EXISTS "maintenance_vehicle_status_dates_idx";
    DROP INDEX IF EXISTS "notifications_customer_created_idx";
    DROP INDEX IF EXISTS "payments_status_expires_idx";
    DROP INDEX IF EXISTS "payments_booking_created_idx";
    DROP INDEX IF EXISTS "vehicles_current_branch_status_idx";
    DROP INDEX IF EXISTS "vehicles_model_status_idx";
    DROP INDEX IF EXISTS "rental_days_vehicle_day_idx";
    DROP INDEX IF EXISTS "bookings_return_branch_status_idx";
    DROP INDEX IF EXISTS "bookings_pickup_branch_status_idx";
    DROP INDEX IF EXISTS "bookings_status_end_date_idx";
    DROP INDEX IF EXISTS "bookings_status_created_idx";
    DROP INDEX IF EXISTS "bookings_customer_created_idx";
    DROP INDEX IF EXISTS "bookings_vehicle_status_idx";
  `)
}
