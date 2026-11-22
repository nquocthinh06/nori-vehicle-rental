import { APIError, type CollectionConfig } from 'payload'
import { adminBranchPermission, adminHasAnyPermission, branchScopedWhere } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { relationId } from '@/lib/rental-rules'

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
    create: adminBranchPermission('maintenance', 'create', ['branch']),
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['maintenance', 'read'],
        ['vehicles', 'read'],
        ['bookings', 'read'],
      ])
        ? branchScopedWhere(req.user, ['branch'])
        : false,
    update: adminBranchPermission('maintenance', 'update', ['branch']),
    delete: adminBranchPermission('maintenance', 'delete', ['branch']),
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const startDate = String(data?.startDate ?? originalDoc?.startDate ?? '').trim()
        const endDate = String(data?.endDate ?? originalDoc?.endDate ?? '').trim()
        const status = String(data?.status ?? originalDoc?.status ?? 'SCHEDULED')
        const vehicleId = relationId(data?.vehicle ?? originalDoc?.vehicle)

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
          endDate < startDate
        ) {
          throw new APIError(
            'Ngày kết thúc bảo trì phải lớn hơn hoặc bằng ngày bắt đầu (YYYY-MM-DD).',
            400,
          )
        }

        if (vehicleId && (status === 'SCHEDULED' || status === 'IN_PROGRESS')) {
          const overlappingBookings = await req.payload.find({
            collection: 'bookings',
            req,
            overrideAccess: true,
            depth: 0,
            limit: 10,
            where: {
              and: [
                { vehicle: { equals: vehicleId } },
                { status: { in: ['CONFIRMED', 'READY_FOR_HANDOVER', 'ONGOING'] } },
                { startDate: { less_than_equal: endDate } },
                { endDate: { greater_than_equal: startDate } },
              ],
            },
          })

          if (overlappingBookings.docs.length > 0) {
            const first = overlappingBookings.docs[0]
            throw new APIError(
              `Không thể lên lịch bảo trì trùng với đơn thuê đang giữ xe (${first.bookingKey ?? first.id}: ${first.startDate} → ${first.endDate}).`,
              409,
            )
          }
        }

        return data
      },
    ],
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
    {
      name: 'branch',
      label: 'Chi nhánh bảo dưỡng',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
    },
    {
      name: 'warehouse',
      label: 'Kho / Trung tâm bảo dưỡng',
      type: 'relationship',
      relationTo: 'warehouses',
      index: true,
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
