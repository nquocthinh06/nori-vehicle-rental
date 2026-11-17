import type { Metadata } from 'next'
import { getSiteContent } from '@/lib/catalogue'
import {
  ButtonLink,
  Container,
  ExternalLink,
  Eyebrow,
  Heading,
  NoriLink,
  Text,
} from '@/components/ui'
import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'Trung tâm hỗ trợ & điều kiện thuê | NORI',
  description:
    'Hướng dẫn đặt xe, lịch thuê, hủy đơn, thanh toán và bảo vệ thông tin cá nhân tại NORI.',
}
const questions = [
  {
    title: 'Tôi có thể thuê xe trong bao lâu?',
    answer:
      'Mỗi đơn thuê từ 1 đến 30 ngày nguyên. Bạn có thể chọn ngày nhận từ hôm nay đến 90 ngày tiếp theo, theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).',
  },
  {
    title: 'Ngày trả xe có được tính vào tiền thuê không?',
    answer:
      'Không. Thời gian thuê tính từ ngày nhận và không bao gồm ngày trả. Ví dụ, nhận ngày 01 và trả ngày 03 tương đương 2 ngày thuê. Một đơn mới có thể bắt đầu vào ngày trả của đơn trước.',
  },
  {
    title: 'Catalogue có phải là chiếc xe tôi sẽ nhận không?',
    answer:
      'Không. Catalogue giới thiệu dòng xe và sử dụng ảnh tham khảo có nguồn. Mỗi chiếc xe thực tế có mã quản lý, ảnh, ODO, phiên bản, giá và tình trạng riêng. Thông tin chưa có sẽ hiển thị “Chưa cập nhật”.',
  },
  {
    title: 'Đơn thuê được xác nhận khi nào?',
    answer:
      'Sau khi tạo thành công, đơn ở trạng thái “Chờ xác nhận” và giữ lịch xe. NORI sẽ xử lý đơn; bạn cần theo dõi trạng thái trong “Đơn thuê của tôi”. Không đến nhận xe chỉ dựa trên một báo giá hoặc kết quả kiểm tra lịch.',
  },
  {
    title: 'Tôi có thể hủy đơn thuê không?',
    answer:
      'Bạn có thể tự hủy đơn của mình khi đơn còn “Chờ xác nhận” hoặc “Chờ đặt cọc” (hệ thống tự động giải phóng lịch xe). Sau khi đơn đã được xác nhận hoặc đang thuê, vui lòng liên hệ NORI trước giờ nhận tối thiểu 24 giờ để được hỗ trợ phù hợp. Đơn đã hoàn thành, từ chối hoặc hủy không được mở lại.',
  },
  {
    title: 'NORI có thu tiền hoặc tiền cọc trên website không?',
    answer:
      'Không. Website hiện không thu tiền thuê, tiền cọc hoặc phí giao dịch. Thanh toán được thực hiện trực tiếp tại điểm nhận xe theo xác nhận của NORI. Trạng thái đơn không đồng nghĩa với đã thanh toán.',
  },
  {
    title: 'Giá thuê có thay đổi sau khi đặt thành công không?',
    answer:
      'Đơn giá tại thời điểm đặt được lưu riêng trong đơn. Việc cập nhật giá của xe sau đó không thay đổi tổng dự kiến của đơn đã tạo. Chỉ máy chủ tính số ngày và tổng giá từ dữ liệu thực tế.',
  },
  {
    title: 'Đăng ký tư vấn mua xe có phải là đặt mua không?',
    answer:
      'Không. Đây là yêu cầu để NORI tư vấn và xác nhận thông tin xe, phiên bản, giá và tình trạng còn hàng. Chưa phát sinh hợp đồng mua bán, giữ xe, tiền cọc hay giao dịch thanh toán.',
  },
]

export default async function SupportPage() {
  const site = await getSiteContent()
  const isDemoContact = Boolean(site.address?.includes('DEMO'))
  const policyHighlights = [
    { label: 'Chính sách thuê xe', value: site.rentalPolicySummary },
    { label: 'Chính sách mua xe', value: site.purchasePolicySummary },
    { label: 'Độ tuổi người lái', value: site.ageRequirement },
    { label: 'Giấy tờ bắt buộc', value: site.licenseRequirement },
    { label: 'Chính sách hủy & đổi lịch', value: site.cancellationPolicy },
    { label: 'Tiền đặt cọc & hoàn trả', value: site.depositPolicy },
    { label: 'Chính sách bảo mật', value: site.privacyPolicy },
    { label: 'Điều khoản sử dụng', value: site.termsOfUse },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value))
  const faqItems =
    site.faqs.length > 0
      ? site.faqs.map((f) => ({ title: f.question, answer: f.answer }))
      : questions
  return (
    <main id="main-content" className="border-t border-line pb-16">
      <div className="bg-soft">
        <Container className="py-12 md:py-16">
          <Eyebrow>NORI LUÔN SẴN SÀNG LẮNG NGHE</Eyebrow>
          <Heading as="h1" size="display">
            Bạn cần NORI hỗ trợ gì?
          </Heading>
          <Text className="mt-4 text-muted">Những điều cần biết để an tâm bắt đầu hành trình.</Text>
        </Container>
      </div>
      <Container className="grid items-start gap-10 pt-12 lg:grid-cols-3">
        <aside className="space-y-5 lg:sticky lg:top-5">
          <section className="rounded-card border border-line p-6">
            <Icon name="headphones" className="mb-5 size-8 text-brand" />
            <Heading as="h2" size="subtitle">
              Kết nối với NORI
            </Heading>
            <div className="mt-5 space-y-5 text-small">
              <div>
                <Text className="mb-1 text-caption text-muted">Hotline</Text>
                {site.phone ? (
                  <ExternalLink href={`tel:${site.phone}`} className="font-semibold no-underline">
                    {site.phone}
                    {isDemoContact ? ' (DEMO)' : ''}
                  </ExternalLink>
                ) : (
                  <Text className="font-medium">Chưa cập nhật</Text>
                )}
              </div>
              <div>
                <Text className="mb-1 text-caption text-muted">Email hỗ trợ</Text>
                {site.email ? (
                  <ExternalLink
                    href={`mailto:${site.email}`}
                    className="break-all font-semibold no-underline"
                  >
                    {site.email}
                    {isDemoContact ? ' (DEMO)' : ''}
                  </ExternalLink>
                ) : (
                  <Text className="font-medium">Chưa cập nhật</Text>
                )}
              </div>
              <div>
                <Text className="mb-1 text-caption text-muted">Điểm nhận & trả xe</Text>
                <Text className="font-medium">{site.address || 'Chưa cập nhật'}</Text>
              </div>
              <div>
                <Text className="mb-1 text-caption text-muted">Giờ làm việc</Text>
                <Text className="font-medium">{site.openingHours || 'Chưa cập nhật'}</Text>
              </div>
              {site.contactNote && (
                <div className="border-t border-line pt-4">
                  <Text className="mb-1 text-caption text-muted">Lưu ý liên hệ</Text>
                  <Text className="text-small text-muted">{site.contactNote}</Text>
                </div>
              )}
            </div>
          </section>
          <div className="rounded-card bg-subtle p-6">
            <Heading as="h2" size="body">
              Bạn đã có đơn thuê?
            </Heading>
            <Text className="mb-5 mt-2 text-small text-muted">
              Xem trạng thái mới nhất và quản lý đơn trong tài khoản.
            </Text>
            <ButtonLink href="/my-bookings" variant="secondary" className="w-full text-small">
              Đơn thuê của tôi <Icon name="arrow-up-right" className="size-4" />
            </ButtonLink>
          </div>
        </aside>
        <div className="min-w-0 lg:col-span-2">
          <section id="questions">
            <Heading as="h2" size="title" className="mb-5">
              Câu hỏi thường gặp
            </Heading>
            <div className="divide-y divide-line border-y border-line">
              {faqItems.map((q, i) => (
                <details key={q.title} className="group" open={i === 0}>
                  <summary className="flex min-h-control items-center justify-between gap-5 py-5 text-small font-medium">
                    {q.title}
                    <Icon
                      name="plus"
                      className="size-4 shrink-0 text-brand transition-transform group-open:rotate-45"
                    />
                  </summary>
                  <Text className="pb-6 pr-7 text-small leading-loose text-muted">{q.answer}</Text>
                </details>
              ))}
            </div>
          </section>
          <section id="conditions" className="pt-12">
            <Eyebrow>ĐIỀU KIỆN & CHÍNH SÁCH</Eyebrow>
            <Heading as="h2" size="title">
              Rõ ràng trước khi khởi hành
            </Heading>
            <div className="mt-5 space-y-4 text-small leading-loose text-muted">
              <Text>
                1. Người đặt cần có tài khoản khách hàng đang hoạt động. Chỉ được đặt phương tiện
                thực tế đang kinh doanh, có giá thuê và không trùng lịch.
              </Text>
              <Text>
                2. Thời gian thuê là khoảng ngày [ngày nhận, ngày trả), từ 1 đến 30 ngày. Ngày nhận
                tối đa 90 ngày trong tương lai. Ngày hiện tại được tính theo múi giờ Việt Nam.
              </Text>
              <Text>
                3. Báo giá và kiểm tra khả dụng là thông tin tại thời điểm tra cứu. Máy chủ kiểm tra
                lại lịch và giá khi tạo đơn; nếu có xung đột, đơn không được tạo.
              </Text>
              <Text>
                4. Đơn “Chờ xác nhận” và “Chờ đặt cọc” giữ lịch đến khi được xử lý hoặc hủy. Khách
                hàng có thể tự hủy miễn phí ở cả hai trạng thái này trong mục “Đơn thuê của tôi” để
                giải phóng lịch xe ngay lập tức.
              </Text>
              <Text>
                5. Không có cổng thanh toán trực tuyến trong phiên bản này. Thông tin giấy tờ, nhận
                xe, thanh toán và các điều kiện bàn giao cần được NORI xác nhận trước khi thực hiện.
              </Text>
              <Text>
                6. Không coi ảnh catalogue, thông tin chưa cập nhật hoặc yêu cầu tư vấn là bảo đảm
                về tồn kho, phiên bản hay giá. Luôn kiểm tra thông tin của chiếc xe thực tế.
              </Text>
            </div>
            {policyHighlights.length > 0 && (
              <dl className="mt-6 grid gap-4 rounded-card border border-line bg-subtle p-6 sm:grid-cols-2">
                {policyHighlights.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <dt className="text-caption font-semibold text-ink">{item.label}</dt>
                    <dd className="text-small leading-relaxed text-muted">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section id="privacy" className="pt-12">
            <Eyebrow>QUYỀN RIÊNG TƯ</Eyebrow>
            <Heading as="h2" size="title">
              Thông tin của bạn, đúng mục đích.
            </Heading>
            <div className="mt-5 space-y-4 text-small leading-loose text-muted">
              <Text>
                NORI sử dụng họ tên, email, số điện thoại (nếu được cung cấp), lịch sử đơn và nội
                dung tư vấn để cung cấp chức năng tài khoản và xử lý yêu cầu của bạn. Website không
                yêu cầu thông tin thẻ ngân hàng.
              </Text>
              <Text>
                Mật khẩu được xử lý bằng cơ chế xác thực của Payload. Phiên đăng nhập ứng dụng được
                lưu trong cookie HttpOnly riêng với phiên quản trị. Khách hàng chỉ có thể truy cập
                các bản ghi thuộc tài khoản của mình.
              </Text>
              <Text>
                Bạn có thể sửa họ tên và số điện thoại trong{' '}
                <NoriLink href="/account" className="font-medium text-brand underline">
                  tài khoản cá nhân
                </NoriLink>
                . Những yêu cầu về dữ liệu khác cần được trao đổi qua thông tin liên hệ NORI khi
                được công bố.
              </Text>
            </div>
          </section>
          <section id="account" className="pt-12">
            <Heading as="h2" size="title">
              Hỗ trợ đăng nhập
            </Heading>
            <Text className="mt-4 text-small leading-loose text-muted">
              Sử dụng email đã đăng ký và mật khẩu từ 8–72 ký tự. Nếu nhập sai nhiều lần, tài khoản
              có thể bị khóa tạm thời. Phiên bản này chưa hỗ trợ đặt lại mật khẩu qua email; vui
              lòng liên hệ NORI qua kênh hỗ trợ đã được công bố. Không gửi mật khẩu cho bất kỳ ai.
            </Text>
            <div className="mt-5 flex gap-3">
              <ButtonLink href="/login" variant="secondary">
                Đến đăng nhập
              </ButtonLink>
              <ButtonLink href="/register">Tạo tài khoản</ButtonLink>
            </div>
          </section>
        </div>
      </Container>
    </main>
  )
}
