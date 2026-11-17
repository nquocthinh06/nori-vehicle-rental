'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './auth-provider'
import { useFavorites } from './favorites-provider'
import { Icon, type IconName } from './ui/icon'
import { cn } from './ui'

export function MobileBottomNav() {
  const pathname = usePathname() ?? '/'
  const { user } = useAuth()
  const { slugs, hydrated } = useFavorites()

  // Hide on Admin dashboard, vehicle detail (which has its own Sticky Booking Bar), and checkout
  const isVehicleDetail = /^\/vehicles\/[^/]+/.test(pathname)
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/checkout') || isVehicleDetail) {
    return null
  }

  const accountHref = user ? (user.isAdmin ? '/dashboard' : '/account') : '/login'

  const items: {
    href: string
    label: string
    icon: IconName
    active: boolean
    badge?: number
  }[] = [
    {
      href: '/',
      label: 'Trang chủ',
      icon: 'home',
      active: pathname === '/',
    },
    {
      href: '/vehicles',
      label: 'Tìm xe',
      icon: 'search',
      active: pathname === '/vehicles',
    },
    {
      href: '/favorites',
      label: 'Yêu thích',
      icon: 'heart',
      active: pathname.startsWith('/favorites'),
      badge: hydrated && slugs.length > 0 ? slugs.length : undefined,
    },
    {
      href: '/my-bookings',
      label: 'Đơn hàng',
      icon: 'calendar',
      active: pathname.startsWith('/my-bookings'),
    },
    {
      href: accountHref,
      label: 'Tài khoản',
      icon: 'user',
      active:
        pathname.startsWith('/account') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/register'),
    },
  ]

  return (
    <nav
      aria-label="Điều hướng nhanh trên di động"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-micro transition-colors focus-visible:outline-offset-[-4px]',
                item.active ? 'font-semibold text-brand' : 'font-medium text-muted hover:text-ink',
              )}
            >
              {item.active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand"
                />
              )}
              <span className="relative inline-flex items-center justify-center">
                <Icon name={item.icon} className="size-5" />
                {item.badge !== undefined && (
                  <span className="absolute -right-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-bold leading-4 text-inverse">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
