'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatDate,
  formatMoney,
  inquiryStatusLabels,
} from '@/lib/rental-rules'
import type { BookingView, FleetStats, InquiryView, TimeSeriesPoint } from '@/lib/domain-types'
import {
  Badge,
  Button,
  ButtonLink,
  Heading,
  NoriLink,
  Notice,
  Skeleton,
  StatusBadge,
  Text,
} from '@/components/ui'
import { Icon, type IconName } from '@/components/ui/icon'

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

type OverviewData = {
  adminEmail?: string
  adminName?: string
  vehicles: number
  models: number
  customers: number
  totalBookings: number
  totalInquiries: number
  statuses: Record<string, number>
  bookings: BookingView[]
  inquiries: InquiryView[]
  fleetStats: FleetStats
  timeSeries?: TimeSeriesPoint[]
  dataCompleteness: CompletenessItem[]
}

export function OverviewPanel() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api<OverviewData>('/dashboard')
      .then((res) => {
        if (active) setData(res)
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Notice tone="error">{error || 'Không thể tải dữ liệu tổng quan.'}</Notice>
        <Button onClick={() => setRetry((r) => r + 1)}>Thử tải lại</Button>
      </div>
    )
  }

  const byOp = data.fleetStats.byOperationStatus ?? {}
  const totalFleet = Object.values(byOp).reduce((sum, n) => sum + Number(n || 0), 0)
  const pendingCount = data.statuses.PENDING ?? 0
  const ongoingCount = (data.statuses.ONGOING ?? 0) + (data.statuses.INSPECTING ?? 0)
  const completedCount = data.statuses.COMPLETED ?? 0
  const expectedTotalValue =
    data.fleetStats.activeContractValue + data.fleetStats.completedContractValue

  const kpis: {
    label: string
    value: string
    sub: string
    icon: IconName
    href: string
    tone?: 'brand' | 'warning' | 'danger' | 'muted'
  }[] = [
    {
      label: 'Tổng phương tiện',
      value: totalFleet.toLocaleString('vi-VN'),
      sub: `${byOp.READY ?? 0} khả dụng · ${byOp.RENTED ?? 0} đang thuê · ${byOp.MAINTENANCE ?? 0} bảo trì`,
      icon: 'car',
      href: '/dashboard/vehicles',
      tone: 'brand',
    },
    {
      label: 'Tỷ lệ khai thác đội xe',
      value: `${data.fleetStats.utilizationRate}%`,
      sub: `${data.vehicles} xe đang kinh doanh / ${data.models} dòng xe`,
      icon: 'bar-chart',
      href: '/dashboard/reports',
      tone: 'brand',
    },
    {
      label: 'Tổng đơn thuê',
      value: data.totalBookings.toLocaleString('vi-VN'),
      sub: `${pendingCount} chờ xác nhận · ${ongoingCount} đang thực hiện · ${completedCount} hoàn thành`,
      icon: 'calendar',
      href: '/dashboard/bookings',
      tone: pendingCount > 0 ? 'warning' : 'muted',
    },
    {
      label: 'Đơn quá hạn đặt cọc',
      value: data.fleetStats.expiredDepositCount.toLocaleString('vi-VN'),
      sub: 'Quá 24h chưa xác nhận cọc',
      icon: 'alert',
      href: '/dashboard/bookings?status=DEPOSIT_PENDING',
      tone: data.fleetStats.expiredDepositCount > 0 ? 'danger' : 'muted',
    },
    {
      label: 'Yêu cầu mua xe',
      value: data.totalInquiries.toLocaleString('vi-VN'),
      sub: `${data.inquiries.filter((i) => i.status === 'NEW').length} yêu cầu mới tiếp nhận`,
      icon: 'bag',
      href: '/dashboard/inquiries',
      tone: 'brand',
    },
    {
      label: 'Tổng khách hàng',
      value: data.customers.toLocaleString('vi-VN'),
      sub: 'Tài khoản khách hàng ứng dụng',
      icon: 'user',
      href: '/dashboard/customers',
      tone: 'muted',
    },
    {
      label: 'Giá trị đơn thuê dự kiến',
      value: formatMoney(expectedTotalValue),
      sub: `Hoàn tất: ${formatMoney(data.fleetStats.completedContractValue)} · Giữ lịch: ${formatMoney(data.fleetStats.activeContractValue)}`,
      icon: 'wallet',
      href: '/dashboard/reports',
      tone: 'brand',
    },
    {
      label: 'Doanh thu thực thu (đã xác nhận)',
      value:
        (data.fleetStats.confirmedRevenue ?? 0) > 0
          ? formatMoney(data.fleetStats.confirmedRevenue)
          : '0 ₫',
      sub: 'Tổng hợp từ phiếu thu đã xác nhận tại /dashboard/payments',
      icon: 'wallet',
      href: '/dashboard/payments',
      tone: 'brand',
    },
  ]

  const series = data.timeSeries ?? []
  const maxActivity = Math.max(1, ...series.map((s) => s.bookings + s.inquiries))

  const todoItems = [
    {
      label: 'Đơn thuê chờ xác nhận',
      count: pendingCount,
      href: '/dashboard/bookings?status=PENDING',
      tone: pendingCount > 0 ? ('warning' as const) : ('muted' as const),
    },
    {
      label: 'Đơn quá hạn đặt cọc (>24h)',
      count: data.fleetStats.expiredDepositCount,
      href: '/dashboard/bookings?status=DEPOSIT_PENDING',
      tone: data.fleetStats.expiredDepositCount > 0 ? ('danger' as const) : ('muted' as const),
    },
    {
      label: 'Đơn chờ bàn giao / kiểm tra trả xe',
      count: (data.statuses.READY_FOR_HANDOVER ?? 0) + (data.statuses.INSPECTING ?? 0),
      href: '/dashboard/bookings',
      tone: 'brand' as const,
    },
    {
      label: 'Yêu cầu mua xe chưa liên hệ',
      count: data.inquiries.filter((i) => i.status === 'NEW').length,
      href: '/dashboard/inquiries?status=NEW',
      tone: 'brand' as const,
    },
    {
      label: 'Xe đang bảo dưỡng',
      count: byOp.MAINTENANCE ?? 0,
      href: '/dashboard/vehicles?operationStatus=MAINTENANCE',
      tone: 'muted' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div>
          <Text className="text-small font-semibold text-ink">
            Xin chào, {data.adminName || data.adminEmail || 'Quản trị viên NORI'}
          </Text>
          <Text className="text-caption text-muted">
            Số liệu được tổng hợp trực tiếp từ cơ sở dữ liệu NORI. Giá trị đơn thuê dự kiến được
            tách riêng khỏi doanh thu thực thu.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            <Icon name="clock" className="size-4" />
            Làm mới số liệu
          </Button>
          <ButtonLink
            href="/dashboard/reports"
            variant="primary"
            className="min-h-control-sm px-3.5 py-2 text-caption"
          >
            Xem báo cáo & Xuất CSV
          </ButtonLink>
        </div>
      </div>

      {/* KPI Grid */}
      <section
        aria-label="Chỉ số vận hành chính"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {kpis.map((kpi) => (
          <NoriLink
            key={kpi.label}
            href={kpi.href}
            className="group rounded-card border border-line bg-canvas p-5 transition-all hover:border-brand hover:shadow-card"
          >
            <div className="mb-3 flex items-center justify-between">
              <Text className="text-small font-medium text-muted">{kpi.label}</Text>
              <span className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Icon name={kpi.icon} className="size-4" />
              </span>
            </div>
            <Text className="text-title font-bold text-ink">{kpi.value}</Text>
            <Text className="mt-1.5 text-caption text-muted">{kpi.sub}</Text>
          </NoriLink>
        ))}
      </section>

      {/* Chart + Action Queue */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-canvas p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Heading as="h2" size="subtitle">
                Biểu đồ hoạt động 14 ngày gần nhất
              </Heading>
              <Text className="text-caption text-muted">
                Số lượng đơn thuê và yêu cầu mua phát sinh theo ngày tạo thực tế
              </Text>
            </div>
            <div className="flex items-center gap-4 text-caption">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-pill bg-brand" /> Đơn thuê
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-pill bg-warning" /> Yêu cầu mua
              </span>
            </div>
          </div>
          {series.length > 0 ? (
            <div className="flex h-48 items-end gap-2 border-b border-line pb-2 pt-4">
              {series.map((pt) => {
                const rentPct = Math.round((pt.bookings / maxActivity) * 100)
                const salePct = Math.round((pt.inquiries / maxActivity) * 100)
                return (
                  <div
                    key={pt.date}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${pt.date}: ${pt.bookings} đơn thuê, ${pt.inquiries} yêu cầu mua`}
                  >
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div
                        className="w-2.5 rounded-t-sm bg-brand transition-all"
                        style={{ height: `${Math.max(pt.bookings > 0 ? 12 : 2, rentPct)}%` }}
                      />
                      <div
                        className="w-2.5 rounded-t-sm bg-warning transition-all"
                        style={{ height: `${Math.max(pt.inquiries > 0 ? 12 : 2, salePct)}%` }}
                      />
                    </div>
                    <span className="text-micro text-muted">{pt.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Text className="py-12 text-center text-small text-muted">
              Chưa có dữ liệu phát sinh trong 14 ngày gần đây.
            </Text>
          )}
        </section>

        <section className="rounded-card border border-line bg-canvas p-5">
          <Heading as="h2" size="subtitle" className="mb-1">
            Công việc cần xử lý
          </Heading>
          <Text className="mb-4 text-caption text-muted">
            Danh sách đầu việc ưu tiên theo trạng thái hiện tại
          </Text>
          <div className="space-y-2.5">
            {todoItems.map((item) => (
              <NoriLink
                key={item.label}
                href={item.href}
                className="flex items-center justify-between rounded-control border border-line bg-subtle px-3.5 py-2.5 text-small hover:border-brand hover:bg-brand-soft"
              >
                <span className="font-medium text-ink">{item.label}</span>
                <Badge tone={item.tone}>{item.count}</Badge>
              </NoriLink>
            ))}
          </div>
        </section>
      </div>

      {/* Recent Transactions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-canvas p-5">
          <div className="mb-4 flex items-center justify-between">
            <Heading as="h2" size="subtitle">
              Đơn thuê gần đây
            </Heading>
            <NoriLink href="/dashboard/bookings" className="text-small font-semibold text-brand">
              Xem tất cả →
            </NoriLink>
          </div>
          {data.bookings.length === 0 ? (
            <Text className="py-6 text-center text-small text-muted">Chưa có đơn thuê nào.</Text>
          ) : (
            <div className="divide-y divide-line">
              {data.bookings.slice(0, 5).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Text className="truncate text-small font-semibold text-ink">
                      {b.modelName} ({b.reference})
                    </Text>
                    <Text className="text-caption text-muted">
                      {b.customerName} · {formatDate(b.startDate)} → {formatDate(b.endDate)}
                    </Text>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={b.status} />
                    <Text className="mt-1 text-caption font-semibold text-ink">
                      {formatMoney(b.totalPrice)}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-card border border-line bg-canvas p-5">
          <div className="mb-4 flex items-center justify-between">
            <Heading as="h2" size="subtitle">
              Yêu cầu mua xe gần đây
            </Heading>
            <NoriLink href="/dashboard/inquiries" className="text-small font-semibold text-brand">
              Xem tất cả →
            </NoriLink>
          </div>
          {data.inquiries.length === 0 ? (
            <Text className="py-6 text-center text-small text-muted">
              Chưa có yêu cầu mua xe nào.
            </Text>
          ) : (
            <div className="divide-y divide-line">
              {data.inquiries.slice(0, 5).map((inq) => (
                <div
                  key={inq.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <Text className="truncate text-small font-semibold text-ink">
                      {inq.modelName}
                      {inq.vehicleReference ? ` (${inq.vehicleReference})` : ''}
                    </Text>
                    <Text className="text-caption text-muted">
                      {inq.customerName} · {inq.phone || 'Chưa có SĐT'}
                    </Text>
                  </div>
                  <div className="text-right">
                    <Badge tone="muted">{inquiryStatusLabels[inq.status] ?? inq.status}</Badge>
                    <Text className="mt-1 text-caption text-muted">
                      {inq.quotedPriceSnapshot ? formatMoney(inq.quotedPriceSnapshot) : 'Tư vấn'}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Data Completeness Summary */}
      <section className="rounded-card border border-line bg-canvas p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <Heading as="h2" size="subtitle">
              Mức độ hoàn thiện dữ liệu Catalogue ({data.models} dòng xe)
            </Heading>
            <Text className="text-caption text-muted">
              Đảm bảo đầy đủ ảnh, thông số, phiên bản và xe thực tế trước khi công bố
            </Text>
          </div>
          <NoriLink href="/dashboard/models" className="text-small font-semibold text-brand">
            Quản lý Catalogue →
          </NoriLink>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.dataCompleteness.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-control border border-line bg-subtle p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Text className="truncate text-small font-semibold">{item.name}</Text>
                <Badge tone={item.score === 100 ? 'brand' : 'warning'}>{item.score}%</Badge>
              </div>
              <Text className="mt-1 text-caption text-muted">
                {item.fleetCount} xe thực tế ·{' '}
                {item.missing.length === 0 ? 'Đạt chuẩn' : item.missing.join(', ')}
              </Text>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
