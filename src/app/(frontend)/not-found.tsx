import { ButtonLink, Container, Eyebrow, Heading, Text } from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export default function NotFound() {
  return (
    <main id="main-content">
      <Container className="flex min-h-hero-mobile flex-col items-center justify-center py-16 text-center">
        <div className="mb-7 flex size-20 items-center justify-center rounded-pill bg-brand-soft text-brand">
          <Icon name="road" className="size-9" />
        </div>
        <Eyebrow>404 · MỘT NGÃ RẼ KHÁC</Eyebrow>
        <Heading as="h1" size="section">
          Có vẻ bạn vừa đi lạc một chút.
        </Heading>
        <Text className="mb-8 mt-4 max-w-reading text-muted">
          Trang hoặc phương tiện này không tồn tại, đã được di chuyển hoặc chưa được công bố. NORI
          vẫn ở đây để cùng bạn tiếp tục hành trình.
        </Text>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/vehicles">
            Khám phá phương tiện <Icon name="arrow-right" className="size-4" />
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Về trang chủ
          </ButtonLink>
        </div>
      </Container>
    </main>
  )
}
