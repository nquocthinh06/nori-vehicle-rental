import { unstable_cache } from 'next/cache'
import { getPayloadClient } from '@/lib/payload'
import { apiError, createRequestLogger } from '@/lib/api-utils'
import { relationId } from '@/lib/rental-rules'
import type { PublicLocationsPayload } from '@/lib/domain-types'

const getPublicLocationsCached = unstable_cache(
  async (): Promise<PublicLocationsPayload> => {
    const payload = await getPayloadClient()
    const [branchesRes, locationsRes, zonesRes, oneWayRes] = await Promise.all([
      payload.find({
        collection: 'branches',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        sort: 'name',
        where: { status: { equals: 'ACTIVE' } },
      }),
      payload.find({
        collection: 'service-locations',
        overrideAccess: true,
        depth: 0,
        limit: 500,
        sort: 'name',
        where: {
          and: [{ status: { equals: 'ACTIVE' } }, { verified: { equals: true } }],
        },
      }),
      payload.find({
        collection: 'delivery-zones',
        overrideAccess: true,
        depth: 0,
        limit: 500,
        sort: 'name',
        where: { active: { equals: true } },
      }),
      payload.find({
        collection: 'one-way-rental-rules',
        overrideAccess: true,
        depth: 0,
        limit: 500,
        where: {
          and: [{ active: { equals: true } }, { allowed: { equals: true } }],
        },
      }),
    ])

    const activeBranchMap = new Map<string, string>()
    const branches = branchesRes.docs.map((b) => {
      activeBranchMap.set(String(b.id), b.name)
      return {
        id: String(b.id),
        code: b.code,
        name: b.name,
        province: b.province,
        ward: b.ward ?? null,
        address: b.address,
        hotline: b.hotline ?? null,
        operatingHoursLabel: b.operatingHoursLabel ?? null,
        workStartTime: b.workStartTime ?? '07:30',
        workEndTime: b.workEndTime ?? '21:00',
        supportsHomeDelivery: Boolean(b.supportsHomeDelivery),
        supportsHomePickup: Boolean(b.supportsHomePickup),
        deliveryStartTime: b.deliveryStartTime ?? '08:00',
        deliveryEndTime: b.deliveryEndTime ?? '20:00',
        defaultDeliveryFee: b.defaultDeliveryFee ?? null,
        defaultPickupFee: b.defaultPickupFee ?? null,
        afterHoursFee: b.afterHoursFee ?? null,
        freeDeliveryMinOrder: b.freeDeliveryMinOrder ?? null,
        status: b.status,
      }
    })

    const locations = locationsRes.docs
      .filter((loc) => {
        const bId = relationId(loc.branch)
        return Boolean(bId && activeBranchMap.has(String(bId)))
      })
      .map((loc) => {
        const bId = String(relationId(loc.branch))
        return {
          id: String(loc.id),
          code: loc.code,
          name: loc.name,
          branchId: bId,
          branchName: activeBranchMap.get(bId) ?? '',
          locationType: loc.locationType,
          address: loc.address,
          province: loc.province ?? null,
          operatingHours: loc.operatingHours ?? null,
          openTime: loc.openTime ?? '07:30',
          closeTime: loc.closeTime ?? '21:00',
          pickupInstructions: loc.pickupInstructions ?? null,
          returnInstructions: loc.returnInstructions ?? null,
          supportsPickup: loc.supportsPickup !== false,
          supportsReturn: loc.supportsReturn !== false,
          supportsHomeDelivery: Boolean(loc.supportsHomeDelivery),
          supportsHomePickup: Boolean(loc.supportsHomePickup),
          supportedCategories: String(loc.supportedCategories ?? 'CAR,MOTORBIKE,PICKUP')
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          surchargeFee: loc.surchargeFee ?? null,
        }
      })

    const deliveryZones = zonesRes.docs
      .filter((z) => {
        const bId = relationId(z.branch)
        return Boolean(bId && activeBranchMap.has(String(bId)))
      })
      .map((z) => ({
        id: String(z.id),
        code: z.code,
        name: z.name,
        branchId: String(relationId(z.branch)),
        province: z.province,
        wards: z.wards ?? null,
        deliveryFee: z.deliveryFee ?? 0,
        pickupFee: z.pickupFee ?? 0,
        afterHoursFee: z.afterHoursFee ?? 0,
        freeOverOrderAmount: z.freeOverOrderAmount ?? null,
        serviceStartTime: z.serviceStartTime ?? '08:00',
        serviceEndTime: z.serviceEndTime ?? '20:00',
      }))

    const oneWayRules = oneWayRes.docs
      .filter((r) => {
        const fId = relationId(r.fromBranch)
        const tId = relationId(r.toBranch)
        return Boolean(
          fId && tId && activeBranchMap.has(String(fId)) && activeBranchMap.has(String(tId)),
        )
      })
      .map((r) => ({
        id: String(r.id),
        fromBranchId: String(relationId(r.fromBranch)),
        toBranchId: String(relationId(r.toBranch)),
        vehicleCategory: r.vehicleCategory ?? 'ALL',
        allowed: r.allowed !== false,
        fee: r.fee ?? 0,
        minRentalDays: r.minRentalDays ?? 1,
      }))

    return { branches, locations, deliveryZones, oneWayRules }
  },
  ['nori-public-locations-v1'],
  { tags: ['nori-branches', 'nori-catalogue'] },
)

export async function GET(request: Request) {
  const logger = createRequestLogger('nori-api/locations', request)
  try {
    const sp = new URL(request.url).searchParams
    const branchId = sp.get('branchId')?.trim() || ''
    const province = sp.get('province')?.trim().toLowerCase() || ''
    const data = await logger.time('locations_cache', () => getPublicLocationsCached())
    const branches = data.branches.filter(
      (b) =>
        (!branchId || b.id === branchId) &&
        (!province || b.province.toLowerCase().includes(province)),
    )
    const allowedIds = new Set(branches.map((b) => b.id))
    logger.logSuccess(200, { branches: branches.length })
    return Response.json(
      {
        success: true,
        data: {
          branches,
          locations: data.locations.filter((l) => allowedIds.has(l.branchId)),
          deliveryZones: data.deliveryZones.filter((z) => allowedIds.has(z.branchId)),
          oneWayRules: data.oneWayRules,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
          ...logger.responseHeaders(),
        },
      },
    )
  } catch (error) {
    return apiError(error, { logger, route: 'nori-api/locations' })
  }
}
