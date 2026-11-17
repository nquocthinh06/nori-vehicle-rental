import type { Metadata } from 'next'
import { BookingsPanel } from '@/components/bookings-panel'
import { ButtonLink, Container, Eyebrow, Heading, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Đơn thuê của tôi | NORI',
  robots: { index: false, follow: false },
}
export default function MyBookingsPage() {
  return (
    <main id="main-content" className="border-t border-line pb-16">
      <Container className="max-w-6xl pt-10 md:pt-14">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow>MỖI CHUYẾN ĐI, MỘT CÂU CHUYỆN</Eyebrow>
            <Heading as="h1">Đơn thuê của tôi</Heading>
            <Text className="mt-3 text-muted">
              Lịch trình, trạng thái và những hành trình bạn đã chọn.
            </Text>
          </div>
          <ButtonLink href="/vehicles" variant="secondary" className="text-small">
            Tìm xe cho chuyến đi mới <Icon name="arrow-up-right" className="size-4" />
          </ButtonLink>
        </div>
        <BookingsPanel />
      </Container>
    </main>
  )
}
