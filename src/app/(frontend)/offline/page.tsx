import type { Metadata } from 'next'
import { Container, Eyebrow, Heading, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { OfflineActions } from '@/components/offline-actions'

export const metadata: Metadata = {
  title: 'Mất kết nối Internet | NORI',
  description: 'Thiết bị đang ngoại tuyến. Vui lòng kết nối lại để kiểm tra lịch xe và đặt xe.',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main id="main-content" className="py-16 md:py-24">
      <Container className="max-w-reading text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-panel bg-warning-soft text-warning">
          <Icon name="alert" className="size-8" />
        </div>
        <Eyebrow>TRẠNG THÁI NGOẠI TUYẾN</Eyebrow>
        <Heading as="h1" size="title" className="mt-2">
          Không có kết nối Internet
        </Heading>
        <Text className="mt-4 leading-loose text-muted">
          NORI cần kết nối trực tuyến để xác thực giá thuê, giá bán, lịch xe trống và xử lý đặt xe
          an toàn. Vui lòng kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại.
        </Text>
        <OfflineActions />
      </Container>
    </main>
  )
}
