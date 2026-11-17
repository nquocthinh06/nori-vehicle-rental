import { APIError, type CollectionConfig } from 'payload'
import { adminField, customerOnly, ownRecords, serverField } from '@/access/nori'
import {
  businessToday,
  canTransition,
  relationId,
  rentalDays,
  validateRentalDates,
  type BookingStatus,
} from '@/lib/rental-rules'

export const Bookings: CollectionConfig = {
  slug: 'bookings',
  labels: { singular: 'Đơn thuê', plural: 'Đơn thuê xe' },
  admin: {
    useAsTitle: 'bookingKey',
    group: 'NORI · Vận hành',
    defaultColumns: ['bookingKey', 'customer', 'vehicle', 'startDate', 'endDate', 'status'],
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
          if (vehicle.status !== 'ACTIVE' || vehicle.intent === 'SALE' || !vehicle.pricePerDay)
            throw new APIError('Xe chưa có giá thuê hoặc chưa sẵn sàng nhận đặt mới.', 409)
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
          return {
            ...data,
            customer: req.user.id,
            bookingKey,
            status: 'PENDING',
            totalDays: dates.totalDays,
            dailyPriceSnapshot: vehicle.pricePerDay,
            totalPrice: dates.totalDays * vehicle.pricePerDay,
            vehicleNameSnapshot: model.name,
            vehicleReferenceSnapshot: vehicle.reference,
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
        return {
          ...data,
          customer: originalDoc.customer,
          vehicle: originalDoc.vehicle,
          bookingKey: originalDoc.bookingKey,
          startDate: originalDoc.startDate,
          endDate: originalDoc.endDate,
          totalDays: originalDoc.totalDays,
          dailyPriceSnapshot: originalDoc.dailyPriceSnapshot,
          totalPrice: originalDoc.totalPrice,
          vehicleNameSnapshot: originalDoc.vehicleNameSnapshot,
          vehicleReferenceSnapshot: originalDoc.vehicleReferenceSnapshot,
          status: next,
        }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (
          operation === 'update' &&
          previousDoc?.status !== doc.status &&
          ['CANCELLED', 'REJECTED', 'COMPLETED'].includes(doc.status)
        ) {
          await req.payload.delete({
            collection: 'rental-days',
            where: { bookingKey: { equals: doc.bookingKey } },
            req,
            overrideAccess: true,
          })
        }
        return doc
      },
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
      name: 'totalPrice',
      label: 'Tổng dự kiến (không phải đã thanh toán)',
      type: 'number',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: ['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'REJECTED'],
      defaultValue: 'PENDING',
      access: { create: serverField, update: adminField },
    },
  ],
  versions: false,
}
