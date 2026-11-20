import { APIError, type CollectionConfig } from 'payload'

import { createFolderField, createTagField } from 'payload'
import { adminMediaDeleteAccess, adminMediaWriteAccess } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateMedia, revalidateDeletedMedia } from '@/hooks/revalidate-nori'
import { localMediaResizeHandler } from '@/lib/media-optimizer'

const mediaAudit = auditCollection({
  entity: 'media',
  entityName: 'hình ảnh media',
  label: (doc) => String(doc.filename ?? doc.alt ?? doc.id),
  fields: {
    alt: 'Alt text',
    filename: 'Tên tệp',
    mediaCategory: 'Phân loại nguồn ảnh',
    sourceUrl: 'URL nguồn',
    verified: 'Xác minh nguồn ảnh',
  },
})

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req }) => adminMediaWriteAccess(req),
    update: ({ req }) => adminMediaWriteAccess(req),
    delete: ({ req }) => adminMediaDeleteAccess(req),
  },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const mediaId = String(id)
        const [models, vehicles, posts, site] = await Promise.all([
          req.payload.find({
            collection: 'vehicle-models',
            overrideAccess: true,
            req,
            depth: 0,
            limit: 200,
          }),
          req.payload.find({
            collection: 'vehicles',
            overrideAccess: true,
            req,
            depth: 0,
            limit: 500,
          }),
          req.payload.find({
            collection: 'posts',
            overrideAccess: true,
            draft: true,
            req,
            depth: 0,
            limit: 200,
            where: { cover: { equals: mediaId } },
          }),
          req.payload.findGlobal({
            slug: 'nori-site',
            overrideAccess: true,
            req,
            depth: 0,
          }),
        ])

        const refs: string[] = []
        for (const m of models.docs) {
          const coverId = typeof m.cover === 'object' && m.cover ? m.cover.id : m.cover
          const inGallery = (m.gallery ?? []).some(
            (g) => (typeof g.image === 'object' && g.image ? g.image.id : g.image) === mediaId,
          )
          const inVariant = (m.variants ?? []).some((v) =>
            (v.colors ?? []).some(
              (c) => (typeof c.image === 'object' && c.image ? c.image.id : c.image) === mediaId,
            ),
          )
          if (coverId === mediaId || inGallery || inVariant) {
            refs.push(`Dòng xe: ${m.name}`)
          }
        }
        for (const v of vehicles.docs) {
          const inPhotos = (v.photos ?? []).some(
            (p) => (typeof p.image === 'object' && p.image ? p.image.id : p.image) === mediaId,
          )
          if (inPhotos) refs.push(`Xe thực tế: ${v.reference}`)
        }
        for (const p of posts.docs) {
          refs.push(`Bài viết: ${p.title}`)
        }

        const siteRecord = site as unknown as Record<string, unknown>
        const siteSingleIds = [site.logo, site.favicon, site.ogImage, site.storyImage].map((x) =>
          typeof x === 'object' && x ? (x as { id?: string }).id : x,
        )
        const inHeroImages = (site.heroImages ?? []).some(
          (h) => (typeof h.image === 'object' && h.image ? h.image.id : h.image) === mediaId,
        )
        const heroSlidesRaw = Array.isArray(siteRecord.heroSlides)
          ? (siteRecord.heroSlides as Record<string, unknown>[])
          : []
        const inHeroSlides = heroSlidesRaw.some((s) => {
          const dId =
            typeof s.desktopImage === 'object' && s.desktopImage
              ? (s.desktopImage as { id?: string }).id
              : s.desktopImage
          const mId =
            typeof s.mobileImage === 'object' && s.mobileImage
              ? (s.mobileImage as { id?: string }).id
              : s.mobileImage
          return dId === mediaId || mId === mediaId
        })
        if (siteSingleIds.includes(mediaId) || inHeroImages || inHeroSlides) {
          refs.push('Nội dung & Banner trang chủ NORI')
        }

        if (refs.length > 0) {
          throw new APIError(
            `Không thể xóa tệp ảnh vì đang được sử dụng tại: ${refs.slice(0, 3).join(', ')}. Hãy gỡ liên kết trước khi xóa.`,
            409,
          )
        }
      },
    ],
    afterChange: [revalidateMedia, mediaAudit.afterChange],
    afterDelete: [revalidateDeletedMedia, mediaAudit.afterDelete],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    { name: 'sourceUrl', label: 'URL nguồn gốc', type: 'text' },
    { name: 'sourceName', label: 'Tác giả / Nguồn ảnh', type: 'text' },
    { name: 'license', label: 'Giấy phép / Quyền sử dụng', type: 'text' },
    { name: 'modelYear', label: 'Đời xe áp dụng', type: 'text' },
    { name: 'variantName', label: 'Phiên bản áp dụng', type: 'text' },
    { name: 'colorName', label: 'Màu sắc áp dụng', type: 'text' },
    {
      name: 'mediaCategory',
      label: 'Phân loại nguồn ảnh',
      type: 'select',
      options: ['CATALOGUE_OFFICIAL', 'CATALOGUE_REFERENCE', 'ACTUAL_VEHICLE', 'ILLUSTRATION'],
      defaultValue: 'CATALOGUE_REFERENCE',
    },
    {
      name: 'verified',
      label: 'Đã xác minh nguồn ảnh',
      type: 'checkbox',
      defaultValue: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    ...((process.env.MEDIA_DIR?.trim() || process.env.NORI_MEDIA_DIR?.trim())
      ? { staticDir: (process.env.MEDIA_DIR || process.env.NORI_MEDIA_DIR)!.trim() }
      : {}),
    handlers: [localMediaResizeHandler],
    modifyResponseHeaders: ({ headers }) => {
      headers.set(
        'Cache-Control',
        'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      )
      return headers
    },
  },
}
