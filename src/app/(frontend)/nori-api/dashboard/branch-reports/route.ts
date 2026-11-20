import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, json } from '@/lib/api-utils'
import {
  aggregateMultiBranchRevenue,
  computeBranchFleetStats,
  computeWarehouseOccupancy,
} from '@/lib/multi-branch-rules'
import { relationId, roundVndInteger } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['reports', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const branchIdFilter = sp.get('branchId')?.trim() || ''
    const warehouseIdFilter = sp.get('warehouseId')?.trim() || ''
    const modelIdFilter = sp.get('modelId')?.trim() || ''
    const statusFilter = sp.get('status')?.trim() || ''
    const from = sp.get('from')?.trim() || ''
    const to = sp.get('to')?.trim() || ''

    if (branchIdFilter) {
      const deny = assertBranchScopeOrFail(admin, branchIdFilter)
      if (deny) return deny
    }

    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { greater_than_equal: `${from}T00:00:00.000Z` } : {}),
              ...(to ? { less_than_equal: `${to}T23:59:59.999Z` } : {}),
            },
          }
        : undefined

    const [
      branchesRes,
      warehousesRes,
      vehiclesRes,
      bookingsRes,
      paymentsRes,
      refundsRes,
      transfersRes,
      deliveriesRes,
      modelsRes,
    ] = await Promise.all([
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
        sort: 'name',
      }),
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload
        .find({
          collection: 'refunds',
          overrideAccess: true,
          depth: 0,
          limit: 1000,
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        })
        .catch(() => ({ docs: [] })),
      payload.find({
        collection: 'vehicle-transfers',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'delivery-jobs',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'vehicle-models',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        sort: 'name',
      }),
    ])

    const visibleBranches = branchesRes.docs.filter(
      (b) => !branchIdFilter || String(b.id) === branchIdFilter,
    )
    const visibleBranchIds = visibleBranches.map((b) => String(b.id))
    const visibleBranchSet = new Set(visibleBranchIds)

    // Filter vehicles by model/warehouse if selected
    const vehicleById = new Map(vehiclesRes.docs.map((v) => [String(v.id), v]))
    const filteredVehicles = vehiclesRes.docs.filter((v) => {
      if (modelIdFilter && relationId(v.model) !== modelIdFilter) return false
      if (warehouseIdFilter && relationId(v.currentWarehouse) !== warehouseIdFilter) return false
      return true
    })
    const invVehicles = filteredVehicles.map((v) => ({
      id: String(v.id),
      managingBranchId: relationId(v.managingBranch) ?? null,
      currentBranchId: relationId(v.currentBranch) ?? null,
      currentWarehouseId: relationId(v.currentWarehouse) ?? null,
      operationStatus: String(v.operationStatus ?? 'READY'),
      status: String(v.status ?? 'ACTIVE'),
    }))

    // Map verified payments & refunds per booking (strictly separating security deposits!)
    const verifiedRentalByBooking = new Map<string, number>()
    const securityHeldByBooking = new Map<string, number>()
    for (const p of paymentsRes.docs) {
      const bId = relationId(p.booking)
      if (!bId) continue
      if (['CONFIRMED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(String(p.status))) {
        const amt = roundVndInteger(
          p.receivedAmount != null && Number(p.receivedAmount) > 0 ? p.receivedAmount : p.amount,
        )
        if (p.paymentType === 'SECURITY_DEPOSIT') {
          securityHeldByBooking.set(bId, (securityHeldByBooking.get(bId) ?? 0) + amt)
        } else if (p.paymentType !== 'REFUND') {
          verifiedRentalByBooking.set(bId, (verifiedRentalByBooking.get(bId) ?? 0) + amt)
        }
      }
    }
    const refundedByBooking = new Map<string, number>()
    for (const r of refundsRes.docs as Array<{
      booking?: unknown
      status?: string
      amount?: number
      refundType?: string
    }>) {
      const bId = relationId(r.booking as string | { id: string } | null)
      if (!bId) continue
      if (r.status === 'REFUNDED') {
        if (r.refundType === 'SECURITY_DEPOSIT_RETURN') {
          const prev = securityHeldByBooking.get(bId) ?? 0
          securityHeldByBooking.set(bId, Math.max(0, prev - roundVndInteger(r.amount ?? 0)))
        } else {
          refundedByBooking.set(
            bId,
            (refundedByBooking.get(bId) ?? 0) + roundVndInteger(r.amount ?? 0),
          )
        }
      }
    }

    const filteredBookings = bookingsRes.docs.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false
      if (modelIdFilter) {
        const veh = vehicleById.get(relationId(b.vehicle) ?? '')
        if (!veh || relationId(veh.model) !== modelIdFilter) return false
      }
      if (branchIdFilter) {
        const pB = relationId(b.pickupBranch)
        const rB = relationId(b.returnBranch)
        const aB = relationId(b.revenueAttributionBranch)
        if (pB !== branchIdFilter && rB !== branchIdFilter && aB !== branchIdFilter) return false
      }
      return true
    })

    const revenueAgg = aggregateMultiBranchRevenue({
      branchIds: visibleBranchIds,
      bookings: filteredBookings.map((b) => {
        const bId = String(b.id)
        return {
          id: bId,
          status: String(b.status ?? 'PENDING'),
          pickupBranchId: relationId(b.pickupBranch) ?? null,
          returnBranchId: relationId(b.returnBranch) ?? null,
          revenueAttributionBranchId: relationId(b.revenueAttributionBranch) ?? null,
          revenueSplitPickupPercent: b.revenueSplitPickupPercent ?? 100,
          isOneWay: Boolean(b.isOneWay),
          deliveryRequested: Boolean(b.deliveryRequested),
          pickupMethod: b.pickupMethod ?? null,
          returnMethod: b.returnMethod ?? null,
          totalPrice: Number(b.totalPrice ?? 0),
          baseRentPrice: Number(b.baseRentPrice ?? 0),
          deliveryFeeSnapshot: Number(b.deliveryFeeSnapshot ?? 0),
          pickupFeeSnapshot: Number(b.pickupFeeSnapshot ?? 0),
          locationSurchargeSnapshot: Number(b.locationSurchargeSnapshot ?? 0),
          oneWayFeeSnapshot: Number(b.oneWayFeeSnapshot ?? 0),
          afterHoursFeeSnapshot: Number(b.afterHoursFeeSnapshot ?? 0),
          extraFee: Number(b.extraFee ?? 0),
          verifiedRentalCollected: verifiedRentalByBooking.get(bId) ?? 0,
          securityDepositHeld: securityHeldByBooking.get(bId) ?? 0,
          refundedAmount: refundedByBooking.get(bId) ?? 0,
        }
      }),
      transfers: transfersRes.docs.map((t) => ({
        fromBranchId: relationId(t.fromBranch) ?? '',
        toBranchId: relationId(t.toBranch) ?? '',
        status: String(t.status ?? 'DRAFT'),
        transferCost: Number(t.transferCost ?? 0),
      })),
    })

    const branchRows = visibleBranches.map((b) => {
      const bId = String(b.id)
      const fleet = computeBranchFleetStats(invVehicles, bId)
      const metrics = revenueAgg.byBranch[bId]
      const transfersOut = transfersRes.docs.filter((t) => relationId(t.fromBranch) === bId).length
      const transfersIn = transfersRes.docs.filter((t) => relationId(t.toBranch) === bId).length
      const deliveryJobsCount = deliveriesRes.docs.filter(
        (j) => relationId(j.branch) === bId,
      ).length
      const activeManaged = Math.max(0, fleet.managedTotal - fleet.inactiveOrSold)
      const utilizationRate =
        activeManaged > 0 ? Math.round(((fleet.rented + fleet.reserved) / activeManaged) * 100) : 0

      return {
        branchId: bId,
        code: b.code,
        name: b.name,
        province: b.province,
        status: b.status,
        fleet,
        utilizationRate,
        transfersOut,
        transfersIn,
        deliveryJobsCount,
        metrics,
      }
    })

    const warehouseRows = warehousesRes.docs
      .filter((w) => {
        const bId = relationId(w.branch) ?? ''
        if (branchIdFilter && bId !== branchIdFilter) return false
        if (warehouseIdFilter && String(w.id) !== warehouseIdFilter) return false
        return visibleBranchSet.has(bId)
      })
      .map((w) => {
        const bId = relationId(w.branch) ?? ''
        const br = visibleBranches.find((b) => String(b.id) === bId)
        return {
          warehouseId: String(w.id),
          code: w.code,
          name: w.name,
          warehouseType: w.warehouseType,
          status: w.status,
          branchId: bId,
          branchName: br?.name ?? '',
          occupancy: computeWarehouseOccupancy(invVehicles, String(w.id), Number(w.capacity ?? 1)),
        }
      })

    const conflicts = [
      ...filteredBookings
        .filter((b) => Boolean(b.scheduleConflictAlert))
        .map((b) => ({
          kind: 'RETURN_CONFLICT',
          reference: b.bookingKey ?? String(b.id),
          message: String(b.scheduleConflictAlert),
          branchId: relationId(b.actualReturnBranch) ?? relationId(b.returnBranch) ?? null,
        })),
      ...transfersRes.docs
        .filter((t) => Boolean(t.delayedWarning))
        .map((t) => ({
          kind: 'TRANSFER_DELAY',
          reference: t.transferCode,
          message: `Phiếu điều chuyển ${t.transferCode} bị trễ lịch dự kiến (ảnh hưởng đơn: ${Array.isArray(t.affectedBookingKeys) && t.affectedBookingKeys.length ? t.affectedBookingKeys.join(', ') : 'cần kiểm tra'}).`,
          branchId: relationId(t.toBranch) ?? null,
        })),
    ]

    return json({
      range: { from: from || null, to: to || null },
      branches: branchRows,
      warehouses: warehouseRows,
      unassigned: admin.isGlobalScope && !branchIdFilter ? revenueAgg.unassigned : null,
      systemTotal: revenueAgg.systemTotal,
      systemFleet: computeBranchFleetStats(invVehicles, branchIdFilter || null),
      conflicts,
      filters: {
        branches: branchesRes.docs.map((b) => ({ id: String(b.id), code: b.code, name: b.name })),
        warehouses: warehousesRes.docs.map((w) => ({
          id: String(w.id),
          code: w.code,
          name: w.name,
          branchId: relationId(w.branch) ?? '',
        })),
        models: modelsRes.docs.map((m) => ({ id: String(m.id), name: m.name })),
      },
      scope: {
        isGlobal: admin.isGlobalScope,
        assignedBranchIds: admin.assignedBranchIds,
      },
      accountingNote:
        'Doanh thu đơn thuê một chiều được phân bổ chính xác theo tỷ lệ cấu hình (mặc định 100% chi nhánh nhận) để đảm bảo tổng doanh thu các chi nhánh luôn bằng tổng toàn hệ thống, không bao giờ cộng trùng. Tiền cọc bảo đảm tài sản và chi phí điều chuyển nội bộ được tách biệt hoàn toàn.',
    })
  } catch (error) {
    return apiError(error)
  }
}
