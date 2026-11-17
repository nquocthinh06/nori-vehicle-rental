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
  operationStatus: string
  photos: { image: Photo; caption: string | null; kind: string | null }[]
}

export type Quote = {
  available: boolean
  totalDays: number
  weekendDays: number
  holidayDays?: number
  dailyPrice: number
  basePrice: number
  weekendSurchargeTotal: number
  holidaySurchargeTotal?: number
  deliveryFee: number
  addonFee: number
  discountRate: number
  discountAmount: number
  promoDiscountAmount?: number
  promoName?: string | null
  promoError?: string | null
  estimatedTotal: number
  depositAmount: number
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

export type BookingView = {
  id: string
  bookingKey: string
  status: string
  modelName: string
  reference: string
  vehicleId?: string
  customerId?: string
  customerEmail?: string
  startDate: string
  endDate: string
  pickupTime: string
  returnTime: string
  pickupLocation: string | null
  deliveryRequested: boolean
  addonServices: string | null
  customerPhone?: string | null
  driverLicenseNumber?: string | null
  note?: string | null
  totalDays: number
  dailyPriceSnapshot: number
  baseRentPrice: number
  weekendSurchargeTotal: number
  deliveryFeeSnapshot: number
  addonFeeTotal: number
  discountAmount: number
  extraFee?: number
  extraFeeNote?: string | null
  contractNumber?: string | null
  returnOdometer?: number | null
  returnCondition?: string | null
  promoCode?: string | null
  promoDiscountAmount?: number
  totalPrice: number
  depositSnapshot: number
  initialPaymentDue: number
  remainingAmount: number
  handoverNote?: string | null
  statusHistory?: StatusHistoryItem[]
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
