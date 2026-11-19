'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { BookingView, PaymentItemView, Quote } from '@/lib/domain-types'
import { api, RequestError } from '@/lib/client-api'
import {
  BOOKING_CONFIRMED_LOCK_MESSAGE,
  PROMO_REMOVED_MESSAGE,
  RENTAL_ADDONS,
  addDays,
  bookingStatusLabels,
  businessToday,
  canInitiateOnlinePayment,
  formatDate,
  formatMoney,
  formatVnd,
  parseAddonKeys,
  paymentMethodLabels,
  paymentStatusLabels,
  paymentSummaryLabels,
  paymentTypeLabels,
  reconciliationStatusLabels,
  refundStatusLabels,
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

type ActivePaymentSession = {
  id: string
  reference: string
  bookingId: string
  bookingKey?: string | null
  bookingStatus?: string | null
  paymentType: string
  method: string
  provider: string
  environment: string
  amount: number
  expectedAmount: number
  receivedAmount: number
  refundedAmount: number
  overpaidAmount: number
  status: string
  reconciliationStatus: string
  providerPaymentRef: string | null
  providerTransactionId?: string | null
  qrImageUrl: string | null
  qrSvgDataUri?: string | null
  paymentUrl: string | null
  bankName?: string
  bankCode: string
  bankAccountNumber: string
  bankAccountName: string
  transferContent: string
  expiresAt: string | null
  verifiedAt?: string | null
  paidAt: string | null
  failureReason: string | null
  instructions?: string[]
  createdAt: string
}

type CreateOrStatusPaymentResponse = {
  reused?: boolean
  payment: ActivePaymentSession
  financial: NonNullable<BookingView['financial']>
}

function paymentSummaryTone(summary?: string): 'muted' | 'warning' | 'brand' | 'danger' {
  switch (summary) {
    case 'FULLY_PAID':
    case 'PAID_IN_FULL':
      return 'brand'
    case 'DEPOSIT_PAID':
    case 'PARTIALLY_PAID':
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED':
      return 'warning'
    case 'REVIEW_REQUIRED':
    case 'DISCREPANCY_REVIEW':
      return 'danger'
    default:
      return 'muted'
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

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
  const router = useRouter()
  const { user, isCustomer, isAdmin, loading: authLoading, refresh, logout } = useAuth()
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
  const [switchingRole, setSwitchingRole] = useState(false)

  // Cancel state
  const [cancel, setCancel] = useState<BookingView | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Detail modal state
  const [detailBooking, setDetailBooking] = useState<BookingView | null>(null)

  // Online Payment modal state
  const [paymentBooking, setPaymentBooking] = useState<BookingView | null>(null)
  const [paymentTypeChoice, setPaymentTypeChoice] = useState<
    'DEPOSIT' | 'RENTAL_FEE' | 'FULL_PAYMENT' | 'EXTRA_FEE'
  >('DEPOSIT')
  const [activePayment, setActivePayment] = useState<ActivePaymentSession | null>(null)
  const [paymentFinancial, setPaymentFinancial] = useState<BookingView['financial'] | null>(null)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentPollingBusy, setPaymentPollingBusy] = useState(false)
  const [paymentSimulating, setPaymentSimulating] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [copiedField, setCopiedField] = useState('')
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null)
  const pollCountRef = useRef(0)
  const pollInFlightRef = useRef(false)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollConsecutiveErrorsRef = useRef(0)
  const expiredCheckSentForRef = useRef('')
  const paymentCreatingRef = useRef(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [editPromoDraft, setEditPromoDraft] = useState('')
  const [editCheckingPromo, setEditCheckingPromo] = useState('')
  const [editConfirmedPromo, setEditConfirmedPromo] = useState('')
  const [editPromoFeedback, setEditPromoFeedback] = useState<{
    tone: 'success' | 'error' | 'info'
    message: string
  } | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editReason, setEditReason] = useState('')

  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const [loadedEditQuoteKey, setLoadedEditQuoteKey] = useState('')
  const [quoteChecking, setQuoteChecking] = useState(false)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const editQuoteSeqRef = useRef(0)
  const editQuoteAbortRef = useRef<AbortController | null>(null)
  const editDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editFormDirtyRef = useRef(false)
  const editConfirmedPromoRef = useRef('')
  editConfirmedPromoRef.current = editConfirmedPromo
  const editSubmittingRef = useRef(false)
  const cancelSubmittingRef = useRef(false)

  // Always verify live backend session when entering My Bookings
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!isCustomer || !user) {
      setData(null)
      setLoading(false)
      setError('')
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
        if (!active) return
        if (e instanceof RequestError && e.status === 401) {
          void refresh()
          return
        }
        setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isCustomer, user?.id, status, page, retry, refresh])

  function populateEditForm(b: BookingView) {
    const initialPromo = (b.promoCode ?? '').trim().toUpperCase()
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
    setEditPromoDraft(initialPromo)
    setEditCheckingPromo('')
    setEditConfirmedPromo(initialPromo)
    setEditPromoFeedback(null)
    setEditNote(b.note ?? '')
    setEditReason('')
    setPreviewQuote(null)
    setLoadedEditQuoteKey('')
    setEditError('')
    setEditLockedMessage('')
  }

  async function openEditModal(booking: BookingView) {
    setUrlLockNotice('')
    setSuccess('')
    if (booking.status !== 'PENDING' || booking.canModify === false) {
      setUrlLockNotice(booking.modifyLockReason || BOOKING_CONFIRMED_LOCK_MESSAGE)
      return
    }
    editFormDirtyRef.current = false
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
        if (!editFormDirtyRef.current && (fresh.revision ?? 1) !== (booking.revision ?? 1)) {
          populateEditForm(fresh)
        }
      }
    } catch {
      // Keep local booking snapshot if network hiccups
    }
  }

  // Handle deep links (?detail=... or ?edit=...) safely with backend permission enforcement
  useEffect(() => {
    if (!isCustomer || !user || !data) return
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
      editConfirmedPromo !== (editingBooking.promoCode ?? '').trim().toUpperCase() ||
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
    editConfirmedPromo,
    editNote,
    user?.email,
  ])

  const editAddonKeyStr = [...editAddons].sort().join(',')
  const targetEditQuoteKey = editingBooking?.vehicleId
    ? `${editingBooking.id}|${editingBooking.vehicleId}|${editStartDate}|${editEndDate}|${editDeliveryRequested ? '1' : '0'}|${editAddonKeyStr}|${editConfirmedPromo}`
    : ''
  const isEditQuoteFresh = Boolean(
    previewQuote &&
    loadedEditQuoteKey === targetEditQuoteKey &&
    !quoteChecking &&
    !editCheckingPromo,
  )

  const checkModifiedQuote = useCallback(
    async (promoToCheck: string, explicitPromoAction = false) => {
      if (!editingBooking || !editingBooking.vehicleId) return
      const dateCheck = validateRentalDates(editStartDate, editEndDate)
      if (dateCheck.error) {
        setEditError(dateCheck.error)
        setPreviewQuote(null)
        setLoadedEditQuoteKey('')
        return
      }

      editQuoteAbortRef.current?.abort()
      const controller = new AbortController()
      editQuoteAbortRef.current = controller
      const seq = ++editQuoteSeqRef.current

      const normalizedCandidate = promoToCheck.trim().toUpperCase()
      setQuoteChecking(true)
      if (explicitPromoAction && normalizedCandidate) {
        setEditCheckingPromo(normalizedCandidate)
      }
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
        if (normalizedCandidate) sp.set('promoCode', normalizedCandidate)

        const quote = await api<Quote>(`/availability?${sp.toString()}`, {
          signal: controller.signal,
        })
        if (seq !== editQuoteSeqRef.current || controller.signal.aborted) return

        setPreviewQuote(quote)
        if (!quote.available) {
          setEditError(
            'Xe đã có đơn đặt khác hoặc lịch bảo trì trong khoảng ngày mới. Vui lòng chọn ngày khác.',
          )
        }

        if (normalizedCandidate) {
          if (quote.promoCode && !quote.promoError) {
            const validCode = quote.promoCode.trim().toUpperCase()
            setEditConfirmedPromo(validCode)
            if (
              explicitPromoAction ||
              validCode !== (editingBooking.promoCode ?? '').trim().toUpperCase()
            ) {
              setEditPromoFeedback({
                tone: 'success',
                message: quote.promoMessage || 'Mã đã được áp dụng thành công.',
              })
            }
            setLoadedEditQuoteKey(
              `${editingBooking.id}|${editingBooking.vehicleId}|${editStartDate}|${editEndDate}|${editDeliveryRequested ? '1' : '0'}|${[...editAddons].sort().join(',')}|${validCode}`,
            )
          } else {
            setEditConfirmedPromo('')
            setEditPromoFeedback({
              tone: 'error',
              message:
                quote.promoError || 'Mã khuyến mãi không đủ điều kiện cho lịch trình hiện tại.',
            })
            setLoadedEditQuoteKey(
              `${editingBooking.id}|${editingBooking.vehicleId}|${editStartDate}|${editEndDate}|${editDeliveryRequested ? '1' : '0'}|${[...editAddons].sort().join(',')}|`,
            )
          }
        } else {
          setEditConfirmedPromo('')
          setLoadedEditQuoteKey(
            `${editingBooking.id}|${editingBooking.vehicleId}|${editStartDate}|${editEndDate}|${editDeliveryRequested ? '1' : '0'}|${[...editAddons].sort().join(',')}|`,
          )
        }
      } catch (err) {
        if (
          seq !== editQuoteSeqRef.current ||
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return
        }
        setEditError((err as Error).message)
        setPreviewQuote(null)
        setLoadedEditQuoteKey('')
      } finally {
        if (seq === editQuoteSeqRef.current) {
          setQuoteChecking(false)
          setEditCheckingPromo('')
        }
      }
    },
    [editingBooking, editStartDate, editEndDate, editDeliveryRequested, editAddons],
  )

  // Automatically recalculate quote whenever pricing/schedule inputs change while modal is open
  useEffect(() => {
    if (!editingBooking || editLockedMessage || !editingBooking.vehicleId) return
    const dateCheck = validateRentalDates(editStartDate, editEndDate)
    if (dateCheck.error) {
      setPreviewQuote(null)
      setLoadedEditQuoteKey('')
      return
    }
    const timer = setTimeout(() => {
      editDebounceTimerRef.current = null
      void checkModifiedQuote(editConfirmedPromoRef.current)
    }, 180)
    editDebounceTimerRef.current = timer
    return () => {
      clearTimeout(timer)
      if (editDebounceTimerRef.current === timer) editDebounceTimerRef.current = null
      editQuoteAbortRef.current?.abort()
    }
  }, [
    editingBooking?.id,
    editLockedMessage,
    editStartDate,
    editEndDate,
    editDeliveryRequested,
    editAddonKeyStr,
  ])

  function cancelPendingEditDebounce() {
    if (editDebounceTimerRef.current) {
      clearTimeout(editDebounceTimerRef.current)
      editDebounceTimerRef.current = null
    }
  }

  function handleEditPromoInputChange(rawValue: string) {
    editFormDirtyRef.current = true
    const nextUpper = rawValue.toUpperCase()
    setEditPromoDraft(nextUpper)
    const trimmed = nextUpper.trim()

    if (editConfirmedPromo && trimmed !== editConfirmedPromo) {
      cancelPendingEditDebounce()
      setEditConfirmedPromo('')
      editConfirmedPromoRef.current = ''
      setEditPromoFeedback(trimmed === '' ? { tone: 'info', message: PROMO_REMOVED_MESSAGE } : null)
      void checkModifiedQuote('')
      return
    }
    if (!editConfirmedPromo && editPromoFeedback) {
      setEditPromoFeedback(null)
    }
  }

  function handleEditApplyPromo() {
    editFormDirtyRef.current = true
    cancelPendingEditDebounce()
    const candidate = editPromoDraft.trim().toUpperCase()
    if (!candidate) {
      if (editConfirmedPromo) handleEditRemovePromo()
      return
    }
    setEditPromoFeedback(null)
    void checkModifiedQuote(candidate, true)
  }

  function handleEditRemovePromo() {
    editFormDirtyRef.current = true
    cancelPendingEditDebounce()
    editQuoteAbortRef.current?.abort()
    setEditPromoDraft('')
    setEditCheckingPromo('')
    setEditConfirmedPromo('')
    editConfirmedPromoRef.current = ''
    setEditPromoFeedback({ tone: 'info', message: PROMO_REMOVED_MESSAGE })
    void checkModifiedQuote('')
  }

  async function submitModification(e: React.FormEvent) {
    e.preventDefault()
    if (editSubmittingRef.current || savingEdit) return
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
    if (!isEditQuoteFresh || !previewQuote) {
      setEditError('Đang cập nhật báo giá mới nhất. Vui lòng đợi ít giây rồi xác nhận lại.')
      return
    }
    if (!previewQuote.available) {
      setEditError('Khoảng thời gian mới không khả dụng. Vui lòng chọn ngày khác.')
      return
    }

    const promoToSubmit =
      editConfirmedPromo && editPromoDraft.trim().toUpperCase() === editConfirmedPromo
        ? editConfirmedPromo
        : ''

    editSubmittingRef.current = true
    setSavingEdit(true)
    setEditError('')
    try {
      const updated = await api<BookingView>('/bookings', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingBooking.id,
          expectedRevision: editingBooking.revision ?? 1,
          expectedTotalPrice: previewQuote.estimatedTotal,
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
          promoCode: promoToSubmit,
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
      void checkModifiedQuote(promoToSubmit)
    } finally {
      editSubmittingRef.current = false
      setSavingEdit(false)
    }
  }

  async function confirmCancel() {
    if (!cancel || cancelSubmittingRef.current || busy) return
    cancelSubmittingRef.current = true
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
      cancelSubmittingRef.current = false
      setBusy(false)
    }
  }

  async function switchAdminToCustomer() {
    setSwitchingRole(true)
    setError('')
    try {
      await logout()
      router.push('/login?accountType=customer&returnTo=%2Fmy-bookings')
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSwitchingRole(false)
    }
  }

  const createOrLoadPaymentSession = useCallback(
    async (
      booking: BookingView,
      paymentType: 'DEPOSIT' | 'RENTAL_FEE' | 'FULL_PAYMENT' | 'EXTRA_FEE',
    ) => {
      if (paymentCreatingRef.current) return
      paymentCreatingRef.current = true
      setPaymentBusy(true)
      setPaymentError('')
      setPaymentNotice('')
      try {
        const res = await api<CreateOrStatusPaymentResponse>('/payments/create', {
          method: 'POST',
          timeoutMs: 15_000,
          body: JSON.stringify({
            bookingId: booking.id,
            paymentType,
          }),
        })
        setActivePayment(res.payment)
        setPaymentFinancial(res.financial)
        pollCountRef.current = 0
        pollConsecutiveErrorsRef.current = 0
        expiredCheckSentForRef.current = ''
        if (res.reused) {
          setPaymentNotice('Đang hiển thị mã thanh toán đang còn hiệu lực của bạn.')
        }
      } catch (e) {
        const isTimeout =
          e instanceof RequestError && (e.code === 'REQUEST_TIMEOUT' || e.status === 408)
        setPaymentError(
          isTimeout
            ? 'Yêu cầu khởi tạo mã thanh toán phản hồi chậm. Vui lòng tải lại danh sách đơn để kiểm tra trước khi thử lại, tránh tạo trùng giao dịch.'
            : (e as Error).message,
        )
      } finally {
        paymentCreatingRef.current = false
        setPaymentBusy(false)
      }
    },
    [],
  )

  async function openPaymentModal(
    booking: BookingView,
    preferredType?: 'DEPOSIT' | 'RENTAL_FEE' | 'FULL_PAYMENT' | 'EXTRA_FEE',
  ) {
    setUrlLockNotice('')
    setSuccess('')
    setPaymentError('')
    setPaymentNotice('')
    setCopiedField('')
    pollConsecutiveErrorsRef.current = 0
    expiredCheckSentForRef.current = ''
    const fin = booking.financial
    const pendingItem = (booking.payments ?? []).find(
      (p) => p.status === 'PENDING' || p.status === 'PROCESSING',
    )
    const defaultType: 'DEPOSIT' | 'RENTAL_FEE' | 'FULL_PAYMENT' | 'EXTRA_FEE' =
      preferredType ??
      (pendingItem?.paymentType as
        | 'DEPOSIT'
        | 'RENTAL_FEE'
        | 'FULL_PAYMENT'
        | 'EXTRA_FEE'
        | undefined) ??
      ((fin?.remainingDepositDue ?? 1) > 0 ? 'DEPOSIT' : 'RENTAL_FEE')

    setPaymentBooking(booking)
    setPaymentTypeChoice(defaultType)
    setPaymentFinancial(booking.financial ?? null)

    if (pendingItem && (!preferredType || preferredType === pendingItem.paymentType)) {
      setPaymentBusy(true)
      try {
        const res = await api<CreateOrStatusPaymentResponse>(
          `/payments/status?id=${encodeURIComponent(pendingItem.id)}`,
          { timeoutMs: 12_000 },
        )
        setActivePayment(res.payment)
        setPaymentFinancial(res.financial)
        pollCountRef.current = 0
      } catch {
        await createOrLoadPaymentSession(booking, defaultType)
      } finally {
        setPaymentBusy(false)
      }
    } else {
      await createOrLoadPaymentSession(booking, defaultType)
    }
  }

  const checkActivePaymentStatus = useCallback(
    async (paymentId: string, silent = false): Promise<'ok' | 'terminal' | 'error' | 'skipped'> => {
      if (silent && pollInFlightRef.current) {
        return 'skipped'
      }
      pollAbortRef.current?.abort()
      const controller = new AbortController()
      pollAbortRef.current = controller
      pollInFlightRef.current = true
      if (!silent) {
        setPaymentPollingBusy(true)
        setPaymentError('')
      }
      try {
        const res = await api<CreateOrStatusPaymentResponse>(
          `/payments/status?id=${encodeURIComponent(paymentId)}`,
          { signal: controller.signal, timeoutMs: 12_000 },
        )
        if (controller.signal.aborted) return 'skipped'
        pollConsecutiveErrorsRef.current = 0
        setActivePayment(res.payment)
        setPaymentFinancial(res.financial)
        if (['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(res.payment.status)) {
          setPaymentNotice(
            'Giao dịch đã được xác nhận thành công! Trạng thái đơn thuê đã cập nhật.',
          )
          setSuccess('Đã xác nhận thanh toán trực tuyến thành công.')
          setRetry((r) => r + 1)
          return 'terminal'
        } else if (res.payment.status === 'EXPIRED') {
          setPaymentNotice('Mã thanh toán đã hết hạn. Bạn có thể tạo mã thanh toán mới.')
          setRetry((r) => r + 1)
          return 'terminal'
        } else if (res.payment.status === 'FAILED') {
          setPaymentError(
            res.payment.failureReason || 'Giao dịch không thành công hoặc cần đối soát số tiền.',
          )
          setRetry((r) => r + 1)
          return 'terminal'
        } else if (['CANCELLED', 'REFUNDED', 'REVIEW_REQUIRED'].includes(res.payment.status)) {
          setRetry((r) => r + 1)
          return 'terminal'
        } else if (!silent) {
          setPaymentNotice(
            'Hệ thống đang chờ ghi nhận giao dịch từ ngân hàng. Nếu bạn vừa chuyển khoản, vui lòng đợi thêm ít giây.',
          )
        }
        return 'ok'
      } catch (e) {
        if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
          return 'skipped'
        }
        pollConsecutiveErrorsRef.current += 1
        const isTimeout =
          e instanceof RequestError && (e.code === 'REQUEST_TIMEOUT' || e.status === 408)
        if (!silent) {
          setPaymentError(
            isTimeout
              ? 'Kết nối kiểm tra giao dịch đang chậm. Giao dịch có thể vẫn đang được ngân hàng xử lý — vui lòng bấm "Kiểm tra lại trạng thái" sau ít giây và không chuyển khoản trùng lặp.'
              : (e as Error).message || 'Không thể kiểm tra trạng thái lúc này. Vui lòng thử lại.',
          )
        }
        return 'error'
      } finally {
        pollInFlightRef.current = false
        if (pollAbortRef.current === controller) {
          pollAbortRef.current = null
        }
        if (!silent && !controller.signal.aborted) {
          setPaymentPollingBusy(false)
        }
      }
    },
    [],
  )

  async function handleCancelActivePayment() {
    if (!activePayment || paymentBusy) return
    setPaymentBusy(true)
    setPaymentError('')
    setPaymentNotice('')
    try {
      await api('/payments/cancel', {
        method: 'POST',
        body: JSON.stringify({
          paymentId: activePayment.id,
          reason: 'Khách hàng hủy hoặc đổi hạng mục thanh toán',
        }),
      })
      setActivePayment((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null))
      setPaymentNotice('Đã hủy mã thanh toán hiện tại. Bạn có thể chọn hạng mục để tạo mã mới.')
      setRetry((r) => r + 1)
    } catch (e) {
      setPaymentError((e as Error).message)
    } finally {
      setPaymentBusy(false)
    }
  }

  async function handleMockSimulate(
    outcome: 'SUCCESS' | 'UNDERPAID' | 'OVERPAID' | 'FAILED' | 'EXPIRED',
  ) {
    if (!activePayment || paymentSimulating) return
    setPaymentSimulating(true)
    setPaymentError('')
    setPaymentNotice('')
    try {
      await api('/payments/mock-simulate', {
        method: 'POST',
        body: JSON.stringify({
          paymentId: activePayment.id,
          scenario: outcome === 'SUCCESS' ? 'EXACT' : outcome,
        }),
      })
      await checkActivePaymentStatus(activePayment.id, false)
    } catch (e) {
      setPaymentError((e as Error).message)
    } finally {
      setPaymentSimulating(false)
    }
  }

  async function copyPaymentText(field: string, value: string) {
    if (!value) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value)
      }
      setCopiedField(field)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => {
        setCopiedField((curr) => (curr === field ? '' : curr))
      }, 2200)
    } catch {
      setCopiedField(field)
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      pollAbortRef.current?.abort()
    }
  }, [])

  // Countdown timer for active PENDING / PROCESSING payment (fires expiry status check at most ONCE per payment)
  useEffect(() => {
    if (
      !paymentBooking ||
      !activePayment?.id ||
      !activePayment?.expiresAt ||
      !['PENDING', 'PROCESSING'].includes(activePayment.status)
    ) {
      setCountdownSeconds(null)
      return
    }
    const paymentId = activePayment.id
    const expiresAt = activePayment.expiresAt
    let timer: ReturnType<typeof setInterval> | null = null

    const updateRemaining = () => {
      const expMs = Date.parse(expiresAt)
      if (!Number.isFinite(expMs)) {
        setCountdownSeconds(null)
        return
      }
      const diffSec = Math.max(0, Math.floor((expMs - Date.now()) / 1000))
      setCountdownSeconds(diffSec)
      if (diffSec === 0) {
        if (timer) {
          clearInterval(timer)
          timer = null
        }
        if (expiredCheckSentForRef.current !== paymentId) {
          expiredCheckSentForRef.current = paymentId
          void checkActivePaymentStatus(paymentId, true)
        }
      }
    }
    updateRemaining()
    timer = setInterval(updateRemaining, 1000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [
    paymentBooking,
    activePayment?.id,
    activePayment?.expiresAt,
    activePayment?.status,
    checkActivePaymentStatus,
  ])

  // Smart Polling: bounded (45 attempts), single in-flight, exponential backoff on network/5xx errors,
  // stops after 5 consecutive errors (user can manually retry; never auto-creates duplicate payment),
  // pauses on hidden tab and resumes cleanly on visibility return.
  useEffect(() => {
    if (
      !paymentBooking ||
      !activePayment?.id ||
      !['PENDING', 'PROCESSING'].includes(activePayment.status)
    ) {
      pollAbortRef.current?.abort()
      return
    }
    const paymentId = activePayment.id
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const MAX_ATTEMPTS = 45
    const MAX_CONSECUTIVE_ERRORS = 5
    const BACKOFF_MS = [4000, 6000, 10000, 15000, 20000]

    const scheduleNext = () => {
      if (cancelled) return
      if (pollCountRef.current >= MAX_ATTEMPTS) return
      if (pollConsecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setPaymentError(
          'Tạm dừng tự động cập nhật do kết nối gián đoạn. Giao dịch của bạn chưa được coi là thất bại — vui lòng bấm "Kiểm tra lại trạng thái" sau ít giây và không chuyển khoản lại.',
        )
        return
      }
      const delay =
        BACKOFF_MS[Math.min(pollConsecutiveErrorsRef.current, BACKOFF_MS.length - 1)] ?? 4000
      timer = setTimeout(runPoll, delay)
    }

    const runPoll = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext()
        return
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        scheduleNext()
        return
      }
      if (pollCountRef.current >= MAX_ATTEMPTS) return
      pollCountRef.current += 1
      const outcome = await checkActivePaymentStatus(paymentId, true)
      if (cancelled || outcome === 'terminal') return
      scheduleNext()
    }

    const onVisibilityReturn = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      if (pollConsecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) return
      if (pollCountRef.current >= MAX_ATTEMPTS) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      void runPoll()
    }

    document.addEventListener('visibilitychange', onVisibilityReturn)
    scheduleNext()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityReturn)
      pollAbortRef.current?.abort()
    }
  }, [paymentBooking, activePayment?.id, activePayment?.status, checkActivePaymentStatus])

  if (authLoading) return <Skeleton className="h-64" />
  if (isAdmin && user)
    return (
      <EmptyState
        icon="shield"
        title="Bạn đang đăng nhập bằng tài khoản quản trị"
        description={`Bạn đang đăng nhập bằng tài khoản quản trị (${user.email}). Vui lòng sử dụng tài khoản khách hàng để thực hiện đặt thuê và xem đơn thuê cá nhân, hoặc chuyển đến khu vực Quản trị hệ thống.`}
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={switchAdminToCustomer} loading={switchingRole}>
            Đăng nhập tài khoản khách hàng <Icon name="arrow-right" className="size-4" />
          </Button>
          <ButtonLink href="/dashboard/bookings" variant="secondary">
            Quản lý đơn thuê hệ thống
          </ButtonLink>
        </div>
      </EmptyState>
    )
  if (!isCustomer || !user)
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
            const fin = booking.financial
            const paySummary = fin?.paymentStatusSummary ?? booking.paymentStatusSummary ?? 'UNPAID'
            const pendingPayment = (booking.payments ?? []).find(
              (p) => p.status === 'PENDING' || p.status === 'PROCESSING',
            )
            const hasFailedOrExpired = (booking.payments ?? []).some((p) =>
              ['FAILED', 'EXPIRED', 'CANCELLED'].includes(p.status),
            )
            const depositGate = canInitiateOnlinePayment({
              isLoggedIn: true,
              isCustomer: true,
              isOwner: true,
              bookingStatus: booking.status,
              paymentType: 'DEPOSIT',
              requestedAmount: fin?.remainingDepositDue ?? booking.initialPaymentDue,
              onlinePaymentEnabled: true,
              providerConfigured: true,
            })
            const rentalGate = canInitiateOnlinePayment({
              isLoggedIn: true,
              isCustomer: true,
              isOwner: true,
              bookingStatus: booking.status,
              paymentType: 'RENTAL_FEE',
              requestedAmount: fin?.totalRemainingRentalObligation ?? booking.remainingAmount,
              onlinePaymentEnabled: true,
              providerConfigured: true,
            })
            const canPayDeposit = depositGate.allowed && (fin?.remainingDepositDue ?? 0) > 0
            const canPayRemaining =
              rentalGate.allowed && !canPayDeposit && (fin?.totalRemainingRentalObligation ?? 0) > 0

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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={paymentSummaryTone(paySummary)}>
                      {paymentSummaryLabels[paySummary] ?? paySummary}
                    </Badge>
                    <StatusBadge status={booking.status} />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 rounded-control bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-5">
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
                      {formatVnd(booking.totalPrice)}
                    </Text>
                  </div>
                  <div>
                    <Text className="mb-1 text-caption text-muted">Đã thanh toán / Còn lại</Text>
                    <Text className="text-small font-medium">
                      <span className="text-brand">
                        {formatVnd(fin?.rentalRevenueCollected ?? 0)}
                      </span>{' '}
                      /{' '}
                      <span>
                        {formatVnd(fin?.totalRemainingRentalObligation ?? booking.totalPrice)}
                      </span>
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

                {pendingPayment && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning/40 bg-soft px-3.5 py-2.5 text-caption">
                    <span>
                      Đang có mã thanh toán{' '}
                      <strong>
                        {paymentTypeLabels[pendingPayment.paymentType] ??
                          pendingPayment.paymentType}
                      </strong>{' '}
                      ({formatVnd(pendingPayment.expectedAmount)}) chờ chuyển khoản
                      {pendingPayment.expiresAt
                        ? ` · Hạn: ${new Date(pendingPayment.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openPaymentModal(booking)}
                      className="font-semibold text-brand hover:underline"
                    >
                      Mở mã QR & Kiểm tra giao dịch →
                    </button>
                  </div>
                )}

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
                    <span>
                      {booking.status === 'PENDING'
                        ? 'Đơn đang chờ NORI duyệt trước khi mở thanh toán đặt cọc trực tuyến.'
                        : paySummary === 'PAID_IN_FULL'
                          ? 'Đã hoàn tất nghĩa vụ thanh toán tiền thuê xe.'
                          : (fin?.remainingDepositDue ?? 0) > 0 &&
                              ['DEPOSIT_PENDING', 'CONFIRMED', 'READY_FOR_HANDOVER'].includes(
                                booking.status,
                              )
                            ? `Cần đặt cọc giữ xe: ${formatVnd(fin?.remainingDepositDue ?? 0)} qua VietQR / SePay.`
                            : 'Thanh toán trực tuyến VietQR / SePay hoặc đối soát tại quầy.'}
                    </span>
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
                      {(booking.payments?.length ?? 0) > 0
                        ? 'Xem chi tiết & Biên nhận'
                        : 'Xem chi tiết'}
                    </Button>

                    {pendingPayment ? (
                      <Button
                        size="sm"
                        onClick={() => void openPaymentModal(booking)}
                        className="text-caption"
                      >
                        <Icon name="wallet" className="size-4" />
                        Kiểm tra giao dịch / Mã QR
                      </Button>
                    ) : canPayDeposit ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void openPaymentModal(booking, 'DEPOSIT')}
                          className="text-caption"
                        >
                          <Icon name="wallet" className="size-4" />
                          {hasFailedOrExpired ? 'Thanh toán lại đặt cọc' : 'Thanh toán đặt cọc'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void openPaymentModal(booking, 'FULL_PAYMENT')}
                          className="text-caption"
                        >
                          Thanh toán toàn bộ
                        </Button>
                      </>
                    ) : canPayRemaining ? (
                      <Button
                        size="sm"
                        onClick={() => void openPaymentModal(booking, 'RENTAL_FEE')}
                        className="text-caption"
                      >
                        <Icon name="wallet" className="size-4" />
                        {hasFailedOrExpired ? 'Thanh toán lại' : 'Thanh toán phần còn lại'}
                      </Button>
                    ) : null}

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
                    Mã {detailBooking.promoCode}: -{formatVnd(detailBooking.promoDiscountAmount)}
                  </p>
                )}
                <p className="pt-1 font-semibold text-brand">
                  Tổng tiền thuê dự kiến: {formatVnd(detailBooking.totalPrice)}
                </p>
                {detailBooking.financial && (
                  <>
                    <p>
                      Cọc giữ chỗ cần đóng:{' '}
                      <strong>
                        {formatVnd(detailBooking.financial.reservationDepositRequired)}
                      </strong>
                    </p>
                    <p className="text-brand">
                      Đã thanh toán tiền thuê:{' '}
                      <strong>{formatVnd(detailBooking.financial.rentalRevenueCollected)}</strong>
                    </p>
                    <p>
                      Còn phải trả:{' '}
                      <strong>
                        {formatVnd(detailBooking.financial.totalRemainingRentalObligation)}
                      </strong>
                    </p>
                    {detailBooking.financial.totalRefundedAmount > 0 && (
                      <p className="text-warning">
                        Đã hoàn tiền:{' '}
                        <strong>{formatVnd(detailBooking.financial.totalRefundedAmount)}</strong>
                      </p>
                    )}
                  </>
                )}
                <p>Tiền đặt cọc tách riêng: {formatMoney(detailBooking.depositSnapshot)}</p>
              </div>
            </div>

            {detailBooking.payments && detailBooking.payments.length > 0 && (
              <div className="space-y-2.5 rounded-control border border-line p-4">
                <Text className="font-semibold text-ink">
                  Lịch sử giao dịch & Biên nhận ({detailBooking.payments.length})
                </Text>
                <div className="space-y-2">
                  {detailBooking.payments.map((p: PaymentItemView) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-subtle p-3 text-caption"
                    >
                      <div>
                        <p className="font-semibold text-ink">
                          {p.reference} · {paymentTypeLabels[p.paymentType] ?? p.paymentType}
                        </p>
                        <p className="text-micro text-muted">
                          {paymentMethodLabels[p.method] ?? p.method} ({p.provider}) · Tạo lúc{' '}
                          {new Date(p.createdAt).toLocaleString('vi-VN')}
                          {p.providerTransactionId ? ` · Mã NH: ${p.providerTransactionId}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-brand">
                          {formatVnd(p.receivedAmount > 0 ? p.receivedAmount : p.expectedAmount)}
                        </p>
                        <Badge
                          tone={
                            p.status === 'CONFIRMED'
                              ? 'brand'
                              : p.status === 'PENDING'
                                ? 'warning'
                                : p.status === 'FAILED'
                                  ? 'danger'
                                  : 'muted'
                          }
                        >
                          {paymentStatusLabels[p.status] ?? p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailBooking.refunds && detailBooking.refunds.length > 0 && (
              <div className="space-y-2.5 rounded-control border border-line p-4">
                <Text className="font-semibold text-ink">
                  Lịch sử hoàn tiền ({detailBooking.refunds.length})
                </Text>
                <div className="space-y-2">
                  {detailBooking.refunds.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-subtle p-3 text-caption"
                    >
                      <div>
                        <p className="font-semibold text-ink">
                          {r.reference} ·{' '}
                          {r.refundType === 'FULL' ? 'Hoàn toàn bộ' : 'Hoàn một phần'}
                        </p>
                        <p className="text-micro text-muted">Lý do: {r.reason}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-brand">{formatVnd(r.amount)}</p>
                        <Badge tone={r.status === 'COMPLETED' ? 'brand' : 'warning'}>
                          {refundStatusLabels[r.status] ?? r.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  <div className="space-y-1.5">
                    <div className="flex items-end gap-2">
                      <Input
                        id="edit-promo-code"
                        label="Mã khuyến mãi (nếu có)"
                        placeholder="Nhập mã ưu đãi"
                        wrapperClassName="flex-1"
                        value={editPromoDraft}
                        onChange={(e) => handleEditPromoInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleEditApplyPromo()
                          }
                        }}
                        error={
                          editPromoFeedback?.tone === 'error'
                            ? editPromoFeedback.message
                            : undefined
                        }
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={Boolean(editCheckingPromo)}
                        disabled={
                          Boolean(editCheckingPromo) ||
                          !editPromoDraft.trim() ||
                          (Boolean(editConfirmedPromo) &&
                            editPromoDraft.trim().toUpperCase() === editConfirmedPromo)
                        }
                        onClick={handleEditApplyPromo}
                      >
                        {editConfirmedPromo &&
                        editPromoDraft.trim().toUpperCase() === editConfirmedPromo
                          ? 'Đã áp dụng'
                          : 'Áp dụng'}
                      </Button>
                    </div>
                    {(editConfirmedPromo ||
                      editPromoDraft.trim() ||
                      editPromoFeedback?.tone === 'error') && (
                      <div className="flex items-center justify-between gap-2 text-micro">
                        {editConfirmedPromo ? (
                          <span className="font-semibold text-brand">
                            Đang áp dụng: {editConfirmedPromo}
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={handleEditRemovePromo}
                          className="font-semibold text-danger hover:underline"
                        >
                          Bỏ mã khuyến mãi
                        </button>
                      </div>
                    )}
                    {editPromoFeedback && editPromoFeedback.tone !== 'error' && (
                      <Text className="text-micro font-medium text-brand">
                        {editPromoFeedback.message}
                      </Text>
                    )}
                  </div>
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
                        Tổng tiền thuê cũ: <strong>{formatVnd(editingBooking.totalPrice)}</strong>
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
                          {isEditQuoteFresh && previewQuote
                            ? formatVnd(previewQuote.estimatedTotal)
                            : 'Đang tính…'}
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
                      savingEdit ||
                      !isEditQuoteFresh ||
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

      {/* Online Payment Screen Dialog (VietQR / SePay / Mock Sandbox) */}
      <Dialog
        open={Boolean(paymentBooking)}
        onClose={() => {
          if (!paymentBusy && !paymentSimulating) {
            setPaymentBooking(null)
            setActivePayment(null)
          }
        }}
        title={`Thanh toán trực tuyến · Đơn ${paymentBooking?.bookingKey.slice(0, 11).toUpperCase() ?? ''}`}
        wide
      >
        {paymentBooking && (
          <div className="space-y-5 text-small" data-testid="online-payment-dialog">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-subtle p-4">
              <div>
                <Heading as="h3" size="subtitle">
                  {paymentBooking.modelName} ({paymentBooking.reference})
                </Heading>
                <Text className="mt-0.5 text-caption text-muted">
                  Mã đơn: {paymentBooking.bookingKey.slice(0, 11).toUpperCase()} · Nhận{' '}
                  {formatDate(paymentBooking.startDate)} — Trả {formatDate(paymentBooking.endDate)}
                </Text>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activePayment && (
                  <Badge tone="muted">
                    {activePayment.provider} · {activePayment.environment}
                  </Badge>
                )}
                <StatusBadge status={paymentBooking.status} />
              </div>
            </div>

            {/* Payment Item Selector */}
            {paymentFinancial && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3.5">
                <div className="space-y-0.5 text-caption">
                  <p>
                    Tổng tiền thuê: <strong>{formatVnd(paymentBooking.totalPrice)}</strong> · Đã
                    thu:{' '}
                    <strong className="text-brand">
                      {formatVnd(paymentFinancial.rentalRevenueCollected)}
                    </strong>{' '}
                    · Còn phải trả:{' '}
                    <strong>{formatVnd(paymentFinancial.totalRemainingRentalObligation)}</strong>
                  </p>
                  <p className="text-micro text-muted">
                    Cọc giữ chỗ yêu cầu: {formatVnd(paymentFinancial.reservationDepositRequired)}{' '}
                    (Còn thiếu: {formatVnd(paymentFinancial.remainingDepositDue)})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {paymentFinancial.remainingDepositDue > 0 && (
                    <Button
                      size="sm"
                      variant={paymentTypeChoice === 'DEPOSIT' ? 'primary' : 'secondary'}
                      disabled={paymentBusy}
                      onClick={() => {
                        setPaymentTypeChoice('DEPOSIT')
                        void createOrLoadPaymentSession(paymentBooking, 'DEPOSIT')
                      }}
                    >
                      Đặt cọc ({formatVnd(paymentFinancial.remainingDepositDue)})
                    </Button>
                  )}
                  {paymentFinancial.totalRemainingRentalObligation > 0 && (
                    <Button
                      size="sm"
                      variant={
                        paymentTypeChoice === 'FULL_PAYMENT' || paymentTypeChoice === 'RENTAL_FEE'
                          ? 'primary'
                          : 'secondary'
                      }
                      disabled={paymentBusy}
                      onClick={() => {
                        const nextType =
                          paymentFinancial.paidDepositAmount === 0 ? 'FULL_PAYMENT' : 'RENTAL_FEE'
                        setPaymentTypeChoice(nextType)
                        void createOrLoadPaymentSession(paymentBooking, nextType)
                      }}
                    >
                      {paymentFinancial.paidDepositAmount === 0
                        ? `Thanh toán toàn bộ (${formatVnd(paymentFinancial.totalRemainingRentalObligation)})`
                        : `Thanh toán phần còn lại (${formatVnd(paymentFinancial.totalRemainingRentalObligation)})`}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {paymentError && <Notice tone="error">{paymentError}</Notice>}
            {paymentNotice && <Notice tone="info">{paymentNotice}</Notice>}

            {paymentBusy && !activePayment ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-72" />
                <Skeleton className="h-72" />
              </div>
            ) : activePayment ? (
              <div className="space-y-5">
                {['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(activePayment.status) ? (
                  <div
                    className="rounded-card border border-brand bg-brand-soft p-6 text-center"
                    data-testid="payment-confirmed-banner"
                  >
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-pill bg-brand text-canvas">
                      <Icon name="check" className="size-6" />
                    </div>
                    <Heading as="h4" size="subtitle" className="text-brand">
                      Thanh toán đã được xác thực thành công
                    </Heading>
                    <Text className="mt-2 text-small">
                      Mã giao dịch <strong>{activePayment.reference}</strong> · Số tiền đã ghi nhận:{' '}
                      <strong className="text-brand">
                        {formatVnd(
                          activePayment.receivedAmount > 0
                            ? activePayment.receivedAmount
                            : activePayment.expectedAmount,
                        )}
                      </strong>
                    </Text>
                    {activePayment.paidAt && (
                      <Text className="mt-1 text-micro text-muted">
                        Thời gian xác nhận: {new Date(activePayment.paidAt).toLocaleString('vi-VN')}
                      </Text>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {/* Left Column: Dynamic VietQR Code */}
                    <div className="flex flex-col items-center justify-between rounded-card border border-line bg-subtle p-5 text-center">
                      <div className="w-full">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge tone="brand">VietQR · {activePayment.bankCode}</Badge>
                          <Badge
                            tone={
                              activePayment.status === 'PENDING'
                                ? 'warning'
                                : activePayment.status === 'FAILED'
                                  ? 'danger'
                                  : 'muted'
                            }
                          >
                            {paymentStatusLabels[activePayment.status] ?? activePayment.status}
                          </Badge>
                        </div>
                        <Text className="mt-3 font-semibold text-ink">
                          Quét mã VietQR bằng ứng dụng Ngân hàng
                        </Text>
                        <Text className="mt-0.5 text-micro text-muted">
                          Số tiền và nội dung chuyển khoản được điền tự động chính xác
                        </Text>
                      </div>

                      <div className="my-4 flex w-full max-w-[240px] items-center justify-center rounded-card border border-line bg-canvas p-3 shadow-sm">
                        {activePayment.qrImageUrl || activePayment.qrSvgDataUri ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={activePayment.qrSvgDataUri || activePayment.qrImageUrl || ''}
                            alt={`Mã VietQR thanh toán ${activePayment.reference}`}
                            className="aspect-square h-auto w-full max-w-[216px] object-contain"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center text-caption text-muted">
                            Chuyển khoản theo thông tin bên cạnh
                          </div>
                        )}
                      </div>

                      {countdownSeconds !== null &&
                        ['PENDING', 'PROCESSING'].includes(activePayment.status) && (
                          <div className="w-full rounded-control bg-canvas px-3 py-2 text-caption">
                            Thời gian hiệu lực còn lại:{' '}
                            <strong
                              className={
                                countdownSeconds < 120 ? 'text-danger' : 'font-mono text-brand'
                              }
                            >
                              {formatCountdown(countdownSeconds)}
                            </strong>
                          </div>
                        )}
                    </div>

                    {/* Right Column: Bank Transfer Details & Copy Controls */}
                    <div className="flex flex-col justify-between space-y-4 rounded-card border border-line p-5">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-line pb-2.5">
                          <span className="text-caption text-muted">Hạng mục</span>
                          <span className="font-semibold text-ink">
                            {paymentTypeLabels[activePayment.paymentType] ??
                              activePayment.paymentType}
                          </span>
                        </div>

                        <div className="flex items-center justify-between border-b border-line pb-2.5">
                          <span className="text-caption text-muted">Ngân hàng thụ hưởng</span>
                          <span className="font-semibold text-ink">
                            {activePayment.bankName || activePayment.bankCode} (
                            {activePayment.bankCode})
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                          <div>
                            <span className="block text-caption text-muted">Số tài khoản</span>
                            <span
                              className="font-mono font-semibold text-ink"
                              data-testid="payment-bank-account"
                            >
                              {activePayment.bankAccountNumber}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void copyPaymentText('account', activePayment.bankAccountNumber)
                            }
                          >
                            {copiedField === 'account' ? 'Đã sao chép' : 'Sao chép STK'}
                          </Button>
                        </div>

                        <div className="flex items-center justify-between border-b border-line pb-2.5">
                          <span className="text-caption text-muted">Chủ tài khoản</span>
                          <span className="text-right font-semibold text-ink">
                            {activePayment.bankAccountName}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                          <div>
                            <span className="block text-caption text-muted">
                              Số tiền cần chuyển (VNĐ)
                            </span>
                            <span
                              className="text-subtitle font-semibold text-brand"
                              data-testid="payment-expected-amount"
                            >
                              {formatVnd(activePayment.expectedAmount)}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void copyPaymentText('amount', String(activePayment.expectedAmount))
                            }
                          >
                            {copiedField === 'amount' ? 'Đã sao chép' : 'Sao chép số tiền'}
                          </Button>
                        </div>

                        <div className="flex items-center justify-between gap-2 rounded-control bg-subtle p-3">
                          <div>
                            <span className="block text-micro text-muted">
                              Nội dung chuyển khoản bắt buộc
                            </span>
                            <span
                              className="font-mono font-semibold text-brand"
                              data-testid="payment-transfer-content"
                            >
                              {activePayment.transferContent}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void copyPaymentText('content', activePayment.transferContent)
                            }
                          >
                            {copiedField === 'content' ? 'Đã sao chép' : 'Sao chép nội dung'}
                          </Button>
                        </div>

                        {activePayment.reconciliationStatus &&
                          activePayment.reconciliationStatus !== 'NONE' && (
                            <div className="rounded-control border border-warning bg-soft p-3 text-caption">
                              <strong>Trạng thái đối soát:</strong>{' '}
                              {reconciliationStatusLabels[activePayment.reconciliationStatus] ??
                                activePayment.reconciliationStatus}
                              {activePayment.receivedAmount > 0 && (
                                <span>
                                  {' '}
                                  · Đã nhận: {formatVnd(activePayment.receivedAmount)} / Yêu cầu:{' '}
                                  {formatVnd(activePayment.expectedAmount)}
                                </span>
                              )}
                            </div>
                          )}
                      </div>

                      <div className="space-y-1.5 rounded-control bg-subtle p-3 text-micro text-muted">
                        <p className="font-semibold text-ink">Hướng dẫn thanh toán:</p>
                        <p>1. Mở ứng dụng Ngân hàng và quét mã VietQR bên trái.</p>
                        <p>
                          2. Giữ nguyên nội dung chuyển khoản{' '}
                          <strong>{activePayment.transferContent}</strong> để hệ thống tự động đối
                          soát trong 3–10 giây.
                        </p>
                        <p>
                          3. Màn hình này tự động cập nhật ngay khi nhận xác nhận từ cổng thanh
                          toán.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Controlled Mock Provider Simulator (ONLY available in MOCK environment) */}
                {activePayment.environment === 'MOCK' &&
                  ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'].includes(activePayment.status) && (
                    <div
                      className="rounded-card border border-brand/40 bg-soft p-4"
                      data-testid="mock-payment-simulator"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <Text className="text-caption font-semibold text-ink">
                            Bộ mô phỏng Webhook SePay / VietQR (Chế độ MOCK kiểm thử)
                          </Text>
                          <Text className="text-micro text-muted">
                            Kích hoạt luồng xử lý Webhook thực tế tại Backend để kiểm thử xác nhận
                            tự động và đối soát chênh lệch.
                          </Text>
                        </div>
                        <Badge tone="warning">MOCK SANDBOX</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          loading={paymentSimulating}
                          disabled={
                            paymentSimulating ||
                            !['PENDING', 'PROCESSING'].includes(activePayment.status)
                          }
                          onClick={() => void handleMockSimulate('SUCCESS')}
                        >
                          Mô phỏng chuyển khoản thành công (
                          {formatVnd(activePayment.expectedAmount)})
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={paymentSimulating}
                          disabled={
                            paymentSimulating ||
                            !['PENDING', 'PROCESSING'].includes(activePayment.status)
                          }
                          onClick={() => void handleMockSimulate('UNDERPAID')}
                        >
                          Mô phỏng chuyển thiếu tiền
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={paymentSimulating}
                          disabled={
                            paymentSimulating ||
                            !['PENDING', 'PROCESSING'].includes(activePayment.status)
                          }
                          onClick={() => void handleMockSimulate('OVERPAID')}
                        >
                          Mô phỏng chuyển dư tiền
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={paymentSimulating}
                          disabled={
                            paymentSimulating ||
                            !['PENDING', 'PROCESSING'].includes(activePayment.status)
                          }
                          onClick={() => void handleMockSimulate('EXPIRED')}
                        >
                          Mô phỏng hết hạn
                        </Button>
                      </div>
                    </div>
                  )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <div className="flex flex-wrap gap-2">
                    {['PENDING', 'PROCESSING'].includes(activePayment.status) && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={paymentPollingBusy}
                          onClick={() => void checkActivePaymentStatus(activePayment.id, false)}
                        >
                          Kiểm tra trạng thái
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={paymentBusy}
                          onClick={() => void handleCancelActivePayment()}
                        >
                          Hủy mã thanh toán
                        </Button>
                      </>
                    )}
                    {['FAILED', 'EXPIRED', 'CANCELLED'].includes(activePayment.status) && (
                      <Button
                        size="sm"
                        loading={paymentBusy}
                        onClick={() =>
                          void createOrLoadPaymentSession(paymentBooking, paymentTypeChoice)
                        }
                      >
                        Tạo mã thanh toán mới
                      </Button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setPaymentBooking(null)
                      setActivePayment(null)
                    }}
                  >
                    Đóng
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
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
