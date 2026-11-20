import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  WAREHOUSE_STATUSES,
  WAREHOUSE_TYPES,
  computeWarehouseOccupancy,
  normalizeCode,
  type WarehouseStatus,
  type WarehouseType,
} from '@/lib/multi-branch-rules'
import { recordVehicleLocationEvent } from '@/lib/multi-branch-service'
import { relationId } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['warehouses', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const branchId = sp.get('branchId')?.trim() || ''
    const status = sp.get('status')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (branchId) {
      const deny = assertBranchScopeOrFail(admin, branchId)
      if (deny) return deny
    }

    const [warehousesRes, branchesRes, vehiclesRes, historyRes] = await Promise.all([
      payload.find({
        collection: 'warehouses',
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
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 1000,
        sort: 'reference',
      }),
      payload.find({
        collection: 'vehicle-location-history',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 80,
        sort: '-occurredAt',
      }),
    ])

    const invVehicles = vehiclesRes.docs.map((v) => ({
      id: String(v.id),
      managingBranchId: relationId(v.managingBranch) ?? null,
      currentBranchId: relationId(v.currentBranch) ?? null,
      currentWarehouseId: relationId(v.currentWarehouse) ?? null,
      operationStatus: String(v.operationStatus ?? 'READY'),
      status: String(v.status ?? 'ACTIVE'),
    }))

    const items = warehousesRes.docs
      .filter((w) => {
        if (status && w.status !== status) return false
        if (q) {
          const bName = typeof w.branch === 'object' && w.branch ? w.branch.name : ''
          const hay = `${w.code} ${w.name} ${w.address} ${bName}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((w) => {
        const wId = String(w.id)
        const bId = relationId(w.branch) ?? ''
        const bName = typeof w.branch === 'object' && w.branch ? w.branch.name : ''
        const occupancy = computeWarehouseOccupancy(invVehicles, wId, Number(w.capacity ?? 20))
        const vehiclesInWarehouse = vehiclesRes.docs
          .filter(
            (v) =>
              relationId(v.currentWarehouse) === wId &&
              v.operationStatus !== 'IN_TRANSIT' &&
              v.operationStatus !== 'RENTED',
          )
          .map((v) => ({
            id: String(v.id),
            reference: v.reference,
            modelName: typeof v.model === 'object' && v.model ? v.model.name : '',
            operationStatus: v.operationStatus ?? 'READY',
            managingBranchId: relationId(v.managingBranch) ?? null,
            isVisiting: Boolean(
              relationId(v.managingBranch) && relationId(v.managingBranch) !== bId,
            ),
          }))
        return {
          id: wId,
          code: w.code,
          name: w.name,
          branchId: bId,
          branchName: bName,
          warehouseType: w.warehouseType,
          address: w.address,
          capacity: w.capacity,
          allowOverCapacity: Boolean(w.allowOverCapacity),
          managerId: relationId(w.manager) ?? null,
          managerName: w.managerNameSnapshot ?? '',
          operatingHours: w.operatingHours ?? '',
          isCustomerFacing: Boolean(w.isCustomerFacing),
          status: w.status,
          notes: w.notes ?? '',
          occupancy,
          vehicles: vehiclesInWarehouse,
          createdAt: w.createdAt,
        }
      })

    const unallocatedVehicles = vehiclesRes.docs
      .filter((v) => !relationId(v.managingBranch) || !relationId(v.currentWarehouse))
      .map((v) => ({
        id: String(v.id),
        reference: v.reference,
        modelName: typeof v.model === 'object' && v.model ? v.model.name : '',
        location: v.location ?? '',
        pickupLocation: v.pickupLocation ?? '',
        operationStatus: v.operationStatus ?? 'READY',
        managingBranchId: relationId(v.managingBranch) ?? null,
        currentBranchId: relationId(v.currentBranch) ?? null,
        currentWarehouseId: relationId(v.currentWarehouse) ?? null,
        allocationStatus: v.allocationStatus ?? 'UNALLOCATED',
      }))

    const history = historyRes.docs.map((h) => ({
      id: String(h.id),
      vehicleId: relationId(h.vehicle) ?? '',
      vehicleReference: h.vehicleReferenceSnapshot ?? '',
      eventType: h.eventType,
      fromBranchName: typeof h.fromBranch === 'object' && h.fromBranch ? h.fromBranch.name : null,
      fromWarehouseName:
        typeof h.fromWarehouse === 'object' && h.fromWarehouse ? h.fromWarehouse.name : null,
      toBranchName: typeof h.toBranch === 'object' && h.toBranch ? h.toBranch.name : null,
      toWarehouseName:
        typeof h.toWarehouse === 'object' && h.toWarehouse ? h.toWarehouse.name : null,
      odometer: h.odometer ?? null,
      actorEmail: h.actorEmail ?? null,
      occurredAt: h.occurredAt,
      note: h.note ?? null,
    }))

    return json({
      items,
      branches: branchesRes.docs.map((b) => ({
        id: String(b.id),
        code: b.code,
        name: b.name,
        status: b.status,
      })),
      unallocatedVehicles,
      history,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['warehouses', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'action',
      'vehicleIds',
      'branchId',
      'managingBranchId',
      'warehouseId',
      'setManagingBranch',
      'code',
      'name',
      'branch',
      'warehouseType',
      'address',
      'capacity',
      'allowOverCapacity',
      'managerId',
      'managerNameSnapshot',
      'operatingHours',
      'isCustomerFacing',
      'status',
      'notes',
    ])

    // Bulk Vehicle Allocation into Branch + Warehouse (Section XII & WH-02, WH-03, WH-04)
    if (data.action === 'bulk_allocate') {
      const targetBranchId = text(data.branchId ?? data.managingBranchId, 100)
      const targetWarehouseId = text(data.warehouseId, 100)
      const vehicleIds = Array.isArray(data.vehicleIds)
        ? [...new Set(data.vehicleIds.map((v) => text(v, 100)).filter(Boolean))]
        : []
      if (!targetBranchId || !targetWarehouseId || vehicleIds.length === 0) {
        return fail('Vui lòng chọn chi nhánh, kho xe và ít nhất 1 phương tiện để phân bổ.')
      }
      const deny = assertBranchScopeOrFail(admin, targetBranchId)
      if (deny) return deny

      const [branchDoc, whDoc, existingWhVehicles] = await Promise.all([
        payload
          .findByID({ collection: 'branches', id: targetBranchId, overrideAccess: true, depth: 0 })
          .catch(() => null),
        payload
          .findByID({
            collection: 'warehouses',
            id: targetWarehouseId,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null),
        payload.find({
          collection: 'vehicles',
          overrideAccess: true,
          depth: 0,
          limit: 1000,
          where: { currentWarehouse: { equals: targetWarehouseId } },
        }),
      ])
      if (!branchDoc || branchDoc.status !== 'ACTIVE') {
        return fail('Chi nhánh đích không tồn tại hoặc đang ngừng hoạt động.', 409)
      }
      if (!whDoc || whDoc.status !== 'ACTIVE' || relationId(whDoc.branch) !== targetBranchId) {
        return fail('Kho xe đích không hợp lệ hoặc không thuộc chi nhánh đã chọn.', 409)
      }

      const occ = computeWarehouseOccupancy(
        existingWhVehicles.docs.map((v) => ({
          id: String(v.id),
          managingBranchId: relationId(v.managingBranch) ?? null,
          currentBranchId: relationId(v.currentBranch) ?? null,
          currentWarehouseId: relationId(v.currentWarehouse) ?? null,
          operationStatus: String(v.operationStatus ?? 'READY'),
          status: String(v.status ?? 'ACTIVE'),
        })),
        targetWarehouseId,
        Number(whDoc.capacity ?? 20),
      )

      const existingIdSet = new Set(existingWhVehicles.docs.map((v) => String(v.id)))
      const netNewCount = vehicleIds.filter((id) => !existingIdSet.has(id)).length
      if (!whDoc.allowOverCapacity && occ.physicalCount + netNewCount > occ.capacity) {
        return fail(
          `Vượt sức chứa kho "${whDoc.name}" (hiện có ${occ.physicalCount}/${occ.capacity}, yêu cầu thêm ${netNewCount} xe). Hãy giảm số lượng hoặc bật chính sách cho phép vượt sức chứa tạm thời.`,
          409,
          'WAREHOUSE_CAPACITY_EXCEEDED',
        )
      }

      const allocated: string[] = []
      const setManaging = data.setManagingBranch !== false
      for (const vId of vehicleIds) {
        const veh = await payload
          .findByID({ collection: 'vehicles', id: vId, overrideAccess: true, depth: 0 })
          .catch(() => null)
        if (!veh) continue
        if (veh.operationStatus === 'IN_TRANSIT' || veh.operationStatus === 'RENTED') {
          return fail(
            `Xe ${veh.reference} đang ở trạng thái ${veh.operationStatus}, không thể phân bổ kho trực tiếp.`,
            409,
          )
        }
        const prevBranchId = relationId(veh.currentBranch) ?? null
        const prevWhId = relationId(veh.currentWarehouse) ?? null
        await payload.update({
          collection: 'vehicles',
          id: vId,
          overrideAccess: true,
          data: {
            ...(setManaging || !relationId(veh.managingBranch)
              ? { managingBranch: targetBranchId }
              : {}),
            currentBranch: targetBranchId,
            currentWarehouse: targetWarehouseId,
            allocationStatus: 'ALLOCATED',
            location: branchDoc.province,
            pickupLocation: `${branchDoc.name} — ${branchDoc.address}`,
          },
        })
        await recordVehicleLocationEvent(payload, undefined, {
          vehicleId: vId,
          vehicleReference: veh.reference,
          eventType: prevWhId ? 'MANUAL_RELOCATION' : 'INITIAL_ALLOCATION',
          fromBranchId: prevBranchId,
          fromWarehouseId: prevWhId,
          toBranchId: targetBranchId,
          toWarehouseId: targetWarehouseId,
          odometer: veh.odometer ?? null,
          actorEmail: admin.email,
          actorRole: admin.staffTitle,
          note: `Phân bổ xe vào kho ${whDoc.code} (${branchDoc.name})`,
        })
        allocated.push(veh.reference)
      }

      return json({ allocatedCount: allocated.length, allocatedReferences: allocated })
    }

    // Create Warehouse
    const code = normalizeCode(text(data.code, 32), 32)
    const name = text(data.name, 160)
    const branchId = text(data.branch ?? data.branchId, 100)
    const address = text(data.address, 300)
    const capacity = Number(data.capacity ?? 20)
    if (!code || !name || !branchId || !address) {
      return fail('Vui lòng nhập đầy đủ Mã kho, Tên kho, Chi nhánh và Địa chỉ.')
    }
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000) {
      return fail('Sức chứa tối đa phải là số nguyên từ 1 đến 10.000.')
    }
    const deny = assertBranchScopeOrFail(admin, branchId)
    if (deny) return deny

    const dup = await payload.find({
      collection: 'warehouses',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { code: { equals: code } },
    })
    if (dup.docs.length > 0) {
      return fail(`Mã kho "${code}" đã tồn tại.`, 409, 'DUPLICATE_WAREHOUSE_CODE')
    }

    const warehouseType = WAREHOUSE_TYPES.includes(String(data.warehouseType) as WarehouseType)
      ? (data.warehouseType as WarehouseType)
      : 'SHOWROOM'
    const status = WAREHOUSE_STATUSES.includes(String(data.status) as WarehouseStatus)
      ? (data.status as WarehouseStatus)
      : 'ACTIVE'

    const created = await payload.create({
      collection: 'warehouses',
      user,
      overrideAccess: false,
      data: {
        code,
        name,
        branch: branchId,
        warehouseType,
        address,
        capacity,
        allowOverCapacity: Boolean(data.allowOverCapacity),
        manager: text(data.managerId, 100) || undefined,
        managerNameSnapshot: text(data.managerNameSnapshot, 120) || undefined,
        operatingHours: text(data.operatingHours, 160) || undefined,
        isCustomerFacing: Boolean(data.isCustomerFacing),
        status,
        notes: text(data.notes, 1000) || undefined,
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
    const auth = await requireAdmin({ permission: ['warehouses', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'id',
      'name',
      'warehouseType',
      'address',
      'capacity',
      'allowOverCapacity',
      'managerId',
      'managerNameSnapshot',
      'operatingHours',
      'isCustomerFacing',
      'status',
      'notes',
    ])
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã định danh kho xe.')

    const current = await payload.findByID({
      collection: 'warehouses',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })
    const deny = assertBranchScopeOrFail(admin, relationId(current.branch))
    if (deny) return deny

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = text(data.name, 160)
    if (
      data.warehouseType !== undefined &&
      WAREHOUSE_TYPES.includes(String(data.warehouseType) as WarehouseType)
    ) {
      patch.warehouseType = data.warehouseType
    }
    if (data.address !== undefined) patch.address = text(data.address, 300)
    if (data.capacity !== undefined) {
      const cap = Number(data.capacity)
      if (!Number.isSafeInteger(cap) || cap < 1) return fail('Sức chứa phải là số nguyên dương.')
      patch.capacity = cap
    }
    if (data.allowOverCapacity !== undefined)
      patch.allowOverCapacity = Boolean(data.allowOverCapacity)
    if (data.managerId !== undefined) patch.manager = text(data.managerId, 100) || null
    if (data.managerNameSnapshot !== undefined)
      patch.managerNameSnapshot = text(data.managerNameSnapshot, 120) || null
    if (data.operatingHours !== undefined)
      patch.operatingHours = text(data.operatingHours, 160) || null
    if (data.isCustomerFacing !== undefined) patch.isCustomerFacing = Boolean(data.isCustomerFacing)
    if (
      data.status !== undefined &&
      WAREHOUSE_STATUSES.includes(String(data.status) as WarehouseStatus)
    ) {
      patch.status = data.status
    }
    if (data.notes !== undefined) patch.notes = text(data.notes, 1000) || null

    const updated = await payload.update({
      collection: 'warehouses',
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
    const auth = await requireAdmin({ permission: ['warehouses', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã kho cần xóa.')
    await payload.delete({ collection: 'warehouses', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
