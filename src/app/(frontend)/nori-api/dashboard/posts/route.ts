import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'

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
    return json({
      items: res.docs.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug ?? '',
        category: p.category,
        excerpt: p.excerpt ?? '',
        content: p.content,
        coverId: typeof p.cover === 'object' && p.cover ? p.cover.id : (p.cover ?? null),
        cover: photo(p.cover),
        publishedAt: p.publishedAt ?? '',
        seoTitle: p.seoTitle ?? '',
        seoDescription: p.seoDescription ?? '',
        _status: p._status ?? 'draft',
        updatedAt: p.updatedAt,
      })),
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

    const data = await body(request, [
      'title',
      'category',
      'excerpt',
      'content',
      'coverId',
      'seoTitle',
      'seoDescription',
      '_status',
    ])
    const title = text(data.title, 200)
    const content = text(data.content, 15000)
    if (!title || !content) return fail('Vui lòng nhập tiêu đề và nội dung bài viết.')

    const isDraft = data._status !== 'published'
    const slug = `${title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString(36)}`
    const baseData = {
      title,
      slug,
      category: (['NEWS', 'GUIDE', 'PROMOTION'].includes(String(data.category))
        ? data.category
        : 'NEWS') as 'NEWS' | 'GUIDE' | 'PROMOTION',
      excerpt: text(data.excerpt, 500) || undefined,
      content,
      cover: text(data.coverId, 100) || undefined,
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
          data: { ...baseData, _status: 'draft' },
        })
      : await payload.create({
          collection: 'posts',
          user,
          overrideAccess: false,
          draft: false,
          data: { ...baseData, _status: 'published' },
        })
    return json({ id: created.id, _status: created._status }, 201)
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

    const data = await body(request, [
      'id',
      'title',
      'category',
      'excerpt',
      'content',
      'coverId',
      'seoTitle',
      'seoDescription',
      '_status',
    ])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã bài viết.')

    const isDraft = data._status !== 'published'
    const basePatch = {
      ...(data.title !== undefined ? { title: text(data.title, 200) } : {}),
      ...(data.category !== undefined
        ? { category: String(data.category) as 'NEWS' | 'GUIDE' | 'PROMOTION' }
        : {}),
      ...(data.excerpt !== undefined ? { excerpt: text(data.excerpt, 500) || null } : {}),
      ...(data.content !== undefined ? { content: text(data.content, 15000) } : {}),
      ...(data.coverId !== undefined ? { cover: text(data.coverId, 100) || null } : {}),
      ...(data.seoTitle !== undefined ? { seoTitle: text(data.seoTitle, 160) || null } : {}),
      ...(data.seoDescription !== undefined
        ? { seoDescription: text(data.seoDescription, 320) || null }
        : {}),
      ...(!isDraft ? { publishedAt: new Date().toISOString().slice(0, 10) } : {}),
    }
    const updated = isDraft
      ? await payload.update({
          collection: 'posts',
          id,
          user,
          overrideAccess: false,
          draft: true,
          data: { ...basePatch, _status: 'draft' },
        })
      : await payload.update({
          collection: 'posts',
          id,
          user,
          overrideAccess: false,
          draft: false,
          data: { ...basePatch, _status: 'published' },
        })
    return json({ id: updated.id, _status: updated._status })
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
