import type { Metadata } from 'next'
import { ComponentPlayground } from '@/components/component-playground'
import { Badge, Container, Eyebrow, Heading, Text } from '@/components/ui'

export const metadata: Metadata = {
  title: 'NORI Design System',
  robots: { index: false, follow: false },
}
export default function DesignSystemPage() {
  return (
    <main id="main-content" className="border-t border-line pb-16">
      <Container className="max-w-6xl pt-12">
        <Eyebrow>NORI DESIGN SYSTEM · V1.0</Eyebrow>
        <Heading as="h1" size="display">
          Rõ ràng. Tinh tế. Đồng hành.
        </Heading>
        <Text className="mb-10 mt-4 max-w-reading text-muted">
          Ngôn ngữ giao diện riêng của NORI. Cảm hứng từ thiết kế ô tô hiện đại, không sao chép nhận
          diện thương hiệu khác. Toàn bộ component bên dưới cũng được sử dụng trong ứng dụng.
        </Text>
        <section className="mb-10">
          <Heading as="h2" size="title" className="mb-5">
            Semantic tokens
          </Heading>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { name: 'brand', style: 'bg-brand text-inverse' },
              { name: 'ink', style: 'bg-ink text-inverse' },
              { name: 'soft', style: 'bg-soft text-ink' },
              { name: 'brand-bright', style: 'bg-brand-bright text-night' },
              { name: 'subtle', style: 'bg-subtle text-ink' },
              { name: 'danger', style: 'bg-danger text-inverse' },
            ].map((color) => (
              <div
                key={color.name}
                className={`flex h-28 items-end rounded-card p-4 text-caption font-medium ${color.style}`}
              >
                {color.name}
              </div>
            ))}
          </div>
          <Text className="mt-4 text-caption text-muted">
            Font: Be Vietnam Pro · Lưới khoảng cách 4px · Bán kính control/card/panel · WCAG 2.2 AA
            là mục tiêu kiểm thử.
          </Text>
        </section>
        <section className="mb-10 rounded-card bg-subtle p-6">
          <Heading as="h2" size="section">
            Đúng chiếc xe. Đúng hành trình.
          </Heading>
          <Text className="my-4 text-lead">
            Typography có dấu tiếng Việt, thứ bậc rõ và dòng chữ vừa phải.
          </Text>
          <Text className="text-small text-muted">
            Giá, lịch trống và tình trạng không bao giờ được suy đoán. Thông tin thiếu dùng nhãn
          </Text>
          <Badge className="mt-3">Chưa cập nhật</Badge>
        </section>
        <ComponentPlayground />
      </Container>
    </main>
  )
}
