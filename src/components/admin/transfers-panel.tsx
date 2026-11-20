'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import {
  TRANSFER_STATUSES,
  transferStatusLabels,
  type TransferStatus,
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
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type TransferRow = {
  id: string
  transferCode: string
  vehicleId: string
  vehicleReference: string
  fromBranchId: string
  fromBranchName: string
  fromWarehouseId: string
  fromWarehouseName: string
  toBranchId: string
  toBranchName: string
  toWarehouseId: string
  toWarehouseName: string
  reason: string
  startDate: string
  endDate: string
  scheduledDepartureAt: string
  scheduledArrivalAt: string
  assignedStaffName: string | null
  transferCost: number
  status: TransferStatus
  odometerBefore: number | null
  odometerAfter: number | null
  conditionBefore: string
  conditionAfter: string
  exceptionNote: string
  delayedWarning: boolean
  affectedBookingKeys: string[]
  revision: number
}

type BranchOpt = { id: string; code: string; name: string; status: string }
type WarehouseOpt = { id: string; code: string; name: string; branchId: string; status: string }
type VehicleOpt = {
  id: string
  reference: string
  modelName: string
  operationStatus: string
  currentBranchId: string | null
  currentWarehouseId: string | null
  odometer: number | null
}
type StaffOpt = { id: string; email: string; fullName: string }

function statusTone(st: TransferStatus): 'brand' | 'warning' | 'danger' | 'muted' {
  if (st === 'COMPLETED' || st === 'APPROVED') return 'brand'
  if (st === 'IN_TRANSIT' || st === 'ARRIVED' || st === 'PENDING_APPROVAL') return 'warning'
  if (st === 'EXCEPTION' || st === 'REJECTED') return 'danger'
  return 'muted'
}

export function TransfersPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<TransferRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([])
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([])
  const [staff, setStaff] = useState<StaffOpt[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Create modal
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [reason, setReason] = useState('')
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [assignedStaffId, setAssignedStaffId] = useState('')
  const [transferCost, setTransferCost] = useState('0')
  const [conditionBefore, setConditionBefore] = useState('')

  // Transition dialog
  const [actionTarget, setActionTarget] = useState<{
    row: TransferRow
    nextStatus: TransferStatus
    label: string
  } | null>(null)
  const [actOdo, setActOdo] = useState('')
  const [actNote, setActNote] = useState('')
  const [actBusy, setActBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    const sp = new URLSearchParams()
    if (statusFilter) sp.set('status', statusFilter)
    if (q.trim()) sp.set('q', q.trim())
    api<{
      items: TransferRow[]
      branches: BranchOpt[]
      warehouses: WarehouseOpt[]
      vehicles: VehicleOpt[]
      staff: StaffOpt[]
    }>(`/dashboard/transfers?${sp.toString()}`)
      .then((res) => {
        if (!mounted) return
        setItems(res.items)
        setBranches(res.branches ?? [])
        setWarehouses(res.warehouses ?? [])
        setVehicles(res.vehicles ?? [])
        setStaff(res.staff ?? [])
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
  }, [statusFilter, q, retry])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setBusy(true)
    try {
      const selectedStaff = staff.find((s) => s.id === assignedStaffId)
      await api('/dashboard/transfers', {
        method: 'POST',
        body: JSON.stringify({
          vehicleId,
          toBranchId,
          toWarehouseId,
          reason: reason.trim(),
          scheduledDepartureAt: `${departureDate}T08:00:00.000Z`,
          scheduledArrivalAt: `${arrivalDate}T18:00:00.000Z`,
          assignedStaffId: assignedStaffId || null,
          assignedStaffName: selectedStaff?.fullName ?? null,
          transferCost: Number(transferCost || 0),
          conditionBefore: conditionBefore.trim() || null,
          submitForApproval: true,
        }),
      })
      toast('Đã tạo phiếu điều chuyển xe và gửi phê duyệt.')
      setOpen(false)
      setReason('')
      setConditionBefore('')
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleTransition(e: React.FormEvent) {
    e.preventDefault()
    if (!actionTarget) return
    setActBusy(true)
    try {
      const { row, nextStatus } = actionTarget
      await api('/dashboard/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          transferId: row.id,
          nextStatus,
          expectedRevision: row.revision,
          note: actNote.trim() || null,
          ...(nextStatus === 'IN_TRANSIT' && actOdo ? { odometerBefore: Number(actOdo) } : {}),
          ...((nextStatus === 'ARRIVED' || nextStatus === 'COMPLETED') && actOdo
            ? { odometerAfter: Number(actOdo) }
            : {}),
          ...(nextStatus === 'EXCEPTION'
            ? { exceptionNote: actNote.trim() || 'Phát sinh sự cố vận chuyển' }
            : {}),
          ...(nextStatus === 'COMPLETED' && actNote.trim()
            ? { conditionAfter: actNote.trim() }
            : {}),
        }),
      })
      toast(`Đã chuyển phiếu ${row.transferCode} sang "${transferStatusLabels[nextStatus]}".`)
      setActionTarget(null)
      setActOdo('')
      setActNote('')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setActBusy(false)
    }
  }

  const destWarehouses = warehouses.filter(
    (w) => w.branchId === toBranchId && w.status === 'ACTIVE',
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
          <Input
            id="trf-search"
            label="Tìm phiếu điều chuyển"
            placeholder="Mã phiếu, mã xe, lý do, nhân viên..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            id="trf-status-filter"
            label="Trạng thái điều chuyển"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {TRANSFER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {transferStatusLabels[st]}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setFormError('')
            setVehicleId(vehicles.find((v) => v.currentWarehouseId)?.id ?? '')
            setToBranchId(branches[0]?.id ?? '')
            setToWarehouseId('')
            setOpen(true)
          }}
        >
          <Icon name="plus" className="size-4" />
          Tạo phiếu điều chuyển
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="road"
          title="Chưa có phiếu điều chuyển phương tiện"
          description="Tạo phiếu điều chuyển liên chi nhánh/kho với khóa lịch toàn cục, biên bản giao nhận và xác nhận 2 chiều."
        />
      ) : (
        <div className="space-y-4">
          {items.map((t) => (
            <article
              key={t.id}
              data-transfer-code={t.transferCode}
              className="rounded-card border border-line bg-canvas p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{t.transferCode}</Badge>
                    <Badge tone={statusTone(t.status)}>{transferStatusLabels[t.status]}</Badge>
                    <Badge tone="muted">Xe: {t.vehicleReference}</Badge>
                    {t.delayedWarning && <Badge tone="danger">Cảnh báo trễ lịch</Badge>}
                  </div>
                  <Heading as="h2" size="body" className="mt-2 font-semibold text-ink">
                    {t.fromBranchName} ({t.fromWarehouseName}) → {t.toBranchName} (
                    {t.toWarehouseName})
                  </Heading>
                  <Text className="text-caption text-muted">
                    Lịch dự kiến: <strong>{t.startDate}</strong> → <strong>{t.endDate}</strong> · Lý
                    do: {t.reason}
                  </Text>
                </div>
                <div className="text-right text-caption text-muted">
                  <p>
                    Chi phí nội bộ:{' '}
                    <strong className="text-ink">{formatVnd(t.transferCost)}</strong>
                  </p>
                  <p>
                    Nhân viên:{' '}
                    <strong className="text-ink">{t.assignedStaffName || 'Chưa phân công'}</strong>
                  </p>
                </div>
              </div>

              {t.affectedBookingKeys.length > 0 && (
                <Notice tone="error" className="mt-3">
                  Đơn thuê có nguy cơ bị ảnh hưởng do trễ lịch:{' '}
                  <strong>{t.affectedBookingKeys.join(', ')}</strong>
                </Notice>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <Text className="text-micro text-muted">
                  ODO xuất: {t.odometerBefore ?? '—'} km · ODO nhận: {t.odometerAfter ?? '—'} km ·
                  Rev #{t.revision}
                </Text>
                <div className="flex flex-wrap gap-2">
                  {t.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setActionTarget({
                          row: t,
                          nextStatus: 'PENDING_APPROVAL',
                          label: 'Gửi phê duyệt',
                        })
                      }
                    >
                      Gửi phê duyệt
                    </Button>
                  )}
                  {t.status === 'PENDING_APPROVAL' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'APPROVED',
                            label: 'Phê duyệt & Khóa lịch',
                          })
                        }
                      >
                        Phê duyệt
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'REJECTED',
                            label: 'Từ chối phiếu',
                          })
                        }
                      >
                        Từ chối
                      </Button>
                    </>
                  )}
                  {t.status === 'APPROVED' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'IN_TRANSIT',
                            label: 'Xác nhận xuất kho',
                          })
                        }
                      >
                        Xuất kho điều chuyển
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'CANCELLED',
                            label: 'Hủy phiếu trước xuất kho',
                          })
                        }
                      >
                        Hủy phiếu
                      </Button>
                    </>
                  )}
                  {t.status === 'IN_TRANSIT' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'ARRIVED',
                            label: 'Xác nhận xe đã đến kho đích',
                          })
                        }
                      >
                        Đã đến kho đích
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setActionTarget({
                            row: t,
                            nextStatus: 'EXCEPTION',
                            label: 'Báo sự cố ngoại lệ',
                          })
                        }
                      >
                        Báo sự cố
                      </Button>
                    </>
                  )}
                  {(t.status === 'ARRIVED' || t.status === 'EXCEPTION') && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setActionTarget({
                          row: t,
                          nextStatus: 'COMPLETED',
                          label: 'Hoàn tất tiếp nhận vào kho đích',
                        })
                      }
                    >
                      Hoàn tất nhập kho đích
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Tạo phiếu điều chuyển phương tiện"
        wide
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <Select
            id="trf-veh"
            label="Phương tiện điều chuyển"
            required
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            <option value="">-- Chọn xe đã phân bổ kho --</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.reference} · {v.modelName} ({v.operationStatus})
              </option>
            ))}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="trf-to-br"
              label="Chi nhánh nhận"
              required
              value={toBranchId}
              onChange={(e) => {
                setToBranchId(e.target.value)
                setToWarehouseId('')
              }}
            >
              <option value="">-- Chọn chi nhánh nhận --</option>
              {branches
                .filter((b) => b.status === 'ACTIVE')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
            </Select>
            <Select
              id="trf-to-wh"
              label="Kho nhận"
              required
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
            >
              <option value="">-- Chọn kho nhận --</option>
              {destWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="trf-dep"
              label="Ngày xuất dự kiến"
              type="date"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
            <Input
              id="trf-arr"
              label="Ngày đến dự kiến"
              type="date"
              required
              min={departureDate}
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
            <Input
              id="trf-cost"
              label="Chi phí nội bộ (VNĐ)"
              type="number"
              min={0}
              value={transferCost}
              onChange={(e) => setTransferCost(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="trf-reason"
              label="Lý do điều chuyển"
              required
              placeholder="Cân bằng tồn kho / phục vụ đơn thuê..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Select
              id="trf-staff"
              label="Nhân viên phụ trách vận chuyển"
              value={assignedStaffId}
              onChange={(e) => setAssignedStaffId(e.target.value)}
            >
              <option value="">-- Chưa phân công --</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.email})
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            id="trf-cond"
            label="Tình trạng xe trước khi xuất kho"
            rows={2}
            value={conditionBefore}
            onChange={(e) => setConditionBefore(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Tạo phiếu điều chuyển
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(actionTarget)}
        onClose={() => !actBusy && setActionTarget(null)}
        title={actionTarget ? `${actionTarget.label} — ${actionTarget.row.transferCode}` : ''}
      >
        <form onSubmit={handleTransition} className="space-y-4">
          {actionTarget &&
            ['IN_TRANSIT', 'ARRIVED', 'COMPLETED'].includes(actionTarget.nextStatus) && (
              <Input
                id="trf-act-odo"
                label={
                  actionTarget.nextStatus === 'IN_TRANSIT'
                    ? 'ODO lúc xuất kho (km)'
                    : 'ODO lúc tiếp nhận (km)'
                }
                type="number"
                min={0}
                value={actOdo}
                onChange={(e) => setActOdo(e.target.value)}
              />
            )}
          <Textarea
            id="trf-act-note"
            label="Ghi chú biên bản / Tình trạng xe"
            rows={3}
            required={actionTarget?.nextStatus === 'EXCEPTION'}
            value={actNote}
            onChange={(e) => setActNote(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={actBusy} onClick={() => setActionTarget(null)}>
              Hủy
            </Button>
            <Button type="submit" loading={actBusy}>
              Xác nhận
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
