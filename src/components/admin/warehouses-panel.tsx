'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  WAREHOUSE_STATUSES,
  WAREHOUSE_TYPES,
  warehouseStatusLabels,
  warehouseTypeLabels,
  type WarehouseStatus,
  type WarehouseType,
} from '@/lib/multi-branch-rules'
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

type WarehouseRow = {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string
  warehouseType: WarehouseType
  address: string
  capacity: number
  allowOverCapacity: boolean
  operatingHours: string
  isCustomerFacing: boolean
  status: WarehouseStatus
  notes: string
  occupancy: {
    physicalCount: number
    readyCount: number
    capacity: number
    availableSlots: number
    isOverCapacity: boolean
    occupancyRate: number
  }
  vehicles: { id: string; reference: string; modelName: string; operationStatus: string }[]
}

type UnallocatedVehicle = {
  id: string
  reference: string
  licensePlate: string
  modelName: string
  location: string
}

type BranchOpt = { id: string; code: string; name: string; status: string }

export function WarehousesPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<WarehouseRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [unallocated, setUnallocated] = useState<UnallocatedVehicle[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Warehouse modal
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [warehouseType, setWarehouseType] = useState<WarehouseType>('SHOWROOM')
  const [address, setAddress] = useState('')
  const [capacity, setCapacity] = useState('20')
  const [allowOverCapacity, setAllowOverCapacity] = useState(false)
  const [isCustomerFacing, setIsCustomerFacing] = useState(true)
  const [operatingHours, setOperatingHours] = useState('07:30 – 21:00')
  const [status, setStatus] = useState<WarehouseStatus>('ACTIVE')
  const [notes, setNotes] = useState('')

  // Bulk allocate modal
  const [allocOpen, setAllocOpen] = useState(false)
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([])
  const [allocBranchId, setAllocBranchId] = useState('')
  const [allocWarehouseId, setAllocWarehouseId] = useState('')
  const [allocBusy, setAllocBusy] = useState(false)
  const [allocError, setAllocError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (branchFilter) sp.set('branchId', branchFilter)
    if (q.trim()) sp.set('q', q.trim())
    api<{
      items: WarehouseRow[]
      branches: BranchOpt[]
      unallocatedVehicles: UnallocatedVehicle[]
    }>(`/dashboard/warehouses?${sp.toString()}`)
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setBranches(res.branches ?? [])
        setUnallocated(res.unallocatedVehicles ?? [])
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

  function openCreate() {
    setEditing(null)
    setCode('')
    setName('')
    setBranchId(branches[0]?.id ?? '')
    setWarehouseType('SHOWROOM')
    setAddress('')
    setCapacity('20')
    setAllowOverCapacity(false)
    setIsCustomerFacing(true)
    setOperatingHours('07:30 – 21:00')
    setStatus('ACTIVE')
    setNotes('')
    setFormError('')
    setOpen(true)
  }

  function openEdit(w: WarehouseRow) {
    setEditing(w)
    setCode(w.code)
    setName(w.name)
    setBranchId(w.branchId)
    setWarehouseType(w.warehouseType)
    setAddress(w.address)
    setCapacity(String(w.capacity))
    setAllowOverCapacity(w.allowOverCapacity)
    setIsCustomerFacing(w.isCustomerFacing)
    setOperatingHours(w.operatingHours)
    setStatus(w.status)
    setNotes(w.notes)
    setFormError('')
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      await api('/dashboard/warehouses', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { code: code.trim().toUpperCase(), branchId }),
          name: name.trim(),
          warehouseType,
          address: address.trim(),
          capacity: Number(capacity),
          allowOverCapacity,
          isCustomerFacing,
          operatingHours: operatingHours.trim(),
          status,
          notes: notes.trim(),
        }),
      })
      toast(
        editing ? `Đã cập nhật kho ${editing.code}.` : `Đã tạo kho ${code.trim().toUpperCase()}.`,
      )
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkAllocate(e: React.FormEvent) {
    e.preventDefault()
    setAllocError('')
    if (!selectedVehicleIds.length || !allocBranchId || !allocWarehouseId) {
      setAllocError('Vui lòng chọn ít nhất một phương tiện, chi nhánh quản lý và kho xe tiếp nhận.')
      return
    }
    setAllocBusy(true)
    try {
      await api('/dashboard/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          action: 'bulk_allocate',
          vehicleIds: selectedVehicleIds,
          branchId: allocBranchId,
          warehouseId: allocWarehouseId,
        }),
      })
      toast(`Đã phân bổ ${selectedVehicleIds.length} phương tiện thành công.`)
      setSelectedVehicleIds([])
      setAllocOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setAllocError((err as Error).message)
    } finally {
      setAllocBusy(false)
    }
  }

  async function handleDelete(w: WarehouseRow) {
    if (!window.confirm(`Xác nhận xóa kho ${w.code} (${w.name})?`)) return
    try {
      await api(`/dashboard/warehouses?id=${encodeURIComponent(w.id)}`, { method: 'DELETE' })
      toast(`Đã xóa kho ${w.code}.`)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const warehousesForAllocBranch = items.filter((w) => w.branchId === allocBranchId)

  return (
    <div className="space-y-6">
      {unallocated.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/30 bg-soft p-4">
          <div className="text-small">
            <strong className="text-ink">
              {unallocated.length} phương tiện chưa phân bổ chi nhánh / kho xe.
            </strong>{' '}
            <span className="text-muted">
              Phân bổ ngay để đưa xe vào lịch khả dụng đa chi nhánh.
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setAllocBranchId(branches[0]?.id ?? '')
              setAllocWarehouseId('')
              setSelectedVehicleIds(unallocated.slice(0, 5).map((v) => v.id))
              setAllocError('')
              setAllocOpen(true)
            }}
          >
            Phân bổ xe hàng loạt
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="wh-search"
            label="Tìm kiếm kho xe"
            placeholder="Mã kho, tên kho, địa chỉ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="wh-branch-filter"
            label="Lọc theo chi nhánh"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={openCreate} disabled={branches.length === 0}>
          <Icon name="plus" className="size-4" />
          Thêm kho xe
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="grid"
          title="Chưa có kho phương tiện"
          description={
            branches.length === 0
              ? 'Vui lòng tạo ít nhất một chi nhánh trước khi thiết lập kho xe.'
              : 'Tạo kho xe, showroom hoặc bãi tập kết cho chi nhánh để theo dõi tồn kho thực tế.'
          }
        >
          {branches.length > 0 && <Button onClick={openCreate}>Thêm kho xe</Button>}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((w) => (
            <article
              key={w.id}
              data-warehouse-code={w.code}
              className="rounded-card border border-line bg-canvas p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{w.code}</Badge>
                    <Badge tone={w.status === 'ACTIVE' ? 'brand' : 'warning'}>
                      {warehouseStatusLabels[w.status]}
                    </Badge>
                    <Badge tone="muted">{warehouseTypeLabels[w.warehouseType]}</Badge>
                  </div>
                  <Heading as="h2" size="body" className="mt-2 font-semibold text-ink">
                    {w.name}
                  </Heading>
                  <Text className="text-caption text-muted">
                    Chi nhánh: <strong className="text-ink">{w.branchName}</strong> · {w.address}
                  </Text>
                </div>
                <div className="text-right">
                  <Text className="text-subtitle font-bold text-ink">
                    {w.occupancy.physicalCount} / {w.occupancy.capacity}
                  </Text>
                  <Text className="text-micro text-muted">
                    {w.occupancy.readyCount} sẵn sàng · {w.occupancy.occupancyRate}% sức chứa
                  </Text>
                </div>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-subtle">
                <div
                  className={`h-full rounded-pill ${w.occupancy.isOverCapacity ? 'bg-danger' : 'bg-brand'}`}
                  style={{ width: `${Math.min(100, w.occupancy.occupancyRate)}%` }}
                />
              </div>

              {w.vehicles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {w.vehicles.slice(0, 8).map((v) => (
                    <Badge key={v.id} tone="muted">
                      {v.reference} ({v.operationStatus})
                    </Badge>
                  ))}
                  {w.vehicles.length > 8 && (
                    <Badge tone="muted">+{w.vehicles.length - 8} xe khác</Badge>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <Text className="text-micro text-muted">
                  {w.isCustomerFacing ? 'Phục vụ khách trực tiếp' : 'Kho vận hành nội bộ'} ·{' '}
                  {w.operatingHours || 'Theo giờ chi nhánh'}
                </Text>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(w)}>
                    Chỉnh sửa
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void handleDelete(w)}>
                    Xóa
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={editing ? `Cập nhật kho ${editing.code}` : 'Tạo kho xe mới'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="wh-code"
              label="Mã kho"
              required
              disabled={Boolean(editing)}
              placeholder="WH-HCM-01"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Input
              id="wh-name"
              label="Tên kho xe"
              required
              wrapperClassName="sm:col-span-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="wh-branch"
              label="Chi nhánh trực thuộc"
              required
              disabled={Boolean(editing)}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
            <Select
              id="wh-type"
              label="Loại kho"
              value={warehouseType}
              onChange={(e) => setWarehouseType(e.target.value as WarehouseType)}
            >
              {WAREHOUSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {warehouseTypeLabels[t]}
                </option>
              ))}
            </Select>
            <Input
              id="wh-cap"
              label="Sức chứa tối đa (xe)"
              type="number"
              min={1}
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <Input
            id="wh-addr"
            label="Địa chỉ kho"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="wh-hours"
              label="Giờ hoạt động"
              value={operatingHours}
              onChange={(e) => setOperatingHours(e.target.value)}
            />
            <Select
              id="wh-status"
              label="Trạng thái kho"
              value={status}
              onChange={(e) => setStatus(e.target.value as WarehouseStatus)}
            >
              {WAREHOUSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {warehouseStatusLabels[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-6 text-small">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isCustomerFacing}
                onChange={(e) => setIsCustomerFacing(e.target.checked)}
                className="size-4"
              />
              Phục vụ khách nhận/trả xe trực tiếp
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowOverCapacity}
                onChange={(e) => setAllowOverCapacity(e.target.checked)}
                className="size-4"
              />
              Cho phép vượt sức chứa tạm thời
            </label>
          </div>
          <Textarea
            id="wh-notes"
            label="Ghi chú"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={allocOpen}
        onClose={() => !allocBusy && setAllocOpen(false)}
        title="Phân bổ phương tiện chưa gán chi nhánh"
        wide
      >
        <form onSubmit={handleBulkAllocate} className="space-y-4">
          {allocError && <Notice tone="error">{allocError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="alloc-br"
              label="Chi nhánh quản lý & hiện diện"
              required
              value={allocBranchId}
              onChange={(e) => {
                setAllocBranchId(e.target.value)
                setAllocWarehouseId('')
              }}
            >
              <option value="">-- Chọn chi nhánh --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
            <Select
              id="alloc-wh"
              label="Kho xe tiếp nhận"
              value={allocWarehouseId}
              onChange={(e) => setAllocWarehouseId(e.target.value)}
            >
              <option value="">-- Chưa chỉ định kho cụ thể --</option>
              {warehousesForAllocBranch.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name} ({w.occupancy.physicalCount}/{w.occupancy.capacity})
                </option>
              ))}
            </Select>
          </div>

          <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-control border border-line p-3">
            {unallocated.map((v) => {
              const checked = selectedVehicleIds.includes(v.id)
              return (
                <label
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-small hover:bg-subtle"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedVehicleIds((prev) =>
                          e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                        )
                      }
                      className="size-4"
                    />
                    <strong>{v.reference}</strong> · {v.modelName} (
                    {v.licensePlate || 'Chưa biển số'})
                  </span>
                  <span className="text-caption text-muted">{v.location}</span>
                </label>
              )
            })}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={allocBusy} onClick={() => setAllocOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={allocBusy}>
              Xác nhận phân bổ ({selectedVehicleIds.length} xe)
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
