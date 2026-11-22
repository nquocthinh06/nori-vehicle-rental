import { requireAdmin } from '@/lib/admin-api'
import {
  apiError,
  assertOrigin,
  body,
  createRequestLogger,
  fail,
  json,
  text,
} from '@/lib/api-utils'
import { confirmPaymentManuallyByAdmin } from '@/lib/payment-service'

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/dashboard/payments/confirm', request)
  try {
    assertOrigin(request)
    const auth = await logger.time('auth', () =>
      requireAdmin({ permission: ['payments', 'update'] }),
    )
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    const data = await body(request, [
      'id',
      'paymentId',
      'reason',
      'transactionEvidence',
      'receivedAmount',
    ])

    const paymentId = text(data.paymentId ?? data.id, 100)
    if (!paymentId) return fail('Thiếu mã giao dịch cần xác nhận.')
    const reason = text(data.reason, 400)
    const transactionEvidence = text(data.transactionEvidence, 160)

    let receivedAmount: number | undefined
    if (
      data.receivedAmount !== undefined &&
      data.receivedAmount !== null &&
      data.receivedAmount !== ''
    ) {
      const parsed = Number(data.receivedAmount)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return fail('Số tiền thực nhận phải là số nguyên dương.')
      }
      receivedAmount = parsed
    }

    const result = await logger.time('manual_confirm', () =>
      confirmPaymentManuallyByAdmin({
        payload,
        admin: { id: admin.id, email: admin.email },
        paymentId,
        reason,
        transactionEvidence,
        receivedAmount,
      }),
    )

    logger.logSuccess(200, {
      alreadyConfirmed: result.alreadyConfirmed,
      status: result.payment.status,
    })
    return json(
      {
        alreadyConfirmed: result.alreadyConfirmed,
        id: result.payment.id,
        reference: result.payment.reference,
        status: result.payment.status,
        reconciliationStatus: result.payment.reconciliationStatus,
        receivedAmount: result.payment.receivedAmount,
        message: result.message,
      },
      200,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/dashboard/payments/confirm' })
  }
}
