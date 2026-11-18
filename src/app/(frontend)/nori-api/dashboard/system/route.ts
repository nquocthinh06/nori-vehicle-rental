import { adminHasAnyPermission, adminHasPermission } from '@/access/nori'
import { requireAdmin } from '@/lib/admin-api'
import { apiError, assertOrigin, body, fail, json, text } from '@/lib/api-utils'
import {
  createFullBackup,
  exportSnapshots,
  getDataSyncStatus,
  importSnapshots,
  restoreFromBackup,
  validateSnapshotsAndMedia,
  type ConflictStrategy,
} from '@/lib/data-sync'
import { invalidateNoriCaches } from '@/lib/public-cache'

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { payload, user, admin } = auth

    if (
      !adminHasAnyPermission(admin, [
        ['settings', 'read'],
        ['content', 'read'],
        ['admins', 'read'],
        ['reports', 'read'],
      ])
    ) {
      return fail(
        'Tài khoản chưa được cấp quyền truy cập phân hệ Đồng bộ & Sao lưu dữ liệu.',
        403,
        'FORBIDDEN',
      )
    }

    const status = getDataSyncStatus()
    const canManageSync =
      admin.adminRole === 'SUPER_ADMIN' ||
      adminHasPermission(admin, 'settings', 'update') ||
      adminHasPermission(admin, 'content', 'publish')
    const canRestore = admin.adminRole === 'SUPER_ADMIN'

    let auditLogs: {
      id: string
      action: string
      entity: string
      entityId: string | null
      entityLabel: string | null
      summary: string
      fromStatus: string | null
      toStatus: string | null
      actorType: string
      actorEmail: string | null
      createdAt: string
    }[] = []

    try {
      const logsRes = await payload.find({
        collection: 'audit-logs',
        user,
        overrideAccess: true,
        depth: 0,
        limit: 50,
        sort: '-createdAt',
      })
      auditLogs = logsRes.docs.map((l) => ({
        id: String(l.id),
        action: l.action,
        entity: l.entity,
        entityId: l.entityId ?? null,
        entityLabel: l.entityLabel ?? null,
        summary: l.summary,
        fromStatus: l.fromStatus ?? null,
        toStatus: l.toStatus ?? null,
        actorType: l.actorType ?? 'SYSTEM',
        actorEmail: l.actorEmail ?? null,
        createdAt: l.createdAt,
      }))
    } catch {
      auditLogs = []
    }

    return json({
      status,
      permissions: {
        canManageSync,
        canRestore,
        adminRole: admin.adminRole,
      },
      auditLogs,
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    assertOrigin(request)
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { admin } = auth

    const data = await body(request, ['action', 'onConflict', 'backupId', 'force'])
    const action = text(data.action, 40)

    const canManageSync =
      admin.adminRole === 'SUPER_ADMIN' ||
      adminHasPermission(admin, 'settings', 'update') ||
      adminHasPermission(admin, 'content', 'publish')

    if (action === 'validate') {
      if (
        !adminHasAnyPermission(admin, [
          ['settings', 'read'],
          ['content', 'read'],
          ['admins', 'read'],
          ['reports', 'read'],
        ])
      ) {
        return fail('Tài khoản chưa được cấp quyền kiểm tra dữ liệu.', 403, 'FORBIDDEN')
      }
      const report = validateSnapshotsAndMedia()
      return json({ action: 'validate', report })
    }

    if (!canManageSync) {
      return fail(
        'Thao tác đồng bộ/sao lưu hệ thống yêu cầu quyền Quản trị viên cấp cao (SUPER_ADMIN) hoặc quyền cấu hình hệ thống.',
        403,
        'FORBIDDEN',
      )
    }

    const rawConflict = text(data.onConflict, 30)
    const onConflict: ConflictStrategy =
      rawConflict === 'keep-local' || rawConflict === 'prefer-snapshot' ? rawConflict : 'abort'

    if (action === 'dry_run_import') {
      const result = importSnapshots({
        dryRun: true,
        onConflict,
        actorEmail: admin.email,
        actorId: admin.id,
      })
      return json({ action: 'dry_run_import', result })
    }

    if (action === 'export') {
      const result = exportSnapshots({
        force: Boolean(data.force),
        actorEmail: admin.email,
        actorId: admin.id,
      })
      return json({ action: 'export', result })
    }

    if (action === 'import') {
      const result = importSnapshots({
        dryRun: false,
        onConflict,
        allowProductionImport: true,
        actorEmail: admin.email,
        actorId: admin.id,
      })
      if (result.ok) {
        invalidateNoriCaches({ slugs: [], allDetails: true, allPosts: true })
      }
      return json({ action: 'import', result }, result.ok ? 200 : 409)
    }

    if (action === 'backup') {
      const result = createFullBackup({
        actorEmail: admin.email,
        actorId: admin.id,
      })
      return json({
        action: 'backup',
        result: {
          ok: result.ok,
          backupId: result.backupId,
          dbSize: result.manifest.dbSize,
          mediaCount: result.manifest.mediaFiles.length,
          integrityCheck: result.manifest.integrityCheck,
          createdAt: result.manifest.createdAt,
        },
      })
    }

    if (action === 'restore') {
      if (admin.adminRole !== 'SUPER_ADMIN') {
        return fail(
          'Khôi phục cơ sở dữ liệu (Restore) chỉ dành cho Quản trị viên cấp cao (SUPER_ADMIN).',
          403,
          'FORBIDDEN',
        )
      }
      const backupId = text(data.backupId, 120)
      if (!backupId) {
        return fail('Vui lòng chọn mã bản sao lưu cần khôi phục.')
      }
      const result = restoreFromBackup({
        sourceBackup: backupId,
        actorEmail: admin.email,
        actorId: admin.id,
      })
      invalidateNoriCaches({ slugs: [], allDetails: true, allPosts: true })
      return json({ action: 'restore', result })
    }

    return fail('Hành động quản trị dữ liệu không hợp lệ.', 400, 'INVALID_ACTION')
  } catch (error) {
    return apiError(error)
  }
}
