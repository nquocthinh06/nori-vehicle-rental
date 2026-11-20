import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateBookingFinancialSummary,
  calculateReservationDeposit,
  checkHandoverFinancialEligibility,
  checkSettlementCompletionEligibility,
  canTransitionPayment,
  canTransition,
  roundVndInteger,
} from '../src/lib/rental-rules.ts'
import { resolveBookingDepositAndSecurityStructure } from '../src/lib/payment-service.ts'

test('AUDIT P0-1: Root Cause & Resolution for 13,010,000 VND rental vs 15,000,000 VND collateral', () => {
  // Reported case in nori.db:
  // Honda City / Mazda 3 rental: total_price = 13,010,000 VND, deposit_snapshot = 15,000,000 VND
  // Two confirmed payments: 3,903,000 (30% deposit) + 9,107,000 (remaining rental) = 13,010,000 VND
  const structure = resolveBookingDepositAndSecurityStructure({
    totalPrice: 13_010_000,
    depositSnapshot: 15_000_000,
    initialPaymentDue: 3_903_000,
    status: 'READY_FOR_HANDOVER',
  })

  // Structure accurately classifies 15M as security deposit (collateral) and calculates 30% reservation deposit
  assert.equal(structure.securityDepositAmount, 15_000_000)
  assert.equal(structure.reservationDepositRequired, 3_903_000)
  assert.equal(structure.deductReservationDepositFromRental, true)

  const summary = calculateBookingFinancialSummary({
    bookingStatus: 'READY_FOR_HANDOVER',
    totalRentalPrice: 13_010_000,
    reservationDepositRequired: structure.reservationDepositRequired,
    deductReservationDepositFromRental: structure.deductReservationDepositFromRental,
    securityDepositAmount: structure.securityDepositAmount,
    payments: [
      {
        id: 'pay-1',
        paymentType: 'DEPOSIT',
        amount: 3_903_000,
        receivedAmount: 3_903_000,
        status: 'CONFIRMED',
      },
      {
        id: 'pay-2',
        paymentType: 'RENTAL_FEE',
        amount: 9_107_000,
        receivedAmount: 9_107_000,
        status: 'CONFIRMED',
      },
    ],
  })

  // 100% of rental revenue collected (13,010,000 VND)
  assert.equal(summary.rentalRevenueCollected, 13_010_000)
  assert.equal(summary.totalRemainingRentalObligation, 0)
  assert.equal(summary.remainingDepositDue, 0)
  assert.equal(summary.paymentStatusSummary, 'FULLY_PAID')
  assert.equal(summary.hasAnomaly, false)

  // Handover is fully eligible
  const handoverCheck = checkHandoverFinancialEligibility({
    bookingStatus: 'READY_FOR_HANDOVER',
    financial: summary,
    requireDepositBeforeHandover: true,
    hasPaymentRecords: true,
  })
  assert.equal(handoverCheck.allowed, true)

  // 15,000,000 VND asset collateral is to be held in cash/collateral at handover, NOT mixed with rental revenue
  assert.equal(summary.securityDepositAmount, 15_000_000)
  assert.equal(summary.paidSecurityDepositAmount, 0)
})

test('AUDIT P0-2: Customer Payment Plan Selection — DEPOSIT (30%) vs FULL (100%)', () => {
  const rentalTotal = 10_000_000
  const vehicleCollateral = 20_000_000

  // Plan A: DEPOSIT (30%)
  const planA = resolveBookingDepositAndSecurityStructure({
    totalPrice: rentalTotal,
    depositSnapshot: vehicleCollateral,
    paymentOption: 'DEPOSIT',
    reservationDepositSnapshot: 3_000_000,
    status: 'PENDING',
  })
  assert.equal(planA.reservationDepositRequired, 3_000_000)
  assert.equal(planA.securityDepositAmount, vehicleCollateral)

  // Customer pays 30% deposit
  const summaryA = calculateBookingFinancialSummary({
    bookingStatus: 'CONFIRMED',
    totalRentalPrice: rentalTotal,
    reservationDepositRequired: planA.reservationDepositRequired,
    securityDepositAmount: planA.securityDepositAmount,
    payments: [
      {
        id: 'p-dep',
        paymentType: 'DEPOSIT',
        amount: 3_000_000,
        receivedAmount: 3_000_000,
        status: 'CONFIRMED',
      },
    ],
  })
  assert.equal(summaryA.paidDepositAmount, 3_000_000)
  assert.equal(summaryA.remainingDepositDue, 0)
  assert.equal(summaryA.rentalRevenueCollected, 3_000_000)
  assert.equal(summaryA.totalRemainingRentalObligation, 7_000_000)
  assert.equal(summaryA.paymentStatusSummary, 'DEPOSIT_PAID')

  // Plan B: FULL (100%)
  const planB = resolveBookingDepositAndSecurityStructure({
    totalPrice: rentalTotal,
    depositSnapshot: vehicleCollateral,
    paymentOption: 'FULL',
    reservationDepositSnapshot: 3_000_000,
    status: 'PENDING',
  })
  assert.equal(planB.securityDepositAmount, vehicleCollateral)

  // Customer pays 100% rental upfront
  const summaryB = calculateBookingFinancialSummary({
    bookingStatus: 'CONFIRMED',
    totalRentalPrice: rentalTotal,
    reservationDepositRequired: planB.reservationDepositRequired,
    securityDepositAmount: planB.securityDepositAmount,
    payments: [
      {
        id: 'p-full',
        paymentType: 'FULL_PAYMENT',
        amount: 10_000_000,
        receivedAmount: 10_000_000,
        status: 'CONFIRMED',
      },
    ],
  })
  assert.equal(summaryB.paidRentalAmount, 10_000_000)
  assert.equal(summaryB.remainingDepositDue, 0)
  assert.equal(summaryB.rentalRevenueCollected, 10_000_000)
  assert.equal(summaryB.totalRemainingRentalObligation, 0)
  assert.equal(summaryB.paymentStatusSummary, 'FULLY_PAID')
})

test('AUDIT P0-3: Asset Collateral isolation from Rental Revenue & Refund tracking', () => {
  const summary = calculateBookingFinancialSummary({
    bookingStatus: 'ONGOING',
    totalRentalPrice: 5_000_000,
    reservationDepositRequired: 1_500_000,
    securityDepositAmount: 15_000_000,
    payments: [
      {
        id: 'p-rent',
        paymentType: 'FULL_PAYMENT',
        amount: 5_000_000,
        receivedAmount: 5_000_000,
        status: 'CONFIRMED',
      },
      {
        id: 'p-sec',
        paymentType: 'SECURITY_DEPOSIT',
        amount: 15_000_000,
        receivedAmount: 15_000_000,
        status: 'CONFIRMED',
      },
    ],
  })

  // Total verified received includes collateral, but rental revenue collected strictly EXCLUDES collateral
  assert.equal(summary.totalVerifiedReceived, 20_000_000)
  assert.equal(summary.rentalRevenueCollected, 5_000_000)
  assert.equal(summary.paidSecurityDepositAmount, 15_000_000)
  assert.equal(summary.securityDepositHeld, 15_000_000)
  assert.equal(summary.netRentalRevenue, 5_000_000)

  // Now simulate return of security deposit upon contract completion
  const summaryAfterReturn = calculateBookingFinancialSummary({
    bookingStatus: 'COMPLETED',
    totalRentalPrice: 5_000_000,
    reservationDepositRequired: 1_500_000,
    securityDepositAmount: 15_000_000,
    payments: [
      {
        id: 'p-rent',
        paymentType: 'FULL_PAYMENT',
        amount: 5_000_000,
        receivedAmount: 5_000_000,
        status: 'CONFIRMED',
      },
      {
        id: 'p-sec',
        paymentType: 'SECURITY_DEPOSIT',
        amount: 15_000_000,
        receivedAmount: 15_000_000,
        refundedAmount: 15_000_000,
        status: 'REFUNDED',
      },
    ],
  })

  assert.equal(summaryAfterReturn.securityDepositHeld, 0)
  assert.equal(summaryAfterReturn.rentalRevenueCollected, 5_000_000)
  assert.equal(summaryAfterReturn.netRentalRevenue, 5_000_000)
})

test('AUDIT P0-4: State Machine Separation & Gate Invariants', () => {
  // Booking state machine
  assert.equal(canTransition('PENDING', 'CONFIRMED', 'admin', '2026-12-01', '2026-11-20'), true)
  assert.equal(
    canTransition('CONFIRMED', 'READY_FOR_HANDOVER', 'admin', '2026-11-20', '2026-11-20'),
    true,
  )
  assert.equal(
    canTransition('READY_FOR_HANDOVER', 'ONGOING', 'admin', '2026-11-20', '2026-11-20'),
    true,
  )
  assert.equal(canTransition('ONGOING', 'INSPECTING', 'admin', '2026-11-20', '2026-11-20'), true)
  assert.equal(canTransition('INSPECTING', 'COMPLETED', 'admin', '2026-11-20', '2026-11-20'), true)

  // Cannot jump from PENDING directly to COMPLETED
  assert.equal(canTransition('PENDING', 'COMPLETED', 'admin', '2026-12-01', '2026-11-20'), false)

  // Payment transaction state machine
  assert.equal(canTransitionPayment('PENDING', 'CONFIRMED'), true)
  assert.equal(canTransitionPayment('PENDING', 'FAILED'), true)
  assert.equal(canTransitionPayment('PENDING', 'EXPIRED'), true)
  assert.equal(canTransitionPayment('PENDING', 'CANCELLED'), true)
  assert.equal(canTransitionPayment('CONFIRMED', 'PARTIALLY_REFUNDED'), true)
  assert.equal(canTransitionPayment('CONFIRMED', 'REFUNDED'), true)

  // Terminal states cannot be resurrected
  assert.equal(canTransitionPayment('FAILED', 'CONFIRMED'), false)
  assert.equal(canTransitionPayment('EXPIRED', 'CONFIRMED'), false)
  assert.equal(canTransitionPayment('CANCELLED', 'CONFIRMED'), false)
  assert.equal(canTransitionPayment('REFUNDED', 'PENDING'), false)
})

test('AUDIT P0-5: Pre-handover and Post-return settlement gates', () => {
  // Gate 1: Handover without paying deposit is blocked
  const unpaidFin = calculateBookingFinancialSummary({
    bookingStatus: 'READY_FOR_HANDOVER',
    totalRentalPrice: 10_000_000,
    reservationDepositRequired: 3_000_000,
    payments: [],
  })
  const handoverBlocked = checkHandoverFinancialEligibility({
    bookingStatus: 'READY_FOR_HANDOVER',
    financial: unpaidFin,
    requireDepositBeforeHandover: true,
    hasPaymentRecords: false,
  })
  assert.equal(handoverBlocked.allowed, false)

  // Gate 2: Settlement completion with remaining rental obligation is blocked
  const partialFin = calculateBookingFinancialSummary({
    bookingStatus: 'INSPECTING',
    totalRentalPrice: 10_000_000,
    reservationDepositRequired: 3_000_000,
    payments: [
      {
        id: 'p-1',
        paymentType: 'DEPOSIT',
        amount: 3_000_000,
        receivedAmount: 3_000_000,
        status: 'CONFIRMED',
      },
    ],
  })
  const completeBlocked = checkSettlementCompletionEligibility({
    financial: partialFin,
    hasOnlineOrRecordedPayments: true,
  })
  assert.equal(completeBlocked.allowed, false)

  // Gate 3: Settlement completion with 100% paid is allowed
  const fullFin = calculateBookingFinancialSummary({
    bookingStatus: 'INSPECTING',
    totalRentalPrice: 10_000_000,
    reservationDepositRequired: 3_000_000,
    payments: [
      {
        id: 'p-1',
        paymentType: 'FULL_PAYMENT',
        amount: 10_000_000,
        receivedAmount: 10_000_000,
        status: 'CONFIRMED',
      },
    ],
  })
  const completeAllowed = checkSettlementCompletionEligibility({
    financial: fullFin,
    hasOnlineOrRecordedPayments: true,
  })
  assert.equal(completeAllowed.allowed, true)
})
