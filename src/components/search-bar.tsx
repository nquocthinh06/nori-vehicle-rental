'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getSharedPublicLocations } from '@/lib/client-api'
import type { PublicLocationsPayload } from '@/lib/domain-types'
import { addDays, businessToday, validateRentalDates } from '@/lib/rental-rules'
import { Button, Checkbox, Notice, Select, Input, Text, TabButton } from './ui'
import { Icon } from './ui/icon'

export function SearchBar({ locations = [] }: { locations?: string[] }) {
  const router = useRouter()
  const [intent, setIntent] = useState<'rent' | 'buy'>('rent')
  const [type, setType] = useState('')
  const [location, setLocation] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pickupBranchId, setPickupBranchId] = useState('')
  const [differentReturn, setDifferentReturn] = useState(false)
  const [returnBranchId, setReturnBranchId] = useState('')
  const [publicLocs, setPublicLocs] = useState<PublicLocationsPayload | null>(null)
  const [error, setError] = useState('')
  const [today, setToday] = useState('')

  useEffect(() => {
    setToday(businessToday())
    let active = true
    getSharedPublicLocations()
      .then((res) => {
        if (active) setPublicLocs(res)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (intent === 'rent' && (start || end)) {
      const result = validateRentalDates(start, end)
      if (result.error) {
        setError(result.error)
        return
      }
    }
    setError('')
    const params = new URLSearchParams({ intent })
    if (type) params.set('type', type)
    if (location) params.set('location', location)
    if (intent === 'rent') {
      if (start && end) {
        params.set('startDate', start)
        params.set('endDate', end)
      }
      if (pickupBranchId) {
        params.set('pickupBranchId', pickupBranchId)
        if (differentReturn && returnBranchId && returnBranchId !== pickupBranchId) {
          params.set('returnBranchId', returnBranchId)
        }
      }
    }
    router.push(`/vehicles?${params}`)
  }

  const branches = publicLocs?.branches ?? []

  return (
    <div
      role="search"
      aria-label="Tìm phương tiện"
      className="relative z-10 -mt-12 rounded-panel border border-line bg-canvas p-4 shadow-float sm:p-5 md:-mt-19 md:p-7"
    >
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-line">
        <div role="tablist" aria-label="Dịch vụ" className="flex flex-1 gap-5 sm:flex-none">
          {(['rent', 'buy'] as const).map((value) => (
            <TabButton
              key={value}
              selected={intent === value}
              id={`search-tab-${value}`}
              aria-controls="search-service-panel"
              aria-label={value === 'rent' ? 'Tôi muốn thuê xe' : 'Tôi muốn mua xe'}
              className="-mb-px flex-1 sm:flex-none"
              onClick={() => {
                setIntent(value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  const next = intent === 'rent' ? 'buy' : 'rent'
                  setIntent(next)
                  document.getElementById(`search-tab-${next}`)?.focus()
                }
              }}
            >
              <Icon name={value === 'rent' ? 'car' : 'bag'} className="size-4" />
              <span className="sm:hidden">{value === 'rent' ? 'Thuê xe' : 'Mua xe'}</span>
              <span className="hidden sm:inline">
                {value === 'rent' ? 'Tôi muốn thuê xe' : 'Tôi muốn mua xe'}
              </span>
            </TabButton>
          ))}
        </div>
        <Text className="hidden text-caption text-muted md:block">
          Chuyến đi tuyệt vời bắt đầu từ một lựa chọn.
        </Text>
      </div>
      <div id="search-service-panel" role="tabpanel" aria-labelledby={`search-tab-${intent}`}>
        <form onSubmit={submit} className="space-y-3.5">
          <div
            className={
              intent === 'rent'
                ? 'grid items-end gap-3.5 md:grid-cols-2 lg:grid-cols-5'
                : 'grid items-end gap-3.5 md:grid-cols-4'
            }
          >
            <Select
              id="hero-type"
              label="Loại phương tiện"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Tất cả phương tiện</option>
              <option value="CAR">Ô tô</option>
              <option value="MOTORBIKE">Xe máy</option>
              <option value="PICKUP">Bán tải</option>
            </Select>
            <Select
              id="hero-location"
              label="Khu vực"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Tất cả khu vực</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </Select>
            {intent === 'rent' ? (
              <>
                <Input
                  id="hero-start"
                  label="Ngày nhận xe"
                  type="date"
                  value={start}
                  min={today || undefined}
                  max={today ? addDays(today, 90) : undefined}
                  onFocus={() => setToday(businessToday())}
                  onChange={(e) => {
                    setStart(e.target.value)
                    setError('')
                  }}
                />
                <Input
                  id="hero-end"
                  label="Ngày trả xe"
                  type="date"
                  value={end}
                  min={start ? addDays(start, 1) : today || undefined}
                  onFocus={() => setToday(businessToday())}
                  max={start ? addDays(start, 30) : undefined}
                  onChange={(e) => {
                    setEnd(e.target.value)
                    setError('')
                  }}
                />
              </>
            ) : (
              <div className="flex h-control items-center gap-2 rounded-control bg-subtle px-4 text-caption text-muted">
                <Icon name="shield" className="size-4 text-brand" />
                Thông tin xe minh bạch
              </div>
            )}
            <Button type="submit" className="h-control gap-3">
              <Icon name="search" className="size-4" />
              {intent === 'rent' ? 'Tìm xe phù hợp' : 'Khám phá xe bán'}
              <Icon name="arrow-right" className="ml-auto size-4" />
            </Button>
          </div>

          {intent === 'rent' && branches.length > 0 && (
            <div className="grid items-end gap-3 border-t border-line pt-3.5 md:grid-cols-3">
              <Select
                id="hero-pickup-branch"
                label="Chi nhánh nhận xe"
                value={pickupBranchId}
                onChange={(e) => setPickupBranchId(e.target.value)}
              >
                <option value="">Tất cả chi nhánh NORI</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.province})
                  </option>
                ))}
              </Select>
              <div className="flex min-h-control items-center">
                <Checkbox
                  id="hero-one-way"
                  checked={differentReturn}
                  onChange={(e) => {
                    setDifferentReturn(e.target.checked)
                    if (!e.target.checked) setReturnBranchId('')
                  }}
                  label="Trả xe tại địa điểm khác"
                />
              </div>
              {differentReturn && (
                <Select
                  id="hero-return-branch"
                  label="Chi nhánh trả xe"
                  value={returnBranchId}
                  onChange={(e) => setReturnBranchId(e.target.value)}
                >
                  <option value="">Chọn chi nhánh trả xe</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.province})
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
        </form>
      </div>
      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}
    </div>
  )
}
