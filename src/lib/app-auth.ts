import 'server-only'
import { cookies, headers } from 'next/headers'
import { JWTAuthentication } from 'payload'
import {
  adminBranchScope,
  adminRoleOf,
  isAdminAccountActive,
  resolveAdminPermissions,
  staffTitleOf,
  type AdminPermissionMap,
  type AdminRole,
  type BranchScopeMode,
  type StaffTitle,
} from '@/access/nori'
import type { User } from '@/payload-types'
import { fail } from './api-utils'
import { getPayloadClient } from './payload'
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_SESSION_MAX_AGE,
  hasActiveSessionRecord,
  resolveRequestCookieConfig,
  type SessionCarrier,
} from './session-cookie'

async function buildCookieOptions(maxAge: number, request?: Request) {
  const reqHeaders = await headers()
  return resolveRequestCookieConfig({
    requestUrl: request?.url ?? null,
    forwardedProto:
      request?.headers.get('x-forwarded-proto') ?? reqHeaders.get('x-forwarded-proto'),
    originHeader: request?.headers.get('origin') ?? reqHeaders.get('origin'),
    refererHeader: request?.headers.get('referer') ?? reqHeaders.get('referer'),
    cfVisitorHeader:
      request?.headers.get('cf-visitor') ?? reqHeaders.get('cf-visitor'),
    forwardedSsl:
      request?.headers.get('x-forwarded-ssl') ?? reqHeaders.get('x-forwarded-ssl'),
    figmaPublicUrl: process.env.FIGMA_PUBLIC_URL ?? null,
    maxAge,
  })
}

async function revokeServerSession(collectionSlug: 'users' | 'admins', token: string) {
  if (!token) return
  try {
    const payload = await getPayloadClient()
    const authHeaders = new Headers({
      Authorization: `JWT ${token}`,
      DisableAutologin: 'true',
    })
    const { user } = await JWTAuthentication({ headers: authHeaders, payload })
    const sid = (user as SessionCarrier | null)?._sid
    if (!user?.id || !sid) return

    const doc = (await payload.db.findOne({
      collection: collectionSlug,
      where: { id: { equals: user.id } },
    })) as
      | ({
          sessions?: Array<{ id?: string; expiresAt?: string | null }>
          updatedAt?: unknown
        } & Record<string, unknown>)
      | null
    if (!doc || !Array.isArray(doc.sessions)) return

    const now = Date.now()
    doc.sessions = doc.sessions.filter((s) => {
      if (!s || s.id === sid) return false
      if (s.expiresAt) {
        const expMs = new Date(s.expiresAt).getTime()
        if (Number.isFinite(expMs) && expMs <= now) return false
      }
      return true
    })
    doc.updatedAt = null
    await payload.db.updateOne({
      id: user.id,
      collection: collectionSlug,
      data: doc,
      returning: false,
    })
  } catch {
    // Token already expired or invalid; cookie clearing still proceeds cleanly
  }
}

export function createAppAuth(appUserCollection: 'users') {
  return {
    async currentUser(): Promise<(User & { collection: 'users' }) | null> {
      const token = (await cookies()).get(CUSTOMER_COOKIE_NAME)?.value
      if (!token) return null
      try {
        const payload = await getPayloadClient()
        const authHeaders = new Headers({
          Authorization: `JWT ${token}`,
          DisableAutologin: 'true',
        })
        const resolved = await payload.auth({ headers: authHeaders })
        // Managed CMS auth may register only the admins SSO strategy.
        // Use Payload's public native verifier for app JWTs; never alter CMS strategies.
        const { user } =
          resolved.user?.collection === appUserCollection
            ? resolved
            : await JWTAuthentication({ headers: authHeaders, payload })
        if (
          !user ||
          user.collection !== appUserCollection ||
          user.status !== 'ACTIVE' ||
          user.role !== 'CUSTOMER' ||
          !hasActiveSessionRecord(user)
        ) {
          return null
        }
        return user as User & { collection: 'users' }
      } catch {
        return null
      }
    },

    async currentAdmin(): Promise<{
      id: string
      email: string
      fullName: string
      adminRole: AdminRole
      staffTitle: StaffTitle
      branchScopeMode: BranchScopeMode
      assignedBranchIds: string[]
      permissions: AdminPermissionMap
      collection: 'admins'
    } | null> {
      const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value
      if (!token) return null
      try {
        const payload = await getPayloadClient()
        const authHeaders = new Headers({
          Authorization: `JWT ${token}`,
          Cookie: `${ADMIN_COOKIE_NAME}=${token}`,
          DisableAutologin: 'true',
        })
        const resolved = await payload.auth({ headers: authHeaders })
        const { user } =
          resolved.user?.collection === 'admins'
            ? resolved
            : await JWTAuthentication({ headers: authHeaders, payload })
        if (
          !user ||
          user.collection !== 'admins' ||
          !user.email ||
          !hasActiveSessionRecord(user) ||
          !isAdminAccountActive(user)
        ) {
          return null
        }
        const scope = adminBranchScope(user)
        const role = adminRoleOf(user) ?? 'OPERATOR'
        return {
          id: String(user.id),
          email: String(user.email),
          fullName:
            typeof user.fullName === 'string' && user.fullName.trim()
              ? user.fullName.trim()
              : 'Quản trị viên NORI',
          adminRole: role,
          staffTitle: staffTitleOf(user) ?? (role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'),
          branchScopeMode: scope.isGlobal ? 'ALL' : 'ASSIGNED',
          assignedBranchIds: scope.branchIds,
          permissions: resolveAdminPermissions(user),
          collection: 'admins',
        }
      } catch {
        return null
      }
    },

    async requireCustomer(options?: {
      unauthMessage?: string
      adminForbiddenMessage?: string
    }): Promise<
      | { ok: true; user: User & { collection: 'users' } }
      | { ok: false; reason: 'ADMIN_ROLE' | 'UNAUTHENTICATED'; response: Response }
    > {
      const user = await this.currentUser()
      if (user) {
        return { ok: true, user }
      }
      const admin = await this.currentAdmin()
      if (admin) {
        return {
          ok: false,
          reason: 'ADMIN_ROLE',
          response: fail(
            options?.adminForbiddenMessage ??
              'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để thực hiện đặt thuê.',
            403,
            'ADMIN_ROLE_FORBIDDEN',
          ),
        }
      }
      return {
        ok: false,
        reason: 'UNAUTHENTICATED',
        response: fail(
          options?.unauthMessage ?? 'Vui lòng đăng nhập để tiếp tục.',
          401,
          'UNAUTHORIZED',
        ),
      }
    },

    async login(email: string, password: string, request?: Request) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (
        !result.token ||
        !result.user ||
        result.user.status !== 'ACTIVE' ||
        result.user.role !== 'CUSTOMER'
      ) {
        throw new Error('UNAUTHORIZED')
      }
      const opts = await buildCookieOptions(CUSTOMER_SESSION_MAX_AGE, request)
      const store = await cookies()
      store.set(CUSTOMER_COOKIE_NAME, result.token, opts)
      store.set(ADMIN_COOKIE_NAME, '', { ...opts, maxAge: 0, expires: new Date(0) })
      return result.user
    },

    async loginAdmin(email: string, password: string, request?: Request) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: 'admins',
        data: { email, password },
      })
      if (
        !result.token ||
        !result.user?.email ||
        !isAdminAccountActive({ ...result.user, collection: 'admins' })
      ) {
        throw new Error('UNAUTHORIZED')
      }
      const opts = await buildCookieOptions(ADMIN_SESSION_MAX_AGE, request)
      const store = await cookies()
      store.set(ADMIN_COOKIE_NAME, result.token, opts)
      store.set(CUSTOMER_COOKIE_NAME, '', { ...opts, maxAge: 0, expires: new Date(0) })
      const adminCarrier = { ...result.user, collection: 'admins' }
      const scope = adminBranchScope(adminCarrier)
      const role = adminRoleOf(adminCarrier) ?? 'OPERATOR'
      return {
        id: String(result.user.id),
        email: String(result.user.email),
        fullName:
          typeof result.user.fullName === 'string' && result.user.fullName.trim()
            ? result.user.fullName.trim()
            : 'Quản trị viên NORI',
        adminRole: role,
        staffTitle:
          staffTitleOf(adminCarrier) ?? (role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'),
        branchScopeMode: (scope.isGlobal ? 'ALL' : 'ASSIGNED') as BranchScopeMode,
        assignedBranchIds: scope.branchIds,
        permissions: resolveAdminPermissions(adminCarrier),
      }
    },

    async logout(request?: Request) {
      const store = await cookies()
      const currentCustomerToken = store.get(CUSTOMER_COOKIE_NAME)?.value ?? ''
      const currentAdminToken = store.get(ADMIN_COOKIE_NAME)?.value ?? ''
      await Promise.all([
        revokeServerSession(appUserCollection, currentCustomerToken),
        revokeServerSession('admins', currentAdminToken),
      ])
      const opts = await buildCookieOptions(0, request)
      store.set(CUSTOMER_COOKIE_NAME, '', { ...opts, maxAge: 0, expires: new Date(0) })
      store.set(ADMIN_COOKIE_NAME, '', { ...opts, maxAge: 0, expires: new Date(0) })
    },
  }
}

export const appAuth = createAppAuth('users')
