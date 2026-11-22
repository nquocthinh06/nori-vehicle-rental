import { appAuth } from '@/lib/app-auth'
import {
  apiError,
  assertOrigin,
  assertRateLimit,
  body,
  createRequestLogger,
  fail,
  json,
  text,
} from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'
import { createOrReuseCustomerPayment } from '@/lib/payment-service'
import {
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_TYPES,
  type PaymentMethod,
  type PaymentProviderName,
  type PaymentType,
} from '@/lib/rental-rules'

export async function POST(request: Request) {
  const logger = createRequestLogger('nori-api/payments/create', request)
  try {
    assertOrigin(request)
    assertRateLimit(request, 'payments-create', 40, 60_000)

    const auth = await logger.time('auth', () =>
      appAuth.requireCustomer({
        unauthMessage: 'Vui lòng đăng nhập để tạo giao dịch thanh toán.',
        adminForbiddenMessage:
          'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để thanh toán đơn thuê cá nhân.',
      }),
    )
    if (!auth.ok) return auth.response
    const user = auth.user

    const data = await body(request, [
      'bookingId',
      'paymentType',
      'method',
      'provider',
      'amount',
      'expectedAmount',
      'idempotencyKey',
    ])

    const bookingId = text(data.bookingId, 100)
    if (!bookingId) {
      return fail('Thiếu mã đơn thuê cần thanh toán.')
    }

    const rawType = text(data.paymentType, 40).toUpperCase()
    if (rawType && !PAYMENT_TYPES.includes(rawType as PaymentType)) {
      return fail('Loại khoản thanh toán không hợp lệ.')
    }
    const paymentType = (rawType || undefined) as PaymentType | undefined

    const rawMethod = text(data.method, 40).toUpperCase()
    if (rawMethod && !PAYMENT_METHODS.includes(rawMethod as PaymentMethod)) {
      return fail('Phương thức thanh toán không hợp lệ.')
    }
    const method = (rawMethod || undefined) as PaymentMethod | undefined

    const rawProvider = text(data.provider, 40).toUpperCase()
    if (rawProvider && !PAYMENT_PROVIDERS.includes(rawProvider as PaymentProviderName)) {
      return fail('Nhà cung cấp thanh toán không hợp lệ.')
    }
    const provider = (rawProvider || undefined) as PaymentProviderName | undefined

    let clientExpectedAmount: number | undefined
    const rawClientAmt = data.amount !== undefined ? data.amount : data.expectedAmount
    if (rawClientAmt !== undefined && rawClientAmt !== null && rawClientAmt !== '') {
      const parsed = Number(rawClientAmt)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return fail('Số tiền yêu cầu thanh toán không hợp lệ.')
      }
      clientExpectedAmount = parsed
    }

    const idempotencyKey = text(data.idempotencyKey, 120) || undefined
    const payload = await logger.time('payload', () => getPayloadClient())

    const result = await logger.time('create_or_reuse_payment', () =>
      createOrReuseCustomerPayment({
        payload,
        user: {
          id: user.id,
          email: user.email,
          collection: 'users',
          status: user.status ?? 'ACTIVE',
        },
        bookingId,
        paymentType,
        method,
        provider,
        clientExpectedAmount,
        idempotencyKey,
      }),
    )

    const status = result.reused ? 200 : 201
    logger.logSuccess(status, { reused: result.reused, paymentType: result.payment.paymentType })
    return json(
      {
        reused: result.reused,
        payment: {
          id: result.payment.id,
          reference: result.payment.reference,
          bookingId,
          paymentType: result.payment.paymentType,
          method: result.payment.method,
          provider: result.payment.provider ?? result.providerDetails.provider,
          environment: result.payment.environment ?? result.providerDetails.environment,
          amount: result.payment.amount,
          expectedAmount: result.payment.expectedAmount ?? result.payment.amount,
          receivedAmount: result.payment.receivedAmount ?? 0,
          status: result.payment.status,
          reconciliationStatus: result.payment.reconciliationStatus ?? 'NONE',
          providerPaymentRef:
            result.payment.providerPaymentRef ?? result.providerDetails.providerPaymentRef,
          qrImageUrl: result.payment.qrImageUrl ?? result.providerDetails.qrImageUrl,
          qrSvgDataUri: result.providerDetails.qrSvgDataUri,
          paymentUrl: result.payment.paymentUrl ?? result.providerDetails.paymentUrl,
          bankName: result.providerDetails.bankName,
          bankCode: result.payment.bankCode ?? result.providerDetails.bankCode,
          bankAccountNumber:
            result.payment.bankAccountNumber ?? result.providerDetails.bankAccountNumber,
          bankAccountName: result.payment.bankAccountName ?? result.providerDetails.bankAccountName,
          transferContent: result.payment.transferContent ?? result.providerDetails.transferContent,
          expiresAt: result.payment.expiresAt ?? result.providerDetails.expiresAt,
          instructions: result.providerDetails.instructions,
          createdAt: result.payment.createdAt,
        },
        financial: result.financial,
      },
      status,
      logger.responseHeaders(),
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/payments/create' })
  }
}
