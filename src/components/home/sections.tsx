import Image from 'next/image'
import type { Photo } from '@/lib/catalogue'
import { ButtonLink, Container, Eyebrow, Heading, NoriLink, Text } from '@/components/ui'
import { Icon, type IconName } from '@/components/ui/icon'

const benefits: { icon: IconName; title: string; text: string }[] = [
  { icon: 'shield', title: 'Thông tin minh bạch', text: 'Hiểu rõ chiếc xe trước khi lựa chọn' },
  { icon: 'calendar', title: 'Chủ động lịch trình', text: 'Chọn ngày phù hợp với kế hoạch' },
  { icon: 'wallet', title: 'Chi phí rõ ràng', text: 'Xem báo giá trước khi xác nhận' },
  { icon: 'headphones', title: 'Đồng hành tận tâm', text: 'Hướng dẫn từ đặt xe đến nhận xe' },
]

export function Benefits() {
  return (
    <div className="grid gap-7 border-b border-line pb-10 pt-11 sm:grid-cols-2 lg:grid-cols-4">
      {benefits.map((b) => (
        <div key={b.title} className="flex items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
            <Icon name={b.icon} className="size-5" />
          </div>
          <div>
            <Text className="text-small font-semibold">{b.title}</Text>
            <Text className="mt-0.5 text-micro text-muted">{b.text}</Text>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Story({ image }: { image: Photo | null }) {
  return (
    <section className="overflow-hidden rounded-panel bg-soft">
      <div className="grid lg:grid-cols-2">
        <div className="flex flex-col justify-center px-7 py-10 md:px-12 md:py-14">
          <Eyebrow>NORI — KHÔNG CHỈ LÀ THUÊ XE</Eyebrow>
          <Heading size="section">
            Những chuyến đi đáng nhớ
            <br />
            bắt đầu từ sự an tâm.
          </Heading>
          <Text className="mt-5 max-w-reading text-small leading-loose text-muted">
            Một chuyến về nhà. Một cuối tuần đổi gió. Hay khởi đầu cho những kế hoạch lớn. NORI tin
            rằng bạn xứng đáng tận hưởng mọi hành trình theo cách riêng.
          </Text>
          <div className="mt-6 flex items-center gap-3 text-small font-medium">
            <span className="flex size-6 items-center justify-center rounded-pill bg-brand text-inverse">
              <Icon name="check" className="size-3.5" />
            </span>
            Rõ thông tin. Gọn thao tác. Trọn trải nghiệm.
          </div>
          <div className="mt-8">
            <ButtonLink href="/about" variant="dark" className="text-small">
              Câu chuyện NORI <Icon name="arrow-up-right" className="size-4" />
            </ButtonLink>
          </div>
        </div>
        <div className="relative min-h-72 overflow-hidden lg:min-h-full">
          {image ? (
            <Image
              src={image.url}
              alt={image.alt}
              fill
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              sizes="(max-width: 1023px) 100vw, 640px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full min-h-72 items-center justify-center bg-brand/10">
              <Icon name="road" className="size-24 text-brand/25" />
            </div>
          )}
          <div className="image-shade absolute inset-0" />
          <div className="absolute bottom-7 left-7 text-inverse">
            <Text className="text-caption uppercase tracking-widest">GO YOUR OWN WAY</Text>
            <Text className="mt-2 text-title font-medium">Đi để có câu chuyện của riêng mình.</Text>
          </div>
        </div>
      </div>
    </section>
  )
}

export const steps = [
  {
    number: '01',
    icon: 'search' as const,
    title: 'Tìm chiếc xe phù hợp',
    description: 'Khám phá phương tiện và chọn chiếc xe dành cho hành trình của bạn.',
  },
  {
    number: '02',
    icon: 'calendar' as const,
    title: 'Chọn lịch, xem báo giá',
    description: 'Kiểm tra ngày còn trống và chi phí thực tế trước khi gửi đơn thuê.',
  },
  {
    number: '03',
    icon: 'road' as const,
    title: 'Nhận xe & lên đường',
    description: 'Chờ NORI xác nhận, hoàn tất thủ tục tại điểm nhận và bắt đầu chuyến đi.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-14 md:py-section">
      <div className="text-center">
        <Eyebrow>ĐƠN GIẢN TỪ BƯỚC ĐẦU TIÊN</Eyebrow>
        <Heading>Ba bước. Một hành trình mới.</Heading>
        <Text className="mt-3 text-muted">
          Bớt lo thủ tục, thêm thời gian cho những trải nghiệm.
        </Text>
      </div>
      <div className="mt-11 grid gap-8 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.number} className="relative rounded-card border border-line p-7">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex size-12 items-center justify-center rounded-card bg-brand-soft text-brand">
                <Icon name={step.icon} className="size-6" />
              </div>
              <Text aria-hidden="true" className="text-section font-medium text-control-line">
                {step.number}
              </Text>
            </div>
            <Heading as="h3" size="subtitle">
              {step.title}
            </Heading>
            <Text className="mt-3 text-small leading-loose text-muted">{step.description}</Text>
            {index < 2 && (
              <span className="absolute -right-5 top-12 z-10 hidden size-8 items-center justify-center rounded-pill border border-line bg-canvas text-muted md:flex">
                <Icon name="arrow-right" className="size-4" />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export function CallToAction() {
  return (
    <section className="bg-soft">
      <Container className="flex flex-col items-start justify-between gap-7 py-11 md:flex-row md:items-center">
        <div>
          <Text className="mb-2 text-caption font-medium tracking-widest text-brand">
            HÀNH TRÌNH TIẾP THEO ĐANG CHỜ BẠN.
          </Text>
          <Heading size="title">Bạn chọn điểm đến. NORI cùng bạn khởi hành.</Heading>
        </div>
        <ButtonLink href="/vehicles" className="shrink-0 px-6">
          Tìm xe của bạn <Icon name="arrow-up-right" className="size-4" />
        </ButtonLink>
      </Container>
    </section>
  )
}
