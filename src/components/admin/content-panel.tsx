'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminHasPermission } from '@/access/nori'
import { useAuth } from '@/components/auth-provider'
import { api } from '@/lib/client-api'
import { formatDate, parseWorkingDays } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  ButtonLink,
  Heading,
  Input,
  Notice,
  Skeleton,
  TabButton,
  Text,
  Textarea,
} from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Icon } from '@/components/ui/icon'
import {
  HeroCarouselEditor,
  UNSAVED_WARNING_TEXT,
  serializeSlide,
  type AdminMediaSummary,
  type HeroSlideForm,
  type SlideSaveState,
} from './hero-carousel-editor'
import { useToast } from './toast'

type HeroImageItem = { imageId: string; credit: string; image: AdminMediaSummary }
type HolidayItem = { date: string; name: string }
type MenuLink = { label: string; href: string; visible: boolean }
type FaqItem = { question: string; answer: string; order: number }
type VersionItem = { id: string; updatedAt: string; status: string }
type ModelOption = { id: string; name: string; slug: string; category: string }

type SiteContentForm = {
  _status: 'draft' | 'published'
  hasPublishedVersion?: boolean
  hasUnpublishedChanges?: boolean
  publishedAt?: string | null
  siteName: string
  tagline: string
  seoTitle: string
  seoDescription: string
  heroAutoplaySeconds: number
  heroSlides: HeroSlideForm[]
  heroImages: HeroImageItem[]
  storyImageId: string | null
  storyImage: AdminMediaSummary | null
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

type CmsTab = 'brand' | 'hero' | 'hours' | 'policies' | 'faqs' | 'settings'

const WEEKDAY_ITEMS = [
  { day: 1, label: 'Thứ 2' },
  { day: 2, label: 'Thứ 3' },
  { day: 3, label: 'Thứ 4' },
  { day: 4, label: 'Thứ 5' },
  { day: 5, label: 'Thứ 6' },
  { day: 6, label: 'Thứ 7' },
  { day: 0, label: 'Chủ nhật' },
]

function serializeFormComparable(form: SiteContentForm): string {
  return JSON.stringify({
    siteName: form.siteName,
    tagline: form.tagline,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    heroAutoplaySeconds: form.heroAutoplaySeconds,
    heroSlides: form.heroSlides.map(serializeSlide),
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
  })
}

function cloneForm(data: SiteContentForm): SiteContentForm {
  return JSON.parse(JSON.stringify(data)) as SiteContentForm
}

export function ContentPanel() {
  const router = useRouter()
  const { user } = useAuth()
  const canPublish = adminHasPermission(
    user ? { ...user, collection: user.isAdmin ? 'admins' : 'users' } : null,
    'content',
    'publish',
  )
  const { toast } = useToast()
  const [tab, setTab] = useState<CmsTab>('brand')
  const [form, setForm] = useState<SiteContentForm | null>(null)
  const [savedForm, setSavedForm] = useState<SiteContentForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [publishSuccessMsg, setPublishSuccessMsg] = useState('')
  const [retry, setRetry] = useState(0)

  const [slideSaveStates, setSlideSaveStates] = useState<Record<string, SlideSaveState>>({})
  const [slideSaveErrors, setSlideSaveErrors] = useState<Record<string, string>>({})

  const [pendingAction, setPendingAction] = useState<
    { type: 'tab'; tab: CmsTab } | { type: 'route'; href: string } | null
  >(null)
  const bypassGuardRef = useRef(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api<SiteContentForm>('/dashboard/content')
      .then((res) => {
        if (!active) return
        setForm(res)
        setSavedForm(cloneForm(res))
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

  const hasUnsavedChanges = useMemo(() => {
    if (!form || !savedForm) return false
    return serializeFormComparable(form) !== serializeFormComparable(savedForm)
  }, [form, savedForm])

  // Browser reload / tab close guard when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // In-app route navigation guard when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handleLinkClick = (e: MouseEvent) => {
      if (bypassGuardRef.current) return
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return
      }
      const target = e.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.target === '_blank') return
      const url = new URL(href, window.location.href)
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setPendingAction({ type: 'route', href: url.pathname + url.search + url.hash })
    }
    document.addEventListener('click', handleLinkClick, true)
    return () => document.removeEventListener('click', handleLinkClick, true)
  }, [hasUnsavedChanges])

  function requestTabChange(nextTab: CmsTab) {
    if (nextTab === tab) return
    if (hasUnsavedChanges) {
      setPendingAction({ type: 'tab', tab: nextTab })
      return
    }
    setTab(nextTab)
  }

  function confirmPendingLeave() {
    if (!pendingAction) return
    const action = pendingAction
    setPendingAction(null)
    if (action.type === 'tab') {
      setTab(action.tab)
      return
    }
    bypassGuardRef.current = true
    router.push(action.href)
  }

  async function uploadSingleMedia(
    file: File,
    altText: string,
    mediaCategory = 'ILLUSTRATION',
    purpose?: 'hero-desktop' | 'hero-mobile',
  ) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('alt', altText)
    fd.append('mediaCategory', mediaCategory)
    if (purpose) fd.append('purpose', purpose)
    const res = await fetch('/nori-api/dashboard/media', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'Chưa thể tải ảnh lên.')
    return {
      id: json.data.id as string,
      url: (json.data.photo?.url || json.data.url) as string,
      alt: (json.data.alt || altText) as string,
      width: (json.data.width ?? json.data.photo?.width) as number | undefined,
      height: (json.data.height ?? json.data.photo?.height) as number | undefined,
      filesize: (json.data.filesize ?? json.data.photo?.filesize ?? null) as number | null,
      mimeType: (json.data.mimeType ?? json.data.photo?.mimeType ?? null) as string | null,
      lowResolutionWarning: Boolean(json.data.lowResolutionWarning),
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
        storyImage: {
          url: uploaded.url,
          alt: uploaded.alt,
          width: uploaded.width,
          height: uploaded.height,
          filesize: uploaded.filesize,
          mimeType: uploaded.mimeType,
        },
      })
      toast('Đã tải ảnh câu chuyện lên thư viện. Nhấn Lưu bản nháp hoặc Xuất bản để ghi nhận.')
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
        slot === 'desktop' ? 'hero-desktop' : 'hero-mobile',
      )
      const mediaSummary: AdminMediaSummary = {
        url: uploaded.url,
        alt: uploaded.alt,
        width: uploaded.width,
        height: uploaded.height,
        filesize: uploaded.filesize,
        mimeType: uploaded.mimeType,
      }
      const next = [...form.heroSlides]
      next[idx] =
        slot === 'desktop'
          ? {
              ...targetSlide,
              desktopImageId: uploaded.id,
              desktopImage: mediaSummary,
            }
          : {
              ...targetSlide,
              mobileImageId: uploaded.id,
              mobileImage: mediaSummary,
            }
      const key = targetSlide.id || `idx-${idx}`
      setSlideSaveStates((prev) => ({ ...prev, [key]: 'idle' }))
      setSlideSaveErrors((prev) => ({ ...prev, [key]: '' }))
      setForm({ ...form, heroSlides: next })
      setPublishSuccessMsg('')
      if (uploaded.lowResolutionWarning) {
        toast(
          'Ảnh có độ phân giải thấp, có thể bị giảm chất lượng trên màn hình lớn. Nhấn "Lưu thay đổi" để lưu vào Slide.',
          'info',
        )
      } else {
        toast(
          `Đã tải ảnh ${slot === 'desktop' ? 'Desktop' : 'Mobile'} lên thư viện. Nhấn "Lưu thay đổi" trên Slide #${idx + 1} để lưu.`,
        )
      }
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const updateSlideAt = useCallback((idx: number, patch: Partial<HeroSlideForm>) => {
    setForm((prev) => {
      if (!prev) return prev
      const target = prev.heroSlides[idx]
      if (!target) return prev
      const next = [...prev.heroSlides]
      next[idx] = { ...target, ...patch }
      const key = target.id || `idx-${idx}`
      setSlideSaveStates((s) =>
        s[key] === 'saved' || s[key] === 'error' ? { ...s, [key]: 'idle' } : s,
      )
      setSlideSaveErrors((e) => (e[key] ? { ...e, [key]: '' } : e))
      return { ...prev, heroSlides: next }
    })
    setPublishSuccessMsg('')
  }, [])

  function addSlide() {
    if (!form) return
    setPublishSuccessMsg('')
    setForm({
      ...form,
      heroSlides: [
        ...form.heroSlides,
        {
          id: `new-slide-${Date.now()}`,
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
          focalX: 50,
          focalY: 50,
          mobileFocalX: 50,
          mobileFocalY: 50,
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
    setPublishSuccessMsg('')
    setForm({
      ...form,
      heroSlides: next.map((s, i) => ({ ...s, order: i })),
    })
  }

  function removeSlide(idx: number) {
    if (!form) return
    setPublishSuccessMsg('')
    setForm({
      ...form,
      heroSlides: form.heroSlides.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })),
    })
  }

  function revertSlide(idx: number) {
    if (!form || !savedForm) return
    const target = form.heroSlides[idx]
    if (!target) return
    const savedMatch =
      (target.id ? savedForm.heroSlides.find((s) => s.id === target.id) : undefined) ??
      savedForm.heroSlides[idx]
    const key = target.id || `idx-${idx}`
    setSlideSaveStates((prev) => ({ ...prev, [key]: 'idle' }))
    setSlideSaveErrors((prev) => ({ ...prev, [key]: '' }))
    if (!savedMatch) {
      removeSlide(idx)
      toast('Đã hủy slide mới chưa lưu.')
      return
    }
    const next = [...form.heroSlides]
    next[idx] = JSON.parse(JSON.stringify(savedMatch)) as HeroSlideForm
    setForm({ ...form, heroSlides: next })
    toast(`Đã hoàn tác Slide #${idx + 1} về trạng thái đã lưu.`)
  }

  async function saveSingleSlide(idx: number) {
    if (!form) return
    const slide = form.heroSlides[idx]
    if (!slide) return
    const key = slide.id || `idx-${idx}`

    if (!slide.titleFirst.trim()) {
      const msg = `Slide #${idx + 1}: Tiêu đề dòng 1 là bắt buộc.`
      setSlideSaveStates((prev) => ({ ...prev, [key]: 'error' }))
      setSlideSaveErrors((prev) => ({ ...prev, [key]: msg }))
      toast(msg, 'error')
      return
    }
    if (slide.active && !slide.desktopImageId) {
      const msg = `Slide #${idx + 1}: Ảnh nền Desktop là bắt buộc.`
      setSlideSaveStates((prev) => ({ ...prev, [key]: 'error' }))
      setSlideSaveErrors((prev) => ({ ...prev, [key]: msg }))
      toast(msg, 'error')
      return
    }

    setSlideSaveStates((prev) => ({ ...prev, [key]: 'saving' }))
    setSlideSaveErrors((prev) => ({ ...prev, [key]: '' }))
    setPublishSuccessMsg('')

    try {
      const res = await api<{
        updated: boolean
        _status: 'draft' | 'published'
        savedIndex: number
        savedSlide: HeroSlideForm | null
        heroSlides: HeroSlideForm[]
      }>('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'save_slide',
          slideIndex: idx,
          slideId: slide.id?.startsWith('new-slide-') ? undefined : slide.id,
          slide: {
            id: slide.id?.startsWith('new-slide-') ? undefined : slide.id,
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
            focalX: slide.focalX,
            focalY: slide.focalY,
            mobileFocalX: slide.mobileFocalX,
            mobileFocalY: slide.mobileFocalY,
            relatedCategory: slide.relatedCategory,
            relatedModelId: slide.relatedModelId,
            credit: slide.credit,
            sourceUrl: slide.sourceUrl,
            durationSeconds: slide.durationSeconds,
            order: idx,
            active: slide.active,
          },
        }),
      })

      if (!res.updated || !res.savedSlide) {
        throw new Error('Máy chủ chưa xác nhận lưu Slide.')
      }

      const persistedSlide = res.savedSlide
      setForm((prev) => {
        if (!prev) return prev
        const nextSlides = [...prev.heroSlides]
        nextSlides[idx] = persistedSlide
        return {
          ...prev,
          _status: 'draft',
          hasUnpublishedChanges: true,
          heroSlides: nextSlides,
        }
      })
      setSavedForm((prev) => {
        if (!prev) return prev
        const nextSavedSlides = [...prev.heroSlides]
        if (idx < nextSavedSlides.length) {
          nextSavedSlides[idx] = JSON.parse(JSON.stringify(persistedSlide)) as HeroSlideForm
        } else {
          nextSavedSlides.push(JSON.parse(JSON.stringify(persistedSlide)) as HeroSlideForm)
        }
        return {
          ...prev,
          _status: 'draft',
          hasUnpublishedChanges: true,
          heroSlides: nextSavedSlides,
        }
      })
      const persistedKey = persistedSlide.id || key
      setSlideSaveStates((prev) => ({ ...prev, [key]: 'saved', [persistedKey]: 'saved' }))
      toast(
        `Đã lưu Slide #${idx + 1} vào bản nháp. Nhấn "Xuất bản lên website" để áp dụng công khai.`,
      )
    } catch (err) {
      const msg = (err as Error).message || 'Không thể lưu thay đổi Slide.'
      setSlideSaveStates((prev) => ({ ...prev, [key]: 'error' }))
      setSlideSaveErrors((prev) => ({ ...prev, [key]: msg }))
      toast(msg, 'error')
    }
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

  function validateBeforePublish(currentForm: SiteContentForm): string | null {
    for (let i = 0; i < currentForm.heroSlides.length; i++) {
      const s = currentForm.heroSlides[i]
      if (!s.titleFirst.trim()) return `Slide #${i + 1}: Vui lòng nhập Tiêu đề dòng 1.`
      if (!s.ctaText.trim()) return `Slide #${i + 1}: Vui lòng nhập Nhãn nút CTA chính.`
      if (!s.ctaHref.trim()) return `Slide #${i + 1}: Vui lòng nhập Đường dẫn CTA chính.`
      if (s.active && !s.desktopImageId) {
        return `Slide #${i + 1}: Ảnh nền Desktop là bắt buộc trước khi xuất bản.`
      }
    }
    return null
  }

  async function submitContent(targetStatus: 'draft' | 'published') {
    if (!form) return
    if (targetStatus === 'published') {
      const validationErr = validateBeforePublish(form)
      if (validationErr) {
        setError(validationErr)
        toast(validationErr, 'error')
        return
      }
    }

    setSaving(true)
    setError('')
    setPublishSuccessMsg('')
    try {
      const res = await api<{
        updated: boolean
        _status: 'draft' | 'published'
        published?: boolean
        revalidated?: boolean
        publishedAt?: string
        heroSlides?: HeroSlideForm[]
      }>('/dashboard/content', {
        method: 'PATCH',
        body: JSON.stringify({
          action: targetStatus === 'published' ? 'publish' : 'save_draft',
          _status: targetStatus,
          siteName: form.siteName,
          tagline: form.tagline,
          seoTitle: form.seoTitle,
          seoDescription: form.seoDescription,
          heroAutoplaySeconds: form.heroAutoplaySeconds,
          heroSlides: form.heroSlides.map((s, idx) => ({
            id: s.id?.startsWith('new-slide-') ? undefined : s.id,
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
            focalX: s.focalX,
            focalY: s.focalY,
            mobileFocalX: s.mobileFocalX,
            mobileFocalY: s.mobileFocalY,
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

      if (targetStatus === 'published' && (!res.published || !res.revalidated)) {
        throw new Error('Xuất bản chưa hoàn tất đồng bộ cache trang chủ. Vui lòng thử lại.')
      }

      const nextSlides = res.heroSlides ?? form.heroSlides
      const syncedForm: SiteContentForm = {
        ...form,
        _status: targetStatus,
        hasPublishedVersion: targetStatus === 'published' ? true : form.hasPublishedVersion,
        hasUnpublishedChanges: targetStatus !== 'published',
        publishedAt:
          targetStatus === 'published'
            ? (res.publishedAt ?? new Date().toISOString())
            : form.publishedAt,
        heroSlides: nextSlides,
      }
      setForm(syncedForm)
      setSavedForm(cloneForm(syncedForm))
      setSlideSaveStates({})
      setSlideSaveErrors({})

      if (targetStatus === 'published') {
        const msg = 'Đã xuất bản. Nội dung mới đang được sử dụng trên website.'
        setPublishSuccessMsg(msg)
        toast(msg)
        router.refresh()
      } else {
        toast('Đã lưu bản nháp CMS.')
      }
      setRetry((r) => r + 1)
    } catch (err) {
      const msg = (err as Error).message || 'Không thể lưu cấu hình CMS.'
      setError(msg)
      toast(msg, 'error')
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
      router.refresh()
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !form) return <Skeleton className="h-96" />
  if (!form) return <Notice tone="error">{error || 'Chưa thể tải nội dung website.'}</Notice>

  const activeWorkingDays = new Set(parseWorkingDays(form.workingDays))
  const hasDraftPendingPublish = Boolean(form.hasUnpublishedChanges || form._status === 'draft')

  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {publishSuccessMsg && <Notice tone="success">{publishSuccessMsg}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={hasDraftPendingPublish ? 'warning' : 'brand'}>
            {hasDraftPendingPublish ? 'Có bản nháp chưa xuất bản' : 'Đang xuất bản'}
          </Badge>
          {hasUnsavedChanges ? (
            <Badge tone="warning">● Có thay đổi chưa lưu</Badge>
          ) : (
            <Badge tone="brand">✓ Đã lưu</Badge>
          )}
          <ButtonLink
            href="/"
            prefetch={false}
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
            disabled={!canPublish}
            title={
              canPublish
                ? undefined
                : 'Tài khoản chưa được cấp quyền Xuất bản CMS; vui lòng Lưu bản nháp.'
            }
            onClick={() => void submitContent('published')}
          >
            Xuất bản lên website
          </Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-4 border-b border-line">
        <TabButton selected={tab === 'brand'} onClick={() => requestTabChange('brand')}>
          Thương hiệu & Trang chủ
        </TabButton>
        <TabButton selected={tab === 'hero'} onClick={() => requestTabChange('hero')}>
          Hero Carousel ({form.heroSlides.length})
        </TabButton>
        <TabButton selected={tab === 'hours'} onClick={() => requestTabChange('hours')}>
          Giờ làm việc & Nghỉ lễ
        </TabButton>
        <TabButton selected={tab === 'policies'} onClick={() => requestTabChange('policies')}>
          Liên hệ & Chính sách
        </TabButton>
        <TabButton selected={tab === 'faqs'} onClick={() => requestTabChange('faqs')}>
          FAQ ({form.faqs.length})
        </TabButton>
        <TabButton selected={tab === 'settings'} onClick={() => requestTabChange('settings')}>
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

      {tab === 'hero' && (
        <HeroCarouselEditor
          slides={form.heroSlides}
          savedSlides={savedForm?.heroSlides ?? []}
          autoplaySeconds={form.heroAutoplaySeconds}
          availableModels={form.availableModels}
          uploading={uploading}
          slideSaveStates={slideSaveStates}
          slideSaveErrors={slideSaveErrors}
          onAutoplayChange={(seconds) => setForm({ ...form, heroAutoplaySeconds: seconds })}
          onAddSlide={addSlide}
          onMoveSlide={moveSlide}
          onRemoveSlide={removeSlide}
          onUpdateSlide={updateSlideAt}
          onUploadSlideImage={uploadSlideImage}
          onSaveSlide={saveSingleSlide}
          onRevertSlide={revertSlide}
        />
      )}

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

            <div className="space-y-3 border-t border-line pt-4">
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

      <ConfirmDialog
        open={pendingAction !== null}
        title="Xác nhận rời khỏi nội dung đang chỉnh sửa"
        description={UNSAVED_WARNING_TEXT}
        confirmLabel="Tiếp tục rời khỏi"
        cancelLabel="Ở lại chỉnh sửa"
        onClose={() => setPendingAction(null)}
        onConfirm={confirmPendingLeave}
      />
    </div>
  )
}
