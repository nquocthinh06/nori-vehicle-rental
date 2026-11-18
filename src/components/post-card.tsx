import Image from 'next/image'
import type { PostView } from '@/lib/catalogue'
import { formatDate } from '@/lib/rental-rules'
import { Badge, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

const CATEGORY_LABELS: Record<PostView['category'], string> = {
  NEWS: 'Tin tức NORI',
  GUIDE: 'Cẩm nang',
  PROMOTION: 'Ưu đãi & Sự kiện',
}

function buildExcerpt(post: PostView): string {
  if (post.excerpt && post.excerpt.trim()) return post.excerpt.trim()
  const clean = post.content.replace(/\s+/g, ' ').trim()
  if (clean.length <= 150) return clean
  return `${clean.slice(0, 147)}...`
}

export function PostCard({ post }: { post: PostView }) {
  const bannerSrc = post.cover?.url || '/nori-post-fallback.svg'
  const bannerAlt = post.cover?.alt || post.title
  const href = `/posts/${post.slug}`
  const summary = buildExcerpt(post)

  return (
    <article
      data-testid={`post-card-${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-canvas transition-shadow hover:shadow-card"
    >
      <NoriLink
        href={href}
        aria-label={`Đọc bài viết ${post.title}`}
        className="relative block aspect-video w-full overflow-hidden bg-subtle"
      >
        <Image
          src={bannerSrc}
          alt={bannerAlt}
          fill
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 400px"
          loading="lazy"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </NoriLink>

      <div className="flex flex-1 flex-col justify-between gap-4 p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={post.category === 'PROMOTION' ? 'brand' : 'muted'}>
              {CATEGORY_LABELS[post.category] ?? post.category}
            </Badge>
            {post.category === 'PROMOTION' && post.promotion && (
              <Badge tone="warning">Mã: {post.promotion.code}</Badge>
            )}
          </div>

          <Heading as="h3" size="subtitle" className="line-clamp-2">
            <NoriLink href={href} className="hover:text-brand">
              {post.title}
            </NoriLink>
          </Heading>

          {summary && <Text className="line-clamp-3 text-small text-muted">{summary}</Text>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5 text-caption">
          <Text as="span" className="text-muted">
            {formatDate(post.publishedAt)}
          </Text>
          <NoriLink
            href={href}
            className="inline-flex min-h-touch items-center gap-1 font-semibold text-brand hover:underline"
          >
            Xem chi tiết
            <Icon name="arrow-right" className="size-3.5" />
          </NoriLink>
        </div>
      </div>
    </article>
  )
}
