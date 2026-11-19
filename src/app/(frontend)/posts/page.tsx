import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPublishedPosts, slimPostForCard } from '@/lib/catalogue'
import { PostsDirectory } from '@/components/posts-directory'
import { CallToAction } from '@/components/home/sections'
import { CardSkeleton, Container, Eyebrow, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Tin tức, Cẩm nang & Ưu đãi | NORI',
  description:
    'Cập nhật tin tức mới nhất, kinh nghiệm thuê và mua xe cùng các chương trình ưu đãi & sự kiện chính thức từ NORI.',
}

export default async function PostsPage() {
  const posts = (await getPublishedPosts()).map(slimPostForCard)

  return (
    <main id="main-content" className="pb-16">
      <div className="border-y border-line bg-subtle">
        <Container className="py-10 md:py-12">
          <nav
            aria-label="Đường dẫn"
            className="mb-7 flex items-center gap-2 text-caption text-muted"
          >
            <NoriLink href="/">Trang chủ</NoriLink>
            <Icon name="chevron-right" className="size-3" />
            <Text as="span" className="text-ink">
              Tin tức &amp; Ưu đãi
            </Text>
          </nav>
          <Eyebrow>TIN TỨC · CẨM NANG · ƯU ĐÃI</Eyebrow>
          <Heading as="h1" size="display">
            Tin tức &amp; Sự kiện NORI
          </Heading>
          <Text className="mt-4 max-w-reading text-muted">
            Thông tin chính thức về chương trình khuyến mãi, cẩm nang chọn xe và những hành trình
            đáng nhớ cùng NORI.
          </Text>
        </Container>
      </div>

      <Container className="pt-9 pb-14">
        <Suspense
          fallback={
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <PostsDirectory posts={posts} />
        </Suspense>
      </Container>

      <CallToAction />
    </main>
  )
}
