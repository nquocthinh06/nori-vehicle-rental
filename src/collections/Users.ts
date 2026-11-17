import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { isAdmin, adminField, ownAccount } from '@/access/nori'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Khách hàng', plural: 'Khách hàng' },
  auth: { tokenExpiration: 7200, maxLoginAttempts: 8, lockTime: 600_000 },
  admin: {
    useAsTitle: 'fullName',
    group: 'NORI · Khách hàng',
    defaultColumns: ['fullName', 'email', 'status'],
  },
  access: {
    admin: () => false,
    create: () => true,
    read: ownAccount,
    update: ownAccount,
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
  ],
  versions: false,
}
