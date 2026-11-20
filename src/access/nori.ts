import type { Access, FieldAccess, Where } from 'payload'

export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR'

export const STAFF_TITLES = [
  'SUPER_ADMIN',
  'SYSTEM_ADMIN',
  'BRANCH_MANAGER',
  'RENTAL_STAFF',
  'WAREHOUSE_STAFF',
  'DELIVERY_STAFF',
  'ACCOUNTANT',
  'OPERATOR',
] as const

export type StaffTitle = (typeof STAFF_TITLES)[number]
export type BranchScopeMode = 'ALL' | 'ASSIGNED'
export type AdminAccountStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED'

export const STAFF_TITLE_LABELS: Record<StaffTitle, string> = {
  SUPER_ADMIN: 'Quản trị viên cấp cao (Super Admin)',
  SYSTEM_ADMIN: 'Quản trị hệ thống (System Admin)',
  BRANCH_MANAGER: 'Quản lý chi nhánh (Branch Manager)',
  RENTAL_STAFF: 'Nhân viên thuê xe (Rental Staff)',
  WAREHOUSE_STAFF: 'Nhân viên kho xe (Warehouse Staff)',
  DELIVERY_STAFF: 'Nhân viên giao nhận (Delivery Staff)',
  ACCOUNTANT: 'Kế toán chi nhánh (Accountant)',
  OPERATOR: 'Nhân viên vận hành (Operator)',
}

export const ADMIN_MODULES = [
  'vehicles',
  'models',
  'bookings',
  'inquiries',
  'maintenance',
  'promotions',
  'payments',
  'customers',
  'content',
  'posts',
  'reports',
  'admins',
  'settings',
  'branches',
  'warehouses',
  'locations',
  'staff',
  'transfers',
  'deliveries',
  'pricing',
] as const

export type AdminModule = (typeof ADMIN_MODULES)[number]
export type AdminAction = 'read' | 'create' | 'update' | 'delete' | 'publish'
export type AdminPermissionMap = Partial<Record<AdminModule, AdminAction[]>>

export const DEFAULT_OPERATOR_PERMISSIONS: AdminPermissionMap = {
  vehicles: ['read', 'create', 'update'],
  models: ['read', 'update'],
  bookings: ['read', 'update'],
  inquiries: ['read', 'update'],
  maintenance: ['read', 'create', 'update'],
  promotions: ['read'],
  payments: ['read', 'create', 'update'],
  customers: ['read', 'update'],
  content: ['read'],
  posts: ['read', 'create', 'update'],
  reports: ['read'],
  admins: [],
  settings: [],
  branches: ['read'],
  warehouses: ['read', 'update'],
  locations: ['read'],
  staff: [],
  transfers: ['read', 'create', 'update'],
  deliveries: ['read', 'create', 'update'],
  pricing: ['read'],
}

export const STAFF_ROLE_PERMISSION_PRESETS: Record<StaffTitle, AdminPermissionMap> = {
  SUPER_ADMIN: Object.fromEntries(
    ADMIN_MODULES.map((m) => [m, ['read', 'create', 'update', 'delete', 'publish']]),
  ) as AdminPermissionMap,
  SYSTEM_ADMIN: {
    vehicles: ['read', 'create', 'update', 'delete'],
    models: ['read', 'create', 'update', 'delete'],
    bookings: ['read', 'update'],
    inquiries: ['read', 'update'],
    maintenance: ['read', 'create', 'update', 'delete'],
    promotions: ['read', 'create', 'update', 'delete'],
    payments: ['read', 'create', 'update'],
    customers: ['read', 'update'],
    content: ['read', 'update', 'publish'],
    posts: ['read', 'create', 'update', 'delete', 'publish'],
    reports: ['read'],
    admins: ['read'],
    settings: ['read', 'update'],
    branches: ['read', 'create', 'update'],
    warehouses: ['read', 'create', 'update'],
    locations: ['read', 'create', 'update'],
    staff: ['read', 'create', 'update'],
    transfers: ['read', 'create', 'update'],
    deliveries: ['read', 'create', 'update'],
    pricing: ['read', 'create', 'update', 'delete'],
  },
  BRANCH_MANAGER: {
    vehicles: ['read', 'create', 'update'],
    models: ['read'],
    bookings: ['read', 'update'],
    inquiries: ['read', 'update'],
    maintenance: ['read', 'create', 'update'],
    promotions: ['read', 'create', 'update'],
    payments: ['read', 'create', 'update'],
    customers: ['read', 'update'],
    content: ['read'],
    posts: ['read'],
    reports: ['read'],
    admins: [],
    settings: [],
    branches: ['read', 'update'],
    warehouses: ['read', 'create', 'update'],
    locations: ['read', 'create', 'update'],
    staff: ['read', 'create', 'update'],
    transfers: ['read', 'create', 'update'],
    deliveries: ['read', 'create', 'update'],
    pricing: ['read', 'create', 'update'],
  },
  RENTAL_STAFF: {
    vehicles: ['read'],
    models: ['read'],
    bookings: ['read', 'update'],
    inquiries: ['read', 'update'],
    maintenance: ['read'],
    promotions: ['read'],
    payments: ['read', 'create'],
    customers: ['read'],
    content: [],
    posts: [],
    reports: [],
    admins: [],
    settings: [],
    branches: ['read'],
    warehouses: ['read'],
    locations: ['read'],
    staff: [],
    transfers: ['read'],
    deliveries: ['read', 'create', 'update'],
    pricing: ['read'],
  },
  WAREHOUSE_STAFF: {
    vehicles: ['read', 'update'],
    models: ['read'],
    bookings: ['read'],
    inquiries: [],
    maintenance: ['read', 'create', 'update'],
    promotions: [],
    payments: [],
    customers: [],
    content: [],
    posts: [],
    reports: [],
    admins: [],
    settings: [],
    branches: ['read'],
    warehouses: ['read', 'update'],
    locations: ['read'],
    staff: [],
    transfers: ['read', 'create', 'update'],
    deliveries: ['read'],
    pricing: [],
  },
  DELIVERY_STAFF: {
    vehicles: ['read'],
    models: [],
    bookings: [],
    inquiries: [],
    maintenance: [],
    promotions: [],
    payments: [],
    customers: [],
    content: [],
    posts: [],
    reports: [],
    admins: [],
    settings: [],
    branches: ['read'],
    warehouses: ['read'],
    locations: ['read'],
    staff: [],
    transfers: ['read', 'update'],
    deliveries: ['read', 'update'],
    pricing: [],
  },
  ACCOUNTANT: {
    vehicles: ['read'],
    models: ['read'],
    bookings: ['read'],
    inquiries: [],
    maintenance: ['read'],
    promotions: ['read'],
    payments: ['read', 'create', 'update'],
    customers: ['read'],
    content: [],
    posts: [],
    reports: ['read'],
    admins: [],
    settings: [],
    branches: ['read'],
    warehouses: ['read'],
    locations: ['read'],
    staff: [],
    transfers: ['read'],
    deliveries: ['read'],
    pricing: ['read'],
  },
  OPERATOR: DEFAULT_OPERATOR_PERMISSIONS,
}

export function isAdminAccountActive(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const record = user as { collection?: unknown; accountStatus?: unknown }
  if (record.collection !== 'admins') return false
  if (record.accountStatus === 'REVOKED' || record.accountStatus === 'SUSPENDED') return false
  return true
}

/** Missing roles are treated as the least privileged admin role. Revoked/suspended admins return null. */
export function adminRoleOf(user: unknown): AdminRole | null {
  if (!isAdminAccountActive(user)) return null
  const record = user as { adminRole?: unknown }
  return record.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'
}

export function staffTitleOf(user: unknown): StaffTitle | null {
  const role = adminRoleOf(user)
  if (!role) return null
  if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN'
  const raw = (user as { staffTitle?: unknown })?.staffTitle
  if (typeof raw === 'string' && STAFF_TITLES.includes(raw as StaffTitle)) {
    return raw as StaffTitle
  }
  return 'OPERATOR'
}

export function resolveAdminPermissions(user: unknown): AdminPermissionMap {
  const role = adminRoleOf(user)
  if (!role) return {}
  if (role === 'SUPER_ADMIN') {
    const all: AdminAction[] = ['read', 'create', 'update', 'delete', 'publish']
    return Object.fromEntries(ADMIN_MODULES.map((m) => [m, all]))
  }
  const raw = (user as { permissions?: unknown })?.permissions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const title = staffTitleOf(user)
    if (title && title !== 'OPERATOR' && STAFF_ROLE_PERMISSION_PRESETS[title]) {
      return STAFF_ROLE_PERMISSION_PRESETS[title]
    }
    return DEFAULT_OPERATOR_PERMISSIONS
  }
  return raw as AdminPermissionMap
}

export function adminHasPermission(
  user: unknown,
  module: AdminModule,
  action: AdminAction = 'read',
): boolean {
  const role = adminRoleOf(user)
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  const perms = resolveAdminPermissions(user)
  return Boolean(perms[module]?.includes(action))
}

export function adminHasAnyPermission(
  user: unknown,
  checks: ReadonlyArray<readonly [AdminModule, AdminAction]>,
): boolean {
  return checks.some(([module, action]) => adminHasPermission(user, module, action))
}

export function adminBranchScope(user: unknown): {
  isGlobal: boolean
  branchIds: string[]
  staffTitle: StaffTitle | null
} {
  const role = adminRoleOf(user)
  if (!role) return { isGlobal: false, branchIds: [], staffTitle: null }
  const title = staffTitleOf(user)
  if (role === 'SUPER_ADMIN') {
    return { isGlobal: true, branchIds: [], staffTitle: 'SUPER_ADMIN' }
  }
  const record = user as { branchScopeMode?: unknown; assignedBranchIds?: unknown }
  if (record.branchScopeMode === 'ASSIGNED') {
    const rawIds = Array.isArray(record.assignedBranchIds)
      ? record.assignedBranchIds
      : typeof record.assignedBranchIds === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(record.assignedBranchIds)
              return Array.isArray(parsed) ? parsed : []
            } catch {
              return []
            }
          })()
        : []
    const branchIds = [...new Set(rawIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
    return { isGlobal: false, branchIds, staffTitle: title }
  }
  return { isGlobal: true, branchIds: [], staffTitle: title }
}

export function adminCanAccessBranch(user: unknown, branchId: string | null | undefined): boolean {
  const role = adminRoleOf(user)
  if (!role) return false
  const scope = adminBranchScope(user)
  if (scope.isGlobal) return true
  if (!branchId) return false
  return scope.branchIds.includes(String(branchId))
}

export function adminCanAccessAnyBranch(
  user: unknown,
  branchIds: ReadonlyArray<string | null | undefined>,
): boolean {
  const role = adminRoleOf(user)
  if (!role) return false
  const scope = adminBranchScope(user)
  if (scope.isGlobal) return true
  return branchIds.some((id) => Boolean(id && scope.branchIds.includes(String(id))))
}

export function branchScopedWhere(user: unknown, fields: string[]): boolean | Where {
  const role = adminRoleOf(user)
  if (!role) return false
  const scope = adminBranchScope(user)
  if (scope.isGlobal) return true
  if (scope.branchIds.length === 0) return false
  if (fields.length === 1) {
    return { [fields[0]]: { in: scope.branchIds } }
  }
  return {
    or: fields.map((f) => ({ [f]: { in: scope.branchIds } })),
  }
}

export function canManageStaffAssignment(params: {
  actor: unknown
  targetAdminId?: string | null
  targetAdminRole?: AdminRole
  targetStaffTitle?: StaffTitle
  targetBranchScopeMode?: BranchScopeMode
  targetBranchIds?: string[]
}): { allowed: boolean; reason?: string } {
  const actorRole = adminRoleOf(params.actor)
  if (!actorRole) {
    return { allowed: false, reason: 'Tài khoản không hợp lệ hoặc đã bị thu hồi quyền.' }
  }
  const actorId = String((params.actor as { id?: unknown })?.id ?? '')
  if (params.targetAdminId && actorId && String(params.targetAdminId) === actorId) {
    return {
      allowed: false,
      reason:
        'Không được phép tự thay đổi vai trò, phân quyền hoặc phạm vi chi nhánh của chính mình.',
    }
  }
  if (actorRole === 'SUPER_ADMIN') {
    return { allowed: true }
  }
  if (
    !adminHasPermission(params.actor, 'staff', 'update') &&
    !adminHasPermission(params.actor, 'staff', 'create')
  ) {
    return { allowed: false, reason: 'Tài khoản chưa được cấp quyền quản lý nhân viên chi nhánh.' }
  }
  if (
    params.targetAdminRole === 'SUPER_ADMIN' ||
    params.targetStaffTitle === 'SUPER_ADMIN' ||
    params.targetStaffTitle === 'SYSTEM_ADMIN'
  ) {
    return {
      allowed: false,
      reason:
        'Quản lý chi nhánh không có quyền tạo hoặc nâng quyền lên Super Admin / System Admin.',
    }
  }
  const scope = adminBranchScope(params.actor)
  if (!scope.isGlobal) {
    if (params.targetBranchScopeMode === 'ALL') {
      return {
        allowed: false,
        reason: 'Nhân viên thuộc phạm vi chi nhánh không thể cấp quyền truy cập toàn hệ thống.',
      }
    }
    const targetBranches = params.targetBranchIds ?? []
    if (
      targetBranches.length === 0 ||
      targetBranches.some((bId) => !scope.branchIds.includes(bId))
    ) {
      return {
        allowed: false,
        reason: 'Chỉ được phân công nhân viên trong phạm vi chi nhánh bạn đang quản lý.',
      }
    }
  }
  return { allowed: true }
}

export function adminPermission(module: AdminModule, action: AdminAction = 'read'): Access {
  return ({ req }) => adminHasPermission(req.user, module, action)
}

export function adminBranchPermission(
  module: AdminModule,
  action: AdminAction,
  branchFields: string[],
): Access {
  return ({ req }) => {
    if (!adminHasPermission(req.user, module, action)) return false
    return branchScopedWhere(req.user, branchFields)
  }
}

export function adminMediaWriteAccess(req: { user?: unknown }): boolean {
  return adminHasAnyPermission(req.user, [
    ['vehicles', 'create'],
    ['vehicles', 'update'],
    ['models', 'create'],
    ['models', 'update'],
    ['posts', 'create'],
    ['posts', 'update'],
    ['content', 'update'],
    ['branches', 'create'],
    ['branches', 'update'],
    ['transfers', 'update'],
    ['deliveries', 'update'],
  ])
}

export function adminMediaDeleteAccess(req: { user?: unknown }): boolean {
  return adminHasAnyPermission(req.user, [
    ['vehicles', 'delete'],
    ['vehicles', 'update'],
    ['models', 'delete'],
    ['models', 'update'],
    ['posts', 'delete'],
    ['posts', 'update'],
    ['content', 'update'],
    ['branches', 'update'],
  ])
}

export const isAdmin: Access = ({ req }) => isAdminAccountActive(req.user)
export const isSuperAdmin: Access = ({ req }) => adminRoleOf(req.user) === 'SUPER_ADMIN'
export const adminField: FieldAccess = ({ req }) => isAdminAccountActive(req.user)
export const superAdminField: FieldAccess = ({ req }) => adminRoleOf(req.user) === 'SUPER_ADMIN'
export const serverField: FieldAccess = () => false

export const ownAccount: Access = ({ req }) => {
  if (isAdminAccountActive(req.user)) return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { id: { equals: req.user.id } }
}

export const ownRecords: Access = ({ req }) => {
  if (isAdminAccountActive(req.user)) return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { customer: { equals: req.user.id } }
}

export const customerOnly: Access = ({ req }) =>
  req.user?.collection === 'users' && req.user.status === 'ACTIVE'
