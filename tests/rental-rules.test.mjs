import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  businessToday,
  calculateAddonFee,
  calculateRentalQuote,
  calculateRollingPrice,
  canTransition,
  canTransitionInquiry,
  countHolidayDays,
  countWeekendDays,
  dateNumber,
  formatDate,
  formatMoney,
  isDepositExpired,
  overlaps,
  parseAddonKeys,
  rentalDays,
  validateRentalDates,
} from '../src/lib/rental-rules.ts'

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
