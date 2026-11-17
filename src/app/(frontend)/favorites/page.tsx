import type { Metadata } from 'next'
import { getCatalogue } from '@/lib/catalogue'
import { FavoritesPanel } from '@/components/favorites-panel'
import { Container, Eyebrow, Heading, NoriLink, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Xe yêu thích | NORI',
  description: 'Danh sách phương tiện bạn đã lưu để theo dõi giá thuê, giá bán và đặt xe nhanh.',
}

export default async function FavoritesPage() {
  const models = await getCatalogue()

  return (
    <main id="main-content" className="pb-20">
      <div className="border-y border-line bg-subtle">
        <Container className="py-8 md:py-12">
          <nav
            aria-label="Đường dẫn"
            className="mb-5 flex items-center gap-2 text-caption text-muted"
          >
            <NoriLink href="/">Trang chủ</NoriLink>
            <Icon name="chevron-right" className="size-3" />
            <Text as="span" className="text-ink">
              Yêu thích
            </Text>
          </nav>
          <Eyebrow>DANH SÁCH ĐÃ LƯU</Eyebrow>
          <Heading as="h1" size="title" className="mt-1 md:text-section">
            Phương tiện yêu thích
          </Heading>
          <Text className="mt-3 max-w-reading text-small text-muted md:text-body">
            Xem lại nhanh các dòng ô tô, xe máy và bán tải bạn đang cân nhắc cho chuyến đi hoặc dự
            định sở hữu.
          </Text>
        </Container>
      </div>
      <Container className="pt-8">
        <FavoritesPanel models={models} />
      </Container>
    </main>
  )
}
