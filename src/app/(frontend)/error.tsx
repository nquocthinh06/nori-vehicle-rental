'use client'

import { Button, ButtonLink, Container, Heading, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main-content">
      <Container className="flex min-h-hero-mobile flex-col items-center justify-center py-16 text-center">
        <Icon name="alert" className="mb-6 size-10 text-brand" />
        <Heading as="h1">Hành trình đang tạm gián đoạn.</Heading>
        <Text className="mb-7 mt-4 max-w-reading text-muted">
          Chưa thể tải nội dung. Không có giao dịch nào được xác nhận chỉ từ thông báo này. Hãy thử
          lại hoặc quay về trang chủ.
        </Text>
        <div className="flex gap-3">
          <Button onClick={reset}>Thử tải lại</Button>
          <ButtonLink href="/" variant="secondary">
            Về trang chủ
          </ButtonLink>
        </div>
      </Container>
    </main>
  )
}
