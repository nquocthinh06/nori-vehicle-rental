import 'server-only'
import { headers } from 'next/headers'
import type { Payload } from 'payload'
import type { Admin } from '@/payload-types'
import {
  adminHasPermission,
  adminRoleOf,
  resolveAdminPermissions,
  type AdminAction,
  type AdminModule,
  type AdminPermissionMap,
  type AdminRole,
} from '@/access/nori'
import { fail } from './api-utils'
import { getPayloadClient } from './payload'

export type AuthenticatedAdmin = {
  id: string
  email: string
  fullName: string
  adminRole: AdminRole
  permissions: AdminPermissionMap
  collection: 'admins'
}

export async function requireAdmin(options?: {
  superAdmin?: boolean
  permission?: [AdminModule, AdminAction]
  message?: string
}): Promise<
  | {
      ok: true
      payload: Payload
      admin: AuthenticatedAdmin
      user: Admin & { collection: 'admins' }
    }
  | { ok: false; response: Response }
> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  if (user?.collection !== 'admins') {
    return {
      ok: false,
      response: fail(
        options?.message ?? 'Trang này chỉ dành cho quản trị viên NORI.',
        403,
        'FORBIDDEN',
      ),
    }
  }
  const role = adminRoleOf(user) ?? 'OPERATOR'
  if (options?.superAdmin && role !== 'SUPER_ADMIN') {
    return {
      ok: false,
      response: fail(
        'Thao tác này yêu cầu quyền Quản trị viên cấp cao (SUPER_ADMIN).',
        403,
        'FORBIDDEN',
      ),
    }
  }
  if (options?.permission) {
    const [mod, act] = options.permission
    if (!adminHasPermission(user, mod, act)) {
      return {
        ok: false,
        response: fail(
          `Tài khoản chưa được cấp quyền "${act}" cho phân hệ "${mod}".`,
          403,
          'FORBIDDEN',
        ),
      }
    }
  }
  const record = user as unknown as Record<string, unknown>
  return {
    ok: true,
    payload,
    user: user as unknown as Admin & { collection: 'admins' },
    admin: {
      id: String(user.id),
      email: String(user.email ?? ''),
      fullName:
        typeof record.fullName === 'string' && record.fullName.trim()
          ? record.fullName.trim()
          : 'Quản trị viên NORI',
      adminRole: role,
      permissions: resolveAdminPermissions(user),
      collection: 'admins',
    },
  }
}
