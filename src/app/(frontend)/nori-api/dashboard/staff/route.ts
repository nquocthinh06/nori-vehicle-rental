import {
  STAFF_ROLE_PERMISSION_PRESETS,
  STAFF_TITLES,
  canManageStaffAssignment,
  type AdminRole,
  type BranchScopeMode,
  type StaffTitle,
} from '@/access/nori'
import { recordAudit } from '@/hooks/audit-nori'
import { assertBranchScopeOrFail, requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import { syncAdminAssignedBranches } from '@/lib/multi-branch-service'
import { relationId } from '@/lib/rental-rules'

const BRANCH_STAFF_ROLES = [
  'BRANCH_MANAGER',
  'RENTAL_STAFF',
  'WAREHOUSE_STAFF',
  'DELIVERY_STAFF',
  'ACCOUNTANT',
] as const

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin({ permission: ['staff', 'read'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const branchId = new URL(request.url).searchParams.get('branchId')?.trim() || ''
    if (branchId) {
      const deny = assertBranchScopeOrFail(admin, branchId)
      if (deny) return deny
    }

    const [assignmentsRes, branchesRes, warehousesRes, adminsRes] = await Promise.all([
      payload.find({
        collection: 'branch-staff',
        user,
        overrideAccess: false,
        depth: 1,
        limit: 500,
        sort: '-createdAt',
        ...(branchId ? { where: { branch: { equals: branchId } } } : {}),
      }),
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
        sort: 'code',
      }),
      payload.find({
        collection: 'admins',
        overrideAccess: true,
        depth: 0,
        limit: 300,
        sort: 'createdAt',
        select: {
          email: true,
          fullName: true,
          adminRole: true,
          staffTitle: true,
          branchScopeMode: true,
          assignedBranchIds: true,
          accountStatus: true,
          phone: true,
          createdAt: true,
        },
      }),
    ])

    const visibleAdminIds = new Set(
      assignmentsRes.docs.map((a) => relationId(a.admin)).filter((id): id is string => Boolean(id)),
    )
    const staffAccounts = adminsRes.docs
      .filter((a) => {
        if (admin.isGlobalScope) return true
        return visibleAdminIds.has(String(a.id)) || String(a.id) === admin.id
      })
      .map((a) => ({
        id: String(a.id),
        email: a.email,
        fullName: a.fullName ?? a.email,
        adminRole: a.adminRole ?? 'OPERATOR',
        staffTitle: a.staffTitle ?? (a.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'),
        branchScopeMode: a.branchScopeMode ?? 'ALL',
        assignedBranchIds: Array.isArray(a.assignedBranchIds) ? a.assignedBranchIds : [],
        accountStatus: a.accountStatus ?? 'ACTIVE',
        phone: a.phone ?? '',
        createdAt: a.createdAt,
      }))

    const assignments = assignmentsRes.docs.map((s) => ({
      id: String(s.id),
      assignmentKey: s.assignmentKey ?? '',
      adminId: relationId(s.admin) ?? '',
      adminEmail: typeof s.admin === 'object' && s.admin ? s.admin.email : '',
      adminName: typeof s.admin === 'object' && s.admin ? (s.admin.fullName ?? s.admin.email) : '',
      branchId: relationId(s.branch) ?? '',
      branchName: typeof s.branch === 'object' && s.branch ? s.branch.name : '',
      warehouses: Array.isArray(s.warehouses) ? s.warehouses : [],
      staffRole: s.staffRole,
      isPrimary: Boolean(s.isPrimary),
      status: s.status,
      assignedBy: s.assignedBy ?? '',
      assignedAt: s.assignedAt ?? s.createdAt,
      revokedAt: s.revokedAt ?? null,
      notes: s.notes ?? '',
    }))

    const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase()
    const items = staffAccounts
      .map((acc) => ({
        ...acc,
        assignedBranches: assignments
          .filter((a) => a.adminId === acc.id && a.status === 'ACTIVE')
          .map((a) => ({
            assignmentId: a.id,
            branchId: a.branchId,
            branchName: a.branchName,
            roleTitle: a.staffRole,
            isPrimary: a.isPrimary,
          })),
      }))
      .filter((acc) => {
        if (q) {
          const hay = `${acc.fullName} ${acc.email} ${acc.staffTitle}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })

    return json({
      currentAdmin: admin,
      items,
      assignments,
      staffAccounts,
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
    const auth = await requireAdmin({ permission: ['staff', 'create'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'mode',
      'action',
      'adminId',
      'email',
      'password',
      'fullName',
      'phone',
      'adminRole',
      'staffTitle',
      'branchScopeMode',
      'branchIds',
      'branchId',
      'warehouses',
      'staffRole',
      'isPrimary',
      'notes',
    ])

    // Mode 1: Create new Staff Admin account + assign to 1..N branches
    if (data.mode === 'create_staff_account' || data.action === 'create_staff') {
      const email = text(data.email, 254).toLowerCase()
      const password = typeof data.password === 'string' ? data.password : ''
      const fullName = text(data.fullName, 100) || 'Nhân viên NORI'
      const phone = text(data.phone, 20) || undefined
      const requestedRole = (
        data.adminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'OPERATOR'
      ) as AdminRole
      const requestedTitle = (
        STAFF_TITLES.includes(String(data.staffTitle) as StaffTitle)
          ? data.staffTitle
          : 'RENTAL_STAFF'
      ) as StaffTitle
      const requestedScopeMode = (
        data.branchScopeMode === 'ALL' ? 'ALL' : 'ASSIGNED'
      ) as BranchScopeMode
      const branchIds = Array.isArray(data.branchIds)
        ? [...new Set(data.branchIds.map((b) => text(b, 100)).filter(Boolean))]
        : text(data.branchId, 100)
          ? [text(data.branchId, 100)]
          : []

      // Strict anti-escalation RBAC validation (RB-04, RB-05)
      const guard = canManageStaffAssignment({
        actor: user,
        targetAdminRole: requestedRole,
        targetStaffTitle: requestedTitle,
        targetBranchScopeMode: requestedScopeMode,
        targetBranchIds: branchIds,
      })
      if (!guard.allowed) {
        await recordAudit(payload, user, {
          action: 'staff.create_denied',
          entity: 'branch-staff',
          summary: `Từ chối tạo nhân viên ${email}: ${guard.reason}`,
          outcome: 'DENIED',
        })
        return fail(
          guard.reason ?? 'Không có quyền thực hiện thao tác này.',
          403,
          'PRIVILEGE_ESCALATION_BLOCKED',
        )
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail('Địa chỉ email nhân viên chưa hợp lệ.')
      }
      if (
        password.length < 8 ||
        password.length > 72 ||
        !/[A-Za-z]/.test(password) ||
        !/\d/.test(password)
      ) {
        return fail('Mật khẩu cần từ 8–72 ký tự, gồm ít nhất một chữ cái và một chữ số.')
      }
      if (requestedScopeMode === 'ASSIGNED' && branchIds.length === 0) {
        return fail('Nhân viên phạm vi chi nhánh cần được phân công ít nhất 1 chi nhánh.')
      }

      const permissions =
        STAFF_ROLE_PERMISSION_PRESETS[requestedTitle] ?? STAFF_ROLE_PERMISSION_PRESETS.RENTAL_STAFF

      const createdAdmin = await payload.create({
        collection: 'admins',
        overrideAccess: true,
        data: {
          email,
          password,
          fullName,
          phone,
          adminRole: requestedRole,
          staffTitle: requestedTitle,
          branchScopeMode: requestedRole === 'SUPER_ADMIN' ? 'ALL' : requestedScopeMode,
          assignedBranchIds: requestedRole === 'SUPER_ADMIN' ? [] : branchIds,
          accountStatus: 'ACTIVE',
          permissions,
        },
      })

      const effectiveStaffRole = BRANCH_STAFF_ROLES.includes(
        requestedTitle as (typeof BRANCH_STAFF_ROLES)[number],
      )
        ? (requestedTitle as (typeof BRANCH_STAFF_ROLES)[number])
        : 'RENTAL_STAFF'

      for (let i = 0; i < branchIds.length; i += 1) {
        const bId = branchIds[i]
        await payload.create({
          collection: 'branch-staff',
          overrideAccess: true,
          data: {
            assignmentKey: `${createdAdmin.id}:${bId}`,
            admin: createdAdmin.id,
            branch: bId,
            warehouses: Array.isArray(data.warehouses) ? data.warehouses : [],
            staffRole: effectiveStaffRole,
            isPrimary: i === 0,
            status: 'ACTIVE',
            assignedBy: admin.email,
            assignedAt: new Date().toISOString(),
            notes: text(data.notes, 500) || undefined,
          },
        })
      }

      await recordAudit(payload, user, {
        action: 'staff.create',
        entity: 'branch-staff',
        entityId: String(createdAdmin.id),
        entityLabel: createdAdmin.email,
        summary: `Tạo nhân viên ${createdAdmin.email} (${requestedTitle}) cho ${branchIds.length} chi nhánh`,
        branchId: branchIds[0] ?? null,
      })

      return json(
        { id: createdAdmin.id, email: createdAdmin.email, staffTitle: requestedTitle },
        201,
      )
    }

    // Mode 2: Assign existing Admin to a branch
    const targetAdminId = text(data.adminId, 100)
    const branchId = text(data.branchId, 100)
    const staffRole = BRANCH_STAFF_ROLES.includes(
      String(data.staffRole) as (typeof BRANCH_STAFF_ROLES)[number],
    )
      ? (data.staffRole as (typeof BRANCH_STAFF_ROLES)[number])
      : 'RENTAL_STAFF'

    if (!targetAdminId || !branchId) {
      return fail('Vui lòng chọn nhân viên và chi nhánh cần phân công.')
    }

    const guard = canManageStaffAssignment({
      actor: user,
      targetAdminId,
      targetStaffTitle: staffRole,
      targetBranchScopeMode: 'ASSIGNED',
      targetBranchIds: [branchId],
    })
    if (!guard.allowed) {
      return fail(guard.reason ?? 'Không có quyền phân công nhân viên.', 403, 'FORBIDDEN')
    }

    const existing = await payload.find({
      collection: 'branch-staff',
      overrideAccess: true,
      depth: 0,
      limit: 1,
      where: { assignmentKey: { equals: `${targetAdminId}:${branchId}` } },
    })

    let assignment
    if (existing.docs[0]) {
      assignment = await payload.update({
        collection: 'branch-staff',
        id: existing.docs[0].id,
        overrideAccess: true,
        data: {
          staffRole,
          warehouses: Array.isArray(data.warehouses)
            ? data.warehouses
            : existing.docs[0].warehouses,
          isPrimary: Boolean(data.isPrimary),
          status: 'ACTIVE',
          revokedAt: null,
          assignedBy: admin.email,
          notes: text(data.notes, 500) || undefined,
        },
      })
    } else {
      assignment = await payload.create({
        collection: 'branch-staff',
        overrideAccess: true,
        data: {
          assignmentKey: `${targetAdminId}:${branchId}`,
          admin: targetAdminId,
          branch: branchId,
          warehouses: Array.isArray(data.warehouses) ? data.warehouses : [],
          staffRole,
          isPrimary: Boolean(data.isPrimary),
          status: 'ACTIVE',
          assignedBy: admin.email,
          assignedAt: new Date().toISOString(),
          notes: text(data.notes, 500) || undefined,
        },
      })
    }

    await syncAdminAssignedBranches(payload, targetAdminId)
    return json({ id: assignment.id, status: assignment.status }, 201)
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['staff', 'update'] })
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    const data = await body(request, [
      'action',
      'id',
      'adminId',
      'staffRole',
      'staffTitle',
      'adminRole',
      'branchScopeMode',
      'accountStatus',
      'status',
      'warehouses',
      'isPrimary',
      'notes',
    ])

    // Action 1: Update staff account status (ACTIVE / REVOKED / SUSPENDED) or role/scope (RB-05, RB-06)
    if (data.action === 'update_account' || (data.adminId && data.accountStatus !== undefined)) {
      const targetAdminId = text(data.adminId ?? data.id, 100)
      if (!targetAdminId) return fail('Thiếu mã tài khoản nhân viên.')

      const targetDoc = await payload.findByID({
        collection: 'admins',
        id: targetAdminId,
        overrideAccess: true,
        depth: 0,
      })

      const targetBranchIds = Array.isArray(targetDoc.assignedBranchIds)
        ? targetDoc.assignedBranchIds.map(String)
        : []
      const guard = canManageStaffAssignment({
        actor: user,
        targetAdminId,
        targetAdminRole: (data.adminRole ?? targetDoc.adminRole) as AdminRole,
        targetStaffTitle: (data.staffTitle ?? targetDoc.staffTitle) as StaffTitle,
        targetBranchScopeMode: (data.branchScopeMode ??
          targetDoc.branchScopeMode) as BranchScopeMode,
        targetBranchIds,
      })
      if (!guard.allowed) {
        await recordAudit(payload, user, {
          action: 'staff.escalation_blocked',
          entity: 'admin',
          entityId: targetAdminId,
          entityLabel: targetDoc.email,
          summary: `Chặn cập nhật quyền trái phép cho ${targetDoc.email}: ${guard.reason}`,
          outcome: 'DENIED',
        })
        return fail(
          guard.reason ?? 'Không có quyền cập nhật nhân viên này.',
          403,
          'PRIVILEGE_ESCALATION_BLOCKED',
        )
      }

      const patch: Record<string, unknown> = {}
      if (data.accountStatus !== undefined) {
        if (!['ACTIVE', 'REVOKED', 'SUSPENDED'].includes(String(data.accountStatus))) {
          return fail('Trạng thái tài khoản không hợp lệ.')
        }
        patch.accountStatus = data.accountStatus
      }
      if (
        data.staffTitle !== undefined &&
        STAFF_TITLES.includes(String(data.staffTitle) as StaffTitle)
      ) {
        patch.staffTitle = data.staffTitle
        if (targetDoc.adminRole !== 'SUPER_ADMIN') {
          patch.permissions = STAFF_ROLE_PERMISSION_PRESETS[data.staffTitle as StaffTitle]
        }
      }
      if (admin.adminRole === 'SUPER_ADMIN') {
        if (data.adminRole === 'SUPER_ADMIN' || data.adminRole === 'OPERATOR') {
          patch.adminRole = data.adminRole
        }
        if (data.branchScopeMode === 'ALL' || data.branchScopeMode === 'ASSIGNED') {
          patch.branchScopeMode = data.branchScopeMode
        }
      }

      const updated = await payload.update({
        collection: 'admins',
        id: targetAdminId,
        overrideAccess: true,
        data: patch,
      })

      // Also revoke active branch-staff assignments if account is revoked
      if (patch.accountStatus === 'REVOKED') {
        const activeAssigns = await payload.find({
          collection: 'branch-staff',
          overrideAccess: true,
          depth: 0,
          limit: 100,
          where: { and: [{ admin: { equals: targetAdminId } }, { status: { equals: 'ACTIVE' } }] },
        })
        for (const a of activeAssigns.docs) {
          await payload.update({
            collection: 'branch-staff',
            id: a.id,
            overrideAccess: true,
            data: { status: 'REVOKED', revokedAt: new Date().toISOString() },
          })
        }
        await syncAdminAssignedBranches(payload, targetAdminId)
      }

      return json({
        id: updated.id,
        accountStatus: updated.accountStatus,
        staffTitle: updated.staffTitle,
        branchScopeMode: updated.branchScopeMode,
      })
    }

    // Action 2: Update a specific branch-staff assignment
    const id = text(data.id, 100)
    if (!id) return fail('Thiếu mã phân công nhân viên.')
    const current = await payload.findByID({
      collection: 'branch-staff',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })
    const targetAdminId = relationId(current.admin) ?? ''
    const branchId = relationId(current.branch) ?? ''
    const guard = canManageStaffAssignment({
      actor: user,
      targetAdminId,
      targetBranchScopeMode: 'ASSIGNED',
      targetBranchIds: [branchId],
    })
    if (!guard.allowed)
      return fail(guard.reason ?? 'Không có quyền cập nhật phân công.', 403, 'FORBIDDEN')

    const patch: Record<string, unknown> = {}
    if (
      data.staffRole !== undefined &&
      BRANCH_STAFF_ROLES.includes(String(data.staffRole) as (typeof BRANCH_STAFF_ROLES)[number])
    ) {
      patch.staffRole = data.staffRole
    }
    if (
      data.status !== undefined &&
      ['ACTIVE', 'REVOKED', 'INACTIVE'].includes(String(data.status))
    ) {
      patch.status = data.status
      patch.revokedAt = data.status === 'REVOKED' ? new Date().toISOString() : null
    }
    if (Array.isArray(data.warehouses)) patch.warehouses = data.warehouses
    if (data.isPrimary !== undefined) patch.isPrimary = Boolean(data.isPrimary)
    if (data.notes !== undefined) patch.notes = text(data.notes, 500) || null

    const updated = await payload.update({
      collection: 'branch-staff',
      id,
      overrideAccess: true,
      data: patch,
    })
    if (targetAdminId) {
      await syncAdminAssignedBranches(payload, targetAdminId)
    }
    return json({ id: updated.id, status: updated.status })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin({ permission: ['staff', 'delete'] })
    if (!auth.ok) return auth.response
    const { payload, user } = auth

    const id = new URL(request.url).searchParams.get('id')?.trim() || ''
    if (!id) return fail('Thiếu mã phân công cần gỡ.')
    const current = await payload.findByID({
      collection: 'branch-staff',
      id,
      user,
      overrideAccess: false,
      depth: 0,
    })
    const targetAdminId = relationId(current.admin) ?? ''
    await payload.delete({ collection: 'branch-staff', id, user, overrideAccess: false })
    if (targetAdminId) await syncAdminAssignedBranches(payload, targetAdminId)
    return json({ deleted: true, id })
  } catch (error) {
    return apiError(error)
  }
}
