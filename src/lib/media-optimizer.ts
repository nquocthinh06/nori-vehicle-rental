import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { PayloadRequest } from 'payload'
import sharp from 'sharp'
import { getFromCloudStorage } from './cloud-storage.ts'

const ALLOWED_WIDTHS = [256, 384, 640, 750, 828, 1080, 1200, 1920] as const
const OPTIMIZABLE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const inflightTransforms = new Map<string, Promise<Buffer>>()

function snapAllowedWidth(rawWidth: number): number {
  for (const w of ALLOWED_WIDTHS) {
    if (rawWidth <= w) return w
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]
}

function resolveCacheDir(): string {
  const cwd = process.cwd()
  if (process.env.NORI_IMAGE_CACHE_DIR?.trim()) {
    return path.resolve(/*turbopackIgnore: true*/ process.env.NORI_IMAGE_CACHE_DIR.trim())
  }
  // Vercel serverless filesystem (/var/task) is read-only outside /tmp
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV?.trim()) {
    return path.join(/*turbopackIgnore: true*/ os.tmpdir(), 'nori-media-opt')
  }
  return path.resolve(/*turbopackIgnore: true*/ cwd, '.next', 'cache', 'nori-media-opt')
}

export interface ResolvedMediaSource {
  sourcePath: string
  buffer: Buffer
  sizeBytes: number
  mtimeMs: number
}

/**
 * Searches for a valid binary image across multiple candidate directories.
 * Explicitly guards against Git LFS pointer text files and falls back to Cloud Storage if configured.
 */
export async function resolveValidMediaSource(
  filename: string,
  collection = 'media',
): Promise<ResolvedMediaSource | null> {
  const cleanFilename = path.basename(filename)
  const cwd = process.cwd()

  const candidateDirs: string[] = [
    process.env.NORI_MEDIA_DIR?.trim(),
    process.env.MEDIA_DIR?.trim(),
    path.join(/*turbopackIgnore: true*/ cwd, 'public', 'media'),
    path.join(/*turbopackIgnore: true*/ cwd, 'dev-data', 'media'),
    path.join(/*turbopackIgnore: true*/ cwd, collection),
    path.join(/*turbopackIgnore: true*/ cwd, 'media'),
    path.join(/*turbopackIgnore: true*/ cwd, 'public', 'seed-media'),
  ].filter((d): d is string => Boolean(d && typeof d === 'string'))

  for (const dir of candidateDirs) {
    const fullPath = path.resolve(dir, cleanFilename)
    try {
      const stats = await fsPromises.stat(fullPath)
      if (!stats.isFile() || stats.size === 0) continue

      // Read header to check if this is a Git LFS pointer file instead of actual binary data
      const fd = await fsPromises.open(fullPath, 'r')
      const headerBuf = Buffer.alloc(Math.min(256, stats.size))
      try {
        await fd.read(headerBuf, 0, headerBuf.length, 0)
      } finally {
        await fd.close()
      }

      const headerText = headerBuf.toString('utf8')
      if (headerText.startsWith('version https://git-lfs.github.com/spec/v1')) {
        // Skip LFS pointer, keep looking for real binary in remaining directories
        continue
      }

      const buffer = await fsPromises.readFile(fullPath)
      return {
        sourcePath: fullPath,
        buffer,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
      }
    } catch {
      // File not found in this candidate dir, continue to next
    }
  }

  // Not found in local filesystem; check sustainable Cloud Storage (S3 / R2)
  try {
    const cloudBuffer = await getFromCloudStorage(cleanFilename)
    if (cloudBuffer && cloudBuffer.byteLength > 0) {
      const cacheDir = resolveCacheDir()
      const cachedFilePath = path.join(cacheDir, 'cloud-cache', cleanFilename)
      await fsPromises
        .mkdir(path.dirname(cachedFilePath), { recursive: true })
        .catch(() => undefined)
      await fsPromises.writeFile(cachedFilePath, cloudBuffer).catch(() => undefined)

      return {
        sourcePath: cachedFilePath,
        buffer: cloudBuffer,
        sizeBytes: cloudBuffer.byteLength,
        mtimeMs: Date.now(),
      }
    }
  } catch {
    // Cloud storage read failed or not configured
  }

  return null
}

async function ensureOptimizedVariant(params: {
  sourceBuffer: Buffer
  cachePath: string
  width: number
  quality: number
  targetFormat: 'webp' | 'jpeg' | 'png'
}): Promise<Buffer> {
  try {
    return await fsPromises.readFile(params.cachePath)
  } catch {
    // cache miss
  }

  const existing = inflightTransforms.get(params.cachePath)
  if (existing) return existing

  const work = (async () => {
    const pipeline = sharp(params.sourceBuffer, { failOn: 'none' })
      .rotate()
      .resize({ width: params.width, withoutEnlargement: true })

    let buf: Buffer
    if (params.targetFormat === 'webp') {
      buf = await pipeline.webp({ quality: params.quality, effort: 2 }).toBuffer()
    } else if (params.targetFormat === 'png') {
      buf = await pipeline.png({ compressionLevel: 8, quality: params.quality }).toBuffer()
    } else {
      buf = await pipeline.jpeg({ quality: params.quality, mozjpeg: true }).toBuffer()
    }

    try {
      await fsPromises.mkdir(path.dirname(params.cachePath), { recursive: true })
      const tmpPath = `${params.cachePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
      await fsPromises.writeFile(tmpPath, buf)
      await fsPromises.rename(tmpPath, params.cachePath).catch(async () => {
        await fsPromises.unlink(tmpPath).catch(() => undefined)
      })
    } catch {
      // Cache write errors are non-fatal; still return the optimized buffer
    }

    return buf
  })()

  inflightTransforms.set(params.cachePath, work)
  try {
    return await work
  } finally {
    inflightTransforms.delete(params.cachePath)
  }
}

/**
 * Local / self-hosted Payload upload handler that serves cached resized/WebP variants
 * for the exact `?w=&q=` query parameters generated by `figma-image-loader.ts`.
 * Also serves full original binary with high cacheability and 304 support when unresized.
 * Seamlessly resolves files from public/media, dev-data/media, media, or cloud storage.
 */
export function localMediaResizeHandler(
  req: PayloadRequest,
  args: {
    params: {
      collection: string
      filename: string
      isOriginal?: boolean
      operation?: string
    }
  },
): Promise<Response> | void {
  if (process.env.FIGMA === '1') return
  if (args.params.isOriginal || args.params.operation === 'transform') return
  if (req.headers?.get('range')) return

  const filename = args.params.filename
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return
  }

  const ext = path.extname(filename).toLowerCase()
  const rawW = req.searchParams?.get('w')

  return (async () => {
    const source = await resolveValidMediaSource(filename, args.params.collection || 'media')
    if (!source) {
      return undefined as unknown as Response
    }

    const defaultContentType = MIME_MAP[ext] || 'application/octet-stream'

    // If no resize width is specified, serve original binary directly with caching
    if (!rawW) {
      const hash = crypto
        .createHash('sha256')
        .update(`${filename}:${source.sizeBytes}:${source.mtimeMs}`)
        .digest('hex')
        .slice(0, 24)
      const etag = `"nori-raw-${hash}"`

      if (req.headers?.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }

      return new Response(new Uint8Array(source.buffer), {
        status: 200,
        headers: {
          'Content-Type': defaultContentType,
          'Content-Length': String(source.sizeBytes),
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          ETag: etag,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const parsedW = Number(rawW)
    if (!Number.isFinite(parsedW) || parsedW < 16) {
      return undefined as unknown as Response
    }

    if (!OPTIMIZABLE_EXTS.has(ext)) {
      return undefined as unknown as Response
    }

    const targetWidth = snapAllowedWidth(Math.round(parsedW))
    const rawQ = Number(req.searchParams?.get('q') ?? 78)
    const quality = Number.isFinite(rawQ) ? Math.min(90, Math.max(50, Math.round(rawQ))) : 78

    const accept = req.headers?.get('accept') ?? ''
    const supportsWebp = accept.includes('image/webp') || ext === '.webp'
    const targetFormat: 'webp' | 'jpeg' | 'png' = supportsWebp
      ? 'webp'
      : ext === '.png'
        ? 'png'
        : 'jpeg'

    const cacheKey = crypto
      .createHash('sha256')
      .update(
        `${filename}:${source.mtimeMs}:${source.sizeBytes}:${targetWidth}:${quality}:${targetFormat}`,
      )
      .digest('hex')
      .slice(0, 32)
    const etag = `"nori-img-${cacheKey}"`

    if (req.headers?.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          Vary: 'Accept',
        },
      })
    }

    const cacheDir = resolveCacheDir()
    const fallbackDir = path.join(/*turbopackIgnore: true*/ os.tmpdir(), 'nori-media-opt')
    const cachePath = path.join(
      /*turbopackIgnore: true*/ cacheDir || fallbackDir,
      `${cacheKey}.${targetFormat}`,
    )

    try {
      const output = await ensureOptimizedVariant({
        sourceBuffer: source.buffer,
        cachePath,
        width: targetWidth,
        quality,
        targetFormat,
      })

      const contentType =
        targetFormat === 'webp' ? 'image/webp' : targetFormat === 'png' ? 'image/png' : 'image/jpeg'

      return new Response(new Uint8Array(output), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(output.byteLength),
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          ETag: etag,
          Vary: 'Accept',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      // Graceful fallback: return original source buffer rather than 404 or crashing
      return new Response(new Uint8Array(source.buffer), {
        status: 200,
        headers: {
          'Content-Type': defaultContentType,
          'Content-Length': String(source.sizeBytes),
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
  })()
}
