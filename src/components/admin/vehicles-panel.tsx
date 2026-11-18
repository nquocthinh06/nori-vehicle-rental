'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatDate,
  formatMoney,
  getPhotoTypeOptions,
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

type VehiclePhotoItem = {
  imageId: string
  url: string
  alt: string
  caption: string
  kind: string
  photoType: string
  isPrimary: boolean
  sortOrder: number
  altText: string
}

type VehicleRow = {
  id: string
  reference: string
  licensePlate: string | null
  modelId: string
  modelName: string
  modelSlug: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  fuelType: string | null
  intent: string
  isDemo: boolean
  vehicleConditionType: string
  manufactureYear: number | null
  pricePerDay: number | null
  weekendSurcharge: number | null
  deliveryFee: number | null
  salePrice: number | null
  depositAmount: number | null
  odometer: number | null
  version: string | null
  color: string | null
  location: string | null
  pickupLocation: string | null
  condition: string | null
  exteriorCondition: string | null
  interiorCondition: string | null
  engineCondition: string | null
  maintenanceHistory: string | null
  inspectedAt: string | null
  operationStatus: string
  status: string
  photos: {
    image: { url: string; alt: string }
    imageId: string
    caption?: string
    kind?: string
    photoType?: string
    isPrimary?: boolean
    sortOrder?: number
    altText?: string
  }[]
  bookings: { id: string; bookingKey: string; status: string; startDate: string; endDate: string }[]
}

type ModelOption = {
  id: string
  name: string
  brand: string
  category: 'CAR' | 'MOTORBIKE' | 'PICKUP'
  fuelType?: string | null
}

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
  const [manufactureYear, setManufactureYear] = useState('')
  const [pricePerDay, setPricePerDay] = useState('')
  const [weekendSurcharge, setWeekendSurcharge] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [odometer, setOdometer] = useState('')
  const [version, setVersion] = useState('')
  const [color, setColor] = useState('')
  const [location, setLocation] = useState('')
  const [pickupLocation, setPickupLocation] = useState('')
  const [condition, setCondition] = useState('')
  const [exteriorCondition, setExteriorCondition] = useState('')
  const [interiorCondition, setInteriorCondition] = useState('')
  const [engineCondition, setEngineCondition] = useState('')
  const [maintenanceHistory, setMaintenanceHistory] = useState('')
  const [photos, setPhotos] = useState<VehiclePhotoItem[]>([])

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

  const selectedModelMeta = useMemo(
    () => models.find((m) => m.id === modelId) ?? null,
    [models, modelId],
  )
  const activeCategory: 'CAR' | 'MOTORBIKE' | 'PICKUP' =
    editing?.category ?? selectedModelMeta?.category ?? 'CAR'
  const isElectricInstance = (editing?.fuelType ?? selectedModelMeta?.fuelType) === 'Điện (EV)'
  const instancePhotoTypes = useMemo(
    () => getPhotoTypeOptions(activeCategory, isElectricInstance, true),
    [activeCategory, isElectricInstance],
  )

  function openCreate() {
    setEditing(null)
    setReference('')
    setLicensePlate('')
    setModelId(models[0]?.id ?? '')
    setIntent('RENT')
    setOpStatus('READY')
    setBizStatus('ACTIVE')
    setIsDemo(false)
    setManufactureYear('')
    setPricePerDay('')
    setWeekendSurcharge('')
    setDeliveryFee('')
    setSalePrice('')
    setDepositAmount('')
    setOdometer('')
    setVersion('')
    setColor('')
    setLocation('')
    setPickupLocation('')
    setCondition('')
    setExteriorCondition('')
    setInteriorCondition('')
    setEngineCondition('')
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
    setManufactureYear(v.manufactureYear != null ? String(v.manufactureYear) : '')
    setPricePerDay(v.pricePerDay != null ? String(v.pricePerDay) : '')
    setWeekendSurcharge(v.weekendSurcharge != null ? String(v.weekendSurcharge) : '')
    setDeliveryFee(v.deliveryFee != null ? String(v.deliveryFee) : '')
    setSalePrice(v.salePrice != null ? String(v.salePrice) : '')
    setDepositAmount(v.depositAmount != null ? String(v.depositAmount) : '')
    setOdometer(v.odometer != null ? String(v.odometer) : '')
    setVersion(v.version ?? '')
    setColor(v.color ?? '')
    setLocation(v.location ?? '')
    setPickupLocation(v.pickupLocation ?? '')
    setCondition(v.condition ?? '')
    setExteriorCondition(v.exteriorCondition ?? '')
    setInteriorCondition(v.interiorCondition ?? '')
    setEngineCondition(v.engineCondition ?? '')
    setMaintenanceHistory(v.maintenanceHistory ?? '')
    setPhotos(
      v.photos.map((p, idx) => ({
        imageId: p.imageId,
        url: p.image.url,
        alt: p.image.alt,
        caption: p.caption ?? '',
        kind: p.kind ?? 'ACTUAL',
        photoType: p.photoType ?? 'ACTUAL',
        isPrimary: Boolean(p.isPrimary ?? idx === 0),
        sortOrder: p.sortOrder ?? idx,
        altText: p.altText ?? p.image.alt,
      })),
    )
    setFormError('')
    setEditorOpen(true)
  }

  async function handleMultiPhotoUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setUploading(true)
    setFormError('')
    try {
      const form = new FormData()
      for (const f of files) {
        form.append('files', f)
      }
      form.append('alt', `${reference || 'Xe thực tế'} - Ảnh thực tế NORI`)
      form.append('mediaCategory', 'ACTUAL_VEHICLE')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
      }
      const uploaded = (json.data.uploaded ?? []) as {
        id: string
        alt: string
        url: string | null
        photo: { url: string; alt: string } | null
      }[]
      const failed = (json.data.failed ?? []) as { name: string; reason: string }[]
      if (uploaded.length > 0) {
        setPhotos((prev) => {
          const hasPrimary = prev.some((x) => x.isPrimary)
          return [
            ...prev,
            ...uploaded.map((u, idx) => ({
              imageId: u.id,
              url: u.photo?.url || u.url || '',
              alt: u.alt,
              caption: `${reference || 'Xe thực tế'} — Ảnh thực tế`,
              kind: 'ACTUAL',
              photoType: 'ACTUAL',
              isPrimary: !hasPrimary && idx === 0,
              sortOrder: prev.length + idx,
              altText: u.alt,
            })),
          ]
        })
      }
      if (failed.length > 0) {
        setFormError(
          `Đã tải ${uploaded.length}/${files.length} ảnh. Tệp bị từ chối: ${failed
            .map((f) => `${f.name} (${f.reason})`)
            .join('; ')}`,
        )
      } else {
        toast(`Đã tải lên ${uploaded.length} ảnh xe thực tế.`)
      }
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
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
        manufactureYear: manufactureYear.trim() ? Number(manufactureYear.trim()) : null,
        pricePerDay: pricePerDay.trim() ? Number(pricePerDay.trim()) : null,
        weekendSurcharge: weekendSurcharge.trim() ? Number(weekendSurcharge.trim()) : null,
        deliveryFee: deliveryFee.trim() ? Number(deliveryFee.trim()) : null,
        salePrice: salePrice.trim() ? Number(salePrice.trim()) : null,
        depositAmount: depositAmount.trim() ? Number(depositAmount.trim()) : null,
        odometer: odometer.trim() ? Number(odometer.trim()) : null,
        version: version.trim(),
        color: color.trim(),
        location: location.trim(),
        pickupLocation: pickupLocation.trim(),
        condition: condition.trim(),
        exteriorCondition: exteriorCondition.trim(),
        interiorCondition: activeCategory === 'MOTORBIKE' ? '' : interiorCondition.trim(),
        engineCondition: engineCondition.trim(),
        maintenanceHistory: maintenanceHistory.trim(),
        photos: photos.map((p, idx) => ({
          imageId: p.imageId,
          kind: p.kind,
          photoType: p.photoType,
          isPrimary: p.isPrimary,
          sortOrder: idx,
          caption: p.caption,
          altText: p.altText,
        })),
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
                  <strong>Biển số (nội bộ Admin):</strong> {detail.licensePlate || 'Chưa cập nhật'}
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

      {/* Create / Edit Vehicle Instance Dialog */}
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
              label="Biển số (nội bộ, không công khai)"
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

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Input
              id="veh-year"
              label="Năm SX"
              type="number"
              min={1990}
              max={2035}
              value={manufactureYear}
              onChange={(e) => setManufactureYear(e.target.value)}
            />
            <Input
              id="veh-price-day"
              label="Giá thuê/ngày"
              type="number"
              min={1}
              value={pricePerDay}
              onChange={(e) => setPricePerDay(e.target.value)}
            />
            <Input
              id="veh-wk-surcharge"
              label="Phụ phí T7–CN"
              type="number"
              min={0}
              value={weekendSurcharge}
              onChange={(e) => setWeekendSurcharge(e.target.value)}
            />
            <Input
              id="veh-deliv-fee"
              label="Phí giao xe"
              type="number"
              min={0}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
            />
            <Input
              id="veh-deposit"
              label="Tiền đặt cọc"
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

          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="veh-sale-price"
              label="Giá bán thực tế (VNĐ)"
              type="number"
              min={1}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
            <Input
              id="veh-version"
              label="Phiên bản thực tế"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            <Input
              id="veh-color"
              label="Màu sắc thực tế"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <Input
              id="veh-location"
              label="Khu vực"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <Input
            id="veh-pickup-loc"
            label="Địa điểm nhận & trả xe"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="veh-ext-cond"
              label="Tình trạng ngoại thất"
              value={exteriorCondition}
              onChange={(e) => setExteriorCondition(e.target.value)}
            />
            {activeCategory !== 'MOTORBIKE' && (
              <Input
                id="veh-int-cond"
                label="Tình trạng nội thất"
                value={interiorCondition}
                onChange={(e) => setInteriorCondition(e.target.value)}
              />
            )}
            <Input
              id="veh-eng-cond"
              label="Tình trạng vận hành"
              value={engineCondition}
              onChange={(e) => setEngineCondition(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              id="veh-condition"
              label="Tình trạng tổng quát"
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

          {/* Multi-Image Instance Upload & Ordering */}
          <div className="rounded-control border border-line p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Text className="text-small font-semibold">
                  Hình ảnh thực tế của cá thể xe này ({photos.length})
                </Text>
                <Text className="text-micro text-muted">
                  Tải nhiều ảnh thực tế (ngoại thất, ODO, tình trạng...) tách biệt khỏi ảnh
                  Catalogue.
                </Text>
              </div>
              <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                <Icon name="upload" className="size-4" />
                {uploading ? 'Đang tải...' : 'Tải nhiều ảnh thực tế'}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    if (e.target.files?.length) void handleMultiPhotoUpload(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>

            {photos.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {photos.map((p, idx) => (
                  <div
                    key={`${p.imageId}-${idx}`}
                    className={`flex gap-3 rounded-control border p-3 ${
                      p.isPrimary ? 'border-brand bg-soft/40' : 'border-line bg-canvas'
                    }`}
                  >
                    <Image
                      src={p.url}
                      alt={p.alt}
                      width={96}
                      height={68}
                      className="h-18 w-24 shrink-0 rounded-xs object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Select
                        id={`vphoto-type-${idx}`}
                        label="Loại ảnh"
                        value={p.photoType}
                        onChange={(e) => {
                          const opt = instancePhotoTypes.find((o) => o.value === e.target.value)
                          setPhotos((prev) =>
                            prev.map((item, i) =>
                              i !== idx
                                ? item
                                : {
                                    ...item,
                                    photoType: e.target.value,
                                    kind:
                                      opt?.kind === 'INTERIOR' || opt?.kind === 'ENGINE'
                                        ? opt.kind
                                        : 'ACTUAL',
                                  },
                            ),
                          )
                        }}
                      >
                        {instancePhotoTypes.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        id={`vphoto-cap-${idx}`}
                        label="Chú thích"
                        value={p.caption}
                        onChange={(e) =>
                          setPhotos((prev) =>
                            prev.map((item, i) =>
                              i !== idx ? item : { ...item, caption: e.target.value },
                            ),
                          )
                        }
                      />
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {!p.isPrimary && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setPhotos((prev) =>
                                prev.map((item, i) => ({ ...item, isPrimary: i === idx })),
                              )
                            }
                          >
                            Đặt ảnh chính
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() =>
                            setPhotos((prev) => {
                              const copy = [...prev]
                              const [m] = copy.splice(idx, 1)
                              copy.splice(idx - 1, 0, m)
                              return copy
                            })
                          }
                        >
                          Lên
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setPhotos((prev) => {
                              const next = prev.filter((_, i) => i !== idx)
                              if (p.isPrimary && next.length > 0) {
                                next[0] = { ...next[0], isPrimary: true }
                              }
                              return next
                            })
                          }
                        >
                          Gỡ
                        </Button>
                      </div>
                    </div>
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
