export const DAY_MS = 86_400_000
export const HOLD_STATUSES = ['PENDING', 'CONFIRMED', 'ONGOING'] as const
export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'

export function businessToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function dateNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const time = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return NaN
  return Math.floor(time / DAY_MS)
}

export function addDays(value: string, days: number): string {
  return new Date((dateNumber(value) + days) * DAY_MS).toISOString().slice(0, 10)
}

export function validateRentalDates(startDate: string, endDate: string, today = businessToday()) {
  const start = dateNumber(startDate)
  const end = dateNumber(endDate)
  const now = dateNumber(today)
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return { error: 'Vui lòng chọn ngày nhận và ngày trả hợp lệ.' }
  if (start < now) return { error: 'Ngày nhận xe không được ở trong quá khứ.' }
  if (start > now + 90) return { error: 'Bạn có thể đặt xe trước tối đa 90 ngày.' }
  const totalDays = end - start
  if (totalDays < 1) return { error: 'Ngày trả xe phải sau ngày nhận ít nhất 1 ngày.' }
  if (totalDays > 30) return { error: 'Mỗi đơn thuê kéo dài tối đa 30 ngày.' }
  return { totalDays }
}

export function rentalDays(start: string, end: string): string[] {
  const result: string[] = []
  for (let day = dateNumber(start); day < dateNumber(end); day++) {
    result.push(new Date(day * DAY_MS).toISOString().slice(0, 10))
  }
  return result
}

export function overlaps(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
) {
  return a.startDate < b.endDate && a.endDate > b.startDate
}

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: 'customer' | 'admin',
  startDate: string,
  today = businessToday(),
) {
  if (actor === 'customer') return from === 'PENDING' && to === 'CANCELLED'
  const allowed: Record<BookingStatus, BookingStatus[]> = {
    PENDING: ['CONFIRMED', 'REJECTED'],
    CONFIRMED: ['ONGOING', 'CANCELLED'],
    ONGOING: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
  }
  return allowed[from]?.includes(to) && (to !== 'ONGOING' || today >= startDate)
}

export function formatMoney(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'Chưa cập nhật'
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0
    ? new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(amount)
    : 'Chưa cập nhật'
}

export function formatDate(value?: string | null): string {
  if (!value || !Number.isFinite(dateNumber(value.slice(0, 10)))) return 'Chưa cập nhật'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  if (!Number.isFinite(date.getTime())) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeZone: dateOnly ? 'UTC' : 'Asia/Ho_Chi_Minh',
  }).format(date)
}

export function relationId<T extends string | number>(
  value: T | { id: T } | null | undefined,
): T | undefined {
  return typeof value === 'object' && value !== null ? value.id : (value ?? undefined)
}
