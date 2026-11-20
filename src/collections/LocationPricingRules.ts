import { APIError, type CollectionConfig, type Where } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import { PRICING_SCOPE_TYPES, normalizeCode, pricingScopeLabels } from '@/lib/multi-branch-rules'

const pricingAudit = auditCollection({
  entity: 'location-pricing',
  entityName: 'quy tắc giá theo địa điểm',
  label: (doc) => `${String(doc.code ?? '')} · ${String(doc.name ?? doc.id)}`.trim(),
  fields: {
    scopeType: 'Phạm vi ưu tiên',
    dailyPrice: 'Giá thuê/ngày',
    weekendSurcharge: 'Phụ phí cuối tuần',
    holidaySurcharge: 'Phụ phí ngày lễ',
    locationSurcharge: 'Phụ phí địa điểm',
    depositAmount: 'Tiền đặt cọc',
    active: 'Kích hoạt',
  },
})

export const LocationPricingRules: CollectionConfig = {
  slug: 'location-pricing-rules',
  labels: { singular: 'Quy tắc giá địa điểm', plural: 'Bảng giá & Phụ phí theo địa điểm' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'code',
      'name',
      'scopeType',
      'branch',
      'dailyPrice',
      'locationSurcharge',
      'active',
    ],
  },
  access: {
    create: adminBranchPermission('pricing', 'create', ['branch']),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['pricing', 'read'],
          ['branches', 'read'],
          ['vehicles', 'read'],
          ['bookings', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['branch'])
      }
      return { active: { equals: true } }
    },
    update: adminBranchPermission('pricing', 'update', ['branch']),
    delete: adminBranchPermission('pricing', 'delete', ['branch']),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const rawCode = data.code ?? originalDoc?.code ?? ''
        if (typeof rawCode === 'string' && rawCode.trim()) {
          data.code = normalizeCode(rawCode, 40)
        }
        const checkNonNeg = (val: unknown, label: string) => {
          if (val === undefined || val === null || val === '') return
          const n = Number(val)
          if (!Number.isSafeInteger(n) || n < 0) {
            throw new APIError(`${label} phải là số nguyên VNĐ không âm.`, 400)
          }
        }
        if (data.dailyPrice !== undefined && data.dailyPrice !== null && data.dailyPrice !== '') {
          const n = Number(data.dailyPrice)
          if (!Number.isSafeInteger(n) || n < 1) {
            throw new APIError('Đơn giá thuê/ngày phải là số nguyên dương lớn hơn 0.', 400)
          }
        }
        checkNonNeg(data.weeklyPrice, 'Giá tuần')
        checkNonNeg(data.monthlyPrice, 'Giá tháng')
        checkNonNeg(data.weekendSurcharge, 'Phụ phí cuối tuần')
        checkNonNeg(data.holidaySurcharge, 'Phụ phí ngày lễ')
        checkNonNeg(data.depositAmount, 'Tiền đặt cọc')
        checkNonNeg(data.locationSurcharge, 'Phụ phí địa điểm')
        checkNonNeg(data.afterHoursFee, 'Phí ngoài giờ')
        return data
      },
    ],
    afterChange: [revalidateCatalogue, pricingAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, pricingAudit.afterDelete],
  },
  fields: [
    {
      name: 'code',
      label: 'Mã quy tắc giá',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'name', label: 'Tên bảng giá / quy tắc', type: 'text', required: true, maxLength: 160 },
    {
      name: 'scopeType',
      label: 'Cấp độ ưu tiên áp dụng',
      type: 'select',
      options: PRICING_SCOPE_TYPES.map((v) => ({ label: pricingScopeLabels[v], value: v })),
      defaultValue: 'MODEL_BRANCH',
      required: true,
      index: true,
    },
    {
      name: 'branch',
      label: 'Chi nhánh áp dụng',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
    },
    {
      name: 'vehicleModel',
      label: 'Dòng xe áp dụng',
      type: 'relationship',
      relationTo: 'vehicle-models',
      index: true,
    },
    {
      name: 'vehicle',
      label: 'Phương tiện cụ thể áp dụng',
      type: 'relationship',
      relationTo: 'vehicles',
      index: true,
    },
    { name: 'dailyPrice', label: 'Đơn giá thuê/ngày (VNĐ)', type: 'number', min: 1 },
    { name: 'weeklyPrice', label: 'Đơn giá gói tuần (VNĐ)', type: 'number', min: 0 },
    { name: 'monthlyPrice', label: 'Đơn giá gói tháng (VNĐ)', type: 'number', min: 0 },
    { name: 'weekendSurcharge', label: 'Phụ phí cuối tuần (VNĐ/ngày)', type: 'number', min: 0 },
    { name: 'holidaySurcharge', label: 'Phụ phí ngày lễ (VNĐ/ngày)', type: 'number', min: 0 },
    { name: 'depositAmount', label: 'Tiền đặt cọc áp dụng (VNĐ)', type: 'number', min: 0 },
    {
      name: 'locationSurcharge',
      label: 'Phụ phí địa điểm (VNĐ; 0 = miễn phí)',
      type: 'number',
      min: 0,
    },
    { name: 'afterHoursFee', label: 'Phí ngoài giờ hành chính (VNĐ)', type: 'number', min: 0 },
    {
      name: 'weeklyDiscountPercent',
      label: 'Chiết khấu thuê >= 7 ngày (%)',
      type: 'number',
      min: 0,
      max: 50,
    },
    {
      name: 'monthlyDiscountPercent',
      label: 'Chiết khấu thuê >= 30 ngày (%)',
      type: 'number',
      min: 0,
      max: 60,
    },
    { name: 'validFrom', label: 'Hiệu lực từ ngày (YYYY-MM-DD)', type: 'text' },
    { name: 'validTo', label: 'Hiệu lực đến ngày (YYYY-MM-DD)', type: 'text' },
    {
      name: 'priority',
      label: 'Thứ tự ưu tiên (số nhỏ ưu tiên trước)',
      type: 'number',
      defaultValue: 100,
    },
    { name: 'active', label: 'Đang kích hoạt', type: 'checkbox', defaultValue: true, index: true },
    { name: 'notes', label: 'Ghi chú chính sách giá', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
