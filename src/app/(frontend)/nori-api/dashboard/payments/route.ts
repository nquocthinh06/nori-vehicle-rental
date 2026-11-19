import { requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { getSitePaymentConfig, sweepExpiredPayments } from '@/lib/payment-service'
import { withBookingWriteLock } from '@/lib/promo-service'
import {
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  RECONCILIATION_STATUSES,
  relationId,
  roundVndInteger,
  type PaymentMethod,
  type PaymentProviderName,
  type PaymentStatus,
  type PaymentType,
  type ReconciliationStatus,
} from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['payments', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    await sweepExpiredPayments(payload)

    const sp = new URL(request.url).searchParams
    const status = (sp.get('status') || '').trim()
    const method = (sp.get('method') || '').trim()
    const paymentType = (sp.get('paymentType') || '').trim()
    const provider = (sp.get('provider') || '').trim()
    const reconciliationStatus = (sp.get('reconciliationStatus') || '').trim()
    const anomalyFilter = (sp.get('anomaly') || '').trim().toUpperCase()
    const fromDate = (sp.get('from') || '').trim()
    const toDate = (sp.get('to') || '').trim()
    const q = (sp.get('q') || '').trim().toLowerCase()

    const [paymentsRes, bookingsRes, refundsRes, eventsRes, siteConfig] = await Promise.all([
      payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 300,
        sort: '-createdAt',
        ...(status ? { where: { status: { equals: status } } } : {}),
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 200,
        sort: '-createdAt',
        select: {
          bookingKey: true,
          vehicleReferenceSnapshot: true,
          vehicleNameSnapshot: true,
          totalPrice: true,
          depositSnapshot: true,
          initialPaymentDue: true,
          extraFee: true,
          status: true,
          customer: true,
        },
      }),
      payload
        .find({
          collection: 'refunds',
          user,
          overrideAccess: false,
          depth: 1,
          limit: 150,
          sort: '-createdAt',
        })
        .catch(() => ({ docs: [], totalDocs: 0 })),
      payload
        .find({
          collection: 'payment-events',
          overrideAccess: true,
          depth: 0,
          limit: 150,
          sort: '-createdAt',
        })
        .catch(() => ({ docs: [], totalDocs: 0 })),
      getSitePaymentConfig(payload),
    ])

    let confirmedRevenue = 0
    let rentalRevenueCollected = 0
    let depositCollected = 0
    let extraFeeCollected = 0
    let securityDepositHeld = 0
    let refundedTotal = 0
    let pendingCount = 0
    let anomalyCount = 0
    let pendingRefundTotal = 0

    const verifiedStatuses = new Set([
      'CONFIRMED',
      'PARTIALLY_PAID',
      'REVIEW_REQUIRED',
      'REFUND_PENDING',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ])

    for (const p of paymentsRes.docs) {
      const pStatus = String(p.status ?? 'PENDING')
      const pType = String(p.paymentType ?? 'DEPOSIT')
      const recon = String(p.reconciliationStatus ?? 'NONE')
      const received =
        p.receivedAmount != null && Number(p.receivedAmount) > 0
          ? roundVndInteger(p.receivedAmount)
          : ['CONFIRMED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(pStatus)
            ? roundVndInteger(p.amount)
            : 0

      if (pStatus === 'PENDING' || pStatus === 'PROCESSING') {
        pendingCount += 1
      }
      if (
        pStatus === 'REVIEW_REQUIRED' ||
        pStatus === 'PARTIALLY_PAID' ||
        ['UNDERPAID', 'OVERPAID', 'LATE_PAYMENT', 'UNMATCHED'].includes(recon)
      ) {
        anomalyCount += 1
      }

      if (pType === 'REFUND') {
        if (pStatus === 'CONFIRMED' || pStatus === 'REFUNDED') {
          refundedTotal += received
        }
        continue
      }

      if (verifiedStatuses.has(pStatus) && received > 0) {
        if (pType === 'SECURITY_DEPOSIT') {
          const secRef = roundVndInteger(p.refundedAmount)
          securityDepositHeld += Math.max(0, received - secRef)
        } else {
          confirmedRevenue += received
          if (pType === 'DEPOSIT') depositCollected += received
          else if (pType === 'EXTRA_FEE') extraFeeCollected += received
          else rentalRevenueCollected += received
        }
      }
      if (p.refundedAmount != null && Number(p.refundedAmount) > 0) {
        refundedTotal += roundVndInteger(p.refundedAmount)
      }
    }

    let refundDocsCompleted = 0
    for (const r of refundsRes.docs) {
      if (r.status === 'REFUNDED') {
        refundDocsCompleted += roundVndInteger(r.amount)
      } else if (['REQUESTED', 'APPROVED', 'PROCESSING'].includes(r.status)) {
        pendingRefundTotal += roundVndInteger(r.amount)
      }
    }
    refundedTotal = Math.max(refundedTotal, refundDocsCompleted)
    const netRevenue = Math.max(0, confirmedRevenue - refundedTotal)

    const customerNameMap = await resolveCustomerDisplayNames(
      payload,
      [
        ...paymentsRes.docs.map((p) => (typeof p.customer === 'string' ? p.customer : '')),
        ...refundsRes.docs.map((r) => (typeof r.customer === 'string' ? r.customer : '')),
      ].filter(Boolean),
    )

    const bookingKeyById = new Map<string, string>()
    for (const b of bookingsRes.docs) {
      bookingKeyById.set(b.id, b.bookingKey ?? b.id)
    }

    const mappedItems = paymentsRes.docs.map((p) => {
      const bId =
        typeof p.booking === 'object' && p.booking
          ? p.booking.id
          : typeof p.booking === 'string'
            ? p.booking
            : null
      const bKey =
        typeof p.booking === 'object' && p.booking
          ? (p.booking.bookingKey ?? p.booking.id)
          : bId
            ? (bookingKeyById.get(bId) ?? bId)
            : null
      const cName =
        typeof p.customer === 'object' && p.customer
          ? p.customer.fullName
          : (customerNameMap.get(String(p.customer ?? ''))?.fullName ?? null)

      return {
        id: p.id,
        reference: p.reference ?? p.id,
        bookingId: bId,
        bookingKey: bKey,
        customerId: relationId(p.customer) ?? null,
        customerName: cName,
        paymentType: p.paymentType,
        method: p.method,
        provider: p.provider ?? 'MANUAL',
        environment: p.environment ?? siteConfig.environment,
        amount: p.amount,
        expectedAmount: p.expectedAmount ?? p.amount,
        receivedAmount:
          p.receivedAmount != null && Number(p.receivedAmount) > 0
            ? p.receivedAmount
            : p.status === 'CONFIRMED'
              ? p.amount
              : 0,
        refundedAmount: p.refundedAmount ?? 0,
        overpaidAmount: p.overpaidAmount ?? 0,
        status: p.status,
        reconciliationStatus: p.reconciliationStatus ?? 'NONE',
        providerTransactionId: p.providerTransactionId ?? null,
        providerPaymentRef: p.providerPaymentRef ?? null,
        qrImageUrl: p.qrImageUrl ?? null,
        bankCode: p.bankCode ?? null,
        bankAccountNumber: p.bankAccountNumber ?? null,
        bankAccountName: p.bankAccountName ?? null,
        transferContent: p.transferContent ?? null,
        expiresAt: p.expiresAt ?? null,
        verifiedAt: p.verifiedAt ?? null,
        paidAt: p.paidAt ?? p.createdAt,
        recordedBy: p.recordedBy ?? null,
        failureReason: p.failureReason ?? null,
        reconciliationNote: p.reconciliationNote ?? null,
        note: p.note ?? null,
        createdAt: p.createdAt,
      }
    })

    const filteredItems = mappedItems.filter((item) => {
      if (method && item.method !== method) return false
      if (paymentType && item.paymentType !== paymentType) return false
      if (provider && item.provider !== provider) return false
      if (reconciliationStatus && item.reconciliationStatus !== reconciliationStatus) return false
      if (fromDate && item.createdAt.slice(0, 10) < fromDate) return false
      if (toDate && item.createdAt.slice(0, 10) > toDate) return false

      if (anomalyFilter === 'UNMATCHED' && item.reconciliationStatus !== 'UNMATCHED') return false
      if (
        anomalyFilter === 'UNDERPAID' &&
        item.reconciliationStatus !== 'UNDERPAID' &&
        item.status !== 'PARTIALLY_PAID'
      )
        return false
      if (
        anomalyFilter === 'OVERPAID' &&
        item.reconciliationStatus !== 'OVERPAID' &&
        item.overpaidAmount <= 0
      )
        return false
      if (anomalyFilter === 'LATE_PAYMENT' && item.reconciliationStatus !== 'LATE_PAYMENT')
        return false
      if (
        anomalyFilter === 'REFUND_PENDING' &&
        item.status !== 'REFUND_PENDING' &&
        item.status !== 'PARTIALLY_REFUNDED'
      )
        return false
      if (
        anomalyFilter === 'ALL_ANOMALIES' &&
        item.status !== 'REVIEW_REQUIRED' &&
        item.status !== 'PARTIALLY_PAID' &&
        !['UNDERPAID', 'OVERPAID', 'LATE_PAYMENT', 'UNMATCHED'].includes(item.reconciliationStatus)
      )
        return false

      if (q) {
        const hay =
          `${item.reference} ${item.providerPaymentRef ?? ''} ${item.providerTransactionId ?? ''} ${item.bookingKey ?? ''} ${item.customerName ?? ''} ${item.note ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    const mappedRefunds = refundsRes.docs.map((r) => {
      const bId = relationId(r.booking) ?? ''
      const bKey =
        typeof r.booking === 'object' && r.booking
          ? (r.booking.bookingKey ?? r.booking.id)
          : (bookingKeyById.get(bId) ?? bId)
      const pRef =
        typeof r.payment === 'object' && r.payment ? (r.payment.reference ?? r.payment.id) : null
      const cName =
        typeof r.customer === 'object' && r.customer
          ? r.customer.fullName
          : (customerNameMap.get(String(r.customer ?? ''))?.fullName ?? null)
      return {
        id: r.id,
        reference: r.reference ?? r.id,
        bookingId: bId,
        bookingKey: bKey,
        paymentId: relationId(r.payment) ?? null,
        paymentReference: pRef,
        customerName: cName,
        refundType: r.refundType,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        provider: r.provider ?? 'MANUAL',
        providerRefundId: r.providerRefundId ?? null,
        requestedBy: r.requestedBy ?? null,
        approvedBy: r.approvedBy ?? null,
        completedBy: r.completedBy ?? null,
        requestedAt: r.requestedAt ?? r.createdAt,
        approvedAt: r.approvedAt ?? null,
        completedAt: r.completedAt ?? null,
        reconciliationNote: r.reconciliationNote ?? null,
        bankAccountInfo: r.bankAccountInfo ?? null,
        createdAt: r.createdAt,
      }
    })

    const mappedEvents = eventsRes.docs.map((e) => ({
      id: e.id,
      eventId: e.eventId,
      provider: e.provider,
      environment: e.environment,
      externalTransactionId: e.externalTransactionId ?? null,
      paymentReference: e.paymentReference ?? null,
      eventType: e.eventType,
      transferAmount: e.transferAmount ?? 0,
      verificationResult: e.verificationResult,
      processingStatus: e.processingStatus,
      retryCount: e.retryCount ?? 0,
      receivedAt: e.receivedAt,
      processedAt: e.processedAt ?? null,
      errorReason: e.errorReason ?? null,
      paymentId: relationId(e.payment) ?? null,
      bookingId: relationId(e.booking) ?? null,
      sanitizedPayload: e.sanitizedPayload ?? null,
    }))

    return json({
      summary: {
        confirmedRevenue,
        rentalRevenueCollected,
        depositCollected,
        extraFeeCollected,
        securityDepositHeld,
        refundedTotal,
        pendingRefundTotal,
        netRevenue,
        pendingCount,
        anomalyCount,
        totalRecords: paymentsRes.totalDocs,
      },
      items: filteredItems,
      refunds: mappedRefunds,
      events: mappedEvents,
      paymentConfig: siteConfig,
      bookings: bookingsRes.docs.map((b) => ({
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        reference: b.vehicleReferenceSnapshot ?? '',
        modelName: b.vehicleNameSnapshot ?? '',
        totalPrice: b.totalPrice ?? 0,
        depositSnapshot: b.depositSnapshot ?? 0,
        extraFee: b.extraFee ?? 0,
        status: b.status ?? 'PENDING',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'bookingId',
      'paymentType',
      'method',
      'provider',
      'amount',
      'receivedAmount',
      'status',
      'paidAt',
      'providerTransactionId',
      'reconciliationNote',
      'note',
    ])
    const amount = Number(data.amount)
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return fail('Số tiền giao dịch phải là số nguyên dương.')
    }
    const bookingId = text(data.bookingId, 100) || undefined
    let customerId: string | undefined
    const paymentType = (
      PAYMENT_TYPES.includes(String(data.paymentType) as PaymentType) ? data.paymentType : 'DEPOSIT'
    ) as PaymentType

    const paidAt = text(data.paidAt, 40) || new Date().toISOString().slice(0, 10)
    const note = text(data.note, 500) || undefined
    const reconciliationNote = text(data.reconciliationNote, 500) || undefined
    const providerTransactionId = text(data.providerTransactionId, 100) || undefined
    const method = (
      PAYMENT_METHODS.includes(String(data.method) as PaymentMethod) ? data.method : 'BANK_TRANSFER'
    ) as PaymentMethod
    const provider = (
      PAYMENT_PROVIDERS.includes(String(data.provider) as PaymentProviderName)
        ? data.provider
        : 'MANUAL'
    ) as PaymentProviderName
    const paymentStatus = (
      PAYMENT_STATUSES.includes(String(data.status) as PaymentStatus) ? data.status : 'CONFIRMED'
    ) as PaymentStatus

    return await withBookingWriteLock(async () => {
      if (bookingId) {
        const b = await payload.findByID({
          collection: 'bookings',
          id: bookingId,
          user,
          overrideAccess: false,
          depth: 0,
        })
        if (
          ['CANCELLED', 'REJECTED'].includes(String(b.status ?? '')) &&
          paymentStatus !== 'CANCELLED' &&
          paymentType !== 'REFUND'
        ) {
          return fail(
            'Không thể ghi nhận thu tiền cho đơn thuê đã hủy hoặc đã từ chối.',
            409,
            'INVALID_BOOKING_STATE',
          )
        }
        customerId =
          typeof b.customer === 'object' && b.customer ? b.customer.id : (b.customer ?? undefined)

        const recentDuplicates = await payload.find({
          collection: 'payments',
          user,
          overrideAccess: false,
          limit: 1,
          sort: '-createdAt',
          where: {
            and: [
              { booking: { equals: bookingId } },
              { paymentType: { equals: paymentType } },
              { amount: { equals: amount } },
              { status: { in: ['PENDING', 'CONFIRMED'] } },
            ],
          },
        })
        if (recentDuplicates.totalDocs > 0) {
          const lastCreatedAt = new Date(recentDuplicates.docs[0].createdAt).getTime()
          if (Date.now() - lastCreatedAt < 30_000) {
            return fail(
              'Giao dịch tương tự vừa được tạo cách đây ít giây. Vui lòng không gửi lặp lại.',
              409,
              'DUPLICATE_PAYMENT',
            )
          }
        }
      }

      const receivedAmount =
        data.receivedAmount !== undefined && data.receivedAmount !== null
          ? roundVndInteger(Number(data.receivedAmount))
          : paymentStatus === 'CONFIRMED'
            ? amount
            : 0

      const created = await payload.create({
        collection: 'payments',
        user,
        overrideAccess: false,
        data: {
          booking: bookingId,
          customer: customerId,
          paymentType,
          method,
          provider,
          amount,
          expectedAmount: amount,
          receivedAmount,
          status: paymentStatus,
          reconciliationStatus: paymentStatus === 'CONFIRMED' ? 'MANUAL_OVERRIDE' : 'NONE',
          providerTransactionId,
          reconciliationNote,
          paidAt,
          verifiedAt: paymentStatus === 'CONFIRMED' ? new Date().toISOString() : undefined,
          note,
        },
      })
      return json({ id: created.id, reference: created.reference }, 201)
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'id',
      'status',
      'reconciliationStatus',
      'receivedAmount',
      'reconciliationNote',
      'note',
    ])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id || !PAYMENT_STATUSES.includes(status as PaymentStatus)) {
      return fail('Thông tin cập nhật giao dịch không hợp lệ.')
    }
    const reconRaw = text(data.reconciliationStatus, 30)
    const reconciliationStatus = RECONCILIATION_STATUSES.includes(reconRaw as ReconciliationStatus)
      ? (reconRaw as ReconciliationStatus)
      : undefined

    return await withBookingWriteLock(async () => {
      const updated = await payload.update({
        collection: 'payments',
        id,
        user,
        overrideAccess: false,
        data: {
          status: status as PaymentStatus,
          ...(reconciliationStatus ? { reconciliationStatus } : {}),
          ...(data.receivedAmount !== undefined
            ? { receivedAmount: roundVndInteger(Number(data.receivedAmount)) }
            : {}),
          ...(data.reconciliationNote !== undefined
            ? { reconciliationNote: text(data.reconciliationNote, 500) }
            : {}),
          ...(data.note !== undefined ? { note: text(data.note, 500) } : {}),
        },
      })
      return json({ id: updated.id, status: updated.status })
    })
  } catch (error) {
    return apiError(error)
  }
}
