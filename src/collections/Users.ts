import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { adminField, adminHasPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'

const userAudit = auditCollection({
  entity: 'user',
  entityName: 'tài khoản khách hàng',
  label: (doc) => String(doc.email ?? doc.fullName ?? doc.id),
  statusField: 'status',
  statusLabels: { ACTIVE: 'Hoạt động', DISABLED: 'Tạm khóa' },
  logCreate: false,
})

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Khách hàng', plural: 'Khách hàng' },
  auth: { tokenExpiration: 604_800, maxLoginAttempts: 8, lockTime: 600_000 },
  admin: {
    useAsTitle: 'fullName',
    group: 'NORI · Khách hàng',
    defaultColumns: ['fullName', 'email', 'status'],
  },
  access: {
    admin: () => false,
    create: () => true,
    read: ({ req }) => {
      if (adminHasPermission(req.user, 'customers', 'read')) return true
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { id: { equals: req.user.id } }
      }
      return false
    },
    update: ({ req }) => {
      if (adminHasPermission(req.user, 'customers', 'update')) return true
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { id: { equals: req.user.id } }
      }
      return false
    },
    delete: () => false,
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data
        if (data.email) data.email = String(data.email).trim().toLowerCase()
        if (data.fullName) data.fullName = String(data.fullName).trim()
        if (
          (operation === 'create' || data.password) &&
          (!data.password ||
            data.password.length < 8 ||
            data.password.length > 72 ||
            !/[A-Za-z]/.test(data.password) ||
            !/\d/.test(data.password))
        ) {
          throw new APIError('Mật khẩu cần 8–72 ký tự, có ít nhất một chữ cái và một chữ số.', 400)
        }
        return data
      },
    ],
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user?.collection !== 'admins') {
          data.role = 'CUSTOMER'
          data.status = 'ACTIVE'
        }
        return data
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if (user.status !== 'ACTIVE')
          throw new APIError(
            'Không thể đăng nhập. Vui lòng kiểm tra thông tin hoặc liên hệ hỗ trợ.',
            401,
          )
      },
    ],
    afterChange: [userAudit.afterChange],
  },
  fields: [
    {
      name: 'fullName',
      label: 'Họ và tên',
      type: 'text',
      required: true,
      minLength: 2,
      maxLength: 100,
    },
    {
      name: 'phone',
      label: 'Số điện thoại',
      type: 'text',
      validate: (value: unknown) =>
        !value || /^\+?\d{9,15}$/.test(String(value)) || 'Số điện thoại cần 9–15 chữ số.',
    },
    {
      name: 'role',
      type: 'select',
      options: ['CUSTOMER'],
      defaultValue: 'CUSTOMER',
      required: true,
      saveToJWT: true,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: ['ACTIVE', 'DISABLED'],
      defaultValue: 'ACTIVE',
      required: true,
      saveToJWT: true,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'driverLicenseNumber',
      label: 'Số giấy phép lái xe',
      type: 'text',
      maxLength: 40,
    },
    {
      name: 'idCardNumber',
      label: 'Số CCCD / Hộ chiếu',
      type: 'text',
      maxLength: 40,
    },
    {
      name: 'verificationStatus',
      label: 'Trạng thái xác minh giấy tờ',
      type: 'select',
      options: [
        { label: 'Chưa xác minh', value: 'UNVERIFIED' },
        { label: 'Chờ duyệt', value: 'PENDING' },
        { label: 'Đã xác minh', value: 'VERIFIED' },
        { label: 'Từ chối', value: 'REJECTED' },
      ],
      defaultValue: 'UNVERIFIED',
      access: { create: adminField, update: adminField },
    },
    {
      name: 'verificationNote',
      label: 'Ghi chú xác minh giấy tờ (Admin)',
      type: 'text',
      maxLength: 300,
      access: { create: adminField, update: adminField },
    },
  ],
  versions: false,
}
