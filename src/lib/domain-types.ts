import type { Photo } from './catalogue'

export type FleetView = {
  id: string
  reference: string
  modelId: string
  modelName: string
  modelSlug: string
  intent: 'RENT' | 'SALE' | 'BOTH'
  isDemo: boolean
  vehicleConditionType: 'NEW' | 'USED'
  manufactureYear: number | null
  pricePerDay: number | null
  pricePerHour: number | null
  pricePerWeek: number | null
  pricePerMonth: number | null
  weekendSurcharge: number | null
  holidaySurcharge: number | null
  depositAmount: number | null
  deliveryFee: number | null
  kmLimitPerDay: number | null
  overKmFee: number | null
  lateReturnFeePerHour: number | null
  salePrice: number | null
  listedPrice: number | null
  discountPrice: number | null
  reservationDeposit: number | null
  estimatedRollingPrice: number | null
  negotiable: boolean
  warrantyPolicy: string | null
  priceSourceNote: string | null
  odometer: number | null
  condition: string | null
  exteriorCondition: string | null
  interiorCondition: string | null
  engineCondition: string | null
  maintenanceHistory: string | null
  inspectedAt: string | null
  color: string | null
  version: string | null
  location: string | null
  pickupLocation: string | null
  managingBranchId?: string | null
  managingBranchName?: string | null
  currentBranchId?: string | null
  currentBranchName?: string | null
  currentWarehouseId?: string | null
  currentWarehouseName?: string | null
  allocationStatus?: string
  operationStatus: string
  photos: {
    image: Photo
    caption: string | null
    kind: string | null
    photoType?: string | null
    isPrimary?: boolean
    sortOrder?: number
    altText?: string | null
    sourceName?: string | null
  }[]
}

export type Quote = {
  available: boolean
  reasonCode?: string | null
  reason?: string | null
  isOneWay?: boolean
  pickupBranchId?: string | null
  returnBranchId?: string | null
  pickupBranchName?: string | null
  returnBranchName?: string | null
  totalDays: number
  weekendDays: number
  holidayDays?: number
  dailyPrice: number
  basePrice: number
  weekendSurchargeTotal: number
  holidaySurchargeTotal?: number
  locationSurcharge?: number
  oneWayFee?: number
  deliveryFee: number
  pickupFee?: number
  afterHoursFee?: number
  addonFee: number
  discountRate: number
  discountAmount: number
  promoCode?: string | null
  promoDiscountAmount?: number
  promoName?: string | null
  promoStatus?: string | null
  promoMessage?: string | null
  promoError?: string | null
  pricingRuleScope?: string | null
  pricingRuleCode?: string | null
  estimatedTotal: number
  depositAmount: number
  reservationDepositAmount?: number
  initialPaymentDue: number
  remainingAmount: number
  kmLimitPerDay: number | null
  overKmFee: number | null
  lateReturnFeePerHour: number | null
  startDate: string
  endDate: string
}

export type StatusHistoryItem = {
  status: string
  changedAt: string
  changedBy?: string | null
  note?: string | null
}

export type BookingFieldChange = {
  field: string
  label: string
  before: string | null
  after: string | null
}

export type BookingModificationItem = {
  modifiedAt: string
  modifiedBy?: string | null
  actorType?: string | null
  statusAtChange?: string | null
  reason?: string | null
  previousTotalPrice: number
  newTotalPrice: number
  previousDeposit: number
  newDeposit: number
  changes: BookingFieldChange[]
}

export type ConsultationLogItem = {
  contactedAt: string
  staffName: string | null
  outcome: string
  note: string | null
  nextCallbackAt: string | null
}

export type ConsultationView = {
  id: string
  bookingId: string
  bookingKey: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  vehicleName: string
  startDate: string
  endDate: string
  approvedAt: string
  approvedBy: string | null
  expectedContactDate: string
  workingHoursWindow: string | null
  isUrgent: boolean
  assignedStaffId: string | null
  assignedStaffName: string | null
  status: string
  callbackScheduledAt: string | null
  internalNote: string | null
  contactLogs: ConsultationLogItem[]
  createdAt: string
}

export type NotificationView = {
  id: string
  type: string
  title: string
  message: string
  bookingId: string | null
  bookingKey: string | null
  bookingStatus: string | null
  vehicleName: string | null
  startDate: string | null
  endDate: string | null
  pickupTime: string | null
  returnTime: string | null
  expectedContactDate: string | null
  workingHoursLabel: string | null
  customerPhoneMasked: string | null
  hotline: string | null
  isUrgent: boolean
  paymentConfirmed: boolean
  superseded: boolean
  isRead: boolean
  readAt: string | null
  popupDismissed: boolean
  createdAt: string
}

export type PaymentItemView = {
  id: string
  reference: string
  bookingId?: string | null
  bookingKey?: string | null
  customerId?: string | null
  customerName?: string | null
  paymentType: string
  method: string
  provider: string
  environment: string
  amount: number
  expectedAmount: number
  receivedAmount: number
  refundedAmount: number
  overpaidAmount: number
  status: string
  reconciliationStatus: string
  providerTransactionId?: string | null
  providerPaymentRef?: string | null
  qrImageUrl?: string | null
  paymentUrl?: string | null
  bankCode?: string | null
  bankAccountNumber?: string | null
  bankAccountName?: string | null
  transferContent?: string | null
  expiresAt?: string | null
  verifiedAt?: string | null
  paidAt?: string | null
  recordedBy?: string | null
  failureReason?: string | null
  reconciliationNote?: string | null
  note?: string | null
  createdAt: string
}

export type RefundItemView = {
  id: string
  reference: string
  bookingId: string
  bookingKey?: string | null
  paymentId?: string | null
  paymentReference?: string | null
  customerName?: string | null
  refundType: string
  amount: number
  reason: string
  status: string
  provider: string
  providerRefundId?: string | null
  requestedBy?: string | null
  approvedBy?: string | null
  completedBy?: string | null
  requestedAt?: string | null
  approvedAt?: string | null
  completedAt?: string | null
  reconciliationNote?: string | null
  bankAccountInfo?: string | null
  createdAt: string
}

export type PaymentEventView = {
  id: string
  eventId: string
  provider: string
  environment: string
  externalTransactionId?: string | null
  paymentReference?: string | null
  eventType: string
  transferAmount: number
  verificationResult: string
  processingStatus: string
  retryCount: number
  receivedAt: string
  processedAt?: string | null
  errorReason?: string | null
  paymentId?: string | null
  bookingId?: string | null
  sanitizedPayload?: string | null
}

export type BookingFinancialView = {
  reservationDepositRequired: number
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
  remainingDepositDue: number
  remainingRentalBeforeExtra: number
  remainingExtraFeeDue: number
  totalRemainingRentalObligation: number
  remainingSecurityDepositDue: number
  refundableBalance: number
  paymentStatusSummary: string
  hasPendingPayment: boolean
  hasAnomaly: boolean
  activePendingPaymentId: string | null
}

export type BookingView = {
  id: string
  bookingKey: string
  revision?: number
  status: string
  modelName: string
  modelSlug?: string
  reference: string
  vehicleId?: string
  customerId?: string
  customerEmail?: string | null
  startDate: string
  endDate: string
  pickupTime: string
  returnTime: string
  pickupLocation: string | null
  returnLocation?: string | null
  pickupBranchId?: string | null
  pickupBranchName?: string | null
  returnBranchId?: string | null
  returnBranchName?: string | null
  pickupServiceLocationId?: string | null
  returnServiceLocationId?: string | null
  isOneWay?: boolean
  pickupMethod?: string
  returnMethod?: string
  deliveryZoneId?: string | null
  deliveryAddress?: string | null
  pickupAddress?: string | null
  deliveryContactName?: string | null
  deliveryContactPhone?: string | null
  deliveryDirections?: string | null
  deliveryRequested: boolean
  addonServices: string | null
  customerPhone?: string | null
  driverLicenseNumber?: string | null
  note?: string | null
  totalDays: number
  dailyPriceSnapshot: number
  baseRentPrice: number
  weekendSurchargeTotal: number
  locationSurchargeSnapshot?: number
  oneWayFeeSnapshot?: number
  deliveryFeeSnapshot: number
  pickupFeeSnapshot?: number
  afterHoursFeeSnapshot?: number
  addonFeeTotal: number
  discountAmount: number
  extraFee?: number
  extraFeeNote?: string | null
  contractNumber?: string | null
  returnOdometer?: number | null
  returnCondition?: string | null
  returnFuelOrBattery?: string | null
  returnInspectionStatus?: string | null
  actualReturnBranchId?: string | null
  actualReturnWarehouseId?: string | null
  scheduleConflictAlert?: string | null
  promoCode?: string | null
  promoDiscountAmount?: number
  totalPrice: number
  paymentOption?: 'DEPOSIT' | 'FULL' | null
  reservationDepositSnapshot?: number | null
  depositSnapshot: number
  initialPaymentDue: number
  remainingAmount: number
  handoverNote?: string | null
  expectedContactDate?: string | null
  workingHoursSnapshot?: string | null
  isUrgentApproval?: boolean
  hasPaymentRecord?: boolean
  paymentConfirmed?: boolean
  paymentStatusSummary?: string
  financial?: BookingFinancialView
  payments?: PaymentItemView[]
  refunds?: RefundItemView[]
  canModify?: boolean
  modifyLockReason?: string | null
  statusHistory?: StatusHistoryItem[]
  modificationHistory?: BookingModificationItem[]
  consultation?: ConsultationView | null
  depositExpired?: boolean
  createdAt: string
  customerName?: string
}

export type ReviewView = {
  id: string
  rating: number
  title: string | null
  comment: string
  customerName: string
  vehicleReference: string | null
  createdAt: string
}

export type InquiryView = {
  id: string
  reference: string
  inquiryType: string
  status: string
  modelName: string
  modelSlug: string
  vehicleReference: string | null
  variantName: string | null
  colorName: string | null
  paymentMethod: string | null
  preferredDate: string | null
  preferredLocation: string | null
  quotedPriceSnapshot: number | null
  estimatedRollingSnapshot: number | null
  phone?: string
  note?: string | null
  adminNote?: string | null
  statusHistory?: StatusHistoryItem[]
  depositExpired?: boolean
  customerName?: string
  customerEmail?: string
  createdAt: string
}

export type CustomerSummary = {
  id: string
  fullName: string
  email: string
  phone: string | null
  status: string
  createdAt: string
}

export type FleetStats = {
  byOperationStatus: Record<string, number>
  utilizationRate: number
  completedContractValue: number
  activeContractValue: number
  expiredDepositCount: number
  confirmedRevenue?: number
}

export type DashboardVehicleSummary = {
  id: string
  reference: string
  licensePlate: string | null
  modelName: string
  modelSlug: string
  intent: string
  operationStatus: string
  status: string
  pricePerDay: number | null
  salePrice: number | null
  depositAmount: number | null
  odometer: number | null
  isDemo: boolean
}

export type DashboardReviewSummary = {
  id: string
  rating: number
  title: string | null
  comment: string
  status: string
  customerName: string
  modelName: string
  vehicleReference: string | null
  createdAt: string
}

export type AdminSummary = {
  id: string
  email: string
  fullName: string | null
  adminRole: 'SUPER_ADMIN' | 'OPERATOR'
  permissions?: Record<string, string[]> | null
  createdAt: string
}

export type AuditLogSummary = {
  id: string
  action: string
  entity: string
  entityId: string | null
  entityLabel: string | null
  summary: string
  fromStatus: string | null
  toStatus: string | null
  actorType: string
  actorEmail: string | null
  createdAt: string
}

export type TimeSeriesPoint = {
  date: string
  bookings: number
  inquiries: number
  expectedValue: number
}

export type PublicBranchOption = {
  id: string
  code: string
  name: string
  province: string
  ward: string | null
  address: string
  hotline: string | null
  operatingHoursLabel: string | null
  workStartTime: string
  workEndTime: string
  supportsHomeDelivery: boolean
  supportsHomePickup: boolean
  deliveryStartTime: string
  deliveryEndTime: string
  defaultDeliveryFee: number | null
  defaultPickupFee: number | null
  afterHoursFee: number | null
  freeDeliveryMinOrder: number | null
  status: string
}

export type PublicServiceLocationOption = {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string
  locationType: string
  address: string
  province: string | null
  operatingHours: string | null
  openTime: string
  closeTime: string
  pickupInstructions: string | null
  returnInstructions: string | null
  supportsPickup: boolean
  supportsReturn: boolean
  supportsHomeDelivery: boolean
  supportsHomePickup: boolean
  supportedCategories: string[]
  surchargeFee: number | null
}

export type PublicDeliveryZoneOption = {
  id: string
  code: string
  name: string
  branchId: string
  province: string
  wards: string | null
  deliveryFee: number
  pickupFee: number
  afterHoursFee: number
  freeOverOrderAmount: number | null
  serviceStartTime: string
  serviceEndTime: string
}

export type PublicOneWayRuleOption = {
  id: string
  fromBranchId: string
  toBranchId: string
  vehicleCategory: string
  allowed: boolean
  fee: number
  minRentalDays: number
}

export type PublicLocationsPayload = {
  branches: PublicBranchOption[]
  locations: PublicServiceLocationOption[]
  deliveryZones: PublicDeliveryZoneOption[]
  oneWayRules: PublicOneWayRuleOption[]
}
