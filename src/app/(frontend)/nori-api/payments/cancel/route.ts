import { appAuth } from '@/lib/app-auth'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'
import { getPaymentProviderAdapter } from '@/lib/payment-providers'
import { withBookingWriteLock } from '@/lib/promo-service'
import { canTransitionPayment, relationId } from '@/lib/rental-rules'

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để hủy yêu cầu thanh toán.',
      adminForbiddenMessage: 'Vui lòng sử dụng tài khoản khách hàng.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user

    const data = await body(request, ['id', 'paymentId', 'reason'])
    const paymentId = text(data.paymentId ?? data.id, 100)
    if (!paymentId) return fail('Thiếu mã giao dịch cần hủy.')
    const cancelReason = text(data.reason, 300) || 'Khách hàng chủ động hủy mã thanh toán'

    const payload = await getPayloadClient()

    return await withBookingWriteLock(async () => {
      const payment = await payload
        .findByID({
          collection: 'payments',
          id: paymentId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
      if (!payment) {
        return fail('Không tìm thấy giao dịch thanh toán.', 404, 'NOT_FOUND')
      }

      const ownerId = relationId(payment.customer)
      if (String(ownerId ?? '') !== String(user.id)) {
        return fail('Bạn không có quyền hủy giao dịch thanh toán này.', 403, 'FORBIDDEN')
      }

      if (!canTransitionPayment(payment.status, 'CANCELLED', 'customer')) {
        return fail(
          'Chỉ có thể hủy yêu cầu thanh toán khi đang ở trạng thái Chờ thanh toán (PENDING).',
          409,
          'INVALID_PAYMENT_TRANSITION',
        )
      }

      const adapter = getPaymentProviderAdapter(payment.provider)
      const providerCancel = await adapter.cancelPayment({
        paymentReference: String(payment.reference ?? payment.id),
        providerPaymentRef: payment.providerPaymentRef,
      })

      const updated = await payload.update({
        collection: 'payments',
        id: payment.id,
        overrideAccess: true,
        data: {
          status: 'CANCELLED',
          note: `${payment.note ? `${payment.note} · ` : ''}${cancelReason}`,
        },
      })

      return json({
        id: updated.id,
        status: updated.status,
        providerAction: providerCancel.status,
        message: providerCancel.message,
      })
    })
  } catch (error) {
    return apiError(error)
  }
}
