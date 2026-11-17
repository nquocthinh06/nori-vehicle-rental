'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import type { BookingView, FleetView, Quote } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import {
  RENTAL_ADDONS,
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

export function CheckoutPanel({ address }: { address: string | null }) {
  const params = useSearchParams()
  const id = params.get('vehicle')
  const startDate = params.get('startDate') ?? ''
  const endDate = params.get('endDate') ?? ''
  const initialPickupTime = params.get('pickupTime') ?? '08:00'
  const initialReturnTime = params.get('returnTime') ?? '20:00'
  const initialDelivery = ['1', 'true'].includes(params.get('delivery') ?? '')
  const initialAddons = parseAddonKeys(params.get('addons'))

  const { user, loading: authLoading } = useAuth()
  const [vehicle, setVehicle] = useState<FleetView | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [created, setCreated] = useState<BookingView | null>(null)
  const [retry, setRetry] = useState(0)

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
  const [promoCode, setPromoCode] = useState('')
  const [appliedPromo, setAppliedPromo] = useState('')

  const draftKey =
    id && startDate && endDate
      ? `nori_checkout_draft:${user?.id ?? 'anon'}:${id}:${startDate}:${endDate}`
      : ''

  useEffect(() => {
    if (!draftKey || typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        pickupTime?: string
        returnTime?: string
        pickupLocation?: string
        deliveryRequested?: boolean
        addonKeys?: string[]
        note?: string
      }
      if (draft.pickupTime && timeSlots.includes(draft.pickupTime)) setPickupTime(draft.pickupTime)
      if (draft.returnTime && timeSlots.includes(draft.returnTime)) setReturnTime(draft.returnTime)
      if (typeof draft.pickupLocation === 'string' && draft.pickupLocation)
        setPickupLocation(draft.pickupLocation)
      if (typeof draft.deliveryRequested === 'boolean')
        setDeliveryRequested(draft.deliveryRequested)
      if (Array.isArray(draft.addonKeys)) setAddonKeys(parseAddonKeys(draft.addonKeys.join(',')))
      if (typeof draft.note === 'string') setNote(draft.note)
    } catch {
      // ignore storage errors
    }
  }, [draftKey])

  useEffect(() => {
    if (!draftKey || typeof window === 'undefined' || created) return
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          pickupTime,
          returnTime,
          pickupLocation,
          deliveryRequested,
          addonKeys,
          note,
        }),
      )
    } catch {
      // ignore storage errors
    }
  }, [
    draftKey,
    created,
    pickupTime,
    returnTime,
    pickupLocation,
    deliveryRequested,
    addonKeys,
    note,
  ])

  useEffect(() => {
    if (user?.phone && !customerPhone) setCustomerPhone(user.phone)
  }, [user?.phone, customerPhone])

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
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, startDate, endDate, retry, address])

  useEffect(() => {
    if (!id || !vehicle) return
    const validation = validateRentalDates(startDate, endDate)
    if (validation.error) return
    let active = true
    setQuoteBusy(true)
    api<Quote>(
      `/availability?${new URLSearchParams({
        vehicle: id,
        startDate,
        endDate,
        ...(deliveryRequested ? { delivery: '1' } : {}),
        ...(addonKeys.length ? { addons: addonKeys.join(',') } : {}),
        ...(appliedPromo ? { promoCode: appliedPromo } : {}),
      })}`,
    )
      .then((result) => {
        if (!active) return
        setQuote(result)
        if (!result.available) {
          setError('Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày hoặc xe khác.')
        } else {
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setQuoteBusy(false)
      })
    return () => {
      active = false
    }
  }, [id, vehicle, startDate, endDate, deliveryRequested, addonKeys, appliedPromo, retry])

  function toggleAddon(addonId: AddonDefinition['id']) {
    setAddonKeys((prev) =>
      prev.includes(addonId) ? prev.filter((item) => item !== addonId) : [...prev, addonId],
    )
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!user || !quote?.available || !agreed || !vehicle) return
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
          customerPhone: customerPhone.trim() || undefined,
          driverLicenseNumber: driverLicenseNumber.trim() || undefined,
          note: note.trim() || undefined,
          promoCode: appliedPromo || undefined,
        }),
      })
      setCreated(booking)
      if (draftKey && typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(draftKey)
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
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
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-3">
            <Text className="text-small text-muted">Tổng tiền thuê dự kiến</Text>
            <Text className="text-subtitle font-semibold text-brand">
              {formatMoney(created.totalPrice)}
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

  const returnTo = `/checkout?${new URLSearchParams({
    vehicle: id,
    startDate,
    endDate,
    pickupTime,
    returnTime,
    ...(deliveryRequested ? { delivery: '1' } : {}),
    ...(addonKeys.length ? { addons: addonKeys.join(',') } : {}),
  })}`

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
          {user ? (
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
          <div className="mt-5 flex items-start gap-3 rounded-control border border-brand bg-brand-soft p-5 text-brand">
            <Icon name="wallet" className="mt-0.5" />
            <div>
              <Text className="font-semibold">Thanh toán khi xác nhận & bàn giao xe</Text>
              <Text className="mt-2 text-small">
                Website không thu tiền trực tuyến, không xử lý thẻ. Khoản tiền cọc đảm bảo được ghi
                nhận tách riêng khỏi tiền thuê và hoàn trả sau khi kiểm tra xe kết thúc chuyến đi.
              </Text>
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
            <Text>{formatMoney(quote.basePrice)}</Text>
          </div>
          {quote.weekendSurchargeTotal > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phụ phí cuối tuần ({quote.weekendDays} ngày)</Text>
              <Text>+{formatMoney(quote.weekendSurchargeTotal)}</Text>
            </div>
          )}
          {(quote.holidaySurchargeTotal ?? 0) > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phụ phí ngày lễ ({quote.holidayDays} ngày)</Text>
              <Text>+{formatMoney(quote.holidaySurchargeTotal)}</Text>
            </div>
          )}
          {quote.deliveryFee > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Phí giao nhận tận nơi</Text>
              <Text>+{formatMoney(quote.deliveryFee)}</Text>
            </div>
          )}
          {quote.addonFee > 0 && (
            <div className="flex justify-between gap-3">
              <Text className="text-muted">Dịch vụ bổ sung</Text>
              <Text>+{formatMoney(quote.addonFee)}</Text>
            </div>
          )}
          {quote.discountAmount > 0 && (
            <div className="flex justify-between gap-3 text-brand">
              <Text>Ưu đãi thuê dài ngày ({Math.round(quote.discountRate * 100)}%)</Text>
              <Text>-{formatMoney(quote.discountAmount)}</Text>
            </div>
          )}
          {(quote.promoDiscountAmount ?? 0) > 0 && (
            <div className="flex justify-between gap-3 text-brand">
              <Text>Mã khuyến mãi ({quote.promoName || appliedPromo})</Text>
              <Text>-{formatMoney(quote.promoDiscountAmount)}</Text>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-end gap-2">
          <Input
            id="checkout-promo"
            label="Mã khuyến mãi (nếu có)"
            placeholder="Nhập mã..."
            wrapperClassName="flex-1"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            error={quote.promoError ?? undefined}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAppliedPromo(promoCode.trim().toUpperCase())}
          >
            Áp dụng
          </Button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Text className="font-semibold">Tổng tiền thuê dự kiến</Text>
          <Text className="text-title font-semibold text-brand">
            {quoteBusy ? 'Đang tính…' : formatMoney(quote.estimatedTotal)}
          </Text>
        </div>

        {quote.depositAmount > 0 && (
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 rounded-control bg-subtle p-3 text-caption">
            <span className="text-muted">Tiền cọc đảm bảo (tách riêng, hoàn trả sau thuê)</span>
            <span className="font-semibold text-ink">{formatMoney(quote.depositAmount)}</span>
          </div>
        )}

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
          disabled={!user || !agreed || !quote.available || quoteBusy}
          className="mt-4 w-full"
        >
          Xác nhận đặt thuê <Icon name="arrow-right" className="size-4" />
        </Button>
        <Text className="mt-3 text-center text-micro text-muted">Không thu tiền ở bước này</Text>
      </aside>
    </form>
  )
}
