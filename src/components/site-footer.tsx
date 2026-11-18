import { Brand } from './brand'
import { Container, ExternalLink, Heading, NoriLink, Text } from './ui'
import { Icon } from './ui/icon'
import type { SiteContent } from '@/lib/catalogue'

export function SiteFooter({ site }: { site: SiteContent }) {
  const isDemoContact = Boolean(site.address?.includes('DEMO'))
  return (
    <footer className="bg-night text-inverse">
      <Container>
        <div className="grid gap-10 border-b border-inverse/15 py-14 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:pr-5">
            <Brand inverse />
            <Text className="mt-5 text-small text-on-night-muted">
              Không chỉ là một chiếc xe.
              <br />
              Là khởi đầu của những hành trình.
            </Text>
            <NoriLink
              href="/about"
              className="mt-5 inline-flex items-center gap-2 text-small text-brand-bright hover:text-inverse"
            >
              Cùng NORI lên đường <Icon name="arrow-up-right" className="size-4" />
            </NoriLink>
          </div>
          <div>
            <Heading as="h3" size="body" className="mb-5">
              Khám phá
            </Heading>
            <div className="grid gap-3.5 text-small text-on-night-muted">
              <NoriLink href="/vehicles?type=CAR" className="hover:text-inverse">
                Thuê ô tô tự lái
              </NoriLink>
              <NoriLink href="/vehicles?type=MOTORBIKE" className="hover:text-inverse">
                Thuê xe máy
              </NoriLink>
              <NoriLink href="/vehicles?type=PICKUP" className="hover:text-inverse">
                Thuê xe bán tải
              </NoriLink>
              <NoriLink href="/vehicles?intent=buy" className="hover:text-inverse">
                Tìm mua xe
              </NoriLink>
            </div>
          </div>
          <div>
            <Heading as="h3" size="body" className="mb-5">
              NORI luôn ở đây
            </Heading>
            <div className="grid gap-3.5 text-small text-on-night-muted">
              <NoriLink href="/posts" className="hover:text-inverse">
                Tin tức &amp; Ưu đãi
              </NoriLink>
              <NoriLink href="/about" className="hover:text-inverse">
                Về chúng tôi
              </NoriLink>
              <NoriLink href="/about#how-it-works" className="hover:text-inverse">
                Hướng dẫn đặt xe
              </NoriLink>
              <NoriLink href="/support" className="hover:text-inverse">
                Câu hỏi thường gặp
              </NoriLink>
              <NoriLink href="/support#conditions" className="hover:text-inverse">
                Điều kiện & chính sách
              </NoriLink>
            </div>
          </div>
          <div>
            <Heading as="h3" size="body" className="mb-5">
              Kết nối với NORI
            </Heading>
            <div className="space-y-4 text-small text-on-night-muted">
              <Text className="flex items-start gap-2.5">
                <Icon name="pin" className="mt-0.5 size-4" />
                <span>{site.address || 'Điểm nhận xe: Chưa cập nhật'}</span>
              </Text>
              {site.phone ? (
                <ExternalLink
                  href={`tel:${site.phone}`}
                  className="flex items-center gap-2.5 no-underline"
                >
                  <Icon name="phone" className="size-4" />
                  <span>
                    {site.phone}
                    {isDemoContact ? ' (DEMO)' : ''}
                  </span>
                </ExternalLink>
              ) : (
                <Text className="flex items-center gap-2.5">
                  <Icon name="phone" className="size-4" />
                  Hotline: Chưa cập nhật
                </Text>
              )}
              {site.email && (
                <ExternalLink
                  href={`mailto:${site.email}`}
                  className="flex items-center gap-2.5 break-all no-underline"
                >
                  <Icon name="mail" className="size-4" />
                  <span>
                    {site.email}
                    {isDemoContact ? ' (DEMO)' : ''}
                  </span>
                </ExternalLink>
              )}
              <NoriLink
                href="/support"
                className="inline-flex items-center gap-2 text-brand-bright hover:text-inverse"
              >
                Trung tâm hỗ trợ <Icon name="arrow-right" className="size-4" />
              </NoriLink>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 py-6 text-micro text-on-night-muted md:flex-row">
          <Text>© NORI. Hành trình của bạn, theo cách của bạn.</Text>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <NoriLink href="/support#privacy" className="hover:text-inverse">
              Quyền riêng tư
            </NoriLink>
            <NoriLink href="/support#conditions" className="hover:text-inverse">
              Điều khoản sử dụng
            </NoriLink>
          </div>
        </div>
      </Container>
    </footer>
  )
}
