import Image from 'next/image'
import type { Category, ModelView } from '@/lib/catalogue'
import { Badge, Heading, NoriLink, Text, cn } from './ui'
import { Icon, type IconName } from './ui/icon'
import { formatMoney } from '@/lib/rental-rules'

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
}: {
  model: ModelView
  intent?: 'rent' | 'buy'
  compact?: boolean
  layout?: 'grid' | 'list'
  startDate?: string | null
  endDate?: string | null
}) {
  const price = intent === 'rent' ? model.pricePerDay : model.salePrice
  const query = new URLSearchParams()
  if (intent === 'buy') query.set('intent', 'buy')
  else if (startDate && endDate) {
    query.set('startDate', startDate)
    query.set('endDate', endDate)
  }
  const href = `/vehicles/${model.slug}${query.size ? `?${query}` : ''}`
  return (
    <article
      className={cn(
        'group overflow-hidden rounded-card border border-line bg-canvas transition-shadow hover:shadow-card',
        layout === 'list' && 'sm:grid sm:grid-cols-3',
      )}
    >
      <NoriLink
        href={href}
        aria-label={`Xem ${model.name}`}
        className={cn(
          'relative block aspect-vehicle overflow-hidden bg-subtle',
          layout === 'list' && 'sm:col-span-1 sm:aspect-auto sm:min-h-52',
        )}
      >
        {model.cover ? (
          <Image
            src={model.cover.url}
            alt={model.cover.alt}
            fill
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Icon name={categoryIcons[model.category]} className="size-16 opacity-25" />
          </div>
        )}
        <Badge tone="inverse" className="absolute left-4 top-4">
          Ảnh catalogue
        </Badge>
        <span className="absolute bottom-4 right-4 flex size-8 items-center justify-center rounded-pill bg-canvas/95 text-ink transition-colors group-hover:bg-brand group-hover:text-inverse">
          <Icon name="arrow-up-right" className="size-4" />
        </span>
      </NoriLink>
      <div className={cn(compact ? 'p-4' : 'p-5', layout === 'list' && 'sm:col-span-2')}>
        <Text className="mb-2 text-micro font-medium uppercase tracking-widest text-muted">
          {model.brand}{' '}
          <span aria-hidden="true" className="mx-1.5 text-muted">
            /
          </span>{' '}
          {model.bodyStyle ?? categoryLabels[model.category]}
        </Text>
        <Heading as="h3" size="subtitle">
          <NoriLink href={href} className="line-clamp-2">
            {model.name}
          </NoriLink>
        </Heading>
        <div className="mt-3 flex items-center gap-4 text-caption text-muted">
          <Text as="span" className="inline-flex items-center gap-1.5">
            <Icon name={categoryIcons[model.category]} className="size-3.5" />
            {categoryLabels[model.category]}
          </Text>
          <span className="h-3 w-px bg-line" />
          <Text as="span">Catalogue tham khảo</Text>
        </div>
        <div className="mt-5 flex items-end justify-between gap-2 border-t border-line pt-4">
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
