'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import type { BookingView, FleetView, Quote } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import { formatDate, formatMoney, validateRentalDates } from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import {
  Badge,
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  Heading,
  NoriLink,
  Notice,
  Skeleton,
  Text,
} from './ui'
import { Icon } from './ui/icon'

export function CheckoutPanel({ address }: { address: string | null }) {
  const params = useSearchParams()
  const id = params.get('vehicle')
  const startDate = params.get('startDate') ?? ''
  const endDate = params.get('endDate') ?? ''
  const { user, loading: authLoading } = useAuth()
  const [vehicle, setVehicle] = useState<FleetView | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [created, setCreated] = useState<BookingView | null>(null)
  const [retry, setRetry] = useState(0)
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
    Promise.all([
      api<FleetView[]>(`/fleet?id=${encodeURIComponent(id)}`),
      api<Quote>(`/availability?${new URLSearchParams({ vehicle: id, startDate, endDate })}`),
    ])
      .then(([fleet, result]) => {
        if (!active) return
        if (!fleet[0]) throw new Error('Xe không còn được công bố.')
        setVehicle(fleet[0])
        setQuote(result)
        if (!result.available)
          setError('Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày hoặc xe khác.')
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
  }, [id, startDate, endDate, retry])

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!user || !quote?.available || !agreed || !vehicle) return
    setBusy(true)
    setError('')
    try {
      const booking = await api<BookingView>('/bookings', {
        method: 'POST',
        body: JSON.stringify({ vehicle: vehicle.id, startDate, endDate }),
      })
      setCreated(booking)
    } catch (e) {
      setError((e as Error).message)
      setQuote(null)
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
        <div className="my-6 rounded-card bg-subtle p-5 text-left">
          <Text className="font-semibold">{created.modelName}</Text>
          <Text className="mt-2 text-small text-muted">
            {formatDate(created.startDate)} — {formatDate(created.endDate)} · {created.totalDays}{' '}
            ngày
          </Text>
          <Text className="mt-3 text-subtitle font-semibold text-brand">
            {formatMoney(created.totalPrice)}
          </Text>
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
  const returnTo = `/checkout?${new URLSearchParams({ vehicle: id, startDate, endDate })}`
  return (
    <form onSubmit={confirm} className="grid items-start gap-7 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title" className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-pill bg-brand-soft text-small text-brand">
              1
            </span>
            Thông tin hành trình
          </Heading>
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
                <Text className="mt-1 font-semibold">{formatDate(startDate)}</Text>
              </div>
              <div>
                <Text className="text-caption text-muted">Ngày trả xe</Text>
                <Text className="mt-1 font-semibold">{formatDate(endDate)}</Text>
              </div>
            </div>
            <Text className="mt-5 flex items-start gap-2 text-small text-muted">
              <Icon name="pin" className="mt-0.5 size-4 text-brand" />
              {address || 'Địa điểm nhận/trả xe: Chưa cập nhật. Cần xác nhận với NORI.'}
            </Text>
          </div>
          <NoriLink
            href={`/vehicles/${vehicle.modelSlug}?${new URLSearchParams({ startDate, endDate })}`}
            className="mt-4 inline-flex min-h-touch items-center gap-2 text-small font-medium text-brand"
          >
            <Icon name="arrow-left" className="size-4" />
            Thay đổi lựa chọn
          </NoriLink>
        </section>
        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title" className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-pill bg-brand-soft text-small text-brand">
              2
            </span>
            Thông tin khách hàng
          </Heading>
          {user ? (
            <div className="mt-5 space-y-2">
              <Text className="font-semibold">{user.fullName}</Text>
              <Text className="text-small text-muted">{user.email}</Text>
              <Text className="text-small text-muted">
                {user.phone || 'Số điện thoại: Chưa cập nhật'}
              </Text>
              <NoriLink
                href="/account"
                className="inline-flex min-h-touch items-center gap-2 text-small text-brand"
              >
                Cập nhật thông tin <Icon name="arrow-up-right" className="size-3.5" />
              </NoriLink>
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
              <Text className="font-semibold">Thanh toán tại điểm nhận xe</Text>
              <Text className="mt-2 text-small">
                Website không thu tiền, tiền cọc hay phí giao dịch. Thủ tục thanh toán được thực
                hiện trực tiếp với NORI.
              </Text>
            </div>
          </div>
        </section>
      </div>
      <aside className="rounded-card border border-line p-6 shadow-card lg:sticky lg:top-5">
        <Heading as="h2" size="subtitle">
          Chi tiết chi phí
        </Heading>
        <div className="my-5 space-y-3 border-y border-line py-5 text-small">
          <div className="flex justify-between gap-3">
            <Text className="text-muted">Đơn giá / ngày</Text>
            <Text>{formatMoney(quote.dailyPrice)}</Text>
          </div>
          <div className="flex justify-between">
            <Text className="text-muted">Số ngày thuê</Text>
            <Text>{quote.totalDays} ngày</Text>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Text className="font-semibold">Tổng dự kiến</Text>
          <Text className="text-title font-semibold text-brand">
            {formatMoney(quote.estimatedTotal)}
          </Text>
        </div>
        <Text className="mt-3 text-micro text-muted">
          Giá được máy chủ kiểm tra lại và lưu tại thời điểm tạo đơn. Ngày trả không tính thêm tiền
          thuê.
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
          disabled={!user || !agreed || !quote.available}
          className="mt-4 w-full"
        >
          Xác nhận đặt thuê <Icon name="arrow-right" className="size-4" />
        </Button>
        <Text className="mt-3 text-center text-micro text-muted">Không thu tiền ở bước này</Text>
      </aside>
    </form>
  )
}
