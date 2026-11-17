'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/rental-rules'
import type { AdminSummary, AuditLogSummary } from '@/lib/domain-types'
import { Badge, Button, Heading, Input, Notice, Select, Skeleton, Text } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type AdminsResponse = {
  currentAdmin: {
    id: string
    email: string
    fullName: string
    adminRole: 'SUPER_ADMIN' | 'OPERATOR'
  }
  admins: AdminSummary[]
  auditLogs: AuditLogSummary[]
}

const MODULES = [
  { key: 'vehicles', label: 'Kho xe' },
  { key: 'models', label: 'Catalogue' },
  { key: 'maintenance', label: 'Bảo trì' },
  { key: 'bookings', label: 'Đơn thuê' },
  { key: 'inquiries', label: 'Yêu cầu mua' },
  { key: 'promotions', label: 'Khuyến mãi' },
  { key: 'payments', label: 'Thanh toán' },
  { key: 'customers', label: 'Khách hàng' },
  { key: 'content', label: 'CMS Website' },
  { key: 'posts', label: 'Bài viết' },
  { key: 'reports', label: 'Báo cáo' },
] as const

const ACTIONS = ['read', 'create', 'update', 'delete'] as const
const ACTION_LABELS: Record<string, string> = {
  read: 'Xem',
  create: 'Tạo',
  update: 'Sửa',
  delete: 'Xóa',
}

const DEFAULT_STAFF_PERMS: Record<string, string[]> = {
  vehicles: ['read', 'create', 'update'],
  models: ['read', 'update'],
  maintenance: ['read', 'create', 'update'],
  bookings: ['read', 'update'],
  inquiries: ['read', 'update'],
  promotions: ['read'],
  payments: ['read', 'create', 'update'],
  customers: ['read', 'update'],
  content: ['read'],
  posts: ['read', 'create', 'update'],
  reports: ['read'],
}

export function AdminsPanel() {
  const { toast } = useToast()
  const [data, setData] = useState<AdminsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'OPERATOR' | 'SUPER_ADMIN'>('OPERATOR')
  const [permTarget, setPermTarget] = useState<AdminSummary | null>(null)
  const [permDraft, setPermDraft] = useState<Record<string, string[]>>({})
  const [deleteTarget, setDeleteTarget] = useState<AdminSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [logFilter, setLogFilter] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api<AdminsResponse>('/dashboard/admins')
      .then((res) => {
        if (active) setData(res)
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await api('/dashboard/admins', {
        method: 'POST',
        body: JSON.stringify({
          email,
          fullName,
          password,
          adminRole: role,
          permissions: role === 'OPERATOR' ? DEFAULT_STAFF_PERMS : undefined,
        }),
      })
      toast(`Đã tạo tài khoản quản trị ${email}.`)
      setCreateOpen(false)
      setEmail('')
      setFullName('')
      setPassword('')
      setRole('OPERATOR')
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRoleChange(id: string, nextRole: 'SUPER_ADMIN' | 'OPERATOR') {
    setBusy(true)
    try {
      await api('/dashboard/admins', {
        method: 'PATCH',
        body: JSON.stringify({ id, adminRole: nextRole }),
      })
      toast('Đã cập nhật vai trò quản trị.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function savePermissions() {
    if (!permTarget) return
    setBusy(true)
    try {
      await api('/dashboard/admins', {
        method: 'PATCH',
        body: JSON.stringify({ id: permTarget.id, permissions: permDraft }),
      })
      toast(`Đã cập nhật phân quyền chi tiết cho ${permTarget.email}.`)
      setPermTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/dashboard/admins?id=${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' })
      toast(`Đã xóa tài khoản quản trị ${deleteTarget.email}.`)
      setDeleteTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton className="h-96" />
  if (!data) return <Notice tone="error">{error || 'Chưa thể tải danh sách quản trị.'}</Notice>

  const isSuperAdmin = data.currentAdmin.adminRole === 'SUPER_ADMIN'
  const filteredLogs = data.auditLogs.filter(
    (l) =>
      !logFilter ||
      l.entity === logFilter ||
      l.summary.toLowerCase().includes(logFilter.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Tài khoản Quản trị viên & Nhân viên ({data.admins.length})
            </Heading>
            <Text className="text-caption text-muted">
              SUPER_ADMIN có toàn quyền; Nhân viên vận hành (OPERATOR) được cấu hình quyền RBAC chi
              tiết theo từng module và thao tác.
            </Text>
          </div>
          {isSuperAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setFormError('')
                setCreateOpen(true)
              }}
            >
              <Icon name="plus" className="size-4" />
              Thêm tài khoản nhân viên / Admin
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-control border border-line">
          <table className="w-full min-w-[640px] text-left text-small">
            <thead className="border-b border-line bg-subtle text-caption text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Email / Họ tên</th>
                <th className="px-4 py-3 font-semibold">Vai trò</th>
                <th className="px-4 py-3 font-semibold">Ngày tạo</th>
                {isSuperAdmin && <th className="px-4 py-3 text-right font-semibold">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.admins.map((a) => {
                const isSelf = a.id === data.currentAdmin.id
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <Text className="font-semibold text-ink">
                        {a.fullName || 'Quản trị viên NORI'}{' '}
                        {isSelf && <Badge tone="brand">Bạn</Badge>}
                      </Text>
                      <Text className="text-caption text-muted">{a.email}</Text>
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin && !isSelf ? (
                        <select
                          aria-label={`Vai trò của ${a.email}`}
                          value={a.adminRole}
                          disabled={busy}
                          onChange={(e) =>
                            void handleRoleChange(
                              a.id,
                              e.target.value as 'SUPER_ADMIN' | 'OPERATOR',
                            )
                          }
                          className="rounded-control border border-line bg-canvas px-2.5 py-1.5 text-caption"
                        >
                          <option value="SUPER_ADMIN">Quản trị viên cấp cao</option>
                          <option value="OPERATOR">Nhân viên vận hành</option>
                        </select>
                      ) : (
                        <Badge tone={a.adminRole === 'SUPER_ADMIN' ? 'brand' : 'muted'}>
                          {a.adminRole === 'SUPER_ADMIN'
                            ? 'Quản trị viên cấp cao'
                            : 'Nhân viên vận hành'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-caption text-muted">{formatDate(a.createdAt)}</td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {a.adminRole === 'OPERATOR' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setPermDraft(a.permissions ?? DEFAULT_STAFF_PERMS)
                                setPermTarget(a)
                              }}
                            >
                              Phân quyền RBAC
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={isSelf || busy}
                            onClick={() => setDeleteTarget(a)}
                          >
                            Xóa
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Nhật ký thao tác hệ thống ({filteredLogs.length})
            </Heading>
            <Text className="text-caption text-muted">
              Bản ghi chỉ nối thêm (append-only), tự động lưu lại các thay đổi nghiệp vụ quan trọng
            </Text>
          </div>
          <Select
            id="audit-filter"
            label="Lọc theo phân hệ"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
          >
            <option value="">Tất cả phân hệ</option>
            <option value="booking">Đơn thuê xe</option>
            <option value="inquiry">Yêu cầu mua xe</option>
            <option value="vehicle">Kho xe thực tế</option>
            <option value="vehicle-model">Catalogue dòng xe</option>
            <option value="maintenance">Lịch bảo trì</option>
            <option value="promotion">Khuyến mãi</option>
            <option value="payment">Thanh toán</option>
            <option value="user">Khách hàng</option>
            <option value="review">Đánh giá</option>
            <option value="nori-site">Nội dung website</option>
            <option value="post">Bài viết CMS</option>
            <option value="admin">Tài khoản quản trị</option>
          </Select>
        </div>

        {filteredLogs.length === 0 ? (
          <Text className="py-6 text-center text-small text-muted">
            Chưa có nhật ký thao tác nào được ghi nhận.
          </Text>
        ) : (
          <div className="divide-y divide-line rounded-control border border-line">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-small"
              >
                <div className="min-w-0">
                  <Text className="font-medium text-ink">{log.summary}</Text>
                  <Text className="text-caption text-muted">
                    {log.actorEmail || log.actorType} · {log.action}
                  </Text>
                </div>
                <Text className="text-caption text-muted">{formatDate(log.createdAt)}</Text>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Thêm tài khoản quản trị"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <Input
            id="new-admin-name"
            label="Họ và tên"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            id="new-admin-email"
            label="Email quản trị"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="new-admin-password"
            label="Mật khẩu khởi tạo"
            type="password"
            required
            hint="Từ 8–72 ký tự, gồm ít nhất 1 chữ cái và 1 chữ số."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Select
            id="new-admin-role"
            label="Vai trò"
            value={role}
            onChange={(e) => setRole(e.target.value as 'OPERATOR' | 'SUPER_ADMIN')}
          >
            <option value="OPERATOR">Nhân viên vận hành (OPERATOR)</option>
            <option value="SUPER_ADMIN">Quản trị viên cấp cao (SUPER_ADMIN)</option>
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Tạo tài khoản
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(permTarget)}
        onClose={() => setPermTarget(null)}
        title={`Cấu hình quyền RBAC: ${permTarget?.email ?? ''}`}
        wide
      >
        {permTarget && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Phân hệ</th>
                    {ACTIONS.map((act) => (
                      <th key={act} className="px-3 py-2.5 text-center font-semibold">
                        {ACTION_LABELS[act]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {MODULES.map((m) => {
                    const current = permDraft[m.key] ?? []
                    return (
                      <tr key={m.key}>
                        <td className="px-4 py-2.5 font-medium">{m.label}</td>
                        {ACTIONS.map((act) => {
                          const checked = current.includes(act)
                          return (
                            <td key={act} className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${m.label} - ${ACTION_LABELS[act]}`}
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...current, act]
                                    : current.filter((x) => x !== act)
                                  setPermDraft({ ...permDraft, [m.key]: next })
                                }}
                                className="size-4"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPermTarget(null)}>
                Đóng
              </Button>
              <Button loading={busy} onClick={() => void savePermissions()}>
                Lưu phân quyền
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Xác nhận xóa tài khoản quản trị"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <Text className="text-small">
              Bạn có chắc muốn xóa tài khoản quản trị <strong>{deleteTarget.email}</strong>?
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void handleDelete()}>
                Xác nhận xóa
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
