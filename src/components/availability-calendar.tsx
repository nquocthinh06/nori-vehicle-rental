'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatApiErrorDetail, getWithRetry } from '@/lib/client-api'
import { addDays, businessToday, dateNumber, rentalDays } from '@/lib/rental-rules'
import { Button, IconButton, Notice, Text, cn } from './ui'

export function AvailabilityCalendar({
  vehicle,
  startDate,
  endDate,
  onChange,
  operationStatus,
}: {
  vehicle: string | null
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  operationStatus?: string | null
}) {
  const [today, setToday] = useState('')
  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate.slice(0, 7) : '',
  )
  const [busyDays, setBusyDays] = useState<string[]>([])
  const [loadedVehicle, setLoadedVehicle] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [retry, setRetry] = useState(0)

  const unavailableStatus =
    operationStatus === 'MAINTENANCE' ||
    operationStatus === 'SOLD' ||
    operationStatus === 'INACTIVE' ||
    operationStatus === 'RESERVED'

  useEffect(() => {
    const currentToday = businessToday()
    setToday(currentToday)
    setMonth((prev) => prev || currentToday.slice(0, 7))
  }, [])

  useEffect(() => {
    if (!today) return
    const start = dateNumber(startDate)
    const now = dateNumber(today)
    if (Number.isFinite(start) && start >= now && start <= now + 90) setMonth(startDate.slice(0, 7))
  }, [startDate, today])

  useEffect(() => {
    if (!vehicle) {
      setBusyDays([])
      setLoadedVehicle(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    getWithRetry<{ busyDays: string[] }>(`/availability?vehicle=${encodeURIComponent(vehicle)}`, {
      signal: controller.signal,
      retries: 2,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setBusyDays(result.busyDays)
          setLoadedVehicle(vehicle)
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(formatApiErrorDetail(e, 'Chưa thể tải lịch trống của xe.').message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [vehicle, retry])

  const days = useMemo(() => {
    if (!month) return []
    const first = new Date(`${month}-01T00:00:00Z`)
    const offset = (first.getUTCDay() + 6) % 7
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
    ]
  }, [month])

  function move(delta: number) {
    if (!month) return
    const date = new Date(`${month}-01T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() + delta)
    setMonth(date.toISOString().slice(0, 7))
  }

  function select(date: string) {
    setSelectionError('')
    if (!startDate || endDate || date <= startDate) {
      if (!busyDays.includes(date)) onChange(date, '')
      return
    }
    if (dateNumber(date) - dateNumber(startDate) > 30) {
      setSelectionError('Mỗi đơn thuê tối đa 30 ngày.')
      return
    }
    if (rentalDays(startDate, date).some((day) => busyDays.includes(day))) {
      setSelectionError('Khoảng ngày này có ngày đã được giữ chỗ. Hãy chọn khoảng khác.')
      return
    }
    onChange(startDate, date)
  }

  if (!today || !month) {
    return (
      <div className="rounded-card border border-line bg-canvas p-3.5 sm:p-4">
        <Text className="text-caption text-muted">Đang tải lịch trống phương tiện…</Text>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-line bg-canvas p-3.5 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Text className="text-small font-semibold">
          Tháng {Number(month.slice(5))} / {month.slice(0, 4)}
        </Text>
        <div className="flex gap-1">
          <IconButton
            icon="chevron-left"
            label="Tháng trước"
            className="size-8 min-h-0 border-transparent"
            onClick={() => move(-1)}
            disabled={month <= today.slice(0, 7)}
          />
          <IconButton
            icon="chevron-right"
            label="Tháng sau"
            className="size-8 min-h-0 border-transparent"
            onClick={() => move(1)}
            disabled={month >= addDays(today, 120).slice(0, 7)}
          />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
          <Text key={day} className="pb-1.5 text-micro font-medium text-muted">
            {day}
          </Text>
        ))}
        {days.map((date, i) => {
          if (!date) return <span key={`empty-${i}`} />
          const busy = busyDays.includes(date)
          const selectingEnd = startDate && !endDate && date > startDate
          const outOfRange = date < today || date > addDays(today, selectingEnd ? 120 : 90)
          const disabled =
            !vehicle ||
            unavailableStatus ||
            loadedVehicle !== vehicle ||
            loading ||
            !!error ||
            outOfRange ||
            (busy && !selectingEnd)
          const selected = date === startDate || date === endDate
          const between = startDate && endDate && date > startDate && date < endDate
          return (
            <Button
              key={date}
              size="cell"
              variant="ghost"
              aria-label={`${date.split('-').reverse().join('/')}${
                unavailableStatus
                  ? ', xe đang bảo dưỡng hoặc tạm ngừng'
                  : busy
                    ? ', đã có lịch thuê'
                    : outOfRange
                      ? ', ngoài phạm vi đặt'
                      : ', còn trống'
              }`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => select(date)}
              className={cn(
                'w-full whitespace-nowrap rounded-control text-caption font-medium leading-none tabular-nums [overflow-wrap:normal] disabled:opacity-35',
                selected
                  ? 'bg-brand text-inverse hover:bg-brand-hover'
                  : between
                    ? 'bg-brand-soft text-brand'
                    : busy
                      ? 'bg-subtle text-muted line-through'
                      : 'hover:bg-brand-soft',
              )}
            >
              {Number(date.slice(8))}
            </Button>
          )
        })}
      </div>
      <div className="mt-3 space-y-2 border-t border-line pt-3 text-micro text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text>
            {!vehicle
              ? 'Chưa có dữ liệu lịch xe thực tế'
              : unavailableStatus
                ? operationStatus === 'MAINTENANCE'
                  ? 'Xe đang bảo dưỡng định kỳ'
                  : 'Xe tạm ngừng cho thuê'
                : loading
                  ? 'Đang tải lịch xe…'
                  : 'Ngày trả không tính thêm tiền thuê'}
          </Text>
          <span className="text-micro text-muted">Múi giờ VN</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-pill border border-control-line bg-canvas" />
            Còn trống
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-pill bg-brand" />
            Đang chọn
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-pill bg-control-line" />
            Đã đặt / Giữ chỗ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-pill bg-line" />
            Không khả dụng
          </span>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-brand"
            onClick={() => setRetry(retry + 1)}
          >
            Tải lại lịch
          </Button>
        </div>
      )}
      {selectionError && (
        <Notice tone="error" className="mt-3">
          {selectionError}
        </Notice>
      )}
    </div>
  )
}
