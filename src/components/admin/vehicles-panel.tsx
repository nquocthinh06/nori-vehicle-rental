'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatDate,
  formatMoney,
  operationStatusLabels,
} from '@/lib/rental-rules'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type VehicleRow = {
  id: string
  reference: string
  licensePlate: string | null
  modelId: string
  modelName: string
  modelSlug: string
  category: string
  intent: string
  isDemo: boolean
  vehicleConditionType: string
  manufactureYear: number | null
  pricePerDay: number | null
  salePrice: number | null
  depositAmount: number | null
  odometer: number | null
  version: string | null
  color: string | null
  location: string | null
  pickupLocation: string | null
  condition: string | null
  maintenanceHistory: string | null
  inspectedAt: string | null
  operationStatus: string
  status: string
  photos: { image: { url: string; alt: string }; imageId: string }[]
  bookings: { id: string; bookingKey: string; status: string; startDate: string; endDate: string }[]
}

type ModelOption = { id: string; name: string; brand: string; category: string }

export function VehiclesPanel() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [items, setItems] = useState<VehicleRow[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [opFilter, setOpFilter] = useState(searchParams.get('operationStatus') || '')
  const [statusFilter, setStatusFilter] = useState('')
  const [intentFilter, setIntentFilter] = useState('')
  const [sort, setSort] = useState('reference')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [detail, setDetail] = useState<VehicleRow | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<VehicleRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VehicleRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState('')

  // Form fields
  const [reference, setReference] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [modelId, setModelId] = useState('')
  const [intent, setIntent] = useState('RENT')
  const [opStatus, setOpStatus] = useState('READY')
  const [bizStatus, setBizStatus] = useState('ACTIVE')
  const [isDemo, setIsDemo] = useState(false)
  const [pricePerDay, setPricePerDay] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [odometer, setOdometer] = useState('')
  const [version, setVersion] = useState('')
  const [color, setColor] = useState('')
  const [location, setLocation] = useState('')
  const [condition, setCondition] = useState('')
  const [maintenanceHistory, setMaintenanceHistory] = useState('')
  const [photos, setPhotos] = useState<{ imageId: string; url: string; alt: string }[]>([])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      page: String(page),
      sort,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(opFilter ? { operationStatus: opFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(intentFilter ? { intent: intentFilter } : {}),
    })
    api<{
      items: VehicleRow[]
      totalDocs: number
      totalPages: number
      models: ModelOption[]
    }>(`/dashboard/vehicles?${sp.toString()}`)
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
        setModels(res.models)
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
  }, [page, q, opFilter, statusFilter, intentFilter, sort, retry])

  function openCreate() {
    setEditing(null)
    setReference('')
    setLicensePlate('')
    setModelId(models[0]?.id ?? '')
    setIntent('RENT')
    setOpStatus('READY')
    setBizStatus('ACTIVE')
    setIsDemo(false)
    setPricePerDay('')
    setSalePrice('')
    setDepositAmount('')
    setOdometer('')
    setVersion('')
    setColor('')
    setLocation('')
    setCondition('')
    setMaintenanceHistory('')
    setPhotos([])
    setFormError('')
    setEditorOpen(true)
  }

  function openEdit(v: VehicleRow) {
    setEditing(v)
    setReference(v.reference)
    setLicensePlate(v.licensePlate ?? '')
    setModelId(v.modelId)
    setIntent(v.intent)
    setOpStatus(v.operationStatus)
    setBizStatus(v.status)
    setIsDemo(v.isDemo)
    setPricePerDay(v.pricePerDay != null ? String(v.pricePerDay) : '')
    setSalePrice(v.salePrice != null ? String(v.salePrice) : '')
    setDepositAmount(v.depositAmount != null ? String(v.depositAmount) : '')
    setOdometer(v.odometer != null ? String(v.odometer) : '')
    setVersion(v.version ?? '')
    setColor(v.color ?? '')
    setLocation(v.location ?? '')
    setCondition(v.condition ?? '')
    setMaintenanceHistory(v.maintenanceHistory ?? '')
    setPhotos(v.photos.map((p) => ({ imageId: p.imageId, url: p.image.url, alt: p.image.alt })))
    setFormError('')
    setEditorOpen(true)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFormError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('alt', `${reference || 'Xe thực tế'} - Ảnh thực tế NORI`)
      form.append('mediaCategory', 'ACTUAL_VEHICLE')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
      }
      setPhotos((prev) => [
        ...prev,
        { imageId: json.data.id, url: json.data.photo?.url || json.data.url, alt: json.data.alt },
      ])
      toast('Đã tải ảnh xe thực tế lên hệ thống.')
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const payloadBody = {
        ...(editing ? { id: editing.id } : { reference, licensePlate, model: modelId }),
        intent,
        operationStatus: opStatus,
        status: bizStatus,
        isDemo,
        pricePerDay: pricePerDay.trim() ? Number(pricePerDay.trim()) : null,
        salePrice: salePrice.trim() ? Number(salePrice.trim()) : null,
        depositAmount: depositAmount.trim() ? Number(depositAmount.trim()) : null,
        odometer: odometer.trim() ? Number(odometer.trim()) : null,
        version: version.trim(),
        color: color.trim(),
        location: location.trim(),
        condition: condition.trim(),
        maintenanceHistory: maintenanceHistory.trim(),
        photoIds: photos.map((p) => p.imageId),
      }
      await api('/dashboard/vehicles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payloadBody),
      })
      toast(editing ? `Đã cập nhật xe ${editing.reference}.` : `Đã thêm xe mới ${reference}.`)
      setEditorOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/dashboard/vehicles?entity=vehicle&id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast(`Đã xóa phương tiện ${deleteTarget.reference}.`)
      setDeleteTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
      setDeleteTarget(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            id="veh-search"
            label="Tìm kiếm xe"
            placeholder="Mã xe, biển số, dòng xe..."
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Select
            id="veh-filter-op"
            label="Vận hành"
            value={opFilter}
            onChange={(e) => {
              setPage(1)
              setOpFilter(e.target.value)
            }}
          >
            <option value="">Tất cả</option>
            {Object.entries(operationStatusLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            id="veh-filter-status"
            label="Kinh doanh"
            value={statusFilter}
            onChange={(e) => {
              setPage(1)
              setStatusFilter(e.target.value)
            }}
          >
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang kinh doanh</option>
            <option value="INACTIVE">Tạm ngừng</option>
          </Select>
          <Select
            id="veh-filter-intent"
            label="Dịch vụ"
            value={intentFilter}
            onChange={(e) => {
              setPage(1)
              setIntentFilter(e.target.value)
            }}
          >
            <option value="">Tất cả</option>
            <option value="RENT">Chỉ cho thuê</option>
            <option value="SALE">Chỉ bán</option>
            <option value="BOTH">Thuê & Bán</option>
          </Select>
          <Select
            id="veh-sort"
            label="Sắp xếp"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="reference">Mã xe (A–Z)</option>
            <option value="price">Giá thuê tăng dần</option>
            <option value="-price">Giá thuê giảm dần</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/nori-api/dashboard/export?type=vehicles"
            download
            className="inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
          >
            <Icon name="download" className="size-4" />
            Xuất CSV
          </a>
          <Button size="sm" onClick={openCreate}>
            <Icon name="plus" className="size-4" />
            Thêm xe thực tế
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-72" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="car"
          title="Chưa có xe thực tế phù hợp"
          description="Thử thay đổi bộ lọc hoặc thêm xe thực tế mới vào kho phương tiện."
        >
          <Button onClick={openCreate}>Thêm xe thực tế</Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <Text className="text-caption text-muted">
            Hiển thị {items.length} / {totalDocs} phương tiện thực tế (Vehicle Instances)
          </Text>
          <div className="overflow-x-auto rounded-card border border-line bg-canvas">
            <table className="w-full min-w-[820px] text-left text-small">
              <thead className="border-b border-line bg-subtle text-caption text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Mã xe & Biển số</th>
                  <th className="px-4 py-3 font-semibold">Dòng xe / Phiên bản</th>
                  <th className="px-4 py-3 font-semibold">Giá thuê / Giá bán</th>
                  <th className="px-4 py-3 font-semibold">ODO</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((v) => (
                  <tr key={v.id} data-vehicle-ref={v.reference} className="hover:bg-subtle/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{v.reference}</span>
                        {v.isDemo && <Badge tone="warning">DEMO</Badge>}
                      </div>
                      <Text className="text-caption text-muted">
                        {v.licensePlate || 'Chưa có biển số'}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="font-medium text-ink">{v.modelName}</Text>
                      <Text className="text-caption text-muted">
                        {[v.version, v.color].filter(Boolean).join(' · ') || v.intent}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="font-medium">Thuê: {formatMoney(v.pricePerDay)}</Text>
                      <Text className="text-caption text-muted">
                        Bán: {formatMoney(v.salePrice)}
                      </Text>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {v.odometer != null
                        ? `${v.odometer.toLocaleString('vi-VN')} km`
                        : 'Chưa cập nhật'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={v.operationStatus} />
                        <Badge tone={v.status === 'ACTIVE' ? 'brand' : 'muted'}>
                          {v.status === 'ACTIVE' ? 'Đang kinh doanh' : 'Tạm ngừng'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setDetail(v)}>
                          Chi tiết
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(v)}>
                          Cập nhật / Bảo trì
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setDeleteTarget(v)}
                          aria-label={`Xóa xe ${v.reference}`}
                        >
                          <Icon name="trash" className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Text className="text-caption text-muted">
                Trang {page} / {totalPages}
              </Text>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Hồ sơ xe thực tế: ${detail?.reference ?? ''}`}
        wide
      >
        {detail && (
          <div className="space-y-5 text-small">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-control bg-subtle p-4">
                <p>
                  <strong>Dòng xe:</strong> {detail.modelName}
                </p>
                <p>
                  <strong>Biển số:</strong> {detail.licensePlate || 'Chưa cập nhật'}
                </p>
                <p>
                  <strong>Phiên bản / Màu:</strong>{' '}
                  {[detail.version, detail.color].filter(Boolean).join(' · ') || 'Chưa cập nhật'}
                </p>
                <p>
                  <strong>Khu vực:</strong> {detail.location || 'Chưa cập nhật'}
                </p>
                <p>
                  <strong>ODO:</strong>{' '}
                  {detail.odometer != null
                    ? `${detail.odometer.toLocaleString('vi-VN')} km`
                    : 'Chưa cập nhật'}
                </p>
              </div>
              <div className="rounded-control bg-subtle p-4">
                <p>
                  <strong>Giá thuê/ngày:</strong> {formatMoney(detail.pricePerDay)}
                </p>
                <p>
                  <strong>Giá bán:</strong> {formatMoney(detail.salePrice)}
                </p>
                <p>
                  <strong>Tiền đặt cọc:</strong> {formatMoney(detail.depositAmount)}
                </p>
                <p>
                  <strong>Tình trạng:</strong> {detail.condition || 'Chưa cập nhật'}
                </p>
                <p>
                  <strong>Lịch sử bảo dưỡng:</strong> {detail.maintenanceHistory || 'Chưa ghi nhận'}
                </p>
              </div>
            </div>

            <div>
              <Text className="mb-2 font-semibold">
                Lịch giữ chỗ & Đơn thuê liên quan ({detail.bookings.length})
              </Text>
              {detail.bookings.length === 0 ? (
                <Text className="text-caption text-muted">
                  Xe hiện chưa có đơn thuê nào gắn với mã xe này.
                </Text>
              ) : (
                <div className="space-y-2">
                  {detail.bookings.slice(0, 8).map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between rounded-control border border-line px-3 py-2 text-caption"
                    >
                      <span>
                        <strong>{b.bookingKey}</strong> · {formatDate(b.startDate)} →{' '}
                        {formatDate(b.endDate)}
                      </span>
                      <Badge tone="muted">{bookingStatusLabels[b.status] ?? b.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Create / Edit Dialog */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Cập nhật xe ${editing.reference}` : 'Thêm xe thực tế mới'}
        wide
      >
        <form onSubmit={saveVehicle} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="veh-ref"
              label="Mã quản lý xe"
              required
              disabled={Boolean(editing)}
              placeholder="NR-OT-VIOS02"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Input
              id="veh-plate"
              label="Biển số (nội bộ)"
              required
              disabled={Boolean(editing)}
              placeholder="51K-123.45"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
            <Select
              id="veh-model"
              label="Dòng xe catalogue"
              disabled={Boolean(editing)}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.brand})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="veh-intent"
              label="Dịch vụ"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            >
              <option value="RENT">Chỉ cho thuê</option>
              <option value="SALE">Chỉ bán</option>
              <option value="BOTH">Cho thuê & Bán</option>
            </Select>
            <Select
              id="veh-op-status"
              label="Trạng thái vận hành"
              value={opStatus}
              onChange={(e) => setOpStatus(e.target.value)}
            >
              {Object.entries(operationStatusLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Select
              id="veh-biz-status"
              label="Trạng thái kinh doanh"
              value={bizStatus}
              onChange={(e) => setBizStatus(e.target.value)}
            >
              <option value="ACTIVE">Đang kinh doanh</option>
              <option value="INACTIVE">Tạm ngừng</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="veh-price-day"
              label="Giá thuê/ngày (VNĐ)"
              type="number"
              min={1}
              value={pricePerDay}
              onChange={(e) => setPricePerDay(e.target.value)}
            />
            <Input
              id="veh-sale-price"
              label="Giá bán (VNĐ)"
              type="number"
              min={1}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
            <Input
              id="veh-deposit"
              label="Tiền đặt cọc (VNĐ)"
              type="number"
              min={0}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <Input
              id="veh-odo"
              label="ODO (km)"
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="veh-version"
              label="Phiên bản thực tế"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            <Input
              id="veh-color"
              label="Màu sắc"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <Input
              id="veh-location"
              label="Khu vực / Điểm giao nhận"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              id="veh-condition"
              label="Tình trạng thực tế"
              rows={2}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
            <Textarea
              id="veh-maint"
              label="Lịch sử bảo dưỡng"
              rows={2}
              value={maintenanceHistory}
              onChange={(e) => setMaintenanceHistory(e.target.value)}
            />
          </div>

          <div className="rounded-control border border-line p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Text className="text-small font-semibold">Ảnh thực tế của xe ({photos.length})</Text>
              <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                <Icon name="upload" className="size-4" />
                {uploading ? 'Đang tải...' : 'Tải ảnh mới'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={handlePhotoUpload}
                />
              </label>
            </div>
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {photos.map((p, idx) => (
                  <div
                    key={`${p.imageId}-${idx}`}
                    className="relative overflow-hidden rounded-control border border-line"
                  >
                    <Image
                      src={p.url}
                      alt={p.alt}
                      width={160}
                      height={104}
                      className="h-20 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Gỡ ảnh"
                      className="absolute right-1 top-1 rounded-pill bg-night/80 p-1 text-inverse hover:bg-danger"
                    >
                      <Icon name="close" className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Text className="text-caption text-muted">
                Chưa gắn ảnh thực tế riêng (xe sẽ không hiển thị ảnh catalogue thay cho ảnh thật).
              </Text>
            )}
          </div>

          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={isDemo}
              onChange={(e) => setIsDemo(e.target.checked)}
              className="size-4 rounded-sm border-line"
            />
            <span>Đánh dấu là dữ liệu minh họa (DEMO)</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Xác nhận xóa phương tiện"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <Text className="text-small">
              Bạn có chắc muốn xóa phương tiện <strong>{deleteTarget.reference}</strong>? Hệ thống
              sẽ tự động chặn nếu xe đã phát sinh đơn thuê hoặc yêu cầu mua để bảo toàn dữ liệu.
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Đóng
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
