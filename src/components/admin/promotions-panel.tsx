'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  businessToday,
  evaluatePromotion,
  formatDate,
  formatMoney,
  formatVnd,
  getPromotionRuntimeStatus,
  validatePromotionInput,
  type PromoRuntimeStatusInfo,
} from '@/lib/rental-rules'
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

type PromoRow = {
  id: string
  code: string
  name: string
  description: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: number
  maxDiscount: number | null
  minDays: number
  appliesTo: 'ALL' | 'RENT' | 'SALE'
  branchScope?: 'ALL_BRANCHES' | 'SPECIFIC_BRANCHES'
  applicableBranchIds?: string[]
  validFrom: string
  validTo: string
  usageLimit: number | null
  usedCount: number
  remainingUses?: number | null
  active: boolean
  runtimeStatus?: PromoRuntimeStatusInfo['status']
  runtimeStatusLabel?: PromoRuntimeStatusInfo['label']
  runtimeStatusTone?: PromoRuntimeStatusInfo['tone']
}

const scopeLabels: Record<'ALL' | 'RENT' | 'SALE', string> = {
  RENT: 'Thuê xe',
  SALE: 'Mua xe',
  ALL: 'Tất cả dịch vụ',
}

export function PromotionsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<PromoRow[]>([])
  const [branches, setBranches] = useState<{ id: string; code: string; name: string }[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Create / Edit Dialog state
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PromoRow | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('10')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [minDays, setMinDays] = useState('1')
  const [appliesTo, setAppliesTo] = useState<'ALL' | 'RENT' | 'SALE'>('RENT')
  const [branchScope, setBranchScope] = useState<'ALL_BRANCHES' | 'SPECIFIC_BRANCHES'>(
    'ALL_BRANCHES',
  )
  const [applicableBranchIds, setApplicableBranchIds] = useState<string[]>([])
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete confirmation state
  const [deletingPromo, setDeletingPromo] = useState<PromoRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Sample Order Discount Simulator state (Section 4)
  const [simPromoId, setSimPromoId] = useState('')
  const [simOrderAmount, setSimOrderAmount] = useState('3000000')
  const [simRentalDays, setSimRentalDays] = useState('3')
  const [simCheckDate, setSimCheckDate] = useState(() => businessToday())

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api<{ items: PromoRow[]; branches?: { id: string; code: string; name: string }[] }>(
      `/dashboard/promotions?q=${encodeURIComponent(q.trim())}`,
    )
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setBranches(res.branches ?? [])
        setSimPromoId((prev) => {
          if (prev && res.items.some((x) => x.id === prev)) return prev
          return res.items[0]?.id ?? ''
        })
      })
      .catch((e) => {
        if (mounted) setError((e as Error).message)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [q, retry])

  const enrichedItems = useMemo(() => {
    const today = businessToday()
    return items
      .map((p) => {
        const rt = getPromotionRuntimeStatus(
          {
            active: p.active,
            validFrom: p.validFrom || null,
            validTo: p.validTo || null,
            usageLimit: p.usageLimit,
            usedCount: p.usedCount,
          },
          today,
        )
        return {
          ...p,
          runtimeStatus: p.runtimeStatus ?? rt.status,
          runtimeStatusLabel: p.runtimeStatusLabel ?? rt.label,
          runtimeStatusTone: p.runtimeStatusTone ?? rt.tone,
          remainingUses: p.remainingUses !== undefined ? p.remainingUses : rt.remainingUses,
        }
      })
      .filter((p) => !statusFilter || p.runtimeStatus === statusFilter)
  }, [items, statusFilter])

  const simulatedTarget = useMemo(
    () =>
      enrichedItems.find((p) => p.id === simPromoId) ??
      items.find((p) => p.id === simPromoId) ??
      null,
    [enrichedItems, items, simPromoId],
  )

  const simulationResult = useMemo(() => {
    if (!simulatedTarget) return null
    const subtotal = Math.max(0, Math.round(Number(simOrderAmount) || 0))
    const days = Math.max(1, Math.round(Number(simRentalDays) || 1))
    const evalDate = /^\d{4}-\d{2}-\d{2}$/.test(simCheckDate) ? simCheckDate : businessToday()
    return evaluatePromotion(
      {
        code: simulatedTarget.code,
        name: simulatedTarget.name,
        discountType: simulatedTarget.discountType,
        discountValue: simulatedTarget.discountValue,
        maxDiscount: simulatedTarget.maxDiscount,
        minDays: simulatedTarget.minDays,
        appliesTo: simulatedTarget.appliesTo,
        validFrom: simulatedTarget.validFrom || null,
        validTo: simulatedTarget.validTo || null,
        usageLimit: simulatedTarget.usageLimit,
        usedCount: simulatedTarget.usedCount,
        active: simulatedTarget.active,
      },
      {
        code: simulatedTarget.code,
        serviceType: 'RENT',
        totalDays: days,
        subtotalBeforePromo: subtotal,
        today: evalDate,
      },
    )
  }, [simulatedTarget, simOrderAmount, simRentalDays, simCheckDate])

  function openCreate() {
    setEditing(null)
    setCode('')
    setName('')
    setDescription('')
    setDiscountType('PERCENT')
    setDiscountValue('10')
    setMaxDiscount('')
    setMinDays('1')
    setAppliesTo('RENT')
    setBranchScope('ALL_BRANCHES')
    setApplicableBranchIds([])
    setValidFrom('')
    setValidTo('')
    setUsageLimit('')
    setActive(true)
    setFormError('')
    setOpen(true)
  }

  function openEdit(p: PromoRow) {
    setEditing(p)
    setCode(p.code)
    setName(p.name)
    setDescription(p.description)
    setDiscountType(p.discountType)
    setDiscountValue(String(p.discountValue))
    setMaxDiscount(p.maxDiscount != null ? String(p.maxDiscount) : '')
    setMinDays(String(p.minDays))
    setAppliesTo(p.appliesTo)
    setBranchScope(p.branchScope === 'SPECIFIC_BRANCHES' ? 'SPECIFIC_BRANCHES' : 'ALL_BRANCHES')
    setApplicableBranchIds(Array.isArray(p.applicableBranchIds) ? p.applicableBranchIds : [])
    setValidFrom(p.validFrom)
    setValidTo(p.validTo)
    setUsageLimit(p.usageLimit != null ? String(p.usageLimit) : '')
    setActive(p.active)
    setFormError('')
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    const precheck = validatePromotionInput(
      {
        code: editing ? editing.code : code,
        name,
        description,
        discountType,
        discountValue: discountValue.trim() === '' ? NaN : Number(discountValue),
        maxDiscount: maxDiscount.trim() === '' ? null : Number(maxDiscount),
        minDays: minDays.trim() === '' ? 1 : Number(minDays),
        appliesTo,
        validFrom,
        validTo,
        usageLimit: usageLimit.trim() === '' ? null : Number(usageLimit),
        active,
      },
      editing?.usedCount ?? 0,
    )
    if (precheck.error || !precheck.normalized) {
      setFormError(precheck.error ?? 'Vui lòng kiểm tra lại dữ liệu khuyến mãi.')
      return
    }
    const n = precheck.normalized

    setBusy(true)
    try {
      await api('/dashboard/promotions', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { code: n.code }),
          name: n.name,
          description: n.description ?? '',
          discountType: n.discountType,
          discountValue: n.discountValue,
          maxDiscount: n.maxDiscount,
          minDays: n.minDays,
          appliesTo: n.appliesTo,
          branchScope,
          applicableBranchIds: branchScope === 'SPECIFIC_BRANCHES' ? applicableBranchIds : [],
          validFrom: n.validFrom ?? '',
          validTo: n.validTo ?? '',
          usageLimit: n.usageLimit,
          active: n.active,
        }),
      })
      toast(editing ? `Đã cập nhật mã ${editing.code}.` : `Đã tạo mã khuyến mãi ${n.code}.`)
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: PromoRow) {
    try {
      await api('/dashboard/promotions', {
        method: 'PATCH',
        body: JSON.stringify({ id: p.id, active: !p.active }),
      })
      toast(!p.active ? `Đã bật công tắc kích hoạt mã ${p.code}.` : `Đã tạm tắt mã ${p.code}.`)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function confirmDelete() {
    if (!deletingPromo || deleteBusy) return
    setDeleteBusy(true)
    try {
      await api(`/dashboard/promotions?id=${encodeURIComponent(deletingPromo.id)}`, {
        method: 'DELETE',
      })
      toast(`Đã xóa chương trình khuyến mãi ${deletingPromo.code}.`)
      setDeletingPromo(null)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  const parsedFormVal = Number(discountValue)
  const parsedFormMax = Number(maxDiscount)
  const discountValueHint =
    discountType === 'PERCENT'
      ? Number.isSafeInteger(parsedFormVal) && parsedFormVal >= 1 && parsedFormVal <= 100
        ? `Giảm ${parsedFormVal}% trên tiền thuê`
        : 'Nhập từ 1% đến tối đa 100%'
      : Number.isSafeInteger(parsedFormVal) && parsedFormVal > 0
        ? `Định dạng hiển thị: ${formatMoney(parsedFormVal)}`
        : 'Nhập số tiền VNĐ nguyên dương (VD: 50000 → 50.000 ₫)'

  const maxDiscountHint =
    maxDiscount.trim() === ''
      ? 'Để trống nếu không giới hạn mức giảm tối đa'
      : Number.isSafeInteger(parsedFormMax) && parsedFormMax > 0
        ? `Trần giảm tối đa: ${formatMoney(parsedFormMax)}`
        : 'Nhập số nguyên dương VNĐ (VD: 30000 → 30.000 ₫)'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="promo-search"
            label="Tìm kiếm khuyến mãi"
            placeholder="Mã khuyến mãi, tên chương trình..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="promo-runtime-filter"
            label="Trạng thái hiệu lực thực tế"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE_LIVE">Đang diễn ra</option>
            <option value="UPCOMING">Chưa bắt đầu</option>
            <option value="EXPIRED">Hết hạn</option>
            <option value="EXHAUSTED">Hết lượt</option>
            <option value="DISABLED">Vô hiệu hóa</option>
          </Select>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" className="size-4" />
          Tạo mã khuyến mãi
        </Button>
      </div>

      {/* Interactive Promo Discount Simulator */}
      {items.length > 0 && (
        <section
          aria-label="Kiểm tra thử mức giảm khuyến mãi"
          className="rounded-card border border-brand/30 bg-soft p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <Heading as="h2" size="body" className="font-semibold text-ink">
                Kiểm tra thử mức giảm theo giá trị đơn thuê mẫu
              </Heading>
              <Text className="text-micro text-muted">
                Mô phỏng chính xác kết quả kiểm tra điều kiện và số tiền giảm tại Checkout khách
                hàng theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
              </Text>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Select
              id="sim-promo-select"
              label="Chọn chương trình"
              value={simPromoId}
              onChange={(e) => setSimPromoId(e.target.value)}
            >
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
            <Input
              id="sim-order-amount"
              label="Giá trị đơn thuê mẫu (VNĐ)"
              type="number"
              min={0}
              step={10000}
              value={simOrderAmount}
              onChange={(e) => setSimOrderAmount(e.target.value)}
              hint={
                Number.isSafeInteger(Number(simOrderAmount)) && Number(simOrderAmount) >= 0
                  ? formatVnd(Number(simOrderAmount))
                  : undefined
              }
            />
            <Input
              id="sim-rental-days"
              label="Số ngày thuê mẫu"
              type="number"
              min={1}
              max={30}
              value={simRentalDays}
              onChange={(e) => setSimRentalDays(e.target.value)}
            />
            <Input
              id="sim-check-date"
              label="Ngày đặt giả lập"
              type="date"
              value={simCheckDate}
              onChange={(e) => setSimCheckDate(e.target.value)}
            />
          </div>

          {simulationResult && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-control border border-line bg-canvas p-4 text-small">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={simulationResult.valid ? 'brand' : 'danger'}>
                    {simulationResult.valid ? 'Đủ điều kiện áp dụng' : 'Chưa đủ điều kiện'}
                  </Badge>
                  <span className="font-medium text-ink">{simulationResult.message}</span>
                </div>
                <Text className="text-caption text-muted">
                  Tạm tính trước mã:{' '}
                  <strong>{formatVnd(Math.max(0, Math.round(Number(simOrderAmount) || 0)))}</strong>{' '}
                  · Thời lượng:{' '}
                  <strong>{Math.max(1, Math.round(Number(simRentalDays) || 1))} ngày</strong>
                </Text>
              </div>
              <div className="text-right">
                <Text className="text-caption text-muted">
                  Mức giảm:{' '}
                  <strong className="text-brand">
                    -{formatVnd(simulationResult.discountAmount)}
                  </strong>
                </Text>
                <Text className="text-subtitle font-bold text-ink">
                  Sau giảm: {formatVnd(simulationResult.finalTotal)}
                </Text>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : enrichedItems.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="Chưa có chương trình khuyến mãi phù hợp"
          description="Tạo mã khuyến mãi mới hoặc điều chỉnh bộ lọc tìm kiếm để quản lý ưu đãi đặt xe."
        >
          <Button onClick={openCreate}>Tạo mã khuyến mãi</Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrichedItems.map((p) => (
            <article
              key={p.id}
              data-promo-code={p.code}
              className="flex flex-col justify-between rounded-card border border-line bg-canvas p-5"
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="brand">{p.code}</Badge>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={p.runtimeStatusTone ?? 'muted'}>{p.runtimeStatusLabel}</Badge>
                    <Badge tone={p.active ? 'brand' : 'muted'}>
                      {p.active ? 'Công tắc: Bật' : 'Công tắc: Tắt'}
                    </Badge>
                  </div>
                </div>

                <Heading as="h2" size="body" className="font-semibold">
                  {p.name}
                </Heading>

                <Text className="text-small font-semibold text-brand">
                  Giảm{' '}
                  {p.discountType === 'PERCENT'
                    ? `${p.discountValue}%`
                    : formatMoney(p.discountValue)}
                  {p.maxDiscount != null ? ` (tối đa ${formatMoney(p.maxDiscount)})` : ''}
                </Text>

                <div className="space-y-1 rounded-control bg-subtle p-3 text-caption text-muted">
                  <p>
                    Phạm vi:{' '}
                    <strong className="text-ink">{scopeLabels[p.appliesTo] ?? p.appliesTo}</strong>{' '}
                    · Tối thiểu <strong className="text-ink">{p.minDays} ngày</strong>
                  </p>
                  <p>
                    Tổng lượt toàn CT: <strong className="text-ink">{p.usedCount}</strong>
                    {p.usageLimit != null ? ` / ${p.usageLimit}` : ''} · Còn lại:{' '}
                    <strong className="text-ink">
                      {p.remainingUses != null
                        ? `${p.remainingUses} lượt (dùng chung mọi khách)`
                        : 'Không giới hạn'}
                    </strong>
                  </p>
                  <p>
                    Thời hạn:{' '}
                    <strong className="text-ink">
                      {p.validFrom ? formatDate(p.validFrom) : 'Không giới hạn'}
                    </strong>{' '}
                    →{' '}
                    <strong className="text-ink">
                      {p.validTo ? formatDate(p.validTo) : 'Không giới hạn'}
                    </strong>
                  </p>
                </div>

                {p.description && (
                  <Text className="line-clamp-2 text-caption text-muted">{p.description}</Text>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                    Chỉnh sửa
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSimPromoId(p.id)
                      setSimRentalDays(String(Math.max(1, p.minDays)))
                    }}
                  >
                    Thử mức giảm
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => void toggleActive(p)}>
                    {p.active ? 'Tạm tắt' : 'Kích hoạt'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeletingPromo(p)}
                    aria-label={`Xóa mã ${p.code}`}
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create / Edit Promotion Dialog */}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false)
        }}
        title={editing ? `Cập nhật mã ${editing.code}` : 'Tạo mã khuyến mãi mới'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="promo-code"
              label="Mã khuyến mãi"
              required
              disabled={Boolean(editing)}
              placeholder="NORI2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              hint="2–40 ký tự chữ/số không dấu"
            />
            <Input
              id="promo-name"
              label="Tên chương trình"
              required
              wrapperClassName="sm:col-span-2"
              placeholder="Ưu đãi thuê xe cuối tuần..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Select
              id="promo-type"
              label="Hình thức giảm"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FIXED')}
            >
              <option value="PERCENT">Phần trăm (%)</option>
              <option value="FIXED">Số tiền cố định (VNĐ)</option>
            </Select>
            <Input
              id="promo-val"
              label={discountType === 'PERCENT' ? 'Phần trăm giảm (%)' : 'Số tiền giảm (VNĐ)'}
              type="number"
              min={1}
              max={discountType === 'PERCENT' ? 100 : 500000000}
              required
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              hint={discountValueHint}
            />
            <Input
              id="promo-max"
              label="Giảm tối đa (VNĐ, không phải %)"
              type="number"
              min={1}
              placeholder="Không giới hạn"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              hint={
                discountType === 'FIXED'
                  ? 'Thường để trống khi giảm số tiền cố định VNĐ'
                  : maxDiscountHint
              }
            />
            <Select
              id="promo-scope"
              label="Phạm vi áp dụng"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as 'ALL' | 'RENT' | 'SALE')}
            >
              <option value="RENT">Thuê xe</option>
              <option value="SALE">Mua xe</option>
              <option value="ALL">Tất cả dịch vụ</option>
            </Select>
          </div>

          {discountType === 'PERCENT' &&
            maxDiscount.trim() !== '' &&
            Number.isSafeInteger(parsedFormMax) &&
            parsedFormMax > 0 &&
            parsedFormMax < 1000 && (
              <Notice tone="info">
                Lưu ý đơn vị: <strong>Giảm tối đa</strong> được tính bằng <strong>VNĐ</strong> (hiện
                tại là {formatMoney(parsedFormMax)}), không phải phần trăm (%). Nếu muốn trần giảm
                tối đa 300.000 ₫, hãy nhập 300000.
              </Notice>
            )}

          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="promo-mindays"
              label="Số ngày thuê tối thiểu"
              type="number"
              min={1}
              max={365}
              required
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
            />
            <Input
              id="promo-limit"
              label="Tổng lượt dùng toàn CT (mọi khách)"
              type="number"
              min={Math.max(1, editing?.usedCount ?? 1)}
              placeholder="Không giới hạn"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              hint={
                editing
                  ? `Đã dùng: ${editing.usedCount} lượt toàn hệ thống (chưa giới hạn riêng từng khách)`
                  : 'Giới hạn gộp toàn chương trình trên tất cả khách; để trống = không giới hạn'
              }
            />
            <Input
              id="promo-from"
              label="Ngày bắt đầu"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
            <Input
              id="promo-to"
              label="Ngày kết thúc"
              type="date"
              min={validFrom || undefined}
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </div>

          <Textarea
            id="promo-desc"
            label="Mô tả điều kiện chương trình"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {branches.length > 0 && (
            <div className="space-y-2 rounded-control border border-line p-3">
              <Select
                id="promo-branch-scope"
                label="Phạm vi chi nhánh áp dụng"
                value={branchScope}
                onChange={(e) =>
                  setBranchScope(e.target.value as 'ALL_BRANCHES' | 'SPECIFIC_BRANCHES')
                }
              >
                <option value="ALL_BRANCHES">Áp dụng toàn hệ thống (mọi chi nhánh)</option>
                <option value="SPECIFIC_BRANCHES">Chỉ áp dụng cho chi nhánh được chọn</option>
              </Select>
              {branchScope === 'SPECIFIC_BRANCHES' && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {branches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-small">
                      <input
                        type="checkbox"
                        checked={applicableBranchIds.includes(b.id)}
                        onChange={(e) =>
                          setApplicableBranchIds((prev) =>
                            e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                          )
                        }
                        className="size-4"
                      />
                      <span>
                        <strong>{b.code}</strong> — {b.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4"
            />
            Bật công tắc kích hoạt chương trình
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu khuyến mãi
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingPromo)}
        onClose={() => {
          if (!deleteBusy) setDeletingPromo(null)
        }}
        title={`Xác nhận xóa mã ${deletingPromo?.code ?? ''}`}
      >
        <div className="space-y-4 text-small">
          <Text className="text-muted">
            Bạn có chắc chắn muốn xóa chương trình khuyến mãi{' '}
            <strong className="text-ink">{deletingPromo?.code}</strong> ({deletingPromo?.name})? Các
            đơn thuê đã lưu trước đó vẫn giữ nguyên dữ liệu lịch sử giảm giá.
          </Text>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={deleteBusy}
              onClick={() => setDeletingPromo(null)}
            >
              Giữ lại
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Xác nhận xóa
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
