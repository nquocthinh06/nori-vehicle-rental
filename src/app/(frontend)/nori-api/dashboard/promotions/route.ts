import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { findPromotionByCode } from '@/lib/promo-service'
import {
  businessToday,
  getPromotionRuntimeStatus,
  validatePromotionInput,
} from '@/lib/rental-rules'

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
    const today = businessToday()
    const items = res.docs
      .filter((p) => !q || `${p.code} ${p.name}`.toLowerCase().includes(q))
      .map((p) => {
        const runtime = getPromotionRuntimeStatus(
          {
            active: Boolean(p.active),
            validFrom: p.validFrom ?? null,
            validTo: p.validTo ?? null,
            usageLimit: p.usageLimit ?? null,
            usedCount: p.usedCount ?? 0,
          },
          today,
        )
        return {
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
          remainingUses: runtime.remainingUses,
          active: Boolean(p.active),
          runtimeStatus: runtime.status,
          runtimeStatusLabel: runtime.label,
          runtimeStatusTone: runtime.tone,
        }
      })
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

    const validation = validatePromotionInput(
      {
        code: text(data.code, 40),
        name: text(data.name, 160),
        description: text(data.description, 500),
        discountType: typeof data.discountType === 'string' ? data.discountType : 'PERCENT',
        discountValue: data.discountValue,
        maxDiscount: data.maxDiscount,
        minDays: data.minDays ?? 1,
        appliesTo: typeof data.appliesTo === 'string' ? data.appliesTo : 'RENT',
        validFrom: text(data.validFrom, 10),
        validTo: text(data.validTo, 10),
        usageLimit: data.usageLimit,
        active: data.active !== false,
      },
      0,
    )
    if (validation.error || !validation.normalized) {
      return fail(validation.error ?? 'Thông tin khuyến mãi không hợp lệ.')
    }
    const n = validation.normalized
    const existing = await findPromotionByCode(payload, n.code)
    if (existing) {
      return fail('Mã khuyến mãi này đã tồn tại. Vui lòng nhập mã khác.', 409, 'DUPLICATE_PROMO')
    }

    const created = await payload.create({
      collection: 'promotions',
      user,
      overrideAccess: false,
      data: {
        code: n.code,
        name: n.name,
        description: n.description ?? undefined,
        discountType: n.discountType,
        discountValue: n.discountValue,
        maxDiscount: n.maxDiscount ?? undefined,
        minDays: n.minDays,
        appliesTo: n.appliesTo,
        validFrom: n.validFrom ?? undefined,
        validTo: n.validTo ?? undefined,
        usageLimit: n.usageLimit ?? undefined,
        active: n.active,
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

    const current = await payload.findByID({
      collection: 'promotions',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })

    const validation = validatePromotionInput(
      {
        code: current.code,
        name: data.name !== undefined ? text(data.name, 160) : current.name,
        description:
          data.description !== undefined
            ? text(data.description, 500)
            : (current.description ?? ''),
        discountType:
          data.discountType !== undefined ? String(data.discountType) : current.discountType,
        discountValue:
          data.discountValue !== undefined ? data.discountValue : current.discountValue,
        maxDiscount:
          data.maxDiscount !== undefined ? data.maxDiscount : (current.maxDiscount ?? null),
        minDays: data.minDays !== undefined ? data.minDays : (current.minDays ?? 1),
        appliesTo:
          data.appliesTo !== undefined ? String(data.appliesTo) : (current.appliesTo ?? 'RENT'),
        validFrom:
          data.validFrom !== undefined ? text(data.validFrom, 10) : (current.validFrom ?? ''),
        validTo: data.validTo !== undefined ? text(data.validTo, 10) : (current.validTo ?? ''),
        usageLimit: data.usageLimit !== undefined ? data.usageLimit : (current.usageLimit ?? null),
        active: data.active !== undefined ? Boolean(data.active) : Boolean(current.active),
      },
      Number(current.usedCount ?? 0),
    )

    if (validation.error || !validation.normalized) {
      return fail(validation.error ?? 'Thông tin cập nhật khuyến mãi không hợp lệ.')
    }
    const n = validation.normalized

    const updated = await payload.update({
      collection: 'promotions',
      id,
      user,
      overrideAccess: false,
      data: {
        name: n.name,
        description: n.description,
        discountType: n.discountType,
        discountValue: n.discountValue,
        maxDiscount: n.maxDiscount,
        minDays: n.minDays,
        appliesTo: n.appliesTo,
        validFrom: n.validFrom,
        validTo: n.validTo,
        usageLimit: n.usageLimit,
        active: n.active,
      },
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
