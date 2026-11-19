import { adminHasAnyPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { getSitePaymentConfig } from '@/lib/payment-service'

export async function GET() {
  try {
    const auth = await requireAdmin({ permission: ['payments', 'read'] })
    if (!auth.ok) return auth.response
    const { payload } = auth
    const config = await getSitePaymentConfig(payload)
    return json(config)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    if (
      !adminHasAnyPermission(admin, [
        ['payments', 'update'],
        ['content', 'update'],
        ['settings', 'update'],
      ])
    ) {
      return fail('Tài khoản chưa được cấp quyền thay đổi cấu hình thanh toán.', 403, 'FORBIDDEN')
    }

    const data = await body(request, [
      'onlinePaymentEnabled',
      'activePaymentProvider',
      'allowSepayQr',
      'allowManualBankTransfer',
      'allowCashOnHandover',
      'allowFullPaymentOnline',
      'reservationDepositPolicyMode',
      'reservationDepositPercent',
      'paymentExpiryMinutes',
      'requireDepositBeforeHandover',
      'requireSettlementBeforeComplete',
      'bankName',
      'bankCode',
      'bankAccountNumber',
      'bankAccountHolder',
      'paymentInstructionNote',
      'refundPolicySummary',
    ])

    const beforeConfig = await getSitePaymentConfig(payload)
    const patch: Record<string, unknown> = {}

    if (data.onlinePaymentEnabled !== undefined) {
      patch.onlinePaymentEnabled = Boolean(data.onlinePaymentEnabled)
    }
    if (data.activePaymentProvider !== undefined) {
      const prov = text(data.activePaymentProvider, 30).toUpperCase()
      if (!['SEPAY', 'MOCK', 'MANUAL'].includes(prov)) {
        return fail('Nhà cung cấp thanh toán ưu tiên không hợp lệ.')
      }
      patch.activePaymentProvider = prov
    }
    if (data.allowSepayQr !== undefined) patch.allowSepayQr = Boolean(data.allowSepayQr)
    if (data.allowManualBankTransfer !== undefined)
      patch.allowManualBankTransfer = Boolean(data.allowManualBankTransfer)
    if (data.allowCashOnHandover !== undefined)
      patch.allowCashOnHandover = Boolean(data.allowCashOnHandover)
    if (data.allowFullPaymentOnline !== undefined)
      patch.allowFullPaymentOnline = Boolean(data.allowFullPaymentOnline)

    if (data.reservationDepositPolicyMode !== undefined) {
      const mode = text(data.reservationDepositPolicyMode, 30).toUpperCase()
      if (!['VEHICLE_FIXED', 'PERCENT_OF_RENTAL'].includes(mode)) {
        return fail('Chế độ tính tiền đặt cọc không hợp lệ.')
      }
      patch.reservationDepositPolicyMode = mode
    }
    if (data.reservationDepositPercent !== undefined) {
      const pct = Number(data.reservationDepositPercent)
      if (!Number.isSafeInteger(pct) || pct < 0 || pct > 100) {
        return fail('Tỷ lệ tiền cọc giữ xe phải là số nguyên từ 0 đến 100%.')
      }
      patch.reservationDepositPercent = pct
    }
    if (data.paymentExpiryMinutes !== undefined) {
      const mins = Number(data.paymentExpiryMinutes)
      if (!Number.isSafeInteger(mins) || mins < 5 || mins > 1440) {
        return fail('Thời hạn hiệu lực mã thanh toán phải từ 5 đến 1440 phút.')
      }
      patch.paymentExpiryMinutes = mins
    }
    if (data.requireDepositBeforeHandover !== undefined) {
      patch.requireDepositBeforeHandover = Boolean(data.requireDepositBeforeHandover)
    }
    if (data.requireSettlementBeforeComplete !== undefined) {
      patch.requireSettlementBeforeComplete = Boolean(data.requireSettlementBeforeComplete)
    }
    if (data.bankName !== undefined) {
      const bName = text(data.bankName, 80)
      if (!bName) return fail('Tên ngân hàng nhận không được để trống.')
      patch.bankName = bName
    }
    if (data.bankCode !== undefined) {
      const bCode = text(data.bankCode, 20).toUpperCase()
      if (!bCode || !/^[A-Z0-9]{2,15}$/.test(bCode)) {
        return fail('Mã ngân hàng VietQR không hợp lệ (ví dụ: VCB, MB, TCB, BIDV, ACB).')
      }
      patch.bankCode = bCode
    }
    if (data.bankAccountNumber !== undefined) {
      const acc = text(data.bankAccountNumber, 30)
      if (!acc || !/^[A-Z0-9]{6,25}$/i.test(acc)) {
        return fail('Số tài khoản ngân hàng nhận tiền không hợp lệ.')
      }
      patch.bankAccountNumber = acc
    }
    if (data.bankAccountHolder !== undefined) {
      const holder = text(data.bankAccountHolder, 120).toUpperCase()
      if (!holder) return fail('Tên chủ tài khoản nhận tiền không được để trống.')
      patch.bankAccountHolder = holder
    }
    if (data.paymentInstructionNote !== undefined) {
      patch.paymentInstructionNote = text(data.paymentInstructionNote, 1000)
    }
    if (data.refundPolicySummary !== undefined) {
      patch.refundPolicySummary = text(data.refundPolicySummary, 2000)
    }

    await payload.updateGlobal({
      slug: 'nori-site',
      overrideAccess: true,
      context: { skipPermissionCheck: true },
      data: patch,
    })

    const afterConfig = await getSitePaymentConfig(payload)

    await payload
      .create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.config_update',
          entity: 'nori-site',
          entityId: 'payment-config',
          entityLabel: 'Cấu hình thanh toán trực tuyến',
          summary: `Admin ${admin.email} cập nhật cấu hình thanh toán (Provider: ${beforeConfig.activeProvider} → ${afterConfig.activeProvider}, Cọc: ${beforeConfig.reservationDepositPolicyMode}/${beforeConfig.reservationDepositPercent}% → ${afterConfig.reservationDepositPolicyMode}/${afterConfig.reservationDepositPercent}%)`,
          fromStatus: `${beforeConfig.activeProvider}:${beforeConfig.onlinePaymentEnabled ? 'ON' : 'OFF'}`,
          toStatus: `${afterConfig.activeProvider}:${afterConfig.onlinePaymentEnabled ? 'ON' : 'OFF'}`,
          actorType: 'ADMIN',
          actorId: admin.id,
          actorEmail: admin.email,
        },
      })
      .catch(() => null)

    return json({
      config: afterConfig,
      message: 'Đã lưu cấu hình thanh toán trực tuyến và ghi nhận nhật ký kiểm toán.',
    })
  } catch (error) {
    return apiError(error)
  }
}
