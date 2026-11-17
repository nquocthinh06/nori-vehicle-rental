import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getCatalogue } from '@/lib/catalogue'
import { Catalogue } from '@/components/catalogue'
import { CardSkeleton, Container, Eyebrow, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Khám phá phương tiện | NORI',
  description:
    'Tìm ô tô, xe máy và bán tải phù hợp. Catalogue, xe thực tế và giá được phân biệt minh bạch.',
}

export default async function VehiclesPage() {
  const models = await getCatalogue()
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
              Khám phá phương tiện
            </Text>
          </nav>
          <Eyebrow>THE RIGHT CAR. YOUR OWN WAY.</Eyebrow>
          <Heading as="h1" size="display">
            Chiếc xe phù hợp.
            <br />
            Hành trình của riêng bạn.
          </Heading>
          <Text className="mt-4 max-w-reading text-muted">
            Dạo phố, về nhà hay đi thật xa — khám phá lựa chọn dành cho kế hoạch tiếp theo của bạn.
          </Text>
        </Container>
      </div>
      <Container className="pt-9">
        <Suspense
          fallback={
            <div className="grid gap-5 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <Catalogue models={models} />
        </Suspense>
      </Container>
    </main>
  )
}
