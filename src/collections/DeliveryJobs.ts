import type { CollectionConfig, Where } from 'payload'
import {
  adminBranchPermission,
  adminHasAnyPermission,
  branchScopedWhere,
  staffTitleOf,
} from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { DELIVERY_JOB_STATUSES, deliveryJobStatusLabels } from '@/lib/multi-branch-rules'

const deliveryAudit = auditCollection({
  entity: 'delivery-job',
  entityName: 'nhiệm vụ giao nhận tận nơi',
  label: (doc) => String(doc.jobCode ?? doc.id),
  statusField: 'status',
  statusLabels: deliveryJobStatusLabels,
  fields: {
    assignedStaffName: 'Nhân viên phụ trách',
    scheduledDate: 'Ngày hẹn',
    scheduledTime: 'Giờ hẹn',
    extraCost: 'Chi phí phát sinh',
    failureReason: 'Lý do thất bại',
  },
})

export const DeliveryJobs: CollectionConfig = {
  slug: 'delivery-jobs',
  labels: { singular: 'Nhiệm vụ giao nhận', plural: 'Giao & Thu hồi xe tận nơi' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'jobCode',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'jobCode',
      'jobType',
      'bookingKeySnapshot',
      'branch',
      'scheduledDate',
      'assignedStaffName',
      'status',
    ],
  },
  access: {
    create: adminBranchPermission('deliveries', 'create', ['branch']),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['deliveries', 'read'],
          ['bookings', 'read'],
          ['reports', 'read'],
        ])
      ) {
        // Delivery staff only see jobs explicitly assigned to them (Section 3.3 minimal necessary data!)
        if (staffTitleOf(req.user) === 'DELIVERY_STAFF' && req.user?.id) {
          return { assignedStaff: { equals: req.user.id } }
        }
        return branchScopedWhere(req.user, ['branch'])
      }
      return false
    },
    update: ({ req }): boolean | Where => {
      if (!adminHasAnyPermission(req.user, [['deliveries', 'update']])) return false
      if (staffTitleOf(req.user) === 'DELIVERY_STAFF' && req.user?.id) {
        return { assignedStaff: { equals: req.user.id } }
      }
      return branchScopedWhere(req.user, ['branch'])
    },
    delete: () => false,
  },
  hooks: {
    afterChange: [deliveryAudit.afterChange],
  },
  fields: [
    {
      name: 'jobCode',
      label: 'Mã nhiệm vụ',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'booking',
      label: 'Đơn thuê liên quan',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      index: true,
    },
    { name: 'bookingKeySnapshot', label: 'Mã đơn thuê', type: 'text', index: true },
    {
      name: 'vehicle',
      label: 'Phương tiện',
      type: 'relationship',
      relationTo: 'vehicles',
      required: true,
      index: true,
    },
    { name: 'vehicleReferenceSnapshot', label: 'Mã xe', type: 'text' },
    {
      name: 'branch',
      label: 'Chi nhánh thực hiện',
      type: 'relationship',
      relationTo: 'branches',
      required: true,
      index: true,
    },
    {
      name: 'deliveryZone',
      label: 'Khu vực phục vụ',
      type: 'relationship',
      relationTo: 'delivery-zones',
    },
    {
      name: 'jobType',
      label: 'Loại nhiệm vụ',
      type: 'select',
      options: [
        { label: 'Giao xe tận nơi', value: 'DELIVERY' },
        { label: 'Thu hồi xe tận nơi', value: 'PICKUP' },
      ],
      defaultValue: 'DELIVERY',
      required: true,
      index: true,
    },
    {
      name: 'scheduledDate',
      label: 'Ngày giao nhận (YYYY-MM-DD)',
      type: 'text',
      required: true,
      index: true,
    },
    { name: 'scheduledTime', label: 'Giờ giao nhận (HH:MM)', type: 'text', required: true },
    {
      name: 'estimatedDurationMinutes',
      label: 'Thời lượng ước tính (phút)',
      type: 'number',
      min: 15,
      defaultValue: 60,
    },
    {
      name: 'address',
      label: 'Địa chỉ giao nhận (nội bộ)',
      type: 'text',
      required: true,
      maxLength: 300,
    },
    { name: 'contactName', label: 'Người liên hệ', type: 'text', required: true, maxLength: 120 },
    {
      name: 'contactPhone',
      label: 'Số điện thoại liên hệ (nội bộ)',
      type: 'text',
      required: true,
      maxLength: 20,
    },
    { name: 'directionsNote', label: 'Hướng dẫn tìm địa điểm', type: 'textarea', maxLength: 500 },
    {
      name: 'assignedStaff',
      label: 'Nhân viên giao nhận',
      type: 'relationship',
      relationTo: 'admins',
      index: true,
    },
    { name: 'assignedStaffName', label: 'Tên nhân viên phụ trách', type: 'text', maxLength: 120 },
    {
      name: 'status',
      label: 'Trạng thái nhiệm vụ',
      type: 'select',
      options: DELIVERY_JOB_STATUSES.map((v) => ({ label: deliveryJobStatusLabels[v], value: v })),
      defaultValue: 'PENDING',
      required: true,
      index: true,
    },
    {
      name: 'deliveryFeeSnapshot',
      label: 'Phí giao nhận đã tính (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    {
      name: 'extraCost',
      label: 'Chi phí phát sinh (VNĐ)',
      type: 'number',
      min: 0,
      defaultValue: 0,
    },
    { name: 'extraCostNote', label: 'Lý do chi phí phát sinh', type: 'text', maxLength: 300 },
    { name: 'odometerAtHandover', label: 'ODO bàn giao (km)', type: 'number', min: 0 },
    { name: 'fuelOrBatteryLevel', label: 'Mức nhiên liệu / pin', type: 'text', maxLength: 60 },
    { name: 'conditionReport', label: 'Biên bản tình trạng xe', type: 'textarea', maxLength: 1000 },
    { name: 'handoverPhotos', label: 'Ảnh bàn giao (JSON)', type: 'json' },
    { name: 'failureReason', label: 'Lý do giao nhận thất bại', type: 'textarea', maxLength: 500 },
    { name: 'completedAt', label: 'Thời điểm hoàn tất', type: 'text' },
    { name: 'revision', label: 'Phiên bản', type: 'number', defaultValue: 1 },
    { name: 'statusHistory', label: 'Lịch sử trạng thái (JSON)', type: 'json' },
  ],
  versions: false,
}
