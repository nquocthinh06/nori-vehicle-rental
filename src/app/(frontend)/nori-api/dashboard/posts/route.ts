import type { Payload } from 'payload'
import type { Admin, Promotion } from '@/payload-types'
import { adminHasPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'
import { businessToday, getPromotionRuntimeStatus } from '@/lib/rental-rules'

type AuthedAdmin = Admin & { collection: 'admins' }

const ALLOWED_CATEGORIES = ['NEWS', 'GUIDE', 'PROMOTION'] as const
type PostCategory = (typeof ALLOWED_CATEGORIES)[number]

function normalizeCategory(raw: unknown): PostCategory {
  return ALLOWED_CATEGORIES.includes(String(raw) as PostCategory)
    ? (String(raw) as PostCategory)
    : 'NEWS'
}

function summarizePromotion(raw: unknown, today: string) {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Promotion
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
    id: String(p.id),
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
    active: Boolean(p.active),
    runtimeStatus: runtime.status,
    runtimeStatusLabel: runtime.label,
    runtimeStatusTone: runtime.tone,
  }
}

async function verifyMediaExists(payload: Payload, mediaId: string, user: AuthedAdmin) {
  try {
    const found = await payload.findByID({
      collection: 'media',
      id: mediaId,
      user,
      overrideAccess: false,
      depth: 0,
    })
    return Boolean(found?.id)
  } catch {
    return false
  }
}

async function verifyPromotionExists(payload: Payload, promoId: string, user: AuthedAdmin) {
  try {
    const found = await payload.findByID({
      collection: 'promotions',
      id: promoId,
      user,
      overrideAccess: false,
      depth: 0,
    })
    return Boolean(found?.id)
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const auth = await requireAdmin({ permission: ['posts', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const res = await payload.find({
      collection: 'posts',
      user,
      overrideAccess: false,
      draft: true,
      depth: 1,
      limit: 100,
      sort: '-updatedAt',
    })
    const today = businessToday()
    return json({
      items: res.docs.map((p) => {
        const rawPromo = (p as unknown as { promotion?: string | Promotion | null }).promotion
        const promotionId =
          typeof rawPromo === 'object' && rawPromo ? String(rawPromo.id) : (rawPromo ?? null)
        return {
          id: p.id,
          title: p.title,
          slug: p.slug ?? '',
          category: p.category,
          excerpt: p.excerpt ?? '',
          content: p.content ?? '',
          coverId: typeof p.cover === 'object' && p.cover ? p.cover.id : (p.cover ?? null),
          cover: photo(p.cover),
          promotionId,
          promotion: summarizePromotion(rawPromo, today),
          publishedAt: p.publishedAt ?? '',
          seoTitle: p.seoTitle ?? '',
          seoDescription: p.seoDescription ?? '',
          _status: p._status ?? 'draft',
          updatedAt: p.updatedAt,
        }
      }),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['posts', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(
      request,
      [
        'title',
        'category',
        'excerpt',
        'content',
        'coverId',
        'promotionId',
        'seoTitle',
        'seoDescription',
        '_status',
      ],
      64_000,
    )
    const title = text(data.title, 200)
    const content = text(data.content, 15_000)
    const isDraft = data._status !== 'published'
    if (!isDraft && !adminHasPermission(auth.admin, 'posts', 'publish')) {
      return fail('Tài khoản chưa được cấp quyền "publish" cho phân hệ "posts".', 403, 'FORBIDDEN')
    }

    if (!title) {
      return fail('Vui lòng nhập tiêu đề bài viết.', 400, 'VALIDATION_ERROR', {
        title: 'Vui lòng nhập tiêu đề bài viết.',
      })
    }
    if (!isDraft && !content) {
      return fail('Vui lòng nhập nội dung chi tiết trước khi xuất bản.', 400, 'VALIDATION_ERROR', {
        content: 'Vui lòng nhập nội dung chi tiết.',
      })
    }

    const category = normalizeCategory(data.category)
    const coverId = text(data.coverId, 100) || null
    if (coverId && !(await verifyMediaExists(payload, coverId, user))) {
      return fail('Ảnh banner được chọn không tồn tại trong thư viện Media.', 400, 'INVALID_MEDIA')
    }

    const rawPromotionId = category === 'PROMOTION' ? text(data.promotionId, 100) || null : null
    if (rawPromotionId && !(await verifyPromotionExists(payload, rawPromotionId, user))) {
      return fail('Chương trình khuyến mãi liên kết không tồn tại.', 400, 'INVALID_PROMOTION')
    }

    const slugBase = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const slug = `${slugBase || 'bai-viet'}-${Date.now().toString(36)}`

    const baseData = {
      title,
      slug,
      category,
      excerpt: text(data.excerpt, 500) || undefined,
      content,
      cover: coverId ?? undefined,
      ...(rawPromotionId ? { promotion: rawPromotionId } : {}),
      seoTitle: text(data.seoTitle, 160) || undefined,
      seoDescription: text(data.seoDescription, 320) || undefined,
      publishedAt: !isDraft ? new Date().toISOString().slice(0, 10) : undefined,
    }
    const created = isDraft
      ? await payload.create({
          collection: 'posts',
          user,
          overrideAccess: false,
          draft: true,
          depth: 1,
          data: { ...baseData, _status: 'draft' } as never,
        })
      : await payload.create({
          collection: 'posts',
          user,
          overrideAccess: false,
          draft: false,
          depth: 1,
          data: { ...baseData, _status: 'published' } as never,
        })

    return json(
      {
        id: created.id,
        slug: created.slug,
        _status: created._status,
        coverId:
          typeof created.cover === 'object' && created.cover
            ? created.cover.id
            : (created.cover ?? null),
        cover: photo(created.cover),
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
    const auth = await requireAdmin({ permission: ['posts', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(
      request,
      [
        'id',
        'title',
        'category',
        'excerpt',
        'content',
        'coverId',
        'promotionId',
        'seoTitle',
        'seoDescription',
        '_status',
      ],
      64_000,
    )
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã bài viết.')

    const existing = await payload.findByID({
      collection: 'posts',
      id,
      user,
      overrideAccess: false,
      draft: true,
      depth: 0,
    })

    const isDraft = data._status !== 'published'
    if (
      (!isDraft || existing._status === 'published') &&
      !adminHasPermission(auth.admin, 'posts', 'publish')
    ) {
      return fail('Tài khoản chưa được cấp quyền "publish" cho phân hệ "posts".', 403, 'FORBIDDEN')
    }
    const nextTitle = data.title !== undefined ? text(data.title, 200) : existing.title
    const nextContent =
      data.content !== undefined ? text(data.content, 15_000) : (existing.content ?? '')
    const nextCategory =
      data.category !== undefined ? normalizeCategory(data.category) : existing.category

    if (!nextTitle) {
      return fail('Vui lòng nhập tiêu đề bài viết.', 400, 'VALIDATION_ERROR', {
        title: 'Vui lòng nhập tiêu đề bài viết.',
      })
    }
    if (!isDraft && !nextContent) {
      return fail('Vui lòng nhập nội dung chi tiết trước khi xuất bản.', 400, 'VALIDATION_ERROR', {
        content: 'Vui lòng nhập nội dung chi tiết.',
      })
    }

    let nextCoverPatch: { cover?: string | null } = {}
    if (data.coverId !== undefined) {
      const nextCoverId = data.coverId === null ? null : text(data.coverId, 100) || null
      if (nextCoverId && !(await verifyMediaExists(payload, nextCoverId, user))) {
        return fail(
          'Ảnh banner được chọn không tồn tại trong thư viện Media.',
          400,
          'INVALID_MEDIA',
        )
      }
      nextCoverPatch = { cover: nextCoverId }
    }

    let nextPromotionPatch: { promotion?: string | null } = {}
    if (nextCategory !== 'PROMOTION') {
      nextPromotionPatch = { promotion: null }
    } else if (data.promotionId !== undefined) {
      const nextPromoId = data.promotionId === null ? null : text(data.promotionId, 100) || null
      if (nextPromoId && !(await verifyPromotionExists(payload, nextPromoId, user))) {
        return fail('Chương trình khuyến mãi liên kết không tồn tại.', 400, 'INVALID_PROMOTION')
      }
      nextPromotionPatch = { promotion: nextPromoId }
    }

    const basePatch = {
      ...(data.title !== undefined ? { title: nextTitle } : {}),
      ...(data.category !== undefined ? { category: nextCategory } : {}),
      ...(data.excerpt !== undefined ? { excerpt: text(data.excerpt, 500) || null } : {}),
      ...(data.content !== undefined ? { content: nextContent } : {}),
      ...nextCoverPatch,
      ...nextPromotionPatch,
      ...(data.seoTitle !== undefined ? { seoTitle: text(data.seoTitle, 160) || null } : {}),
      ...(data.seoDescription !== undefined
        ? { seoDescription: text(data.seoDescription, 320) || null }
        : {}),
      ...(!isDraft
        ? { publishedAt: existing.publishedAt || new Date().toISOString().slice(0, 10) }
        : {}),
    }

    const updated = isDraft
      ? await payload.update({
          collection: 'posts',
          id,
          user,
          overrideAccess: false,
          // Unpublish live posts cleanly when saved back to draft so public /posts & /posts/[slug] stay synced
          draft: existing._status === 'published' ? false : true,
          depth: 1,
          data: { ...basePatch, _status: 'draft' } as never,
        })
      : await payload.update({
          collection: 'posts',
          id,
          user,
          overrideAccess: false,
          draft: false,
          depth: 1,
          data: { ...basePatch, _status: 'published' } as never,
        })

    return json({
      id: updated.id,
      slug: updated.slug,
      _status: updated._status,
      coverId:
        typeof updated.cover === 'object' && updated.cover
          ? updated.cover.id
          : (updated.cover ?? null),
      cover: photo(updated.cover),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['posts', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return fail('Thiếu mã bài viết.')
    await payload.delete({ collection: 'posts', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
