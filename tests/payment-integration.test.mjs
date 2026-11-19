import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import {
  createFullBackup,
  restoreFromBackup,
  runDatabaseMigration,
  sha256File,
} from '../src/lib/data-sync.ts'
import {
  computeBookingFinancialsFromDb,
  confirmPaymentManuallyByAdmin,
  createOrProcessAdminRefund,
  createOrReuseCustomerPayment,
  getSitePaymentConfig,
  processProviderWebhook,
  sweepExpiredPayments,
} from '../src/lib/payment-service.ts'

/**
 * Lightweight SQLite-backed Payload Local API Harness operating strictly on an isolated SQLite DB in os.tmpdir().
 * Executes real SQL reads/writes on the migrated schema so all payment-service workflows, locks, and SQLite
 * integrity checks run against a real isolated SQLite database without touching live ./nori.db.
 */
function createSqlitePayloadHarness(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  let simulateNextPaymentUpdateError = false

  function evalWhere(row, where) {
    if (!where || typeof where !== 'object') return true
    if (Array.isArray(where.and)) {
      return where.and.every((cond) => evalWhere(row, cond))
    }
    if (Array.isArray(where.or)) {
      return where.or.some((cond) => evalWhere(row, cond))
    }
    for (const [field, expr] of Object.entries(where)) {
      if (field === 'and' || field === 'or') continue
      const val = row[field]
      if (expr && typeof expr === 'object') {
        if ('equals' in expr && String(val ?? '') !== String(expr.equals ?? '')) return false
        if ('not_equals' in expr && String(val ?? '') === String(expr.not_equals ?? ''))
          return false
        if (
          'in' in expr &&
          Array.isArray(expr.in) &&
          !expr.in.map(String).includes(String(val ?? ''))
        ) {
          return false
        }
      }
    }
    return true
  }

  function rowToBooking(r) {
    if (!r) return null
    const statusHistory = db
      .prepare(
        'SELECT status, changed_at as changedAt, changed_by as changedBy, note FROM bookings_status_history WHERE _parent_id = ? ORDER BY _order ASC',
      )
      .all(r.id)
    return {
      id: r.id,
      bookingKey: r.booking_key,
      revision: r.revision ?? 1,
      customer: r.customer_id,
      vehicle: r.vehicle_id,
      vehicleNameSnapshot: r.vehicle_name_snapshot,
      vehicleReferenceSnapshot: r.vehicle_reference_snapshot,
      startDate: r.start_date,
      endDate: r.end_date,
      pickupTime: r.pickup_time,
      returnTime: r.return_time,
      totalDays: r.total_days,
      dailyPriceSnapshot: r.daily_price_snapshot,
      baseRentPrice: r.base_rent_price,
      weekendSurchargeTotal: r.weekend_surcharge_total,
      deliveryFeeSnapshot: r.delivery_fee_snapshot,
      addonFeeTotal: r.addon_fee_total,
      discountAmount: r.discount_amount,
      promoCode: r.promo_code,
      promoDiscountAmount: r.promo_discount_amount,
      totalPrice: r.total_price,
      depositSnapshot: r.deposit_snapshot,
      initialPaymentDue: r.initial_payment_due,
      remainingAmount: r.remaining_amount,
      extraFee: r.extra_fee ?? 0,
      extraFeeNote: r.extra_fee_note,
      status: r.status,
      statusHistory,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  }

  function rowToPayment(r) {
    if (!r) return null
    return {
      id: r.id,
      reference: r.reference,
      booking: r.booking_id,
      customer: r.customer_id,
      paymentType: r.payment_type,
      method: r.method,
      provider: r.provider,
      environment: r.environment,
      currency: r.currency ?? 'VND',
      amount: r.amount,
      expectedAmount: r.expected_amount ?? r.amount,
      receivedAmount: r.received_amount ?? 0,
      refundedAmount: r.refunded_amount ?? 0,
      overpaidAmount: r.overpaid_amount ?? 0,
      status: r.status,
      reconciliationStatus: r.reconciliation_status ?? 'NONE',
      providerTransactionId: r.provider_transaction_id,
      providerPaymentRef: r.provider_payment_ref,
      qrImageUrl: r.qr_image_url,
      paymentUrl: r.payment_url,
      bankCode: r.bank_code,
      bankAccountNumber: r.bank_account_number,
      bankAccountName: r.bank_account_name,
      transferContent: r.transfer_content,
      expiresAt: r.expires_at,
      idempotencyKey: r.idempotency_key,
      verifiedAt: r.verified_at,
      paidAt: r.paid_at,
      recordedBy: r.recorded_by,
      failureReason: r.failure_reason,
      reconciliationNote: r.reconciliation_note,
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  }

  function rowToEvent(r) {
    if (!r) return null
    return {
      id: r.id,
      eventId: r.event_id,
      provider: r.provider,
      environment: r.environment,
      payment: r.payment_id,
      booking: r.booking_id,
      externalTransactionId: r.external_transaction_id,
      paymentReference: r.payment_reference,
      eventType: r.event_type,
      transferAmount: r.transfer_amount,
      verificationResult: r.verification_result,
      processingStatus: r.processing_status,
      sanitizedPayload: r.sanitized_payload,
      errorReason: r.error_reason,
      retryCount: r.retry_count ?? 0,
      receivedAt: r.received_at,
      processedAt: r.processed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  }

  function rowToRefund(r) {
    if (!r) return null
    return {
      id: r.id,
      reference: r.reference,
      payment: r.payment_id,
      booking: r.booking_id,
      customer: r.customer_id,
      refundType: r.refund_type,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      provider: r.provider,
      providerRefundId: r.provider_refund_id,
      requestedBy: r.requested_by,
      requestedByType: r.requested_by_type,
      approvedBy: r.approved_by,
      completedBy: r.completed_by,
      requestedAt: r.requested_at,
      approvedAt: r.approved_at,
      completedAt: r.completed_at,
      reconciliationNote: r.reconciliation_note,
      bankAccountInfo: r.bank_account_info,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  }

  function getAllDocs(collection) {
    if (collection === 'bookings') {
      return db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(rowToBooking)
    }
    if (collection === 'payments') {
      return db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all().map(rowToPayment)
    }
    if (collection === 'payment-events') {
      return db
        .prepare('SELECT * FROM payment_events ORDER BY created_at DESC')
        .all()
        .map(rowToEvent)
    }
    if (collection === 'refunds') {
      return db.prepare('SELECT * FROM refunds ORDER BY created_at DESC').all().map(rowToRefund)
    }
    if (collection === 'notifications') {
      return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all()
    }
    if (collection === 'audit-logs') {
      return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC').all()
    }
    return []
  }

  return {
    db,
    injectNextPaymentUpdateFailure() {
      simulateNextPaymentUpdateError = true
    },
    async findGlobal({ slug }) {
      if (slug === 'nori-site') {
        const r = db.prepare('SELECT * FROM nori_site LIMIT 1').get() || {}
        return {
          onlinePaymentEnabled: r.online_payment_enabled !== 0,
          activePaymentProvider: r.active_payment_provider ?? 'MOCK',
          allowSepayQr: r.allow_sepay_qr !== 0,
          allowManualBankTransfer: r.allow_manual_bank_transfer !== 0,
          allowCashOnHandover: r.allow_cash_on_handover !== 0,
          allowFullPaymentOnline: r.allow_full_payment_online !== 0,
          reservationDepositPolicyMode: r.reservation_deposit_policy_mode ?? 'PERCENT_OF_RENTAL',
          reservationDepositPercent: r.reservation_deposit_percent ?? 30,
          paymentExpiryMinutes: r.payment_expiry_minutes ?? 30,
          requireDepositBeforeHandover: r.require_deposit_before_handover !== 0,
          requireSettlementBeforeComplete: Boolean(r.require_settlement_before_complete),
          bankName: r.bank_name ?? 'Vietcombank',
          bankCode: r.bank_code ?? 'VCB',
          bankAccountNumber: r.bank_account_number ?? '1017588888',
          bankAccountHolder: r.bank_account_holder ?? 'CONG TY TNHH DICH VU PHUONG TIEN NORI',
        }
      }
      return {}
    },
    async findByID({ collection, id }) {
      const docs = getAllDocs(collection)
      const found = docs.find((d) => String(d.id) === String(id))
      if (!found) throw new Error(`Not found in ${collection}: ${id}`)
      return found
    },
    async find({ collection, where, limit = 100 }) {
      const all = getAllDocs(collection)
      const filtered = all.filter((doc) => evalWhere(doc, where)).slice(0, limit)
      return {
        docs: filtered,
        totalDocs: filtered.length,
        page: 1,
        totalPages: 1,
      }
    },
    async create({ collection, data }) {
      const now = new Date().toISOString()
      const id = data.id || crypto.randomUUID()
      if (collection === 'payments') {
        const ref =
          data.reference ||
          `PAY-${now.slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
        db.prepare(
          `INSERT INTO payments (
            id, reference, booking_id, customer_id, payment_type, method, provider, environment, currency,
            amount, expected_amount, received_amount, refunded_amount, overpaid_amount,
            status, reconciliation_status, provider_transaction_id, provider_payment_ref,
            qr_image_url, payment_url, bank_code, bank_account_number, bank_account_name,
            transfer_content, expires_at, idempotency_key, verified_at, paid_at, recorded_by,
            failure_reason, reconciliation_note, note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          ref,
          data.booking ?? null,
          data.customer ?? null,
          data.paymentType,
          data.method,
          data.provider ?? 'MOCK',
          data.environment ?? 'MOCK',
          data.currency ?? 'VND',
          data.amount,
          data.expectedAmount ?? data.amount,
          data.receivedAmount ?? 0,
          data.refundedAmount ?? 0,
          data.overpaidAmount ?? 0,
          data.status ?? 'PENDING',
          data.reconciliationStatus ?? 'NONE',
          data.providerTransactionId ?? null,
          data.providerPaymentRef ?? null,
          data.qrImageUrl ?? null,
          data.paymentUrl ?? null,
          data.bankCode ?? null,
          data.bankAccountNumber ?? null,
          data.bankAccountName ?? null,
          data.transferContent ?? null,
          data.expiresAt ?? null,
          data.idempotencyKey ?? null,
          data.verifiedAt ?? null,
          data.paidAt ?? null,
          data.recordedBy ?? null,
          data.failureReason ?? null,
          data.reconciliationNote ?? null,
          data.note ?? null,
          now,
          now,
        )
        return this.findByID({ collection: 'payments', id })
      }
      if (collection === 'payment-events') {
        db.prepare(
          `INSERT INTO payment_events (
            id, event_id, provider, environment, payment_id, booking_id,
            external_transaction_id, payment_reference, event_type,
            transfer_amount, verification_result, processing_status,
            sanitized_payload, error_reason, retry_count,
            received_at, processed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          data.eventId,
          data.provider,
          data.environment ?? 'MOCK',
          data.payment ?? null,
          data.booking ?? null,
          data.externalTransactionId ?? null,
          data.paymentReference ?? null,
          data.eventType ?? 'TRANSFER_IN',
          data.transferAmount ?? 0,
          data.verificationResult,
          data.processingStatus,
          data.sanitizedPayload ?? null,
          data.errorReason ?? null,
          data.retryCount ?? 0,
          data.receivedAt ?? now,
          data.processedAt ?? null,
          now,
          now,
        )
        return this.findByID({ collection: 'payment-events', id })
      }
      if (collection === 'refunds') {
        const ref =
          data.reference ||
          `RFD-${now.slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
        db.prepare(
          `INSERT INTO refunds (
            id, reference, payment_id, booking_id, customer_id, refund_type, amount, reason,
            status, provider, provider_refund_id,
            requested_by, requested_by_type, approved_by, completed_by, requested_at, approved_at, completed_at,
            reconciliation_note, bank_account_info, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          ref,
          data.payment ?? null,
          data.booking,
          data.customer ?? null,
          data.refundType ?? 'PARTIAL_ADJUSTMENT',
          data.amount,
          data.reason,
          data.status ?? 'REQUESTED',
          data.provider ?? 'MANUAL',
          data.providerRefundId ?? null,
          data.requestedBy ?? null,
          data.requestedByType ?? 'ADMIN',
          data.approvedBy ?? null,
          data.completedBy ?? null,
          data.requestedAt ?? now,
          data.approvedAt ?? null,
          data.completedAt ?? null,
          data.reconciliationNote ?? null,
          data.bankAccountInfo ?? null,
          now,
          now,
        )
        return this.findByID({ collection: 'refunds', id })
      }
      if (collection === 'notifications') {
        db.prepare(
          `INSERT INTO notifications (
            id, customer_id, booking_id, type, title, message, booking_key_snapshot,
            booking_status_snapshot, vehicle_name_snapshot, payment_confirmed,
            is_read, popup_dismissed, superseded, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
        ).run(
          id,
          data.customer,
          data.booking ?? null,
          data.type,
          data.title,
          data.message,
          data.bookingKeySnapshot ?? null,
          data.bookingStatusSnapshot ?? null,
          data.vehicleNameSnapshot ?? null,
          data.paymentConfirmed ? 1 : 0,
          now,
          now,
        )
        return { id, ...data }
      }
      if (collection === 'audit-logs') {
        db.prepare(
          `INSERT INTO audit_logs (
            id, action, entity, entity_id, entity_label, summary, from_status, to_status,
            actor_type, actor_email, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          data.action,
          data.entity,
          data.entityId ?? null,
          data.entityLabel ?? null,
          data.summary,
          data.fromStatus ?? null,
          data.toStatus ?? null,
          data.actorType ?? 'SYSTEM',
          data.actorEmail ?? null,
          now,
          now,
        )
        return { id, ...data }
      }
      throw new Error(`Unsupported create collection in harness: ${collection}`)
    },
    async update({ collection, id, data }) {
      const now = new Date().toISOString()
      if (collection === 'payments') {
        if (simulateNextPaymentUpdateError) {
          simulateNextPaymentUpdateError = false
          throw new Error('SIMULATED_DB_WRITE_FAILURE_MID_TRANSACTION')
        }
        const curr = await this.findByID({ collection: 'payments', id })
        const next = { ...curr, ...data }
        db.prepare(
          `UPDATE payments SET
            status = ?, reconciliation_status = ?, amount = ?, expected_amount = ?,
            received_amount = ?, refunded_amount = ?, overpaid_amount = ?,
            provider_transaction_id = ?, provider_payment_ref = ?, qr_image_url = ?,
            transfer_content = ?, expires_at = ?, verified_at = ?, paid_at = ?,
            recorded_by = ?, failure_reason = ?, reconciliation_note = ?, note = ?,
            updated_at = ?
          WHERE id = ?`,
        ).run(
          next.status,
          next.reconciliationStatus ?? 'NONE',
          next.amount,
          next.expectedAmount ?? next.amount,
          next.receivedAmount ?? 0,
          next.refundedAmount ?? 0,
          next.overpaidAmount ?? 0,
          next.providerTransactionId ?? null,
          next.providerPaymentRef ?? null,
          next.qrImageUrl ?? null,
          next.transferContent ?? null,
          next.expiresAt ?? null,
          next.verifiedAt ?? null,
          next.paidAt ?? null,
          next.recordedBy ?? null,
          next.failureReason ?? null,
          next.reconciliationNote ?? null,
          next.note ?? null,
          now,
          id,
        )
        return this.findByID({ collection: 'payments', id })
      }
      if (collection === 'payment-events') {
        const curr = await this.findByID({ collection: 'payment-events', id })
        const next = { ...curr, ...data }
        db.prepare(
          `UPDATE payment_events SET
            payment_id = ?, booking_id = ?, verification_result = ?, processing_status = ?,
            error_reason = ?, retry_count = ?, processed_at = ?, updated_at = ?
          WHERE id = ?`,
        ).run(
          next.payment ?? null,
          next.booking ?? null,
          next.verificationResult,
          next.processingStatus,
          next.errorReason ?? null,
          next.retryCount ?? 1,
          next.processedAt ?? null,
          now,
          id,
        )
        return this.findByID({ collection: 'payment-events', id })
      }
      if (collection === 'refunds') {
        const curr = await this.findByID({ collection: 'refunds', id })
        const next = { ...curr, ...data }
        db.prepare(
          `UPDATE refunds SET
            status = ?, provider_refund_id = ?, approved_by = ?, completed_by = ?,
            approved_at = ?, completed_at = ?, reconciliation_note = ?, updated_at = ?
          WHERE id = ?`,
        ).run(
          next.status,
          next.providerRefundId ?? null,
          next.approvedBy ?? null,
          next.completedBy ?? null,
          next.approvedAt ?? null,
          next.completedAt ?? null,
          next.reconciliationNote ?? null,
          now,
          id,
        )
        return this.findByID({ collection: 'refunds', id })
      }
      if (collection === 'bookings') {
        const curr = await this.findByID({ collection: 'bookings', id })
        const next = { ...curr, ...data }
        db.prepare(
          `UPDATE bookings SET
            status = ?, remaining_amount = ?, extra_fee = ?, extra_fee_note = ?, updated_at = ?
          WHERE id = ?`,
        ).run(
          next.status,
          next.remainingAmount ?? curr.remainingAmount,
          next.extraFee ?? curr.extraFee ?? 0,
          next.extraFeeNote ?? curr.extraFeeNote ?? null,
          now,
          id,
        )
        if (Array.isArray(data.statusHistory)) {
          db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(id)
          data.statusHistory.forEach((h, idx) => {
            db.prepare(
              `INSERT INTO bookings_status_history (_order, _parent_id, id, status, changed_at, changed_by, note)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              idx + 1,
              id,
              crypto.randomUUID(),
              h.status,
              h.changedAt ?? now,
              h.changedBy ?? null,
              h.note ?? null,
            )
          })
        }
        return this.findByID({ collection: 'bookings', id })
      }
      throw new Error(`Unsupported update collection in harness: ${collection}`)
    },
  }
}

describe('NORI Online Payment Integration, Webhook, Reconciliation, Refund, Concurrency & Fault Recovery Suite (PAY-001 .. PAY-050)', () => {
  const projectRoot = process.cwd()
  const liveDbPath = path.resolve(projectRoot, 'nori.db')
  let liveDbChecksumBefore = ''
  let tmpDir = ''
  let isolatedDbPath = ''
  let payload = null

  let customerA = null
  let customerB = null
  let adminUser = null
  let operatorNoPaymentUpdate = null
  let vehicleId = ''

  before(() => {
    if (fs.existsSync(liveDbPath)) {
      liveDbChecksumBefore = sha256File(liveDbPath)
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-payment-int-test-'))
    isolatedDbPath = path.join(tmpDir, 'nori-payment-test.db')

    const mig = runDatabaseMigration({
      rootDir: projectRoot,
      dbPath: isolatedDbPath,
    })
    assert.equal(mig.ok, true)
    assert.equal(mig.integrity, 'ok')
    assert.equal(mig.fkViolations, 0)

    payload = createSqlitePayloadHarness(isolatedDbPath)
    const now = new Date().toISOString()

    // Seed isolated test actors & vehicle
    customerA = {
      id: crypto.randomUUID(),
      collection: 'users',
      email: 'customer.a@payment.test',
      fullName: 'Nguyễn Văn A',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    }
    customerB = {
      id: crypto.randomUUID(),
      collection: 'users',
      email: 'customer.b@payment.test',
      fullName: 'Trần Thị B',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    }
    adminUser = {
      id: crypto.randomUUID(),
      collection: 'admins',
      email: 'superadmin@nori.vn',
      fullName: 'Quản trị viên Tài chính',
      adminRole: 'SUPER_ADMIN',
    }
    operatorNoPaymentUpdate = {
      id: crypto.randomUUID(),
      collection: 'admins',
      email: 'viewer.op@nori.vn',
      fullName: 'Nhân viên Chỉ Xem',
      adminRole: 'OPERATOR',
      permissions: { payments: ['read'], bookings: ['read'] },
    }

    for (const u of [customerA, customerB]) {
      payload.db
        .prepare(
          `INSERT INTO users (id, full_name, email, phone, role, status, salt, hash, created_at, updated_at)
           VALUES (?, ?, ?, '0901234567', 'CUSTOMER', 'ACTIVE', 's', 'h', ?, ?)`,
        )
        .run(u.id, u.fullName, u.email, now, now)
    }

    const modelId = crypto.randomUUID()
    vehicleId = crypto.randomUUID()
    payload.db
      .prepare(
        `INSERT INTO vehicle_models (id, name, slug, brand, category, seats, visible, created_at, updated_at)
         VALUES (?, 'Toyota Fortuner Legender', 'toyota-fortuner', 'Toyota', 'CAR', 7, 1, ?, ?)`,
      )
      .run(modelId, now, now)
    payload.db
      .prepare(
        `INSERT INTO vehicles (id, reference, model_id, license_plate, intent, is_demo, vehicle_condition_type, price_per_day, deposit_amount, operation_status, status, created_at, updated_at)
         VALUES (?, 'NR-OT-FTN01', ?, '51K-88899', 'RENT', 1, 'NEW', 1000000, 5000000, 'READY', 'ACTIVE', ?, ?)`,
      )
      .run(vehicleId, modelId, now, now)
    payload.db
      .prepare(
        `INSERT INTO nori_site (id, online_payment_enabled, active_payment_provider, reservation_deposit_policy_mode, reservation_deposit_percent, payment_expiry_minutes, bank_name, bank_code, bank_account_number, bank_account_holder)
         VALUES (1, 1, 'MOCK', 'PERCENT_OF_RENTAL', 30, 30, 'Vietcombank', 'VCB', '1017588888', 'CONG TY TNHH DICH VU PHUONG TIEN NORI')`,
      )
      .run()
  })

  after(() => {
    try {
      payload?.db?.close()
    } catch {
      // ignore
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore Windows temp lock delay
      }
    }
  })

  function insertBooking({
    customerId = customerA.id,
    status = 'PENDING',
    baseRentPrice = 3_000_000,
    promoCode = 'NORIXINCAMON',
    promoDiscountAmount = 300_000,
    totalPrice = 2_700_000,
    depositSnapshot = 5_000_000,
    initialPaymentDue = 810_000,
    extraFee = 0,
  } = {}) {
    const id = crypto.randomUUID()
    const bookingKey = `NR-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
    const now = new Date().toISOString()
    payload.db
      .prepare(
        `INSERT INTO bookings (
          id, booking_key, revision, customer_id, vehicle_id, vehicle_name_snapshot, vehicle_reference_snapshot,
          start_date, end_date, pickup_time, return_time, total_days, daily_price_snapshot,
          base_rent_price, weekend_surcharge_total, delivery_fee_snapshot, addon_fee_total,
          discount_amount, promo_code, promo_discount_amount, total_price, deposit_snapshot,
          initial_payment_due, remaining_amount, extra_fee, status, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, 'Toyota Fortuner Legender', 'NR-OT-FTN01', '2026-12-10', '2026-12-13', '08:00', '20:00', 3, 1000000, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        bookingKey,
        customerId,
        vehicleId,
        baseRentPrice,
        promoCode,
        promoDiscountAmount,
        totalPrice,
        depositSnapshot,
        initialPaymentDue,
        totalPrice,
        extraFee,
        status,
        now,
        now,
      )
    return { id, bookingKey }
  }

  it('PAY-001, PAY-002, PAY-003, PAY-004, PAY-006, PAY-007, PAY-009, PAY-010, PAY-023: Booking status gates, idempotent creation, promo preservation, client amount tamper resistance, expiry sweep, and customer cancel', async () => {
    const b = insertBooking({ status: 'PENDING' })

    // PAY-001: Cannot create online payment while booking is PENDING
    await assert.rejects(
      () =>
        createOrReuseCustomerPayment({
          payload,
          user: customerA,
          bookingId: b.id,
          paymentType: 'DEPOSIT',
        }),
      (err) => err.status === 409,
    )

    // Admin approves booking -> DEPOSIT_PENDING (PAY-002)
    await payload.update({
      collection: 'bookings',
      id: b.id,
      data: { status: 'DEPOSIT_PENDING' },
    })

    // PAY-006: Customer B cannot create payment on Customer A's booking
    await assert.rejects(
      () =>
        createOrReuseCustomerPayment({
          payload,
          user: customerB,
          bookingId: b.id,
          paymentType: 'DEPOSIT',
        }),
      (err) => err.status === 403,
    )

    // PAY-003 & PAY-023: Customer A creates DEPOSIT payment -> server calculates 30% of 2,700,000 (after 300k promo) = 810,000 VND
    // Note: createOrReuseCustomerPayment does not even accept a client amount parameter (PAY-044 tamper proof)
    const created1 = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'DEPOSIT',
    })
    assert.equal(created1.reused, false)
    assert.equal(created1.payment.status, 'PENDING')
    assert.equal(created1.payment.expectedAmount, 810_000)
    assert.equal(created1.payment.amount, 810_000)
    assert.ok(created1.payment.providerPaymentRef.startsWith('NORIPAY'))
    assert.ok(created1.payment.qrImageUrl)
    assert.ok(created1.payment.qrImageUrl.startsWith('data:image/svg+xml'))

    // PAY-007: Re-clicking create payment reuses the active PENDING payment instead of creating duplicates
    const created2 = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'DEPOSIT',
    })
    assert.equal(created2.reused, true)
    assert.equal(created2.payment.id, created1.payment.id)

    // PAY-009: When expiresAt passes, sweepExpiredPayments transitions PENDING -> EXPIRED
    await payload.update({
      collection: 'payments',
      id: created1.payment.id,
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    })
    const swept = await sweepExpiredPayments(payload, { bookingId: b.id })
    assert.equal(swept, 1)
    const afterSweep = await payload.findByID({ collection: 'payments', id: created1.payment.id })
    assert.equal(afterSweep.status, 'EXPIRED')

    // PAY-010: After expiry, customer can create a fresh payment request
    const retried = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'DEPOSIT',
    })
    assert.equal(retried.reused, false)
    assert.notEqual(retried.payment.id, created1.payment.id)
    assert.equal(retried.payment.status, 'PENDING')

    // PAY-004: Closed booking (CANCELLED / REJECTED) rejects payment creation
    const cancelledBooking = insertBooking({ status: 'CANCELLED' })
    await assert.rejects(
      () =>
        createOrReuseCustomerPayment({
          payload,
          user: customerA,
          bookingId: cancelledBooking.id,
          paymentType: 'DEPOSIT',
        }),
      (err) => err.status === 409,
    )
  })

  it('PAY-011, PAY-012, PAY-013, PAY-014, PAY-015, PAY-016: Webhook authentication, valid confirmation, idempotency on 5x replay, stale event protection, and unmatched reference logging', async () => {
    const b = insertBooking({ status: 'DEPOSIT_PENDING' })
    const session = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'DEPOSIT',
    })
    const payRef = session.payment.providerPaymentRef

    // PAY-011 & PAY-012: Webhook with missing or wrong secret is rejected (401) and logged as FAILED_SIGNATURE
    const prevSecret = process.env.SEPAY_WEBHOOK_SECRET
    process.env.SEPAY_WEBHOOK_SECRET = 'nori-webhook-test-secret-2026'
    try {
      const forgedBody = JSON.stringify({
        id: 100001,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: payRef,
        content: `Chuyen khoan ${payRef}`,
        transferType: 'in',
        transferAmount: 810_000,
        referenceCode: 'VCB.FORGED.001',
      })
      const forgedRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: new Headers({ authorization: 'Apikey wrong-forged-key' }),
        rawBody: forgedBody,
        parsedBody: JSON.parse(forgedBody),
      })
      assert.equal(forgedRes.httpStatus, 401)
      assert.equal(forgedRes.body.success, false)

      // Payment must still be PENDING
      const checkPay = await payload.findByID({ collection: 'payments', id: session.payment.id })
      assert.equal(checkPay.status, 'PENDING')

      // PAY-013: Valid authenticated webhook confirms DEPOSIT payment and transitions booking DEPOSIT_PENDING -> CONFIRMED
      const validBody = JSON.stringify({
        id: 100002,
        gateway: 'Vietcombank',
        transactionDate: '2026-11-20 15:00:00',
        accountNumber: '1017588888',
        code: payRef,
        content: `Chuyen khoan ${payRef}`,
        transferType: 'in',
        transferAmount: 810_000,
        referenceCode: 'VCB.VALID.100002',
      })
      const validHeaders = new Headers({
        authorization: 'Apikey nori-webhook-test-secret-2026',
      })
      const okRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: validHeaders,
        rawBody: validBody,
        parsedBody: JSON.parse(validBody),
      })
      assert.equal(okRes.httpStatus, 200)
      assert.equal(okRes.body.success, true)
      assert.notEqual(okRes.body.duplicate, true)
      assert.equal(okRes.body.status, 'CONFIRMED')
      assert.equal(okRes.body.bookingTransitionedTo, 'CONFIRMED')

      // PAY-014: Replaying the exact same webhook 5 times is idempotent (duplicate: true) and never double-counts receivedAmount
      for (let i = 0; i < 5; i++) {
        const dupRes = await processProviderWebhook({
          payload,
          providerName: 'SEPAY',
          headers: validHeaders,
          rawBody: validBody,
          parsedBody: JSON.parse(validBody),
        })
        assert.equal(dupRes.httpStatus, 200)
        assert.equal(dupRes.body.duplicate, true)
      }

      const confirmedPay = await payload.findByID({
        collection: 'payments',
        id: session.payment.id,
      })
      assert.equal(confirmedPay.status, 'CONFIRMED')
      assert.equal(confirmedPay.receivedAmount, 810_000)

      // PAY-016: Webhook with unknown reference is recorded safely in payment_events without crashing
      const unmatchedBody = JSON.stringify({
        id: 100003,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: 'NORIPAYGHOST999999',
        content: 'Chuyen khoan NORIPAYGHOST999999',
        transferType: 'in',
        transferAmount: 500_000,
        referenceCode: 'VCB.UNMATCHED.003',
      })
      const unmatchedRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: validHeaders,
        rawBody: unmatchedBody,
        parsedBody: JSON.parse(unmatchedBody),
      })
      assert.equal(unmatchedRes.httpStatus, 200)
      assert.equal(unmatchedRes.body.status, 'REVIEW_REQUIRED')
      assert.equal(unmatchedRes.body.reconciliationStatus, 'UNMATCHED')
    } finally {
      if (prevSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET
      else process.env.SEPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('PAY-017, PAY-018, PAY-019, PAY-020: Underpaid, Overpaid, Late Expired Webhook, and Cancelled Booking Webhook edge cases', async () => {
    const prevSecret = process.env.SEPAY_WEBHOOK_SECRET
    process.env.SEPAY_WEBHOOK_SECRET = 'nori-edge-secret'
    const authHeaders = new Headers({ authorization: 'Apikey nori-edge-secret' })

    try {
      // 1. PAY-017: Underpaid transfer (500,000 instead of 810,000) -> PARTIALLY_PAID + UNDERPAID, booking stays DEPOSIT_PENDING
      const bUnder = insertBooking({ status: 'DEPOSIT_PENDING' })
      const sUnder = await createOrReuseCustomerPayment({
        payload,
        user: customerA,
        bookingId: bUnder.id,
        paymentType: 'DEPOSIT',
      })
      const underPayload = {
        id: 200001,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: sUnder.payment.providerPaymentRef,
        content: sUnder.payment.providerPaymentRef,
        transferType: 'in',
        transferAmount: 500_000,
        referenceCode: 'VCB.UNDER.001',
      }
      const underRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: authHeaders,
        rawBody: JSON.stringify(underPayload),
        parsedBody: underPayload,
      })
      assert.equal(underRes.httpStatus, 200)
      assert.equal(underRes.body.status, 'PARTIALLY_PAID')
      assert.equal(underRes.body.reconciliationStatus, 'UNDERPAID')
      const bUnderAfter = await payload.findByID({ collection: 'bookings', id: bUnder.id })
      assert.equal(bUnderAfter.status, 'DEPOSIT_PENDING')

      // 2. PAY-018: Overpaid transfer (1,000,000 instead of 810,000) -> CONFIRMED + OVERPAID (overpaidAmount = 190,000)
      const bOver = insertBooking({ status: 'DEPOSIT_PENDING' })
      const sOver = await createOrReuseCustomerPayment({
        payload,
        user: customerA,
        bookingId: bOver.id,
        paymentType: 'DEPOSIT',
      })
      const overPayload = {
        id: 200002,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: sOver.payment.providerPaymentRef,
        content: sOver.payment.providerPaymentRef,
        transferType: 'in',
        transferAmount: 1_000_000,
        referenceCode: 'VCB.OVER.002',
      }
      const overRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: authHeaders,
        rawBody: JSON.stringify(overPayload),
        parsedBody: overPayload,
      })
      assert.equal(overRes.httpStatus, 200)
      assert.equal(overRes.body.status, 'CONFIRMED')
      assert.equal(overRes.body.reconciliationStatus, 'OVERPAID')
      const pOverAfter = await payload.findByID({
        collection: 'payments',
        id: sOver.payment.id,
      })
      assert.equal(pOverAfter.overpaidAmount, 190_000)

      // 3. PAY-019: Webhook arriving after payment expired -> REVIEW_REQUIRED + LATE_PAYMENT
      const bLate = insertBooking({ status: 'DEPOSIT_PENDING' })
      const sLate = await createOrReuseCustomerPayment({
        payload,
        user: customerA,
        bookingId: bLate.id,
        paymentType: 'DEPOSIT',
      })
      await payload.update({
        collection: 'payments',
        id: sLate.payment.id,
        data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 120_000).toISOString() },
      })
      const latePayload = {
        id: 200003,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: sLate.payment.providerPaymentRef,
        content: sLate.payment.providerPaymentRef,
        transferType: 'in',
        transferAmount: 810_000,
        referenceCode: 'VCB.LATE.003',
      }
      const lateRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: authHeaders,
        rawBody: JSON.stringify(latePayload),
        parsedBody: latePayload,
      })
      assert.equal(lateRes.httpStatus, 200)
      assert.equal(lateRes.body.status, 'REVIEW_REQUIRED')
      assert.equal(lateRes.body.reconciliationStatus, 'LATE_PAYMENT')

      // 4. PAY-020: Webhook arriving after booking was CANCELLED -> REVIEW_REQUIRED + LATE_PAYMENT, booking remains CANCELLED
      const bCanc = insertBooking({ status: 'DEPOSIT_PENDING' })
      const sCanc = await createOrReuseCustomerPayment({
        payload,
        user: customerA,
        bookingId: bCanc.id,
        paymentType: 'DEPOSIT',
      })
      await payload.update({
        collection: 'bookings',
        id: bCanc.id,
        data: { status: 'CANCELLED' },
      })
      const cancPayload = {
        id: 200004,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: sCanc.payment.providerPaymentRef,
        content: sCanc.payment.providerPaymentRef,
        transferType: 'in',
        transferAmount: 810_000,
        referenceCode: 'VCB.CANC.004',
      }
      const cancRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: authHeaders,
        rawBody: JSON.stringify(cancPayload),
        parsedBody: cancPayload,
      })
      assert.equal(cancRes.httpStatus, 200)
      assert.equal(cancRes.body.status, 'REVIEW_REQUIRED')
      assert.equal(cancRes.body.reconciliationStatus, 'LATE_PAYMENT')
      const bCancCheck = await payload.findByID({ collection: 'bookings', id: bCanc.id })
      assert.equal(bCancCheck.status, 'CANCELLED')
    } finally {
      if (prevSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET
      else process.env.SEPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('PAY-021, PAY-022, PAY-024, PAY-025, PAY-026, PAY-027, PAY-028, PAY-029, PAY-030, PAY-031: Remaining rental, extra fee, manual admin confirmation with reason, RBAC, and full/partial refunds', async () => {
    const b = insertBooking({ status: 'CONFIRMED', extraFee: 200_000 })

    // PAY-025 & PAY-026: Admin manual confirmation requires reason and transactionEvidence
    const depSession = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'DEPOSIT',
    })

    // Missing reason rejected (400)
    await assert.rejects(
      () =>
        confirmPaymentManuallyByAdmin({
          payload,
          admin: { id: adminUser.id, email: adminUser.email },
          paymentId: depSession.payment.id,
          receivedAmount: 810_000,
          transactionEvidence: 'VCB-001',
          reason: '   ',
        }),
      (err) => err.status === 400,
    )

    // Missing transactionEvidence rejected (400)
    await assert.rejects(
      () =>
        confirmPaymentManuallyByAdmin({
          payload,
          admin: { id: adminUser.id, email: adminUser.email },
          paymentId: depSession.payment.id,
          receivedAmount: 810_000,
          transactionEvidence: '',
          reason: 'Có lý do nhưng thiếu mã chứng từ',
        }),
      (err) => err.status === 400,
    )

    // Admin confirm with valid reason and transactionEvidence succeeds
    const manualDep = await confirmPaymentManuallyByAdmin({
      payload,
      admin: { id: adminUser.id, email: adminUser.email },
      paymentId: depSession.payment.id,
      receivedAmount: 810_000,
      transactionEvidence: 'VCB-MANUAL-810K',
      reason: 'Đã đối chiếu sao kê Vietcombank ngày 20/11/2026',
    })
    assert.equal(manualDep.payment.status, 'CONFIRMED')
    const afterDepFin = await computeBookingFinancialsFromDb(
      payload,
      await payload.findByID({ collection: 'bookings', id: b.id }),
    )
    assert.equal(afterDepFin.financial.paidDepositAmount, 810_000)
    assert.equal(afterDepFin.financial.remainingRentalBeforeExtra, 1_890_000)
    assert.equal(afterDepFin.financial.remainingExtraFeeDue, 200_000)
    assert.equal(afterDepFin.financial.totalRemainingRentalObligation, 2_090_000)

    // PAY-021: Pay remaining rental fee (1,890,000 VND)
    const remSession = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'RENTAL_FEE',
    })
    assert.equal(remSession.payment.expectedAmount, 1_890_000)

    await confirmPaymentManuallyByAdmin({
      payload,
      admin: { id: adminUser.id, email: adminUser.email },
      paymentId: remSession.payment.id,
      receivedAmount: 1_890_000,
      transactionEvidence: 'VCB-MANUAL-1890K',
      reason: 'Khách thanh toán phần tiền thuê còn lại tại quầy',
    })

    // PAY-024: Pay extra fee separately (200,000 VND) -> total 2,900,000 VND -> FULLY_PAID
    const extraSession = await createOrReuseCustomerPayment({
      payload,
      user: customerA,
      bookingId: b.id,
      paymentType: 'EXTRA_FEE',
    })
    assert.equal(extraSession.payment.expectedAmount, 200_000)
    await confirmPaymentManuallyByAdmin({
      payload,
      admin: { id: adminUser.id, email: adminUser.email },
      paymentId: extraSession.payment.id,
      receivedAmount: 200_000,
      transactionEvidence: 'VCB-MANUAL-200K',
      reason: 'Khách thanh toán phụ phí phát sinh khi trả xe',
    })

    const afterRemFin = await computeBookingFinancialsFromDb(
      payload,
      await payload.findByID({ collection: 'bookings', id: b.id }),
    )
    assert.equal(afterRemFin.financial.totalRemainingRentalObligation, 0)
    assert.equal(afterRemFin.financial.paymentStatusSummary, 'FULLY_PAID')

    // PAY-031: Operator without payments.update permission cannot issue refund (403)
    await assert.rejects(
      () =>
        createOrProcessAdminRefund({
          payload,
          admin: {
            id: operatorNoPaymentUpdate.id,
            email: operatorNoPaymentUpdate.email,
            hasPaymentUpdatePermission: false,
          },
          action: 'create',
          bookingId: b.id,
          paymentId: depSession.payment.id,
          amount: 100_000,
          reason: 'Operator try refund',
        }),
      (err) => err.status === 403,
    )

    // PAY-029: Cannot refund more than total verified received (810,000 on depSession)
    await assert.rejects(
      () =>
        createOrProcessAdminRefund({
          payload,
          admin: {
            id: adminUser.id,
            email: adminUser.email,
            hasPaymentUpdatePermission: true,
          },
          action: 'create',
          bookingId: b.id,
          paymentId: depSession.payment.id,
          amount: 3_500_000,
          reason: 'Vượt quá tổng tiền đã thu',
        }),
      (err) => err.status === 409,
    )

    // PAY-028: Partial refund of 300,000 VND (create -> complete) updates payment to PARTIALLY_REFUNDED and reduces netCollectedAmount
    const createdPartial = await createOrProcessAdminRefund({
      payload,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        hasPaymentUpdatePermission: true,
      },
      action: 'create',
      bookingId: b.id,
      paymentId: depSession.payment.id,
      amount: 300_000,
      refundType: 'PARTIAL_ADJUSTMENT',
      reason: 'Hoàn trả ưu đãi thiện chí 300.000đ',
    })

    // PAY-030: Duplicate pending refund with same amount & payment is rejected (409)
    await assert.rejects(
      () =>
        createOrProcessAdminRefund({
          payload,
          admin: {
            id: adminUser.id,
            email: adminUser.email,
            hasPaymentUpdatePermission: true,
          },
          action: 'create',
          bookingId: b.id,
          paymentId: depSession.payment.id,
          amount: 300_000,
          reason: 'Hoàn trùng lặp',
        }),
      (err) => err.status === 409,
    )

    // Complete partial refund
    const completedPartial = await createOrProcessAdminRefund({
      payload,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        hasPaymentUpdatePermission: true,
      },
      action: 'complete',
      refundId: createdPartial.refund.id,
      providerRefundId: 'VCB-REF-300K',
    })
    assert.equal(completedPartial.refund.status, 'REFUNDED')
    const finAfterPartial = await computeBookingFinancialsFromDb(
      payload,
      await payload.findByID({ collection: 'bookings', id: b.id }),
    )
    assert.equal(finAfterPartial.financial.totalRefundedAmount, 300_000)
    assert.equal(finAfterPartial.financial.netCollectedAmount, 2_600_000)

    // PAY-027: Refund remaining 510,000 VND on depSession -> transitions depSession to REFUNDED
    const createdRest = await createOrProcessAdminRefund({
      payload,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        hasPaymentUpdatePermission: true,
      },
      action: 'create',
      bookingId: b.id,
      paymentId: depSession.payment.id,
      amount: 510_000,
      refundType: 'DEPOSIT_RETURN',
      reason: 'Hoàn nốt phần tiền cọc của phiếu 1',
    })
    await createOrProcessAdminRefund({
      payload,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        hasPaymentUpdatePermission: true,
      },
      action: 'complete',
      refundId: createdRest.refund.id,
      providerRefundId: 'VCB-REF-510K',
    })
    const depAfterFullRefund = await payload.findByID({
      collection: 'payments',
      id: depSession.payment.id,
    })
    assert.equal(depAfterFullRefund.status, 'REFUNDED')
  })

  it('PAY-032, PAY-033, PAY-034, PAY-035: Concurrency & Race Conditions (each scenario repeated 3 consecutive rounds)', async () => {
    const prevSecret = process.env.SEPAY_WEBHOOK_SECRET
    process.env.SEPAY_WEBHOOK_SECRET = 'nori-concurrency-secret'
    const authHeaders = new Headers({ authorization: 'Apikey nori-concurrency-secret' })

    try {
      for (let round = 1; round <= 3; round++) {
        const b = insertBooking({ status: 'DEPOSIT_PENDING' })

        // PAY-032 (Round 1..3): 5 concurrent createOrReuseCustomerPayment calls -> all return the exact same single PENDING payment ID
        const concurrentCreates = await Promise.all(
          Array.from({ length: 5 }, () =>
            createOrReuseCustomerPayment({
              payload,
              user: customerA,
              bookingId: b.id,
              paymentType: 'DEPOSIT',
            }),
          ),
        )
        const uniquePaymentIds = new Set(concurrentCreates.map((r) => r.payment.id))
        assert.equal(
          uniquePaymentIds.size,
          1,
          `Round ${round}: Expected 1 unique PENDING payment, got ${uniquePaymentIds.size}`,
        )

        const payment = concurrentCreates[0].payment

        // PAY-033 (Round 1..3): 5 concurrent identical Webhook callbacks -> serialized by lock, 1 processed, 4 deduplicated
        const webhookPayload = {
          id: 500000 + round,
          gateway: 'Vietcombank',
          accountNumber: '1017588888',
          code: payment.providerPaymentRef,
          content: payment.providerPaymentRef,
          transferType: 'in',
          transferAmount: 810_000,
          referenceCode: `VCB.CONC.${round}`,
        }
        const concurrentWebhooks = await Promise.all(
          Array.from({ length: 5 }, () =>
            processProviderWebhook({
              payload,
              providerName: 'SEPAY',
              headers: authHeaders,
              rawBody: JSON.stringify(webhookPayload),
              parsedBody: webhookPayload,
            }),
          ),
        )
        const nonDuplicates = concurrentWebhooks.filter(
          (r) => r.httpStatus === 200 && r.body.success && !r.body.duplicate,
        )
        const duplicates = concurrentWebhooks.filter(
          (r) => r.httpStatus === 200 && r.body.duplicate === true,
        )
        assert.equal(nonDuplicates.length, 1, `Round ${round}: Exactly 1 webhook should process`)
        assert.equal(duplicates.length, 4, `Round ${round}: 4 webhooks should be deduplicated`)

        // PAY-034 (Round 1..3): Concurrent Webhook + Admin Manual Confirm + Status Computation -> final state consistent
        const bRace = insertBooking({ status: 'DEPOSIT_PENDING' })
        const sRace = await createOrReuseCustomerPayment({
          payload,
          user: customerA,
          bookingId: bRace.id,
          paymentType: 'DEPOSIT',
        })
        const raceWebhookPayload = {
          id: 600000 + round,
          gateway: 'Vietcombank',
          accountNumber: '1017588888',
          code: sRace.payment.providerPaymentRef,
          content: sRace.payment.providerPaymentRef,
          transferType: 'in',
          transferAmount: 810_000,
          referenceCode: `VCB.RACE.${round}`,
        }
        await Promise.allSettled([
          processProviderWebhook({
            payload,
            providerName: 'SEPAY',
            headers: authHeaders,
            rawBody: JSON.stringify(raceWebhookPayload),
            parsedBody: raceWebhookPayload,
          }),
          confirmPaymentManuallyByAdmin({
            payload,
            admin: { id: adminUser.id, email: adminUser.email },
            paymentId: sRace.payment.id,
            receivedAmount: 810_000,
            transactionEvidence: `VCB-RACE-${round}`,
            reason: `Xác nhận đồng thời vòng ${round}`,
          }),
          computeBookingFinancialsFromDb(
            payload,
            await payload.findByID({ collection: 'bookings', id: bRace.id }),
          ),
        ])
        const finalRacePay = await payload.findByID({
          collection: 'payments',
          id: sRace.payment.id,
        })
        assert.equal(finalRacePay.status, 'CONFIRMED')
        assert.equal(finalRacePay.receivedAmount, 810_000)

        // PAY-035 (Round 1..3): Concurrent Double Full-Refund attempt -> only 1 succeeds, second rejected 409
        const refundAttempts = await Promise.allSettled([
          createOrProcessAdminRefund({
            payload,
            admin: {
              id: adminUser.id,
              email: adminUser.email,
              hasPaymentUpdatePermission: true,
            },
            action: 'create',
            bookingId: b.id,
            paymentId: payment.id,
            amount: 810_000,
            reason: `Hoàn tiền đồng thời A vòng ${round}`,
          }),
          createOrProcessAdminRefund({
            payload,
            admin: {
              id: adminUser.id,
              email: adminUser.email,
              hasPaymentUpdatePermission: true,
            },
            action: 'create',
            bookingId: b.id,
            paymentId: payment.id,
            amount: 810_000,
            reason: `Hoàn tiền đồng thời B vòng ${round}`,
          }),
        ])
        const fulfilledRefunds = refundAttempts.filter((r) => r.status === 'fulfilled')
        const rejectedRefunds = refundAttempts.filter((r) => r.status === 'rejected')
        assert.equal(fulfilledRefunds.length, 1, `Round ${round}: Only 1 full refund may succeed`)
        assert.equal(rejectedRefunds.length, 1, `Round ${round}: Second full refund must fail 409`)
      }
    } finally {
      if (prevSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET
      else process.env.SEPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('PAY-036, PAY-037, PAY-038, PAY-045, PAY-046, PAY-049, PAY-050: Fault injection & retry recovery, XSS/SQLi safety, secret redaction, backup/restore, and live nori.db isolation verification', async () => {
    const prevSecret = process.env.SEPAY_WEBHOOK_SECRET
    process.env.SEPAY_WEBHOOK_SECRET = 'nori-fault-recovery-secret'
    const authHeaders = new Headers({ authorization: 'Apikey nori-fault-recovery-secret' })

    try {
      // PAY-036 & PAY-037: Inject DB write failure mid-webhook processing -> payment stays PENDING -> retry recovers cleanly!
      const bFault = insertBooking({ status: 'DEPOSIT_PENDING' })
      const sFault = await createOrReuseCustomerPayment({
        payload,
        user: customerA,
        bookingId: bFault.id,
        paymentType: 'DEPOSIT',
      })
      const faultWebhook = {
        id: 700001,
        gateway: 'Vietcombank',
        accountNumber: '1017588888',
        code: sFault.payment.providerPaymentRef,
        content: `Chuyen khoan ${sFault.payment.providerPaymentRef} <script>alert(1)</script>' OR 1=1--`,
        transferType: 'in',
        transferAmount: 810_000,
        referenceCode: 'VCB.FAULT.700001',
        apiKey: 'SHOULD_BE_REDACTED_IN_DB',
      }

      payload.injectNextPaymentUpdateFailure()
      await assert.rejects(
        () =>
          processProviderWebhook({
            payload,
            providerName: 'SEPAY',
            headers: authHeaders,
            rawBody: JSON.stringify(faultWebhook),
            parsedBody: faultWebhook,
          }),
        /SIMULATED_DB_WRITE_FAILURE_MID_TRANSACTION/,
      )

      // Verify payment was not corrupted
      const payAfterFault = await payload.findByID({
        collection: 'payments',
        id: sFault.payment.id,
      })
      assert.equal(payAfterFault.status, 'PENDING')

      // Now provider retries the exact same webhook -> system recovers and confirms payment!
      const retryRes = await processProviderWebhook({
        payload,
        providerName: 'SEPAY',
        headers: authHeaders,
        rawBody: JSON.stringify(faultWebhook),
        parsedBody: faultWebhook,
      })
      assert.equal(retryRes.httpStatus, 200)
      assert.equal(retryRes.body.success, true)
      assert.equal(retryRes.body.status, 'CONFIRMED')

      // PAY-045 & PAY-046: Verify XSS/SQLi payload stored safely and secrets are redacted
      const events = await payload.find({
        collection: 'payment-events',
        where: { externalTransactionId: { equals: '700001' } },
      })
      assert.equal(events.docs.length, 1)
      assert.equal(events.docs[0].sanitizedPayload.includes('SHOULD_BE_REDACTED_IN_DB'), false)
      assert.equal(events.docs[0].sanitizedPayload.includes('[REDACTED]'), true)

      // PAY-049 & PAY-050: Verify isolated DB integrity and verify live ./nori.db was 100% untouched
      const integrity = payload.db.prepare('PRAGMA integrity_check').get().integrity_check
      const fkCheck = payload.db.prepare('PRAGMA foreign_key_check').all()
      assert.equal(integrity, 'ok')
      assert.equal(fkCheck.length, 0)

      if (liveDbChecksumBefore) {
        const liveDbChecksumAfter = sha256File(liveDbPath)
        assert.equal(
          liveDbChecksumAfter,
          liveDbChecksumBefore,
          'Live ./nori.db checksum must remain 100% identical after payment integration test suite',
        )
      }
    } finally {
      if (prevSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET
      else process.env.SEPAY_WEBHOOK_SECRET = prevSecret
    }
  })
})
