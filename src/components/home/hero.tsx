'use client'

import { getImageProps } from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { HeroSlideView, SiteContent } from '@/lib/catalogue'
import { Button, ButtonLink, Container, Heading, Text, cn } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export type HeroPreviewViewport = 'desktop' | 'tablet' | 'mobile'

export type NormalizedSlide = {
  id: string
  eyebrow: string
  first: string
  second: string
  description: string
  ctaText: string
  ctaHref: string
  secondaryText?: string
  secondaryHref?: string
  categoryBadge: string
  desktopUrl: string
  desktopWidth: number
  desktopHeight: number
  mobileUrl: string
  mobileWidth: number
  mobileHeight: number
  hasCustomMobile: boolean
  focalX: number
  focalY: number
  mobileFocalX: number
  mobileFocalY: number
  imageAlt: string
  credit?: string | null
  durationSeconds?: number | null
}

const FALLBACK_SLIDE_IMAGE = '/seed-media/toyota-fortuner-ext-3.jpg'

const defaultSlides: NormalizedSlide[] = [
  {
    id: 'slide-journey',
    categoryBadge: 'Trải nghiệm hành trình',
    eyebrow: 'TỰ DO KHỞI HÀNH · TRỌN VẸN HÀNH TRÌNH',
    first: 'Mọi hành trình.',
    second: 'Luôn có NORI.',
    description:
      'Chủ động lên lịch trình khám phá cung đường ven biển hay đèo núi cao nguyên cùng thông tin phương tiện minh bạch từ NORI.',
    ctaText: 'Khám phá phương tiện',
    ctaHref: '/vehicles',
    secondaryText: 'Cách NORI hoạt động',
    secondaryHref: '/about#how-it-works',
    desktopUrl: '/seed-media/toyota-fortuner-ext-3.jpg',
    desktopWidth: 1600,
    desktopHeight: 1000,
    mobileUrl: '/seed-media/toyota-fortuner-ext-3.jpg',
    mobileWidth: 1600,
    mobileHeight: 1000,
    hasCustomMobile: false,
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
    imageAlt: 'Ô tô SUV di chuyển trên cung đường hành trình ven biển và núi cùng NORI',
    credit: 'Matti Blume · CC BY-SA 4.0',
  },
  {
    id: 'slide-cars-suv',
    categoryBadge: 'Ô tô phổ thông & SUV',
    eyebrow: '4 ĐẾN 7 CHỖ · ĐÔ THỊ & GIA ĐÌNH',
    first: 'Một lựa chọn.',
    second: 'Vững vàng đường xa.',
    description:
      'Đa dạng các dòng Sedan, CUV, SUV và MPV từ Toyota Vios, Mazda CX-5 đến Fortuner và Honda CR-V cho gia đình và công tác.',
    ctaText: 'Khám phá ô tô',
    ctaHref: '/vehicles?type=CAR',
    secondaryText: 'Cách NORI hoạt động',
    secondaryHref: '/about#how-it-works',
    desktopUrl: '/seed-media/mazda-cx5-ext-1.jpg',
    desktopWidth: 1600,
    desktopHeight: 1000,
    mobileUrl: '/seed-media/mazda-cx5-ext-1.jpg',
    mobileWidth: 1600,
    mobileHeight: 1000,
    hasCustomMobile: false,
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
    imageAlt: 'Mazda CX-5 đại diện phân khúc ô tô phổ thông và SUV gia đình tại NORI',
    credit: 'Wikimedia Commons · CC BY-SA 4.0',
  },
  {
    id: 'slide-luxury',
    categoryBadge: 'Xe cao cấp & Hạng sang',
    eyebrow: 'PHONG THÁI HIỆN ĐẠI · DẤU ẤN SANG TRỌNG',
    first: 'Chạm ước mơ.',
    second: 'Dấu ấn đẳng cấp.',
    description:
      'Mercedes-Benz C 300 AMG với khoang lái tinh tế, thiết kế thể thao sang trọng cho các sự kiện và hành trình quan trọng.',
    ctaText: 'Khám phá xe cao cấp',
    ctaHref: '/vehicles?type=CAR&search=Mercedes',
    secondaryText: 'Liên hệ tư vấn',
    secondaryHref: '/support',
    desktopUrl: '/seed-media/mercedes-c300-ext-1.jpg',
    desktopWidth: 1600,
    desktopHeight: 1000,
    mobileUrl: '/seed-media/mercedes-c300-ext-1.jpg',
    mobileWidth: 1600,
    mobileHeight: 1000,
    hasCustomMobile: false,
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
    imageAlt: 'Mercedes-Benz C 300 AMG dòng xe hạng sang hiện đại tại NORI',
    credit: 'Wikimedia Commons · CC BY-SA 4.0',
  },
  {
    id: 'slide-motorbikes-ev',
    categoryBadge: 'Xe máy & Xe điện',
    eyebrow: 'LINH HOẠT PHỐ THỊ · TRẢI NGHIỆM TỰ DO',
    first: 'Linh hoạt phố thị.',
    second: 'Tự do khám phá.',
    description:
      'Từ xe tay ga Honda SH, PCX, xe máy điện VinFast Evo đến mô tô phân khối lớn, gọn nhẹ và chủ động trên từng góc phố.',
    ctaText: 'Khám phá xe máy',
    ctaHref: '/vehicles?type=MOTORBIKE',
    secondaryText: 'Xem xe máy điện',
    secondaryHref: '/vehicles?type=MOTORBIKE&fuel=%C4%90i%E1%BB%87n+(EV)',
    desktopUrl: '/seed-media/honda-sh350i-ext-1.jpg',
    desktopWidth: 1600,
    desktopHeight: 1000,
    mobileUrl: '/seed-media/vinfast-evo200-ext-1.jpg',
    mobileWidth: 1600,
    mobileHeight: 1000,
    hasCustomMobile: true,
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
    imageAlt: 'Xe máy và xe máy điện đô thị linh hoạt tại NORI',
    credit: 'Wikimedia Commons · CC BY-SA 4.0',
  },
  {
    id: 'slide-pickups',
    categoryBadge: 'Xe bán tải & Khám phá',
    eyebrow: 'ĐA ĐỊA HÌNH · BỀN BỈ MẠNH MẼ',
    first: 'Vượt cung đường xa.',
    second: 'Chở trọn hành trang.',
    description:
      'Ford Ranger Raptor, Wildtrak, Toyota Hilux và Mitsubishi Triton sẵn sàng cho chuyến dã ngoại thiên nhiên và công tác thực địa.',
    ctaText: 'Khám phá xe bán tải',
    ctaHref: '/vehicles?type=PICKUP',
    secondaryText: 'Xem dòng bán tải',
    secondaryHref: '/vehicles?type=PICKUP',
    desktopUrl: '/seed-media/ford-ranger-raptor-ext-1.jpg',
    desktopWidth: 1600,
    desktopHeight: 1000,
    mobileUrl: '/seed-media/ford-ranger-raptor-ext-1.jpg',
    mobileWidth: 1600,
    mobileHeight: 1000,
    hasCustomMobile: false,
    focalX: 50,
    focalY: 50,
    mobileFocalX: 50,
    mobileFocalY: 50,
    imageAlt: 'Xe bán tải Ford Ranger Raptor chinh phục cung đường khám phá cùng NORI',
    credit: 'Alexander-93 · CC BY-SA 4.0',
  },
]

function clampPercent(val: unknown, fallback = 50): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback
  return Math.min(100, Math.max(0, Math.round(val)))
}

export function normalizeCmsSlides(cmsSlides?: HeroSlideView[]): NormalizedSlide[] {
  if (!cmsSlides || cmsSlides.length === 0) return []
  return cmsSlides.map((s, idx) => {
    const fallback = defaultSlides[idx % defaultSlides.length]
    const desktopUrl = s.desktopImage?.url || fallback.desktopUrl
    const desktopWidth = s.desktopImage?.width || 1600
    const desktopHeight = s.desktopImage?.height || 900
    const hasCustomMobile = Boolean(s.mobileImage?.url)
    const mobileUrl = s.mobileImage?.url || desktopUrl
    const mobileWidth = s.mobileImage?.width || desktopWidth
    const mobileHeight = s.mobileImage?.height || desktopHeight
    const focalX = clampPercent(s.focalX, s.desktopImage?.focalX ?? 50)
    const focalY = clampPercent(s.focalY, s.desktopImage?.focalY ?? 50)
    const mobileFocalX = hasCustomMobile
      ? clampPercent(s.mobileFocalX, s.mobileImage?.focalX ?? 50)
      : focalX
    const mobileFocalY = hasCustomMobile
      ? clampPercent(s.mobileFocalY, s.mobileImage?.focalY ?? 50)
      : focalY

    const imageAlt =
      s.desktopImage?.alt ||
      s.mobileImage?.alt ||
      `${s.titleFirst} ${s.titleSecond ?? ''} — NORI`.trim()

    return {
      id: s.id || `cms-slide-${idx + 1}`,
      categoryBadge: s.categoryBadge || 'Phương tiện NORI',
      eyebrow: s.eyebrow || 'ĐỒNG HÀNH MINH BẠCH CÙNG NORI',
      first: s.titleFirst,
      second: s.titleSecond || '',
      description: s.description || '',
      ctaText: s.ctaText || 'Khám phá ngay',
      ctaHref: s.ctaHref || '/vehicles',
      secondaryText: s.secondaryText || undefined,
      secondaryHref: s.secondaryHref || undefined,
      desktopUrl,
      desktopWidth,
      desktopHeight,
      mobileUrl,
      mobileWidth,
      mobileHeight,
      hasCustomMobile,
      focalX,
      focalY,
      mobileFocalX,
      mobileFocalY,
      imageAlt,
      credit: s.credit,
      durationSeconds: s.durationSeconds,
    }
  })
}

function HeroSlideMedia({
  slide,
  isPrimary,
  isCurrent,
  isReducedMotion,
  previewViewport,
  failedUrls,
  onImageError,
}: {
  slide: NormalizedSlide
  isPrimary: boolean
  isCurrent: boolean
  isReducedMotion: boolean
  previewViewport?: HeroPreviewViewport
  failedUrls: Record<string, boolean>
  onImageError: (url: string) => void
}) {
  const resolvedDesktop = failedUrls[slide.desktopUrl] ? FALLBACK_SLIDE_IMAGE : slide.desktopUrl
  const resolvedMobile = failedUrls[slide.mobileUrl] ? resolvedDesktop : slide.mobileUrl
  const desktopPosition = `${slide.focalX}% ${slide.focalY}%`
  const mobilePosition = slide.hasCustomMobile
    ? `${slide.mobileFocalX}% ${slide.mobileFocalY}%`
    : desktopPosition
  const allowZoom = isCurrent && !isReducedMotion && slide.desktopWidth >= 1200

  const commonSizes =
    previewViewport === 'mobile'
      ? '390px'
      : previewViewport === 'tablet'
        ? '768px'
        : '(max-width: 767px) 100vw, 100vw'

  const {
    props: { srcSet: desktopSrcSet, ...desktopImgProps },
  } = getImageProps({
    src: resolvedDesktop,
    alt: slide.imageAlt,
    fill: true,
    sizes: commonSizes,
    quality: 84,
    loading: isPrimary ? 'eager' : 'lazy',
  })

  const {
    props: { srcSet: mobileSrcSet, ...mobileImgProps },
  } = getImageProps({
    src: resolvedMobile,
    alt: slide.imageAlt,
    fill: true,
    sizes: commonSizes,
    quality: 80,
    loading: isPrimary ? 'eager' : 'lazy',
  })

  if (previewViewport) {
    const activeProps = previewViewport === 'mobile' ? mobileImgProps : desktopImgProps
    const activeSrcSet = previewViewport === 'mobile' ? mobileSrcSet : desktopSrcSet
    const activePos = previewViewport === 'mobile' ? mobilePosition : desktopPosition
    const activeUrl = previewViewport === 'mobile' ? slide.mobileUrl : slide.desktopUrl

    return (
      <img
        {...activeProps}
        srcSet={activeSrcSet}
        alt={slide.imageAlt}
        onError={() => onImageError(activeUrl)}
        style={{
          ...activeProps.style,
          objectFit: 'cover',
          objectPosition: activePos,
        }}
        className="size-full object-cover"
      />
    )
  }

  const focalVars = {
    '--hero-focal-desktop': desktopPosition,
    '--hero-focal-mobile': mobilePosition,
  } as CSSProperties

  return (
    <picture className="block size-full" style={focalVars}>
      <source media="(min-width: 768px)" srcSet={desktopSrcSet} sizes="100vw" />
      <img
        {...mobileImgProps}
        srcSet={mobileSrcSet}
        alt={slide.imageAlt}
        fetchPriority={isPrimary ? 'high' : 'auto'}
        decoding={isPrimary ? 'sync' : 'async'}
        onError={() => {
          if (slide.hasCustomMobile && !failedUrls[slide.mobileUrl]) {
            onImageError(slide.mobileUrl)
          } else {
            onImageError(slide.desktopUrl)
          }
        }}
        style={{
          ...mobileImgProps.style,
          objectFit: 'cover',
        }}
        className={cn(
          'hero-focal-img size-full object-cover transition-transform duration-[6000ms] ease-out',
          allowZoom ? 'scale-[1.03]' : 'scale-100',
        )}
      />
    </picture>
  )
}

export function HeroSlidePreviewCanvas({
  slide,
  viewport,
}: {
  slide: NormalizedSlide
  viewport: HeroPreviewViewport
}) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})
  const onImageError = useCallback((url: string) => {
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }, [])

  const frameClass =
    viewport === 'mobile'
      ? 'mx-auto w-full max-w-[390px] aspect-[4/5] min-h-[30rem]'
      : viewport === 'tablet'
        ? 'mx-auto w-full max-w-[768px] aspect-[16/10] min-h-[28rem]'
        : 'w-full aspect-video min-h-[28rem] max-h-[38rem]'

  const isMobile = viewport === 'mobile'
  const isTablet = viewport === 'tablet'

  return (
    <section
      aria-label={`Xem trước Slide (${viewport})`}
      className={cn(
        'relative flex flex-col justify-between overflow-hidden rounded-card bg-night text-inverse select-none',
        frameClass,
      )}
    >
      <div className="absolute inset-0" aria-hidden="true">
        <HeroSlideMedia
          slide={slide}
          isPrimary
          isCurrent
          isReducedMotion
          previewViewport={viewport}
          failedUrls={failedUrls}
          onImageError={onImageError}
        />
        <div className={cn('absolute inset-0 z-2', isMobile ? 'bg-night/72' : 'bg-night/48')} />
        <div className="hero-shade absolute inset-0 z-2" />
      </div>

      <div
        className={cn(
          'relative z-10 flex flex-1 flex-col justify-between gap-6',
          isMobile ? 'px-5 pb-10 pt-8' : isTablet ? 'px-8 pb-12 pt-10' : 'px-10 pb-14 pt-12',
        )}
      >
        <div className="max-w-hero-copy">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand/90 px-3 py-1 text-micro font-semibold text-inverse shadow-xs">
              <Icon name="road" className="size-3 text-brand-bright" />
              {slide.categoryBadge}
            </span>
            <Text className="flex items-center gap-2 text-micro font-medium tracking-widest text-inverse/90">
              <span className="h-px w-4 bg-brand-bright" />
              {slide.eyebrow}
            </Text>
          </div>

          <Heading
            as="h3"
            size="display"
            className={cn(
              'font-semibold leading-[1.15] tracking-tight text-inverse',
              isMobile ? 'text-[1.75rem]' : isTablet ? 'text-[2.25rem]' : 'text-[2.75rem]',
            )}
          >
            {slide.first}
            {slide.second && (
              <>
                <br />
                <span className="text-brand-bright">{slide.second}</span>
              </>
            )}
          </Heading>

          {slide.description && (
            <Text
              className={cn(
                'mt-3 max-w-reading line-clamp-3 leading-relaxed text-inverse/90',
                isMobile ? 'text-small' : 'text-body',
              )}
            >
              {slide.description}
            </Text>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-touch items-center gap-2 rounded-control bg-brand px-5 py-2.5 text-small font-semibold text-inverse shadow-md">
              {slide.ctaText}
              <Icon name="arrow-up-right" className="size-4" />
            </span>
            {slide.secondaryText && slide.secondaryHref && (
              <span className="inline-flex min-h-touch items-center gap-2 rounded-control border border-inverse/40 px-4 py-2.5 text-small font-medium text-inverse">
                {slide.secondaryText}
                <Icon name="arrow-right" className="size-3.5" />
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-micro text-inverse/80">
          <span className="truncate">
            {slide.credit
              ? `Hình ảnh tham khảo (${slide.credit})`
              : 'Không chỉ là điểm đến. Là trọn vẹn hành trình cùng NORI.'}
          </span>
          <span className="shrink-0 rounded-pill border border-inverse/20 bg-night/75 px-2.5 py-1 text-micro">
            {isMobile
              ? slide.hasCustomMobile
                ? 'Mobile · Ảnh riêng'
                : `Mobile · Crop từ Desktop (${slide.focalX}% ${slide.focalY}%)`
              : isTablet
                ? `Tablet · Crop 16:10 (${slide.focalX}% ${slide.focalY}%)`
                : `Desktop · 16:9 (${slide.focalX}% ${slide.focalY}%)`}
          </span>
        </div>
      </div>
    </section>
  )
}

export function Hero({
  images: _legacyImages,
  slides: cmsSlides,
  hasConfiguredSlides = false,
  autoplaySeconds = 6,
}: {
  images?: SiteContent['heroImages']
  slides?: HeroSlideView[]
  hasConfiguredSlides?: boolean
  autoplaySeconds?: number
}) {
  const slides = useMemo(() => {
    if (hasConfiguredSlides) {
      return normalizeCmsSlides(cmsSlides)
    }
    if (cmsSlides && cmsSlides.length > 0) {
      return normalizeCmsSlides(cmsSlides)
    }
    return defaultSlides
  }, [cmsSlides, hasConfiguredSlides])

  const [active, setActive] = useState(0)
  const [mountedIndices, setMountedIndices] = useState<number[]>([0])
  const [isPaused, setIsPaused] = useState(false)
  const [isControlHovered, setIsControlHovered] = useState(false)
  const [isControlsFocused, setIsControlsFocused] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  const [isTabHidden, setIsTabHidden] = useState(false)
  const [isReducedMotion, setIsReducedMotion] = useState(false)
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})

  const sectionRef = useRef<HTMLElement>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const totalSlides = slides.length
  const safeActive = totalSlides > 0 ? active % totalSlides : 0

  useEffect(() => {
    if (active >= totalSlides && totalSlides > 0) {
      setActive(0)
    }
  }, [active, totalSlides])

  useEffect(() => {
    setMountedIndices((prev) => (prev.includes(safeActive) ? prev : [...prev, safeActive]))
  }, [safeActive])

  // Respect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setIsReducedMotion(mediaQuery.matches)
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Pause timer when browser tab is inactive
  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibility = () => {
      setIsTabHidden(document.hidden)
    }
    handleVisibility()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const nextSlide = useCallback(() => {
    if (totalSlides <= 1) return
    setActive((prev) => (prev + 1) % totalSlides)
  }, [totalSlides])

  const prevSlide = useCallback(() => {
    if (totalSlides <= 1) return
    setActive((prev) => (prev - 1 + totalSlides) % totalSlides)
  }, [totalSlides])

  const handleImageError = useCallback((url: string) => {
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }))
  }, [])

  const currentSlide = slides[safeActive] ?? null
  const activeDurationSec = Math.min(
    30,
    Math.max(3, Number(currentSlide?.durationSeconds || autoplaySeconds || 6)),
  )

  const shouldAutoPlay =
    totalSlides > 1 &&
    !isPaused &&
    !isControlHovered &&
    !isControlsFocused &&
    !isTouching &&
    !isTabHidden &&
    !isReducedMotion

  // Single deterministic timeout per slide transition — zero overlapping intervals or memory leaks
  useEffect(() => {
    if (!shouldAutoPlay) return
    const timer = setTimeout(() => {
      setActive((prev) => (prev + 1) % totalSlides)
    }, activeDurationSec * 1000)
    return () => clearTimeout(timer)
  }, [shouldAutoPlay, safeActive, activeDurationSec, totalSlides])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
    touchStartY.current = e.touches[0]?.clientY ?? null
    setIsTouching(true)
  }

  const resetTouch = () => {
    touchStartX.current = null
    touchStartY.current = null
    setIsTouching(false)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null && touchStartY.current !== null && totalSlides > 1) {
      const endX = e.changedTouches[0]?.clientX ?? touchStartX.current
      const endY = e.changedTouches[0]?.clientY ?? touchStartY.current
      const diffX = touchStartX.current - endX
      const diffY = touchStartY.current - endY
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
        if (diffX > 0) nextSlide()
        else prevSlide()
      }
    }
    resetTouch()
  }

  // Fallback Hero when Admin disables all slides (HR-20)
  if (!currentSlide) {
    return (
      <section
        aria-label="Giới thiệu phương tiện NORI"
        className="relative overflow-hidden bg-night text-inverse"
      >
        <Container className="flex min-h-[24rem] flex-col justify-center pb-20 pt-12 md:min-h-[28rem] md:pb-28">
          <div className="max-w-hero-copy space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand/85 px-3 py-1 text-micro font-semibold text-inverse">
              <Icon name="road" className="size-3 text-brand-bright" />
              NORI · Thuê xe & Tìm mua xe minh bạch
            </span>
            <Heading as="h1" size="display" className="font-semibold leading-tight text-inverse">
              Mọi hành trình. <span className="text-brand-bright">Luôn có NORI.</span>
            </Heading>
            <Text className="max-w-reading text-small leading-relaxed text-inverse/85 md:text-body">
              Khám phá danh mục ô tô, xe máy, xe điện và bán tải với thông số xác thực và lịch khả
              dụng rõ ràng.
            </Text>
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink href="/vehicles">
                Khám phá phương tiện <Icon name="arrow-up-right" className="size-4" />
              </ButtonLink>
              <ButtonLink variant="inverse" href="/about#how-it-works">
                Cách NORI hoạt động
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section
      ref={sectionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Bộ sưu tập phương tiện & Hành trình NORI"
      onFocusCapture={() => setIsControlsFocused(true)}
      onBlurCapture={(e) => {
        if (!sectionRef.current?.contains(e.relatedTarget as Node | null)) {
          setIsControlsFocused(false)
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={resetTouch}
      onKeyDown={(e) => {
        if (totalSlides <= 1) return
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          prevSlide()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          nextSlide()
        }
      }}
      className="relative overflow-hidden bg-night select-none md:min-h-hero lg:max-h-[41rem]"
    >
      {/* Layered Crossfade Vehicle Slides (lazy mounted on demand; slide 0 prioritized) */}
      <div className="absolute inset-0" aria-hidden="true">
        {slides.map((slide, idx) => {
          const isCurrent = idx === safeActive
          const shouldMount = idx === 0 || isCurrent || mountedIndices.includes(idx)
          if (!shouldMount) return null

          return (
            <div
              key={slide.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-out',
                isCurrent ? 'z-1 opacity-100' : 'z-0 opacity-0 pointer-events-none',
              )}
            >
              <HeroSlideMedia
                slide={slide}
                isPrimary={idx === 0}
                isCurrent={isCurrent}
                isReducedMotion={isReducedMotion}
                failedUrls={failedUrls}
                onImageError={handleImageError}
              />
            </div>
          )
        })}
        {/* Contrast overlays for WCAG AA readability on both mobile & desktop */}
        <div className="absolute inset-0 z-2 bg-night/72 md:bg-night/48" />
        <div className="hero-shade absolute inset-0 z-2" />
      </div>

      {/* Foreground Content & Controls in Normal Document Flow (Zero Overlap Across 320px-1920px) */}
      <Container className="relative z-10 flex min-h-hero-mobile flex-col justify-between gap-7 pb-18 pt-8 text-inverse sm:aspect-[4/3] md:aspect-[16/10] md:min-h-hero md:max-h-[41rem] md:pb-26 md:pt-12 lg:aspect-video">
        <div
          key={`hero-copy-${currentSlide.id}-${safeActive}`}
          className="max-w-hero-copy pt-2 md:pt-4 animate-enter"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2.5 md:mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand/90 px-3 py-1 text-micro font-semibold text-inverse shadow-xs">
              <Icon name="road" className="size-3 text-brand-bright" />
              {currentSlide.categoryBadge}
            </span>
            <Text className="flex items-center gap-2 text-micro font-medium tracking-widest text-inverse/90 md:text-caption">
              <span className="h-px w-4 bg-brand-bright sm:w-6" />
              {currentSlide.eyebrow}
            </Text>
          </div>

          <Heading
            as="h1"
            size="display"
            className="text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.5rem] lg:text-[3.25rem]"
          >
            {currentSlide.first}
            {currentSlide.second && (
              <>
                <br />
                <span className="text-brand-bright">{currentSlide.second}</span>
              </>
            )}
          </Heading>

          {currentSlide.description && (
            <Text className="mt-3.5 max-w-reading line-clamp-3 text-small leading-relaxed text-inverse/90 md:mt-4 md:text-body md:leading-loose">
              {currentSlide.description}
            </Text>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 md:mt-6">
            <ButtonLink
              href={currentSlide.ctaHref}
              className="gap-2.5 px-5 text-small font-semibold shadow-md focus-visible:outline-inverse md:px-6"
            >
              {currentSlide.ctaText}
              <Icon name="arrow-up-right" className="size-4" />
            </ButtonLink>

            {currentSlide.secondaryText && currentSlide.secondaryHref && (
              <ButtonLink
                variant="inverse"
                href={currentSlide.secondaryHref}
                className="px-4 text-small font-medium focus-visible:outline-inverse md:px-5"
              >
                {currentSlide.secondaryText}
                <Icon name="arrow-right" className="size-3.5" />
              </ButtonLink>
            )}
          </div>
        </div>

        {/* Bottom Carousel Controls Bar */}
        <div
          onMouseEnter={() => setIsControlHovered(true)}
          onMouseLeave={() => setIsControlHovered(false)}
          className="flex flex-wrap items-center justify-between gap-3 pt-2"
        >
          <div className="hidden items-center gap-2 text-micro text-inverse/80 md:flex">
            <Icon name="pin" className="size-3.5 text-brand-bright" />
            <span>
              {currentSlide.credit
                ? `Hình ảnh phương tiện tham khảo (${currentSlide.credit}) · Xem kho xe thực tế tại chi tiết từng dòng xe.`
                : 'Không chỉ là điểm đến. Là trọn vẹn hành trình cùng NORI.'}
            </span>
          </div>

          {totalSlides > 1 && (
            <div className="ml-auto flex items-center gap-1.5 rounded-pill border border-inverse/20 bg-night/85 px-2.5 py-1.5 shadow-float backdrop-blur-md sm:gap-2 sm:px-3">
              <Button
                variant="ghost"
                size="cell"
                aria-label="Chuyển về slide trước"
                onClick={prevSlide}
                className="min-h-7 min-w-7 size-7 rounded-pill text-inverse hover:bg-inverse/20"
              >
                <Icon name="chevron-left" className="size-3.5" />
              </Button>

              <Text
                as="span"
                className="hidden px-1 text-caption font-semibold tracking-wider text-inverse sm:inline"
              >
                0{safeActive + 1}
                <span className="ml-0.5 text-micro text-inverse/60">/ 0{totalSlides}</span>
              </Text>

              <div className="flex items-center gap-0.5 px-0.5" aria-label="Chỉ số slide">
                {slides.map((s, i) => {
                  const isCurrent = safeActive === i
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={isCurrent}
                      aria-label={`Xem thông điệp ${i + 1}`}
                      title={`Slide ${i + 1}: ${s.categoryBadge}`}
                      onClick={() => setActive(i)}
                      className="group relative flex min-h-7 min-w-7 items-center justify-center px-1 focus-visible:outline-inverse"
                    >
                      <span
                        className={cn(
                          'relative block h-1.5 overflow-hidden rounded-pill transition-all duration-300',
                          isCurrent
                            ? 'w-6 bg-inverse/30'
                            : 'w-2 bg-inverse/40 group-hover:w-3.5 group-hover:bg-inverse/70',
                        )}
                      >
                        {isCurrent && (
                          <span
                            key={`prog-${safeActive}-${shouldAutoPlay ? 'run' : 'hold'}`}
                            className="block h-full rounded-pill bg-brand-bright"
                            style={
                              shouldAutoPlay
                                ? {
                                    animation: `noriHeroProgress ${activeDurationSec}s linear forwards`,
                                  }
                                : { width: '100%' }
                            }
                          />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>

              <Button
                variant="ghost"
                size="cell"
                aria-label="Chuyển sang slide tiếp theo"
                onClick={nextSlide}
                className="min-h-7 min-w-7 size-7 rounded-pill text-inverse hover:bg-inverse/20"
              >
                <Icon name="chevron-right" className="size-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="cell"
                aria-pressed={isPaused}
                aria-label={
                  isPaused ? 'Tiếp tục tự động chuyển slide' : 'Tạm dừng tự động chuyển slide'
                }
                title={isPaused ? 'Tiếp tục tự động chuyển' : 'Tạm dừng tự động chuyển'}
                onClick={() => setIsPaused((prev) => !prev)}
                className="ml-0.5 min-h-7 min-w-7 size-7 rounded-pill border-l border-inverse/20 pl-1.5 text-inverse/90 hover:bg-inverse/20 hover:text-inverse"
              >
                {isPaused ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    className="size-3"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    className="size-3"
                  >
                    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
                  </svg>
                )}
              </Button>
            </div>
          )}
        </div>
      </Container>
    </section>
  )
}
