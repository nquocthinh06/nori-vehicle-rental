import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  PRICING_SCOPE_TYPES,
  REVENUE_SPLIT_MODES,
  normalizeCode,
  validateNonNegativeVnd,
  type PricingScopeType,
  type RevenueSplitMode,
} from '@/lib/multi-branch-rules'
import { relationId } from '@/lib/rental-rules'

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['pricing', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const branchFilter = sp.get('branchId')?.trim() || ''
    const scopeFilter = sp.get('scopeType')?.trim() || ''
    const q = (sp.get('q') || '').trim().toLowerCase()

    if (branchFilter) {
      const deny = assertBranchScopeOrFail(admin, branchFilter)
      if (deny) return deny
    }

    const [pricingRes, oneWayRes, branchesRes, modelsRes, vehiclesRes] = await Promise.all([
      payload.find({
        collection: 'location-pricing-rules',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 400,
        sort: 'priority',
      }),
      payload.find({
        collection: 'one-way-rental-rules',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 400,
        sort: 'routeKey',
      }),
      payload.find({
        collection: 'branches',
        overrideAccess: true,
        depth: 0,
        limit: 200,
        sort: 'name',
      }),
      payload.find({
        collection: 'vehicle-models',
        overrideAccess: true,
        depth: 0,
        limit: 200,
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
    ])

    const branchMap = new Map(branchesRes.docs.map((b) => [String(b.id), b]))
    const modelMap = new Map(modelsRes.docs.map((m) => [String(m.id), m]))

    const pricingRules = pricingRes.docs
      .filter((r) => {
        const bId = relationId(r.branch)
        if (branchFilter && bId !== branchFilter) return false
        if (scopeFilter && r.scopeType !== scopeFilter) return false
        if (q) {
          const hay = `${r.code} ${r.name} ${r.scopeType}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .map((r) => {
        const bId = relationId(r.branch) ?? null
        const mId = relationId(r.vehicleModel) ?? null
        const vId = relationId(r.vehicle) ?? null
        return {
          id: String(r.id),
          code: r.code,
          name: r.name,
          scopeType: r.scopeType,
          branchId: bId,
          branchName: bId ? (branchMap.get(bId)?.name ?? null) : null,
          vehicleModelId: mId,
          vehicleModelName: mId ? (modelMap.get(mId)?.name ?? null) : null,
          vehicleId: vId,
          vehicleReference: typeof r.vehicle === 'object' && r.vehicle ? r.vehicle.reference : null,
          dailyPrice: r.dailyPrice ?? null,
          weeklyPrice: r.weeklyPrice ?? null,
          monthlyPrice: r.monthlyPrice ?? null,
          weekendSurcharge: r.weekendSurcharge ?? null,
          holidaySurcharge: r.holidaySurcharge ?? null,
          depositAmount: r.depositAmount ?? null,
          locationSurcharge: r.locationSurcharge ?? null,
          afterHoursFee: r.afterHoursFee ?? null,
          weeklyDiscountPercent: r.weeklyDiscountPercent ?? null,
          monthlyDiscountPercent: r.monthlyDiscountPercent ?? null,
          validFrom: r.validFrom ?? '',
          validTo: r.validTo ?? '',
          priority: r.priority ?? 100,
          active: r.active !== false,
          notes: r.notes ?? '',
          updatedAt: r.updatedAt,
        }
      })

    const oneWayRules = oneWayRes.docs
      .filter((r) => {
        const fId = relationId(r.fromBranch) ?? ''
        const tId = relationId(r.toBranch) ?? ''
        if (branchFilter && fId !== branchFilter && tId !== branchFilter) return false
        if (q) {
          const fName = branchMap.get(fId)?.name ?? ''
          const tName = branchMap.get(tId)?.name ?? ''
          if (!`${r.routeKey} ${fName} ${tName}`.toLowerCase().includes(q)) return false
        }
        return true
      })
      .map((r) => {
        const fId = relationId(r.fromBranch) ?? ''
        const tId = relationId(r.toBranch) ?? ''
        return {
          id: String(r.id),
          routeKey: r.routeKey,
          fromBranchId: fId,
          fromBranchName: branchMap.get(fId)?.name ?? 'Chưa rõ',
          toBranchId: tId,
          toBranchName: branchMap.get(tId)?.name ?? 'Chưa rõ',
          vehicleCategory: r.vehicleCategory ?? 'ALL',
          allowed: r.allowed !== false,
          fee: r.fee ?? 0,
          minRentalDays: r.minRentalDays ?? 1,
          estimatedTransitHours: r.estimatedTransitHours ?? 4,
          preparationBufferHours: r.preparationBufferHours ?? 4,
          revenueSplitMode: r.revenueSplitMode ?? 'PICKUP_BRANCH',
          pickupBranchSharePercent: r.pickupBranchSharePercent ?? 100,
          active: r.active !== false,
          notes: r.notes ?? '',
        }
      })

    return json({
      pricingRules,
      oneWayRules,
      branches: branchesRes.docs.map((b) => ({
        id: String(b.id),
        code: b.code,
        name: b.name,
        status: b.status,
      })),
      models: modelsRes.docs.map((m) => ({
        id: String(m.id),
        name: m.name,
        brand: m.brand,
        category: m.category,
      })),
      vehicles: vehiclesRes.docs.map((v) => ({
        id: String(v.id),
        reference: v.reference,
        modelName: typeof v.model === 'object' && v.model ? v.model.name : '',
        managingBranchId: relationId(v.managingBranch) ?? null,
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
    const auth = await requireAdmin({ permission: ['pricing', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'entity',
      // Location pricing fields
      'code',
      'name',
      'scopeType',
      'branchId',
      'vehicleModelId',
      'vehicleId',
      'dailyPrice',
      'weeklyPrice',
      'monthlyPrice',
      'weekendSurcharge',
      'holidaySurcharge',
      'depositAmount',
      'locationSurcharge',
      'afterHoursFee',
      'weeklyDiscountPercent',
      'monthlyDiscountPercent',
      'validFrom',
      'validTo',
      'priority',
      'active',
      'notes',
      'note',
      // One-way rule fields
      'fromBranchId',
      'toBranchId',
      'vehicleCategory',
      'allowed',
      'fee',
      'minRentalDays',
      'estimatedTransitHours',
      'preparationBufferHours',
      'revenueSplitMode',
      'pickupBranchSharePercent',
    ])

    const entity = text(data.entity, 20) || 'pricing'

    if (entity === 'one-way') {
      const fromBranchId = text(data.fromBranchId, 100)
      const toBranchId = text(data.toBranchId, 100)
      if (!fromBranchId || !toBranchId) {
        return fail('Vui lòng chọn Chi nhánh nhận và Chi nhánh trả cho quy tắc thuê một chiều.')
      }
      if (fromBranchId === toBranchId) {
        return fail('Chi nhánh nhận và Chi nhánh trả phải khác nhau đối với tuyến một chiều.')
      }
      if (!admin.isGlobalScope) {
        const deny = assertBranchScopeOrFail(admin, fromBranchId)
        if (deny) return deny
      }

      const feeCheck = validateNonNegativeVnd(data.fee, 'Phí trả xe khác chi nhánh')
      if (!feeCheck.valid) return fail(feeCheck.error!)

      const vehicleCategory = (
        ['ALL', 'CAR', 'MOTORBIKE', 'PICKUP'].includes(String(data.vehicleCategory))
          ? data.vehicleCategory
          : 'ALL'
      ) as 'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP'
      const revenueSplitMode = (
        REVENUE_SPLIT_MODES.includes(String(data.revenueSplitMode) as RevenueSplitMode)
          ? data.revenueSplitMode
          : 'PICKUP_BRANCH'
      ) as RevenueSplitMode
      const splitPct =
        revenueSplitMode === 'PICKUP_BRANCH'
          ? 100
          : revenueSplitMode === 'RETURN_BRANCH'
            ? 0
            : Math.min(100, Math.max(0, Number(data.pickupBranchSharePercent ?? 50)))

      const routeKey = `${fromBranchId}:${toBranchId}:${vehicleCategory}`
      const existing = await payload.find({
        collection: 'one-way-rental-rules',
        overrideAccess: true,
        depth: 0,
        limit: 1,
        where: { routeKey: { equals: routeKey } },
      })
      if (existing.docs.length > 0) {
        return fail('Quy tắc tuyến thuê một chiều này đã tồn tại.', 409, 'DUPLICATE_ONE_WAY_RULE')
      }

      const [fromBr, toBr] = await Promise.all([
        payload
          .findByID({ collection: 'branches', id: fromBranchId, overrideAccess: true, depth: 0 })
          .catch(() => null),
        payload
          .findByID({ collection: 'branches', id: toBranchId, overrideAccess: true, depth: 0 })
          .catch(() => null),
      ])
      const ruleName =
        text(data.name, 160) ||
        `${fromBr?.name ?? fromBranchId} → ${toBr?.name ?? toBranchId} (${vehicleCategory})`

      const created = await payload.create({
        collection: 'one-way-rental-rules',
        user,
        overrideAccess: false,
        data: {
          routeKey,
          name: ruleName,
          fromBranch: fromBranchId,
          toBranch: toBranchId,
          vehicleCategory,
          allowed: data.allowed !== false,
          fee: feeCheck.value ?? 0,
          minRentalDays: Math.max(1, Number(data.minRentalDays ?? 1)),
          estimatedTransitHours: Math.max(1, Number(data.estimatedTransitHours ?? 4)),
          preparationBufferHours: Math.max(0, Number(data.preparationBufferHours ?? 4)),
          revenueSplitMode,
          pickupBranchSharePercent: splitPct,
          active: data.active !== false,
          notes: text(data.notes ?? data.note, 500) || undefined,
        },
      })
      return json({ id: created.id, routeKey: created.routeKey }, 201)
    }

    // Create Location Pricing Rule
    const code = normalizeCode(text(data.code, 40), 40)
    const name = text(data.name, 160)
    const scopeType = text(data.scopeType, 30) as PricingScopeType
    if (!code || !name || !PRICING_SCOPE_TYPES.includes(scopeType)) {
      return fail('Vui lòng nhập Mã quy tắc, Tên quy tắc và Phạm vi áp dụng hợp lệ.')
    }

    const branchId = text(data.branchId, 100) || undefined
    const vehicleModelId = text(data.vehicleModelId, 100) || undefined
    const vehicleId = text(data.vehicleId, 100) || undefined

    if (scopeType === 'GLOBAL_DEFAULT' && !admin.isGlobalScope) {
      return fail(
        'Chỉ Quản trị viên toàn hệ thống mới có quyền tạo bảng giá mặc định toàn hệ thống.',
        403,
      )
    }
    if (scopeType !== 'GLOBAL_DEFAULT') {
      if (!branchId) return fail('Quy tắc giá theo chi nhánh cần chọn Chi nhánh áp dụng.')
      const deny = assertBranchScopeOrFail(admin, branchId)
      if (deny) return deny
    }
    if (scopeType === 'MODEL_BRANCH' && !vehicleModelId) {
      return fail('Quy tắc giá theo Dòng xe × Chi nhánh cần chọn Dòng xe.')
    }
    if (scopeType === 'VEHICLE_BRANCH' && !vehicleId) {
      return fail('Quy tắc giá theo Xe cụ thể × Chi nhánh cần chọn Phương tiện.')
    }

    for (const [field, label] of [
      ['dailyPrice', 'Giá thuê/ngày'],
      ['weeklyPrice', 'Giá thuê/tuần'],
      ['monthlyPrice', 'Giá thuê/tháng'],
      ['weekendSurcharge', 'Phụ phí cuối tuần'],
      ['holidaySurcharge', 'Phụ phí ngày lễ'],
      ['depositAmount', 'Tiền cọc'],
      ['locationSurcharge', 'Phụ phí địa điểm'],
      ['afterHoursFee', 'Phí ngoài giờ'],
    ] as const) {
      const chk = validateNonNegativeVnd(data[field], label)
      if (!chk.valid) return fail(chk.error!)
    }

    if (
      data.dailyPrice !== undefined &&
      data.dailyPrice !== '' &&
      data.dailyPrice !== null &&
      Number(data.dailyPrice) <= 0
    ) {
      return fail('Giá thuê theo ngày phải lớn hơn 0 VNĐ (PR-09).')
    }

    const created = await payload.create({
      collection: 'location-pricing-rules',
      user,
      overrideAccess: false,
      data: {
        code,
        name,
        scopeType,
        branch: branchId,
        vehicleModel: vehicleModelId,
        vehicle: vehicleId,
        dailyPrice:
          data.dailyPrice !== undefined && data.dailyPrice !== '' && data.dailyPrice !== null
            ? Number(data.dailyPrice)
            : undefined,
        weeklyPrice:
          data.weeklyPrice !== undefined && data.weeklyPrice !== '' && data.weeklyPrice !== null
            ? Number(data.weeklyPrice)
            : undefined,
        monthlyPrice:
          data.monthlyPrice !== undefined && data.monthlyPrice !== '' && data.monthlyPrice !== null
            ? Number(data.monthlyPrice)
            : undefined,
        weekendSurcharge:
          data.weekendSurcharge !== undefined &&
          data.weekendSurcharge !== '' &&
          data.weekendSurcharge !== null
            ? Number(data.weekendSurcharge)
            : undefined,
        holidaySurcharge:
          data.holidaySurcharge !== undefined &&
          data.holidaySurcharge !== '' &&
          data.holidaySurcharge !== null
            ? Number(data.holidaySurcharge)
            : undefined,
        depositAmount:
          data.depositAmount !== undefined &&
          data.depositAmount !== '' &&
          data.depositAmount !== null
            ? Number(data.depositAmount)
            : undefined,
        locationSurcharge:
          data.locationSurcharge !== undefined &&
          data.locationSurcharge !== '' &&
          data.locationSurcharge !== null
            ? Number(data.locationSurcharge)
            : undefined,
        afterHoursFee:
          data.afterHoursFee !== undefined &&
          data.afterHoursFee !== '' &&
          data.afterHoursFee !== null
            ? Number(data.afterHoursFee)
            : undefined,
        weeklyDiscountPercent:
          data.weeklyDiscountPercent !== undefined &&
          data.weeklyDiscountPercent !== '' &&
          data.weeklyDiscountPercent !== null
            ? Number(data.weeklyDiscountPercent)
            : undefined,
        monthlyDiscountPercent:
          data.monthlyDiscountPercent !== undefined &&
          data.monthlyDiscountPercent !== '' &&
          data.monthlyDiscountPercent !== null
            ? Number(data.monthlyDiscountPercent)
            : undefined,
        validFrom: text(data.validFrom, 10) || undefined,
        validTo: text(data.validTo, 10) || undefined,
        priority: data.priority !== undefined && data.priority !== '' ? Number(data.priority) : 100,
        active: data.active !== false,
        notes: text(data.notes ?? data.note, 500) || undefined,
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
    const auth = await requireAdmin({ permission: ['pricing', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'entity',
      'id',
      'name',
      'dailyPrice',
      'weeklyPrice',
      'monthlyPrice',
      'weekendSurcharge',
      'holidaySurcharge',
      'depositAmount',
      'locationSurcharge',
      'afterHoursFee',
      'weeklyDiscountPercent',
      'monthlyDiscountPercent',
      'validFrom',
      'validTo',
      'priority',
      'active',
      'notes',
      'note',
      'allowed',
      'fee',
      'minRentalDays',
      'estimatedTransitHours',
      'preparationBufferHours',
      'revenueSplitMode',
      'pickupBranchSharePercent',
    ])

    const entity = text(data.entity, 20) || 'pricing'
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã quy tắc cần cập nhật.')

    if (entity === 'one-way') {
      const existing = await payload
        .findByID({ collection: 'one-way-rental-rules', id, user, overrideAccess: false, depth: 0 })
        .catch(() => null)
      if (!existing) return fail('Không tìm thấy quy tắc thuê một chiều.', 404)
      if (!admin.isGlobalScope) {
        const deny = assertBranchScopeOrFail(admin, relationId(existing.fromBranch))
        if (deny) return deny
      }

      const patch: Record<string, unknown> = {}
      if (data.allowed !== undefined) patch.allowed = Boolean(data.allowed)
      if (data.fee !== undefined) {
        const chk = validateNonNegativeVnd(data.fee, 'Phí trả xe khác chi nhánh')
        if (!chk.valid) return fail(chk.error!)
        patch.fee = chk.value ?? 0
      }
      if (data.minRentalDays !== undefined)
        patch.minRentalDays = Math.max(1, Number(data.minRentalDays))
      if (data.estimatedTransitHours !== undefined)
        patch.estimatedTransitHours = Math.max(1, Number(data.estimatedTransitHours))
      if (data.preparationBufferHours !== undefined)
        patch.preparationBufferHours = Math.max(0, Number(data.preparationBufferHours))
      if (data.revenueSplitMode !== undefined) {
        const mode = String(data.revenueSplitMode) as RevenueSplitMode
        if (!REVENUE_SPLIT_MODES.includes(mode)) return fail('Chế độ chia doanh thu không hợp lệ.')
        patch.revenueSplitMode = mode
        if (mode === 'PICKUP_BRANCH') patch.pickupBranchSharePercent = 100
        else if (mode === 'RETURN_BRANCH') patch.pickupBranchSharePercent = 0
      }
      if (data.pickupBranchSharePercent !== undefined) {
        patch.pickupBranchSharePercent = Math.min(
          100,
          Math.max(0, Number(data.pickupBranchSharePercent)),
        )
      }
      if (data.active !== undefined) patch.active = Boolean(data.active)
      if (data.notes !== undefined || data.note !== undefined)
        patch.notes = text(data.notes ?? data.note, 500) || null

      const updated = await payload.update({
        collection: 'one-way-rental-rules',
        id,
        user,
        overrideAccess: false,
        data: patch,
      })
      return json({
        id: updated.id,
        allowed: updated.allowed,
        fee: updated.fee,
        active: updated.active,
      })
    }

    const existing = await payload
      .findByID({ collection: 'location-pricing-rules', id, user, overrideAccess: false, depth: 0 })
      .catch(() => null)
    if (!existing) return fail('Không tìm thấy quy tắc giá.', 404)
    if (existing.scopeType === 'GLOBAL_DEFAULT' && !admin.isGlobalScope) {
      return fail('Chỉ Quản trị viên toàn hệ thống mới có quyền sửa bảng giá toàn hệ thống.', 403)
    }
    if (existing.branch) {
      const deny = assertBranchScopeOrFail(admin, relationId(existing.branch))
      if (deny) return deny
    }

    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = text(data.name, 160)
    for (const [field, label] of [
      ['dailyPrice', 'Giá thuê/ngày'],
      ['weeklyPrice', 'Giá thuê/tuần'],
      ['monthlyPrice', 'Giá thuê/tháng'],
      ['weekendSurcharge', 'Phụ phí cuối tuần'],
      ['holidaySurcharge', 'Phụ phí ngày lễ'],
      ['depositAmount', 'Tiền cọc'],
      ['locationSurcharge', 'Phụ phí địa điểm'],
      ['afterHoursFee', 'Phí ngoài giờ'],
    ] as const) {
      if (data[field] !== undefined) {
        const chk = validateNonNegativeVnd(data[field], label)
        if (!chk.valid) return fail(chk.error!)
        if (field === 'dailyPrice' && chk.value !== undefined && chk.value <= 0) {
          return fail('Giá thuê theo ngày phải lớn hơn 0 VNĐ (PR-09).')
        }
        patch[field] = chk.value ?? null
      }
    }
    if (data.weeklyDiscountPercent !== undefined)
      patch.weeklyDiscountPercent =
        data.weeklyDiscountPercent === '' || data.weeklyDiscountPercent === null
          ? null
          : Number(data.weeklyDiscountPercent)
    if (data.monthlyDiscountPercent !== undefined)
      patch.monthlyDiscountPercent =
        data.monthlyDiscountPercent === '' || data.monthlyDiscountPercent === null
          ? null
          : Number(data.monthlyDiscountPercent)
    if (data.validFrom !== undefined) patch.validFrom = text(data.validFrom, 10) || null
    if (data.validTo !== undefined) patch.validTo = text(data.validTo, 10) || null
    if (data.priority !== undefined) patch.priority = Number(data.priority)
    if (data.active !== undefined) patch.active = Boolean(data.active)
    if (data.notes !== undefined || data.note !== undefined)
      patch.notes = text(data.notes ?? data.note, 500) || null

    const updated = await payload.update({
      collection: 'location-pricing-rules',
      id,
      user,
      overrideAccess: false,
      data: patch,
    })
    return json({
      id: updated.id,
      code: updated.code,
      dailyPrice: updated.dailyPrice,
      active: updated.active,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['pricing', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const sp = new URL(request.url).searchParams
    const entity = sp.get('entity') || 'pricing'
    const id = sp.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã quy tắc cần xóa.')

    if (entity === 'one-way') {
      const existing = await payload
        .findByID({ collection: 'one-way-rental-rules', id, user, overrideAccess: false, depth: 0 })
        .catch(() => null)
      if (!existing) return fail('Không tìm thấy quy tắc thuê một chiều.', 404)
      if (!admin.isGlobalScope) {
        const deny = assertBranchScopeOrFail(admin, relationId(existing.fromBranch))
        if (deny) return deny
      }
      await payload.delete({ collection: 'one-way-rental-rules', id, user, overrideAccess: false })
      return json({ deleted: true, id })
    }

    const existing = await payload
      .findByID({ collection: 'location-pricing-rules', id, user, overrideAccess: false, depth: 0 })
      .catch(() => null)
    if (!existing) return fail('Không tìm thấy quy tắc giá.', 404)
    if (existing.branch) {
      const deny = assertBranchScopeOrFail(admin, relationId(existing.branch))
      if (deny) return deny
    } else if (!admin.isGlobalScope) {
      return fail('Bạn không có quyền xóa quy tắc giá toàn hệ thống.', 403)
    }

    await payload.delete({ collection: 'location-pricing-rules', id, user, overrideAccess: false })
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
