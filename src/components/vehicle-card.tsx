import Image from 'next/image'
import type { Category, ModelView } from '@/lib/catalogue'
import { formatMoney, subCategoryLabels } from '@/lib/rental-rules'
import { FavoriteButton } from './favorite-button'
import { Badge, Heading, NoriLink, Text, cn } from './ui'
import { Icon, type IconName } from './ui/icon'

export const categoryLabels: Record<Category, string> = {
  CAR: 'Ô tô',
  MOTORBIKE: 'Xe máy',
  PICKUP: 'Bán tải',
}
export const categoryIcons: Record<Category, IconName> = {
  CAR: 'car',
  MOTORBIKE: 'motorbike',
  PICKUP: 'pickup',
}

export function VehicleCard({
  model,
  intent = 'rent',
  compact = false,
  layout = 'grid',
  startDate,
  endDate,
  pickupBranchId,
  returnBranchId,
}: {
  model: ModelView
  intent?: 'rent' | 'buy'
  compact?: boolean
  layout?: 'grid' | 'list'
  startDate?: string | null
  endDate?: string | null
  pickupBranchId?: string | null
  returnBranchId?: string | null
}) {
  const price = intent === 'rent' ? model.pricePerDay : model.salePrice
  const availableCount = intent === 'rent' ? model.availableRentCount : model.availableSaleCount
  const subLabel =
    (model.subCategory ? subCategoryLabels[model.subCategory] : null) ??
    model.bodyStyle ??
    categoryLabels[model.category]

  const query = new URLSearchParams()
  if (intent === 'buy') query.set('intent', 'buy')
  else {
    if (startDate && endDate) {
      query.set('startDate', startDate)
      query.set('endDate', endDate)
    }
    if (pickupBranchId) query.set('pickupBranchId', pickupBranchId)
    if (returnBranchId && returnBranchId !== pickupBranchId) {
      query.set('returnBranchId', returnBranchId)
    }
  }
  const href = `/vehicles/${model.slug}${query.size ? `?${query}` : ''}`

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-card border border-line bg-canvas transition-shadow hover:shadow-card',
        layout === 'list' && 'sm:grid sm:grid-cols-3',
      )}
    >
      <div
        className={cn(
          'relative aspect-vehicle overflow-hidden bg-subtle',
          layout === 'list' && 'sm:col-span-1 sm:aspect-auto sm:min-h-56',
        )}
      >
        <NoriLink href={href} aria-label={`Xem ${model.name}`} className="block size-full">
          {model.cover ? (
            <Image
              src={model.cover.url}
              alt={model.cover.alt}
              fill
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Icon name={categoryIcons[model.category]} className="size-16 opacity-25" />
            </div>
          )}
          <span className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-pill bg-canvas/95 text-ink transition-colors group-hover:bg-brand group-hover:text-inverse">
            <Icon name="arrow-up-right" className="size-4" />
          </span>
        </NoriLink>
        <div className="pointer-events-none absolute left-3 top-3 right-14 flex flex-wrap gap-1.5">
          <Badge tone="inverse">Ảnh catalogue</Badge>
          {model.hasDemoFleet && (
            <Badge tone="brand">
              {availableCount > 0 ? `${availableCount} xe · DEMO` : 'Xe DEMO'}
            </Badge>
          )}
        </div>
        <FavoriteButton
          slug={model.slug}
          name={model.name}
          className="absolute right-3 top-3 z-10"
        />
      </div>
      <div className={cn(compact ? 'p-4' : 'p-5', layout === 'list' && 'sm:col-span-2')}>
        <Text className="mb-1.5 text-micro font-medium uppercase tracking-widest text-muted">
          {model.brand}
          <span aria-hidden="true" className="mx-1.5 text-muted">
            /
          </span>
          {subLabel}
          {model.modelYear ? ` · ${model.modelYear}` : ''}
        </Text>
        <Heading as="h3" size="subtitle">
          <NoriLink href={href} className="line-clamp-2">
            {model.name}
          </NoriLink>
        </Heading>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
          <Text as="span" className="inline-flex items-center gap-1">
            <Icon name={categoryIcons[model.category]} className="size-3.5" />
            {categoryLabels[model.category]}
          </Text>
          {model.seats && (
            <>
              <span className="h-3 w-px bg-line" />
              <Text as="span">{model.seats} chỗ</Text>
            </>
          )}
          {model.fuelType && (
            <>
              <span className="h-3 w-px bg-line" />
              <Text as="span">{model.fuelType}</Text>
            </>
          )}
          {model.transmission && (
            <>
              <span className="h-3 w-px bg-line" />
              <Text as="span" className="truncate max-w-36">
                {model.transmission}
              </Text>
            </>
          )}
        </div>
        <div className="mt-4 flex items-end justify-between gap-2 border-t border-line pt-4">
          <div>
            <Text className="mb-1 text-caption text-muted">
              {intent === 'rent' ? 'Giá thuê' : 'Giá bán'}
              {price ? ' từ' : ''}
            </Text>
            <Text
              className={
                price
                  ? 'text-subtitle font-semibold text-brand'
                  : 'text-body font-semibold text-ink'
              }
            >
              {formatMoney(price)}
              {price && intent === 'rent' && (
                <Text as="span" className="ml-1 text-caption font-normal text-muted">
                  / ngày
                </Text>
              )}
            </Text>
            {intent === 'buy' && model.listedPrice && (
              <Text className="mt-0.5 text-micro text-muted">
                Niêm yết tham khảo: {formatMoney(model.listedPrice)}
              </Text>
            )}
          </div>
          <NoriLink
            href={href}
            className="flex min-h-touch items-center gap-1 text-caption font-semibold"
          >
            Chi tiết <Icon name="arrow-right" className="size-3.5" />
          </NoriLink>
        </div>
      </div>
    </article>
  )
}
