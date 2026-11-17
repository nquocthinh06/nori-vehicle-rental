import type { Access, FieldAccess } from 'payload'

export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR'

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
}

/** Missing roles are treated as the least privileged admin role. */
export function adminRoleOf(user: unknown): AdminRole | null {
  if (!user || typeof user !== 'object') return null
  const record = user as { collection?: unknown; adminRole?: unknown }
  if (record.collection !== 'admins') return null
  return record.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'
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

export const isAdmin: Access = ({ req }) => req.user?.collection === 'admins'
export const isSuperAdmin: Access = ({ req }) => adminRoleOf(req.user) === 'SUPER_ADMIN'
export const adminField: FieldAccess = ({ req }) => req.user?.collection === 'admins'
export const superAdminField: FieldAccess = ({ req }) => adminRoleOf(req.user) === 'SUPER_ADMIN'
export const serverField: FieldAccess = () => false

export const ownAccount: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { id: { equals: req.user.id } }
}

export const ownRecords: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection !== 'users' || req.user.status !== 'ACTIVE') return false
  return { customer: { equals: req.user.id } }
}

export const customerOnly: Access = ({ req }) =>
  req.user?.collection === 'users' && req.user.status === 'ACTIVE'
