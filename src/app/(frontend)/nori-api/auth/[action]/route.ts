import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, assertRateLimit, body, fail, json, text } from '@/lib/api-utils'

type Context = { params: Promise<{ action: string }> }

function publicUser(user: { id: string; fullName: string; email: string; phone?: string | null }) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    role: 'CUSTOMER' as const,
    isAdmin: false,
  }
}

function publicAdmin(admin: {
  id: string
  email: string
  fullName?: string
  adminRole?: 'SUPER_ADMIN' | 'OPERATOR'
  staffTitle?: string
  branchScopeMode?: 'ALL' | 'ASSIGNED'
  assignedBranchIds?: string[]
  permissions?: Record<string, string[]>
}) {
  return {
    id: admin.id,
    fullName: admin.fullName || 'Quản trị viên NORI',
    email: admin.email,
    phone: null,
    role: 'ADMIN' as const,
    adminRole: admin.adminRole ?? 'OPERATOR',
    staffTitle:
      admin.staffTitle ?? (admin.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'),
    branchScopeMode: admin.branchScopeMode ?? 'ALL',
    assignedBranchIds: admin.assignedBranchIds ?? [],
    permissions: admin.permissions ?? {},
    isAdmin: true,
  }
}

export async function GET(_request: Request, context: Context) {
  if ((await context.params).action !== 'me') return fail('Không tìm thấy trang.', 404, 'NOT_FOUND')
  try {
    // Check active customer session (`app-session`) first so `/auth/me` is strictly
    // invariant with `appAuth.currentUser()` across Checkout, Bookings, and Account.
    const user = await appAuth.currentUser()
    if (user) return json(publicUser(user))
    const admin = await appAuth.currentAdmin()
    if (admin) return json(publicAdmin(admin))
    return json(null)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request, context: Context) {
  const { action } = await context.params
  try {
    assertOrigin(request)
    if (action === 'logout') {
      await appAuth.logout(request)
      return json({ loggedOut: true })
    }
    if (action === 'password') {
      assertRateLimit(request, 'auth-password', 20, 60_000)
      const user = await appAuth.currentUser()
      const admin = user ? null : await appAuth.currentAdmin()
      if (!admin && !user) return fail('Vui lòng đăng nhập để đổi mật khẩu.', 401, 'UNAUTHORIZED')
      const data = await body(request, ['currentPassword', 'newPassword', 'confirmPassword'])
      const currentPassword = typeof data.currentPassword === 'string' ? data.currentPassword : ''
      const newPassword = typeof data.newPassword === 'string' ? data.newPassword : ''
      const confirmPassword = typeof data.confirmPassword === 'string' ? data.confirmPassword : ''
      const fields: Record<string, string> = {}
      if (!currentPassword) fields.currentPassword = 'Vui lòng nhập mật khẩu hiện tại.'
      if (newPassword.length < 8 || newPassword.length > 72)
        fields.newPassword = 'Mật khẩu mới cần từ 8 đến 72 ký tự.'
      else if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))
        fields.newPassword = 'Mật khẩu mới cần ít nhất một chữ cái và một chữ số.'
      else if (newPassword === currentPassword)
        fields.newPassword = 'Mật khẩu mới cần khác mật khẩu hiện tại.'
      if (confirmPassword !== newPassword) fields.confirmPassword = 'Mật khẩu xác nhận chưa khớp.'
      if (Object.keys(fields).length) {
        return fail('Vui lòng kiểm tra lại thông tin mật khẩu.', 400, 'VALIDATION_ERROR', fields)
      }
      const payload = await getPayloadClient()
      if (admin) {
        try {
          await appAuth.loginAdmin(admin.email, currentPassword, request)
        } catch {
          return fail('Mật khẩu hiện tại chưa chính xác.', 401, 'UNAUTHORIZED', {
            currentPassword: 'Mật khẩu hiện tại chưa chính xác.',
          })
        }
        await payload.update({
          collection: 'admins',
          id: admin.id,
          data: { password: newPassword },
          user: { ...admin, collection: 'admins' } as never,
          overrideAccess: false,
        })
        const refreshedAdmin = await appAuth.loginAdmin(admin.email, newPassword, request)
        return json({ updated: true, user: publicAdmin(refreshedAdmin) })
      }
      if (!user) return fail('Vui lòng đăng nhập để đổi mật khẩu.', 401, 'UNAUTHORIZED')
      try {
        await appAuth.login(user.email, currentPassword, request)
      } catch {
        return fail('Mật khẩu hiện tại chưa chính xác.', 401, 'UNAUTHORIZED', {
          currentPassword: 'Mật khẩu hiện tại chưa chính xác.',
        })
      }
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { password: newPassword },
        user,
        overrideAccess: false,
      })
      const refreshed = await appAuth.login(user.email, newPassword, request)
      return json({ updated: true, user: publicUser(refreshed) })
    }
    assertRateLimit(request, `auth-${action}`, 40, 60_000)
    if (!['login', 'register'].includes(action))
      return fail('Không tìm thấy chức năng.', 404, 'NOT_FOUND')
    const data = await body(
      request,
      action === 'register'
        ? ['email', 'password', 'confirmPassword', 'fullName', 'phone']
        : ['email', 'password', 'accountType'],
    )
    const email = text(data.email).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''
    const fields: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      fields.email = 'Vui lòng nhập địa chỉ email hợp lệ.'
    if (password.length < 8 || password.length > 72)
      fields.password = 'Mật khẩu cần từ 8 đến 72 ký tự.'
    if (action === 'register') {
      const fullName = text(data.fullName, 100)
      const phone = text(data.phone, 16)
      if (fullName.length < 2 || fullName.length > 100)
        fields.fullName = 'Họ tên cần từ 2 đến 100 ký tự.'
      if (phone && !/^\+?\d{9,15}$/.test(phone)) fields.phone = 'Số điện thoại cần 9–15 chữ số.'
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
        fields.password = 'Mật khẩu cần ít nhất một chữ cái và một chữ số.'
      if (data.confirmPassword !== password) fields.confirmPassword = 'Mật khẩu xác nhận chưa khớp.'
      if (Object.keys(fields).length)
        return fail(
          'Vui lòng kiểm tra các thông tin được đánh dấu.',
          400,
          'VALIDATION_ERROR',
          fields,
        )
      const payload = await getPayloadClient()
      const adminCollision = await payload.find({
        collection: 'admins',
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
        depth: 0,
      })
      const officialAdminEmail = (
        process.env.NORI_ADMIN_EMAIL?.trim() || 'admin@nori.vn'
      ).toLowerCase()
      if (email === officialAdminEmail || adminCollision.docs.length > 0) {
        return fail(
          'Chưa thể tạo tài khoản. Email có thể đã được sử dụng; hãy đăng nhập hoặc thử email khác.',
          409,
          'ACCOUNT_NOT_CREATED',
        )
      }
      try {
        await payload.create({
          collection: 'users',
          overrideAccess: false,
          data: {
            email,
            password,
            fullName,
            phone: phone || undefined,
            role: 'CUSTOMER',
            status: 'ACTIVE',
          },
        })
      } catch {
        return fail(
          'Chưa thể tạo tài khoản. Email có thể đã được sử dụng; hãy đăng nhập hoặc thử email khác.',
          409,
          'ACCOUNT_NOT_CREATED',
        )
      }
    } else if (Object.keys(fields).length)
      return fail('Vui lòng kiểm tra email và mật khẩu.', 400, 'VALIDATION_ERROR', fields)
    try {
      if (action === 'login') {
        const requestedType = text(data.accountType, 20).toUpperCase()
        const payload = await getPayloadClient()
        const [adminMatches, userMatches] = await Promise.all([
          payload.find({
            collection: 'admins',
            where: { email: { equals: email } },
            limit: 1,
            overrideAccess: true,
            depth: 0,
          }),
          payload.find({
            collection: 'users',
            where: { email: { equals: email } },
            limit: 1,
            overrideAccess: true,
            depth: 0,
          }),
        ])
        const hasAdmin = adminMatches.docs.length > 0
        const hasCustomer = userMatches.docs.length > 0

        if (requestedType === 'CUSTOMER' && hasCustomer) {
          try {
            const user = await appAuth.login(email, password, request)
            return json(publicUser(user), 200)
          } catch (err) {
            if (!hasAdmin) throw err
            const admin = await appAuth.loginAdmin(email, password, request)
            return json(publicAdmin(admin), 200)
          }
        }

        if (hasAdmin) {
          try {
            const admin = await appAuth.loginAdmin(email, password, request)
            return json(publicAdmin(admin), 200)
          } catch (err) {
            if (!hasCustomer) throw err
          }
        }
      }
      const user = await appAuth.login(email, password, request)
      return json(publicUser(user), action === 'register' ? 201 : 200)
    } catch {
      return fail(
        'Email hoặc mật khẩu chưa chính xác, hoặc tài khoản tạm khóa. Vui lòng thử lại.',
        401,
        'UNAUTHORIZED',
      )
    }
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertOrigin(request)
    if ((await context.params).action !== 'me')
      return fail('Không tìm thấy chức năng.', 404, 'NOT_FOUND')
    const auth = await appAuth.requireCustomer({
      unauthMessage: 'Vui lòng đăng nhập để tiếp tục.',
      adminForbiddenMessage:
        'Bạn đang đăng nhập bằng tài khoản quản trị. Vui lòng sử dụng tài khoản khách hàng để cập nhật hồ sơ thuê xe.',
    })
    if (!auth.ok) return auth.response
    const user = auth.user
    const data = await body(request, ['fullName', 'phone'])
    const fullName = text(data.fullName, 100)
    const phone = text(data.phone, 16)
    if (fullName.length < 2 || fullName.length > 100 || (phone && !/^\+?\d{9,15}$/.test(phone)))
      return fail('Vui lòng nhập họ tên và số điện thoại hợp lệ.')
    const payload = await getPayloadClient()
    const updated = await payload.update({
      collection: 'users',
      id: user.id,
      data: { fullName, phone },
      user,
      overrideAccess: false,
    })
    return json(publicUser(updated))
  } catch (error) {
    return apiError(error)
  }
}
