import 'server-only'
import { unstable_cache } from 'next/cache'
import { getPayloadClient, findBySlug } from '@/lib/payload'
import type { Media, Post, Promotion, Vehicle, VehicleModel } from '@/payload-types'

export type Category = 'CAR' | 'MOTORBIKE' | 'PICKUP'
export type GalleryKind = 'OVERVIEW' | 'EXTERIOR' | 'INTERIOR' | 'ENGINE' | 'FEATURE'
export type Photo = {
  url: string
  alt: string
  width: number
  height: number
  filename?: string | null
  filesize?: number | null
  mimeType?: string | null
  focalX?: number | null
  focalY?: number | null
  sourceUrl?: string | null
  sourceName?: string | null
  license?: string | null
  mediaCategory?: string | null
  colorName?: string | null
  variantName?: string | null
}

export type HeroSlideView = {
  id: string
  titleFirst: string
  titleSecond: string | null
  eyebrow: string | null
  categoryBadge: string | null
  description: string | null
  ctaText: string
  ctaHref: string
  secondaryText: string | null
  secondaryHref: string | null
  desktopImage: Photo | null
  mobileImage: Photo | null
  focalX: number
  focalY: number
  mobileFocalX: number
  mobileFocalY: number
  relatedCategory: Category | null
  credit: string | null
  sourceUrl: string | null
  durationSeconds: number | null
  order: number
}

export type ModelView = {
  id: VehicleModel['id']
  name: string
  officialName: string | null
  modelLine: string | null
  versionName: string | null
  generation: string | null
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
  defaultDepositSuggestion: number | null
  suitableFor: string | null
  usagePurpose: string | null
  shortDescription: string | null
  description: string | null
  exteriorOverview: string | null
  interiorOverview: string | null
  engineOverview: string | null
  highlights: string[]
  features: {
    name: string
    category: string
    status: string
    variantNote: string | null
  }[]
  cover: Photo | null
  source: string | null
  verificationStatus: string
  featured: boolean
  gallery: {
    image: Photo
    kind: GalleryKind
    photoType: string | null
    isPrimary: boolean
    sortOrder: number
    altText: string | null
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

export function clampFocalPercent(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function photo(value: string | Media | null | undefined): Photo | null {
  if (!value || typeof value === 'string' || !value.url) return null
  return {
    url: value.url,
    alt: value.alt ?? '',
    width: value.width ?? 1280,
    height: value.height ?? 826,
    filename: value.filename ?? null,
    filesize: typeof value.filesize === 'number' ? value.filesize : null,
    mimeType: value.mimeType ?? null,
    focalX: typeof value.focalX === 'number' ? value.focalX : null,
    focalY: typeof value.focalY === 'number' ? value.focalY : null,
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

  const galleryMapped = (model.gallery ?? [])
    .map((g, idx) => {
      const image = photo(g.image)
      if (!image) return null
      if (g.altText && g.altText.trim()) {
        image.alt = g.altText.trim()
      }
      return {
        image,
        kind: g.kind as GalleryKind,
        photoType: g.photoType ?? null,
        isPrimary: Boolean(g.isPrimary),
        sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : idx,
        altText: g.altText ?? null,
        caption: g.caption ?? null,
        variantName: g.variantName ?? null,
        colorName: g.colorName ?? null,
        sourceUrl: g.sourceUrl ?? image.sourceUrl ?? null,
        license: g.license ?? image.license ?? null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const resolvedCover =
    photo(model.cover) ??
    galleryMapped.find((g) => g.isPrimary)?.image ??
    galleryMapped[0]?.image ??
    null

  return {
    id: model.id,
    name: model.name,
    officialName: model.officialName ?? null,
    modelLine: model.modelLine ?? null,
    versionName: model.versionName ?? null,
    generation: model.generation ?? null,
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
    defaultDepositSuggestion: model.defaultDepositSuggestion ?? null,
    suitableFor: model.suitableFor ?? null,
    usagePurpose: model.usagePurpose ?? null,
    shortDescription: model.shortDescription ?? null,
    description: model.description ?? null,
    exteriorOverview: model.exteriorOverview ?? null,
    interiorOverview: model.interiorOverview ?? null,
    engineOverview: model.engineOverview ?? null,
    highlights: (model.highlights ?? []).map((h) => h.text).filter(Boolean),
    features: (model.features ?? []).map((f) => ({
      name: f.name,
      category: f.category ?? 'COMFORT',
      status: f.status ?? 'EQUIPPED',
      variantNote: f.variantNote ?? null,
    })),
    cover: resolvedCover,
    source: model.source ?? null,
    verificationStatus: model.verificationStatus ?? 'VERIFIED',
    featured: !!model.featured,
    gallery: galleryMapped,
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

/**
 * Lightweight cached catalogue query for listing/home/static-param routes.
 * Fetches only card-level fields at depth 1 (avoiding full descriptions, specs,
 * features, variants, and multi-photo galleries) to keep RSC payloads minimal.
 */
export const getCatalogueSummary = unstable_cache(
  async (): Promise<ModelView[]> => {
    const payload = await getPayloadClient()
    const [models, fleet] = await Promise.all([
      payload.find({
        collection: 'vehicle-models',
        overrideAccess: false,
        depth: 1,
        limit: 100,
        sort: 'sortOrder',
        select: {
          name: true,
          slug: true,
          brand: true,
          category: true,
          subCategory: true,
          bodyStyle: true,
          segment: true,
          modelYear: true,
          seats: true,
          fuelType: true,
          transmission: true,
          listedPrice: true,
          referenceRentPrice: true,
          cover: true,
          featured: true,
          verificationStatus: true,
          sortOrder: true,
        },
      }),
      payload.find({
        collection: 'vehicles',
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        select: {
          model: true,
          status: true,
          operationStatus: true,
          intent: true,
          pricePerDay: true,
          salePrice: true,
          location: true,
          isDemo: true,
        },
      }),
    ])
    return models.docs.map((m) => modelView(m as VehicleModel, fleet.docs as Vehicle[]))
  },
  ['nori-catalogue-summary-v1'],
  { tags: ['nori-catalogue'] },
)

export function slimPostForCard(post: PostView): PostView {
  const clean = post.content.replace(/\s+/g, ' ').trim()
  const shortContent =
    post.excerpt && post.excerpt.trim()
      ? ''
      : clean.length <= 160
        ? clean
        : `${clean.slice(0, 157)}...`
  return {
    ...post,
    content: shortContent,
  }
}

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
    const rawSlides = site.heroSlides ?? []
    const hasConfiguredSlides = rawSlides.length > 0
    const activeSlides: HeroSlideView[] = rawSlides
      .filter((s) => s.active !== false)
      .map((s, idx) => {
        const slideRecord = s as unknown as Record<string, unknown>
        const desktopImg = photo(s.desktopImage)
        const mobileImg = photo(s.mobileImage)
        const focalX = clampFocalPercent(slideRecord.focalX, desktopImg?.focalX ?? 50)
        const focalY = clampFocalPercent(slideRecord.focalY, desktopImg?.focalY ?? 50)
        const mobileFocalX = clampFocalPercent(
          slideRecord.mobileFocalX,
          mobileImg ? (mobileImg.focalX ?? 50) : focalX,
        )
        const mobileFocalY = clampFocalPercent(
          slideRecord.mobileFocalY,
          mobileImg ? (mobileImg.focalY ?? 50) : focalY,
        )
        return {
          id: s.id ?? `slide-${idx + 1}`,
          titleFirst: s.titleFirst,
          titleSecond: s.titleSecond ?? null,
          eyebrow: s.eyebrow ?? null,
          categoryBadge: s.categoryBadge ?? null,
          description: s.description ?? null,
          ctaText: s.ctaText,
          ctaHref: s.ctaHref,
          secondaryText: s.secondaryText ?? null,
          secondaryHref: s.secondaryHref ?? null,
          desktopImage: desktopImg,
          mobileImage: mobileImg,
          focalX,
          focalY,
          mobileFocalX,
          mobileFocalY,
          relatedCategory: (s.relatedCategory as Category | null) ?? null,
          credit: s.credit ?? null,
          sourceUrl: s.sourceUrl ?? null,
          durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : null,
          order: typeof s.order === 'number' ? s.order : idx,
        }
      })
      .sort((a, b) => a.order - b.order)

    return {
      siteName: site.siteName ?? 'NORI',
      tagline: site.tagline ?? 'Your way. Every day.',
      logo: photo(site.logo),
      favicon: photo(site.favicon),
      seoTitle: site.seoTitle ?? null,
      seoDescription: site.seoDescription ?? null,
      ogImage: photo(site.ogImage),
      heroAutoplaySeconds: site.heroAutoplaySeconds ?? 6,
      hasConfiguredHeroSlides: hasConfiguredSlides,
      heroSlides: activeSlides,
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
      businessTimezone: site.businessTimezone ?? 'Asia/Ho_Chi_Minh',
      workingDays: site.workingDays ?? '1,2,3,4,5',
      workStartTime: site.workStartTime ?? null,
      workEndTime: site.workEndTime ?? null,
      lunchBreakStart: site.lunchBreakStart ?? null,
      lunchBreakEnd: site.lunchBreakEnd ?? null,
      holidays: (site.holidays ?? []).map((h) => ({
        date: h.date,
        name: h.name,
      })),
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
  ['nori-site-v6'],
  { tags: ['nori-site'] },
)

export type PostPromotionView = {
  id: string
  code: string
  name: string
  description: string | null
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  maxDiscount: number | null
  minDays: number
  appliesTo: 'ALL' | 'RENT' | 'SALE'
  validFrom: string | null
  validTo: string | null
  usageLimit: number | null
  usedCount: number
  active: boolean
}

export type PostView = {
  id: string
  title: string
  slug: string
  category: 'NEWS' | 'GUIDE' | 'PROMOTION'
  excerpt: string | null
  content: string
  cover: Photo | null
  promotion: PostPromotionView | null
  publishedAt: string
  seoTitle: string | null
  seoDescription: string | null
}

function projectPromotion(doc: Promotion | null | undefined): PostPromotionView | null {
  if (!doc || typeof doc !== 'object') return null
  return {
    id: String(doc.id),
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    maxDiscount: doc.maxDiscount ?? null,
    minDays: doc.minDays ?? 1,
    appliesTo: (doc.appliesTo as 'ALL' | 'RENT' | 'SALE' | null) ?? 'RENT',
    validFrom: doc.validFrom ?? null,
    validTo: doc.validTo ?? null,
    usageLimit: doc.usageLimit ?? null,
    usedCount: doc.usedCount ?? 0,
    active: Boolean(doc.active),
  }
}

async function resolvePostPromotion(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  post: Post,
  promoCache?: Map<string, PostPromotionView | null>,
): Promise<PostPromotionView | null> {
  if (post.category !== 'PROMOTION') return null
  const rawPromo = (post as unknown as { promotion?: string | Promotion | null }).promotion
  if (!rawPromo) return null
  if (typeof rawPromo === 'object') {
    return projectPromotion(rawPromo)
  }
  const promoId = String(rawPromo)
  if (promoCache?.has(promoId)) {
    return promoCache.get(promoId) ?? null
  }
  try {
    const doc = await payload.findByID({
      collection: 'promotions',
      id: promoId,
      overrideAccess: true,
      depth: 0,
    })
    const projected = projectPromotion(doc)
    promoCache?.set(promoId, projected)
    return projected
  } catch {
    promoCache?.set(promoId, null)
    return null
  }
}

async function mapPostView(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  p: Post,
  promoCache?: Map<string, PostPromotionView | null>,
): Promise<PostView> {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug ?? p.id,
    category: p.category,
    excerpt: p.excerpt ?? null,
    content: p.content,
    cover: photo(p.cover),
    promotion: await resolvePostPromotion(payload, p, promoCache),
    publishedAt: p.publishedAt ?? p.createdAt,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
  }
}

export const getPublishedPosts = unstable_cache(
  async (): Promise<PostView[]> => {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 1,
      limit: 50,
      where: { _status: { equals: 'published' } },
      sort: '-publishedAt',
    })
    const promoCache = new Map<string, PostPromotionView | null>()
    return Promise.all(res.docs.map((p) => mapPostView(payload, p, promoCache)))
  },
  ['nori-posts-v2'],
  { tags: ['nori-posts', 'nori-site'] },
)

export function getPublishedPostBySlug(slug: string): Promise<PostView | null> {
  return unstable_cache(
    async () => {
      const post = await findBySlug('posts', slug, { draft: false, depth: 1 })
      if (!post || post._status !== 'published') return null
      const payload = await getPayloadClient()
      return mapPostView(payload, post)
    },
    ['nori-post-v1', slug],
    { tags: ['nori-posts', `nori-post-${slug}`, 'nori-site'] },
  )()
}

export type SiteContent = Awaited<ReturnType<typeof getSiteContent>>
