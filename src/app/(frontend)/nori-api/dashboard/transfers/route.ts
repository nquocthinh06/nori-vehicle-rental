import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  TRANSFER_STATUSES,
  validateNonNegativeVnd,
  type TransferStatus,
} from '@/lib/multi-branch-rules'
import {
  createVehicleTransferAtomic,
  transitionVehicleTransferAtomic,
} from '@/lib/multi-branch-service'
import { relationId } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['transfers', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const statusFilter = sp.get('status')?.trim() || ''
    const branchFilter = sp.get('branchId')?.trim() || ''
    const vehicleFilter = sp.get('vehicleId')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (branchFilter) {
      const deny = assertBranchScopeOrFail(admin, branchFilter)
      if (deny) return deny
    }

    const [transfersRes, branchesRes, warehousesRes, vehiclesRes, staffRes] = await Promise.all([
      payload.find({
        collection: 'vehicle-transfers',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 300,
        sort: '-createdAt',
        ...(statusFilter && TRANSFER_STATUSES.includes(statusFilter as TransferStatus)
          ? { where: { status: { equals: statusFilter } } }
          : {}),
      }),
      payload.find({
        collection: 'branches',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        sort: 'name',
      }),
      payload.find({
        collection: 'warehouses',
        overrideAccess: true,
        depth: 0,
        limit: 500,
        sort: 'name',
      }),
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: 'reference',
      }),
      payload.find({
        collection: 'admins',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        select: { email: true, fullName: true, staffTitle: true, accountStatus: true },
      }),
    ])

    const branchMap = new Map(branchesRes.docs.map((b) => [String(b.id), b]))
    const warehouseMap = new Map(warehousesRes.docs.map((w) => [String(w.id), w]))

    const items = transfersRes.docs
      .filter((t) => {
        const fromB = relationId(t.fromBranch)
        const toB = relationId(t.toBranch)
        const vId = relationId(t.vehicle)
        if (branchFilter && fromB !== branchFilter && toB !== branchFilter) return false
        if (vehicleFilter && vId !== vehicleFilter) return false
        if (q) {
          const hay =
            `${t.transferCode} ${t.vehicleReferenceSnapshot ?? ''} ${t.reason} ${t.assignedStaffName ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((t) => {
        const fromBId = relationId(t.fromBranch) ?? ''
        const toBId = relationId(t.toBranch) ?? ''
        const fromWId = relationId(t.fromWarehouse) ?? ''
        const toWId = relationId(t.toWarehouse) ?? ''
        const fromBranch = branchMap.get(fromBId)
        const toBranch = branchMap.get(toBId)
        const fromWh = warehouseMap.get(fromWId)
        const toWh = warehouseMap.get(toWId)
        return {
          id: String(t.id),
          transferCode: t.transferCode,
          vehicleId: relationId(t.vehicle) ?? '',
          vehicleReference:
            t.vehicleReferenceSnapshot ??
            (typeof t.vehicle === 'object' && t.vehicle ? t.vehicle.reference : ''),
          fromBranchId: fromBId,
          fromBranchName: fromBranch?.name ?? 'Chưa rõ',
          fromWarehouseId: fromWId,
          fromWarehouseName: fromWh?.name ?? 'Chưa rõ',
          toBranchId: toBId,
          toBranchName: toBranch?.name ?? 'Chưa rõ',
          toWarehouseId: toWId,
          toWarehouseName: toWh?.name ?? 'Chưa rõ',
          reason: t.reason,
          startDate: t.startDate,
          endDate: t.endDate,
          scheduledDepartureAt: t.scheduledDepartureAt,
          scheduledArrivalAt: t.scheduledArrivalAt,
          actualDepartureAt: t.actualDepartureAt ?? null,
          actualArrivalAt: t.actualArrivalAt ?? null,
          completedAt: t.completedAt ?? null,
          assignedStaffId: relationId(t.assignedStaff) ?? null,
          assignedStaffName: t.assignedStaffName ?? null,
          transferCost: t.transferCost ?? 0,
          status: t.status,
          conditionBefore: t.conditionBefore ?? '',
          conditionAfter: t.conditionAfter ?? '',
          odometerBefore: t.odometerBefore ?? null,
          odometerAfter: t.odometerAfter ?? null,
          handoverReportNote: t.handoverReportNote ?? '',
          exceptionNote: t.exceptionNote ?? '',
          delayedWarning: Boolean(t.delayedWarning),
          affectedBookingKeys: Array.isArray(t.affectedBookingKeys) ? t.affectedBookingKeys : [],
          createdBy: t.createdBy ?? '',
          approvedBy: t.approvedBy ?? '',
          receivedBy: t.receivedBy ?? '',
          revision: t.revision ?? 1,
          statusHistory: Array.isArray(t.statusHistory) ? t.statusHistory : [],
          createdAt: t.createdAt,
        }
      })

    return json({
      items,
      totalDocs: items.length,
      branches: branchesRes.docs.map((b) => ({
        id: String(b.id),
        code: b.code,
        name: b.name,
        status: b.status,
      })),
      warehouses: warehousesRes.docs.map((w) => ({
        id: String(w.id),
        code: w.code,
        name: w.name,
        branchId: relationId(w.branch) ?? '',
        status: w.status,
        capacity: w.capacity,
      })),
      vehicles: vehiclesRes.docs.map((v) => ({
        id: String(v.id),
        reference: v.reference,
        licensePlate: v.licensePlate ?? '',
        modelName: typeof v.model === 'object' && v.model ? v.model.name : '',
        operationStatus: v.operationStatus ?? 'READY',
        currentBranchId: relationId(v.currentBranch) ?? null,
        currentWarehouseId: relationId(v.currentWarehouse) ?? null,
        odometer: v.odometer ?? null,
      })),
      staff: staffRes.docs
        .filter((a) => a.accountStatus !== 'REVOKED' && a.accountStatus !== 'SUSPENDED')
        .map((a) => ({
          id: String(a.id),
          email: a.email,
          fullName: a.fullName ?? a.email,
          staffTitle: a.staffTitle ?? 'OPERATOR',
        })),
      scope: {
        isGlobal: admin.isGlobalScope,
        assignedBranchIds: admin.assignedBranchIds,
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['transfers', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    const data = await body(request, [
      'vehicleId',
      'fromBranchId',
      'fromWarehouseId',
      'toBranchId',
      'toWarehouseId',
      'reason',
      'scheduledDepartureAt',
      'scheduledArrivalAt',
      'assignedStaffId',
      'assignedStaffName',
      'transferCost',
      'conditionBefore',
      'odometerBefore',
      'handoverReportNote',
      'submitForApproval',
      'allowMaintenanceException',
      'idempotencyKey',
    ])

    const vehicleId = text(data.vehicleId, 100)
    const toBranchId = text(data.toBranchId, 100)
    const toWarehouseId = text(data.toWarehouseId, 100)
    const reason = text(data.reason, 300)
    const scheduledDepartureAt = text(data.scheduledDepartureAt, 40)
    const scheduledArrivalAt = text(data.scheduledArrivalAt, 40)

    if (
      !vehicleId ||
      !toBranchId ||
      !toWarehouseId ||
      !reason ||
      !scheduledDepartureAt ||
      !scheduledArrivalAt
    ) {
      return fail(
        'Vui lòng nhập đầy đủ Phương tiện, Chi nhánh/Kho nhận, Lý do và Thời gian điều chuyển dự kiến.',
      )
    }

    const costCheck = validateNonNegativeVnd(data.transferCost, 'Chi phí điều chuyển')
    if (!costCheck.valid) return fail(costCheck.error!)

    const odoBefore =
      data.odometerBefore !== undefined &&
      data.odometerBefore !== null &&
      data.odometerBefore !== ''
        ? Number(data.odometerBefore)
        : null
    if (odoBefore !== null && (!Number.isSafeInteger(odoBefore) || odoBefore < 0)) {
      return fail('ODO trước khi điều chuyển phải là số nguyên không âm.')
    }

    const result = await createVehicleTransferAtomic(payload, admin, {
      vehicleId,
      fromBranchId: text(data.fromBranchId, 100) || undefined,
      fromWarehouseId: text(data.fromWarehouseId, 100) || undefined,
      toBranchId,
      toWarehouseId,
      reason,
      scheduledDepartureAt,
      scheduledArrivalAt,
      assignedStaffId: text(data.assignedStaffId, 100) || null,
      assignedStaffName: text(data.assignedStaffName, 120) || null,
      transferCost: costCheck.value ?? 0,
      conditionBefore: text(data.conditionBefore, 500) || null,
      odometerBefore: odoBefore,
      handoverReportNote: text(data.handoverReportNote, 1000) || null,
      submitForApproval: data.submitForApproval !== false,
      allowMaintenanceException: data.allowMaintenanceException === true,
      idempotencyKey: text(data.idempotencyKey, 120) || null,
    })

    const t = result.transfer as unknown as Record<string, unknown>
    return json(
      {
        id: String(t.id),
        transferCode: String(t.transferCode ?? ''),
        status: String(t.status ?? 'DRAFT'),
        revision: Number(t.revision ?? 1),
        reused: result.reused,
      },
      result.reused ? 200 : 201,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['transfers', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, admin } = auth

    const data = await body(request, [
      'id',
      'transferId',
      'nextStatus',
      'status',
      'expectedRevision',
      'note',
      'odometerBefore',
      'odometerAfter',
      'conditionBefore',
      'conditionAfter',
      'exceptionNote',
      'scheduledArrivalAt',
      'requirePostArrivalInspection',
    ])

    const transferId = text(data.transferId ?? data.id, 100)
    if (!transferId) return fail('Thiếu mã phiếu điều chuyển.')

    const rawNextStatus = text(data.nextStatus ?? data.status, 30)
    const nextStatus = rawNextStatus
      ? TRANSFER_STATUSES.includes(rawNextStatus as TransferStatus)
        ? (rawNextStatus as TransferStatus)
        : null
      : undefined
    if (nextStatus === null) {
      return fail('Trạng thái điều chuyển không hợp lệ.')
    }

    const expectedRevision =
      data.expectedRevision !== undefined &&
      data.expectedRevision !== null &&
      data.expectedRevision !== ''
        ? Number(data.expectedRevision)
        : undefined
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    ) {
      return fail('Phiên bản phiếu điều chuyển không hợp lệ.')
    }

    const odoBefore =
      data.odometerBefore !== undefined &&
      data.odometerBefore !== null &&
      data.odometerBefore !== ''
        ? Number(data.odometerBefore)
        : undefined
    const odoAfter =
      data.odometerAfter !== undefined && data.odometerAfter !== null && data.odometerAfter !== ''
        ? Number(data.odometerAfter)
        : undefined
    if (
      (odoBefore !== undefined && (!Number.isSafeInteger(odoBefore) || odoBefore < 0)) ||
      (odoAfter !== undefined && (!Number.isSafeInteger(odoAfter) || odoAfter < 0))
    ) {
      return fail('Số km ODO phải là số nguyên không âm.')
    }

    const res = await transitionVehicleTransferAtomic(payload, admin, {
      transferId,
      nextStatus,
      expectedRevision,
      note: text(data.note, 500) || null,
      odometerBefore: odoBefore ?? null,
      odometerAfter: odoAfter ?? null,
      conditionBefore: text(data.conditionBefore, 500) || null,
      conditionAfter: text(data.conditionAfter, 500) || null,
      exceptionNote: text(data.exceptionNote, 500) || null,
      scheduledArrivalAt: text(data.scheduledArrivalAt, 40) || null,
      requirePostArrivalInspection: data.requirePostArrivalInspection === true,
    })

    const t = res.transfer as unknown as Record<string, unknown>
    return json({
      id: String(t.id),
      transferCode: String(t.transferCode ?? ''),
      status: String(t.status ?? ''),
      revision: Number(t.revision ?? 1),
      delayedWarning: Boolean(t.delayedWarning),
      affectedBookingKeys:
        res.affectedBookingKeys ??
        (Array.isArray(t.affectedBookingKeys) ? t.affectedBookingKeys : []),
    })
  } catch (error) {
    return apiError(error)
  }
}
