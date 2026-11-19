import { appAuth } from '@/lib/app-auth'
import { apiError, fail, json } from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'
import { getPaymentProviderAdapter } from '@/lib/payment-providers'
import {
  computeBookingFinancialsFromDb,
  getSitePaymentConfig,
  sweepExpiredPayments,
} from '@/lib/payment-service'
import { relationId, type PaymentEnvironment } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để kiểm tra trạng thái thanh toán.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user

    const sp = new URL(request.url).searchParams
    const paymentId = (sp.get('id') || sp.get('paymentId') || '').trim()
    const bookingIdParam = (sp.get('bookingId') || '').trim()
    const queryProvider = sp.get('queryProvider') === '1'

    if (!paymentId && !bookingIdParam) {
      return fail('Vui lòng cung cấp mã giao dịch (id) hoặc mã đơn thuê (bookingId).')
    }

    const payload = await getPayloadClient()
    let payment = null
    let booking = null

    if (paymentId) {
      payment = await payload
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
      const pCustId = relationId(payment.customer)
      const pBookingId = relationId(payment.booking)
      if (pBookingId) {
        booking = await payload
          .findByID({
            collection: 'bookings',
            id: pBookingId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
      }
      const bCustId = relationId(booking?.customer)
      if (String(pCustId ?? bCustId ?? '') !== String(user.id)) {
        return fail('Bạn không có quyền truy cập giao dịch này.', 403, 'FORBIDDEN')
      }
    } else if (bookingIdParam) {
      booking = await payload
        .findByID({
          collection: 'bookings',
          id: bookingIdParam,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
      if (!booking) {
        return fail('Không tìm thấy đơn thuê.', 404, 'NOT_FOUND')
      }
      if (String(relationId(booking.customer) ?? '') !== String(user.id)) {
        return fail(
          'Bạn không có quyền xem thông tin thanh toán của đơn thuê này.',
          403,
          'FORBIDDEN',
        )
      }
    }

    const expiredCount = booking
      ? await sweepExpiredPayments(payload, { bookingId: booking.id })
      : await sweepExpiredPayments(payload)

    if (paymentId && expiredCount > 0) {
      payment = await payload
        .findByID({
          collection: 'payments',
          id: paymentId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
    }

    let providerQueryResult = null
    if (queryProvider && payment && payment.status === 'PENDING') {
      const adapter = getPaymentProviderAdapter(payment.provider)
      providerQueryResult = await adapter.queryTransaction({
        paymentReference: String(payment.reference ?? payment.id),
        providerPaymentRef: payment.providerPaymentRef,
        providerTransactionId: payment.providerTransactionId,
        environment: (payment.environment as PaymentEnvironment) ?? 'MOCK',
      })
    }

    const siteConfig = await getSitePaymentConfig(payload)
    const computed = booking
      ? await computeBookingFinancialsFromDb(payload, booking, { siteConfig })
      : null

    if (!payment && computed && computed.payments.length > 0) {
      payment = computed.payments[0]
    }

    return json({
      payment: payment
        ? {
            id: payment.id,
            reference: payment.reference,
            bookingId: relationId(payment.booking) ?? null,
            paymentType: payment.paymentType,
            method: payment.method,
            provider: payment.provider ?? 'MANUAL',
            environment: payment.environment ?? siteConfig.environment,
            amount: payment.amount,
            expectedAmount: payment.expectedAmount ?? payment.amount,
            receivedAmount: payment.receivedAmount ?? 0,
            refundedAmount: payment.refundedAmount ?? 0,
            overpaidAmount: payment.overpaidAmount ?? 0,
            status: payment.status,
            reconciliationStatus: payment.reconciliationStatus ?? 'NONE',
            providerTransactionId: payment.providerTransactionId ?? null,
            providerPaymentRef: payment.providerPaymentRef ?? null,
            qrImageUrl: payment.qrImageUrl ?? null,
            paymentUrl: payment.paymentUrl ?? null,
            bankCode: payment.bankCode ?? siteConfig.bankConfig.bankCode,
            bankAccountNumber: payment.bankAccountNumber ?? siteConfig.bankConfig.bankAccountNumber,
            bankAccountName: payment.bankAccountName ?? siteConfig.bankConfig.bankAccountHolder,
            transferContent:
              payment.transferContent ?? payment.providerPaymentRef ?? payment.reference,
            expiresAt: payment.expiresAt ?? null,
            verifiedAt: payment.verifiedAt ?? null,
            paidAt: payment.paidAt ?? null,
            failureReason: payment.failureReason ?? null,
            createdAt: payment.createdAt,
          }
        : null,
      bookingStatus: booking?.status ?? null,
      financial: computed?.financial ?? null,
      providerQueryResult,
    })
  } catch (error) {
    return apiError(error)
  }
}
