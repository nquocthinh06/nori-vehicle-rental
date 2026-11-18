'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate, formatMoney } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  EmptyState,
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

type PaymentRow = {
  id: string
  reference: string
  paymentType: string
  method: string
  amount: number
  status: string
  paidAt: string
  recordedBy: string | null
  note: string | null
  bookingKey: string | null
  customerName: string | null
}

type BookingOption = {
  id: string
  bookingKey: string
  reference: string
  totalPrice: number
  status?: string
}

const typeLabels: Record<string, string> = {
  DEPOSIT: 'Tiền đặt cọc',
  RENTAL_FEE: 'Tiền thuê xe',
  EXTRA_FEE: 'Phụ phí phát sinh',
  PURCHASE_DEPOSIT: 'Đặt cọc mua xe',
  REFUND: 'Hoàn tiền / Hoàn cọc',
}
const methodLabels: Record<string, string> = {
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  CASH: 'Tiền mặt',
  CARD_POS: 'Quẹt thẻ POS',
}
const statusLabels: Record<string, string> = {
  PENDING: 'Chờ đối soát',
  CONFIRMED: 'Đã xác nhận',
  REFUNDED: 'Đã hoàn tiền',
  CANCELLED: 'Đã hủy',
}

export function PaymentsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<PaymentRow[]>([])
  const [bookings, setBookings] = useState<BookingOption[]>([])
  const [summary, setSummary] = useState({ confirmedRevenue: 0, refundedTotal: 0, totalRecords: 0 })
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [bookingId, setBookingId] = useState('')
  const [paymentType, setPaymentType] = useState('DEPOSIT')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('CONFIRMED')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api<{
      summary: { confirmedRevenue: number; refundedTotal: number; totalRecords: number }
      items: PaymentRow[]
      bookings: BookingOption[]
    }>(`/dashboard/payments?status=${encodeURIComponent(statusFilter)}`)
      .then((res) => {
        if (!active) return
        setSummary(res.summary)
        setItems(res.items)
        setBookings(res.bookings)
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
  }, [statusFilter, retry])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await api('/dashboard/payments', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: bookingId || undefined,
          paymentType,
          method,
          amount: Number(amount),
          status,
          paidAt,
          note,
        }),
      })
      toast('Đã ghi nhận phiếu giao dịch thanh toán.')
      setOpen(false)
      setAmount('')
      setNote('')
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(id: string, nextStatus: string) {
    try {
      await api('/dashboard/payments', {
        method: 'PATCH',
        body: JSON.stringify({ id, status: nextStatus }),
      })
      toast('Đã cập nhật trạng thái giao dịch.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Thực thu đã xác nhận</Text>
          <Text className="mt-1 text-title font-bold text-brand">
            {summary.confirmedRevenue > 0 ? formatMoney(summary.confirmedRevenue) : '0 ₫'}
          </Text>
        </div>
        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Tổng đã hoàn tiền / hoàn cọc</Text>
          <Text className="mt-1 text-title font-bold text-ink">
            {summary.refundedTotal > 0 ? formatMoney(summary.refundedTotal) : '0 ₫'}
          </Text>
        </div>
        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Số phiếu thu / chi</Text>
          <Text className="mt-1 text-title font-bold text-ink">{summary.totalRecords}</Text>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="w-full max-w-xs">
          <Select
            id="pay-filter"
            label="Lọc trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setFormError('')
            setOpen(true)
          }}
        >
          <Icon name="plus" className="size-4" />
          Ghi nhận thanh toán / hoàn tiền
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="Chưa có giao dịch thanh toán được ghi nhận"
          description="Khi khách hàng đặt cọc, thanh toán khi nhận xe hoặc hoàn cọc, ghi nhận phiếu tại đây để đồng bộ doanh thu thực thu."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-canvas">
          <table className="w-full min-w-[740px] text-left text-small">
            <thead className="border-b border-line bg-subtle text-caption text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Mã phiếu</th>
                <th className="px-4 py-3 font-semibold">Đơn / Khách hàng</th>
                <th className="px-4 py-3 font-semibold">Loại & Phương thức</th>
                <th className="px-4 py-3 font-semibold">Số tiền</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Text className="font-semibold">{p.reference}</Text>
                    <Text className="text-caption text-muted">{formatDate(p.paidAt)}</Text>
                  </td>
                  <td className="px-4 py-3">
                    <Text>{p.bookingKey || 'Giao dịch độc lập'}</Text>
                    <Text className="text-caption text-muted">
                      {p.customerName || p.recordedBy || '—'}
                    </Text>
                  </td>
                  <td className="px-4 py-3">
                    <Text>{typeLabels[p.paymentType] ?? p.paymentType}</Text>
                    <Text className="text-caption text-muted">
                      {methodLabels[p.method] ?? p.method}
                    </Text>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatMoney(p.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        p.status === 'CONFIRMED'
                          ? 'brand'
                          : p.status === 'PENDING'
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {statusLabels[p.status] ?? p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void updateStatus(p.id, 'CONFIRMED')}
                      >
                        Xác nhận thu
                      </Button>
                    )}
                    {p.status === 'CONFIRMED' && p.paymentType !== 'REFUND' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void updateStatus(p.id, 'REFUNDED')}
                      >
                        Đánh dấu hoàn tiền
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ghi nhận giao dịch thanh toán / hoàn tiền"
        wide
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="pay-booking"
              label="Đơn thuê liên quan (tùy chọn)"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
            >
              <option value="">-- Không gắn đơn cụ thể --</option>
              {bookings
                .filter(
                  (b) =>
                    paymentType === 'REFUND' || !['CANCELLED', 'REJECTED'].includes(b.status ?? ''),
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bookingKey} ({b.reference}) — {formatMoney(b.totalPrice)}
                  </option>
                ))}
            </Select>
            <Select
              id="pay-type"
              label="Loại giao dịch"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              {Object.entries(typeLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="pay-method"
              label="Phương thức"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {Object.entries(methodLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              id="pay-amount"
              label="Số tiền (VNĐ)"
              type="number"
              min={1}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              id="pay-date"
              label="Ngày giao dịch"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <Select
            id="pay-status"
            label="Trạng thái"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(statusLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Textarea
            id="pay-note"
            label="Ghi chú chứng từ / mã giao dịch ngân hàng"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu giao dịch
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
