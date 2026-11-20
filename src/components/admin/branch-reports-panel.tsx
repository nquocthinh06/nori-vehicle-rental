'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { type BranchFleetStats, type BranchReportMetrics } from '@/lib/multi-branch-rules'
import { formatVnd } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  Text,
} from '@/components/ui'
import { Icon } from '@/components/ui/icon'

type BranchReportRow = {
  branchId: string
  code: string
  name: string
  province: string
  status: string
  fleet: BranchFleetStats
  utilizationRate: number
  transfersOut: number
  transfersIn: number
  deliveryJobsCount: number
  metrics: BranchReportMetrics
}

type WarehouseReportRow = {
  warehouseId: string
  code: string
  name: string
  branchName: string
  occupancy: {
    physicalCount: number
    readyCount: number
    capacity: number
    occupancyRate: number
    isOverCapacity: boolean
  }
}

type ReportPayload = {
  branches: BranchReportRow[]
  warehouses: WarehouseReportRow[]
  systemTotal: Omit<BranchReportMetrics, 'branchId'>
  systemFleet: BranchFleetStats
  conflicts: { kind: string; reference: string; message: string }[]
  filters: {
    branches: { id: string; code: string; name: string }[]
    models: { id: string; name: string }[]
  }
  accountingNote: string
}

export function BranchReportsPanel() {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [branchId, setBranchId] = useState('')
  const [modelId, setModelId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (branchId) sp.set('branchId', branchId)
    if (modelId) sp.set('modelId', modelId)
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    api<ReportPayload>(`/dashboard/branch-reports?${sp.toString()}`)
      .then((res) => {
        if (mounted) setData(res)
      })
      .catch((e) => {
        if (mounted) setError((e as Error).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [branchId, modelId, from, to])

  function exportCsv() {
    const sp = new URLSearchParams({ type: 'branch-reports' })
    if (branchId) sp.set('branchId', branchId)
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    window.location.href = `/nori-api/dashboard/export?${sp.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            id="rep-br"
            label="Chi nhánh"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Tất cả chi nhánh được cấp quyền</option>
            {(data?.filters.branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
          <Select
            id="rep-mod"
            label="Dòng xe"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            <option value="">Tất cả dòng xe</option>
            {(data?.filters.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
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
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Icon name="download" className="size-4" />
          Xuất CSV chi nhánh
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <Notice tone="info">{data.accountingNote}</Notice>

          {data.conflicts.length > 0 && (
            <Notice tone="error">
              <div className="space-y-1">
                <strong>Cảnh báo xung đột lịch / điều chuyển ({data.conflicts.length}):</strong>
                {data.conflicts.map((c, idx) => (
                  <p key={idx} className="text-caption">
                    • [{c.reference}] {c.message}
                  </p>
                ))}
              </div>
            </Notice>
          )}

          {/* System Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Doanh thu ròng (phạm vi)</Text>
              <p className="mt-1 text-title font-bold text-brand">
                {formatVnd(data.systemTotal.netRevenue)}
              </p>
              <Text className="text-micro text-muted">
                Thuê xe: {formatVnd(data.systemTotal.rentalRevenue)} · Giao nhận:{' '}
                {formatVnd(data.systemTotal.deliveryRevenue)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Tổng đơn thuê / Một chiều</Text>
              <p className="mt-1 text-title font-bold text-ink">
                {data.systemTotal.totalBookings} / {data.systemTotal.oneWayOutboundCount}
              </p>
              <Text className="text-micro text-muted">
                Hoàn tất: {data.systemTotal.completedBookings} · Giao tận nơi:{' '}
                {data.systemTotal.homeDeliveryCount}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Cọc tài sản đang giữ (Tách riêng)</Text>
              <p className="mt-1 text-title font-bold text-ink">
                {formatVnd(data.systemTotal.securityDepositHeld)}
              </p>
              <Text className="text-micro text-muted">
                Hoàn tiền: {formatVnd(data.systemTotal.refundedTotal)}
              </Text>
            </div>
            <div className="rounded-card border border-line bg-canvas p-4">
              <Text className="text-caption text-muted">Chi phí điều chuyển nội bộ</Text>
              <p className="mt-1 text-title font-bold text-ink">
                {formatVnd(data.systemTotal.transferCost)}
              </p>
              <Text className="text-micro text-muted">
                Xe đang điều chuyển: {data.systemFleet.inTransit} · Sẵn sàng:{' '}
                {data.systemFleet.readyForRent}
              </Text>
            </div>
          </div>

          {data.branches.length === 0 ? (
            <EmptyState
              icon="bar-chart"
              title="Chưa có dữ liệu báo cáo chi nhánh"
              description="Tạo chi nhánh và phân bổ đội xe để theo dõi hiệu quả kinh doanh theo từng địa bàn."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-canvas">
              <table className="w-full min-w-[900px] text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-3">Chi nhánh</th>
                    <th className="px-4 py-3">Đội xe (QL / Kho / Sẵn)</th>
                    <th className="px-4 py-3">Hiệu suất</th>
                    <th className="px-4 py-3">Đơn thuê (Tổng / 1C đi-đến)</th>
                    <th className="px-4 py-3">Doanh thu thuê + Giao + Phụ phí</th>
                    <th className="px-4 py-3">Chi phí ĐC</th>
                    <th className="px-4 py-3">Doanh thu ròng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.branches.map((b) => (
                    <tr key={b.branchId}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{b.name}</p>
                        <p className="text-caption text-muted">
                          {b.code} · {b.province}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {b.fleet.managedTotal} / {b.fleet.physicallyPresentAtBranch} /{' '}
                        <strong className="text-brand">{b.fleet.readyForRent}</strong>
                        {b.fleet.inTransit > 0 && (
                          <Badge tone="warning" className="ml-1.5">
                            {b.fleet.inTransit} ĐC
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">{b.utilizationRate}%</td>
                      <td className="px-4 py-3">
                        {b.metrics.totalBookings} ({b.metrics.oneWayOutboundCount} đi /{' '}
                        {b.metrics.oneWayInboundCount} đến)
                      </td>
                      <td className="px-4 py-3 text-caption">
                        Thuê: {formatVnd(b.metrics.rentalRevenue)}
                        <br />
                        Giao: {formatVnd(b.metrics.deliveryRevenue)} · Phụ phí:{' '}
                        {formatVnd(b.metrics.locationSurchargeRevenue)}
                      </td>
                      <td className="px-4 py-3">{formatVnd(b.metrics.transferCost)}</td>
                      <td className="px-4 py-3 font-semibold text-brand">
                        {formatVnd(b.metrics.netRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.warehouses.length > 0 && (
            <section className="space-y-3">
              <Heading as="h2" size="subtitle" className="font-semibold">
                Tồn kho vật lý theo từng kho xe
              </Heading>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.warehouses.map((w) => (
                  <div
                    key={w.warehouseId}
                    className="rounded-card border border-line bg-canvas p-4"
                  >
                    <div className="flex items-center justify-between">
                      <Badge tone="brand">{w.code}</Badge>
                      <Badge tone={w.occupancy.isOverCapacity ? 'danger' : 'muted'}>
                        {w.occupancy.occupancyRate}%
                      </Badge>
                    </div>
                    <p className="mt-2 font-semibold text-ink">{w.name}</p>
                    <p className="text-caption text-muted">
                      {w.branchName} · Hiện diện: {w.occupancy.physicalCount}/{w.occupancy.capacity}{' '}
                      (Sẵn sàng: {w.occupancy.readyCount})
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
