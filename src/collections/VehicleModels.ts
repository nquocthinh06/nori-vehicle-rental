import type { CollectionConfig } from 'payload'
import { isAdmin } from '@/access/nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'

export const VehicleModels: CollectionConfig = {
  slug: 'vehicle-models',
  labels: { singular: 'Dòng xe catalogue', plural: 'Catalogue dòng xe' },
  admin: {
    useAsTitle: 'name',
    group: 'NORI · Phương tiện',
    defaultColumns: ['name', 'brand', 'category', 'visible'],
  },
  access: {
    create: isAdmin,
    read: ({ req }) => (req.user?.collection === 'admins' ? true : { visible: { equals: true } }),
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: { afterChange: [revalidateCatalogue], afterDelete: [revalidateDeletedCatalogue] },
  fields: [
    { name: 'name', label: 'Tên dòng xe', type: 'text', required: true, maxLength: 120 },
    { name: 'slug', type: 'slug', useAsSlug: 'name' },
    { name: 'brand', label: 'Thương hiệu', type: 'text', required: true, index: true },
    {
      name: 'category',
      label: 'Danh mục',
      type: 'select',
      options: [
        { label: 'Ô tô', value: 'CAR' },
        { label: 'Xe máy', value: 'MOTORBIKE' },
        { label: 'Bán tải', value: 'PICKUP' },
      ],
      required: true,
      index: true,
    },
    { name: 'bodyStyle', label: 'Kiểu dáng', type: 'text' },
    { name: 'description', label: 'Giới thiệu', type: 'textarea', maxLength: 2000 },
    { name: 'cover', label: 'Ảnh catalogue', type: 'upload', relationTo: 'media' },
    {
      name: 'gallery',
      label: 'Bộ ảnh có nguồn xác thực',
      type: 'array',
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        {
          name: 'kind',
          label: 'Loại ảnh',
          type: 'select',
          options: ['EXTERIOR', 'INTERIOR'],
          required: true,
        },
        { name: 'caption', label: 'Chú thích / nguồn', type: 'text' },
      ],
    },
    {
      name: 'specifications',
      label: 'Thông số đã xác thực',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'source', type: 'text', label: 'Nguồn / phiên bản áp dụng' },
      ],
    },
    {
      name: 'variants',
      label: 'Phiên bản có nguồn xác thực',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'colors',
          type: 'array',
          fields: [
            { name: 'name', type: 'text', required: true },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              label: 'Ảnh đúng phiên bản và màu',
            },
          ],
        },
      ],
    },
    { name: 'source', label: 'Nguồn catalogue', type: 'text' },
    {
      name: 'visible',
      label: 'Hiển thị công khai',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    { name: 'featured', label: 'Nổi bật', type: 'checkbox', defaultValue: false },
    { name: 'sortOrder', label: 'Thứ tự', type: 'number', defaultValue: 0 },
  ],
  versions: false,
}
