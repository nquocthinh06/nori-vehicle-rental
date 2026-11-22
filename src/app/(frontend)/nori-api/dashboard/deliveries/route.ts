import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { txReqOptions, withAtomicResourceLock } from '@/lib/db-tx'
import { recordAudit } from '@/hooks/audit-nori'
import {
  DELIVERY_JOB_STATUSES,
  canTransitionDeliveryJob,
  hasDeliveryStaffTimeConflict,
  normalizeCode,
  validateNonNegativeVnd,
  type DeliveryJobStatus,
} from '@/lib/multi-branch-rules'
import { recordVehicleLocationEvent } from '@/lib/multi-branch-service'
import { relationId, validateTimeString } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['deliveries', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const branchFilter = sp.get('branchId')?.trim() || ''
    const statusFilter = sp.get('status')?.trim() || ''
    const jobTypeFilter = sp.get('jobType')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (branchFilter) {
      const deny = assertBranchScopeOrFail(admin, branchFilter)
      if (deny) return deny
    }

    const isDeliveryOnly = admin.staffTitle === 'DELIVERY_STAFF'

    const [zonesRes, jobsRes, branchesRes, bookingsRes, staffRes] = await Promise.all([
      payload.find({
        collection: 'delivery-zones',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 300,
        sort: 'name',
      }),
      payload.find({
        collection: 'delivery-jobs',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 300,
        sort: '-createdAt',
        ...(statusFilter && DELIVERY_JOB_STATUSES.includes(statusFilter as DeliveryJobStatus)
          ? { where: { status: { equals: statusFilter } } }
          : {}),
      }),
      payload.find({
        collection: 'branches',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 200,
        sort: 'name',
      }),
      !isDeliveryOnly
        ? payload.find({
            collection: 'bookings',
            user,
            overrideAccess: false,
            depth: 0,
            limit: 300,
            sort: '-createdAt',
            where: {
              status: { in: ['CONFIRMED', 'READY_FOR_HANDOVER', 'ONGOING'] },
            },
          })
        : Promise.resolve({ docs: [] }),
      payload.find({
        collection: 'admins',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        select: {
          email: true,
          fullName: true,
          staffTitle: true,
          accountStatus: true,
          branchScopeMode: true,
          assignedBranchIds: true,
        },
      }),
    ])

    const branchMap = new Map(branchesRes.docs.map((b) => [String(b.id), b]))

    const zones = zonesRes.docs
      .filter((z) => {
        const bId = relationId(z.branch) ?? ''
        if (branchFilter && bId !== branchFilter) return false
        if (q) {
          const hay = `${z.code} ${z.name} ${z.province} ${z.wards ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((z) => {
        const bId = relationId(z.branch) ?? ''
        const br = branchMap.get(bId)
        return {
          id: String(z.id),
          code: z.code,
          name: z.name,
          branchId: bId,
          branchName: br?.name ?? (typeof z.branch === 'object' && z.branch ? z.branch.name : ''),
          province: z.province,
          wards: z.wards ?? '',
          deliveryFee: z.deliveryFee,
          pickupFee: z.pickupFee,
          afterHoursFee: z.afterHoursFee ?? 0,
          freeOverOrderAmount: z.freeOverOrderAmount ?? null,
          serviceStartTime: z.serviceStartTime ?? '08:00',
          serviceEndTime: z.serviceEndTime ?? '20:00',
          estimatedTravelMinutes: z.estimatedTravelMinutes ?? 45,
          active: z.active !== false,
          notes: z.notes ?? '',
        }
      })

    const jobs = jobsRes.docs
      .filter((j) => {
        const bId = relationId(j.branch) ?? ''
        if (branchFilter && bId !== branchFilter) return false
        if (jobTypeFilter && j.jobType !== jobTypeFilter) return false
        if (q) {
          const hay =
            `${j.jobCode} ${j.bookingKeySnapshot ?? ''} ${j.contactName} ${j.address} ${j.assignedStaffName ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((j) => {
        const bId = relationId(j.branch) ?? ''
        const br = branchMap.get(bId)
        return {
          id: String(j.id),
          jobCode: j.jobCode,
          bookingId: relationId(j.booking) ?? '',
          bookingKey: j.bookingKeySnapshot ?? '',
          vehicleId: relationId(j.vehicle) ?? '',
          vehicleReference: j.vehicleReferenceSnapshot ?? '',
          branchId: bId,
          branchName: br?.name ?? (typeof j.branch === 'object' && j.branch ? j.branch.name : ''),
          deliveryZoneId: relationId(j.deliveryZone) ?? null,
          jobType: j.jobType,
          status: j.status,
          scheduledDate: j.scheduledDate,
          scheduledTime: j.scheduledTime,
          estimatedDurationMinutes: j.estimatedDurationMinutes ?? 60,
          assignedStaffId: relationId(j.assignedStaff) ?? null,
          assignedStaffName: j.assignedStaffName ?? null,
          address: j.address,
          contactName: j.contactName,
          contactPhone: j.contactPhone,
          directionsNote: j.directionsNote ?? '',
          deliveryFeeSnapshot: j.deliveryFeeSnapshot ?? 0,
          extraCost: j.extraCost ?? 0,
          extraCostNote: j.extraCostNote ?? '',
          completedAt: j.completedAt ?? null,
          odometerAtHandover: j.odometerAtHandover ?? null,
          fuelOrBatteryLevel: j.fuelOrBatteryLevel ?? '',
          conditionReport: j.conditionReport ?? '',
          failureReason: j.failureReason ?? '',
          createdAt: j.createdAt,
        }
      })

    return json({
      zones,
      jobs,
      branches: branchesRes.docs.map((b) => ({
        id: String(b.id),
        code: b.code,
        name: b.name,
        province: b.province,
        supportsHomeDelivery: Boolean(b.supportsHomeDelivery),
        supportsHomePickup: Boolean(b.supportsHomePickup),
      })),
      bookings: bookingsRes.docs.map((b) => ({
        id: String(b.id),
        bookingKey: b.bookingKey ?? String(b.id),
        vehicleId: relationId(b.vehicle) ?? '',
        vehicleReference: b.vehicleReferenceSnapshot ?? '',
        pickupBranchId: relationId(b.pickupBranch) ?? null,
        returnBranchId: relationId(b.returnBranch) ?? null,
        pickupMethod: b.pickupMethod ?? 'BRANCH_PICKUP',
        returnMethod: b.returnMethod ?? 'BRANCH_RETURN',
        deliveryAddress: b.deliveryAddress ?? '',
        pickupAddress: b.pickupAddress ?? '',
        customerPhone: b.customerPhone ?? '',
        startDate: b.startDate,
        endDate: b.endDate,
        pickupTime: b.pickupTime ?? '08:00',
        returnTime: b.returnTime ?? '20:00',
        status: b.status,
      })),
      deliveryStaff: staffRes.docs
        .filter((a) => a.accountStatus !== 'REVOKED' && a.accountStatus !== 'SUSPENDED')
        .map((a) => ({
          id: String(a.id),
          email: a.email,
          fullName: a.fullName ?? a.email,
          staffTitle: a.staffTitle ?? 'OPERATOR',
          assignedBranchIds: Array.isArray(a.assignedBranchIds)
            ? (a.assignedBranchIds as string[])
            : [],
        })),
      scope: {
        isGlobal: admin.isGlobalScope,
        assignedBranchIds: admin.assignedBranchIds,
        isDeliveryOnly,
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['deliveries', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'entity',
      // Zone fields
      'code',
      'name',
      'branchId',
      'province',
      'wards',
      'deliveryFee',
      'pickupFee',
      'afterHoursFee',
      'freeOverOrderAmount',
      'serviceStartTime',
      'serviceEndTime',
      'estimatedTravelMinutes',
      'active',
      'notes',
      // Job fields
      'bookingId',
      'deliveryZoneId',
      'jobType',
      'scheduledDate',
      'scheduledTime',
      'estimatedDurationMinutes',
      'assignedStaffId',
      'address',
      'contactName',
      'contactPhone',
      'directionsNote',
      'deliveryFeeSnapshot',
    ])

    const entity = text(data.entity, 20) || 'job'

    if (entity === 'zone') {
      const code = normalizeCode(text(data.code, 32), 32)
      const name = text(data.name, 160)
      const branchId = text(data.branchId, 100)
      const province = text(data.province, 100)
      if (!code || !name || !branchId || !province) {
        return fail('Vui lòng nhập đầy đủ Mã khu vực, Tên khu vực, Chi nhánh và Tỉnh/Thành phố.')
      }
      const deny = assertBranchScopeOrFail(admin, branchId)
      if (deny) return deny

      for (const [field, label] of [
        ['deliveryFee', 'Phí giao xe'],
        ['pickupFee', 'Phí thu hồi xe'],
        ['afterHoursFee', 'Phí ngoài giờ'],
        ['freeOverOrderAmount', 'Ngưỡng miễn phí giao'],
      ] as const) {
        const chk = validateNonNegativeVnd(data[field], label)
        if (!chk.valid) return fail(chk.error!)
      }

      const startT = text(data.serviceStartTime, 5) || '08:00'
      const endT = text(data.serviceEndTime, 5) || '20:00'
      if (!validateTimeString(startT) || !validateTimeString(endT)) {
        return fail('Khung giờ phục vụ giao nhận không hợp lệ (HH:MM).')
      }

      const created = await payload.create({
        collection: 'delivery-zones',
        user,
        overrideAccess: false,
        data: {
          code,
          name,
          branch: branchId,
          province,
          wards: text(data.wards, 500) || undefined,
          deliveryFee: Number(data.deliveryFee ?? 0),
          pickupFee: Number(data.pickupFee ?? 0),
          afterHoursFee: Number(data.afterHoursFee ?? 0),
          freeOverOrderAmount:
            data.freeOverOrderAmount !== undefined &&
            data.freeOverOrderAmount !== '' &&
            data.freeOverOrderAmount !== null
              ? Number(data.freeOverOrderAmount)
              : undefined,
          serviceStartTime: startT,
          serviceEndTime: endT,
          estimatedTravelMinutes:
            data.estimatedTravelMinutes !== undefined && data.estimatedTravelMinutes !== ''
              ? Math.max(5, Number(data.estimatedTravelMinutes))
              : 45,
          active: data.active !== false,
          notes: text(data.notes, 500) || undefined,
        },
      })
      return json({ id: created.id, code: created.code, name: created.name }, 201)
    }

    // Create Delivery/Pickup Job
    const bookingId = text(data.bookingId, 100)
    const jobType = data.jobType === 'PICKUP' ? 'PICKUP' : 'DELIVERY'
    const scheduledDate = text(data.scheduledDate, 10)
    const scheduledTime = text(data.scheduledTime, 5)
    const estimatedDurationMinutes =
      data.estimatedDurationMinutes !== undefined && data.estimatedDurationMinutes !== ''
        ? Math.max(15, Number(data.estimatedDurationMinutes))
        : 60

    if (
      !bookingId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ||
      !validateTimeString(scheduledTime)
    ) {
      return fail('Vui lòng chọn Đơn thuê, Ngày giao nhận (YYYY-MM-DD) và Giờ hẹn hợp lệ (HH:MM).')
    }

    const booking = await payload
      .findByID({ collection: 'bookings', id: bookingId, user, overrideAccess: false, depth: 1 })
      .catch(() => null)
    if (!booking) return fail('Không tìm thấy đơn thuê hoặc bạn không có quyền thao tác.', 404)

    const branchId =
      text(data.branchId, 100) ||
      (jobType === 'PICKUP'
        ? relationId(booking.returnBranch)
        : relationId(booking.pickupBranch)) ||
      relationId(booking.pickupBranch)
    if (!branchId) {
      return fail('Đơn thuê chưa có chi nhánh phụ trách. Vui lòng chọn chi nhánh giao nhận.')
    }
    const deny = assertBranchScopeOrFail(admin, branchId)
    if (deny) return deny

    const address =
      text(data.address, 300) ||
      (jobType === 'PICKUP' ? booking.pickupAddress : booking.deliveryAddress) ||
      booking.pickupLocation ||
      ''
    if (!address) {
      return fail('Vui lòng nhập địa chỉ giao/thu hồi xe cho nhiệm vụ.')
    }

    const assignedStaffId = text(data.assignedStaffId, 100) || undefined
    let assignedStaffName: string | undefined
    if (assignedStaffId) {
      const staffDoc = await payload
        .findByID({ collection: 'admins', id: assignedStaffId, overrideAccess: true, depth: 0 })
        .catch(() => null)
      if (
        !staffDoc ||
        staffDoc.accountStatus === 'REVOKED' ||
        staffDoc.accountStatus === 'SUSPENDED'
      ) {
        return fail('Nhân viên giao nhận không tồn tại hoặc đã ngừng hoạt động.', 400)
      }
      assignedStaffName = staffDoc.fullName ?? staffDoc.email

      // DL-06: Check staff schedule time conflict!
      const existingJobs = await payload.find({
        collection: 'delivery-jobs',
        overrideAccess: true,
        depth: 0,
        limit: 100,
        where: {
          and: [
            { assignedStaff: { equals: assignedStaffId } },
            { scheduledDate: { equals: scheduledDate } },
            { status: { in: ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'] } },
          ],
        },
      })
      const conflict = hasDeliveryStaffTimeConflict(
        existingJobs.docs.map((j) => ({
          id: String(j.id),
          assignedStaffId: relationId(j.assignedStaff) ?? null,
          scheduledDate: j.scheduledDate,
          scheduledTime: j.scheduledTime,
          estimatedDurationMinutes: j.estimatedDurationMinutes ?? 60,
          status: j.status,
        })),
        { staffId: assignedStaffId, scheduledDate, scheduledTime, estimatedDurationMinutes },
      )
      if (conflict.conflict) {
        return fail(
          `Nhân viên ${assignedStaffName} đã có lịch giao nhận khác trùng khung giờ ${scheduledTime} ngày ${scheduledDate}.`,
          409,
          'DELIVERY_STAFF_TIME_CONFLICT',
        )
      }
    }

    const jobCode = `DLV-${scheduledDate.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    const contactName =
      text(data.contactName, 120) ||
      booking.deliveryContactName ||
      (typeof booking.customer === 'object' && booking.customer ? booking.customer.fullName : '') ||
      'Khách hàng'
    const contactPhone =
      text(data.contactPhone, 20) ||
      booking.deliveryContactPhone ||
      booking.customerPhone ||
      '0000000000'

    const created = await payload.create({
      collection: 'delivery-jobs',
      user,
      overrideAccess: false,
      data: {
        jobCode,
        booking: bookingId,
        bookingKeySnapshot: booking.bookingKey ?? bookingId,
        vehicle: relationId(booking.vehicle) ?? '',
        vehicleReferenceSnapshot: booking.vehicleReferenceSnapshot ?? undefined,
        branch: branchId,
        deliveryZone:
          text(data.deliveryZoneId, 100) || relationId(booking.deliveryZone) || undefined,
        jobType,
        status: assignedStaffId ? 'ASSIGNED' : 'PENDING',
        scheduledDate,
        scheduledTime,
        estimatedDurationMinutes,
        assignedStaff: assignedStaffId,
        assignedStaffName,
        address,
        contactName,
        contactPhone,
        directionsNote: text(data.directionsNote, 500) || booking.deliveryDirections || undefined,
        deliveryFeeSnapshot:
          data.deliveryFeeSnapshot !== undefined && data.deliveryFeeSnapshot !== ''
            ? Math.max(0, Number(data.deliveryFeeSnapshot))
            : jobType === 'PICKUP'
              ? Number(booking.pickupFeeSnapshot ?? 0)
              : Number(booking.deliveryFeeSnapshot ?? 0),
        statusHistory: [
          {
            status: assignedStaffId ? 'ASSIGNED' : 'PENDING',
            changedAt: new Date().toISOString(),
            changedBy: admin.email,
            note: 'Tạo nhiệm vụ giao nhận tận nơi',
          },
        ],
      },
    })

    return json({ id: created.id, jobCode: created.jobCode, status: created.status }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['deliveries', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'entity',
      'id',
      // Zone patch
      'name',
      'wards',
      'deliveryFee',
      'pickupFee',
      'afterHoursFee',
      'freeOverOrderAmount',
      'serviceStartTime',
      'serviceEndTime',
      'estimatedTravelMinutes',
      'active',
      'notes',
      // Job patch
      'status',
      'assignedStaffId',
      'scheduledDate',
      'scheduledTime',
      'estimatedDurationMinutes',
      'odometerAtHandover',
      'fuelOrBatteryLevel',
      'conditionReport',
      'extraCost',
      'extraCostNote',
      'failureReason',
    ])

    const entity = text(data.entity, 20) || 'job'
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã bản ghi cần cập nhật.')

    if (entity === 'zone') {
      const existing = await payload
        .findByID({ collection: 'delivery-zones', id, user, overrideAccess: false, depth: 0 })
        .catch(() => null)
      if (!existing) return fail('Không tìm thấy khu vực giao nhận.', 404)
      const deny = assertBranchScopeOrFail(admin, relationId(existing.branch))
      if (deny) return deny

      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) patch.name = text(data.name, 160)
      if (data.wards !== undefined) patch.wards = text(data.wards, 500) || null
      for (const [field, label] of [
        ['deliveryFee', 'Phí giao xe'],
        ['pickupFee', 'Phí thu hồi xe'],
        ['afterHoursFee', 'Phí ngoài giờ'],
        ['freeOverOrderAmount', 'Ngưỡng miễn phí giao'],
      ] as const) {
        if (data[field] !== undefined) {
          const chk = validateNonNegativeVnd(data[field], label)
          if (!chk.valid) return fail(chk.error!)
          patch[field] = chk.value ?? (field === 'freeOverOrderAmount' ? null : 0)
        }
      }
      if (data.serviceStartTime !== undefined)
        patch.serviceStartTime = text(data.serviceStartTime, 5)
      if (data.serviceEndTime !== undefined) patch.serviceEndTime = text(data.serviceEndTime, 5)
      if (data.estimatedTravelMinutes !== undefined)
        patch.estimatedTravelMinutes = Math.max(5, Number(data.estimatedTravelMinutes))
      if (data.active !== undefined) patch.active = Boolean(data.active)
      if (data.notes !== undefined) patch.notes = text(data.notes, 500) || null

      const updated = await payload.update({
        collection: 'delivery-zones',
        id,
        user,
        overrideAccess: false,
        data: patch,
      })
      return json({ id: updated.id, active: updated.active })
    }

    // Update Delivery Job
    const existing = await payload
      .findByID({ collection: 'delivery-jobs', id, user, overrideAccess: false, depth: 0 })
      .catch(() => null)
    if (!existing) return fail('Không tìm thấy nhiệm vụ giao nhận.', 404)

    const branchId = relationId(existing.branch)
    const deny = assertBranchScopeOrFail(admin, branchId)
    if (deny) return deny

    const currentStatus = existing.status as DeliveryJobStatus
    const nextStatusRaw = text(data.status, 30)
    const nextStatus = nextStatusRaw ? (nextStatusRaw as DeliveryJobStatus) : undefined
    if (nextStatus && !DELIVERY_JOB_STATUSES.includes(nextStatus)) {
      return fail('Trạng thái nhiệm vụ giao nhận không hợp lệ.')
    }
    if (nextStatus && nextStatus !== currentStatus) {
      const check = canTransitionDeliveryJob(currentStatus, nextStatus)
      if (!check.allowed) {
        return fail(check.reason ?? 'Chuyển trạng thái giao nhận không hợp lệ.', 409)
      }
    }

    const patch: Record<string, unknown> = {}
    const scheduledDate = text(data.scheduledDate, 10) || existing.scheduledDate
    const scheduledTime = text(data.scheduledTime, 5) || existing.scheduledTime
    const estimatedDurationMinutes =
      data.estimatedDurationMinutes !== undefined && data.estimatedDurationMinutes !== ''
        ? Math.max(15, Number(data.estimatedDurationMinutes))
        : (existing.estimatedDurationMinutes ?? 60)

    if (data.scheduledDate !== undefined) patch.scheduledDate = scheduledDate
    if (data.scheduledTime !== undefined) patch.scheduledTime = scheduledTime
    if (data.estimatedDurationMinutes !== undefined)
      patch.estimatedDurationMinutes = estimatedDurationMinutes

    const assignedStaffId =
      data.assignedStaffId !== undefined
        ? text(data.assignedStaffId, 100) || null
        : (relationId(existing.assignedStaff) ?? null)

    if (
      data.assignedStaffId !== undefined ||
      data.scheduledDate !== undefined ||
      data.scheduledTime !== undefined
    ) {
      if (assignedStaffId) {
        const staffDoc = await payload
          .findByID({ collection: 'admins', id: assignedStaffId, overrideAccess: true, depth: 0 })
          .catch(() => null)
        if (
          !staffDoc ||
          staffDoc.accountStatus === 'REVOKED' ||
          staffDoc.accountStatus === 'SUSPENDED'
        ) {
          return fail('Nhân viên giao nhận không hợp lệ hoặc đã bị thu hồi quyền.', 400)
        }
        const existingJobs = await payload.find({
          collection: 'delivery-jobs',
          overrideAccess: true,
          depth: 0,
          limit: 100,
          where: {
            and: [
              { assignedStaff: { equals: assignedStaffId } },
              { scheduledDate: { equals: scheduledDate } },
              { status: { in: ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'] } },
            ],
          },
        })
        const conflict = hasDeliveryStaffTimeConflict(
          existingJobs.docs.map((j) => ({
            id: String(j.id),
            assignedStaffId: relationId(j.assignedStaff) ?? null,
            scheduledDate: j.scheduledDate,
            scheduledTime: j.scheduledTime,
            estimatedDurationMinutes: j.estimatedDurationMinutes ?? 60,
            status: j.status,
          })),
          {
            staffId: assignedStaffId,
            scheduledDate,
            scheduledTime,
            estimatedDurationMinutes,
            excludeJobId: id,
          },
        )
        if (conflict.conflict) {
          return fail(
            `Nhân viên ${staffDoc.fullName ?? staffDoc.email} bị trùng lịch giao nhận lúc ${scheduledTime} ngày ${scheduledDate}.`,
            409,
            'DELIVERY_STAFF_TIME_CONFLICT',
          )
        }
        patch.assignedStaff = assignedStaffId
        patch.assignedStaffName = staffDoc.fullName ?? staffDoc.email
        if (!nextStatus && currentStatus === 'PENDING') {
          patch.status = 'ASSIGNED'
        }
      } else if (data.assignedStaffId === '' || data.assignedStaffId === null) {
        patch.assignedStaff = null
        patch.assignedStaffName = null
      }
    }

    const nowIso = new Date().toISOString()
    if (nextStatus) {
      patch.status = nextStatus
      if (nextStatus === 'COMPLETED') {
        patch.completedAt = nowIso
      }
      if (nextStatus === 'FAILED') {
        const failureReason = text(data.failureReason, 500)
        if (!failureReason) {
          return fail('Vui lòng ghi rõ lý do giao/nhận xe thất bại (DL-07).')
        }
        patch.failureReason = failureReason
      }
      const prevHist = Array.isArray(existing.statusHistory) ? existing.statusHistory : []
      patch.statusHistory = [
        ...prevHist,
        {
          status: nextStatus,
          changedAt: nowIso,
          changedBy: admin.email,
          note: text(data.failureReason, 200) || text(data.conditionReport, 200) || undefined,
        },
      ]
    }

    if (data.odometerAtHandover !== undefined && data.odometerAtHandover !== '') {
      const odo = Number(data.odometerAtHandover)
      if (!Number.isSafeInteger(odo) || odo < 0) return fail('ODO không hợp lệ.')
      patch.odometerAtHandover = odo
    }
    if (data.fuelOrBatteryLevel !== undefined)
      patch.fuelOrBatteryLevel = text(data.fuelOrBatteryLevel, 60) || null
    if (data.conditionReport !== undefined)
      patch.conditionReport = text(data.conditionReport, 1000) || null
    if (data.extraCost !== undefined) {
      const chk = validateNonNegativeVnd(data.extraCost, 'Chi phí phát sinh')
      if (!chk.valid) return fail(chk.error!)
      patch.extraCost = chk.value ?? 0
    }
    if (data.extraCostNote !== undefined)
      patch.extraCostNote = text(data.extraCostNote, 300) || null
    patch.revision = Number(existing.revision ?? 1) + 1

    const updated = await payload.update({
      collection: 'delivery-jobs',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })

    // Sync booking & vehicle location history on COMPLETED (DL-07: FAILED never falsely confirms rental!)
    const bookingId = relationId(existing.booking)
    const vehicleId = relationId(existing.vehicle)
    if (nextStatus === 'COMPLETED' && bookingId && vehicleId) {
      await withAtomicResourceLock(payload, `vehicle-booking:${vehicleId}`, async (tx) => {
        const bk = await payload
          .findByID({
            collection: 'bookings',
            id: bookingId,
            overrideAccess: true,
            depth: 0,
            ...txReqOptions(tx.req),
          })
          .catch(() => null)
        if (bk) {
          if (
            existing.jobType === 'DELIVERY' &&
            ['CONFIRMED', 'READY_FOR_HANDOVER'].includes(String(bk.status))
          ) {
            await payload.update({
              collection: 'bookings',
              id: bookingId,
              overrideAccess: true,
              ...txReqOptions(tx.req, {
                noriSystemPaymentSync: true,
                noriSystemActorLabel: admin.email,
              }),
              data: {
                status: 'ONGOING',
                handoverNote:
                  text(data.conditionReport, 500) ||
                  `Đã giao xe tận nơi theo phiếu ${existing.jobCode} bởi ${admin.email}`,
              },
            })
          } else if (existing.jobType === 'PICKUP' && bk.status === 'ONGOING') {
            await payload.update({
              collection: 'bookings',
              id: bookingId,
              overrideAccess: true,
              ...txReqOptions(tx.req, {
                noriSystemPaymentSync: true,
                noriSystemActorLabel: admin.email,
              }),
              data: {
                status: 'INSPECTING',
                returnOdometer:
                  typeof patch.odometerAtHandover === 'number'
                    ? patch.odometerAtHandover
                    : undefined,
                returnCondition:
                  text(data.conditionReport, 500) ||
                  `Đã thu hồi xe tận nơi theo phiếu ${existing.jobCode} bởi ${admin.email}`,
              },
            })
          }
        }
        await recordVehicleLocationEvent(payload, tx.req, {
          vehicleId,
          vehicleReference: existing.vehicleReferenceSnapshot ?? undefined,
          eventType: existing.jobType === 'PICKUP' ? 'PICKUP_RETURN' : 'DELIVERY_DISPATCH',
          fromBranchId: existing.jobType === 'DELIVERY' ? branchId : null,
          toBranchId: existing.jobType === 'PICKUP' ? branchId : null,
          relatedBookingId: bookingId,
          relatedDeliveryJobId: id,
          odometer: typeof patch.odometerAtHandover === 'number' ? patch.odometerAtHandover : null,
          conditionNote: text(data.conditionReport, 500) || null,
          actorEmail: admin.email,
          actorRole: admin.staffTitle,
          note: `${existing.jobType === 'PICKUP' ? 'Thu hồi' : 'Giao'} xe tận nơi hoàn tất (${existing.jobCode})`,
        })
      })
    }

    if (nextStatus === 'FAILED') {
      await recordAudit(payload, admin, {
        action: 'delivery.failed',
        entity: 'delivery-job',
        entityId: id,
        entityLabel: existing.jobCode,
        summary: `Giao/nhận xe thất bại (${existing.jobCode}): ${text(data.failureReason, 200)}`,
        fromStatus: currentStatus,
        toStatus: 'FAILED',
        branchId,
      })
    }

    return json({ id: updated.id, status: updated.status, jobCode: updated.jobCode })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['deliveries', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const entity = sp.get('entity') || 'zone'
    const id = sp.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã bản ghi cần xóa.')

    if (entity === 'zone') {
      const existing = await payload
        .findByID({ collection: 'delivery-zones', id, user, overrideAccess: false, depth: 0 })
        .catch(() => null)
      if (!existing) return fail('Không tìm thấy khu vực giao nhận.', 404)
      const deny = assertBranchScopeOrFail(admin, relationId(existing.branch))
      if (deny) return deny
      await payload.delete({ collection: 'delivery-zones', id, user, overrideAccess: false })
      return json({ deleted: true, id })
    }

    return fail('Không hỗ trợ xóa cứng phiếu giao nhận để đảm bảo lịch sử vận hành.', 400)
  } catch (error) {
    return apiError(error)
  }
}
