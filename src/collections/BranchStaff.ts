import type { CollectionConfig } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'

const staffAudit = auditCollection({
  entity: 'branch-staff',
  entityName: 'phân công nhân viên chi nhánh',
  label: (doc) => String(doc.assignmentKey ?? doc.id),
  statusField: 'status',
  statusLabels: {
    ACTIVE: 'Đang công tác',
    REVOKED: 'Đã thu hồi quyền',
    INACTIVE: 'Tạm ngưng',
  },
  fields: {
    staffRole: 'Vai trò chi nhánh',
    branch: 'Chi nhánh',
    warehouses: 'Kho phụ trách',
    isPrimary: 'Chi nhánh chính',
  },
})

export const BranchStaff: CollectionConfig = {
  slug: 'branch-staff',
  labels: { singular: 'Nhân viên chi nhánh', plural: 'Phân công nhân viên chi nhánh' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'assignmentKey',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: ['admin', 'branch', 'staffRole', 'isPrimary', 'status'],
  },
  access: {
    create: adminBranchPermission('staff', 'create', ['branch']),
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['staff', 'read'],
          ['admins', 'read'],
          ['branches', 'read'],
          ['deliveries', 'read'],
          ['transfers', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['branch'])
      }
      return false
    },
    update: adminBranchPermission('staff', 'update', ['branch']),
    delete: adminBranchPermission('staff', 'delete', ['branch']),
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const adminId =
          typeof data.admin === 'object' && data.admin
            ? data.admin.id
            : (data.admin ?? originalDoc?.admin)
        const branchId =
          typeof data.branch === 'object' && data.branch
            ? data.branch.id
            : (data.branch ?? originalDoc?.branch)
        if (adminId && branchId && !data.assignmentKey) {
          data.assignmentKey = `${String(adminId)}:${String(branchId)}`
        }
        return data
      },
    ],
    afterChange: [staffAudit.afterChange],
    afterDelete: [staffAudit.afterDelete],
  },
  fields: [
    {
      name: 'assignmentKey',
      label: 'Khóa phân công duy nhất',
      type: 'text',
      unique: true,
      index: true,
    },
    {
      name: 'admin',
      label: 'Tài khoản nhân viên',
      type: 'relationship',
      relationTo: 'admins',
      required: true,
      index: true,
    },
    {
      name: 'branch',
      label: 'Chi nhánh phụ trách',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    { name: 'warehouses', label: 'Danh sách ID kho phụ trách (JSON)', type: 'json' },
    {
      name: 'staffRole',
      label: 'Vai trò tại chi nhánh',
      type: 'select',
      options: [
        { label: 'Quản lý chi nhánh (Branch Manager)', value: 'BRANCH_MANAGER' },
        { label: 'Nhân viên thuê xe (Rental Staff)', value: 'RENTAL_STAFF' },
        { label: 'Nhân viên kho xe (Warehouse Staff)', value: 'WAREHOUSE_STAFF' },
        { label: 'Nhân viên giao nhận (Delivery Staff)', value: 'DELIVERY_STAFF' },
        { label: 'Kế toán chi nhánh (Accountant)', value: 'ACCOUNTANT' },
      ],
      defaultValue: 'RENTAL_STAFF',
      required: true,
      index: true,
    },
    { name: 'isPrimary', label: 'Chi nhánh công tác chính', type: 'checkbox', defaultValue: false },
    {
      name: 'status',
      label: 'Trạng thái phân công',
      type: 'select',
      options: [
        { label: 'Đang hiệu lực', value: 'ACTIVE' },
        { label: 'Đã thu hồi quyền', value: 'REVOKED' },
        { label: 'Tạm ngưng', value: 'INACTIVE' },
      ],
      defaultValue: 'ACTIVE',
      required: true,
      index: true,
    },
    { name: 'assignedBy', label: 'Người phân công', type: 'text' },
    { name: 'assignedAt', label: 'Thời điểm phân công', type: 'text' },
    { name: 'revokedAt', label: 'Thời điểm thu hồi', type: 'text' },
    { name: 'notes', label: 'Ghi chú phân công', type: 'textarea', maxLength: 500 },
  ],
  versions: false,
}
