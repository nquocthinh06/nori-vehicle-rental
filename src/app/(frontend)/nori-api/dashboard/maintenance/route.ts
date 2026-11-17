import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['maintenance', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const status = new URL(request.url).searchParams.get('status') || ''
    const [maintRes, vehiclesRes] = await Promise.all([
      payload.find({
        collection: 'maintenance-schedules',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 200,
        sort: '-startDate',
        ...(status ? { where: { status: { equals: status } } } : {}),
      }),
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 200,
        sort: 'reference',
      }),
    ])

    return json({
      items: maintRes.docs.map((m) => ({
        id: m.id,
        title: m.title,
        maintenanceType: m.maintenanceType,
        startDate: m.startDate,
        endDate: m.endDate,
        odometerAtService: m.odometerAtService ?? null,
        cost: m.cost ?? null,
        status: m.status,
        notes: m.notes ?? '',
        vehicleId: typeof m.vehicle === 'object' && m.vehicle ? m.vehicle.id : String(m.vehicle),
        vehicleReference:
          typeof m.vehicle === 'object' && m.vehicle ? m.vehicle.reference : 'Chưa rõ',
      })),
      vehicles: vehiclesRes.docs.map((v) => ({
        id: v.id,
        reference: v.reference,
        modelName: typeof v.model === 'object' && v.model ? v.model.name : '',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['maintenance', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'vehicleId',
      'title',
      'maintenanceType',
      'startDate',
      'endDate',
      'odometerAtService',
      'cost',
      'status',
      'notes',
    ])
    const vehicle = text(data.vehicleId, 100)
    const title = text(data.title, 160)
    const startDate = text(data.startDate, 10)
    const endDate = text(data.endDate, 10)
    if (!vehicle || !title || !startDate || !endDate || endDate < startDate) {
      return fail('Vui lòng chọn xe, nhập hạng mục và khoảng ngày bảo trì hợp lệ.')
    }

    const created = await payload.create({
      collection: 'maintenance-schedules',
      user,
      overrideAccess: false,
      data: {
        vehicle,
        title,
        maintenanceType: (['ROUTINE', 'REPAIR', 'INSPECTION'].includes(String(data.maintenanceType))
          ? data.maintenanceType
          : 'ROUTINE') as 'ROUTINE' | 'REPAIR' | 'INSPECTION',
        startDate,
        endDate,
        odometerAtService: data.odometerAtService ? Number(data.odometerAtService) : undefined,
        cost: data.cost ? Number(data.cost) : undefined,
        status: (['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(
          String(data.status),
        )
          ? data.status
          : 'SCHEDULED') as 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
        notes: text(data.notes, 1000) || undefined,
      },
    })
    return json({ id: created.id }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['maintenance', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, ['id', 'status', 'cost', 'notes'])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    if (!id || !['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return fail('Trạng thái lịch bảo trì không hợp lệ.')
    }
    const updated = await payload.update({
      collection: 'maintenance-schedules',
      id,
      user,
      overrideAccess: false,
      data: {
        status: status as 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
        ...(data.cost !== undefined && data.cost !== '' ? { cost: Number(data.cost) } : {}),
        ...(data.notes !== undefined ? { notes: text(data.notes, 1000) } : {}),
      },
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['maintenance', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id') || ''
    if (!id) return fail('Thiếu mã lịch bảo trì.')
    await payload.delete({ collection: 'maintenance-schedules', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
