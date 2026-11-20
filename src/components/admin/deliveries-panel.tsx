'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { deliveryJobStatusLabels, type DeliveryJobStatus } from '@/lib/multi-branch-rules'
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

type ZoneRow = {
  id: string
  code: string
  name: string
  branchId: string
  branchName: string
  province: string
  wards: string
  deliveryFee: number
  pickupFee: number
  afterHoursFee: number
  freeOverOrderAmount: number | null
  serviceStartTime: string
  serviceEndTime: string
  estimatedTravelMinutes: number
  active: boolean
}

type JobRow = {
  id: string
  jobCode: string
  bookingId: string
  bookingKey: string
  branchId: string
  branchName: string
  jobType: 'DELIVERY' | 'PICKUP'
  status: DeliveryJobStatus
  scheduledDate: string
  scheduledTime: string
  assignedStaffId: string | null
  assignedStaffName: string | null
  address: string
  contactName: string
  contactPhone: string
  deliveryFeeSnapshot: number
  failureReason: string
}

type BranchOpt = { id: string; code: string; name: string; province: string }
type BookingOpt = {
  id: string
  bookingKey: string
  vehicleReference: string
  startDate: string
  endDate: string
  pickupTime: string
  returnTime: string
  deliveryAddress: string
  pickupAddress: string
}
type StaffOpt = { id: string; email: string; fullName: string; staffTitle: string }

export function DeliveriesPanel() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'jobs' | 'zones'>('jobs')
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [bookings, setBookings] = useState<BookingOpt[]>([])
  const [staff, setStaff] = useState<StaffOpt[]>([])
  const [isDeliveryOnly, setIsDeliveryOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  // Zone dialog
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zCode, setZCode] = useState('')
  const [zName, setZName] = useState('')
  const [zBranchId, setZBranchId] = useState('')
  const [zProvince, setZProvince] = useState('')
  const [zWards, setZWards] = useState('')
  const [zDeliveryFee, setZDeliveryFee] = useState('150000')
  const [zPickupFee, setZPickupFee] = useState('150000')
  const [zAfterHours, setZAfterHours] = useState('100000')
  const [zStart, setZStart] = useState('08:00')
  const [zEnd, setZEnd] = useState('20:00')
  const [zBusy, setZBusy] = useState(false)
  const [zError, setZError] = useState('')

  // Job dialog
  const [jobOpen, setJobOpen] = useState(false)
  const [jBookingId, setJBookingId] = useState('')
  const [jType, setJType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY')
  const [jDate, setJDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [jTime, setJTime] = useState('09:00')
  const [jStaffId, setJStaffId] = useState('')
  const [jAddress, setJAddress] = useState('')
  const [jBusy, setJBusy] = useState(false)
  const [jError, setJError] = useState('')

  // Fail dialog
  const [failingJob, setFailingJob] = useState<JobRow | null>(null)
  const [failReason, setFailReason] = useState('')
  const [failBusy, setFailBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api<{
      zones: ZoneRow[]
      jobs: JobRow[]
      branches: BranchOpt[]
      bookings: BookingOpt[]
      deliveryStaff: StaffOpt[]
      scope: { isDeliveryOnly: boolean }
    }>('/dashboard/deliveries')
      .then((res) => {
        if (!mounted) return
        setZones(res.zones ?? [])
        setJobs(res.jobs ?? [])
        setBranches(res.branches ?? [])
        setBookings(res.bookings ?? [])
        setStaff(res.deliveryStaff ?? [])
        setIsDeliveryOnly(Boolean(res.scope?.isDeliveryOnly))
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

  async function handleCreateZone(e: React.FormEvent) {
    e.preventDefault()
    setZError('')
    setZBusy(true)
    try {
      await api('/dashboard/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'zone',
          code: zCode.trim().toUpperCase(),
          name: zName.trim(),
          branchId: zBranchId,
          province: zProvince.trim(),
          wards: zWards.trim(),
          deliveryFee: Number(zDeliveryFee || 0),
          pickupFee: Number(zPickupFee || 0),
          afterHoursFee: Number(zAfterHours || 0),
          serviceStartTime: zStart,
          serviceEndTime: zEnd,
        }),
      })
      toast(`Đã tạo khu vực giao nhận ${zCode.trim().toUpperCase()}.`)
      setZoneOpen(false)
      setZCode('')
      setZName('')
      setRetry((r) => r + 1)
    } catch (err) {
      setZError((err as Error).message)
    } finally {
      setZBusy(false)
    }
  }

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault()
    setJError('')
    setJBusy(true)
    try {
      await api('/dashboard/deliveries', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'job',
          bookingId: jBookingId,
          jobType: jType,
          scheduledDate: jDate,
          scheduledTime: jTime,
          assignedStaffId: jStaffId || null,
          address: jAddress.trim(),
        }),
      })
      toast('Đã tạo nhiệm vụ giao/thu hồi xe tận nơi.')
      setJobOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setJError((err as Error).message)
    } finally {
      setJBusy(false)
    }
  }

  async function updateJobStatus(job: JobRow, nextStatus: DeliveryJobStatus) {
    try {
      await api('/dashboard/deliveries', {
        method: 'PATCH',
        body: JSON.stringify({ entity: 'job', id: job.id, status: nextStatus }),
      })
      toast(`Nhiệm vụ ${job.jobCode} → ${deliveryJobStatusLabels[nextStatus]}.`)
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  async function submitFailure(e: React.FormEvent) {
    e.preventDefault()
    if (!failingJob) return
    setFailBusy(true)
    try {
      await api('/dashboard/deliveries', {
        method: 'PATCH',
        body: JSON.stringify({
          entity: 'job',
          id: failingJob.id,
          status: 'FAILED',
          failureReason: failReason.trim(),
        }),
      })
      toast(`Đã ghi nhận giao/nhận thất bại cho ${failingJob.jobCode}.`)
      setFailingJob(null)
      setFailReason('')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setFailBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'jobs' ? 'primary' : 'secondary'}
            onClick={() => setTab('jobs')}
          >
            Nhiệm vụ giao nhận ({jobs.length})
          </Button>
          {!isDeliveryOnly && (
            <Button
              size="sm"
              variant={tab === 'zones' ? 'primary' : 'secondary'}
              onClick={() => setTab('zones')}
            >
              Khu vực &amp; Biểu phí giao ({zones.length})
            </Button>
          )}
        </div>
        {!isDeliveryOnly && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={branches.length === 0}
              onClick={() => {
                setZBranchId(branches[0]?.id ?? '')
                setZProvince(branches[0]?.province ?? '')
                setZError('')
                setZoneOpen(true)
              }}
            >
              <Icon name="plus" className="size-4" />
              Thêm khu vực giao
            </Button>
            <Button
              size="sm"
              disabled={bookings.length === 0}
              onClick={() => {
                const first = bookings[0]
                setJBookingId(first?.id ?? '')
                setJDate(first?.startDate ?? new Date().toISOString().slice(0, 10))
                setJTime(first?.pickupTime ?? '09:00')
                setJAddress(first?.deliveryAddress || '')
                setJError('')
                setJobOpen(true)
              }}
            >
              <Icon name="plus" className="size-4" />
              Điều phối nhiệm vụ
            </Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : tab === 'jobs' ? (
        jobs.length === 0 ? (
          <EmptyState
            icon="car"
            title="Chưa có nhiệm vụ giao nhận tận nơi"
            description="Điều phối nhân viên giao xe hoặc thu hồi xe tận nơi cho các đơn thuê đã xác nhận."
          />
        ) : (
          <div className="space-y-4">
            {jobs.map((j) => (
              <article
                key={j.id}
                data-job-code={j.jobCode}
                className="rounded-card border border-line bg-canvas p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{j.jobCode}</Badge>
                      <Badge tone="muted">
                        {j.jobType === 'PICKUP' ? 'Thu hồi xe tận nơi' : 'Giao xe tận nơi'}
                      </Badge>
                      <Badge
                        tone={
                          j.status === 'COMPLETED'
                            ? 'brand'
                            : j.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {deliveryJobStatusLabels[j.status]}
                      </Badge>
                    </div>
                    <Heading as="h2" size="body" className="mt-2 font-semibold">
                      Đơn {j.bookingKey} · {j.scheduledDate} lúc {j.scheduledTime}
                    </Heading>
                    <Text className="text-caption text-muted">
                      Địa chỉ: <strong className="text-ink">{j.address}</strong> · Liên hệ:{' '}
                      {j.contactName} ({j.contactPhone})
                    </Text>
                    {j.failureReason && (
                      <Text className="mt-1 text-caption text-danger">
                        Lý do thất bại: {j.failureReason}
                      </Text>
                    )}
                  </div>
                  <div className="text-right text-caption text-muted">
                    <p>
                      Chi nhánh: <strong className="text-ink">{j.branchName}</strong>
                    </p>
                    <p>
                      Nhân viên:{' '}
                      <strong className="text-ink">
                        {j.assignedStaffName || 'Chưa phân công'}
                      </strong>
                    </p>
                    <p>
                      Phí áp dụng:{' '}
                      <strong className="text-brand">{formatVnd(j.deliveryFeeSnapshot)}</strong>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                  {j.status === 'ASSIGNED' && (
                    <Button size="sm" onClick={() => void updateJobStatus(j, 'EN_ROUTE')}>
                      Bắt đầu di chuyển
                    </Button>
                  )}
                  {j.status === 'EN_ROUTE' && (
                    <Button size="sm" onClick={() => void updateJobStatus(j, 'ARRIVED')}>
                      Đã tới địa điểm
                    </Button>
                  )}
                  {j.status === 'ARRIVED' && (
                    <Button size="sm" onClick={() => void updateJobStatus(j, 'COMPLETED')}>
                      Hoàn tất bàn giao
                    </Button>
                  )}
                  {['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(j.status) && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setFailingJob(j)
                        setFailReason('')
                      }}
                    >
                      Báo thất bại
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )
      ) : zones.length === 0 ? (
        <EmptyState
          icon="pin"
          title="Chưa có khu vực giao nhận tận nơi"
          description="Cấu hình rõ từng khu vực phục vụ và biểu phí cố định theo chi nhánh để khách hàng chọn tại Checkout."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {zones.map((z) => (
            <article
              key={z.id}
              data-zone-code={z.code}
              className="rounded-card border border-line bg-canvas p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">{z.code}</Badge>
                  <Badge tone={z.active ? 'brand' : 'muted'}>
                    {z.active ? 'Đang bật' : 'Tạm tắt'}
                  </Badge>
                </div>
                <Text className="text-caption text-muted">
                  {z.serviceStartTime} – {z.serviceEndTime}
                </Text>
              </div>
              <Heading as="h2" size="body" className="mt-2 font-semibold">
                {z.name}
              </Heading>
              <Text className="text-caption text-muted">
                CN: {z.branchName} · {z.province}
                {z.wards ? ` (${z.wards})` : ''}
              </Text>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-control bg-subtle p-3 text-caption">
                <div>
                  <span className="block text-muted">Phí giao</span>
                  <strong>{formatVnd(z.deliveryFee)}</strong>
                </div>
                <div>
                  <span className="block text-muted">Phí thu hồi</span>
                  <strong>{formatVnd(z.pickupFee)}</strong>
                </div>
                <div>
                  <span className="block text-muted">Ngoài giờ</span>
                  <strong>{formatVnd(z.afterHoursFee)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={zoneOpen}
        onClose={() => !zBusy && setZoneOpen(false)}
        title="Thêm khu vực giao nhận tận nơi"
        wide
      >
        <form onSubmit={handleCreateZone} className="space-y-4">
          {zError && <Notice tone="error">{zError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="zn-code"
              label="Mã khu vực"
              required
              placeholder="ZONE-HCM-TT"
              value={zCode}
              onChange={(e) => setZCode(e.target.value.toUpperCase())}
            />
            <Input
              id="zn-name"
              label="Tên khu vực"
              required
              wrapperClassName="sm:col-span-2"
              value={zName}
              onChange={(e) => setZName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="zn-br"
              label="Chi nhánh phụ trách"
              required
              value={zBranchId}
              onChange={(e) => setZBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
            <Input
              id="zn-prov"
              label="Tỉnh / Thành phố"
              required
              value={zProvince}
              onChange={(e) => setZProvince(e.target.value)}
            />
          </div>
          <Input
            id="zn-wards"
            label="Quận / Phường phục vụ"
            placeholder="Quận 1, Quận 3, Bình Thạnh..."
            value={zWards}
            onChange={(e) => setZWards(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="zn-dlv"
              label="Phí giao tận nơi (VNĐ)"
              type="number"
              min={0}
              required
              value={zDeliveryFee}
              onChange={(e) => setZDeliveryFee(e.target.value)}
            />
            <Input
              id="zn-pk"
              label="Phí thu hồi (VNĐ)"
              type="number"
              min={0}
              required
              value={zPickupFee}
              onChange={(e) => setZPickupFee(e.target.value)}
            />
            <Input
              id="zn-ah"
              label="Phí ngoài giờ (VNĐ)"
              type="number"
              min={0}
              value={zAfterHours}
              onChange={(e) => setZAfterHours(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="zn-st"
              label="Giờ bắt đầu"
              type="time"
              value={zStart}
              onChange={(e) => setZStart(e.target.value)}
            />
            <Input
              id="zn-en"
              label="Giờ kết thúc"
              type="time"
              value={zEnd}
              onChange={(e) => setZEnd(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={zBusy} onClick={() => setZoneOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={zBusy}>
              Lưu khu vực
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={jobOpen}
        onClose={() => !jBusy && setJobOpen(false)}
        title="Điều phối nhiệm vụ giao nhận tận nơi"
        wide
      >
        <form onSubmit={handleCreateJob} className="space-y-4">
          {jError && <Notice tone="error">{jError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="jb-bk"
              label="Đơn thuê áp dụng"
              required
              value={jBookingId}
              onChange={(e) => setJBookingId(e.target.value)}
            >
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bookingKey} ({b.vehicleReference})
                </option>
              ))}
            </Select>
            <Select
              id="jb-type"
              label="Loại nhiệm vụ"
              value={jType}
              onChange={(e) => setJType(e.target.value as 'DELIVERY' | 'PICKUP')}
            >
              <option value="DELIVERY">Giao xe tận nơi</option>
              <option value="PICKUP">Thu hồi xe tận nơi</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="jb-date"
              label="Ngày hẹn"
              type="date"
              required
              value={jDate}
              onChange={(e) => setJDate(e.target.value)}
            />
            <Input
              id="jb-time"
              label="Giờ hẹn"
              type="time"
              required
              value={jTime}
              onChange={(e) => setJTime(e.target.value)}
            />
            <Select
              id="jb-staff"
              label="Phân công nhân viên"
              value={jStaffId}
              onChange={(e) => setJStaffId(e.target.value)}
            >
              <option value="">-- Chưa phân công --</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.email})
                </option>
              ))}
            </Select>
          </div>
          <Input
            id="jb-addr"
            label="Địa chỉ giao / thu hồi"
            required
            value={jAddress}
            onChange={(e) => setJAddress(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" disabled={jBusy} onClick={() => setJobOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={jBusy}>
              Tạo nhiệm vụ
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(failingJob)}
        onClose={() => !failBusy && setFailingJob(null)}
        title={`Ghi nhận thất bại — ${failingJob?.jobCode ?? ''}`}
      >
        <form onSubmit={submitFailure} className="space-y-4">
          <Textarea
            id="jb-fail-reason"
            label="Lý do giao / thu hồi thất bại"
            required
            rows={3}
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={failBusy} onClick={() => setFailingJob(null)}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" loading={failBusy}>
              Xác nhận báo thất bại
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
