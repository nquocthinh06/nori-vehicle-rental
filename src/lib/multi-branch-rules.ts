import {
  HOLD_STATUSES,
  addDays,
  businessToday,
  calculateRentalQuote,
  dateNumber,
  overlaps,
  roundVndInteger,
  validateTimeString,
  type AddonDefinition,
  type RentalQuoteBreakdown,
} from './rental-rules.ts'

// ============================================================================
// 1. STATUS CONSTANTS & VIETNAMESE LABELS
// ============================================================================

export const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED', 'ARCHIVED'] as const
export type BranchStatus = (typeof BRANCH_STATUSES)[number]

export const branchStatusLabels: Record<BranchStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  TEMPORARILY_CLOSED: 'Tạm thời đóng cửa',
  ARCHIVED: 'Đã lưu trữ',
}

export const WAREHOUSE_TYPES = [
  'SHOWROOM',
  'PARKING_LOT',
  'STORAGE',
  'MAINTENANCE_CENTER',
  'STAGING_POINT',
] as const
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number]

export const warehouseTypeLabels: Record<WarehouseType, string> = {
  SHOWROOM: 'Showroom trưng bày',
  PARKING_LOT: 'Bãi đỗ xe',
  STORAGE: 'Kho lưu trữ',
  MAINTENANCE_CENTER: 'Trung tâm bảo dưỡng',
  STAGING_POINT: 'Điểm tập kết phương tiện',
}

export const WAREHOUSE_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'ARCHIVED'] as const
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number]

export const warehouseStatusLabels: Record<WarehouseStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  MAINTENANCE: 'Đang bảo trì kho',
  ARCHIVED: 'Đã lưu trữ',
}

export const SERVICE_LOCATION_TYPES = [
  'BRANCH',
  'SHOWROOM',
  'WAREHOUSE',
  'FIXED_POINT',
  'AIRPORT',
  'TRAIN_STATION',
  'PARTNER_HOTEL',
] as const
export type ServiceLocationType = (typeof SERVICE_LOCATION_TYPES)[number]

export const serviceLocationTypeLabels: Record<ServiceLocationType, string> = {
  BRANCH: 'Chi nhánh NORI',
  SHOWROOM: 'Showroom NORI',
  WAREHOUSE: 'Kho xe phục vụ khách',
  FIXED_POINT: 'Điểm giao nhận cố định',
  AIRPORT: 'Sân bay',
  TRAIN_STATION: 'Nhà ga',
  PARTNER_HOTEL: 'Khách sạn / Đối tác liên kết',
}

export const TRANSFER_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_TRANSIT',
  'ARRIVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXCEPTION',
] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]

export const transferStatusLabels: Record<TransferStatus, string> = {
  DRAFT: 'Bản nháp',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  IN_TRANSIT: 'Đang điều chuyển',
  ARRIVED: 'Đã đến điểm nhận',
  COMPLETED: 'Hoàn tất tiếp nhận',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  EXCEPTION: 'Phát sinh sự cố',
}

export const ACTIVE_TRANSFER_LOCK_STATUSES: readonly TransferStatus[] = [
  'APPROVED',
  'IN_TRANSIT',
  'ARRIVED',
  'EXCEPTION',
]

export const DELIVERY_JOB_STATUSES = [
  'PENDING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const
export type DeliveryJobStatus = (typeof DELIVERY_JOB_STATUSES)[number]

export const deliveryJobStatusLabels: Record<DeliveryJobStatus, string> = {
  PENDING: 'Chờ phân công',
  ASSIGNED: 'Đã phân công',
  EN_ROUTE: 'Đang di chuyển',
  ARRIVED: 'Đã đến địa điểm',
  COMPLETED: 'Hoàn tất bàn giao',
  FAILED: 'Giao nhận thất bại',
  CANCELLED: 'Đã hủy',
}

export const PRICING_SCOPE_TYPES = [
  'VEHICLE_BRANCH',
  'MODEL_BRANCH',
  'BRANCH_DEFAULT',
  'GLOBAL_DEFAULT',
] as const
export type PricingScopeType = (typeof PRICING_SCOPE_TYPES)[number]

export const pricingScopeLabels: Record<PricingScopeType, string> = {
  VEHICLE_BRANCH: 'Giá riêng xe tại chi nhánh (Ưu tiên 1)',
  MODEL_BRANCH: 'Giá dòng xe tại chi nhánh (Ưu tiên 2)',
  BRANCH_DEFAULT: 'Giá mặc định chi nhánh (Ưu tiên 3)',
  GLOBAL_DEFAULT: 'Giá mặc định toàn hệ thống (Ưu tiên 4)',
}

export const REVENUE_SPLIT_MODES = [
  'PICKUP_BRANCH',
  'RETURN_BRANCH',
  'SPLIT_50_50',
  'CUSTOM_PERCENT',
] as const
export type RevenueSplitMode = (typeof REVENUE_SPLIT_MODES)[number]

export const PICKUP_METHODS = ['BRANCH_PICKUP', 'HOME_DELIVERY'] as const
export type PickupMethod = (typeof PICKUP_METHODS)[number]

export const RETURN_METHODS = ['BRANCH_RETURN', 'HOME_PICKUP'] as const
export type ReturnMethod = (typeof RETURN_METHODS)[number]

// ============================================================================
// 2. VEHICLE TRANSFER STATE MACHINE & VALIDATION (Section V)
// ============================================================================

const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'EXCEPTION'],
  ARRIVED: ['COMPLETED', 'EXCEPTION'],
  EXCEPTION: ['IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
}

export function canTransitionTransfer(
  from: TransferStatus,
  to: TransferStatus,
  actorTitle: string,
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return {
      allowed: false,
      reason: `Phiếu điều chuyển hiện đã ở trạng thái "${transferStatusLabels[from]}".`,
    }
  }
  const allowedTargets = TRANSFER_TRANSITIONS[from] ?? []
  if (!allowedTargets.includes(to)) {
    if (from === 'IN_TRANSIT' && to === 'CANCELLED') {
      return {
        allowed: false,
        reason:
          'Xe đã xuất kho và đang trên đường điều chuyển, không thể hủy trực tiếp. Hãy chuyển sang trạng thái Phát sinh sự cố (EXCEPTION) để xử lý ngoại lệ.',
      }
    }
    if (from === 'COMPLETED') {
      return {
        allowed: false,
        reason:
          'Phiếu điều chuyển đã hoàn tất tiếp nhận, không thể xác nhận lại hoặc đổi trạng thái.',
      }
    }
    return {
      allowed: false,
      reason: `Không thể chuyển phiếu điều chuyển từ "${transferStatusLabels[from]}" sang "${transferStatusLabels[to]}".`,
    }
  }

  // Enforce approval & exception authority
  const isApprover = ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER'].includes(actorTitle)
  if ((to === 'APPROVED' || to === 'REJECTED') && !isApprover) {
    return {
      allowed: false,
      reason:
        'Chỉ Quản trị viên hoặc Quản lý chi nhánh mới có quyền phê duyệt / từ chối điều chuyển.',
    }
  }
  if (from === 'EXCEPTION' && !isApprover) {
    return {
      allowed: false,
      reason: 'Chỉ Quản trị viên hoặc Quản lý chi nhánh mới có quyền xử lý ngoại lệ điều chuyển.',
    }
  }
  return { allowed: true }
}

// ============================================================================
// 3. DELIVERY JOB STATE MACHINE & STAFF CONFLICT DETECTION (Section VI)
// ============================================================================

const DELIVERY_TRANSITIONS: Record<DeliveryJobStatus, DeliveryJobStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'FAILED', 'CANCELLED', 'PENDING'],
  EN_ROUTE: ['ARRIVED', 'FAILED'],
  ARRIVED: ['COMPLETED', 'FAILED'],
  FAILED: ['ASSIGNED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransitionDeliveryJob(
  from: DeliveryJobStatus,
  to: DeliveryJobStatus,
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: 'Nhiệm vụ giao nhận đã ở trạng thái này.' }
  }
  if (!DELIVERY_TRANSITIONS[from]?.includes(to)) {
    return {
      allowed: false,
      reason: `Không thể chuyển nhiệm vụ từ "${deliveryJobStatusLabels[from]}" sang "${deliveryJobStatusLabels[to]}".`,
    }
  }
  return { allowed: true }
}

export function parseTimeToMinutes(hhmm: string): number {
  if (!validateTimeString(hhmm)) return NaN
  const [hh, mm] = hhmm.split(':').map(Number)
  return hh * 60 + mm
}

export type DeliverySlotLike = {
  id?: string
  assignedStaffId: string | null | undefined
  scheduledDate: string
  scheduledTime: string
  estimatedDurationMinutes?: number | null
  status: string
}

export function hasDeliveryStaffTimeConflict(
  existingJobs: ReadonlyArray<DeliverySlotLike>,
  candidate: {
    excludeJobId?: string
    staffId: string
    scheduledDate: string
    scheduledTime: string
    estimatedDurationMinutes?: number | null
  },
): { conflict: boolean; conflictingJob?: DeliverySlotLike } {
  const activeStatuses = new Set(['ASSIGNED', 'EN_ROUTE', 'ARRIVED'])
  const startMin = parseTimeToMinutes(candidate.scheduledTime)
  if (!Number.isFinite(startMin)) return { conflict: false }
  const duration = Math.max(15, Number(candidate.estimatedDurationMinutes ?? 60))
  const endMin = startMin + duration

  for (const job of existingJobs) {
    if (candidate.excludeJobId && job.id === candidate.excludeJobId) continue
    if (!job.assignedStaffId || job.assignedStaffId !== candidate.staffId) continue
    if (!activeStatuses.has(job.status)) continue
    if (job.scheduledDate !== candidate.scheduledDate) continue
    const jStart = parseTimeToMinutes(job.scheduledTime)
    if (!Number.isFinite(jStart)) continue
    const jEnd = jStart + Math.max(15, Number(job.estimatedDurationMinutes ?? 60))
    if (startMin < jEnd && endMin > jStart) {
      return { conflict: true, conflictingJob: job }
    }
  }
  return { conflict: false }
}

export function isTimeWithinWindow(
  time: string,
  startWindow?: string | null,
  endWindow?: string | null,
): boolean {
  const t = parseTimeToMinutes(time)
  const s = parseTimeToMinutes(startWindow ?? '')
  const e = parseTimeToMinutes(endWindow ?? '')
  if (!Number.isFinite(t) || !Number.isFinite(s) || !Number.isFinite(e)) return true
  return t >= s && t <= e
}

// ============================================================================
// 4. LOCATION-BASED PRICING ENGINE (Section VII)
// ============================================================================

export type LocationPricingRuleLike = {
  id?: string
  code?: string
  name?: string
  scopeType: PricingScopeType
  branchId?: string | null
  vehicleModelId?: string | null
  vehicleId?: string | null
  dailyPrice?: number | null
  weeklyPrice?: number | null
  monthlyPrice?: number | null
  weekendSurcharge?: number | null
  holidaySurcharge?: number | null
  depositAmount?: number | null
  locationSurcharge?: number | null
  afterHoursFee?: number | null
  weeklyDiscountPercent?: number | null
  monthlyDiscountPercent?: number | null
  validFrom?: string | null
  validTo?: string | null
  priority?: number | null
  active?: boolean | null
}

export type OneWayRuleLike = {
  id?: string
  routeKey?: string
  fromBranchId: string
  toBranchId: string
  vehicleCategory?: 'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP' | null
  allowed: boolean
  fee: number
  minRentalDays?: number | null
  estimatedTransitHours?: number | null
  preparationBufferHours?: number | null
  revenueSplitMode?: RevenueSplitMode | null
  pickupBranchSharePercent?: number | null
  active?: boolean | null
}

export type DeliveryZoneLike = {
  id?: string
  code?: string
  name?: string
  branchId: string
  province?: string | null
  wards?: string | null
  deliveryFee: number
  pickupFee: number
  afterHoursFee?: number | null
  freeOverOrderAmount?: number | null
  estimatedTravelMinutes?: number | null
  serviceStartTime?: string | null
  serviceEndTime?: string | null
  active?: boolean | null
}

export type ResolvedLocationPriceResult = {
  ok: boolean
  error?: string
  appliedRuleId: string | null
  appliedRuleCode: string | null
  appliedRuleScope: PricingScopeType | 'VEHICLE_BASE' | null
  dailyPrice: number | null
  weeklyPrice: number | null
  monthlyPrice: number | null
  weekendSurcharge: number
  holidaySurcharge: number
  depositAmount: number
  locationSurcharge: number
  afterHoursFee: number
  weeklyDiscountPercent: number | null
  monthlyDiscountPercent: number | null
}

function isRuleDateValid(rule: LocationPricingRuleLike, referenceDate: string): boolean {
  if (rule.validFrom && referenceDate < rule.validFrom) return false
  if (rule.validTo && referenceDate > rule.validTo) return false
  return true
}

/**
 * Resolves authoritative daily rate and location surcharges following NORI's strict priority order:
 * 1. VEHICLE_BRANCH (vehicle + pickup branch)
 * 2. MODEL_BRANCH (vehicle model + pickup branch)
 * 3. Vehicle base price (optionally supplemented by BRANCH_DEFAULT surcharges/rate)
 * 4. GLOBAL_DEFAULT
 * Never silently defaults a missing daily rate to 0.
 */
export function resolveLocationPricing(input: {
  vehicleId: string
  vehicleModelId: string
  pickupBranchId?: string | null
  referenceDate?: string
  vehicleBase: {
    pricePerDay?: number | null
    pricePerWeek?: number | null
    pricePerMonth?: number | null
    weekendSurcharge?: number | null
    holidaySurcharge?: number | null
    depositAmount?: number | null
  }
  rules: ReadonlyArray<LocationPricingRuleLike>
  serviceLocationSurcharge?: number | null
  branchAfterHoursFee?: number | null
}): ResolvedLocationPriceResult {
  const refDate = input.referenceDate || businessToday()
  const activeRules = input.rules
    .filter((r) => r.active !== false && isRuleDateValid(r, refDate))
    .slice()
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  const vehicleBranchRule = input.pickupBranchId
    ? activeRules.find(
        (r) =>
          r.scopeType === 'VEHICLE_BRANCH' &&
          r.vehicleId === input.vehicleId &&
          r.branchId === input.pickupBranchId,
      )
    : undefined

  const modelBranchRule = input.pickupBranchId
    ? activeRules.find(
        (r) =>
          r.scopeType === 'MODEL_BRANCH' &&
          r.vehicleModelId === input.vehicleModelId &&
          r.branchId === input.pickupBranchId,
      )
    : undefined

  const branchDefaultRule = input.pickupBranchId
    ? activeRules.find(
        (r) => r.scopeType === 'BRANCH_DEFAULT' && r.branchId === input.pickupBranchId,
      )
    : undefined

  const globalDefaultRule = activeRules.find((r) => r.scopeType === 'GLOBAL_DEFAULT')

  const validPositive = (val?: number | null): number | null => {
    if (val === null || val === undefined) return null
    const num = Number(val)
    return Number.isFinite(num) && num > 0 ? roundVndInteger(num) : null
  }
  const validNonNeg = (val?: number | null): number | null => {
    if (val === null || val === undefined) return null
    const num = Number(val)
    return Number.isFinite(num) && num >= 0 ? roundVndInteger(num) : null
  }

  let appliedRule: LocationPricingRuleLike | undefined
  let appliedScope: PricingScopeType | 'VEHICLE_BASE' | null = null
  let dailyPrice: number | null = null

  if (vehicleBranchRule && validPositive(vehicleBranchRule.dailyPrice) !== null) {
    appliedRule = vehicleBranchRule
    appliedScope = 'VEHICLE_BRANCH'
    dailyPrice = validPositive(vehicleBranchRule.dailyPrice)
  } else if (modelBranchRule && validPositive(modelBranchRule.dailyPrice) !== null) {
    appliedRule = modelBranchRule
    appliedScope = 'MODEL_BRANCH'
    dailyPrice = validPositive(modelBranchRule.dailyPrice)
  } else if (validPositive(input.vehicleBase.pricePerDay) !== null) {
    appliedRule = vehicleBranchRule ?? modelBranchRule ?? branchDefaultRule
    appliedScope = 'VEHICLE_BASE'
    dailyPrice = validPositive(input.vehicleBase.pricePerDay)
  } else if (branchDefaultRule && validPositive(branchDefaultRule.dailyPrice) !== null) {
    appliedRule = branchDefaultRule
    appliedScope = 'BRANCH_DEFAULT'
    dailyPrice = validPositive(branchDefaultRule.dailyPrice)
  } else if (globalDefaultRule && validPositive(globalDefaultRule.dailyPrice) !== null) {
    appliedRule = globalDefaultRule
    appliedScope = 'GLOBAL_DEFAULT'
    dailyPrice = validPositive(globalDefaultRule.dailyPrice)
  }

  if (dailyPrice === null || dailyPrice <= 0) {
    return {
      ok: false,
      error: 'Phương tiện chưa được cấu hình đơn giá thuê hợp lệ tại chi nhánh này.',
      appliedRuleId: null,
      appliedRuleCode: null,
      appliedRuleScope: null,
      dailyPrice: null,
      weeklyPrice: null,
      monthlyPrice: null,
      weekendSurcharge: 0,
      holidaySurcharge: 0,
      depositAmount: 0,
      locationSurcharge: 0,
      afterHoursFee: 0,
      weeklyDiscountPercent: null,
      monthlyDiscountPercent: null,
    }
  }

  const pickNonNeg = (...vals: Array<number | null | undefined>): number => {
    for (const v of vals) {
      const parsed = validNonNeg(v)
      if (parsed !== null) return parsed
    }
    return 0
  }

  const pickPositiveNullable = (...vals: Array<number | null | undefined>): number | null => {
    for (const v of vals) {
      const parsed = validPositive(v)
      if (parsed !== null) return parsed
    }
    return null
  }

  const weeklyPrice = pickPositiveNullable(
    vehicleBranchRule?.weeklyPrice,
    modelBranchRule?.weeklyPrice,
    input.vehicleBase.pricePerWeek,
    branchDefaultRule?.weeklyPrice,
    globalDefaultRule?.weeklyPrice,
  )
  const monthlyPrice = pickPositiveNullable(
    vehicleBranchRule?.monthlyPrice,
    modelBranchRule?.monthlyPrice,
    input.vehicleBase.pricePerMonth,
    branchDefaultRule?.monthlyPrice,
    globalDefaultRule?.monthlyPrice,
  )
  const weekendSurcharge = pickNonNeg(
    vehicleBranchRule?.weekendSurcharge,
    modelBranchRule?.weekendSurcharge,
    input.vehicleBase.weekendSurcharge,
    branchDefaultRule?.weekendSurcharge,
    globalDefaultRule?.weekendSurcharge,
  )
  const holidaySurcharge = pickNonNeg(
    vehicleBranchRule?.holidaySurcharge,
    modelBranchRule?.holidaySurcharge,
    input.vehicleBase.holidaySurcharge,
    branchDefaultRule?.holidaySurcharge,
    globalDefaultRule?.holidaySurcharge,
  )
  const depositAmount = pickNonNeg(
    vehicleBranchRule?.depositAmount,
    modelBranchRule?.depositAmount,
    input.vehicleBase.depositAmount,
    branchDefaultRule?.depositAmount,
    globalDefaultRule?.depositAmount,
  )
  const locationSurcharge = pickNonNeg(
    input.serviceLocationSurcharge,
    vehicleBranchRule?.locationSurcharge,
    modelBranchRule?.locationSurcharge,
    branchDefaultRule?.locationSurcharge,
    globalDefaultRule?.locationSurcharge,
  )
  const afterHoursFee = pickNonNeg(
    vehicleBranchRule?.afterHoursFee,
    modelBranchRule?.afterHoursFee,
    branchDefaultRule?.afterHoursFee,
    input.branchAfterHoursFee,
    globalDefaultRule?.afterHoursFee,
  )

  return {
    ok: true,
    appliedRuleId: appliedRule?.id ?? null,
    appliedRuleCode: appliedRule?.code ?? null,
    appliedRuleScope: appliedScope,
    dailyPrice,
    weeklyPrice,
    monthlyPrice,
    weekendSurcharge,
    holidaySurcharge,
    depositAmount,
    locationSurcharge,
    afterHoursFee,
    weeklyDiscountPercent:
      appliedRule?.weeklyDiscountPercent ?? branchDefaultRule?.weeklyDiscountPercent ?? null,
    monthlyDiscountPercent:
      appliedRule?.monthlyDiscountPercent ?? branchDefaultRule?.monthlyDiscountPercent ?? null,
  }
}

export function matchOneWayRule(
  rules: ReadonlyArray<OneWayRuleLike>,
  fromBranchId: string,
  toBranchId: string,
  vehicleCategory: 'CAR' | 'MOTORBIKE' | 'PICKUP' = 'CAR',
): OneWayRuleLike | null {
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) return null
  const active = rules.filter(
    (r) => r.active !== false && r.fromBranchId === fromBranchId && r.toBranchId === toBranchId,
  )
  const exactCat = active.find((r) => r.vehicleCategory === vehicleCategory)
  if (exactCat) return exactCat
  return active.find((r) => !r.vehicleCategory || r.vehicleCategory === 'ALL') ?? null
}

export type MultiBranchQuoteBreakdown = RentalQuoteBreakdown & {
  locationSurcharge: number
  oneWayFee: number
  pickupFee: number
  afterHoursFee: number
  pricingRuleScope: PricingScopeType | 'VEHICLE_BASE' | null
  pricingRuleCode: string | null
  isOneWay: boolean
}

export function calculateMultiBranchRentalQuote(input: {
  startDate: string
  endDate: string
  dailyPrice: number
  weeklyPrice?: number | null
  monthlyPrice?: number | null
  weekendSurcharge?: number | null
  holidaySurcharge?: number | null
  locationSurcharge?: number | null
  oneWayFee?: number | null
  isOneWay?: boolean
  deliveryRequested?: boolean
  deliveryFee?: number | null
  pickupRequested?: boolean
  pickupFee?: number | null
  afterHoursFee?: number | null
  addonKeys?: AddonDefinition['id'][]
  vehicleDeposit?: number | null
  pricingRuleScope?: PricingScopeType | 'VEHICLE_BASE' | null
  pricingRuleCode?: string | null
}): MultiBranchQuoteBreakdown {
  const base = calculateRentalQuote({
    startDate: input.startDate,
    endDate: input.endDate,
    dailyPrice: input.dailyPrice,
    weeklyPrice: input.weeklyPrice,
    monthlyPrice: input.monthlyPrice,
    weekendSurcharge: input.weekendSurcharge,
    holidaySurcharge: input.holidaySurcharge,
    deliveryRequested: Boolean(input.deliveryRequested),
    vehicleDeliveryFee: input.deliveryFee,
    addonKeys: input.addonKeys ?? [],
    vehicleDeposit: input.vehicleDeposit,
  })

  const locationSurcharge = Math.max(0, roundVndInteger(input.locationSurcharge ?? 0))
  const isOneWay = Boolean(input.isOneWay)
  // PR-03: Never add one-way fee when pickup and return are at the same branch!
  const oneWayFee = isOneWay ? Math.max(0, roundVndInteger(input.oneWayFee ?? 0)) : 0
  const pickupFee = input.pickupRequested ? Math.max(0, roundVndInteger(input.pickupFee ?? 0)) : 0
  const afterHoursFee = Math.max(0, roundVndInteger(input.afterHoursFee ?? 0))

  const estimatedTotal = Math.max(
    0,
    base.estimatedTotal + locationSurcharge + oneWayFee + pickupFee + afterHoursFee,
  )

  return {
    ...base,
    locationSurcharge,
    oneWayFee,
    pickupFee,
    afterHoursFee,
    estimatedTotal,
    // Deposit remains strictly separate from rental revenue / remainingAmount (PR-10)
    remainingAmount: estimatedTotal,
    pricingRuleScope: input.pricingRuleScope ?? 'VEHICLE_BASE',
    pricingRuleCode: input.pricingRuleCode ?? null,
    isOneWay,
  }
}

export function validateNonNegativeVnd(
  value: unknown,
  label: string,
): { valid: boolean; value?: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: true, value: undefined }
  }
  const num = Number(value)
  if (!Number.isSafeInteger(num) || num < 0) {
    return { valid: false, error: `${label} phải là số nguyên VNĐ không âm.` }
  }
  return { valid: true, value: num }
}

// ============================================================================
// 5. VEHICLE TIMELINE & MULTI-BRANCH AVAILABILITY ENGINE (P0 — Section VIII)
// ============================================================================

export type TimelineBookingEvent = {
  id: string
  bookingKey?: string
  startDate: string
  endDate: string
  status: string
  pickupBranchId?: string | null
  returnBranchId?: string | null
}

export type TimelineTransferEvent = {
  id: string
  transferCode?: string
  fromBranchId: string
  toBranchId: string
  startDate: string
  endDate: string
  status: TransferStatus
}

export type TimelineMaintenanceEvent = {
  id: string
  startDate: string
  endDate: string
  status: string
}

export type VehicleAvailabilityReasonCode =
  | 'AVAILABLE'
  | 'VEHICLE_UNAVAILABLE_STATUS'
  | 'DATE_OVERLAP_BOOKING'
  | 'DATE_OVERLAP_MAINTENANCE'
  | 'DATE_OVERLAP_TRANSFER'
  | 'PICKUP_BRANCH_INACTIVE'
  | 'RETURN_BRANCH_INACTIVE'
  | 'ONE_WAY_NOT_ALLOWED'
  | 'ONE_WAY_MIN_DAYS_NOT_MET'
  | 'VEHICLE_LOCATION_UNKNOWN'
  | 'LOCATION_MISMATCH_PROJECTED'
  | 'NEXT_BOOKING_LOCATION_CONFLICT'
  | 'INSUFFICIENT_TURNAROUND_BUFFER'

export type VehicleTimelineAvailabilityResult = {
  available: boolean
  reasonCode: VehicleAvailabilityReasonCode
  reason?: string
  projectedBranchOnStart: string | null
  projectedNextBookingConflict?: string | null
}

/**
 * Pure P0 Vehicle Timeline Engine:
 * Evaluates whether a single physical vehicle can satisfy a rental `[startDate, endDate)`
 * picked up at `requestedPickupBranchId` and returned at `requestedReturnBranchId`.
 *
 * Enforces:
 * - No overlap with bookings, maintenance, or active transfers
 * - Projected physical location on `startDate` must match `requestedPickupBranchId`
 *   (or have an APPROVED/IN_TRANSIT transfer delivering the vehicle there before `startDate`)
 * - Returning the vehicle to `requestedReturnBranchId` on `endDate` must not strand
 *   the next scheduled booking/transfer at another branch without a planned transfer!
 * - Safe failure: unknown/unallocated branch when branch rental is requested => unavailable!
 */
export function evaluateVehicleLocationTimeline(input: {
  vehicleOperationStatus: string
  vehicleBusinessStatus: string
  currentBranchId: string | null
  managingBranchId: string | null
  startDate: string
  endDate: string
  requestedPickupBranchId?: string | null
  requestedReturnBranchId?: string | null
  pickupBranchStatus?: BranchStatus | null
  returnBranchStatus?: BranchStatus | null
  oneWayRule?: OneWayRuleLike | null
  bookings: ReadonlyArray<TimelineBookingEvent>
  transfers: ReadonlyArray<TimelineTransferEvent>
  maintenances: ReadonlyArray<TimelineMaintenanceEvent>
  excludeBookingId?: string | null
  today?: string
}): VehicleTimelineAvailabilityResult {
  const today = input.today || businessToday()
  const blockedVehicleStatuses = new Set(['SOLD', 'MAINTENANCE', 'INACTIVE', 'RESERVED'])

  if (
    input.vehicleBusinessStatus !== 'ACTIVE' ||
    blockedVehicleStatuses.has(input.vehicleOperationStatus)
  ) {
    return {
      available: false,
      reasonCode: 'VEHICLE_UNAVAILABLE_STATUS',
      reason: 'Phương tiện hiện không ở trạng thái sẵn sàng nhận đặt mới.',
      projectedBranchOnStart: input.currentBranchId,
    }
  }

  // Branch status guards (BR-05)
  if (
    input.requestedPickupBranchId &&
    input.pickupBranchStatus &&
    input.pickupBranchStatus !== 'ACTIVE'
  ) {
    return {
      available: false,
      reasonCode: 'PICKUP_BRANCH_INACTIVE',
      reason: 'Chi nhánh nhận xe hiện đang ngừng hoạt động hoặc tạm đóng cửa.',
      projectedBranchOnStart: input.currentBranchId,
    }
  }
  const effectiveReturnBranchId =
    input.requestedReturnBranchId || input.requestedPickupBranchId || null
  if (
    effectiveReturnBranchId &&
    input.returnBranchStatus &&
    input.returnBranchStatus !== 'ACTIVE'
  ) {
    return {
      available: false,
      reasonCode: 'RETURN_BRANCH_INACTIVE',
      reason: 'Chi nhánh trả xe hiện đang ngừng hoạt động hoặc không thể tiếp nhận xe.',
      projectedBranchOnStart: input.currentBranchId,
    }
  }

  // One-way route policy validation (BK-02, BK-03)
  const isOneWay = Boolean(
    input.requestedPickupBranchId &&
    effectiveReturnBranchId &&
    input.requestedPickupBranchId !== effectiveReturnBranchId,
  )
  const totalDays = Math.max(0, dateNumber(input.endDate) - dateNumber(input.startDate))
  if (isOneWay) {
    if (!input.oneWayRule || !input.oneWayRule.allowed || input.oneWayRule.active === false) {
      return {
        available: false,
        reasonCode: 'ONE_WAY_NOT_ALLOWED',
        reason:
          'Tuyến nhận và trả xe khác chi nhánh này hiện chưa được NORI hỗ trợ. Vui lòng chọn chi nhánh trả xe hợp lệ hoặc trả tại cùng chi nhánh nhận.',
        projectedBranchOnStart: input.currentBranchId,
      }
    }
    const minDays = Math.max(1, Number(input.oneWayRule.minRentalDays ?? 1))
    if (totalDays < minDays) {
      return {
        available: false,
        reasonCode: 'ONE_WAY_MIN_DAYS_NOT_MET',
        reason: `Tuyến trả xe khác chi nhánh này yêu cầu thời gian thuê tối thiểu ${minDays} ngày.`,
        projectedBranchOnStart: input.currentBranchId,
      }
    }
  }

  // Filter active blocking records
  const activeBookings = input.bookings.filter(
    (b) =>
      (!input.excludeBookingId || b.id !== input.excludeBookingId) &&
      HOLD_STATUSES.includes(b.status as (typeof HOLD_STATUSES)[number]),
  )
  const activeTransfers = input.transfers.filter((t) =>
    ACTIVE_TRANSFER_LOCK_STATUSES.includes(t.status),
  )
  const activeMaintenances = input.maintenances.filter((m) =>
    ['SCHEDULED', 'IN_PROGRESS'].includes(m.status),
  )

  // 1. Direct date overlap checks (bookings, maintenance, transfers)
  const reqRange = { startDate: input.startDate, endDate: input.endDate }
  for (const b of activeBookings) {
    if (overlaps(reqRange, { startDate: b.startDate, endDate: b.endDate })) {
      return {
        available: false,
        reasonCode: 'DATE_OVERLAP_BOOKING',
        reason: 'Xe đã có lịch thuê trong khoảng ngày này. Vui lòng chọn ngày hoặc xe khác.',
        projectedBranchOnStart: input.currentBranchId,
      }
    }
  }
  for (const m of activeMaintenances) {
    // Maintenance endDate is inclusive in existing NORI logic
    if (m.startDate <= input.endDate && m.endDate >= input.startDate) {
      return {
        available: false,
        reasonCode: 'DATE_OVERLAP_MAINTENANCE',
        reason: 'Xe có lịch bảo dưỡng trong khoảng ngày đã chọn.',
        projectedBranchOnStart: input.currentBranchId,
      }
    }
  }
  for (const t of activeTransfers) {
    // Transfers occupy [t.startDate, t.endDate] inclusive of arrival preparation
    if (t.startDate < input.endDate && addDays(t.endDate, 1) > input.startDate) {
      return {
        available: false,
        reasonCode: 'DATE_OVERLAP_TRANSFER',
        reason: 'Xe đang có kế hoạch điều chuyển giữa các chi nhánh trong khoảng thời gian này.',
        projectedBranchOnStart: input.currentBranchId,
      }
    }
  }

  // If no branch constraint was specified (legacy non-branch booking), date checks suffice
  if (!input.requestedPickupBranchId) {
    return {
      available: true,
      reasonCode: 'AVAILABLE',
      projectedBranchOnStart: input.currentBranchId,
    }
  }

  // 2. Build chronological movement timeline up to `startDate`
  // Safe fallback: if vehicle is IN_TRANSIT, find the IN_TRANSIT transfer to know where it arrives
  let projectedBranch: string | null = input.currentBranchId
  if (input.vehicleOperationStatus === 'IN_TRANSIT') {
    const inFlight = activeTransfers.find(
      (t) => t.status === 'IN_TRANSIT' || t.status === 'ARRIVED',
    )
    if (!inFlight) {
      return {
        available: false,
        reasonCode: 'VEHICLE_LOCATION_UNKNOWN',
        reason: 'Phương tiện đang điều chuyển nhưng chưa xác định điểm tiếp nhận hoàn tất.',
        projectedBranchOnStart: null,
      }
    }
    if (inFlight.endDate >= input.startDate) {
      return {
        available: false,
        reasonCode: 'DATE_OVERLAP_TRANSFER',
        reason: 'Xe đang trong quá trình điều chuyển, chưa sẵn sàng bàn giao vào ngày nhận.',
        projectedBranchOnStart: null,
      }
    }
    projectedBranch = inFlight.toBranchId
  }

  if (!projectedBranch) {
    return {
      available: false,
      reasonCode: 'VEHICLE_LOCATION_UNKNOWN',
      reason: 'Phương tiện chưa được phân bổ chi nhánh hoặc chưa xác định vị trí vật lý hiện tại.',
      projectedBranchOnStart: null,
    }
  }

  type MovementEvent = {
    kind: 'BOOKING' | 'TRANSFER'
    startDate: string
    endDate: string
    fromBranchId: string | null
    toBranchId: string | null
    ref: string
  }

  const allMovements: MovementEvent[] = [
    ...activeBookings.map((b) => ({
      kind: 'BOOKING' as const,
      startDate: b.startDate,
      endDate: b.endDate,
      fromBranchId: b.pickupBranchId ?? projectedBranch,
      toBranchId: b.returnBranchId ?? b.pickupBranchId ?? projectedBranch,
      ref: b.bookingKey ?? b.id,
    })),
    ...activeTransfers.map((t) => ({
      kind: 'TRANSFER' as const,
      startDate: t.startDate,
      endDate: t.endDate,
      fromBranchId: t.fromBranchId,
      toBranchId: t.toBranchId,
      ref: t.transferCode ?? t.id,
    })),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))

  // Walk events occurring before requested startDate
  for (const ev of allMovements) {
    if (ev.endDate < today && ev.kind === 'BOOKING') continue
    if (ev.endDate <= input.startDate) {
      if (ev.toBranchId) {
        projectedBranch = ev.toBranchId
      }
    }
  }

  // Check if projected branch on startDate matches requestedPickupBranchId (Section VIII & BK-12!)
  if (projectedBranch !== input.requestedPickupBranchId) {
    return {
      available: false,
      reasonCode: 'LOCATION_MISMATCH_PROJECTED',
      reason:
        'Vào ngày nhận xe đã chọn, phương tiện dự kiến đang ở chi nhánh khác và chưa có kế hoạch điều chuyển hoàn tất về điểm nhận này.',
      projectedBranchOnStart: projectedBranch,
    }
  }

  // 3. Forward compatibility check: ensure returning to `effectiveReturnBranchId` does not break the next scheduled event!
  const nextEvent = allMovements.find((ev) => ev.startDate >= input.endDate)
  if (nextEvent && effectiveReturnBranchId && nextEvent.fromBranchId) {
    if (nextEvent.kind === 'BOOKING' && nextEvent.fromBranchId !== effectiveReturnBranchId) {
      // Check if there is already a planned transfer from effectiveReturnBranchId -> nextEvent.fromBranchId between endDate and nextEvent.startDate
      const bridgingTransfer = activeTransfers.find(
        (t) =>
          t.fromBranchId === effectiveReturnBranchId &&
          t.toBranchId === nextEvent.fromBranchId &&
          t.startDate >= input.endDate &&
          t.endDate < nextEvent.startDate,
      )
      if (!bridgingTransfer) {
        return {
          available: false,
          reasonCode: 'NEXT_BOOKING_LOCATION_CONFLICT',
          reason:
            'Phương tiện đã có lịch thuê tiếp theo tại chi nhánh khác ngay sau ngày trả dự kiến, không đủ thời gian điều chuyển và chuẩn bị xe.',
          projectedBranchOnStart: projectedBranch,
          projectedNextBookingConflict: nextEvent.ref,
        }
      }
    }
  }

  return {
    available: true,
    reasonCode: 'AVAILABLE',
    projectedBranchOnStart: projectedBranch,
  }
}

// ============================================================================
// 6. FLEET INVENTORY & WAREHOUSE STATS (No double-counting — Section 3.2)
// ============================================================================

export type VehicleInventoryRecord = {
  id: string
  managingBranchId: string | null
  currentBranchId: string | null
  currentWarehouseId: string | null
  operationStatus: string
  status: string
  hasActiveHoldToday?: boolean
}

export type BranchFleetStats = {
  managedTotal: number
  physicallyPresentAtBranch: number
  readyForRent: number
  reserved: number
  rented: number
  maintenance: number
  inTransit: number
  pendingInspection: number
  inactiveOrSold: number
  awayAtOtherBranch: number
  visitingFromOtherBranch: number
  unallocatedTotal: number
}

/**
 * Computes mutually-exclusive operational counts for a branch (or entire system if branchId is null).
 * Guarantees a vehicle is NEVER counted simultaneously in two warehouses or counted in physical stock while IN_TRANSIT.
 */
export function computeBranchFleetStats(
  vehicles: ReadonlyArray<VehicleInventoryRecord>,
  branchId?: string | null,
): BranchFleetStats {
  const stats: BranchFleetStats = {
    managedTotal: 0,
    physicallyPresentAtBranch: 0,
    readyForRent: 0,
    reserved: 0,
    rented: 0,
    maintenance: 0,
    inTransit: 0,
    pendingInspection: 0,
    inactiveOrSold: 0,
    awayAtOtherBranch: 0,
    visitingFromOtherBranch: 0,
    unallocatedTotal: 0,
  }

  const seenIds = new Set<string>()
  for (const v of vehicles) {
    if (seenIds.has(v.id)) continue
    seenIds.add(v.id)

    if (!v.managingBranchId) {
      stats.unallocatedTotal += 1
    }

    const belongsManaged = !branchId || v.managingBranchId === branchId
    const isPhysicallyHere =
      v.operationStatus !== 'IN_TRANSIT' &&
      v.operationStatus !== 'RENTED' &&
      (!branchId ? Boolean(v.currentBranchId) : v.currentBranchId === branchId)

    if (branchId) {
      if (v.managingBranchId === branchId) {
        stats.managedTotal += 1
        if (
          v.currentBranchId &&
          v.currentBranchId !== branchId &&
          v.operationStatus !== 'IN_TRANSIT'
        ) {
          stats.awayAtOtherBranch += 1
        }
      }
      if (isPhysicallyHere) {
        stats.physicallyPresentAtBranch += 1
        if (v.managingBranchId && v.managingBranchId !== branchId) {
          stats.visitingFromOtherBranch += 1
        }
      }
    } else {
      stats.managedTotal += 1
      if (isPhysicallyHere) {
        stats.physicallyPresentAtBranch += 1
      }
    }

    if (!belongsManaged && !isPhysicallyHere) continue

    // Classify operationally for vehicles belonging to this branch's managed scope (or system-wide)
    if (!belongsManaged) continue
    const op = v.operationStatus || 'READY'
    if (v.status !== 'ACTIVE' || op === 'INACTIVE' || op === 'SOLD') {
      stats.inactiveOrSold += 1
    } else if (op === 'IN_TRANSIT') {
      stats.inTransit += 1
    } else if (op === 'PENDING_INSPECTION') {
      stats.pendingInspection += 1
    } else if (op === 'MAINTENANCE') {
      stats.maintenance += 1
    } else if (op === 'RENTED') {
      stats.rented += 1
    } else if (op === 'RESERVED' || v.hasActiveHoldToday) {
      stats.reserved += 1
    } else {
      stats.readyForRent += 1
    }
  }

  return stats
}

export function computeWarehouseOccupancy(
  vehicles: ReadonlyArray<VehicleInventoryRecord>,
  warehouseId: string,
  capacity: number,
) {
  // Only count vehicles physically present at this warehouse (exclude IN_TRANSIT and RENTED!)
  const seen = new Set<string>()
  let physicalCount = 0
  let readyCount = 0
  for (const v of vehicles) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    if (
      v.currentWarehouseId === warehouseId &&
      v.operationStatus !== 'IN_TRANSIT' &&
      v.operationStatus !== 'RENTED'
    ) {
      physicalCount += 1
      if (v.status === 'ACTIVE' && v.operationStatus === 'READY') {
        readyCount += 1
      }
    }
  }
  const safeCap = Math.max(1, capacity)
  return {
    physicalCount,
    readyCount,
    capacity: safeCap,
    availableSlots: Math.max(0, safeCap - physicalCount),
    isOverCapacity: physicalCount > safeCap,
    occupancyRate: Math.round((physicalCount / safeCap) * 100),
  }
}

// ============================================================================
// 7. MULTI-BRANCH REVENUE ATTRIBUTION (Zero Double-Counting — Section XV)
// ============================================================================

export type BranchRevenueBookingLike = {
  id: string
  status: string
  pickupBranchId: string | null
  returnBranchId: string | null
  revenueAttributionBranchId?: string | null
  revenueSplitPickupPercent?: number | null
  isOneWay?: boolean
  deliveryRequested?: boolean
  pickupMethod?: string | null
  returnMethod?: string | null
  totalPrice: number
  baseRentPrice?: number
  deliveryFeeSnapshot?: number
  pickupFeeSnapshot?: number
  locationSurchargeSnapshot?: number
  oneWayFeeSnapshot?: number
  afterHoursFeeSnapshot?: number
  extraFee?: number
  verifiedRentalCollected?: number
  securityDepositHeld?: number
  refundedAmount?: number
}

export type BranchReportMetrics = {
  branchId: string
  totalBookings: number
  pendingBookings: number
  completedBookings: number
  cancelledBookings: number
  oneWayOutboundCount: number
  oneWayInboundCount: number
  homeDeliveryCount: number
  rentalRevenue: number
  deliveryRevenue: number
  locationSurchargeRevenue: number
  transferCost: number
  securityDepositHeld: number
  refundedTotal: number
  netRevenue: number
}

/**
 * Attributes booking revenue cleanly across branches so that:
 *   SUM(branch.rentalRevenue) === systemTotalRentalRevenue
 *   SUM(branch.netRevenue)    === systemTotalNetRevenue
 * One-way bookings split revenue strictly by `revenueSplitPickupPercent` (default 100% pickup, 0% return).
 * Security deposits are tracked independently and NEVER added to revenue.
 */
export function aggregateMultiBranchRevenue(input: {
  branchIds: string[]
  bookings: ReadonlyArray<BranchRevenueBookingLike>
  transfers: ReadonlyArray<{
    fromBranchId: string
    toBranchId: string
    status: string
    transferCost: number
  }>
}): {
  byBranch: Record<string, BranchReportMetrics>
  unassigned: BranchReportMetrics
  systemTotal: Omit<BranchReportMetrics, 'branchId'>
} {
  const makeEmpty = (branchId: string): BranchReportMetrics => ({
    branchId,
    totalBookings: 0,
    pendingBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    oneWayOutboundCount: 0,
    oneWayInboundCount: 0,
    homeDeliveryCount: 0,
    rentalRevenue: 0,
    deliveryRevenue: 0,
    locationSurchargeRevenue: 0,
    transferCost: 0,
    securityDepositHeld: 0,
    refundedTotal: 0,
    netRevenue: 0,
  })

  const byBranch: Record<string, BranchReportMetrics> = {}
  for (const id of input.branchIds) {
    byBranch[id] = makeEmpty(id)
  }
  const unassigned = makeEmpty('UNASSIGNED')

  const getBucket = (id: string | null | undefined) =>
    id && byBranch[id] ? byBranch[id] : unassigned

  for (const b of input.bookings) {
    const primaryBranchId = b.revenueAttributionBranchId || b.pickupBranchId || null
    const pickupBucket = getBucket(primaryBranchId)
    pickupBucket.totalBookings += 1
    if (b.status === 'PENDING' || b.status === 'DEPOSIT_PENDING') pickupBucket.pendingBookings += 1
    if (b.status === 'COMPLETED') pickupBucket.completedBookings += 1
    if (b.status === 'CANCELLED' || b.status === 'REJECTED') pickupBucket.cancelledBookings += 1

    const isOneWay = Boolean(
      b.isOneWay || (b.pickupBranchId && b.returnBranchId && b.pickupBranchId !== b.returnBranchId),
    )
    if (isOneWay) {
      pickupBucket.oneWayOutboundCount += 1
      if (b.returnBranchId && b.returnBranchId !== primaryBranchId) {
        getBucket(b.returnBranchId).oneWayInboundCount += 1
      }
    }
    if (
      b.deliveryRequested ||
      b.pickupMethod === 'HOME_DELIVERY' ||
      b.returnMethod === 'HOME_PICKUP'
    ) {
      pickupBucket.homeDeliveryCount += 1
    }

    const secDep = roundVndInteger(b.securityDepositHeld ?? 0)
    const refunded = roundVndInteger(b.refundedAmount ?? 0)
    pickupBucket.securityDepositHeld += secDep
    pickupBucket.refundedTotal += refunded

    if (b.status === 'CANCELLED' || b.status === 'REJECTED') continue

    const grossDelivery =
      roundVndInteger(b.deliveryFeeSnapshot ?? 0) + roundVndInteger(b.pickupFeeSnapshot ?? 0)
    const grossLocSurcharge =
      roundVndInteger(b.locationSurchargeSnapshot ?? 0) +
      roundVndInteger(b.oneWayFeeSnapshot ?? 0) +
      roundVndInteger(b.afterHoursFeeSnapshot ?? 0)
    const realizedOrExpected =
      b.verifiedRentalCollected !== undefined && b.verifiedRentalCollected > 0
        ? roundVndInteger(b.verifiedRentalCollected)
        : b.status === 'COMPLETED'
          ? roundVndInteger(b.totalPrice + (b.extraFee ?? 0))
          : 0

    const pureRental = Math.max(0, realizedOrExpected - grossDelivery - grossLocSurcharge)
    const netForBooking = Math.max(0, realizedOrExpected - refunded)

    if (isOneWay && b.returnBranchId && b.returnBranchId !== primaryBranchId) {
      const splitPct = Math.min(100, Math.max(0, Number(b.revenueSplitPickupPercent ?? 100)))
      const pickupRental = Math.round((pureRental * splitPct) / 100)
      const returnRental = pureRental - pickupRental
      const pickupDeliv = Math.round((grossDelivery * splitPct) / 100)
      const returnDeliv = grossDelivery - pickupDeliv
      const pickupSurch = Math.round((grossLocSurcharge * splitPct) / 100)
      const returnSurch = grossLocSurcharge - pickupSurch
      const pickupNet = Math.round((netForBooking * splitPct) / 100)
      const returnNet = netForBooking - pickupNet

      pickupBucket.rentalRevenue += pickupRental
      pickupBucket.deliveryRevenue += pickupDeliv
      pickupBucket.locationSurchargeRevenue += pickupSurch
      pickupBucket.netRevenue += pickupNet

      const returnBucket = getBucket(b.returnBranchId)
      returnBucket.rentalRevenue += returnRental
      returnBucket.deliveryRevenue += returnDeliv
      returnBucket.locationSurchargeRevenue += returnSurch
      returnBucket.netRevenue += returnNet
    } else {
      pickupBucket.rentalRevenue += pureRental
      pickupBucket.deliveryRevenue += grossDelivery
      pickupBucket.locationSurchargeRevenue += grossLocSurcharge
      pickupBucket.netRevenue += netForBooking
    }
  }

  for (const t of input.transfers) {
    if (t.status === 'COMPLETED' || t.status === 'IN_TRANSIT' || t.status === 'ARRIVED') {
      getBucket(t.fromBranchId).transferCost += roundVndInteger(t.transferCost ?? 0)
    }
  }

  const allBuckets = [...Object.values(byBranch), unassigned]
  const systemTotal: Omit<BranchReportMetrics, 'branchId'> = {
    totalBookings: 0,
    pendingBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    oneWayOutboundCount: 0,
    oneWayInboundCount: 0,
    homeDeliveryCount: 0,
    rentalRevenue: 0,
    deliveryRevenue: 0,
    locationSurchargeRevenue: 0,
    transferCost: 0,
    securityDepositHeld: 0,
    refundedTotal: 0,
    netRevenue: 0,
  }
  for (const bucket of allBuckets) {
    systemTotal.totalBookings += bucket.totalBookings
    systemTotal.pendingBookings += bucket.pendingBookings
    systemTotal.completedBookings += bucket.completedBookings
    systemTotal.cancelledBookings += bucket.cancelledBookings
    systemTotal.oneWayOutboundCount += bucket.oneWayOutboundCount
    systemTotal.oneWayInboundCount += bucket.oneWayInboundCount
    systemTotal.homeDeliveryCount += bucket.homeDeliveryCount
    systemTotal.rentalRevenue += bucket.rentalRevenue
    systemTotal.deliveryRevenue += bucket.deliveryRevenue
    systemTotal.locationSurchargeRevenue += bucket.locationSurchargeRevenue
    systemTotal.transferCost += bucket.transferCost
    systemTotal.securityDepositHeld += bucket.securityDepositHeld
    systemTotal.refundedTotal += bucket.refundedTotal
    systemTotal.netRevenue += bucket.netRevenue
  }

  return { byBranch, unassigned, systemTotal }
}

/**
 * Checks whether a promotion with optional branch scope applies to the chosen pickup branch (PR-04).
 */
export function isPromotionEligibleForBranch(
  promo: { branchScope?: string | null; applicableBranchIds?: unknown },
  pickupBranchId?: string | null,
): { eligible: boolean; message?: string } {
  if (!promo.branchScope || promo.branchScope === 'ALL_BRANCHES') {
    return { eligible: true }
  }
  const allowedIds = Array.isArray(promo.applicableBranchIds)
    ? promo.applicableBranchIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : []
  if (allowedIds.length === 0) {
    return { eligible: true }
  }
  if (!pickupBranchId || !allowedIds.includes(pickupBranchId)) {
    return {
      eligible: false,
      message: 'Mã khuyến mãi này không áp dụng tại chi nhánh nhận xe bạn đang chọn.',
    }
  }
  return { eligible: true }
}

export function slugifyBranchCode(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function normalizeCode(input: string, maxLen = 40): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, maxLen)
}
