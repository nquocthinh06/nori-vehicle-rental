import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, serverField } from '@/access/nori'

/**
 * Durable append-mostly store of payment webhook & provider events for audit,
 * deduplication, replay protection, and failure recovery.
 * Never stores raw API secrets or authorization headers.
 */
export const PaymentEvents: CollectionConfig = {
  slug: 'payment-events',
  labels: { singular: 'Sự kiện Webhook thanh toán', plural: 'Lịch sử sự kiện Webhook' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'eventId',
    group: 'NORI · Vận hành',
    defaultColumns: [
      'receivedAt',
      'provider',
      'environment',
      'eventType',
      'externalTransactionId',
      'transferAmount',
      'verificationResult',
      'processingStatus',
    ],
  },
  access: {
    create: () => false,
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['payments', 'read'],
        ['reports', 'read'],
        ['admins', 'read'],
      ]),
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'eventId',
      label: 'Mã sự kiện duy nhất',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'provider',
      label: 'Nhà cung cấp',
      type: 'select',
      options: [
        { label: 'SePay VietQR', value: 'SEPAY' },
        { label: 'Mock Provider', value: 'MOCK' },
        { label: 'Thủ công', value: 'MANUAL' },
      ],
      defaultValue: 'SEPAY',
      required: true,
      index: true,
    },
    {
      name: 'environment',
      label: 'Môi trường',
      type: 'select',
      options: [
        { label: 'MOCK', value: 'MOCK' },
        { label: 'SANDBOX', value: 'SANDBOX' },
        { label: 'PRODUCTION', value: 'PRODUCTION' },
      ],
      defaultValue: 'MOCK',
      required: true,
      index: true,
    },
    {
      name: 'externalTransactionId',
      label: 'Mã giao dịch bên ngoài',
      type: 'text',
      index: true,
    },
    {
      name: 'paymentReference',
      label: 'Mã tham chiếu thanh toán',
      type: 'text',
      index: true,
    },
    {
      name: 'eventType',
      label: 'Loại sự kiện',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'transferAmount',
      label: 'Số tiền giao dịch (VNĐ)',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'verificationResult',
      label: 'Kết quả xác thực',
      type: 'select',
      options: [
        { label: 'Hợp lệ (Verified)', value: 'VERIFIED' },
        { label: 'Sai chữ ký / API Key', value: 'INVALID_SIGNATURE' },
        { label: 'Dữ liệu không hợp lệ', value: 'INVALID_PAYLOAD' },
        { label: 'Sai môi trường / Tài khoản', value: 'ENVIRONMENT_MISMATCH' },
        { label: 'Sự kiện trùng lặp', value: 'DUPLICATE' },
      ],
      defaultValue: 'VERIFIED',
      required: true,
    },
    {
      name: 'processingStatus',
      label: 'Trạng thái xử lý',
      type: 'select',
      options: [
        { label: 'Đã xử lý thành công', value: 'PROCESSED' },
        { label: 'Bỏ qua do trùng lặp / sự kiện cũ', value: 'IGNORED_DUPLICATE' },
        { label: 'Đưa vào đối soát (Review Required)', value: 'REVIEW_REQUIRED' },
        { label: 'Xử lý thất bại', value: 'FAILED' },
        { label: 'Từ chối bảo mật', value: 'REJECTED' },
      ],
      defaultValue: 'PROCESSED',
      required: true,
      index: true,
    },
    {
      name: 'retryCount',
      label: 'Số lần nhận / thử lại',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'receivedAt',
      label: 'Thời điểm nhận',
      type: 'text',
      required: true,
    },
    {
      name: 'processedAt',
      label: 'Thời điểm xử lý',
      type: 'text',
    },
    {
      name: 'errorReason',
      label: 'Chi tiết kết quả / Lỗi',
      type: 'text',
    },
    {
      name: 'payment',
      label: 'Giao dịch liên kết',
      type: 'relationship',
      relationTo: 'payments',
      index: true,
    },
    {
      name: 'booking',
      label: 'Đơn thuê liên kết',
      type: 'relationship',
      relationTo: 'bookings',
      index: true,
    },
    {
      name: 'sanitizedPayload',
      label: 'Dữ liệu sự kiện đã lọc thông tin nhạy cảm',
      type: 'textarea',
      maxLength: 8000,
    },
  ],
  versions: false,
}
