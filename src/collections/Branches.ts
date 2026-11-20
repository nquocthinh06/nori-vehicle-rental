import { APIError, type CollectionConfig, type Where } from 'payload'
import {
  adminBranchScope,
  adminHasAnyPermission,
  adminPermission,
  branchScopedWhere,
} from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'
import {
  BRANCH_STATUSES,
  branchStatusLabels,
  normalizeCode,
  slugifyBranchCode,
} from '@/lib/multi-branch-rules'
import { HOLD_STATUSES, businessToday } from '@/lib/rental-rules'

const branchAudit = auditCollection({
  entity: 'branch',
  entityName: 'chi nhánh',
  label: (doc) => `${String(doc.code ?? '')} · ${String(doc.name ?? doc.id)}`.trim(),
  statusField: 'status',
  statusLabels: branchStatusLabels,
  fields: {
    name: 'Tên chi nhánh',
    address: 'Địa chỉ',
    province: 'Tỉnh/Thành phố',
    hotline: 'Hotline',
    email: 'Email',
    operatingHoursLabel: 'Giờ hoạt động',
    supportsHomeDelivery: 'Giao tận nơi',
    supportsHomePickup: 'Thu hồi tận nơi',
    defaultDeliveryFee: 'Phí giao mặc định',
    defaultPickupFee: 'Phí thu hồi mặc định',
  },
})

export const Branches: CollectionConfig = {
  slug: 'branches',
  labels: { singular: 'Chi nhánh', plural: 'Hệ thống chi nhánh' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Chi nhánh & Vận hành',
    defaultColumns: ['code', 'name', 'province', 'hotline', 'status'],
  },
  access: {
    create: adminPermission('branches', 'create'),
    read: ({ req }): boolean | Where => {
      if (
        adminHasAnyPermission(req.user, [
          ['branches', 'read'],
          ['warehouses', 'read'],
          ['locations', 'read'],
          ['vehicles', 'read'],
          ['bookings', 'read'],
          ['transfers', 'read'],
          ['deliveries', 'read'],
          ['pricing', 'read'],
          ['staff', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return branchScopedWhere(req.user, ['id'])
      }
      return { status: { equals: 'ACTIVE' } }
    },
    update: ({ req }) => {
      if (!adminHasAnyPermission(req.user, [['branches', 'update']])) return false
      return branchScopedWhere(req.user, ['id'])
    },
    delete: ({ req }) => {
      if (!adminHasAnyPermission(req.user, [['branches', 'delete']])) return false
      const scope = adminBranchScope(req.user)
      return scope.isGlobal
    },
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const rawCode = data.code ?? originalDoc?.code ?? ''
        if (typeof rawCode === 'string' && rawCode.trim()) {
          data.code = normalizeCode(rawCode, 32)
        }
        if (!data.slug && (data.code || data.name)) {
          data.slug = slugifyBranchCode(String(data.code || data.name))
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (!data) return data
        if (typeof data.email === 'string' && data.email.trim()) {
          data.email = data.email.trim().toLowerCase()
        }
        if (operation === 'update' && originalDoc?.id) {
          const prevStatus = String(originalDoc.status ?? 'ACTIVE')
          const nextStatus = String(data.status ?? prevStatus)
          if (prevStatus === 'ACTIVE' && nextStatus !== 'ACTIVE') {
            const today = businessToday()
            const futureBookings = await req.payload.count({
              collection: 'bookings',
              overrideAccess: true,
              req,
              where: {
                and: [
                  {
                    or: [
                      { pickupBranch: { equals: originalDoc.id } },
                      { returnBranch: { equals: originalDoc.id } },
                    ],
                  },
                  { status: { in: [...HOLD_STATUSES] } },
                  { endDate: { greater_than_equal: today } },
                ],
              },
            })
            if (futureBookings.totalDocs > 0 && req.context?.acknowledgeFutureBookings !== true) {
              throw new APIError(
                `Chi nhánh hiện còn ${futureBookings.totalDocs} đơn thuê đang hoạt động hoặc lịch giao nhận trong tương lai. Hệ thống không tự hủy các đơn đã xác nhận; vui lòng xác nhận cảnh báo để tạm ngừng nhận đơn mới.`,
                409,
              )
            }
          }
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const [vehCount, whCount, locCount, bkgCount, trfCount, staffCount] = await Promise.all([
          req.payload.count({
            collection: 'vehicles',
            overrideAccess: true,
            req,
            where: {
              or: [{ managingBranch: { equals: id } }, { currentBranch: { equals: id } }],
            },
          }),
          req.payload.count({
            collection: 'warehouses',
            overrideAccess: true,
            req,
            where: { branch: { equals: id } },
          }),
          req.payload.count({
            collection: 'service-locations',
            overrideAccess: true,
            req,
            where: { branch: { equals: id } },
          }),
          req.payload.count({
            collection: 'bookings',
            overrideAccess: true,
            req,
            where: {
              or: [{ pickupBranch: { equals: id } }, { returnBranch: { equals: id } }],
            },
          }),
          req.payload.count({
            collection: 'vehicle-transfers',
            overrideAccess: true,
            req,
            where: {
              or: [{ fromBranch: { equals: id } }, { toBranch: { equals: id } }],
            },
          }),
          req.payload.count({
            collection: 'branch-staff',
            overrideAccess: true,
            req,
            where: { branch: { equals: id } },
          }),
        ])
        const totalLinked =
          vehCount.totalDocs +
          whCount.totalDocs +
          locCount.totalDocs +
          bkgCount.totalDocs +
          trfCount.totalDocs +
          staffCount.totalDocs
        if (totalLinked > 0) {
          throw new APIError(
            'Không thể xóa cứng chi nhánh đã phát sinh kho xe, phương tiện, nhân viên, đơn thuê hoặc lịch sử điều chuyển. Hãy chuyển trạng thái sang Ngừng hoạt động hoặc Đã lưu trữ.',
            409,
          )
        }
      },
    ],
    afterChange: [revalidateCatalogue, branchAudit.afterChange],
    afterDelete: [revalidateDeletedCatalogue, branchAudit.afterDelete],
  },
  fields: [
    {
      name: 'code',
      label: 'Mã chi nhánh',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    { name: 'name', label: 'Tên chi nhánh', type: 'text', required: true, maxLength: 160 },
    { name: 'slug', label: 'Slug chi nhánh', type: 'text', unique: true, index: true },
    { name: 'address', label: 'Địa chỉ đầy đủ', type: 'text', required: true, maxLength: 300 },
    { name: 'province', label: 'Tỉnh / Thành phố', type: 'text', required: true, index: true },
    { name: 'ward', label: 'Phường / Xã / Quận', type: 'text', maxLength: 120 },
    { name: 'latitude', label: 'Vĩ độ (chỉ nhập khi đã xác minh)', type: 'number' },
    { name: 'longitude', label: 'Kinh độ (chỉ nhập khi đã xác minh)', type: 'number' },
    { name: 'hotline', label: 'Hotline liên hệ', type: 'text', maxLength: 30 },
    { name: 'email', label: 'Email chi nhánh', type: 'text', maxLength: 160 },
    {
      name: 'manager',
      label: 'Người quản lý chi nhánh',
      type: 'relationship',
      relationTo: 'admins',
    },
    { name: 'managerNameSnapshot', label: 'Tên quản lý hiển thị', type: 'text', maxLength: 120 },
    { name: 'timezone', label: 'Múi giờ', type: 'text', defaultValue: 'Asia/Ho_Chi_Minh' },
    {
      name: 'workingDays',
      label: 'Ngày làm việc trong tuần (0=CN..6=T7)',
      type: 'text',
      defaultValue: '1,2,3,4,5,6,0',
    },
    { name: 'workStartTime', label: 'Giờ mở cửa (HH:MM)', type: 'text', defaultValue: '07:30' },
    { name: 'workEndTime', label: 'Giờ đóng cửa (HH:MM)', type: 'text', defaultValue: '21:00' },
    { name: 'lunchBreakStart', label: 'Bắt đầu nghỉ trưa (tùy chọn)', type: 'text' },
    { name: 'lunchBreakEnd', label: 'Kết thúc nghỉ trưa (tùy chọn)', type: 'text' },
    { name: 'operatingHoursLabel', label: 'Mô tả giờ làm việc', type: 'text', maxLength: 160 },
    { name: 'holidays', label: 'Danh sách ngày nghỉ (JSON)', type: 'json' },
    {
      name: 'coverImage',
      label: 'Hình ảnh đại diện chi nhánh',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'gallery',
      label: 'Thư viện hình ảnh chi nhánh',
      type: 'array',
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text', maxLength: 200 },
      ],
    },
    { name: 'description', label: 'Nội dung giới thiệu', type: 'textarea', maxLength: 2000 },
    {
      name: 'supportsHomeDelivery',
      label: 'Hỗ trợ giao xe tận nơi',
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
      name: 'deliveryStartTime',
      label: 'Giờ bắt đầu giao nhận tận nơi',
      type: 'text',
      defaultValue: '08:00',
    },
    {
      name: 'deliveryEndTime',
      label: 'Giờ kết thúc giao nhận tận nơi',
      type: 'text',
      defaultValue: '20:00',
    },
    {
      name: 'defaultDeliveryFee',
      label: 'Phí giao tận nơi mặc định (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'defaultPickupFee',
      label: 'Phí thu hồi tận nơi mặc định (VNĐ)',
      type: 'number',
      min: 0,
    },
    { name: 'afterHoursFee', label: 'Phí giao nhận ngoài giờ (VNĐ)', type: 'number', min: 0 },
    {
      name: 'freeDeliveryMinOrder',
      label: 'Giá trị đơn miễn phí giao tận nơi (VNĐ)',
      type: 'number',
      min: 0,
    },
    {
      name: 'maxDeliveryDistanceKm',
      label: 'Khoảng cách giao tối đa (km, tùy chọn)',
      type: 'number',
      min: 0,
    },
    {
      name: 'deliveryStaffCapacityPerSlot',
      label: 'Năng lực nhân viên giao nhận mỗi khung giờ',
      type: 'number',
      min: 1,
      defaultValue: 2,
    },
    {
      name: 'defaultPreparationMinutes',
      label: 'Thời gian chuẩn bị xe tiêu chuẩn (phút)',
      type: 'number',
      min: 0,
      defaultValue: 120,
    },
    {
      name: 'status',
      label: 'Trạng thái hoạt động',
      type: 'select',
      options: BRANCH_STATUSES.map((v) => ({ label: branchStatusLabels[v], value: v })),
      defaultValue: 'ACTIVE',
      required: true,
      index: true,
    },
    { name: 'isDemo', label: 'Dữ liệu kiểm thử / minh họa', type: 'checkbox', defaultValue: false },
  ],
  versions: false,
}
