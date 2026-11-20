'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  BRANCH_STATUSES,
  branchStatusLabels,
  type BranchFleetStats,
  type BranchStatus,
} from '@/lib/multi-branch-rules'
import { formatVnd } from '@/lib/rental-rules'
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
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type BranchRow = {
  id: string
  code: string
  name: string
  address: string
  province: string
  ward: string
  latitude: number | null
  longitude: number | null
  hotline: string
  email: string
  managerId: string | null
  managerName: string | null
  workStartTime: string
  workEndTime: string
  operatingHoursLabel: string
  description: string
  supportsHomeDelivery: boolean
  supportsHomePickup: boolean
  deliveryStartTime: string
  deliveryEndTime: string
  defaultDeliveryFee: number | null
  defaultPickupFee: number | null
  afterHoursFee: number | null
  freeDeliveryMinOrder: number | null
  status: BranchStatus
  warehousesCount: number
  locationsCount: number
  staffCount: number
  futureBookingsCount: number
  fleetStats: BranchFleetStats
}

type ManagerOption = { id: string; email: string; fullName: string; staffTitle: string }

function statusTone(st: BranchStatus): 'brand' | 'warning' | 'danger' | 'muted' {
  if (st === 'ACTIVE') return 'brand'
  if (st === 'TEMPORARILY_CLOSED') return 'warning'
  if (st === 'INACTIVE') return 'danger'
  return 'muted'
}

export function BranchesPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<BranchRow[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [unallocatedCount, setUnallocatedCount] = useState(0)
  const [isGlobal, setIsGlobal] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Modal state
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // Form fields
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [province, setProvince] = useState('')
  const [ward, setWard] = useState('')
  const [address, setAddress] = useState('')
  const [hotline, setHotline] = useState('')
  const [email, setEmail] = useState('')
  const [managerId, setManagerId] = useState('')
  const [workStartTime, setWorkStartTime] = useState('07:30')
  const [workEndTime, setWorkEndTime] = useState('21:00')
  const [description, setDescription] = useState('')
  const [supportsHomeDelivery, setSupportsHomeDelivery] = useState(false)
  const [supportsHomePickup, setSupportsHomePickup] = useState(false)
  const [deliveryStartTime, setDeliveryStartTime] = useState('08:00')
  const [deliveryEndTime, setDeliveryEndTime] = useState('20:00')
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState('')
  const [defaultPickupFee, setDefaultPickupFee] = useState('')
  const [afterHoursFee, setAfterHoursFee] = useState('')
  const [freeDeliveryMinOrder, setFreeDeliveryMinOrder] = useState('')
  const [status, setStatus] = useState<BranchStatus>('ACTIVE')
  const [ackFutureBookings, setAckFutureBookings] = useState(false)

  // Delete dialog
  const [deleting, setDeleting] = useState<BranchRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (statusFilter) sp.set('status', statusFilter)
    api<{
      items: BranchRow[]
      managers: ManagerOption[]
      unallocatedVehiclesCount: number
      scope: { isGlobal: boolean }
    }>(`/dashboard/branches?${sp.toString()}`)
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setManagers(res.managers ?? [])
        setUnallocatedCount(res.unallocatedVehiclesCount ?? 0)
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
  }, [q, statusFilter, retry])

  // Unsaved-changes guard (UI-06)
  useEffect(() => {
    if (!open || !dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, dirty])

  function openCreate() {
    setEditing(null)
    setCode('')
    setName('')
    setProvince('')
    setWard('')
    setAddress('')
    setHotline('')
    setEmail('')
    setManagerId('')
    setWorkStartTime('07:30')
    setWorkEndTime('21:00')
    setDescription('')
    setSupportsHomeDelivery(true)
    setSupportsHomePickup(true)
    setDeliveryStartTime('08:00')
    setDeliveryEndTime('20:00')
    setDefaultDeliveryFee('150000')
    setDefaultPickupFee('150000')
    setAfterHoursFee('100000')
    setFreeDeliveryMinOrder('')
    setStatus('ACTIVE')
    setAckFutureBookings(false)
    setFormError('')
    setDirty(false)
    setOpen(true)
  }

  function openEdit(b: BranchRow) {
    setEditing(b)
    setCode(b.code)
    setName(b.name)
    setProvince(b.province)
    setWard(b.ward)
    setAddress(b.address)
    setHotline(b.hotline)
    setEmail(b.email)
    setManagerId(b.managerId ?? '')
    setWorkStartTime(b.workStartTime || '07:30')
    setWorkEndTime(b.workEndTime || '21:00')
    setDescription(b.description)
    setSupportsHomeDelivery(b.supportsHomeDelivery)
    setSupportsHomePickup(b.supportsHomePickup)
    setDeliveryStartTime(b.deliveryStartTime || '08:00')
    setDeliveryEndTime(b.deliveryEndTime || '20:00')
    setDefaultDeliveryFee(b.defaultDeliveryFee != null ? String(b.defaultDeliveryFee) : '')
    setDefaultPickupFee(b.defaultPickupFee != null ? String(b.defaultPickupFee) : '')
    setAfterHoursFee(b.afterHoursFee != null ? String(b.afterHoursFee) : '')
    setFreeDeliveryMinOrder(b.freeDeliveryMinOrder != null ? String(b.freeDeliveryMinOrder) : '')
    setStatus(b.status)
    setAckFutureBookings(false)
    setFormError('')
    setDirty(false)
    setOpen(true)
  }

  function closeModal() {
    if (busy) return
    if (
      dirty &&
      !window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng hộp thoại?')
    ) {
      return
    }
    setOpen(false)
    setDirty(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const payloadBody = {
        ...(editing ? { id: editing.id } : { code: code.trim().toUpperCase() }),
        name: name.trim(),
        province: province.trim(),
        ward: ward.trim(),
        address: address.trim(),
        hotline: hotline.trim(),
        email: email.trim(),
        managerId: managerId || null,
        workStartTime,
        workEndTime,
        description: description.trim(),
        supportsHomeDelivery,
        supportsHomePickup,
        deliveryStartTime,
        deliveryEndTime,
        defaultDeliveryFee: defaultDeliveryFee.trim() === '' ? null : Number(defaultDeliveryFee),
        defaultPickupFee: defaultPickupFee.trim() === '' ? null : Number(defaultPickupFee),
        afterHoursFee: afterHoursFee.trim() === '' ? null : Number(afterHoursFee),
        freeDeliveryMinOrder:
          freeDeliveryMinOrder.trim() === '' ? null : Number(freeDeliveryMinOrder),
        status,
        acknowledgeFutureBookings: ackFutureBookings,
      }
      await api('/dashboard/branches', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payloadBody),
      })
      toast(
        editing
          ? `Đã cập nhật chi nhánh ${name.trim()}.`
          : `Đã tạo chi nhánh ${code.trim().toUpperCase()}.`,
      )
      setDirty(false)
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api(`/dashboard/branches?id=${encodeURIComponent(deleting.id)}`, { method: 'DELETE' })
      toast(`Đã xóa chi nhánh ${deleting.name}.`)
      setDeleting(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {unallocatedCount > 0 && (
        <Notice tone="info">
          Hiện có <strong>{unallocatedCount} phương tiện</strong> trong hệ thống chưa được phân bổ
          chi nhánh quản lý. Bạn có thể gán hàng loạt tại mục{' '}
          <a href="/dashboard/warehouses" className="font-semibold underline hover:text-brand">
            Kho xe &amp; Tồn kho
          </a>
          .
        </Notice>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="branch-search"
            label="Tìm kiếm chi nhánh"
            placeholder="Mã chi nhánh, tên, tỉnh/thành, địa chỉ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="branch-status-filter"
            label="Trạng thái chi nhánh"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {BRANCH_STATUSES.map((st) => (
              <option key={st} value={st}>
                {branchStatusLabels[st]}
              </option>
            ))}
          </Select>
        </div>
        {isGlobal && (
          <Button size="sm" onClick={openCreate}>
            <Icon name="plus" className="size-4" />
            Thêm chi nhánh mới
          </Button>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="home"
          title="Chưa có chi nhánh nào được thiết lập"
          description="Tạo chi nhánh đầu tiên với địa chỉ xác thực để quản lý kho xe, nhân sự, điểm giao nhận và bảng giá theo từng địa bàn."
        >
          {isGlobal && <Button onClick={openCreate}>Thêm chi nhánh mới</Button>}
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {items.map((b) => (
            <article
              key={b.id}
              data-branch-code={b.code}
              className="flex flex-col justify-between rounded-card border border-line bg-canvas p-5"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{b.code}</Badge>
                      <Badge tone={statusTone(b.status)}>{branchStatusLabels[b.status]}</Badge>
                      {b.supportsHomeDelivery && <Badge tone="muted">Giao tận nơi</Badge>}
                    </div>
                    <Heading as="h2" size="subtitle" className="mt-2 font-semibold text-ink">
                      {b.name}
                    </Heading>
                  </div>
                  <Text className="text-caption text-muted">
                    {b.workStartTime} – {b.workEndTime}
                  </Text>
                </div>

                <Text className="text-small text-muted">
                  {b.address}
                  {b.ward ? `, ${b.ward}` : ''}, {b.province}
                </Text>

                <div className="grid grid-cols-2 gap-2 rounded-control bg-subtle p-3 text-caption sm:grid-cols-4">
                  <div>
                    <span className="block text-muted">Xe quản lý</span>
                    <strong className="text-body text-ink">{b.fleetStats.managedTotal}</strong>
                  </div>
                  <div>
                    <span className="block text-muted">Hiện diện tại kho</span>
                    <strong className="text-body text-ink">
                      {b.fleetStats.physicallyPresentAtBranch}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted">Sẵn sàng thuê</span>
                    <strong className="text-body text-brand">{b.fleetStats.readyForRent}</strong>
                  </div>
                  <div>
                    <span className="block text-muted">Đơn tương lai</span>
                    <strong className="text-body text-ink">{b.futureBookingsCount}</strong>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
                  <span>
                    Kho xe: <strong className="text-ink">{b.warehousesCount}</strong>
                  </span>
                  <span>
                    Điểm giao nhận: <strong className="text-ink">{b.locationsCount}</strong>
                  </span>
                  <span>
                    Nhân sự: <strong className="text-ink">{b.staffCount}</strong>
                  </span>
                  {b.hotline && (
                    <span>
                      Hotline: <strong className="text-ink">{b.hotline}</strong>
                    </span>
                  )}
                  {b.defaultDeliveryFee != null && (
                    <span>
                      Phí giao mặc định:{' '}
                      <strong className="text-ink">{formatVnd(b.defaultDeliveryFee)}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <Text className="text-caption text-muted">
                  Quản lý: <strong className="text-ink">{b.managerName || 'Chưa phân công'}</strong>
                </Text>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                    Chỉnh sửa
                  </Button>
                  {isGlobal && (
                    <Button size="sm" variant="danger" onClick={() => setDeleting(b)}>
                      Xóa
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={closeModal}
        title={editing ? `Cập nhật chi nhánh ${editing.code}` : 'Tạo chi nhánh mới'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="br-code"
              label="Mã chi nhánh"
              required
              disabled={Boolean(editing)}
              placeholder="HCM-Q1"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setDirty(true)
              }}
            />
            <Input
              id="br-name"
              label="Tên chi nhánh"
              required
              wrapperClassName="sm:col-span-2"
              placeholder="NORI TP. Hồ Chí Minh - Quận 1"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setDirty(true)
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="br-province"
              label="Tỉnh / Thành phố"
              required
              placeholder="TP. Hồ Chí Minh"
              value={province}
              onChange={(e) => {
                setProvince(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-ward"
              label="Phường / Xã"
              placeholder="Phường Bến Nghé"
              value={ward}
              onChange={(e) => {
                setWard(e.target.value)
                setDirty(true)
              }}
            />
            <Select
              id="br-status"
              label="Trạng thái hoạt động"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as BranchStatus)
                setDirty(true)
              }}
            >
              {BRANCH_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {branchStatusLabels[st]}
                </option>
              ))}
            </Select>
          </div>

          <Input
            id="br-address"
            label="Địa chỉ đầy đủ"
            required
            placeholder="Số nhà, tên đường..."
            value={address}
            onChange={(e) => {
              setAddress(e.target.value)
              setDirty(true)
            }}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="br-hotline"
              label="Hotline chi nhánh"
              value={hotline}
              onChange={(e) => {
                setHotline(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-email"
              label="Email chi nhánh"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setDirty(true)
              }}
            />
            {isGlobal && (
              <Select
                id="br-manager"
                label="Người quản lý chi nhánh"
                value={managerId}
                onChange={(e) => {
                  setManagerId(e.target.value)
                  setDirty(true)
                }}
              >
                <option value="">-- Chưa phân công --</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.email})
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="br-open"
              label="Giờ mở cửa"
              type="time"
              value={workStartTime}
              onChange={(e) => {
                setWorkStartTime(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-close"
              label="Giờ đóng cửa"
              type="time"
              value={workEndTime}
              onChange={(e) => {
                setWorkEndTime(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-dlv-start"
              label="Bắt đầu giao tận nơi"
              type="time"
              value={deliveryStartTime}
              onChange={(e) => {
                setDeliveryStartTime(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-dlv-end"
              label="Kết thúc giao tận nơi"
              type="time"
              value={deliveryEndTime}
              onChange={(e) => {
                setDeliveryEndTime(e.target.value)
                setDirty(true)
              }}
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={supportsHomeDelivery}
                onChange={(e) => {
                  setSupportsHomeDelivery(e.target.checked)
                  setDirty(true)
                }}
                className="size-4"
              />
              Hỗ trợ giao xe tận nơi
            </label>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={supportsHomePickup}
                onChange={(e) => {
                  setSupportsHomePickup(e.target.checked)
                  setDirty(true)
                }}
                className="size-4"
              />
              Hỗ trợ thu hồi xe tận nơi
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="br-dlv-fee"
              label="Phí giao mặc định (VNĐ)"
              type="number"
              min={0}
              value={defaultDeliveryFee}
              onChange={(e) => {
                setDefaultDeliveryFee(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-pk-fee"
              label="Phí thu hồi mặc định (VNĐ)"
              type="number"
              min={0}
              value={defaultPickupFee}
              onChange={(e) => {
                setDefaultPickupFee(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-ah-fee"
              label="Phí ngoài giờ (VNĐ)"
              type="number"
              min={0}
              value={afterHoursFee}
              onChange={(e) => {
                setAfterHoursFee(e.target.value)
                setDirty(true)
              }}
            />
            <Input
              id="br-free-dlv"
              label="Miễn phí giao đơn từ (VNĐ)"
              type="number"
              min={0}
              value={freeDeliveryMinOrder}
              onChange={(e) => {
                setFreeDeliveryMinOrder(e.target.value)
                setDirty(true)
              }}
            />
          </div>

          <Textarea
            id="br-desc"
            label="Giới thiệu chi nhánh"
            rows={2}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setDirty(true)
            }}
          />

          {editing && editing.futureBookingsCount > 0 && status !== 'ACTIVE' && (
            <Notice tone="info">
              <div className="space-y-2">
                <p>
                  Chi nhánh hiện có{' '}
                  <strong>{editing.futureBookingsCount} đơn thuê tương lai</strong> đã giữ lịch. Các
                  đơn này sẽ được giữ nguyên an toàn (không tự động hủy).
                </p>
                <label className="flex items-center gap-2 font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={ackFutureBookings}
                    onChange={(e) => setAckFutureBookings(e.target.checked)}
                    className="size-4"
                  />
                  Tôi đã rà soát các đơn thuê tương lai và xác nhận chuyển trạng thái chi nhánh
                </label>
              </div>
            </Notice>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={busy} onClick={closeModal}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => {
          if (!deleteBusy) setDeleting(null)
        }}
        title={`Xác nhận xóa chi nhánh ${deleting?.code ?? ''}`}
      >
        <div className="space-y-4 text-small">
          <Text className="text-muted">
            Hệ thống sẽ chặn xóa cứng nếu chi nhánh đã phát sinh kho xe, nhân sự, phương tiện, đơn
            thuê hoặc điều chuyển. Bạn có muốn tiếp tục xóa{' '}
            <strong className="text-ink">{deleting?.name}</strong>?
          </Text>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={deleteBusy} onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Xác nhận xóa
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
