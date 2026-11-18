'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PostView } from '@/lib/catalogue'
import { PostCard } from '@/components/post-card'
import { Button, ButtonLink, EmptyState, Input, Text } from '@/components/ui'

type FilterCategory = 'ALL' | PostView['category']

const FILTER_TABS: { value: FilterCategory; label: string }[] = [
  { value: 'ALL', label: 'Tất cả bài viết' },
  { value: 'NEWS', label: 'Tin tức NORI' },
  { value: 'GUIDE', label: 'Cẩm nang thuê & mua xe' },
  { value: 'PROMOTION', label: 'Ưu đãi & Sự kiện' },
]

export function PostsDirectory({ posts }: { posts: PostView[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawCategory = searchParams.get('category')
  const initialCategory: FilterCategory =
    rawCategory === 'NEWS' || rawCategory === 'GUIDE' || rawCategory === 'PROMOTION'
      ? rawCategory
      : 'ALL'

  const [category, setCategory] = useState<FilterCategory>(initialCategory)
  const [query, setQuery] = useState('')

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter((post) => {
      if (category !== 'ALL' && post.category !== category) return false
      if (!q) return true
      return `${post.title} ${post.excerpt ?? ''} ${post.promotion?.code ?? ''}`
        .toLowerCase()
        .includes(q)
    })
  }, [posts, category, query])

  function selectCategory(next: FilterCategory) {
    setCategory(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'ALL') params.delete('category')
    else params.set('category', next)
    const target = params.size ? `/posts?${params}` : '/posts'
    router.replace(target, { scroll: false })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-canvas p-4 md:flex-row md:items-end md:justify-between">
        <div
          role="tablist"
          aria-label="Lọc bài viết theo chuyên mục"
          className="flex flex-wrap gap-2"
        >
          {FILTER_TABS.map((tab) => {
            const active = category === tab.value
            return (
              <Button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                size="sm"
                variant={active ? 'primary' : 'secondary'}
                onClick={() => selectCategory(tab.value)}
              >
                {tab.label}
              </Button>
            )
          })}
        </div>

        <Input
          id="posts-search"
          label="Tìm kiếm bài viết"
          placeholder="Nhập từ khóa hoặc mã ưu đãi..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="w-full md:w-72"
        />
      </div>

      {filteredPosts.length === 0 ? (
        <EmptyState
          icon="file"
          title="Chưa có bài viết phù hợp"
          description="Hiện chưa có bài viết nào trong chuyên mục hoặc từ khóa bạn tìm kiếm."
        >
          {category !== 'ALL' || query.trim() ? (
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('')
                selectCategory('ALL')
              }}
            >
              Xem tất cả bài viết
            </Button>
          ) : (
            <ButtonLink href="/vehicles" variant="primary">
              Khám phá phương tiện
            </ButtonLink>
          )}
        </EmptyState>
      ) : (
        <>
          <Text className="text-small text-muted">
            Hiển thị <strong className="text-ink">{filteredPosts.length}</strong> bài viết đã xuất
            bản
          </Text>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
