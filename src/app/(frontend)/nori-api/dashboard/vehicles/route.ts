import { adminHasPermission, type AdminAction, type AdminModule } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

async function resolveTargetModuleFromBody(request: Request): Promise<AdminModule> {
  try {
    const parsed = (await request.clone().json()) as { entity?: unknown } | null
    return parsed?.entity === 'model' ? 'models' : 'vehicles'
  } catch {
    return 'vehicles'
  }
}

function resolveTargetModuleFromQuery(request: Request): AdminModule {
  const sp = new URL(request.url).searchParams
  return sp.get('entity') === 'model' || sp.get('view') === 'models' ? 'models' : 'vehicles'
}

function fleetAuth(module: AdminModule, action: AdminAction) {
  return requireAdmin({ permission: [module, action] })
}
import { photo } from '@/lib/catalogue'
import { subCategoriesByCategory } from '@/lib/rental-rules'

const VALID_OP = ['READY', 'RENTED', 'RESERVED', 'MAINTENANCE', 'SOLD', 'INACTIVE'] as const
const VALID_BIZ = ['ACTIVE', 'INACTIVE'] as const
const VALID_INTENT = ['RENT', 'SALE', 'BOTH'] as const
const VALID_CAT = ['CAR', 'MOTORBIKE', 'PICKUP'] as const
const VALID_FUEL = ['Xăng', 'Dầu (Diesel)', 'Điện (EV)', 'Hybrid'] as const
const VALID_GALLERY_KIND = ['OVERVIEW', 'EXTERIOR', 'INTERIOR', 'ENGINE', 'FEATURE'] as const
const VALID_SPEC_GROUP = [
  'OVERVIEW',
  'ENGINE',
  'DIMENSIONS',
  'CHASSIS',
  'PICKUP',
  'MOTORBIKE',
  'EV',
] as const
const VALID_FEATURE_CAT = ['COMFORT', 'SAFETY', 'DRIVER_ASSIST', 'TECHNOLOGY'] as const
const VALID_FEATURE_STATUS = ['EQUIPPED', 'NOT_EQUIPPED', 'UNVERIFIED', 'NOT_APPLICABLE'] as const

function parseIntField(
  val: unknown,
  label: string,
  min: number,
  max: number,
): number | null | undefined {
  if (val === undefined) return undefined
  if (val === null || val === '') return null
  const num = Number(val)
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    throw new Error(
      `${label} không hợp lệ (${min.toLocaleString('vi-VN')} – ${max.toLocaleString('vi-VN')}).`,
    )
  }
  return num
}

function sanitizeModelGallery(rawGallery: unknown, explicitCoverId?: string | null) {
  if (!Array.isArray(rawGallery)) return { gallery: undefined, fallbackCoverId: explicitCoverId }
  let primaryAssigned = false
  const items = rawGallery
    .slice(0, 60)
    .filter((g): g is Record<string, unknown> => Boolean(g && typeof g === 'object'))
    .map((g, idx) => {
      const imageId = text(g.imageId ?? g.image, 100)
      const rawKind = text(g.kind, 20)
      const kind = VALID_GALLERY_KIND.includes(rawKind as (typeof VALID_GALLERY_KIND)[number])
        ? (rawKind as (typeof VALID_GALLERY_KIND)[number])
        : 'EXTERIOR'
      let isPrimary = Boolean(g.isPrimary)
      if (isPrimary) {
        if (primaryAssigned) isPrimary = false
        else primaryAssigned = true
      }
      return {
        image: imageId,
        kind,
        photoType: text(g.photoType, 40) || undefined,
        isPrimary,
        sortOrder:
          typeof g.sortOrder === 'number' && Number.isFinite(g.sortOrder) ? g.sortOrder : idx,
        altText: text(g.altText, 200) || undefined,
        caption: text(g.caption, 250) || undefined,
        variantName: text(g.variantName, 100) || undefined,
        colorName: text(g.colorName, 80) || undefined,
        sourceUrl: text(g.sourceUrl, 300) || undefined,
        license: text(g.license, 120) || undefined,
        verified: g.verified !== false,
      }
    })
    .filter((g) => Boolean(g.image))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g, idx) => ({ ...g, sortOrder: idx }))

  let resolvedCoverId = explicitCoverId
  if (!resolvedCoverId && items.length > 0) {
    resolvedCoverId = (items.find((i) => i.isPrimary) ?? items[0]).image
  }
  return { gallery: items, fallbackCoverId: resolvedCoverId }
}

function sanitizeModelSpecs(rawSpecs: unknown) {
  if (!Array.isArray(rawSpecs)) return undefined
  return rawSpecs
    .slice(0, 80)
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    .map((s) => {
      const rawGroup = text(s.group, 30)
      const group = VALID_SPEC_GROUP.includes(rawGroup as (typeof VALID_SPEC_GROUP)[number])
        ? (rawGroup as (typeof VALID_SPEC_GROUP)[number])
        : 'OVERVIEW'
      return {
        group,
        label: text(s.label, 120),
        value: text(s.value, 240),
        variantName: text(s.variantName, 100) || undefined,
        source: text(s.source, 200) || undefined,
      }
    })
    .filter((s) => s.label && s.value)
}

function sanitizeModelFeatures(rawFeatures: unknown) {
  if (!Array.isArray(rawFeatures)) return undefined
  return rawFeatures
    .slice(0, 80)
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
    .map((f) => {
      const rawCat = text(f.category, 30)
      const category = VALID_FEATURE_CAT.includes(rawCat as (typeof VALID_FEATURE_CAT)[number])
        ? (rawCat as (typeof VALID_FEATURE_CAT)[number])
        : 'COMFORT'
      const rawStatus = text(f.status, 30)
      const status = VALID_FEATURE_STATUS.includes(
        rawStatus as (typeof VALID_FEATURE_STATUS)[number],
      )
        ? (rawStatus as (typeof VALID_FEATURE_STATUS)[number])
        : 'EQUIPPED'
      return {
        name: text(f.name, 140),
        category,
        status,
        variantNote: text(f.variantNote, 120) || undefined,
      }
    })
    .filter((f) => f.name)
}

function sanitizeModelHighlights(rawHighlights: unknown) {
  if (!Array.isArray(rawHighlights)) return undefined
  return rawHighlights
    .slice(0, 20)
    .map((h) => {
      if (typeof h === 'string') return { text: text(h, 240) }
      if (h && typeof h === 'object' && 'text' in h)
        return { text: text((h as { text?: unknown }).text, 240) }
      return { text: '' }
    })
    .filter((h) => Boolean(h.text))
}

function sanitizeModelVariants(rawVariants: unknown) {
  if (!Array.isArray(rawVariants)) return undefined
  return rawVariants
    .slice(0, 20)
    .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'))
    .map((v) => {
      const rawColors = Array.isArray(v.colors) ? v.colors : []
      const colors = rawColors
        .slice(0, 20)
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => {
          const imgId = text(c.imageId ?? c.image, 100)
          return {
            name: text(c.name, 80),
            hex: text(c.hex, 20) || undefined,
            sourceUrl: text(c.sourceUrl, 300) || undefined,
            ...(imgId ? { image: imgId } : {}),
          }
        })
        .filter((c) => Boolean(c.name))

      return {
        name: text(v.name, 120),
        year: parseIntField(v.year, 'Đời phiên bản', 1990, 2035) ?? undefined,
        listedPrice:
          parseIntField(v.listedPrice, 'Giá niêm yết phiên bản', 0, 100_000_000_000) ?? undefined,
        referenceRentPrice:
          parseIntField(v.referenceRentPrice, 'Giá thuê tham khảo phiên bản', 0, 100_000_000) ??
          undefined,
        fuelType: text(v.fuelType, 40) || undefined,
        transmission: text(v.transmission, 80) || undefined,
        driveType: text(v.driveType, 80) || undefined,
        seats: parseIntField(v.seats, 'Số chỗ phiên bản', 1, 60) ?? undefined,
        summary: text(v.summary, 300) || undefined,
        colors,
      }
    })
    .filter((v) => Boolean(v.name))
}

function sanitizeVehiclePhotos(rawPhotos: unknown, fallbackPhotoIds: unknown) {
  if (Array.isArray(rawPhotos)) {
    let primaryAssigned = false
    const validKinds = ['EXTERIOR', 'INTERIOR', 'ENGINE', 'ACTUAL'] as const
    return rawPhotos
      .slice(0, 30)
      .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
      .map((p, idx) => {
        const imageId = text(p.imageId ?? p.image, 100)
        const rawKind = text(p.kind, 20)
        const kind = validKinds.includes(rawKind as (typeof validKinds)[number])
          ? (rawKind as (typeof validKinds)[number])
          : 'ACTUAL'
        let isPrimary = Boolean(p.isPrimary)
        if (isPrimary) {
          if (primaryAssigned) isPrimary = false
          else primaryAssigned = true
        }
        return {
          image: imageId,
          kind,
          photoType: text(p.photoType, 40) || 'ACTUAL',
          isPrimary,
          sortOrder:
            typeof p.sortOrder === 'number' && Number.isFinite(p.sortOrder) ? p.sortOrder : idx,
          caption: text(p.caption, 200) || undefined,
          altText: text(p.altText, 200) || undefined,
          sourceName: text(p.sourceName, 120) || undefined,
        }
      })
      .filter((p) => Boolean(p.image))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p, idx) => ({
        ...p,
        sortOrder: idx,
        isPrimary: primaryAssigned ? p.isPrimary : idx === 0,
      }))
  }
  if (Array.isArray(fallbackPhotoIds)) {
    return fallbackPhotoIds
      .map((pid) => text(pid, 100))
      .filter(Boolean)
      .map((image, idx) => ({
        image,
        kind: 'ACTUAL' as const,
        photoType: 'ACTUAL',
        isPrimary: idx === 0,
        sortOrder: idx,
      }))
  }
  return undefined
}

export async function GET(request: Request) {
  try {
    const auth = await fleetAuth(resolveTargetModuleFromQuery(request), 'read')
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const view = sp.get('view') || 'vehicles'
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const search = (sp.get('q') || '').trim().toLowerCase()
    const status = sp.get('status') || ''
    const operationStatus = sp.get('operationStatus') || ''
    const intent = sp.get('intent') || ''
    const category = sp.get('category') || ''
    const modelId = sp.get('modelId') || ''
    const sort = sp.get('sort') || 'reference'

    if (view === 'models') {
      const modelsRes = await payload.find({
        collection: 'vehicle-models',
        user,
        overrideAccess: false,
        depth: 2,
        limit: 200,
        sort: 'sortOrder',
      })
      const vehiclesAll = await payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
      })
      const fleetByModel = new Map<
        string,
        {
          id: string
          reference: string
          version: string | null
          color: string | null
          odometer: number | null
          pricePerDay: number | null
          salePrice: number | null
          operationStatus: string
          status: string
          isDemo: boolean
        }[]
      >()
      for (const v of vehiclesAll.docs) {
        const mId = typeof v.model === 'object' && v.model ? v.model.id : v.model
        if (!mId) continue
        const list = fleetByModel.get(String(mId)) ?? []
        list.push({
          id: v.id,
          reference: v.reference,
          version: v.version ?? null,
          color: v.color ?? null,
          odometer: v.odometer ?? null,
          pricePerDay: v.pricePerDay ?? null,
          salePrice: v.salePrice ?? null,
          operationStatus: v.operationStatus ?? 'READY',
          status: v.status ?? 'ACTIVE',
          isDemo: Boolean(v.isDemo),
        })
        fleetByModel.set(String(mId), list)
      }

      const filtered = modelsRes.docs
        .filter((m) => {
          if (category && m.category !== category) return false
          if (search) {
            const hay =
              `${m.name} ${m.officialName ?? ''} ${m.brand} ${m.slug} ${m.segment ?? ''}`.toLowerCase()
            if (!hay.includes(search)) return false
          }
          return true
        })
        .map((m) => {
          const linkedVehicles = fleetByModel.get(String(m.id)) ?? []
          const mappedGallery = (m.gallery ?? [])
            .map((g, idx) => {
              const img = photo(g.image)
              const imageId = typeof g.image === 'object' && g.image ? g.image.id : g.image
              if (!img || !imageId) return null
              return {
                imageId: String(imageId),
                image: img,
                kind: g.kind,
                photoType: g.photoType ?? '',
                isPrimary: Boolean(g.isPrimary),
                sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : idx,
                altText: g.altText ?? '',
                caption: g.caption ?? '',
                variantName: g.variantName ?? '',
                colorName: g.colorName ?? '',
                sourceUrl: g.sourceUrl ?? '',
                license: g.license ?? '',
                verified: g.verified !== false,
              }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => a.sortOrder - b.sortOrder)

          return {
            id: m.id,
            name: m.name,
            officialName: m.officialName ?? '',
            modelLine: m.modelLine ?? '',
            versionName: m.versionName ?? '',
            generation: m.generation ?? '',
            slug: m.slug,
            brand: m.brand,
            category: m.category,
            subCategory: m.subCategory ?? null,
            bodyStyle: m.bodyStyle ?? '',
            segment: m.segment ?? null,
            origin: m.origin ?? null,
            modelYear: m.modelYear ?? null,
            seats: m.seats ?? null,
            fuelType: m.fuelType ?? null,
            transmission: m.transmission ?? null,
            driveType: m.driveType ?? null,
            listedPrice: m.listedPrice ?? null,
            referenceRentPrice: m.referenceRentPrice ?? null,
            defaultDepositSuggestion: m.defaultDepositSuggestion ?? null,
            suitableFor: m.suitableFor ?? '',
            usagePurpose: m.usagePurpose ?? '',
            shortDescription: m.shortDescription ?? '',
            description: m.description ?? null,
            exteriorOverview: m.exteriorOverview ?? '',
            interiorOverview: m.interiorOverview ?? '',
            engineOverview: m.engineOverview ?? '',
            highlights: (m.highlights ?? []).map((h) => h.text).filter(Boolean),
            features: (m.features ?? []).map((f) => ({
              name: f.name,
              category: f.category ?? 'COMFORT',
              status: f.status ?? 'EQUIPPED',
              variantNote: f.variantNote ?? '',
            })),
            gallery: mappedGallery,
            specifications: (m.specifications ?? []).map((s) => ({
              group: s.group ?? 'OVERVIEW',
              label: s.label,
              value: s.value,
              variantName: s.variantName ?? '',
              source: s.source ?? '',
            })),
            variants: (m.variants ?? []).map((v) => ({
              name: v.name,
              year: v.year ?? null,
              listedPrice: v.listedPrice ?? null,
              referenceRentPrice: v.referenceRentPrice ?? null,
              fuelType: v.fuelType ?? '',
              transmission: v.transmission ?? '',
              driveType: v.driveType ?? '',
              seats: v.seats ?? null,
              summary: v.summary ?? '',
              colors: (v.colors ?? []).map((c) => {
                const cImg = photo(c.image)
                const cImgId = typeof c.image === 'object' && c.image ? c.image.id : c.image
                return {
                  name: c.name,
                  hex: c.hex ?? '',
                  sourceUrl: c.sourceUrl ?? '',
                  imageId: cImgId ? String(cImgId) : null,
                  image: cImg,
                }
              }),
            })),
            source: m.source ?? null,
            verificationStatus: m.verificationStatus ?? 'VERIFIED',
            visible: Boolean(m.visible),
            featured: Boolean(m.featured),
            sortOrder: m.sortOrder ?? 0,
            updatedAt: m.updatedAt,
            cover: photo(m.cover) ?? mappedGallery[0]?.image ?? null,
            coverId: typeof m.cover === 'object' && m.cover ? m.cover.id : (m.cover ?? null),
            specsCount: (m.specifications ?? []).length,
            featuresCount: (m.features ?? []).length,
            variantsCount: (m.variants ?? []).length,
            galleryCount: mappedGallery.length,
            fleetCount: linkedVehicles.length,
            linkedVehicles,
          }
        })

      const pageSize = 12
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
      const safePage = Math.min(page, totalPages)
      return json({
        items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
        totalDocs: filtered.length,
        page: safePage,
        totalPages,
      })
    }

    const [vehiclesRes, modelsRes, bookingsRes] = await Promise.all([
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 2,
        limit: 500,
        sort: sort === '-price' ? '-pricePerDay' : sort === 'price' ? 'pricePerDay' : 'reference',
      }),
      payload.find({
        collection: 'vehicle-models',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 200,
        sort: 'sortOrder',
      }),
      adminHasPermission(auth.admin, 'bookings', 'read')
        ? payload.find({
            collection: 'bookings',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 500,
            select: {
              vehicle: true,
              status: true,
              startDate: true,
              endDate: true,
              bookingKey: true,
            },
          })
        : Promise.resolve({ docs: [] }),
    ])

    const bookingsByVehicle = new Map<
      string,
      { id: string; bookingKey: string; status: string; startDate: string; endDate: string }[]
    >()
    for (const b of bookingsRes.docs) {
      const vId = typeof b.vehicle === 'object' && b.vehicle ? b.vehicle.id : b.vehicle
      if (!vId) continue
      const arr = bookingsByVehicle.get(String(vId)) ?? []
      arr.push({
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        status: b.status ?? 'PENDING',
        startDate: b.startDate,
        endDate: b.endDate,
      })
      bookingsByVehicle.set(String(vId), arr)
    }

    const filtered = vehiclesRes.docs
      .filter((v) => {
        if (status && v.status !== status) return false
        if (operationStatus && v.operationStatus !== operationStatus) return false
        if (intent && v.intent !== intent) return false
        const mId = typeof v.model === 'object' && v.model ? v.model.id : v.model
        if (modelId && String(mId) !== modelId) return false
        if (search) {
          const mName = typeof v.model === 'object' && v.model ? v.model.name : ''
          const hay =
            `${v.reference} ${v.licensePlate ?? ''} ${mName} ${v.color ?? ''} ${v.version ?? ''}`.toLowerCase()
          if (!hay.includes(search)) return false
        }
        return true
      })
      .map((v) => ({
        id: v.id,
        reference: v.reference,
        licensePlate: v.licensePlate ?? null,
        modelId: typeof v.model === 'object' && v.model ? v.model.id : String(v.model),
        modelName: typeof v.model === 'object' && v.model ? v.model.name : 'Chưa cập nhật',
        modelSlug: typeof v.model === 'object' && v.model ? v.model.slug : '',
        category: typeof v.model === 'object' && v.model ? v.model.category : 'CAR',
        fuelType: typeof v.model === 'object' && v.model ? (v.model.fuelType ?? null) : null,
        intent: v.intent ?? 'BOTH',
        isDemo: Boolean(v.isDemo),
        vehicleConditionType: v.vehicleConditionType ?? 'USED',
        manufactureYear: v.manufactureYear ?? null,
        pricePerDay: v.pricePerDay ?? null,
        pricePerHour: v.pricePerHour ?? null,
        pricePerWeek: v.pricePerWeek ?? null,
        pricePerMonth: v.pricePerMonth ?? null,
        weekendSurcharge: v.weekendSurcharge ?? null,
        holidaySurcharge: v.holidaySurcharge ?? null,
        depositAmount: v.depositAmount ?? null,
        deliveryFee: v.deliveryFee ?? null,
        kmLimitPerDay: v.kmLimitPerDay ?? null,
        overKmFee: v.overKmFee ?? null,
        lateReturnFeePerHour: v.lateReturnFeePerHour ?? null,
        salePrice: v.salePrice ?? null,
        listedPrice: v.listedPrice ?? null,
        estimatedRollingPrice: v.estimatedRollingPrice ?? null,
        odometer: v.odometer ?? null,
        version: v.version ?? null,
        color: v.color ?? null,
        location: v.location ?? null,
        pickupLocation: v.pickupLocation ?? null,
        condition: v.condition ?? null,
        exteriorCondition: v.exteriorCondition ?? null,
        interiorCondition: v.interiorCondition ?? null,
        engineCondition: v.engineCondition ?? null,
        maintenanceHistory: v.maintenanceHistory ?? null,
        inspectedAt: v.inspectedAt ?? null,
        operationStatus: v.operationStatus ?? 'READY',
        status: v.status ?? 'ACTIVE',
        photos: (v.photos ?? [])
          .map((p, idx) => {
            const img = photo(p.image)
            const imgId = typeof p.image === 'object' && p.image ? p.image.id : p.image
            if (!img || !imgId) return null
            return {
              image: img,
              imageId: String(imgId),
              caption: p.caption ?? '',
              kind: p.kind ?? 'ACTUAL',
              photoType: p.photoType ?? 'ACTUAL',
              isPrimary: Boolean(p.isPrimary),
              sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : idx,
              altText: p.altText ?? '',
            }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => a.sortOrder - b.sortOrder),
        bookings: bookingsByVehicle.get(String(v.id)) ?? [],
      }))

    const pageSize = 15
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safePage = Math.min(page, totalPages)

    return json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      totalDocs: filtered.length,
      page: safePage,
      totalPages,
      models: modelsRes.docs.map((m) => ({
        id: m.id,
        name: m.name,
        brand: m.brand,
        category: m.category,
        fuelType: m.fuelType ?? null,
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

const MODEL_AND_VEHICLE_ALLOWLIST = [
  'entity',
  'id',
  // Vehicle instance fields
  'reference',
  'licensePlate',
  'model',
  'intent',
  'isDemo',
  'vehicleConditionType',
  'manufactureYear',
  'pricePerDay',
  'pricePerHour',
  'pricePerWeek',
  'pricePerMonth',
  'weekendSurcharge',
  'holidaySurcharge',
  'depositAmount',
  'deliveryFee',
  'kmLimitPerDay',
  'overKmFee',
  'lateReturnFeePerHour',
  'salePrice',
  'odometer',
  'version',
  'color',
  'location',
  'pickupLocation',
  'condition',
  'exteriorCondition',
  'interiorCondition',
  'engineCondition',
  'maintenanceHistory',
  'inspectedAt',
  'operationStatus',
  'status',
  'photoIds',
  'photos',
  // Vehicle model fields
  'name',
  'officialName',
  'modelLine',
  'versionName',
  'generation',
  'brand',
  'category',
  'subCategory',
  'bodyStyle',
  'segment',
  'origin',
  'modelYear',
  'seats',
  'fuelType',
  'transmission',
  'driveType',
  'listedPrice',
  'referenceRentPrice',
  'defaultDepositSuggestion',
  'suitableFor',
  'usagePurpose',
  'shortDescription',
  'description',
  'exteriorOverview',
  'interiorOverview',
  'engineOverview',
  'highlights',
  'features',
  'gallery',
  'specifications',
  'variants',
  'source',
  'verificationStatus',
  'visible',
  'featured',
  'sortOrder',
  'coverId',
]

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await fleetAuth(await resolveTargetModuleFromBody(request), 'create')
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, MODEL_AND_VEHICLE_ALLOWLIST, 65_536)

    if (data.entity === 'model') {
      const name = text(data.name, 120)
      const brand = text(data.brand, 80)
      const category = text(data.category, 20)
      if (!name || !brand || !VALID_CAT.includes(category as (typeof VALID_CAT)[number])) {
        return fail('Vui lòng nhập đầy đủ Tên dòng xe, Thương hiệu và Danh mục.')
      }
      const typedCat = category as (typeof VALID_CAT)[number]
      const rawSub = text(data.subCategory, 40)
      if (rawSub && !subCategoriesByCategory[typedCat].includes(rawSub)) {
        return fail('Phân loại kiểu dáng không phù hợp với danh mục phương tiện đã chọn.')
      }
      const rawFuel = text(data.fuelType, 40)
      if (rawFuel && !VALID_FUEL.includes(rawFuel as (typeof VALID_FUEL)[number])) {
        return fail('Loại nhiên liệu / năng lượng không hợp lệ.')
      }

      const explicitCoverId = text(data.coverId, 100) || null
      const { gallery, fallbackCoverId } = sanitizeModelGallery(data.gallery, explicitCoverId)
      const highlights = sanitizeModelHighlights(data.highlights)
      const features = sanitizeModelFeatures(data.features)
      const specifications = sanitizeModelSpecs(data.specifications)
      const variants = sanitizeModelVariants(data.variants)

      const created = await payload.create({
        collection: 'vehicle-models',
        user,
        overrideAccess: false,
        data: {
          name,
          officialName: text(data.officialName, 160) || undefined,
          modelLine: text(data.modelLine, 80) || undefined,
          versionName: text(data.versionName, 100) || undefined,
          generation: text(data.generation, 80) || undefined,
          brand,
          category: typedCat,
          subCategory: rawSub || undefined,
          bodyStyle: text(data.bodyStyle, 80) || undefined,
          segment: text(data.segment, 80) || undefined,
          origin: text(data.origin, 80) || undefined,
          modelYear: parseIntField(data.modelYear, 'Đời xe', 1990, 2035) ?? undefined,
          seats: parseIntField(data.seats, 'Số chỗ ngồi', 1, 60) ?? undefined,
          fuelType: (rawFuel || undefined) as (typeof VALID_FUEL)[number] | undefined,
          transmission: text(data.transmission, 80) || undefined,
          driveType: text(data.driveType, 80) || undefined,
          listedPrice:
            parseIntField(data.listedPrice, 'Giá niêm yết', 0, 100_000_000_000) ?? undefined,
          referenceRentPrice:
            parseIntField(data.referenceRentPrice, 'Giá thuê tham khảo', 0, 100_000_000) ??
            undefined,
          defaultDepositSuggestion:
            parseIntField(
              data.defaultDepositSuggestion,
              'Tiền đặt cọc tham khảo',
              0,
              10_000_000_000,
            ) ?? undefined,
          suitableFor: text(data.suitableFor, 200) || undefined,
          usagePurpose: text(data.usagePurpose, 200) || undefined,
          shortDescription: text(data.shortDescription, 500) || undefined,
          description: text(data.description, 3000) || undefined,
          exteriorOverview: text(data.exteriorOverview, 2000) || undefined,
          interiorOverview: text(data.interiorOverview, 2000) || undefined,
          engineOverview: text(data.engineOverview, 2000) || undefined,
          source: text(data.source, 300) || undefined,
          verificationStatus: ['VERIFIED', 'UNVERIFIED', 'DRAFT'].includes(
            text(data.verificationStatus, 20),
          )
            ? text(data.verificationStatus, 20)
            : 'VERIFIED',
          visible: data.visible !== false,
          featured: Boolean(data.featured),
          sortOrder: parseIntField(data.sortOrder, 'Thứ tự', -1000, 100_000) ?? 0,
          ...(fallbackCoverId ? { cover: fallbackCoverId } : {}),
          ...(gallery ? { gallery } : {}),
          ...(highlights ? { highlights } : {}),
          ...(features ? { features } : {}),
          ...(specifications ? { specifications } : {}),
          ...(variants ? { variants } : {}),
        } as never,
      })
      return json({ id: created.id, name: created.name, slug: created.slug }, 201)
    }

    const reference = text(data.reference, 40).toUpperCase()
    const licensePlate = text(data.licensePlate, 30).toUpperCase()
    const model = text(data.model, 100)
    const intent = text(data.intent, 20) || 'RENT'
    if (!reference || !licensePlate || !model) {
      return fail('Vui lòng nhập Mã quản lý xe, Biển số và chọn Dòng xe.')
    }
    if (!VALID_INTENT.includes(intent as (typeof VALID_INTENT)[number])) {
      return fail('Loại dịch vụ không hợp lệ.')
    }
    const photos = sanitizeVehiclePhotos(data.photos, data.photoIds)

    const created = await payload.create({
      collection: 'vehicles',
      user,
      overrideAccess: false,
      data: {
        reference,
        licensePlate,
        model,
        intent: intent as (typeof VALID_INTENT)[number],
        isDemo: data.isDemo === true,
        vehicleConditionType: data.vehicleConditionType === 'NEW' ? 'NEW' : 'USED',
        manufactureYear:
          parseIntField(data.manufactureYear, 'Năm sản xuất', 1990, 2035) ?? undefined,
        pricePerDay: parseIntField(data.pricePerDay, 'Giá thuê/ngày', 1, 100_000_000) ?? undefined,
        pricePerWeek:
          parseIntField(data.pricePerWeek, 'Giá thuê/tuần', 0, 500_000_000) ?? undefined,
        pricePerMonth:
          parseIntField(data.pricePerMonth, 'Giá thuê/tháng', 0, 2_000_000_000) ?? undefined,
        weekendSurcharge:
          parseIntField(data.weekendSurcharge, 'Phụ phí cuối tuần', 0, 50_000_000) ?? undefined,
        holidaySurcharge:
          parseIntField(data.holidaySurcharge, 'Phụ phí ngày lễ', 0, 50_000_000) ?? undefined,
        deliveryFee: parseIntField(data.deliveryFee, 'Phí giao nhận', 0, 50_000_000) ?? undefined,
        salePrice: parseIntField(data.salePrice, 'Giá bán', 1, 100_000_000_000) ?? undefined,
        depositAmount:
          parseIntField(data.depositAmount, 'Tiền đặt cọc', 0, 10_000_000_000) ?? undefined,
        odometer: parseIntField(data.odometer, 'ODO', 0, 10_000_000) ?? undefined,
        version: text(data.version, 80) || undefined,
        color: text(data.color, 60) || undefined,
        location: text(data.location, 100) || undefined,
        pickupLocation: text(data.pickupLocation, 160) || undefined,
        condition: text(data.condition, 500) || undefined,
        exteriorCondition: text(data.exteriorCondition, 200) || undefined,
        interiorCondition: text(data.interiorCondition, 200) || undefined,
        engineCondition: text(data.engineCondition, 200) || undefined,
        maintenanceHistory: text(data.maintenanceHistory, 1000) || undefined,
        operationStatus: VALID_OP.includes(
          text(data.operationStatus, 30) as (typeof VALID_OP)[number],
        )
          ? (text(data.operationStatus, 30) as (typeof VALID_OP)[number])
          : 'READY',
        status: VALID_BIZ.includes(text(data.status, 20) as (typeof VALID_BIZ)[number])
          ? (text(data.status, 20) as (typeof VALID_BIZ)[number])
          : 'ACTIVE',
        ...(photos && photos.length ? { photos } : {}),
      },
    })
    return json({ id: created.id, reference: created.reference }, 201)
  } catch (error) {
    if (error instanceof Error && error.message.includes('không hợp lệ')) {
      return fail(error.message, 400, 'VALIDATION_ERROR')
    }
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await fleetAuth(await resolveTargetModuleFromBody(request), 'update')
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, MODEL_AND_VEHICLE_ALLOWLIST, 65_536)
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã bản ghi cần cập nhật.')

    if (data.entity === 'model') {
      const existing = await payload.findByID({
        collection: 'vehicle-models',
        id,
        user,
        overrideAccess: false,
        depth: 0,
      })

      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) {
        const n = text(data.name, 120)
        if (!n) return fail('Tên dòng xe không được để trống.')
        patch.name = n
      }
      if (data.officialName !== undefined) patch.officialName = text(data.officialName, 160) || null
      if (data.modelLine !== undefined) patch.modelLine = text(data.modelLine, 80) || null
      if (data.versionName !== undefined) patch.versionName = text(data.versionName, 100) || null
      if (data.generation !== undefined) patch.generation = text(data.generation, 80) || null
      if (data.brand !== undefined) {
        const b = text(data.brand, 80)
        if (!b) return fail('Thương hiệu không được để trống.')
        patch.brand = b
      }

      let resolvedCat = existing.category
      if (data.category !== undefined) {
        const c = text(data.category, 20)
        if (!VALID_CAT.includes(c as (typeof VALID_CAT)[number]))
          return fail('Danh mục không hợp lệ.')
        resolvedCat = c as (typeof VALID_CAT)[number]
        patch.category = resolvedCat
      }
      if (data.subCategory !== undefined) {
        const sc = text(data.subCategory, 40)
        if (sc && !subCategoriesByCategory[resolvedCat].includes(sc)) {
          return fail('Phân loại kiểu dáng không phù hợp với danh mục phương tiện đã chọn.')
        }
        patch.subCategory = sc || null
      }
      if (data.bodyStyle !== undefined) patch.bodyStyle = text(data.bodyStyle, 80) || null
      if (data.segment !== undefined) patch.segment = text(data.segment, 80) || null
      if (data.origin !== undefined) patch.origin = text(data.origin, 80) || null
      if (data.modelYear !== undefined)
        patch.modelYear = parseIntField(data.modelYear, 'Đời xe', 1990, 2035)
      if (data.seats !== undefined) patch.seats = parseIntField(data.seats, 'Số chỗ ngồi', 1, 60)
      if (data.fuelType !== undefined) {
        const ft = text(data.fuelType, 40)
        if (ft && !VALID_FUEL.includes(ft as (typeof VALID_FUEL)[number])) {
          return fail('Loại nhiên liệu / năng lượng không hợp lệ.')
        }
        patch.fuelType = ft || null
      }
      if (data.transmission !== undefined) patch.transmission = text(data.transmission, 80) || null
      if (data.driveType !== undefined) patch.driveType = text(data.driveType, 80) || null
      if (data.listedPrice !== undefined)
        patch.listedPrice = parseIntField(data.listedPrice, 'Giá niêm yết', 0, 100_000_000_000)
      if (data.referenceRentPrice !== undefined)
        patch.referenceRentPrice = parseIntField(
          data.referenceRentPrice,
          'Giá thuê tham khảo',
          0,
          100_000_000,
        )
      if (data.defaultDepositSuggestion !== undefined)
        patch.defaultDepositSuggestion = parseIntField(
          data.defaultDepositSuggestion,
          'Tiền đặt cọc tham khảo',
          0,
          10_000_000_000,
        )
      if (data.suitableFor !== undefined) patch.suitableFor = text(data.suitableFor, 200) || null
      if (data.usagePurpose !== undefined) patch.usagePurpose = text(data.usagePurpose, 200) || null
      if (data.shortDescription !== undefined)
        patch.shortDescription = text(data.shortDescription, 500) || null
      if (data.description !== undefined) patch.description = text(data.description, 3000) || null
      if (data.exteriorOverview !== undefined)
        patch.exteriorOverview = text(data.exteriorOverview, 2000) || null
      if (data.interiorOverview !== undefined)
        patch.interiorOverview = text(data.interiorOverview, 2000) || null
      if (data.engineOverview !== undefined)
        patch.engineOverview = text(data.engineOverview, 2000) || null
      if (data.source !== undefined) patch.source = text(data.source, 300) || null
      if (data.visible !== undefined) patch.visible = Boolean(data.visible)
      if (data.featured !== undefined) patch.featured = Boolean(data.featured)
      if (data.sortOrder !== undefined)
        patch.sortOrder = parseIntField(data.sortOrder, 'Thứ tự', -1000, 100_000) ?? 0
      if (data.verificationStatus !== undefined) {
        const vs = text(data.verificationStatus, 20)
        if (['VERIFIED', 'UNVERIFIED', 'DRAFT'].includes(vs)) patch.verificationStatus = vs
      }

      if (data.gallery !== undefined || data.coverId !== undefined) {
        const explicitCover =
          data.coverId !== undefined
            ? text(data.coverId, 100) || null
            : typeof existing.cover === 'object' && existing.cover
              ? existing.cover.id
              : (existing.cover ?? null)
        if (data.gallery !== undefined) {
          const { gallery, fallbackCoverId } = sanitizeModelGallery(data.gallery, explicitCover)
          patch.gallery = gallery
          patch.cover = fallbackCoverId || null
        } else {
          patch.cover = explicitCover
        }
      }

      if (data.highlights !== undefined) patch.highlights = sanitizeModelHighlights(data.highlights)
      if (data.features !== undefined) patch.features = sanitizeModelFeatures(data.features)
      if (data.specifications !== undefined)
        patch.specifications = sanitizeModelSpecs(data.specifications)
      if (data.variants !== undefined) patch.variants = sanitizeModelVariants(data.variants)

      const updated = await payload.update({
        collection: 'vehicle-models',
        id,
        user,
        overrideAccess: false,
        data: patch,
      })
      return json({ id: updated.id, name: updated.name, slug: updated.slug })
    }

    const patch: Record<string, unknown> = {}
    if (data.intent !== undefined) {
      const i = text(data.intent, 20)
      if (!VALID_INTENT.includes(i as (typeof VALID_INTENT)[number]))
        return fail('Loại dịch vụ không hợp lệ.')
      patch.intent = i
    }
    if (data.operationStatus !== undefined) {
      const op = text(data.operationStatus, 30)
      if (!VALID_OP.includes(op as (typeof VALID_OP)[number]))
        return fail('Trạng thái vận hành không hợp lệ.')
      patch.operationStatus = op
    }
    if (data.status !== undefined) {
      const st = text(data.status, 20)
      if (!VALID_BIZ.includes(st as (typeof VALID_BIZ)[number]))
        return fail('Trạng thái kinh doanh không hợp lệ.')
      patch.status = st
    }
    if (data.isDemo !== undefined) patch.isDemo = Boolean(data.isDemo)
    if (data.manufactureYear !== undefined)
      patch.manufactureYear = parseIntField(data.manufactureYear, 'Năm sản xuất', 1990, 2035)
    if (data.pricePerDay !== undefined)
      patch.pricePerDay = parseIntField(data.pricePerDay, 'Giá thuê/ngày', 1, 100_000_000)
    if (data.pricePerWeek !== undefined)
      patch.pricePerWeek = parseIntField(data.pricePerWeek, 'Giá thuê/tuần', 0, 500_000_000)
    if (data.pricePerMonth !== undefined)
      patch.pricePerMonth = parseIntField(data.pricePerMonth, 'Giá thuê/tháng', 0, 2_000_000_000)
    if (data.weekendSurcharge !== undefined)
      patch.weekendSurcharge = parseIntField(
        data.weekendSurcharge,
        'Phụ phí cuối tuần',
        0,
        50_000_000,
      )
    if (data.holidaySurcharge !== undefined)
      patch.holidaySurcharge = parseIntField(
        data.holidaySurcharge,
        'Phụ phí ngày lễ',
        0,
        50_000_000,
      )
    if (data.deliveryFee !== undefined)
      patch.deliveryFee = parseIntField(data.deliveryFee, 'Phí giao nhận', 0, 50_000_000)
    if (data.salePrice !== undefined)
      patch.salePrice = parseIntField(data.salePrice, 'Giá bán', 1, 100_000_000_000)
    if (data.depositAmount !== undefined)
      patch.depositAmount = parseIntField(data.depositAmount, 'Tiền đặt cọc', 0, 10_000_000_000)
    if (data.odometer !== undefined)
      patch.odometer = parseIntField(data.odometer, 'ODO', 0, 10_000_000)
    if (data.version !== undefined) patch.version = text(data.version, 80) || null
    if (data.color !== undefined) patch.color = text(data.color, 60) || null
    if (data.location !== undefined) patch.location = text(data.location, 100) || null
    if (data.pickupLocation !== undefined)
      patch.pickupLocation = text(data.pickupLocation, 160) || null
    if (data.condition !== undefined) patch.condition = text(data.condition, 500) || null
    if (data.exteriorCondition !== undefined)
      patch.exteriorCondition = text(data.exteriorCondition, 200) || null
    if (data.interiorCondition !== undefined)
      patch.interiorCondition = text(data.interiorCondition, 200) || null
    if (data.engineCondition !== undefined)
      patch.engineCondition = text(data.engineCondition, 200) || null
    if (data.maintenanceHistory !== undefined)
      patch.maintenanceHistory = text(data.maintenanceHistory, 1000) || null
    if (data.inspectedAt !== undefined) patch.inspectedAt = text(data.inspectedAt, 40) || null

    if (data.photos !== undefined || data.photoIds !== undefined) {
      patch.photos = sanitizeVehiclePhotos(data.photos, data.photoIds) ?? []
    }

    if (!Object.keys(patch).length) return fail('Không có thay đổi để cập nhật.')
    const updated = await payload.update({
      collection: 'vehicles',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })
    return json({
      id: updated.id,
      operationStatus: updated.operationStatus,
      status: updated.status,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('không hợp lệ')) {
      return fail(error.message, 400, 'VALIDATION_ERROR')
    }
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await fleetAuth(resolveTargetModuleFromQuery(request), 'delete')
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const entity = sp.get('entity') || 'vehicle'
    const id = sp.get('id') || ''
    if (!id) return fail('Thiếu mã bản ghi cần xóa.')

    if (entity === 'model') {
      const linked = await payload.count({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        where: { model: { equals: id } },
      })
      if (linked.totalDocs > 0) {
        return fail(
          'Không thể xóa dòng xe đang có xe thực tế liên kết. Hãy ẩn dòng xe hoặc xóa/chuyển xe trước.',
          409,
          'CONFLICT',
        )
      }
      await payload.delete({ collection: 'vehicle-models', id, user, overrideAccess: false })
      return json({ deleted: true, id })
    }

    await payload.delete({ collection: 'vehicles', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
