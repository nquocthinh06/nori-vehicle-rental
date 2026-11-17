'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/client-api'
import { formatDate } from '@/lib/rental-rules'
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Input,
  Notice,
  Select,
  Skeleton,
  Text,
  Textarea,
} from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useToast } from './toast'

type PostRow = {
  id: string
  title: string
  slug: string
  category: string
  excerpt: string
  content: string
  seoTitle: string
  seoDescription: string
  _status: 'draft' | 'published'
  publishedAt: string
  updatedAt: string
}

const catLabels: Record<string, string> = {
  NEWS: 'Tin tức NORI',
  GUIDE: 'Cẩm nang thuê & mua xe',
  PROMOTION: 'Ưu đãi & Sự kiện',
}

export function PostsPanel() {
  const { toast } = useToast()
  const [items, setItems] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PostRow | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('NEWS')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    api<{ items: PostRow[] }>('/dashboard/posts')
      .then((res) => {
        if (active) setItems(res.items)
      })
      .catch((e) => {
        if (active) setError((e as Error).message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry])

  function openCreate() {
    setEditing(null)
    setTitle('')
    setCategory('NEWS')
    setExcerpt('')
    setContent('')
    setSeoTitle('')
    setSeoDescription('')
    setFormError('')
    setOpen(true)
  }

  function openEdit(p: PostRow) {
    setEditing(p)
    setTitle(p.title)
    setCategory(p.category)
    setExcerpt(p.excerpt)
    setContent(p.content)
    setSeoTitle(p.seoTitle)
    setSeoDescription(p.seoDescription)
    setFormError('')
    setOpen(true)
  }

  async function submitPost(targetStatus: 'draft' | 'published') {
    setBusy(true)
    setFormError('')
    try {
      await api('/dashboard/posts', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          title,
          category,
          excerpt,
          content,
          seoTitle,
          seoDescription,
          _status: targetStatus,
        }),
      })
      toast(targetStatus === 'published' ? 'Đã xuất bản bài viết.' : 'Đã lưu bản nháp bài viết.')
      setOpen(false)
      setRetry((r) => r + 1)
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deletePost(id: string) {
    try {
      await api(`/dashboard/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      toast('Đã xóa bài viết.')
      setRetry((r) => r + 1)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-card border border-line bg-canvas p-4">
        <Text className="text-small text-muted">
          Quản lý tin tức, cẩm nang sử dụng xe và ưu đãi với cơ chế Bản nháp / Xuất bản.
        </Text>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" className="size-4" />
          Viết bài mới
        </Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="file"
          title="Chưa có bài viết CMS nào"
          description="Tạo tin tức hoặc cẩm nang thuê/mua xe mới để xuất bản lên website NORI."
        >
          <Button onClick={openCreate}>Viết bài đầu tiên</Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas p-5"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading as="h2" size="body" className="font-semibold">
                    {p.title}
                  </Heading>
                  <Badge tone={p._status === 'published' ? 'brand' : 'warning'}>
                    {p._status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                  </Badge>
                  <Badge tone="muted">{catLabels[p.category] ?? p.category}</Badge>
                </div>
                <Text className="text-caption text-muted">
                  Cập nhật: {formatDate(p.updatedAt)}
                  {p.slug ? ` · /${p.slug}` : ''}
                </Text>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                  Chỉnh sửa
                </Button>
                <Button size="sm" variant="danger" onClick={() => void deletePost(p.id)}>
                  Xóa
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Chỉnh sửa bài viết CMS' : 'Soạn bài viết mới'}
        wide
      >
        <div className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input
                id="post-title"
                label="Tiêu đề bài viết"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Select
              id="post-cat"
              label="Chuyên mục"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(catLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            id="post-excerpt"
            label="Tóm tắt ngắn"
            rows={2}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
          <Textarea
            id="post-content"
            label="Nội dung chi tiết"
            rows={6}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="post-seo-title"
              label="SEO Meta Title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
            />
            <Input
              id="post-seo-desc"
              label="SEO Meta Description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void submitPost('draft')}>
              Lưu bản nháp
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submitPost('published')}>
              Xuất bản
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
