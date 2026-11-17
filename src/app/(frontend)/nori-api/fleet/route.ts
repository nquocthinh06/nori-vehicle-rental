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
    if (!model && !id) return fail('Vui lòng chọn dòng xe.')
    const where: Where = id ? { id: { equals: id } } : { model: { equals: model } }
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'vehicles',
      overrideAccess: false,
      where,
      depth: 1,
      limit: 100,
    })
    const data: FleetView[] = result.docs.map((vehicle) => ({
      id: vehicle.id,
      reference: vehicle.reference,
      modelId: typeof vehicle.model === 'object' ? vehicle.model.id : vehicle.model,
      modelName: typeof vehicle.model === 'object' ? vehicle.model.name : 'Chưa cập nhật',
      modelSlug: typeof vehicle.model === 'object' ? vehicle.model.slug : '',
      intent: vehicle.intent,
      pricePerDay: vehicle.pricePerDay ?? null,
      salePrice: vehicle.salePrice ?? null,
      odometer: vehicle.odometer ?? null,
      condition: vehicle.condition ?? null,
      inspectedAt: vehicle.inspectedAt ?? null,
      color: vehicle.color ?? null,
      version: vehicle.version ?? null,
      photos: (vehicle.photos ?? []).flatMap((p) => {
        const image = photo(p.image)
        return image ? [{ image, caption: p.caption ?? null, kind: p.kind ?? null }] : []
      }),
    }))
    return json(data)
  } catch (error) {
    return apiError(error)
  }
}
