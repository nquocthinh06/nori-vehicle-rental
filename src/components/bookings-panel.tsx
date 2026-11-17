'use client'

import { useEffect, useState } from 'react'
import type { BookingView } from '@/lib/domain-types'
import { api } from '@/lib/client-api'
import { formatDate, formatMoney } from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import {
  Button,
  ButtonLink,
  EmptyState,
  Heading,
  IconButton,
  Notice,
  Select,
  Skeleton,
  StatusBadge,
  Text,
} from './ui'
import { Dialog } from './ui/dialog'
import { Icon } from './ui/icon'

type BookingList = { docs: BookingView[]; page: number; totalPages: number; totalDocs: number }

export function BookingsPanel() {
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState<BookingList | null>(null)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [cancel, setCancel] = useState<BookingView | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [success, setSuccess] = useState('')
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
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="ONGOING">Đang thuê</option>
          <option value="COMPLETED">Hoàn thành</option>
          <option value="CANCELLED">Đã hủy</option>
          <option value="REJECTED">Đã từ chối</option>
        </Select>
      </div>
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
          {data.docs.map((booking) => (
            <article
              key={booking.id}
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
                  <Text className="mt-1 text-caption text-muted">{booking.reference}</Text>
                </div>
                <StatusBadge status={booking.status} />
              </div>
              <div className="mt-6 grid gap-5 rounded-control bg-subtle p-4 sm:grid-cols-3">
                <div>
                  <Text className="mb-1 text-caption text-muted">Nhận xe</Text>
                  <Text className="text-small font-medium">{formatDate(booking.startDate)}</Text>
                </div>
                <div>
                  <Text className="mb-1 text-caption text-muted">
                    Trả xe · {booking.totalDays} ngày thuê
                  </Text>
                  <Text className="text-small font-medium">{formatDate(booking.endDate)}</Text>
                </div>
                <div>
                  <Text className="mb-1 text-caption text-muted">Tổng dự kiến</Text>
                  <Text className="text-small font-semibold text-brand">
                    {formatMoney(booking.totalPrice)}
                  </Text>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <Text className="text-micro text-muted">
                  Thanh toán ngoài hệ thống. Trạng thái đơn không xác nhận đã thanh toán.
                </Text>
                {booking.status === 'PENDING' && (
                  <Button
                    variant="danger"
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
            </article>
          ))}
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
