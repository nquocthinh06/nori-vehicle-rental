import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  getPublishedPostBySlug,
  getPublishedPosts,
  getSiteContent,
  type PostPromotionView,
  type PostView,
} from '@/lib/catalogue'
import { businessToday, formatDate, formatVnd, getPromotionRuntimeStatus } from '@/lib/rental-rules'
import { PostCard } from '@/components/post-card'
import { CallToAction } from '@/components/home/sections'
import { Badge, ButtonLink, Container, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const dynamicParams = true

const CATEGORY_LABELS: Record<PostView['category'], string> = {
  NEWS: 'Tin tức NORI',
  GUIDE: 'Cẩm nang thuê & mua xe',
  PROMOTION: 'Ưu đãi & Sự kiện',
}

const SCOPE_LABELS: Record<PostPromotionView['appliesTo'], string> = {
  RENT: 'Thuê xe',
  SALE: 'Mua xe',
  ALL: 'Tất cả dịch vụ',
}

function formatDiscountSummary(promo: PostPromotionView): string {
  if (promo.discountType === 'PERCENT') {
    const cap = promo.maxDiscount ? ` (giảm tối đa ${formatVnd(promo.maxDiscount)})` : ''
    return `Giảm ${promo.discountValue}%${cap}`
  }
  return `Giảm trực tiếp ${formatVnd(promo.discountValue)}`
}

export async function generateStaticParams() {
  const posts = await getPublishedPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const [post, site] = await Promise.all([getPublishedPostBySlug(slug), getSiteContent()])

  if (!post) {
    return {
      title: 'Không tìm thấy bài viết | NORI',
      description: 'Bài viết không tồn tại hoặc chưa được xuất bản.',
      robots: { index: false, follow: false },
    }
  }

  const title = post.seoTitle?.trim() || `${post.title} | NORI`
  const description =
    post.seoDescription?.trim() ||
    post.excerpt?.trim() ||
    post.content.replace(/\s+/g, ' ').trim().slice(0, 160)

  const fallbackOg = site.ogImage?.url || '/seed-media/nori-hero-1.jpg'
  const ogImageUrl = post.cover?.url || fallbackOg
  const ogImages = post.cover?.url
    ? [
        {
          url: post.cover.url,
          width: post.cover.width || 1200,
          height: post.cover.height || 675,
          alt: post.cover.alt || post.title,
        },
      ]
    : [{ url: ogImageUrl, alt: post.title }]

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishedAt || undefined,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function PostDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [post, allPosts] = await Promise.all([getPublishedPostBySlug(slug), getPublishedPosts()])
  if (!post) notFound()

  const bannerSrc = post.cover?.url || '/nori-post-fallback.svg'
  const bannerAlt = post.cover?.alt || post.title
  const relatedPosts = allPosts.filter((item) => item.id !== post.id).slice(0, 3)

  const promoRuntime = post.promotion
    ? getPromotionRuntimeStatus(
        {
          active: post.promotion.active,
          validFrom: post.promotion.validFrom,
          validTo: post.promotion.validTo,
          usageLimit: post.promotion.usageLimit,
          usedCount: post.promotion.usedCount,
        },
        businessToday(),
      )
    : null

  return (
    <main id="main-content" className="pb-16">
      <div className="border-t border-line bg-canvas">
        <Container className="py-8 md:py-12">
          <nav
            aria-label="Đường dẫn"
            className="mb-6 flex flex-wrap items-center gap-2 text-caption text-muted"
          >
            <NoriLink href="/">Trang chủ</NoriLink>
            <Icon name="chevron-right" className="size-3" />
            <NoriLink href="/posts">Tin tức &amp; Ưu đãi</NoriLink>
            <Icon name="chevron-right" className="size-3" />
            <Text as="span" className="truncate text-ink">
              {post.title}
            </Text>
          </nav>

          <article className="mx-auto max-w-4xl space-y-6">
            {/* 1. Chuyên mục & 2. Tiêu đề & 3. Ngày đăng */}
            <header className="space-y-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone={post.category === 'PROMOTION' ? 'brand' : 'muted'}>
                  {CATEGORY_LABELS[post.category] ?? post.category}
                </Badge>
                {post.category === 'PROMOTION' && post.promotion && promoRuntime && (
                  <Badge tone={promoRuntime.tone}>{promoRuntime.label}</Badge>
                )}
              </div>

              <Heading as="h1" size="display">
                {post.title}
              </Heading>

              <div className="flex flex-wrap items-center gap-4 text-small text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="calendar" className="size-4 text-brand" />
                  Ngày đăng: {formatDate(post.publishedAt)}
                </span>
              </div>

              {post.excerpt && (
                <Text className="text-lead leading-relaxed text-muted">{post.excerpt}</Text>
              )}
            </header>

            {/* 4. Banner lớn responsive */}
            <div
              data-testid="post-detail-banner"
              className="relative aspect-video w-full overflow-hidden rounded-panel border border-line bg-subtle"
            >
              <Image
                src={bannerSrc}
                alt={bannerAlt}
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1279px) 92vw, 896px"
                preload
                className="object-cover"
              />
            </div>

            {/* Khuyến mãi liên kết từ backend/database (nếu bài viết Ưu đãi có liên kết Promotion) */}
            {post.category === 'PROMOTION' && post.promotion && promoRuntime && (
              <section
                data-testid="post-linked-promotion"
                aria-label="Thông tin mã khuyến mãi liên kết"
                className="rounded-panel border border-brand/30 bg-brand-soft/60 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">MÃ ƯU ĐÃI: {post.promotion.code}</Badge>
                      <Badge tone={promoRuntime.tone}>{promoRuntime.label}</Badge>
                    </div>
                    <Heading as="h2" size="subtitle" className="text-ink">
                      {post.promotion.name}
                    </Heading>
                  </div>
                  <ButtonLink href="/vehicles" variant="primary" className="shrink-0 text-small">
                    Đặt xe áp dụng mã <Icon name="arrow-up-right" className="size-4" />
                  </ButtonLink>
                </div>

                <dl className="mt-5 grid gap-4 border-t border-brand/20 pt-4 text-small sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-caption text-muted">Mức giảm</dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {formatDiscountSummary(post.promotion)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">Điều kiện tối thiểu</dt>
                    <dd className="mt-1 font-semibold text-ink">
                      Thuê từ {post.promotion.minDays} ngày ·{' '}
                      {SCOPE_LABELS[post.promotion.appliesTo] ?? 'Thuê xe'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">Ngày bắt đầu</dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {post.promotion.validFrom
                        ? formatDate(post.promotion.validFrom)
                        : 'Từ hôm nay'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">Ngày hết hạn</dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {post.promotion.validTo
                        ? formatDate(post.promotion.validTo)
                        : 'Không giới hạn'}
                    </dd>
                  </div>
                </dl>

                {post.promotion.description && (
                  <Text className="mt-4 text-small text-muted">{post.promotion.description}</Text>
                )}
              </section>
            )}

            {/* 5. Nội dung bài viết */}
            <div className="max-w-reading space-y-5 pt-2 text-lead leading-loose text-ink">
              {post.content
                .split(/\n{2,}/)
                .map((para) => para.trim())
                .filter(Boolean)
                .map((para, idx) => (
                  <Text key={idx} className="whitespace-pre-line leading-loose text-ink">
                    {para}
                  </Text>
                ))}
            </div>

            <div className="border-t border-line pt-6">
              <ButtonLink href="/posts" variant="secondary">
                <Icon name="arrow-left" className="size-4" />
                Quay lại danh sách bài viết
              </ButtonLink>
            </div>
          </article>
        </Container>
      </div>

      {/* 6. Bài viết liên quan */}
      {relatedPosts.length > 0 && (
        <section className="border-t border-line bg-subtle/50 py-12">
          <Container>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Heading as="h2" size="title">
                  Bài viết liên quan từ NORI
                </Heading>
                <Text className="mt-1 text-small text-muted">
                  Khám phá thêm tin tức, cẩm nang và ưu đãi đang diễn ra.
                </Text>
              </div>
              <NoriLink
                href="/posts"
                className="text-small font-semibold text-brand hover:underline"
              >
                Xem tất cả bài viết <Icon name="arrow-right" className="ml-1 inline size-4" />
              </NoriLink>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((item) => (
                <PostCard key={item.id} post={item} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <CallToAction />
    </main>
  )
}
