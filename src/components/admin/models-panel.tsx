'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatMoney, subCategoryLabels } from '@/lib/rental-rules'
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

type ModelRow = {
  id: string
  name: string
  slug: string
  brand: string
  category: string
  subCategory: string | null
  segment: string | null
  origin: string | null
  modelYear: number | null
  seats: number | null
  fuelType: string | null
  transmission: string | null
  driveType: string | null
  listedPrice: number | null
  referenceRentPrice: number | null
  description: string | null
  verificationStatus: string
  visible: boolean
  featured: boolean
  cover: { url: string; alt: string } | null
  coverId: string | null
  specsCount: number
  variantsCount: number
  galleryCount: number
  fleetCount: number
}

const catLabels: Record<string, string> = {
  CAR: 'Ô tô',
  MOTORBIKE: 'Xe máy',
  PICKUP: 'Bán tải',
}

export function ModelsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<ModelRow[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ModelRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState('')

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [catField, setCatField] = useState('CAR')
  const [subCategory, setSubCategory] = useState('')
  const [segment, setSegment] = useState('')
  const [listedPrice, setListedPrice] = useState('')
  const [referenceRentPrice, setReferenceRentPrice] = useState('')
  const [description, setDescription] = useState('')
  const [visible, setVisible] = useState(true)
  const [featured, setFeatured] = useState(false)
  const [coverId, setCoverId] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      view: 'models',
      page: String(page),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(category ? { category } : {}),
    })
    api<{ items: ModelRow[]; totalDocs: number; totalPages: number }>(
      `/dashboard/vehicles?${sp.toString()}`,
    )
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
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
  }, [page, q, category, retry])

  function openCreate() {
    setEditing(null)
    setName('')
    setBrand('')
    setCatField('CAR')
    setSubCategory('')
    setSegment('')
    setListedPrice('')
    setReferenceRentPrice('')
    setDescription('')
    setVisible(true)
    setFeatured(false)
    setCoverId(null)
    setCoverPreview(null)
    setFormError('')
    setEditorOpen(true)
  }

  function openEdit(m: ModelRow) {
    setEditing(m)
    setName(m.name)
    setBrand(m.brand)
    setCatField(m.category)
    setSubCategory(m.subCategory ?? '')
    setSegment(m.segment ?? '')
    setListedPrice(m.listedPrice != null ? String(m.listedPrice) : '')
    setReferenceRentPrice(m.referenceRentPrice != null ? String(m.referenceRentPrice) : '')
    setDescription(m.description ?? '')
    setVisible(m.visible)
    setFeatured(m.featured)
    setCoverId(m.coverId)
    setCoverPreview(m.cover?.url ?? null)
    setFormError('')
    setEditorOpen(true)
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFormError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('alt', `${name || 'Dòng xe NORI'} - Ảnh đại diện`)
      form.append('mediaCategory', 'CATALOGUE_REFERENCE')
      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
      setCoverId(json.data.id)
      setCoverPreview(json.data.photo?.url || json.data.url)
      toast('Đã tải ảnh đại diện dòng xe.')
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function saveModel(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await api('/dashboard/vehicles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          entity: 'model',
          ...(editing ? { id: editing.id } : {}),
          name: name.trim(),
          brand: brand.trim(),
          category: catField,
          subCategory: subCategory || undefined,
          segment: segment.trim(),
          listedPrice: listedPrice.trim() ? Number(listedPrice.trim()) : null,
          referenceRentPrice: referenceRentPrice.trim() ? Number(referenceRentPrice.trim()) : null,
          description: description.trim(),
          visible,
          featured,
          coverId,
        }),
      })
      toast(editing ? `Đã cập nhật dòng xe ${name}.` : `Đã thêm dòng xe ${name}.`)
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
      await api(`/dashboard/vehicles?entity=model&id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      })
      toast(`Đã xóa dòng xe ${deleteTarget.name}.`)
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
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Input
            id="model-search"
            label="Tìm kiếm dòng xe"
            placeholder="Tên dòng xe, thương hiệu, phân khúc..."
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Select
            id="model-cat-filter"
            label="Danh mục"
            value={category}
            onChange={(e) => {
              setPage(1)
              setCategory(e.target.value)
            }}
          >
            <option value="">Tất cả danh mục</option>
            <option value="CAR">Ô tô</option>
            <option value="MOTORBIKE">Xe máy</option>
            <option value="PICKUP">Bán tải</option>
          </Select>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" className="size-4" />
          Thêm dòng xe Catalogue
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="sliders"
          title="Không tìm thấy dòng xe Catalogue"
          description="Thử thay đổi bộ lọc hoặc thêm dòng xe mới."
        />
      ) : (
        <div className="space-y-4">
          <Text className="text-caption text-muted">
            Hiển thị {items.length} / {totalDocs} dòng xe Catalogue (Vehicle Models)
          </Text>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <article
                key={m.id}
                className="flex flex-col justify-between rounded-card border border-line bg-canvas p-4 transition-shadow hover:shadow-card"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {m.cover ? (
                      <Image
                        src={m.cover.url}
                        alt={m.cover.alt}
                        width={96}
                        height={64}
                        className="h-16 w-24 shrink-0 rounded-control object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-control bg-subtle text-muted">
                        <Icon name="car" className="size-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Heading as="h2" size="body" className="truncate font-semibold">
                        {m.name}
                      </Heading>
                      <Text className="text-caption text-muted">
                        {m.brand} · {catLabels[m.category] ?? m.category}
                        {m.subCategory
                          ? ` · ${subCategoryLabels[m.subCategory] ?? m.subCategory}`
                          : ''}
                      </Text>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone={m.visible ? 'brand' : 'muted'}>
                          {m.visible ? 'Công khai' : 'Đang ẩn'}
                        </Badge>
                        <Badge tone="muted">{m.fleetCount} xe thực tế</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-control bg-subtle p-2.5 text-caption">
                    <span>Thuê từ: {formatMoney(m.referenceRentPrice)}</span>
                    <span>Niêm yết: {formatMoney(m.listedPrice)}</span>
                    <span>Thông số: {m.specsCount}</span>
                    <span>Phiên bản: {m.variantsCount}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(m)}>
                    Chỉnh sửa
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteTarget(m)}
                    aria-label={`Xóa dòng xe ${m.name}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
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

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Cập nhật dòng xe ${editing.name}` : 'Thêm dòng xe Catalogue'}
        wide
      >
        <form onSubmit={saveModel} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="model-name"
              label="Tên dòng xe"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              id="model-brand"
              label="Thương hiệu"
              required
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
            <Select
              id="model-cat"
              label="Danh mục"
              value={catField}
              onChange={(e) => setCatField(e.target.value)}
            >
              <option value="CAR">Ô tô</option>
              <option value="MOTORBIKE">Xe máy</option>
              <option value="PICKUP">Bán tải</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="model-subcat"
              label="Phân loại kiểu dáng"
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
            >
              <option value="">Chưa chọn</option>
              {Object.entries(subCategoryLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              id="model-segment"
              label="Phân khúc"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
            />
            <Input
              id="model-rent-price"
              label="Giá thuê tham khảo/ngày (VNĐ)"
              type="number"
              min={0}
              value={referenceRentPrice}
              onChange={(e) => setReferenceRentPrice(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="model-listed-price"
              label="Giá niêm yết tham khảo (VNĐ)"
              type="number"
              min={0}
              value={listedPrice}
              onChange={(e) => setListedPrice(e.target.value)}
            />
            <div className="flex items-end gap-6 pb-2">
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                  className="size-4"
                />
                Hiển thị công khai
              </label>
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="size-4"
                />
                Dòng xe nổi bật
              </label>
            </div>
          </div>
          <Textarea
            id="model-desc"
            label="Giới thiệu tổng quan"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
            <div className="flex items-center gap-3">
              {coverPreview && (
                <Image
                  src={coverPreview}
                  alt={name || 'Cover'}
                  width={80}
                  height={52}
                  className="h-12 w-20 rounded-sm object-cover"
                />
              )}
              <Text className="text-caption text-muted">
                {coverPreview ? 'Ảnh đại diện hiện tại' : 'Chưa có ảnh đại diện'}
              </Text>
            </div>
            <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
              <Icon name="upload" className="size-4" />
              {uploading ? 'Đang tải...' : 'Tải ảnh đại diện'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                disabled={uploading}
                onChange={handleCoverUpload}
              />
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu dòng xe
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Xác nhận xóa dòng xe Catalogue"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <Text className="text-small">
              Xác nhận xóa dòng xe <strong>{deleteTarget.name}</strong>? Dòng xe đang có xe thực tế
              liên kết sẽ được bảo vệ khỏi việc xóa.
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
