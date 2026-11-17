import { requireAdmin } from '@/lib/admin-api'
import { apiError, json } from '@/lib/api-utils'
import { HOLD_STATUSES } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const from = sp.get('from') || ''
    const to = sp.get('to') || ''
    const createdAtFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { greater_than_equal: `${from}T00:00:00.000Z` } : {}),
              ...(to ? { less_than_equal: `${to}T23:59:59.999Z` } : {}),
            },
          }
        : undefined

    const [vehiclesRes, bookingsRes, inquiriesRes, usersRes] = await Promise.all([
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'sales-inquiries',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'users',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: { status: true, createdAt: true },
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
    ])

    const fleetByOp: Record<string, number> = {}
    let demoVehicles = 0
    let realVehicles = 0
    for (const v of vehiclesRes.docs) {
      const op = v.operationStatus ?? 'READY'
      fleetByOp[op] = (fleetByOp[op] ?? 0) + 1
      if (v.isDemo) demoVehicles += 1
      else realVehicles += 1
    }
    const activeFleet = vehiclesRes.docs.filter((v) => v.status === 'ACTIVE').length
    const deployedFleet = (fleetByOp.RENTED ?? 0) + (fleetByOp.RESERVED ?? 0)
    const utilizationRate = activeFleet > 0 ? Math.round((deployedFleet / activeFleet) * 100) : 0

    const bookingsByStatus: Record<string, number> = {}
    let completedValue = 0
    let activeHoldValue = 0
    let extraFeeTotal = 0
    let depositTotal = 0
    for (const b of bookingsRes.docs) {
      const st = b.status ?? 'PENDING'
      bookingsByStatus[st] = (bookingsByStatus[st] ?? 0) + 1
      const total = Number(b.totalPrice ?? 0)
      if (st === 'COMPLETED') {
        completedValue += total
        extraFeeTotal += Number(b.extraFee ?? 0)
      } else if (HOLD_STATUSES.includes(st as (typeof HOLD_STATUSES)[number])) {
        activeHoldValue += total
        depositTotal += Number(b.depositSnapshot ?? 0)
      }
    }

    const inquiriesByStatus: Record<string, number> = {}
    for (const inq of inquiriesRes.docs) {
      const st = inq.status ?? 'NEW'
      inquiriesByStatus[st] = (inquiriesByStatus[st] ?? 0) + 1
    }

    const activeCustomers = usersRes.docs.filter((u) => u.status === 'ACTIVE').length
    const disabledCustomers = usersRes.docs.filter((u) => u.status === 'DISABLED').length

    return json({
      range: { from: from || null, to: to || null },
      fleet: {
        total: vehiclesRes.totalDocs,
        active: activeFleet,
        utilizationRate,
        demoVehicles,
        realVehicles,
        byOperationStatus: fleetByOp,
      },
      bookings: {
        total: bookingsRes.totalDocs,
        byStatus: bookingsByStatus,
      },
      inquiries: {
        total: inquiriesRes.totalDocs,
        byStatus: inquiriesByStatus,
      },
      customers: {
        total: usersRes.totalDocs,
        active: activeCustomers,
        disabled: disabledCustomers,
      },
      financial: {
        completedExpectedValue: completedValue,
        activeHoldExpectedValue: activeHoldValue,
        extraFeeTotal,
        depositExpectedOnActive: depositTotal,
        onlinePaymentIntegrated: false,
        realizedPaymentNote:
          'Hệ thống hiện thanh toán trực tiếp / chuyển khoản ngoại tuyến khi nhận xe; chưa tích hợp cổng thanh toán trực tuyến.',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
