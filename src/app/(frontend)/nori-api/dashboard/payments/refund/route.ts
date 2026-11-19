import { adminHasPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { createOrProcessAdminRefund } from '@/lib/payment-service'

const VALID_REFUND_TYPES = [
  'CANCELLATION',
  'DEPOSIT_RETURN',
  'OVERPAYMENT',
  'PARTIAL_ADJUSTMENT',
  'SECURITY_DEPOSIT_RETURN',
] as const

export async function GET() {
  try {
    const auth = await requireAdmin({ permission: ['payments', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const res = await payload.find({
      collection: 'refunds',
      user,
      overrideAccess: false,
      depth: 1,
      limit: 100,
      sort: '-createdAt',
    })

    return json({
      items: res.docs.map((r) => ({
        id: r.id,
        reference: r.reference ?? r.id,
        bookingId: typeof r.booking === 'object' && r.booking ? r.booking.id : String(r.booking),
        bookingKey:
          typeof r.booking === 'object' && r.booking
            ? (r.booking.bookingKey ?? r.booking.id)
            : String(r.booking),
        paymentId:
          typeof r.payment === 'object' && r.payment
            ? r.payment.id
            : typeof r.payment === 'string'
              ? r.payment
              : null,
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
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    const data = await body(request, [
      'action',
      'bookingId',
      'paymentId',
      'refundId',
      'amount',
      'refundType',
      'reason',
      'providerRefundId',
      'reconciliationNote',
      'bankAccountInfo',
      'completeImmediately',
    ])

    const rawAction = (text(data.action, 30) || 'create').toLowerCase()
    if (!['create', 'approve', 'complete', 'reject'].includes(rawAction)) {
      return fail('Thao tác hoàn tiền không hợp lệ.')
    }
    const action = rawAction as 'create' | 'approve' | 'complete' | 'reject'

    const rawRefundType = text(data.refundType, 40).toUpperCase()
    const refundType = VALID_REFUND_TYPES.includes(
      rawRefundType as (typeof VALID_REFUND_TYPES)[number],
    )
      ? (rawRefundType as (typeof VALID_REFUND_TYPES)[number])
      : 'DEPOSIT_RETURN'

    const result = await createOrProcessAdminRefund({
      payload,
      admin: {
        id: admin.id,
        email: admin.email,
        hasPaymentUpdatePermission: adminHasPermission(admin, 'payments', 'update'),
      },
      action,
      bookingId: text(data.bookingId, 100) || undefined,
      paymentId: text(data.paymentId, 100) || undefined,
      refundId: text(data.refundId, 100) || undefined,
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      refundType,
      reason: text(data.reason, 500) || undefined,
      providerRefundId: text(data.providerRefundId, 100) || undefined,
      reconciliationNote: text(data.reconciliationNote, 500) || undefined,
      bankAccountInfo: text(data.bankAccountInfo, 300) || undefined,
    })

    // If Admin explicitly passed completeImmediately = true with a verified disbursement reference, complete in 2nd step
    if (
      action === 'create' &&
      data.completeImmediately === true &&
      text(data.providerRefundId, 100)
    ) {
      const completed = await createOrProcessAdminRefund({
        payload,
        admin: {
          id: admin.id,
          email: admin.email,
          hasPaymentUpdatePermission: adminHasPermission(admin, 'payments', 'update'),
        },
        action: 'complete',
        refundId: result.refund.id,
        providerRefundId: text(data.providerRefundId, 100),
        reconciliationNote: text(data.reconciliationNote, 500) || undefined,
      })
      return json(
        {
          id: completed.refund.id,
          reference: completed.refund.reference,
          status: completed.refund.status,
          amount: completed.refund.amount,
          message: completed.message,
        },
        201,
      )
    }

    return json(
      {
        id: result.refund.id,
        reference: result.refund.reference,
        status: result.refund.status,
        amount: result.refund.amount,
        message: result.message,
      },
      action === 'create' ? 201 : 200,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  return POST(request)
}
