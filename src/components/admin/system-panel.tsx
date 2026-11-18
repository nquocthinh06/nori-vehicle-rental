'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/rental-rules'
import { Badge, Button, Heading, Notice, Select, Skeleton, Text } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type SyncStatusResponse = {
  status: {
    schemaVersion: string
    snapshotVersion: string | null
    lastExportedAt: string | null
    snapshotContentHash: string | null
    dbContentHash: string | null
    inSyncWithSnapshot: boolean
    unexportedCount: number
    unexportedByCollection: Record<string, number>
    counts: {
      vehicleModels: number
      vehicles: number
      heroSlides: number
      banners: number
      articles: number
      promotions: number
      referencedMedia: number
    } | null
    validation: {
      ok: boolean
      checkedFiles: number
      mediaChecked: number
      errorCount: number
      errors: string[]
    } | null
    pendingImportPreview: {
      status: string
      toCreate: number
      toUpdate: number
      unchanged: number
      conflicts: number
      conflictDetails: {
        collection: string
        key: string
        changedFields: string[]
        mediaConflict: boolean
        localUpdatedAt: string | null
        snapshotUpdatedAt: string | null
        resolutionHint: string
      }[]
    } | null
    lastBackupAt: string | null
    backups: {
      backupId: string
      createdAt: string
      sizeBytes: number
      hasMediaBundle: boolean
      mediaCount: number
      integrity: string
    }[]
  }
  permissions: {
    canManageSync: boolean
    canRestore: boolean
    adminRole: 'SUPER_ADMIN' | 'OPERATOR'
  }
  auditLogs: {
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
  }[]
}

const COLLECTION_LABELS: Record<string, string> = {
  vehicleModels: 'Dòng xe (Catalogue)',
  vehicles: 'Xe thực tế (Demo)',
  siteSettings: 'Cấu hình Website',
  heroSlides: 'Hero Slider',
  banners: 'Banner',
  articles: 'Bài viết CMS',
  promotions: 'Khuyến mãi',
  media: 'Hình ảnh Media',
}

export function SystemPanel() {
  const { toast } = useToast()
  const [data, setData] = useState<SyncStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [conflictMode, setConflictMode] = useState<'abort' | 'keep-local' | 'prefer-snapshot'>(
    'abort',
  )
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api<SyncStatusResponse>('/dashboard/system')
      .then((res) => {
        if (active) {
          setData(res)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry])

  async function runSystemAction(
    action: 'validate' | 'export' | 'dry_run_import' | 'import' | 'backup' | 'restore',
    extra?: Record<string, unknown>,
  ) {
    setBusyAction(action)
    try {
      const res = await api<Record<string, unknown>>('/dashboard/system', {
        method: 'POST',
        body: JSON.stringify({
          action,
          onConflict: conflictMode,
          ...extra,
        }),
      })
      if (action === 'validate') {
        const rep = res.report as { ok?: boolean } | undefined
        toast(
          rep?.ok
            ? 'Kiểm tra toàn vẹn Snapshot & Media đạt 100%.'
            : 'Phát hiện lỗi toàn vẹn dữ liệu. Vui lòng xem chi tiết.',
          rep?.ok ? 'success' : 'error',
        )
      } else if (action === 'export') {
        const exp = res.result as
          | { snapshotVersion?: string; copiedMediaFiles?: number }
          | undefined
        toast(
          `Đã xuất Snapshot ${exp?.snapshotVersion ?? ''} (${exp?.copiedMediaFiles ?? 0} file ảnh mới). Sẵn sàng commit lên GitHub.`,
          'success',
        )
      } else if (action === 'dry_run_import') {
        const imp = res.result as {
          summary?: { toCreate: number; toUpdate: number; conflicts: number }
        }
        toast(
          `Dry Run hoàn tất: +${imp?.summary?.toCreate ?? 0} thêm mới, ~${imp?.summary?.toUpdate ?? 0} cập nhật, ${imp?.summary?.conflicts ?? 0} xung đột.`,
          'success',
        )
      } else if (action === 'import') {
        toast('Đã đồng bộ dữ liệu và hình ảnh từ Snapshot vào Database thành công.', 'success')
        setImportConfirmOpen(false)
      } else if (action === 'backup') {
        const b = res.result as { backupId?: string } | undefined
        toast(`Đã tạo bản sao lưu nhất quán ${b?.backupId ?? ''}.`, 'success')
      } else if (action === 'restore') {
        toast(`Đã khôi phục Database & Media từ bản sao lưu ${restoreTarget}.`, 'success')
        setRestoreTarget(null)
      }
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) return <Skeleton className="h-96" />
  if (!data) return <Notice tone="error">{error || 'Không thể tải trạng thái hệ thống.'}</Notice>

  const { status, permissions, auditLogs } = data
  const unexportedEntries = Object.entries(status.unexportedByCollection).filter(([, c]) => c > 0)

  return (
    <div className="space-y-6">
      {/* 3-State Data Persistence Lifecycle Explanation */}
      <section className="rounded-card border border-line bg-canvas p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Heading as="h2" size="subtitle">
            Chu trình lưu trữ & đồng bộ dữ liệu nhóm (3 trạng thái)
          </Heading>
          <Badge tone={status.inSyncWithSnapshot ? 'brand' : 'warning'}>
            {status.inSyncWithSnapshot
              ? 'Database & Git Snapshot đã đồng bộ'
              : `Có ${status.unexportedCount} thay đổi trong DB chưa xuất Snapshot`}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-control border border-line bg-subtle p-3.5">
            <div className="flex items-center gap-2 text-small font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-pill bg-line text-micro font-bold">
                1
              </span>
              Chưa lưu (Unsaved UI)
            </div>
            <Text className="mt-1.5 text-caption text-muted">
              Thay đổi đang nhập trên trình duyệt. Cần nhấn <strong>Lưu thay đổi</strong> hoặc{' '}
              <strong>Xuất bản</strong> để ghi vào Database.
            </Text>
          </div>
          <div className="rounded-control border border-brand/30 bg-brand-soft/40 p-3.5">
            <div className="flex items-center gap-2 text-small font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-pill bg-brand text-micro font-bold text-inverse">
                2
              </span>
              Đã lưu vào Database & Media
            </div>
            <Text className="mt-1.5 text-caption text-muted">
              Đã ghi lâu dài vào <code>nori.db</code> và <code>media/</code>. Không mất khi restart
              server hay build lại ứng dụng.
            </Text>
          </div>
          <div className="rounded-control border border-line bg-subtle p-3.5">
            <div className="flex items-center gap-2 text-small font-semibold text-ink">
              <span className="flex size-6 items-center justify-center rounded-pill bg-night text-micro font-bold text-inverse">
                3
              </span>
              Đã Export ra Git Snapshot
            </div>
            <Text className="mt-1.5 text-caption text-muted">
              Xuất nội dung công khai & ảnh mẫu ra <code>data/snapshots/</code> và{' '}
              <code>media/seed/</code> để commit/push chia sẻ qua GitHub.
            </Text>
          </div>
        </div>
      </section>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-canvas p-4">
          <Text className="text-caption text-muted">Phiên bản Snapshot & Schema</Text>
          <p className="mt-1 text-subtitle font-semibold text-ink">
            {status.snapshotVersion ?? 'Chưa tạo'}
          </p>
          <Text className="mt-1 text-micro text-muted">Schema: {status.schemaVersion}</Text>
        </div>
        <div className="rounded-card border border-line bg-canvas p-4">
          <Text className="text-caption text-muted">Trạng thái Export GitHub</Text>
          <p className="mt-1 text-subtitle font-semibold text-ink">
            {status.unexportedCount === 0
              ? '0 bản ghi chờ'
              : `${status.unexportedCount} bản ghi chưa export`}
          </p>
          <Text className="mt-1 text-micro text-muted">
            Export gần nhất: {status.lastExportedAt ? formatDate(status.lastExportedAt) : 'Chưa có'}
          </Text>
        </div>
        <div className="rounded-card border border-line bg-canvas p-4">
          <Text className="text-caption text-muted">Thư viện Media & Toàn vẹn</Text>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-subtitle font-semibold text-ink">
              {status.counts?.referencedMedia ?? 0} tệp ảnh
            </span>
            <Badge tone={status.validation?.ok ? 'brand' : 'danger'}>
              {status.validation?.ok ? 'Hợp lệ' : 'Có lỗi'}
            </Badge>
          </div>
          <Text className="mt-1 text-micro text-muted">
            Đã kiểm tra checksum SHA-256 & tham chiếu
          </Text>
        </div>
        <div className="rounded-card border border-line bg-canvas p-4">
          <Text className="text-caption text-muted">Sao lưu (Backup DB + Media)</Text>
          <p className="mt-1 text-subtitle font-semibold text-ink">
            {status.backups.length} bản sao lưu
          </p>
          <Text className="mt-1 text-micro text-muted">
            Gần nhất: {status.lastBackupAt ? formatDate(status.lastBackupAt) : 'Chưa có'}
          </Text>
        </div>
      </div>

      {/* Action Control Panel */}
      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Công cụ Đồng bộ Snapshot, Kiểm tra & Sao lưu
            </Heading>
            <Text className="text-caption text-muted">
              Chỉ xuất dữ liệu được phép chia sẻ (Catalogue, Xe Demo, Nội dung CMS, Media mẫu). Tự
              động loại trừ tài khoản thực, mật khẩu, đơn thuê và dữ liệu nhạy cảm.
            </Text>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button
              size="sm"
              variant="secondary"
              loading={busyAction === 'validate'}
              onClick={() => void runSystemAction('validate')}
            >
              <Icon name="check" className="size-4" />
              Kiểm tra toàn vẹn (Validate)
            </Button>
            {permissions.canManageSync && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyAction === 'dry_run_import'}
                  onClick={() => void runSystemAction('dry_run_import')}
                >
                  Xem trước Import (Dry Run)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyAction === 'backup'}
                  onClick={() => void runSystemAction('backup')}
                >
                  Tạo Backup ngay
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyAction === 'import'}
                  onClick={() => setImportConfirmOpen(true)}
                >
                  Import từ Snapshot
                </Button>
                <Button
                  size="sm"
                  loading={busyAction === 'export'}
                  onClick={() => void runSystemAction('export', { force: true })}
                >
                  Export ra Snapshot ({status.unexportedCount})
                </Button>
              </>
            )}
          </div>
        </div>

        {unexportedEntries.length > 0 && (
          <Notice tone="info">
            <strong>Có {status.unexportedCount} thay đổi trong Database chưa xuất Snapshot:</strong>{' '}
            {unexportedEntries
              .map(([k, count]) => `${COLLECTION_LABELS[k] || k}: ${count}`)
              .join(' · ')}
            . Hãy nhấn <strong>Export ra Snapshot</strong> hoặc chạy{' '}
            <code>npm run data:export</code> trước khi commit lên GitHub.
          </Notice>
        )}

        {status.validation && !status.validation.ok && (
          <Notice tone="error">
            <strong>Phát hiện lỗi kiểm tra toàn vẹn ({status.validation.errorCount}):</strong>
            <ul className="mt-1 list-disc pl-5 text-caption">
              {status.validation.errors.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}

        {status.pendingImportPreview && (
          <div className="rounded-control border border-line bg-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text className="text-small font-semibold text-ink">
                Dự kiến khi Import Snapshot ({status.snapshotVersion}):
              </Text>
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">+{status.pendingImportPreview.toCreate} thêm mới</Badge>
                <Badge tone="muted">~{status.pendingImportPreview.toUpdate} cập nhật</Badge>
                <Badge tone="muted">={status.pendingImportPreview.unchanged} giữ nguyên</Badge>
                {status.pendingImportPreview.conflicts > 0 && (
                  <Badge tone="danger">{status.pendingImportPreview.conflicts} xung đột</Badge>
                )}
              </div>
            </div>
            {status.pendingImportPreview.conflictDetails.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <Text className="text-caption font-semibold text-danger">
                  Chi tiết xung đột cần giải quyết (không tự động ghi đè):
                </Text>
                {status.pendingImportPreview.conflictDetails.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-control border border-danger/30 bg-canvas p-2.5 text-caption"
                  >
                    <strong>
                      [{c.collection}:{c.key}]
                    </strong>{' '}
                    Trường thay đổi: <code>{c.changedFields.join(', ')}</code>
                    {c.mediaConflict && (
                      <Badge tone="warning" className="ml-2">
                        Xung đột hình ảnh
                      </Badge>
                    )}
                    <div className="mt-1 text-micro text-muted">{c.resolutionHint}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Backups List */}
      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Danh sách Bản sao lưu (Database & Media)
            </Heading>
            <Text className="text-caption text-muted">
              Mỗi bản sao lưu sử dụng SQLite <code>VACUUM INTO</code> nhất quán kèm toàn bộ tệp hình
              ảnh media và mã kiểm tra SHA-256.
            </Text>
          </div>
        </div>
        {status.backups.length === 0 ? (
          <Text className="py-4 text-center text-small text-muted">
            Chưa có bản sao lưu nào trong thư mục <code>backups/</code>.
          </Text>
        ) : (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead className="border-b border-line bg-subtle text-caption text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Mã bản sao lưu</th>
                  <th className="px-4 py-2.5 font-semibold">Thời điểm tạo</th>
                  <th className="px-4 py-2.5 font-semibold">Dung lượng DB</th>
                  <th className="px-4 py-2.5 font-semibold">Media đi kèm</th>
                  <th className="px-4 py-2.5 font-semibold">Toàn vẹn</th>
                  {permissions.canRestore && (
                    <th className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {status.backups.map((b) => (
                  <tr key={b.backupId}>
                    <td className="px-4 py-2.5 font-mono text-caption font-semibold text-ink">
                      {b.backupId}
                    </td>
                    <td className="px-4 py-2.5 text-caption text-muted">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-caption">
                      {(b.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-4 py-2.5 text-caption">
                      {b.hasMediaBundle ? `${b.mediaCount} tệp ảnh` : 'Chỉ DB'}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={b.integrity === 'ok' ? 'brand' : 'danger'}>{b.integrity}</Badge>
                    </td>
                    {permissions.canRestore && (
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRestoreTarget(b.backupId)}
                        >
                          Khôi phục
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit Log History */}
      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <Heading as="h2" size="subtitle">
          Lịch sử thay đổi dữ liệu, Media & Đồng bộ gần đây ({auditLogs.length})
        </Heading>
        {auditLogs.length === 0 ? (
          <Text className="py-4 text-center text-small text-muted">
            Chưa có nhật ký hoạt động nào.
          </Text>
        ) : (
          <div className="divide-y divide-line rounded-control border border-line">
            {auditLogs.slice(0, 20).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-small"
              >
                <div className="min-w-0 flex-1">
                  <Text className="font-medium text-ink">{log.summary}</Text>
                  <Text className="text-caption text-muted">
                    {log.actorEmail || log.actorType} · <code>{log.action}</code>
                    {log.fromStatus || log.toStatus
                      ? ` · [${log.fromStatus ?? '—'} → ${log.toStatus ?? '—'}]`
                      : ''}
                  </Text>
                </div>
                <Text className="text-caption text-muted">{formatDate(log.createdAt)}</Text>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirm Import Dialog */}
      <Dialog
        open={importConfirmOpen}
        onClose={() => setImportConfirmOpen(false)}
        title="Xác nhận Import dữ liệu từ Snapshot"
      >
        <div className="space-y-4">
          <Text className="text-small">
            Hệ thống sẽ tự động tạo một bản Backup trước khi cập nhật dữ liệu từ Snapshot{' '}
            <strong>{status.snapshotVersion}</strong> vào Database hiện tại. Dữ liệu khách hàng và
            đơn thuê thực tế không bị ảnh hưởng.
          </Text>
          <Select
            id="import-conflict-strategy"
            label="Chính sách xử lý khi phát hiện xung đột (Conflict)"
            value={conflictMode}
            onChange={(e) =>
              setConflictMode(e.target.value as 'abort' | 'keep-local' | 'prefer-snapshot')
            }
          >
            <option value="abort">An toàn: Dừng Import nếu có xung đột (Khuyến nghị)</option>
            <option value="keep-local">Giữ bản ghi cục bộ (Bỏ qua bản ghi bị xung đột)</option>
            <option value="prefer-snapshot">Ưu tiên áp dụng bản ghi từ Snapshot</option>
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setImportConfirmOpen(false)}>
              Hủy
            </Button>
            <Button
              loading={busyAction === 'import'}
              onClick={() => void runSystemAction('import')}
            >
              Xác nhận Import
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Confirm Restore Dialog */}
      <Dialog
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        title="Xác nhận Khôi phục (Restore) Database & Media"
      >
        {restoreTarget && (
          <div className="space-y-4">
            <Text className="text-small">
              Bạn có chắc chắn muốn khôi phục cơ sở dữ liệu và tệp hình ảnh về bản sao lưu{' '}
              <strong>{restoreTarget}</strong>? Hệ thống sẽ tự động tạo một bản sao lưu dự phòng
              trước khi thực hiện.
            </Text>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
                Hủy
              </Button>
              <Button
                variant="danger"
                loading={busyAction === 'restore'}
                onClick={() => void runSystemAction('restore', { backupId: restoreTarget })}
              >
                Xác nhận Khôi phục
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
