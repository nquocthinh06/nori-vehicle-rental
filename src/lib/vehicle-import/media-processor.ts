import crypto from 'node:crypto'
import type { Payload } from 'payload'
import type { Admin } from '@/payload-types'
import { safeFetchUrl } from './fetcher.ts'
import {
  containsSuspiciousBinaryPayload,
  detectImageMagicBytes,
  MAX_IMAGE_DIMENSION_PX,
  sanitizeImportFilename,
} from './security.ts'
import type { ExtractedMediaCandidate, MediaImportReportItem } from './types.ts'

async function getSharp() {
  const mod = await import('sharp')
  return mod.default
}

export async function processAndUploadMediaCandidates(params: {
  payload: Payload
  user: Admin & { collection: 'admins' }
  candidates: ExtractedMediaCandidate[]
  modelName: string
  modelYear?: number | null
  maxCount?: number
  skipDnsCheck?: boolean
  fetchImpl?: typeof fetch
}): Promise<{
  galleryItems: Array<{
    image: string
    kind: ExtractedMediaCandidate['kind']
    photoType?: string
    isPrimary: boolean
    sortOrder: number
    altText?: string
    caption?: string
    variantName?: string
    colorName?: string
    sourceUrl?: string
    license?: string
    verified: boolean
  }>
  coverId: string | null
  report: MediaImportReportItem[]
}> {
  const limit = Math.min(params.maxCount ?? 12, 20)
  const selected = params.candidates.filter((c) => c.selected !== false).slice(0, limit)
  const report: MediaImportReportItem[] = []
  const galleryItems: Array<{
    image: string
    kind: ExtractedMediaCandidate['kind']
    photoType?: string
    isPrimary: boolean
    sortOrder: number
    altText?: string
    caption?: string
    variantName?: string
    colorName?: string
    sourceUrl?: string
    license?: string
    verified: boolean
  }> = []

  const seenShaInBatch = new Set<string>()
  const sharp = await getSharp()

  for (let i = 0; i < selected.length; i += 1) {
    const candidate = selected[i]!
    try {
      const fetched = await safeFetchUrl(candidate.url, {
        kind: 'image',
        requireAllowlist: false, // Allow manufacturer CDN images while keeping full SSRF/HTTPS/private-IP blocks
        skipDnsCheck: params.skipDnsCheck,
        fetchImpl: params.fetchImpl,
      })

      const magic = detectImageMagicBytes(fetched.buffer)
      if (!magic) {
        report.push({
          url: candidate.url,
          status: 'FAILED',
          kind: candidate.kind,
          reason: 'Magic bytes không phải hình ảnh JPEG/PNG/WebP/AVIF hợp lệ.',
        })
        continue
      }
      if (containsSuspiciousBinaryPayload(fetched.buffer)) {
        report.push({
          url: candidate.url,
          status: 'FAILED',
          kind: candidate.kind,
          reason: 'Phát hiện mã kịch bản hoặc dữ liệu không an toàn bên trong tệp ảnh.',
        })
        continue
      }

      const meta = await sharp(fetched.buffer).metadata()
      const width = meta.width ?? 0
      const height = meta.height ?? 0
      if (
        width < 120 ||
        height < 80 ||
        width > MAX_IMAGE_DIMENSION_PX ||
        height > MAX_IMAGE_DIMENSION_PX
      ) {
        report.push({
          url: candidate.url,
          status: 'SKIPPED',
          kind: candidate.kind,
          reason: `Kích thước ảnh (${width}×${height}px) không đạt chuẩn catalogue.`,
        })
        continue
      }

      const rawSha256 = crypto.createHash('sha256').update(fetched.buffer).digest('hex')
      if (seenShaInBatch.has(rawSha256)) {
        report.push({
          url: candidate.url,
          status: 'DEDUPLICATED',
          sha256: rawSha256,
          kind: candidate.kind,
          reason: 'Trùng lặp SHA-256 trong cùng lượt nhập.',
        })
        continue
      }
      seenShaInBatch.add(rawSha256)

      // Check existing Media collection for SHA-256 deduplication
      const existingRes = await params.payload.find({
        collection: 'media',
        user: params.user,
        overrideAccess: false,
        depth: 0,
        limit: 1,
        where: { sourceSha256: { equals: rawSha256 } },
      })

      let mediaId: string
      let filename: string
      if (existingRes.docs[0]) {
        const existingDoc = existingRes.docs[0]
        mediaId = String(existingDoc.id)
        filename = String(existingDoc.filename ?? '')
        report.push({
          url: candidate.url,
          status: 'DEDUPLICATED',
          mediaId,
          filename,
          sha256: rawSha256,
          kind: candidate.kind,
        })
      } else {
        // Optimize to WebP (max 2560px) while preserving AVIF if already AVIF
        let finalBuffer = fetched.buffer
        let finalMime: string = magic.mime
        let finalExt: string = magic.ext

        if (
          magic.mime !== 'image/avif' &&
          (width > 2560 || height > 2560 || fetched.buffer.length > 300 * 1024)
        ) {
          try {
            let pipeline = sharp(fetched.buffer).rotate()
            if (width > 2560 || height > 2560) {
              pipeline = pipeline.resize({
                width: 2560,
                height: 2560,
                fit: 'inside',
                withoutEnlargement: true,
              })
            }
            const out = await pipeline.webp({ quality: 84, effort: 4 }).toBuffer()
            if (out.length < fetched.buffer.length || width > 2560 || height > 2560) {
              finalBuffer = out
              finalMime = 'image/webp'
              finalExt = 'webp'
            }
          } catch {
            // Keep original validated buffer if optimization fails
          }
        }

        const safeName = sanitizeImportFilename(
          `${params.modelName}-${candidate.kind.toLowerCase()}`,
          finalExt,
          i,
        )
        const alt = candidate.altText?.trim() || `${params.modelName} - ${candidate.kind}`
        const created = await params.payload.create({
          collection: 'media',
          user: params.user,
          overrideAccess: false,
          data: {
            alt: alt.slice(0, 200),
            mediaCategory: 'CATALOGUE_OFFICIAL',
            sourceUrl: candidate.sourceUrl ?? fetched.finalUrl,
            sourceName: candidate.sourceName ?? 'Official Manufacturer Catalogue',
            sourceSha256: rawSha256,
            license: candidate.license ?? 'Official Manufacturer Press/Catalogue',
            ...(params.modelYear ? { modelYear: String(params.modelYear) } : {}),
            ...(candidate.variantName ? { variantName: candidate.variantName } : {}),
            ...(candidate.colorName ? { colorName: candidate.colorName } : {}),
            verified: true,
          } as never,
          file: {
            data: finalBuffer,
            mimetype: finalMime,
            name: safeName,
            size: finalBuffer.length,
          },
        })

        mediaId = String(created.id)
        filename = String(created.filename ?? safeName)
        report.push({
          url: candidate.url,
          status: 'UPLOADED',
          mediaId,
          filename,
          sha256: rawSha256,
          kind: candidate.kind,
        })
      }

      galleryItems.push({
        image: mediaId,
        kind: candidate.kind,
        photoType: candidate.photoType,
        isPrimary: galleryItems.length === 0,
        sortOrder: galleryItems.length,
        altText: candidate.altText?.slice(0, 200),
        caption: candidate.caption?.slice(0, 250),
        variantName: candidate.variantName?.slice(0, 100),
        colorName: candidate.colorName?.slice(0, 80),
        sourceUrl: candidate.sourceUrl ?? candidate.url,
        license: candidate.license ?? 'Official Manufacturer Catalogue',
        verified: true,
      })
    } catch (err) {
      report.push({
        url: candidate.url,
        status: 'FAILED',
        kind: candidate.kind,
        reason: err instanceof Error ? err.message.slice(0, 180) : 'Không thể tải hình ảnh.',
      })
    }
  }

  const coverId = galleryItems.find((g) => g.isPrimary)?.image ?? galleryItems[0]?.image ?? null
  return { galleryItems, coverId, report }
}
