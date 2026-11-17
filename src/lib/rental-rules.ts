export const DAY_MS = 86_400_000
export const HOLD_STATUSES = [
  'PENDING',
  'DEPOSIT_PENDING',
  'CONFIRMED',
  'READY_FOR_HANDOVER',
  'ONGOING',
  'INSPECTING',
] as const
export type BookingStatus =
  | 'PENDING'
  | 'DEPOSIT_PENDING'
  | 'CONFIRMED'
  | 'READY_FOR_HANDOVER'
  | 'ONGOING'
  | 'INSPECTING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'

export type AddonDefinition = {
  id: 'EXTENDED_INSURANCE' | 'CHILD_SEAT' | 'EXTRA_HELMET' | 'DASHCAM'
  label: string
  description: string
  price: number
  perDay: boolean
}

export const RENTAL_ADDONS: Record<AddonDefinition['id'], AddonDefinition> = {
  EXTENDED_INSURANCE: {
    id: 'EXTENDED_INSURANCE',
    label: 'Gói bảo vệ mở rộng (tham khảo)',
    description: 'Giảm mức miễn thường khi phát sinh sự cố ngoài ý muốn',
    price: 90_000,
    perDay: true,
  },
  CHILD_SEAT: {
    id: 'CHILD_SEAT',
    label: 'Ghế an toàn trẻ em',
    description: 'Lắp đặt sẵn trước khi bàn giao ô tô',
    price: 100_000,
    perDay: false,
  },
  EXTRA_HELMET: {
    id: 'EXTRA_HELMET',
    label: 'Bộ 2 mũ bảo hiểm & áo mưa',
    description: 'Phụ kiện tiêu chuẩn cho xe máy đi đường dài',
    price: 40_000,
    perDay: false,
  },
  DASHCAM: {
    id: 'DASHCAM',
    label: 'Camera hành trình / Giá đỡ dẫn đường',
    description: 'Hỗ trợ ghi hình và dẫn đường an toàn',
    price: 50_000,
    perDay: false,
  },
}

export const subCategoryLabels: Record<string, string> = {
  MANUAL_BIKE: 'Xe số',
  SCOOTER: 'Xe tay ga',
  CLUTCH_BIKE: 'Xe côn tay',
  BIG_BIKE: 'Mô tô phân khối lớn',
  ELECTRIC_BIKE: 'Xe máy điện',
  HATCHBACK: 'Hatchback',
  SEDAN: 'Sedan',
  SUV: 'SUV',
  CUV: 'CUV',
  MPV: 'MPV',
  COUPE: 'Coupe',
  SPORTS: 'Xe thể thao',
  ELECTRIC_CAR: 'Xe điện',
  STANDARD_PICKUP: 'Bán tải phổ thông',
  WORK_PICKUP: 'Bán tải công việc',
  PREMIUM_PICKUP: 'Bán tải cao cấp',
  PERFORMANCE_PICKUP: 'Bán tải hiệu năng cao',
}

export const bookingStatusLabels: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  DEPOSIT_PENDING: 'Chờ đặt cọc',
  CONFIRMED: 'Đã xác nhận',
  READY_FOR_HANDOVER: 'Chờ giao xe',
  ONGOING: 'Đang thuê',
  INSPECTING: 'Chờ kiểm tra & quyết toán',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Bị từ chối',
}

export const inquiryTypeLabels: Record<string, string> = {
  CONSULTATION: 'Tư vấn mua xe',
  QUOTE: 'Yêu cầu báo giá',
  VIEWING: 'Đăng ký xem xe',
  TEST_DRIVE: 'Đăng ký lái thử',
  PURCHASE_REQUEST: 'Yêu cầu mua xe',
}

export const inquiryStatusLabels: Record<string, string> = {
  NEW: 'Chờ tiếp nhận',
  CONTACTED: 'Đã liên hệ',
  TEST_DRIVE_SCHEDULED: 'Đã hẹn xem / lái thử',
  DEPOSIT_PENDING: 'Chờ đặt cọc',
  CONTRACT_SIGNED: 'Đã ký hồ sơ',
  DELIVERED: 'Đã bàn giao xe',
  CLOSED: 'Hoàn tất / Đã đóng',
  CANCELLED: 'Đã hủy',
}

export const operationStatusLabels: Record<string, string> = {
  READY: 'Sẵn sàng',
  RENTED: 'Đang cho thuê',
  RESERVED: 'Đang giữ chỗ',
  MAINTENANCE: 'Đang bảo dưỡng',
  SOLD: 'Đã bán',
  INACTIVE: 'Tạm ngừng cung cấp',
}

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

export function countWeekendDays(start: string, end: string): number {
  let count = 0
  for (const day of rentalDays(start, end)) {
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) count += 1
  }
  return count
}

const FIXED_HOLIDAY_MONTH_DAYS = new Set(['01-01', '04-30', '05-01', '09-02', '09-03'])

export const VIETNAM_HOLIDAYS = new Set([
  // Tết Nguyên Đán & Giỗ Tổ Hùng Vương 2026
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-04-26',
  // Tết Nguyên Đán & Giỗ Tổ Hùng Vương 2027
  '2027-02-05',
  '2027-02-06',
  '2027-02-07',
  '2027-02-08',
  '2027-02-09',
  '2027-04-16',
])

export function isVietnamHoliday(day: string): boolean {
  return FIXED_HOLIDAY_MONTH_DAYS.has(day.slice(5)) || VIETNAM_HOLIDAYS.has(day)
}

export function countHolidayDays(start: string, end: string): number {
  let count = 0
  for (const day of rentalDays(start, end)) {
    if (isVietnamHoliday(day)) count += 1
  }
  return count
}

export function parseAddonKeys(value?: string | string[] | null): AddonDefinition['id'][] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : []
  const unique = new Set<AddonDefinition['id']>()
  for (const key of raw) {
    if (key in RENTAL_ADDONS) unique.add(key as AddonDefinition['id'])
  }
  return [...unique]
}

export function calculateAddonFee(addonKeys: AddonDefinition['id'][], totalDays: number): number {
  return addonKeys.reduce((sum, key) => {
    const addon = RENTAL_ADDONS[key]
    if (!addon) return sum
    return sum + (addon.perDay ? addon.price * Math.max(1, totalDays) : addon.price)
  }, 0)
}

export type RentalQuoteInput = {
  startDate: string
  endDate: string
  dailyPrice: number
  weeklyPrice?: number | null
  monthlyPrice?: number | null
  weekendSurcharge?: number | null
  holidaySurcharge?: number | null
  deliveryRequested?: boolean
  vehicleDeliveryFee?: number | null
  addonKeys?: AddonDefinition['id'][]
  vehicleDeposit?: number | null
}

export type RentalQuoteBreakdown = {
  totalDays: number
  weekendDays: number
  holidayDays: number
  dailyPrice: number
  basePrice: number
  weekendSurchargeTotal: number
  holidaySurchargeTotal: number
  deliveryFee: number
  addonFee: number
  discountRate: number
  discountAmount: number
  estimatedTotal: number
  depositAmount: number
  initialPaymentDue: number
  remainingAmount: number
}

export function calculateRentalQuote(input: RentalQuoteInput): RentalQuoteBreakdown {
  const start = dateNumber(input.startDate)
  const end = dateNumber(input.endDate)
  const totalDays = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0
  const dailyPrice = Math.max(0, Math.round(input.dailyPrice || 0))
  const basePrice = dailyPrice * totalDays
  const weekendDays = totalDays > 0 ? countWeekendDays(input.startDate, input.endDate) : 0
  const holidayDays = totalDays > 0 ? countHolidayDays(input.startDate, input.endDate) : 0
  const weekendSurchargeTotal = weekendDays * Math.max(0, Math.round(input.weekendSurcharge ?? 0))
  const holidaySurchargeTotal = holidayDays * Math.max(0, Math.round(input.holidaySurcharge ?? 0))
  const pctRate = totalDays >= 30 ? 0.12 : totalDays >= 7 ? 0.05 : 0
  const pctDiscount = Math.round(basePrice * pctRate)
  let packageSavings = 0
  if (totalDays >= 30 && input.monthlyPrice && input.monthlyPrice > 0) {
    const months = Math.floor(totalDays / 30)
    const rem = totalDays % 30
    const pkgCost = months * Math.round(input.monthlyPrice) + rem * dailyPrice
    packageSavings = Math.max(0, basePrice - pkgCost)
  } else if (totalDays >= 7 && input.weeklyPrice && input.weeklyPrice > 0) {
    const weeks = Math.floor(totalDays / 7)
    const rem = totalDays % 7
    const pkgCost = weeks * Math.round(input.weeklyPrice) + rem * dailyPrice
    packageSavings = Math.max(0, basePrice - pkgCost)
  }
  const discountAmount = Math.max(pctDiscount, packageSavings)
  const discountRate =
    discountAmount === pctDiscount
      ? pctRate
      : basePrice > 0
        ? Number((discountAmount / basePrice).toFixed(4))
        : 0
  const deliveryFee = input.deliveryRequested
    ? Math.max(0, Math.round(input.vehicleDeliveryFee ?? 0))
    : 0
  const addonFee = calculateAddonFee(input.addonKeys ?? [], totalDays)
  const estimatedTotal = Math.max(
    0,
    basePrice +
      weekendSurchargeTotal +
      holidaySurchargeTotal +
      deliveryFee +
      addonFee -
      discountAmount,
  )
  const depositAmount = Math.max(0, Math.round(input.vehicleDeposit ?? 0))
  const initialPaymentDue = depositAmount
  const remainingAmount = estimatedTotal
  return {
    totalDays,
    weekendDays,
    holidayDays,
    dailyPrice,
    basePrice,
    weekendSurchargeTotal,
    holidaySurchargeTotal,
    deliveryFee,
    addonFee,
    discountRate,
    discountAmount,
    estimatedTotal,
    depositAmount,
    initialPaymentDue,
    remainingAmount,
  }
}

export type RollingCostBreakdown = {
  salePrice: number
  registrationTaxRate: number
  registrationTax: number
  plateFee: number
  inspectionAndRoadFee: number
  civilInsuranceFee: number
  totalEstimated: number
}

export function calculateRollingPrice(
  salePrice: number | null | undefined,
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP',
  fuelType?: string | null,
  isNew = false,
): RollingCostBreakdown | null {
  if (!salePrice || !Number.isFinite(salePrice) || salePrice <= 0) return null
  const normalizedPrice = Math.round(salePrice)
  let registrationTaxRate = 0.02
  if (isNew) {
    if (fuelType === 'Điện (EV)' && category !== 'MOTORBIKE') registrationTaxRate = 0
    else if (category === 'PICKUP') registrationTaxRate = 0.06
    else if (category === 'MOTORBIKE') registrationTaxRate = 0.02
    else registrationTaxRate = 0.1
  }
  const registrationTax = Math.round(normalizedPrice * registrationTaxRate)
  const plateFee =
    category === 'MOTORBIKE' ? (isNew ? 2_000_000 : 150_000) : isNew ? 20_000_000 : 1_000_000
  const inspectionAndRoadFee = category === 'MOTORBIKE' ? 0 : 1_900_000
  const civilInsuranceFee =
    category === 'MOTORBIKE' ? 66_000 : category === 'PICKUP' ? 1_026_000 : 873_400
  const totalEstimated =
    normalizedPrice + registrationTax + plateFee + inspectionAndRoadFee + civilInsuranceFee
  return {
    salePrice: normalizedPrice,
    registrationTaxRate,
    registrationTax,
    plateFee,
    inspectionAndRoadFee,
    civilInsuranceFee,
    totalEstimated,
  }
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
  if (actor === 'customer') {
    return (from === 'PENDING' || from === 'DEPOSIT_PENDING') && to === 'CANCELLED'
  }
  const allowed: Record<BookingStatus, BookingStatus[]> = {
    PENDING: ['DEPOSIT_PENDING', 'CONFIRMED', 'REJECTED'],
    DEPOSIT_PENDING: ['CONFIRMED', 'CANCELLED', 'REJECTED'],
    CONFIRMED: ['READY_FOR_HANDOVER', 'ONGOING', 'CANCELLED'],
    READY_FOR_HANDOVER: ['ONGOING', 'CANCELLED'],
    ONGOING: ['INSPECTING', 'COMPLETED'],
    INSPECTING: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
  }
  return Boolean(allowed[from]?.includes(to)) && (to !== 'ONGOING' || today >= startDate)
}

export type InquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'TEST_DRIVE_SCHEDULED'
  | 'DEPOSIT_PENDING'
  | 'CONTRACT_SIGNED'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED'

export function canTransitionInquiry(from: string, to: string): boolean {
  if (from === to) return true
  const allowed: Record<InquiryStatus, InquiryStatus[]> = {
    NEW: [
      'CONTACTED',
      'TEST_DRIVE_SCHEDULED',
      'DEPOSIT_PENDING',
      'CONTRACT_SIGNED',
      'CLOSED',
      'CANCELLED',
    ],
    CONTACTED: [
      'TEST_DRIVE_SCHEDULED',
      'DEPOSIT_PENDING',
      'CONTRACT_SIGNED',
      'CLOSED',
      'CANCELLED',
    ],
    TEST_DRIVE_SCHEDULED: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED', 'CLOSED', 'CANCELLED'],
    DEPOSIT_PENDING: ['CONTRACT_SIGNED', 'CLOSED', 'CANCELLED'],
    CONTRACT_SIGNED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [],
    CLOSED: [],
    CANCELLED: [],
  }
  return Boolean(allowed[from as InquiryStatus]?.includes(to as InquiryStatus))
}

export function isDepositExpired(
  createdAt: string | null | undefined,
  status: string,
  holdHours = 24,
  now = new Date(),
): boolean {
  if (status !== 'DEPOSIT_PENDING' || !createdAt) return false
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  return now.getTime() - createdMs > holdHours * 3_600_000
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
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: dateOnly ? 'UTC' : 'Asia/Ho_Chi_Minh',
  }).format(date)
}

export function relationId<T extends string | number>(
  value: T | { id: T } | null | undefined,
): T | undefined {
  return typeof value === 'object' && value !== null ? value.id : (value ?? undefined)
}
