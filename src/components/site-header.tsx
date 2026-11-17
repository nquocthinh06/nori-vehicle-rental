'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Brand } from './brand'
import { Button, ButtonLink, Container, Heading, IconButton, NoriLink, Text, cn } from './ui'
import { Icon } from './ui/icon'
import { useAuth } from './auth-provider'

const categories = [
  { name: 'Ô tô', detail: 'Thoải mái trên mọi cung đường', icon: 'car' as const, type: 'CAR' },
  {
    name: 'Xe máy',
    detail: 'Tự do khám phá từng góc phố',
    icon: 'motorbike' as const,
    type: 'MOTORBIKE',
  },
  {
    name: 'Bán tải',
    detail: 'Sẵn sàng cho hành trình mới',
    icon: 'pickup' as const,
    type: 'PICKUP',
  },
]

export function SiteHeader() {
  const [open, setOpen] = useState<'rent' | 'discover' | null>(null)
  const [mobile, setMobile] = useState(false)
  const pathname = usePathname()
  const headerRef = useRef<HTMLElement>(null)
  const { user } = useAuth()

  useEffect(() => {
    setOpen(null)
    setMobile(false)
  }, [pathname])
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(null)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const trigger = headerRef.current?.querySelector<HTMLButtonElement>(
          'button[aria-expanded="true"]',
        )
        setOpen(null)
        setMobile(false)
        trigger?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  return (
    <header ref={headerRef} className="relative z-40 bg-canvas">
      <div className="hidden h-topbar bg-night text-inverse md:block">
        <Container className="flex h-full items-center justify-between text-micro">
          <Text as="span" className="flex items-center gap-2 font-medium tracking-widest">
            <Icon name="road" className="size-3.5 text-brand-bright" /> ĐI THEO CÁCH CỦA BẠN.
          </Text>
          <div className="flex items-center gap-6 text-on-night-muted">
            <NoriLink href="/support" className="flex items-center gap-1.5 hover:text-inverse">
              <Icon name="headphones" className="size-3.5" />
              Trung tâm hỗ trợ
            </NoriLink>
            <NoriLink href="/my-bookings" className="hover:text-inverse">
              Tra cứu đơn thuê
              <Icon name="arrow-up-right" className="ml-1 inline size-3" />
            </NoriLink>
          </div>
        </Container>
      </div>
      <Container className="flex h-header items-center justify-between gap-6">
        <Brand />
        <nav aria-label="Điều hướng chính" className="hidden h-full items-center gap-8 lg:flex">
          <Button
            variant="ghost"
            aria-expanded={open === 'rent'}
            aria-controls="mega-rent"
            className={cn('h-full rounded-none px-0 text-small', open === 'rent' && 'text-brand')}
            onClick={() => setOpen(open === 'rent' ? null : 'rent')}
          >
            Thuê xe{' '}
            <Icon
              name="chevron-down"
              className={cn('size-3.5 transition-transform', open === 'rent' && 'rotate-180')}
            />
          </Button>
          <NoriLink
            href="/vehicles?intent=buy"
            className="flex min-h-touch items-center text-small font-medium"
          >
            Mua xe
          </NoriLink>
          <Button
            variant="ghost"
            aria-expanded={open === 'discover'}
            aria-controls="mega-discover"
            className={cn(
              'h-full rounded-none px-0 text-small',
              open === 'discover' && 'text-brand',
            )}
            onClick={() => setOpen(open === 'discover' ? null : 'discover')}
          >
            Khám phá NORI{' '}
            <Icon
              name="chevron-down"
              className={cn('size-3.5 transition-transform', open === 'discover' && 'rotate-180')}
            />
          </Button>
        </nav>
        <div className="flex items-center gap-4">
          <Text
            as="span"
            className="hidden items-center gap-1.5 border-r border-line pr-4 text-small text-muted xl:flex"
          >
            <Icon name="globe" className="size-4" /> VI
          </Text>
          <NoriLink
            href={user ? '/account' : '/login'}
            className="hidden min-h-touch items-center gap-2 text-small font-medium sm:flex"
          >
            <Icon name="user" className="size-4" />
            <span className="max-w-32 truncate">
              {user ? user.fullName.split(' ').at(-1) : 'Đăng nhập'}
            </span>
          </NoriLink>
          <div className="hidden md:block">
            <ButtonLink href="/vehicles" className="text-small">
              Tìm xe ngay <Icon name="arrow-up-right" className="size-4" />
            </ButtonLink>
          </div>
          <IconButton
            icon={mobile ? 'close' : 'menu'}
            label={mobile ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            className="lg:hidden"
            onClick={() => setMobile(!mobile)}
          />
        </div>
      </Container>
      {open === 'rent' && (
        <div
          id="mega-rent"
          className="absolute inset-x-0 top-full border-t border-line bg-canvas py-8 shadow-float"
        >
          <Container className="grid grid-cols-4 gap-6">
            <div className="pr-4">
              <Text className="mb-3 text-caption font-medium uppercase tracking-widest text-brand">
                Chọn bạn đồng hành
              </Text>
              <Heading size="title">
                Một chiếc xe.
                <br />
                Nhiều trải nghiệm.
              </Heading>
              <NoriLink
                href="/vehicles"
                onClick={() => setOpen(null)}
                className="mt-5 inline-flex items-center gap-2 text-small font-semibold"
              >
                Xem tất cả <Icon name="arrow-right" className="size-4" />
              </NoriLink>
            </div>
            {categories.map((c) => (
              <NoriLink
                href={`/vehicles?type=${c.type}`}
                key={c.type}
                onClick={() => setOpen(null)}
                className="group rounded-card bg-subtle p-6 hover:bg-brand-soft"
              >
                <Icon name={c.icon} className="mb-5 size-9 text-brand" />
                <Heading as="h3" size="subtitle">
                  {c.name}
                </Heading>
                <Text className="mt-2 text-small text-muted">{c.detail}</Text>
                <Icon
                  name="arrow-up-right"
                  className="mt-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                />
              </NoriLink>
            ))}
          </Container>
        </div>
      )}
      {open === 'discover' && (
        <div
          id="mega-discover"
          className="absolute inset-x-0 top-full border-t border-line bg-canvas py-6 shadow-float"
        >
          <Container className="flex justify-center gap-12">
            <NoriLink href="/about" onClick={() => setOpen(null)}>
              Câu chuyện NORI
            </NoriLink>
            <NoriLink href="/about#how-it-works" onClick={() => setOpen(null)}>
              Hướng dẫn thuê xe
            </NoriLink>
            <NoriLink href="/support" onClick={() => setOpen(null)}>
              Câu hỏi thường gặp
            </NoriLink>
          </Container>
        </div>
      )}
      {mobile && (
        <nav
          id="mobile-menu"
          aria-label="Điều hướng di động"
          className="absolute inset-x-0 top-full max-h-screen overflow-y-auto border-t border-line bg-canvas p-5 shadow-float lg:hidden"
        >
          <div className="grid gap-1">
            {categories.map((c) => (
              <NoriLink
                key={c.type}
                href={`/vehicles?type=${c.type}`}
                onClick={() => setMobile(false)}
                className="flex min-h-control items-center gap-3 rounded-control px-3 hover:bg-subtle"
              >
                <Icon name={c.icon} />
                Thuê {c.name.toLowerCase()}
                <Icon name="chevron-right" className="ml-auto size-4" />
              </NoriLink>
            ))}
            <NoriLink
              href="/vehicles?intent=buy"
              onClick={() => setMobile(false)}
              className="flex min-h-control items-center gap-3 px-3"
            >
              <Icon name="bag" />
              Mua xe
            </NoriLink>
            <NoriLink href="/about" className="px-3 py-4" onClick={() => setMobile(false)}>
              Về NORI
            </NoriLink>
            <NoriLink href="/support" className="px-3 py-4" onClick={() => setMobile(false)}>
              Trung tâm hỗ trợ
            </NoriLink>
            <ButtonLink
              href={user ? '/account' : '/login'}
              onClick={() => setMobile(false)}
              variant="secondary"
            >
              <Icon name="user" />
              {user ? 'Tài khoản của tôi' : 'Đăng nhập / Đăng ký'}
            </ButtonLink>
          </div>
        </nav>
      )}
    </header>
  )
}
