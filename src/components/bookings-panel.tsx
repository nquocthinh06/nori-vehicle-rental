'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { BookingView, Quote } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import {
  BOOKING_CONFIRMED_LOCK_MESSAGE,
  RENTAL_ADDONS,
  addDays,
  bookingStatusLabels,
  businessToday,
  formatDate,
  formatMoney,
  parseAddonKeys,
  validateRentalDates,
  type AddonDefinition,
} from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  Heading,
  IconButton,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  Text,
  Textarea,
} from './ui'
import { Dialog } from './ui/dialog'
import { Icon } from './ui/icon'

type BookingList = { docs: BookingView[]; page: number; totalPages: number; totalDocs: number }

const TIME_OPTIONS = [
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:30',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
]

export function BookingsPanel() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      }
    >
      <BookingsPanelInner />
    </Suspense>
  )
}

function BookingsPanelInner() {
  const { user, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const queryDetailId = searchParams.get('detail') || ''
  const queryEditId = searchParams.get('edit') || ''

  const [data, setData] = useState<BookingList | null>(null)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [success, setSuccess] = useState('')
  const [urlLockNotice, setUrlLockNotice] = useState('')

  // Cancel state
  const [cancel, setCancel] = useState<BookingView | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Detail modal state
  const [detailBooking, setDetailBooking] = useState<BookingView | null>(null)

  // Edit modal state
  const [editingBooking, setEditingBooking] = useState<BookingView | null>(null)
  const [editLockedMessage, setEditLockedMessage] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editPickupTime, setEditPickupTime] = useState('08:00')
  const [editReturnTime, setEditReturnTime] = useState('20:00')
  const [editDeliveryRequested, setEditDeliveryRequested] = useState(false)
  const [editPickupLocation, setEditPickupLocation] = useState('')
  const [editReturnLocation, setEditReturnLocation] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddons, setEditAddons] = useState<AddonDefinition['id'][]>([])
  const [editPromoCode, setEditPromoCode] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editReason, setEditReason] = useState('')

  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [quoteChecking, setQuoteChecking] = useState(false)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    api<BookingList>(
      `/bookings?${new URLSearchParams({ page: String(page), ...(status ? { status } : {}) })}`,
    )
      .then((result) => {
        if (active) setData(result)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [user?.id, status, page, retry])

  function populateEditForm(b: BookingView) {
    setEditStartDate(b.startDate)
    setEditEndDate(b.endDate)
    setEditPickupTime(b.pickupTime || '08:00')
    setEditReturnTime(b.returnTime || '20:00')
    setEditDeliveryRequested(Boolean(b.deliveryRequested))
    setEditPickupLocation(b.pickupLocation ?? '')
    setEditReturnLocation(b.returnLocation ?? b.pickupLocation ?? '')
    setEditPhone(b.customerPhone ?? user?.phone ?? '')
    setEditEmail(b.customerEmail ?? user?.email ?? '')
    setEditAddons(parseAddonKeys(b.addonServices))
    setEditPromoCode(b.promoCode ?? '')
    setEditNote(b.note ?? '')
    setEditReason('')
    setPreviewQuote(null)
    setEditError('')
    setEditLockedMessage('')
  }

  async function openEditModal(booking: BookingView) {
    setUrlLockNotice('')
    if (booking.status !== 'PENDING' || booking.canModify === false) {
      setUrlLockNotice(booking.modifyLockReason || BOOKING_CONFIRMED_LOCK_MESSAGE)
      return
    }
    populateEditForm(booking)
    setEditingBooking(booking)
    // Verify latest live state from server immediately on open
    try {
      const fresh = await api<BookingView>(`/bookings?id=${encodeURIComponent(booking.id)}`)
      if (fresh.status !== 'PENDING' || fresh.canModify === false) {
        setEditingBooking(fresh)
        setEditLockedMessage(fresh.modifyLockReason || BOOKING_CONFIRMED_LOCK_MESSAGE)
        setRetry((r) => r + 1)
      } else {
        setEditingBooking(fresh)
        populateEditForm(fresh)
      }
    } catch {
      // Keep local booking snapshot if network hiccups
    }
  }

  // Handle deep links (?detail=... or ?edit=...) safely with backend permission enforcement
  useEffect(() => {
    if (!user || !data) return
    if (queryDetailId) {
      const match = data.docs.find((b) => b.id === queryDetailId)
      if (match) {
        setDetailBooking(match)
      } else {
        void api<BookingView>(`/bookings?id=${encodeURIComponent(queryDetailId)}`)
          .then((b) => setDetailBooking(b))
          .catch(() => {})
      }
    } else if (queryEditId) {
      void api<BookingView>(`/bookings?id=${encodeURIComponent(queryEditId)}`)
        .then((fresh) => {
          if (fresh.status !== 'PENDING' || fresh.canModify === false) {
            setUrlLockNotice(fresh.modifyLockReason || BOOKING_CONFIRMED_LOCK_MESSAGE)
          } else {
            populateEditForm(fresh)
            setEditingBooking(fresh)
          }
        })
        .catch((e) => setUrlLockNotice((e as Error).message))
    }
  }, [user?.id, queryDetailId, queryEditId, Boolean(data)])

  const hasFormChanges = useMemo(() => {
    if (!editingBooking) return false
    const origAddons = parseAddonKeys(editingBooking.addonServices).sort().join(',')
    const nextAddons = [...editAddons].sort().join(',')
    return (
      editStartDate !== editingBooking.startDate ||
      editEndDate !== editingBooking.endDate ||
      editPickupTime !== (editingBooking.pickupTime || '08:00') ||
      editReturnTime !== (editingBooking.returnTime || '20:00') ||
      editDeliveryRequested !== Boolean(editingBooking.deliveryRequested) ||
      editPickupLocation.trim() !== (editingBooking.pickupLocation ?? '').trim() ||
      editReturnLocation.trim() !==
        (editingBooking.returnLocation ?? editingBooking.pickupLocation ?? '').trim() ||
      editPhone.trim() !== (editingBooking.customerPhone ?? '').trim() ||
      editEmail.trim().toLowerCase() !==
        (editingBooking.customerEmail ?? user?.email ?? '').trim().toLowerCase() ||
      nextAddons !== origAddons ||
      editPromoCode.trim().toUpperCase() !==
        (editingBooking.promoCode ?? '').trim().toUpperCase() ||
      editNote.trim() !== (editingBooking.note ?? '').trim()
    )
  }, [
    editingBooking,
    editStartDate,
    editEndDate,
    editPickupTime,
    editReturnTime,
    editDeliveryRequested,
    editPickupLocation,
    editReturnLocation,
    editPhone,
    editEmail,
    editAddons,
    editPromoCode,
    editNote,
    user?.email,
  ])

  async function checkModifiedQuote() {
    if (!editingBooking || !editingBooking.vehicleId) return
    const dateCheck = validateRentalDates(editStartDate, editEndDate)
    if (dateCheck.error) {
      setEditError(dateCheck.error)
      setPreviewQuote(null)
      return
    }
    setQuoteChecking(true)
    setEditError('')
    try {
      const sp = new URLSearchParams({
        vehicle: editingBooking.vehicleId,
        startDate: editStartDate,
        endDate: editEndDate,
        excludeBookingId: editingBooking.id,
      })
      if (editDeliveryRequested) sp.set('delivery', '1')
      if (editAddons.length > 0) sp.set('addons', editAddons.join(','))
      if (editPromoCode.trim()) sp.set('promoCode', editPromoCode.trim().toUpperCase())
      const quote = await api<Quote>(`/availability?${sp.toString()}`)
      setPreviewQuote(quote)
      if (!quote.available) {
        setEditError(
          'Xe đã có đơn đặt khác hoặc lịch bảo trì trong khoảng ngày mới. Vui lòng chọn ngày khác.',
        )
      } else if (quote.promoError) {
        setEditError(quote.promoError)
      }
    } catch (err) {
      setEditError((err as Error).message)
      setPreviewQuote(null)
    } finally {
      setQuoteChecking(false)
    }
  }

  // Automatically recalculate quote whenever pricing/schedule inputs change while modal is open
  useEffect(() => {
    if (!editingBooking || editLockedMessage || !editingBooking.vehicleId) return
    const dateCheck = validateRentalDates(editStartDate, editEndDate)
    if (dateCheck.error) {
      setPreviewQuote(null)
      return
    }
    const timer = setTimeout(() => {
      void checkModifiedQuote()
    }, 220)
    return () => clearTimeout(timer)
  }, [
    editingBooking?.id,
    editLockedMessage,
    editStartDate,
    editEndDate,
    editDeliveryRequested,
    editAddons.join(','),
    editPromoCode,
  ])

  async function submitModification(e: React.FormEvent) {
    e.preventDefault()
    if (!editingBooking || editLockedMessage) return
    if (!hasFormChanges) {
      setEditError('Thông tin thuê chưa có thay đổi nào so với đơn hiện tại.')
      return
    }
    const dateCheck = validateRentalDates(editStartDate, editEndDate)
    if (dateCheck.error) {
      setEditError(dateCheck.error)
      return
    }
    if (previewQuote && !previewQuote.available) {
      setEditError('Khoảng thời gian mới không khả dụng. Vui lòng chọn ngày khác.')
      return
    }

    setSavingEdit(true)
    setEditError('')
    try {
      const updated = await api<BookingView>('/bookings', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingBooking.id,
          expectedRevision: editingBooking.revision ?? 1,
          startDate: editStartDate,
          endDate: editEndDate,
          pickupTime: editPickupTime,
          returnTime: editReturnTime,
          deliveryRequested: editDeliveryRequested,
          pickupLocation: editPickupLocation.trim(),
          returnLocation: editReturnLocation.trim(),
          customerPhone: editPhone.trim(),
          customerEmail: editEmail.trim(),
          addonServices: editAddons,
          promoCode: editPromoCode.trim().toUpperCase(),
          note: editNote.trim(),
          ...(editReason.trim() ? { reason: editReason.trim() } : {}),
        }),
      })
      setEditingBooking(null)
      setSuccess(
        `Đã cập nhật thông tin đơn thuê ${updated.bookingKey.slice(0, 11).toUpperCase()}. Đơn vẫn đang ở trạng thái Chờ xác nhận.`,
      )
      setRetry((r) => r + 1)
    } catch (err) {
      const msg = (err as Error).message
      // Refresh latest booking state in case Admin concurrently approved or locked the booking
      try {
        const latest = await api<BookingView>(
          `/bookings?id=${encodeURIComponent(editingBooking.id)}`,
        )
        setEditingBooking(latest)
        if (latest.status !== 'PENDING' || latest.canModify === false) {
          setEditLockedMessage(latest.modifyLockReason || msg || BOOKING_CONFIRMED_LOCK_MESSAGE)
          setRetry((r) => r + 1)
          return
        }
      } catch {
        // ignore refresh error
      }
      setEditError(msg)
    } finally {
      setSavingEdit(false)
    }
  }

  async function confirmCancel() {
    if (!cancel) return
    setBusy(true)
    setCancelError('')
    try {
      await api('/bookings', { method: 'PATCH', body: JSON.stringify({ id: cancel.id }) })
      setCancel(null)
      setSuccess('Đã hủy đơn thuê và giải phóng lịch xe.')
      setRetry(retry + 1)
    } catch (e) {
      setCancelError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) return <Skeleton className="h-64" />
  if (!user)
    return (
      <EmptyState
        icon="calendar"
        title="Các hành trình của bạn ở đây"
        description="Đăng nhập để xem lịch sử và quản lý các đơn thuê của riêng bạn."
      >
        <ButtonLink href="/login?returnTo=%2Fmy-bookings">
          Đăng nhập để xem đơn <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </EmptyState>
    )

  const priceDelta =
    editingBooking && previewQuote ? previewQuote.estimatedTotal - editingBooking.totalPrice : 0
  const depositDelta =
    editingBooking && previewQuote ? previewQuote.depositAmount - editingBooking.depositSnapshot : 0

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <Text className="text-small text-muted">
          {data ? `${data.totalDocs} đơn thuê` : 'Đang tải đơn thuê…'}
        </Text>
        <Select
          id="booking-status"
          label="Trạng thái đơn"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
            setSuccess('')
          }}
          wrapperClassName="w-full sm:w-auto"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ xác nhận</option>
          <option value="DEPOSIT_PENDING">Chờ đặt cọc</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="READY_FOR_HANDOVER">Chờ giao xe</option>
          <option value="ONGOING">Đang thuê</option>
          <option value="INSPECTING">Chờ kiểm tra & quyết toán</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
          <option value="REJECTED">Đã từ chối</option>
        </Select>
      </div>

      {urlLockNotice && (
        <Notice tone="info" className="mb-5">
          {urlLockNotice}{' '}
          <NoriLink href="/support#contact" className="font-semibold text-brand underline">
            Liên hệ hỗ trợ NORI
          </NoriLink>
        </Notice>
      )}

      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : error ? (
        <div>
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" className="mt-4" onClick={() => setRetry(retry + 1)}>
            Tải lại đơn thuê
          </Button>
        </div>
      ) : data?.docs.length ? (
        <div className="space-y-5">
          {data.docs.map((booking) => {
            const canEdit = booking.status === 'PENDING' && booking.canModify !== false
            const canCancel = ['PENDING', 'DEPOSIT_PENDING'].includes(booking.status)
            return (
              <article
                key={booking.id}
                data-booking-key={booking.bookingKey}
                className="rounded-card border border-line bg-canvas p-5 md:p-7"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Text className="mb-2 text-micro font-medium uppercase tracking-widest text-muted">
                      {booking.bookingKey.slice(0, 11).toUpperCase()}
                    </Text>
                    <Heading as="h2" size="subtitle">
                      {booking.modelName}
                    </Heading>
                    <Text className="mt-1 text-caption text-muted">
                      Xe {booking.reference}
                      {booking.pickupLocation ? ` · ${booking.pickupLocation}` : ''}
                    </Text>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>

                <div className="mt-5 grid gap-4 rounded-control bg-subtle p-4 sm:grid-cols-4">
                  <div>
                    <Text className="mb-1 text-caption text-muted">Nhận xe</Text>
                    <Text className="text-small font-medium">
                      {formatDate(booking.startDate)} · {booking.pickupTime}
                    </Text>
                  </div>
                  <div>
                    <Text className="mb-1 text-caption text-muted">
                      Trả xe · {booking.totalDays} ngày
                    </Text>
                    <Text className="text-small font-medium">
                      {formatDate(booking.endDate)} · {booking.returnTime}
                    </Text>
                  </div>
                  <div>
                    <Text className="mb-1 text-caption text-muted">Tổng tiền thuê dự kiến</Text>
                    <Text className="text-small font-semibold text-brand">
                      {formatMoney(booking.totalPrice)}
                    </Text>
                  </div>
                  <div>
                    <Text className="mb-1 text-caption text-muted">Đặt cọc tách riêng</Text>
                    <Text className="text-small font-medium">
                      {booking.depositSnapshot > 0
                        ? formatMoney(booking.depositSnapshot)
                        : 'Theo xác nhận'}
                    </Text>
                  </div>
                </div>

                {booking.status === 'CONFIRMED' && booking.expectedContactDate && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-soft px-3.5 py-2.5 text-caption">
                    <span className="text-ink">
                      Nhân viên NORI dự kiến liên hệ tư vấn:{' '}
                      <strong className="text-brand">
                        {formatDate(booking.expectedContactDate)}
                      </strong>
                      {booking.workingHoursSnapshot ? ` (${booking.workingHoursSnapshot})` : ''}
                    </span>
                    <NoriLink href="/support#contact" className="font-semibold text-brand">
                      Cần đổi lịch? Liên hệ hỗ trợ
                    </NoriLink>
                  </div>
                )}

                {booking.status === 'PENDING' && booking.hasPaymentRecord && (
                  <Text className="mt-3 text-micro text-warning">
                    Đơn đã ghi nhận giao dịch đặt cọc/thanh toán nên không thể tự sửa trực tiếp. Vui
                    lòng liên hệ nhân viên NORI nếu cần điều chỉnh lịch thuê.
                  </Text>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-3 text-micro text-muted">
                    <span>Thanh toán ngoài hệ thống · Chưa thu tiền tự động.</span>
                    {!canEdit &&
                      !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status) && (
                        <NoriLink
                          href="/support#contact"
                          className="font-semibold text-brand hover:underline"
                        >
                          Liên hệ hỗ trợ
                        </NoriLink>
                      )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailBooking(booking)}
                      className="text-caption"
                    >
                      <Icon name="eye" className="size-4" />
                      Xem chi tiết
                    </Button>

                    {canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openEditModal(booking)}
                        className="text-caption"
                      >
                        <Icon name="edit" className="size-4" />
                        Chỉnh sửa thông tin thuê
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setCancel(booking)
                          setCancelError('')
                        }}
                        className="text-caption"
                      >
                        Hủy đơn thuê
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon="calendar"
          title={status ? 'Chưa có đơn ở trạng thái này' : 'Chưa có hành trình nào'}
          description={
            status
              ? 'Hãy chọn trạng thái khác để xem các đơn thuê của bạn.'
              : 'Tìm chiếc xe phù hợp và bắt đầu lên kế hoạch cho chuyến đi tiếp theo.'
          }
        >
          <ButtonLink href="/vehicles">
            Khám phá phương tiện <Icon name="arrow-right" className="size-4" />
          </ButtonLink>
        </EmptyState>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-7 flex items-center justify-center gap-4">
          <IconButton
            icon="chevron-left"
            label="Trang đơn trước"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          />
          <Text className="text-small">
            {page} / {data.totalPages}
          </Text>
          <IconButton
            icon="chevron-right"
            label="Trang đơn sau"
            disabled={page >= data.totalPages}
            onClick={() => setPage(page + 1)}
          />
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={`Chi tiết đơn thuê ${detailBooking?.bookingKey.slice(0, 11).toUpperCase() ?? ''}`}
        wide
      >
        {detailBooking && (
          <div className="space-y-5 text-small">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-subtle p-4">
              <div>
                <Heading as="h3" size="subtitle">
                  {detailBooking.modelName} ({detailBooking.reference})
                </Heading>
                <Text className="mt-0.5 text-caption text-muted">
                  Mã đơn đầy đủ: {detailBooking.bookingKey}
                </Text>
              </div>
              <StatusBadge status={detailBooking.status} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 rounded-control border border-line p-4">
                <Text className="mb-2 font-semibold text-ink">Lịch trình & Giao nhận</Text>
                <p>
                  Nhận xe: <strong>{formatDate(detailBooking.startDate)}</strong> lúc{' '}
                  {detailBooking.pickupTime}
                </p>
                <p>
                  Trả xe: <strong>{formatDate(detailBooking.endDate)}</strong> lúc{' '}
                  {detailBooking.returnTime} ({detailBooking.totalDays} ngày)
                </p>
                <p>
                  Hình thức:{' '}
                  {detailBooking.deliveryRequested ? 'Giao nhận xe tận nơi' : 'Nhận tại bãi NORI'}
                </p>
                <p>Điểm nhận: {detailBooking.pickupLocation || 'Tại điểm giao nhận NORI'}</p>
                <p>
                  Điểm trả:{' '}
                  {detailBooking.returnLocation ||
                    detailBooking.pickupLocation ||
                    'Tại điểm giao nhận NORI'}
                </p>
              </div>

              <div className="space-y-1.5 rounded-control border border-line p-4">
                <Text className="mb-2 font-semibold text-ink">Liên hệ & Chi phí dự kiến</Text>
                <p>Số điện thoại: {detailBooking.customerPhone || user.phone || 'Chưa cập nhật'}</p>
                <p>Email đơn thuê: {detailBooking.customerEmail || user.email}</p>
                <p>Tiền thuê cơ bản: {formatMoney(detailBooking.baseRentPrice)}</p>
                {detailBooking.weekendSurchargeTotal > 0 && (
                  <p>Phụ phí cuối tuần/lễ: +{formatMoney(detailBooking.weekendSurchargeTotal)}</p>
                )}
                {detailBooking.deliveryFeeSnapshot > 0 && (
                  <p>Phí giao nhận: +{formatMoney(detailBooking.deliveryFeeSnapshot)}</p>
                )}
                {detailBooking.addonFeeTotal > 0 && (
                  <p>Dịch vụ bổ sung: +{formatMoney(detailBooking.addonFeeTotal)}</p>
                )}
                {detailBooking.discountAmount > 0 && (
                  <p className="text-brand">
                    Ưu đãi dài ngày: -{formatMoney(detailBooking.discountAmount)}
                  </p>
                )}
                {(detailBooking.promoDiscountAmount ?? 0) > 0 && (
                  <p className="text-brand">
                    Mã {detailBooking.promoCode}: -{formatMoney(detailBooking.promoDiscountAmount)}
                  </p>
                )}
                <p className="pt-1 font-semibold text-brand">
                  Tổng tiền thuê dự kiến: {formatMoney(detailBooking.totalPrice)}
                </p>
                <p>Tiền đặt cọc tách riêng: {formatMoney(detailBooking.depositSnapshot)}</p>
              </div>
            </div>

            {detailBooking.note && (
              <div className="rounded-control bg-subtle p-3.5 text-caption">
                <strong className="text-ink">Ghi chú hành trình:</strong> {detailBooking.note}
              </div>
            )}

            {detailBooking.modificationHistory && detailBooking.modificationHistory.length > 0 && (
              <div>
                <Text className="mb-2 font-semibold text-ink">
                  Lịch sử chỉnh sửa thông tin thuê ({detailBooking.modificationHistory.length})
                </Text>
                <div className="space-y-2.5">
                  {detailBooking.modificationHistory.map((mod, idx) => (
                    <div key={idx} className="rounded-control border border-line p-3 text-caption">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink">
                          Cập nhật ngày {formatDate(mod.modifiedAt)}
                        </span>
                        <span className="text-muted">
                          Báo giá: {formatMoney(mod.previousTotalPrice)} →{' '}
                          <strong className="text-brand">{formatMoney(mod.newTotalPrice)}</strong>
                        </span>
                      </div>
                      <ul className="mt-1.5 space-y-1 text-muted">
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

            <div className="flex flex-wrap justify-end gap-2.5 border-t border-line pt-3">
              <ButtonLink
                href="/support#contact"
                variant="ghost"
                className="min-h-control-sm px-3.5 py-2 text-caption"
              >
                Liên hệ hỗ trợ
              </ButtonLink>
              {detailBooking.status === 'PENDING' && detailBooking.canModify !== false && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const target = detailBooking
                    setDetailBooking(null)
                    void openEditModal(target)
                  }}
                >
                  Chỉnh sửa thông tin thuê
                </Button>
              )}
              <Button size="sm" onClick={() => setDetailBooking(null)}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit Pending Booking Dialog */}
      <Dialog
        open={Boolean(editingBooking)}
        onClose={() => {
          if (!savingEdit) setEditingBooking(null)
        }}
        title={`Chỉnh sửa đơn thuê ${editingBooking?.bookingKey.slice(0, 11).toUpperCase() ?? ''}`}
        wide
      >
        {editingBooking && (
          <form onSubmit={submitModification} className="space-y-5 text-small">
            {editLockedMessage ? (
              <div className="space-y-4">
                <Notice tone="info">{editLockedMessage}</Notice>
                <div className="flex flex-wrap justify-end gap-3">
                  <ButtonLink
                    href="/support#contact"
                    variant="secondary"
                    className="min-h-control-sm px-3.5 py-2 text-caption"
                  >
                    Liên hệ nhân viên hỗ trợ
                  </ButtonLink>
                  <Button size="sm" onClick={() => setEditingBooking(null)}>
                    Đã hiểu
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-subtle px-4 py-3">
                  <div>
                    <Text className="font-semibold text-ink">
                      {editingBooking.modelName} · Xe {editingBooking.reference}
                    </Text>
                    <Text className="text-micro text-muted">
                      Mã đơn {editingBooking.bookingKey.slice(0, 11).toUpperCase()} · Để đổi sang
                      dòng xe khác, quý khách có thể hủy đơn chờ duyệt miễn phí và đặt xe mới.
                    </Text>
                  </div>
                  <Badge tone="warning">
                    {bookingStatusLabels[editingBooking.status] ?? editingBooking.status}
                  </Badge>
                </div>

                {editError && <Notice tone="error">{editError}</Notice>}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    id="edit-start-date"
                    label="Ngày nhận xe"
                    type="date"
                    required
                    min={businessToday()}
                    max={addDays(businessToday(), 90)}
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                  />
                  <Select
                    id="edit-pickup-time"
                    label="Giờ nhận xe"
                    value={editPickupTime}
                    onChange={(e) => setEditPickupTime(e.target.value)}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id="edit-end-date"
                    label="Ngày trả xe"
                    type="date"
                    required
                    min={editStartDate ? addDays(editStartDate, 1) : businessToday()}
                    max={editStartDate ? addDays(editStartDate, 30) : undefined}
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                  <Select
                    id="edit-return-time"
                    label="Giờ trả xe"
                    value={editReturnTime}
                    onChange={(e) => setEditReturnTime(e.target.value)}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-3 rounded-control border border-line p-4">
                  <Checkbox
                    id="edit-delivery-mode"
                    checked={editDeliveryRequested}
                    onChange={(e) => setEditDeliveryRequested(e.target.checked)}
                    label="Yêu cầu giao nhận xe tận nơi (áp dụng phí giao nhận của phương tiện nếu có)"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="edit-pickup-location"
                      label="Địa điểm nhận xe"
                      placeholder="Điểm giao nhận NORI hoặc địa chỉ nhận xe"
                      value={editPickupLocation}
                      onChange={(e) => setEditPickupLocation(e.target.value)}
                    />
                    <Input
                      id="edit-return-location"
                      label="Địa điểm trả xe"
                      placeholder="Địa điểm hoàn trả phương tiện"
                      value={editReturnLocation}
                      onChange={(e) => setEditReturnLocation(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    id="edit-customer-phone"
                    label="Số điện thoại liên hệ đơn thuê"
                    type="tel"
                    placeholder="0901234567"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                  <Input
                    id="edit-customer-email"
                    label="Email liên hệ đơn thuê"
                    type="email"
                    placeholder="khachhang@example.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                  <Input
                    id="edit-promo-code"
                    label="Mã khuyến mãi (nếu có)"
                    placeholder="Nhập mã ưu đãi"
                    value={editPromoCode}
                    onChange={(e) => setEditPromoCode(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="rounded-control border border-line p-4">
                  <Text className="mb-2.5 font-semibold text-ink">Dịch vụ bổ sung</Text>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Object.values(RENTAL_ADDONS).map((addon) => (
                      <Checkbox
                        key={addon.id}
                        id={`edit-addon-${addon.id}`}
                        checked={editAddons.includes(addon.id)}
                        onChange={() =>
                          setEditAddons((prev) =>
                            prev.includes(addon.id)
                              ? prev.filter((k) => k !== addon.id)
                              : [...prev, addon.id],
                          )
                        }
                        label={
                          <span className="text-caption">
                            {addon.label} (+{formatMoney(addon.price)}
                            {addon.perDay ? '/ngày' : ''})
                          </span>
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Textarea
                    id="edit-booking-note"
                    label="Ghi chú hành trình"
                    rows={2}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <Textarea
                    id="edit-booking-reason"
                    label="Lý do điều chỉnh (tùy chọn)"
                    rows={2}
                    placeholder="Ví dụ: Đổi giờ bay, thêm ngày nghỉ cuối tuần..."
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                  />
                </div>

                {/* Before vs After Quote Comparison */}
                <div className="rounded-card border border-brand/30 bg-soft p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <Text className="font-semibold text-ink">
                      Đối chiếu thông tin & Chi phí Trước / Sau thay đổi
                    </Text>
                    {quoteChecking && (
                      <span className="text-micro font-medium text-brand">
                        Đang kiểm tra khả dụng & tính lại giá…
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-control bg-canvas p-3 text-caption">
                      <Text className="font-semibold text-muted">Hiện tại</Text>
                      <p className="mt-1">
                        Lịch thuê: {formatDate(editingBooking.startDate)} (
                        {editingBooking.pickupTime}) → {formatDate(editingBooking.endDate)} (
                        {editingBooking.returnTime}) · {editingBooking.totalDays} ngày
                      </p>
                      <p className="mt-1">
                        Tổng tiền thuê cũ: <strong>{formatMoney(editingBooking.totalPrice)}</strong>
                      </p>
                      <p>Tiền đặt cọc cũ: {formatMoney(editingBooking.depositSnapshot)}</p>
                    </div>

                    <div className="rounded-control bg-canvas p-3 text-caption">
                      <Text className="font-semibold text-brand">Sau thay đổi (dự kiến)</Text>
                      <p className="mt-1">
                        Lịch thuê: {formatDate(editStartDate)} ({editPickupTime}) →{' '}
                        {formatDate(editEndDate)} ({editReturnTime})
                        {previewQuote ? ` · ${previewQuote.totalDays} ngày` : ''}
                      </p>
                      <p className="mt-1">
                        Tổng tiền thuê mới:{' '}
                        <strong className="text-brand">
                          {previewQuote ? formatMoney(previewQuote.estimatedTotal) : 'Đang tính…'}
                        </strong>
                      </p>
                      <p>
                        Chênh lệch chi phí:{' '}
                        {previewQuote ? (
                          <strong
                            className={
                              priceDelta > 0
                                ? 'text-warning'
                                : priceDelta < 0
                                  ? 'text-brand'
                                  : 'text-ink'
                            }
                          >
                            {priceDelta === 0
                              ? 'Không thay đổi (0 ₫)'
                              : `${priceDelta > 0 ? '+' : '-'}${formatMoney(Math.abs(priceDelta))}`}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </p>
                      {previewQuote && depositDelta !== 0 && (
                        <p>
                          Tiền đặt cọc mới: {formatMoney(previewQuote.depositAmount)} (
                          {depositDelta > 0 ? '+' : '-'}
                          {formatMoney(Math.abs(depositDelta))})
                        </p>
                      )}
                    </div>
                  </div>

                  <Text className="mt-2.5 text-micro text-muted">
                    Chính sách áp dụng: Giá được máy chủ tính lại theo biểu phí hiện hành. Sau khi
                    lưu thay đổi, đơn thuê vẫn giữ trạng thái <strong>Chờ xác nhận</strong> để
                    chuyên viên NORI kiểm tra và xác nhận.
                  </Text>
                </div>

                <div className="flex flex-wrap justify-end gap-3 pt-1">
                  <Button
                    variant="secondary"
                    disabled={savingEdit}
                    onClick={() => setEditingBooking(null)}
                  >
                    Hủy thao tác
                  </Button>
                  <Button
                    type="submit"
                    loading={savingEdit}
                    disabled={
                      quoteChecking ||
                      !hasFormChanges ||
                      Boolean(previewQuote && !previewQuote.available)
                    }
                  >
                    Xác nhận lưu thay đổi
                  </Button>
                </div>
              </>
            )}
          </form>
        )}
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        title="Xác nhận hủy đơn thuê"
        open={!!cancel}
        onClose={() => {
          if (!busy) setCancel(null)
        }}
      >
        <Text className="text-muted">
          Bạn muốn hủy đơn {cancel?.bookingKey.slice(0, 11).toUpperCase()} cho {cancel?.modelName}?
          Khoảng ngày giữ chỗ sẽ được giải phóng. Thao tác này không thể hoàn tác.
        </Text>
        {cancelError && (
          <Notice tone="error" className="mt-4">
            {cancelError}
          </Notice>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setCancel(null)}>
            Giữ lại đơn
          </Button>
          <Button variant="danger" loading={busy} onClick={confirmCancel}>
            Xác nhận hủy
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
