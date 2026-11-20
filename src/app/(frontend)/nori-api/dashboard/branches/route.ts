import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { photo } from '@/lib/catalogue'
import {
  BRANCH_STATUSES,
  computeBranchFleetStats,
  normalizeCode,
  slugifyBranchCode,
  validateNonNegativeVnd,
  type BranchStatus,
} from '@/lib/multi-branch-rules'
import { HOLD_STATUSES, businessToday, relationId, validateTimeString } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['branches', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const statusFilter = sp.get('status')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()
    const requestedBranchId = sp.get('branchId')?.trim() || ''

    if (requestedBranchId) {
      const deny = assertBranchScopeOrFail(admin, requestedBranchId)
      if (deny) return deny
    }

    const [
      branchesRes,
      warehousesRes,
      locationsRes,
      vehiclesRes,
      bookingsRes,
      staffRes,
      adminsRes,
    ] = await Promise.all([
      payload.find({
        collection: 'branches',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 200,
        sort: 'name',
        ...(statusFilter && BRANCH_STATUSES.includes(statusFilter as BranchStatus)
          ? { where: { status: { equals: statusFilter } } }
          : {}),
      }),
      payload.find({
        collection: 'warehouses',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
      }),
      payload.find({
        collection: 'service-locations',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
      }),
      payload.find({
        collection: 'vehicles',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        select: {
          managingBranch: true,
          currentBranch: true,
          currentWarehouse: true,
          operationStatus: true,
          status: true,
        },
      }),
      payload.find({
        collection: 'bookings',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 1000,
        where: {
          and: [
            { status: { in: [...HOLD_STATUSES] } },
            { endDate: { greater_than_equal: businessToday() } },
          ],
        },
        select: {
          pickupBranch: true,
          returnBranch: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      }),
      payload.find({
        collection: 'branch-staff',
        user,
        overrideAccess: false,
        depth: 0,
        limit: 500,
        where: { status: { equals: 'ACTIVE' } },
      }),
      admin.isGlobalScope
        ? payload.find({
            collection: 'admins',
            overrideAccess: true,
            depth: 0,
            limit: 200,
            select: { email: true, fullName: true, staffTitle: true, accountStatus: true },
          })
        : Promise.resolve({ docs: [] }),
    ])

    const invVehicles = vehiclesRes.docs.map((v) => ({
      id: String(v.id),
      managingBranchId: relationId(v.managingBranch) ?? null,
      currentBranchId: relationId(v.currentBranch) ?? null,
      currentWarehouseId: relationId(v.currentWarehouse) ?? null,
      operationStatus: String(v.operationStatus ?? 'READY'),
      status: String(v.status ?? 'ACTIVE'),
    }))

    const items = branchesRes.docs
      .filter((b) => {
        if (requestedBranchId && String(b.id) !== requestedBranchId) return false
        if (q) {
          const hay =
            `${b.code} ${b.name} ${b.province} ${b.ward ?? ''} ${b.address} ${b.hotline ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((b) => {
        const bId = String(b.id)
        const whCount = warehousesRes.docs.filter((w) => relationId(w.branch) === bId).length
        const locCount = locationsRes.docs.filter((l) => relationId(l.branch) === bId).length
        const staffCount = staffRes.docs.filter((s) => relationId(s.branch) === bId).length
        const futureBookingsCount = bookingsRes.docs.filter(
          (bk) => relationId(bk.pickupBranch) === bId || relationId(bk.returnBranch) === bId,
        ).length
        const fleetStats = computeBranchFleetStats(invVehicles, bId)
        return {
          id: bId,
          code: b.code,
          name: b.name,
          slug: b.slug ?? '',
          address: b.address,
          province: b.province,
          ward: b.ward ?? '',
          latitude: b.latitude ?? null,
          longitude: b.longitude ?? null,
          hotline: b.hotline ?? '',
          email: b.email ?? '',
          managerId: relationId(b.manager) ?? null,
          managerName:
            b.managerNameSnapshot ??
            (typeof b.manager === 'object' && b.manager
              ? (b.manager.fullName ?? b.manager.email)
              : null),
          timezone: b.timezone ?? 'Asia/Ho_Chi_Minh',
          workingDays: b.workingDays ?? '1,2,3,4,5,6,0',
          workStartTime: b.workStartTime ?? '07:30',
          workEndTime: b.workEndTime ?? '21:00',
          lunchBreakStart: b.lunchBreakStart ?? '',
          lunchBreakEnd: b.lunchBreakEnd ?? '',
          operatingHoursLabel: b.operatingHoursLabel ?? '',
          holidays: Array.isArray(b.holidays) ? b.holidays : [],
          coverImage: photo(typeof b.coverImage === 'object' ? b.coverImage : null),
          coverImageId: relationId(b.coverImage) ?? null,
          description: b.description ?? '',
          supportsHomeDelivery: Boolean(b.supportsHomeDelivery),
          supportsHomePickup: Boolean(b.supportsHomePickup),
          deliveryStartTime: b.deliveryStartTime ?? '08:00',
          deliveryEndTime: b.deliveryEndTime ?? '20:00',
          defaultDeliveryFee: b.defaultDeliveryFee ?? null,
          defaultPickupFee: b.defaultPickupFee ?? null,
          afterHoursFee: b.afterHoursFee ?? null,
          freeDeliveryMinOrder: b.freeDeliveryMinOrder ?? null,
          maxDeliveryDistanceKm: b.maxDeliveryDistanceKm ?? null,
          deliveryStaffCapacityPerSlot: b.deliveryStaffCapacityPerSlot ?? 2,
          defaultPreparationMinutes: b.defaultPreparationMinutes ?? 120,
          status: b.status,
          isDemo: Boolean(b.isDemo),
          warehousesCount: whCount,
          locationsCount: locCount,
          staffCount,
          futureBookingsCount,
          fleetStats,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        }
      })

    const unallocatedVehiclesCount = invVehicles.filter((v) => !v.managingBranchId).length

    return json({
      items,
      totalDocs: items.length,
      unallocatedVehiclesCount,
      managers: adminsRes.docs
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

const BRANCH_ALLOWLIST = [
  'id',
  'code',
  'name',
  'address',
  'province',
  'ward',
  'latitude',
  'longitude',
  'hotline',
  'email',
  'managerId',
  'managerNameSnapshot',
  'timezone',
  'workingDays',
  'workStartTime',
  'workEndTime',
  'lunchBreakStart',
  'lunchBreakEnd',
  'operatingHoursLabel',
  'holidays',
  'coverImageId',
  'description',
  'supportsHomeDelivery',
  'supportsHomePickup',
  'deliveryStartTime',
  'deliveryEndTime',
  'defaultDeliveryFee',
  'defaultPickupFee',
  'afterHoursFee',
  'freeDeliveryMinOrder',
  'maxDeliveryDistanceKm',
  'deliveryStaffCapacityPerSlot',
  'defaultPreparationMinutes',
  'status',
  'isDemo',
  'acknowledgeFutureBookings',
]

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['branches', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    if (!admin.isGlobalScope) {
      return fail(
        'Chỉ Quản trị viên cấp cao hoặc Quản trị hệ thống mới có quyền tạo chi nhánh mới.',
        403,
        'BRANCH_SCOPE_FORBIDDEN',
      )
    }

    const data = await body(request, BRANCH_ALLOWLIST)
    const code = normalizeCode(text(data.code, 32), 32)
    const name = text(data.name, 160)
    const address = text(data.address, 300)
    const province = text(data.province, 100)
    if (!code || !name || !address || !province) {
      return fail('Vui lòng nhập đầy đủ Mã chi nhánh, Tên chi nhánh, Địa chỉ và Tỉnh/Thành phố.')
    }

    const existing = await payload.find({
      collection: 'branches',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { code: { equals: code } },
    })
    if (existing.docs.length > 0) {
      return fail(
        `Mã chi nhánh "${code}" đã tồn tại. Vui lòng chọn mã khác.`,
        409,
        'DUPLICATE_BRANCH_CODE',
      )
    }

    const workStartTime = text(data.workStartTime, 5) || '07:30'
    const workEndTime = text(data.workEndTime, 5) || '21:00'
    if (!validateTimeString(workStartTime) || !validateTimeString(workEndTime)) {
      return fail('Giờ mở cửa / đóng cửa phải đúng định dạng HH:MM.')
    }

    for (const [field, label] of [
      ['defaultDeliveryFee', 'Phí giao tận nơi'],
      ['defaultPickupFee', 'Phí thu hồi tận nơi'],
      ['afterHoursFee', 'Phí ngoài giờ'],
      ['freeDeliveryMinOrder', 'Ngưỡng miễn phí giao'],
    ] as const) {
      const check = validateNonNegativeVnd(data[field], label)
      if (!check.valid) return fail(check.error!)
    }

    const status = BRANCH_STATUSES.includes(String(data.status) as BranchStatus)
      ? (data.status as BranchStatus)
      : 'ACTIVE'

    const created = await payload.create({
      collection: 'branches',
      user,
      overrideAccess: false,
      data: {
        code,
        name,
        slug: slugifyBranchCode(`${code}-${name}`),
        address,
        province,
        ward: text(data.ward, 120) || undefined,
        latitude:
          data.latitude !== undefined && data.latitude !== '' && data.latitude !== null
            ? Number(data.latitude)
            : undefined,
        longitude:
          data.longitude !== undefined && data.longitude !== '' && data.longitude !== null
            ? Number(data.longitude)
            : undefined,
        hotline: text(data.hotline, 30) || undefined,
        email: text(data.email, 160).toLowerCase() || undefined,
        manager: text(data.managerId, 100) || undefined,
        managerNameSnapshot: text(data.managerNameSnapshot, 120) || undefined,
        timezone: text(data.timezone, 60) || 'Asia/Ho_Chi_Minh',
        workingDays: text(data.workingDays, 40) || '1,2,3,4,5,6,0',
        workStartTime,
        workEndTime,
        lunchBreakStart: text(data.lunchBreakStart, 5) || undefined,
        lunchBreakEnd: text(data.lunchBreakEnd, 5) || undefined,
        operatingHoursLabel:
          text(data.operatingHoursLabel, 160) || `${workStartTime} – ${workEndTime}`,
        holidays: Array.isArray(data.holidays) ? data.holidays : [],
        coverImage: text(data.coverImageId, 100) || undefined,
        description: text(data.description, 2000) || undefined,
        supportsHomeDelivery: Boolean(data.supportsHomeDelivery),
        supportsHomePickup: Boolean(data.supportsHomePickup),
        deliveryStartTime: text(data.deliveryStartTime, 5) || '08:00',
        deliveryEndTime: text(data.deliveryEndTime, 5) || '20:00',
        defaultDeliveryFee:
          data.defaultDeliveryFee !== undefined &&
          data.defaultDeliveryFee !== '' &&
          data.defaultDeliveryFee !== null
            ? Number(data.defaultDeliveryFee)
            : undefined,
        defaultPickupFee:
          data.defaultPickupFee !== undefined &&
          data.defaultPickupFee !== '' &&
          data.defaultPickupFee !== null
            ? Number(data.defaultPickupFee)
            : undefined,
        afterHoursFee:
          data.afterHoursFee !== undefined &&
          data.afterHoursFee !== '' &&
          data.afterHoursFee !== null
            ? Number(data.afterHoursFee)
            : undefined,
        freeDeliveryMinOrder:
          data.freeDeliveryMinOrder !== undefined &&
          data.freeDeliveryMinOrder !== '' &&
          data.freeDeliveryMinOrder !== null
            ? Number(data.freeDeliveryMinOrder)
            : undefined,
        maxDeliveryDistanceKm:
          data.maxDeliveryDistanceKm !== undefined &&
          data.maxDeliveryDistanceKm !== '' &&
          data.maxDeliveryDistanceKm !== null
            ? Number(data.maxDeliveryDistanceKm)
            : undefined,
        deliveryStaffCapacityPerSlot:
          data.deliveryStaffCapacityPerSlot !== undefined &&
          data.deliveryStaffCapacityPerSlot !== ''
            ? Math.max(1, Number(data.deliveryStaffCapacityPerSlot))
            : 2,
        defaultPreparationMinutes:
          data.defaultPreparationMinutes !== undefined && data.defaultPreparationMinutes !== ''
            ? Math.max(0, Number(data.defaultPreparationMinutes))
            : 120,
        status,
        isDemo: data.isDemo === true,
      },
    })

    return json(
      { id: created.id, code: created.code, name: created.name, status: created.status },
      201,
    )
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['branches', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, BRANCH_ALLOWLIST)
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã định danh chi nhánh.')

    const deny = assertBranchScopeOrFail(admin, id)
    if (deny) return deny

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) {
      const name = text(data.name, 160)
      if (!name) return fail('Tên chi nhánh không được để trống.')
      patch.name = name
    }
    if (data.address !== undefined) {
      const address = text(data.address, 300)
      if (!address) return fail('Địa chỉ chi nhánh không được để trống.')
      patch.address = address
    }
    if (data.province !== undefined) patch.province = text(data.province, 100)
    if (data.ward !== undefined) patch.ward = text(data.ward, 120) || null
    if (data.latitude !== undefined)
      patch.latitude = data.latitude === '' || data.latitude === null ? null : Number(data.latitude)
    if (data.longitude !== undefined)
      patch.longitude =
        data.longitude === '' || data.longitude === null ? null : Number(data.longitude)
    if (data.hotline !== undefined) patch.hotline = text(data.hotline, 30) || null
    if (data.email !== undefined) patch.email = text(data.email, 160).toLowerCase() || null
    if (data.managerId !== undefined) patch.manager = text(data.managerId, 100) || null
    if (data.managerNameSnapshot !== undefined)
      patch.managerNameSnapshot = text(data.managerNameSnapshot, 120) || null
    if (data.workingDays !== undefined) patch.workingDays = text(data.workingDays, 40)
    if (data.workStartTime !== undefined) {
      const t = text(data.workStartTime, 5)
      if (!validateTimeString(t)) return fail('Giờ mở cửa không hợp lệ (HH:MM).')
      patch.workStartTime = t
    }
    if (data.workEndTime !== undefined) {
      const t = text(data.workEndTime, 5)
      if (!validateTimeString(t)) return fail('Giờ đóng cửa không hợp lệ (HH:MM).')
      patch.workEndTime = t
    }
    if (data.lunchBreakStart !== undefined)
      patch.lunchBreakStart = text(data.lunchBreakStart, 5) || null
    if (data.lunchBreakEnd !== undefined) patch.lunchBreakEnd = text(data.lunchBreakEnd, 5) || null
    if (data.operatingHoursLabel !== undefined)
      patch.operatingHoursLabel = text(data.operatingHoursLabel, 160) || null
    if (data.holidays !== undefined && Array.isArray(data.holidays)) patch.holidays = data.holidays
    if (data.coverImageId !== undefined) patch.coverImage = text(data.coverImageId, 100) || null
    if (data.description !== undefined) patch.description = text(data.description, 2000) || null
    if (data.supportsHomeDelivery !== undefined)
      patch.supportsHomeDelivery = Boolean(data.supportsHomeDelivery)
    if (data.supportsHomePickup !== undefined)
      patch.supportsHomePickup = Boolean(data.supportsHomePickup)
    if (data.deliveryStartTime !== undefined)
      patch.deliveryStartTime = text(data.deliveryStartTime, 5)
    if (data.deliveryEndTime !== undefined) patch.deliveryEndTime = text(data.deliveryEndTime, 5)
    for (const [field, label] of [
      ['defaultDeliveryFee', 'Phí giao tận nơi'],
      ['defaultPickupFee', 'Phí thu hồi tận nơi'],
      ['afterHoursFee', 'Phí ngoài giờ'],
      ['freeDeliveryMinOrder', 'Ngưỡng miễn phí giao'],
    ] as const) {
      if (data[field] !== undefined) {
        const check = validateNonNegativeVnd(data[field], label)
        if (!check.valid) return fail(check.error!)
        patch[field] = check.value ?? null
      }
    }
    if (data.maxDeliveryDistanceKm !== undefined) {
      patch.maxDeliveryDistanceKm =
        data.maxDeliveryDistanceKm === '' || data.maxDeliveryDistanceKm === null
          ? null
          : Number(data.maxDeliveryDistanceKm)
    }
    if (data.deliveryStaffCapacityPerSlot !== undefined) {
      patch.deliveryStaffCapacityPerSlot = Math.max(1, Number(data.deliveryStaffCapacityPerSlot))
    }
    if (data.defaultPreparationMinutes !== undefined) {
      patch.defaultPreparationMinutes = Math.max(0, Number(data.defaultPreparationMinutes))
    }
    if (data.status !== undefined) {
      if (!BRANCH_STATUSES.includes(String(data.status) as BranchStatus)) {
        return fail('Trạng thái chi nhánh không hợp lệ.')
      }
      patch.status = data.status
    }

    const updated = await payload.update({
      collection: 'branches',
      id,
      user,
      overrideAccess: false,
      context: {
        acknowledgeFutureBookings: data.acknowledgeFutureBookings === true,
      },
      data: patch,
    })

    return json({ id: updated.id, code: updated.code, name: updated.name, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['branches', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    if (!admin.isGlobalScope) {
      return fail(
        'Chỉ Quản trị viên cấp cao mới có quyền xóa chi nhánh.',
        403,
        'BRANCH_SCOPE_FORBIDDEN',
      )
    }
    const id = new URL(request.url).searchParams.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã chi nhánh cần xóa.')

    await payload.delete({
      collection: 'branches',
      id,
      user,
      overrideAccess: false,
    })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
