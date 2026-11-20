import { APIError, type CollectionConfig } from 'payload'
import {
  adminField,
  adminHasAnyPermission,
  adminHasPermission,
  branchScopedWhere,
  customerOnly,
  serverField,
} from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import {
  detectReturnScheduleConflicts,
  evaluateVehicleBookingAvailabilityAndPricing,
  recordVehicleLocationEvent,
} from '@/lib/multi-branch-service'
import type { PickupMethod, ReturnMethod } from '@/lib/multi-branch-rules'
import { dispatchBookingConfirmationNotice } from '@/lib/notifications'
import {
  consumePromoSlotAtomically,
  promoErrorHttpStatus,
  releasePromoSlotAtomically,
} from '@/lib/promo-service'
import {
  BOOKING_CONFIRMED_LOCK_MESSAGE,
  bookingStatusLabels,
  businessToday,
  calculateBookingFinancialSummary,
  calculateNextContactSlot,
  calculateReservationDeposit,
  canModifyBooking,
  canTransition,
  checkHandoverFinancialEligibility,
  checkSettlementCompletionEligibility,
  computeRentalDayDiff,
  formatDate,
  formatVnd,
  maskPhone,
  parseAddonKeys,
  relationId,
  rentalDays,
  validateRentalDates,
  validateTimeString,
  type BookingStatus,
} from '@/lib/rental-rules'

const bookingAudit = auditCollection({
  entity: 'booking',
  entityName: 'đơn thuê',
  label: (doc) => String(doc.bookingKey ?? doc.id),
  statusField: 'status',
  statusLabels: bookingStatusLabels,
  fields: {
    handoverNote: 'Ghi chú giao nhận',
    extraFee: 'Phụ phí phát sinh',
    extraFeeNote: 'Lý do phụ phí',
  },
})

export const Bookings: CollectionConfig = {
  slug: 'bookings',
  labels: { singular: 'Đơn thuê', plural: 'Đơn thuê xe' },
  admin: {
    useAsTitle: 'bookingKey',
    group: 'NORI · Vận hành',
    defaultColumns: [
      'bookingKey',
      'customer',
      'vehicle',
      'startDate',
      'endDate',
      'totalPrice',
      'status',
    ],
  },
  access: {
    create: customerOnly,
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['bookings', 'read'],
          ['customers', 'read'],
          ['payments', 'read'],
          ['deliveries', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['pickupBranch', 'returnBranch'])
      }
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    update: ({ req }) => {
      if (adminHasPermission(req.user, 'bookings', 'update')) {
        return branchScopedWhere(req.user, ['pickupBranch', 'returnBranch'])
      }
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation === 'create') {
          if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE')
            throw new APIError('Vui lòng đăng nhập tài khoản khách hàng.', 401)
          const dates = validateRentalDates(
            String(data.startDate ?? ''),
            String(data.endDate ?? ''),
          )
          if (dates.error || !dates.totalDays)
            throw new APIError(dates.error ?? 'Ngày thuê không hợp lệ.', 400)
          if (
            typeof data.pickupTime === 'string' &&
            data.pickupTime.trim() &&
            !validateTimeString(data.pickupTime.trim())
          ) {
            throw new APIError('Giờ nhận xe không hợp lệ (định dạng HH:MM).', 400)
          }
          if (
            typeof data.returnTime === 'string' &&
            data.returnTime.trim() &&
            !validateTimeString(data.returnTime.trim())
          ) {
            throw new APIError('Giờ trả xe không hợp lệ (định dạng HH:MM).', 400)
          }
          const rawPhone =
            typeof data.customerPhone === 'string' ? data.customerPhone.trim().slice(0, 16) : ''
          if (rawPhone && !/^[0-9+\s()-]{8,16}$/.test(rawPhone)) {
            throw new APIError('Số điện thoại liên hệ không hợp lệ.', 400)
          }
          const rawEmail =
            typeof data.customerEmail === 'string'
              ? data.customerEmail.trim().toLowerCase().slice(0, 254)
              : ''
          if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
            throw new APIError('Địa chỉ email liên hệ không hợp lệ.', 400)
          }
          const vehicleID = relationId(data.vehicle)
          if (!vehicleID) throw new APIError('Vui lòng chọn xe thực tế.', 400)
          const vehicle = await req.payload.findByID({
            collection: 'vehicles',
            id: vehicleID,
            req,
            user: req.user,
            overrideAccess: false,
            depth: 0,
          })
          if (
            vehicle.status !== 'ACTIVE' ||
            vehicle.intent === 'SALE' ||
            !vehicle.pricePerDay ||
            vehicle.operationStatus === 'SOLD' ||
            vehicle.operationStatus === 'MAINTENANCE' ||
            vehicle.operationStatus === 'INACTIVE' ||
            vehicle.operationStatus === 'RESERVED'
          )
            throw new APIError('Xe chưa có giá thuê hoặc chưa sẵn sàng nhận đặt mới.', 409)
          const purchaseHoldCount = await req.payload.count({
            collection: 'sales-inquiries',
            overrideAccess: true,
            req,
            where: {
              and: [
                { vehicle: { equals: vehicle.id } },
                { status: { in: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED', 'DELIVERED'] } },
              ],
            },
          })
          if (purchaseHoldCount.totalDocs > 0) {
            throw new APIError(
              'Xe đang được giữ hồ sơ mua hoặc đã bán, không nhận đơn thuê mới.',
              409,
            )
          }
          const maintenanceOverlap = await req.payload.find({
            collection: 'maintenance-schedules',
            overrideAccess: true,
            req,
            depth: 0,
            limit: 50,
            where: {
              and: [
                { vehicle: { equals: vehicle.id } },
                { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
              ],
            },
          })
          if (
            maintenanceOverlap.docs.some(
              (m) => m.startDate <= String(data.endDate) && m.endDate >= String(data.startDate),
            )
          ) {
            throw new APIError(
              'Xe đang có lịch bảo trì / bảo dưỡng trong khoảng ngày này. Vui lòng chọn ngày khác.',
              409,
            )
          }
          let maxPending = 5
          try {
            const site = (await req.payload.findGlobal({
              slug: 'nori-site',
              overrideAccess: true,
              req,
            })) as { maxPendingBookings?: number | null }
            const configured = Number(site?.maxPendingBookings)
            if (Number.isInteger(configured) && configured >= 1 && configured <= 50) {
              maxPending = configured
            }
          } catch {
            // fallback default 5 when global read fails
          }
          const userPendingCount = await req.payload.count({
            collection: 'bookings',
            overrideAccess: false,
            user: req.user,
            req,
            where: { status: { equals: 'PENDING' } },
          })
          if (userPendingCount.totalDocs >= maxPending) {
            throw new APIError(
              `Bạn đang có tối đa ${maxPending} đơn chờ xác nhận. Vui lòng hoàn tất hoặc hủy bớt trước khi đặt thêm.`,
              429,
            )
          }
          const modelID = relationId(vehicle.model)
          const model = await req.payload.findByID({
            collection: 'vehicle-models',
            id: modelID!,
            req,
            user: req.user,
            overrideAccess: false,
            depth: 0,
          })
          if (!model.visible) throw new APIError('Dòng xe chưa được công bố.', 409)
          const transactionID = await req.transactionID
          if (!transactionID)
            throw new APIError('Chưa thể giữ lịch an toàn. Vui lòng thử lại sau.', 503)

          const addonKeys = parseAddonKeys(data.addonServices)
          const pickupMethod: PickupMethod =
            data.pickupMethod === 'HOME_DELIVERY' || Boolean(data.deliveryRequested)
              ? 'HOME_DELIVERY'
              : 'BRANCH_PICKUP'
          const returnMethod: ReturnMethod =
            data.returnMethod === 'HOME_PICKUP' ? 'HOME_PICKUP' : 'BRANCH_RETURN'
          const deliveryRequested = pickupMethod === 'HOME_DELIVERY'
          const pickupTimeVal = validateTimeString(data.pickupTime)
            ? String(data.pickupTime)
            : '08:00'
          const returnTimeVal = validateTimeString(data.returnTime)
            ? String(data.returnTime)
            : '20:00'
          const deliveryAddress =
            typeof data.deliveryAddress === 'string'
              ? data.deliveryAddress.trim().slice(0, 300)
              : ''
          const pickupAddress =
            typeof data.pickupAddress === 'string' ? data.pickupAddress.trim().slice(0, 300) : ''

          const reqPickupBranchId = relationId(data.pickupBranch) ?? null
          const reqReturnBranchId = relationId(data.returnBranch) ?? null
          const reqPickupLocId = relationId(data.pickupServiceLocation) ?? null
          const reqReturnLocId = relationId(data.returnServiceLocation) ?? null
          const reqDeliveryZoneId = relationId(data.deliveryZone) ?? null

          if (pickupMethod === 'HOME_DELIVERY' && (reqPickupBranchId || reqDeliveryZoneId)) {
            const effectiveAddr =
              deliveryAddress ||
              (typeof data.pickupLocation === 'string' ? data.pickupLocation.trim() : '')
            if (effectiveAddr.length < 5) {
              throw new APIError(
                'Vui lòng nhập địa chỉ giao xe tận nơi cụ thể (tối thiểu 5 ký tự).',
                400,
              )
            }
          }
          if (returnMethod === 'HOME_PICKUP') {
            const effectivePickupAddr = pickupAddress || deliveryAddress
            if (effectivePickupAddr.length < 5) {
              throw new APIError(
                'Vui lòng nhập địa chỉ thu hồi xe tận nơi cụ thể (tối thiểu 5 ký tự).',
                400,
              )
            }
          }

          const rawPromo =
            typeof data.promoCode === 'string' ? data.promoCode.trim().toUpperCase() : ''

          const evaluation = await evaluateVehicleBookingAvailabilityAndPricing(req.payload, {
            vehicleId: String(vehicle.id),
            startDate: String(data.startDate),
            endDate: String(data.endDate),
            pickupTime: pickupTimeVal,
            returnTime: returnTimeVal,
            pickupBranchId: reqPickupBranchId,
            returnBranchId: reqReturnBranchId,
            pickupServiceLocationId: reqPickupLocId,
            returnServiceLocationId: reqReturnLocId,
            pickupMethod,
            returnMethod,
            deliveryRequested,
            deliveryZoneId: reqDeliveryZoneId,
            deliveryAddress: deliveryAddress || null,
            pickupAddress: pickupAddress || null,
            addonKeys,
            promoCode: rawPromo || null,
            req,
            user: req.user,
          })

          if (!evaluation.available) {
            const statusCode = [
              'INVALID_DATES',
              'DELIVERY_ZONE_REQUIRED',
              'PICKUP_ZONE_REQUIRED',
              'DELIVERY_ZONE_BRANCH_MISMATCH',
              'DELIVERY_TIME_NOT_SUPPORTED',
              'BRANCH_OUTSIDE_OPERATING_HOURS',
              'ONE_WAY_MIN_DAYS_NOT_MET',
            ].includes(evaluation.reasonCode)
              ? 400
              : 409
            throw new APIError(
              evaluation.reason ?? 'Xe chưa khả dụng tại địa điểm hoặc thời gian đã chọn.',
              statusCode,
            )
          }
          if (!evaluation.quote) {
            throw new APIError('Chưa thể xác định đơn giá thuê hợp lệ cho phương tiện.', 409)
          }
          if (rawPromo && (!evaluation.promoEval?.valid || !evaluation.promoId)) {
            throw new APIError(
              evaluation.promoEval?.message ?? 'Mã khuyến mãi không đủ điều kiện áp dụng.',
              evaluation.promoEval ? promoErrorHttpStatus(evaluation.promoEval) : 400,
            )
          }

          const bookingKey = `NR-${crypto.randomUUID()}`
          for (const day of rentalDays(data.startDate, data.endDate)) {
            try {
              await req.payload.create({
                collection: 'rental-days',
                data: {
                  key: `${vehicle.id}:${day}`,
                  vehicle: vehicle.id,
                  day,
                  bookingKey,
                  lockType: 'BOOKING',
                  referenceId: bookingKey,
                  branchId: evaluation.pickupBranchId ?? undefined,
                } as never,
                req,
                overrideAccess: true,
              })
            } catch {
              throw new APIError(
                'Xe vừa được đặt trong khoảng ngày này. Vui lòng chọn ngày khác.',
                409,
              )
            }
          }

          let appliedPromoCode: string | undefined
          if (rawPromo && evaluation.promoId && evaluation.promoCodeNormalized) {
            await consumePromoSlotAtomically(req.payload, evaluation.promoId, req)
            appliedPromoCode = evaluation.promoCodeNormalized
          }

          const finalQuote = evaluation.quote
          const expectedTotalPrice = req.context?.expectedTotalPrice
          if (
            typeof expectedTotalPrice === 'number' &&
            Number.isSafeInteger(expectedTotalPrice) &&
            expectedTotalPrice !== finalQuote.estimatedTotal
          ) {
            throw new APIError(
              `Chi phí thuê hoặc mức ưu đãi vừa được cập nhật (tổng mới: ${formatVnd(finalQuote.estimatedTotal)}). Vui lòng kiểm tra lại báo giá trước khi xác nhận.`,
              409,
            )
          }
          const pickupLoc =
            typeof data.pickupLocation === 'string' && data.pickupLocation.trim()
              ? data.pickupLocation.trim().slice(0, 200)
              : (evaluation.pickupLocationLabel ?? vehicle.pickupLocation ?? vehicle.location ?? '')
          const returnLoc =
            typeof data.returnLocation === 'string' && data.returnLocation.trim()
              ? data.returnLocation.trim().slice(0, 200)
              : (evaluation.returnLocationLabel ?? pickupLoc)
          const custPhone =
            rawPhone || (req.user.phone ? String(req.user.phone).trim().slice(0, 16) : undefined)
          const custEmail = rawEmail || (req.user.email ?? undefined)
          const idempotencyKey =
            typeof data.idempotencyKey === 'string' && data.idempotencyKey.trim()
              ? data.idempotencyKey.trim().slice(0, 120)
              : undefined

          const chosenPaymentOption = data.paymentOption === 'FULL' ? 'FULL' : 'DEPOSIT'
          const reservationDepositRequired = calculateReservationDeposit(
            finalQuote.estimatedTotal,
            { policyMode: 'PERCENT_OF_RENTAL', depositPercent: 30 },
          )
          const calculatedInitialDue =
            chosenPaymentOption === 'FULL' ? finalQuote.estimatedTotal : reservationDepositRequired
          const calculatedRemainingAmount =
            chosenPaymentOption === 'FULL'
              ? 0
              : Math.max(0, finalQuote.estimatedTotal - reservationDepositRequired)

          return {
            ...data,
            customer: req.user.id,
            bookingKey,
            status: 'PENDING',
            revision: 1,
            pickupTime: pickupTimeVal,
            returnTime: returnTimeVal,
            pickupLocation: pickupLoc,
            returnLocation: returnLoc,
            pickupBranch: evaluation.pickupBranchId ?? undefined,
            returnBranch: evaluation.returnBranchId ?? undefined,
            pickupServiceLocation: evaluation.pickupServiceLocationId ?? undefined,
            returnServiceLocation: evaluation.returnServiceLocationId ?? undefined,
            isOneWay: evaluation.isOneWay,
            pickupMethod,
            returnMethod,
            deliveryZone: evaluation.deliveryZoneId ?? undefined,
            deliveryAddress: deliveryAddress || undefined,
            pickupAddress: pickupAddress || undefined,
            deliveryContactName:
              typeof data.deliveryContactName === 'string' && data.deliveryContactName.trim()
                ? data.deliveryContactName.trim().slice(0, 120)
                : req.user.fullName,
            deliveryContactPhone:
              typeof data.deliveryContactPhone === 'string' && data.deliveryContactPhone.trim()
                ? data.deliveryContactPhone.trim().slice(0, 20)
                : custPhone,
            deliveryDirections:
              typeof data.deliveryDirections === 'string' && data.deliveryDirections.trim()
                ? data.deliveryDirections.trim().slice(0, 500)
                : undefined,
            customerPhone: custPhone,
            customerEmail: custEmail,
            deliveryRequested,
            addonServices: addonKeys.join(','),
            totalDays: finalQuote.totalDays,
            dailyPriceSnapshot: finalQuote.dailyPrice,
            baseRentPrice: finalQuote.basePrice,
            weekendSurchargeTotal:
              finalQuote.weekendSurchargeTotal + finalQuote.holidaySurchargeTotal,
            locationSurchargeSnapshot: finalQuote.locationSurcharge,
            oneWayFeeSnapshot: finalQuote.oneWayFee,
            deliveryFeeSnapshot: finalQuote.deliveryFee,
            pickupFeeSnapshot: finalQuote.pickupFee,
            afterHoursFeeSnapshot: finalQuote.afterHoursFee,
            addonFeeTotal: finalQuote.addonFee,
            discountAmount: finalQuote.discountAmount,
            promoCode: appliedPromoCode,
            promoDiscountAmount: finalQuote.promoDiscountAmount,
            totalPrice: finalQuote.estimatedTotal,
            paymentOption: chosenPaymentOption,
            reservationDepositSnapshot: reservationDepositRequired,
            depositSnapshot: finalQuote.depositAmount,
            initialPaymentDue: calculatedInitialDue,
            remainingAmount: calculatedRemainingAmount,
            pricingRuleSnapshot: evaluation.pricingRuleSnapshot,
            revenueAttributionBranch: evaluation.pickupBranchId ?? undefined,
            revenueSplitPickupPercent: evaluation.revenueSplitPickupPercent,
            returnInspectionStatus: 'NOT_APPLICABLE',
            idempotencyKey,
            vehicleNameSnapshot: model.name,
            vehicleReferenceSnapshot: vehicle.reference,
            modificationHistory: [],
            statusHistory: [
              {
                status: 'PENDING',
                changedAt: new Date().toISOString(),
                changedBy: req.user.email ?? 'Khách hàng',
                note: evaluation.isOneWay
                  ? 'Khách hàng tạo yêu cầu thuê xe trả khác chi nhánh (One-way)'
                  : 'Khách hàng tạo yêu cầu thuê xe',
              },
            ],
          }
        }

        // ====================================================================
        // UPDATE OPERATION (Customer Modify vs Customer Cancel vs Admin/System Transition)
        // ====================================================================
        const isSystemPaymentSync = req.context?.noriSystemPaymentSync === true
        const actor =
          req.user?.collection === 'admins' || isSystemPaymentSync ? 'admin' : 'customer'
        if (
          actor === 'customer' &&
          (req.user?.collection !== 'users' ||
            req.user.status !== 'ACTIVE' ||
            relationId(originalDoc.customer) !== req.user.id)
        )
          throw new APIError('Không tìm thấy đơn thuê.', 404)

        // Branch 1: Customer Direct Modification while PENDING
        if (actor === 'customer' && req.context.noriCustomerModify === true) {
          const transactionID = await req.transactionID
          if (!transactionID)
            throw new APIError('Chưa thể cập nhật lịch an toàn. Vui lòng thử lại sau.', 503)

          const freshBooking = await req.payload.findByID({
            collection: 'bookings',
            id: originalDoc.id,
            req,
            overrideAccess: true,
            depth: 0,
          })
          const currentRevision = Number(freshBooking.revision ?? originalDoc.revision ?? 1)
          if (
            typeof req.context.expectedRevision === 'number' &&
            req.context.expectedRevision !== currentRevision
          ) {
            if (freshBooking.status !== 'PENDING') {
              throw new APIError(BOOKING_CONFIRMED_LOCK_MESSAGE, 409)
            }
            throw new APIError(
              'Thông tin đơn thuê vừa được cập nhật từ phiên làm việc khác. Vui lòng tải lại dữ liệu mới nhất trước khi lưu.',
              409,
            )
          }

          const paymentCount = await req.payload.count({
            collection: 'payments',
            req,
            overrideAccess: true,
            where: {
              and: [
                { booking: { equals: originalDoc.id } },
                {
                  status: {
                    in: [
                      'PENDING',
                      'PROCESSING',
                      'CONFIRMED',
                      'PARTIALLY_PAID',
                      'REVIEW_REQUIRED',
                      'REFUND_PENDING',
                      'PARTIALLY_REFUNDED',
                      'REFUNDED',
                    ],
                  },
                },
              ],
            },
          })
          const modifyEligibility = canModifyBooking({
            status: String(freshBooking.status ?? originalDoc.status),
            isLoggedIn: true,
            isOwner: true,
            hasPaymentRecord: paymentCount.totalDocs > 0,
          })
          if (!modifyEligibility.allowed) {
            throw new APIError(modifyEligibility.reason ?? BOOKING_CONFIRMED_LOCK_MESSAGE, 409)
          }

          const modInput = (req.context.noriModifyPayload ?? {}) as Record<string, unknown>
          const nextStartDate =
            modInput.startDate !== undefined
              ? String(modInput.startDate).trim()
              : String(originalDoc.startDate)
          const nextEndDate =
            modInput.endDate !== undefined
              ? String(modInput.endDate).trim()
              : String(originalDoc.endDate)
          const dates = validateRentalDates(nextStartDate, nextEndDate)
          if (dates.error || !dates.totalDays) {
            throw new APIError(dates.error ?? 'Ngày thuê mới không hợp lệ.', 400)
          }

          const nextPickupTime =
            modInput.pickupTime !== undefined
              ? String(modInput.pickupTime).trim()
              : String(originalDoc.pickupTime ?? '08:00')
          const nextReturnTime =
            modInput.returnTime !== undefined
              ? String(modInput.returnTime).trim()
              : String(originalDoc.returnTime ?? '20:00')
          if (!validateTimeString(nextPickupTime) || !validateTimeString(nextReturnTime)) {
            throw new APIError('Giờ nhận hoặc giờ trả xe không hợp lệ (định dạng HH:MM).', 400)
          }

          const oldVehicleID = String(relationId(originalDoc.vehicle))
          const nextVehicleID =
            modInput.vehicle !== undefined && String(modInput.vehicle).trim()
              ? String(modInput.vehicle).trim()
              : oldVehicleID

          const vehicle = await req.payload.findByID({
            collection: 'vehicles',
            id: nextVehicleID,
            req,
            user: req.user,
            overrideAccess: false,
            depth: 0,
          })
          if (
            !vehicle ||
            vehicle.status !== 'ACTIVE' ||
            vehicle.intent === 'SALE' ||
            !vehicle.pricePerDay ||
            vehicle.operationStatus === 'SOLD' ||
            vehicle.operationStatus === 'MAINTENANCE' ||
            vehicle.operationStatus === 'INACTIVE' ||
            vehicle.operationStatus === 'RESERVED'
          ) {
            throw new APIError('Phương tiện chưa sẵn sàng nhận lịch thuê mới.', 409)
          }

          const [purchaseHoldCount, maintenanceOverlap] = await Promise.all([
            req.payload.count({
              collection: 'sales-inquiries',
              overrideAccess: true,
              req,
              where: {
                and: [
                  { vehicle: { equals: vehicle.id } },
                  { status: { in: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED', 'DELIVERED'] } },
                ],
              },
            }),
            req.payload.find({
              collection: 'maintenance-schedules',
              overrideAccess: true,
              req,
              depth: 0,
              limit: 50,
              where: {
                and: [
                  { vehicle: { equals: vehicle.id } },
                  { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
                ],
              },
            }),
          ])
          if (purchaseHoldCount.totalDocs > 0) {
            throw new APIError('Phương tiện đang được giữ hồ sơ mua, không thể chuyển lịch.', 409)
          }
          if (
            maintenanceOverlap.docs.some(
              (m) => m.startDate <= nextEndDate && m.endDate >= nextStartDate,
            )
          ) {
            throw new APIError(
              'Phương tiện có lịch bảo trì định kỳ trong khoảng thời gian mới. Vui lòng chọn ngày khác.',
              409,
            )
          }

          const modelID = relationId(vehicle.model)
          const model = await req.payload.findByID({
            collection: 'vehicle-models',
            id: modelID!,
            req,
            user: req.user,
            overrideAccess: false,
            depth: 0,
          })
          if (!model?.visible) throw new APIError('Dòng xe chưa được công bố.', 409)

          const nextPickupBranchId =
            modInput.pickupBranch !== undefined
              ? String(modInput.pickupBranch ?? '').trim() || null
              : (relationId(originalDoc.pickupBranch) ?? null)
          const nextReturnBranchId =
            modInput.returnBranch !== undefined
              ? String(modInput.returnBranch ?? '').trim() || null
              : (relationId(originalDoc.returnBranch) ?? nextPickupBranchId)
          const nextPickupLocId =
            modInput.pickupServiceLocation !== undefined
              ? String(modInput.pickupServiceLocation ?? '').trim() || null
              : (relationId(originalDoc.pickupServiceLocation) ?? null)
          const nextReturnLocId =
            modInput.returnServiceLocation !== undefined
              ? String(modInput.returnServiceLocation ?? '').trim() || null
              : (relationId(originalDoc.returnServiceLocation) ?? null)
          const nextDeliveryZoneId =
            modInput.deliveryZone !== undefined
              ? String(modInput.deliveryZone ?? '').trim() || null
              : (relationId(originalDoc.deliveryZone) ?? null)
          const nextDeliveryRequested =
            modInput.deliveryRequested !== undefined
              ? Boolean(modInput.deliveryRequested)
              : Boolean(originalDoc.deliveryRequested)
          const nextPickupMethod: PickupMethod =
            modInput.pickupMethod !== undefined
              ? modInput.pickupMethod === 'HOME_DELIVERY'
                ? 'HOME_DELIVERY'
                : 'BRANCH_PICKUP'
              : nextDeliveryRequested
                ? 'HOME_DELIVERY'
                : originalDoc.pickupMethod === 'HOME_DELIVERY'
                  ? 'HOME_DELIVERY'
                  : 'BRANCH_PICKUP'
          const nextReturnMethod: ReturnMethod =
            modInput.returnMethod !== undefined
              ? modInput.returnMethod === 'HOME_PICKUP'
                ? 'HOME_PICKUP'
                : 'BRANCH_RETURN'
              : originalDoc.returnMethod === 'HOME_PICKUP'
                ? 'HOME_PICKUP'
                : 'BRANCH_RETURN'
          const nextDeliveryAddress =
            modInput.deliveryAddress !== undefined
              ? String(modInput.deliveryAddress ?? '')
                  .trim()
                  .slice(0, 300)
              : String(originalDoc.deliveryAddress ?? '')
          const nextPickupAddress =
            modInput.pickupAddress !== undefined
              ? String(modInput.pickupAddress ?? '')
                  .trim()
                  .slice(0, 300)
              : String(originalDoc.pickupAddress ?? '')
          const nextPickupLocation =
            modInput.pickupLocation !== undefined
              ? String(modInput.pickupLocation ?? '')
                  .trim()
                  .slice(0, 200)
              : String(originalDoc.pickupLocation ?? '')
          const nextReturnLocation =
            modInput.returnLocation !== undefined
              ? String(modInput.returnLocation ?? '')
                  .trim()
                  .slice(0, 200)
              : String(originalDoc.returnLocation ?? originalDoc.pickupLocation ?? '')
          const nextAddonKeys =
            modInput.addonServices !== undefined
              ? parseAddonKeys(modInput.addonServices as string | string[])
              : parseAddonKeys(originalDoc.addonServices)
          const nextAddonServices = nextAddonKeys.join(',')
          const nextCustomerPhone =
            modInput.customerPhone !== undefined
              ? String(modInput.customerPhone ?? '')
                  .trim()
                  .slice(0, 16)
              : String(originalDoc.customerPhone ?? '')
          if (nextCustomerPhone && !/^[0-9+\s()-]{8,16}$/.test(nextCustomerPhone)) {
            throw new APIError('Số điện thoại liên hệ không hợp lệ.', 400)
          }
          const nextCustomerEmail =
            modInput.customerEmail !== undefined
              ? String(modInput.customerEmail ?? '')
                  .trim()
                  .toLowerCase()
                  .slice(0, 254)
              : String(originalDoc.customerEmail ?? req.user?.email ?? '')
          if (nextCustomerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextCustomerEmail)) {
            throw new APIError('Địa chỉ email liên hệ không hợp lệ.', 400)
          }
          const nextNote =
            modInput.note !== undefined
              ? String(modInput.note ?? '')
                  .trim()
                  .slice(0, 500)
              : String(originalDoc.note ?? '')
          const changeReason =
            typeof modInput.reason === 'string' && modInput.reason.trim()
              ? modInput.reason.trim().slice(0, 300)
              : undefined

          const oldPromo = String(originalDoc.promoCode ?? '')
            .trim()
            .toUpperCase()
          const nextRawPromo =
            modInput.promoCode !== undefined
              ? String(modInput.promoCode ?? '')
                  .trim()
                  .toUpperCase()
              : oldPromo

          // Build field-level diff
          const changes: { field: string; label: string; before: string; after: string }[] = []
          const pushDiff = (
            field: string,
            label: string,
            beforeVal: unknown,
            afterVal: unknown,
          ) => {
            const b = String(beforeVal ?? '').trim()
            const a = String(afterVal ?? '').trim()
            if (b !== a) {
              changes.push({
                field,
                label,
                before: b || 'Trống',
                after: a || 'Trống',
              })
            }
          }

          if (oldVehicleID !== nextVehicleID) {
            pushDiff(
              'vehicle',
              'Phương tiện',
              originalDoc.vehicleReferenceSnapshot ?? oldVehicleID,
              vehicle.reference,
            )
          }
          pushDiff('startDate', 'Ngày nhận xe', originalDoc.startDate, nextStartDate)
          pushDiff('pickupTime', 'Giờ nhận xe', originalDoc.pickupTime ?? '08:00', nextPickupTime)
          pushDiff('endDate', 'Ngày trả xe', originalDoc.endDate, nextEndDate)
          pushDiff('returnTime', 'Giờ trả xe', originalDoc.returnTime ?? '20:00', nextReturnTime)
          pushDiff(
            'pickupLocation',
            'Địa điểm nhận xe',
            originalDoc.pickupLocation,
            nextPickupLocation,
          )
          pushDiff(
            'returnLocation',
            'Địa điểm trả xe',
            originalDoc.returnLocation ?? originalDoc.pickupLocation,
            nextReturnLocation,
          )
          pushDiff(
            'deliveryRequested',
            'Phương thức giao nhận',
            originalDoc.deliveryRequested ? 'Giao tận nơi' : 'Nhận tại bãi NORI',
            nextDeliveryRequested ? 'Giao tận nơi' : 'Nhận tại bãi NORI',
          )
          pushDiff('addonServices', 'Dịch vụ bổ sung', originalDoc.addonServices, nextAddonServices)
          pushDiff(
            'customerPhone',
            'Số điện thoại liên hệ',
            originalDoc.customerPhone,
            nextCustomerPhone,
          )
          pushDiff(
            'customerEmail',
            'Email liên hệ',
            originalDoc.customerEmail ?? req.user?.email,
            nextCustomerEmail,
          )
          pushDiff(
            'pickupBranch',
            'Chi nhánh nhận xe',
            relationId(originalDoc.pickupBranch),
            nextPickupBranchId,
          )
          pushDiff(
            'returnBranch',
            'Chi nhánh trả xe',
            relationId(originalDoc.returnBranch),
            nextReturnBranchId,
          )
          pushDiff(
            'pickupMethod',
            'Phương thức nhận xe',
            originalDoc.pickupMethod ?? 'BRANCH_PICKUP',
            nextPickupMethod,
          )
          pushDiff(
            'returnMethod',
            'Phương thức trả xe',
            originalDoc.returnMethod ?? 'BRANCH_RETURN',
            nextReturnMethod,
          )
          pushDiff(
            'deliveryZone',
            'Khu vực giao nhận',
            relationId(originalDoc.deliveryZone),
            nextDeliveryZoneId,
          )
          pushDiff(
            'deliveryAddress',
            'Địa chỉ giao xe',
            originalDoc.deliveryAddress,
            nextDeliveryAddress,
          )
          pushDiff(
            'pickupAddress',
            'Địa chỉ thu hồi xe',
            originalDoc.pickupAddress,
            nextPickupAddress,
          )
          pushDiff('note', 'Ghi chú hành trình', originalDoc.note, nextNote)
          pushDiff('promoCode', 'Mã khuyến mãi', oldPromo, nextRawPromo)

          if (changes.length === 0) {
            throw new APIError('Thông tin đơn thuê chưa có thay đổi nào để lưu.', 400)
          }

          // Re-evaluate multi-branch availability, one-way rules, delivery zones, location pricing & promo BEFORE touching locks
          const isSamePromo = nextRawPromo === oldPromo
          const modEval = await evaluateVehicleBookingAvailabilityAndPricing(req.payload, {
            vehicleId: String(vehicle.id),
            startDate: nextStartDate,
            endDate: nextEndDate,
            pickupTime: nextPickupTime,
            returnTime: nextReturnTime,
            pickupBranchId: nextPickupBranchId,
            returnBranchId: nextReturnBranchId,
            pickupServiceLocationId: nextPickupLocId,
            returnServiceLocationId: nextReturnLocId,
            pickupMethod: nextPickupMethod,
            returnMethod: nextReturnMethod,
            deliveryRequested: nextPickupMethod === 'HOME_DELIVERY',
            deliveryZoneId: nextDeliveryZoneId,
            deliveryAddress: nextDeliveryAddress || null,
            pickupAddress: nextPickupAddress || null,
            addonKeys: nextAddonKeys,
            promoCode: nextRawPromo || null,
            excludeBookingId: String(originalDoc.id),
            excludeBookingKey: String(originalDoc.bookingKey),
            alreadyHeldPromoCode: isSamePromo ? oldPromo : null,
            req,
            user: req.user,
          })
          if (!modEval.available || !modEval.quote) {
            throw new APIError(
              modEval.reason ??
                'Phương tiện không khả dụng với lựa chọn lịch trình hoặc địa điểm mới.',
              409,
            )
          }
          if (nextRawPromo && (!modEval.promoEval?.valid || !modEval.promoId)) {
            throw new APIError(
              modEval.promoEval?.message ?? 'Mã khuyến mãi không còn hợp lệ với lựa chọn mới.',
              modEval.promoEval ? promoErrorHttpStatus(modEval.promoEval) : 400,
            )
          }

          // Atomic rental-days swap: INSERT newly added days BEFORE deleting removed old days
          const dayDiff = computeRentalDayDiff(
            oldVehicleID,
            String(originalDoc.startDate),
            String(originalDoc.endDate),
            nextVehicleID,
            nextStartDate,
            nextEndDate,
          )
          for (const slot of dayDiff.toInsert) {
            try {
              await req.payload.create({
                collection: 'rental-days',
                data: {
                  key: slot.key,
                  vehicle: slot.vehicleId,
                  day: slot.day,
                  bookingKey: String(originalDoc.bookingKey),
                  lockType: 'BOOKING',
                  referenceId: String(originalDoc.bookingKey),
                  branchId: modEval.pickupBranchId ?? undefined,
                } as never,
                req,
                overrideAccess: true,
              })
            } catch {
              throw new APIError(
                'Xe đã có đơn thuê khác trùng lịch trong khoảng thời gian mới. Vui lòng chọn ngày khác.',
                409,
              )
            }
          }
          if (dayDiff.toDeleteKeys.length > 0) {
            await req.payload.delete({
              collection: 'rental-days',
              req,
              overrideAccess: true,
              where: {
                and: [
                  { bookingKey: { equals: originalDoc.bookingKey } },
                  { key: { in: dayDiff.toDeleteKeys } },
                ],
              },
            })
          }

          let appliedPromoCode: string | null = null
          if (nextRawPromo && modEval.promoId && modEval.promoCodeNormalized) {
            if (!isSamePromo) {
              await consumePromoSlotAtomically(req.payload, modEval.promoId, req)
            }
            appliedPromoCode = modEval.promoCodeNormalized
          }
          if (oldPromo && !isSamePromo) {
            await releasePromoSlotAtomically(req.payload, oldPromo, req)
          }

          const finalQuote = modEval.quote
          const expectedTotalPrice = req.context?.expectedTotalPrice
          if (
            typeof expectedTotalPrice === 'number' &&
            Number.isSafeInteger(expectedTotalPrice) &&
            expectedTotalPrice !== finalQuote.estimatedTotal
          ) {
            throw new APIError(
              `Chi phí thuê sau thay đổi vừa được cập nhật (tổng mới: ${formatVnd(finalQuote.estimatedTotal)}). Vui lòng kiểm tra lại báo giá trước khi lưu.`,
              409,
            )
          }
          const finalTotal = finalQuote.estimatedTotal
          const finalRemaining = finalQuote.remainingAmount
          const promoDiscountAmount = finalQuote.promoDiscountAmount
          const prevMods = Array.isArray(originalDoc.modificationHistory)
            ? originalDoc.modificationHistory
            : []
          const prevStatusHistory = Array.isArray(originalDoc.statusHistory)
            ? originalDoc.statusHistory
            : []
          const nowIso = new Date().toISOString()
          const actorLabel = req.user?.email ?? 'Khách hàng'

          return {
            ...originalDoc,
            ...data,
            customer: originalDoc.customer,
            bookingKey: originalDoc.bookingKey,
            vehicle: vehicle.id,
            startDate: nextStartDate,
            endDate: nextEndDate,
            pickupTime: nextPickupTime,
            returnTime: nextReturnTime,
            pickupLocation: nextPickupLocation || modEval.pickupLocationLabel || null,
            returnLocation: nextReturnLocation || modEval.returnLocationLabel || null,
            pickupBranch: modEval.pickupBranchId ?? null,
            returnBranch: modEval.returnBranchId ?? null,
            pickupServiceLocation: modEval.pickupServiceLocationId ?? null,
            returnServiceLocation: modEval.returnServiceLocationId ?? null,
            isOneWay: modEval.isOneWay,
            pickupMethod: nextPickupMethod,
            returnMethod: nextReturnMethod,
            deliveryZone: modEval.deliveryZoneId ?? null,
            deliveryAddress: nextDeliveryAddress || null,
            pickupAddress: nextPickupAddress || null,
            deliveryRequested: nextPickupMethod === 'HOME_DELIVERY',
            addonServices: nextAddonServices || null,
            customerPhone: nextCustomerPhone || null,
            customerEmail: nextCustomerEmail || null,
            note: nextNote || null,
            totalDays: finalQuote.totalDays,
            dailyPriceSnapshot: finalQuote.dailyPrice,
            baseRentPrice: finalQuote.basePrice,
            weekendSurchargeTotal:
              finalQuote.weekendSurchargeTotal + finalQuote.holidaySurchargeTotal,
            locationSurchargeSnapshot: finalQuote.locationSurcharge,
            oneWayFeeSnapshot: finalQuote.oneWayFee,
            deliveryFeeSnapshot: finalQuote.deliveryFee,
            pickupFeeSnapshot: finalQuote.pickupFee,
            afterHoursFeeSnapshot: finalQuote.afterHoursFee,
            addonFeeTotal: finalQuote.addonFee,
            discountAmount: finalQuote.discountAmount,
            promoCode: appliedPromoCode,
            promoDiscountAmount,
            totalPrice: finalTotal,
            paymentOption:
              (data.paymentOption ?? originalDoc.paymentOption ?? 'DEPOSIT') === 'FULL'
                ? 'FULL'
                : 'DEPOSIT',
            reservationDepositSnapshot: calculateReservationDeposit(finalTotal, {
              policyMode: 'PERCENT_OF_RENTAL',
              depositPercent: 30,
            }),
            depositSnapshot: finalQuote.depositAmount,
            initialPaymentDue:
              (data.paymentOption ?? originalDoc.paymentOption ?? 'DEPOSIT') === 'FULL'
                ? finalTotal
                : calculateReservationDeposit(finalTotal, {
                    policyMode: 'PERCENT_OF_RENTAL',
                    depositPercent: 30,
                  }),
            remainingAmount:
              (data.paymentOption ?? originalDoc.paymentOption ?? 'DEPOSIT') === 'FULL'
                ? 0
                : Math.max(
                    0,
                    finalTotal -
                      calculateReservationDeposit(finalTotal, {
                        policyMode: 'PERCENT_OF_RENTAL',
                        depositPercent: 30,
                      }),
                  ),
            pricingRuleSnapshot: modEval.pricingRuleSnapshot,
            revenueAttributionBranch: modEval.pickupBranchId ?? null,
            revenueSplitPickupPercent: modEval.revenueSplitPickupPercent,
            vehicleNameSnapshot: model.name,
            vehicleReferenceSnapshot: vehicle.reference,
            status: 'PENDING',
            revision: currentRevision + 1,
            modificationHistory: [
              ...prevMods,
              {
                modifiedAt: nowIso,
                modifiedBy: actorLabel,
                actorType: 'CUSTOMER',
                statusAtChange: 'PENDING',
                reason: changeReason,
                previousTotalPrice: Number(originalDoc.totalPrice ?? 0),
                newTotalPrice: finalTotal,
                previousDeposit: Number(originalDoc.depositSnapshot ?? 0),
                newDeposit: finalQuote.depositAmount,
                changes,
              },
            ],
            statusHistory: [
              ...prevStatusHistory,
              {
                status: 'PENDING',
                changedAt: nowIso,
                changedBy: actorLabel,
                note: `Khách hàng cập nhật thông tin thuê (${changes.map((c) => c.label).join(', ')})`,
              },
            ],
          }
        }

        // Branch 2: Customer Cancel or Admin Status / Operational Update
        const freshDoc = await req.payload.findByID({
          collection: 'bookings',
          id: originalDoc.id,
          req,
          overrideAccess: true,
          depth: 0,
        })
        const currentRevision = Number(freshDoc.revision ?? originalDoc.revision ?? 1)
        if (
          typeof req.context?.expectedRevision === 'number' &&
          req.context.expectedRevision !== currentRevision
        ) {
          throw new APIError(
            'Đơn thuê vừa được cập nhật ở phiên làm việc khác. Vui lòng tải lại dữ liệu mới nhất trước khi thao tác.',
            409,
          )
        }

        const next =
          actor === 'customer' && req.context.noriCustomerCancel === true
            ? 'CANCELLED'
            : (data.status ?? freshDoc.status ?? originalDoc.status)
        if (
          actor === 'admin' &&
          next === (freshDoc.status ?? originalDoc.status) &&
          ['CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(String(next))
        ) {
          throw new APIError(
            `Đơn thuê đang ở trạng thái "${bookingStatusLabels[String(next)] ?? String(next)}". Vui lòng tải lại dữ liệu mới nhất.`,
            409,
          )
        }
        if (
          next !== (freshDoc.status ?? originalDoc.status) &&
          !canTransition(
            (freshDoc.status ?? originalDoc.status) as BookingStatus,
            next as BookingStatus,
            actor,
            originalDoc.startDate,
            businessToday(),
          )
        )
          throw new APIError('Không thể chuyển trạng thái đơn thuê theo yêu cầu.', 409)

        if (actor === 'customer' && next === 'CANCELLED') {
          const confirmedPayCount = await req.payload.count({
            collection: 'payments',
            req,
            overrideAccess: true,
            where: {
              and: [
                { booking: { equals: originalDoc.id } },
                {
                  status: {
                    in: [
                      'CONFIRMED',
                      'PARTIALLY_PAID',
                      'REVIEW_REQUIRED',
                      'REFUND_PENDING',
                      'PARTIALLY_REFUNDED',
                    ],
                  },
                },
                { paymentType: { not_equals: 'REFUND' } },
              ],
            },
          })
          if (confirmedPayCount.totalDocs > 0) {
            throw new APIError(
              'Đơn thuê đã có giao dịch thanh toán được xác nhận; vui lòng liên hệ NORI để được hỗ trợ hủy và hoàn tiền.',
              409,
            )
          }
        }

        // Enforce pre-handover financial eligibility (Section 7.7 & PAY-039)
        if (actor === 'admin' && next === 'ONGOING' && originalDoc.status !== 'ONGOING') {
          const payRes = await req.payload.find({
            collection: 'payments',
            req,
            overrideAccess: true,
            depth: 0,
            limit: 50,
            where: { booking: { equals: originalDoc.id } },
          })
          const enforceClearance =
            req.context?.enforceFinancialClearance === true || payRes.docs.length > 0
          if (enforceClearance) {
            const reqDeposit = Number(
              originalDoc.initialPaymentDue ?? originalDoc.depositSnapshot ?? 0,
            )
            const fin = calculateBookingFinancialSummary({
              bookingStatus: String(freshDoc.status ?? originalDoc.status),
              totalRentalPrice: Number(originalDoc.totalPrice ?? 0),
              extraFee: Number(data.extraFee ?? originalDoc.extraFee ?? 0),
              reservationDepositRequired: reqDeposit,
              payments: payRes.docs.map((p) => ({
                id: p.id,
                paymentType: p.paymentType,
                amount: p.amount,
                expectedAmount: p.expectedAmount ?? p.amount,
                receivedAmount: p.receivedAmount ?? null,
                refundedAmount: p.refundedAmount ?? 0,
                overpaidAmount: p.overpaidAmount ?? 0,
                status: p.status,
                reconciliationStatus: p.reconciliationStatus ?? null,
                expiresAt: p.expiresAt ?? null,
              })),
            })
            const check = checkHandoverFinancialEligibility({
              bookingStatus: String(freshDoc.status ?? originalDoc.status),
              financial: fin,
              requireDepositBeforeHandover: enforceClearance,
              hasPaymentRecords: payRes.docs.length > 0,
            })
            if (!check.allowed) {
              throw new APIError(
                check.reason ??
                  'Chưa đủ điều kiện tài chính để bàn giao xe. Vui lòng kiểm tra giao dịch đặt cọc/thanh toán.',
                409,
              )
            }
          }
        }

        // Enforce post-return settlement before COMPLETED (Section 7.8 & PAY-040)
        if (actor === 'admin' && next === 'COMPLETED' && originalDoc.status !== 'COMPLETED') {
          const [payRes, refundRes] = await Promise.all([
            req.payload.find({
              collection: 'payments',
              req,
              overrideAccess: true,
              depth: 0,
              limit: 50,
              where: { booking: { equals: originalDoc.id } },
            }),
            req.payload
              .find({
                collection: 'refunds',
                req,
                overrideAccess: true,
                depth: 0,
                limit: 50,
                where: { booking: { equals: originalDoc.id } },
              })
              .catch(() => ({ docs: [] })),
          ])
          const hasFinancialRecords =
            payRes.docs.length > 0 ||
            refundRes.docs.length > 0 ||
            req.context?.enforceFinancialClearance === true
          if (hasFinancialRecords) {
            const nextExtraFee =
              data.extraFee !== undefined && data.extraFee !== null
                ? Number(data.extraFee)
                : Number(originalDoc.extraFee ?? 0)
            const fin = calculateBookingFinancialSummary({
              bookingStatus: String(freshDoc.status ?? originalDoc.status),
              totalRentalPrice: Number(originalDoc.totalPrice ?? 0),
              extraFee: nextExtraFee,
              reservationDepositRequired: Number(
                originalDoc.initialPaymentDue ?? originalDoc.depositSnapshot ?? 0,
              ),
              payments: payRes.docs.map((p) => ({
                id: p.id,
                paymentType: p.paymentType,
                amount: p.amount,
                expectedAmount: p.expectedAmount ?? p.amount,
                receivedAmount: p.receivedAmount ?? null,
                refundedAmount: p.refundedAmount ?? 0,
                overpaidAmount: p.overpaidAmount ?? 0,
                status: p.status,
                reconciliationStatus: p.reconciliationStatus ?? null,
                expiresAt: p.expiresAt ?? null,
              })),
              refunds: refundRes.docs.map((r) => ({
                id: r.id,
                amount: r.amount,
                refundType: r.refundType,
                status: r.status,
              })),
            })
            const exceptionNote =
              (typeof data.handoverNote === 'string' && data.handoverNote.trim()) ||
              (typeof data.extraFeeNote === 'string' && data.extraFeeNote.trim()) ||
              null
            const settleCheck = checkSettlementCompletionEligibility({
              financial: fin,
              hasOnlineOrRecordedPayments: hasFinancialRecords,
              approveFinancialException: Boolean(req.context?.approveFinancialException),
              exceptionNote,
            })
            if (!settleCheck.allowed) {
              throw new APIError(
                settleCheck.reason ??
                  'Đơn thuê còn nghĩa vụ tài chính hoặc hoàn tiền chưa được quyết toán.',
                409,
              )
            }
          }
        }

        let expectedContactDate = originalDoc.expectedContactDate
        let workingHoursSnapshot = originalDoc.workingHoursSnapshot
        let isUrgentApproval = Boolean(originalDoc.isUrgentApproval)

        if (next === 'CONFIRMED' && originalDoc.status !== 'CONFIRMED') {
          const pickupBranchId = relationId(originalDoc.pickupBranch)
          const [site, branchDoc] = await Promise.all([
            req.payload.findGlobal({
              slug: 'nori-site',
              req,
              overrideAccess: true,
              draft: false,
              depth: 0,
            }),
            pickupBranchId
              ? req.payload
                  .findByID({
                    collection: 'branches' as never,
                    id: pickupBranchId,
                    req,
                    overrideAccess: true,
                    depth: 0,
                  })
                  .catch(() => null)
              : Promise.resolve(null),
          ])
          const siteRec = site as unknown as Record<string, unknown>
          const bRec = branchDoc as Record<string, unknown> | null
          const slot = calculateNextContactSlot(
            new Date(),
            {
              timezone: String(bRec?.timezone ?? siteRec.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
              workingDays: String(bRec?.workingDays ?? siteRec.workingDays ?? '1,2,3,4,5'),
              workStartTime: bRec?.workStartTime
                ? String(bRec.workStartTime)
                : siteRec.workStartTime
                  ? String(siteRec.workStartTime)
                  : null,
              workEndTime: bRec?.workEndTime
                ? String(bRec.workEndTime)
                : siteRec.workEndTime
                  ? String(siteRec.workEndTime)
                  : null,
              lunchBreakStart: bRec?.lunchBreakStart
                ? String(bRec.lunchBreakStart)
                : siteRec.lunchBreakStart
                  ? String(siteRec.lunchBreakStart)
                  : null,
              lunchBreakEnd: bRec?.lunchBreakEnd
                ? String(bRec.lunchBreakEnd)
                : siteRec.lunchBreakEnd
                  ? String(siteRec.lunchBreakEnd)
                  : null,
              holidays: Array.isArray(bRec?.holidays)
                ? (bRec.holidays as { date: string; name?: string }[])
                : Array.isArray(siteRec.holidays)
                  ? (siteRec.holidays as { date: string; name?: string }[])
                  : [],
              fallbackHoursLabel:
                (bRec?.operatingHoursLabel ? String(bRec.operatingHoursLabel) : null) ??
                site.openingHours ??
                null,
            },
            {
              startDate: String(originalDoc.startDate),
              pickupTime: String(originalDoc.pickupTime ?? '08:00'),
            },
          )
          expectedContactDate = slot.expectedContactDate
          workingHoursSnapshot = slot.workingHoursLabel
          isUrgentApproval = slot.isUrgent
        }

        let scheduleConflictAlert = originalDoc.scheduleConflictAlert ?? null
        let actualReturnAt = originalDoc.actualReturnAt ?? null
        let actualReturnBranch = data.actualReturnBranch ?? originalDoc.actualReturnBranch
        let actualReturnWarehouse = data.actualReturnWarehouse ?? originalDoc.actualReturnWarehouse
        let returnInspectionStatus =
          data.returnInspectionStatus ?? originalDoc.returnInspectionStatus ?? 'NOT_APPLICABLE'

        if (
          actor === 'admin' &&
          (next === 'INSPECTING' || next === 'COMPLETED') &&
          originalDoc.status !== next
        ) {
          actualReturnAt = actualReturnAt || new Date().toISOString()
          const resolvedReturnBranchId =
            relationId(actualReturnBranch) ??
            relationId(originalDoc.returnBranch) ??
            relationId(originalDoc.pickupBranch) ??
            null
          if (!actualReturnBranch && resolvedReturnBranchId) {
            actualReturnBranch = resolvedReturnBranchId
          }
          if (next === 'INSPECTING' && returnInspectionStatus === 'NOT_APPLICABLE') {
            returnInspectionStatus = 'PENDING_INSPECTION'
          } else if (next === 'COMPLETED' && returnInspectionStatus === 'NOT_APPLICABLE') {
            returnInspectionStatus = 'PASSED'
          }
          const isLate = businessToday() > String(originalDoc.endDate)
          const isDamaged = returnInspectionStatus === 'DAMAGED_NEEDS_REPAIR'
          const vehicleId = relationId(originalDoc.vehicle)
          if (vehicleId) {
            scheduleConflictAlert = await detectReturnScheduleConflicts(req.payload, req, {
              bookingId: String(originalDoc.id),
              vehicleId: String(vehicleId),
              actualReturnBranchId: resolvedReturnBranchId,
              expectedReturnBranchId:
                relationId(originalDoc.returnBranch) ??
                relationId(originalDoc.pickupBranch) ??
                null,
              expectedEndDate: String(originalDoc.endDate),
              isLateReturn: isLate,
              isDamaged,
            })
          }
        }

        const prevHistory = Array.isArray(originalDoc.statusHistory)
          ? originalDoc.statusHistory
          : []
        const nextHistory =
          next !== originalDoc.status
            ? [
                ...prevHistory,
                {
                  status: String(next),
                  changedAt: new Date().toISOString(),
                  changedBy:
                    req.user?.collection === 'admins'
                      ? (req.user.email ?? 'Admin NORI')
                      : isSystemPaymentSync
                        ? String(req.context?.noriSystemActorLabel ?? 'Hệ thống thanh toán NORI')
                        : (req.user?.email ?? 'Khách hàng'),
                  note:
                    typeof data.handoverNote === 'string' && data.handoverNote.trim()
                      ? data.handoverNote.trim().slice(0, 500)
                      : undefined,
                },
              ]
            : prevHistory
        return {
          ...data,
          customer: originalDoc.customer,
          vehicle: originalDoc.vehicle,
          bookingKey: originalDoc.bookingKey,
          startDate: originalDoc.startDate,
          endDate: originalDoc.endDate,
          pickupTime: originalDoc.pickupTime,
          returnTime: originalDoc.returnTime,
          pickupLocation: originalDoc.pickupLocation,
          returnLocation: originalDoc.returnLocation,
          pickupBranch: originalDoc.pickupBranch,
          returnBranch: originalDoc.returnBranch,
          pickupServiceLocation: originalDoc.pickupServiceLocation,
          returnServiceLocation: originalDoc.returnServiceLocation,
          isOneWay: originalDoc.isOneWay,
          pickupMethod: originalDoc.pickupMethod,
          returnMethod: originalDoc.returnMethod,
          deliveryZone: originalDoc.deliveryZone,
          deliveryAddress: originalDoc.deliveryAddress,
          pickupAddress: originalDoc.pickupAddress,
          deliveryContactName: originalDoc.deliveryContactName,
          deliveryContactPhone: originalDoc.deliveryContactPhone,
          deliveryDirections: originalDoc.deliveryDirections,
          deliveryRequested: originalDoc.deliveryRequested,
          addonServices: originalDoc.addonServices,
          customerPhone: originalDoc.customerPhone,
          customerEmail: originalDoc.customerEmail,
          totalDays: originalDoc.totalDays,
          dailyPriceSnapshot: originalDoc.dailyPriceSnapshot,
          baseRentPrice: originalDoc.baseRentPrice,
          weekendSurchargeTotal: originalDoc.weekendSurchargeTotal,
          locationSurchargeSnapshot: originalDoc.locationSurchargeSnapshot,
          oneWayFeeSnapshot: originalDoc.oneWayFeeSnapshot,
          deliveryFeeSnapshot: originalDoc.deliveryFeeSnapshot,
          pickupFeeSnapshot: originalDoc.pickupFeeSnapshot,
          afterHoursFeeSnapshot: originalDoc.afterHoursFeeSnapshot,
          addonFeeTotal: originalDoc.addonFeeTotal,
          discountAmount: originalDoc.discountAmount,
          promoCode: originalDoc.promoCode,
          promoDiscountAmount: originalDoc.promoDiscountAmount,
          totalPrice: originalDoc.totalPrice,
          paymentOption: originalDoc.paymentOption ?? 'DEPOSIT',
          reservationDepositSnapshot: originalDoc.reservationDepositSnapshot ?? 0,
          depositSnapshot: originalDoc.depositSnapshot,
          initialPaymentDue: originalDoc.initialPaymentDue,
          remainingAmount: ['CANCELLED', 'REJECTED'].includes(String(next))
            ? 0
            : originalDoc.remainingAmount,
          pricingRuleSnapshot: originalDoc.pricingRuleSnapshot,
          revenueAttributionBranch: originalDoc.revenueAttributionBranch,
          revenueSplitPickupPercent: originalDoc.revenueSplitPickupPercent,
          actualReturnBranch,
          actualReturnWarehouse,
          actualReturnAt,
          returnInspectionStatus,
          scheduleConflictAlert,
          idempotencyKey: originalDoc.idempotencyKey,
          vehicleNameSnapshot: originalDoc.vehicleNameSnapshot,
          vehicleReferenceSnapshot: originalDoc.vehicleReferenceSnapshot,
          modificationHistory: originalDoc.modificationHistory,
          expectedContactDate,
          workingHoursSnapshot,
          isUrgentApproval,
          revision: Number(originalDoc.revision ?? 1) + 1,
          statusHistory: nextHistory,
          status: next,
        }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        // Record audit entry when customer modifies pending booking
        if (operation === 'update' && req.context.noriCustomerModify === true) {
          const latestMod = Array.isArray(doc.modificationHistory)
            ? doc.modificationHistory.at(-1)
            : null
          try {
            await req.payload.create({
              collection: 'audit-logs',
              req,
              overrideAccess: true,
              data: {
                action: 'booking.modify',
                entity: 'booking',
                entityId: String(doc.id),
                entityLabel: String(doc.bookingKey ?? doc.id),
                summary: `Khách hàng chỉnh sửa đơn chờ duyệt ${doc.bookingKey}: ${formatVnd(latestMod?.previousTotalPrice)} → ${formatVnd(latestMod?.newTotalPrice)}`,
                fromStatus: 'PENDING',
                toStatus: 'PENDING',
                actorType: 'CUSTOMER',
                actorId: req.user?.id ? String(req.user.id) : undefined,
                actorEmail: req.user?.email ?? undefined,
              },
            })
          } catch {
            // Non-blocking audit write
          }
        }

        if (operation === 'update' && previousDoc?.status !== doc.status) {
          const vehicleId = relationId(doc.vehicle)
          const customerId = relationId(doc.customer)

          // Create Customer Notification when Admin requires Deposit (DEPOSIT_PENDING)
          if (doc.status === 'DEPOSIT_PENDING' && customerId) {
            try {
              const dueAmount = Number(
                doc.initialPaymentDue || doc.depositSnapshot || doc.totalPrice || 0,
              )
              const vehicleLabel = doc.vehicleNameSnapshot || 'Phương tiện NORI'
              await req.payload.create({
                collection: 'notifications',
                req,
                overrideAccess: true,
                data: {
                  eventKey: `PAYMENT_REQUIRED:${doc.id}:${doc.revision ?? 1}`,
                  customer: customerId,
                  booking: doc.id,
                  type: 'PAYMENT_REQUIRED',
                  title: 'Yêu cầu thanh toán đặt cọc giữ xe',
                  message: `Đơn thuê ${doc.bookingKey} (${vehicleLabel}) đã được Admin xét duyệt và yêu cầu đặt cọc ${formatVnd(dueAmount)} để xác nhận giữ lịch xe. Quý khách có thể thanh toán trực tuyến qua VietQR ngay tại trang Đơn thuê của tôi.`,
                  bookingKey: String(doc.bookingKey ?? doc.id),
                  vehicleName: vehicleLabel,
                  startDate: doc.startDate,
                  endDate: doc.endDate,
                  pickupTime: doc.pickupTime ?? '08:00',
                  returnTime: doc.returnTime ?? '20:00',
                  paymentConfirmed: false,
                  superseded: false,
                  isRead: false,
                  popupDismissed: true,
                },
              })
            } catch {
              // Ignore duplicate eventKey or non-blocking notification error
            }
          }

          // Create Customer Notification + Staff Consultation Request on Approval (CONFIRMED)
          if (doc.status === 'CONFIRMED' && customerId) {
            const [site, customerDoc, confirmedPayments, existingNotif, existingConsult] =
              await Promise.all([
                req.payload.findGlobal({
                  slug: 'nori-site',
                  req,
                  overrideAccess: true,
                  draft: false,
                  depth: 0,
                }),
                req.payload
                  .findByID({
                    collection: 'users',
                    id: customerId,
                    req,
                    overrideAccess: true,
                    depth: 0,
                  })
                  .catch(() => null),
                req.payload.count({
                  collection: 'payments',
                  req,
                  overrideAccess: true,
                  where: {
                    and: [{ booking: { equals: doc.id } }, { status: { equals: 'CONFIRMED' } }],
                  },
                }),
                req.payload.find({
                  collection: 'notifications',
                  req,
                  overrideAccess: true,
                  depth: 0,
                  limit: 1,
                  where: { eventKey: { equals: `BOOKING_CONFIRMED:${doc.id}` } },
                }),
                req.payload.find({
                  collection: 'consultations',
                  req,
                  overrideAccess: true,
                  depth: 0,
                  limit: 1,
                  where: { consultationKey: { equals: `BOOKING_APPROVAL:${doc.id}` } },
                }),
              ])

            const siteRec = site as unknown as Record<string, unknown>
            const slot = calculateNextContactSlot(
              new Date(),
              {
                timezone: String(siteRec.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
                workingDays: String(siteRec.workingDays ?? '1,2,3,4,5'),
                workStartTime: siteRec.workStartTime ? String(siteRec.workStartTime) : null,
                workEndTime: siteRec.workEndTime ? String(siteRec.workEndTime) : null,
                lunchBreakStart: siteRec.lunchBreakStart ? String(siteRec.lunchBreakStart) : null,
                lunchBreakEnd: siteRec.lunchBreakEnd ? String(siteRec.lunchBreakEnd) : null,
                holidays: Array.isArray(siteRec.holidays)
                  ? (siteRec.holidays as { date: string; name?: string }[])
                  : [],
                fallbackHoursLabel: site.openingHours ?? null,
              },
              {
                startDate: String(doc.startDate),
                pickupTime: String(doc.pickupTime ?? '08:00'),
              },
            )

            const expectedDate = doc.expectedContactDate || slot.expectedContactDate
            const hoursLabel = doc.workingHoursSnapshot || slot.workingHoursLabel
            const isUrgent = Boolean(doc.isUrgentApproval ?? slot.isUrgent)
            const rawPhone = doc.customerPhone || customerDoc?.phone || ''
            const rawEmail = doc.customerEmail || customerDoc?.email || ''
            const custName = customerDoc?.fullName || rawEmail || 'Quý khách'
            const vehicleLabel = doc.vehicleNameSnapshot || 'Phương tiện NORI'

            await dispatchBookingConfirmationNotice({
              payload: req.payload,
              req,
              existingNotifCount: existingNotif.docs.length,
              data: {
                eventKey: `BOOKING_CONFIRMED:${doc.id}`,
                customerId,
                bookingId: doc.id,
                title: 'Đơn thuê của bạn đã được xác nhận!',
                message: isUrgent
                  ? `Đơn thuê ${doc.bookingKey} (${vehicleLabel}) đã được xác nhận và gắn cờ ưu tiên hỗ trợ do lịch nhận xe gần (${formatDate(doc.startDate)}). Quý khách vui lòng chú ý điện thoại hoặc liên hệ Hotline NORI nếu cần hướng dẫn ngay.`
                  : `Cảm ơn quý khách đã lựa chọn NORI. Đơn thuê ${doc.bookingKey} đã được xác nhận. Nhân viên NORI sẽ liên hệ tư vấn và hướng dẫn các bước tiếp theo vào ngày làm việc dự kiến ${formatDate(expectedDate)} (${hoursLabel}).`,
                bookingKey: String(doc.bookingKey ?? doc.id),
                vehicleName: vehicleLabel,
                startDate: doc.startDate,
                endDate: doc.endDate,
                pickupTime: doc.pickupTime ?? '08:00',
                returnTime: doc.returnTime ?? '20:00',
                expectedContactDate: expectedDate,
                workingHoursLabel: hoursLabel,
                customerPhoneMasked: maskPhone(rawPhone),
                customerEmail: rawEmail || undefined,
                hotline: site.phone ?? '',
                isUrgent,
                paymentConfirmed: confirmedPayments.totalDocs > 0,
              },
            })

            if (existingConsult.docs.length === 0) {
              await req.payload.create({
                collection: 'consultations',
                req,
                overrideAccess: true,
                data: {
                  consultationKey: `BOOKING_APPROVAL:${doc.id}`,
                  booking: doc.id,
                  customer: customerId,
                  branch: relationId(doc.pickupBranch) ?? undefined,
                  bookingKeySnapshot: String(doc.bookingKey ?? doc.id),
                  customerNameSnapshot: custName,
                  customerPhoneSnapshot: rawPhone,
                  customerEmailSnapshot: rawEmail,
                  vehicleNameSnapshot: `${vehicleLabel}${doc.vehicleReferenceSnapshot ? ` (${doc.vehicleReferenceSnapshot})` : ''}`,
                  startDateSnapshot: doc.startDate,
                  endDateSnapshot: doc.endDate,
                  approvedAt: new Date().toISOString(),
                  approvedBy: req.user?.email ?? 'Admin NORI',
                  expectedContactDate: expectedDate,
                  workingHoursWindow: hoursLabel,
                  isUrgent,
                  status: 'PENDING_CONTACT',
                  contactLogs: [],
                },
              })
            }
          }

          // Suppress misleading confirmation popup, cancel open consultation, and restore promo usage quota if booking is cancelled/rejected
          if (['CANCELLED', 'REJECTED'].includes(doc.status)) {
            if (
              !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(String(previousDoc?.status ?? '')) &&
              doc.promoCode
            ) {
              await releasePromoSlotAtomically(req.payload, doc.promoCode, req)
            }
            const [notifsToSupersede, openConsults] = await Promise.all([
              req.payload.find({
                collection: 'notifications',
                req,
                overrideAccess: true,
                depth: 0,
                limit: 10,
                where: {
                  and: [{ booking: { equals: doc.id } }, { type: { equals: 'BOOKING_CONFIRMED' } }],
                },
              }),
              req.payload.find({
                collection: 'consultations',
                req,
                overrideAccess: true,
                depth: 0,
                limit: 5,
                where: {
                  and: [
                    { booking: { equals: doc.id } },
                    { status: { not_in: ['COMPLETED', 'CANCELLED'] } },
                  ],
                },
              }),
            ])
            for (const n of notifsToSupersede.docs) {
              await req.payload.update({
                collection: 'notifications',
                id: n.id,
                req,
                overrideAccess: true,
                data: { superseded: true, popupDismissed: true },
              })
            }
            for (const c of openConsults.docs) {
              await req.payload.update({
                collection: 'consultations',
                id: c.id,
                req,
                overrideAccess: true,
                context: { skipAudit: true },
                data: { status: 'CANCELLED' },
              })
            }
            const pendingPayments = await req.payload.find({
              collection: 'payments',
              req,
              overrideAccess: true,
              depth: 0,
              limit: 20,
              where: {
                and: [
                  { booking: { equals: doc.id } },
                  { status: { in: ['PENDING', 'PROCESSING'] } },
                ],
              },
            })
            for (const p of pendingPayments.docs) {
              await req.payload.update({
                collection: 'payments',
                id: p.id,
                req,
                overrideAccess: true,
                data: {
                  status: 'CANCELLED',
                  note: p.note
                    ? `${p.note} · Tự động hủy do đơn thuê chuyển trạng thái ${doc.status}`
                    : `Tự động hủy do đơn thuê chuyển trạng thái ${doc.status}`,
                },
              })
            }
            if (customerId) {
              try {
                const vehicleLabel = doc.vehicleNameSnapshot || 'Phương tiện NORI'
                await req.payload.create({
                  collection: 'notifications',
                  req,
                  overrideAccess: true,
                  data: {
                    eventKey: `BOOKING_${doc.status}:${doc.id}`,
                    customer: customerId,
                    booking: doc.id,
                    type: 'BOOKING_CANCELLED',
                    title:
                      doc.status === 'REJECTED'
                        ? 'Đơn thuê bị từ chối xác nhận'
                        : 'Đơn thuê đã được hủy',
                    message: `Đơn thuê ${doc.bookingKey} (${vehicleLabel}) đã chuyển sang trạng thái ${bookingStatusLabels[doc.status] ?? doc.status}. Lịch giữ xe đã được giải phóng.`,
                    bookingKey: String(doc.bookingKey ?? doc.id),
                    vehicleName: vehicleLabel,
                    startDate: doc.startDate,
                    endDate: doc.endDate,
                    superseded: false,
                    isRead: false,
                    popupDismissed: true,
                  },
                })
              } catch {
                // Non-blocking notification
              }
            }
          }

          if (doc.status === 'COMPLETED' && customerId) {
            try {
              const vehicleLabel = doc.vehicleNameSnapshot || 'Phương tiện NORI'
              await req.payload.create({
                collection: 'notifications',
                req,
                overrideAccess: true,
                data: {
                  eventKey: `BOOKING_COMPLETED:${doc.id}`,
                  customer: customerId,
                  booking: doc.id,
                  type: 'BOOKING_COMPLETED',
                  title: 'Hợp đồng thuê xe đã hoàn tất!',
                  message: `Cảm ơn quý khách đã đồng hành cùng NORI. Đơn thuê ${doc.bookingKey} (${vehicleLabel}) đã được quyết toán và hoàn tất.`,
                  bookingKey: String(doc.bookingKey ?? doc.id),
                  vehicleName: vehicleLabel,
                  startDate: doc.startDate,
                  endDate: doc.endDate,
                  paymentConfirmed: true,
                  superseded: false,
                  isRead: false,
                  popupDismissed: true,
                },
              })
            } catch {
              // Non-blocking notification
            }
          }

          if (doc.status === 'ONGOING' && vehicleId) {
            const pickupBranchId = relationId(doc.pickupBranch) ?? null
            const returnBranchId = relationId(doc.returnBranch) ?? pickupBranchId
            await req.payload.update({
              collection: 'vehicles',
              id: vehicleId,
              req,
              overrideAccess: true,
              data: {
                operationStatus: 'RENTED',
                ...(returnBranchId ? { nextExpectedBranch: returnBranchId } : {}),
                nextExpectedLocationNote: doc.isOneWay
                  ? `Đơn một chiều ${doc.bookingKey} dự kiến trả tại chi nhánh đích ngày ${doc.endDate}`
                  : `Đơn ${doc.bookingKey} dự kiến trả ngày ${doc.endDate}`,
              } as never,
            })
            await recordVehicleLocationEvent(req.payload, req, {
              vehicleId: String(vehicleId),
              vehicleReference: doc.vehicleReferenceSnapshot ?? undefined,
              eventType: 'BOOKING_HANDOVER',
              fromBranchId: pickupBranchId,
              toBranchId: returnBranchId,
              relatedBookingId: String(doc.id),
              actorEmail: req.user?.email ?? 'Admin NORI',
              note: `Bàn giao xe cho khách theo đơn ${doc.bookingKey}`,
            }).catch(() => undefined)
          } else if (doc.status === 'INSPECTING' && vehicleId) {
            const actualRetBranchId =
              relationId(doc.actualReturnBranch) ??
              relationId(doc.returnBranch) ??
              relationId(doc.pickupBranch) ??
              null
            const actualRetWhId = relationId(doc.actualReturnWarehouse) ?? null
            const retBranchDoc = actualRetBranchId
              ? ((await req.payload
                  .findByID({
                    collection: 'branches' as never,
                    id: actualRetBranchId,
                    req,
                    overrideAccess: true,
                    depth: 0,
                  })
                  .catch(() => null)) as Record<string, unknown> | null)
              : null
            await req.payload.update({
              collection: 'vehicles',
              id: vehicleId,
              req,
              overrideAccess: true,
              data: {
                operationStatus:
                  doc.returnInspectionStatus === 'DAMAGED_NEEDS_REPAIR'
                    ? 'MAINTENANCE'
                    : 'PENDING_INSPECTION',
                ...(actualRetBranchId ? { currentBranch: actualRetBranchId } : {}),
                ...(actualRetWhId ? { currentWarehouse: actualRetWhId } : {}),
                ...(retBranchDoc?.province ? { location: String(retBranchDoc.province) } : {}),
                nextExpectedBranch: null,
                nextExpectedLocationNote: null,
                ...(typeof doc.returnOdometer === 'number' ? { odometer: doc.returnOdometer } : {}),
                ...(typeof doc.returnCondition === 'string' && doc.returnCondition.trim()
                  ? { condition: doc.returnCondition.trim() }
                  : {}),
              } as never,
            })
            await recordVehicleLocationEvent(req.payload, req, {
              vehicleId: String(vehicleId),
              vehicleReference: doc.vehicleReferenceSnapshot ?? undefined,
              eventType: doc.isOneWay ? 'ONE_WAY_RETURN' : 'BOOKING_RETURN',
              fromBranchId: relationId(doc.pickupBranch) ?? null,
              toBranchId: actualRetBranchId,
              toWarehouseId: actualRetWhId,
              relatedBookingId: String(doc.id),
              odometer: typeof doc.returnOdometer === 'number' ? doc.returnOdometer : null,
              conditionNote: doc.returnCondition ?? null,
              actorEmail: req.user?.email ?? 'Admin NORI',
              note: `Tiếp nhận xe trả về từ đơn ${doc.bookingKey} (chờ kiểm tra & quyết toán)`,
            }).catch(() => undefined)
          } else if (['CANCELLED', 'REJECTED', 'COMPLETED'].includes(doc.status)) {
            await req.payload.delete({
              collection: 'rental-days',
              where: { bookingKey: { equals: doc.bookingKey } },
              req,
              overrideAccess: true,
            })
            if (vehicleId) {
              const actualRetBranchId =
                doc.status === 'COMPLETED'
                  ? (relationId(doc.actualReturnBranch) ??
                    relationId(doc.returnBranch) ??
                    relationId(doc.pickupBranch) ??
                    null)
                  : null
              const actualRetWhId =
                doc.status === 'COMPLETED' ? (relationId(doc.actualReturnWarehouse) ?? null) : null
              const retBranchDoc =
                doc.status === 'COMPLETED' && actualRetBranchId
                  ? ((await req.payload
                      .findByID({
                        collection: 'branches' as never,
                        id: actualRetBranchId,
                        req,
                        overrideAccess: true,
                        depth: 0,
                      })
                      .catch(() => null)) as Record<string, unknown> | null)
                  : null

              const [otherOngoing, activePurchaseHold, vehicle] = await Promise.all([
                req.payload.count({
                  collection: 'bookings',
                  overrideAccess: true,
                  req,
                  where: {
                    and: [
                      { vehicle: { equals: vehicleId } },
                      { id: { not_equals: doc.id } },
                      { status: { equals: 'ONGOING' } },
                    ],
                  },
                }),
                req.payload.count({
                  collection: 'sales-inquiries',
                  overrideAccess: true,
                  req,
                  where: {
                    and: [
                      { vehicle: { equals: vehicleId } },
                      { status: { in: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED'] } },
                    ],
                  },
                }),
                req.payload.findByID({
                  collection: 'vehicles',
                  id: vehicleId,
                  req,
                  overrideAccess: true,
                  depth: 0,
                }),
              ])
              const locationReturnPatch =
                doc.status === 'COMPLETED'
                  ? {
                      ...(actualRetBranchId ? { currentBranch: actualRetBranchId } : {}),
                      ...(actualRetWhId ? { currentWarehouse: actualRetWhId } : {}),
                      ...(retBranchDoc?.province
                        ? { location: String(retBranchDoc.province) }
                        : {}),
                      nextExpectedBranch: null,
                      nextExpectedLocationNote: null,
                    }
                  : {
                      nextExpectedBranch: null,
                      nextExpectedLocationNote: null,
                    }

              if (otherOngoing.totalDocs > 0) {
                if (vehicle?.operationStatus !== 'RENTED') {
                  await req.payload.update({
                    collection: 'vehicles',
                    id: vehicleId,
                    req,
                    overrideAccess: true,
                    data: { operationStatus: 'RENTED' },
                  })
                }
              } else if (activePurchaseHold.totalDocs > 0) {
                if (
                  vehicle &&
                  vehicle.operationStatus !== 'SOLD' &&
                  vehicle.operationStatus !== 'RESERVED'
                ) {
                  await req.payload.update({
                    collection: 'vehicles',
                    id: vehicleId,
                    req,
                    overrideAccess: true,
                    data: { operationStatus: 'RESERVED', ...locationReturnPatch } as never,
                  })
                }
              } else if (
                vehicle?.operationStatus === 'RENTED' ||
                vehicle?.operationStatus === 'PENDING_INSPECTION'
              ) {
                const nextVehOp =
                  doc.status === 'COMPLETED' &&
                  doc.returnInspectionStatus === 'DAMAGED_NEEDS_REPAIR'
                    ? 'MAINTENANCE'
                    : doc.status === 'COMPLETED' &&
                        doc.returnInspectionStatus === 'PENDING_INSPECTION'
                      ? 'PENDING_INSPECTION'
                      : 'READY'
                await req.payload.update({
                  collection: 'vehicles',
                  id: vehicleId,
                  req,
                  overrideAccess: true,
                  data: {
                    operationStatus: nextVehOp,
                    ...locationReturnPatch,
                    ...(doc.status === 'COMPLETED' && typeof doc.returnOdometer === 'number'
                      ? { odometer: doc.returnOdometer }
                      : {}),
                    ...(doc.status === 'COMPLETED' &&
                    typeof doc.returnCondition === 'string' &&
                    doc.returnCondition.trim()
                      ? { condition: doc.returnCondition.trim() }
                      : {}),
                  } as never,
                })
              } else if (
                doc.status === 'COMPLETED' &&
                (typeof doc.returnOdometer === 'number' ||
                  actualRetBranchId ||
                  (typeof doc.returnCondition === 'string' && doc.returnCondition.trim()))
              ) {
                await req.payload.update({
                  collection: 'vehicles',
                  id: vehicleId,
                  req,
                  overrideAccess: true,
                  data: {
                    ...locationReturnPatch,
                    ...(typeof doc.returnOdometer === 'number'
                      ? { odometer: doc.returnOdometer }
                      : {}),
                    ...(typeof doc.returnCondition === 'string' && doc.returnCondition.trim()
                      ? { condition: doc.returnCondition.trim() }
                      : {}),
                  } as never,
                })
              }

              if (doc.status === 'COMPLETED' && previousDoc?.status !== 'INSPECTING') {
                await recordVehicleLocationEvent(req.payload, req, {
                  vehicleId: String(vehicleId),
                  vehicleReference: doc.vehicleReferenceSnapshot ?? undefined,
                  eventType: doc.isOneWay ? 'ONE_WAY_RETURN' : 'BOOKING_RETURN',
                  fromBranchId: relationId(doc.pickupBranch) ?? null,
                  toBranchId: actualRetBranchId,
                  toWarehouseId: actualRetWhId,
                  relatedBookingId: String(doc.id),
                  odometer: typeof doc.returnOdometer === 'number' ? doc.returnOdometer : null,
                  conditionNote: doc.returnCondition ?? null,
                  actorEmail: req.user?.email ?? 'Admin NORI',
                  note: `Hoàn tất tiếp nhận trả xe đơn ${doc.bookingKey}`,
                }).catch(() => undefined)
              }
            }
          }
        }
        return doc
      },
      bookingAudit.afterChange,
    ],
  },
  fields: [
    {
      name: 'bookingKey',
      label: 'Mã đơn',
      type: 'text',
      unique: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'revision',
      label: 'Phiên bản đối soát đồng thời',
      type: 'number',
      defaultValue: 1,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'customer',
      label: 'Khách hàng',
      type: 'relationship',
      relationTo: 'users',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'vehicle',
      label: 'Xe thực tế',
      type: 'relationship',
      relationTo: 'vehicles',
      required: true,
      access: { update: serverField },
    },
    {
      name: 'startDate',
      label: 'Ngày nhận (YYYY-MM-DD)',
      type: 'text',
      required: true,
      access: { update: serverField },
    },
    {
      name: 'endDate',
      label: 'Ngày trả — không tính thêm ngày này',
      type: 'text',
      required: true,
      access: { update: serverField },
    },
    {
      name: 'pickupTime',
      label: 'Giờ nhận xe',
      type: 'text',
      defaultValue: '08:00',
      access: { update: serverField },
    },
    {
      name: 'returnTime',
      label: 'Giờ trả xe',
      type: 'text',
      defaultValue: '20:00',
      access: { update: serverField },
    },
    {
      name: 'pickupLocation',
      label: 'Địa điểm nhận xe',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'returnLocation',
      label: 'Địa điểm trả xe',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'pickupBranch',
      label: 'Chi nhánh nhận xe',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
      access: { update: serverField },
    },
    {
      name: 'returnBranch',
      label: 'Chi nhánh trả xe',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
      access: { update: serverField },
    },
    {
      name: 'pickupServiceLocation',
      label: 'Điểm nhận xe đã chọn',
      type: 'relationship',
      relationTo: 'service-locations',
      access: { update: serverField },
    },
    {
      name: 'returnServiceLocation',
      label: 'Điểm trả xe đã chọn',
      type: 'relationship',
      relationTo: 'service-locations',
      access: { update: serverField },
    },
    {
      name: 'isOneWay',
      label: 'Thuê trả xe khác chi nhánh (One-way)',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'pickupMethod',
      label: 'Phương thức nhận xe',
      type: 'select',
      options: ['BRANCH_PICKUP', 'HOME_DELIVERY'],
      defaultValue: 'BRANCH_PICKUP',
      access: { update: serverField },
    },
    {
      name: 'returnMethod',
      label: 'Phương thức trả xe',
      type: 'select',
      options: ['BRANCH_RETURN', 'HOME_PICKUP'],
      defaultValue: 'BRANCH_RETURN',
      access: { update: serverField },
    },
    {
      name: 'deliveryZone',
      label: 'Khu vực giao nhận tận nơi',
      type: 'relationship',
      relationTo: 'delivery-zones',
      access: { update: serverField },
    },
    {
      name: 'deliveryAddress',
      label: 'Địa chỉ giao xe tận nơi',
      type: 'text',
      maxLength: 300,
      access: { update: serverField },
    },
    {
      name: 'pickupAddress',
      label: 'Địa chỉ thu hồi xe tận nơi',
      type: 'text',
      maxLength: 300,
      access: { update: serverField },
    },
    {
      name: 'deliveryContactName',
      label: 'Người liên hệ giao nhận',
      type: 'text',
      maxLength: 120,
      access: { update: serverField },
    },
    {
      name: 'deliveryContactPhone',
      label: 'Số điện thoại giao nhận',
      type: 'text',
      maxLength: 20,
      access: { update: serverField },
    },
    {
      name: 'deliveryDirections',
      label: 'Hướng dẫn tìm địa điểm giao nhận',
      type: 'textarea',
      maxLength: 500,
      access: { update: serverField },
    },
    {
      name: 'deliveryRequested',
      label: 'Yêu cầu giao nhận xe tận nơi',
      type: 'checkbox',
      defaultValue: false,
      access: { update: serverField },
    },
    {
      name: 'addonServices',
      label: 'Dịch vụ bổ sung',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'customerPhone',
      label: 'Số điện thoại liên hệ',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'customerEmail',
      label: 'Email liên hệ cho đơn thuê',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'driverLicenseNumber',
      label: 'Số GPLX / CCCD xác minh (tham khảo)',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'note',
      label: 'Ghi chú hành trình',
      type: 'textarea',
      maxLength: 500,
      access: { update: serverField },
    },
    {
      name: 'totalDays',
      label: 'Số ngày',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'vehicleNameSnapshot',
      label: 'Tên xe lúc đặt',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'vehicleReferenceSnapshot',
      label: 'Mã xe lúc đặt',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'dailyPriceSnapshot',
      label: 'Giá/ngày lúc đặt',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'baseRentPrice',
      label: 'Tiền thuê cơ bản (snapshot)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'weekendSurchargeTotal',
      label: 'Phụ phí cuối tuần (snapshot)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'deliveryFeeSnapshot',
      label: 'Phí giao nhận xe (snapshot)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'locationSurchargeSnapshot',
      label: 'Phụ phí địa điểm (snapshot)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'oneWayFeeSnapshot',
      label: 'Phí trả xe khác chi nhánh (snapshot)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'pickupFeeSnapshot',
      label: 'Phí thu hồi xe tận nơi (snapshot)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'afterHoursFeeSnapshot',
      label: 'Phí giao nhận ngoài giờ (snapshot)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'pricingRuleSnapshot',
      label: 'Price Snapshot lúc chốt đơn (JSON)',
      type: 'json',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'revenueAttributionBranch',
      label: 'Chi nhánh ghi nhận doanh thu chính',
      type: 'relationship',
      relationTo: 'branches',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'revenueSplitPickupPercent',
      label: 'Tỷ lệ doanh thu chi nhánh nhận (%)',
      type: 'number',
      defaultValue: 100,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'actualReturnBranch',
      label: 'Chi nhánh tiếp nhận trả xe thực tế',
      type: 'relationship',
      relationTo: 'branches',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'actualReturnWarehouse',
      label: 'Kho tiếp nhận trả xe thực tế',
      type: 'relationship',
      relationTo: 'warehouses',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'actualReturnAt',
      label: 'Thời điểm trả xe thực tế',
      type: 'text',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'returnFuelOrBattery',
      label: 'Mức nhiên liệu / pin lúc trả xe',
      type: 'text',
      maxLength: 60,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'returnInspectionStatus',
      label: 'Trạng thái kiểm tra sau trả xe',
      type: 'select',
      options: ['NOT_APPLICABLE', 'PENDING_INSPECTION', 'PASSED', 'DAMAGED_NEEDS_REPAIR'],
      defaultValue: 'NOT_APPLICABLE',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'scheduleConflictAlert',
      label: 'Cảnh báo xung đột lịch tiếp theo',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'idempotencyKey',
      label: 'Khóa chống gửi đơn trùng',
      type: 'text',
      index: true,
      access: { update: serverField },
    },
    {
      name: 'addonFeeTotal',
      label: 'Phí dịch vụ bổ sung (snapshot)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'discountAmount',
      label: 'Chiết khấu thuê dài ngày (snapshot)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'promoCode',
      label: 'Mã khuyến mãi áp dụng',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'promoDiscountAmount',
      label: 'Giảm giá theo mã khuyến mãi (snapshot)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'totalPrice',
      label: 'Tổng dự kiến (không phải đã thanh toán)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'paymentOption',
      label: 'Kế hoạch thanh toán ban đầu',
      type: 'select',
      options: [
        { label: 'Đặt cọc giữ xe (30% tổng tiền thuê)', value: 'DEPOSIT' },
        { label: 'Thanh toán toàn bộ tiền thuê (100%)', value: 'FULL' },
      ],
      defaultValue: 'DEPOSIT',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'reservationDepositSnapshot',
      label: 'Mức cọc giữ xe đã chốt (VNĐ)',
      type: 'number',
      defaultValue: 0,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'depositSnapshot',
      label: 'Tiền ký quỹ bảo đảm tài sản (tách riêng)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'initialPaymentDue',
      label: 'Khoản cần thanh toán ban đầu theo chính sách',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'remainingAmount',
      label: 'Số tiền thuê còn lại dự kiến',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'expectedContactDate',
      label: 'Ngày dự kiến nhân viên liên hệ',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'workingHoursSnapshot',
      label: 'Khung giờ làm việc khi duyệt',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'isUrgentApproval',
      label: 'Đơn thuê gấp cần ưu tiên',
      type: 'checkbox',
      defaultValue: false,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'handoverNote',
      label: 'Ghi chú giao nhận & quyết toán (nội bộ)',
      type: 'textarea',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'extraFee',
      label: 'Phụ phí phát sinh thực tế (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'extraFeeNote',
      label: 'Lý do phụ phí phát sinh',
      type: 'text',
      maxLength: 300,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'contractNumber',
      label: 'Số hợp đồng thuê / biên bản bàn giao',
      type: 'text',
      maxLength: 80,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'returnOdometer',
      label: 'ODO lúc nhận lại xe (km)',
      type: 'number',
      min: 0,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'returnCondition',
      label: 'Tình trạng xe lúc nhận lại',
      type: 'textarea',
      maxLength: 500,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'modificationHistory',
      label: 'Lịch sử chỉnh sửa đơn thuê',
      type: 'array',
      access: { create: serverField, update: serverField },
      fields: [
        { name: 'modifiedAt', type: 'text', required: true },
        { name: 'modifiedBy', type: 'text' },
        { name: 'actorType', type: 'text' },
        { name: 'statusAtChange', type: 'text' },
        { name: 'reason', type: 'text' },
        { name: 'previousTotalPrice', type: 'number' },
        { name: 'newTotalPrice', type: 'number' },
        { name: 'previousDeposit', type: 'number' },
        { name: 'newDeposit', type: 'number' },
        {
          name: 'changes',
          type: 'array',
          fields: [
            { name: 'field', type: 'text', required: true },
            { name: 'label', type: 'text', required: true },
            { name: 'before', type: 'text' },
            { name: 'after', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'statusHistory',
      label: 'Lịch sử trạng thái',
      type: 'array',
      access: { create: serverField, update: serverField },
      fields: [
        { name: 'status', type: 'text', required: true },
        { name: 'changedAt', type: 'text', required: true },
        { name: 'changedBy', type: 'text' },
        { name: 'note', type: 'text' },
      ],
    },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        'PENDING',
        'DEPOSIT_PENDING',
        'CONFIRMED',
        'READY_FOR_HANDOVER',
        'ONGOING',
        'INSPECTING',
        'COMPLETED',
        'CANCELLED',
        'REJECTED',
      ],
      defaultValue: 'PENDING',
      access: { create: serverField, update: adminField },
    },
  ],
  versions: false,
}
