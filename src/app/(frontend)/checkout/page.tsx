import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getSiteContent } from '@/lib/catalogue'
import { CheckoutPanel } from '@/components/checkout-panel'
import { Container, Eyebrow, Heading, Skeleton, Text } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Xác nhận đặt thuê & thanh toán | NORI',
  robots: { index: false, follow: false },
}
export default async function CheckoutPage() {
  const site = await getSiteContent()
  return (
    <main id="main-content" className="border-t border-line pb-16">
      <Container className="pt-10 md:pt-14">
        <Eyebrow>CHỈ CÒN MỘT BƯỚC NỮA</Eyebrow>
        <Heading as="h1">Xác nhận hành trình của bạn</Heading>
        <Text className="mb-9 mt-3 text-muted">
          Kiểm tra thông tin, xem chi phí và gửi đơn thuê. Không thanh toán trực tuyến.
        </Text>
        <Suspense fallback={<Skeleton className="h-gallery" />}>
          <CheckoutPanel address={site.address} />
        </Suspense>
      </Container>
    </main>
  )
}
