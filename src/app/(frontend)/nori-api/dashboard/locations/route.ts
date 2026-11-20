import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  SERVICE_LOCATION_TYPES,
  normalizeCode,
  validateNonNegativeVnd,
  type ServiceLocationType,
} from '@/lib/multi-branch-rules'
import { relationId, validateTimeString } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['locations', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const branchId = sp.get('branchId')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()
    if (branchId) {
      const deny = assertBranchScopeOrFail(admin, branchId)
      if (deny) return deny
    }

    const [locsRes, branchesRes, warehousesRes] = await Promise.all([
      payload.find({
        collection: 'service-locations',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: 'code',
        ...(branchId ? { where: { branch: { equals: branchId } } } : {}),
      }),
      payload.find({
        collection: 'branches',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 200,
        sort: 'name',
      }),
      payload.find({
        collection: 'warehouses',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        where: { isCustomerFacing: { equals: true } },
      }),
    ])

    const items = locsRes.docs
      .filter((loc) => {
        if (!q) return true
        const bName = typeof loc.branch === 'object' && loc.branch ? loc.branch.name : ''
        return `${loc.code} ${loc.name} ${loc.address} ${bName}`.toLowerCase().includes(q)
      })
      .map((loc) => ({
        id: String(loc.id),
        code: loc.code,
        name: loc.name,
        branchId: relationId(loc.branch) ?? '',
        branchName: typeof loc.branch === 'object' && loc.branch ? loc.branch.name : '',
        warehouseId: relationId(loc.warehouse) ?? null,
        locationType: loc.locationType,
        address: loc.address,
        province: loc.province ?? '',
        ward: loc.ward ?? '',
        latitude: loc.latitude ?? null,
        longitude: loc.longitude ?? null,
        operatingHours: loc.operatingHours ?? '',
        openTime: loc.openTime ?? '07:30',
        closeTime: loc.closeTime ?? '21:00',
        pickupInstructions: loc.pickupInstructions ?? '',
        returnInstructions: loc.returnInstructions ?? '',
        supportsPickup: loc.supportsPickup !== false,
        supportsReturn: loc.supportsReturn !== false,
        supportsHomeDelivery: Boolean(loc.supportsHomeDelivery),
        supportsHomePickup: Boolean(loc.supportsHomePickup),
        supportedCategories: loc.supportedCategories ?? 'CAR,MOTORBIKE,PICKUP',
        surchargeFee: loc.surchargeFee ?? null,
        verified: loc.verified !== false,
        status: loc.status,
      }))

    return json({
      items,
      branches: branchesRes.docs.map((b) => ({
        id: String(b.id),
        code: b.code,
        name: b.name,
        status: b.status,
      })),
      customerWarehouses: warehousesRes.docs.map((w) => ({
        id: String(w.id),
        code: w.code,
        name: w.name,
        branchId: relationId(w.branch) ?? '',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

const LOCATION_ALLOWLIST = [
  'id',
  'code',
  'name',
  'branchId',
  'warehouseId',
  'locationType',
  'address',
  'province',
  'ward',
  'latitude',
  'longitude',
  'operatingHours',
  'openTime',
  'closeTime',
  'pickupInstructions',
  'returnInstructions',
  'supportsPickup',
  'supportsReturn',
  'supportsHomeDelivery',
  'supportsHomePickup',
  'supportedCategories',
  'surchargeFee',
  'verified',
  'status',
]

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['locations', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, LOCATION_ALLOWLIST)
    const code = normalizeCode(text(data.code, 32), 32)
    const name = text(data.name, 160)
    const branchId = text(data.branchId, 100)
    const address = text(data.address, 300)
    if (!code || !name || !branchId || !address) {
      return fail('Vui lòng nhập đầy đủ Mã địa điểm, Tên điểm giao nhận, Chi nhánh và Địa chỉ.')
    }
    const deny = assertBranchScopeOrFail(admin, branchId)
    if (deny) return deny

    const openTime = text(data.openTime, 5) || '07:30'
    const closeTime = text(data.closeTime, 5) || '21:00'
    if (!validateTimeString(openTime) || !validateTimeString(closeTime)) {
      return fail('Giờ mở cửa / đóng cửa phải theo định dạng HH:MM.')
    }
    const feeCheck = validateNonNegativeVnd(data.surchargeFee, 'Phụ phí địa điểm')
    if (!feeCheck.valid) return fail(feeCheck.error!)

    const dup = await payload.find({
      collection: 'service-locations',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { code: { equals: code } },
    })
    if (dup.docs.length > 0) return fail(`Mã địa điểm "${code}" đã tồn tại.`, 409)

    const locationType = SERVICE_LOCATION_TYPES.includes(
      String(data.locationType) as ServiceLocationType,
    )
      ? (data.locationType as ServiceLocationType)
      : 'BRANCH'

    const created = await payload.create({
      collection: 'service-locations',
      user,
      overrideAccess: false,
      data: {
        code,
        name,
        branch: branchId,
        warehouse: text(data.warehouseId, 100) || undefined,
        locationType,
        address,
        province: text(data.province, 100) || undefined,
        ward: text(data.ward, 100) || undefined,
        latitude:
          data.latitude !== undefined && data.latitude !== '' && data.latitude !== null
            ? Number(data.latitude)
            : undefined,
        longitude:
          data.longitude !== undefined && data.longitude !== '' && data.longitude !== null
            ? Number(data.longitude)
            : undefined,
        operatingHours: text(data.operatingHours, 160) || `${openTime} – ${closeTime}`,
        openTime,
        closeTime,
        pickupInstructions: text(data.pickupInstructions, 1000) || undefined,
        returnInstructions: text(data.returnInstructions, 1000) || undefined,
        supportsPickup: data.supportsPickup !== false,
        supportsReturn: data.supportsReturn !== false,
        supportsHomeDelivery: Boolean(data.supportsHomeDelivery),
        supportsHomePickup: Boolean(data.supportsHomePickup),
        supportedCategories: text(data.supportedCategories, 80) || 'CAR,MOTORBIKE,PICKUP',
        surchargeFee: feeCheck.value,
        verified: data.verified !== false,
        status: (['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED'].includes(String(data.status))
          ? data.status
          : 'ACTIVE') as 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED',
      },
    })
    return json({ id: created.id, code: created.code, name: created.name }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['locations', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, LOCATION_ALLOWLIST)
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã điểm giao nhận.')

    const current = await payload.findByID({
      collection: 'service-locations',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })
    const deny = assertBranchScopeOrFail(admin, relationId(current.branch))
    if (deny) return deny

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = text(data.name, 160)
    if (data.address !== undefined) patch.address = text(data.address, 300)
    if (data.province !== undefined) patch.province = text(data.province, 100) || null
    if (data.ward !== undefined) patch.ward = text(data.ward, 100) || null
    if (
      data.locationType !== undefined &&
      SERVICE_LOCATION_TYPES.includes(String(data.locationType) as ServiceLocationType)
    ) {
      patch.locationType = data.locationType
    }
    if (data.operatingHours !== undefined)
      patch.operatingHours = text(data.operatingHours, 160) || null
    if (data.openTime !== undefined) patch.openTime = text(data.openTime, 5)
    if (data.closeTime !== undefined) patch.closeTime = text(data.closeTime, 5)
    if (data.pickupInstructions !== undefined)
      patch.pickupInstructions = text(data.pickupInstructions, 1000) || null
    if (data.returnInstructions !== undefined)
      patch.returnInstructions = text(data.returnInstructions, 1000) || null
    if (data.supportsPickup !== undefined) patch.supportsPickup = Boolean(data.supportsPickup)
    if (data.supportsReturn !== undefined) patch.supportsReturn = Boolean(data.supportsReturn)
    if (data.supportsHomeDelivery !== undefined)
      patch.supportsHomeDelivery = Boolean(data.supportsHomeDelivery)
    if (data.supportsHomePickup !== undefined)
      patch.supportsHomePickup = Boolean(data.supportsHomePickup)
    if (data.supportedCategories !== undefined)
      patch.supportedCategories = text(data.supportedCategories, 80)
    if (data.surchargeFee !== undefined) {
      const check = validateNonNegativeVnd(data.surchargeFee, 'Phụ phí địa điểm')
      if (!check.valid) return fail(check.error!)
      patch.surchargeFee = check.value ?? null
    }
    if (data.verified !== undefined) patch.verified = Boolean(data.verified)
    if (
      data.status !== undefined &&
      ['ACTIVE', 'INACTIVE', 'TEMPORARILY_CLOSED'].includes(String(data.status))
    ) {
      patch.status = data.status
    }

    const updated = await payload.update({
      collection: 'service-locations',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['locations', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth
    const id = new URL(request.url).searchParams.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã điểm giao nhận cần xóa.')
    await payload.delete({ collection: 'service-locations', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
