import { APIError, type CollectionConfig } from 'payload'
import { adminField, customerOnly, ownRecords, serverField } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import {
  bookingStatusLabels,
  businessToday,
  calculateRentalQuote,
  canTransition,
  parseAddonKeys,
  relationId,
  rentalDays,
  validateRentalDates,
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
          return {
            ...data,
            customer: req.user.id,
            bookingKey,
            status: 'PENDING',
            pickupTime:
              typeof data.pickupTime === 'string' && /^\d{2}:\d{2}$/.test(data.pickupTime)
                ? data.pickupTime
                : '08:00',
            returnTime:
              typeof data.returnTime === 'string' && /^\d{2}:\d{2}$/.test(data.returnTime)
                ? data.returnTime
                : '20:00',
            pickupLocation:
              typeof data.pickupLocation === 'string' && data.pickupLocation.trim()
                ? data.pickupLocation.trim().slice(0, 200)
                : (vehicle.pickupLocation ?? vehicle.location ?? ''),
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
        const actor = req.user?.collection === 'admins' ? 'admin' : 'customer'
        if (
          actor === 'customer' &&
          (req.user?.collection !== 'users' ||
            req.user.status !== 'ACTIVE' ||
            relationId(originalDoc.customer) !== req.user.id)
        )
          throw new APIError('Không tìm thấy đơn thuê.', 404)
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
        // Operational identity, dates and price snapshots remain immutable.
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
          deliveryRequested: originalDoc.deliveryRequested,
          addonServices: originalDoc.addonServices,
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
          statusHistory: nextHistory,
          status: next,
        }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (operation === 'update' && previousDoc?.status !== doc.status) {
          const vehicleId = relationId(doc.vehicle)
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
      label: 'Địa điểm nhận / trả xe',
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
