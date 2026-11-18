'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/client-api'
import {
  CONSULTATION_STATUSES,
  bookingStatusLabels,
  canTransition,
  consultationStatusLabels,
  formatDate,
  formatMoney,
  formatVnd,
  type BookingStatus,
  type ConsultationStatus,
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

const consultFilterOptions = [
  { value: '', label: 'Tất cả lịch tư vấn' },
  { value: 'PENDING_CONTACT', label: 'Đơn chờ liên hệ' },
  { value: 'DUE_TODAY', label: 'Đơn cần xử lý hôm nay' },
  { value: 'OVERDUE', label: 'Đơn quá hạn liên hệ' },
  { value: 'URGENT', label: 'Đơn thuê gấp ưu tiên' },
  { value: 'CONSULTED', label: 'Đơn đã tư vấn' },
]

export function BookingsPanel() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [items, setItems] = useState<BookingView[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [consultFilter, setConsultFilter] = useState(searchParams.get('consultFilter') || '')
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

  // Consultation staff form inside Detail modal
  const [consultStatus, setConsultStatus] = useState<ConsultationStatus>('PENDING_CONTACT')
  const [consultOutcome, setConsultOutcome] = useState('')
  const [consultCallNote, setConsultCallNote] = useState('')
  const [consultCallbackAt, setConsultCallbackAt] = useState('')
  const [consultInternalNote, setConsultInternalNote] = useState('')
  const [consultSaving, setConsultSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      page: String(page),
      ...(status ? { status } : {}),
      ...(consultFilter ? { consultFilter } : {}),
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
        if (detail) {
          const refreshed = res.items.find((x) => x.id === detail.id)
          if (refreshed) {
            setDetail(refreshed)
            if (refreshed.consultation) {
              setConsultStatus(refreshed.consultation.status as ConsultationStatus)
              setConsultCallbackAt(refreshed.consultation.callbackScheduledAt ?? '')
              setConsultInternalNote(refreshed.consultation.internalNote ?? '')
            }
          }
        }
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
  }, [page, status, consultFilter, q, retry])

  function openDetailModal(b: BookingView) {
    setDetail(b)
    if (b.consultation) {
      setConsultStatus(b.consultation.status as ConsultationStatus)
      setConsultCallbackAt(b.consultation.callbackScheduledAt ?? '')
      setConsultInternalNote(b.consultation.internalNote ?? '')
      setConsultOutcome('')
      setConsultCallNote('')
    }
  }

  async function saveConsultationUpdate(extra?: {
    claim?: boolean
    overrideStatus?: ConsultationStatus
  }) {
    if (!detail?.consultation) return
    setConsultSaving(true)
    try {
      await api('/dashboard/consultations', {
        method: 'PATCH',
        body: JSON.stringify({
          id: detail.consultation.id,
          ...(extra?.claim ? { claim: true } : {}),
          status: extra?.overrideStatus ?? consultStatus,
          ...(consultOutcome.trim() ? { outcome: consultOutcome.trim() } : {}),
          ...(consultCallNote.trim() ? { callNote: consultCallNote.trim() } : {}),
          callbackScheduledAt: consultCallbackAt.trim(),
          internalNote: consultInternalNote.trim(),
        }),
      })
      toast('Đã lưu cập nhật theo dõi tư vấn khách hàng.')
      setConsultOutcome('')
      setConsultCallNote('')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setConsultSaving(false)
    }
  }

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
          ...(typeof transition.booking.revision === 'number'
            ? { expectedRevision: transition.booking.revision }
            : {}),
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
        <div className="grid flex-1 gap-3 sm:grid-cols-3 lg:max-w-3xl">
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
          <Select
            id="booking-consult-filter"
            label="Bộ lọc tư vấn khách hàng"
            value={consultFilter}
            onChange={(e) => {
              setPage(1)
              setConsultFilter(e.target.value)
            }}
          >
            {consultFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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
          description="Thử thay đổi bộ lọc trạng thái, bộ lọc tư vấn hoặc từ khóa tìm kiếm."
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
                      {b.isUrgentApproval &&
                        !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(b.status) && (
                          <Badge tone="warning">Đơn thuê gấp</Badge>
                        )}
                      {b.consultation && (
                        <Badge
                          tone={
                            ['CONSULTED', 'COMPLETED'].includes(b.consultation.status)
                              ? 'brand'
                              : 'muted'
                          }
                        >
                          Tư vấn:{' '}
                          {consultationStatusLabels[b.consultation.status as ConsultationStatus] ??
                            b.consultation.status}
                        </Badge>
                      )}
                      {b.modificationHistory && b.modificationHistory.length > 0 && (
                        <Badge tone="muted">Đã chỉnh sửa ({b.modificationHistory.length})</Badge>
                      )}
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
                    {b.consultation && (
                      <Text className="text-caption text-muted">
                        Lịch liên hệ dự kiến:{' '}
                        <strong className="text-ink">
                          {formatDate(b.consultation.expectedContactDate)}
                        </strong>
                        {b.consultation.assignedStaffName
                          ? ` · Phụ trách: ${b.consultation.assignedStaffName}`
                          : ' · Chưa phân công nhân viên'}
                      </Text>
                    )}
                    {b.handoverNote && (
                      <Text className="text-caption text-brand">
                        Ghi chú bàn giao: {b.handoverNote}
                      </Text>
                    )}
                  </div>
                  <div className="text-right">
                    <Text className="text-subtitle font-bold text-ink">
                      {formatVnd(b.totalPrice)}
                    </Text>
                    <Text className="text-caption text-muted">
                      Cọc: {formatMoney(b.depositSnapshot)}
                      {b.extraFee ? ` · Phụ phí: ${formatMoney(b.extraFee)}` : ''}
                    </Text>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Button variant="ghost" size="sm" onClick={() => openDetailModal(b)}>
                    <Icon name="eye" className="size-4" />
                    Xem chi tiết, Tư vấn & Lịch sử
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

      {/* Detail & Consultation Modal */}
      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Chi tiết đơn thuê ${detail?.bookingKey ?? ''}`}
        wide
      >
        {detail && (
          <div className="space-y-6 text-small">
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
                <p>Điểm nhận: {detail.pickupLocation || 'Tại điểm giao nhận NORI'}</p>
                <p>
                  Điểm trả:{' '}
                  {detail.returnLocation || detail.pickupLocation || 'Tại điểm giao nhận NORI'}
                </p>
                <p>Giao tận nơi: {detail.deliveryRequested ? 'Có' : 'Không'}</p>
              </div>
            </div>

            <div className="rounded-control border border-line p-4">
              <Text className="mb-2 font-semibold text-ink">Chi tiết chi phí & Đặt cọc</Text>
              <div className="grid gap-2 sm:grid-cols-3">
                <p>Tiền thuê cơ bản: {formatVnd(detail.baseRentPrice)}</p>
                <p>Phụ phí cuối tuần/lễ: {formatVnd(detail.weekendSurchargeTotal)}</p>
                <p>Phí giao nhận: {formatVnd(detail.deliveryFeeSnapshot)}</p>
                <p>Dịch vụ bổ sung: {formatVnd(detail.addonFeeTotal)}</p>
                <p>Chiết khấu dài ngày: {formatVnd(detail.discountAmount)}</p>
                {(detail.promoDiscountAmount ?? 0) > 0 && (
                  <p className="text-brand">
                    Mã KM ({detail.promoCode}): -{formatVnd(detail.promoDiscountAmount)}
                  </p>
                )}
                <p>Phụ phí phát sinh: {formatVnd(detail.extraFee ?? 0)}</p>
                <p className="font-semibold text-ink">
                  Tổng tiền thuê dự kiến: {formatVnd(detail.totalPrice)}
                </p>
                <p>Tiền đặt cọc đảm bảo (tách riêng): {formatMoney(detail.depositSnapshot)}</p>
                <p>Tiền thuê còn lại dự kiến: {formatVnd(detail.remainingAmount)}</p>
              </div>
              {detail.extraFeeNote && (
                <Text className="mt-2 text-caption text-muted">
                  Lý do phụ phí: {detail.extraFeeNote}
                </Text>
              )}
            </div>

            {/* Section 10: Customer Consultation Tracking Panel */}
            <div className="rounded-card border border-brand/30 bg-soft/60 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Heading as="h3" size="body" className="font-semibold text-ink">
                    Theo dõi nhân viên liên hệ tư vấn khách hàng
                  </Heading>
                  <Text className="text-micro text-muted">
                    Quản lý độc lập quá trình gọi tư vấn sau khi duyệt đơn (không làm thay đổi trạng
                    thái thanh toán hay hợp đồng).
                  </Text>
                </div>
                {detail.consultation && (
                  <div className="flex items-center gap-2">
                    {detail.consultation.isUrgent && <Badge tone="warning">Đơn thuê gấp</Badge>}
                    <Badge tone="brand">
                      {consultationStatusLabels[detail.consultation.status as ConsultationStatus] ??
                        detail.consultation.status}
                    </Badge>
                  </div>
                )}
              </div>

              {detail.consultation ? (
                <>
                  <div className="grid gap-3 rounded-control bg-canvas p-3.5 text-caption sm:grid-cols-3">
                    <div>
                      <span className="text-muted">Thời điểm duyệt đơn:</span>
                      <p className="font-medium text-ink">
                        {formatDate(detail.consultation.approvedAt)}
                        {detail.consultation.approvedBy
                          ? ` (${detail.consultation.approvedBy})`
                          : ''}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Lịch liên hệ dự kiến:</span>
                      <p className="font-semibold text-brand">
                        {formatDate(detail.consultation.expectedContactDate)}
                        {detail.consultation.workingHoursWindow
                          ? ` · ${detail.consultation.workingHoursWindow}`
                          : ''}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Nhân viên phụ trách:</span>
                      <p className="font-medium text-ink">
                        {detail.consultation.assignedStaffName || 'Chưa tiếp nhận'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select
                      id="consult-status"
                      label="Trạng thái tư vấn"
                      value={consultStatus}
                      onChange={(e) => setConsultStatus(e.target.value as ConsultationStatus)}
                    >
                      {CONSULTATION_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {consultationStatusLabels[st]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      id="consult-outcome"
                      label="Kết quả cuộc gọi mới"
                      placeholder="Đã nghe máy, hẹn gửi GPLX..."
                      value={consultOutcome}
                      onChange={(e) => setConsultOutcome(e.target.value)}
                    />
                    <Input
                      id="consult-callback"
                      label="Hẹn liên hệ lại (nếu có)"
                      type="datetime-local"
                      value={consultCallbackAt}
                      onChange={(e) => setConsultCallbackAt(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Textarea
                      id="consult-call-note"
                      label="Nội dung cuộc gọi tư vấn"
                      rows={2}
                      placeholder="Ghi nhận trao đổi với khách hàng..."
                      value={consultCallNote}
                      onChange={(e) => setConsultCallNote(e.target.value)}
                    />
                    <Textarea
                      id="consult-internal-note"
                      label="Ghi chú nội bộ vận hành"
                      rows={2}
                      placeholder="Lưu ý chuẩn bị xe, phụ kiện..."
                      value={consultInternalNote}
                      onChange={(e) => setConsultInternalNote(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {!detail.consultation.assignedStaffName && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={consultSaving}
                          onClick={() => void saveConsultationUpdate({ claim: true })}
                        >
                          Tiếp nhận yêu cầu
                        </Button>
                      )}
                      {detail.consultation.status !== 'COMPLETED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={consultSaving}
                          onClick={() =>
                            void saveConsultationUpdate({ overrideStatus: 'COMPLETED' })
                          }
                        >
                          Đánh dấu hoàn thành tư vấn
                        </Button>
                      )}
                    </div>
                    <Button
                      size="sm"
                      loading={consultSaving}
                      onClick={() => void saveConsultationUpdate()}
                    >
                      Lưu cập nhật tư vấn
                    </Button>
                  </div>

                  {detail.consultation.contactLogs.length > 0 && (
                    <div className="rounded-control bg-canvas p-3">
                      <Text className="mb-2 text-caption font-semibold text-ink">
                        Lịch sử cuộc gọi & Liên hệ ({detail.consultation.contactLogs.length})
                      </Text>
                      <ul className="space-y-1.5 border-l-2 border-brand/30 pl-3 text-caption">
                        {detail.consultation.contactLogs.map((log, idx) => (
                          <li key={idx}>
                            <strong className="text-ink">{log.outcome}</strong> ·{' '}
                            <span className="text-muted">{formatDate(log.contactedAt)}</span>
                            {log.staffName ? ` · ${log.staffName}` : ''}
                            {log.note ? ` — ${log.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <Text className="text-caption text-muted">
                  Yêu cầu tư vấn sẽ được hệ thống khởi tạo tự động ngay sau khi Admin duyệt đơn thuê
                  (trạng thái Đã xác nhận).
                </Text>
              )}
            </div>

            {/* Section 6: Modification Audit History */}
            {detail.modificationHistory && detail.modificationHistory.length > 0 && (
              <div>
                <Text className="mb-2 font-semibold text-ink">
                  Lịch sử khách hàng chỉnh sửa đơn ({detail.modificationHistory.length})
                </Text>
                <div className="space-y-2.5">
                  {detail.modificationHistory.map((mod, idx) => (
                    <div key={idx} className="rounded-control border border-line p-3 text-caption">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <strong className="text-ink">{mod.modifiedBy || 'Khách hàng'}</strong> ·{' '}
                          {formatDate(mod.modifiedAt)} (Trạng thái: {mod.statusAtChange})
                        </span>
                        <span>
                          Báo giá: {formatMoney(mod.previousTotalPrice)} →{' '}
                          <strong className="text-brand">{formatMoney(mod.newTotalPrice)}</strong> ·
                          Cọc: {formatMoney(mod.previousDeposit)} → {formatMoney(mod.newDeposit)}
                        </span>
                      </div>
                      {mod.reason && (
                        <p className="mt-1 text-muted">Lý do thay đổi: {mod.reason}</p>
                      )}
                      <ul className="mt-1.5 space-y-0.5 text-muted">
                        {mod.changes.map((c, cIdx) => (
                          <li key={cIdx}>
                            • <strong className="text-ink">{c.label}:</strong> {c.before} →{' '}
                            <span className="text-ink">{c.after}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            {transition.to === 'CONFIRMED' && (
              <div className="space-y-2.5">
                {transition.booking.isUrgentApproval && (
                  <Notice tone="info">
                    <strong>Cảnh báo đơn thuê gấp cần xử lý ưu tiên:</strong> Ngày nhận xe (
                    {formatDate(transition.booking.startDate)} lúc {transition.booking.pickupTime})
                    diễn ra trước hoặc sát ngày làm việc liên hệ dự kiến (
                    {formatDate(transition.booking.expectedContactDate)}). Đơn sẽ được gắn nhãn{' '}
                    <strong>Đơn thuê gấp</strong> để nhân viên chủ động liên hệ sớm.
                  </Notice>
                )}
                <div className="rounded-control bg-subtle p-3 text-caption text-muted">
                  Sau khi duyệt: Hệ thống tự động gửi thông báo xác nhận cho khách hàng và tạo lịch
                  tư vấn vào ngày làm việc{' '}
                  <strong className="text-ink">
                    {formatDate(transition.booking.expectedContactDate)}
                  </strong>{' '}
                  ({transition.booking.workingHoursSnapshot || 'Giờ hành chính'}).
                </div>
              </div>
            )}

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
