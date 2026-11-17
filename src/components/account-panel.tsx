'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { BookingView, InquiryView } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatDate,
  formatMoney,
  inquiryStatusLabels,
  inquiryTypeLabels,
} from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Input,
  NoriLink,
  Notice,
  Skeleton,
  StatusBadge,
  Text,
} from './ui'
import { Icon } from './ui/icon'

const paymentMethodLabels: Record<string, string> = {
  DIRECT: 'Thanh toán trực tiếp',
  INSTALLMENT: 'Trả góp tham khảo',
  CONSULT_FINANCE: 'Cần tư vấn tài chính',
}

export function AccountPanel() {
  const { user, loading, refresh, logout } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdMessage, setPwdMessage] = useState('')
  const [inquiries, setInquiries] = useState<InquiryView[]>([])
  const [bookings, setBookings] = useState<BookingView[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [inquiriesError, setInquiriesError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    setInquiriesLoading(true)
    setInquiriesError('')
    Promise.all([
      api<InquiryView[]>('/inquiries'),
      api<{ docs: BookingView[] }>('/bookings?page=1').catch(() => ({ docs: [] })),
    ])
      .then(([inquiryResult, bookingResult]) => {
        if (active) {
          setInquiries(inquiryResult)
          setBookings(bookingResult.docs ?? [])
        }
      })
      .catch((e) => {
        if (active) setInquiriesError(e.message)
      })
      .finally(() => {
        if (active) setInquiriesLoading(false)
      })
    return () => {
      active = false
    }
  }, [user?.id, retry])

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(data.entries())),
      })
      await refresh()
      setMessage('Thông tin của bạn đã được cập nhật.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setPwdBusy(true)
    setPwdError('')
    setPwdMessage('')
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data.entries())),
      })
      form.reset()
      setPwdMessage('Đã đổi mật khẩu thành công.')
    } catch (e) {
      setPwdError((e as Error).message)
    } finally {
      setPwdBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    setError('')
    try {
      await logout()
      router.push('/login')
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    )
  if (!user)
    return (
      <EmptyState
        icon="user"
        title="Hành trình riêng cần một tài khoản"
        description="Đăng nhập để cập nhật thông tin, xem đơn thuê và theo dõi yêu cầu tư vấn của bạn."
      >
        <ButtonLink href="/login?returnTo=%2Faccount">
          Đăng nhập <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </EmptyState>
    )

  return (
    <div className="grid items-start gap-7 lg:grid-cols-3">
      <aside className="rounded-card border border-line p-6">
        <div className="mb-4 flex size-14 items-center justify-center rounded-pill bg-brand-soft text-brand">
          <Icon name="user" className="size-6" />
        </div>
        <Heading as="h2" size="subtitle" className="break-words">
          {user.fullName}
        </Heading>
        <Text className="mt-2 break-all text-small text-muted">{user.email}</Text>
        <Badge tone="brand" className="mt-4">
          Khách hàng NORI
        </Badge>
        <div className="mt-6 grid gap-3 border-t border-line pt-6">
          <ButtonLink href="/my-bookings" variant="secondary" className="justify-start text-small">
            <Icon name="calendar" className="size-4" />
            Đơn thuê của tôi <Icon name="arrow-up-right" className="ml-auto size-4" />
          </ButtonLink>
          <ButtonLink href="/vehicles" variant="secondary" className="justify-start text-small">
            <Icon name="car" className="size-4" />
            Khám phá phương tiện
          </ButtonLink>
          <Button
            variant="ghost"
            onClick={signOut}
            loading={busy}
            className="justify-start text-small text-muted"
          >
            <Icon name="logout" className="size-4" />
            Đăng xuất
          </Button>
        </div>
      </aside>
      <div className="space-y-7 lg:col-span-2">
        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title">
            Thông tin cá nhân
          </Heading>
          <Text className="mb-6 mt-2 text-small text-muted">
            Giúp NORI liên hệ khi xử lý đơn thuê hoặc yêu cầu tư vấn.
          </Text>
          <form onSubmit={save} className="space-y-5" key={user.id}>
            <Input
              id="profile-name"
              name="fullName"
              label="Họ và tên"
              defaultValue={user.fullName}
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
            <Input
              id="profile-email"
              label="Email đăng nhập"
              value={user.email}
              disabled
              hint="Không thể thay đổi email trong phiên bản này."
            />
            <Input
              id="profile-phone"
              name="phone"
              label="Số điện thoại"
              type="tel"
              autoComplete="tel"
              defaultValue={user.phone ?? ''}
              maxLength={16}
            />
            {error && <Notice tone="error">{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}
            <Button type="submit" loading={busy}>
              Lưu thay đổi <Icon name="check" className="size-4" />
            </Button>
          </form>
        </section>

        <section className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title">
            Đổi mật khẩu
          </Heading>
          <Text className="mb-6 mt-2 text-small text-muted">
            Mật khẩu mới cần từ 8 đến 72 ký tự, bao gồm chữ cái và chữ số.
          </Text>
          <form onSubmit={changePassword} className="space-y-4">
            <Input
              id="pwd-current"
              name="currentPassword"
              label="Mật khẩu hiện tại"
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="pwd-new"
                name="newPassword"
                label="Mật khẩu mới"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
              <Input
                id="pwd-confirm"
                name="confirmPassword"
                label="Xác nhận mật khẩu mới"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </div>
            {pwdError && <Notice tone="error">{pwdError}</Notice>}
            {pwdMessage && <Notice tone="success">{pwdMessage}</Notice>}
            <Button type="submit" variant="secondary" loading={pwdBusy}>
              Cập nhật mật khẩu
            </Button>
          </form>
        </section>

        <section className="rounded-card border border-line p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading as="h2" size="title">
              Thông báo trạng thái gần đây
            </Heading>
            <Badge tone="brand">In-App</Badge>
          </div>
          <Text className="mb-5 mt-2 text-small text-muted">
            Cập nhật mới nhất về đơn thuê và yêu cầu mua xe của bạn (Email/SMS tự động chưa kích
            hoạt trong phiên bản ngoại tuyến).
          </Text>
          {bookings.length + inquiries.length > 0 ? (
            <div className="space-y-2.5">
              {[
                ...bookings.slice(0, 4).map((b) => ({
                  id: `b-${b.id}`,
                  title: `Đơn thuê ${b.modelName} (${b.bookingKey.slice(0, 11).toUpperCase()})`,
                  status: bookingStatusLabels[b.status] ?? b.status,
                  date: b.createdAt,
                  href: '/my-bookings',
                })),
                ...inquiries.slice(0, 4).map((inq) => ({
                  id: `i-${inq.id}`,
                  title: `Yêu cầu ${inq.modelName} (${inq.reference.slice(0, 11).toUpperCase()})`,
                  status: inquiryStatusLabels[inq.status] ?? inq.status,
                  date: inq.createdAt,
                  href: '#inquiries',
                })),
              ]
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .slice(0, 6)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-subtle px-4 py-3 text-small"
                  >
                    <div>
                      <Text className="font-medium text-ink">{item.title}</Text>
                      <Text className="text-micro text-muted">
                        Trạng thái: {item.status} · {formatDate(item.date)}
                      </Text>
                    </div>
                    {item.href.startsWith('/') && (
                      <NoriLink href={item.href} className="text-caption font-medium text-brand">
                        Xem chi tiết
                      </NoriLink>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <Text className="text-small text-muted">Chưa có thông báo giao dịch nào.</Text>
          )}
        </section>

        <section id="inquiries" className="rounded-card border border-line p-6 md:p-8">
          <Heading as="h2" size="title">
            Yêu cầu tư vấn mua xe
          </Heading>
          <Text className="mb-6 mt-2 text-small text-muted">
            Theo dõi các yêu cầu tư vấn, báo giá, lái thử và đặt mua đã gửi. Không phải giao dịch
            thanh toán trực tuyến.
          </Text>
          {inquiriesLoading ? (
            <Skeleton className="h-28" />
          ) : inquiriesError ? (
            <div>
              <Notice tone="error">{inquiriesError}</Notice>
              <Button variant="secondary" className="mt-3" onClick={() => setRetry(retry + 1)}>
                Thử lại
              </Button>
            </div>
          ) : inquiries.length ? (
            <div className="space-y-3">
              {inquiries.map((inquiry) => (
                <div key={inquiry.id} className="rounded-control bg-subtle p-4">
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge tone="brand">
                          {inquiryTypeLabels[inquiry.inquiryType] ?? inquiry.inquiryType}
                        </Badge>
                        {inquiry.vehicleReference && <Badge>{inquiry.vehicleReference}</Badge>}
                      </div>
                      <Text className="font-semibold">{inquiry.modelName}</Text>
                      <Text className="mt-1 text-caption text-muted">
                        {inquiry.reference.slice(0, 11).toUpperCase()} ·{' '}
                        {formatDate(inquiry.createdAt)}
                        {inquiry.variantName ? ` · ${inquiry.variantName}` : ''}
                        {inquiry.colorName ? ` · ${inquiry.colorName}` : ''}
                      </Text>
                    </div>
                    <StatusBadge status={inquiry.status} />
                  </div>
                  {(inquiry.preferredDate ||
                    inquiry.preferredLocation ||
                    inquiry.paymentMethod ||
                    inquiry.quotedPriceSnapshot ||
                    inquiry.estimatedRollingSnapshot ||
                    inquiry.note) && (
                    <div className="mt-3 space-y-2 border-t border-line pt-2 text-micro text-muted">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {inquiry.paymentMethod && (
                          <span>
                            Hình thức:{' '}
                            {paymentMethodLabels[inquiry.paymentMethod] ?? inquiry.paymentMethod}
                          </span>
                        )}
                        {inquiry.preferredDate && (
                          <span>Lịch hẹn mong muốn: {formatDate(inquiry.preferredDate)}</span>
                        )}
                        {inquiry.preferredLocation && (
                          <span>Địa điểm: {inquiry.preferredLocation}</span>
                        )}
                        {inquiry.quotedPriceSnapshot && (
                          <span>
                            Giá bán tham khảo lúc gửi: {formatMoney(inquiry.quotedPriceSnapshot)}
                          </span>
                        )}
                        {inquiry.estimatedRollingSnapshot && (
                          <span>
                            Lăn bánh ước tính: {formatMoney(inquiry.estimatedRollingSnapshot)}
                          </span>
                        )}
                      </div>
                      {inquiry.note && (
                        <Text className="text-caption text-ink">Ghi chú: {inquiry.note}</Text>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="bag"
              title="Chưa có yêu cầu tư vấn"
              description="Khi tìm thấy chiếc xe yêu thích, hãy đăng ký tư vấn, lái thử hoặc gửi yêu cầu mua ở trang chi tiết."
            >
              <ButtonLink href="/vehicles?intent=buy" variant="secondary" className="text-small">
                Khám phá xe mua <Icon name="arrow-right" className="size-4" />
              </ButtonLink>
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  )
}
