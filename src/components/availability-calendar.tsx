'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/client-api'
import { addDays, businessToday, dateNumber, rentalDays } from '@/lib/rental-rules'
import { Button, IconButton, Notice, Text, cn } from './ui'

export function AvailabilityCalendar({
  vehicle,
  startDate,
  endDate,
  onChange,
}: {
  vehicle: string | null
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
}) {
  const today = businessToday()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [busyDays, setBusyDays] = useState<string[]>([])
  const [loadedVehicle, setLoadedVehicle] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const start = dateNumber(startDate)
    const now = dateNumber(today)
    if (Number.isFinite(start) && start >= now && start <= now + 90) setMonth(startDate.slice(0, 7))
  }, [startDate, today])
  useEffect(() => {
    if (!vehicle) return
    let active = true
    setLoading(true)
    setError('')
    api<{ busyDays: string[] }>(`/availability?vehicle=${encodeURIComponent(vehicle)}`)
      .then((result) => {
        if (active) {
          setBusyDays(result.busyDays)
          setLoadedVehicle(vehicle)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [vehicle, retry])

  const days = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`)
    const offset = (first.getUTCDay() + 6) % 7
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
    ]
  }, [month])
  function move(delta: number) {
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

  return (
    <div className="rounded-card border border-line p-4">
      <div className="mb-4 flex items-center justify-between">
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
          <Text key={day} className="pb-2 text-micro text-muted">
            {day}
          </Text>
        ))}
        {days.map((date, i) => {
          if (!date) return <span key={`empty-${i}`} />
          const busy = busyDays.includes(date)
          const selectingEnd = startDate && !endDate && date > startDate
          const disabled =
            !vehicle ||
            loadedVehicle !== vehicle ||
            loading ||
            !!error ||
            date < today ||
            date > addDays(today, selectingEnd ? 120 : 90) ||
            (busy && !selectingEnd)
          const selected = date === startDate || date === endDate
          const between = startDate && endDate && date > startDate && date < endDate
          return (
            <Button
              key={date}
              variant="ghost"
              aria-label={`${date.split('-').reverse().join('/')}${busy ? ', đã có lịch thuê' : ''}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => select(date)}
              className={cn(
                'min-h-touch rounded-control px-0 py-1 text-caption font-normal disabled:opacity-35',
                selected
                  ? 'bg-brand text-inverse hover:bg-brand-hover'
                  : between
                    ? 'bg-brand-soft text-brand'
                    : busy
                      ? 'text-muted line-through'
                      : 'hover:bg-brand-soft',
              )}
            >
              {Number(date.slice(8))}
            </Button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-micro text-muted">
        <Text>
          {!vehicle
            ? 'Chưa cập nhật lịch xe thực tế'
            : loading
              ? 'Đang tải lịch xe…'
              : 'Ngày trả không tính thêm tiền thuê'}
        </Text>
        <Text as="span" className="flex items-center gap-1">
          <span className="size-1.5 rounded-pill bg-line" />
          Đã có lịch
        </Text>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
          <Button
            variant="ghost"
            className="text-caption text-brand"
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
