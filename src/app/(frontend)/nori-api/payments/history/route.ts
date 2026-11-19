import { appAuth } from '@/lib/app-auth'
import { apiError, fail, json } from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'
import {
  computeBookingFinancialsFromDb,
  getSitePaymentConfig,
  sweepExpiredPayments,
} from '@/lib/payment-service'
import { relationId } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để xem lịch sử giao dịch.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user

    const sp = new URL(request.url).searchParams
    const bookingId = (sp.get('bookingId') || '').trim()
    const payload = await getPayloadClient()
    const siteConfig = await getSitePaymentConfig(payload)

    if (bookingId) {
      const booking = await payload
        .findByID({
          collection: 'bookings',
          id: bookingId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
      if (!booking) {
        return fail('Không tìm thấy đơn thuê.', 404, 'NOT_FOUND')
      }
      if (String(relationId(booking.customer) ?? '') !== String(user.id)) {
        return fail('Bạn không có quyền truy cập lịch sử giao dịch của đơn này.', 403, 'FORBIDDEN')
      }
      await sweepExpiredPayments(payload, { bookingId: booking.id })
      const { financial, payments, refunds } = await computeBookingFinancialsFromDb(
        payload,
        booking,
        { siteConfig },
      )
      return json({
        bookingId: booking.id,
        bookingKey: booking.bookingKey,
        bookingStatus: booking.status,
        financial,
        payments: payments.map((p) => ({
          id: p.id,
          reference: p.reference ?? p.id,
          bookingId: booking.id,
          bookingKey: booking.bookingKey,
          paymentType: p.paymentType,
          method: p.method,
          provider: p.provider ?? 'MANUAL',
          environment: p.environment ?? siteConfig.environment,
          amount: p.amount,
          expectedAmount: p.expectedAmount ?? p.amount,
          receivedAmount: p.receivedAmount ?? 0,
          refundedAmount: p.refundedAmount ?? 0,
          overpaidAmount: p.overpaidAmount ?? 0,
          status: p.status,
          reconciliationStatus: p.reconciliationStatus ?? 'NONE',
          providerTransactionId: p.providerTransactionId ?? null,
          providerPaymentRef: p.providerPaymentRef ?? null,
          qrImageUrl: p.qrImageUrl ?? null,
          bankCode: p.bankCode ?? siteConfig.bankConfig.bankCode,
          bankAccountNumber: p.bankAccountNumber ?? siteConfig.bankConfig.bankAccountNumber,
          bankAccountName: p.bankAccountName ?? siteConfig.bankConfig.bankAccountHolder,
          transferContent: p.transferContent ?? p.providerPaymentRef ?? p.reference,
          expiresAt: p.expiresAt ?? null,
          verifiedAt: p.verifiedAt ?? null,
          paidAt: p.paidAt ?? null,
          failureReason: p.failureReason ?? null,
          createdAt: p.createdAt,
        })),
        refunds: refunds.map((r) => ({
          id: r.id,
          reference: r.reference ?? r.id,
          bookingId: booking.id,
          paymentId: relationId(r.payment) ?? null,
          refundType: r.refundType,
          amount: r.amount,
          reason: r.reason,
          status: r.status,
          provider: r.provider ?? 'MANUAL',
          providerRefundId: r.providerRefundId ?? null,
          requestedAt: r.requestedAt ?? r.createdAt,
          approvedAt: r.approvedAt ?? null,
          completedAt: r.completedAt ?? null,
          createdAt: r.createdAt,
        })),
        paymentConfig: {
          onlinePaymentEnabled: siteConfig.onlinePaymentEnabled,
          activeProvider: siteConfig.activeProvider,
          environment: siteConfig.environment,
          providerConfigured: siteConfig.providerConfigured,
          allowSepayQr: siteConfig.allowSepayQr,
          allowManualBankTransfer: siteConfig.allowManualBankTransfer,
          allowCashOnHandover: siteConfig.allowCashOnHandover,
          allowFullPaymentOnline: siteConfig.allowFullPaymentOnline,
          paymentExpiryMinutes: siteConfig.paymentExpiryMinutes,
          bankConfig: siteConfig.bankConfig,
          paymentInstructionNote: siteConfig.paymentInstructionNote,
        },
      })
    }

    // All payments & refunds for the logged-in customer
    const [payRes, refundRes] = await Promise.all([
      payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 100,
        sort: '-createdAt',
      }),
      payload
        .find({
          collection: 'refunds',
          user,
          overrideAccess: false,
          depth: 1,
          limit: 100,
          sort: '-createdAt',
        })
        .catch(() => ({ docs: [] })),
    ])

    return json({
      payments: payRes.docs.map((p) => ({
        id: p.id,
        reference: p.reference ?? p.id,
        bookingId: relationId(p.booking) ?? null,
        bookingKey:
          typeof p.booking === 'object' && p.booking
            ? (p.booking.bookingKey ?? p.booking.id)
            : null,
        paymentType: p.paymentType,
        method: p.method,
        provider: p.provider ?? 'MANUAL',
        environment: p.environment ?? siteConfig.environment,
        amount: p.amount,
        expectedAmount: p.expectedAmount ?? p.amount,
        receivedAmount: p.receivedAmount ?? 0,
        refundedAmount: p.refundedAmount ?? 0,
        overpaidAmount: p.overpaidAmount ?? 0,
        status: p.status,
        reconciliationStatus: p.reconciliationStatus ?? 'NONE',
        providerTransactionId: p.providerTransactionId ?? null,
        providerPaymentRef: p.providerPaymentRef ?? null,
        expiresAt: p.expiresAt ?? null,
        verifiedAt: p.verifiedAt ?? null,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
      })),
      refunds: refundRes.docs.map((r) => ({
        id: r.id,
        reference: r.reference ?? r.id,
        bookingId: relationId(r.booking) ?? '',
        paymentId: relationId(r.payment) ?? null,
        refundType: r.refundType,
        amount: r.amount,
        reason: r.reason,
        status: r.status,
        provider: r.provider ?? 'MANUAL',
        requestedAt: r.requestedAt ?? r.createdAt,
        completedAt: r.completedAt ?? null,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}
