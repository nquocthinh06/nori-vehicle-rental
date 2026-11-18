'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate, parseWorkingDays } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  ButtonLink,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  TabButton,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type HeroSlideForm = {
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
  desktopImage: { url: string; alt: string } | null
  mobileImageId: string | null
  mobileImage: { url: string; alt: string } | null
  relatedCategory: string
  relatedModelId: string | null
  credit: string
  sourceUrl: string
  durationSeconds: number | null
  order: number
  active: boolean
}

type HeroImageItem = { imageId: string; credit: string; image: { url: string; alt: string } }
type HolidayItem = { date: string; name: string }
type MenuLink = { label: string; href: string; visible: boolean }
type FaqItem = { question: string; answer: string; order: number }
type VersionItem = { id: string; updatedAt: string; status: string }
type ModelOption = { id: string; name: string; slug: string; category: string }

type SiteContentForm = {
  _status: 'draft' | 'published'
  siteName: string
  tagline: string
  seoTitle: string
  seoDescription: string
  heroAutoplaySeconds: number
  heroSlides: HeroSlideForm[]
  heroImages: HeroImageItem[]
  storyImageId: string | null
  storyImage: { url: string; alt: string } | null
  homeIntroTitle: string
  homeIntroDescription: string
  showHeroSection: boolean
  showBenefitsSection: boolean
  showFeaturedSection: boolean
  showHowItWorksSection: boolean
  showStorySection: boolean
  showCtaSection: boolean
  headerMenu: MenuLink[]
  aboutSummary: string
  address: string
  phone: string
  email: string
  openingHours: string
  businessTimezone: string
  workingDays: string
  workStartTime: string
  workEndTime: string
  lunchBreakStart: string
  lunchBreakEnd: string
  holidays: HolidayItem[]
  contactNote: string
  rentalPolicySummary: string
  purchasePolicySummary: string
  ageRequirement: string
  licenseRequirement: string
  cancellationPolicy: string
  depositPolicy: string
  privacyPolicy: string
  termsOfUse: string
  faqs: FaqItem[]
  depositHoldHours: number
  maxPendingBookings: number
  maintenanceBannerEnabled: boolean
  maintenanceBannerText: string
  availableModels: ModelOption[]
  versions: VersionItem[]
}

const WEEKDAY_ITEMS = [
  { day: 1, label: 'Thứ 2' },
  { day: 2, label: 'Thứ 3' },
  { day: 3, label: 'Thứ 4' },
  { day: 4, label: 'Thứ 5' },
  { day: 5, label: 'Thứ 6' },
  { day: 6, label: 'Thứ 7' },
  { day: 0, label: 'Chủ nhật' },
]

export function ContentPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'brand' | 'hero' | 'hours' | 'policies' | 'faqs' | 'settings'>(
    'brand',
  )
  const [form, setForm] = useState<SiteContentForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [previewSlide, setPreviewSlide] = useState<HeroSlideForm | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    api<SiteContentForm>('/dashboard/content')
      .then((res) => {
        if (active) setForm(res)
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

  async function uploadSingleMedia(file: File, altText: string, mediaCategory = 'ILLUSTRATION') {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('alt', altText)
    fd.append('mediaCategory', mediaCategory)
    const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
    return {
      id: json.data.id as string,
      url: (json.data.photo?.url || json.data.url) as string,
      alt: (json.data.alt || altText) as string,
    }
  }

  async function uploadStoryBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form) return
    setUploading(true)
    try {
      const uploaded = await uploadSingleMedia(file, 'Ảnh câu chuyện NORI')
      setForm({
        ...form,
        storyImageId: uploaded.id,
        storyImage: { url: uploaded.url, alt: uploaded.alt },
      })
      toast('Đã tải ảnh câu chuyện lên thư viện.')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function uploadSlideImage(
    e: React.ChangeEvent<HTMLInputElement>,
    idx: number,
    slot: 'desktop' | 'mobile',
  ) {
    const file = e.target.files?.[0]
    if (!file || !form) return
    setUploading(true)
    try {
      const targetSlide = form.heroSlides[idx]
      const uploaded = await uploadSingleMedia(
        file,
        `${targetSlide?.titleFirst || 'Banner phương tiện NORI'} (${slot === 'desktop' ? 'Desktop' : 'Mobile'})`,
        'CATALOGUE_REFERENCE',
      )
      const next = [...form.heroSlides]
      next[idx] =
        slot === 'desktop'
          ? {
              ...targetSlide,
              desktopImageId: uploaded.id,
              desktopImage: { url: uploaded.url, alt: uploaded.alt },
            }
          : {
              ...targetSlide,
              mobileImageId: uploaded.id,
              mobileImage: { url: uploaded.url, alt: uploaded.alt },
            }
      setForm({ ...form, heroSlides: next })
      toast(`Đã cập nhật ảnh ${slot === 'desktop' ? 'Desktop' : 'Mobile'} cho Slide #${idx + 1}.`)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function addSlide() {
    if (!form) return
    setForm({
      ...form,
      heroSlides: [
        ...form.heroSlides,
        {
          titleFirst: 'Hành trình mới.',
          titleSecond: 'Trải nghiệm cùng NORI.',
          eyebrow: 'THUÊ XE LINH HOẠT · THÔNG TIN MINH BẠCH',
          categoryBadge: 'Phương tiện NORI',
          description: 'Khám phá các dòng xe phù hợp nhu cầu di chuyển của bạn.',
          ctaText: 'Khám phá ngay',
          ctaHref: '/vehicles',
          secondaryText: 'Cách NORI hoạt động',
          secondaryHref: '/about#how-it-works',
          desktopImageId: null,
          desktopImage: null,
          mobileImageId: null,
          mobileImage: null,
          relatedCategory: '',
          relatedModelId: null,
          credit: '',
          sourceUrl: '',
          durationSeconds: null,
          order: form.heroSlides.length,
          active: true,
        },
      ],
    })
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    if (!form) return
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= form.heroSlides.length) return
    const next = [...form.heroSlides]
    const [moved] = next.splice(idx, 1)
    next.splice(targetIdx, 0, moved)
    setForm({
      ...form,
      heroSlides: next.map((s, i) => ({ ...s, order: i })),
    })
  }

  function toggleWorkingDay(dayNum: number) {
    if (!form) return
    const current = new Set(parseWorkingDays(form.workingDays))
    if (current.has(dayNum)) {
      if (current.size <= 1) {
        toast('Phải giữ ít nhất 1 ngày làm việc trong tuần.', 'error')
        return
      }
      current.delete(dayNum)
    } else {
      current.add(dayNum)
    }
    setForm({
      ...form,
      workingDays: [...current].sort((a, b) => a - b).join(','),
    })
  }

  async function submitContent(targetStatus: 'draft' | 'published') {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      await api('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({
          _status: targetStatus,
          siteName: form.siteName,
          tagline: form.tagline,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          heroAutoplaySeconds: form.heroAutoplaySeconds,
          heroSlides: form.heroSlides.map((s, idx) => ({
            titleFirst: s.titleFirst,
            titleSecond: s.titleSecond,
            eyebrow: s.eyebrow,
            categoryBadge: s.categoryBadge,
            description: s.description,
            ctaText: s.ctaText,
            ctaHref: s.ctaHref,
            secondaryText: s.secondaryText,
            secondaryHref: s.secondaryHref,
            desktopImageId: s.desktopImageId,
            mobileImageId: s.mobileImageId,
            relatedCategory: s.relatedCategory,
            relatedModelId: s.relatedModelId,
            credit: s.credit,
            sourceUrl: s.sourceUrl,
            durationSeconds: s.durationSeconds,
            order: idx,
            active: s.active,
          })),
          heroImages: form.heroImages.map((h) => ({ imageId: h.imageId, credit: h.credit })),
          storyImageId: form.storyImageId,
          homeIntroTitle: form.homeIntroTitle,
          homeIntroDescription: form.homeIntroDescription,
          showHeroSection: form.showHeroSection,
          showBenefitsSection: form.showBenefitsSection,
          showFeaturedSection: form.showFeaturedSection,
          showHowItWorksSection: form.showHowItWorksSection,
          showStorySection: form.showStorySection,
          showCtaSection: form.showCtaSection,
          headerMenu: form.headerMenu,
          aboutSummary: form.aboutSummary,
          address: form.address,
          phone: form.phone,
          email: form.email,
          openingHours: form.openingHours,
          businessTimezone: form.businessTimezone,
          workingDays: form.workingDays,
          workStartTime: form.workStartTime,
          workEndTime: form.workEndTime,
          lunchBreakStart: form.lunchBreakStart,
          lunchBreakEnd: form.lunchBreakEnd,
          holidays: form.holidays,
          contactNote: form.contactNote,
          rentalPolicySummary: form.rentalPolicySummary,
          purchasePolicySummary: form.purchasePolicySummary,
          ageRequirement: form.ageRequirement,
          licenseRequirement: form.licenseRequirement,
          cancellationPolicy: form.cancellationPolicy,
          depositPolicy: form.depositPolicy,
          privacyPolicy: form.privacyPolicy,
          termsOfUse: form.termsOfUse,
          faqs: form.faqs,
          depositHoldHours: form.depositHoldHours,
          maxPendingBookings: form.maxPendingBookings,
          maintenanceBannerEnabled: form.maintenanceBannerEnabled,
          maintenanceBannerText: form.maintenanceBannerText,
        }),
      })
      toast(
        targetStatus === 'published'
          ? 'Đã xuất bản nội dung CMS và đồng bộ lên website công khai.'
          : 'Đã lưu bản nháp CMS.',
      )
      setRetry((r) => r + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function restoreVersion(versionId: string) {
    setSaving(true)
    try {
      await api('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({ restoreVersionId: versionId }),
      })
      toast('Đã khôi phục phiên bản nội dung trước đó.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-96" />
  if (!form) return <Notice tone="error">{error || 'Chưa thể tải nội dung website.'}</Notice>

  const activeWorkingDays = new Set(parseWorkingDays(form.workingDays))

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex items-center gap-2.5">
          <Badge tone={form._status === 'published' ? 'brand' : 'warning'}>
            {form._status === 'published' ? 'Đang xuất bản' : 'Có bản nháp chưa xuất bản'}
          </Badge>
          <ButtonLink
            href="/"
            variant="ghost"
            className="min-h-control-sm px-3 py-1.5 text-caption"
          >
            Xem trước website <Icon name="external" className="size-3.5" />
          </ButtonLink>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            onClick={() => void submitContent('draft')}
          >
            Lưu bản nháp
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={saving}
            onClick={() => void submitContent('published')}
          >
            Xuất bản lên website
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-4 border-b border-line">
        <TabButton selected={tab === 'brand'} onClick={() => setTab('brand')}>
          Thương hiệu & Trang chủ
        </TabButton>
        <TabButton selected={tab === 'hero'} onClick={() => setTab('hero')}>
          Hero Carousel ({form.heroSlides.length})
        </TabButton>
        <TabButton selected={tab === 'hours'} onClick={() => setTab('hours')}>
          Giờ làm việc & Nghỉ lễ
        </TabButton>
        <TabButton selected={tab === 'policies'} onClick={() => setTab('policies')}>
          Liên hệ & Chính sách
        </TabButton>
        <TabButton selected={tab === 'faqs'} onClick={() => setTab('faqs')}>
          FAQ ({form.faqs.length})
        </TabButton>
        <TabButton selected={tab === 'settings'} onClick={() => setTab('settings')}>
          Cài đặt & Phiên bản
        </TabButton>
      </div>

      {tab === 'brand' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Thương hiệu & SEO Metadata
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="cms-site-name"
                label="Tên thương hiệu"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              />
              <Input
                id="cms-tagline"
                label="Khẩu hiệu (Tagline)"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
              <Input
                id="cms-seo-title"
                label="SEO Meta Title mặc định"
                value={form.seoTitle}
                onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              />
              <Input
                id="cms-seo-desc"
                label="SEO Meta Description mặc định"
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Trạng thái hiển thị các Section trang chủ
            </Heading>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['showHeroSection', 'Hero Banner Carousel'],
                ['showBenefitsSection', 'Khu vực Lợi ích'],
                ['showFeaturedSection', 'Xe nổi bật'],
                ['showStorySection', 'Câu chuyện NORI'],
                ['showHowItWorksSection', 'Quy trình đặt xe'],
                ['showCtaSection', 'Kêu gọi hành động'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 rounded-control border border-line px-3.5 py-2.5 text-small"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form[key as keyof SiteContentForm])}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="size-4"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
              <div className="flex items-center gap-4">
                {form.storyImage && (
                  <Image
                    src={form.storyImage.url}
                    alt={form.storyImage.alt}
                    width={120}
                    height={80}
                    className="h-16 w-24 rounded-control object-cover"
                  />
                )}
                <div>
                  <Text className="text-small font-semibold">Ảnh câu chuyện NORI</Text>
                  <Text className="text-caption text-muted">
                    Để quản lý các slide phương tiện trên đầu trang chủ, chuyển sang tab Hero
                    Carousel.
                  </Text>
                </div>
              </div>
              <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-2 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                <Icon name="upload" className="size-4" />
                {uploading ? 'Đang tải...' : 'Thay ảnh câu chuyện'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => void uploadStoryBanner(e)}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {/* Section 15: Hero Carousel Admin Management */}
      {tab === 'hero' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Heading as="h2" size="subtitle">
                  Quản lý Slide Hero Carousel Trang chủ
                </Heading>
                <Text className="text-caption text-muted">
                  Quản lý hình ảnh phương tiện Desktop/Mobile, tiêu đề, CTA, thứ tự, thời gian hiển
                  thị và bật/tắt từng slide trực tiếp từ CMS.
                </Text>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  id="hero-autoplay-sec"
                  label="Tự động chuyển sau (giây)"
                  type="number"
                  min={3}
                  max={20}
                  value={form.heroAutoplaySeconds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      heroAutoplaySeconds: Math.min(20, Math.max(3, Number(e.target.value) || 6)),
                    })
                  }
                  wrapperClassName="w-48"
                />
                <Button size="sm" onClick={addSlide} disabled={form.heroSlides.length >= 12}>
                  <Icon name="plus" className="size-4" />
                  Thêm Slide mới
                </Button>
              </div>
            </div>

            {form.heroSlides.length === 0 ? (
              <Notice>
                Chưa có slide tùy chỉnh trong Database (website đang hiển thị 5 slide phương tiện
                chuẩn mặc định). Nhấn <strong>Thêm Slide mới</strong> để tùy biến hoàn toàn từ
                Admin.
              </Notice>
            ) : (
              <div className="space-y-5">
                {form.heroSlides.map((slide, idx) => (
                  <article
                    key={slide.id ?? idx}
                    className="space-y-4 rounded-card border border-line bg-subtle/40 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                      <div className="flex items-center gap-2.5">
                        <Badge tone={slide.active ? 'brand' : 'muted'}>
                          Slide #{idx + 1} · {slide.active ? 'Đang hiển thị' : 'Đang ẩn'}
                        </Badge>
                        <Text className="font-semibold text-ink">
                          {slide.categoryBadge || slide.titleFirst}
                        </Text>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <label className="mr-2 inline-flex items-center gap-1.5 text-caption font-medium">
                          <input
                            type="checkbox"
                            checked={slide.active}
                            onChange={(e) => {
                              const next = [...form.heroSlides]
                              next[idx] = { ...slide, active: e.target.checked }
                              setForm({ ...form, heroSlides: next })
                            }}
                            className="size-4"
                          />
                          Bật hiển thị
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => moveSlide(idx, -1)}
                        >
                          Lên
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === form.heroSlides.length - 1}
                          onClick={() => moveSlide(idx, 1)}
                        >
                          Xuống
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPreviewSlide(slide)}
                        >
                          Xem trước
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setForm({
                              ...form,
                              heroSlides: form.heroSlides.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        id={`slide-first-${idx}`}
                        label="Tiêu đề dòng 1 *"
                        value={slide.titleFirst}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, titleFirst: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-second-${idx}`}
                        label="Tiêu đề dòng 2 (nhấn mạnh)"
                        value={slide.titleSecond}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, titleSecond: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-badge-${idx}`}
                        label="Nhãn danh mục"
                        value={slide.categoryBadge}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, categoryBadge: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-eyebrow-${idx}`}
                        label="Eyebrow phụ đề"
                        value={slide.eyebrow}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, eyebrow: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                    </div>

                    <Textarea
                      id={`slide-desc-${idx}`}
                      label="Mô tả ngắn"
                      rows={2}
                      value={slide.description}
                      onChange={(e) => {
                        const next = [...form.heroSlides]
                        next[idx] = { ...slide, description: e.target.value }
                        setForm({ ...form, heroSlides: next })
                      }}
                    />

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        id={`slide-cta-text-${idx}`}
                        label="Nhãn CTA chính"
                        value={slide.ctaText}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, ctaText: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-cta-href-${idx}`}
                        label="Đường dẫn CTA chính"
                        value={slide.ctaHref}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, ctaHref: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Select
                        id={`slide-rel-cat-${idx}`}
                        label="Danh mục liên quan"
                        value={slide.relatedCategory}
                        onChange={(e) => {
                          const cat = e.target.value
                          const next = [...form.heroSlides]
                          next[idx] = {
                            ...slide,
                            relatedCategory: cat,
                            ...(cat && slide.ctaHref === '/vehicles'
                              ? { ctaHref: `/vehicles?type=${cat}` }
                              : {}),
                          }
                          setForm({ ...form, heroSlides: next })
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
                          const matched = form.availableModels.find((m) => m.id === mId)
                          const next = [...form.heroSlides]
                          next[idx] = {
                            ...slide,
                            relatedModelId: mId,
                            ...(matched ? { ctaHref: `/vehicles/${matched.slug}` } : {}),
                          }
                          setForm({ ...form, heroSlides: next })
                        }}
                      >
                        <option value="">Không chọn cụ thể</option>
                        {form.availableModels.map((m) => (
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
                        placeholder={`Mặc định (${form.heroAutoplaySeconds}s)`}
                        value={slide.durationSeconds ?? ''}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = {
                            ...slide,
                            durationSeconds: e.target.value ? Number(e.target.value) : null,
                          }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-credit-${idx}`}
                        label="Nguồn ảnh / Tác giả"
                        value={slide.credit}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, credit: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                      <Input
                        id={`slide-source-url-${idx}`}
                        label="URL nguồn tham chiếu"
                        value={slide.sourceUrl}
                        onChange={(e) => {
                          const next = [...form.heroSlides]
                          next[idx] = { ...slide, sourceUrl: e.target.value }
                          setForm({ ...form, heroSlides: next })
                        }}
                      />
                    </div>

                    {/* Desktop & Mobile Image Uploads */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-canvas p-3">
                        <div className="flex items-center gap-3">
                          {slide.desktopImage ? (
                            <Image
                              src={slide.desktopImage.url}
                              alt={slide.desktopImage.alt}
                              width={96}
                              height={60}
                              className="h-14 w-24 rounded-sm object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-24 items-center justify-center rounded-sm bg-subtle text-micro text-muted">
                              Chưa chọn
                            </div>
                          )}
                          <div>
                            <Text className="text-caption font-semibold">Ảnh Desktop</Text>
                            <Text className="text-micro text-muted">Tỷ lệ ngang 16:9</Text>
                          </div>
                        </div>
                        <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-1.5 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                          <Icon name="upload" className="size-3.5" />
                          Tải ảnh Desktop
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => void uploadSlideImage(e, idx, 'desktop')}
                          />
                        </label>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-canvas p-3">
                        <div className="flex items-center gap-3">
                          {slide.mobileImage ? (
                            <Image
                              src={slide.mobileImage.url}
                              alt={slide.mobileImage.alt}
                              width={64}
                              height={60}
                              className="h-14 w-16 rounded-sm object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-16 items-center justify-center rounded-sm bg-subtle text-micro text-muted">
                              Tự động
                            </div>
                          )}
                          <div>
                            <Text className="text-caption font-semibold">
                              Ảnh Mobile (tùy chọn)
                            </Text>
                            <Text className="text-micro text-muted">
                              Dùng ảnh Desktop nếu để trống
                            </Text>
                          </div>
                        </div>
                        <label className="inline-flex min-h-control-sm cursor-pointer items-center gap-1.5 rounded-control border border-line bg-subtle px-3 py-1.5 text-caption font-semibold hover:border-brand">
                          <Icon name="upload" className="size-3.5" />
                          Tải ảnh Mobile
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => void uploadSlideImage(e, idx, 'mobile')}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Section 8: Business Hours & Holidays Configuration */}
      {tab === 'hours' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <div>
              <Heading as="h2" size="subtitle">
                Cấu hình Giờ làm việc hành chính & Tư vấn khách hàng
              </Heading>
              <Text className="text-caption text-muted">
                Dùng để tự động xác định ngày làm việc tiếp theo và khung giờ nhân viên liên hệ sau
                khi Admin duyệt đơn thuê (mặc định múi giờ Việt Nam: Asia/Ho_Chi_Minh).
              </Text>
            </div>

            <div>
              <Text className="mb-2 text-small font-semibold text-ink">
                Ngày làm việc trong tuần (các ngày không chọn được tính là ngày nghỉ cuối tuần)
              </Text>
              <div className="flex flex-wrap gap-2.5">
                {WEEKDAY_ITEMS.map((item) => {
                  const active = activeWorkingDays.has(item.day)
                  return (
                    <button
                      key={item.day}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleWorkingDay(item.day)}
                      className={`rounded-control border px-3.5 py-2 text-small font-medium transition-colors ${
                        active
                          ? 'border-brand bg-brand-soft text-brand'
                          : 'border-line bg-canvas text-muted hover:border-brand/50'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Input
                id="bh-timezone"
                label="Múi giờ hoạt động"
                value={form.businessTimezone}
                onChange={(e) => setForm({ ...form, businessTimezone: e.target.value })}
              />
              <Input
                id="bh-start"
                label="Giờ bắt đầu (HH:MM)"
                type="time"
                value={form.workStartTime}
                onChange={(e) => setForm({ ...form, workStartTime: e.target.value })}
              />
              <Input
                id="bh-end"
                label="Giờ kết thúc (HH:MM)"
                type="time"
                value={form.workEndTime}
                onChange={(e) => setForm({ ...form, workEndTime: e.target.value })}
              />
              <Input
                id="bh-lunch-start"
                label="Nghỉ trưa từ"
                type="time"
                value={form.lunchBreakStart}
                onChange={(e) => setForm({ ...form, lunchBreakStart: e.target.value })}
              />
              <Input
                id="bh-lunch-end"
                label="Nghỉ trưa đến"
                type="time"
                value={form.lunchBreakEnd}
                onChange={(e) => setForm({ ...form, lunchBreakEnd: e.target.value })}
              />
            </div>

            <div className="border-t border-line pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Text className="text-small font-semibold text-ink">
                    Danh sách ngày nghỉ lễ bổ sung ({form.holidays.length})
                  </Text>
                  <Text className="text-micro text-muted">
                    Ngoài các ngày lễ cố định tại Việt Nam (01/01, 30/04, 01/05, 02/09, Tết Nguyên
                    Đán), bạn có thể khai báo thêm ngày nghỉ riêng của đơn vị vận hành.
                  </Text>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      holidays: [...form.holidays, { date: '', name: 'Nghỉ lễ vận hành' }],
                    })
                  }
                >
                  <Icon name="plus" className="size-4" />
                  Thêm ngày nghỉ lễ
                </Button>
              </div>

              {form.holidays.length > 0 && (
                <div className="space-y-2.5">
                  {form.holidays.map((h, idx) => (
                    <div
                      key={idx}
                      className="grid items-end gap-3 rounded-control border border-line p-3 sm:grid-cols-3"
                    >
                      <Input
                        id={`holiday-date-${idx}`}
                        label="Ngày nghỉ"
                        type="date"
                        value={h.date}
                        onChange={(e) => {
                          const next = [...form.holidays]
                          next[idx] = { ...h, date: e.target.value }
                          setForm({ ...form, holidays: next })
                        }}
                      />
                      <Input
                        id={`holiday-name-${idx}`}
                        label="Tên ngày nghỉ lễ"
                        value={h.name}
                        onChange={(e) => {
                          const next = [...form.holidays]
                          next[idx] = { ...h, name: e.target.value }
                          setForm({ ...form, holidays: next })
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setForm({
                            ...form,
                            holidays: form.holidays.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        Xóa ngày nghỉ
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'policies' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Thông tin liên hệ & Địa điểm NORI
            </Heading>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                id="site-phone"
                label="Hotline hỗ trợ"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                id="site-email"
                label="Email hỗ trợ"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                id="site-hours"
                label="Giờ mở cửa bãi xe hiển thị chung"
                value={form.openingHours}
                onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                id="site-address"
                label="Địa chỉ nhận & trả xe"
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <Textarea
                id="site-contact-note"
                label="Nội dung liên hệ & hướng dẫn hỗ trợ"
                rows={2}
                value={form.contactNote}
                onChange={(e) => setForm({ ...form, contactNote: e.target.value })}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Giới thiệu, Chính sách bảo mật & Điều khoản
            </Heading>
            <Textarea
              id="site-about"
              label="Thông tin giới thiệu NORI (trang /about)"
              rows={3}
              value={form.aboutSummary}
              onChange={(e) => setForm({ ...form, aboutSummary: e.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="site-age"
                label="Điều kiện độ tuổi thuê xe"
                value={form.ageRequirement}
                onChange={(e) => setForm({ ...form, ageRequirement: e.target.value })}
              />
              <Input
                id="site-license"
                label="Yêu cầu giấy phép lái xe"
                value={form.licenseRequirement}
                onChange={(e) => setForm({ ...form, licenseRequirement: e.target.value })}
              />
              <Textarea
                id="site-rent-policy"
                label="Chính sách thuê xe"
                rows={3}
                value={form.rentalPolicySummary}
                onChange={(e) => setForm({ ...form, rentalPolicySummary: e.target.value })}
              />
              <Textarea
                id="site-buy-policy"
                label="Chính sách mua xe"
                rows={3}
                value={form.purchasePolicySummary}
                onChange={(e) => setForm({ ...form, purchasePolicySummary: e.target.value })}
              />
              <Textarea
                id="site-cancel-policy"
                label="Chính sách hủy & hoàn cọc"
                rows={3}
                value={form.cancellationPolicy}
                onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })}
              />
              <Textarea
                id="site-deposit-policy"
                label="Chính sách đặt cọc & nhiên liệu/pin"
                rows={3}
                value={form.depositPolicy}
                onChange={(e) => setForm({ ...form, depositPolicy: e.target.value })}
              />
              <Textarea
                id="site-privacy"
                label="Chính sách bảo mật"
                rows={4}
                value={form.privacyPolicy}
                onChange={(e) => setForm({ ...form, privacyPolicy: e.target.value })}
              />
              <Textarea
                id="site-terms"
                label="Điều khoản sử dụng"
                rows={4}
                value={form.termsOfUse}
                onChange={(e) => setForm({ ...form, termsOfUse: e.target.value })}
              />
            </div>
          </section>
        </div>
      )}

      {tab === 'faqs' && (
        <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h2" size="subtitle">
                Quản lý FAQ hiển thị tại /support
              </Heading>
              <Text className="text-caption text-muted">
                Khi có danh sách FAQ tại đây, trang /support sẽ tự động đồng bộ từ CMS.
              </Text>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  faqs: [...form.faqs, { question: '', answer: '', order: form.faqs.length + 1 }],
                })
              }
            >
              <Icon name="plus" className="size-4" />
              Thêm câu hỏi
            </Button>
          </div>
          {form.faqs.length === 0 ? (
            <Text className="py-6 text-center text-small text-muted">
              Chưa có câu hỏi FAQ tùy chỉnh (đang dùng bộ FAQ mặc định của hệ thống).
            </Text>
          ) : (
            <div className="space-y-4">
              {form.faqs.map((faq, idx) => (
                <div key={idx} className="space-y-3 rounded-control border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Text className="text-caption font-semibold text-muted">
                      Câu hỏi #{idx + 1}
                    </Text>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setForm({ ...form, faqs: form.faqs.filter((_, i) => i !== idx) })
                      }
                    >
                      Xóa
                    </Button>
                  </div>
                  <Input
                    id={`faq-q-${idx}`}
                    label="Câu hỏi"
                    value={faq.question}
                    onChange={(e) => {
                      const next = [...form.faqs]
                      next[idx] = { ...faq, question: e.target.value }
                      setForm({ ...form, faqs: next })
                    }}
                  />
                  <Textarea
                    id={`faq-a-${idx}`}
                    label="Câu trả lời"
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => {
                      const next = [...form.faqs]
                      next[idx] = { ...faq, answer: e.target.value }
                      setForm({ ...form, faqs: next })
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Cấu hình vận hành hệ thống
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="sys-hold-hours"
                label="Thời hạn giữ chỗ chờ đặt cọc (giờ)"
                type="number"
                min={1}
                max={168}
                value={form.depositHoldHours}
                onChange={(e) =>
                  setForm({ ...form, depositHoldHours: Number(e.target.value) || 24 })
                }
              />
              <Input
                id="sys-max-pending"
                label="Số đơn chờ xác nhận tối đa / khách hàng"
                type="number"
                min={1}
                max={20}
                value={form.maxPendingBookings}
                onChange={(e) =>
                  setForm({ ...form, maxPendingBookings: Number(e.target.value) || 5 })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={form.maintenanceBannerEnabled}
                onChange={(e) => setForm({ ...form, maintenanceBannerEnabled: e.target.checked })}
                className="size-4"
              />
              Hiển thị thông báo vận hành trên website khách hàng
            </label>
            {form.maintenanceBannerEnabled && (
              <Input
                id="sys-banner-text"
                label="Nội dung thông báo"
                value={form.maintenanceBannerText}
                onChange={(e) => setForm({ ...form, maintenanceBannerText: e.target.value })}
              />
            )}
          </section>

          <section className="space-y-3 rounded-card border border-line bg-canvas p-5">
            <Heading as="h2" size="subtitle">
              Lịch sử phiên bản CMS ({form.versions.length})
            </Heading>
            {form.versions.length === 0 ? (
              <Text className="text-small text-muted">Chưa có lịch sử phiên bản.</Text>
            ) : (
              <div className="divide-y divide-line rounded-control border border-line">
                {form.versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-small"
                  >
                    <div>
                      <Badge tone={v.status === 'published' ? 'brand' : 'muted'}>
                        {v.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                      </Badge>{' '}
                      <span className="ml-2 text-muted">{formatDate(v.updatedAt)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void restoreVersion(v.id)}
                    >
                      Khôi phục phiên bản này
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Slide Live Preview Modal */}
      <Dialog
        open={Boolean(previewSlide)}
        onClose={() => setPreviewSlide(null)}
        title="Xem trước hiển thị Slide Hero"
        wide
      >
        {previewSlide && (
          <div className="relative overflow-hidden rounded-card bg-night p-8 text-inverse">
            {previewSlide.desktopImage && (
              <Image
                src={previewSlide.desktopImage.url}
                alt={previewSlide.desktopImage.alt}
                fill
                sizes="80vw"
                className="object-cover opacity-45"
              />
            )}
            <div className="relative z-10 max-w-xl space-y-3">
              {previewSlide.categoryBadge && (
                <Badge tone="brand">{previewSlide.categoryBadge}</Badge>
              )}
              <Text className="text-micro uppercase tracking-widest text-inverse/80">
                {previewSlide.eyebrow}
              </Text>
              <Heading as="h3" size="title" className="text-inverse">
                {previewSlide.titleFirst}{' '}
                <span className="text-brand-bright">{previewSlide.titleSecond}</span>
              </Heading>
              <Text className="text-small text-inverse/90">{previewSlide.description}</Text>
              <div className="pt-2">
                <span className="inline-flex items-center gap-2 rounded-control bg-brand px-4 py-2 text-small font-semibold text-inverse">
                  {previewSlide.ctaText}
                  <Icon name="arrow-up-right" className="size-4" />
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
