import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

type Context = { params: Promise<{ action: string }> }

function publicUser(user: { id: string; fullName: string; email: string; phone?: string | null }) {
  return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone ?? null }
}

export async function GET(_request: Request, context: Context) {
  if ((await context.params).action !== 'me') return fail('Không tìm thấy trang.', 404, 'NOT_FOUND')
  try {
    const user = await appAuth.currentUser()
    return user ? json(publicUser(user)) : json(null)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request, context: Context) {
  const { action } = await context.params
  try {
    assertOrigin(request)
    if (action === 'logout') {
      await appAuth.logout()
      return json({ loggedOut: true })
    }
    if (!['login', 'register'].includes(action))
      return fail('Không tìm thấy chức năng.', 404, 'NOT_FOUND')
    const data = await body(
      request,
      action === 'register'
        ? ['email', 'password', 'confirmPassword', 'fullName', 'phone']
        : ['email', 'password'],
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
      const user = await appAuth.login(email, password)
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
    const user = await appAuth.currentUser()
    if (!user) return fail('Vui lòng đăng nhập để tiếp tục.', 401, 'UNAUTHORIZED')
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
