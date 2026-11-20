import type { CollectionConfig } from 'payload'
import { adminHasAnyPermission } from '@/access/nori'

/**
 * Append-only operational journal. Entries are written only by server hooks
 * (overrideAccess) and can never be edited or removed through any API.
 */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Nhật ký thao tác', plural: 'Nhật ký thao tác' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'summary',
    group: 'NORI · Hệ thống',
    defaultColumns: ['createdAt', 'actorEmail', 'action', 'entity', 'summary'],
  },
  access: {
    create: () => false,
    read: ({ req }) =>
      adminHasAnyPermission(req.user, [
        ['admins', 'read'],
        ['reports', 'read'],
      ]),
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'action', label: 'Hành động', type: 'text', required: true, index: true },
    { name: 'entity', label: 'Đối tượng', type: 'text', required: true, index: true },
    { name: 'entityId', label: 'Mã đối tượng', type: 'text', index: true },
    { name: 'entityLabel', label: 'Tên đối tượng', type: 'text' },
    { name: 'summary', label: 'Mô tả', type: 'text', required: true },
    { name: 'fromStatus', label: 'Trạng thái trước', type: 'text' },
    { name: 'toStatus', label: 'Trạng thái sau', type: 'text' },
    {
      name: 'actorType',
      label: 'Loại tác nhân',
      type: 'select',
      options: [
        { label: 'Quản trị viên', value: 'ADMIN' },
        { label: 'Khách hàng', value: 'CUSTOMER' },
        { label: 'Hệ thống', value: 'SYSTEM' },
      ],
      defaultValue: 'SYSTEM',
    },
    { name: 'actorId', label: 'Mã tác nhân', type: 'text' },
    { name: 'actorEmail', label: 'Email tác nhân', type: 'text' },
    { name: 'actorRole', label: 'Vai trò tác nhân', type: 'text' },
    { name: 'branchId', label: 'Chi nhánh liên quan', type: 'text', index: true },
    {
      name: 'outcome',
      label: 'Kết quả thao tác',
      type: 'select',
      options: ['SUCCESS', 'DENIED', 'FAILED'],
      defaultValue: 'SUCCESS',
    },
  ],
  versions: false,
}
