import { APIError, type CollectionConfig } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import {
  WAREHOUSE_STATUSES,
  WAREHOUSE_TYPES,
  normalizeCode,
  warehouseStatusLabels,
  warehouseTypeLabels,
} from '@/lib/multi-branch-rules'

const warehouseAudit = auditCollection({
  entity: 'warehouse',
  entityName: 'kho xe',
  label: (doc) => `${String(doc.code ?? '')} · ${String(doc.name ?? doc.id)}`.trim(),
  statusField: 'status',
  statusLabels: warehouseStatusLabels,
  fields: {
    name: 'Tên kho',
    branch: 'Chi nhánh',
    warehouseType: 'Loại kho',
    address: 'Địa chỉ',
    capacity: 'Sức chứa tối đa',
    isCustomerFacing: 'Phục vụ khách trực tiếp',
  },
})

export const Warehouses: CollectionConfig = {
  slug: 'warehouses',
  labels: { singular: 'Kho xe', plural: 'Kho phương tiện' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: ['code', 'name', 'branch', 'warehouseType', 'capacity', 'status'],
  },
  access: {
    create: adminBranchPermission('warehouses', 'create', ['branch']),
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['warehouses', 'read'],
          ['branches', 'read'],
          ['vehicles', 'read'],
          ['transfers', 'read'],
          ['locations', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['branch'])
      }
      return false
    },
    update: adminBranchPermission('warehouses', 'update', ['branch']),
    delete: adminBranchPermission('warehouses', 'delete', ['branch']),
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
    beforeDelete: [
      async ({ id, req }) => {
        const [vehCount, trfCount] = await Promise.all([
          req.payload.count({
            collection: 'vehicles',
            overrideAccess: true,
            req,
            where: { currentWarehouse: { equals: id } },
          }),
          req.payload.count({
            collection: 'vehicle-transfers',
            overrideAccess: true,
            req,
            where: {
              or: [{ fromWarehouse: { equals: id } }, { toWarehouse: { equals: id } }],
            },
          }),
        ])
        if (vehCount.totalDocs > 0 || trfCount.totalDocs > 0) {
          throw new APIError(
            'Không thể xóa kho đang chứa phương tiện hoặc đã phát sinh phiếu điều chuyển. Hãy chuyển trạng thái kho sang Ngừng hoạt động.',
            409,
          )
        }
      },
    ],
    afterChange: [warehouseAudit.afterChange],
    afterDelete: [warehouseAudit.afterDelete],
  },
  fields: [
    { name: 'code', label: 'Mã kho', type: 'text', required: true, unique: true, index: true },
    { name: 'name', label: 'Tên kho xe', type: 'text', required: true, maxLength: 160 },
    {
      name: 'branch',
      label: 'Chi nhánh trực thuộc',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'warehouseType',
      label: 'Loại kho xe',
      type: 'select',
      options: WAREHOUSE_TYPES.map((v) => ({ label: warehouseTypeLabels[v], value: v })),
      defaultValue: 'SHOWROOM',
      required: true,
    },
    { name: 'address', label: 'Địa chỉ kho', type: 'text', required: true, maxLength: 300 },
    {
      name: 'capacity',
      label: 'Sức chứa tối đa (xe)',
      type: 'number',
      required: true,
      min: 1,
      defaultValue: 20,
    },
    {
      name: 'allowOverCapacity',
      label: 'Cho phép vượt sức chứa tạm thời khi điều chuyển / trả xe',
      type: 'checkbox',
      defaultValue: false,
    },
    { name: 'manager', label: 'Người phụ trách kho', type: 'relationship', relationTo: 'admins' },
    { name: 'managerNameSnapshot', label: 'Tên người phụ trách', type: 'text', maxLength: 120 },
    { name: 'operatingHours', label: 'Giờ hoạt động kho', type: 'text', maxLength: 160 },
    {
      name: 'isCustomerFacing',
      label: 'Được phép phục vụ khách nhận / trả xe trực tiếp',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'status',
      label: 'Trạng thái kho',
      type: 'select',
      options: WAREHOUSE_STATUSES.map((v) => ({ label: warehouseStatusLabels[v], value: v })),
      defaultValue: 'ACTIVE',
      required: true,
      index: true,
    },
    { name: 'notes', label: 'Ghi chú vận hành kho', type: 'textarea', maxLength: 1000 },
  ],
  versions: false,
}
