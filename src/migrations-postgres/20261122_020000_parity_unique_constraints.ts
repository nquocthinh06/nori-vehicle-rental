import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Database-enforced idempotency and payment concurrency uniqueness guarantees:
 * 1. bookings_customer_idempotency_uniq: prevents duplicate bookings per customer + idempotency key.
 * 2. payments_booking_active_pending_uniq: ensures at most one active PENDING payment intent per booking.
 * 3. payments_env_provider_tx_uniq: prevents replay/duplicate settlement per (environment, provider, txId).
 * Safe to apply forward and roll back cleanly without mutating table data.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "bookings_customer_idempotency_uniq"
      ON "bookings" ("customer_id", "idempotency_key")
      WHERE "customer_id" IS NOT NULL
        AND "idempotency_key" IS NOT NULL
        AND "idempotency_key" <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS "payments_booking_active_pending_uniq"
      ON "payments" ("booking_id")
      WHERE "booking_id" IS NOT NULL
        AND "status" = 'PENDING';

    CREATE UNIQUE INDEX IF NOT EXISTS "payments_env_provider_tx_uniq"
      ON "payments" ("environment", "provider", "provider_transaction_id")
      WHERE "provider_transaction_id" IS NOT NULL
        AND "provider_transaction_id" <> '';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payments_env_provider_tx_uniq";
    DROP INDEX IF EXISTS "payments_booking_active_pending_uniq";
    DROP INDEX IF EXISTS "bookings_customer_idempotency_uniq";
  `)
}
