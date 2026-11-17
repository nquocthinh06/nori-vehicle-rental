import 'server-only'
import { unstable_cache } from 'next/cache'
import { getPayloadClient, findBySlug } from '@/lib/payload'
import type { Media, Vehicle, VehicleModel } from '@/payload-types'

export type Category = 'CAR' | 'MOTORBIKE' | 'PICKUP'
export type GalleryKind = 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
export type Photo = {
  url: string
  alt: string
  width: number
  height: number
  sourceUrl?: string | null
  sourceName?: string | null
  license?: string | null
  mediaCategory?: string | null
  colorName?: string | null
  variantName?: string | null
}
export type ModelView = {
  id: VehicleModel['id']
  name: string
  slug: string
  brand: string
  category: Category
  subCategory: string | null
  bodyStyle: string | null
  segment: string | null
  origin: string | null
  modelYear: number | null
  seats: number | null
  fuelType: string | null
  transmission: string | null
  driveType: string | null
  listedPrice: number | null
  referenceRentPrice: number | null
  suitableFor: string | null
  description: string | null
  exteriorOverview: string | null
  interiorOverview: string | null
  engineOverview: string | null
  highlights: string[]
  features: { name: string; category: string; variantNote: string | null }[]
  cover: Photo | null
  source: string | null
  verificationStatus: string
  featured: boolean
  gallery: {
    image: Photo
    kind: GalleryKind
    caption: string | null
    variantName: string | null
    colorName: string | null
    sourceUrl: string | null
    license: string | null
  }[]
  specifications: {
    group: string
    label: string
    value: string
    variantName: string | null
    source: string | null
  }[]
  variants: {
    name: string
    year: number | null
    listedPrice: number | null
    referenceRentPrice: number | null
    fuelType: string | null
    transmission: string | null
    driveType: string | null
    seats: number | null
    summary: string | null
    colors: { name: string; hex: string | null; sourceUrl: string | null; image: Photo | null }[]
  }[]
  pricePerDay: number | null
  salePrice: number | null
  rentalCount: number
  saleCount: number
  availableRentCount: number
  availableSaleCount: number
  hasDemoFleet: boolean
  locations: string[]
  colorsSummary: string[]
}

export function photo(value: string | Media | null | undefined): Photo | null {
  if (!value || typeof value === 'string' || !value.url) return null
  return {
    url: value.url,
    alt: value.alt ?? '',
    width: value.width ?? 1280,
    height: value.height ?? 826,
    sourceUrl: value.sourceUrl ?? null,
    sourceName: value.sourceName ?? null,
    license: value.license ?? null,
    mediaCategory: value.mediaCategory ?? null,
    colorName: value.colorName ?? null,
    variantName: value.variantName ?? null,
  }
}

function modelView(model: VehicleModel, fleet: Vehicle[]): ModelView {
  const inventory = fleet.filter(
    (v) =>
      (typeof v.model === 'object' ? v.model.id : v.model) === model.id &&
      v.status === 'ACTIVE' &&
      v.operationStatus !== 'SOLD',
  )
  const rentals = inventory.filter((v) => v.intent !== 'SALE')
  const sales = inventory.filter((v) => v.intent !== 'RENT')
  const availableRentals = rentals.filter((v) => v.operationStatus === 'READY')
  const availableSales = sales.filter((v) => v.operationStatus === 'READY')
  const prices = rentals.flatMap((v) => (v.pricePerDay ? [v.pricePerDay] : []))
  const salePrices = sales.flatMap((v) => (v.salePrice ? [v.salePrice] : []))
  const locations = [
    ...new Set(inventory.map((v) => v.location).filter((val): val is string => Boolean(val))),
  ]
  const colorSet = new Set<string>()
  for (const v of model.variants ?? []) {
    for (const c of v.colors ?? []) {
      if (c.name) colorSet.add(c.name)
    }
  }
  for (const item of inventory) {
    if (item.color) colorSet.add(item.color)
  }

  return {
    id: model.id,
    name: model.name,
    slug: model.slug,
    brand: model.brand,
    category: model.category,
    subCategory: model.subCategory ?? null,
    bodyStyle: model.bodyStyle ?? null,
    segment: model.segment ?? null,
    origin: model.origin ?? null,
    modelYear: model.modelYear ?? null,
    seats: model.seats ?? null,
    fuelType: model.fuelType ?? null,
    transmission: model.transmission ?? null,
    driveType: model.driveType ?? null,
    listedPrice: model.listedPrice ?? null,
    referenceRentPrice: model.referenceRentPrice ?? null,
    suitableFor: model.suitableFor ?? null,
    description: model.description ?? null,
    exteriorOverview: model.exteriorOverview ?? null,
    interiorOverview: model.interiorOverview ?? null,
    engineOverview: model.engineOverview ?? null,
    highlights: (model.highlights ?? []).map((h) => h.text).filter(Boolean),
    features: (model.features ?? []).map((f) => ({
      name: f.name,
      category: f.category ?? 'COMFORT',
      variantNote: f.variantNote ?? null,
    })),
    cover: photo(model.cover),
    source: model.source ?? null,
    verificationStatus: model.verificationStatus ?? 'VERIFIED',
    featured: !!model.featured,
    gallery: (model.gallery ?? []).flatMap((g) => {
      const image = photo(g.image)
      return image
        ? [
            {
              image,
              kind: g.kind as GalleryKind,
              caption: g.caption ?? null,
              variantName: g.variantName ?? null,
              colorName: g.colorName ?? null,
              sourceUrl: g.sourceUrl ?? image.sourceUrl ?? null,
              license: g.license ?? image.license ?? null,
            },
          ]
        : []
    }),
    specifications: (model.specifications ?? []).map((s) => ({
      group: s.group ?? 'OVERVIEW',
      label: s.label,
      value: s.value,
      variantName: s.variantName ?? null,
      source: s.source ?? null,
    })),
    variants: (model.variants ?? []).map((v) => ({
      name: v.name,
      year: v.year ?? null,
      listedPrice: v.listedPrice ?? null,
      referenceRentPrice: v.referenceRentPrice ?? null,
      fuelType: v.fuelType ?? null,
      transmission: v.transmission ?? null,
      driveType: v.driveType ?? null,
      seats: v.seats ?? null,
      summary: v.summary ?? null,
      colors: (v.colors ?? []).map((c) => ({
        name: c.name,
        hex: c.hex ?? null,
        sourceUrl: c.sourceUrl ?? null,
        image: photo(c.image),
      })),
    })),
    pricePerDay: prices.length ? Math.min(...prices) : null,
    salePrice: salePrices.length ? Math.min(...salePrices) : null,
    rentalCount: rentals.length,
    saleCount: sales.length,
    availableRentCount: availableRentals.length,
    availableSaleCount: availableSales.length,
    hasDemoFleet: inventory.some((v) => v.isDemo),
    locations,
    colorsSummary: [...colorSet],
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
  ['nori-catalogue-v3'],
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
    ['nori-model-v3', slug],
    { tags: ['nori-catalogue', `nori-model-${slug}`] },
  )()
}

export const getSiteContent = unstable_cache(
  async () => {
    const payload = await getPayloadClient()
    const site = await payload.findGlobal({ slug: 'nori-site', overrideAccess: false, depth: 1 })
    return {
      siteName: site.siteName ?? 'NORI',
      tagline: site.tagline ?? 'Your way. Every day.',
      logo: photo(site.logo),
      favicon: photo(site.favicon),
      seoTitle: site.seoTitle ?? null,
      seoDescription: site.seoDescription ?? null,
      ogImage: photo(site.ogImage),
      heroImages: (site.heroImages ?? []).flatMap((h) => {
        const image = photo(h.image)
        return image ? [{ image, credit: h.credit ?? '' }] : []
      }),
      storyImage: photo(site.storyImage),
      homeIntroTitle: site.homeIntroTitle ?? null,
      homeIntroDescription: site.homeIntroDescription ?? null,
      showHeroSection: site.showHeroSection !== false,
      showBenefitsSection: site.showBenefitsSection !== false,
      showFeaturedSection: site.showFeaturedSection !== false,
      showHowItWorksSection: site.showHowItWorksSection !== false,
      showStorySection: site.showStorySection !== false,
      showCtaSection: site.showCtaSection !== false,
      headerMenu: (site.headerMenu ?? []).filter((m) => m.visible !== false),
      footerLinks: site.footerLinks ?? [],
      socialLinks: site.socialLinks ?? [],
      aboutSummary: site.aboutSummary ?? null,
      address: site.address ?? null,
      phone: site.phone ?? null,
      email: site.email ?? null,
      openingHours: site.openingHours ?? null,
      contactNote: site.contactNote ?? null,
      rentalPolicySummary: site.rentalPolicySummary ?? null,
      purchasePolicySummary: site.purchasePolicySummary ?? null,
      ageRequirement: site.ageRequirement ?? null,
      licenseRequirement: site.licenseRequirement ?? null,
      cancellationPolicy: site.cancellationPolicy ?? null,
      depositPolicy: site.depositPolicy ?? null,
      privacyPolicy: site.privacyPolicy ?? null,
      termsOfUse: site.termsOfUse ?? null,
      faqs: (site.faqs ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      depositHoldHours: site.depositHoldHours ?? 24,
      maxPendingBookings: site.maxPendingBookings ?? 5,
      maintenanceBannerEnabled: Boolean(site.maintenanceBannerEnabled),
      maintenanceBannerText: site.maintenanceBannerText ?? null,
    }
  },
  ['nori-site-v4'],
  { tags: ['nori-site'] },
)

export const getPublishedPosts = unstable_cache(
  async () => {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'posts',
      overrideAccess: false,
      depth: 1,
      limit: 20,
      sort: '-publishedAt',
    })
    return res.docs.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug ?? p.id,
      category: p.category,
      excerpt: p.excerpt ?? null,
      content: p.content,
      cover: photo(p.cover),
      publishedAt: p.publishedAt ?? p.createdAt,
      seoTitle: p.seoTitle ?? null,
      seoDescription: p.seoDescription ?? null,
    }))
  },
  ['nori-posts-v1'],
  { tags: ['nori-site'] },
)

export type SiteContent = Awaited<ReturnType<typeof getSiteContent>>
