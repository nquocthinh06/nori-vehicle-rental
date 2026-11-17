'use client'

import { useState } from 'react'
import type { Category, ModelView } from '@/lib/catalogue'
import { Button, ButtonLink, EmptyState, Heading, Text, cn } from '@/components/ui'
import { Icon } from '@/components/ui/icon'
import { VehicleCard, categoryIcons, categoryLabels } from '@/components/vehicle-card'

export function Featured({ models }: { models: ModelView[] }) {
  const [category, setCategory] = useState<Category | ''>('')
  const visible = models.filter((m) => !category || m.category === category).slice(0, 3)
  return (
    <section id="discover" className="py-14 md:py-section">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Text className="mb-3 text-caption font-semibold uppercase tracking-widest text-brand">
            CHỌN XE. CHỌN HÀNH TRÌNH.
          </Text>
          <Heading>Đâu là bạn đồng hành của bạn?</Heading>
          <Text className="mt-3 text-muted">
            Linh hoạt thuê. Tự tin mua. Luôn có một lựa chọn dành cho bạn.
          </Text>
        </div>
        <ButtonLink href="/vehicles" variant="secondary" className="text-small">
          Khám phá tất cả <Icon name="arrow-up-right" className="size-4" />
        </ButtonLink>
      </div>
      <div aria-label="Lọc danh mục xe nổi bật" className="mb-7 mt-8 flex flex-wrap gap-2.5">
        {(['', 'CAR', 'MOTORBIKE', 'PICKUP'] as const).map((c) => (
          <Button
            key={c}
            aria-pressed={category === c}
            variant={category === c ? 'dark' : 'secondary'}
            onClick={() => setCategory(c)}
            className={cn(
              'min-h-control-sm rounded-pill px-5 py-2 text-small',
              category !== c && 'border-transparent bg-subtle',
            )}
          >
            {c ? (
              <Icon name={categoryIcons[c]} className="size-4" />
            ) : (
              <Icon name="grid" className="size-3.5" />
            )}
            {c ? categoryLabels[c] : 'Tất cả phương tiện'}
          </Button>
        ))}
      </div>
      {visible.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => (
            <VehicleCard key={m.id} model={m} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Danh mục đang được cập nhật"
          description="NORI sẽ hiển thị phương tiện ngay khi thông tin được xác nhận. Bạn có thể khám phá các danh mục khác."
        />
      )}
      <Text className="mt-5 flex items-start justify-center gap-2 text-center text-micro text-muted">
        <Icon name="info" className="mt-0.5 size-3.5" />
        Ảnh catalogue mang tính tham khảo. Giá, phiên bản và tình trạng của từng xe được cập nhật
        riêng.
      </Text>
    </section>
  )
}
