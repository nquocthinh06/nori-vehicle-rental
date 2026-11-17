'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client-api'
import { useAuth } from './auth-provider'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  Input,
  Notice,
  Skeleton,
  StatusBadge,
  Text,
} from './ui'
import { Icon } from './ui/icon'
import { formatDate } from '@/lib/rental-rules'

type Inquiry = {
  id: string
  reference: string
  modelName: string
  status: string
  createdAt: string
}

export function AccountPanel() {
  const { user, loading, refresh, logout } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [inquiriesError, setInquiriesError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    setInquiriesLoading(true)
    setInquiriesError('')
    api<Inquiry[]>('/inquiries')
      .then((result) => {
        if (active) setInquiries(result)
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
            Yêu cầu tư vấn mua xe
          </Heading>
          <Text className="mb-6 mt-2 text-small text-muted">
            Theo dõi các yêu cầu đã gửi. Không phải đơn mua hoặc giao dịch thanh toán.
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
                <div
                  key={inquiry.id}
                  className="flex flex-wrap justify-between gap-4 rounded-control bg-subtle p-4"
                >
                  <div>
                    <Text className="font-semibold">{inquiry.modelName}</Text>
                    <Text className="mt-1 text-caption text-muted">
                      {inquiry.reference.slice(0, 11).toUpperCase()} ·{' '}
                      {formatDate(inquiry.createdAt)}
                    </Text>
                  </div>
                  <StatusBadge status={inquiry.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="bag"
              title="Chưa có yêu cầu tư vấn"
              description="Khi tìm thấy chiếc xe yêu thích, hãy đăng ký tư vấn ở trang chi tiết."
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
