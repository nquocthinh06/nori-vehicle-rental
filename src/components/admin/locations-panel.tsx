'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  SERVICE_LOCATION_TYPES,
  serviceLocationTypeLabels,
  type ServiceLocationType,
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

type LocationRow = {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string
  locationType: ServiceLocationType
  address: string
  province: string
  openTime: string
  closeTime: string
  supportsPickup: boolean
  supportsReturn: boolean
  supportsHomeDeliveryOrigin: boolean
  supportedCategories: string
  surchargeFee: number
  pickupInstructions: string
  returnInstructions: string
  verified: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED'
}

type BranchOpt = { id: string; code: string; name: string; province?: string }

export function LocationsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<LocationRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LocationRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [locationType, setLocationType] = useState<ServiceLocationType>('BRANCH')
  const [address, setAddress] = useState('')
  const [province, setProvince] = useState('')
  const [openTime, setOpenTime] = useState('07:30')
  const [closeTime, setCloseTime] = useState('21:00')
  const [supportsPickup, setSupportsPickup] = useState(true)
  const [supportsReturn, setSupportsReturn] = useState(true)
  const [supportedCategories, setSupportedCategories] = useState('CAR,MOTORBIKE,PICKUP')
  const [surchargeFee, setSurchargeFee] = useState('0')
  const [pickupInstructions, setPickupInstructions] = useState('')
  const [returnInstructions, setReturnInstructions] = useState('')
  const [verified, setVerified] = useState(true)
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED'>('ACTIVE')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (branchFilter) sp.set('branchId', branchFilter)
    if (q.trim()) sp.set('q', q.trim())
    api<{ items: LocationRow[]; branches: BranchOpt[] }>(`/dashboard/locations?${sp.toString()}`)
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setBranches(res.branches ?? [])
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
    setLocationType('BRANCH')
    setAddress('')
    setProvince(branches[0]?.province ?? '')
    setOpenTime('07:30')
    setCloseTime('21:00')
    setSupportsPickup(true)
    setSupportsReturn(true)
    setSupportedCategories('CAR,MOTORBIKE,PICKUP')
    setSurchargeFee('0')
    setPickupInstructions('')
    setReturnInstructions('')
    setVerified(true)
    setStatus('ACTIVE')
    setFormError('')
    setOpen(true)
  }

  function openEdit(loc: LocationRow) {
    setEditing(loc)
    setCode(loc.code)
    setName(loc.name)
    setBranchId(loc.branchId)
    setLocationType(loc.locationType)
    setAddress(loc.address)
    setProvince(loc.province)
    setOpenTime(loc.openTime)
    setCloseTime(loc.closeTime)
    setSupportsPickup(loc.supportsPickup)
    setSupportsReturn(loc.supportsReturn)
    setSupportedCategories(loc.supportedCategories)
    setSurchargeFee(String(loc.surchargeFee))
    setPickupInstructions(loc.pickupInstructions)
    setReturnInstructions(loc.returnInstructions)
    setVerified(loc.verified)
    setStatus(loc.status)
    setFormError('')
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      await api('/dashboard/locations', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { code: code.trim().toUpperCase(), branchId }),
          name: name.trim(),
          locationType,
          address: address.trim(),
          province: province.trim(),
          openTime,
          closeTime,
          supportsPickup,
          supportsReturn,
          supportedCategories,
          surchargeFee: Number(surchargeFee || 0),
          pickupInstructions: pickupInstructions.trim(),
          returnInstructions: returnInstructions.trim(),
          verified,
          status,
        }),
      })
      toast(
        editing
          ? `Đã cập nhật điểm ${editing.code}.`
          : `Đã tạo điểm giao nhận ${code.trim().toUpperCase()}.`,
      )
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(loc: LocationRow) {
    if (!window.confirm(`Xác nhận xóa điểm giao nhận ${loc.code} (${loc.name})?`)) return
    try {
      await api(`/dashboard/locations?id=${encodeURIComponent(loc.id)}`, { method: 'DELETE' })
      toast(`Đã xóa điểm ${loc.code}.`)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="loc-search"
            label="Tìm điểm nhận / trả xe"
            placeholder="Mã điểm, tên địa điểm, sân bay, địa chỉ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="loc-branch-filter"
            label="Chi nhánh phụ trách"
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
          Thêm điểm giao nhận
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="pin"
          title="Chưa có điểm nhận / trả xe"
          description="Thiết lập các điểm nhận và trả xe đã xác minh (chi nhánh, showroom, sân bay, nhà ga, đối tác) kèm hướng dẫn và phụ phí rõ ràng."
        >
          {branches.length > 0 && <Button onClick={openCreate}>Thêm điểm giao nhận</Button>}
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((loc) => (
            <article
              key={loc.id}
              data-location-code={loc.code}
              className="rounded-card border border-line bg-canvas p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{loc.code}</Badge>
                    <Badge tone={loc.status === 'ACTIVE' ? 'brand' : 'warning'}>{loc.status}</Badge>
                    <Badge tone="muted">{serviceLocationTypeLabels[loc.locationType]}</Badge>
                    {!loc.verified && <Badge tone="danger">Chưa xác minh</Badge>}
                  </div>
                  <Heading as="h2" size="body" className="mt-2 font-semibold text-ink">
                    {loc.name}
                  </Heading>
                  <Text className="text-caption text-muted">
                    {loc.address}, {loc.province} · CN:{' '}
                    <strong className="text-ink">{loc.branchName}</strong>
                  </Text>
                </div>
                <div className="text-right text-small">
                  <strong className="text-brand">
                    {loc.surchargeFee > 0 ? `+${formatVnd(loc.surchargeFee)}` : 'Miễn phụ phí'}
                  </strong>
                  <span className="block text-micro text-muted">
                    {loc.openTime} – {loc.closeTime}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-caption text-muted">
                <span>{loc.supportsPickup ? '✓ Nhận xe' : '✕ Không nhận xe'}</span>
                <span>{loc.supportsReturn ? '✓ Trả xe' : '✕ Không trả xe'}</span>
                <span>Loại xe: {loc.supportedCategories}</span>
              </div>

              {(loc.pickupInstructions || loc.returnInstructions) && (
                <div className="mt-3 rounded-control bg-subtle p-3 text-caption text-muted">
                  {loc.pickupInstructions && <p>Nhận xe: {loc.pickupInstructions}</p>}
                  {loc.returnInstructions && <p>Trả xe: {loc.returnInstructions}</p>}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
                <Button size="sm" variant="secondary" onClick={() => openEdit(loc)}>
                  Chỉnh sửa
                </Button>
                <Button size="sm" variant="danger" onClick={() => void handleDelete(loc)}>
                  Xóa
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={editing ? `Cập nhật điểm ${editing.code}` : 'Thêm điểm nhận / trả xe'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="loc-code"
              label="Mã điểm"
              required
              disabled={Boolean(editing)}
              placeholder="LOC-SGN-AIR"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Input
              id="loc-name"
              label="Tên địa điểm"
              required
              wrapperClassName="sm:col-span-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="loc-br"
              label="Chi nhánh phụ trách"
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
              id="loc-type"
              label="Loại địa điểm"
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as ServiceLocationType)}
            >
              {SERVICE_LOCATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {serviceLocationTypeLabels[t]}
                </option>
              ))}
            </Select>
            <Input
              id="loc-fee"
              label="Phụ phí điểm giao nhận (VNĐ)"
              type="number"
              min={0}
              value={surchargeFee}
              onChange={(e) => setSurchargeFee(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="loc-addr"
              label="Địa chỉ cụ thể"
              required
              wrapperClassName="sm:col-span-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              id="loc-prov"
              label="Tỉnh / Thành phố"
              required
              value={province}
              onChange={(e) => setProvince(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="loc-open"
              label="Giờ mở cửa"
              type="time"
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
            />
            <Input
              id="loc-close"
              label="Giờ đóng cửa"
              type="time"
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
            />
            <Input
              id="loc-cats"
              label="Danh mục xe phục vụ"
              value={supportedCategories}
              onChange={(e) => setSupportedCategories(e.target.value)}
              hint="CAR,MOTORBIKE,PICKUP"
            />
            <Select
              id="loc-status"
              label="Trạng thái"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'TEMPORARILY_CLOSED')
              }
            >
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="TEMPORARILY_CLOSED">Tạm đóng</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-6 text-small">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={supportsPickup}
                onChange={(e) => setSupportsPickup(e.target.checked)}
                className="size-4"
              />
              Cho phép nhận xe
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={supportsReturn}
                onChange={(e) => setSupportsReturn(e.target.checked)}
                className="size-4"
              />
              Cho phép trả xe
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="size-4"
              />
              Đã xác minh địa chỉ (được phép công bố cho khách)
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              id="loc-pk-inst"
              label="Hướng dẫn nhận xe"
              rows={2}
              value={pickupInstructions}
              onChange={(e) => setPickupInstructions(e.target.value)}
            />
            <Textarea
              id="loc-rt-inst"
              label="Hướng dẫn trả xe"
              rows={2}
              value={returnInstructions}
              onChange={(e) => setReturnInstructions(e.target.value)}
            />
          </div>
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
    </div>
  )
}
