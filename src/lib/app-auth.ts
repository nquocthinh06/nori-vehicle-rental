import 'server-only'
import { cookies } from 'next/headers'
import { JWTAuthentication } from 'payload'
import {
  adminRoleOf,
  resolveAdminPermissions,
  type AdminPermissionMap,
  type AdminRole,
} from '@/access/nori'
import { getPayloadClient } from './payload'

export function createAppAuth(appUserCollection: 'users') {
  const cookieName = 'app-session'
  const adminCookieName = 'payload-token'
  const secure = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: 7200,
  }
  return {
    async currentUser() {
      const token = (await cookies()).get(cookieName)?.value
      if (!token) return null
      const payload = await getPayloadClient()
      const authHeaders = new Headers({ Authorization: `JWT ${token}` })
      const resolved = await payload.auth({ headers: authHeaders })
      // Managed CMS auth may register only the admins SSO strategy.
      // Use Payload's public native verifier for app JWTs; never alter CMS strategies.
      const { user } =
        resolved.user?.collection === appUserCollection
          ? resolved
          : await JWTAuthentication({ headers: authHeaders, payload })
      if (!user || user.collection !== appUserCollection || user.status !== 'ACTIVE') return null
      return user
    },
    async currentAdmin(): Promise<{
      id: string
      email: string
      fullName: string
      adminRole: AdminRole
      permissions: AdminPermissionMap
      collection: 'admins'
    } | null> {
      const token = (await cookies()).get(adminCookieName)?.value
      if (!token) return null
      try {
        const payload = await getPayloadClient()
        const authHeaders = new Headers({
          Authorization: `JWT ${token}`,
          Cookie: `${adminCookieName}=${token}`,
        })
        const resolved = await payload.auth({ headers: authHeaders })
        const { user } =
          resolved.user?.collection === 'admins'
            ? resolved
            : await JWTAuthentication({ headers: authHeaders, payload })
        if (!user || user.collection !== 'admins' || !user.email) return null
        return {
          id: String(user.id),
          email: String(user.email),
          fullName:
            typeof user.fullName === 'string' && user.fullName.trim()
              ? user.fullName.trim()
              : 'Quản trị viên NORI',
          adminRole: adminRoleOf(user) ?? 'OPERATOR',
          permissions: resolveAdminPermissions(user),
          collection: 'admins',
        }
      } catch {
        return null
      }
    },
    async login(email: string, password: string) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (!result.token || !result.user || result.user.status !== 'ACTIVE')
        throw new Error('UNAUTHORIZED')
      const store = await cookies()
      store.set(cookieName, result.token, cookieOptions)
      store.set(adminCookieName, '', { ...cookieOptions, maxAge: 0 })
      return result.user
    },
    async loginAdmin(email: string, password: string) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: 'admins',
        data: { email, password },
      })
      if (!result.token || !result.user?.email) throw new Error('UNAUTHORIZED')
      const store = await cookies()
      store.set(adminCookieName, result.token, cookieOptions)
      store.set(cookieName, '', { ...cookieOptions, maxAge: 0 })
      return {
        id: String(result.user.id),
        email: String(result.user.email),
        fullName:
          typeof result.user.fullName === 'string' && result.user.fullName.trim()
            ? result.user.fullName.trim()
            : 'Quản trị viên NORI',
        adminRole: adminRoleOf({ ...result.user, collection: 'admins' }) ?? 'OPERATOR',
      }
    },
    async logout() {
      const store = await cookies()
      store.set(cookieName, '', { ...cookieOptions, maxAge: 0 })
      store.set(adminCookieName, '', { ...cookieOptions, maxAge: 0 })
    },
  }
}

export const appAuth = createAppAuth('users')
