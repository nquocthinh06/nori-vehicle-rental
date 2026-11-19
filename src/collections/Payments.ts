import { APIError, type CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { paymentStatusLabels, relationId } from '@/lib/rental-rules'

const paymentAudit = auditCollection({
  entity: 'payment',
  entityName: 'giao dịch thanh toán',
  label: (doc) => String(doc.reference ?? doc.id),
  statusField: 'status',
  statusLabels: paymentStatusLabels,
  fields: {
    amount: 'Số tiền',
    receivedAmount: 'Số tiền thực nhận',
    refundedAmount: 'Số tiền hoàn',
    method: 'Phương thức',
    paymentType: 'Loại giao dịch',
    reconciliationStatus: 'Trạng thái đối soát',
  },
})

export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'Giao dịch thanh toán', plural: 'Thanh toán & Hoàn tiền' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Vận hành',
    defaultColumns: [
      'reference',
      'paymentType',
      'method',
      'provider',
      'amount',
      'receivedAmount',
      'status',
      'paidAt',
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

        if (data.expectedAmount === undefined && originalDoc?.expectedAmount == null) {
          data.expectedAmount = Number(data.amount ?? originalDoc?.amount ?? 0)
        }
        if (
          nextStatus === 'CONFIRMED' &&
          data.receivedAmount === undefined &&
          (originalDoc?.receivedAmount == null || Number(originalDoc.receivedAmount) === 0)
        ) {
          data.receivedAmount = Number(data.amount ?? originalDoc?.amount ?? 0)
        }

        const bookingId = relationId(data.booking ?? originalDoc?.booking)
        const allowLateWebhook = req.context?.allowLateWebhookRecord === true
        if (bookingId && nextStatus !== 'CANCELLED' && nextType !== 'REFUND' && !allowLateWebhook) {
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
        { label: 'Tiền đặt cọc giữ xe', value: 'DEPOSIT' },
        { label: 'Tiền thuê xe còn lại', value: 'RENTAL_FEE' },
        { label: 'Thanh toán toàn bộ tiền thuê', value: 'FULL_PAYMENT' },
        { label: 'Tiền cọc bảo đảm tài sản', value: 'SECURITY_DEPOSIT' },
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
        { label: 'VietQR động (SePay)', value: 'VIETQR_SEPAY' },
        { label: 'VietQR trực tuyến (Mô phỏng)', value: 'ONLINE_MOCK' },
        { label: 'Chuyển khoản ngân hàng', value: 'BANK_TRANSFER' },
        { label: 'Tiền mặt tại điểm giao nhận', value: 'CASH' },
        { label: 'Quẹt thẻ POS tại quầy', value: 'CARD_POS' },
      ],
      defaultValue: 'BANK_TRANSFER',
      required: true,
    },
    {
      name: 'provider',
      label: 'Nhà cung cấp thanh toán',
      type: 'select',
      options: [
        { label: 'Đối soát thủ công NORI', value: 'MANUAL' },
        { label: 'Mock Payment Provider', value: 'MOCK' },
        { label: 'SePay VietQR', value: 'SEPAY' },
        { label: 'PayOS (Mở rộng)', value: 'PAYOS' },
        { label: 'VNPay (Mở rộng)', value: 'VNPAY' },
        { label: 'MoMo (Mở rộng)', value: 'MOMO' },
        { label: 'ZaloPay (Mở rộng)', value: 'ZALOPAY' },
      ],
      defaultValue: 'MANUAL',
      index: true,
    },
    {
      name: 'environment',
      label: 'Môi trường giao dịch',
      type: 'select',
      options: [
        { label: 'MOCK', value: 'MOCK' },
        { label: 'SANDBOX', value: 'SANDBOX' },
        { label: 'PRODUCTION', value: 'PRODUCTION' },
      ],
      defaultValue: 'MOCK',
      index: true,
    },
    {
      name: 'currency',
      label: 'Đơn vị tiền tệ',
      type: 'text',
      defaultValue: 'VND',
    },
    { name: 'amount', label: 'Số tiền yêu cầu (VNĐ)', type: 'number', required: true, min: 1 },
    { name: 'expectedAmount', label: 'Số tiền kỳ vọng (VNĐ)', type: 'number', min: 0 },
    {
      name: 'receivedAmount',
      label: 'Số tiền thực nhận đã xác minh (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'refundedAmount',
      label: 'Số tiền đã hoàn trả (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'overpaidAmount',
      label: 'Số tiền chuyển thừa (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Chờ thanh toán', value: 'PENDING' },
        { label: 'Đang xác minh', value: 'PROCESSING' },
        { label: 'Đã xác nhận', value: 'CONFIRMED' },
        { label: 'Thanh toán thiếu', value: 'PARTIALLY_PAID' },
        { label: 'Cần đối soát', value: 'REVIEW_REQUIRED' },
        { label: 'Giao dịch thất bại', value: 'FAILED' },
        { label: 'Đã hết hạn', value: 'EXPIRED' },
        { label: 'Đang xử lý hoàn tiền', value: 'REFUND_PENDING' },
        { label: 'Đã hoàn tiền một phần', value: 'PARTIALLY_REFUNDED' },
        { label: 'Đã hoàn tiền', value: 'REFUNDED' },
        { label: 'Đã hủy', value: 'CANCELLED' },
      ],
      defaultValue: 'CONFIRMED',
      required: true,
      index: true,
    },
    {
      name: 'reconciliationStatus',
      label: 'Trạng thái đối soát',
      type: 'select',
      options: [
        { label: 'Bình thường', value: 'NONE' },
        { label: 'Khớp tự động', value: 'MATCHED' },
        { label: 'Chuyển thiếu tiền', value: 'UNDERPAID' },
        { label: 'Chuyển thừa tiền', value: 'OVERPAID' },
        { label: 'Thanh toán đến muộn / Đơn đã đóng', value: 'LATE_PAYMENT' },
        { label: 'Chưa xác định đơn thuê', value: 'UNMATCHED' },
        { label: 'Xác nhận thủ công', value: 'MANUAL_OVERRIDE' },
        { label: 'Đã xử lý đối soát', value: 'RESOLVED' },
      ],
      defaultValue: 'NONE',
      index: true,
    },
    {
      name: 'providerTransactionId',
      label: 'Mã giao dịch phía nhà cung cấp / Ngân hàng',
      type: 'text',
      index: true,
    },
    {
      name: 'providerPaymentRef',
      label: 'Mã tham chiếu chuyển khoản (Payment Code)',
      type: 'text',
      index: true,
    },
    { name: 'qrImageUrl', label: 'URL mã QR thanh toán', type: 'text' },
    { name: 'paymentUrl', label: 'Đường dẫn thanh toán', type: 'text' },
    { name: 'bankCode', label: 'Ngân hàng nhận', type: 'text' },
    { name: 'bankAccountNumber', label: 'Số tài khoản nhận', type: 'text' },
    { name: 'bankAccountName', label: 'Chủ tài khoản nhận', type: 'text' },
    { name: 'transferContent', label: 'Nội dung chuyển khoản', type: 'text' },
    { name: 'expiresAt', label: 'Thời điểm hết hạn yêu cầu', type: 'text' },
    { name: 'idempotencyKey', label: 'Khóa chống trùng lặp', type: 'text', index: true },
    { name: 'verifiedAt', label: 'Thời điểm xác minh', type: 'text' },
    { name: 'paidAt', label: 'Thời điểm giao dịch', type: 'text' },
    { name: 'recordedBy', label: 'Người ghi nhận', type: 'text' },
    { name: 'failureReason', label: 'Lý do thất bại / Cảnh báo bất thường', type: 'text' },
    { name: 'reconciliationNote', label: 'Ghi chú đối soát', type: 'textarea', maxLength: 500 },
    { name: 'note', label: 'Ghi chú chứng từ / mã giao dịch', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
