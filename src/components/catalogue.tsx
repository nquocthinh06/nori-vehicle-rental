'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Category, ModelView } from '@/lib/catalogue'
import { formatDate, subCategoryLabels } from '@/lib/rental-rules'
import {
  Button,
  EmptyState,
  Heading,
  IconButton,
  Input,
  SearchableSelect,
  Select,
  Text,
  cn,
} from './ui'
import { Icon } from './ui/icon'
import { VehicleCard, categoryIcons, categoryLabels } from './vehicle-card'

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

export function Catalogue({ models }: { models: ModelView[] }) {
  const params = useSearchParams()
  const router = useRouter()
  const intent = params.get('intent') === 'buy' ? 'buy' : 'rent'
  const rawCategory = params.get('type') ?? ''
  const category = (['CAR', 'MOTORBIKE', 'PICKUP'].includes(rawCategory) ? rawCategory : '') as
    | Category
    | ''
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [brand, setBrand] = useState('')
  const [subCategory, setSubCategory] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [seats, setSeats] = useState('')
  const [location, setLocation] = useState(params.get('location') ?? '')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('featured')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)

  const brands = useMemo(() => [...new Set(models.map((m) => m.brand))].sort(), [models])
  const subCategories = useMemo(
    () =>
      [
        ...new Set(
          models
            .filter((m) => !category || m.category === category)
            .map((m) => m.subCategory)
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [models, category],
  )
  const fuelTypes = useMemo(
    () => [...new Set(models.map((m) => m.fuelType).filter((v): v is string => Boolean(v)))].sort(),
    [models],
  )
  const seatOptions = useMemo(
    () =>
      [...new Set(models.map((m) => m.seats).filter((v): v is number => Boolean(v)))].sort(
        (a, b) => a - b,
      ),
    [models],
  )
  const locations = useMemo(() => [...new Set(models.flatMap((m) => m.locations))].sort(), [models])

  const startDate = params.get('startDate')
  const endDate = params.get('endDate')
  const querySearch = params.get('search') ?? ''
  const queryLocation = params.get('location') ?? ''
  useEffect(() => setSearch(querySearch), [querySearch])
  useEffect(() => setLocation(queryLocation), [queryLocation])
  useEffect(() => {
    if (!filtersOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [filtersOpen])

  function navigate(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'type') setSubCategory('')
    setPage(1)
    router.replace(`/vehicles?${next}`, { scroll: false })
  }

  const filtered = useMemo(() => {
    const tokens = normalizeText(search.trim()).split(/\s+/).filter(Boolean)
    return models
      .filter((m) => {
        const price = intent === 'buy' ? m.salePrice : m.pricePerDay
        const subLabel = m.subCategory ? (subCategoryLabels[m.subCategory] ?? '') : ''
        const haystack = normalizeText(
          `${m.name} ${m.brand} ${m.bodyStyle ?? ''} ${subLabel} ${m.segment ?? ''} ${m.fuelType ?? ''}`,
        )
        return (
          (!category || m.category === category) &&
          (!brand || m.brand === brand) &&
          (!subCategory || m.subCategory === subCategory) &&
          (!fuelType || m.fuelType === fuelType) &&
          (!seats || m.seats === Number(seats)) &&
          (!location || m.locations.includes(location)) &&
          tokens.every((token) => haystack.includes(token)) &&
          (!minPrice || (price !== null && price >= Number(minPrice))) &&
          (!maxPrice || (price !== null && price <= Number(maxPrice)))
        )
      })
      .sort((a, b) => {
        const aPrice = intent === 'buy' ? a.salePrice : a.pricePerDay
        const bPrice = intent === 'buy' ? b.salePrice : b.pricePerDay
        if (sort === 'asc') return (aPrice ?? Infinity) - (bPrice ?? Infinity)
        if (sort === 'desc') return (bPrice ?? -Infinity) - (aPrice ?? -Infinity)
        if (sort === 'year') return (b.modelYear ?? 0) - (a.modelYear ?? 0)
        if (sort === 'name') return a.name.localeCompare(b.name, 'vi')
        return Number(b.featured) - Number(a.featured)
      })
  }, [
    models,
    category,
    search,
    brand,
    subCategory,
    fuelType,
    seats,
    location,
    minPrice,
    maxPrice,
    sort,
    intent,
  ])

  function reset() {
    setSearch('')
    setBrand('')
    setSubCategory('')
    setFuelType('')
    setSeats('')
    setLocation('')
    setMinPrice('')
    setMaxPrice('')
    setSort('featured')
    setPage(1)
    router.replace(`/vehicles?intent=${intent}`, { scroll: false })
  }

  const anyFilter = !!(
    category ||
    search ||
    brand ||
    subCategory ||
    fuelType ||
    seats ||
    location ||
    minPrice ||
    maxPrice
  )
  const activeChips = [
    category
      ? {
          key: 'type',
          label: `Loại: ${categoryLabels[category]}`,
          clear: () => navigate('type', ''),
        }
      : null,
    search
      ? {
          key: 'search',
          label: `Tìm: "${search}"`,
          clear: () => {
            setSearch('')
            navigate('search', '')
          },
        }
      : null,
    brand ? { key: 'brand', label: `Hãng: ${brand}`, clear: () => setBrand('') } : null,
    subCategory
      ? {
          key: 'subCategory',
          label: `Kiểu: ${subCategoryLabels[subCategory] ?? subCategory}`,
          clear: () => setSubCategory(''),
        }
      : null,
    fuelType
      ? { key: 'fuelType', label: `Nhiên liệu: ${fuelType}`, clear: () => setFuelType('') }
      : null,
    seats ? { key: 'seats', label: `${seats} chỗ`, clear: () => setSeats('') } : null,
    location
      ? {
          key: 'location',
          label: `Khu vực: ${location}`,
          clear: () => {
            setLocation('')
            navigate('location', '')
          },
        }
      : null,
    minPrice
      ? {
          key: 'minPrice',
          label: `Từ ${Number(minPrice).toLocaleString('vi-VN')}đ`,
          clear: () => setMinPrice(''),
        }
      : null,
    maxPrice
      ? {
          key: 'maxPrice',
          label: `Đến ${Number(maxPrice).toLocaleString('vi-VN')}đ`,
          clear: () => setMaxPrice(''),
        }
      : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => Boolean(chip))

  const pageCount = Math.ceil(filtered.length / 12)
  const shown = filtered.slice(
    (Math.min(page, pageCount || 1) - 1) * 12,
    Math.min(page, pageCount || 1) * 12,
  )

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div className="inline-flex rounded-control bg-subtle p-1" aria-label="Chọn dịch vụ">
          {(['rent', 'buy'] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              aria-pressed={intent === value}
              onClick={() => navigate('intent', value)}
              className={cn(
                'min-h-control-sm px-6 py-2 text-small',
                intent === value ? 'bg-canvas text-brand shadow-sm' : 'text-muted',
              )}
            >
              <Icon name={value === 'rent' ? 'car' : 'bag'} className="size-4" />
              {value === 'rent' ? 'Thuê xe' : 'Mua xe'}
            </Button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            navigate('search', search)
          }}
          className="relative w-full md:max-w-panel"
        >
          <Input
            id="catalogue-search"
            label="Tìm theo tên xe, thương hiệu"
            type="search"
            maxLength={120}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Ví dụ: Fortuner, SH160i, Ranger, xe điện…"
            wrapperClassName="w-full"
            className="pr-12"
          />
          <Button
            variant="ghost"
            aria-label="Tìm kiếm xe"
            type="submit"
            className="absolute bottom-0 right-0 min-h-control px-4"
          >
            <Icon name="search" className="size-4" />
          </Button>
        </form>
      </div>
      {intent === 'rent' && startDate && endDate && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-control bg-brand-soft p-4 text-small text-brand">
          <Text className="flex items-center gap-2">
            <Icon name="calendar" className="size-4" />
            Dự kiến: {formatDate(startDate)} — {formatDate(endDate)}
          </Text>
          <Text className="text-caption">
            Chọn xe thực tế ở trang chi tiết để kiểm tra lịch trống.
          </Text>
        </div>
      )}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <Text className="font-medium">{filtered.length} dòng xe</Text>
        <Button
          variant="secondary"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          aria-controls="catalogue-filters"
          className="text-small"
        >
          <Icon name="sliders" className="size-4" />
          Bộ lọc{anyFilter && <span className="size-2 rounded-pill bg-brand" />}
        </Button>
      </div>
      <div className="grid gap-8 lg:grid-cols-4">
        {filtersOpen && (
          <div
            aria-hidden="true"
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-40 bg-overlay/55 backdrop-blur-[2px] lg:hidden"
          />
        )}
        <aside
          id="catalogue-filters"
          aria-label="Bộ lọc phương tiện"
          className={cn(
            'lg:sticky lg:top-5 lg:block lg:self-start lg:rounded-card lg:border lg:border-line lg:bg-canvas lg:p-5',
            filtersOpen
              ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-panel border-t border-line bg-canvas shadow-float lg:static lg:max-h-none'
              : 'hidden',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:mb-5 lg:px-0 lg:pb-5 lg:pt-0">
            <Heading as="h2" size="subtitle" className="flex items-center gap-2">
              <Icon name="sliders" className="size-4" />
              Bộ lọc
            </Heading>
            <div className="flex items-center gap-3">
              {anyFilter && (
                <Button
                  variant="ghost"
                  onClick={reset}
                  className="min-h-0 p-0 text-caption text-brand"
                >
                  Đặt lại
                </Button>
              )}
              <IconButton
                icon="close"
                label="Đóng bộ lọc"
                onClick={() => setFiltersOpen(false)}
                className="lg:hidden"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 lg:overflow-visible lg:p-0">
            <Text className="mb-3 text-small font-semibold">Loại phương tiện</Text>
            <div className="space-y-1">
              {(['', 'CAR', 'MOTORBIKE', 'PICKUP'] as const).map((c) => (
                <Button
                  key={c}
                  variant="ghost"
                  aria-pressed={category === c}
                  onClick={() => navigate('type', c)}
                  className={cn(
                    'min-h-control-sm w-full justify-start rounded-control px-3 py-2 text-small font-normal',
                    category === c ? 'bg-brand-soft text-brand' : 'text-muted',
                  )}
                >
                  <Icon name={c ? categoryIcons[c] : 'grid'} className="size-4" />
                  {c ? categoryLabels[c] : 'Tất cả'}
                  <Text as="span" className="ml-auto text-caption">
                    {models.filter((m) => !c || m.category === c).length}
                  </Text>
                </Button>
              ))}
            </div>
            <div className="mt-5 space-y-4 border-t border-line pt-5">
              <Select
                id="filter-brand"
                label="Thương hiệu"
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Tất cả thương hiệu</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Select
                id="filter-subcategory"
                label="Kiểu dáng / Phân loại"
                value={subCategory}
                onChange={(e) => {
                  setSubCategory(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Tất cả kiểu dáng</option>
                {subCategories.map((sc) => (
                  <option key={sc} value={sc}>
                    {subCategoryLabels[sc] ?? sc}
                  </option>
                ))}
              </Select>
              <Select
                id="filter-fuel"
                label="Nhiên liệu"
                value={fuelType}
                onChange={(e) => {
                  setFuelType(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">Tất cả nhiên liệu</option>
                {fuelTypes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  id="filter-seats"
                  label="Số chỗ"
                  value={seats}
                  onChange={(e) => {
                    setSeats(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Tất cả</option>
                  {seatOptions.map((s) => (
                    <option key={s} value={String(s)}>
                      {s} chỗ
                    </option>
                  ))}
                </Select>
                <Select
                  id="filter-location"
                  label="Khu vực"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Toàn quốc</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-5 border-t border-line pt-5">
              <Text className="mb-3 text-small font-semibold">
                {intent === 'rent' ? 'Giá thuê / ngày' : 'Giá bán'} (VNĐ)
              </Text>
              <div className="space-y-3">
                <Input
                  label="Từ"
                  id="filter-min"
                  type="number"
                  min={0}
                  max={100_000_000_000}
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => {
                    setMinPrice(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Không giới hạn"
                />
                <Input
                  label="Đến"
                  id="filter-max"
                  type="number"
                  min={0}
                  max={100_000_000_000}
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Không giới hạn"
                />
              </div>
              <Text className="mt-3 text-micro text-muted">
                Bộ lọc giá chỉ áp dụng với xe đã có giá được xác nhận.
              </Text>
              {minPrice && maxPrice && Number(minPrice) > Number(maxPrice) && (
                <Text className="mt-2 text-caption text-danger" role="alert">
                  Giá tối đa cần lớn hơn giá tối thiểu.
                </Text>
              )}
            </div>
            <div className="mt-6 rounded-control bg-subtle p-4">
              <Icon name="headphones" className="mb-3 text-brand" />
              <Text className="text-small font-semibold">Cần một chút gợi ý?</Text>
              <Text className="mt-1 text-caption text-muted">
                NORI giúp bạn tìm lựa chọn phù hợp.
              </Text>
              <Button
                variant="ghost"
                className="mt-3 min-h-0 p-0 text-caption text-brand"
                onClick={() => router.push('/support')}
              >
                Trung tâm hỗ trợ <Icon name="arrow-up-right" className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line bg-canvas px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
            <Button variant="secondary" onClick={reset} className="flex-1">
              Đặt lại
            </Button>
            <Button onClick={() => setFiltersOpen(false)} className="flex-1">
              Xem {filtered.length} kết quả
            </Button>
          </div>
        </aside>
        <section className="min-w-0 lg:col-span-3" aria-label="Kết quả tìm kiếm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <Text className="text-small text-muted" role="status" aria-live="polite">
              Khám phá{' '}
              <Text as="span" className="font-semibold text-ink">
                {filtered.length} dòng xe
              </Text>
              {category && ` ${categoryLabels[category].toLowerCase()}`}
            </Text>
            <div className="flex items-end gap-2">
              <Select
                id="catalogue-sort"
                label="Sắp xếp theo"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="min-h-control-sm py-2 text-caption"
              >
                <option value="featured">Nổi bật</option>
                <option value="name">Tên xe A–Z</option>
                <option value="asc">Giá thấp đến cao</option>
                <option value="desc">Giá cao đến thấp</option>
                <option value="year">Đời xe mới nhất</option>
              </Select>
              <IconButton
                label="Hiển thị dạng lưới"
                icon="grid"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                className={cn(
                  'size-control-sm rounded-control',
                  view === 'grid' && 'border-brand text-brand',
                )}
              />
              <IconButton
                label="Hiển thị dạng danh sách"
                icon="list"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn(
                  'size-control-sm rounded-control',
                  view === 'list' && 'border-brand text-brand',
                )}
              />
            </div>
          </div>
          {activeChips.length > 0 && (
            <div
              className="mb-5 flex flex-wrap items-center gap-2"
              aria-label="Bộ lọc đang áp dụng"
            >
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-brand/25 bg-brand-soft px-3 py-1 text-caption font-medium text-brand hover:bg-brand hover:text-inverse"
                >
                  <span>{chip.label}</span>
                  <Icon name="close" className="size-3.5" />
                </button>
              ))}
              <button
                type="button"
                onClick={reset}
                className="min-h-9 px-2 text-caption font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Xóa tất cả
              </button>
            </div>
          )}
          {shown.length ? (
            <div
              className={cn(
                'grid gap-5',
                view === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1',
              )}
            >
              {shown.map((m) => (
                <VehicleCard
                  key={m.id}
                  model={m}
                  intent={intent}
                  compact={view === 'grid'}
                  layout={view}
                  startDate={startDate}
                  endDate={endDate}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Chưa tìm thấy xe phù hợp"
              description="Hãy thử một thương hiệu, loại xe hoặc khoảng giá khác. Thông tin còn thiếu sẽ không được đưa vào kết quả lọc giá."
            >
              <Button onClick={reset} variant="secondary">
                Xóa bộ lọc <Icon name="arrow-right" className="size-4" />
              </Button>
            </EmptyState>
          )}
          {pageCount > 1 && (
            <nav
              aria-label="Phân trang phương tiện"
              className="mt-8 flex items-center justify-center gap-3"
            >
              <IconButton
                icon="chevron-left"
                label="Trang trước"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              />
              <Text className="text-small">
                Trang {page} / {pageCount}
              </Text>
              <IconButton
                icon="chevron-right"
                label="Trang sau"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              />
            </nav>
          )}
          <div className="mt-7 flex items-start gap-2 rounded-control bg-subtle p-4 text-caption text-muted">
            <Icon name="info" className="mt-0.5 size-4" />
            <Text>
              Đây là catalogue dòng xe kết hợp danh sách xe thực tế minh họa (DEMO). Giá, ODO, màu
              sắc và lịch trống chi tiết được kiểm tra theo từng chiếc xe ở trang chi tiết.
            </Text>
          </div>
        </section>
      </div>
    </div>
  )
}
