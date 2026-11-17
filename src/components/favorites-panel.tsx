'use client'

import { useMemo } from 'react'
import type { ModelView } from '@/lib/catalogue'
import { useFavorites } from './favorites-provider'
import { Button, ButtonLink, CardSkeleton, EmptyState, Heading, Text } from './ui'
import { Icon } from './ui/icon'
import { VehicleCard } from './vehicle-card'

export function FavoritesPanel({ models }: { models: ModelView[] }) {
  const { slugs, hydrated, clearFavorites } = useFavorites()

  const favoriteModels = useMemo(() => {
    const slugSet = new Set(slugs)
    return models.filter((model) => slugSet.has(model.slug))
  }, [models, slugs])

  if (!hydrated) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <CardSkeleton key={item} />
        ))}
      </div>
    )
  }

  if (favoriteModels.length === 0) {
    return (
      <EmptyState
        icon="heart"
        title="Chưa có phương tiện yêu thích"
        description="Nhấn biểu tượng trái tim trên các dòng xe bạn quan tâm để lưu lại và so sánh nhanh bất cứ lúc nào."
      >
        <ButtonLink href="/vehicles">
          Khám phá phương tiện <Icon name="arrow-right" className="size-4" />
        </ButtonLink>
      </EmptyState>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading as="h2" size="subtitle">
            Đã lưu {favoriteModels.length} dòng xe
          </Heading>
          <Text className="mt-1 text-small text-muted">
            Giá thuê, giá bán và số lượng xe sẵn sàng luôn được cập nhật trực tiếp từ hệ thống.
          </Text>
        </div>
        <Button variant="secondary" size="sm" onClick={clearFavorites}>
          <Icon name="trash" className="size-4" />
          Xóa tất cả
        </Button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {favoriteModels.map((model) => (
          <VehicleCard key={model.id} model={model} />
        ))}
      </div>
    </div>
  )
}
