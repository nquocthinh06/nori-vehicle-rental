import 'server-only'
import { unstable_cache } from 'next/cache'
import { getPayloadClient, findBySlug } from '@/lib/payload'
import type { Media, Vehicle, VehicleModel } from '@/payload-types'

export type Category = 'CAR' | 'MOTORBIKE' | 'PICKUP'
export type Photo = { url: string; alt: string; width: number; height: number }
export type ModelView = {
  id: VehicleModel['id']
  name: string
  slug: string
  brand: string
  category: Category
  bodyStyle: string | null
  description: string | null
  cover: Photo | null
  source: string | null
  featured: boolean
  gallery: { image: Photo; kind: 'EXTERIOR' | 'INTERIOR'; caption: string | null }[]
  specifications: { label: string; value: string; source: string | null }[]
  variants: { name: string; colors: { name: string; image: Photo | null }[] }[]
  pricePerDay: number | null
  salePrice: number | null
  rentalCount: number
  saleCount: number
}

export function photo(value: string | Media | null | undefined): Photo | null {
  if (!value || typeof value === 'string' || !value.url) return null
  return {
    url: value.url,
    alt: value.alt ?? '',
    width: value.width ?? 1600,
    height: value.height ?? 1000,
  }
}

function modelView(model: VehicleModel, fleet: Vehicle[]): ModelView {
  const inventory = fleet.filter(
    (v) => (typeof v.model === 'object' ? v.model.id : v.model) === model.id,
  )
  const rentals = inventory.filter((v) => v.intent !== 'SALE')
  const sales = inventory.filter((v) => v.intent !== 'RENT')
  const prices = rentals.flatMap((v) => (v.pricePerDay ? [v.pricePerDay] : []))
  const salePrices = sales.flatMap((v) => (v.salePrice ? [v.salePrice] : []))
  return {
    id: model.id,
    name: model.name,
    slug: model.slug,
    brand: model.brand,
    category: model.category,
    bodyStyle: model.bodyStyle ?? null,
    description: model.description ?? null,
    cover: photo(model.cover),
    source: model.source ?? null,
    featured: !!model.featured,
    gallery: (model.gallery ?? []).flatMap((g) => {
      const image = photo(g.image)
      return image ? [{ image, kind: g.kind, caption: g.caption ?? null }] : []
    }),
    specifications: (model.specifications ?? []).map((s) => ({
      label: s.label,
      value: s.value,
      source: s.source ?? null,
    })),
    variants: (model.variants ?? []).map((v) => ({
      name: v.name,
      colors: (v.colors ?? []).map((c) => ({ name: c.name, image: photo(c.image) })),
    })),
    pricePerDay: prices.length ? Math.min(...prices) : null,
    salePrice: salePrices.length ? Math.min(...salePrices) : null,
    rentalCount: rentals.length,
    saleCount: sales.length,
  }
}

export const getCatalogue = unstable_cache(
  async (): Promise<ModelView[]> => {
    const payload = await getPayloadClient()
    const [models, fleet] = await Promise.all([
      payload.find({
        collection: 'vehicle-models',
        overrideAccess: false,
        depth: 2,
        limit: 100,
        sort: 'sortOrder',
      }),
      payload.find({ collection: 'vehicles', overrideAccess: false, depth: 0, limit: 1000 }),
    ])
    return models.docs.map((m) => modelView(m, fleet.docs))
  },
  ['nori-catalogue-v1'],
  { tags: ['nori-catalogue'] },
)

export function getModel(slug: string) {
  return unstable_cache(
    async () => {
      const model = await findBySlug('vehicle-models', slug)
      if (!model) return null
      const payload = await getPayloadClient()
      const fleet = await payload.find({
        collection: 'vehicles',
        where: { model: { equals: model.id } },
        overrideAccess: false,
        limit: 100,
        depth: 0,
      })
      return modelView(model, fleet.docs)
    },
    ['nori-model-v1', slug],
    { tags: ['nori-catalogue', `nori-model-${slug}`] },
  )()
}

export const getSiteContent = unstable_cache(
  async () => {
    const payload = await getPayloadClient()
    const site = await payload.findGlobal({ slug: 'nori-site', overrideAccess: false, depth: 1 })
    return {
      heroImages: (site.heroImages ?? []).flatMap((h) => {
        const image = photo(h.image)
        return image ? [{ image, credit: h.credit ?? '' }] : []
      }),
      storyImage: photo(site.storyImage),
      address: site.address ?? null,
      phone: site.phone ?? null,
      email: site.email ?? null,
      openingHours: site.openingHours ?? null,
    }
  },
  ['nori-site-v1'],
  { tags: ['nori-site'] },
)

export type SiteContent = Awaited<ReturnType<typeof getSiteContent>>
