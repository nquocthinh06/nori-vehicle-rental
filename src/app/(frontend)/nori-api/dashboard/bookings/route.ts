import { assertBranchScopeOrFail, requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  buildSitePaymentConfigFromDoc,
  computeBookingFinancialsSync,
  sweepExpiredPayments,
} from '@/lib/payment-service'
import { withBookingWriteLock } from '@/lib/promo-service'
import {
  businessToday,
  calculateNextContactSlot,
  isDepositExpired,
  relationId,
  type BookingStatus,
} from '@/lib/rental-rules'
import type { ConsultationView } from '@/lib/domain-types'
import type { Payment, Refund } from '@/payload-types'

const VALID_BOOKING_STATUSES = [
  'PENDING',
  'DEPOSIT_PENDING',
  'CONFIRMED',
  'READY_FOR_HANDOVER',
  'ONGOING',
  'INSPECTING',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const

const VALID_CONSULT_FILTERS = [
  'PENDING_CONTACT',
  'DUE_TODAY',
  'OVERDUE',
  'URGENT',
  'CONSULTED',
] as const

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['bookings', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const status = sp.get('status') || ''
    const consultFilter = sp.get('consultFilter') || ''
    const branchIdFilter = sp.get('branchId')?.trim() || ''
    const pickupBranchIdFilter = sp.get('pickupBranchId')?.trim() || ''
    const returnBranchIdFilter = sp.get('returnBranchId')?.trim() || ''
    const oneWayOnly = sp.get('oneWayOnly') === '1' || sp.get('oneWayOnly') === 'true'
    const deliveryOnly = sp.get('deliveryOnly') === '1' || sp.get('deliveryOnly') === 'true'
    const q = (sp.get('q') || '').trim().toLowerCase()

    for (const bFilter of [branchIdFilter, pickupBranchIdFilter, returnBranchIdFilter]) {
      if (bFilter) {
        const deny = assertBranchScopeOrFail(auth.admin, bFilter)
        if (deny) return deny
      }
    }

    if (
      status &&
      !VALID_BOOKING_STATUSES.includes(status as (typeof VALID_BOOKING_STATUSES)[number])
    ) {
      return fail('Bộ lọc trạng thái đơn thuê chưa hợp lệ.')
    }
    if (
      consultFilter &&
      !VALID_CONSULT_FILTERS.includes(consultFilter as (typeof VALID_CONSULT_FILTERS)[number])
    ) {
      return fail('Bộ lọc tư vấn chưa hợp lệ.')
    }

    await sweepExpiredPayments(payload)
    const [res, consultRes, site, branchesRes, warehousesRes] = await Promise.all([
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 2,
        limit: 500,
        sort: '-createdAt',
        ...(status ? { where: { status: { equals: status } } } : {}),
      }),
      payload.find({
        collection: 'consultations',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: '-createdAt',
      }),
      payload.findGlobal({
        slug: 'nori-site',
        overrideAccess: true,
        draft: false,
        depth: 0,
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
    ])
    const branchNameMap = new Map(branchesRes.docs.map((br) => [String(br.id), br.name]))

    const siteRec = site as unknown as Record<string, unknown>
    const siteConfig = buildSitePaymentConfigFromDoc(siteRec)
    const bookingIds = res.docs.map((b) => b.id)

    const [paymentsRes, refundsRes] =
      bookingIds.length > 0
        ? await Promise.all([
            payload.find({
              collection: 'payments',
              overrideAccess: true,
              depth: 0,
              limit: 1000,
              sort: '-createdAt',
              where: { booking: { in: bookingIds } },
            }),
            payload
              .find({
                collection: 'refunds',
                overrideAccess: true,
                depth: 0,
                limit: 1000,
                sort: '-createdAt',
                where: { booking: { in: bookingIds } },
              })
              .catch(() => ({ docs: [] as Refund[] })),
          ])
        : [{ docs: [] as Payment[] }, { docs: [] as Refund[] }]

    const payByBooking = new Map<string, Payment[]>()
    for (const p of paymentsRes.docs) {
      const bId = relationId(p.booking)
      if (!bId) continue
      const list = payByBooking.get(String(bId)) ?? []
      list.push(p)
      payByBooking.set(String(bId), list)
    }

    const refundByBooking = new Map<string, Refund[]>()
    for (const r of refundsRes.docs) {
      const bId = relationId(r.booking)
      if (!bId) continue
      const list = refundByBooking.get(String(bId)) ?? []
      list.push(r)
      refundByBooking.set(String(bId), list)
    }

    const consultByBooking = new Map<string, ConsultationView>()
    for (const c of consultRes.docs) {
      const bId = typeof c.booking === 'object' && c.booking ? c.booking.id : c.booking
      if (!bId) continue
      const staffId =
        typeof c.assignedStaff === 'object' && c.assignedStaff
          ? c.assignedStaff.id
          : typeof c.assignedStaff === 'string'
            ? c.assignedStaff
            : null
      consultByBooking.set(String(bId), {
        id: c.id,
        bookingId: String(bId),
        bookingKey: c.bookingKeySnapshot ?? String(bId),
        customerName: c.customerNameSnapshot ?? 'Khách hàng',
        customerPhone: c.customerPhoneSnapshot ?? null,
        customerEmail: c.customerEmailSnapshot ?? null,
        vehicleName: c.vehicleNameSnapshot ?? '',
        startDate: c.startDateSnapshot ?? '',
        endDate: c.endDateSnapshot ?? '',
        approvedAt: c.approvedAt,
        approvedBy: c.approvedBy ?? null,
        expectedContactDate: c.expectedContactDate,
        workingHoursWindow: c.workingHoursWindow ?? null,
        isUrgent: Boolean(c.isUrgent),
        assignedStaffId: staffId,
        assignedStaffName: c.assignedStaffName ?? null,
        status: c.status,
        callbackScheduledAt: c.callbackScheduledAt ?? null,
        internalNote: c.internalNote ?? null,
        contactLogs: (c.contactLogs ?? []).map((l) => ({
          contactedAt: l.contactedAt,
          staffName: l.staffName ?? null,
          outcome: l.outcome,
          note: l.note ?? null,
          nextCallbackAt: l.nextCallbackAt ?? null,
        })),
        createdAt: c.createdAt,
      })
    }

    const bhConfig = {
      timezone: String(siteRec.businessTimezone ?? 'Asia/Ho_Chi_Minh'),
      workingDays: String(siteRec.workingDays ?? '1,2,3,4,5'),
      workStartTime: siteRec.workStartTime ? String(siteRec.workStartTime) : null,
      workEndTime: siteRec.workEndTime ? String(siteRec.workEndTime) : null,
      lunchBreakStart: siteRec.lunchBreakStart ? String(siteRec.lunchBreakStart) : null,
      lunchBreakEnd: siteRec.lunchBreakEnd ? String(siteRec.lunchBreakEnd) : null,
      holidays: Array.isArray(siteRec.holidays)
        ? (siteRec.holidays as { date: string; name?: string }[])
        : [],
      fallbackHoursLabel: site.openingHours ?? null,
    }
    const today = businessToday()
    const unresolvedCustomerIds = res.docs
      .map((b) => (typeof b.customer === 'string' ? b.customer : ''))
      .filter(Boolean)
    const customerNameMap = await resolveCustomerDisplayNames(payload, unresolvedCustomerIds)

    const mapped = res.docs.map((b) => {
      const consultation = consultByBooking.get(String(b.id)) ?? null
      const previewSlot = calculateNextContactSlot(new Date(), bhConfig, {
        startDate: b.startDate,
        pickupTime: b.pickupTime ?? '08:00',
      })
      const isUrgent = Boolean(
        b.isUrgentApproval ||
        consultation?.isUrgent ||
        (['PENDING', 'DEPOSIT_PENDING'].includes(b.status ?? 'PENDING') && previewSlot.isUrgent),
      )
      const bPayments = payByBooking.get(String(b.id)) ?? []
      const bRefunds = refundByBooking.get(String(b.id)) ?? []
      const financial = computeBookingFinancialsSync(b, bPayments, bRefunds, siteConfig)

      return {
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        revision: b.revision ?? 1,
        status: b.status ?? 'PENDING',
        customerId:
          typeof b.customer === 'object'
            ? b.customer?.id
            : b.customer
              ? String(b.customer)
              : undefined,
        customerName:
          typeof b.customer === 'object'
            ? b.customer?.fullName
            : (customerNameMap.get(String(b.customer ?? ''))?.fullName ?? 'Chưa cập nhật'),
        customerEmail:
          b.customerEmail ??
          (typeof b.customer === 'object'
            ? b.customer?.email
            : customerNameMap.get(String(b.customer ?? ''))?.email),
        vehicleId: typeof b.vehicle === 'object' ? b.vehicle?.id : String(b.vehicle),
        reference:
          b.vehicleReferenceSnapshot ?? (typeof b.vehicle === 'object' ? b.vehicle.reference : ''),
        modelName:
          b.vehicleNameSnapshot ??
          (typeof b.vehicle === 'object' && typeof b.vehicle.model === 'object'
            ? b.vehicle.model.name
            : 'Chưa cập nhật'),
        startDate: b.startDate,
        endDate: b.endDate,
        pickupTime: b.pickupTime ?? '08:00',
        returnTime: b.returnTime ?? '20:00',
        pickupLocation: b.pickupLocation ?? null,
        returnLocation: b.returnLocation ?? b.pickupLocation ?? null,
        pickupBranchId: relationId(b.pickupBranch) ?? null,
        pickupBranchName: relationId(b.pickupBranch)
          ? (branchNameMap.get(relationId(b.pickupBranch)!) ?? null)
          : null,
        returnBranchId: relationId(b.returnBranch) ?? null,
        returnBranchName: relationId(b.returnBranch)
          ? (branchNameMap.get(relationId(b.returnBranch)!) ?? null)
          : null,
        actualReturnBranchId: relationId(b.actualReturnBranch) ?? null,
        actualReturnBranchName: relationId(b.actualReturnBranch)
          ? (branchNameMap.get(relationId(b.actualReturnBranch)!) ?? null)
          : null,
        actualReturnWarehouseId: relationId(b.actualReturnWarehouse) ?? null,
        isOneWay: Boolean(b.isOneWay),
        pickupMethod: b.pickupMethod ?? (b.deliveryRequested ? 'HOME_DELIVERY' : 'BRANCH_PICKUP'),
        returnMethod: b.returnMethod ?? 'BRANCH_RETURN',
        deliveryAddress: b.deliveryAddress ?? null,
        pickupAddress: b.pickupAddress ?? null,
        locationSurchargeSnapshot: b.locationSurchargeSnapshot ?? 0,
        oneWayFeeSnapshot: b.oneWayFeeSnapshot ?? 0,
        pickupFeeSnapshot: b.pickupFeeSnapshot ?? 0,
        afterHoursFeeSnapshot: b.afterHoursFeeSnapshot ?? 0,
        returnFuelOrBattery: b.returnFuelOrBattery ?? null,
        returnInspectionStatus: b.returnInspectionStatus ?? null,
        scheduleConflictAlert: b.scheduleConflictAlert ?? null,
        deliveryRequested: Boolean(b.deliveryRequested),
        addonServices: b.addonServices ?? null,
        customerPhone:
          b.customerPhone ?? (typeof b.customer === 'object' ? b.customer?.phone : null) ?? null,
        driverLicenseNumber: b.driverLicenseNumber ?? null,
        note: b.note ?? null,
        handoverNote: b.handoverNote ?? null,
        extraFee: b.extraFee ?? 0,
        extraFeeNote: b.extraFeeNote ?? null,
        contractNumber: b.contractNumber ?? null,
        returnOdometer: b.returnOdometer ?? null,
        returnCondition: b.returnCondition ?? null,
        promoCode: b.promoCode ?? null,
        promoDiscountAmount: b.promoDiscountAmount ?? 0,
        expectedContactDate:
          b.expectedContactDate ??
          consultation?.expectedContactDate ??
          previewSlot.expectedContactDate,
        workingHoursSnapshot:
          b.workingHoursSnapshot ??
          consultation?.workingHoursWindow ??
          previewSlot.workingHoursLabel,
        isUrgentApproval: isUrgent,
        consultation,
        statusHistory: (b.statusHistory ?? []).map((h) => ({
          status: h.status,
          changedAt: h.changedAt,
          changedBy: h.changedBy ?? null,
          note: h.note ?? null,
        })),
        modificationHistory: (b.modificationHistory ?? []).map((m) => ({
          modifiedAt: m.modifiedAt,
          modifiedBy: m.modifiedBy ?? null,
          actorType: m.actorType ?? null,
          statusAtChange: m.statusAtChange ?? null,
          reason: m.reason ?? null,
          previousTotalPrice: m.previousTotalPrice ?? 0,
          newTotalPrice: m.newTotalPrice ?? 0,
          previousDeposit: m.previousDeposit ?? 0,
          newDeposit: m.newDeposit ?? 0,
          changes: (m.changes ?? []).map((c) => ({
            field: c.field,
            label: c.label,
            before: c.before ?? null,
            after: c.after ?? null,
          })),
        })),
        totalDays: b.totalDays ?? 0,
        dailyPriceSnapshot: b.dailyPriceSnapshot ?? 0,
        baseRentPrice: b.baseRentPrice ?? 0,
        weekendSurchargeTotal: b.weekendSurchargeTotal ?? 0,
        deliveryFeeSnapshot: b.deliveryFeeSnapshot ?? 0,
        addonFeeTotal: b.addonFeeTotal ?? 0,
        discountAmount: b.discountAmount ?? 0,
        totalPrice: b.totalPrice ?? 0,
        depositSnapshot: b.depositSnapshot ?? 0,
        initialPaymentDue:
          financial.reservationDepositRequired ?? b.initialPaymentDue ?? b.depositSnapshot ?? 0,
        remainingAmount: financial.totalRemainingRentalObligation ?? b.totalPrice ?? 0,
        hasPaymentRecord: bPayments.length > 0,
        paymentConfirmed: bPayments.some((p) =>
          ['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(p.status),
        ),
        paymentStatusSummary: financial.paymentStatusSummary,
        financial: {
          reservationDepositRequired: financial.reservationDepositRequired,
          securityDepositAmount: financial.securityDepositAmount,
          paidDepositAmount: financial.paidDepositAmount,
          paidRentalAmount: financial.paidRentalAmount,
          paidExtraFeeAmount: financial.paidExtraFeeAmount,
          paidSecurityDepositAmount: financial.paidSecurityDepositAmount,
          totalVerifiedReceived: financial.totalVerifiedReceived,
          rentalRevenueCollected: financial.rentalRevenueCollected,
          securityDepositHeld: financial.securityDepositHeld,
          overpaidAmount: financial.overpaidAmount,
          totalRefundedAmount: financial.totalRefundedAmount,
          pendingRefundAmount: financial.pendingRefundAmount,
          netCollectedAmount: financial.netCollectedAmount,
          remainingDepositDue: financial.remainingDepositDue,
          remainingRentalBeforeExtra: financial.remainingRentalBeforeExtra,
          remainingExtraFeeDue: financial.remainingExtraFeeDue,
          totalRemainingRentalObligation: financial.totalRemainingRentalObligation,
          remainingSecurityDepositDue: financial.remainingSecurityDepositDue,
          refundableBalance: financial.refundableBalance,
          paymentStatusSummary: financial.paymentStatusSummary,
          hasPendingPayment: financial.hasPendingPayment,
          hasAnomaly: financial.hasAnomaly,
          activePendingPaymentId: financial.activePendingPaymentId,
        },
        payments: bPayments.map((p) => ({
          id: p.id,
          reference: p.reference ?? p.id,
          bookingId: b.id,
          bookingKey: b.bookingKey ?? b.id,
          paymentType: p.paymentType,
          method: p.method,
          provider: p.provider ?? 'MANUAL',
          environment: p.environment ?? siteConfig.environment,
          amount: p.amount,
          expectedAmount: p.expectedAmount ?? p.amount,
          receivedAmount: p.receivedAmount ?? 0,
          refundedAmount: p.refundedAmount ?? 0,
          overpaidAmount: p.overpaidAmount ?? 0,
          status: p.status,
          reconciliationStatus: p.reconciliationStatus ?? 'NONE',
          providerTransactionId: p.providerTransactionId ?? null,
          providerPaymentRef: p.providerPaymentRef ?? null,
          expiresAt: p.expiresAt ?? null,
          verifiedAt: p.verifiedAt ?? null,
          paidAt: p.paidAt ?? null,
          recordedBy: p.recordedBy ?? null,
          failureReason: p.failureReason ?? null,
          reconciliationNote: p.reconciliationNote ?? null,
          note: p.note ?? null,
          createdAt: p.createdAt,
        })),
        refunds: bRefunds.map((r) => ({
          id: r.id,
          reference: r.reference ?? r.id,
          bookingId: b.id,
          bookingKey: b.bookingKey ?? b.id,
          paymentId: relationId(r.payment) ?? null,
          refundType: r.refundType,
          amount: r.amount,
          reason: r.reason,
          status: r.status,
          provider: r.provider ?? 'MANUAL',
          providerRefundId: r.providerRefundId ?? null,
          requestedBy: r.requestedBy ?? null,
          approvedBy: r.approvedBy ?? null,
          completedBy: r.completedBy ?? null,
          requestedAt: r.requestedAt ?? r.createdAt,
          approvedAt: r.approvedAt ?? null,
          completedAt: r.completedAt ?? null,
          createdAt: r.createdAt,
        })),
        depositExpired: isDepositExpired(b.createdAt, b.status ?? 'PENDING'),
        createdAt: b.createdAt,
      }
    })

    const filtered = mapped.filter((b) => {
      if (
        branchIdFilter &&
        b.pickupBranchId !== branchIdFilter &&
        b.returnBranchId !== branchIdFilter &&
        b.actualReturnBranchId !== branchIdFilter
      ) {
        return false
      }
      if (pickupBranchIdFilter && b.pickupBranchId !== pickupBranchIdFilter) return false
      if (returnBranchIdFilter && b.returnBranchId !== returnBranchIdFilter) return false
      if (oneWayOnly && !b.isOneWay) return false
      if (
        deliveryOnly &&
        !b.deliveryRequested &&
        b.pickupMethod !== 'HOME_DELIVERY' &&
        b.returnMethod !== 'HOME_PICKUP'
      ) {
        return false
      }
      if (q) {
        const hay =
          `${b.bookingKey} ${b.reference} ${b.modelName} ${b.customerName} ${b.customerEmail ?? ''} ${b.customerPhone ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (consultFilter) {
        const c = b.consultation
        const openStatuses = ['PENDING_CONTACT', 'CONTACTING', 'NO_ANSWER', 'CALLBACK_SCHEDULED']
        if (consultFilter === 'PENDING_CONTACT') {
          return Boolean(c && c.status === 'PENDING_CONTACT')
        }
        if (consultFilter === 'DUE_TODAY') {
          return Boolean(c && openStatuses.includes(c.status) && c.expectedContactDate === today)
        }
        if (consultFilter === 'OVERDUE') {
          return Boolean(c && openStatuses.includes(c.status) && c.expectedContactDate < today)
        }
        if (consultFilter === 'URGENT') {
          return Boolean(
            b.isUrgentApproval && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(b.status),
          )
        }
        if (consultFilter === 'CONSULTED') {
          return Boolean(c && ['CONSULTED', 'COMPLETED'].includes(c.status))
        }
      }
      return true
    })

    const pageSize = 15
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safePage = Math.min(page, totalPages)

    return json({
      items: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      totalDocs: filtered.length,
      page: safePage,
      totalPages,
      branches: branchesRes.docs.map((br) => ({ id: String(br.id), code: br.code, name: br.name })),
      warehouses: warehousesRes.docs.map((wh) => ({
        id: String(wh.id),
        code: wh.code,
        name: wh.name,
        branchId: relationId(wh.branch) ?? '',
      })),
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['bookings', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const data = await body(request, [
      'id',
      'status',
      'expectedRevision',
      'handoverNote',
      'extraFee',
      'extraFeeNote',
      'contractNumber',
      'returnOdometer',
      'returnCondition',
      'actualReturnBranchId',
      'actualReturnWarehouseId',
      'returnFuelOrBattery',
      'returnInspectionStatus',
      'enforceFinancialClearance',
      'approveFinancialException',
    ])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
    const enforceFinancialClearance = Boolean(data.enforceFinancialClearance)
    const approveFinancialException = Boolean(data.approveFinancialException)
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
      return fail('Phiên bản đơn thuê đối chiếu không hợp lệ.')
    }
    if (!id) return fail('Thiếu mã đơn thuê.')
    if (!VALID_BOOKING_STATUSES.includes(status as (typeof VALID_BOOKING_STATUSES)[number])) {
      return fail('Trạng thái đơn thuê không hợp lệ.')
    }
    const handoverNote = text(data.handoverNote, 1000)
    const extraFeeNote = text(data.extraFeeNote, 300)
    const contractNumber = text(data.contractNumber, 80)
    const returnCondition = text(data.returnCondition, 500)
    const extraFee =
      data.extraFee !== undefined && data.extraFee !== null && data.extraFee !== ''
        ? Number(data.extraFee)
        : undefined
    if (extraFee !== undefined && (!Number.isSafeInteger(extraFee) || extraFee < 0)) {
      return fail('Phụ phí phát sinh phải là số nguyên không âm.')
    }
    const returnOdometer =
      data.returnOdometer !== undefined &&
      data.returnOdometer !== null &&
      data.returnOdometer !== ''
        ? Number(data.returnOdometer)
        : undefined
    if (
      returnOdometer !== undefined &&
      (!Number.isSafeInteger(returnOdometer) || returnOdometer < 0)
    ) {
      return fail('ODO lúc nhận lại xe phải là số nguyên không âm.')
    }

    const actualReturnBranchId = text(data.actualReturnBranchId, 100)
    const actualReturnWarehouseId = text(data.actualReturnWarehouseId, 100)
    const returnFuelOrBattery = text(data.returnFuelOrBattery, 80)
    const rawInspection = text(data.returnInspectionStatus, 30)
    const returnInspectionStatus = (
      ['NOT_APPLICABLE', 'PENDING_INSPECTION', 'PASSED', 'DAMAGED_NEEDS_REPAIR'].includes(
        rawInspection,
      )
        ? rawInspection
        : undefined
    ) as 'NOT_APPLICABLE' | 'PENDING_INSPECTION' | 'PASSED' | 'DAMAGED_NEEDS_REPAIR' | undefined

    return await withBookingWriteLock(async () => {
      const updated = await payload.update({
        collection: 'bookings',
        id,
        user,
        overrideAccess: false,
        context: {
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
          ...(enforceFinancialClearance ? { enforceFinancialClearance: true } : {}),
          ...(approveFinancialException ? { approveFinancialException: true } : {}),
        },
        data: {
          status: status as BookingStatus,
          ...(handoverNote ? { handoverNote } : {}),
          ...(extraFee !== undefined ? { extraFee } : {}),
          ...(extraFeeNote ? { extraFeeNote } : {}),
          ...(contractNumber ? { contractNumber } : {}),
          ...(returnOdometer !== undefined ? { returnOdometer } : {}),
          ...(returnCondition ? { returnCondition } : {}),
          ...(actualReturnBranchId ? { actualReturnBranch: actualReturnBranchId } : {}),
          ...(actualReturnWarehouseId ? { actualReturnWarehouse: actualReturnWarehouseId } : {}),
          ...(returnFuelOrBattery ? { returnFuelOrBattery } : {}),
          ...(returnInspectionStatus ? { returnInspectionStatus } : {}),
        },
      })
      return json({
        id: updated.id,
        status: updated.status,
        scheduleConflictAlert: updated.scheduleConflictAlert ?? null,
      })
    })
  } catch (error) {
    return apiError(error)
  }
}
