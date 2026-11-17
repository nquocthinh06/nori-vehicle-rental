import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const [adminsRes, logsRes] = await Promise.all([
      payload.find({
        collection: 'admins',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 50,
        sort: 'createdAt',
        select: {
          email: true,
          fullName: true,
          adminRole: true,
          permissions: true,
          createdAt: true,
        },
      }),
      payload.find({
        collection: 'audit-logs',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 80,
        sort: '-createdAt',
      }),
    ])

    return json({
      currentAdmin: admin,
      admins: adminsRes.docs.map((a) => ({
        id: a.id,
        email: a.email,
        fullName: a.fullName ?? null,
        adminRole: a.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR',
        permissions: a.permissions ?? null,
        createdAt: a.createdAt,
      })),
      auditLogs: logsRes.docs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId ?? null,
        entityLabel: l.entityLabel ?? null,
        summary: l.summary,
        fromStatus: l.fromStatus ?? null,
        toStatus: l.toStatus ?? null,
        actorType: l.actorType ?? 'SYSTEM',
        actorEmail: l.actorEmail ?? null,
        createdAt: l.createdAt,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ superAdmin: true })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['email', 'password', 'fullName', 'adminRole', 'permissions'])
    const email = text(data.email, 254).toLowerCase()
    const password = typeof data.password === 'string' ? data.password : ''
    const fullName = text(data.fullName, 100) || 'Nhân viên vận hành NORI'
    const adminRole = data.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Địa chỉ email chưa hợp lệ.')
    }
    if (
      password.length < 8 ||
      password.length > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return fail('Mật khẩu cần từ 8–72 ký tự, gồm ít nhất một chữ cái và một chữ số.')
    }

    const created = await payload.create({
      collection: 'admins',
      user,
      overrideAccess: false,
      data: {
        email,
        password,
        fullName,
        adminRole,
        ...(data.permissions && typeof data.permissions === 'object'
          ? { permissions: data.permissions as Record<string, unknown> }
          : {}),
      },
    })

    return json(
      {
        id: created.id,
        email: created.email,
        fullName: created.fullName ?? null,
        adminRole: created.adminRole ?? 'OPERATOR',
      },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ superAdmin: true })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['id', 'fullName', 'adminRole', 'permissions'])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã tài khoản quản trị.')

    const patch: Record<string, unknown> = {}
    if (data.fullName !== undefined) patch.fullName = text(data.fullName, 100)
    if (data.adminRole !== undefined) {
      if (!['SUPER_ADMIN', 'OPERATOR'].includes(String(data.adminRole))) {
        return fail('Vai trò quản trị không hợp lệ.')
      }
      patch.adminRole = data.adminRole
    }
    if (data.permissions !== undefined && typeof data.permissions === 'object') {
      patch.permissions = data.permissions
    }

    const updated = await payload.update({
      collection: 'admins',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })

    return json({ id: updated.id, adminRole: updated.adminRole, fullName: updated.fullName })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ superAdmin: true })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return fail('Thiếu mã tài khoản quản trị cần xóa.')

    await payload.delete({
      collection: 'admins',
      id,
      user,
      overrideAccess: false,
    })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
