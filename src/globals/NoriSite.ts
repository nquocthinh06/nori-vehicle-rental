import type { GlobalConfig } from 'payload'
import { isAdmin } from '@/access/nori'
import { revalidateSite } from '@/hooks/revalidate-nori'

export const NoriSite: GlobalConfig = {
  slug: 'nori-site',
  label: 'NORI · Nội dung & liên hệ',
  access: { read: () => true, update: isAdmin },
  hooks: { afterChange: [revalidateSite] },
  fields: [
    {
      name: 'heroImages',
      label: 'Ảnh cảm hứng hành trình (không phải kho xe)',
      type: 'array',
      maxRows: 3,
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'credit', label: 'Tác giả / nguồn', type: 'text' },
      ],
    },
    { name: 'storyImage', label: 'Ảnh câu chuyện NORI', type: 'upload', relationTo: 'media' },
    { name: 'address', label: 'Địa chỉ nhận/trả xe đã xác nhận', type: 'textarea' },
    { name: 'phone', label: 'Hotline đã xác nhận', type: 'text' },
    { name: 'email', label: 'Email hỗ trợ đã xác nhận', type: 'email' },
    { name: 'openingHours', label: 'Giờ làm việc', type: 'text' },
  ],
  versions: false,
}
