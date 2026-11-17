'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/client-api'
import { formatDate, formatMoney, inquiryStatusLabels, inquiryTypeLabels } from '@/lib/rental-rules'
import type { InquiryView } from '@/lib/domain-types'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

const inquiryTransitions: Record<string, { to: string; label: string }[]> = {
  NEW: [
    { to: 'CONTACTED', label: 'Đã liên hệ' },
    { to: 'TEST_DRIVE_SCHEDULED', label: 'Hẹn xem / lái thử' },
    { to: 'CANCELLED', label: 'Hủy' },
  ],
  CONTACTED: [
    { to: 'TEST_DRIVE_SCHEDULED', label: 'Hẹn xem / lái thử' },
    { to: 'DEPOSIT_PENDING', label: 'Chờ đặt cọc' },
    { to: 'CLOSED', label: 'Đóng yêu cầu' },
  ],
  TEST_DRIVE_SCHEDULED: [
    { to: 'DEPOSIT_PENDING', label: 'Chờ đặt cọc' },
    { to: 'CONTRACT_SIGNED', label: 'Đã ký hồ sơ' },
    { to: 'CLOSED', label: 'Đóng' },
  ],
  DEPOSIT_PENDING: [
    { to: 'CONTRACT_SIGNED', label: 'Đã ký hồ sơ' },
    { to: 'CANCELLED', label: 'Hủy' },
  ],
  CONTRACT_SIGNED: [{ to: 'DELIVERED', label: 'Đã bàn giao xe (khóa xe bán)' }],
}

export function InquiriesPanel() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [items, setItems] = useState<InquiryView[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [status, setStatus] = useState(searchParams.get('status') || '')
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [detail, setDetail] = useState<InquiryView | null>(null)
  const [action, setAction] = useState<{ inquiry: InquiryView; to: string; label: string } | null>(
    null,
  )
  const [adminNote, setAdminNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({
      page: String(page),
      ...(status ? { status } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
    })
    api<{ items: InquiryView[]; totalDocs: number; totalPages: number }>(
      `/dashboard/inquiries?${sp.toString()}`,
    )
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setTotalDocs(res.totalDocs)
        setTotalPages(res.totalPages)
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

  async function confirmInquiry() {
    if (!action) return
    setBusy(true)
    setActionError('')
    try {
      await api('/dashboard/inquiries', {
        method: 'PATCH',
        body: JSON.stringify({
          id: action.inquiry.id,
          status: action.to,
          ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
        }),
      })
      toast(`Đã cập nhật yêu cầu ${action.inquiry.reference} (${action.label}).`)
      setAction(null)
      setDetail(null)
      setAdminNote('')
      setRetry((r) => r + 1)
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Notice tone="info">
        Yêu cầu tư vấn / báo giá / lái thử chỉ trở thành giao dịch bán xe khi hoàn tất quy trình xác
        nhận đặt cọc, ký hồ sơ và bàn giao xe (`CONTRACT_SIGNED → DELIVERED`).
      </Notice>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Input
            id="inquiry-search"
            label="Tìm kiếm yêu cầu"
            placeholder="Mã yêu cầu, khách hàng, SĐT, dòng xe..."
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
          <Select
            id="inquiry-status-filter"
            label="Trạng thái xử lý"
            value={status}
            onChange={(e) => {
              setPage(1)
              setStatus(e.target.value)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(inquiryStatusLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/nori-api/dashboard/export?type=inquiries"
            download
            className="inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3.5 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
          >
            <Icon name="download" className="size-4" />
            Xuất CSV Yêu cầu mua
          </a>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Làm mới
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="bag"
          title="Chưa có yêu cầu mua xe phù hợp"
          description="Khi khách hàng gửi yêu cầu tư vấn, báo giá hoặc hẹn lái thử, hồ sơ sẽ xuất hiện tại đây."
        />
      ) : (
        <div className="space-y-3">
          <Text className="text-caption text-muted">
            Hiển thị {items.length} / {totalDocs} yêu cầu
          </Text>
          {items.map((inq) => {
            const nextSteps = inquiryTransitions[inq.status] ?? []
            return (
              <article
                key={inq.id}
                className="rounded-card border border-line bg-canvas p-5 transition-shadow hover:shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading as="h2" size="body" className="font-semibold">
                        {inq.modelName}
                        {inq.vehicleReference ? ` (${inq.vehicleReference})` : ''}
                      </Heading>
                      <Badge tone="brand">
                        {inquiryTypeLabels[inq.inquiryType] ?? inq.inquiryType}
                      </Badge>
                      <Badge tone="muted">{inquiryStatusLabels[inq.status] ?? inq.status}</Badge>
                      {inq.depositExpired && <Badge tone="danger">Quá hạn giữ cọc</Badge>}
                    </div>
                    <Text className="text-small text-muted">
                      Mã: <strong className="text-ink">{inq.reference}</strong> · Khách:{' '}
                      <strong className="text-ink">{inq.customerName}</strong> · SĐT: {inq.phone}
                    </Text>
                    {inq.note && <Text className="text-small text-ink">Nhu cầu: {inq.note}</Text>}
                    {inq.adminNote && (
                      <Text className="text-caption text-brand">
                        Ghi chú Admin: {inq.adminNote}
                      </Text>
                    )}
                  </div>
                  <div className="text-right">
                    <Text className="text-subtitle font-bold text-ink">
                      {inq.quotedPriceSnapshot ? formatMoney(inq.quotedPriceSnapshot) : 'Tư vấn'}
                    </Text>
                    {inq.estimatedRollingSnapshot && (
                      <Text className="text-caption text-muted">
                        Lăn bánh: {formatMoney(inq.estimatedRollingSnapshot)}
                      </Text>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setDetail(inq)}>
                    <Icon name="eye" className="size-4" />
                    Chi tiết & Lịch sử
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {nextSteps.map((step) => (
                      <Button
                        key={step.to}
                        size="sm"
                        variant={step.to === 'CANCELLED' ? 'danger' : 'secondary'}
                        onClick={() => {
                          setActionError('')
                          setAdminNote(inq.adminNote ?? '')
                          setAction({ inquiry: inq, to: step.to, label: step.label })
                        }}
                      >
                        {step.label}
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

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Chi tiết yêu cầu ${detail?.reference ?? ''}`}
        wide
      >
        {detail && (
          <div className="space-y-4 text-small">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-control bg-subtle p-4">
                <Text className="mb-2 font-semibold">Khách hàng</Text>
                <p>Họ tên: {detail.customerName}</p>
                <p>Email: {detail.customerEmail || 'Chưa cập nhật'}</p>
                <p>SĐT: {detail.phone}</p>
                <p>Ngày hẹn: {detail.preferredDate || 'Chưa hẹn'}</p>
                <p>Địa điểm: {detail.preferredLocation || 'Chưa cập nhật'}</p>
              </div>
              <div className="rounded-control bg-subtle p-4">
                <Text className="mb-2 font-semibold">Thông tin xe quan tâm</Text>
                <p>Dòng xe: {detail.modelName}</p>
                <p>Xe thực tế: {detail.vehicleReference || 'Chưa chọn cụ thể'}</p>
                <p>
                  Phiên bản / Màu:{' '}
                  {[detail.variantName, detail.colorName].filter(Boolean).join(' · ') ||
                    'Chưa chọn'}
                </p>
                <p>Giá bán tham khảo: {formatMoney(detail.quotedPriceSnapshot)}</p>
                <p>Lăn bánh ước tính: {formatMoney(detail.estimatedRollingSnapshot)}</p>
              </div>
            </div>
            <div>
              <Text className="mb-2 font-semibold">Lịch sử cập nhật</Text>
              {detail.statusHistory && detail.statusHistory.length > 0 ? (
                <ul className="space-y-2 border-l-2 border-brand/30 pl-4">
                  {detail.statusHistory.map((h, i) => (
                    <li key={i} className="text-caption">
                      <strong>{inquiryStatusLabels[h.status] ?? h.status}</strong> ·{' '}
                      {formatDate(h.changedAt)}
                      {h.changedBy ? ` · ${h.changedBy}` : ''}
                      {h.note ? ` — ${h.note}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <Text className="text-caption text-muted">Chưa có lịch sử cập nhật chi tiết.</Text>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? action.label : 'Cập nhật yêu cầu mua xe'}
      >
        {action && (
          <div className="space-y-4">
            {actionError && <Notice tone="error">{actionError}</Notice>}
            <Text className="text-small">
              Xác nhận chuyển yêu cầu <strong>{action.inquiry.reference}</strong> sang trạng thái{' '}
              <strong>{action.label}</strong>?
            </Text>
            <Textarea
              id="inquiry-admin-note"
              label="Ghi chú xử lý của Admin"
              rows={3}
              placeholder="Ghi chú nội dung đã tư vấn, lịch hẹn xem xe, hồ sơ đặt cọc..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setAction(null)}>
                Đóng
              </Button>
              <Button
                variant={action.to === 'CANCELLED' ? 'danger' : 'primary'}
                loading={busy}
                onClick={() => void confirmInquiry()}
              >
                Xác nhận cập nhật
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
