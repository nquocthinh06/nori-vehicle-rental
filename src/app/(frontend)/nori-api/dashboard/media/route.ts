import sharp from 'sharp'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'

const MAX_SIZE_BYTES = 8 * 1024 * 1024
const MAX_BATCH_FILES = 20
const MAX_DIMENSION_PX = 12_000
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

type VerifiedImageFormat = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'
  ext: 'jpg' | 'png' | 'webp' | 'avif'
}

function detectMagicBytes(buf: Buffer): VerifiedImageFormat | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  // AVIF: ....ftypavif or ....ftypavis
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') {
      return { mime: 'image/avif', ext: 'avif' }
    }
  }
  return null
}

function containsSuspiciousPayload(buf: Buffer): boolean {
  const sample = Buffer.concat([
    buf.subarray(0, Math.min(2048, buf.length)),
    buf.subarray(Math.max(0, buf.length - 2048)),
  ]).toString('latin1')
  return /<\?php|<script\b|<!doctype\s+html|<svg\b/i.test(sample)
}

function sanitizeImageFilename(rawName: string, verifiedExt: string, index = 0): string {
  const baseOnly = rawName
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
  const safeStem = baseOnly || 'nori-media'
  const uniqueSuffix = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`
  return `${safeStem}-${uniqueSuffix}.${verifiedExt}`
}

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
      limit: 150,
      sort: '-createdAt',
    })
    const items = res.docs
      .filter((m) => !q || `${m.alt ?? ''} ${m.filename ?? ''}`.toLowerCase().includes(q))
      .map((m) => ({
        id: m.id,
        alt: m.alt,
        filename: m.filename ?? null,
        mediaCategory: m.mediaCategory ?? null,
        sourceName: m.sourceName ?? null,
        sourceUrl: m.sourceUrl ?? null,
        license: m.license ?? null,
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
    const multiFiles = form.getAll('files').filter((f): f is File => f instanceof File)
    const singleFile = form.get('file')
    const isBatchMode = multiFiles.length > 0
    const files: File[] = isBatchMode ? multiFiles : singleFile instanceof File ? [singleFile] : []

    if (files.length === 0) {
      return fail('Vui lòng chọn ít nhất một tệp hình ảnh hợp lệ.')
    }
    if (files.length > MAX_BATCH_FILES) {
      return fail(`Chỉ cho phép tải lên tối đa ${MAX_BATCH_FILES} ảnh mỗi lượt.`)
    }

    const defaultAlt = text(form.get('alt'), 200) || 'Ảnh phương tiện NORI'
    const rawMediaCategory = text(form.get('mediaCategory'), 40) || 'ACTUAL_VEHICLE'
    const mediaCategory = (
      ['CATALOGUE_OFFICIAL', 'CATALOGUE_REFERENCE', 'ACTUAL_VEHICLE', 'ILLUSTRATION'].includes(
        rawMediaCategory,
      )
        ? rawMediaCategory
        : 'ACTUAL_VEHICLE'
    ) as 'CATALOGUE_OFFICIAL' | 'CATALOGUE_REFERENCE' | 'ACTUAL_VEHICLE' | 'ILLUSTRATION'
    const sourceName = text(form.get('sourceName'), 120) || 'NORI Administration'
    const sourceUrl = text(form.get('sourceUrl'), 300) || undefined
    const license = text(form.get('license'), 120) || undefined
    const variantName = text(form.get('variantName'), 100) || undefined
    const colorName = text(form.get('colorName'), 80) || undefined

    const uploaded: {
      id: string
      alt: string
      url: string | null
      filename: string | null
      photo: ReturnType<typeof photo>
    }[] = []
    const failed: { name: string; reason: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const rawName = file.name || `image-${i + 1}`

      if (file.size <= 0) {
        failed.push({ name: rawName, reason: 'Tệp ảnh rỗng (0 byte).' })
        continue
      }
      if (file.size > MAX_SIZE_BYTES) {
        failed.push({ name: rawName, reason: 'Dung lượng ảnh vượt quá giới hạn 8 MB.' })
        continue
      }
      if (file.type && !ALLOWED_MIME.has(file.type)) {
        failed.push({
          name: rawName,
          reason: 'Chỉ hỗ trợ định dạng hình ảnh JPG, PNG, WebP hoặc AVIF.',
        })
        continue
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const detected = detectMagicBytes(buffer)
      if (!detected) {
        failed.push({
          name: rawName,
          reason: 'Chữ ký tệp (magic bytes) không phải hình ảnh hợp lệ hoặc bị giả mạo định dạng.',
        })
        continue
      }
      if (containsSuspiciousPayload(buffer)) {
        failed.push({
          name: rawName,
          reason: 'Phát hiện mã kịch bản hoặc dữ liệu không an toàn bên trong tệp tải lên.',
        })
        continue
      }

      let width = 0
      let height = 0
      try {
        const meta = await sharp(buffer).metadata()
        width = meta.width ?? 0
        height = meta.height ?? 0
      } catch {
        failed.push({ name: rawName, reason: 'Không thể giải mã cấu trúc điểm ảnh hợp lệ.' })
        continue
      }

      if (width < 10 || height < 10 || width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
        failed.push({
          name: rawName,
          reason: `Kích thước ảnh không hợp lệ (${width}×${height}px). Yêu cầu từ 10px đến ${MAX_DIMENSION_PX}px.`,
        })
        continue
      }

      const safeName = sanitizeImageFilename(rawName, detected.ext, i)
      const itemAlt = files.length > 1 ? `${defaultAlt} (${i + 1})` : defaultAlt

      try {
        const created = await payload.create({
          collection: 'media',
          user,
          overrideAccess: false,
          data: {
            alt: itemAlt,
            mediaCategory,
            sourceName,
            ...(sourceUrl ? { sourceUrl } : {}),
            ...(license ? { license } : {}),
            ...(variantName ? { variantName } : {}),
            ...(colorName ? { colorName } : {}),
            verified: true,
          },
          file: {
            data: buffer,
            mimetype: detected.mime,
            name: safeName,
            size: buffer.length,
          },
        })
        uploaded.push({
          id: created.id,
          alt: created.alt,
          url: created.url ?? null,
          filename: created.filename ?? safeName,
          photo: photo(created),
        })
      } catch (err) {
        failed.push({
          name: rawName,
          reason: (err as Error).message || 'Không thể lưu tệp ảnh.',
        })
      }
    }

    if (!isBatchMode) {
      if (uploaded.length === 0) {
        return fail(failed[0]?.reason || 'Tệp tải lên không hợp lệ.', 400, 'INVALID_MEDIA')
      }
      return json(uploaded[0], 201)
    }

    if (uploaded.length === 0) {
      return fail(
        failed.map((f) => `${f.name}: ${f.reason}`).join('; ') || 'Tải ảnh thất bại.',
        400,
        'INVALID_MEDIA_BATCH',
      )
    }

    return json(
      {
        uploaded,
        failed,
        partialFailure: failed.length > 0,
      },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return fail('Thiếu mã tệp ảnh cần xóa.')

    await payload.delete({
      collection: 'media',
      id,
      user,
      overrideAccess: false,
    })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
