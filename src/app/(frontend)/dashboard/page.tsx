import type { Metadata } from 'next'
import { DashboardPanel } from '@/components/dashboard-panel'
import { Container, Eyebrow, Heading, Text } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Dashboard quản trị | NORI',
  robots: { index: false, follow: false },
}
export default function DashboardPage() {
  return (
    <main id="main-content" className="border-t border-line bg-subtle pb-16">
      <Container className="pt-10 md:pt-14">
        <Eyebrow>NORI · QUẢN TRỊ VẬN HÀNH</Eyebrow>
        <Heading as="h1">Tổng quan hệ thống</Heading>
        <Text className="mb-9 mt-3 text-muted">
          Theo dõi phương tiện, khách hàng và vòng đời đơn thuê từ dữ liệu thực tế.
        </Text>
        <DashboardPanel />
      </Container>
    </main>
  )
}
