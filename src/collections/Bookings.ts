import { APIError, type CollectionConfig } from 'payload'
import { adminField, customerOnly, ownRecords, serverField } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import {
  BOOKING_CONFIRMED_LOCK_MESSAGE,
  bookingStatusLabels,
  businessToday,
  calculateNextContactSlot,
  calculateRentalQuote,
  canModifyBooking,
  canTransition,
  computeRentalDayDiff,
  formatDate,
  formatMoney,
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
  access: { create: customerOnly, read: ownRecords, update: ownRecords, delete: () => false },
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
          const userPendingCount = await req.payload.count({
            collection: 'bookings',
            overrideAccess: false,
            user: req.user,
            req,
            where: { status: { equals: 'PENDING' } },
          })
          if (userPendingCount.totalDocs >= 5) {
            throw new APIError(
              'Bạn đang có tối đa 5 đơn chờ xác nhận. Vui lòng hoàn tất hoặc hủy bớt trước khi đặt thêm.',
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
          const bookingKey = `NR-${crypto.randomUUID()}`
          for (const day of rentalDays(data.startDate, data.endDate)) {
            try {
              await req.payload.create({
                collection: 'rental-days',
                data: { key: `${vehicle.id}:${day}`, vehicle: vehicle.id, day, bookingKey },
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
          const addonKeys = parseAddonKeys(data.addonServices)
          const deliveryRequested = Boolean(data.deliveryRequested)
          const quote = calculateRentalQuote({
            startDate: String(data.startDate),
            endDate: String(data.endDate),
            dailyPrice: vehicle.pricePerDay,
            weeklyPrice: vehicle.pricePerWeek,
            monthlyPrice: vehicle.pricePerMonth,
            weekendSurcharge: vehicle.weekendSurcharge,
            holidaySurcharge: vehicle.holidaySurcharge,
            deliveryRequested,
            vehicleDeliveryFee: vehicle.deliveryFee,
            addonKeys,
            vehicleDeposit: vehicle.depositAmount,
          })
          let appliedPromoCode: string | undefined
          let promoDiscountAmount = 0
          const rawPromo =
            typeof data.promoCode === 'string' ? data.promoCode.trim().toUpperCase() : ''
          if (rawPromo) {
            const promoRes = await req.payload.find({
              collection: 'promotions',
              overrideAccess: true,
              req,
              depth: 0,
              limit: 1,
              where: { code: { equals: rawPromo } },
            })
            const promo = promoRes.docs[0]
            const today = businessToday()
            if (
              !promo ||
              !promo.active ||
              (promo.appliesTo !== 'ALL' && promo.appliesTo !== 'RENT') ||
              (promo.validFrom && today < promo.validFrom) ||
              (promo.validTo && today > promo.validTo) ||
              (promo.minDays && quote.totalDays < promo.minDays) ||
              (promo.usageLimit != null && (promo.usedCount ?? 0) >= promo.usageLimit)
            ) {
              throw new APIError('Mã khuyến mãi không hợp lệ hoặc chưa đủ điều kiện áp dụng.', 400)
            }
            const rawDiscount =
              promo.discountType === 'PERCENT'
                ? Math.round((quote.estimatedTotal * promo.discountValue) / 100)
                : promo.discountValue
            const cappedByMax =
              promo.maxDiscount != null ? Math.min(rawDiscount, promo.maxDiscount) : rawDiscount
            promoDiscountAmount = Math.max(0, Math.min(cappedByMax, quote.estimatedTotal))
            appliedPromoCode = promo.code
            await req.payload.update({
              collection: 'promotions',
              id: promo.id,
              overrideAccess: true,
              req,
              context: { skipAudit: true },
              data: { usedCount: (promo.usedCount ?? 0) + 1 },
            })
          }
          const finalTotal = Math.max(0, quote.estimatedTotal - promoDiscountAmount)
          const finalRemaining = Math.max(0, finalTotal - quote.initialPaymentDue)
          const pickupLoc =
            typeof data.pickupLocation === 'string' && data.pickupLocation.trim()
              ? data.pickupLocation.trim().slice(0, 200)
              : (vehicle.pickupLocation ?? vehicle.location ?? '')
          const returnLoc =
            typeof data.returnLocation === 'string' && data.returnLocation.trim()
              ? data.returnLocation.trim().slice(0, 200)
              : pickupLoc
          const custEmail =
            typeof data.customerEmail === 'string' && data.customerEmail.trim()
              ? data.customerEmail.trim().toLowerCase().slice(0, 254)
              : (req.user.email ?? undefined)
          return {
            ...data,
            customer: req.user.id,
            bookingKey,
            status: 'PENDING',
            revision: 1,
            pickupTime: validateTimeString(data.pickupTime) ? data.pickupTime : '08:00',
            returnTime: validateTimeString(data.returnTime) ? data.returnTime : '20:00',
            pickupLocation: pickupLoc,
            returnLocation: returnLoc,
            customerEmail: custEmail,
            deliveryRequested,
            addonServices: addonKeys.join(','),
            totalDays: quote.totalDays,
            dailyPriceSnapshot: quote.dailyPrice,
            baseRentPrice: quote.basePrice,
            weekendSurchargeTotal: quote.weekendSurchargeTotal + quote.holidaySurchargeTotal,
            deliveryFeeSnapshot: quote.deliveryFee,
            addonFeeTotal: quote.addonFee,
            discountAmount: quote.discountAmount,
            promoCode: appliedPromoCode,
            promoDiscountAmount,
            totalPrice: finalTotal,
            depositSnapshot: quote.depositAmount,
            initialPaymentDue: quote.initialPaymentDue,
            remainingAmount: finalRemaining,
            vehicleNameSnapshot: model.name,
            vehicleReferenceSnapshot: vehicle.reference,
            modificationHistory: [],
            statusHistory: [
              {
                status: 'PENDING',
                changedAt: new Date().toISOString(),
                changedBy: req.user.email ?? 'Khách hàng',
                note: 'Khách hàng tạo yêu cầu thuê xe',
              },
            ],
          }
        }

        // ====================================================================
        // UPDATE OPERATION (Customer Modify vs Customer Cancel vs Admin Transition)
        // ====================================================================
        const actor = req.user?.collection === 'admins' ? 'admin' : 'customer'
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
                { status: { in: ['PENDING', 'CONFIRMED', 'REFUNDED'] } },
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
          const nextDeliveryRequested =
            modInput.deliveryRequested !== undefined
              ? Boolean(modInput.deliveryRequested)
              : Boolean(originalDoc.deliveryRequested)
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
          pushDiff('note', 'Ghi chú hành trình', originalDoc.note, nextNote)
          pushDiff('promoCode', 'Mã khuyến mãi', oldPromo, nextRawPromo)

          if (changes.length === 0) {
            throw new APIError('Thông tin đơn thuê chưa có thay đổi nào để lưu.', 400)
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
                },
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

          // Recalculate quote from authoritative vehicle policy
          const quote = calculateRentalQuote({
            startDate: nextStartDate,
            endDate: nextEndDate,
            dailyPrice: vehicle.pricePerDay,
            weeklyPrice: vehicle.pricePerWeek,
            monthlyPrice: vehicle.pricePerMonth,
            weekendSurcharge: vehicle.weekendSurcharge,
            holidaySurcharge: vehicle.holidaySurcharge,
            deliveryRequested: nextDeliveryRequested,
            vehicleDeliveryFee: vehicle.deliveryFee,
            addonKeys: nextAddonKeys,
            vehicleDeposit: vehicle.depositAmount,
          })

          let appliedPromoCode: string | null = null
          let promoDiscountAmount = 0
          if (oldPromo && oldPromo !== nextRawPromo) {
            const oldPromoRes = await req.payload.find({
              collection: 'promotions',
              overrideAccess: true,
              req,
              depth: 0,
              limit: 1,
              where: { code: { equals: oldPromo } },
            })
            const oldPromoDoc = oldPromoRes.docs[0]
            if (oldPromoDoc) {
              await req.payload.update({
                collection: 'promotions',
                id: oldPromoDoc.id,
                overrideAccess: true,
                req,
                context: { skipAudit: true },
                data: { usedCount: Math.max(0, (oldPromoDoc.usedCount ?? 1) - 1) },
              })
            }
          }
          if (nextRawPromo) {
            const promoRes = await req.payload.find({
              collection: 'promotions',
              overrideAccess: true,
              req,
              depth: 0,
              limit: 1,
              where: { code: { equals: nextRawPromo } },
            })
            const promo = promoRes.docs[0]
            const today = businessToday()
            const isSamePromo = nextRawPromo === oldPromo
            if (
              !promo ||
              !promo.active ||
              (promo.appliesTo !== 'ALL' && promo.appliesTo !== 'RENT') ||
              (promo.validFrom && today < promo.validFrom) ||
              (promo.validTo && today > promo.validTo) ||
              (promo.minDays && quote.totalDays < promo.minDays) ||
              (!isSamePromo &&
                promo.usageLimit != null &&
                (promo.usedCount ?? 0) >= promo.usageLimit)
            ) {
              throw new APIError(
                'Mã khuyến mãi không hợp lệ hoặc không đủ điều kiện cho khoảng ngày thuê mới.',
                400,
              )
            }
            const rawDiscount =
              promo.discountType === 'PERCENT'
                ? Math.round((quote.estimatedTotal * promo.discountValue) / 100)
                : promo.discountValue
            const cappedByMax =
              promo.maxDiscount != null ? Math.min(rawDiscount, promo.maxDiscount) : rawDiscount
            promoDiscountAmount = Math.max(0, Math.min(cappedByMax, quote.estimatedTotal))
            appliedPromoCode = promo.code
            if (!isSamePromo) {
              await req.payload.update({
                collection: 'promotions',
                id: promo.id,
                overrideAccess: true,
                req,
                context: { skipAudit: true },
                data: { usedCount: (promo.usedCount ?? 0) + 1 },
              })
            }
          }

          const finalTotal = Math.max(0, quote.estimatedTotal - promoDiscountAmount)
          const finalRemaining = Math.max(0, finalTotal - quote.initialPaymentDue)
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
            pickupLocation: nextPickupLocation || null,
            returnLocation: nextReturnLocation || null,
            deliveryRequested: nextDeliveryRequested,
            addonServices: nextAddonServices || null,
            customerPhone: nextCustomerPhone || null,
            customerEmail: nextCustomerEmail || null,
            note: nextNote || null,
            totalDays: quote.totalDays,
            dailyPriceSnapshot: quote.dailyPrice,
            baseRentPrice: quote.basePrice,
            weekendSurchargeTotal: quote.weekendSurchargeTotal + quote.holidaySurchargeTotal,
            deliveryFeeSnapshot: quote.deliveryFee,
            addonFeeTotal: quote.addonFee,
            discountAmount: quote.discountAmount,
            promoCode: appliedPromoCode,
            promoDiscountAmount,
            totalPrice: finalTotal,
            depositSnapshot: quote.depositAmount,
            initialPaymentDue: quote.initialPaymentDue,
            remainingAmount: finalRemaining,
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
                newDeposit: quote.depositAmount,
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
        const next =
          actor === 'customer' && req.context.noriCustomerCancel === true
            ? 'CANCELLED'
            : (data.status ?? originalDoc.status)
        if (
          next !== originalDoc.status &&
          !canTransition(
            originalDoc.status as BookingStatus,
            next as BookingStatus,
            actor,
            originalDoc.startDate,
            businessToday(),
          )
        )
          throw new APIError('Không thể chuyển trạng thái đơn thuê theo yêu cầu.', 409)

        let expectedContactDate = originalDoc.expectedContactDate
        let workingHoursSnapshot = originalDoc.workingHoursSnapshot
        let isUrgentApproval = Boolean(originalDoc.isUrgentApproval)

        if (next === 'CONFIRMED' && originalDoc.status !== 'CONFIRMED') {
          const site = await req.payload.findGlobal({
            slug: 'nori-site',
            req,
            overrideAccess: true,
            draft: false,
            depth: 0,
          })
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
              startDate: String(originalDoc.startDate),
              pickupTime: String(originalDoc.pickupTime ?? '08:00'),
            },
          )
          expectedContactDate = slot.expectedContactDate
          workingHoursSnapshot = slot.workingHoursLabel
          isUrgentApproval = slot.isUrgent
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
          deliveryRequested: originalDoc.deliveryRequested,
          addonServices: originalDoc.addonServices,
          customerPhone: originalDoc.customerPhone,
          customerEmail: originalDoc.customerEmail,
          totalDays: originalDoc.totalDays,
          dailyPriceSnapshot: originalDoc.dailyPriceSnapshot,
          baseRentPrice: originalDoc.baseRentPrice,
          weekendSurchargeTotal: originalDoc.weekendSurchargeTotal,
          deliveryFeeSnapshot: originalDoc.deliveryFeeSnapshot,
          addonFeeTotal: originalDoc.addonFeeTotal,
          discountAmount: originalDoc.discountAmount,
          promoCode: originalDoc.promoCode,
          promoDiscountAmount: originalDoc.promoDiscountAmount,
          totalPrice: originalDoc.totalPrice,
          depositSnapshot: originalDoc.depositSnapshot,
          initialPaymentDue: originalDoc.initialPaymentDue,
          remainingAmount: originalDoc.remainingAmount,
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
                summary: `Khách hàng chỉnh sửa đơn chờ duyệt ${doc.bookingKey}: ${formatMoney(latestMod?.previousTotalPrice)} → ${formatMoney(latestMod?.newTotalPrice)}`,
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

            if (existingNotif.docs.length === 0) {
              await req.payload.create({
                collection: 'notifications',
                req,
                overrideAccess: true,
                data: {
                  eventKey: `BOOKING_CONFIRMED:${doc.id}`,
                  customer: customerId,
                  booking: doc.id,
                  type: 'BOOKING_CONFIRMED',
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
                  hotline: site.phone ?? '',
                  isUrgent,
                  paymentConfirmed: confirmedPayments.totalDocs > 0,
                  superseded: false,
                  isRead: false,
                  popupDismissed: false,
                },
              })
            }

            if (existingConsult.docs.length === 0) {
              await req.payload.create({
                collection: 'consultations',
                req,
                overrideAccess: true,
                data: {
                  consultationKey: `BOOKING_APPROVAL:${doc.id}`,
                  booking: doc.id,
                  customer: customerId,
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

          // Suppress misleading confirmation popup & cancel open consultation if booking is later cancelled/rejected (NT-18)
          if (['CANCELLED', 'REJECTED'].includes(doc.status)) {
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
          }

          if (doc.status === 'ONGOING' && vehicleId) {
            await req.payload.update({
              collection: 'vehicles',
              id: vehicleId,
              req,
              overrideAccess: true,
              data: { operationStatus: 'RENTED' },
            })
          } else if (['CANCELLED', 'REJECTED', 'COMPLETED'].includes(doc.status)) {
            await req.payload.delete({
              collection: 'rental-days',
              where: { bookingKey: { equals: doc.bookingKey } },
              req,
              overrideAccess: true,
            })
            if (vehicleId) {
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
                    data: { operationStatus: 'RESERVED' },
                  })
                }
              } else if (vehicle?.operationStatus === 'RENTED') {
                await req.payload.update({
                  collection: 'vehicles',
                  id: vehicleId,
                  req,
                  overrideAccess: true,
                  data: {
                    operationStatus: 'READY',
                    ...(doc.status === 'COMPLETED' && typeof doc.returnOdometer === 'number'
                      ? { odometer: doc.returnOdometer }
                      : {}),
                    ...(doc.status === 'COMPLETED' &&
                    typeof doc.returnCondition === 'string' &&
                    doc.returnCondition.trim()
                      ? { condition: doc.returnCondition.trim() }
                      : {}),
                  },
                })
              } else if (
                doc.status === 'COMPLETED' &&
                (typeof doc.returnOdometer === 'number' ||
                  (typeof doc.returnCondition === 'string' && doc.returnCondition.trim()))
              ) {
                await req.payload.update({
                  collection: 'vehicles',
                  id: vehicleId,
                  req,
                  overrideAccess: true,
                  data: {
                    ...(typeof doc.returnOdometer === 'number'
                      ? { odometer: doc.returnOdometer }
                      : {}),
                    ...(typeof doc.returnCondition === 'string' && doc.returnCondition.trim()
                      ? { condition: doc.returnCondition.trim() }
                      : {}),
                  },
                })
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
      name: 'depositSnapshot',
      label: 'Tiền đặt cọc đảm bảo (tách riêng)',
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
