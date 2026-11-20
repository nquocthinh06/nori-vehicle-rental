import { APIError, type CollectionConfig, type Where } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import { REVENUE_SPLIT_MODES } from '@/lib/multi-branch-rules'

const oneWayAudit = auditCollection({
  entity: 'one-way-rule',
  entityName: 'chính sách thuê trả khác chi nhánh',
  label: (doc) => String(doc.name ?? doc.routeKey ?? doc.id),
  fields: {
    allowed: 'Cho phép tuyến',
    fee: 'Phí trả khác chi nhánh',
    minRentalDays: 'Số ngày tối thiểu',
    revenueSplitMode: 'Nguyên tắc chia doanh thu',
    active: 'Kích hoạt',
  },
})

export const OneWayRentalRules: CollectionConfig = {
  slug: 'one-way-rental-rules',
  labels: {
    singular: 'Chính sách trả xe khác chi nhánh',
    plural: 'Chính sách thuê khác chi nhánh (One-way)',
  },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'name',
      'fromBranch',
      'toBranch',
      'vehicleCategory',
      'allowed',
      'fee',
      'active',
    ],
  },
  access: {
    create: adminBranchPermission('pricing', 'create', ['fromBranch', 'toBranch']),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['pricing', 'read'],
          ['branches', 'read'],
          ['bookings', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['fromBranch', 'toBranch'])
      }
      return { active: { equals: true } }
    },
    update: adminBranchPermission('pricing', 'update', ['fromBranch', 'toBranch']),
    delete: adminBranchPermission('pricing', 'delete', ['fromBranch', 'toBranch']),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const fromId =
          typeof data.fromBranch === 'object' && data.fromBranch
            ? data.fromBranch.id
            : (data.fromBranch ?? originalDoc?.fromBranch)
        const toId =
          typeof data.toBranch === 'object' && data.toBranch
            ? data.toBranch.id
            : (data.toBranch ?? originalDoc?.toBranch)
        const cat = String(data.vehicleCategory ?? originalDoc?.vehicleCategory ?? 'ALL')
        if (fromId && toId && String(fromId) === String(toId)) {
          throw new APIError(
            'Chi nhánh nhận và chi nhánh trả phải khác nhau đối với tuyến một chiều.',
            400,
          )
        }
        if (fromId && toId) {
          data.routeKey = `${String(fromId)}:${String(toId)}:${cat}`
        }
        if (data.fee !== undefined && data.fee !== null) {
          const n = Number(data.fee)
          if (!Number.isSafeInteger(n) || n < 0) {
            throw new APIError('Phí trả xe khác chi nhánh phải là số nguyên VNĐ không âm.', 400)
          }
        }
        const splitMode = String(
          data.revenueSplitMode ?? originalDoc?.revenueSplitMode ?? 'PICKUP_BRANCH',
        )
        if (splitMode === 'PICKUP_BRANCH') data.pickupBranchSharePercent = 100
        else if (splitMode === 'RETURN_BRANCH') data.pickupBranchSharePercent = 0
        else if (splitMode === 'SPLIT_50_50') data.pickupBranchSharePercent = 50
        return data
      },
    ],
    afterChange: [revalidateCatalogue, oneWayAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, oneWayAudit.afterDelete],
  },
  fields: [
    {
      name: 'routeKey',
      label: 'Khóa tuyến duy nhất',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'name', label: 'Tên tuyến giao nhận', type: 'text', required: true, maxLength: 160 },
    {
      name: 'fromBranch',
      label: 'Chi nhánh nhận xe (A)',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'toBranch',
      label: 'Chi nhánh trả xe (B)',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'vehicleCategory',
      label: 'Loại phương tiện áp dụng',
      type: 'select',
      options: [
        { label: 'Tất cả loại xe', value: 'ALL' },
        { label: 'Ô tô', value: 'CAR' },
        { label: 'Xe máy', value: 'MOTORBIKE' },
        { label: 'Bán tải', value: 'PICKUP' },
      ],
      defaultValue: 'ALL',
      required: true,
    },
    {
      name: 'allowed',
      label: 'Cho phép trả xe theo tuyến này',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'fee',
      label: 'Phí trả xe khác chi nhánh (VNĐ; 0 = miễn phí)',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'minRentalDays',
      label: 'Số ngày thuê tối thiểu',
      type: 'number',
      min: 1,
      defaultValue: 1,
    },
    {
      name: 'estimatedTransitHours',
      label: 'Thời gian di chuyển hồi xe ước tính (giờ)',
      type: 'number',
      min: 0,
      defaultValue: 4,
    },
    {
      name: 'preparationBufferHours',
      label: 'Thời gian chuẩn bị xe sau hồi xe (giờ)',
      type: 'number',
      min: 0,
      defaultValue: 4,
    },
    {
      name: 'revenueSplitMode',
      label: 'Nguyên tắc ghi nhận doanh thu liên chi nhánh',
      type: 'select',
      options: REVENUE_SPLIT_MODES.map((v) => ({
        value: v,
        label:
          v === 'PICKUP_BRANCH'
            ? '100% chi nhánh nhận xe (A)'
            : v === 'RETURN_BRANCH'
              ? '100% chi nhánh trả xe (B)'
              : v === 'SPLIT_50_50'
                ? 'Chia đều 50% / 50%'
                : 'Tỷ lệ tùy chỉnh',
      })),
      defaultValue: 'PICKUP_BRANCH',
      required: true,
    },
    {
      name: 'pickupBranchSharePercent',
      label: 'Tỷ lệ doanh thu chi nhánh nhận (%)',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 100,
    },
    { name: 'active', label: 'Đang kích hoạt', type: 'checkbox', defaultValue: true, index: true },
    { name: 'notes', label: 'Ghi chú điều kiện tuyến', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
