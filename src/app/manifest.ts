import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NORI — Thuê xe linh hoạt. Mua xe tự tin.',
    short_name: 'NORI',
    description:
      'Thuê và tìm mua ô tô, xe máy, bán tải trực tuyến cùng NORI. Thông tin minh bạch, chủ động lịch trình.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#087568',
    lang: 'vi',
    categories: ['travel', 'shopping', 'business'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/nori-mark.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
