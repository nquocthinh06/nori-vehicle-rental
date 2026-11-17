'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatMoney } from '@/lib/rental-rules'
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
  validFrom: string
  validTo: string
  usageLimit: number | null
  usedCount: number
  active: boolean
}

export function PromotionsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<PromoRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

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
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api<{ items: PromoRow[] }>(`/dashboard/promotions?q=${encodeURIComponent(q.trim())}`)
      .then((res) => {
        if (mounted) setItems(res.items)
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
    setValidFrom(p.validFrom)
    setValidTo(p.validTo)
    setUsageLimit(p.usageLimit != null ? String(p.usageLimit) : '')
    setActive(p.active)
    setFormError('')
    setOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await api('/dashboard/promotions', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : { code }),
          name,
          description,
          discountType,
          discountValue: Number(discountValue),
          maxDiscount: maxDiscount ? Number(maxDiscount) : null,
          minDays: Number(minDays) || 1,
          appliesTo,
          validFrom,
          validTo,
          usageLimit: usageLimit ? Number(usageLimit) : null,
          active,
        }),
      })
      toast(
        editing ? `Đã cập nhật mã ${editing.code}.` : `Đã tạo mã khuyến mãi ${code.toUpperCase()}.`,
      )
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
      toast(!p.active ? `Đã kích hoạt mã ${p.code}.` : `Đã tạm tắt mã ${p.code}.`)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="w-full max-w-sm">
          <Input
            id="promo-search"
            label="Tìm kiếm khuyến mãi"
            placeholder="Mã khuyến mãi, tên chương trình..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" className="size-4" />
          Tạo mã khuyến mãi
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="Chưa có chương trình khuyến mãi"
          description="Tạo mã khuyến mãi để áp dụng giảm giá tự động tại Backend khi khách hàng đặt thuê xe."
        >
          <Button onClick={openCreate}>Tạo mã khuyến mãi đầu tiên</Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <article
              key={p.id}
              className="flex flex-col justify-between rounded-card border border-line bg-canvas p-5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="brand">{p.code}</Badge>
                  <Badge tone={p.active ? 'brand' : 'muted'}>
                    {p.active ? 'Đang bật' : 'Tạm tắt'}
                  </Badge>
                </div>
                <Heading as="h2" size="body" className="font-semibold">
                  {p.name}
                </Heading>
                <Text className="text-small font-semibold text-brand">
                  Giảm{' '}
                  {p.discountType === 'PERCENT'
                    ? `${p.discountValue}%`
                    : formatMoney(p.discountValue)}
                  {p.maxDiscount ? ` (tối đa ${formatMoney(p.maxDiscount)})` : ''}
                </Text>
                <Text className="text-caption text-muted">
                  Tối thiểu {p.minDays} ngày · Đã dùng: {p.usedCount}
                  {p.usageLimit != null ? ` / ${p.usageLimit}` : ''}
                </Text>
                {(p.validFrom || p.validTo) && (
                  <Text className="text-caption text-muted">
                    Hiệu lực: {p.validFrom || '—'} → {p.validTo || '—'}
                  </Text>
                )}
              </div>
              <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                  Chỉnh sửa
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleActive(p)}>
                  {p.active ? 'Tạm tắt' : 'Kích hoạt'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Cập nhật mã ${editing.code}` : 'Tạo mã khuyến mãi mới'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="promo-code"
              label="Mã khuyến mãi"
              required
              disabled={Boolean(editing)}
              placeholder="NORI2026"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <Input
              id="promo-name"
              label="Tên chương trình"
              required
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
              label="Giá trị giảm"
              type="number"
              min={1}
              required
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
            <Input
              id="promo-max"
              label="Giảm tối đa (VNĐ)"
              type="number"
              min={0}
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
            />
            <Input
              id="promo-mindays"
              label="Số ngày tối thiểu"
              type="number"
              min={1}
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="promo-from"
              label="Từ ngày"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
            <Input
              id="promo-to"
              label="Đến ngày"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
            <Input
              id="promo-limit"
              label="Giới hạn lượt dùng"
              type="number"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
            />
          </div>
          <Textarea
            id="promo-desc"
            label="Mô tả điều kiện"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4"
            />
            Kích hoạt ngay
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu khuyến mãi
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
