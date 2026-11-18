import { APIError, type CollectionConfig } from 'payload'
import {
  adminField,
  adminHasAnyPermission,
  adminPermission,
  customerOnly,
  serverField,
} from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import {
  calculateRollingPrice,
  canTransitionInquiry,
  HOLD_STATUSES,
  inquiryStatusLabels,
  relationId,
} from '@/lib/rental-rules'

const inquiryAudit = auditCollection({
  entity: 'inquiry',
  entityName: 'yêu cầu mua xe',
  label: (doc) => String(doc.reference ?? doc.id),
  statusField: 'status',
  statusLabels: inquiryStatusLabels,
  fields: { adminNote: 'Ghi chú nội bộ' },
})

export const SalesInquiries: CollectionConfig = {
  slug: 'sales-inquiries',
  labels: { singular: 'Yêu cầu mua xe', plural: 'Yêu cầu mua xe' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Vận hành',
    defaultColumns: ['reference', 'inquiryType', 'customer', 'model', 'vehicleReference', 'status'],
  },
  access: {
    create: customerOnly,
    read: ({ req }) => {
      if (
        adminHasAnyPermission(req.user, [
          ['inquiries', 'read'],
          ['customers', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return true
      }
      if (req.user?.collection === 'users' && req.user.status === 'ACTIVE') {
        return { customer: { equals: req.user.id } }
      }
      return false
    },
    update: adminPermission('inquiries', 'update'),
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create') {
          if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE')
            throw new APIError('Vui lòng đăng nhập.', 401)
          const id = relationId(data.model)
          if (!id) throw new APIError('Vui lòng chọn dòng xe.', 400)
          const model = await req.payload.findByID({
            collection: 'vehicle-models',
            id,
            overrideAccess: false,
            user: req.user,
            req,
            depth: 0,
          })
          if (!model.visible) throw new APIError('Dòng xe chưa được công bố.', 409)
          let quotedPriceSnapshot: number | undefined
          let estimatedRollingSnapshot: number | undefined
          let vehicleReference: string | undefined
          const vehicleID = relationId(data.vehicle)
          if (vehicleID) {
            const vehicle = await req.payload.findByID({
              collection: 'vehicles',
              id: vehicleID,
              overrideAccess: false,
              user: req.user,
              req,
              depth: 0,
            })
            if (
              relationId(vehicle.model) !== model.id ||
              vehicle.status !== 'ACTIVE' ||
              vehicle.intent === 'RENT' ||
              vehicle.operationStatus === 'SOLD' ||
              vehicle.operationStatus === 'INACTIVE'
            ) {
              throw new APIError('Xe thực tế được chọn không phù hợp cho giao dịch mua.', 409)
            }
            const lockedInquiry = await req.payload.count({
              collection: 'sales-inquiries',
              overrideAccess: true,
              req,
              where: {
                and: [
                  { vehicle: { equals: vehicleID } },
                  { status: { in: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED', 'DELIVERED'] } },
                ],
              },
            })
            if (lockedInquiry.totalDocs > 0) {
              throw new APIError(
                'Xe thực tế này đang có hồ sơ giữ chỗ hoặc đã bán. Vui lòng chọn xe khác.',
                409,
              )
            }
            vehicleReference = vehicle.reference
            if (vehicle.salePrice) {
              quotedPriceSnapshot = vehicle.salePrice
              estimatedRollingSnapshot =
                vehicle.estimatedRollingPrice ??
                calculateRollingPrice(
                  vehicle.salePrice,
                  model.category,
                  model.fuelType,
                  vehicle.vehicleConditionType === 'NEW',
                )?.totalEstimated
            }
          }
          return {
            ...data,
            vehicle: vehicleID,
            vehicleReference,
            customer: req.user.id,
            reference: `NM-${crypto.randomUUID()}`,
            status: 'NEW',
            quotedPriceSnapshot,
            estimatedRollingSnapshot,
            statusHistory: [
              {
                status: 'NEW',
                changedAt: new Date().toISOString(),
                changedBy: req.user.email ?? 'Khách hàng',
                note: 'Khách hàng gửi yêu cầu tư vấn / mua xe',
              },
            ],
          }
        }
        const nextStatus = data.status ?? originalDoc?.status
        const prevStatus = originalDoc?.status ?? 'NEW'
        if (nextStatus !== prevStatus && !canTransitionInquiry(prevStatus, nextStatus)) {
          throw new APIError('Không thể chuyển trạng thái yêu cầu mua xe theo thứ tự này.', 409)
        }
        const vehicleID = relationId(data.vehicle ?? originalDoc?.vehicle)
        if (nextStatus === 'DELIVERED' && prevStatus !== 'DELIVERED' && vehicleID) {
          const activeBookings = await req.payload.count({
            collection: 'bookings',
            overrideAccess: true,
            req,
            where: {
              and: [{ vehicle: { equals: vehicleID } }, { status: { in: [...HOLD_STATUSES] } }],
            },
          })
          if (activeBookings.totalDocs > 0) {
            throw new APIError(
              'Không thể bàn giao bán xe khi đang có đơn thuê chưa hoàn thành trên xe này.',
              409,
            )
          }
          await req.payload.update({
            collection: 'vehicles',
            id: vehicleID,
            req,
            overrideAccess: true,
            data: { operationStatus: 'SOLD', status: 'INACTIVE' },
          })
        } else if (
          (nextStatus === 'DEPOSIT_PENDING' || nextStatus === 'CONTRACT_SIGNED') &&
          nextStatus !== prevStatus &&
          vehicleID
        ) {
          const vehicle = await req.payload.findByID({
            collection: 'vehicles',
            id: vehicleID,
            req,
            overrideAccess: true,
            depth: 0,
          })
          if (
            vehicle &&
            vehicle.operationStatus !== 'RENTED' &&
            vehicle.operationStatus !== 'SOLD' &&
            vehicle.operationStatus !== 'INACTIVE'
          ) {
            await req.payload.update({
              collection: 'vehicles',
              id: vehicleID,
              req,
              overrideAccess: true,
              data: { operationStatus: 'RESERVED' },
            })
          }
        } else if (
          (nextStatus === 'CANCELLED' || nextStatus === 'CLOSED') &&
          (prevStatus === 'DEPOSIT_PENDING' || prevStatus === 'CONTRACT_SIGNED') &&
          vehicleID
        ) {
          const [otherLocked, ongoingBookings, vehicle] = await Promise.all([
            req.payload.count({
              collection: 'sales-inquiries',
              overrideAccess: true,
              req,
              where: {
                and: [
                  { vehicle: { equals: vehicleID } },
                  { id: { not_equals: originalDoc.id } },
                  { status: { in: ['DEPOSIT_PENDING', 'CONTRACT_SIGNED'] } },
                ],
              },
            }),
            req.payload.count({
              collection: 'bookings',
              overrideAccess: true,
              req,
              where: {
                and: [{ vehicle: { equals: vehicleID } }, { status: { equals: 'ONGOING' } }],
              },
            }),
            req.payload.findByID({
              collection: 'vehicles',
              id: vehicleID,
              req,
              overrideAccess: true,
              depth: 0,
            }),
          ])
          if (vehicle && vehicle.operationStatus === 'RESERVED') {
            if (ongoingBookings.totalDocs > 0) {
              await req.payload.update({
                collection: 'vehicles',
                id: vehicleID,
                req,
                overrideAccess: true,
                data: { operationStatus: 'RENTED' },
              })
            } else if (otherLocked.totalDocs === 0) {
              await req.payload.update({
                collection: 'vehicles',
                id: vehicleID,
                req,
                overrideAccess: true,
                data: { operationStatus: 'READY' },
              })
            }
          }
        }
        const prevHistory = Array.isArray(originalDoc?.statusHistory)
          ? originalDoc.statusHistory
          : []
        const nextHistory =
          nextStatus !== prevStatus
            ? [
                ...prevHistory,
                {
                  status: String(nextStatus),
                  changedAt: new Date().toISOString(),
                  changedBy: req.user?.email ?? 'Admin NORI',
                  note:
                    typeof data.adminNote === 'string' && data.adminNote.trim()
                      ? data.adminNote.trim().slice(0, 500)
                      : undefined,
                },
              ]
            : prevHistory
        return {
          ...data,
          statusHistory: nextHistory,
        }
      },
    ],
    afterChange: [inquiryAudit.afterChange],
  },
  fields: [
    {
      name: 'reference',
      label: 'Mã yêu cầu',
      type: 'text',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'inquiryType',
      label: 'Loại yêu cầu',
      type: 'select',
      options: ['CONSULTATION', 'QUOTE', 'VIEWING', 'TEST_DRIVE', 'PURCHASE_REQUEST'],
      defaultValue: 'CONSULTATION',
      access: { update: serverField },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'users',
      access: { create: serverField, update: serverField },
    },
    {
      name: 'model',
      label: 'Dòng xe quan tâm',
      type: 'relationship',
      relationTo: 'vehicle-models',
      required: true,
      access: { update: serverField },
    },
    {
      name: 'vehicle',
      label: 'Xe thực tế quan tâm (nếu có)',
      type: 'relationship',
      relationTo: 'vehicles',
      access: { update: serverField },
    },
    {
      name: 'vehicleReference',
      label: 'Mã xe thực tế quan tâm',
      type: 'text',
      access: { create: serverField, update: adminField },
    },
    {
      name: 'variantName',
      label: 'Phiên bản quan tâm',
      type: 'text',
      access: { update: serverField },
    },
    { name: 'colorName', label: 'Màu sắc quan tâm', type: 'text', access: { update: serverField } },
    {
      name: 'paymentMethod',
      label: 'Phương thức dự kiến',
      type: 'select',
      options: ['DIRECT', 'INSTALLMENT', 'CONSULT_FINANCE'],
      defaultValue: 'DIRECT',
      access: { update: serverField },
    },
    {
      name: 'preferredDate',
      label: 'Ngày hẹn xem / lái thử',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'preferredLocation',
      label: 'Địa điểm mong muốn',
      type: 'text',
      access: { update: serverField },
    },
    {
      name: 'quotedPriceSnapshot',
      label: 'Giá bán tham khảo lúc gửi (VNĐ)',
      type: 'number',
      access: { create: serverField, update: adminField },
    },
    {
      name: 'estimatedRollingSnapshot',
      label: 'Giá lăn bánh ước tính lúc gửi (VNĐ)',
      type: 'number',
      access: { create: serverField, update: adminField },
    },
    {
      name: 'phone',
      label: 'Số điện thoại liên hệ',
      type: 'text',
      required: true,
      validate: (value: unknown) =>
        /^\+?\d{9,15}$/.test(String(value ?? '')) || 'Số điện thoại cần 9–15 chữ số.',
    },
    { name: 'note', label: 'Nhu cầu', type: 'textarea', maxLength: 1000 },
    {
      name: 'adminNote',
      label: 'Ghi chú xử lý của Admin (nội bộ)',
      type: 'textarea',
      maxLength: 1000,
      access: { create: adminField, update: adminField },
    },
    {
      name: 'statusHistory',
      label: 'Lịch sử cập nhật',
      type: 'array',
      access: { create: serverField, update: serverField },
      fields: [
        { name: 'status', type: 'text', required: true },
        { name: 'changedAt', type: 'text', required: true },
        { name: 'changedBy', type: 'text' },
        { name: 'note', type: 'text' },
      ],
    },
    {
      name: 'status',
      label: 'Trạng thái',
      type: 'select',
      options: [
        'NEW',
        'CONTACTED',
        'TEST_DRIVE_SCHEDULED',
        'DEPOSIT_PENDING',
        'CONTRACT_SIGNED',
        'DELIVERED',
        'CLOSED',
        'CANCELLED',
      ],
      defaultValue: 'NEW',
      access: { create: serverField, update: adminField },
    },
  ],
  versions: false,
}
