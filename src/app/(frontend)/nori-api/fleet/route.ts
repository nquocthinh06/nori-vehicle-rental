import { getPayloadClient } from '@/lib/payload'
import { photo } from '@/lib/catalogue'
import type { FleetView } from '@/lib/domain-types'
import { apiError, fail, json } from '@/lib/api-utils'
import type { Where } from 'payload'

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams
    const model = query.get('model')
    const id = query.get('id')
    const modelSlug = query.get('modelSlug')
    if (!model && !id && !modelSlug) return fail('Vui lòng chọn dòng xe.')
    const payload = await getPayloadClient()
    let resolvedModelId = model
    if (modelSlug || (model && !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(model))) {
      const slugToLookup = modelSlug || model
      const modelDoc = await payload.find({
        collection: 'vehicle-models',
        where: { slug: { equals: slugToLookup } },
        limit: 1,
        depth: 0,
      })
      if (modelDoc.docs[0]) {
        resolvedModelId = modelDoc.docs[0].id
      }
    }
    const where: Where = id ? { id: { equals: id } } : { model: { equals: resolvedModelId } }
    const result = await payload.find({
      collection: 'vehicles',
      overrideAccess: false,
      where,
      sort: 'reference',
      depth: 1,
      limit: 100,
    })
    const data: FleetView[] = result.docs.map((vehicle) => {
      const mappedPhotos = (vehicle.photos ?? [])
        .map((p, idx) => {
          const image = photo(p.image)
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
        modelId: typeof vehicle.model === 'object' ? vehicle.model.id : vehicle.model,
        modelName: typeof vehicle.model === 'object' ? vehicle.model.name : 'Chưa cập nhật',
        modelSlug: typeof vehicle.model === 'object' ? vehicle.model.slug : '',
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
        operationStatus: vehicle.operationStatus ?? 'READY',
        photos: mappedPhotos,
      }
    })
    return json(data)
  } catch (error) {
    return apiError(error)
  }
}
