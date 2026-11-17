'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  canTransition,
  formatDate,
  formatMoney,
  type BookingStatus,
} from '@/lib/rental-rules'
import type { BookingView } from '@/lib/domain-types'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

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

export function BookingsPanel() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [items, setItems] = useState<BookingView[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [detail, setDetail] = useState<BookingView | null>(null)
  const [transition, setTransition] = useState<{ booking: BookingView; to: BookingStatus } | null>(
    null,
  )
  const [handoverNote, setHandoverNote] = useState('')
  const [extraFee, setExtraFee] = useState('')
  const [extraFeeNote, setExtraFeeNote] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [returnOdometer, setReturnOdometer] = useState('')
  const [returnCondition, setReturnCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      page: String(page),
      ...(status ? { status } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
    })
    api<{ items: BookingView[]; totalDocs: number; page: number; totalPages: number }>(
      `/dashboard/bookings?${sp.toString()}`,
    )
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
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
  }, [page, status, q, retry])

  async function confirmTransition() {
    if (!transition) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard/bookings', {
        method: 'PATCH',
        body: JSON.stringify({
          id: transition.booking.id,
          status: transition.to,
          ...(handoverNote.trim() ? { handoverNote: handoverNote.trim() } : {}),
          ...(extraFee.trim() ? { extraFee: Number(extraFee.trim()) } : {}),
          ...(extraFeeNote.trim() ? { extraFeeNote: extraFeeNote.trim() } : {}),
          ...(contractNumber.trim() ? { contractNumber: contractNumber.trim() } : {}),
          ...(returnOdometer.trim() ? { returnOdometer: Number(returnOdometer.trim()) } : {}),
          ...(returnCondition.trim() ? { returnCondition: returnCondition.trim() } : {}),
        }),
      })
      toast(
        `Đã chuyển đơn ${transition.booking.bookingKey} sang "${bookingStatusLabels[transition.to] ?? transition.to}".`,
      )
      setTransition(null)
      setDetail(null)
      setHandoverNote('')
      setExtraFee('')
      setExtraFeeNote('')
      setContractNumber('')
      setReturnOdometer('')
      setReturnCondition('')
      setRetry((r) => r + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Input
            id="booking-search"
            label="Tìm kiếm đơn thuê"
            placeholder="Mã đơn, tên khách, SĐT, mã xe..."
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Select
            id="booking-status-filter"
            label="Trạng thái đơn"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(bookingStatusLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/nori-api/dashboard/export?type=bookings"
            download
            className="inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
          >
            <Icon name="download" className="size-4" />
            Xuất CSV Đơn thuê
          </a>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Làm mới
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Không có đơn thuê phù hợp"
          description="Thử thay đổi bộ lọc trạng thái hoặc từ khóa tìm kiếm."
        />
      ) : (
        <div className="space-y-3">
          <Text className="text-caption text-muted">
            Hiển thị {items.length} / {totalDocs} đơn thuê
          </Text>
          {items.map((b) => {
            const legalActions = (Object.keys(actionLabels) as BookingStatus[]).filter((target) =>
              canTransition(b.status as BookingStatus, target, 'admin', b.startDate),
            )
            return (
              <article
                key={b.id}
                className="rounded-card border border-line bg-canvas p-5 transition-shadow hover:shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading as="h2" size="body" className="font-semibold">
                        {b.modelName} ({b.reference})
                      </Heading>
                      <StatusBadge status={b.status} />
                      {b.depositExpired && <Badge tone="danger">Quá hạn đặt cọc (&gt;24h)</Badge>}
                    </div>
                    <Text className="text-small text-muted">
                      Mã đơn: <strong className="text-ink">{b.bookingKey}</strong> · Khách:{' '}
                      <strong className="text-ink">{b.customerName}</strong>
                      {b.customerPhone ? ` (${b.customerPhone})` : ''}
                    </Text>
                    <Text className="text-small text-muted">
                      Thời gian: {formatDate(b.startDate)} ({b.pickupTime}) →{' '}
                      {formatDate(b.endDate)} ({b.returnTime}) · {b.totalDays} ngày
                    </Text>
                    {b.handoverNote && (
                      <Text className="text-caption text-brand">
                        Ghi chú bàn giao: {b.handoverNote}
                      </Text>
                    )}
                  </div>
                  <div className="text-right">
                    <Text className="text-subtitle font-bold text-ink">
                      {formatMoney(b.totalPrice)}
                    </Text>
                    <Text className="text-caption text-muted">
                      Cọc: {formatMoney(b.depositSnapshot)}
                      {b.extraFee ? ` · Phụ phí: ${formatMoney(b.extraFee)}` : ''}
                    </Text>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setDetail(b)}>
                    <Icon name="eye" className="size-4" />
                    Xem chi tiết & lịch sử
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {legalActions.map((target) => (
                      <Button
                        key={target}
                        size="sm"
                        variant={
                          target === 'REJECTED' || target === 'CANCELLED' ? 'danger' : 'secondary'
                        }
                        onClick={() => {
                          setActionError('')
                          setHandoverNote(b.handoverNote ?? '')
                          setExtraFee(b.extraFee ? String(b.extraFee) : '')
                          setExtraFeeNote(b.extraFeeNote ?? '')
                          setContractNumber(b.contractNumber ?? '')
                          setReturnOdometer(
                            b.returnOdometer != null ? String(b.returnOdometer) : '',
                          )
                          setReturnCondition(b.returnCondition ?? '')
                          setTransition({ booking: b, to: target })
                        }}
                      >
                        {actionLabels[target]}
                      </Button>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Text className="text-caption text-muted">
                Trang {page} / {totalPages}
              </Text>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Chi tiết đơn thuê ${detail?.bookingKey ?? ''}`}
        wide
      >
        {detail && (
          <div className="space-y-5 text-small">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-control bg-subtle p-4">
                <Text className="mb-2 font-semibold text-ink">Thông tin khách hàng</Text>
                <p>Họ tên: {detail.customerName}</p>
                <p>Email: {detail.customerEmail || 'Chưa cập nhật'}</p>
                <p>SĐT: {detail.customerPhone || 'Chưa cập nhật'}</p>
                <p>Số GPLX/CCCD: {detail.driverLicenseNumber || 'Chưa cập nhật'}</p>
                {detail.note && <p className="mt-2 text-muted">Ghi chú khách: {detail.note}</p>}
              </div>
              <div className="rounded-control bg-subtle p-4">
                <Text className="mb-2 font-semibold text-ink">Phương tiện & Lịch trình</Text>
                <p>
                  Xe: {detail.modelName} ({detail.reference})
                </p>
                <p>
                  Nhận xe: {formatDate(detail.startDate)} lúc {detail.pickupTime}
                </p>
                <p>
                  Trả xe: {formatDate(detail.endDate)} lúc {detail.returnTime}
                </p>
                <p>Địa điểm: {detail.pickupLocation || 'Tại điểm giao nhận NORI'}</p>
                <p>Giao tận nơi: {detail.deliveryRequested ? 'Có' : 'Không'}</p>
              </div>
            </div>

            <div className="rounded-control border border-line p-4">
              <Text className="mb-2 font-semibold text-ink">Chi tiết chi phí & Đặt cọc</Text>
              <div className="grid gap-2 sm:grid-cols-3">
                <p>Tiền thuê cơ bản: {formatMoney(detail.baseRentPrice)}</p>
                <p>Phụ phí cuối tuần/lễ: {formatMoney(detail.weekendSurchargeTotal)}</p>
                <p>Phí giao nhận: {formatMoney(detail.deliveryFeeSnapshot)}</p>
                <p>Dịch vụ bổ sung: {formatMoney(detail.addonFeeTotal)}</p>
                <p>Chiết khấu: {formatMoney(detail.discountAmount)}</p>
                <p>Phụ phí phát sinh: {formatMoney(detail.extraFee)}</p>
                <p className="font-semibold text-ink">
                  Tổng dự kiến: {formatMoney(detail.totalPrice)}
                </p>
                <p>Tiền đặt cọc đảm bảo: {formatMoney(detail.depositSnapshot)}</p>
                <p>Còn lại dự kiến: {formatMoney(detail.remainingAmount)}</p>
              </div>
              {detail.extraFeeNote && (
                <Text className="mt-2 text-caption text-muted">
                  Lý do phụ phí: {detail.extraFeeNote}
                </Text>
              )}
            </div>

            <div>
              <Text className="mb-2 font-semibold text-ink">Lịch sử trạng thái</Text>
              {detail.statusHistory && detail.statusHistory.length > 0 ? (
                <ul className="space-y-2 border-l-2 border-brand/30 pl-4">
                  {detail.statusHistory.map((h, idx) => (
                    <li key={idx} className="text-caption">
                      <span className="font-semibold text-ink">
                        {bookingStatusLabels[h.status] ?? h.status}
                      </span>{' '}
                      · <span className="text-muted">{formatDate(h.changedAt)}</span>
                      {h.changedBy ? ` · ${h.changedBy}` : ''}
                      {h.note ? ` — ${h.note}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <Text className="text-caption text-muted">
                  Chưa có bản ghi lịch sử chuyển trạng thái chi tiết.
                </Text>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Transition Confirm Dialog */}
      <Dialog
        open={Boolean(transition)}
        onClose={() => setTransition(null)}
        title={
          transition ? actionLabels[transition.to] || 'Cập nhật đơn thuê' : 'Cập nhật đơn thuê'
        }
      >
        {transition && (
          <div className="space-y-4">
            {actionError && <Notice tone="error">{actionError}</Notice>}
            <Text className="text-small">
              Xác nhận chuyển đơn <strong>{transition.booking.bookingKey}</strong> sang trạng thái{' '}
              <strong>{bookingStatusLabels[transition.to] ?? transition.to}</strong>?
            </Text>
            <Textarea
              id="dashboard-handover-note"
              label="Ghi chú giao nhận / xử lý nội bộ"
              rows={3}
              placeholder="Ví dụ: Đã đối chiếu GPLX, bàn giao đủ giấy tờ, kiểm tra xe khi trả..."
              value={handoverNote}
              onChange={(e) => setHandoverNote(e.target.value)}
            />
            {['CONFIRMED', 'READY_FOR_HANDOVER', 'ONGOING'].includes(transition.to) && (
              <Input
                id="booking-contract-no"
                label="Số hợp đồng / biên bản bàn giao"
                placeholder="HD-NORI-2026-..."
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            )}
            {['INSPECTING', 'COMPLETED'].includes(transition.to) && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    id="booking-extra-fee"
                    label="Phụ phí phát sinh (VNĐ)"
                    type="number"
                    min={0}
                    value={extraFee}
                    onChange={(e) => setExtraFee(e.target.value)}
                  />
                  <Input
                    id="booking-extra-fee-note"
                    label="Lý do phụ phí"
                    placeholder="Vượt km, trả trễ, vệ sinh..."
                    value={extraFeeNote}
                    onChange={(e) => setExtraFeeNote(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    id="booking-return-odo"
                    label="ODO lúc nhận lại xe (km)"
                    type="number"
                    min={0}
                    value={returnOdometer}
                    onChange={(e) => setReturnOdometer(e.target.value)}
                  />
                  <Input
                    id="booking-return-cond"
                    label="Tình trạng xe lúc nhận lại"
                    placeholder="Bình thường, trầy nhẹ..."
                    value={returnCondition}
                    onChange={(e) => setReturnCondition(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setTransition(null)}>
                Đóng
              </Button>
              <Button
                variant={
                  transition.to === 'REJECTED' || transition.to === 'CANCELLED'
                    ? 'danger'
                    : 'primary'
                }
                loading={busy}
                onClick={() => void confirmTransition()}
              >
                Xác nhận thao tác
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
