'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { SiteContent } from '@/lib/catalogue'
import { Button, ButtonLink, Container, Heading, Text, cn } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

const copy = [
  {
    eyebrow: 'TỰ DO KHỞI HÀNH. TRỌN VẸN TRẢI NGHIỆM.',
    first: 'Mọi hành trình.',
    second: 'Luôn có NORI.',
    description:
      'Từ những góc phố quen đến những cung đường mới.\nChọn chiếc xe phù hợp, tận hưởng hành trình theo cách của bạn.',
  },
  {
    eyebrow: 'ĐI XA HƠN. TRẢI NGHIỆM NHIỀU HƠN.',
    first: 'Một lựa chọn.',
    second: 'Ngàn khám phá.',
    description:
      'Đổi nhịp sống thường ngày bằng một chuyến đi mới.\nNORI đồng hành cùng bạn từ những điều giản đơn.',
  },
  {
    eyebrow: 'CHIẾC XE PHÙ HỢP. HÀNH TRÌNH CỦA RIÊNG BẠN.',
    first: 'Chạm ước mơ.',
    second: 'Mở lối riêng.',
    description:
      'Thuê linh hoạt cho hôm nay, tìm chiếc xe cho ngày mai.\nKhám phá những lựa chọn cùng NORI.',
  },
]

export function Hero({ images }: { images: SiteContent['heroImages'] }) {
  const [active, setActive] = useState(0)
  const slide = copy[active]
  const image = images[active % Math.max(images.length, 1)]?.image
  return (
    <section
      aria-roledescription="băng chuyền"
      aria-label="Cảm hứng hành trình NORI"
      className="relative min-h-hero-mobile overflow-hidden bg-night md:h-hero"
    >
      {image && (
        <Image
          key={image.url}
          src={image.url}
          alt={image.alt}
          fill
          sizes="100vw"
          preload
          className="object-cover object-center"
        />
      )}
      <div className="absolute inset-0 bg-night/70 md:bg-transparent" />
      <div className="hero-shade absolute inset-0" />
      <Container className="relative flex min-h-hero-mobile flex-col justify-center pb-40 pt-12 text-inverse md:h-full md:min-h-0 md:pb-24 md:pt-8">
        <div key={active} className="max-w-hero-copy animate-enter">
          <Text className="mb-4 flex items-center gap-3 text-micro font-medium tracking-widest text-inverse/90 md:mb-6 md:text-caption">
            <span className="h-px w-7 bg-brand-bright" />
            {slide.eyebrow}
          </Text>
          <Heading as="h1" size="hero" className="font-medium leading-tight">
            {slide.first}
            <br />
            <span className="text-brand-bright">{slide.second}</span>
          </Heading>
          <Text className="mt-5 max-w-reading whitespace-pre-line text-small leading-loose text-inverse/85 md:mt-6 md:text-body">
            {slide.description}
          </Text>
          <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
            <ButtonLink href="/vehicles" className="gap-5 px-6 focus-visible:outline-inverse">
              Khám phá xe <Icon name="arrow-up-right" className="size-4" />
            </ButtonLink>
            <ButtonLink
              variant="inverse"
              href="/about#how-it-works"
              className="px-5 text-small focus-visible:outline-inverse"
            >
              Cách NORI hoạt động <Icon name="arrow-right" className="size-4" />
            </ButtonLink>
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-24 flex items-center justify-between md:inset-x-8 md:bottom-28 xl:inset-x-page">
          <div className="hidden items-center gap-2 text-micro text-inverse/75 md:flex">
            <Icon name="pin" className="size-3.5" />
            Không chỉ là điểm đến. Là cả hành trình.
          </div>
          <div className="ml-auto flex items-center gap-4 rounded-pill bg-night/80 px-3">
            <Text as="span" className="text-small font-semibold">
              0{active + 1}
              <span className="ml-2 text-inverse/90">/ 03</span>
            </Text>
            <div className="flex gap-1.5">
              {copy.map((_, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  aria-label={`Xem thông điệp ${i + 1}`}
                  aria-pressed={active === i}
                  onClick={() => setActive(i)}
                  className="min-h-touch rounded-none p-0 px-1 hover:bg-transparent focus-visible:inset-ring-2 focus-visible:inset-ring-inverse"
                >
                  <span
                    className={cn(
                      'h-0.5 w-6 transition-colors',
                      active === i ? 'bg-inverse' : 'bg-inverse/55',
                    )}
                  />
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
