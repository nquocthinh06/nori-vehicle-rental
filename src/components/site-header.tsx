'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Brand } from './brand'
import { CustomerNotificationBell } from './booking-notification-center'
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
  const [isScrolled, setIsScrolled] = useState(false)
  const pathname = usePathname()
  const headerRef = useRef<HTMLElement>(null)
  const { user } = useAuth()

  // Track window scroll to collapse top utility bar and apply sticky shadow
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop
      setIsScrolled(scrollY > 24)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close menus on route change
  useEffect(() => {
    setOpen(null)
    setMobile(false)
  }, [pathname])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobile) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [mobile])

  // Click outside and escape key handling
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!headerRef.current?.contains(e.target as Node)) {
        setOpen(null)
      }
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

  if (pathname?.startsWith('/dashboard')) return null

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'sticky top-0 z-40 w-full bg-canvas transition-all duration-300',
          isScrolled
            ? 'shadow-card border-b border-line/90 backdrop-blur-md bg-canvas/95'
            : 'border-b border-line/40',
        )}
      >
        {/* Top utility bar: smoothly collapses on scroll to maximize viewport real estate */}
        <div
          className={cn(
            'hidden overflow-hidden bg-night text-inverse transition-all duration-300 ease-in-out md:block',
            isScrolled ? 'max-h-0 opacity-0 -translate-y-2' : 'max-h-10 opacity-100 h-topbar',
          )}
        >
          <Container className="flex h-full items-center justify-between text-micro">
            <Text as="span" className="flex items-center gap-2 font-medium tracking-widest">
              <Icon name="road" className="size-3.5 text-brand-bright" /> ĐI THEO CÁCH CỦA BẠN.
            </Text>
            <div className="flex items-center gap-6 text-on-night-muted">
              <NoriLink
                href="/favorites"
                className="flex items-center gap-1.5 hover:text-inverse transition-colors"
              >
                <Icon name="heart" className="size-3.5" />
                Xe yêu thích
              </NoriLink>
              <NoriLink
                href="/support"
                className="flex items-center gap-1.5 hover:text-inverse transition-colors"
              >
                <Icon name="headphones" className="size-3.5" />
                Trung tâm hỗ trợ
              </NoriLink>
              <NoriLink href="/my-bookings" className="hover:text-inverse transition-colors">
                Tra cứu đơn thuê
                <Icon name="arrow-up-right" className="ml-1 inline size-3" />
              </NoriLink>
            </div>
          </Container>
        </div>

        {/* Main Navigation Bar */}
        <Container className="flex h-header items-center justify-between gap-6">
          <Brand />

          <nav aria-label="Điều hướng chính" className="hidden h-full items-center gap-8 lg:flex">
            <Button
              variant="ghost"
              aria-expanded={open === 'rent'}
              aria-controls="mega-rent"
              className={cn(
                'h-full rounded-none px-1 text-small font-semibold transition-colors',
                open === 'rent'
                  ? 'text-brand border-b-2 border-brand'
                  : 'text-ink hover:text-brand',
              )}
              onClick={() => setOpen(open === 'rent' ? null : 'rent')}
            >
              Thuê xe{' '}
              <Icon
                name="chevron-down"
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  open === 'rent' && 'rotate-180',
                )}
              />
            </Button>

            <NoriLink
              href="/vehicles?intent=buy"
              className="flex min-h-touch items-center text-small font-semibold text-ink hover:text-brand transition-colors"
            >
              Mua xe
            </NoriLink>

            <Button
              variant="ghost"
              aria-expanded={open === 'discover'}
              aria-controls="mega-discover"
              className={cn(
                'h-full rounded-none px-1 text-small font-semibold transition-colors',
                open === 'discover'
                  ? 'text-brand border-b-2 border-brand'
                  : 'text-ink hover:text-brand',
              )}
              onClick={() => setOpen(open === 'discover' ? null : 'discover')}
            >
              Khám phá NORI{' '}
              <Icon
                name="chevron-down"
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  open === 'discover' && 'rotate-180',
                )}
              />
            </Button>

            {user?.isAdmin && (
              <NoriLink
                href="/dashboard"
                className="flex min-h-touch items-center gap-1.5 whitespace-nowrap text-small font-semibold text-brand hover:underline"
              >
                <Icon name="shield" className="size-4 text-brand" />
                Quản trị hệ thống
              </NoriLink>
            )}
          </nav>

          {/* Action buttons */}
          <div className="flex items-center gap-3 md:gap-4">
            <Text
              as="span"
              className="hidden items-center gap-1.5 border-r border-line pr-4 text-small text-muted xl:flex"
            >
              <Icon name="globe" className="size-4" /> VI
            </Text>

            <CustomerNotificationBell />

            <NoriLink
              href={user ? (user.isAdmin ? '/dashboard' : '/account') : '/login'}
              className="hidden min-h-touch items-center gap-2 rounded-control px-3 py-2 text-small font-semibold text-ink hover:bg-subtle sm:flex"
            >
              <Icon name="user" className="size-4 text-brand" />
              <span className="max-w-36 truncate">
                {user ? (user.isAdmin ? 'Admin' : user.fullName.split(' ').at(-1)) : 'Đăng nhập'}
              </span>
            </NoriLink>

            <div className="hidden md:block">
              <ButtonLink href="/vehicles" className="text-small font-semibold shadow-sm">
                Tìm xe ngay <Icon name="arrow-up-right" className="size-4" />
              </ButtonLink>
            </div>

            {/* Mobile Hamburger toggle */}
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

        {/* Mega Menu: Rent */}
        {open === 'rent' && (
          <div
            id="mega-rent"
            className="absolute inset-x-0 top-full border-t border-line bg-canvas/98 py-8 shadow-float backdrop-blur-md animate-enter"
          >
            <Container className="grid grid-cols-4 gap-6">
              <div className="pr-4">
                <Text className="mb-2 text-caption font-semibold uppercase tracking-widest text-brand">
                  Chọn bạn đồng hành
                </Text>
                <Heading size="title">
                  Một chiếc xe.
                  <br />
                  Nhiều trải nghiệm.
                </Heading>
                <Text className="mt-2 text-small text-muted">
                  Thông tin kỹ thuật rõ ràng, giá thuê và chính sách minh bạch.
                </Text>
                <NoriLink
                  href="/vehicles"
                  onClick={() => setOpen(null)}
                  className="mt-5 inline-flex items-center gap-2 text-small font-semibold text-brand hover:underline"
                >
                  Xem tất cả danh mục <Icon name="arrow-right" className="size-4" />
                </NoriLink>
              </div>

              {categories.map((c) => (
                <NoriLink
                  href={`/vehicles?type=${c.type}`}
                  key={c.type}
                  onClick={() => setOpen(null)}
                  className="group rounded-card border border-line/60 bg-subtle p-6 transition-all duration-200 hover:border-brand/40 hover:bg-brand-soft hover:shadow-card"
                >
                  <div className="mb-4 flex size-12 items-center justify-center rounded-control bg-canvas text-brand shadow-xs group-hover:bg-brand group-hover:text-inverse transition-colors">
                    <Icon name={c.icon} className="size-7" />
                  </div>
                  <Heading
                    as="h3"
                    size="subtitle"
                    className="group-hover:text-brand transition-colors"
                  >
                    {c.name}
                  </Heading>
                  <Text className="mt-2 text-small text-muted">{c.detail}</Text>
                  <div className="mt-4 flex items-center gap-1.5 text-caption font-semibold text-brand">
                    Khám phá{' '}
                    <Icon
                      name="arrow-up-right"
                      className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>
                </NoriLink>
              ))}
            </Container>
          </div>
        )}

        {/* Mega Menu: Discover */}
        {open === 'discover' && (
          <div
            id="mega-discover"
            className="absolute inset-x-0 top-full border-t border-line bg-canvas/98 py-6 shadow-float backdrop-blur-md animate-enter"
          >
            <Container className="flex flex-wrap items-center justify-center gap-10 text-small font-semibold">
              <NoriLink
                href="/posts"
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 text-ink hover:text-brand transition-colors"
              >
                <Icon name="sparkles" className="size-4 text-brand" />
                Tin tức &amp; Ưu đãi
              </NoriLink>
              <NoriLink
                href="/about"
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 text-ink hover:text-brand transition-colors"
              >
                <Icon name="road" className="size-4 text-brand" />
                Câu chuyện NORI
              </NoriLink>
              <NoriLink
                href="/about#how-it-works"
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 text-ink hover:text-brand transition-colors"
              >
                <Icon name="check" className="size-4 text-brand" />
                Quy trình & Điều kiện thuê
              </NoriLink>
              <NoriLink
                href="/support"
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 text-ink hover:text-brand transition-colors"
              >
                <Icon name="headphones" className="size-4 text-brand" />
                Trung tâm hỗ trợ & FAQ
              </NoriLink>
              <NoriLink
                href="/support#contact"
                onClick={() => setOpen(null)}
                className="flex items-center gap-2 text-ink hover:text-brand transition-colors"
              >
                <Icon name="pin" className="size-4 text-brand" />
                Hệ thống bãi xe & Điểm giao nhận
              </NoriLink>
            </Container>
          </div>
        )}

        {/* Mobile Navigation Drawer */}
        {mobile && (
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng di động"
            className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden overscroll-contain animate-enter"
          >
            {/* Drawer Header */}
            <div className="flex h-header shrink-0 items-center justify-between border-b border-line px-5 pt-[env(safe-area-inset-top,0px)]">
              <Brand />
              <IconButton
                icon="close"
                label="Đóng menu"
                aria-label="Đóng menu"
                className="size-11"
                onClick={() => setMobile(false)}
              />
            </div>

            {/* Drawer Scrollable Content */}
            <div
              className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-5 py-5 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <Text className="px-3 pt-1 text-caption font-semibold tracking-wider text-muted uppercase">
                Phương tiện
              </Text>
              {categories.map((c) => (
                <NoriLink
                  key={c.type}
                  href={`/vehicles?type=${c.type}`}
                  onClick={() => setMobile(false)}
                  className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 font-medium hover:bg-subtle active:bg-brand-soft"
                >
                  <Icon name={c.icon} className="size-5 text-brand" />
                  <span className="text-body font-semibold">Thuê {c.name.toLowerCase()}</span>
                  <Icon name="chevron-right" className="ml-auto size-4 text-muted" />
                </NoriLink>
              ))}

              <NoriLink
                href="/vehicles?intent=buy"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 font-medium hover:bg-subtle"
              >
                <Icon name="bag" className="size-5 text-brand" />
                <span className="text-body font-semibold">Mua xe & Lái thử</span>
                <Icon name="chevron-right" className="ml-auto size-4 text-muted" />
              </NoriLink>

              <div className="my-3 border-t border-line" />

              <Text className="px-3 text-caption font-semibold tracking-wider text-muted uppercase">
                Tiện ích & Khám phá
              </Text>

              <NoriLink
                href="/favorites"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 text-body font-medium hover:bg-subtle"
              >
                <Icon name="heart" className="size-5 text-muted" />
                Xe yêu thích
              </NoriLink>

              <NoriLink
                href="/my-bookings"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 text-body font-medium hover:bg-subtle"
              >
                <Icon name="calendar" className="size-5 text-muted" />
                Tra cứu đơn thuê
              </NoriLink>

              <NoriLink
                href="/posts"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 text-body font-medium hover:bg-subtle"
              >
                <Icon name="sparkles" className="size-5 text-muted" />
                Tin tức &amp; Ưu đãi
              </NoriLink>

              <NoriLink
                href="/about"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 text-body font-medium hover:bg-subtle"
              >
                <Icon name="road" className="size-5 text-muted" />
                Về NORI
              </NoriLink>

              <NoriLink
                href="/support"
                onClick={() => setMobile(false)}
                className="flex min-h-touch items-center gap-3.5 rounded-control px-3.5 py-3 text-body font-medium hover:bg-subtle"
              >
                <Icon name="headphones" className="size-5 text-muted" />
                Trung tâm hỗ trợ
              </NoriLink>

              {user?.isAdmin && (
                <NoriLink
                  href="/dashboard"
                  onClick={() => setMobile(false)}
                  className="flex min-h-touch items-center gap-3.5 rounded-control bg-brand-soft px-3.5 py-3 text-body font-semibold text-brand"
                >
                  <Icon name="shield" className="size-5 text-brand" />
                  Quản trị hệ thống
                </NoriLink>
              )}

              <div className="pt-4 pb-6">
                <ButtonLink
                  href={user ? (user.isAdmin ? '/dashboard' : '/account') : '/login'}
                  onClick={() => setMobile(false)}
                  variant={user ? 'secondary' : 'primary'}
                  className="w-full justify-center text-body font-semibold py-3.5 shadow-sm"
                >
                  <Icon name="user" className="size-4" />
                  {user
                    ? user.isAdmin
                      ? 'Vào Dashboard Quản trị'
                      : `Tài khoản: ${user.fullName}`
                    : 'Đăng nhập / Đăng ký'}
                </ButtonLink>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  )
}
