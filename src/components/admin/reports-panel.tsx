'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatMoney,
  inquiryStatusLabels,
  operationStatusLabels,
  paymentMethodLabels,
} from '@/lib/rental-rules'
import { Badge, Button, Heading, Input, Notice, Skeleton, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

type ReportsData = {
  range: { from: string | null; to: string | null }
  fleet: {
    total: number
    active: number
    utilizationRate: number
    demoVehicles: number
    realVehicles: number
    byOperationStatus: Record<string, number>
  }
  bookings: { total: number; byStatus: Record<string, number> }
  inquiries: { total: number; byStatus: Record<string, number> }
  customers: { total: number; active: number; disabled: number }
  financial: {
    completedExpectedValue: number
    activeHoldExpectedValue: number
    extraFeeTotal: number
    depositExpectedOnActive: number
    totalVerifiedReceived?: number
    depositCollected?: number
    rentalFeeCollected?: number
    extraFeeCollected?: number
    rentalRevenueGrossCollected?: number
    netRentalRevenueCollected?: number
    securityDepositHeld?: number
    totalRefunded?: number
    pendingRefundTotal?: number
    netCollectedTotal?: number
    remainingReceivable?: number
    pendingReconciliationCount?: number
    paymentsByStatus?: Record<string, number>
    paymentsByMethod?: Record<string, number>
    paymentsByProvider?: Record<string, number>
    onlinePaymentIntegrated: boolean
    activeProvider?: string
    environment?: string
    realizedPaymentNote: string
  }
}

export function ReportsPanel() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    api<ReportsData>(`/dashboard/reports?${sp.toString()}`)
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
  }, [from, to])

  const exportQuery =
    from || to
      ? `&${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}`
      : ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="rep-from"
            label="Từ ngày"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            id="rep-to"
            label="Đến ngày"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(from || to) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Xóa bộ lọc ngày
            </Button>
          )}
          {[
            { type: 'bookings', label: 'CSV Đơn thuê' },
            { type: 'payments', label: 'CSV Giao dịch' },
            { type: 'inquiries', label: 'CSV Yêu cầu mua' },
            { type: 'vehicles', label: 'CSV Đội xe' },
            { type: 'customers', label: 'CSV Khách hàng' },
            { type: 'financial', label: 'CSV Tài chính' },
          ].map((item) => (
            <a
              key={item.type}
              href={`/nori-api/dashboard/export?type=${item.type}${exportQuery}`}
              download
              className="inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
            >
              <Icon name="download" className="size-4" />
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          <Notice tone="info">{data.financial.realizedPaymentNote}</Notice>

          {/* Verified Cashflow & Revenue Separation */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Thực thu tiền thuê đã xác thực</Text>
              <Text className="mt-1 text-title font-bold text-brand">
                {formatMoney(data.financial.rentalRevenueGrossCollected ?? 0)}
              </Text>
              <Text className="mt-1 text-caption text-muted">
                Cọc giữ chỗ: {formatMoney(data.financial.depositCollected ?? 0)} · Tiền thuê:{' '}
                {formatMoney(data.financial.rentalFeeCollected ?? 0)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Doanh thu ròng sau hoàn tiền</Text>
              <Text className="mt-1 text-title font-bold text-brand">
                {formatMoney(data.financial.netRentalRevenueCollected ?? 0)}
              </Text>
              <Text className="mt-1 text-caption text-muted">
                Đã hoàn trả: {formatMoney(data.financial.totalRefunded ?? 0)} · Phụ phí thu:{' '}
                {formatMoney(data.financial.extraFeeCollected ?? 0)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">
                Cọc bảo đảm tài sản (tách riêng doanh thu)
              </Text>
              <Text className="mt-1 text-title font-bold text-ink">
                {formatMoney(data.financial.securityDepositHeld ?? 0)}
              </Text>
              <Text className="mt-1 text-caption text-muted">
                Không cộng gộp vào doanh thu tiền thuê xe
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Còn phải thu & Đối soát</Text>
              <Text className="mt-1 text-title font-bold text-ink">
                {formatMoney(data.financial.remainingReceivable ?? 0)}
              </Text>
              <Text className="mt-1 text-caption text-warning">
                Chờ đối soát: {data.financial.pendingReconciliationCount ?? 0} giao dịch
              </Text>
            </div>
          </div>

          {/* Payment Method & Provider Breakdown */}
          {data.financial.paymentsByMethod &&
            Object.keys(data.financial.paymentsByMethod).length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-card border border-line bg-canvas p-5">
                  <Heading as="h2" size="subtitle" className="mb-3">
                    Thực thu theo phương thức thanh toán
                  </Heading>
                  <div className="space-y-2 text-small">
                    {Object.entries(data.financial.paymentsByMethod).map(([m, val]) => (
                      <div
                        key={m}
                        className="flex items-center justify-between border-b border-line py-1.5 last:border-0"
                      >
                        <span>{paymentMethodLabels[m] ?? m}</span>
                        <strong className="text-brand">{formatMoney(val)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-card border border-line bg-canvas p-5">
                  <Heading as="h2" size="subtitle" className="mb-3">
                    Thực thu theo cổng thanh toán (Provider)
                  </Heading>
                  <div className="space-y-2 text-small">
                    {Object.entries(data.financial.paymentsByProvider ?? {}).map(([prov, val]) => (
                      <div
                        key={prov}
                        className="flex items-center justify-between border-b border-line py-1.5 last:border-0"
                      >
                        <span>{prov}</span>
                        <strong className="text-brand">{formatMoney(val)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {/* Financial + Utilization */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Giá trị đơn hoàn thành (dự kiến)</Text>
              <Text className="mt-1 text-title font-bold text-ink">
                {formatMoney(data.financial.completedExpectedValue)}
              </Text>
              <Text className="mt-1 text-caption text-muted">
                Phụ phí phát sinh: {formatMoney(data.financial.extraFeeTotal)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Giá trị đơn đang giữ lịch</Text>
              <Text className="mt-1 text-title font-bold text-ink">
                {formatMoney(data.financial.activeHoldExpectedValue)}
              </Text>
              <Text className="mt-1 text-caption text-muted">
                Cọc đảm bảo dự kiến: {formatMoney(data.financial.depositExpectedOnActive)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Tỷ lệ khai thác đội xe</Text>
              <Text className="mt-1 text-title font-bold text-brand">
                {data.fleet.utilizationRate}%
              </Text>
              <Text className="mt-1 text-caption text-muted">
                {data.fleet.active} xe đang kinh doanh / {data.fleet.total} tổng kho
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-5">
              <Text className="text-caption text-muted">Phân loại dữ liệu xe</Text>
              <Text className="mt-1 text-title font-bold text-ink">
                {data.fleet.realVehicles} thực tế
              </Text>
              <Text className="mt-1 text-caption text-warning">
                {data.fleet.demoVehicles} xe đang gắn cờ DEMO
              </Text>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Tình trạng đội xe ({data.fleet.total})
              </Heading>
              <div className="space-y-2 text-small">
                {Object.entries(operationStatusLabels).map(([k, label]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between border-b border-line py-2 last:border-0"
                  >
                    <span>{label}</span>
                    <Badge tone="muted">{data.fleet.byOperationStatus[k] ?? 0}</Badge>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Báo cáo đơn thuê ({data.bookings.total})
              </Heading>
              <div className="space-y-2 text-small">
                {Object.entries(bookingStatusLabels).map(([k, label]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between border-b border-line py-2 last:border-0"
                  >
                    <span>{label}</span>
                    <Badge tone="muted">{data.bookings.byStatus[k] ?? 0}</Badge>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-card border border-line bg-canvas p-5">
              <Heading as="h2" size="subtitle" className="mb-3">
                Yêu cầu mua & Khách hàng
              </Heading>
              <div className="mb-4 space-y-2 text-small">
                <div className="flex items-center justify-between rounded-control bg-subtle px-3 py-2">
                  <span>Khách hàng hoạt động</span>
                  <Badge tone="brand">{data.customers.active}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-control bg-subtle px-3 py-2">
                  <span>Khách hàng đang khóa</span>
                  <Badge tone="danger">{data.customers.disabled}</Badge>
                </div>
              </div>
              <div className="space-y-2 text-small">
                {Object.entries(inquiryStatusLabels).map(([k, label]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between border-b border-line py-2 last:border-0"
                  >
                    <span>{label}</span>
                    <Badge tone="muted">{data.inquiries.byStatus[k] ?? 0}</Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
