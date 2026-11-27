import type { Metadata } from 'next'
import { AdminAIPanel } from '@/components/admin/ai-panel'

export const metadata: Metadata = {
  title: 'Quản trị Trợ lý AI (NORI AI) | NORI Admin',
  robots: { index: false, follow: false },
}

export default function AdminAIPage() {
  return <AdminAIPanel />
}
