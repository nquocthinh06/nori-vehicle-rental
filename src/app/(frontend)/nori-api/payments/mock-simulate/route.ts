import crypto from 'node:crypto'
import { appAuth } from '@/lib/app-auth'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { getPayloadClient } from '@/lib/payload'
import { resolvePaymentRuntimeConfig } from '@/lib/payment-providers'
import { getSitePaymentConfig, processProviderWebhook } from '@/lib/payment-service'
import { relationId } from '@/lib/rental-rules'

/**
 * Controlled Mock Provider Event Simulator (Development & Isolated Testing Only).
 * Strictly disabled in PRODUCTION mode. Exercises the exact Webhook verification
 * and 17-step processing pipeline without bypassing backend validation.
 */
export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const rt = resolvePaymentRuntimeConfig()
    if (rt.environment === 'PRODUCTION') {
      return fail(
        'Trình mô phỏng giao dịch (Mock Simulator) bị vô hiệu hóa hoàn toàn trên môi trường PRODUCTION.',
        403,
        'FORBIDDEN',
      )
    }

    const customerUser = await appAuth.currentUser()
    const adminAuth = customerUser ? null : await requireAdmin()
    if (!customerUser && (!adminAuth || !adminAuth.ok)) {
      return fail('Vui lòng đăng nhập để sử dụng trình mô phỏng kiểm thử.', 401, 'UNAUTHORIZED')
    }

    const data = await body(request, [
      'paymentId',
      'scenario',
      'customAmount',
      'externalTransactionId',
    ])

    const paymentId = text(data.paymentId, 100)
    if (!paymentId) return fail('Thiếu mã giao dịch cần mô phỏng.')

    const scenario = (text(data.scenario, 40) || 'EXACT').toUpperCase()
    const payload = await getPayloadClient()
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

    if (customerUser && String(relationId(payment.customer) ?? '') !== String(customerUser.id)) {
      return fail('Bạn không có quyền mô phỏng trên giao dịch của người khác.', 403, 'FORBIDDEN')
    }

    const siteConfig = await getSitePaymentConfig(payload)
    const expectedAmt = Number(payment.expectedAmount ?? payment.amount ?? 0)
    const alreadyReceived = Number(payment.receivedAmount ?? 0)
    const remainingToExact = Math.max(10_000, expectedAmt - alreadyReceived)

    let transferAmount = remainingToExact
    let eventType: string | undefined
    if (scenario === 'UNDERPAID' || scenario === 'PARTIAL') {
      transferAmount = Math.max(10_000, Math.floor(remainingToExact / 2))
    } else if (scenario === 'OVERPAID') {
      transferAmount = remainingToExact + 150_000
    } else if (scenario === 'CUSTOM' && data.customAmount !== undefined) {
      const parsed = Number(data.customAmount)
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return fail('Số tiền mô phỏng tùy chỉnh không hợp lệ.')
      }
      transferAmount = parsed
    } else if (scenario === 'FAILED') {
      eventType = 'PAYMENT_FAILED'
    } else if (scenario === 'EXPIRED') {
      eventType = 'PAYMENT_EXPIRED'
    }

    const externalTxId =
      text(data.externalTransactionId, 80) ||
      `MOCKTX-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
    const paymentCode = String(payment.providerPaymentRef ?? payment.reference ?? payment.id)

    const simulatedWebhookBody = {
      id: externalTxId,
      gateway: siteConfig.bankConfig.bankName,
      transactionDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
      accountNumber: siteConfig.bankConfig.bankAccountNumber,
      subAccount: '',
      code: paymentCode,
      content: `${paymentCode} chuyen khoan thue xe NORI`,
      transferType: 'in',
      description: `MOCK SIMULATOR (${scenario}) ${paymentCode}`,
      transferAmount,
      accumulated: transferAmount,
      referenceCode: `FT${externalTxId}`,
      ...(eventType ? { eventType } : {}),
    }

    const rawBody = JSON.stringify(simulatedWebhookBody)
    const webhookSecret =
      process.env.SEPAY_WEBHOOK_SECRET?.trim() ||
      process.env.SEPAY_API_KEY?.trim() ||
      'nori-mock-sepay-webhook-key'
    const simHeaders = new Headers({
      'Content-Type': 'application/json',
      Authorization: `Apikey ${webhookSecret}`,
    })

    const result = await processProviderWebhook({
      payload,
      providerName: payment.provider === 'SEPAY' ? 'SEPAY' : 'MOCK',
      headers: simHeaders,
      rawBody,
      parsedBody: simulatedWebhookBody,
    })

    if (result.httpStatus >= 400) {
      return fail(
        String(result.body.message ?? 'Mô phỏng sự kiện thất bại.'),
        result.httpStatus,
        String(result.body.code ?? 'WEBHOOK_ERROR'),
      )
    }

    return json(result.body, result.httpStatus)
  } catch (error) {
    return apiError(error)
  }
}
