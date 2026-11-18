import Image from 'next/image'
import type { Metadata } from 'next'
import { getPublishedPosts, getSiteContent } from '@/lib/catalogue'
import { PostCard } from '@/components/post-card'
import { ButtonLink, Container, Eyebrow, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { Benefits, CallToAction, HowItWorks } from '@/components/home/sections'

export const metadata: Metadata = {
  title: 'Câu chuyện NORI | Đi theo cách của bạn',
  description:
    'Không chỉ là một chiếc xe. NORI hướng tới trải nghiệm lựa chọn và đặt xe minh bạch, dễ dàng.',
}
export default async function AboutPage() {
  const [site, posts] = await Promise.all([getSiteContent(), getPublishedPosts()])
  const image = site.heroImages[0]?.image
  return (
    <main id="main-content">
      <section className="relative overflow-hidden bg-night text-inverse">
        <div className="absolute inset-0">
          {image && (
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes="100vw"
              preload
              className="object-cover"
            />
          )}
          <div className="hero-shade absolute inset-0" />
        </div>
        <Container className="relative py-20 md:py-28">
          <Eyebrow className="text-brand-bright">CÂU CHUYỆN NORI</Eyebrow>
          <Heading as="h1" size="display" className="max-w-hero-copy">
            Không chỉ là một chiếc xe.
            <br />
            Là tự do để đi.
          </Heading>
          <Text className="mt-6 max-w-reading text-lead leading-loose text-inverse/85">
            Chúng tôi tin rằng một hành trình ý nghĩa bắt đầu khi bạn có thể an tâm lựa chọn — và tự
            do đi theo cách của mình.
          </Text>
          <ButtonLink href="#how-it-works" variant="inverse" className="mt-8">
            Khởi hành cùng NORI <Icon name="arrow-right" className="size-4" />
          </ButtonLink>
        </Container>
      </section>
      <Container>
        <Benefits />
        <section className="grid gap-8 py-14 md:grid-cols-2 md:py-section">
          <div>
            <Eyebrow>YOUR WAY. EVERY DAY.</Eyebrow>
            <Heading>
              Ít băn khoăn hơn.
              <br />
              Nhiều trải nghiệm hơn.
            </Heading>
          </div>
          <div className="space-y-5 leading-loose text-muted">
            {site.aboutSummary ? (
              <Text className="whitespace-pre-line">{site.aboutSummary}</Text>
            ) : (
              <>
                <Text>
                  Đôi khi, bạn chỉ cần một chiếc xe để về nhà. Đôi khi, một cung đường mới lại mở ra
                  những điều rất khác. NORI được xây dựng để việc lựa chọn phương tiện không trở
                  thành rào cản của hành trình.
                </Text>
                <Text>
                  Thuê xe cho một chuyến đi, hay tìm hiểu chiếc xe sẽ gắn bó dài lâu — thông tin rõ
                  ràng và những bước thao tác đơn giản luôn là điểm bắt đầu.
                </Text>
                <Text>
                  Catalogue và phương tiện thực tế được phân biệt rõ. Giá, ODO và lịch khả dụng chỉ
                  được công bố khi có dữ liệu, để bạn biết chính xác mình đang lựa chọn điều gì.
                </Text>
              </>
            )}
          </div>
        </section>
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              title: 'Rõ ràng',
              text: 'Không đoán thay thông tin còn thiếu. Không dùng ảnh tham khảo để cam kết xe thực tế.',
              icon: 'shield' as const,
            },
            {
              title: 'Chủ động',
              text: 'Chọn khoảng ngày, kiểm tra giá và theo dõi trạng thái đơn trong tài khoản của bạn.',
              icon: 'calendar' as const,
            },
            {
              title: 'Đơn giản',
              text: 'Từng bước rõ ràng, từ tìm xe đến nhận xe. Không phát sinh giao dịch trực tuyến chưa được xác nhận.',
              icon: 'road' as const,
            },
          ].map((value) => (
            <section className="rounded-card bg-subtle p-7" key={value.title}>
              <Icon name={value.icon} className="mb-6 size-7 text-brand" />
              <Heading as="h3" size="subtitle">
                {value.title}
              </Heading>
              <Text className="mt-3 text-small leading-loose text-muted">{value.text}</Text>
            </section>
          ))}
        </div>
        <HowItWorks />
        {posts.length > 0 && (
          <section className="py-12">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>TIN TỨC &amp; ƯU ĐÃI</Eyebrow>
                <Heading>Bài viết mới từ NORI</Heading>
              </div>
              <NoriLink
                href="/posts"
                className="text-small font-semibold text-brand hover:underline"
              >
                Xem tất cả bài viết <Icon name="arrow-right" className="ml-1 inline size-4" />
              </NoriLink>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.slice(0, 6).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </Container>
      <CallToAction />
    </main>
  )
}
