import 'server-only'
import { cookies, headers } from 'next/headers'
import { JWTAuthentication, type Payload } from 'payload'
import type { Admin } from '@/payload-types'
import {
  adminBranchScope,
  adminCanAccessBranch,
  adminHasPermission,
  adminRoleOf,
  isAdminAccountActive,
  resolveAdminPermissions,
  staffTitleOf,
  type AdminAction,
  type AdminModule,
  type AdminPermissionMap,
  type AdminRole,
  type BranchScopeMode,
  type StaffTitle,
} from '@/access/nori'
import { fail } from './api-utils'
import { getPayloadClient } from './payload'
import { ADMIN_COOKIE_NAME, hasActiveSessionRecord } from './session-cookie'

export type AuthenticatedAdmin = {
  id: string
  email: string
  fullName: string
  adminRole: AdminRole
  staffTitle: StaffTitle
  branchScopeMode: BranchScopeMode
  assignedBranchIds: string[]
  isGlobalScope: boolean
  permissions: AdminPermissionMap
  collection: 'admins'
}

export async function requireAdmin(options?: {
  superAdmin?: boolean
  permission?: [AdminModule, AdminAction]
  branchId?: string | null
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
  if (!isAdminAccountActive(user)) {
    return {
      ok: false,
      response: fail(
        'Tài khoản nhân viên đã bị thu hồi quyền hoặc tạm khóa. Vui lòng liên hệ Quản trị viên cấp cao.',
        403,
        'ACCOUNT_REVOKED',
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
  const scope = adminBranchScope(user)
  if (options?.branchId && !adminCanAccessBranch(user, options.branchId)) {
    return {
      ok: false,
      response: fail(
        'Bạn không có quyền truy cập hoặc thao tác trên chi nhánh nằm ngoài phạm vi được phân công.',
        403,
        'BRANCH_SCOPE_FORBIDDEN',
      ),
    }
  }
  const record = user as unknown as Record<string, unknown>
  const title = staffTitleOf(user) ?? (role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR')
  const scopeMode: BranchScopeMode = scope.isGlobal ? 'ALL' : 'ASSIGNED'
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
      staffTitle: title,
      branchScopeMode: scopeMode,
      assignedBranchIds: scope.branchIds,
      isGlobalScope: scope.isGlobal,
      permissions: resolveAdminPermissions(user),
      collection: 'admins',
    },
  }
}

export function assertBranchScopeOrFail(
  admin: AuthenticatedAdmin,
  branchId: string | null | undefined,
): Response | null {
  if (admin.isGlobalScope) return null
  if (!branchId || !admin.assignedBranchIds.includes(String(branchId))) {
    return fail(
      'Bạn không có quyền xem hoặc thao tác dữ liệu ngoài phạm vi chi nhánh được phân công.',
      403,
      'BRANCH_SCOPE_FORBIDDEN',
    )
  }
  return null
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
