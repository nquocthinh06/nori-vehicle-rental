'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { BookingView, FleetView, Quote } from '@/lib/domain-types'
import { api, RequestError } from '@/lib/client-api'
import {
  PROMO_REMOVED_MESSAGE,
  RENTAL_ADDONS,
  calculateReservationDeposit,
  formatDate,
  formatMoney,
  formatVnd,
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
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  Text,
  Textarea,
} from './ui'
import { Icon } from './ui/icon'

const timeSlots = ['07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00']

type PromoFeedback = {
  tone: 'success' | 'error' | 'info'
  message: string
}

export function CheckoutPanel({ address }: { address: string | null }) {
  const params = useSearchParams()
  const id = params.get('vehicle')
  const startDate = params.get('startDate') ?? ''
  const endDate = params.get('endDate') ?? ''
  const initialPickupTime = params.get('pickupTime') ?? '08:00'
  const initialReturnTime = params.get('returnTime') ?? '20:00'
  const initialDelivery = ['1', 'true'].includes(params.get('delivery') ?? '')
  const initialAddons = parseAddonKeys(params.get('addons'))

  const router = useRouter()
  const { user, isCustomer, isAdmin, loading: authLoading, refresh, logout } = useAuth()
  const [vehicle, setVehicle] = useState<FleetView | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loadedQuoteKey, setLoadedQuoteKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [switchingRole, setSwitchingRole] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [created, setCreated] = useState<BookingView | null>(null)
  const [retry, setRetry] = useState(0)
  const [draftRestoredTick, setDraftRestoredTick] = useState(0)

  const [pickupTime, setPickupTime] = useState(
    timeSlots.includes(initialPickupTime) ? initialPickupTime : '08:00',
  )
  const [returnTime, setReturnTime] = useState(
    timeSlots.includes(initialReturnTime) ? initialReturnTime : '20:00',
  )
  const [pickupLocation, setPickupLocation] = useState('')
  const [deliveryRequested, setDeliveryRequested] = useState(initialDelivery)
  const [addonKeys, setAddonKeys] = useState<AddonDefinition['id'][]>(initialAddons)
  const [customerPhone, setCustomerPhone] = useState('')
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('')
  const [note, setNote] = useState('')

  // Explicit 3-state promo model: draft input vs validating vs Backend-confirmed code
  const [promoDraft, setPromoDraft] = useState('')
  const [checkingPromoCode, setCheckingPromoCode] = useState('')
  const [confirmedPromoCode, setConfirmedPromoCode] = useState('')
  const [promoFeedback, setPromoFeedback] = useState<PromoFeedback | null>(null)

  const quoteSeqRef = useRef(0)
  const quoteAbortRef = useRef<AbortController | null>(null)
  const submittingRef = useRef(false)
  const hydratedDraftKeyRef = useRef('')
  const hadCustomerSessionRef = useRef(false)

  const anonDraftKey =
    id && startDate && endDate ? `nori_checkout_draft:anon:${id}:${startDate}:${endDate}` : ''
  const customerDraftKey =
    id && startDate && endDate && isCustomer && user
      ? `nori_checkout_draft:user:${user.id}:${id}:${startDate}:${endDate}`
      : ''
  const activeDraftKey = isCustomer
    ? customerDraftKey
    : !user && !hadCustomerSessionRef.current
      ? anonDraftKey
      : ''

  const addonKeyString = [...addonKeys].sort().join(',')
  const activeQuoteTargetKey = id
    ? `${id}|${startDate}|${endDate}|${deliveryRequested ? '1' : '0'}|${addonKeyString}|${confirmedPromoCode}`
    : ''

  // Always verify live backend session when entering Checkout
  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (authLoading || !activeDraftKey || typeof window === 'undefined') return
    if (isCustomer) {
      hadCustomerSessionRef.current = true
    }
    try {
      let raw = window.sessionStorage.getItem(activeDraftKey)
      // Migrate pre-login anonymous journey choices once to the authenticated customer's key
      if (!raw && isCustomer && anonDraftKey) {
        const anonRaw = window.sessionStorage.getItem(anonDraftKey)
        if (anonRaw) {
          raw = anonRaw
          window.sessionStorage.setItem(activeDraftKey, anonRaw)
          window.sessionStorage.removeItem(anonDraftKey)
        }
      }
      hydratedDraftKeyRef.current = activeDraftKey
      if (!raw) return
      const draft = JSON.parse(raw) as {
        pickupTime?: string
        returnTime?: string
        pickupLocation?: string
        deliveryRequested?: boolean
        addonKeys?: string[]
        customerPhone?: string
        driverLicenseNumber?: string
        note?: string
        confirmedPromoCode?: string
      }
      if (draft.pickupTime && timeSlots.includes(draft.pickupTime)) setPickupTime(draft.pickupTime)
      if (draft.returnTime && timeSlots.includes(draft.returnTime)) setReturnTime(draft.returnTime)
      if (typeof draft.pickupLocation === 'string' && draft.pickupLocation)
        setPickupLocation(draft.pickupLocation)
      if (typeof draft.deliveryRequested === 'boolean')
        setDeliveryRequested(draft.deliveryRequested)
      if (Array.isArray(draft.addonKeys)) setAddonKeys(parseAddonKeys(draft.addonKeys.join(',')))
      if (isCustomer) {
        if (typeof draft.customerPhone === 'string' && draft.customerPhone)
          setCustomerPhone(draft.customerPhone)
        if (typeof draft.driverLicenseNumber === 'string' && draft.driverLicenseNumber)
          setDriverLicenseNumber(draft.driverLicenseNumber)
        if (typeof draft.note === 'string') setNote(draft.note)
      }
      if (typeof draft.confirmedPromoCode === 'string' && draft.confirmedPromoCode.trim()) {
        const restored = draft.confirmedPromoCode.trim().toUpperCase()
        setPromoDraft(restored)
        setConfirmedPromoCode(restored)
        setDraftRestoredTick((n) => n + 1)
      }
    } catch {
      hydratedDraftKeyRef.current = activeDraftKey
    }
  }, [authLoading, activeDraftKey, anonDraftKey, isCustomer])

  useEffect(() => {
    if (
      authLoading ||
      !activeDraftKey ||
      hydratedDraftKeyRef.current !== activeDraftKey ||
      typeof window === 'undefined' ||
      created
    ) {
      return
    }
    try {
      window.sessionStorage.setItem(
        activeDraftKey,
        JSON.stringify(
          isCustomer
            ? {
                pickupTime,
                returnTime,
                pickupLocation,
                deliveryRequested,
                addonKeys,
                customerPhone,
                driverLicenseNumber,
                note,
                confirmedPromoCode,
              }
            : {
                pickupTime,
                returnTime,
                pickupLocation,
                deliveryRequested,
                addonKeys,
                confirmedPromoCode,
              },
        ),
      )
    } catch {
      // ignore storage errors
    }
  }, [
    authLoading,
    activeDraftKey,
    isCustomer,
    created,
    pickupTime,
    returnTime,
    pickupLocation,
    deliveryRequested,
    addonKeys,
    customerPhone,
    driverLicenseNumber,
    note,
    confirmedPromoCode,
  ])

  useEffect(() => {
    if (isCustomer && user?.phone && !customerPhone) setCustomerPhone(user.phone)
  }, [isCustomer, user?.phone, customerPhone])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    const validation = validateRentalDates(startDate, endDate)
    if (validation.error) {
      setError(validation.error)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    api<FleetView[]>(`/fleet?id=${encodeURIComponent(id)}`)
      .then((fleet) => {
        if (!active) return
        if (!fleet[0]) throw new Error('Xe không còn được công bố.')
        setVehicle(fleet[0])
        setPickupLocation(
          (prev) => prev || fleet[0].pickupLocation || fleet[0].location || address || '',
        )
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
  }, [id, startDate, endDate, retry, address])

  const requestQuote = useCallback(
    async (
      promoToEvaluate: string,
      options?: { explicitPromoAction?: boolean; preserveSubmitError?: boolean },
    ) => {
      if (!id || !vehicle) return
      const validation = validateRentalDates(startDate, endDate)
      if (validation.error) return

      quoteAbortRef.current?.abort()
      const controller = new AbortController()
      quoteAbortRef.current = controller
      const seq = ++quoteSeqRef.current

      const normalizedCandidate = promoToEvaluate.trim().toUpperCase()
      setQuoteBusy(true)
      if (options?.explicitPromoAction && normalizedCandidate) {
        setCheckingPromoCode(normalizedCandidate)
      }

      try {
        const sp = new URLSearchParams({
          vehicle: id,
          startDate,
          endDate,
          ...(deliveryRequested ? { delivery: '1' } : {}),
          ...(addonKeys.length ? { addons: addonKeys.join(',') } : {}),
          ...(normalizedCandidate ? { promoCode: normalizedCandidate } : {}),
        })
        const result = await api<Quote>(`/availability?${sp.toString()}`, {
          signal: controller.signal,
        })
        if (seq !== quoteSeqRef.current || controller.signal.aborted) return

        setQuote(result)
        if (!result.available) {
          setError('Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày hoặc xe khác.')
        } else if (!options?.preserveSubmitError) {
          setError('')
        }

        if (normalizedCandidate) {
          if (result.promoCode && !result.promoError) {
            const validCode = result.promoCode.trim().toUpperCase()
            setConfirmedPromoCode(validCode)
            setPromoFeedback({
              tone: 'success',
              message: result.promoMessage || 'Mã đã được áp dụng thành công.',
            })
            setLoadedQuoteKey(
              `${id}|${startDate}|${endDate}|${deliveryRequested ? '1' : '0'}|${[...addonKeys].sort().join(',')}|${validCode}`,
            )
          } else {
            // Promo rejected by Backend: result is already calculated without promo discount
            setConfirmedPromoCode('')
            setPromoFeedback({
              tone: 'error',
              message: result.promoError || 'Mã khuyến mãi không đủ điều kiện áp dụng.',
            })
            setLoadedQuoteKey(
              `${id}|${startDate}|${endDate}|${deliveryRequested ? '1' : '0'}|${[...addonKeys].sort().join(',')}|`,
            )
          }
        } else {
          setConfirmedPromoCode('')
          setLoadedQuoteKey(
            `${id}|${startDate}|${endDate}|${deliveryRequested ? '1' : '0'}|${[...addonKeys].sort().join(',')}|`,
          )
        }
      } catch (e) {
        if (
          seq !== quoteSeqRef.current ||
          controller.signal.aborted ||
          (e instanceof Error && e.name === 'AbortError')
        ) {
          return
        }
        setLoadedQuoteKey('')
        setError((e as Error).message)
      } finally {
        if (seq === quoteSeqRef.current) {
          setQuoteBusy(false)
          setCheckingPromoCode('')
        }
      }
    },
    [id, vehicle, startDate, endDate, deliveryRequested, addonKeys],
  )

  // Recalculate quote automatically whenever vehicle, dates, delivery, addons, draft restore, or retry change
  useEffect(() => {
    if (!id || !vehicle || authLoading) return
    void requestQuote(confirmedPromoCode)
    return () => {
      quoteAbortRef.current?.abort()
    }
    // Intentionally excludes confirmedPromoCode from direct loop on same value; triggered via explicit actions, draft restore, or schedule changes
  }, [
    id,
    vehicle,
    startDate,
    endDate,
    deliveryRequested,
    addonKeyString,
    retry,
    authLoading,
    draftRestoredTick,
  ])

  function handlePromoInputChange(rawValue: string) {
    const nextUpper = rawValue.toUpperCase()
    setPromoDraft(nextUpper)

    const trimmed = nextUpper.trim()
    if (confirmedPromoCode && trimmed !== confirmedPromoCode) {
      // Customer edited or cleared the input after applying a promo -> immediately clear applied state & recalculate clean quote
      setConfirmedPromoCode('')
      setPromoFeedback(trimmed === '' ? { tone: 'info', message: PROMO_REMOVED_MESSAGE } : null)
      void requestQuote('')
      return
    }

    if (!confirmedPromoCode && promoFeedback) {
      setPromoFeedback(null)
    }
  }

  function handleApplyPromo() {
    const candidate = promoDraft.trim().toUpperCase()
    if (!candidate) {
      if (confirmedPromoCode) {
        handleRemovePromo()
      } else {
        setPromoFeedback({
          tone: 'error',
          message: 'Vui lòng nhập mã khuyến mãi trước khi nhấn Áp dụng.',
        })
      }
      return
    }
    setPromoFeedback(null)
    void requestQuote(candidate, { explicitPromoAction: true })
  }

  function handleRemovePromo() {
    quoteAbortRef.current?.abort()
    setPromoDraft('')
    setCheckingPromoCode('')
    setConfirmedPromoCode('')
    setPromoFeedback({ tone: 'info', message: PROMO_REMOVED_MESSAGE })
    void requestQuote('')
  }

  function toggleAddon(addonId: AddonDefinition['id']) {
    setAddonKeys((prev) =>
      prev.includes(addonId) ? prev.filter((item) => item !== addonId) : [...prev, addonId],
    )
  }

  const trimmedDraft = promoDraft.trim().toUpperCase()
  const hasUnappliedDraftPromo =
    Boolean(trimmedDraft) &&
    trimmedDraft !== confirmedPromoCode &&
    !checkingPromoCode &&
    promoFeedback?.tone !== 'error'
  const isQuoteFresh = Boolean(
    quote && loadedQuoteKey === activeQuoteTargetKey && !quoteBusy && !checkingPromoCode,
  )

  const returnTo = id
    ? `/checkout?${new URLSearchParams({
        vehicle: id,
        startDate,
        endDate,
        pickupTime,
        returnTime,
        ...(deliveryRequested ? { delivery: '1' } : {}),
        ...(addonKeys.length ? { addons: addonKeys.join(',') } : {}),
      })}`
    : '/vehicles'

  async function switchAdminToCustomer() {
    setSwitchingRole(true)
    setError('')
    try {
      await logout()
      router.push(`/login?accountType=customer&returnTo=${encodeURIComponent(returnTo)}`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSwitchingRole(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current || busy) return
    if (!isCustomer || !user || !quote?.available || !agreed || !vehicle || !isQuoteFresh) return

    const cleanPhone = customerPhone.trim()
    if (!cleanPhone || !/^[0-9+\s()-]{8,16}$/.test(cleanPhone)) {
      setError('Vui lòng nhập số điện thoại liên hệ hợp lệ (từ 8 đến 16 chữ số).')
      return
    }

    // Only submit a promoCode if it is currently Backend-confirmed AND matches the active input
    const promoToSubmit =
      confirmedPromoCode && trimmedDraft === confirmedPromoCode ? confirmedPromoCode : undefined

    // Snapshot customer draft right before submit so nothing is lost if session timed out
    if (customerDraftKey && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(
          customerDraftKey,
          JSON.stringify({
            pickupTime,
            returnTime,
            pickupLocation,
            deliveryRequested,
            addonKeys,
            customerPhone: cleanPhone,
            driverLicenseNumber: driverLicenseNumber.trim(),
            note: note.trim(),
            confirmedPromoCode: promoToSubmit ?? '',
          }),
        )
      } catch {
        // ignore storage errors
      }
    }

    submittingRef.current = true
    setBusy(true)
    setError('')
    try {
      const booking = await api<BookingView>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          vehicle: vehicle.id,
          startDate,
          endDate,
          pickupTime,
          returnTime,
          pickupLocation: pickupLocation.trim() || undefined,
          deliveryRequested,
          addonServices: addonKeys,
          customerPhone: cleanPhone,
          driverLicenseNumber: driverLicenseNumber.trim() || undefined,
          note: note.trim() || undefined,
          promoCode: promoToSubmit,
          expectedTotalPrice: quote.estimatedTotal,
        }),
      })
      setCreated(booking)
      if (typeof window !== 'undefined') {
        try {
          if (customerDraftKey) window.sessionStorage.removeItem(customerDraftKey)
          if (anonDraftKey) window.sessionStorage.removeItem(anonDraftKey)
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        await refresh()
        router.push(`/login?expired=1&returnTo=${encodeURIComponent(returnTo)}`)
        return
      }
      if (e instanceof RequestError && e.status === 403) {
        await refresh()
        setError(e.message)
        return
      }
      const msg = (e as Error).message
      setError(msg)
      // Refresh authoritative quote immediately if promo status, availability, or price changed on Backend
      // while keeping the submission error visible to the customer.
      void requestQuote(promoToSubmit ?? '', { preserveSubmitError: true })
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  if (!id)
    return (
      <EmptyState
        icon="car"
        title="Chọn chiếc xe trước khi xác nhận"
        description="Hãy chọn một xe thực tế và kiểm tra khoảng ngày thuê. NORI không tạo đơn khi chưa có giá và lịch được xác nhận."
      >
        <ButtonLink href="/vehicles">
          Khám phá phương tiện <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </EmptyState>
    )

  if (loading || authLoading)
    return (
      <div className="grid gap-7 md:grid-cols-3">
        <Skeleton className="h-gallery md:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    )

  if (created)
    return (
      <section className="mx-auto max-w-reading rounded-panel border border-line p-7 text-center md:p-12">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-pill bg-brand-soft text-brand">
          <Icon name="check" className="size-8" />
        </div>
        <Badge tone="warning">Chờ NORI xác nhận</Badge>
        <Heading as="h2" size="section" className="mt-4">
          Đã tiếp nhận hành trình mới.
        </Heading>
        <Text className="mt-4 text-muted">
          Mã đơn{' '}
          <Text as="span" className="font-semibold text-ink">
            {created.bookingKey.slice(0, 11).toUpperCase()}
          </Text>
          . Lịch xe đã được giữ và đơn đang chờ xét duyệt.
        </Text>
        <div className="my-6 space-y-2 rounded-card bg-subtle p-5 text-left">
          <Text className="font-semibold">{created.modelName}</Text>
          <Text className="text-small text-muted">
            {created.reference} · Nhận {formatDate(created.startDate)} ({created.pickupTime}) — Trả{' '}
            {formatDate(created.endDate)} ({created.returnTime}) · {created.totalDays} ngày
          </Text>
          {created.pickupLocation && (
            <Text className="text-caption text-muted">
              Điểm giao nhận: {created.pickupLocation}
            </Text>
          )}
          {created.promoCode && (created.promoDiscountAmount ?? 0) > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-3 text-caption text-brand">
              <span>Mã khuyến mãi ({created.promoCode})</span>
              <span className="font-semibold">-{formatVnd(created.promoDiscountAmount)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-3">
            <Text className="text-small text-muted">Tổng tiền thuê dự kiến</Text>
            <Text className="text-subtitle font-semibold text-brand">
              {formatVnd(created.totalPrice)}
            </Text>
          </div>
          {created.depositSnapshot > 0 && (
            <div className="flex flex-wrap items-baseline justify-between gap-3 text-caption text-muted">
              <span>Đặt cọc đảm bảo (hoàn trả sau khi kết thúc hợp đồng)</span>
              <span className="font-medium text-ink">{formatMoney(created.depositSnapshot)}</span>
            </div>
          )}
        </div>
        <Notice>
          Chưa thu tiền. Đây không phải xác nhận thanh toán. Theo dõi trạng thái và chỉ đến nhận xe
          sau khi đơn được xác nhận.
        </Notice>
        <ButtonLink href="/my-bookings" className="mt-7 w-full">
          Xem đơn thuê của tôi <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </section>
    )

  if (!vehicle || !quote)
    return (
      <div className="mx-auto max-w-reading">
        <Notice tone="error">{error || 'Chưa thể lấy báo giá của xe.'}</Notice>
        <div className="mt-5 flex gap-3">
          <Button onClick={() => setRetry(retry + 1)}>Kiểm tra lại</Button>
          <ButtonLink variant="secondary" href="/vehicles">
            Chọn xe khác
          </ButtonLink>
        </div>
      </div>
    )

  return (
    <form onSubmit={confirm} className="grid items-start gap-7 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-card border border-line p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading as="h2" size="title" className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-pill bg-brand-soft text-small text-brand">
                1
              </span>
              Thông tin hành trình
            </Heading>
            {vehicle.isDemo && <Badge tone="warning">Xe DEMO</Badge>}
          </div>
          <div className="mt-6 rounded-control bg-subtle p-5">
            <Heading as="h3" size="subtitle">
              {vehicle.modelName}
            </Heading>
            <Text className="mt-1 text-caption text-muted">
              Mã xe: {vehicle.reference} · {vehicle.color || 'Màu: Chưa cập nhật'} ·{' '}
              {vehicle.version || 'Phiên bản: Chưa cập nhật'}
            </Text>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <Text className="text-caption text-muted">Ngày nhận xe</Text>
                <Text className="mt-1 font-semibold">
                  {formatDate(startDate)} · {pickupTime}
                </Text>
              </div>
              <div>
                <Text className="text-caption text-muted">Ngày trả xe</Text>
                <Text className="mt-1 font-semibold">
                  {formatDate(endDate)} · {returnTime}
                </Text>
              </div>
            </div>
            <Text className="mt-5 flex items-start gap-2 text-small text-muted">
              <Icon name="pin" className="mt-0.5 size-4 text-brand" />
              {pickupLocation || address || 'Địa điểm nhận/trả xe: Chưa cập nhật.'}
            </Text>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Select
              id="checkout-pickup-time"
              label="Giờ nhận xe dự kiến"
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
            >
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </Select>
            <Select
              id="checkout-return-time"
              label="Giờ trả xe dự kiến"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
            >
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-4">
            <Input
              id="checkout-location"
              label="Địa điểm nhận & trả xe"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              maxLength={200}
              placeholder="Bãi xe NORI hoặc địa chỉ giao xe tận nơi…"
            />
          </div>

          {vehicle.deliveryFee ? (
            <div className="mt-3">
              <Checkbox
                id="checkout-delivery"
                checked={deliveryRequested}
                onChange={(e) => setDeliveryRequested(e.target.checked)}
                label={`Yêu cầu giao nhận xe tận nơi (+${formatMoney(vehicle.deliveryFee)})`}
              />
            </div>
          ) : null}

          <div className="mt-4 rounded-control border border-line p-4">
            <Text className="mb-2 text-small font-semibold">Dịch vụ bổ sung (tùy chọn)</Text>
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.values(RENTAL_ADDONS).map((addon) => (
                <Checkbox
                  key={addon.id}
                  id={`checkout-addon-${addon.id}`}
                  checked={addonKeys.includes(addon.id)}
                  onChange={() => toggleAddon(addon.id)}
                  label={
                    <span className="text-caption">
                      {addon.label} ({formatMoney(addon.price)}
                      {addon.perDay ? '/ngày' : ''})
                    </span>
                  }
                />
              ))}
            </div>
          </div>

          <NoriLink
            href={`/vehicles/${vehicle.modelSlug}?${new URLSearchParams({ startDate, endDate })}`}
            className="mt-4 inline-flex min-h-touch items-center gap-2 text-small font-medium text-brand"
          >
            <Icon name="arrow-left" className="size-4" />
            Thay đổi ngày hoặc chọn xe khác
          </NoriLink>
        </section>

        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title" className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-pill bg-brand-soft text-small text-brand">
              2
            </span>
            Thông tin người thuê & đối chiếu giấy tờ
          </Heading>
          {isCustomer && user ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-control bg-subtle p-4 text-small">
                <Text className="font-semibold">{user.fullName}</Text>
                <Text className="mt-0.5 text-muted">{user.email}</Text>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="checkout-phone"
                  label="Số điện thoại liên hệ"
                  type="tel"
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  maxLength={16}
                  placeholder="Ví dụ: 0912345678"
                  required
                />
                <Input
                  id="checkout-license"
                  label="Số GPLX / CCCD đối chiếu"
                  value={driverLicenseNumber}
                  onChange={(e) => setDriverLicenseNumber(e.target.value)}
                  maxLength={40}
                  placeholder="Nhập mã GPLX để chuẩn bị hợp đồng"
                />
              </div>
              <Textarea
                id="checkout-note"
                label="Ghi chú cho NORI (tùy chọn)"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Yêu cầu giờ giao xe, ghế trẻ em, hóa đơn hoặc câu hỏi khác…"
              />
            </div>
          ) : isAdmin && user ? (
            <div className="mt-5 space-y-4">
              <Notice tone="info">
                Bạn đang đăng nhập bằng tài khoản quản trị ({user.email}). Vui lòng sử dụng tài
                khoản khách hàng để thực hiện đặt thuê.
              </Notice>
              <div className="flex flex-wrap gap-3">
                <Button onClick={switchAdminToCustomer} loading={switchingRole}>
                  Đăng nhập bằng tài khoản khách hàng <Icon name="arrow-right" className="size-4" />
                </Button>
                <ButtonLink href="/dashboard" variant="secondary">
                  Về Quản trị hệ thống
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <Text className="mb-5 text-muted">
                Đăng nhập để tạo và quản lý đơn thuê của riêng bạn.
              </Text>
              <ButtonLink href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                Đăng nhập để tiếp tục <Icon name="arrow-right" className="size-4" />
              </ButtonLink>
            </div>
          )}
        </section>

        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title" className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-pill bg-brand-soft text-small text-brand">
              3
            </span>
            Phương thức thanh toán
          </Heading>
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-3 rounded-control border border-brand bg-brand-soft p-5 text-brand">
              <Icon name="wallet" className="mt-0.5 shrink-0" />
              <div>
                <Text className="font-semibold">
                  Thanh toán đặt cọc trực tuyến VietQR / SePay sau khi đơn được duyệt
                </Text>
                <Text className="mt-2 text-small">
                  Tại bước tạo đơn (<strong>Chờ xác nhận</strong>), hệ thống chưa thu tiền để chuyên
                  viên NORI kiểm tra xe và đối chiếu lịch trình. Ngay sau khi đơn được duyệt, bạn có
                  thể quét mã <strong>VietQR / SePay</strong> hoặc chuyển khoản trực tiếp tại trang{' '}
                  <strong>Đơn thuê của tôi</strong> để xác nhận giữ xe tự động.
                </Text>
              </div>
            </div>
            <div className="grid gap-3 text-caption sm:grid-cols-3">
              <div className="rounded-control border border-line bg-subtle p-3.5">
                <Text className="font-semibold text-ink">1. Khi gửi đơn thuê</Text>
                <Text className="mt-1 text-muted">
                  Chưa thu tiền (0 ₫). Giữ lịch tạm thời để chờ NORI duyệt đơn.
                </Text>
              </div>
              <div className="rounded-control border border-line bg-subtle p-3.5">
                <Text className="font-semibold text-ink">2. Sau khi NORI duyệt đơn</Text>
                <Text className="mt-1 text-muted">
                  Thanh toán cọc giữ chỗ dự kiến{' '}
                  <strong className="text-brand">
                    {formatVnd(
                      quote.depositAmount > quote.estimatedTotal
                        ? calculateReservationDeposit(quote.estimatedTotal, {
                            policyMode: 'PERCENT_OF_RENTAL',
                            depositPercent: 30,
                          })
                        : quote.initialPaymentDue ||
                            calculateReservationDeposit(quote.estimatedTotal, {
                              policyMode: 'PERCENT_OF_RENTAL',
                              depositPercent: 30,
                            }),
                    )}
                  </strong>{' '}
                  qua VietQR / SePay hoặc toàn bộ tiền thuê.
                </Text>
              </div>
              <div className="rounded-control border border-line bg-subtle p-3.5">
                <Text className="font-semibold text-ink">3. Khi nhận & trả xe</Text>
                <Text className="mt-1 text-muted">
                  Thanh toán phần tiền thuê còn lại và cọc bảo đảm tài sản (hoàn trả sau khi kết
                  thúc hợp đồng).
                </Text>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="rounded-card border border-line p-6 shadow-card lg:sticky lg:top-5">
        <Heading as="h2" size="subtitle">
          Chi tiết chi phí thuê xe
        </Heading>
        <div className="my-5 space-y-2.5 border-y border-line py-5 text-small">
          <div className="flex justify-between gap-3">
            <Text className="text-muted">Đơn giá / ngày</Text>
            <Text>{formatMoney(quote.dailyPrice)}</Text>
          </div>
          <div className="flex justify-between gap-3">
            <Text className="text-muted">Số ngày thuê</Text>
            <Text>{quote.totalDays} ngày</Text>
          </div>
          <div className="flex justify-between gap-3">
            <Text className="text-muted">Tiền thuê cơ bản</Text>
            <Text>{formatVnd(quote.basePrice)}</Text>
          </div>
          {quote.weekendSurchargeTotal > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phụ phí cuối tuần ({quote.weekendDays} ngày)</Text>
              <Text>+{formatVnd(quote.weekendSurchargeTotal)}</Text>
            </div>
          )}
          {(quote.holidaySurchargeTotal ?? 0) > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phụ phí ngày lễ ({quote.holidayDays} ngày)</Text>
              <Text>+{formatVnd(quote.holidaySurchargeTotal)}</Text>
            </div>
          )}
          {quote.deliveryFee > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phí giao nhận tận nơi</Text>
              <Text>+{formatVnd(quote.deliveryFee)}</Text>
            </div>
          )}
          {quote.addonFee > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Dịch vụ bổ sung</Text>
              <Text>+{formatVnd(quote.addonFee)}</Text>
            </div>
          )}
          {quote.discountAmount > 0 && (
            <div className="flex justify-between gap-3 text-brand">
              <Text>Ưu đãi thuê dài ngày ({Math.round(quote.discountRate * 100)}%)</Text>
              <Text>-{formatVnd(quote.discountAmount)}</Text>
            </div>
          )}
          {confirmedPromoCode && (quote.promoDiscountAmount ?? 0) > 0 && (
            <div className="flex justify-between gap-3 text-brand">
              <Text>Mã khuyến mãi ({quote.promoName || confirmedPromoCode})</Text>
              <Text>-{formatVnd(quote.promoDiscountAmount)}</Text>
            </div>
          )}
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-end gap-2">
            <Input
              id="checkout-promo"
              label="Mã khuyến mãi (nếu có)"
              placeholder="Nhập mã ưu đãi..."
              wrapperClassName="flex-1"
              value={promoDraft}
              onChange={(e) => handlePromoInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleApplyPromo()
                }
              }}
              error={promoFeedback?.tone === 'error' ? promoFeedback.message : undefined}
            />
            <Button
              size="sm"
              variant="secondary"
              loading={Boolean(checkingPromoCode)}
              disabled={
                Boolean(checkingPromoCode) ||
                !trimmedDraft ||
                (Boolean(confirmedPromoCode) && trimmedDraft === confirmedPromoCode)
              }
              onClick={handleApplyPromo}
            >
              {confirmedPromoCode && trimmedDraft === confirmedPromoCode ? 'Đã áp dụng' : 'Áp dụng'}
            </Button>
          </div>

          {(confirmedPromoCode || trimmedDraft || promoFeedback?.tone === 'error') && (
            <div className="flex items-center justify-between gap-2">
              {confirmedPromoCode ? (
                <Badge tone="brand">Đang áp dụng: {confirmedPromoCode}</Badge>
              ) : checkingPromoCode ? (
                <Text as="span" className="text-micro text-muted">
                  Đang kiểm tra mã {checkingPromoCode}…
                </Text>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleRemovePromo}
                className="text-caption font-semibold text-danger hover:underline"
              >
                Bỏ mã khuyến mãi
              </button>
            </div>
          )}

          {promoFeedback && promoFeedback.tone !== 'error' && (
            <Text
              role="status"
              className={`text-caption font-medium ${
                promoFeedback.tone === 'success' ? 'text-brand' : 'text-muted'
              }`}
            >
              {promoFeedback.message}
            </Text>
          )}

          {hasUnappliedDraftPromo && (
            <Text className="text-micro text-warning">
              Mã đang nhập chưa được kiểm tra. Nhấn &ldquo;Áp dụng&rdquo; để tính giảm giá hoặc
              &ldquo;Bỏ mã khuyến mãi&rdquo; nếu không sử dụng.
            </Text>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Text className="font-semibold">Tổng tiền thuê dự kiến</Text>
          <Text className="text-title font-semibold text-brand">
            {!isQuoteFresh ? 'Đang tính…' : formatVnd(quote.estimatedTotal)}
          </Text>
        </div>

        {isQuoteFresh &&
          (() => {
            const estReservationDeposit =
              quote.depositAmount > quote.estimatedTotal
                ? calculateReservationDeposit(quote.estimatedTotal, {
                    policyMode: 'PERCENT_OF_RENTAL',
                    depositPercent: 30,
                  })
                : quote.initialPaymentDue ||
                  calculateReservationDeposit(quote.estimatedTotal, {
                    policyMode: 'PERCENT_OF_RENTAL',
                    depositPercent: 30,
                  })
            const estRemainingRental = Math.max(0, quote.estimatedTotal - estReservationDeposit)
            return (
              <div className="mt-3 space-y-2 rounded-control border border-line bg-subtle p-3 text-caption">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">Cọc giữ chỗ dự kiến (sau khi duyệt đơn)</span>
                  <span className="font-semibold text-brand">
                    {formatVnd(estReservationDeposit)}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">
                    Tiền thuê còn lại (thanh toán trước/khi nhận xe)
                  </span>
                  <span className="font-medium text-ink">{formatVnd(estRemainingRental)}</span>
                </div>
                {quote.depositAmount > 0 && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2">
                    <span className="text-muted">
                      Tiền cọc đảm bảo tài sản (tách riêng, hoàn trả sau thuê)
                    </span>
                    <span className="font-semibold text-ink">
                      {formatMoney(quote.depositAmount)}
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

        {(quote.kmLimitPerDay || quote.lateReturnFeePerHour) && (
          <Text className="mt-3 text-micro text-muted">
            {quote.kmLimitPerDay ? `Giới hạn ${quote.kmLimitPerDay} km/ngày` : ''}
            {quote.kmLimitPerDay && quote.overKmFee
              ? ` (vượt +${formatMoney(quote.overKmFee)}/km)`
              : ''}
            {quote.lateReturnFeePerHour
              ? ` · Phí trả trễ ${formatMoney(quote.lateReturnFeePerHour)}/giờ`
              : ''}
            .
          </Text>
        )}

        <Text className="mt-3 text-micro text-muted">
          Giá được máy chủ tính lại và lưu giữ khi tạo đơn. Ngày trả không tính thêm tiền thuê.
        </Text>
        <div className="my-5 h-px bg-line" />
        <Checkbox
          id="checkout-terms"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          required
          label={
            <>
              Tôi đã đọc{' '}
              <NoriLink href="/support#conditions" className="text-brand underline">
                điều kiện thuê
              </NoriLink>{' '}
              và hiểu rằng đơn cần NORI xác nhận, chưa phải giao dịch thanh toán.
            </>
          }
        />
        {error && (
          <Notice tone="error" className="my-4">
            {error}
          </Notice>
        )}
        <Button
          type="submit"
          loading={busy}
          disabled={!isCustomer || !agreed || !quote.available || !isQuoteFresh || busy}
          className="mt-4 w-full"
        >
          Xác nhận đặt thuê <Icon name="arrow-right" className="size-4" />
        </Button>
        <Text className="mt-3 text-center text-micro text-muted">Không thu tiền ở bước này</Text>
      </aside>
    </form>
  )
}
