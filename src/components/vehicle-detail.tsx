'use client'

import Image from 'next/image'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ModelView, Photo } from '@/lib/catalogue'
import type { FleetView, Quote } from '@/lib/domain-types'
import { api, RequestError } from '@/lib/client-api'
import {
  addDays,
  businessToday,
  formatDate,
  formatMoney,
  validateRentalDates,
} from '@/lib/rental-rules'
import { useAuth } from './auth-provider'
import { AvailabilityCalendar } from './availability-calendar'
import { categoryLabels } from './vehicle-card'
import {
  Badge,
  Button,
  ButtonLink,
  Container,
  EmptyState,
  ExternalLink,
  Heading,
  IconButton,
  Input,
  NoriLink,
  Notice,
  Select,
  Skeleton,
  Text,
  Textarea,
  cn,
} from './ui'
import { Icon } from './ui/icon'
import { Dialog } from './ui/dialog'

export function VehicleDetail({ model, address }: { model: ModelView; address: string | null }) {
  const params = useSearchParams()
  const queryIntent = params.get('intent') === 'buy' ? 'buy' : 'rent'
  const queryStartDate = params.get('startDate') ?? ''
  const queryEndDate = params.get('endDate') ?? ''
  const [intent, setIntent] = useState<'rent' | 'buy'>('rent')
  const [kind, setKind] = useState<'EXTERIOR' | 'INTERIOR'>('EXTERIOR')
  const [imageIndex, setImageIndex] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [variantIndex, setVariantIndex] = useState(-1)
  const [colorIndex, setColorIndex] = useState(-1)
  const [fleet, setFleet] = useState<FleetView[]>([])
  const [fleetLoading, setFleetLoading] = useState(true)
  const [fleetError, setFleetError] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [retry, setRetry] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [error, setError] = useState('')
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryBusy, setInquiryBusy] = useState(false)
  const [inquirySuccess, setInquirySuccess] = useState('')
  const [inquiryError, setInquiryError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const { user } = useAuth()
  const catalogueQuery = new URLSearchParams({ intent })
  if (intent === 'rent' && startDate && endDate) {
    catalogueQuery.set('startDate', startDate)
    catalogueQuery.set('endDate', endDate)
  }
  const categoryQuery = new URLSearchParams(catalogueQuery)
  categoryQuery.set('type', model.category)

  useEffect(() => {
    setIntent(queryIntent)
    setStartDate(queryStartDate)
    setEndDate(queryEndDate)
    setQuote(null)
    setError('')
  }, [model.id, queryIntent, queryStartDate, queryEndDate])

  useEffect(() => {
    let active = true
    setFleetLoading(true)
    setFleetError('')
    api<FleetView[]>(`/fleet?model=${encodeURIComponent(model.id)}`)
      .then((result) => {
        if (active) {
          setFleet(result)
          setVehicleId(result[0]?.id ?? '')
        }
      })
      .catch((e) => {
        if (active) setFleetError(e.message)
      })
      .finally(() => {
        if (active) setFleetLoading(false)
      })
    return () => {
      active = false
    }
  }, [model.id, retry])

  const selectedVehicle = fleet.find((v) => v.id === vehicleId) ?? null
  const eligible = fleet.filter((v) =>
    intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT',
  )
  const catalogueImages = [
    ...(model.cover
      ? [{ image: model.cover, kind: 'EXTERIOR' as const, caption: 'Ảnh catalogue tham khảo' }]
      : []),
    ...model.gallery,
  ].filter((g, index, all) => index === all.findIndex((v) => v.image.url === g.image.url))
  const variantColor = model.variants[variantIndex]?.colors[colorIndex]
  const images = variantColor
    ? variantColor.image
      ? [{ image: variantColor.image, kind: 'EXTERIOR' as const, caption: variantColor.name }]
      : []
    : catalogueImages.filter((g) => g.kind === kind)
  const currentImage = images[imageIndex % Math.max(images.length, 1)]?.image ?? null
  const price = selectedVehicle
    ? intent === 'rent'
      ? selectedVehicle.pricePerDay
      : selectedVehicle.salePrice
    : null
  const rentable =
    selectedVehicle && selectedVehicle.intent !== 'SALE' && selectedVehicle.pricePerDay

  useEffect(() => {
    setVehicleId((current) =>
      fleet.some(
        (v) => v.id === current && (intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT'),
      )
        ? current
        : (fleet.find((v) => (intent === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT'))?.id ??
          ''),
    )
    setQuote(null)
  }, [fleet, intent])

  function datesChanged(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    setQuote(null)
    setError('')
  }
  async function checkAvailability(e: FormEvent) {
    e.preventDefault()
    const validation = validateRentalDates(startDate, endDate)
    if (validation.error) {
      setError(validation.error)
      return
    }
    if (!rentable) {
      setError('Thông tin xe thực tế hoặc giá thuê chưa được cập nhật.')
      return
    }
    setQuoteLoading(true)
    setError('')
    setQuote(null)
    try {
      const result = await api<Quote>(
        `/availability?${new URLSearchParams({ vehicle: selectedVehicle!.id, startDate, endDate })}`,
      )
      setQuote(result)
      if (!result.available)
        setError('Xe đã có lịch trong khoảng ngày này. Vui lòng chọn ngày khác.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setQuoteLoading(false)
    }
  }

  async function sendInquiry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const form = new FormData(e.currentTarget)
    setInquiryBusy(true)
    setInquiryError('')
    setFieldErrors({})
    try {
      const result = await api<{ reference: string }>('/inquiries', {
        method: 'POST',
        body: JSON.stringify({ model: model.id, phone: form.get('phone'), note: form.get('note') }),
      })
      setInquirySuccess(result.reference)
    } catch (e) {
      setInquiryError((e as Error).message)
      if (e instanceof RequestError) setFieldErrors(e.fields)
    } finally {
      setInquiryBusy(false)
    }
  }

  return (
    <main id="main-content" className="pb-16">
      <Container>
        <nav
          aria-label="Đường dẫn"
          className="flex flex-wrap items-center gap-2 py-6 text-caption text-muted"
        >
          <NoriLink href="/">Trang chủ</NoriLink>
          <Icon name="chevron-right" className="size-3" />
          <NoriLink href={`/vehicles?${categoryQuery}`}>{categoryLabels[model.category]}</NoriLink>
          <Icon name="chevron-right" className="size-3" />
          <Text as="span" className="text-ink">
            {model.name}
          </Text>
        </nav>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="brand">{model.brand}</Badge>
              <Badge>{model.bodyStyle ?? categoryLabels[model.category]}</Badge>
              <Badge>Catalogue</Badge>
            </div>
            <Heading as="h1" size="display">
              {model.name}
            </Heading>
          </div>
          <NoriLink
            href={`/vehicles?${catalogueQuery}`}
            className="flex min-h-touch items-center gap-2 text-small font-medium"
          >
            <Icon name="arrow-left" className="size-4" />
            Khám phá xe khác
          </NoriLink>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <section aria-label="Bộ ảnh catalogue">
              <div className="relative flex h-gallery-mobile items-center justify-center overflow-hidden rounded-card bg-subtle md:h-gallery">
                {currentImage ? (
                  <Image
                    key={currentImage.url}
                    src={currentImage.url}
                    alt={currentImage.alt}
                    fill
                    sizes="(max-width: 1023px) 100vw, 66vw"
                    preload
                    className="object-cover"
                  />
                ) : (
                  <div className="px-6 text-center">
                    <Icon name="car" className="mx-auto mb-4 size-14 text-muted/40" />
                    <Text className="text-small text-muted">
                      {kind === 'INTERIOR'
                        ? 'Chưa cập nhật ảnh nội thất'
                        : variantColor
                          ? 'Chưa cập nhật ảnh đúng phiên bản và màu sắc'
                          : 'Chưa cập nhật hình ảnh'}
                    </Text>
                  </div>
                )}
                <Badge tone="inverse" className="absolute left-4 top-4">
                  <Icon name="info" className="size-3" />
                  Ảnh catalogue, không phải xe thực tế
                </Badge>
                {currentImage && (
                  <Button
                    variant="secondary"
                    onClick={() => setGalleryOpen(true)}
                    className="absolute bottom-4 right-4 min-h-control-sm gap-2 bg-canvas/95 px-3 py-2 text-caption"
                  >
                    <Icon name="grid" className="size-3.5" />
                    Xem ảnh lớn
                  </Button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  {(['EXTERIOR', 'INTERIOR'] as const).map((k) => (
                    <Button
                      key={k}
                      variant={kind === k ? 'dark' : 'secondary'}
                      aria-pressed={kind === k}
                      onClick={() => {
                        setKind(k)
                        setImageIndex(0)
                        setColorIndex(-1)
                      }}
                      className="min-h-control-sm px-4 py-2 text-caption"
                    >
                      {k === 'EXTERIOR' ? 'Ngoại thất' : 'Nội thất'}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <Text className="text-caption text-muted">
                    {images.length
                      ? `${(imageIndex % images.length) + 1} / ${images.length}`
                      : 'Chưa cập nhật'}
                  </Text>
                  <IconButton
                    icon="chevron-left"
                    label="Ảnh trước"
                    className="size-control-sm"
                    disabled={images.length < 2}
                    onClick={() => {
                      setImageIndex((imageIndex - 1 + images.length) % images.length)
                      setColorIndex(-1)
                    }}
                  />
                  <IconButton
                    icon="chevron-right"
                    label="Ảnh tiếp theo"
                    className="size-control-sm"
                    disabled={images.length < 2}
                    onClick={() => {
                      setImageIndex((imageIndex + 1) % images.length)
                      setColorIndex(-1)
                    }}
                  />
                </div>
              </div>
            </section>
            <div className="mt-8 grid gap-5 rounded-card border border-line p-5 sm:grid-cols-2">
              {model.variants.length ? (
                <>
                  <Select
                    id="model-variant"
                    label="Phiên bản catalogue"
                    value={variantIndex}
                    onChange={(e) => {
                      setVariantIndex(Number(e.target.value))
                      setColorIndex(-1)
                    }}
                  >
                    <option value={-1}>Chọn phiên bản</option>
                    {model.variants.map((v, i) => (
                      <option value={i} key={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                  <div>
                    <Text className="mb-2 text-small font-medium">Màu catalogue</Text>
                    <div className="flex flex-wrap gap-2">
                      {model.variants[variantIndex]?.colors.map((c, i) => (
                        <Button
                          key={c.name}
                          aria-pressed={colorIndex === i}
                          onClick={() => {
                            setColorIndex(i)
                            setKind('EXTERIOR')
                          }}
                          variant={colorIndex === i ? 'primary' : 'secondary'}
                          className="text-caption"
                        >
                          {c.name}
                        </Button>
                      )) ?? (
                        <Text className="py-3 text-small text-muted">Chọn phiên bản trước</Text>
                      )}
                      {variantIndex >= 0 && !model.variants[variantIndex]?.colors.length && (
                        <Text className="py-3 text-small text-muted">
                          Chưa cập nhật màu của phiên bản này
                        </Text>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Text className="mb-2 text-caption text-muted">Phiên bản catalogue</Text>
                    <Text className="font-medium">Chưa cập nhật</Text>
                  </div>
                  <div>
                    <Text className="mb-2 text-caption text-muted">Màu sắc đã xác thực</Text>
                    <Text className="font-medium">Chưa cập nhật</Text>
                  </div>
                </>
              )}
            </div>
            <nav
              aria-label="Nội dung chi tiết"
              className="mt-8 flex gap-6 overflow-x-auto border-b border-line text-small font-medium"
            >
              <NoriLink
                href="#overview"
                className="whitespace-nowrap border-b-2 border-brand py-4 text-brand"
              >
                Tổng quan
              </NoriLink>
              <NoriLink href="#specifications" className="whitespace-nowrap py-4">
                Thông số kỹ thuật
              </NoriLink>
              <NoriLink href="#actual-condition" className="whitespace-nowrap py-4">
                Xe thực tế & ODO
              </NoriLink>
            </nav>
            <section id="overview" className="border-b border-line py-8">
              <Heading size="title">Về {model.name}</Heading>
              <Text className="mt-4 whitespace-pre-line leading-loose text-muted">
                {model.description || 'Thông tin giới thiệu đang được cập nhật.'}
              </Text>
              <Notice className="mt-5">
                Catalogue giới thiệu dòng xe, không cam kết phiên bản, màu sắc hay tình trạng của
                một chiếc xe cụ thể. Vui lòng xem phần xe thực tế trước khi đặt thuê hoặc mua.
              </Notice>
            </section>
            <section id="specifications" className="border-b border-line py-8">
              <Heading size="title">Thông số kỹ thuật</Heading>
              <Text className="mb-5 mt-2 text-small text-muted">
                Chỉ hiển thị thông số có nguồn và phiên bản áp dụng.
              </Text>
              <dl className="grid sm:grid-cols-2">
                {(model.specifications.length
                  ? model.specifications
                  : [
                      'Động cơ',
                      'Hộp số',
                      'Số chỗ ngồi',
                      'Nhiên liệu',
                      'Kích thước',
                      'Dung tích',
                    ].map((label) => ({ label, value: 'Chưa cập nhật', source: null }))
                ).map((s, i) => (
                  <div key={`${s.label}-${i}`} className="border-b border-line py-4 odd:sm:pr-7">
                    <dt className="text-caption text-muted">{s.label}</dt>
                    <dd className="mt-1 text-small font-medium">{s.value}</dd>
                    {s.source && <Text className="mt-1 text-micro text-muted">{s.source}</Text>}
                  </div>
                ))}
              </dl>
            </section>
            <section id="actual-condition" className="py-8">
              <Heading size="title">Tình trạng phương tiện thực tế</Heading>
              <Text className="mb-5 mt-2 text-small text-muted">
                ODO, phiên bản và ảnh gắn với chiếc xe bạn đã chọn, không lấy từ catalogue.
              </Text>
              {fleetLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : selectedVehicle ? (
                <>
                  <dl className="grid grid-cols-2 gap-5 rounded-card bg-subtle p-5">
                    {[
                      ['Mã xe', selectedVehicle.reference],
                      [
                        'ODO thực tế',
                        selectedVehicle.odometer == null
                          ? 'Chưa cập nhật'
                          : `${new Intl.NumberFormat('vi-VN').format(selectedVehicle.odometer)} km`,
                      ],
                      ['Phiên bản', selectedVehicle.version],
                      ['Màu sắc', selectedVehicle.color],
                      [
                        'Kiểm tra gần nhất',
                        selectedVehicle.inspectedAt
                          ? formatDate(selectedVehicle.inspectedAt)
                          : null,
                      ],
                      ['Tình trạng', selectedVehicle.condition],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="mb-1 text-caption text-muted">{label}</dt>
                        <dd className="break-words text-small font-medium">
                          {value || 'Chưa cập nhật'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {selectedVehicle.photos.length ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {selectedVehicle.photos.map((p, i) => (
                        <figure key={`${p.image.url}-${i}`}>
                          <div className="relative aspect-vehicle overflow-hidden rounded-card bg-subtle">
                            <Image
                              src={p.image.url}
                              alt={p.image.alt}
                              fill
                              sizes="(max-width: 767px) 100vw, 33vw"
                              className="object-cover"
                            />
                            <Badge tone="inverse" className="absolute left-3 top-3">
                              Ảnh xe thực tế
                            </Badge>
                          </div>
                          <figcaption className="mt-2 text-caption text-muted">
                            {p.caption || selectedVehicle.reference}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <Text className="mt-4 text-small text-muted">
                      Ảnh xe thực tế: Chưa cập nhật.
                    </Text>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="car"
                  title="Chưa công bố xe thực tế"
                  description="Chưa cập nhật ODO, phiên bản, màu sắc và tình trạng thực tế. NORI không sử dụng ảnh catalogue để thay thế thông tin này."
                />
              )}
            </section>
            {model.source && /^https:\/\//.test(model.source) && (
              <Text className="pb-4 text-micro text-muted">
                Nguồn ảnh catalogue:{' '}
                <ExternalLink href={model.source} target="_blank">
                  Xem ảnh gốc <Icon name="external" className="ml-1 inline size-3" />
                </ExternalLink>
              </Text>
            )}
          </div>
          <aside
            aria-label="Lựa chọn dịch vụ và đặt xe"
            className="rounded-card border border-line bg-canvas p-5 shadow-card lg:sticky lg:top-5"
          >
            <div className="mb-5 flex rounded-control bg-subtle p-1">
              {(['rent', 'buy'] as const).map((value) => (
                <Button
                  key={value}
                  onClick={() => {
                    setIntent(value)
                    setQuote(null)
                    setError('')
                    const v = fleet.find((v) =>
                      value === 'rent' ? v.intent !== 'SALE' : v.intent !== 'RENT',
                    )
                    setVehicleId(v?.id ?? '')
                  }}
                  aria-pressed={intent === value}
                  variant="ghost"
                  className={cn(
                    'min-h-control-sm flex-1 py-2 text-small',
                    intent === value && 'bg-canvas text-brand shadow-sm',
                  )}
                >
                  {value === 'rent' ? 'Thuê xe' : 'Mua xe'}
                </Button>
              ))}
            </div>
            <Text className="text-caption text-muted">
              {intent === 'rent' ? 'Giá thuê / ngày' : 'Giá bán'}
            </Text>
            <Text className="mt-1 text-title font-semibold text-brand">{formatMoney(price)}</Text>
            <Text className="mt-2 text-micro text-muted">
              {price
                ? 'Giá của chiếc xe thực tế được chọn.'
                : 'Giá sẽ hiển thị khi có xe thực tế được xác nhận.'}
            </Text>
            <div className="my-5 h-px bg-line" />
            {fleetLoading ? (
              <Skeleton className="mb-4 h-control" />
            ) : fleetError ? (
              <div className="mb-4">
                <Notice tone="error">{fleetError}</Notice>
                <Button
                  variant="ghost"
                  onClick={() => setRetry(retry + 1)}
                  className="text-caption text-brand"
                >
                  Thử tải lại xe
                </Button>
              </div>
            ) : eligible.length ? (
              <Select
                id="actual-vehicle"
                label="Chọn xe thực tế"
                value={vehicleId}
                onChange={(e) => {
                  setVehicleId(e.target.value)
                  setQuote(null)
                  setError('')
                }}
                wrapperClassName="mb-5"
              >
                <option value="">Chọn một chiếc xe</option>
                {eligible.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reference}
                    {v.color ? ` · ${v.color}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <Notice className="mb-5">
                Chưa có xe thực tế cho dịch vụ {intent === 'rent' ? 'thuê' : 'mua'} được công bố.
                Catalogue vẫn có thể xem bình thường.
              </Notice>
            )}
            {intent === 'rent' ? (
              <form onSubmit={checkAvailability}>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="detail-start"
                    label="Ngày nhận xe"
                    type="date"
                    value={startDate}
                    min={businessToday()}
                    max={addDays(businessToday(), 90)}
                    onChange={(e) => datesChanged(e.target.value, endDate)}
                    required
                  />
                  <Input
                    id="detail-end"
                    label="Ngày trả xe"
                    type="date"
                    value={endDate}
                    min={startDate ? addDays(startDate, 1) : businessToday()}
                    max={startDate ? addDays(startDate, 30) : undefined}
                    onChange={(e) => datesChanged(startDate, e.target.value)}
                    required
                  />
                </div>
                <div className="my-4">
                  <AvailabilityCalendar
                    vehicle={rentable ? selectedVehicle!.id : null}
                    startDate={startDate}
                    endDate={endDate}
                    onChange={datesChanged}
                  />
                </div>
                {quote?.available && (
                  <div className="mb-4 space-y-2 rounded-control bg-subtle p-4 text-small">
                    <div className="flex justify-between gap-3">
                      <Text>
                        {formatMoney(quote.dailyPrice)} × {quote.totalDays} ngày
                      </Text>
                      <Text className="font-medium">{formatMoney(quote.estimatedTotal)}</Text>
                    </div>
                    <Text className="text-micro text-muted">
                      Chưa thu tiền. Giá được kiểm tra lại khi xác nhận.
                    </Text>
                  </div>
                )}
                {error && (
                  <Notice tone="error" className="mb-4">
                    {error}
                  </Notice>
                )}
                {quote?.available ? (
                  <ButtonLink
                    href={`/checkout?${new URLSearchParams({ vehicle: selectedVehicle!.id, startDate, endDate })}`}
                    className="w-full"
                  >
                    Tiếp tục đặt thuê <Icon name="arrow-right" className="size-4" />
                  </ButtonLink>
                ) : (
                  <Button
                    type="submit"
                    loading={quoteLoading}
                    disabled={!rentable || fleetLoading}
                    className="w-full"
                  >
                    <Icon name="calendar" className="size-4" />
                    Kiểm tra lịch & giá
                  </Button>
                )}
                <Text className="mt-3 text-center text-micro text-muted">
                  {!rentable
                    ? 'Cần có xe thực tế và giá trước khi đặt thuê.'
                    : 'Thuê từ 1 đến 30 ngày. Ngày trả không tính thêm.'}
                </Text>
              </form>
            ) : (
              <div>
                <Text className="mb-4 text-small text-muted">
                  Nhận tư vấn về xe, phiên bản và giá đã xác nhận. Yêu cầu tư vấn không phải là đơn
                  mua hoặc cam kết xe còn hàng.
                </Text>
                <Button
                  onClick={() => {
                    setInquiryOpen(true)
                    setInquiryError('')
                  }}
                  className="w-full"
                >
                  Đăng ký tư vấn mua xe <Icon name="arrow-up-right" className="size-4" />
                </Button>
              </div>
            )}
            <div className="mt-6 space-y-3 border-t border-line pt-5 text-caption text-muted">
              <Text className="flex items-start gap-2">
                <Icon name="pin" className="mt-0.5 size-4 text-brand" />
                <span>Nhận & trả tại: {address || 'Chưa cập nhật địa chỉ'}</span>
              </Text>
              <Text className="flex items-center gap-2">
                <Icon name="shield" className="size-4 text-brand" />
                Không thu tiền trực tuyến
              </Text>
              <NoriLink
                href="/support#conditions"
                className="flex min-h-touch items-center gap-2 font-medium text-ink"
              >
                Xem điều kiện & chính sách <Icon name="arrow-up-right" className="size-3.5" />
              </NoriLink>
            </div>
          </aside>
        </div>
      </Container>
      <Dialog
        title={`${model.name} — ${kind === 'EXTERIOR' ? 'Ngoại thất' : 'Nội thất'}`}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        wide
      >
        <div className="relative h-gallery-mobile overflow-hidden rounded-card bg-subtle md:h-gallery">
          {currentImage && (
            <Image
              src={currentImage.url}
              alt={currentImage.alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <Text className="text-caption text-muted">
            Ảnh catalogue tham khảo ·{' '}
            {images.length ? `${(imageIndex % images.length) + 1}/${images.length}` : ''}
          </Text>
          <div className="flex gap-2">
            <IconButton
              icon="chevron-left"
              label="Ảnh trước"
              disabled={images.length < 2}
              onClick={() => setImageIndex((imageIndex - 1 + images.length) % images.length)}
            />
            <IconButton
              icon="chevron-right"
              label="Ảnh tiếp theo"
              disabled={images.length < 2}
              onClick={() => setImageIndex((imageIndex + 1) % images.length)}
            />
          </div>
        </div>
      </Dialog>
      <Dialog title="Tư vấn mua xe" open={inquiryOpen} onClose={() => setInquiryOpen(false)}>
        {inquirySuccess ? (
          <div className="py-5">
            <Notice tone="success">
              NORI đã tiếp nhận yêu cầu {inquirySuccess.slice(0, 11).toUpperCase()} cho {model.name}
              . Bạn có thể theo dõi trong tài khoản.
            </Notice>
            <ButtonLink href="/account" className="mt-6 w-full">
              Đến tài khoản của tôi <Icon name="arrow-right" className="size-4" />
            </ButtonLink>
          </div>
        ) : !user ? (
          <div>
            <Text className="mb-5 text-muted">
              Đăng nhập để gửi và theo dõi yêu cầu tư vấn cho {model.name}.
            </Text>
            <ButtonLink
              href={`/login?returnTo=${encodeURIComponent(`/vehicles/${model.slug}?intent=buy`)}`}
              className="w-full"
            >
              Đăng nhập để tiếp tục
            </ButtonLink>
          </div>
        ) : (
          <form onSubmit={sendInquiry} className="space-y-5">
            <Text className="text-muted">
              Bạn quan tâm{' '}
              <Text as="span" className="font-semibold text-ink">
                {model.name}
              </Text>
              . NORI sẽ tiếp nhận nhu cầu của bạn; thông tin giá và xe còn hàng cần được xác nhận
              riêng.
            </Text>
            <Input
              id="inquiry-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              label="Số điện thoại liên hệ"
              defaultValue={user.phone ?? ''}
              error={fieldErrors.phone}
              required
              maxLength={16}
            />
            <Textarea
              id="inquiry-note"
              name="note"
              label="Bạn muốn NORI tư vấn điều gì?"
              rows={4}
              maxLength={1000}
              placeholder="Phiên bản, nhu cầu sử dụng, thời gian dự kiến…"
            />
            {inquiryError && <Notice tone="error">{inquiryError}</Notice>}
            <Text className="text-caption text-muted">
              Thông tin chỉ được dùng để xử lý yêu cầu này. Không phát sinh thanh toán.
            </Text>
            <Button type="submit" className="w-full" loading={inquiryBusy}>
              Gửi yêu cầu tư vấn <Icon name="arrow-right" className="size-4" />
            </Button>
          </form>
        )}
      </Dialog>
    </main>
  )
}
