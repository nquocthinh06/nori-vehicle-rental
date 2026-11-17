import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateSite } from '@/hooks/revalidate-nori'

const postAudit = auditCollection({
  entity: 'post',
  entityName: 'bài viết CMS',
  label: (doc) => String(doc.title ?? doc.slug ?? doc.id),
  statusField: '_status',
  statusLabels: { draft: 'Bản nháp', published: 'Đã xuất bản' },
  fields: { title: 'Tiêu đề', category: 'Chuyên mục', seoTitle: 'SEO Title' },
})

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Bài viết / Tin tức', plural: 'Tin tức & Bài viết CMS' },
  admin: {
    useAsTitle: 'title',
    group: 'NORI · Nội dung',
    defaultColumns: ['title', 'category', '_status', 'publishedAt'],
  },
  access: {
    create: isAdmin,
    read: ({ req }) =>
      req.user?.collection === 'admins' ? true : { _status: { equals: 'published' } },
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      async (args) => {
        await revalidateSite(args as never)
        return args.doc
      },
      postAudit.afterChange,
    ],
    afterDelete: [postAudit.afterDelete],
  },
  fields: [
    { name: 'title', label: 'Tiêu đề bài viết', type: 'text', required: true, maxLength: 200 },
    { name: 'slug', label: 'Đường dẫn (slug)', type: 'slug', useAsSlug: 'title' },
    {
      name: 'category',
      label: 'Chuyên mục',
      type: 'select',
      options: [
        { label: 'Tin tức NORI', value: 'NEWS' },
        { label: 'Cẩm nang thuê & mua xe', value: 'GUIDE' },
        { label: 'Ưu đãi & Sự kiện', value: 'PROMOTION' },
      ],
      defaultValue: 'NEWS',
      required: true,
    },
    { name: 'excerpt', label: 'Tóm tắt ngắn', type: 'textarea', maxLength: 500 },
    {
      name: 'content',
      label: 'Nội dung chi tiết',
      type: 'textarea',
      required: true,
      maxLength: 15000,
    },
    { name: 'cover', label: 'Ảnh bìa', type: 'upload', relationTo: 'media' },
    { name: 'publishedAt', label: 'Ngày xuất bản', type: 'text' },
    { name: 'seoTitle', label: 'SEO Meta Title', type: 'text', maxLength: 160 },
    { name: 'seoDescription', label: 'SEO Meta Description', type: 'textarea', maxLength: 320 },
  ],
  versions: {
    drafts: true,
    maxPerDoc: 10,
  },
}
