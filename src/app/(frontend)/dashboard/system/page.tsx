import type { Metadata } from 'next'
import { SystemPanel } from '@/components/admin/system-panel'

export const metadata: Metadata = {
  title: 'Đồng bộ & Sao lưu dữ liệu — Quản trị NORI',
}

export default function AdminSystemPage() {
  return <SystemPanel />
}
