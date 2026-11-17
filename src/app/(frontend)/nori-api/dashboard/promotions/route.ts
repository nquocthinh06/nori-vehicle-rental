import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['promotions', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase()
    const res = await payload.find({
      collection: 'promotions',
      user,
      overrideAccess: false,
      depth: 0,
      limit: 200,
      sort: '-createdAt',
    })
    const items = res.docs
      .filter((p) => !q || `${p.code} ${p.name}`.toLowerCase().includes(q))
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description ?? '',
        discountType: p.discountType,
        discountValue: p.discountValue,
        maxDiscount: p.maxDiscount ?? null,
        minDays: p.minDays ?? 1,
        appliesTo: p.appliesTo ?? 'RENT',
        validFrom: p.validFrom ?? '',
        validTo: p.validTo ?? '',
        usageLimit: p.usageLimit ?? null,
        usedCount: p.usedCount ?? 0,
        active: Boolean(p.active),
      }))
    return json({ items })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['promotions', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'code',
      'name',
      'description',
      'discountType',
      'discountValue',
      'maxDiscount',
      'minDays',
      'appliesTo',
      'validFrom',
      'validTo',
      'usageLimit',
      'active',
    ])
    const code = text(data.code, 40).toUpperCase()
    const name = text(data.name, 160)
    const discountValue = Number(data.discountValue)
    if (!code || !name || !Number.isSafeInteger(discountValue) || discountValue < 1) {
      return fail('Vui lòng nhập mã, tên chương trình và giá trị giảm hợp lệ.')
    }
    const created = await payload.create({
      collection: 'promotions',
      user,
      overrideAccess: false,
      data: {
        code,
        name,
        description: text(data.description, 500) || undefined,
        discountType: data.discountType === 'FIXED' ? 'FIXED' : 'PERCENT',
        discountValue,
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : undefined,
        minDays: data.minDays ? Number(data.minDays) : 1,
        appliesTo: (['ALL', 'RENT', 'SALE'].includes(String(data.appliesTo))
          ? data.appliesTo
          : 'RENT') as 'ALL' | 'RENT' | 'SALE',
        validFrom: text(data.validFrom, 10) || undefined,
        validTo: text(data.validTo, 10) || undefined,
        usageLimit: data.usageLimit ? Number(data.usageLimit) : undefined,
        active: data.active !== false,
      },
    })
    return json({ id: created.id, code: created.code }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['promotions', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'id',
      'name',
      'description',
      'discountType',
      'discountValue',
      'maxDiscount',
      'minDays',
      'appliesTo',
      'validFrom',
      'validTo',
      'usageLimit',
      'active',
    ])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã khuyến mãi.')
    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = text(data.name, 160)
    if (data.description !== undefined) patch.description = text(data.description, 500) || null
    if (data.discountType !== undefined)
      patch.discountType = data.discountType === 'FIXED' ? 'FIXED' : 'PERCENT'
    if (data.discountValue !== undefined) patch.discountValue = Number(data.discountValue)
    if (data.maxDiscount !== undefined)
      patch.maxDiscount = data.maxDiscount ? Number(data.maxDiscount) : null
    if (data.minDays !== undefined) patch.minDays = data.minDays ? Number(data.minDays) : 1
    if (data.appliesTo !== undefined) patch.appliesTo = String(data.appliesTo)
    if (data.validFrom !== undefined) patch.validFrom = text(data.validFrom, 10) || null
    if (data.validTo !== undefined) patch.validTo = text(data.validTo, 10) || null
    if (data.usageLimit !== undefined)
      patch.usageLimit = data.usageLimit ? Number(data.usageLimit) : null
    if (data.active !== undefined) patch.active = Boolean(data.active)

    const updated = await payload.update({
      collection: 'promotions',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })
    return json({ id: updated.id, active: updated.active })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['promotions', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return fail('Thiếu mã khuyến mãi cần xóa.')
    await payload.delete({ collection: 'promotions', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
