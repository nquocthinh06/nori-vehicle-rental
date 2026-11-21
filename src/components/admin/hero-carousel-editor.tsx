'use client'

import Image from 'next/image'
import { useState, type MouseEvent } from 'react'
import {
  HeroSlidePreviewCanvas,
  normalizeCmsSlides,
  type HeroPreviewViewport,
} from '@/components/home/hero'
import { Badge, Button, Input, Notice, Select, Text, Textarea } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'

export type AdminMediaSummary = {
  url: string
  alt: string
  width?: number
  height?: number
  filesize?: number | null
  mimeType?: string | null
  focalX?: number | null
  focalY?: number | null
}

export type HeroSlideForm = {
  id?: string
  titleFirst: string
  titleSecond: string
  eyebrow: string
  categoryBadge: string
  description: string
  ctaText: string
  ctaHref: string
  secondaryText: string
  secondaryHref: string
  desktopImageId: string | null
  desktopImage: AdminMediaSummary | null
  mobileImageId: string | null
  mobileImage: AdminMediaSummary | null
  focalX: number
  focalY: number
  mobileFocalX: number
  mobileFocalY: number
  relatedCategory: string
  relatedModelId: string | null
  credit: string
  sourceUrl: string
  durationSeconds: number | null
  order: number
  active: boolean
}

export type SlideSaveState = 'idle' | 'saving' | 'saved' | 'error'

type ModelOption = { id: string; name: string; slug: string; category: string }

const FOCAL_PRESETS = [
  { label: 'Giữa', x: 50, y: 50 },
  { label: 'Trái', x: 25, y: 50 },
  { label: 'Phải', x: 75, y: 50 },
  { label: 'Trên', x: 50, y: 25 },
  { label: 'Dưới', x: 50, y: 75 },
] as const

export const UNSAVED_WARNING_TEXT =
  'Bạn có thay đổi chưa được lưu. Bạn có chắc muốn rời khỏi trang?'

export function serializeSlide(slide: HeroSlideForm): string {
  return JSON.stringify({
    titleFirst: slide.titleFirst,
    titleSecond: slide.titleSecond,
    eyebrow: slide.eyebrow,
    categoryBadge: slide.categoryBadge,
    description: slide.description,
    ctaText: slide.ctaText,
    ctaHref: slide.ctaHref,
    secondaryText: slide.secondaryText,
    secondaryHref: slide.secondaryHref,
    desktopImageId: slide.desktopImageId,
    mobileImageId: slide.mobileImageId,
    focalX: Math.round(slide.focalX ?? 50),
    focalY: Math.round(slide.focalY ?? 50),
    mobileFocalX: Math.round(slide.mobileFocalX ?? 50),
    mobileFocalY: Math.round(slide.mobileFocalY ?? 50),
    relatedCategory: slide.relatedCategory,
    relatedModelId: slide.relatedModelId,
    credit: slide.credit,
    sourceUrl: slide.sourceUrl,
    durationSeconds: slide.durationSeconds,
    order: slide.order,
    active: slide.active,
  })
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function toNormalizedPreviewSlide(slide: HeroSlideForm, idx: number) {
  const [normalized] = normalizeCmsSlides([
    {
      id: slide.id || `preview-${idx}`,
      titleFirst: slide.titleFirst || 'Tiêu đề Hero',
      titleSecond: slide.titleSecond || null,
      eyebrow: slide.eyebrow || null,
      categoryBadge: slide.categoryBadge || null,
      description: slide.description || null,
      ctaText: slide.ctaText || 'Khám phá ngay',
      ctaHref: slide.ctaHref || '/vehicles',
      secondaryText: slide.secondaryText || null,
      secondaryHref: slide.secondaryHref || null,
      desktopImage: slide.desktopImage
        ? {
            url: slide.desktopImage.url,
            alt: slide.desktopImage.alt,
            width: slide.desktopImage.width ?? 1600,
            height: slide.desktopImage.height ?? 900,
            focalX: slide.focalX,
            focalY: slide.focalY,
          }
        : null,
      mobileImage: slide.mobileImage
        ? {
            url: slide.mobileImage.url,
            alt: slide.mobileImage.alt,
            width: slide.mobileImage.width ?? 900,
            height: slide.mobileImage.height ?? 1125,
            focalX: slide.mobileFocalX,
            focalY: slide.mobileFocalY,
          }
        : null,
      focalX: slide.focalX,
      focalY: slide.focalY,
      mobileFocalX: slide.mobileFocalX,
      mobileFocalY: slide.mobileFocalY,
      relatedCategory: (slide.relatedCategory as 'CAR' | 'MOTORBIKE' | 'PICKUP' | null) || null,
      credit: slide.credit || null,
      sourceUrl: slide.sourceUrl || null,
      durationSeconds: slide.durationSeconds ?? null,
      order: idx,
    },
  ])
  return normalized
}

export function HeroCarouselEditor({
  slides,
  savedSlides,
  autoplaySeconds,
  availableModels,
  uploading,
  slideSaveStates,
  slideSaveErrors,
  onAutoplayChange,
  onAddSlide,
  onMoveSlide,
  onRemoveSlide,
  onUpdateSlide,
  onUploadSlideImage,
  onSaveSlide,
  onRevertSlide,
}: {
  slides: HeroSlideForm[]
  savedSlides: HeroSlideForm[]
  autoplaySeconds: number
  availableModels: ModelOption[]
  uploading: boolean
  slideSaveStates: Record<string, SlideSaveState>
  slideSaveErrors: Record<string, string>
  onAutoplayChange: (seconds: number) => void
  onAddSlide: () => void
  onMoveSlide: (idx: number, dir: -1 | 1) => void
  onRemoveSlide: (idx: number) => void
  onUpdateSlide: (idx: number, patch: Partial<HeroSlideForm>) => void
  onUploadSlideImage: (
    e: React.ChangeEvent<HTMLInputElement>,
    idx: number,
    slot: 'desktop' | 'mobile',
  ) => void
  onSaveSlide: (idx: number) => Promise<void>
  onRevertSlide: (idx: number) => void
}) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [previewViewport, setPreviewViewport] = useState<HeroPreviewViewport>('desktop')

  const [focalModal, setFocalModal] = useState<{
    idx: number
    x: number
    y: number
    initialX: number
    initialY: number
  } | null>(null)
  const [confirmCloseFocalModal, setConfirmCloseFocalModal] = useState(false)

  function isSlideDirty(slide: HeroSlideForm, idx: number): boolean {
    const matched =
      (slide.id ? savedSlides.find((s) => s.id === slide.id) : undefined) ?? savedSlides[idx]
    if (!matched) return true
    return serializeSlide(slide) !== serializeSlide(matched)
  }

  function canRevertSlide(slide: HeroSlideForm, idx: number): boolean {
    const matched =
      (slide.id ? savedSlides.find((s) => s.id === slide.id) : undefined) ?? savedSlides[idx]
    return Boolean(matched) || isSlideDirty(slide, idx)
  }

  function handleFocalImageClick(
    e: MouseEvent<HTMLDivElement>,
    onPick: (x: number, y: number) => void,
  ) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = Math.min(100, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
    const y = Math.min(100, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
    onPick(x, y)
  }

  function requestCloseFocalModal() {
    if (!focalModal) return
    if (focalModal.x !== focalModal.initialX || focalModal.y !== focalModal.initialY) {
      setConfirmCloseFocalModal(true)
      return
    }
    setFocalModal(null)
  }

  const previewSlide = previewIdx !== null ? slides[previewIdx] : null
  const previewDirty =
    previewIdx !== null && previewSlide ? isSlideDirty(previewSlide, previewIdx) : false

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-subtitle font-semibold text-ink">
              Quản lý Slide Hero Carousel Trang chủ
            </h2>
            <Text className="text-caption text-muted">
              Ảnh Desktop là bắt buộc (khuyến nghị 1920×1080 hoặc tỷ lệ 16:9). Ảnh Mobile là tùy
              chọn — nếu để trống, Mobile và Tablet tự động crop từ ảnh Desktop theo điểm trọng tâm.
            </Text>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              id="hero-autoplay-sec"
              label="Tự động chuyển sau (giây)"
              type="number"
              min={3}
              max={20}
              value={autoplaySeconds}
              onChange={(e) =>
                onAutoplayChange(Math.min(20, Math.max(3, Number(e.target.value) || 6)))
              }
              wrapperClassName="w-full sm:w-48"
            />
            <Button size="sm" onClick={onAddSlide} disabled={slides.length >= 12}>
              <Icon name="plus" className="size-4" />
              Thêm Slide mới
            </Button>
          </div>
        </div>

        {slides.length === 0 ? (
          <Notice>
            Chưa có slide tùy chỉnh trong Database (website đang hiển thị 5 slide phương tiện chuẩn
            mặc định). Nhấn <strong>Thêm Slide mới</strong> để tùy biến hoàn toàn từ Admin.
          </Notice>
        ) : (
          <div className="space-y-5">
            {slides.map((slide, idx) => {
              const key = slide.id || `idx-${idx}`
              const dirty = isSlideDirty(slide, idx)
              const saveState: SlideSaveState = slideSaveStates[key] || 'idle'
              const saveErr = slideSaveErrors[key] || ''
              const desktopLowRes = Boolean(
                slide.desktopImage?.width &&
                slide.desktopImage?.height &&
                (slide.desktopImage.width < 1280 || slide.desktopImage.height < 720),
              )
              const missingDesktop = slide.active && !slide.desktopImageId

              return (
                <article
                  key={key}
                  data-testid={`hero-slide-card-${idx}`}
                  className="space-y-4 rounded-card border border-line bg-subtle/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={slide.active ? 'brand' : 'muted'}>
                        Slide #{idx + 1} · {slide.active ? 'Đang hiển thị' : 'Đang ẩn'}
                      </Badge>
                      {dirty ? (
                        <Badge tone="warning">● Có thay đổi chưa lưu</Badge>
                      ) : (
                        <Badge tone="brand">✓ Đã lưu</Badge>
                      )}
                      <Text className="font-semibold text-ink">
                        {slide.categoryBadge || slide.titleFirst || 'Slide mới'}
                      </Text>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="mr-2 inline-flex items-center gap-1.5 text-caption font-medium">
                        <input
                          type="checkbox"
                          checked={slide.active}
                          onChange={(e) => onUpdateSlide(idx, { active: e.target.checked })}
                          className="size-4"
                        />
                        Bật hiển thị
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === 0}
                        onClick={() => onMoveSlide(idx, -1)}
                      >
                        Lên
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={idx === slides.length - 1}
                        onClick={() => onMoveSlide(idx, 1)}
                      >
                        Xuống
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPreviewViewport('desktop')
                          setPreviewIdx(idx)
                        }}
                      >
                        Xem trước
                      </Button>
                      {dirty && canRevertSlide(slide, idx) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saveState === 'saving'}
                          onClick={() => onRevertSlide(idx)}
                        >
                          Hủy thay đổi
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={saveState === 'error' ? 'danger' : 'primary'}
                        loading={saveState === 'saving'}
                        disabled={saveState === 'saving' || (!dirty && saveState !== 'error')}
                        onClick={() => void onSaveSlide(idx)}
                      >
                        {saveState === 'saving'
                          ? 'Đang lưu...'
                          : saveState === 'error'
                            ? 'Không thể lưu – Thử lại'
                            : saveState === 'saved' && !dirty
                              ? '✓ Đã lưu'
                              : 'Lưu thay đổi'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => onRemoveSlide(idx)}>
                        Xóa
                      </Button>
                    </div>
                  </div>

                  {saveErr && <Notice tone="error">{saveErr}</Notice>}
                  {missingDesktop && (
                    <Notice tone="error">
                      Ảnh nền Desktop là bắt buộc khi Slide đang bật hiển thị. Vui lòng tải ảnh
                      Desktop trước khi lưu hoặc xuất bản.
                    </Notice>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      id={`slide-first-${idx}`}
                      label="Tiêu đề dòng 1 *"
                      value={slide.titleFirst}
                      onChange={(e) => onUpdateSlide(idx, { titleFirst: e.target.value })}
                    />
                    <Input
                      id={`slide-second-${idx}`}
                      label="Tiêu đề dòng 2 (nhấn mạnh)"
                      value={slide.titleSecond}
                      onChange={(e) => onUpdateSlide(idx, { titleSecond: e.target.value })}
                    />
                    <Input
                      id={`slide-badge-${idx}`}
                      label="Nhãn danh mục"
                      value={slide.categoryBadge}
                      onChange={(e) => onUpdateSlide(idx, { categoryBadge: e.target.value })}
                    />
                    <Input
                      id={`slide-eyebrow-${idx}`}
                      label="Eyebrow phụ đề"
                      value={slide.eyebrow}
                      onChange={(e) => onUpdateSlide(idx, { eyebrow: e.target.value })}
                    />
                  </div>

                  <Textarea
                    id={`slide-desc-${idx}`}
                    label="Mô tả ngắn"
                    rows={2}
                    value={slide.description}
                    onChange={(e) => onUpdateSlide(idx, { description: e.target.value })}
                  />

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      id={`slide-cta-text-${idx}`}
                      label="Nhãn CTA chính *"
                      value={slide.ctaText}
                      onChange={(e) => onUpdateSlide(idx, { ctaText: e.target.value })}
                    />
                    <Input
                      id={`slide-cta-href-${idx}`}
                      label="Đường dẫn CTA chính *"
                      value={slide.ctaHref}
                      onChange={(e) => onUpdateSlide(idx, { ctaHref: e.target.value })}
                    />
                    <Select
                      id={`slide-rel-cat-${idx}`}
                      label="Danh mục liên quan"
                      value={slide.relatedCategory}
                      onChange={(e) => {
                        const cat = e.target.value
                        onUpdateSlide(idx, {
                          relatedCategory: cat,
                          ...(cat && slide.ctaHref === '/vehicles'
                            ? { ctaHref: `/vehicles?type=${cat}` }
                            : {}),
                        })
                      }}
                    >
                      <option value="">Tất cả phương tiện</option>
                      <option value="CAR">Ô tô</option>
                      <option value="MOTORBIKE">Xe máy</option>
                      <option value="PICKUP">Bán tải</option>
                    </Select>
                    <Select
                      id={`slide-rel-model-${idx}`}
                      label="Hoặc dòng xe liên quan"
                      value={slide.relatedModelId ?? ''}
                      onChange={(e) => {
                        const mId = e.target.value || null
                        const matched = availableModels.find((m) => m.id === mId)
                        onUpdateSlide(idx, {
                          relatedModelId: mId,
                          ...(matched ? { ctaHref: `/vehicles/${matched.slug}` } : {}),
                        })
                      }}
                    >
                      <option value="">Không chọn cụ thể</option>
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input
                      id={`slide-dur-${idx}`}
                      label="Thời gian hiển thị riêng (giây)"
                      type="number"
                      min={3}
                      max={30}
                      placeholder={`Mặc định (${autoplaySeconds}s)`}
                      value={slide.durationSeconds ?? ''}
                      onChange={(e) =>
                        onUpdateSlide(idx, {
                          durationSeconds: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <Input
                      id={`slide-credit-${idx}`}
                      label="Nguồn ảnh / Tác giả"
                      value={slide.credit}
                      onChange={(e) => onUpdateSlide(idx, { credit: e.target.value })}
                    />
                    <Input
                      id={`slide-source-url-${idx}`}
                      label="URL nguồn tham chiếu"
                      value={slide.sourceUrl}
                      onChange={(e) => onUpdateSlide(idx, { sourceUrl: e.target.value })}
                    />
                  </div>

                  {/* Desktop & Mobile Image Uploads + Focal Point */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3 rounded-control border border-line bg-canvas p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {slide.desktopImage ? (
                            <Image
                              src={slide.desktopImage.url}
                              alt={slide.desktopImage.alt}
                              width={112}
                              height={63}
                              style={{ objectPosition: `${slide.focalX}% ${slide.focalY}%` }}
                              className="h-16 w-28 rounded-sm object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-28 items-center justify-center rounded-sm border border-dashed border-danger/40 bg-danger-soft/40 text-micro font-medium text-danger">
                              Bắt buộc
                            </div>
                          )}
                          <div>
                            <Text className="text-caption font-semibold">
                              Ảnh Desktop * (Bắt buộc)
                            </Text>
                            <Text className="text-micro text-muted">
                              Khuyến nghị 1920×1080 (16:9) · AVIF/WebP/JPG/PNG
                            </Text>
                            {slide.desktopImage?.width && slide.desktopImage?.height && (
                              <Text className="text-micro text-muted">
                                Thực tế: {slide.desktopImage.width}×{slide.desktopImage.height}px
                                {slide.desktopImage.filesize
                                  ? ` · ${formatFileSize(slide.desktopImage.filesize)}`
                                  : ''}
                              </Text>
                            )}
                          </div>
                        </div>

                        <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-1.5 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                          <Icon name="upload" className="size-3.5" />
                          {uploading ? 'Đang tải...' : 'Tải ảnh Desktop'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => void onUploadSlideImage(e, idx, 'desktop')}
                          />
                        </label>
                      </div>

                      {desktopLowRes && (
                        <Notice tone="info">
                          Ảnh có độ phân giải thấp, có thể bị giảm chất lượng trên màn hình lớn.
                        </Notice>
                      )}

                      {slide.desktopImage && (
                        <div className="space-y-2 border-t border-line pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Text className="text-micro font-semibold text-ink">
                              Điểm trọng tâm (Focal Point): {slide.focalX}% {slide.focalY}%
                            </Text>
                            <div className="flex flex-wrap gap-1">
                              {FOCAL_PRESETS.map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() =>
                                    onUpdateSlide(idx, { focalX: preset.x, focalY: preset.y })
                                  }
                                  className={`rounded-control border px-2 py-1 text-micro font-medium ${
                                    slide.focalX === preset.x && slide.focalY === preset.y
                                      ? 'border-brand bg-brand-soft text-brand'
                                      : 'border-line bg-subtle text-muted hover:border-brand/50'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() =>
                                  setFocalModal({
                                    idx,
                                    x: slide.focalX,
                                    y: slide.focalY,
                                    initialX: slide.focalX,
                                    initialY: slide.focalY,
                                  })
                                }
                                className="rounded-control border border-line bg-canvas px-2 py-1 text-micro font-semibold text-brand hover:border-brand"
                              >
                                Chọn trên ảnh lớn
                              </button>
                            </div>
                          </div>

                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`Chọn điểm trọng tâm trên ảnh Desktop Slide #${idx + 1}. Hiện tại ${slide.focalX}% ${slide.focalY}%`}
                            onClick={(e) =>
                              handleFocalImageClick(e, (x, y) =>
                                onUpdateSlide(idx, { focalX: x, focalY: y }),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft') {
                                e.preventDefault()
                                onUpdateSlide(idx, { focalX: Math.max(0, slide.focalX - 5) })
                              } else if (e.key === 'ArrowRight') {
                                e.preventDefault()
                                onUpdateSlide(idx, { focalX: Math.min(100, slide.focalX + 5) })
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                onUpdateSlide(idx, { focalY: Math.max(0, slide.focalY - 5) })
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                onUpdateSlide(idx, { focalY: Math.min(100, slide.focalY + 5) })
                              }
                            }}
                            className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-control border border-line bg-night"
                          >
                            <Image
                              src={slide.desktopImage.url}
                              alt={`Chọn điểm trọng tâm ${slide.desktopImage.alt}`}
                              fill
                              sizes="(max-width: 1024px) 100vw, 480px"
                              className="object-cover"
                            />
                            <span
                              aria-hidden="true"
                              style={{ left: `${slide.focalX}%`, top: `${slide.focalY}%` }}
                              className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-inverse bg-brand shadow-md"
                            />
                          </div>
                          <Text className="text-micro text-muted">
                            Click trực tiếp vào vị trí chiếc xe để giữ chủ thể trong khung hình khi
                            tự động crop sang Tablet/Mobile.
                          </Text>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-control border border-line bg-canvas p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {slide.mobileImage ? (
                            <Image
                              src={slide.mobileImage.url}
                              alt={slide.mobileImage.alt}
                              width={64}
                              height={80}
                              style={{
                                objectPosition: `${slide.mobileFocalX}% ${slide.mobileFocalY}%`,
                              }}
                              className="h-16 w-14 rounded-sm object-cover"
                            />
                          ) : slide.desktopImage ? (
                            <div className="relative h-16 w-14 overflow-hidden rounded-sm border border-dashed border-brand/40">
                              <Image
                                src={slide.desktopImage.url}
                                alt="Fallback từ ảnh Desktop"
                                fill
                                sizes="64px"
                                style={{ objectPosition: `${slide.focalX}% ${slide.focalY}%` }}
                                className="object-cover opacity-85"
                              />
                            </div>
                          ) : (
                            <div className="flex h-16 w-14 items-center justify-center rounded-sm bg-subtle text-micro text-muted">
                              Tự động
                            </div>
                          )}
                          <div>
                            <Text className="text-caption font-semibold">
                              Ảnh Mobile (tùy chọn)
                            </Text>
                            <Text className="text-micro text-muted">
                              Nếu để trống, tự động dùng ảnh Desktop với crop 4:5 theo điểm trọng
                              tâm.
                            </Text>
                            {slide.mobileImage?.width && slide.mobileImage?.height && (
                              <Text className="text-micro text-muted">
                                Thực tế: {slide.mobileImage.width}×{slide.mobileImage.height}px
                                {slide.mobileImage.filesize
                                  ? ` · ${formatFileSize(slide.mobileImage.filesize)}`
                                  : ''}
                              </Text>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-1.5 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                            <Icon name="upload" className="size-3.5" />
                            Tải ảnh Mobile
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              className="sr-only"
                              disabled={uploading}
                              onChange={(e) => void onUploadSlideImage(e, idx, 'mobile')}
                            />
                          </label>
                          {slide.mobileImageId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                onUpdateSlide(idx, {
                                  mobileImageId: null,
                                  mobileImage: null,
                                  mobileFocalX: slide.focalX,
                                  mobileFocalY: slide.focalY,
                                })
                              }
                            >
                              Gỡ ảnh Mobile
                            </Button>
                          )}
                        </div>
                      </div>

                      {slide.desktopImage && !slide.mobileImage && (
                        <div className="rounded-control border border-line bg-subtle/50 p-3">
                          <Text className="mb-2 text-micro font-semibold text-ink">
                            Mô phỏng crop Mobile (4:5) tự động từ ảnh Desktop
                          </Text>
                          <div className="relative mx-auto aspect-[4/5] w-36 overflow-hidden rounded-control border border-line bg-night">
                            <Image
                              src={slide.desktopImage.url}
                              alt={`Crop Mobile ${slide.desktopImage.alt}`}
                              fill
                              sizes="160px"
                              style={{ objectPosition: `${slide.focalX}% ${slide.focalY}%` }}
                              className="object-cover"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Responsive Preview Modal using identical frontend renderer */}
      <Dialog
        open={previewSlide !== null}
        onClose={() => setPreviewIdx(null)}
        title="Xem trước hiển thị Slide Hero"
        wide
      >
        {previewSlide && previewIdx !== null && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Chọn thiết bị xem trước" className="flex gap-2">
                {(
                  [
                    ['desktop', 'Desktop (16:9)'],
                    ['tablet', 'Tablet (16:10)'],
                    ['mobile', 'Mobile (4:5)'],
                  ] as const
                ).map(([mode, label]) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={previewViewport === mode ? 'primary' : 'secondary'}
                    aria-pressed={previewViewport === mode}
                    onClick={() => setPreviewViewport(mode)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Badge tone={previewDirty ? 'warning' : 'brand'}>
                {previewDirty
                  ? 'Chế độ xem trước — Có thay đổi chưa lưu'
                  : 'Đang xem trước dữ liệu đã lưu'}
              </Badge>
            </div>

            {previewDirty && (
              <Notice tone="info">
                Chế độ Xem trước chỉ hiển thị thử nghiệm. Nhấn <strong>Lưu thay đổi</strong> và{' '}
                <strong>Xuất bản lên website</strong> để áp dụng lên trang chủ.
              </Notice>
            )}

            <div className="overflow-x-auto rounded-card border border-line bg-subtle p-3">
              <HeroSlidePreviewCanvas
                slide={toNormalizedPreviewSlide(previewSlide, previewIdx)}
                viewport={previewViewport}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Dedicated Focal Point Modal with Unsaved Modal-Close Guard */}
      <Dialog
        open={focalModal !== null}
        onClose={requestCloseFocalModal}
        title="Chọn điểm trọng tâm (Focal Point) cho Slide"
        wide
      >
        {focalModal && slides[focalModal.idx]?.desktopImage && (
          <div className="space-y-4">
            <Text className="text-small text-muted">
              Click lên vị trí quan trọng nhất của phương tiện (X: {focalModal.x}%, Y:{' '}
              {focalModal.y}%). Nhấn Áp dụng để cập nhật vào Slide.
            </Text>
            <div
              onClick={(e) =>
                handleFocalImageClick(e, (x, y) =>
                  setFocalModal((prev) => (prev ? { ...prev, x, y } : null)),
                )
              }
              className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-card border border-line bg-night"
            >
              <Image
                src={slides[focalModal.idx].desktopImage!.url}
                alt={slides[focalModal.idx].desktopImage!.alt}
                fill
                sizes="900px"
                className="object-cover"
              />
              <span
                aria-hidden="true"
                style={{ left: `${focalModal.x}%`, top: `${focalModal.y}%` }}
                className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-inverse bg-brand shadow-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={requestCloseFocalModal}>
                Đóng
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onUpdateSlide(focalModal.idx, { focalX: focalModal.x, focalY: focalModal.y })
                  setFocalModal(null)
                }}
              >
                Áp dụng điểm trọng tâm
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmCloseFocalModal}
        title="Thay đổi điểm trọng tâm chưa áp dụng"
        description={UNSAVED_WARNING_TEXT}
        confirmLabel="Rời khỏi"
        onClose={() => setConfirmCloseFocalModal(false)}
        onConfirm={() => {
          setConfirmCloseFocalModal(false)
          setFocalModal(null)
        }}
      />
    </div>
  )
}
