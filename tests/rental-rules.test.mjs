import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  applyPromotionToQuote,
  BOOKING_CONFIRMED_LOCK_MESSAGE,
  businessToday,
  calculateAddonFee,
  calculateNextContactSlot,
  calculateRentalQuote,
  calculateRollingPrice,
  canModifyBooking,
  canTransition,
  canTransitionInquiry,
  computeRentalDayDiff,
  countHolidayDays,
  countWeekendDays,
  dateNumber,
  evaluatePromotion,
  formatDate,
  formatMoney,
  formatVnd,
  getBookingActionMatrix,
  getDynamicFeaturePresets,
  getDynamicSpecTemplates,
  getPhotoTypeOptions,
  getPromotionRuntimeStatus,
  isDepositExpired,
  isSpecApplicable,
  maskPhone,
  overlaps,
  parseAddonKeys,
  parseWorkingDays,
  PROMO_REMOVED_MESSAGE,
  rentalDays,
  subCategoriesByCategory,
  validatePromotionInput,
  validateRentalDates,
  validateTimeString,
} from '../src/lib/rental-rules.ts'
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE,
  hasActiveSessionRecord,
  resolveRequestCookieConfig,
} from '../src/lib/session-cookie.ts'

const today = '2026-11-16'
test('timezone: Vietnam midnight is not the UTC date', () =>
  assert.equal(businessToday(new Date('2026-11-15T17:00:00Z')), today))
test('timezone: before Vietnam midnight remains prior date', () =>
  assert.equal(businessToday(new Date('2026-11-15T16:59:59Z')), '2026-11-15'))
test('date parser rejects impossible dates', () =>
  assert.ok(Number.isNaN(dateNumber('2026-02-30'))))
test('date parser rejects localized dates', () => assert.ok(Number.isNaN(dateNumber('16/11/2026'))))
test('date parser rejects timestamps', () =>
  assert.ok(Number.isNaN(dateNumber('2026-11-16T00:00:00Z'))))
test('date parser accepts leap day only in a leap year', () => {
  assert.ok(Number.isFinite(dateNumber('2028-02-29')))
  assert.ok(Number.isNaN(dateNumber('2027-02-29')))
})
test('date addition crosses month boundary', () =>
  assert.equal(addDays('2026-11-30', 1), '2026-12-01'))
test('date addition crosses year boundary', () =>
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'))
test('valid one-day rental starting today', () =>
  assert.deepEqual(validateRentalDates(today, '2026-11-17', today), { totalDays: 1 }))
test('valid thirty-day rental', () =>
  assert.deepEqual(validateRentalDates(today, addDays(today, 30), today), { totalDays: 30 }))
test('reject past pickup', () =>
  assert.ok(validateRentalDates('2026-11-15', '2026-11-17', today).error))
test('reject same-day return', () => assert.ok(validateRentalDates(today, today, today).error))
test('reject reversed range', () =>
  assert.ok(validateRentalDates('2026-11-18', '2026-11-17', today).error))
test('reject 31-day rental', () =>
  assert.ok(validateRentalDates(today, addDays(today, 31), today).error))
test('accept pickup at day 90', () =>
  assert.equal(validateRentalDates(addDays(today, 90), addDays(today, 91), today).totalDays, 1))
test('reject pickup beyond day 90', () =>
  assert.ok(validateRentalDates(addDays(today, 91), addDays(today, 92), today).error))
test('reject missing dates', () => assert.ok(validateRentalDates('', '', today).error))
test('half-open rental days exclude return date', () =>
  assert.deepEqual(rentalDays('2026-12-01', '2026-12-03'), ['2026-12-01', '2026-12-02']))
test('rental days cross year consistently', () =>
  assert.deepEqual(rentalDays('2026-12-31', '2027-01-02'), ['2026-12-31', '2027-01-01']))
test('rental day list has exactly 30 days for a month-long booking', () =>
  assert.equal(rentalDays(today, addDays(today, 30)).length, 30))
test('overlapping ranges conflict', () =>
  assert.equal(
    overlaps(
      { startDate: '2026-12-01', endDate: '2026-12-03' },
      { startDate: '2026-12-02', endDate: '2026-12-04' },
    ),
    true,
  ))
test('identical ranges conflict', () =>
  assert.equal(
    overlaps(
      { startDate: '2026-12-01', endDate: '2026-12-03' },
      { startDate: '2026-12-01', endDate: '2026-12-03' },
    ),
    true,
  ))
test('back-to-back rentals do not conflict', () =>
  assert.equal(
    overlaps(
      { startDate: '2026-12-01', endDate: '2026-12-03' },
      { startDate: '2026-12-03', endDate: '2026-12-05' },
    ),
    false,
  ))
test('earlier return equal to next pickup does not conflict', () =>
  assert.equal(
    overlaps(
      { startDate: '2026-12-01', endDate: '2026-12-03' },
      { startDate: '2026-11-30', endDate: '2026-12-01' },
    ),
    false,
  ))
test('price formatting uses Vietnamese grouping and currency', () =>
  assert.match(formatMoney('250000'), /250\.000\s*₫/))
test('missing price does not become a fabricated zero price', () => {
  assert.equal(formatMoney(null), 'Chưa cập nhật')
  assert.equal(formatMoney(undefined), 'Chưa cập nhật')
  assert.equal(formatMoney(0), 'Chưa cập nhật')
})
test('unsafe or fractional price is not displayed', () => {
  assert.equal(formatMoney(1.2), 'Chưa cập nhật')
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER + 1), 'Chưa cập nhật')
})
test('missing date has explicit missing-data copy', () =>
  assert.equal(formatDate(null), 'Chưa cập nhật'))
test('date-only rental dates format as DD/MM/YYYY without timezone shift', () =>
  assert.equal(formatDate('2026-11-16'), '16/11/2026'))
test('record timestamps display the Vietnam calendar date in DD/MM/YYYY', () =>
  assert.equal(formatDate('2026-11-16T18:00:00.000Z'), '17/11/2026'))
test('weekend counter detects Saturday and Sunday inside rental window', () => {
  // 2026-11-20 is Friday, 2026-11-23 is Monday -> covers Sat 21 & Sun 22
  assert.equal(countWeekendDays('2026-11-20', '2026-11-23'), 2)
  assert.equal(countWeekendDays('2026-11-16', '2026-11-19'), 0)
})
test('addon parser deduplicates and filters invalid keys', () =>
  assert.deepEqual(parseAddonKeys(['CHILD_SEAT', 'INVALID', 'CHILD_SEAT', 'DASHCAM']), [
    'CHILD_SEAT',
    'DASHCAM',
  ]))
test('addon fee multiplies per-day addons and keeps flat addons fixed', () =>
  // EXTENDED_INSURANCE (90_000/day * 3) + CHILD_SEAT (100_000) + EXTRA_HELMET (40_000) = 410_000
  assert.equal(calculateAddonFee(['EXTENDED_INSURANCE', 'CHILD_SEAT', 'EXTRA_HELMET'], 3), 410_000))
test('rental quote calculates weekend surcharge, delivery, addons and separates deposit', () => {
  const quote = calculateRentalQuote({
    startDate: '2026-11-20',
    endDate: '2026-11-23',
    dailyPrice: 1_000_000,
    weekendSurcharge: 100_000,
    deliveryRequested: true,
    vehicleDeliveryFee: 150_000,
    addonKeys: ['EXTENDED_INSURANCE', 'DASHCAM'],
    vehicleDeposit: 15_000_000,
  })
  assert.equal(quote.totalDays, 3)
  assert.equal(quote.weekendDays, 2)
  assert.equal(quote.basePrice, 3_000_000)
  assert.equal(quote.weekendSurchargeTotal, 200_000)
  assert.equal(quote.deliveryFee, 150_000)
  assert.equal(quote.addonFee, 320_000) // 90k*3 + 50k
  assert.equal(quote.discountRate, 0)
  assert.equal(quote.estimatedTotal, 3_670_000)
  assert.equal(quote.depositAmount, 15_000_000)
  assert.equal(quote.initialPaymentDue, 15_000_000)
  assert.equal(quote.remainingAmount, 3_670_000)
})
test('rental quote applies 5% weekly and 12% monthly base discounts', () => {
  const weekly = calculateRentalQuote({
    startDate: '2026-11-16',
    endDate: '2026-11-23',
    dailyPrice: 1_000_000,
  })
  assert.equal(weekly.totalDays, 7)
  assert.equal(weekly.discountRate, 0.05)
  assert.equal(weekly.discountAmount, 350_000)
  assert.equal(weekly.estimatedTotal, 6_650_000)

  const monthly = calculateRentalQuote({
    startDate: '2026-11-16',
    endDate: '2026-12-16',
    dailyPrice: 1_000_000,
  })
  assert.equal(monthly.totalDays, 30)
  assert.equal(monthly.discountRate, 0.12)
  assert.equal(monthly.discountAmount, 3_600_000)
  assert.equal(monthly.estimatedTotal, 26_400_000)
})
test('rolling price returns null for invalid price and computes Vietnam fees by type', () => {
  assert.equal(calculateRollingPrice(null, 'CAR'), null)
  assert.equal(calculateRollingPrice(0, 'CAR'), null)
  const usedCar = calculateRollingPrice(1_000_000_000, 'CAR', 'Xăng', false)
  assert.equal(usedCar?.registrationTaxRate, 0.02)
  assert.equal(usedCar?.registrationTax, 20_000_000)
  assert.equal(usedCar?.plateFee, 1_000_000)
  assert.equal(usedCar?.totalEstimated, 1_023_773_400)

  const newEv = calculateRollingPrice(1_000_000_000, 'CAR', 'Điện (EV)', true)
  assert.equal(newEv?.registrationTaxRate, 0)
  assert.equal(newEv?.plateFee, 20_000_000)
  assert.equal(newEv?.totalEstimated, 1_022_773_400)

  const newPickup = calculateRollingPrice(1_000_000_000, 'PICKUP', 'Dầu Diesel', true)
  assert.equal(newPickup?.registrationTaxRate, 0.06)
  assert.equal(newPickup?.civilInsuranceFee, 1_026_000)

  const newBike = calculateRollingPrice(100_000_000, 'MOTORBIKE', 'Xăng', true)
  assert.equal(newBike?.registrationTaxRate, 0.02)
  assert.equal(newBike?.plateFee, 2_000_000)
  assert.equal(newBike?.inspectionAndRoadFee, 0)
  assert.equal(newBike?.civilInsuranceFee, 66_000)
})
test('admin cannot deliver before pickup date', () =>
  assert.equal(canTransition('CONFIRMED', 'ONGOING', 'admin', '2026-11-17', today), false))
test('admin can deliver on pickup date', () =>
  assert.equal(canTransition('CONFIRMED', 'ONGOING', 'admin', today, today), true))
test('admin can complete early after receiving the vehicle', () =>
  assert.equal(canTransition('ONGOING', 'COMPLETED', 'admin', today, today), true))
const statuses = [
  'PENDING',
  'DEPOSIT_PENDING',
  'CONFIRMED',
  'READY_FOR_HANDOVER',
  'ONGOING',
  'INSPECTING',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]
const adminAllowed = new Set([
  'PENDING:DEPOSIT_PENDING',
  'PENDING:CONFIRMED',
  'PENDING:REJECTED',
  'DEPOSIT_PENDING:CONFIRMED',
  'DEPOSIT_PENDING:CANCELLED',
  'DEPOSIT_PENDING:REJECTED',
  'CONFIRMED:READY_FOR_HANDOVER',
  'CONFIRMED:ONGOING',
  'CONFIRMED:CANCELLED',
  'READY_FOR_HANDOVER:ONGOING',
  'READY_FOR_HANDOVER:CANCELLED',
  'ONGOING:INSPECTING',
  'ONGOING:COMPLETED',
  'INSPECTING:COMPLETED',
])
for (const from of statuses) {
  for (const to of statuses) {
    test(`admin transition ${from} → ${to}`, () =>
      assert.equal(
        !!canTransition(from, to, 'admin', today, today),
        adminAllowed.has(`${from}:${to}`),
      ))
    test(`customer transition ${from} → ${to}`, () =>
      assert.equal(
        !!canTransition(from, to, 'customer', today, today),
        (from === 'PENDING' || from === 'DEPOSIT_PENDING') && to === 'CANCELLED',
      ))
  }
}

test('holiday counter detects Vietnam fixed and Tet holidays cleanly', () => {
  // 2027-01-01 is New Year Day; 2027-01-02 is return day (half-open excludes end)
  assert.equal(countHolidayDays('2027-01-01', '2027-01-02'), 1)
  // 2026-04-29 to 2026-05-03 covers 04-30 and 05-01
  assert.equal(countHolidayDays('2026-04-29', '2026-05-03'), 2)
  assert.equal(countHolidayDays('2026-11-16', '2026-11-20'), 0)
})

test('rental quote applies weekly/monthly package pricing when better than % discount and adds holiday surcharge', () => {
  // 7 days at 1_000_000/day = 7_000_000; 5% would discount 350_000, weeklyPrice 6_000_000 saves 1_000_000
  const weeklyPkg = calculateRentalQuote({
    startDate: '2026-11-16',
    endDate: '2026-11-23',
    dailyPrice: 1_000_000,
    weeklyPrice: 6_000_000,
  })
  assert.equal(weeklyPkg.discountAmount, 1_000_000)
  assert.equal(weeklyPkg.estimatedTotal, 6_000_000)

  // 30 days at 1_000_000/day = 30_000_000; 12% would discount 3_600_000, monthlyPrice 24_000_000 saves 6_000_000
  const monthlyPkg = calculateRentalQuote({
    startDate: '2026-11-16',
    endDate: '2026-12-16',
    dailyPrice: 1_000_000,
    monthlyPrice: 24_000_000,
  })
  assert.equal(monthlyPkg.discountAmount, 6_000_000)
  assert.equal(monthlyPkg.estimatedTotal, 24_000_000)

  // Holiday surcharge: 2027-01-01..2027-01-03 (Jan 1 holiday + Jan 2 Saturday)
  const holidayQuote = calculateRentalQuote({
    startDate: '2027-01-01',
    endDate: '2027-01-03',
    dailyPrice: 800_000,
    weekendSurcharge: 100_000,
    holidaySurcharge: 250_000,
  })
  assert.equal(holidayQuote.holidayDays, 1)
  assert.equal(holidayQuote.holidaySurchargeTotal, 250_000)
  assert.equal(holidayQuote.weekendDays, 1)
  assert.equal(holidayQuote.weekendSurchargeTotal, 100_000)
  assert.equal(holidayQuote.estimatedTotal, 1_950_000)
})

test('inquiry transitions enforce valid workflow and block re-opening terminal states', () => {
  assert.equal(canTransitionInquiry('NEW', 'CONTACTED'), true)
  assert.equal(canTransitionInquiry('CONTACTED', 'CONTRACT_SIGNED'), true)
  assert.equal(canTransitionInquiry('CONTRACT_SIGNED', 'DELIVERED'), true)
  assert.equal(canTransitionInquiry('NEW', 'DELIVERED'), false)
  assert.equal(canTransitionInquiry('DEPOSIT_PENDING', 'DELIVERED'), false)
  assert.equal(canTransitionInquiry('DELIVERED', 'CANCELLED'), false)
  assert.equal(canTransitionInquiry('CANCELLED', 'NEW'), false)
  assert.equal(canTransitionInquiry('CLOSED', 'CONTACTED'), false)
})

test('deposit expiration flags DEPOSIT_PENDING records older than holdHours', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  assert.equal(isDepositExpired('2026-11-16T10:00:00Z', 'DEPOSIT_PENDING', 24, now), true)
  assert.equal(isDepositExpired('2026-11-16T13:00:00Z', 'DEPOSIT_PENDING', 24, now), false)
  assert.equal(isDepositExpired('2026-11-10T00:00:00Z', 'CONFIRMED', 24, now), false)
  assert.equal(isDepositExpired(null, 'DEPOSIT_PENDING', 24, now), false)
})

// === TEST CASES: SALE-01 to SALE-09 (Quy tắc tính giá lăn bánh & Bán xe) ===
test('SALE: calculateRollingPrice computes 0% registration tax for Electric Car (EV)', () => {
  const evBreakdown = calculateRollingPrice(895_000_000, 'CAR', 'Điện (EV)', true)
  assert.ok(evBreakdown)
  assert.equal(evBreakdown.registrationTaxRate, 0)
  assert.equal(evBreakdown.registrationTax, 0)
  assert.equal(evBreakdown.plateFee, 20_000_000)
  assert.equal(evBreakdown.inspectionAndRoadFee, 1_900_000)
  assert.equal(evBreakdown.civilInsuranceFee, 873_400)
  assert.equal(evBreakdown.totalEstimated, 895_000_000 + 20_000_000 + 1_900_000 + 873_400)
})

test('SALE: calculateRollingPrice computes 2% registration tax for Used Car', () => {
  const usedCarBreakdown = calculateRollingPrice(465_000_000, 'CAR', 'Xăng', false)
  assert.ok(usedCarBreakdown)
  assert.equal(usedCarBreakdown.registrationTaxRate, 0.02)
  assert.equal(usedCarBreakdown.registrationTax, 9_300_000)
  assert.equal(usedCarBreakdown.plateFee, 1_000_000)
  assert.equal(usedCarBreakdown.civilInsuranceFee, 873_400)
})

test('SALE: calculateRollingPrice computes 6% registration tax for New Pickup Truck', () => {
  const pickupBreakdown = calculateRollingPrice(1_195_000_000, 'PICKUP', 'Dầu (Diesel)', true)
  assert.ok(pickupBreakdown)
  assert.equal(pickupBreakdown.registrationTaxRate, 0.06)
  assert.equal(pickupBreakdown.registrationTax, 71_700_000)
  assert.equal(pickupBreakdown.plateFee, 20_000_000)
  assert.equal(pickupBreakdown.civilInsuranceFee, 1_026_000)
})

test('SALE: calculateRollingPrice computes 2% registration tax & 2M plate fee for New Motorbike', () => {
  const bikeBreakdown = calculateRollingPrice(91_000_000, 'MOTORBIKE', 'Xăng', true)
  assert.ok(bikeBreakdown)
  assert.equal(bikeBreakdown.registrationTaxRate, 0.02)
  assert.equal(bikeBreakdown.registrationTax, 1_820_000)
  assert.equal(bikeBreakdown.plateFee, 2_000_000)
  assert.equal(bikeBreakdown.inspectionAndRoadFee, 0)
  assert.equal(bikeBreakdown.civilInsuranceFee, 66_000)
})

// === TEST CASES: DEP-01 to DEP-10 (Quy tắc tiền đặt cọc) ===
test('DEP: rental quote keeps depositAmount distinct and separate from rent', () => {
  const quote = calculateRentalQuote({
    startDate: '2026-12-01',
    endDate: '2026-12-04',
    dailyPrice: 1_000_000,
    vehicleDeposit: 5_000_000,
  })
  assert.equal(quote.totalDays, 3)
  assert.equal(quote.estimatedTotal, 3_000_000)
  assert.equal(quote.depositAmount, 5_000_000)
  assert.equal(quote.initialPaymentDue, 5_000_000)
  assert.equal(quote.remainingAmount, 3_000_000)
})

test('DEP: custom delivery fee is added to total without inflating deposit', () => {
  const quoteWithDelivery = calculateRentalQuote({
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    dailyPrice: 1_000_000,
    vehicleDeliveryFee: 150_000,
    vehicleDeposit: 5_000_000,
    deliveryRequested: true,
  })
  assert.equal(quoteWithDelivery.deliveryFee, 150_000)
  assert.equal(quoteWithDelivery.estimatedTotal, 2_150_000)
  assert.equal(quoteWithDelivery.depositAmount, 5_000_000)
})

// === TEST CASES: RENT-01 to RENT-16 (Dịch vụ gia tăng Addons & Khuyến mãi) ===
test('RENT: addon services calculate correctly for both per-day and flat rates', () => {
  // EXTENDED_INSURANCE (90k/day) + CHILD_SEAT (100k flat)
  const addonFee = calculateAddonFee(['EXTENDED_INSURANCE', 'CHILD_SEAT'], 4)
  assert.equal(addonFee, 90_000 * 4 + 100_000)
})

test('RENT: invalid addon keys are ignored safely without throwing error', () => {
  const safeKeys = parseAddonKeys(['INVALID_ADDON', 'EXTENDED_INSURANCE', null, ''])
  assert.deepEqual(safeKeys, ['EXTENDED_INSURANCE'])
})

// === UPGRADE UNIT TESTS: Part A – Booking Modification Eligibility & Atomic Diff ===
test('BK-RULES: canModifyBooking allows logged-in owner on PENDING booking with no payments', () => {
  const res = canModifyBooking({
    status: 'PENDING',
    isLoggedIn: true,
    isOwner: true,
    hasPaymentRecord: false,
  })
  assert.equal(res.allowed, true)
})

test('BK-RULES: canModifyBooking rejects unauthenticated, non-owner, paid, or non-PENDING bookings', () => {
  assert.equal(
    canModifyBooking({ status: 'PENDING', isLoggedIn: false, isOwner: false }).code,
    'UNAUTHORIZED',
  )
  assert.equal(
    canModifyBooking({ status: 'PENDING', isLoggedIn: true, isOwner: false }).code,
    'FORBIDDEN',
  )
  assert.equal(
    canModifyBooking({
      status: 'PENDING',
      isLoggedIn: true,
      isOwner: true,
      hasPaymentRecord: true,
    }).code,
    'PAYMENT_LOCKED',
  )
  const confirmedCheck = canModifyBooking({
    status: 'CONFIRMED',
    isLoggedIn: true,
    isOwner: true,
    hasPaymentRecord: false,
  })
  assert.equal(confirmedCheck.allowed, false)
  assert.equal(confirmedCheck.code, 'STATUS_LOCKED')
  assert.equal(confirmedCheck.reason, BOOKING_CONFIRMED_LOCK_MESSAGE)

  for (const st of [
    'DEPOSIT_PENDING',
    'READY_FOR_HANDOVER',
    'ONGOING',
    'INSPECTING',
    'COMPLETED',
    'CANCELLED',
    'REJECTED',
  ]) {
    assert.equal(
      canModifyBooking({ status: st, isLoggedIn: true, isOwner: true }).allowed,
      false,
      `Expected status ${st} to disallow direct modification`,
    )
  }
})

test('BK-RULES: getBookingActionMatrix matches Section 4.2 state permission matrix', () => {
  const pendingMatrix = getBookingActionMatrix('PENDING', false, '2026-12-10', '2026-12-01')
  assert.equal(pendingMatrix.canEditDirectly, true)
  assert.equal(pendingMatrix.canCancelDirectly, true)
  assert.equal(pendingMatrix.canViewDetail, true)
  assert.equal(pendingMatrix.canContactSupport, true)

  const pendingPaidMatrix = getBookingActionMatrix('PENDING', true, '2026-12-10', '2026-12-01')
  assert.equal(pendingPaidMatrix.canEditDirectly, false)
  assert.equal(pendingPaidMatrix.canCancelDirectly, true)

  const confirmedMatrix = getBookingActionMatrix('CONFIRMED', false, '2026-12-10', '2026-12-01')
  assert.equal(confirmedMatrix.canEditDirectly, false)
  assert.equal(confirmedMatrix.canCancelDirectly, false)
  assert.equal(confirmedMatrix.canViewDetail, true)
})

test('BK-RULES: computeRentalDayDiff keeps overlapping days intact and computes exact insert/delete sets', () => {
  const diff = computeRentalDayDiff(
    'v1',
    '2026-12-01',
    '2026-12-04',
    'v1',
    '2026-12-02',
    '2026-12-06',
  )
  assert.deepEqual(diff.unchangedKeys, ['v1:2026-12-02', 'v1:2026-12-03'])
  assert.deepEqual(diff.toDeleteKeys, ['v1:2026-12-01'])
  assert.deepEqual(
    diff.toInsert.map((x) => x.key),
    ['v1:2026-12-04', 'v1:2026-12-05'],
  )
})

test('BK-RULES: validateTimeString validates HH:MM 24-hour strings strictly', () => {
  assert.equal(validateTimeString('08:00'), true)
  assert.equal(validateTimeString('23:59'), true)
  assert.equal(validateTimeString('24:00'), false)
  assert.equal(validateTimeString('8:00'), false)
  assert.equal(validateTimeString('12:60'), false)
})

// === UPGRADE UNIT TESTS: Part B – Next Working Day & Urgent Consultation Slot ===
test('NT-RULES: calculateNextContactSlot advances Mon->Tue on normal working week', () => {
  // 2026-11-16 is Monday in Vietnam
  const slot = calculateNextContactSlot('2026-11-16T03:00:00.000Z', {
    timezone: 'Asia/Ho_Chi_Minh',
    workingDays: '1,2,3,4,5',
    workStartTime: '08:00',
    workEndTime: '17:30',
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',
  })
  assert.equal(slot.approvedLocalDate, '2026-11-16')
  assert.equal(slot.expectedContactDate, '2026-11-17')
  assert.equal(slot.weekdayLabel, 'Thứ Ba')
  assert.match(slot.workingHoursLabel, /08:00 – 17:30/)
  assert.equal(slot.isUrgent, false)
})

test('NT-RULES: calculateNextContactSlot skips weekend (Fri->Mon) and configured holidays', () => {
  // 2026-11-20 is Friday -> skips Sat 21 & Sun 22 -> lands on Mon 23
  const friSlot = calculateNextContactSlot('2026-11-20T08:00:00.000Z', {
    timezone: 'Asia/Ho_Chi_Minh',
    workingDays: '1,2,3,4,5',
  })
  assert.equal(friSlot.expectedContactDate, '2026-11-23')
  assert.equal(friSlot.weekdayLabel, 'Thứ Hai')

  // Skip custom holiday on 2026-11-23 -> lands on Tue 2026-11-24
  const holidaySkipSlot = calculateNextContactSlot('2026-11-20T08:00:00.000Z', {
    timezone: 'Asia/Ho_Chi_Minh',
    workingDays: '1,2,3,4,5',
    holidays: [{ date: '2026-11-23', name: 'Nghỉ bù nội bộ' }],
  })
  assert.equal(holidaySkipSlot.expectedContactDate, '2026-11-24')
  assert.equal(holidaySkipSlot.weekdayLabel, 'Thứ Ba')
})

test('NT-RULES: calculateNextContactSlot flags urgent booking when pickup precedes contact slot', () => {
  const urgentSameDay = calculateNextContactSlot(
    '2026-11-20T08:00:00.000Z',
    {
      timezone: 'Asia/Ho_Chi_Minh',
      workingDays: '1,2,3,4,5',
      workStartTime: '08:30',
      workEndTime: '17:30',
    },
    { startDate: '2026-11-21', pickupTime: '09:00' }, // Sat pickup before Mon contact
  )
  assert.equal(urgentSameDay.isUrgent, true)

  const nonUrgentLater = calculateNextContactSlot(
    '2026-11-16T03:00:00.000Z',
    {
      timezone: 'Asia/Ho_Chi_Minh',
      workingDays: '1,2,3,4,5',
      workStartTime: '08:00',
      workEndTime: '17:30',
    },
    { startDate: '2026-11-20', pickupTime: '10:00' },
  )
  assert.equal(nonUrgentLater.isUrgent, false)
})

test('NT-RULES: parseWorkingDays and maskPhone handle edge cases cleanly', () => {
  assert.deepEqual(parseWorkingDays('MON,TUE,WED,SAT'), [1, 2, 3, 6])
  assert.deepEqual(parseWorkingDays(''), [1, 2, 3, 4, 5])
  assert.equal(maskPhone('0901234567'), '090***4567')
  assert.equal(maskPhone(null), 'Chưa cập nhật')
})

// === UPGRADE UNIT TESTS: Part D & E – Dynamic Vehicle Categories, Photos & EV Specs ===
test('VH-RULES: motorbike photo options exclude car interior angles and include EV battery only when electric', () => {
  const gasBikePhotos = getPhotoTypeOptions('MOTORBIKE', false, false)
  assert.equal(
    gasBikePhotos.some((p) => p.kind === 'INTERIOR'),
    false,
  )
  assert.equal(
    gasBikePhotos.some((p) => p.value === 'BATTERY_CHARGER'),
    false,
  )

  const evBikePhotos = getPhotoTypeOptions('MOTORBIKE', true, true)
  assert.equal(
    evBikePhotos.some((p) => p.value === 'BATTERY_CHARGER'),
    true,
  )
  assert.equal(
    evBikePhotos.some((p) => p.value === 'ODO'),
    true,
  )

  const carPhotos = getPhotoTypeOptions('CAR', false, false)
  assert.equal(
    carPhotos.some((p) => p.kind === 'INTERIOR'),
    true,
  )
})

test('VH-RULES: dynamic spec templates & isSpecApplicable exclude ICE cylinder/fuel tank on pure EVs', () => {
  const evBikeSpecs = getDynamicSpecTemplates('MOTORBIKE', 'Điện (EV)')
  assert.equal(
    evBikeSpecs.some((s) => /dung tích xi-lanh/i.test(s.label)),
    false,
  )
  assert.equal(
    evBikeSpecs.some((s) => s.group === 'EV'),
    true,
  )

  const pickupSpecs = getDynamicSpecTemplates('PICKUP', 'Dầu (Diesel)')
  assert.equal(
    pickupSpecs.some((s) => s.group === 'PICKUP'),
    true,
  )

  assert.equal(isSpecApplicable('Dung tích xi-lanh', 'Điện (EV)'), false)
  assert.equal(isSpecApplicable('Dung tích bình nhiên liệu', 'Điện (EV)'), false)
  assert.equal(isSpecApplicable('Dung tích xi-lanh', 'Xăng'), true)
  assert.equal(isSpecApplicable('Dung lượng pin', 'Điện (EV)'), true)
})

test('VH-RULES: subCategoriesByCategory & getDynamicFeaturePresets isolate CAR, MOTORBIKE, PICKUP', () => {
  assert.ok(subCategoriesByCategory.MOTORBIKE.includes('ELECTRIC_BIKE'))
  assert.equal(subCategoriesByCategory.MOTORBIKE.includes('ELECTRIC_CAR'), false)
  assert.ok(subCategoriesByCategory.CAR.includes('ELECTRIC_CAR'))
  assert.ok(subCategoriesByCategory.PICKUP.includes('PERFORMANCE_PICKUP'))

  const bikeFeatures = getDynamicFeaturePresets('MOTORBIKE')
  assert.equal(
    bikeFeatures.comfortTech.some((f) => /Cửa sổ trời/i.test(f.name)),
    false,
  )
})

// === QA REGRESSION UNIT TESTS: Promotions, Pricing, Rounding & Deposit Separation ===
const baseSamplePromo = {
  code: 'NORIQA10',
  name: 'Ưu đãi QA 10%',
  discountType: 'PERCENT',
  discountValue: 10,
  maxDiscount: 300_000,
  minDays: 3,
  appliesTo: 'RENT',
  validFrom: '2026-11-18',
  validTo: '2026-11-30',
  usageLimit: 5,
  usedCount: 2,
  active: true,
}

test('PROMO-01: formatVnd formats zero as 0 ₫ while formatMoney keeps Chưa cập nhật for unset catalogue prices', () => {
  assert.match(formatVnd(0), /^0\s*₫$/)
  assert.match(formatVnd(30_000), /30\.000\s*₫/)
  assert.equal(formatVnd(null), 'Chưa cập nhật')
  assert.equal(formatVnd(undefined), 'Chưa cập nhật')
  assert.equal(formatVnd(12.5), 'Chưa cập nhật')
  assert.equal(formatMoney(0), 'Chưa cập nhật')
})

test('PROMO-02: evaluatePromotion returns distinct message when promo code does not exist', () => {
  const res = evaluatePromotion(null, {
    code: 'KHONGTONTAI',
    serviceType: 'RENT',
    totalDays: 3,
    subtotalBeforePromo: 2_000_000,
    today: '2026-11-18',
  })
  assert.equal(res.valid, false)
  assert.equal(res.status, 'NOT_FOUND')
  assert.equal(res.discountAmount, 0)
  assert.match(res.message, /không tồn tại/i)
})

test('PROMO-03: evaluatePromotion returns distinct message when promotion is disabled (inactive)', () => {
  const res = evaluatePromotion(
    { ...baseSamplePromo, active: false },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 4,
      subtotalBeforePromo: 3_000_000,
      today: '2026-11-18',
    },
  )
  assert.equal(res.valid, false)
  assert.equal(res.status, 'INACTIVE')
  assert.match(res.message, /tạm ngưng|vô hiệu/i)
})

test('PROMO-04: evaluatePromotion rejects wrong service scope (SALE promo on RENT booking)', () => {
  const res = evaluatePromotion(
    { ...baseSamplePromo, appliesTo: 'SALE' },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 4,
      subtotalBeforePromo: 3_000_000,
      today: '2026-11-18',
    },
  )
  assert.equal(res.valid, false)
  assert.equal(res.status, 'INVALID_SCOPE')
  assert.match(res.message, /không áp dụng cho dịch vụ này/i)
})

test('PROMO-05: evaluatePromotion checks start date and end date in Asia/Ho_Chi_Minh', () => {
  const notStarted = evaluatePromotion(
    { ...baseSamplePromo, validFrom: '2026-11-19', validTo: '2026-11-30' },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 10,
      subtotalBeforePromo: 5_000_000,
      today: businessToday(new Date('2026-11-18T06:00:00Z')), // 13:00 on 2026-11-18 in VN
    },
  )
  assert.equal(notStarted.valid, false)
  assert.equal(notStarted.status, 'NOT_STARTED')
  assert.match(notStarted.message, /chưa bắt đầu/i)
  assert.match(notStarted.message, /19\/11\/2026/)

  const startedAtVnMidnight = evaluatePromotion(
    { ...baseSamplePromo, validFrom: '2026-11-19', validTo: '2026-11-30' },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 10,
      subtotalBeforePromo: 5_000_000,
      today: businessToday(new Date('2026-11-18T17:00:01Z')), // 00:00:01 on 2026-11-19 in VN
    },
  )
  assert.equal(startedAtVnMidnight.valid, true)

  const expired = evaluatePromotion(
    { ...baseSamplePromo, validFrom: '2026-11-01', validTo: '2026-11-17' },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 5,
      subtotalBeforePromo: 4_000_000,
      today: '2026-11-18',
    },
  )
  assert.equal(expired.valid, false)
  assert.equal(expired.status, 'EXPIRED')
  assert.match(expired.message, /đã kết thúc/i)
})

test('PROMO-06: evaluatePromotion enforces usageLimit unless alreadyHeldByCurrentBooking is true', () => {
  const exhaustedPromo = { ...baseSamplePromo, usageLimit: 1, usedCount: 1 }
  const newCustomer = evaluatePromotion(exhaustedPromo, {
    code: 'NORIQA10',
    serviceType: 'RENT',
    totalDays: 5,
    subtotalBeforePromo: 2_500_000,
    today: '2026-11-18',
    alreadyHeldByCurrentBooking: false,
  })
  assert.equal(newCustomer.valid, false)
  assert.equal(newCustomer.status, 'USAGE_LIMIT_REACHED')
  assert.match(newCustomer.message, /hết lượt sử dụng/i)

  const sameBookingEdit = evaluatePromotion(exhaustedPromo, {
    code: 'NORIQA10',
    serviceType: 'RENT',
    totalDays: 5,
    subtotalBeforePromo: 2_500_000,
    today: '2026-11-18',
    alreadyHeldByCurrentBooking: true,
  })
  assert.equal(sameBookingEdit.valid, true)
  assert.equal(sameBookingEdit.status, 'APPLIED')
})

test('PROMO-07: evaluatePromotion enforces minDays with explicit required day count', () => {
  const shortTrip = evaluatePromotion(
    { ...baseSamplePromo, minDays: 10 },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 4,
      subtotalBeforePromo: 3_200_000,
      today: '2026-11-18',
    },
  )
  assert.equal(shortTrip.valid, false)
  assert.equal(shortTrip.status, 'MIN_DAYS_NOT_MET')
  assert.match(shortTrip.message, /tối thiểu 10 ngày/i)
})

test('PROMO-08: evaluatePromotion calculates PERCENT, maxDiscount cap, FIXED cap and integer VND rounding', () => {
  // 10% of 5,000,000 = 500,000 -> capped at maxDiscount 300,000
  const cappedPct = evaluatePromotion(baseSamplePromo, {
    code: 'NORIQA10',
    serviceType: 'RENT',
    totalDays: 5,
    subtotalBeforePromo: 5_000_000,
    today: '2026-11-18',
  })
  assert.equal(cappedPct.valid, true)
  assert.equal(cappedPct.discountAmount, 300_000)
  assert.equal(cappedPct.finalTotal, 4_700_000)
  assert.match(cappedPct.message, /áp dụng thành công/i)

  // Rounding test: 15% of 1,333,335 = 200,000.25 -> rounds to 200,000 integer
  const roundedPct = evaluatePromotion(
    { ...baseSamplePromo, discountValue: 15, maxDiscount: null },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 3,
      subtotalBeforePromo: 1_333_335,
      today: '2026-11-18',
    },
  )
  assert.equal(Number.isSafeInteger(roundedPct.discountAmount), true)
  assert.equal(roundedPct.discountAmount, 200_000)
  assert.equal(roundedPct.finalTotal, 1_133_335)

  // FIXED promo exceeding subtotal caps at subtotal (finalTotal = 0, never negative)
  const hugeFixed = evaluatePromotion(
    { ...baseSamplePromo, discountType: 'FIXED', discountValue: 5_000_000, maxDiscount: null },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: 3,
      subtotalBeforePromo: 1_200_000,
      today: '2026-11-18',
    },
  )
  assert.equal(hugeFixed.valid, true)
  assert.equal(hugeFixed.discountAmount, 1_200_000)
  assert.equal(hugeFixed.finalTotal, 0)
})

test('PROMO-09: applyPromotionToQuote combines long-term discount + promo and NEVER subtracts depositAmount from remainingAmount', () => {
  // 7-day rental: 1,000,000/day = 7,000,000 base - 5% weekly (350,000) = 6,650,000; deposit = 20,000,000
  const baseQuote = calculateRentalQuote({
    startDate: '2026-11-16',
    endDate: '2026-11-23',
    dailyPrice: 1_000_000,
    vehicleDeposit: 20_000_000,
  })
  assert.equal(baseQuote.estimatedTotal, 6_650_000)
  assert.equal(baseQuote.depositAmount, 20_000_000)

  const promoEval = evaluatePromotion(
    { ...baseSamplePromo, discountType: 'PERCENT', discountValue: 10, maxDiscount: 1_000_000 },
    {
      code: 'NORIQA10',
      serviceType: 'RENT',
      totalDays: baseQuote.totalDays,
      subtotalBeforePromo: baseQuote.estimatedTotal,
      today: '2026-11-18',
    },
  )
  assert.equal(promoEval.discountAmount, 665_000) // 10% of 6,650,000

  const merged = applyPromotionToQuote(baseQuote, promoEval)
  assert.equal(merged.estimatedTotal, 5_985_000)
  assert.equal(merged.depositAmount, 20_000_000)
  assert.equal(merged.initialPaymentDue, 20_000_000)
  // CRITICAL: remainingAmount MUST equal final rental fee (5,985,000), NOT Math.max(0, 5,985,000 - 20,000,000) = 0!
  assert.equal(merged.remainingAmount, 5_985_000)
  assert.equal(PROMO_REMOVED_MESSAGE, 'Đã bỏ mã khuyến mãi.')
})

test('PROMO-10: getPromotionRuntimeStatus distinguishes active switch from 5 runtime states and computes remainingUses', () => {
  assert.deepEqual(getPromotionRuntimeStatus({ ...baseSamplePromo, active: false }, '2026-11-20'), {
    status: 'DISABLED',
    label: 'Vô hiệu hóa',
    tone: 'muted',
    remainingUses: 3,
  })
  assert.deepEqual(
    getPromotionRuntimeStatus(
      { ...baseSamplePromo, validFrom: '2026-11-19', validTo: '2026-11-30' },
      '2026-11-18',
    ),
    {
      status: 'UPCOMING',
      label: 'Chưa bắt đầu',
      tone: 'warning',
      remainingUses: 3,
    },
  )
  assert.deepEqual(
    getPromotionRuntimeStatus(
      { ...baseSamplePromo, validFrom: '2026-11-01', validTo: '2026-11-17' },
      '2026-11-18',
    ),
    {
      status: 'EXPIRED',
      label: 'Hết hạn',
      tone: 'danger',
      remainingUses: 3,
    },
  )
  assert.deepEqual(
    getPromotionRuntimeStatus({ ...baseSamplePromo, usageLimit: 5, usedCount: 5 }, '2026-11-20'),
    {
      status: 'EXHAUSTED',
      label: 'Hết lượt',
      tone: 'warning',
      remainingUses: 0,
    },
  )
  assert.deepEqual(
    getPromotionRuntimeStatus({ ...baseSamplePromo, usageLimit: null }, '2026-11-20'),
    {
      status: 'ACTIVE_LIVE',
      label: 'Đang diễn ra',
      tone: 'brand',
      remainingUses: null,
    },
  )
})

test('PROMO-11: validatePromotionInput blocks >100% discount, negative values, reversed dates, and usageLimit < usedCount', () => {
  assert.ok(
    validatePromotionInput({
      code: 'OVER100',
      name: 'Quá 100%',
      discountType: 'PERCENT',
      discountValue: 120,
    }).error,
  )
  assert.ok(
    validatePromotionInput({
      code: 'NEGVAL',
      name: 'Âm tiền',
      discountType: 'FIXED',
      discountValue: -10_000,
    }).error,
  )
  assert.ok(
    validatePromotionInput({
      code: 'BADDATE',
      name: 'Sai ngày',
      discountType: 'FIXED',
      discountValue: 50_000,
      validFrom: '2026-11-25',
      validTo: '2026-11-20',
    }).error,
  )
  assert.ok(
    validatePromotionInput(
      {
        code: 'LIMITLOW',
        name: 'Giảm lượt thấp hơn đã dùng',
        discountType: 'PERCENT',
        discountValue: 10,
        usageLimit: 2,
      },
      5,
    ).error,
  )
  assert.ok(
    validatePromotionInput({
      code: 'BAD CODE!',
      name: 'Ký tự lạ',
      discountType: 'PERCENT',
      discountValue: 10,
    }).error,
  )
  const valid = validatePromotionInput({
    code: '  nori2026  ',
    name: ' Khuyến mãi chuẩn ',
    discountType: 'PERCENT',
    discountValue: 100,
    maxDiscount: 500_000,
    minDays: 2,
    appliesTo: 'RENT',
    validFrom: '2026-11-18',
    validTo: '2026-12-31',
    usageLimit: 20,
    active: true,
  })
  assert.equal(valid.error, undefined)
  assert.equal(valid.normalized?.code, 'NORI2026')
  assert.equal(valid.normalized?.discountValue, 100)
})

test('session-cookie: cookie names and TTL constants separate CUSTOMER vs ADMIN', () => {
  assert.equal(CUSTOMER_COOKIE_NAME, 'app-session')
  assert.equal(ADMIN_COOKIE_NAME, 'payload-token')
  assert.equal(CUSTOMER_SESSION_MAX_AGE, 604_800)
  assert.equal(ADMIN_SESSION_MAX_AGE, 86_400)
  assert.ok(CUSTOMER_SESSION_MAX_AGE > 7200)
})

test('session-cookie: HTTP localhost, 127.0.0.1, and LAN IP never set Secure even if site env is HTTPS', () => {
  for (const requestUrl of [
    'http://localhost:3000/nori-api/auth/login',
    'http://127.0.0.1:3000/nori-api/auth/login',
    'http://192.168.1.55:3000/nori-api/auth/login',
  ]) {
    const opts = resolveRequestCookieConfig({
      requestUrl,
      forwardedProto: null,
      originHeader: new URL(requestUrl).origin,
      figmaPublicUrl: null,
      maxAge: CUSTOMER_SESSION_MAX_AGE,
    })
    assert.deepEqual(opts, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: CUSTOMER_SESSION_MAX_AGE,
    })
  }
})

test('session-cookie: HTTPS direct and X-Forwarded-Proto https behind reverse proxy set Secure + SameSite=lax', () => {
  const directHttps = resolveRequestCookieConfig({
    requestUrl: 'https://nori.vn/nori-api/auth/login',
    forwardedProto: null,
    figmaPublicUrl: null,
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })
  assert.deepEqual(directHttps, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })

  const proxyHttps = resolveRequestCookieConfig({
    requestUrl: 'http://0.0.0.0:3000/nori-api/auth/login',
    forwardedProto: 'https, http',
    originHeader: 'https://nori.vn',
    figmaPublicUrl: null,
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })
  assert.deepEqual(proxyHttps, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })
})

test('session-cookie: cross-origin Figma Make HTTPS preview uses SameSite=none + Secure, while plain HTTP stays Lax', () => {
  const httpsPreview = resolveRequestCookieConfig({
    requestUrl: 'http://0.0.0.0:3000/nori-api/auth/login',
    forwardedProto: 'https',
    figmaPublicUrl: 'https://preview-sandbox.figma.site',
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })
  assert.equal(httpsPreview.secure, true)
  assert.equal(httpsPreview.sameSite, 'none')

  const httpWithPreviewEnv = resolveRequestCookieConfig({
    requestUrl: 'http://localhost:3000/nori-api/auth/login',
    forwardedProto: 'http',
    figmaPublicUrl: 'https://preview-sandbox.figma.site',
    maxAge: CUSTOMER_SESSION_MAX_AGE,
  })
  assert.equal(httpWithPreviewEnv.secure, false)
  assert.equal(httpWithPreviewEnv.sameSite, 'lax')
})

test('session-cookie: hasActiveSessionRecord accepts live sid, rejects revoked or expired sessions', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const past = new Date(Date.now() - 60 * 1000).toISOString()

  assert.equal(hasActiveSessionRecord(null), false)
  assert.equal(hasActiveSessionRecord({ id: 'u1' }), true)
  assert.equal(
    hasActiveSessionRecord({
      _sid: 'sid-1',
      sessions: [{ id: 'sid-1', expiresAt: future }],
    }),
    true,
  )
  assert.equal(
    hasActiveSessionRecord({
      _sid: 'sid-revoked',
      sessions: [{ id: 'sid-1', expiresAt: future }],
    }),
    false,
  )
  assert.equal(
    hasActiveSessionRecord({
      _sid: 'sid-expired',
      sessions: [{ id: 'sid-expired', expiresAt: past }],
    }),
    false,
  )
})
