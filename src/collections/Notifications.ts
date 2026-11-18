import type { CollectionConfig } from 'payload'
import { adminHasPermission, serverField } from '@/access/nori'

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'Thông báo khách hàng', plural: 'Thông báo khách hàng' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'title',
    group: 'NORI · Vận hành',
    defaultColumns: ['createdAt', 'customer', 'type', 'bookingKey', 'isRead', 'popupDismissed'],
  },
  access: {
    create: () => false,
    read: ({ req }) => {
      if (adminHasPermission(req.user, 'bookings', 'read')) return true
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    update: ({ req }) => {
      if (adminHasPermission(req.user, 'bookings', 'update')) return true
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    delete: () => false,
  },
  fields: [
    {
      name: 'eventKey',
      label: 'Khóa sự kiện chống trùng',
      type: 'text',
      unique: true,
      index: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'customer',
      label: 'Khách hàng nhận',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'booking',
      label: 'Đơn thuê liên quan',
      type: 'relationship',
      relationTo: 'bookings',
      index: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'type',
      label: 'Loại thông báo',
      type: 'select',
      options: [
        { label: 'Xác nhận đơn thuê', value: 'BOOKING_CONFIRMED' },
        { label: 'Cập nhật đơn thuê', value: 'BOOKING_UPDATED' },
        { label: 'Lịch liên hệ tư vấn', value: 'CONSULTATION_UPDATE' },
        { label: 'Hệ thống', value: 'SYSTEM' },
      ],
      defaultValue: 'BOOKING_CONFIRMED',
      required: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'title',
      label: 'Tiêu đề',
      type: 'text',
      required: true,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'message',
      label: 'Nội dung thông báo',
      type: 'textarea',
      required: true,
      access: { create: serverField, update: serverField },
    },
    { name: 'bookingKey', type: 'text', access: { create: serverField, update: serverField } },
    { name: 'vehicleName', type: 'text', access: { create: serverField, update: serverField } },
    { name: 'startDate', type: 'text', access: { create: serverField, update: serverField } },
    { name: 'endDate', type: 'text', access: { create: serverField, update: serverField } },
    { name: 'pickupTime', type: 'text', access: { create: serverField, update: serverField } },
    { name: 'returnTime', type: 'text', access: { create: serverField, update: serverField } },
    {
      name: 'expectedContactDate',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'workingHoursLabel',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'customerPhoneMasked',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    { name: 'hotline', type: 'text', access: { create: serverField, update: serverField } },
    {
      name: 'isUrgent',
      type: 'checkbox',
      defaultValue: false,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'paymentConfirmed',
      type: 'checkbox',
      defaultValue: false,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'superseded',
      label: 'Đã thu hồi do đơn hủy/thay đổi',
      type: 'checkbox',
      defaultValue: false,
      access: { create: serverField, update: serverField },
    },
    {
      name: 'isRead',
      label: 'Đã đọc',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
    {
      name: 'readAt',
      label: 'Thời điểm đọc',
      type: 'text',
    },
    {
      name: 'popupDismissed',
      label: 'Đã đóng Popup xác nhận',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'popupDismissedAt',
      label: 'Thời điểm đóng Popup',
      type: 'text',
    },
  ],
  versions: false,
}
