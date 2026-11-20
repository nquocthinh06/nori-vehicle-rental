import { APIError, type Payload, type PayloadRequest } from 'payload'
import type { Booking, Payment, Refund } from '../payload-types.ts'
import {
  calculateBookingFinancialSummary,
  calculateReservationDeposit,
  canInitiateOnlinePayment,
  evaluateIncomingTransfer,
  formatVnd,
  isPaymentEventStale,
  mapProviderStatusToInternal,
  paymentTypeLabels,
  relationId,
  roundVndInteger,
  validateRefundRequest,
  type BookingFinancialSummary,
  type PaymentEnvironment,
  type PaymentMethod,
  type PaymentProviderName,
  type PaymentStatus,
  type PaymentType,
  type ReconciliationStatus,
} from './rental-rules.ts'
import {
  generateProviderPaymentCode,
  getPaymentProviderAdapter,
  resolvePaymentRuntimeConfig,
  type BankAccountConfig,
} from './payment-providers.ts'
import { withBookingWriteLock } from './promo-service.ts'

export type SitePaymentConfiguration = {
  onlinePaymentEnabled: boolean
  activeProvider: PaymentProviderName
  environment: PaymentEnvironment
  productionApproved: boolean
  providerConfigured: boolean
  providerConfigMessage: string
  missingCredentials: string[]
  allowSepayQr: boolean
  allowManualBankTransfer: boolean
  allowCashOnHandover: boolean
  allowFullPaymentOnline: boolean
  reservationDepositPolicyMode: 'VEHICLE_FIXED' | 'PERCENT_OF_RENTAL'
  reservationDepositPercent: number
  paymentExpiryMinutes: number
  requireDepositBeforeHandover: boolean
  requireSettlementBeforeComplete: boolean
  bankConfig: BankAccountConfig
  paymentInstructionNote: string | null
  refundPolicySummary: string | null
}

export function buildSitePaymentConfigFromDoc(
  siteDoc: Record<string, unknown> | null | undefined,
): SitePaymentConfiguration {
  const rt = resolvePaymentRuntimeConfig()
  const site = siteDoc ?? {}

  const bankConfig: BankAccountConfig = {
    bankName: String(site.bankName ?? 'Vietcombank').trim() || 'Vietcombank',
    bankCode: String(site.bankCode ?? rt.sepayBankCode ?? 'VCB').trim() || 'VCB',
    bankAccountNumber:
      String(site.bankAccountNumber ?? rt.sepayExpectedAccountNumber ?? '1017588888').trim() ||
      '1017588888',
    bankAccountHolder:
      String(site.bankAccountHolder ?? 'CONG TY TNHH DICH VU PHUONG TIEN NORI').trim() ||
      'CONG TY TNHH DICH VU PHUONG TIEN NORI',
  }

  const configuredProviderRaw = String(
    process.env.PAYMENT_PROVIDER ?? site.activePaymentProvider ?? rt.defaultProvider,
  )
    .trim()
    .toUpperCase()
  const activeProvider: PaymentProviderName = (
    ['SEPAY', 'MOCK', 'MANUAL', 'PAYOS', 'VNPAY', 'MOMO', 'ZALOPAY'].includes(configuredProviderRaw)
      ? configuredProviderRaw
      : rt.defaultProvider
  ) as PaymentProviderName

  const adapter = getPaymentProviderAdapter(activeProvider)
  const providerCheck = adapter.isConfigured(rt.environment, bankConfig)

  const siteOnlineEnabled = site.onlinePaymentEnabled !== false
  const envExplicitDisabled =
    process.env.PAYMENT_ENABLED !== undefined &&
    ['false', '0'].includes(process.env.PAYMENT_ENABLED.trim().toLowerCase()) &&
    rt.environment === 'PRODUCTION'

  const onlinePaymentEnabled = siteOnlineEnabled && !envExplicitDisabled
  const policyMode =
    site.reservationDepositPolicyMode === 'PERCENT_OF_RENTAL'
      ? 'PERCENT_OF_RENTAL'
      : 'VEHICLE_FIXED'
  const pct = Number(site.reservationDepositPercent ?? 30)
  const reservationDepositPercent =
    Number.isFinite(pct) && pct >= 0 && pct <= 100 ? Math.round(pct) : 30
  const expMin = Number(site.paymentExpiryMinutes ?? 30)
  const paymentExpiryMinutes =
    Number.isFinite(expMin) && expMin >= 5 && expMin <= 1440 ? Math.round(expMin) : 30

  return {
    onlinePaymentEnabled,
    activeProvider,
    environment: rt.environment,
    productionApproved: rt.productionApproved,
    providerConfigured: providerCheck.configured,
    providerConfigMessage: providerCheck.message,
    missingCredentials: providerCheck.missingKeys,
    allowSepayQr: site.allowSepayQr !== false,
    allowManualBankTransfer: site.allowManualBankTransfer !== false,
    allowCashOnHandover: site.allowCashOnHandover !== false,
    allowFullPaymentOnline: site.allowFullPaymentOnline !== false,
    reservationDepositPolicyMode: policyMode,
    reservationDepositPercent,
    paymentExpiryMinutes,
    requireDepositBeforeHandover: site.requireDepositBeforeHandover !== false,
    requireSettlementBeforeComplete: Boolean(site.requireSettlementBeforeComplete),
    bankConfig,
    paymentInstructionNote: site.paymentInstructionNote
      ? String(site.paymentInstructionNote)
      : null,
    refundPolicySummary: site.refundPolicySummary ? String(site.refundPolicySummary) : null,
  }
}

export async function getSitePaymentConfig(
  payload: Payload,
  req?: PayloadRequest,
): Promise<SitePaymentConfiguration> {
  let site: Record<string, unknown> = {}
  try {
    const doc = await payload.findGlobal({
      slug: 'nori-site',
      ...(req ? { req } : {}),
      overrideAccess: true,
      draft: false,
      depth: 0,
    })
    site = (doc as unknown as Record<string, unknown>) ?? {}
  } catch {
    site = {}
  }

  return buildSitePaymentConfigFromDoc(site)
}

export function resolveBookingDepositAndSecurityStructure(
  booking: Pick<
    Booking,
    'totalPrice' | 'depositSnapshot' | 'initialPaymentDue' | 'extraFee' | 'status'
  > & {
    paymentOption?: 'DEPOSIT' | 'FULL' | string | null
    reservationDepositSnapshot?: number | null
  },
  config?: Pick<
    SitePaymentConfiguration,
    'reservationDepositPolicyMode' | 'reservationDepositPercent'
  >,
) {
  const totalRentalPrice = roundVndInteger(booking.totalPrice)
  const rawDepositSnapshot = roundVndInteger(booking.depositSnapshot)
  const rawInitialDue = roundVndInteger(booking.initialPaymentDue ?? booking.depositSnapshot)
  const mode = config?.reservationDepositPolicyMode ?? 'VEHICLE_FIXED'
  const pct = config?.reservationDepositPercent ?? 30

  // 1. Customer selected FULL payment plan
  if (booking.paymentOption === 'FULL') {
    const reservationDepositRequired =
      booking.reservationDepositSnapshot != null && Number(booking.reservationDepositSnapshot) > 0
        ? roundVndInteger(booking.reservationDepositSnapshot)
        : calculateReservationDeposit(totalRentalPrice, {
            policyMode: 'PERCENT_OF_RENTAL',
            depositPercent: pct,
          })
    return {
      reservationDepositRequired,
      securityDepositAmount: rawDepositSnapshot,
      deductReservationDepositFromRental: true,
    }
  }

  // 2. Explicit reservation deposit snapshot recorded on the booking document
  if (
    booking.reservationDepositSnapshot != null &&
    Number(booking.reservationDepositSnapshot) > 0
  ) {
    return {
      reservationDepositRequired: roundVndInteger(booking.reservationDepositSnapshot),
      securityDepositAmount: rawDepositSnapshot,
      deductReservationDepositFromRental: true,
    }
  }

  // 3. If policy mode is PERCENT_OF_RENTAL or if the vehicle deposit snapshot is larger than the rental fee
  // (meaning depositSnapshot represents the asset security deposit, e.g. 15,000,000 VND on a 13,010,000 VND rental),
  // calculate the reservation deposit as pct% of the rental fee and track depositSnapshot as securityDepositAmount.
  if (
    mode === 'PERCENT_OF_RENTAL' ||
    (rawDepositSnapshot > totalRentalPrice && totalRentalPrice > 0)
  ) {
    const reservationDepositRequired = calculateReservationDeposit(totalRentalPrice, {
      policyMode: 'PERCENT_OF_RENTAL',
      depositPercent: pct,
    })
    return {
      reservationDepositRequired,
      securityDepositAmount: rawDepositSnapshot,
      deductReservationDepositFromRental: true,
    }
  }

  // Otherwise, use initialPaymentDue / depositSnapshot as the reservation deposit
  const reservationDepositRequired =
    rawInitialDue > 0
      ? rawInitialDue
      : calculateReservationDeposit(totalRentalPrice, {
          policyMode: 'PERCENT_OF_RENTAL',
          depositPercent: pct,
        })

  return {
    reservationDepositRequired,
    securityDepositAmount: 0,
    deductReservationDepositFromRental: true,
  }
}

export function computeBookingFinancialsSync(
  booking: Booking,
  payments: Payment[],
  refunds: Refund[],
  siteConfig?: Pick<
    SitePaymentConfiguration,
    'reservationDepositPolicyMode' | 'reservationDepositPercent'
  >,
): BookingFinancialSummary {
  const structure = resolveBookingDepositAndSecurityStructure(booking, siteConfig)
  return calculateBookingFinancialSummary({
    bookingStatus: String(booking.status ?? 'PENDING'),
    totalRentalPrice: roundVndInteger(booking.totalPrice),
    baseRentPrice: roundVndInteger(booking.baseRentPrice),
    discountAmount: roundVndInteger(booking.discountAmount),
    promoDiscountAmount: roundVndInteger(booking.promoDiscountAmount),
    weekendSurchargeTotal: roundVndInteger(booking.weekendSurchargeTotal),
    deliveryFee: roundVndInteger(booking.deliveryFeeSnapshot),
    addonFeeTotal: roundVndInteger(booking.addonFeeTotal),
    extraFee: roundVndInteger(booking.extraFee),
    reservationDepositRequired: structure.reservationDepositRequired,
    deductReservationDepositFromRental: structure.deductReservationDepositFromRental,
    securityDepositAmount: structure.securityDepositAmount,
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference ?? null,
      paymentType: p.paymentType,
      method: p.method,
      provider: p.provider ?? 'MANUAL',
      amount: p.amount,
      expectedAmount: p.expectedAmount ?? p.amount,
      receivedAmount: p.receivedAmount ?? null,
      refundedAmount: p.refundedAmount ?? 0,
      overpaidAmount: p.overpaidAmount ?? 0,
      status: p.status,
      reconciliationStatus: p.reconciliationStatus ?? 'NONE',
      expiresAt: p.expiresAt ?? null,
      paidAt: p.paidAt ?? null,
      createdAt: p.createdAt,
    })),
    refunds: refunds.map((r) => ({
      id: r.id,
      paymentId: relationId(r.payment) ?? null,
      bookingId: relationId(r.booking) ?? null,
      amount: r.amount,
      refundType: r.refundType,
      status: r.status,
    })),
  })
}

export async function computeBookingFinancialsFromDb(
  payload: Payload,
  booking: Booking,
  options?: {
    payments?: Payment[]
    refunds?: Refund[]
    siteConfig?: SitePaymentConfiguration
    req?: PayloadRequest
  },
): Promise<{
  financial: BookingFinancialSummary
  payments: Payment[]
  refunds: Refund[]
}> {
  const siteConfig = options?.siteConfig ?? (await getSitePaymentConfig(payload, options?.req))
  const [payments, refunds] = await Promise.all([
    options?.payments
      ? Promise.resolve(options.payments)
      : payload
          .find({
            collection: 'payments',
            ...(options?.req ? { req: options.req } : {}),
            overrideAccess: true,
            depth: 0,
            limit: 100,
            sort: '-createdAt',
            where: { booking: { equals: booking.id } },
          })
          .then((r) => r.docs),
    options?.refunds
      ? Promise.resolve(options.refunds)
      : payload
          .find({
            collection: 'refunds',
            ...(options?.req ? { req: options.req } : {}),
            overrideAccess: true,
            depth: 0,
            limit: 100,
            sort: '-createdAt',
            where: { booking: { equals: booking.id } },
          })
          .then((r) => r.docs)
          .catch(() => [] as Refund[]),
  ])

  const financial = computeBookingFinancialsSync(booking, payments, refunds, siteConfig)

  return { financial, payments, refunds }
}

const GLOBAL_SWEEP_THROTTLE_MS = 10_000
let lastGlobalSweepAtMs = 0

export async function sweepExpiredPayments(
  payload: Payload,
  options?: {
    bookingId?: string
    bookingIds?: string[]
    req?: PayloadRequest
    now?: Date
    force?: boolean
  },
): Promise<number> {
  const isUnscopedGlobal =
    !options?.bookingId &&
    !(options?.bookingIds && options.bookingIds.length > 0) &&
    !options?.now &&
    !options?.force
  const nowMs = (options?.now ?? new Date()).getTime()
  if (isUnscopedGlobal && nowMs - lastGlobalSweepAtMs < GLOBAL_SWEEP_THROTTLE_MS) {
    return 0
  }
  if (isUnscopedGlobal) {
    lastGlobalSweepAtMs = nowMs
  }

  const now = options?.now ?? new Date(nowMs)
  const nowIso = now.toISOString()

  const pendingRes = await payload.find({
    collection: 'payments',
    ...(options?.req ? { req: options.req } : {}),
    overrideAccess: true,
    depth: 0,
    limit: 100,
    where: {
      and: [
        { status: { in: ['PENDING', 'PROCESSING'] } },
        { expiresAt: { less_than_equal: nowIso } },
        ...(options?.bookingId ? [{ booking: { equals: options.bookingId } }] : []),
        ...(options?.bookingIds && options.bookingIds.length > 0
          ? [{ booking: { in: options.bookingIds } }]
          : []),
      ],
    },
  })

  let expiredCount = 0
  for (const p of pendingRes.docs) {
    if (!p.expiresAt) continue
    const expMs = Date.parse(p.expiresAt)
    if (!Number.isFinite(expMs) || expMs > now.getTime()) continue

    await payload.update({
      collection: 'payments',
      id: p.id,
      ...(options?.req ? { req: options.req } : {}),
      overrideAccess: true,
      data: {
        status: 'EXPIRED',
        failureReason: 'Yêu cầu thanh toán đã quá thời hạn hiệu lực.',
      },
    })
    expiredCount += 1

    const bId = relationId(p.booking)
    const cId = relationId(p.customer)
    if (cId && bId) {
      try {
        await payload.create({
          collection: 'notifications',
          ...(options?.req ? { req: options.req } : {}),
          overrideAccess: true,
          data: {
            eventKey: `PAYMENT_EXPIRED:${p.id}`,
            customer: cId,
            booking: bId,
            type: 'PAYMENT_EXPIRED',
            title: 'Yêu cầu thanh toán đã hết hạn',
            message: `Mã thanh toán ${p.reference} (${formatVnd(p.amount)}) đã hết thời hạn hiệu lực. Quý khách có thể tạo lại mã VietQR mới tại trang Đơn thuê của tôi nếu đơn vẫn trong thời gian giữ lịch.`,
            paymentConfirmed: false,
            superseded: false,
            isRead: false,
            popupDismissed: true,
          },
        })
      } catch {
        // Ignore duplicate notification
      }
    }
  }

  // Also sweep pending/processing payments for bookings that were cancelled or rejected
  try {
    const cancelledBookingPayments = await payload.find({
      collection: 'payments',
      ...(options?.req ? { req: options.req } : {}),
      overrideAccess: true,
      depth: 1,
      limit: 50,
      where: {
        and: [
          { status: { in: ['PENDING', 'PROCESSING'] } },
          ...(options?.bookingId ? [{ booking: { equals: options.bookingId } }] : []),
          ...(options?.bookingIds && options.bookingIds.length > 0
            ? [{ booking: { in: options.bookingIds } }]
            : []),
        ],
      },
    })
    for (const p of cancelledBookingPayments.docs) {
      const b = typeof p.booking === 'object' && p.booking ? p.booking : null
      if (b && ['CANCELLED', 'REJECTED'].includes(String(b.status))) {
        await payload.update({
          collection: 'payments',
          id: p.id,
          ...(options?.req ? { req: options.req } : {}),
          overrideAccess: true,
          data: {
            status: 'CANCELLED',
            failureReason: `Đơn thuê đã bị ${b.status === 'REJECTED' ? 'từ chối' : 'hủy'}.`,
            note: p.note
              ? `${p.note} · Tự động hủy do đơn thuê chuyển trạng thái ${b.status}`
              : `Tự động hủy do đơn thuê chuyển trạng thái ${b.status}`,
          },
        })
        expiredCount += 1
      }
    }
  } catch {
    // Non-blocking sweep
  }

  return expiredCount
}

export type CreateCustomerPaymentParams = {
  payload: Payload
  user: { id: string; email?: string | null; collection?: string; status?: string }
  bookingId: string
  paymentType?: PaymentType
  method?: PaymentMethod
  provider?: PaymentProviderName
  clientExpectedAmount?: number
  idempotencyKey?: string
}

export async function createOrReuseCustomerPayment(params: CreateCustomerPaymentParams) {
  const { payload, user, bookingId } = params

  return await withBookingWriteLock(async () => {
    await sweepExpiredPayments(payload, { bookingId })

    const siteConfig = await getSitePaymentConfig(payload)
    const booking = await payload
      .findByID({
        collection: 'bookings',
        id: bookingId,
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => null)

    if (!booking) {
      throw new APIError('Không tìm thấy đơn thuê.', 404)
    }

    const ownerId = relationId(booking.customer)
    const isCustomer = user.collection === 'users' && user.status === 'ACTIVE'
    const isOwner = Boolean(ownerId && String(ownerId) === String(user.id))

    if (!isOwner) {
      throw new APIError('Bạn không có quyền truy cập hoặc thanh toán cho đơn thuê này.', 403)
    }

    const { financial, payments } = await computeBookingFinancialsFromDb(payload, booking, {
      siteConfig,
    })

    const requestedType: PaymentType =
      params.paymentType ?? (financial.remainingDepositDue > 0 ? 'DEPOSIT' : 'RENTAL_FEE')

    if (requestedType === 'FULL_PAYMENT' && !siteConfig.allowFullPaymentOnline) {
      throw new APIError('Chức năng thanh toán toàn bộ trực tuyến hiện đang tạm tắt.', 409)
    }

    // Determine authoritative amount due on the server for the requested payment type
    let authoritativeAmount = 0
    if (requestedType === 'DEPOSIT') {
      authoritativeAmount =
        financial.remainingDepositDue > 0
          ? financial.remainingDepositDue
          : financial.totalRemainingRentalObligation
    } else if (requestedType === 'FULL_PAYMENT') {
      authoritativeAmount = financial.totalRemainingRentalObligation
    } else if (requestedType === 'RENTAL_FEE') {
      authoritativeAmount =
        financial.remainingRentalBeforeExtra > 0
          ? financial.remainingRentalBeforeExtra
          : financial.totalRemainingRentalObligation
    } else if (requestedType === 'EXTRA_FEE') {
      authoritativeAmount = financial.remainingExtraFeeDue
    } else if (requestedType === 'SECURITY_DEPOSIT') {
      authoritativeAmount = financial.remainingSecurityDepositDue
    }

    // Strict anti-tampering check (PAY-016): if client supplied an amount that does not match authoritative obligation, reject immediately!
    if (
      params.clientExpectedAmount !== undefined &&
      params.clientExpectedAmount !== null &&
      Number(params.clientExpectedAmount) !== authoritativeAmount
    ) {
      throw new APIError(
        `Số tiền yêu cầu thanh toán không khớp với số dư công nợ trên máy chủ (cần thanh toán: ${formatVnd(authoritativeAmount)}).`,
        400,
      )
    }

    const requestedProvider: PaymentProviderName =
      params.provider ??
      (params.method === 'BANK_TRANSFER' || params.method === 'CASH' || params.method === 'CARD_POS'
        ? 'MANUAL'
        : siteConfig.activeProvider)

    const adapter = getPaymentProviderAdapter(requestedProvider)
    const providerConfigCheck = adapter.isConfigured(siteConfig.environment, siteConfig.bankConfig)

    const eligibility = canInitiateOnlinePayment({
      isLoggedIn: Boolean(user?.id),
      isCustomer,
      isOwner,
      bookingStatus: String(booking.status ?? 'PENDING'),
      paymentType: requestedType,
      requestedAmount: authoritativeAmount,
      onlinePaymentEnabled: requestedProvider === 'MANUAL' ? true : siteConfig.onlinePaymentEnabled,
      environment: siteConfig.environment,
      productionApproved: siteConfig.productionApproved,
      providerConfigured: providerConfigCheck.configured,
    })

    if (!eligibility.allowed) {
      throw new APIError(eligibility.message, eligibility.httpStatus, { code: eligibility.code })
    }

    const resolvedMethod: PaymentMethod =
      params.method ??
      (requestedProvider === 'SEPAY'
        ? 'VIETQR_SEPAY'
        : requestedProvider === 'MOCK'
          ? 'ONLINE_MOCK'
          : 'BANK_TRANSFER')

    const nowMs = Date.now()

    // Check for an existing active PENDING payment intent on this booking to prevent duplicate charges
    // across rapid clicks, page refreshes, multiple tabs, or multiple devices (PAY-010, PAY-011, PAY-012)
    const existingActive = payments.find((p) => {
      if (p.status !== 'PENDING') return false
      const expMs = p.expiresAt ? Date.parse(p.expiresAt) : NaN
      if (Number.isFinite(expMs) && expMs <= nowMs) return false
      if (params.idempotencyKey && p.idempotencyKey === params.idempotencyKey) return true
      return (
        p.paymentType === requestedType &&
        Number(p.amount) === authoritativeAmount &&
        (p.provider ?? 'MANUAL') === requestedProvider
      )
    })

    if (existingActive) {
      const providerDetails = await adapter.createPayment({
        paymentId: existingActive.id,
        paymentReference: String(existingActive.reference ?? existingActive.id),
        providerPaymentRef: String(
          existingActive.providerPaymentRef ?? existingActive.reference ?? existingActive.id,
        ),
        bookingKey: String(booking.bookingKey ?? booking.id),
        amount: authoritativeAmount,
        description:
          `${existingActive.providerPaymentRef ?? existingActive.reference} ${booking.bookingKey ?? ''}`.trim(),
        expiresAt:
          existingActive.expiresAt ??
          new Date(nowMs + siteConfig.paymentExpiryMinutes * 60_000).toISOString(),
        environment: (existingActive.environment as PaymentEnvironment) ?? siteConfig.environment,
        bankConfig: siteConfig.bankConfig,
      })

      return {
        reused: true,
        payment: existingActive,
        providerDetails,
        financial,
      }
    }

    // Cancel any other open PENDING payment intents on this booking (e.g., if user switched from DEPOSIT to FULL_PAYMENT)
    for (const stalePending of payments.filter((p) => p.status === 'PENDING')) {
      await payload.update({
        collection: 'payments',
        id: stalePending.id,
        overrideAccess: true,
        data: {
          status: 'CANCELLED',
          note: `${stalePending.note ? `${stalePending.note} · ` : ''}Tự động hủy do khách hàng chuyển sang yêu cầu thanh toán mới`,
        },
      })
    }

    const reference = `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const providerPaymentRef = generateProviderPaymentCode(
      `${booking.id}:${requestedType}:${authoritativeAmount}:${nowMs}`,
    )
    const expiresAt = new Date(nowMs + siteConfig.paymentExpiryMinutes * 60_000).toISOString()

    const providerDetails = await adapter.createPayment({
      paymentId: reference,
      paymentReference: reference,
      providerPaymentRef,
      bookingKey: String(booking.bookingKey ?? booking.id),
      amount: authoritativeAmount,
      description: `${providerPaymentRef}`,
      expiresAt,
      environment: siteConfig.environment,
      bankConfig: siteConfig.bankConfig,
    })

    const created = await payload.create({
      collection: 'payments',
      overrideAccess: true,
      data: {
        reference,
        booking: booking.id,
        customer: user.id,
        paymentType: requestedType,
        method: resolvedMethod,
        provider: requestedProvider,
        environment: siteConfig.environment,
        currency: 'VND',
        amount: authoritativeAmount,
        expectedAmount: authoritativeAmount,
        receivedAmount: 0,
        refundedAmount: 0,
        overpaidAmount: 0,
        status: 'PENDING',
        reconciliationStatus: 'NONE',
        providerPaymentRef,
        qrImageUrl: providerDetails.qrImageUrl,
        paymentUrl: providerDetails.paymentUrl ?? undefined,
        bankCode: providerDetails.bankCode,
        bankAccountNumber: providerDetails.bankAccountNumber,
        bankAccountName: providerDetails.bankAccountName,
        transferContent: providerDetails.transferContent,
        expiresAt,
        idempotencyKey:
          params.idempotencyKey || `${booking.id}:${requestedType}:${authoritativeAmount}`,
        recordedBy: user.email ?? 'Khách hàng',
        note: `Khởi tạo thanh toán ${paymentTypeLabels[requestedType] ?? requestedType} qua ${requestedProvider} (${providerPaymentRef})`,
      },
    })

    try {
      await payload.create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.create_intent',
          entity: 'payment',
          entityId: created.id,
          entityLabel: reference,
          summary: `Khách hàng tạo yêu cầu thanh toán ${paymentTypeLabels[requestedType] ?? requestedType} (${formatVnd(authoritativeAmount)}) cho đơn ${booking.bookingKey}`,
          fromStatus: 'NONE',
          toStatus: 'PENDING',
          actorType: 'CUSTOMER',
          actorId: user.id,
          actorEmail: user.email ?? undefined,
        },
      })
    } catch {
      // Non-blocking audit log
    }

    const refreshedFinancial = await computeBookingFinancialsFromDb(payload, booking, {
      siteConfig,
    })

    return {
      reused: false,
      payment: created,
      providerDetails,
      financial: refreshedFinancial.financial,
    }
  })
}

export type ProcessWebhookParams = {
  payload: Payload
  providerName: 'SEPAY' | 'MOCK'
  headers: Headers
  rawBody: string
  parsedBody: unknown
  now?: Date
}

export async function processProviderWebhook(params: ProcessWebhookParams): Promise<{
  httpStatus: number
  body: Record<string, unknown>
}> {
  const { payload, providerName, headers, rawBody, parsedBody } = params
  const now = params.now ?? new Date()
  const nowIso = now.toISOString()

  if (rawBody.length > 32_000) {
    return {
      httpStatus: 413,
      body: { success: false, message: 'Payload Webhook vượt quá kích thước cho phép.' },
    }
  }

  const siteConfig = await getSitePaymentConfig(payload)
  const adapter = getPaymentProviderAdapter(providerName)
  const verification = adapter.verifyWebhook({
    headers,
    rawBody,
    environment: siteConfig.environment,
  })
  const normalized = adapter.normalizeWebhookEvent(parsedBody, siteConfig.environment)

  // Step 1: Reject forged or unauthorized webhook requests & log security audit trail (PAY-014)
  if (!verification.verified) {
    try {
      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: `REJECTED:${providerName}:${crypto.randomUUID()}`,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId || 'UNKNOWN',
          paymentReference: normalized.paymentReference ?? undefined,
          eventType: normalized.eventType || 'TRANSFER_IN',
          transferAmount: normalized.transferAmount || 0,
          verificationResult:
            verification.reason === 'ENVIRONMENT_MISMATCH'
              ? 'ENVIRONMENT_MISMATCH'
              : 'INVALID_SIGNATURE',
          processingStatus: 'REJECTED',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          errorReason: verification.message,
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })
      await payload.create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.webhook_forged',
          entity: 'payment-event',
          entityLabel: normalized.externalTransactionId || providerName,
          summary: `Từ chối Webhook không hợp lệ từ ${providerName}: ${verification.message}`,
          fromStatus: 'UNVERIFIED',
          toStatus: 'REJECTED',
          actorType: 'SYSTEM',
        },
      })
    } catch {
      // ignore logging error on forged request
    }
    return {
      httpStatus: 401,
      body: { success: false, code: 'WEBHOOK_UNAUTHORIZED', message: verification.message },
    }
  }

  // Step 2: Validate normalized payload structure
  if (!normalized.valid) {
    try {
      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: normalized.eventId,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId || 'INVALID',
          eventType: 'PAYMENT_FAILED',
          transferAmount: normalized.transferAmount || 0,
          verificationResult: 'INVALID_PAYLOAD',
          processingStatus: 'FAILED',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          errorReason: normalized.errorReason ?? 'Dữ liệu Webhook không hợp lệ.',
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })
    } catch {
      // ignore duplicate malformed eventId
    }
    return {
      httpStatus: 400,
      body: {
        success: false,
        code: 'INVALID_WEBHOOK_PAYLOAD',
        message: normalized.errorReason ?? 'Dữ liệu Webhook không hợp lệ.',
      },
    }
  }

  // Step 3: Execute financial mutation inside serialized write lock
  return await withBookingWriteLock(async () => {
    // Check if this exact eventId has already been processed (PAY-013 Webhook Idempotency)
    const existingEventRes = await payload.find({
      collection: 'payment-events',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { eventId: { equals: normalized.eventId } },
    })

    if (existingEventRes.docs.length > 0) {
      const existingEvt = existingEventRes.docs[0]
      if (
        existingEvt.processingStatus === 'PROCESSED' ||
        existingEvt.processingStatus === 'REVIEW_REQUIRED' ||
        existingEvt.processingStatus === 'IGNORED_DUPLICATE'
      ) {
        await payload.update({
          collection: 'payment-events',
          id: existingEvt.id,
          overrideAccess: true,
          data: {
            retryCount: Number(existingEvt.retryCount ?? 0) + 1,
          },
        })
        return {
          httpStatus: 200,
          body: {
            success: true,
            duplicate: true,
            eventId: normalized.eventId,
            message: 'Sự kiện Webhook trùng lặp đã được bỏ qua an toàn.',
          },
        }
      }
    }

    // Also check if another event already used the same externalTransactionId in the same provider & environment
    const existingTxPaymentRes = await payload.find({
      collection: 'payments',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: {
        and: [
          { providerTransactionId: { equals: normalized.externalTransactionId } },
          { environment: { equals: siteConfig.environment } },
        ],
      },
    })
    if (existingTxPaymentRes.docs.length > 0) {
      const alreadyLinked = existingTxPaymentRes.docs[0]
      await payload
        .create({
          collection: 'payment-events',
          overrideAccess: true,
          data: {
            eventId: normalized.eventId,
            provider: providerName,
            environment: siteConfig.environment,
            externalTransactionId: normalized.externalTransactionId,
            paymentReference: normalized.paymentReference ?? alreadyLinked.reference ?? undefined,
            eventType: normalized.eventType,
            transferAmount: normalized.transferAmount,
            verificationResult: 'DUPLICATE',
            processingStatus: 'IGNORED_DUPLICATE',
            retryCount: 1,
            receivedAt: nowIso,
            processedAt: nowIso,
            payment: alreadyLinked.id,
            booking: relationId(alreadyLinked.booking),
            errorReason: 'Mã giao dịch ngân hàng đã được đối soát trước đó.',
            sanitizedPayload: normalized.sanitizedPayload,
          },
        })
        .catch(() => null)

      return {
        httpStatus: 200,
        body: {
          success: true,
          duplicate: true,
          paymentId: alreadyLinked.id,
          message: 'Giao dịch đã được ghi nhận trước đó.',
        },
      }
    }

    // Locate target Payment by providerPaymentRef or reference, or fallback to Booking by bookingKeyCandidate
    let targetPayment: Payment | null = null
    let targetBooking: Booking | null = null

    if (normalized.paymentReference) {
      const paySearch = await payload.find({
        collection: 'payments',
        overrideAccess: true,
        depth: 0,
        limit: 5,
        sort: '-createdAt',
        where: {
          or: [
            { providerPaymentRef: { equals: normalized.paymentReference } },
            { reference: { equals: normalized.paymentReference } },
          ],
        },
      })
      targetPayment = paySearch.docs[0] ?? null
    }

    if (!targetPayment && normalized.bookingKeyCandidate) {
      const bookingSearch = await payload.find({
        collection: 'bookings',
        overrideAccess: true,
        depth: 0,
        limit: 1,
        where: { bookingKey: { equals: normalized.bookingKeyCandidate } },
      })
      targetBooking = bookingSearch.docs[0] ?? null
      if (targetBooking) {
        const bookingPaySearch = await payload.find({
          collection: 'payments',
          overrideAccess: true,
          depth: 0,
          limit: 5,
          sort: '-createdAt',
          where: {
            and: [
              { booking: { equals: targetBooking.id } },
              { status: { in: ['PENDING', 'PROCESSING', 'PARTIALLY_PAID'] } },
            ],
          },
        })
        targetPayment = bookingPaySearch.docs[0] ?? null
      }
    }

    if (targetPayment && !targetBooking) {
      const bId = relationId(targetPayment.booking)
      if (bId) {
        targetBooking = await payload
          .findByID({
            collection: 'bookings',
            id: bId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
      }
    }

    // Case A: Unmatched transfer (neither Payment nor Booking identified) -> record in REVIEW_REQUIRED (UNMATCHED)
    if (!targetPayment && !targetBooking) {
      const unmatchedPayment = await payload.create({
        collection: 'payments',
        overrideAccess: true,
        context: { allowLateWebhookRecord: true },
        data: {
          reference: `PAY-UNM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          paymentType: 'DEPOSIT',
          method: providerName === 'SEPAY' ? 'VIETQR_SEPAY' : 'ONLINE_MOCK',
          provider: providerName,
          environment: siteConfig.environment,
          currency: 'VND',
          amount: normalized.transferAmount,
          expectedAmount: normalized.transferAmount,
          receivedAmount: normalized.transferAmount,
          status: 'REVIEW_REQUIRED',
          reconciliationStatus: 'UNMATCHED',
          providerTransactionId: normalized.externalTransactionId,
          providerPaymentRef: normalized.paymentReference ?? undefined,
          transferContent: normalized.content,
          paidAt: normalized.transactionDate,
          verifiedAt: nowIso,
          recordedBy: `Webhook ${providerName}`,
          failureReason: 'Không tìm thấy đơn thuê hoặc mã thanh toán khớp nội dung chuyển khoản.',
          note: `Giao dịch chuyển khoản chưa xác định được đơn thuê: ${normalized.content}`,
        },
      })

      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: normalized.eventId,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId,
          paymentReference: unmatchedPayment.reference ?? undefined,
          eventType: normalized.eventType,
          transferAmount: normalized.transferAmount,
          verificationResult: 'VERIFIED',
          processingStatus: 'REVIEW_REQUIRED',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          payment: unmatchedPayment.id,
          errorReason: 'Không tìm thấy đơn thuê khớp mã chuyển khoản — Đã đưa vào Cần đối soát.',
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })

      return {
        httpStatus: 200,
        body: {
          success: true,
          status: 'REVIEW_REQUIRED',
          reconciliationStatus: 'UNMATCHED',
          paymentId: unmatchedPayment.id,
        },
      }
    }

    // Case B: Out-of-order / stale failure or expiry event arriving after payment was already CONFIRMED (PAY-015)
    if (
      targetPayment &&
      (normalized.eventType === 'PAYMENT_FAILED' || normalized.eventType === 'PAYMENT_EXPIRED')
    ) {
      const incomingTargetStatus = normalized.eventType === 'PAYMENT_EXPIRED' ? 'EXPIRED' : 'FAILED'
      if (isPaymentEventStale(targetPayment.status, incomingTargetStatus)) {
        await payload.create({
          collection: 'payment-events',
          overrideAccess: true,
          data: {
            eventId: normalized.eventId,
            provider: providerName,
            environment: siteConfig.environment,
            externalTransactionId: normalized.externalTransactionId,
            paymentReference: targetPayment.reference ?? undefined,
            eventType: normalized.eventType,
            transferAmount: normalized.transferAmount,
            verificationResult: 'VERIFIED',
            processingStatus: 'IGNORED_DUPLICATE',
            retryCount: 0,
            receivedAt: nowIso,
            processedAt: nowIso,
            payment: targetPayment.id,
            booking: targetBooking?.id,
            errorReason: `Bỏ qua sự kiện cũ (${incomingTargetStatus}) do giao dịch đã ở trạng thái ${targetPayment.status}.`,
            sanitizedPayload: normalized.sanitizedPayload,
          },
        })
        return {
          httpStatus: 200,
          body: {
            success: true,
            ignoredStaleEvent: true,
            paymentId: targetPayment.id,
            status: targetPayment.status,
          },
        }
      }

      const updatedFailed = await payload.update({
        collection: 'payments',
        id: targetPayment.id,
        overrideAccess: true,
        data: {
          status: incomingTargetStatus,
          failureReason: `Provider thông báo ${incomingTargetStatus}: ${normalized.content}`,
        },
      })
      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: normalized.eventId,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId,
          paymentReference: targetPayment.reference ?? undefined,
          eventType: normalized.eventType,
          transferAmount: 0,
          verificationResult: 'VERIFIED',
          processingStatus: 'PROCESSED',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          payment: targetPayment.id,
          booking: targetBooking?.id,
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })
      return {
        httpStatus: 200,
        body: {
          success: true,
          paymentId: updatedFailed.id,
          status: updatedFailed.status,
        },
      }
    }

    // Case C: Admin already confirmed this exact payment manually before the Webhook arrived (PAY-026)
    if (
      targetPayment &&
      targetPayment.status === 'CONFIRMED' &&
      targetPayment.reconciliationStatus === 'MANUAL_OVERRIDE' &&
      Number(targetPayment.receivedAmount ?? targetPayment.amount) === normalized.transferAmount
    ) {
      await payload.update({
        collection: 'payments',
        id: targetPayment.id,
        overrideAccess: true,
        data: {
          providerTransactionId:
            targetPayment.providerTransactionId || normalized.externalTransactionId,
          reconciliationStatus: 'MATCHED',
          reconciliationNote: `${targetPayment.reconciliationNote ? `${targetPayment.reconciliationNote} · ` : ''}Webhook ${providerName} (${normalized.externalTransactionId}) đã khớp với xác nhận thủ công, không cộng tiền lần hai.`,
        },
      })

      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: normalized.eventId,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId,
          paymentReference: targetPayment.reference ?? undefined,
          eventType: normalized.eventType,
          transferAmount: normalized.transferAmount,
          verificationResult: 'VERIFIED',
          processingStatus: 'IGNORED_DUPLICATE',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          payment: targetPayment.id,
          booking: targetBooking?.id,
          errorReason: 'Đã khớp với giao dịch Admin xác nhận thủ công trước đó (không cộng trùng).',
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })

      return {
        httpStatus: 200,
        body: {
          success: true,
          matchedManualConfirm: true,
          paymentId: targetPayment.id,
          status: 'CONFIRMED',
        },
      }
    }

    // Case D: Target payment is already CONFIRMED by a previous bank transfer, AND a second distinct transfer arrives!
    // Record the second transfer separately as OVERPAID / REVIEW_REQUIRED so no real money is lost or silently dropped.
    if (targetPayment && targetPayment.status === 'CONFIRMED') {
      const duplicateTransferPayment = await payload.create({
        collection: 'payments',
        overrideAccess: true,
        context: { allowLateWebhookRecord: true },
        data: {
          reference: `PAY-DUP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          booking: targetBooking?.id,
          customer: relationId(targetPayment.customer) ?? relationId(targetBooking?.customer),
          paymentType: targetPayment.paymentType,
          method: providerName === 'SEPAY' ? 'VIETQR_SEPAY' : 'ONLINE_MOCK',
          provider: providerName,
          environment: siteConfig.environment,
          currency: 'VND',
          amount: normalized.transferAmount,
          expectedAmount: 0,
          receivedAmount: normalized.transferAmount,
          overpaidAmount: normalized.transferAmount,
          status: 'REVIEW_REQUIRED',
          reconciliationStatus: 'OVERPAID',
          providerTransactionId: normalized.externalTransactionId,
          providerPaymentRef: normalized.paymentReference ?? undefined,
          transferContent: normalized.content,
          paidAt: normalized.transactionDate,
          verifiedAt: nowIso,
          recordedBy: `Webhook ${providerName}`,
          failureReason: `Khách hàng chuyển khoản thêm lần thứ hai (${formatVnd(normalized.transferAmount)}) cho mã ${targetPayment.reference} đã hoàn tất.`,
          note: `Khoản chuyển thừa cần đối soát hoàn tiền (Mã GD NH: ${normalized.externalTransactionId})`,
        },
      })

      await payload.create({
        collection: 'payment-events',
        overrideAccess: true,
        data: {
          eventId: normalized.eventId,
          provider: providerName,
          environment: siteConfig.environment,
          externalTransactionId: normalized.externalTransactionId,
          paymentReference: duplicateTransferPayment.reference ?? undefined,
          eventType: normalized.eventType,
          transferAmount: normalized.transferAmount,
          verificationResult: 'VERIFIED',
          processingStatus: 'REVIEW_REQUIRED',
          retryCount: 0,
          receivedAt: nowIso,
          processedAt: nowIso,
          payment: duplicateTransferPayment.id,
          booking: targetBooking?.id,
          errorReason: 'Khách chuyển khoản thừa lần 2 sau khi giao dịch gốc đã thanh toán đủ.',
          sanitizedPayload: normalized.sanitizedPayload,
        },
      })

      return {
        httpStatus: 200,
        body: {
          success: true,
          status: 'REVIEW_REQUIRED',
          reconciliationStatus: 'OVERPAID',
          paymentId: duplicateTransferPayment.id,
        },
      }
    }

    // Case E: Standard or Late/Partial/Overpaid transfer evaluation against targetPayment (or targetBooking)
    if (!targetPayment && targetBooking) {
      targetPayment = await payload.create({
        collection: 'payments',
        overrideAccess: true,
        context: { allowLateWebhookRecord: true },
        data: {
          reference: `PAY-WH-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          booking: targetBooking.id,
          customer: relationId(targetBooking.customer),
          paymentType: 'DEPOSIT',
          method: providerName === 'SEPAY' ? 'VIETQR_SEPAY' : 'ONLINE_MOCK',
          provider: providerName,
          environment: siteConfig.environment,
          currency: 'VND',
          amount: normalized.transferAmount,
          expectedAmount: Number(
            targetBooking.initialPaymentDue ||
              targetBooking.depositSnapshot ||
              targetBooking.totalPrice ||
              normalized.transferAmount,
          ),
          receivedAmount: 0,
          status: 'PENDING',
          reconciliationStatus: 'NONE',
        },
      })
    }

    const expectedAmt = roundVndInteger(targetPayment!.expectedAmount ?? targetPayment!.amount)
    const prevReceived =
      targetPayment!.status === 'PARTIALLY_PAID'
        ? roundVndInteger(targetPayment!.receivedAmount)
        : 0

    const evalResult = evaluateIncomingTransfer({
      expectedAmount: expectedAmt,
      previouslyReceivedAmount: prevReceived,
      incomingAmount: normalized.transferAmount,
      paymentStatus: targetPayment!.status,
      bookingStatus: targetBooking?.status ?? 'CONFIRMED',
      expiresAt: targetPayment!.expiresAt ?? null,
      now,
    })

    const updatedPayment = await payload.update({
      collection: 'payments',
      id: targetPayment!.id,
      overrideAccess: true,
      context: { allowLateWebhookRecord: true },
      data: {
        status: evalResult.nextPaymentStatus,
        reconciliationStatus: evalResult.reconciliationStatus,
        receivedAmount: evalResult.newReceivedAmount,
        overpaidAmount: evalResult.overpaidAmount,
        providerTransactionId: normalized.externalTransactionId,
        verifiedAt: nowIso,
        paidAt: normalized.transactionDate || nowIso,
        recordedBy: `Webhook ${providerName}`,
        failureReason:
          evalResult.reconciliationStatus !== 'MATCHED' ? evalResult.summaryMessage : undefined,
        note: `${targetPayment!.note ? `${targetPayment!.note} · ` : ''}${evalResult.summaryMessage} (GD: ${normalized.externalTransactionId})`,
      },
    })

    // Record durable payment-event
    const createdEvent = await payload.create({
      collection: 'payment-events',
      overrideAccess: true,
      data: {
        eventId: normalized.eventId,
        provider: providerName,
        environment: siteConfig.environment,
        externalTransactionId: normalized.externalTransactionId,
        paymentReference: updatedPayment.reference ?? undefined,
        eventType: normalized.eventType,
        transferAmount: normalized.transferAmount,
        verificationResult: 'VERIFIED',
        processingStatus:
          evalResult.nextPaymentStatus === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'PROCESSED',
        retryCount: 0,
        receivedAt: nowIso,
        processedAt: nowIso,
        payment: updatedPayment.id,
        booking: targetBooking?.id,
        errorReason:
          evalResult.reconciliationStatus !== 'MATCHED' ? evalResult.summaryMessage : undefined,
        sanitizedPayload: normalized.sanitizedPayload,
      },
    })

    // If booking exists and obligation is confirmed (and not late/closed), synchronize Booking state & Notifications
    let bookingTransitionedTo: string | null = null
    if (targetBooking) {
      const { financial } = await computeBookingFinancialsFromDb(payload, targetBooking, {
        siteConfig,
      })

      if (
        evalResult.shouldConfirmBookingObligation &&
        targetBooking.status === 'DEPOSIT_PENDING' &&
        financial.remainingDepositDue === 0
      ) {
        const updatedBooking = await payload.update({
          collection: 'bookings',
          id: targetBooking.id,
          overrideAccess: true,
          context: {
            noriSystemPaymentSync: true,
            noriSystemActorLabel: `Hệ thống thanh toán (${providerName})`,
          },
          data: {
            status: 'CONFIRMED',
            handoverNote: `${targetBooking.handoverNote ? `${targetBooking.handoverNote} · ` : ''}Đã xác minh tự động khoản thanh toán ${formatVnd(evalResult.newReceivedAmount)} qua ${providerName} (${normalized.externalTransactionId}).`,
          },
        })
        bookingTransitionedTo = updatedBooking.status ?? 'CONFIRMED'
      } else if (evalResult.shouldConfirmBookingObligation) {
        // Update existing BOOKING_CONFIRMED notifications so popup knows payment is confirmed
        const existingNotifs = await payload.find({
          collection: 'notifications',
          overrideAccess: true,
          depth: 0,
          limit: 5,
          where: {
            and: [
              { booking: { equals: targetBooking.id } },
              { type: { equals: 'BOOKING_CONFIRMED' } },
            ],
          },
        })
        for (const n of existingNotifs.docs) {
          await payload.update({
            collection: 'notifications',
            id: n.id,
            overrideAccess: true,
            data: { paymentConfirmed: true },
          })
        }
      }

      // Send customer notification for payment verification outcome (once per eventId)
      const customerId = relationId(targetBooking.customer)
      if (customerId) {
        const notifType =
          evalResult.nextPaymentStatus === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_FAILED'
        const notifTitle =
          evalResult.nextPaymentStatus === 'CONFIRMED'
            ? evalResult.overpaidAmount > 0
              ? 'Đã nhận thanh toán (Đang đối soát khoản tiền thừa)'
              : 'Thanh toán trực tuyến thành công!'
            : evalResult.nextPaymentStatus === 'PARTIALLY_PAID'
              ? 'Đã ghi nhận một phần thanh toán — Vẫn còn thiếu số dư'
              : 'Giao dịch thanh toán đang chờ chuyên viên đối soát'

        try {
          await payload.create({
            collection: 'notifications',
            overrideAccess: true,
            data: {
              eventKey: `WEBHOOK_PAY:${normalized.eventId}`,
              customer: customerId,
              booking: targetBooking.id,
              type: notifType,
              title: notifTitle,
              message: `Đơn thuê ${targetBooking.bookingKey}: ${evalResult.summaryMessage}`,
              bookingKey: String(targetBooking.bookingKey ?? targetBooking.id),
              vehicleName: targetBooking.vehicleNameSnapshot ?? 'Phương tiện NORI',
              startDate: targetBooking.startDate,
              endDate: targetBooking.endDate,
              paymentConfirmed: evalResult.nextPaymentStatus === 'CONFIRMED',
              superseded: false,
              isRead: false,
              popupDismissed: true,
            },
          })
        } catch {
          // Ignore duplicate notification
        }
      }
    }

    try {
      await payload.create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.webhook_processed',
          entity: 'payment',
          entityId: updatedPayment.id,
          entityLabel: String(updatedPayment.reference ?? updatedPayment.id),
          summary: `Webhook ${providerName} (${normalized.externalTransactionId}): ${evalResult.summaryMessage}`,
          fromStatus: targetPayment!.status,
          toStatus: updatedPayment.status,
          actorType: 'SYSTEM',
        },
      })
    } catch {
      // Non-blocking audit log
    }

    return {
      httpStatus: 200,
      body: {
        success: true,
        eventId: createdEvent.eventId,
        paymentId: updatedPayment.id,
        paymentReference: updatedPayment.reference,
        status: updatedPayment.status,
        reconciliationStatus: updatedPayment.reconciliationStatus,
        receivedAmount: updatedPayment.receivedAmount,
        overpaidAmount: updatedPayment.overpaidAmount,
        bookingTransitionedTo,
        message: evalResult.summaryMessage,
      },
    }
  })
}

export async function confirmPaymentManuallyByAdmin(params: {
  payload: Payload
  admin: { id: string; email: string }
  paymentId: string
  reason: string
  transactionEvidence: string
  receivedAmount?: number
}) {
  const { payload, admin, paymentId, reason, transactionEvidence } = params
  const cleanReason = String(reason ?? '').trim()
  const cleanEvidence = String(transactionEvidence ?? '').trim()

  if (!cleanReason) {
    throw new APIError('Vui lòng nhập lý do xác nhận thanh toán thủ công.', 400)
  }
  if (!cleanEvidence) {
    throw new APIError('Vui lòng cung cấp mã giao dịch ngân hàng hoặc bằng chứng đối soát.', 400)
  }

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
      throw new APIError('Không tìm thấy giao dịch thanh toán.', 404)
    }

    // Idempotent guard if already CONFIRMED (e.g. Webhook arrived concurrently — PAY-026)
    if (payment.status === 'CONFIRMED') {
      return {
        alreadyConfirmed: true,
        payment,
        message: 'Giao dịch này đã được xác nhận trước đó (không cộng tiền trùng lặp).',
      }
    }
    if (payment.status === 'REFUNDED') {
      throw new APIError('Giao dịch đã hoàn tiền không thể xác nhận thu lại.', 409)
    }

    const bookingId = relationId(payment.booking)
    let booking: Booking | null = null
    if (bookingId) {
      booking = await payload
        .findByID({
          collection: 'bookings',
          id: bookingId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
      if (booking && ['CANCELLED', 'REJECTED'].includes(String(booking.status ?? ''))) {
        throw new APIError(
          'Đơn thuê đã hủy hoặc từ chối. Nếu khách chuyển khoản muộn, vui lòng chuyển sang quy trình đối soát hoàn tiền.',
          409,
        )
      }
    }

    const expectedAmt = roundVndInteger(payment.expectedAmount ?? payment.amount)
    const verifiedReceived =
      params.receivedAmount !== undefined && params.receivedAmount !== null
        ? roundVndInteger(params.receivedAmount)
        : expectedAmt
    if (verifiedReceived <= 0) {
      throw new APIError('Số tiền xác nhận thực nhận phải lớn hơn 0.', 400)
    }

    const nowIso = new Date().toISOString()
    const nextStatus: PaymentStatus =
      verifiedReceived < expectedAmt ? 'PARTIALLY_PAID' : 'CONFIRMED'
    const nextRecon: ReconciliationStatus =
      verifiedReceived < expectedAmt
        ? 'UNDERPAID'
        : verifiedReceived > expectedAmt
          ? 'OVERPAID'
          : 'MANUAL_OVERRIDE'
    const overpaid = Math.max(0, verifiedReceived - expectedAmt)

    const updatedPayment = await payload.update({
      collection: 'payments',
      id: payment.id,
      overrideAccess: true,
      data: {
        status: nextStatus,
        reconciliationStatus: nextRecon,
        receivedAmount: verifiedReceived,
        overpaidAmount: overpaid,
        providerTransactionId: payment.providerTransactionId || cleanEvidence,
        verifiedAt: nowIso,
        paidAt: payment.paidAt || nowIso,
        recordedBy: admin.email,
        reconciliationNote: `Admin (${admin.email}) xác nhận thủ công. Mã đối chiếu: ${cleanEvidence}. Lý do: ${cleanReason}`,
      },
    })

    if (booking && nextStatus === 'CONFIRMED') {
      const { financial } = await computeBookingFinancialsFromDb(payload, booking)
      if (booking.status === 'DEPOSIT_PENDING' && financial.remainingDepositDue === 0) {
        await payload.update({
          collection: 'bookings',
          id: booking.id,
          overrideAccess: true,
          context: {
            noriSystemPaymentSync: true,
            noriSystemActorLabel: admin.email,
          },
          data: {
            status: 'CONFIRMED',
            handoverNote: `${booking.handoverNote ? `${booking.handoverNote} · ` : ''}Admin (${admin.email}) xác nhận đã nhận cọc (${cleanEvidence}).`,
          },
        })
      }
      const customerId = relationId(booking.customer)
      if (customerId) {
        await payload
          .create({
            collection: 'notifications',
            overrideAccess: true,
            data: {
              eventKey: `MANUAL_CONFIRM:${payment.id}:${nowIso.slice(0, 16)}`,
              customer: customerId,
              booking: booking.id,
              type: 'PAYMENT_CONFIRMED',
              title: 'Đã xác nhận thanh toán đơn thuê',
              message: `Khoản thanh toán ${formatVnd(verifiedReceived)} (Mã phiếu ${payment.reference}) của đơn ${booking.bookingKey} đã được chuyên viên NORI đối soát và xác nhận.`,
              bookingKey: String(booking.bookingKey ?? booking.id),
              vehicleName: booking.vehicleNameSnapshot ?? 'Phương tiện NORI',
              paymentConfirmed: true,
              superseded: false,
              isRead: false,
              popupDismissed: true,
            },
          })
          .catch(() => null)
      }
    }

    await payload
      .create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.manual_confirm',
          entity: 'payment',
          entityId: updatedPayment.id,
          entityLabel: String(updatedPayment.reference ?? updatedPayment.id),
          summary: `Admin ${admin.email} xác nhận thủ công ${formatVnd(verifiedReceived)} (Chứng từ: ${cleanEvidence} · Lý do: ${cleanReason})`,
          fromStatus: payment.status,
          toStatus: updatedPayment.status,
          actorType: 'ADMIN',
          actorId: admin.id,
          actorEmail: admin.email,
        },
      })
      .catch(() => null)

    return {
      alreadyConfirmed: false,
      payment: updatedPayment,
      message: 'Đã xác nhận giao dịch thanh toán thủ công và lưu nhật ký kiểm toán.',
    }
  })
}

export async function createOrProcessAdminRefund(params: {
  payload: Payload
  admin: { id: string; email: string; hasPaymentUpdatePermission: boolean }
  action: 'create' | 'approve' | 'complete' | 'reject'
  bookingId?: string
  paymentId?: string
  refundId?: string
  amount?: number
  refundType?:
    | 'CANCELLATION'
    | 'DEPOSIT_RETURN'
    | 'OVERPAYMENT'
    | 'PARTIAL_ADJUSTMENT'
    | 'SECURITY_DEPOSIT_RETURN'
  reason?: string
  providerRefundId?: string
  reconciliationNote?: string
  bankAccountInfo?: string
}) {
  const { payload, admin } = params

  return await withBookingWriteLock(async () => {
    const nowIso = new Date().toISOString()

    if (params.action === 'create') {
      const bookingId = params.bookingId
      if (!bookingId) throw new APIError('Thiếu mã đơn thuê cần hoàn tiền.', 400)
      const booking = await payload
        .findByID({
          collection: 'bookings',
          id: bookingId,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => null)
      if (!booking) throw new APIError('Không tìm thấy đơn thuê.', 404)

      const { financial, payments, refunds } = await computeBookingFinancialsFromDb(
        payload,
        booking,
      )

      let targetPayment: Payment | null = null
      if (params.paymentId) {
        targetPayment = payments.find((p) => p.id === params.paymentId) ?? null
        if (!targetPayment) {
          throw new APIError('Giao dịch gốc được chọn không thuộc đơn thuê này.', 400)
        }
      } else {
        targetPayment =
          payments.find((p) =>
            ['CONFIRMED', 'PARTIALLY_PAID', 'REVIEW_REQUIRED', 'PARTIALLY_REFUNDED'].includes(
              p.status,
            ),
          ) ?? null
      }

      // Check for duplicate active refund request with same amount & payment
      const duplicateHit = refunds.some(
        (r) =>
          ['REQUESTED', 'APPROVED', 'PROCESSING'].includes(r.status) &&
          Number(r.amount) === Number(params.amount) &&
          (!targetPayment || relationId(r.payment) === targetPayment.id),
      )

      const paymentReceived = targetPayment
        ? roundVndInteger(targetPayment.receivedAmount ?? targetPayment.amount)
        : financial.totalVerifiedReceived
      const paymentRefunded = targetPayment
        ? roundVndInteger(targetPayment.refundedAmount)
        : financial.totalRefundedAmount

      const effectiveReceived = Math.min(financial.totalVerifiedReceived, paymentReceived)
      const effectiveRefunded = Math.max(financial.totalRefundedAmount, paymentRefunded)

      const check = validateRefundRequest({
        isAdmin: true,
        hasPaymentUpdatePermission: admin.hasPaymentUpdatePermission,
        totalVerifiedReceived: effectiveReceived,
        alreadyRefundedAmount: effectiveRefunded,
        pendingRefundAmount: financial.pendingRefundAmount,
        requestedRefundAmount: Number(params.amount ?? 0),
        reason: params.reason,
        duplicateIdempotencyHit: duplicateHit,
      })

      if (!check.allowed) {
        throw new APIError(check.message, check.httpStatus, { code: check.code })
      }

      const cleanAmount = roundVndInteger(params.amount)
      const providerName = (targetPayment?.provider ?? 'MANUAL') as 'MANUAL' | 'MOCK' | 'SEPAY'
      const adapter = getPaymentProviderAdapter(providerName)
      const refundRef = `REF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const providerResult = await adapter.createRefund({
        refundReference: refundRef,
        paymentReference: String(targetPayment?.reference ?? booking.bookingKey),
        amount: cleanAmount,
        reason: String(params.reason).trim(),
      })

      const createdRefund = await payload.create({
        collection: 'refunds',
        overrideAccess: true,
        data: {
          reference: refundRef,
          booking: booking.id,
          payment: targetPayment?.id,
          customer: relationId(booking.customer),
          refundType: params.refundType ?? 'DEPOSIT_RETURN',
          amount: cleanAmount,
          reason: String(params.reason).trim(),
          status: 'PROCESSING',
          provider: providerName,
          providerRefundId: params.providerRefundId?.trim() || providerResult.providerRefundId,
          requestedBy: admin.email,
          requestedByType: 'ADMIN',
          approvedBy: admin.email,
          requestedAt: nowIso,
          approvedAt: nowIso,
          reconciliationNote: params.reconciliationNote?.trim() || providerResult.message,
          bankAccountInfo: params.bankAccountInfo?.trim() || undefined,
        },
      })

      if (targetPayment) {
        await payload.update({
          collection: 'payments',
          id: targetPayment.id,
          overrideAccess: true,
          data: {
            status: 'REFUND_PENDING',
          },
        })
      }

      const customerId = relationId(booking.customer)
      if (customerId) {
        await payload
          .create({
            collection: 'notifications',
            overrideAccess: true,
            data: {
              eventKey: `REFUND_PROC:${createdRefund.id}`,
              customer: customerId,
              booking: booking.id,
              type: 'REFUND_PROCESSING',
              title: 'Yêu cầu hoàn tiền đang được xử lý',
              message: `Yêu cầu hoàn tiền ${formatVnd(cleanAmount)} (Mã ${createdRefund.reference}) cho đơn ${booking.bookingKey} đã được phê duyệt và đang trong quá trình xử lý chuyển khoản.`,
              bookingKey: String(booking.bookingKey ?? booking.id),
              vehicleName: booking.vehicleNameSnapshot ?? 'Phương tiện NORI',
              superseded: false,
              isRead: false,
              popupDismissed: true,
            },
          })
          .catch(() => null)
      }

      return {
        refund: createdRefund,
        providerResult,
        message: 'Đã tạo và phê duyệt yêu cầu hoàn tiền (Trạng thái: Đang xử lý hoàn tiền).',
      }
    }

    // Complete / Approve / Reject an existing Refund
    if (!params.refundId) {
      throw new APIError('Thiếu mã yêu cầu hoàn tiền.', 400)
    }
    const existingRefund = await payload
      .findByID({
        collection: 'refunds',
        id: params.refundId,
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => null)
    if (!existingRefund) {
      throw new APIError('Không tìm thấy yêu cầu hoàn tiền.', 404)
    }
    if (existingRefund.status === 'REFUNDED') {
      throw new APIError('Yêu cầu hoàn tiền này đã được xác nhận hoàn tất trước đó.', 409)
    }

    const bookingId = relationId(existingRefund.booking)
    const booking = bookingId
      ? await payload
          .findByID({
            collection: 'bookings',
            id: bookingId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
      : null

    if (params.action === 'reject') {
      const rejected = await payload.update({
        collection: 'refunds',
        id: existingRefund.id,
        overrideAccess: true,
        data: {
          status: 'REJECTED',
          reconciliationNote:
            params.reconciliationNote?.trim() || 'Đã hủy/từ chối yêu cầu hoàn tiền.',
        },
      })
      const pId = relationId(existingRefund.payment)
      if (pId) {
        const origPay = await payload
          .findByID({ collection: 'payments', id: pId, overrideAccess: true, depth: 0 })
          .catch(() => null)
        if (origPay && origPay.status === 'REFUND_PENDING') {
          await payload.update({
            collection: 'payments',
            id: origPay.id,
            overrideAccess: true,
            data: {
              status: Number(origPay.refundedAmount ?? 0) > 0 ? 'PARTIALLY_REFUNDED' : 'CONFIRMED',
            },
          })
        }
      }
      return { refund: rejected, message: 'Đã từ chối yêu cầu hoàn tiền.' }
    }

    // Action: complete (Verify actual refund completion)
    const completedRefund = await payload.update({
      collection: 'refunds',
      id: existingRefund.id,
      overrideAccess: true,
      data: {
        status: 'REFUNDED',
        completedBy: admin.email,
        completedAt: nowIso,
        providerRefundId:
          params.providerRefundId?.trim() ||
          existingRefund.providerRefundId ||
          `UNC-${nowIso.slice(0, 10).replace(/-/g, '')}`,
        reconciliationNote:
          params.reconciliationNote?.trim() ||
          existingRefund.reconciliationNote ||
          `Admin ${admin.email} xác nhận đã hoàn tất chi hoàn tiền.`,
      },
    })

    const pId = relationId(existingRefund.payment)
    if (pId) {
      const origPay = await payload
        .findByID({ collection: 'payments', id: pId, overrideAccess: true, depth: 0 })
        .catch(() => null)
      if (origPay) {
        const origReceived = roundVndInteger(origPay.receivedAmount ?? origPay.amount)
        const nextRefundedTotal = Math.min(
          origReceived,
          roundVndInteger(origPay.refundedAmount) + roundVndInteger(existingRefund.amount),
        )
        const nextPayStatus: PaymentStatus =
          nextRefundedTotal >= origReceived ? 'REFUNDED' : 'PARTIALLY_REFUNDED'

        await payload.update({
          collection: 'payments',
          id: origPay.id,
          overrideAccess: true,
          data: {
            refundedAmount: nextRefundedTotal,
            status: nextPayStatus,
            reconciliationStatus: 'RESOLVED',
          },
        })
      }
    }

    const customerId = relationId(existingRefund.customer) ?? relationId(booking?.customer)
    if (customerId && booking) {
      await payload
        .create({
          collection: 'notifications',
          overrideAccess: true,
          data: {
            eventKey: `REFUND_DONE:${completedRefund.id}`,
            customer: customerId,
            booking: booking.id,
            type: 'REFUND_COMPLETED',
            title: 'Hoàn tiền thành công!',
            message: `Khoản hoàn tiền ${formatVnd(completedRefund.amount)} (Mã ${completedRefund.reference}) cho đơn thuê ${booking.bookingKey} đã được hoàn tất.`,
            bookingKey: String(booking.bookingKey ?? booking.id),
            vehicleName: booking.vehicleNameSnapshot ?? 'Phương tiện NORI',
            superseded: false,
            isRead: false,
            popupDismissed: true,
          },
        })
        .catch(() => null)
    }

    await payload
      .create({
        collection: 'audit-logs',
        overrideAccess: true,
        data: {
          action: 'payment.refund_completed',
          entity: 'refund',
          entityId: completedRefund.id,
          entityLabel: String(completedRefund.reference ?? completedRefund.id),
          summary: `Admin ${admin.email} xác nhận hoàn tất hoàn tiền ${formatVnd(completedRefund.amount)} cho đơn ${booking?.bookingKey ?? bookingId}`,
          fromStatus: existingRefund.status,
          toStatus: 'REFUNDED',
          actorType: 'ADMIN',
          actorId: admin.id,
          actorEmail: admin.email,
        },
      })
      .catch(() => null)

    return {
      refund: completedRefund,
      message: `Đã xác nhận hoàn tất hoàn tiền ${formatVnd(completedRefund.amount)}.`,
    }
  })
}
