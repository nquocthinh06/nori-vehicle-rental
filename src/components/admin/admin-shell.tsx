'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import {
  DEFAULT_OPERATOR_PERMISSIONS,
  STAFF_TITLE_LABELS,
  type AdminModule,
  type StaffTitle,
} from '@/access/nori'
import { useAuth } from '@/components/auth-provider'
import { api } from '@/lib/client-api'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Input,
  NoriLink,
  Notice,
  Skeleton,
  Text,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon, type IconName } from '@/components/ui/icon'
import { useToast } from './toast'

type NavItem = {
  href: string
  label: string
  icon: IconName
  group: string
  module?: AdminModule
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Điều hành',
    items: [{ href: '/dashboard', label: 'Tổng quan', icon: 'grid', group: 'Điều hành' }],
  },
  {
    title: 'Chi nhánh & Địa điểm',
    items: [
      {
        href: '/dashboard/branches',
        label: 'Chi nhánh',
        icon: 'home',
        group: 'Chi nhánh & Địa điểm',
        module: 'branches',
      },
      {
        href: '/dashboard/warehouses',
        label: 'Kho xe & Tồn kho',
        icon: 'grid',
        group: 'Chi nhánh & Địa điểm',
        module: 'warehouses',
      },
      {
        href: '/dashboard/locations',
        label: 'Điểm nhận trả xe',
        icon: 'pin',
        group: 'Chi nhánh & Địa điểm',
        module: 'locations',
      },
      {
        href: '/dashboard/staff',
        label: 'Nhân viên & Phân quyền CN',
        icon: 'user',
        group: 'Chi nhánh & Địa điểm',
        module: 'staff',
      },
      {
        href: '/dashboard/transfers',
        label: 'Điều chuyển xe',
        icon: 'road',
        group: 'Chi nhánh & Địa điểm',
        module: 'transfers',
      },
      {
        href: '/dashboard/deliveries',
        label: 'Giao nhận tận nơi',
        icon: 'car',
        group: 'Chi nhánh & Địa điểm',
        module: 'deliveries',
      },
      {
        href: '/dashboard/location-pricing',
        label: 'Giá & Tuyến một chiều',
        icon: 'wallet',
        group: 'Chi nhánh & Địa điểm',
        module: 'pricing',
      },
      {
        href: '/dashboard/branch-reports',
        label: 'Báo cáo chi nhánh',
        icon: 'bar-chart',
        group: 'Chi nhánh & Địa điểm',
        module: 'reports',
      },
    ],
  },
  {
    title: 'Phương tiện',
    items: [
      {
        href: '/dashboard/vehicles',
        label: 'Kho xe thực tế',
        icon: 'car',
        group: 'Phương tiện',
        module: 'vehicles',
      },
      {
        href: '/dashboard/models',
        label: 'Catalogue dòng xe',
        icon: 'sliders',
        group: 'Phương tiện',
        module: 'models',
      },
      {
        href: '/dashboard/maintenance',
        label: 'Lịch bảo trì',
        icon: 'settings',
        group: 'Phương tiện',
        module: 'maintenance',
      },
    ],
  },
  {
    title: 'Nghiệp vụ',
    items: [
      {
        href: '/dashboard/bookings',
        label: 'Đơn thuê xe',
        icon: 'calendar',
        group: 'Nghiệp vụ',
        module: 'bookings',
      },
      {
        href: '/dashboard/inquiries',
        label: 'Yêu cầu mua xe',
        icon: 'bag',
        group: 'Nghiệp vụ',
        module: 'inquiries',
      },
      {
        href: '/dashboard/promotions',
        label: 'Khuyến mãi',
        icon: 'sparkles',
        group: 'Nghiệp vụ',
        module: 'promotions',
      },
      {
        href: '/dashboard/payments',
        label: 'Thanh toán & Hoàn tiền',
        icon: 'wallet',
        group: 'Nghiệp vụ',
        module: 'payments',
      },
    ],
  },
  {
    title: 'Khách hàng & Nội dung',
    items: [
      {
        href: '/dashboard/customers',
        label: 'Khách hàng & Đánh giá',
        icon: 'user',
        group: 'Khách hàng & Nội dung',
        module: 'customers',
      },
      {
        href: '/dashboard/content',
        label: 'CMS & Cài đặt website',
        icon: 'file',
        group: 'Khách hàng & Nội dung',
        module: 'content',
      },
      {
        href: '/dashboard/posts',
        label: 'Tin tức & Bài viết',
        icon: 'edit',
        group: 'Khách hàng & Nội dung',
        module: 'posts',
      },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      {
        href: '/dashboard/reports',
        label: 'Thống kê & Báo cáo',
        icon: 'bar-chart',
        group: 'Hệ thống',
        module: 'reports',
      },
      {
        href: '/dashboard/admins',
        label: 'Tài khoản & Bảo mật',
        icon: 'shield',
        group: 'Hệ thống',
        module: 'admins',
      },
      {
        href: '/dashboard/system',
        label: 'Đồng bộ & Sao lưu dữ liệu',
        icon: 'sliders',
        group: 'Hệ thống',
        module: 'content',
      },
      {
        href: '/dashboard/ai',
        label: 'Trợ lý AI (NORI AI)',
        icon: 'sparkles',
        group: 'Hệ thống',
        module: 'ai',
      },
    ],
  },
]

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function canReadAdminModule(
  user: {
    isAdmin?: boolean
    adminRole?: 'SUPER_ADMIN' | 'OPERATOR'
    permissions?: Record<string, string[]>
  } | null,
  module?: AdminModule,
): boolean {
  if (!user?.isAdmin) return false
  if (!module) return true
  if (user.adminRole !== 'OPERATOR') return true
  const perms = user.permissions ?? DEFAULT_OPERATOR_PERMISSIONS
  return Boolean(perms[module]?.includes('read'))
}

type NotificationSummary = {
  pendingBookings: number
  expiredDeposits: number
  newInquiries: number
  maintenanceVehicles: number
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, logout, refresh } = useAuth()
  const { toast } = useToast()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notif, setNotif] = useState<NotificationSummary | null>(null)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError, setNotifError] = useState('')
  const [portalReady, setPortalReady] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [popoverCoords, setPopoverCoords] = useState<{
    top: number
    right: number
    maxHeight: number
  }>({
    top: 68,
    right: 16,
    maxHeight: 420,
  })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)

  const notifRef = useRef<HTMLDivElement>(null)
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const notifPanelRef = useRef<HTMLDivElement>(null)
  const notifCloseBtnRef = useRef<HTMLButtonElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const accountPanelRef = useRef<HTMLDivElement>(null)
  const wasNotifOpenRef = useRef(false)

  useEffect(() => {
    setPortalReady(true)
    const mq = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => setIsMobileViewport(mq.matches)
    syncViewport()
    mq.addEventListener('change', syncViewport)
    return () => mq.removeEventListener('change', syncViewport)
  }, [])

  const updatePopoverCoords = useCallback(() => {
    const btn = notifBtnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const top = Math.min(Math.max(12, rect.bottom + 8), Math.max(12, vh - 220))
    const right = Math.min(Math.max(16, vw - rect.right), Math.max(16, vw - 300))
    const maxHeight = Math.max(200, Math.min(440, vh - top - 16))
    setPopoverCoords({ top, right, maxHeight })
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setNotifOpen(false)
    setAccountOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!notifOpen) {
      if (wasNotifOpenRef.current) {
        wasNotifOpenRef.current = false
        if (!accountOpen && !mobileOpen && !pwdOpen) {
          notifBtnRef.current?.focus()
        }
      }
      return
    }

    wasNotifOpenRef.current = true
    if (!isMobileViewport) {
      updatePopoverCoords()
    }
    const rafId = window.requestAnimationFrame(() => {
      if (notifCloseBtnRef.current) {
        notifCloseBtnRef.current.focus()
      } else {
        notifPanelRef.current?.focus()
      }
    })

    const onViewportChange = () => {
      if (!isMobileViewport) updatePopoverCoords()
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [notifOpen, isMobileViewport, updatePopoverCoords, accountOpen, mobileOpen, pwdOpen])

  useEffect(() => {
    if (!(mobileOpen || (isMobileViewport && (notifOpen || accountOpen)))) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen, isMobileViewport, notifOpen, accountOpen])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (
        notifOpen &&
        !notifRef.current?.contains(target) &&
        !notifPanelRef.current?.contains(target)
      ) {
        setNotifOpen(false)
      }
      if (
        accountOpen &&
        !accountRef.current?.contains(target) &&
        !accountPanelRef.current?.contains(target)
      ) {
        setAccountOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNotifOpen(false)
        setAccountOpen(false)
        setMobileOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [notifOpen, accountOpen])

  const loadNotifications = useCallback(
    (signal?: AbortSignal) => {
      if (!user?.isAdmin) return
      setNotifLoading(true)
      setNotifError('')
      api<{
        statuses?: Record<string, number>
        fleetStats?: { byOperationStatus?: Record<string, number>; expiredDepositCount?: number }
        newInquiriesCount?: number
        inquiries?: { status: string }[]
      }>('/dashboard?summaryOnly=1', { signal, timeoutMs: 10_000 })
        .then((res) => {
          if (signal?.aborted) return
          setNotif({
            pendingBookings: res.statuses?.PENDING ?? 0,
            expiredDeposits: res.fleetStats?.expiredDepositCount ?? 0,
            newInquiries:
              typeof res.newInquiriesCount === 'number'
                ? res.newInquiriesCount
                : (res.inquiries ?? []).filter((i) => i.status === 'NEW').length,
            maintenanceVehicles: res.fleetStats?.byOperationStatus?.MAINTENANCE ?? 0,
          })
          setNotifError('')
        })
        .catch((err) => {
          if (signal?.aborted) return
          setNotifError((err as Error)?.message || 'Không thể tải danh sách thông báo vận hành.')
        })
        .finally(() => {
          if (!signal?.aborted) setNotifLoading(false)
        })
    },
    [user?.isAdmin],
  )

  useEffect(() => {
    if (!user?.isAdmin) return
    const controller = new AbortController()
    loadNotifications(controller.signal)
    return () => {
      controller.abort()
    }
  }, [user?.isAdmin, pathname, loadNotifications])

  async function handleLogout() {
    await logout()
    await refresh()
    router.push('/login')
    router.refresh()
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdBusy(true)
    setPwdError('')
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      })
      setPwdOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('Đã cập nhật mật khẩu quản trị thành công.', 'success')
    } catch (err) {
      setPwdError((err as Error).message)
    } finally {
      setPwdBusy(false)
    }
  }

  function handleQuickSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) return
    const target =
      q.toUpperCase().startsWith('NR-OT') || q.toUpperCase().startsWith('NR-XM')
        ? `/dashboard/vehicles?q=${encodeURIComponent(q)}`
        : q.toUpperCase().startsWith('NM-')
          ? `/dashboard/inquiries?q=${encodeURIComponent(q)}`
          : `/dashboard/bookings?q=${encodeURIComponent(q)}`
    router.push(target)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-subtle p-6">
        <div className="mx-auto max-w-content space-y-6">
          <Skeleton className="h-16" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!user || !user.isAdmin) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen items-center justify-center bg-subtle px-5 py-12"
      >
        <div className="w-full max-w-reading rounded-panel border border-line bg-canvas p-8 shadow-card">
          <div className="mb-6 flex items-center justify-between">
            <span className="nori-wordmark text-wordmark leading-none text-ink">
              nori<span className="text-brand">.</span>
            </span>
            <Badge tone="brand">NORI Administration</Badge>
          </div>
          <Heading as="h1" size="subtitle" className="sr-only">
            Không gian quản trị NORI
          </Heading>
          <EmptyState
            icon="shield"
            title="Không gian dành cho quản trị viên"
            description="Vui lòng đăng nhập bằng tài khoản Quản trị NORI (không dùng tài khoản khách hàng) để xem dữ liệu và vận hành hệ thống."
          >
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href={`/login?returnTo=${encodeURIComponent(pathname || '/dashboard')}`}>
                Đăng nhập quản trị <Icon name="arrow-right" className="size-4" />
              </ButtonLink>
              <ButtonLink href="/" variant="secondary">
                Về trang chủ NORI
              </ButtonLink>
              <ButtonLink href="/admin" variant="ghost">
                Mở Payload CMS (/admin) <Icon name="arrow-up-right" className="size-4" />
              </ButtonLink>
            </div>
          </EmptyState>
        </div>
      </main>
    )
  }

  const activeNav =
    ALL_NAV_ITEMS.find((item) =>
      item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href),
    ) ?? ALL_NAV_ITEMS[0]

  const visibleNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canReadAdminModule(user, item.module)),
  })).filter((group) => group.items.length > 0)

  const canAccessActiveRoute = canReadAdminModule(user, activeNav?.module)
  const canBookings = canReadAdminModule(user, 'bookings')
  const canInquiries = canReadAdminModule(user, 'inquiries')
  const canVehicles = canReadAdminModule(user, 'vehicles')

  const totalAlerts =
    (canBookings ? (notif?.pendingBookings ?? 0) + (notif?.expiredDeposits ?? 0) : 0) +
    (canInquiries ? (notif?.newInquiries ?? 0) : 0) +
    (canVehicles ? (notif?.maintenanceVehicles ?? 0) : 0)

  const initials = (user.fullName || user.email || 'AD')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const sidebarContent = (
    <div className="flex h-full flex-col bg-night text-inverse">
      <div className="flex h-16 items-center justify-between border-b border-inverse/15 px-4">
        <NoriLink
          href="/dashboard"
          className="flex items-center gap-2.5 text-inverse hover:text-brand-bright"
          aria-label="NORI Administration"
        >
          <span className="nori-wordmark text-title leading-none">
            nori<span className="text-brand-bright">.</span>
          </span>
          {!collapsed && (
            <span className="border-l border-inverse/20 pl-2.5 text-micro font-semibold uppercase tracking-widest text-on-night-muted">
              Admin
            </span>
          )}
        </NoriLink>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          className="hidden size-9 items-center justify-center rounded-control text-on-night-muted hover:bg-night-soft hover:text-inverse lg:inline-flex"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu điều hướng"
          className="inline-flex size-10 items-center justify-center rounded-control text-on-night-muted hover:bg-night-soft hover:text-inverse lg:hidden"
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>

      <nav
        aria-label="Điều hướng quản trị NORI"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
      >
        {visibleNavGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <div className="mb-2 px-3 text-micro font-semibold uppercase tracking-widest text-on-night-muted/70">
                {group.title}
              </div>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname?.startsWith(item.href)
                return (
                  <li key={item.href}>
                    <NoriLink
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-touch items-center gap-3 rounded-control px-3 py-2.5 text-small font-medium transition-colors ${
                        isActive
                          ? 'bg-brand text-inverse shadow-sm hover:text-inverse'
                          : 'text-on-night-muted hover:bg-night-soft hover:text-inverse'
                      } ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                      <Icon name={item.icon} className="size-5 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NoriLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1.5 border-t border-inverse/15 p-3">
        <NoriLink
          href="/"
          title={collapsed ? 'Về website chính' : undefined}
          className={`flex min-h-touch items-center gap-3 rounded-control px-3 py-2 text-small text-on-night-muted hover:bg-night-soft hover:text-inverse ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          <Icon name="home" className="size-4 shrink-0" />
          {!collapsed && <span>Về website chính</span>}
        </NoriLink>
        {user.adminRole !== 'OPERATOR' && (
          <NoriLink
            href="/admin"
            title={collapsed ? 'Payload CMS (/admin)' : undefined}
            className={`flex min-h-touch items-center gap-3 rounded-control px-3 py-2 text-caption text-on-night-muted/80 hover:bg-night-soft hover:text-inverse ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <Icon name="external" className="size-4 shrink-0" />
            {!collapsed && <span>Payload CMS (/admin)</span>}
          </NoriLink>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-subtle text-ink">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-line transition-[width] duration-200 lg:block ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-overlay/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full w-72 max-w-[85vw] shadow-float">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false)
                  setAccountOpen(false)
                  setMobileOpen(true)
                }}
                aria-label="Mở menu quản trị"
                className="inline-flex size-touch shrink-0 items-center justify-center rounded-control border border-line bg-canvas text-ink hover:border-brand lg:hidden"
              >
                <Icon name="menu" className="size-5" />
              </button>
              <div className="min-w-0 flex-1">
                <nav
                  aria-label="Breadcrumb"
                  className="hidden flex-wrap items-center gap-1.5 text-caption text-muted sm:flex"
                >
                  <NoriLink href="/dashboard" className="hover:text-brand">
                    Quản trị hệ thống
                  </NoriLink>
                  <span aria-hidden="true">/</span>
                  <span>{activeNav.group}</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-medium text-ink">{activeNav.label}</span>
                </nav>
                <p className="truncate text-body font-semibold text-ink sm:text-subtitle">
                  {activeNav.label}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              <form onSubmit={handleQuickSearch} className="hidden md:block">
                <div className="relative">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm mã đơn, mã xe..."
                    aria-label="Tìm nhanh mã đơn hoặc mã xe"
                    className="h-10 w-44 rounded-control border border-line bg-subtle pl-9 pr-3 text-small text-ink placeholder:text-muted focus:border-brand focus:bg-canvas focus:outline-none lg:w-56"
                  />
                </div>
              </form>

              <div ref={notifRef} className="relative">
                <button
                  ref={notifBtnRef}
                  type="button"
                  onClick={() => {
                    setAccountOpen(false)
                    setMobileOpen(false)
                    setNotifOpen((v) => !v)
                  }}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  aria-controls="admin-notification-panel"
                  aria-label="Thông báo vận hành"
                  className="relative inline-flex size-touch items-center justify-center rounded-control border border-line bg-canvas text-ink hover:border-brand hover:text-brand"
                >
                  <Icon name="bell" className="size-5" />
                  {totalAlerts > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-micro font-bold text-inverse">
                      {totalAlerts > 99 ? '99+' : totalAlerts}
                    </span>
                  )}
                </button>
              </div>

              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false)
                    setMobileOpen(false)
                    setAccountOpen((v) => !v)
                  }}
                  aria-expanded={accountOpen}
                  aria-haspopup="dialog"
                  aria-label={`Menu tài khoản quản trị (${user.email})`}
                  className="flex min-h-touch items-center gap-2 rounded-control border border-line bg-canvas px-2.5 py-1.5 text-left hover:border-brand sm:gap-2.5 sm:px-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand text-caption font-bold text-inverse">
                    {initials}
                  </span>
                  <span className="hidden md:block">
                    <span className="block text-small font-semibold leading-tight text-ink">
                      {user.fullName}
                    </span>
                    <span className="block text-micro text-muted">Quản trị: {user.email}</span>
                  </span>
                  <Icon name="chevron-down" className="size-4 shrink-0 text-muted" />
                </button>
                {accountOpen && !isMobileViewport && (
                  <div
                    ref={accountPanelRef}
                    role="dialog"
                    aria-label="Menu tài khoản quản trị"
                    className="absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-canvas p-3 shadow-float"
                  >
                    <div className="border-b border-line pb-3">
                      <Text className="text-small font-semibold">{user.fullName}</Text>
                      <Text className="break-all text-caption text-muted">{user.email}</Text>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="brand">
                          {user.staffTitle && user.staffTitle in STAFF_TITLE_LABELS
                            ? STAFF_TITLE_LABELS[user.staffTitle as StaffTitle]
                            : user.adminRole === 'SUPER_ADMIN'
                              ? 'Quản trị viên cấp cao'
                              : 'Nhân viên vận hành'}
                        </Badge>
                        <Badge tone={user.branchScopeMode === 'ASSIGNED' ? 'warning' : 'muted'}>
                          {user.branchScopeMode === 'ASSIGNED'
                            ? `${user.assignedBranchIds?.length ?? 0} chi nhánh`
                            : 'Toàn hệ thống'}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-small">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountOpen(false)
                          setPwdOpen(true)
                        }}
                        className="flex min-h-touch w-full items-center gap-2.5 rounded-control px-3 py-2 text-left hover:bg-subtle"
                      >
                        <Icon name="lock" className="size-4 text-muted" />
                        Đổi mật khẩu
                      </button>
                      <NoriLink
                        href="/"
                        className="flex min-h-touch items-center gap-2.5 rounded-control px-3 py-2 hover:bg-subtle"
                      >
                        <Icon name="home" className="size-4 text-muted" />
                        Về website chính
                      </NoriLink>
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="flex min-h-touch w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-danger hover:bg-danger-soft"
                      >
                        <Icon name="logout" className="size-4" />
                        Đăng xuất quản trị
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-content">
            <Heading as="h1" size="title" className="mb-5 text-ink">
              {activeNav.label}
            </Heading>
            {canAccessActiveRoute ? (
              children
            ) : (
              <div className="rounded-card border border-line bg-canvas p-8">
                <EmptyState
                  icon="shield"
                  title="Tài khoản chưa được cấp quyền truy cập phân hệ này"
                  description="Vui lòng liên hệ Quản trị viên cấp cao (SUPER_ADMIN) nếu bạn cần quyền thao tác trên phân hệ này."
                >
                  <ButtonLink href="/dashboard" variant="secondary">
                    Quay lại Tổng quan
                  </ButtonLink>
                </EmptyState>
              </div>
            )}
          </div>
        </main>
      </div>

      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} title="Đổi mật khẩu quản trị">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwdError && <Notice tone="error">{pwdError}</Notice>}
          <Input
            id="admin-pwd-current"
            label="Mật khẩu hiện tại"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            id="admin-pwd-new"
            label="Mật khẩu mới"
            type="password"
            required
            hint="Từ 8–72 ký tự, gồm ít nhất 1 chữ cái và 1 chữ số."
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            id="admin-pwd-confirm"
            label="Xác nhận mật khẩu mới"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setPwdOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={pwdBusy}>
              Cập nhật mật khẩu
            </Button>
          </div>
        </form>
      </Dialog>

      {portalReady &&
        notifOpen &&
        createPortal(
          isMobileViewport ? (
            <>
              <div
                className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-xs"
                onClick={() => setNotifOpen(false)}
                aria-hidden="true"
              />
              <div
                id="admin-notification-panel"
                ref={notifPanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-notif-title"
                tabIndex={-1}
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-panel border-t border-line bg-canvas shadow-float pb-[env(safe-area-inset-bottom,0px)] animate-enter"
              >
                <div
                  className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-pill bg-line"
                  aria-hidden="true"
                />
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Heading as="h2" size="subtitle" id="admin-notif-title" className="truncate">
                      Việc cần xử lý ngay
                    </Heading>
                    {totalAlerts > 0 && <Badge tone="danger">{totalAlerts}</Badge>}
                  </div>
                  <button
                    ref={notifCloseBtnRef}
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    aria-label="Đóng thông báo"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-subtle hover:text-ink"
                  >
                    <Icon name="close" className="size-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6">
                  {notifLoading && !notif ? (
                    <div className="space-y-2.5" role="status" aria-label="Đang tải thông báo">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  ) : notifError && !notif ? (
                    <div className="space-y-3">
                      <Notice tone="error">{notifError}</Notice>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => loadNotifications()}
                        className="w-full"
                      >
                        Thử tải lại thông báo
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-body">
                      {totalAlerts === 0 && (canBookings || canInquiries || canVehicles) && (
                        <Notice tone="info">
                          Chưa có cảnh báo tồn đọng. Bạn vẫn có thể mở nhanh các danh sách dưới đây.
                        </Notice>
                      )}
                      {canBookings && (
                        <>
                          <NoriLink
                            href="/dashboard/bookings?status=PENDING"
                            onClick={() => setNotifOpen(false)}
                            className="flex min-h-touch items-center justify-between gap-3 rounded-control bg-subtle px-3.5 py-3 hover:bg-brand-soft"
                          >
                            <span className="min-w-0 font-medium text-ink">
                              Đơn thuê chờ xác nhận
                            </span>
                            <Badge tone={notif?.pendingBookings ? 'warning' : 'muted'}>
                              {notif?.pendingBookings ?? 0}
                            </Badge>
                          </NoriLink>
                          <NoriLink
                            href="/dashboard/bookings?status=DEPOSIT_PENDING"
                            onClick={() => setNotifOpen(false)}
                            className="flex min-h-touch items-center justify-between gap-3 rounded-control bg-subtle px-3.5 py-3 hover:bg-brand-soft"
                          >
                            <span className="min-w-0 font-medium text-ink">
                              Đơn quá hạn đặt cọc (&gt;24h)
                            </span>
                            <Badge tone={notif?.expiredDeposits ? 'danger' : 'muted'}>
                              {notif?.expiredDeposits ?? 0}
                            </Badge>
                          </NoriLink>
                        </>
                      )}
                      {canInquiries && (
                        <NoriLink
                          href="/dashboard/inquiries?status=NEW"
                          onClick={() => setNotifOpen(false)}
                          className="flex min-h-touch items-center justify-between gap-3 rounded-control bg-subtle px-3.5 py-3 hover:bg-brand-soft"
                        >
                          <span className="min-w-0 font-medium text-ink">Yêu cầu mua xe mới</span>
                          <Badge tone={notif?.newInquiries ? 'brand' : 'muted'}>
                            {notif?.newInquiries ?? 0}
                          </Badge>
                        </NoriLink>
                      )}
                      {canVehicles && (
                        <NoriLink
                          href="/dashboard/vehicles?operationStatus=MAINTENANCE"
                          onClick={() => setNotifOpen(false)}
                          className="flex min-h-touch items-center justify-between gap-3 rounded-control bg-subtle px-3.5 py-3 hover:bg-brand-soft"
                        >
                          <span className="min-w-0 font-medium text-ink">Xe đang bảo dưỡng</span>
                          <Badge tone="muted">{notif?.maintenanceVehicles ?? 0}</Badge>
                        </NoriLink>
                      )}
                      {!canBookings && !canInquiries && !canVehicles && (
                        <EmptyState
                          icon="bell"
                          title="Không có thông báo mới"
                          description="Không có cảnh báo thuộc phạm vi quyền hiện tại."
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div
              id="admin-notification-panel"
              ref={notifPanelRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby="admin-notif-title"
              tabIndex={-1}
              style={{
                top: `${popoverCoords.top}px`,
                right: `${popoverCoords.right}px`,
                maxHeight: `${popoverCoords.maxHeight}px`,
              }}
              className="fixed z-50 flex w-88 max-w-[calc(100vw-2rem)] flex-col rounded-card border border-line bg-canvas shadow-float animate-enter sm:w-96"
            >
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Text id="admin-notif-title" className="text-small font-semibold text-ink">
                    Việc cần xử lý ngay
                  </Text>
                  {totalAlerts > 0 && <Badge tone="danger">{totalAlerts}</Badge>}
                </div>
                <button
                  ref={notifCloseBtnRef}
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="Đóng thông báo"
                  className="inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-subtle hover:text-ink"
                >
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                {notifLoading && !notif ? (
                  <div className="space-y-2" role="status" aria-label="Đang tải thông báo">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : notifError && !notif ? (
                  <div className="space-y-3">
                    <Notice tone="error">{notifError}</Notice>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => loadNotifications()}
                      className="w-full"
                    >
                      Thử tải lại thông báo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 text-small">
                    {totalAlerts === 0 && (canBookings || canInquiries || canVehicles) && (
                      <Notice tone="info">Chưa có cảnh báo tồn đọng.</Notice>
                    )}
                    {canBookings && (
                      <>
                        <NoriLink
                          href="/dashboard/bookings?status=PENDING"
                          onClick={() => setNotifOpen(false)}
                          className="flex min-h-touch items-center justify-between gap-2 rounded-control bg-subtle px-3 py-2 hover:bg-brand-soft"
                        >
                          <span>Đơn thuê chờ xác nhận</span>
                          <Badge tone={notif?.pendingBookings ? 'warning' : 'muted'}>
                            {notif?.pendingBookings ?? 0}
                          </Badge>
                        </NoriLink>
                        <NoriLink
                          href="/dashboard/bookings?status=DEPOSIT_PENDING"
                          onClick={() => setNotifOpen(false)}
                          className="flex min-h-touch items-center justify-between gap-2 rounded-control bg-subtle px-3 py-2 hover:bg-brand-soft"
                        >
                          <span>Đơn quá hạn đặt cọc (&gt;24h)</span>
                          <Badge tone={notif?.expiredDeposits ? 'danger' : 'muted'}>
                            {notif?.expiredDeposits ?? 0}
                          </Badge>
                        </NoriLink>
                      </>
                    )}
                    {canInquiries && (
                      <NoriLink
                        href="/dashboard/inquiries?status=NEW"
                        onClick={() => setNotifOpen(false)}
                        className="flex min-h-touch items-center justify-between gap-2 rounded-control bg-subtle px-3 py-2 hover:bg-brand-soft"
                      >
                        <span>Yêu cầu mua xe mới</span>
                        <Badge tone={notif?.newInquiries ? 'brand' : 'muted'}>
                          {notif?.newInquiries ?? 0}
                        </Badge>
                      </NoriLink>
                    )}
                    {canVehicles && (
                      <NoriLink
                        href="/dashboard/vehicles?operationStatus=MAINTENANCE"
                        onClick={() => setNotifOpen(false)}
                        className="flex min-h-touch items-center justify-between gap-2 rounded-control bg-subtle px-3 py-2 hover:bg-brand-soft"
                      >
                        <span>Xe đang bảo dưỡng</span>
                        <Badge tone="muted">{notif?.maintenanceVehicles ?? 0}</Badge>
                      </NoriLink>
                    )}
                    {!canBookings && !canInquiries && !canVehicles && (
                      <Text className="text-caption text-muted">
                        Không có cảnh báo thuộc phạm vi quyền hiện tại.
                      </Text>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
          document.body,
        )}

      {portalReady &&
        accountOpen &&
        isMobileViewport &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-xs"
              onClick={() => setAccountOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={accountPanelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Tài khoản quản trị"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-panel border-t border-line bg-canvas p-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] shadow-float animate-enter"
            >
              <div className="flex items-start justify-between border-b border-line pb-4">
                <div>
                  <Text className="text-body font-semibold text-ink">{user.fullName}</Text>
                  <Text className="break-all text-caption text-muted">{user.email}</Text>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="brand">
                      {user.staffTitle && user.staffTitle in STAFF_TITLE_LABELS
                        ? STAFF_TITLE_LABELS[user.staffTitle as StaffTitle]
                        : user.adminRole === 'SUPER_ADMIN'
                          ? 'Quản trị viên cấp cao'
                          : 'Nhân viên vận hành'}
                    </Badge>
                    <Badge tone={user.branchScopeMode === 'ASSIGNED' ? 'warning' : 'muted'}>
                      {user.branchScopeMode === 'ASSIGNED'
                        ? `${user.assignedBranchIds?.length ?? 0} chi nhánh`
                        : 'Toàn hệ thống'}
                    </Badge>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountOpen(false)}
                  aria-label="Đóng menu tài khoản"
                  className="inline-flex size-11 items-center justify-center rounded-control text-muted hover:bg-subtle"
                >
                  <Icon name="close" className="size-5" />
                </button>
              </div>

              <div className="mt-4 space-y-2 text-body">
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false)
                    setPwdOpen(true)
                  }}
                  className="flex min-h-touch w-full items-center gap-3 rounded-control px-3.5 py-3 text-left font-medium hover:bg-subtle"
                >
                  <Icon name="lock" className="size-5 text-muted" />
                  Đổi mật khẩu quản trị
                </button>
                <NoriLink
                  href="/"
                  onClick={() => setAccountOpen(false)}
                  className="flex min-h-touch w-full items-center gap-3 rounded-control px-3.5 py-3 font-medium hover:bg-subtle"
                >
                  <Icon name="home" className="size-5 text-muted" />
                  Về website chính
                </NoriLink>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex min-h-touch w-full items-center gap-3 rounded-control px-3.5 py-3 text-left font-semibold text-danger hover:bg-danger-soft"
                >
                  <Icon name="logout" className="size-5" />
                  Đăng xuất quản trị
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
