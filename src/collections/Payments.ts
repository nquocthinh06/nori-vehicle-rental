import { APIError, type CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { relationId } from '@/lib/rental-rules'

const paymentAudit = auditCollection({
  entity: 'payment',
  entityName: 'giao dịch thanh toán',
  label: (doc) => String(doc.reference ?? doc.id),
  statusField: 'status',
  statusLabels: {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận thu',
    REFUNDED: 'Đã hoàn tiền',
    CANCELLED: 'Đã hủy',
  },
  fields: { amount: 'Số tiền', method: 'Phương thức', paymentType: 'Loại giao dịch' },
})

export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'Giao dịch thanh toán', plural: 'Thanh toán & Hoàn tiền' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Vận hành',
    defaultColumns: ['reference', 'paymentType', 'method', 'amount', 'status', 'paidAt'],
  },
  access: {
    create: adminPermission('payments', 'create'),
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['payments', 'read'],
          ['reports', 'read'],
          ['bookings', 'read'],
        ])
      ) {
        return true
      }
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    update: adminPermission('payments', 'update'),
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (!data) return data
        if (operation === 'create' && !data.reference) {
          data.reference = `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        }
        if (req.user?.email && !data.recordedBy) {
          data.recordedBy = req.user.email
        }

        const nextStatus = String(data.status ?? originalDoc?.status ?? 'CONFIRMED')
        const nextType = String(data.paymentType ?? originalDoc?.paymentType ?? 'DEPOSIT')
        if (
          operation === 'update' &&
          originalDoc?.status === 'REFUNDED' &&
          nextStatus !== 'REFUNDED'
        ) {
          throw new APIError('Giao dịch đã hoàn tiền không thể chuyển ngược trạng thái.', 409)
        }

        const bookingId = relationId(data.booking ?? originalDoc?.booking)
        if (bookingId && nextStatus !== 'CANCELLED' && nextType !== 'REFUND') {
          const booking = await req.payload
            .findByID({
              collection: 'bookings',
              id: bookingId,
              req,
              overrideAccess: true,
              depth: 0,
            })
            .catch(() => null)
          if (!booking) {
            throw new APIError('Đơn thuê liên kết không tồn tại.', 404)
          }
          if (['CANCELLED', 'REJECTED'].includes(String(booking.status ?? ''))) {
            throw new APIError(
              'Không thể ghi nhận hoặc xác nhận khoản thu cho đơn thuê đã hủy hoặc bị từ chối.',
              409,
            )
          }
        }
        return data
      },
    ],
    afterChange: [paymentAudit.afterChange],
  },
  fields: [
    { name: 'reference', label: 'Mã phiếu thu/chi', type: 'text', unique: true, index: true },
    { name: 'booking', label: 'Đơn thuê liên quan', type: 'relationship', relationTo: 'bookings' },
    {
      name: 'inquiry',
      label: 'Yêu cầu mua liên quan',
      type: 'relationship',
      relationTo: 'sales-inquiries',
    },
    { name: 'customer', label: 'Khách hàng', type: 'relationship', relationTo: 'users' },
    {
      name: 'paymentType',
      label: 'Loại giao dịch',
      type: 'select',
      options: [
        { label: 'Tiền đặt cọc', value: 'DEPOSIT' },
        { label: 'Tiền thuê xe', value: 'RENTAL_FEE' },
        { label: 'Phụ phí phát sinh', value: 'EXTRA_FEE' },
        { label: 'Đặt cọc mua xe', value: 'PURCHASE_DEPOSIT' },
        { label: 'Hoàn tiền / Hoàn cọc', value: 'REFUND' },
      ],
      defaultValue: 'DEPOSIT',
      required: true,
    },
    {
      name: 'method',
      label: 'Phương thức',
      type: 'select',
      options: [
        { label: 'Chuyển khoản ngân hàng', value: 'BANK_TRANSFER' },
        { label: 'Tiền mặt tại điểm giao nhận', value: 'CASH' },
        { label: 'Quẹt thẻ POS tại quầy', value: 'CARD_POS' },
      ],
      defaultValue: 'BANK_TRANSFER',
      required: true,
    },
    { name: 'amount', label: 'Số tiền (VNĐ)', type: 'number', required: true, min: 1 },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Chờ đối soát', value: 'PENDING' },
        { label: 'Đã xác nhận', value: 'CONFIRMED' },
        { label: 'Đã hoàn tiền', value: 'REFUNDED' },
        { label: 'Đã hủy', value: 'CANCELLED' },
      ],
      defaultValue: 'CONFIRMED',
      required: true,
      index: true,
    },
    { name: 'paidAt', label: 'Thời điểm giao dịch', type: 'text' },
    { name: 'recordedBy', label: 'Người ghi nhận', type: 'text' },
    { name: 'note', label: 'Ghi chú chứng từ / mã giao dịch', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
