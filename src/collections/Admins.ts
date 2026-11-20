import { APIError, type CollectionConfig } from 'payload'
import {
  STAFF_TITLES,
  STAFF_TITLE_LABELS,
  adminHasPermission,
  adminRoleOf,
  isSuperAdmin,
  superAdminField,
} from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'

const audit = auditCollection({
  entity: 'admin',
  entityName: 'tài khoản quản trị',
  label: (doc) => String(doc.email ?? doc.id),
  fields: {
    fullName: 'Họ tên',
    adminRole: 'Vai trò',
    staffTitle: 'Chức danh chi nhánh',
    branchScopeMode: 'Phạm vi chi nhánh',
    assignedBranchIds: 'Danh sách chi nhánh phụ trách',
    accountStatus: 'Trạng thái tài khoản',
    email: 'Email',
    permissions: 'Phân quyền RBAC',
  },
})

async function countSuperAdmins(
  req: Parameters<NonNullable<CollectionConfig['access']>['read'] & Function>[0]['req'],
) {
  const result = await req.payload.count({
    collection: 'admins',
    overrideAccess: true,
    req,
    where: { adminRole: { equals: 'SUPER_ADMIN' } },
  })
  return result.totalDocs
}

export const Admins: CollectionConfig = {
  slug: 'admins',
  labels: { singular: 'Quản trị viên', plural: 'Quản trị viên' },
  access: {
    create: isSuperAdmin,
    delete: isSuperAdmin,
    read: ({ req }) => {
      if (adminHasPermission(req.user, 'admins', 'read')) return true
      if (req.user?.collection === 'admins') return { id: { equals: req.user.id } }
      return false
    },
    // Super admins manage every account; other admins may only update their own profile/password.
    update: ({ req }) => {
      const role = adminRoleOf(req.user)
      if (role === 'SUPER_ADMIN') return true
      if (role === 'OPERATOR' && req.user) return { id: { equals: req.user.id } }
      return false
    },
  },
  admin: {
    useAsTitle: 'email',
    group: 'NORI · Hệ thống',
    defaultColumns: ['email', 'fullName', 'adminRole'],
  },
  auth: { tokenExpiration: 86_400, maxLoginAttempts: 8, lockTime: 600_000 },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (!data) return data
        if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase()
        if (typeof data.fullName === 'string') data.fullName = data.fullName.trim()
        if (
          operation === 'update' &&
          originalDoc?.adminRole === 'SUPER_ADMIN' &&
          data.adminRole &&
          data.adminRole !== 'SUPER_ADMIN' &&
          (await countSuperAdmins(req)) <= 1
        ) {
          throw new APIError('Không thể hạ quyền quản trị viên cấp cao cuối cùng của NORI.', 409)
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (req.user?.collection === 'admins' && String(req.user.id) === String(id)) {
          throw new APIError('Không thể tự xóa tài khoản đang đăng nhập.', 409)
        }
        const [target, total] = await Promise.all([
          req.payload.findByID({ collection: 'admins', id, overrideAccess: true, req, depth: 0 }),
          req.payload.count({ collection: 'admins', overrideAccess: true, req }),
        ])
        if (total.totalDocs <= 1) {
          throw new APIError('Không thể xóa quản trị viên cuối cùng của hệ thống.', 409)
        }
        if (target?.adminRole === 'SUPER_ADMIN' && (await countSuperAdmins(req)) <= 1) {
          throw new APIError('Không thể xóa quản trị viên cấp cao cuối cùng của NORI.', 409)
        }
      },
    ],
    afterChange: [audit.afterChange],
    afterDelete: [audit.afterDelete],
  },
  fields: [
    // Email and password are provided by Payload auth.
    { name: 'fullName', label: 'Họ và tên', type: 'text', maxLength: 100 },
    {
      name: 'adminRole',
      label: 'Vai trò quản trị',
      type: 'select',
      options: [
        { label: 'Quản trị viên cấp cao', value: 'SUPER_ADMIN' },
        { label: 'Nhân viên vận hành', value: 'OPERATOR' },
      ],
      defaultValue: 'OPERATOR',
      saveToJWT: true,
      access: { create: superAdminField, update: superAdminField },
    },
    {
      name: 'permissions',
      label: 'Phân quyền chi tiết theo module',
      type: 'json',
      access: { create: superAdminField, update: superAdminField },
    },
    {
      name: 'staffTitle',
      label: 'Chức danh vận hành / chi nhánh',
      type: 'select',
      options: STAFF_TITLES.map((v) => ({ label: STAFF_TITLE_LABELS[v], value: v })),
      defaultValue: 'OPERATOR',
      saveToJWT: true,
      access: { create: superAdminField, update: superAdminField },
    },
    {
      name: 'branchScopeMode',
      label: 'Phạm vi chi nhánh',
      type: 'select',
      options: [
        { label: 'Toàn hệ thống', value: 'ALL' },
        { label: 'Theo chi nhánh được phân công', value: 'ASSIGNED' },
      ],
      defaultValue: 'ALL',
      saveToJWT: true,
      access: { create: superAdminField, update: superAdminField },
    },
    {
      name: 'assignedBranchIds',
      label: 'Danh sách ID chi nhánh phụ trách (JSON)',
      type: 'json',
      access: { create: superAdminField, update: superAdminField },
    },
    {
      name: 'accountStatus',
      label: 'Trạng thái hoạt động tài khoản',
      type: 'select',
      options: [
        { label: 'Đang hoạt động', value: 'ACTIVE' },
        { label: 'Đã thu hồi quyền', value: 'REVOKED' },
        { label: 'Tạm khóa', value: 'SUSPENDED' },
      ],
      defaultValue: 'ACTIVE',
      index: true,
      access: { create: superAdminField, update: superAdminField },
    },
    { name: 'phone', label: 'Số điện thoại nội bộ', type: 'text', maxLength: 20 },
  ],
  versions: false,
}
