'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  bookingStatusLabels,
  formatDate,
  formatMoney,
  inquiryStatusLabels,
} from '@/lib/rental-rules'
import type { DashboardReviewSummary } from '@/lib/domain-types'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  TabButton,
  Text,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type CustomerRow = {
  id: string
  fullName: string
  email: string
  phone: string | null
  status: string
  bookingCount: number
  inquiryCount: number
  createdAt: string
}

type CustomerDetail = {
  customer: {
    id: string
    fullName: string
    email: string
    phone: string | null
    status: string
    driverLicenseNumber: string | null
    idCardNumber: string | null
    verificationStatus: string
    verificationNote: string | null
    createdAt: string
  }
  bookings: {
    id: string
    bookingKey: string
    status: string
    modelName: string
    reference: string
    startDate: string
    endDate: string
    totalPrice: number
  }[]
  inquiries: {
    id: string
    reference: string
    inquiryType: string
    status: string
    modelName: string
    quotedPriceSnapshot: number | null
  }[]
  reviews: {
    id: string
    rating: number
    title: string | null
    comment: string
    status: string
    modelName: string
  }[]
}

export function CustomersPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'customers' | 'reviews'>('customers')
  const [items, setItems] = useState<CustomerRow[]>([])
  const [reviews, setReviews] = useState<DashboardReviewSummary[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [confirmLock, setConfirmLock] = useState<{
    customer: CustomerRow
    nextStatus: 'ACTIVE' | 'DISABLED'
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      page: String(page),
      ...(status ? { status } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
    })
    api<{
      items: CustomerRow[]
      totalDocs: number
      totalPages: number
      reviews: DashboardReviewSummary[]
    }>(`/dashboard/customers?${sp.toString()}`)
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
        setReviews(res.reviews)
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

  async function openDetail(customerId: string) {
    try {
      const res = await api<CustomerDetail>(
        `/dashboard/customers?customerId=${encodeURIComponent(customerId)}`,
      )
      setDetail(res)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  async function toggleCustomerStatus() {
    if (!confirmLock) return
    setBusy(true)
    try {
      await api('/dashboard/customers', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'user',
          id: confirmLock.customer.id,
          status: confirmLock.nextStatus,
        }),
      })
      toast(
        confirmLock.nextStatus === 'DISABLED'
          ? `Đã tạm khóa tài khoản ${confirmLock.customer.email}.`
          : `Đã mở khóa tài khoản ${confirmLock.customer.email}.`,
      )
      setConfirmLock(null)
      setRetry((r) => r + 1)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleReview(id: string, nextStatus: 'PUBLISHED' | 'HIDDEN') {
    setBusy(true)
    try {
      await api('/dashboard/customers', {
        method: 'PATCH',
        body: JSON.stringify({ entity: 'review', id, status: nextStatus }),
      })
      toast(nextStatus === 'HIDDEN' ? 'Đã ẩn đánh giá.' : 'Đã hiển thị đánh giá.')
      setRetry((r) => r + 1)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line">
        <div role="tablist" className="flex gap-6">
          <TabButton selected={tab === 'customers'} onClick={() => setTab('customers')}>
            Tài khoản khách hàng ({totalDocs})
          </TabButton>
          <TabButton selected={tab === 'reviews'} onClick={() => setTab('reviews')}>
            Đánh giá & Phản hồi ({reviews.length})
          </TabButton>
        </div>
        <a
          href="/nori-api/dashboard/export?type=customers"
          download
          className="mb-2 inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
        >
          <Icon name="download" className="size-4" />
          Xuất CSV Khách hàng
        </a>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {tab === 'customers' ? (
        <>
          <div className="grid gap-3 rounded-card border border-line bg-canvas p-4 sm:grid-cols-2 lg:max-w-xl">
            <Input
              id="customer-search"
              label="Tìm kiếm khách hàng"
              placeholder="Họ tên, email, số điện thoại..."
              value={q}
              onChange={(e) => {
                setPage(1)
                setQ(e.target.value)
              }}
            />
            <Select
              id="customer-status-filter"
              label="Trạng thái tài khoản"
              value={status}
              onChange={(e) => {
                setPage(1)
                setStatus(e.target.value)
              }}
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="DISABLED">Đang khóa</option>
            </Select>
          </div>

          {loading ? (
            <Skeleton className="h-64" />
          ) : items.length === 0 ? (
            <EmptyState
              icon="user"
              title="Không tìm thấy khách hàng"
              description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-canvas">
              <table className="w-full min-w-[680px] text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Khách hàng</th>
                    <th className="px-4 py-3 font-semibold">Liên hệ</th>
                    <th className="px-4 py-3 font-semibold">Giao dịch</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((u) => (
                    <tr key={u.id} className="hover:bg-subtle/50">
                      <td className="px-4 py-3">
                        <Text className="font-semibold text-ink">{u.fullName}</Text>
                        <Text className="text-caption text-muted">
                          Tham gia: {formatDate(u.createdAt)}
                        </Text>
                      </td>
                      <td className="px-4 py-3">
                        <Text className="break-all text-small">{u.email}</Text>
                        <Text className="text-caption text-muted">
                          {u.phone || 'Chưa cập nhật SĐT'}
                        </Text>
                      </td>
                      <td className="px-4 py-3 text-caption text-muted">
                        {u.bookingCount} đơn thuê · {u.inquiryCount} yêu cầu mua
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.status === 'ACTIVE' ? 'brand' : 'danger'}>
                          {u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => void openDetail(u.id)}>
                            Hồ sơ
                          </Button>
                          <Button
                            size="sm"
                            variant={u.status === 'ACTIVE' ? 'danger' : 'secondary'}
                            onClick={() =>
                              setConfirmLock({
                                customer: u,
                                nextStatus: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                              })
                            }
                          >
                            {u.status === 'ACTIVE' ? 'Khóa tạm thời' : 'Mở khóa'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
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
        </>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="Chưa có đánh giá nào"
          description="Đánh giá từ khách hàng sau khi hoàn thành chuyến thuê sẽ hiển thị tại đây."
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              data-review-title={r.title ?? r.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-line bg-canvas p-5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading as="h2" size="body" className="font-semibold">
                    {r.title || 'Đánh giá chuyến thuê'}
                  </Heading>
                  <Badge tone="brand">{r.rating} / 5 sao</Badge>
                  <Badge tone={r.status === 'PUBLISHED' ? 'brand' : 'muted'}>
                    {r.status === 'PUBLISHED' ? 'Đang hiển thị' : 'Đang ẩn'}
                  </Badge>
                </div>
                <Text className="text-caption text-muted">
                  {r.customerName} · {r.modelName}
                  {r.vehicleReference ? ` (${r.vehicleReference})` : ''} · {formatDate(r.createdAt)}
                </Text>
                <Text className="text-small text-ink">{r.comment}</Text>
              </div>
              <Button
                size="sm"
                variant={r.status === 'PUBLISHED' ? 'danger' : 'secondary'}
                disabled={busy}
                onClick={() =>
                  void toggleReview(r.id, r.status === 'PUBLISHED' ? 'HIDDEN' : 'PUBLISHED')
                }
              >
                {r.status === 'PUBLISHED' ? 'Ẩn đánh giá' : 'Hiện đánh giá'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Hồ sơ khách hàng: ${detail?.customer.fullName ?? ''}`}
        wide
      >
        {detail && (
          <div className="space-y-5 text-small">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-control bg-subtle p-4">
                <p>
                  <strong>Email:</strong> {detail.customer.email}
                </p>
                <p>
                  <strong>Số điện thoại:</strong> {detail.customer.phone || 'Chưa cập nhật'}
                </p>
                <p>
                  <strong>Trạng thái:</strong>{' '}
                  {detail.customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}
                </p>
              </div>
              <div className="rounded-control border border-line p-4 space-y-2">
                <p>
                  <strong>GPLX:</strong> {detail.customer.driverLicenseNumber || 'Chưa cập nhật'} ·{' '}
                  <strong>CCCD:</strong> {detail.customer.idCardNumber || 'Chưa cập nhật'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span>Xác minh giấy tờ:</span>
                  <select
                    aria-label="Trạng thái xác minh giấy tờ"
                    value={detail.customer.verificationStatus}
                    onChange={async (e) => {
                      const next = e.target.value
                      try {
                        await api('/dashboard/customers', {
                          method: 'PATCH',
                          body: JSON.stringify({
                            entity: 'verification',
                            id: detail.customer.id,
                            verificationStatus: next,
                          }),
                        })
                        setDetail({
                          ...detail,
                          customer: { ...detail.customer, verificationStatus: next },
                        })
                        toast('Đã cập nhật trạng thái xác minh giấy tờ.')
                      } catch (err) {
                        toast((err as Error).message, 'error')
                      }
                    }}
                    className="rounded-control border border-line bg-canvas px-2.5 py-1 text-caption"
                  >
                    <option value="UNVERIFIED">Chưa xác minh</option>
                    <option value="PENDING">Chờ duyệt</option>
                    <option value="VERIFIED">Đã xác minh</option>
                    <option value="REJECTED">Từ chối</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <Text className="mb-2 font-semibold">Lịch sử thuê xe ({detail.bookings.length})</Text>
              {detail.bookings.length === 0 ? (
                <Text className="text-caption text-muted">Chưa có đơn thuê nào.</Text>
              ) : (
                <div className="space-y-2">
                  {detail.bookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between rounded-control border border-line px-3 py-2"
                    >
                      <span>
                        {b.modelName} ({b.reference}) · {formatDate(b.startDate)} →{' '}
                        {formatDate(b.endDate)}
                      </span>
                      <span className="font-semibold">
                        {bookingStatusLabels[b.status] ?? b.status} · {formatMoney(b.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Text className="mb-2 font-semibold">
                Lịch sử yêu cầu mua xe ({detail.inquiries.length})
              </Text>
              {detail.inquiries.length === 0 ? (
                <Text className="text-caption text-muted">Chưa có yêu cầu mua xe nào.</Text>
              ) : (
                <div className="space-y-2">
                  {detail.inquiries.map((inq) => (
                    <div
                      key={inq.id}
                      className="flex flex-wrap items-center justify-between rounded-control border border-line px-3 py-2"
                    >
                      <span>
                        {inq.modelName} ({inq.reference})
                      </span>
                      <span className="font-semibold">
                        {inquiryStatusLabels[inq.status] ?? inq.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(confirmLock)}
        onClose={() => setConfirmLock(null)}
        title={
          confirmLock?.nextStatus === 'DISABLED'
            ? 'Xác nhận khóa tài khoản khách hàng'
            : 'Xác nhận mở khóa tài khoản'
        }
      >
        {confirmLock && (
          <div className="space-y-4">
            <Text className="text-small">
              {confirmLock.nextStatus === 'DISABLED'
                ? `Tài khoản ${confirmLock.customer.email} sẽ không thể đăng nhập hoặc tạo đơn thuê mới cho tới khi được mở khóa.`
                : `Cho phép tài khoản ${confirmLock.customer.email} đăng nhập và sử dụng dịch vụ NORI trở lại?`}
            </Text>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmLock(null)}>
                Hủy
              </Button>
              <Button
                variant={confirmLock.nextStatus === 'DISABLED' ? 'danger' : 'primary'}
                loading={busy}
                onClick={() => void toggleCustomerStatus()}
              >
                Xác nhận
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
