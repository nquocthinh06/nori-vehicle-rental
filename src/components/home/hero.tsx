'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HeroSlideView, SiteContent } from '@/lib/catalogue'
import { Button, ButtonLink, Container, Heading, Text, cn } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

type NormalizedSlide = {
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
  mobileUrl: string
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
    mobileUrl: '/seed-media/toyota-fortuner-ext-3.jpg',
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
    mobileUrl: '/seed-media/mazda-cx5-ext-1.jpg',
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
    mobileUrl: '/seed-media/mercedes-c300-ext-1.jpg',
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
    mobileUrl: '/seed-media/vinfast-evo200-ext-1.jpg',
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
    mobileUrl: '/seed-media/ford-ranger-raptor-ext-1.jpg',
    imageAlt: 'Xe bán tải Ford Ranger Raptor chinh phục cung đường khám phá cùng NORI',
    credit: 'Alexander-93 · CC BY-SA 4.0',
  },
]

function normalizeCmsSlides(cmsSlides?: HeroSlideView[]): NormalizedSlide[] {
  if (!cmsSlides || cmsSlides.length === 0) return []
  return cmsSlides.map((s, idx) => {
    const fallback = defaultSlides[idx % defaultSlides.length]
    const desktopUrl = s.desktopImage?.url || fallback.desktopUrl
    const mobileUrl = s.mobileImage?.url || desktopUrl
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
      mobileUrl,
      imageAlt,
      credit: s.credit,
      durationSeconds: s.durationSeconds,
    }
  })
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
      className="relative overflow-hidden bg-night select-none md:min-h-hero"
    >
      {/* Layered Crossfade Vehicle Slides */}
      <div className="absolute inset-0" aria-hidden="true">
        {slides.map((slide, idx) => {
          const isCurrent = idx === safeActive
          const resolvedDesktop = failedUrls[slide.desktopUrl]
            ? FALLBACK_SLIDE_IMAGE
            : slide.desktopUrl
          const resolvedMobile = failedUrls[slide.mobileUrl] ? resolvedDesktop : slide.mobileUrl
          const hasDistinctMobile = resolvedMobile !== resolvedDesktop

          return (
            <div
              key={slide.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-out',
                isCurrent ? 'z-1 opacity-100' : 'z-0 opacity-0 pointer-events-none',
              )}
            >
              <Image
                src={resolvedDesktop}
                alt={slide.imageAlt}
                fill
                sizes="100vw"
                priority={idx === 0}
                onError={() =>
                  setFailedUrls((prev) =>
                    prev[slide.desktopUrl] ? prev : { ...prev, [slide.desktopUrl]: true },
                  )
                }
                className={cn(
                  'object-cover object-center transition-transform duration-[6000ms] ease-out',
                  hasDistinctMobile && 'hidden md:block',
                  isCurrent && !isReducedMotion ? 'scale-[1.03]' : 'scale-100',
                )}
              />
              {hasDistinctMobile && (
                <Image
                  src={resolvedMobile}
                  alt={slide.imageAlt}
                  fill
                  sizes="100vw"
                  priority={idx === 0}
                  onError={() =>
                    setFailedUrls((prev) =>
                      prev[slide.mobileUrl] ? prev : { ...prev, [slide.mobileUrl]: true },
                    )
                  }
                  className={cn(
                    'object-cover object-center md:hidden transition-transform duration-[6000ms] ease-out',
                    isCurrent && !isReducedMotion ? 'scale-[1.03]' : 'scale-100',
                  )}
                />
              )}
            </div>
          )
        })}
        {/* Contrast overlays for WCAG AA readability on both mobile & desktop */}
        <div className="absolute inset-0 z-2 bg-night/72 md:bg-night/48" />
        <div className="hero-shade absolute inset-0 z-2" />
      </div>

      {/* Foreground Content & Controls in Normal Document Flow (Zero Overlap Across 320px-1920px) */}
      <Container className="relative z-10 flex min-h-hero-mobile flex-col justify-between gap-7 pb-18 pt-8 text-inverse md:min-h-hero md:pb-26 md:pt-12">
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
