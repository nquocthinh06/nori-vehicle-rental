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

type MaintRow = {
  id: string
  title: string
  maintenanceType: string
  startDate: string
  endDate: string
  odometerAtService: number | null
  cost: number | null
  status: string
  notes: string
  vehicleReference: string
}

type VehicleOption = { id: string; reference: string; modelName: string }

const typeLabels: Record<string, string> = {
  ROUTINE: 'Bảo dưỡng định kỳ',
  REPAIR: 'Sửa chữa kỹ thuật',
  INSPECTION: 'Đăng kiểm / Kiểm định',
}
const statusLabels: Record<string, string> = {
  SCHEDULED: 'Đã lên lịch',
  IN_PROGRESS: 'Đang bảo trì',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

export function MaintenancePanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<MaintRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [vehicleId, setVehicleId] = useState('')
  const [title, setTitle] = useState('')
  const [maintenanceType, setMaintenanceType] = useState('ROUTINE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api<{ items: MaintRow[]; vehicles: VehicleOption[] }>(
      `/dashboard/maintenance?status=${encodeURIComponent(statusFilter)}`,
    )
      .then((res) => {
        if (!active) return
        setItems(res.items)
        setVehicles(res.vehicles)
        if (!vehicleId && res.vehicles[0]) setVehicleId(res.vehicles[0].id)
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
      await api('/dashboard/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          vehicleId,
          title,
          maintenanceType,
          startDate,
          endDate,
          cost: cost ? Number(cost) : undefined,
          notes,
        }),
      })
      toast('Đã tạo lịch bảo trì và tự động khóa lịch thuê trùng ngày.')
      setOpen(false)
      setTitle('')
      setNotes('')
      setCost('')
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api('/dashboard/maintenance', {
        method: 'PATCH',
        body: JSON.stringify({ id, status }),
      })
      toast('Đã cập nhật trạng thái bảo trì.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <Notice tone="info">
        Lịch bảo trì ở trạng thái &ldquo;Đã lên lịch&rdquo; hoặc &ldquo;Đang bảo trì&rdquo; sẽ tự
        động chặn đặt thuê mới trong khoảng ngày tương ứng tại Backend.
      </Notice>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="w-full max-w-xs">
          <Select
            id="maint-filter"
            label="Trạng thái bảo trì"
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
          Lên lịch bảo trì
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="settings"
          title="Chưa có lịch bảo trì nào"
          description="Lên lịch bảo dưỡng định kỳ hoặc sửa chữa cho từng xe thực tế tại đây."
        />
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas p-5"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{m.vehicleReference}</Badge>
                  <Text className="font-semibold text-ink">{m.title}</Text>
                  <Badge tone={m.status === 'COMPLETED' ? 'brand' : 'warning'}>
                    {statusLabels[m.status] ?? m.status}
                  </Badge>
                </div>
                <Text className="text-caption text-muted">
                  {typeLabels[m.maintenanceType] ?? m.maintenanceType} · {formatDate(m.startDate)} →{' '}
                  {formatDate(m.endDate)}
                  {m.cost ? ` · Chi phí: ${formatMoney(m.cost)}` : ''}
                </Text>
                {m.notes && <Text className="text-small text-muted">{m.notes}</Text>}
              </div>
              <div className="flex flex-wrap gap-2">
                {m.status === 'SCHEDULED' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void updateStatus(m.id, 'IN_PROGRESS')}
                  >
                    Bắt đầu bảo trì
                  </Button>
                )}
                {['SCHEDULED', 'IN_PROGRESS'].includes(m.status) && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void updateStatus(m.id, 'COMPLETED')}
                    >
                      Hoàn tất
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void updateStatus(m.id, 'CANCELLED')}
                    >
                      Hủy lịch
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Tạo lịch bảo trì phương tiện" wide>
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="maint-veh"
              label="Xe thực tế"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reference} — {v.modelName}
                </option>
              ))}
            </Select>
            <Select
              id="maint-type"
              label="Loại bảo trì"
              value={maintenanceType}
              onChange={(e) => setMaintenanceType(e.target.value)}
            >
              {Object.entries(typeLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <Input
            id="maint-title"
            label="Hạng mục bảo trì"
            required
            placeholder="Bảo dưỡng mốc 20.000 km, thay lốp..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="maint-start"
              label="Từ ngày"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              id="maint-end"
              label="Đến ngày"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Input
              id="maint-cost"
              label="Chi phí dự kiến (VNĐ)"
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <Textarea
            id="maint-notes"
            label="Ghi chú kỹ thuật"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu lịch bảo trì
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
