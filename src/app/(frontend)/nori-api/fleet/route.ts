import { unstable_cache } from 'next/cache'
import type { Where } from 'payload'
import { getPayloadClient } from '@/lib/payload'
import { photo } from '@/lib/catalogue'
import type { FleetView } from '@/lib/domain-types'
import { apiError, createRequestLogger, fail, json } from '@/lib/api-utils'

async function queryFleetData(params: {
  id: string | null
  model: string | null
  modelSlug: string | null
  branchId: string | null
}): Promise<FleetView[]> {
  const payload = await getPayloadClient()
  const { id, model, modelSlug, branchId } = params
  let resolvedModelId = model
  const modelMetaMap = new Map<string, { id: string; name: string; slug: string }>()

  if (modelSlug || (model && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(model))) {
    const slugToLookup = modelSlug || model
    const modelDoc = await payload.find({
      collection: 'vehicle-models',
      overrideAccess: false,
      where: { slug: { equals: slugToLookup } },
      limit: 1,
      depth: 0,
      select: { name: true, slug: true },
    })
    if (modelDoc.docs[0]) {
      resolvedModelId = modelDoc.docs[0].id
      modelMetaMap.set(String(modelDoc.docs[0].id), {
        id: String(modelDoc.docs[0].id),
        name: modelDoc.docs[0].name,
        slug: modelDoc.docs[0].slug,
      })
    }
  }

  const where: Where = id
    ? { id: { equals: id } }
    : branchId
      ? {
          and: [
            ...(resolvedModelId ? [{ model: { equals: resolvedModelId } }] : []),
            { currentBranch: { equals: branchId } },
          ],
        }
      : { model: { equals: resolvedModelId } }
  const result = await payload.find({
    collection: 'vehicles',
    overrideAccess: false,
    where,
    sort: 'reference',
    depth: 0,
    limit: 100,
  })

  if (result.docs.length === 0) return []

  const missingModelIds = [
    ...new Set(
      result.docs
        .map((v) => (typeof v.model === 'object' && v.model ? v.model.id : v.model))
        .map((mId) => (mId ? String(mId) : ''))
        .filter((mId) => mId && !modelMetaMap.has(mId)),
    ),
  ]

  const mediaIds = [
    ...new Set(
      result.docs.flatMap((v) =>
        (v.photos ?? [])
          .map((p) => (typeof p.image === 'object' && p.image ? p.image.id : p.image))
          .filter((imgId): imgId is string => typeof imgId === 'string' && imgId.length > 0),
      ),
    ),
  ]

  const branchIds = [
    ...new Set(
      result.docs.flatMap((v) =>
        [v.managingBranch, v.currentBranch]
          .map((b) => (typeof b === 'object' && b ? b.id : b))
          .filter((bId): bId is string => typeof bId === 'string' && bId.length > 0),
      ),
    ),
  ]

  const [missingModelsRes, mediaRes, branchesRes] = await Promise.all([
    missingModelIds.length
      ? payload.find({
          collection: 'vehicle-models',
          overrideAccess: false,
          depth: 0,
          limit: missingModelIds.length,
          where: { id: { in: missingModelIds } },
          select: { name: true, slug: true },
        })
      : Promise.resolve({ docs: [] }),
    mediaIds.length
      ? payload.find({
          collection: 'media',
          overrideAccess: false,
          depth: 0,
          limit: Math.max(mediaIds.length, 200),
          where: { id: { in: mediaIds } },
          select: {
            url: true,
            alt: true,
            width: true,
            height: true,
            filename: true,
            filesize: true,
            mimeType: true,
            focalX: true,
            focalY: true,
            sourceUrl: true,
            sourceName: true,
            license: true,
            mediaCategory: true,
            colorName: true,
            variantName: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve({ docs: [] }),
    branchIds.length
      ? payload.find({
          collection: 'branches',
          overrideAccess: true,
          depth: 0,
          limit: branchIds.length,
          where: { id: { in: branchIds } },
          select: { name: true },
        })
      : Promise.resolve({ docs: [] }),
  ])

  for (const m of missingModelsRes.docs) {
    modelMetaMap.set(String(m.id), { id: String(m.id), name: m.name, slug: m.slug })
  }
  const mediaMap = new Map(mediaRes.docs.map((m) => [String(m.id), m]))
  const branchNameMap = new Map(branchesRes.docs.map((b) => [String(b.id), b.name]))

  return result.docs.map((vehicle) => {
    const rawModelId =
      typeof vehicle.model === 'object' && vehicle.model ? vehicle.model.id : vehicle.model
    const modelMeta = modelMetaMap.get(String(rawModelId ?? ''))

    const mappedPhotos = (vehicle.photos ?? [])
      .map((p, idx) => {
        const resolvedMedia =
          typeof p.image === 'object' && p.image
            ? p.image
            : typeof p.image === 'string'
              ? mediaMap.get(p.image)
              : null
        const image = photo(resolvedMedia ?? null)
        if (!image) return null
        if (p.altText && p.altText.trim()) {
          image.alt = p.altText.trim()
        }
        return {
          image,
          caption: p.caption ?? null,
          kind: p.kind ?? null,
          photoType: p.photoType ?? null,
          isPrimary: Boolean(p.isPrimary),
          sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : idx,
          altText: p.altText ?? null,
          sourceName: p.sourceName ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
        return a.sortOrder - b.sortOrder
      })

    return {
      id: vehicle.id,
      reference: vehicle.reference,
      modelId: modelMeta?.id ?? String(rawModelId ?? ''),
      modelName: modelMeta?.name ?? 'Chưa cập nhật',
      modelSlug: modelMeta?.slug ?? '',
      intent: vehicle.intent,
      isDemo: Boolean(vehicle.isDemo ?? true),
      vehicleConditionType: vehicle.vehicleConditionType === 'NEW' ? 'NEW' : 'USED',
      manufactureYear: vehicle.manufactureYear ?? null,
      pricePerDay: vehicle.pricePerDay ?? null,
      pricePerHour: vehicle.pricePerHour ?? null,
      pricePerWeek: vehicle.pricePerWeek ?? null,
      pricePerMonth: vehicle.pricePerMonth ?? null,
      weekendSurcharge: vehicle.weekendSurcharge ?? null,
      holidaySurcharge: vehicle.holidaySurcharge ?? null,
      depositAmount: vehicle.depositAmount ?? null,
      deliveryFee: vehicle.deliveryFee ?? null,
      kmLimitPerDay: vehicle.kmLimitPerDay ?? null,
      overKmFee: vehicle.overKmFee ?? null,
      lateReturnFeePerHour: vehicle.lateReturnFeePerHour ?? null,
      salePrice: vehicle.salePrice ?? null,
      listedPrice: vehicle.listedPrice ?? null,
      discountPrice: vehicle.discountPrice ?? null,
      reservationDeposit: vehicle.reservationDeposit ?? null,
      estimatedRollingPrice: vehicle.estimatedRollingPrice ?? null,
      negotiable: Boolean(vehicle.negotiable),
      warrantyPolicy: vehicle.warrantyPolicy ?? null,
      priceSourceNote: vehicle.priceSourceNote ?? null,
      odometer: vehicle.odometer ?? null,
      condition: vehicle.condition ?? null,
      exteriorCondition: vehicle.exteriorCondition ?? null,
      interiorCondition: vehicle.interiorCondition ?? null,
      engineCondition: vehicle.engineCondition ?? null,
      maintenanceHistory: vehicle.maintenanceHistory ?? null,
      inspectedAt: vehicle.inspectedAt ?? null,
      color: vehicle.color ?? null,
      version: vehicle.version ?? null,
      location: vehicle.location ?? null,
      pickupLocation: vehicle.pickupLocation ?? null,
      managingBranchId:
        typeof vehicle.managingBranch === 'object' && vehicle.managingBranch
          ? vehicle.managingBranch.id
          : (vehicle.managingBranch ?? null),
      managingBranchName: (() => {
        const bId =
          typeof vehicle.managingBranch === 'object' && vehicle.managingBranch
            ? vehicle.managingBranch.id
            : vehicle.managingBranch
        return bId ? (branchNameMap.get(String(bId)) ?? null) : null
      })(),
      currentBranchId:
        typeof vehicle.currentBranch === 'object' && vehicle.currentBranch
          ? vehicle.currentBranch.id
          : (vehicle.currentBranch ?? null),
      currentBranchName: (() => {
        const bId =
          typeof vehicle.currentBranch === 'object' && vehicle.currentBranch
            ? vehicle.currentBranch.id
            : vehicle.currentBranch
        return bId ? (branchNameMap.get(String(bId)) ?? null) : null
      })(),
      currentWarehouseId:
        typeof vehicle.currentWarehouse === 'object' && vehicle.currentWarehouse
          ? vehicle.currentWarehouse.id
          : (vehicle.currentWarehouse ?? null),
      allocationStatus: vehicle.allocationStatus ?? 'UNALLOCATED',
      operationStatus: vehicle.operationStatus ?? 'READY',
      photos: mappedPhotos,
    }
  })
}

function getCachedFleetData(params: {
  id: string | null
  model: string | null
  modelSlug: string | null
  branchId: string | null
}) {
  const key = JSON.stringify({
    id: params.id ?? '',
    model: params.model ?? '',
    modelSlug: params.modelSlug ?? '',
    branchId: params.branchId ?? '',
  })
  return unstable_cache(() => queryFleetData(params), ['nori-fleet-v2', key], {
    tags: ['nori-catalogue', 'nori-branches'],
  })()
}

export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/fleet', request)
  try {
    const query = new URL(request.url).searchParams
    const model = query.get('model')
    const id = query.get('id')
    const modelSlug = query.get('modelSlug')
    const branchId = query.get('branchId')
    if (!model && !id && !modelSlug && !branchId) return fail('Vui lòng chọn dòng xe.')
    const data = await logger.time('fleet_cache', () =>
      getCachedFleetData({ id, model, modelSlug, branchId }),
    )
    logger.logSuccess(200, { count: data.length })
    return json(data, 200, {
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      ...logger.responseHeaders(),
    })
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/fleet' })
  }
}
