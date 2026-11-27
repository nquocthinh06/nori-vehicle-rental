import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, serverField } from '@/access/nori'

/**
 * Customer quality feedback (helpful / not helpful) for NORI AI responses.
 * Admin-only read/update; created strictly through validated server API /nori-api/ai/feedback.
 */
export const AIFeedback: CollectionConfig = {
  slug: 'ai-feedback',
  labels: { singular: 'Phản hồi chất lượng AI', plural: 'Phản hồi chất lượng AI' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'requestId',
    group: 'NORI · Hệ thống',
    defaultColumns: ['requestId', 'rating', 'reasonCategory', 'reviewStatus', 'createdAt'],
  },
  access: {
    create: () => false,
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['ai', 'read'],
        ['reports', 'read'],
        ['customers', 'read'],
      ]),
    update: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['ai', 'update'],
        ['settings', 'update'],
      ]),
    delete: () => false,
  },
  fields: [
    {
      name: 'requestId',
      label: 'Mã yêu cầu AI',
      type: 'text',
      required: true,
      index: true,
      access: { update: serverField },
    },
    {
      name: 'rating',
      label: 'Đánh giá',
      type: 'select',
      options: [
        { label: 'Hữu ích', value: 'HELPFUL' },
        { label: 'Chưa hữu ích', value: 'NOT_HELPFUL' },
      ],
      required: true,
      index: true,
    },
    {
      name: 'reasonCategory',
      label: 'Phân loại phản hồi',
      type: 'select',
      options: [
        { label: 'Chính xác & hữu ích', value: 'ACCURATE' },
        { label: 'Sai thông tin giá thuê', value: 'WRONG_PRICE' },
        { label: 'Đề xuất xe chưa phù hợp', value: 'WRONG_RECOMMENDATION' },
        { label: 'Xe không còn trống', value: 'UNAVAILABLE_VEHICLE' },
        { label: 'Thiếu thông tin chính sách', value: 'INCOMPLETE_INFO' },
        { label: 'Khác', value: 'OTHER' },
      ],
      defaultValue: 'OTHER',
    },
    { name: 'comment', label: 'Góp ý từ khách hàng', type: 'textarea', maxLength: 500 },
    { name: 'recommendedSlugs', label: 'Danh sách xe liên quan (JSON)', type: 'json' },
    {
      name: 'userType',
      label: 'Nhóm người dùng',
      type: 'select',
      options: ['GUEST', 'CUSTOMER'],
      defaultValue: 'GUEST',
    },
    {
      name: 'reviewStatus',
      label: 'Trạng thái rà soát',
      type: 'select',
      options: [
        { label: 'Chờ rà soát', value: 'NEW' },
        { label: 'Đang kiểm tra', value: 'REVIEWED' },
        { label: 'Đã xử lý', value: 'RESOLVED' },
      ],
      defaultValue: 'NEW',
      index: true,
    },
    {
      name: 'adminNote',
      label: 'Ghi chú rà soát của quản trị viên',
      type: 'textarea',
      maxLength: 500,
    },
  ],
  versions: false,
}
