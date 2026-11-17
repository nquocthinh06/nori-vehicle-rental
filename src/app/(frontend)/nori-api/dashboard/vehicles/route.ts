import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'

const VALID_OP = ['READY', 'RENTED', 'RESERVED', 'MAINTENANCE', 'SOLD', 'INACTIVE'] as const
const VALID_BIZ = ['ACTIVE', 'INACTIVE'] as const
const VALID_INTENT = ['RENT', 'SALE', 'BOTH'] as const
const VALID_CAT = ['CAR', 'MOTORBIKE', 'PICKUP'] as const

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

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
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
        depth: 1,
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
      const countByModel = new Map<string, number>()
      for (const v of vehiclesAll.docs) {
        const mId = typeof v.model === 'object' && v.model ? v.model.id : v.model
        if (mId) countByModel.set(String(mId), (countByModel.get(String(mId)) ?? 0) + 1)
      }
      const filtered = modelsRes.docs
        .filter((m) => {
          if (category && m.category !== category) return false
          if (search) {
            const hay = `${m.name} ${m.brand} ${m.slug} ${m.segment ?? ''}`.toLowerCase()
            if (!hay.includes(search)) return false
          }
          return true
        })
        .map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          brand: m.brand,
          category: m.category,
          subCategory: m.subCategory ?? null,
          segment: m.segment ?? null,
          origin: m.origin ?? null,
          modelYear: m.modelYear ?? null,
          seats: m.seats ?? null,
          fuelType: m.fuelType ?? null,
          transmission: m.transmission ?? null,
          driveType: m.driveType ?? null,
          listedPrice: m.listedPrice ?? null,
          referenceRentPrice: m.referenceRentPrice ?? null,
          description: m.description ?? null,
          source: m.source ?? null,
          verificationStatus: m.verificationStatus ?? 'VERIFIED',
          visible: Boolean(m.visible),
          featured: Boolean(m.featured),
          sortOrder: m.sortOrder ?? 0,
          cover: photo(m.cover),
          coverId: typeof m.cover === 'object' && m.cover ? m.cover.id : (m.cover ?? null),
          specsCount: (m.specifications ?? []).length,
          variantsCount: (m.variants ?? []).length,
          galleryCount: (m.gallery ?? []).length,
          fleetCount: countByModel.get(String(m.id)) ?? 0,
        }))

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
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: { vehicle: true, status: true, startDate: true, endDate: true, bookingKey: true },
      }),
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
        intent: v.intent ?? 'BOTH',
        isDemo: Boolean(v.isDemo),
        vehicleConditionType: v.vehicleConditionType ?? 'USED',
        manufactureYear: v.manufactureYear ?? null,
        pricePerDay: v.pricePerDay ?? null,
        pricePerHour: v.pricePerHour ?? null,
        pricePerWeek: v.pricePerWeek ?? null,
        pricePerMonth: v.pricePerMonth ?? null,
        weekendSurcharge: v.weekendSurcharge ?? null,
        depositAmount: v.depositAmount ?? null,
        deliveryFee: v.deliveryFee ?? null,
        salePrice: v.salePrice ?? null,
        listedPrice: v.listedPrice ?? null,
        estimatedRollingPrice: v.estimatedRollingPrice ?? null,
        odometer: v.odometer ?? null,
        version: v.version ?? null,
        color: v.color ?? null,
        location: v.location ?? null,
        pickupLocation: v.pickupLocation ?? null,
        condition: v.condition ?? null,
        maintenanceHistory: v.maintenanceHistory ?? null,
        inspectedAt: v.inspectedAt ?? null,
        operationStatus: v.operationStatus ?? 'READY',
        status: v.status ?? 'ACTIVE',
        photos: (v.photos ?? []).flatMap((p) => {
          const img = photo(p.image)
          const imgId = typeof p.image === 'object' && p.image ? p.image.id : p.image
          return img
            ? [{ image: img, imageId: imgId, caption: p.caption ?? null, kind: p.kind ?? null }]
            : []
        }),
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
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'entity',
      'reference',
      'licensePlate',
      'model',
      'intent',
      'isDemo',
      'vehicleConditionType',
      'manufactureYear',
      'pricePerDay',
      'salePrice',
      'depositAmount',
      'odometer',
      'version',
      'color',
      'location',
      'pickupLocation',
      'condition',
      'maintenanceHistory',
      'operationStatus',
      'status',
      'photoIds',
      'name',
      'brand',
      'category',
      'subCategory',
      'segment',
      'origin',
      'modelYear',
      'seats',
      'fuelType',
      'transmission',
      'driveType',
      'listedPrice',
      'referenceRentPrice',
      'description',
      'visible',
      'featured',
      'coverId',
    ])

    if (data.entity === 'model') {
      const name = text(data.name, 120)
      const brand = text(data.brand, 80)
      const category = text(data.category, 20)
      if (!name || !brand || !VALID_CAT.includes(category as (typeof VALID_CAT)[number])) {
        return fail('Vui lòng nhập đầy đủ Tên dòng xe, Thương hiệu và Danh mục.')
      }
      const created = await payload.create({
        collection: 'vehicle-models',
        user,
        overrideAccess: false,
        data: {
          name,
          brand,
          category: category as (typeof VALID_CAT)[number],
          subCategory: text(data.subCategory, 40) || undefined,
          segment: text(data.segment, 80) || undefined,
          origin: text(data.origin, 80) || undefined,
          modelYear: parseIntField(data.modelYear, 'Đời xe', 1990, 2035) ?? undefined,
          seats: parseIntField(data.seats, 'Số chỗ', 1, 60) ?? undefined,
          fuelType: (text(data.fuelType, 40) || undefined) as
            | 'Xăng'
            | 'Dầu (Diesel)'
            | 'Điện (EV)'
            | 'Hybrid'
            | undefined,
          transmission: text(data.transmission, 80) || undefined,
          driveType: text(data.driveType, 80) || undefined,
          listedPrice:
            parseIntField(data.listedPrice, 'Giá niêm yết', 0, 100_000_000_000) ?? undefined,
          referenceRentPrice:
            parseIntField(data.referenceRentPrice, 'Giá thuê tham khảo', 0, 100_000_000) ??
            undefined,
          description: text(data.description, 3000) || undefined,
          visible: data.visible !== false,
          featured: Boolean(data.featured),
          ...(data.coverId ? { cover: text(data.coverId, 100) } : {}),
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
    const photoIds = Array.isArray(data.photoIds)
      ? data.photoIds.map((id) => text(id, 100)).filter(Boolean)
      : []

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
        salePrice: parseIntField(data.salePrice, 'Giá bán', 1, 100_000_000_000) ?? undefined,
        depositAmount:
          parseIntField(data.depositAmount, 'Tiền đặt cọc', 0, 10_000_000_000) ?? undefined,
        odometer: parseIntField(data.odometer, 'ODO', 0, 10_000_000) ?? undefined,
        version: text(data.version, 80) || undefined,
        color: text(data.color, 60) || undefined,
        location: text(data.location, 100) || undefined,
        pickupLocation: text(data.pickupLocation, 160) || undefined,
        condition: text(data.condition, 500) || undefined,
        maintenanceHistory: text(data.maintenanceHistory, 1000) || undefined,
        operationStatus: VALID_OP.includes(
          text(data.operationStatus, 30) as (typeof VALID_OP)[number],
        )
          ? (text(data.operationStatus, 30) as (typeof VALID_OP)[number])
          : 'READY',
        status: VALID_BIZ.includes(text(data.status, 20) as (typeof VALID_BIZ)[number])
          ? (text(data.status, 20) as (typeof VALID_BIZ)[number])
          : 'ACTIVE',
        ...(photoIds.length
          ? { photos: photoIds.map((image) => ({ image, kind: 'ACTUAL' as const })) }
          : {}),
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
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'entity',
      'id',
      'intent',
      'isDemo',
      'pricePerDay',
      'salePrice',
      'depositAmount',
      'odometer',
      'version',
      'color',
      'location',
      'pickupLocation',
      'condition',
      'maintenanceHistory',
      'inspectedAt',
      'operationStatus',
      'status',
      'photoIds',
      'name',
      'brand',
      'category',
      'subCategory',
      'segment',
      'listedPrice',
      'referenceRentPrice',
      'description',
      'visible',
      'featured',
      'verificationStatus',
      'coverId',
    ])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã bản ghi cần cập nhật.')

    if (data.entity === 'model') {
      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) patch.name = text(data.name, 120)
      if (data.brand !== undefined) patch.brand = text(data.brand, 80)
      if (data.category !== undefined) {
        const c = text(data.category, 20)
        if (!VALID_CAT.includes(c as (typeof VALID_CAT)[number]))
          return fail('Danh mục không hợp lệ.')
        patch.category = c
      }
      if (data.subCategory !== undefined) patch.subCategory = text(data.subCategory, 40) || null
      if (data.segment !== undefined) patch.segment = text(data.segment, 80) || null
      if (data.description !== undefined) patch.description = text(data.description, 3000) || null
      if (data.listedPrice !== undefined)
        patch.listedPrice = parseIntField(data.listedPrice, 'Giá niêm yết', 0, 100_000_000_000)
      if (data.referenceRentPrice !== undefined)
        patch.referenceRentPrice = parseIntField(
          data.referenceRentPrice,
          'Giá thuê tham khảo',
          0,
          100_000_000,
        )
      if (data.visible !== undefined) patch.visible = Boolean(data.visible)
      if (data.featured !== undefined) patch.featured = Boolean(data.featured)
      if (data.verificationStatus !== undefined)
        patch.verificationStatus = text(data.verificationStatus, 20)
      if (data.coverId !== undefined) patch.cover = text(data.coverId, 100) || null

      const updated = await payload.update({
        collection: 'vehicle-models',
        id,
        user,
        overrideAccess: false,
        data: patch,
      })
      return json({ id: updated.id, name: updated.name })
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
    if (data.pricePerDay !== undefined)
      patch.pricePerDay = parseIntField(data.pricePerDay, 'Giá thuê/ngày', 1, 100_000_000)
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
    if (data.maintenanceHistory !== undefined)
      patch.maintenanceHistory = text(data.maintenanceHistory, 1000) || null
    if (data.inspectedAt !== undefined) patch.inspectedAt = text(data.inspectedAt, 40) || null
    if (Array.isArray(data.photoIds)) {
      patch.photos = data.photoIds
        .map((pid) => text(pid, 100))
        .filter(Boolean)
        .map((image) => ({ image, kind: 'ACTUAL' as const }))
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
    const auth = await requireAdmin()
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
