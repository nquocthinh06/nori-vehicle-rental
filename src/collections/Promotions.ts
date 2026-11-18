import { APIError, type CollectionConfig } from 'payload'
import { adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateDeletedPromotion, revalidatePromotion } from '@/hooks/revalidate-nori'
import { validatePromotionInput } from '@/lib/rental-rules'

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
    create: adminPermission('promotions', 'create'),
    read: adminPermission('promotions', 'read'),
    update: adminPermission('promotions', 'update'),
    delete: adminPermission('promotions', 'delete'),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc, req }) => {
        if (!data) return data
        if (data.code) data.code = String(data.code).trim().toUpperCase()
        // Skip full metadata re-validation when internal booking hook only updates usedCount
        if (req.context?.skipAudit && Object.keys(data).every((k) => k === 'usedCount')) {
          return data
        }
        const merged = {
          code: data.code ?? originalDoc?.code ?? '',
          name: data.name ?? originalDoc?.name ?? '',
          description:
            data.description !== undefined ? data.description : (originalDoc?.description ?? null),
          discountType: data.discountType ?? originalDoc?.discountType ?? 'PERCENT',
          discountValue:
            data.discountValue !== undefined ? data.discountValue : originalDoc?.discountValue,
          maxDiscount:
            data.maxDiscount !== undefined ? data.maxDiscount : (originalDoc?.maxDiscount ?? null),
          minDays: data.minDays !== undefined ? data.minDays : (originalDoc?.minDays ?? 1),
          appliesTo: data.appliesTo ?? originalDoc?.appliesTo ?? 'RENT',
          validFrom:
            data.validFrom !== undefined ? data.validFrom : (originalDoc?.validFrom ?? null),
          validTo: data.validTo !== undefined ? data.validTo : (originalDoc?.validTo ?? null),
          usageLimit:
            data.usageLimit !== undefined ? data.usageLimit : (originalDoc?.usageLimit ?? null),
          active: data.active !== undefined ? Boolean(data.active) : Boolean(originalDoc?.active),
        }
        const check = validatePromotionInput(merged, Number(originalDoc?.usedCount ?? 0))
        if (check.error || !check.normalized) {
          throw new APIError(check.error ?? 'Dữ liệu chương trình khuyến mãi không hợp lệ.', 400)
        }
        return {
          ...data,
          code: check.normalized.code,
          name: check.normalized.name,
          description: check.normalized.description,
          discountType: check.normalized.discountType,
          discountValue: check.normalized.discountValue,
          maxDiscount: check.normalized.maxDiscount,
          minDays: check.normalized.minDays,
          appliesTo: check.normalized.appliesTo,
          validFrom: check.normalized.validFrom,
          validTo: check.normalized.validTo,
          usageLimit: check.normalized.usageLimit,
          active: check.normalized.active,
        }
      },
    ],
    afterChange: [revalidatePromotion, promoAudit.afterChange],
    afterDelete: [revalidateDeletedPromotion, promoAudit.afterDelete],
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
