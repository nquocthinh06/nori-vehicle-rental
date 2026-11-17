import type { Metadata } from 'next'
import { AccountPanel } from '@/components/account-panel'
import { Container, Eyebrow, Heading, Text } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Tài khoản của tôi | NORI',
  robots: { index: false, follow: false },
}
export default function AccountPage() {
  return (
    <main id="main-content" className="border-t border-line pb-16">
      <Container className="pt-10 md:pt-14">
        <Eyebrow>KHÔNG GIAN CỦA BẠN</Eyebrow>
        <Heading as="h1">Tài khoản NORI</Heading>
        <Text className="mb-9 mt-3 text-muted">Quản lý thông tin và những hành trình sắp tới.</Text>
        <AccountPanel />
      </Container>
    </main>
  )
}
