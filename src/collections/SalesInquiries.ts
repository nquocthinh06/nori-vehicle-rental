import { APIError, type CollectionConfig } from 'payload'
import { customerOnly, ownRecords, serverField, adminField } from '@/access/nori'
import { relationId } from '@/lib/rental-rules'

export const SalesInquiries: CollectionConfig = {
  slug: 'sales-inquiries',
  labels: { singular: 'Yêu cầu mua xe', plural: 'Yêu cầu mua xe' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Vận hành',
    defaultColumns: ['reference', 'customer', 'model', 'status'],
  },
  access: {
    create: customerOnly,
    read: ownRecords,
    update: ({ req }) => req.user?.collection === 'admins',
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data
        if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE')
          throw new APIError('Vui lòng đăng nhập.', 401)
        const id = relationId(data.model)
        if (!id) throw new APIError('Vui lòng chọn dòng xe.', 400)
        const model = await req.payload.findByID({
          collection: 'vehicle-models',
          id,
          overrideAccess: false,
          user: req.user,
          req,
          depth: 0,
        })
        if (!model.visible) throw new APIError('Dòng xe chưa được công bố.', 409)
        return {
          ...data,
          customer: req.user.id,
          reference: `NM-${crypto.randomUUID()}`,
          status: 'NEW',
        }
      },
    ],
  },
  fields: [
    {
      name: 'reference',
      label: 'Mã yêu cầu',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'users',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'model',
      label: 'Dòng xe quan tâm',
      type: 'relationship',
      relationTo: 'vehicle-models',
      required: true,
      access: { update: serverField },
    },
    {
      name: 'phone',
      label: 'Số điện thoại liên hệ',
      type: 'text',
      required: true,
      validate: (value: unknown) =>
        /^\+?\d{9,15}$/.test(String(value ?? '')) || 'Số điện thoại cần 9–15 chữ số.',
    },
    { name: 'note', label: 'Nhu cầu', type: 'textarea', maxLength: 1000 },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: ['NEW', 'CONTACTED', 'CLOSED'],
      defaultValue: 'NEW',
      access: { create: serverField, update: adminField },
    },
  ],
  versions: false,
}
