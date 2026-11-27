'use client'

import Image from 'next/image'
import Link from 'next/link'
import type {
  AIBookingHandoff,
  AIComparisonTable,
  AIPolicyCitation,
  AIQuoteSummary,
  AIVehicleCard,
} from '@/lib/ai/types'
import { formatMoney, formatVnd } from '@/lib/rental-rules'
import { Badge, Button, ButtonLink, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

type TrackEventFn = (eventType: 'VEHICLE_CLICK' | 'CHECKOUT_HANDOFF', modelSlug: string) => void

export function AIVehicleCards({
  cards,
  onCompare,
  onNavigate,
  onTrackEvent,
}: {
  cards: AIVehicleCard[]
  onCompare: (card: AIVehicleCard, allCards: AIVehicleCard[]) => void
  onNavigate?: () => void
  onTrackEvent: TrackEventFn
}) {
  if (!cards.length) return null

  return (
    <div className="mt-3 space-y-2.5" aria-label="Danh sách phương tiện NORI đề xuất">
      {cards.map((card) => {
        const isCheckoutTarget = card.bookingHref.startsWith('/checkout')
        const availTone =
          card.availabilityStatus === 'AVAILABLE_REFERENCE'
            ? 'brand'
            : card.availabilityStatus === 'UNAVAILABLE'
              ? 'danger'
              : 'muted'
        const availLabel =
          card.availabilityStatus === 'AVAILABLE_REFERENCE'
            ? 'Còn lịch (tham khảo)'
            : card.availabilityStatus === 'UNAVAILABLE'
              ? 'Không khả dụng'
              : 'Chọn ngày kiểm tra'

        return (
          <article
            key={`${card.slug}-${card.vehicleId ?? 'model'}`}
            data-testid="ai-vehicle-card"
            className="overflow-hidden rounded-card border border-line bg-canvas shadow-card"
          >
            <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <div className="relative aspect-[1.55] w-full self-start overflow-hidden rounded-control bg-subtle">
                {card.imageUrl ? (
                  <Image
                    src={card.imageUrl}
                    alt={card.imageAlt || card.name}
                    fill
                    sizes="(max-width: 768px) 110px, 128px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted">
                    <Icon name="car" className="size-6" />
                  </div>
                )}
                {card.isDemo && (
                  <span className="absolute left-1.5 top-1.5 rounded-pill bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                    DEMO
                  </span>
                )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <p className="text-micro font-medium uppercase tracking-wider text-muted">
                      {card.brand}
                      {card.subCategory ? ` · ${card.subCategory}` : ''}
                    </p>
                    <h4 className="line-clamp-2 text-small font-semibold leading-snug text-ink">
                      {card.name}
                    </h4>
                  </div>
                  {card.score !== null && (
                    <Badge tone="brand" className="shrink-0">
                      {card.score}/100
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-micro text-muted">
                  <span>{card.seats ? `${card.seats} chỗ` : 'Chỗ: Chưa cập nhật'}</span>
                  <span>·</span>
                  <span>{card.fuelType || 'Nhiên liệu: Chưa cập nhật'}</span>
                  {card.transmission && (
                    <>
                      <span>·</span>
                      <span>{card.transmission}</span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 pt-0.5">
                  <div>
                    <span className="text-body font-semibold text-brand">
                      {card.pricePerDay ? `${formatMoney(card.pricePerDay)}/ngày` : 'Chưa cập nhật'}
                    </span>
                    {card.estimatedTotal !== null && card.totalDays !== null && (
                      <span className="ml-1.5 text-micro text-muted">
                        (Dự kiến {formatMoney(card.estimatedTotal)}/{card.totalDays} ngày)
                      </span>
                    )}
                  </div>
                  <Badge tone={availTone}>{availLabel}</Badge>
                </div>

                {card.reasons.length > 0 && (
                  <ul className="space-y-0.5 pt-1 text-micro text-muted">
                    {card.reasons.slice(0, 2).map((r, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Icon name="check" className="mt-0.5 size-3 shrink-0 text-brand" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-subtle/60 px-3 py-2">
              <Link
                href={card.detailHref}
                onClick={() => {
                  onTrackEvent('VEHICLE_CLICK', card.slug)
                  onNavigate?.()
                }}
                className="inline-flex min-h-control-sm items-center justify-center gap-1 rounded-control border border-line bg-canvas px-2.5 py-1.5 text-micro font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Xem chi tiết
              </Link>
              <Link
                href={card.bookingHref}
                onClick={() => {
                  onTrackEvent(isCheckoutTarget ? 'CHECKOUT_HANDOFF' : 'VEHICLE_CLICK', card.slug)
                  onNavigate?.()
                }}
                className="inline-flex min-h-control-sm items-center justify-center gap-1 rounded-control bg-brand px-3 py-1.5 text-micro font-semibold text-inverse transition-colors hover:bg-brand-hover"
              >
                {isCheckoutTarget ? 'Đến Checkout' : 'Chọn thuê'}
                <Icon name="arrow-right" className="size-3.5" />
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-control-sm px-2.5 py-1.5 text-micro"
                onClick={() => onCompare(card, cards)}
              >
                So sánh xe
              </Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function AIQuoteCard({
  quote,
  onNavigate,
  onTrackEvent,
}: {
  quote: AIQuoteSummary
  onNavigate?: () => void
  onTrackEvent: TrackEventFn
}) {
  return (
    <div
      data-testid="ai-quote-card"
      className="mt-3 rounded-card border border-brand/30 bg-brand-soft/45 p-3.5 text-caption"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div>
          <p className="text-micro font-semibold uppercase tracking-wider text-brand">
            Báo giá dự kiến từ Business Rule Engine
          </p>
          <p className="text-small font-semibold text-ink">
            {quote.modelName} ({quote.vehicleReference})
          </p>
        </div>
        <Badge tone={quote.available ? 'brand' : 'danger'}>
          {quote.available ? 'Còn trống (tham khảo)' : 'Không khả dụng'}
        </Badge>
      </div>

      <dl className="mt-2.5 space-y-1.5 text-caption">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Thời gian thuê</dt>
          <dd className="font-medium text-ink">
            {quote.startDate} → {quote.endDate} ({quote.totalDays} ngày)
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Giá cơ bản ({formatMoney(quote.dailyPrice)}/ngày)</dt>
          <dd className="font-medium text-ink">{formatMoney(quote.basePrice)}</dd>
        </div>
        {quote.weekendSurchargeTotal > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Phụ phí cuối tuần ({quote.weekendDays} ngày)</dt>
            <dd className="font-medium text-ink">+{formatVnd(quote.weekendSurchargeTotal)}</dd>
          </div>
        )}
        {quote.holidaySurchargeTotal > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Phụ phí ngày lễ ({quote.holidayDays} ngày)</dt>
            <dd className="font-medium text-ink">+{formatVnd(quote.holidaySurchargeTotal)}</dd>
          </div>
        )}
        {quote.addonFee > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Dịch vụ bổ sung</dt>
            <dd className="font-medium text-ink">+{formatVnd(quote.addonFee)}</dd>
          </div>
        )}
        {quote.deliveryFee > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Phí giao xe tận nơi</dt>
            <dd className="font-medium text-ink">+{formatVnd(quote.deliveryFee)}</dd>
          </div>
        )}
        {quote.discountAmount > 0 && (
          <div className="flex justify-between gap-2 text-brand">
            <dt>Chiết khấu thuê dài ngày</dt>
            <dd className="font-semibold">-{formatVnd(quote.discountAmount)}</dd>
          </div>
        )}
        {quote.promoDiscountAmount > 0 && (
          <div className="flex justify-between gap-2 text-brand">
            <dt>Khuyến mãi ({quote.promoCode})</dt>
            <dd className="font-semibold">-{formatVnd(quote.promoDiscountAmount)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2 border-t border-line pt-2 text-small font-semibold text-ink">
          <dt>Tổng tiền thuê dự kiến</dt>
          <dd className="text-brand">{formatMoney(quote.estimatedTotal)}</dd>
        </div>
        <div className="flex justify-between gap-2 text-micro text-muted">
          <dt>Tiền cọc đảm bảo tham khảo</dt>
          <dd className="font-medium text-ink">{formatVnd(quote.depositAmount)}</dd>
        </div>
      </dl>

      {quote.available && (
        <div className="mt-3">
          <ButtonLink
            href={quote.bookingHref}
            onClick={() => {
              onTrackEvent('CHECKOUT_HANDOFF', quote.modelSlug)
              onNavigate?.()
            }}
            className="min-h-control-sm w-full py-2 text-caption"
          >
            Tiếp tục đặt thuê tại Checkout <Icon name="arrow-right" className="size-3.5" />
          </ButtonLink>
        </div>
      )}
    </div>
  )
}

export function AIComparisonCard({
  comparison,
  onNavigate,
}: {
  comparison: AIComparisonTable
  onNavigate?: () => void
}) {
  if (!comparison.vehicles.length) return null
  return (
    <div
      data-testid="ai-comparison-table"
      className="mt-3 overflow-x-auto rounded-card border border-line bg-canvas"
    >
      <table className="w-full min-w-[340px] border-collapse text-left text-micro">
        <thead>
          <tr className="border-b border-line bg-subtle">
            <th className="px-2.5 py-2 font-semibold text-muted">Tiêu chí</th>
            {comparison.vehicles.map((v) => (
              <th key={v.slug} className="px-2.5 py-2 font-semibold text-ink">
                <NoriLink href={v.detailHref} onClick={onNavigate} className="underline">
                  {v.name}
                </NoriLink>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {comparison.rows.map((row) => (
            <tr key={row.label}>
              <td className="px-2.5 py-2 font-medium text-muted">{row.label}</td>
              {row.values.map((val, idx) => (
                <td key={idx} className="px-2.5 py-2 text-ink">
                  {val || 'Chưa cập nhật'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AIBookingHandoffCard({
  handoff,
  onNavigate,
  onTrackEvent,
}: {
  handoff: AIBookingHandoff
  onNavigate?: () => void
  onTrackEvent: TrackEventFn
}) {
  return (
    <div
      data-testid="ai-booking-handoff"
      className="mt-3 rounded-card border border-brand bg-brand-soft/60 p-3.5"
    >
      <p className="text-caption font-semibold text-ink">{handoff.modelName}</p>
      <Text className="mt-1 text-micro text-muted">{handoff.note}</Text>
      <ButtonLink
        href={handoff.targetUrl}
        onClick={() => {
          onTrackEvent(
            handoff.readyForCheckout ? 'CHECKOUT_HANDOFF' : 'VEHICLE_CLICK',
            handoff.modelSlug,
          )
          onNavigate?.()
        }}
        className="mt-2.5 min-h-control-sm w-full py-2 text-caption"
      >
        {handoff.actionLabel} <Icon name="arrow-right" className="size-3.5" />
      </ButtonLink>
    </div>
  )
}

export function AIPolicyCitationsList({
  citations,
  onNavigate,
}: {
  citations: AIPolicyCitation[]
  onNavigate?: () => void
}) {
  if (!citations.length) return null
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Nguồn tài liệu NORI">
      {citations.map((cite) => (
        <NoriLink
          key={`${cite.href}-${cite.title}`}
          href={cite.href}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-pill border border-line bg-canvas px-2.5 py-1 text-micro font-medium text-brand hover:border-brand hover:bg-brand-soft"
        >
          <Icon name="file" className="size-3" />
          <span className="max-w-[200px] truncate">{cite.title}</span>
          <Icon name="arrow-up-right" className="size-3" />
        </NoriLink>
      ))}
    </div>
  )
}
