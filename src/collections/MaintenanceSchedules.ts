import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'

const maintAudit = auditCollection({
  entity: 'maintenance',
  entityName: 'lịch bảo trì',
  label: (doc) => String(doc.title ?? doc.id),
  statusField: 'status',
  statusLabels: {
    SCHEDULED: 'Đã lên lịch',
    IN_PROGRESS: 'Đang bảo trì',
    COMPLETED: 'Hoàn tất',
    CANCELLED: 'Đã hủy',
  },
  fields: { startDate: 'Ngày bắt đầu', endDate: 'Ngày kết thúc', cost: 'Chi phí' },
})

export const MaintenanceSchedules: CollectionConfig = {
  slug: 'maintenance-schedules',
  labels: { singular: 'Lịch bảo trì', plural: 'Lịch bảo trì & Bảo dưỡng' },
  admin: {
    useAsTitle: 'title',
    group: 'NORI · Phương tiện',
    defaultColumns: ['title', 'vehicle', 'maintenanceType', 'startDate', 'endDate', 'status'],
  },
  access: {
    create: adminPermission('maintenance', 'create'),
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['maintenance', 'read'],
        ['vehicles', 'read'],
        ['bookings', 'read'],
      ]),
    update: adminPermission('maintenance', 'update'),
    delete: adminPermission('maintenance', 'delete'),
  },
  hooks: {
    afterChange: [maintAudit.afterChange],
    afterDelete: [maintAudit.afterDelete],
  },
  fields: [
    {
      name: 'vehicle',
      label: 'Xe thực tế',
      type: 'relationship',
      relationTo: 'vehicles',
      required: true,
    },
    { name: 'title', label: 'Hạng mục bảo trì', type: 'text', required: true, maxLength: 160 },
    {
      name: 'maintenanceType',
      label: 'Loại bảo trì',
      type: 'select',
      options: [
        { label: 'Bảo dưỡng định kỳ', value: 'ROUTINE' },
        { label: 'Sửa chữa kỹ thuật', value: 'REPAIR' },
        { label: 'Đăng kiểm / Kiểm định', value: 'INSPECTION' },
      ],
      defaultValue: 'ROUTINE',
      required: true,
    },
    { name: 'startDate', label: 'Từ ngày (YYYY-MM-DD)', type: 'text', required: true, index: true },
    { name: 'endDate', label: 'Đến ngày (YYYY-MM-DD)', type: 'text', required: true, index: true },
    { name: 'odometerAtService', label: 'ODO lúc bảo dưỡng (km)', type: 'number', min: 0 },
    { name: 'cost', label: 'Chi phí dự kiến / thực tế (VNĐ)', type: 'number', min: 0 },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        { label: 'Đã lên lịch', value: 'SCHEDULED' },
        { label: 'Đang thực hiện', value: 'IN_PROGRESS' },
        { label: 'Đã hoàn tất', value: 'COMPLETED' },
        { label: 'Đã hủy', value: 'CANCELLED' },
      ],
      defaultValue: 'SCHEDULED',
      required: true,
      index: true,
    },
    { name: 'notes', label: 'Ghi chú kỹ thuật', type: 'textarea', maxLength: 1000 },
  ],
  versions: false,
}
