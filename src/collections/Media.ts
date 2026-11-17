import type { CollectionConfig } from 'payload'

import { createFolderField, createTagField } from 'payload'
import { revalidateMedia, revalidateDeletedMedia } from '@/hooks/revalidate-nori'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
    delete: ({ req }) => req.user?.collection === 'admins',
  },
  hooks: { afterChange: [revalidateMedia], afterDelete: [revalidateDeletedMedia] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    { name: 'sourceUrl', label: 'URL nguồn gốc', type: 'text' },
    { name: 'sourceName', label: 'Tác giả / Nguồn ảnh', type: 'text' },
    { name: 'license', label: 'Giấy phép / Quyền sử dụng', type: 'text' },
    { name: 'modelYear', label: 'Đời xe áp dụng', type: 'text' },
    { name: 'variantName', label: 'Phiên bản áp dụng', type: 'text' },
    { name: 'colorName', label: 'Màu sắc áp dụng', type: 'text' },
    {
      name: 'mediaCategory',
      label: 'Phân loại nguồn ảnh',
      type: 'select',
      options: ['CATALOGUE_OFFICIAL', 'CATALOGUE_REFERENCE', 'ACTUAL_VEHICLE', 'ILLUSTRATION'],
      defaultValue: 'CATALOGUE_REFERENCE',
    },
    {
      name: 'verified',
      label: 'Đã xác minh nguồn ảnh',
      type: 'checkbox',
      defaultValue: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      return headers
    },
  },
}
