import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'

const promoAudit = auditCollection({
  entity: 'promotion',
  entityName: 'chương trình khuyến mãi',
  label: (doc) => String(doc.code ?? doc.name ?? doc.id),
  fields: {
    name: 'Tên chương trình',
    discountType: 'Loại giảm giá',
    discountValue: 'Giá trị giảm',
    active: 'Kích hoạt',
    validFrom: 'Ngày bắt đầu',
    validTo: 'Ngày kết thúc',
  },
})

export const Promotions: CollectionConfig = {
  slug: 'promotions',
  labels: { singular: 'Khuyến mãi', plural: 'Khuyến mãi & Mã giảm giá' },
  admin: {
    useAsTitle: 'code',
    group: 'NORI · Vận hành',
    defaultColumns: ['code', 'name', 'discountType', 'discountValue', 'active', 'validTo'],
  },
  access: {
    create: isAdmin,
    read: ({ req }) => (req.user?.collection === 'admins' ? true : { active: { equals: true } }),
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.code) data.code = String(data.code).trim().toUpperCase()
        return data
      },
    ],
    afterChange: [promoAudit.afterChange],
    afterDelete: [promoAudit.afterDelete],
  },
  fields: [
    {
      name: 'code',
      label: 'Mã khuyến mãi',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'name', label: 'Tên chương trình', type: 'text', required: true, maxLength: 160 },
    { name: 'description', label: 'Mô tả điều kiện', type: 'textarea', maxLength: 500 },
    {
      name: 'discountType',
      label: 'Hình thức giảm',
      type: 'select',
      options: [
        { label: 'Phần trăm (%)', value: 'PERCENT' },
        { label: 'Số tiền cố định (VNĐ)', value: 'FIXED' },
      ],
      defaultValue: 'PERCENT',
      required: true,
    },
    { name: 'discountValue', label: 'Giá trị giảm', type: 'number', required: true, min: 1 },
    { name: 'maxDiscount', label: 'Giảm tối đa (VNĐ)', type: 'number', min: 0 },
    { name: 'minDays', label: 'Số ngày thuê tối thiểu', type: 'number', min: 1, defaultValue: 1 },
    {
      name: 'appliesTo',
      label: 'Phạm vi áp dụng',
      type: 'select',
      options: [
        { label: 'Tất cả', value: 'ALL' },
        { label: 'Thuê xe', value: 'RENT' },
        { label: 'Mua xe', value: 'SALE' },
      ],
      defaultValue: 'RENT',
    },
    { name: 'validFrom', label: 'Từ ngày (YYYY-MM-DD)', type: 'text' },
    { name: 'validTo', label: 'Đến ngày (YYYY-MM-DD)', type: 'text' },
    { name: 'usageLimit', label: 'Giới hạn lượt dùng', type: 'number', min: 1 },
    { name: 'usedCount', label: 'Đã sử dụng', type: 'number', min: 0, defaultValue: 0 },
    { name: 'active', label: 'Đang kích hoạt', type: 'checkbox', defaultValue: true, index: true },
  ],
  versions: false,
}
