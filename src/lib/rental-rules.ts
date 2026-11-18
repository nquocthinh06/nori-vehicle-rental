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
