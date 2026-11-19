'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  formatDate,
  formatMoney,
  formatVnd,
  paymentMethodLabels,
  paymentStatusLabels,
  paymentTypeLabels,
  reconciliationStatusLabels,
  refundStatusLabels,
} from '@/lib/rental-rules'
import type { PaymentEventView, PaymentItemView, RefundItemView } from '@/lib/domain-types'
import {
  Badge,
  Button,
  Checkbox,
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

type BookingOption = {
  id: string
  bookingKey: string
  reference: string
  totalPrice: number
  status?: string
}

type PaymentConfigState = {
  onlinePaymentEnabled: boolean
  activeProvider: string
  environment: string
  productionApproved: boolean
  providerConfigured: boolean
  providerConfigMessage: string
  missingCredentials: string[]
  allowSepayQr: boolean
  allowManualBankTransfer: boolean
  allowCashOnHandover: boolean
  allowFullPaymentOnline: boolean
  reservationDepositPolicyMode: 'VEHICLE_FIXED' | 'PERCENT_OF_RENTAL'
  reservationDepositPercent: number
  paymentExpiryMinutes: number
  requireDepositBeforeHandover: boolean
  requireSettlementBeforeComplete: boolean
  bankConfig: {
    bankName: string
    bankCode: string
    bankAccountNumber: string
    bankAccountHolder: string
  }
  paymentInstructionNote: string | null
  refundPolicySummary: string | null
}

type DashboardPaymentsResponse = {
  summary: {
    confirmedRevenue: number
    depositCollected: number
    rentalFeeCollected: number
    extraFeeCollected: number
    securityDepositHeld: number
    refundedTotal: number
    pendingRefundTotal: number
    netCollectedRevenue: number
    pendingCount: number
    anomalyCount: number
    totalRecords: number
  }
  items: PaymentItemView[]
  refunds: RefundItemView[]
  events: PaymentEventView[]
  bookings: BookingOption[]
  paymentConfig: PaymentConfigState
}

const typeLabels: Record<string, string> = {
  DEPOSIT: 'Tiền đặt cọc giữ chỗ',
  RENTAL_FEE: 'Tiền thuê xe',
  FULL_PAYMENT: 'Thanh toán toàn bộ tiền thuê',
  SECURITY_DEPOSIT: 'Cọc bảo đảm tài sản (tách riêng)',
  EXTRA_FEE: 'Phụ phí phát sinh',
  PURCHASE_DEPOSIT: 'Đặt cọc mua xe',
  REFUND: 'Hoàn tiền / Hoàn cọc',
}

const methodLabels: Record<string, string> = {
  SEPAY_QR: 'VietQR tự động (SePay)',
  VIETQR: 'Chuyển khoản VietQR',
  BANK_TRANSFER: 'Chuyển khoản ngân hàng',
  CASH: 'Tiền mặt',
  CARD_POS: 'Quẹt thẻ POS',
  GATEWAY: 'Cổng thanh toán trực tuyến',
}

const statusLabels: Record<string, string> = {
  PENDING: 'Chờ thanh toán / đối soát',
  PROCESSING: 'Đang xử lý',
  CONFIRMED: 'Đã xác nhận',
  FAILED: 'Thất bại / Lệch số tiền',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
  PARTIALLY_REFUNDED: 'Đã hoàn một phần',
  REFUNDED: 'Đã hoàn tiền',
}

export function PaymentsPanel() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<
    'transactions' | 'reconciliation' | 'refunds' | 'webhooks' | 'config'
  >('transactions')

  const [items, setItems] = useState<PaymentItemView[]>([])
  const [refunds, setRefunds] = useState<RefundItemView[]>([])
  const [events, setEvents] = useState<PaymentEventView[]>([])
  const [bookings, setBookings] = useState<BookingOption[]>([])
  const [config, setConfig] = useState<PaymentConfigState | null>(null)
  const [summary, setSummary] = useState({
    confirmedRevenue: 0,
    depositCollected: 0,
    rentalFeeCollected: 0,
    extraFeeCollected: 0,
    securityDepositHeld: 0,
    refundedTotal: 0,
    pendingRefundTotal: 0,
    netCollectedRevenue: 0,
    pendingCount: 0,
    anomalyCount: 0,
    totalRecords: 0,
  })

  // Filters
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [anomalyOnly, setAnomalyOnly] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Manual Record Dialog (existing workflow preserved)
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

  // Manual Confirmation with Reason & Evidence Dialog (PAY-025)
  const [confirmTarget, setConfirmTarget] = useState<PaymentItemView | null>(null)
  const [confirmReceivedAmount, setConfirmReceivedAmount] = useState('')
  const [confirmMethod, setConfirmMethod] = useState('BANK_TRANSFER')
  const [confirmTxRef, setConfirmTxRef] = useState('')
  const [confirmReason, setConfirmReason] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Reconciliation Dialog
  const [reconcileTarget, setReconcileTarget] = useState<PaymentItemView | null>(null)
  const [reconcileResolution, setReconcileResolution] = useState<
    'MARK_CONFIRMED' | 'KEEP_PARTIAL_PENDING' | 'RECORD_OVERPAID_FOR_REFUND' | 'DISMISS_ANOMALY'
  >('MARK_CONFIRMED')
  const [reconcileReceivedAmount, setReconcileReceivedAmount] = useState('')
  const [reconcileNote, setReconcileNote] = useState('')
  const [reconcileError, setReconcileError] = useState('')
  const [reconcileBusy, setReconcileBusy] = useState(false)

  // Refund Creation Dialog (PAY-027..031)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundBookingId, setRefundBookingId] = useState('')
  const [refundPaymentId, setRefundPaymentId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundType, setRefundType] = useState<
    | 'DEPOSIT_RETURN'
    | 'PARTIAL_ADJUSTMENT'
    | 'OVERPAYMENT'
    | 'CANCELLATION'
    | 'SECURITY_DEPOSIT_RETURN'
  >('PARTIAL_ADJUSTMENT')
  const [refundReason, setRefundReason] = useState('')
  const [refundBankInfo, setRefundBankInfo] = useState('')
  const [refundTxRef, setRefundTxRef] = useState('')
  const [refundMarkCompleted, setRefundMarkCompleted] = useState(true)
  const [refundError, setRefundError] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)

  // Payment Configuration Form state
  const [cfgOnlineEnabled, setCfgOnlineEnabled] = useState(true)
  const [cfgProvider, setCfgProvider] = useState('SEPAY')
  const [cfgAllowSepayQr, setCfgAllowSepayQr] = useState(true)
  const [cfgAllowManualBank, setCfgAllowManualBank] = useState(true)
  const [cfgAllowCash, setCfgAllowCash] = useState(true)
  const [cfgAllowFullOnline, setCfgAllowFullOnline] = useState(true)
  const [cfgPolicyMode, setCfgPolicyMode] = useState<'VEHICLE_FIXED' | 'PERCENT_OF_RENTAL'>(
    'VEHICLE_FIXED',
  )
  const [cfgDepositPercent, setCfgDepositPercent] = useState('30')
  const [cfgExpiryMinutes, setCfgExpiryMinutes] = useState('30')
  const [cfgRequireDepositHandover, setCfgRequireDepositHandover] = useState(true)
  const [cfgRequireSettlementComplete, setCfgRequireSettlementComplete] = useState(false)
  const [cfgBankName, setCfgBankName] = useState('Vietcombank')
  const [cfgBankCode, setCfgBankCode] = useState('VCB')
  const [cfgBankAccountNumber, setCfgBankAccountNumber] = useState('1017588888')
  const [cfgBankAccountHolder, setCfgBankAccountHolder] = useState(
    'CONG TY TNHH DICH VU PHUONG TIEN NORI',
  )
  const [cfgInstructionNote, setCfgInstructionNote] = useState('')
  const [cfgRefundPolicy, setCfgRefundPolicy] = useState('')
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgError, setCfgError] = useState('')

  function hydrateConfigForm(c: PaymentConfigState) {
    setCfgOnlineEnabled(c.onlinePaymentEnabled)
    setCfgProvider(c.activeProvider)
    setCfgAllowSepayQr(c.allowSepayQr)
    setCfgAllowManualBank(c.allowManualBankTransfer)
    setCfgAllowCash(c.allowCashOnHandover)
    setCfgAllowFullOnline(c.allowFullPaymentOnline)
    setCfgPolicyMode(c.reservationDepositPolicyMode)
    setCfgDepositPercent(String(c.reservationDepositPercent))
    setCfgExpiryMinutes(String(c.paymentExpiryMinutes))
    setCfgRequireDepositHandover(c.requireDepositBeforeHandover)
    setCfgRequireSettlementComplete(c.requireSettlementBeforeComplete)
    setCfgBankName(c.bankConfig.bankName)
    setCfgBankCode(c.bankConfig.bankCode)
    setCfgBankAccountNumber(c.bankConfig.bankAccountNumber)
    setCfgBankAccountHolder(c.bankConfig.bankAccountHolder)
    setCfgInstructionNote(c.paymentInstructionNote ?? '')
    setCfgRefundPolicy(c.refundPolicySummary ?? '')
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (statusFilter) sp.set('status', statusFilter)
    if (methodFilter) sp.set('method', methodFilter)
    if (typeFilter) sp.set('paymentType', typeFilter)
    if (providerFilter) sp.set('provider', providerFilter)
    if (fromDate) sp.set('from', fromDate)
    if (toDate) sp.set('to', toDate)
    if (anomalyOnly) sp.set('anomaly', '1')
    if (q.trim()) sp.set('q', q.trim())

    api<DashboardPaymentsResponse>(`/dashboard/payments?${sp.toString()}`)
      .then((res) => {
        if (!active) return
        setSummary(res.summary)
        setItems(res.items)
        setRefunds(res.refunds ?? [])
        setEvents(res.events ?? [])
        setBookings(res.bookings)
        if (res.paymentConfig) {
          setConfig(res.paymentConfig)
          hydrateConfigForm(res.paymentConfig)
        }
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
  }, [
    statusFilter,
    methodFilter,
    typeFilter,
    providerFilter,
    fromDate,
    toDate,
    anomalyOnly,
    q,
    retry,
  ])

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

  async function handleManualConfirmSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmTarget) return
    setConfirmBusy(true)
    setConfirmError('')
    try {
      await api('/dashboard/payments/confirm', {
        method: 'POST',
        body: JSON.stringify({
          paymentId: confirmTarget.id,
          receivedAmount: Number(confirmReceivedAmount),
          transactionEvidence:
            confirmTxRef.trim() || `${confirmMethod}-${new Date().toISOString().slice(0, 10)}`,
          reason: confirmReason.trim(),
        }),
      })
      toast(`Đã xác nhận thủ công giao dịch ${confirmTarget.reference} và ghi nhận Audit Log.`)
      setConfirmTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      setConfirmError((err as Error).message)
    } finally {
      setConfirmBusy(false)
    }
  }

  async function handleReconcileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reconcileTarget) return
    setReconcileBusy(true)
    setReconcileError('')
    try {
      const targetStatusMap: Record<typeof reconcileResolution, string> = {
        MARK_CONFIRMED: 'CONFIRMED',
        KEEP_PARTIAL_PENDING: 'PARTIALLY_PAID',
        RECORD_OVERPAID_FOR_REFUND: 'CONFIRMED',
        DISMISS_ANOMALY: reconcileTarget.status,
      }
      await api('/dashboard/payments/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          action: 'resolve_anomaly',
          paymentId: reconcileTarget.id,
          targetStatus: targetStatusMap[reconcileResolution],
          reconciliationNote: reconcileNote.trim(),
        }),
      })
      toast(`Đã cập nhật đối soát giao dịch ${reconcileTarget.reference}.`)
      setReconcileTarget(null)
      setRetry((r) => r + 1)
    } catch (err) {
      setReconcileError((err as Error).message)
    } finally {
      setReconcileBusy(false)
    }
  }

  async function handleSweepExpired() {
    try {
      const res = await api<{ expiredCount: number; message: string }>(
        '/dashboard/payments/reconcile',
        {
          method: 'POST',
          body: JSON.stringify({ action: 'sweep_expired' }),
        },
      )
      toast(res.message)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function handleCreateRefund(e: React.FormEvent) {
    e.preventDefault()
    setRefundBusy(true)
    setRefundError('')
    try {
      await api('/dashboard/payments/refund', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          bookingId: refundBookingId,
          paymentId: refundPaymentId || undefined,
          amount: Number(refundAmount),
          refundType,
          reason: refundReason.trim(),
          bankAccountInfo: refundBankInfo.trim() || undefined,
          providerRefundId: refundTxRef.trim() || undefined,
          completeImmediately: refundMarkCompleted && Boolean(refundTxRef.trim()),
        }),
      })
      toast('Đã tạo và xử lý phiếu hoàn tiền thành công.')
      setRefundOpen(false)
      setRefundAmount('')
      setRefundReason('')
      setRefundBankInfo('')
      setRefundTxRef('')
      setRetry((r) => r + 1)
    } catch (err) {
      setRefundError((err as Error).message)
    } finally {
      setRefundBusy(false)
    }
  }

  async function handleTransitionRefund(
    refundId: string,
    action: 'approve' | 'complete' | 'reject',
  ) {
    try {
      await api('/dashboard/payments/refund', {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          refundId,
          reconciliationNote: `Admin thực hiện thao tác hoàn tiền: ${action}`,
        }),
      })
      toast('Đã cập nhật trạng thái phiếu hoàn tiền thành công.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setCfgSaving(true)
    setCfgError('')
    try {
      const updated = await api<PaymentConfigState>('/dashboard/payments/config', {
        method: 'PATCH',
        body: JSON.stringify({
          onlinePaymentEnabled: cfgOnlineEnabled,
          activePaymentProvider: cfgProvider,
          allowSepayQr: cfgAllowSepayQr,
          allowManualBankTransfer: cfgAllowManualBank,
          allowCashOnHandover: cfgAllowCash,
          allowFullPaymentOnline: cfgAllowFullOnline,
          reservationDepositPolicyMode: cfgPolicyMode,
          reservationDepositPercent: Number(cfgDepositPercent),
          paymentExpiryMinutes: Number(cfgExpiryMinutes),
          requireDepositBeforeHandover: cfgRequireDepositHandover,
          requireSettlementBeforeComplete: cfgRequireSettlementComplete,
          bankName: cfgBankName.trim(),
          bankCode: cfgBankCode.trim(),
          bankAccountNumber: cfgBankAccountNumber.trim(),
          bankAccountHolder: cfgBankAccountHolder.trim(),
          paymentInstructionNote: cfgInstructionNote.trim(),
          refundPolicySummary: cfgRefundPolicy.trim(),
        }),
      })
      setConfig(updated)
      hydrateConfigForm(updated)
      toast('Đã lưu cấu hình thanh toán trực tuyến và ghi nhận Audit Log.')
    } catch (err) {
      setCfgError((err as Error).message)
    } finally {
      setCfgSaving(false)
    }
  }

  const anomalyItems = items.filter(
    (p) =>
      p.reconciliationStatus !== 'NONE' || p.status === 'FAILED' || (p.overpaidAmount ?? 0) > 0,
  )

  return (
    <div className="space-y-6">
      {/* Top Financial KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Thực thu đã xác nhận</Text>
          <Text className="mt-1 text-title font-bold text-brand">
            {summary.confirmedRevenue > 0 ? formatMoney(summary.confirmedRevenue) : '0 ₫'}
          </Text>
          <Text className="mt-1 text-micro text-muted">
            Cọc giữ chỗ: {formatMoney(summary.depositCollected)} · Tiền thuê:{' '}
            {formatMoney(summary.rentalFeeCollected)}
          </Text>
        </div>

        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Doanh thu ròng sau hoàn tiền</Text>
          <Text className="mt-1 text-title font-bold text-brand">
            {summary.netCollectedRevenue > 0 ? formatMoney(summary.netCollectedRevenue) : '0 ₫'}
          </Text>
          <Text className="mt-1 text-micro text-muted">
            Tổng đã hoàn tiền / hoàn cọc:{' '}
            {summary.refundedTotal > 0 ? formatMoney(summary.refundedTotal) : '0 ₫'}
          </Text>
        </div>

        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Cọc bảo đảm tài sản đang giữ</Text>
          <Text className="mt-1 text-title font-bold text-ink">
            {summary.securityDepositHeld > 0 ? formatMoney(summary.securityDepositHeld) : '0 ₫'}
          </Text>
          <Text className="mt-1 text-micro text-muted">
            Theo dõi độc lập, không gộp vào doanh thu thuê
          </Text>
        </div>

        <div className="rounded-card border border-line bg-canvas p-5">
          <Text className="text-caption text-muted">Số phiếu thu / chi & Đối soát</Text>
          <Text className="mt-1 text-title font-bold text-ink">{summary.totalRecords}</Text>
          <Text className="mt-1 text-micro text-warning">
            Đang chờ: {summary.pendingCount} · Ngoại lệ cần đối soát: {summary.anomalyCount}
          </Text>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Phân hệ quản lý thanh toán"
        >
          {[
            { id: 'transactions', label: `Giao dịch (${items.length})` },
            { id: 'reconciliation', label: `Đối soát & Ngoại lệ (${anomalyItems.length})` },
            { id: 'refunds', label: `Hoàn tiền (${refunds.length})` },
            { id: 'webhooks', label: `Sự kiện Webhook (${events.length})` },
            { id: 'config', label: 'Cấu hình Thanh toán' },
          ].map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              role="tab"
              aria-selected={activeTab === tab.id}
              variant={activeTab === tab.id ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/nori-api/dashboard/export?type=payments"
            download
            className="inline-flex min-h-control-sm items-center gap-2 rounded-control border border-line bg-canvas px-3 py-2 text-caption font-semibold text-ink hover:border-brand hover:bg-brand-soft"
          >
            <Icon name="download" className="size-4" />
            Xuất CSV Giao dịch
          </a>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setRefundError('')
              if (!refundBookingId && bookings[0]) {
                setRefundBookingId(bookings[0].id)
              }
              setRefundOpen(true)
            }}
          >
            Tạo phiếu hoàn tiền
          </Button>
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
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* TAB 1: TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-card border border-line bg-canvas p-4 sm:grid-cols-2 lg:grid-cols-6">
            <Input
              id="pay-search"
              label="Tìm kiếm giao dịch"
              placeholder="Mã GD, mã đơn, tên khách, mã NH..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
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
            <Select
              id="pay-method-filter"
              label="Phương thức"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="">Tất cả phương thức</option>
              {Object.entries(methodLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Select
              id="pay-type-filter"
              label="Loại thanh toán"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Tất cả loại</option>
              {Object.entries(typeLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              id="pay-from-date"
              label="Từ ngày"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <Input
              id="pay-to-date"
              label="Đến ngày"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox
              id="pay-anomaly-only"
              checked={anomalyOnly}
              onChange={(e) => setAnomalyOnly(e.target.checked)}
              label="Chỉ hiển thị giao dịch chênh lệch / cần đối soát"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => void handleSweepExpired()}>
                Quét & đóng mã QR quá hạn
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>
                Làm mới dữ liệu
              </Button>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-64" />
          ) : items.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="Chưa có giao dịch thanh toán được ghi nhận"
              description="Khi khách hàng đặt cọc VietQR/SePay, thanh toán khi nhận xe hoặc hoàn cọc, giao dịch sẽ hiển thị tại đây."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-canvas">
              <table className="w-full min-w-[880px] text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mã phiếu & Tham chiếu</th>
                    <th className="px-4 py-3 font-semibold">Đơn / Khách hàng</th>
                    <th className="px-4 py-3 font-semibold">Loại & Cổng TT</th>
                    <th className="px-4 py-3 font-semibold">Yêu cầu / Thực nhận</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái & Đối soát</th>
                    <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <Text className="font-semibold">{p.reference}</Text>
                        <Text className="text-micro text-muted">
                          {p.providerPaymentRef ? `Ref: ${p.providerPaymentRef} · ` : ''}
                          {formatDate(p.paidAt || p.createdAt)}
                        </Text>
                        {p.providerTransactionId && (
                          <Text className="text-micro text-brand">
                            Mã NH: {p.providerTransactionId}
                          </Text>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Text className="font-medium">{p.bookingKey || 'Giao dịch độc lập'}</Text>
                        <Text className="text-caption text-muted">
                          {p.customerName || p.recordedBy || '—'}
                        </Text>
                      </td>
                      <td className="px-4 py-3">
                        <Text>
                          {paymentTypeLabels[p.paymentType] ??
                            typeLabels[p.paymentType] ??
                            p.paymentType}
                        </Text>
                        <Text className="text-caption text-muted">
                          {paymentMethodLabels[p.method] ?? methodLabels[p.method] ?? p.method} (
                          {p.provider})
                        </Text>
                      </td>
                      <td className="px-4 py-3">
                        <Text className="font-semibold text-ink">
                          {formatMoney(p.expectedAmount || p.amount)}
                        </Text>
                        {p.receivedAmount > 0 && (
                          <Text className="text-caption text-brand">
                            Thực thu: {formatMoney(p.receivedAmount)}
                          </Text>
                        )}
                        {p.refundedAmount > 0 && (
                          <Text className="text-micro text-warning">
                            Đã hoàn: {formatMoney(p.refundedAmount)}
                          </Text>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={
                              p.status === 'CONFIRMED'
                                ? 'brand'
                                : p.status === 'PENDING' || p.status === 'PROCESSING'
                                  ? 'warning'
                                  : p.status === 'FAILED'
                                    ? 'danger'
                                    : 'muted'
                            }
                          >
                            {paymentStatusLabels[p.status] ?? statusLabels[p.status] ?? p.status}
                          </Badge>
                          {p.reconciliationStatus && p.reconciliationStatus !== 'NONE' && (
                            <Badge tone="danger">
                              {reconciliationStatusLabels[p.reconciliationStatus] ??
                                p.reconciliationStatus}
                            </Badge>
                          )}
                        </div>
                        {p.failureReason && (
                          <Text className="mt-1 text-micro text-danger">{p.failureReason}</Text>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED'].includes(p.status) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setConfirmTarget(p)
                                setConfirmReceivedAmount(String(p.expectedAmount || p.amount))
                                setConfirmMethod(p.method || 'BANK_TRANSFER')
                                setConfirmTxRef(p.providerTransactionId ?? '')
                                setConfirmReason('')
                                setConfirmError('')
                              }}
                            >
                              Xác nhận thu
                            </Button>
                          )}
                          {p.reconciliationStatus && p.reconciliationStatus !== 'NONE' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setReconcileTarget(p)
                                setReconcileReceivedAmount(
                                  String(p.receivedAmount || p.expectedAmount || p.amount),
                                )
                                setReconcileResolution('MARK_CONFIRMED')
                                setReconcileNote(p.reconciliationNote ?? '')
                                setReconcileError('')
                              }}
                            >
                              Đối soát
                            </Button>
                          )}
                          {['CONFIRMED', 'PARTIALLY_REFUNDED'].includes(p.status) &&
                            p.paymentType !== 'REFUND' &&
                            p.bookingId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRefundBookingId(p.bookingId!)
                                  setRefundPaymentId(p.id)
                                  const remainingRefundable = Math.max(
                                    0,
                                    (p.receivedAmount || p.amount) - (p.refundedAmount || 0),
                                  )
                                  setRefundAmount(String(remainingRefundable))
                                  setRefundType('DEPOSIT_RETURN')
                                  setRefundReason('')
                                  setRefundError('')
                                  setRefundOpen(true)
                                }}
                              >
                                Hoàn tiền
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECONCILIATION & EXCEPTIONS */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <Notice tone="info">
            Danh sách các giao dịch có chênh lệch số tiền (Underpaid / Overpaid), thanh toán muộn
            sau khi mã QR hết hạn (Late Payment) hoặc cần kiểm tra thủ công.
          </Notice>
          {anomalyItems.length === 0 ? (
            <EmptyState
              icon="check"
              title="Không có giao dịch ngoại lệ cần đối soát"
              description="Tất cả các giao dịch hiện tại đều khớp số tiền và trạng thái đối soát."
            />
          ) : (
            <div className="space-y-3">
              {anomalyItems.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas p-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text className="font-semibold">{p.reference}</Text>
                      <Badge tone="danger">
                        {reconciliationStatusLabels[p.reconciliationStatus] ??
                          p.reconciliationStatus}
                      </Badge>
                      <Badge tone="muted">{p.bookingKey || 'Không gắn đơn'}</Badge>
                    </div>
                    <Text className="text-caption text-muted">
                      Số tiền yêu cầu: <strong>{formatVnd(p.expectedAmount)}</strong> · Thực nhận:{' '}
                      <strong className="text-brand">{formatVnd(p.receivedAmount)}</strong>
                      {p.overpaidAmount > 0 ? ` · Dư: ${formatVnd(p.overpaidAmount)}` : ''}
                    </Text>
                    {p.failureReason && (
                      <Text className="text-caption text-danger">Ghi nhận: {p.failureReason}</Text>
                    )}
                    {p.reconciliationNote && (
                      <Text className="text-caption text-muted">
                        Ghi chú đối soát: {p.reconciliationNote}
                      </Text>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setReconcileTarget(p)
                        setReconcileReceivedAmount(
                          String(p.receivedAmount || p.expectedAmount || p.amount),
                        )
                        setReconcileResolution('MARK_CONFIRMED')
                        setReconcileNote('')
                        setReconcileError('')
                      }}
                    >
                      Xử lý đối soát
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REFUNDS MANAGEMENT */}
      {activeTab === 'refunds' && (
        <div className="space-y-4">
          {refunds.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="Chưa có phiếu hoàn tiền nào"
              description="Sử dụng nút Tạo phiếu hoàn tiền để hoàn cọc, hoàn tiền một phần hoặc hoàn khoản chuyển dư cho khách hàng."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-canvas">
              <table className="w-full min-w-[780px] text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Mã hoàn tiền</th>
                    <th className="px-4 py-3 font-semibold">Đơn thuê & Giao dịch gốc</th>
                    <th className="px-4 py-3 font-semibold">Loại & Lý do</th>
                    <th className="px-4 py-3 font-semibold">Số tiền hoàn</th>
                    <th className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <Text className="font-semibold">{r.reference}</Text>
                        <Text className="text-micro text-muted">
                          {formatDate(r.completedAt || r.requestedAt || r.createdAt)}
                        </Text>
                      </td>
                      <td className="px-4 py-3">
                        <Text className="font-medium">{r.bookingKey || r.bookingId}</Text>
                        <Text className="text-micro text-muted">
                          GD gốc: {r.paymentReference || r.paymentId || 'Theo đơn'}
                        </Text>
                      </td>
                      <td className="px-4 py-3">
                        <Text className="font-medium">{r.refundType}</Text>
                        <Text className="text-caption text-muted">{r.reason}</Text>
                      </td>
                      <td className="px-4 py-3 font-semibold text-warning">
                        {formatVnd(r.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            r.status === 'REFUNDED'
                              ? 'brand'
                              : r.status === 'FAILED' || r.status === 'REJECTED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {refundStatusLabels[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.status === 'REQUESTED' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleTransitionRefund(r.id, 'approve')}
                              >
                                Duyệt xử lý
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void handleTransitionRefund(r.id, 'complete')}
                              >
                                Hoàn tất chi
                              </Button>
                            </>
                          )}
                          {['APPROVED', 'PROCESSING'].includes(r.status) && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => void handleTransitionRefund(r.id, 'complete')}
                              >
                                Xác nhận đã hoàn tiền
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleTransitionRefund(r.id, 'reject')}
                              >
                                Từ chối
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: WEBHOOK EVENTS AUDIT */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <Notice tone="info">
            Nhật ký toàn bộ các sự kiện Webhook nhận từ cổng thanh toán (SePay / Mock Provider). Mọi
            payload đều đã được lọc bỏ khóa bí mật trước khi lưu trữ.
          </Notice>
          {events.length === 0 ? (
            <EmptyState
              icon="shield"
              title="Chưa có sự kiện Webhook nào"
              description="Khi có callback từ SePay hoặc bộ mô phỏng Mock Sandbox, bản ghi đối soát bất biến sẽ xuất hiện tại đây."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-canvas">
              <table className="w-full min-w-[820px] text-left text-small">
                <thead className="border-b border-line bg-subtle text-caption text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Event ID</th>
                    <th className="px-4 py-3 font-semibold">Provider & Mã GD NH</th>
                    <th className="px-4 py-3 font-semibold">Mã tham chiếu TT</th>
                    <th className="px-4 py-3 font-semibold">Số tiền</th>
                    <th className="px-4 py-3 font-semibold">Xác thực & Xử lý</th>
                    <th className="px-4 py-3 font-semibold">Thời gian / Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td className="px-4 py-3 font-mono text-caption">{ev.eventId}</td>
                      <td className="px-4 py-3">
                        <Text className="font-medium">
                          {ev.provider} ({ev.environment})
                        </Text>
                        <Text className="text-micro text-muted">
                          TxID: {ev.externalTransactionId || '—'}
                        </Text>
                      </td>
                      <td className="px-4 py-3 font-mono text-caption">
                        {ev.paymentReference || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatVnd(ev.transferAmount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={ev.verificationResult === 'VERIFIED' ? 'brand' : 'danger'}>
                            {ev.verificationResult}
                          </Badge>
                          <Badge
                            tone={
                              ev.processingStatus === 'PROCESSED'
                                ? 'brand'
                                : ev.processingStatus === 'IGNORED_DUPLICATE'
                                  ? 'muted'
                                  : 'warning'
                            }
                          >
                            {ev.processingStatus}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-caption text-muted">
                        <div>{new Date(ev.receivedAt).toLocaleString('vi-VN')}</div>
                        {ev.errorReason && (
                          <div className="text-micro text-danger">{ev.errorReason}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PAYMENT CONFIGURATION */}
      {activeTab === 'config' && config && (
        <form
          onSubmit={handleSaveConfig}
          className="space-y-6 rounded-card border border-line bg-canvas p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <Heading as="h2" size="subtitle">
                Cấu hình Cổng thanh toán trực tuyến & Chính sách đặt cọc
              </Heading>
              <Text className="mt-1 text-caption text-muted">
                Quản lý tập trung phương thức thanh toán, tài khoản ngân hàng VietQR/SePay và quy
                tắc kiểm soát bàn giao xe. Khóa bí mật API được bảo vệ riêng qua biến môi trường máy
                chủ.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="muted">Môi trường: {config.environment}</Badge>
              <Badge tone={config.providerConfigured ? 'brand' : 'warning'}>
                {config.providerConfigured ? 'Provider sẵn sàng' : 'Chưa đủ khóa Sandbox/Prod'}
              </Badge>
            </div>
          </div>

          {cfgError && <Notice tone="error">{cfgError}</Notice>}
          <Notice tone="info">{config.providerConfigMessage}</Notice>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              id="cfg-provider"
              label="Nhà cung cấp cổng thanh toán (Provider)"
              value={cfgProvider}
              onChange={(e) => setCfgProvider(e.target.value)}
            >
              <option value="SEPAY">SePay + VietQR tự động</option>
              <option value="MOCK">Mock Payment Provider (Mô phỏng)</option>
              <option value="MANUAL">Chuyển khoản / Tiền mặt thủ công</option>
            </Select>

            <Select
              id="cfg-policy-mode"
              label="Chính sách tính tiền cọc giữ chỗ"
              value={cfgPolicyMode}
              onChange={(e) =>
                setCfgPolicyMode(e.target.value as 'VEHICLE_FIXED' | 'PERCENT_OF_RENTAL')
              }
            >
              <option value="VEHICLE_FIXED">
                Theo mức cọc niêm yết của xe (hoặc % nếu cọc tài sản lớn hơn tiền thuê)
              </option>
              <option value="PERCENT_OF_RENTAL">Theo tỷ lệ % trên tổng tiền thuê</option>
            </Select>

            <Input
              id="cfg-deposit-pct"
              label="Tỷ lệ cọc giữ chỗ (%)"
              type="number"
              min={0}
              max={100}
              value={cfgDepositPercent}
              onChange={(e) => setCfgDepositPercent(e.target.value)}
            />

            <Input
              id="cfg-expiry-mins"
              label="Thời hạn mã thanh toán QR (phút)"
              type="number"
              min={5}
              max={1440}
              value={cfgExpiryMinutes}
              onChange={(e) => setCfgExpiryMinutes(e.target.value)}
            />

            <Input
              id="cfg-bank-name"
              label="Tên ngân hàng thụ hưởng"
              value={cfgBankName}
              onChange={(e) => setCfgBankName(e.target.value)}
            />

            <Input
              id="cfg-bank-code"
              label="Mã ngân hàng VietQR (VD: VCB, MB, TCB)"
              value={cfgBankCode}
              onChange={(e) => setCfgBankCode(e.target.value)}
            />

            <Input
              id="cfg-bank-acc"
              label="Số tài khoản nhận thanh toán"
              value={cfgBankAccountNumber}
              onChange={(e) => setCfgBankAccountNumber(e.target.value)}
            />

            <Input
              id="cfg-bank-holder"
              label="Tên chủ tài khoản"
              wrapperClassName="sm:col-span-2"
              value={cfgBankAccountHolder}
              onChange={(e) => setCfgBankAccountHolder(e.target.value)}
            />
          </div>

          <div className="grid gap-3 rounded-control border border-line bg-subtle p-4 sm:grid-cols-2">
            <Checkbox
              id="cfg-online-enabled"
              checked={cfgOnlineEnabled}
              onChange={(e) => setCfgOnlineEnabled(e.target.checked)}
              label="Bật thanh toán trực tuyến cho đơn thuê đã được duyệt"
            />
            <Checkbox
              id="cfg-allow-sepay"
              checked={cfgAllowSepayQr}
              onChange={(e) => setCfgAllowSepayQr(e.target.checked)}
              label="Cho phép thanh toán qua mã QR động VietQR / SePay"
            />
            <Checkbox
              id="cfg-allow-manual"
              checked={cfgAllowManualBank}
              onChange={(e) => setCfgAllowManualBank(e.target.checked)}
              label="Cho phép chuyển khoản ngân hàng đối soát thủ công"
            />
            <Checkbox
              id="cfg-allow-cash"
              checked={cfgAllowCash}
              onChange={(e) => setCfgAllowCash(e.target.checked)}
              label="Cho phép thanh toán tiền mặt khi bàn giao xe"
            />
            <Checkbox
              id="cfg-allow-full"
              checked={cfgAllowFullOnline}
              onChange={(e) => setCfgAllowFullOnline(e.target.checked)}
              label="Cho phép khách chọn thanh toán 100% tiền thuê trực tuyến"
            />
            <Checkbox
              id="cfg-req-deposit-handover"
              checked={cfgRequireDepositHandover}
              onChange={(e) => setCfgRequireDepositHandover(e.target.checked)}
              label="Bắt buộc xác nhận đủ tiền cọc giữ chỗ trước khi bàn giao xe (ONGOING)"
            />
            <Checkbox
              id="cfg-req-settlement-complete"
              checked={cfgRequireSettlementComplete}
              onChange={(e) => setCfgRequireSettlementComplete(e.target.checked)}
              label="Bắt buộc quyết toán đủ nghĩa vụ tài chính trước khi hoàn thành đơn (COMPLETED)"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              id="cfg-instruction"
              label="Hướng dẫn thanh toán hiển thị cho khách hàng"
              rows={3}
              value={cfgInstructionNote}
              onChange={(e) => setCfgInstructionNote(e.target.value)}
            />
            <Textarea
              id="cfg-refund-policy"
              label="Tóm tắt chính sách hoàn cọc / hoàn tiền"
              rows={3}
              value={cfgRefundPolicy}
              onChange={(e) => setCfgRefundPolicy(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
            <Button
              variant="secondary"
              disabled={cfgSaving}
              onClick={() => hydrateConfigForm(config)}
            >
              Khôi phục
            </Button>
            <Button type="submit" loading={cfgSaving}>
              Lưu cấu hình thanh toán
            </Button>
          </div>
        </form>
      )}

      {/* Existing Create Payment Dialog */}
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

      {/* Manual Confirmation with Reason & Evidence Dialog (PAY-025) */}
      <Dialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title={`Xác nhận thủ công giao dịch ${confirmTarget?.reference ?? ''}`}
      >
        {confirmTarget && (
          <form onSubmit={handleManualConfirmSubmit} className="space-y-4">
            {confirmError && <Notice tone="error">{confirmError}</Notice>}
            <div className="rounded-control bg-subtle p-3.5 text-caption">
              <p>
                Mã phiếu: <strong>{confirmTarget.reference}</strong> · Đơn thuê:{' '}
                <strong>{confirmTarget.bookingKey || 'Độc lập'}</strong>
              </p>
              <p>
                Số tiền yêu cầu: <strong>{formatVnd(confirmTarget.expectedAmount)}</strong>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="manual-confirm-amount"
                label="Số tiền thực nhận (VNĐ)"
                type="number"
                min={1}
                required
                value={confirmReceivedAmount}
                onChange={(e) => setConfirmReceivedAmount(e.target.value)}
              />
              <Select
                id="manual-confirm-method"
                label="Phương thức thực thu"
                value={confirmMethod}
                onChange={(e) => setConfirmMethod(e.target.value)}
              >
                {Object.entries(methodLabels).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              id="manual-confirm-txref"
              label="Mã giao dịch ngân hàng / Số biên lai chứng từ"
              placeholder="VD: FT26320998811 hoặc BL-2026-01"
              value={confirmTxRef}
              onChange={(e) => setConfirmTxRef(e.target.value)}
            />
            <Textarea
              id="manual-confirm-reason"
              label="Lý do xác nhận thủ công & bằng chứng đối chiếu (Bắt buộc)"
              rows={3}
              required
              placeholder="VD: Đã đối chiếu sao kê Vietcombank ngày hôm nay, khách chuyển khoản đúng số tiền..."
              value={confirmReason}
              onChange={(e) => setConfirmReason(e.target.value)}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
                Đóng
              </Button>
              <Button type="submit" loading={confirmBusy}>
                Xác nhận đã thu tiền
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Reconciliation Resolution Dialog */}
      <Dialog
        open={Boolean(reconcileTarget)}
        onClose={() => setReconcileTarget(null)}
        title={`Đối soát giao dịch ${reconcileTarget?.reference ?? ''}`}
      >
        {reconcileTarget && (
          <form onSubmit={handleReconcileSubmit} className="space-y-4">
            {reconcileError && <Notice tone="error">{reconcileError}</Notice>}
            <div className="rounded-control bg-subtle p-3.5 text-caption">
              <p>
                Trạng thái đối soát hiện tại:{' '}
                <strong>
                  {reconciliationStatusLabels[reconcileTarget.reconciliationStatus] ??
                    reconcileTarget.reconciliationStatus}
                </strong>
              </p>
              <p>
                Yêu cầu: <strong>{formatVnd(reconcileTarget.expectedAmount)}</strong> · Đã nhận:{' '}
                <strong>{formatVnd(reconcileTarget.receivedAmount)}</strong>
              </p>
            </div>
            <Select
              id="reconcile-resolution"
              label="Phương án xử lý đối soát"
              value={reconcileResolution}
              onChange={(e) => setReconcileResolution(e.target.value as typeof reconcileResolution)}
            >
              <option value="MARK_CONFIRMED">
                Xác nhận hoàn tất giao dịch & kích hoạt đơn thuê
              </option>
              <option value="KEEP_PARTIAL_PENDING">
                Ghi nhận số tiền đã chuyển thiếu & giữ trạng thái chờ thu bổ sung
              </option>
              <option value="RECORD_OVERPAID_FOR_REFUND">
                Xác nhận giao dịch & đánh dấu khoản thu dư chờ hoàn trả
              </option>
              <option value="DISMISS_ANOMALY">Đóng cờ cảnh báo đối soát (đã xử lý xong)</option>
            </Select>
            <Input
              id="reconcile-received-amount"
              label="Số tiền thực nhận sau đối soát (VNĐ)"
              type="number"
              min={0}
              value={reconcileReceivedAmount}
              onChange={(e) => setReconcileReceivedAmount(e.target.value)}
            />
            <Textarea
              id="reconcile-note"
              label="Biên bản / Ghi chú đối soát (Bắt buộc)"
              rows={3}
              required
              placeholder="Ghi rõ căn cứ đối soát sao kê và phương án thống nhất với khách hàng..."
              value={reconcileNote}
              onChange={(e) => setReconcileNote(e.target.value)}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setReconcileTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" loading={reconcileBusy}>
                Lưu kết quả đối soát
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Refund Creation Dialog (PAY-027..031) */}
      <Dialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Tạo phiếu hoàn tiền / hoàn cọc cho khách hàng"
        wide
      >
        <form onSubmit={handleCreateRefund} className="space-y-4">
          {refundError && <Notice tone="error">{refundError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="refund-booking"
              label="Đơn thuê cần hoàn tiền"
              value={refundBookingId}
              onChange={(e) => {
                setRefundBookingId(e.target.value)
                setRefundPaymentId('')
              }}
            >
              <option value="">-- Chọn đơn thuê --</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bookingKey} ({b.reference}) — {formatMoney(b.totalPrice)}
                </option>
              ))}
            </Select>
            <Select
              id="refund-type"
              label="Loại hoàn tiền"
              value={refundType}
              onChange={(e) => setRefundType(e.target.value as typeof refundType)}
            >
              <option value="DEPOSIT_RETURN">Hoàn tiền cọc / toàn bộ giao dịch</option>
              <option value="PARTIAL_ADJUSTMENT">Hoàn tiền một phần</option>
              <option value="OVERPAYMENT">Hoàn trả khoản khách chuyển dư</option>
              <option value="CANCELLATION">Hoàn tiền do hủy đơn thuê</option>
              <option value="SECURITY_DEPOSIT_RETURN">
                Hoàn trả tiền cọc bảo đảm tài sản sau khi trả xe
              </option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="refund-amount"
              label="Số tiền hoàn trả (VNĐ)"
              type="number"
              min={1}
              required
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
            <Input
              id="refund-tx-ref"
              label="Mã chứng từ / Mã giao dịch hoàn tiền ngân hàng"
              placeholder="VD: REF-VCB-20261120"
              value={refundTxRef}
              onChange={(e) => setRefundTxRef(e.target.value)}
            />
          </div>

          <Input
            id="refund-bank-info"
            label="Thông tin tài khoản ngân hàng nhận hoàn tiền của khách"
            placeholder="Ngân hàng, Số tài khoản, Tên chủ tài khoản nhận..."
            value={refundBankInfo}
            onChange={(e) => setRefundBankInfo(e.target.value)}
          />

          <Textarea
            id="refund-reason"
            label="Lý do hoàn tiền (Bắt buộc)"
            rows={2}
            required
            placeholder="VD: Hoàn trả tiền cọc sau khi tất toán hợp đồng / Hoàn tiền đơn hủy theo chính sách..."
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />

          <Checkbox
            id="refund-complete-now"
            checked={refundMarkCompleted}
            onChange={(e) => setRefundMarkCompleted(e.target.checked)}
            label="Xác nhận đã chuyển khoản hoàn tiền xong (Cập nhật ngay vào số dư đã hoàn và gửi thông báo cho khách)"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={refundBusy}>
              Xác nhận tạo phiếu hoàn tiền
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
