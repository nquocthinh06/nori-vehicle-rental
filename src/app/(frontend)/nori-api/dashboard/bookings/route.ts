import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  businessToday,
  calculateNextContactSlot,
  isDepositExpired,
  type BookingStatus,
} from '@/lib/rental-rules'
import type { ConsultationView } from '@/lib/domain-types'

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
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') || '1') || 1)
    const status = sp.get('status') || ''
    const consultFilter = sp.get('consultFilter') || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

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

    const [res, consultRes, site] = await Promise.all([
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
    ])

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

    const siteRec = site as unknown as Record<string, unknown>
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

      return {
        id: b.id,
        bookingKey: b.bookingKey ?? b.id,
        revision: b.revision ?? 1,
        status: b.status ?? 'PENDING',
        customerId: typeof b.customer === 'object' ? b.customer?.id : undefined,
        customerName: typeof b.customer === 'object' ? b.customer?.fullName : 'Chưa cập nhật',
        customerEmail:
          b.customerEmail ?? (typeof b.customer === 'object' ? b.customer?.email : undefined),
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
        initialPaymentDue: b.initialPaymentDue ?? b.depositSnapshot ?? 0,
        remainingAmount: b.remainingAmount ?? b.totalPrice ?? 0,
        depositExpired: isDepositExpired(b.createdAt, b.status ?? 'PENDING'),
        createdAt: b.createdAt,
      }
    })

    const filtered = mapped.filter((b) => {
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
    })
  } catch (error) {
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
      'id',
      'status',
      'handoverNote',
      'extraFee',
      'extraFeeNote',
      'contractNumber',
      'returnOdometer',
      'returnCondition',
    ])
    const id = text(data.id, 100)
    const status = text(data.status, 30)
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

    const updated = await payload.update({
      collection: 'bookings',
      id,
      user,
      overrideAccess: false,
      data: {
        status: status as BookingStatus,
        ...(handoverNote ? { handoverNote } : {}),
        ...(extraFee !== undefined ? { extraFee } : {}),
        ...(extraFeeNote ? { extraFeeNote } : {}),
        ...(contractNumber ? { contractNumber } : {}),
        ...(returnOdometer !== undefined ? { returnOdometer } : {}),
        ...(returnCondition ? { returnCondition } : {}),
      },
    })
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}
