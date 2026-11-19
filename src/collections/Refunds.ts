import { APIError, type CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { refundStatusLabels } from '@/lib/rental-rules'

const refundAudit = auditCollection({
  entity: 'refund',
  entityName: 'yêu cầu hoàn tiền',
  label: (doc) => String(doc.reference ?? doc.id),
  statusField: 'status',
  statusLabels: refundStatusLabels,
  fields: {
    amount: 'Số tiền hoàn',
    reason: 'Lý do hoàn tiền',
    reconciliationNote: 'Ghi chú đối soát',
  },
})

export const Refunds: CollectionConfig = {
  slug: 'refunds',
  labels: { singular: 'Yêu cầu hoàn tiền', plural: 'Quản lý hoàn tiền' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Vận hành',
    defaultColumns: [
      'reference',
      'booking',
      'payment',
      'refundType',
      'amount',
      'status',
      'requestedAt',
    ],
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
      async ({ data, operation, originalDoc }) => {
        if (!data) return data
        if (operation === 'create' && !data.reference) {
          data.reference = `REF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        }
        if (operation === 'create' && !data.requestedAt) {
          data.requestedAt = new Date().toISOString()
        }
        if (
          operation === 'update' &&
          originalDoc?.status === 'REFUNDED' &&
          data.status &&
          data.status !== 'REFUNDED'
        ) {
          throw new APIError('Khoản hoàn tiền đã hoàn tất không thể chuyển ngược trạng thái.', 409)
        }
        return data
      },
    ],
    afterChange: [refundAudit.afterChange],
  },
  fields: [
    {
      name: 'reference',
      label: 'Mã yêu cầu hoàn tiền',
      type: 'text',
      unique: true,
      index: true,
    },
    {
      name: 'payment',
      label: 'Giao dịch gốc liên quan',
      type: 'relationship',
      relationTo: 'payments',
      index: true,
    },
    {
      name: 'booking',
      label: 'Đơn thuê liên quan',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      index: true,
    },
    {
      name: 'customer',
      label: 'Khách hàng',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'refundType',
      label: 'Phân loại hoàn tiền',
      type: 'select',
      options: [
        { label: 'Hoàn tiền do hủy đơn', value: 'CANCELLATION' },
        { label: 'Hoàn tiền đặt cọc giữ xe', value: 'DEPOSIT_RETURN' },
        { label: 'Hoàn tiền chuyển khoản thừa', value: 'OVERPAYMENT' },
        { label: 'Hoàn tiền một phần / Điều chỉnh', value: 'PARTIAL_ADJUSTMENT' },
        { label: 'Hoàn cọc bảo đảm tài sản', value: 'SECURITY_DEPOSIT_RETURN' },
      ],
      defaultValue: 'DEPOSIT_RETURN',
      required: true,
    },
    {
      name: 'amount',
      label: 'Số tiền hoàn (VNĐ)',
      type: 'number',
      required: true,
      min: 1,
    },
    {
      name: 'reason',
      label: 'Lý do hoàn tiền',
      type: 'textarea',
      required: true,
      maxLength: 500,
    },
    {
      name: 'status',
      label: 'Trạng thái hoàn tiền',
      type: 'select',
      options: [
        { label: 'Chờ duyệt hoàn tiền', value: 'REQUESTED' },
        { label: 'Đã duyệt — Chờ chi hoàn', value: 'APPROVED' },
        { label: 'Đang xử lý hoàn tiền', value: 'PROCESSING' },
        { label: 'Đã hoàn tiền thành công', value: 'REFUNDED' },
        { label: 'Từ chối hoàn tiền', value: 'REJECTED' },
        { label: 'Hoàn tiền thất bại', value: 'FAILED' },
      ],
      defaultValue: 'REQUESTED',
      required: true,
      index: true,
    },
    {
      name: 'provider',
      label: 'Kênh thực hiện',
      type: 'select',
      options: [
        { label: 'Đối soát thủ công NORI', value: 'MANUAL' },
        { label: 'Mock Provider', value: 'MOCK' },
        { label: 'SePay VietQR (Chuyển khoản hoàn thủ công)', value: 'SEPAY' },
      ],
      defaultValue: 'MANUAL',
    },
    {
      name: 'providerRefundId',
      label: 'Mã giao dịch hoàn tiền / Ủy nhiệm chi',
      type: 'text',
      index: true,
    },
    { name: 'requestedBy', label: 'Người yêu cầu', type: 'text' },
    {
      name: 'requestedByType',
      label: 'Vai trò người yêu cầu',
      type: 'select',
      options: [
        { label: 'Khách hàng', value: 'CUSTOMER' },
        { label: 'Quản trị viên', value: 'ADMIN' },
        { label: 'Hệ thống', value: 'SYSTEM' },
      ],
      defaultValue: 'ADMIN',
    },
    { name: 'approvedBy', label: 'Admin phê duyệt', type: 'text' },
    { name: 'completedBy', label: 'Admin xác nhận hoàn tất', type: 'text' },
    { name: 'requestedAt', label: 'Thời điểm yêu cầu', type: 'text' },
    { name: 'approvedAt', label: 'Thời điểm phê duyệt', type: 'text' },
    { name: 'completedAt', label: 'Thời điểm hoàn tất', type: 'text' },
    {
      name: 'reconciliationNote',
      label: 'Ghi chú đối soát & bằng chứng hoàn tiền',
      type: 'textarea',
      maxLength: 500,
    },
    {
      name: 'bankAccountInfo',
      label: 'Thông tin tài khoản nhận hoàn tiền đã xác minh',
      type: 'text',
      maxLength: 300,
    },
  ],
  versions: false,
}
