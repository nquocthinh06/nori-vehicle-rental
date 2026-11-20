'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  PRICING_SCOPE_TYPES,
  pricingScopeLabels,
  type PricingScopeType,
  type RevenueSplitMode,
} from '@/lib/multi-branch-rules'
import { formatVnd } from '@/lib/rental-rules'
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
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type PricingRuleRow = {
  id: string
  code: string
  name: string
  scopeType: PricingScopeType
  branchId: string | null
  branchName: string | null
  vehicleModelId: string | null
  vehicleModelName: string | null
  vehicleId: string | null
  vehicleReference: string | null
  dailyPrice: number | null
  weekendSurcharge: number | null
  depositAmount: number | null
  locationSurcharge: number | null
  afterHoursFee: number | null
  validFrom: string
  validTo: string
  priority: number
  active: boolean
}

type OneWayRow = {
  id: string
  routeKey: string
  fromBranchId: string
  fromBranchName: string
  toBranchId: string
  toBranchName: string
  vehicleCategory: 'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP'
  allowed: boolean
  fee: number
  minRentalDays: number
  revenueSplitMode: RevenueSplitMode
  pickupBranchSharePercent: number
  active: boolean
}

type BranchOpt = { id: string; code: string; name: string }
type ModelOpt = { id: string; name: string }
type VehicleOpt = { id: string; reference: string; modelName: string }

export function LocationPricingPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'pricing' | 'oneway'>('pricing')
  const [pricingRules, setPricingRules] = useState<PricingRuleRow[]>([])
  const [oneWayRules, setOneWayRules] = useState<OneWayRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [models, setModels] = useState<ModelOpt[]>([])
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Pricing dialog
  const [pOpen, setPOpen] = useState(false)
  const [pBusy, setPBusy] = useState(false)
  const [pError, setPError] = useState('')
  const [pCode, setPCode] = useState('')
  const [pName, setPName] = useState('')
  const [pScope, setPScope] = useState<PricingScopeType>('MODEL_BRANCH')
  const [pBranchId, setPBranchId] = useState('')
  const [pModelId, setPModelId] = useState('')
  const [pVehicleId, setPVehicleId] = useState('')
  const [pDaily, setPDaily] = useState('')
  const [pWeekend, setPWeekend] = useState('')
  const [pDeposit, setPDeposit] = useState('')
  const [pLocFee, setPLocFee] = useState('')
  const [pValidFrom, setPValidFrom] = useState('')
  const [pValidTo, setPValidTo] = useState('')

  // One-way dialog
  const [owOpen, setOwOpen] = useState(false)
  const [owBusy, setOwBusy] = useState(false)
  const [owError, setOwError] = useState('')
  const [owFrom, setOwFrom] = useState('')
  const [owTo, setOwTo] = useState('')
  const [owCat, setOwCat] = useState<'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP'>('ALL')
  const [owFee, setOwFee] = useState('500000')
  const [owMinDays, setOwMinDays] = useState('1')
  const [owSplit, setOwSplit] = useState<RevenueSplitMode>('PICKUP_BRANCH')
  const [owSharePct, setOwSharePct] = useState('100')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api<{
      pricingRules: PricingRuleRow[]
      oneWayRules: OneWayRow[]
      branches: BranchOpt[]
      models: ModelOpt[]
      vehicles: VehicleOpt[]
    }>('/dashboard/location-pricing')
      .then((res) => {
        if (!mounted) return
        setPricingRules(res.pricingRules ?? [])
        setOneWayRules(res.oneWayRules ?? [])
        setBranches(res.branches ?? [])
        setModels(res.models ?? [])
        setVehicles(res.vehicles ?? [])
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
  }, [retry])

  async function handleSavePricing(e: React.FormEvent) {
    e.preventDefault()
    setPError('')
    setPBusy(true)
    try {
      await api('/dashboard/location-pricing', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'pricing',
          code: pCode.trim().toUpperCase(),
          name: pName.trim(),
          scopeType: pScope,
          branchId: pScope === 'GLOBAL_DEFAULT' ? null : pBranchId || null,
          vehicleModelId: pScope === 'MODEL_BRANCH' ? pModelId || null : null,
          vehicleId: pScope === 'VEHICLE_BRANCH' ? pVehicleId || null : null,
          dailyPrice: pDaily.trim() ? Number(pDaily) : null,
          weekendSurcharge: pWeekend.trim() ? Number(pWeekend) : null,
          depositAmount: pDeposit.trim() ? Number(pDeposit) : null,
          locationSurcharge: pLocFee.trim() ? Number(pLocFee) : null,
          validFrom: pValidFrom || null,
          validTo: pValidTo || null,
        }),
      })
      toast(`Đã tạo quy tắc giá ${pCode.trim().toUpperCase()}.`)
      setPOpen(false)
      setPCode('')
      setPName('')
      setRetry((r) => r + 1)
    } catch (err) {
      setPError((err as Error).message)
    } finally {
      setPBusy(false)
    }
  }

  async function handleSaveOneWay(e: React.FormEvent) {
    e.preventDefault()
    setOwError('')
    setOwBusy(true)
    try {
      await api('/dashboard/location-pricing', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'one-way',
          fromBranchId: owFrom,
          toBranchId: owTo,
          vehicleCategory: owCat,
          allowed: true,
          fee: Number(owFee || 0),
          minRentalDays: Number(owMinDays || 1),
          revenueSplitMode: owSplit,
          pickupBranchSharePercent: Number(owSharePct || 100),
        }),
      })
      toast('Đã tạo chính sách tuyến thuê một chiều.')
      setOwOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setOwError((err as Error).message)
    } finally {
      setOwBusy(false)
    }
  }

  async function handleDelete(entity: 'pricing' | 'one-way', id: string) {
    if (
      !window.confirm(
        'Bạn có chắc chắn muốn xóa quy tắc này? Các đơn thuê đã chốt vẫn giữ nguyên Price Snapshot.',
      )
    )
      return
    try {
      await api(`/dashboard/location-pricing?entity=${entity}&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      toast('Đã xóa quy tắc.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <Notice tone="info">
        Thứ tự ưu tiên tính giá: <strong>Xe cụ thể × Chi nhánh</strong> &gt;{' '}
        <strong>Dòng xe × Chi nhánh</strong> &gt; <strong>Giá cơ sở xe</strong> &gt;{' '}
        <strong>Mặc định chi nhánh</strong> &gt; <strong>Mặc định toàn hệ thống</strong>. Mọi thay
        đổi bảng giá chỉ áp dụng cho đơn mới và không làm thay đổi Price Snapshot của các đơn đã xác
        nhận.
      </Notice>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'pricing' ? 'primary' : 'secondary'}
            onClick={() => setTab('pricing')}
          >
            Bảng giá theo địa điểm ({pricingRules.length})
          </Button>
          <Button
            size="sm"
            variant={tab === 'oneway' ? 'primary' : 'secondary'}
            onClick={() => setTab('oneway')}
          >
            Tuyến thuê một chiều ({oneWayRules.length})
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={branches.length < 2}
            onClick={() => {
              setOwFrom(branches[0]?.id ?? '')
              setOwTo(branches[1]?.id ?? '')
              setOwError('')
              setOwOpen(true)
            }}
          >
            <Icon name="plus" className="size-4" />
            Thêm tuyến một chiều
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setPBranchId(branches[0]?.id ?? '')
              setPModelId(models[0]?.id ?? '')
              setPVehicleId(vehicles[0]?.id ?? '')
              setPError('')
              setPOpen(true)
            }}
          >
            <Icon name="plus" className="size-4" />
            Thêm quy tắc giá
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : tab === 'pricing' ? (
        pricingRules.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="Chưa có quy tắc giá riêng theo chi nhánh"
            description="Khi chưa có quy tắc riêng, hệ thống sử dụng giá thuê cơ sở trên từng xe. Thêm quy tắc mới để áp dụng giá riêng theo chi nhánh hoặc mùa."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pricingRules.map((r) => (
              <article
                key={r.id}
                data-pricing-code={r.code}
                className="rounded-card border border-line bg-canvas p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{r.code}</Badge>
                      <Badge tone="muted">{pricingScopeLabels[r.scopeType]}</Badge>
                      <Badge tone={r.active ? 'brand' : 'muted'}>{r.active ? 'Bật' : 'Tắt'}</Badge>
                    </div>
                    <Heading as="h2" size="body" className="mt-2 font-semibold">
                      {r.name}
                    </Heading>
                    <Text className="text-caption text-muted">
                      {r.branchName ? `Chi nhánh: ${r.branchName}` : 'Toàn hệ thống'}
                      {r.vehicleModelName ? ` · Dòng xe: ${r.vehicleModelName}` : ''}
                      {r.vehicleReference ? ` · Xe: ${r.vehicleReference}` : ''}
                    </Text>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void handleDelete('pricing', r.id)}
                  >
                    Xóa
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-control bg-subtle p-3 text-caption sm:grid-cols-4">
                  <div>
                    <span className="block text-muted">Giá/ngày</span>
                    <strong>{r.dailyPrice != null ? formatVnd(r.dailyPrice) : 'Kế thừa'}</strong>
                  </div>
                  <div>
                    <span className="block text-muted">Cuối tuần</span>
                    <strong>
                      {r.weekendSurcharge != null ? formatVnd(r.weekendSurcharge) : 'Kế thừa'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted">Phụ phí ĐĐ</span>
                    <strong>
                      {r.locationSurcharge != null ? formatVnd(r.locationSurcharge) : '0 ₫'}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted">Cọc</span>
                    <strong>
                      {r.depositAmount != null ? formatVnd(r.depositAmount) : 'Kế thừa'}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : oneWayRules.length === 0 ? (
        <EmptyState
          icon="road"
          title="Chưa cấu hình tuyến trả xe khác chi nhánh"
          description="Hệ thống mặc định chặn trả xe khác chi nhánh nếu chưa có tuyến được cho phép. Hãy thêm tuyến hợp lệ kèm biểu phí và tỷ lệ phân bổ doanh thu."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {oneWayRules.map((r) => (
            <article key={r.id} className="rounded-card border border-line bg-canvas p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={r.allowed && r.active ? 'brand' : 'danger'}>
                      {r.allowed && r.active ? 'Cho phép' : 'Đang chặn'}
                    </Badge>
                    <Badge tone="muted">{r.vehicleCategory}</Badge>
                  </div>
                  <Heading as="h2" size="body" className="mt-2 font-semibold">
                    {r.fromBranchName} → {r.toBranchName}
                  </Heading>
                  <Text className="text-caption text-muted">
                    Phí một chiều: <strong className="text-brand">{formatVnd(r.fee)}</strong> · Tối
                    thiểu <strong>{r.minRentalDays} ngày</strong> · Chia doanh thu CN nhận:{' '}
                    <strong>{r.pickupBranchSharePercent}%</strong>
                  </Text>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleDelete('one-way', r.id)}
                >
                  Xóa
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={pOpen}
        onClose={() => !pBusy && setPOpen(false)}
        title="Thêm quy tắc giá theo địa điểm"
        wide
      >
        <form onSubmit={handleSavePricing} className="space-y-4">
          {pError && <Notice tone="error">{pError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="pr-code"
              label="Mã quy tắc"
              required
              placeholder="PR-HCM-VF8"
              value={pCode}
              onChange={(e) => setPCode(e.target.value.toUpperCase())}
            />
            <Input
              id="pr-name"
              label="Tên quy tắc"
              required
              wrapperClassName="sm:col-span-2"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="pr-scope"
              label="Phạm vi ưu tiên"
              value={pScope}
              onChange={(e) => setPScope(e.target.value as PricingScopeType)}
            >
              {PRICING_SCOPE_TYPES.map((sc) => (
                <option key={sc} value={sc}>
                  {pricingScopeLabels[sc]}
                </option>
              ))}
            </Select>
            {pScope !== 'GLOBAL_DEFAULT' && (
              <Select
                id="pr-br"
                label="Chi nhánh áp dụng"
                required
                value={pBranchId}
                onChange={(e) => setPBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {pScope === 'MODEL_BRANCH' && (
            <Select
              id="pr-model"
              label="Dòng xe áp dụng"
              required
              value={pModelId}
              onChange={(e) => setPModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          {pScope === 'VEHICLE_BRANCH' && (
            <Select
              id="pr-veh"
              label="Phương tiện cụ thể"
              required
              value={pVehicleId}
              onChange={(e) => setPVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reference} · {v.modelName}
                </option>
              ))}
            </Select>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <Input
              id="pr-daily"
              label="Giá/ngày (VNĐ)"
              type="number"
              min={1}
              value={pDaily}
              onChange={(e) => setPDaily(e.target.value)}
            />
            <Input
              id="pr-wknd"
              label="Phụ phí cuối tuần"
              type="number"
              min={0}
              value={pWeekend}
              onChange={(e) => setPWeekend(e.target.value)}
            />
            <Input
              id="pr-loc"
              label="Phụ phí địa điểm"
              type="number"
              min={0}
              value={pLocFee}
              onChange={(e) => setPLocFee(e.target.value)}
            />
            <Input
              id="pr-dep"
              label="Tiền cọc (VNĐ)"
              type="number"
              min={0}
              value={pDeposit}
              onChange={(e) => setPDeposit(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="pr-from"
              label="Hiệu lực từ"
              type="date"
              value={pValidFrom}
              onChange={(e) => setPValidFrom(e.target.value)}
            />
            <Input
              id="pr-to"
              label="Hiệu lực đến"
              type="date"
              min={pValidFrom || undefined}
              value={pValidTo}
              onChange={(e) => setPValidTo(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={pBusy} onClick={() => setPOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={pBusy}>
              Lưu quy tắc giá
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={owOpen}
        onClose={() => !owBusy && setOwOpen(false)}
        title="Thêm tuyến thuê trả khác chi nhánh"
        wide
      >
        <form onSubmit={handleSaveOneWay} className="space-y-4">
          {owError && <Notice tone="error">{owError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="ow-from"
              label="Chi nhánh nhận (A)"
              required
              value={owFrom}
              onChange={(e) => setOwFrom(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
            <Select
              id="ow-to"
              label="Chi nhánh trả (B)"
              required
              value={owTo}
              onChange={(e) => setOwTo(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="ow-cat"
              label="Loại xe"
              value={owCat}
              onChange={(e) => setOwCat(e.target.value as 'ALL' | 'CAR' | 'MOTORBIKE' | 'PICKUP')}
            >
              <option value="ALL">Tất cả loại xe</option>
              <option value="CAR">Ô tô</option>
              <option value="MOTORBIKE">Xe máy</option>
              <option value="PICKUP">Bán tải</option>
            </Select>
            <Input
              id="ow-fee"
              label="Phí một chiều (VNĐ)"
              type="number"
              min={0}
              required
              value={owFee}
              onChange={(e) => setOwFee(e.target.value)}
            />
            <Input
              id="ow-min"
              label="Ngày thuê tối thiểu"
              type="number"
              min={1}
              required
              value={owMinDays}
              onChange={(e) => setOwMinDays(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="ow-split"
              label="Nguyên tắc ghi nhận doanh thu"
              value={owSplit}
              onChange={(e) => {
                const v = e.target.value as RevenueSplitMode
                setOwSplit(v)
                if (v === 'PICKUP_BRANCH') setOwSharePct('100')
                else if (v === 'RETURN_BRANCH') setOwSharePct('0')
                else if (v === 'SPLIT_50_50') setOwSharePct('50')
              }}
            >
              <option value="PICKUP_BRANCH">100% chi nhánh nhận (A)</option>
              <option value="RETURN_BRANCH">100% chi nhánh trả (B)</option>
              <option value="SPLIT_50_50">Chia đều 50% / 50%</option>
              <option value="CUSTOM_PERCENT">Tỷ lệ tùy chỉnh</option>
            </Select>
            <Input
              id="ow-pct"
              label="Tỷ lệ doanh thu CN nhận (%)"
              type="number"
              min={0}
              max={100}
              value={owSharePct}
              onChange={(e) => setOwSharePct(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={owBusy} onClick={() => setOwOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={owBusy}>
              Lưu tuyến một chiều
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
