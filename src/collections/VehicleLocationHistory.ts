import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission, branchScopedWhere } from '@/access/nori'

/**
 * Append-only physical movement & warehouse check-in/out ledger for each vehicle.
 * Written exclusively via server business services (`overrideAccess: true`).
 */
export const VehicleLocationHistory: CollectionConfig = {
  slug: 'vehicle-location-history',
  labels: { singular: 'Lịch sử vị trí xe', plural: 'Lịch sử vị trí & Nhập/Xuất kho' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'eventType',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: [
      'occurredAt',
      'vehicleReferenceSnapshot',
      'eventType',
      'fromBranch',
      'toBranch',
      'actorEmail',
    ],
  },
  access: {
    create: () => false,
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['vehicles', 'read'],
          ['warehouses', 'read'],
          ['transfers', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['fromBranch', 'toBranch'])
      }
      return false
    },
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'vehicle',
      label: 'Phương tiện',
      type: 'relationship',
      relationTo: 'vehicles',
      required: true,
      index: true,
    },
    { name: 'vehicleReferenceSnapshot', label: 'Mã xe', type: 'text', index: true },
    {
      name: 'eventType',
      label: 'Loại sự kiện',
      type: 'select',
      options: [
        { label: 'Phân bổ chi nhánh / kho ban đầu', value: 'INITIAL_ALLOCATION' },
        { label: 'Bàn giao cho khách thuê', value: 'BOOKING_HANDOVER' },
        { label: 'Tiếp nhận xe khách trả', value: 'BOOKING_RETURN' },
        { label: 'Tiếp nhận trả xe khác chi nhánh', value: 'ONE_WAY_RETURN' },
        { label: 'Xuất kho điều chuyển', value: 'TRANSFER_DEPARTURE' },
        { label: 'Xe đến kho đích (chờ kiểm tra)', value: 'TRANSFER_ARRIVAL' },
        { label: 'Hoàn tất tiếp nhận điều chuyển', value: 'TRANSFER_COMPLETED' },
        { label: 'Xuất giao xe tận nơi', value: 'DELIVERY_DISPATCH' },
        { label: 'Thu hồi xe tận nơi về kho', value: 'PICKUP_RETURN' },
        { label: 'Điều chỉnh vị trí thủ công', value: 'MANUAL_RELOCATION' },
        { label: 'Hoàn tất kiểm tra sau trả xe', value: 'INSPECTION_CLEARED' },
        { label: 'Chuyển sang bảo dưỡng', value: 'MAINTENANCE_MOVE' },
      ],
      required: true,
      index: true,
    },
    {
      name: 'fromBranch',
      label: 'Chi nhánh đi',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
    },
    { name: 'fromWarehouse', label: 'Kho đi', type: 'relationship', relationTo: 'warehouses' },
    {
      name: 'toBranch',
      label: 'Chi nhánh đến',
      type: 'relationship',
      relationTo: 'branches',
      index: true,
    },
    { name: 'toWarehouse', label: 'Kho đến', type: 'relationship', relationTo: 'warehouses' },
    {
      name: 'relatedBooking',
      label: 'Đơn thuê liên quan',
      type: 'relationship',
      relationTo: 'bookings',
    },
    {
      name: 'relatedTransfer',
      label: 'Phiếu điều chuyển liên quan',
      type: 'relationship',
      relationTo: 'vehicle-transfers',
    },
    {
      name: 'relatedDeliveryJob',
      label: 'Nhiệm vụ giao nhận liên quan',
      type: 'relationship',
      relationTo: 'delivery-jobs',
    },
    { name: 'odometer', label: 'ODO tại thời điểm ghi nhận (km)', type: 'number', min: 0 },
    { name: 'conditionNote', label: 'Tình trạng xe', type: 'text', maxLength: 500 },
    { name: 'actorEmail', label: 'Người thực hiện', type: 'text' },
    { name: 'actorRole', label: 'Vai trò', type: 'text' },
    { name: 'occurredAt', label: 'Thời điểm phát sinh', type: 'text', required: true, index: true },
    { name: 'note', label: 'Ghi chú', type: 'textarea', maxLength: 1000 },
  ],
  versions: false,
}
