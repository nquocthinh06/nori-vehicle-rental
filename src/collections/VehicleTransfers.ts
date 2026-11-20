import type { CollectionConfig } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { TRANSFER_STATUSES, transferStatusLabels } from '@/lib/multi-branch-rules'

const transferAudit = auditCollection({
  entity: 'vehicle-transfer',
  entityName: 'phiếu điều chuyển xe',
  label: (doc) => String(doc.transferCode ?? doc.id),
  statusField: 'status',
  statusLabels: transferStatusLabels,
  fields: {
    fromBranch: 'Chi nhánh xuất',
    toBranch: 'Chi nhánh nhận',
    fromWarehouse: 'Kho xuất',
    toWarehouse: 'Kho nhận',
    transferCost: 'Chi phí điều chuyển',
    assignedStaffName: 'Nhân viên phụ trách',
    odometerBefore: 'ODO lúc xuất',
    odometerAfter: 'ODO lúc nhận',
    delayedWarning: 'Cảnh báo trễ lịch',
  },
})

export const VehicleTransfers: CollectionConfig = {
  slug: 'vehicle-transfers',
  labels: { singular: 'Phiếu điều chuyển xe', plural: 'Điều chuyển phương tiện' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'transferCode',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'transferCode',
      'vehicleReferenceSnapshot',
      'fromBranch',
      'toBranch',
      'startDate',
      'status',
    ],
  },
  access: {
    create: adminBranchPermission('transfers', 'create', ['fromBranch', 'toBranch']),
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['transfers', 'read'],
          ['vehicles', 'read'],
          ['warehouses', 'read'],
          ['bookings', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['fromBranch', 'toBranch'])
      }
      return false
    },
    update: adminBranchPermission('transfers', 'update', ['fromBranch', 'toBranch']),
    delete: () => false,
  },
  hooks: {
    afterChange: [transferAudit.afterChange],
  },
  fields: [
    {
      name: 'transferCode',
      label: 'Mã phiếu điều chuyển',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'vehicle',
      label: 'Phương tiện điều chuyển',
      type: 'relationship',
      relationTo: 'vehicles',
      required: true,
      index: true,
    },
    { name: 'vehicleReferenceSnapshot', label: 'Mã xe đối chiếu', type: 'text' },
    {
      name: 'fromBranch',
      label: 'Chi nhánh xuất',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'fromWarehouse',
      label: 'Kho xuất',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    {
      name: 'toBranch',
      label: 'Chi nhánh nhận',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'toWarehouse',
      label: 'Kho nhận',
      type: 'relationship',
      relationTo: 'warehouses',
      required: true,
      index: true,
    },
    { name: 'reason', label: 'Lý do điều chuyển', type: 'text', required: true, maxLength: 300 },
    {
      name: 'startDate',
      label: 'Ngày xuất dự kiến (YYYY-MM-DD)',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'endDate',
      label: 'Ngày đến dự kiến (YYYY-MM-DD)',
      type: 'text',
      required: true,
      index: true,
    },
    { name: 'scheduledDepartureAt', label: 'Ngày giờ xuất dự kiến', type: 'text', required: true },
    { name: 'scheduledArrivalAt', label: 'Ngày giờ đến dự kiến', type: 'text', required: true },
    { name: 'actualDepartureAt', label: 'Thời điểm xuất kho thực tế', type: 'text' },
    { name: 'actualArrivalAt', label: 'Thời điểm xe đến kho đích', type: 'text' },
    { name: 'completedAt', label: 'Thời điểm hoàn tất tiếp nhận', type: 'text' },
    {
      name: 'assignedStaff',
      label: 'Nhân viên phụ trách',
      type: 'relationship',
      relationTo: 'admins',
    },
    { name: 'assignedStaffName', label: 'Tên nhân viên phụ trách', type: 'text', maxLength: 120 },
    {
      name: 'transferCost',
      label: 'Chi phí điều chuyển (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'status',
      label: 'Trạng thái điều chuyển',
      type: 'select',
      options: TRANSFER_STATUSES.map((v) => ({ label: transferStatusLabels[v], value: v })),
      defaultValue: 'DRAFT',
      required: true,
      index: true,
    },
    {
      name: 'conditionBefore',
      label: 'Tình trạng xe trước khi xuất',
      type: 'textarea',
      maxLength: 1000,
    },
    {
      name: 'conditionAfter',
      label: 'Tình trạng xe sau khi đến',
      type: 'textarea',
      maxLength: 1000,
    },
    { name: 'odometerBefore', label: 'ODO trước khi xuất (km)', type: 'number', min: 0 },
    { name: 'odometerAfter', label: 'ODO sau khi đến (km)', type: 'number', min: 0 },
    { name: 'handoverPhotos', label: 'Hình ảnh bàn giao (JSON)', type: 'json' },
    {
      name: 'handoverReportNote',
      label: 'Biên bản / Ghi chú phát sinh',
      type: 'textarea',
      maxLength: 2000,
    },
    { name: 'createdBy', label: 'Người tạo phiếu', type: 'text' },
    { name: 'approvedBy', label: 'Người phê duyệt', type: 'text' },
    { name: 'receivedBy', label: 'Người xác nhận tiếp nhận', type: 'text' },
    {
      name: 'exceptionNote',
      label: 'Ghi chú xử lý sự cố ngoại lệ',
      type: 'textarea',
      maxLength: 1000,
    },
    {
      name: 'delayedWarning',
      label: 'Cảnh báo trễ tiến độ',
      type: 'checkbox',
      defaultValue: false,
    },
    { name: 'affectedBookingKeys', label: 'Đơn thuê có nguy cơ bị ảnh hưởng (JSON)', type: 'json' },
    { name: 'revision', label: 'Phiên bản lạc quan', type: 'number', defaultValue: 1 },
    { name: 'idempotencyKey', label: 'Khóa chống trùng lặp', type: 'text', index: true },
    { name: 'statusHistory', label: 'Lịch sử trạng thái (JSON)', type: 'json' },
  ],
  versions: false,
}
