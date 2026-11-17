import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  businessToday,
  canTransition,
  dateNumber,
  formatDate,
  formatMoney,
  overlaps,
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
test('date-only rental dates are not shifted by timezone', () =>
  assert.match(formatDate('2026-11-16'), /^16\b/))
test('record timestamps display the Vietnam calendar date', () =>
  assert.match(formatDate('2026-11-16T18:00:00.000Z'), /^17\b/))
test('admin cannot deliver before pickup date', () =>
  assert.equal(canTransition('CONFIRMED', 'ONGOING', 'admin', '2026-11-17', today), false))
test('admin can deliver on pickup date', () =>
  assert.equal(canTransition('CONFIRMED', 'ONGOING', 'admin', today, today), true))
test('admin can complete early after receiving the vehicle', () =>
  assert.equal(canTransition('ONGOING', 'COMPLETED', 'admin', today, today), true))
const statuses = ['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'REJECTED']
const adminAllowed = new Set([
  'PENDING:CONFIRMED',
  'PENDING:REJECTED',
  'CONFIRMED:ONGOING',
  'CONFIRMED:CANCELLED',
  'ONGOING:COMPLETED',
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
        from === 'PENDING' && to === 'CANCELLED',
      ))
  }
}
