import type { CollectionConfig, Where } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import {
  SERVICE_LOCATION_TYPES,
  normalizeCode,
  serviceLocationTypeLabels,
} from '@/lib/multi-branch-rules'

const locationAudit = auditCollection({
  entity: 'service-location',
  entityName: 'điểm giao nhận',
  label: (doc) => `${String(doc.code ?? '')} · ${String(doc.name ?? doc.id)}`.trim(),
  statusField: 'status',
  statusLabels: {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngừng hoạt động',
    TEMPORARILY_CLOSED: 'Tạm đóng',
  },
  fields: {
    name: 'Tên địa điểm',
    address: 'Địa chỉ',
    locationType: 'Loại địa điểm',
    supportsPickup: 'Hỗ trợ nhận xe',
    supportsReturn: 'Hỗ trợ trả xe',
    surchargeFee: 'Phụ phí điểm giao nhận',
  },
})

export const ServiceLocations: CollectionConfig = {
  slug: 'service-locations',
  labels: { singular: 'Điểm giao nhận', plural: 'Điểm nhận & Trả xe' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'code',
      'name',
      'branch',
      'locationType',
      'supportsPickup',
      'supportsReturn',
      'status',
    ],
  },
  access: {
    create: adminBranchPermission('locations', 'create', ['branch']),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['locations', 'read'],
          ['branches', 'read'],
          ['bookings', 'read'],
          ['deliveries', 'read'],
          ['pricing', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['branch'])
      }
      return {
        and: [{ status: { equals: 'ACTIVE' } }, { verified: { equals: true } }],
      }
    },
    update: adminBranchPermission('locations', 'update', ['branch']),
    delete: adminBranchPermission('locations', 'delete', ['branch']),
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
    afterChange: [revalidateCatalogue, locationAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, locationAudit.afterDelete],
  },
  fields: [
    { name: 'code', label: 'Mã địa điểm', type: 'text', required: true, unique: true, index: true },
    { name: 'name', label: 'Tên điểm giao nhận', type: 'text', required: true, maxLength: 160 },
    {
      name: 'branch',
      label: 'Chi nhánh phụ trách',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Kho xe liên kết (nếu có)',
      type: 'relationship',
      relationTo: 'warehouses',
    },
    {
      name: 'locationType',
      label: 'Phân loại địa điểm',
      type: 'select',
      options: SERVICE_LOCATION_TYPES.map((v) => ({
        label: serviceLocationTypeLabels[v],
        value: v,
      })),
      defaultValue: 'BRANCH',
      required: true,
    },
    { name: 'address', label: 'Địa chỉ cụ thể', type: 'text', required: true, maxLength: 300 },
    { name: 'province', label: 'Tỉnh / Thành phố', type: 'text', index: true },
    { name: 'ward', label: 'Phường / Xã / Quận', type: 'text' },
    { name: 'latitude', label: 'Vĩ độ (nếu xác minh)', type: 'number' },
    { name: 'longitude', label: 'Kinh độ (nếu xác minh)', type: 'number' },
    { name: 'operatingHours', label: 'Giờ hoạt động hiển thị', type: 'text', maxLength: 160 },
    { name: 'openTime', label: 'Giờ mở cửa (HH:MM)', type: 'text', defaultValue: '07:30' },
    { name: 'closeTime', label: 'Giờ đóng cửa (HH:MM)', type: 'text', defaultValue: '21:00' },
    { name: 'pickupInstructions', label: 'Hướng dẫn nhận xe', type: 'textarea', maxLength: 1000 },
    { name: 'returnInstructions', label: 'Hướng dẫn trả xe', type: 'textarea', maxLength: 1000 },
    {
      name: 'supportsPickup',
      label: 'Cho phép khách nhận xe',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'supportsReturn',
      label: 'Cho phép khách trả xe',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'supportsHomeDelivery',
      label: 'Hỗ trợ xuất xe giao tận nơi',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'supportsHomePickup',
      label: 'Hỗ trợ thu hồi xe tận nơi',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'supportedCategories',
      label: 'Danh mục phương tiện phục vụ (CAR,MOTORBIKE,PICKUP)',
      type: 'text',
      defaultValue: 'CAR,MOTORBIKE,PICKUP',
    },
    { name: 'surchargeFee', label: 'Phụ phí địa điểm (VNĐ; 0 = miễn phí)', type: 'number', min: 0 },
    {
      name: 'verified',
      label: 'Địa điểm đã xác minh chính thức',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'status',
      label: 'Trạng thái hoạt động',
      type: 'select',
      options: [
        { label: 'Đang hoạt động', value: 'ACTIVE' },
        { label: 'Ngừng hoạt động', value: 'INACTIVE' },
        { label: 'Tạm đóng cửa', value: 'TEMPORARILY_CLOSED' },
      ],
      defaultValue: 'ACTIVE',
      required: true,
      index: true,
    },
  ],
  versions: false,
}
