import type { CollectionConfig } from 'payload'
import { adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { consultationStatusLabels } from '@/lib/rental-rules'

const consultationAudit = auditCollection({
  entity: 'consultation',
  entityName: 'yêu cầu tư vấn đơn thuê',
  label: (doc) => String(doc.bookingKeySnapshot ?? doc.consultationKey ?? doc.id),
  statusField: 'status',
  statusLabels: consultationStatusLabels,
  fields: {
    assignedStaffName: 'Nhân viên phụ trách',
    callbackScheduledAt: 'Lịch hẹn gọi lại',
    internalNote: 'Ghi chú nội bộ',
  },
})

export const Consultations: CollectionConfig = {
  slug: 'consultations',
  labels: { singular: 'Tư vấn đơn thuê', plural: 'Quản lý tư vấn đơn thuê' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'bookingKeySnapshot',
    group: 'NORI · Vận hành',
    defaultColumns: [
      'bookingKeySnapshot',
      'customerNameSnapshot',
      'expectedContactDate',
      'isUrgent',
      'assignedStaffName',
      'status',
    ],
  },
  access: {
    create: adminPermission('bookings', 'update'),
    read: adminPermission('bookings', 'read'),
    update: adminPermission('bookings', 'update'),
    delete: () => false,
  },
  hooks: {
    afterChange: [consultationAudit.afterChange],
  },
  fields: [
    {
      name: 'consultationKey',
      label: 'Khóa tư vấn duy nhất',
      type: 'text',
      unique: true,
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
    { name: 'bookingKeySnapshot', label: 'Mã đơn thuê', type: 'text' },
    { name: 'customerNameSnapshot', label: 'Tên khách hàng', type: 'text' },
    { name: 'customerPhoneSnapshot', label: 'Số điện thoại', type: 'text' },
    { name: 'customerEmailSnapshot', label: 'Email', type: 'text' },
    { name: 'vehicleNameSnapshot', label: 'Phương tiện thuê', type: 'text' },
    { name: 'startDateSnapshot', label: 'Ngày nhận xe', type: 'text' },
    { name: 'endDateSnapshot', label: 'Ngày trả xe', type: 'text' },
    { name: 'approvedAt', label: 'Thời điểm Admin duyệt', type: 'text', required: true },
    { name: 'approvedBy', label: 'Admin duyệt', type: 'text' },
    {
      name: 'expectedContactDate',
      label: 'Ngày dự kiến liên hệ (YYYY-MM-DD)',
      type: 'text',
      required: true,
      index: true,
    },
    { name: 'workingHoursWindow', label: 'Khung giờ liên hệ', type: 'text' },
    {
      name: 'isUrgent',
      label: 'Đơn thuê gấp cần ưu tiên',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'assignedStaff',
      label: 'Tài khoản nhân viên phụ trách',
      type: 'relationship',
      relationTo: 'admins',
    },
    { name: 'assignedStaffName', label: 'Nhân viên phụ trách', type: 'text' },
    {
      name: 'status',
      label: 'Trạng thái tư vấn',
      type: 'select',
      options: [
        { label: 'Chờ liên hệ', value: 'PENDING_CONTACT' },
        { label: 'Đang liên hệ', value: 'CONTACTING' },
        { label: 'Không nghe máy', value: 'NO_ANSWER' },
        { label: 'Hẹn liên hệ lại', value: 'CALLBACK_SCHEDULED' },
        { label: 'Đã tư vấn', value: 'CONSULTED' },
        { label: 'Hoàn thành', value: 'COMPLETED' },
        { label: 'Đã hủy', value: 'CANCELLED' },
      ],
      defaultValue: 'PENDING_CONTACT',
      required: true,
      index: true,
    },
    { name: 'callbackScheduledAt', label: 'Thời gian hẹn liên hệ lại', type: 'text' },
    { name: 'internalNote', label: 'Ghi chú nội bộ', type: 'textarea', maxLength: 2000 },
    {
      name: 'contactLogs',
      label: 'Lịch sử liên hệ tư vấn',
      type: 'array',
      fields: [
        { name: 'contactedAt', label: 'Thời điểm', type: 'text', required: true },
        { name: 'staffName', label: 'Nhân viên', type: 'text' },
        { name: 'outcome', label: 'Kết quả cuộc gọi', type: 'text', required: true },
        { name: 'note', label: 'Nội dung trao đổi', type: 'textarea' },
        { name: 'nextCallbackAt', label: 'Hẹn gọi lại', type: 'text' },
      ],
    },
  ],
  versions: false,
}
