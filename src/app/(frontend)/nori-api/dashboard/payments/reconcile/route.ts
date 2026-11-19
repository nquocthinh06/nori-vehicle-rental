import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { getPaymentProviderAdapter } from '@/lib/payment-providers'
import { computeBookingFinancialsFromDb, sweepExpiredPayments } from '@/lib/payment-service'
import { withBookingWriteLock } from '@/lib/promo-service'
import {
  formatVnd,
  relationId,
  type PaymentEnvironment,
  type PaymentStatus,
} from '@/lib/rental-rules'

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['payments', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    const data = await body(request, [
      'action',
      'paymentId',
      'bookingId',
      'targetStatus',
      'reconciliationNote',
    ])

    const action = (text(data.action, 40) || 'resolve_anomaly').toLowerCase()

    if (action === 'sweep_expired') {
      const expiredCount = await withBookingWriteLock(() => sweepExpiredPayments(payload))
      return json({
        action: 'sweep_expired',
        expiredCount,
        message: `Đã quét và xử lý ${expiredCount} yêu cầu thanh toán hết hạn.`,
      })
    }

    const paymentId = text(data.paymentId, 100)
    if (!paymentId) return fail('Thiếu mã giao dịch cần đối soát.')

    const payment = await payload
      .findByID({
        collection: 'payments',
        id: paymentId,
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => null)
    if (!payment) {
      return fail('Không tìm thấy giao dịch cần đối soát.', 404, 'NOT_FOUND')
    }

    if (action === 'query_provider') {
      const adapter = getPaymentProviderAdapter(payment.provider)
      const queryResult = await adapter.queryTransaction({
        paymentReference: String(payment.reference ?? payment.id),
        providerPaymentRef: payment.providerPaymentRef,
        providerTransactionId: payment.providerTransactionId,
        environment: (payment.environment as PaymentEnvironment) ?? 'MOCK',
      })
      return json({
        paymentId: payment.id,
        queryResult,
      })
    }

    const note = text(data.reconciliationNote, 500)
    if (!note) {
      return fail('Vui lòng nhập ghi chú đối soát để lưu nhật ký kiểm toán.')
    }

    return await withBookingWriteLock(async () => {
      if (action === 'assign_booking') {
        const bookingId = text(data.bookingId, 100)
        if (!bookingId) return fail('Vui lòng chọn đơn thuê cần gán cho giao dịch này.')
        const booking = await payload
          .findByID({
            collection: 'bookings',
            id: bookingId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
        if (!booking) return fail('Không tìm thấy đơn thuê được chọn.', 404, 'NOT_FOUND')

        const nextStatus: PaymentStatus = ['CANCELLED', 'REJECTED'].includes(
          String(booking.status ?? ''),
        )
          ? 'REVIEW_REQUIRED'
          : 'CONFIRMED'

        const updated = await payload.update({
          collection: 'payments',
          id: payment.id,
          overrideAccess: true,
          context: { allowLateWebhookRecord: true },
          data: {
            booking: booking.id,
            customer: relationId(booking.customer),
            status: nextStatus,
            reconciliationStatus: 'RESOLVED',
            reconciliationNote: `Admin (${admin.email}) gán vào đơn ${booking.bookingKey}: ${note}`,
          },
        })

        const { financial } = await computeBookingFinancialsFromDb(payload, booking)
        if (booking.status === 'DEPOSIT_PENDING' && financial.remainingDepositDue === 0) {
          await payload.update({
            collection: 'bookings',
            id: booking.id,
            overrideAccess: true,
            data: { status: 'CONFIRMED' },
          })
        }

        await payload
          .create({
            collection: 'audit-logs',
            overrideAccess: true,
            data: {
              action: 'payment.reconcile_assign',
              entity: 'payment',
              entityId: updated.id,
              entityLabel: String(updated.reference ?? updated.id),
              summary: `Admin ${admin.email} gán giao dịch chưa xác định (${formatVnd(updated.receivedAmount ?? updated.amount)}) vào đơn ${booking.bookingKey}: ${note}`,
              fromStatus: payment.status,
              toStatus: updated.status,
              actorType: 'ADMIN',
              actorId: admin.id,
              actorEmail: admin.email,
            },
          })
          .catch(() => null)

        return json({
          id: updated.id,
          status: updated.status,
          reconciliationStatus: updated.reconciliationStatus,
          message: `Đã gán giao dịch vào đơn thuê ${booking.bookingKey} và hoàn tất đối soát.`,
        })
      }

      // Default: resolve_anomaly
      const rawTarget = text(data.targetStatus, 30).toUpperCase()
      const nextStatus: PaymentStatus = (
        ['CONFIRMED', 'PARTIALLY_PAID', 'CANCELLED', 'REVIEW_REQUIRED'].includes(rawTarget)
          ? rawTarget
          : payment.status === 'REVIEW_REQUIRED'
            ? 'CONFIRMED'
            : payment.status
      ) as PaymentStatus

      const updated = await payload.update({
        collection: 'payments',
        id: payment.id,
        overrideAccess: true,
        context: { allowLateWebhookRecord: true },
        data: {
          status: nextStatus,
          reconciliationStatus: 'RESOLVED',
          reconciliationNote: `Admin (${admin.email}) xử lý đối soát: ${note}`,
        },
      })

      await payload
        .create({
          collection: 'audit-logs',
          overrideAccess: true,
          data: {
            action: 'payment.reconcile_resolve',
            entity: 'payment',
            entityId: updated.id,
            entityLabel: String(updated.reference ?? updated.id),
            summary: `Admin ${admin.email} hoàn tất đối soát giao dịch ${updated.reference}: ${note}`,
            fromStatus: `${payment.status} (${payment.reconciliationStatus ?? 'NONE'})`,
            toStatus: `${updated.status} (RESOLVED)`,
            actorType: 'ADMIN',
            actorId: admin.id,
            actorEmail: admin.email,
          },
        })
        .catch(() => null)

      return json({
        id: updated.id,
        status: updated.status,
        reconciliationStatus: updated.reconciliationStatus,
        message: 'Đã cập nhật kết quả đối soát giao dịch và ghi nhật ký kiểm toán.',
      })
    })
  } catch (error) {
    return apiError(error)
  }
}
