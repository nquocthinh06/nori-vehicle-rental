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

export const subCategoriesByCategory: Record<'CAR' | 'MOTORBIKE' | 'PICKUP', string[]> = {
  CAR: ['HATCHBACK', 'SEDAN', 'SUV', 'CUV', 'MPV', 'COUPE', 'SPORTS', 'ELECTRIC_CAR'],
  MOTORBIKE: ['MANUAL_BIKE', 'SCOOTER', 'CLUTCH_BIKE', 'BIG_BIKE', 'ELECTRIC_BIKE'],
  PICKUP: ['STANDARD_PICKUP', 'WORK_PICKUP', 'PREMIUM_PICKUP', 'PERFORMANCE_PICKUP'],
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

export const CONSULTATION_STATUSES = [
  'PENDING_CONTACT',
  'CONTACTING',
  'NO_ANSWER',
  'CALLBACK_SCHEDULED',
  'CONSULTED',
  'COMPLETED',
  'CANCELLED',
] as const

export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number]

export const consultationStatusLabels: Record<ConsultationStatus, string> = {
  PENDING_CONTACT: 'Chờ liên hệ',
  CONTACTING: 'Đang liên hệ',
  NO_ANSWER: 'Không nghe máy',
  CALLBACK_SCHEDULED: 'Hẹn liên hệ lại',
  CONSULTED: 'Đã tư vấn',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
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

export const featureStatusLabels: Record<string, string> = {
  EQUIPPED: 'Có trang bị',
  NOT_EQUIPPED: 'Không có trang bị',
  UNVERIFIED: 'Chưa xác minh',
  NOT_APPLICABLE: 'Không áp dụng',
}

export function businessToday(now = new Date(), timeZone = 'Asia/Ho_Chi_Minh'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

export function validateTimeString(value?: string | null): boolean {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hh, mm] = value.split(':').map(Number)
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59
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

export function computeRentalDayDiff(
  oldVehicleId: string,
  oldStart: string,
  oldEnd: string,
  newVehicleId: string,
  newStart: string,
  newEnd: string,
) {
  const oldSet = new Set(rentalDays(oldStart, oldEnd).map((d) => `${oldVehicleId}:${d}`))
  const newDays = rentalDays(newStart, newEnd)
  const newEntries = newDays.map((day) => ({
    vehicleId: newVehicleId,
    day,
    key: `${newVehicleId}:${day}`,
  }))
  const newSet = new Set(newEntries.map((e) => e.key))
  const toInsert = newEntries.filter((e) => !oldSet.has(e.key))
  const toDeleteKeys = [...oldSet].filter((k) => !newSet.has(k))
  const unchangedKeys = [...oldSet].filter((k) => newSet.has(k))
  return { toInsert, toDeleteKeys, unchangedKeys }
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

export function isVietnamHoliday(day: string, customHolidays?: Iterable<string>): boolean {
  if (FIXED_HOLIDAY_MONTH_DAYS.has(day.slice(5)) || VIETNAM_HOLIDAYS.has(day)) return true
  if (customHolidays) {
    for (const h of customHolidays) {
      if (h === day) return true
    }
  }
  return false
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

export type BookingModifyCheckInput = {
  status: string
  isLoggedIn: boolean
  isOwner: boolean
  hasPaymentRecord?: boolean
}

export type BookingModifyCheckResult = {
  allowed: boolean
  code?: 'UNAUTHORIZED' | 'FORBIDDEN' | 'PAYMENT_LOCKED' | 'STATUS_LOCKED'
  reason?: string
}

export const BOOKING_CONFIRMED_LOCK_MESSAGE =
  'Đơn thuê của bạn vừa được NORI xác nhận. Thông tin thuê hiện không thể chỉnh sửa trực tiếp. Vui lòng liên hệ nhân viên hỗ trợ nếu cần thay đổi lịch trình.'

export function canModifyBooking(input: BookingModifyCheckInput): BookingModifyCheckResult {
  if (!input.isLoggedIn) {
    return {
      allowed: false,
      code: 'UNAUTHORIZED',
      reason: 'Vui lòng đăng nhập để chỉnh sửa đơn thuê.',
    }
  }
  if (!input.isOwner) {
    return {
      allowed: false,
      code: 'FORBIDDEN',
      reason: 'Bạn không có quyền chỉnh sửa đơn thuê này.',
    }
  }
  if (input.status !== 'PENDING') {
    if (['CONFIRMED', 'READY_FOR_HANDOVER', 'ONGOING', 'INSPECTING'].includes(input.status)) {
      return {
        allowed: false,
        code: 'STATUS_LOCKED',
        reason: BOOKING_CONFIRMED_LOCK_MESSAGE,
      }
    }
    if (input.status === 'DEPOSIT_PENDING') {
      return {
        allowed: false,
        code: 'STATUS_LOCKED',
        reason:
          'Đơn thuê đang chờ đối soát đặt cọc nên không thể tự chỉnh sửa trực tiếp. Vui lòng liên hệ nhân viên NORI nếu cần thay đổi lịch trình.',
      }
    }
    return {
      allowed: false,
      code: 'STATUS_LOCKED',
      reason: 'Đơn thuê ở trạng thái hiện tại không thể chỉnh sửa trực tiếp.',
    }
  }
  if (input.hasPaymentRecord) {
    return {
      allowed: false,
      code: 'PAYMENT_LOCKED',
      reason:
        'Đơn thuê đã phát sinh giao dịch đặt cọc hoặc thanh toán cần đối soát nên không thể tự chỉnh sửa. Vui lòng liên hệ nhân viên NORI để được hỗ trợ.',
    }
  }
  return { allowed: true }
}

export function getBookingActionMatrix(
  status: string,
  hasPaymentRecord = false,
  startDate = '2099-01-01',
  today = businessToday(),
) {
  const editCheck = canModifyBooking({
    status,
    isLoggedIn: true,
    isOwner: true,
    hasPaymentRecord,
  })
  const canCancelDirectly = canTransition(
    status as BookingStatus,
    'CANCELLED',
    'customer',
    startDate,
    today,
  )
  return {
    canEditDirectly: editCheck.allowed,
    editLockReason: editCheck.reason ?? null,
    canCancelDirectly,
    canViewDetail: true,
    canContactSupport: true,
  }
}

export type BusinessHoursConfig = {
  timezone?: string | null
  workingDays?: number[] | string | null
  workStartTime?: string | null
  workEndTime?: string | null
  lunchBreakStart?: string | null
  lunchBreakEnd?: string | null
  holidays?: ({ date: string; name?: string | null } | string)[] | null
  fallbackHoursLabel?: string | null
}

const WEEKDAY_LABELS_VI: Record<number, string> = {
  0: 'Chủ Nhật',
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
}

export function parseWorkingDays(raw?: number[] | string | null): number[] {
  if (Array.isArray(raw)) {
    const valid = raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    return valid.length ? [...new Set(valid)] : [1, 2, 3, 4, 5]
  }
  if (typeof raw === 'string' && raw.trim()) {
    const tokenMap: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    }
    const parsed = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .map((t) => (t in tokenMap ? tokenMap[t] : Number(t)))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    return parsed.length ? [...new Set(parsed)] : [1, 2, 3, 4, 5]
  }
  return [1, 2, 3, 4, 5]
}

export function calculateNextContactSlot(
  approvedAt: Date | string,
  config?: BusinessHoursConfig,
  pickupInfo?: { startDate: string; pickupTime?: string | null },
) {
  const tz = config?.timezone?.trim() || 'Asia/Ho_Chi_Minh'
  const dateObj = typeof approvedAt === 'string' ? new Date(approvedAt) : approvedAt
  const validNow = Number.isFinite(dateObj.getTime()) ? dateObj : new Date()
  let approvedLocalDate: string
  try {
    approvedLocalDate = businessToday(validNow, tz)
  } catch {
    approvedLocalDate = businessToday(validNow, 'Asia/Ho_Chi_Minh')
  }

  const workingDaySet = new Set(parseWorkingDays(config?.workingDays))
  const customHolidays = new Set<string>()
  for (const item of config?.holidays ?? []) {
    const d = typeof item === 'string' ? item.trim() : item?.date?.trim()
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) customHolidays.add(d)
  }

  let candidate = addDays(approvedLocalDate, 1)
  for (let i = 0; i < 60; i++) {
    const weekday = new Date(`${candidate}T00:00:00.000Z`).getUTCDay()
    if (workingDaySet.has(weekday) && !isVietnamHoliday(candidate, customHolidays)) {
      break
    }
    candidate = addDays(candidate, 1)
  }

  const weekday = new Date(`${candidate}T00:00:00.000Z`).getUTCDay()
  const weekdayLabel = WEEKDAY_LABELS_VI[weekday] ?? ''
  const hasExplicitHours =
    validateTimeString(config?.workStartTime) && validateTimeString(config?.workEndTime)
  const hasLunchBreak =
    validateTimeString(config?.lunchBreakStart) && validateTimeString(config?.lunchBreakEnd)

  let workingHoursLabel = 'Trong khung giờ hành chính'
  if (hasExplicitHours) {
    workingHoursLabel = `${config!.workStartTime} – ${config!.workEndTime}${
      hasLunchBreak ? ` (nghỉ trưa ${config!.lunchBreakStart} – ${config!.lunchBreakEnd})` : ''
    }`
  } else if (config?.fallbackHoursLabel?.trim()) {
    workingHoursLabel = config.fallbackHoursLabel.trim()
  }

  let isUrgent = false
  if (pickupInfo?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(pickupInfo.startDate)) {
    if (pickupInfo.startDate < candidate) {
      isUrgent = true
    } else if (pickupInfo.startDate === candidate) {
      const pTime = validateTimeString(pickupInfo.pickupTime) ? pickupInfo.pickupTime! : '08:00'
      const wStart = hasExplicitHours ? config!.workStartTime! : '08:30'
      if (pTime <= wStart) isUrgent = true
    }
  }

  return {
    approvedLocalDate,
    expectedContactDate: candidate,
    weekdayLabel,
    workingHoursLabel,
    isUrgent,
    isCustomHoursConfigured: hasExplicitHours,
  }
}

export function maskPhone(phone?: string | null): string {
  if (!phone || !phone.trim()) return 'Chưa cập nhật'
  const clean = phone.trim().replace(/\s+/g, '')
  if (clean.length < 7) return clean
  return `${clean.slice(0, 3)}***${clean.slice(-4)}`
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

export function formatVnd(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'Chưa cập nhật'
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount >= 0
    ? new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(amount)
    : 'Chưa cập nhật'
}

export const PROMO_REMOVED_MESSAGE = 'Đã bỏ mã khuyến mãi.'

export type PromoEvaluationStatus =
  | 'APPLIED'
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'INVALID_SCOPE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'MIN_DAYS_NOT_MET'

export type PromoRecordLike = {
  id?: string
  code: string
  name: string
  description?: string | null
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  maxDiscount?: number | null
  minDays?: number | null
  appliesTo?: 'ALL' | 'RENT' | 'SALE' | null
  validFrom?: string | null
  validTo?: string | null
  usageLimit?: number | null
  usedCount?: number | null
  active?: boolean | null
}

export type PromoEvaluationContext = {
  code?: string
  serviceType?: 'RENT' | 'SALE'
  totalDays: number
  subtotalBeforePromo: number
  today?: string
  alreadyHeldByCurrentBooking?: boolean
}

export type PromoEvaluationResult = {
  valid: boolean
  status: PromoEvaluationStatus
  promoCode: string | null
  promoName: string | null
  discountAmount: number
  finalTotal: number
  message: string
}

export function evaluatePromotion(
  promo: PromoRecordLike | null | undefined,
  context: PromoEvaluationContext,
): PromoEvaluationResult {
  const subtotal = Math.max(0, Math.round(context.subtotalBeforePromo || 0))
  const today = context.today ?? businessToday()
  const serviceType = context.serviceType ?? 'RENT'

  if (!promo) {
    return {
      valid: false,
      status: 'NOT_FOUND',
      promoCode: null,
      promoName: null,
      discountAmount: 0,
      finalTotal: subtotal,
      message: 'Mã khuyến mãi không tồn tại.',
    }
  }

  if (!promo.active) {
    return {
      valid: false,
      status: 'INACTIVE',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: 'Chương trình khuyến mãi hiện đang tạm ngưng áp dụng.',
    }
  }

  const scope = promo.appliesTo ?? 'RENT'
  if (scope !== 'ALL' && scope !== serviceType) {
    return {
      valid: false,
      status: 'INVALID_SCOPE',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: 'Mã khuyến mãi không áp dụng cho dịch vụ này.',
    }
  }

  if (promo.validFrom && today < promo.validFrom) {
    return {
      valid: false,
      status: 'NOT_STARTED',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: `Chương trình chưa bắt đầu (áp dụng từ ngày ${formatDate(promo.validFrom)}).`,
    }
  }

  if (promo.validTo && today > promo.validTo) {
    return {
      valid: false,
      status: 'EXPIRED',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: `Chương trình đã kết thúc (hết hạn ngày ${formatDate(promo.validTo)}).`,
    }
  }

  if (
    !context.alreadyHeldByCurrentBooking &&
    promo.usageLimit != null &&
    (promo.usedCount ?? 0) >= promo.usageLimit
  ) {
    return {
      valid: false,
      status: 'USAGE_LIMIT_REACHED',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: 'Mã đã hết lượt sử dụng.',
    }
  }

  const minDays = Math.max(1, Math.round(promo.minDays ?? 1))
  if (context.totalDays < minDays) {
    return {
      valid: false,
      status: 'MIN_DAYS_NOT_MET',
      promoCode: promo.code,
      promoName: promo.name,
      discountAmount: 0,
      finalTotal: subtotal,
      message: `Mã yêu cầu thuê tối thiểu ${minDays} ngày (hiện chọn ${context.totalDays} ngày).`,
    }
  }

  const rawDiscount =
    promo.discountType === 'PERCENT'
      ? Math.round((subtotal * Math.round(promo.discountValue)) / 100)
      : Math.round(promo.discountValue)
  const cappedByMax =
    promo.maxDiscount != null && promo.maxDiscount >= 0
      ? Math.min(rawDiscount, Math.round(promo.maxDiscount))
      : rawDiscount
  const discountAmount = Math.max(0, Math.min(cappedByMax, subtotal))
  const finalTotal = Math.max(0, subtotal - discountAmount)

  return {
    valid: true,
    status: 'APPLIED',
    promoCode: promo.code,
    promoName: promo.name,
    discountAmount,
    finalTotal,
    message: `Mã đã được áp dụng thành công (-${formatVnd(discountAmount)}).`,
  }
}

export function applyPromotionToQuote(
  quote: RentalQuoteBreakdown,
  promoEval?: PromoEvaluationResult | null,
): RentalQuoteBreakdown & { promoDiscountAmount: number } {
  const promoDiscountAmount = promoEval?.valid ? promoEval.discountAmount : 0
  const estimatedTotal = Math.max(0, quote.estimatedTotal - promoDiscountAmount)
  // Security deposit (initialPaymentDue / depositAmount) is strictly separate from rental fee
  // and must NEVER be subtracted from remainingAmount.
  return {
    ...quote,
    promoDiscountAmount,
    estimatedTotal,
    remainingAmount: estimatedTotal,
  }
}

export type PromoRuntimeStatusInfo = {
  status: 'ACTIVE_LIVE' | 'UPCOMING' | 'EXPIRED' | 'EXHAUSTED' | 'DISABLED'
  label: 'Đang diễn ra' | 'Chưa bắt đầu' | 'Hết hạn' | 'Hết lượt' | 'Vô hiệu hóa'
  tone: 'brand' | 'warning' | 'danger' | 'muted'
  remainingUses: number | null
}

export function getPromotionRuntimeStatus(
  promo: Pick<PromoRecordLike, 'active' | 'validFrom' | 'validTo' | 'usageLimit' | 'usedCount'>,
  today = businessToday(),
): PromoRuntimeStatusInfo {
  const used = Math.max(0, Math.round(promo.usedCount ?? 0))
  const remainingUses =
    promo.usageLimit != null ? Math.max(0, Math.round(promo.usageLimit) - used) : null

  if (!promo.active) {
    return { status: 'DISABLED', label: 'Vô hiệu hóa', tone: 'muted', remainingUses }
  }
  if (promo.validTo && today > promo.validTo) {
    return { status: 'EXPIRED', label: 'Hết hạn', tone: 'danger', remainingUses }
  }
  if (remainingUses !== null && remainingUses <= 0) {
    return { status: 'EXHAUSTED', label: 'Hết lượt', tone: 'warning', remainingUses: 0 }
  }
  if (promo.validFrom && today < promo.validFrom) {
    return { status: 'UPCOMING', label: 'Chưa bắt đầu', tone: 'warning', remainingUses }
  }
  return { status: 'ACTIVE_LIVE', label: 'Đang diễn ra', tone: 'brand', remainingUses }
}

export type PromotionValidationInput = {
  code: string
  name: string
  description?: string | null
  discountType?: string | null
  discountValue: unknown
  maxDiscount?: unknown
  minDays?: unknown
  appliesTo?: string | null
  validFrom?: string | null
  validTo?: string | null
  usageLimit?: unknown
  active?: boolean
}

export function validatePromotionInput(
  input: PromotionValidationInput,
  existingUsedCount = 0,
): {
  error?: string
  normalized?: {
    code: string
    name: string
    description: string | null
    discountType: 'PERCENT' | 'FIXED'
    discountValue: number
    maxDiscount: number | null
    minDays: number
    appliesTo: 'ALL' | 'RENT' | 'SALE'
    validFrom: string | null
    validTo: string | null
    usageLimit: number | null
    active: boolean
  }
} {
  const code = String(input.code ?? '')
    .trim()
    .toUpperCase()
  if (!code) return { error: 'Vui lòng nhập mã khuyến mãi.' }
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
    return {
      error:
        'Mã khuyến mãi dài 2–40 ký tự, chỉ gồm chữ cái không dấu, chữ số, dấu gạch ngang (-) hoặc gạch dưới (_).',
    }
  }

  const name = String(input.name ?? '')
    .trim()
    .slice(0, 160)
  if (!name) return { error: 'Vui lòng nhập tên chương trình khuyến mãi.' }

  const discountType =
    input.discountType === 'FIXED'
      ? 'FIXED'
      : input.discountType === 'PERCENT' || !input.discountType
        ? 'PERCENT'
        : null
  if (!discountType) return { error: 'Hình thức giảm giá không hợp lệ.' }

  const discountValue = Number(input.discountValue)
  if (!Number.isSafeInteger(discountValue) || discountValue < 1) {
    return { error: 'Giá trị giảm phải là số nguyên dương (lớn hơn hoặc bằng 1).' }
  }
  if (discountType === 'PERCENT' && discountValue > 100) {
    return { error: 'Phần trăm giảm giá không được vượt quá 100%.' }
  }
  if (discountType === 'FIXED' && discountValue > 500_000_000) {
    return { error: 'Số tiền giảm cố định vượt quá ngưỡng cho phép.' }
  }

  let maxDiscount: number | null = null
  if (input.maxDiscount !== undefined && input.maxDiscount !== null && input.maxDiscount !== '') {
    const parsedMax = Number(input.maxDiscount)
    if (!Number.isSafeInteger(parsedMax) || parsedMax < 1 || parsedMax > 500_000_000) {
      return {
        error:
          'Số tiền giảm tối đa phải là số nguyên dương (VNĐ) hoặc để trống nếu không giới hạn.',
      }
    }
    maxDiscount = parsedMax
  }

  let minDays = 1
  if (input.minDays !== undefined && input.minDays !== null && input.minDays !== '') {
    const parsedMinDays = Number(input.minDays)
    if (!Number.isSafeInteger(parsedMinDays) || parsedMinDays < 1 || parsedMinDays > 365) {
      return { error: 'Số ngày thuê tối thiểu phải là số nguyên từ 1 đến 365 ngày.' }
    }
    minDays = parsedMinDays
  }

  const rawScope = String(input.appliesTo ?? 'RENT')
    .trim()
    .toUpperCase()
  if (!['ALL', 'RENT', 'SALE'].includes(rawScope)) {
    return { error: 'Phạm vi áp dụng khuyến mãi không hợp lệ.' }
  }
  const appliesTo = rawScope as 'ALL' | 'RENT' | 'SALE'

  const validFrom = String(input.validFrom ?? '').trim() || null
  const validTo = String(input.validTo ?? '').trim() || null
  if (validFrom && !Number.isFinite(dateNumber(validFrom))) {
    return { error: 'Ngày bắt đầu chương trình không hợp lệ (định dạng YYYY-MM-DD).' }
  }
  if (validTo && !Number.isFinite(dateNumber(validTo))) {
    return { error: 'Ngày kết thúc chương trình không hợp lệ (định dạng YYYY-MM-DD).' }
  }
  if (validFrom && validTo && dateNumber(validTo) < dateNumber(validFrom)) {
    return { error: 'Ngày kết thúc không được trước ngày bắt đầu.' }
  }

  let usageLimit: number | null = null
  if (input.usageLimit !== undefined && input.usageLimit !== null && input.usageLimit !== '') {
    const parsedLimit = Number(input.usageLimit)
    if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1_000_000) {
      return { error: 'Giới hạn lượt sử dụng phải là số nguyên từ 1 trở lên (hoặc để trống).' }
    }
    if (existingUsedCount > 0 && parsedLimit < existingUsedCount) {
      return {
        error: `Giới hạn lượt dùng (${parsedLimit}) không được nhỏ hơn số lượt đã sử dụng (${existingUsedCount}).`,
      }
    }
    usageLimit = parsedLimit
  }

  const description =
    String(input.description ?? '')
      .trim()
      .slice(0, 500) || null

  return {
    normalized: {
      code,
      name,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minDays,
      appliesTo,
      validFrom,
      validTo,
      usageLimit,
      active: input.active !== false,
    },
  }
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

// ============================================================================
// Dynamic Vehicle Photo Categories, Spec Templates & Feature Presets (Parts D & E)
// ============================================================================

export type PhotoTypeOption = {
  value: string
  label: string
  kind: 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
  evOnly?: boolean
  instanceOnly?: boolean
}

export const CAR_PICKUP_PHOTO_TYPES: PhotoTypeOption[] = [
  { value: 'OVERVIEW', label: 'Ảnh tổng thể', kind: 'OVERVIEW' },
  { value: 'FRONT', label: 'Góc trước', kind: 'EXTERIOR' },
  { value: 'REAR', label: 'Góc sau', kind: 'EXTERIOR' },
  { value: 'LEFT', label: 'Góc bên trái', kind: 'EXTERIOR' },
  { value: 'RIGHT', label: 'Góc bên phải', kind: 'EXTERIOR' },
  { value: 'FRONT_QUARTER', label: 'Góc chéo trước', kind: 'EXTERIOR' },
  { value: 'REAR_QUARTER', label: 'Góc chéo sau', kind: 'EXTERIOR' },
  { value: 'EXTERIOR', label: 'Ngoại thất', kind: 'EXTERIOR' },
  { value: 'INTERIOR', label: 'Nội thất', kind: 'INTERIOR' },
  { value: 'COCKPIT', label: 'Khoang lái', kind: 'INTERIOR' },
  { value: 'STEERING', label: 'Vô lăng', kind: 'INTERIOR' },
  { value: 'DASHBOARD', label: 'Bảng điều khiển', kind: 'INTERIOR' },
  { value: 'SEATS', label: 'Ghế ngồi', kind: 'INTERIOR' },
  { value: 'TRUNK', label: 'Khoang hành lý / Thùng xe', kind: 'INTERIOR' },
  { value: 'ENGINE', label: 'Động cơ', kind: 'ENGINE' },
  { value: 'WHEELS', label: 'Mâm xe', kind: 'FEATURE' },
  { value: 'LIGHTING', label: 'Hệ thống chiếu sáng', kind: 'FEATURE' },
  { value: 'AMENITY', label: 'Hình ảnh tiện nghi', kind: 'FEATURE' },
  { value: 'BATTERY_CHARGER', label: 'Pin & cổng sạc (EV)', kind: 'ENGINE', evOnly: true },
  { value: 'ACTUAL', label: 'Hình ảnh thực tế', kind: 'EXTERIOR', instanceOnly: true },
  { value: 'ODO', label: 'Hình ảnh ODO', kind: 'FEATURE', instanceOnly: true },
  {
    value: 'CONDITION',
    label: 'Hình ảnh tình trạng phương tiện',
    kind: 'FEATURE',
    instanceOnly: true,
  },
]

export const MOTORBIKE_PHOTO_TYPES: PhotoTypeOption[] = [
  { value: 'OVERVIEW', label: 'Ảnh tổng thể', kind: 'OVERVIEW' },
  { value: 'FRONT', label: 'Góc trước', kind: 'EXTERIOR' },
  { value: 'REAR', label: 'Góc sau', kind: 'EXTERIOR' },
  { value: 'LEFT', label: 'Góc bên trái', kind: 'EXTERIOR' },
  { value: 'RIGHT', label: 'Góc bên phải', kind: 'EXTERIOR' },
  { value: 'HEAD', label: 'Đầu xe', kind: 'EXTERIOR' },
  { value: 'LIGHTING', label: 'Đèn xe', kind: 'FEATURE' },
  { value: 'BODY', label: 'Thân xe', kind: 'EXTERIOR' },
  { value: 'METER', label: 'Đồng hồ hiển thị', kind: 'FEATURE' },
  { value: 'SEAT', label: 'Yên xe', kind: 'FEATURE' },
  { value: 'TRUNK', label: 'Cốp xe', kind: 'FEATURE' },
  { value: 'ENGINE', label: 'Động cơ', kind: 'ENGINE' },
  { value: 'WHEELS', label: 'Bánh xe', kind: 'FEATURE' },
  { value: 'BRAKES', label: 'Hệ thống phanh', kind: 'FEATURE' },
  { value: 'BATTERY_CHARGER', label: 'Pin & bộ sạc (Xe điện)', kind: 'ENGINE', evOnly: true },
  { value: 'ODO', label: 'Hình ảnh ODO', kind: 'FEATURE', instanceOnly: true },
  { value: 'ACTUAL', label: 'Hình ảnh thực tế', kind: 'EXTERIOR', instanceOnly: true },
]

export function getPhotoTypeOptions(
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP',
  isElectric = false,
  includeInstanceTypes = false,
): PhotoTypeOption[] {
  const base = category === 'MOTORBIKE' ? MOTORBIKE_PHOTO_TYPES : CAR_PICKUP_PHOTO_TYPES
  return base.filter((opt) => {
    if (opt.evOnly && !isElectric) return false
    if (opt.instanceOnly && !includeInstanceTypes) return false
    return true
  })
}

export type DynamicSpecTemplate = {
  group: 'OVERVIEW' | 'ENGINE' | 'DIMENSIONS' | 'CHASSIS' | 'PICKUP' | 'MOTORBIKE' | 'EV'
  label: string
  placeholder: string
}

export function getDynamicSpecTemplates(
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP',
  fuelType?: string | null,
): DynamicSpecTemplate[] {
  const isPureEv = fuelType === 'Điện (EV)'
  const out: DynamicSpecTemplate[] = []

  if (category === 'MOTORBIKE') {
    out.push(
      {
        group: 'MOTORBIKE',
        label: 'Loại xe',
        placeholder: 'Tay ga / Xe số / Côn tay / Xe máy điện',
      },
      { group: 'MOTORBIKE', label: 'Số người được phép chở', placeholder: '2 người' },
      { group: 'MOTORBIKE', label: 'Dung tích cốp', placeholder: 'Ví dụ: 22 lít' },
    )
    if (!isPureEv) {
      out.push(
        { group: 'ENGINE', label: 'Loại động cơ', placeholder: 'SOHC / DOHC, 4 kỳ, xi-lanh đơn' },
        { group: 'ENGINE', label: 'Dung tích xi-lanh', placeholder: 'Ví dụ: 156,9 cc' },
        {
          group: 'ENGINE',
          label: 'Công suất tối đa',
          placeholder: 'Ví dụ: 11,8 kW / 8.500 vòng/phút',
        },
        {
          group: 'ENGINE',
          label: 'Mô-men xoắn cực đại',
          placeholder: 'Ví dụ: 14,7 Nm / 6.500 vòng/phút',
        },
        {
          group: 'ENGINE',
          label: 'Hộp số / Hệ truyền động',
          placeholder: 'Vô cấp CVT / Côn tay 6 cấp',
        },
        {
          group: 'ENGINE',
          label: 'Hệ thống làm mát',
          placeholder: 'Làm mát bằng dung dịch / không khí',
        },
        { group: 'ENGINE', label: 'Mức tiêu thụ nhiên liệu', placeholder: 'Ví dụ: 2,1 lít/100 km' },
        { group: 'ENGINE', label: 'Dung tích bình nhiên liệu', placeholder: 'Ví dụ: 8,1 lít' },
      )
    }
    out.push(
      {
        group: 'DIMENSIONS',
        label: 'Dài × Rộng × Cao',
        placeholder: 'Ví dụ: 1.935 × 740 × 1.105 mm',
      },
      { group: 'DIMENSIONS', label: 'Chiều cao yên', placeholder: 'Ví dụ: 764 mm' },
      { group: 'DIMENSIONS', label: 'Khoảng sáng gầm', placeholder: 'Ví dụ: 135 mm' },
      { group: 'DIMENSIONS', label: 'Khối lượng bản thân', placeholder: 'Ví dụ: 131 kg' },
      {
        group: 'CHASSIS',
        label: 'Kích thước lốp trước / sau',
        placeholder: 'Ví dụ: 110/70-14 / 130/70-13',
      },
      { group: 'CHASSIS', label: 'Hệ thống phanh', placeholder: 'Đĩa trước ABS / Đĩa sau' },
      {
        group: 'CHASSIS',
        label: 'Hệ thống giảm xóc',
        placeholder: 'Ống lồng trước / Lò xo trụ đôi sau',
      },
    )
  } else {
    out.push(
      { group: 'OVERVIEW', label: 'Kiểu dáng', placeholder: 'SUV / Sedan / Bán tải Cabin kép' },
      { group: 'OVERVIEW', label: 'Số chỗ ngồi', placeholder: '5 chỗ / 7 chỗ' },
      { group: 'OVERVIEW', label: 'Số cửa', placeholder: '4 cửa / 5 cửa' },
    )
    if (!isPureEv) {
      out.push(
        { group: 'ENGINE', label: 'Loại động cơ', placeholder: 'Xăng / Diesel Turbo I4' },
        { group: 'ENGINE', label: 'Dung tích động cơ', placeholder: 'Ví dụ: 2.393 cc (2.4L)' },
        {
          group: 'ENGINE',
          label: 'Công suất tối đa',
          placeholder: 'Ví dụ: 147 mã lực / 3.400 vòng/phút',
        },
        {
          group: 'ENGINE',
          label: 'Mô-men xoắn tối đa',
          placeholder: 'Ví dụ: 400 Nm / 1.600–2.000 vòng/phút',
        },
        { group: 'ENGINE', label: 'Hộp số', placeholder: 'Tự động 6 cấp / CVT / 10AT' },
        {
          group: 'ENGINE',
          label: 'Hệ dẫn động',
          placeholder: 'Cầu trước (FWD) / Cầu sau (RWD) / 2 cầu (4WD)',
        },
        {
          group: 'ENGINE',
          label: 'Mức tiêu thụ nhiên liệu hỗn hợp',
          placeholder: 'Ví dụ: 7,6 lít/100 km',
        },
        { group: 'ENGINE', label: 'Dung tích bình nhiên liệu', placeholder: 'Ví dụ: 80 lít' },
      )
    } else {
      out.push(
        {
          group: 'ENGINE',
          label: 'Hệ dẫn động',
          placeholder: 'AWD 2 cầu toàn thời gian / FWD / RWD',
        },
        {
          group: 'ENGINE',
          label: 'Hộp số / Truyền động',
          placeholder: 'Đơn cấp truyền động trực tiếp',
        },
      )
    }
    out.push(
      {
        group: 'DIMENSIONS',
        label: 'Chiều dài × Rộng × Cao',
        placeholder: 'Ví dụ: 4.795 × 1.855 × 1.835 mm',
      },
      { group: 'DIMENSIONS', label: 'Chiều dài cơ sở', placeholder: 'Ví dụ: 2.745 mm' },
      { group: 'DIMENSIONS', label: 'Khoảng sáng gầm', placeholder: 'Ví dụ: 279 mm' },
      { group: 'DIMENSIONS', label: 'Khối lượng không tải', placeholder: 'Ví dụ: 2.015 kg' },
      { group: 'DIMENSIONS', label: 'Dung tích khoang hành lý', placeholder: 'Ví dụ: 500 lít' },
      { group: 'CHASSIS', label: 'Kích thước lốp', placeholder: 'Ví dụ: 265/60R18' },
      {
        group: 'CHASSIS',
        label: 'Hệ thống treo trước / sau',
        placeholder: 'Độc lập tay đòn kép / Liên kết 4 điểm',
      },
      {
        group: 'CHASSIS',
        label: 'Hệ thống phanh trước / sau',
        placeholder: 'Đĩa thông gió / Đĩa đặc',
      },
    )
    if (category === 'PICKUP') {
      out.push(
        {
          group: 'PICKUP',
          label: 'Cấu hình dẫn động bán tải',
          placeholder: '4x2 (1 cầu) hoặc 4x4 (2 cầu gài cầu điện)',
        },
        { group: 'PICKUP', label: 'Tải trọng cho phép', placeholder: 'Ví dụ: 650 kg' },
        {
          group: 'PICKUP',
          label: 'Kích thước thùng xe (D × R × C)',
          placeholder: 'Ví dụ: 1.564 × 1.584 × 540 mm',
        },
        {
          group: 'PICKUP',
          label: 'Khả năng kéo tải',
          placeholder: 'Ví dụ: 3.500 kg (theo công bố hãng)',
        },
        {
          group: 'PICKUP',
          label: 'Trang bị hỗ trợ địa hình',
          placeholder: 'Khóa vi sai cầu sau, kiểm soát đổ đèo, chế độ Baja',
        },
      )
    }
  }

  if (isPureEv || fuelType === 'Hybrid') {
    out.push(
      { group: 'EV', label: 'Loại động cơ điện', placeholder: 'Inhub / Đồng bộ nam châm vĩnh cửu' },
      { group: 'EV', label: 'Công suất danh định', placeholder: 'Ví dụ: 1.500 W hoặc 150 kW' },
      { group: 'EV', label: 'Công suất tối đa (EV)', placeholder: 'Ví dụ: 2.450 W hoặc 300 kW' },
      { group: 'EV', label: 'Loại pin', placeholder: 'LFP (Lithium Iron Phosphate) / Lithium-ion' },
      { group: 'EV', label: 'Dung lượng pin', placeholder: 'Ví dụ: 3,5 kWh / 87,7 kWh' },
      { group: 'EV', label: 'Điện áp pin', placeholder: 'Ví dụ: 72V / 400V' },
      {
        group: 'EV',
        label: 'Quãng đường di chuyển / lần sạc',
        placeholder: 'Ví dụ: ~203 km / lần sạc',
      },
      {
        group: 'EV',
        label: 'Điều kiện / tiêu chuẩn đo quãng đường',
        placeholder: 'WLTP / Điều kiện tiêu chuẩn hãng 30 km/h',
      },
      {
        group: 'EV',
        label: 'Thời gian sạc tiêu chuẩn',
        placeholder: 'Ví dụ: Khoảng 8–10 giờ (sạc 400W)',
      },
      {
        group: 'EV',
        label: 'Công suất sạc / Sạc nhanh',
        placeholder: 'Sạc tiêu chuẩn 400W / Sạc nhanh DC 10–70% ~31 phút',
      },
      {
        group: 'EV',
        label: 'Chuẩn cổng sạc',
        placeholder: 'CCS2 / Bộ sạc rời chính hãng / Đổi pin trạm',
      },
      { group: 'EV', label: 'Tốc độ tối đa', placeholder: 'Ví dụ: 70 km/h hoặc 200 km/h' },
      {
        group: 'EV',
        label: 'Công nghệ quản lý pin & Chế độ lái',
        placeholder: 'BMS thông minh IP67 · Eco / Sport',
      },
    )
  }

  return out
}

export const ICE_ONLY_SPEC_PATTERNS = [
  /dung tích xi-lanh/i,
  /dung tích động cơ/i,
  /dung tích bình nhiên liệu/i,
  /dung tích bình xăng/i,
  /tiêu thụ nhiên liệu/i,
]

export function isSpecApplicable(label: string, fuelType?: string | null): boolean {
  if (fuelType === 'Điện (EV)') {
    return !ICE_ONLY_SPEC_PATTERNS.some((re) => re.test(label))
  }
  return true
}

export function getDynamicFeaturePresets(category: 'CAR' | 'MOTORBIKE' | 'PICKUP') {
  const comfortTech =
    category === 'MOTORBIKE'
      ? [
          { name: 'Khóa thông minh Smart Key', category: 'TECHNOLOGY' as const },
          { name: 'Đồng hồ kỹ thuật số LCD / TFT', category: 'TECHNOLOGY' as const },
          { name: 'Cổng sạc USB tiện lợi', category: 'COMFORT' as const },
          { name: 'Kết nối điện thoại thông minh (App)', category: 'TECHNOLOGY' as const },
          { name: 'Hệ thống ngắt động cơ tạm thời (Start/Stop)', category: 'TECHNOLOGY' as const },
          { name: 'Chế độ lái linh hoạt (Eco / Sport)', category: 'TECHNOLOGY' as const },
          { name: 'Hệ thống chiếu sáng Full LED', category: 'TECHNOLOGY' as const },
          { name: 'Cốp dưới yên rộng rãi', category: 'COMFORT' as const },
        ]
      : [
          { name: 'Điều hòa tự động', category: 'COMFORT' as const },
          { name: 'Màn hình giải trí cảm ứng trung tâm', category: 'TECHNOLOGY' as const },
          { name: 'Kết nối Apple CarPlay', category: 'TECHNOLOGY' as const },
          { name: 'Kết nối Android Auto', category: 'TECHNOLOGY' as const },
          { name: 'Kết nối Bluetooth đàm thoại rảnh tay', category: 'TECHNOLOGY' as const },
          { name: 'Cổng sạc USB các hàng ghế', category: 'COMFORT' as const },
          { name: 'Sạc điện thoại không dây', category: 'COMFORT' as const },
          { name: 'Ghế lái chỉnh điện', category: 'COMFORT' as const },
          { name: 'Cửa sổ trời', category: 'COMFORT' as const },
          { name: 'Chìa khóa thông minh Smart Key', category: 'COMFORT' as const },
          { name: 'Khởi động nút bấm Start/Stop', category: 'COMFORT' as const },
          { name: 'Ga tự động Cruise Control', category: 'DRIVER_ASSIST' as const },
          { name: 'Hệ thống âm thanh đa loa', category: 'COMFORT' as const },
        ]

  const safety =
    category === 'MOTORBIKE'
      ? [
          { name: 'Hệ thống chống bó cứng phanh ABS', category: 'SAFETY' as const },
          { name: 'Hệ thống phanh kết hợp CBS', category: 'SAFETY' as const },
          { name: 'Kiểm soát lực kéo (Traction Control / HSTC)', category: 'SAFETY' as const },
          { name: 'Chống nước tiêu chuẩn IP67', category: 'SAFETY' as const },
          { name: 'Cảnh báo chống trộm / Định vị xe', category: 'SAFETY' as const },
        ]
      : [
          { name: 'Chống bó cứng phanh ABS', category: 'SAFETY' as const },
          { name: 'Phân phối lực phanh điện tử EBD', category: 'SAFETY' as const },
          { name: 'Cân bằng điện tử ESP / VSC', category: 'SAFETY' as const },
          { name: 'Kiểm soát lực kéo Traction Control (TCS)', category: 'SAFETY' as const },
          { name: 'Hệ thống túi khí an toàn', category: 'SAFETY' as const },
          { name: 'Camera lùi', category: 'SAFETY' as const },
          { name: 'Camera 360 độ toàn cảnh', category: 'DRIVER_ASSIST' as const },
          { name: 'Cảm biến hỗ trợ đỗ xe', category: 'SAFETY' as const },
          { name: 'Hỗ trợ khởi hành ngang dốc (HAC)', category: 'SAFETY' as const },
          { name: 'Cảnh báo điểm mù (BSM)', category: 'DRIVER_ASSIST' as const },
          { name: 'Cảnh báo lệch làn đường (LDW)', category: 'DRIVER_ASSIST' as const },
          { name: 'Hỗ trợ giữ làn đường (LKA)', category: 'DRIVER_ASSIST' as const },
          { name: 'Phanh khẩn cấp tự động (AEB)', category: 'DRIVER_ASSIST' as const },
        ]

  return { comfortTech, safety }
}

// ============================================================================
// Online Payment Integration, Financial Standardization & State Machine Rules
// ============================================================================

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'CONFIRMED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'PARTIALLY_PAID',
  'REVIEW_REQUIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const paymentStatusLabels: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  PROCESSING: 'Đang xác minh',
  CONFIRMED: 'Đã thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Giao dịch thất bại',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
  PARTIALLY_PAID: 'Thanh toán thiếu',
  REVIEW_REQUIRED: 'Cần đối soát',
  REFUND_PENDING: 'Đang xử lý hoàn tiền',
  PARTIALLY_REFUNDED: 'Đã hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
}

export const PAYMENT_TYPES = [
  'DEPOSIT',
  'RENTAL_FEE',
  'FULL_PAYMENT',
  'SECURITY_DEPOSIT',
  'EXTRA_FEE',
  'PURCHASE_DEPOSIT',
  'REFUND',
] as const

export type PaymentType = (typeof PAYMENT_TYPES)[number]

export const paymentTypeLabels: Record<string, string> = {
  DEPOSIT: 'Tiền đặt cọc giữ xe',
  RENTAL_FEE: 'Tiền thuê xe còn lại',
  FULL_PAYMENT: 'Thanh toán toàn bộ tiền thuê',
  SECURITY_DEPOSIT: 'Tiền cọc bảo đảm tài sản',
  EXTRA_FEE: 'Phụ phí phát sinh',
  PURCHASE_DEPOSIT: 'Đặt cọc mua xe',
  REFUND: 'Hoàn tiền / Hoàn cọc',
}

export const PAYMENT_METHODS = [
  'VIETQR_SEPAY',
  'ONLINE_MOCK',
  'BANK_TRANSFER',
  'CASH',
  'CARD_POS',
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const paymentMethodLabels: Record<string, string> = {
  VIETQR_SEPAY: 'VietQR động (SePay)',
  ONLINE_MOCK: 'VietQR trực tuyến (Mô phỏng)',
  BANK_TRANSFER: 'Chuyển khoản ngân hàng thủ công',
  CASH: 'Tiền mặt tại điểm giao nhận',
  CARD_POS: 'Quẹt thẻ POS tại quầy',
}

export const PAYMENT_PROVIDERS = [
  'SEPAY',
  'MOCK',
  'MANUAL',
  'PAYOS',
  'VNPAY',
  'MOMO',
  'ZALOPAY',
] as const

export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number]

export const paymentProviderLabels: Record<string, string> = {
  SEPAY: 'SePay VietQR',
  MOCK: 'Mock Payment Provider',
  MANUAL: 'Đối soát thủ công NORI',
  PAYOS: 'PayOS (Mở rộng)',
  VNPAY: 'VNPay (Mở rộng)',
  MOMO: 'MoMo (Mở rộng)',
  ZALOPAY: 'ZaloPay (Mở rộng)',
}

export const PAYMENT_ENVIRONMENTS = ['MOCK', 'SANDBOX', 'PRODUCTION'] as const
export type PaymentEnvironment = (typeof PAYMENT_ENVIRONMENTS)[number]

export const RECONCILIATION_STATUSES = [
  'NONE',
  'MATCHED',
  'UNDERPAID',
  'OVERPAID',
  'LATE_PAYMENT',
  'UNMATCHED',
  'MANUAL_OVERRIDE',
  'RESOLVED',
] as const

export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number]

export const reconciliationStatusLabels: Record<string, string> = {
  NONE: 'Bình thường',
  MATCHED: 'Khớp tự động',
  UNDERPAID: 'Chuyển thiếu tiền',
  OVERPAID: 'Chuyển thừa tiền',
  LATE_PAYMENT: 'Thanh toán đến muộn / Đơn đã đóng',
  UNMATCHED: 'Chưa xác định đơn thuê',
  MANUAL_OVERRIDE: 'Xác nhận thủ công',
  RESOLVED: 'Đã xử lý đối soát',
}

export const REFUND_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'REFUNDED',
  'REJECTED',
  'FAILED',
] as const

export type RefundStatus = (typeof REFUND_STATUSES)[number]

export const refundStatusLabels: Record<string, string> = {
  REQUESTED: 'Chờ duyệt hoàn tiền',
  APPROVED: 'Đã duyệt — Chờ chi hoàn',
  PROCESSING: 'Đang xử lý hoàn tiền',
  REFUNDED: 'Đã hoàn tiền thành công',
  REJECTED: 'Từ chối hoàn tiền',
  FAILED: 'Hoàn tiền thất bại',
}

export const BOOKING_PAYMENT_SUMMARIES = [
  'UNPAID',
  'PENDING_VERIFICATION',
  'PARTIALLY_PAID',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'OVERPAID',
  'REVIEW_REQUIRED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const

export type BookingPaymentSummaryStatus = (typeof BOOKING_PAYMENT_SUMMARIES)[number]

export const bookingPaymentSummaryLabels: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PENDING_VERIFICATION: 'Chờ xác minh giao dịch',
  PARTIALLY_PAID: 'Thanh toán một phần',
  DEPOSIT_PAID: 'Đã thanh toán cọc',
  FULLY_PAID: 'Đã thanh toán đủ',
  PAID_IN_FULL: 'Đã thanh toán đủ',
  OVERPAID: 'Thanh toán thừa — Chờ đối soát',
  REVIEW_REQUIRED: 'Cần đối soát tài chính',
  DISCREPANCY_REVIEW: 'Cần đối soát tài chính',
  REFUND_PENDING: 'Đang xử lý hoàn tiền',
  PARTIALLY_REFUNDED: 'Đã hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
}

export const paymentSummaryLabels = bookingPaymentSummaryLabels

/**
 * Maps external provider status codes to NORI's internal canonical PaymentStatus.
 * Note: NORI uses `CONFIRMED` as the canonical confirmed/paid status in the database.
 */
export function mapProviderStatusToInternal(externalStatus: string): PaymentStatus {
  const normalized = String(externalStatus ?? '')
    .trim()
    .toUpperCase()
  switch (normalized) {
    case 'PAID':
    case 'SUCCESS':
    case 'SUCCEEDED':
    case 'COMPLETED':
    case 'CONFIRMED':
      return 'CONFIRMED'
    case 'PROCESSING':
    case 'VERIFYING':
    case 'IN_PROGRESS':
      return 'PROCESSING'
    case 'PARTIAL':
    case 'PARTIALLY_PAID':
    case 'UNDERPAID':
      return 'PARTIALLY_PAID'
    case 'OVERPAID':
    case 'REVIEW':
    case 'REVIEW_REQUIRED':
    case 'LATE':
    case 'UNMATCHED':
      return 'REVIEW_REQUIRED'
    case 'EXPIRED':
    case 'TIMEOUT':
      return 'EXPIRED'
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOIDED':
      return 'CANCELLED'
    case 'FAILED':
    case 'ERROR':
    case 'DECLINED':
      return 'FAILED'
    case 'REFUND_PENDING':
    case 'REFUNDING':
      return 'REFUND_PENDING'
    case 'PARTIALLY_REFUNDED':
      return 'PARTIALLY_REFUNDED'
    case 'REFUNDED':
      return 'REFUNDED'
    case 'PENDING':
    case 'CREATED':
    default:
      return 'PENDING'
  }
}

export function canTransitionPayment(
  from: string,
  to: string,
  actor: 'customer' | 'admin' | 'webhook' | 'system' = 'system',
): boolean {
  const current = mapProviderStatusToInternal(from)
  const target = mapProviderStatusToInternal(to)
  if (current === target) return true

  // Customer can only cancel their own PENDING payment intent before money is verified
  if (actor === 'customer') {
    return current === 'PENDING' && target === 'CANCELLED'
  }

  const allowed: Record<PaymentStatus, PaymentStatus[]> = {
    PENDING: [
      'PROCESSING',
      'CONFIRMED',
      'PARTIALLY_PAID',
      'REVIEW_REQUIRED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ],
    PROCESSING: ['CONFIRMED', 'PARTIALLY_PAID', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED'],
    PARTIALLY_PAID: [
      'CONFIRMED',
      'REVIEW_REQUIRED',
      'REFUND_PENDING',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ],
    REVIEW_REQUIRED: [
      'CONFIRMED',
      'PARTIALLY_PAID',
      'REFUND_PENDING',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
      'CANCELLED',
    ],
    CONFIRMED: ['REVIEW_REQUIRED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'],
    REFUND_PENDING: ['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
    PARTIALLY_REFUNDED: ['REFUND_PENDING', 'REFUNDED'],
    REFUNDED: [],
    FAILED: ['PENDING', 'PROCESSING', 'REVIEW_REQUIRED'],
    // If a transfer arrives late after EXPIRED or CANCELLED, it MUST move to REVIEW_REQUIRED, not directly CONFIRMED
    EXPIRED: ['REVIEW_REQUIRED'],
    CANCELLED: ['REVIEW_REQUIRED'],
  }

  return Boolean(allowed[current]?.includes(target))
}

/**
 * Checks whether an incoming webhook event is stale/out-of-order compared to the current payment state.
 * For example, a stale PENDING/FAILED/EXPIRED event must never overwrite an already CONFIRMED or REFUNDED payment.
 */
export function isPaymentEventStale(currentStatus: string, incomingStatus: string): boolean {
  const current = mapProviderStatusToInternal(currentStatus)
  const incoming = mapProviderStatusToInternal(incomingStatus)

  const settledStates: PaymentStatus[] = [
    'CONFIRMED',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ]
  const preSettlementStates: PaymentStatus[] = [
    'PENDING',
    'PROCESSING',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
  ]

  if (settledStates.includes(current) && preSettlementStates.includes(incoming)) {
    return true
  }
  if (current === 'REFUNDED' && incoming !== 'REFUNDED') {
    return true
  }
  if (
    current === 'PARTIALLY_PAID' &&
    ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(incoming)
  ) {
    return true
  }
  return false
}

export function roundVndInteger(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 0
  return Math.max(0, Math.round(Number(amount)))
}

export function calculateReservationDeposit(
  totalRentalPrice: number,
  options?: {
    policyMode?: 'PERCENT_OF_RENTAL' | 'VEHICLE_FIXED'
    depositPercent?: number | null
    fixedDepositAmount?: number | null
  },
): number {
  const cleanRental = roundVndInteger(totalRentalPrice)
  const mode = options?.policyMode ?? 'PERCENT_OF_RENTAL'
  if (mode === 'VEHICLE_FIXED' && options?.fixedDepositAmount != null) {
    return roundVndInteger(options.fixedDepositAmount)
  }
  const pct =
    options?.depositPercent != null && Number.isFinite(Number(options.depositPercent))
      ? Math.max(0, Math.min(100, Math.round(Number(options.depositPercent))))
      : 30
  return roundVndInteger((cleanRental * pct) / 100)
}

export type PaymentLedgerRecordLike = {
  id?: string
  reference?: string | null
  paymentType: string
  method?: string | null
  provider?: string | null
  amount: number
  expectedAmount?: number | null
  receivedAmount?: number | null
  refundedAmount?: number | null
  overpaidAmount?: number | null
  status: string
  reconciliationStatus?: string | null
  expiresAt?: string | null
  paidAt?: string | null
  createdAt?: string | null
}

export type RefundRecordLike = {
  id?: string
  paymentId?: string | null
  bookingId?: string | null
  amount: number
  refundType?: string | null
  status: string
}

export type BookingFinancialInput = {
  bookingStatus: string
  totalRentalPrice: number
  baseRentPrice?: number | null
  discountAmount?: number | null
  promoDiscountAmount?: number | null
  weekendSurchargeTotal?: number | null
  deliveryFee?: number | null
  addonFeeTotal?: number | null
  extraFee?: number | null
  /** Reservation deposit required to lock the vehicle (if part of rental fee, deducted from remaining rental) */
  reservationDepositRequired?: number | null
  /** Percentage used if reservationDepositRequired is not explicitly provided */
  reservationDepositPercent?: number | null
  /** Whether reservation deposit is part of the total rental price (default true when percentage-based, or configurable) */
  deductReservationDepositFromRental?: boolean
  /** Separate asset security deposit (e.g. 5,000,000 VND) — NEVER counted as rental revenue */
  securityDepositAmount?: number | null
  payments?: PaymentLedgerRecordLike[]
  refunds?: RefundRecordLike[]
  now?: Date
}

export type BookingFinancialSummary = {
  baseRentPrice: number
  discountAmount: number
  promoDiscountAmount: number
  weekendSurchargeTotal: number
  deliveryFee: number
  addonFeeTotal: number
  totalRentalPrice: number
  extraFee: number
  totalRentalWithExtra: number
  reservationDepositRequired: number
  deductReservationDepositFromRental: boolean
  securityDepositAmount: number
  paidDepositAmount: number
  paidRentalAmount: number
  paidExtraFeeAmount: number
  paidSecurityDepositAmount: number
  totalVerifiedReceived: number
  rentalRevenueCollected: number
  securityDepositHeld: number
  overpaidAmount: number
  totalRefundedAmount: number
  pendingRefundAmount: number
  netCollectedAmount: number
  netRentalRevenue: number
  remainingDepositDue: number
  remainingRentalBeforeExtra: number
  remainingExtraFeeDue: number
  totalRemainingRentalObligation: number
  remainingSecurityDepositDue: number
  refundableBalance: number
  paymentStatusSummary: BookingPaymentSummaryStatus
  hasPendingPayment: boolean
  hasAnomaly: boolean
  activePendingPaymentId: string | null
}

/**
 * Authoritative financial calculation engine for a booking across Customer UI, Admin Dashboard,
 * Reports, and Database verification.
 */
export function calculateBookingFinancialSummary(
  input: BookingFinancialInput,
): BookingFinancialSummary {
  const totalRentalPrice = roundVndInteger(input.totalRentalPrice)
  const baseRentPrice = roundVndInteger(input.baseRentPrice ?? totalRentalPrice)
  const discountAmount = roundVndInteger(input.discountAmount)
  const promoDiscountAmount = roundVndInteger(input.promoDiscountAmount)
  const weekendSurchargeTotal = roundVndInteger(input.weekendSurchargeTotal)
  const deliveryFee = roundVndInteger(input.deliveryFee)
  const addonFeeTotal = roundVndInteger(input.addonFeeTotal)
  const extraFee = roundVndInteger(input.extraFee)
  const totalRentalWithExtra = totalRentalPrice + extraFee

  const deductDeposit = input.deductReservationDepositFromRental !== false
  const reservationDepositRequired =
    input.reservationDepositRequired != null
      ? roundVndInteger(input.reservationDepositRequired)
      : input.reservationDepositPercent != null
        ? calculateReservationDeposit(totalRentalPrice, {
            policyMode: 'PERCENT_OF_RENTAL',
            depositPercent: input.reservationDepositPercent,
          })
        : 0

  const securityDepositAmount = roundVndInteger(input.securityDepositAmount)

  let paidDepositAmount = 0
  let paidRentalAmount = 0
  let paidExtraFeeAmount = 0
  let paidSecurityDepositAmount = 0
  let overpaidAmount = 0
  let directRefundRecordsTotal = 0
  let refundedOnPaymentFields = 0
  let refundedSecurityDeposit = 0
  let hasPendingPayment = false
  let hasReviewRequired = false
  let hasPartiallyPaidRecord = false
  let hasRefundPendingRecord = false
  let activePendingPaymentId: string | null = null
  const nowMs = (input.now ?? new Date()).getTime()

  const verifiedInboundStatuses = new Set([
    'CONFIRMED',
    'PARTIALLY_PAID',
    'REVIEW_REQUIRED',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ])

  for (const p of input.payments ?? []) {
    const normStatus = mapProviderStatusToInternal(p.status)
    const pType = String(p.paymentType ?? 'DEPOSIT').toUpperCase()

    if (normStatus === 'PENDING' || normStatus === 'PROCESSING') {
      const expMs = p.expiresAt ? Date.parse(p.expiresAt) : NaN
      if (!Number.isFinite(expMs) || expMs > nowMs) {
        hasPendingPayment = true
        if (!activePendingPaymentId && p.id) activePendingPaymentId = p.id
      }
    }
    if (normStatus === 'REVIEW_REQUIRED') hasReviewRequired = true
    if (normStatus === 'PARTIALLY_PAID') hasPartiallyPaidRecord = true
    if (normStatus === 'REFUND_PENDING') hasRefundPendingRecord = true

    if (
      p.reconciliationStatus &&
      ['UNDERPAID', 'OVERPAID', 'LATE_PAYMENT', 'UNMATCHED'].includes(p.reconciliationStatus)
    ) {
      hasReviewRequired = true
    }

    if (pType === 'REFUND') {
      if (normStatus === 'CONFIRMED' || normStatus === 'REFUNDED') {
        directRefundRecordsTotal += roundVndInteger(p.receivedAmount ?? p.amount)
      } else if (
        normStatus === 'PENDING' ||
        normStatus === 'PROCESSING' ||
        normStatus === 'REFUND_PENDING'
      ) {
        hasRefundPendingRecord = true
      }
      continue
    }

    if (!verifiedInboundStatuses.has(normStatus)) {
      continue
    }

    // For verified inbound payments, use receivedAmount if explicitly recorded, otherwise amount (for CONFIRMED/REFUNDED)
    const rawReceived =
      p.receivedAmount != null
        ? roundVndInteger(p.receivedAmount)
        : ['CONFIRMED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(normStatus)
          ? roundVndInteger(p.amount)
          : 0

    if (rawReceived <= 0) continue

    if (p.refundedAmount != null && Number(p.refundedAmount) > 0) {
      const refAmt = roundVndInteger(p.refundedAmount)
      refundedOnPaymentFields += refAmt
      if (pType === 'SECURITY_DEPOSIT') {
        refundedSecurityDeposit += refAmt
      }
    }
    if (p.overpaidAmount != null && Number(p.overpaidAmount) > 0) {
      overpaidAmount += roundVndInteger(p.overpaidAmount)
    }

    if (pType === 'SECURITY_DEPOSIT') {
      paidSecurityDepositAmount += rawReceived
    } else if (pType === 'EXTRA_FEE') {
      paidExtraFeeAmount += rawReceived
    } else if (pType === 'DEPOSIT') {
      paidDepositAmount += rawReceived
    } else if (pType === 'RENTAL_FEE' || pType === 'FULL_PAYMENT') {
      paidRentalAmount += rawReceived
    }
  }

  let refundCollectionCompleted = 0
  let pendingRefundAmount = 0
  let refundCollectionSecDep = 0
  for (const r of input.refunds ?? []) {
    const rStatus = String(r.status ?? '').toUpperCase()
    const rAmt = roundVndInteger(r.amount)
    if (rStatus === 'REFUNDED') {
      refundCollectionCompleted += rAmt
      if (r.refundType === 'SECURITY_DEPOSIT_RETURN') {
        refundCollectionSecDep += rAmt
      }
    } else if (['REQUESTED', 'APPROVED', 'PROCESSING'].includes(rStatus)) {
      pendingRefundAmount += rAmt
      hasRefundPendingRecord = true
    }
  }

  const totalRefundedAmount = Math.max(
    refundCollectionCompleted + directRefundRecordsTotal,
    refundedOnPaymentFields + directRefundRecordsTotal,
  )
  const totalSecDepRefunded = Math.max(refundCollectionSecDep, refundedSecurityDeposit)

  // Rental revenue collected strictly excludes SECURITY_DEPOSIT
  const rentalRevenueCollected = paidDepositAmount + paidRentalAmount + paidExtraFeeAmount
  const totalVerifiedReceived = rentalRevenueCollected + paidSecurityDepositAmount

  // Calculate remaining obligations
  // When deductDeposit is true (e.g. 30% reservation deposit is part of the 100% rental fee),
  // any paid deposit or full payment satisfies the deposit requirement AND reduces remaining rental.
  const effectiveDepositCovered = Math.min(
    reservationDepositRequired,
    paidDepositAmount + paidRentalAmount,
  )
  const remainingDepositDue = ['CANCELLED', 'REJECTED'].includes(input.bookingStatus)
    ? 0
    : Math.max(0, reservationDepositRequired - effectiveDepositCovered)

  const rentalAppliedPaid = deductDeposit ? paidDepositAmount + paidRentalAmount : paidRentalAmount
  const remainingRentalBeforeExtra = ['CANCELLED', 'REJECTED'].includes(input.bookingStatus)
    ? 0
    : Math.max(0, totalRentalPrice - rentalAppliedPaid)

  const excessRentalPaidForExtra = Math.max(0, rentalAppliedPaid - totalRentalPrice)
  const remainingExtraFeeDue = ['CANCELLED', 'REJECTED'].includes(input.bookingStatus)
    ? 0
    : Math.max(0, extraFee - (paidExtraFeeAmount + excessRentalPaidForExtra))

  const totalRemainingRentalObligation = remainingRentalBeforeExtra + remainingExtraFeeDue

  // Detect overall overpayment against total obligation
  const maxExpectedInbound =
    (deductDeposit ? totalRentalWithExtra : totalRentalWithExtra + reservationDepositRequired) +
    securityDepositAmount
  if (totalVerifiedReceived > maxExpectedInbound && maxExpectedInbound > 0) {
    overpaidAmount = Math.max(overpaidAmount, totalVerifiedReceived - maxExpectedInbound)
  }

  const remainingSecurityDepositDue = ['CANCELLED', 'REJECTED', 'COMPLETED'].includes(
    input.bookingStatus,
  )
    ? 0
    : Math.max(0, securityDepositAmount - paidSecurityDepositAmount)

  const securityDepositHeld = Math.max(0, paidSecurityDepositAmount - totalSecDepRefunded)
  const nonSecurityRefunded = Math.max(0, totalRefundedAmount - totalSecDepRefunded)
  const netRentalRevenue = Math.max(0, rentalRevenueCollected - nonSecurityRefunded)
  const netCollectedAmount = Math.max(0, totalVerifiedReceived - totalRefundedAmount)
  const refundableBalance = Math.max(
    0,
    totalVerifiedReceived - totalRefundedAmount - pendingRefundAmount,
  )

  let paymentStatusSummary: BookingPaymentSummaryStatus = 'UNPAID'
  if (hasRefundPendingRecord && pendingRefundAmount > 0) {
    paymentStatusSummary = 'REFUND_PENDING'
  } else if (totalRefundedAmount > 0 && totalVerifiedReceived > 0) {
    paymentStatusSummary =
      totalRefundedAmount >= totalVerifiedReceived ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
  } else if (overpaidAmount > 0) {
    paymentStatusSummary = 'OVERPAID'
  } else if (hasReviewRequired) {
    paymentStatusSummary = 'REVIEW_REQUIRED'
  } else if (
    totalVerifiedReceived > 0 &&
    totalRemainingRentalObligation === 0 &&
    totalRentalWithExtra > 0
  ) {
    paymentStatusSummary = 'FULLY_PAID'
  } else if (
    reservationDepositRequired > 0 &&
    remainingDepositDue === 0 &&
    totalRemainingRentalObligation > 0 &&
    !hasPartiallyPaidRecord
  ) {
    paymentStatusSummary = 'DEPOSIT_PAID'
  } else if (totalVerifiedReceived > 0 || hasPartiallyPaidRecord) {
    paymentStatusSummary = 'PARTIALLY_PAID'
  } else if (hasPendingPayment) {
    paymentStatusSummary = 'PENDING_VERIFICATION'
  }

  return {
    baseRentPrice,
    discountAmount,
    promoDiscountAmount,
    weekendSurchargeTotal,
    deliveryFee,
    addonFeeTotal,
    totalRentalPrice,
    extraFee,
    totalRentalWithExtra,
    reservationDepositRequired,
    deductReservationDepositFromRental: deductDeposit,
    securityDepositAmount,
    paidDepositAmount,
    paidRentalAmount,
    paidExtraFeeAmount,
    paidSecurityDepositAmount,
    totalVerifiedReceived,
    rentalRevenueCollected,
    securityDepositHeld,
    overpaidAmount,
    totalRefundedAmount,
    pendingRefundAmount,
    netCollectedAmount,
    netRentalRevenue,
    remainingDepositDue,
    remainingRentalBeforeExtra,
    remainingExtraFeeDue,
    totalRemainingRentalObligation,
    remainingSecurityDepositDue,
    refundableBalance,
    paymentStatusSummary,
    hasPendingPayment,
    hasAnomaly: overpaidAmount > 0 || hasReviewRequired || hasPartiallyPaidRecord,
    activePendingPaymentId,
  }
}

export type IncomingTransferEvaluationInput = {
  expectedAmount: number
  previouslyReceivedAmount?: number
  incomingAmount: number
  paymentStatus: string
  bookingStatus?: string | null
  expiresAt?: string | null
  now?: Date
}

export type IncomingTransferEvaluationResult = {
  nextPaymentStatus: PaymentStatus
  reconciliationStatus: ReconciliationStatus
  newReceivedAmount: number
  shortfallAmount: number
  overpaidAmount: number
  isLateOrClosed: boolean
  shouldConfirmBookingObligation: boolean
  summaryMessage: string
}

/**
 * Evaluates a verified incoming transfer from a webhook or reconciliation event.
 * Handles exact amount, partial/underpaid, multi-transfer accumulation, overpaid,
 * expired payment, and cancelled/rejected booking edge cases.
 */
export function evaluateIncomingTransfer(
  input: IncomingTransferEvaluationInput,
): IncomingTransferEvaluationResult {
  const expected = roundVndInteger(input.expectedAmount)
  const prevReceived = roundVndInteger(input.previouslyReceivedAmount)
  const incoming = roundVndInteger(input.incomingAmount)
  const cumulativeReceived = prevReceived + incoming
  const currentPaymentStatus = mapProviderStatusToInternal(input.paymentStatus)
  const bookingStatus = String(input.bookingStatus ?? 'CONFIRMED').toUpperCase()
  const nowMs = (input.now ?? new Date()).getTime()
  const expMs = input.expiresAt ? Date.parse(input.expiresAt) : NaN
  const isExpiredTime = Number.isFinite(expMs) && nowMs > expMs

  const isBookingClosed = ['CANCELLED', 'REJECTED'].includes(bookingStatus)
  const isPaymentClosed = ['CANCELLED', 'EXPIRED'].includes(currentPaymentStatus)
  const isLateOrClosed =
    isBookingClosed || isPaymentClosed || (isExpiredTime && currentPaymentStatus === 'PENDING')

  const shortfallAmount = Math.max(0, expected - cumulativeReceived)
  const overpaidAmount = Math.max(0, cumulativeReceived - expected)

  if (isLateOrClosed) {
    return {
      nextPaymentStatus: 'REVIEW_REQUIRED',
      reconciliationStatus: 'LATE_PAYMENT',
      newReceivedAmount: cumulativeReceived,
      shortfallAmount,
      overpaidAmount,
      isLateOrClosed: true,
      shouldConfirmBookingObligation: false,
      summaryMessage: isBookingClosed
        ? `Nhận khoản chuyển ${formatVnd(incoming)} cho đơn thuê đã ở trạng thái ${bookingStatus}. Giao dịch được ghi nhận vào danh sách Cần đối soát để hoàn tiền hoặc xử lý ngoại lệ.`
        : `Nhận khoản chuyển ${formatVnd(incoming)} sau khi yêu cầu thanh toán đã hết hạn/hủy. Giao dịch được chuyển sang Cần đối soát, không tự động ghi đè lịch xe.`,
    }
  }

  if (cumulativeReceived < expected) {
    return {
      nextPaymentStatus: 'PARTIALLY_PAID',
      reconciliationStatus: 'UNDERPAID',
      newReceivedAmount: cumulativeReceived,
      shortfallAmount,
      overpaidAmount: 0,
      isLateOrClosed: false,
      shouldConfirmBookingObligation: false,
      summaryMessage: `Đã nhận ${formatVnd(cumulativeReceived)} / ${formatVnd(expected)} (còn thiếu ${formatVnd(shortfallAmount)}). Nghĩa vụ thanh toán chưa hoàn tất.`,
    }
  }

  if (cumulativeReceived > expected) {
    return {
      nextPaymentStatus: 'CONFIRMED',
      reconciliationStatus: 'OVERPAID',
      newReceivedAmount: cumulativeReceived,
      shortfallAmount: 0,
      overpaidAmount,
      isLateOrClosed: false,
      shouldConfirmBookingObligation: true,
      summaryMessage: `Đã nhận ${formatVnd(cumulativeReceived)} (vượt ${formatVnd(overpaidAmount)} so với yêu cầu ${formatVnd(expected)}). Đã xác nhận nghĩa vụ thanh toán và gắn cờ đối soát khoản tiền thừa.`,
    }
  }

  return {
    nextPaymentStatus: 'CONFIRMED',
    reconciliationStatus: 'MATCHED',
    newReceivedAmount: cumulativeReceived,
    shortfallAmount: 0,
    overpaidAmount: 0,
    isLateOrClosed: false,
    shouldConfirmBookingObligation: true,
    summaryMessage: `Đã xác minh nhận đủ ${formatVnd(cumulativeReceived)}.`,
  }
}

export type OnlinePaymentEligibilityInput = {
  isLoggedIn: boolean
  isCustomer: boolean
  isOwner: boolean
  bookingStatus: string
  paymentType: PaymentType
  requestedAmount: number
  onlinePaymentEnabled?: boolean
  environment?: PaymentEnvironment
  productionApproved?: boolean
  providerConfigured?: boolean
}

export type OnlinePaymentEligibilityResult = {
  allowed: boolean
  httpStatus: number
  code:
    | 'OK'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'BOOKING_NOT_APPROVED'
    | 'BOOKING_CLOSED'
    | 'NO_BALANCE_DUE'
    | 'PAYMENT_DISABLED'
    | 'PRODUCTION_NOT_ACTIVATED'
    | 'PROVIDER_NOT_CONFIGURED'
  message: string
}

export function canInitiateOnlinePayment(
  input: OnlinePaymentEligibilityInput,
): OnlinePaymentEligibilityResult {
  if (!input.isLoggedIn) {
    return {
      allowed: false,
      httpStatus: 401,
      code: 'UNAUTHORIZED',
      message: 'Vui lòng đăng nhập tài khoản khách hàng để thực hiện thanh toán.',
    }
  }
  if (!input.isCustomer || !input.isOwner) {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'FORBIDDEN',
      message: 'Bạn không có quyền tạo giao dịch thanh toán cho đơn thuê này.',
    }
  }
  if (input.bookingStatus === 'PENDING') {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'BOOKING_NOT_APPROVED',
      message:
        'Đơn thuê đang chờ Admin xét duyệt. Quý khách chỉ thanh toán sau khi đơn được NORI duyệt hoặc yêu cầu đặt cọc.',
    }
  }
  if (['CANCELLED', 'REJECTED'].includes(input.bookingStatus)) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'BOOKING_CLOSED',
      message: 'Đơn thuê đã hủy hoặc bị từ chối, không thể tạo yêu cầu thanh toán.',
    }
  }
  if (input.environment === 'PRODUCTION' && !input.productionApproved) {
    return {
      allowed: false,
      httpStatus: 503,
      code: 'PRODUCTION_NOT_ACTIVATED',
      message:
        'Chế độ thanh toán tiền thật (PRODUCTION) đang khóa theo chính sách an toàn. Vui lòng sử dụng phương thức chuyển khoản thủ công hoặc liên hệ nhân viên NORI.',
    }
  }
  if (input.onlinePaymentEnabled === false) {
    return {
      allowed: false,
      httpStatus: 503,
      code: 'PAYMENT_DISABLED',
      message:
        'Cổng thanh toán trực tuyến hiện đang tạm ngưng. Quý khách vui lòng chọn chuyển khoản thủ công hoặc thanh toán khi nhận xe.',
    }
  }
  if (input.providerConfigured === false) {
    return {
      allowed: false,
      httpStatus: 503,
      code: 'PROVIDER_NOT_CONFIGURED',
      message:
        'Nhà cung cấp thanh toán chưa được cấu hình đầy đủ thông tin kết nối (Sandbox/Production). Vui lòng sử dụng phương thức thanh toán dự phòng.',
    }
  }
  if (!Number.isSafeInteger(input.requestedAmount) || input.requestedAmount <= 0) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'NO_BALANCE_DUE',
      message: 'Đơn thuê không còn khoản công nợ cần thanh toán cho hạng mục này.',
    }
  }
  return {
    allowed: true,
    httpStatus: 200,
    code: 'OK',
    message: 'Đủ điều kiện tạo yêu cầu thanh toán.',
  }
}

export type RefundValidationInput = {
  isAdmin: boolean
  hasPaymentUpdatePermission: boolean
  totalVerifiedReceived: number
  alreadyRefundedAmount: number
  pendingRefundAmount?: number
  requestedRefundAmount: number
  reason?: string | null
  duplicateIdempotencyHit?: boolean
}

export type RefundValidationResult = {
  allowed: boolean
  httpStatus: number
  code:
    | 'OK'
    | 'FORBIDDEN'
    | 'INVALID_AMOUNT'
    | 'REASON_REQUIRED'
    | 'EXCEEDS_REFUNDABLE_BALANCE'
    | 'DUPLICATE_REFUND'
  maxRefundable: number
  message: string
}

export function validateRefundRequest(input: RefundValidationInput): RefundValidationResult {
  const received = roundVndInteger(input.totalVerifiedReceived)
  const refunded = roundVndInteger(input.alreadyRefundedAmount)
  const pending = roundVndInteger(input.pendingRefundAmount)
  const maxRefundable = Math.max(0, received - refunded - pending)

  if (!input.isAdmin || !input.hasPaymentUpdatePermission) {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'FORBIDDEN',
      maxRefundable,
      message: 'Bạn không có quyền phê duyệt hoặc thực hiện hoàn tiền.',
    }
  }
  if (input.duplicateIdempotencyHit) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'DUPLICATE_REFUND',
      maxRefundable,
      message: 'Yêu cầu hoàn tiền này đã được ghi nhận hoặc đang xử lý, không thể hoàn trùng.',
    }
  }
  const requested = Number(input.requestedRefundAmount)
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return {
      allowed: false,
      httpStatus: 400,
      code: 'INVALID_AMOUNT',
      maxRefundable,
      message: 'Số tiền hoàn phải là số nguyên dương (VNĐ).',
    }
  }
  if (!input.reason || !String(input.reason).trim()) {
    return {
      allowed: false,
      httpStatus: 400,
      code: 'REASON_REQUIRED',
      maxRefundable,
      message: 'Vui lòng nhập lý do hoàn tiền rõ ràng để phục vụ kiểm toán.',
    }
  }
  if (requested > maxRefundable) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'EXCEEDS_REFUNDABLE_BALANCE',
      maxRefundable,
      message: `Số tiền yêu cầu hoàn (${formatVnd(requested)}) vượt quá số dư thực nhận có thể hoàn (${formatVnd(maxRefundable)}).`,
    }
  }
  return {
    allowed: true,
    httpStatus: 200,
    code: 'OK',
    maxRefundable,
    message: 'Yêu cầu hoàn tiền hợp lệ.',
  }
}

export function checkHandoverFinancialEligibility(params: {
  bookingStatus: string
  financial: BookingFinancialSummary
  requireDepositBeforeHandover?: boolean
  hasPaymentRecords?: boolean
}): { allowed: boolean; reason?: string } {
  if (params.bookingStatus === 'PENDING' || params.bookingStatus === 'DEPOSIT_PENDING') {
    return {
      allowed: false,
      reason:
        'Đơn thuê chưa hoàn tất bước duyệt hoặc xác nhận tiền đặt cọc nên không thể bàn giao xe.',
    }
  }
  if (params.financial.hasPendingPayment) {
    return {
      allowed: false,
      reason:
        'Đơn thuê đang có giao dịch chờ xác minh. Vui lòng hoàn tất xác minh hoặc đối soát trước khi bàn giao xe.',
    }
  }
  if (params.financial.paymentStatusSummary === 'PARTIALLY_PAID') {
    return {
      allowed: false,
      reason: `Khách hàng mới thanh toán một phần (${formatVnd(params.financial.totalVerifiedReceived)}), vẫn còn thiếu tiền cọc/tiền thuê bắt buộc trước khi nhận xe.`,
    }
  }
  if (
    params.requireDepositBeforeHandover &&
    params.financial.reservationDepositRequired > 0 &&
    params.financial.remainingDepositDue > 0
  ) {
    return {
      allowed: false,
      reason: `Chưa thu đủ tiền đặt cọc giữ xe (${formatVnd(params.financial.remainingDepositDue)} còn thiếu). Không thể chuyển trạng thái bàn giao xe.`,
    }
  }
  return { allowed: true }
}

export function checkSettlementCompletionEligibility(params: {
  financial: BookingFinancialSummary
  hasOnlineOrRecordedPayments: boolean
  approveFinancialException?: boolean
  exceptionNote?: string | null
}): { allowed: boolean; reason?: string } {
  if (params.financial.pendingRefundAmount > 0) {
    return {
      allowed: false,
      reason: `Đơn thuê đang có yêu cầu hoàn tiền chờ xử lý (${formatVnd(params.financial.pendingRefundAmount)}). Vui lòng hoàn tất đối soát hoàn tiền trước khi đóng hợp đồng.`,
    }
  }
  if (params.financial.hasPendingPayment) {
    return {
      allowed: false,
      reason:
        'Đơn thuê đang có giao dịch thanh toán chờ xác minh. Vui lòng đối soát trước khi hoàn tất đơn.',
    }
  }
  if (
    params.hasOnlineOrRecordedPayments &&
    params.financial.remainingExtraFeeDue > 0 &&
    !(params.approveFinancialException && params.exceptionNote?.trim())
  ) {
    return {
      allowed: false,
      reason: `Đơn thuê còn khoản phụ phí phát sinh chưa thanh toán (${formatVnd(params.financial.remainingExtraFeeDue)}). Vui lòng thu phụ phí hoặc xác nhận ngoại lệ có lý do kiểm toán.`,
    }
  }
  if (
    params.hasOnlineOrRecordedPayments &&
    params.financial.paymentStatusSummary === 'REVIEW_REQUIRED' &&
    !(params.approveFinancialException && params.exceptionNote?.trim())
  ) {
    return {
      allowed: false,
      reason:
        'Đơn thuê đang có giao dịch bất thường cần đối soát (Review Required). Vui lòng hoàn tất đối soát trước khi đóng đơn.',
    }
  }
  return { allowed: true }
}
