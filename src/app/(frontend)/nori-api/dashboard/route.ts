import { adminHasPermission } from '@/access/nori'
import { requireAdmin, resolveCustomerDisplayNames } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { withBookingWriteLock } from '@/lib/promo-service'
import { HOLD_STATUSES, isDepositExpired, type BookingStatus } from '@/lib/rental-rules'

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

const VALID_INQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'TEST_DRIVE_SCHEDULED',
  'DEPOSIT_PENDING',
  'CONTRACT_SIGNED',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
] as const

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth
    const canBookings = adminHasPermission(admin, 'bookings', 'read')
    const canInquiries = adminHasPermission(admin, 'inquiries', 'read')
    const canCustomers = adminHasPermission(admin, 'customers', 'read')
    const canVehicles = adminHasPermission(admin, 'vehicles', 'read')
    const canModels = adminHasPermission(admin, 'models', 'read')
    const canPayments = adminHasPermission(admin, 'payments', 'read')
    const canReports = adminHasPermission(admin, 'reports', 'read')
    const canBookingsOrReports = canBookings || canReports
    const params = new URL(request.url).searchParams
    const bookingPage = Number(params.get('bookingPage') ?? '1')
    const inquiryPage = Number(params.get('inquiryPage') ?? '1')
    if (
      !Number.isSafeInteger(bookingPage) ||
      bookingPage < 1 ||
      bookingPage > 100_000 ||
      !Number.isSafeInteger(inquiryPage) ||
      inquiryPage < 1 ||
      inquiryPage > 100_000
    ) {
      return fail('Số trang chưa hợp lệ.')
    }
    const bookingStatus = params.get('bookingStatus') || ''
    if (
      bookingStatus &&
      !VALID_BOOKING_STATUSES.includes(bookingStatus as (typeof VALID_BOOKING_STATUSES)[number])
    ) {
      return fail('Bộ lọc trạng thái đơn thuê chưa hợp lệ.')
    }
    const inquiryStatus = params.get('inquiryStatus') || ''
    if (
      inquiryStatus &&
      !VALID_INQUIRY_STATUSES.includes(inquiryStatus as (typeof VALID_INQUIRY_STATUSES)[number])
    ) {
      return fail('Bộ lọc trạng thái yêu cầu chưa hợp lệ.')
    }
    const emptyList = { docs: [], totalDocs: 0, page: 1, totalPages: 1 }
    const zeroCount = { totalDocs: 0 }

    const [
      vehicles,
      models,
      customers,
      bookings,
      inquiries,
      pending,
      depositPending,
      confirmed,
      readyHandover,
      ongoing,
      inspecting,
      completed,
      allModels,
      allVehicles,
      allBookingsSummary,
      customersListRes,
      reviewsRes,
      paymentsRes,
    ] = await Promise.all([
      canVehicles
        ? payload.count({
            collection: 'vehicles',
            user,
            overrideAccess: false,
            where: { status: { equals: 'ACTIVE' } },
          })
        : Promise.resolve(zeroCount),
      canModels
        ? payload.count({ collection: 'vehicle-models', user, overrideAccess: false })
        : Promise.resolve(zeroCount),
      canCustomers
        ? payload.count({ collection: 'users', user, overrideAccess: false })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.find({
            collection: 'bookings',
            user,
            overrideAccess: false,
            depth: 2,
            limit: 20,
            page: bookingPage,
            sort: '-createdAt',
            ...(bookingStatus ? { where: { status: { equals: bookingStatus } } } : {}),
          })
        : Promise.resolve(emptyList),
      canInquiries
        ? payload.find({
            collection: 'sales-inquiries',
            user,
            overrideAccess: false,
            depth: 1,
            limit: 20,
            page: inquiryPage,
            sort: '-createdAt',
            ...(inquiryStatus ? { where: { status: { equals: inquiryStatus } } } : {}),
          })
        : Promise.resolve(emptyList),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'PENDING' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'DEPOSIT_PENDING' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'CONFIRMED' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'READY_FOR_HANDOVER' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'ONGOING' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'INSPECTING' } },
          })
        : Promise.resolve(zeroCount),
      canBookings
        ? payload.count({
            collection: 'bookings',
            user,
            overrideAccess: false,
            where: { status: { equals: 'COMPLETED' } },
          })
        : Promise.resolve(zeroCount),
      canModels
        ? payload.find({
            collection: 'vehicle-models',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 100,
            sort: 'sortOrder',
          })
        : Promise.resolve(emptyList),
      canVehicles || canModels
        ? payload.find({
            collection: 'vehicles',
            user,
            overrideAccess: false,
            depth: 1,
            limit: 500,
            sort: 'reference',
          })
        : Promise.resolve(emptyList),
      canBookingsOrReports
        ? payload.find({
            collection: 'bookings',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 500,
            select: { status: true, totalPrice: true, createdAt: true },
          })
        : Promise.resolve(emptyList),
      canCustomers
        ? payload.find({
            collection: 'users',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 20,
            sort: '-createdAt',
            select: { fullName: true, email: true, phone: true, status: true, createdAt: true },
          })
        : Promise.resolve(emptyList),
      canCustomers
        ? payload.find({
            collection: 'reviews',
            user,
            overrideAccess: false,
            depth: 1,
            limit: 50,
            sort: '-createdAt',
          })
        : Promise.resolve(emptyList),
      canReports || canPayments
        ? payload.find({
            collection: 'payments',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 500,
            select: { amount: true, status: true, paymentType: true },
          })
        : Promise.resolve(emptyList),
    ])

    const unresolvedCustIds: string[] = []
    for (const b of bookings.docs) {
      if (typeof b.customer === 'string') unresolvedCustIds.push(b.customer)
    }
    for (const inq of inquiries.docs) {
      if (typeof inq.customer === 'string') unresolvedCustIds.push(inq.customer)
    }
    const customerNameMap = await resolveCustomerDisplayNames(payload, unresolvedCustIds)

    const byOperationStatus: Record<string, number> = {
      READY: 0,
      RENTED: 0,
      RESERVED: 0,
      MAINTENANCE: 0,
      SOLD: 0,
      INACTIVE: 0,
    }
    for (const v of allVehicles.docs) {
      const op = v.operationStatus ?? 'READY'
      byOperationStatus[op] = (byOperationStatus[op] ?? 0) + 1
    }
    const activeFleetTotal = allVehicles.docs.filter((v) => v.status === 'ACTIVE').length
    const deployedCount = (byOperationStatus.RENTED ?? 0) + (byOperationStatus.RESERVED ?? 0)
    const utilizationRate =
      activeFleetTotal > 0 ? Math.round((deployedCount / activeFleetTotal) * 100) : 0
    let completedContractValue = 0
    let activeContractValue = 0
    let expiredDepositCount = 0
    const dailyMap = new Map<
      string,
      { bookings: number; inquiries: number; expectedValue: number }
    >()
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86_400_000)
      const key = d.toISOString().slice(0, 10)
      dailyMap.set(key, { bookings: 0, inquiries: 0, expectedValue: 0 })
    }
    for (const b of allBookingsSummary.docs) {
      const st = b.status ?? 'PENDING'
      const val = Number(b.totalPrice ?? 0)
      if (st === 'COMPLETED') completedContractValue += val
      else if (HOLD_STATUSES.includes(st as (typeof HOLD_STATUSES)[number]))
        activeContractValue += val
      if (isDepositExpired(b.createdAt, st)) expiredDepositCount += 1
      const dayKey = String(b.createdAt ?? '').slice(0, 10)
      const bucket = dailyMap.get(dayKey)
      if (bucket) {
        bucket.bookings += 1
        if (st !== 'CANCELLED' && st !== 'REJECTED') bucket.expectedValue += val
      }
    }
    for (const inq of inquiries.docs) {
      const dayKey = String(inq.createdAt ?? '').slice(0, 10)
      const bucket = dailyMap.get(dayKey)
      if (bucket) bucket.inquiries += 1
    }
    const confirmedRevenue = paymentsRes.docs.reduce(
      (sum, p) =>
        p.status === 'CONFIRMED' && p.paymentType !== 'REFUND' ? sum + Number(p.amount ?? 0) : sum,
      0,
    )
    const timeSeries = Array.from(dailyMap.entries()).map(([date, vals]) => ({
      date,
      ...vals,
    }))

    const dataCompleteness = allModels.docs.map((m) => {
      const fleet = allVehicles.docs.filter(
        (v) => (typeof v.model === 'object' ? v.model.id : v.model) === m.id,
      )
      const hasCover = Boolean(m.cover)
      const hasInteriorPhoto =
        m.category === 'MOTORBIKE' || (m.gallery ?? []).some((g) => g.kind === 'INTERIOR')
      const hasSpecs = (m.specifications ?? []).length >= 6
      const hasVariants = (m.variants ?? []).length >= 1
      const hasSource = Boolean(m.source)
      const hasFleet = fleet.length > 0
      const hasPrice = fleet.some((v) => Boolean(v.pricePerDay || v.salePrice))
      const missing: string[] = []
      if (!hasCover) missing.push('Thiếu ảnh đại diện')
      if (!hasInteriorPhoto) missing.push('Thiếu ảnh nội thất')
      if (!hasSpecs) missing.push('Thông số chưa đầy đủ')
      if (!hasVariants) missing.push('Thiếu phiên bản')
      if (!hasSource) missing.push('Thiếu nguồn tham chiếu')
      if (!hasFleet) missing.push('Chưa có xe thực tế')
      if (!hasPrice) missing.push('Thiếu giá thuê/bán')
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        category: m.category,
        verificationStatus: m.verificationStatus ?? 'VERIFIED',
        fleetCount: fleet.length,
        score: Math.round(((7 - missing.length) / 7) * 100),
        missing,
      }
    })

    return json({
      adminEmail: admin.email,
      adminName: admin.fullName,
      adminRole: admin.adminRole,
      vehicles: vehicles.totalDocs,
      models: models.totalDocs,
      customers: customers.totalDocs,
      totalBookings: bookings.totalDocs,
      bookingPage: bookings.page ?? 1,
      bookingTotalPages: Math.max(1, bookings.totalPages ?? 1),
      totalInquiries: inquiries.totalDocs,
      inquiryPage: inquiries.page ?? 1,
      inquiryTotalPages: Math.max(1, inquiries.totalPages ?? 1),
      statuses: {
        PENDING: pending.totalDocs,
        DEPOSIT_PENDING: depositPending.totalDocs,
        CONFIRMED: confirmed.totalDocs,
        READY_FOR_HANDOVER: readyHandover.totalDocs,
        ONGOING: ongoing.totalDocs,
        INSPECTING: inspecting.totalDocs,
        COMPLETED: completed.totalDocs,
      },
      bookings: canBookings
        ? bookings.docs.map((b) => ({
            id: b.id,
            bookingKey: b.bookingKey ?? b.id,
            revision: b.revision ?? 1,
            status: b.status ?? 'PENDING',
            customerName:
              typeof b.customer === 'object'
                ? b.customer?.fullName
                : (customerNameMap.get(String(b.customer ?? ''))?.fullName ?? 'Chưa cập nhật'),
            reference:
              b.vehicleReferenceSnapshot ??
              (typeof b.vehicle === 'object' ? b.vehicle.reference : ''),
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
            deliveryRequested: Boolean(b.deliveryRequested),
            addonServices: b.addonServices ?? null,
            customerPhone: b.customerPhone ?? null,
            driverLicenseNumber: b.driverLicenseNumber ?? null,
            note: b.note ?? null,
            handoverNote: b.handoverNote ?? null,
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
            remainingAmount: b.totalPrice ?? 0,
            depositExpired: isDepositExpired(b.createdAt, b.status ?? 'PENDING'),
            createdAt: b.createdAt,
          }))
        : [],
      inquiries: canInquiries
        ? inquiries.docs.map((inq) => ({
            id: inq.id,
            reference: inq.reference ?? inq.id,
            inquiryType: inq.inquiryType ?? 'CONSULTATION',
            status: inq.status ?? 'NEW',
            customerName:
              typeof inq.customer === 'object'
                ? inq.customer?.fullName
                : (customerNameMap.get(String(inq.customer ?? ''))?.fullName ?? 'Chưa cập nhật'),
            phone: inq.phone,
            modelName: typeof inq.model === 'object' ? inq.model.name : 'Chưa cập nhật',
            modelSlug: typeof inq.model === 'object' ? inq.model.slug : '',
            vehicleReference: inq.vehicleReference ?? null,
            variantName: inq.variantName ?? null,
            colorName: inq.colorName ?? null,
            paymentMethod: inq.paymentMethod ?? null,
            preferredDate: inq.preferredDate ?? null,
            preferredLocation: inq.preferredLocation ?? null,
            quotedPriceSnapshot: inq.quotedPriceSnapshot ?? null,
            estimatedRollingSnapshot: inq.estimatedRollingSnapshot ?? null,
            note: inq.note ?? null,
            depositExpired: isDepositExpired(inq.createdAt, inq.status ?? 'NEW'),
            createdAt: inq.createdAt,
          }))
        : [],
      customersList: canCustomers
        ? customersListRes.docs.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            phone: u.phone ?? null,
            status: u.status ?? 'ACTIVE',
            createdAt: u.createdAt,
          }))
        : [],
      vehiclesList: canVehicles
        ? allVehicles.docs.map((v) => ({
            id: v.id,
            reference: v.reference,
            licensePlate: v.licensePlate ?? null,
            modelName: typeof v.model === 'object' && v.model ? v.model.name : 'Chưa cập nhật',
            modelSlug: typeof v.model === 'object' && v.model ? v.model.slug : '',
            intent: v.intent ?? 'BOTH',
            operationStatus: v.operationStatus ?? 'READY',
            status: v.status ?? 'ACTIVE',
            pricePerDay: v.pricePerDay ?? null,
            salePrice: v.salePrice ?? null,
            depositAmount: v.depositAmount ?? null,
            odometer: v.odometer ?? null,
            isDemo: Boolean(v.isDemo),
          }))
        : [],
      reviewsList: canCustomers
        ? reviewsRes.docs.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title ?? null,
            comment: r.comment,
            status: r.status ?? 'PUBLISHED',
            customerName:
              typeof r.customer === 'object' && r.customer ? r.customer.fullName : 'Khách hàng',
            modelName: typeof r.model === 'object' && r.model ? r.model.name : 'Chưa cập nhật',
            vehicleReference:
              typeof r.vehicle === 'object' && r.vehicle ? r.vehicle.reference : null,
            createdAt: r.createdAt,
          }))
        : [],
      fleetStats: {
        byOperationStatus: canVehicles ? byOperationStatus : {},
        utilizationRate: canVehicles ? utilizationRate : 0,
        completedContractValue: canReports || canBookings ? completedContractValue : 0,
        activeContractValue: canReports || canBookings ? activeContractValue : 0,
        expiredDepositCount: canBookings ? expiredDepositCount : 0,
        confirmedRevenue: canReports ? confirmedRevenue : 0,
      },
      timeSeries: canReports || canBookings ? timeSeries : [],
      dataCompleteness: canModels ? dataCompleteness : [],
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ message: 'Bạn không có quyền thực hiện thao tác này.' })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth
    const data = await body(request, [
      'id',
      'status',
      'expectedRevision',
      'entity',
      'handoverNote',
      'extraFee',
      'extraFeeNote',
      'adminNote',
      'operationStatus',
      'pricePerDay',
      'salePrice',
      'depositAmount',
      'odometer',
    ])
    const entity = text(data.entity, 20)
    const status = text(data.status, 30)
    const forbidModule = (msg: string) => fail(msg, 403, 'FORBIDDEN')
    if (entity === 'user') {
      if (!adminHasPermission(admin, 'customers', 'update')) {
        return forbidModule('Tài khoản chưa được cấp quyền cập nhật Khách hàng.')
      }
      if (!['ACTIVE', 'DISABLED'].includes(status))
        return fail('Trạng thái tài khoản không hợp lệ.')
      const result = await payload.update({
        collection: 'users',
        id: text(data.id, 100),
        user,
        overrideAccess: false,
        data: { status: status as 'ACTIVE' | 'DISABLED' },
      })
      return json({ id: result.id, status: result.status })
    }
    if (entity === 'review') {
      if (!adminHasPermission(admin, 'customers', 'update')) {
        return forbidModule('Tài khoản chưa được cấp quyền kiểm duyệt Đánh giá.')
      }
      if (!['PUBLISHED', 'HIDDEN'].includes(status))
        return fail('Trạng thái đánh giá không hợp lệ.')
      const result = await payload.update({
        collection: 'reviews',
        id: text(data.id, 100),
        user,
        overrideAccess: false,
        data: { status: status as 'PUBLISHED' | 'HIDDEN' },
      })
      return json({ id: result.id, status: result.status })
    }
    if (entity === 'vehicle') {
      if (!adminHasPermission(admin, 'vehicles', 'update')) {
        return forbidModule('Tài khoản chưa được cấp quyền cập nhật Phương tiện.')
      }
      const vehicleId = text(data.id, 100)
      if (!vehicleId) return fail('Thiếu mã phương tiện cần cập nhật.')
      const patchData: Record<string, unknown> = {}
      const opStatus = text(data.operationStatus, 30)
      if (opStatus) {
        if (
          !['READY', 'RENTED', 'RESERVED', 'MAINTENANCE', 'SOLD', 'INACTIVE'].includes(opStatus)
        ) {
          return fail('Trạng thái vận hành phương tiện không hợp lệ.')
        }
        patchData.operationStatus = opStatus
      }
      if (status) {
        if (!['ACTIVE', 'INACTIVE'].includes(status)) {
          return fail('Trạng thái kinh doanh phương tiện không hợp lệ.')
        }
        patchData.status = status
      }
      for (const [key, maxVal, minVal] of [
        ['pricePerDay', 100_000_000, 1],
        ['salePrice', 100_000_000_000, 1],
        ['depositAmount', 10_000_000_000, 0],
        ['odometer', 10_000_000, 0],
      ] as const) {
        if (data[key] !== undefined) {
          if (data[key] === null || data[key] === '') {
            patchData[key] = null
          } else {
            const num = Number(data[key])
            if (!Number.isSafeInteger(num) || num < minVal || num > maxVal) {
              return fail(`Giá trị trường ${key} không hợp lệ.`)
            }
            patchData[key] = num
          }
        }
      }
      if (!Object.keys(patchData).length) return fail('Không có trường hợp lệ để cập nhật.')
      const result = await payload.update({
        collection: 'vehicles',
        id: vehicleId,
        user,
        overrideAccess: false,
        data: patchData,
      })
      return json({
        id: result.id,
        operationStatus: result.operationStatus,
        status: result.status,
      })
    }
    if (entity === 'inquiry') {
      if (!adminHasPermission(admin, 'inquiries', 'update')) {
        return forbidModule('Tài khoản chưa được cấp quyền cập nhật Yêu cầu mua xe.')
      }
      if (!VALID_INQUIRY_STATUSES.includes(status as (typeof VALID_INQUIRY_STATUSES)[number]))
        return fail('Trạng thái yêu cầu không hợp lệ.')
      const adminNote = text(data.adminNote, 1000)
      const result = await payload.update({
        collection: 'sales-inquiries',
        id: text(data.id, 100),
        user,
        overrideAccess: false,
        data: {
          status: status as (typeof VALID_INQUIRY_STATUSES)[number],
          ...(adminNote ? { adminNote } : {}),
        },
      })
      return json({ id: result.id, status: result.status })
    }
    if (
      ![
        'DEPOSIT_PENDING',
        'CONFIRMED',
        'READY_FOR_HANDOVER',
        'REJECTED',
        'ONGOING',
        'INSPECTING',
        'CANCELLED',
        'COMPLETED',
      ].includes(status)
    )
      return fail('Trạng thái không hợp lệ.')
    const handoverNote = text(data.handoverNote, 1000)
    const extraFeeNote = text(data.extraFeeNote, 300)
    const extraFee =
      data.extraFee !== undefined && data.extraFee !== null && data.extraFee !== ''
        ? Number(data.extraFee)
        : undefined
    if (extraFee !== undefined && (!Number.isSafeInteger(extraFee) || extraFee < 0)) {
      return fail('Phụ phí phát sinh phải là số nguyên không âm.')
    }
    if (!adminHasPermission(admin, 'bookings', 'update')) {
      return forbidModule('Tài khoản chưa được cấp quyền cập nhật Đơn thuê xe.')
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
      return fail('Phiên bản đơn thuê đối chiếu không hợp lệ.')
    }
    const result = await withBookingWriteLock(() =>
      payload.update({
        collection: 'bookings',
        id: text(data.id, 100),
        user,
        overrideAccess: false,
        context: {
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        },
        data: {
          status: status as BookingStatus,
          ...(handoverNote ? { handoverNote } : {}),
          ...(extraFee !== undefined ? { extraFee } : {}),
          ...(extraFeeNote ? { extraFeeNote } : {}),
        },
      }),
    )
    return json({ id: result.id, status: result.status })
  } catch (error) {
    return apiError(error)
  }
}
