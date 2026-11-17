'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  canTransition,
  formatDate,
  formatMoney,
  inquiryStatusLabels,
  inquiryTypeLabels,
  operationStatusLabels,
  type BookingStatus,
} from '@/lib/rental-rules'
import type {
  BookingView,
  CustomerSummary,
  DashboardReviewSummary,
  DashboardVehicleSummary,
  FleetStats,
  InquiryView,
} from '@/lib/domain-types'
import { useAuth } from './auth-provider'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  Text,
  Textarea,
} from './ui'
import { Icon, type IconName } from './ui/icon'
import { Dialog } from './ui/dialog'

type CompletenessItem = {
  id: string
  name: string
  slug: string
  category: string
  verificationStatus: string
  fleetCount: number
  score: number
  missing: string[]
}

type DashboardData = {
  adminEmail?: string
  vehicles: number
  models: number
  customers: number
  totalBookings: number
  bookingPage: number
  bookingTotalPages: number
  totalInquiries: number
  inquiryPage: number
  inquiryTotalPages: number
  statuses: Record<string, number>
  bookings: BookingView[]
  inquiries: InquiryView[]
  customersList: CustomerSummary[]
  vehiclesList?: DashboardVehicleSummary[]
  reviewsList?: DashboardReviewSummary[]
  fleetStats: FleetStats
  dataCompleteness: CompletenessItem[]
}

const actionLabels: Record<string, string> = {
  DEPOSIT_PENDING: 'Yêu cầu đặt cọc',
  CONFIRMED: 'Duyệt đơn',
  READY_FOR_HANDOVER: 'Chuẩn bị giao xe',
  REJECTED: 'Từ chối',
  ONGOING: 'Đã giao xe',
  INSPECTING: 'Chờ kiểm tra trả xe',
  CANCELLED: 'Hủy theo yêu cầu',
  COMPLETED: 'Hoàn thành & giải phóng lịch',
}

const inquiryTransitions: Record<string, { to: string; label: string }[]> = {
  NEW: [
    { to: 'CONTACTED', label: 'Đã liên hệ' },
    { to: 'TEST_DRIVE_SCHEDULED', label: 'Hẹn xem / lái thử' },
    { to: 'CANCELLED', label: 'Hủy' },
  ],
  CONTACTED: [
    { to: 'TEST_DRIVE_SCHEDULED', label: 'Hẹn xem / lái thử' },
    { to: 'DEPOSIT_PENDING', label: 'Chờ đặt cọc' },
    { to: 'CLOSED', label: 'Đóng yêu cầu' },
  ],
  TEST_DRIVE_SCHEDULED: [
    { to: 'DEPOSIT_PENDING', label: 'Chờ đặt cọc' },
    { to: 'CONTRACT_SIGNED', label: 'Đã ký hồ sơ' },
    { to: 'CLOSED', label: 'Đóng' },
  ],
  DEPOSIT_PENDING: [
    { to: 'CONTRACT_SIGNED', label: 'Đã ký hồ sơ' },
    { to: 'CANCELLED', label: 'Hủy' },
  ],
  CONTRACT_SIGNED: [{ to: 'DELIVERED', label: 'Đã bàn giao xe (khóa xe bán)' }],
}

export function DashboardPanel() {
  const router = useRouter()
  const { logout, refresh } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [retry, setRetry] = useState(0)
  const [bookingPage, setBookingPage] = useState(1)
  const [bookingStatus, setBookingStatus] = useState('')
  const [inquiryPage, setInquiryPage] = useState(1)
  const [inquiryStatus, setInquiryStatus] = useState('')
  const [transition, setTransition] = useState<{ booking: BookingView; to: BookingStatus } | null>(
    null,
  )
  const [handoverNote, setHandoverNote] = useState('')
  const [inquiryAction, setInquiryAction] = useState<{
    inquiry: InquiryView
    to: string
    label: string
  } | null>(null)
  const [vehicleEdit, setVehicleEdit] = useState<DashboardVehicleSummary | null>(null)
  const [vehOpStatus, setVehOpStatus] = useState('READY')
  const [vehBizStatus, setVehBizStatus] = useState('ACTIVE')
  const [vehPriceDay, setVehPriceDay] = useState('')
  const [vehSalePrice, setVehSalePrice] = useState('')
  const [vehDeposit, setVehDeposit] = useState('')
  const [vehOdometer, setVehOdometer] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setForbidden(false)
    const query = new URLSearchParams({
      bookingPage: String(bookingPage),
      inquiryPage: String(inquiryPage),
      ...(bookingStatus ? { bookingStatus } : {}),
      ...(inquiryStatus ? { inquiryStatus } : {}),
    })
    api<DashboardData>(`/dashboard?${query.toString()}`)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((e) => {
        if (active) {
          setError(e.message)
          setForbidden(e.status === 403)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry, bookingPage, bookingStatus, inquiryPage, inquiryStatus])

  async function confirm() {
    if (!transition) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          id: transition.booking.id,
          status: transition.to,
          ...(handoverNote.trim() ? { handoverNote: handoverNote.trim() } : {}),
        }),
      })
      setTransition(null)
      setHandoverNote('')
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirmInquiry() {
    if (!inquiryAction) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'inquiry',
          id: inquiryAction.inquiry.id,
          status: inquiryAction.to,
        }),
      })
      setInquiryAction(null)
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleUserStatus(userId: string, nextStatus: 'ACTIVE' | 'DISABLED') {
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'user',
          id: userId,
          status: nextStatus,
        }),
      })
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function openVehicleEditor(v: DashboardVehicleSummary) {
    setVehicleEdit(v)
    setVehOpStatus(v.operationStatus)
    setVehBizStatus(v.status)
    setVehPriceDay(v.pricePerDay != null ? String(v.pricePerDay) : '')
    setVehSalePrice(v.salePrice != null ? String(v.salePrice) : '')
    setVehDeposit(v.depositAmount != null ? String(v.depositAmount) : '')
    setVehOdometer(v.odometer != null ? String(v.odometer) : '')
    setActionError('')
  }

  async function saveVehicleEdit() {
    if (!vehicleEdit) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'vehicle',
          id: vehicleEdit.id,
          operationStatus: vehOpStatus,
          status: vehBizStatus,
          pricePerDay: vehPriceDay.trim() ? Number(vehPriceDay.trim()) : null,
          salePrice: vehSalePrice.trim() ? Number(vehSalePrice.trim()) : null,
          depositAmount: vehDeposit.trim() ? Number(vehDeposit.trim()) : null,
          odometer: vehOdometer.trim() ? Number(vehOdometer.trim()) : null,
        }),
      })
      setVehicleEdit(null)
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleReviewStatus(reviewId: string, nextStatus: 'PUBLISHED' | 'HIDDEN') {
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'review',
          id: reviewId,
          status: nextStatus,
        }),
      })
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAdminLogout() {
    setBusy(true)
    try {
      await logout()
      await refresh()
      router.push('/login')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="space-y-7">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  if (forbidden)
    return (
      <EmptyState
        icon="shield"
        title="Không gian dành cho quản trị viên"
        description="Vui lòng đăng nhập bằng tài khoản Quản trị NORI (không dùng tài khoản khách hàng) để xem dữ liệu và vận hành hệ thống."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/login?returnTo=/dashboard">
            Đăng nhập quản trị <Icon name="arrow-right" className="size-4" />
          </ButtonLink>
          <ButtonLink href="/admin" variant="secondary">
            Mở Payload CMS (/admin) <Icon name="arrow-up-right" className="size-4" />
          </ButtonLink>
          <Button variant="ghost" onClick={() => setRetry(retry + 1)}>
            Thử kiểm tra lại
          </Button>
        </div>
      </EmptyState>
    )
  if (error || !data)
    return (
      <div>
        <Notice tone="error">{error || 'Chưa thể tải dashboard.'}</Notice>
        <Button onClick={() => setRetry(retry + 1)} className="mt-4">
          Thử tải lại
        </Button>
      </div>
    )

  const stats: { label: string; value: number; icon: IconName; detail: string }[] = [
    { label: 'Xe đang kinh doanh', value: data.vehicles, icon: 'car', detail: 'Kho xe thực tế' },
    {
      label: 'Tổng đơn thuê',
      value: data.totalBookings,
      icon: 'calendar',
      detail: 'Mọi trạng thái',
    },
    {
      label: 'Yêu cầu mua / lái thử',
      value: data.totalInquiries ?? 0,
      icon: 'bag',
      detail: 'Hồ sơ mua xe',
    },
    { label: 'Khách hàng', value: data.customers, icon: 'user', detail: 'Tài khoản ứng dụng' },
  ]

  const exportLinkStyle =
    'inline-flex min-h-control-sm items-center justify-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft'

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="brand">
            <span className="size-1.5 rounded-pill bg-brand" />
            Quản trị: {data.adminEmail || 'Admin NORI'}
          </Badge>
          <ButtonLink
            href="/admin"
            variant="secondary"
            className="min-h-control-sm px-3.5 py-2 text-caption"
          >
            Payload CMS (/admin) <Icon name="arrow-up-right" className="size-3.5" />
          </ButtonLink>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a href="/nori-api/dashboard/export?type=bookings" className={exportLinkStyle} download>
            Xuất CSV Đơn thuê
          </a>
          <a href="/nori-api/dashboard/export?type=inquiries" className={exportLinkStyle} download>
            Xuất CSV Yêu cầu mua
          </a>
          <a href="/nori-api/dashboard/export?type=vehicles" className={exportLinkStyle} download>
            Xuất CSV Đội xe
          </a>
          <Button variant="secondary" onClick={() => setRetry(retry + 1)} className="text-caption">
            <Icon name="clock" className="size-4" />
            Cập nhật dữ liệu
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => void handleAdminLogout()}
          >
            Đăng xuất quản trị
          </Button>
        </div>
      </div>

      {actionError && !transition && !inquiryAction && !vehicleEdit && (
        <Notice tone="error">{actionError}</Notice>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-canvas p-5">
            <div className="mb-4 flex items-center justify-between">
              <Text className="text-small text-muted">{s.label}</Text>
              <Icon name={s.icon} className="size-5 text-brand" />
            </div>
            <Text className="text-section font-semibold">{s.value.toLocaleString('vi-VN')}</Text>
            <Text className="mt-1 text-caption text-muted">{s.detail}</Text>
          </div>
        ))}
      </div>

      <div className="grid gap-7 lg:grid-cols-3">
        <div className="space-y-7 lg:col-span-2">
          <section className="rounded-card border border-line bg-canvas p-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Heading as="h2" size="subtitle">
                  Đơn thuê xe
                </Heading>
                <Text className="mt-1 text-caption text-muted">
                  Trang {data.bookingPage} / {data.bookingTotalPages} · {data.totalBookings} kết quả
                </Text>
              </div>
              <Select
                id="dashboard-booking-filter"
                label="Lọc trạng thái đơn"
                value={bookingStatus}
                onChange={(e) => {
                  setBookingStatus(e.target.value)
                  setBookingPage(1)
                }}
                wrapperClassName="w-full sm:w-56"
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(bookingStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {data.bookings.length ? (
              <div className="space-y-4">
                {data.bookings.map((booking) => (
                  <article key={booking.id} className="rounded-control border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Text className="font-semibold">
                          {booking.modelName} ({booking.reference})
                        </Text>
                        <Text className="mt-1 text-caption text-muted">
                          {booking.bookingKey?.slice(0, 11).toUpperCase()} · {booking.customerName}
                          {booking.customerPhone ? ` · ${booking.customerPhone}` : ''}
                        </Text>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {booking.depositExpired && (
                          <Badge tone="warning">Quá hạn đặt cọc (&gt;24h)</Badge>
                        )}
                        <StatusBadge status={booking.status} />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-small text-muted">
                      <Text>
                        {formatDate(booking.startDate)} ({booking.pickupTime}) —{' '}
                        {formatDate(booking.endDate)} ({booking.returnTime})
                      </Text>
                      {booking.pickupLocation && (
                        <Text className="text-caption">
                          Địa điểm: {booking.pickupLocation}
                          {booking.deliveryRequested ? ' (Giao tận nơi)' : ''}
                        </Text>
                      )}
                      {booking.driverLicenseNumber && (
                        <Text className="text-caption">
                          GPLX / CCCD: {booking.driverLicenseNumber}
                        </Text>
                      )}
                      {booking.note && (
                        <Text className="text-caption text-ink">Ghi chú khách: {booking.note}</Text>
                      )}
                      {booking.handoverNote && (
                        <Text className="text-caption text-brand">
                          Ghi chú bàn giao: {booking.handoverNote}
                        </Text>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Text className="font-semibold">{formatMoney(booking.totalPrice)}</Text>
                        {booking.depositSnapshot > 0 && (
                          <Text className="text-micro text-muted">
                            Cọc riêng: {formatMoney(booking.depositSnapshot)}
                          </Text>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            'DEPOSIT_PENDING',
                            'CONFIRMED',
                            'READY_FOR_HANDOVER',
                            'ONGOING',
                            'INSPECTING',
                            'COMPLETED',
                            'REJECTED',
                            'CANCELLED',
                          ] as BookingStatus[]
                        )
                          .filter((to) =>
                            canTransition(
                              booking.status as BookingStatus,
                              to,
                              'admin',
                              booking.startDate,
                            ),
                          )
                          .map((to) => (
                            <Button
                              key={to}
                              size="sm"
                              variant={
                                ['REJECTED', 'CANCELLED'].includes(to) ? 'danger' : 'primary'
                              }
                              onClick={() => {
                                setTransition({ booking, to })
                                setHandoverNote(booking.handoverNote ?? '')
                                setActionError('')
                              }}
                            >
                              {actionLabels[to]}
                            </Button>
                          ))}
                      </div>
                    </div>
                  </article>
                ))}
                {data.bookingTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bookingPage <= 1}
                      onClick={() => setBookingPage((p) => Math.max(1, p - 1))}
                    >
                      Trang trước
                    </Button>
                    <Text className="text-caption text-muted">
                      Trang {data.bookingPage} / {data.bookingTotalPages}
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bookingPage >= data.bookingTotalPages}
                      onClick={() => setBookingPage((p) => p + 1)}
                    >
                      Trang sau
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon="calendar"
                title="Chưa có đơn thuê"
                description="Đơn thực tế sẽ xuất hiện sau khi khách hàng đặt xe."
              />
            )}
          </section>

          <section className="rounded-card border border-line bg-canvas p-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Heading as="h2" size="subtitle">
                  Yêu cầu mua xe & Lái thử
                </Heading>
                <Text className="mt-1 text-caption text-muted">
                  Trang {data.inquiryPage} / {data.inquiryTotalPages} · {data.totalInquiries} kết
                  quả
                </Text>
              </div>
              <Select
                id="dashboard-inquiry-filter"
                label="Lọc trạng thái yêu cầu"
                value={inquiryStatus}
                onChange={(e) => {
                  setInquiryStatus(e.target.value)
                  setInquiryPage(1)
                }}
                wrapperClassName="w-full sm:w-56"
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(inquiryStatusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {data.inquiries?.length ? (
              <div className="space-y-4">
                {data.inquiries.map((inq) => (
                  <article key={inq.id} className="rounded-control border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge tone="brand">
                            {inquiryTypeLabels[inq.inquiryType] ?? inq.inquiryType}
                          </Badge>
                          {inq.vehicleReference && <Badge>{inq.vehicleReference}</Badge>}
                        </div>
                        <Text className="font-semibold">{inq.modelName}</Text>
                        <Text className="mt-1 text-caption text-muted">
                          {inq.reference.slice(0, 11).toUpperCase()} · {inq.customerName} ·{' '}
                          {inq.phone}
                        </Text>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {inq.depositExpired && (
                          <Badge tone="warning">Quá hạn đặt cọc (&gt;24h)</Badge>
                        )}
                        <StatusBadge status={inq.status} />
                      </div>
                    </div>
                    {inq.note && (
                      <Text className="mt-2 text-caption text-ink">Nhu cầu: {inq.note}</Text>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <Text className="text-caption text-muted">
                        {inq.preferredDate ? `Hẹn: ${formatDate(inq.preferredDate)}` : ''}
                        {inq.preferredLocation ? ` · ${inq.preferredLocation}` : ''}
                        {inq.quotedPriceSnapshot
                          ? ` · Giá lúc gửi: ${formatMoney(inq.quotedPriceSnapshot)}`
                          : ''}
                      </Text>
                      <div className="flex flex-wrap gap-2">
                        {(inquiryTransitions[inq.status] ?? []).map((act) => (
                          <Button
                            key={act.to}
                            size="sm"
                            variant={act.to === 'CANCELLED' ? 'danger' : 'secondary'}
                            onClick={() => {
                              setInquiryAction({ inquiry: inq, ...act })
                              setActionError('')
                            }}
                          >
                            {act.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
                {data.inquiryTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={inquiryPage <= 1}
                      onClick={() => setInquiryPage((p) => Math.max(1, p - 1))}
                    >
                      Trang trước
                    </Button>
                    <Text className="text-caption text-muted">
                      Trang {data.inquiryPage} / {data.inquiryTotalPages}
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={inquiryPage >= data.inquiryTotalPages}
                      onClick={() => setInquiryPage((p) => p + 1)}
                    >
                      Trang sau
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon="bag"
                title="Chưa có yêu cầu mua xe"
                description="Các yêu cầu tư vấn, báo giá và lái thử của khách sẽ hiển thị tại đây."
              />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-card border border-line bg-canvas p-6">
            <Heading as="h2" size="subtitle">
              Quản lý nhanh (CMS)
            </Heading>
            <div className="mt-5 grid gap-3">
              {[
                {
                  label: 'Kho xe thực tế',
                  href: '/admin/collections/vehicles',
                  icon: 'car' as const,
                },
                {
                  label: `Catalogue (${data.models})`,
                  href: '/admin/collections/vehicle-models',
                  icon: 'grid' as const,
                },
                {
                  label: 'Toàn bộ đơn thuê',
                  href: '/admin/collections/bookings',
                  icon: 'calendar' as const,
                },
                {
                  label: 'Yêu cầu mua xe',
                  href: '/admin/collections/sales-inquiries',
                  icon: 'bag' as const,
                },
                {
                  label: 'Đánh giá khách hàng',
                  href: '/admin/collections/reviews',
                  icon: 'sparkles' as const,
                },
                {
                  label: 'Thông tin & chính sách',
                  href: '/admin/globals/nori-site',
                  icon: 'settings' as const,
                },
              ].map((link) => (
                <ButtonLink
                  key={link.href}
                  href={link.href}
                  variant="secondary"
                  className="justify-start text-caption"
                >
                  <Icon name={link.icon} className="size-4" />
                  {link.label}
                  <Icon name="arrow-up-right" className="ml-auto size-4" />
                </ButtonLink>
              ))}
            </div>
          </section>

          <section className="rounded-card bg-soft p-6">
            <Heading as="h2" size="body">
              Vòng đời đơn thuê
            </Heading>
            <div className="mt-4 space-y-3">
              {Object.entries(data.statuses).map(([status, count]) => (
                <div className="flex items-center justify-between" key={status}>
                  <StatusBadge status={status} />
                  <Text className="font-semibold">{count}</Text>
                </div>
              ))}
            </div>
            <Text className="mt-5 text-micro text-muted">
              Website không thu tiền trực tuyến. Trạng thái đơn không phản ánh thanh toán hay doanh
              thu thực nhận.
            </Text>
          </section>

          {data.fleetStats && (
            <section className="rounded-card border border-line bg-canvas p-6">
              <Heading as="h2" size="body">
                Thống kê Đội xe &amp; Giá trị Hợp đồng (Dự kiến)
              </Heading>
              <div className="mt-4 space-y-2.5 text-small">
                <div className="flex items-center justify-between">
                  <Text className="text-muted">Tỷ lệ khai thác / giữ chỗ</Text>
                  <Badge tone="brand">{data.fleetStats.utilizationRate}%</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <Text className="text-muted">Quá hạn đặt cọc (&gt;24h)</Text>
                  <Badge tone={data.fleetStats.expiredDepositCount > 0 ? 'warning' : 'muted'}>
                    {data.fleetStats.expiredDepositCount}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2.5">
                  <Text className="text-muted">Hợp đồng đang giữ lịch</Text>
                  <Text className="font-semibold">
                    {formatMoney(data.fleetStats.activeContractValue)}
                  </Text>
                </div>
                <div className="flex items-center justify-between">
                  <Text className="text-muted">Hợp đồng đã hoàn thành</Text>
                  <Text className="font-semibold text-brand">
                    {formatMoney(data.fleetStats.completedContractValue)}
                  </Text>
                </div>
              </div>
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                {Object.entries(data.fleetStats.byOperationStatus).map(([opKey, opCount]) => (
                  <div className="flex items-center justify-between text-caption" key={opKey}>
                    <Text className="text-muted">{operationStatusLabels[opKey] ?? opKey}</Text>
                    <Text className="font-medium">{opCount}</Text>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* Customer Account Management */}
      <section className="rounded-card border border-line bg-canvas p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Quản lý Tài khoản Khách hàng ({data.customersList?.length ?? 0})
            </Heading>
            <Text className="mt-1 text-caption text-muted">
              Theo dõi trạng thái tài khoản ứng dụng (`users`) và khóa tạm thời hoặc mở khóa khi
              cần.
            </Text>
          </div>
        </div>
        {data.customersList?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-line text-caption text-muted">
                  <th className="py-3 pr-4">Họ tên</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">SĐT</th>
                  <th className="py-3 pr-4">Trạng thái</th>
                  <th className="py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.customersList.map((cust) => (
                  <tr key={cust.id}>
                    <td className="py-3 pr-4 font-medium">{cust.fullName}</td>
                    <td className="py-3 pr-4 break-all text-caption text-muted">{cust.email}</td>
                    <td className="py-3 pr-4 text-caption text-muted">{cust.phone ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={cust.status === 'ACTIVE' ? 'brand' : 'danger'}>
                        {cust.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        variant={cust.status === 'ACTIVE' ? 'danger' : 'secondary'}
                        disabled={busy}
                        onClick={() =>
                          toggleUserStatus(
                            cust.id,
                            cust.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                          )
                        }
                      >
                        {cust.status === 'ACTIVE' ? 'Khóa tạm thời' : 'Mở khóa'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="user"
            title="Chưa có tài khoản khách hàng"
            description="Tài khoản khách hàng đăng ký sẽ hiển thị tại đây."
          />
        )}
      </section>

      {/* Fleet, Pricing & Maintenance Management */}
      <section className="rounded-card border border-line bg-canvas p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Quản lý Đội xe, Giá &amp; Bảo trì ({data.vehiclesList?.length ?? 0})
            </Heading>
            <Text className="mt-1 text-caption text-muted">
              Cập nhật nhanh giá thuê ngày, giá bán, tiền cọc, số ODO và tình trạng bảo trì của xe
              thực tế.
            </Text>
          </div>
          <ButtonLink
            href="/admin/collections/vehicle-models"
            variant="secondary"
            className="min-h-control-sm px-3.5 py-2 text-caption"
          >
            Quản lý Dòng xe &amp; Ảnh (CMS) <Icon name="arrow-up-right" className="size-3.5" />
          </ButtonLink>
        </div>
        {data.vehiclesList?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-line text-caption text-muted">
                  <th className="py-3 pr-4">Mã xe · Dòng xe</th>
                  <th className="py-3 pr-4">Biển số</th>
                  <th className="py-3 pr-4">Giá thuê / ngày</th>
                  <th className="py-3 pr-4">Giá bán</th>
                  <th className="py-3 pr-4">ODO (km)</th>
                  <th className="py-3 pr-4">Vận hành</th>
                  <th className="py-3 pr-4">Kinh doanh</th>
                  <th className="py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.vehiclesList.map((v) => (
                  <tr key={v.id} data-vehicle-ref={v.reference}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">{v.reference}</div>
                      <NoriLink
                        href={`/vehicles/${v.modelSlug}`}
                        className="text-caption text-brand"
                      >
                        {v.modelName}
                      </NoriLink>
                    </td>
                    <td className="py-3 pr-4 text-caption text-muted">{v.licensePlate ?? '—'}</td>
                    <td className="py-3 pr-4">
                      {v.pricePerDay ? formatMoney(v.pricePerDay) : '—'}
                    </td>
                    <td className="py-3 pr-4">{v.salePrice ? formatMoney(v.salePrice) : '—'}</td>
                    <td className="py-3 pr-4 text-caption text-muted">
                      {v.odometer != null ? v.odometer.toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        tone={
                          v.operationStatus === 'READY'
                            ? 'brand'
                            : v.operationStatus === 'MAINTENANCE' || v.operationStatus === 'SOLD'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {operationStatusLabels[v.operationStatus] ?? v.operationStatus}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-caption text-muted">
                      {v.status === 'ACTIVE' ? 'Đang mở' : 'Tạm ngưng'}
                    </td>
                    <td className="py-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => openVehicleEditor(v)}
                      >
                        Cập nhật / Bảo trì
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="car"
            title="Chưa có xe thực tế"
            description="Kho xe thực tế sẽ hiển thị tại đây."
          />
        )}
      </section>

      {/* Customer Reviews Moderation */}
      <section className="rounded-card border border-line bg-canvas p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Quản lý Đánh giá Khách hàng ({data.reviewsList?.length ?? 0})
            </Heading>
            <Text className="mt-1 text-caption text-muted">
              Kiểm duyệt hiển thị các đánh giá thực tế từ đơn thuê đã hoàn thành.
            </Text>
          </div>
        </div>
        {data.reviewsList?.length ? (
          <div className="space-y-3">
            {data.reviewsList.map((rev) => (
              <div
                key={rev.id}
                data-review-title={rev.title ?? rev.comment}
                className="flex flex-wrap items-start justify-between gap-4 rounded-control border border-line p-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text className="font-semibold">{rev.customerName}</Text>
                    <Badge tone="brand">{rev.rating} / 5 sao</Badge>
                    <Badge tone={rev.status === 'PUBLISHED' ? 'brand' : 'muted'}>
                      {rev.status === 'PUBLISHED' ? 'Đang hiển thị' : 'Đang ẩn'}
                    </Badge>
                  </div>
                  <Text className="text-caption text-muted">
                    {rev.modelName}
                    {rev.vehicleReference ? ` · ${rev.vehicleReference}` : ''} ·{' '}
                    {formatDate(rev.createdAt)}
                  </Text>
                  {rev.title && <Text className="font-medium text-ink">{rev.title}</Text>}
                  <Text className="text-small text-muted">{rev.comment}</Text>
                </div>
                <Button
                  size="sm"
                  variant={rev.status === 'PUBLISHED' ? 'danger' : 'secondary'}
                  disabled={busy}
                  onClick={() =>
                    toggleReviewStatus(rev.id, rev.status === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED')
                  }
                >
                  {rev.status === 'PUBLISHED' ? 'Ẩn đánh giá' : 'Hiện đánh giá'}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="sparkles"
            title="Chưa có đánh giá nào"
            description="Đánh giá thật từ khách hàng đã hoàn thành chuyến thuê sẽ hiển thị tại đây."
          />
        )}
      </section>

      {/* Data Completeness Audit */}
      <section className="rounded-card border border-line bg-canvas p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading as="h2" size="subtitle">
              Kiểm tra mức độ hoàn thiện dữ liệu phương tiện ({data.dataCompleteness?.length ?? 0}{' '}
              dòng xe)
            </Heading>
            <Text className="mt-1 text-caption text-muted">
              Đánh giá tự động ảnh đại diện, ảnh nội thất (với ô tô/bán tải), thông số, phiên bản,
              nguồn tham chiếu, xe thực tế và giá.
            </Text>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-small">
            <thead>
              <tr className="border-b border-line text-caption text-muted">
                <th className="py-3 pr-4">Dòng xe</th>
                <th className="py-3 pr-4">Loại</th>
                <th className="py-3 pr-4">Xe thực tế</th>
                <th className="py-3 pr-4">Độ hoàn thiện</th>
                <th className="py-3">Mục cần bổ sung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data.dataCompleteness ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-medium">
                    <NoriLink href={`/vehicles/${row.slug}`} className="text-brand">
                      {row.name}
                    </NoriLink>
                  </td>
                  <td className="py-3 pr-4 text-caption text-muted">{row.category}</td>
                  <td className="py-3 pr-4">{row.fleetCount}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={row.score === 100 ? 'brand' : 'warning'}>{row.score}%</Badge>
                  </td>
                  <td className="py-3 text-caption text-muted">
                    {row.missing.length ? row.missing.join(', ') : 'Đầy đủ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        title={transition ? actionLabels[transition.to] : 'Xử lý đơn thuê'}
        open={!!transition}
        onClose={() => {
          if (!busy) {
            setTransition(null)
            setHandoverNote('')
          }
        }}
      >
        <Text className="text-muted">
          Xác nhận thao tác “{transition && actionLabels[transition.to]}” cho đơn{' '}
          {transition?.booking.bookingKey?.slice(0, 11).toUpperCase()}?
        </Text>
        {transition?.to === 'COMPLETED' && (
          <Notice className="mt-4">
            Chỉ xác nhận sau khi bạn đã thực sự nhận lại xe và quyết toán. Thao tác này giải phóng
            lịch xe.
          </Notice>
        )}
        {transition?.to === 'ONGOING' && (
          <Notice className="mt-4">Chỉ xác nhận sau khi đã bàn giao xe thực tế cho khách.</Notice>
        )}
        <Textarea
          id="dashboard-handover-note"
          label="Ghi chú bàn giao / kiểm tra xe (tùy chọn)"
          value={handoverNote}
          onChange={(e) => setHandoverNote(e.target.value)}
          maxLength={1000}
          rows={3}
          wrapperClassName="mt-4"
          placeholder="Ví dụ: Đã đối chiếu GPLX, mức nhiên liệu đầy bình, thân vỏ nguyên vẹn..."
        />
        {actionError && (
          <Notice tone="error" className="mt-4">
            {actionError}
          </Notice>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setTransition(null)
              setHandoverNote('')
            }}
          >
            Quay lại
          </Button>
          <Button loading={busy} onClick={confirm}>
            Xác nhận thao tác
          </Button>
        </div>
      </Dialog>

      <Dialog
        title={inquiryAction?.label ?? 'Xử lý yêu cầu mua xe'}
        open={!!inquiryAction}
        onClose={() => {
          if (!busy) setInquiryAction(null)
        }}
      >
        <Text className="text-muted">
          Cập nhật yêu cầu {inquiryAction?.inquiry.reference.slice(0, 11).toUpperCase()} sang trạng
          thái “{inquiryAction?.label}”?
        </Text>
        {inquiryAction?.to === 'DELIVERED' && (
          <Notice className="mt-4">
            Thao tác này sẽ đánh dấu xe thực tế liên kết là ĐÃ BÁN và loại khỏi danh sách thuê/bán
            (nếu không có đơn thuê chưa hoàn tất).
          </Notice>
        )}
        {actionError && (
          <Notice tone="error" className="mt-4">
            {actionError}
          </Notice>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setInquiryAction(null)}>
            Quay lại
          </Button>
          <Button loading={busy} onClick={confirmInquiry}>
            Xác nhận cập nhật
          </Button>
        </div>
      </Dialog>

      <Dialog
        title={vehicleEdit ? `Cập nhật xe ${vehicleEdit.reference}` : 'Cập nhật phương tiện'}
        open={!!vehicleEdit}
        onClose={() => {
          if (!busy) setVehicleEdit(null)
        }}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="veh-op-status"
              label="Tình trạng vận hành"
              value={vehOpStatus}
              onChange={(e) => setVehOpStatus(e.target.value)}
            >
              <option value="READY">Sẵn sàng (READY)</option>
              <option value="MAINTENANCE">Đang bảo trì (MAINTENANCE)</option>
              <option value="RESERVED">Giữ chỗ mua (RESERVED)</option>
              <option value="RENTED">Đang cho thuê (RENTED)</option>
              <option value="INACTIVE">Tạm ngưng (INACTIVE)</option>
              <option value="SOLD">Đã bán (SOLD)</option>
            </Select>
            <Select
              id="veh-biz-status"
              label="Trạng thái kinh doanh"
              value={vehBizStatus}
              onChange={(e) => setVehBizStatus(e.target.value)}
            >
              <option value="ACTIVE">Đang mở (ACTIVE)</option>
              <option value="INACTIVE">Tạm ngưng (INACTIVE)</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="veh-price-day"
              label="Giá thuê / ngày (VNĐ)"
              type="number"
              min={0}
              value={vehPriceDay}
              onChange={(e) => setVehPriceDay(e.target.value)}
            />
            <Input
              id="veh-sale-price"
              label="Giá bán (VNĐ)"
              type="number"
              min={0}
              value={vehSalePrice}
              onChange={(e) => setVehSalePrice(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="veh-deposit"
              label="Tiền đặt cọc (VNĐ)"
              type="number"
              min={0}
              value={vehDeposit}
              onChange={(e) => setVehDeposit(e.target.value)}
            />
            <Input
              id="veh-odometer"
              label="ODO thực tế (km)"
              type="number"
              min={0}
              value={vehOdometer}
              onChange={(e) => setVehOdometer(e.target.value)}
            />
          </div>
          {actionError && <Notice tone="error">{actionError}</Notice>}
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setVehicleEdit(null)}>
              Quay lại
            </Button>
            <Button loading={busy} onClick={saveVehicleEdit}>
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
