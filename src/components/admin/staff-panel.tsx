'use client'

import { useEffect, useState } from 'react'
import { STAFF_TITLES, STAFF_TITLE_LABELS, type StaffTitle } from '@/access/nori'
import { api } from '@/lib/client-api'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  Text,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type StaffRow = {
  id: string
  email: string
  fullName: string
  phone: string
  adminRole: 'SUPER_ADMIN' | 'OPERATOR'
  staffTitle: StaffTitle
  branchScopeMode: 'ALL' | 'ASSIGNED'
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
  assignedBranches: {
    assignmentId: string
    branchId: string
    branchName: string
    roleTitle: string
    isPrimary: boolean
  }[]
}

type BranchOpt = { id: string; code: string; name: string }

export function StaffPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<StaffRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [isGlobal, setIsGlobal] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [staffTitle, setStaffTitle] = useState<StaffTitle>('RENTAL_STAFF')
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (branchFilter) sp.set('branchId', branchFilter)
    if (q.trim()) sp.set('q', q.trim())
    api<{ items: StaffRow[]; branches: BranchOpt[]; scope: { isGlobal: boolean } }>(
      `/dashboard/staff?${sp.toString()}`,
    )
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setBranches(res.branches ?? [])
        setIsGlobal(Boolean(res.scope?.isGlobal))
      })
      .catch((e) => {
        if (mounted) setError((e as Error).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [branchFilter, q, retry])

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      await api('/dashboard/staff', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'create_staff_account',
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim(),
          staffTitle,
          branchIds: selectedBranchIds,
        }),
      })
      toast(`Đã tạo tài khoản nhân viên ${email.trim().toLowerCase()}.`)
      setOpen(false)
      setEmail('')
      setPassword('')
      setFullName('')
      setPhone('')
      setSelectedBranchIds([])
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(staff: StaffRow, nextStatus: 'ACTIVE' | 'REVOKED') {
    const label =
      nextStatus === 'REVOKED' ? 'thu hồi quyền truy cập ngay lập tức' : 'khôi phục quyền truy cập'
    if (!window.confirm(`Bạn có chắc chắn muốn ${label} cho ${staff.email}?`)) return
    try {
      await api('/dashboard/staff', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'update_account',
          adminId: staff.id,
          accountStatus: nextStatus,
        }),
      })
      toast(
        nextStatus === 'REVOKED'
          ? `Đã thu hồi quyền của ${staff.email}.`
          : `Đã kích hoạt lại tài khoản ${staff.email}.`,
      )
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const creatableRoles: StaffTitle[] = isGlobal
    ? [...STAFF_TITLES]
    : ['RENTAL_STAFF', 'WAREHOUSE_STAFF', 'DELIVERY_STAFF', 'ACCOUNTANT', 'OPERATOR']

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="staff-search"
            label="Tìm kiếm nhân viên"
            placeholder="Họ tên, email, chức danh..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="staff-branch-filter"
            label="Lọc theo chi nhánh phân công"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">Tất cả chi nhánh trong phạm vi</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setFormError('')
            setSelectedBranchIds(branches[0] ? [branches[0].id] : [])
            setOpen(true)
          }}
        >
          <Icon name="plus" className="size-4" />
          Thêm nhân viên chi nhánh
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="user"
          title="Chưa có nhân viên nào trong phạm vi hiển thị"
          description="Thêm tài khoản nhân viên và phân công phạm vi chi nhánh rõ ràng theo nguyên tắc tối thiểu quyền hạn (RBAC)."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-canvas">
          <table className="w-full min-w-[720px] text-left text-small">
            <thead className="border-b border-line bg-subtle text-caption text-muted">
              <tr>
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Phạm vi chi nhánh</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((st) => (
                <tr key={st.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{st.fullName}</p>
                    <p className="text-caption text-muted">{st.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={st.adminRole === 'SUPER_ADMIN' ? 'brand' : 'muted'}>
                      {STAFF_TITLE_LABELS[st.staffTitle] ?? st.staffTitle}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {st.branchScopeMode === 'ALL' ? (
                      <Badge tone="brand">Toàn hệ thống</Badge>
                    ) : st.assignedBranches.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {st.assignedBranches.map((ab) => (
                          <Badge key={ab.assignmentId} tone="muted">
                            {ab.branchName}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-caption text-muted">Chưa phân công chi nhánh</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        st.accountStatus === 'ACTIVE'
                          ? 'brand'
                          : st.accountStatus === 'REVOKED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {st.accountStatus === 'ACTIVE'
                        ? 'Đang hoạt động'
                        : st.accountStatus === 'REVOKED'
                          ? 'Đã thu hồi quyền'
                          : 'Tạm khóa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {st.adminRole !== 'SUPER_ADMIN' && (
                      <Button
                        size="sm"
                        variant={st.accountStatus === 'ACTIVE' ? 'danger' : 'secondary'}
                        onClick={() =>
                          void toggleStatus(
                            st,
                            st.accountStatus === 'ACTIVE' ? 'REVOKED' : 'ACTIVE',
                          )
                        }
                      >
                        {st.accountStatus === 'ACTIVE' ? 'Thu hồi quyền' : 'Khôi phục'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Thêm nhân viên & Phân quyền chi nhánh"
        wide
      >
        <form onSubmit={handleCreateStaff} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="st-name"
              label="Họ và tên"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              id="st-email"
              label="Email đăng nhập"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="st-pass"
              label="Mật khẩu ban đầu"
              type="password"
              required
              hint="Tối thiểu 8 ký tự, gồm chữ và số"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              id="st-phone"
              label="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Select
              id="st-role"
              label="Vai trò nghiệp vụ (RBAC)"
              value={staffTitle}
              onChange={(e) => setStaffTitle(e.target.value as StaffTitle)}
            >
              {creatableRoles.map((r) => (
                <option key={r} value={r}>
                  {STAFF_TITLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>

          {!['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(staffTitle) && (
            <div>
              <Heading as="h3" size="body" className="mb-2 text-small font-semibold">
                Phân công chi nhánh phụ trách (chọn 1 hoặc nhiều chi nhánh)
              </Heading>
              <div className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-2">
                {branches.map((b) => {
                  const checked = selectedBranchIds.includes(b.id)
                  return (
                    <label key={b.id} className="flex items-center gap-2 text-small">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedBranchIds((prev) =>
                            e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                          )
                        }
                        className="size-4"
                      />
                      <span>
                        <strong>{b.code}</strong> — {b.name}
                      </span>
                    </label>
                  )
                })}
              </div>
              {branches.length === 0 && (
                <Text className="mt-1 text-caption text-danger">
                  Cần tạo ít nhất 1 chi nhánh trước khi phân công nhân viên chi nhánh.
                </Text>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Tạo tài khoản nhân viên
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
