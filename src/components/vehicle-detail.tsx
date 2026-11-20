'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { GalleryKind, ModelView, SiteContent } from '@/lib/catalogue'
import type { FleetView, PublicLocationsPayload, Quote, ReviewView } from '@/lib/domain-types'
import { api, RequestError } from '@/lib/client-api'
import {
  CAR_PICKUP_PHOTO_TYPES,
  MOTORBIKE_PHOTO_TYPES,
  RENTAL_ADDONS,
  addDays,
  businessToday,
  calculateRollingPrice,
  formatDate,
  formatMoney,
  inquiryTypeLabels,
  isSpecApplicable,
  operationStatusLabels,
  subCategoryLabels,
  validateRentalDates,
  type AddonDefinition,
} from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import { FavoriteButton } from './favorite-button'
import { categoryLabels } from './vehicle-card'
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  Container,
  EmptyState,
  ExternalLink,
  Heading,
  IconButton,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  TabButton,
  Text,
  Textarea,
  cn,
} from './ui'
import { Icon } from './ui/icon'
import { Dialog } from './ui/dialog'

const AvailabilityCalendar = dynamic(
  () => import('./availability-calendar').then((m) => m.AvailabilityCalendar),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full rounded-card" />,
  },
)

type DetailTab =
  | 'overview'
  | 'specs'
  | 'features'
  | 'fleet'
  | 'pricing'
  | 'availability'
  | 'reviews'
  | 'support'
type ReviewsPayload = {
  reviews: ReviewView[]
  eligibleBookings: {
    id: string
    bookingKey: string
    reference: string
    startDate: string
    endDate: string
  }[]
}

const specGroupLabels: Record<string, string> = {
  OVERVIEW: 'Thông tin tổng quan',
  ENGINE: 'Động cơ & Hiệu suất vận hành',
  DIMENSIONS: 'Kích thước & Trọng lượng',
  CHASSIS: 'Khung gầm, Hệ thống phanh & Lốp',
  PICKUP: 'Thông số chuyên biệt xe bán tải',
  MOTORBIKE: 'Thông số chuyên biệt xe máy',
  EV: 'Pin, Năng lượng & Sạc (Xe điện)',
}

const photoTypeLabelMap: Record<string, string> = Object.fromEntries(
  [...CAR_PICKUP_PHOTO_TYPES, ...MOTORBIKE_PHOTO_TYPES].map((o) => [o.value, o.label]),
)

const featureCategoryLabels: Record<string, string> = {
  COMFORT: 'Tiện nghi nội thất & Sử dụng',
  TECHNOLOGY: 'Công nghệ & Giải trí',
  DRIVER_ASSIST: 'Hỗ trợ người lái (ADAS)',
  SAFETY: 'Hệ thống an toàn',
}

const galleryKindLabels: Record<GalleryKind, string> = {
  OVERVIEW: 'Tổng thể',
  EXTERIOR: 'Ngoại thất',
  INTERIOR: 'Nội thất',
  ENGINE: 'Động cơ',
  FEATURE: 'Chi tiết',
}

const pickupTimes = [
  '07:30',
  '08:00',
  '09:00',
  '10:00',
  '12:00',
  '14:00',
  '16:00',
  '18:00',
  '20:00',
]

export type VehicleDetailSiteInfo = Partial<
  Pick<
    SiteContent,
    | 'ageRequirement'
    | 'licenseRequirement'
    | 'depositPolicy'
    | 'cancellationPolicy'
    | 'phone'
    | 'email'
    | 'address'
    | 'openingHours'
    | 'workStartTime'
    | 'workEndTime'
    | 'lunchBreakStart'
    | 'lunchBreakEnd'
  >
>

export function VehicleDetail({
  model,
  address,
  site,
}: {
  model: ModelView
  address: string | null
  site?: VehicleDetailSiteInfo
}) {
  const [intent, setIntent] = useState<'rent' | 'buy'>('rent')
  const [galleryScope, setGalleryScope] = useState<'catalogue' | 'instance'>('catalogue')
  const [kind, setKind] = useState<GalleryKind | 'ALL'>('ALL')
  const [imageIndex, setImageIndex] = useState(0)
  const [mainImageReady, setMainImageReady] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [variantIndex, setVariantIndex] = useState(-1)
  const [colorIndex, setColorIndex] = useState(-1)
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  const [fleet, setFleet] = useState<FleetView[]>([])
  const [fleetLoading, setFleetLoading] = useState(true)
  const [fleetError, setFleetError] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [retry, setRetry] = useState(0)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [today, setToday] = useState('')
  const [pickupTime, setPickupTime] = useState('08:00')
  const [returnTime, setReturnTime] = useState('20:00')
  const [deliveryRequested, setDeliveryRequested] = useState(false)
  const [publicLocs, setPublicLocs] = useState<PublicLocationsPayload | null>(null)
  const [pickupBranchId, setPickupBranchId] = useState('')
  const [differentReturn, setDifferentReturn] = useState(false)
  const [returnBranchId, setReturnBranchId] = useState('')
  const [selectedAddons, setSelectedAddons] = useState<AddonDefinition['id'][]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [error, setError] = useState('')

  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryType, setInquiryType] = useState<
    'CONSULTATION' | 'QUOTE' | 'VIEWING' | 'TEST_DRIVE' | 'PURCHASE_REQUEST'
  >('CONSULTATION')
  const [paymentMethod, setPaymentMethod] = useState<'DIRECT' | 'INSTALLMENT' | 'CONSULT_FINANCE'>(
    'DIRECT',
  )
  const [preferredDate, setPreferredDate] = useState('')
  const [preferredLocation, setPreferredLocation] = useState('')
  const [inquiryBusy, setInquiryBusy] = useState(false)
  const [inquirySuccess, setInquirySuccess] = useState('')
  const [inquiryError, setInquiryError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [reviewsData, setReviewsData] = useState<ReviewsPayload>({
    reviews: [],
    eligibleBookings: [],
  })
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewBookingId, setReviewBookingId] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewSuccess, setReviewSuccess] = useState('')

  const touchStartX = useRef<number | null>(null)
  const { user, isCustomer, isAdmin } = useAuth()

  const catalogueQuery = new URLSearchParams({ intent })
  if (intent === 'rent' && startDate && endDate) {
    catalogueQuery.set('startDate', startDate)
    catalogueQuery.set('endDate', endDate)
  }
  const categoryQuery = new URLSearchParams(catalogueQuery)
  categoryQuery.set('type', model.category)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    setIntent(sp.get('intent') === 'buy' ? 'buy' : 'rent')
    setStartDate(sp.get('startDate') ?? '')
    setEndDate(sp.get('endDate') ?? '')
    const pBr = sp.get('pickupBranchId') ?? ''
    const rBr = sp.get('returnBranchId') ?? ''
    setPickupBranchId(pBr)
    setReturnBranchId(rBr)
    setDifferentReturn(Boolean(rBr && rBr !== pBr))
    setQuote(null)
    setError('')
  }, [model.id])

  useEffect(() => {
    let active = true
    api<PublicLocationsPayload>('/locations')
      .then((res) => {
        if (active) setPublicLocs(res)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setToday(businessToday())
    const thumbTimer = window.setTimeout(() => setMainImageReady(true), 4000)
    if (typeof window === 'undefined') {
      return () => window.clearTimeout(thumbTimer)
    }
    const hash = window.location.hash.replace('#', '')
    if (hash === 'specifications') setActiveTab('specs')
    else if (hash === 'actual-condition') setActiveTab('fleet')
    else if (hash === 'pricing-policy') setActiveTab('pricing')
    else if (hash === 'reviews') setActiveTab('reviews')
    return () => window.clearTimeout(thumbTimer)
  }, [])

  useEffect(() => {
    let active = true
    setFleetLoading(true)
    setFleetError('')
    api<FleetView[]>(`/fleet?model=${encodeURIComponent(model.id)}`)
      .then((result) => {
        if (active) {
          setFleet(result)
          setVehicleId(result[0]?.id ?? '')
        }
      })
      .catch((e) => {
        if (active) setFleetError(e.message)
      })
      .finally(() => {
        if (active) setFleetLoading(false)
      })
    return () => {
      active = false
    }
  }, [model.id, retry])

  useEffect(() => {
    let active = true
    setReviewsLoading(true)
    api<ReviewsPayload>(`/reviews?model=${encodeURIComponent(model.id)}`)
      .then((result) => {
        if (active) {
          setReviewsData(result)
          setReviewBookingId(result.eligibleBookings[0]?.id ?? '')
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReviewsLoading(false)
      })
    return () => {
      active = false
    }
  }, [model.id, user?.id])

  const selectedVehicle = fleet.find((v) => v.id === vehicleId) ?? null
  const eligible = fleet.filter((v) =>
    intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT',
  )

  const catalogueImages = useMemo(() => {
    const combined = [
      ...(model.cover
        ? [
            {
              image: model.cover,
              kind: 'EXTERIOR' as GalleryKind,
              photoType: 'OVERVIEW' as string | null,
              caption: `${model.name} — Ảnh đại diện catalogue`,
              sourceUrl: model.cover.sourceUrl ?? model.source ?? null,
              license: model.cover.license ?? null,
            },
          ]
        : []),
      ...model.gallery,
    ]
    return combined.filter(
      (g, index, all) => index === all.findIndex((v) => v.image.url === g.image.url),
    )
  }, [model.cover, model.gallery, model.name, model.source])

  const instanceImages = useMemo(() => {
    if (!selectedVehicle || !selectedVehicle.photos.length) return []
    return selectedVehicle.photos.map((p) => ({
      image: p.image,
      kind: (p.kind === 'INTERIOR' || p.kind === 'ENGINE' ? p.kind : 'EXTERIOR') as GalleryKind,
      photoType: p.photoType ?? 'ACTUAL',
      caption:
        p.caption ||
        `Xe ${selectedVehicle.reference}${selectedVehicle.color ? ` (${selectedVehicle.color})` : ''} — Ảnh thực tế`,
      sourceUrl: p.image.sourceUrl ?? null,
      license: p.image.license ?? null,
    }))
  }, [selectedVehicle])

  const effectiveScope =
    galleryScope === 'instance' && instanceImages.length > 0 ? 'instance' : 'catalogue'
  const baseScopedImages = effectiveScope === 'instance' ? instanceImages : catalogueImages

  const hasOverviewPhotos = baseScopedImages.some((g) => g.kind === 'OVERVIEW')
  const hasInteriorPhotos = baseScopedImages.some((g) => g.kind === 'INTERIOR')
  const hasEnginePhotos = baseScopedImages.some((g) => g.kind === 'ENGINE')
  const hasFeaturePhotos = baseScopedImages.some((g) => g.kind === 'FEATURE')

  const selectedVariant = variantIndex >= 0 ? model.variants[variantIndex] : null
  const variantColor = selectedVariant?.colors[colorIndex] ?? null

  const images =
    effectiveScope === 'catalogue' && variantColor
      ? variantColor.image
        ? [
            {
              image: variantColor.image,
              kind: 'EXTERIOR' as GalleryKind,
              photoType: 'EXTERIOR' as string | null,
              caption: `${selectedVariant?.name ?? ''} · Màu ${variantColor.name}`,
              sourceUrl: variantColor.sourceUrl ?? variantColor.image.sourceUrl ?? null,
              license: variantColor.image.license ?? null,
            },
          ]
        : []
      : kind === 'ALL'
        ? baseScopedImages
        : baseScopedImages.filter((g) => g.kind === kind)

  const safeIndex = images.length ? imageIndex % images.length : 0
  const currentItem = images[safeIndex] ?? null
  const currentImage = currentItem?.image ?? null

  const price = selectedVehicle
    ? intent === 'rent'
      ? selectedVehicle.pricePerDay
      : selectedVehicle.salePrice
    : null
  const fallbackPrice =
    intent === 'rent'
      ? (model.pricePerDay ?? model.referenceRentPrice)
      : (model.salePrice ?? model.listedPrice)
  const displayPrice = price ?? fallbackPrice
  const isDemoActive = selectedVehicle ? selectedVehicle.isDemo : model.hasDemoFleet
  const rentable = Boolean(
    selectedVehicle &&
    selectedVehicle.intent !== 'SALE' &&
    selectedVehicle.pricePerDay &&
    selectedVehicle.operationStatus !== 'MAINTENANCE' &&
    selectedVehicle.operationStatus !== 'SOLD' &&
    selectedVehicle.operationStatus !== 'INACTIVE' &&
    selectedVehicle.operationStatus !== 'RESERVED',
  )

  const rollingBreakdown = useMemo(() => {
    const saleBase = selectedVehicle?.salePrice ?? model.listedPrice
    if (!saleBase) return null
    return calculateRollingPrice(
      saleBase,
      model.category,
      model.fuelType,
      selectedVehicle ? selectedVehicle.vehicleConditionType === 'NEW' : true,
    )
  }, [selectedVehicle, model.listedPrice, model.category, model.fuelType])

  const relevantAddons = useMemo(() => {
    return Object.values(RENTAL_ADDONS).filter((a) => {
      if (model.category === 'MOTORBIKE' && a.id === 'CHILD_SEAT') return false
      if (model.category !== 'MOTORBIKE' && a.id === 'EXTRA_HELMET') return false
      return true
    })
  }, [model.category])

  const groupedSpecs = useMemo(() => {
    const groups = new Map<string, typeof model.specifications>()
    for (const s of model.specifications) {
      if (!isSpecApplicable(s.label, model.fuelType)) continue
      const list = groups.get(s.group) ?? []
      list.push(s)
      groups.set(s.group, list)
    }
    return [...groups.entries()]
  }, [model.specifications, model.fuelType])

  const groupedFeatures = useMemo(() => {
    const groups = new Map<string, typeof model.features>()
    for (const f of model.features) {
      if (f.status && f.status !== 'EQUIPPED') continue
      const list = groups.get(f.category) ?? []
      list.push(f)
      groups.set(f.category, list)
    }
    return [...groups.entries()]
  }, [model.features])

  useEffect(() => {
    setVehicleId((current) =>
      fleet.some(
        (v) => v.id === current && (intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT'),
      )
        ? current
        : (fleet.find((v) => (intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT'))?.id ??
          ''),
    )
    setQuote(null)
  }, [fleet, intent])

  function datesChanged(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    setQuote(null)
    setError('')
  }

  function toggleAddon(addonId: AddonDefinition['id']) {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId],
    )
    setQuote(null)
  }

  async function checkAvailability(e: FormEvent) {
    e.preventDefault()
    const validation = validateRentalDates(startDate, endDate)
    if (validation.error) {
      setError(validation.error)
      return
    }
    if (!rentable) {
      setError('Thông tin xe thực tế hoặc giá thuê chưa được cập nhật.')
      return
    }
    setQuoteLoading(true)
    setError('')
    setQuote(null)
    try {
      const qParams = new URLSearchParams({
        vehicle: selectedVehicle!.id,
        startDate,
        endDate,
        pickupTime,
        returnTime,
      })
      if (pickupBranchId) qParams.set('pickupBranchId', pickupBranchId)
      if (differentReturn && returnBranchId && returnBranchId !== pickupBranchId) {
        qParams.set('returnBranchId', returnBranchId)
      }
      if (deliveryRequested) qParams.set('delivery', '1')
      if (selectedAddons.length) qParams.set('addons', selectedAddons.join(','))
      const result = await api<Quote>(`/availability?${qParams}`)
      setQuote(result)
      if (!result.available)
        setError(result.reason || 'Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày khác.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setQuoteLoading(false)
    }
  }

  function openInquiryModal(
    type: 'CONSULTATION' | 'QUOTE' | 'VIEWING' | 'TEST_DRIVE' | 'PURCHASE_REQUEST',
  ) {
    setInquiryType(type)
    setInquiryError('')
    setInquirySuccess('')
    setFieldErrors({})
    setInquiryOpen(true)
  }

  async function sendInquiry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isCustomer || !user) return
    const form = new FormData(e.currentTarget)
    setInquiryBusy(true)
    setInquiryError('')
    setFieldErrors({})
    try {
      const result = await api<{ reference: string }>('/inquiries', {
        method: 'POST',
        body: JSON.stringify({
          model: model.id,
          inquiryType,
          vehicle: selectedVehicle?.intent !== 'RENT' ? selectedVehicle?.id : undefined,
          variantName: selectedVariant?.name ?? selectedVehicle?.version ?? undefined,
          colorName: variantColor?.name ?? selectedVehicle?.color ?? undefined,
          paymentMethod,
          preferredDate: preferredDate || undefined,
          preferredLocation: preferredLocation || undefined,
          phone: form.get('phone'),
          note: form.get('note'),
        }),
      })
      setInquirySuccess(result.reference)
    } catch (e) {
      setInquiryError((e as Error).message)
      if (e instanceof RequestError) setFieldErrors(e.fields)
    } finally {
      setInquiryBusy(false)
    }
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault()
    if (!reviewBookingId) return
    setReviewBusy(true)
    setReviewError('')
    setReviewSuccess('')
    try {
      const created = await api<ReviewView>('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          booking: reviewBookingId,
          model: model.id,
          rating: reviewRating,
          title: reviewTitle,
          comment: reviewComment,
        }),
      })
      setReviewsData((prev) => ({
        reviews: [created, ...prev.reviews],
        eligibleBookings: prev.eligibleBookings.filter((b) => b.id !== reviewBookingId),
      }))
      setReviewTitle('')
      setReviewComment('')
      setReviewSuccess('Cảm ơn bạn đã chia sẻ đánh giá cho chuyến đi.')
    } catch (e) {
      setReviewError((e as Error).message)
    } finally {
      setReviewBusy(false)
    }
  }

  const checkoutUrl = selectedVehicle
    ? `/checkout?${new URLSearchParams({
        vehicle: selectedVehicle.id,
        startDate,
        endDate,
        pickupTime,
        returnTime,
        ...(pickupBranchId ? { pickupBranchId } : {}),
        ...(differentReturn && returnBranchId && returnBranchId !== pickupBranchId
          ? { returnBranchId }
          : {}),
        ...(deliveryRequested ? { delivery: '1' } : {}),
        ...(selectedAddons.length ? { addons: selectedAddons.join(',') } : {}),
      })}`
    : '/checkout'

  const subLabel =
    (model.subCategory ? subCategoryLabels[model.subCategory] : null) ??
    model.bodyStyle ??
    categoryLabels[model.category]

  const averageRating = reviewsData.reviews.length
    ? (
        reviewsData.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsData.reviews.length
      ).toFixed(1)
    : null

  return (
    <main id="main-content" className="pb-24 lg:pb-16">
      <Container>
        <nav
          aria-label="Đường dẫn"
          className="flex flex-wrap items-center gap-2 py-6 text-caption text-muted"
        >
          <NoriLink href="/">Trang chủ</NoriLink>
          <Icon name="chevron-right" className="size-3" />
          <NoriLink href={`/vehicles?${categoryQuery}`}>{categoryLabels[model.category]}</NoriLink>
          <Icon name="chevron-right" className="size-3" />
          <Text as="span" className="text-ink">
            {model.name}
          </Text>
        </nav>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="brand">{model.brand}</Badge>
              <Badge>{subLabel}</Badge>
              {model.modelYear && <Badge>Đời {model.modelYear}</Badge>}
              <Badge>Catalogue</Badge>
              {model.hasDemoFleet && <Badge tone="brand">Có xe thực tế (DEMO)</Badge>}
            </div>
            <Heading as="h1" size="display">
              {model.officialName || model.name}
            </Heading>
            {(model.versionName || model.generation || model.segment || model.origin) && (
              <Text className="mt-2 text-small text-muted">
                {[
                  model.versionName ? `Phiên bản: ${model.versionName}` : null,
                  model.generation ? `Thế hệ: ${model.generation}` : null,
                  model.segment,
                  model.origin ? `Xuất xứ: ${model.origin}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </div>
          <NoriLink
            href={`/vehicles?${catalogueQuery}`}
            className="flex min-h-touch items-center gap-2 text-small font-medium"
          >
            <Icon name="arrow-left" className="size-4" />
            Khám phá xe khác
          </NoriLink>
        </div>

        <div className="mb-7 grid grid-cols-2 gap-3 rounded-card border border-line bg-subtle p-4 sm:grid-cols-4">
          {[
            ['Số chỗ ngồi', model.seats ? `${model.seats} chỗ` : 'Chưa cập nhật'],
            ['Nhiên liệu / Năng lượng', model.fuelType ?? 'Chưa cập nhật'],
            ['Hộp số', model.transmission ?? 'Chưa cập nhật'],
            ['Niêm yết tham khảo từ', formatMoney(model.listedPrice)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <Text className="text-micro text-muted">{label}</Text>
              <Text className="mt-1 truncate text-small font-semibold text-ink">{value}</Text>
            </div>
          ))}
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            {/* Image Gallery */}
            <section
              aria-label="Bộ ảnh catalogue"
              tabIndex={0}
              onKeyDown={(e) => {
                if (images.length < 2) return
                if (e.key === 'ArrowLeft') {
                  setImageIndex((safeIndex - 1 + images.length) % images.length)
                  setColorIndex(-1)
                } else if (e.key === 'ArrowRight') {
                  setImageIndex((safeIndex + 1) % images.length)
                  setColorIndex(-1)
                }
              }}
              className="rounded-card focus-visible:outline-2"
            >
              <div
                className="relative flex h-gallery-mobile items-center justify-center overflow-hidden rounded-card bg-subtle md:h-gallery"
                onTouchStart={(e) => {
                  touchStartX.current = e.changedTouches[0]?.clientX ?? null
                }}
                onTouchEnd={(e) => {
                  if (touchStartX.current == null || images.length < 2) return
                  const delta = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
                  if (Math.abs(delta) > 40) {
                    setImageIndex(
                      delta < 0
                        ? (safeIndex + 1) % images.length
                        : (safeIndex - 1 + images.length) % images.length,
                    )
                    setColorIndex(-1)
                  }
                  touchStartX.current = null
                }}
              >
                {currentImage ? (
                  <Image
                    src={currentImage.url}
                    alt={currentImage.alt}
                    fill
                    sizes="(max-width: 1023px) 100vw, 66vw"
                    loading="eager"
                    fetchPriority="high"
                    decoding="sync"
                    preload
                    onLoad={() => setMainImageReady(true)}
                    onError={() => setMainImageReady(true)}
                    className="object-cover"
                  />
                ) : (
                  <div className="px-6 text-center">
                    <Icon name="car" className="mx-auto mb-4 size-14 text-muted/40" />
                    <Text className="text-small text-muted">
                      {kind === 'INTERIOR'
                        ? 'Chưa cập nhật ảnh nội thất'
                        : variantColor
                          ? 'Chưa cập nhật ảnh đúng phiên bản và màu sắc'
                          : 'Chưa cập nhật hình ảnh'}
                    </Text>
                  </div>
                )}
                <Badge tone="inverse" className="absolute left-4 top-4 max-w-[calc(100%-6rem)]">
                  <Icon name="info" className="size-3 shrink-0" />
                  <span className="truncate">
                    {effectiveScope === 'instance' && selectedVehicle
                      ? `Ảnh thực tế xe ${selectedVehicle.reference}${selectedVehicle.isDemo ? ' (DEMO)' : ''}`
                      : 'Ảnh Catalogue – không phải hình ảnh của cá thể xe đang cho thuê.'}
                  </span>
                </Badge>
                {currentItem?.photoType && photoTypeLabelMap[currentItem.photoType] && (
                  <Badge tone="inverse" className="absolute bottom-4 left-4">
                    {photoTypeLabelMap[currentItem.photoType]}
                  </Badge>
                )}
                <FavoriteButton
                  slug={model.slug}
                  name={model.name}
                  className="absolute right-4 top-4 z-10"
                />
                {currentImage && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setZoomed(false)
                      setGalleryOpen(true)
                    }}
                    className="absolute bottom-4 right-4 min-h-control-sm gap-2 bg-canvas/95 px-3 py-2 text-caption"
                  >
                    <Icon name="grid" className="size-3.5" />
                    Xem ảnh lớn
                  </Button>
                )}
              </div>

              {instanceImages.length > 0 && selectedVehicle && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-subtle p-2">
                  <Button
                    size="sm"
                    variant={effectiveScope === 'catalogue' ? 'primary' : 'ghost'}
                    onClick={() => {
                      setGalleryScope('catalogue')
                      setKind('ALL')
                      setImageIndex(0)
                    }}
                  >
                    Ảnh Catalogue ({catalogueImages.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={effectiveScope === 'instance' ? 'primary' : 'ghost'}
                    onClick={() => {
                      setGalleryScope('instance')
                      setKind('ALL')
                      setImageIndex(0)
                    }}
                  >
                    Ảnh thực tế xe {selectedVehicle.reference} ({instanceImages.length})
                  </Button>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['ALL', `Tất cả (${baseScopedImages.length})`],
                      ...(hasOverviewPhotos ? ([['OVERVIEW', 'Tổng thể']] as const) : []),
                      ['EXTERIOR', 'Ngoại thất'],
                      ...(model.category !== 'MOTORBIKE' || hasInteriorPhotos
                        ? ([['INTERIOR', 'Nội thất']] as const)
                        : []),
                      ...(hasEnginePhotos
                        ? ([
                            [
                              'ENGINE',
                              model.fuelType === 'Điện (EV)' ? 'Pin & Động cơ' : 'Động cơ',
                            ],
                          ] as const)
                        : []),
                      ...(hasFeaturePhotos ? ([['FEATURE', 'Chi tiết']] as const) : []),
                    ] as const
                  ).map(([k, label]) => (
                    <Button
                      key={k}
                      variant={kind === k && !variantColor ? 'dark' : 'secondary'}
                      aria-pressed={kind === k && !variantColor}
                      onPointerEnter={() => {
                        const firstForKind =
                          k === 'ALL'
                            ? baseScopedImages[0]?.image
                            : baseScopedImages.find((item) => item.kind === k)?.image
                        if (firstForKind?.url && typeof window !== 'undefined') {
                          const preloadImg = new window.Image()
                          preloadImg.src = firstForKind.url.includes('?')
                            ? firstForKind.url
                            : `${firstForKind.url}?w=1080&q=75`
                        }
                      }}
                      onClick={() => {
                        startTransition(() => {
                          setKind(k)
                          setImageIndex(0)
                          setColorIndex(-1)
                        })
                      }}
                      className="min-h-control-sm px-3.5 py-2 text-caption"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Text className="text-caption text-muted">
                    {images.length ? `${safeIndex + 1} / ${images.length}` : 'Chưa cập nhật'}
                  </Text>
                  <IconButton
                    icon="chevron-left"
                    label="Ảnh trước"
                    className="size-control-sm"
                    disabled={images.length < 2}
                    onClick={() => {
                      setImageIndex((safeIndex - 1 + images.length) % images.length)
                      setColorIndex(-1)
                    }}
                  />
                  <IconButton
                    icon="chevron-right"
                    label="Ảnh tiếp theo"
                    className="size-control-sm"
                    disabled={images.length < 2}
                    onClick={() => {
                      setImageIndex((safeIndex + 1) % images.length)
                      setColorIndex(-1)
                    }}
                  />
                </div>
              </div>

              {images.length > 1 && (
                <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                  {images.map((item, idx) => (
                    <button
                      key={`${item.image.url}-${idx}`}
                      type="button"
                      onClick={() => setImageIndex(idx)}
                      aria-label={`Chọn ảnh ${idx + 1}: ${item.caption ?? item.image.alt}`}
                      aria-pressed={idx === safeIndex}
                      className={cn(
                        'relative h-16 w-24 shrink-0 overflow-hidden rounded-control border-2 bg-subtle transition-all',
                        idx === safeIndex
                          ? 'border-brand ring-2 ring-focus/20'
                          : 'border-transparent opacity-75 hover:opacity-100',
                      )}
                    >
                      {(mainImageReady || idx === safeIndex) && (
                        <Image
                          src={item.image.url}
                          alt={item.image.alt}
                          fill
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                          sizes="96px"
                          className="object-cover"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {currentItem && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-micro text-muted">
                  <Text>{currentItem.caption ?? currentImage?.alt}</Text>
                  {currentItem.sourceUrl && /^https:\/\//.test(currentItem.sourceUrl) && (
                    <ExternalLink href={currentItem.sourceUrl} target="_blank">
                      Nguồn ảnh{currentItem.license ? ` (${currentItem.license})` : ''}
                    </ExternalLink>
                  )}
                </div>
              )}
            </section>

            {/* Variant & Color Selector */}
            <div className="mt-7 rounded-card border border-line p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                {model.variants.length ? (
                  <>
                    <Select
                      id="model-variant"
                      label="Phiên bản catalogue"
                      value={variantIndex}
                      onChange={(e) => {
                        setVariantIndex(Number(e.target.value))
                        setColorIndex(-1)
                        setImageIndex(0)
                      }}
                    >
                      <option value={-1}>Chọn phiên bản</option>
                      {model.variants.map((v, i) => (
                        <option value={i} key={v.name}>
                          {v.name}
                          {v.listedPrice ? ` — ${formatMoney(v.listedPrice)}` : ''}
                        </option>
                      ))}
                    </Select>
                    <div>
                      <Text className="mb-2 text-small font-medium">Màu catalogue</Text>
                      <div className="flex flex-wrap gap-2">
                        {selectedVariant?.colors.map((c, i) => (
                          <Button
                            key={c.name}
                            size="sm"
                            aria-pressed={colorIndex === i}
                            onClick={() => {
                              setColorIndex(i)
                              setKind('EXTERIOR')
                              setImageIndex(0)
                            }}
                            variant={colorIndex === i ? 'primary' : 'secondary'}
                          >
                            {c.hex && (
                              <span
                                aria-hidden="true"
                                className="size-3 rounded-pill border border-line"
                                style={{ backgroundColor: c.hex }}
                              />
                            )}
                            {c.name}
                          </Button>
                        )) ?? (
                          <Text className="py-2 text-small text-muted">Chọn phiên bản trước</Text>
                        )}
                        {selectedVariant && !selectedVariant.colors.length && (
                          <Text className="py-2 text-small text-muted">
                            Chưa cập nhật màu của phiên bản này
                          </Text>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Text className="mb-2 text-caption text-muted">Phiên bản catalogue</Text>
                      <Text className="font-medium">Chưa cập nhật</Text>
                    </div>
                    <div>
                      <Text className="mb-2 text-caption text-muted">Màu sắc đã xác thực</Text>
                      <Text className="font-medium">Chưa cập nhật</Text>
                    </div>
                  </>
                )}
              </div>
              {selectedVariant && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-caption text-muted">
                  <Text>
                    <strong className="text-ink">{selectedVariant.name}</strong>
                    {selectedVariant.summary ? ` — ${selectedVariant.summary}` : ''}
                  </Text>
                  {selectedVariant.listedPrice && (
                    <Badge tone="brand">
                      Niêm yết tham khảo: {formatMoney(selectedVariant.listedPrice)}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Detail Section Tabs - Sticky bar with elegant styling & no crude scrollbars */}
            <div className="sticky top-[4.75rem] z-20 -mx-5 mb-2 bg-canvas/95 px-5 py-2 backdrop-blur-md transition-all sm:mx-0 sm:px-0">
              <div
                role="tablist"
                aria-label="Nội dung chi tiết phương tiện"
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-line pb-px scroll-smooth"
              >
                {(
                  [
                    ['overview', 'overview', 'Tổng quan & Thiết kế'],
                    ['specs', 'specifications', 'Thông số kỹ thuật'],
                    ['features', 'features-safety', 'Công nghệ & An toàn'],
                    ['fleet', 'actual-condition', `Xe thực tế & ODO (${fleet.length})`],
                    ['pricing', 'pricing-policy', 'Giá & Chính sách'],
                    ['availability', 'availability', 'Lịch khả dụng'],
                    ['reviews', 'reviews', `Đánh giá (${reviewsData.reviews.length})`],
                    ['support', 'support', 'Liên hệ & Hỗ trợ'],
                  ] as const
                ).map(([tabKey, panelId, tabLabel]) => (
                  <TabButton
                    key={tabKey}
                    id={`tab-${tabKey}`}
                    aria-controls={activeTab === tabKey ? panelId : undefined}
                    selected={activeTab === tabKey}
                    onClick={() => startTransition(() => setActiveTab(tabKey))}
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded-t-control px-3.5 py-3 text-caption sm:text-small font-semibold transition-all',
                      activeTab === tabKey
                        ? 'border-b-2 border-brand bg-brand-soft/60 text-brand'
                        : 'border-b-2 border-transparent text-muted hover:bg-subtle hover:text-ink',
                    )}
                  >
                    {tabLabel}
                  </TabButton>
                ))}
              </div>
            </div>

            {/* Tab 1: Overview & Design */}
            {activeTab === 'overview' && (
              <section
                id="overview"
                role="tabpanel"
                aria-labelledby="tab-overview"
                className="py-7"
              >
                <Heading size="title">Tổng quan về {model.name}</Heading>
                <Text className="mt-4 whitespace-pre-line leading-loose text-muted">
                  {model.description || 'Thông tin giới thiệu đang được cập nhật.'}
                </Text>

                {(model.suitableFor || model.usagePurpose || model.colorsSummary) && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {(model.suitableFor || model.usagePurpose) && (
                      <div className="rounded-control bg-soft p-4">
                        <Text className="text-caption font-semibold uppercase tracking-wider text-brand">
                          Đối tượng & nhu cầu phù hợp
                        </Text>
                        <Text className="mt-1 text-small text-ink">
                          {[model.suitableFor, model.usagePurpose].filter(Boolean).join(' · ')}
                        </Text>
                      </div>
                    )}
                    {model.colorsSummary && (
                      <div className="rounded-control bg-subtle p-4">
                        <Text className="text-caption font-semibold uppercase tracking-wider text-muted">
                          Bảng màu tiêu chuẩn
                        </Text>
                        <Text className="mt-1 text-small text-ink">{model.colorsSummary}</Text>
                      </div>
                    )}
                  </div>
                )}

                {model.highlights.length > 0 && (
                  <div className="mt-6">
                    <Heading as="h3" size="subtitle">
                      Điểm nổi bật
                    </Heading>
                    <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                      {model.highlights.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2.5 rounded-control border border-line p-3.5 text-small"
                        >
                          <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {[
                    ['Ngoại thất', model.exteriorOverview],
                    model.category === 'MOTORBIKE'
                      ? ['Thiết kế yên & tiện ích', model.interiorOverview]
                      : ['Nội thất & Tiện nghi', model.interiorOverview],
                    ['Động cơ & Vận hành', model.engineOverview],
                  ].map(
                    ([heading, text]) =>
                      text && (
                        <div key={heading} className="rounded-card bg-subtle p-4">
                          <Heading as="h3" size="body" className="text-ink">
                            {heading}
                          </Heading>
                          <Text className="mt-2 text-small leading-relaxed text-muted">{text}</Text>
                        </div>
                      ),
                  )}
                </div>

                <Notice className="mt-6">
                  Catalogue giới thiệu dòng xe, không cam kết phiên bản, màu sắc hay tình trạng của
                  một chiếc xe cụ thể. Vui lòng xem mục “Xe thực tế & ODO” trước khi đặt thuê hoặc
                  mua.
                </Notice>
              </section>
            )}

            {/* Tab 2: Specifications */}
            {activeTab === 'specs' && (
              <section
                id="specifications"
                role="tabpanel"
                aria-labelledby="tab-specs"
                className="py-7"
              >
                <Heading size="title">Thông số kỹ thuật chi tiết</Heading>
                <Text className="mb-5 mt-2 text-small text-muted">
                  Chỉ hiển thị thông số có nguồn và phiên bản áp dụng.
                </Text>
                {groupedSpecs.length ? (
                  <div className="space-y-6">
                    {groupedSpecs.map(([groupKey, items]) => (
                      <div key={groupKey} className="rounded-card border border-line p-5">
                        <Heading as="h3" size="subtitle" className="mb-3 text-brand">
                          {specGroupLabels[groupKey] ?? groupKey}
                        </Heading>
                        <dl className="divide-y divide-line">
                          {items.map((s, i) => (
                            <div
                              key={`${s.label}-${i}`}
                              className="grid gap-2 py-3 sm:grid-cols-2 sm:gap-4"
                            >
                              <dt className="text-small text-muted">{s.label}</dt>
                              <dd className="text-small font-medium text-ink">
                                {s.value}
                                {s.source && (
                                  <Text className="mt-0.5 text-micro font-normal text-muted">
                                    Nguồn: {s.source}
                                    {s.variantName ? ` (${s.variantName})` : ''}
                                  </Text>
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text className="text-small text-muted">Chưa cập nhật thông số kỹ thuật.</Text>
                )}
              </section>
            )}

            {/* Tab 3: Features & Safety */}
            {activeTab === 'features' && (
              <section
                id="features-safety"
                role="tabpanel"
                aria-labelledby="tab-features"
                className="py-7"
              >
                <Heading size="title">Trang bị tiện nghi & Hệ thống an toàn</Heading>
                <Text className="mb-5 mt-2 text-small text-muted">
                  Trang bị có thể thay đổi theo từng phiên bản cụ thể.
                </Text>
                {groupedFeatures.length ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {groupedFeatures.map(([catKey, items]) => (
                      <div key={catKey} className="rounded-card border border-line p-5">
                        <Heading as="h3" size="subtitle" className="mb-3">
                          {featureCategoryLabels[catKey] ?? catKey}
                        </Heading>
                        <ul className="space-y-2.5">
                          {items.map((f, idx) => (
                            <li
                              key={`${f.name}-${idx}`}
                              className="flex items-start gap-2.5 text-small"
                            >
                              <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-brand" />
                              <div>
                                <span>{f.name}</span>
                                {f.variantNote && (
                                  <Badge tone="muted" className="ml-2">
                                    {f.variantNote}
                                  </Badge>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="shield"
                    title="Chưa cập nhật danh sách trang bị"
                    description="Thông tin chi tiết về tiện nghi và an toàn của dòng xe này đang được bổ sung."
                  />
                )}
              </section>
            )}

            {/* Tab 4: Actual Fleet & ODO */}
            {activeTab === 'fleet' && (
              <section
                id="actual-condition"
                role="tabpanel"
                aria-labelledby="tab-fleet"
                className="py-7"
              >
                <Heading size="title">Tình trạng phương tiện thực tế</Heading>
                <Text className="mb-5 mt-2 text-small text-muted">
                  ODO, phiên bản, tình trạng bảo dưỡng và giá được gắn với từng chiếc xe cụ thể,
                  tách biệt khỏi catalogue.
                </Text>
                {fleetLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                  </div>
                ) : fleet.length ? (
                  <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-2">
                      {fleet.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setVehicleId(item.id)
                            setQuote(null)
                          }}
                          className={cn(
                            'rounded-card border p-4 text-left transition-colors',
                            item.id === selectedVehicle?.id
                              ? 'border-brand bg-brand-soft'
                              : 'border-line bg-canvas hover:border-brand/50',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Text className="font-semibold text-ink">{item.reference}</Text>
                            <div className="flex items-center gap-1.5">
                              {item.isDemo && <Badge tone="warning">DEMO</Badge>}
                              <StatusBadge status={item.operationStatus} />
                            </div>
                          </div>
                          <Text className="mt-1 text-caption text-muted">
                            {item.version || 'Chưa cập nhật'} · {item.color || 'Chưa rõ màu'}
                          </Text>
                          <div className="mt-2 flex flex-wrap gap-3 text-caption">
                            {item.pricePerDay && (
                              <span className="font-semibold text-brand">
                                Thuê: {formatMoney(item.pricePerDay)}/ngày
                              </span>
                            )}
                            {item.salePrice && (
                              <span className="font-semibold text-ink">
                                Bán: {formatMoney(item.salePrice)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedVehicle && (
                      <div className="space-y-5">
                        {selectedVehicle.isDemo && (
                          <Notice>
                            <strong>Dữ liệu minh họa (DEMO):</strong> Hồ sơ xe{' '}
                            {selectedVehicle.reference}, ODO, giá thuê/bán và lịch bảo dưỡng dưới
                            đây phục vụ trải nghiệm và kiểm thử đầy đủ quy trình thuê và mua xe trên
                            NORI.
                          </Notice>
                        )}
                        <dl className="grid grid-cols-2 gap-5 rounded-card bg-subtle p-5 sm:grid-cols-3">
                          {[
                            ['Mã quản lý xe', selectedVehicle.reference],
                            [
                              'Loại xe',
                              selectedVehicle.vehicleConditionType === 'NEW'
                                ? 'Xe mới'
                                : 'Xe đã qua sử dụng',
                            ],
                            ['Năm sản xuất', selectedVehicle.manufactureYear ?? 'Chưa cập nhật'],
                            [
                              'ODO thực tế',
                              selectedVehicle.odometer == null
                                ? 'Chưa cập nhật'
                                : `${new Intl.NumberFormat('vi-VN').format(selectedVehicle.odometer)} km`,
                            ],
                            ['Phiên bản thực tế', selectedVehicle.version],
                            ['Màu sắc thực tế', selectedVehicle.color],
                            [
                              'Trạng thái',
                              operationStatusLabels[selectedVehicle.operationStatus] ??
                                selectedVehicle.operationStatus,
                            ],
                            [
                              'Kiểm tra gần nhất',
                              selectedVehicle.inspectedAt
                                ? formatDate(selectedVehicle.inspectedAt)
                                : null,
                            ],
                            ['Khu vực', selectedVehicle.location],
                          ].map(([label, value]) => (
                            <div key={String(label)}>
                              <dt className="mb-1 text-caption text-muted">{label}</dt>
                              <dd className="break-words text-small font-medium">
                                {value || 'Chưa cập nhật'}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <div className="grid gap-4 rounded-card border border-line p-5 sm:grid-cols-2">
                          {[
                            ['Tình trạng tổng quát', selectedVehicle.condition],
                            ['Ngoại thất', selectedVehicle.exteriorCondition],
                            [
                              model.category === 'MOTORBIKE' ? 'Yên & thân vỏ' : 'Nội thất',
                              selectedVehicle.interiorCondition,
                            ],
                            ['Động cơ & vận hành', selectedVehicle.engineCondition],
                            ['Lịch sử bảo dưỡng', selectedVehicle.maintenanceHistory],
                            ['Điểm nhận & trả xe', selectedVehicle.pickupLocation],
                          ].map(([label, value]) => (
                            <div key={String(label)}>
                              <Text className="text-caption font-medium text-muted">{label}</Text>
                              <Text className="mt-1 text-small text-ink">
                                {value || 'Chưa cập nhật'}
                              </Text>
                            </div>
                          ))}
                        </div>

                        {selectedVehicle.photos.length ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            {selectedVehicle.photos.map((p, i) => (
                              <figure key={`${p.image.url}-${i}`}>
                                <div className="relative aspect-vehicle overflow-hidden rounded-card bg-subtle">
                                  <Image
                                    src={p.image.url}
                                    alt={p.image.alt}
                                    fill
                                    sizes="(max-width: 767px) 100vw, 33vw"
                                    className="object-cover"
                                  />
                                  <Badge tone="inverse" className="absolute left-3 top-3">
                                    {selectedVehicle.isDemo
                                      ? 'Ảnh minh họa (DEMO)'
                                      : 'Ảnh xe thực tế'}
                                  </Badge>
                                </div>
                                <figcaption className="mt-2 text-caption text-muted">
                                  {p.caption || selectedVehicle.reference}
                                </figcaption>
                              </figure>
                            ))}
                          </div>
                        ) : (
                          <Text className="text-small text-muted">
                            Ảnh xe thực tế riêng: Chưa cập nhật (đang sử dụng ảnh catalogue làm tham
                            khảo trực quan).
                          </Text>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon="car"
                    title="Chưa công bố xe thực tế"
                    description="Chưa cập nhật ODO, phiên bản, màu sắc và tình trạng thực tế. NORI không sử dụng ảnh catalogue để thay thế thông tin này."
                  />
                )}
              </section>
            )}

            {/* Tab 5: Pricing & Policies */}
            {activeTab === 'pricing' && (
              <section
                id="pricing-policy"
                role="tabpanel"
                aria-labelledby="tab-pricing"
                className="space-y-6 py-7"
              >
                <Heading size="title">Bảng giá & Chính sách dịch vụ</Heading>
                {selectedVehicle ? (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="rounded-card border border-line p-5">
                      <Heading as="h3" size="subtitle" className="mb-3 text-brand">
                        Bảng giá thuê ({selectedVehicle.reference})
                      </Heading>
                      <dl className="divide-y divide-line text-small">
                        {[
                          [
                            'Giá thuê theo giờ (tham khảo)',
                            formatMoney(selectedVehicle.pricePerHour),
                          ],
                          ['Giá thuê theo ngày', formatMoney(selectedVehicle.pricePerDay)],
                          ['Giá tham khảo theo tuần', formatMoney(selectedVehicle.pricePerWeek)],
                          ['Giá tham khảo theo tháng', formatMoney(selectedVehicle.pricePerMonth)],
                          [
                            'Phụ phí cuối tuần (T7–CN)',
                            formatMoney(selectedVehicle.weekendSurcharge),
                          ],
                          ['Phụ phí ngày lễ', formatMoney(selectedVehicle.holidaySurcharge)],
                          [
                            'Tiền đặt cọc đảm bảo (hoàn trả)',
                            formatMoney(selectedVehicle.depositAmount),
                          ],
                          ['Phí giao nhận tận nơi', formatMoney(selectedVehicle.deliveryFee)],
                          [
                            'Giới hạn quãng đường / ngày',
                            selectedVehicle.kmLimitPerDay
                              ? `${selectedVehicle.kmLimitPerDay} km/ngày`
                              : 'Không giới hạn',
                          ],
                          ['Phí vượt km', formatMoney(selectedVehicle.overKmFee)],
                          ['Phí trả trễ / giờ', formatMoney(selectedVehicle.lateReturnFeePerHour)],
                        ].map(([k, v]) => (
                          <div key={String(k)} className="flex justify-between gap-3 py-2.5">
                            <dt className="text-muted">{k}</dt>
                            <dd className="font-semibold text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <Text className="mt-3 text-micro text-muted">
                        Ưu đãi thuê dài ngày: hệ thống áp dụng mức có lợi nhất giữa chiết khấu
                        5%/12% và gói giá tuần/tháng của từng xe (từ 7 hoặc 30 ngày). Hợp đồng tính
                        theo ngày nguyên kèm thời gian chuẩn bị kỹ thuật giữa hai chuyến (không tự
                        động tính thuê theo giờ trên web).
                      </Text>
                    </div>

                    <div className="rounded-card border border-line p-5">
                      <Heading as="h3" size="subtitle" className="mb-3">
                        Giá mua & Dự toán lăn bánh
                      </Heading>
                      <dl className="divide-y divide-line text-small">
                        {[
                          [
                            'Giá niêm yết tham khảo hãng',
                            formatMoney(selectedVehicle.listedPrice ?? model.listedPrice),
                          ],
                          ['Giá bán tại NORI', formatMoney(selectedVehicle.salePrice)],
                          [
                            'Khoản đặt cọc giữ xe mua',
                            formatMoney(selectedVehicle.reservationDeposit),
                          ],
                          [
                            'Chính sách bảo hành',
                            selectedVehicle.warrantyPolicy ?? 'Chưa cập nhật',
                          ],
                          ...(rollingBreakdown
                            ? [
                                [
                                  `Lệ phí trước bạ (${Math.round(rollingBreakdown.registrationTaxRate * 100)}%)`,
                                  formatMoney(rollingBreakdown.registrationTax),
                                ],
                                [
                                  'Phí cấp biển số tham khảo',
                                  formatMoney(rollingBreakdown.plateFee),
                                ],
                                [
                                  'Đăng kiểm & Bảo trì đường bộ',
                                  rollingBreakdown.inspectionAndRoadFee
                                    ? formatMoney(rollingBreakdown.inspectionAndRoadFee)
                                    : 'Không áp dụng',
                                ],
                                [
                                  'Bảo hiểm TNDS bắt buộc',
                                  formatMoney(rollingBreakdown.civilInsuranceFee),
                                ],
                                [
                                  'Tổng lăn bánh dự kiến',
                                  formatMoney(rollingBreakdown.totalEstimated),
                                ],
                              ]
                            : []),
                        ].map(([k, v]) => (
                          <div key={String(k)} className="flex justify-between gap-3 py-2.5">
                            <dt className="text-muted">{k}</dt>
                            <dd className="text-right font-semibold text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : (
                  <Notice>Chưa có xe thực tế được chọn để hiển thị bảng giá chi tiết.</Notice>
                )}

                <div className="rounded-card bg-subtle p-5 space-y-3 text-small">
                  <Heading as="h3" size="subtitle">
                    Chính sách thuê & mua xe tại NORI
                  </Heading>
                  <Text className="text-muted">
                    <strong>Độ tuổi:</strong>{' '}
                    {site?.ageRequirement || 'Từ đủ 21 tuổi (ô tô/bán tải) hoặc 18 tuổi (xe máy).'}
                  </Text>
                  <Text className="text-muted">
                    <strong>Giấy phép lái xe:</strong>{' '}
                    {site?.licenseRequirement || 'CCCD gắn chip và GPLX hợp lệ theo hạng xe.'}
                  </Text>
                  <Text className="text-muted">
                    <strong>Đặt cọc & Nhiên liệu:</strong>{' '}
                    {site?.depositPolicy ||
                      'Tiền cọc tách riêng khỏi tiền thuê và hoàn lại khi trả xe đạt tình trạng ban đầu.'}
                  </Text>
                  <Text className="text-muted">
                    <strong>Hủy đơn:</strong>{' '}
                    {site?.cancellationPolicy || 'Hủy miễn phí khi đơn ở trạng thái Chờ xác nhận.'}
                  </Text>
                </div>
              </section>
            )}

            {/* Tab 6: Availability Calendar */}
            {activeTab === 'availability' && (
              <section
                id="availability"
                role="tabpanel"
                aria-labelledby="tab-availability"
                className="py-7 space-y-6"
              >
                <div>
                  <Heading size="title">Lịch khả dụng & Tình trạng sẵn sàng</Heading>
                  <Text className="mt-2 text-small text-muted">
                    Kiểm tra lịch xe trống, ngày đang có chuyến thuê và lịch bảo dưỡng kỹ thuật định
                    kỳ theo thời gian thực.
                  </Text>
                </div>

                {rentable && selectedVehicle ? (
                  <div className="rounded-card border border-line bg-canvas p-5 space-y-5 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand">
                          <Icon name="car" className="size-5" />
                        </div>
                        <div>
                          <Text className="font-semibold text-ink">
                            Xe {selectedVehicle.reference}
                          </Text>
                          <Text className="text-caption text-muted">
                            {selectedVehicle.version || model.name} ·{' '}
                            {selectedVehicle.color || 'Màu tiêu chuẩn'} · ODO:{' '}
                            {selectedVehicle.odometer?.toLocaleString('vi-VN')} km
                          </Text>
                        </div>
                      </div>
                      <StatusBadge status={selectedVehicle.operationStatus} />
                    </div>

                    <div className="max-w-xl">
                      <AvailabilityCalendar
                        vehicle={selectedVehicle.id}
                        startDate={startDate}
                        endDate={endDate}
                        onChange={datesChanged}
                        operationStatus={selectedVehicle.operationStatus}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 border-t border-line/60 pt-4 text-caption">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-pill bg-brand" />
                        <span className="text-ink font-medium">Khoảng ngày bạn chọn</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-pill bg-danger-soft border border-danger/30" />
                        <span className="text-muted">Đang có khách thuê (Kín)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-pill bg-warning-soft border border-warning/30" />
                        <span className="text-muted">Đang bảo dưỡng định kỳ</span>
                      </div>
                    </div>

                    <div className="rounded-control bg-subtle p-4 text-small">
                      <Text className="font-semibold text-ink">Lưu ý khi đặt xe:</Text>
                      <Text className="mt-1 text-muted text-caption leading-relaxed">
                        NORI áp dụng thời gian chuẩn bị kỹ thuật giữa hai lượt thuê để vệ sinh và
                        kiểm tra an toàn phương tiện trước khi bàn giao. Nếu cần nhận xe gấp, vui
                        lòng liên hệ hotline để được hỗ trợ điều phối.
                      </Text>
                    </div>
                  </div>
                ) : (
                  <Notice>
                    Vui lòng chọn một chiếc xe thực tế ở cột bên phải để xem lịch khả dụng chi tiết.
                  </Notice>
                )}
              </section>
            )}

            {/* Tab 7: Reviews */}
            {activeTab === 'reviews' && (
              <section id="reviews" role="tabpanel" aria-labelledby="tab-reviews" className="py-7">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Heading size="title">Đánh giá từ khách hàng đã trải nghiệm</Heading>
                    <Text className="mt-1 text-small text-muted">
                      Chỉ khách hàng có đơn thuê đã hoàn thành (Hoàn thành) mới có thể gửi đánh giá.
                    </Text>
                  </div>
                  {averageRating && (
                    <Badge tone="brand">
                      {averageRating} / 5 sao ({reviewsData.reviews.length} đánh giá)
                    </Badge>
                  )}
                </div>

                {reviewsData.eligibleBookings.length > 0 && (
                  <form
                    onSubmit={submitReview}
                    className="mb-6 space-y-4 rounded-card border border-brand/30 bg-soft p-5"
                  >
                    <Heading as="h3" size="subtitle">
                      Viết đánh giá cho chuyến đi của bạn
                    </Heading>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select
                        id="review-booking"
                        label="Chuyến thuê đã hoàn thành"
                        value={reviewBookingId}
                        onChange={(e) => setReviewBookingId(e.target.value)}
                      >
                        {reviewsData.eligibleBookings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bookingKey.slice(0, 11).toUpperCase()} ({formatDate(b.startDate)} –{' '}
                            {formatDate(b.endDate)})
                          </option>
                        ))}
                      </Select>
                      <Select
                        id="review-rating"
                        label="Mức độ hài lòng"
                        value={reviewRating}
                        onChange={(e) => setReviewRating(Number(e.target.value))}
                      >
                        <option value={5}>5 sao — Rất hài lòng</option>
                        <option value={4}>4 sao — Hài lòng</option>
                        <option value={3}>3 sao — Bình thường</option>
                        <option value={2}>2 sao — Chưa tốt</option>
                        <option value={1}>1 sao — Không hài lòng</option>
                      </Select>
                    </div>
                    <Input
                      id="review-title"
                      label="Tiêu đề ngắn"
                      value={reviewTitle}
                      onChange={(e) => setReviewTitle(e.target.value)}
                      placeholder="Ví dụ: Xe sạch, nhận trả đúng hẹn"
                    />
                    <Textarea
                      id="review-comment"
                      label="Nhận xét chi tiết"
                      rows={3}
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Chia sẻ trải nghiệm thực tế về chất lượng xe và dịch vụ…"
                    />
                    {reviewError && <Notice tone="error">{reviewError}</Notice>}
                    {reviewSuccess && <Notice tone="success">{reviewSuccess}</Notice>}
                    <Button type="submit" loading={reviewBusy}>
                      Gửi đánh giá
                    </Button>
                  </form>
                )}

                {reviewsLoading ? (
                  <Skeleton className="h-32" />
                ) : reviewsData.reviews.length ? (
                  <div className="space-y-4">
                    {reviewsData.reviews.map((r) => (
                      <article key={r.id} className="rounded-card border border-line p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <Text className="font-semibold text-ink">{r.customerName}</Text>
                            <Text className="text-caption text-muted">
                              {r.vehicleReference ? `Xe ${r.vehicleReference} · ` : ''}
                              {formatDate(r.createdAt)}
                            </Text>
                          </div>
                          <Badge tone="brand">{r.rating} / 5 sao</Badge>
                        </div>
                        {r.title && <Text className="mt-3 font-semibold text-ink">{r.title}</Text>}
                        <Text className="mt-1 text-small leading-relaxed text-muted">
                          {r.comment}
                        </Text>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="sparkles"
                    title="Chưa có đánh giá khách hàng"
                    description="NORI không tạo đánh giá giả. Đánh giá thật sẽ hiển thị sau khi khách hàng hoàn thành giao dịch."
                  />
                )}
              </section>
            )}

            {/* Tab 8: Support & Contact */}
            {activeTab === 'support' && (
              <section
                id="support"
                role="tabpanel"
                aria-labelledby="tab-support"
                className="py-7 space-y-6"
              >
                <div>
                  <Heading size="title">Liên hệ tư vấn & Hỗ trợ khách hàng</Heading>
                  <Text className="mt-2 text-small text-muted">
                    Đội ngũ chuyên viên NORI sẵn sàng giải đáp thắc mắc về thủ tục thuê xe, thông số
                    kỹ thuật và chính sách giao nhận 24/7.
                  </Text>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="rounded-card border border-line bg-subtle p-5 space-y-3">
                    <div className="flex items-center gap-3 text-brand">
                      <Icon name="phone" className="size-5" />
                      <Heading as="h3" size="subtitle">
                        Tổng đài hỗ trợ 24/7
                      </Heading>
                    </div>
                    <Text className="text-title font-bold text-ink">
                      {site?.phone || '1900 8888 (Miễn cước)'}
                    </Text>
                    <Text className="text-caption text-muted">
                      Hỗ trợ khẩn cấp trên đường, cứu hộ và đổi lịch trình thuê xe.
                    </Text>
                  </div>

                  <div className="rounded-card border border-line bg-subtle p-5 space-y-3">
                    <div className="flex items-center gap-3 text-brand">
                      <Icon name="mail" className="size-5" />
                      <Heading as="h3" size="subtitle">
                        Hòm thư tiếp nhận
                      </Heading>
                    </div>
                    <Text className="text-title font-bold text-ink">
                      {site?.email || 'support@nori.vn'}
                    </Text>
                    <Text className="text-caption text-muted">
                      Giải đáp thủ tục hợp đồng, xuất hóa đơn VAT và phản hồi dịch vụ.
                    </Text>
                  </div>

                  <div className="rounded-card border border-line bg-subtle p-5 space-y-3 sm:col-span-2">
                    <div className="flex items-center gap-3 text-brand">
                      <Icon name="pin" className="size-5" />
                      <Heading as="h3" size="subtitle">
                        Điểm giao nhận & Showroom NORI
                      </Heading>
                    </div>
                    <Text className="text-body font-semibold text-ink">
                      {site?.address ||
                        'Khu Công Nghệ Cao, TP. Thủ Đức, TP. Hồ Chí Minh · Hà Nội · Đà Nẵng'}
                    </Text>
                    <Text className="text-caption text-muted">
                      Giờ mở cửa bãi xe:{' '}
                      {site?.openingHours ||
                        '07:00 – 21:00 hàng ngày (kể cả Thứ 7, Chủ nhật và Lễ Tết)'}
                    </Text>
                    {site?.workStartTime && site?.workEndTime && (
                      <Text className="text-caption text-muted">
                        Giờ hành chính tư vấn:{' '}
                        <strong>
                          {site.workStartTime} – {site.workEndTime}
                        </strong>
                        {site.lunchBreakStart && site.lunchBreakEnd
                          ? ` (Nghỉ trưa ${site.lunchBreakStart} – ${site.lunchBreakEnd})`
                          : ''}
                      </Text>
                    )}
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openInquiryModal('CONSULTATION')}
                      >
                        Yêu cầu nhân viên tư vấn dòng xe này
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-card border border-line p-5 space-y-4">
                  <Heading as="h3" size="subtitle">
                    Câu hỏi thường gặp về dòng xe {model.name}
                  </Heading>
                  <div className="space-y-3 text-small">
                    <div className="rounded-control bg-subtle p-4">
                      <Text className="font-semibold text-ink">
                        1. Cần chuẩn bị những giấy tờ gì khi nhận xe?
                      </Text>
                      <Text className="mt-1 text-muted text-caption">
                        {site?.licenseRequirement ||
                          'Quý khách chỉ cần chuẩn bị CCCD gắn chip (hoặc Hộ chiếu) và Giấy phép lái xe hợp lệ tương ứng với phân hạng xe.'}
                      </Text>
                    </div>
                    <div className="rounded-control bg-subtle p-4">
                      <Text className="font-semibold text-ink">
                        2. Tiền đặt cọc được thanh toán và hoàn trả như thế nào?
                      </Text>
                      <Text className="mt-1 text-muted text-caption">
                        {site?.depositPolicy ||
                          'Tiền đặt cọc được tạm giữ độc lập khi nhận xe. Sau khi kiểm tra đối soát hoàn tất và không phát sinh hư hỏng, NORI sẽ hoàn cọc ngay lập tức qua chuyển khoản ngân hàng.'}
                      </Text>
                    </div>
                    <div className="rounded-control bg-subtle p-4">
                      <Text className="font-semibold text-ink">
                        3. Có dịch vụ giao xe tận nơi tại sân bay hoặc khách sạn không?
                      </Text>
                      <Text className="mt-1 text-muted text-caption">
                        NORI hỗ trợ giao nhận xe tận nơi 24/7 theo yêu cầu. Bạn chỉ cần tick chọn
                        "Giao xe tận nơi" tại bước đặt xe.
                      </Text>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {model.source && /^https:\/\//.test(model.source) && (
              <Text className="pt-4 text-micro text-muted">
                Nguồn tham khảo catalogue:{' '}
                <ExternalLink href={model.source} target="_blank">
                  Trang chính thức hãng xe <Icon name="external" className="ml-1 inline size-3" />
                </ExternalLink>
              </Text>
            )}
          </div>

          {/* Sticky Booking / Purchase Sidebar */}
          <aside
            id="booking-sidebar"
            aria-label="Lựa chọn dịch vụ và đặt xe"
            className="rounded-card border border-line bg-canvas p-5 shadow-card lg:sticky lg:top-5"
          >
            <div className="mb-5 flex rounded-control bg-subtle p-1">
              {(['rent', 'buy'] as const).map((value) => (
                <Button
                  key={value}
                  onClick={() => {
                    setIntent(value)
                    setQuote(null)
                    setError('')
                    const v = fleet.find((item) =>
                      value === 'rent' ? item.intent !== 'SALE' : item.intent !== 'RENT',
                    )
                    setVehicleId(v?.id ?? '')
                  }}
                  aria-pressed={intent === value}
                  variant="ghost"
                  className={cn(
                    'min-h-control-sm flex-1 py-2 text-small',
                    intent === value && 'bg-canvas text-brand shadow-sm',
                  )}
                >
                  {value === 'rent' ? 'Thuê xe' : 'Mua xe'}
                </Button>
              ))}
            </div>

            <div className="flex items-start justify-between gap-2">
              <div>
                <Text className="text-caption text-muted">
                  {intent === 'rent' ? 'Giá thuê / ngày' : 'Giá bán'}
                </Text>
                <Text className="mt-1 text-title font-semibold text-brand">
                  {formatMoney(displayPrice)}
                </Text>
              </div>
              {isDemoActive && <Badge tone="warning">DEMO</Badge>}
            </div>
            <div className="mt-1.5 min-h-[20px]">
              <Text className="text-micro text-muted">
                {displayPrice
                  ? intent === 'rent'
                    ? selectedVehicle?.depositAmount
                      ? `Đặt cọc riêng: ${formatMoney(selectedVehicle.depositAmount)}`
                      : 'Đặt cọc riêng theo xe được chọn.'
                    : `Niêm yết tham khảo: ${formatMoney(selectedVehicle?.listedPrice ?? model.listedPrice)}`
                  : 'Giá sẽ hiển thị khi có xe thực tế được xác nhận.'}
              </Text>
            </div>

            <div className="my-5 h-px bg-line" />

            {fleetLoading ? (
              <div className="mb-4 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-control w-full" />
              </div>
            ) : fleetError ? (
              <div className="mb-4">
                <Notice tone="error">{fleetError}</Notice>
                <Button
                  variant="ghost"
                  onClick={() => setRetry(retry + 1)}
                  className="text-caption text-brand"
                >
                  Thử tải lại xe
                </Button>
              </div>
            ) : eligible.length ? (
              <Select
                id="actual-vehicle"
                label="Chọn xe thực tế"
                value={vehicleId}
                onChange={(e) => {
                  setVehicleId(e.target.value)
                  setQuote(null)
                  setError('')
                }}
                wrapperClassName="mb-4"
              >
                <option value="">Chọn một chiếc xe</option>
                {eligible.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reference}
                    {v.version ? ` · ${v.version}` : ''}
                    {v.color ? ` · ${v.color}` : ''}
                    {v.currentBranchName ? ` (${v.currentBranchName})` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <Notice className="mb-5">
                Chưa có xe thực tế cho dịch vụ {intent === 'rent' ? 'thuê' : 'mua'} được công bố.
                Catalogue vẫn có thể xem bình thường.
              </Notice>
            )}

            {intent === 'rent' ? (
              <form onSubmit={checkAvailability}>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="detail-start"
                    label="Ngày nhận xe"
                    type="date"
                    value={startDate}
                    min={today || undefined}
                    max={today ? addDays(today, 90) : undefined}
                    onFocus={() => setToday(businessToday())}
                    onChange={(e) => datesChanged(e.target.value, endDate)}
                    required
                  />
                  <Input
                    id="detail-end"
                    label="Ngày trả xe"
                    type="date"
                    value={endDate}
                    min={startDate ? addDays(startDate, 1) : today || undefined}
                    max={startDate ? addDays(startDate, 30) : undefined}
                    onFocus={() => setToday(businessToday())}
                    onChange={(e) => datesChanged(startDate, e.target.value)}
                    required
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Select
                    id="detail-pickup-time"
                    label="Giờ nhận"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                  >
                    {pickupTimes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Select
                    id="detail-return-time"
                    label="Giờ trả"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                  >
                    {pickupTimes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>

                {selectedVehicle && (publicLocs?.branches.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-2.5 border-t border-line pt-3">
                    <Select
                      id="detail-pickup-branch"
                      label="Chi nhánh nhận xe"
                      value={pickupBranchId || selectedVehicle.currentBranchId || ''}
                      onChange={(e) => {
                        setPickupBranchId(e.target.value)
                        setQuote(null)
                      }}
                    >
                      <option value="">Theo chi nhánh hiện tại của xe</option>
                      {(publicLocs?.branches ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.province})
                        </option>
                      ))}
                    </Select>
                    <Checkbox
                      id="detail-one-way"
                      checked={differentReturn}
                      onChange={(e) => {
                        setDifferentReturn(e.target.checked)
                        if (!e.target.checked) setReturnBranchId('')
                        setQuote(null)
                      }}
                      label="Trả xe tại chi nhánh khác"
                    />
                    {differentReturn && (
                      <Select
                        id="detail-return-branch"
                        label="Chi nhánh trả xe"
                        value={returnBranchId}
                        onChange={(e) => {
                          setReturnBranchId(e.target.value)
                          setQuote(null)
                        }}
                      >
                        <option value="">Chọn chi nhánh trả xe</option>
                        {(publicLocs?.branches ?? []).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.province})
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                )}

                {selectedVehicle && (
                  <div className="mt-3 space-y-1 border-t border-line pt-3">
                    {selectedVehicle.deliveryFee ? (
                      <Checkbox
                        id="detail-delivery"
                        checked={deliveryRequested}
                        onChange={(e) => {
                          setDeliveryRequested(e.target.checked)
                          setQuote(null)
                        }}
                        label={`Giao nhận tận nơi (+${formatMoney(selectedVehicle.deliveryFee)})`}
                      />
                    ) : null}
                    <details className="rounded-control bg-subtle px-3 py-2">
                      <summary className="flex min-h-touch items-center justify-between text-caption font-medium">
                        Dịch vụ bổ sung ({selectedAddons.length})
                        <Icon name="chevron-down" className="size-3.5" />
                      </summary>
                      <div className="space-y-1 pb-2">
                        {relevantAddons.map((addon) => (
                          <Checkbox
                            key={addon.id}
                            id={`addon-${addon.id}`}
                            checked={selectedAddons.includes(addon.id)}
                            onChange={() => toggleAddon(addon.id)}
                            label={
                              <span className="text-caption">
                                {addon.label} ({formatMoney(addon.price)}
                                {addon.perDay ? '/ngày' : ''})
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                <div className="my-4">
                  <AvailabilityCalendar
                    vehicle={rentable ? selectedVehicle!.id : null}
                    startDate={startDate}
                    endDate={endDate}
                    onChange={datesChanged}
                    operationStatus={selectedVehicle?.operationStatus}
                  />
                </div>

                {quote?.available && (
                  <div className="mb-4 space-y-2 rounded-control bg-subtle p-4 text-caption">
                    <div className="flex justify-between gap-2">
                      <Text>
                        Cơ bản ({formatMoney(quote.dailyPrice)} × {quote.totalDays} ngày)
                      </Text>
                      <Text className="font-medium">{formatMoney(quote.basePrice)}</Text>
                    </div>
                    {quote.weekendSurchargeTotal > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phụ phí cuối tuần ({quote.weekendDays} ngày)</Text>
                        <Text className="font-medium">
                          +{formatMoney(quote.weekendSurchargeTotal)}
                        </Text>
                      </div>
                    )}
                    {(quote.holidaySurchargeTotal ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phụ phí ngày lễ ({quote.holidayDays} ngày)</Text>
                        <Text className="font-medium">
                          +{formatMoney(quote.holidaySurchargeTotal)}
                        </Text>
                      </div>
                    )}
                    {quote.deliveryFee > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phí giao nhận tận nơi</Text>
                        <Text className="font-medium">+{formatMoney(quote.deliveryFee)}</Text>
                      </div>
                    )}
                    {(quote.locationSurcharge ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phụ phí địa điểm</Text>
                        <Text className="font-medium">+{formatMoney(quote.locationSurcharge)}</Text>
                      </div>
                    )}
                    {(quote.oneWayFee ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phí trả xe khác chi nhánh</Text>
                        <Text className="font-medium">+{formatMoney(quote.oneWayFee)}</Text>
                      </div>
                    )}
                    {(quote.afterHoursFee ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Phí giao nhận ngoài giờ</Text>
                        <Text className="font-medium">+{formatMoney(quote.afterHoursFee)}</Text>
                      </div>
                    )}
                    {quote.addonFee > 0 && (
                      <div className="flex justify-between gap-2">
                        <Text>Dịch vụ bổ sung</Text>
                        <Text className="font-medium">+{formatMoney(quote.addonFee)}</Text>
                      </div>
                    )}
                    {quote.discountAmount > 0 && (
                      <div className="flex justify-between gap-2 text-brand">
                        <Text>Ưu đãi thuê dài ngày ({Math.round(quote.discountRate * 100)}%)</Text>
                        <Text className="font-medium">-{formatMoney(quote.discountAmount)}</Text>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 border-t border-line pt-2 text-small">
                      <Text className="font-semibold">Tổng tiền thuê dự kiến</Text>
                      <Text className="font-semibold text-brand">
                        {formatMoney(quote.estimatedTotal)}
                      </Text>
                    </div>
                    {quote.depositAmount > 0 && (
                      <div className="flex justify-between gap-2 text-micro text-muted">
                        <Text>Đặt cọc đảm bảo (hoàn trả sau thuê)</Text>
                        <Text className="font-medium text-ink">
                          {formatMoney(quote.depositAmount)}
                        </Text>
                      </div>
                    )}
                    <Text className="text-micro text-muted">
                      Chưa thu tiền. Giá được kiểm tra lại trên máy chủ khi xác nhận.
                    </Text>
                  </div>
                )}

                {error && (
                  <Notice tone="error" className="mb-4">
                    {error}
                  </Notice>
                )}

                {quote?.available ? (
                  <ButtonLink href={checkoutUrl} className="w-full">
                    Tiếp tục đặt thuê <Icon name="arrow-right" className="size-4" />
                  </ButtonLink>
                ) : (
                  <Button
                    type="submit"
                    loading={quoteLoading}
                    disabled={!rentable || fleetLoading}
                    className="w-full"
                  >
                    <Icon name="calendar" className="size-4" />
                    Kiểm tra lịch & giá
                  </Button>
                )}
                <Text className="mt-3 text-center text-micro text-muted">
                  {!rentable
                    ? 'Cần có xe thực tế và giá trước khi đặt thuê.'
                    : 'Thuê từ 1 đến 30 ngày. Ngày trả không tính thêm.'}
                </Text>
              </form>
            ) : (
              <div className="space-y-4">
                {selectedVehicle && (
                  <dl className="space-y-2 rounded-control bg-subtle p-4 text-caption">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">Tình trạng xe</dt>
                      <dd className="font-medium">
                        {selectedVehicle.vehicleConditionType === 'NEW'
                          ? 'Xe mới'
                          : 'Đã qua sử dụng (DEMO)'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted">ODO thực tế</dt>
                      <dd className="font-medium">
                        {selectedVehicle.odometer != null
                          ? `${new Intl.NumberFormat('vi-VN').format(selectedVehicle.odometer)} km`
                          : 'Chưa cập nhật'}
                      </dd>
                    </div>
                    {rollingBreakdown && (
                      <div className="flex justify-between gap-2 border-t border-line pt-2">
                        <dt className="text-muted">Lăn bánh ước tính</dt>
                        <dd className="font-semibold text-ink">
                          {formatMoney(rollingBreakdown.totalEstimated)}
                        </dd>
                      </div>
                    )}
                    {selectedVehicle.warrantyPolicy && (
                      <div className="border-t border-line pt-2 text-micro text-muted">
                        Bảo hành: {selectedVehicle.warrantyPolicy}
                      </div>
                    )}
                  </dl>
                )}

                <Text className="text-caption text-muted">
                  Nhận tư vấn, đặt lịch lái thử hoặc gửi yêu cầu mua xe. Yêu cầu cần chuyên viên
                  NORI xác nhận hồ sơ và tình trạng xe thực tế trước khi ký kết.
                </Text>

                <div className="grid gap-2.5">
                  <Button onClick={() => openInquiryModal('CONSULTATION')} className="w-full">
                    Đăng ký tư vấn mua xe <Icon name="arrow-up-right" className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openInquiryModal('TEST_DRIVE')}
                    className="w-full"
                  >
                    Đăng ký xem xe & lái thử
                  </Button>
                  <Button
                    variant="dark"
                    onClick={() => openInquiryModal('PURCHASE_REQUEST')}
                    className="w-full"
                  >
                    Gửi yêu cầu mua xe
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-6 space-y-3 border-t border-line pt-5 text-caption text-muted">
              <Text className="flex items-start gap-2">
                <Icon name="pin" className="mt-0.5 size-4 text-brand" />
                <span>
                  Nhận & trả tại: {selectedVehicle?.pickupLocation || address || 'Chưa cập nhật'}
                </span>
              </Text>
              <Text className="flex items-center gap-2">
                <Icon name="shield" className="size-4 text-brand" />
                Không thu tiền trực tuyến
              </Text>
              <NoriLink
                href="/support#conditions"
                className="flex min-h-touch items-center gap-2 font-medium text-ink"
              >
                Xem điều kiện & chính sách <Icon name="arrow-up-right" className="size-3.5" />
              </NoriLink>
            </div>
          </aside>
        </div>
      </Container>

      {/* Mobile Fixed Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <Text className="text-micro text-muted">
            {intent === 'rent' ? 'Giá thuê / ngày' : 'Giá bán'}
          </Text>
          <Text className="truncate text-subtitle font-semibold text-brand">
            {formatMoney(displayPrice)}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FavoriteButton slug={model.slug} name={model.name} />
          {intent === 'rent' ? (
            <Button
              size="sm"
              onClick={() =>
                document.getElementById('booking-sidebar')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Chọn ngày & đặt thuê
            </Button>
          ) : (
            <Button size="sm" onClick={() => openInquiryModal('CONSULTATION')}>
              Tư vấn / Mua xe
            </Button>
          )}
        </div>
      </div>

      {/* Lightbox Dialog */}
      <Dialog
        title={`${model.name} — ${kind === 'ALL' ? 'Bộ sưu tập ảnh' : galleryKindLabels[kind]}`}
        open={galleryOpen}
        onClose={() => {
          setGalleryOpen(false)
          setZoomed(false)
        }}
        wide
      >
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (images.length < 2) return
            if (e.key === 'ArrowLeft')
              setImageIndex((safeIndex - 1 + images.length) % images.length)
            if (e.key === 'ArrowRight') setImageIndex((safeIndex + 1) % images.length)
          }}
          className="relative h-gallery-mobile overflow-hidden rounded-card bg-subtle focus:outline-none md:h-gallery"
        >
          {galleryOpen && currentImage && (
            <Image
              src={currentImage.url}
              alt={currentImage.alt}
              fill
              sizes="90vw"
              onClick={() => setZoomed(!zoomed)}
              className={cn(
                'cursor-zoom-in object-contain transition-transform duration-300',
                zoomed && 'scale-150 cursor-zoom-out',
              )}
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <Text className="text-caption text-muted">
            Ảnh catalogue tham khảo · {images.length ? `${safeIndex + 1}/${images.length}` : ''}
            {currentItem?.caption ? ` — ${currentItem.caption}` : ''}
          </Text>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setZoomed(!zoomed)}>
              {zoomed ? 'Thu nhỏ' : 'Phóng to'}
            </Button>
            <IconButton
              icon="chevron-left"
              label="Ảnh trước"
              disabled={images.length < 2}
              onClick={() => setImageIndex((safeIndex - 1 + images.length) % images.length)}
            />
            <IconButton
              icon="chevron-right"
              label="Ảnh tiếp theo"
              disabled={images.length < 2}
              onClick={() => setImageIndex((safeIndex + 1) % images.length)}
            />
          </div>
        </div>
      </Dialog>

      {/* Buy / Test Drive / Consultation Dialog */}
      <Dialog
        title={inquiryTypeLabels[inquiryType] ?? 'Tư vấn mua xe'}
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
      >
        {inquirySuccess ? (
          <div className="py-5">
            <Notice tone="success">
              NORI đã tiếp nhận yêu cầu {inquirySuccess.slice(0, 11).toUpperCase()} cho {model.name}
              . Bạn có thể theo dõi trạng thái xử lý trong tài khoản.
            </Notice>
            <ButtonLink href="/account" className="mt-6 w-full">
              Đến tài khoản của tôi <Icon name="arrow-right" className="size-4" />
            </ButtonLink>
          </div>
        ) : isAdmin && user ? (
          <div className="space-y-4">
            <Notice tone="info">
              Bạn đang đăng nhập bằng tài khoản quản trị ({user.email}). Vui lòng sử dụng tài khoản
              khách hàng để gửi và theo dõi yêu cầu tư vấn mua xe.
            </Notice>
            <ButtonLink href="/dashboard/inquiries" variant="secondary" className="w-full">
              Quản lý yêu cầu mua xe hệ thống
            </ButtonLink>
          </div>
        ) : !isCustomer || !user ? (
          <div>
            <Text className="mb-5 text-muted">
              Đăng nhập để gửi và theo dõi yêu cầu tư vấn cho {model.name}.
            </Text>
            <ButtonLink
              href={`/login?returnTo=${encodeURIComponent(`/vehicles/${model.slug}?intent=buy`)}`}
              className="w-full"
            >
              Đăng nhập để tiếp tục
            </ButtonLink>
          </div>
        ) : (
          <form onSubmit={sendInquiry} className="space-y-4">
            <Text className="text-small text-muted">
              Bạn quan tâm{' '}
              <Text as="span" className="font-semibold text-ink">
                {model.name}
              </Text>
              {selectedVehicle?.intent !== 'RENT' && selectedVehicle
                ? ` (${selectedVehicle.reference} — ${formatMoney(selectedVehicle.salePrice)})`
                : ''}
              . NORI sẽ liên hệ xác nhận thông tin xe, phiên bản và lịch hẹn.
            </Text>

            <Select
              id="inquiry-type"
              label="Hình thức yêu cầu"
              value={inquiryType}
              onChange={(e) =>
                setInquiryType(
                  e.target.value as
                    | 'CONSULTATION'
                    | 'QUOTE'
                    | 'VIEWING'
                    | 'TEST_DRIVE'
                    | 'PURCHASE_REQUEST',
                )
              }
            >
              <option value="CONSULTATION">Tư vấn mua xe</option>
              <option value="QUOTE">Yêu cầu báo giá & lăn bánh</option>
              <option value="VIEWING">Đăng ký xem xe trực tiếp</option>
              <option value="TEST_DRIVE">Đăng ký lái thử xe</option>
              <option value="PURCHASE_REQUEST">Gửi yêu cầu đặt mua xe</option>
            </Select>

            {['QUOTE', 'PURCHASE_REQUEST'].includes(inquiryType) && (
              <Select
                id="inquiry-payment-method"
                label="Phương thức mua dự kiến"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'DIRECT' | 'INSTALLMENT' | 'CONSULT_FINANCE')
                }
              >
                <option value="DIRECT">Thanh toán trực tiếp</option>
                <option value="INSTALLMENT">Tham khảo phương án trả góp</option>
                <option value="CONSULT_FINANCE">Cần tư vấn tài chính</option>
              </Select>
            )}

            {['VIEWING', 'TEST_DRIVE'].includes(inquiryType) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id="inquiry-date"
                  label="Ngày hẹn mong muốn"
                  type="date"
                  min={today || undefined}
                  onFocus={() => setToday(businessToday())}
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                />
                <Input
                  id="inquiry-location"
                  label="Địa điểm xem / lái thử"
                  value={preferredLocation}
                  onChange={(e) => setPreferredLocation(e.target.value)}
                  placeholder={selectedVehicle?.pickupLocation ?? 'Showroom NORI'}
                />
              </div>
            )}

            <Input
              id="inquiry-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              label="Số điện thoại liên hệ"
              defaultValue={user.phone ?? ''}
              error={fieldErrors.phone}
              required
              maxLength={16}
            />
            <Textarea
              id="inquiry-note"
              name="note"
              label="Bạn muốn NORI tư vấn điều gì?"
              rows={3}
              maxLength={1000}
              placeholder="Phiên bản, màu sắc, nhu cầu sử dụng hoặc thời gian dự kiến…"
            />
            {inquiryError && <Notice tone="error">{inquiryError}</Notice>}
            <Text className="text-caption text-muted">
              Thông tin chỉ được dùng để xử lý yêu cầu này. Không phát sinh thanh toán trực tuyến.
            </Text>
            <Button type="submit" className="w-full" loading={inquiryBusy}>
              {inquiryType === 'CONSULTATION' ? 'Gửi yêu cầu tư vấn' : 'Gửi yêu cầu'}{' '}
              <Icon name="arrow-right" className="size-4" />
            </Button>
          </form>
        )}
      </Dialog>
    </main>
  )
}
