import { APIError, type CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminPermission, customerOnly, serverField } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { relationId } from '@/lib/rental-rules'

const reviewAudit = auditCollection({
  entity: 'review',
  entityName: 'đánh giá',
  label: (doc) => String(doc.title ?? doc.id),
  statusField: 'status',
  statusLabels: { PUBLISHED: 'Đang hiển thị', HIDDEN: 'Đang ẩn' },
  logCreate: false,
})

export const Reviews: CollectionConfig = {
  slug: 'reviews',
  labels: { singular: 'Đánh giá khách hàng', plural: 'Đánh giá khách hàng' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'title',
    group: 'NORI · Vận hành',
    defaultColumns: ['model', 'customer', 'rating', 'status', 'createdAt'],
  },
  access: {
    create: customerOnly,
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['customers', 'read'],
        ['vehicles', 'read'],
        ['models', 'read'],
      ])
        ? true
        : { status: { equals: 'PUBLISHED' } },
    update: adminPermission('customers', 'update'),
    delete: adminPermission('customers', 'delete'),
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE')
          throw new APIError('Vui lòng đăng nhập tài khoản khách hàng.', 401)
        const bookingID = relationId(data.booking)
        if (!bookingID) throw new APIError('Chỉ đơn thuê đã hoàn thành mới được gửi đánh giá.', 400)
        const booking = await req.payload.findByID({
          collection: 'bookings',
          id: bookingID,
          req,
          user: req.user,
          overrideAccess: false,
          depth: 1,
        })
        if (relationId(booking.customer) !== req.user.id || booking.status !== 'COMPLETED') {
          throw new APIError(
            'Chỉ khách hàng đã hoàn thành chuyến thuê này mới được gửi đánh giá.',
            403,
          )
        }
        const vehicleObj = typeof booking.vehicle === 'object' ? booking.vehicle : null
        const vehicleID = relationId(booking.vehicle)
        const modelID = vehicleObj ? relationId(vehicleObj.model) : relationId(data.model)
        if (!modelID) throw new APIError('Không xác định được dòng xe của đơn thuê.', 400)
        return {
          ...data,
          customer: req.user.id,
          booking: booking.id,
          vehicle: vehicleID,
          model: modelID,
          status: 'PUBLISHED',
        }
      },
    ],
    afterChange: [reviewAudit.afterChange],
    afterDelete: [reviewAudit.afterDelete],
  },
  fields: [
    {
      name: 'customer',
      label: 'Khách hàng',
      type: 'relationship',
      relationTo: 'users',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'booking',
      label: 'Đơn thuê đã hoàn thành',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      unique: true,
      access: { update: serverField },
    },
    {
      name: 'model',
      label: 'Dòng xe',
      type: 'relationship',
      relationTo: 'vehicle-models',
      required: true,
      index: true,
      access: { update: serverField },
    },
    {
      name: 'vehicle',
      label: 'Xe thực tế',
      type: 'relationship',
      relationTo: 'vehicles',
      access: { update: serverField },
    },
    { name: 'rating', label: 'Số sao (1–5)', type: 'number', min: 1, max: 5, required: true },
    { name: 'title', label: 'Tiêu đề ngắn', type: 'text', maxLength: 120 },
    {
      name: 'comment',
      label: 'Nội dung đánh giá',
      type: 'textarea',
      required: true,
      maxLength: 1000,
    },
    {
      name: 'status',
      label: 'Trạng thái hiển thị',
      type: 'select',
      options: ['PUBLISHED', 'HIDDEN'],
      defaultValue: 'PUBLISHED',
      access: { create: serverField },
    },
  ],
  versions: false,
}
