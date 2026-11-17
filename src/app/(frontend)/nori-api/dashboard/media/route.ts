import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'

const MAX_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const q = (sp.get('q') || '').trim().toLowerCase()
    const res = await payload.find({
      collection: 'media',
      user,
      overrideAccess: false,
      limit: 120,
      sort: '-createdAt',
    })
    const items = res.docs
      .filter((m) => !q || `${m.alt ?? ''} ${m.filename ?? ''}`.toLowerCase().includes(q))
      .map((m) => ({
        id: m.id,
        alt: m.alt,
        filename: m.filename ?? null,
        mediaCategory: m.mediaCategory ?? null,
        photo: photo(m),
        createdAt: m.createdAt,
      }))
    return json({ items })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const form = await request.formData()
    const file = form.get('file')
    const alt = text(form.get('alt'), 200) || 'Ảnh phương tiện NORI'
    const mediaCategory = text(form.get('mediaCategory'), 40) || 'ACTUAL_VEHICLE'
    const sourceName = text(form.get('sourceName'), 120) || 'NORI Administration'

    if (!(file instanceof File)) return fail('Vui lòng chọn tệp ảnh hợp lệ.')
    if (!ALLOWED_MIME.has(file.type)) {
      return fail('Chỉ hỗ trợ định dạng ảnh JPG, PNG, WebP hoặc AVIF.')
    }
    if (file.size > MAX_SIZE_BYTES) {
      return fail('Dung lượng ảnh tối đa 8 MB.')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const created = await payload.create({
      collection: 'media',
      user,
      overrideAccess: false,
      data: {
        alt,
        mediaCategory: ([
          'CATALOGUE_OFFICIAL',
          'CATALOGUE_REFERENCE',
          'ACTUAL_VEHICLE',
          'ILLUSTRATION',
        ].includes(mediaCategory)
          ? mediaCategory
          : 'ACTUAL_VEHICLE') as
          | 'CATALOGUE_OFFICIAL'
          | 'CATALOGUE_REFERENCE'
          | 'ACTUAL_VEHICLE'
          | 'ILLUSTRATION',
        sourceName,
        verified: true,
      },
      file: {
        data: buffer,
        mimetype: file.type,
        name: file.name || `nori-${Date.now()}.jpg`,
        size: file.size,
      },
    })

    return json(
      {
        id: created.id,
        alt: created.alt,
        url: created.url ?? null,
        photo: photo(created),
      },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}
