import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, json } from '@/lib/api-utils'
import { getSitePaymentConfig, sweepExpiredPayments } from '@/lib/payment-service'
import { HOLD_STATUSES, relationId, roundVndInteger } from '@/lib/rental-rules'
import type { Refund } from '@/payload-types'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['reports', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const from = sp.get('from') || ''
    const to = sp.get('to') || ''
    const branchIdFilter = sp.get('branchId')?.trim() || ''
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

    await sweepExpiredPayments(payload)
    const [
      vehiclesRes,
      bookingsRes,
      inquiriesRes,
      activeUsersCount,
      disabledUsersCount,
      paymentsRes,
      refundsRes,
      siteConfig,
    ] = await Promise.all([
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: {
          status: true,
          operationStatus: true,
          isDemo: true,
          managingBranch: true,
          currentBranch: true,
        },
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: {
          status: true,
          totalPrice: true,
          extraFee: true,
          depositSnapshot: true,
          pickupBranch: true,
          returnBranch: true,
        },
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.find({
        collection: 'sales-inquiries',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        select: { status: true },
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload.count({
        collection: 'users',
        overrideAccess: true,
        where: {
          and: [{ status: { equals: 'ACTIVE' } }, ...(createdAtFilter ? [createdAtFilter] : [])],
        },
      }),
      payload.count({
        collection: 'users',
        overrideAccess: true,
        where: {
          and: [{ status: { equals: 'DISABLED' } }, ...(createdAtFilter ? [createdAtFilter] : [])],
        },
      }),
      payload.find({
        collection: 'payments',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        select: {
          status: true,
          method: true,
          provider: true,
          paymentType: true,
          reconciliationStatus: true,
          amount: true,
          receivedAmount: true,
          branch: true,
          booking: true,
        },
        ...(createdAtFilter ? { where: createdAtFilter } : {}),
      }),
      payload
        .find({
          collection: 'refunds',
          overrideAccess: true,
          depth: 0,
          limit: 1000,
          select: { amount: true, status: true, refundType: true, booking: true },
          ...(createdAtFilter ? { where: createdAtFilter } : {}),
        })
        .catch(() => ({ docs: [] as Refund[] })),
      getSitePaymentConfig(payload),
    ])

    const scopedVehicles = branchIdFilter
      ? vehiclesRes.docs.filter(
          (v) =>
            relationId(v.managingBranch) === branchIdFilter ||
            relationId(v.currentBranch) === branchIdFilter,
        )
      : vehiclesRes.docs
    const scopedBookings = branchIdFilter
      ? bookingsRes.docs.filter(
          (b) =>
            relationId(b.pickupBranch) === branchIdFilter ||
            relationId(b.returnBranch) === branchIdFilter,
        )
      : bookingsRes.docs
    const scopedBookingIds = new Set(scopedBookings.map((b) => String(b.id)))
    const scopedPayments = branchIdFilter
      ? paymentsRes.docs.filter(
          (p) =>
            relationId(p.branch) === branchIdFilter ||
            (relationId(p.booking) && scopedBookingIds.has(relationId(p.booking)!)),
        )
      : paymentsRes.docs
    const scopedRefunds =
      admin.isGlobalScope && !branchIdFilter
        ? refundsRes.docs
        : refundsRes.docs.filter(
            (r) => relationId(r.booking) && scopedBookingIds.has(relationId(r.booking)!),
          )

    const fleetByOp: Record<string, number> = {}
    let demoVehicles = 0
    let realVehicles = 0
    for (const v of scopedVehicles) {
      const op = v.operationStatus ?? 'READY'
      fleetByOp[op] = (fleetByOp[op] ?? 0) + 1
      if (v.isDemo) demoVehicles += 1
      else realVehicles += 1
    }
    const activeFleet = scopedVehicles.filter((v) => v.status === 'ACTIVE').length
    const deployedFleet = (fleetByOp.RENTED ?? 0) + (fleetByOp.RESERVED ?? 0)
    const utilizationRate = activeFleet > 0 ? Math.round((deployedFleet / activeFleet) * 100) : 0

    const bookingsByStatus: Record<string, number> = {}
    let completedValue = 0
    let activeHoldValue = 0
    let extraFeeTotal = 0
    let depositTotal = 0
    for (const b of scopedBookings) {
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

    // Verified payment & refund financial aggregation (separated strictly by business rules)
    let totalVerifiedReceived = 0
    let depositCollected = 0
    let rentalFeeCollected = 0
    let extraFeeCollected = 0
    let securityDepositHeld = 0
    let pendingReconciliationCount = 0
    const paymentsByStatus: Record<string, number> = {}
    const paymentsByMethod: Record<string, number> = {}
    const paymentsByProvider: Record<string, number> = {}

    for (const p of scopedPayments) {
      const st = p.status ?? 'PENDING'
      const method = p.method ?? 'BANK_TRANSFER'
      const provider = p.provider ?? 'MANUAL'
      paymentsByStatus[st] = (paymentsByStatus[st] ?? 0) + 1

      if (p.reconciliationStatus && p.reconciliationStatus !== 'NONE') {
        pendingReconciliationCount += 1
      }

      if (st === 'CONFIRMED' || st === 'PARTIALLY_REFUNDED' || st === 'REFUNDED') {
        const verifiedAmt = roundVndInteger(
          p.receivedAmount !== null && p.receivedAmount !== undefined && p.receivedAmount > 0
            ? p.receivedAmount
            : p.amount,
        )
        totalVerifiedReceived += verifiedAmt
        paymentsByMethod[method] = (paymentsByMethod[method] ?? 0) + verifiedAmt
        paymentsByProvider[provider] = (paymentsByProvider[provider] ?? 0) + verifiedAmt

        if (p.paymentType === 'DEPOSIT') {
          depositCollected += verifiedAmt
        } else if (p.paymentType === 'RENTAL_FEE' || p.paymentType === 'FULL_PAYMENT') {
          rentalFeeCollected += verifiedAmt
        } else if (p.paymentType === 'EXTRA_FEE') {
          extraFeeCollected += verifiedAmt
        } else if (p.paymentType === 'SECURITY_DEPOSIT') {
          // Asset security deposit is strictly separated from rental revenue
          securityDepositHeld += verifiedAmt
        }
      }
    }

    let totalRefunded = 0
    let securityDepositRefunded = 0
    let pendingRefundTotal = 0
    for (const r of scopedRefunds) {
      const amt = roundVndInteger(r.amount)
      if (r.status === 'REFUNDED') {
        totalRefunded += amt
        if (r.refundType === 'SECURITY_DEPOSIT_RETURN') {
          securityDepositRefunded += amt
        }
      } else if (['REQUESTED', 'APPROVED', 'PROCESSING'].includes(r.status)) {
        pendingRefundTotal += amt
      }
    }

    const rentalRevenueGrossCollected = depositCollected + rentalFeeCollected + extraFeeCollected
    const rentalRefunded = Math.max(0, totalRefunded - securityDepositRefunded)
    const netRentalRevenueCollected = Math.max(0, rentalRevenueGrossCollected - rentalRefunded)
    const netSecurityDepositHeld = Math.max(0, securityDepositHeld - securityDepositRefunded)
    const netCollectedTotal = Math.max(0, totalVerifiedReceived - totalRefunded)
    const totalContractExpected = completedValue + activeHoldValue + extraFeeTotal
    const remainingReceivable = Math.max(0, totalContractExpected - rentalRevenueGrossCollected)

    const inquiriesByStatus: Record<string, number> = {}
    for (const inq of inquiriesRes.docs) {
      const st = inq.status ?? 'NEW'
      inquiriesByStatus[st] = (inquiriesByStatus[st] ?? 0) + 1
    }

    const activeCustomers = activeUsersCount.totalDocs
    const disabledCustomers = disabledUsersCount.totalDocs

    return json({
      range: { from: from || null, to: to || null, branchId: branchIdFilter || null },
      fleet: {
        total: scopedVehicles.length,
        active: activeFleet,
        utilizationRate,
        demoVehicles,
        realVehicles,
        byOperationStatus: fleetByOp,
      },
      bookings: {
        total: scopedBookings.length,
        byStatus: bookingsByStatus,
      },
      inquiries: {
        total: inquiriesRes.totalDocs,
        byStatus: inquiriesByStatus,
      },
      customers: {
        total: activeCustomers + disabledCustomers,
        active: activeCustomers,
        disabled: disabledCustomers,
      },
      financial: {
        completedExpectedValue: completedValue,
        activeHoldExpectedValue: activeHoldValue,
        extraFeeTotal,
        depositExpectedOnActive: depositTotal,
        totalVerifiedReceived,
        depositCollected,
        rentalFeeCollected,
        extraFeeCollected,
        rentalRevenueGrossCollected,
        netRentalRevenueCollected,
        securityDepositHeld: netSecurityDepositHeld,
        totalRefunded,
        pendingRefundTotal,
        netCollectedTotal,
        remainingReceivable,
        pendingReconciliationCount,
        paymentsByStatus,
        paymentsByMethod,
        paymentsByProvider,
        onlinePaymentIntegrated: siteConfig.onlinePaymentEnabled,
        activeProvider: siteConfig.activeProvider,
        environment: siteConfig.environment,
        realizedPaymentNote:
          'Chỉ các giao dịch đã xác thực (CONFIRMED / PARTIALLY_REFUNDED) mới được cộng vào thực thu. Tiền cọc bảo đảm tài sản (SECURITY_DEPOSIT) được theo dõi độc lập và không gộp vào doanh thu tiền thuê xe.',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}
