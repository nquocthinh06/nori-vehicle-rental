import type { CollectionConfig, Where } from 'payload'
import { isAdmin } from '@/access/nori'
import { revalidateCatalogue, revalidateDeletedCatalogue } from '@/hooks/revalidate-nori'

export const Vehicles: CollectionConfig = {
  slug: 'vehicles',
  labels: { singular: 'Xe thực tế', plural: 'Kho xe thực tế' },
  admin: {
    useAsTitle: 'reference',
    group: 'NORI · Phương tiện',
    defaultColumns: ['reference', 'model', 'intent', 'pricePerDay', 'status'],
  },
  access: {
    create: isAdmin,
    read: ({ req }): boolean | Where =>
      req.user?.collection === 'admins'
        ? true
        : { and: [{ status: { equals: 'ACTIVE' } }, { 'model.visible': { equals: true } }] },
    update: isAdmin,
    delete: () => false,
  },
  hooks: { afterChange: [revalidateCatalogue], afterDelete: [revalidateDeletedCatalogue] },
  fields: [
    { name: 'reference', label: 'Mã quản lý xe', type: 'text', required: true, unique: true },
    {
      name: 'model',
      label: 'Dòng xe',
      type: 'relationship',
      relationTo: 'vehicle-models',
      required: true,
    },
    {
      name: 'licensePlate',
      label: 'Biển số (nội bộ)',
      type: 'text',
      required: true,
      unique: true,
      access: { read: ({ req }) => req.user?.collection === 'admins' },
      hooks: {
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
        ],
      },
    },
    {
      name: 'intent',
      label: 'Dịch vụ',
      type: 'select',
      options: ['RENT', 'SALE', 'BOTH'],
      required: true,
      defaultValue: 'RENT',
    },
    {
      name: 'pricePerDay',
      label: 'Giá thuê VNĐ/ngày (đã xác nhận)',
      type: 'number',
      min: 1,
      max: 100_000_000,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'Giá phải là số nguyên VNĐ.',
    },
    {
      name: 'salePrice',
      label: 'Giá bán VNĐ (đã xác nhận)',
      type: 'number',
      min: 1,
      max: 100_000_000_000,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'Giá phải là số nguyên VNĐ.',
    },
    {
      name: 'odometer',
      label: 'ODO thực tế (km)',
      type: 'number',
      min: 0,
      validate: (value: unknown) =>
        value == null || Number.isSafeInteger(value) || 'ODO phải là số nguyên km.',
    },
    { name: 'condition', label: 'Tình trạng thực tế', type: 'textarea' },
    { name: 'inspectedAt', label: 'Ngày kiểm tra thực tế', type: 'date' },
    { name: 'version', label: 'Phiên bản thực tế', type: 'text' },
    { name: 'color', label: 'Màu thực tế', type: 'text' },
    {
      name: 'photos',
      label: 'Ảnh chính chiếc xe này (không dùng catalogue)',
      type: 'array',
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'caption', type: 'text' },
        {
          name: 'kind',
          type: 'select',
          options: ['EXTERIOR', 'INTERIOR'],
          defaultValue: 'EXTERIOR',
        },
      ],
    },
    {
      name: 'status',
      label: 'Trạng thái kinh doanh',
      type: 'select',
      options: ['ACTIVE', 'INACTIVE'],
      defaultValue: 'INACTIVE',
      required: true,
      index: true,
    },
  ],
  versions: false,
}
