import type { Metadata } from 'next'
import { getCatalogue, getSiteContent } from '@/lib/catalogue'
import { Container } from '@/components/ui'
import { Hero } from '@/components/home/hero'
import { SearchBar } from '@/components/search-bar'
import { Featured } from '@/components/home/featured'
import { Benefits, CallToAction, HowItWorks, Story } from '@/components/home/sections'

export const metadata: Metadata = {
  title: 'NORI — Thuê xe linh hoạt. Mua xe tự tin.',
  description:
    'Khám phá ô tô, xe máy và bán tải cùng NORI. Thông tin minh bạch, chủ động lịch trình, an tâm trên mọi hành trình.',
}

export default async function HomePage() {
  const [models, site] = await Promise.all([getCatalogue(), getSiteContent()])
  const locations = [...new Set(models.flatMap((m) => m.locations))].sort()
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
        {site.showFeaturedSection && <Featured models={models} />}
        {site.showStorySection && <Story image={site.storyImage} />}
        {site.showHowItWorksSection && <HowItWorks />}
      </Container>
      {site.showCtaSection && <CallToAction />}
    </main>
  )
}
