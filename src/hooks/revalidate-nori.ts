import { createHmac } from 'node:crypto'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'
import { invalidateNoriCaches, type NoriInvalidation } from '@/lib/public-cache'

async function invalidate(
  req: PayloadRequest,
  slugs: (string | null | undefined)[] = [],
  allDetails = false,
) {
  if (req.context?.skipRevalidate) return
  const change: NoriInvalidation = { slugs: slugs.filter((s): s is string => !!s), allDetails }
  try {
    invalidateNoriCaches(change)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/incrementalCache|static generation store|request scope/i.test(error.message)
    )
      throw error
    // The content CLI is a separate process. Authenticate a cache-only notification;
    // never make a second document-write path or expose the Payload signing secret.
    const explicitTargets =
      process.env.NORI_REVALIDATE_ORIGINS || process.env.NORI_REVALIDATE_ORIGIN
    const targets =
      explicitTargets || process.env.FIGMA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL
    if (!targets) {
      if (!explicitTargets) return
      throw new Error(
        'NORI cache notification requires a running Make preview or an explicit NORI_REVALIDATE_ORIGIN.',
      )
    }
    const raw = JSON.stringify(change)
    const timestamp = String(Date.now())
    const signature = createHmac('sha256', req.payload.secret)
      .update(`${timestamp}.${raw}`)
      .digest('hex')
    const origins = [
      ...new Set(
        targets
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ]
    try {
      await Promise.all(
        origins.map(async (origin) => {
          const response = await fetch(new URL('/nori-api/revalidate', origin), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nori-time': timestamp,
              'x-nori-signature': signature,
            },
            body: raw,
            signal: AbortSignal.timeout(30_000),
          })
          if (!response.ok)
            throw new Error(
              `NORI cache notification failed (${response.status}). Retry the write after the preview is ready.`,
            )
        }),
      )
    } catch (fetchError) {
      if (explicitTargets) throw fetchError
    }
  }
}

async function extractModelSlug(
  doc: Record<string, unknown> | null | undefined,
  req: PayloadRequest,
): Promise<string | null> {
  if (!doc) return null
  if (typeof doc.slug === 'string' && doc.slug) return doc.slug
  if (doc.model) {
    if (
      typeof doc.model === 'object' &&
      doc.model !== null &&
      'slug' in doc.model &&
      typeof (doc.model as { slug?: unknown }).slug === 'string'
    ) {
      return (doc.model as { slug: string }).slug
    }
    if (typeof doc.model === 'string') {
      try {
        const m = await req.payload.findByID({
          collection: 'vehicle-models',
          id: doc.model,
          depth: 0,
        })
        if (m && typeof m.slug === 'string') return m.slug
      } catch {
        return null
      }
    }
  }
  return null
}

export const revalidateCatalogue: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const [docSlug, prevSlug] = await Promise.all([
    extractModelSlug(doc as Record<string, unknown>, req),
    extractModelSlug(previousDoc as Record<string, unknown>, req),
  ])
  await invalidate(req, [docSlug, prevSlug], true)
  return doc
}

export const revalidateDeletedCatalogue: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const docSlug = await extractModelSlug(doc as Record<string, unknown>, req)
  await invalidate(req, [docSlug], true)
  return doc
}

export const revalidateMedia: CollectionAfterChangeHook = async ({ req, doc }) => {
  await invalidate(req, [], true)
  return doc
}

export const revalidateDeletedMedia: CollectionAfterDeleteHook = async ({ req, doc }) => {
  await invalidate(req, [], true)
  return doc
}

export const revalidateSite: GlobalAfterChangeHook = async ({ doc, req }) => {
  await invalidate(req)
  return doc
}
