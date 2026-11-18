import 'server-only'
import { cookies, headers } from 'next/headers'
import { JWTAuthentication, type Payload } from 'payload'
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
import { ADMIN_COOKIE_NAME, hasActiveSessionRecord } from './session-cookie'

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
  const reqHeaders = await headers()
  let { user } = await payload.auth({ headers: reqHeaders })
  if (user?.collection === 'admins' && !hasActiveSessionRecord(user)) {
    user = null
  }
  if (user?.collection !== 'admins' && reqHeaders.get('sec-fetch-site') !== 'cross-site') {
    const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value
    if (token) {
      try {
        const fallback = await JWTAuthentication({
          headers: new Headers({
            Authorization: `JWT ${token}`,
            DisableAutologin: 'true',
          }),
          payload,
        })
        if (fallback.user?.collection === 'admins' && hasActiveSessionRecord(fallback.user)) {
          user = fallback.user
        }
      } catch {
        // invalid or expired admin token
      }
    }
  }
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

export async function resolveCustomerDisplayNames(
  payload: Payload,
  ids: Iterable<string>,
): Promise<Map<string, { fullName: string; email?: string }>> {
  const uniqueIds = Array.from(new Set(Array.from(ids).filter(Boolean)))
  const map = new Map<string, { fullName: string; email?: string }>()
  if (!uniqueIds.length) return map
  const res = await payload.find({
    collection: 'users',
    overrideAccess: true,
    depth: 0,
    limit: uniqueIds.length,
    where: { id: { in: uniqueIds } },
    select: { fullName: true, email: true },
  })
  for (const doc of res.docs) {
    map.set(String(doc.id), {
      fullName: doc.fullName || 'Chưa cập nhật',
      email: doc.email || undefined,
    })
  }
  return map
}
