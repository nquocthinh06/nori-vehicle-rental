import { APIError, type CollectionConfig } from 'payload'
import { adminHasPermission, adminPermission } from '@/access/nori'
import { auditCollection } from '@/hooks/audit-nori'
import { revalidateDeletedPost, revalidatePost } from '@/hooks/revalidate-nori'

const postAudit = auditCollection({
  entity: 'post',
  entityName: 'bài viết CMS',
  label: (doc) => String(doc.title ?? doc.slug ?? doc.id),
  statusField: '_status',
  statusLabels: { draft: 'Bản nháp', published: 'Đã xuất bản' },
  fields: {
    title: 'Tiêu đề',
    category: 'Chuyên mục',
    cover: 'Ảnh banner',
    promotion: 'Khuyến mãi liên kết',
    seoTitle: 'SEO Title',
  },
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
    create: adminPermission('posts', 'create'),
    read: ({ req }) =>
      adminHasPermission(req.user, 'posts', 'read') ? true : { _status: { equals: 'published' } },
    update: adminPermission('posts', 'update'),
    delete: adminPermission('posts', 'delete'),
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        if (!data || req.user?.collection !== 'admins' || req.context?.skipPermissionCheck) {
          return data
        }
        const isPublishing = data._status === 'published'
        const isUnpublishing =
          operation === 'update' && originalDoc?._status === 'published' && data._status === 'draft'
        if ((isPublishing || isUnpublishing) && !adminHasPermission(req.user, 'posts', 'publish')) {
          throw new APIError('Tài khoản chưa được cấp quyền Xuất bản bài viết.', 403)
        }
        return data
      },
    ],
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const nextCategory = data.category ?? originalDoc?.category
        if (nextCategory && nextCategory !== 'PROMOTION') {
          data.promotion = null
        }
        return data
      },
    ],
    afterChange: [revalidatePost, postAudit.afterChange],
    afterDelete: [revalidateDeletedPost, postAudit.afterDelete],
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
    { name: 'cover', label: 'Ảnh banner bài viết', type: 'upload', relationTo: 'media' },
    {
      name: 'promotion',
      label: 'Khuyến mãi liên kết',
      type: 'relationship',
      relationTo: 'promotions',
      admin: {
        condition: (data) => data?.category === 'PROMOTION',
      },
    },
    { name: 'publishedAt', label: 'Ngày xuất bản', type: 'text' },
    { name: 'seoTitle', label: 'SEO Meta Title', type: 'text', maxLength: 160 },
    { name: 'seoDescription', label: 'SEO Meta Description', type: 'textarea', maxLength: 320 },
  ],
  versions: {
    drafts: true,
    maxPerDoc: 10,
  },
}
