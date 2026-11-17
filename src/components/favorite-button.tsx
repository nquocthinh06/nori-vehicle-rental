'use client'

import { useFavorites } from './favorites-provider'
import { Icon } from './ui/icon'
import { cn } from './ui'

export function FavoriteButton({
  slug,
  name,
  className,
}: {
  slug: string
  name: string
  className?: string
}) {
  const { isFavorite, toggleFavorite, hydrated } = useFavorites()
  const active = hydrated && isFavorite(slug)

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Bỏ ${name} khỏi yêu thích` : `Lưu ${name} vào yêu thích`}
      onClick={() => toggleFavorite(slug)}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-pill border transition-colors focus-visible:outline-offset-2 active:scale-95',
        active
          ? 'border-brand bg-brand text-inverse hover:bg-brand-hover'
          : 'border-line/80 bg-canvas/95 text-ink hover:border-brand hover:text-brand',
        className,
      )}
    >
      <Icon name="heart" className={cn('size-5', active && 'fill-current')} />
    </button>
  )
}
