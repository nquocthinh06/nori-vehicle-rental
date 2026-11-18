import type { Metadata } from 'next'
import { getCatalogue, getPublishedPosts, getSiteContent } from '@/lib/catalogue'
import { Container, Eyebrow, Heading, NoriLink } from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { Hero } from '@/components/home/hero'
import { SearchBar } from '@/components/search-bar'
import { Featured } from '@/components/home/featured'
import { PostCard } from '@/components/post-card'
import { Benefits, CallToAction, HowItWorks, Story } from '@/components/home/sections'

export const metadata: Metadata = {
  title: 'NORI — Thuê xe linh hoạt. Mua xe tự tin.',
  description:
    'Khám phá ô tô, xe máy và bán tải cùng NORI. Thông tin minh bạch, chủ động lịch trình, an tâm trên mọi hành trình.',
}

export default async function HomePage() {
  const [models, site, posts] = await Promise.all([
    getCatalogue(),
    getSiteContent(),
    getPublishedPosts(),
  ])
  const locations = [...new Set(models.flatMap((m) => m.locations))].sort()
  const slimModels = models.map((m) => ({
    ...m,
    description: null,
    exteriorOverview: '',
    interiorOverview: '',
    engineOverview: '',
    highlights: [],
    features: [],
    gallery: m.gallery.slice(0, 1),
    specifications: [],
    variants: [],
  }))
  return (
    <main id="main-content">
      {site.showHeroSection && (
        <Hero
          images={site.heroImages}
          slides={site.heroSlides}
          hasConfiguredSlides={site.hasConfiguredHeroSlides}
          autoplaySeconds={site.heroAutoplaySeconds}
        />
      )}
      <Container>
        <SearchBar locations={locations} />
        {site.showBenefitsSection && <Benefits />}
        {site.showFeaturedSection && <Featured models={slimModels} />}
        {site.showStorySection && <Story image={site.storyImage} />}
        {site.showHowItWorksSection && <HowItWorks />}
        {posts.length > 0 && (
          <section className="pb-14 md:pb-section">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>TIN TỨC · CẨM NANG · ƯU ĐÃI</Eyebrow>
                <Heading>Bài viết &amp; Sự kiện nổi bật</Heading>
              </div>
              <NoriLink
                href="/posts"
                className="text-small font-semibold text-brand hover:underline"
              >
                Xem tất cả bài viết <Icon name="arrow-right" className="ml-1 inline size-4" />
              </NoriLink>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.slice(0, 3).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </Container>
      {site.showCtaSection && <CallToAction />}
    </main>
  )
}
