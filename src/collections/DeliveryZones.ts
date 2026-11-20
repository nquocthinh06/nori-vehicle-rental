import type { CollectionConfig, Where } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import { normalizeCode } from '@/lib/multi-branch-rules'

const zoneAudit = auditCollection({
  entity: 'delivery-zone',
  entityName: 'khu vực giao nhận tận nơi',
  label: (doc) => `${String(doc.code ?? '')} · ${String(doc.name ?? doc.id)}`.trim(),
  fields: {
    name: 'Tên khu vực',
    province: 'Tỉnh/Thành phố',
    wards: 'Quận/Phường phục vụ',
    deliveryFee: 'Phí giao tận nơi',
    pickupFee: 'Phí thu hồi tận nơi',
    afterHoursFee: 'Phí ngoài giờ',
    active: 'Kích hoạt',
  },
})

export const DeliveryZones: CollectionConfig = {
  slug: 'delivery-zones',
  labels: { singular: 'Khu vực giao nhận', plural: 'Khu vực giao nhận tận nơi' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: ['code', 'name', 'branch', 'province', 'deliveryFee', 'pickupFee', 'active'],
  },
  access: {
    create: adminBranchPermission('deliveries', 'create', ['branch']),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['deliveries', 'read'],
          ['branches', 'read'],
          ['bookings', 'read'],
          ['pricing', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['branch'])
      }
      return { active: { equals: true } }
    },
    update: adminBranchPermission('deliveries', 'update', ['branch']),
    delete: adminBranchPermission('deliveries', 'delete', ['branch']),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const rawCode = data.code ?? originalDoc?.code ?? ''
        if (typeof rawCode === 'string' && rawCode.trim()) {
          data.code = normalizeCode(rawCode, 32)
        }
        return data
      },
    ],
    afterChange: [revalidateCatalogue, zoneAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, zoneAudit.afterDelete],
  },
  fields: [
    { name: 'code', label: 'Mã khu vực', type: 'text', required: true, unique: true, index: true },
    { name: 'name', label: 'Tên khu vực phục vụ', type: 'text', required: true, maxLength: 160 },
    {
      name: 'branch',
      label: 'Chi nhánh phụ trách',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    { name: 'province', label: 'Tỉnh / Thành phố', type: 'text', required: true },
    {
      name: 'wards',
      label: 'Quận / Huyện / Phường phục vụ (phân tách bởi dấu phẩy)',
      type: 'text',
      maxLength: 500,
    },
    {
      name: 'deliveryFee',
      label: 'Phí giao xe tận nơi (VNĐ; 0 = miễn phí)',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'pickupFee',
      label: 'Phí thu hồi xe tận nơi (VNĐ; 0 = miễn phí)',
      type: 'number',
      required: true,
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'afterHoursFee',
      label: 'Phụ phí giao nhận ngoài giờ (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'freeOverOrderAmount',
      label: 'Miễn phí nếu tổng đơn đạt từ (VNĐ, tùy chọn)',
      type: 'number',
      min: 0,
    },
    {
      name: 'estimatedTravelMinutes',
      label: 'Thời gian di chuyển ước tính (phút)',
      type: 'number',
      min: 5,
      defaultValue: 45,
    },
    {
      name: 'serviceStartTime',
      label: 'Giờ bắt đầu phục vụ (HH:MM)',
      type: 'text',
      defaultValue: '08:00',
    },
    {
      name: 'serviceEndTime',
      label: 'Giờ kết thúc phục vụ (HH:MM)',
      type: 'text',
      defaultValue: '20:00',
    },
    { name: 'active', label: 'Đang kích hoạt', type: 'checkbox', defaultValue: true, index: true },
    { name: 'notes', label: 'Ghi chú phạm vi giao nhận', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
