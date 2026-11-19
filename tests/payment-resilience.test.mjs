import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, describe, it } from 'node:test'
import { runDatabaseMigration } from '../src/lib/data-sync.ts'
import { SePayProvider } from '../src/lib/payment-providers.ts'
import {
  buildSitePaymentConfigFromDoc,
  computeBookingFinancialsSync,
  createOrReuseCustomerPayment,
  processProviderWebhook,
  sweepExpiredPayments,
} from '../src/lib/payment-service.ts'

/**
 * Isolated SQLite-backed Payload harness for Payment Resilience & Fault-Injection Suite
 * (10 Scenarios: Normal, Slow, Timeout, 4xx/5xx, Duplicate Webhook, Mid-payment Reload,
 * Close/Return Expiry, Multi-click Race, Uncertain Reconciliation, Provider Outage Isolation).
 * Strictly operates in MOCK/sandbox mode on a temp SQLite DB in os.tmpdir().
 */
function createResilienceHarness(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  let siteOverride = {
    onlinePaymentEnabled: true,
    activePaymentProvider: 'MOCK',
    bankName: 'Vietcombank',
    bankCode: 'VCB',
    bankAccountNumber: '1017588888',
    bankAccountHolder: 'CONG TY TNHH DICH VU PHUONG TIEN NORI',
    reservationDepositPolicyMode: 'PERCENT_OF_RENTAL',
    reservationDepositPercent: 30,
    paymentExpiryMinutes: 30,
  }

  function evalWhere(row, where) {
    if (!where || typeof where !== 'object') return true
    if (Array.isArray(where.and)) return where.and.every((c) => evalWhere(row, c))
    if (Array.isArray(where.or)) return where.or.some((c) => evalWhere(row, c))
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
        )
          return false
        if ('less_than_equal' in expr) {
          if (val == null || String(val) > String(expr.less_than_equal)) return false
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
      totalDays: r.total_days,
      dailyPriceSnapshot: r.daily_price_snapshot,
      baseRentPrice: r.base_rent_price,
      weekendSurchargeTotal: r.weekend_surcharge_total ?? 0,
      deliveryFeeSnapshot: r.delivery_fee_snapshot ?? 0,
      addonFeeTotal: r.addon_fee_total ?? 0,
      discountAmount: r.discount_amount ?? 0,
      promoDiscountAmount: r.promo_discount_amount ?? 0,
      totalPrice: r.total_price,
      depositSnapshot: r.deposit_snapshot,
      initialPaymentDue: r.initial_payment_due,
      remainingAmount: r.remaining_amount,
      extraFee: r.extra_fee ?? 0,
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
      booking: r.booking_id,
      payment: r.payment_id,
      customer: r.customer_id,
      refundType: r.refund_type,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      provider: r.provider,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  }

  const payload = {
    async findGlobal({ slug }) {
      if (slug === 'nori-site') return { ...siteOverride }
      return {}
    },
    async findByID({ collection, id }) {
      if (collection === 'bookings') {
        const doc = rowToBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id))
        if (!doc) throw new Error(`Booking ${id} not found`)
        return doc
      }
      if (collection === 'payments') {
        const doc = rowToPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(id))
        if (!doc) throw new Error(`Payment ${id} not found`)
        return doc
      }
      if (collection === 'refunds') {
        const doc = rowToRefund(db.prepare('SELECT * FROM refunds WHERE id = ?').get(id))
        if (!doc) throw new Error(`Refund ${id} not found`)
        return doc
      }
      throw new Error(`Unsupported findByID: ${collection}`)
    },
    async find({ collection, where, limit = 100 }) {
      let rows = []
      if (collection === 'payments') {
        rows = db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all().map(rowToPayment)
      } else if (collection === 'bookings') {
        rows = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all().map(rowToBooking)
      } else if (collection === 'payment-events') {
        rows = db
          .prepare('SELECT * FROM payment_events ORDER BY created_at DESC')
          .all()
          .map(rowToEvent)
      } else if (collection === 'refunds') {
        rows = db.prepare('SELECT * FROM refunds ORDER BY created_at DESC').all().map(rowToRefund)
      } else if (collection === 'notifications') {
        rows = db
          .prepare('SELECT * FROM notifications ORDER BY created_at DESC')
          .all()
          .map((n) => ({
            id: n.id,
            eventKey: n.event_key,
            customer: n.customer_id,
            booking: n.booking_id,
            type: n.type,
            title: n.title,
            message: n.message,
          }))
      }
      const filtered = rows.filter((r) => evalWhere(r, where)).slice(0, limit)
      return { docs: filtered, totalDocs: filtered.length }
    },
    async create({ collection, data }) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      if (collection === 'payments') {
        const ref = data.reference || `PAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        db.prepare(
          `INSERT INTO payments (
            id, reference, booking_id, customer_id, payment_type, method, provider, environment,
            currency, amount, expected_amount, received_amount, refunded_amount, overpaid_amount,
            status, reconciliation_status, provider_transaction_id, provider_payment_ref,
            qr_image_url, payment_url, bank_code, bank_account_number, bank_account_name,
            transfer_content, expires_at, idempotency_key, verified_at, paid_at, recorded_by,
            failure_reason, reconciliation_note, note, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          ref,
          data.booking ?? null,
          data.customer ?? null,
          data.paymentType,
          data.method ?? 'SEPAY_QR',
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
        return rowToPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(id))
      }
      if (collection === 'payment-events') {
        db.prepare(
          `INSERT INTO payment_events (
            id, event_id, provider, environment, payment_id, booking_id, external_transaction_id,
            payment_reference, event_type, transfer_amount, verification_result, processing_status,
            sanitized_payload, error_reason, retry_count, received_at, processed_at, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          data.eventId,
          data.provider,
          data.environment,
          data.payment ?? null,
          data.booking ?? null,
          data.externalTransactionId ?? null,
          data.paymentReference ?? null,
          data.eventType,
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
        return rowToEvent(db.prepare('SELECT * FROM payment_events WHERE id = ?').get(id))
      }
      if (collection === 'notifications') {
        db.prepare(
          `INSERT INTO notifications (
            id, event_key, customer_id, booking_id, type, title, message,
            payment_confirmed, superseded, is_read, popup_dismissed, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          data.eventKey,
          data.customer,
          data.booking,
          data.type,
          data.title,
          data.message,
          data.paymentConfirmed ? 1 : 0,
          data.superseded ? 1 : 0,
          data.isRead ? 1 : 0,
          data.popupDismissed ? 1 : 0,
          now,
          now,
        )
        return { id, ...data }
      }
      if (collection === 'audit-logs') {
        return { id, ...data }
      }
      throw new Error(`Unsupported create: ${collection}`)
    },
    async update({ collection, id, data }) {
      const now = new Date().toISOString()
      if (collection === 'payments') {
        const colMap = {
          status: 'status',
          reconciliationStatus: 'reconciliation_status',
          receivedAmount: 'received_amount',
          refundedAmount: 'refunded_amount',
          overpaidAmount: 'overpaid_amount',
          providerTransactionId: 'provider_transaction_id',
          verifiedAt: 'verified_at',
          paidAt: 'paid_at',
          failureReason: 'failure_reason',
          reconciliationNote: 'reconciliation_note',
          note: 'note',
          expiresAt: 'expires_at',
        }
        const sets = []
        const vals = []
        for (const [k, v] of Object.entries(data)) {
          if (colMap[k]) {
            sets.push(`${colMap[k]} = ?`)
            vals.push(v ?? null)
          }
        }
        sets.push('updated_at = ?')
        vals.push(now, id)
        db.prepare(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
        return rowToPayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(id))
      }
      if (collection === 'bookings') {
        if (data.status) {
          db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(
            data.status,
            now,
            id,
          )
        }
        if (Array.isArray(data.statusHistory)) {
          db.prepare('DELETE FROM bookings_status_history WHERE _parent_id = ?').run(id)
          data.statusHistory.forEach((h, idx) => {
            db.prepare(
              'INSERT INTO bookings_status_history (_order, _parent_id, id, status, changed_at, changed_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
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
        return rowToBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id))
      }
      if (collection === 'payment-events') {
        const colMap = {
          processingStatus: 'processing_status',
          payment: 'payment_id',
          booking: 'booking_id',
          errorReason: 'error_reason',
          retryCount: 'retry_count',
          processedAt: 'processed_at',
        }
        const sets = []
        const vals = []
        for (const [k, v] of Object.entries(data)) {
          if (colMap[k]) {
            sets.push(`${colMap[k]} = ?`)
            vals.push(v ?? null)
          }
        }
        sets.push('updated_at = ?')
        vals.push(now, id)
        db.prepare(`UPDATE payment_events SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
        return rowToEvent(db.prepare('SELECT * FROM payment_events WHERE id = ?').get(id))
      }
      throw new Error(`Unsupported update: ${collection}`)
    },
  }

  function seedBooking({
    status = 'DEPOSIT_PENDING',
    totalPrice = 3_000_000,
    depositSnapshot = 900_000,
  } = {}) {
    const now = new Date().toISOString()
    const userId = crypto.randomUUID()
    const modelId = crypto.randomUUID()
    const vehicleId = crypto.randomUUID()
    const bookingId = crypto.randomUUID()
    const bookingKey = `NR-RES-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

    db.prepare(
      `INSERT INTO users (id, full_name, email, phone, status, updated_at, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    ).run(
      userId,
      'Resilience Tester',
      `res_${userId.slice(0, 8)}@nori.test`,
      '0912345678',
      now,
      now,
    )

    db.prepare(
      `INSERT INTO vehicle_models (
        id, name, slug, brand, category, sub_category, origin, model_year, seats, fuel_type,
        transmission, visible, verification_status, sort_order, updated_at, created_at
      ) VALUES (?, 'Toyota Fortuner', ?, 'Toyota', 'CAR', 'SUV', 'Việt Nam', 2025, 7, 'Dầu', 'Tự động', 1, 'VERIFIED', 1, ?, ?)`,
    ).run(modelId, `fortuner-${modelId.slice(0, 6)}`, now, now)

    db.prepare(
      `INSERT INTO vehicles (id, reference, license_plate, model_id, intent, status, operation_status, price_per_day, deposit_amount, updated_at, created_at)
       VALUES (?, ?, ?, ?, 'RENT', 'ACTIVE', 'READY', 1000000, ?, ?, ?)`,
    ).run(
      vehicleId,
      `NR-OT-${vehicleId.slice(0, 6)}`,
      `51K-${vehicleId.slice(0, 5).toUpperCase()}`,
      modelId,
      depositSnapshot,
      now,
      now,
    )

    db.prepare(
      `INSERT INTO bookings (
        id, booking_key, customer_id, vehicle_id, vehicle_name_snapshot, vehicle_reference_snapshot,
        start_date, end_date, total_days, daily_price_snapshot, base_rent_price, total_price,
        deposit_snapshot, initial_payment_due, remaining_amount, status, updated_at, created_at
      ) VALUES (?, ?, ?, ?, 'Toyota Fortuner', ?, '2026-12-10', '2026-12-13', 3, 1000000, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      bookingId,
      bookingKey,
      userId,
      vehicleId,
      `NR-OT-${vehicleId.slice(0, 6)}`,
      totalPrice,
      totalPrice,
      depositSnapshot,
      depositSnapshot,
      totalPrice,
      status,
      now,
      now,
    )

    return { userId, bookingId, bookingKey }
  }

  return {
    db,
    payload,
    seedBooking,
    setSiteOverride(patch) {
      siteOverride = { ...siteOverride, ...patch }
    },
    close() {
      db.close()
    },
  }
}

describe('NORI Payment Resilience & Fault Tolerance Suite (10 Mandatory Scenarios, MOCK/Sandbox Only)', () => {
  let tmpDir
  let harness
  const savedEnv = {}

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nori-pay-resilience-'))
    const dbPath = path.join(tmpDir, 'resilience.db')
    const mig = runDatabaseMigration({ dbPath })
    assert.equal(mig.ok, true)
    harness = createResilienceHarness(dbPath)
    for (const k of ['PAYMENT_MODE', 'PAYMENT_PROVIDER', 'SEPAY_API_KEY', 'SEPAY_WEBHOOK_SECRET']) {
      savedEnv[k] = process.env[k]
    }
    process.env.PAYMENT_MODE = 'mock'
    process.env.PAYMENT_PROVIDER = 'MOCK'
    process.env.SEPAY_WEBHOOK_SECRET = 'nori-mock-sepay-webhook-key'
  })

  after(() => {
    harness?.close()
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('Scenario 1 (Normal flow): creates deposit payment, confirms via verified webhook, transitions booking', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const created = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, email: 'normal@nori.test', collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    assert.equal(created.reused, false)
    assert.equal(created.payment.status, 'PENDING')

    const whObj = {
      id: `tx-normal-${Date.now()}`,
      transferType: 'in',
      transferAmount: created.payment.amount,
      content: `Chuyen khoan ${created.payment.providerPaymentRef}`,
      code: created.payment.providerPaymentRef,
    }
    const whBody = JSON.stringify(whObj)
    const whRes = await processProviderWebhook({
      payload: harness.payload,
      providerName: 'MOCK',
      headers: new Headers({ authorization: 'Apikey nori-mock-sepay-webhook-key' }),
      rawBody: whBody,
      parsedBody: whObj,
    })
    assert.equal(whRes.httpStatus, 200)
    const updatedBooking = await harness.payload.findByID({ collection: 'bookings', id: bookingId })
    assert.equal(updatedBooking.status, 'CONFIRMED')
  })

  it('Scenario 2 (Slow provider): SePayProvider.queryTransaction resolves cleanly on slow response within timeout', async () => {
    const provider = new SePayProvider()
    process.env.SEPAY_API_KEY = 'test-sandbox-key-only'
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => {
      await new Promise((r) => setTimeout(r, 80))
      return new Response(
        JSON.stringify({
          transactions: [
            {
              id: 'slow-tx-99',
              amount_in: 900000,
              code: 'NORIPAYSLOW01',
              transaction_content: 'NORIPAYSLOW01',
              transaction_date: '2026-11-20T03:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    try {
      const res = await provider.queryTransaction({
        paymentReference: 'PAY-SLOW',
        providerPaymentRef: 'NORIPAYSLOW01',
        environment: 'SANDBOX',
      })
      assert.equal(res.found, true)
      assert.equal(res.status, 'CONFIRMED')
      assert.equal(res.receivedAmount, 900000)
    } finally {
      globalThis.fetch = origFetch
      delete process.env.SEPAY_API_KEY
    }
  })

  it('Scenario 3 (Timeout / uncertain state): provider timeout returns structured ERROR without marking payment FAILED or creating duplicate', async () => {
    const provider = new SePayProvider()
    process.env.SEPAY_API_KEY = 'test-sandbox-key-only'
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const created = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })

    const origFetch = globalThis.fetch
    globalThis.fetch = async (_url, init) => {
      assert.ok(init?.signal, 'Provider fetch MUST pass finite AbortSignal timeout')
      const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      throw err
    }
    try {
      const qRes = await provider.queryTransaction({
        paymentReference: created.payment.reference,
        providerPaymentRef: created.payment.providerPaymentRef,
        environment: 'SANDBOX',
      })
      assert.equal(qRes.found, false)
      assert.equal(qRes.status, 'ERROR')
      // Payment remains PENDING (uncertain, NEVER prematurely marked FAILED)
      const persisted = await harness.payload.findByID({
        collection: 'payments',
        id: created.payment.id,
      })
      assert.equal(persisted.status, 'PENDING')
    } finally {
      globalThis.fetch = origFetch
      delete process.env.SEPAY_API_KEY
    }
  })

  it('Scenario 4 (Provider 4xx/5xx): HTTP 429 and 503 return structured ERROR safely without throwing', async () => {
    const provider = new SePayProvider()
    process.env.SEPAY_API_KEY = 'test-sandbox-key-only'
    const origFetch = globalThis.fetch
    try {
      for (const code of [429, 500, 503]) {
        globalThis.fetch = async () => new Response('Upstream error', { status: code })
        const res = await provider.queryTransaction({
          paymentReference: 'PAY-ERR',
          providerPaymentRef: 'NORIPAYERR01',
          environment: 'SANDBOX',
        })
        assert.equal(res.status, 'ERROR')
        assert.match(res.message, new RegExp(`HTTP ${code}`))
      }
    } finally {
      globalThis.fetch = origFetch
      delete process.env.SEPAY_API_KEY
    }
  })

  it('Scenario 5 (Duplicate webhook & stale event): 5x replay is strictly idempotent and stale failure cannot regress CONFIRMED', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const created = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    const txId = `dup-tx-${Date.now()}`
    const bodyObj = {
      id: txId,
      transferType: 'in',
      transferAmount: created.payment.amount,
      code: created.payment.providerPaymentRef,
      content: created.payment.providerPaymentRef,
    }
    const body = JSON.stringify(bodyObj)
    const headers = new Headers({ authorization: 'Apikey nori-mock-sepay-webhook-key' })

    const first = await processProviderWebhook({
      payload: harness.payload,
      providerName: 'MOCK',
      headers,
      rawBody: body,
      parsedBody: bodyObj,
    })
    assert.equal(first.httpStatus, 200)

    for (let i = 0; i < 4; i++) {
      const replay = await processProviderWebhook({
        payload: harness.payload,
        providerName: 'MOCK',
        headers,
        rawBody: body,
        parsedBody: bodyObj,
      })
      assert.equal(replay.httpStatus, 200)
      assert.equal(replay.body.duplicate, true)
    }

    // Stale late failure must NEVER regress CONFIRMED payment
    const staleObj = {
      id: `stale-fail-${Date.now()}`,
      eventType: 'PAYMENT_FAILED',
      transferType: 'in',
      transferAmount: created.payment.amount,
      code: created.payment.providerPaymentRef,
      content: created.payment.providerPaymentRef,
    }
    const staleRes = await processProviderWebhook({
      payload: harness.payload,
      providerName: 'MOCK',
      headers,
      rawBody: JSON.stringify(staleObj),
      parsedBody: staleObj,
    })
    assert.equal(staleRes.httpStatus, 200)
    const p = await harness.payload.findByID({ collection: 'payments', id: created.payment.id })
    assert.equal(p.status, 'CONFIRMED')
    assert.equal(p.receivedAmount, created.payment.amount)
  })

  it('Scenario 6 (Refresh mid-payment): re-requesting payment returns the exact active PENDING session without creating duplicates', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const first = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    const afterReload = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    assert.equal(afterReload.reused, true)
    assert.equal(afterReload.payment.id, first.payment.id)
    assert.equal(afterReload.payment.providerPaymentRef, first.payment.providerPaymentRef)

    const allForBooking = await harness.payload.find({
      collection: 'payments',
      where: { booking: { equals: bookingId } },
    })
    assert.equal(allForBooking.docs.length, 1)
  })

  it('Scenario 7 (Close tab & return after expiry): scoped sweep expires stale session and allows single clean re-creation', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const first = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    // Simulate time passing past expiresAt
    await harness.payload.update({
      collection: 'payments',
      id: first.payment.id,
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    })
    const swept = await sweepExpiredPayments(harness.payload, { bookingIds: [bookingId] })
    assert.equal(swept, 1)

    const expiredDoc = await harness.payload.findByID({
      collection: 'payments',
      id: first.payment.id,
    })
    assert.equal(expiredDoc.status, 'EXPIRED')

    // Returning customer generates a single fresh QR session
    const second = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    assert.equal(second.reused, false)
    assert.notEqual(second.payment.id, first.payment.id)
    assert.equal(second.payment.status, 'PENDING')
  })

  it('Scenario 8 (Multi-click / double-submit race): 6 concurrent create calls produce strictly 1 payment row', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createOrReuseCustomerPayment({
          payload: harness.payload,
          user: { id: userId, collection: 'users', status: 'ACTIVE' },
          bookingId,
          paymentType: 'DEPOSIT',
        }),
      ),
    )
    const uniqueIds = new Set(results.map((r) => r.payment.id))
    assert.equal(uniqueIds.size, 1)
    const rows = await harness.payload.find({
      collection: 'payments',
      where: { booking: { equals: bookingId } },
    })
    assert.equal(rows.docs.length, 1)
  })

  it('Scenario 9 (Uncertain / anomalous reconciliation): underpaid, overpaid, and unmatched events are flagged for manual review', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    const created = await createOrReuseCustomerPayment({
      payload: harness.payload,
      user: { id: userId, collection: 'users', status: 'ACTIVE' },
      bookingId,
      paymentType: 'DEPOSIT',
    })
    const headers = new Headers({ authorization: 'Apikey nori-mock-sepay-webhook-key' })

    // Partial/underpaid transfer -> PARTIALLY_PAID + UNDERPAID
    const underObj = {
      id: `under-${Date.now()}`,
      transferType: 'in',
      transferAmount: Math.floor(created.payment.amount / 2),
      code: created.payment.providerPaymentRef,
      content: created.payment.providerPaymentRef,
    }
    await processProviderWebhook({
      payload: harness.payload,
      providerName: 'MOCK',
      headers,
      rawBody: JSON.stringify(underObj),
      parsedBody: underObj,
    })
    let p = await harness.payload.findByID({ collection: 'payments', id: created.payment.id })
    assert.equal(p.status, 'PARTIALLY_PAID')
    assert.equal(p.reconciliationStatus, 'UNDERPAID')

    // Second transfer pushes total above expected -> CONFIRMED + OVERPAID
    const overObj = {
      id: `over-${Date.now()}`,
      transferType: 'in',
      transferAmount: created.payment.amount,
      code: created.payment.providerPaymentRef,
      content: created.payment.providerPaymentRef,
    }
    await processProviderWebhook({
      payload: harness.payload,
      providerName: 'MOCK',
      headers,
      rawBody: JSON.stringify(overObj),
      parsedBody: overObj,
    })
    p = await harness.payload.findByID({ collection: 'payments', id: created.payment.id })
    assert.equal(p.status, 'CONFIRMED')
    assert.equal(p.reconciliationStatus, 'OVERPAID')
    assert.ok(p.overpaidAmount > 0)

    // Sync financial helper matches DB state accurately
    const booking = await harness.payload.findByID({ collection: 'bookings', id: bookingId })
    const siteConfig = buildSitePaymentConfigFromDoc({
      reservationDepositPolicyMode: 'PERCENT_OF_RENTAL',
      reservationDepositPercent: 30,
    })
    const fin = computeBookingFinancialsSync(booking, [p], [], siteConfig)
    assert.equal(fin.hasAnomaly, true)
    assert.ok(fin.overpaidAmount > 0)
  })

  it('Scenario 10 (Payment outage / disabled online payment): fails cleanly on payment route while site config & booking financial read remain healthy', async () => {
    const { userId, bookingId } = harness.seedBooking({ status: 'DEPOSIT_PENDING' })
    harness.setSiteOverride({ onlinePaymentEnabled: false })
    try {
      await assert.rejects(
        () =>
          createOrReuseCustomerPayment({
            payload: harness.payload,
            user: { id: userId, collection: 'users', status: 'ACTIVE' },
            bookingId,
            paymentType: 'DEPOSIT',
          }),
        /tạm ngưng|tạm tắt|khả dụng|không thể/i,
      )
      // Public/booking read helpers still succeed with zero crash
      const cfg = buildSitePaymentConfigFromDoc({ onlinePaymentEnabled: false })
      assert.equal(cfg.onlinePaymentEnabled, false)
      const booking = await harness.payload.findByID({ collection: 'bookings', id: bookingId })
      const fin = computeBookingFinancialsSync(booking, [], [], cfg)
      assert.equal(fin.paymentStatusSummary, 'UNPAID')
    } finally {
      harness.setSiteOverride({ onlinePaymentEnabled: true })
    }
  })
})
