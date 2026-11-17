import 'server-only'
import { cookies } from 'next/headers'
import { JWTAuthentication } from 'payload'
import { getPayloadClient } from './payload'

export function createAppAuth(appUserCollection: 'users') {
  const cookieName = 'app-session'
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
    async login(email: string, password: string) {
      const payload = await getPayloadClient()
      const result = await payload.login({
        collection: appUserCollection,
        data: { email, password },
      })
      if (!result.token || !result.user || result.user.status !== 'ACTIVE')
        throw new Error('UNAUTHORIZED')
      ;(await cookies()).set(cookieName, result.token, cookieOptions)
      return result.user
    },
    async logout() {
      ;(await cookies()).set(cookieName, '', { ...cookieOptions, maxAge: 0 })
    },
  }
}

export const appAuth = createAppAuth('users')
