'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adminHasPermission } from '@/access/nori'
import { useAuth } from '@/components/auth-provider'
import { api } from '@/lib/client-api'
import { formatDate, formatVnd } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type MediaPreview = {
  url: string
  alt: string
  filename?: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  mimeType?: string | null
}

type PromoOption = {
  id: string
  code: string
  name: string
  description: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  maxDiscount: number | null
  minDays: number
  appliesTo: 'ALL' | 'RENT' | 'SALE'
  validFrom: string
  validTo: string
  active: boolean
  runtimeStatusLabel?: string
  runtimeStatusTone?: 'brand' | 'warning' | 'danger' | 'muted'
}

type PostRow = {
  id: string
  title: string
  slug: string
  category: 'NEWS' | 'GUIDE' | 'PROMOTION'
  excerpt: string
  content: string
  coverId: string | null
  cover: MediaPreview | null
  promotionId: string | null
  promotion: PromoOption | null
  seoTitle: string
  seoDescription: string
  _status: 'draft' | 'published'
  publishedAt: string
  updatedAt: string
}

type LibraryMediaItem = {
  id: string
  alt: string
  filename: string | null
  width?: number | null
  height?: number | null
  filesize?: number | null
  mimeType?: string | null
  photo: MediaPreview | null
}

const catLabels: Record<string, string> = {
  NEWS: 'Tin tức NORI',
  GUIDE: 'Cẩm nang thuê & mua xe',
  PROMOTION: 'Ưu đãi & Sự kiện',
}

const MAX_BANNER_BYTES = 8 * 1024 * 1024
const ACCEPTED_BANNER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ACCEPTED_BANNER_EXT_RE = /\.(jpe?g|png|webp)$/i

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return 'Chưa rõ dung lượng'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatPromoSummary(promo: PromoOption): string {
  if (promo.discountType === 'PERCENT') {
    const cap = promo.maxDiscount ? ` (tối đa ${formatVnd(promo.maxDiscount)})` : ''
    return `Giảm ${promo.discountValue}%${cap}`
  }
  return `Giảm ${formatVnd(promo.discountValue)}`
}

export function PostsPanel() {
  const { user } = useAuth()
  const canPublish = adminHasPermission(
    user ? { ...user, collection: user.isAdmin ? 'admins' : 'users' } : null,
    'posts',
    'publish',
  )
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<PostRow[]>([])
  const [promotions, setPromotions] = useState<PromoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PostRow | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<'NEWS' | 'GUIDE' | 'PROMOTION'>('NEWS')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [coverId, setCoverId] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<MediaPreview | null>(null)
  const [promotionId, setPromotionId] = useState<string>('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')

  const [busy, setBusy] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const [bannerWarning, setBannerWarning] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; content?: string }>({})

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryItems, setLibraryItems] = useState<LibraryMediaItem[]>([])
  const [libraryError, setLibraryError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      api<{ items: PostRow[] }>('/dashboard/posts'),
      api<{ items: PromoOption[] }>('/dashboard/promotions').catch(() => ({ items: [] })),
    ])
      .then(([postsRes, promosRes]) => {
        if (!active) return
        setItems(postsRes.items)
        setPromotions(promosRes.items)
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

  useEffect(() => {
    if (!libraryOpen) return
    let active = true
    setLibraryLoading(true)
    setLibraryError('')
    api<{ items: LibraryMediaItem[] }>(
      `/dashboard/media?q=${encodeURIComponent(libraryQuery.trim())}`,
    )
      .then((res) => {
        if (active) setLibraryItems(res.items)
      })
      .catch((e) => {
        if (active) setLibraryError((e as Error).message)
      })
      .finally(() => {
        if (active) setLibraryLoading(false)
      })
    return () => {
      active = false
    }
  }, [libraryOpen, libraryQuery])

  const selectedPromotion = useMemo(
    () => promotions.find((p) => p.id === promotionId) ?? editing?.promotion ?? null,
    [promotions, promotionId, editing],
  )

  function resetBannerAlerts() {
    setBannerError('')
    setBannerWarning('')
  }

  function openCreate() {
    setEditing(null)
    setTitle('')
    setCategory('NEWS')
    setExcerpt('')
    setContent('')
    setCoverId(null)
    setCoverPreview(null)
    setPromotionId('')
    setSeoTitle('')
    setSeoDescription('')
    setFormError('')
    setFieldErrors({})
    setLibraryOpen(false)
    setLibraryQuery('')
    resetBannerAlerts()
    setOpen(true)
  }

  function openEdit(p: PostRow) {
    setEditing(p)
    setTitle(p.title)
    setCategory(p.category)
    setExcerpt(p.excerpt)
    setContent(p.content)
    setCoverId(p.coverId ?? null)
    setCoverPreview(p.cover ?? null)
    setPromotionId(p.promotionId ?? '')
    setSeoTitle(p.seoTitle)
    setSeoDescription(p.seoDescription)
    setFormError('')
    setFieldErrors({})
    setLibraryOpen(false)
    setLibraryQuery('')
    resetBannerAlerts()
    if (
      p.cover?.width &&
      (p.cover.width < 1200 || (p.cover.height && p.cover.width < p.cover.height))
    ) {
      setBannerWarning(
        'Ảnh hiện tại có độ phân giải thấp hơn 1200px hoặc chưa đúng tỷ lệ ngang 16:9. Giao diện sẽ tự động căn khung để không làm méo hình.',
      )
    }
    setOpen(true)
  }

  async function handleBannerFile(file: File) {
    resetBannerAlerts()
    setFormError('')

    const hasValidMime = file.type ? ACCEPTED_BANNER_TYPES.has(file.type.toLowerCase()) : false
    const hasValidExt = ACCEPTED_BANNER_EXT_RE.test(file.name || '')
    if (!hasValidMime && !hasValidExt) {
      setBannerError('Định dạng tệp không hợp lệ. Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WEBP.')
      return
    }
    if (file.type && !ACCEPTED_BANNER_TYPES.has(file.type.toLowerCase())) {
      setBannerError('Định dạng tệp không hợp lệ. Chỉ chấp nhận ảnh JPG, JPEG, PNG hoặc WEBP.')
      return
    }
    if (file.size <= 0) {
      setBannerError('Tệp ảnh rỗng (0 byte). Vui lòng chọn tệp khác.')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      setBannerError('Dung lượng ảnh vượt quá giới hạn 8 MB. Vui lòng chọn ảnh nhỏ hơn.')
      return
    }

    setUploadingBanner(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('alt', title.trim() ? `Banner bài viết: ${title.trim()}` : `Banner bài viết NORI`)
      fd.append('mediaCategory', 'ILLUSTRATION')
      fd.append('purpose', 'post-banner')

      const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
      const payload = await res.json()
      if (!res.ok || !payload.success) {
        throw new Error(payload.error?.message || 'Chưa thể tải ảnh banner lên.')
      }

      const uploaded = payload.data as {
        id: string
        alt: string
        url: string | null
        filename: string | null
        width: number | null
        height: number | null
        filesize: number | null
        mimeType: string | null
        lowResolutionWarning?: boolean
        aspectWarning?: boolean
        photo: MediaPreview | null
      }
      const url = uploaded.photo?.url || uploaded.url
      if (!url) {
        throw new Error('Không nhận được đường dẫn ảnh sau khi tải lên.')
      }

      setCoverId(uploaded.id)
      setCoverPreview({
        url,
        alt: uploaded.alt || file.name,
        filename: uploaded.filename || file.name,
        filesize: uploaded.filesize ?? file.size,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType ?? file.type,
      })
      setLibraryOpen(false)

      if (uploaded.lowResolutionWarning || uploaded.aspectWarning) {
        setBannerWarning(
          'Ảnh chưa đạt khuyến nghị ngang 16:9 từ 1200px trở lên. Hệ thống sẽ tự động căn khung khi hiển thị để tránh méo hình.',
        )
      }
      toast('Đã tải ảnh banner lên thư viện Media.')
    } catch (err) {
      setBannerError((err as Error).message)
    } finally {
      setUploadingBanner(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function selectFromLibrary(item: LibraryMediaItem) {
    if (!item.photo?.url) return
    resetBannerAlerts()
    setCoverId(item.id)
    setCoverPreview({
      url: item.photo.url,
      alt: item.alt || item.photo.alt || 'Banner bài viết NORI',
      filename: item.filename ?? item.photo.filename ?? null,
      filesize: item.filesize ?? item.photo.filesize ?? null,
      width: item.width ?? item.photo.width ?? null,
      height: item.height ?? item.photo.height ?? null,
      mimeType: item.mimeType ?? item.photo.mimeType ?? null,
    })
    const w = item.width ?? item.photo.width
    const h = item.height ?? item.photo.height
    if (w && (w < 1200 || (h && w < h))) {
      setBannerWarning(
        'Ảnh được chọn có độ phân giải thấp hơn 1200px hoặc chưa đúng tỷ lệ ngang 16:9. Giao diện sẽ tự động căn khung để không làm méo hình.',
      )
    }
    setLibraryOpen(false)
    toast('Đã chọn ảnh banner từ thư viện Media.')
  }

  function removeBanner() {
    setCoverId(null)
    setCoverPreview(null)
    resetBannerAlerts()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function submitPost(targetStatus: 'draft' | 'published') {
    const nextFieldErrors: { title?: string; content?: string } = {}
    if (!title.trim()) {
      nextFieldErrors.title = 'Vui lòng nhập tiêu đề bài viết.'
    }
    if (targetStatus === 'published' && !content.trim()) {
      nextFieldErrors.content = 'Vui lòng nhập nội dung chi tiết trước khi xuất bản.'
    }
    if (nextFieldErrors.title || nextFieldErrors.content) {
      setFieldErrors(nextFieldErrors)
      setFormError('Vui lòng hoàn thiện các trường bắt buộc trước khi lưu.')
      return
    }

    setBusy(true)
    setFormError('')
    setFieldErrors({})
    try {
      await api('/dashboard/posts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          title,
          category,
          excerpt,
          content,
          coverId,
          promotionId: category === 'PROMOTION' ? promotionId || null : null,
          seoTitle,
          seoDescription,
          _status: targetStatus,
        }),
      })
      toast(targetStatus === 'published' ? 'Đã xuất bản bài viết.' : 'Đã lưu bản nháp bài viết.')
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deletePost(id: string) {
    try {
      await api(`/dashboard/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      toast('Đã xóa bài viết.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <Text className="text-small text-muted">
          Quản lý tin tức, cẩm nang sử dụng xe và ưu đãi với ảnh banner &amp; cơ chế Bản nháp / Xuất
          bản.
        </Text>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" className="size-4" />
          Viết bài mới
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="file"
          title="Chưa có bài viết CMS nào"
          description="Tạo tin tức hoặc cẩm nang thuê/mua xe mới để xuất bản lên website NORI."
        >
          <Button onClick={openCreate}>Viết bài đầu tiên</Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <article
              key={p.id}
              data-testid={`admin-post-row-${p.id}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas p-4 sm:p-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-control border border-line bg-subtle sm:w-36">
                  <Image
                    src={p.cover?.url || '/nori-post-fallback.svg'}
                    alt={p.cover?.alt || p.title}
                    fill
                    sizes="144px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Heading as="h2" size="body" className="font-semibold">
                      {p.title}
                    </Heading>
                    <Badge tone={p._status === 'published' ? 'brand' : 'warning'}>
                      {p._status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </Badge>
                    <Badge tone="muted">{catLabels[p.category] ?? p.category}</Badge>
                    {p.category === 'PROMOTION' && p.promotion && (
                      <Badge tone="brand">Mã: {p.promotion.code}</Badge>
                    )}
                    {!p.cover && <Badge tone="muted">Dùng fallback NORI</Badge>}
                  </div>
                  <Text className="text-caption text-muted">
                    Cập nhật: {formatDate(p.updatedAt)}
                    {p.slug ? ` · /posts/${p.slug}` : ''}
                  </Text>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p._status === 'published' && p.slug && (
                  <NoriLink
                    href={`/posts/${p.slug}`}
                    target="_blank"
                    className="inline-flex min-h-control-sm items-center gap-1.5 rounded-control border border-line bg-canvas px-3 py-1.5 text-caption font-semibold text-ink hover:border-brand hover:text-brand"
                  >
                    Xem bài
                    <Icon name="external" className="size-3.5" />
                  </NoriLink>
                )}
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                  Chỉnh sửa
                </Button>
                <Button size="sm" variant="danger" onClick={() => void deletePost(p.id)}>
                  Xóa
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Chỉnh sửa bài viết CMS' : 'Soạn bài viết mới'}
        wide
      >
        <div className="space-y-5">
          {formError && <Notice tone="error">{formError}</Notice>}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                id="post-title"
                label="Tiêu đề bài viết"
                required
                error={fieldErrors.title}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }))
                }}
              />
            </div>
            <Select
              id="post-cat"
              label="Chuyên mục"
              value={category}
              onChange={(e) => {
                const nextCat = e.target.value as 'NEWS' | 'GUIDE' | 'PROMOTION'
                setCategory(nextCat)
                if (nextCat !== 'PROMOTION') setPromotionId('')
              }}
            >
              {Object.entries(catLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>

          {category === 'PROMOTION' && (
            <section className="space-y-3 rounded-card border border-line bg-subtle/50 p-4">
              <Select
                id="post-promotion"
                label="Khuyến mãi liên kết (tùy chọn)"
                hint="Lấy trực tiếp mã, mức giảm, điều kiện và thời hạn từ module Khuyến mãi."
                value={promotionId}
                onChange={(e) => setPromotionId(e.target.value)}
              >
                <option value="">Không liên kết mã khuyến mãi</option>
                {promotions.map((promo) => (
                  <option key={promo.id} value={promo.id}>
                    {promo.code} — {promo.name} (
                    {promo.runtimeStatusLabel ?? (promo.active ? 'Đang bật' : 'Tạm ngưng')})
                  </option>
                ))}
              </Select>
              {selectedPromotion && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-canvas p-3 text-small">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{selectedPromotion.code}</Badge>
                      <Text as="span" className="font-semibold text-ink">
                        {selectedPromotion.name}
                      </Text>
                      {selectedPromotion.runtimeStatusLabel && (
                        <Badge tone={selectedPromotion.runtimeStatusTone ?? 'muted'}>
                          {selectedPromotion.runtimeStatusLabel}
                        </Badge>
                      )}
                    </div>
                    <Text className="text-caption text-muted">
                      {formatPromoSummary(selectedPromotion)} · Tối thiểu{' '}
                      {selectedPromotion.minDays} ngày
                      {selectedPromotion.validFrom || selectedPromotion.validTo
                        ? ` · Hiệu lực: ${selectedPromotion.validFrom ? formatDate(selectedPromotion.validFrom) : 'Từ nay'} – ${selectedPromotion.validTo ? formatDate(selectedPromotion.validTo) : 'Không giới hạn'}`
                        : ''}
                    </Text>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Banner Upload & Media Picker Section */}
          <section
            data-testid="post-banner-section"
            className="space-y-3 rounded-card border border-line bg-subtle/40 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Heading as="h3" size="body" className="font-semibold text-ink">
                  Ảnh banner bài viết
                </Heading>
                <Text className="mt-0.5 text-caption text-muted">
                  Khuyến nghị ảnh ngang tỷ lệ 16:9, độ phân giải từ 1200px trở lên. Hỗ trợ JPG,
                  JPEG, PNG, WEBP (tối đa 8 MB).
                </Text>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={uploadingBanner}
                onClick={() => setLibraryOpen((v) => !v)}
              >
                <Icon name="image" className="size-4" />
                {libraryOpen ? 'Đóng thư viện Media' : 'Chọn từ thư viện Media'}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              id="post-banner-input"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploadingBanner}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleBannerFile(file)
              }}
            />

            {bannerError && <Notice tone="error">{bannerError}</Notice>}
            {bannerWarning && <Notice tone="info">{bannerWarning}</Notice>}

            {uploadingBanner && (
              <div
                role="status"
                aria-busy="true"
                className="flex items-center gap-3 rounded-control border border-brand/30 bg-brand-soft px-4 py-3 text-small font-medium text-brand"
              >
                <Icon name="loader" className="size-4 animate-spin" />
                <span>Đang kiểm tra và tải ảnh banner lên hệ thống...</span>
              </div>
            )}

            {coverPreview ? (
              <div
                data-testid="post-banner-preview"
                className="overflow-hidden rounded-card border border-line bg-canvas"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-subtle">
                  <Image
                    src={coverPreview.url}
                    alt={coverPreview.alt || title || 'Preview banner bài viết'}
                    fill
                    sizes="(max-width: 767px) 100vw, 800px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3.5">
                  <div className="min-w-0 space-y-0.5">
                    <Text className="truncate text-small font-semibold text-ink">
                      {coverPreview.filename || coverPreview.alt || 'banner-bai-viet'}
                    </Text>
                    <Text className="text-caption text-muted">
                      {formatFileSize(coverPreview.filesize)}
                      {coverPreview.width && coverPreview.height
                        ? ` · ${coverPreview.width} × ${coverPreview.height} px`
                        : ''}
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={uploadingBanner}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="upload" className="size-4" />
                      Thay ảnh
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={uploadingBanner}
                      onClick={removeBanner}
                    >
                      <Icon name="trash" className="size-4" />
                      Xóa ảnh
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!uploadingBanner) setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (uploadingBanner) return
                  const file = e.dataTransfer.files?.[0]
                  if (file) void handleBannerFile(file)
                }}
                className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-canvas hover:border-brand/50'
                }`}
              >
                <div className="flex size-12 items-center justify-center rounded-pill bg-brand-soft text-brand">
                  <Icon name="upload" className="size-5" />
                </div>
                <div className="space-y-1">
                  <Text className="text-small font-semibold text-ink">
                    Kéo thả ảnh banner vào đây hoặc chọn từ máy tính
                  </Text>
                  <Text className="text-caption text-muted">
                    Định dạng JPG, JPEG, PNG, WEBP · Tỷ lệ ngang 16:9 (1920 × 1080 hoặc tương đương)
                  </Text>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={uploadingBanner}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="upload" className="size-4" />
                    Chọn ảnh
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={uploadingBanner}
                    onClick={() => setLibraryOpen(true)}
                  >
                    <Icon name="image" className="size-4" />
                    Thư viện Media
                  </Button>
                </div>
              </div>
            )}

            {libraryOpen && (
              <div
                data-testid="post-media-library"
                className="space-y-3 rounded-card border border-line bg-canvas p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text className="text-small font-semibold text-ink">
                    Chọn ảnh từ Thư viện Media NORI
                  </Text>
                  <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(false)}>
                    Đóng
                  </Button>
                </div>
                <Input
                  id="post-media-search"
                  label="Tìm ảnh trong thư viện"
                  placeholder="Nhập tên tệp hoặc mô tả ảnh..."
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                />
                {libraryError && <Notice tone="error">{libraryError}</Notice>}
                {libraryLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="aspect-video w-full" />
                    ))}
                  </div>
                ) : libraryItems.length === 0 ? (
                  <Text className="py-4 text-center text-small text-muted">
                    Không tìm thấy hình ảnh phù hợp trong thư viện.
                  </Text>
                ) : (
                  <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                    {libraryItems
                      .filter((item) => Boolean(item.photo?.url))
                      .slice(0, 24)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectFromLibrary(item)}
                          className={`group overflow-hidden rounded-control border text-left transition-colors ${
                            coverId === item.id
                              ? 'border-brand ring-2 ring-focus/30'
                              : 'border-line hover:border-brand'
                          }`}
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-subtle">
                            <Image
                              src={item.photo!.url}
                              alt={item.alt || item.filename || 'Media NORI'}
                              fill
                              sizes="200px"
                              className="object-cover transition-transform group-hover:scale-105"
                            />
                          </div>
                          <div className="p-2">
                            <Text className="truncate text-caption font-medium text-ink">
                              {item.filename || item.alt}
                            </Text>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <Textarea
            id="post-excerpt"
            label="Tóm tắt ngắn"
            rows={2}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
          <Textarea
            id="post-content"
            label="Nội dung chi tiết"
            rows={6}
            required
            error={fieldErrors.content}
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              if (fieldErrors.content) setFieldErrors((prev) => ({ ...prev, content: undefined }))
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="post-seo-title"
              label="SEO Meta Title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
            />
            <Input
              id="post-seo-desc"
              label="SEO Meta Description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              disabled={busy || uploadingBanner}
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="secondary"
              loading={busy}
              disabled={uploadingBanner}
              onClick={() => void submitPost('draft')}
            >
              Lưu bản nháp
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={uploadingBanner || !canPublish}
              title={
                canPublish
                  ? undefined
                  : 'Tài khoản chưa được cấp quyền Xuất bản bài viết; vui lòng Lưu bản nháp.'
              }
              onClick={() => void submitPost('published')}
            >
              Xuất bản
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
