'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { canTransition, formatDate, formatMoney, type BookingStatus } from '@/lib/rental-rules'
import type { BookingView } from '@/lib/domain-types'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Notice,
  Skeleton,
  StatusBadge,
  Text,
} from './ui'
import { Icon, type IconName } from './ui/icon'
import { Dialog } from './ui/dialog'

type DashboardData = {
  vehicles: number
  models: number
  customers: number
  totalBookings: number
  statuses: Record<string, number>
  bookings: BookingView[]
}
const actionLabels: Record<string, string> = {
  CONFIRMED: 'Duyệt đơn',
  REJECTED: 'Từ chối',
  ONGOING: 'Đã giao xe',
  CANCELLED: 'Hủy theo yêu cầu',
  COMPLETED: 'Đã nhận lại xe',
}

export function DashboardPanel() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [retry, setRetry] = useState(0)
  const [transition, setTransition] = useState<{ booking: BookingView; to: BookingStatus } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setForbidden(false)
    api<DashboardData>('/dashboard')
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
  }, [retry])
  async function confirm() {
    if (!transition) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard', {
        method: 'PATCH',
        body: JSON.stringify({ id: transition.booking.id, status: transition.to }),
      })
      setTransition(null)
      setRetry(retry + 1)
    } catch (e) {
      setActionError((e as Error).message)
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
        description="Dashboard sử dụng phiên quản trị Payload/Figma riêng, không dùng tài khoản khách hàng. Đăng nhập quản trị để xem dữ liệu vận hành."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/admin">
            Mở quản trị Payload <Icon name="arrow-up-right" className="size-4" />
          </ButtonLink>
          <Button variant="secondary" onClick={() => setRetry(retry + 1)}>
            Tôi đã đăng nhập, thử lại
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
      label: 'Đơn chờ xác nhận',
      value: data.statuses.PENDING ?? 0,
      icon: 'clock',
      detail: 'Cần được xử lý',
    },
    { label: 'Khách hàng', value: data.customers, icon: 'user', detail: 'Tài khoản ứng dụng' },
  ]
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Badge tone="brand">
          <span className="size-1.5 rounded-pill bg-brand" />
          Dữ liệu từ Payload
        </Badge>
        <Button variant="secondary" onClick={() => setRetry(retry + 1)} className="text-caption">
          <Icon name="clock" className="size-4" />
          Cập nhật dữ liệu
        </Button>
      </div>
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
      <div className="mt-7 grid gap-7 lg:grid-cols-3">
        <section className="rounded-card border border-line p-6 lg:col-span-2">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Heading as="h2" size="subtitle">
              Đơn thuê gần nhất
            </Heading>
            <Text className="text-caption text-muted">Tối đa 20 đơn · mới nhất trước</Text>
          </div>
          {data.bookings.length ? (
            <div className="space-y-4">
              {data.bookings.map((booking) => (
                <article key={booking.id} className="rounded-control border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Text className="font-semibold">{booking.modelName}</Text>
                      <Text className="mt-1 text-caption text-muted">
                        {booking.bookingKey?.slice(0, 11).toUpperCase()} · {booking.customerName}
                      </Text>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>
                  <Text className="mt-4 text-small text-muted">
                    {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
                  </Text>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Text className="font-semibold">{formatMoney(booking.totalPrice)}</Text>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          'CONFIRMED',
                          'REJECTED',
                          'ONGOING',
                          'CANCELLED',
                          'COMPLETED',
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
                            variant={['REJECTED', 'CANCELLED'].includes(to) ? 'danger' : 'primary'}
                            className="min-h-control-sm px-3 py-2 text-caption"
                            onClick={() => {
                              setTransition({ booking, to })
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
            </div>
          ) : (
            <EmptyState
              icon="calendar"
              title="Chưa có đơn thuê"
              description="Đơn thực tế sẽ xuất hiện sau khi khách hàng đặt xe. Không sử dụng đơn mẫu để thay thế dữ liệu vận hành."
            />
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-card border border-line p-6">
            <Heading as="h2" size="subtitle">
              Quản lý nhanh
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
                  label: 'Thông tin & liên hệ',
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
              Website không xử lý thu tiền. Trạng thái đơn không phản ánh thanh toán hoặc doanh thu
              thực nhận.
            </Text>
          </section>
        </aside>
      </div>
      <Dialog
        title={transition ? actionLabels[transition.to] : 'Xử lý đơn thuê'}
        open={!!transition}
        onClose={() => {
          if (!busy) setTransition(null)
        }}
      >
        <Text className="text-muted">
          Xác nhận thao tác “{transition && actionLabels[transition.to]}” cho đơn{' '}
          {transition?.booking.bookingKey?.slice(0, 11).toUpperCase()}?
        </Text>
        {transition?.to === 'COMPLETED' && (
          <Notice className="mt-4">
            Chỉ xác nhận sau khi bạn đã thực sự nhận lại xe. Thao tác này giải phóng lịch xe.
          </Notice>
        )}
        {transition?.to === 'ONGOING' && (
          <Notice className="mt-4">Chỉ xác nhận sau khi đã bàn giao xe thực tế cho khách.</Notice>
        )}
        {actionError && (
          <Notice tone="error" className="mt-4">
            {actionError}
          </Notice>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setTransition(null)}>
            Quay lại
          </Button>
          <Button loading={busy} onClick={confirm}>
            Xác nhận thao tác
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
