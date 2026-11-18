import { APIError, type CollectionConfig, type Where } from 'payload'
import { adminHasAnyPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import { HOLD_STATUSES, operationStatusLabels } from '@/lib/rental-rules'

const vehicleAudit = auditCollection({
  entity: 'vehicle',
  entityName: 'xe thực tế',
  label: (doc) => String(doc.reference ?? doc.id),
  statusField: 'operationStatus',
  statusLabels: operationStatusLabels,
  fields: {
    status: 'Trạng thái kinh doanh',
    pricePerDay: 'Giá thuê/ngày',
    salePrice: 'Giá bán',
    depositAmount: 'Tiền đặt cọc',
    odometer: 'ODO',
    maintenanceHistory: 'Lịch sử bảo dưỡng',
  },
})

export const Vehicles: CollectionConfig = {
  slug: 'vehicles',
  labels: { singular: 'Xe thực tế', plural: 'Kho xe thực tế' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Phương tiện',
    defaultColumns: [
      'reference',
      'model',
      'intent',
      'pricePerDay',
      'salePrice',
      'operationStatus',
      'isDemo',
      'status',
    ],
  },
  access: {
    create: adminPermission('vehicles', 'create'),
    read: ({ req }): boolean | Where =>
      adminHasAnyPermission(req.user, [
        ['vehicles', 'read'],
        ['bookings', 'read'],
        ['models', 'read'],
        ['maintenance', 'read'],
        ['reports', 'read'],
      ])
        ? true
        : {
            and: [
              { status: { equals: 'ACTIVE' } },
              { operationStatus: { not_equals: 'SOLD' } },
              { 'model.visible': { equals: true } },
            ],
          },
    update: adminPermission('vehicles', 'update'),
    delete: adminPermission('vehicles', 'delete'),
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const [bookingsCount, inquiriesCount] = await Promise.all([
          req.payload.count({
            collection: 'bookings',
            overrideAccess: true,
            req,
            where: { vehicle: { equals: id } },
          }),
          req.payload.count({
            collection: 'sales-inquiries',
            overrideAccess: true,
            req,
            where: { vehicle: { equals: id } },
          }),
        ])
        if (bookingsCount.totalDocs > 0 || inquiriesCount.totalDocs > 0) {
          throw new APIError(
            'Không thể xóa phương tiện đang có đơn thuê hoặc yêu cầu mua liên quan. Hãy chuyển trạng thái sang Tạm ngừng.',
            409,
          )
        }
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (!data) return data
        const nextOperationStatus = data.operationStatus ?? originalDoc?.operationStatus
        if (nextOperationStatus === 'SOLD') {
          if (operation === 'update' && originalDoc?.id) {
            const activeBookings = await req.payload.count({
              collection: 'bookings',
              overrideAccess: true,
              req,
              where: {
                and: [
                  { vehicle: { equals: originalDoc.id } },
                  { status: { in: [...HOLD_STATUSES] } },
                ],
              },
            })
            if (activeBookings.totalDocs > 0) {
              throw new APIError(
                'Không thể chuyển trạng thái Đã bán khi xe đang có đơn thuê chưa hoàn tất.',
                409,
              )
            }
          }
          data.status = 'INACTIVE'
        } else if (
          (nextOperationStatus === 'MAINTENANCE' || nextOperationStatus === 'INACTIVE') &&
          operation === 'update' &&
          originalDoc?.id
        ) {
          const ongoingBookings = await req.payload.count({
            collection: 'bookings',
            overrideAccess: true,
            req,
            where: {
              and: [{ vehicle: { equals: originalDoc.id } }, { status: { equals: 'ONGOING' } }],
            },
          })
          if (ongoingBookings.totalDocs > 0) {
            throw new APIError(
              'Không thể chuyển xe sang Bảo dưỡng hoặc Tạm ngừng khi đang có chuyến thuê đang diễn ra.',
              409,
            )
          }
        }
        return data
      },
    ],
    afterChange: [revalidateCatalogue, vehicleAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, vehicleAudit.afterDelete],
  },
  fields: [
    { name: 'reference', label: 'Mã quản lý xe', type: 'text', required: true, unique: true },
    {
      name: 'model',
      label: 'Dòng xe',
      type: 'relationship',
      relationTo: 'vehicle-models',
      required: true,
    },
    {
      name: 'licensePlate',
      label: 'Biển số (nội bộ)',
      type: 'text',
      required: true,
      unique: true,
      access: {
        read: ({ req }) =>
          adminHasAnyPermission(req.user, [
            ['vehicles', 'read'],
            ['bookings', 'read'],
            ['maintenance', 'read'],
            ['reports', 'read'],
          ]),
      },
      hooks: {
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
        ],
      },
    },
    {
      name: 'intent',
      label: 'Dịch vụ',
      type: 'select',
      options: ['RENT', 'SALE', 'BOTH'],
      required: true,
      defaultValue: 'RENT',
    },
    {
      name: 'isDemo',
      label: 'Dữ liệu minh họa (DEMO)',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'vehicleConditionType',
      label: 'Tình trạng sở hữu',
      type: 'select',
      options: [
        { label: 'Xe mới', value: 'NEW' },
        { label: 'Xe đã qua sử dụng', value: 'USED' },
      ],
      defaultValue: 'USED',
    },
    { name: 'manufactureYear', label: 'Năm sản xuất', type: 'number', min: 1990, max: 2035 },
    {
      name: 'pricePerDay',
      label: 'Giá thuê VNĐ/ngày (đã xác nhận)',
      type: 'number',
      min: 1,
      max: 100_000_000,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'Giá phải là số nguyên VNĐ.',
    },
    {
      name: 'pricePerHour',
      label: 'Giá thuê VNĐ/giờ (tùy chọn)',
      type: 'number',
      min: 0,
      max: 50_000_000,
    },
    {
      name: 'pricePerWeek',
      label: 'Giá thuê tham khảo/tuần (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'pricePerMonth',
      label: 'Giá thuê tham khảo/tháng (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'weekendSurcharge',
      label: 'Phụ phí cuối tuần (VNĐ/ngày T7–CN)',
      type: 'number',
      min: 0,
    },
    {
      name: 'holidaySurcharge',
      label: 'Phụ phí ngày lễ (VNĐ/ngày)',
      type: 'number',
      min: 0,
    },
    {
      name: 'depositAmount',
      label: 'Tiền đặt cọc đảm bảo (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'deliveryFee',
      label: 'Phí giao nhận xe tận nơi (VNĐ/lượt)',
      type: 'number',
      min: 0,
    },
    {
      name: 'kmLimitPerDay',
      label: 'Giới hạn km/ngày',
      type: 'number',
      min: 0,
      defaultValue: 300,
    },
    {
      name: 'overKmFee',
      label: 'Phí vượt giới hạn km (VNĐ/km)',
      type: 'number',
      min: 0,
    },
    {
      name: 'lateReturnFeePerHour',
      label: 'Phí trả xe trễ (VNĐ/giờ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'bufferHours',
      label: 'Thời gian chuẩn bị xe giữa hai lượt (giờ)',
      type: 'number',
      min: 0,
      defaultValue: 2,
    },
    {
      name: 'salePrice',
      label: 'Giá bán VNĐ (đã xác nhận)',
      type: 'number',
      min: 1,
      max: 100_000_000_000,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'Giá phải là số nguyên VNĐ.',
    },
    {
      name: 'listedPrice',
      label: 'Giá niêm yết tham khảo của hãng (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'discountPrice',
      label: 'Giá ưu đãi (nếu có, VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'reservationDeposit',
      label: 'Khoản đặt trước mua xe (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'estimatedRollingPrice',
      label: 'Giá lăn bánh tham khảo (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'negotiable',
      label: 'Có thể thương lượng giá mua',
      type: 'checkbox',
      defaultValue: false,
    },
    { name: 'warrantyPolicy', label: 'Chính sách bảo hành áp dụng', type: 'text' },
    { name: 'priceSourceNote', label: 'Ghi chú nguồn giá & điều kiện áp dụng', type: 'text' },
    {
      name: 'odometer',
      label: 'ODO thực tế (km)',
      type: 'number',
      min: 0,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'ODO phải là số nguyên km.',
    },
    { name: 'condition', label: 'Tình trạng thực tế tổng quát', type: 'textarea' },
    { name: 'exteriorCondition', label: 'Tình trạng ngoại thất', type: 'text' },
    { name: 'interiorCondition', label: 'Tình trạng nội thất', type: 'text' },
    { name: 'engineCondition', label: 'Tình trạng động cơ & vận hành', type: 'text' },
    { name: 'maintenanceHistory', label: 'Lịch sử bảo dưỡng', type: 'textarea' },
    { name: 'inspectedAt', label: 'Ngày kiểm tra thực tế', type: 'date' },
    { name: 'version', label: 'Phiên bản thực tế', type: 'text' },
    { name: 'color', label: 'Màu thực tế', type: 'text' },
    { name: 'location', label: 'Khu vực', type: 'text' },
    { name: 'pickupLocation', label: 'Địa điểm nhận & trả xe', type: 'text' },
    {
      name: 'operationStatus',
      label: 'Trạng thái vận hành thực tế',
      type: 'select',
      options: ['READY', 'RENTED', 'RESERVED', 'MAINTENANCE', 'SOLD', 'INACTIVE'],
      defaultValue: 'READY',
    },
    {
      name: 'photos',
      label: 'Ảnh chính chiếc xe này (không dùng catalogue)',
      type: 'array',
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
        {
          name: 'kind',
          type: 'select',
          options: ['EXTERIOR', 'INTERIOR', 'ENGINE', 'ACTUAL'],
          defaultValue: 'EXTERIOR',
        },
        { name: 'photoType', label: 'Phân loại góc chụp thực tế', type: 'text' },
        { name: 'isPrimary', label: 'Ảnh chính của xe', type: 'checkbox', defaultValue: false },
        { name: 'sortOrder', label: 'Thứ tự hiển thị', type: 'number', defaultValue: 0 },
        { name: 'altText', label: 'Alt text riêng', type: 'text' },
        { name: 'sourceName', label: 'Nguồn chụp / Người cập nhật', type: 'text' },
      ],
    },
    {
      name: 'status',
      label: 'Trạng thái kinh doanh',
      type: 'select',
      options: ['ACTIVE', 'INACTIVE'],
      defaultValue: 'INACTIVE',
      required: true,
      index: true,
    },
  ],
  versions: false,
}
