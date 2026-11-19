import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKING_PAYMENT_SUMMARIES,
  PAYMENT_ENVIRONMENTS,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  RECONCILIATION_STATUSES,
  REFUND_STATUSES,
  calculateBookingFinancialSummary,
  calculateReservationDeposit,
  canInitiateOnlinePayment,
  canModifyBooking,
  canTransitionPayment,
  checkHandoverFinancialEligibility,
  checkSettlementCompletionEligibility,
  evaluateIncomingTransfer,
  isPaymentEventStale,
  mapProviderStatusToInternal,
  roundVndInteger,
  validateRefundRequest,
} from '../src/lib/rental-rules.ts'
import {
  ManualPaymentProvider,
  MockPaymentProvider,
  MoMoProvider,
  PayOSProvider,
  SePayProvider,
  VNPayProvider,
  ZaloPayProvider,
  extractPaymentCodeFromContent,
  generateProviderPaymentCode,
  generateVietQrSvgDataUri,
  getPaymentProviderAdapter,
  sanitizeWebhookPayload,
  timingSafeSecretCompare,
} from '../src/lib/payment-providers.ts'
import { resolveBookingDepositAndSecurityStructure } from '../src/lib/payment-service.ts'

test('Unit: payment domain constants and status enumerations are complete', () => {
  assert.ok(PAYMENT_STATUSES.includes('PENDING'))
  assert.ok(PAYMENT_STATUSES.includes('CONFIRMED'))
  assert.ok(PAYMENT_STATUSES.includes('PARTIALLY_REFUNDED'))
  assert.ok(PAYMENT_STATUSES.includes('REFUNDED'))
  assert.ok(PAYMENT_TYPES.includes('DEPOSIT'))
  assert.ok(PAYMENT_TYPES.includes('RENTAL_FEE'))
  assert.ok(PAYMENT_TYPES.includes('FULL_PAYMENT'))
  assert.ok(PAYMENT_TYPES.includes('SECURITY_DEPOSIT'))
  assert.ok(PAYMENT_METHODS.includes('VIETQR_SEPAY'))
  assert.ok(PAYMENT_PROVIDERS.includes('SEPAY'))
  assert.ok(PAYMENT_PROVIDERS.includes('MOCK'))
  assert.ok(PAYMENT_ENVIRONMENTS.includes('MOCK'))
  assert.ok(RECONCILIATION_STATUSES.includes('UNDERPAID'))
  assert.ok(RECONCILIATION_STATUSES.includes('OVERPAID'))
  assert.ok(REFUND_STATUSES.includes('REFUNDED'))
  assert.ok(BOOKING_PAYMENT_SUMMARIES.includes('DEPOSIT_PAID'))
  assert.ok(BOOKING_PAYMENT_SUMMARIES.includes('FULLY_PAID'))
})

test('Unit (Section 6.3 Reference Fixture): financial formula calculates deposit, remaining rental, extra fee, and separates security deposit from rental revenue', () => {
  // Base rental = 3,000,000 VND (3 days x 1,000,000)
  // Promotion discount = 300,000 VND -> Total rental after promo = 2,700,000 VND
  // Reservation deposit = 30% = 810,000 VND
  // Security deposit = 5,000,000 VND (tracked independently)
  const reservationDeposit = calculateReservationDeposit(2_700_000, {
    policyMode: 'PERCENT_OF_RENTAL',
    depositPercent: 30,
  })
  assert.equal(reservationDeposit, 810_000)

  // Step 1: Unpaid approved booking
  const step1 = calculateBookingFinancialSummary({
    bookingStatus: 'DEPOSIT_PENDING',
    totalRentalPrice: 2_700_000,
    baseRentPrice: 3_000_000,
    promoDiscountAmount: 300_000,
    extraFee: 0,
    reservationDepositRequired: 810_000,
    deductReservationDepositFromRental: true,
    securityDepositAmount: 5_000_000,
    payments: [],
    refunds: [],
  })
  assert.equal(step1.reservationDepositRequired, 810_000)
  assert.equal(step1.remainingDepositDue, 810_000)
  assert.equal(step1.remainingRentalBeforeExtra, 2_700_000)
  assert.equal(step1.totalRemainingRentalObligation, 2_700_000)
  assert.equal(step1.securityDepositAmount, 5_000_000)
  assert.equal(step1.remainingSecurityDepositDue, 5_000_000)
  assert.equal(step1.rentalRevenueCollected, 0)
  assert.equal(step1.paymentStatusSummary, 'UNPAID')

  // Step 2: Customer pays reservation deposit 810,000 VND -> remaining rental = 1,890,000 VND
  const step2 = calculateBookingFinancialSummary({
    bookingStatus: 'CONFIRMED',
    totalRentalPrice: 2_700_000,
    baseRentPrice: 3_000_000,
    promoDiscountAmount: 300_000,
    extraFee: 0,
    reservationDepositRequired: 810_000,
    deductReservationDepositFromRental: true,
    securityDepositAmount: 5_000_000,
    payments: [
      {
        id: 'pay-dep-1',
        paymentType: 'DEPOSIT',
        method: 'VIETQR_SEPAY',
        provider: 'SEPAY',
        amount: 810_000,
        expectedAmount: 810_000,
        receivedAmount: 810_000,
        status: 'CONFIRMED',
      },
    ],
    refunds: [],
  })
  assert.equal(step2.paidDepositAmount, 810_000)
  assert.equal(step2.remainingDepositDue, 0)
  assert.equal(step2.remainingRentalBeforeExtra, 1_890_000)
  assert.equal(step2.totalRemainingRentalObligation, 1_890_000)
  assert.equal(step2.rentalRevenueCollected, 810_000)
  assert.equal(step2.paymentStatusSummary, 'DEPOSIT_PAID')

  // Step 3: Extra fee 200,000 VND arises -> total remaining obligation = 1,890,000 + 200,000 = 2,090,000 VND
  // Also customer deposits 5,000,000 VND security deposit -> must NOT be added to rentalRevenueCollected!
  const step3 = calculateBookingFinancialSummary({
    bookingStatus: 'ONGOING',
    totalRentalPrice: 2_700_000,
    baseRentPrice: 3_000_000,
    promoDiscountAmount: 300_000,
    extraFee: 200_000,
    reservationDepositRequired: 810_000,
    deductReservationDepositFromRental: true,
    securityDepositAmount: 5_000_000,
    payments: [
      {
        id: 'pay-dep-1',
        paymentType: 'DEPOSIT',
        method: 'VIETQR_SEPAY',
        provider: 'SEPAY',
        amount: 810_000,
        expectedAmount: 810_000,
        receivedAmount: 810_000,
        status: 'CONFIRMED',
      },
      {
        id: 'pay-sec-1',
        paymentType: 'SECURITY_DEPOSIT',
        method: 'BANK_TRANSFER',
        provider: 'MANUAL',
        amount: 5_000_000,
        expectedAmount: 5_000_000,
        receivedAmount: 5_000_000,
        status: 'CONFIRMED',
      },
    ],
    refunds: [],
  })
  assert.equal(step3.remainingRentalBeforeExtra, 1_890_000)
  assert.equal(step3.remainingExtraFeeDue, 200_000)
  assert.equal(step3.totalRemainingRentalObligation, 2_090_000)
  assert.equal(step3.securityDepositHeld, 5_000_000)
  assert.equal(step3.rentalRevenueCollected, 810_000) // Security deposit strictly excluded!
  assert.equal(step3.totalVerifiedReceived, 5_810_000)

  // Step 4: Customer pays remaining 1,890,000 rental + 200,000 extra fee -> FULLY_PAID
  const step4 = calculateBookingFinancialSummary({
    bookingStatus: 'INSPECTING',
    totalRentalPrice: 2_700_000,
    baseRentPrice: 3_000_000,
    promoDiscountAmount: 300_000,
    extraFee: 200_000,
    reservationDepositRequired: 810_000,
    deductReservationDepositFromRental: true,
    securityDepositAmount: 5_000_000,
    payments: [
      {
        id: 'pay-dep-1',
        paymentType: 'DEPOSIT',
        amount: 810_000,
        receivedAmount: 810_000,
        status: 'CONFIRMED',
      },
      {
        id: 'pay-rent-1',
        paymentType: 'RENTAL_FEE',
        amount: 1_890_000,
        receivedAmount: 1_890_000,
        status: 'CONFIRMED',
      },
      {
        id: 'pay-ext-1',
        paymentType: 'EXTRA_FEE',
        amount: 200_000,
        receivedAmount: 200_000,
        status: 'CONFIRMED',
      },
    ],
    refunds: [],
  })
  assert.equal(step4.totalRemainingRentalObligation, 0)
  assert.equal(step4.rentalRevenueCollected, 2_900_000)
  assert.equal(step4.paymentStatusSummary, 'FULLY_PAID')
})

test('Unit: resolveBookingDepositAndSecurityStructure separates large vehicle asset deposit from 30% reservation deposit', () => {
  const res = resolveBookingDepositAndSecurityStructure(
    {
      totalPrice: 2_700_000,
      depositSnapshot: 15_000_000,
      initialPaymentDue: 15_000_000,
      extraFee: 0,
      status: 'CONFIRMED',
    },
    {
      reservationDepositPolicyMode: 'VEHICLE_FIXED',
      reservationDepositPercent: 30,
    },
  )
  assert.equal(res.reservationDepositRequired, 810_000)
  assert.equal(res.securityDepositAmount, 15_000_000)
  assert.equal(res.deductReservationDepositFromRental, true)
})

test('Unit: roundVndInteger and calculateReservationDeposit never produce floating point fractions or negative values', () => {
  assert.equal(roundVndInteger(810_000.49), 810_000)
  assert.equal(roundVndInteger(810_000.51), 810_001)
  assert.equal(roundVndInteger(-500), 0)
  assert.equal(roundVndInteger(NaN), 0)
  assert.equal(
    calculateReservationDeposit(1_333_333, {
      policyMode: 'PERCENT_OF_RENTAL',
      depositPercent: 30,
    }),
    400_000,
  )
})

test('Unit (PAY-001..PAY-006): canInitiateOnlinePayment enforces auth, ownership, booking approval status, and environment gates', () => {
  // PAY-001: PENDING booking blocks online payment
  const pendingRes = canInitiateOnlinePayment({
    isLoggedIn: true,
    isCustomer: true,
    isOwner: true,
    bookingStatus: 'PENDING',
    paymentType: 'DEPOSIT',
    requestedAmount: 810_000,
  })
  assert.equal(pendingRes.allowed, false)
  assert.equal(pendingRes.httpStatus, 409)
  assert.equal(pendingRes.code, 'BOOKING_NOT_APPROVED')

  // PAY-002 / PAY-003: Approved booking (DEPOSIT_PENDING or CONFIRMED) allows payment creation
  const approvedRes = canInitiateOnlinePayment({
    isLoggedIn: true,
    isCustomer: true,
    isOwner: true,
    bookingStatus: 'DEPOSIT_PENDING',
    paymentType: 'DEPOSIT',
    requestedAmount: 810_000,
  })
  assert.equal(approvedRes.allowed, true)
  assert.equal(approvedRes.httpStatus, 200)

  // PAY-004: CANCELLED or REJECTED booking blocks payment creation
  for (const closedStatus of ['CANCELLED', 'REJECTED']) {
    const closedRes = canInitiateOnlinePayment({
      isLoggedIn: true,
      isCustomer: true,
      isOwner: true,
      bookingStatus: closedStatus,
      paymentType: 'DEPOSIT',
      requestedAmount: 810_000,
    })
    assert.equal(closedRes.allowed, false)
    assert.equal(closedRes.httpStatus, 409)
    assert.equal(closedRes.code, 'BOOKING_CLOSED')
  }

  // PAY-005: Unauthenticated caller receives 401
  const unauthRes = canInitiateOnlinePayment({
    isLoggedIn: false,
    isCustomer: false,
    isOwner: false,
    bookingStatus: 'CONFIRMED',
    paymentType: 'DEPOSIT',
    requestedAmount: 810_000,
  })
  assert.equal(unauthRes.allowed, false)
  assert.equal(unauthRes.httpStatus, 401)

  // PAY-006: Customer B trying to pay Customer A's booking receives 403
  const otherCustomerRes = canInitiateOnlinePayment({
    isLoggedIn: true,
    isCustomer: true,
    isOwner: false,
    bookingStatus: 'CONFIRMED',
    paymentType: 'DEPOSIT',
    requestedAmount: 810_000,
  })
  assert.equal(otherCustomerRes.allowed, false)
  assert.equal(otherCustomerRes.httpStatus, 403)

  // Production safety gate: PRODUCTION without productionApproved=true is blocked (503)
  const prodLocked = canInitiateOnlinePayment({
    isLoggedIn: true,
    isCustomer: true,
    isOwner: true,
    bookingStatus: 'CONFIRMED',
    paymentType: 'DEPOSIT',
    requestedAmount: 810_000,
    environment: 'PRODUCTION',
    productionApproved: false,
  })
  assert.equal(prodLocked.allowed, false)
  assert.equal(prodLocked.httpStatus, 503)
  assert.equal(prodLocked.code, 'PRODUCTION_NOT_ACTIVATED')
})

test('Unit (PAY-008): customer cannot directly edit booking once approved or once payment record exists', () => {
  assert.equal(
    canModifyBooking({
      status: 'PENDING',
      isLoggedIn: true,
      isOwner: true,
      hasPaymentRecord: false,
    }).allowed,
    true,
  )
  assert.equal(
    canModifyBooking({
      status: 'PENDING',
      isLoggedIn: true,
      isOwner: true,
      hasPaymentRecord: true,
    }).allowed,
    false,
  )
  assert.equal(
    canModifyBooking({
      status: 'DEPOSIT_PENDING',
      isLoggedIn: true,
      isOwner: true,
      hasPaymentRecord: false,
    }).allowed,
    false,
  )
  assert.equal(
    canModifyBooking({
      status: 'CONFIRMED',
      isLoggedIn: true,
      isOwner: true,
      hasPaymentRecord: false,
    }).allowed,
    false,
  )
})

test('Unit (PAY-013..PAY-020): evaluateIncomingTransfer handles exact, underpaid, multi-transfer accumulation, overpaid, expired, and cancelled booking transfers', () => {
  // PAY-013: Exact match
  const exact = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 0,
    incomingAmount: 810_000,
    paymentStatus: 'PENDING',
    bookingStatus: 'DEPOSIT_PENDING',
  })
  assert.equal(exact.nextPaymentStatus, 'CONFIRMED')
  assert.equal(exact.reconciliationStatus, 'MATCHED')
  assert.equal(exact.shouldConfirmBookingObligation, true)
  assert.equal(exact.newReceivedAmount, 810_000)

  // PAY-017: Underpaid transfer does NOT confirm booking obligation
  const underpaid = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 0,
    incomingAmount: 500_000,
    paymentStatus: 'PENDING',
    bookingStatus: 'DEPOSIT_PENDING',
  })
  assert.equal(underpaid.nextPaymentStatus, 'PARTIALLY_PAID')
  assert.equal(underpaid.reconciliationStatus, 'UNDERPAID')
  assert.equal(underpaid.shouldConfirmBookingObligation, false)
  assert.equal(underpaid.shortfallAmount, 310_000)

  // Multi-transfer accumulation: second transfer of 310,000 completes the 810,000 obligation
  const secondTransfer = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 500_000,
    incomingAmount: 310_000,
    paymentStatus: 'PARTIALLY_PAID',
    bookingStatus: 'DEPOSIT_PENDING',
  })
  assert.equal(secondTransfer.nextPaymentStatus, 'CONFIRMED')
  assert.equal(secondTransfer.reconciliationStatus, 'MATCHED')
  assert.equal(secondTransfer.shouldConfirmBookingObligation, true)
  assert.equal(secondTransfer.newReceivedAmount, 810_000)

  // PAY-018: Overpaid transfer confirms obligation and flags OVERPAID for refund/reconciliation
  const overpaid = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 0,
    incomingAmount: 900_000,
    paymentStatus: 'PENDING',
    bookingStatus: 'DEPOSIT_PENDING',
  })
  assert.equal(overpaid.nextPaymentStatus, 'CONFIRMED')
  assert.equal(overpaid.reconciliationStatus, 'OVERPAID')
  assert.equal(overpaid.overpaidAmount, 90_000)
  assert.equal(overpaid.shouldConfirmBookingObligation, true)

  // PAY-019: Webhook arriving after payment expired -> REVIEW_REQUIRED + LATE_PAYMENT
  const lateAfterExpiry = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 0,
    incomingAmount: 810_000,
    paymentStatus: 'EXPIRED',
    bookingStatus: 'DEPOSIT_PENDING',
  })
  assert.equal(lateAfterExpiry.nextPaymentStatus, 'REVIEW_REQUIRED')
  assert.equal(lateAfterExpiry.reconciliationStatus, 'LATE_PAYMENT')
  assert.equal(lateAfterExpiry.shouldConfirmBookingObligation, false)

  // PAY-020: Webhook arriving for CANCELLED booking -> REVIEW_REQUIRED + LATE_PAYMENT (never resurrects cancelled booking)
  const cancelledBookingTransfer = evaluateIncomingTransfer({
    expectedAmount: 810_000,
    previouslyReceivedAmount: 0,
    incomingAmount: 810_000,
    paymentStatus: 'PENDING',
    bookingStatus: 'CANCELLED',
  })
  assert.equal(cancelledBookingTransfer.nextPaymentStatus, 'REVIEW_REQUIRED')
  assert.equal(cancelledBookingTransfer.reconciliationStatus, 'LATE_PAYMENT')
  assert.equal(cancelledBookingTransfer.shouldConfirmBookingObligation, false)
})

test('Unit (PAY-015): payment state machine and stale event guard prevent out-of-order regression from CONFIRMED/REFUNDED to PENDING/FAILED', () => {
  assert.equal(canTransitionPayment('PENDING', 'CONFIRMED', 'webhook'), true)
  assert.equal(canTransitionPayment('PENDING', 'CANCELLED', 'customer'), true)
  assert.equal(canTransitionPayment('CONFIRMED', 'CANCELLED', 'customer'), false)
  assert.equal(canTransitionPayment('CONFIRMED', 'PENDING', 'webhook'), false)
  assert.equal(canTransitionPayment('REFUNDED', 'CONFIRMED', 'admin'), false)

  assert.equal(isPaymentEventStale('CONFIRMED', 'PENDING'), true)
  assert.equal(isPaymentEventStale('CONFIRMED', 'FAILED'), true)
  assert.equal(isPaymentEventStale('CONFIRMED', 'EXPIRED'), true)
  assert.equal(isPaymentEventStale('REFUNDED', 'CONFIRMED'), true)
  assert.equal(isPaymentEventStale('PENDING', 'CONFIRMED'), false)
  assert.equal(mapProviderStatusToInternal('PAID'), 'CONFIRMED')
})

test('Unit (PAY-027..PAY-031): validateRefundRequest enforces RBAC, reason, positive integer, max refundable balance, and duplicate guard', () => {
  // PAY-031: Customer / non-admin cannot approve refund
  assert.equal(
    validateRefundRequest({
      isAdmin: false,
      hasPaymentUpdatePermission: false,
      totalVerifiedReceived: 810_000,
      alreadyRefundedAmount: 0,
      requestedRefundAmount: 810_000,
      reason: 'Customer try',
    }).code,
    'FORBIDDEN',
  )

  // Missing reason rejected
  assert.equal(
    validateRefundRequest({
      isAdmin: true,
      hasPaymentUpdatePermission: true,
      totalVerifiedReceived: 810_000,
      alreadyRefundedAmount: 0,
      requestedRefundAmount: 810_000,
      reason: '   ',
    }).code,
    'REASON_REQUIRED',
  )

  // PAY-029: Refund exceeding received balance rejected
  const exceed = validateRefundRequest({
    isAdmin: true,
    hasPaymentUpdatePermission: true,
    totalVerifiedReceived: 810_000,
    alreadyRefundedAmount: 300_000,
    requestedRefundAmount: 600_000,
    reason: 'Hoàn quá số dư',
  })
  assert.equal(exceed.allowed, false)
  assert.equal(exceed.code, 'EXCEEDS_REFUNDABLE_BALANCE')
  assert.equal(exceed.maxRefundable, 510_000)

  // PAY-030: Duplicate refund rejected
  assert.equal(
    validateRefundRequest({
      isAdmin: true,
      hasPaymentUpdatePermission: true,
      totalVerifiedReceived: 810_000,
      alreadyRefundedAmount: 0,
      requestedRefundAmount: 810_000,
      reason: 'Hoàn lần 2 trùng lặp',
      duplicateIdempotencyHit: true,
    }).code,
    'DUPLICATE_REFUND',
  )

  // PAY-027 & PAY-028: Valid partial and full refunds allowed
  const validPartial = validateRefundRequest({
    isAdmin: true,
    hasPaymentUpdatePermission: true,
    totalVerifiedReceived: 810_000,
    alreadyRefundedAmount: 0,
    requestedRefundAmount: 300_000,
    reason: 'Hoàn một phần theo thỏa thuận',
  })
  assert.equal(validPartial.allowed, true)
  assert.equal(validPartial.maxRefundable, 810_000)
})

test('Unit (PAY-039 & PAY-040): handover and settlement completion financial guards block unpaid deposit or unsettled extra fees/refunds', () => {
  const unpaidFin = calculateBookingFinancialSummary({
    bookingStatus: 'CONFIRMED',
    totalRentalPrice: 2_700_000,
    reservationDepositRequired: 810_000,
    payments: [],
    refunds: [],
  })

  // PAY-039: Cannot transition to ONGOING when deposit is unpaid and requireDepositBeforeHandover=true
  const handoverBlocked = checkHandoverFinancialEligibility({
    bookingStatus: 'CONFIRMED',
    financial: unpaidFin,
    requireDepositBeforeHandover: true,
    hasPaymentRecords: true,
  })
  assert.equal(handoverBlocked.allowed, false)

  // After paying deposit, handover is allowed
  const depositPaidFin = calculateBookingFinancialSummary({
    bookingStatus: 'CONFIRMED',
    totalRentalPrice: 2_700_000,
    reservationDepositRequired: 810_000,
    payments: [
      {
        id: 'p1',
        paymentType: 'DEPOSIT',
        amount: 810_000,
        receivedAmount: 810_000,
        status: 'CONFIRMED',
      },
    ],
    refunds: [],
  })
  assert.equal(
    checkHandoverFinancialEligibility({
      bookingStatus: 'CONFIRMED',
      financial: depositPaidFin,
      requireDepositBeforeHandover: true,
      hasPaymentRecords: true,
    }).allowed,
    true,
  )

  // PAY-040: Cannot complete booking when extraFee is unpaid or refund is still pending
  const unpaidExtraFin = calculateBookingFinancialSummary({
    bookingStatus: 'INSPECTING',
    totalRentalPrice: 2_700_000,
    extraFee: 250_000,
    reservationDepositRequired: 810_000,
    payments: [
      {
        id: 'p1',
        paymentType: 'FULL_PAYMENT',
        amount: 2_700_000,
        receivedAmount: 2_700_000,
        status: 'CONFIRMED',
      },
    ],
    refunds: [],
  })
  assert.equal(
    checkSettlementCompletionEligibility({
      financial: unpaidExtraFin,
      hasOnlineOrRecordedPayments: true,
    }).allowed,
    false,
  )
  // Allowed if Admin explicitly approves financial exception with audit note
  assert.equal(
    checkSettlementCompletionEligibility({
      financial: unpaidExtraFin,
      hasOnlineOrRecordedPayments: true,
      approveFinancialException: true,
      exceptionNote: 'Miễn phụ phí thiện chí cho khách hàng thân thiết',
    }).allowed,
    true,
  )
})

test('Unit: Payment Provider Adapter Pattern, SePay webhook auth, payment code extraction, SVG QR generation, and payload sanitization', async () => {
  // Timing-safe secret compare
  assert.equal(timingSafeSecretCompare('sepay-secret-123', 'sepay-secret-123'), true)
  assert.equal(timingSafeSecretCompare('sepay-secret-123', 'sepay-secret-999'), false)
  assert.equal(timingSafeSecretCompare('', 'sepay-secret-123'), false)

  // Extract payment reference from bank transfer description
  const refCode = generateProviderPaymentCode('NR-2026-01', 'DEPOSIT', 1732000000000)
  assert.match(refCode, /^NORIPAY[A-Z0-9]+$/)
  assert.equal(
    extractPaymentCodeFromContent(`MBVCB.88123.Chuyen khoan ${refCode} thue xe`).paymentRef,
    refCode,
  )

  // SVG Data URI QR generation works offline and produces valid data:image/svg+xml
  const svgUri = generateVietQrSvgDataUri({
    bankCode: 'VCB',
    accountNumber: '1017588888',
    amount: 810_000,
    transferContent: refCode,
  })
  assert.ok(svgUri.startsWith('data:image/svg+xml;utf8,'))

  // Secret sanitization removes sensitive keys from webhook payloads
  const sanitized = JSON.parse(
    sanitizeWebhookPayload({
      id: 99123,
      transferAmount: 810_000,
      apiKey: 'SUPER_SECRET_VALUE',
      webhookSecret: 'DO_NOT_LOG',
      authorization: 'Apikey secret',
    }),
  )
  assert.equal(sanitized.id, 99123)
  assert.equal(sanitized.apiKey, '[REDACTED]')
  assert.equal(sanitized.webhookSecret, '[REDACTED]')
  assert.equal(sanitized.authorization, '[REDACTED]')

  // Provider registry returns SePayProvider, MockPaymentProvider, ManualPaymentProvider, and future stubs
  assert.ok(getPaymentProviderAdapter('SEPAY') instanceof SePayProvider)
  assert.ok(getPaymentProviderAdapter('MOCK') instanceof MockPaymentProvider)
  assert.ok(getPaymentProviderAdapter('MANUAL') instanceof ManualPaymentProvider)
  assert.ok(getPaymentProviderAdapter('PAYOS') instanceof PayOSProvider)
  assert.ok(getPaymentProviderAdapter('VNPAY') instanceof VNPayProvider)
  assert.ok(getPaymentProviderAdapter('MOMO') instanceof MoMoProvider)
  assert.ok(getPaymentProviderAdapter('ZALOPAY') instanceof ZaloPayProvider)

  // SePayProvider verifies Authorization: Apikey <secret> and normalizes official SePay webhook payload
  const sepay = new SePayProvider()
  const rawBody = JSON.stringify({
    id: 92704,
    gateway: 'Vietcombank',
    transactionDate: '2026-11-20 14:02:37',
    accountNumber: '1017588888',
    code: refCode,
    content: `Chuyen tien ${refCode}`,
    transferType: 'in',
    transferAmount: 810_000,
    accumulated: 19_077_000,
    referenceCode: 'MBVCB.3278907687',
  })

  const prevWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET
  process.env.SEPAY_WEBHOOK_SECRET = 'correct-sepay-secret'
  try {
    const badAuth = sepay.verifyWebhook({
      headers: new Headers({ authorization: 'Apikey wrong-secret' }),
      rawBody,
      environment: 'SANDBOX',
    })
    assert.equal(badAuth.verified, false)

    const goodAuth = sepay.verifyWebhook({
      headers: new Headers({ authorization: 'Apikey correct-sepay-secret' }),
      rawBody,
      environment: 'SANDBOX',
    })
    assert.equal(goodAuth.verified, true)

    const normalized = sepay.normalizeWebhookEvent(JSON.parse(rawBody), 'SANDBOX')
    assert.equal(normalized.valid, true)
    assert.equal(normalized.eventId, 'SEPAY:SANDBOX:92704')
    assert.equal(normalized.externalTransactionId, '92704')
    assert.equal(normalized.paymentReference, refCode)
    assert.equal(normalized.transferAmount, 810_000)
    assert.equal(normalized.transferType, 'in')
    assert.equal(normalized.eventType, 'TRANSFER_IN')
  } finally {
    if (prevWebhookSecret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET
    else process.env.SEPAY_WEBHOOK_SECRET = prevWebhookSecret
  }
})
