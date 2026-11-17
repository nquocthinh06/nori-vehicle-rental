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
    const targets =
      process.env.NORI_REVALIDATE_ORIGINS ||
      process.env.NORI_REVALIDATE_ORIGIN ||
      process.env.FIGMA_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_SITE_URL
    if (!targets)
      throw new Error(
        'NORI cache notification requires a running Make preview or an explicit NORI_REVALIDATE_ORIGIN.',
      )
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
  }
}

export const revalidateCatalogue: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  await invalidate(req, [doc.slug, previousDoc?.slug], true)
  return doc
}

export const revalidateDeletedCatalogue: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await invalidate(req, [doc.slug], true)
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
