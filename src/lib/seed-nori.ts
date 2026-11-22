import fs from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'
import { up as ensureOnlinePaymentMigration } from '../migrations/20261120_010000_online_payment_integration'
import { up as ensureMultiBranchMigration } from '../migrations/20261120_020000_multi_branch_management'
import manifest from './seed-media-manifest.json'
import {
  SEED_DEMO_FLEET,
  SEED_MODELS,
  SEED_SITE_INFO,
  getEstimatedRollingForSeed,
  type SeedModelSpec,
} from './vehicle-seed-data'

type ManifestEntry = {
  filename: string
  alt: string
  kind: string
  modelYear: string
  sourceUrl: string
  sourceName: string
  license: string
}

const typedManifest = manifest as Record<string, ManifestEntry>

async function ensureMedia(payload: Payload, key: string): Promise<string | null> {
  const entry = typedManifest[key]
  if (!entry) return null

  const existing = await payload.find({
    collection: 'media',
    where: {
      or: [
        { filename: { equals: entry.filename } },
        ...(entry.sourceUrl ? [{ sourceUrl: { equals: entry.sourceUrl } }] : []),
      ],
    },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (existing.docs[0]) return existing.docs[0].id

  const filePath = path.resolve(process.cwd(), 'public', 'seed-media', entry.filename)
  let data: Buffer
  try {
    data = await fs.readFile(filePath)
  } catch {
    return null
  }

  const created = await payload.create({
    collection: 'media',
    data: {
      alt: entry.alt,
      sourceUrl: entry.sourceUrl,
      sourceName: entry.sourceName,
      license: entry.license,
      modelYear: entry.modelYear,
      mediaCategory:
        entry.kind === 'HERO' || entry.kind === 'STORY' ? 'ILLUSTRATION' : 'CATALOGUE_REFERENCE',
      verified: true,
    },
    file: {
      data,
      mimetype: 'image/jpeg',
      name: entry.filename,
      size: data.byteLength,
    },
    overrideAccess: true,
    context: { skipRevalidate: true },
  })
  return created.id
}

function buildModelPayloadData(spec: SeedModelSpec, mediaIds: Map<string, string>) {
  const coverId = mediaIds.get(spec.coverKey)
  return {
    name: spec.name,
    officialName: spec.officialName,
    modelLine: spec.modelLine,
    versionName: spec.versionName,
    generation: spec.generation,
    slug: spec.slug,
    brand: spec.brand,
    category: spec.category,
    subCategory: spec.subCategory as never,
    bodyStyle: spec.bodyStyle,
    segment: spec.segment,
    origin: spec.origin,
    modelYear: spec.modelYear,
    seats: spec.seats,
    fuelType: spec.fuelType,
    transmission: spec.transmission,
    driveType: spec.driveType,
    listedPrice: spec.listedPrice,
    referenceRentPrice: spec.referenceRentPrice,
    defaultDepositSuggestion: spec.defaultDepositSuggestion,
    usagePurpose: spec.usagePurpose,
    shortDescription: spec.shortDescription,
    suitableFor: spec.suitableFor,
    description: spec.description,
    exteriorOverview: spec.exteriorOverview,
    interiorOverview: spec.interiorOverview,
    engineOverview: spec.engineOverview,
    highlights: spec.highlights.map((text) => ({ text })),
    features: spec.features.map((f) => ({
      name: f.name,
      category: f.category,
      variantNote: f.variantNote,
    })),
    ...(coverId ? { cover: coverId } : {}),
    gallery: spec.gallery.flatMap((g) => {
      const id = mediaIds.get(g.mediaKey)
      const meta = typedManifest[g.mediaKey]
      if (!id) return []
      return [
        {
          image: id,
          kind: g.kind,
          caption: g.caption,
          variantName: g.variantName,
          colorName: g.colorName,
          sourceUrl: meta?.sourceUrl,
          license: meta?.license,
        },
      ]
    }),
    specifications: spec.specifications.map((s) => ({
      group: s.group,
      label: s.label,
      value: s.value,
      variantName: s.variantName,
      source: s.source,
    })),
    variants: spec.variants.map((v) => ({
      name: v.name,
      year: v.year,
      listedPrice: v.listedPrice,
      referenceRentPrice: v.referenceRentPrice,
      fuelType: v.fuelType,
      transmission: v.transmission,
      driveType: v.driveType,
      seats: v.seats,
      summary: v.summary,
      colors: v.colors.map((c) => {
        const colorImgId = c.mediaKey ? mediaIds.get(c.mediaKey) : undefined
        const colorMeta = c.mediaKey ? typedManifest[c.mediaKey] : undefined
        return {
          name: c.name,
          hex: c.hex,
          sourceUrl: colorMeta?.sourceUrl,
          ...(colorImgId ? { image: colorImgId } : {}),
        }
      }),
    })),
    source: spec.source,
    verificationStatus: 'VERIFIED' as const,
    visible: true,
    featured: spec.featured,
    sortOrder: spec.sortOrder,
  }
}

export function isProtectedProductionRuntime(): boolean {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase()
  const appEnv = (process.env.APP_ENV || process.env.NORI_ENV || '').trim().toLowerCase()
  return vercelEnv === 'production' || appEnv === 'production'
}

async function ensureOfficialAdmin(payload: Payload): Promise<void> {
  if (
    process.env.NORI_SKIP_ADMIN_BOOTSTRAP === '1' ||
    (isProtectedProductionRuntime() && process.env.NORI_ALLOW_STARTUP_BOOTSTRAP !== '1')
  ) {
    return
  }
  const email = (process.env.NORI_ADMIN_EMAIL?.trim() || 'admin@nori.vn').toLowerCase()
  const password = process.env.NORI_ADMIN_PASSWORD || ''
  if (
    !password ||
    password.length < 8 ||
    password.length > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return
  }
  const existing = await payload.find({
    collection: 'admins',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
    select: { id: true, adminRole: true, fullName: true },
  })
  if (existing.docs.length > 0) {
    const doc = existing.docs[0]
    if (doc.adminRole !== 'SUPER_ADMIN') {
      await payload.update({
        collection: 'admins',
        id: doc.id,
        overrideAccess: true,
        context: { skipAudit: true },
        data: { adminRole: 'SUPER_ADMIN', fullName: doc.fullName || 'Quản trị viên NORI' },
      })
    }
    return
  }
  await payload.create({
    collection: 'admins',
    overrideAccess: true,
    context: { skipAudit: true },
    data: { email, password, fullName: 'Quản trị viên NORI', adminRole: 'SUPER_ADMIN' },
  })
}

let ensuredPaymentSchemaOnce = false
let seedBootstrappedOnce = false
let seedBootInFlight: Promise<void> | null = null

export async function seedNoriIfEmpty(payload: Payload): Promise<void> {
  if (seedBootstrappedOnce) return
  if (seedBootInFlight) return seedBootInFlight

  seedBootInFlight = (async () => {
    try {
      await runSeedNoriIfEmpty(payload)
      seedBootstrappedOnce = true
    } finally {
      seedBootInFlight = null
    }
  })()

  return seedBootInFlight
}

async function runSeedNoriIfEmpty(payload: Payload): Promise<void> {
  if (!ensuredPaymentSchemaOnce) {
    try {
      const dbAdapter = payload.db as unknown as { drizzle?: unknown; name?: string }
      if (dbAdapter?.drizzle && dbAdapter?.name !== 'postgres') {
        await ensureOnlinePaymentMigration({
          db: dbAdapter.drizzle as never,
          payload,
          req: undefined as never,
        })
        await ensureMultiBranchMigration({
          db: dbAdapter.drizzle as never,
          payload,
          req: undefined as never,
        })
      }
      ensuredPaymentSchemaOnce = true
    } catch {
      // Non-blocking if schema is already up to date
    }
  }
  await ensureOfficialAdmin(payload)
  const dbAdapter = payload.db as unknown as { name?: string }
  const isPostgresProduction =
    process.env.NODE_ENV === 'production' && dbAdapter?.name === 'postgres'
  if (
    process.env.NORI_DISABLE_DEMO_SEED === '1' ||
    (isProtectedProductionRuntime() && process.env.NORI_ALLOW_STARTUP_BOOTSTRAP !== '1') ||
    (isPostgresProduction && process.env.NORI_ALLOW_STARTUP_BOOTSTRAP !== '1')
  ) {
    return
  }
  const [modelCount, vehicleCount, siteDoc] = await Promise.all([
    payload.count({ collection: 'vehicle-models', overrideAccess: true }),
    payload.count({ collection: 'vehicles', overrideAccess: true }),
    payload.findGlobal({ slug: 'nori-site', overrideAccess: true, depth: 0 }),
  ])

  const needsSiteUpgrade =
    !siteDoc.address ||
    !siteDoc.rentalPolicySummary ||
    !(siteDoc.heroSlides && siteDoc.heroSlides.length > 0)
  if (
    modelCount.totalDocs >= SEED_MODELS.length &&
    vehicleCount.totalDocs >= SEED_DEMO_FLEET.length &&
    !needsSiteUpgrade
  ) {
    return
  }

  const allKeys = new Set<string>([
    'nori-hero-1',
    'nori-hero-2',
    'nori-hero-3',
    'nori-story',
    'vinfast-vf8-ext-1',
    'honda-crv-ext-1',
    'mercedes-c300-ext-2',
    'honda-sh350i-ext-2',
    'ford-ranger-raptor-ext-2',
  ])
  for (const m of SEED_MODELS) {
    allKeys.add(m.coverKey)
    for (const g of m.gallery) allKeys.add(g.mediaKey)
    for (const v of m.variants) {
      for (const c of v.colors) {
        if (c.mediaKey) allKeys.add(c.mediaKey)
      }
    }
  }
  for (const v of SEED_DEMO_FLEET) {
    for (const p of v.photoKeys) allKeys.add(p.mediaKey)
  }

  const mediaIds = new Map<string, string>()
  for (const key of allKeys) {
    const id = await ensureMedia(payload, key)
    if (id) mediaIds.set(key, id)
  }

  const modelIdBySlug = new Map<string, string>()
  const modelSpecBySlug = new Map<string, SeedModelSpec>()

  for (const spec of SEED_MODELS) {
    modelSpecBySlug.set(spec.slug, spec)
    const existing = await payload.find({
      collection: 'vehicle-models',
      where: { slug: { equals: spec.slug } },
      limit: 1,
      overrideAccess: true,
      depth: 1,
    })
    const doc = existing.docs[0]
    const data = buildModelPayloadData(spec, mediaIds)

    if (doc) {
      const coverFilename =
        typeof doc.cover === 'object' && doc.cover ? (doc.cover.filename ?? '') : ''
      const isLegacy =
        !doc.subCategory ||
        (doc.specifications?.length ?? 0) < 5 ||
        coverFilename.endsWith('-catalogue.png')
      if (isLegacy) {
        await payload.update({
          collection: 'vehicle-models',
          id: doc.id,
          data,
          overrideAccess: true,
          context: { skipRevalidate: true },
        })
      }
      modelIdBySlug.set(spec.slug, doc.id)
    } else {
      const created = await payload.create({
        collection: 'vehicle-models',
        data,
        overrideAccess: true,
        context: { skipRevalidate: true },
      })
      modelIdBySlug.set(spec.slug, created.id)
    }
  }

  for (const v of SEED_DEMO_FLEET) {
    const modelId = modelIdBySlug.get(v.modelSlug)
    const modelSpec = modelSpecBySlug.get(v.modelSlug)
    if (!modelId || !modelSpec) continue
    const existing = await payload.find({
      collection: 'vehicles',
      where: { reference: { equals: v.reference } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    if (existing.docs[0]) continue

    const photos = v.photoKeys.flatMap((p) => {
      const id = mediaIds.get(p.mediaKey)
      return id ? [{ image: id, caption: p.caption, kind: p.kind }] : []
    })

    await payload.create({
      collection: 'vehicles',
      overrideAccess: true,
      context: { skipRevalidate: true },
      data: {
        reference: v.reference,
        model: modelId,
        licensePlate: v.licensePlate,
        intent: v.intent,
        isDemo: true,
        vehicleConditionType: v.vehicleConditionType,
        manufactureYear: v.manufactureYear,
        version: v.version,
        color: v.color,
        odometer: v.odometer,
        pricePerDay: v.pricePerDay,
        pricePerHour: v.pricePerHour,
        pricePerWeek: v.pricePerWeek,
        pricePerMonth: v.pricePerMonth,
        weekendSurcharge: v.weekendSurcharge,
        holidaySurcharge: v.holidaySurcharge,
        depositAmount: v.depositAmount,
        deliveryFee: v.deliveryFee,
        kmLimitPerDay: v.kmLimitPerDay,
        overKmFee: v.overKmFee,
        lateReturnFeePerHour: v.lateReturnFeePerHour,
        bufferHours: 2,
        salePrice: v.salePrice,
        listedPrice: v.listedPrice,
        discountPrice: v.discountPrice,
        reservationDeposit: v.reservationDeposit,
        estimatedRollingPrice: getEstimatedRollingForSeed(v, modelSpec),
        negotiable: v.negotiable,
        warrantyPolicy: v.warrantyPolicy,
        priceSourceNote: 'Giá minh họa phục vụ kiểm thử đồ án NORI (DEMO)',
        condition: v.condition,
        exteriorCondition: v.exteriorCondition,
        interiorCondition: v.interiorCondition,
        engineCondition: v.engineCondition,
        maintenanceHistory: v.maintenanceHistory,
        inspectedAt: v.inspectedAt,
        location: v.location,
        pickupLocation: v.pickupLocation,
        operationStatus: 'READY',
        status: 'ACTIVE',
        photos,
      },
    })
  }

  if (needsSiteUpgrade) {
    const hero1 = mediaIds.get('nori-hero-1')
    const hero2 = mediaIds.get('nori-hero-2')
    const hero3 = mediaIds.get('nori-hero-3')
    const story = mediaIds.get('nori-story')
    const heroImages = [
      hero1 ? { image: hero1, credit: 'Steffen Schmitz · Wikimedia Commons (CC BY-SA 4.0)' } : null,
      hero2 ? { image: hero2, credit: 'Steffen Schmitz · Wikimedia Commons (CC BY-SA 4.0)' } : null,
      hero3 ? { image: hero3, credit: 'Shyamal · Wikimedia Commons (CC BY-SA 4.0)' } : null,
    ].filter((item): item is { image: string; credit: string } => item !== null)

    const heroSlides = [
      {
        titleFirst: 'Mọi hành trình.',
        titleSecond: 'Luôn có NORI.',
        eyebrow: 'TỰ DO KHỞI HÀNH · TRỌN VẸN HÀNH TRÌNH',
        categoryBadge: 'Trải nghiệm hành trình',
        description:
          'Đặt thuê theo ngày với báo giá rõ ràng từng khoản hoặc tham khảo hồ sơ xe thực tế kèm ODO xác thực trước khi nhận xe.',
        ctaText: 'Khám phá phương tiện',
        ctaHref: '/vehicles',
        secondaryText: 'Cách NORI hoạt động',
        secondaryHref: '/about#how-it-works',
        desktopImage: mediaIds.get('vinfast-vf8-ext-1'),
        relatedCategory: 'CAR' as const,
        relatedModel: modelIdBySlug.get('vinfast-vf-8'),
        credit: 'VinFast VF 8 · Wikimedia Commons (CC BY-SA 4.0)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:VinFast_VF_8_IAA_2023_1X7A0681.jpg',
        durationSeconds: 6,
        order: 0,
        active: true,
      },
      {
        titleFirst: 'Một lựa chọn.',
        titleSecond: 'Vững vàng đường xa.',
        eyebrow: '4 ĐẾN 7 CHỖ · ĐÔ THỊ & GIA ĐÌNH',
        categoryBadge: 'Ô tô phổ thông & SUV',
        description:
          'Đa dạng các dòng Sedan, CUV, SUV và MPV từ Toyota Vios, Mazda CX-5 đến Fortuner và Honda CR-V cho gia đình và công tác.',
        ctaText: 'Khám phá ô tô',
        ctaHref: '/vehicles?type=CAR',
        secondaryText: 'Cách NORI hoạt động',
        secondaryHref: '/about#how-it-works',
        desktopImage: mediaIds.get('honda-crv-ext-1'),
        relatedCategory: 'CAR' as const,
        relatedModel: modelIdBySlug.get('honda-cr-v'),
        credit: 'Honda CR-V · Wikimedia Commons (CC BY-SA 4.0)',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Honda_CR-V_(6th_generation)_hybrid_1X7A0866.jpg',
        durationSeconds: 6,
        order: 1,
        active: true,
      },
      {
        titleFirst: 'Chạm ước mơ.',
        titleSecond: 'Dấu ấn đẳng cấp.',
        eyebrow: 'PHONG THÁI HIỆN ĐẠI · DẤU ẤN SANG TRỌNG',
        categoryBadge: 'Xe cao cấp & Hạng sang',
        description:
          'Mercedes-Benz C 300 AMG với khoang lái tinh tế, thiết kế thể thao sang trọng cho các sự kiện và hành trình quan trọng.',
        ctaText: 'Khám phá xe cao cấp',
        ctaHref: '/vehicles?type=CAR&search=Mercedes',
        secondaryText: 'Liên hệ tư vấn',
        secondaryHref: '/support',
        desktopImage: mediaIds.get('mercedes-c300-ext-2'),
        relatedCategory: 'CAR' as const,
        relatedModel: modelIdBySlug.get('mercedes-benz-c300-amg'),
        credit: 'Mercedes-Benz C-Class · Wikimedia Commons (CC BY-SA 4.0)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mercedes-AMG_C_43_(W206)_1X7A0893.jpg',
        durationSeconds: 6,
        order: 2,
        active: true,
      },
      {
        titleFirst: 'Linh hoạt phố thị.',
        titleSecond: 'Tự do khám phá.',
        eyebrow: 'TAY GA · CÔN TAY · XE MÁY ĐIỆN',
        categoryBadge: 'Xe máy & Xe điện',
        description:
          'Từ xe tay ga Honda SH, PCX, xe máy điện VinFast Evo đến mô tô phân khối lớn, gọn nhẹ và chủ động trên từng góc phố.',
        ctaText: 'Khám phá xe máy',
        ctaHref: '/vehicles?type=MOTORBIKE',
        secondaryText: 'Liên hệ tư vấn',
        secondaryHref: '/support',
        desktopImage: mediaIds.get('honda-sh350i-ext-2'),
        relatedCategory: 'MOTORBIKE' as const,
        relatedModel: modelIdBySlug.get('honda-sh350i'),
        credit: 'Honda SH350i · Wikimedia Commons (CC BY-SA 4.0)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Honda_SH_350i_2025_EICMA_2024.jpg',
        durationSeconds: 6,
        order: 3,
        active: true,
      },
      {
        titleFirst: 'Vượt cung đường xa.',
        titleSecond: 'Chở trọn hành trang.',
        eyebrow: 'CABIN KÉP · DẪN ĐỘNG 2 CẦU',
        categoryBadge: 'Xe bán tải & Khám phá',
        description:
          'Ford Ranger Raptor, Wildtrak, Toyota Hilux và Mitsubishi Triton sẵn sàng cho chuyến dã ngoại thiên nhiên và công tác thực địa.',
        ctaText: 'Khám phá xe bán tải',
        ctaHref: '/vehicles?type=PICKUP',
        secondaryText: 'Cách NORI hoạt động',
        secondaryHref: '/about#how-it-works',
        desktopImage: mediaIds.get('ford-ranger-raptor-ext-2'),
        relatedCategory: 'PICKUP' as const,
        relatedModel: modelIdBySlug.get('ford-ranger-raptor'),
        credit: 'Ford Ranger Raptor · Wikimedia Commons (CC BY-SA 4.0)',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ford_Ranger_Raptor_(P703)_1X7A6776.jpg',
        durationSeconds: 6,
        order: 4,
        active: true,
      },
    ].filter((s) => Boolean(s.desktopImage))

    await payload.updateGlobal({
      slug: 'nori-site',
      overrideAccess: true,
      context: { skipRevalidate: true },
      data: {
        ...(heroImages.length ? { heroImages } : {}),
        ...(heroSlides.length ? { heroSlides } : {}),
        ...(story ? { storyImage: story } : {}),
        ...SEED_SITE_INFO,
        _status: 'published',
      },
    })
  }
}
