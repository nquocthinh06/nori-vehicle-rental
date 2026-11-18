'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, ModelView } from '@/lib/catalogue'
import { Button, ButtonLink, EmptyState, Heading, NoriLink, Text, cn } from '@/components/ui'
import { Icon, type IconName } from '@/components/ui/icon'
import { VehicleCard, categoryIcons, categoryLabels } from '@/components/vehicle-card'

type CategoryShowcase = {
  key: Category | 'EV'
  title: string
  subtitle: string
  description: string
  icon: IconName
  href: string
  image: string
  imageAlt: string
  subtypes: string[]
  accentBadge: string
}

const categoryCards: CategoryShowcase[] = [
  {
    key: 'CAR',
    title: 'Xe Ô tô',
    subtitle: '4 – 7 chỗ gia đình & doanh nhân',
    description: 'Sedan, SUV, CUV & MPV tiện nghi. Động cơ bền bỉ, khoang hành lý rộng rãi.',
    icon: 'car',
    href: '/vehicles?type=CAR',
    image: '/seed-media/toyota-fortuner-ext-1.jpg',
    imageAlt: 'Xe ô tô du lịch và gia đình tiện nghi NORI',
    subtypes: ['Sedan', 'SUV', 'CUV', 'MPV 7 chỗ', 'Xe sang'],
    accentBadge: 'Phổ biến nhất',
  },
  {
    key: 'MOTORBIKE',
    title: 'Xe Máy',
    subtitle: 'Linh hoạt đô thị & Khám phá cung đèo',
    description: 'Xe tay ga cao cấp SH350i, PCX 160, xe côn tay thể thao và môtô phân khối lớn.',
    icon: 'motorbike',
    href: '/vehicles?type=MOTORBIKE',
    image: '/seed-media/honda-sh350i-ext-1.jpg',
    imageAlt: 'Xe máy và môtô thể thao tự do di chuyển NORI',
    subtypes: ['Tay ga', 'Xe số', 'Côn tay', 'Mô tô PKL'],
    accentBadge: 'Tiết kiệm nhiên liệu',
  },
  {
    key: 'PICKUP',
    title: 'Xe Bán Tải',
    subtitle: 'Hệ dẫn động 4x4 & Động cơ Bi-Turbo',
    description: 'Ford Ranger Raptor, Wildtrak và Triton Athlete. Thùng hàng lớn, off-road uy lực.',
    icon: 'pickup',
    href: '/vehicles?type=PICKUP',
    image: '/seed-media/ford-ranger-raptor-ext-1.jpg',
    imageAlt: 'Xe bán tải địa hình hai cầu mạnh mẽ NORI',
    subtypes: ['4x4 Hai cầu', 'Raptor V6', 'Gầm cao', 'Off-road'],
    accentBadge: 'Chở hàng & Dã ngoại',
  },
  {
    key: 'EV',
    title: 'Xe Điện Thông Minh',
    subtitle: 'Bộ sưu tập di chuyển xanh tương lai',
    description: 'VinFast VF 8 Plus SUV điện thông minh cùng xe máy điện VinFast Evo200 hiện đại.',
    icon: 'road',
    href: '/vehicles?fuel=Điện (EV)',
    image: '/seed-media/vinfast-vf8-ext-1.jpg',
    imageAlt: 'Xe điện thông minh VinFast VF8 tại NORI',
    subtypes: ['SUV Điện', 'Xe máy điện', 'Trợ lái ADAS', '0 Khí thải'],
    accentBadge: 'Thân thiện môi trường',
  },
]

export function Featured({ models }: { models: ModelView[] }) {
  const [category, setCategory] = useState<Category | ''>('')
  const [belowFoldReady, setBelowFoldReady] = useState(false)
  const discoverRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (belowFoldReady) return
    const enable = () => setBelowFoldReady(true)
    if (document.readyState === 'complete') {
      const id = window.setTimeout(enable, 60)
      return () => window.clearTimeout(id)
    }
    window.addEventListener('load', enable, { once: true })
    const timer = window.setTimeout(enable, 1800)
    const observer =
      typeof IntersectionObserver !== 'undefined' && discoverRef.current
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) enable()
            },
            { rootMargin: '200px' },
          )
        : null
    if (observer && discoverRef.current) observer.observe(discoverRef.current)
    return () => {
      window.removeEventListener('load', enable)
      window.clearTimeout(timer)
      observer?.disconnect()
    }
  }, [belowFoldReady])

  // Calculate live vehicle counts
  const categoryCounts = useMemo(() => {
    return {
      CAR: models.filter((m) => m.category === 'CAR').length,
      MOTORBIKE: models.filter((m) => m.category === 'MOTORBIKE').length,
      PICKUP: models.filter((m) => m.category === 'PICKUP').length,
      EV: models.filter((m) => m.fuelType?.includes('Điện')).length,
    }
  }, [models])

  const visible = models.filter((m) => !category || m.category === category).slice(0, 6)

  return (
    <section ref={discoverRef} id="discover" className="py-14 md:py-section">
      {/* Section Header */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-reading">
          <Text className="mb-2 text-caption font-semibold uppercase tracking-widest text-brand">
            DANH MỤC PHƯƠNG TIỆN NORI
          </Text>
          <Heading as="h2" size="section">
            Chọn xe đúng nhu cầu. Trọn vẹn hành trình.
          </Heading>
          <Text className="mt-3 text-muted">
            3 nhóm phương tiện chính và bộ sưu tập xe điện xanh. Thông số kỹ thuật xác thực, hỗ trợ
            thuê tự lái và lái thử trước khi mua.
          </Text>
        </div>
        <ButtonLink href="/vehicles" variant="secondary" className="text-small font-semibold">
          Xem toàn bộ đội xe <Icon name="arrow-up-right" className="size-4" />
        </ButtonLink>
      </div>

      {/* Modern Vehicle Category Cards Grid with Real Photography */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {categoryCards.map((cat) => {
          const count = cat.key === 'EV' ? categoryCounts.EV : categoryCounts[cat.key]
          return (
            <NoriLink
              key={cat.key}
              href={cat.href}
              className="group relative flex flex-col overflow-hidden rounded-card border border-line/75 bg-canvas shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-brand/50 hover:shadow-card focus-visible:outline-2 focus-visible:outline-brand"
            >
              {/* Photo Area */}
              <div className="relative aspect-vehicle w-full overflow-hidden bg-night/5">
                {belowFoldReady && (
                  <Image
                    src={cat.image}
                    alt={cat.imageAlt}
                    fill
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-night/70 via-night/10 to-transparent" />

                {/* Badge top-left */}
                <div className="absolute left-3 top-3">
                  <span className="inline-flex items-center gap-1 rounded-pill bg-canvas/90 px-2.5 py-0.5 text-micro font-semibold text-brand shadow-xs backdrop-blur-xs">
                    <Icon name={cat.icon} className="size-3" />
                    {cat.accentBadge}
                  </span>
                </div>

                {/* Live count bottom-left */}
                <div className="absolute bottom-3 left-3 text-inverse">
                  <span className="text-small font-bold drop-shadow-sm">
                    {count} dòng xe khả dụng
                  </span>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between">
                  <Heading
                    as="h3"
                    size="subtitle"
                    className="group-hover:text-brand transition-colors"
                  >
                    {cat.title}
                  </Heading>
                  <Icon
                    name="arrow-up-right"
                    className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                  />
                </div>

                <Text className="mt-1 text-caption font-medium text-brand">{cat.subtitle}</Text>

                <Text className="mt-2 line-clamp-2 text-caption text-muted leading-relaxed">
                  {cat.description}
                </Text>

                {/* Subtype tags */}
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/60 pt-3">
                  {cat.subtypes.map((sub) => (
                    <span
                      key={sub}
                      className="rounded-sm bg-subtle px-2 py-0.5 text-micro font-medium text-muted"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>
            </NoriLink>
          )
        })}
      </div>

      {/* Featured Fleet Filter Pill Bar */}
      <div className="mt-14 border-t border-line/80 pt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Heading as="h3" size="title">
              Dòng xe tiêu biểu
            </Heading>
            <Text className="mt-1 text-small text-muted">
              Lựa chọn được khách hàng yêu thích và đặt nhiều nhất tại NORI
            </Text>
          </div>

          <div aria-label="Lọc dòng xe tiêu biểu" className="flex flex-wrap gap-2">
            {(['', 'CAR', 'MOTORBIKE', 'PICKUP'] as const).map((c) => (
              <Button
                key={c}
                aria-pressed={category === c}
                variant={category === c ? 'dark' : 'secondary'}
                onClick={() => setCategory(c)}
                className={cn(
                  'min-h-control-sm rounded-pill px-4 py-1.5 text-small font-semibold',
                  category !== c && 'border-transparent bg-subtle hover:bg-line/60',
                )}
              >
                {c ? (
                  <Icon name={categoryIcons[c]} className="size-3.5" />
                ) : (
                  <Icon name="grid" className="size-3.5" />
                )}
                {c ? categoryLabels[c] : 'Tất cả'}
              </Button>
            ))}
          </div>
        </div>

        {/* Featured Vehicle Cards Grid */}
        <div className="mt-7">
          {visible.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((m) => (
                <VehicleCard key={m.id} model={m} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Danh mục đang được cập nhật"
              description="NORI sẽ hiển thị phương tiện ngay khi thông tin được xác nhận. Bạn có thể khám phá các danh mục khác."
            />
          )}
        </div>

        <Text className="mt-6 flex items-start justify-center gap-2 text-center text-micro text-muted">
          <Icon name="info" className="mt-0.5 size-3.5 text-brand" />
          Hình ảnh catalogue tham khảo từ nhà sản xuất chính hãng. Giá thuê, cọc và tình trạng kiểm
          định ODO được đồng bộ theo từng cá thể xe thực tế.
        </Text>
      </div>
    </section>
  )
}
